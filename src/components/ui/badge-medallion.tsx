import type { BadgeMedallionProps, MedallionFill } from "@/components/ui";

// scoring's file — REQ-UIX-064, DEC-213 §5.126, DEC-214 §4.
//
// A badge's disc with its 4 px drop, and the badge's name under it — the shelf on
// a profile (`Profile.dc.html:52-61`, `ProfileDesktop.dc.html:67-76`) and the
// level's medallion beside its name (`:38-41`, `:48`).
//
// ★ THE FILL IS THE BADGE'S, never a company's (that is `--team`) and never a
// status's (DEC-073). It comes from the stickers' allowed set BY NAME, or from the
// level ramp keyed on `levels.sort_order` — never on a name an org may change.
//
// ★ THE DROP IS `color-mix()` OF THE DISC'S OWN FILL WITH THE GROUND it sits on
// (DEC-214 §4): one rule, no token per fill. The fill is set once, as
// `--medallion`, and both the disc and its drop read it.
//
// ★ STATIC. No hover scale (DEC-183 §2), no transition, no keyframe of its own
// (REQ-UIX-020). Reads no data and no catalogue; every string is a prop.
//
// The glyph is decorative: the name is what is read. With `showName={false}` the
// block stands beside a name the caller already draws, so the whole of it is
// hidden from assistive technology rather than read twice.

// Literal strings, so Tailwind sees every class.
const FILL: Record<MedallionFill, string> = {
  accent: "[--medallion:var(--color-sticker-accent)]",
  signal: "[--medallion:var(--color-sticker-signal)]",
  cyan: "[--medallion:var(--color-sticker-cyan)]",
  gold: "[--medallion:var(--color-sticker-gold)]",
  violet: "[--medallion:var(--color-sticker-violet)]",
  bone: "[--medallion:var(--color-sticker-bone)]",
};

const LEVEL = [
  "[--medallion:var(--color-level-1)]",
  "[--medallion:var(--color-level-2)]",
  "[--medallion:var(--color-level-3)]",
  "[--medallion:var(--color-level-4)]",
  "[--medallion:var(--color-level-5)]",
] as const;

const DISC = {
  md: "size-16 [&>svg]:size-[30px]",
  sm: "size-13 [&>svg]:size-6",
} as const;

const NAME = {
  md: "w-[76px] text-caption",
  sm: "w-16 text-caption",
} as const;

/** `levels.sort_order` → a ramp stop, clamped to 1–5 — the same rule as `level-card`'s `rampStop`, written here so
 *  `level-card`'s standing layout can compose this file without a cycle. */
function rampStop(tier: number): 1 | 2 | 3 | 4 | 5 {
  const t = Number.isFinite(tier) ? Math.round(tier) : 1;
  return Math.min(5, Math.max(1, t)) as 1 | 2 | 3 | 4 | 5;
}

/** The fill's class — exported for its test. */
export function medallionFill(fill: BadgeMedallionProps["fill"]): string {
  return typeof fill === "string" ? FILL[fill] : LEVEL[rampStop(fill.level) - 1];
}

export function BadgeMedallion({ name, fill, glyph, size = "md", showName = true, description, className = "" }: BadgeMedallionProps) {
  return (
    <span
      data-slot="badge-medallion"
      aria-hidden={showName ? undefined : true}
      className={`inline-flex shrink-0 flex-col items-center gap-1.5 ${medallionFill(fill)} ${className}`}
    >
      <span
        data-slot="disc"
        aria-hidden="true"
        className={`inline-flex items-center justify-center rounded-pill bg-[var(--medallion)] text-on-sticker shadow-[0_4px_0_color-mix(in_oklab,var(--medallion)_62%,var(--bg))] ${DISC[size]}`}
      >
        {glyph}
      </span>
      {showName ? (
        <span className={`text-center font-bold leading-tight text-fg-heading ${NAME[size]}`}>
          <bdi>{name}</bdi>
          {description ? (
            <span className="sr-only">
              {" — "}
              <bdi>{description}</bdi>
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
