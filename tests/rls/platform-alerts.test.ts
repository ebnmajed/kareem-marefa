// ★ THE ALERT DRILL — `14` M8's third demonstrable: "every `11` §3.2 alert
// fires in a drill".
//
// Eight conditions, eight alerts, and each one proven not to fire the other
// seven. A drill that only checked "the alert fired" would pass a function
// that fired everything, which is the failure mode that actually happens: an
// alerting system nobody trusts is an alerting system where one real page
// arrived inside nine false ones.
//
// So every case below asserts the SET of firing alerts is exactly `[theOne]`,
// and then clears the condition and asserts the set is empty again. The
// transition logic itself — fire once, clear once — is the sink's and is
// drilled separately in tests/unit/platform-alerts.test.ts.
//
// The SQL is migration `0075_alerts.sql` (proposed as platform/0006). The
// `applyProposed` guard below is what lets this file survive the promotion:
// once the migration exists the proposed copy is gone and the guard skips it.
//
// REQ-NFR-016 · 11 §3.1 · 11 §3.2

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, withTx, type Tx } from "./db";
import { seed } from "./fixture";

const FILES = ["platform/0005_enum_types.sql", "platform/0006_alerts.sql"];

async function apply(tx: Tx) {
  for (const file of FILES) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
}

/** The eight of `11` §3.2, in the document's order. */
const ALERTS = [
  "queue_stalled",
  "ledger_divergence",
  "parity_failure",
  "calendar_backlog",
  "email_bounce_spike",
  "render_failures",
  "storage_prefix_violation",
  "impersonation_active",
];

type Reading = { alert: string; fired: boolean; detail: Record<string, unknown> };

async function evaluate(tx: Tx): Promise<Reading[]> {
  await tx.asServiceRole();
  return tx.q<Reading>(`select alert, fired, detail from public.evaluate_alerts() order by alert`);
}

async function firing(tx: Tx): Promise<string[]> {
  return (await evaluate(tx)).filter((r) => r.fired).map((r) => r.alert).sort();
}

/**
 * ★ Make all eight quiet before each case arranges exactly one.
 *
 * Two of the eight read state that is NOT part of any fixture:
 * `graphile_worker`'s schema is shared and outlives every transaction, so a job
 * another run left overdue fires `queue_stalled` in every case here; and the
 * M3 fixture sends its own email, which moves a one-hour bounce rate. Both are
 * neutralised inside the transaction and rolled back with it, so no real job
 * and no real delivery is touched.
 *
 * Without this the drill passes or fails on what the machine happened to be
 * doing, which is the one thing a drill must not do.
 */
async function quiesce(tx: Tx) {
  await tx.asOwner();
  await tx.q(`delete from graphile_worker._private_jobs where run_at <= now()`);
  await tx.q(`update public.email_deliveries set created_at = now() - interval '2 days'`);
}

describe("platform — the alert drill (11 §3.2)", () => {
  it("RPC-evaluate_alerts.worker — worker-only", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.evaluate_alerts()`))).toBe(PERMISSION_DENIED);
      await tx.as({ sub: f.platformAdmin.authUserId, email: f.platformAdmin.email, platform_admin: true });
      expect(await errorCode(() => tx.q(`select * from public.evaluate_alerts()`))).toBe(PERMISSION_DENIED);
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.evaluate_alerts()`))).toBe(PERMISSION_DENIED);
    });
  });

  it("RPC-evaluate_alerts.eight — all eight come back on every call, firing or not", async () => {
    await withTx(async (tx) => {
      await seed(tx);
      await apply(tx);
      await quiesce(tx);
      const readings = await evaluate(tx);
      expect(readings.map((r) => r.alert).sort()).toEqual([...ALERTS].sort());
      // Every one carries a detail a human can act on — a bare boolean tells
      // an on-call engineer nothing about how far past the threshold it is.
      for (const r of readings) expect(Object.keys(r.detail).length, r.alert).toBeGreaterThan(0);
    });
  });

  it("a quiet database fires nothing", async () => {
    await withTx(async (tx) => {
      await seed(tx);
      await apply(tx);
      await quiesce(tx);
      expect(await firing(tx)).toEqual([]);
    });
  });

  // ── The eight, one at a time ───────────────────────────────────────────
  //
  // Each seeds its own condition, asserts EXACTLY that alert fires, then
  // removes the condition and asserts nothing fires.

  it("★ ledger_divergence fires alone, and clears", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await quiesce(tx);
      const [row] = await tx.q<{ id: string }>(
        `insert into public.audit_log (org_id, actor_role, action, subject_type)
         values ($1, 'system', 'points.balance_divergence', 'points_balances') returning id`,
        [f.a.id],
      );
      expect(await firing(tx)).toEqual(["ledger_divergence"]);

      await tx.asOwner();
      // `audit_log` is append-only for every client role; the owner removes the
      // fixture row the way a retention sweep would.
      await tx.q(`delete from public.audit_log where id = $1`, [row.id]);
      expect(await firing(tx)).toEqual([]);
    });
  });

  it("★ parity_failure fires alone, and clears", async () => {
    await withTx(async (tx) => {
      await seed(tx);
      await apply(tx);
      await quiesce(tx);
      const sha = "f".repeat(64);
      await tx.q(
        `insert into public.fonts (family, style, weight, source, storage_path, sha256, subsets, parity_status, parity_report)
         values ('Drill Sans', 'normal', 400, 'google', $1, $2, '{arabic}', 'failed', '{"tier_a":"failed"}'::jsonb)`,
        [`${sha}.woff2`, sha],
      );
      expect(await firing(tx)).toEqual(["parity_failure"]);

      await tx.asOwner();
      await tx.q(`delete from public.fonts where sha256 = $1`, [sha]);
      expect(await firing(tx)).toEqual([]);
    });
  });

  it("★ calendar_backlog fires alone on AGE, and clears", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await quiesce(tx);
      // One pending event older than fifteen minutes: the OR arm that catches
      // a stuck sync long before fifty pile up.
      const [row] = await tx.q<{ id: string }>(
        `insert into public.calendar_events (org_id, member_id, session_id, state, created_at, updated_at)
         select $1, $2, s.id, 'pending', now() - interval '1 hour', now() - interval '1 hour'
           from public.sessions s
          where s.org_id = $1
            and not exists (select 1 from public.calendar_events c
                             where c.session_id = s.id and c.member_id = $2)
          limit 1
         returning id`,
        [f.a.id, f.a.members[0].memberId],
      );
      expect(await firing(tx)).toEqual(["calendar_backlog"]);

      await tx.asOwner();
      await tx.q(`update public.calendar_events set state = 'synced' where id = $1`, [row.id]);
      expect(await firing(tx)).toEqual([]);
    });
  });

  it("★ email_bounce_spike fires alone above the floor, and NOT below it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await quiesce(tx);
      // Three sends, all bounced: a 100 % rate on a denominator of three. It
      // must NOT fire — one bad address in a small batch is not a mail-server
      // change, and paging on it is how people learn to ignore the page.
      const insert = async (status: string, n: number) => {
        // `firing()` leaves the transaction as `service_role`, which has no
        // grant on this table — the fixture arranges history as the owner.
        await tx.asOwner();
        return tx.q(
          `insert into public.email_deliveries (org_id, member_id, key, status)
           select $1, $2, 'MSG-drill', $3::public.delivery_status from generate_series(1, $4)`,
          [f.a.id, f.a.members[0].memberId, status, n],
        );
      };
      await insert("bounced", 3);
      expect(await firing(tx)).toEqual([]);

      // Twenty-five sends with two bounces: 8 %, over the floor and over 5 %.
      await insert("delivered", 22);
      expect(await firing(tx)).toEqual(["email_bounce_spike"]);

      // The same twenty-five with the bounces delivered instead: quiet again.
      await tx.asOwner();
      await tx.q(`update public.email_deliveries set status = 'delivered' where key = 'MSG-drill'`);
      expect(await firing(tx)).toEqual([]);
    });
  });

  it("★ render_failures fires alone on three in a row, and clears on one success", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await quiesce(tx);
      const add = (status: string, i: number) =>
        tx.q(
          `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px,
                                                storage_path, status, source_fingerprint, created_at, error)
           values ($1, $2, 'master', 'png', 1200, 1600, $3, $4::public.export_status, $5,
                   now() + make_interval(secs => $6), case when $4 = 'failed' then 'drill' end)`,
          [f.a.id, f.m6.a.documentId, `${f.a.id}/exports/drill-${i}.png`, status, `drill-${i}`, i],
        );
      await add("failed", 1);
      await add("failed", 2);
      expect(await firing(tx), "two in a row is not yet the signal").toEqual([]);
      await tx.asOwner();
      await add("failed", 3);
      expect(await firing(tx)).toEqual(["render_failures"]);

      // One success breaks the run — the alert is about a RUN, not a total.
      await tx.asOwner();
      await add("ready", 4);
      expect(await firing(tx)).toEqual([]);
    });
  });

  it("★ storage_prefix_violation fires alone — the two jobs meet through the trail", async () => {
    await withTx(async (tx) => {
      await seed(tx);
      await apply(tx);
      await quiesce(tx);
      await tx.asServiceRole();
      // Written exactly the way `assert_storage_prefixes` writes it.
      await tx.q(
        `select public.write_platform_audit('storage.prefix_violation', null, 'bucket', null, null, $1::jsonb, $2)`,
        [JSON.stringify({ count: 1, sample: [{ bucket: "materials", path: "not-an-org/x.pdf" }] }), "drill"],
      );
      expect(await firing(tx)).toEqual(["storage_prefix_violation"]);

      await tx.asOwner();
      await tx.q(`delete from public.platform_audit_log where action = 'storage.prefix_violation'`);
      expect(await firing(tx)).toEqual([]);
    });
  });

  it("★ impersonation_active fires alone past two hours, and clears when the session ends", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await quiesce(tx);
      // Inside the table's four-hour cap and past the two-hour warning.
      const [s] = await tx.q<{ id: string }>(
        `insert into public.impersonation_sessions (org_id, platform_admin_id, reason, started_at, expires_at)
         values ($1, $2, 'جلسة نُسيت مفتوحة', now() - interval '3 hours', now() + interval '30 minutes')
         returning id`,
        [f.a.id, f.platformAdmin.authUserId],
      );
      expect(await firing(tx)).toEqual(["impersonation_active"]);

      await tx.asServiceRole();
      await tx.q(`select public.end_impersonation($1)`, [s.id]);
      expect(await firing(tx)).toEqual([]);
    });
  });

  it("★ queue_stalled fires alone when the oldest pending job is older than five minutes", async () => {
    await withTx(async (tx) => {
      await seed(tx);
      await apply(tx);
      await quiesce(tx);
      // Straight into the queue, with a run_at in the past: this is what a
      // degraded LISTEN/NOTIFY looks like (11 §1.2), and it is the only
      // symptom that distinguishes it from a healthy idle worker.
      // Through add_job(), which CREATES the task row. `_private_tasks` is
      // empty after a fresh reset until a worker has run, so an insert that
      // selects a task id inserts nothing and the case proves nothing — the
      // lead found exactly that in this track's job-health case.
      await tx.q(
        `select graphile_worker.add_job('expire_impersonation', '{}'::json, run_at => now() - interval '30 minutes')`,
      );
      expect(await firing(tx)).toEqual(["queue_stalled"]);

      await tx.asOwner();
      await tx.q(`delete from graphile_worker._private_jobs where run_at < now() - interval '20 minutes'`);
      expect(await firing(tx)).toEqual([]);
    });
  });

  it("★ all eight fire together when everything is wrong, and none is missing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await quiesce(tx);

      await tx.q(
        `insert into public.audit_log (org_id, actor_role, action) values ($1, 'system', 'points.balance_divergence')`,
        [f.a.id],
      );
      const sha = "e".repeat(64);
      await tx.q(
        `insert into public.fonts (family, style, weight, source, storage_path, sha256, subsets, parity_status)
         values ('Drill Two', 'normal', 400, 'google', $1, $2, '{arabic}', 'failed')`,
        [`${sha}.woff2`, sha],
      );
      await tx.q(
        `insert into public.calendar_events (org_id, member_id, session_id, state, created_at, updated_at)
         select $1, $2, s.id, 'pending', now() - interval '1 hour', now() - interval '1 hour'
           from public.sessions s
          where s.org_id = $1
            and not exists (select 1 from public.calendar_events c
                             where c.session_id = s.id and c.member_id = $2)
          limit 1`,
        [f.a.id, f.a.members[0].memberId],
      );
      await tx.q(
        `insert into public.email_deliveries (org_id, member_id, key, status)
         select $1, $2, 'MSG-drill-all', 'bounced'::public.delivery_status from generate_series(1, 25)`,
        [f.a.id, f.a.members[0].memberId],
      );
      for (let i = 1; i <= 3; i++) {
        await tx.q(
          `insert into public.export_artifacts (org_id, document_id, preset, format, width_px, height_px,
                                                storage_path, status, source_fingerprint, created_at, error)
           values ($1, $2, 'master', 'png', 1200, 1600, $3, 'failed', $4, now() + make_interval(secs => $5), 'drill')`,
          [f.a.id, f.m6.a.documentId, `${f.a.id}/exports/all-${i}.png`, `all-${i}`, i],
        );
      }
      await tx.q(
        `insert into public.impersonation_sessions (org_id, platform_admin_id, reason, started_at, expires_at)
         values ($1, $2, 'كل شيء يشتعل', now() - interval '3 hours', now() + interval '30 minutes')`,
        [f.a.id, f.platformAdmin.authUserId],
      );
      await tx.q(
        `select graphile_worker.add_job('expire_impersonation', '{}'::json, run_at => now() - interval '30 minutes')`,
      );
      await tx.asServiceRole();
      await tx.q(`select public.write_platform_audit('storage.prefix_violation', null, 'bucket', null, null, '{}'::jsonb, 'drill')`);

      // ★ The demonstrable: every alert in `11` §3.2 fires.
      expect(await firing(tx)).toEqual([...ALERTS].sort());
    });
  });
});
