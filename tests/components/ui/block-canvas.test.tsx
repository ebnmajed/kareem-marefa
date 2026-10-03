// `ui/block-canvas` — REQ-UIX-112, DEC-237 §3, DEC-093. An overlay over its child: a tap selects; the handle bar's ▲▼
// and «انقل» are the path and are described by the target's label; slots place what is armed, between rows and inside
// columns; the grip and the drop are the enhancement; the fixed footer is never a control.
import { createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { BlockCanvas } from "@/components/ui/block-canvas";
import type { BlockCanvasProps } from "@/components/ui";

const labels = { moveUp: "انقل لأعلى", moveDown: "انقل لأسفل", move: "انقل", duplicate: "كرّر", remove: "احذف", drag: "اسحب", fixed: "ثابت" };
const rows: BlockCanvasProps["rows"] = [
  { id: "h", label: "عنوان: جلستك غدًا", box: { left: 0, top: 0, width: 600, height: 60 } },
  {
    id: "row",
    label: "تخطيط 1/2",
    box: { left: 0, top: 60, width: 600, height: 120 },
    cells: [
      { box: { left: 400, top: 60, width: 200, height: 120 }, blocks: [{ id: "p", label: "فقرة: يمين", box: { left: 400, top: 60, width: 200, height: 60 } }] },
      { box: { left: 0, top: 60, width: 392, height: 120 }, blocks: [] },
    ],
  },
  { id: "b", label: "زر: افتح الجلسة", box: { left: 0, top: 180, width: 600, height: 60 } },
];

function mount(extra: Partial<BlockCanvasProps> = {}) {
  const handlers = { onSelect: vi.fn(), moveUp: vi.fn(), moveDown: vi.fn(), move: vi.fn(), duplicate: vi.fn(), remove: vi.fn(), onPlace: vi.fn(), onCancel: vi.fn() };
  const utils = render(
    <main dir="rtl">
      <BlockCanvas
        label="البريد"
        width={600}
        rows={rows}
        fixed={[{ id: "footer", label: "التذييل", box: { left: 0, top: 240, width: 600, height: 40 } }]}
        selectedId={null}
        onSelect={handlers.onSelect}
        actions={{ moveUp: handlers.moveUp, moveDown: handlers.moveDown, move: handlers.move, duplicate: handlers.duplicate, remove: handlers.remove }}
        labels={labels}
        {...extra}
      >
        <div data-testid="frame" style={{ height: 280 }} />
      </BlockCanvas>
    </main>,
  );
  return { ...utils, handlers };
}

const bar = (container: HTMLElement, label: string) =>
  within([...container.querySelectorAll<HTMLElement>("[data-handle-bar]")].find((el) => el.getAttribute("aria-label") === label)!);

describe("ui/block-canvas", () => {
  it("draws its child, and lays each target at the box it was handed — physical px from the frame (DEC-096)", () => {
    const { container } = mount();
    expect(screen.getByTestId("frame")).toBeInTheDocument();
    const targets = container.querySelectorAll<HTMLElement>("[data-canvas-target]");
    expect(targets).toHaveLength(4); // three rows and the block inside a column
    expect(targets[1]!.style.top).toBe("60px");
    expect(targets[3]!.style.left).toBe("400px");
  });

  it("a tap selects a row or a block in a column; a tap on the selected one clears it", () => {
    const { handlers, rerender } = mount();
    fireEvent.click(screen.getByRole("button", { name: "فقرة: يمين" }));
    expect(handlers.onSelect).toHaveBeenLastCalledWith("p");
    rerender(
      <main dir="rtl">
        <BlockCanvas label="البريد" width={600} rows={rows} selectedId="p" onSelect={handlers.onSelect} labels={labels}>
          <div />
        </BlockCanvas>
      </main>,
    );
    expect(screen.getByRole("button", { name: "فقرة: يمين" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "فقرة: يمين" }));
    expect(handlers.onSelect).toHaveBeenLastCalledWith(null);
  });

  it("★ the handle bar's ▲▼ move one step and are disabled at the ends; «انقل», duplicate and delete act on the target", () => {
    const { container, handlers } = mount({ selectedId: "h" });
    const first = bar(container, "عنوان: جلستك غدًا");
    expect(first.getByRole("button", { name: "انقل لأعلى" })).toBeDisabled();
    fireEvent.click(first.getByRole("button", { name: "انقل لأسفل" }));
    expect(handlers.moveDown).toHaveBeenCalledWith("h");
    fireEvent.click(first.getByRole("button", { name: "انقل" }));
    expect(handlers.move).toHaveBeenCalledWith("h");
    fireEvent.click(first.getByRole("button", { name: "كرّر" }));
    expect(handlers.duplicate).toHaveBeenCalledWith("h");
    fireEvent.click(first.getByRole("button", { name: "احذف" }));
    expect(handlers.remove).toHaveBeenCalledWith("h");
    expect(bar(container, "زر: افتح الجلسة").getByRole("button", { name: "انقل لأسفل" })).toBeDisabled();
  });

  it("each control is described by its target's label, so twelve «انقل لأعلى» are not alike by ear", () => {
    const { container } = mount();
    const up = bar(container, "زر: افتح الجلسة").getByRole("button", { name: "انقل لأعلى" });
    expect(document.getElementById(up.getAttribute("aria-describedby")!)!.textContent).toBe("زر: افتح الجلسة");
  });

  it("the selected target's bar is shown; another's appears on hover OR keyboard focus, never hover alone", () => {
    const { container } = mount({ selectedId: "b" });
    expect(container.querySelector('[data-handle-bar][aria-label="زر: افتح الجلسة"]')!.className).toMatch(/(^|\s)flex(\s|$)/);
    const other = container.querySelector('[data-handle-bar][aria-label="عنوان: جلستك غدًا"]')!.className;
    expect(other).toContain("hidden");
    expect(other).toContain("group-focus-within:flex");
  });

  it("★ armed: a slot between every pair of rows and after the last; a tap places there", () => {
    const { container, handlers } = mount({ slots: { label: "أضف هنا", inCells: false, onPlace: vi.fn((at) => handlers.onPlace(at)) } });
    const between = container.querySelectorAll("[data-canvas-slot]");
    expect(between).toHaveLength(rows.length + 1);
    fireEvent.click(between[2]!);
    expect(handlers.onPlace).toHaveBeenCalledWith({ index: 2 });
  });

  it("with a block armed, columns get their own slots — an empty column one, a filled column one per edge", () => {
    const onPlace = vi.fn();
    const { container } = mount({ slots: { label: "أضف هنا", inCells: true, onPlace, describe: (at) => ("rowId" in at ? `في العمود ${at.column + 1}` : `بين الصفوف ${at.index}`) } });
    expect(container.querySelectorAll("[data-canvas-slot]")).toHaveLength(rows.length + 1 + 2 + 1);
    fireEvent.click(screen.getByRole("button", { name: "في العمود 2" }));
    expect(onPlace).toHaveBeenCalledWith({ rowId: "row", column: 1, index: 0 });
  });

  it("Escape cancels what is armed", () => {
    const onCancel = vi.fn();
    mount({ slots: { label: "أضف هنا", inCells: false, onPlace: vi.fn(), onCancel } });
    fireEvent.keyDown(screen.getAllByRole("button", { name: "أضف هنا" })[0]!, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("no slots and no grip unless offered; the grip is aria-hidden and a drop on a slot reports where", () => {
    const { container, rerender } = mount();
    expect(container.querySelector("[data-canvas-slot]")).toBeNull();
    expect(container.querySelector("[data-handle-grip]")).toBeNull();
    const onRowDragStart = vi.fn();
    const onDropAt = vi.fn();
    rerender(
      <main dir="rtl">
        <BlockCanvas
          label="البريد"
          width={600}
          rows={rows}
          selectedId="h"
          onSelect={() => undefined}
          actions={{ moveUp: vi.fn(), moveDown: vi.fn(), move: vi.fn(), duplicate: vi.fn(), remove: vi.fn() }}
          labels={labels}
          slots={{ label: "أفلت هنا", inCells: false, onPlace: vi.fn() }}
          onRowDragStart={onRowDragStart}
          onDropAt={onDropAt}
        >
          <div />
        </BlockCanvas>
      </main>,
    );
    const grip = container.querySelector<HTMLElement>("[data-handle-grip]")!;
    expect(grip).toHaveAttribute("aria-hidden", "true");
    fireEvent(grip, Object.assign(createEvent.dragStart(grip), { dataTransfer: { setData: vi.fn() } }));
    expect(onRowDragStart.mock.calls[0]![0]).toBe("h");
    fireEvent.drop(container.querySelectorAll("[data-canvas-slot]")[1]!);
    expect(onDropAt.mock.calls[0]![0]).toEqual({ index: 1 });
  });

  it("the fixed footer is labelled and never a control", () => {
    const { container } = mount();
    const fixed = container.querySelector("[data-canvas-fixed]")!;
    expect(fixed).toHaveAttribute("aria-hidden", "true");
    expect(fixed.querySelector("button")).toBeNull();
  });

  it("is accessible, armed and selected", async () => {
    const { container } = mount({ selectedId: "row", slots: { label: "أضف هنا", inCells: true, onPlace: vi.fn() } });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
