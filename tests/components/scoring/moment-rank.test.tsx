// Moment 5, تغيّر الترتيب, on SCR-027 and SCR-028 (wave 16, REQ-UIX-048, REQ-UIX-044, DEC-197 §2).
//
// ★★ Mount, play, unmount, mount again with the same occurrence — silence.
// ★★ The falling row carries no colour, no icon, no shake and no motion of its own — before, during
//    and after; a member whose rank FELL is no occurrence, and nothing moves at all.
// ★★ The static state under reduced motion is complete: the new order, the arrow shown.
// ★ The arrow does not pulse (DEC-197 §2). Transform only; token durations; no will-change.
import { act, render, screen } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentRank, type MomentRankProps } from "@/components/scoring/moment-rank";
import { RaceBar } from "@/components/ui/race-bar";
import { RankRow } from "@/components/ui/rank-row";
import { isMomentClaimed, momentKey, resetMomentsForTests } from "@/lib/ui/moment";
import { resetPaintedForTests } from "@/components/scoring/use-seen-moment";
import { fakeAnimate, removeFakeAnimate, setDurationTokens, setReducedMotion, type FakeAnimation } from "../lib-ui/motion-env";

const ROW = 64;
const NAMES = ["سارة القحطاني", "ريم الشهري", "فهد العنزي", "محمد الدوسري", "نورة الحربي"];

/** Five rows in the NEW order; the viewer is at `self`, and rose from `seen` when given. */
function board(self: number, seen: number | null) {
  return (
    <ul>
      {NAMES.map((name, i) => (
        <RankRow
          key={name}
          rank={i + 1}
          rankLabel={`المرتبة ${i + 1}`}
          memberId={`m-${i}`}
          displayName={name}
          company="صنف"
          teamColor="#ff4fb8"
          points={String(1500 - i * 100)}
          pointsLabel={`${1500 - i * 100} نقطة`}
          selfLabel={i === self ? "أنت" : null}
          movement={i === self && seen !== null ? { previousRank: seen, riseLabel: `تقدّمت ${seen - (i + 1)} مراكز` } : null}
        />
      ))}
    </ul>
  );
}

function Rank({ list, ...over }: Partial<Omit<MomentRankProps, "children">> & { list?: ReactNode } = {}) {
  const p: MomentRankProps = {
    occurrenceId: "all_time:all:4-2",
    index: 1,
    passed: 2,
    fromFraction: null,
    needsMark: true,
    acknowledge: vi.fn(async () => {}),
    children: list ?? board(1, 4),
    ...over,
  };
  return <MomentRank {...p} />;
}

let made: FakeAnimation[];
const moment = () => document.querySelector("[data-moment]")!.getAttribute("data-moment");
const rows = () => Array.from(document.querySelectorAll("ul > li")) as HTMLElement[];

async function finishAll() {
  await act(async () => {
    for (const a of made) a.finish();
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  resetMomentsForTests();
  resetPaintedForTests();
  setReducedMotion(false);
  setDurationTokens({ fast: "120ms", base: "220ms", slow: "420ms", party: "900ms" });
  made = fakeAnimate();
  // jsdom lays nothing out: a row's top is its place in its list, 64 px apart.
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      const parent = this.parentElement;
      return parent ? Array.from(parent.children).indexOf(this) * ROW : 0;
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  removeFakeAnimate();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (HTMLElement.prototype as any).offsetTop;
});

describe("moment 5 on the member board", () => {
  it("the risen row slides up from where it stood, and each row it passed slides down by one — nothing else moves", () => {
    render(<Rank />);
    expect(moment()).toBe("playing");
    const [r0, me, p1, p2, r4] = rows();
    const moved = new Map(made.map((a) => [a.el, a]));
    expect(moved.get(me)!.keyframes).toEqual([{ transform: `translateY(${2 * ROW}px)` }, { transform: "none" }]);
    for (const passed of [p1, p2]) expect(moved.get(passed)!.keyframes).toEqual([{ transform: `translateY(${-ROW}px)` }, { transform: "none" }]);
    expect(moved.has(r0)).toBe(false);
    expect(moved.has(r4)).toBe(false);
    for (const a of made) expect(a.options).toMatchObject({ duration: 420, fill: "backwards" });
  });

  it("★ the arrow is shown and does not move (DEC-197 §2)", () => {
    render(<Rank />);
    const arrow = rows()[1].querySelector("[data-slot=rise]")!;
    expect(arrow).not.toBeNull();
    expect(made.some((a) => a.el === arrow || arrow.contains(a.el))).toBe(false);
    expect(arrow.className).not.toMatch(/animate|moment-/);
  });

  it("★★ the rows it passed carry nothing of their own — before, during and after", async () => {
    const neutral = (el: HTMLElement) => ({ cls: el.className, style: el.getAttribute("style"), rise: el.querySelector("[data-slot=rise]") });
    render(<Rank />);
    const passed = rows().slice(2, 4);
    const during = passed.map(neutral);
    for (const d of during) expect(d).toEqual({ cls: rows()[4].className, style: null, rise: null });
    await finishAll();
    expect(passed.map(neutral)).toEqual(during);
  });

  it("★★ mount, play, unmount, mount again with the same occurrence — silence", async () => {
    const first = render(<Rank />);
    await finishAll();
    first.unmount();
    const before = made.length;
    render(<Rank />);
    expect(moment()).toBe("static");
    expect(made.length).toBe(before);
    // The static state: the new order, the arrow shown.
    expect(rows()[1]).toHaveTextContent("ريم الشهري");
    expect(rows()[1].querySelector("[data-slot=rise]")).not.toBeNull();
  });

  it("★ StrictMode runs every effect twice: it plays once, and tells the server only when done", async () => {
    const acknowledge = vi.fn(async () => {});
    render(
      <StrictMode>
        <Rank acknowledge={acknowledge} />
      </StrictMode>,
    );
    expect(moment()).toBe("playing");
    expect(acknowledge).not.toHaveBeenCalled();
    await finishAll();
    expect(acknowledge).toHaveBeenCalledTimes(1);
  });

  it("★★ a FALL is no occurrence: nothing moves, the row draws no arrow, and it is the neutral row", () => {
    const acknowledge = vi.fn(async () => {});
    // The server says: no occurrence. The row's `movement` records the fall, which the row never draws.
    render(<Rank occurrenceId={null} index={3} passed={0} acknowledge={acknowledge} list={board(3, 2)} />);
    expect(moment()).toBe("static");
    expect(made).toHaveLength(0);
    const fell = rows()[3];
    expect(fell.querySelector("[data-slot=rise]")).toBeNull();
    expect(fell.getAttribute("style")).toBeNull();
    expect(fell.className).not.toMatch(/error|danger|warn|signal|animate|motion|shake/);
    expect(acknowledge).toHaveBeenCalledTimes(1);
  });

  it("an old place below the rows drawn: no swap, the arrow alone", async () => {
    render(<Rank passed={9} />);
    expect(made).toHaveLength(0);
    await finishAll();
    expect(moment()).toBe("static");
  });

  it("★★ the static state under reduced motion is complete: the new order and the arrow, and nothing moves", () => {
    setReducedMotion(true);
    const acknowledge = vi.fn(async () => {});
    render(<Rank acknowledge={acknowledge} />);
    expect(moment()).toBe("static");
    expect(made).toHaveLength(0);
    expect(rows().map((r) => r.querySelector("bdi")!.textContent)).toEqual(["1", "2", "3", "4", "5"]);
    expect(rows()[1]).toHaveTextContent("أنت");
    expect(screen.getByText("تقدّمت 2 مراكز")).toHaveClass("sr-only");
    expect(isMomentClaimed(momentKey("rank", "all_time:all:4-2"))).toBe(true);
    expect(acknowledge).toHaveBeenCalledTimes(1);
  });

  it("★ no will-change, and transform only", () => {
    render(<Rank />);
    for (const a of made) for (const frame of a.keyframes) expect(Object.keys(frame)).toEqual(["transform"]);
    for (const el of document.querySelectorAll<HTMLElement>("*")) expect(el.style.willChange).toBe("");
  });
});

describe("moment 5 on the company board", () => {
  const race = (
    <ul>
      {[
        ["مواهب", 1, "9.4"],
        ["صنف", 0.78, "7.3"],
        ["جذر", 0.6, "5.6"],
      ].map(([name, fraction, value], i) => (
        <RaceBar
          key={String(name)}
          companyName={String(name)}
          teamColor="#3fd0ff"
          rank={i + 1}
          rankLabel={`المرتبة ${i + 1}`}
          value={String(value)}
          metricLabel="الترتيب حسبه: نقاط لكل عضو نشط"
          fraction={Number(fraction)}
          ownLabel={i === 1 ? "فريقك" : null}
        />
      ))}
    </ul>
  );

  it("the own company's bar grows by scaleX from where it was — after the swap when it rose", () => {
    render(<Rank occurrenceId="company:2026-09-01:c:3-2:0.5-0.78" index={1} passed={1} fromFraction={0.5} list={race} />);
    const bar = made.find((a) => a.el.getAttribute("data-slot") === "fill")!;
    expect(bar.keyframes).toEqual([{ transform: "scaleX(0.5)" }, { transform: "scaleX(0.78)" }]);
    expect(bar.options).toMatchObject({ duration: 900, delay: 420, fill: "backwards" });
    expect(bar.el.closest("li")).toBe(rows()[1]);
  });

  it("★★ mount, play, unmount, mount again — silence", async () => {
    const tree = <Rank occurrenceId="company:2026-09-01:c:2-2:0.5-0.78" index={1} passed={0} fromFraction={0.5} list={race} />;
    const first = render(tree);
    expect(made).toHaveLength(1);
    await finishAll();
    first.unmount();
    render(tree);
    expect(made).toHaveLength(1);
    expect(moment()).toBe("static");
  });
});
