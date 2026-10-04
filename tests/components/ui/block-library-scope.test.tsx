// `ui/block-library` inside the playground's scope — REQ-UIX-112, DEC-093.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { BlockLibrary } from "@/components/ui/block-library";
import { PlayScope } from "@/components/ui/scope";

describe("ui/block-library — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s), in semantic names only, without motion", (light) => {
    const { container } = render(
      <PlayScope light={light}>
        <div dir="rtl">
          <BlockLibrary label="الكتل" items={[{ key: "p", label: "نص" }, { key: "q", label: "رمز QR" }]} armed="q" onArm={() => undefined} />
          <BlockLibrary label="التخطيطات" variant="layouts" items={[{ key: "1/1", label: "عمودان", weights: [1, 1] }]} armed={null} onArm={() => undefined} />
        </div>
      </PlayScope>,
    );
    expect(container.querySelector("[data-slot=block-library]")!.closest(".theme-play")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d|#[0-9a-f]{3,6}\b/);
    for (const own of container.querySelectorAll("[data-slot=block-library] button")) {
      expect(own.className).not.toMatch(/\bpg(?:-dark|-light)?:/);
      expect(own.className).not.toMatch(/\b(?:transition|animate-|duration-|scale-)/);
    }
    // Pressed is a border in a semantic colour, never a motion.
    expect(container.querySelector("[aria-pressed=true]")!.className).toContain("border-accent");
  });
});
