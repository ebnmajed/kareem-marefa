// `<Badge>` / `<SessionStatusBadge>` inside the playground's scope — DEC-183, DEC-186 §3, DEC-073,
// REQ-UIX-003, REQ-UIX-030.
//
// New cases live here, never in `badge.test.tsx`, which is evidence (DEC-186 §9). The promise is
// two-sided: every class a badge had before wave 15 is still on it — so outside the scope nothing
// moves — and inside a DARK scope each tone adds its on-dark form under `pg-dark:`. No status colour
// is new: the scope never remaps one, and every value below is a `DEC-073` constant.
import type React from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { Tone } from "@/components/ui";
import { Badge, SessionStatusBadge } from "@/components/ui/badge";
import { SESSION_PHASES } from "@/lib/session-status";
import { contrastRatio } from "@/lib/brand/contrast";
import ar from "@/messages/ar/browse.json";

function Scope({ light, children }: { light?: boolean; children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      <div className={light ? "theme-play theme-play-light" : "theme-play"}>{children}</div>
    </NextIntlClientProvider>
  );
}

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

// The class strings as they stood at `81f9a4a`, before wave 15.
const BASE = "inline-flex w-fit items-center rounded-field font-medium min-h-7 gap-1.5 px-2.5 text-label".split(" ");
const BEFORE_FILLED: Record<Exclude<Tone, "neutral">, string> = {
  info: "bg-silver-100 text-fg-body",
  success:
    "bg-success-bg text-success [.theme-dark_&]:border [.theme-dark_&]:border-success-on-dark/50 [.theme-dark_&]:bg-transparent [.theme-dark_&]:text-success-on-dark",
  live: "bg-live-bg text-live [.theme-dark_&]:border [.theme-dark_&]:border-live-on-dark/50 [.theme-dark_&]:bg-transparent [.theme-dark_&]:text-live-on-dark",
  ended:
    "bg-ended-bg text-ended [.theme-dark_&]:border [.theme-dark_&]:border-edge-strong [.theme-dark_&]:bg-transparent [.theme-dark_&]:text-fg-muted",
  error:
    "bg-error-bg text-error [.theme-dark_&]:border [.theme-dark_&]:border-error-on-dark/50 [.theme-dark_&]:bg-transparent [.theme-dark_&]:text-error-on-dark",
};
const BEFORE_OUTLINE: Record<Tone, string> = {
  neutral: "border border-edge-strong text-fg-muted",
  info: "border border-edge-strong text-fg-body",
  success: "border border-success text-success",
  live: "border border-live text-live [.theme-dark_&]:border-live-on-dark [.theme-dark_&]:text-live-on-dark",
  ended: "border border-edge-strong text-ended [.theme-dark_&]:text-fg-muted",
  error: "border border-error-border text-error",
};

const TONES: Tone[] = ["neutral", "info", "success", "live", "ended", "error"];

describe("Badge — the scope adds, it never replaces", () => {
  it.each(Object.entries(BEFORE_FILLED))("filled %s keeps every class it had", (tone, before) => {
    const { container } = render(<Badge tone={tone as Tone}>حالة</Badge>);
    const got = classes(container.firstElementChild);
    for (const cls of [...BASE, ...before.split(" ")]) expect(got, cls).toContain(cls);
  });

  it.each(Object.entries(BEFORE_OUTLINE))("outline %s keeps every class it had", (tone, before) => {
    const { container } = render(
      <Badge tone={tone as Tone} outline>
        حالة
      </Badge>,
    );
    const got = classes(container.firstElementChild);
    for (const cls of [...BASE, ...before.split(" ")]) expect(got, cls).toContain(cls);
  });

  it.each(TONES)("every class %s adds is under pg-dark:, and none replaces a colour it had", (tone) => {
    for (const outline of [false, true]) {
      const { container, unmount } = render(
        <Badge tone={tone} outline={outline}>
          حالة
        </Badge>,
      );
      const before = new Set([...BASE, ...(outline || tone === "neutral" ? BEFORE_OUTLINE[tone] : BEFORE_FILLED[tone as Exclude<Tone, "neutral">]).split(" ")]);
      for (const cls of classes(container.firstElementChild)) if (!before.has(cls)) expect(cls, cls).toMatch(/^pg-dark:/);
      unmount();
    }
  });

  it("keeps its 6 px corner inside the scope — a status is never a pill, which is a sticker's shape (DEC-186 §3)", () => {
    const { container } = render(<Badge tone="live">جارية الآن</Badge>);
    expect(container.firstElementChild).toHaveClass("rounded-field");
    expect(classes(container.firstElementChild).some((c) => /rounded/.test(c) && c !== "rounded-field")).toBe(false);
  });
});

describe("Badge — the on-dark forms inside a dark scope (DEC-073's constants, none new)", () => {
  it.each([
    ["success", "pg-dark:text-success-on-dark", "pg-dark:border-success-on-dark/50"],
    ["live", "pg-dark:text-live-on-dark", "pg-dark:border-live-on-dark/50"],
    ["ended", "pg-dark:text-ended-on-dark", "pg-dark:border-edge-strong"],
    ["error", "pg-dark:text-error-on-dark", "pg-dark:border-error-on-dark/50"],
  ] as const)("filled %s drops its near-white fill for the outline form", (tone, text, border) => {
    const { container } = render(<Badge tone={tone}>حالة</Badge>);
    expect(container.firstElementChild).toHaveClass("pg-dark:border", "pg-dark:bg-transparent", text, border);
  });

  it("filled info, which `.theme-dark` never covered, gets an outline in the boundary colour", () => {
    const { container } = render(<Badge tone="info">معلومة</Badge>);
    expect(container.firstElementChild).toHaveClass("pg-dark:border", "pg-dark:border-edge-strong", "pg-dark:bg-transparent");
  });

  it("ended reads its own constant, never the scope's muted text", () => {
    for (const outline of [false, true]) {
      const { container, unmount } = render(
        <Badge tone="ended" outline={outline}>
          انتهت
        </Badge>,
      );
      expect(container.firstElementChild).toHaveClass("pg-dark:text-ended-on-dark");
      expect(classes(container.firstElementChild)).not.toContain("pg-dark:text-fg-muted");
      unmount();
    }
  });

  it("neutral adds nothing: its boundary and muted text are the scope's own", () => {
    const { container } = render(<Badge outline>مسودة</Badge>);
    expect(classes(container.firstElementChild).filter((c) => c.startsWith("pg"))).toEqual([]);
  });

  it("SessionStatusBadge keeps its words and its dot, and takes the same forms", () => {
    const { container, getByText } = render(
      <Scope>
        <SessionStatusBadge phase="live" />
      </Scope>,
    );
    expect(getByText(ar.browse.status.live)).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveClass("motion-safe:animate-pulse");
    expect(container.querySelector(".theme-play > span")).toHaveClass("pg-dark:text-live-on-dark");
  });

  it.each([
    ["the dark scope", false],
    ["the light variant", true],
  ] as const)("is accessible on every phase, in %s", async (_ground, light) => {
    const { container } = render(
      <Scope light={light}>
        {SESSION_PHASES.map((phase) => (
          <SessionStatusBadge key={phase} phase={phase} />
        ))}
        <SessionStatusBadge phase="open" seat="full" />
        <SessionStatusBadge phase="open" seat="closed" />
        <SessionStatusBadge phase="open" seat="available" closingSoon />
      </Scope>,
    );
    await expectAccessible(container);
  });
});

// jsdom cannot compute a colour, so contrast is asserted numerically against the values the
// classes resolve to (`globals.css`: DEC-073's constants; the scope's grounds, DEC-186 §2). AA body
// text is 4.5:1.
const DARK_GROUNDS = { ground: "#0b0c12", surface: "#151724", raised: "#1e2130" };
const ON_DARK = { success: "#8fbfa5", live: "#d2a86b", ended: "#a8b3c4", error: "#e08c8f", neutral: "#a7abbe", info: "#f4f1ea" };
const LIGHT_GROUNDS = { paper: "#f6f3ec", white: "#ffffff" };
const LIGHT = { success: "#2f6b4f", live: "#8a5a1f", ended: "#5b6780", error: "#9e3b3f", neutral: "#5b5f73", info: "#12131a" };

describe("Badge — contrast inside the scope", () => {
  for (const [ground, bg] of Object.entries(DARK_GROUNDS)) {
    it.each(Object.entries(ON_DARK))(`dark scope, on ${ground}: %s clears 4.5:1`, (_tone, fg) => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
  for (const [ground, bg] of Object.entries(LIGHT_GROUNDS)) {
    it.each(Object.entries(LIGHT))(`light variant, on ${ground}: %s clears 4.5:1`, (_tone, fg) => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("and the light constants would NOT pass inside the dark scope — why pg-dark: exists", () => {
    for (const fg of [LIGHT.success, LIGHT.error]) expect(contrastRatio(fg, DARK_GROUNDS.surface)).toBeLessThan(4.5);
  });
});
