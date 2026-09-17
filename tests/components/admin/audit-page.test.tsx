// SCR-062 · /app/admin/audit on the M9 system (wave 8, K1) — REQ-ADM-018.
// The async page awaited directly with a mocked DAL and the real Arabic
// catalogue (the `admin-dashboard-page.test.tsx` pattern): the log as a stacked
// card list with each action in Arabic, one subject followable from a row, the
// active filters as removable chips, the pager's cursor, the moderator's view,
// and the empty states.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { AuditFilterOptions, AuditLogPage } from "@/lib/dal/admin-audit";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";

const messages = { ...adminAr, ...uiAr };
const push = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ requireSession: vi.fn(), sessionClient: vi.fn() }));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: async () => ({ timeZone: "Asia/Riyadh", maxCoPresenters: 4 }) }));
vi.mock("@/lib/dal/admin-audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal/admin-audit")>()),
  listAuditLog: vi.fn(),
  listAuditFilterOptions: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "admin.audit" }),
  setRequestLocale: () => {},
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/ar/app/admin/audit",
}));

const { requireSession } = await import("@/lib/dal/session");
const { listAuditLog, listAuditFilterOptions } = await import("@/lib/dal/admin-audit");
const { default: AuditLogPage } = await import("@/app/[locale]/app/admin/audit/page");

const MEMBER = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";

const page: AuditLogPage = {
  rows: [
    { id: "a1", actorId: ADMIN, actorName: "مشرفة السجل", actorRole: "admin", action: "member.role_changed", subjectType: "member", subjectId: MEMBER, reason: "ترقية عضو", occurredAt: "2026-09-17T09:00:00Z" },
    { id: "a2", actorId: null, actorName: null, actorRole: "system", action: "points.balance_divergence", subjectType: null, subjectId: null, reason: null, occurredAt: "2026-09-16T09:00:00Z" },
  ],
  nextBefore: "2026-09-16T09:00:00+00:00~a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2",
};
const options: AuditFilterOptions = {
  actors: [{ id: ADMIN, displayName: "مشرفة السجل" }],
  actions: ["member.role_changed", "points.balance_divergence"],
  subjectTypes: ["member"],
};

async function renderPage(query: Record<string, string>, role: "admin" | "moderator" = "admin", data: AuditLogPage = page) {
  vi.mocked(requireSession).mockResolvedValue({ role, memberId: ADMIN, orgId: "o" } as never);
  vi.mocked(listAuditLog).mockResolvedValue(data);
  vi.mocked(listAuditFilterOptions).mockResolvedValue(role === "admin" ? options : { ...options, actors: null });
  const element = await AuditLogPage({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve(query) });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <main>{element}</main>
    </NextIntlClientProvider>,
  );
}

const cardList = (container: HTMLElement) => container.querySelector("ul.space-y-3") as HTMLElement;

describe("AuditLogPage", () => {
  it("reads each action in Arabic alone, and «النظام» for a row no member wrote", async () => {
    const { container } = await renderPage({});
    const [first, second] = within(cardList(container)).getAllByRole("listitem");
    expect(first).toHaveTextContent("تغيير دور عضو");
    // The raw key is not shown (sync 2): the label maps back to it one to one.
    expect(first).not.toHaveTextContent("member.role_changed");
    expect(first).toHaveTextContent("مشرفة السجل");
    expect(first).toHaveTextContent("مشرف المؤسسة");
    expect(second).toHaveTextContent("اختلاف في رصيد النقاط");
    expect(second).toHaveTextContent("النظام");
  });

  it("a row naming a subject links to everything that happened to it", async () => {
    const { container } = await renderPage({});
    const first = within(cardList(container)).getAllByRole("listitem")[0];
    expect(within(first).getByRole("link", { name: "كل ما جرى على هذا العنصر" })).toHaveAttribute("href", `/ar/app/admin/audit?subject=member&subjectId=${MEMBER}`);
  });

  it("the DAL reads the query's filters, and the org's zone", async () => {
    await renderPage({ action: "member.role_changed", period: "7d", actor: "junk" });
    expect(listAuditLog).toHaveBeenLastCalledWith("ar", { action: "member.role_changed", period: "7d" }, "Asia/Riyadh");
  });

  it("each active filter is a chip whose removal keeps the others, and the pager carries the cursor", async () => {
    await renderPage({ action: "member.role_changed", period: "7d" });
    const chips = screen.getByRole("group", { name: "الفلاتر المطبّقة" });
    expect(within(chips).getByRole("link", { name: "أزل الفلتر: الإجراء: تغيير دور عضو" })).toHaveAttribute("href", "/ar/app/admin/audit?period=7d");
    expect(within(chips).getByRole("link", { name: "أزل الفلتر: المدة: آخر سبعة أيام" })).toHaveAttribute("href", "/ar/app/admin/audit?action=member.role_changed");
    const pager = screen.getByRole("navigation", { name: "صفحات السجل" });
    expect(within(pager).getByRole("link", { name: /إجراءات أقدم/ }).getAttribute("href")).toContain("before=2026-09-16T09%3A00%3A00%2B00%3A00");
  });

  it("a moderator's page says it is their own actions, and offers no actor filter", async () => {
    await renderPage({}, "moderator");
    expect(screen.getByText("إجراءاتك أنت وحدها. لا يمكنك رؤية إجراءات غيرك من المشرفين.")).toBeInTheDocument();
    expect(screen.queryByLabelText("الفاعل")).toBeNull();
    expect(screen.queryByText("تعديلات إعدادات النقاط تُحفظ في سجل التعديلات على شاشة النقاط، لا هنا.", { exact: false })).toBeNull();
  });

  it("a filtered log with nothing in it names the way back, and an unfiltered moderator's leads to the queues", async () => {
    await renderPage({ action: "member.role_changed" }, "admin", { rows: [], nextBefore: null });
    expect(screen.getByText("لا إجراءات تطابق هذه الفلاتر")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "امسح الفلاتر" }).length).toBeGreaterThan(0);
  });

  it("«مدة مخصّصة» opens two date-only pickers, and applying pushes the filters without the cursor", async () => {
    const { container } = await renderPage({ before: page.nextBefore! });
    const panel = container.querySelector("aside") as HTMLElement;
    fireEvent.change(within(panel).getByLabelText("المدة"), { target: { value: "custom" } });
    expect(within(panel).getByRole("button", { name: /^من تاريخ:/ })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /^إلى تاريخ:/ })).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("الإجراء"), { target: { value: "member.role_changed" } });
    fireEvent.submit(panel.querySelector("form")!);
    expect(push).toHaveBeenLastCalledWith("/ar/app/admin/audit?action=member.role_changed&period=custom");
  });

  it("has no axe violations", async () => {
    const { container } = await renderPage({ action: "member.role_changed" });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }, 20000);
});
