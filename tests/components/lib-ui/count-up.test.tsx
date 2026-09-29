import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { easeOutCubic, useCountUp } from "@/lib/ui/count-up";
import { parseCssTime, readDuration } from "@/lib/ui/duration";
import { setDurationTokens, setReducedMotion } from "./motion-env";

let frames: FrameRequestCallback[];
let now: number;

function step(ms: number) {
  now += ms;
  const due = frames;
  frames = [];
  for (const f of due) f(now);
}

function Figure(props: { from: number; to: number; play: boolean; onDone?: () => void }) {
  return <p data-testid="n">{useCountUp({ ...props, duration: "party" })}</p>;
}
const shown = () => screen.getByTestId("n").textContent;

beforeEach(() => {
  setReducedMotion(false);
  setDurationTokens({ party: "900ms" });
  frames = [];
  now = 0;
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f));
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("useCountUp", () => {
  it("counts from the old balance to the new, and says when it is done", () => {
    const onDone = vi.fn();
    render(<Figure from={680} to={730} play onDone={onDone} />);
    expect(shown()).toBe("680");
    act(() => step(0));
    act(() => step(450));
    const mid = Number(shown()!.replace(/\D/g, ""));
    expect(mid).toBeGreaterThan(680);
    expect(mid).toBeLessThan(730);
    act(() => step(500));
    expect(shown()).toBe("730");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("★ not playing, it shows the new figure — the static state", () => {
    render(<Figure from={680} to={730} play={false} />);
    expect(shown()).toBe("730");
    expect(frames).toHaveLength(0);
  });

  it("★ under reduced motion it sets the final value at once", () => {
    setReducedMotion(true);
    const onDone = vi.fn();
    render(<Figure from={680} to={730} play onDone={onDone} />);
    expect(shown()).toBe("730");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(0);
  });

  it("★ Western digits at every frame (DEC-124)", () => {
    render(<Figure from={1200} to={12500} play />);
    for (let i = 0; i < 12; i++) {
      act(() => step(80));
      expect(shown()).toMatch(/^[0-9,]+$/);
    }
  });

  it("a new onDone identity on a re-render does not restart the count", () => {
    const { rerender } = render(<Figure from={0} to={100} play onDone={() => {}} />);
    act(() => step(0));
    act(() => step(600));
    const before = shown();
    rerender(<Figure from={0} to={100} play onDone={() => {}} />);
    expect(shown()).toBe(before);
  });
});

describe("the duration reader", () => {
  it("reads a token as milliseconds", () => {
    setDurationTokens({ slow: "420ms", party: ".9s" });
    expect(readDuration("slow")).toBe(420);
    expect(readDuration("party")).toBe(900);
  });

  it("is 0 under reduced motion and for anything it cannot read", () => {
    expect(parseCssTime("")).toBe(0);
    expect(parseCssTime("fast")).toBe(0);
    setReducedMotion(true);
    expect(readDuration("party")).toBe(0);
  });

  it("cubic ease-out is 0 at the start and 1 at the end", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
