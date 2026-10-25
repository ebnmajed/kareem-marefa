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

import { PermanentMailError, type MailMessage, type MailTransport, type SentMail } from "./transport.js";

const ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 30_000;

// ★ Resend allows 10 requests a second per account. One worker runs ten jobs at
// once, so a backlog — 25 Oct, six days of mail released together — sends a
// burst: 5 of 21 change notices were refused with 429 and lived only because
// the job retries. This gate spaces every send in the process by a fixed
// interval, so a burst queues here instead of being refused there. A 429 can
// still happen (another sender on the account) and is still retried below.
const MIN_SEND_SPACING_MS = 125; // eight a second
let nextSlotAt = 0;

/** Books the next slot and returns how long to wait for it. Exported for the test. */
export function reserveSendSlot(nowMs: number): number {
  const at = Math.max(nowMs, nextSlotAt);
  nextSlotAt = at + MIN_SEND_SPACING_MS;
  return at - nowMs;
}

function takeSendSlot(): Promise<void> {
  const wait = reserveSendSlot(Date.now());
  return wait > 0 ? new Promise((resolve) => setTimeout(resolve, wait)) : Promise.resolve();
}

/** RFC 5322 §3.2.4 quoted-string: the org's name is the display name, and a name holding a
 *  comma, a quote or an angle bracket would otherwise be parsed as a second address — or
 *  refused outright, for every mail the org sends. */
export function formatFrom(name: string, address: string): string {
  const quoted = name.replace(/[\\"]/g, (c) => `\\${c}`).replace(/[\r\n]+/g, " ");
  return `"${quoted}" <${address}>`;
}

export class ResendTransport implements MailTransport {
  readonly name = "resend" as const;

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error("RESEND_API_KEY is not set. It is a Launch input (PR C); development and CI use the sink (DEC-046).");
    }
  }

  async send(message: MailMessage): Promise<SentMail> {
    await takeSendSlot();
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        ...(message.idempotencyKey ? { "idempotency-key": message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: formatFrom(message.fromName, message.fromAddress),
        to: [message.to],
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
        // ★ Wave 30 (`REQ-NTF-019`): Resend passes custom headers through.
        ...(message.listUnsubscribe
          ? { headers: { "List-Unsubscribe": `<${message.listUnsubscribe.url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
          : {}),
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      // The body carries the reason, and REQ-NTF-008 wants the reason in front
      // of the org admin — so it is thrown, not swallowed into a generic
      // "failed", and the job writes it to `email_deliveries.error`.
      const detail = await response.text().catch(() => "");
      const message = `resend ${response.status}: ${detail.slice(0, 500)}`;
      // A 4xx other than 429 is Resend refusing THIS message; the same message will be refused
      // again. A 429 or a 5xx is the provider's state, and a retry is the right answer.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new PermanentMailError(message, response.status);
      }
      throw new Error(message);
    }

    const body = (await response.json()) as { id?: string };
    if (!body.id) throw new Error("resend accepted the message but returned no id");
    return { providerMessageId: body.id };
  }
}
