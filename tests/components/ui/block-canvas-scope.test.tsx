// `ui/block-canvas` inside the playground's scope — REQ-UIX-112, DEC-237 §3, DEC-093.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { BlockCanvas } from "@/components/ui/block-canvas";
import { PlayScope } from "@/components/ui/scope";

const labels = { moveUp: "لأعلى", moveDown: "لأسفل", move: "انقل", duplicate: "كرّر", remove: "احذف", drag: "اسحب", fixed: "ثابت" };
const noop = () => undefined;

describe("ui/block-canvas — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s), in semantic names only, without motion", (light) => {
    const { container } = render(
      <PlayScope light={light}>
        <div dir="rtl">
          <BlockCanvas
            label="البريد"
            width={600}
            rows={[{ id: "a", label: "عنوان", box: { left: 0, top: 0, width: 600, height: 60 } }]}
            fixed={[{ id: "f", label: "التذييل", box: { left: 0, top: 60, width: 600, height: 40 } }]}
            selectedId="a"
            onSelect={noop}
            actions={{ moveUp: noop, moveDown: noop, move: noop, duplicate: noop, remove: noop }}
            labels={labels}
            slots={{ label: "أضف هنا", inCells: false, onPlace: noop }}
          >
            <div style={{ height: 100 }} />
          </BlockCanvas>
        </div>
      </PlayScope>,
    );
    const canvas = container.querySelector("[data-slot=block-canvas]")!;
    expect(canvas.closest(".theme-play")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d|#[0-9a-f]{3,6}\b/);
    for (const own of canvas.querySelectorAll("[data-canvas-target], [data-canvas-slot], [data-handle-bar]")) {
      expect(own.className).not.toMatch(/\bpg(?:-dark|-light)?:/);
      expect(own.className).not.toMatch(/\b(?:transition|animate-|duration-|scale-)/);
    }
  });
});
