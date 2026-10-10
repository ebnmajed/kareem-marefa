"use client";

import type { CSSProperties } from "react";
import type { StoryRingProps, StoryRingState } from "@/components/ui";
import { teamColorOrNull } from "@/components/ui/avatar";
import { CheckIcon } from "@/components/ui/icons";

// content's file — REQ-UIX-040, DEC-183 §3 (`DEC-NEXT-14`), DEC-186 §4 – §5.
// The ring that will open a session's story from SCR-010. A BUTTON, and
// nothing of the viewer: the viewer is `DEC-093`'s seventh place and a later
// wave's. It renders every state from props and reads nothing.
//
// ★ FOUR STATES, TOLD APART WITHOUT COLOUR (REQ-NFR-007). Each has its own
// visible word under the ring — the caller's `stateLabel` — AND its own shape:
//   live      a DOUBLE ring                      «مباشر»
//   recap     a single 3 px ring in the accent    «ملخص»
//   upcoming  a single 3 px ring in the team      «قادمة»
//   seen      a 1 px ring, the letter muted, a check mark   «شوهدت»
// `stories.html` told «seen» from «upcoming» by colour and opacity alone, with
// the same letter and the same day; the word and the check are why this one
// does not.
//
// ★ STATIC this wave (DEC-186 §4): the live ring does not pulse. It reads live
// by its word and its double ring, which is also its reduced-motion state.
//
// The accessible name is the caller's `label`, naming the session; everything
// drawn inside is `aria-hidden`, so nothing is read twice. The button is at
// least 44 px in both directions.
//
// ★ Wave 18 (DEC-206 §1.5, DEC-207 §1.5, REQ-UIX-055): until session stories
// exist a ring opens nothing, and a button that does nothing is a lie to a
// keyboard and a screen reader. So with no `onOpen` the ring is NOT a button:
// the same box, the same drawing, a non-interactive element named by `label` as
// an image, out of the tab order. With `onOpen` it is the button above,
// unchanged. No prop changes.

const RING: Record<StoryRingState, string> = {
  live: "border-[3px] border-signal",
  recap: "border-[3px] border-accent",
  upcoming: "border-[3px]",
  seen: "border border-edge-strong",
};

export function StoryRing({ state, label, stateLabel, glyph, caption, teamColor, onOpen, className = "" }: StoryRingProps) {
  // Only an upcoming ring wears the team; its colour reaches this element alone as `--team`.
  const colour = state === "upcoming" ? teamColorOrNull(teamColor) : null;
  const upcoming = state === "upcoming" ? (colour ? "border-team" : "border-team-neutral") : "";
  const style = colour ? ({ "--team": colour } as CSSProperties) : undefined;

  const box = `inline-flex min-h-11 w-[4.25rem] shrink-0 flex-col items-center gap-1 rounded-tile p-0.5 ${className}`;
  const drawing = (
    <>
      <span aria-hidden className={`relative inline-flex size-15 items-center justify-center rounded-pill bg-surface ${RING[state]} ${upcoming}`}>
        {state === "live" ? <span data-slot="outer-ring" className="absolute -inset-[7px] rounded-pill border-2 border-signal" /> : null}
        <span className={`font-display text-2xl font-extrabold leading-none ${state === "seen" ? "text-fg-muted" : "text-fg-heading"}`}>
          <bdi>{glyph}</bdi>
        </span>
        {state === "seen" ? (
          <span data-slot="seen-mark" className="absolute -bottom-0.5 -end-0.5 inline-flex size-5 items-center justify-center rounded-pill border border-edge-strong bg-raised text-caption text-fg-heading">
            <CheckIcon />
          </span>
        ) : null}
      </span>
      <span aria-hidden className="flex flex-col items-center text-caption leading-tight">
        {/* The word takes the text colour in every state: coral text on the light variant's paper
            would fall under 4.5:1. The ring carries the colour; the word carries the meaning. */}
        <bdi className="font-bold text-fg-heading">{stateLabel}</bdi>
        <bdi className="text-fg-muted">{caption}</bdi>
      </span>
    </>
  );
  if (!onOpen) {
    return (
      <div role="img" aria-label={label} data-state={state} style={style} className={box}>
        {drawing}
      </div>
    );
  }
  return (
    // Wave 26 (REQ-STO-007), add-only: a ring opens the story viewer, a dialog — and says so.
    // ★ Wave 29 (REQ-UIX-121): the ring presses before the story zooms out of it.
    <button type="button" aria-label={label} aria-haspopup="dialog" data-state={state} data-press="" onClick={onOpen} style={style} className={box}>
      {drawing}
    </button>
  );
}
