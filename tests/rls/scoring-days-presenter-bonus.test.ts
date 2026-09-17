// supabase/proposed/scoring/0005_attendee_bonus_guard.sql — the presenter's
// per-attendee bonus, made safe against ANY caller.
//
// ★ These cases are written as `main`'s OLD worker, not as the new one. That
// is the whole point: the new worker already passes exactly the epoch row, so
// testing it would prove nothing about the deploy window, where Vercel has
// shipped and Railway has not. Each case loops over active check-in rows
// exactly as `main`'s `award_presenter_points.ts` does, and asserts what the
// ledger holds afterwards.
//
// 03 §8.2 rows proven here: RPC-award_points.attendee_bonus_epoch_only,
// .attendee_bonus_requires_complete, .attendee_bonus_one_day_unchanged,
// .attendee_bonus_skips_silently.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

/** `0005` adds no function of its own — it re-creates `award_points()` — so
 *  the «already promoted?» probe reads the body for the guard's own marker
 *  instead of `to_regprocedure`. After promotion the cases run against the
 *  promoted body, which is the point of probing at all. */
async function ready(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  const [row] = await tx.q<{ present: boolean }>(
    `select coalesce(bool_or(p.prosrc like '%attendee_bonus_epoch_guard%'), false) as present
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'award_points'`,
  );
  if (!row.present) await applyProposed(tx, "scoring/0005_attendee_bonus_guard.sql");
  await tx.asOwner();
  return f;
}

/** A completed session with `days` days, ten or more days out — clear of the
 *  fixture's own session 24 hours from now (see scoring-days-award.test.ts). */
async function makeDays(tx: Tx, org: Org, days: number, offsetDays = 10): Promise<{ sessionId: string; dayIds: string[] }> {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
     values ($1, 'ورشة', 'ملخص', $2, 'introductory',
             now() + ($4 || ' days')::interval, 60, now() + ($4 || ' days')::interval + interval '1 hour',
             $3, 40, 'completed', now() - interval '1 day', now() - interval '1 hour', true)
     returning id`,
    [org.id, org.categoryId, org.venueId, String(offsetDays)],
  );
  for (let i = 1; i < days; i += 1) {
    await tx.q(
      `insert into public.session_days (session_id, starts_at, ends_at, venue_id)
       values ($1, now() + ($2 || ' days')::interval, now() + ($2 || ' days')::interval + interval '1 hour', $3)`,
      [row.id, String(offsetDays + i), org.venueId],
    );
  }
  const dayRows = await tx.q<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [row.id]);
  expect(dayRows).toHaveLength(days);
  return { sessionId: row.id, dayIds: dayRows.map((d) => d.id) };
}

async function attend(tx: Tx, org: Org, sessionId: string, dayId: string, memberId: string): Promise<string> {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by)
     values ($1, $2, $3, $4, 'manual', 'حضر', $5) returning id`,
    [org.id, sessionId, dayId, memberId, org.admin.memberId],
  );
  return row.id;
}

/** `main`'s OLD loop, verbatim: every active check-in row of the session, one
 *  award_points() call each. The owner for the table read (check_ins is
 *  revoked from every client role and the worker connects as the owner),
 *  service_role for the definer-only award. */
async function oldWorkerLoop(tx: Tx, sessionId: string, presenter: string): Promise<number> {
  await tx.asOwner();
  const checkIns = await tx.q<{ id: string }>(`select id from public.check_ins where session_id = $1 and removed_at is null`, [sessionId]);
  await tx.asServiceRole();
  for (const { id } of checkIns) {
    await tx.q(`select public.award_points('attendee_bonus', $1, 'attendee_bonus', $2, $3)`, [presenter, id, sessionId]);
  }
  await tx.asOwner();
  return checkIns.length;
}

async function bonuses(tx: Tx, presenter: string, sessionId: string) {
  await tx.asOwner();
  return tx.q<{ amount: number; source_id: string; idempotency_key: string }>(
    `select amount, source_id, idempotency_key from public.points_ledger
      where member_id = $1 and session_id = $2 and rule_key = 'attendee_bonus' order by idempotency_key`,
    [presenter, sessionId],
  );
}

describe("RPC-award_points.attendee_bonus_epoch_only", () => {
  it("★ main's OLD per-check-in loop pays ONE bonus per attendee on a three-day workshop, not three", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const presenter = f.a.members[0].memberId;
      const attendee = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, 3);

      const ids: string[] = [];
      for (const dayId of dayIds) ids.push(await attend(tx, f.a, sessionId, dayId, attendee));

      const calls = await oldWorkerLoop(tx, sessionId, presenter);
      expect(calls).toBe(3); // the old worker really did call three times

      const rows = await bonuses(tx, presenter, sessionId);
      expect(rows).toHaveLength(1);
      // …and the one row names the attendee's EPOCH, so attendance_removed()
      // reverses it together with the attendee's own award.
      expect(rows[0].source_id).toBe(ids[2]);
      expect(rows[0].idempotency_key).toBe(`attendee_bonus:attendee_bonus:${ids[2]}:${presenter}:v1`);
    });
  });
});

describe("RPC-award_points.attendee_bonus_requires_complete", () => {
  it("a partial attendee earns the presenter nothing, even when the call names that attendee's own latest day", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const presenter = f.a.members[0].memberId;
      const partial = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, 3);

      // Days one and three of three: the member HAS an epoch — day three's —
      // which is why the epoch alone cannot be the whole test.
      await attend(tx, f.a, sessionId, dayIds[0], partial);
      const third = await attend(tx, f.a, sessionId, dayIds[2], partial);
      await tx.asOwner();
      const [epoch] = await tx.q<{ id: string | null }>(`select public.attendance_epoch_check_in($1, $2) as id`, [sessionId, partial]);
      expect(epoch.id).toBe(third);

      await oldWorkerLoop(tx, sessionId, presenter);
      expect(await bonuses(tx, presenter, sessionId)).toEqual([]);
    });
  });

  it("a member with no active check-in has no epoch at all — null, which is what a detection read sees", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, 3);
      const first = await attend(tx, f.a, sessionId, dayIds[0], member);

      await tx.asOwner();
      let [epoch] = await tx.q<{ id: string | null }>(`select public.attendance_epoch_check_in($1, $2) as id`, [sessionId, member]);
      expect(epoch.id).toBe(first); // present but INCOMPLETE — not null

      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where id = $1`, [first, f.a.admin.memberId]);
      [epoch] = await tx.q<{ id: string | null }>(`select public.attendance_epoch_check_in($1, $2) as id`, [sessionId, member]);
      expect(epoch.id).toBeNull(); // null means NO ACTIVE CHECK-IN, never "incomplete"
    });
  });
});

describe("RPC-award_points.attendee_bonus_one_day_unchanged", () => {
  it("★ on a ONE-DAY session the old loop writes exactly what it writes today — two attendees, two bonuses", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const presenter = f.a.members[1].memberId; // not members[0]: fixture-m4 seeds it a ledger row
      const { sessionId, dayIds } = await makeDays(tx, f.a, 1);
      const one = await attend(tx, f.a, sessionId, dayIds[0], f.a.admin.memberId);
      const two = await attend(tx, f.a, sessionId, dayIds[0], f.a.mod.memberId);

      const calls = await oldWorkerLoop(tx, sessionId, presenter);
      expect(calls).toBe(2);

      const rows = await bonuses(tx, presenter, sessionId);
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.source_id).sort()).toEqual([one, two].sort());
      expect(rows.every((r) => r.amount === 2)).toBe(true);
      expect(rows.map((r) => r.idempotency_key).sort()).toEqual(
        [`attendee_bonus:attendee_bonus:${one}:${presenter}:v1`, `attendee_bonus:attendee_bonus:${two}:${presenter}:v1`].sort(),
      );
    });
  });

  it("a removed check-in earns the presenter nothing — the narrowing this adds at one day", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const presenter = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, 1);
      const ci = await attend(tx, f.a, sessionId, dayIds[0], f.a.admin.memberId);
      await tx.asOwner();
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where id = $1`, [ci, f.a.admin.memberId]);

      // The old worker's own query filters removed rows, so this is reachable
      // only by a direct call — but 0087's reversal finds an attendee_bonus by
      // the attendee's check-ins, and a row written here could still never be
      // taken back if the attendee never re-qualifies. Refused.
      await tx.asServiceRole();
      await tx.q(`select public.award_points('attendee_bonus', $1, 'attendee_bonus', $2, $3)`, [presenter, ci, sessionId]);
      expect(await bonuses(tx, presenter, sessionId)).toEqual([]);
    });
  });
});

describe("RPC-award_points.attendee_bonus_skips_silently", () => {
  it("every refusal returns normally — main's loop must never throw part-way through a session", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const presenter = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, 3);
      await attend(tx, f.a, sessionId, dayIds[0], f.a.admin.memberId); // partial
      const ghost = (await tx.q<{ id: string }>(`select gen_random_uuid() as id`))[0].id;

      await tx.asServiceRole();
      // A partial attendee, and a source_id that is not a check-in at all.
      // Neither raises; both write nothing.
      await tx.q(`select public.award_points('attendee_bonus', $1, 'attendee_bonus', $2, $3)`, [presenter, ghost, sessionId]);
      const calls = await oldWorkerLoop(tx, sessionId, presenter);
      expect(calls).toBe(1);
      expect(await bonuses(tx, presenter, sessionId)).toEqual([]);

      // …and the function is still working: completing the attendance makes
      // the very same loop pay, so «writes nothing» is a decision, not a break.
      for (const dayId of [dayIds[1], dayIds[2]]) await attend(tx, f.a, sessionId, dayId, f.a.admin.memberId);
      await oldWorkerLoop(tx, sessionId, presenter);
      expect(await bonuses(tx, presenter, sessionId)).toHaveLength(1);
    });
  });
});

describe("the existing presenter suite, replayed with the guard applied", () => {
  it("★ award-presenter-points.test.ts:188's exact arithmetic still holds: 50 + 2 × 2 = 54", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      // ★ This case exists because the guard lives in a PROPOSED file, so
      // `tests/rls/award-presenter-points.test.ts` — which does not call
      // applyProposed — runs against the promoted body WITHOUT it and can
      // therefore say nothing about whether the guard breaks it. Its scenario
      // is reproduced here, with the guard applied, so the answer is known
      // before promotion rather than discovered by it.
      //
      // members[1], not members[0]: fixture-m4 seeds a 10-point ledger row for
      // every org's members[0], which is that file's own stated reason too.
      const presenter = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, 1);
      for (const m of [f.a.admin.memberId, f.a.mod.memberId]) await attend(tx, f.a, sessionId, dayIds[0], m);

      await tx.asServiceRole();
      await tx.q(`select public.award_points('session_delivered', $1, 'session_delivered', $2, $2)`, [presenter, sessionId]);
      await oldWorkerLoop(tx, sessionId, presenter);

      await tx.asOwner();
      const [balance] = await tx.q<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [presenter]);
      expect(balance.total_points).toBe(50 + 2 * 2);

      const noBonus = await tx.q(`select id from public.points_ledger where member_id = $1 and rule_key = 'rating_bonus'`, [presenter]);
      expect(noBonus).toEqual([]);
    });
  });
});
