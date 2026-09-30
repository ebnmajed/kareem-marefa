"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { formatNumber } from "@/components/sessions/numerals";
import { useCountUp } from "@/lib/ui/count-up";
import { readDuration, readEasing } from "@/lib/ui/duration";
import { momentKeys, readyToAcknowledge, useSeenMoment } from "@/components/scoring/use-seen-moment";
import { useDisplayed } from "@/components/scoring/use-displayed";

// Moments 3 and 5 on the member's week — the home's HUD and the desktop's game rail (wave 18, REQ-UIX-055,
// DEC-206 §5, DEC-207 §1.3). scoring's file.
//
// ★ NOT A NEW MOMENT. The occurrences are `SCR-022`'s and the monthly board's, decided by the same pure
// functions and keyed with the same ids (`completion:<ledger entry>`, `rank:monthly:<period>:<seen>-<now>`),
// so `useMoment`'s claim in the tab and `member_seen_marks` across devices make whichever surface the member
// opens first play, and the other silent.
//
// ★ THE SERVER DRAWS THE STATIC STATE, whole: the new balance with «+N» beside it, the bar at the truth, the
// rank with its rise arrow. This only moves what is drawn, by `element.animate()` from the frame last seen,
// on the server-drawn slots — `points`, `delta`, `level-bar`'s `fill`, `flame`, `rank`, `rise` — and counts the
// figures through `WeekFigure`, which reads this component's context:
//
//   3 · the balance counts up (`party`), «+N» fades in (`base`), the level bar's fill grows by `scaleX`
//       (`party`) — ★ unless a level-up is unseen: then the bar's truth can be SHORTER than before and it
//       stands still (DEC-207, scoring's plan §5.1) — and a flame, where one is drawn, grows to rest (`slow`);
//   5 · the rank counts from the rank last seen to the new one (`slow`) and the arrow fades in (`base`).
//       ★ The arrow never pulses (DEC-197 §2). A fall is not an occurrence: nothing moves.
//
// Transform and opacity only; every duration a token; `fill: "backwards"`, so a finished animation leaves
// exactly what the server drew; nothing sets `will-change`.
//
// ★ TWO COPIES ARE IN THE HTML (DEC-207 §2): the phone's HUD and the desktop's rail, one of them not
// displayed. The first copy to mount would claim the occurrence — possibly the hidden one. So a gate
// measures, before paint, whether its own element is displayed, and only the displayed copy mounts the
// controller that claims, animates and acknowledges. The hidden copy is the static state: it claims nothing
// and tells the server nothing.

type Frames = { points: string | null; rank: string | null };
const WeekFrames = createContext<Frames>({ points: null, rank: null });

/** A figure of the week: the server's text, or the counting frame while moment 3 or 5 plays. */
export function WeekFigure({ slot, text, prefix = "" }: { slot: "points" | "rank"; text: string; prefix?: string }) {
  const frame = useContext(WeekFrames)[slot];
  return <>{frame === null ? text : `${prefix}${frame}`}</>;
}

export interface MomentWeekProps {
  /** Moment 3's occurrence — null when there is nothing to celebrate. */
  completion: { occurrenceId: string; from: number; to: number; fromProgress: number; moveBar: boolean } | null;
  /** Moment 5's occurrence — a rise since the rank last seen, in the same month. */
  rank: { occurrenceId: string; from: number; to: number } | null;
  pointsNeedsMark: boolean;
  /** Null: nothing to acknowledge for the board (no rank this month). */
  rankNeedsMark: boolean;
  acknowledgePoints: () => Promise<void>;
  acknowledgeRank: (() => Promise<void>) | null;
  /** The server rendered this for the document — a hard load: nothing plays on it (DEC-197 §5). */
  documentLoad?: boolean;
  className?: string;
  children: ReactNode;
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? () => {} : useLayoutEffect;

export function MomentWeek(props: MomentWeekProps) {
  const root = useRef<HTMLDivElement>(null);
  const [frames, setFrames] = useState<Frames>({ points: null, rank: null });

  // Only the copy on screen mounts the controller — watched until it has a box (`use-displayed.ts`). A copy that
  // appears later, a resize across `lg`, finds the occurrence claimed by the one the member was looking at.
  const displayed = useDisplayed(root);

  return (
    <WeekFrames.Provider value={frames}>
      {/* `data-moment-copy` says which copy owns the moments — for a test to wait on, never for style. */}
      <div ref={root} className={props.className} data-moment-copy={displayed ? "displayed" : "hidden"}>
        {props.children}
      </div>
      {displayed ? <Controller {...props} root={root} onFrames={setFrames} /> : null}
    </WeekFrames.Provider>
  );
}

function Controller({
  completion,
  rank,
  pointsNeedsMark,
  rankNeedsMark,
  acknowledgePoints,
  acknowledgeRank,
  documentLoad = false,
  root,
  onFrames,
}: MomentWeekProps & { root: RefObject<HTMLDivElement | null>; onFrames: (f: Frames) => void }) {
  // ★ Latched for the life of this mount: an acknowledgement may refresh the page with no occurrence.
  const [latched] = useState(() => ({ completion, rank, documentLoad }));
  const three = useSeenMoment("completion", latched.completion?.occurrenceId ?? null, latched.documentLoad);
  const five = useSeenMoment("rank", latched.rank?.occurrenceId ?? null, latched.documentLoad);
  const [finished, setFinished] = useState({ three: false, five: false });
  const playThree = three.phase === "playing";
  const playFive = five.phase === "playing";

  const countedThree = useRef<(() => void) | null>(null);
  const countedFive = useRef<(() => void) | null>(null);
  const points = useCountUp({
    from: latched.completion?.from ?? 0,
    to: latched.completion?.to ?? 0,
    duration: "party",
    play: playThree,
    onDone: () => countedThree.current?.(),
  });
  const rankFrame = useCountUp({
    from: latched.rank?.from ?? 0,
    to: latched.rank?.to ?? 0,
    duration: "slow",
    play: playFive,
    onDone: () => countedFive.current?.(),
    format: formatNumber,
  });

  useEffect(() => {
    onFrames({ points: playThree ? points : null, rank: playFive ? rankFrame : null });
  }, [playThree, playFive, points, rankFrame, onFrames]);

  // The keys this copy stands for, once it has decided — a later surface's probe of the document finds them.
  useIsomorphicLayoutEffect(() => {
    const el = root.current;
    const keys = momentKeys([["completion", latched.completion?.occurrenceId], ["rank", latched.rank?.occurrenceId]]);
    if (el && keys) el.setAttribute("data-moment-keys", keys);
    if (el) el.setAttribute("data-moment", playThree || playFive ? "playing" : "static");
  }, [playThree, playFive]);

  useIsomorphicLayoutEffect(() => {
    const el = root.current;
    if (!el || (!playThree && !playFive)) return;
    const easing = readEasing("play");
    const party = readDuration("party");
    const slow = readDuration("slow");
    const base = readDuration("base");
    const running: Animation[] = [];
    const waits: Promise<void>[] = [];

    if (playThree && latched.completion) {
      waits.push(new Promise<void>((resolve) => (countedThree.current = resolve)));
      for (const delta of el.querySelectorAll<HTMLElement>("[data-slot=delta]")) {
        running.push(delta.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: base, easing, fill: "backwards" }));
      }
      for (const flame of el.querySelectorAll<HTMLElement>("[data-slot=flame]")) {
        running.push(flame.animate([{ transform: "scale(0.78)" }, { transform: "none" }], { duration: slow, delay: party, easing, fill: "backwards" }));
      }
      if (latched.completion.moveBar) {
        for (const fill of el.querySelectorAll<HTMLElement>("[data-slot=level-bar] [data-slot=fill]")) {
          const to = Number(/scaleX\(([^)]+)\)/.exec(fill.style.transform)?.[1] ?? 1);
          running.push(
            fill.animate([{ transform: `scaleX(${latched.completion.fromProgress})` }, { transform: `scaleX(${to})` }], { duration: party, delay: party, easing, fill: "backwards" }),
          );
        }
      }
    }
    if (playFive && latched.rank) {
      waits.push(new Promise<void>((resolve) => (countedFive.current = resolve)));
      for (const rise of el.querySelectorAll<HTMLElement>("[data-slot=rise]")) {
        running.push(rise.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: base, delay: slow, easing, fill: "backwards" }));
      }
    }

    let live = true;
    Promise.all([...waits, ...running.map((a) => a.finished)])
      .then(() => {
        if (!live) return;
        if (playThree) three.done();
        if (playFive) five.done();
        setFinished({ three: playThree, five: playFive });
      })
      .catch(() => {
        // Cancelled by an unmount: nothing to finish.
      });
    return () => {
      live = false;
      for (const a of running) a.cancel();
    };
    // The moments start once per phase change; `three`/`five` are new objects every render.
  }, [playThree, playFive]);

  const sentPoints = useRef(false);
  const sentRank = useRef(false);
  useEffect(() => {
    if (!sentPoints.current && pointsNeedsMark && readyToAcknowledge([{ verdict: three.verdict, finished: finished.three }])) {
      sentPoints.current = true;
      // A failed acknowledgement animates nothing and says nothing: this tab's claim keeps it silent here.
      acknowledgePoints().catch(() => {});
    }
    if (!sentRank.current && rankNeedsMark && acknowledgeRank && readyToAcknowledge([{ verdict: five.verdict, finished: finished.five }])) {
      sentRank.current = true;
      acknowledgeRank().catch(() => {});
    }
  }, [three.verdict, five.verdict, finished, pointsNeedsMark, rankNeedsMark, acknowledgePoints, acknowledgeRank]);

  return null;
}
