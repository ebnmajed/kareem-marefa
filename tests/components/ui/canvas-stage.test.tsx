// `ui/canvas-stage` — REQ-UIX-110, DEC-237 §3, DEC-096. The fit (moved here from `canvas.tsx`), a zoom that is a
// number, the rulers counted from the content's START edge in its own direction, the grid, and the toggles as
// `aria-pressed` buttons. The stage hands the child its scale and draws nothing of a document.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasStage } from "@/components/ui/canvas-stage";

afterEach(() => vi.unstubAllGlobals());

function mount(props: Partial<Parameters<typeof CanvasStage>[0]> = {}) {
  const onScaleChange = vi.fn();
  const child = vi.fn((s: number) => <div data-testid="child" data-scale={s} />);
  const utils = render(
    <CanvasStage label="اللوحة" contentWidth={1000} contentHeight={500} zoom={0.5} onScaleChange={onScaleChange} {...props}>
      {child}
    </CanvasStage>,
  );
  return { ...utils, onScaleChange, child };
}

describe("ui/canvas-stage", () => {
  it("draws the child at the zoom it is given, in a box of that size, and reports the scale", () => {
    const { container, onScaleChange } = mount();
    expect(screen.getByTestId("child").dataset.scale).toBe("0.5");
    const box = container.querySelector<HTMLElement>("[data-stage-viewport] .relative")!;
    expect(box.style.width).toBe("500px");
    expect(box.style.height).toBe("250px");
    expect(onScaleChange).toHaveBeenLastCalledWith(0.5);
  });

  it("fits to the viewport, by width and height, never above 100 %", () => {
    let callback: (() => void) | null = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { container } = mount({ zoom: "fit" });
    const viewport = container.querySelector<HTMLElement>("[data-stage-viewport]")!;
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 564 });
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 364 });
    act(() => callback!());
    // (564 − 64) / 1000 = 0.5 by width; (364 − 64) / 500 = 0.6 by height — the smaller wins.
    expect(screen.getByTestId("child").dataset.scale).toBe("0.5");
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 5064 });
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 5064 });
    act(() => callback!());
    expect(screen.getByTestId("child").dataset.scale).toBe("1");
  });

  it("numbers the rulers from the content's start edge — on an RTL document 0 is at the right (DEC-096)", () => {
    const { container } = mount({ rulers: { direction: "rtl", step: 250 } });
    const marks = Array.from(container.querySelectorAll<HTMLElement>("[data-stage-rulers] > span:first-child > span"));
    expect(marks.map((m) => m.textContent)).toEqual(["0", "250", "500", "750", "1000"]);
    expect(marks[0]!.style.left).toBe("500px");
    expect(marks[4]!.style.left).toBe("0px");
    const ltr = render(
      <CanvasStage label="ب" contentWidth={1000} zoom={0.5} rulers={{ direction: "ltr", step: 500 }}>
        {() => null}
      </CanvasStage>,
    ).container.querySelectorAll<HTMLElement>("[data-stage-rulers] > span:first-child > span");
    expect(ltr[0]!.style.left).toBe("0px");
  });

  it("draws a grid only when asked, and the toggles are pressed buttons that report the next state", () => {
    const onPressedChange = vi.fn();
    const { container } = mount({ grid: { step: 100 }, toggles: [{ key: "grid", label: "الشبكة", pressed: true, onPressedChange }] });
    expect(container.querySelector<HTMLElement>("[data-stage-grid]")!.style.backgroundSize).toBe("50px 50px");
    const toggle = screen.getByRole("button", { name: "الشبكة" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(onPressedChange).toHaveBeenCalledWith(false);
    expect(mount().container.querySelector("[data-stage-grid]")).toBeNull();
  });
});
