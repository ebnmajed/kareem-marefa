// The SMTP sink — local Supabase's Mailpit, `127.0.0.1:54325` (DEC-046).
//
// Mailpit accepts plain SMTP with no AUTH and no STARTTLS, which is the whole
// reason this is forty lines of `node:net` instead of a dependency: six verbs,
// one connection, no negotiation. Read what it caught at http://127.0.0.1:54324.
//
// This transport is for development only. It has no AUTH and no TLS and must
// never be pointed at a real relay; the factory in index.ts only selects it
// for a local host, and Resend is the only path to a provider (transport.ts).

import net from "node:net";
import { buildMime } from "./mime.js";
import type { MailMessage, MailTransport, SentMail } from "./transport.js";

const CRLF = "\r\n";

export class SmtpError extends Error {}

interface Conversation {
  write(line: string): void;
  expect(codes: number[], what: string): Promise<string>;
}

function conversation(socket: net.Socket, timeoutMs: number): Conversation {
  let buffer = "";
  const waiting: Array<{ resolve: (line: string) => void; reject: (e: Error) => void; codes: number[]; what: string }> = [];

  const settle = () => {
    // A multi-line reply is `250-…` per line and `250 …` on the last one; only
    // the last line ends the reply.
    for (;;) {
      const end = buffer.indexOf(CRLF);
      if (end === -1) return;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + CRLF.length);
      if (line[3] === "-") continue;
      const next = waiting.shift();
      if (!next) continue;
      const code = Number.parseInt(line.slice(0, 3), 10);
      if (next.codes.includes(code)) next.resolve(line);
      else next.reject(new SmtpError(`${next.what}: server said ${line}`));
    }
  };

  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    settle();
  });

  return {
    write: (line) => socket.write(line + CRLF),
    expect: (codes, what) =>
      new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new SmtpError(`${what}: no reply within ${timeoutMs} ms`)), timeoutMs);
        waiting.push({
          codes,
          what,
          resolve: (line) => {
            clearTimeout(timer);
            resolve(line);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        settle();
      }),
  };
}

/** RFC 5321 §4.5.2: a line beginning with "." inside DATA gets a second one,
 *  or the message ends early. Base64 bodies cannot produce one, but a header
 *  value could, and a mail body that silently truncates is the worst kind of
 *  bug to find later. */
const dotStuff = (mime: string) =>
  mime
    .split(CRLF)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join(CRLF);

export class SmtpSinkTransport implements MailTransport {
  readonly name = "smtp-sink" as const;

  constructor(
    private readonly host = "127.0.0.1",
    private readonly port = 54325,
    private readonly timeoutMs = 5000,
  ) {}

  async send(message: MailMessage): Promise<SentMail> {
    const providerMessageId = `sink_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const mime = buildMime({
      to: message.to,
      from: `${message.fromName} <${message.fromAddress}>`,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: providerMessageId,
    });

    const socket = net.createConnection({ host: this.host, port: this.port });
    socket.setTimeout(this.timeoutMs);

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", (e) => reject(new SmtpError(`cannot reach the mail sink at ${this.host}:${this.port} — is local Supabase running? (${e.message})`)));
      });

      const smtp = conversation(socket, this.timeoutMs);
      await smtp.expect([220], "greeting");
      smtp.write("EHLO kareem-worker");
      await smtp.expect([250], "EHLO");
      smtp.write(`MAIL FROM:<${message.fromAddress}>`);
      await smtp.expect([250], "MAIL FROM");
      smtp.write(`RCPT TO:<${message.to}>`);
      await smtp.expect([250, 251], "RCPT TO");
      smtp.write("DATA");
      await smtp.expect([354], "DATA");
      socket.write(dotStuff(mime) + CRLF + "." + CRLF);
      await smtp.expect([250], "message body");
      smtp.write("QUIT");
      await smtp.expect([221], "QUIT").catch(() => undefined); // a server that just hangs up here is fine
    } finally {
      socket.destroy();
    }

    return { providerMessageId };
  }
}
