// supabase/proposed/scoring/0003_award_at_completion.sql, sections 7 and 8 —
// THREE CHECK-INS ON ONE WORKSHOP ARE ONE SESSION ATTENDED.
//
// evaluate_streaks(), evaluate_badges()'s `check_ins_count` and
// evaluate_company_points()' rule 2 all counted `check_ins` ROWS, which was the
// same number as sessions attended until a session could have more than one
// day. Each now counts the thing it meant to count, and at n = 1 the two are
// the same number — a member has one active check-in per session — so nothing
// moves for a one-day session.
//
// 03 §8.2 rows proven here: RPC-evaluate_streaks.counts_sessions_not_check_ins,
// RPC-evaluate_badges.counts_sessions_not_check_ins,
// RPC-evaluate_company_points.counts_members_not_check_ins.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const FILES: ReadonlyArray<readonly [string, string]> = [
  ["scoring/0001_attendance_hooks.sql", "public.attendance_recorded(uuid)"],
  ["scoring/0002_attendance_predicate.sql", "public.session_attendance_complete(uuid,uuid)"],
  ["scoring/0003_award_at_completion.sql", "public.evaluate_member_attendance(uuid,uuid,text)"],
];

/** Apply anything not already promoted — see scoring-days-award.test.ts. */
async function ready(tx: Tx) {
  const f = await seed(tx);
  for (const [path, probe] of FILES) {
    await tx.asOwner();
    const [row] = await tx.q<{ present: boolean }>(`select to_regprocedure($1) is not null as present`, [probe]);
    if (!row.present) await applyProposed(tx, path);
  }
  await tx.asOwner();
  return f;
}

/** `days` consecutive days, starting `offsetDays` out — clear of the fixture's
 *  own session 24 hours from now (see scoring-days-award.test.ts). */
async function makeDays(tx: Tx, org: Org, opts: { days: number; offsetDays: number }): Promise<{ sessionId: string; dayIds: string[] }> {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
     values ($1, 'ورشة', 'ملخص', $2, 'introductory',
             now() + ($4 || ' days')::interval, 60, now() + ($4 || ' days')::interval + interval '1 hour',
             $3, 40, 'completed', now() - interval '1 day', now() - interval '1 hour', true)
     returning id`,
    [org.id, org.categoryId, org.venueId, String(opts.offsetDays)],
  );
  for (let i = 1; i < opts.days; i += 1) {
    await tx.q(
      `insert into public.session_days (session_id, starts_at, ends_at, venue_id)
       values ($1, now() + ($2 || ' days')::interval, now() + ($2 || ' days')::interval + interval '1 hour', $3)`,
      [row.id, String(opts.offsetDays + i), org.venueId],
    );
  }
  const days = await tx.q<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [row.id]);
  expect(days).toHaveLength(opts.days);
  return { sessionId: row.id, dayIds: days.map((d) => d.id) };
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

describe("RPC-evaluate_streaks.counts_sessions_not_check_ins", () => {
  it("★ three check-ins on ONE three-day workshop do not complete a three-session streak; three one-day sessions do", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      // ★ The MODERATOR, not members[1]: fixture-m2 gives members[1] check-ins
      // on two other sessions, both with `arrived_at` defaulting to now() and
      // so both in this month — two thirds of a three-session streak before
      // the case has done anything.
      const member = f.a.mod.memberId;

      await tx.asOwner();
      const [rule] = await tx.q<{ id: string; required_count: number }>(
        `select id, required_count from public.streak_rules where org_id = $1 and enabled limit 1`,
        [f.a.id],
      );
      expect(rule.required_count).toBe(3);

      // One workshop, three days, all attended — and arrived_at defaults to
      // now(), so every row lands in the org's current month.
      const workshop = await makeDays(tx, f.a, { days: 3, offsetDays: 10 });
      for (const dayId of workshop.dayIds) await attend(tx, f.a, workshop.sessionId, dayId, member);

      await tx.asServiceRole();
      await tx.q(`select public.evaluate_streaks()`);
      await tx.asOwner();
      let awards = await tx.q(`select id from public.streak_awards where member_id = $1 and rule_id = $2`, [member, rule.id]);
      expect(awards).toEqual([]); // one session attended, not three

      // Two more one-day sessions, far enough apart that REQ-CHK-013's overlap
      // exclusion has nothing to say about them.
      for (const offset of [20, 30]) {
        const one = await makeDays(tx, f.a, { days: 1, offsetDays: offset });
        await attend(tx, f.a, one.sessionId, one.dayIds[0], member);
      }

      await tx.asServiceRole();
      await tx.q(`select public.evaluate_streaks()`);
      await tx.asOwner();
      awards = await tx.q(`select id from public.streak_awards where member_id = $1 and rule_id = $2`, [member, rule.id]);
      expect(awards).toHaveLength(1); // three distinct sessions
    });
  });
});

describe("RPC-evaluate_badges.counts_sessions_not_check_ins", () => {
  it("★ the check_ins_count metric counts distinct sessions", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.mod.memberId; // see the streak case — members[1] starts with two
      // A badge wanting two sessions attended. `first_check_in` (gte 1) is
      // already seeded and would be met by a single day, so this needs its own.
      await tx.asOwner();
      const [badge] = await tx.q<{ id: string }>(
        `insert into public.badges (org_id, key, name, description, rule)
         values ($1, 'two_sessions', 'جلستان', 'حضور جلستين', $2::jsonb) returning id`,
        [f.a.id, JSON.stringify({ metric: "check_ins_count", gte: 2 })],
      );

      const workshop = await makeDays(tx, f.a, { days: 3, offsetDays: 10 });
      for (const dayId of workshop.dayIds) await attend(tx, f.a, workshop.sessionId, dayId, member);

      await tx.asServiceRole();
      await tx.q(`select public.evaluate_badges()`);
      await tx.asOwner();
      let held = await tx.q(`select id from public.member_badges where member_id = $1 and badge_id = $2`, [member, badge.id]);
      expect(held).toEqual([]); // three check-ins, one session

      const second = await makeDays(tx, f.a, { days: 1, offsetDays: 20 });
      await attend(tx, f.a, second.sessionId, second.dayIds[0], member);

      await tx.asServiceRole();
      await tx.q(`select public.evaluate_badges()`);
      await tx.asOwner();
      held = await tx.q(`select id from public.member_badges where member_id = $1 and badge_id = $2`, [member, badge.id]);
      expect(held).toHaveLength(1);
    });
  });
});

describe("RPC-evaluate_company_points.counts_members_not_check_ins", () => {
  it("★ a company's attendance share counts distinct members, and a removed check-in does not count at all", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, { days: 3, offsetDays: 10 });

      const ids: string[] = [];
      for (const dayId of dayIds) ids.push(await attend(tx, f.a, sessionId, dayId, member));

      await tx.asServiceRole();
      await tx.q(`select public.evaluate_company_points($1)`, [sessionId]);

      await tx.asOwner();
      const [row] = await tx.q<{ meta: { attended: number; active_members: number } }>(
        `select meta from public.company_points_ledger where session_id = $1 and rule_key = 'company_attendance_pct'`,
        [sessionId],
      );
      // ONE member attended, however many days they came to. Before this fix
      // `count(*)` said three, and a three-day workshop tripled every
      // company's share of its own roster.
      expect(row.meta.attended).toBe(1);
      expect(row.meta.active_members).toBeGreaterThanOrEqual(1);

      // Named difference 2: a retracted check-in is no attendance. 0088 fixed
      // seven readers for DEC-141 and missed this one.
      const second = await makeDays(tx, f.a, { days: 1, offsetDays: 40 });
      await attend(tx, f.a, second.sessionId, second.dayIds[0], member);
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where session_id = $1`, [second.sessionId, f.a.admin.memberId]);

      await tx.asServiceRole();
      await tx.q(`select public.evaluate_company_points($1)`, [second.sessionId]);
      await tx.asOwner();
      const removedRows = await tx.q(
        `select id from public.company_points_ledger where session_id = $1 and rule_key = 'company_attendance_pct'`,
        [second.sessionId],
      );
      expect(removedRows).toEqual([]);
      expect(ids).toHaveLength(3);
    });
  });
});

describe("JOB-award_presenter_points.one_bonus_per_qualifying_attendee", () => {
  it("★ the EXACT query worker/src/tasks/award_presenter_points.ts runs: one bonus per attendee, not one per day", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const presenter = f.a.members[0].memberId;
      const attendee = f.a.members[1].memberId;
      const partial = f.a.mod.memberId;
      const { sessionId, dayIds } = await makeDays(tx, f.a, { days: 3, offsetDays: 10 });

      // One attendee comes to all three days; another comes to one.
      const ids: string[] = [];
      for (const dayId of dayIds) ids.push(await attend(tx, f.a, sessionId, dayId, attendee));
      await attend(tx, f.a, sessionId, dayIds[0], partial);

      // ★ Run the task's own SQL verbatim — nothing else executes it, and a
      // task whose query has never run is a task nobody has tested.
      //
      // As the OWNER, not service_role: `check_ins` is revoked from every
      // client role including service_role (0010), and the worker connects on
      // its own DATABASE_URL as the owner. award-presenter-points.test.ts:188
      // already splits it this way for the same reason — the owner for the
      // table read, service_role for the definer-only award.
      await tx.asOwner();
      const rows = await tx.q<{ epoch_check_in: string }>(
        `select distinct public.attendance_epoch_check_in($1, c.member_id) as epoch_check_in
           from public.check_ins c
          where c.session_id = $1
            and c.removed_at is null
            and public.session_attendance_complete($1, c.member_id)`,
        [sessionId],
      );

      // ONE row, for the one member who actually attended the session — not
      // three for the three days they came to, and not one for the member who
      // came to a third of it.
      expect(rows).toHaveLength(1);
      // …and it is the same check-in the attendee's OWN award is keyed to, so
      // attendance_removed() reverses the pair together.
      expect(rows[0].epoch_check_in).toBe(ids[2]);

      await tx.asServiceRole();
      for (const { epoch_check_in } of rows) {
        await tx.q(`select public.award_points('attendee_bonus', $1, 'attendee_bonus', $2, $3)`, [presenter, epoch_check_in, sessionId]);
      }
      await tx.asOwner();
      const bonuses = await tx.q<{ amount: number }>(
        `select amount from public.points_ledger where member_id = $1 and session_id = $2 and rule_key = 'attendee_bonus'`,
        [presenter, sessionId],
      );
      expect(bonuses).toHaveLength(1); // before this, three days paid three bonuses for one attendee
      expect(partial).not.toBe(attendee);
    });
  });
});
