import type { LevelCardProps, LevelFace } from "@/components/ui";

// scoring's file — REQ-UIX-039, REQ-REC-004, DEC-183, DEC-186 §7.
//
// Two faces: the level the member held, and — when one has just been reached —
// the new level. Each names what it unlocks.
//
// ★ BOTH FACES ARE IN THE DOCUMENT IN EVERY STATE, AND NEITHER IS HIDDEN FROM
// ASSISTIVE TECHNOLOGY. The face that is not shown is `sr-only` — never
// `hidden`, `display: none`, `aria-hidden` or `inert`. The moments' wave turns
// this into a 3D flip whose back face is `backface-visibility: hidden`, which
// hides nothing from a screen reader either, so the guarantee survives it.
// Nothing on the card is focusable, so a visually hidden face never takes focus.
//
// ★ STATES, NOT MOMENTS (DEC-186 §4). Which face shows is `shown`; nothing
// here transitions or animates. Under reduced motion the new face is simply
// shown, which is exactly this component with `shown="reached"`.
//
// ★ A FACE NEVER NAMES A PRIVILEGE THE MEMBER DOES NOT HAVE. `unlocks` is the
// org's ENABLED perks at that level, and in a default org there are none
// (`0027:577-582`), so an empty list says `noUnlocksLabel` — never a made-up
// privilege (DEC-186 §7).
//
// ★ NO ID IS WRITTEN (the lead's finding on a985050a). Each face and its list
// are named by `aria-label`, never by `aria-labelledby` to a generated id: an
// element rendered twice — the gallery places one demo element on both grounds,
// and Flight writes the same subtree twice — would repeat every id in it, and a
// reference to a repeated id resolves to the FIRST, so the face on screen could
// be named by a caption that is not. A primitive with no ids cannot collide.
// The visible «يفتح لك» is `aria-hidden` because the list already carries it as
// its name; the caption stays readable text as well as the group's name.
//
// The ramp stop is keyed on `tier` (`levels.sort_order`), never on the name,
// which an org may change (REQ-REC-003). The five stops are constants.
//
// ★ `flip` (wave 16, DEC-197 — moment 4's layout). The two faces are stacked in
// one grid cell, back to back in 3D: both `backface-visibility: hidden`, the
// reached face turned 180°, and `shown` turns the INNER card — as a static
// class, so the static state is the end frame without anything having moved.
// Both faces are drawn (neither `sr-only`), so a screen reader still meets
// both, in order. The card's height is its taller face's — no fixed height and
// no clip on the faces' text. The reached face carries one decorative shine
// layer (`data-slot="shine"`), transparent at rest, clipped by `clip-path` on
// its own layer so the text never sits inside a clip; moment 4 sweeps it once.
// Nothing here moves: the turn and the sweep are the moment's
// (`components/scoring/moment-points-head.tsx`).

// Literal strings, so Tailwind sees every class.
const RAMP = ["bg-level-1", "bg-level-2", "bg-level-3", "bg-level-4", "bg-level-5"] as const;

/** `levels.sort_order` → a ramp stop, clamped to 1–5. Exported for its test. */
export function rampStop(tier: number): 1 | 2 | 3 | 4 | 5 {
  const t = Number.isFinite(tier) ? Math.round(tier) : 1;
  return Math.min(5, Math.max(1, t)) as 1 | 2 | 3 | 4 | 5;
}

function Face({
  face,
  kind,
  visible,
  unlocksLabel,
  noUnlocksLabel,
  stacked = "",
  shine = false,
}: {
  face: LevelFace;
  kind: "level" | "reached";
  visible: boolean;
  unlocksLabel: string;
  noUnlocksLabel: string;
  /** The flip layout's placement classes; empty in the default layout. */
  stacked?: string;
  shine?: boolean;
}) {
  const stop = rampStop(face.tier);
  const reached = kind === "reached";
  const look = reached
    ? `${RAMP[stop - 1]} text-on-level border-transparent`
    : "bg-raised text-fg-heading border-edge";
  const quiet = reached ? "text-on-level" : "text-fg-muted";

  return (
    <div
      role="group"
      aria-label={face.caption}
      data-face={kind}
      data-tier={stop}
      data-visible={visible ? "true" : "false"}
      className={visible ? `relative flex flex-col items-center gap-2 rounded-panel border p-5 text-center ${look} ${stacked}` : "sr-only"}
    >
      {shine ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 [clip-path:inset(0_round_var(--radius-panel))]">
          <span data-slot="shine" className="absolute -inset-y-1/3 start-0 w-1/4 bg-fg-heading/50 opacity-0" />
        </span>
      ) : null}
      <p className={`text-caption font-semibold ${quiet}`}>
        {face.caption}
      </p>
      <p className={`font-display font-extrabold ${reached ? "text-play-md" : "text-play-sm"}`}>
        <bdi>{face.name}</bdi>
      </p>
      {face.unlocks.length > 0 ? (
        <div className="flex flex-col items-center gap-1">
          <p aria-hidden="true" className={`text-caption font-semibold ${quiet}`}>
            {unlocksLabel}
          </p>
          <ul aria-label={unlocksLabel} className="flex flex-col items-center gap-0.5 text-body font-semibold">
            {face.unlocks.map((unlock) => (
              <li key={unlock}>
                <bdi>{unlock}</bdi>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={`text-caption font-semibold ${quiet}`}>{noUnlocksLabel}</p>
      )}
    </div>
  );
}

export function LevelCard({ level, reached, shown = "level", unlocksLabel, noUnlocksLabel, flip = false, className = "" }: LevelCardProps) {
  // «reached» with no reached face shows the level held.
  const showing = shown === "reached" && reached ? "reached" : "level";
  if (flip && reached) {
    return (
      <div data-shown={showing} data-layout="flip" className={`perspective-distant ${className}`}>
        {/* Logical order for a screen reader: the level held, then the level reached — both drawn. */}
        <div data-slot="flip-inner" className={`grid transform-3d ${showing === "reached" ? "rotate-y-180" : ""}`}>
          <Face face={level} kind="level" visible unlocksLabel={unlocksLabel} noUnlocksLabel={noUnlocksLabel} stacked="[grid-area:1/1] backface-hidden" />
          <Face
            face={reached}
            kind="reached"
            visible
            unlocksLabel={unlocksLabel}
            noUnlocksLabel={noUnlocksLabel}
            stacked="[grid-area:1/1] backface-hidden rotate-y-180"
            shine
          />
        </div>
      </div>
    );
  }
  return (
    <div data-shown={showing} className={`flex flex-col ${className}`}>
      {/* Logical order for a screen reader: the level held, then the level reached. */}
      <Face face={level} kind="level" visible={showing === "level"} unlocksLabel={unlocksLabel} noUnlocksLabel={noUnlocksLabel} />
      {reached ? (
        <Face face={reached} kind="reached" visible={showing === "reached"} unlocksLabel={unlocksLabel} noUnlocksLabel={noUnlocksLabel} />
      ) : null}
    </div>
  );
}
