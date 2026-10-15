import type { CSSProperties } from "react";
import type { RankRowProps } from "@/components/ui";
import { Avatar, teamColorOrNull } from "@/components/ui/avatar";
import { ArrowIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";

// scoring's file — REQ-UIX-037, REQ-LDR-001, REQ-LDR-008, DEC-183 §3, DEC-186 §7.
//
// One member's row on a board: the rank in the display face, the picture in
// the team ring, the name over the company, a marker when the rank rose, and
// the points.
//
// ★★ A LEADERBOARD NEVER SHAMES. There is no «fell» state. The row compares
// `movement.previousRank` with `rank` and draws only a RISE; a fall, a tie and
// a new entry take the same path as no movement at all, so a fallen row is
// byte-identical to a neutral one — no colour, no icon, no motion.
// `rank-row.test.tsx` asserts exactly that.
//
// ★ DEC-287 (the owner, reversing DEC-099's leaderboard exclusion): the
// member's picture — `avatarHref()`'s answer, passed as `avatarSrc` — and the
// initials when there is none. The company is the ring, never the fill
// (REQ-PRF-009).
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

// ★ DEC-298 (the owner, reversing DEC-195 §4): a COMPANY's place on the company board draws the company's mark — its
// logo on a bone plate (a logo is drawn for a white page; the dark ground would swallow a dark one), framed in the
// team colour; without a logo, its initial on its colour. A rounded square, never a circle: a circle is a person.
// A member's avatar never shows it — the ring stays the ring (REQ-PRF-009).
const MARK_SIZE = { 32: "h-8 w-8 text-[0.8125rem] border-2", 64: "h-16 w-16 text-[1.625rem] border-4" } as const;

export function CompanyMark({ name, teamColor, logoSrc = null, size = 32 }: { name: string; teamColor: string | null | undefined; logoSrc?: string | null; size?: 32 | 64 }) {
  const colour = teamColorOrNull(teamColor);
  const style = colour ? ({ "--team": colour } as CSSProperties) : undefined;
  const frame = colour ? "border-team" : "border-team-neutral";
  const fill = logoSrc ? "bg-sticker-bone" : colour ? "bg-team text-on-team" : "bg-raised text-fg-heading";
  return (
    <span aria-hidden="true" data-slot="company-mark" className={`relative inline-flex shrink-0 items-center justify-center rounded-tile font-display font-extrabold ${MARK_SIZE[size]} ${frame} ${fill}`} style={style}>
      {/* The initial is always drawn under the image, as `Avatar` does: a logo that fails to load leaves it showing. */}
      <bdi>{name.trim().charAt(0) || "؟"}</bdi>
      {logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- our proxied copy at `/api/companies/{id}/logo`, drawn contained.
        <img src={logoSrc} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full rounded-[inherit] bg-sticker-bone object-contain p-[8%]" />
      ) : null}
    </span>
  );
}

export function RankRow({
  rank,
  rankLabel,
  memberId,
  displayName,
  company,
  teamColor,
  avatarSrc = null,
  kind = "member",
  logoSrc = null,
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

      {kind === "company" ? (
        <CompanyMark name={displayName} teamColor={teamColor} logoSrc={logoSrc} />
      ) : (
        <Avatar memberId={memberId} displayName={displayName} src={avatarSrc} size={32} decorative teamColor={teamColor} />
      )}

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
          {/* wave 20 (Board.dc.html): «أنت» as the accent pill — still a word, still beside the name. */}
          {self ? <span className="rounded-pill bg-accent px-2 text-caption font-bold text-on-accent pg-light:bg-fg-heading pg-light:text-canvas">{selfLabel}</span> : null}
        </span>
        {company ? (
          <span className="text-caption font-semibold text-fg-muted">
            <bdi>{company}</bdi>
          </span>
        ) : null}
      </span>

      {rose && movement ? (
        // `data-slot="rise"`: moment 5 reads it to know the row rose. The arrow is shown and never moves (DEC-197 §2).
        <span data-slot="rise" className="flex shrink-0 items-center text-accent pg-light:text-fg-heading">
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
