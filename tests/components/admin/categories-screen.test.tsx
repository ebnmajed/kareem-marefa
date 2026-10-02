// SCR-047, written for wave 22 from `AdminCategories.dc.html` (`REQ-UIX-094`, `REQ-ADM-007`, `DEC-227` §3, `DEC-232`).
// Categories alone; no delete exists (no grant, no policy — 0004); every write answers with what it wrote.
import type React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { ToastProvider } from "@/components/ui/toast";
import type { AdminCategory } from "@/lib/dal/admin-lists";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/admin-lists", async () => {
  const { z } = await import("zod");
  return {
    categoryInput: z.object({ name: z.string().trim().min(1).max(80) }).strict(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    setCategoryActive: vi.fn(),
  };
});

const dal = await import("@/lib/dal/admin-lists");
const { saveCategory, setCategoryActiveAction } = await import("@/app/[locale]/app/admin/categories/actions");
const { CategoriesTable } = await import("@/app/[locale]/app/admin/categories/categories-table");
const { CategoryForm } = await import("@/app/[locale]/app/admin/categories/category-form");
const { emptyCategoryState } = await import("@/app/[locale]/app/admin/categories/state");

const messages = { ...adminAr, ...uiAr };
const Wrap = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={messages}>
    <ToastProvider closeLabel="إغلاق">
      <main>{children}</main>
    </ToastProvider>
  </NextIntlClientProvider>
);

const ID = "11111111-1111-4111-8111-111111111111";
const ROWS: AdminCategory[] = [
  { id: ID, name: "إداري", deactivatedAt: null, sessionCount: 14, proposalCount: 0 },
  { id: "22222222-2222-4222-8222-222222222222", name: "تقني", deactivatedAt: null, sessionCount: 0, proposalCount: 3 },
  { id: "33333333-3333-4333-8333-333333333333", name: "قديم", deactivatedAt: "2026-09-01T00:00:00Z", sessionCount: 2, proposalCount: 0 },
];
const table = () => screen.getByRole("table");

beforeEach(() => {
  vi.mocked(dal.createCategory).mockReset();
  vi.mocked(dal.updateCategory).mockReset();
  vi.mocked(dal.setCategoryActive).mockReset();
});

describe("SCR-047 — the table", () => {
  it("draws التصنيف · الجلسات and a named ⋯, and no tags anywhere", () => {
    render(<CategoriesTable categories={ROWS} locale="ar" />, { wrapper: Wrap });
    expect(within(table()).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["التصنيف", "الجلسات", "إجراءات"]);
    expect(screen.queryByText(/الوسوم/)).toBeNull();
  });

  it("★ a category a proposal alone carries says so — it is in use (DEC-232 §4.4)", () => {
    render(<CategoriesTable categories={ROWS} locale="ar" />, { wrapper: Wrap });
    expect(within(within(table()).getAllByRole("row")[2]).getByText("مقترحات", { exact: false }).textContent).toBe("3 مقترحات");
  });

  it("state lives in the row: «معطّل» beside a deactivated one only", () => {
    render(<CategoriesTable categories={ROWS} locale="ar" />, { wrapper: Wrap });
    const rows = within(table()).getAllByRole("row").slice(1);
    expect(within(rows[0]).queryByText("معطّل")).toBeNull();
    expect(within(rows[2]).getByText("معطّل")).toBeVisible();
  });

  it("★ the menu offers «عدّل» and «عطّل» and never a delete; a deactivated one offers «أعد التفعيل»", async () => {
    render(<CategoriesTable categories={ROWS} locale="ar" />, { wrapper: Wrap });
    await userEvent.click(within(table()).getByRole("button", { name: "مزيد من الإجراءات على إداري" }));
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["عدّل", "عطّل"]);
    expect(screen.queryByRole("menuitem", { name: /حذف|احذف/ })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(within(table()).getByRole("button", { name: "مزيد من الإجراءات على قديم" }));
    expect(screen.getByRole("menuitem", { name: "أعد التفعيل" })).toBeVisible();
  });

  it("★ reactivating answers with what was written — a refusal is «لم يُحفظ»", async () => {
    vi.mocked(dal.setCategoryActive).mockResolvedValue({ ok: false });
    render(<CategoriesTable categories={ROWS} locale="ar" />, { wrapper: Wrap });
    await userEvent.click(within(table()).getByRole("button", { name: "مزيد من الإجراءات على قديم" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "أعد التفعيل" }));
    expect(await screen.findByText("لم يُحفظ — حاول مرة أخرى.", { exact: true })).toBeInTheDocument();
  });

  it("the phone card carries the ⋯", () => {
    const { container } = render(<CategoriesTable categories={ROWS} locale="ar" />, { wrapper: Wrap });
    const [card] = within(container.querySelector("ul") as HTMLElement).getAllByRole("listitem");
    expect(within(card).getByRole("button", { name: "مزيد من الإجراءات على إداري" })).toBeVisible();
  });

  it("has no axe violations", async () => {
    const { container } = render(<CategoriesTable categories={ROWS} locale="ar" />, { wrapper: Wrap });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

describe("SCR-047 — the form and the actions", () => {
  it("rename opens on the stored name; the summary's link focuses it (wave 8, F4)", async () => {
    const action = vi.fn(async () => ({ ...emptyCategoryState, errors: { name: "nameRequired" }, attempt: 1 }));
    const { container } = render(<CategoryForm action={action} category={ROWS[0]} closeHref="/app/admin/categories" />, { wrapper: Wrap });
    expect((screen.getByLabelText(/الاسم/) as HTMLInputElement).value).toBe("إداري");
    fireEvent.submit(container.querySelector("form")!);
    const summary = await screen.findByRole("alert");
    fireEvent.click(within(summary).getAllByRole("link")[0]);
    expect(document.activeElement?.id).toBe("category-name");
  });

  it("an edit goes to updateCategory; a write that matched nothing is «not saved»", async () => {
    vi.mocked(dal.updateCategory).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    const fd = new FormData();
    fd.set("name", "إدارة");
    expect((await saveCategory("ar", ID, emptyCategoryState, fd)).saved).toBe(true);
    expect(dal.updateCategory).toHaveBeenCalledWith("ar", ID, { name: "إدارة" });
    const nothing = await saveCategory("ar", ID, emptyCategoryState, fd);
    expect(nothing.saved).toBe(false);
    expect(nothing.formError).toBe("failed");
    await waitFor(() => expect(dal.createCategory).not.toHaveBeenCalled());
  });

  it("a malformed id writes nothing", async () => {
    expect(await setCategoryActiveAction("ar", "x", false)).toEqual({ ok: false });
    expect(dal.setCategoryActive).not.toHaveBeenCalled();
  });
});
