// ui/route-progress + ui/link's reporter — `16` §7.1.1, REQ-UIX-006.
//
// `useLinkStatus()` only has a value inside a real `next/link` under the app
// router, so the hook is mocked: what is under test is the store between the
// two halves and the 150 ms threshold, which is the part that decides whether
// a member sees a flash of noise or a truthful bar.
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const linkStatus = { pending: false };
vi.mock("next/link", () => ({ useLinkStatus: () => linkStatus }));

import { LinkPendingReporter, RouteProgress, pendingLinkCount } from "@/components/ui/route-progress";

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

  it("`quiet` suppresses the dot but still reports, so the bar is not lied to", () => {
    linkStatus.pending = true;
    const { container, unmount } = render(<LinkPendingReporter quiet />);
    expect(container.querySelector("[data-link-pending]")).toBeNull();
    expect(pendingLinkCount()).toBe(1);
    unmount();
  });
});

describe("RouteProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    linkStatus.pending = false;
  });

  it("stays hidden below the 150 ms threshold — a bar that flashes is noise", () => {
    linkStatus.pending = true;
    const { container } = render(
      <>
        <LinkPendingReporter quiet />
        <RouteProgress />
      </>,
    );
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(container.querySelector("[data-route-progress]")).toBeNull();
  });

  it("appears once a navigation has been pending past the threshold, hidden from assistive technology", () => {
    linkStatus.pending = true;
    const { container } = render(
      <>
        <LinkPendingReporter quiet />
        <RouteProgress />
      </>,
    );
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(container.querySelector("[data-route-progress]")).toHaveAttribute("aria-hidden");
  });

  it("goes away when nothing is pending any more", () => {
    linkStatus.pending = true;
    const view = render(
      <>
        <LinkPendingReporter quiet />
        <RouteProgress />
      </>,
    );
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(view.container.querySelector("[data-route-progress]")).not.toBeNull();
    linkStatus.pending = false;
    view.rerender(
      <>
        <LinkPendingReporter quiet />
        <RouteProgress />
      </>,
    );
    expect(view.container.querySelector("[data-route-progress]")).toBeNull();
  });
});
