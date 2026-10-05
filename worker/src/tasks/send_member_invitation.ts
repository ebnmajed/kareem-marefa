import type { Task } from "graphile-worker";
import { INVITATION_SUBJECT, invitationDesign, renderEmail, TemplateMissingError } from "@kareem/mail-runtime";
import { createTransport, fromAddress, type MailTransport } from "../mail/index.js";

// JOB-send_member_invitation — REQ-NTF-017, REQ-TEN-009, DEC-243 §6, DEC-244 §8. The thirty-seventh job.
// Key: `invite:{member_id}`, enqueued by `add_member()` and `resend_member_invitation()`.
//
// ★ THE RECIPIENT IS NOT IN THE PAYLOAD — `send_test_email`'s rule, for the same reason. The
// payload names the member (who exists from the moment the admin saved them, `DEC-244` §3) and the
// address is read here from `member_invitation_context()`. So a forged or replayed job still cannot
// mail anyone but that member, and the guarantee lives in two places that both refuse to carry an
// address rather than in a check.
//
// ★ IT IS NOT A MATRIX MESSAGE (`08` §3.2a). `notification_send_context()` raises
// `unknown_message_key` for anything outside `notification_matrix()`, and «you have been added» is
// not a message anybody may switch off — so there is no preference to read and no inbox row to
// write. It still records an `email_deliveries` row, so an addition appears in the delivery log
// with its reason like every other send: outside the MATRIX, not outside the record.
//
// ★ A member who has already signed in, or who has been deactivated, is sent nothing: the context
// returns null and this returns. It does not retry — wave 4's rule for a job whose subject is gone.

interface InvitationPayload {
  org_id: string;
  member_id: string;
}

interface InvitationContext {
  member: { id: string; email: string; display_name: string | null };
  org: { id: string; name: string; from_name: string | null; reply_to: string | null; time_zone: string };
}

let transport: MailTransport | null = null;
export function invitationMailTransport(): MailTransport {
  if (!transport) transport = createTransport();
  return transport;
}
export function setInvitationMailTransport(next: MailTransport | null) {
  transport = next;
}

/** The key the delivery log records this send under. Not a `MSG-*`: it is not in the matrix. */
export const INVITATION_KEY = "MAIL-member_added";

export const send_member_invitation: Task = async (rawPayload, helpers) => {
  const p = rawPayload as unknown as InvitationPayload;
  for (const field of ["org_id", "member_id"] as const) {
    if (!p?.[field]) throw new Error(`send_member_invitation: payload is missing ${field}`);
  }

  const { rows } = await helpers.query<{ ctx: InvitationContext | null }>(`select public.member_invitation_context($1::uuid) as ctx`, [p.member_id]);
  const ctx = rows[0]?.ctx;
  if (!ctx?.member?.email) {
    // Already signed in, deactivated, gone, or the org is not active. Nothing to send, and nothing
    // to retry: the state this job existed for no longer holds.
    helpers.logger.info(`send_member_invitation: nothing to send for member ${p.member_id}`);
    return;
  }

  const { rows: kitRows } = await helpers.query<{ kit: { light?: Record<string, string>; dark?: Record<string, string> } | null }>(
    `select public.brand_kit($1::uuid) as kit`,
    [p.org_id],
  );
  const kit = kitRows[0]?.kit;

  const appUrl = process.env.APP_URL?.replace(/\/+$/, "") || null;
  let logoUrl: string | null = null;
  if (appUrl) {
    const { rows: logoRows } = await helpers.query(`select storage_path from public.org_public_logo($1::uuid)`, [p.org_id]);
    if (logoRows.length > 0) logoUrl = `${appUrl}/api/brand/${p.org_id}/logo`;
  }

  let rendered;
  try {
    rendered = renderEmail({
      key: INVITATION_KEY,
      // ★ The design is passed as the override, which `emailDocumentFor()` honours AHEAD of
      // `platformDesign()` — so no key lookup happens and `DESIGN_FOR` stays at 25 (`DEC-244` §8).
      override: { subject: INVITATION_SUBJECT, body: null, blocks: invitationDesign() },
      // `url` is the app's door. A member who has not signed in has nothing else to be sent to, and
      // `REQ-AUT-005` carries them onward from there.
      payload: { org: ctx.org.name, url: appUrl ?? "/" },
      member: { name: ctx.member.display_name, email: ctx.member.email },
      org: { name: ctx.org.name, timeZone: ctx.org.time_zone },
      brand: kit?.light ? { light: kit.light, dark: kit.dark } : null,
      logoUrl,
      appUrl,
    });
  } catch (error) {
    if (error instanceof TemplateMissingError) {
      helpers.logger.error(error.message);
      return;
    }
    throw error;
  }

  const { rows: recorded } = await helpers.query<{ record_email_delivery: string }>(
    `select public.record_email_delivery($1::uuid, $2::uuid, $3::text, null) as record_email_delivery`,
    [p.org_id, p.member_id, INVITATION_KEY],
  );
  const deliveryId = recorded[0]?.record_email_delivery;

  try {
    const sent = await invitationMailTransport().send({
      to: ctx.member.email,
      fromName: ctx.org.from_name ?? ctx.org.name,
      fromAddress: fromAddress(),
      replyTo: ctx.org.reply_to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      // The job's id is the same on every retry of this job, so a send Resend accepted whose
      // answer was lost is not delivered twice.
      ...(helpers.job?.id ? { idempotencyKey: `invite:${helpers.job.id}` } : {}),
    });
    await helpers.query(`select public.update_email_delivery($1::uuid, 'sent'::public.delivery_status, $2::text, null)`, [deliveryId, sent.providerMessageId]);
    // A count, never a payload, and never the address.
    helpers.logger.info(`send_member_invitation: sent to member ${p.member_id}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await helpers.query(`select public.update_email_delivery($1::uuid, 'failed'::public.delivery_status, null, $2::text)`, [deliveryId, reason.slice(0, 1000)]);
    throw error;
  }
};
