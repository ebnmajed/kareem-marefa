// `ui/level-card` inside the playground's scope — DEC-199 §3 – §4, REQ-UIX-050, REQ-UIX-039.
//
// `level-card.test.tsx` never speaks of the scope; the gate found that. The card
// was born inside the scope and reads semantic names only. Written by the lead as
// `scoring`'s custodian (wave 17).
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import type { LevelFace } from "@/components/ui";
import { LevelCard } from "@/components/ui/level-card";
import { PlayScope } from "@/components/ui/scope";

const HELD: LevelFace = { tier: 3, name: "صاحب أثر", caption: "مستواك الحالي", unlocks: ["أولوية الحجز"] };
const REACHED: LevelFace = { tier: 4, name: "كريم معرفة", caption: "مستوى جديد", unlocks: [] };
const LABELS = { unlocksLabel: "يفتح لك", noUnlocksLabel: "لا امتياز مرتبط بهذا المستوى بعد" };

function mount(light = false, reached?: LevelFace) {
  return render(
    <PlayScope light={light}>
      <LevelCard level={HELD} reached={reached} {...LABELS} />
    </PlayScope>,
  ).container;
}

describe("ui/level-card — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s), in semantic names only", (light) => {
    const container = mount(light, REACHED);
    expect(container.querySelector("[role='group']")!.closest(".theme-play")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d|class="[^"]*#[0-9a-f]{3,6}/);
  });

  it("the level's name is the display face, on the panel radius", () => {
    const html = mount().innerHTML;
    expect(html).toContain("font-display");
    expect(html).toContain("rounded-panel");
  });

  it("carries no class for the scope of its own: it was born inside it", () => {
    expect(mount(false, REACHED).querySelector("[role='group']")!.outerHTML).not.toMatch(/\bpg(?:-dark|-light)?:/);
  });

  it("says plainly that a level unlocks nothing, rather than invent a privilege (DEC-186 §7)", () => {
    expect(mount(false, REACHED).textContent).toContain("لا امتياز مرتبط بهذا المستوى بعد");
  });
});
