// REQ-SES-021 — an admin renames a session, until it is published (DEC-254 §5, DEC-255 §1, STORY-SES-014). Wave 27.
//
// The write is `0010`'s column grant with `sessions_update_admin` (and `sessions_update_presenter`, D5). `0200` adds
// the two things the rename needs: `session.renamed` in the audit log with both titles, and the owner's lock —
// `session_title_locked` (55000) from `published` on, for an admin and a presenter alike.
//
// 03 §8.2 rows: TRG-sessions.renamed_audited, TRG-sessions.title_locked_from_published
//
// ★ BEFORE PUBLICATION NOTHING ELSE MOVES (the plan's W27.11): no notice, no calendar sync, no poster render; the
// proposal the session came from keeps its own title; a notice already sent keeps the title it was sent with.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, errorMessage, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Org } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const LOCKED = "55000";
const BEFORE = ["draft", "submitted", "in_review", "changes_requested", "approved"] as const;
const FROM_PUBLISHED = ["published", "in_progress", "completed", "archived", "cancelled"] as const;
const SCHEDULED = new Set(["published", "in_progress", "completed", "archived"]);

/** A session in `state`, as the owner — with a proposal behind it or not. Scheduled states carry what `0010` requires. */
async function sessionIn(tx: Tx, o: Org, state: string, proposalId: string | null = null) {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, proposal_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at, completed_at, cancellation_reason)
     values ($1, $2, 'الاسم الأول', 'ملخص', $3, 'introductory', now() + interval '3 days', 60, now() + interval '3 days 1 hour',
             $4, 30, $5::public.session_state,
             case when $6 then now() - interval '1 day' end,
             case when $5 in ('completed', 'archived') then now() - interval '1 hour' end,
             case when $5 = 'cancelled' then 'سبب' end)
     returning id`,
    [o.id, proposalId, o.categoryId, o.venueId, state, SCHEDULED.has(state)],
  );
  return row.id;
}

async function proposalOf(tx: Tx, o: Org) {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state)
     values ($1, $2, 'عنوان المقترح', 'فكرة', $3, 'intermediate', 'approved') returning id`,
    [o.id, o.members[0].memberId, o.categoryId],
  );
  return row.id;
}

const rename = (tx: Tx, id: string, title: string) =>
  tx.q<{ id: string; title: string }>(`update public.sessions set title = $2 where id = $1 returning id, title`, [id, title]);

async function titleOf(tx: Tx, id: string) {
  await tx.asOwner();
  return (await tx.q<{ title: string }>(`select title from public.sessions where id = $1`, [id]))[0].title;
}

async function renamedRows(tx: Tx, id: string) {
  await tx.asOwner();
  return tx.q<{ actor_id: string | null; actor_role: string; before: { title: string }; after: { title: string } }>(
    `select actor_id, actor_role, before, after from public.audit_log where subject_id = $1 and action = 'session.renamed'`,
    [id],
  );
}

describe("TRG-sessions.renamed_audited — every state before `published`, with a proposal and without", () => {
  for (const state of BEFORE) {
    for (const born of ["direct", "proposal"] as const) {
      it(`${state}, ${born}: renamed, and audited with both titles and the admin`, async () => {
        await withTx(async (tx) => {
          const f = await seed(tx);
          const id = await sessionIn(tx, f.a, state, born === "proposal" ? await proposalOf(tx, f.a) : null);
          await tx.as(f.a.admin.claims);
          expect(await rename(tx, id, "الاسم الجديد")).toEqual([{ id, title: "الاسم الجديد" }]);
          expect(await titleOf(tx, id)).toBe("الاسم الجديد");
          const rows = await renamedRows(tx, id);
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({ actor_id: f.a.admin.memberId, actor_role: "admin", before: { title: "الاسم الأول" }, after: { title: "الاسم الجديد" } });
        });
      });
    }
  }

  it("a save that leaves the title as it was writes no audit row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = await sessionIn(tx, f.a, "draft");
      await tx.as(f.a.admin.claims);
      expect(await rename(tx, id, "الاسم الأول")).toHaveLength(1);
      expect(await renamedRows(tx, id)).toEqual([]);
    });
  });
});

describe("TRG-sessions.title_locked_from_published — refused by the database, from `published` on", () => {
  for (const state of FROM_PUBLISHED) {
    it(`${state}: an admin is refused with session_title_locked; the title and the log unchanged`, async () => {
      await withTx(async (tx) => {
        const f = await seed(tx);
        const id = await sessionIn(tx, f.a, state);
        await tx.as(f.a.admin.claims);
        expect(await errorCode(() => rename(tx, id, "الاسم الجديد"))).toBe(LOCKED);
        expect(await errorMessage(() => rename(tx, id, "الاسم الجديد"))).toMatch(/session_title_locked/);
        expect(await titleOf(tx, id)).toBe("الاسم الأول");
        expect(await renamedRows(tx, id)).toEqual([]);
      });
    });
  }

  it("cancelled from `approved` — never published — is locked too", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = await sessionIn(tx, f.a, "approved");
      await tx.asOwner();
      await tx.q(`update public.sessions set state = 'cancelled', cancellation_reason = 'سبب' where id = $1`, [id]);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => rename(tx, id, "الاسم الجديد"))).toBe(LOCKED);
      expect(await titleOf(tx, id)).toBe("الاسم الأول");
    });
  });

  it("its presenter is refused at `published` (D5: the state 0010's policy allowed until now)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => rename(tx, f.m2.a.published, "اسم المقدّم"))).toBe(LOCKED);
      expect(await renamedRows(tx, f.m2.a.published)).toEqual([]);
    });
  });
});

describe("who may rename (REQ-SES-021, D5)", () => {
  it("a moderator, a member who does not present it and another org's admin change nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const before = await titleOf(tx, f.m2.a.draft);
      for (const who of [f.a.mod.claims, f.a.members[1].claims, f.b.admin.claims]) {
        await tx.as(who);
        expect(await rename(tx, f.m2.a.draft, "اسم لا يُحفظ")).toEqual([]);
      }
      expect(await titleOf(tx, f.m2.a.draft)).toBe(before);
      expect(await renamedRows(tx, f.m2.a.draft)).toEqual([]);
    });
  });

  it("its presenter may retitle a draft, and that is audited with the presenter as the actor", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      expect(await rename(tx, f.m2.a.draft, "عنوان المقدّم")).toHaveLength(1);
      const rows = await renamedRows(tx, f.m2.a.draft);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actor_id: f.a.members[0].memberId, actor_role: "member", after: { title: "عنوان المقدّم" } });
    });
  });
});

describe("before publication nothing else moves (W27.11)", () => {
  it("no notice, no calendar sync and no poster render; the proposal keeps its own title", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const proposal = await proposalOf(tx, f.a);
      const id = await sessionIn(tx, f.a, "approved", proposal);
      const count = async () => {
        await tx.asOwner();
        const [n] = await tx.q<{ notices: number; jobs: number }>(
          `select (select count(*)::int from public.notifications where payload ->> 'session_id' = $1) as notices,
                  (select count(*)::int from graphile_worker.jobs
                    where key = 'poster:' || $1 or task_identifier in ('calendar_upsert', 'regenerate_poster', 'send_notification')) as jobs`,
          [id],
        );
        return n;
      };
      const was = await count();
      await tx.as(f.a.admin.claims);
      await rename(tx, id, "الاسم الجديد");
      expect(await count()).toEqual(was);
      await tx.asOwner();
      expect((await tx.q<{ title: string }>(`select title from public.proposals where id = $1`, [proposal]))[0].title).toBe("عنوان المقترح");
    });
  });

  it("a notice already sent keeps the title it was sent with", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = await sessionIn(tx, f.a, "draft");
      await tx.asOwner();
      // `session_presenters_notify` (0039) copies the title into `MSG-presenter_assigned`'s payload at the insert.
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, id, f.a.members[1].memberId]);
      await tx.as(f.a.admin.claims);
      await rename(tx, id, "الاسم الجديد");
      await tx.asOwner();
      const payloads = await tx.q<{ title: string }>(
        `select payload ->> 'title' as title from public.notifications where key = 'MSG-presenter_assigned' and payload ->> 'session_id' = $1`,
        [id],
      );
      expect(payloads).toEqual([{ title: "الاسم الأول" }]);
    });
  });
});
