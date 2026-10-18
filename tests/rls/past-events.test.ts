// A past event, logged after it happened — DEC-299, REQ-SES-025, migration 0231_past_events.
//
// `03` §8.2 rows: RPC-create_session.retrospective, RPC-publish_past_session, TRG-past_event.silent,
// TRG-past_event.dated.

import { afterAll, describe, expect, it } from "vitest";
import { errorMessage, pool, withTx, type Tx } from "./db";
import { seed, type Fixture } from "./fixture";

afterAll(() => pool.end());

const HOUR = 3_600_000;

/** Logs a past event as the admin, through the product's own three calls. */
async function logPastEvent(tx: Tx, f: Fixture, opts: { endedHoursAgo?: number; presenter?: boolean } = {}) {
  await tx.as(f.a.admin.claims);
  const presenters = opts.presenter === false ? [] : [f.a.members[1].memberId];
  const [{ id }] = await tx.q<{ id: string }>(
    `select public.create_session('لقاء مضى', 'ملخص', $1, 'introductory', 'ar', $2::uuid[], null, true) as id`,
    [f.a.categoryId, presenters],
  );
  const endedAgo = opts.endedHoursAgo ?? 48;
  const startsAt = new Date(Date.now() - (endedAgo + 1) * HOUR).toISOString();
  await tx.q(`select public.schedule_session($1, $2, 60, null, $3, null, null, null, 40, null, null, 'review', 'ar')`, [id, startsAt, f.a.venueId]);
  return id;
}

async function notificationsFor(tx: Tx, sessionId: string) {
  await tx.asOwner();
  return tx.q<{ key: string }>(`select key from public.notifications where session_id = $1`, [sessionId]);
}

describe("RPC-create_session.retrospective", () => {
  it("creates a draft past event; its presenter is NOT told they were assigned", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = await logPastEvent(tx, f);
      await tx.asOwner();
      const [s] = await tx.q<{ logged_retrospectively: boolean; state: string }>(`select logged_retrospectively, state from public.sessions where id = $1`, [id]);
      expect(s).toEqual({ logged_retrospectively: true, state: "draft" });
      expect(await notificationsFor(tx, id)).toHaveLength(0);
      const audit = await tx.q(`select 1 from public.audit_log where action = 'session.logged_retrospectively' and subject_id = $1`, [id]);
      expect(audit).toHaveLength(1);
    });
  });

  it("an ordinary session's presenter is still told (the WHEN changes nothing else)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(`select public.create_session('لقاء قادم', 'ملخص', $1, 'introductory', 'ar', $2::uuid[]) as id`, [
        f.a.categoryId,
        [f.a.members[1].memberId],
      ]);
      expect((await notificationsFor(tx, id)).map((n) => n.key)).toContain("MSG-presenter_assigned");
    });
  });

  it("a day that has not ended is refused, on the first schedule and on a later edit", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = await logPastEvent(tx, f);
      const future = new Date(Date.now() + HOUR).toISOString();
      expect(
        await errorMessage(() => tx.q(`select public.schedule_session($1, $2, 60, null, $3, null, null, null, 40, null, null, null, 'ar')`, [id, future, f.a.venueId])),
      ).toMatch(/past_event_not_past/);
      // Started an hour ago, ends in an hour: still running, so still refused.
      const running = new Date(Date.now() - HOUR).toISOString();
      expect(
        await errorMessage(() => tx.q(`select public.schedule_session($1, $2, 120, null, $3, null, null, null, 40, null, null, null, 'ar')`, [id, running, f.a.venueId])),
      ).toMatch(/past_event_not_past/);
    });
  });

  it("the flag is immutable, and a past event cannot come from a proposal", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = await logPastEvent(tx, f);
      await tx.asOwner();
      expect(await errorMessage(() => tx.q(`update public.sessions set logged_retrospectively = false where id = $1`, [id]))).toMatch(/immutable/);
      await tx.as(f.a.admin.claims);
      expect(
        await errorMessage(() => tx.q(`select public.create_session(null, null, null, 'introductory', 'ar', '{}', gen_random_uuid(), true)`)),
      ).toMatch(/past_event_not_from_proposal/);
    });
  });
});

describe("RPC-publish_past_session", () => {
  it("publishes straight to completed at the event's own end — no notification, no story, no reminder", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = await logPastEvent(tx, f);
      const [s] = await tx.q<{ state: string; completed_at: string; ends_at: string }>(`select * from public.publish_past_session($1)`, [id]);
      expect(s.state).toBe("completed");
      expect(new Date(s.completed_at).getTime()).toBe(new Date(s.ends_at).getTime());

      await tx.asOwner();
      expect(await notificationsFor(tx, id)).toHaveLength(0);
      expect(await tx.q(`select 1 from public.story_frames where session_id = $1`, [id])).toHaveLength(0);
      const transitions = await tx.q<{ to_state: string }>(
        `select to_state from public.session_state_transitions where session_id = $1 order by occurred_at, to_state`,
        [id],
      );
      expect(transitions.map((t) => t.to_state)).toEqual(expect.arrayContaining(["published", "in_progress", "completed"]));
      const reminders = await tx.q(
        `select 1 from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id
          where t.identifier in ('send_reminder', 'rating_prompt') and j.payload::text like '%' || $1 || '%'`,
        [id],
      );
      expect(reminders).toHaveLength(0);
    });
  });

  it("refuses an ordinary session, and is idempotent on a completed past event", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [{ id: ordinary }] = await tx.q<{ id: string }>(`select public.create_session('عادية', 'ملخص', $1) as id`, [f.a.categoryId]);
      expect(await errorMessage(() => tx.q(`select public.publish_past_session($1)`, [ordinary]))).toMatch(/not_a_past_event/);

      const id = await logPastEvent(tx, f);
      await tx.q(`select public.publish_past_session($1)`, [id]);
      const [again] = await tx.q<{ state: string }>(`select state from public.publish_past_session($1)`, [id]);
      expect(again.state).toBe("completed");
    });
  });

  it("a member cannot call it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = await logPastEvent(tx, f);
      await tx.as(f.a.members[0].claims);
      expect(await errorMessage(() => tx.q(`select public.publish_past_session($1)`, [id]))).toMatch(/./);
    });
  });
});

describe("TRG-past_event.silent and TRG-past_event.dated", () => {
  it("a hand-mark arrives at the day's start, mails nothing, and its points are dated to the event", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = await logPastEvent(tx, f, { endedHoursAgo: 24 * 20 });
      await tx.q(`select public.publish_past_session($1)`, [id]);
      const attendee = f.a.members[0].memberId;
      const [ci] = await tx.q<{ id: string; arrived_at: string }>(`select * from public.mark_checked_in_manually($1, $2, $3)`, [id, attendee, "سُجّلت بأثر رجعي"]);

      await tx.asOwner();
      const [s] = await tx.q<{ starts_at: string; ends_at: string }>(`select starts_at, ends_at from public.sessions where id = $1`, [id]);
      expect(new Date(ci.arrived_at).getTime()).toBe(new Date(s.starts_at).getTime());
      expect(await notificationsFor(tx, id)).toHaveLength(0);

      const [job] = await tx.q<{ payload: { rule: string; member_id: string; source: string; source_id: string; session_id: string | null } }>(
        `select j.payload from graphile_worker._private_jobs j join graphile_worker._private_tasks t on t.id = j.task_id
          where t.identifier = 'award_points' and j.payload->>'source' = 'check_in' and j.payload->>'member_id' = $1`,
        [attendee],
      );
      expect(job).toBeDefined();
      await tx.asServiceRole();
      await tx.q(`select public.award_points($1, $2, $3, $4, $5)`, [job.payload.rule, job.payload.member_id, job.payload.source, job.payload.source_id, job.payload.session_id]);
      await tx.asOwner();
      const ledger = await tx.q<{ occurred_at: string }>(`select occurred_at from public.points_ledger where member_id = $1 and source = 'check_in' and source_id = $2`, [attendee, ci.id]);
      expect(ledger).toHaveLength(1);
      expect(new Date(ledger[0].occurred_at).getTime()).toBe(new Date(s.ends_at).getTime());
    });
  });

  it("an ordinary session's ledger row is still dated now", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const before = Date.now();
      await tx.asServiceRole();
      await tx.q(`select public.award_points('comment', $1, 'comment', gen_random_uuid(), null)`, [f.a.members[0].memberId]);
      await tx.asOwner();
      const rows = await tx.q<{ occurred_at: string }>(`select occurred_at from public.points_ledger where member_id = $1 and rule_key = 'comment'`, [f.a.members[0].memberId]);
      for (const r of rows) expect(new Date(r.occurred_at).getTime()).toBeGreaterThanOrEqual(before - 60_000);
    });
  });
});
