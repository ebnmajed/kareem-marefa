// Sync 6's finding: `venues-table.tsx`'s phone card view showed «الحالة»
// with no value for an active venue — `ui/data-table.tsx`'s card mode
// always renders an `onCard` column's label, even when the column's own
// `cell()` returns `null` (its cell rendered `null` for the active case,
// non-null only when deactivated). `categories-table.tsx` and
// `companies-table.tsx` share the exact same status-cell shape (all three
// built together, "one list pattern three times" — `venues-table.tsx`'s own
// header comment), so this file proves the fix on all three.
//
// ★ All three tables import their own `./actions` module directly (unlike
// `members-table.tsx`, which takes actions as props) — that module pulls in
// a `server-only` DAL file, so each is mocked here the same way
// `me/profile-form.test.tsx` mocks `@/app/[locale]/app/me/actions`.
import { render, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { AdminVenue } from "@/lib/dal/sessions";
import type { AdminCategory, AdminCompany } from "@/lib/dal/admin-lists";
import ar from "@/messages/ar/admin.json";

vi.mock("@/app/[locale]/app/admin/venues/actions", () => ({ toggleVenue: vi.fn() }));
vi.mock("@/app/[locale]/app/admin/categories/actions", () => ({ toggleCategory: vi.fn() }));
vi.mock("@/app/[locale]/app/admin/companies/actions", () => ({ toggleCompany: vi.fn() }));

const { VenuesTable } = await import("@/app/[locale]/app/admin/venues/venues-table");
const { CategoriesTable } = await import("@/app/[locale]/app/admin/categories/categories-table");
const { CompaniesTable } = await import("@/app/[locale]/app/admin/companies/companies-table");

function withProviders(children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      <ToastProvider closeLabel="إغلاق">{children}</ToastProvider>
    </NextIntlClientProvider>
  );
}

/** The card view's own status row for one card, scoped past the desktop
 *  `<table>` copy `DataTable` also renders (jsdom applies no `md:hidden`
 *  media query, so both are in the DOM at once — the same reason
 *  `members-table.test.tsx` scopes with `getAllByRole(...)[0]`). */
function cardStatusText(cardList: HTMLElement, cardIndex: number): string {
  const card = within(cardList).getAllByRole("listitem")[cardIndex];
  const rows = card.querySelectorAll(".flex.justify-between");
  for (const row of Array.from(rows)) {
    if (row.textContent?.includes("الحالة")) return row.querySelector("span:last-child")?.textContent ?? "";
  }
  throw new Error("no status row found on card");
}

describe("managed lists — the phone card view's status column", () => {
  it("venues: an active venue's card shows «نشط», not an empty value", () => {
    const venues: AdminVenue[] = [
      { id: "v1", name: "قاعة نشطة", address: null, capacity: null, mapUrl: null, notes: null, timeZone: null, deactivatedAt: null, upcomingSessions: 0 },
      { id: "v2", name: "قاعة معطّلة", address: null, capacity: null, mapUrl: null, notes: null, timeZone: null, deactivatedAt: "2026-09-01T00:00:00Z", upcomingSessions: 0 },
    ];
    // `getByRole("list")` is ambiguous here — the toast region's `<ol>`
    // (`ToastProvider`, always mounted) carries the same implicit role.
    // `DataTable`'s phone card list is the only `<ul>` in the tree.
    const { container } = render(withProviders(<VenuesTable venues={venues} locale="ar" />));
    const cardList = container.querySelector("ul")!;
    expect(cardStatusText(cardList, 0)).toBe("نشط");
    expect(cardStatusText(cardList, 1)).toBe("معطّل");
  });

  it("categories: an active category's card shows «نشط», not an empty value", () => {
    const categories: AdminCategory[] = [
      { id: "c1", name: "تصنيف نشط", deactivatedAt: null, sessionCount: 0 },
      { id: "c2", name: "تصنيف معطّل", deactivatedAt: "2026-09-01T00:00:00Z", sessionCount: 0 },
    ];
    const { container } = render(withProviders(<CategoriesTable categories={categories} locale="ar" />));
    const cardList = container.querySelector("ul")!;
    expect(cardStatusText(cardList, 0)).toBe("نشط");
    expect(cardStatusText(cardList, 1)).toBe("معطّل");
  });

  it("companies: an active company's card shows «نشطة» (feminine, REQ-ADM-008's own noun), not an empty value", () => {
    const companies: AdminCompany[] = [
      { id: "co1", name: "شركة نشطة", deactivatedAt: null, memberCount: 0 },
      { id: "co2", name: "شركة معطّلة", deactivatedAt: "2026-09-01T00:00:00Z", memberCount: 0 },
    ];
    const { container } = render(withProviders(<CompaniesTable companies={companies} locale="ar" />));
    const cardList = container.querySelector("ul")!;
    expect(cardStatusText(cardList, 0)).toBe("نشطة");
    expect(cardStatusText(cardList, 1)).toBe("معطّلة");
  });
});
