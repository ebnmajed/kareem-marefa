// Moment 1, الحجز — REQ-UIX-045, REQ-UIX-044, REQ-UIX-007, REQ-UIX-014, REQ-UIX-020,
// DEC-195 §2.1 / §2.7, DEC-197 §7.
//
// ★★ The trigger is the reserve action's own result. These cases press the real
// `session-cta` inside the real host, so the result arrives through
// `useActionState` exactly as it does on the event page; the action itself is a
// stand-in returning what `reserveSeatAction` would.
//
// jsdom runs no CSS animation, so each step's `animationend` is fired by hand,
// named — which is also how the component tells its own steps apart.
//
// ★ jsdom has no `AnimationEvent`, and React DOM, finding none when it loads,
// listens for the vendor-prefixed `webkitAnimationEnd` / `webkitAnimationStart`
// instead. So each event is dispatched under both names, carrying its
// `animationName`: the unprefixed one for the thud's native listener, the
// prefixed one for React's handlers — which is what a browser without the
// constructor would send.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentPart, ReserveCta, ReserveMoment, ReserveRefused, type ReserveMomentLabels, type ReserveResult } from "@/components/sessions/moment-reserve";
import { resetMomentsForTests } from "@/lib/ui/moment";

/** `matchMedia` for the two questions the moment asks: reduced motion, and «is this `md` and up». */
function setMedia({ reduced = false, md = true }: { reduced?: boolean; md?: boolean } = {}) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : query.includes("min-width") ? md : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}
const setReducedMotion = (reduced: boolean) => setMedia({ reduced });

const show = vi.fn();
const toastHandle = { show };
vi.mock("@/components/ui/toast", () => ({ useToast: () => toastHandle }));

const labels: ReserveMomentLabels = {
  stampBooked: "محجوز",
  stampWaitlist: (
    <>
      قائمة الانتظار · <bdi>3</bdi>
    </>
  ),
  whisper: { sync: "ستُضاف الجلسة إلى تقويمك خلال لحظات", manual: "حُجز مقعدك — أضِف الجلسة إلى تقويمك من الزرّ", waitlist: "سنُعلمك فور توفّر مقعد لك" },
  refused: { deadline_passed: "تعذّر الحجز: انتهى وقت الحجز لهذه الجلسة.", not_open: "تعذّر الحجز: الجلسة لا تستقبل حجوزات الآن.", unknown: "تعذّر الحجز. حاول مرة أخرى بعد قليل." },
};

const booked = (occurrence: string | null, over: Partial<Extract<ReserveResult, { ok: true }>> = {}): ReserveResult => ({
  ok: true,
  status: "confirmed",
  occurrence,
  calendar: "manual",
  ...over,
});

/** The card as the event page draws it: the thud wrapper, the booked face as the anchor, the reserve CTA. */
// The last call's answer, so a press can wait for React to commit it — not merely for the click.
let answered: Promise<ReserveResult> = Promise.resolve({ ok: false, reason: "unknown" });

function Card({ result, children }: { result: ReserveResult; children?: ReactNode }) {
  const action = () => (answered = Promise.resolve(result));
  return (
    <ReserveMoment action={action} labels={labels}>
      <MomentPart thud="card" className="flex flex-col gap-4">
        <span data-testid="in-thud" />
        <MomentPart anchor="card" reveal="card">
          <p data-testid="in-face">تم تأكيد حجزك</p>
          <button type="button">إلغاء الحجز</button>
        </MomentPart>
        <ReserveRefused />
        <ReserveCta kind="reserve" label="احجز مقعدك" chip="27 من 30" placement="card" action={action} />
        {children}
      </MomentPart>
      {/* The phone's bar, as `action-bar.tsx` draws it. */}
      <MomentPart thud="bar" anchor="bar">
        <span data-testid="in-bar" />
        <MomentPart reveal="bar">
          <button type="button">أضِف إلى تقويمك</button>
        </MomentPart>
      </MomentPart>
    </ReserveMoment>
  );
}

const part = (testId: string) => screen.getByTestId(testId).closest<HTMLElement>("[data-moment-part]")!;

/** Presses «احجز مقعدك» and waits until the action's answer has been committed. */
async function press() {
  await userEvent.click(screen.getByRole("button", { name: /احجز مقعدك/ }));
  await act(async () => {
    await answered;
  });
  await act(async () => {});
  // The ticket is armed two frames after the commit, so the commit's layout stays out of its frames.
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
}

const ticket = () => document.querySelector<HTMLElement>('[data-moment="ticket"]');
const stamp = () => document.querySelector<HTMLElement>('[data-moment="stamp"]');
function dispatch(el: Element, types: string[], animationName: string) {
  return act(() => {
    for (const type of types) el.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { animationName }));
  });
}
const end = (el: Element, animationName: string) => dispatch(el, ["animationend", "webkitAnimationEnd"], animationName);
const start = (el: Element, animationName: string) => dispatch(el, ["animationstart", "webkitAnimationStart"], animationName);

/** Drives the whole sequence to its end, asserting each step's keyframe on the way. */
async function playThrough() {
  expect(ticket()!.style.animation).toContain("moment-ticket-rise");
  await end(ticket()!, "moment-ticket-rise");
  expect(stamp()!.style.animation).toContain("moment-stamp-land");
  await end(stamp()!, "moment-stamp-land");
  const thud = part("in-thud");
  expect(thud.style.animation).toContain("moment-thud");
  expect(thud.style.willChange).toBe("transform");
  await end(thud, "moment-thud");
  expect(ticket()!.style.animation).toContain("moment-ticket-leave");
  await start(ticket()!, "moment-ticket-leave");
  expect(part("in-face").style.animation).toContain("moment-fade-in");
  await end(ticket()!, "moment-ticket-leave");
}

const willChangeAnywhere = () => [...document.querySelectorAll<HTMLElement>("*")].filter((el) => el.style.willChange !== "");

beforeEach(() => {
  resetMomentsForTests();
  setMedia();
  show.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("moment 1 — plays from the action's own result", () => {
  it("★ the face is held from the commit, and the ticket arrives two frames later — never in the commit's frame", async () => {
    render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await userEvent.click(screen.getByRole("button", { name: /احجز مقعدك/ }));
    await act(async () => {
      await answered;
    });
    await act(async () => {});
    expect(part("in-face").style.opacity).toBe("0");
    expect(ticket()).toBeNull();
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
    expect(ticket()).not.toBeNull();
  });

  it("nothing moves on the tap, before the server answers (REQ-UIX-007)", () => {
    render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    expect(ticket()).toBeNull();
    expect(stamp()).toBeNull();
  });

  it("★ the ticket rises, the stamp lands, the card thuds, the face fades back in, the whisper — once", async () => {
    render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    // Rising, inside the card's anchor, over the face held out of sight.
    expect(ticket()).not.toBeNull();
    expect(part("in-face")).toContainElement(ticket());
    expect(part("in-face").style.opacity).toBe("0");
    expect(stamp()!.style.opacity).toBe("0");
    expect(stamp()).toHaveTextContent("محجوز");
    expect(show).not.toHaveBeenCalled();

    await playThrough();

    expect(ticket()).toBeNull();
    expect(part("in-face").style.opacity).toBe("");
    expect(part("in-face").style.animation).toBe("");
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith({ title: labels.whisper.manual, tone: "success" });
  });

  it("★ no `will-change` is left on anything after the sequence finishes", async () => {
    render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    expect(willChangeAnywhere().length).toBeGreaterThan(0);
    await playThrough();
    expect(willChangeAnywhere()).toEqual([]);
  });

  it("the thud's own `will-change` goes the moment the thud ends", async () => {
    render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    await end(ticket()!, "moment-ticket-rise");
    await end(stamp()!, "moment-stamp-land");
    const thud = part("in-thud");
    expect(thud.style.willChange).toBe("transform");
    await end(thud, "moment-thud");
    expect(thud.style.willChange).toBe("");
    expect(thud.style.animation).toBe("");
  });

  it("every duration is a token — never a literal", async () => {
    render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    const seen: string[] = [ticket()!.style.animation];
    await end(ticket()!, "moment-ticket-rise");
    seen.push(stamp()!.style.animation);
    await end(stamp()!, "moment-stamp-land");
    seen.push(part("in-thud").style.animation, ticket()!.style.animation);
    for (const value of seen) {
      expect(value).toMatch(/var\(--duration-(fast|base|slow)\)/);
      expect(value).not.toMatch(/\d(ms|s)\b/);
    }
  });

  it("says the calendar will sync only when the member's calendar is connected (DEC-197 §4)", async () => {
    render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z", { calendar: "sync" })} />);
    await press();
    await playThrough();
    expect(show).toHaveBeenCalledWith({ title: labels.whisper.sync, tone: "success" });
  });
});

describe("at 390 px the ticket plays over the phone's bar", () => {
  it("rises above the bar's row, the row thuds, and the bar's new primary is held and revealed — the card is left alone", async () => {
    setMedia({ md: false });
    render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    const row = part("in-bar");
    expect(row).toContainElement(ticket());
    expect(part("in-face").style.opacity).toBe("");
    const primary = screen.getByRole("button", { name: "أضِف إلى تقويمك" }).closest<HTMLElement>("[data-moment-part]")!;
    expect(primary.style.opacity).toBe("0");
    await end(ticket()!, "moment-ticket-rise");
    await end(stamp()!, "moment-stamp-land");
    expect(row.style.animation).toContain("moment-thud");
    expect(part("in-thud").style.animation).toBe("");
    await end(row, "moment-thud");
    await start(ticket()!, "moment-ticket-leave");
    expect(primary.style.animation).toContain("moment-fade-in");
    await end(ticket()!, "moment-ticket-leave");
    expect(ticket()).toBeNull();
    expect(primary.style.opacity).toBe("");
    expect(willChangeAnywhere()).toEqual([]);
  });
});

describe("★★ once per occurrence — mount, play, unmount, mount again: silence", () => {
  it("a second host that receives the same occurrence plays nothing and whispers nothing", async () => {
    const first = render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    await playThrough();
    expect(show).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    expect(ticket()).toBeNull();
    expect(stamp()).toBeNull();
    expect(part("in-face").style.opacity).toBe("");
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("unmounted mid-sequence, then mounted with the same occurrence: silent, and nothing left held", async () => {
    const first = render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    expect(ticket()).not.toBeNull();
    first.unmount();

    render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    expect(ticket()).toBeNull();
    expect(part("in-face").style.opacity).toBe("");
  });

  it("a re-render with the same result does not replay", async () => {
    const view = render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    await playThrough();
    view.rerender(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    expect(ticket()).toBeNull();
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("a repeat submit (not fresh — `occurrence: null`) plays nothing: a reload's re-POST, a double tap, a second tab", async () => {
    render(<Card result={booked(null)} />);
    await press();
    expect(ticket()).toBeNull();
    expect(show).not.toHaveBeenCalled();
  });

  it("a new reservation after a cancel is a new occurrence, and plays", async () => {
    const first = render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    await playThrough();
    first.unmount();
    render(<Card result={booked("r1:confirmed:2026-09-29T11:30:00Z")} />);
    await press();
    expect(ticket()).not.toBeNull();
  });
});

describe("★★ the static state under reduced motion is complete", () => {
  it("no ticket, no stamp, no thud — the face, its cancel and the whisper, at once", async () => {
    setReducedMotion(true);
    render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    expect(ticket()).toBeNull();
    expect(stamp()).toBeNull();
    expect(part("in-thud").style.animation).toBe("");
    const face = part("in-face");
    expect(face.style.opacity).toBe("");
    expect(face).toHaveTextContent("تم تأكيد حجزك");
    expect(screen.getByRole("button", { name: "إلغاء الحجز" })).toBeVisible();
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith({ title: labels.whisper.manual, tone: "success" });
    expect(willChangeAnywhere()).toEqual([]);
  });

  it("and a remount with the same occurrence raises no second whisper", async () => {
    setReducedMotion(true);
    const first = render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    first.unmount();
    render(<Card result={booked("r1:confirmed:2026-09-29T10:00:00Z")} />);
    await press();
    expect(show).toHaveBeenCalledTimes(1);
  });
});

describe("★ a failure does not animate", () => {
  it("a refused reservation says so in the card, statically, and nothing moves", async () => {
    render(<Card result={{ ok: false, reason: "deadline_passed" }} />);
    await press();
    expect(ticket()).toBeNull();
    expect(stamp()).toBeNull();
    expect(part("in-thud").style.animation).toBe("");
    expect(screen.getByRole("alert")).toHaveTextContent(labels.refused.deadline_passed);
    expect(show).not.toHaveBeenCalled();
  });

  it("no alert before any answer, and none after a reservation that succeeded", async () => {
    render(<Card result={booked(null)} />);
    expect(screen.queryByRole("alert")).toBeNull();
    await press();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("the waitlisted variant", () => {
  it("the same ticket, the stamp «قائمة الانتظار · N» with N in <bdi>, in the waitlist's status tone — never a team colour", async () => {
    render(<Card result={booked("r2:waitlisted:2026-09-29T10:00:00Z", { status: "waitlisted" })} />);
    await press();
    await end(ticket()!, "moment-ticket-rise");
    const s = stamp()!;
    expect(s).toHaveTextContent("قائمة الانتظار · 3");
    expect(s.querySelector("bdi")).toHaveTextContent("3");
    expect(s.className).toContain("bg-live-bg");
    expect(s.className).toContain("text-live");
    expect(s.className).not.toMatch(/team|cyan|success/);
    expect(s.getAttribute("style") ?? "").not.toContain("--team");
    // The ticket draws no word of its own: «محجوز» on a waitlist would be false (DEC-197 §4).
    expect(ticket()).not.toHaveTextContent("محجوز");
  });

  it("whispers the waitlist's truth", async () => {
    render(<Card result={booked("r2:waitlisted:2026-09-29T10:00:00Z", { status: "waitlisted" })} />);
    await press();
    await playThrough();
    expect(show).toHaveBeenCalledWith({ title: labels.whisper.waitlist, tone: "success" });
  });
});
