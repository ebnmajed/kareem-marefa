// notify (wave 20) — supabase/proposed/notify/w20_retry_calendar_sync.sql, «أعد المحاولة» on SCR-025.
//
// 03 §8.2 rows proven here:
//   RPC-retry_calendar_sync.self · RPC-retry_calendar_sync.not_others · RPC-retry_calendar_sync.only_failed ·
//   RPC-retry_calendar_sync.definer_only_callers
//
// Serves REQ-UIX-075, REQ-CAL-005, REQ-CAL-008 (DEC-218 §2.3). The function takes a row id and no member: the member
// is the JWT's, so another member's row, another org's and a missing one give the same answer and change nothing.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import type { Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "notify/w20_retry_calendar_sync.sql";

/** The fixture's attendee holds a confirmed seat on org A's published session (`fixture-m2.ts:70`). We give them a
 *  connection and one failed day, and clear the jobs the seed's own reservation enqueued. */
async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, FILE);
  await tx.asOwner();
  const session = f.m2.a.published;
  const attendee = f.a.members[1] ?? f.a.members[0];
  const [rsvp] = await tx.q<{ id: string }>(`select id from public.rsvps where session_id = $1 and member_id = $2`, [session, attendee.memberId]);
  await tx.q(`delete from public.calendar_events`);
  await tx.q(`delete from public.calendar_connections`);
  await tx.q(`delete from graphile_worker._private_jobs where key like 'cal:%'`);
  await tx.q(`insert into public.calendar_connections (org_id, member_id, scope) values ($1, $2, 'calendar.events')`, [f.a.id, attendee.memberId]);
  const [event] = await tx.q<{ id: string }>(
    `insert into public.calendar_events (org_id, member_id, session_id, state, error)
     values ($1, $2, $3, 'failed', 'Google said no') returning id`,
    [f.a.id, attendee.memberId, session],
  );
  return { f, session, attendee, rsvp: rsvp.id, event: event.id };
}

const retry = (tx: Tx, event: string) =>
  tx.q<{ outcome: string }>(`select public.retry_calendar_sync($1) as outcome`, [event]).then((rows) => rows[0].outcome);

async function calJobs(tx: Tx) {
  await tx.asOwner();
  return tx.q<{ key: string; task_identifier: string }>(`select key, task_identifier from graphile_worker.jobs where key like 'cal:%'`);
}

async function stateOf(tx: Tx, event: string) {
  await tx.asOwner();
  return (await tx.q<{ state: string; error: string | null }>(`select state, error from public.calendar_events where id = $1`, [event]))[0];
}

describe("RPC-retry_calendar_sync", () => {
  it("self — the member re-queues their own failed day under the existing key, and it reads pending", async () => {
    await withTx(async (tx) => {
      const { attendee, rsvp, event } = await setup(tx);
      await tx.as(attendee.claims);
      expect(await retry(tx, event)).toBe("queued");

      expect(await calJobs(tx)).toEqual([{ key: `cal:${rsvp}`, task_identifier: "calendar_upsert" }]);
      expect(await stateOf(tx, event)).toEqual({ state: "pending", error: null });

      // A second tap replaces the pending job rather than adding one (`enqueue_job`'s replace mode) — and the row is
      // no longer failed, so the answer says so.
      await tx.as(attendee.claims);
      expect(await retry(tx, event)).toBe("not_failed");
      expect(await calJobs(tx)).toHaveLength(1);
    });
  });

  it("not_others — another member of the org, and a member of another org, get not_found and change nothing", async () => {
    await withTx(async (tx) => {
      const { f, attendee, event } = await setup(tx);
      const colleague = f.a.members.find((m) => m.memberId !== attendee.memberId) ?? f.a.admin;
      for (const claims of [colleague.claims, f.b.members[0].claims, f.a.admin.claims]) {
        await tx.as(claims);
        expect(await retry(tx, event)).toBe("not_found");
      }
      expect(await calJobs(tx)).toEqual([]);
      expect(await stateOf(tx, event)).toEqual({ state: "failed", error: "Google said no" });
    });
  });

  it("only_failed — a synced row is not retried, and nothing is enqueued", async () => {
    await withTx(async (tx) => {
      const { attendee, event } = await setup(tx);
      await tx.q(`update public.calendar_events set state = 'synced', error = null where id = $1`, [event]);
      await tx.as(attendee.claims);
      expect(await retry(tx, event)).toBe("not_failed");
      expect(await calJobs(tx)).toEqual([]);
    });
  });

  it("a member with no connection, or no confirmed seat, is told so and nothing moves", async () => {
    await withTx(async (tx) => {
      const { attendee, rsvp, event } = await setup(tx);
      await tx.q(`update public.rsvps set status = 'cancelled', cancelled_at = now() where id = $1`, [rsvp]);
      await tx.q(`update public.calendar_events set state = 'failed' where id = $1`, [event]);
      await tx.q(`delete from graphile_worker._private_jobs where key like 'cal%'`);
      await tx.as(attendee.claims);
      expect(await retry(tx, event)).toBe("not_reserved");

      await tx.asOwner();
      await tx.q(`update public.rsvps set status = 'confirmed', cancelled_at = null where id = $1`, [rsvp]);
      await tx.q(`delete from public.calendar_connections`);
      // Disconnecting marks every row removed (`0038`); put the failed row back to ask the connection question alone.
      await tx.q(`update public.calendar_events set state = 'failed' where id = $1`, [event]);
      await tx.q(`delete from graphile_worker._private_jobs where key like 'cal%'`);
      await tx.as(attendee.claims);
      expect(await retry(tx, event)).toBe("not_connected");
      expect(await calJobs(tx)).toEqual([]);
    });
  });

  it("definer_only_callers — authenticated may execute; anon may not", async () => {
    await withTx(async (tx) => {
      const { event } = await setup(tx);
      await tx.asAnon();
      expect(await errorCode(() => retry(tx, event))).toBe(PERMISSION_DENIED);
      await tx.asOwner();
      const grants = await tx.q<{ grantee: string }>(
        `select grantee from information_schema.routine_privileges
          where routine_schema = 'public' and routine_name = 'retry_calendar_sync' and privilege_type = 'EXECUTE'`,
      );
      const who = grants.map((g) => g.grantee);
      expect(who).toContain("authenticated");
      expect(who).not.toContain("anon");
      expect(who).not.toContain("PUBLIC");
    });
  });
});
