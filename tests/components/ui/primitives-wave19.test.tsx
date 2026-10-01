// Wave 19's add-only changes to three of `content`'s primitives, for `scoring`'s directory and profile
// (DEC-214 §4): `avatar`'s sizes 44, 84 and 104; `tag-chip`'s team dot; `badge`'s level-ramp tone.
//
// New cases live here, never in the existing suites, which are evidence: each of them passing untouched is the
// proof that no existing caller moved.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Avatar } from "@/components/ui/avatar";
import { TagChip } from "@/components/ui/tag-chip";
import { Badge } from "@/components/ui/badge";

const ID = "00000000-0000-0000-0000-000000000007";

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("Avatar — sizes 44, 84, 104 (scoring's R1)", () => {
  it.each([
    [44, "h-11", "border-[3px]"],
    [84, "h-[84px]", "border-[5px]"],
    [104, "h-[104px]", "border-[6px]"],
  ] as const)("size %i draws its box and, with a team, a ring of the drawn width", (size, box, ringClass) => {
    const { container } = render(<Avatar memberId={ID} displayName="ريم" size={size} teamColor="#3be8b0" />);
    const got = classes(container.firstElementChild);
    expect(got).toContain(box);
    expect(got).toContain(ringClass);
    expect(got).toContain("border-team");
  });

  it("the sizes that existed keep their 3 px ring — no existing caller moves", () => {
    for (const size of [24, 32, 34, 40, 56, 96, 160] as const) {
      const { container, unmount } = render(<Avatar memberId={ID} displayName="ريم" size={size} teamColor={null} />);
      const got = classes(container.firstElementChild);
      expect(got).toContain("border-[3px]");
      expect(got).toContain("border-team-neutral");
      unmount();
    }
  });

  it("with no teamColor a large avatar draws no ring at all", () => {
    const { container } = render(<Avatar memberId={ID} displayName="ريم" size={104} />);
    expect(classes(container.firstElementChild).some((c) => c.startsWith("border"))).toBe(false);
  });
});

describe("TagChip — the team dot (scoring's R2)", () => {
  it("draws no dot when teamColor is absent — every caller before this wave", () => {
    const { container } = render(<TagChip label="جذر" />);
    expect(container.querySelector("[data-team-dot]")).toBeNull();
  });

  it("a colour reaches the dot as --team, and the dot is decoration before the name", async () => {
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={{}}>
        <TagChip label="جذر" href="/app/members?company=x" teamColor="#3be8b0" />
      </NextIntlClientProvider>,
    );
    const dot = container.querySelector<HTMLElement>("[data-team-dot]");
    expect(dot?.getAttribute("data-team-dot")).toBe("team");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(dot?.style.getPropertyValue("--team")).toBe("#3be8b0");
    expect(classes(dot)).toContain("bg-team");
    // The NAME is the channel; the dot sits before it in reading order.
    const link = screen.getByRole("link", { name: "جذر" });
    expect(link.firstElementChild).toBe(dot);
    await expectAccessible(container);
  });

  it("null draws the neutral dot; a malformed value never reaches --team", () => {
    for (const value of [null, "red; background: url(x)", "#12345"] as const) {
      const { container, unmount } = render(<TagChip label="بلا شركة" teamColor={value} />);
      const dot = container.querySelector<HTMLElement>("[data-team-dot]");
      expect(dot?.getAttribute("data-team-dot")).toBe("neutral");
      expect(dot?.style.getPropertyValue("--team")).toBe("");
      expect(classes(dot)).toContain("bg-team-neutral");
      unmount();
    }
  });
});

describe("Badge — the level-ramp tone (scoring's R3)", () => {
  it.each([1, 2, 3, 4, 5])("level %i takes the ramp's text colour on the raised fill, and no status tone", (level) => {
    const { container } = render(<Badge level={level}>مشارِك</Badge>);
    const got = classes(container.firstElementChild);
    expect(got).toContain(`text-level-${level}`);
    expect(got).toContain("bg-raised");
    expect(got.filter((c) => /^(bg|text)-(success|live|ended|error)/.test(c))).toEqual([]);
    expect(container.firstElementChild?.getAttribute("data-level")).toBe(String(level));
  });

  it("a level outside 1–5 is clamped, as level-card's rampStop is", () => {
    const { container: low } = render(<Badge level={0}>x</Badge>);
    const { container: high } = render(<Badge level={9}>y</Badge>);
    expect(low.firstElementChild?.getAttribute("data-level")).toBe("1");
    expect(high.firstElementChild?.getAttribute("data-level")).toBe("5");
  });

  it("the name is the children, isolated — colour is never the only channel", () => {
    render(<Badge level={4}>كريم معرفة</Badge>);
    expect(screen.getByText("كريم معرفة").tagName).toBe("BDI");
  });

  it("the ramp is 01-tokens.md's: every class the badge names is a token globals.css defines", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const level of [1, 2, 3, 4, 5]) expect(css).toMatch(new RegExp(`--color-level-${level}:`));
  });

  it("without a level, a badge is exactly what it was", () => {
    const { container } = render(<Badge tone="success">مفتوح</Badge>);
    expect(container.firstElementChild?.hasAttribute("data-level")).toBe(false);
    expect(classes(container.firstElementChild)).toContain("text-success");
  });
});
