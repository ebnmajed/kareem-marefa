// ui/route-progress + ui/link's reporter — `16` §7.1.1, REQ-UIX-006.
//
// `useLinkStatus()` only has a value inside a real `next/link` under the app
// router, so the hook is mocked: what is under test is the store between the
// two halves and the threshold, which is the part that decides whether
// a member sees a flash of noise or a truthful wait (DEC-288: the mark breathes).
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const linkStatus = { pending: false };
vi.mock("next/link", () => ({ useLinkStatus: () => linkStatus }));

import { LinkPendingReporter, pendingLinkCount, usePendingLongerThan } from "@/components/ui/route-progress";

describe("LinkPendingReporter", () => {
  afterEach(() => {
    linkStatus.pending = false;
  });

  it("counts itself into the store while its link is pending, and out again when it unmounts", () => {
    linkStatus.pending = true;
    const { container, unmount } = render(<LinkPendingReporter />);
    expect(pendingLinkCount()).toBe(1);
    expect(container.querySelector("[data-link-pending]")).toHaveAttribute("aria-hidden");
    unmount();
    expect(pendingLinkCount()).toBe(0);
  });

  it("draws nothing and counts nothing when the link is idle", () => {
    const { container } = render(<LinkPendingReporter />);
    expect(pendingLinkCount()).toBe(0);
    expect(container.innerHTML).toBe("");
  });

  it("`quiet` suppresses the dot but still reports, so the mark is not lied to", () => {
    linkStatus.pending = true;
    const { container, unmount } = render(<LinkPendingReporter quiet />);
    expect(container.querySelector("[data-link-pending]")).toBeNull();
    expect(pendingLinkCount()).toBe(1);
    unmount();
  });
});

describe("usePendingLongerThan — what the breathing mark reads (DEC-288)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    linkStatus.pending = false;
  });

  function Probe({ ms }: { ms: number }) {
    return usePendingLongerThan(ms) ? <span data-waiting="" /> : null;
  }

  it("stays false below the threshold — a wait that short is not a wait", () => {
    linkStatus.pending = true;
    const { container } = render(
      <>
        <LinkPendingReporter quiet />
        <Probe ms={400} />
      </>,
    );
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(container.querySelector("[data-waiting]")).toBeNull();
  });

  it("turns true past the threshold, and false the moment nothing is pending", () => {
    linkStatus.pending = true;
    const view = render(
      <>
        <LinkPendingReporter quiet />
        <Probe ms={400} />
      </>,
    );
    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(view.container.querySelector("[data-waiting]")).not.toBeNull();
    linkStatus.pending = false;
    view.rerender(
      <>
        <LinkPendingReporter quiet />
        <Probe ms={400} />
      </>,
    );
    expect(view.container.querySelector("[data-waiting]")).toBeNull();
  });
});
