// SCR-019 · /app/members — the directory, new in wave 19 (REQ-UIX-068, REQ-PRF-005, DEC-213 §5.106 – §5.113).
// The page draws what `listDirectory()` hands it; the DAL's guarantees are `tests/unit/members-directory.test.ts`.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { C1, Wrap, id, resolveServer, translations } from "./fixtures";
import type { DirectoryMember, DirectoryPage } from "@/lib/dal/members";

vi.mock("next-intl/server", () => ({ getTranslations: translations, setRequestLocale: () => {} }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/ar/app/members",
}));
vi.mock("@/lib/dal/members", () => ({ listDirectory: vi.fn() }));

const { listDirectory } = await import("@/lib/dal/members");
const { default: MembersPage } = await import("@/app/[locale]/app/members/page");

function member(over: Partial<DirectoryMember> = {}): DirectoryMember {
  return {
    id: id(1),
    displayName: "سارة القحطاني",
    avatarUrl: null,
    jobTitle: "مديرة المواهب",
    role: "member",
    company: { id: C1, name: "مواهب", teamColor: "#35d0ff" },
    level: { tier: 4, name: "كريم معرفة" },
    presentedCount: 6,
    ...over,
  };
}

function page(over: Partial<DirectoryPage> = {}): DirectoryPage {
  return {
    members: [member()],
    matched: 1,
    total: 212,
    companies: [{ id: C1, name: "مواهب", teamColor: "#35d0ff" }],
    interests: [],
    canShowDeactivated: false,
    page: 1,
    ...over,
  };
}

async function mount(data: DirectoryPage, searchParams: Record<string, string> = {}) {
  vi.mocked(listDirectory).mockResolvedValue(data);
  const element = await resolveServer(await MembersPage({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve(searchParams) }));
  return render(<Wrap>{element}</Wrap>);
}

describe("SCR-019 — the directory", () => {
  it("the regions in the artboard's order: the title with its count, the order, the search, the chips, the rows", async () => {
    const { container } = await mount(page());
    const at = (el: Element | null) => (el ? [...container.querySelectorAll("*")].indexOf(el) : -1);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("الأعضاء212");
    const order = [
      at(h1),
      at(screen.getByRole("button", { name: /الترتيب: الأنشط أولًا/ })),
      at(screen.getByRole("searchbox", { name: "ابحث في الأعضاء" })),
      at(screen.getByRole("navigation", { name: "الشركات" })),
      at(screen.getByRole("region", { name: "قائمة الأعضاء" })),
    ];
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("a row: the name, the title, the company, the sessions delivered as a noun phrase, the level — a link to the profile", async () => {
    await mount(page());
    const link = screen.getByRole("link", { name: /سارة القحطاني/ });
    expect(link).toHaveAttribute("href", expect.stringContaining(`/app/members/${id(1)}`));
    expect(link).toHaveTextContent("مديرة المواهب · مواهب · 6 جلسات مقدَّمة");
    expect(within(link).getByText("كريم معرفة").closest("[data-level]")).toHaveAttribute("data-level", "4");
    // ★ DEC-213 §5.109: no gendered verb about a member.
    expect(link.textContent).not.toMatch(/قدّم/);
  });

  it("a staff member carries the role; no company says «بلا شركة»; nothing delivered has no clause", async () => {
    await mount(page({ members: [member({ id: id(2), displayName: "بدر", role: "admin", company: null, jobTitle: null, presentedCount: 0, level: null })] }));
    const link = screen.getByRole("link", { name: /بدر/ });
    expect(link).toHaveTextContent("مشرف المؤسسة");
    expect(link).toHaveTextContent("بلا شركة");
    expect(link.textContent).not.toMatch(/جلس/);
  });

  it("the company chips: «الكل» current, each company with its dot, links to the next state", async () => {
    await mount(page());
    const nav = screen.getByRole("navigation", { name: "الشركات" });
    const all = within(nav).getByRole("link", { name: "الكل" });
    expect(all).toHaveAttribute("aria-current");
    const company = within(nav).getByRole("link", { name: "مواهب" });
    expect(company).toHaveAttribute("href", expect.stringContaining(`company=${C1}`));
    expect(company.querySelector("[data-team-dot]")).not.toBeNull();
  });

  it("★ the interests row is drawn only when the org has any (DEC-213 §5.107)", async () => {
    await mount(page());
    expect(screen.queryByRole("navigation", { name: "الاهتمامات" })).toBeNull();
    await mount(page({ interests: [{ id: id(50), name: "فني" }] }));
    expect(screen.getByRole("navigation", { name: "الاهتمامات" })).toBeInTheDocument();
  });

  it("★ «N من M» and a «more» link carrying the next page and the filters (DEC-213 §5.110)", async () => {
    const many = Array.from({ length: 24 }, (_, i) => member({ id: id(100 + i), displayName: `عضو ${i}` }));
    await mount(page({ members: many, matched: 30 }), { company: C1 });
    expect(screen.getByText("24 من 30")).toBeInTheDocument();
    const more = screen.getByRole("link", { name: "المزيد" });
    expect(more.getAttribute("href")).toMatch(/company=.*page=2|page=2.*company=/);
  }, 30_000);

  it("all shown: no «more»", async () => {
    await mount(page());
    expect(screen.getByText("1 من 1")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "المزيد" })).toBeNull();
  });

  it("an empty search says so and clears the search, keeping the other filters", async () => {
    await mount(page({ members: [], matched: 0 }), { q: "زيد", company: C1 });
    expect(screen.getByText("لا أحد بهذا الاسم")).toBeInTheDocument();
    const clear = screen.getByRole("link", { name: "امسح البحث" });
    expect(clear.getAttribute("href")).toContain(`company=${C1}`);
    expect(clear.getAttribute("href")).not.toContain("q=");
  });

  it("★ an admin's deactivated member is marked in words and is not a link", async () => {
    await mount(page({ canShowDeactivated: true, members: [member({ id: id(5), displayName: "عضو سابق", deactivated: true })] }), { inactive: "1" });
    expect(screen.queryByRole("link", { name: /عضو سابق/ })).toBeNull();
    expect(screen.getByText("معطَّل")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "أخفِ المعطَّلين" })).toBeInTheDocument();
  });

  it("no admin control for anyone else", async () => {
    await mount(page());
    expect(screen.queryByRole("link", { name: "أظهر المعطَّلين" })).toBeNull();
  });

  it("★ the page decides nothing: it passes the query to the DAL as parsed, and drops what is invalid", async () => {
    await mount(page(), { company: "abc", order: "name", page: "3", q: "  سارة " });
    expect(vi.mocked(listDirectory).mock.calls.at(-1)?.[1]).toEqual({ q: "سارة", companyId: undefined, interestId: undefined, order: "name", page: 3, includeDeactivated: false });
  });

  it("has no accessibility violation", async () => {
    const { container } = await mount(page({ interests: [{ id: id(50), name: "فني" }] }));
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  }, 30_000);
});
