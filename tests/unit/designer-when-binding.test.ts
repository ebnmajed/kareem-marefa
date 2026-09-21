// `{{session.startsAt}}` over a day set — REQ-DSG-002, REQ-SES-015, DEC-160,
// DEC-150 (the day set is the truth, the session's window its stored shadow).
//
// ★ THE POINT OF THIS FILE IS THE FIRST DESCRIBE. A multi-day poster is a new
// feature; a ONE-DAY poster rendering a single character differently from what
// it renders today is a regression on a public artefact — `/api/s/{id}/og` is
// the share image — and «it looked right» is not a proof across a year of
// dates and a world of time zones. So the one-day value is compared, string
// for string, against the formatter that produces it on `main`.
//
// The binding's NAME does not change and no new key appears: a new binding
// would be absent in every document that does not name it — every pinned
// poster, every published template version, and every org's own copy of a
// template, which no seed can reach (REQ-DSG-008).

import { describe, expect, it } from "vitest";
import { formatBindingDateTime, formatBindingWhen, resolveSessionBindings, type SessionBindingRow } from "@kareem/designer-runtime";

const OPTS = { timeZone: "Asia/Riyadh", origin: "https://example.test", orgName: "كريم معرفة" };

/** Zones chosen for what each can break, not for variety: one with no DST, one
 *  at the meridian, one that shifts under the session, and one whose local date
 *  is a day ahead of UTC's. */
const ZONES = ["Asia/Riyadh", "UTC", "Europe/London", "Pacific/Kiritimati"];

/** Instants chosen the same way: a year boundary read in a zone that has
 *  already turned it, a spring-forward hour, a month boundary, a leap day, and
 *  an ordinary afternoon. */
const INSTANTS = [
  "2026-01-01T00:30:00Z",
  "2025-12-31T21:30:00Z",
  "2026-03-29T00:30:00Z",
  "2026-03-29T01:30:00Z",
  "2026-09-30T21:00:00Z",
  "2028-02-29T12:00:00Z",
  "2026-09-19T15:00:00Z",
];

describe("★ one day renders the characters it renders today", () => {
  it("formatBindingWhen of a single day IS formatBindingDateTime, across dates, zones and locales", () => {
    for (const zone of ZONES) {
      for (const locale of ["ar", "en"]) {
        for (const iso of INSTANTS) {
          expect(formatBindingWhen([{ startsAt: iso }], zone, locale), `${iso} ${zone} ${locale}`).toBe(formatBindingDateTime(iso, zone, locale));
        }
      }
    }
  });

  it("the binding object is IDENTICAL to today's — same keys, same values — for a row with no days", () => {
    for (const zone of ZONES) {
      for (const iso of INSTANTS) {
        const row: SessionBindingRow = { id: "11111111-1111-4111-8111-111111111111", title: "جلسة", startsAt: iso, timeZone: zone };
        const out = resolveSessionBindings(row, OPTS);
        // The KEY SET is the assertion, not just the date: a new binding
        // sneaking in here is exactly the defect the lead caught on paper, and
        // it would be invisible in a value-only check.
        expect(Object.keys(out).sort()).toEqual(["org.name", "session.eventUrl", "session.startsAt", "session.title"]);
        expect(out["session.startsAt"]).toBe(formatBindingDateTime(iso, zone, "ar"));
      }
    }
  });

  it("a row carrying exactly ONE day is the same as a row carrying only the instant", () => {
    for (const zone of ZONES) {
      for (const iso of INSTANTS) {
        const base = { id: "11111111-1111-4111-8111-111111111111", title: "جلسة", timeZone: zone };
        expect(resolveSessionBindings({ ...base, days: [{ startsAt: iso }] }, OPTS)).toEqual(resolveSessionBindings({ ...base, startsAt: iso }, OPTS));
      }
    }
  });

  it("an empty day list falls back to the session's own instant — its stored shadow (DEC-150)", () => {
    const row: SessionBindingRow = { id: "11111111-1111-4111-8111-111111111111", title: "جلسة", startsAt: INSTANTS[6], timeZone: "Asia/Riyadh", days: [] };
    expect(resolveSessionBindings(row, OPTS)["session.startsAt"]).toBe(formatBindingDateTime(INSTANTS[6] as string, "Asia/Riyadh", "ar"));
  });

  it("no day and no instant binds nothing — the canvas then draws its marked placeholder (REQ-DSG-006)", () => {
    const row: SessionBindingRow = { id: "11111111-1111-4111-8111-111111111111", title: "جلسة" };
    expect(resolveSessionBindings(row, OPTS)["session.startsAt"]).toBeUndefined();
  });
});

describe("Western numerals, always (DEC-124)", () => {
  // Built from code points, never typed: the rule forbids the glyphs in any
  // file, this one included. `ar`'s CLDR default numbering system is `arab`,
  // which is why every formatter here names `nu-latn` explicitly.
  const ARABIC_INDIC = new RegExp(`[${String.fromCharCode(0x0660)}-${String.fromCharCode(0x0669)}]`);

  it("no produced value carries an Arabic-Indic digit, at any day count, zone or locale", () => {
    const sets = [
      [{ startsAt: "2026-09-19T15:00:00Z" }],
      [{ startsAt: "2026-09-19T15:00:00Z" }, { startsAt: "2026-09-20T15:00:00Z" }, { startsAt: "2026-09-21T15:00:00Z" }],
      [{ startsAt: "2026-09-30T15:00:00Z" }, { startsAt: "2026-10-01T15:00:00Z" }, { startsAt: "2026-10-02T15:00:00Z" }],
      [{ startsAt: "2026-09-19T15:00:00Z" }, { startsAt: "2026-09-21T15:00:00Z" }, { startsAt: "2026-09-26T15:00:00Z" }],
    ];
    for (const zone of ZONES) {
      for (const locale of ["ar", "en"]) {
        for (const days of sets) {
          const v = formatBindingWhen(days, zone, locale);
          expect(v, `${zone} ${locale}`).not.toMatch(ARABIC_INDIC);
          expect(v.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("the multi-day value", () => {
  const RIYADH = "Asia/Riyadh";
  // 15:00Z is 18:00 in Riyadh — one afternoon session a day.
  const at = (d: string, h = "15:00") => `2026-${d}T${h}:00Z`;

  it("consecutive days in one month read as a range, and the range pattern is CLDR's", () => {
    const v = formatBindingWhen([{ startsAt: at("09-19") }, { startsAt: at("09-20") }, { startsAt: at("09-21") }], RIYADH, "ar");
    expect(v).toContain("2026");
    expect(v).toContain("19");
    expect(v).toContain("21");
    // One month name, because CLDR elides the repeated one.
    expect(v.match(/سبتمبر/g)).toHaveLength(1);
    // Every day starts at the same hour, so the time is printed.
    expect(v).toContain("6:00");
  });

  it("consecutive days across a month boundary name BOTH months", () => {
    const v = formatBindingWhen([{ startsAt: at("09-30") }, { startsAt: at("10-01") }, { startsAt: at("10-02") }], RIYADH, "ar");
    expect(v).toContain("سبتمبر");
    expect(v).toContain("أكتوبر");
  });

  it("★ non-consecutive days are LISTED, never collapsed into a range that claims the days between", () => {
    const v = formatBindingWhen([{ startsAt: at("09-19") }, { startsAt: at("09-21") }, { startsAt: at("09-26") }], RIYADH, "ar");
    for (const day of ["19", "21", "26"]) expect(v).toContain(day);
    // Only the last entry carries the month and the year.
    expect(v.match(/سبتمبر/g)).toHaveLength(1);
  });

  it("★ the time is printed only when every day shares it — one time over differing hours is a false statement", () => {
    const same = formatBindingWhen([{ startsAt: at("09-19") }, { startsAt: at("09-20") }], RIYADH, "ar");
    const differing = formatBindingWhen([{ startsAt: at("09-19", "15:00") }, { startsAt: at("09-20", "13:00") }], RIYADH, "ar");
    expect(same).toContain("6:00");
    expect(differing).not.toContain("6:00");
    expect(differing).not.toContain("4:00");
  });

  it("consecutiveness is decided IN THE SESSION'S ZONE, not in UTC", () => {
    // 21:00Z on the 19th and 21:00Z on the 20th are the 20th and the 21st in
    // Riyadh (+3) — consecutive there, and consecutive in UTC too. But 22:00Z
    // on the 19th and 20th are the 20th and 21st local: the zone is what the
    // poster means, because a session happens in a room.
    const v = formatBindingWhen([{ startsAt: "2026-09-19T21:00:00Z" }, { startsAt: "2026-09-20T21:00:00Z" }], RIYADH, "ar");
    expect(v.match(/سبتمبر/g)).toHaveLength(1); // a range, so one month name
    expect(v).toContain("20");
    expect(v).toContain("21");
  });

  it("★ a list too long for `l_when` falls back to the FIRST DAY — today's value, never worse than today", () => {
    // Ten non-consecutive days: measured at 54 characters, which wraps to two
    // lines on every poster preset in both locales, and `l_when` has no
    // `autoFit` so nothing would shrink it.
    const many = Array.from({ length: 10 }, (_, i) => ({ startsAt: at(`09-${String(1 + i * 2).padStart(2, "0")}`) }));
    const v = formatBindingWhen(many, RIYADH, "ar");
    expect(v).toBe(formatBindingDateTime(many[0]!.startsAt, RIYADH, "ar"));
    expect(v.length).toBeLessThanOrEqual(48);
  });

  it("every shape this product can produce stays inside the measured one-line budget", () => {
    const shapes = [
      Array.from({ length: 2 }, (_, i) => ({ startsAt: at(`09-${19 + i}`) })),
      Array.from({ length: 3 }, (_, i) => ({ startsAt: at(`09-${19 + i}`) })),
      Array.from({ length: 5 }, (_, i) => ({ startsAt: at(`09-${19 + i}`) })),
      [{ startsAt: at("09-30") }, { startsAt: at("10-01") }, { startsAt: at("10-02") }],
      [{ startsAt: at("09-19") }, { startsAt: at("09-21") }, { startsAt: at("09-26") }],
    ];
    for (const locale of ["ar", "en"]) {
      for (const days of shapes) expect(formatBindingWhen(days, RIYADH, locale).length, `${locale} n=${days.length}`).toBeLessThanOrEqual(48);
    }
  });
});
