// `ui/button` inside the playground's scope — DEC-186 §2, REQ-UIX-030,
// contract 5. `tests/components/button.test.tsx` is the existing suite and is
// not edited; this file holds what wave 15 added.
//
// The promise is that outside the scope NOTHING moved. jsdom computes no CSS,
// so the promise is held here the way it can be: take every class the scope
// added away, and what is left is the class string `main` rendered, token for
// token. The browser's half of the proof is contract 5's — the visual diff and
// the computed-style fingerprint.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ButtonVariant, Size } from "@/components/ui";
import { Button, buttonBase, buttonClass, buttonSizes, buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";

/** What `main` rendered, before wave 15. */
const BEFORE = {
  base: "inline-flex items-center justify-center gap-2 rounded-field text-label transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
  sizes: { sm: "h-9 px-3.5", md: "h-11 px-5", lg: "h-12 px-7" } satisfies Record<Size, string>,
  variants: {
    primary: "btn-sheen bg-[var(--btn-bg)] text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)] active:bg-[var(--btn-bg-active)]",
    secondary:
      "border border-[var(--btn2-border)] text-[var(--btn2-fg)] hover:border-[var(--btn2-border-hover)] hover:bg-[var(--btn2-bg-hover)] active:border-[var(--btn2-border-hover)] active:bg-[var(--btn2-bg-hover)]",
    ghost: "text-fg-heading hover:bg-[var(--btn2-bg-hover)] active:bg-[var(--btn2-bg-hover)]",
    danger: "border border-error-border text-error hover:bg-error-bg active:bg-error-bg",
  },
} as const;

const tokens = (s: string) => s.split(/\s+/).filter(Boolean);
const scoped = (c: string) => /^pg(?:-dark|-light)?:/.test(c);
const outside = (s: string) => tokens(s).filter((c) => !scoped(c)).join(" ");
const inside = (s: string) => tokens(s).filter(scoped);

const OLD_VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
const SIZES = ["sm", "md", "lg"] as const;

describe("ui/button — outside the scope nothing moved", () => {
  it("the base, with the scope's classes taken away, is main's base", () => {
    expect(outside(buttonBase)).toBe(BEFORE.base);
  });

  it.each(SIZES)("size %s, with the scope's classes taken away, is main's", (size) => {
    expect(outside(buttonSizes[size])).toBe(BEFORE.sizes[size]);
  });

  it.each(OLD_VARIANTS)("variant %s, with the scope's classes taken away, is main's", (variant) => {
    expect(outside(buttonVariants[variant])).toBe(BEFORE.variants[variant]);
  });

  it.each(OLD_VARIANTS.flatMap((v) => SIZES.map((s) => [v, s] as const)))("%s at %s renders main's class string, then the scope's", (variant, size) => {
    const now = buttonClass(variant, size);
    expect(outside(now)).toBe(`${BEFORE.base} ${BEFORE.sizes[size]} ${BEFORE.variants[variant]}`);
  });

  it("the existing classes come first and the scope's are added after them, never between", () => {
    for (const s of [buttonBase, ...Object.values(buttonVariants), ...Object.values(buttonSizes)]) {
      const list = tokens(s);
      const firstScoped = list.findIndex(scoped);
      if (firstScoped >= 0) expect(list.slice(firstScoped).every(scoped), s).toBe(true);
    }
  });
});

describe("ui/button — inside the scope", () => {
  it("is a pill that sinks onto its shadow, and only transform is transitioned", () => {
    const base = inside(buttonBase);
    expect(base).toContain("pg:rounded-pill");
    expect(base).toContain("pg:transition-transform");
    expect(base).toContain("pg:duration-(--duration-fast)");
    const primary = inside(buttonVariants.primary);
    expect(primary).toEqual(expect.arrayContaining(["pg:shadow-press", "pg:active:translate-y-[3px]", "pg:active:shadow-press-down"]));
  });

  it("★ nothing scales — on hover, on press, or at all", () => {
    for (const s of [buttonBase, ...Object.values(buttonVariants), ...Object.values(buttonSizes)]) expect(s).not.toMatch(/scale/);
  });

  it("the check-in's shadow is the signal's, and nothing else borrows coral", () => {
    expect(inside(buttonVariants.signal)).toEqual(expect.arrayContaining(["pg:shadow-press-signal", "pg:active:shadow-press-signal-down"]));
    for (const v of ["primary", "secondary", "ghost", "danger", "quiet"] as const) expect(buttonVariants[v]).not.toMatch(/signal/);
  });

  it("lg is 52 px inside the scope; md stays 44 and sm 36", () => {
    expect(inside(buttonSizes.lg)).toEqual(["pg:h-13"]);
    expect(inside(buttonSizes.md)).toEqual([]);
    expect(inside(buttonSizes.sm)).toEqual([]);
  });

  it("the display face is set at its own size only where a label is in it", () => {
    for (const v of ["primary", "secondary", "signal"] as const) {
      expect(buttonVariants[v]).toContain("pg:font-display");
      expect(buttonClass(v, "lg")).toContain("pg:text-play-sm");
      expect(buttonClass(v, "md")).not.toContain("pg:text-play-sm");
    }
    for (const v of ["ghost", "danger", "quiet"] as const) {
      expect(buttonVariants[v]).not.toContain("pg:font-display");
      expect(buttonClass(v, "lg")).not.toContain("pg:text-play-sm");
    }
  });

  it("a destructive control wears the platform's on-dark error inside a dark scope", () => {
    expect(inside(buttonVariants.danger)).toEqual(expect.arrayContaining(["pg-dark:border-error-on-dark", "pg-dark:text-error-on-dark"]));
  });

  it("declares no focus ring for the scope: the scope's one rule draws it", () => {
    for (const s of [buttonBase, ...Object.values(buttonVariants)]) expect(inside(s).join(" ")).not.toMatch(/outline/);
  });
});

describe("ui/button — the two variants wave 15 added", () => {
  it.each(["signal", "quiet"] as ButtonVariant[])("%s renders, keeps its label while pending, and cannot be pressed twice", (variant) => {
    render(
      <Button variant={variant} pending pendingLabel="جارٍ التسجيل…">
        سجّل حضورك
      </Button>,
    );
    const button = screen.getByRole("button", { name: /سجّل حضورك/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveTextContent("سجّل حضورك");
  });

  it("an icon button shares the variants, and so the pill", () => {
    render(
      <IconButton label="إغلاق" variant="quiet">
        ×
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "إغلاق" });
    expect(button).toHaveClass("pg:rounded-pill", "bg-raised");
  });
});
