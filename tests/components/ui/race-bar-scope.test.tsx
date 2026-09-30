// `ui/race-bar` inside the playground's scope — DEC-199 §3 – §4, REQ-UIX-050, REQ-UIX-038.
//
// `race-bar.test.tsx` never speaks of the scope; the gate found that. Written by
// the lead as `scoring`'s custodian (wave 17).
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import type { RaceBarProps } from "@/components/ui";
import { RaceBar } from "@/components/ui/race-bar";
import { PlayScope } from "@/components/ui/scope";

const BASE: RaceBarProps = { companyName: "مواهب", teamColor: "#35d0ff", value: "420", metricLabel: "مجموع النقاط", fraction: 0.6 };

function mount(props: Partial<RaceBarProps>, light = false) {
  return render(
    <PlayScope light={light}>
      <ul>
        <RaceBar {...BASE} {...props} />
      </ul>
    </PlayScope>,
  ).container;
}

describe("ui/race-bar — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s) and names no raw palette colour", (light) => {
    const container = mount({}, light);
    expect(container.querySelector("li")!.closest(".theme-play")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d/);
  });

  it("the viewer's own company is framed in the accent — the heading ink on the light ground", () => {
    const own = mount({ ownLabel: "شركتك" }).querySelector("li")!;
    expect(own.getAttribute("class")).toContain("border-accent");
    expect(own.getAttribute("class")).toContain("pg-light:border-fg-heading");
    expect(mount({}).querySelector("li")!.getAttribute("class")).toContain("border-transparent");
  });

  it("the team colour reaches the DOM as --team on an element, never as a class or a raw hex in one", () => {
    const container = mount({});
    expect(container.innerHTML).toContain("--team");
    expect(container.innerHTML).not.toMatch(/class="[^"]*#35d0ff/);
  });

  it("the bar grows by transform, never by width, and nothing scales on hover", () => {
    const html = mount({}).innerHTML;
    expect(html).not.toMatch(/hover:scale|style="[^"]*width:/);
  });
});
