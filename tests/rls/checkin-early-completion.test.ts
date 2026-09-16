// REQ-SES-005's "completing early closes the check-in window immediately" —
// re-implemented on the switch, DEC-141 — supabase/proposed/checkin/{01,06}.
// applyProposed() inside this test's rolled-back transaction (DEC-040). 01
// first: 06's re-created transition_session() writes check_in_open, which
// 01 adds.
//
// `03` §8.2 rows: RPC-transition_session.check_in_open_early,
// RPC-transition_session.check_in_open_cancel,
// RPC-transition_session.check_in_open_reopenable.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["checkin/01_check_in_window.sql", "checkin/06_early_completion_hook.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  return f;
}

async function makeSession(tx: Tx, org: Org, opts: { state: string; startsInMinutes: number; endsInMinutes: number }): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, allow_walk_ins, check_in_open)
     values ($1, 'جلسة إنهاء مبكر', 'ملخص', $2, 'introductory',
             now() + ($3 || ' minutes')::interval, 60, now() + ($4 || ' minutes')::interval,
             $5, 40, $6::public.session_state, now() - interval '1 day', true, true)
     returning id`,
    [org.id, org.categoryId, String(opts.startsInMinutes), String(opts.endsInMinutes), org.venueId, opts.state],
  );
  return row.id;
}

describe("RPC-transition_session.check_in_open_early / .check_in_open_reopenable", () => {
  it("completing BEFORE the scheduled end closes the switch in the same transaction, reopenable afterward", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -30, endsInMinutes: 30 }); // ends in 30 min — completing now is EARLY

      await tx.as(f.a.admin.claims);
      const [completed] = await tx.q<{ state: string; check_in_open: boolean }>(`select * from public.transition_session($1, 'complete', null)`, [sessionId]);
      expect(completed.state).toBe("completed");
      expect(completed.check_in_open).toBe(false);

      // Reopenable — an ordinary close, not a dead end (REQ-CHK-015's "at any time").
      const [reopened] = await tx.q<{ check_in_open: boolean }>(`select * from public.set_check_in_open($1, true)`, [sessionId]);
      expect(reopened.check_in_open).toBe(true);
    });
  });

  it("completing on or after the scheduled end leaves the switch untouched — the ceiling already governs", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -70, endsInMinutes: -10 }); // ends 10 min ago — completing now is ON TIME/LATE

      await tx.as(f.a.admin.claims);
      const [completed] = await tx.q<{ state: string; check_in_open: boolean }>(`select * from public.transition_session($1, 'complete', null)`, [sessionId]);
      expect(completed.state).toBe("completed");
      expect(completed.check_in_open).toBe(true); // untouched — still the default
    });
  });
});

describe("RPC-transition_session.check_in_open_cancel", () => {
  it("cancelling closes the switch too", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });

      await tx.as(f.a.admin.claims);
      const [cancelled] = await tx.q<{ state: string; check_in_open: boolean }>(`select * from public.transition_session($1, 'cancel', 'انتهى الأمر')`, [sessionId]);
      expect(cancelled.state).toBe("cancelled");
      expect(cancelled.check_in_open).toBe(false);
    });
  });
});
