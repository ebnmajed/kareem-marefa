// `<Sticker>` — REQ-UIX-031, DEC-183, DEC-186 §4 – §5. Decoration, never a status; static this
// wave; the rim drawn from the ground it sits on. The components project renders in an RTL document.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { StickerFill } from "@/components/ui";
import { Sticker, stickerRotation } from "@/components/ui/sticker";
import { contrastRatio } from "@/lib/brand/contrast";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const FILLS: StickerFill[] = ["accent", "signal", "cyan", "gold", "violet", "bone"];

describe("Sticker — decoration by default", () => {
  it("is aria-hidden unless it says what nothing else on the surface says", () => {
    const { container } = render(<Sticker>محجوز</Sticker>);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("informative is read, as plain text with no role", () => {
    render(<Sticker informative>مستوى جديد</Sticker>);
    const el = screen.getByText("مستوى جديد").parentElement!;
    expect(el).not.toHaveAttribute("aria-hidden");
    expect(el).not.toHaveAttribute("role");
  });

  it("isolates its word in <bdi> — «+50 عند الحضور» mixes a signed digit run with Arabic", () => {
    const { container } = render(<Sticker>+50 عند الحضور</Sticker>);
    expect(container.querySelector("bdi")).toHaveTextContent("+50 عند الحضور");
  });
});

describe("Sticker — its fill, by name, and its rim", () => {
  it.each(FILLS)("fill=%s reads bg-sticker-%s with ink on it", (fill) => {
    const { container } = render(<Sticker fill={fill}>محجوز</Sticker>);
    expect(container.firstElementChild).toHaveClass(`bg-sticker-${fill}`, "text-on-sticker");
  });

  it("the default fill is the accent", () => {
    const { container } = render(<Sticker>محجوز</Sticker>);
    expect(container.firstElementChild).toHaveClass("bg-sticker-accent");
  });

  it("is a die-cut pill in the display face, with the rim drawn from --sticker-ground", () => {
    const { container } = render(<Sticker>محجوز</Sticker>);
    expect(container.firstElementChild).toHaveClass("rounded-pill", "font-display", "font-extrabold", "shadow-sticker");
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/--shadow-sticker:[^;]*var\(--sticker-ground/);
  });

  it("takes its ground from what it sits on — the component never sets it", () => {
    const { container } = render(
      <div style={{ ["--sticker-ground" as string]: "#FF9A2E" }}>
        <Sticker>محجوز</Sticker>
      </div>,
    );
    expect((container.querySelector("span") as HTMLElement).style.getPropertyValue("--sticker-ground")).toBe("");
  });

  it.each([
    ["sm", "text-base"],
    ["md", "text-xl"],
  ] as const)("size=%s is %s (16 / 20 px)", (size, cls) => {
    const { container } = render(<Sticker size={size}>محجوز</Sticker>);
    expect(container.firstElementChild).toHaveClass(cls);
  });
});

describe("Sticker — rotated within ±6°, and still", () => {
  it.each([
    [-4, -4],
    [0, 0],
    [6, 6],
    [-6, -6],
    [12, 6],
    [-30, -6],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])("rotate=%s renders at %s°", (rotate, deg) => {
    expect(stickerRotation(rotate)).toBe(deg);
    const { container } = render(<Sticker rotate={rotate}>محجوز</Sticker>);
    expect((container.firstElementChild as HTMLElement).style.rotate).toBe(`${deg}deg`);
  });

  it("the default is a slight tilt, -4°", () => {
    const { container } = render(<Sticker>محجوز</Sticker>);
    expect((container.firstElementChild as HTMLElement).style.rotate).toBe("-4deg");
  });

  it("does not move this wave: no transition, no animation, no scale (DEC-186 §4)", () => {
    const { container } = render(<Sticker>محجوز</Sticker>);
    expect(container.firstElementChild!.className).not.toMatch(/transition|animate|duration|scale/);
  });
});

describe("Sticker — accessible, and readable", () => {
  it("is accessible, decorative and informative, inside the scope", async () => {
    const { container } = render(
      <div className="theme-play">
        <p>
          تم الحجز <Sticker>محجوز</Sticker>
        </p>
        <Sticker informative fill="violet">
          مستوى جديد
        </Sticker>
      </div>,
    );
    await expectAccessible(container);
  });

  // `globals.css`'s constants: ink on each fill. The face is 16 – 20 px at 800, so large text
  // would need 3:1; every fill clears body text's 4.5:1.
  it.each([
    ["accent", "#c6ff3d"],
    ["signal", "#ff6e4f"],
    ["cyan", "#35d0ff"],
    ["gold", "#ffd23f"],
    ["violet", "#9b7cff"],
    ["bone", "#f4f1ea"],
  ])("ink on %s clears 4.5:1", (_fill, hex) => {
    expect(contrastRatio("#0b0c12", hex)).toBeGreaterThanOrEqual(4.5);
  });
});
