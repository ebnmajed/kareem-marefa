// SCR-042's "كل الجلسات" onto `ui/data-table` — the search/sort composition
// this screen owns (`DataTableProps` has neither built-in), the row `Menu`'s
// navigation, and the cancel confirmation dialog's portal/form association.
// `tests/e2e/admin-sessions.spec.ts` proves the same shapes against real
// Supabase; this file is the fast jsdom check.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { AdminSessionsTable } from "@/app/[locale]/app/admin/sessions/sessions-table";
import type { AdminSession } from "@/lib/dal/sessions";
import ar from "@/messages/ar/admin.json";
import browseAr from "@/messages/ar/browse.json";

// `SessionStatusBadge` (content's, consumed) reads `browse.status.*` — a
// second namespace this route does not otherwise touch, merged in here so
// the badge renders real Arabic instead of a fallback key path.
const messages = { ...ar, ...browseAr };

const SESSIONS: AdminSession[] = [
  {
    id: "s1",
    title: "جلسة الأمان السحابي",
    state: "published",
    level: "introductory",
    language: "ar",
    startsAt: "2026-10-01T10:00:00Z",
    fromProposal: true,
    presenters: [{ memberId: "m1", displayName: "سارة", accepted: true, declinedAt: null }],
    createdAt: "2026-09-01T00:00:00Z",
  },
  {
    id: "s2",
    title: "أساسيات الشبكات",
    state: "approved",
    level: "introductory",
    language: "ar",
    startsAt: null,
    fromProposal: false,
    presenters: [{ memberId: "m2", displayName: "خالد", accepted: false, declinedAt: null }],
    createdAt: "2026-09-02T00:00:00Z",
  },
];

function renderTable(action = vi.fn().mockResolvedValue({ error: null, done: true })) {
  render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <AdminSessionsTable
        sessions={SESSIONS}
        actionsById={{ s1: ["start", "cancel"], s2: ["cancel"] }}
        timeZone="Asia/Riyadh"
        locale="ar"
        transitionActions={{ s1: action, s2: action }}
      />
    </NextIntlClientProvider>,
  );
  return action;
}

describe("AdminSessionsTable", () => {
  // A longer timeout than the default 5 s, not a longer test — see
  // `members-table.test.tsx`'s identical note on its own search test.
  it("the search box filters by title and by presenter name", async () => {
    renderTable();
    expect(screen.getAllByText("جلسة الأمان السحابي").length).toBeGreaterThan(0);
    expect(screen.getAllByText("أساسيات الشبكات").length).toBeGreaterThan(0);

    await userEvent.type(screen.getByRole("searchbox", { name: "ابحث في جلسات المؤسسة" }), "خالد");
    expect(screen.queryByText("جلسة الأمان السحابي")).not.toBeInTheDocument();
    expect(screen.getAllByText("أساسيات الشبكات").length).toBeGreaterThan(0);
  }, 15000);

  // ★ Two real bugs the lead's screenshot review caught on a real build:
  // the empty title was hard-coded to the "no search matches" copy even
  // with an untouched search box, and the empty-state BUTTON was labelled
  // with `scheduleNote` — a full sentence meant as `direct-session-form.tsx`'s
  // own inline hint — rendering a paragraph inside a primary button.
  it("the empty state reads 'no sessions yet', with a short action label, when the org has none", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <AdminSessionsTable sessions={[]} actionsById={{}} timeZone="Asia/Riyadh" locale="ar" transitionActions={{}} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("لا جلسات بعد.")).toBeVisible();
    expect(screen.queryByText("لا جلسات مطابقة لبحثك.")).not.toBeInTheDocument();
    const action = screen.getByRole("link", { name: "افتح المقترحات" });
    expect(action).toHaveAttribute("href", "/ar/app/admin/proposals");
  });

  it("the empty state switches to 'no matches' once a search finds nothing, keeping the short action label", async () => {
    renderTable();
    await userEvent.type(screen.getByRole("searchbox", { name: "ابحث في جلسات المؤسسة" }), "لا يوجد شيء بهذا الاسم");
    expect(screen.getByText("لا جلسات مطابقة لبحثك.")).toBeVisible();
    expect(screen.queryByText("لا جلسات بعد.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "افتح المقترحات" })).toBeVisible();
  }, 15000);

  it("the row menu's navigation items point at the right routes", async () => {
    renderTable();
    // `t.markup` on `moreActions` (a `<t>{title}</t>` tag, like `ui/combobox`'s
    // `removeChip`) — the proposal's own name in the accessible name, so two
    // rows' menu triggers are never announced identically.
    const trigger = screen.getAllByRole("button", { name: /مزيد من الإجراءات على جلسة الأمان السحابي/ })[0];
    await userEvent.click(trigger);
    // `ui/link` (locale-aware, `next-intl`'s own `Link`) is what `menu.tsx`'s
    // `href` items resolve through now — the `/ar` prefix on these hrefs IS
    // the fix (the console `menu.tsx` bug this track found and fixed at the
    // start of this wave): a plain `<a>` would have carried NO locale prefix.
    expect(screen.getByRole("menuitem", { name: "فتح الجلسة" }).closest("a")).toHaveAttribute("href", "/ar/app/sessions/s1");
    expect(screen.getByRole("menuitem", { name: "الجدولة والنشر" }).closest("a")).toHaveAttribute("href", "/ar/app/admin/sessions/s1/schedule");
  });

  it("★ every session with a transition gets ALWAYS-VISIBLE controls, never gated behind a click", () => {
    renderTable();
    // The regression this guards: a first draft hid these behind the row
    // menu, which broke `tests/e2e/sessions-screens.spec.ts`'s assumption
    // that «ابدأ الجلسة الآن» is visible on page load.
    expect(screen.getByRole("button", { name: "ابدأ الجلسة الآن" })).toBeVisible();
  });

  it("★ cancelling confirms in a dialog naming the session, portalled outside the <details> it opens from", async () => {
    const action = renderTable();
    const cards = screen.getAllByText("جلسة الأمان السحابي");
    const controlsCard = cards[cards.length - 1].closest("div")!;
    await userEvent.click(within(controlsCard).getByText("ألغِ الجلسة"));
    await userEvent.type(within(controlsCard).getByLabelText("سبب الإلغاء الذي سيصل الحاضرين"), "سبب الإلغاء");
    await userEvent.click(within(controlsCard).getByRole("button", { name: "أكّد الإلغاء" }));

    const dialog = await screen.findByRole("dialog", { name: "إلغاء «جلسة الأمان السحابي»؟" });
    expect(dialog).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "تأكيد الإلغاء" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("action")).toBe("cancel");
    expect(submitted.get("reason")).toBe("سبب الإلغاء");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <AdminSessionsTable
          sessions={SESSIONS}
          actionsById={{ s1: ["start", "cancel"], s2: ["cancel"] }}
          timeZone="Asia/Riyadh"
          locale="ar"
          transitionActions={{ s1: vi.fn().mockResolvedValue({ error: null, done: false }), s2: vi.fn().mockResolvedValue({ error: null, done: false }) }}
        />
      </NextIntlClientProvider>,
    );
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  }, 20000);
});
