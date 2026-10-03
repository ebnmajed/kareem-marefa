// `ui/editor-rail` inside the playground's scope — REQ-UIX-107, DEC-235 §4 (`DEC-NEXT-36`), DEC-237.
//
// Born inside the scope: semantic names only, no `pg:` class, in an RTL document. A vertical tablist and one tabpanel;
// a single tap selects; ↑/↓, Home and End move the selection and the focus together; a count only above 0, with its
// accessible text; the panel's heading is the selected item's label. No animation.
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import type { EditorRailItem } from "@/components/ui";
import { EditorRail } from "@/components/ui/editor-rail";
import { PlayScope } from "@/components/ui/scope";

const ITEMS: EditorRailItem[] = [
  { key: "elements", label: "العناصر", glyph: "elements" },
  { key: "fields", label: "الحقول", glyph: "fields" },
  { key: "checks", label: "الفحوصات", glyph: "checks", count: { value: 3, label: "3 ملاحظات" } },
  { key: "layers", label: "الطبقات", glyph: "layers", count: { value: 0, label: "لا شيء" } },
];

function Harness({ initial = "elements", light = false }: { initial?: string; light?: boolean }) {
  const [selected, setSelected] = useState(initial);
  return (
    <PlayScope light={light}>
      <EditorRail label="أدوات المصمّم" items={ITEMS} selected={selected} onSelect={setSelected}>
        <p>محتوى {selected}</p>
      </EditorRail>
    </PlayScope>
  );
}

describe("ui/editor-rail — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s), in semantic names only", (light) => {
    const { container } = render(<Harness light={light} />);
    expect(container.querySelector("[data-slot=editor-rail]")!.closest(".theme-play")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d|#[0-9a-f]{3,6}\b/);
    expect(container.innerHTML).not.toMatch(/\bpg(?:-dark|-light)?:/);
    expect(container.innerHTML).not.toMatch(/\b(?:transition|animate-|duration-)/);
  });

  it("is a vertical tablist with one tabpanel labelled by the selected tab, headed by its label", () => {
    render(<Harness />);
    const list = screen.getByRole("tablist", { name: "أدوات المصمّم" });
    expect(list.getAttribute("aria-orientation")).toBe("vertical");
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0].id);
    expect(panel.querySelector("h2")!.textContent).toBe("العناصر");
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1", "-1"]);
  });

  it("selects on a single tap, and the panel swaps", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: /الحقول/ }));
    expect(screen.getByRole("tab", { name: /الحقول/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("محتوى fields");
  });

  it("moves the selection and the focus with ↑, ↓, Home and End, wrapping", () => {
    render(<Harness />);
    const first = screen.getAllByRole("tab")[0];
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getAllByRole("tab")[3]);
    expect(screen.getAllByRole("tab")[3].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(screen.getAllByRole("tab")[0]);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getAllByRole("tab")[3].getAttribute("aria-selected")).toBe("true");
  });

  it("draws a count only above 0, with its accessible text", () => {
    render(<Harness />);
    expect(screen.getByRole("tab", { name: /الفحوصات/ }).textContent).toContain("3 ملاحظات");
    expect(screen.getByRole("tab", { name: /الطبقات/ }).textContent).not.toContain("لا شيء");
  });

  it("takes a heading other than the label, and an action in the heading's row", () => {
    render(
      <PlayScope>
        <EditorRail label="أدوات" items={ITEMS} selected="elements" onSelect={() => {}} panelTitle="نص · العنوان" panelAction={<button type="button">إغلاق</button>}>
          <p>x</p>
        </EditorRail>
      </PlayScope>,
    );
    expect(screen.getByRole("tabpanel").querySelector("h2")!.textContent).toBe("نص · العنوان");
    expect(screen.getByRole("button", { name: "إغلاق" })).toBeTruthy();
  });

  it("falls back to the first item when the selected key is unknown", () => {
    render(<Harness initial="layer" />);
    expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");
  });
});
