// `<ActionBar>` inside the playground's scope — REQ-UIX-057. Born inside it: semantic names only,
// and ★ never transformed, filtered or clipped (DEC-188 §5), so a moment inside it can move.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { ActionBar } from "@/components/ui/action-bar";

function scoped(dir: "rtl" | "ltr" = "rtl") {
  return render(
    <div className="theme-play" dir={dir}>
      <ActionBar
        label="إجراءات الجلسة"
        primary={<button type="button">سجّل حضورك</button>}
        secondary={[
          <button key="c" type="button">
            شهادتك
          </button>,
        ]}
      />
    </div>,
  );
}

describe("ActionBar inside the scope", () => {
  it("★ carries no transform, filter, clip or will-change of its own", () => {
    const { container } = scoped();
    for (const el of [container.querySelector('[role="group"]'), container.querySelector('[data-slot="row"]')] as HTMLElement[]) {
      expect(el.className).not.toMatch(/(?:^|\s)(?:[a-z-]+:)*(?:transform|scale-|rotate-|translate-|-?translate|filter|blur|overflow-|clip-|will-change|contain-)/);
      expect(el.style.transform).toBe("");
      expect(el.style.filter).toBe("");
    }
  });

  it("reads the scope's semantic names — the surface and its rule — and no raw colour", () => {
    const root = scoped().container.querySelector('[role="group"]') as HTMLElement;
    expect(root).toHaveClass("bg-surface", "border-t", "border-edge");
    expect(root.className).not.toMatch(/#[0-9a-f]{3,8}|(?:bg|text|border)-(?:navy|silver|lime|white|black)/i);
  });

  it("RTL and LTR: the primary is first in the DOM, so it stands at the start in both", () => {
    for (const dir of ["rtl", "ltr"] as const) {
      const { container, unmount } = scoped(dir);
      const row = container.querySelector('[data-slot="row"]') as HTMLElement;
      expect(row.firstElementChild).toHaveAttribute("data-slot", "primary");
      expect(row.className).not.toMatch(/flex-row-reverse/);
      unmount();
    }
  });

  it("is accessible inside the scope", async () => {
    const { container } = scoped();
    expect(screen.getByRole("group", { name: "إجراءات الجلسة" })).toBeInTheDocument();
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
