// The playground's nine glyphs — DEC-183 §4.7, REQ-UIX-041.
//
// What is asserted is the contract, not the paths: each of the nine is drawn in
// the house shape, none of them mirrors, and the seven glyphs the design's
// additions file offers a second time are NOT drawn twice.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Icons from "@/components/ui/icons";

const NINE = [
  "FlameIcon",
  "TrophyIcon",
  "CompassIcon",
  "TicketIcon",
  "CoinIcon",
  "BoltIcon",
  "CameraIcon",
  "CalendarCheckIcon",
  "PauseIcon",
] as const;

type Glyph = (props: { label?: string; className?: string }) => React.ReactElement;
const glyph = (name: string) => (Icons as unknown as Record<string, Glyph>)[name];

describe("the playground's nine glyphs", () => {
  it.each(NINE)("%s is drawn in the house shape", (name) => {
    const G = glyph(name);
    expect(G, `${name} is exported`).toBeTypeOf("function");
    const { container } = render(<G />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg).toHaveAttribute("width", "1em");
    expect(svg).toHaveAttribute("height", "1em");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("stroke-width", "2");
    expect(svg).toHaveAttribute("stroke-linecap", "round");
    expect(svg).toHaveAttribute("stroke-linejoin", "round");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it.each(NINE)("%s becomes a named image when given a label", (name) => {
    const G = glyph(name);
    const { container } = render(<G label="اسم" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "اسم");
    expect(svg).not.toHaveAttribute("aria-hidden");
  });

  it("none of the nine mirrors — none of them points", () => {
    for (const name of NINE) {
      const G = glyph(name);
      const { container } = render(<G />);
      expect(container.querySelector("svg"), name).not.toHaveClass("rtl:-scale-x-100");
    }
  });

  it("the seven the additions offer a second time are not drawn twice", () => {
    // The house drawings stand (DEC-106). The additions' chevron pair is `ChevronIcon`'s
    // `forward` and `back`, so neither name may appear.
    const names = Object.keys(Icons);
    expect(names).not.toContain("ChevronStartIcon");
    expect(names).not.toContain("ChevronEndIcon");
    for (const kept of ["CloseIcon", "PlusIcon", "DownloadIcon", "StarIcon", "PinIcon", "ChevronIcon"]) {
      expect(names.filter((n) => n === kept), kept).toHaveLength(1);
    }
  });

  it("the coin carries no numeral and no plus sign (REQ-CHK-018, DEC-183 §4.14)", () => {
    const { container } = render(<Icons.CoinIcon />);
    expect(container.querySelector("text")).toBeNull();
    expect(container.querySelectorAll("path")).toHaveLength(0);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
  });

  it.each(["HeartIcon", "FlameIcon", "BoltIcon", "StarIcon"])("%s has a filled form, so pressed is never colour alone (DEC-186 §5)", (name) => {
    const G = glyph(name) as unknown as (p: { filled?: boolean }) => React.ReactElement;
    const outline = render(<G />).container.querySelector("path")!;
    const filled = render(<G filled />).container.querySelector("path")!;
    expect(outline).toHaveAttribute("fill", "none");
    expect(filled).toHaveAttribute("fill", "currentColor");
    expect(filled.getAttribute("d")).toBe(outline.getAttribute("d"));
  });

  it("the heart is drawn in the house shape and never mirrors", () => {
    const { container } = render(<Icons.HeartIcon />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "1em");
    expect(svg).toHaveAttribute("stroke-width", "2");
    expect(svg).not.toHaveClass("rtl:-scale-x-100");
  });

  // wave 18 (DEC-207): fifty-two — the megaphone and the comment bubble the home needed.
  // wave 18, PR B (DEC-209): fifty-four — play for the audio row, the monitor for projection.
  it("the set is fifty-five glyphs, and the gallery names every one in Arabic", async () => {
    const glyphs = Object.keys(Icons).filter((n) => n.endsWith("Icon"));
    expect(glyphs).toHaveLength(55); // wave 20 (DEC-217): + `SettingsIcon`, the settings link on `/app/me`.
    const { readFileSync } = await import("node:fs");
    // Wave 17 (DEC-199): the glyphs' names moved with them into the gallery's own demo.
    const page = readFileSync("src/app/[locale]/(dev)/ui/demos/icons.tsx", "utf8");
    for (const name of glyphs) expect(page, `${name} has an Arabic name in the gallery`).toMatch(new RegExp(`\\b${name}: "`));
  });
});
