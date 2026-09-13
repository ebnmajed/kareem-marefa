// STORY-SES-002 — the session state machine and its audit trail
// (REQ-SES-003, REQ-SES-005, REQ-SES-010, REQ-SES-012).
//
// 03 §8.2 rows: RPC-transition_session.admin_only,
//               RPC-transition_session.edges,
//               RPC-transition_session.cancel,
//               RPC-transition_session.closes_check_in
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, errorMessage, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const CHECK_VIOLATION = "23514";

const act = (tx: Tx, id: string, action: string, reason: string | null = null) =>
  tx.q<{ state: string; cancellation_reason: string | null; completed_at: string | null }>(
    `select state, cancellation_reason, completed_at from public.transition_session($1, $2, $3)`,
    [id, action, reason],
  );

/** Sets a session's state directly, as the owner, to arrange a scenario. */
const put = (tx: Tx, id: string, state: string, extra = "") =>
  tx.q(`update public.sessions set state = $2::public.session_state ${extra} where id = $1`, [id, state]);

describe("RPC-transition_session.admin_only", () => {
  it("refuses a member, a presenter, a moderator, a stale admin and another org's admin", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = f.m2.a.published;

      // members[0] is a presenter of this session — the closest thing to an
      // owner there is, and still not an admin (REQ-SES-005 says مشرف).
      for (const who of [f.a.members[0].claims, f.a.members[1].claims, f.a.mod.claims]) {
        await tx.as(who);
        expect(await errorMessage(() => act(tx, id, "start"))).toMatch(/not_an_admin/);
      }
      await tx.as({ ...f.a.admin.claims, claims_version: (f.a.admin.claims.claims_version ?? 0) + 4 });
      expect(await errorCode(() => act(tx, id, "start"))).toBe(PERMISSION_DENIED);
      await tx.as(f.b.admin.claims);
      expect(await errorMessage(() => act(tx, id, "start"))).toMatch(/session_not_found/);

      await tx.asOwner();
      expect((await tx.q<{ state: string }>(`select state from public.sessions where id = $1`, [id]))[0].state).toBe("published");
    });
  });
});

describe("RPC-transition_session.edges", () => {
  it("accepts only 02 §6.2's edges", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = f.m2.a.published;
      await tx.as(f.a.admin.claims);

      // published → in_progress → completed → archived → completed
      expect((await act(tx, id, "start"))[0].state).toBe("in_progress");
      const completed = (await act(tx, id, "complete"))[0];
      expect(completed.state).toBe("completed");
      expect(completed.completed_at).not.toBeNull();
      expect((await act(tx, id, "archive"))[0].state).toBe("archived");
      expect((await act(tx, id, "reopen"))[0].state).toBe("completed");

      // And nothing else from here.
      expect(await errorMessage(() => act(tx, id, "start"))).toMatch(/illegal_session_transition/);
      expect(await errorMessage(() => act(tx, id, "reopen"))).toMatch(/illegal_session_transition/);
    });
  });

  it("refuses starting a draft and completing a published session", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => act(tx, f.m2.a.draft, "start"))).toBe(CHECK_VIOLATION);
      expect(await errorCode(() => act(tx, f.m2.a.published, "complete"))).toBe(CHECK_VIOLATION);
      expect(await errorCode(() => act(tx, f.m2.a.published, "archive"))).toBe(CHECK_VIOLATION);
      expect(await errorMessage(() => act(tx, f.m2.a.published, "publish"))).toMatch(/unknown_session_action/);
    });
  });

  it("writes one manual transition row per move, attributed to the admin", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      await act(tx, f.m2.a.published, "start");
      await act(tx, f.m2.a.published, "complete");

      await tx.asOwner();
      const rows = await tx.q<{ from_state: string; to_state: string; is_manual: boolean; actor_id: string }>(
        `select from_state, to_state, is_manual, actor_id from public.session_state_transitions
          where session_id = $1 and to_state in ('in_progress', 'completed') order by occurred_at, ctid`,
        [f.m2.a.published],
      );
      expect(rows.map((r) => `${r.from_state}→${r.to_state}`)).toEqual(["published→in_progress", "in_progress→completed"]);
      expect(rows.every((r) => r.is_manual && r.actor_id === f.a.admin.memberId)).toBe(true);
    });
  });
});

describe("RPC-transition_session.cancel", () => {
  it("requires a reason, in every state it is reachable from (REQ-SES-010)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => act(tx, f.m2.a.published, "cancel"))).toBe(CHECK_VIOLATION);
      expect(await errorCode(() => act(tx, f.m2.a.published, "cancel", "   "))).toBe(CHECK_VIOLATION);

      const [row] = await act(tx, f.m2.a.published, "cancel", "المُقدِّم مريض");
      expect(row.state).toBe("cancelled");
      expect(row.cancellation_reason).toBe("المُقدِّم مريض");
    });
  });

  it("is reachable from completed — a session can be retroactively voided (A6)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect((await act(tx, f.m2.a.completed, "cancel", "تبيّن أنها لم تُعقد"))[0].state).toBe("cancelled");
    });
  });

  it("is not reachable from draft, and a cancelled session has no way out", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      // 02 §6.2: cancelled is reachable only after approval.
      expect(await errorCode(() => act(tx, f.m2.a.draft, "cancel", "لا داعي"))).toBe(CHECK_VIOLATION);

      await act(tx, f.m2.a.published, "cancel", "أُلغيت");
      // The diagram gives `cancelled` no outgoing edge: a cancelled session is
      // superseded by a new one, never reopened.
      for (const action of ["start", "complete", "reopen", "archive"]) {
        expect(await errorCode(() => act(tx, f.m2.a.published, action))).toBe(CHECK_VIOLATION);
      }
    });
  });

  it("keeps the row and the page — REQ-SES-010's «الصفحة باقية»", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      await act(tx, f.m2.a.published, "cancel", "القاعة غير متاحة");

      // Still readable by an ordinary member: `sessions_read` lists
      // `cancelled` among the states a member sees, so a shared link works.
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.sessions where id = $1`, [f.m2.a.published])).toHaveLength(1);
    });
  });
});

describe("RPC-transition_session.closes_check_in", () => {
  it("completing early closes the check-in window immediately (REQ-SES-005, REQ-CHK-004)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await put(tx, f.m2.a.published, "in_progress");
      await tx.q(`update public.check_in_codes set valid_until = now() + interval '20 minutes' where session_id = $1`, [f.m2.a.published]);

      await tx.as(f.a.admin.claims);
      await act(tx, f.m2.a.published, "complete");

      await tx.asOwner();
      const [{ live }] = await tx.q<{ live: string }>(
        `select count(*) as live from public.check_in_codes where session_id = $1 and valid_until > now() and revoked_at is null`,
        [f.m2.a.published],
      );
      expect(Number(live)).toBe(0);
    });
  });

  it("cancelling closes it too — there is nothing left to attend", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.check_in_codes set valid_until = now() + interval '20 minutes' where session_id = $1`, [f.m2.a.published]);

      await tx.as(f.a.admin.claims);
      await act(tx, f.m2.a.published, "cancel", "أُلغيت لظرف طارئ");

      await tx.asOwner();
      const [{ live }] = await tx.q<{ live: string }>(
        `select count(*) as live from public.check_in_codes where session_id = $1 and valid_until > now() and revoked_at is null`,
        [f.m2.a.published],
      );
      expect(Number(live)).toBe(0);
    });
  });
});
