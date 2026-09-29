"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useCountUp } from "@/lib/ui/count-up";
import { readDuration, readEasing } from "@/lib/ui/duration";
import { readyToAcknowledge, useSeenMoment } from "@/components/scoring/use-seen-moment";

// Moments 3 and 4 on the head of SCR-022 — انتهت الجلسة and ترقية المستوى (wave 16,
// REQ-UIX-047, DEC-195 §1.1, DEC-197 §7). scoring's file.
//
// ★ THE SERVER RENDERS THE STATIC STATE, and it is complete: the new balance,
// the delta beside it on first sight, the flame at rest, the bar at the member's
// true progress, the level card's new face. This component only MOVES what is
// already drawn, by `element.animate()` from the frame the member last saw, and
// only when `useMoment` says this mount is the first sight (contract 1):
//
//   3 · the balance counts up (the lead's `useCountUp`, `party`) with the delta
//       fading in (`base`) → the flame grows to its rest size (`slow`) — its
//       flicker is the CSS loop `.moment-flicker`, off under reduced motion →
//       the bar's fill moves by `scaleX` from where it was (`party`);
//   4 · the level card turns over (`rotateY`, `party`) and one shine sweeps its
//       new face from the inline start (`moment-shine`, `slow`, at 60 % of the turn).
//
// ★ Each step is started with its delay on the same timeline, never by a timer.
// Every animation fills BACKWARDS only — the element holds the old frame until
// its step starts, and when it finishes the element is exactly what the server
// drew. The bar fills FORWARDS while the card is still to turn, and is cancelled
// when the turn ends: full while the level is being reached, then the new
// level's true progress, in place (DEC-197 §7, D-26). Nothing sets `will-change`.
//
// ★ Once the member has seen it, the client that showed it tells the server
// (`acknowledge`, a bound Server Action) — never the render (DEC-195 §2.6). A
// page the server painted stays static and tells nothing, so the moment plays at
// the next in-app arrival (DEC-197 §5). A decrease, or a gain with no
// completion row, is not an occurrence: the server says so and nothing moves.

export interface MomentPointsHeadProps {
  heading: string;
  balanceLabel: string;
  total: number;
  /** Moment 3's occurrence — null when there is nothing to celebrate. */
  completion: { occurrenceId: string; from: number; fromProgress: number } | null;
  /** «+N», drawn beside the balance with the occurrence; its words for a screen reader. */
  delta: ReactNode | null;
  deltaLabel: string | null;
  /** Moment 4's occurrence. */
  levelUp: { occurrenceId: string } | null;
  /** The flame and its line — null when the org has no streak rule, or the member no streak. */
  streak: ReactNode | null;
  /** The bar and its line, and the level card — null with no level yet. */
  bar: ReactNode | null;
  card: ReactNode | null;
  needsMark: boolean;
  acknowledge: () => Promise<void>;
}

export function MomentPointsHead(props: MomentPointsHeadProps) {
  // ★ Latched for the life of this mount: an acknowledgement may refresh the page
  // with no occurrence, and the delta the member was shown must not vanish mid-visit.
  const [latched] = useState(() => ({ completion: props.completion, levelUp: props.levelUp, delta: props.delta, deltaLabel: props.deltaLabel }));
  const { completion, levelUp } = latched;

  const three = useSeenMoment("completion", completion?.occurrenceId ?? null);
  const four = useSeenMoment("level", levelUp?.occurrenceId ?? null);
  const [finished, setFinished] = useState({ three: false, four: false });

  const root = useRef<HTMLDivElement>(null);
  const countDone = useRef<(() => void) | null>(null);
  const figure = useCountUp({
    from: completion?.from ?? props.total,
    to: props.total,
    duration: "party",
    play: three.phase === "playing",
    onDone: () => countDone.current?.(),
  });

  const playThree = three.phase === "playing";
  const playFour = four.phase === "playing";

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || (!playThree && !playFour)) return;
    const easing = readEasing("play");
    const party = readDuration("party");
    const slow = readDuration("slow");
    const base = readDuration("base");
    const running: Animation[] = [];
    let at = 0;

    const counted = playThree ? new Promise<void>((resolve) => (countDone.current = resolve)) : Promise.resolve();
    let bar: Animation | null = null;
    if (playThree && completion) {
      const delta = el.querySelector<HTMLElement>("[data-slot=delta]");
      if (delta) running.push(delta.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: base, easing, fill: "backwards" }));
      at += party;
      const flame = el.querySelector<HTMLElement>("[data-slot=flame]");
      if (flame) {
        running.push(flame.animate([{ transform: "scale(0.78)" }, { transform: "none" }], { duration: slow, delay: at, easing, fill: "backwards" }));
        at += slow;
      }
      const fill = el.querySelector<HTMLElement>("[data-slot=level-bar] [data-slot=fill]");
      if (fill) {
        const to = playFour ? 1 : Number(/scaleX\(([^)]+)\)/.exec(fill.style.transform)?.[1] ?? 1);
        bar = fill.animate([{ transform: `scaleX(${completion.fromProgress})` }, { transform: `scaleX(${to})` }], {
          duration: party,
          delay: at,
          easing,
          fill: playFour ? "both" : "backwards",
        });
        running.push(bar);
        at += party;
      }
    }
    if (playFour) {
      const inner = el.querySelector<HTMLElement>("[data-slot=flip-inner]");
      if (inner) running.push(inner.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }], { duration: party, delay: at, easing, fill: "backwards" }));
      const shine = el.querySelector<HTMLElement>("[data-slot=shine]");
      if (shine) {
        // The one keyframe that lives in `globals.css` (contract 2). Its delay is the turn's 60 %.
        shine.style.animationDelay = `${at + party * 0.6}ms`;
        shine.classList.add(SHINE);
        const clear = () => {
          shine.classList.remove(SHINE);
          shine.style.removeProperty("animation-delay");
        };
        shine.addEventListener("animationend", clear, { once: true });
        shine.addEventListener("animationcancel", clear, { once: true });
      }
    }

    let live = true;
    Promise.all([counted, ...running.map((a) => a.finished)])
      .then(() => {
        if (!live) return;
        bar?.cancel();
        if (playThree) three.done();
        if (playFour) four.done();
        setFinished({ three: playThree, four: playFour });
      })
      .catch(() => {
        // An animation cancelled by an unmount: nothing to finish.
      });
    return () => {
      live = false;
      for (const a of running) a.cancel();
    };
    // The moment starts once per phase change; `three`/`four` are new objects every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playThree, playFour]);

  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !props.needsMark) return;
    if (!readyToAcknowledge([
      { verdict: three.verdict, finished: finished.three },
      { verdict: four.verdict, finished: finished.four },
    ])) return;
    sent.current = true;
    // A failed acknowledgement animates nothing and says nothing: this tab's claim keeps it silent here,
    // and another device plays it once more.
    props.acknowledge().catch(() => {});
  }, [three.verdict, four.verdict, finished, props]);

  return (
    <div ref={root} data-moment={playThree || playFour ? "playing" : "static"} className="flex flex-col gap-5">
      <h2 className="sr-only">{props.heading}</h2>
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span className="sr-only">{props.balanceLabel}</span>
        <strong className="font-display text-play-xl font-extrabold text-fg-heading">
          <bdi>{figure}</bdi>
        </strong>
        {latched.delta ? (
          <span data-slot="delta" className="font-display text-play-sm font-extrabold text-accent pg-light:text-fg-heading">
            <span aria-hidden="true">{latched.delta}</span>
            <span className="sr-only">{latched.deltaLabel}</span>
          </span>
        ) : null}
      </p>
      {props.streak}
      {props.bar}
      {props.card}
    </div>
  );
}

// Tailwind reads this literal; the keyframe and its easing are the lead's (contract 2).
const SHINE = "animate-[moment-shine_var(--duration-slow)_var(--ease-play)_both]";
