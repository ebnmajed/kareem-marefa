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
    expect(title.parentElement).toHaveClass("font-display", "font-extrabold", "text-balance", "@min-[18rem]:text-play-md");
    expect(container.querySelector("h1, h2, h3, h4, h5, h6")).not.toBeInTheDocument();
  });

  // ★ The lead's gallery review at 390 px: the title was clipped mid-glyph when the poster was
  // small. jsdom lays nothing out, so these hold the SHAPE of the fix; the gallery spec measures it.
  describe("★ every line of the title is whole, and none is hidden", () => {
    const LONG = "عنوان طويل جدًا يمتد على أسطر كثيرة ليختبر كيف يتوازن النص ويُقصّ على الحاوية لا على السطر";

    function title() {
      render(<Poster {...BASE} title={LONG} category="اختبار" date="2 أكتوبر" />);
      return screen.getByText(/عنوان طويل/).parentElement!;
    }

    it("is never clamped: a hidden Arabic line leaks its stacked marks, and the clamp's ellipsis cut letters from a word", () => {
      const p = title();
      expect(p.className).not.toMatch(/line-clamp|truncate|overflow-hidden|overflow-clip/);
    });

    it("never shrinks — and neither do the rows around it, so the meta line stays whole", () => {
      const p = title();
      expect(p).toHaveClass("shrink-0");
      expect(p.nextElementSibling).toHaveClass("shrink-0");
      expect(p.previousElementSibling).toHaveClass("shrink-0");
    });

    it("carries no padding of its own", () => {
      expect(title().className).not.toMatch(/(?:^|\s)(?:@[^\s]*:)?p[bty]?-/);
    });

    it("sits at the house heading's line height, 1.4, at every size — never the display scale's 1.15", () => {
      const cls = title().className.split(/\s+/);
      expect(cls).toEqual(expect.arrayContaining(["leading-[1.4]", "@min-[14rem]:leading-[1.4]", "@min-[18rem]:leading-[1.4]"]));
      // Every display size it takes is followed by the same variant's line height.
      for (const size of cls.filter((c) => /text-play-/.test(c))) {
        const variant = size.slice(0, size.lastIndexOf(":") + 1);
        expect(cls, size).toContain(`${variant}leading-[1.4]`);
      }
    });

    it("steps its size by the poster's own width (a container query), and the small captions with it", () => {
      const p = title();
      expect(p.parentElement).toHaveClass("@container");
      expect(p).toHaveClass("text-base", "@min-[11rem]:text-lg", "@min-[14rem]:text-play-sm", "@min-[18rem]:text-play-md");
      expect(p.nextElementSibling).toHaveClass("@max-[8.5rem]:text-[0.8125rem]");
    });

    it("the placeholder's box may GROW: 4:5 at least, clipping nothing, the placeholder filling it", () => {
      const { container } = render(<Poster {...BASE} title={LONG} />);
      const box = media(container);
      expect(box).toHaveClass("aspect-[4/5]", "rounded-tile");
      // An aspect-ratio box takes its content's height as a minimum only while nothing clips.
      expect(box.className).not.toMatch(/overflow-(hidden|clip)/);
      expect(placeholder(container)).toHaveClass("min-h-full", "rounded-tile");
    });

    it("the rendered poster does not grow: it stays in CardMedia's reserved, clipping box", () => {
      const { container } = render(<Poster {...BASE} src="/posters/s-1.webp" />);
      expect(media(container)).toHaveClass("overflow-hidden", "aspect-[4/5]");
      expect(media(container).className).not.toMatch(/min-h-fit/);
    });
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
