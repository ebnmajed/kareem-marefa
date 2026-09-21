// `job_exhausted` — a job that has used its last attempt raises an alert, and
// the super admin reads the task name and a count, never a payload.
//
// `queue_stalled` (0075) excludes dead jobs by design, so before this file a
// job that failed permanently raised nothing — for `record_survey_response`, a
// member's answers lost with no trace (DEC-160 §3). The SQL is
// `supabase/proposed/platform/0011_job_exhausted_alert.sql`.
//
// ★ `graphile_worker` is SHARED state: it outlives every transaction, and a
// developer's machine holds dead jobs of its own (a local worker's
// `issue_certificates` retries, for one). Every case deletes the dead jobs
// INSIDE its transaction before arranging its own, and the rollback puts them
// back — no real job is touched.
//
// 03 §8.2 rows proven here: RPC-evaluate_job_exhaustion.{worker_only, fires,
// running_last_attempt, clears, no_payload, not_installed},
// RPC-platform_job_health.{failed_agrees, no_org_reader}.
//
// REQ-NFR-016 · REQ-ADM-003 · 11 §3.2 · 11 §3.3 · DEC-014

import { describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, PERMISSION_DENIED, withTx, type Claims, type Tx } from "./db";
import { seedBase } from "./fixture";

const FILE = "platform/0011_job_exhausted_alert.sql";

type Reading = { alert: string; fired: boolean; detail: Record<string, unknown> };

function platformClaims(authUserId: string, email: string): Claims {
  return { sub: authUserId, email, platform_admin: true };
}

/** Remove every dead job inside the transaction, so a case sees only what it arranges. */
async function quiesce(tx: Tx) {
  await tx.asOwner();
  await tx.q(`delete from graphile_worker._private_jobs where attempts >= max_attempts`);
}

async function evaluate(tx: Tx): Promise<Reading[]> {
  await tx.asServiceRole();
  return tx.q<Reading>(`select alert, fired, detail from public.evaluate_job_exhaustion()`);
}

/** A job through add_job() (which creates the task row), then driven to its last attempt. */
async function deadJob(
  tx: Tx,
  task: string,
  opts: { payload?: unknown; key?: string; error?: string; locked?: boolean; attempts?: "all" | "some" } = {},
): Promise<string> {
  await tx.asOwner();
  const [{ id }] = await tx.q<{ id: string }>(
    `select (graphile_worker.add_job($1, $2::json, max_attempts => 3, job_key => $3)).id::text as id`,
    [task, JSON.stringify(opts.payload ?? {}), opts.key ?? null],
  );
  await tx.q(
    `update graphile_worker._private_jobs
        set attempts   = case when $2 = 'some' then 1 else max_attempts end,
            last_error = $3,
            run_at     = now() + interval '6 hours',
            locked_at  = case when $4 then now() else null end,
            locked_by  = case when $4 then 'drill-worker' else null end
      where id = $1::bigint`,
    [id, opts.attempts ?? "all", opts.error ?? null, opts.locked ?? false],
  );
  return id;
}

describe("platform — job_exhausted (wave 11)", () => {
  it("RPC-evaluate_job_exhaustion.worker_only — service_role answers; every other role is refused on the grant", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await applyProposed(tx, FILE);
      for (const claims of [
        f.a.members[0].claims,
        f.a.mod.claims,
        f.a.admin.claims,
        platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email),
      ]) {
        await tx.as(claims);
        expect(await errorCode(() => tx.q(`select * from public.evaluate_job_exhaustion()`))).toBe(PERMISSION_DENIED);
      }
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.evaluate_job_exhaustion()`))).toBe(PERMISSION_DENIED);

      expect(await evaluate(tx)).toHaveLength(1);
    });
  });

  it("RPC-evaluate_job_exhaustion.fires — quiet with no dead job; one dead survey response fires it, by task and count", async () => {
    await withTx(async (tx) => {
      await seedBase(tx);
      await applyProposed(tx, FILE);
      await quiesce(tx);

      const [quiet] = await evaluate(tx);
      expect(quiet).toEqual({ alert: "job_exhausted", fired: false, detail: { exhausted_jobs: 0, tasks: 0, by_task: {} } });

      await deadJob(tx, "record_survey_response");
      const [loud] = await evaluate(tx);
      expect(loud).toEqual({
        alert: "job_exhausted",
        fired: true,
        detail: { exhausted_jobs: 1, tasks: 1, by_task: { record_survey_response: 1 } },
      });
    });
  });

  it("RPC-evaluate_job_exhaustion.running_last_attempt — a locked last attempt and a job with attempts left are not counted", async () => {
    await withTx(async (tx) => {
      await seedBase(tx);
      await applyProposed(tx, FILE);
      await quiesce(tx);

      await deadJob(tx, "record_survey_response", { locked: true });
      await deadJob(tx, "send_notification", { attempts: "some" });
      // Overdue with attempts left: `queue_stalled`'s business, never this alert's.
      await tx.q(`select graphile_worker.add_job('send_notification', '{}'::json, run_at => now() - interval '1 hour')`);

      const [r] = await evaluate(tx);
      expect(r.fired).toBe(false);
      expect(r.detail).toEqual({ exhausted_jobs: 0, tasks: 0, by_task: {} });
    });
  });

  it("RPC-evaluate_job_exhaustion.clears — resolving one of two tasks leaves it firing; rescheduling and completing clear it", async () => {
    await withTx(async (tx) => {
      await seedBase(tx);
      await applyProposed(tx, FILE);
      await quiesce(tx);

      const survey = await deadJob(tx, "record_survey_response");
      const survey2 = await deadJob(tx, "record_survey_response");
      const cert = await deadJob(tx, "issue_certificates");
      let [r] = await evaluate(tx);
      expect(r.detail).toEqual({
        exhausted_jobs: 3,
        tasks: 2,
        by_task: { record_survey_response: 2, issue_certificates: 1 },
      });

      // Discarded — the operator decided the job cannot be recovered.
      await tx.asOwner();
      await tx.q(`select graphile_worker.complete_jobs(array[$1::bigint])`, [cert]);
      [r] = await evaluate(tx);
      expect(r.fired).toBe(true);
      expect(r.detail).toEqual({ exhausted_jobs: 2, tasks: 1, by_task: { record_survey_response: 2 } });

      // Replayed after a fix — the recovery path 11 §3.3 keeps the payload for.
      await tx.asOwner();
      await tx.q(`select graphile_worker.reschedule_jobs(array[$1::bigint, $2::bigint], attempts => 0)`, [survey, survey2]);
      [r] = await evaluate(tx);
      expect(r.fired).toBe(false);
      expect(r.detail).toEqual({ exhausted_jobs: 0, tasks: 0, by_task: {} });
    });
  });

  it("★ RPC-evaluate_job_exhaustion.no_payload — nothing from a job's payload, key or last error reaches the reading", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await applyProposed(tx, FILE);
      await quiesce(tx);

      const memberId = f.a.members[0].memberId;
      await deadJob(tx, "record_survey_response", {
        payload: { response_id: memberId, survey_id: f.a.id, answers: [{ text: "إجابة سرّية جدًّا" }] },
        key: `survey:${memberId}`,
        error: `boom for ${memberId}: إجابة سرّية جدًّا`,
      });

      const [r] = await evaluate(tx);
      expect(r.fired).toBe(true);
      const text = JSON.stringify(r);
      expect(text).not.toContain(memberId);
      expect(text).not.toContain(f.a.id);
      expect(text).not.toContain("سرّية");
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
      expect(Object.keys(r.detail).sort()).toEqual(["by_task", "exhausted_jobs", "tasks"]);
      expect(r.detail.by_task).toEqual({ record_survey_response: 1 });
    });
  });

  it("RPC-evaluate_job_exhaustion.not_installed — without graphile_worker it says so rather than raising", async () => {
    await withTx(async (tx) => {
      await seedBase(tx);
      await applyProposed(tx, FILE);
      await tx.asOwner();
      await tx.q(`alter schema graphile_worker rename to graphile_worker_hidden`);

      const [r] = await evaluate(tx);
      expect(r).toEqual({ alert: "job_exhausted", fired: false, detail: { status: "not_installed" } });
    });
  });
});

describe("platform — the console's dead count agrees with the alert (wave 11)", () => {
  it("★ RPC-platform_job_health.no_org_reader — no org role reads job health or the queue itself", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await applyProposed(tx, FILE);
      await deadJob(tx, "record_survey_response");

      for (const claims of [f.a.members[0].claims, f.a.mod.claims, f.a.admin.claims, f.b.admin.claims]) {
        await tx.as(claims);
        expect(await errorMessage(() => tx.q(`select * from public.platform_job_health()`))).toMatch(/not_platform_admin/);
        // No side door to a payload: the queue's own tables are closed to every client role.
        expect(await errorCode(() => tx.q(`select payload from graphile_worker._private_jobs limit 1`))).toBe(
          PERMISSION_DENIED,
        );
      }
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.platform_job_health()`))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`select payload from graphile_worker._private_jobs limit 1`))).toBe(
        PERMISSION_DENIED,
      );
    });
  });

  it("RPC-platform_job_health.failed_agrees — `failed` is the alert's count; a running last attempt is not failed", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await applyProposed(tx, FILE);
      await quiesce(tx);
      await tx.q(`delete from graphile_worker._private_jobs where locked_at is not null`);

      await deadJob(tx, "record_survey_response", { payload: { answers: ["سرّ"] }, error: "سرّ" });
      await deadJob(tx, "record_survey_response", { locked: true });

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const rows = await tx.q<{ task_identifier: string; failed: string }>(
        `select task_identifier, failed::text from public.platform_job_health()`,
      );
      const survey = rows.find((r) => r.task_identifier === "record_survey_response");
      expect(survey?.failed).toBe("1");
      expect(JSON.stringify(rows)).not.toContain("سرّ");

      const [alert] = await evaluate(tx);
      expect((alert.detail.by_task as Record<string, number>).record_survey_response).toBe(Number(survey?.failed));
    });
  });
});
