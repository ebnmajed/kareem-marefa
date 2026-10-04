// `ui/block-library` — REQ-UIX-112, REQ-NTF-015, DEC-093. A tap arms a tile and a tap on the armed tile disarms; the
// drag exists only when the caller passes `onDragStart`; a layout tile draws its columns from `weights` and is named by
// its label.
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { BlockLibrary } from "@/components/ui/block-library";

const blocks = [
  { key: "paragraph", label: "نص" },
  { key: "qr", label: "رمز QR" },
  { key: "social", label: "اجتماعي" },
];
const layouts = [
  { key: "1", label: "عمود واحد", weights: [1] },
  { key: "1/2", label: "عمودان، الثاني أعرض", weights: [1, 2] },
];

describe("ui/block-library", () => {
  it("★ a tap ARMS a tile (no drag needed); a tap on the armed tile disarms", () => {
    const onArm = vi.fn();
    const { rerender } = render(<BlockLibrary label="الكتل" items={blocks} armed={null} onArm={onArm} />);
    expect(screen.getByRole("group", { name: "الكتل" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "رمز QR" }));
    expect(onArm).toHaveBeenLastCalledWith("qr");
    rerender(<BlockLibrary label="الكتل" items={blocks} armed="qr" onArm={onArm} />);
    expect(screen.getByRole("button", { name: "رمز QR" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "نص" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "رمز QR" }));
    expect(onArm).toHaveBeenLastCalledWith(null);
  });

  it("is draggable only when the caller offers the drag, and the drag reports the tile", () => {
    const { container, rerender } = render(<BlockLibrary label="الكتل" items={blocks} armed={null} onArm={() => undefined} />);
    expect(container.querySelector("[draggable]")).toBeNull();
    const onDragStart = vi.fn();
    rerender(<BlockLibrary label="الكتل" items={blocks} armed={null} onArm={() => undefined} onDragStart={onDragStart} />);
    const tile = screen.getByRole("button", { name: "اجتماعي" });
    expect(tile).toHaveAttribute("draggable", "true");
    fireEvent(tile, Object.assign(createEvent.dragStart(tile), { dataTransfer: { setData: vi.fn() } }));
    expect(onDragStart.mock.calls[0]![0]).toBe("social");
  });

  it("a layout tile draws one column per weight, sized by it, and is named by its label", () => {
    const { container } = render(<BlockLibrary label="التخطيطات" variant="layouts" items={layouts} armed={null} onArm={() => undefined} />);
    const schematics = container.querySelectorAll("[data-layout-schematic]");
    expect(schematics[1]!.children).toHaveLength(2);
    expect((schematics[1]!.children[1] as HTMLElement).style.flexGrow).toBe("2");
    expect(screen.getByRole("button", { name: "عمودان، الثاني أعرض" })).toBeInTheDocument();
  });

  it("is accessible", async () => {
    const { container } = render(
      <main dir="rtl">
        <BlockLibrary label="الكتل" items={blocks} armed="qr" onArm={() => undefined} />
        <BlockLibrary label="التخطيطات" variant="layouts" items={layouts} armed={null} onArm={() => undefined} />
      </main>,
    );
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
