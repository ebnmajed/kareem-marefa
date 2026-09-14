// The in-memory transport — CI and unit tests (DEC-046).
//
// It writes `email_deliveries` rows exactly as Resend does, because the job
// does that part and the job does not know which transport it holds. So
// REQ-NTF-008 is testable today rather than after Launch, and the test that
// proves "a bounce is visible to the admin with its reason" runs against the
// same code path a real bounce will take.

import { buildMime } from "./mime.js";
import type { MailMessage, MailTransport, SentMail } from "./transport.js";

export interface CapturedMail extends MailMessage {
  providerMessageId: string;
  /** The bytes that would have gone over the wire, so a test can assert the
   *  RFC 2047 subject and the base64 parts rather than just the inputs. */
  mime: string;
  sentAt: Date;
}

export class MemoryTransport implements MailTransport {
  readonly name = "memory" as const;
  readonly sent: CapturedMail[] = [];
  /** Set to make the next send fail, to exercise the failure path. */
  failNext: string | null = null;

  async send(message: MailMessage): Promise<SentMail> {
    if (this.failNext) {
      const reason = this.failNext;
      this.failNext = null;
      throw new Error(reason);
    }
    const providerMessageId = `mem_${this.sent.length + 1}_${Date.now().toString(36)}`;
    this.sent.push({
      ...message,
      providerMessageId,
      mime: buildMime({
        to: message.to,
        from: `${message.fromName} <${message.fromAddress}>`,
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
        messageId: providerMessageId,
      }),
      sentAt: new Date(),
    });
    return { providerMessageId };
  }

  clear() {
    this.sent.length = 0;
    this.failNext = null;
  }
}
