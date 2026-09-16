// notify (wave 2, M3) — supabase/proposed/notify/0002_send_notification.sql:
// what JOB-send_notification reads and writes.
//
// 03 §8.2 rows proven here:
//   RPC-notification_send_context.definer_only ·
//   RPC-notification_send_context.recheck ·
//   RPC-record_email_delivery.append ·
//   RPC-update_email_delivery_by_provider.scoped
//
// The proposed file is applied inside each test's transaction and rolled back
// with it (DEC-040). Migration 0026 (the contract) is already on the database.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());


interface SendContext {
  key: string;
  category: string;
  optional: boolean;
  member: { id: string; email: string; display_name: string | null; status: string };
  org: { name: string; from_name: string | null; reply_to: string | null; time_zone: string };
  template: { subject: string; body: string; locale: string } | null;
  email_allowed: boolean;
  in_app_allowed: boolean;
}

/** The M3 fixture seeds one row in every notify table so the isolation sweep
 *  is never vacuous. These cases arrange their own, for the same reason as
 *  tests/rls/notify-contract.test.ts. */
async function setup(tx: Tx) {
  const f = await seed(tx);
  // Promoted as migration 0030 at wave-2 sync 2: applied by `supabase db reset`.
  for (const table of ["email_deliveries", "notifications", "notification_preferences", "notification_templates"]) {
    await tx.q(`delete from public.${table}`);
  }
  return f;
}

const context = (tx: Tx, org: string, member: string, key: string) =>
  tx.q<{ ctx: SendContext }>(`select public.notification_send_context($1, $2, $3) as ctx`, [org, member, key]);

const deliveries = (tx: Tx) =>
  tx.q<{ id: string; status: string; error: string | null; provider_message_id: string | null; sent_at: string | null; delivered_at: string | null }>(
    `select id, status, error, provider_message_id, sent_at, delivered_at from public.email_deliveries order by created_at`,
  );

describe("RPC-notification_send_context", () => {
  it("definer_only — no client role may call it, an org admin included", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      // It returns another member's email address; that is the whole reason.
      for (const who of [f.a.members[0].claims, f.a.mod.claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(() => context(tx, f.a.id, f.a.members[1].memberId, "MSG-badge_earned"))).toBe(PERMISSION_DENIED);
      }
      await tx.asAnon();
      expect(await errorCode(() => context(tx, f.a.id, f.a.members[1].memberId, "MSG-badge_earned"))).toBe(PERMISSION_DENIED);
      await tx.asServiceRole();
      expect((await context(tx, f.a.id, f.a.members[1].memberId, "MSG-badge_earned"))[0].ctx.member.email).toBe(f.a.members[1].email);
    });
  });

  it("carries the recipient, the org's sending identity and the org's display settings", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`update public.org_settings set email_from_name = $2, email_reply_to = $3 where org_id = $1`, [
        f.a.id,
        "كريم معرفة",
        "admin@kareem.example",
      ]);

      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-rsvp_promoted");
      expect(ctx.member.email).toBe(f.a.members[0].email);
      expect(ctx.member.display_name).toBe("سارة العتيبي");
      expect(ctx.org.from_name).toBe("كريم معرفة");
      expect(ctx.org.reply_to).toBe("admin@kareem.example");
      expect(ctx.org.time_zone).toBe("Asia/Riyadh");
      expect(ctx.category).toBe("my_sessions");
      expect(ctx.optional).toBe(false);
    });
  });

  it("falls back to the org's name when no sending name is configured", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-badge_earned");
      expect(ctx.org.from_name).toBe("كريم معرفة");
      expect(ctx.org.reply_to).toBeNull();
    });
  });

  it("returns the org's own template when it has one, and null when it does not", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      expect((await context(tx, f.a.id, f.a.members[0].memberId, "MSG-badge_earned"))[0].ctx.template).toBeNull();

      await tx.q(
        `insert into public.notification_templates (org_id, key, channel, locale, subject, body, required_fields)
         values ($1, 'MSG-badge_earned', 'email', 'ar', 'شارة {{badge}}', 'مرحبًا {{member.name}}', '{badge,member.name}')`,
        [f.a.id],
      );
      const [{ ctx }] = await context(tx, f.a.id, f.a.members[0].memberId, "MSG-badge_earned");
      expect(ctx.template?.subject).toBe("شارة {{badge}}");
      expect(ctx.template?.locale).toBe("ar");

      // Another org's template is not this org's — the send path is org-scoped
      // like everything else.
      expect((await context(tx, f.b.id, f.b.members[0].memberId, "MSG-badge_earned"))[0].ctx.template).toBeNull();
    });
  });

  it("recheck — it reports the preference as it stands NOW, not at enqueue time (11 §2.6)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const me = f.a.members[0];
      await tx.asOwner();
      // The state the job was enqueued in: nothing stored, so everything on.
      expect((await context(tx, f.a.id, me.memberId, "MSG-reminder_7d"))[0].ctx.email_allowed).toBe(true);

      // The member changes their mind between the -7d schedule and the -7d send.
      await tx.q(
        `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
         values ($1, $2, 'reminders', 'email', false)`,
        [f.a.id, me.memberId],
      );
      const [{ ctx }] = await context(tx, f.a.id, me.memberId, "MSG-reminder_7d");
      expect(ctx.email_allowed).toBe(false);
      expect(ctx.in_app_allowed).toBe(true); // only the channel they turned off
    });
  });

  it("recheck — 08 §1.7's set is sent anyway, on both channels", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const me = f.a.members[0];
      await tx.asOwner();
      for (const channel of ["in_app", "email"]) {
        await tx.q(
          `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
           values ($1, $2, 'my_sessions', $3::public.notify_channel, false)`,
          [f.a.id, me.memberId, channel],
        );
      }
      const [{ ctx }] = await context(tx, f.a.id, me.memberId, "MSG-session_cancelled");
      expect(ctx.optional).toBe(false);
      expect(ctx.email_allowed).toBe(true);
      expect(ctx.in_app_allowed).toBe(true);
      // The optional message in the same category is suppressed, so the line
      // above tests the bypass and not the absence of a preference row.
      expect((await context(tx, f.a.id, me.memberId, "MSG-rsvp_confirmed"))[0].ctx.in_app_allowed).toBe(false);
    });
  });

  it("refuses a key outside the matrix and a member outside the org", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      expect(await errorCode(() => context(tx, f.a.id, f.a.members[0].memberId, "MSG-carrier_pigeon"))).toBe("22023");
      expect(await errorCode(() => context(tx, f.a.id, f.b.members[0].memberId, "MSG-badge_earned"))).toBe("P0002");
    });
  });
});

describe("RPC-record_email_delivery.append", () => {
  it("records the send as queued before it is attempted, then moves it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ id }] = await tx.q<{ id: string }>(`select public.record_email_delivery($1, $2, 'MSG-rsvp_promoted') as id`, [f.a.id, f.a.members[0].memberId]);

      // A row that STAYS queued is a worker that died mid-send, and that state
      // being visible to an admin is the point of writing it first.
      let [row] = await deliveries(tx);
      expect(row.status).toBe("queued");
      expect(row.sent_at).toBeNull();

      await tx.q(`select public.update_email_delivery($1, 'sent', 'prov_1', null)`, [id]);
      [row] = await deliveries(tx);
      expect(row.status).toBe("sent");
      expect(row.provider_message_id).toBe("prov_1");
      expect(row.sent_at).not.toBeNull();
      const firstSentAt = row.sent_at;

      // REQ-NTF-008: the reason, not just the status.
      await tx.q(`select public.update_email_delivery($1, 'bounced', null, 'mailbox full')`, [id]);
      [row] = await deliveries(tx);
      expect(row.status).toBe("bounced");
      expect(row.error).toBe("mailbox full");
      // The provider id survives a later update that does not carry one, and
      // `sent_at` is not moved by it — the log is a sequence, not a snapshot.
      expect(row.provider_message_id).toBe("prov_1");
      expect(String(row.sent_at)).toBe(String(firstSentAt));
    });
  });

  it("is definer-only — no client role writes the delivery log", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      for (const who of [f.a.members[0].claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(() => tx.q(`select public.record_email_delivery($1, $2, 'MSG-badge_earned')`, [f.a.id, f.a.members[0].memberId]))).toBe(PERMISSION_DENIED);
      }
    });
  });

  it("one provider message id, one row — a replayed webhook cannot fork the log", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const record = async () =>
        (await tx.q<{ id: string }>(`select public.record_email_delivery($1, $2, 'MSG-badge_earned') as id`, [f.a.id, f.a.members[0].memberId]))[0].id;
      const first = await record();
      const second = await record();
      await tx.q(`select public.update_email_delivery($1, 'sent', 'prov_same', null)`, [first]);
      expect(await errorCode(() => tx.q(`select public.update_email_delivery($1, 'sent', 'prov_same', null)`, [second]))).toBe("23505");
    });
  });
});

describe("RPC-update_email_delivery_by_provider.scoped", () => {
  it("moves the row the provider names, and invents nothing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ id }] = await tx.q<{ id: string }>(`select public.record_email_delivery($1, $2, 'MSG-rsvp_promoted') as id`, [f.a.id, f.a.members[0].memberId]);
      await tx.q(`select public.update_email_delivery($1, 'sent', 'prov_9', null)`, [id]);

      const moved = await tx.q<{ ok: boolean }>(`select public.update_email_delivery_by_provider('prov_9', 'delivered', null) as ok`);
      expect(moved[0].ok).toBe(true);
      const [row] = await deliveries(tx);
      expect(row.status).toBe("delivered");
      expect(row.delivered_at).not.toBeNull();

      // A forged webhook naming an id that does not exist writes nothing and
      // says so, so the handler can answer 200 and log the miss rather than
      // making the provider retry forever.
      for (const forged of ["prov_nonexistent", "", null]) {
        const result = await tx.q<{ ok: boolean }>(`select public.update_email_delivery_by_provider($1, 'bounced', 'forged') as ok`, [forged]);
        expect(result[0].ok).toBe(false);
      }
      expect(await deliveries(tx)).toHaveLength(1);
    });
  });

  it("is definer-only — the webhook route reaches it through the worker, not as a client", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.update_email_delivery_by_provider('x', 'bounced', null)`))).toBe(PERMISSION_DENIED);
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select public.update_email_delivery_by_provider('x', 'bounced', null)`))).toBe(PERMISSION_DENIED);
    });
  });
});
