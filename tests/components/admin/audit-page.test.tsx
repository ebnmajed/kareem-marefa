// SCR-062 · /app/admin/audit — REQ-ADM-018, REQ-UIX-099. ★ Wave 22 (`DEC-208`): written again from `AdminAudit.dc.html`
// — both stores marked by kind, the filters as chips, the count, «CSV». The async page awaited with a mocked DAL and
// the real Arabic catalogue. What stands from wave 8: each action in Arabic, «النظام» for a row no member wrote, one
// subject followable, the pager's cursor, the moderator's own-actions view with no actor filter, the date-only custom
// range, the empty states, axe. What moved: the filter panel became chips (a selector), the scoring note went — the
// history is on this screen now (an expectation).
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { AuditFeedPage, AuditFilterOptions } from "@/lib/dal/admin-audit";
import { ToastProvider } from "@/components/ui/toast";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";

const messages = { ...adminAr, ...uiAr };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ requireSession: vi.fn(), sessionClient: vi.fn() }));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: async () => ({ timeZone: "Asia/Riyadh", maxCoPresenters: 4 }) }));
vi.mock("@/lib/dal/admin-audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal/admin-audit")>()),
  listAuditFeed: vi.fn(),
  listAuditFilterOptions: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "admin.audit" }),
  setRequestLocale: () => {},
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/ar/app/admin/audit",
}));

const { requireSession } = await import("@/lib/dal/session");
const { listAuditFeed, listAuditFilterOptions } = await import("@/lib/dal/admin-audit");
const { default: AuditLogPage } = await import("@/app/[locale]/app/admin/audit/page");

const MEMBER = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const RULE = "33333333-3333-4333-8333-333333333333";

const feed: AuditFeedPage = {
  rows: [
    { kind: "log", id: "a1", actorId: ADMIN, actorName: "مشرفة السجل", actorFace: null, actorRole: "admin", action: "member.role_changed", subjectType: "member", subjectId: MEMBER, subjectName: "خالد الغامدي", reason: "ترقية عضو", occurredAt: "2026-09-17T09:00:00Z" },
    { kind: "config", id: "c1", actorId: ADMIN, actorName: "مشرفة السجل", actorFace: null, scope: "scoring", entityId: RULE, entityName: "check_in", field: "points", oldValue: 10, newValue: 15, occurredAt: "2026-09-16T12:00:00Z" },
    { kind: "log", id: "a2", actorId: null, actorName: null, actorFace: null, actorRole: "system", action: "points.balance_divergence", subjectType: null, subjectId: null, subjectName: null, reason: null, occurredAt: "2026-09-16T09:00:00Z" },
  ],
  nextBefore: "2026-09-16T09:00:00+00:00~a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2",
  total: 1284,
};
const options: AuditFilterOptions = {
  actors: [{ id: ADMIN, displayName: "مشرفة السجل" }],
  actions: ["member.role_changed", "points.balance_divergence"],
  subjectTypes: ["member"],
  configScopes: ["scoring"],
};

async function renderPage(query: Record<string, string>, role: "admin" | "moderator" = "admin", data: AuditFeedPage = feed) {
  vi.mocked(requireSession).mockResolvedValue({ role, memberId: ADMIN, orgId: "o" } as never);
  vi.mocked(listAuditFeed).mockResolvedValue(data);
  vi.mocked(listAuditFilterOptions).mockResolvedValue(role === "admin" ? options : { ...options, actors: null, configScopes: [] });
  const element = await AuditLogPage({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve(query) });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>{element}</main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const table = () => screen.getByRole("table");

describe("AuditLogPage", { timeout: 20_000 }, () => {
  it("draws الوقت · الفاعل · الفعل · الهدف, the count of both stores, and «CSV» for an admin", async () => {
    await renderPage({});
    expect(within(table()).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["الوقت", "الفاعل", "الفعل", "الهدف"]);
    expect(screen.getByText("1,284 سجلًا")).toBeVisible();
    expect(screen.getByRole("button", { name: "نزِّل السجل الظاهر بصيغة CSV" })).toBeVisible();
  });

  it("reads each action in Arabic alone, its reason after it, the target by name, and «النظام» for a row no member wrote", async () => {
    await renderPage({});
    const [first, , third] = within(table()).getAllByRole("row").slice(1);
    expect(within(first).getByText("تغيير دور عضو")).toBeVisible();
    expect(within(first).getByText("ترقية عضو")).toBeVisible();
    expect(first.textContent).not.toContain("member.role_changed");
    expect(within(first).getByText("عضو · خالد الغامدي")).toBeVisible();
    expect(within(third).getByText("النظام")).toBeVisible();
  });

  it("★ a configuration change is beside the log's rows, marked «إعداد», with its old and new value (DEC-231 §4.3)", async () => {
    await renderPage({});
    const config = within(table()).getAllByRole("row")[2];
    expect(within(config).getByText("إعداد")).toBeVisible();
    expect(within(config).getByText("قواعد النقاط · النقاط")).toBeVisible();
    expect(config.textContent).toContain("10 ← 15");
  });

  it("★ the target is itself the link to everything that happened to it — one line, no second «follow» line", async () => {
    await renderPage({});
    expect(within(table()).getByRole("link", { name: "عضو · خالد الغامدي" })).toHaveAttribute("href", `/ar/app/admin/audit?subject=member&subjectId=${MEMBER}`);
    expect(screen.queryByText("كل ما جرى على هذا العنصر")).toBeNull();
  });

  it("★ the time is the day said relative to today, the full instant in the <time>'s title; the actor is a face, not a role badge", async () => {
    vi.mocked(listAuditFeed).mockClear();
    const now = new Date();
    const at = new Date(now.getTime() - 60_000).toISOString();
    await renderPage({}, "admin", { ...feed, rows: [{ ...feed.rows[0], occurredAt: at, actorFace: { avatarUrl: null, teamColor: "#35d0ff" } }] });
    const time = table().querySelector("time")!;
    expect(time.getAttribute("dateTime")).toBe(at);
    expect(time.textContent?.startsWith("اليوم ")).toBe(true);
    expect(time.getAttribute("title")).toBeTruthy();
    expect(within(table()).queryByText("مشرف المؤسسة")).toBeNull();
  });

  it("the DAL reads the query's filters and the org's zone; the chips carry their values; the CSV carries the filters", async () => {
    await renderPage({ action: "member.role_changed", period: "7d", actor: ADMIN });
    expect(listAuditFeed).toHaveBeenLastCalledWith("ar", { action: "member.role_changed", period: "7d", actor: ADMIN }, "Asia/Riyadh");
    const chips = screen.getByRole("navigation", { name: "تصفية السجل" });
    expect(within(chips).getByRole("button", { name: "الفعل: تغيير دور عضو" })).toBeVisible();
    expect(within(chips).getByRole("button", { name: "الفاعل: مشرفة السجل" })).toBeVisible();
    expect(within(chips).getByRole("button", { name: "المدة: آخر سبعة أيام" })).toBeVisible();
  });

  it("the pager carries the cursor, and «عُد إلى الأحدث» drops it", async () => {
    await renderPage({ before: "2026-09-17T09:00:00+00:00~a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1" });
    const pager = screen.getByRole("navigation", { name: "صفحات السجل" });
    expect(within(pager).getByRole("link", { name: /إجراءات أقدم/ }).getAttribute("href")).toContain("before=");
    expect(within(pager).getByRole("link", { name: "عُد إلى الأحدث" }).getAttribute("href")).toBe("/ar/app/admin/audit");
  });

  it("★ a moderator's page says it is their own actions, and offers no actor chip and no CSV", async () => {
    await renderPage({}, "moderator");
    expect(screen.getByText("إجراءاتك أنت وحدها. لا يمكنك رؤية إجراءات غيرك من المشرفين.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^الفاعل:/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "نزِّل السجل الظاهر بصيغة CSV" })).toBeNull();
  });

  it("«مدة مخصّصة» opens two date-only pickers in a GET form that keeps the other filters", async () => {
    await renderPage({ period: "custom", action: "member.role_changed" });
    const form = screen.getByRole("form", { name: "مدة مخصّصة" });
    expect(form.getAttribute("method")).toBe("get");
    expect((form.querySelector("input[name=action]") as HTMLInputElement).value).toBe("member.role_changed");
    expect(within(form).getByText("من تاريخ")).toBeVisible();
    expect(within(form).getByText("إلى تاريخ")).toBeVisible();
  });

  it("a filtered log with nothing in it names the way back, and an unfiltered moderator's leads to the queues", async () => {
    await renderPage({ action: "member.role_changed" }, "admin", { rows: [], nextBefore: null, total: 0 });
    expect(screen.getByRole("link", { name: "امسح الفلاتر" })).toHaveAttribute("href", "/ar/app/admin/audit");
  });

  it("has no axe violations", async () => {
    const { container } = await renderPage({});
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});
