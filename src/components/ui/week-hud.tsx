import type { ReactNode } from "react";
import type { WeekHudFigure, WeekHudProps } from "@/components/ui";
import { ArrowIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { ProgressBar } from "@/components/ui/progress-bar";

// scoring's file — REQ-UIX-057, REQ-UIX-055, DEC-206 §4.47 – §4.49, DEC-207 W4.
//
// The member's week on the phone (`SCR-010`, `docs/design/screens/m10a/Home.dc.html`):
// three figures in a row — the rank, the streak, the points — and under them the way
// to the next level. It renders every state from props and reads nothing: no data,
// no catalogue, no clock. The screen composes the words.
//
// ★ A MISSING RANK AND A DISABLED STREAK ARE ABSENCES, NEVER ZEROS. An unranked
// member's tile says why in words; an org with no streak rule has no streak tile at
// all, and the row is two tiles. The type has no place for a zero rank.
//
// ★ Its own tiles, not `stat` (DEC-207 W4): a tile is borderless on the raised
// surface, its figure in the display face and toned — the rank in the accent, the
// streak in the signal, the points in the heading ink — and a figure is a NODE, so
// the screen can hand in a counting one (moment 3). `stat` takes a string.
//
// ★ It moves nothing. Moments 3 and 5 are the screen's (`components/scoring/`),
// which find what to move by `data-slot`: `rank`, `rise`, `points`, `delta`, and
// `level-bar` around the bar's own `fill`. The rise arrow is shown and never moves
// (DEC-197 §2). Nothing transitions; nothing scales on hover.
//
// Each figure is drawn for the eye and heard once, as `valueLabel`: the drawn
// figure is `aria-hidden`, so «#4» is never read as «number sign four».

type Tone = "accent" | "signal" | "heading";

const TONE: Record<Tone, string> = {
  accent: "text-accent pg-light:text-fg-heading",
  signal: "text-signal pg-light:text-signal-deep",
  heading: "text-fg-heading",
};

const TILE = "flex min-w-0 flex-1 flex-col gap-0.5 rounded-tile bg-raised px-3 py-2.5";

function isFigure(value: WeekHudFigure | { label: ReactNode; absent: string }): value is WeekHudFigure {
  return "value" in value;
}

function Tile({ href, slot, children }: { href?: string; slot: string; children: ReactNode }) {
  return href ? (
    <Link href={href} quiet data-slot={slot} className={`${TILE} text-fg-heading no-underline hover:bg-hover`}>
      {children}
    </Link>
  ) : (
    <div data-slot={slot} className={TILE}>
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-caption font-semibold text-fg-muted">{children}</span>;
}

function Figure({ figure, tone, after }: { figure: WeekHudFigure; tone: Tone; after?: ReactNode }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="sr-only">{figure.valueLabel}</span>
      <strong aria-hidden="true" data-slot="figure" className={`font-display text-play-md font-extrabold ${TONE[tone]}`}>
        <bdi dir="ltr">{figure.value}</bdi>
      </strong>
      {after}
    </span>
  );
}

function Absent({ text }: { text: string }) {
  return <span className="text-body font-bold leading-snug text-fg-body">{text}</span>;
}

export function WeekHud({ label, rank, streak, points, level, className = "" }: WeekHudProps) {
  const rise = isFigure(rank) && rank.movement ? rank.movement : null;

  return (
    <section aria-label={label} className={`flex flex-col gap-2.5 rounded-panel border border-edge bg-surface px-3.5 py-3 ${className}`}>
      <div className="flex items-stretch gap-2">
        <Tile href={rank.href} slot="rank">
          <Label>{rank.label}</Label>
          {isFigure(rank) ? (
            <Figure
              figure={rank}
              tone="accent"
              after={
                rise ? (
                  <span data-slot="rise" className="flex items-center text-accent pg-light:text-fg-heading">
                    <ArrowIcon direction="up" />
                    <span className="sr-only">{rise.riseLabel}</span>
                  </span>
                ) : null
              }
            />
          ) : (
            <Absent text={rank.absent} />
          )}
        </Tile>

        {streak ? (
          <Tile href={isFigure(streak) ? streak.href : undefined} slot="streak">
            <Label>{streak.label}</Label>
            {isFigure(streak) ? <Figure figure={streak} tone="signal" /> : <Absent text={streak.absent} />}
          </Tile>
        ) : null}

        <Tile href={points.href} slot="points">
          <Label>{points.label}</Label>
          <Figure
            figure={points}
            tone="heading"
            after={
              points.delta ? (
                <span data-slot="delta" className="font-display text-caption font-extrabold text-accent pg-light:text-fg-heading">
                  {/* ★ A signed figure reads left to right: «+20», never «20+». */}
                  <bdi aria-hidden="true" dir="ltr">
                    {points.delta}
                  </bdi>
                  {points.deltaLabel ? <span className="sr-only">{points.deltaLabel}</span> : null}
                </span>
              ) : null
            }
          />
        </Tile>
      </div>

      {level ? (
        <div className="flex items-center gap-2.5">
          {"value" in level ? (
            <span data-slot="level-bar" className="min-w-0 flex-1">
              {/* Decorative: the line beside it says the value, once. */}
              <ProgressBar value={level.value} max={level.max} fill="accent" decorative />
            </span>
          ) : null}
          <span className="text-caption text-fg-muted">{level.line}</span>
        </div>
      ) : null}
    </section>
  );
}
