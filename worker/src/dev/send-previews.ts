// The seven approved emails, sent to an address through the LOCAL sink — `REQ-NTF-018`, `DEC-289`.
//
//   npm --prefix worker run build && npm --prefix worker run mail:previews -- you@example.com
//
// ★ IT REFUSES ANY TRANSPORT BUT THE SINK. The app may not send mail at all (`@kareem/mail-runtime`'s rule), so the
// dev preview page (`/ar/ui/emails`) shows the messages and this sends them, from the worker, which is where every
// transport already lives. `MAIL_TRANSPORT=resend` is refused here: a preview never reaches a provider.
import { renderEmail, SAMPLE_CASES, SAMPLE_MEMBER, SAMPLE_ORG } from "@kareem/mail-runtime";
import { createTransport, fromAddress, selectTransportName } from "../mail/index.js";

const DESIGNED = [
  "MSG-session_published",
  "MSG-rsvp_confirmed",
  "MSG-reminder_7d",
  "MSG-reminder_1d",
  "MSG-session_comment",
  "MSG-leaderboard_weekly",
  "MSG-check_in_confirmed.certificate",
];

async function main() {
  const to = process.argv[2];
  if (!to || !/^[^@\s]+@[^@\s]+$/.test(to)) {
    console.error("usage: npm --prefix worker run mail:previews -- you@example.com");
    process.exit(2);
  }
  if (selectTransportName() !== "smtp-sink") {
    console.error("mail:previews sends to the local sink only (Mailpit, :54324). Unset MAIL_TRANSPORT.");
    process.exit(2);
  }
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const transport = createTransport();
  for (const id of DESIGNED) {
    const sample = SAMPLE_CASES.find((c) => c.id === id);
    if (!sample) throw new Error(`no sample ${id}`);
    const r = renderEmail({
      key: sample.key,
      payload: sample.payload,
      member: sample.member ?? SAMPLE_MEMBER,
      org: SAMPLE_ORG,
      appUrl,
      unsubscribeUrl: `${appUrl}/ar/unsubscribe?t=preview`,
    });
    const sent = await transport.send({
      to,
      fromName: SAMPLE_ORG.name,
      fromAddress: fromAddress(),
      subject: r.subject,
      html: r.html,
      text: r.text,
      listUnsubscribe: { url: `${appUrl}/api/email/unsubscribe?t=preview` },
    });
    console.log(`${id}: ${sent.providerMessageId}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
