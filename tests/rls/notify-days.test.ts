// notify (wave 9) — supabase/proposed/notify/02_reminders_per_day.sql.
//
// 03 §8.2 rows proven here:
//   RPC-schedule_session_reminders.per_day · .offset_after_previous_day ·
//   RPC-cancel_unlisted_reminders.sweeps · RPC-cancel_member_reminders.every_day ·
//   RPC-send_reminder_notification.day_scoped
//
// ★ The first case is the one that matters: with this file applied, a ONE-day
// session holds exactly the three keys `tests/rls/notify-reminders.test.ts`
// pins by string equality. That file is `main`'s evidence and is not edited
// (rule 4); this one repeats its assertion against the new function so
// promotion cannot surprise anyone.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const OFFSETS = [10080, 1440, 120];
const PROPOSED = ["notify/02_reminders_per_day.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  for (const table of ["notifications", "notification_preferences"]) await tx.q(`delete from public.${table}`);
  return f;
}

/** A published session far enough out that all three default offsets are in
 *  the future, and `days` days long with `gapHours` between each meeting's end
 *  and the next one's start. `hours` is the first day's length. */
async function workshop(
  tx: Tx,
  org: { id: string; categoryId: string; venueId: string },
  opts: { startInDays?: number; days?: number; gapHours?: number; hours?: number } = {},
) {
  const { startInDays = 30, days = 1, gapHours = 22, hours = 2 } = opts;
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at)
     values ($1, 'ورشة', 'ملخص', $2, 'introductory',
             now() + ($4 || ' days')::interval, $5 * 60, now() + ($4 || ' days')::interval + ($5 || ' hours')::interval,
             $3, 30, 'published', now())
     returning id`,
    [org.id, org.categoryId, org.venueId, String(startInDays), String(hours)],
  );
  // `0100`'s shim already made day one from the session's own window. Further
  // days are inserted directly; `position` is derived, so it is never written.
  for (let n = 2; n <= days; n += 1) {
    const offsetHours = (n - 1) * (hours + gapHours);
    await tx.q(
      `insert into public.session_days (org_id, session_id, starts_at, ends_at, venue_id)
       values ($1, $2,
               (select starts_at from public.sessions where id = $2) + ($3 || ' hours')::interval,
               (select starts_at from public.sessions where id = $2) + ($3 || ' hours')::interval + ($4 || ' hours')::interval,
               $5)`,
      [org.id, row.id, String(offsetHours), String(hours), org.venueId],
    );
  }
  return row.id;
}

const dayIds = (tx: Tx, session: string) =>
  tx.q<{ id: string; position: number }>(`select id, position from public.session_days where session_id = $1 order by position`, [session]);

const keys = async (tx: Tx, session: string) =>
  (await tx.q<{ key: string }>(`select key from graphile_worker.jobs where key like $1 order by key`, [`remind:${session}:%`])).map((r) => r.key);

const reserve = (tx: Tx, org: string, session: string, member: string, status = "confirmed") =>
  tx.q(
    `insert into public.rsvps (org_id, session_id, member_id, status, reserved_at, waitlist_position)
     values ($1, $2, $3, $4::public.rsvp_status, now(), case when $4 = 'waitlisted' then 1 end)`,
    [org, session, member, status],
  );

describe("RPC-schedule_session_reminders.per_day", () => {
  it("★ a ONE-day session holds exactly the three keys it holds on main — no suffix anywhere", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a);
      const member = f.a.members[0].memberId;
      await reserve(tx, f.a.id, session, member);

      expect(await keys(tx, session)).toEqual(OFFSETS.map((o) => `remind:${session}:${o}:${member}`).sort());
    });
  });

  it("three MONTHLY meetings get all three offsets each time — every moment is after the previous day ended", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      // 30 days apart, so even the 7-day reminder for day 3 lands three weeks
      // after day 2 finished.
      const session = await workshop(tx, f.a, { days: 3, gapHours: 30 * 24 - 2 });
      const member = f.a.members[0].memberId;
      await reserve(tx, f.a.id, session, member);

      const got = await keys(tx, session);
      expect(got).toHaveLength(9);
      for (const position of [1, 2, 3]) {
        for (const offset of OFFSETS) {
          const suffix = position === 1 ? "" : `:${position}`;
          expect(got).toContain(`remind:${session}:${offset}:${member}${suffix}`);
        }
      }
    });
  });

  it("★ three CONSECUTIVE evenings get the 2-hour reminder each day, and the 1-day and 7-day once", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      // 2-hour meetings, 22 hours apart: the next day's start is 24 hours on.
      const session = await workshop(tx, f.a, { days: 3, gapHours: 22, hours: 2 });
      const member = f.a.members[0].memberId;
      await reserve(tx, f.a.id, session, member);

      // Day 2's 1-day moment is day 1's own start, which is before day 1 ends;
      // day 2's 7-day moment is a week before that. Both are suppressed, and
      // so are day 3's — 08 §4.2's restraint, as arithmetic rather than a list.
      expect(await keys(tx, session)).toEqual(
        [
          `remind:${session}:10080:${member}`,
          `remind:${session}:1440:${member}`,
          `remind:${session}:120:${member}`,
          `remind:${session}:120:${member}:2`,
          `remind:${session}:120:${member}:3`,
        ].sort(),
      );
    });
  });
});

describe("RPC-cancel_unlisted_reminders.sweeps", () => {
  it("a day removed from the session takes its reminders with it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, { days: 3, gapHours: 30 * 24 - 2 });
      const member = f.a.members[0].memberId;
      await reserve(tx, f.a.id, session, member);
      expect(await keys(tx, session)).toHaveLength(9);

      const days = await dayIds(tx, session);
      await tx.q(`delete from public.session_days where id = $1`, [days[2].id]);
      await tx.q(`select public.schedule_session_reminders($1::uuid)`, [session]);

      // Six left, and NOTHING under position 3 — the sweep is what makes a key
      // set able to shrink; the old body could only ever add.
      const got = await keys(tx, session);
      expect(got).toHaveLength(6);
      expect(got.filter((k) => k.endsWith(":3"))).toEqual([]);
    });
  });

  it("an offset the org drops is swept, including one carried under a position", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, { days: 2, gapHours: 30 * 24 - 2 });
      const member = f.a.members[0].memberId;
      await reserve(tx, f.a.id, session, member);
      expect(await keys(tx, session)).toHaveLength(6);

      await tx.q(`update public.org_settings set reminder_offsets_minutes = '{2880}' where org_id = $1`, [f.a.id]);

      expect(await keys(tx, session)).toEqual([`remind:${session}:2880:${member}`, `remind:${session}:2880:${member}:2`].sort());
    });
  });

  it("cancelling the seat leaves nothing behind, at any number of days", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, { days: 3, gapHours: 30 * 24 - 2 });
      const member = f.a.members[0].memberId;
      await reserve(tx, f.a.id, session, member);
      expect(await keys(tx, session)).toHaveLength(9);

      await tx.q(`update public.rsvps set status = 'cancelled', cancelled_at = now() where session_id = $1 and member_id = $2`, [
        session,
        member,
      ]);
      expect(await keys(tx, session)).toEqual([]);
    });
  });

  it("definer_only — no client role may sweep a session's queue", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.cancel_unlisted_reminders($1::uuid, '{}'::text[])`, [f.m2.a.published]))).toBe(
        PERMISSION_DENIED,
      );
    });
  });
});

describe("RPC-cancel_member_reminders.every_day", () => {
  it("removes a member's keys under every offset and every position, and leaves another member's", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, { days: 2, gapHours: 30 * 24 - 2 });
      const mine = f.a.members[0].memberId;
      const theirs = f.a.members[1].memberId;
      await reserve(tx, f.a.id, session, mine);
      await reserve(tx, f.a.id, session, theirs);
      expect(await keys(tx, session)).toHaveLength(12);

      await tx.asServiceRole();
      await tx.q(`select public.cancel_member_reminders($1::uuid, $2::uuid)`, [session, mine]);

      await tx.asOwner();
      const left = await keys(tx, session);
      expect(left).toHaveLength(6);
      expect(left.every((k) => k.includes(theirs))).toBe(true);
    });
  });
});

describe("RPC-send_reminder_notification.day_scoped", () => {
  it("names the DAY's moment, the DAY's place, and its position in the set", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, { days: 3, gapHours: 30 * 24 - 2 });
      const member = f.a.members[0].memberId;
      await reserve(tx, f.a.id, session, member);
      const days = await dayIds(tx, session);

      await tx.asServiceRole();
      const [{ sent }] = await tx.q<{ sent: boolean }>(`select public.send_reminder_notification($1::uuid, $2::uuid, 120, $3::uuid) as sent`, [
        session,
        member,
        days[1].id,
      ]);
      expect(sent).toBe(true);

      await tx.asOwner();
      // ★ NOT `order by created_at desc`: that column defaults to the
      // TRANSACTION's start and is identical for every row a rolled-back test
      // writes, so the reservation's own notice would win (`ad43ddb`). The key
      // is what this case is about, so the key is what it selects on.
      const [row] = await tx.q<{ key: string; payload: { startsAt: string; venue: string; dayPosition: number; dayCount: number } }>(
        `select key, payload from public.notifications where member_id = $1 and key like 'MSG-reminder%'`,
        [member],
      );
      const [day2] = await tx.q<{ starts_at: Date }>(`select starts_at from public.session_days where id = $1`, [days[1].id]);
      expect(row.key).toBe("MSG-reminder_2h");
      expect(new Date(row.payload.startsAt).getTime()).toBe(new Date(day2.starts_at).getTime());
      expect(row.payload.dayPosition).toBe(2);
      expect(row.payload.dayCount).toBe(3);
      // `08` §3.2's reminder templates have always printed «المكان: {{venue}}»
      // against a payload that carried no venue at all.
      expect(row.payload.venue).toBeTruthy();
    });
  });

  it("★ three arguments — main's call — resolve to the FIRST day", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, { days: 2, gapHours: 30 * 24 - 2 });
      const member = f.a.members[0].memberId;
      await reserve(tx, f.a.id, session, member);

      await tx.asServiceRole();
      await tx.q(`select public.send_reminder_notification($1, $2, 120)`, [session, member]);

      await tx.asOwner();
      const [row] = await tx.q<{ payload: { startsAt: string; dayPosition: number } }>(
        `select payload from public.notifications where member_id = $1 and key like 'MSG-reminder%'`,
        [member],
      );
      const [s] = await tx.q<{ starts_at: Date }>(`select starts_at from public.sessions where id = $1`, [session]);
      expect(row.payload.dayPosition).toBe(1);
      // Contract 1: the session's stored start IS the first day's.
      expect(new Date(row.payload.startsAt).getTime()).toBe(new Date(s.starts_at).getTime());
    });
  });

  it("a reminder for a day that has been deleted sends NOTHING — it never falls back to day one", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, { days: 2, gapHours: 30 * 24 - 2 });
      const member = f.a.members[0].memberId;
      await reserve(tx, f.a.id, session, member);
      const days = await dayIds(tx, session);
      await tx.q(`delete from public.session_days where id = $1`, [days[1].id]);
      await tx.q(`delete from public.notifications`);

      await tx.asServiceRole();
      const [{ sent }] = await tx.q<{ sent: boolean }>(`select public.send_reminder_notification($1::uuid, $2::uuid, 120, $3::uuid) as sent`, [
        session,
        member,
        days[1].id,
      ]);
      expect(sent).toBe(false);

      await tx.asOwner();
      expect(await tx.q(`select id from public.notifications where member_id = $1`, [member])).toHaveLength(0);
    });
  });
});

describe("the nudge and the rating prompt stay ONCE per session", () => {
  it("a three-day workshop has one nudge key, at the FIRST day minus seven days", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, { days: 3, gapHours: 30 * 24 - 2 });
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);

      const nudges = await tx.q<{ key: string; run_at: Date }>(`select key, run_at from graphile_worker.jobs where key like $1`, [
        `nudge:${session}%`,
      ]);
      expect(nudges.map((n) => n.key)).toEqual([`nudge:${session}`]);

      const [s] = await tx.q<{ starts_at: Date }>(`select starts_at from public.sessions where id = $1`, [session]);
      const expected = new Date(new Date(s.starts_at).getTime() - 7 * 24 * 60 * 60_000);
      expect(Math.abs(new Date(nudges[0].run_at).getTime() - expected.getTime())).toBeLessThan(1000);
    });
  });
});
