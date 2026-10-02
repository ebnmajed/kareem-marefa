"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { formatNumber } from "@/components/sessions/numerals";
import { useCountUp } from "@/lib/ui/count-up";
import { readDuration, readEasing } from "@/lib/ui/duration";
import { momentKeys, readyToAcknowledge, useSeenMoment } from "@/components/scoring/use-seen-moment";

// Moment 5, تغيّر الترتيب, on SCR-027 and SCR-028 (wave 16, REQ-UIX-048, DEC-195 §1.1,
// DEC-197 §2). scoring's file.
//
// ★ THE SERVER DRAWS THE NEW ORDER — the static state, complete, with the risen
// row's arrow shown. With a first sight to play, this measures the rows before
// the first paint and moves them FROM where they stood, by FLIP without
// reordering the DOM, which is already final: the member's row from `k` rows
// down to its place, and each of the `k` rows it passed from one row up to its
// own (`translateY`, `slow`). ★★ A passed row moves only because the member's
// row displaced it — no colour, no icon, no shake, nothing of its own — and a
// member whose rank FELL is not an occurrence at all: nothing moves.
// On the company board the member's company's bar grows by `scaleX` from where
// it was (`party`), from the inline start — `progress-bar`'s own origin.
//
// ★ The arrow does not pulse (DEC-197 §2): it is shown, in the static state.
// `element.animate()` writes no `style` attribute and fills backwards only, so
// when it finishes every row is exactly what the server drew. Nothing sets
// `will-change`. A board the server painted stays static and tells the server
// nothing (DEC-197 §5); otherwise the client that showed it acknowledges.

export interface MomentRankProps {
  /** `useMoment("rank", …)`'s id — null when nothing plays. */
  occurrenceId: string | null;
  /** The member's (or their company's) row index among the rows drawn in the list. */
  index: number | null;
  /** How many rows it passed; the FLIP runs only when its old place is among the rows drawn. */
  passed: number;
  /** Company board: the own bar's old length, when it grew. */
  fromFraction: number | null;
  needsMark: boolean;
  acknowledge: (() => Promise<void>) | null;
  /** The server rendered this board for the document — a hard load: it never plays on this page load. */
  documentLoad?: boolean;
  /**
   * ★ wave 20, PR B (DEC-218 §3.4), add-only: the «ترتيبك» card's figure counts from the rank last seen to the new one
   * while the rows FLIP — ONE moment, one claim, two parts. The card draws its figure through `RankFigure`, and its
   * arrow (`[data-slot=rise]`) fades in. Absent: the board before wave 20, unchanged.
   */
  count?: { from: number; to: number } | null;
  /** add-only: which list the FLIP moves — a selector inside the root. Default the first `ul`, as before. */
  listSelector?: string;
  children: ReactNode;
}

const RankFrame = createContext<string | null>(null);

/** The rank card's figure: the server's text, or the counting frame while moment 5 plays. */
export function RankFigure({ text, prefix = "" }: { text: string; prefix?: string }) {
  const frame = useContext(RankFrame);
  return <>{frame === null ? text : `${prefix}${frame}`}</>;
}

export function MomentRank({ occurrenceId, index, passed, fromFraction, needsMark, acknowledge, documentLoad = false, count = null, listSelector = "ul", children }: MomentRankProps) {
  const [latchedId] = useState(occurrenceId);
  const [latchedLoad] = useState(documentLoad);
  const five = useSeenMoment("rank", latchedId, latchedLoad);
  const [finished, setFinished] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const playing = five.phase === "playing";
  const [latchedCount] = useState(count);
  const counted = useRef<(() => void) | null>(null);
  const frame = useCountUp({
    from: latchedCount?.from ?? 0,
    to: latchedCount?.to ?? 0,
    duration: "slow",
    play: playing && latchedCount !== null,
    onDone: () => counted.current?.(),
    format: formatNumber,
  });

  useLayoutEffect(() => {
    const el = root.current;
    if (!playing || !el) return;
    const list = el.querySelector(listSelector);
    const rows = (list ? Array.from(list.children) : []) as HTMLElement[];
    const easing = readEasing("play");
    const slow = readDuration("slow");
    const party = readDuration("party");
    const running: Animation[] = [];
    let at = 0;

    const waits: Promise<void>[] = [];
    if (latchedCount) {
      waits.push(new Promise<void>((resolve) => (counted.current = resolve)));
      const base = readDuration("base");
      for (const rise of el.querySelectorAll<HTMLElement>("[data-slot=rank-card] [data-slot=rise]")) {
        running.push(rise.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: base, delay: slow, easing, fill: "backwards" }));
      }
    }

    const me = index === null ? undefined : rows[index];
    const oldPlace = index === null ? undefined : rows[index + passed];
    if (me && index !== null && passed > 0 && oldPlace) {
      const down = oldPlace.offsetTop - me.offsetTop;
      const up = me.offsetTop - (rows[index + 1]?.offsetTop ?? me.offsetTop);
      running.push(me.animate([{ transform: `translateY(${down}px)` }, { transform: "none" }], { duration: slow, easing, fill: "backwards" }));
      for (const row of rows.slice(index + 1, index + passed + 1)) {
        running.push(row.animate([{ transform: `translateY(${up}px)` }, { transform: "none" }], { duration: slow, easing, fill: "backwards" }));
      }
      at = slow;
    }
    if (me && fromFraction !== null) {
      const fill = me.querySelector<HTMLElement>("[data-slot=fill]");
      const to = fill ? /scaleX\(([^)]+)\)/.exec(fill.style.transform)?.[1] : undefined;
      if (fill && to !== undefined) {
        running.push(fill.animate([{ transform: `scaleX(${fromFraction})` }, { transform: `scaleX(${to})` }], { duration: party, delay: at, easing, fill: "backwards" }));
      }
    }

    let live = true;
    Promise.all([...waits, ...running.map((a) => a.finished)])
      .then(() => {
        if (!live) return;
        five.done();
        setFinished(true);
      })
      .catch(() => {
        // Cancelled by an unmount.
      });
    return () => {
      live = false;
      for (const a of running) a.cancel();
    };
    // The moment starts once, when the phase turns to playing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !needsMark || !acknowledge) return;
    if (!readyToAcknowledge([{ verdict: five.verdict, finished }])) return;
    sent.current = true;
    acknowledge().catch(() => {});
  }, [five.verdict, finished, needsMark, acknowledge]);

  return (
    <RankFrame.Provider value={playing && latchedCount ? frame : null}>
      <div ref={root} data-moment={playing ? "playing" : "static"} data-moment-keys={momentKeys([["rank", latchedId]])}>
        {children}
      </div>
    </RankFrame.Provider>
  );
}
