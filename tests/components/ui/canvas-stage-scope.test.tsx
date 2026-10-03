// `ui/canvas-stage` inside the playground's scope — REQ-UIX-110, DEC-237 §3, DEC-096.
//
// Born inside the scope: semantic names only, no `pg:` class, no motion, in an RTL document. A named region; it draws
// nothing of a document — the child gets the scale and draws itself.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { CanvasStage } from "@/components/ui/canvas-stage";
import { PlayScope } from "@/components/ui/scope";

describe("ui/canvas-stage — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s), in semantic names only, without motion", (light) => {
    const { container } = render(
      <PlayScope light={light}>
        <div dir="rtl">
          <CanvasStage
            label="اللوحة"
            contentWidth={1080}
            contentHeight={1350}
            zoom={0.5}
            rulers={{ direction: "rtl", step: 270 }}
            grid={{ step: 135 }}
            toggles={[{ key: "safe", label: "منطقة الأمان", pressed: true, onPressedChange: () => undefined }]}
          >
            {(s) => <div data-testid="child" style={{ width: 1080 * s }} />}
          </CanvasStage>
        </div>
      </PlayScope>,
    );
    expect(container.querySelector("[data-slot=canvas-stage]")!.closest(".theme-play")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d|#[0-9a-f]{3,6}\b/);
    expect(container.innerHTML).not.toMatch(/\bpg(?:-dark|-light)?:/);
    expect(container.innerHTML).not.toMatch(/\b(?:transition|animate-|duration-)/);
    expect(screen.getByRole("region", { name: "اللوحة" })).toBeInTheDocument();
  });
});
