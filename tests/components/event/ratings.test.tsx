// The `Ratings` slot (REQ-RAT-004, REQ-RAT-005, REQ-RAT-006) — a SUMMARY,
// not the form. Real ar/ratings.json through next-intl's createTranslator,
// only src/lib/dal/ratings.ts mocked.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/ratings.json";
import type { RatingsSummary } from "@/lib/dal/ratings";

vi.mock("@/lib/dal/ratings", () => ({ getRatingsSummary: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "ratings" }),
}));

const { getRatingsSummary } = await import("@/lib/dal/ratings");
const { Ratings } = await import("@/components/event/ratings");

const sessionId = "11111111-1111-1111-1111-111111111111";

const base: RatingsSummary = {
  eligibility: { eligible: false, reason: "not_completed", checkInId: null, windowClosesAt: null, existing: null },
  isPresenter: false,
  isStaff: false,
  aggregate: null,
  countForWithheld: null,
  minAggregate: 3,
  numerals: "western",
};

describe("Ratings slot", () => {
  it("renders nothing before completion for an ordinary member", async () => {
    vi.mocked(getRatingsSummary).mockResolvedValue({ ...base });
    const result = await Ratings({ sessionId, memberId: "m1", locale: "ar" });
    expect(result).toBeNull();
  });

  it("renders nothing for a member who never checked in, even after completion", async () => {
    vi.mocked(getRatingsSummary).mockResolvedValue({ ...base, eligibility: { ...base.eligibility, reason: "not_checked_in" } });
    const result = await Ratings({ sessionId, memberId: "m1", locale: "ar" });
    expect(result).toBeNull();
  });

  it("offers the rate CTA to a checked-in member inside the window", async () => {
    vi.mocked(getRatingsSummary).mockResolvedValue({ ...base, eligibility: { eligible: true, reason: null, checkInId: "ci1", windowClosesAt: "2026-10-01", existing: null } });
    const element = await Ratings({ sessionId, memberId: "m1", locale: "ar" });
    render(<NextIntlClientProvider locale="ar">{element}</NextIntlClientProvider>);
    expect(screen.getByRole("link", { name: "قيّم الجلسة" })).toHaveAttribute("href", `/ar/app/sessions/${sessionId}/rate`);
  });

  it("shows the already-rated copy once a rating exists and the window is closed", async () => {
    vi.mocked(getRatingsSummary).mockResolvedValue({
      ...base,
      eligibility: {
        eligible: false,
        reason: "window_closed",
        checkInId: "ci1",
        windowClosesAt: "2026-09-01",
        existing: { id: "r1", sessionId, sessionStars: 5, presenterStars: 5, comment: null, submittedAt: "x", editedAt: null },
      },
    });
    render(await Ratings({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText("شكرًا على تقييمك")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("a presenter with only 2 ratings sees the COUNT, never an average (REQ-RAT-006)", async () => {
    vi.mocked(getRatingsSummary).mockResolvedValue({
      ...base,
      eligibility: { ...base.eligibility, reason: "not_checked_in" }, // the presenter never checked in to their own session
      isPresenter: true,
      countForWithheld: 2,
      minAggregate: 3,
    });
    render(await Ratings({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText("تقييمان حتى الآن")).toBeInTheDocument();
    expect(screen.getByText("تظهر النتائج بعد 3 تقييمات على الأقل")).toBeInTheDocument();
    // No average is rendered at all below the minimum — not a zero, not a dash.
    expect(screen.queryByText(/تقييم الجلسة$/)).not.toBeInTheDocument();
  });

  it("a presenter with 3+ ratings sees the real averages and unattributed comments", async () => {
    vi.mocked(getRatingsSummary).mockResolvedValue({
      ...base,
      eligibility: { ...base.eligibility, reason: "not_checked_in" },
      isPresenter: true,
      aggregate: { ratingCount: 3, sessionAvg: 4.33, presenterAvg: 4.67, comments: ["جلسة رائعة"] },
    });
    render(await Ratings({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText("4.33")).toBeInTheDocument();
    expect(screen.getByText("4.67")).toBeInTheDocument();
    expect(screen.getByText("«جلسة رائعة»")).toBeInTheDocument();
  });

  it("a moderator (staff, not presenter) also gets the presenter-style aggregate view", async () => {
    vi.mocked(getRatingsSummary).mockResolvedValue({
      ...base,
      eligibility: { ...base.eligibility, reason: "not_checked_in" },
      isStaff: true,
      aggregate: { ratingCount: 3, sessionAvg: 5, presenterAvg: 5, comments: [] },
    });
    render(await Ratings({ sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText("تقييم الحضور")).toBeInTheDocument();
    expect(screen.getByText("لا ملاحظات مكتوبة")).toBeInTheDocument();
  });
});
