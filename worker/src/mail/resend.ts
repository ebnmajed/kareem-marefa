// Resend — wired at Launch (PR C), and unreachable before it (DEC-046).
//
// This file exists now so the interface has a real second implementation and
// the job cannot quietly grow a dependency on the sink's behaviour. It is
// never CONSTRUCTED unless MAIL_TRANSPORT=resend, and it refuses to construct
// without a key rather than starting and failing at the first send.
//
// `fetch` rather than the `resend` SDK: one POST, and the worker image gets no
// new dependency for it. 11 §3.4 — the worker's only outbound network is
// Supabase, Google Calendar, Resend and Sentry.

import type { MailMessage, MailTransport, SentMail } from "./transport.js";

const ENDPOINT = "https://api.resend.com/emails";

export class ResendTransport implements MailTransport {
  readonly name = "resend" as const;

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set. It is a Launch input (PR C); development and CI use the sink (DEC-046).");
    }
  }

  async send(message: MailMessage): Promise<SentMail> {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: `${message.fromName} <${message.fromAddress}>`,
        to: [message.to],
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      // The body carries the reason, and REQ-NTF-008 wants the reason in front
      // of the org admin — so it is thrown, not swallowed into a generic
      // "failed", and the job writes it to `email_deliveries.error`.
      const detail = await response.text().catch(() => "");
      throw new Error(`resend ${response.status}: ${detail.slice(0, 500)}`);
    }

    const body = (await response.json()) as { id?: string };
    if (!body.id) throw new Error("resend accepted the message but returned no id");
    return { providerMessageId: body.id };
  }
}
