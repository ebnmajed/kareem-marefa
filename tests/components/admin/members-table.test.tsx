// SCR-049 (`REQ-ADM-009`, `REQ-UIX-096`), written for wave 22 from `AdminMembers.dc.html`. `tests/e2e/admin-members.spec.ts`
// proves the same shapes against real Supabase; this file proves what the screen says and does with its actions mocked.
//
// ★ Wave 22 moved: the search into the URL (a GET form), the role change from a select into the row's ⋯ with a
// confirmation, reactivation from a button into the ⋯, and the last-admin refusal from an error after the attempt to a
// sentence in the menu before it. What stands: the email to the admin, the self row with no controls, the deactivation
// dialog naming the member with a reason, the reason's inline error, the RPC's errors as sentences, axe.
import type React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchesMemberQuery, membersHref, parseMemberQuery } from "@/components/admin/members/member-query";
import { ToastProvider } from "@/components/ui/toast";
import type { ConsoleMemberRow, ConsoleMembers } from "@/lib/dal/admin-members";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";

const changeRole = vi.fn();
const deactivate = vi.fn();
const reactivate = vi.fn();
vi.mock("@/app/[locale]/app/admin/members/actions", () => ({ changeRole, deactivate, reactivate }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ar/app/admin/members",
}));

const { MembersTable } = await import("@/app/[locale]/app/admin/members/members-table");

const messages = { ...adminAr, ...uiAr };

const row = (over: Partial<ConsoleMemberRow>): ConsoleMemberRow => ({
  id: "m1",
  email: "sara@example.com",
  displayName: "سارة العتيبي",
  companyId: "c1",
  companyName: "مواهب",
  teamColor: "#35d0ff",
  jobTitle: null,
  role: "member",
  status: "active",
  deactivatedAt: null,
  deactivatedReason: null,
  createdAt: "2026-01-01T00:00:00Z",
  avatarUrl: null,
  points: 1240,
  levelName: "كريم معرفة",
  ...over,
});

const ROWS: ConsoleMemberRow[] = [
  row({}),
  row({ id: "m2", email: "khalid@example.com", displayName: "خالد الحربي", role: "moderator", companyId: null, companyName: null, teamColor: undefined, points: 310, levelName: null }),
  row({ id: "m3", email: "noura@example.com", displayName: "نورة العتيبي", role: "admin" }),
  row({ id: "m4", email: "old@example.com", displayName: "عضو سابق", status: "deactivated", deactivatedAt: "2026-09-01T10:00:00Z", deactivatedReason: "مغادرة الشركة" }),
  row({ id: "self", email: "me@example.com", displayName: "أنا المشرفة", role: "admin" }),
];

const data = (over: Partial<ConsoleMembers> = {}): ConsoleMembers => ({
  rows: ROWS,
  total: 212,
  page: 1,
  pageCount: 9,
  from: 1,
  to: 25,
  companies: [{ id: "c1", name: "مواهب" }],
  activeAdmins: 2,
  ...over,
});

function renderTable(d: ConsoleMembers = data(), q = parseMemberQuery({})) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>
          <MembersTable data={d} query={q} selfId="self" timeZone="Asia/Riyadh" locale="ar" />
        </main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const table = () => screen.getByRole("table");
const rowOf = (name: string) => within(table()).getByRole("row", { name: new RegExp(name) });
const openMenu = async (name: string) => userEvent.click(within(rowOf(name)).getByRole("button", { name: `مزيد من الإجراءات على ${name}` }));

beforeEach(() => {
  changeRole.mockReset();
  deactivate.mockReset();
  reactivate.mockReset();
});

describe("SCR-049 — the table", { timeout: 20_000 }, () => {
  it("draws العضو · الشركة · الدور · المستوى · النقاط and the ⋯, the count, the chips with their value, and the pager", () => {
    renderTable();
    expect(within(table()).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["العضو", "الشركة", "الدور", "المستوى", "النقاط", "إجراءات"]);
    expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "212 عضوًا")).toBeVisible();
    const filters = screen.getByRole("navigation", { name: "تصفية الأعضاء" });
    expect(within(filters).getByRole("button", { name: "الشركة: الكل" })).toBeVisible();
    expect(within(filters).getByRole("button", { name: "الدور: الكل" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "صفحات الأعضاء" }).textContent).toContain("1 – 25 من 212");
  });

  it("★ REQ-ADM-009: the admin sees every member's email on its own line", () => {
    renderTable();
    expect(within(rowOf("سارة العتيبي")).getByText("sara@example.com")).toBeVisible();
  });

  it("the role column: staff and a deactivated member wear a badge with REQ-ADM-009's words; a member is plain text", () => {
    renderTable();
    expect(within(rowOf("نورة العتيبي")).getByText("مشرف المؤسسة")).toBeVisible();
    expect(within(rowOf("خالد الحربي")).getByText("مُنظِّم")).toBeVisible();
    expect(within(rowOf("سارة العتيبي")).getByText("عضو")).toBeVisible();
    expect(within(rowOf("عضو سابق")).getByText("معطَّل")).toBeVisible();
    expect(within(rowOf("عضو سابق")).getByText("مغادرة الشركة")).toBeVisible();
  });

  it("level and points are read; a member with no level shows «—»", () => {
    renderTable();
    const cells = within(rowOf("سارة العتيبي")).getAllByRole("cell").map((c) => c.textContent);
    expect(cells.slice(3, 5)).toEqual(["كريم معرفة", "1,240"]);
    expect(within(rowOf("خالد الحربي")).getAllByRole("cell")[3].textContent).toBe("—");
  });

  it("the viewer's own row offers no ⋯ — self-demotion has no path", () => {
    renderTable();
    expect(within(rowOf("أنا المشرفة")).queryByRole("button", { name: /مزيد من الإجراءات/ })).toBeNull();
  });

  it("the search is a GET form carrying the chips' values; the chips and pager are links", async () => {
    renderTable(data(), parseMemberQuery({ role: "moderator", company: "11111111-1111-4111-8111-111111111111" }));
    const search = screen.getByRole("search");
    expect(search.getAttribute("method")).toBe("get");
    expect((search.querySelector("input[name=role]") as HTMLInputElement).value).toBe("moderator");
    expect((search.querySelector("input[name=company]") as HTMLInputElement).value).toBe("11111111-1111-4111-8111-111111111111");
    expect(screen.getByRole("link", { name: "التالية" }).getAttribute("href")).toContain("page=2");
  });

  it("has no axe violations", async () => {
    const { container } = renderTable();
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

describe("SCR-049 — the row's ⋯", { timeout: 20_000 }, () => {
  it("★ a role change confirms naming the member and the role, then calls the RPC's action", async () => {
    changeRole.mockResolvedValue({ error: null, done: true });
    renderTable();
    await openMenu("سارة العتيبي");
    expect(screen.getByRole("menuitem", { name: "عرض الملف الكامل" }).closest("a")?.getAttribute("href")).toContain("/app/members/m1");
    await userEvent.click(screen.getByRole("menuitem", { name: "غيّر الدور إلى مُنظِّم" }));
    const dialog = screen.getByRole("dialog", { name: "تغيير دور «سارة العتيبي» إلى مُنظِّم؟" });
    await userEvent.click(within(dialog).getByRole("button", { name: "غيّر الدور" }));
    await waitFor(() => expect(changeRole).toHaveBeenCalledWith("ar", "m1", "moderator"));
    expect(await screen.findByText("غُيِّر الدور.", { exact: true })).toBeInTheDocument();
  });

  it("★ the RPC's refusal reads as a sentence", async () => {
    changeRole.mockResolvedValue({ error: "stale_claims", done: false });
    renderTable();
    await openMenu("خالد الحربي");
    await userEvent.click(screen.getByRole("menuitem", { name: "غيّر الدور إلى عضو" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "غيّر الدور" }));
    expect(await screen.findByText("بيانات جلستك تغيّرت — أعد تحميل الصفحة وحاول مرة أخرى.", { exact: true })).toBeInTheDocument();
  });

  it("★ REQ-UIX-096: the last active admin's menu says why — no role change, no deactivation — before any click", async () => {
    renderTable(data({ activeAdmins: 1, rows: ROWS.filter((r) => r.id !== "self") }));
    await openMenu("نورة العتيبي");
    const why = screen.getByRole("menuitem", { name: "آخر مشرف نشط للمؤسسة — لا تغيير للدور ولا تعطيل" });
    expect(why).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("menuitem", { name: /غيّر الدور/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "عطّل العضوية" })).toBeNull();
  });

  it("★ deactivating confirms in a dialog naming the member, with the reason inside it; an empty reason is the app's own inline error", async () => {
    deactivate.mockResolvedValueOnce({ error: "reason_required", done: false }).mockResolvedValueOnce({ error: null, done: true });
    renderTable();
    await openMenu("سارة العتيبي");
    await userEvent.click(screen.getByRole("menuitem", { name: "عطّل العضوية" }));
    const dialog = screen.getByRole("dialog", { name: "تعطيل عضوية «سارة العتيبي»؟" });
    fireEvent.submit(dialog.querySelector("form")!);
    expect(await within(dialog).findByText("اكتب سبب التعطيل أولًا.")).toBeVisible();
    await userEvent.type(within(dialog).getByRole("textbox"), "مغادرة الشركة");
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deactivate).toHaveBeenLastCalledWith("ar", "m1", expect.anything(), expect.any(FormData));
  });

  it("★ reactivation toasts what the server said — a refusal is never «أُعيد تفعيل العضوية» (DEC-232 §3.1)", async () => {
    reactivate.mockResolvedValue({ error: "not_an_admin", done: false });
    renderTable();
    await openMenu("عضو سابق");
    await userEvent.click(screen.getByRole("menuitem", { name: "أعد تفعيل العضوية" }));
    expect(await screen.findByText("لم يعد لديك صلاحية المشرف — أعد تحميل الصفحة.", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("أُعيد تفعيل العضوية.", { exact: true })).toBeNull();
  });

  it("the phone card carries the ⋯, and the own card a «—» rather than an empty slot (wave 8, F1)", () => {
    const { container } = renderTable();
    const cards = within(container.querySelector("ul") as HTMLElement).getAllByRole("listitem");
    expect(within(cards[0]).getByRole("button", { name: "مزيد من الإجراءات على سارة العتيبي" })).toBeVisible();
    expect(cards[4].textContent).toContain("—");
  });
});

describe("member-query — the one predicate the screen and its CSV share", () => {
  const m = { displayName: "سارة العتيبي", email: "sara@example.com", companyId: "11111111-1111-4111-8111-111111111111", role: "moderator" as const, status: "active" as const };

  it("searches name and email", () => {
    expect(matchesMemberQuery(m, { q: "سارة", company: null, role: null })).toBe(true);
    expect(matchesMemberQuery(m, { q: "SARA@", company: null, role: null })).toBe(true);
    expect(matchesMemberQuery(m, { q: "خالد", company: null, role: null })).toBe(false);
  });

  it("filters by company, by «بلا شركة», by role — and «معطَّل» is a status, not a role", () => {
    expect(matchesMemberQuery(m, { q: "", company: m.companyId, role: "moderator" })).toBe(true);
    expect(matchesMemberQuery(m, { q: "", company: "none", role: null })).toBe(false);
    expect(matchesMemberQuery({ ...m, companyId: null }, { q: "", company: "none", role: null })).toBe(true);
    expect(matchesMemberQuery(m, { q: "", company: null, role: "deactivated" })).toBe(false);
    expect(matchesMemberQuery({ ...m, status: "deactivated" }, { q: "", company: null, role: "moderator" })).toBe(false);
  });

  it("a stale or hand-edited query is dropped, never refused", () => {
    expect(parseMemberQuery({ role: "owner", company: "x", page: "-3" })).toEqual({ q: "", company: null, role: null, page: 1 });
    expect(membersHref(parseMemberQuery({ role: "admin" }), { page: 2 })).toBe("/app/admin/members?role=admin&page=2");
  });
});
