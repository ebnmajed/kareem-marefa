// The mail factory. One place decides which transport this process holds,
// and one place is allowed to read RESEND_API_KEY (DEC-046).

import { MemoryTransport } from "./memory.js";
import { ResendTransport } from "./resend.js";
import { SmtpSinkTransport } from "./smtp.js";
import { selectTransportName, type MailTransport, type TransportEnv } from "./transport.js";

export { MemoryTransport } from "./memory.js";
export { ResendTransport } from "./resend.js";
export { SmtpSinkTransport, SmtpError } from "./smtp.js";
export { buildMime, encodeHeaderValue, formatAddress } from "./mime.js";
export { selectTransportName, fromAddress, DEFAULT_FROM_ADDRESS } from "./transport.js";
export type { MailMessage, MailTransport, SentMail, TransportEnv } from "./transport.js";

/**
 * The transport for this process.
 *
 * Note where `env.RESEND_API_KEY` is read: inside the `resend` branch and
 * nowhere else. In development and CI that property is never touched, so a
 * key that somehow found its way into the environment still cannot be used —
 * which is the shape the owner's decision takes in code.
 */
export function createTransport(env: TransportEnv = process.env): MailTransport {
  switch (selectTransportName(env)) {
    case "resend":
      return new ResendTransport(env.RESEND_API_KEY ?? "");
    case "memory":
      return new MemoryTransport();
    case "smtp-sink":
      return new SmtpSinkTransport(env.MAIL_SMTP_HOST ?? "127.0.0.1", Number.parseInt(env.MAIL_SMTP_PORT ?? "54325", 10));
  }
}
