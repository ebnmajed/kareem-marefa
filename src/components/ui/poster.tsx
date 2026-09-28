import type { CSSProperties } from "react";
import type { CardMediaProps, PosterProps } from "@/components/ui";
import { CardMedia } from "@/components/ui/card";
import { teamColorOrNull } from "@/components/ui/avatar";

// content's file — REQ-UIX-032, REQ-UIX-026, DEC-183, DEC-186 §5. A session's
// poster on a card, in the playground: the rendered poster WHOLE when there is
// one, and a designed placeholder in the company's team colour until there is.
//
// ★ IT COMPOSES `CardMedia`, so the whole-poster rule has one implementation:
// the image is `object-contain` in a reserved box and is never cropped, the box
// carries `data-slot="media"` so a row card sizes it, and the overlay slot is
// `CardMedia`'s. What this file adds is the placeholder, passed as `CardMedia`'s
// children only while there is no image. `designer`'s `SessionPoster` stays the
// slot that reads the DAL; this file reads nothing.
//
// ★ The box is reserved at the artifact's own ratio when its size is one of the
// ratios `CardMedia` reserves (the 4:5 master, a square, 16:9, A4); any other
// size is shown whole inside 4:5, the space around it left empty.
//
// ★ Colour is never the only channel: the placeholder always names the company.
// The team colour reaches this element as `--team`, re-checked as `#rrggbb` by
// the avatar's own function; no colour, or a malformed one, is the raised
// surface. No QR is drawn — a code that scans to nothing looks like one that
// works (DEC-186 §5). Static: nothing moves.

type Aspect = NonNullable<CardMediaProps["aspect"]>;

const RATIOS: [Aspect, number][] = [
  ["4/5", 4 / 5],
  ["1/1", 1],
  ["16/9", 16 / 9],
  ["210/297", 210 / 297],
  ["297/210", 297 / 210],
];

/** The reserved box for an artifact of this size — its own ratio when `CardMedia` has it, else 4:5. */
export function posterAspect(width?: number, height?: number): Aspect {
  if (!width || !height || !Number.isFinite(width / height)) return "4/5";
  const ratio = width / height;
  const match = RATIOS.find(([, r]) => Math.abs(r - ratio) < 0.01);
  return match ? match[0] : "4/5";
}

export function Poster({ src, width, height, alt = "", title, category, date, teamColor, teamName, sticker, priority, className = "" }: PosterProps) {
  const colour = teamColorOrNull(teamColor);
  const aspect = src ? posterAspect(width, height) : "4/5";

  // On a team colour the text is the ink (6.25:1 or better on all seven); with no
  // colour, the scope's raised surface and its text. The sticker's rim follows.
  const ground = colour
    ? "bg-team text-on-sticker [--sticker-ground:var(--team)]"
    : "bg-raised text-fg-heading [--sticker-ground:var(--raised)]";
  const label = colour ? "bg-on-sticker text-team" : "bg-surface text-fg-heading";
  const style = colour ? ({ "--team": colour } as CSSProperties) : undefined;

  const placeholder = (
    <div data-slot="poster-placeholder" style={style} className={`flex h-full w-full flex-col justify-between gap-3 p-3.5 ${ground}`}>
      <div className="flex items-start justify-between gap-2">
        {category ? (
          <span className={`rounded-pill px-2.5 py-1 text-caption font-bold ${label}`}>
            <bdi>{category}</bdi>
          </span>
        ) : (
          <span />
        )}
        {sticker ? <span className="shrink-0 p-1.5">{sticker}</span> : null}
      </div>
      {/* The title balances its lines and is clamped on its CONTAINER, with room under the last
          line for the marks — never a clipped text line (`02-typography.md`, REQ-UIX-032). */}
      <p className="line-clamp-4 pb-[0.2em] font-display text-play-md font-extrabold text-balance">
        <bdi>{title}</bdi>
      </p>
      <p className="flex flex-wrap items-center gap-x-2 text-caption font-bold">
        <bdi>{teamName}</bdi>
        {date ? (
          <>
            <span aria-hidden>·</span>
            <bdi>{date}</bdi>
          </>
        ) : null}
      </p>
    </div>
  );

  return (
    <CardMedia
      src={src}
      alt={alt}
      placeholderFrom={title}
      aspect={aspect}
      priority={priority}
      overlay={src && sticker ? <span className="ms-auto p-1.5">{sticker}</span> : undefined}
      className={`rounded-tile ${className}`}
    >
      {src ? undefined : placeholder}
    </CardMedia>
  );
}
