// `<BadgeMedallion>` — REQ-UIX-064, DEC-213 §5.126, DEC-214 §4. A disc and a name from props; the
// fill is the badge's or the level's, never a company's; nothing moves.
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { BadgeMedallion, medallionFill } from "@/components/ui/badge-medallion";
import { StarIcon } from "@/components/ui/icons";

const SOURCE = readFileSync("src/components/ui/badge-medallion.tsx", "utf8");

describe("BadgeMedallion", () => {
  it("draws the disc and the badge's name in <bdi>, and the name is what is read", () => {
    const { container } = render(<BadgeMedallion name="أول حضور" fill="gold" glyph={<StarIcon />} />);
    expect(screen.getByText("أول حضور").tagName).toBe("BDI");
    const disc = container.querySelector("[data-slot=disc]")!;
    expect(disc.getAttribute("aria-hidden")).toBe("true");
    expect(disc.querySelector("svg")).not.toBeNull();
  });

  it("reads the description to assistive technology and never draws it", () => {
    render(<BadgeMedallion name="أول حضور" fill="gold" description="أول تسجيل حضور موثّق" />);
    const description = screen.getByText("أول تسجيل حضور موثّق");
    expect(description.closest(".sr-only")).not.toBeNull();
  });

  it("★ with showName={false} it draws no name and hides the whole block — the caller draws the name", () => {
    const { container } = render(<BadgeMedallion name="كريم معرفة" fill={{ level: 4 }} showName={false} />);
    expect(container.textContent).toBe("");
    expect(container.querySelector("[data-slot=badge-medallion]")!.getAttribute("aria-hidden")).toBe("true");
  });

  it.each(["accent", "signal", "cyan", "gold", "violet", "bone"] as const)("a badge's fill comes from the allowed set by name — %s", (fill) => {
    expect(medallionFill(fill)).toBe(`[--medallion:var(--color-sticker-${fill})]`);
  });

  it("a level's fill is its ramp stop, keyed on sort_order and clamped to 1–5", () => {
    expect(medallionFill({ level: 4 })).toBe("[--medallion:var(--color-level-4)]");
    expect(medallionFill({ level: 9 })).toBe("[--medallion:var(--color-level-5)]");
    expect(medallionFill({ level: 0 })).toBe("[--medallion:var(--color-level-1)]");
  });

  it("two sizes — 64 px and 52 px", () => {
    const md = render(<BadgeMedallion name="أ" fill="cyan" />).container.querySelector("[data-slot=disc]")!;
    const sm = render(<BadgeMedallion name="أ" fill="cyan" size="sm" />).container.querySelector("[data-slot=disc]")!;
    expect(md.className).toContain("size-16");
    expect(sm.className).toContain("size-13");
  });

  it("★ the drop is color-mix() of its own fill with the ground — no token per fill (DEC-214 §4)", () => {
    expect(SOURCE).toContain("color-mix(in_oklab,var(--medallion)_62%,var(--bg))");
    expect(SOURCE.replace(/\/\/.*$/gm, "")).not.toMatch(/--team|team-/);
  });

  it("★ static: no hover scale, no transition, no animation, no physical property", () => {
    const code = SOURCE.replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/hover:|transition|animate-|scale-|\b(?:ml|mr|pl|pr|left|right)-/);
  });

  it("has no accessibility violation, named or not", async () => {
    const { container } = render(
      <ul>
        <li>
          <BadgeMedallion name="سلسلة الشهر" fill="signal" glyph={<StarIcon />} />
        </li>
        <li>
          <BadgeMedallion name="كريم معرفة" fill={{ level: 4 }} showName={false} size="sm" />
        </li>
      </ul>,
    );
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});
