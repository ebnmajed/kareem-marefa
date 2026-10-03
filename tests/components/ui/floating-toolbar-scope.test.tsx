// `ui/floating-toolbar` inside the playground's scope — REQ-UIX-107, DEC-235 §4 (`DEC-NEXT-36`), DEC-096, DEC-237.
//
// Born inside the scope: semantic names only, no `pg:` class, no animation, in an RTL document. `role="toolbar"`, one
// tab stop, ←/→ on the VISUAL axis (in RTL ← is the next control), Home/End; physical `left`/`top` from the anchor,
// above the target and flipped below when there is no room.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { FloatingToolbar } from "@/components/ui/floating-toolbar";
import { PlayScope } from "@/components/ui/scope";

function mount(anchor = { left: 100, top: 200, width: 300, height: 60 }, light = false) {
  return render(
    <PlayScope light={light}>
      <div dir="rtl" style={{ position: "relative" }}>
        <FloatingToolbar label="تنسيق النص" anchor={anchor}>
          <button type="button">الخط</button>
          <button type="button">الحجم</button>
          <button type="button">اللون</button>
          <button type="button">المحاذاة</button>
          <button type="button">ربط</button>
        </FloatingToolbar>
      </div>
    </PlayScope>,
  );
}

describe("ui/floating-toolbar — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s), in semantic names only, without motion", (light) => {
    const { container } = mount(undefined, light);
    expect(container.querySelector("[data-slot=floating-toolbar]")!.closest(".theme-play")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d|#[0-9a-f]{3,6}\b/);
    expect(container.innerHTML).not.toMatch(/\bpg(?:-dark|-light)?:/);
    expect(container.innerHTML).not.toMatch(/\b(?:transition|animate-|duration-)/);
  });

  it("is one tab stop, named", () => {
    mount();
    const bar = screen.getByRole("toolbar", { name: "تنسيق النص" });
    const tabbable = Array.from(bar.querySelectorAll("button")).filter((b) => b.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
  });

  it("moves on the visual axis in RTL: ← is the next control, → the previous, Home and End jump", () => {
    mount();
    const buttons = screen.getAllByRole("button");
    buttons[0].focus();
    fireEvent.keyDown(buttons[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.keyDown(buttons[1], { key: "ArrowRight" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0], { key: "End" });
    expect(document.activeElement).toBe(buttons[4]);
    expect(buttons[4].getAttribute("tabindex")).toBe("0");
    expect(buttons[0].getAttribute("tabindex")).toBe("-1");
    fireEvent.keyDown(buttons[4], { key: "Home" });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("sits above its target, centred, in physical px — and flips below when there is no room above", () => {
    const { container, unmount } = mount();
    const bar = container.querySelector<HTMLElement>("[data-slot=floating-toolbar]")!;
    expect(bar.dataset.placement).toBe("above");
    expect(bar.style.left).toBe("250px");
    expect(bar.style.top).toBe("192px");
    unmount();
    const low = mount({ left: 0, top: 10, width: 100, height: 40 }).container.querySelector<HTMLElement>("[data-slot=floating-toolbar]")!;
    expect(low.dataset.placement).toBe("below");
    expect(low.style.top).toBe("58px");
  });

  it("keeps the gap it is given — the designer clears its rotation knob", () => {
    const bar = render(
      <div style={{ position: "relative" }}>
        <FloatingToolbar label="تنسيق" anchor={{ left: 0, top: 300, width: 100, height: 40 }} offset={40}>
          <button type="button">الخط</button>
        </FloatingToolbar>
      </div>,
    ).container.querySelector<HTMLElement>("[data-slot=floating-toolbar]")!;
    expect(bar.style.top).toBe("260px");
  });
});
