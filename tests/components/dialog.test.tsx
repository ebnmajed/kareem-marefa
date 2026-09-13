// The house dialog over Radix (DEC-019): opens from its trigger, is named by
// its title, moves focus inside, and closes from the labelled control and
// from Escape. Direction comes from the layout's provider; Radix applies it
// to the primitives that position themselves, which a dialog does not.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Direction } from "radix-ui";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import ar from "@/messages/ar/ui.json";

const closeLabel = ar.ui.dialog.close;

function Example() {
  return (
    <Direction.Provider dir="rtl">
      <Dialog>
        <DialogTrigger>افتح</DialogTrigger>
        <DialogContent title="تأكيد الحجز" description="سيُحجز لك مقعد في الجلسة." closeLabel={closeLabel}>
          <p>المحتوى</p>
        </DialogContent>
      </Dialog>
    </Direction.Provider>
  );
}

describe("Dialog", () => {
  it("is closed until its trigger is used, then named by its title", async () => {
    render(<Example />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "افتح" }));
    const dialog = screen.getByRole("dialog", { name: "تأكيد الحجز" });
    expect(dialog).toHaveAccessibleDescription("سيُحجز لك مقعد في الجلسة.");
    // Focus lands inside the dialog, so the keyboard user is where the
    // conversation is.
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("closes from the labelled close control", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "افتح" }));
    await userEvent.click(screen.getByRole("button", { name: closeLabel }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "افتح" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("the close label is externalised in Arabic", () => {
    expect(closeLabel).toBe("إغلاق");
  });
});
