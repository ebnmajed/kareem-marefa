// `<Avatar>` inside the playground's scope, and its team ring — DEC-183, DEC-186 §5, REQ-UIX-043,
// REQ-PRF-009, contract 3.
//
// New cases live here, never in `avatar.test.tsx`, which is evidence (DEC-186 §9).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Avatar, AvatarStack, SCOPE_TINTS, TINTS, teamColorOrNull, tintIndex } from "@/components/ui/avatar";
import { contrastRatio } from "@/lib/brand/contrast";

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const ID = "00000000-0000-0000-0000-000000000007";
// The class string as it stood at `b45541b`, before wave 15, for size 40.
const BEFORE = "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-field font-medium h-10 w-10 text-[0.9375rem]".split(" ");

describe("Avatar — the scope adds, it never replaces", () => {
  it("with no teamColor, keeps every class it had, and adds only scope classes", () => {
    const { container } = render(<Avatar memberId={ID} displayName="ريم" />);
    const got = classes(container.firstElementChild);
    const before = [...BEFORE, ...TINTS[tintIndex(ID)].split(" ")];
    for (const cls of before) expect(got, cls).toContain(cls);
    for (const cls of got) if (!before.includes(cls)) expect(cls, cls).toMatch(/^pg:/);
    expect(container.firstElementChild).not.toHaveAttribute("style");
  });

  it("is a circle inside the scope", () => {
    const { container } = render(<Avatar memberId={ID} displayName="ريم" />);
    expect(container.firstElementChild).toHaveClass("rounded-field", "pg:rounded-pill");
  });

  it("each of the six slots takes the scope's tint of the SAME index, with bone on it", () => {
    expect(SCOPE_TINTS).toHaveLength(TINTS.length);
    SCOPE_TINTS.forEach((cls, i) => expect(cls).toBe(`pg:bg-tint-${i + 1} pg:text-on-tint`));
    const { container } = render(<Avatar memberId={ID} displayName="ريم" />);
    expect(container.firstElementChild).toHaveClass(...SCOPE_TINTS[tintIndex(ID)].split(" "));
  });

  it("every scope tint resolves to a real token in globals.css", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const name of ["tint-1", "tint-2", "tint-3", "tint-4", "tint-5", "tint-6", "on-tint"]) {
      expect(css, name).toMatch(new RegExp(`--color-${name}:`));
    }
  });

  it("the stack is a circle inside the scope, and carries no team ring", () => {
    const { container } = render(
      <AvatarStack
        members={[
          { memberId: "a", displayName: "ريم" },
          { memberId: "b", displayName: "سارة" },
        ]}
      />,
    );
    const wrappers = container.querySelectorAll(".ring-2");
    expect(wrappers).toHaveLength(2);
    for (const w of wrappers) expect(w).toHaveClass("rounded-field", "pg:rounded-pill");
    expect(container.querySelector(".border-team, .border-team-neutral")).not.toBeInTheDocument();
  });
});

describe("Avatar — the team ring's three values (contract 3)", () => {
  it("undefined draws no ring at all — every caller before wave 15", () => {
    const { container } = render(<Avatar memberId={ID} displayName="ريم" />);
    const got = classes(container.firstElementChild);
    expect(got.some((c) => c.startsWith("border"))).toBe(false);
  });

  it("null draws the neutral ring, and never reads --team — an inherited --team must not colour it", () => {
    const { container } = render(
      <div style={{ ["--team" as string]: "#ff4fb8" }}>
        <Avatar memberId={ID} displayName="ريم" teamColor={null} />
      </div>,
    );
    const avatar = container.querySelector("[role=img]");
    expect(avatar).toHaveClass("border-[3px]", "border-team-neutral");
    expect(avatar).not.toHaveClass("border-team");
    expect(avatar).not.toHaveAttribute("style");
  });

  it("a colour draws the team ring as a border, and writes it as --team on the element", () => {
    const { container } = render(<Avatar memberId={ID} displayName="ريم" teamColor="#35D0FF" />);
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar).toHaveClass("border-[3px]", "border-team");
    expect(avatar.style.getPropertyValue("--team")).toBe("#35D0FF");
  });

  it.each([
    "red",
    "#35D0F",
    "#35D0FFF",
    "#35D0FF;background:url(x)",
    "var(--x)",
    "",
    "  #35D0FF",
  ])("anything but exactly #rrggbb is no colour — %j draws the neutral ring and writes no style", (bad) => {
    expect(teamColorOrNull(bad)).toBeNull();
    const { container } = render(<Avatar memberId={ID} displayName="ريم" teamColor={bad} />);
    expect(container.firstElementChild).toHaveClass("border-team-neutral");
    expect(container.firstElementChild).not.toHaveAttribute("style");
  });

  it("★ the ring never touches the fill: the same member keeps the same tint whatever the company (REQ-PRF-009)", () => {
    const tints = [undefined, null, "#35D0FF", "#FF9A2E"].map((teamColor) => {
      const { container, unmount } = render(<Avatar memberId={ID} displayName="ريم" teamColor={teamColor} />);
      const got = classes(container.firstElementChild).filter((c) => /bg-|text-(white|navy|on-tint)/.test(c));
      unmount();
      return got.join(" ");
    });
    expect(new Set(tints).size).toBe(1);
  });

  it("the initials stay under the image exactly as wave 14 left them, ring or not (DEC-182)", () => {
    const { container } = render(<Avatar memberId={ID} displayName="سارة" src="/api/avatars/m-1?v=2" teamColor="#9B7CFF" />);
    const span = container.firstElementChild!;
    expect(span.firstElementChild?.tagName).toBe("BDI");
    expect(span.firstElementChild).toHaveTextContent("س");
    const img = span.querySelector("img");
    expect(img?.className).toContain("absolute");
    expect(img?.className).toContain("inset-0");
    expect(img).toHaveAttribute("alt", "");
  });

  it("is accessible with every ring, named or decorative", async () => {
    const { container } = render(
      <div className="theme-play">
        <Avatar memberId="a" displayName="ريم" />
        <Avatar memberId="b" displayName="سارة" teamColor={null} />
        <Avatar memberId="c" displayName="نورة" teamColor="#FFD23F" />
        <Avatar memberId="d" displayName="خالد" teamColor="#3BE8B0" decorative />
      </div>,
    );
    await expectAccessible(container);
  });
});

// jsdom computes no colour; the values are `globals.css`'s (DEC-186 §2).
const TINT_HEX = ["#2c3d4a", "#3a3f56", "#4a3a2e", "#2e4a3f", "#463a4a", "#3c4a2e"];
const TEAMS = { silver: "#e9e4d6", tangerine: "#ff9a2e", magenta: "#ff4fb8", cyan: "#35d0ff", gold: "#ffd23f", violet: "#9b7cff", mint: "#3be8b0" };

describe("Avatar — contrast inside the scope", () => {
  it.each(TINT_HEX)("bone initials on the tint %s clear 7:1", (tint) => {
    expect(contrastRatio("#f4f1ea", tint)).toBeGreaterThanOrEqual(7);
  });

  it.each(Object.entries(TEAMS))("the %s ring clears 3:1 on the dark ground and surface (SC 1.4.11)", (_name, hex) => {
    expect(contrastRatio(hex, "#0b0c12")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(hex, "#151724")).toBeGreaterThanOrEqual(3);
  });

  it("the neutral ring (muted) clears 3:1 on the dark ground — a ring nobody can see is not neutral", () => {
    expect(contrastRatio("#a7abbe", "#0b0c12")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#5b5f73", "#f6f3ec")).toBeGreaterThanOrEqual(3);
  });
});
