// `console`'s file — DEC-186 §9: new wave-15 cases live in a file of their
// own. Token migration, not a behaviour change: every class `sheet.tsx` had
// before this wave is still there, unedited; this proves the `pg:`
// additions land beside them. The token cases below are not wrapped in
// `<PlayScope>` — see `data-table-scope.test.tsx`'s header comment (jsdom
// applies no CSS regardless, so the assertion is the class string's
// presence); the portal cases (DEC-188, contract 6) DO mount the scope,
// which needs `@/lib/fonts` mocked — `tests/components/ui/
// scope-portal.test.tsx` is the pattern.
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import { Direction } from "radix-ui";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "@/components/ui/sheet";
import { PlayScope } from "@/components/ui/scope";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

function Open() {
  return (
    <Direction.Provider dir="rtl">
      <Sheet open onOpenChange={() => {}} title="تصفية النتائج">
        <p>المحتوى</p>
      </Sheet>
    </Direction.Provider>
  );
}

function ClosedSheet() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        افتح المرشحات
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="تصفية النتائج">
        <p>المحتوى</p>
      </Sheet>
    </>
  );
}

function Toggle() {
  return (
    <Direction.Provider dir="rtl">
      <ClosedSheet />
    </Direction.Provider>
  );
}

describe("Sheet — the playground's scope, token-only", () => {
  it("the scrim keeps its resting colour and gains the scope's scrim step", () => {
    render(<Open />);
    // Radix renders the overlay as the content's previous sibling inside the
    // portal — no ARIA role of its own, so it is found from the dialog.
    const dialog = screen.getByRole("dialog", { name: "تصفية النتائج" });
    const overlay = dialog.previousElementSibling as HTMLElement;
    expect(overlay).toHaveClass("bg-[var(--color-navy-950)]/60");
    expect(overlay).toHaveClass("pg:bg-scrim");
  });

  it("the content drops its shadow inside the scope, keeping the border that already told it apart", () => {
    render(<Open />);
    const dialog = screen.getByRole("dialog", { name: "تصفية النتائج" });
    expect(dialog).toHaveClass("shadow-xl");
    expect(dialog).toHaveClass("pg:shadow-none");
    expect(dialog).toHaveClass("border-edge");
  });
});

describe("Sheet — the portal (DEC-188, contract 6)", () => {
  it("★ inside the scope it lands INSIDE the scope's element, so the sheet wears the scope", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PlayScope>
        <Toggle />
      </PlayScope>,
    );
    await user.click(screen.getByRole("button", { name: "افتح المرشحات" }));
    const sheet = screen.getByRole("dialog", { name: "تصفية النتائج" });
    expect(sheet.closest(".theme-play")).toBe(container.firstElementChild);
    expect(sheet.closest("[data-play-portal]")).not.toBeNull();
  });

  it("★ outside a scope it lands in <body>, exactly as before the wave", async () => {
    const user = userEvent.setup();
    const { container } = render(<Toggle />);
    await user.click(screen.getByRole("button", { name: "افتح المرشحات" }));
    const sheet = screen.getByRole("dialog", { name: "تصفية النتائج" });
    expect(sheet.closest(".theme-play")).toBeNull();
    expect(sheet.closest("[data-play-portal]")).toBeNull();
    expect(container.contains(sheet)).toBe(false);
    expect(document.body.contains(sheet)).toBe(true);
  });
});
