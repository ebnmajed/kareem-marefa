// STORY-PRO-004 — an admin creates a session, from an approved proposal or
// from nothing (REQ-PRO-007), and an assigned presenter may decline.
//
// 03 §8.2 rows: POL-sessions.insert.rpc,
//               RPC-create_session.admin_only,
//               RPC-create_session.one_per_proposal,
//               POL-session_presenters.decline
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const PROPOSED = "sessions/0004_session_creation.sql";
const CHECK_VIOLATION = "23514";

const createSession = async (tx: Tx, args: { title?: string; category?: string; presenters?: string[]; proposal?: string }) =>
  (
    await tx.q<{ create_session: string }>(
      `select public.create_session($1, $2, $3, 'introductory', 'ar', $4::uuid[], $5) as create_session`,
      [args.title ?? null, args.title ? "ملخص الجلسة" : null, args.category ?? null, args.presenters ?? [], args.proposal ?? null],
    )
  )[0].create_session;

/** An approved proposal of org A with one accepted co-presenter. */
async function approved(tx: Tx, f: Awaited<ReturnType<typeof seed>>, title = "مقترح معتمد") {
  await tx.asOwner();
  const [{ id }] = await tx.q<{ id: string }>(
    `insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level, state)
     values ($1, $2, $3, 'ملخص المقترح', $4, 'intermediate', 'submitted') returning id`,
    [f.a.id, f.a.members[0].memberId, title, f.a.categoryId],
  );
  await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, id, f.a.members[0].memberId]);
  await tx.q(`insert into public.proposal_presenters (org_id, proposal_id, member_id, accepted) values ($1, $2, $3, false)`, [f.a.id, id, f.a.members[1].memberId]);
  await tx.q(`update public.proposals set state = 'in_review' where id = $1`, [id]);
  await tx.q(`update public.proposals set state = 'approved' where id = $1`, [id]);
  return id;
}

describe("POL-sessions.insert.rpc", () => {
  it("even an admin cannot insert a session directly — there is no policy and no grant", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.sessions (org_id, title, abstract, category_id, level) values ($1, 'جلسة', 'ملخص', $2, 'introductory')`, [f.a.id, f.a.categoryId]),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("RPC-create_session.admin_only", () => {
  it("refuses a member, a moderator and a stale admin", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      for (const who of [f.a.members[0].claims, f.a.mod.claims]) {
        await tx.as(who);
        expect(await errorMessage(() => createSession(tx, { title: "جلسة", category: f.a.categoryId }))).toMatch(/not_an_admin/);
      }
      await tx.as({ ...f.a.admin.claims, claims_version: (f.a.admin.claims.claims_version ?? 0) + 3 });
      expect(await errorCode(() => createSession(tx, { title: "جلسة", category: f.a.categoryId }))).toBe(PERMISSION_DENIED);
    });
  });

  it("creates into the actor's own org, and cannot reach another org's proposal", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const proposal = await approved(tx, f);

      await tx.as(f.b.admin.claims);
      expect(await errorMessage(() => createSession(tx, { proposal }))).toMatch(/proposal_not_found/);
      const id = await createSession(tx, { title: "جلسة المؤسسة الأخرى", category: f.b.categoryId });
      await tx.asOwner();
      expect((await tx.q<{ org_id: string }>(`select org_id from public.sessions where id = $1`, [id]))[0].org_id).toBe(f.b.id);
    });
  });

  it("refuses a session with no title, abstract or category", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => createSession(tx, {}))).toMatch(/session_needs_title_abstract_category/);
    });
  });
});

describe("RPC-create_session.one_per_proposal", () => {
  it("carries the approved proposal's fields and its accepted presenters, and only those", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const proposal = await approved(tx, f);

      await tx.as(f.a.admin.claims);
      const id = await createSession(tx, { proposal });

      await tx.asOwner();
      const [s] = await tx.q<{ title: string; level: string; state: string; starts_at: string | null; venue_id: string | null; capacity: number | null }>(
        `select title, level, state, starts_at, venue_id, capacity from public.sessions where id = $1`,
        [id],
      );
      expect(s.title).toBe("مقترح معتمد");
      expect(s.level).toBe("intermediate");
      expect(s.state).toBe("draft");
      // ★ D13/D14: creating a session schedules nothing. That is REQ-SES-001.
      expect([s.starts_at, s.venue_id, s.capacity]).toEqual([null, null, null]);

      // Only the presenter who accepted the proposal comes across.
      const presenters = await tx.q<{ member_id: string; accepted: boolean }>(`select member_id, accepted from public.session_presenters where session_id = $1`, [id]);
      expect(presenters).toEqual([{ member_id: f.a.members[0].memberId, accepted: true }]);

      // REQ-SES-003: being born is a transition.
      const [tr] = await tx.q<{ from_state: string | null; to_state: string; is_manual: boolean }>(
        `select from_state, to_state, is_manual from public.session_state_transitions where session_id = $1`,
        [id],
      );
      expect(tr).toEqual({ from_state: null, to_state: "draft", is_manual: true });
    });
  });

  it("turns an approved proposal into one session and no more", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const proposal = await approved(tx, f);
      await tx.as(f.a.admin.claims);
      await createSession(tx, { proposal });
      expect(await errorCode(() => createSession(tx, { proposal }))).toBe("23505");
    });
  });

  it("will not schedule a proposal the admin has not approved", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.admin.claims);
      // The fixture's proposal is a draft.
      expect(await errorMessage(() => createSession(tx, { proposal: f.m2.a.proposal }))).toMatch(/proposal_not_approved/);
    });
  });

  it("records which path it came by, and only in the audit log (REQ-PRO-007)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const proposal = await approved(tx, f);

      await tx.as(f.a.admin.claims);
      const fromProposal = await createSession(tx, { proposal });
      const direct = await createSession(tx, { title: "جلسة أنشأها المشرف", category: f.a.categoryId, presenters: [f.a.members[1].memberId] });

      const actions = await tx.q<{ subject_id: string; action: string }>(
        `select subject_id, action from public.audit_log where subject_type = 'session' and subject_id = any($1::uuid[])`,
        [[fromProposal, direct]],
      );
      expect(new Map(actions.map((a) => [a.subject_id, a.action]))).toEqual(
        new Map([
          [fromProposal, "session.created_from_proposal"],
          [direct, "session.created_direct"],
        ]),
      );

      // Indistinguishable downstream: the rows differ only by proposal_id.
      await tx.asOwner();
      const rows = await tx.q<{ state: string }>(`select state from public.sessions where id = any($1::uuid[])`, [[fromProposal, direct]]);
      expect(rows.map((r) => r.state)).toEqual(["draft", "draft"]);
    });
  });

  it("an assigned presenter is not accepted on their behalf", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.admin.claims);
      const id = await createSession(tx, { title: "جلسة مُسندة", category: f.a.categoryId, presenters: [f.a.members[1].memberId] });
      await tx.asOwner();
      expect((await tx.q<{ accepted: boolean }>(`select accepted from public.session_presenters where session_id = $1`, [id]))[0].accepted).toBe(false);
    });
  });
});

describe("POL-session_presenters.decline", () => {
  it("a decline before publication sends the session back to draft, with a transition row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.admin.claims);
      const id = await createSession(tx, { title: "جلسة سيعتذر عنها المُقدِّم", category: f.a.categoryId, presenters: [f.a.members[1].memberId] });
      await tx.asOwner();
      await tx.q(`update public.sessions set state = 'approved' where id = $1`, [id]);

      // The presenter has no grant on sessions.state — the consequence is the
      // trigger's, not theirs.
      await tx.as(f.a.members[1].claims);
      await tx.q(`update public.session_presenters set declined_at = now() where session_id = $1 and member_id = $2`, [id, f.a.members[1].memberId]);

      await tx.asOwner();
      expect((await tx.q<{ state: string }>(`select state from public.sessions where id = $1`, [id]))[0].state).toBe("draft");
      const tr = await tx.q<{ from_state: string; to_state: string; reason: string }>(
        `select from_state, to_state, reason from public.session_state_transitions where session_id = $1 order by occurred_at, ctid`,
        [id],
      );
      expect(tr.at(-1)).toEqual({ from_state: "approved", to_state: "draft", reason: "presenter_declined" });
    });
  });

  it("a decline on a PUBLISHED session leaves it published — people have seats", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const published = f.m2.a.published;
      await tx.asOwner();
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id) values ($1, $2, $3)`, [f.a.id, published, f.a.members[1].memberId]);

      await tx.as(f.a.members[1].claims);
      await tx.q(`update public.session_presenters set declined_at = now() where session_id = $1 and member_id = $2`, [published, f.a.members[1].memberId]);

      await tx.asOwner();
      expect((await tx.q<{ state: string }>(`select state from public.sessions where id = $1`, [published]))[0].state).toBe("published");
    });
  });
});
