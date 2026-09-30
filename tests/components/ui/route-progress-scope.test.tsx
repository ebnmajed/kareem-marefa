// `ui/route-progress` inside the playground's scope — DEC-199 §3, REQ-UIX-050, REQ-UIX-006.
//
// Two drawn parts: the shell's bar, which is the accent inside the scope, and the
// dot inside every `ui/link`, which is the link's own colour on either ground.
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { LinkPendingReporter, RouteProgress } from "@/components/ui/route-progress";
import { PlayScope } from "@/components/ui/scope";

const source = readFileSync("src/components/ui/route-progress.tsx", "utf8");

describe("ui/route-progress — inside the scope", () => {
  it("idle, it draws nothing at all — no bar and no dot", () => {
    const { container } = render(
      <PlayScope>
        <RouteProgress />
        <LinkPendingReporter />
      </PlayScope>,
    );
    expect(container.querySelector("[data-route-progress]")).toBeNull();
    expect(container.querySelector("[data-link-pending]")).toBeNull();
  });

  it("the bar keeps its old fill and takes the accent inside the scope, after it", () => {
    expect(source).toContain('className="h-full bg-navy-950 pg:bg-accent"');
  });

  it("the dot is the link's own colour, never the accent — lime on the light ground is 1.07:1", () => {
    const dot = source.match(/data-link-pending=""\s+className="([^"]+)"/)![1];
    expect(dot).toContain("bg-current");
    expect(dot).not.toMatch(/accent|signal|navy|silver/);
  });

  it("the bar grows by transform alone, and is still under reduced motion (REQ-UIX-020)", () => {
    expect(source).toContain('{ transform: "scaleX(0.08)" }, { transform: "scaleX(0.92)" }');
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).not.toMatch(/will-change|width:/);
  });
});
