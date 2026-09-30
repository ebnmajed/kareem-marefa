"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useCountUp } from "@/lib/ui/count-up";
import { momentKeys, readyToAcknowledge, useSeenMoment } from "@/components/scoring/use-seen-moment";
import { useDisplayed } from "@/components/scoring/use-displayed";

// Moment 3 on the event page's outcome card — the points a completed session paid, counted up (wave 18 PR B,
// REQ-UIX-061, DEC-206 §5, DEC-209). scoring's file; `sessions` renders it on `SCR-012`.
//
// ★ NOT A NEW MOMENT AND NOT A COPY. The occurrence is moment 3's — `completion:<the balance's last entry>`,
// decided by `getPointsHead()` for `SCR-022` and the home's week, and narrowed by `getSessionCompletion()` to
// «this session's award is among the rows not yet seen» — and it goes through `useSeenMoment()` like the other
// two surfaces. So whichever of the three the member opens first plays, and the others are silent, in the tab
// (the claim) and on every device (`member_seen_marks`).
//
// ★ THE SERVER DRAWS THE STATIC STATE — the amount paid. This counts the figure from zero to it (`party`,
// `useCountUp`, through the numeral formatter) and moves nothing else: the coin's drop is moment 2's, on
// `SCR-014`. `sessions` places `CompletionFigure` where the amount is drawn. A hard load plays nothing and tells
// nothing (DEC-197 §5); reduced motion shows the amount at once. The copy the page hides at this width — the
// card can be in the HTML for the phone and for the desktop row — mounts no controller (`use-displayed.ts`).
//
// Once shown, the client tells the server with the WEEK's mark — the level last seen passed through, so
// `SCR-022`'s level card still turns (DEC-207 §1.3). With no occurrence the card tells nothing: it is not a
// balance surface.

const Frame = createContext<string | null>(null);

/** The award's figure: the server's text, or the counting frame while moment 3 plays here. */
export function CompletionFigure({ text }: { text: string }) {
  const frame = useContext(Frame);
  return <>{frame ?? text}</>;
}

export interface MomentCompletionProps {
  /** Moment 3's occurrence, when this session's award is still unseen — else null, and the card is static. */
  occurrenceId: string | null;
  /** The amount the session paid — the count's end. */
  points: number;
  needsMark: boolean;
  acknowledge: () => Promise<void>;
  /** The server rendered this for the document — a hard load: nothing plays on it (DEC-197 §5). */
  documentLoad?: boolean;
  className?: string;
  children: ReactNode;
}

export function MomentCompletion(props: MomentCompletionProps) {
  const root = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const displayed = useDisplayed(root);
  return (
    <Frame.Provider value={frame}>
      {/* `data-moment-copy` says which copy owns the moment — for a test to wait on, never for style. */}
      <div ref={root} className={props.className} data-moment-copy={displayed ? "displayed" : "hidden"}>
        {props.children}
      </div>
      {displayed && props.occurrenceId ? <Controller {...props} occurrenceId={props.occurrenceId} root={root} onFrame={setFrame} /> : null}
    </Frame.Provider>
  );
}

function Controller({
  occurrenceId,
  points,
  needsMark,
  acknowledge,
  documentLoad = false,
  root,
  onFrame,
}: MomentCompletionProps & { occurrenceId: string; root: RefObject<HTMLDivElement | null>; onFrame: (f: string | null) => void }) {
  // ★ Latched for the life of this mount: the acknowledgement may refresh the page with no occurrence.
  const [latched] = useState(() => ({ occurrenceId, documentLoad }));
  const three = useSeenMoment("completion", latched.occurrenceId, latched.documentLoad);
  const playing = three.phase === "playing";
  const [finished, setFinished] = useState(false);
  const figure = useCountUp({
    from: 0,
    to: points,
    duration: "party",
    play: playing,
    onDone: () => {
      three.done();
      setFinished(true);
    },
  });

  useEffect(() => {
    onFrame(playing ? figure : null);
  }, [playing, figure, onFrame]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.setAttribute("data-moment", playing ? "playing" : "static");
    const keys = momentKeys([["completion", latched.occurrenceId]]);
    if (keys) el.setAttribute("data-moment-keys", keys);
  }, [playing, root, latched.occurrenceId]);

  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !needsMark || !readyToAcknowledge([{ verdict: three.verdict, finished }])) return;
    sent.current = true;
    // A failed acknowledgement animates nothing and says nothing: this tab's claim keeps it silent here.
    acknowledge().catch(() => {});
  }, [three.verdict, finished, needsMark, acknowledge]);

  return null;
}
