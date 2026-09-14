// The RFC 5322 / RFC 2047 layer — worker/src/mail/mime.ts.
//
// The subject is the Arabic trap here, and it is the same family as the ICS
// 75-OCTET folding of REQ-CAL-001: a header is ASCII, an encoded word is
// capped at 75 characters, and every Arabic character is two octets in UTF-8.
// Splitting base64 of UTF-8 anywhere but a character boundary corrupts the
// character that straddles the seam — and the corrupted mail looks fine in
// the sender's own client, which is why it needs a test rather than an eye.
import { describe, expect, it } from "vitest";
import { buildMime, encodeHeaderValue, formatAddress } from "../../worker/src/mail/mime";

/** Decode a header value the way a mail client does. */
function decodeHeaderValue(header: string): string {
  return header
    .replace(/\r\n /g, "")
    .replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_m, b64: string) => Buffer.from(b64, "base64").toString("utf8"));
}

const LONG_ARABIC = "تغيّرت تفاصيل جلسة «كيف نبني منصة معرفة داخلية تخدم كل الأقسام دون أن تتحول إلى عبء إداري»";

describe("encodeHeaderValue", () => {
  it("leaves a plain ASCII value alone", () => {
    expect(encodeHeaderValue("Session update")).toBe("Session update");
  });

  it("round-trips an Arabic subject exactly", () => {
    expect(decodeHeaderValue(encodeHeaderValue(LONG_ARABIC))).toBe(LONG_ARABIC);
  });

  it("keeps every encoded word inside RFC 2047's 75-character cap", () => {
    const encoded = encodeHeaderValue(LONG_ARABIC);
    const words = encoded.split("\r\n ");
    expect(words.length).toBeGreaterThan(1); // or the cap is not being exercised
    for (const word of words) expect(word.length).toBeLessThanOrEqual(75);
  });

  it("never splits a character across two encoded words", () => {
    // Each word must decode on its own. A seam inside a two-octet Arabic
    // character yields U+FFFD here, which is exactly the mojibake Outlook shows.
    for (const word of encodeHeaderValue(LONG_ARABIC).split("\r\n ")) {
      const decoded = decodeHeaderValue(word);
      expect(decoded).not.toContain("�");
    }
  });

  it("handles a subject made of characters wider than Arabic", () => {
    const emoji = "شهادتك جاهزة 🎓🎓🎓🎓🎓🎓🎓🎓🎓🎓🎓🎓🎓🎓🎓🎓🎓🎓🎓🎓";
    expect(decodeHeaderValue(encodeHeaderValue(emoji))).toBe(emoji);
  });
});

describe("formatAddress", () => {
  it("encodes an Arabic display name and leaves the address bare", () => {
    const formatted = formatAddress("كريم معرفة", "no-reply@kareem.pp.sa");
    expect(formatted).toMatch(/^=\?UTF-8\?B\?[^?]*\?= <no-reply@kareem\.pp\.sa>$/);
    expect(decodeHeaderValue(formatted)).toBe("كريم معرفة <no-reply@kareem.pp.sa>");
  });

  it("quotes an ASCII display name and drops the characters that would break the quoting", () => {
    expect(formatAddress('Kareem "Ma\\rifa"', "a@b.c")).toBe('"Kareem Marifa" <a@b.c>');
  });

  it("returns the bare address when there is no display name", () => {
    expect(formatAddress(null, "a@b.c")).toBe("a@b.c");
  });
});

describe("buildMime", () => {
  const message = buildMime({
    to: "sara@kareem.example",
    from: "كريم معرفة <no-reply@kareem.pp.sa>",
    replyTo: "admin@kareem.example",
    subject: LONG_ARABIC,
    text: "مرحبًا سارة،\n\nتغيّر الموعد.",
    html: "<html dir=\"rtl\"><body>مرحبًا</body></html>",
    date: new Date("2026-09-14T10:00:00Z"),
    messageId: "abc123",
  });

  it("is multipart/alternative with text before html", () => {
    // RFC 2046 §5.1.4: a client shows the LAST part it understands, so the
    // richest alternative goes last.
    expect(message).toMatch(/Content-Type: multipart\/alternative; boundary="([^"]+)"/);
    expect(message.indexOf("text/plain")).toBeLessThan(message.indexOf("text/html"));
  });

  it("carries an encoded subject and a Reply-To", () => {
    const subject = message.split("\r\n").find((l) => l.startsWith("Subject: "))!;
    expect(subject).toContain("=?UTF-8?B?");
    expect(message).toContain("Reply-To: admin@kareem.example");
  });

  it("base64-encodes both bodies, wrapped at 76, and they decode to the originals", () => {
    const boundary = message.match(/boundary="([^"]+)"/)![1];
    const parts = message.split(`--${boundary}`).slice(1, 3);
    const decoded = parts.map((part) => {
      const body = part.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n--$/, "").trim();
      for (const line of body.split("\r\n")) expect(line.length).toBeLessThanOrEqual(76);
      return Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8");
    });
    expect(decoded[0]).toBe("مرحبًا سارة،\n\nتغيّر الموعد.");
    expect(decoded[1]).toContain('dir="rtl"');
  });

  it("uses CRLF line endings throughout, as the wire format requires", () => {
    expect(message.replace(/\r\n/g, "")).not.toContain("\n");
  });
});
