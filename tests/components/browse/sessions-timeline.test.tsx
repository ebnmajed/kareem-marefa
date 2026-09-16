// The sessions timeline — `/app` and `/app/sessions` — REQ-UIX-021,
// REQ-UIX-022, REQ-UIX-012, DEC-112, DEC-130.
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@/lib/dal/members", () => ({ getMe: vi.fn(async () => ({ id: "me", companyId: "c-1" })) }));

const { getTimeline } = await import("@/lib/dal/search");
const { getMe } = await import("@/lib/dal/members");
const { SessionsTimeline } = await import("@/components/browse/sessions-timeline");

async function mount(data: TimelineData, searchParams?: Record<string, string>) {
  vi.mocked(getTimeline).mockResolvedValue(data);
  const element = await resolveServer(await SessionsTimeline({ locale: "ar", searchParams }));
  return render(<Wrap>{element}</Wrap>);
}

beforeEach(() => {
  vi.mocked(getMe).mockResolvedValue({ id: "me", companyId: "c-1" } as never);
});

describe("SessionsTimeline", () => {
  it("★ the next committed session is the FIRST item, and it is not repeated in its group (REQ-UIX-021)", async () => {
    const pinned = session({ id: "00000000-0000-4000-8000-00000000000a", title: "جلستي القادمة", mine: "confirmed" });
    const other = session({ id: "00000000-0000-4000-8000-00000000000b", title: "جلسة أخرى" });
    const { container } = await mount(timeline({ pinned, items: [other], total: 2 }));

    expect(screen.getByRole("heading", { level: 1, name: "الجلسات" })).toBeInTheDocument();
    const articles = container.querySelectorAll("article");
    expect(articles[0]).toHaveTextContent("جلستي القادمة");
    expect(articles[0]).toHaveTextContent("التالية لك");
    expect(screen.getAllByText("جلستي القادمة")).toHaveLength(1);
    // One column, grouped by date, each group a labelled region with a count.
    expect(screen.getAllByRole("region").length).toBeGreaterThanOrEqual(2);

    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false }, "nested-interactive": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
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
    // The name is bidi-isolated (FSI … PDI) inside the sentence.
    expect(screen.getByText("لا جلسات تطابق «\u2068القاعة الكبرى\u2069» مع بقية عوامل التصفية")).toBeInTheDocument();
    expect(screen.getByText("إزالته وحده تُظهر 3 جلسات")).toBeInTheDocument();
    const drop = screen.getByRole("link", { name: "أزل «\u2068القاعة الكبرى\u2069»" });
    expect(drop).toHaveAttribute("href", `/ar/app/sessions?category=${CAT}`);
    // …offered beside clearing everything, not instead of it.
    expect(screen.getAllByRole("link", { name: /امسح/ }).some((l) => l.getAttribute("href") === "/ar/app/sessions")).toBe(true);
  });

  it("asks for a company before a member tries to reserve (REQ-PRF-001), as a status", async () => {
    vi.mocked(getMe).mockResolvedValue({ id: "me", companyId: null } as never);
    await mount(timeline({ items: [session()], total: 1 }));
    expect(within(screen.getByRole("status")).getByText(/اختر شركتك/)).toBeInTheDocument();
  });
});
