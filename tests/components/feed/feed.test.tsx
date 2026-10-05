// The home's column — SCR-010, REQ-UIX-055, STORY-UIX-044. The regions in the artboard's order; the prompts
// above the week; the staff strip for staff alone; the race once, after the first day; an empty feed that asks
// for a proposal; exactly one `role="status"`, and only with no company (session.spec.ts:94 and :113 read it).
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import feedAr from "@/messages/ar/feed.json";
import appAr from "@/messages/ar/app.json";
import scoringAr from "@/messages/ar/scoring.json";
import type { Feed as FeedData } from "@/lib/dal/feed";
import { resolveTree } from "./resolve";

const messages = { ...feedAr, ...appAr, ...scoringAr };
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "feed" }),
}));
vi.mock("@/lib/dal/feed", () => ({ getFeed: vi.fn() }));
vi.mock("@/lib/dal/search", () => ({ getTimeline: vi.fn().mockResolvedValue({ pinned: null, items: [], orgTimeZone: "Asia/Riyadh" }) }));
vi.mock("@/components/privacy/avatar-import-prompt", () => ({ AvatarImportPrompt: () => <div data-region="avatar-prompt" /> }));
vi.mock("@/components/scoring/member-week-hud", () => ({ MemberWeekHud: ({ className }: { className?: string }) => <div data-region="week" className={className} /> }));
vi.mock("@/components/scoring/company-race-card", () => ({ CompanyRaceCard: ({ className }: { className?: string }) => <div data-region="race" className={className} /> }));
vi.mock("@/components/feed/session-post", () => ({ SessionPost: ({ post }: { post: { id: string } }) => <article data-region="post" data-id={post.id} /> }));
vi.mock("@/components/feed/recap-post", () => ({ RecapPost: () => <article data-region="recap" /> }));
vi.mock("@/components/feed/achievement", () => ({ Achievement: () => <article data-region="achievement" /> }));
vi.mock("@/components/feed/announcement", () => ({ Announcement: () => <article data-region="announcement" /> }));
// ★ Wave 26 (DEC-251 §4, ledger): the ring row is `sessions'` story feed rendered by `content`'s `StoryRings` — its own
// suites are tests/components/stories/**. Here it is a stand-in that draws the row or, with no story, nothing.
let ringsShown = true;
vi.mock("@/components/stories/story-rings", () => ({
  StoryRings: () => (ringsShown ? <ul aria-label="جلسات اليوم وما حوله" /> : null),
}));

const { getFeed } = await import("@/lib/dal/feed");
const { Feed } = await import("@/components/feed/feed");

const TODAY = "2026-09-30";
const post = (id: string) => ({ id }) as never;

function feed(over: Partial<FeedData> = {}): FeedData {
  return {
    viewer: { memberId: "me", isStaff: false },
    groups: [
      { day: TODAY, entries: [{ kind: "session", key: "session:s1", day: TODAY, at: `${TODAY}T12:00:00Z`, post: post("s1") }] },
      { day: "2026-10-02", entries: [{ kind: "session", key: "session:s2", day: "2026-10-02", at: "2026-10-02T15:00:00Z", post: post("s2") }] },
      { day: "2026-09-29", entries: [{ kind: "recap", key: "recap:s3", day: "2026-09-29", at: "2026-09-29T17:00:00Z", post: post("s3") }] },
    ],
    recaps: {},
    attention: null,
    timeZone: "Asia/Riyadh",
    today: TODAY,
    now: `${TODAY}T12:00:00Z`,
    ...over,
  };
}

async function show(data: FeedData, rings = true) {
  ringsShown = rings;
  vi.mocked(getFeed).mockResolvedValue(data);
  const ui = await resolveTree(await Feed({ locale: "ar" }));
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** Suspense children resolve in jsdom; wait for the streamed regions. */
async function regions(container: HTMLElement) {
  await screen.findByText("عندك موضوع؟");
  return [...container.querySelectorAll("[data-region], ul[aria-label], h2")].map((el) => el.getAttribute("data-region") ?? (el.tagName === "UL" ? "rings" : `h2:${el.textContent}`));
}

describe("Feed", () => {
  it("draws the regions in the artboard's order: rings · prompts · week · the days (race after the first) · propose", async () => {
    const { container } = await show(feed());
    await screen.findByText("عندك موضوع؟");
    const order = await regions(container);
    expect(order).toEqual(["rings", "avatar-prompt", "week", "h2:اليوم", "post", "race", expect.stringMatching(/^h2:/), "post", "h2:أمس", "recap", "h2:عندك موضوع؟"]);
  });

  // wave 27 (DEC-255 §4, REQ-PRF-012): the «choose your company» status line is gone with the gate it announced.
  it("there is no role=status on the home: nothing asks a member for a company", async () => {
    await show(feed());
    expect(screen.queryAllByRole("status")).toHaveLength(0);
    expect(screen.queryByText(/اختر شركتك/)).not.toBeInTheDocument();
  });

  it("the staff strip is drawn for staff with something waiting, and each count links to its queue", async () => {
    await show(feed({ viewer: { memberId: "me", isStaff: true }, attention: { proposals: 2, unscheduled: 0, photoReports: 1, commentReports: 0, total: 3 } }));
    expect(screen.getByRole("heading", { name: "يحتاج انتباهك" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "مقترحان بانتظار القرار" })).toHaveAttribute("href", expect.stringContaining("/app/admin/proposals"));
    expect(screen.queryByText(/جلسة بلا موعد/)).not.toBeInTheDocument();
  });

  it("a member sees no staff strip", async () => {
    await show(feed());
    expect(screen.queryByRole("heading", { name: "يحتاج انتباهك" })).not.toBeInTheDocument();
  });

  it("the week and the race are phone-only in the column: the rail carries them from lg", async () => {
    const { container } = await show(feed());
    await screen.findByText("عندك موضوع؟");
    expect(container.querySelector('[data-region="week"]')).toHaveClass("lg:hidden");
    expect(container.querySelector('[data-region="race"]')).toHaveClass("lg:hidden");
  });

  it("an empty feed asks for a proposal, and draws no ring row and no race", async () => {
    const { container } = await show(feed({ groups: [] }), false);
    expect(await screen.findByText("لا شيء في الساحة بعد")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "اقترح موضوعًا" })).toHaveAttribute("href", expect.stringContaining("/app/propose"));
    expect(container.querySelector("ul[aria-label]")).toBeNull();
    expect(container.querySelector('[data-region="race"]')).toBeNull();
  });

  it("the ring row is the story feed's, first among the regions (wave 26)", async () => {
    await show(feed());
    expect(screen.getByRole("list", { name: "جلسات اليوم وما حوله" })).toBeInTheDocument();
  });

});
