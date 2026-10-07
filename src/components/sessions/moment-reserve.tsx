"use client";

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import { SessionCta } from "@/components/ui/session-cta";
import { useToast } from "@/components/ui/toast";
import { TicketObject } from "@/components/ui/objects/ticket";
import { claimMoment, isMomentClaimed, momentKey, useMoment } from "@/lib/ui/moment";
import { prefersReducedMotion } from "@/lib/ui/reduced-motion";

// Moment 1, الحجز — REQ-UIX-045, REQ-UIX-044, REQ-UIX-007, REQ-UIX-020, DEC-195
// §2.1, DEC-197 §7. `docs/design/03-motion.md` §1 is the sequence;
// `prototypes/motion-story.html` is a behaviour reference, never code.
//
// ★★ THE TRIGGER IS THE RESERVE ACTION'S OWN RESULT, NEVER A RENDER. The action
// returns the reservation's occurrence — its id, status and `reserved_at`, and
// only when THIS call made the seat (`fresh`) — and refreshes the page in the
// same response. The host holds that result with `useActionState`, so only the
// client that pressed has it: a reload, a back navigation, tomorrow, or another
// phone renders the card with no result, which is the static state.
//
// ★ THE STATE LIVES IN THE HOST, NOT IN THE RESERVE BUTTON. The button unmounts
// in the very commit the result arrives — the primary becomes the calendar — so
// the host wraps the whole card and survives the refresh at the same position.
//
// ★ THE STAGE IS KEYED ON THE OCCURRENCE. The host was born hydrating the
// server's page, and `useMoment` keeps an instance born hydrating static for
// good (DEC-197 §5). A new occurrence remounts the stage, which the client
// mounted, so it may play; a stage mounted again with an occurrence already
// claimed stays silent.
//
// ★ NEVER OPTIMISTIC (REQ-UIX-007): nothing plays on the tap. A refused
// reservation does not animate; it says so in the card, statically.
//
// ★ NOTHING HERE MOVES THE SCOPE'S ELEMENT (DEC-195 §1.3, DEC-188 §5). The
// ticket rises inside an anchor, and the thud moves an INNER element — the
// card's content wrapper from `md`, the phone bar's row below it — never the
// fixed bar itself and never the scope. Every step starts on the previous one's
// `animationend`; there is no timer. Every duration is a token.

/** What `reserveSeatAction` returns (`components/checkin/actions.ts`). */
export type ReserveResult =
  | {
      ok: true;
      status: "confirmed" | "waitlisted";
      /** `${rsvpId}:${status}:${reservedAt}` when THIS call made the seat; `null` on a repeat submit. */
      occurrence: string | null;
      /** The whisper's truth: a connected calendar is synced by `calendar_upsert`; otherwise it can be added. */
      calendar: "sync" | "manual";
    }
  | { ok: false; reason: ReserveRefusal };

export type ReserveRefusal = "deadline_passed" | "not_open" | "unknown";

type ReserveAction = (prev: ReserveResult | null, formData: FormData) => Promise<ReserveResult>;

export interface ReserveMomentLabels {
  /** «محجوز» — the stamp alone says it (DEC-197 §7, Q1). */
  stampBooked: string;
  /** «قائمة الانتظار · N», N inside `<bdi>` — rendered by the server, which knows the position after the refresh. */
  stampWaitlist: ReactNode;
  whisper: { sync: string; manual: string; waitlist: string };
  refused: Record<ReserveRefusal, string>;
}

type Placement = "card" | "bar";
type Step = "rise" | "stamp" | "leave";

interface HostContext {
  formAction: (formData: FormData) => void;
  result: ReserveResult | null;
  labels: ReserveMomentLabels;
}

interface StageContext {
  playing: boolean;
  /** Two frames after the commit that brought the result: the ticket mounts only then (see `MomentStage`). */
  armed: boolean;
  /** Where the ticket plays: the card from `md`, the phone's bar below it (`16` §6.1 note 2). */
  host: Placement;
  step: Step;
  thudding: boolean;
  revealing: boolean;
  waitlisted: boolean;
  labels: ReserveMomentLabels;
  onTicketStart: (event: AnimationEvent<HTMLElement>) => void;
  onTicketEnd: (event: AnimationEvent<HTMLElement>) => void;
  onThudEnd: (event: AnimationEvent<HTMLElement>) => void;
}

const Host = createContext<HostContext | null>(null);
const Stage = createContext<StageContext | null>(null);

/**
 * The host. Wraps the action card's content; the server binds the action (DEC-159).
 * `host` (add-only, DEC-277): pins where the ticket rises at every width. The feed's post has no phone bar, so it
 * passes `"card"`; the event page omits it and keeps the card from `md`, the bar below it.
 */
export function ReserveMoment({ action, labels, host, children }: { action: ReserveAction; labels: ReserveMomentLabels; host?: Placement; children: ReactNode }) {
  const [result, formAction] = useActionState(action, null);
  const played = result?.ok ? result : null;
  return (
    <Host.Provider value={{ formAction, result, labels }}>
      <MomentStage
        key={played?.occurrence ?? "static"}
        occurrence={played?.occurrence ?? null}
        status={played?.status ?? "confirmed"}
        calendar={played?.calendar ?? "manual"}
        labels={labels}
        fixedHost={host}
      >
        {children}
      </MomentStage>
    </Host.Provider>
  );
}

/**
 * «احجز مقعدك» / «انضم لقائمة الانتظار» on `session-cta`, submitting through the host so the result comes
 * back to it. Outside a host (a component test of the panel) it posts the bound action directly.
 */
export function ReserveCta({ kind, label, chip, placement, action }: { kind: "reserve" | "waitlist"; label: string; chip?: string; placement: Placement; action: ReserveAction }) {
  const host = useContext(Host);
  const submit = host?.formAction ?? ((formData: FormData) => void action(null, formData));
  return (
    // ★ Wave 18 (DEC-209 §2, REQ-UIX-061): the card's reserve shows at every width — the phone draws it in
    // the card AND in the bottom bar. Which one the ticket rises from is unchanged: the card from `md`, the bar
    // below it (`host` above). Nothing about how the moment is keyed moves.
    <div data-placement={placement}>
      <SessionCta state={{ kind, act: { action: submit } }} label={label} chip={chip} />
    </div>
  );
}

/** ★ Q5 (DEC-197 §7): a refused reservation says so, in the card, statically — never animated. */
export function ReserveRefused() {
  const host = useContext(Host);
  if (!host?.result || host.result.ok) return null;
  return (
    <p role="alert" className="text-body-sm text-error pg-dark:text-error-on-dark">
      {host.labels.refused[host.result.reason]}
    </p>
  );
}

/**
 * A part of the card the moment touches, placed by the server:
 *   · `thud` — the INNER element that thuds when the ticket plays in that placement (never the scope, never
 *     the fixed bar);
 *   · `anchor` — where the ticket rises, when that placement is the one on screen;
 *   · `reveal` — held out of sight while the ticket plays in that placement, faded in as it leaves: the
 *     booked face with its new capacity chip, and the phone bar's new primary.
 * Outside the moment it is a plain `<div>`.
 */
export function MomentPart({
  thud,
  anchor,
  reveal,
  className = "",
  children,
}: {
  thud?: Placement;
  anchor?: Placement;
  reveal?: Placement;
  className?: string;
  children: ReactNode;
}) {
  const stage = useContext(Stage);
  const live = stage?.playing === true;
  const hosts = live && stage.armed && anchor !== undefined && stage.host === anchor;
  const held = live && reveal !== undefined && stage.host === reveal;
  const thudHere = live && thud !== undefined && stage.host === thud && stage.thudding;

  const style: CSSProperties = {};
  if (held) Object.assign(style, stage.revealing ? { animation: anim("moment-fade-in", "base") } : { opacity: 0 });
  if (thudHere) Object.assign(style, { animation: anim("moment-thud", "fast"), willChange: "transform" });

  return (
    <div
      data-moment-part=""
      className={`${anchor ? "relative" : ""} ${className}`}
      style={style}
      onAnimationEnd={thud !== undefined && stage ? stage.onThudEnd : undefined}
    >
      {children}
      {hosts ? <Ticket stage={stage} /> : null}
    </div>
  );
}

// ── The stage ─────────────────────────────────────────────────────────────

const anim = (name: string, duration: "fast" | "base" | "slow", delay?: "base") =>
  `${name} var(--duration-${duration}) var(--ease-play) ${delay ? `var(--duration-${delay}) ` : ""}both`;

const MD = "(min-width: 48rem)";
function subscribeMd(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(MD);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
const readMd = () => typeof window.matchMedia === "function" && window.matchMedia(MD).matches;

const noSubscribe = () => () => {};

function MomentStage({
  occurrence,
  status,
  calendar,
  labels,
  fixedHost,
  children,
}: {
  occurrence: string | null;
  status: "confirmed" | "waitlisted";
  calendar: "sync" | "manual";
  labels: ReserveMomentLabels;
  fixedHost?: Placement;
  children: ReactNode;
}) {
  const toast = useToast();
  const whisper = status === "waitlisted" ? labels.whisper.waitlist : calendar === "sync" ? labels.whisper.sync : labels.whisper.manual;
  const hydrating = useSyncExternalStore(
    noSubscribe,
    () => false,
    () => true,
  );
  const [bornHydrating] = useState(hydrating);
  // The whisper is owed once per occurrence, and is raised when the sequence ends.
  const owed = useRef(false);

  // ★ DECLARED BEFORE `useMoment`, so it runs first and can ask whether the occurrence was already claimed:
  // a remount finds it claimed and owes nothing. The whisper takes a claim of its own, so it is raised
  // once even when motion is reduced and the moment never plays — the static state includes it.
  useLayoutEffect(() => {
    if (occurrence === null || isMomentClaimed(momentKey("reservation", occurrence))) return;
    if (!claimMoment(`reservation-whisper:${occurrence}`)) return;
    if (prefersReducedMotion() || bornHydrating) toast.show({ title: whisper, tone: "success" });
    else owed.current = true;
  }, [occurrence, bornHydrating, toast, whisper]);

  const { phase, done } = useMoment("reservation", occurrence);
  const md = useSyncExternalStore(subscribeMd, readMd, () => false);
  const [step, setStep] = useState<Step>("rise");
  const [thudding, setThudding] = useState(false);
  const [revealing, setRevealing] = useState(false);
  // ★ ARMED TWO FRAMES AFTER THE COMMIT (REQ-UIX-020, the lead's five-run trace at 24b2da5e). The result
  // arrives in the same commit as the refreshed page, and that commit's style and layout (≈ 22 ms on a 4×
  // throttled phone) fell in the ticket's first frame — one dropped frame, every run. The booked face is held
  // out of sight from the commit on, and the ticket mounts two frames later, when the page has settled: the
  // moment's own frames are then compositor work alone. A frame is not a timer — nothing waits on the clock.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (phase !== "playing") return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setArmed(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  const finish = () => {
    setThudding(false);
    setRevealing(false);
    if (owed.current) {
      owed.current = false;
      toast.show({ title: whisper, tone: "success" });
    }
    done();
  };

  const value: StageContext = {
    playing: phase === "playing",
    armed,
    host: fixedHost ?? (md ? "card" : "bar"),
    step,
    thudding,
    revealing,
    waitlisted: status === "waitlisted",
    labels,
    onTicketStart: (event) => {
      if (event.animationName === "moment-ticket-leave") setRevealing(true);
    },
    onTicketEnd: (event) => {
      if (event.animationName === "moment-ticket-rise") setStep("stamp");
      else if (event.animationName === "moment-stamp-land") {
        setThudding(true);
        setStep("leave");
      } else if (event.animationName === "moment-ticket-leave") finish();
    },
    onThudEnd: (event) => {
      if (event.target === event.currentTarget && event.animationName === "moment-thud") setThudding(false);
    },
  };

  return <Stage.Provider value={value}>{children}</Stage.Provider>;
}

function Ticket({ stage }: { stage: StageContext }) {
  const ticketStyle: CSSProperties = {
    animation: stage.step === "leave" ? anim("moment-ticket-leave", "base", "base") : anim("moment-ticket-rise", "slow"),
    willChange: "transform, opacity",
  };
  const stampStyle: CSSProperties =
    stage.step === "rise" ? { opacity: 0 } : { animation: anim("moment-stamp-land", "slow"), willChange: "transform, opacity" };
  return (
    <div
      aria-hidden="true"
      data-moment="ticket"
      data-step={stage.step}
      className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center ${stage.host === "bar" ? "bottom-full" : "inset-y-0 items-center"}`}
      style={ticketStyle}
      onAnimationStart={stage.onTicketStart}
      onAnimationEnd={stage.onTicketEnd}
    >
      <div className="relative">
        {/* No contact shadow: the ticket floats over the card, or over the page above the phone's bar, and a
            floor shadow cast onto the light page outside the scope read as detached (the lead's 390 px review). */}
        <TicketObject word={false} shadow={false} size={144} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            data-moment="stamp"
            // DEC-073's tones, never a team colour (DEC-195 §6.21, DEC-197 §7 Q2): the waitlist's is the badge's
            // `live`, a held seat the badge's `success` — the fixed filled forms, which carry their own contrast.
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-field border-2 px-3 py-0.5 text-h3 font-bold pg:font-display ${
              stage.waitlisted ? "border-live bg-live-bg text-live" : "border-success bg-success-bg text-success"
            }`}
            style={stampStyle}
          >
            {stage.waitlisted ? stage.labels.stampWaitlist : stage.labels.stampBooked}
          </span>
        </div>
      </div>
    </div>
  );
}
