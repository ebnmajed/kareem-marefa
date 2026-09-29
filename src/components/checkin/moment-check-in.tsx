"use client";

import { createContext, startTransition, useContext, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import { burstConfetti } from "@/lib/ui/confetti";
import { useMoment } from "@/lib/ui/moment";

// Moment 2, تسجيل الحضور — SCR-014 (REQ-UIX-046, REQ-UIX-044, DEC-195 §2.1, DEC-197 §1).
//
// ★★ THE TRIGGER IS THE CHECK-IN'S OWN RESULT, NEVER A RENDER. The occurrence
// is the `check_ins` row's id, and it exists in exactly one place: the state of
// THIS client, set from what `checkInForMoment()` returned. A reload, a back
// navigation, another phone, the host's projector and the no-JS `?success=1`
// have no id, so they render the static state — the coin at rest and the three
// lines — and never a particle. `useMoment()` (the lead's) is the second line:
// a remount with the same id finds it claimed.
//
// ★ THE NO-JS PATH IS UNTOUCHED. The form's `action` is still
// `submitCheckInForm`, which redirects exactly as it always has; the HTML the
// server sends posts there. Once hydrated, `onSubmit` prevents that and calls
// `checkInForMoment()` instead — React runs no form action for a prevented
// submit, and inside a transition it still marks the form pending, so the
// submit button's `useFormStatus()` works (react-dom's dispatch, read).
//
// ★ A REFUSAL NEVER ANIMATES. It redirects to the same `?error=` the no-JS path
// does, and the screen renders it statically; no occurrence, no moment.

/** What `checkInForMoment()` returns for a fresh check-in. Declared here: a "use server" module exports functions alone. */
export type CheckInMomentResult = { checkInId: string };

/**
 * ★ DEC-197 §1 — the owner's recorded exception to SC 2.2.1, scoped to this
 * moment and nothing else: once the three lines are in, the screen holds this
 * long and returns to the event page, whose action then reads «حضرت». It is a
 * TIMING, not a motion — it is not a duration token and it does not collapse
 * under reduced motion. The link to the event page stays on screen throughout.
 */
const RETURN_HOLD_MS = 1400;

/** The coin's and the lines' first keyframe, held while the moment arms. */
const HIDDEN = { opacity: 0 } as const;

type Occurrence = { checkInId: string | null; announce: boolean };
const OccurrenceContext = createContext<Occurrence>({ checkInId: null, announce: false });
const ResultContext = createContext<(result: CheckInMomentResult) => void>(() => {});

/**
 * The screen's client surface. `rest` is the server's static state, present
 * exactly when the member is checked in to the day the screen is about; the
 * children are the code form. A fresh result swaps the form for the rest, with
 * the occurrence the moment plays from.
 */
export function CheckInSurface({ rest, announce, children }: { rest: ReactNode; announce: boolean; children: ReactNode }) {
  const [checkInId, setCheckInId] = useState<string | null>(null);
  // `refresh()` sends the rest in the same response as the result; until both
  // are here, the form stays on screen in its pending state.
  const showRest = rest !== null && rest !== undefined;
  return (
    <ResultContext.Provider value={(result) => setCheckInId(result.checkInId)}>
      <OccurrenceContext.Provider value={{ checkInId: showRest ? checkInId : null, announce: announce || checkInId !== null }}>
        {showRest ? rest : children}
      </OccurrenceContext.Provider>
    </ResultContext.Provider>
  );
}

/** The code form: posts to `action` without JS, and to `momentAction` once hydrated. */
export function CheckInForm({
  action,
  momentAction,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  momentAction: (formData: FormData) => Promise<CheckInMomentResult>;
  className?: string;
  children: ReactNode;
}) {
  const report = useContext(ResultContext);
  const [, start] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // Synchronously, inside the submit event: React then marks this form pending.
    start(async () => {
      const result = await momentAction(formData);
      // A refusal or «already» redirects (the router navigates); only a fresh check-in returns an id.
      if (result?.checkInId) startTransition(() => report(result));
    });
  }

  return (
    <form action={action} onSubmit={onSubmit} noValidate className={className}>
      {children}
    </form>
  );
}

/**
 * The celebration and its static state. Keyed on the occurrence, so the
 * instance that plays is always one the client made — never one hydrated from
 * the server's HTML, which `useMoment` keeps static by design (DEC-197 §5).
 */
export function CheckInMoment(props: { teamColor: string | null; eventHref: string; coin: ReactNode; lines: ReactNode; link: ReactNode }) {
  const { checkInId, announce } = useContext(OccurrenceContext);
  return <Moment key={checkInId ?? "rest"} occurrenceId={checkInId} announce={announce} {...props} />;
}

function Moment({
  occurrenceId,
  announce,
  teamColor,
  eventHref,
  coin,
  lines,
  link,
}: {
  occurrenceId: string | null;
  announce: boolean;
  teamColor: string | null;
  eventHref: string;
  coin: ReactNode;
  lines: ReactNode;
  link: ReactNode;
}) {
  const { phase, done } = useMoment("check-in", occurrenceId);
  // ★ ARMED A FRAME LATE (REQ-UIX-020, DEC-197 Q4). The result arrives in the
  // same commit that swaps the form for this screen, and that commit's layout
  // is the heaviest work on the page. Starting the burst and the drop in the
  // same frame put both in one 66 ms frame on a 4× throttled phone. So the
  // moment waits until the swapped screen has been painted — two animation
  // frames — holding the coin and the lines at opacity 0 meanwhile (their
  // animations' own first frame), and only then plays. The commit is measured
  // beside the moment, not inside it.
  const [armed, setArmed] = useState(false);
  const arming = phase === "playing" && !armed;
  const playing = phase === "playing" && armed;
  const stage = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // What has finished: the coin's drop, the lines' rise, the burst.
  const settled = useRef({ coin: false, lines: false, burst: false });
  const [linesIn, setLinesIn] = useState(false);

  function settle(part: "coin" | "lines" | "burst") {
    settled.current[part] = true;
    if (part === "lines") setLinesIn(true);
    const s = settled.current;
    if (s.coin && s.lines && s.burst) done();
  }

  useEffect(() => {
    if (phase !== "playing") return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setArmed(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [phase]);

  useEffect(() => {
    if (!playing || !stage.current) return;
    settled.current = { coin: false, lines: false, burst: false };
    const burst = burstConfetti(stage.current, { teamColor });
    let live = true;
    void burst.finished.then(() => {
      if (live) settle("burst");
    });
    return () => {
      live = false;
      burst.cancel();
    };
    // `settle` reads refs only; the burst is keyed on the phase alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, teamColor]);

  // The lines are in at once when nothing plays — reduced motion, or a moment already seen.
  const inNow = linesIn || phase !== "playing";

  // ★ DEC-197 §1: the hold and the return, only for a fresh result — never on a reload.
  useEffect(() => {
    if (occurrenceId === null || !inNow) return;
    const timer = window.setTimeout(() => router.push(eventHref), RETURN_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [occurrenceId, inNow, eventHref, router]);

  return (
    <div data-moment="check-in" data-phase={arming ? "arming" : phase} className="relative flex min-h-[28rem] flex-col items-center justify-center gap-3 py-6 text-center">
      {/* The confetti's host. It clips, so a particle never widens the page at 390 px; the scope above is never clipped.
          `contain-strict` makes it a layout and paint root: 44 particles arriving lay out themselves, not the page. */}
      <div ref={stage} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-clip contain-strict" />
      <div
        aria-hidden="true"
        onAnimationEnd={(e) => e.target === e.currentTarget && settle("coin")}
        style={playing ? { animation: "moment-coin-drop var(--duration-party) var(--ease-play) both" } : arming ? HIDDEN : undefined}
      >
        {coin}
      </div>
      <div
        role={announce ? "status" : undefined}
        onAnimationEnd={(e) => e.target === e.currentTarget && settle("lines")}
        style={playing ? { animation: "moment-rise var(--duration-base) var(--ease-play) calc(var(--duration-slow) + var(--duration-fast)) both" } : arming ? HIDDEN : undefined}
        className="flex flex-col items-center gap-2"
      >
        {lines}
      </div>
      <div className="relative">{link}</div>
    </div>
  );
}
