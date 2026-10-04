// SCR-049's wave-25 additions (`REQ-TEN-009`, `REQ-UIX-113`, `DEC-243`, `DEC-244`): «أضف عضوًا», the per-line report,
// and the row of somebody who has not signed in yet. A new file beside `members-table.test.tsx`, which is wave 22's
// evidence and is NOT edited — its 16 cases pass untouched, with one field added to its row factory.
//
// `tests/rls/add-a-member.test.ts` proves the authority (admin only, no admin by email, the bind, the denominator).
// This file proves what the SCREEN says and does, with the actions mocked.
import type React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseMemberQuery } from "@/components/admin/members/member-query";
import { ToastProvider } from "@/components/ui/toast";
import type { ConsoleMemberRow, ConsoleMembers } from "@/lib/dal/admin-members";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";

const addToOrg = vi.fn();
const resendInvitation = vi.fn();
const removeUnbound = vi.fn();
const changeRole = vi.fn();
const deactivate = vi.fn();
const reactivate = vi.fn();
vi.mock("@/app/[locale]/app/admin/members/actions", () => ({ addToOrg, resendInvitation, removeUnbound, changeRole, deactivate, reactivate }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ar/app/admin/members",
}));

const { AddMember } = await import("@/app/[locale]/app/admin/members/add-member");
const { MembersTable } = await import("@/app/[locale]/app/admin/members/members-table");

const messages = { ...adminAr, ...uiAr };
const COMPANIES = [{ id: "c1", name: "مواهب" }];

const row = (over: Partial<ConsoleMemberRow>): ConsoleMemberRow => ({
  id: "m1",
  email: "sara@example.com",
  displayName: "سارة العتيبي",
  companyId: "c1",
  companyName: "مواهب",
  teamColor: null,
  jobTitle: null,
  role: "member",
  status: "active",
  deactivatedAt: null,
  deactivatedReason: null,
  createdAt: "2026-01-01T00:00:00Z",
  avatarUrl: null,
  points: 0,
  levelName: null,
  hasSignedIn: true,
  invitedBy: null,
  ...over,
});

const wrap = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>{node}</main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );

const data = (rows: ConsoleMemberRow[]): ConsoleMembers => ({
  rows,
  total: rows.length,
  page: 1,
  pageCount: 1,
  from: 1,
  to: rows.length,
  companies: COMPANIES,
  activeAdmins: 2,
});

beforeEach(() => {
  addToOrg.mockReset();
  resendInvitation.mockReset();
  removeUnbound.mockReset();
  addToOrg.mockResolvedValue({ error: null, done: true, report: [{ email: "guest@gmail.com", outcome: "added" }] });
});

describe("«أضف عضوًا»", () => {
  it("offers عضو and مُنظِّم and NEVER مشرف المؤسسة — an addition cannot grant it (DEC-244 §5.4)", async () => {
    wrap(<AddMember locale="ar" companies={COMPANIES} />);
    await userEvent.click(screen.getByRole("button", { name: "أضف عضوًا" }));
    const role = screen.getByLabelText("الدور") as HTMLSelectElement;
    const offered = [...role.options].map((o) => o.textContent);
    expect(offered).toEqual(["عضو", "مُنظِّم"]);
    expect(offered).not.toContain("مشرف المؤسسة");
  });

  it("says the one thing that changes what the admin does next, and no more", async () => {
    wrap(<AddMember locale="ar" companies={COMPANIES} />);
    await userEvent.click(screen.getByRole("button", { name: "أضف عضوًا" }));
    expect(screen.getByText("يصبح عضوًا فورًا، ويصله بريد يدعوه لتسجيل الدخول.")).toBeInTheDocument();
  });

  it("posts one address with its name, company and role", async () => {
    wrap(<AddMember locale="ar" companies={COMPANIES} />);
    await userEvent.click(screen.getByRole("button", { name: "أضف عضوًا" }));
    await userEvent.type(screen.getByLabelText(/البريد الإلكتروني/), "guest@gmail.com");
    await userEvent.type(screen.getByLabelText(/^الاسم/), "ضيف");
    await userEvent.selectOptions(screen.getByLabelText("الشركة"), "c1");
    await userEvent.click(screen.getByRole("button", { name: "أضف" }));
    await waitFor(() => expect(addToOrg).toHaveBeenCalled());
    const form = addToOrg.mock.calls[0][2] as FormData;
    expect(form.get("emails")).toBe("guest@gmail.com");
    expect(form.get("displayName")).toBe("ضيف");
    expect(form.get("companyId")).toBe("c1");
    expect(form.get("role")).toBe("member");
  });

  it("★ reports every line of a pasted list and STAYS OPEN when one was refused", async () => {
    addToOrg.mockResolvedValue({
      error: null,
      done: true,
      report: [
        { email: "one@gmail.com", outcome: "added" },
        { email: "two", outcome: "not_an_address" },
        { email: "sara@example.com", outcome: "already_a_member" },
      ],
    });
    wrap(<AddMember locale="ar" companies={COMPANIES} />);
    await userEvent.click(screen.getByRole("button", { name: "أضف عضوًا" }));
    await userEvent.type(screen.getByLabelText(/البريد الإلكتروني/), "one@gmail.com\ntwo\nsara@example.com");
    await userEvent.click(screen.getByRole("button", { name: "أضف" }));
    const report = await waitFor(() => screen.getByRole("list", { name: "نتيجة الإضافة" }));
    expect(within(report).getByText(/عضو بالفعل/)).toBeInTheDocument();
    expect(within(report).getByText(/ليس بريدًا إلكترونيًا/)).toBeInTheDocument();
    expect(within(report).getByText(/one@gmail\.com/)).toBeInTheDocument();
    // The sheet is still open: its submit is still on the page, so the report can be read.
    expect(screen.getByRole("button", { name: "أضف" })).toBeInTheDocument();
  });

  it("says why an admin cannot be added by email, as a sentence", async () => {
    addToOrg.mockResolvedValue({ error: "role_not_allowed", done: false, report: [] });
    wrap(<AddMember locale="ar" companies={COMPANIES} />);
    await userEvent.click(screen.getByRole("button", { name: "أضف عضوًا" }));
    await userEvent.type(screen.getByLabelText(/البريد الإلكتروني/), "boss@gmail.com");
    await userEvent.click(screen.getByRole("button", { name: "أضف" }));
    await waitFor(() => expect(screen.getByText(/لا يمكن إضافة مشرف مؤسسة بالبريد/)).toBeInTheDocument());
  });

  it("has no axe violations with the report shown", async () => {
    addToOrg.mockResolvedValue({ error: null, done: true, report: [{ email: "two", outcome: "not_an_address" }] });
    const { container } = wrap(<AddMember locale="ar" companies={COMPANIES} />);
    await userEvent.click(screen.getByRole("button", { name: "أضف عضوًا" }));
    await userEvent.type(screen.getByLabelText(/البريد الإلكتروني/), "two");
    await userEvent.click(screen.getByRole("button", { name: "أضف" }));
    await waitFor(() => expect(screen.getByRole("list", { name: "نتيجة الإضافة" })).toBeInTheDocument());
    const results = await axe.run(container, { rules: { region: { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});

describe("a row whose auth user is not bound yet", () => {
  const waiting = row({
    id: "m2",
    displayName: "مقدّم خارجي",
    email: "outsider@gmail.com",
    hasSignedIn: false,
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  });
  const openMenu = (name: string) =>
    userEvent.click(within(within(screen.getByRole("table")).getByRole("row", { name: new RegExp(name) })).getByRole("button", { name: `مزيد من الإجراءات على ${name}` }));

  it("★ is marked, with its age and its address, and the mark is NOT on a member who has arrived", () => {
    wrap(<MembersTable data={data([row({}), waiting])} query={parseMemberQuery({})} selfId="self" timeZone="Asia/Riyadh" locale="ar" />);
    // `DataTable` renders the table AND the phone cards, so a cell is in the DOM twice — scope to
    // the table, which is what a desktop admin reads (wave 22's trap).
    const inTable = within(screen.getByRole("table"));
    expect(inTable.getByText(/لم يسجّل الدخول بعد · أُضيف منذ 3 أيام/)).toBeInTheDocument();
    expect(inTable.getByText("outsider@gmail.com")).toBeInTheDocument();
    expect(inTable.getAllByText(/لم يسجّل الدخول بعد/)).toHaveLength(1);
  });

  it("★ keeps everything a member row offers AND gains the two items", async () => {
    wrap(<MembersTable data={data([waiting])} query={parseMemberQuery({})} selfId="self" timeZone="Asia/Riyadh" locale="ar" />);
    await openMenu("مقدّم خارجي");
    expect(screen.getByRole("menuitem", { name: "أعد إرسال الدعوة" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "احذف" })).toBeInTheDocument();
    // DEC-244 §9: it is an ordinary member row — the role change and the deactivation stay.
    // Two of them for a member — مشرف المؤسسة and مُنظِّم — so the row keeps the FULL role change
    // that `DEC-244` §9 says it keeps, and promotion to admin stays possible once they arrive.
    expect(screen.getAllByRole("menuitem", { name: /غيّر الدور إلى/ })).toHaveLength(2);
    expect(screen.getByRole("menuitem", { name: "عطّل العضوية" })).toBeInTheDocument();
  });

  it("★ a member who HAS signed in is offered neither item", async () => {
    wrap(<MembersTable data={data([row({})])} query={parseMemberQuery({})} selfId="self" timeZone="Asia/Riyadh" locale="ar" />);
    await openMenu("سارة العتيبي");
    expect(screen.queryByRole("menuitem", { name: "أعد إرسال الدعوة" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "احذف" })).toBeNull();
  });

  it("the delete confirms first, naming the person and what it means", async () => {
    removeUnbound.mockResolvedValue({ error: null, done: true });
    wrap(<MembersTable data={data([waiting])} query={parseMemberQuery({})} selfId="self" timeZone="Asia/Riyadh" locale="ar" />);
    await openMenu("مقدّم خارجي");
    await userEvent.click(screen.getByRole("menuitem", { name: "احذف" }));
    expect(screen.getByText(/لم يسجّل الدخول بعد، فلا شيء له في المؤسسة/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "احذف" }));
    await waitFor(() => expect(removeUnbound).toHaveBeenCalledWith("ar", "m2"));
  });

  it("a resend says what the server said, never success regardless", async () => {
    resendInvitation.mockResolvedValue({ error: "already_signed_in", done: false });
    wrap(<MembersTable data={data([waiting])} query={parseMemberQuery({})} selfId="self" timeZone="Asia/Riyadh" locale="ar" />);
    await openMenu("مقدّم خارجي");
    await userEvent.click(screen.getByRole("menuitem", { name: "أعد إرسال الدعوة" }));
    await waitFor(() => expect(screen.getByText(/سجّل الدخول بالفعل/)).toBeInTheDocument());
  });
});
