// Migration 0025 — public.enqueue_job(), the one door from SQL to the queue
// (02 §4.17, 11 §1.1, DEC-046).
//
// 03 §8.2 rows: RPC-enqueue_job.definer_only, RPC-enqueue_job.replace,
//               RPC-enqueue_job.loud
//
// The graphile_worker schema is installed by scripts/rls.mjs (locally) and
// the CI `rls` job before this file runs. Everything here is inside the
// test's transaction and rolled back — no job ever reaches a real worker.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const enqueue = (tx: Tx, task: string, key: string | null = null, runAt: string | null = null) =>
  tx.q<{ id: string }>(`select public.enqueue_job($1, '{"hello":"world"}'::jsonb, $2, $3::timestamptz) as id`, [task, key, runAt]);

const pending = (tx: Tx, key: string) =>
  tx.q<{ task_identifier: string; run_at: string }>(`select task_identifier, run_at from graphile_worker.jobs where key = $1`, [key]);

describe("RPC-enqueue_job.definer_only", () => {
  it("refuses every client role on the grant", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      for (const who of [f.a.members[0].claims, f.a.mod.claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(() => enqueue(tx, "ping"))).toBe(PERMISSION_DENIED);
      }
      await tx.asAnon();
      expect(await errorCode(() => enqueue(tx, "ping"))).toBe(PERMISSION_DENIED);
    });
  });

  it("the worker's role and the migration owner can enqueue", async () => {
    await withTx(async (tx) => {
      await tx.asServiceRole();
      expect((await enqueue(tx, "ping", "test:svc"))[0].id).toMatch(/^\d+$/);
      await tx.asOwner();
      expect((await enqueue(tx, "ping", "test:owner"))[0].id).toMatch(/^\d+$/);
      expect(await pending(tx, "test:svc")).toHaveLength(1);
    });
  });

  it("refuses a task name that is not a snake_case identifier", async () => {
    await withTx(async (tx) => {
      await tx.asOwner();
      expect(await errorCode(() => enqueue(tx, "Send Notification"))).toBe("22023");
      expect(await errorCode(() => enqueue(tx, "drop table; --"))).toBe("22023");
    });
  });
});

describe("RPC-enqueue_job.replace", () => {
  it("one key, one pending job, moved to the later run_at (REQ-NTF-004)", async () => {
    await withTx(async (tx) => {
      await tx.asOwner();
      await enqueue(tx, "send_reminder", "remind:s1:24h:m1", "2030-01-01T10:00:00Z");
      await enqueue(tx, "send_reminder", "remind:s1:24h:m1", "2030-01-02T10:00:00Z");
      const rows = await pending(tx, "remind:s1:24h:m1");
      expect(rows).toHaveLength(1);
      expect(rows[0].task_identifier).toBe("send_reminder");
      expect(new Date(rows[0].run_at).toISOString()).toBe("2030-01-02T10:00:00.000Z");
    });
  });
});

describe("RPC-enqueue_job.loud", () => {
  it("names the fix when the schema is missing, instead of dropping the job", async () => {
    await withTx(async (tx) => {
      await tx.asOwner();
      // DDL is transactional: the schema is back at rollback.
      await tx.q(`drop schema graphile_worker cascade`);
      expect(await errorCode(() => enqueue(tx, "ping"))).toBe("3F000");
    });
  });
});
