// `console`'s file — DEC-186 §9: new wave-15 cases live in a file of their
// own. Token migration, not a behaviour change: every class `sheet.tsx` had
// before this wave is still there, unedited; this proves the `pg:`
// additions land beside them. Not wrapped in `<PlayScope>` — see
// `data-table-scope.test.tsx`'s header comment (`next/font/google` has no
// jsdom alias in `vitest.config.ts`, a lead-only file).
import { render, screen } from "@testing-library/react";
import { Direction } from "radix-ui";
import { describe, expect, it } from "vitest";
import { Sheet } from "@/components/ui/sheet";

function Open() {
  return (
    <Direction.Provider dir="rtl">
      <Sheet open onOpenChange={() => {}} title="تصفية النتائج">
        <p>المحتوى</p>
      </Sheet>
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
