import type { PodiumPlace, PodiumProps } from "@/components/ui";
import { Avatar } from "@/components/ui/avatar";
import { Link } from "@/components/ui/link";
import { CupObject } from "@/components/ui/objects/cup";
import { RankRow } from "@/components/ui/rank-row";

// scoring's file — REQ-UIX-081, REQ-UIX-078, REQ-LDR-001, DEC-216 §5.10, DEC-218 §3.4, §3.7.
//
// The first three of a board (`SCR-027`, `docs/design/screens/m10c/Board.dc.html`): three avatars on three blocks,
// drawn second · first · third from the inline-start, the cup over the first. It reads nothing and formats nothing.
//
// ★ STATIC (DEC-216 §5.10): no keyframe, no transition, no hover scale. Moment 5 plays on the board's rank card and
// its rows (DEC-218 §3.4), never here.
//
// ★ DOM ORDER IS RANK ORDER. A screen reader and a keyboard meet first, second, third; only the eye sees 2 · 1 · 3,
// through CSS `order`. A block's HEIGHT follows its position; the NUMBER on it is the place's own rank, so a tie
// draws two «1»s without lying about either.
//
// ★ INITIALS, NEVER A PHOTOGRAPH — like `rank-row` there is no `src` (DEC-183 §3, DEC-099). The company is the ring,
// never the fill (REQ-PRF-009). The viewer's own place is outlined AND says «أنت» in words.
//
// ★ It collapses to the same places as `rank-row`s (REQ-UIX-081) where three columns do not fit — below a 21rem
// container, which three blocks need, not `sm` (the 390 px board draws the podium, DEC-218) — and under reduced
// motion, as the requirement says. Both are CSS; only one of the two is displayed, so nothing is heard twice.
//
// The blocks are `--color-podium-{1,2,3}` (DEC-218 §3.7) with `on-level` ink — the same ink the level ramp's
// blocks use, so the figures meet contrast on every block in both grounds.

const POSITION = [
  { order: "order-2", block: "h-24 bg-podium-1", figure: "text-play-md" },
  { order: "order-1", block: "h-18 bg-podium-2", figure: "text-play-sm" },
  { order: "order-3", block: "h-14 bg-podium-3", figure: "text-play-sm" },
] as const;

function Place({ place, position }: { place: PodiumPlace; position: number }) {
  const look = POSITION[position];
  const self = Boolean(place.selfLabel);
  const name = <bdi>{place.displayName}</bdi>;
  return (
    <li className={`relative flex w-26 min-w-0 flex-col items-center gap-1.5 ${look.order}`}>
      {position === 0 ? <CupObject size={36} shadow={false} /> : null}
      <Avatar memberId={place.memberId} displayName={place.displayName} size={56} decorative teamColor={place.teamColor} />
      <span className="flex max-w-full flex-col items-center text-center">
        <span className="text-body-sm font-bold text-fg-heading">
          {place.href ? (
            // The whole column is the target, not only the name.
            <Link href={place.href} quiet className="underline-offset-4 after:absolute after:inset-0 hover:underline">
              {name}
            </Link>
          ) : (
            name
          )}
        </span>
        {self ? <span className="text-caption font-semibold text-fg-body">{place.selfLabel}</span> : null}
        {place.company ? (
          <span className="text-caption font-semibold text-fg-muted">
            <bdi>{place.company}</bdi>
          </span>
        ) : null}
      </span>
      <span
        data-slot="block"
        className={`flex w-full flex-col items-center justify-center rounded-t-tile text-on-level ${look.block} ${self ? "outline-2 outline-offset-2 outline-accent pg-light:outline-fg-heading" : ""}`}
      >
        <span className={`font-display font-extrabold ${look.figure}`}>
          <span className="sr-only">{place.rankLabel}</span>
          <bdi aria-hidden="true">{String(place.rank)}</bdi>
        </span>
        <span className="text-caption font-bold">
          <span className="sr-only">{place.pointsLabel}</span>
          <bdi aria-hidden="true">{place.points}</bdi>
        </span>
      </span>
    </li>
  );
}

export function Podium({ label, places, className = "" }: PodiumProps) {
  const shown = places.slice(0, 3);
  if (shown.length === 0) return null;

  return (
    <div role="group" aria-label={label} data-places={shown.length} className={`@container ${className}`}>
      <ul data-slot="podium" className="hidden items-end justify-center gap-2 motion-safe:@min-[21rem]:flex">
        {shown.map((place, i) => (
          <Place key={place.memberId} place={place} position={i} />
        ))}
      </ul>
      <ul data-slot="rows" className="flex flex-col gap-2 motion-safe:@min-[21rem]:hidden">
        {shown.map((place) => (
          <RankRow
            key={place.memberId}
            rank={place.rank}
            rankLabel={place.rankLabel}
            memberId={place.memberId}
            displayName={place.displayName}
            company={place.company}
            teamColor={place.teamColor}
            points={place.points}
            pointsLabel={place.pointsLabel}
            selfLabel={place.selfLabel ?? null}
            href={place.href}
          />
        ))}
      </ul>
    </div>
  );
}
