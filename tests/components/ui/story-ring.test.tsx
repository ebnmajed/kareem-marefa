// `<StoryRing>` — REQ-UIX-040, DEC-183 §3, DEC-186 §4 – §5. Four states told apart without colour;
// a button naming the session; static, with no pulse; nothing of the viewer. RTL document.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import type { StoryRingState } from "@/components/ui";
import { StoryRing } from "@/components/ui/story-ring";
import { contrastRatio } from "@/lib/brand/contrast";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const WORD: Record<StoryRingState, string> = { live: "مباشر", recap: "ملخص", upcoming: "قادمة", seen: "شوهدت" };
const STATES = Object.keys(WORD) as StoryRingState[];

function ring(state: StoryRingState, extra: Partial<React.ComponentProps<typeof StoryRing>> = {}) {
  return (
    <StoryRing
      state={state}
      label={`قصة جلسة: العرض في 5 شرائح، ${WORD[state]}`}
      stateLabel={WORD[state]}
      glyph="ع"
      caption="اليوم"
      teamColor="#35D0FF"
      // Wave 18 (DEC-207 §1.5): a ring with no `onOpen` is no longer a button. This suite is about the button,
      // so every ring here opens something; the inert ring's cases are `story-ring-inert.test.tsx`.
      onOpen={() => {}}
      {...extra}
    />
  );
}

function shape(container: HTMLElement) {
  const disc = container.querySelector("button > span")!;
  return {
    disc,
    ring: disc.className.split(/\s+/).filter((c) => /^border/.test(c)).sort().join(" "),
    outer: !!container.querySelector('[data-slot="outer-ring"]'),
    check: !!container.querySelector('[data-slot="seen-mark"]'),
  };
}

describe("StoryRing — a button that names its session", () => {
  it.each(STATES)("%s is a button whose accessible name is the caller's label", (state) => {
    render(ring(state));
    expect(screen.getByRole("button", { name: `قصة جلسة: العرض في 5 شرائح، ${WORD[state]}` })).toHaveAttribute("type", "button");
  });

  it("everything drawn inside is aria-hidden, so nothing is read twice", () => {
    const { container } = render(ring("live"));
    for (const child of container.querySelector("button")!.children) expect(child).toHaveAttribute("aria-hidden", "true");
  });

  it("calls onOpen when pressed — and opens nothing itself", async () => {
    const onOpen = vi.fn();
    render(ring("upcoming", { onOpen }));
    await userEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is at least 44 px", () => {
    const { container } = render(ring("seen"));
    expect(container.querySelector("button")).toHaveClass("min-h-11", "w-[4.25rem]");
    expect(shape(container).disc).toHaveClass("size-15");
  });
});

describe("StoryRing — ★ four states told apart without colour (REQ-UIX-040)", () => {
  it("each state shows its own visible word", () => {
    for (const state of STATES) {
      const { container, unmount } = render(ring(state));
      expect(container.querySelector("button")).toHaveTextContent(WORD[state]);
      unmount();
    }
  });

  it("each state has its own SHAPE — no two alike once colour is taken away", () => {
    const shapes = STATES.map((state) => {
      const { container, unmount } = render(ring(state));
      const s = shape(container);
      // Strip the colour: keep only the ring's width, the outer ring and the check.
      const width = s.ring.includes("border-[3px]") ? "3px" : "1px";
      unmount();
      return `${width}|${s.outer ? "double" : "single"}|${s.check ? "check" : "-"}|${state === "recap" || state === "live" ? "" : "letter"}`;
    });
    // live and recap share a width, so the word and the double ring separate them; upcoming and
    // seen share the letter, so the width and the check separate them.
    expect(new Set(shapes).size).toBe(4);
  });

  it("live is a double ring; only live", () => {
    for (const state of STATES) {
      const { container, unmount } = render(ring(state));
      expect(shape(container).outer, state).toBe(state === "live");
      unmount();
    }
  });

  it("seen is a 1 px ring with a check mark, the letter muted — never faded by opacity", () => {
    const { container } = render(ring("seen"));
    const s = shape(container);
    expect(s.ring).toBe("border border-edge-strong");
    expect(s.check).toBe(true);
    expect(container.querySelector("button")!.innerHTML).not.toMatch(/opacity/);
    expect(screen.getByText("ع").parentElement).toHaveClass("text-fg-muted");
  });

  it("upcoming wears the team as --team on the button, re-checked; no colour is the neutral ring", () => {
    const { container, rerender } = render(ring("upcoming"));
    expect((container.querySelector("button") as HTMLElement).style.getPropertyValue("--team")).toBe("#35D0FF");
    expect(shape(container).disc).toHaveClass("border-team", "border-[3px]");
    for (const bad of [null, "cyan", "#35D0FF;x:y"]) {
      rerender(ring("upcoming", { teamColor: bad }));
      // A rerender leaves an empty `style=""` behind, so the variable itself is what is checked.
      expect((container.querySelector("button") as HTMLElement).style.getPropertyValue("--team")).toBe("");
      expect(shape(container).disc).toHaveClass("border-team-neutral");
    }
  });

  it("only upcoming reads the team colour", () => {
    for (const state of ["live", "recap", "seen"] as const) {
      const { container, unmount } = render(ring(state));
      expect(container.querySelector("button"), state).not.toHaveAttribute("style");
      unmount();
    }
  });
});

describe("StoryRing — still (DEC-186 §4)", () => {
  it.each(STATES)("%s does not pulse, transition or animate — the live ring reads live without motion", (state) => {
    const { container } = render(ring(state));
    expect(container.innerHTML).not.toMatch(/animate-|transition|duration|motion-safe/);
  });
});

describe("StoryRing — accessible", () => {
  it("is accessible, a row of all four, inside the scope", async () => {
    const { container } = render(
      <div className="theme-play flex gap-3">
        {STATES.map((state) => (
          <span key={state}>{ring(state)}</span>
        ))}
      </div>,
    );
    await expectAccessible(container);
  });

  it("the ring colours clear 3:1 on the dark ground (SC 1.4.11), and the words are the text colour", () => {
    for (const hex of ["#ff6e4f", "#c6ff3d", "#35d0ff", "#6b7088"]) expect(contrastRatio(hex, "#0b0c12")).toBeGreaterThanOrEqual(3);
    // The word is never coral: on the light variant's paper coral would fail body text.
    expect(contrastRatio("#ff6e4f", "#f6f3ec")).toBeLessThan(4.5);
  });
});
