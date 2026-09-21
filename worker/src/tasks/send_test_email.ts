import type { Task } from "graphile-worker";
import { renderEmail, sampleFor, SAMPLE_MEMBER, TemplateMissingError } from "@kareem/mail-runtime";
import { createTransport, fromAddress, type MailTransport } from "../mail/index.js";

// JOB-send_test_email — REQ-NTF-011, `16` §11.4, DEC-161.
// Key: `testmail:{member_id}`, enqueued by `public.send_test_email()`.
//
// ★ «THE SINGLE MOST VALUABLE CONTROL ON THE SCREEN» (`16` §11.4), and what
// makes it valuable is that it goes through the LIVE transport. A preview is
// the renderer's opinion of a message; a test send is Outlook's. Locally that
// is Mailpit on :54325, in CI the in-memory transport, and Resend only in
// production — `RESEND_API_KEY` is read in one branch of one factory and
// nowhere else (`DEC-046`), which this task does not change.
//
// ★ THE RECIPIENT IS NOT IN THE PAYLOAD. `send_test_email()` takes no address
// and enqueues only `member_id`; the address is read here from the same
// definer function the real send uses. So a forged or replayed job still
// cannot mail anyone but that member — the guarantee lives in two places that
// both refuse to carry an address, rather than in a check.

interface SendTestPayload {
  org_id: string;
  member_id: string;
  key: string;
  locale: string;
}

interface TestContext {
  member: { id: string; email: string; display_name: string | null };
  org: { name: string; from_name: string | null; reply_to: string | null; time_zone: string };
  template: { subject: string | null; body: string | null; locale: string; blocks?: unknown | null } | null;
}

let transport: MailTransport | null = null;
export function testMailTransport(): MailTransport {
  if (!transport) transport = createTransport();
  return transport;
}
export function setTestMailTransport(next: MailTransport | null) {
  transport = next;
}

export const send_test_email: Task = async (rawPayload, helpers) => {
  const p = rawPayload as unknown as SendTestPayload;
  for (const field of ["org_id", "member_id", "key"] as const) {
    if (!p?.[field]) throw new Error(`send_test_email: payload is missing ${field}`);
  }

  const { rows } = await helpers.query<{ ctx: TestContext }>(
    `select public.notification_send_context($1::uuid, $2::uuid, $3::text, $4::text) as ctx`,
    [p.org_id, p.member_id, p.key, p.locale ?? "ar"],
  );
  const ctx = rows[0]?.ctx;
  // A job whose subject is gone warns and returns; it does not retry
  // twenty-five times (wave 4's rule).
  if (!ctx?.member?.email) {
    helpers.logger.warn(`send_test_email: no address for member ${p.member_id} — nothing sent`);
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

  // ★ THE SAME SAMPLE THE PREVIEW SHOWED AND THE PIN PINS. A test send over
  // different data would answer a different question from the one the admin
  // asked by pressing the button.
  const sample = sampleFor(p.key);
  if (!sample) {
    helpers.logger.error(`send_test_email: no sample payload for ${p.key}`);
    return;
  }

  let rendered;
  try {
    rendered = renderEmail({
      key: p.key,
      override: ctx.template,
      payload: sample.payload,
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

  // The row lands in the same delivery log as a real send, so a test that
  // bounces is visible where an admin already looks — and `REQ-NTF-008`'s
  // «every send records its outcome» has no exception for this one.
  const { rows: recorded } = await helpers.query<{ record_email_delivery: string }>(
    `select public.record_email_delivery($1::uuid, $2::uuid, $3::text, null) as record_email_delivery`,
    [p.org_id, p.member_id, p.key],
  );
  const deliveryId = recorded[0]?.record_email_delivery;

  try {
    const sent = await testMailTransport().send({
      to: ctx.member.email,
      fromName: ctx.org.from_name ?? ctx.org.name,
      fromAddress: fromAddress(),
      replyTo: ctx.org.reply_to,
      // ★ The prefix is added HERE and never in the renderer: the bytes an
      // admin is testing must be the bytes that ship, and a subject the
      // renderer never produced would make the test lie about the one thing
      // it exists to check.
      subject: `[اختبار] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
    });
    await helpers.query(`select public.update_email_delivery($1::uuid, 'sent'::public.delivery_status, $2::text, null)`, [deliveryId, sent.providerMessageId]);
    // A count, never a payload (contract 7).
    helpers.logger.info(`send_test_email: ${p.key} sent to member ${p.member_id}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await helpers.query(`select public.update_email_delivery($1::uuid, 'failed'::public.delivery_status, null, $2::text)`, [deliveryId, reason.slice(0, 1000)]);
    throw error;
  }
};

/** Exported for the unit test: the sample a key is tested with. */
export const sampleForKey = sampleFor;
export { SAMPLE_MEMBER };
