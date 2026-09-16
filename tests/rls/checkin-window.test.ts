// Check-in window — DEC-141, supabase/proposed/checkin/01_check_in_window.sql.
// Applied with applyProposed() inside this test's rolled-back transaction
// (DEC-040) — not yet promoted, so every case here re-derives from a real
// database, not a mock.
//
// `03` §8.2 rows: RPC-check_in.floor, RPC-check_in.ceiling,
// RPC-check_in.switch_closed, RPC-check_in.attendance_states,
// RPC-set_check_in_open.role_set, RPC-set_check_in_open.ceiling,
// RPC-set_check_in_open.audited, RPC-ensure_check_in_code.floor_ceiling.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorMessage, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["checkin/01_check_in_window.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  return f;
}

/** Mirrors checkin.test.ts's own makeSession() — this file predates 04's
 *  removed_at column, so nothing here references it. */
async function makeSession(tx: Tx, org: Org, opts: { state: string; startsInMinutes: number; endsInMinutes: number; checkInOpen?: boolean }): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, cancellation_reason, allow_walk_ins, check_in_open)
     values ($1, 'جلسة نافذة الحضور', 'ملخص', $2, 'introductory',
             now() + ($3 || ' minutes')::interval, 60, now() + ($4 || ' minutes')::interval,
             $5, 40, $6::public.session_state,
             case when $6 in ('published','in_progress','completed','archived') then now() - interval '1 day' end,
             case when $6 = 'completed' then now() - interval '1 hour' end,
             case when $6 = 'cancelled' then 'اختبار' end,
             true, $7)
     returning id`,
    [org.id, org.categoryId, String(opts.startsInMinutes), String(opts.endsInMinutes), org.venueId, opts.state, opts.checkInOpen ?? true],
  );
  return row.id;
}

async function addPresenter(tx: Tx, org: Org, sessionId: string, memberId: string) {
  await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [org.id, sessionId, memberId]);
}

type CheckInEnvelope = { status: string; check_in?: { id: string } };
async function checkIn(tx: Tx, sessionId: string, code: string): Promise<CheckInEnvelope> {
  const [row] = await tx.q<{ r: CheckInEnvelope }>(`select public.check_in($1, $2) as r`, [sessionId, code]);
  return row.r;
}

describe("RPC-check_in.floor / .ceiling / .switch_closed / .attendance_states", () => {
  it("refuses not_started before the scheduled start, on the CLOCK, independent of state", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      // in_progress but the clock's own start is still in the future —
      // DEC-141: the floor is `now >= starts_at`, not `state = in_progress`.
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: 5, endsInMinutes: 65 });
      await tx.as(f.a.members[0].claims);
      expect((await checkIn(tx, sessionId, "WHATEVER")).status).toBe("not_started");
    });
  });

  it("still accepts a real check-in during the 2h grace window, even though the row is already `completed`", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      // Ends 30 minutes ago, already marked completed — the ceiling (ends_at
      // + 2h) has not passed.
      const sessionId = await makeSession(tx, f.a, { state: "completed", startsInMinutes: -90, endsInMinutes: -30 });
      await addPresenter(tx, f.a, sessionId, f.a.members[0].memberId);
      await tx.as(f.a.members[0].claims);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[1].claims);
      const r = await checkIn(tx, sessionId, code.code);
      expect(r.status).toBe("ok");
    });
  });

  it("refuses session_ended once the 2h ceiling has passed, computed from the SCHEDULED end", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await makeSession(tx, f.a, { state: "completed", startsInMinutes: -300, endsInMinutes: -130 }); // ended 2h10m ago
      await tx.as(f.a.members[0].claims);
      expect((await checkIn(tx, sessionId, "WHATEVER")).status).toBe("session_ended");
    });
  });

  it("refuses check_in_closed inside the window when the switch is off, without revealing the code", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50, checkInOpen: false });
      await addPresenter(tx, f.a, sessionId, f.a.members[0].memberId);
      await tx.as(f.a.members[0].claims);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[1].claims);
      // Even the RIGHT code is refused, and the same status either way.
      expect((await checkIn(tx, sessionId, code.code)).status).toBe("check_in_closed");
      expect((await checkIn(tx, sessionId, "WRONGCODE")).status).toBe("check_in_closed");
    });
  });

  it("refuses on a cancelled session whose scheduled start has already passed — DEC-141 ruling 1", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "cancelled", startsInMinutes: -30, endsInMinutes: 30 });
      await tx.as(f.a.members[0].claims);
      expect((await checkIn(tx, sessionId, "WHATEVER")).status).toBe("not_started");
    });
  });
});

describe("RPC-ensure_check_in_code.floor_ceiling — supersedes 0078's .only_live", () => {
  it("mirrors check_in()'s own window: refused before the start and after the ceiling, issues inside it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "published", startsInMinutes: 60, endsInMinutes: 120 });
      await addPresenter(tx, f.a, sessionId, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims);
      expect(await errorMessage(() => tx.q(`select * from public.ensure_check_in_code($1)`, [sessionId]))).toMatch(/not_open/);

      await tx.asOwner();
      await tx.q(`update public.sessions set starts_at = now() - interval '90 minutes', ends_at = now() - interval '30 minutes' where id = $1`, [sessionId]);
      // Still `published` (the clock job never ran) — DEC-141: state no longer gates issuance either, only the floor/ceiling/family.
      await tx.q(`update public.sessions set state = 'published' where id = $1`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      expect(code.code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/);

      await tx.asOwner();
      await tx.q(`update public.sessions set starts_at = now() - interval '5 hours', ends_at = now() - interval '3 hours' where id = $1`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      expect(await errorMessage(() => tx.q(`select * from public.ensure_check_in_code($1)`, [sessionId]))).toMatch(/not_open/);
    });
  });
});

describe("RPC-set_check_in_open.role_set / .ceiling / .audited", () => {
  it("a member is refused; the session's own presenter, a moderator and an admin succeed; a presenter of ANOTHER session is refused", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await addPresenter(tx, f.a, sessionId, f.a.members[0].memberId);

      await tx.as(f.a.members[1].claims);
      expect(await errorMessage(() => tx.q(`select * from public.set_check_in_open($1, false)`, [sessionId]))).toMatch(/not_authorized/);

      await tx.as(f.a.members[0].claims); // the session's own presenter
      const [closed] = await tx.q<{ check_in_open: boolean }>(`select * from public.set_check_in_open($1, false)`, [sessionId]);
      expect(closed.check_in_open).toBe(false);

      await tx.as(f.a.mod.claims);
      const [reopened] = await tx.q<{ check_in_open: boolean }>(`select * from public.set_check_in_open($1, true)`, [sessionId]);
      expect(reopened.check_in_open).toBe(true);

      await tx.as(f.a.admin.claims);
      const [closedAgain] = await tx.q<{ check_in_open: boolean }>(`select * from public.set_check_in_open($1, false)`, [sessionId]);
      expect(closedAgain.check_in_open).toBe(false);

      await tx.asOwner();
      const otherSession = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      await tx.as(f.a.members[0].claims); // presenter of `sessionId`, not `otherSession`
      expect(await errorMessage(() => tx.q(`select * from public.set_check_in_open($1, true)`, [otherSession]))).toMatch(/not_authorized/);
    });
  });

  it("refuses opening past the 2h ceiling; closing is always allowed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await makeSession(tx, f.a, { state: "completed", startsInMinutes: -300, endsInMinutes: -130, checkInOpen: false }); // ceiling passed
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select * from public.set_check_in_open($1, true)`, [sessionId]))).toMatch(/ceiling_passed/);
      // Closing an already-closed session past the ceiling is a harmless no-op, not refused.
      const [stillClosed] = await tx.q<{ check_in_open: boolean }>(`select * from public.set_check_in_open($1, false)`, [sessionId]);
      expect(stillClosed.check_in_open).toBe(false);
    });
  });

  it("every open and close writes an audit row naming who and when", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.set_check_in_open($1, false)`, [sessionId]);
      await tx.q(`select * from public.set_check_in_open($1, true)`, [sessionId]);

      await tx.asOwner();
      const audit = await tx.q<{ actor_role: string; after: { check_in_open: boolean } }>(
        `select actor_role, after from public.audit_log where subject_id = $1 and action = 'session.check_in_open_changed' order by occurred_at`,
        [sessionId],
      );
      expect(audit.map((a) => [a.actor_role, a.after.check_in_open])).toEqual([["admin", false], ["admin", true]]);
    });
  });
});
