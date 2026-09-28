import type { CSSProperties } from "react";
import type { ProgressBarProps } from "@/components/ui";
import { teamColorOrNull } from "@/components/ui/avatar";

// content's file — REQ-UIX-036, DEC-183, DEC-186 §5. One track and one fill,
// for a level (SCR-022), a company's race (SCR-028) and a story's segment
// (SCR-010). It renders every state from props and reads nothing.
//
// ★ THE FILL GROWS BY TRANSFORM, NEVER BY WIDTH. The fill is always the track's
// full width and is scaled to the value, so a later wave can move it on the
// compositor (REQ-UIX-020). It is STATIC this wave: no transition, nothing
// orchestrated (DEC-186 §4) — the race bar's move is the moments' wave's.
//
// ★ `progress.tsx` is NOT this file's fill. It sizes by `width`, two of its
// assertions pin that, and scaling a rounded fill changes pixels on the screens
// that use it. The two overlap on purpose, for a while: `Progress`'s determinate
// mode retires when its three consumers adopt this bar, in the screens waves.
//
// ★ `transform-origin` has no logical keyword, so the inline start is written as
// the two direction variants — never a bare physical utility, which would win
// in both directions. The one physical property in this file, and it follows
// the reading direction exactly as `.scroll-progress` in `globals.css` does.
//
// The track clips the fill and the fill carries no radius of its own, so the
// leading edge is square rather than a squashed ellipse at a partial value.

const FILL: Record<NonNullable<ProgressBarProps["fill"]>, string> = {
  accent: "bg-accent",
  signal: "bg-signal",
  team: "bg-team",
  text: "bg-fg-heading",
};

const HEIGHT: Record<NonNullable<ProgressBarProps["size"]>, string> = {
  sm: "h-[3px]",
  md: "h-2.5",
};

/** The value as a share of `max`, in [0, 1]. A negative, missing or NaN value draws an empty track. */
export function progressRatio(value: number, max = 100): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

export function ProgressBar({ value, max = 100, label, valueText, fill = "accent", teamColor, size = "md", decorative, className = "" }: ProgressBarProps) {
  // The type leaves `label` optional because a decorative bar has none. A bar a
  // screen reader meets must be named; there is no quiet fallback to invent one.
  if (!decorative && !label) throw new Error("ProgressBar needs a `label` unless it is `decorative`.");

  const ratio = progressRatio(value, max);
  // A team fill reads `--team` from THIS element — never an ancestor's — so a
  // company with no colour (or a malformed one) takes the neutral fill.
  const colour = fill === "team" ? teamColorOrNull(teamColor) : null;
  const fillClass = fill === "team" && colour === null ? "bg-team-neutral" : FILL[fill];
  const style = colour ? ({ "--team": colour } as CSSProperties) : undefined;

  const a11y = decorative
    ? { "aria-hidden": true as const }
    : {
        role: "progressbar" as const,
        "aria-label": label,
        "aria-valuenow": Math.min(max, Math.max(0, Number.isFinite(value) ? value : 0)),
        "aria-valuemin": 0,
        "aria-valuemax": max,
        "aria-valuetext": valueText,
      };

  return (
    <div {...a11y} style={style} className={`w-full overflow-hidden rounded-pill bg-raised ${HEIGHT[size]} ${className}`}>
      <div
        data-slot="fill"
        className={`h-full w-full ltr:origin-left rtl:origin-right ${fillClass}`}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}
