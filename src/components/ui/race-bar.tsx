import type { CSSProperties } from "react";
import type { RaceBarProps } from "@/components/ui";
import { teamColorOrNull } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress-bar";

// scoring's file — REQ-UIX-038, REQ-LDR-004, REQ-LDR-005, DEC-183, DEC-186 §7.
//
// One company in the race: the team ring, the company's name, the bar and the
// value of the metric the org ranks by.
//
// ★ THE COLOUR IS NEVER THE ONLY THING THAT SAYS WHICH COMPANY IT IS. The name
// is always drawn, in text, beside the ring; the ring and the fill repeat the
// colour and never replace the name. A company with no colour is named by its
// name alone, on the neutral ring.
//
// ★ THE RANKING METRIC IS MARKED (REQ-LDR-005): `metricLabel` is visible on
// every bar, under the value. `secondary` carries the other metric, quieter —
// REQ-LDR-004 keeps both on SCR-028.
//
// The bar is `content`'s `progress-bar`, DECORATIVE: the value is already text
// beside it, and a second `progressbar` would read the number twice. It grows
// from the inline start, and a negative, NaN or missing `fraction` draws an
// empty track — a company's total can be below zero (`company-board.tsx:56`),
// and the signed number says so.
//
// The team colour reaches the DOM only as `--team` on the element that draws
// it, re-checked by `teamColorOrNull` (contract 3). Nothing here transitions
// (DEC-186 §4). On the light ground the accent outline takes the heading ink
// (DEC-186 §2).

export function RaceBar({ companyName, teamColor, value, metricLabel, fraction, rank, rankLabel, secondary, ownLabel, className = "" }: RaceBarProps) {
  const own = Boolean(ownLabel);
  const colour = teamColorOrNull(teamColor);
  const ring = colour ? "border-team" : "border-team-neutral";
  const ringStyle = colour ? ({ "--team": colour } as CSSProperties) : undefined;
  const frame = own ? "border-accent pg-light:border-fg-heading" : "border-transparent";

  return (
    <li className={`flex flex-col gap-1 rounded-tile border-2 px-2 py-2 ${frame} ${className}`}>
      <div className="flex items-center gap-2">
        {rank != null ? (
          <span className="w-6 shrink-0 text-center font-display font-extrabold text-fg-muted">
            <span className="sr-only">{rankLabel}</span>
            <bdi aria-hidden="true">{String(rank)}</bdi>
          </span>
        ) : null}
        <span aria-hidden="true" data-slot="ring" style={ringStyle} className={`size-5 shrink-0 rounded-pill border-[3px] bg-canvas ${ring}`} />
        <span className="flex w-24 shrink-0 flex-col">
          <span className="text-body font-bold leading-snug text-fg-heading">
            <bdi>{companyName}</bdi>
          </span>
          {own ? <span className="text-caption font-semibold text-fg-body">{ownLabel}</span> : null}
        </span>
        <ProgressBar value={fraction} max={1} fill="team" teamColor={colour} decorative className="min-w-12 flex-1" />
        <span className="flex shrink-0 flex-col items-end">
          <span className="font-display text-play-sm font-extrabold text-fg-heading">
            <bdi dir="ltr">{value}</bdi>
          </span>
          <span className="text-caption font-semibold text-fg-muted">{metricLabel}</span>
        </span>
      </div>
      {secondary ? (
        <p className="flex flex-wrap items-baseline gap-x-1.5 ps-7 text-caption text-fg-muted">
          <span>{secondary.label}</span>
          <bdi dir="ltr">{secondary.value}</bdi>
        </p>
      ) : null}
    </li>
  );
}
