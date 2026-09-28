import type { RankRowProps } from "@/components/ui";
import { Avatar } from "@/components/ui/avatar";
import { ArrowIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";

// scoring's file — REQ-UIX-037, REQ-LDR-001, REQ-LDR-008, DEC-183 §3, DEC-186 §7.
//
// One member's row on a board: the rank in the display face, the initials in
// the team ring, the name over the company, a marker when the rank rose, and
// the points.
//
// ★★ A LEADERBOARD NEVER SHAMES. There is no «fell» state. The row compares
// `movement.previousRank` with `rank` and draws only a RISE; a fall, a tie and
// a new entry take the same path as no movement at all, so a fallen row is
// byte-identical to a neutral one — no colour, no icon, no motion.
// `rank-row.test.tsx` asserts exactly that.
//
// ★ INITIALS, NEVER A PHOTOGRAPH (DEC-183 §3, DEC-099): there is no `src` in
// the props, and `avatar` is drawn without one. The company is the ring, never
// the fill (REQ-PRF-009).
//
// ★ The viewer's own row is outlined AND carries a word — the name stays, and
// `selfLabel` («أنت») is visible text beside it.
//
// An opted-out member is absent for others (REQ-LDR-008): the DAL's answer.
// This draws what it is given. Nothing here transitions (DEC-186 §4).
//
// On the light ground the accent is 1.07:1 on paper (DEC-186 §2), so the rise
// marker and the self outline take the heading ink there — `pg-light:` — and
// stay a shape that meets 3:1 (SC 1.4.11).

export function RankRow({
  rank,
  rankLabel,
  memberId,
  displayName,
  company,
  teamColor,
  points,
  pointsLabel,
  selfLabel,
  movement,
  href,
  className = "",
}: RankRowProps) {
  const self = Boolean(selfLabel);
  // The only comparison in the file. NaN, a tie and a fall are all `false`.
  const rose = movement != null && movement.previousRank > rank;

  const frame = self ? "border-2 border-accent pg-light:border-fg-heading" : "border border-edge";
  const name = <bdi>{displayName}</bdi>;

  return (
    <li className={`relative flex min-h-14 items-center gap-3 rounded-tile bg-surface px-3 py-2 ${frame} ${className}`}>
      <span className="w-8 shrink-0 text-center font-display text-play-sm font-extrabold text-fg-muted">
        <span className="sr-only">{rankLabel}</span>
        <bdi aria-hidden="true">{String(rank)}</bdi>
      </span>

      <Avatar memberId={memberId} displayName={displayName} size={32} decorative teamColor={teamColor} />

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-x-2 text-body font-bold text-fg-heading">
          {href ? (
            // The whole row is the target (≥ 44 px), not only the name.
            <Link href={href} quiet className="underline-offset-4 after:absolute after:inset-0 hover:underline">
              {name}
            </Link>
          ) : (
            name
          )}
          {self ? <span className="text-caption font-semibold text-fg-body">{selfLabel}</span> : null}
        </span>
        {company ? (
          <span className="text-caption font-semibold text-fg-muted">
            <bdi>{company}</bdi>
          </span>
        ) : null}
      </span>

      {rose && movement ? (
        <span className="flex shrink-0 items-center text-accent pg-light:text-fg-heading">
          <ArrowIcon direction="up" />
          <span className="sr-only">{movement.riseLabel}</span>
        </span>
      ) : null}

      <span className="shrink-0 font-display text-play-sm font-extrabold text-fg-heading">
        <span className="sr-only">{pointsLabel}</span>
        <bdi aria-hidden="true">{points}</bdi>
      </span>
    </li>
  );
}
