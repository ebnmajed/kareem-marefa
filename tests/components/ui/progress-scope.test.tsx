// `<Progress>` inside the playground's scope — DEC-183, DEC-186 §2 – §3, REQ-UIX-030, DEC-073.
//
// New cases live here, never in `progress.test.tsx`, which is evidence (DEC-186 §9). `Progress`
// keeps its `width` fill and its pulse; only colours are added, under `pg:` and `pg-dark:`.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { Tone } from "@/components/ui";
import { Progress } from "@/components/ui/progress";
import { contrastRatio } from "@/lib/brand/contrast";

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

// The class strings as they stood at `bcf6957`, before wave 15.
const BEFORE_TRACK = "h-2 w-full overflow-hidden rounded-full bg-silver-200".split(" ");
const BEFORE_FILL: Record<Tone, string> = {
  neutral: "h-full rounded-full bg-navy-900",
  info: "h-full rounded-full bg-navy-900",
  success: "h-full rounded-full bg-success",
  live: "h-full rounded-full bg-live",
  ended: "h-full rounded-full bg-ended",
  error: "h-full rounded-full bg-error",
};
const SCOPE: Record<Tone, string> = {
  neutral: "pg:bg-accent",
  info: "pg:bg-accent",
  success: "pg-dark:bg-success-on-dark",
  live: "pg-dark:bg-live-on-dark",
  ended: "pg-dark:bg-ended-on-dark",
  error: "pg-dark:bg-error-on-dark",
};

const TONES = Object.keys(BEFORE_FILL) as Tone[];

describe("Progress — the scope adds, it never replaces", () => {
  it("the track keeps every class it had and adds the raised surface", () => {
    const { container } = render(<Progress value={3} max={10} label="المقاعد" />);
    const got = classes(container.firstElementChild);
    for (const cls of BEFORE_TRACK) expect(got, cls).toContain(cls);
    expect(got.filter((c) => !BEFORE_TRACK.includes(c))).toEqual(["pg:bg-raised"]);
  });

  it.each(TONES)("the %s fill keeps every class and its width, and adds one scope class", (tone) => {
    const { container } = render(<Progress value={25} label="التقدم" tone={tone} />);
    const fill = container.querySelector('[role="progressbar"] > div') as HTMLElement;
    const got = classes(fill);
    const before = BEFORE_FILL[tone].split(" ");
    for (const cls of before) expect(got, cls).toContain(cls);
    expect(got.filter((c) => !before.includes(c))).toEqual([SCOPE[tone]]);
    expect(fill.style.width).toBe("25%");
  });

  it("the indeterminate pulse is unchanged — what exists today stays (DEC-186 §4)", () => {
    const { container } = render(<Progress label="جارٍ التحقق" />);
    expect(container.querySelector('[role="progressbar"] > div')).toHaveClass("w-full", "motion-safe:animate-pulse", "pg:bg-accent");
  });

  it("is accessible inside the scope, every tone", async () => {
    const { container } = render(
      <div className="theme-play">
        {TONES.map((tone) => (
          <Progress key={tone} value={6} max={10} label={`المقاعد — ${tone}`} valueText="6 من 10" tone={tone} />
        ))}
        <Progress label="جارٍ الرفع" />
      </div>,
    );
    await expectAccessible(container);
    expect(screen.getAllByRole("progressbar")).toHaveLength(TONES.length + 1);
  });
});

// SC 1.4.11: the fill against the raised track inside the dark scope (DEC-186 §2, DEC-073 values).
describe("Progress — contrast inside the dark scope", () => {
  it.each([
    ["accent", "#c6ff3d"],
    ["success-on-dark", "#8fbfa5"],
    ["live-on-dark", "#d2a86b"],
    ["ended-on-dark", "#a8b3c4"],
    ["error-on-dark", "#e08c8f"],
  ])("the %s fill clears 3:1 against the raised track", (_name, hex) => {
    expect(contrastRatio(hex, "#1e2130")).toBeGreaterThanOrEqual(3);
  });

  it("navy, the fill outside the scope, would not — why pg:bg-accent exists", () => {
    expect(contrastRatio("#111a2c", "#1e2130")).toBeLessThan(3);
  });
});
