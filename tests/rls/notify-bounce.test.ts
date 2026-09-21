// notify (wave 10, N8) — supabase/proposed/notify/0004_resend_webhook.sql.
//
// 03 §8.2 rows proven here:
//   RPC-resend_webhook.signature_required · RPC-resend_webhook.replay_window ·
//   RPC-resend_webhook.anon_granted · RPC-resend_webhook.moves_only_existing ·
//   RPC-resend_webhook.unconfigured_is_quiet
//
// New behaviour, so a new file. `tests/rls/notify-send.test.ts` is evidence for
// `update_email_delivery_by_provider()` as M3 shipped it, and this function
// does not change it — it only becomes the one thing allowed to call it
// without `service_role`.
import { createHmac } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const FILE = "notify/0004_resend_webhook.sql";
const SECRET_RAW = Buffer.from("a-shared-secret-of-some-length!!").toString("base64");
const SECRET = `whsec_${SECRET_RAW}`;
const PROVIDER_ID = "resend-msg-0001";

interface Outcome {
  status: string;
  reason?: string;
  type?: string;
}

/** Svix's scheme, computed independently of the SQL: signed content is
 *  `{id}.{timestamp}.{body}`, the key is the base64 after `whsec_`. A test
 *  that reused the function's own expression would prove only that it equals
 *  itself. */
function sign(id: string, ts: number, body: string, secret = SECRET_RAW): string {
  return `v1,${createHmac("sha256", Buffer.from(secret, "base64")).update(`${id}.${ts}.${body}`).digest("base64")}`;
}

const now = () => Math.floor(Date.now() / 1000);

const bodyFor = (type: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type, created_at: new Date().toISOString(), data: { email_id: PROVIDER_ID, ...extra } });

async function setup(tx: Tx, { secret = true }: { secret?: boolean } = {}) {
  const f = await seed(tx);
  await applyProposed(tx, FILE);
  await tx.asOwner();
  await tx.q(`delete from vault.secrets where name = 'resend_webhook_secret'`);
  if (secret) await tx.q(`select vault.create_secret($1, 'resend_webhook_secret')`, [SECRET]);
  await tx.q(`delete from public.email_deliveries`);
  await tx.q(
    `insert into public.email_deliveries (org_id, member_id, key, status, provider_message_id)
     values ($1, $2, 'MSG-reminder_1d', 'sent', $3)`,
    [f.a.id, f.a.members[0].memberId, PROVIDER_ID],
  );
  return f;
}

const call = (tx: Tx, id: string, ts: number, sig: string, body: string) =>
  tx.q<{ out: Outcome }>(`select public.resend_webhook($1, $2, $3, $4) as out`, [id, String(ts), sig, body]);

const statusOf = async (tx: Tx) => {
  const rows = await tx.q<{ status: string; error: string | null }>(
    `select status, error from public.email_deliveries where provider_message_id = $1`,
    [PROVIDER_ID],
  );
  return rows[0];
};

describe("RPC-resend_webhook.anon_granted and .moves_only_existing", () => {
  it("★ anon may call it — a provider webhook carries no session and never will", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asAnon();
      const ts = now();
      const body = bodyFor("email.delivered");
      const [{ out }] = await call(tx, "msg_1", ts, sign("msg_1", ts, body), body);
      expect(out.status).toBe("applied");
      await tx.asOwner();
      expect((await statusOf(tx)).status).toBe("delivered");
    });
  });

  it("a bounce lands with its REASON — REQ-NTF-008's «with the reason» is the whole point", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asAnon();
      const ts = now();
      const body = bodyFor("email.bounced", { bounce: { type: "Permanent", message: "The recipient's address does not exist" } });
      const [{ out }] = await call(tx, "msg_2", ts, sign("msg_2", ts, body), body);
      expect(out.status).toBe("applied");
      await tx.asOwner();
      const row = await statusOf(tx);
      expect(row.status).toBe("bounced");
      expect(row.error).toBe("The recipient's address does not exist");
    });
  });

  it("★ a VERIFIED body for a message this deployment never sent creates nothing", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asAnon();
      const ts = now();
      const body = JSON.stringify({ type: "email.bounced", data: { email_id: "never-sent-this" } });
      const [{ out }] = await call(tx, "msg_3", ts, sign("msg_3", ts, body), body);
      // Not an error: a shared provider account or a restored database both
      // produce this, and 200 stops an endless retry.
      expect(out.status).toBe("unknown_message");
      await tx.asOwner();
      const rows = await tx.q(`select id from public.email_deliveries`);
      expect(rows).toHaveLength(1);
    });
  });

  it("the two ignored events are ignored, and the row does not move", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asAnon();
      for (const type of ["email.delivery_delayed", "email.complained"]) {
        const ts = now();
        const body = bodyFor(type);
        const [{ out }] = await call(tx, type, ts, sign(type, ts, body), body);
        expect(out.status, type).toBe("ignored");
        expect(out.type, type).toBe(type);
      }
      await tx.asOwner();
      // ★ `delivery_status` has no value for a complaint, and every available
      // one would lie. The gap is a request to the lead, not a mapping.
      expect((await statusOf(tx)).status).toBe("sent");
    });
  });
});

describe("RPC-resend_webhook.signature_required", () => {
  it("★ no signature, a wrong one, and one over DIFFERENT bytes are all rejected", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asAnon();
      const ts = now();
      const body = bodyFor("email.bounced");

      expect((await call(tx, "m", ts, "", body))[0].out).toMatchObject({ status: "rejected" });
      expect((await call(tx, "m", ts, "v1,bm90LWEtc2lnbmF0dXJl", body))[0].out).toMatchObject({ status: "rejected", reason: "signature" });
      // A signature made with the right secret over ANOTHER body: this is the
      // one an attacker actually has, having captured a real webhook.
      const other = bodyFor("email.delivered");
      expect((await call(tx, "m", ts, sign("m", ts, other), body))[0].out).toMatchObject({ status: "rejected", reason: "signature" });
      // The right body under the WRONG id — the id is part of the signed
      // content, so this must fail too.
      expect((await call(tx, "m", ts, sign("other-id", ts, body), body))[0].out).toMatchObject({ status: "rejected", reason: "signature" });
      // And a signature from a different secret entirely.
      const wrongKey = Buffer.from("a-different-secret-entirely!!!!!").toString("base64");
      expect((await call(tx, "m", ts, sign("m", ts, body, wrongKey), body))[0].out).toMatchObject({ status: "rejected", reason: "signature" });

      await tx.asOwner();
      expect((await statusOf(tx)).status).toBe("sent");
    });
  });

  it("a `whsec_` prefix on the stored secret is stripped — it is how the provider prints it", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asAnon();
      const ts = now();
      const body = bodyFor("email.delivered");
      // `sign()` used the bare base64; the vault holds it with the prefix.
      expect((await call(tx, "m", ts, sign("m", ts, body), body))[0].out.status).toBe("applied");
    });
  });

  it("a header carrying SEVERAL versions is accepted when one matches — rotation needs both to work", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asAnon();
      const ts = now();
      const body = bodyFor("email.delivered");
      const header = `v1,b2xkLXNpZ25hdHVyZQ== ${sign("m", ts, body)}`;
      expect((await call(tx, "m", ts, header, body))[0].out.status).toBe("applied");
    });
  });
});

describe("RPC-resend_webhook.replay_window", () => {
  it("★ a correctly-signed body from six minutes ago is refused — a signature is valid forever", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asAnon();
      const stale = now() - 360;
      const body = bodyFor("email.bounced");
      expect((await call(tx, "m", stale, sign("m", stale, body), body))[0].out).toMatchObject({ status: "rejected", reason: "stale" });
      await tx.asOwner();
      expect((await statusOf(tx)).status).toBe("sent");
    });
  });

  it("the window is symmetric — a timestamp from the future is refused too", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asAnon();
      const ahead = now() + 360;
      const body = bodyFor("email.bounced");
      expect((await call(tx, "m", ahead, sign("m", ahead, body), body))[0].out).toMatchObject({ status: "rejected", reason: "stale" });
    });
  });

  it("a timestamp that is not a number is refused rather than raised", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asAnon();
      const body = bodyFor("email.bounced");
      const rows = await tx.q<{ out: Outcome }>(
        `select public.resend_webhook('m', 'not-a-number', 'v1,x', $1) as out`,
        [body],
      );
      expect(rows[0].out).toMatchObject({ status: "rejected", reason: "timestamp" });
    });
  });
});

describe("RPC-resend_webhook.unconfigured_is_quiet", () => {
  it("★ with no secret in the vault it answers «unconfigured» rather than raising", async () => {
    await withTx(async (tx) => {
      await setup(tx, { secret: false });
      await tx.asAnon();
      const ts = now();
      const body = bodyFor("email.bounced");
      const [{ out }] = await call(tx, "m", ts, sign("m", ts, body), body);
      // A provider retries a 5xx for days. An endpoint that raises turns a
      // deployment with no secret yet into a storm.
      expect(out.status).toBe("unconfigured");
      await tx.asOwner();
      expect((await statusOf(tx)).status).toBe("sent");
    });
  });

  it("★ anon cannot read the secret out — the vault is reachable only inside the definer body", async () => {
    await withTx(async (tx) => {
      await setup(tx);
      await tx.asAnon();
      let leaked = false;
      try {
        const rows = await tx.q(`select decrypted_secret from vault.decrypted_secrets`);
        leaked = rows.length > 0;
      } catch {
        leaked = false;
      }
      expect(leaked).toBe(false);
    });
  });
});
