// `ratingChanged()` — the second press on SCR-015 (`DEC-164`).
//
// A member who left a required survey question empty gets their rating stored
// and the survey refused. On the way back they may fix the question AND change
// their mind about the stars. «The second press submits the survey alone» is
// true for a member who changed nothing; for one who did, dropping the edit
// silently would be the quiet kind of data loss — and writing an `edited_at`
// for an identical value would say a member revised a rating they did not.
//
// `comment` arrives as `string | null`: the action trims and maps «» to null,
// so the two spellings of «nothing» must compare equal or every second press
// would write a pointless edit.
import { describe, expect, it } from "vitest";
import { ratingChanged } from "@/app/[locale]/app/sessions/[id]/rate/state";

const stored = { sessionStars: 5, presenterStars: 4, comment: "جلسة ممتازة" };

describe("ratingChanged", () => {
  it("is false when the member changed nothing — the second press writes no rating at all", () => {
    expect(ratingChanged(stored, { ...stored })).toBe(false);
  });

  it("is true when either row of stars moved", () => {
    expect(ratingChanged(stored, { ...stored, sessionStars: 4 })).toBe(true);
    expect(ratingChanged(stored, { ...stored, presenterStars: 5 })).toBe(true);
  });

  it("is true when the comment was written, changed or cleared", () => {
    expect(ratingChanged({ ...stored, comment: null }, { ...stored, comment: "أضفت ملاحظة" })).toBe(true);
    expect(ratingChanged(stored, { ...stored, comment: "غيّرت رأيي" })).toBe(true);
    expect(ratingChanged(stored, { ...stored, comment: null })).toBe(true);
  });

  it("★ null and the empty string are the same nothing — otherwise every second press would write an edit", () => {
    expect(ratingChanged({ ...stored, comment: null }, { ...stored, comment: "" })).toBe(false);
    expect(ratingChanged({ ...stored, comment: "" }, { ...stored, comment: null })).toBe(false);
  });
});
