// supabase/proposed/scoring/0002_attendance_predicate.sql — DEC-150
// contract 6: session_attendance_complete() and session_attendance().
//
// The predicate is the only definition of «attended the session» for points
// and certificates, so the case that matters most is the smallest one:
// on a ONE-DAY session it agrees with has_checked_in() in both directions
// and under both settings of require_all_days. Everything the multi-day
// machinery adds has to leave that identity standing.
//
// 03 §8.2 rows proven here: RPC-session_attendance_complete.definer_only,
// .every_day, .any_day, .one_day_equals_has_checked_in, .no_days,
// POL-session_attendance.reader.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const PREDICATE = "scoring/0002_attendance_predicate.sql";

async function ready(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, PREDICATE);
  return f;
}

/** A session with `days` consecutive, non-overlapping days, one per day from
 *  ten days out. The session row is inserted with day 1's window, which 0100's
 *  sessions_sync_single_day() turns into day 1; days 2…n are inserted directly
 *  and session_days_derive() renumbers them and re-derives the session's
 *  stored window.
 *
 *  ★ TEN DAYS OUT, not now. fixture-m2 gives members[1] a check-in on a
 *  session 24 hours from now, and since 0100 that row no longer carries the
 *  `'empty'::tstzrange` the fixture writes — check_ins_window() overwrites it
 *  with the day's real window. So a second day placed «tomorrow» collides with
 *  it on REQ-CHK-013's overlap exclusion, which is the constraint working
 *  correctly on data that only became real with the foundation. */
async function makeSession(tx: Tx, org: Org, opts: { days: number; state: string }): Promise<{ sessionId: string; dayIds: string[] }> {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
     values ($1, 'ورشة عمل', 'ملخص', $2, 'introductory',
             now() + interval '10 days', 60, now() + interval '10 days' + interval '1 hour',
             $3, 40, $4::public.session_state,
             case when $4 in ('published','in_progress','completed','archived') then now() - interval '1 day' end,
             case when $4 = 'completed' then now() - interval '1 hour' end,
             true)
     returning id`,
    [org.id, org.categoryId, org.venueId, opts.state],
  );
  for (let i = 1; i < opts.days; i += 1) {
    await tx.q(
      `insert into public.session_days (session_id, starts_at, ends_at, venue_id)
       values ($1, now() + interval '10 days' + ($2 || ' days')::interval,
                   now() + interval '10 days' + interval '1 hour' + ($2 || ' days')::interval, $3)`,
      [row.id, String(i), org.venueId],
    );
  }
  const days = await tx.q<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [row.id]);
  expect(days).toHaveLength(opts.days);
  return { sessionId: row.id, dayIds: days.map((d) => d.id) };
}

/** A check-in on one named day. session_window and org_id are derived by
 *  0100's check_ins_window() from the day, which is the point. */
async function attend(tx: Tx, org: Org, sessionId: string, dayId: string, memberId: string): Promise<string> {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by)
     values ($1, $2, $3, $4, 'manual', 'حضر', $5) returning id`,
    [org.id, sessionId, dayId, memberId, org.admin.memberId],
  );
  return row.id;
}

async function complete(tx: Tx, sessionId: string, memberId: string): Promise<boolean> {
  await tx.asOwner();
  const [row] = await tx.q<{ v: boolean }>(`select public.session_attendance_complete($1, $2) as v`, [sessionId, memberId]);
  return row.v;
}

describe("RPC-session_attendance_complete.definer_only", () => {
  it("no client role can call it; only service_role and the owner can", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const call = () => tx.q(`select public.session_attendance_complete(gen_random_uuid(), $1)`, [f.a.members[1].memberId]);

      for (const claims of [f.a.members[1].claims, f.a.admin.claims]) {
        await tx.as(claims);
        expect(await errorCode(call)).toBe(PERMISSION_DENIED);
      }
      await tx.asAnon();
      expect(await errorCode(call)).toBe(PERMISSION_DENIED);

      // The owner grant is what lets fan_out_certificates() and
      // issue_certificate() — both definer — read the predicate (row L4).
      await tx.asServiceRole();
      await call();
      await tx.asOwner();
      await call();
    });
  });
});

describe("RPC-session_attendance_complete.every_day", () => {
  it("with require_all_days (the default), every day is required and a removed check-in takes it away again", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeSession(tx, f.a, { days: 3, state: "in_progress" });

      const [{ require_all_days: def }] = await tx.q<{ require_all_days: boolean }>(
        `select require_all_days from public.sessions where id = $1`,
        [sessionId],
      );
      expect(def).toBe(true); // 0100: not null default true

      expect(await complete(tx, sessionId, member)).toBe(false);
      await attend(tx, f.a, sessionId, dayIds[0], member);
      expect(await complete(tx, sessionId, member)).toBe(false);
      const second = await attend(tx, f.a, sessionId, dayIds[1], member);
      expect(await complete(tx, sessionId, member)).toBe(false);
      await attend(tx, f.a, sessionId, dayIds[2], member);
      expect(await complete(tx, sessionId, member)).toBe(true);

      // A removed check-in is no attendance (REQ-CHK-017, 0087's rule applied
      // per day): the middle day goes, and so does the whole predicate.
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where id = $1`, [second, f.a.admin.memberId]);
      expect(await complete(tx, sessionId, member)).toBe(false);
    });
  });
});

describe("RPC-session_attendance_complete.any_day", () => {
  it("with require_all_days = false, any one day is enough", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeSession(tx, f.a, { days: 3, state: "in_progress" });
      await tx.q(`update public.sessions set require_all_days = false where id = $1`, [sessionId]);

      expect(await complete(tx, sessionId, member)).toBe(false);
      const first = await attend(tx, f.a, sessionId, dayIds[0], member);
      expect(await complete(tx, sessionId, member)).toBe(true);

      // …and removing the only one takes it away again.
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where id = $1`, [first, f.a.admin.memberId]);
      expect(await complete(tx, sessionId, member)).toBe(false);
    });
  });
});

describe("RPC-session_attendance_complete.one_day_equals_has_checked_in", () => {
  it("★ on a one-day session the predicate and has_checked_in() agree in both directions, under both settings", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const person = f.a.members[1];
      const { sessionId, dayIds } = await makeSession(tx, f.a, { days: 1, state: "in_progress" });

      const hasCheckedIn = async (): Promise<boolean> => {
        await tx.as(person.claims);
        const [row] = await tx.q<{ v: boolean }>(`select public.has_checked_in($1) as v`, [sessionId]);
        return row.v;
      };

      for (const requireAll of [true, false]) {
        await tx.asOwner();
        await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where session_id = $1 and removed_at is null`, [
          sessionId,
          f.a.admin.memberId,
        ]);
        await tx.q(`update public.sessions set require_all_days = $2 where id = $1`, [sessionId, requireAll]);

        expect(await hasCheckedIn()).toBe(false);
        expect(await complete(tx, sessionId, person.memberId)).toBe(false);

        await attend(tx, f.a, sessionId, dayIds[0], person.memberId);

        expect(await hasCheckedIn()).toBe(true);
        expect(await complete(tx, sessionId, person.memberId)).toBe(true);
      }
    });
  });
});

describe("RPC-session_attendance_complete.no_days", () => {
  it("a session with no days is false under both settings — never vacuously true", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      // A draft with no window gets no day (0100's backfill rule applied to a
      // new row): «an active check-in on every day of no days» must not pay.
      const [draft] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, capacity, state)
         values ($1, 'مسودة', 'ملخص', $2, 'introductory', 40, 'draft') returning id`,
        [f.a.id, f.a.categoryId],
      );
      const days = await tx.q(`select id from public.session_days where session_id = $1`, [draft.id]);
      expect(days).toEqual([]);

      expect(await complete(tx, draft.id, f.a.members[1].memberId)).toBe(false);
      await tx.q(`update public.sessions set require_all_days = false where id = $1`, [draft.id]);
      expect(await complete(tx, draft.id, f.a.members[1].memberId)).toBe(false);
    });
  });
});

describe("POL-session_attendance.reader", () => {
  it("a member reads their own days; staff and the presenter read theirs; another member learns nothing", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const person = f.a.members[1];
      const other = f.a.members[0];
      const { sessionId, dayIds } = await makeSession(tx, f.a, { days: 3, state: "in_progress" });
      await attend(tx, f.a, sessionId, dayIds[0], person.memberId);
      await attend(tx, f.a, sessionId, dayIds[2], person.memberId);

      type Row = { session_day_id: string; day_position: number; attended: boolean; check_in_id: string | null };
      const read = async (): Promise<Row[]> =>
        tx.q<Row>(`select session_day_id, day_position, attended, check_in_id from public.session_attendance($1, $2)`, [sessionId, person.memberId]);

      // The member's own: three rows, in day order, day two missing.
      await tx.as(person.claims);
      const own = await read();
      expect(own.map((r) => r.day_position)).toEqual([1, 2, 3]);
      expect(own.map((r) => r.attended)).toEqual([true, false, true]);
      expect(own[1].check_in_id).toBeNull();
      expect(own[0].check_in_id).not.toBeNull();

      // Staff see the same — checkins_read already says so (0010).
      await tx.as(f.a.admin.claims);
      expect((await read()).map((r) => r.attended)).toEqual([true, false, true]);
      await tx.as(f.a.mod.claims);
      expect((await read()).map((r) => r.attended)).toEqual([true, false, true]);

      // Another ordinary member sees the day set — which they can see anyway —
      // and nothing whatever about this member's attendance.
      await tx.as(other.claims);
      const stranger = await read();
      expect(stranger).toHaveLength(3);
      expect(stranger.map((r) => r.attended)).toEqual([false, false, false]);
      expect(stranger.every((r) => r.check_in_id === null)).toBe(true);
    });
  });
});
