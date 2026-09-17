// notify (wave 9) — the worker's day words are the app's day words.
//
// ★ THE REASON THIS FILE EXISTS. Contract 7 says one day label, in one set of
// words, on every surface. `src/components/sessions/day-label.ts` is that
// formatter for the screens, but `worker/` is a standalone package that
// imports nothing from `src/` — no next-intl, no message loader — so the mail
// carries its own copy of the ordinals. A second copy is a second chance for a
// workshop to call Wednesday «اليوم الثاني» on a screen and «اليوم 2» in the
// mail about it, so the two are diffed here and the build fails if they part.
//
// Same treatment `tests/unit/mail-render.test.ts` gives the template table
// against the notification matrix in migration `0026`.
import { describe, expect, it } from "vitest";
import arSessions from "@/messages/ar/sessions.json";
import { DAY_ORDINALS, dayBlock, dayPhrase } from "@kareem/mail-runtime";
import { NAMED_ORDINALS, dayOrdinal } from "@/components/sessions/day-label";

// The file wraps its own namespace, so the ordinals are one level in.
const ordinals = arSessions.sessions.days.ordinal as Record<string, string>;

describe("the worker's ordinals equal sessions.days.ordinal.*", () => {
  it("the same count — ten words, then the digit", () => {
    expect(DAY_ORDINALS).toHaveLength(Object.keys(ordinals).length);
    expect(DAY_ORDINALS).toHaveLength(NAMED_ORDINALS);
  });

  it("★ the same word at every position, in order", () => {
    for (let position = 1; position <= DAY_ORDINALS.length; position += 1) {
      expect(DAY_ORDINALS[position - 1]).toBe(ordinals[String(position)]);
    }
  });

  it("the worker switches to the digit at the same number the screens do", () => {
    // `dayOrdinal` takes the translator structurally; the app's own table is
    // what it reads, so this is the app's answer beside the worker's.
    const t = ((key: string) => ordinals[key.replace("ordinal.", "")] ?? key) as Parameters<typeof dayOrdinal>[1];
    expect(dayPhrase(10)).toBe(`اليوم ${dayOrdinal(10, t)}`);
    // Eleven has no word on either side, and DEC-124's numeral is Western.
    expect(dayPhrase(11)).toBe("اليوم 11");
    expect(dayPhrase(11)).not.toMatch(/[٠-٩]/);
  });
});

describe("dayBlock — empty at one day, so a reminder does not move", () => {
  it("★ one day produces the empty string, which toParagraphs() then drops", () => {
    expect(dayBlock({ dayPosition: 1, dayCount: 1 })).toBe("");
    // And so does a payload from before days existed, or from `main`.
    expect(dayBlock({})).toBe("");
    expect(dayBlock({ dayPosition: 1 })).toBe("");
  });

  it("several days produce «اليوم الثاني من 3», with a Western numeral", () => {
    expect(dayBlock({ dayPosition: 2, dayCount: 3 })).toBe("اليوم الثاني من 3");
    expect(dayBlock({ dayPosition: 1, dayCount: 2 })).toBe("اليوم الأول من 2");
    expect(dayBlock({ dayPosition: 12, dayCount: 14 })).toBe("اليوم 12 من 14");
  });

  it("a nonsense payload is empty rather than «اليوم NaN»", () => {
    expect(dayBlock({ dayPosition: "ثاني", dayCount: 3 })).toBe("");
    expect(dayBlock({ dayPosition: 0, dayCount: 3 })).toBe("");
    expect(dayBlock({ dayPosition: null, dayCount: null })).toBe("");
  });
});
