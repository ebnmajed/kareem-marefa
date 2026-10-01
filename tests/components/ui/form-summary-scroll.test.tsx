// `<FormSummary>`'s jump, wave 19 (SC 2.4.11, REQ-UIX-017). A control already on screen but under a fixed bottom bar
// is scrolled clear — and INSTANTLY: `globals.css` scrolls the document smoothly where motion is allowed, and a
// smooth scroll would land focus on a control still sliding out from under the bar (gate run 4). jsdom has no
// layout, so this proves the call, not the geometry; `tests/e2e/forms-propose.spec.ts` proves the geometry.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormSummary } from "@/components/ui/form-summary";

const original = HTMLElement.prototype.scrollIntoView;
afterEach(() => {
  HTMLElement.prototype.scrollIntoView = original;
});

function Form() {
  return (
    <form noValidate>
      <FormSummary title="تعذّر إرسال النموذج" errors={[{ fieldId: "title", label: "العنوان", message: "فضلًا أدخل عنوان موضوعك" }]} />
      <label htmlFor="title">العنوان</label>
      <input id="title" name="title" />
    </form>
  );
}

describe("FormSummary — the jump scrolls the control clear, instantly", () => {
  it("★ calls scrollIntoView on the control with { block: \"nearest\", behavior: \"instant\" }, after focusing it", async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    render(<Form />);
    await userEvent.click(screen.getByRole("link", { name: /العنوان/ }));
    const input = screen.getByRole("textbox");
    expect(document.activeElement).toBe(input);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(input);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", behavior: "instant" });
  });

  it("focuses without the browser's own scroll, so the two never fight", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    render(<Form />);
    focus.mockClear();
    await userEvent.click(screen.getByRole("link", { name: /العنوان/ }));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });
});
