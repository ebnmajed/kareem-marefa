// notify (wave 10, N5) — supabase/proposed/notify/0003_send_test_email.sql.
//
// 03 §8.2 rows proven here:
//   RPC-send_test_email.own_address_only · RPC-send_test_email.admin_only ·
//   RPC-send_test_email.matrix_closed · RPC-send_test_email.rate_limited ·
//   RPC-send_test_email.audited
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const FILE = "notify/0003_send_test_email.sql";

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, FILE);
  await tx.asOwner();
  await tx.q(`delete from public.audit_log where action = 'notify.test_email_sent'`);
  await tx.q(`delete from graphile_worker._private_jobs`);
  return f;
}

const send = (tx: Tx, key = "MSG-reminder_1d", locale = "ar") =>
  tx.q<{ out: { status: string; remaining?: number; retry_after_minutes?: number } }>(
    `select public.send_test_email($1, $2) as out`,
    [key, locale],
  );

describe("RPC-send_test_email.own_address_only", () => {
  it("★ the function takes NO address — «to the admin's own and no other» is the SIGNATURE, not a check", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      const args = await tx.q<{ args: string }>(
        `select pg_get_function_identity_arguments(p.oid) as args
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'send_test_email'`,
      );
      // One overload, and neither parameter can name a person. A function that
      // TOOK an address would be one forgotten `if` away from mailing anyone.
      expect(args).toHaveLength(1);
      expect(args[0].args).toBe("p_key text, p_locale text");
    });
  });

  it("the queued job names the CALLER as the recipient, and carries no address at all", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await send(tx);
      await tx.asOwner();
      const jobs = await tx.q<{ payload: Record<string, unknown> }>(
        `select p.payload from graphile_worker.jobs j join graphile_worker._private_jobs p on p.id = j.id
          where j.task_identifier = 'send_test_email'`,
      );
      expect(jobs).toHaveLength(1);
      expect(jobs[0].payload.member_id).toBe(f.a.admin.memberId);
      expect(JSON.stringify(jobs[0].payload)).not.toContain("@");
    });
  });
});

describe("RPC-send_test_email.admin_only and .matrix_closed", () => {
  it("a moderator and a member are refused; the org's admin succeeds", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.mod.claims);
      expect(await errorCode(() => send(tx))).toBe(PERMISSION_DENIED);
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => send(tx))).toBe(PERMISSION_DENIED);
      await tx.as(f.a.admin.claims);
      expect((await send(tx))[0].out.status).toBe("queued");
    });
  });

  it("★ a key with no email channel is refused — a test is not a way to send what the product does not send", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      // In the matrix, but in-app only.
      expect(await errorCode(() => send(tx, "MSG-photo_hidden"))).toBe("22023");
      // Not in the matrix at all.
      expect(await errorCode(() => send(tx, "MSG-not-a-message"))).toBe("22023");
      // And a locale the templates do not carry.
      expect(await errorCode(() => send(tx, "MSG-reminder_1d", "fr"))).toBe("22023");
    });
  });
});

describe("RPC-send_test_email.rate_limited", () => {
  it("★ the eleventh call in an hour is refused and writes NOTHING — no audit row, no job", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      for (let i = 0; i < 10; i += 1) {
        const [{ out }] = await send(tx);
        expect(out.status, `call ${i + 1}`).toBe("queued");
      }
      const [{ out }] = await send(tx);
      expect(out.status).toBe("rate_limited");
      expect(out.retry_after_minutes).toBe(60);

      await tx.asOwner();
      // Ten, not eleven: the limit precedes every write, so the refusal needs
      // no rollback (`DEC-043`).
      const audits = await tx.q(`select id from public.audit_log where action = 'notify.test_email_sent'`);
      expect(audits).toHaveLength(10);
    });
  });

  it("another admin's calls do not count against this one's", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      // Ten rows for a DIFFERENT actor in this org.
      for (let i = 0; i < 10; i += 1) {
        await tx.q(
          `insert into public.audit_log (org_id, actor_id, actor_role, action) values ($1, $2, 'admin', 'notify.test_email_sent')`,
          [f.a.id, f.a.mod.memberId],
        );
      }
      await tx.as(f.a.admin.claims);
      expect((await send(tx))[0].out.status).toBe("queued");
    });
  });
});

describe("RPC-send_test_email.audited", () => {
  it("one row, carrying the key and the locale — and never an address", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await send(tx, "MSG-reminder_1d", "ar");
      await tx.asOwner();
      const rows = await tx.q<{ after: Record<string, unknown>; actor_id: string; subject_type: string }>(
        `select after, actor_id, subject_type from public.audit_log where action = 'notify.test_email_sent'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].after).toEqual({ key: "MSG-reminder_1d", locale: "ar" });
      expect(rows[0].actor_id).toBe(f.a.admin.memberId);
      // ★ The actor IS the recipient, so recording the address would put an
      // email in an append-only log for no gain.
      expect(JSON.stringify(rows[0].after)).not.toContain("@");
    });
  });
});
