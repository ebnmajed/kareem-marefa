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
