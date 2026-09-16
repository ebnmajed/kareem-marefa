// `<Avatar>` / `<AvatarStack>` — `16` §6.8, DEC-099. Initials are the
// DEFAULT and the PERMANENT fallback; there is no silhouette placeholder
// anywhere. The tint is a stable hash of the MEMBER ID, never the name.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Avatar, AvatarStack, tintIndex } from "@/components/ui/avatar";
import { contrastRatio } from "@/lib/brand/contrast";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("Avatar — the default and permanent fallback", () => {
  it("shows the first letter of the display name, wrapped in <bdi>, when there is no src", () => {
    const { container } = render(<Avatar memberId="m-1" displayName="ريم العتيبي" />);
    const bdi = container.querySelector("bdi");
    expect(bdi).toHaveTextContent("ر");
  });

  it("falls back to a placeholder glyph, never a silhouette, when the name itself is null", () => {
    const { container } = render(<Avatar memberId="m-2" displayName={null} />);
    expect(container.querySelector("bdi")).not.toBeEmptyDOMElement();
    // No icon/svg of any kind — the fallback is text, not a drawn silhouette.
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders a real image, not initials, once src is given — and still no silhouette underneath it", () => {
    const { container } = render(<Avatar memberId="m-3" displayName="سارة" src="https://example.com/a.webp" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/a.webp");
    expect(container.querySelector("bdi")).not.toBeInTheDocument();
  });

  it("is named for a screen reader by the display name unless marked decorative", () => {
    render(<Avatar memberId="m-4" displayName="نورة" />);
    expect(screen.getByRole("img", { name: "نورة" })).toBeInTheDocument();
  });

  it("is aria-hidden, not separately named, when decorative (beside a name already rendered elsewhere)", () => {
    const { container } = render(<Avatar memberId="m-5" displayName="خالد" decorative />);
    const el = container.firstElementChild;
    expect(el).toHaveAttribute("aria-hidden", "true");
  });

  it("the tint depends on the MEMBER ID, not the name — a spelling correction does not move it", () => {
    const { container: before } = render(<Avatar memberId="00000000-0000-0000-0000-000000000001" displayName="سارة" decorative />);
    const { container: after } = render(<Avatar memberId="00000000-0000-0000-0000-000000000001" displayName="سارّة" decorative />);
    expect(before.firstElementChild?.className).toBe(after.firstElementChild?.className);
  });

  it("two different ids can land on different tints — the hash actually varies", () => {
    expect(tintIndex("00000000-0000-0000-0000-000000000001")).not.toBe(tintIndex("00000000-0000-0000-0000-000000000002"));
  });

  it("is accessible", async () => {
    const { container } = render(<Avatar memberId="m-6" displayName="عبدالله" />);
    await expectAccessible(container);
  });
});

describe("AvatarStack", () => {
  it("caps at max and reports the overflow count", () => {
    const members = [
      { memberId: "1", displayName: "أ" },
      { memberId: "2", displayName: "ب" },
      { memberId: "3", displayName: "ج" },
    ];
    render(<AvatarStack members={members} max={2} overflowLabel={(count) => `و${count} آخرين`} />);
    expect(screen.getByText("و1 آخرين")).toBeInTheDocument();
  });

  it("shows nothing extra when every member fits", () => {
    const members = [{ memberId: "1", displayName: "أ" }];
    const { container } = render(<AvatarStack members={members} max={2} />);
    expect(container.querySelectorAll("bdi").length).toBe(1);
  });
});

// jsdom has no layout engine; contrast is asserted numerically against the
// exact six navy/silver hex pairs `avatar.tsx` uses (`16` §6.8), the same
// reasoning as `badge.test.tsx`. AA body text is 4.5:1.
const TINT_PAIRS: [fg: string, bg: string][] = [
  ["#ffffff", "#0b1220"], // navy-950
  ["#ffffff", "#1d2a42"], // navy-800
  ["#ffffff", "#2e405e"], // navy-600
  ["#0b1220", "#d5dfec"], // navy-200
  ["#0b1220", "#c9ced6"], // silver-300
  ["#0b1220", "#a8b3c4"], // silver-400
];

describe("Avatar — every tint clears AA contrast (4.5:1)", () => {
  it.each(TINT_PAIRS)("fg %s on bg %s", (fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
