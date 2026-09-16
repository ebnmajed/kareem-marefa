"use client";

import type { MouseEvent } from "react";
import { Link } from "@/components/ui/link";
import type { CardActionsProps, CardBodyProps, CardDensity, CardMediaProps, CardProps } from "@/components/ui";

// content's file — `16` §6.4. ONE component, four densities: `grid`
// (browse), `row` (lists, `/app/me`, admin), `compact` (rails, related
// sessions), `wide` (the home hero rail).
//
// ★ "The whole card is one link with the bookmark as a NESTED button" is
// `16` §6.4's own wording, repeated in `.claude/agents/content.md` and the
// lead's task message — three independent sources, not a paraphrase. `Card`
// wraps `CardMedia` + `CardBody` + `CardActions` (composed by the caller as
// `children`) in one `<Link>` when `href` is given; `CardActions` stops
// propagation on every click inside it, so a caller-supplied interactive
// (a bookmark toggle — not built here, `search/bookmark-button.tsx` is) never
// double-fires the card's own navigation. REQ-NFR-007 puts the accessible
// name on that nested control; this file only owns the stopped propagation.
//
// ★ This is real DOM nesting of an interactive inside an interactive, which
// axe-core's `nested-interactive` rule (best-practice, on by default) flags.
// `card.test.tsx` disables exactly that rule, with the same citation, and
// proves the concern it stands in for does not apply: the nested control
// stays independently reachable by Tab and a click on it never navigates.
//
// Hover raises the card by `--shadow-raise` and never scales — the
// UI-library default the brief bans by name (`16` §3).
export function Card({ density = "grid", href, children, className = "" }: CardProps) {
  const row = density !== "grid";
  const inner = (
    <div
      data-density={density}
      className={rowClass(row, density)}
    >
      {children}
    </div>
  );
  return (
    <article
      className={`group relative overflow-hidden rounded-card border border-edge bg-surface shadow-card transition-shadow duration-150 hover:shadow-raise ${className}`}
    >
      {href ? (
        // ★ `quiet` (R-C4, `sessions`' request): the whole card is the
        // link (`16` §6.4), so `ui/link`'s own inline pending dot would be
        // noise on every hovered card — exactly the case its own header
        // names. The store `RouteProgress` reads still counts the
        // navigation either way.
        <Link
          href={href}
          quiet
          className="block h-full rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          {inner}
        </Link>
      ) : (
        inner
      )}
    </article>
  );
}

function rowClass(row: boolean, density: CardDensity): string {
  const base = "flex min-w-0";
  if (!row) return `${base} flex-col`;
  // Direction-safe: flexbox's "row" axis already follows the document's own
  // `dir`, so this is not a physical `left`/`right` utility.
  const widths: Record<Exclude<CardDensity, "grid">, string> = {
    row: "[&>[data-slot=media]]:w-28 sm:[&>[data-slot=media]]:w-36",
    compact: "[&>[data-slot=media]]:w-20",
    wide: "[&>[data-slot=media]]:w-2/5",
  };
  return `${base} flex-row items-stretch ${widths[density as Exclude<CardDensity, "grid">]}`;
}

const ASPECT: Record<NonNullable<CardMediaProps["aspect"]>, string> = {
  "4/5": "aspect-[4/5]",
  "16/9": "aspect-[16/9]",
  "1/1": "aspect-square",
};

// Six navy/silver tints, same register as `avatar.tsx` — but hashed from the
// TITLE, not an id: `CardMediaProps` carries no id, and unlike a member's
// display name a session/material title is the entity's own identity, not a
// spelling that gets corrected later. This is a narrower, separate rule from
// avatar's id-hash and must not be generalised back onto it.
//
// ★ The lead's real-build finding: `bg-navy-600` and `bg-navy-200` are not
// tokens `globals.css` defines — only navy-1000/950/900/850/800 and
// silver-100…400 exist (`@theme`, `src/app/globals.css:12-22`) — so those two
// classes resolved to nothing and the placeholder either went invisible
// (navy-600, transparent background) or rendered dark text on a transparent
// background (navy-200). Exported so `card.test.tsx` can assert every entry
// resolves to a real `--color-*` custom property directly, instead of a
// hand-copied hex pair that can drift from `globals.css` the way this one did.
export const MEDIA_TINTS = [
  "bg-navy-950 text-white",
  "bg-navy-900 text-white",
  "bg-navy-800 text-white",
  "bg-silver-200 text-navy-950",
  "bg-silver-300 text-navy-950",
  "bg-silver-400 text-navy-950",
] as const;

function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return Math.abs(hash);
}

// R7 (`sessions`, `/s/[id]`'s own dark background): `placeholderTone="dark"`
// restricts the pick to `MEDIA_TINTS`' three navy entries — the first three
// in the array, silver after them — keeping the SAME hash so a given title
// still always lands on the same shade, just within a narrower pool. Absent,
// behaviour is exactly what it was before this prop existed.
function mediaTint(value: string, tone?: "dark"): (typeof MEDIA_TINTS)[number] {
  const pool = tone === "dark" ? MEDIA_TINTS.slice(0, 3) : MEDIA_TINTS;
  return pool[hashString(value) % pool.length]!;
}

// ★ The lead's real-build finding: two letters from the first two words (or
// the first two characters of a one-word title) rendered pairs like «اا» for
// any title whose first word or two both started with «ا» — indistinguishable
// from a horizontal pause/loading glyph, not a letter at all. One letter
// only, matching `avatar.tsx`'s own `initial()`. A leading «ال» (the definite
// article) is skipped first, so a title like «الجلسة» shows «ج» — the noun's
// own first letter — rather than «ا», which nearly every Arabic title would
// otherwise produce.
function placeholderGlyph(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "؟"; // Arabic question mark: an unnamed placeholder.
  const first = words[0]!;
  const withoutAl = first.startsWith("ال") && first.length > 2 ? first.slice(2) : first;
  return withoutAl.charAt(0);
}

/**
 * `CardMedia` — reserves the media box always, and never shows an empty grey
 * box: when `src` is absent it renders a generated typographic placeholder
 * built from `placeholderFrom` (`16` §6.4).
 */
export function CardMedia({ src, alt = "", placeholderFrom, placeholderTone, aspect = "4/5", overlay, priority, dimmed, className = "" }: CardMediaProps) {
  // ★ `dimmed` (R-C1, `sessions`' request, DEC-123 item 1): the grayscale/
  // opacity wash goes on the IMAGE OR PLACEHOLDER ONLY, never on `overlay` —
  // the canvas's own defect was nesting the status badge INSIDE the dimmed
  // element, which took a compliant badge to a quarter of its contrast
  // («انتهت» measured 1.87:1 that way; the badge's own tokens are 5.11:1).
  // `overlay` renders in a sibling node below, entirely outside this wash.
  const wash = dimmed ? "grayscale opacity-45" : "";
  return (
    <div data-slot="media" className={`relative shrink-0 overflow-hidden bg-navy-900 ${ASPECT[aspect]} ${className}`}>
      {src ? (
        // Not `next/image`: `16` §6.4's media is a signed URL from a private
        // bucket (`03` §6) exactly like `posters/session-poster.tsx`, so
        // there is nothing to optimise and no stable remote pattern to
        // declare for a URL that expires in minutes.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className={`h-full w-full object-cover ${wash}`}
        />
      ) : (
        <div
          aria-hidden
          className={`flex h-full w-full items-center justify-center text-h2 font-semibold ${mediaTint(placeholderFrom, placeholderTone)} ${wash}`}
        >
          <bdi>{placeholderGlyph(placeholderFrom)}</bdi>
        </div>
      )}
      {overlay ? <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">{overlay}</div> : null}
    </div>
  );
}

export function CardBody({ children, className = "" }: CardBodyProps) {
  return (
    <div data-slot="body" className={`flex min-w-0 flex-1 flex-col gap-1.5 p-4 ${className}`}>
      {children}
    </div>
  );
}

/** The nested-interactive boundary — see the module comment above. */
export function CardActions({ children, className = "" }: CardActionsProps) {
  const stop = (event: MouseEvent<HTMLDivElement>) => event.stopPropagation();
  return (
    <div data-slot="actions" className={`flex items-center gap-2 ${className}`} onClick={stop}>
      {children}
    </div>
  );
}
