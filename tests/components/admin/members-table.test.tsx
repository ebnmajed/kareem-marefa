// SCR-049's members list onto `ui/data-table` — the search box, role change,
// and the deactivate confirmation dialog naming the member.
// `tests/e2e/admin-members.spec.ts` proves the same shapes against real
// Supabase; this file is the fast jsdom check.
//
// ★ Actions are plain mock functions in a `Record<id, fn>`, matching the real
// component's props exactly — `members-table.tsx` cannot import `./actions`
// at all (it transitively pulls in `lib/dal/admin-members.ts`, which starts
// `import "server-only"` and throws the instant anything imports it outside
// a server module, even a test).
//
// ★ `DataTable` renders EVERY `onCard` column's cell TWICE per row — once
// for the desktop `<table>`, once for the phone card list, hidden by CSS
// media queries a real browser applies and jsdom does not. A stateful cell
// (`RoleCell`, `ActionsCell` here) is therefore mounted as two independent
// component instances. `getAllByRole(...)[0]` picks the first (desktop)
// instance throughout, matching how a real browser's accessibility tree
// would already exclude the `md:hidden` copy for free.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { MembersTable } from "@/app/[locale]/app/admin/members/members-table";
import { ToastProvider } from "@/components/ui/toast";
import type { AdminMemberRow } from "@/lib/dal/admin-members";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";

// `ui/field.tsx` (sessions' primitive, consumed) reads `ui.field.required`
// for the «مطلوب» marker it appends to every required label's own text — a
// second namespace this route does not otherwise touch, merged in so
// `getByLabelText`'s EXACT match sees the real Arabic word, not the raw
// `ui.field.required` key path a missing namespace falls back to.
const ar = { ...adminAr, ...uiAr };

const MEMBERS: AdminMemberRow[] = [
  {
    id: "m1",
    email: "sara@example.com",
    displayName: "سارة العتيبي",
    companyId: null,
    jobTitle: null,
    role: "member",
    status: "active",
    deactivatedAt: null,
    deactivatedReason: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "m2",
    email: "khalid@example.com",
    displayName: "خالد الحربي",
    companyId: null,
    jobTitle: null,
    role: "moderator",
    status: "active",
    deactivatedAt: null,
    deactivatedReason: null,
    createdAt: "2026-01-02T00:00:00Z",
  },
];

type RowState = { error: string | null; done: boolean };
type RowAction = (prev: RowState, fd: FormData) => Promise<RowState>;

function renderTable(overrides?: { changeRole?: RowAction; deactivate?: RowAction }) {
  const changeRoleActions: Record<string, RowAction> = {
    m1: overrides?.changeRole ?? vi.fn<RowAction>().mockResolvedValue({ error: null, done: true }),
    m2: vi.fn<RowAction>().mockResolvedValue({ error: null, done: true }),
  };
  const deactivateActions: Record<string, RowAction> = {
    m1: overrides?.deactivate ?? vi.fn<RowAction>().mockResolvedValue({ error: null, done: true }),
    m2: vi.fn<RowAction>().mockResolvedValue({ error: null, done: true }),
  };
  const reactivateActions = { m1: vi.fn().mockResolvedValue(undefined), m2: vi.fn().mockResolvedValue(undefined) };
  render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <MembersTable
        members={MEMBERS}
        companyNames={new Map()}
        selfId="self"
        timeZone="Asia/Riyadh"
        locale="ar"
        changeRoleActions={changeRoleActions}
        deactivateActions={deactivateActions}
        reactivateActions={reactivateActions}
      />
    </NextIntlClientProvider>,
  );
  return { changeRoleActions, deactivateActions, reactivateActions };
}

describe("MembersTable", () => {
  // A longer timeout than the default 5 s, not a longer test: `userEvent.type`
  // across the whole `DataTable` (rendered twice per row — see the header
  // note) is the single heaviest interaction in this file, and the default
  // has been observed to trip under load though the interaction itself
  // completes in a few seconds.
  it("the search box filters by name and by email", async () => {
    renderTable();
    expect(screen.getAllByText("سارة العتيبي").length).toBeGreaterThan(0);
    await userEvent.type(screen.getByRole("searchbox", { name: "ابحث في الأعضاء" }), "khalid");
    expect(screen.queryByText("سارة العتيبي")).not.toBeInTheDocument();
    expect(screen.getAllByText("خالد الحربي").length).toBeGreaterThan(0);
  }, 15000);

  it("★ deactivating confirms in a dialog naming the member, with the reason field inside it", async () => {
    const deactivateAction = vi.fn<RowAction>().mockResolvedValue({ error: null, done: true });
    renderTable({ deactivate: deactivateAction });

    const trigger = screen.getAllByRole("button", { name: /مزيد من الإجراءات على سارة العتيبي/ })[0];
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "عطّل العضوية" }));

    const dialog = await screen.findByRole("dialog", { name: "تعطيل عضوية «سارة العتيبي»؟" });
    // `{ exact: false }`: `ui/field.tsx` appends «مطلوب» to every required
    // label's own accessible name (REQ-UIX-011) — a real, permanent suffix,
    // not something to match verbatim here.
    await userEvent.type(within(dialog).getByLabelText("سبب التعطيل الذي يُسجَّل في سجل التدقيق", { exact: false }), "مغادرة الشركة");
    await userEvent.click(within(dialog).getByRole("button", { name: "أرسل" }));

    await waitFor(() => expect(deactivateAction).toHaveBeenCalledTimes(1));
    const submitted = deactivateAction.mock.calls[0][1] as FormData;
    expect(submitted.get("reason")).toBe("مغادرة الشركة");
  });

  // ★ The dialog's `<form>` has no `noValidate` set to work AROUND — its
  // reason field is `required` only via `<Field>`'s own `aria-required`
  // context, never a native HTML `required` attribute (`ui/textarea.tsx`
  // never forwards one unless a caller passes it directly, and this one
  // doesn't), so the browser was never going to block this submission in
  // the first place. What this proves is the other half of 16 §8.2's rule:
  // once the round trip returns `reason_required`, the app's OWN inline
  // `<Field>` error actually renders — the sync-3-adjacent sweep's real
  // concern (content's 7f4809f), checked here rather than assumed.
  it("an empty reason shows the app's own inline error, not a silently blocked submission", async () => {
    const deactivateAction = vi.fn<RowAction>().mockResolvedValue({ error: "reason_required", done: false });
    renderTable({ deactivate: deactivateAction });

    const trigger = screen.getAllByRole("button", { name: /مزيد من الإجراءات على سارة العتيبي/ })[0];
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "عطّل العضوية" }));

    const dialog = await screen.findByRole("dialog", { name: "تعطيل عضوية «سارة العتيبي»؟" });
    await userEvent.click(within(dialog).getByRole("button", { name: "أرسل" }));

    await waitFor(() => expect(deactivateAction).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByText("اكتب سبب التعطيل أولًا.")).toBeVisible();
    // Still open — the error is only useful where the field it names is.
    expect(dialog).toBeVisible();
  });

  it("changing a role submits the select's value", async () => {
    const changeRoleAction = vi.fn<RowAction>().mockResolvedValue({ error: null, done: true });
    renderTable({ changeRole: changeRoleAction });

    const selects = screen.getAllByLabelText("الدور") as HTMLSelectElement[];
    await userEvent.selectOptions(selects[0], "moderator");
    const submitButtons = screen.getAllByRole("button", { name: "غيّر الدور" });
    await userEvent.click(submitButtons[0]);

    await waitFor(() => expect(changeRoleAction).toHaveBeenCalledTimes(1));
    const submitted = changeRoleAction.mock.calls[0][1] as FormData;
    expect(submitted.get("role")).toBe("moderator");
  });

  // ★ REQ-ADM-009: the RPC's last-admin guard, proved HERE rather than in
  // the e2e spec — the spec seeds only one admin, which is the signed-in
  // viewer's own row, and `RoleCell` withholds the role control entirely on
  // the viewer's own row (no self-demotion in the UI at all, `isSelf`
  // below), so the guard is unreachable through that row's own control. A
  // real build's own run found the e2e test trying anyway, timing out on a
  // `<select>` that was never going to exist. `error.last_admin` only ever
  // surfaces as a toast (`RoleCell` has no inline alert of its own), which
  // is a no-op outside `ToastProvider` — wrapped here, unlike `renderTable`.
  it("★ REQ-ADM-009: the last-admin guard's error reads as a real sentence", async () => {
    const changeRoleAction = vi.fn<RowAction>().mockResolvedValue({ error: "last_admin", done: false });
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <ToastProvider closeLabel="إغلاق">
          <MembersTable
            members={MEMBERS}
            companyNames={new Map()}
            selfId="self"
            timeZone="Asia/Riyadh"
            locale="ar"
            changeRoleActions={{ m1: changeRoleAction, m2: vi.fn<RowAction>().mockResolvedValue({ error: null, done: true }) }}
            deactivateActions={{ m1: vi.fn<RowAction>().mockResolvedValue({ error: null, done: true }), m2: vi.fn<RowAction>().mockResolvedValue({ error: null, done: true }) }}
            reactivateActions={{ m1: vi.fn().mockResolvedValue(undefined), m2: vi.fn().mockResolvedValue(undefined) }}
          />
        </ToastProvider>
      </NextIntlClientProvider>,
    );

    const selects = screen.getAllByLabelText("الدور") as HTMLSelectElement[];
    await userEvent.selectOptions(selects[0], "member");
    await userEvent.click(screen.getAllByRole("button", { name: "غيّر الدور" })[0]);

    await waitFor(() => expect(changeRoleAction).toHaveBeenCalledTimes(1));
    await screen.findByText("لا يمكن ترك المؤسسة بلا مشرف", { exact: false });
  });

  // ★ A real build's own run found `admin-members.spec.ts` trying to
  // demote the last admin through the viewer's OWN row — but the viewer's
  // own row renders no role select and no deactivate menu at all
  // (`RoleCell`/`ActionsCell`'s `isSelf` branch), so the guard above is the
  // only place this decision is actually provable. This proves the
  // withholding itself.
  it("the viewer's own row offers no role control and no deactivate — self-demotion has no UI path at all", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <MembersTable
          members={[{ ...MEMBERS[0], id: "self", role: "admin" }, MEMBERS[1]]}
          companyNames={new Map()}
          selfId="self"
          timeZone="Asia/Riyadh"
          locale="ar"
          changeRoleActions={{ self: vi.fn(), m2: vi.fn() }}
          deactivateActions={{ self: vi.fn(), m2: vi.fn() }}
          reactivateActions={{ self: vi.fn(), m2: vi.fn() }}
        />
      </NextIntlClientProvider>,
    );
    // The plain-text role reading (no select, no submit) is what `isSelf`
    // renders instead.
    expect(screen.getAllByText("مشرف المؤسسة").length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText("الدور")).toHaveLength(2); // both from m2, the OTHER member — none from "self"
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <MembersTable
          members={MEMBERS}
          companyNames={new Map()}
          selfId="self"
          timeZone="Asia/Riyadh"
          locale="ar"
          changeRoleActions={{ m1: vi.fn(), m2: vi.fn() }}
          deactivateActions={{ m1: vi.fn(), m2: vi.fn() }}
          reactivateActions={{ m1: vi.fn(), m2: vi.fn() }}
        />
      </NextIntlClientProvider>,
    );
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  }, 20000);
});
