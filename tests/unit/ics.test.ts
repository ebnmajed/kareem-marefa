// The ICS builder — src/components/calendar/ics.ts, REQ-CAL-001, 08 §6.1.
//
// ★ The named test case of 13-testing-quality.md: folding is at 75 OCTETS,
// and an Arabic character is two octets in UTF-8. Folding by character count
// produces a file Outlook renders as mojibake or refuses outright, and it
// looks perfect in every editor because the bytes are only wrong on the wire.
import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine, hasFixedOffset, localStamp } from "../../src/components/calendar/ics";

const CRLF = "\r\n";
const ARABIC_TITLE = "كيف نبني منصة معرفة داخلية تخدم كل الأقسام دون أن تتحول إلى عبء إداري على أحد";

/** Unfold the way a parser does: drop CRLF followed by a single space. */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");
const octets = (s: string) => Buffer.byteLength(s, "utf8");

describe("foldLine — 75 OCTETS, not 75 characters", () => {
  it("leaves a short line alone", () => {
    expect(foldLine("VERSION:2.0")).toBe("VERSION:2.0");
  });

  it("folds an Arabic line, and every physical line fits in 75 octets", () => {
    const folded = foldLine(`SUMMARY:${ARABIC_TITLE}`);
    const physical = folded.split(CRLF);
    expect(physical.length).toBeGreaterThan(1);
    for (const line of physical) expect(octets(line)).toBeLessThanOrEqual(75);
  });

  it("round-trips exactly — no character is lost or cut in half", () => {
    const line = `SUMMARY:${ARABIC_TITLE}`;
    expect(unfold(foldLine(line))).toBe(line);
    expect(foldLine(line)).not.toContain("�");
  });

  it("is a real test — folding by character count would NOT satisfy it", () => {
    // 40 Arabic characters is 80 octets: under a 75-character limit, over a
    // 75-octet one. A character-counting implementation returns it unfolded.
    const line = "ج".repeat(40);
    expect(line.length).toBeLessThan(75);
    expect(octets(line)).toBeGreaterThan(75);
    expect(foldLine(line)).toContain(CRLF);
  });

  it("gives a continuation line 74 octets of content, because the space counts", () => {
    for (const line of foldLine(`DESCRIPTION:${ARABIC_TITLE} ${ARABIC_TITLE}`).split(CRLF)) {
      expect(octets(line)).toBeLessThanOrEqual(75);
    }
  });
});

describe("escapeText — RFC 5545 §3.3.11", () => {
  it("escapes the backslash first, or it escapes the escapes", () => {
    expect(escapeText("a\\b")).toBe("a\\\\b");
    expect(escapeText("قاعة أ; الدور الثاني, يمين")).toBe("قاعة أ\\; الدور الثاني\\, يمين");
    expect(escapeText("سطر\nآخر")).toBe("سطر\\nآخر");
  });
});

describe("time zones", () => {
  it("knows Asia/Riyadh keeps one offset all year, and that a DST zone does not", () => {
    expect(hasFixedOffset("Asia/Riyadh", 2026)).toBe(true);
    expect(hasFixedOffset("Europe/London", 2026)).toBe(false);
  });

  it("renders the wall-clock time in the session's zone", () => {
    // 15:00 UTC is 18:00 in Riyadh (+03, no DST).
    expect(localStamp(new Date("2026-10-01T15:00:00Z"), "Asia/Riyadh")).toBe("20261001T180000");
  });
});

describe("buildIcs", () => {
  const event = {
    uid: "session-1@kareem.pp.sa",
    title: ARABIC_TITLE,
    description: "ملخص الجلسة، بالعربية، مع فاصلة ونقطتين: هنا",
    startsAt: "2026-10-01T15:00:00Z",
    endsAt: "2026-10-01T16:00:00Z",
    timeZone: "Asia/Riyadh",
    location: "قاعة الابتكار، الدور الثاني",
    url: "https://kareem.pp.sa/ar/app/sessions/1",
    now: new Date("2026-09-14T08:00:00Z"),
  };
  const ics = buildIcs(event);

  it("is a well-formed VCALENDAR with one VEVENT", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("uses CRLF everywhere, as the wire format requires", () => {
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("holds every physical line to 75 octets, Arabic included", () => {
    for (const line of ics.split(CRLF)) expect(octets(line)).toBeLessThanOrEqual(75);
  });

  it("carries the title, description, venue and link back, unfolded intact", () => {
    const flat = unfold(ics);
    expect(flat).toContain(`SUMMARY:${ARABIC_TITLE}`);
    expect(flat).toContain("قاعة الابتكار");
    expect(flat).toContain("URL:https://kareem.pp.sa/ar/app/sessions/1");
  });

  it("uses TZID with an embedded VTIMEZONE, not a floating local time (08 §6.1)", () => {
    // A member in another zone must see the hour the session happens.
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:Asia/Riyadh");
    expect(unfold(ics)).toContain("DTSTART;TZID=Asia/Riyadh:20261001T180000");
    expect(unfold(ics)).toContain("DTEND;TZID=Asia/Riyadh:20261001T190000");
    expect(ics).toContain("TZOFFSETTO:+0300");
  });

  it("falls back to UTC instants for a zone with daylight saving", () => {
    // A VTIMEZONE without transition rules silently shifts the event by an
    // hour for half the year, which is worse than no VTIMEZONE at all.
    const london = buildIcs({ ...event, timeZone: "Europe/London" });
    expect(london).not.toContain("BEGIN:VTIMEZONE");
    expect(unfold(london)).toContain("DTSTART:20261001T150000Z");
  });

  it("marks a cancelled session CANCELLED and carries the sequence", () => {
    const cancelled = buildIcs({ ...event, cancelled: true, sequence: 3 });
    expect(cancelled).toContain("STATUS:CANCELLED");
    expect(cancelled).toContain("SEQUENCE:3");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("SEQUENCE:0");
  });

  it("decodes as valid UTF-8 with no replacement characters", () => {
    const bytes = Buffer.from(ics, "utf8");
    expect(bytes.toString("utf8")).toBe(ics);
    expect(ics).not.toContain("�");
  });
});
