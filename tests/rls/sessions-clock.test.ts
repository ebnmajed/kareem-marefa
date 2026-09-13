// STORY-SES-003 — the clock moves sessions, not people (REQ-SES-004,
// REQ-SES-005). JOB-start_session and JOB-complete_session.
//
// 03 §8.2 rows: RPC-clock.service_role_only, RPC-clock.idempotent,
//               RPC-clock.closes_check_in
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const PROPOSED = "sessions/0006_session_clock.sql";

const startClock = (tx: Tx) => tx.q<{ session_id: string }>(`select public.clock_start_sessions() as session_id`);
const completeClock = (tx: Tx) => tx.q<{ session_id: string }>(`select public.clock_complete_sessions() as session_id`);
const stateOf = async (tx: Tx, id: string) => (await tx.q<{ state: string }>(`select state from public.sessions where id = $1`, [id]))[0].state;

/**
 * Moves a session's clock. The two deadlines move with `starts_at` because
 * 0010 constrains both to be `<= starts_at` — leaving them behind is a 23514
 * from the fixture, not a finding about the clock.
 */
async function retime(tx: Tx, id: string, startsIn: string, endsIn: string, state?: string) {
  await tx.asOwner();
  await tx.q(
    `update public.sessions
        set starts_at = now() + $2::interval,
            ends_at = now() + $3::interval,
            rsvp_deadline_at = now() + $2::interval,
            cancellation_cutoff_at = now() + $2::interval,
            state = coalesce($4::public.session_state, state)
      where id = $1`,
    [id, startsIn, endsIn, state ?? null],
  );
}

const due = (tx: Tx, id: string) => retime(tx, id, "-5 minutes", "-1 minute");

describe("RPC-clock.service_role_only", () => {
  it("is out of reach of every signed-in role", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      for (const who of [f.a.members[0].claims, f.a.mod.claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(() => startClock(tx))).toBe(PERMISSION_DENIED);
        expect(await errorCode(() => completeClock(tx))).toBe(PERMISSION_DENIED);
      }
      await tx.asAnon();
      expect(await errorCode(() => startClock(tx))).toBe(PERMISSION_DENIED);
    });
  });

  it("the worker's role can call it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await due(tx, f.m2.a.published);
      await tx.asServiceRole();
      expect((await startClock(tx)).map((r) => r.session_id)).toContain(f.m2.a.published);
    });
  });
});

describe("RPC-clock.idempotent", () => {
  it("running start twice moves a session once, and writes one transition row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await due(tx, f.m2.a.published);

      await tx.asServiceRole();
      expect((await startClock(tx)).length).toBeGreaterThan(0);
      const second = await startClock(tx);
      expect(second.map((r) => r.session_id)).not.toContain(f.m2.a.published);

      await tx.asOwner();
      expect(await stateOf(tx, f.m2.a.published)).toBe("in_progress");
      const rows = await tx.q(`select 1 from public.session_state_transitions where session_id = $1 and to_state = 'in_progress'`, [f.m2.a.published]);
      expect(rows).toHaveLength(1);
    });
  });

  it("records the clock as the actor, not a person (REQ-SES-005's flag)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await due(tx, f.m2.a.published);
      await tx.asServiceRole();
      await startClock(tx);

      await tx.asOwner();
      const [row] = await tx.q<{ actor_id: string | null; is_manual: boolean }>(
        `select actor_id, is_manual from public.session_state_transitions where session_id = $1 and to_state = 'in_progress'`,
        [f.m2.a.published],
      );
      expect(row).toEqual({ actor_id: null, is_manual: false });
    });
  });

  it("never moves a session an admin already finished or cancelled", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);

      // Completed early by an admin, with an end time in the past: the clock
      // must not touch it, and there is no query that could move it back.
      await retime(tx, f.m2.a.completed, "-2 hours", "-1 hour");
      await tx.q(`update public.sessions set cancellation_reason = 'المُقدِّم مريض' where id = $1`, [f.m2.a.published]);
      await retime(tx, f.m2.a.published, "-1 hour", "-10 minutes", "cancelled");

      await tx.asServiceRole();
      expect(await startClock(tx)).toEqual([]);
      expect(await completeClock(tx)).toEqual([]);

      await tx.asOwner();
      expect(await stateOf(tx, f.m2.a.completed)).toBe("completed");
      expect(await stateOf(tx, f.m2.a.published)).toBe("cancelled");
    });
  });

  it("leaves a session alone until its own clock time", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      // The fixture's published session starts in 24 hours.
      await tx.asServiceRole();
      expect((await startClock(tx)).map((r) => r.session_id)).not.toContain(f.m2.a.published);
      await tx.asOwner();
      expect(await stateOf(tx, f.m2.a.published)).toBe("published");
    });
  });

  it("completes only what the clock started, and only past its end", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await retime(tx, f.m2.a.published, "-30 minutes", "30 minutes");

      await tx.asServiceRole();
      await startClock(tx);
      expect(await completeClock(tx)).toEqual([]); // still running

      await tx.asOwner();
      await tx.q(`update public.sessions set ends_at = now() - interval '1 minute' where id = $1`, [f.m2.a.published]);
      await tx.asServiceRole();
      expect((await completeClock(tx)).map((r) => r.session_id)).toContain(f.m2.a.published);
      await tx.asOwner();
      expect(await stateOf(tx, f.m2.a.published)).toBe("completed");
    });
  });
});

describe("RPC-clock.closes_check_in", () => {
  it("expires the session's live codes in the same transaction as the completion (REQ-CHK-004)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await retime(tx, f.m2.a.published, "-2 hours", "-1 minute", "in_progress");
      await tx.asOwner();
      // The fixture's code runs ten minutes into the future.
      await tx.q(`update public.check_in_codes set valid_until = now() + interval '10 minutes' where session_id = $1`, [f.m2.a.published]);

      await tx.asServiceRole();
      await completeClock(tx);

      await tx.asOwner();
      const [{ live }] = await tx.q<{ live: string }>(
        `select count(*) as live from public.check_in_codes where session_id = $1 and valid_until > now() and revoked_at is null`,
        [f.m2.a.published],
      );
      expect(Number(live)).toBe(0);
      // Another session's codes are untouched.
      const [{ others }] = await tx.q<{ others: string }>(`select count(*) as others from public.check_in_codes where session_id <> $1`, [f.m2.a.published]);
      expect(Number(others)).toBeGreaterThan(0);
    });
  });
});
