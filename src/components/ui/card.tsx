"use client";

import type { MouseEvent } from "react";
import { Link } from "@/i18n/navigation";
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
        <Link
          href={href}
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
const MEDIA_TINTS = [
  "bg-navy-950 text-white",
  "bg-navy-800 text-white",
  "bg-navy-600 text-white",
  "bg-navy-200 text-navy-950",
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

function placeholderGlyph(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "؟"; // Arabic question mark: an unnamed placeholder.
  if (words.length === 1) return words[0]!.slice(0, 2);
  return `${words[0]!.charAt(0)}${words[1]!.charAt(0)}`;
}

/**
 * `CardMedia` — reserves the media box always, and never shows an empty grey
 * box: when `src` is absent it renders a generated typographic placeholder
 * built from `placeholderFrom` (`16` §6.4).
 */
export function CardMedia({ src, alt = "", placeholderFrom, aspect = "4/5", overlay, priority, className = "" }: CardMediaProps) {
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
          className="h-full w-full object-cover"
        />
      ) : (
        <div aria-hidden className={`flex h-full w-full items-center justify-center text-h2 font-semibold ${MEDIA_TINTS[hashString(placeholderFrom) % MEDIA_TINTS.length]}`}>
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
