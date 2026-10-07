// A session post on the home — REQ-UIX-055, DEC-206 §4.45 – §4.61, DEC-207 §2. The action is a LINK, never a
// reservation; the amount is the rule's and never «+0»; a cancelled post offers nothing; with no company the
// control says why. RTL document.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import feedAr from "@/messages/ar/feed.json";
import sessionsAr from "@/messages/ar/sessions.json";
import browseAr from "@/messages/ar/browse.json";
import type { SessionPost as Post } from "@/components/browse/session-post";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) =>
    namespace.startsWith("sessions")
      ? createTranslator({ locale: "ar", messages: sessionsAr, namespace: namespace as "sessions.days" })
      : namespace === "browse"
        ? createTranslator({ locale: "ar", messages: browseAr, namespace: "browse" })
        : createTranslator({ locale: "ar", messages: feedAr, namespace: namespace as "feed" }),
}));
vi.mock("@/components/feed/actions", () => ({ toggleSessionLike: vi.fn() }));
vi.mock("@/components/checkin/actions", () => ({ reserveSeatAction: vi.fn() }));
vi.mock("@/components/search/bookmark-button", () => ({ BookmarkButton: () => <button type="button">احفظ</button> }));
vi.mock("@/components/sessions/share-link", () => ({ ShareLink: ({ label }: { label: string }) => <button type="button">{label}</button> }));

const { SessionPost } = await import("@/components/feed/session-post");

const TODAY = "2026-09-30";

function post(over: Partial<Post> = {}): Post {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "لوحة تحكم لا يهجرها أحد",
    state: "published",
    phase: "open",
    seat: "available",
    closingSoon: false,
    startsAt: "2026-10-02T15:30:00Z",
    endsAt: "2026-10-02T17:00:00Z",
    days: [],
    timeZone: "Asia/Riyadh",
    categoryId: null,
    categoryName: "إداري",
    venueName: "قاعة الرياض",
    level: "beginner",
    language: "ar",
    capacity: 40,
    confirmedCount: 12,
    waitlistCount: 0,
    presenters: [{ memberId: "m1", displayName: "نورة العتيبي", avatarUrl: null, company: { id: "c1", name: "صنف", teamColor: "#FF9A2E" } }],
    tags: [],
    mine: null,
    attended: false,
    bookmarked: false,
    posterUrl: null,
    canCheckIn: false,
    href: "/app/sessions/11111111-1111-1111-1111-111111111111",
    excerpt: null,
    day: "2026-10-02",
    committed: false,
    attendancePoints: 20,
    commentCount: 3,
    likeCount: 12,
    likedByMe: false,
    attendedCount: null,
    action: { kind: "reserve", href: "/app/sessions/11111111-1111-1111-1111-111111111111" },
    ...over,
  } as Post;
}

async function show(p: Post) {
  const ui = await SessionPost({ post: p, locale: "ar", today: TODAY });
  return render(
    <NextIntlClientProvider locale="ar" messages={{ ...browseAr, ...feedAr }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SessionPost", () => {
  // DEC-276 (the owner's ruling, amending §4.57): reserving is made in place — a form posting the feed's action,
  // never a link to the event page.
  it("reserving is a FORM on the feed, with the rule's amount — not a link to the event page (DEC-276)", async () => {
    const { container } = await show(post());
    const button = screen.getByRole("button", { name: /احجز مقعدك/ });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveTextContent("+20");
    expect(button.closest("form")).not.toBeNull();
    expect(container.querySelector('a[href*="/app/sessions/11111111"][class*="w-full"]')).toBeNull();
  });

  it("draws no amount when the rule pays nothing — never «+0»", async () => {
    const { container } = await show(post({ attendancePoints: null }));
    expect(container.textContent).not.toMatch(/\+0|\+\s/);
  });

  it("the placeholder poster carries the amount; a rendered poster carries none (§4.46)", async () => {
    const { container, unmount } = await show(post());
    expect(container.querySelector('[data-slot="poster-placeholder"]')).toHaveTextContent("+20");
    unmount();
    const rendered = await show(post({ posterUrl: "https://example.test/p.png" }));
    expect(rendered.container.querySelector('[data-slot="poster-placeholder"]')).toBeNull();
    expect(rendered.container.querySelector('[data-slot="media"] img')).toHaveClass("object-contain");
  });

  it("an open post says its seats and keeps share and bookmark beside them (DEC-207 §6.9)", async () => {
    await show(post());
    expect(screen.getByText("12 من 40 مقعدًا")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "شارك" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "احفظ" })).toBeInTheDocument();
  });

  it("the comments are a link to the discussion, named with their count", async () => {
    await show(post());
    expect(screen.getByRole("link", { name: "3 تعليقات" })).toHaveAttribute("href", expect.stringContaining("#discussion"));
  });

  // wave 27 (DEC-255 §4, REQ-PRF-012): the «choose your company first» control is gone — a member no longer chooses
  // a company, so its absence refuses nothing. The post takes no «has a company» input at all.
  it("the reserve control never depends on the viewer's company", async () => {
    await show(post());
    expect(screen.getByRole("button", { name: /احجز مقعدك/ })).toBeInTheDocument();
    expect(screen.queryByText(/اختر شركتك/)).not.toBeInTheDocument();
  });

  it("a cancelled post keeps its badge and offers nothing — no action, no reactions, no share", async () => {
    const { container } = await show(post({ phase: "cancelled", state: "cancelled", action: { kind: "none" } }));
    expect(screen.queryByRole("group", { name: "التفاعل مع الجلسة" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "شارك" })).not.toBeInTheDocument();
    expect(container.textContent).toContain("أُلغيت");
  });

  it("★ a cancelled post's placeholder drains to grey at full opacity; a rendered poster keeps the whole wash (REQ-NFR-007)", async () => {
    const { container, unmount } = await show(post({ phase: "cancelled", state: "cancelled", action: { kind: "none" } }));
    const placeholder = container.querySelector('[data-slot="poster-placeholder"]')!.closest('[data-slot="media"]');
    // The placeholder draws the title, category and date as text: `opacity-45` took them under 4.5:1.
    expect(placeholder).toHaveClass("grayscale");
    expect(placeholder).not.toHaveClass("opacity-45");
    unmount();
    const rendered = await show(post({ phase: "cancelled", state: "cancelled", action: { kind: "none" }, posterUrl: "https://example.test/p.png" }));
    expect(rendered.container.querySelector('[data-slot="media"]')).toHaveClass("grayscale", "opacity-45");
  });

  it("a live post with a count says how many are here — a number, never who (§4.56)", async () => {
    const { container } = await show(post({ phase: "live", state: "in_progress", attendedCount: 23, action: { kind: "checkIn", href: "/app/sessions/x/check-in", booked: true } }));
    expect(screen.getByText("23 حاضرًا الآن")).toBeInTheDocument();
    expect(container.querySelectorAll('[role="img"][aria-label]').length).toBeLessThanOrEqual(1);
    expect(screen.getByRole("link", { name: /سجّل حضورك/ })).toHaveAttribute("href", "/ar/app/sessions/x/check-in");
  });

  it("the poster is a link to the event page, named in words — an accessible name holds no markup", async () => {
    await show(post());
    const poster = screen.getByRole("link", { name: "ملصق جلسة لوحة تحكم لا يهجرها أحد" });
    expect(poster).toHaveAttribute("href", expect.stringContaining("/app/sessions/11111111"));
    expect(poster.getAttribute("aria-label")).not.toMatch(/feed\.|<bdi>/);
  });

  it("★ a multi-day session says its whole span and how many days — sessions' formatter (REQ-SES-015/016)", async () => {
    const days = [
      { id: "d1", position: 1, startsAt: "2026-10-01T15:00:00Z", endsAt: "2026-10-01T17:00:00Z", checkInOpen: false },
      { id: "d2", position: 2, startsAt: "2026-10-02T15:00:00Z", endsAt: "2026-10-02T17:00:00Z", checkInOpen: false },
      { id: "d3", position: 3, startsAt: "2026-10-03T15:00:00Z", endsAt: "2026-10-03T17:00:00Z", checkInOpen: false },
    ];
    const { container } = await show(post({ days, startsAt: days[0].startsAt, endsAt: days[2].endsAt, day: "2026-10-01" }));
    const from = new Intl.DateTimeFormat("ar-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh" }).format(new Date(days[0].startsAt));
    const to = new Intl.DateTimeFormat("ar-u-nu-latn", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh" }).format(new Date(days[2].endsAt));
    expect(container).toHaveTextContent(`${from} — ${to}`);
    expect(container).toHaveTextContent("3 أيام");
  });

  it("★ co-presenters are said in words after the lead's name — one avatar, never a second", async () => {
    const extra = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ memberId: `x${i}`, displayName: `مقدّم ${i}`, avatarUrl: null, company: null }));
    const lead = post().presenters[0]!;
    const { container, unmount } = await show(post({ presenters: [lead, ...extra(1)] }));
    expect(container).toHaveTextContent("نورة العتيبي وآخر");
    expect(container.querySelectorAll('[role="img"][aria-label="نورة العتيبي"]')).toHaveLength(1);
    expect(container).not.toHaveTextContent("مقدّم 0");
    unmount();
    const three = await show(post({ presenters: [lead, ...extra(2)] }));
    expect(three.container).toHaveTextContent("نورة العتيبي وآخران");
  });

  it("the title is the post's heading, and the presenter links to their profile", async () => {
    await show(post());
    expect(within(screen.getByRole("heading", { level: 3 })).getByRole("link")).toHaveTextContent("لوحة تحكم لا يهجرها أحد");
    expect(screen.getAllByRole("link").some((l) => l.getAttribute("href")?.includes("/app/members/m1"))).toBe(true);
  });
});
