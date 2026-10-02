// Wave 8, F1: on a phone, four admin lists had no row actions at all.
//
// `ui/data-table.tsx`'s card list (below `md`) renders ONLY the columns marked
// `onCard`, and the `actions` column of members, venues, categories and
// companies was not — so at 390 px an admin could not deactivate a venue or
// change a member's standing, and nothing said so. `sessions-table.tsx` had the
// same defect and fixed it in wave 6. It hid because every row-scoped e2e case
// in `admin-members.spec.ts` and `admin-managed-lists.spec.ts` is desktop-only.
//
// Each case scopes to the card list — the only `<ul>` `DataTable` renders
// (jsdom applies no `md:hidden`, so the desktop `<table>` copy is in the DOM
// too, and a query that is not scoped would pass on the table alone).
import { render, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { MembersTable } from "@/app/[locale]/app/admin/members/members-table";
import { ToastProvider } from "@/components/ui/toast";
import type { AdminMemberRow } from "@/lib/dal/admin-members";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";



const messages = { ...adminAr, ...uiAr };

function withProviders(children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">{children}</ToastProvider>
    </NextIntlClientProvider>
  );
}

function cards(container: HTMLElement): HTMLElement[] {
  const list = container.querySelector("ul");
  if (!list) throw new Error("no phone card list rendered");
  return within(list as HTMLElement).getAllByRole("listitem");
}

describe("the phone card list carries each row's actions (wave 8, F1)", () => {
  it("members: another member's card offers the actions menu, a deactivated member's a worded reactivation, and the viewer's own card a dash rather than an empty slot", () => {
    const base: Omit<AdminMemberRow, "id" | "displayName" | "email" | "status" | "deactivatedAt"> = {
      companyId: null,
      jobTitle: null,
      role: "member",
      deactivatedReason: null,
      createdAt: "2026-01-01T00:00:00Z",
    };
    const members: AdminMemberRow[] = [
      { ...base, id: "self", displayName: "المشرفة نفسها", email: "self@example.com", role: "admin", status: "active", deactivatedAt: null },
      { ...base, id: "m1", displayName: "سارة العتيبي", email: "sara@example.com", status: "active", deactivatedAt: null },
      { ...base, id: "m2", displayName: "خالد الحربي", email: "khalid@example.com", status: "deactivated", deactivatedAt: "2026-09-01T00:00:00Z" },
    ];
    const noop = vi.fn();
    const { container } = render(
      withProviders(
        <MembersTable
          members={members}
          companyNames={new Map()}
          selfId="self"
          timeZone="Asia/Riyadh"
          locale="ar"
          changeRoleActions={{ self: noop, m1: noop, m2: noop }}
          deactivateActions={{ self: noop, m1: noop, m2: noop }}
          reactivateActions={{ self: noop, m1: noop, m2: noop }}
        />,
      ),
    );
    const [self, active, deactivated] = cards(container);
    expect(within(active).getByRole("button", { name: /مزيد من الإجراءات على سارة العتيبي/ })).toBeTruthy();
    expect(within(deactivated).getByRole("button", { name: "أعد تفعيل العضوية — خالد الحربي" }).textContent).toContain("أعد تفعيل العضوية");
    const selfActions = Array.from(self.querySelectorAll(".flex.justify-between")).find((row) => row.textContent?.includes("الإجراءات"));
    expect(selfActions?.querySelector("span:last-child")?.textContent).toBe("—");
  });
});
