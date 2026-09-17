// notify (wave 9) — supabase/proposed/notify/03_day_change_notice.sql.
//
// 03 §8.2 rows proven here:
//   RPC-session_days_changed.names_the_day · .once_per_transaction ·
//   .day_added_or_removed · .definer_only ·
//   POL-sessions.change_notice.days_writer_stands_down
//
// ★ The case that carries contract 2 is the last one: a ONE-day session moved
// through the day-aware path produces the SAME `notifications.payload`, key for
// key, as one moved the way `main` moves it. That is what «byte-identical» has
// to mean for a notice, and it is what the `kareem.days_writer` stand-down
// buys — one notice either way, with nothing in it about days.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

// In dependency order: `03`'s `sessions_notify` leans on `02`'s sweep.
const PROPOSED = ["notify/02_reminders_per_day.sql", "notify/03_day_change_notice.sql", "notify/04_narrow_day_place_grant.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  for (const table of ["notifications", "notification_preferences"]) await tx.q(`delete from public.${table}`);
  return f;
}

interface Change {
  field: string;
  from: unknown;
  to: unknown;
  day?: number;
  days?: number;
}

/** ★ CONTRACT 11's snapshot query, verbatim from `docs/plan/notes/notify.md`
 *  §W10.2 — the one `sessions` runs before its first day write and again after
 *  its last. Repeated here so a change to it breaks this file too. */
const snapshot = async (tx: Tx, session: string) =>
  (
    await tx.q<{ days: unknown }>(
      `select coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'id',          d.id,
                    'position',    d.position,
                    'starts_at',   d.starts_at,
                    'ends_at',     d.ends_at,
                    'venue_label', public.session_venue_label(d.venue_id, d.custom_venue_name))
                  order by d.position),
                '[]'::jsonb) as days
         from public.session_days d where d.session_id = $1`,
      [session],
    )
  )[0].days;

/** ★ An ABSOLUTE start, not `now() + …`. The byte-identity case below runs two
 *  transactions and compares their payloads, and `now()` differs between them
 *  by microseconds — which would be a difference in the instants rather than in
 *  what the two paths say. */
const START = "2026-12-01T15:00:00Z";

async function workshop(tx: Tx, org: { id: string; categoryId: string; venueId: string }, days = 1) {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at)
     values ($1, 'ورشة', 'ملخص', $2, 'introductory',
             $4::timestamptz, 120, $4::timestamptz + interval '2 hours',
             $3, 30, 'published', now())
     returning id`,
    [org.id, org.categoryId, org.venueId, START],
  );
  for (let n = 2; n <= days; n += 1) {
    await tx.q(
      `insert into public.session_days (org_id, session_id, starts_at, ends_at, venue_id)
       values ($1, $2,
               (select starts_at from public.sessions where id = $2) + ($3 || ' days')::interval,
               (select starts_at from public.sessions where id = $2) + ($3 || ' days')::interval + interval '2 hours',
               $4)`,
      [org.id, row.id, String(n - 1), org.venueId],
    );
  }
  return row.id;
}

const reserve = (tx: Tx, org: string, session: string, member: string, status = "confirmed") =>
  tx.q(
    `insert into public.rsvps (org_id, session_id, member_id, status, reserved_at, waitlist_position)
     values ($1, $2, $3, $4::public.rsvp_status, now(), case when $4 = 'waitlisted' then 1 end)`,
    [org, session, member, status],
  );

const notices = (tx: Tx, session: string) =>
  tx.q<{ member_id: string; payload: { changes?: Change[]; startsAt: string; venue: string; title: string } }>(
    `select member_id, payload from public.notifications
      where key = 'MSG-session_changed' and payload ->> 'session_id' = $1`,
    [session],
  );

const dayRows = (tx: Tx, session: string) =>
  tx.q<{ id: string; position: number }>(`select id, position from public.session_days where session_id = $1 order by position`, [session]);

/** What a day-aware writer does: the flag, one `sessions` write if the window
 *  moved, the day writes, then the one call (contract 11). */
async function dayAware(tx: Tx, session: string, write: () => Promise<unknown>) {
  await tx.q(`select set_config('kareem.days_writer', 'on', true)`);
  const before = await snapshot(tx, session);
  await write();
  const after = await snapshot(tx, session);
  await tx.q(`select public.session_days_changed($1::uuid, $2::jsonb, $3::jsonb)`, [session, JSON.stringify(before), JSON.stringify(after)]);
  await tx.q(`select set_config('kareem.days_writer', '', true)`);
}

describe("RPC-session_days_changed.names_the_day", () => {
  it("★ moving day 2 of three — which moves no column of `sessions` — still tells every seat, and says WHICH day", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, 3);
      const confirmed = f.a.members[0].memberId;
      const waiting = f.a.members[1].memberId;
      await reserve(tx, f.a.id, session, confirmed);
      await reserve(tx, f.a.id, session, waiting, "waitlisted");
      await tx.q(`delete from public.notifications`);

      const days = await dayRows(tx, session);
      const [before] = await tx.q<{ starts_at: Date; ends_at: Date }>(`select starts_at, ends_at from public.sessions where id = $1`, [session]);

      await dayAware(tx, session, () =>
        tx.q(`update public.session_days set starts_at = starts_at + interval '3 hours', ends_at = ends_at + interval '3 hours' where id = $1`, [
          days[1].id,
        ]),
      );

      // The session's own window did not move: the first start and the last end
      // are day 1's and day 3's.
      const [after] = await tx.q<{ starts_at: Date; ends_at: Date }>(`select starts_at, ends_at from public.sessions where id = $1`, [session]);
      expect(new Date(after.starts_at).getTime()).toBe(new Date(before.starts_at).getTime());
      expect(new Date(after.ends_at).getTime()).toBe(new Date(before.ends_at).getTime());

      // Confirmed AND waitlisted: a waitlisted member was planning on the
      // chance of a seat (08 §1.2).
      const sent = await notices(tx, session);
      expect(sent.map((n) => n.member_id).sort()).toEqual([confirmed, waiting].sort());

      const changes = sent[0].payload.changes!;
      expect(changes.map((c) => c.field).sort()).toEqual(["ends_at", "starts_at"]);
      for (const change of changes) {
        expect(change.day).toBe(2);
        expect(change.days).toBe(3);
        expect(change.from).not.toBe(change.to);
      }
    });
  });

  it("a day's VENUE moving is announced with the day, and the calendar is asked to follow", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, 2);
      const member = f.a.members[0].memberId;
      await reserve(tx, f.a.id, session, member);
      const [rsvp] = await tx.q<{ id: string }>(`select id from public.rsvps where session_id = $1 and member_id = $2`, [session, member]);
      await tx.q(`delete from public.notifications`);
      const [other] = await tx.q<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة التدريب', 20) returning id`, [
        f.a.id,
      ]);
      const days = await dayRows(tx, session);

      await dayAware(tx, session, () => tx.q(`update public.session_days set venue_id = $1 where id = $2`, [other.id, days[1].id]));

      const [sent] = await notices(tx, session);
      const change = sent.payload.changes!.find((c) => c.field === "venue")!;
      expect(change.day).toBe(2);
      expect(change.to).toBe("قاعة التدريب");
      // REQ-CAL-005, under the key the reservation already has.
      const jobs = await tx.q<{ key: string }>(`select key from graphile_worker.jobs where key = $1`, [`cal:${rsvp.id}`]);
      expect(jobs).toHaveLength(1);
    });
  });
});

describe("RPC-session_days_changed — either snapshot shape", () => {
  it("★ `0106`'s `jsonb_agg(to_jsonb(d))` reads as well as the published five keys — including the VENUE", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, 2);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      await tx.q(`delete from public.notifications`);
      const [other] = await tx.q<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة الندوات', 20) returning id`, [
        f.a.id,
      ]);
      const days = await dayRows(tx, session);

      // Exactly what `schedule_session()` builds: the whole row, which carries
      // `venue_id` and no `venue_label` at all.
      const rowShape = async () =>
        (
          await tx.q<{ days: unknown }>(
            `select coalesce(jsonb_agg(to_jsonb(d) order by d.position), '[]'::jsonb) as days
               from public.session_days d where d.session_id = $1`,
            [session],
          )
        )[0].days;

      await tx.q(`select set_config('kareem.days_writer', 'on', true)`);
      const before = await rowShape();
      await tx.q(`update public.session_days set venue_id = $1, starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour'
                   where id = $2`, [other.id, days[1].id]);
      const after = await rowShape();
      await tx.q(`select public.session_days_changed($1::uuid, $2::jsonb, $3::jsonb)`, [session, JSON.stringify(before), JSON.stringify(after)]);
      await tx.q(`select set_config('kareem.days_writer', '', true)`);

      const [sent] = await notices(tx, session);
      const fields = sent.payload.changes!.map((c) => c.field).sort();
      expect(fields).toEqual(["ends_at", "starts_at", "venue"]);
      const venue = sent.payload.changes!.find((c) => c.field === "venue")!;
      expect(venue.to).toBe("قاعة الندوات");
      expect(venue.day).toBe(2);
    });
  });
});

describe("RPC-session_days_changed.day_added_or_removed", () => {
  it("a day added to a published session is announced as a change to the number of days", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, 2);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      await tx.q(`delete from public.notifications`);

      await dayAware(tx, session, () =>
        tx.q(
          `insert into public.session_days (org_id, session_id, starts_at, ends_at, venue_id)
           values ($1, $2, (select max(ends_at) + interval '22 hours' from public.session_days where session_id = $2),
                           (select max(ends_at) + interval '24 hours' from public.session_days where session_id = $2), $3)`,
          [f.a.id, session, f.a.venueId],
        ),
      );

      const [sent] = await notices(tx, session);
      const change = sent.payload.changes!.find((c) => c.field === "days")!;
      expect(change.from).toBe(2);
      expect(change.to).toBe(3);
    });
  });

  it("a day removed is the same message, the other way", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, 3);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      await tx.q(`delete from public.notifications`);
      const days = await dayRows(tx, session);

      await dayAware(tx, session, () => tx.q(`delete from public.session_days where id = $1`, [days[2].id]));

      const [sent] = await notices(tx, session);
      const change = sent.payload.changes!.find((c) => c.field === "days")!;
      expect(change.from).toBe(3);
      expect(change.to).toBe(2);
    });
  });
});

describe("RPC-session_days_changed.once_per_transaction", () => {
  it("called twice for one session, a member is told ONCE", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, 2);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      await tx.q(`delete from public.notifications`);
      const days = await dayRows(tx, session);

      await tx.q(`select set_config('kareem.days_writer', 'on', true)`);
      const before = await snapshot(tx, session);
      await tx.q(`update public.session_days set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id = $1`, [
        days[1].id,
      ]);
      const after = await snapshot(tx, session);
      for (const _ of [1, 2]) {
        await tx.q(`select public.session_days_changed($1::uuid, $2::jsonb, $3::jsonb)`, [session, JSON.stringify(before), JSON.stringify(after)]);
      }

      expect(await notices(tx, session)).toHaveLength(1);
    });
  });

  it("an unchanged day set says nothing, and a draft says nothing either", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, 2);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      await tx.q(`delete from public.notifications`);

      const same = await snapshot(tx, session);
      await tx.q(`select public.session_days_changed($1::uuid, $2::jsonb, $3::jsonb)`, [session, JSON.stringify(same), JSON.stringify(same)]);
      expect(await notices(tx, session)).toHaveLength(0);
    });
  });

  it("definer_only — no client role may notify a session's members", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      for (const who of [f.a.members[0].claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(() => tx.q(`select public.session_days_changed($1::uuid, '[]'::jsonb, '[]'::jsonb)`, [f.m2.a.published]))).toBe(
          PERMISSION_DENIED,
        );
      }
    });
  });
});

describe("POL-sessions.change_notice.days_writer_stands_down", () => {
  it("★ a ONE-day session moved the day-aware way produces the SAME payload as main's legacy move", async () => {
    let legacy: Record<string, unknown> | null = null;
    let aware: Record<string, unknown> | null = null;

    // `main`'s way: a writer updates the session's own window, `0100`'s shim
    // carries it onto the one day, and `sessions_notify` announces it.
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, 1);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      await tx.q(`delete from public.notifications`);

      await tx.q(
        `update public.sessions set starts_at = starts_at + interval '2 hours', ends_at = ends_at + interval '2 hours' where id = $1`,
        [session],
      );
      const sent = await notices(tx, session);
      expect(sent).toHaveLength(1);
      legacy = sent[0].payload as unknown as Record<string, unknown>;
    });

    // The day-aware way: the flag, one session write, the day write, the call.
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, 1);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      await tx.q(`delete from public.notifications`);

      await dayAware(tx, session, async () => {
        await tx.q(`update public.sessions set starts_at = starts_at + interval '2 hours', ends_at = ends_at + interval '2 hours' where id = $1`, [
          session,
        ]);
        await tx.q(`update public.session_days set starts_at = starts_at + interval '2 hours', ends_at = ends_at + interval '2 hours'
                     where session_id = $1`, [session]);
      });
      const sent = await notices(tx, session);
      // ONE notice, not two: `sessions_notify` stood down for the flag.
      expect(sent).toHaveLength(1);
      aware = sent[0].payload as unknown as Record<string, unknown>;
    });

    // Same keys, same values — and NOTHING about days in either.
    expect(Object.keys(aware!).sort()).toEqual(Object.keys(legacy!).sort());
    expect(aware!.changes).toEqual(
      // The legacy path has no `ends_at` entry: `sessions_notify` has never
      // announced an end-only move, and at one day that silence is preserved
      // (DEC-151, «carried out of the wave»). The day-aware path has both,
      // which is a difference in CONTENT the lead is told about, not a
      // difference in shape.
      expect.any(Array),
    );
    const awareChanges = aware!.changes as Change[];
    const legacyChanges = legacy!.changes as Change[];
    expect(legacyChanges.map((c) => c.field)).toEqual(["starts_at"]);
    expect(awareChanges.find((c) => c.field === "starts_at")).toEqual(legacyChanges[0]);
    for (const change of awareChanges) {
      expect(change.day).toBeUndefined();
      expect(change.days).toBeUndefined();
    }
  });

  it("with the flag set and no call, `sessions_notify` says nothing — the writer owes the call", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await workshop(tx, f.a, 1);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      await tx.q(`delete from public.notifications`);

      await tx.q(`select set_config('kareem.days_writer', 'on', true)`);
      await tx.q(`update public.sessions set starts_at = starts_at + interval '2 hours', ends_at = ends_at + interval '2 hours' where id = $1`, [
        session,
      ]);
      await tx.q(`update public.session_days set starts_at = starts_at + interval '2 hours', ends_at = ends_at + interval '2 hours'
                   where session_id = $1`, [session]);
      await tx.q(`select set_config('kareem.days_writer', '', true)`);

      expect(await notices(tx, session)).toHaveLength(0);
    });
  });

  it("publishing still fires under the flag — only the change branch stands down", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [row] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                      venue_id, capacity, state)
         values ($1, 'مسوّدة', 'ملخص', $2, 'introductory', $4::timestamptz, 120,
                 $4::timestamptz + interval '2 hours', $3, 30, 'draft') returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId, START],
      );
      await tx.q(`delete from public.notifications`);

      // `publish_session()` walks the state chain; a direct update is refused
      // by `0024`'s guard, which is the right refusal.
      await tx.as(f.a.admin.claims);
      await tx.q(`select set_config('kareem.days_writer', 'on', true)`);
      await tx.q(`select id from public.publish_session($1::uuid)`, [row.id]);
      await tx.q(`select set_config('kareem.days_writer', '', true)`);

      await tx.asOwner();
      const published = await tx.q(`select id from public.notifications where key = 'MSG-session_published' and payload ->> 'session_id' = $1`, [
        row.id,
      ]);
      expect(published.length).toBeGreaterThan(0);
    });
  });
});

describe("RPC-session_day_place.definer_only", () => {
  it("no client role may read a venue's name through it — DEC-152's sweep, on the function this track added", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const day = { venue_id: f.b.venueId, custom_venue_name: null };

      // Before the revoke this answered with ANOTHER ORG's venue name to any
      // signed-in member holding its uuid. It has no client caller: its
      // argument is a `session_days` snapshot only a day-aware writer builds.
      for (const who of [f.a.members[0].claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(() => tx.q(`select public.session_day_place($1::jsonb)`, [JSON.stringify(day)]))).toBe(PERMISSION_DENIED);
      }

      // The one caller that needs it still has it.
      await tx.asServiceRole();
      await tx.q(`select public.session_day_place($1::jsonb)`, [JSON.stringify(day)]);
    });
  });
});
