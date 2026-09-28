// `<Poster>` — REQ-UIX-032, REQ-UIX-026, DEC-183, DEC-186 §5. The rendered poster whole, or its
// team-coloured placeholder; composes `CardMedia`; reads nothing; draws no QR. RTL document.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Poster, posterAspect } from "@/components/ui/poster";
import { Sticker } from "@/components/ui/sticker";
import { contrastRatio } from "@/lib/brand/contrast";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const BASE = { title: "لوحة تحكم لا يهجرها أحد بعد أسبوع", teamName: "صنف", teamColor: "#FF9A2E" } as const;

function media(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-slot="media"]') as HTMLElement;
}
function placeholder(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-slot="poster-placeholder"]');
}

describe("Poster — the rendered poster, whole", () => {
  it("shows the image contained, never cropped, in CardMedia's media slot", () => {
    const { container } = render(<Poster {...BASE} src="/posters/s-1.webp" width={1080} height={1350} />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "/posters/s-1.webp");
    expect(img).toHaveClass("object-contain");
    expect(img).not.toHaveClass("object-cover");
    expect(media(container)).toHaveClass("aspect-[4/5]", "rounded-tile");
    expect(placeholder(container)).not.toBeInTheDocument();
  });

  it.each([
    [1080, 1350, "4/5"],
    [1080, 1080, "1/1"],
    [1920, 1080, "16/9"],
    [2480, 3508, "210/297"],
    [3508, 2480, "297/210"],
    [1080, 1920, "4/5"], // a story: not a ratio CardMedia reserves — shown whole inside 4:5
    [undefined, undefined, "4/5"],
    [0, 0, "4/5"],
  ])("a %sx%s artifact reserves %s", (width, height, aspect) => {
    expect(posterAspect(width, height)).toBe(aspect);
  });

  it("reserves the artifact's own ratio when it has one", () => {
    const { container } = render(<Poster {...BASE} src="/posters/sq.webp" width={1080} height={1080} />);
    expect(media(container)).toHaveClass("aspect-square");
  });

  it("the image's alternative text is the caller's, empty by default — the host renders the title", () => {
    const { container, rerender } = render(<Poster {...BASE} src="/posters/s-1.webp" />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    rerender(<Poster {...BASE} src="/posters/s-1.webp" alt="ملصق جلسة لوحة التحكم" />);
    expect(screen.getByRole("img", { name: "ملصق جلسة لوحة التحكم" })).toBeInTheDocument();
  });

  it("carries a sticker over the image at the inline end", () => {
    const { container } = render(<Poster {...BASE} src="/posters/s-1.webp" sticker={<Sticker>محجوز</Sticker>} />);
    expect(media(container).querySelector(".ms-auto")).toHaveTextContent("محجوز");
  });
});

describe("Poster — the placeholder, until there is one", () => {
  it("is drawn in the team colour, written as --team on the element, with ink on it", () => {
    const { container } = render(<Poster {...BASE} category="جلسة إدارية" date="2 أكتوبر، 6:30 م" />);
    const ph = placeholder(container)!;
    expect(ph.style.getPropertyValue("--team")).toBe("#FF9A2E");
    expect(ph).toHaveClass("bg-team", "text-on-sticker", "[--sticker-ground:var(--team)]");
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(media(container)).toHaveClass("aspect-[4/5]");
  });

  it("★ always names the company — colour is never the only channel", () => {
    render(<Poster {...BASE} />);
    expect(screen.getByText("صنف")).toBeInTheDocument();
  });

  it("carries the category, the title in the display face, and the date — each isolated", () => {
    const { container } = render(<Poster {...BASE} category="جلسة إدارية" date="2 أكتوبر، 6:30 م" />);
    expect(screen.getByText("جلسة إدارية").tagName).toBe("BDI");
    expect(screen.getByText("2 أكتوبر، 6:30 م").tagName).toBe("BDI");
    const title = screen.getByText(BASE.title);
    expect(title.tagName).toBe("BDI");
    expect(title.parentElement).toHaveClass("font-display", "text-play-md", "text-balance");
    expect(container.querySelector("h1, h2, h3, h4, h5, h6")).not.toBeInTheDocument();
  });

  it("clamps a long title on its container, with room for the marks — never a clipped line", () => {
    render(<Poster {...BASE} title="عنوان طويل جدًا يمتد على أسطر كثيرة ليختبر كيف يتوازن النص ويُقصّ على الحاوية لا على السطر" />);
    const p = screen.getByText(/عنوان طويل/).parentElement!;
    expect(p).toHaveClass("line-clamp-4", "pb-[0.2em]");
    expect(p.className).not.toMatch(/\btruncate\b|overflow-hidden/);
  });

  it.each([null, "tangerine", "#FF9A2E;background:url(x)", "#FFF"])("with no valid colour (%j) the ground is the raised surface, and no style is written", (teamColor) => {
    const { container } = render(<Poster {...BASE} teamColor={teamColor} category="تقنية" />);
    const ph = placeholder(container)!;
    expect(ph).toHaveClass("bg-raised", "text-fg-heading");
    expect(ph).not.toHaveAttribute("style");
    expect(screen.getByText("صنف")).toBeInTheDocument();
  });

  it("holds the sticker at the inline end of the top row, on the team's ground", () => {
    render(<Poster {...BASE} category="جلسة إدارية" sticker={<Sticker>+50</Sticker>} />);
    const row = screen.getByText("جلسة إدارية").closest("div")!;
    expect(row).toHaveClass("justify-between");
    expect(row.lastElementChild).toHaveTextContent("+50");
  });

  it("★ draws no QR — a code that scans to nothing looks like one that works", () => {
    const { container } = render(<Poster {...BASE} category="جلسة إدارية" date="2 أكتوبر" />);
    expect(container.querySelector("svg, canvas, [data-qr]")).not.toBeInTheDocument();
  });

  it("does not move: nothing transitions or animates", () => {
    const { container } = render(<Poster {...BASE} />);
    expect(container.innerHTML).not.toMatch(/transition|animate-|duration/);
  });
});

describe("Poster — accessible and readable", () => {
  it("is accessible in every form, inside the scope", async () => {
    const { container } = render(
      <div className="theme-play">
        <Poster {...BASE} category="جلسة إدارية" date="2 أكتوبر، 6:30 م" sticker={<Sticker>محجوز</Sticker>} />
        <Poster {...BASE} teamColor={null} teamName="شركة بلا لون" />
        <Poster {...BASE} src="/posters/s-1.webp" width={1080} height={1350} alt="ملصق الجلسة" />
      </div>,
    );
    await expectAccessible(container);
  });

  // Ink on each of the seven team colours (`globals.css`), and the team colour on the ink label.
  it.each([
    ["silver", "#e9e4d6"],
    ["tangerine", "#ff9a2e"],
    ["magenta", "#ff4fb8"],
    ["cyan", "#35d0ff"],
    ["gold", "#ffd23f"],
    ["violet", "#9b7cff"],
    ["mint", "#3be8b0"],
  ])("ink and %s clear 4.5:1 both ways", (_team, hex) => {
    expect(contrastRatio("#0b0c12", hex)).toBeGreaterThanOrEqual(4.5);
  });
});
