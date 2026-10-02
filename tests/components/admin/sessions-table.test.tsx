// SCR-042 · the sessions table (REQ-ADM-005, REQ-UIX-087), written from its
// artboards in wave 21 (DEC-208). Real messages, fake actions.
//
// ★ Ledger lines (STATUS), each a change to what this file asserted in wave 6:
//  · L4 — the search box filtered on the client; the list's state is the URL
//    now, so filtering is `session-query.test.ts`'s, and here the search is a
//    GET form carrying the same accessible name (a selector moved).
//  · L5 — «ابدأ الجلسة الآن» was always visible under the table; it is a
//    menu item under the row's ⋯ (an expectation changed: the artboard has no
//    room for a row of buttons, `DEC-228`).
//  · L6 — the cancel reason moved inside the dialog that names the session;
//    «أكّد الإلغاء» is gone (a selector and a flow moved).
// Kept untouched in meaning: the empty states and their short action, the
// row menu's routes, axe-clean.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/admin.json";
import browseAr from "@/messages/ar/browse.json";
import type { ConsoleSessionRow, SessionQuery } from "@/components/admin/sessions/session-query";

const push = vi.fn();
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  usePathname: () => "/ar/app/admin/sessions",
}));

const { SessionsTable } = await import("@/app/[locale]/app/admin/sessions/sessions-table");

const messages = { ...ar, ...browseAr };

const row = (over: Partial<ConsoleSessionRow>): ConsoleSessionRow => ({
  id: "s1",
  title: "جلسة الأمان السحابي",
  state: "published",
  phase: "open",
  seat: "available",
  startsAt: "2026-10-04T14:00:00Z",
  endsAt: "2026-10-04T15:00:00Z",
  dayCount: 1,
  venueName: "قاعة الرياض",
  capacity: 40,
  confirmed: 12,
  waitlisted: 0,
  categoryId: null,
  presenters: [{ memberId: "00000000-0000-4000-8000-000000000001", displayName: "سارة", avatarUrl: null, teamColor: "#ff9a2e", accepted: true, declinedAt: null }],
  monthKey: "2026-10",
  ...over,
});

const ROWS = [
  row({}),
  row({
    id: "s2",
    title: "أساسيات الشبكات",
    state: "approved",
    phase: "pending_schedule",
    startsAt: null,
    endsAt: null,
    capacity: null,
    presenters: [{ memberId: "00000000-0000-4000-8000-000000000002", displayName: "خالد", avatarUrl: null, teamColor: null, accepted: false, declinedAt: null }],
    monthKey: null,
  }),
];

const QUERY: SessionQuery = { q: "", status: null, category: null, month: null, sort: "default", dir: "asc", page: 1 };

function renderTable({
  mode = "admin" as "admin" | "moderator",
  rows = ROWS,
  query = QUERY,
  action = vi.fn().mockResolvedValue({ error: null, done: true }),
  bulk = vi.fn().mockResolvedValue({ error: null, done: ["s1"], failed: [], attempt: 1 }),
} = {}) {
  const view = render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <main>
        <SessionsTable
          mode={mode}
          rows={rows}
          query={query}
          total={rows.length}
          from={rows.length ? 1 : 0}
          to={rows.length}
          page={1}
          pageCount={1}
          timeZone="Asia/Riyadh"
          locale="ar"
          categories={[{ id: "00000000-0000-4000-8000-0000000000c1", name: "تقني" }]}
          months={["2026-10"]}
          actionsById={mode === "admin" ? { s1: ["start", "cancel"], s2: ["cancel"] } : {}}
          transitionActions={mode === "admin" ? { s1: action, s2: action } : {}}
          bulkCancel={mode === "admin" ? bulk : undefined}
        />
      </main>
    </NextIntlClientProvider>,
  );
  return { action, bulk, ...view };
}

const desktop = () => screen.getByRole("table", { hidden: true });

describe("SCR-042 — find", () => {
  it("L4: the search is a GET form on this route, named «ابحث في جلسات المؤسسة», carrying the chips' values", () => {
    renderTable({ query: { ...QUERY, q: "شبكات", status: "open" } });
    const box = screen.getByRole("searchbox", { name: "ابحث في جلسات المؤسسة" });
    expect(box).toHaveValue("شبكات");
    const form = box.closest("form")!;
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/ar/app/admin/sessions");
    expect(form.querySelector('input[type="hidden"][name="status"]')).toHaveValue("open");
  });

  it("shows the count of the filtered list, in six plural forms", () => {
    renderTable();
    expect(screen.getByText("جلستان")).toBeInTheDocument();
  });

  it("the empty states keep their short action: none yet, and none matching", () => {
    const { unmount } = renderTable({ rows: [] });
    expect(screen.getByText("لا جلسات بعد.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "افتح المقترحات" })).toBeInTheDocument();
    unmount();
    renderTable({ rows: [], query: { ...QUERY, q: "لا يوجد" } });
    expect(screen.getByText("لا جلسات مطابقة لبحثك.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "افتح المقترحات" })).toBeInTheDocument();
  });
});

describe("SCR-042 — the row", () => {
  it("draws the artboard's columns: title, status, date, venue, presenter with the team ring, seats, ⋯", () => {
    renderTable();
    const headers = within(desktop()).getAllByRole("columnheader", { hidden: true }).map((h) => h.textContent);
    expect(headers).toEqual(["تحديد الكل", "العنوان", "الحالة", "الموعد", "المكان", "المُقدِّم", "الحجوزات", "إجراءات المشرف"]);
    const first = within(desktop()).getAllByRole("row", { hidden: true })[1];
    expect(within(first).getByText("قاعة الرياض")).toBeInTheDocument();
    expect(within(first).getByText("12 / 40")).toBeInTheDocument();
    expect(within(first).getByText("التسجيل مفتوح")).toBeInTheDocument();
  });

  it("keeps a pending or declined presenter in the row", () => {
    renderTable();
    expect(within(desktop()).getByText("بانتظار رد المُقدِّم")).toBeInTheDocument();
  });

  it("the title opens the session's hub for an admin", () => {
    renderTable();
    expect(within(desktop()).getByRole("link", { name: "جلسة الأمان السحابي", hidden: true })).toHaveAttribute("href", "/ar/app/admin/sessions/s1");
  });

  it("the row menu keeps its routes, locale-aware, and gains the row's transitions (L5)", async () => {
    renderTable();
    const [trigger] = screen.getAllByRole("button", { name: /مزيد من الإجراءات على جلسة الأمان السحابي/ });
    await userEvent.click(trigger);
    const menu = await screen.findByRole("menu");
    const href = (name: string) => within(menu).getByRole("menuitem", { name }).getAttribute("href");
    expect(href("فتح الجلسة")).toBe("/ar/app/sessions/s1");
    expect(href("الجدولة والنشر")).toBe("/ar/app/admin/sessions/s1/schedule");
    expect(href("الحضور")).toBe("/ar/app/admin/sessions/s1/attendance");
    expect(href("الشهادات")).toBe("/ar/app/admin/sessions/s1/certificates");
    expect(href("الاستبانة")).toBe("/ar/app/admin/sessions/s1/survey");
    expect(within(menu).getByRole("menuitem", { name: "ابدأ الجلسة الآن" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "ألغِ الجلسة" })).toBeInTheDocument();
  });

  it("L5: a transition is one menu item that calls the row's bound action, and toasts from it", async () => {
    const { action } = renderTable();
    await userEvent.click(screen.getAllByRole("button", { name: /مزيد من الإجراءات على جلسة الأمان السحابي/ })[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "ابدأ الجلسة الآن" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect((action.mock.calls[0][1] as FormData).get("action")).toBe("start");
  });

  it("L6: cancelling confirms in a dialog naming the session, the reason inside it; «تراجع» calls nothing", async () => {
    const { action } = renderTable();
    await userEvent.click(screen.getAllByRole("button", { name: /مزيد من الإجراءات على جلسة الأمان السحابي/ })[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "ألغِ الجلسة" }));
    let dialog = await screen.findByRole("dialog", { name: "إلغاء «جلسة الأمان السحابي»؟" });
    await userEvent.click(within(dialog).getByRole("button", { name: "تراجع" }));
    expect(action).not.toHaveBeenCalled();

    await userEvent.click(screen.getAllByRole("button", { name: /مزيد من الإجراءات على جلسة الأمان السحابي/ })[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "ألغِ الجلسة" }));
    dialog = await screen.findByRole("dialog", { name: "إلغاء «جلسة الأمان السحابي»؟" });
    await userEvent.type(within(dialog).getByLabelText(/سبب الإلغاء الذي سيصل الحاضرين/), "سبب الإلغاء");
    await userEvent.click(within(dialog).getByRole("button", { name: "تأكيد الإلغاء" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("action")).toBe("cancel");
    expect(submitted.get("reason")).toBe("سبب الإلغاء");
  });

  it("an empty cancel reason is refused at the field, and the dialog stays", async () => {
    const action = vi.fn().mockResolvedValue({ error: "cancelReasonRequired", done: false });
    renderTable({ action });
    await userEvent.click(screen.getAllByRole("button", { name: /مزيد من الإجراءات على جلسة الأمان السحابي/ })[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "ألغِ الجلسة" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "تأكيد الإلغاء" }));
    expect(await within(dialog).findByText("اكتب سبب الإلغاء أولًا.")).toBeInTheDocument();
  });
});

describe("SCR-042 — act on many", () => {
  it("selecting rows replaces the toolbar with «N محدّدة», clear, cancel and the CSV", async () => {
    renderTable();
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    await userEvent.click(within(desktop()).getByRole("checkbox", { name: /تحديد الكل/, hidden: true }));
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByText("جلستان محدّدتان")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ألغِ الجلسات" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "صدّر الجلسات المحدّدة بصيغة CSV" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ألغِ التحديد" }));
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("«ألغِ الجلسات» is offered only when every selected row admits cancel", async () => {
    render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <SessionsTable
          mode="admin"
          rows={ROWS}
          query={QUERY}
          total={2}
          from={1}
          to={2}
          page={1}
          pageCount={1}
          timeZone="Asia/Riyadh"
          locale="ar"
          categories={[]}
          months={[]}
          actionsById={{ s1: ["start", "cancel"], s2: [] }}
          transitionActions={{}}
          bulkCancel={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    await userEvent.click(within(desktop()).getByRole("checkbox", { name: /تحديد الكل/, hidden: true }));
    expect(screen.queryByRole("button", { name: "ألغِ الجلسات" })).toBeNull();
  });

  it("the bulk cancel names the count and the titles, needs a reason, sends every id once, and keeps what failed selected", async () => {
    const bulk = vi.fn().mockResolvedValue({ error: null, done: ["s1"], failed: ["s2"], attempt: 1 });
    renderTable({ bulk });
    await userEvent.click(within(desktop()).getByRole("checkbox", { name: /تحديد الكل/, hidden: true }));
    await userEvent.click(screen.getByRole("button", { name: "ألغِ الجلسات" }));
    const dialog = await screen.findByRole("dialog", { name: "إلغاء جلستين؟" });
    expect(within(dialog).getByText("جلسة الأمان السحابي")).toBeInTheDocument();
    expect(within(dialog).getByText("أساسيات الشبكات")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/سبب الإلغاء الذي سيصل الحاضرين/), "قاعة مغلقة");
    await userEvent.click(within(dialog).getByRole("button", { name: "تأكيد الإلغاء" }));
    await waitFor(() => expect(bulk).toHaveBeenCalledTimes(1));
    const fd = bulk.mock.calls[0][1] as FormData;
    expect(fd.getAll("ids")).toEqual(["s1", "s2"]);
    expect(fd.get("reason")).toBe("قاعة مغلقة");
    expect(await screen.findByText("جلسة واحدة محدّدة")).toBeInTheDocument();
  });
});

describe("SCR-042 — a moderator", () => {
  it("reads the rows with no selection, no menu and no creation; the title opens attendance; the survey link is described by the title", () => {
    renderTable({ mode: "moderator" });
    expect(within(desktop()).queryAllByRole("checkbox", { hidden: true })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /مزيد من الإجراءات/ })).toBeNull();
    expect(within(desktop()).getByRole("link", { name: "جلسة الأمان السحابي", hidden: true })).toHaveAttribute("href", "/ar/app/admin/sessions/s1/attendance");
    const survey = within(desktop()).getAllByRole("link", { name: "الاستبانة", hidden: true })[0];
    expect(survey).toHaveAttribute("aria-describedby", "session-title-s1");
  });
});

describe("SCR-042 — accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = renderTable();
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});
