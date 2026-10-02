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

export function RaceBar({ companyName, teamColor, value, metricLabel, fraction, rank, rankLabel, secondary, ownLabel, note = null, layout = "stacked", className = "" }: RaceBarProps) {
  const own = Boolean(ownLabel);
  const colour = teamColorOrNull(teamColor);
  const ring = colour ? "border-team" : "border-team-neutral";
  const ringStyle = colour ? ({ "--team": colour } as CSSProperties) : undefined;
  const frame = own ? "border-accent pg-light:border-fg-heading" : "border-transparent";

  // ★ wave 18 (DEC-207 W3, add-only): ONE line — the ring, the name, the bar, the value — as the home's race draws it
  // (`SCR-010`). The metric is still said on every row, to a screen reader, beside the value (REQ-LDR-005); the card
  // that holds the rows shows it once, visibly. The rank, when given, is heard and not drawn: the order is the rank.
  if (layout === "inline") {
    return (
      <li className={`flex items-center gap-2 rounded-tile border-2 px-2 py-1.5 ${frame} ${className}`}>
        {rank != null ? <span className="sr-only">{rankLabel}</span> : null}
        <span aria-hidden="true" data-slot="ring" style={ringStyle} className={`size-5 shrink-0 rounded-pill border-[3px] bg-canvas ${ring}`} />
        {/* The name and «فريقك» run on as one line, as the artboard sets «صنف، فريقك»; a long name may still wrap. */}
        <span className="min-w-0 max-w-[45%] shrink-0 text-caption leading-snug">
          <bdi className="font-bold text-fg-heading">{companyName}</bdi>
          {own ? <span className="ms-1.5 font-semibold text-fg-body">{ownLabel}</span> : null}
        </span>
        <ProgressBar value={fraction} max={1} fill="team" teamColor={colour} decorative className="min-w-0 flex-1" />
        <span className="shrink-0 font-display font-extrabold text-fg-heading">
          <bdi dir="ltr">{value}</bdi>
          <span className="sr-only">{metricLabel}</span>
          {secondary ? (
            <span className="sr-only">
              {secondary.label} <bdi dir="ltr">{secondary.value}</bdi>
            </span>
          ) : null}
        </span>
      </li>
    );
  }

  // ★ wave 20, PR B (DEC-218 §3.3, add-only): `grid` is `Companies.dc.html`'s row — the rank; the ring, the name and
  // «فريقك» with the bar under the name, growing from the inline-start; the ranking metric's value in the display face;
  // the other metric, quieter. The two metrics' names are said on every row to a screen reader (REQ-LDR-004, -005)
  // and shown once, visibly, by the table's own header — the caller's.
  if (layout === "grid") {
    return (
      <li className={`grid grid-cols-[1.75rem_minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-tile border-2 bg-surface px-3 py-2.5 ${own ? frame : "border-edge"} ${className}`}>
        <span className="text-center font-display text-play-sm font-extrabold text-fg-muted">
          {rank != null ? (
            <>
              <span className="sr-only">{rankLabel}</span>
              <bdi aria-hidden="true">{String(rank)}</bdi>
            </>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body font-bold leading-snug text-fg-heading">
            <span aria-hidden="true" data-slot="ring" style={ringStyle} className={`size-5 shrink-0 rounded-pill border-[3px] bg-canvas ${ring}`} />
            <bdi>{companyName}</bdi>
            {own ? <span className="rounded-pill bg-accent px-2 text-caption font-bold text-on-accent pg-light:bg-fg-heading pg-light:text-canvas">{ownLabel}</span> : null}
            {note ? <span className="text-caption font-semibold text-fg-muted">{note}</span> : null}
          </span>
          <ProgressBar value={fraction} max={1} fill="team" teamColor={colour} decorative />
        </span>
        <span className="font-display text-play-sm font-extrabold text-fg-heading">
          <bdi dir="ltr">{value}</bdi>
          <span className="sr-only">{metricLabel}</span>
        </span>
        <span className="text-body-sm text-fg-muted">
          {secondary ? (
            <>
              <bdi dir="ltr">{secondary.value}</bdi>
              <span className="sr-only">{secondary.label}</span>
            </>
          ) : null}
        </span>
      </li>
    );
  }

  // Three lines, so the row fits the box it is given — 326 px in the gallery at
  // 390, less inside a card: the ring, the name and the number; the bar across
  // the whole row; then the metric and the other one. Nothing on the first line
  // is fixed-width but the rank and the ring, so the name wraps and the number
  // stays whole.
  return (
    <li className={`flex flex-col gap-1.5 rounded-tile border-2 px-2 py-2 ${frame} ${className}`}>
      <div className="flex items-center gap-2">
        {rank != null ? (
          <span className="w-6 shrink-0 text-center font-display font-extrabold text-fg-muted">
            <span className="sr-only">{rankLabel}</span>
            <bdi aria-hidden="true">{String(rank)}</bdi>
          </span>
        ) : null}
        <span aria-hidden="true" data-slot="ring" style={ringStyle} className={`size-5 shrink-0 rounded-pill border-[3px] bg-canvas ${ring}`} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body font-bold leading-snug text-fg-heading">
            <bdi>{companyName}</bdi>
          </span>
          {own ? <span className="text-caption font-semibold text-fg-body">{ownLabel}</span> : null}
        </span>
        <span className="shrink-0 font-display text-play-sm font-extrabold text-fg-heading">
          <bdi dir="ltr">{value}</bdi>
        </span>
      </div>
      <ProgressBar value={fraction} max={1} fill="team" teamColor={colour} decorative />
      <p className="flex flex-wrap items-baseline gap-x-3 text-caption">
        <span className="font-semibold text-fg-muted">{metricLabel}</span>
        {secondary ? (
          <span className="flex flex-wrap items-baseline gap-x-1.5 text-fg-muted">
            <span>{secondary.label}</span>
            <bdi dir="ltr">{secondary.value}</bdi>
          </span>
        ) : null}
      </p>
    </li>
  );
}
