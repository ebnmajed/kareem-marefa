// notify (wave 2, M3) — supabase/proposed/notify/0005_session_notices.sql:
// the session notices DEC-045 deferred from M2.
//
// 03 §8.2 rows proven here:
//   POL-sessions.publish_notice · POL-sessions.change_notice ·
//   POL-sessions.change_notice.non_optional ·
//   POL-sessions.change_notice.unpublished · POL-sessions.cancel_notice
//
// REQ-SES-009 is the one that matters: the member is told the OLD value and
// the NEW one. "Session details have changed, please check the page" makes
// them do the diffing, and some of them will not.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

// 0003 and 0004 were promoted at wave-2 sync 3 as migrations 0034 and 0035,
// so `supabase db reset` applies them; only the file still under review is
// applied here. Listing it by name rather than globbing the folder keeps the
// test honest about what it is proving.

async function setup(tx: Tx) {
  const f = await seed(tx);
  // Promoted as migration 0036 at wave-2 sync 4: applied by `supabase db reset`.
  for (const table of ["notifications", "notification_preferences"]) await tx.q(`delete from public.${table}`);
  return f;
}

/** A published session 30 days out, so all three reminder offsets are ahead. */
async function futureSession(tx: Tx, org: { id: string; categoryId: string; venueId: string }) {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at)
     values ($1, 'جلسة قادمة', 'ملخص', $2, 'introductory',
             now() + interval '30 days', 60, now() + interval '30 days' + interval '1 hour',
             $3, 30, 'published', now())
     returning id`,
    [org.id, org.categoryId, org.venueId],
  );
  return row.id;
}

const reserve = (tx: Tx, org: string, session: string, member: string, status = "confirmed") =>
  tx.q(
    `insert into public.rsvps (org_id, session_id, member_id, status, reserved_at, waitlist_position)
     values ($1, $2, $3, $4::public.rsvp_status, now(), case when $4 = 'waitlisted' then 1 end)`,
    [org, session, member, status],
  );

const notices = (tx: Tx, key: string) =>
  tx.q<{ member_id: string; payload: Record<string, unknown> }>(
    `select member_id, payload from public.notifications where key = $1 order by created_at`,
    [key],
  );

const jobs = (tx: Tx, like: string) =>
  tx.q<{ key: string; task_identifier: string; run_at: Date }>(
    `select key, task_identifier, run_at from graphile_worker.jobs where key like $1`,
    [like],
  );

describe("POL-sessions.publish_notice", () => {
  it("announces the session once, to every active member of the org and nobody else", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      // A deactivated member is not announced to.
      await tx.q(`update public.members set status = 'deactivated', deactivated_at = now(), deactivated_reason = 'غادر' where id = $1`, [f.a.members[1].memberId]);

      const [{ id }] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state)
         values ($1, 'قبل النشر', 'ملخص', $2, 'introductory', now() + interval '30 days', 60,
                 now() + interval '30 days' + interval '1 hour', $3, 30, 'approved') returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId],
      );
      await tx.q(`update public.sessions set state = 'published', published_at = now() where id = $1`, [id]);

      const rows = await notices(tx, "MSG-session_published");
      expect(rows.map((r) => r.member_id).sort()).toEqual([f.a.admin.memberId, f.a.mod.memberId, f.a.members[0].memberId].sort());
      // Org B hears nothing.
      expect(
        await tx.q(`select n.id from public.notifications n join public.members m on m.id = n.member_id where m.org_id = $1`, [f.b.id]),
      ).toEqual([]);

      // The later move to in_progress is not a second announcement.
      await tx.q(`update public.sessions set state = 'in_progress' where id = $1`, [id]);
      expect(await notices(tx, "MSG-session_published")).toHaveLength(3);
    });
  });
});

describe("POL-sessions.change_notice — REQ-SES-009", () => {
  it("carries BOTH values, for confirmed and waitlisted members alike", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      await reserve(tx, f.a.id, session, f.a.members[1].memberId, "waitlisted");
      const [{ starts_at: was }] = await tx.q<{ starts_at: Date }>(`select starts_at from public.sessions where id = $1`, [session]);
      await tx.q(`delete from public.notifications`);

      await tx.q(`update public.sessions set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where id = $1`, [session]);

      const rows = await notices(tx, "MSG-session_changed");
      expect(rows.map((r) => r.member_id).sort()).toEqual([f.a.members[0].memberId, f.a.members[1].memberId].sort());

      const changes = rows[0].payload.changes as Array<{ field: string; from: string; to: string }>;
      expect(changes).toHaveLength(1);
      expect(changes[0].field).toBe("starts_at");
      // The old value, not just the new one. This is the whole requirement.
      expect(new Date(changes[0].from).getTime()).toBe(new Date(was).getTime());
      expect(new Date(changes[0].to).getTime()).toBe(new Date(was).getTime() + 86_400_000);
    });
  });

  it("reports a venue change by NAME, and only the line that moved", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      await tx.q(`delete from public.notifications`);
      const [{ id: other }] = await tx.q<{ id: string }>(`insert into public.venues (org_id, name, capacity) values ($1, 'قاعة ب', 50) returning id`, [f.a.id]);

      await tx.q(`update public.sessions set venue_id = $2 where id = $1`, [session, other]);

      const changes = (await notices(tx, "MSG-session_changed"))[0].payload.changes as Array<{ field: string; from: string; to: string }>;
      expect(changes).toHaveLength(1); // the unchanged time does not print
      expect(changes[0]).toMatchObject({ field: "venue", from: "قاعة كريم معرفة", to: "قاعة ب" });
    });
  });

  it("moves the reminders and enqueues one calendar upsert per confirmed seat (REQ-CAL-005)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      await reserve(tx, f.a.id, session, f.a.members[1].memberId, "waitlisted");
      const before = await jobs(tx, `remind:${session}:%`);
      expect(before).toHaveLength(3);

      await tx.q(`update public.sessions set starts_at = starts_at + interval '3 days', ends_at = ends_at + interval '3 days' where id = $1`, [session]);

      const after = await jobs(tx, `remind:${session}:%`);
      expect(after).toHaveLength(3); // moved, not duplicated
      for (const row of after) {
        const was = before.find((b) => b.key === row.key)!;
        expect(new Date(row.run_at).getTime() - new Date(was.run_at).getTime()).toBe(3 * 86_400_000);
      }

      // One upsert, for the confirmed seat. A waitlisted member has no event.
      const rsvps = await tx.q<{ id: string; status: string }>(`select id, status from public.rsvps where session_id = $1`, [session]);
      const confirmed = rsvps.find((r) => r.status === "confirmed")!;
      const waiting = rsvps.find((r) => r.status === "waitlisted")!;
      expect(await jobs(tx, `cal:${confirmed.id}`)).toHaveLength(1);
      expect(await jobs(tx, `cal:${waiting.id}`)).toHaveLength(0);
    });
  });

  it("non_optional — it reaches a member who muted my_sessions on both channels", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const me = f.a.members[0];
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, me.memberId);
      for (const channel of ["in_app", "email"]) {
        await tx.q(
          `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
           values ($1, $2, 'my_sessions', $3::public.notify_channel, false)`,
          [f.a.id, me.memberId, channel],
        );
      }
      await tx.q(`delete from public.notifications`);

      await tx.q(`update public.sessions set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where id = $1`, [session]);
      expect(await notices(tx, "MSG-session_changed")).toHaveLength(1);
    });
  });

  it("unpublished — editing a draft notifies nobody, and a title edit notifies nobody either", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`update public.sessions set starts_at = now() + interval '90 days', ends_at = now() + interval '90 days' + interval '1 hour' where id = $1`, [f.m2.a.draft]);
      expect(await notices(tx, "MSG-session_changed")).toEqual([]);

      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      await tx.q(`delete from public.notifications`);
      await tx.q(`update public.sessions set title = 'عنوان جديد' where id = $1`, [session]);
      expect(await notices(tx, "MSG-session_changed")).toEqual([]);
    });
  });
});

describe("POL-sessions.cancel_notice", () => {
  it("tells confirmed and waitlisted members why, clears every key, and queues the calendar deletes", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      await reserve(tx, f.a.id, session, f.a.members[1].memberId, "waitlisted");
      await tx.q(`select public.schedule_session_reminders($1)`, [session]);
      expect(await jobs(tx, `remind:${session}:%`)).toHaveLength(3);
      expect(await jobs(tx, `nudge:${session}`)).toHaveLength(1);
      await tx.q(`delete from public.notifications`);

      await tx.q(`update public.sessions set state = 'cancelled', cancelled_at = now(), cancellation_reason = 'القاعة غير متاحة' where id = $1`, [session]);

      const rows = await notices(tx, "MSG-session_cancelled");
      expect(rows.map((r) => r.member_id).sort()).toEqual([f.a.members[0].memberId, f.a.members[1].memberId].sort());
      expect(rows[0].payload.reason).toBe("القاعة غير متاحة");

      expect(await jobs(tx, `remind:${session}:%`)).toHaveLength(0);
      expect(await jobs(tx, `nudge:${session}`)).toHaveLength(0);
      const rsvps = await tx.q<{ id: string }>(`select id from public.rsvps where session_id = $1`, [session]);
      for (const rsvp of rsvps) {
        expect(await jobs(tx, `cal:${rsvp.id}`)).toHaveLength(0);
        expect(await jobs(tx, `caldel:${rsvp.id}`)).toHaveLength(1);
      }
    });
  });
});

describe("REQ-RAT-007 — completing a session starts the prompt's clock", () => {
  it("schedules rate:{session} on the edge into completed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ id }] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
         values ($1, 'ستكتمل', 'ملخص', $2, 'introductory', now() - interval '2 hours', 60, now() - interval '1 hour', $3, 30, 'in_progress', now() - interval '1 day')
         returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId],
      );
      expect(await jobs(tx, `rate:${id}`)).toHaveLength(0);

      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [id]);
      const rows = await jobs(tx, `rate:${id}`);
      expect(rows).toHaveLength(1);
      expect(rows[0].task_identifier).toBe("rating_prompt");
    });
  });
});
