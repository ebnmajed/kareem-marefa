import type { Task } from "graphile-worker";
import { createTransport, fromAddress, type MailTransport } from "../mail/index.js";
import { renderEmail, TemplateMissingError } from "@kareem/mail-runtime";

// JOB-send_notification — 11 §2.6, 08 §5, REQ-NTF-002, REQ-NTF-003, REQ-NTF-008.
// Key: `notify:{message_id}`, enqueued by `public.notify()` inside the
// transaction that wrote the inbox row (02 §4.17).
//
// The in-app half is already done by the time this runs: `notify()` wrote the
// `notifications` row in the caller's transaction, because an inbox that
// waited on a queue would show a member a seat they were promoted to minutes
// after they were promoted. This job is the EMAIL half, plus the send-time
// preference re-check 11 §2.6 requires — a member may have changed their mind
// between the -7d reminder being scheduled and the -7d reminder being sent,
// and the payload frozen a week ago cannot know that.

export interface SendNotificationPayload {
  message_id: string;
  notification_id: string | null;
  org_id: string;
  member_id: string;
  key: string;
  category: string;
  optional: boolean;
  in_app: boolean;
  email: boolean;
  payload: Record<string, unknown>;
}

interface SendContext {
  key: string;
  category: string;
  optional: boolean;
  member: { id: string; email: string; display_name: string | null; status: string };
  org: { name: string; from_name: string | null; reply_to: string | null; time_zone: string };
  // `blocks` is `0125`'s column, added to this object by `notification_send_context`
  // (DEC-161). **Null is a string template** — every row that existed before
  // wave 10 — and `renderEmail()` then takes the path whose bytes
  // `tests/unit/mail-pinned/` pins.
  template: { subject: string | null; body: string | null; locale: string; blocks?: unknown | null } | null;
  // The session the payload names, scoped to this org by the function — a
  // payload is not a capability. Null when the payload carries no session id,
  // or when the id belongs to another org.
  session?: { id: string; state: string } | null;
  email_allowed: boolean;
  in_app_allowed: boolean;
}

// One transport per process. Tests swap it; nothing else does.
let transport: MailTransport | null = null;
export function mailTransport(): MailTransport {
  if (!transport) transport = createTransport();
  return transport;
}
export function setMailTransport(next: MailTransport | null) {
  transport = next;
}

export const send_notification: Task = async (rawPayload, helpers) => {
  const p = rawPayload as unknown as SendNotificationPayload;
  for (const field of ["message_id", "org_id", "member_id", "key"] as const) {
    if (!p?.[field]) throw new Error(`send_notification: payload is missing ${field}`);
  }

  if (!p.email) {
    // In-app only. `notify()` already wrote the row; there is nothing here to
    // do, and returning is not a failure.
    helpers.logger.info(`send_notification: ${p.key} for ${p.member_id} is in-app only`);
    return;
  }

  // The fifth argument is TRAILING and DEFAULTED (supabase/proposed/notify/0002),
  // so `main`'s worker keeps calling this with three. The session id comes from
  // the payload and the function scopes it to this org.
  const payloadSessionId = typeof p.payload?.session_id === "string" ? p.payload.session_id : null;
  const { rows } = await helpers.query<{ notification_send_context: SendContext }>(
    `select public.notification_send_context($1::uuid, $2::uuid, $3::text, 'ar', $4::uuid) as notification_send_context`,
    [p.org_id, p.member_id, p.key, payloadSessionId],
  );
  const ctx = rows[0]?.notification_send_context;
  if (!ctx) throw new Error(`send_notification: no context for ${p.key} / ${p.member_id}`);

  // 11 §2.6 — the check that matters, at the moment that matters.
  if (!ctx.email_allowed) {
    helpers.logger.info(`send_notification: ${p.key} suppressed at send time — ${ctx.category} email is off for this member`);
    return;
  }
  if (!ctx.member.email) throw new Error(`send_notification: member ${p.member_id} has no address`);

  // 06 §8.3's email-template leg (wave 4, DEC-052): the org's brand kit,
  // merged over the platform defaults in SQL, so the mail carries the same
  // colours as the UI and the posters. One read, one shape.
  // ★ The WHOLE kit is passed now, not three of its keys. `brand_kit()` has
  // returned both schemes, nine tokens each, since `0068`/`0093`, and a DESIGN
  // needs more than the shell does — a heading colour and a rule colour at
  // least. `renderEmail()` narrows it back to the same three for the string
  // path with the same guard this line used to apply, so the mail an untouched
  // org receives is byte for byte the one it received before (contract 5).
  const { rows: kitRows } = await helpers.query<{ kit: { light?: Record<string, string>; dark?: Record<string, string> } | null }>(
    `select public.brand_kit($1::uuid) as kit`,
    [p.org_id],
  );
  const kit = kitRows[0]?.kit;
  const brand = kit?.light ? { light: kit.light, dark: kit.dark } : null;

  // `0126` / contract 9: the ONE object a mail client may fetch with no
  // session — an ACTIVE org's logo, and only while it is PNG or JPEG. No row
  // (no logo, a WebP one, a suspended org) means null, and a design then
  // renders the org's NAME as a heading rather than a broken image.
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "") || null;
  let logoUrl: string | null = null;
  if (appUrl) {
    const { rows: logoRows } = await helpers.query(`select storage_path from public.org_public_logo($1::uuid)`, [p.org_id]);
    if (logoRows.length > 0) logoUrl = `${appUrl}/api/brand/${p.org_id}/logo`;
  }

  // ★ Contract 8, made concrete (D3 finding F3). `/api/s/{id}/og` is the ONE
  // image URL a mail client can fetch with no session — and it 404s for a
  // DRAFT or CANCELLED session, by `export_is_public_card()`'s own predicate.
  // So the card's image is offered only when the route will actually serve it:
  // a session of this org, in a state the predicate admits, and a known origin.
  // A design that asks for the image gets none otherwise, which is a mail with
  // one row fewer rather than a mail with a broken image in it.
  const CARDED_STATES = new Set(["published", "in_progress", "completed"]);
  const cardImageUrl =
    appUrl && ctx.session && CARDED_STATES.has(ctx.session.state) ? `${appUrl}/api/s/${ctx.session.id}/og` : null;

  let rendered;
  try {
    rendered = renderEmail({
      key: p.key,
      override: ctx.template,
      payload: cardImageUrl ? { ...(p.payload ?? {}), session_card_image_url: cardImageUrl } : (p.payload ?? {}),
      member: { name: ctx.member.display_name, email: ctx.member.email },
      org: { name: ctx.org.name, timeZone: ctx.org.time_zone },
      brand,
      logoUrl,
      appUrl,
    });
  } catch (error) {
    // A missing template is a matrix bug, not a transient fault: retrying it
    // eight times changes nothing. Fail loudly, once, with the key named.
    if (error instanceof TemplateMissingError) {
      helpers.logger.error(error.message);
      throw error;
    }
    throw error;
  }

  // REQ-NTF-008 — the row is written BEFORE the send, as `queued`. A row that
  // stays `queued` is a worker that died mid-send, and that state being
  // visible is the point. One row per ATTEMPT, so an admin looking at a bounce
  // spike sees how many times it was tried and not just the last word.
  const { rows: recorded } = await helpers.query<{ record_email_delivery: string }>(
    `select public.record_email_delivery($1::uuid, $2::uuid, $3::text, $4::uuid) as record_email_delivery`,
    [p.org_id, p.member_id, p.key, p.notification_id],
  );
  const deliveryId = recorded[0]?.record_email_delivery;

  try {
    const sent = await mailTransport().send({
      to: ctx.member.email,
      // 08 §3.4 / OQ-016: one platform-verified sending domain, the org's name
      // in the From display name, the org's admin contact as Reply-To.
      fromName: ctx.org.from_name ?? ctx.org.name,
      fromAddress: fromAddress(),
      replyTo: ctx.org.reply_to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    await helpers.query(`select public.update_email_delivery($1::uuid, 'sent'::public.delivery_status, $2::text, null)`, [deliveryId, sent.providerMessageId]);
    helpers.logger.info(`send_notification: ${p.key} sent to member ${p.member_id} (${sent.providerMessageId})`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    // The reason is what REQ-NTF-008 puts in front of the org admin, so it is
    // stored before the throw — the throw is what makes graphile-worker retry
    // (11 §1.3: external API, 8 attempts, exponential from 30 s).
    await helpers.query(`select public.update_email_delivery($1::uuid, 'failed'::public.delivery_status, null, $2::text)`, [deliveryId, reason.slice(0, 1000)]);
    throw error;
  }
};
