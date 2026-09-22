// SCR-057's canvas overlay — wave 13, REQ-DSG-028, DEC-096, DEC-178.
//
// ★ THE EXEMPTION, PINNED. The overlay positions in PHYSICAL `left`/`top`
// computed from the DOCUMENT's direction; the iframe is pinned at its left and
// scaled from its top-left. Both are asserted in all four console × document
// pairs, because the pair that breaks — an Arabic poster in an English console —
// is dormant until English ships (W13.0 item 4: the iframe WAS off by W·(1 − s)
// in two of the four).
//
// And the pointer model's contract with the editor: a tap selects, shift or
// «تحديد متعدّد» adds, a drag hands over ONE set of frames on release, arrows
// nudge on the VISUAL axis, «ضع بنقرة» turns the next tap into a logical point.
import type React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DesignDocument, Layer } from "@kareem/designer-runtime";
import { DesignerCanvas, type DesignerCanvasProps } from "@/components/designer/canvas";
import arDesigner from "@/messages/ar/designer.json";
import enDesigner from "@/messages/en/designer.json";

beforeAll(() => {
  // jsdom has no ResizeObserver; the canvas then keeps its initial 0.4 scale.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

const SCALE = 0.4;

const shape = (id: string, frame: Layer["frame"], extra: Partial<Layer> = {}): Layer =>
  ({ id, name: id, kind: "shape", frame, shape: { type: "rect", fill: "{{brand.surface}}" }, ...extra }) as Layer;

const doc = (direction: "rtl" | "ltr", layers: Layer[]): DesignDocument => ({
  schemaVersion: 1,
  purpose: "poster",
  master: { width: 1080, height: 1350, unit: "px" },
  direction,
  layers,
});

function mount(consoleLocale: "ar" | "en", props: Partial<DesignerCanvasProps> & { document: DesignDocument }) {
  const messages = consoleLocale === "ar" ? arDesigner : enDesigner;
  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <NextIntlClientProvider locale={consoleLocale} messages={messages}>
      <div dir={consoleLocale === "ar" ? "rtl" : "ltr"}>{children}</div>
    </NextIntlClientProvider>
  );
  const handlers = {
    onSelect: vi.fn(),
    onFrames: vi.fn(),
    onNudge: vi.fn(),
    onNudgeEnd: vi.fn(),
    onPlace: vi.fn(),
    onMarquee: vi.fn(),
  };
  const utils = render(
    <DesignerCanvas
      bindings={{}}
      faces={[]}
      origin="http://localhost:3000"
      selectedLayerIds={[]}
      lockedLayerIds={[]}
      placeholderLabel={(b) => b}
      preset="master"
      showOverlays={false}
      {...handlers}
      {...props}
    />,
    { wrapper: Wrap },
  );
  return { ...utils, handlers };
}

const layerButton = (name: string) => screen.getByRole("button", { name: new RegExp(name) });

describe("★ DEC-096's exemption — physical positions from the DOCUMENT's direction", () => {
  const cases = [
    ["ar", "rtl"],
    ["en", "rtl"],
    ["ar", "ltr"],
    ["en", "ltr"],
  ] as const;

  it.each(cases)("a %s console showing an %s document puts the layer where the document says", (consoleLocale, direction) => {
    mount(consoleLocale, { document: doc(direction, [shape("l_a", { x: 80, y: 100, w: 300, h: 50 })]) });
    const b = layerButton("l_a");
    // RTL: x is measured from the right, so the left edge is 1080 − 80 − 300.
    const left = direction === "rtl" ? 700 : 80;
    expect(b.style.left).toBe(`${left * SCALE}px`);
    expect(b.style.top).toBe(`${100 * SCALE}px`);
  });

  it.each(cases)("a %s console showing an %s document pins the iframe at the LEFT and scales it from the top-left", (consoleLocale, direction) => {
    const { container } = mount(consoleLocale, { document: doc(direction, []) });
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    expect(frame.style.left).toBe("0px");
    expect(frame.style.transformOrigin).toBe("top left");
    expect(frame.style.insetInlineStart).toBe("");
  });

  it("a rotated layer's box carries the same rotation as the renderer — the browser hit-tests it", () => {
    mount("ar", { document: doc("rtl", [shape("l_r", { x: 80, y: 100, w: 300, h: 50, rotation: 30 })]) });
    expect(layerButton("l_r").style.rotate).toBe("30deg");
  });
});

describe("selection by tap", () => {
  const d = doc("rtl", [shape("l_a", { x: 300, y: 400, w: 100, h: 50 }), shape("l_b", { x: 600, y: 700, w: 100, h: 50 })]);

  it("a tap selects; shift adds; «تحديد متعدّد» adds without a keyboard", () => {
    const { handlers } = mount("ar", { document: d });
    fireEvent.click(layerButton("l_a"));
    expect(handlers.onSelect).toHaveBeenLastCalledWith("l_a", { additive: false });
    fireEvent.click(layerButton("l_b"), { shiftKey: true });
    expect(handlers.onSelect).toHaveBeenLastCalledWith("l_b", { additive: true });
  });

  it("with «تحديد متعدّد» on, a plain tap is additive", () => {
    const { handlers } = mount("ar", { document: d, multi: true });
    fireEvent.click(layerButton("l_a"));
    expect(handlers.onSelect).toHaveBeenLastCalledWith("l_a", { additive: true });
  });
});

describe("the pointer path — one hand-over per gesture", () => {
  const d = doc("rtl", [shape("l_a", { x: 300, y: 400, w: 100, h: 50 })]);

  it("★ a drag hands over the moved SOURCE frame once, on release — right on the screen is a smaller x on an RTL page", () => {
    const { handlers } = mount("ar", { document: d, source: d, selectedLayerIds: ["l_a"] });
    const b = layerButton("l_a");
    fireEvent.pointerDown(b, { pointerId: 1, button: 0, clientX: 0, clientY: 0, pointerType: "mouse" });
    fireEvent.pointerMove(b, { pointerId: 1, clientX: 20, clientY: 0, pointerType: "mouse" });
    fireEvent.pointerMove(b, { pointerId: 1, clientX: 40, clientY: 0, pointerType: "mouse" });
    expect(handlers.onFrames).not.toHaveBeenCalled();
    fireEvent.pointerUp(b, { pointerId: 1, clientX: 40, clientY: 0, pointerType: "mouse" });
    expect(handlers.onFrames).toHaveBeenCalledTimes(1);
    // 40 screen px at 0.4 is 100 document px to the right.
    expect(handlers.onFrames.mock.calls[0]?.[0]).toEqual({ l_a: { x: 200, y: 400, w: 100, h: 50 } });
  });

  it("a press that barely moves is a tap: nothing is handed over", () => {
    const { handlers } = mount("ar", { document: d, source: d, selectedLayerIds: ["l_a"] });
    const b = layerButton("l_a");
    fireEvent.pointerDown(b, { pointerId: 1, button: 0, clientX: 0, clientY: 0, pointerType: "mouse" });
    fireEvent.pointerMove(b, { pointerId: 1, clientX: 1, clientY: 1, pointerType: "mouse" });
    fireEvent.pointerUp(b, { pointerId: 1, clientX: 1, clientY: 1, pointerType: "mouse" });
    expect(handlers.onFrames).not.toHaveBeenCalled();
  });

  it("without a source document (a derived preset, or no right to edit) nothing drags and no handle is drawn", () => {
    const { handlers, container } = mount("ar", { document: d, selectedLayerIds: ["l_a"] });
    const b = layerButton("l_a");
    fireEvent.pointerDown(b, { pointerId: 1, button: 0, clientX: 0, clientY: 0, pointerType: "mouse" });
    fireEvent.pointerMove(b, { pointerId: 1, clientX: 40, clientY: 0, pointerType: "mouse" });
    fireEvent.pointerUp(b, { pointerId: 1, clientX: 40, clientY: 0, pointerType: "mouse" });
    expect(handlers.onFrames).not.toHaveBeenCalled();
    expect(container.querySelectorAll("[data-handle]")).toHaveLength(0);
  });

  it("handles for one editable layer — eight and a knob — and none for a locked one", () => {
    const { container, unmount } = mount("ar", { document: d, source: d, selectedLayerIds: ["l_a"] });
    // 100 × 50 at 0.4 is 40 × 20: too small for any handle (the fields are the path).
    expect(container.querySelectorAll("[data-handle]")).toHaveLength(0);
    unmount();
    const big = doc("rtl", [shape("l_a", { x: 100, y: 100, w: 400, h: 300 })]);
    const again = mount("ar", { document: big, source: big, selectedLayerIds: ["l_a"] });
    expect(again.container.querySelectorAll("[data-handle]")).toHaveLength(9);
    again.unmount();
    const locked = mount("ar", { document: big, source: big, selectedLayerIds: ["l_a"], lockedLayerIds: ["l_a"] });
    expect(locked.container.querySelectorAll("[data-handle]")).toHaveLength(0);
  });
});

describe("the keyboard and the tap-to-place path", () => {
  const d = doc("rtl", [shape("l_a", { x: 300, y: 400, w: 100, h: 50 })]);

  it("★ arrows nudge on the VISUAL axis — 1 px, 10 with shift — and the release ends the burst", () => {
    const { handlers } = mount("ar", { document: d, source: d, selectedLayerIds: ["l_a"] });
    const b = layerButton("l_a");
    fireEvent.keyDown(b, { key: "ArrowRight" });
    expect(handlers.onNudge).toHaveBeenLastCalledWith(1, 0);
    fireEvent.keyDown(b, { key: "ArrowUp", shiftKey: true });
    expect(handlers.onNudge).toHaveBeenLastCalledWith(0, -10);
    fireEvent.keyUp(b, { key: "ArrowUp" });
    expect(handlers.onNudgeEnd).toHaveBeenCalledTimes(1);
  });

  it("«ضع بنقرة»: the next tap is a point in LOGICAL coordinates, not a selection", () => {
    const { handlers } = mount("ar", { document: d, source: d, selectedLayerIds: ["l_a"], placing: true });
    // jsdom's boxes are at 0,0: a tap at 40,80 is 100,200 physical — x 980 on an RTL page.
    fireEvent.click(layerButton("l_a"), { clientX: 40, clientY: 80 });
    expect(handlers.onPlace).toHaveBeenCalledWith({ x: 980, y: 200 });
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });
});
