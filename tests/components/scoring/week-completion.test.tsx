// Moment 3 on the event page's outcome card (wave 18 PR B, REQ-UIX-061, DEC-206 §5, DEC-209).
//
// ★★ One occurrence, three surfaces: the home's week, SCR-022's head and the outcome card share
//    `completion:<entry>` — whichever opens first plays, the others are silent, in both orders.
// ★★ Mount, play, unmount, mount again — silence.
// ★  No occurrence (the award already seen): static, and the card tells the server nothing.
// ★  Reduced motion, a server paint, the copy not displayed.
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompletionFigure, MomentCompletion, type MomentCompletionProps } from "@/components/scoring/moment-completion";
import { MomentPointsHead } from "@/components/scoring/moment-points-head";
import { MomentWeek, WeekFigure } from "@/components/scoring/moment-week";
import { resetPaintedForTests } from "@/components/scoring/use-seen-moment";
import { isMomentClaimed, momentKey, resetMomentsForTests } from "@/lib/ui/moment";
import { fakeAnimate, removeFakeAnimate, setDurationTokens, setReducedMotion } from "../lib-ui/motion-env";

let frames: FrameRequestCallback[];
let now: number;
function step(ms: number) {
  now += ms;
  const due = frames;
  frames = [];
  for (const f of due) f(now);
}

const ENTRY = "e-750";

function card(over: Partial<MomentCompletionProps> = {}): MomentCompletionProps {
  return {
    occurrenceId: ENTRY,
    points: 20,
    needsMark: true,
    acknowledge: vi.fn(async () => {}),
    children: (
      <p data-slot="award">
        +<CompletionFigure text="20" />
      </p>
    ),
    ...over,
  };
}

const state = (c: HTMLElement) => c.querySelector("[data-moment-copy]")!.getAttribute("data-moment") ?? "static";
const figure = (c: HTMLElement) => c.querySelector("[data-slot=award]")!.textContent;

async function finishAll() {
  await act(async () => {
    step(0);
    step(2000);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

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
  fakeAnimate();
  displayOnlyOutsideHiddenCopies();
});
afterEach(() => {
  vi.unstubAllGlobals();
  removeFakeAnimate();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (HTMLElement.prototype as any).offsetParent;
});

describe("the outcome card plays moment 3", () => {
  it("counts the award from zero to what was paid, then tells the server once — never before", async () => {
    const p = card();
    const { container } = render(<MomentCompletion {...p} />);
    expect(state(container)).toBe("playing");
    expect(figure(container)).toBe("+0");
    expect(p.acknowledge).not.toHaveBeenCalled();
    await finishAll();
    expect(figure(container)).toBe("+20");
    expect(p.acknowledge).toHaveBeenCalledTimes(1);
    expect(p.acknowledge).toHaveBeenCalledWith();
  });

  it("★★ mount, play, unmount, mount again — silence", async () => {
    const first = render(<MomentCompletion {...card()} />);
    await finishAll();
    first.unmount();
    const { container } = render(<MomentCompletion {...card()} />);
    expect(state(container)).toBe("static");
    expect(frames).toHaveLength(0);
    expect(figure(container)).toBe("+20");
  });

  it("★ the award already seen: static, and the card tells nothing — it is not a balance surface", () => {
    const p = card({ occurrenceId: null });
    const { container } = render(<MomentCompletion {...p} />);
    expect(figure(container)).toBe("+20");
    expect(frames).toHaveLength(0);
    expect(p.acknowledge).not.toHaveBeenCalled();
  });

  it("★★ under reduced motion: the amount at once, claimed, and the server told", () => {
    setReducedMotion(true);
    const p = card();
    const { container } = render(<MomentCompletion {...p} />);
    expect(state(container)).toBe("static");
    expect(figure(container)).toBe("+20");
    expect(frames).toHaveLength(0);
    expect(isMomentClaimed(momentKey("completion", ENTRY))).toBe(true);
    expect(p.acknowledge).toHaveBeenCalledTimes(1);
  });

  it("★ a server paint: static, unclaimed, untold — the next in-app arrival plays", () => {
    const p = card({ documentLoad: true });
    const first = render(<MomentCompletion {...p} />);
    expect(frames).toHaveLength(0);
    expect(p.acknowledge).not.toHaveBeenCalled();
    expect(isMomentClaimed(momentKey("completion", ENTRY))).toBe(false);
    first.unmount();
    const { container } = render(<MomentCompletion {...card()} />);
    expect(state(container)).toBe("playing");
  });

  it("★ the copy not displayed claims nothing and tells nothing; the displayed one plays", async () => {
    const hidden = card();
    const shown = card();
    render(
      <>
        <div data-hidden-copy="">
          <MomentCompletion {...hidden} />
        </div>
        <MomentCompletion {...shown} />
      </>,
    );
    await finishAll();
    expect(hidden.acknowledge).not.toHaveBeenCalled();
    expect(shown.acknowledge).toHaveBeenCalledTimes(1);
  });
});

describe("★★ one occurrence — the home's week, SCR-022's head and the outcome card", () => {
  const week = () => (
    <MomentWeek
      completion={{ occurrenceId: ENTRY, from: 730, to: 750, fromProgress: 0.5, moveBar: true }}
      rank={null}
      pointsNeedsMark
      rankNeedsMark={false}
      acknowledgePoints={vi.fn(async () => {})}
      acknowledgeRank={null}
    >
      <span data-slot="points">
        <WeekFigure slot="points" text="750" />
      </span>
    </MomentWeek>
  );

  it("home, then the event page: the card is silent", async () => {
    const home = render(week());
    await finishAll();
    home.unmount();
    const { container } = render(<MomentCompletion {...card()} />);
    expect(state(container)).toBe("static");
    expect(figure(container)).toBe("+20");
    expect(frames).toHaveLength(0);
  });

  it("the event page, then home: the week is silent", async () => {
    const event = render(<MomentCompletion {...card()} />);
    await finishAll();
    event.unmount();
    const { container } = render(week());
    expect(container.querySelector("[data-moment-copy]")!.getAttribute("data-moment")).toBe("static");
    expect(container.querySelector("[data-slot=points]")!.textContent).toBe("750");
  });

  it("the event page, then SCR-022: the head is silent", async () => {
    const event = render(<MomentCompletion {...card()} />);
    await finishAll();
    event.unmount();
    render(
      <MomentPointsHead
        heading="رصيدك ومستواك"
        balanceLabel="رصيدك"
        total={750}
        completion={{ occurrenceId: ENTRY, from: 730, fromProgress: 0.5 }}
        delta={<>+20</>}
        deltaLabel="20 نقطة جديدة"
        levelUp={null}
        streak={null}
        bar={null}
        card={null}
        needsMark
        acknowledge={vi.fn(async () => {})}
      />,
    );
    expect(document.querySelector("[data-moment]")!.getAttribute("data-moment")).toBe("static");
  });
});
