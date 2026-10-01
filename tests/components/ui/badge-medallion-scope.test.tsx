// `ui/badge-medallion` inside the playground's scope — REQ-UIX-064, REQ-UIX-050, DEC-199 §3 – §4.
//
// Born inside the scope: semantic names and the constants' fills only, no `pg:` class, in an RTL
// document (the components project's), the name centred under its disc.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { BadgeMedallion } from "@/components/ui/badge-medallion";
import { PlayScope } from "@/components/ui/scope";

function mount(light = false) {
  return render(
    <PlayScope light={light}>
      <BadgeMedallion name="مُقدِّم مُقيَّم" fill="violet" description="متوسط تقييم 4.5 فأعلى" />
      <BadgeMedallion name="سفير المعرفة" fill={{ level: 5 }} size="sm" />
    </PlayScope>,
  ).container;
}

describe("ui/badge-medallion — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s), in semantic names only", (light) => {
    const container = mount(light);
    const block = container.querySelector("[data-slot=badge-medallion]")!;
    expect(block.closest(".theme-play")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d|class="[^"]*#[0-9a-f]{3,6}/);
  });

  it("carries no class for the scope of its own: it was born inside it", () => {
    expect(mount().innerHTML).not.toMatch(/\bpg(?:-dark|-light)?:/);
  });

  it("the disc is a pill on its own fill; the name is the scope's heading colour, centred", () => {
    const container = mount();
    const disc = container.querySelector("[data-slot=disc]")!;
    expect(disc.className).toContain("rounded-pill");
    expect(disc.className).toContain("bg-[var(--medallion)]");
    expect(container.querySelector("bdi")!.parentElement!.className).toMatch(/text-center.*text-fg-heading|text-fg-heading.*text-center/);
    expect(document.documentElement.dir).toBe("rtl");
  });
});
