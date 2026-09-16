import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatNumber, formatTime } from "@/components/sessions/numerals";

// The shared formatter every surface prints a date, a time or a number with —
// Western digits always (DEC-124), and ★ a time that never breaks from its day
// period on a narrow line (wave 7: «6:57» / «م» on the public card and the
// calendar). The no-break space is pinned by its code point, because a plain
// space and U+00A0 look identical in any assertion written by eye.

const AT = "2026-09-19T15:57:00Z"; // 6:57 p.m. in Riyadh
const TZ = "Asia/Riyadh";
const INDIC = /[٠-٩۰-۹]/;

describe("formatTime / formatDateTime", () => {
  it("★ join the Arabic time and «م» with U+00A0, not a breakable space", () => {
    expect(formatTime(AT, TZ)).toBe("6:57 م");
    expect(formatDateTime(AT, TZ)).toContain("6:57 م");
    expect(formatDateTime(AT, TZ)).not.toContain("6:57 م");
  });

  it("do the same in English", () => {
    expect(formatTime(AT, TZ, "en")).toBe("6:57 PM");
  });

  it("change nothing else — the date keeps its ordinary, breakable spaces", () => {
    expect(formatDateTime(AT, TZ)).toMatch(/^السبت، 19 سبتمبر 2026 في 6:57 م$/);
  });

  it("print Western digits, never Arabic-Indic", () => {
    for (const out of [formatTime(AT, TZ), formatDateTime(AT, TZ), formatDate(AT, TZ), formatNumber(1234567)]) expect(out).not.toMatch(INDIC);
  });
});
