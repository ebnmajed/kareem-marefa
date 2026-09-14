// Building the RFC 5322 message. 08 §3.1.
//
// The Arabic-specific trap here is the SUBJECT. A mail header is ASCII; an
// Arabic subject must be RFC 2047 "encoded words", and the two ways to get
// that wrong both produce mail that looks fine in the sender's own client:
//
//   1. Putting raw UTF-8 in the header. Many servers pass it through and some
//      clients even render it, so it survives a manual test and then arrives
//      as `Ø¬ÙØ³Ø©` in Outlook.
//   2. Splitting a long encoded word at a byte boundary. RFC 2047 caps an
//      encoded word at 75 characters, so a long Arabic subject MUST be split
//      — and splitting base64 of UTF-8 anywhere but a character boundary
//      corrupts the character that straddles the seam. Every Arabic character
//      is 2 bytes here, so this is not a rare edge: it is most subjects.
//
// Same family of bug as the ICS 75-octet folding of REQ-CAL-001, and it gets
// the same treatment: split on characters, measure in octets.

const CRLF = "\r\n";

/** RFC 2047 caps the whole encoded word, delimiters included, at 75. */
const ENCODED_WORD_MAX = 75;
const OVERHEAD = "=?UTF-8?B??=".length;

const isAscii = (value: string) => !/[^\x20-\x7e]/.test(value);

/**
 * One header value as RFC 2047 encoded words, split on CHARACTER boundaries.
 *
 * Base64 turns every 3 octets into 4, so the octet budget per word is
 * `floor((75 - overhead) / 4) * 3`. Characters are added one at a time and
 * measured in UTF-8 octets, which is the only way to guarantee no character
 * spans two words.
 */
export function encodeHeaderValue(value: string): string {
  if (isAscii(value)) return value;

  const budget = Math.floor((ENCODED_WORD_MAX - OVERHEAD) / 4) * 3;
  const words: string[] = [];
  let chunk = "";
  let octets = 0;

  for (const char of value) {
    const size = Buffer.byteLength(char, "utf8");
    if (octets + size > budget) {
      words.push(chunk);
      chunk = "";
      octets = 0;
    }
    chunk += char;
    octets += size;
  }
  if (chunk) words.push(chunk);

  // Folding whitespace between encoded words is what tells the client to join
  // them with nothing in between (RFC 2047 §6.2), which is why the separator
  // is a newline plus a space and not a plain space.
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join(`${CRLF} `);
}

/** `«اسم» <address>` with the display name encoded when it is not ASCII. */
export function formatAddress(displayName: string | null | undefined, address: string): string {
  const name = displayName?.trim();
  if (!name) return address;
  return `${isAscii(name) ? `"${name.replace(/["\\]/g, "")}"` : encodeHeaderValue(name)} <${address}>`;
}

/** Base64, wrapped at 76 characters as RFC 2045 requires. */
function base64Body(value: string): string {
  return (Buffer.from(value, "utf8").toString("base64").match(/.{1,76}/g) ?? [""]).join(CRLF);
}

export interface MimeInput {
  to: string;
  from: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
  date?: Date;
  messageId?: string;
}

/**
 * A `multipart/alternative` message: plain text first, HTML second, because
 * a client picks the LAST part it understands (RFC 2046 §5.1.4). Both parts
 * are base64, so nothing has to reason about quoted-printable soft line
 * breaks in the middle of an Arabic word.
 */
export function buildMime(input: MimeInput): string {
  const boundary = `_kareem_${(input.messageId ?? Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9]/g, "")}_`;
  const date = (input.date ?? new Date()).toUTCString().replace("GMT", "+0000");

  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    ...(input.replyTo ? [`Reply-To: ${input.replyTo}`] : []),
    `Subject: ${encodeHeaderValue(input.subject)}`,
    `Date: ${date}`,
    ...(input.messageId ? [`Message-ID: <${input.messageId}@kareem.pp.sa>`] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const part = (contentType: string, body: string) =>
    [`--${boundary}`, `Content-Type: ${contentType}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", base64Body(body)].join(CRLF);

  return [headers.join(CRLF), "", part("text/plain", input.text), part("text/html", input.html), `--${boundary}--`, ""].join(CRLF);
}
