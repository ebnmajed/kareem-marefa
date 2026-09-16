// ui/pending-nudge — DEC-135.
//
// The React bug it works around needs a real Flight stream and a yielding
// concurrent render; jsdom has neither, so the lost ping itself is proven on a
// production build (tests/e2e/event-page.spec.ts's reserve, and the lead's
// bisect in DEC-135). What is under test here is the hook's contract: it
// re-renders its component on the interval while pending, and never otherwise.
import { Profiler } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePendingNudge } from "@/components/ui/pending-nudge";

function Nudged({ pending }: { pending: boolean }) {
  usePendingNudge(pending, 300);
  return null;
}

// Commits are counted by a Profiler, so the probe itself stays pure.
const onRender = vi.fn();
const Probe = ({ pending }: { pending: boolean }) => (
  <Profiler id="nudge" onRender={onRender}>
    <Nudged pending={pending} />
  </Profiler>
);
const commits = () => onRender.mock.calls.length;

/** One tick per `act`, so React commits each update instead of batching them. */
function tick(ms: number, times: number) {
  for (let i = 0; i < times; i++) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }
}

describe("usePendingNudge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    onRender.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-renders on the interval while pending", () => {
    render(<Probe pending />);
    const initial = commits();
    tick(300, 3);
    expect(commits() - initial).toBe(3);
  });

  it("never ticks when idle, and stops the moment pending ends", () => {
    const { rerender } = render(<Probe pending={false} />);
    tick(300, 3);
    expect(commits()).toBe(1);

    rerender(<Probe pending />);
    tick(300, 1);
    rerender(<Probe pending={false} />);
    const settled = commits();
    tick(300, 4);
    expect(commits()).toBe(settled);
  });
});
