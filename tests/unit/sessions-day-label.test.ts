// CONTRACT 7 — the one day label (DEC-119, DEC-150). Read against the REAL
// `ar/sessions.json` through next-intl's `createTranslator`, the pattern
// `tests/components/tasks/panel.test.tsx` set: a renamed key fails here rather
// than on `content`'s slot, `checkin`'s screen and `notify`'s mail at once.
//
// A NEW file (wave-9 rule 4): nothing here edits an existing expectation.
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "@/messages/ar/sessions.json";
import en from "@/messages/en/sessions.json";
import { NAMED_ORDINALS, dayCountLabel, dayLabel, dayOrdinal, dayRange, dayShortLabel } from "@/components/sessions/day-label";

const ZONE = "Asia/Riyadh";
const t = createTranslator({ locale: "ar", messages: ar, namespace: "sessions.days" });
const tEn = createTranslator({ locale: "en", messages: en, namespace: "sessions.days" });

/** Wednesday 30 September 2026, 6 p.m. in Riyadh — and the two evenings after it. */
const WED = "2026-09-30T15:00:00.000Z";
const THU = "2026-10-01T15:00:00.000Z";
const FRI = "2026-10-02T15:00:00.000Z";

describe("the ordinal is a word to ten and a Western digit from eleven", () => {
  it("names every day the catalogue has a word for", () => {
    expect(dayOrdinal(1, t)).toBe("الأول");
    expect(dayOrdinal(2, t)).toBe("الثاني");
    expect(dayOrdinal(NAMED_ORDINALS, t)).toBe("العاشر");
  });

  it("★ day eleven reads «اليوم 11 · الأحد» — a digit, never a compound ordinal", () => {
    // 11 October 2026 is a Sunday.
    expect(dayLabel({ position: 11, startsAt: "2026-10-11T15:00:00.000Z" }, ZONE, t)).toBe("اليوم 11 · الأحد");
    expect(dayOrdinal(11, t)).toBe("11");
    expect(dayShortLabel({ position: 11, startsAt: WED }, t)).toBe("اليوم 11");
  });

  it("never prints an Arabic-Indic digit, at any position (DEC-124)", () => {
    for (const position of [1, 9, 10, 11, 12, 30]) {
      expect(dayLabel({ position, startsAt: WED }, ZONE, t)).not.toMatch(/[\u0660-\u0669]/u);
    }
  });
});

describe("the label", () => {
  it("is «اليوم الأول · الأربعاء» — the ordinal and the weekday", () => {
    expect(dayLabel({ position: 1, startsAt: WED }, ZONE, t)).toBe("اليوم الأول · الأربعاء");
    expect(dayLabel({ position: 2, startsAt: THU }, ZONE, t)).toBe("اليوم الثاني · الخميس");
    expect(dayLabel({ position: 3, startsAt: FRI }, ZONE, t)).toBe("اليوم الثالث · الجمعة");
  });

  it("★ reads the weekday in the SESSION'S zone, not the server's (OQ-018)", () => {
    // One instant, two weekdays: 21:30 UTC on Wednesday is 00:30 Thursday in
    // Riyadh and 22:30 Wednesday in London. The room's answer is the one a
    // member turns up for, so the session's zone decides and the reader's
    // never does.
    const lateWed = "2026-09-30T21:30:00.000Z";
    expect(dayLabel({ position: 1, startsAt: lateWed }, ZONE, t)).toBe("اليوم الأول · الخميس");
    expect(dayLabel({ position: 1, startsAt: lateWed }, "Europe/London", t)).toBe("اليوم الأول · الأربعاء");
  });

  it("gives the short form for a chip, with no weekday", () => {
    expect(dayShortLabel({ position: 2, startsAt: THU }, t)).toBe("اليوم الثاني");
  });
});

describe("the range and the count", () => {
  it("spans the session's STORED window, first day to last", () => {
    expect(dayRange(WED, FRI, ZONE, t)).toBe("الأربعاء، 30 سبتمبر — الجمعة، 2 أكتوبر");
  });

  it("counts days through all six ICU forms, in Western digits", () => {
    expect(dayCountLabel(1, t)).toBe("يوم واحد");
    expect(dayCountLabel(2, t)).toBe("يومان");
    expect(dayCountLabel(3, t)).toBe("3 أيام");
    expect(dayCountLabel(11, t)).toBe("11 يومًا");
    expect(dayCountLabel(100, t)).toBe("100 يوم");
  });
});

describe("English is a translation of the same keys, not a second formatter", () => {
  it("renders every shape the Arabic catalogue does", () => {
    expect(dayLabel({ position: 1, startsAt: WED }, ZONE, tEn, "en")).toBe("Day 1 · Wednesday");
    expect(dayLabel({ position: 11, startsAt: "2026-10-11T15:00:00.000Z" }, ZONE, tEn, "en")).toBe("Day 11 · Sunday");
    expect(dayCountLabel(3, tEn)).toBe("3 days");
  });
});
