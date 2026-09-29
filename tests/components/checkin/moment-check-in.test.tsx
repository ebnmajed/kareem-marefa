// Moment 2, تسجيل الحضور — REQ-UIX-046, REQ-UIX-044, DEC-195 §2.1, DEC-197 §1.
//
// Renders the REAL static state (`CheckInRest`, against the real ar catalogue,
// with only `scoring`'s `getSessionAwardState()` mocked) inside the real client
// surface and form. The browser's Web Animations API and `matchMedia` are the
// lead's stand-ins (`tests/components/lib-ui/motion-env.ts`).
//
// ★★ What is pinned: the moment plays from the ACTION'S RESULT and from nothing
// else; mount, play, unmount, mount again with the same check-in — silence; a
// reload (no result) is the static state, never a particle and never a return;
// under reduced motion the static state is complete and still returns after the
// hold (a timing, not a motion — DEC-197 §1); a refusal never animates; no
// `will-change` survives; the coin never draws `+0`.
import type { ReactElement, ReactNode } from "react";
import { createTranslator } from "next-intl";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import checkin from "@/messages/ar/checkin.json";
import sessions from "@/messages/ar/sessions.json";
import type { SessionAwardState } from "@/lib/dal/points";
import { resetMomentsForTests } from "@/lib/ui/moment";
import { fakeAnimate, removeFakeAnimate, setDurationTokens, setReducedMotion, type FakeAnimation } from "../lib-ui/motion-env";

const messages = { ...checkin, ...sessions };
const push = vi.fn();

vi.mock("@/lib/dal/points", () => ({ getSessionAwardState: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "checkin" }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push }),
}));

const { getSessionAwardState } = await import("@/lib/dal/points");
const { CheckInRest } = await import("@/components/checkin/moment-check-in-rest");
const { CheckInForm, CheckInSurface } = await import("@/components/checkin/moment-check-in");

const SESSION = "11111111-1111-4111-8111-111111111111";
const EVENT = `/app/sessions/${SESSION}`;
// Eastern Arabic-Indic digits, as a code-point range so this file holds none (DEC-124).
const EASTERN = /[\u0660-\u0669]/;
/** DEC-197 §1's hold. */
const RETURN = 1_400;

const pending = (points = 50): SessionAwardState => ({ state: "pending", points, daysAttended: 1, daysRequired: 1, dayCount: 1 });

async function restFor(award: SessionAwardState | null) {
  vi.mocked(getSessionAwardState).mockResolvedValue(award);
  return (await CheckInRest({ sessionId: SESSION, locale: "ar", arrivedAt: "2026-09-29T15:41:00Z", timeZone: "Asia/Riyadh", teamColor: "#35d0ff" })) as ReactElement;
}

/** The screen, as `page.tsx` composes it: the rest when checked in, the form otherwise. */
function Screen({ rest, action, announce = false }: { rest: ReactElement | null; action: (fd: FormData) => Promise<{ checkInId: string }>; announce?: boolean }) {
  return (
    <CheckInSurface rest={rest} announce={announce}>
      <CheckInForm action={async () => {}} momentAction={action}>
        <input type="hidden" name="code" value="M7K3QX" readOnly />
        <button type="submit">سجّل</button>
      </CheckInForm>
    </CheckInSurface>
  );
}

const moment = () => document.querySelector<HTMLElement>("[data-moment='check-in']");
const layer = () => document.querySelector("[data-confetti]");
const coinWrap = () => moment()!.children[1] as HTMLElement;
const linesWrap = () => moment()!.children[2] as HTMLElement;

/** Submits with a result, then lands the refreshed tree — the one response `refresh()` sends. */
async function checkIn(view: ReturnType<typeof render>, rest: ReactElement, id = "c1") {
  const action = vi.fn().mockResolvedValue({ checkInId: id });
  view.rerender(<Screen rest={null} action={action} />);
  await act(async () => {
    fireEvent.submit(screen.getByRole("button", { name: "سجّل" }).closest("form")!);
  });
  view.rerender(<Screen rest={rest} action={action} />);
  return action;
}

/** Two animation frames — the moment arms after the swapped screen has been painted. */
async function frames() {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

/**
 * ★ jsdom has no `AnimationEvent`, so React DOM listens for the prefixed
 * `webkitAnimationEnd` (as `sessions'` moment-reserve test found). Dispatched
 * under both names, as a browser without the constructor would send it.
 */
function animationEnd(el: Element) {
  act(() => {
    for (const type of ["animationend", "webkitAnimationEnd"]) el.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

let animations: FakeAnimation[];

beforeEach(() => {
  resetMomentsForTests();
  setReducedMotion(false);
  setDurationTokens({ fast: "120ms", base: "220ms", slow: "420ms", party: "900ms" });
  animations = fakeAnimate();
  push.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  removeFakeAnimate();
  vi.restoreAllMocks();
});

describe("moment 2 — plays from the check-in's own result", () => {
  it("★ plays: 44 particles, the coin drops, the lines rise — and the lines are announced", async () => {
    const rest = await restFor(pending());
    const view = render(<Screen rest={null} action={vi.fn()} />);
    await checkIn(view, rest);
    await frames();
    expect(moment()).toHaveAttribute("data-phase", "playing");
    expect(layer()?.children).toHaveLength(44);
    expect(animations).toHaveLength(44);
    expect(coinWrap().style.animation).toContain("moment-coin-drop");
    expect(linesWrap().style.animation).toContain("moment-rise");
    expect(linesWrap()).toHaveAttribute("role", "status");
    expect(screen.getByRole("status")).toHaveTextContent("أنت هنا!");
  });

  it("★ arms a frame late: the swapped screen is painted first, the coin and lines held at opacity 0, no particle yet", async () => {
    const rest = await restFor(pending());
    const view = render(<Screen rest={null} action={vi.fn()} />);
    await checkIn(view, rest);
    expect(moment()).toHaveAttribute("data-phase", "arming");
    expect(coinWrap().style.opacity).toBe("0");
    expect(linesWrap().style.opacity).toBe("0");
    expect(layer()).toBeNull();
    expect(animations).toHaveLength(0);
    await frames();
    expect(moment()).toHaveAttribute("data-phase", "playing");
    expect(coinWrap().style.opacity).toBe("");
  });

  it("★ settles into the static state: every node removed, no animation left, no will-change anywhere", async () => {
    const rest = await restFor(pending());
    const view = render(<Screen rest={null} action={vi.fn()} />);
    await checkIn(view, rest);
    await frames();
    animationEnd(coinWrap());
    animationEnd(linesWrap());
    await act(async () => {
      for (const a of animations) a.finish();
    });
    expect(layer()).toBeNull();
    expect(moment()).toHaveAttribute("data-phase", "static");
    expect(moment()).not.toHaveAttribute("data-bound"); // every part ended by its own event
    expect(coinWrap().style.animation).toBe("");
    expect(linesWrap().style.animation).toBe("");
    expect(document.querySelector("[style*='will-change']")).toBeNull();
  });

  it("★★ mount, play, unmount, mount again with the same check-in — silence", async () => {
    const rest = await restFor(pending());
    const first = render(<Screen rest={null} action={vi.fn()} />);
    await checkIn(first, rest, "c1");
    await frames();
    expect(moment()).toHaveAttribute("data-phase", "playing");
    first.unmount();

    const played = animations.length;
    const again = render(<Screen rest={null} action={vi.fn()} />);
    await checkIn(again, rest, "c1");
    await frames();
    expect(moment()).toHaveAttribute("data-phase", "static");
    expect(layer()).toBeNull();
    expect(coinWrap().style.animation).toBe("");
    expect(animations).toHaveLength(played);
  });

  it("a different check-in plays", async () => {
    const rest = await restFor(pending());
    const first = render(<Screen rest={null} action={vi.fn()} />);
    await checkIn(first, rest, "c1");
    first.unmount();
    const next = render(<Screen rest={null} action={vi.fn()} />);
    await checkIn(next, rest, "c2");
    await frames();
    expect(moment()).toHaveAttribute("data-phase", "playing");
  });

  it("★ a reload — the rest with no result — is the static state: no particle, no status, no return", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(<Screen rest={await restFor(pending())} action={vi.fn()} />);
    expect(moment()).toHaveAttribute("data-phase", "static");
    expect(layer()).toBeNull();
    expect(animations).toHaveLength(0);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => void vi.advanceTimersByTime(10_000));
    expect(push).not.toHaveBeenCalled();
  });

  it("the no-JS arrival (`?success=1`) announces the static state, and plays nothing", async () => {
    render(<Screen rest={await restFor(pending())} action={vi.fn()} announce />);
    expect(screen.getByRole("status")).toHaveTextContent("أنت هنا!");
    expect(animations).toHaveLength(0);
  });
});

describe("★ DEC-197 §1 — the hold and the return", () => {
  it("returns to the event page 1.4 s after the lines are in — and not before", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const rest = await restFor(pending());
    const view = render(<Screen rest={null} action={vi.fn()} />);
    await checkIn(view, rest);
    await frames();
    act(() => void vi.advanceTimersByTime(500));
    expect(push).not.toHaveBeenCalled(); // the lines are not in yet
    animationEnd(linesWrap());
    act(() => void vi.advanceTimersByTime(1_399));
    expect(push).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(push).toHaveBeenCalledWith(EVENT);
    // The link stays on the screen throughout.
    expect(screen.getByRole("link", { name: "إلى صفحة الجلسة" })).toHaveAttribute("href", EVENT);
  });

  it("★ a moment never hangs: with no animationend at all, it settles at the token bound, then holds and returns", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const rest = await restFor(pending());
    const view = render(<Screen rest={null} action={vi.fn()} />);
    await checkIn(view, rest);
    await frames();
    expect(moment()).toHaveAttribute("data-phase", "playing");
    // The bound: max(party × 1.33, slow + fast + base) + base = max(1197, 760) + 220 = 1417 ms.
    act(() => void vi.advanceTimersByTime(1_416));
    expect(moment()).toHaveAttribute("data-phase", "playing");
    act(() => void vi.advanceTimersByTime(1));
    expect(moment()).toHaveAttribute("data-phase", "static");
    expect(moment()).toHaveAttribute("data-settled", "coin,lines,burst");
    expect(moment()).toHaveAttribute("data-bound", "coin,lines,burst");
    act(() => void vi.advanceTimersByTime(1_399));
    expect(push).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(push).toHaveBeenCalledWith(EVENT);
  });

  it("names what has settled, so a stuck moment says which part did not end", async () => {
    const rest = await restFor(pending());
    const view = render(<Screen rest={null} action={vi.fn()} />);
    await checkIn(view, rest);
    await frames();
    animationEnd(coinWrap());
    expect(moment()).toHaveAttribute("data-settled", "coin");
    animationEnd(linesWrap());
    expect(moment()).toHaveAttribute("data-settled", "coin,lines");
    expect(moment()).toHaveAttribute("data-phase", "playing");
  });

  it("★ reduced motion: the complete static state, nothing animates, and it holds and returns the same", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    setReducedMotion(true);
    const rest = await restFor(pending(50));
    const view = render(<Screen rest={null} action={vi.fn()} />);
    await checkIn(view, rest);
    expect(moment()).toHaveAttribute("data-phase", "static");
    expect(animations).toHaveLength(0);
    expect(layer()).toBeNull();
    // The coin at rest with its figure, and the three lines.
    expect(coinWrap()).toHaveTextContent("+50");
    expect(coinWrap()).toHaveAttribute("aria-hidden", "true");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("أنت هنا!");
    expect(screen.getByRole("region", { name: "نقاط هذه الجلسة" })).toHaveTextContent("50 نقطة بانتظارك");
    expect(status).toHaveTextContent("تُضاف إلى رصيدك عند انتهاء الجلسة.");
    expect(status).toHaveTextContent("حضورك مسجَّل");
    expect(status.textContent).toMatch(/\d{1,2}:\d{2}/);
    act(() => void vi.advanceTimersByTime(RETURN));
    expect(push).toHaveBeenCalledWith(EVENT);
  });
});

describe("the truth on the coin and in the lines", () => {
  it("★ `none`: no number on the coin, never a +0, and the line says the session carries no points", async () => {
    render(<Screen rest={await restFor({ state: "none" })} action={vi.fn()} />);
    expect(coinWrap().textContent).toBe("");
    expect(document.body.textContent).not.toMatch(/\+\s*0(?!\d)/);
    expect(screen.getByRole("region", { name: "نقاط هذه الجلسة" })).toHaveTextContent("لا نقاط حضور لهذه الجلسة.");
  });

  it("a failed or invisible read: no number, no award line — «أنت هنا!» and the time still stand", async () => {
    render(<Screen rest={await restFor(null)} action={vi.fn()} />);
    expect(coinWrap().textContent).toBe("");
    expect(screen.queryByRole("region", { name: "نقاط هذه الجلسة" })).toBeNull();
    expect(moment()).toHaveTextContent("أنت هنا!");
  });

  it("incomplete draws no number", async () => {
    render(<Screen rest={await restFor({ state: "incomplete", missedDays: [], daysAttended: 1, daysRequired: 2, dayCount: 2 })} action={vi.fn()} />);
    expect(coinWrap().textContent).toBe("");
  });

  it("the figure and the time are Western digits, each isolated", async () => {
    render(<Screen rest={await restFor(pending(1234))} action={vi.fn()} />);
    expect(document.body.textContent).not.toMatch(EASTERN);
    expect(coinWrap().querySelector("bdi")).toHaveTextContent("+1,234");
    const time = [...moment()!.querySelectorAll("bdi")].map((b) => b.textContent);
    expect(time.some((s) => /\d{1,2}:\d{2}/.test(s ?? ""))).toBe(true);
  });
});

describe("★ a refusal never animates", () => {
  it("an action that redirects (no id) leaves the form, plays nothing, animates nothing", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    render(<Screen rest={null} action={action} />);
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "سجّل" }).closest("form")!);
    });
    expect(action).toHaveBeenCalledOnce();
    expect(moment()).toBeNull();
    expect(animations).toHaveLength(0);
    expect(screen.getByRole("button", { name: "سجّل" })).toBeInTheDocument();
  });
});

describe("the form's two paths", () => {
  it("a hydrated submit calls the moment action with the posted `code`, never the no-JS action", async () => {
    const noJs = vi.fn(async () => {});
    const moment = vi.fn().mockResolvedValue({ checkInId: "c9" });
    render(
      <CheckInSurface rest={null} announce={false}>
        <CheckInForm action={noJs} momentAction={moment}>
          <input type="hidden" name="code" value="M7K3QX" readOnly />
          <button type="submit">سجّل</button>
        </CheckInForm>
      </CheckInSurface>,
    );
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "سجّل" }).closest("form")!);
    });
    expect(noJs).not.toHaveBeenCalled();
    expect((moment.mock.calls[0][0] as FormData).get("code")).toBe("M7K3QX");
  });
});
