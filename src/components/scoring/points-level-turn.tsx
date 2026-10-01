import type { ReactNode } from "react";

// SCR-022's level row, and moment 4's surface (wave 20, DEC-218 §3.1, REQ-UIX-047, DEC-195). scoring's file.
//
// `Points.dc.html` draws the level as text at the head's inline-end: «مستواك», the level's name, the way to the next.
// ★ Moment 4 stays on `SCR-022` and TURNS THAT TEXT IN PLACE: when a level reached is not yet seen, the row is two
// faces back to back in 3D — the level held, then the level reached — and the server draws the END frame (the
// reached face showing, `rotate-y-180` as a static class). `MomentPointsHead` finds `flip-inner` and `shine` and
// moves them once; under reduced motion, a reload or another phone the end frame IS the state.
//
// Both faces are in the document and neither is `sr-only`: a screen reader meets the level held and then the level
// reached, each a group named by its caption («مستواك» / «مستوى جديد»). The row's height is its taller face's; the
// faces' text sits in no clip — the shine is clipped on its own layer. Nothing here moves by itself.

export interface LevelFaceText {
  caption: string;
  name: string;
}

function Face({ face, extra = "", shine = false }: { face: LevelFaceText; extra?: string; shine?: boolean }) {
  return (
    <div role="group" aria-label={face.caption} className={`relative flex flex-col items-end text-end leading-tight ${extra}`}>
      {shine ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 [clip-path:inset(0)]">
          <span data-slot="shine" className="absolute -inset-y-1/3 start-0 w-1/4 bg-fg-heading/50 opacity-0" />
        </span>
      ) : null}
      <span className="text-caption font-bold text-fg-muted">{face.caption}</span>
      {/* The heading ink, as the artboard draws it here — the ramp colour is the medallion's, on the standing card. */}
      <span className="font-display text-play-sm font-extrabold text-fg-heading">
        <bdi>{face.name}</bdi>
      </span>
    </div>
  );
}

export function PointsLevelTurn({ held, reached, line }: { held: LevelFaceText; reached: LevelFaceText | null; line: ReactNode }) {
  return (
    <div className="flex flex-col items-end gap-0.5 text-end">
      {reached ? (
        <div data-layout="flip" data-shown="reached" className="perspective-distant">
          <div data-slot="flip-inner" className="grid transform-3d rotate-y-180">
            <Face face={held} extra="[grid-area:1/1] backface-hidden" />
            <Face face={reached} extra="[grid-area:1/1] backface-hidden rotate-y-180" shine />
          </div>
        </div>
      ) : (
        <Face face={held} />
      )}
      <span className="text-caption text-fg-muted">{line}</span>
    </div>
  );
}
