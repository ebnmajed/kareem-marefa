// REQ-CHK-019 (DEC-254 §6, DEC-255 D2) — with rotation off («لا يتغيّر»), every surface that prints a period or a
// countdown prints NOTHING in its place: the host view (SCR-016), check-in's rules line (SCR-014) and SCR-044's code
// card. The code is still shown, and the view still refreshes at the instant the day's one code stops (`validUntil`).
// The rotating cases are pinned by `host-screen`, `check-in-screen-rebuild`, `host-clock` and `host-clock-console`,
// all untouched.
import type { ReactElement, ReactNode } from "react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import checkin from "@/messages/ar/checkin.json";
import sessions from "@/messages/ar/sessions.json";
import ui from "@/messages/ar/ui.json";
import type { CheckInScreenData, HostViewData } from "@/lib/dal/checkin";

const messages = { ...checkin, ...sessions, ...ui };
const refresh = vi.fn();

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));
vi.mock("@/lib/dal/session", () => ({ requireSession: async () => ({ role: "admin" }) }));
vi.mock("@/lib/dal/checkin", () => ({
  getHostView: vi.fn(),
  listUncheckedConfirmedRsvps: vi.fn(async () => []),
  getCheckInScreenData: vi.fn(),
  getConflictTitle: vi.fn(async () => null),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async (arg: string | { namespace: string }) =>
    createTranslator({ locale: "ar", messages, namespace: (typeof arg === "string" ? arg : arg.namespace) as "checkin" }),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ refresh, push: () => {} }),
}));
vi.mock("@/components/ui/route-progress", () => ({ LinkPendingReporter: () => null }));
vi.mock("@/lib/realtime/channel", () => ({ subscribeToHostTopic: () => () => {} }));
vi.mock("@/app/[locale]/app/sessions/[id]/host/actions", () => {
  const bound = Object.assign(async () => {}, { bind: () => async () => {} });
  return { markManuallyAction: bound, revokeCodeAction: bound, setCheckInOpenAction: bound };
});
vi.mock("@/app/[locale]/app/admin/sessions/[id]/attendance/actions", () => {
  const bound = Object.assign(async () => {}, { bind: () => async () => {} });
  return { revokeCodeAction: bound, setCheckInOpenAction: bound };
});
vi.mock("@/components/checkin/award-state", () => ({ AwardState: () => <section data-testid="award-section" /> }));
vi.mock("@/components/checkin/moment-check-in-rest", () => ({ CheckInRest: () => <div data-testid="static-state" /> }));
vi.mock("@/components/checkin/check-in-session-row", () => ({ CheckInSessionRow: () => <div data-testid="session-row" /> }));
vi.mock("@/components/checkin/earn-panel", () => ({ EarnPanel: () => <div data-testid="earn-panel" /> }));
vi.mock("@/app/[locale]/app/sessions/[id]/check-in/actions", () => ({
  submitCheckInForm: Object.assign(async () => {}, { bind: () => async () => {} }),
  checkInForMoment: Object.assign(async () => ({ checkInId: "x" }), { bind: () => async () => ({ checkInId: "x" }) }),
}));

const { getHostView, getCheckInScreenData } = await import("@/lib/dal/checkin");
const { default: HostPage } = await import("@/app/[locale]/app/sessions/[id]/host/page");
const { default: CheckInPage } = await import("@/app/[locale]/app/sessions/[id]/check-in/page");
const { CodeCard } = await import("@/app/[locale]/app/admin/sessions/[id]/attendance/_components/code-card");
const { HostClock } = await import("@/components/checkin/host-clock");

const SESSION = "11111111-1111-4111-8111-111111111111";
const DAY = { id: "22222222-2222-4222-8222-222222222222", position: 1, startsAt: "2026-10-01T15:00:00.000Z", endsAt: "2026-10-01T19:00:00.000Z" };
const READ = "2026-10-01T17:57:48.000Z";
const CEILING = "2026-10-01T21:00:00.000Z";

/** The whole-day code: no rotation, valid to the day's ceiling. */
const view = (over: Partial<HostViewData> = {}): HostViewData => ({
  sessionId: SESSION,
  code: "M7K2QX",
  phase: "live",
  startsAt: DAY.startsAt,
  allowWalkIns: true,
  checkInOpen: true,
  validFrom: "2026-10-01T15:00:00.000Z",
  validUntil: CEILING,
  checkInCount: 23,
  rotationSeconds: null,
  consoleActive: true,
  day: DAY,
  dayCount: 1,
  timeZone: "Asia/Riyadh",
  title: "العرض في 5 شرائح",
  venueName: "قاعة الرياض",
  rotatesAt: null,
  readAt: READ,
  graceSeconds: 120,
  closesAt: CEILING,
  capacity: 40,
  walkInCount: 3,
  ...over,
});

const data = (over: Partial<CheckInScreenData> = {}): CheckInScreenData => ({
  sessionId: SESSION,
  title: "جلسة اختبار",
  phase: "live",
  relation: "confirmed",
  allowWalkIns: false,
  canAttemptCheckIn: true,
  ineligibleReason: null,
  day: null,
  dayCount: 1,
  timeZone: "Asia/Riyadh",
  checkedInToday: false,
  arrivedAt: null,
  teamColor: null,
  rotationSeconds: null,
  venueName: null,
  startsAt: null,
  requireAllDays: true,
  ...over,
});

const wrap = (node: ReactNode) => (
  <NextIntlClientProvider locale="ar" messages={messages}>
    {node}
  </NextIntlClientProvider>
);

beforeEach(() => {
  refresh.mockReset();
  vi.mocked(getHostView).mockReset();
  vi.mocked(getCheckInScreenData).mockReset();
});

describe("SCR-016, the host view — rotation off", () => {
  it("the code on the wall, and no countdown and no grace sentence in its place", async () => {
    vi.mocked(getHostView).mockResolvedValue(view());
    const tree = (await HostPage({ params: Promise.resolve({ locale: "ar", id: SESSION }), searchParams: Promise.resolve({}) })) as ReactElement;
    const { container } = render(wrap(tree));
    expect(document.querySelector("p[dir='ltr']")!.textContent).toBe("M7K2QX");
    expect(container.querySelector("[data-host-clock]")).toBeNull();
    expect(container).not.toHaveTextContent("يتغيّر");
    expect(container).not.toHaveTextContent("الرمز السابق");
  });
});

describe("SCR-014, check-in's rules line — rotation off (DEC-255 D2)", () => {
  async function show(screenData: CheckInScreenData) {
    vi.mocked(getCheckInScreenData).mockResolvedValue(screenData);
    const tree = (await CheckInPage({ params: Promise.resolve({ locale: "ar", id: SESSION }), searchParams: Promise.resolve({}) })) as ReactElement;
    return render(tree);
  }

  it("walk-ins allowed: the walk-in sentence alone — no period and no sentence in its place", async () => {
    const { container } = await show(data({ allowWalkIns: true }));
    expect(container).toHaveTextContent("لا حاجة لحجز مسبق.");
    expect(container).not.toHaveTextContent("يتغيّر");
    expect(container).not.toHaveTextContent("ويُقبل أثناء الجلسة فقط");
  });

  it("walk-ins off: no rules paragraph at all, never an empty one", async () => {
    const { container } = await show(data({ allowWalkIns: false }));
    expect(container).not.toHaveTextContent("يتغيّر");
    const empty = [...container.querySelectorAll("p.text-caption")].filter((p) => p.textContent?.trim() === "");
    expect(empty).toHaveLength(0);
  });
});

describe("SCR-044's code card — rotation off", () => {
  it("the code, and no «يتغيّر بعد» — not even for a screen reader — and no clock", async () => {
    const tree = (await CodeCard({ locale: "ar", sessionId: SESSION, view: view(), day: DAY, finalRate: null, startsAt: null, dayStarted: true })) as ReactElement;
    const { container } = render(wrap(tree));
    expect(container.querySelector("p[dir='ltr']")!.textContent).toBe("M7K2QX");
    expect(container).not.toHaveTextContent("يتغيّر بعد");
    expect(container.querySelector("[data-host-clock]")).toBeNull();
  });

  it("a rotating code still says «يتغيّر بعد» to a screen reader (unchanged)", async () => {
    const tree = (await CodeCard({ locale: "ar", sessionId: SESSION, view: view({ rotationSeconds: 600, rotatesAt: "2026-10-01T18:04:00.000Z" }), day: DAY, finalRate: null, startsAt: null, dayStarted: true })) as ReactElement;
    const { container } = render(wrap(tree));
    expect(container).toHaveTextContent("يتغيّر بعد");
  });
});

describe("HostClock with no rotation — the refresh at the day's end", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] }));
  afterEach(() => vi.useRealTimers());

  it("draws nothing, and refreshes once when the day's one code stops", () => {
    const stop = new Date(Date.parse(READ) + 5_000).toISOString();
    const { container } = render(wrap(<HostClock sessionId={SESSION} readAt={READ} rotatesAt={null} nextChangeAt={stop} graceSeconds={120} listen />));
    expect(container.querySelector("[data-host-clock]")).toBeNull();
    act(() => vi.advanceTimersByTime(4_000));
    expect(refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("★ the host view hands it the code's validUntil, so the wall turns at the ceiling", async () => {
    const stop = new Date(Date.parse(READ) + 5_000).toISOString();
    vi.mocked(getHostView).mockResolvedValue(view({ validUntil: stop }));
    const tree = (await HostPage({ params: Promise.resolve({ locale: "ar", id: SESSION }), searchParams: Promise.resolve({}) })) as ReactElement;
    render(wrap(tree));
    act(() => vi.advanceTimersByTime(4_000));
    expect(refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("★ and SCR-044's code card the same", async () => {
    const stop = new Date(Date.parse(READ) + 5_000).toISOString();
    const tree = (await CodeCard({ locale: "ar", sessionId: SESSION, view: view({ validUntil: stop }), day: DAY, finalRate: null, startsAt: null, dayStarted: true })) as ReactElement;
    render(wrap(tree));
    act(() => vi.advanceTimersByTime(5_000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
