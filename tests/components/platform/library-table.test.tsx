// SCR-083's library tables — wave 8 (`docs/plan/notes/platform.md` W8.6, W8.10).
// REQ-DSG-008, REQ-DSG-026, DEC-052, DEC-148 (contract 3), REQ-UIX-013.
//
// A row is a composition: a certificate shows its orientation, a poster does
// not. The retirement the floor would refuse is not offered — `retirable` comes
// from SQL beside the guard — and when the guard refuses anyway, the refusal is
// said in words (notes F4, F5).
import { NextIntlClientProvider } from "next-intl";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { Direction } from "radix-ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import arPlatform from "@/messages/ar/platform.json";
import arTemplates from "@/messages/ar/templates.json";
import arAdmin from "@/messages/ar/admin.json";
import type { PlatformTemplate } from "@/lib/dal/platform-templates";

const retireAction = vi.fn();
const setDefaultAction = vi.fn();
vi.mock("@/app/[locale]/app/platform/templates/actions", () => ({
  retireAction: (...a: unknown[]) => retireAction(...a),
  setDefaultAction: (...a: unknown[]) => setDefaultAction(...a),
}));
const show = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show }) }));

const { LibraryTable } = await import("@/app/[locale]/app/platform/templates/library-table");

const row = (over: Partial<PlatformTemplate>): PlatformTemplate => ({
  id: "t",
  purpose: "certificate",
  family: "attendance",
  name: "شهادة حضور",
  isDefault: false,
  retiredAt: null,
  versions: 1,
  createdAt: "2026-09-01T00:00:00Z",
  orientation: "landscape",
  isBaseline: true,
  retirable: true,
  ...over,
});

const messages = { ...arPlatform, ...arTemplates, ...arAdmin };
const wrap = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <Direction.Provider dir="rtl">{node}</Direction.Provider>
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  retireAction.mockReset();
  setDefaultAction.mockReset();
  show.mockReset();
});

describe("LibraryTable", () => {
  it("a certificate row shows its orientation; a poster table has no such column", () => {
    const { unmount } = wrap(
      <LibraryTable
        purpose="certificate"
        locale="ar"
        templates={[row({ id: "l", orientation: "landscape", isDefault: true }), row({ id: "p", orientation: "portrait", name: "شهادة حضور عمودية" })]}
      />,
    );
    const table = screen.getByRole("table", { name: "الشهادات" });
    expect(within(table).getByRole("columnheader", { name: "الشكل" })).toBeInTheDocument();
    expect(table).toHaveTextContent("أفقي");
    expect(table).toHaveTextContent("عمودي");
    unmount();
    wrap(<LibraryTable purpose="poster" locale="ar" templates={[row({ id: "x", purpose: "poster", family: "talk", name: "جلسة", orientation: null })]} />);
    expect(within(screen.getByRole("table", { name: "الملصقات" })).queryByRole("columnheader", { name: "الشكل" })).not.toBeInTheDocument();
  });

  it("★ DEC-052: the last default of a purpose offers no retirement at all", async () => {
    wrap(<LibraryTable purpose="certificate" locale="ar" templates={[row({ id: "only", isDefault: true, retirable: false })]} />);
    // Nothing to offer: a default cannot be made default, and it cannot be retired.
    expect(screen.queryByRole("button", { name: /إجراءات/ })).not.toBeInTheDocument();
  });

  it("retiring confirms by name and says what the automatic paths lose; a refusal is said in words", async () => {
    retireAction.mockResolvedValueOnce({ error: "last_platform_default" });
    const { container } = wrap(<LibraryTable purpose="certificate" locale="ar" templates={[row({ id: "r1", isDefault: true, retirable: true })]} />);
    await userEvent.click(screen.getAllByRole("button", { name: "إجراءات شهادة حضور" })[0]);
    await userEvent.click(screen.getByRole("menuitem", { name: "أحِله إلى التقاعد" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading")).toHaveTextContent("إحالة شهادة حضور إلى التقاعد");
    expect(dialog).toHaveTextContent("المسار التلقائي");
    expect((await axe.run(dialog, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
    await act(async () => {
      await userEvent.click(within(dialog).getByRole("button", { name: "أحِله إلى التقاعد" }));
    });
    await vi.waitFor(() =>
      expect(show).toHaveBeenCalledWith({ title: "هذا آخر قالب افتراضي لغرضه، والمكتبة لا تنزل عن واحد.", tone: "error" }),
    );
    expect(retireAction).toHaveBeenCalledWith("ar", "r1", true);
    expect(container).toBeTruthy();
  });

  it("a promoted row is badged as such; a retired one offers return to service", async () => {
    setDefaultAction.mockResolvedValue({ error: null });
    wrap(<LibraryTable purpose="certificate" locale="ar" templates={[row({ id: "pr", isBaseline: false, retiredAt: "2026-09-10T00:00:00Z", retirable: false })]} />);
    const table = screen.getByRole("table", { name: "الشهادات" });
    expect(table).toHaveTextContent("مرقّى");
    expect(table).toHaveTextContent("متقاعد");
    await userEvent.click(screen.getAllByRole("button", { name: "إجراءات شهادة حضور" })[0]);
    expect(screen.getByRole("menuitem", { name: "أعده إلى الخدمة" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "أحِله إلى التقاعد" })).not.toBeInTheDocument();
  });
});
