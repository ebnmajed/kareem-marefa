// The mail transport — DEC-046, 08 §5.1.
//
// All mail is sent from the worker, never from a request handler, so a mail
// outage cannot slow down a request a member is waiting on.
//
// One interface, three implementations, and the rule that picks between them
// is the one the owner set: **email in development and CI never reaches a
// provider.** `RESEND_API_KEY` is not read unless a caller has explicitly
// asked for the Resend transport by name, which nothing does before Launch
// (PR C). That is stated as code below rather than as a convention, because a
// convention is what sends 200 real emails during an e2e run.
//
// Zero dependencies on purpose. Adding `nodemailer` to send to a local
// Mailpit would put a package in the lock file (and in the worker image) for
// the sake of six SMTP verbs against a server with no auth and no TLS, and
// `package.json` is lead-only besides. See smtp.ts.

export interface MailMessage {
  to: string;
  /** Display name shown in the From header — the ORG's name (08 §3.4). */
  fromName: string;
  /** The single platform-verified sending address (OQ-016). */
  fromAddress: string;
  /** The org's admin contact, so a reply reaches a person (08 §3.4). */
  replyTo?: string | null;
  subject: string;
  html: string;
  /** 08 §3.1: a plain-text alternative for every message. Some corporate
   *  clients strip HTML entirely, and Arabic in a stripped HTML body is
   *  worse than Arabic in a plain one. */
  text: string;
}

export interface SentMail {
  /** What goes into `email_deliveries.provider_message_id` (REQ-NTF-008).
   *  The sink invents one in the same shape, so the column is never null in
   *  development and the webhook path is exercisable. */
  providerMessageId: string;
}

export interface MailTransport {
  readonly name: "smtp-sink" | "memory" | "resend";
  send(message: MailMessage): Promise<SentMail>;
}

export interface TransportEnv {
  MAIL_TRANSPORT?: string;
  MAIL_SMTP_HOST?: string;
  MAIL_SMTP_PORT?: string;
  MAIL_FROM_ADDRESS?: string;
  NODE_ENV?: string;
  CI?: string;
  VITEST?: string;
  RESEND_API_KEY?: string;
}

/** 08 §3.4: one platform-verified sending domain for all orgs. */
export const DEFAULT_FROM_ADDRESS = "no-reply@kareem.pp.sa";

export function fromAddress(env: TransportEnv = process.env): string {
  return env.MAIL_FROM_ADDRESS?.trim() || DEFAULT_FROM_ADDRESS;
}

/**
 * Which transport this process uses.
 *
 *   MAIL_TRANSPORT=resend   → Resend. The ONLY way to reach a provider, and
 *                             it is set at Launch and nowhere else.
 *   MAIL_TRANSPORT=memory,
 *   or a test run, or CI    → the in-memory transport the tests read back.
 *   anything else           → the SMTP sink, which is Mailpit on :54325.
 *
 * The default is a sink, not a provider. Getting that backwards once — a
 * missing variable falling through to Resend — would send real mail from a
 * test run, and there is no undo for a delivered email.
 */
export function selectTransportName(env: TransportEnv = process.env): MailTransport["name"] {
  const explicit = env.MAIL_TRANSPORT?.trim().toLowerCase();
  if (explicit === "resend") return "resend";
  if (explicit === "memory") return "memory";
  if (explicit === "smtp" || explicit === "smtp-sink") return "smtp-sink";
  if (env.VITEST || env.NODE_ENV === "test" || env.CI) return "memory";
  return "smtp-sink";
}
