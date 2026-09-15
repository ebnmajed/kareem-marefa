// The house sheet over Radix Dialog (DEC-019) — the phone bottom sheet /
// filter sheet / search sheet. `dialog.test.tsx` is the house precedent for
// the wrapper shape; this is the same primitive positioned at an edge.
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Direction } from "radix-ui";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { Sheet } from "@/components/ui/sheet";

function Controlled({ side }: { side?: "bottom" | "inline-start" | "inline-end" }) {
  const [open, setOpen] = useState(true);
  return (
    <Direction.Provider dir="rtl">
      <button type="button" onClick={() => setOpen(true)}>
        افتح المرشحات
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="تصفية النتائج" description="اختر المعايير" side={side}>
        <button type="button" onClick={() => setOpen(false)}>
          تم
        </button>
      </Sheet>
    </Direction.Provider>
  );
}

describe("Sheet", () => {
  it("renders only when open, named by its title and described", () => {
    render(<Controlled />);
    const dialog = screen.getByRole("dialog", { name: "تصفية النتائج" });
    expect(dialog).toHaveAccessibleDescription("اختر المعايير");
  });

  it("nothing renders when closed", () => {
    function Closed() {
      const [open, setOpen] = useState(false);
      return (
        <Sheet open={open} onOpenChange={setOpen} title="عنوان">
          محتوى
        </Sheet>
      );
    }
    render(<Closed />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape (Radix's own default, wired through onOpenChange)", async () => {
    render(<Controlled />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a caller-supplied action inside children can close it", async () => {
    render(<Controlled />);
    await userEvent.click(screen.getByRole("button", { name: "تم" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("onOpenChange is not called spuriously on mount", () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open={false} onOpenChange={onOpenChange} title="عنوان">
        محتوى
      </Sheet>,
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it.each(["bottom", "inline-start", "inline-end"] as const)("is accessible with side=%s", async (side) => {
    const { container } = render(<Controlled side={side} />);
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations).toEqual([]);
  }, 20000);
});
