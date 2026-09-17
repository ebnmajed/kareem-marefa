// notify (wave 9) — supabase/proposed/notify/01_calendar_per_day.sql.
//
// 03 §8.2 rows proven here:
//   RPC-record_calendar_sync.per_day · RPC-record_calendar_sync.legacy_call_gets_first_day ·
//   RPC-calendar_sync_target.days_and_orphans · RPC-record_calendar_event_removed.worker_only ·
//   RPC-resync_calendars.definer_only
//
// The two that carry the wave: `legacy_call_gets_first_day`, because `main`'s
// worker keeps sending six arguments between the owner's push and the Railway
// redeploy and must keep writing the row it already wrote; and
// `days_and_orphans`, because a day deleted from a session leaves a provider
// event in a member's calendar that only this row still knows the id of.
//
// A NEW file, not an edit of `calendar-sync.test.ts` — rule 4: the suites that
// exist are the evidence that a one-day session did not move.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const PROPOSED = ["notify/01_calendar_per_day.sql"];

/** A file the lead has promoted no longer exists under `supabase/proposed/`,
 *  and in a shared tree that promotion lands mid-session — so the filesystem
 *  decides which of these still need applying. */
async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  await tx.q(`delete from public.calendar_events`);
  return f;
}

interface Day {
  id: string;
  position: number;
}

/** The days of a session, in position order. */
const days = (tx: Tx, session: string) =>
  tx.q<Day>(`select id, position from public.session_days where session_id = $1 order by position`, [session]);

/** A further day, two hours long, `hours` from now. `position` is derived —
 *  `0100`'s BEFORE INSERT default ranks it and the AFTER trigger renumbers —
 *  so it is never written here (contract 1). */
async function addDay(tx: Tx, org: string, session: string, hours: number) {
  const [row] = await tx.q<Day>(
    `insert into public.session_days (org_id, session_id, starts_at, ends_at, venue_id)
     values ($1, $2, now() + make_interval(hours => $3::int), now() + make_interval(hours => $3::int + 2),
             (select venue_id from public.sessions where id = $2))
     returning id, position`,
    [org, session, hours],
  );
  return row;
}

const rsvpOf = async (tx: Tx, session: string) =>
  (await tx.q<{ id: string; member_id: string }>(`select id, member_id from public.rsvps where session_id = $1 limit 1`, [session]))[0];

/** Exactly the call `main`'s worker makes — six positional arguments, no day. */
const legacySync = (tx: Tx, org: string, member: string, session: string, eventId: string | null) =>
  tx.q(`select public.record_calendar_sync($1::uuid, $2::uuid, $3::uuid, 'synced'::public.calendar_sync_state, $4::text, null)`, [
    org,
    member,
    session,
    eventId,
  ]);

const syncDay = (tx: Tx, org: string, member: string, session: string, day: string, eventId: string) =>
  tx.q(`select public.record_calendar_sync($1::uuid, $2::uuid, $3::uuid, 'synced'::public.calendar_sync_state, $4::text, null, $5::uuid)`, [
    org,
    member,
    session,
    eventId,
    day,
  ]);

const target = async (tx: Tx, rsvp: string) =>
  (
    await tx.q<{
      target: {
        provider_event_id: string | null;
        session: { starts_at: string; ends_at: string };
        days: Array<{ day_id: string; position: number; starts_at: string; ends_at: string; provider_event_id: string | null; state: string | null }>;
        orphans: Array<{ calendar_event_id: string; provider_event_id: string }>;
      };
    }>(`select public.calendar_sync_target($1::uuid) as target`, [rsvp])
  )[0].target;

const rows = (tx: Tx) =>
  tx.q<{ id: string; session_day_id: string | null; provider_event_id: string | null; state: string }>(
    `select id, session_day_id, provider_event_id, state from public.calendar_events order by created_at, id`,
  );

describe("RPC-record_calendar_sync", () => {
  it("per_day — one row per member per DAY, and a second day is a second row rather than a conflict", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const session = f.m2.a.published;
      const rsvp = await rsvpOf(tx, session);
      await addDay(tx, f.a.id, session, 48);
      const [d1, d2] = await days(tx, session);

      await tx.asServiceRole();
      await syncDay(tx, f.a.id, rsvp.member_id, session, d1.id, "g-day-1");
      await syncDay(tx, f.a.id, rsvp.member_id, session, d2.id, "g-day-2");

      await tx.asOwner();
      const after = await rows(tx);
      expect(after).toHaveLength(2);
      expect(after.map((r) => r.provider_event_id).sort()).toEqual(["g-day-1", "g-day-2"]);

      // REQ-CAL-004: idempotency is the constraint. Running the same day twice
      // updates; it cannot create a second event.
      await tx.asServiceRole();
      await syncDay(tx, f.a.id, rsvp.member_id, session, d2.id, "g-day-2-again");
      await tx.asOwner();
      const twice = await rows(tx);
      expect(twice).toHaveLength(2);
      expect(twice.find((r) => r.session_day_id === d2.id)!.provider_event_id).toBe("g-day-2-again");
    });
  });

  it("legacy_call_gets_first_day — main's six-argument call writes the FIRST day's row, and the day-aware call updates that same row", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const session = f.m2.a.published;
      const rsvp = await rsvpOf(tx, session);
      await addDay(tx, f.a.id, session, 48);
      const [d1] = await days(tx, session);

      await tx.asServiceRole();
      await legacySync(tx, f.a.id, rsvp.member_id, session, "g-legacy");

      await tx.asOwner();
      const [only] = await rows(tx);
      expect(await rows(tx)).toHaveLength(1);
      expect(only.session_day_id).toBe(d1.id);

      // ★ The row a one-day session has today IS that day's row: the day-aware
      // call names it and updates it — same id, never a second one.
      await tx.asServiceRole();
      await syncDay(tx, f.a.id, rsvp.member_id, session, d1.id, "g-day-aware");
      await tx.asOwner();
      const after = await rows(tx);
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe(only.id);
      expect(after[0].provider_event_id).toBe("g-day-aware");
    });
  });

  // ★ `calendar-sync.test.ts`'s `RPC-record_calendar_sync.idempotent` runs
  // against whatever is promoted, so it will meet the seven-parameter function
  // the day the lead promotes this file. Its exact call — six UNTYPED
  // parameters — is repeated here, with this file applied, so promotion cannot
  // surprise anyone: the existing case is evidence and is not edited.
  it("legacy_call_gets_first_day — the existing idempotency case, verbatim, against the seven-parameter function", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const session = f.m2.a.published;
      const rsvp = await rsvpOf(tx, session);
      await tx.asServiceRole();
      const record = (state: string, eventId: string | null, error: string | null = null) =>
        tx.q(`select public.record_calendar_sync($1, $2, $3, $4::public.calendar_sync_state, $5, $6)`, [
          f.a.id,
          rsvp.member_id,
          session,
          state,
          eventId,
          error,
        ]);
      await record("pending", null);
      await record("synced", "g-once");
      await record("failed", null, "Google said no");

      await tx.asOwner();
      const after = await rows(tx);
      expect(after).toHaveLength(1);
      expect(after[0].state).toBe("failed");
      // A failure keeps the only record of what was created.
      expect(after[0].provider_event_id).toBe("g-once");
    });
  });

  it("per_day — a one-day session has exactly one day, one row, and a window equal to the session's stored one", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const session = f.m2.a.published;
      const rsvp = await rsvpOf(tx, session);

      await tx.asServiceRole();
      await legacySync(tx, f.a.id, rsvp.member_id, session, "g-one");
      const t = await target(tx, rsvp.id);

      expect(t.days).toHaveLength(1);
      expect(t.days[0].position).toBe(1);
      expect(t.days[0].provider_event_id).toBe("g-one");
      expect(t.days[0].starts_at).toBe(t.session.starts_at);
      expect(t.days[0].ends_at).toBe(t.session.ends_at);
      expect(t.orphans).toEqual([]);
      expect(t.provider_event_id).toBe("g-one");

      await tx.asOwner();
      expect(await rows(tx)).toHaveLength(1);
    });
  });
});

describe("RPC-calendar_sync_target", () => {
  it("days_and_orphans — one entry per day in position order, and a deleted day's row survives so its event can still be removed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const session = f.m2.a.published;
      const rsvp = await rsvpOf(tx, session);
      await addDay(tx, f.a.id, session, 48);
      await addDay(tx, f.a.id, session, 72);
      const three = await days(tx, session);
      expect(three.map((d) => d.position)).toEqual([1, 2, 3]);

      await tx.asServiceRole();
      for (const [i, d] of three.entries()) await syncDay(tx, f.a.id, rsvp.member_id, session, d.id, `g${i + 1}`);

      const before = await target(tx, rsvp.id);
      expect(before.days.map((d) => d.provider_event_id)).toEqual(["g1", "g2", "g3"]);
      expect(before.days.map((d) => d.position)).toEqual([1, 2, 3]);
      // `main`'s worker reads this one, and it must be the FIRST day's so the
      // old code updates the event it created rather than adding a second.
      expect(before.provider_event_id).toBe("g1");
      expect(before.orphans).toEqual([]);

      // ★ The middle day is dropped from the session. `0101`'s foreign key is
      // ON DELETE SET NULL, never cascade, so the row outlives its day
      // carrying the only record of the provider event id.
      await tx.asOwner();
      await tx.q(`delete from public.session_days where id = $1`, [three[1].id]);

      await tx.asServiceRole();
      const after = await target(tx, rsvp.id);
      expect(after.days.map((d) => d.provider_event_id)).toEqual(["g1", "g3"]);
      expect(after.orphans.map((o) => o.provider_event_id)).toEqual(["g2"]);

      await tx.asOwner();
      expect(await rows(tx)).toHaveLength(3);
      expect((await rows(tx)).filter((r) => r.session_day_id === null)).toHaveLength(1);
    });
  });

  it("days_and_orphans — several orphans of one member never collide, because nulls are distinct", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const session = f.m2.a.published;
      const rsvp = await rsvpOf(tx, session);
      await addDay(tx, f.a.id, session, 48);
      await addDay(tx, f.a.id, session, 72);
      const three = await days(tx, session);

      await tx.asServiceRole();
      for (const [i, d] of three.entries()) await syncDay(tx, f.a.id, rsvp.member_id, session, d.id, `g${i + 1}`);

      await tx.asOwner();
      await tx.q(`delete from public.session_days where id = any($1::uuid[])`, [[three[1].id, three[2].id]]);

      await tx.asServiceRole();
      const after = await target(tx, rsvp.id);
      expect(after.orphans.map((o) => o.provider_event_id).sort()).toEqual(["g2", "g3"]);
    });
  });
});

describe("RPC-record_calendar_event_removed", () => {
  it("worker_only — no client role may execute it, and the worker's call takes the row out of the orphan list", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const session = f.m2.a.published;
      const rsvp = await rsvpOf(tx, session);
      const d2 = await addDay(tx, f.a.id, session, 48);

      await tx.asServiceRole();
      await syncDay(tx, f.a.id, rsvp.member_id, session, d2.id, "g2");
      await tx.asOwner();
      await tx.q(`delete from public.session_days where id = $1`, [d2.id]);

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.record_calendar_event_removed($1::uuid)`, [d2.id]))).toBe(PERMISSION_DENIED);

      await tx.asServiceRole();
      const orphan = (await target(tx, rsvp.id)).orphans[0];
      expect(orphan.provider_event_id).toBe("g2");
      await tx.q(`select public.record_calendar_event_removed($1::uuid)`, [orphan.calendar_event_id]);
      expect((await target(tx, rsvp.id)).orphans).toEqual([]);

      // The row itself is kept: `removed` is a state, not a deletion.
      await tx.asOwner();
      const kept = (await rows(tx)).find((r) => r.id === orphan.calendar_event_id)!;
      expect(kept.state).toBe("removed");
      expect(kept.provider_event_id).toBe("g2");
    });
  });
});

describe("RPC-resync_calendars", () => {
  it("definer_only — no client role may fan calendar jobs out across an org, and the worker's call re-enqueues under the EXISTING key", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const session = f.m2.a.published;
      const rsvp = await rsvpOf(tx, session);

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.resync_calendars()`))).toBe(PERMISSION_DENIED);

      // The fixture's own reservation already enqueued `cal:{rsvp_id}` in the
      // transaction that confirmed the seat (0034), so the count before is the
      // measure: a re-enqueue under the same key MOVES that job rather than
      // adding a second one.
      // Scoped to THIS reservation's key: the local database carries jobs from
      // earlier runs, and `cal:%` would sweep them in.
      await tx.asOwner();
      const keyed = async () => (await tx.q<{ key: string }>(`select key from graphile_worker.jobs where key = $1`, [`cal:${rsvp.id}`])).map((j) => j.key);
      expect(await keyed()).toEqual([`cal:${rsvp.id}`]);

      await tx.asServiceRole();
      const [{ n }] = await tx.q<{ n: number }>(`select public.resync_calendars($1::uuid) as n`, [session]);
      expect(n).toBeGreaterThanOrEqual(1);

      await tx.asOwner();
      // `cal:{rsvp_id}` is the key the job already has at every n — a per-day
      // key would leave production's pending jobs unreplaced and duplicate the
      // member's calendar entry (contract 2).
      expect(await keyed()).toEqual([`cal:${rsvp.id}`]);
    });
  });
});
