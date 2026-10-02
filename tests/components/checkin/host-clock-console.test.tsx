// SCR-044's code card — `HostClock`'s add-only `variant="console"` (DEC-228 §4.6, REQ-UIX-090, REQ-CHK-001).
// The console draws the bare time to the rotation and keeps every refresh the host view has; nothing in it moves
// (REQ-UIX-053). `host-clock.test.tsx` is the default's proof and is untouched.
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import checkin from "@/messages/ar/checkin.json";

const refresh = vi.fn();
let poke: (() => void) | null = null;

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/realtime/channel", () => ({
  subscribeToHostTopic: (_id: string, cb: () => void) => {
    poke = cb;
    return () => {};
  },
}));

const { HostClock } = await import("@/components/checkin/host-clock");

const READ = "2026-10-01T18:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(READ) + seconds * 1000).toISOString();
const SESSION = "11111111-1111-4111-8111-111111111111";

const wrap = (node: ReactNode) => (
  <NextIntlClientProvider locale="ar" messages={checkin}>
    {node}
  </NextIntlClientProvider>
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  refresh.mockReset();
  poke = null;
});
afterEach(() => vi.useRealTimers());

describe("HostClock, variant console", () => {
  it("is the bare m:ss in Western digits — no sentence, no grace, no icon, and never a live region", () => {
    const { container } = render(wrap(<HostClock variant="console" sessionId={SESSION} readAt={READ} rotatesAt={at(372)} nextChangeAt={at(372)} graceSeconds={120} listen />));
    const clock = container.querySelector("[data-host-clock]")!;
    expect(clock.textContent).toBe("6:12");
    expect(container.querySelector("svg")).toBeNull();
    expect(clock.closest("[aria-live]")).toBeNull();
  });

  it("ticks, refreshes once at the rotation, and refreshes on a poke from the room", () => {
    const { container } = render(wrap(<HostClock variant="console" sessionId={SESSION} readAt={READ} rotatesAt={at(5)} nextChangeAt={at(5)} graceSeconds={120} listen />));
    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelector("[data-host-clock]")!.textContent).toBe("0:03");
    act(() => vi.advanceTimersByTime(3000));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-host-clock]")!.textContent).toBe("0:00");
    act(() => poke?.());
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("with no code it draws nothing", () => {
    const { container } = render(wrap(<HostClock variant="console" sessionId={SESSION} readAt={READ} rotatesAt={null} nextChangeAt={at(60)} graceSeconds={120} listen={false} />));
    expect(container.querySelector("[data-host-clock]")).toBeNull();
  });
});
