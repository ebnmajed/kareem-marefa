// SCR-011 · browse, rebuilt in wave 18 — REQ-UIX-060, REQ-UIX-022, REQ-UIX-012, DEC-206 §4.63 – §4.65,
// DEC-207. The successor of `sessions-timeline.test.tsx` (its subject is deleted); the ledger names
// each case that moved.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { CAT, VENUE, Wrap, resolveServer, session, timeline, translations } from "./fixtures";
import type { TimelineData } from "@/lib/dal/search";

vi.mock("next-intl/server", () => ({ getTranslations: translations }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/ar/app/sessions",
}));
vi.mock("@/components/search/actions", () => ({ toggleBookmarkAction: vi.fn() }));
vi.mock("@/lib/dal/search", () => ({ getTimeline: vi.fn() }));
// The bell is notify's server component with its own DAL; this suite is about browse.
vi.mock("@/components/notifications/bell", () => ({ NotificationBell: () => <button type="button">الإشعارات</button> }));

const { getTimeline } = await import("@/lib/dal/search");
const { BrowseScreen } = await import("@/components/browse/browse-screen");

async function mount(data: TimelineData, searchParams?: Record<string, string>) {
  vi.mocked(getTimeline).mockResolvedValue(data);
  const element = await resolveServer(await BrowseScreen({ locale: "ar", searchParams }));
  return render(<Wrap>{element}</Wrap>);
}

describe("BrowseScreen", () => {
  it("the regions in the artboard's order: the title, the search, the chips, the tags, the groups", async () => {
    const { container } = await mount(timeline({ items: [session()], total: 1 }));
    const at = (el: Element | null) => (el ? [...container.querySelectorAll("*")].indexOf(el) : -1);
    const order = [
      at(screen.getByRole("heading", { level: 1, name: "الجلسات" })),
      at(screen.getByRole("searchbox", { name: "ابحث في الجلسات" })),
      at(screen.getByRole("navigation", { name: "تصفية الجلسات" })),
      at(screen.getByRole("list", { name: "الوسوم الأكثر استخدامًا" })),
      at(screen.getByRole("region", { name: /هذا الأسبوع/ })),
    ];
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The shell's phone search lands on this field (DEC-207 §2).
    expect(screen.getByRole("searchbox", { name: "ابحث في الجلسات" })).toHaveAttribute("id", "browse-search");
  });

  it("★ asks getTimeline for no pinned item (§4.64), and a committed session stands once, in its group, saying so", async () => {
    const mine = session({ id: "00000000-0000-4000-8000-00000000000a", title: "جلستي القادمة", mine: "confirmed" });
    const other = session({ id: "00000000-0000-4000-8000-00000000000b", title: "جلسة أخرى" });
    const { container } = await mount(timeline({ items: [mine, other], total: 2 }));
    expect(vi.mocked(getTimeline).mock.calls.at(-1)?.[3]).toEqual({ pin: false });
    expect(screen.getAllByText("جلستي القادمة")).toHaveLength(1);
    expect(screen.queryByText("التالية لك")).toBeNull();
    const row = container.querySelector("article")!;
    expect(row).toHaveTextContent("مقعدك محجوز");

    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false }, "nested-interactive": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  it("★ a live session stands in «هذا الأسبوع» under its badge — there is no live group", async () => {
    await mount(timeline({ items: [session({ phase: "live", startsAt: new Date(Date.now() - 600_000).toISOString() })], total: 1 }));
    const week = screen.getByRole("region", { name: /هذا الأسبوع/ });
    expect(within(week).getByText("جارية الآن")).toBeInTheDocument();
    expect(screen.queryAllByRole("region").map((r) => r.getAttribute("aria-labelledby"))).not.toContain("browse-live");
  });

  it("the ended sessions stand behind ONE link, with their count", async () => {
    await mount(timeline({ items: [session()], total: 1, endedCount: 14 }));
    const past = screen.getByRole("region", { name: "سابقة" });
    expect(within(past).getByRole("link", { name: "عرض 14 جلسة مكتملة" })).toHaveAttribute("href", "/ar/app/sessions?status=ended");
    expect(within(past).queryByRole("article")).toBeNull();
  });

  it("★ search results replace the groups with one group, «نتائج»", async () => {
    await mount(timeline({ items: [session(), session({ id: "00000000-0000-4000-8000-00000000000c", title: "ثانية" })], total: 2 }), { q: "تقارير" });
    expect(screen.getByRole("region", { name: /نتائج/ })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /هذا الأسبوع/ })).toBeNull();
    expect(screen.getByRole("searchbox", { name: "ابحث في الجلسات" })).toHaveValue("تقارير");
  });

  it("★ the empty case is this same screen with an invitation to propose — the filters are still there", async () => {
    await mount(timeline());
    expect(screen.getByRole("heading", { level: 1, name: "الجلسات" })).toBeInTheDocument();
    expect(screen.getByText("لا جلسات قادمة بعد")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "اقترح موضوعًا" })).toHaveAttribute("href", "/ar/app/propose");
    expect(screen.getByRole("navigation", { name: "تصفية الجلسات" })).toBeInTheDocument();
  });

  it("★ filtered-empty names the filter that emptied it and offers to drop just that one (REQ-UIX-022)", async () => {
    await mount(timeline({ dropOne: { key: "venue", count: 3 } }), { category: CAT, venue: VENUE });
    expect(screen.getByText("لا جلسات تطابق «⁨القاعة الكبرى⁩» مع بقية عوامل التصفية")).toBeInTheDocument();
    expect(screen.getByText("إزالته وحده تُظهر 3 جلسات")).toBeInTheDocument();
    const drop = screen.getByRole("link", { name: "أزل «⁨القاعة الكبرى⁩»" });
    expect(drop).toHaveAttribute("href", `/ar/app/sessions?category=${CAT}`);
    expect(screen.getAllByRole("link", { name: /امسح/ }).some((l) => l.getAttribute("href") === "/ar/app/sessions")).toBe(true);
  });

  it("★ no sort control, and no company banner — the banner is the home's now (DEC-207 §6.1)", async () => {
    await mount(timeline({ items: [session()], total: 1 }));
    expect(screen.queryByRole("button", { name: /ترتيب|الأعلى تقييمًا/ })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
