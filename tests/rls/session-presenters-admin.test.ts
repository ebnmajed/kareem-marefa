// REQ-SES-019 — an admin changes a session's presenters after it is created
// (DEC-172, sync 1's rulings DEC-174). Applied with applyProposed() inside
// each rolled-back transaction (DEC-040); a promoted file is a no-op there.
//
// 03 §8.2 rows: RPC-add_session_presenter.admin_only,
//               RPC-add_session_presenter.assigned,
//               RPC-add_session_presenter.refusals,
//               RPC-remove_session_presenter.delete_not_decline,
//               RPC-remove_session_presenter.last,
//               RPC-session_presenters.no_ledger
//
// Fixture (fixture-m2): per org, a draft, a published and a completed session,
// each presented by members[0]; members[1] holds a check-in on the published
// and the completed one.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const PROPOSED = "sessions/0001_session_presenters_admin.sql";
const CHECK_VIOLATION = "23514";

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, PROPOSED);
  return f;
}

const add = (tx: Tx, session: string, member: string) => tx.q(`select public.add_session_presenter($1, $2)`, [session, member]);
const remove = (tx: Tx, session: string, member: string) => tx.q(`select public.remove_session_presenter($1, $2)`, [session, member]);

/** Read as the owner, then hand back to nobody in particular — callers re-assume. */
async function presenters(tx: Tx, session: string) {
  await tx.asOwner();
  return tx.q<{ member_id: string; accepted: boolean; declined_at: string | null }>(
    `select member_id, accepted, declined_at from public.session_presenters where session_id = $1 order by member_id`,
    [session],
  );
}

async function audit(tx: Tx, session: string) {
  await tx.asOwner();
  return tx.q<{ action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }>(
    `select action, before, after from public.audit_log
      where subject_id = $1 and action like 'session.presenter_%' order by occurred_at, ctid`,
    [session],
  );
}

/** The fixture's own presenter rows notified too, so a notice is counted per session. */
async function assignedNotices(tx: Tx, member: string, session: string) {
  await tx.asOwner();
  return tx.q<{ payload: Record<string, unknown> }>(
    `select payload from public.notifications
      where key = 'MSG-presenter_assigned' and member_id = $1 and payload ->> 'session_id' = $2`,
    [member, session],
  );
}

describe("RPC-add_session_presenter.admin_only", () => {
  it("refuses a member, a moderator and a stale admin", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      for (const who of [f.a.members[0].claims, f.a.mod.claims]) {
        await tx.as(who);
        expect(await errorMessage(() => add(tx, f.m2.a.draft, f.a.members[1].memberId))).toMatch(/not_an_admin/);
        expect(await errorMessage(() => remove(tx, f.m2.a.draft, f.a.members[0].memberId))).toMatch(/not_an_admin/);
      }
      await tx.as({ ...f.a.admin.claims, claims_version: (f.a.admin.claims.claims_version ?? 0) + 3 });
      expect(await errorCode(() => add(tx, f.m2.a.draft, f.a.members[1].memberId))).toBe(PERMISSION_DENIED);
      expect(await presenters(tx, f.m2.a.draft)).toHaveLength(1);
    });
  });

  it("an admin of another org cannot reach the session, to add or to remove", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.b.admin.claims);
      expect(await errorMessage(() => add(tx, f.m2.a.draft, f.b.members[0].memberId))).toMatch(/session_not_found/);
      expect(await errorCode(() => add(tx, f.m2.a.draft, f.b.members[0].memberId))).toBe(PERMISSION_DENIED);
      expect(await errorMessage(() => remove(tx, f.m2.a.draft, f.a.members[0].memberId))).toMatch(/session_not_found/);
      expect(await presenters(tx, f.m2.a.draft)).toEqual([expect.objectContaining({ member_id: f.a.members[0].memberId })]);
    });
  });

  it("no client role reaches the helper that locks the session", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public._session_for_presenter_change($1, $2)`, [f.m2.a.draft, f.a.id]))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("RPC-add_session_presenter.assigned", () => {
  it("an added member is an ACCEPTED presenter, told once, and audited by name", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const yaman = f.a.members[1].memberId;
      await tx.as(f.a.admin.claims);
      await add(tx, f.m2.a.draft, yaman);

      expect(await presenters(tx, f.m2.a.draft)).toContainEqual({ member_id: yaman, accepted: true, declined_at: null });
      const notices = await assignedNotices(tx, yaman, f.m2.a.draft);
      expect(notices).toHaveLength(1);
      expect(notices[0].payload).toMatchObject({ session_id: f.m2.a.draft });
      expect(await audit(tx, f.m2.a.draft)).toEqual([{ action: "session.presenter_added", before: null, after: { member_id: yaman, accepted: true } }]);
    });
  });

  it("a pending or declined row is PROMOTED to accepted, without a second notice (DEC-174 Q2)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const yaman = f.a.members[1].memberId;
      const mod = f.a.mod.memberId;
      await tx.asOwner();
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, false)`, [f.a.id, f.m2.a.draft, yaman]);
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted, declined_at) values ($1, $2, $3, false, now())`, [f.a.id, f.m2.a.draft, mod]);
      const noticesBefore = (await assignedNotices(tx, yaman, f.m2.a.draft)).length;

      await tx.as(f.a.admin.claims);
      await add(tx, f.m2.a.draft, yaman);
      await tx.as(f.a.admin.claims);
      await add(tx, f.m2.a.draft, mod);

      const rows = await presenters(tx, f.m2.a.draft);
      expect(rows).toContainEqual({ member_id: yaman, accepted: true, declined_at: null });
      expect(rows).toContainEqual({ member_id: mod, accepted: true, declined_at: null });
      expect(await assignedNotices(tx, yaman, f.m2.a.draft)).toHaveLength(noticesBefore);
      const log = await audit(tx, f.m2.a.draft);
      expect(log.map((r) => r.action)).toEqual(["session.presenter_added", "session.presenter_added"]);
      expect(log[0].before).toMatchObject({ member_id: yaman, accepted: false, declined_at: null });
    });
  });

  it("works on a published and on a completed session — «at any time»", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await add(tx, f.m2.a.published, f.a.mod.memberId);
      await tx.as(f.a.admin.claims);
      await add(tx, f.m2.a.completed, f.a.mod.memberId);
      expect(await presenters(tx, f.m2.a.published)).toContainEqual({ member_id: f.a.mod.memberId, accepted: true, declined_at: null });
      expect(await presenters(tx, f.m2.a.completed)).toContainEqual({ member_id: f.a.mod.memberId, accepted: true, declined_at: null });
    });
  });
});

describe("RPC-add_session_presenter.refusals", () => {
  /** Asserts one refusal left nothing behind: no new row, no notice, no audit. */
  async function refusedCleanly(tx: Tx, session: string, member: string, before: number) {
    expect(await presenters(tx, session)).toHaveLength(before);
    expect(await audit(tx, session)).toEqual([]);
    expect(await assignedNotices(tx, member, session)).toEqual([]);
  }

  it("a member of another org", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => add(tx, f.m2.a.draft, f.b.members[0].memberId))).toMatch(/member_not_found/);
      await refusedCleanly(tx, f.m2.a.draft, f.b.members[0].memberId, 1);
    });
  });

  it("a deactivated member", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const yaman = f.a.members[1].memberId;
      await tx.asOwner();
      await tx.q(`update public.members set status = 'deactivated', deactivated_at = now(), deactivated_reason = 'غادر' where id = $1`, [yaman]);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => add(tx, f.m2.a.draft, yaman))).toMatch(/member_not_active/);
      await refusedCleanly(tx, f.m2.a.draft, yaman, 1);
    });
  });

  it("someone who is already an accepted presenter", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => add(tx, f.m2.a.draft, f.a.members[0].memberId))).toMatch(/already_presenter/);
      expect(await presenters(tx, f.m2.a.draft)).toHaveLength(1);
      expect(await audit(tx, f.m2.a.draft)).toEqual([]);
    });
  });

  it("a member with an active check-in — their attendance goes first (DEC-174 Q4)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const yaman = f.a.members[1].memberId;
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => add(tx, f.m2.a.published, yaman))).toMatch(/member_checked_in/);
      expect(await errorCode(() => add(tx, f.m2.a.completed, yaman))).toBe(CHECK_VIOLATION);
      await refusedCleanly(tx, f.m2.a.published, yaman, 1);

      // A REMOVED check-in is no longer attendance, so the add goes through.
      await tx.q(`update public.check_ins set removed_at = now() where session_id = $1 and member_id = $2`, [f.m2.a.completed, yaman]);
      await tx.as(f.a.admin.claims);
      await add(tx, f.m2.a.completed, yaman);
      expect(await presenters(tx, f.m2.a.completed)).toContainEqual({ member_id: yaman, accepted: true, declined_at: null });
    });
  });

  it("a cancelled session, to add or to remove (DEC-174 Q3)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`update public.sessions set state = 'cancelled', cancellation_reason = 'تعذّر الموعد' where id = $1`, [f.m2.a.published]);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => add(tx, f.m2.a.published, f.a.mod.memberId))).toMatch(/session_cancelled/);
      expect(await errorMessage(() => remove(tx, f.m2.a.published, f.a.members[0].memberId))).toMatch(/session_cancelled/);
      await refusedCleanly(tx, f.m2.a.published, f.a.mod.memberId, 1);
    });
  });

  it("beyond the org's presenter limit — the limit trigger refuses, and the notice goes with the row", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`update public.org_settings set max_co_presenters = 0 where org_id = $1`, [f.a.id]);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => add(tx, f.m2.a.draft, f.a.mod.memberId))).toMatch(/too_many_presenters/);
      await refusedCleanly(tx, f.m2.a.draft, f.a.mod.memberId, 1);
    });
  });
});

describe("RPC-remove_session_presenter.delete_not_decline", () => {
  it("deletes the row; a published session keeps its state and gains no transition", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sara = f.a.members[0].memberId;
      await tx.as(f.a.admin.claims);
      await add(tx, f.m2.a.published, f.a.mod.memberId);
      await tx.asOwner();
      const transitions = async () =>
        (await tx.q<{ n: string }>(`select count(*) as n from public.session_state_transitions where session_id = $1`, [f.m2.a.published]))[0].n;
      const before = await transitions();

      await tx.as(f.a.admin.claims);
      await remove(tx, f.m2.a.published, sara);

      expect(await presenters(tx, f.m2.a.published)).toEqual([{ member_id: f.a.mod.memberId, accepted: true, declined_at: null }]);
      expect((await tx.q<{ state: string }>(`select state from public.sessions where id = $1`, [f.m2.a.published]))[0].state).toBe("published");
      expect(await transitions()).toBe(before);
      expect((await audit(tx, f.m2.a.published)).at(-1)).toEqual({
        action: "session.presenter_removed",
        before: { member_id: sara, accepted: true, declined_at: null },
        after: null,
      });
    });
  });

  it("a draft session is not sent anywhere either — removal is never a decline", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      for (const to of ["submitted", "in_review", "approved"]) {
        await tx.q(`update public.sessions set state = $2::public.session_state where id = $1`, [f.m2.a.draft, to]);
      }
      await tx.as(f.a.admin.claims);
      await add(tx, f.m2.a.draft, f.a.mod.memberId);
      await tx.as(f.a.admin.claims);
      await remove(tx, f.m2.a.draft, f.a.members[0].memberId);
      await tx.asOwner();
      expect((await tx.q<{ state: string }>(`select state from public.sessions where id = $1`, [f.m2.a.draft]))[0].state).toBe("approved");
    });
  });

  it("someone who is not a presenter is refused as not found", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => remove(tx, f.m2.a.draft, f.a.mod.memberId))).toMatch(/presenter_not_found/);
      expect(await audit(tx, f.m2.a.draft)).toEqual([]);
    });
  });
});

describe("RPC-remove_session_presenter.last", () => {
  it("the only accepted presenter stays; a pending or declined row can always go", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sara = f.a.members[0].memberId;
      await tx.asOwner();
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, false)`, [f.a.id, f.m2.a.draft, f.a.members[1].memberId]);

      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => remove(tx, f.m2.a.draft, sara))).toMatch(/last_presenter/);
      expect(await errorCode(() => remove(tx, f.m2.a.draft, sara))).toBe(CHECK_VIOLATION);
      expect(await presenters(tx, f.m2.a.draft)).toHaveLength(2);
      expect(await audit(tx, f.m2.a.draft)).toEqual([]);

      // The pending row is on no surface — removing it is never «the last».
      await tx.as(f.a.admin.claims);
      await remove(tx, f.m2.a.draft, f.a.members[1].memberId);
      expect(await presenters(tx, f.m2.a.draft)).toEqual([{ member_id: sara, accepted: true, declined_at: null }]);
    });
  });
});

describe("RPC-session_presenters.no_ledger", () => {
  it("neither function names the ledger, an award or a job (contract 2)", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      const rows = await tx.q<{ proname: string; src: string }>(
        `select proname, prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and proname in ('add_session_presenter', 'remove_session_presenter', '_session_for_presenter_change')`,
      );
      expect(rows.map((r) => r.proname).sort()).toEqual(["_session_for_presenter_change", "add_session_presenter", "remove_session_presenter"]);
      for (const r of rows) expect(r.src, r.proname).not.toMatch(/points_ledger|award|enqueue_job/i);
    });
  });

  it("an add and a remove on a completed session write no ledger row themselves", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const count = async () => (await tx.q<{ n: string }>(`select count(*) as n from public.points_ledger where session_id = $1`, [f.m2.a.completed]))[0].n;
      const before = await count();
      await tx.as(f.a.admin.claims);
      await add(tx, f.m2.a.completed, f.a.mod.memberId);
      await tx.as(f.a.admin.claims);
      await remove(tx, f.m2.a.completed, f.a.mod.memberId);
      await tx.asOwner();
      expect(await count()).toBe(before);
    });
  });
});
