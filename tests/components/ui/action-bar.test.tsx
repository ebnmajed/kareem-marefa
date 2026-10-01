// `ui/action-bar` — REQ-UIX-057, `M10a.md` §7 and §10. One primary and at most two
// secondary controls, the caller's nodes; padded for the safe area; the shell's
// `data-action-bar` hook only when it is fixed.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { ActionBarProps } from "@/components/ui";
import { ActionBar } from "@/components/ui/action-bar";

function bar(props: Partial<ActionBarProps> = {}) {
  return render(
    <ActionBar
      label="إجراءات الجلسة"
      primary={<button type="button">احجز مقعدك</button>}
      secondary={[
        <button key="s" type="button" aria-label="حفظ">
          ♡
        </button>,
        <button key="h" type="button" aria-label="مشاركة">
          ↗
        </button>,
      ]}
      {...props}
    />,
  );
}

describe("ActionBar", () => {
  it("is a named group — never a landmark — holding the primary first, then the others in reading order", () => {
    bar();
    const group = screen.getByRole("group", { name: "إجراءات الجلسة" });
    const names = within(group)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names).toEqual(["احجز مقعدك", "حفظ", "مشاركة"]);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("the primary takes the free width; a secondary never grows", () => {
    const { container } = bar();
    expect(container.querySelector('[data-slot="primary"]')).toHaveClass("flex-1", "min-w-0");
    for (const s of container.querySelectorAll('[data-slot="secondary"]')) expect(s).toHaveClass("shrink-0");
  });

  it("★ fixed by default, pinned to the block end, carrying the shell's hook and the safe area", () => {
    const { container } = bar();
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveClass("fixed", "inset-x-0", "bottom-0");
    expect(root).toHaveAttribute("data-action-bar", "");
    expect(root.style.paddingBlockEnd).toContain("env(safe-area-inset-bottom");
  });

  it("★ static — the gallery's — sets no hook, so it never pads the page it sits in", () => {
    const { container } = bar({ position: "static" });
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveClass("fixed");
    expect(root).not.toHaveAttribute("data-action-bar");
  });

  it("a primary alone, and a note under the row", () => {
    const { container } = bar({ secondary: undefined, note: <a href="#help">لم تلتقط الرمز؟</a> });
    expect(container.querySelectorAll('[data-slot="secondary"]')).toHaveLength(0);
    expect(within(container.querySelector('[data-slot="note"]') as HTMLElement).getByRole("link", { name: "لم تلتقط الرمز؟" })).toBeInTheDocument();
  });

  it("hides from a breakpoint up when asked, and not otherwise", () => {
    expect(bar({ hideFrom: "md" }).container.firstElementChild).toHaveClass("md:hidden");
    expect(bar().container.firstElementChild?.className).not.toMatch(/(?:^|\s)(?:md|lg):hidden/);
  });

  it("★ a third secondary is a type error", () => {
    // @ts-expect-error — the tuple holds at most two.
    const props: ActionBarProps = { label: "x", primary: null, secondary: [1, 2, 3] };
    expect(props.label).toBe("x");
  });

  it("is accessible", async () => {
    const { container } = bar({ note: "سطر" });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
