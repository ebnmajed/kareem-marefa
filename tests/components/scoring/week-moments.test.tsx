// Moments 3 and 5 on the member's week (wave 18, REQ-UIX-055, DEC-206 §5, DEC-207 §1.3, §2).
//
// ★★ One occurrence, two surfaces: whichever the member opens first plays and the other is silent — the
//    week against `SCR-022`'s head, and the week against the monthly board, in both orders.
// ★★ Mount, play, unmount, mount again — silence.
// ★  The copy that is not displayed claims nothing and tells the server nothing.
// ★  Under reduced motion the static state is whole; on a server paint nothing plays and nothing is told.
// ★  A level-up still unseen: the figure counts and the bar stands still.
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentPointsHead, type MomentPointsHeadProps } from "@/components/scoring/moment-points-head";
import { MomentRank } from "@/components/scoring/moment-rank";
import { MomentWeek, WeekFigure, type MomentWeekProps } from "@/components/scoring/moment-week";
import { resetPaintedForTests } from "@/components/scoring/use-seen-moment";
import { ProgressBar } from "@/components/ui/progress-bar";
import { isMomentClaimed, momentKey, resetMomentsForTests } from "@/lib/ui/moment";
import { fakeAnimate, removeFakeAnimate, setDurationTokens, setReducedMotion, type FakeAnimation } from "../lib-ui/motion-env";

let frames: FrameRequestCallback[];
let now: number;
function step(ms: number) {
  now += ms;
  const due = frames;
  frames = [];
  for (const f of due) f(now);
}

const COMPLETION = "e-730";
const RANK = "monthly:2026-09-01:7-4";

function week(over: Partial<MomentWeekProps> = {}): MomentWeekProps {
  return {
    completion: { occurrenceId: COMPLETION, from: 680, to: 730, fromProgress: 680 / 700, moveBar: true },
    rank: { occurrenceId: RANK, from: 7, to: 4 },
    pointsNeedsMark: true,
    rankNeedsMark: true,
    acknowledgePoints: vi.fn(async () => {}),
    acknowledgeRank: vi.fn(async () => {}),
    children: (
      <section>
        <span data-slot="rank">
          <WeekFigure slot="rank" prefix="#" text="#4" />
        </span>
        <span data-slot="rise">↑</span>
        <span data-slot="points">
          <WeekFigure slot="points" text="730" />
        </span>
        <span data-slot="delta">+50</span>
        <span data-slot="level-bar">
          <ProgressBar value={730} max={1500} decorative />
        </span>
      </section>
    ),
    ...over,
  };
}

function head(over: Partial<MomentPointsHeadProps> = {}): MomentPointsHeadProps {
  return {
    heading: "رصيدك ومستواك",
    balanceLabel: "رصيدك",
    total: 730,
    completion: { occurrenceId: COMPLETION, from: 680, fromProgress: 0.95 },
    delta: <>+50</>,
    deltaLabel: "50 نقطة جديدة",
    levelUp: null,
    streak: null,
    bar: null,
    card: null,
    needsMark: true,
    acknowledge: vi.fn(async () => {}),
    ...over,
  };
}

function board(occurrenceId: string | null, acknowledge = vi.fn(async () => {})) {
  return (
    <MomentRank occurrenceId={occurrenceId} index={0} passed={0} fromFraction={null} needsMark acknowledge={acknowledge}>
      <ul>
        <li>أنت</li>
      </ul>
    </MomentRank>
  );
}

let made: FakeAnimation[];
const weekState = (c: HTMLElement) => c.querySelector("[data-moment]")?.getAttribute("data-moment") ?? "static";
const text = (c: HTMLElement, slot: string) => c.querySelector(`[data-slot=${slot}]`)!.textContent;

async function finishAll() {
  await act(async () => {
    step(0);
    step(2000);
    for (const a of made) a.finish();
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

// jsdom lays nothing out, so no element has an offset parent. The gate asks the browser's question; here an
// element is «displayed» unless it sits inside `[data-hidden-copy]` — the CSS-hidden twin of the frame.
function displayOnlyOutsideHiddenCopies() {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.closest("[data-hidden-copy]") ? null : document.body;
    },
  });
}

beforeEach(() => {
  resetMomentsForTests();
  resetPaintedForTests();
  setReducedMotion(false);
  setDurationTokens({ fast: "120ms", base: "220ms", slow: "420ms", party: "900ms" });
  frames = [];
  now = 0;
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  made = fakeAnimate();
  displayOnlyOutsideHiddenCopies();
});
afterEach(() => {
  vi.unstubAllGlobals();
  removeFakeAnimate();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (HTMLElement.prototype as any).offsetParent;
});

describe("the week plays moments 3 and 5", () => {
  it("counts the balance and the rank from what was last seen, fades in the delta and the arrow, grows the bar", () => {
    const { container } = render(<MomentWeek {...week()} />);
    expect(weekState(container)).toBe("playing");
    expect(text(container, "points")).toBe("680");
    expect(text(container, "rank")).toBe("#7");
    const slots = made.map((a) => a.el.getAttribute("data-slot"));
    expect(slots).toEqual(["delta", "fill", "rise"]);
    expect(made[1].keyframes).toEqual([{ transform: `scaleX(${680 / 700})` }, { transform: `scaleX(${730 / 1500})` }]);
    for (const a of made) expect(a.options.fill).toBe("backwards");
  });

  it("★ touches transform and opacity only, with token durations, and leaves no will-change", () => {
    render(<MomentWeek {...week()} />);
    for (const a of made) {
      for (const frame of a.keyframes) for (const prop of Object.keys(frame)) expect(["transform", "opacity", "offset", "easing"]).toContain(prop);
      expect([120, 220, 420, 900]).toContain(a.options.duration);
    }
    for (const el of document.querySelectorAll<HTMLElement>("*")) expect(el.style.willChange).toBe("");
  });

  it("★ tells the server once each moment is done — never before — and ends on the server's figures", async () => {
    const p = week();
    const { container } = render(<MomentWeek {...p} />);
    expect(p.acknowledgePoints).not.toHaveBeenCalled();
    expect(p.acknowledgeRank).not.toHaveBeenCalled();
    await finishAll();
    expect(p.acknowledgePoints).toHaveBeenCalledTimes(1);
    expect(p.acknowledgePoints).toHaveBeenCalledWith();
    expect(p.acknowledgeRank).toHaveBeenCalledTimes(1);
    expect(text(container, "points")).toBe("730");
    expect(text(container, "rank")).toBe("#4");
  });

  it("★★ mount, play, unmount, mount again — silence", async () => {
    const first = render(<MomentWeek {...week()} />);
    await finishAll();
    first.unmount();
    const before = made.length;
    const { container } = render(<MomentWeek {...week()} />);
    expect(weekState(container)).toBe("static");
    expect(made.length).toBe(before);
    expect(text(container, "points")).toBe("730");
  });

  it("★ a level-up still unseen: the figure counts, and the bar stands at its truth", () => {
    render(<MomentWeek {...week({ completion: { occurrenceId: COMPLETION, from: 680, to: 730, fromProgress: 680 / 700, moveBar: false } })} />);
    expect(made.map((a) => a.el.getAttribute("data-slot"))).not.toContain("fill");
    expect(frames.length).toBeGreaterThan(0);
  });
});

describe("★★ one occurrence, two surfaces — whichever opens first plays", () => {
  it("the week first, then SCR-022's head: the head is silent", async () => {
    const w = render(<MomentWeek {...week()} />);
    await finishAll();
    w.unmount();
    const before = made.length;
    render(<MomentPointsHead {...head()} />);
    expect(document.querySelector("[data-moment]")!.getAttribute("data-moment")).toBe("static");
    expect(made.length).toBe(before);
  });

  it("SCR-022's head first, then the week: the week is silent, and its figures are the new ones", async () => {
    const h = render(<MomentPointsHead {...head()} />);
    await finishAll();
    h.unmount();
    const before = made.length;
    const { container } = render(<MomentWeek {...week({ rank: null })} />);
    expect(weekState(container)).toBe("static");
    expect(made.length).toBe(before);
    expect(text(container, "points")).toBe("730");
  });

  it("the week first, then the monthly board: the board is silent", async () => {
    const w = render(<MomentWeek {...week()} />);
    await finishAll();
    w.unmount();
    render(board(RANK));
    expect(document.querySelector("[data-moment]")!.getAttribute("data-moment")).toBe("static");
  });

  it("the monthly board first, then the week: the week's rank is silent", async () => {
    const b = render(board(RANK));
    await finishAll();
    b.unmount();
    const before = made.length;
    const { container } = render(<MomentWeek {...week({ completion: null })} />);
    expect(weekState(container)).toBe("static");
    expect(made.length).toBe(before);
    expect(text(container, "rank")).toBe("#4");
  });
});

describe("★ the copy that is not displayed", () => {
  it("claims nothing, animates nothing, tells nothing — the displayed copy plays", async () => {
    const hidden = week();
    const shown = week();
    render(
      <>
        <div data-hidden-copy="">
          <MomentWeek {...hidden} />
        </div>
        <MomentWeek {...shown} />
      </>,
    );
    for (const a of made) expect(a.el.closest("[data-hidden-copy]")).toBeNull();
    expect(made.length).toBeGreaterThan(0);
    await finishAll();
    expect(hidden.acknowledgePoints).not.toHaveBeenCalled();
    expect(hidden.acknowledgeRank).not.toHaveBeenCalled();
    expect(shown.acknowledgePoints).toHaveBeenCalledTimes(1);
  });

  it("★ a copy committed before it is shown plays when it gets its box — the gate watches, it does not measure once", async () => {
    let observed: (() => void) | null = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          observed = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const p = week();
    const { container } = render(
      <div data-hidden-copy="">
        <MomentWeek {...p} />
      </div>,
    );
    expect(made).toHaveLength(0);
    expect(container.querySelector("[data-moment-copy]")).toHaveAttribute("data-moment-copy", "hidden");
    // The boundary reveals it: the element now has a box.
    container.firstElementChild!.removeAttribute("data-hidden-copy");
    await act(async () => observed!());
    expect(container.querySelector("[data-moment-copy]")).toHaveAttribute("data-moment-copy", "displayed");
    expect(made.length).toBeGreaterThan(0);
    await finishAll();
    expect(p.acknowledgePoints).toHaveBeenCalledTimes(1);
  });

  it("alone, it leaves the occurrence unclaimed for the next surface", () => {
    render(
      <div data-hidden-copy="">
        <MomentWeek {...week()} />
      </div>,
    );
    expect(made).toHaveLength(0);
    expect(isMomentClaimed(momentKey("completion", COMPLETION))).toBe(false);
    expect(isMomentClaimed(momentKey("rank", RANK))).toBe(false);
  });
});

describe("the static states", () => {
  it("★★ under reduced motion: the new figures, the delta and the arrow drawn, nothing animates, and both marks are sent", () => {
    setReducedMotion(true);
    const p = week();
    const { container } = render(<MomentWeek {...p} />);
    expect(weekState(container)).toBe("static");
    expect(made).toHaveLength(0);
    expect(text(container, "points")).toBe("730");
    expect(text(container, "rank")).toBe("#4");
    expect(screen.getByText("+50")).toBeInTheDocument();
    expect(screen.getByText("↑")).toBeInTheDocument();
    expect(p.acknowledgePoints).toHaveBeenCalledTimes(1);
    expect(p.acknowledgeRank).toHaveBeenCalledTimes(1);
  });

  it("★ a server paint (a hard load): static, unclaimed, and the server is told nothing — the next in-app mount plays", () => {
    const p = week({ documentLoad: true });
    const first = render(<MomentWeek {...p} />);
    expect(made).toHaveLength(0);
    expect(p.acknowledgePoints).not.toHaveBeenCalled();
    expect(p.acknowledgeRank).not.toHaveBeenCalled();
    expect(isMomentClaimed(momentKey("completion", COMPLETION))).toBe(false);
    first.unmount();
    const { container } = render(<MomentWeek {...week()} />);
    expect(weekState(container)).toBe("playing");
  });

  it("no occurrence: nothing moves, and a mark that differs is recorded at once", () => {
    const p = week({ completion: null, rank: null });
    render(<MomentWeek {...p} />);
    expect(made).toHaveLength(0);
    expect(p.acknowledgePoints).toHaveBeenCalledTimes(1);
    expect(p.acknowledgeRank).toHaveBeenCalledTimes(1);
  });

  it("with nothing to record, and no rank this month, nothing is sent", () => {
    const p = week({ completion: null, rank: null, pointsNeedsMark: false, rankNeedsMark: false, acknowledgeRank: null });
    render(<MomentWeek {...p} />);
    expect(p.acknowledgePoints).not.toHaveBeenCalled();
  });
});
