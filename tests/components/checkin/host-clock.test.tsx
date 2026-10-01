// SCR-016's clock and live feed — REQ-CHK-001 («the time until it rotates», «the count updates
// live»), REQ-CHK-002, DEC-209. The countdown is counted against the server's read, the page is
// refreshed at the rotation, on a poke and on return to view, and pokes are coalesced.
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import checkin from "@/messages/ar/checkin.json";

const refresh = vi.fn();
let poke: (() => void) | null = null;
const unsubscribe = vi.fn();

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/realtime/channel", () => ({
  subscribeToHostTopic: (_id: string, cb: () => void) => {
    poke = cb;
    return unsubscribe;
  },
}));

const { HostClock } = await import("@/components/checkin/host-clock");

const READ = "2026-10-01T18:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(READ) + seconds * 1000).toISOString();
const SESSION = "11111111-1111-4111-8111-111111111111";

function wrap(node: ReactNode) {
  return (
    <NextIntlClientProvider locale="ar" messages={checkin}>
      {node}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  refresh.mockReset();
  unsubscribe.mockReset();
  poke = null;
});
afterEach(() => vi.useRealTimers());

describe("the countdown (REQ-CHK-001)", () => {
  it("says the time to the rotation from the SERVER's read, in Western digits, and the grace", () => {
    render(wrap(<HostClock sessionId={SESSION} readAt={READ} rotatesAt={at(372)} nextChangeAt={at(372)} graceSeconds={120} listen />));
    const clock = document.querySelector("[data-host-clock]")!;
    expect(clock).toHaveTextContent("يتغيّر بعد 6:12");
    expect(clock).toHaveTextContent("الرمز السابق يُقبل لدقيقتين");
    // A ticking line is never a live region: it would speak every second.
    expect(clock.closest("[aria-live]")).toBeNull();
  });

  it("ticks down by elapsed time, and refreshes once at the rotation", () => {
    render(wrap(<HostClock sessionId={SESSION} readAt={READ} rotatesAt={at(5)} nextChangeAt={at(5)} graceSeconds={120} listen />));
    act(() => vi.advanceTimersByTime(2000));
    expect(document.querySelector("[data-host-clock]")).toHaveTextContent("يتغيّر بعد 0:03");
    expect(refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(3000));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-host-clock]")).toHaveTextContent("يتجدّد الرمز الآن");
  });

  it("with no code there is no countdown, but the day's start still refreshes the page once", () => {
    const { container } = render(wrap(<HostClock sessionId={SESSION} readAt={READ} rotatesAt={null} nextChangeAt={at(60)} graceSeconds={120} listen={false} />));
    expect(container).toBeEmptyDOMElement();
    act(() => vi.advanceTimersByTime(60_000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a grace of zero says the previous code is not accepted", () => {
    render(wrap(<HostClock sessionId={SESSION} readAt={READ} rotatesAt={at(60)} nextChangeAt={at(60)} graceSeconds={0} listen />));
    expect(document.querySelector("[data-host-clock]")).toHaveTextContent("ولا يُقبل الرمز السابق بعدها");
  });
});

describe("the live count (REQ-CHK-001, A18)", () => {
  it("subscribes only while listening, refreshes on a poke, and unsubscribes on unmount", () => {
    const { unmount } = render(wrap(<HostClock sessionId={SESSION} readAt={READ} rotatesAt={at(600)} nextChangeAt={at(600)} graceSeconds={120} listen />));
    expect(poke).not.toBeNull();
    act(() => poke!());
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not subscribe when the day cannot take attendance", () => {
    render(wrap(<HostClock sessionId={SESSION} readAt={READ} rotatesAt={at(600)} nextChangeAt={at(600)} graceSeconds={120} listen={false} />));
    expect(poke).toBeNull();
  });

  it("refreshes when the page becomes visible again", () => {
    render(wrap(<HostClock sessionId={SESSION} readAt={READ} rotatesAt={at(600)} nextChangeAt={at(600)} graceSeconds={120} listen />));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(refresh).toHaveBeenCalled();
  });
});
