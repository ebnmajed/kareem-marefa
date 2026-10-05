import type { CSSProperties } from "react";
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

// ★ The lead's real-build finding: `bg-navy-600` and `bg-navy-200` are not
// tokens `globals.css` defines — only navy-1000/950/900/850/800 and
// silver-100…400 exist (`@theme`, `src/app/globals.css:12-22`). Both classes
// resolved to nothing, so a member with no `src` landed on either an
// invisible (transparent-background) or unreadable (dark-on-transparent)
// avatar. Same register as `card.tsx`'s `MEDIA_TINTS`, and exported for the
// same reason: `avatar.test.tsx` asserts every entry against the real
// `--color-*` custom properties instead of a hand-copied hex pair.
export const TINTS = [
  "bg-navy-950 text-white",
  "bg-navy-900 text-white",
  "bg-navy-800 text-white",
  "bg-silver-200 text-navy-950",
  "bg-silver-300 text-navy-950",
  "bg-silver-400 text-navy-950",
] as const;

// ★ Wave 15 — inside the playground's scope (DEC-183, DEC-186 §5, REQ-PRF-009).
// The SAME six slots, keyed by the SAME hash of the member id, take the
// playground's six dark tints with bone on each (9.4:1 or better). A member's
// slot never moves; only its value inside the scope. Added under `pg:`, after
// `TINTS`' own classes, so outside the scope nothing changes.
export const SCOPE_TINTS = [
  "pg:bg-tint-1 pg:text-on-tint",
  "pg:bg-tint-2 pg:text-on-tint",
  "pg:bg-tint-3 pg:text-on-tint",
  "pg:bg-tint-4 pg:text-on-tint",
  "pg:bg-tint-5 pg:text-on-tint",
  "pg:bg-tint-6 pg:text-on-tint",
] as const;

/**
 * The team colour, re-checked — REQ-UIX-043, DEC-186 §5. The database refuses
 * anything but `#rrggbb` (`0160`), and this is the second line: React writes a
 * server-rendered custom property as it is given, so a `;` in the value would
 * end the declaration and start another. Anything that is not exactly a
 * six-digit colour is treated as no colour — the neutral ring.
 */
export function teamColorOrNull(value: string | null | undefined): string | null {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

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

// ★ Wave 19, add-only (DEC-214 §4, `scoring`'s R1): 44 for the directory's rows, 84 for the profile's header on the
// phone, 104 on desktop (`Directory.dc.html:38`, `Profile.dc.html:27`, `ProfileDesktop.dc.html:40`). The union in
// `ui/index.ts` is the lead's; until it gains the three, the widened type lives here and callers import it by path.
export type AvatarSize = NonNullable<AvatarProps["size"]> | 44 | 84 | 104;
export type AvatarSizedProps = Omit<AvatarProps, "size"> & { size?: AvatarSize };

const DIMENSION: Record<AvatarSize, string> = {
  24: "h-6 w-6 text-[0.6875rem]",
  32: "h-8 w-8 text-[0.8125rem]",
  34: "h-[34px] w-[34px] text-[0.8125rem]",
  40: "h-10 w-10 text-[0.9375rem]",
  44: "h-11 w-11 text-[1rem]",
  56: "h-14 w-14 text-[1.375rem]",
  // ★ Wave 20, add-only (`scoring`'s request): the hub standing card's avatar, 64 px with a 4 px ring (`Me.dc.html`).
  64: "h-16 w-16 text-[1.625rem]",
  84: "h-[84px] w-[84px] text-[2rem]",
  96: "h-24 w-24 text-[2.25rem]",
  104: "h-[104px] w-[104px] text-[2.5rem]",
  160: "h-40 w-40 text-[3.75rem]",
};

// The ring grows with the large avatars as drawn — 5 px at 84, 6 px at 104 — and stays 3 px everywhere else, so
// no existing caller moves. Literal strings, so Tailwind sees every class.
function ringWidth(size: AvatarSize): string {
  if (size === 104) return "border-[6px]";
  if (size === 84) return "border-[5px]";
  if (size === 64) return "border-4";
  return "border-[3px]";
}

function initial(displayName: string | null): string {
  return displayName?.trim().charAt(0) || "؟"; // Arabic question mark: no name on record.
}

// ★ `rounded-field` (6 px), not a circle — the canvas's own avatar shape
// (`Main`'s presenter cards, `Shell`'s account menu), the lead's ruling
// (DEC-110's "match the mockups"). Was `rounded-full` through M9; carried
// into `AvatarStack`'s own ring below so the ring traces the same shape.
//
// ★ Wave 15: a CIRCLE inside the playground's scope (`pg:rounded-pill`), as
// `04-components.md` and both prototypes draw it; outside, the 6 px corner.
//
// ★ The team ring (REQ-UIX-043, contract 3, DEC-186 §5). `teamColor` has THREE
// values: `undefined` draws no ring — every caller before wave 15, so nothing
// moves — `null` the neutral ring of a company with no colour, and a colour the
// team's ring. It is a BORDER, not a box-shadow: the box keeps its size, so a
// row never reflows, and the image (`inset-0`) sits inside the padding box and
// leaves the ring showing. The colour reaches the element as `--team`, the one
// place a value from data becomes a style. The neutral ring names its own token
// rather than reading `--team`, because `--team` inherits: an avatar with no
// colour inside a team-coloured poster must not wear the poster's team. The
// ring never touches the fill — the tint stays the member's (REQ-PRF-009).
function ring(teamColor: string | null | undefined, size: AvatarSize): { className: string; style?: CSSProperties } {
  if (teamColor === undefined) return { className: "" };
  const colour = teamColorOrNull(teamColor);
  if (colour === null) return { className: `${ringWidth(size)} border-team-neutral` };
  return { className: `${ringWidth(size)} border-team`, style: { "--team": colour } as CSSProperties };
}

export function Avatar({ memberId, displayName, src, size = 40, decorative, teamColor, className = "" }: AvatarSizedProps) {
  const team = ring(teamColor, size);
  const shared = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-field font-medium ${DIMENSION[size]} pg:rounded-pill ${team.className} ${className}`;
  const a11y = decorative ? { "aria-hidden": true as const } : { role: "img" as const, "aria-label": displayName ?? undefined };

  // ★ The initials are ALWAYS drawn, and the image is laid over them (DEC-182,
  // `platform`'s R1). An `<img>` whose request fails — an expired version, a
  // takedown between render and fetch, a 404 from `/api/avatars/…` — paints
  // nothing at `alt=""`, so the glyph underneath shows through. CSS only: no
  // `onError`, so this stays a Server Component and needs no hydration.
  return (
    <span className={`relative ${shared} ${TINTS[tintIndex(memberId)]} ${SCOPE_TINTS[tintIndex(memberId)]}`} style={team.style} {...a11y}>
      <bdi>{initial(displayName)}</bdi>
      {src ? (
        // A platform-stored, already-derivative WebP — same reasoning as
        // `CardMedia`, not `next/image`: nothing here changes size and the
        // derivative pipeline already produces the right dimensions.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
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
          // No team ring on a stack this wave (DEC-186 §5); a circle inside the scope, like the avatar.
          <span key={m.memberId} className="rounded-field ring-2 ring-surface pg:rounded-pill">
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
