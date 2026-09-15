import type { AvatarProps, AvatarStackProps } from "@/components/ui";

// content's file — `16` §6.8, DEC-099.
//
// ★ Initials are the DEFAULT and the PERMANENT fallback: `src` is a
// platform-stored path (never the Google hotlink DEC-099 retires), and a
// missing `src`, a `null` and a moderation takedown all fall back to the
// SAME glyph the same way — there is no silhouette placeholder anywhere in
// this file, and none should ever be added to it.
//
// The tint is a stable hash of the MEMBER ID, never the display name: a name
// changes when someone corrects their spelling, and the tint must not. The
// glyph is wrapped in `<bdi>` like every other interpolated value, and the
// tint never encodes role, company or status — it is decoration, not a
// signal. Nothing here scales on hover.
//
// The upload route, EXIF stripping, derivatives and the Google-import prompt
// are M10 (`content` + `scoring`, `16` §6.8.2) — this file only draws
// whatever `src`/`displayName` it is handed.

const TINTS = [
  "bg-navy-950 text-white",
  "bg-navy-800 text-white",
  "bg-navy-600 text-white",
  "bg-navy-200 text-navy-950",
  "bg-silver-300 text-navy-950",
  "bg-silver-400 text-navy-950",
] as const;

/**
 * A small stable string hash (djb2), exported so the contrast test can
 * assert every one of the six tints independently rather than relying on
 * whichever ids happen to hash where.
 */
export function tintIndex(memberId: string): number {
  let hash = 5381;
  for (let i = 0; i < memberId.length; i += 1) {
    hash = (hash * 33) ^ memberId.charCodeAt(i);
  }
  return Math.abs(hash) % TINTS.length;
}

const DIMENSION: Record<NonNullable<AvatarProps["size"]>, string> = {
  24: "h-6 w-6 text-[0.6875rem]",
  32: "h-8 w-8 text-[0.8125rem]",
  34: "h-[34px] w-[34px] text-[0.8125rem]",
  40: "h-10 w-10 text-[0.9375rem]",
  56: "h-14 w-14 text-[1.375rem]",
  96: "h-24 w-24 text-[2.25rem]",
  160: "h-40 w-40 text-[3.75rem]",
};

function initial(displayName: string | null): string {
  return displayName?.trim().charAt(0) || "؟"; // Arabic question mark: no name on record.
}

export function Avatar({ memberId, displayName, src, size = 40, decorative, className = "" }: AvatarProps) {
  const shared = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium ${DIMENSION[size]} ${className}`;
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img" as const, "aria-label": displayName ?? undefined };

  if (src) {
    return (
      <span className={shared} {...a11y}>
        {/* A platform-stored, already-derivative WebP — same reasoning as
            `CardMedia`, not `next/image`: nothing here changes size and the
            derivative pipeline (M10) already produces the right dimensions. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span className={`${shared} ${TINTS[tintIndex(memberId)]}`} {...a11y}>
      <bdi>{initial(displayName)}</bdi>
    </span>
  );
}

/** A row of overflow-capped avatars — presenter cards, browse cards (`16` §6.8.3). */
export function AvatarStack({ members, size = 24, max = 2, overflowLabel, className = "" }: AvatarStackProps) {
  const shown = members.slice(0, max);
  const overflow = members.length - shown.length;
  return (
    <span className={`inline-flex items-center ${className}`}>
      {/* Overlap via a logical negative `margin-inline-start` on every avatar
          but the first — not `space-x-*`, which is a physical margin
          utility CLAUDE.md's Tailwind note specifically bans pairing with
          `rtl:` for exactly this kind of stack. */}
      <span className="flex [&>*:not(:first-child)]:-ms-2">
        {shown.map((m) => (
          <span key={m.memberId} className="rounded-full ring-2 ring-surface">
            <Avatar memberId={m.memberId} displayName={m.displayName} src={m.src} size={size} decorative />
          </span>
        ))}
      </span>
      {overflow > 0 ? (
        <span className="ms-1.5 text-caption text-fg-muted">
          <bdi>{overflowLabel ? overflowLabel(overflow) : `+${overflow}`}</bdi>
        </span>
      ) : null}
    </span>
  );
}
