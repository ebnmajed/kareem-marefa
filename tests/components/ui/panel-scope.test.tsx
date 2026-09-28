// `<Panel>` inside the playground's scope — DEC-183, DEC-186 §2 – §3, REQ-UIX-030, DEC-073.
//
// New cases live here, never in `panel.test.tsx`, which is evidence (DEC-186 §9).
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { Tone } from "@/components/ui";
import { Panel } from "@/components/ui/panel";
import { contrastRatio } from "@/lib/brand/contrast";

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

// The class strings as they stood before wave 15.
const BASE = "rounded-card border p-4".split(" ");
const BEFORE: Record<Tone, string> = {
  neutral: "border-edge bg-surface",
  info: "border-edge bg-silver-100",
  success: "border-success/30 bg-success-bg",
  live: "border-live/30 bg-live-bg",
  ended: "border-edge bg-ended-bg",
  error: "border-error-border/40 bg-error-bg",
};
const ADDED: Record<Tone, string[]> = {
  neutral: ["pg:rounded-panel"],
  info: ["pg:rounded-panel", "pg:bg-raised"],
  success: ["pg:rounded-panel", "pg-dark:border-success-on-dark/50", "pg-dark:bg-transparent"],
  live: ["pg:rounded-panel", "pg-dark:border-live-on-dark/50", "pg-dark:bg-transparent"],
  ended: ["pg:rounded-panel", "pg-dark:border-ended-on-dark/50", "pg-dark:bg-transparent"],
  error: ["pg:rounded-panel", "pg-dark:border-error-on-dark/50", "pg-dark:bg-transparent"],
};

describe("Panel — the scope adds, it never replaces", () => {
  it.each(Object.keys(BEFORE) as Tone[])("%s keeps every class it had, and adds only its scope classes", (tone) => {
    const { container } = render(<Panel tone={tone}>محتوى</Panel>);
    const got = classes(container.firstElementChild);
    const before = [...BASE, ...BEFORE[tone].split(" ")];
    for (const cls of before) expect(got, cls).toContain(cls);
    expect(got.filter((c) => !before.includes(c)).sort()).toEqual([...ADDED[tone]].sort());
  });

  it("a toned panel never keeps a near-white fill under the dark scope's light text", () => {
    for (const tone of ["success", "live", "ended", "error"] as const) {
      const { container, unmount } = render(<Panel tone={tone}>محتوى</Panel>);
      expect(container.firstElementChild, tone).toHaveClass("pg-dark:bg-transparent");
      unmount();
    }
  });

  it("is accessible inside the scope, every tone", async () => {
    const { container } = render(
      <div className="theme-play">
        {(Object.keys(BEFORE) as Tone[]).map((tone) => (
          <Panel key={tone} tone={tone}>
            <p>لوحة — {tone}</p>
          </Panel>
        ))}
      </div>,
    );
    await expectAccessible(container);
  });
});

describe("Panel — why the outline form exists", () => {
  it("the scope's text on a light status fill would fail badly", () => {
    // bone on --color-live-bg: the defect `impersonation-banner.tsx` patches under `.theme-dark`.
    expect(contrastRatio("#f4f1ea", "#fbf5ea")).toBeLessThan(1.5);
  });

  it("the scope's text on the dark ground, through the transparent fill, clears 4.5:1", () => {
    expect(contrastRatio("#f4f1ea", "#0b0c12")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#f4f1ea", "#151724")).toBeGreaterThanOrEqual(4.5);
  });
});
