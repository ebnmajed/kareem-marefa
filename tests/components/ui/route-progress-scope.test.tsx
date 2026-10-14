// `ui/route-progress` inside the playground's scope — DEC-199 §3, REQ-UIX-050, REQ-UIX-006, DEC-288.
//
// One drawn part since DEC-288: the dot inside every `ui/link`, which is the link's own colour on either ground.
// The bar is gone — the mark breathes instead (`shell/home-mark.tsx`, `shell/route-wait.tsx`).
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { LinkPendingReporter } from "@/components/ui/route-progress";
import { PlayScope } from "@/components/ui/scope";

const source = readFileSync("src/components/ui/route-progress.tsx", "utf8");

describe("ui/route-progress — inside the scope", () => {
  it("idle, it draws nothing at all", () => {
    const { container } = render(
      <PlayScope>
        <LinkPendingReporter />
      </PlayScope>,
    );
    expect(container.querySelector("[data-link-pending]")).toBeNull();
  });

  it("the dot is the link's own colour, never the accent — lime on the light ground is 1.07:1", () => {
    const dot = source.match(/data-link-pending=""\s+className="([^"]+)"/)![1];
    expect(dot).toContain("bg-current");
    expect(dot).not.toMatch(/accent|signal|navy|silver/);
  });

  it("draws no bar (DEC-288)", () => {
    expect(source).not.toMatch(/data-route-progress|export function RouteProgress\b/);
  });
});
