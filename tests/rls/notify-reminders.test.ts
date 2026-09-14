// notify (wave 2, M3) — supabase/proposed/notify/0003_reminders.sql.
//
// 03 §8.2 rows proven here:
//   RPC-cancel_job.definer_only · RPC-schedule_session_reminders.moves ·
//   RPC-schedule_session_reminders.past ·
//   RPC-schedule_session_reminders.confirmed_only · POL-rsvps.notice
//
// ★ The headline is REQ-NTF-004: rescheduling a session MOVES its reminders.
// `enqueue_job()` fixes `job_key_mode => 'replace'` (0025), so the same key
// re-enqueued lands on one job at the new time — no cancel-and-recreate
// window in which both or neither exists.
//
// The proposed file is applied AFTER the fixture, deliberately: the fixture
// arranges history, and history should not fire the trigger that announces
// news.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const OFFSETS = [10080, 1440, 120];

async function setup(tx: Tx) {
  const f = await seed(tx);
  // Promoted at wave-2 sync 3 (0031–0035): applied by `supabase db reset`.
  for (const table of ["notifications", "notification_preferences"]) await tx.q(`delete from public.${table}`);
  return f;
}

/** A published session far enough out that all three default offsets are in
 *  the future — the fixture's is +24 h, which puts 7 d and 1 d in the past. */
async function futureSession(tx: Tx, org: { id: string; categoryId: string; venueId: string }, days = 30) {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at)
     values ($1, 'جلسة بعيدة', 'ملخص', $2, 'introductory',
             now() + ($4 || ' days')::interval, 60, now() + ($4 || ' days')::interval + interval '1 hour',
             $3, 30, 'published', now())
     returning id`,
    [org.id, org.categoryId, org.venueId, String(days)],
  );
  return row.id;
}

const jobs = (tx: Tx, like: string) =>
  tx.q<{ key: string; task_identifier: string; run_at: Date }>(
    `select key, task_identifier, run_at from graphile_worker.jobs where key like $1 order by run_at`,
    [like],
  );

const reserve = (tx: Tx, org: string, session: string, member: string, status = "confirmed") =>
  tx.q(
    `insert into public.rsvps (org_id, session_id, member_id, status, reserved_at, waitlist_position)
     values ($1, $2, $3, $4::public.rsvp_status, now(), case when $4 = 'waitlisted' then 1 end)`,
    [org, session, member, status],
  );

describe("RPC-cancel_job.definer_only", () => {
  it("no client role may remove a queued job", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      for (const who of [f.a.members[0].claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(() => tx.q(`select public.cancel_job('remind:x')`))).toBe(PERMISSION_DENIED);
      }
      await tx.asServiceRole();
      await tx.q(`select public.cancel_job('remind:x')`); // a key that matches nothing is not an error
    });
  });

  it("removes the job the key names, and only that one", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asOwner();
      await tx.q(`select public.enqueue_job('ping', '{}'::jsonb, 'keep:1')`);
      await tx.q(`select public.enqueue_job('ping', '{}'::jsonb, 'drop:1')`);
      await tx.q(`select public.cancel_job('drop:1')`);
      expect(await jobs(tx, "drop:%")).toHaveLength(0);
      expect(await jobs(tx, "keep:%")).toHaveLength(1);
    });
  });
});

describe("RPC-schedule_session_reminders", () => {
  it("one job per confirmed member per offset, at starts_at minus the offset", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);

      const rows = await jobs(tx, `remind:${session}:%`);
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.key).sort()).toEqual(OFFSETS.map((o) => `remind:${session}:${o}:${f.a.members[0].memberId}`).sort());
      for (const row of rows) expect(row.task_identifier).toBe("send_reminder");

      const [{ starts_at }] = await tx.q<{ starts_at: Date }>(`select starts_at from public.sessions where id = $1`, [session]);
      const byKey = new Map(rows.map((r) => [r.key, r.run_at]));
      for (const offset of OFFSETS) {
        const expected = new Date(new Date(starts_at).getTime() - offset * 60_000);
        const actual = new Date(byKey.get(`remind:${session}:${offset}:${f.a.members[0].memberId}`)!);
        expect(Math.abs(actual.getTime() - expected.getTime())).toBeLessThan(1000);
      }
    });
  });

  it("moves — rescheduling leaves ONE job per key, at the new time (REQ-NTF-004)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      const before = await jobs(tx, `remind:${session}:%`);

      // The session moves a week later.
      await tx.q(`update public.sessions set starts_at = starts_at + interval '7 days', ends_at = ends_at + interval '7 days' where id = $1`, [session]);
      await tx.q(`select public.schedule_session_reminders($1)`, [session]);

      const after = await jobs(tx, `remind:${session}:%`);
      // Not six. Three, moved.
      expect(after).toHaveLength(3);
      expect(after.map((r) => r.key).sort()).toEqual(before.map((r) => r.key).sort());
      for (const row of after) {
        const was = before.find((b) => b.key === row.key)!;
        expect(new Date(row.run_at).getTime() - new Date(was.run_at).getTime()).toBe(7 * 86_400_000);
      }
    });
  });

  it("past — an offset whose moment has gone is removed, not left to fire immediately", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      expect(await jobs(tx, `remind:${session}:%`)).toHaveLength(3);

      // The session moves to tomorrow: the 7-day mark and the 1-day mark are
      // now behind us. A job with a past run_at runs the instant a worker sees
      // it, which would send «بعد أسبوع» about a session starting tomorrow.
      await tx.q(`update public.sessions set starts_at = now() + interval '23 hours', ends_at = now() + interval '24 hours' where id = $1`, [session]);
      await tx.q(`select public.schedule_session_reminders($1)`, [session]);

      const keys = (await jobs(tx, `remind:${session}:%`)).map((r) => r.key);
      expect(keys).toEqual([`remind:${session}:120:${f.a.members[0].memberId}`]);
    });
  });

  it("past — and a session moved LATER gets its removed offsets back", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a, 1);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      expect(await jobs(tx, `remind:${session}:%`)).toHaveLength(1); // only -2 h is ahead

      await tx.q(`update public.sessions set starts_at = now() + interval '30 days', ends_at = now() + interval '30 days' + interval '1 hour' where id = $1`, [session]);
      await tx.q(`select public.schedule_session_reminders($1)`, [session]);
      expect(await jobs(tx, `remind:${session}:%`)).toHaveLength(3);
    });
  });

  it("confirmed_only — a waitlisted member has no reminders until they are promoted", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      const waiting = f.a.members[1].memberId;
      await reserve(tx, f.a.id, session, waiting, "waitlisted");
      expect(await jobs(tx, `remind:${session}:%`)).toHaveLength(0);

      await tx.q(`update public.rsvps set status = 'confirmed', waitlist_position = null, promoted_at = now() where session_id = $1 and member_id = $2`, [session, waiting]);
      expect(await jobs(tx, `remind:${session}:${waiting}%`.replace(`${waiting}%`, "%"))).toHaveLength(3);
    });
  });

  it("follows the org's own schedule, not the default (REQ-NTF-004)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`update public.org_settings set reminder_offsets_minutes = '{2880,60}' where org_id = $1`, [f.a.id]);
      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);

      const keys = (await jobs(tx, `remind:${session}:%`)).map((r) => r.key).sort();
      expect(keys).toEqual([`remind:${session}:2880:${f.a.members[0].memberId}`, `remind:${session}:60:${f.a.members[0].memberId}`].sort());
    });
  });

  it("schedules the -7d nudge once, and drops it when the session is too close", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const far = await futureSession(tx, f.a, 30);
      await tx.q(`select public.schedule_session_reminders($1)`, [far]);
      const nudge = await jobs(tx, `nudge:${far}`);
      expect(nudge).toHaveLength(1);
      expect(nudge[0].task_identifier).toBe("rsvp_nudge");

      const near = await futureSession(tx, f.a, 2);
      await tx.q(`select public.schedule_session_reminders($1)`, [near]);
      expect(await jobs(tx, `nudge:${near}`)).toHaveLength(0);
    });
  });
});

describe("reminder_message_key — 08 §1.2 defines three messages for a free int[]", () => {
  it("maps each default offset to its own message and a custom one to the nearest", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asOwner();
      const key = async (offset: number) =>
        (await tx.q<{ k: string }>(`select public.reminder_message_key($1) as k`, [offset]))[0].k;
      expect(await key(10080)).toBe("MSG-reminder_7d");
      expect(await key(1440)).toBe("MSG-reminder_1d");
      expect(await key(120)).toBe("MSG-reminder_2h");
      // An org that picks 3 days borrows the nearest message rather than
      // sending nothing. Flagged in docs/plan/notes/notify.md for 08.
      expect(await key(4320)).toBe("MSG-reminder_7d");
      expect(await key(720)).toBe("MSG-reminder_1d");
      expect(await key(30)).toBe("MSG-reminder_2h");
    });
  });
});

describe("POL-rsvps.notice — the TODO(notify, M3) sites of 0014", () => {
  const inbox = (tx: Tx, member: string) =>
    tx.q<{ key: string }>(`select key from public.notifications where member_id = $1 order by created_at`, [member]);

  it("a confirmed seat notifies the member and enqueues the calendar upsert", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);

      expect((await inbox(tx, f.a.members[0].memberId)).map((r) => r.key)).toEqual(["MSG-rsvp_confirmed"]);
      const [rsvp] = await tx.q<{ id: string }>(`select id from public.rsvps where session_id = $1`, [session]);
      const cal = await jobs(tx, `cal:${rsvp.id}`);
      expect(cal).toHaveLength(1);
      expect(cal[0].task_identifier).toBe("calendar_upsert");
    });
  });

  it("REQ-RSV-004 — promotion off the waitlist is announced, and cannot be switched off", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const me = f.a.members[1];
      await tx.asOwner();
      // The member has muted `my_sessions` on both channels. MSG-rsvp_promoted
      // is in 08 §1.7's set, so it arrives anyway: a member who does not know
      // they hold a seat wastes it.
      for (const channel of ["in_app", "email"]) {
        await tx.q(
          `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
           values ($1, $2, 'my_sessions', $3::public.notify_channel, false)`,
          [f.a.id, me.memberId, channel],
        );
      }
      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, me.memberId, "waitlisted");
      expect(await inbox(tx, me.memberId)).toEqual([]); // waitlisted IS optional

      await tx.q(`update public.rsvps set status = 'confirmed', waitlist_position = null, promoted_at = now() where session_id = $1 and member_id = $2`, [session, me.memberId]);
      expect((await inbox(tx, me.memberId)).map((r) => r.key)).toEqual(["MSG-rsvp_promoted"]);
    });
  });

  it("cancelling removes the member's reminder keys and enqueues the calendar delete", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId);
      expect(await jobs(tx, `remind:${session}:%`)).toHaveLength(3);
      const [rsvp] = await tx.q<{ id: string }>(`select id from public.rsvps where session_id = $1`, [session]);

      await tx.q(`update public.rsvps set status = 'cancelled', cancelled_at = now() where id = $1`, [rsvp.id]);
      expect(await jobs(tx, `remind:${session}:%`)).toHaveLength(0);
      expect(await jobs(tx, `cal:${rsvp.id}`)).toHaveLength(0);
      const del = await jobs(tx, `caldel:${rsvp.id}`);
      expect(del).toHaveLength(1);
      expect(del[0].task_identifier).toBe("calendar_delete");
    });
  });

  it("a waitlist_position shuffle is not news", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, session, f.a.members[0].memberId, "waitlisted");
      expect(await inbox(tx, f.a.members[0].memberId)).toHaveLength(1);
      await tx.q(`update public.rsvps set waitlist_position = 3 where session_id = $1`, [session]);
      expect(await inbox(tx, f.a.members[0].memberId)).toHaveLength(1);
    });
  });
});

describe("REQ-RAT-007 — the rating prompt", () => {
  it("is one job per session, an hour after completion by default", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`select public.schedule_rating_prompt($1)`, [f.m2.a.completed]);
      const rows = await jobs(tx, `rate:${f.m2.a.completed}`);
      expect(rows).toHaveLength(1);
      expect(rows[0].task_identifier).toBe("rating_prompt");

      const [{ completed_at }] = await tx.q<{ completed_at: Date }>(`select completed_at from public.sessions where id = $1`, [f.m2.a.completed]);
      const expected = new Date(new Date(completed_at).getTime() + 60 * 60_000);
      expect(Math.abs(new Date(rows[0].run_at).getTime() - expected.getTime())).toBeLessThan(1000);
    });
  });

  it("follows the org's configured delay, and schedules nothing for a session that has not completed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`update public.org_settings set rating_prompt_delay_minutes = 180 where org_id = $1`, [f.a.id]);
      await tx.q(`select public.schedule_rating_prompt($1)`, [f.m2.a.completed]);
      const [{ completed_at }] = await tx.q<{ completed_at: Date }>(`select completed_at from public.sessions where id = $1`, [f.m2.a.completed]);
      const [row] = await jobs(tx, `rate:${f.m2.a.completed}`);
      expect(Math.abs(new Date(row.run_at).getTime() - (new Date(completed_at).getTime() + 180 * 60_000))).toBeLessThan(1000);

      await tx.q(`select public.schedule_rating_prompt($1)`, [f.m2.a.published]);
      expect(await jobs(tx, `rate:${f.m2.a.published}`)).toHaveLength(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 0004 — the send side. The job may outlive its reason, so every one of these
// re-reads the rows at the moment of sending.
// ═══════════════════════════════════════════════════════════════════════════
describe("RPC-send_reminder_notification.still_due", () => {
  const inbox = (tx: Tx, member: string) =>
    tx.q<{ key: string }>(`select key from public.notifications where member_id = $1 order by created_at`, [member]);

  it("sends the message the offset maps to, for a seat that still stands", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      const me = f.a.members[0].memberId;
      await reserve(tx, f.a.id, session, me);
      await tx.q(`delete from public.notifications`); // the confirmation is not what is under test

      expect((await tx.q<{ sent: boolean }>(`select public.send_reminder_notification($1, $2, 1440) as sent`, [session, me]))[0].sent).toBe(true);
      expect((await inbox(tx, me)).map((r) => r.key)).toEqual(["MSG-reminder_1d"]);
    });
  });

  it("sends nothing once the seat is cancelled, or the session is", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      const me = f.a.members[0].memberId;
      await reserve(tx, f.a.id, session, me);
      await tx.q(`delete from public.notifications`);

      await tx.q(`update public.rsvps set status = 'cancelled', cancelled_at = now() where session_id = $1`, [session]);
      expect((await tx.q<{ sent: boolean }>(`select public.send_reminder_notification($1, $2, 120) as sent`, [session, me]))[0].sent).toBe(false);

      // And for a session that is no longer happening, even with a live seat.
      const other = await futureSession(tx, f.a);
      await reserve(tx, f.a.id, other, f.a.members[1].memberId);
      await tx.q(`update public.sessions set state = 'cancelled', cancelled_at = now(), cancellation_reason = 'القاعة' where id = $1`, [other]);
      expect((await tx.q<{ sent: boolean }>(`select public.send_reminder_notification($1, $2, 120) as sent`, [other, f.a.members[1].memberId]))[0].sent).toBe(false);
      await tx.q(`delete from public.notifications`);
      expect(await inbox(tx, me)).toEqual([]);
    });
  });

  it("is definer-only", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.send_reminder_notification($1, $2, 120)`, [f.m2.a.published, f.a.members[0].memberId]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`select public.send_rsvp_nudge($1)`, [f.m2.a.published]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`select public.send_rating_prompt($1)`, [f.m2.a.completed]))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("RPC-send_rsvp_nudge.non_responders", () => {
  it("nudges only members with no rsvp row, and never a presenter", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      const presenter = f.a.members[0].memberId;
      const responder = f.a.members[1].memberId;
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, session, presenter]);
      await reserve(tx, f.a.id, session, responder);
      await tx.q(`delete from public.notifications`);

      const [{ nudged }] = await tx.q<{ nudged: number }>(`select public.send_rsvp_nudge($1) as nudged`, [session]);
      const recipients = await tx.q<{ member_id: string }>(`select member_id from public.notifications where key = 'MSG-rsvp_nudge'`);
      expect(recipients.map((r) => r.member_id).sort()).toEqual([f.a.admin.memberId, f.a.mod.memberId].sort());
      expect(nudged).toBe(2);
      // Org B hears nothing about org A's session.
      expect(await tx.q(`select n.id from public.notifications n join public.members m on m.id = n.member_id where m.org_id = $1`, [f.b.id])).toEqual([]);
    });
  });

  it("is in-app only — the matrix refuses to mail it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      await tx.q(`delete from public.notifications`);
      await tx.q(`select public.send_rsvp_nudge($1)`, [session]);
      const enqueued = await tx.q<{ payload: { email: boolean } }>(
        `select p.payload from graphile_worker.jobs j join graphile_worker._private_jobs p on p.id = j.id
          where j.task_identifier = 'send_notification' and p.payload ->> 'key' = 'MSG-rsvp_nudge'`,
      );
      expect(enqueued.length).toBeGreaterThan(0);
      for (const row of enqueued) expect(row.payload.email).toBe(false);
    });
  });

  it("nudges nobody for a session that is not published, or has already started", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`delete from public.notifications`);
      expect((await tx.q<{ n: number }>(`select public.send_rsvp_nudge($1) as n`, [f.m2.a.draft]))[0].n).toBe(0);
      expect((await tx.q<{ n: number }>(`select public.send_rsvp_nudge($1) as n`, [f.m2.a.completed]))[0].n).toBe(0);
    });
  });
});

describe("RPC-send_rating_prompt.unrated", () => {
  it("prompts checked-in attendees who have not rated, and nobody else", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`delete from public.notifications`);
      // The fixture's completed session has a check-in AND a rating by
      // members[1], so with the rating in place nobody is due a prompt.
      expect((await tx.q<{ n: number }>(`select public.send_rating_prompt($1) as n`, [f.m2.a.completed]))[0].n).toBe(0);

      // Remove the rating: the same member is now due one.
      await tx.q(`delete from public.ratings where session_id = $1`, [f.m2.a.completed]);
      expect((await tx.q<{ n: number }>(`select public.send_rating_prompt($1) as n`, [f.m2.a.completed]))[0].n).toBe(1);
      const rows = await tx.q<{ key: string; member_id: string }>(`select key, member_id from public.notifications`);
      expect(rows).toHaveLength(1);
      expect(rows[0].key).toBe("MSG-rating_prompt");
      expect(rows[0].member_id).toBe(f.a.members[1].memberId);
    });
  });

  it("prompts nobody for a session that has not completed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      expect((await tx.q<{ n: number }>(`select public.send_rating_prompt($1) as n`, [f.m2.a.published]))[0].n).toBe(0);
    });
  });
});
