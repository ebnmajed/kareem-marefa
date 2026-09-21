// notify (wave 9) — NAMED DIFFERENCE 4: an instant in a mail is a date, not
// an ISO string.
//
// ★ HOW THIS WAS FOUND, and why the suite that exists never would have.
// `{{startsAt}}` is in seven of `08` §3.2's templates. The value reaching it
// comes from a trigger — `jsonb_build_object('startsAt', s.starts_at)` — and
// the local database renders that as `2026-09-19T06:37:03.319767+00:00`.
// `interpolate()` is deliberately logic-free and calls `String(value)`, so
// that is what a member has read since M3. `tests/unit/mail-render.test.ts`
// passes «الأحد 6:00 م» as its fixture, so it asserts a value the product
// never produces — which is exactly why this file uses the database's own
// string rather than a convenient one.
//
// DEC-151 approved the fix conditionally, on the raw string being shown first.
// It is shown here, as the input, and the assertion is the repaired output.
import { describe, expect, it } from "vitest";
import { renderEmail } from "@kareem/mail-runtime";

/** Verbatim from `select jsonb_build_object('startsAt', s.starts_at)` against
 *  the local database — microseconds, offset and all. */
const FROM_THE_DATABASE = "2026-09-19T06:37:03.319767+00:00";

const render = (key: string, payload: Record<string, unknown>) =>
  renderEmail({
    key,
    payload,
    member: { name: "سارة العتيبي", email: "sara@kareem.example" },
    org: { name: "كريم معرفة", timeZone: "Asia/Riyadh" },
  });

describe("an instant in the payload is formatted in the ORG's zone", () => {
  it("★ the reminder no longer prints an ISO string", () => {
    const out = render("MSG-reminder_2h", {
      title: "كيف نكتب تقريرًا يُقرأ",
      startsAt: FROM_THE_DATABASE,
      venue: "قاعة الابتكار",
      url: "https://kareem.pp.sa/x",
    });

    expect(out.text).not.toContain(FROM_THE_DATABASE);
    expect(out.text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    // Asia/Riyadh is UTC+3, so 06:37Z is 9:37 in the room.
    expect(out.text).toContain("9:37");
    expect(out.text).toMatch(/سبتمبر|أيلول/);
  });

  it("Western digits, never Arabic-Indic (DEC-124)", () => {
    const out = render("MSG-session_published", {
      title: "جلسة",
      startsAt: FROM_THE_DATABASE,
      venue: "قاعة",
      url: "https://kareem.pp.sa/x",
    });
    expect(out.text).not.toMatch(/[٠-٩]/);
    expect(out.html).not.toMatch(/[٠-٩]/);
  });

  it("a value that is not an instant is left exactly as it is", () => {
    const out = render("MSG-certificate_revoked", { serial: "KM-2026-0042", url: "https://kareem.pp.sa/x" });
    expect(out.text).toContain("KM-2026-0042");
  });

  it("a payload that already carries a formatted date is untouched — the old fixtures still read the same", () => {
    const out = render("MSG-session_published", {
      title: "جلسة",
      startsAt: "الأحد 6:00 م",
      venue: "قاعة الابتكار",
      url: "https://kareem.pp.sa/x",
    });
    expect(out.text).toContain("الأحد 6:00 م");
  });

  it("the change block was already right, and stays right", () => {
    const out = render("MSG-session_changed", {
      title: "جلسة",
      changes: [{ field: "starts_at", from: FROM_THE_DATABASE, to: "2026-09-20T06:37:03.319767+00:00" }],
      url: "https://kareem.pp.sa/x",
    });
    expect(out.text).not.toContain(FROM_THE_DATABASE);
    expect(out.text).toContain("الموعد:");
  });
});
