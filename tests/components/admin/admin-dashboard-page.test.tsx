// `/app/admin` — SCR-040, REQ-ADM-004/010, REQ-UIX-086. Mocked DAL + real
// messages: the async Server Component, awaited directly, with real
// ar/admin.json through next-intl's createTranslator.
//
// ★ Wave 21 (DEC-208, the page rebuilt from `AdminDashboard.dc.html`), each
// change a ledger line in STATUS:
//  · L1 — the attendance rate's «—» keeps its value slot, and the hint sentence
//    under it is gone (explainer copy, `REQ-UIX-080`) — an expectation changed.
//  · L2 — the top lists' headings are the artboard's («أكثر المُقدِّمين» …) —
//    a selector moved; the two-children rule (wave 6 row 10) is unchanged.
//  New: one move from a tile to its queue; the one line when nothing waits;
//  the month's figures each a link narrowed to the month; a moderator 404s.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/admin.json";
import browseAr from "@/messages/ar/browse.json";
import type { AdminAttention, DashboardData } from "@/lib/dal/admin-dashboard";

const messages = { ...ar, ...browseAr };

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/dal/admin-dashboard", () => ({
  getAdminDashboardData: vi.fn(),
  getAdminAttention: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "admin.dashboard" }),
  setRequestLocale: () => {},
}));

const { getAdminDashboardData, getAdminAttention } = await import("@/lib/dal/admin-dashboard");
const { default: AdminDashboardPage } = await import("@/app/[locale]/app/admin/page");

const emptyAttentionRow = { count: 0, oldestAgeDays: null };

function dashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    month: "2026-10",
    timeZone: "Asia/Riyadh",
    proposalPipeline: { draft: 3, submitted: 4, inReview: 2, changesRequested: 1, approved: 19, rejected: 7 },
    sessionsThisMonth: 12,
    rsvpsConfirmed: 318,
    checkInsTotal: 241,
    attendanceRate: null,
    activeMembers: 187,
    pointsIssued: 14320,
    topPresenters: [],
    topCategories: [],
    topCompanies: [],
    upcoming: [],
    attention: {
      proposalsAwaitingDecision: emptyAttentionRow,
      sessionsNotScheduled: emptyAttentionRow,
      openPhotoReports: emptyAttentionRow,
      openCommentReports: emptyAttentionRow,
    },
    ...overrides,
  };
}

const waiting: AdminAttention = {
  items: [
    { queue: "proposals", navKey: "proposals", count: 4, oldestAgeDays: 6, href: "/app/admin/proposals" },
    { queue: "unscheduledSessions", navKey: "sessions", count: 2, oldestAgeDays: 2, href: "/app/admin/sessions?month=none" },
    { queue: "photoReports", navKey: "moderationReports", count: 1, oldestAgeDays: 0, href: "/app/admin/moderation/reports" },
    { queue: "commentReports", navKey: "moderationComments", count: 2, oldestAgeDays: 3, href: "/app/admin/moderation/comments" },
  ],
  total: 9,
};
const nothing: AdminAttention = { items: waiting.items.map((i) => ({ ...i, count: 0, oldestAgeDays: null })), total: 0 };

async function renderPage(data: DashboardData | null, attention: AdminAttention | null = nothing) {
  vi.mocked(getAdminDashboardData).mockResolvedValue(data);
  vi.mocked(getAdminAttention).mockResolvedValue(attention);
  const element = await AdminDashboardPage({ params: Promise.resolve({ locale: "ar" }) });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe("SCR-040 — what waits is one move away", () => {
  it("each attention tile is ONE link to the queue it counts, narrowed to what it counted, with the oldest item's age", async () => {
    await renderPage(dashboardData(), waiting);
    const section = screen.getByRole("heading", { name: "يحتاج انتباهك" }).closest("section")!;
    const links = within(section).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      expect.stringContaining("/app/admin/proposals"),
      expect.stringContaining("/app/admin/sessions?month=none"),
      expect.stringContaining("/app/admin/moderation/reports"),
      expect.stringContaining("/app/admin/moderation/comments"),
    ]);
    const proposals = within(section).getByRole("link", { name: /مقترحات بانتظار قرار/ });
    expect(proposals).toHaveTextContent("4");
    expect(proposals).toHaveTextContent("منذ 6 أيام");
  });

  it("a queue with nothing in it keeps its tile and link, its zero drawn plain — coral is for what waits", async () => {
    const some: AdminAttention = { items: waiting.items.map((i) => (i.queue === "photoReports" ? { ...i, count: 0, oldestAgeDays: null } : i)), total: 8 };
    await renderPage(dashboardData(), some);
    const section = screen.getByRole("heading", { name: "يحتاج انتباهك" }).closest("section")!;
    expect(within(section).getAllByRole("link")).toHaveLength(4);
    const zero = within(section).getByRole("link", { name: /بلاغات على الصور/ });
    expect(zero.querySelector(".text-signal")).toBeNull();
    expect(within(section).getByRole("link", { name: /مقترحات بانتظار قرار/ }).querySelector(".text-signal")).not.toBeNull();
  });

  it("when nothing waits, the four tiles are one line", async () => {
    await renderPage(dashboardData(), nothing);
    const section = screen.getByRole("heading", { name: "يحتاج انتباهك" }).closest("section")!;
    expect(within(section).queryAllByRole("link")).toHaveLength(0);
    expect(within(section).getByText("لا شيء يحتاج انتباهك الآن")).toBeInTheDocument();
  });

  it("a moderator (or anyone not an admin) gets the page-level not-found", async () => {
    await expect(renderPage(null, waiting)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("SCR-040 — the month's figures, every one a link", () => {
  it("shows the month at the h1's row and six figures, the session figures narrowed to the month", async () => {
    await renderPage(dashboardData({ attendanceRate: 0.76 }));
    expect(screen.getByRole("heading", { level: 1, name: "لوحة المؤسسة" })).toBeInTheDocument();
    expect(screen.getByText("أكتوبر 2026")).toBeInTheDocument();
    const overview = screen.getByRole("heading", { name: "نظرة عامة" }).closest("section")!;
    const href = (name: RegExp) => within(overview).getByRole("link", { name }).getAttribute("href");
    expect(href(/جلسة هذا الشهر/)).toContain("/app/admin/sessions?month=2026-10");
    expect(href(/حجوزات مؤكَّدة/)).toContain("?month=2026-10");
    expect(href(/تسجيلات حضور/)).toContain("?month=2026-10");
    expect(href(/معدّل الحضور/)).toContain("?month=2026-10");
    expect(href(/عضو نشط/)).toContain("/app/admin/members");
    expect(href(/نقطة ممنوحة/)).toContain("/app/admin/scoring");
    expect(within(overview).getByRole("link", { name: /نقطة ممنوحة/ })).toHaveTextContent("14,320");
    expect(within(overview).getByRole("link", { name: /معدّل الحضور/ })).toHaveTextContent("76٪");
  });

  it("L1: with nothing to divide by, the rate's value is «—» and no sentence explains it", async () => {
    await renderPage(dashboardData({ attendanceRate: null }));
    const rate = screen.getByRole("link", { name: /معدّل الحضور/ });
    expect(rate).toHaveTextContent("—");
    expect(screen.queryByText("لا جلسات بدأت بعد لحساب المعدّل.")).not.toBeInTheDocument();
  });

  it("the pipeline's counts are its caption, each a link to the proposals; the bar is hidden from assistive technology", async () => {
    await renderPage(dashboardData());
    const section = screen.getByRole("heading", { name: "مسار المقترحات" }).closest("section")!;
    const counts = within(section).getAllByRole("link");
    expect(counts.map((l) => l.textContent)).toEqual(["3 مسودة", "4 بانتظار المراجعة", "2 قيد المراجعة", "1 بانتظار تعديل", "19 معتمدة", "7 مرفوضة"]);
    expect(section.querySelector("[aria-hidden] > span[style]")).not.toBeNull();
  });

  it("is axe-clean", async () => {
    const { container } = await renderPage(dashboardData({ attendanceRate: null }), waiting);
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});

// Wave 6 row 10, kept: the three «أكثر …» lists set each count at the row's
// edge — the count is the row's own second child, never inside the name's link.
describe("SCR-040 — the «أكثر …» lists set the count at the edge", () => {
  it("each row holds the name and the count as two separate children, the count never inside the name's link (L2: the artboard's headings)", async () => {
    await renderPage(
      dashboardData({
        topPresenters: [{ id: "p1", label: "ريم القحطاني", count: 7 }],
        topCategories: [{ id: "c1", label: "تقارير", count: 12 }],
        topCompanies: [{ id: "co1", label: "شركة المعرفة", count: 3 }],
      }),
    );
    for (const [title, name, count] of [
      ["أكثر المُقدِّمين", "ريم القحطاني", "7"],
      ["أكثر التصنيفات", "تقارير", "12"],
      ["أكثر الشركات", "شركة المعرفة", "3"],
    ] as const) {
      const section = screen.getByRole("heading", { name: title }).closest("section")!;
      const row = section.querySelector("li")!;
      expect(row).toHaveClass("justify-between");
      expect(row.children).toHaveLength(2);
      expect(row.children[0].textContent).toBe(name);
      expect(row.children[1].textContent).toBe(count);
    }
    expect(screen.getByRole("link", { name: "ريم القحطاني" })).toHaveAttribute("href", expect.stringContaining("/app/members/p1"));
    expect(screen.getByRole("link", { name: "تقارير" })).toHaveAttribute("href", expect.stringContaining("/app/admin/sessions?category=c1"));
  });
});
