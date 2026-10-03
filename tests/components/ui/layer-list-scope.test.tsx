// `ui/layer-list` inside the playground's scope — REQ-DSG-028, DEC-093 path 2, DEC-235 §5.1.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { LayerList } from "@/components/ui/layer-list";
import { PlayScope } from "@/components/ui/scope";

const labels = { forward: "إلى الأمام", backward: "إلى الخلف", show: "إظهار", hide: "إخفاء", locked: "مقفلة", hidden: "مخفية", empty: "لا طبقات", handle: "اسحب" };

describe("ui/layer-list — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s), in semantic names only, without motion", (light) => {
    const { container } = render(
      <PlayScope light={light}>
        <div dir="rtl">
          <LayerList
            label="الطبقات"
            items={[
              { id: "a", name: "العنوان", kindLabel: "نص", selected: true },
              { id: "b", name: "الشعار", kindLabel: "صورة", selected: false, locked: true },
            ]}
            onSelect={() => undefined}
            onMove={() => undefined}
            onReorder={() => undefined}
            onToggleHidden={() => undefined}
            labels={labels}
          />
        </div>
      </PlayScope>,
    );
    expect(container.querySelector("[data-slot=layer-list]")!.closest(".theme-play")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d|#[0-9a-f]{3,6}\b/);
    // Its own rows carry no `pg:` class; the buttons it composes are `variant`s and carry theirs.
    expect(container.querySelector("[data-slot=layer-list] li > div")!.className).not.toMatch(/\bpg(?:-dark|-light)?:/);
    for (const own of container.querySelectorAll("[data-slot=layer-list] li > div, [data-slot=layer-list] [aria-pressed], [data-layer-grip]")) {
      expect(own.className).not.toMatch(/\b(?:transition|animate-|duration-)/);
    }
  });
});
