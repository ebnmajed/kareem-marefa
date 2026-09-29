import type { CSSProperties } from "react";
import type { CardMediaProps, PosterProps } from "@/components/ui";
import { CardMedia } from "@/components/ui/card";
import { teamColorOrNull } from "@/components/ui/avatar";

// content's file — REQ-UIX-032, REQ-UIX-026, DEC-183, DEC-186 §5. A session's
// poster on a card, in the playground: the rendered poster WHOLE when there is
// one, and a designed placeholder in the company's team colour until there is.
//
// ★ THE IMAGE IS `CardMedia`'s, so the whole-poster rule has one implementation:
// the image is `object-contain` in a reserved box and is never cropped, the box
// carries `data-slot="media"` so a row card sizes it, and the overlay slot is
// `CardMedia`'s. What this file adds is the placeholder, in a box of its own with
// the same slot name, because it may grow and `CardMedia`'s may not (below).
// `designer`'s `SessionPoster` stays the slot that reads the DAL; this file
// reads nothing.
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

// Under 8.5rem of content the category and the meta line step down to 13 px on a 20 px line —
// the design's caption floor, never smaller — so a small poster keeps room for its title and
// grows only for an exceptionally long one.
const SMALL_CAPTION = "@max-[8.5rem]:text-[0.8125rem] @max-[8.5rem]:leading-5";

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
    ? "bg-team text-on-team [--sticker-ground:var(--team)]"
    : "bg-raised text-fg-heading [--sticker-ground:var(--raised)]";
  const label = colour ? "bg-on-team text-team" : "bg-surface text-fg-heading";
  const style = colour ? ({ "--team": colour } as CSSProperties) : undefined;

  // ★ EVERY LINE OF THE TITLE IS WHOLE, AND NONE IS HIDDEN (the lead's gallery review, 390 px).
  // The title used to be clamped to four 30 px lines at `leading-[1.15]`, with padding under them
  // inside the clipped box: in a two-column grid the flex column squeezed it and the clip landed
  // mid-glyph, and the padding showed a sliver of the fifth line. Measured in Chromium with the
  // face loaded, a clamp cannot be made safe for Arabic at all:
  //   · a HIDDEN line's stacked marks (a shadda with its vowel, «مُعَلِّمٌ») rise into the last
  //     visible line — at 1.6, where every single mark sits inside its own line box, they still
  //     showed under the ellipsis;
  //   · `-webkit-line-clamp`'s ellipsis cut letters out of a word in RTL: «يمتد على» rendered as
  //     «يم على…», where the same text unclamped wraps whole.
  // So there is NO clamp. Instead:
  //   · The title's size follows the poster's own width (a container query on its content box):
  //     16 px under 8.5rem, 18 px from 8.5rem, 22 px from 14rem, 30 px from 18rem. Under 8.5rem
  //     the category and the meta line step down to 13 px too. A title of ordinary length fits
  //     the 4:5 box at every width from 144 px.
  //   · When one does not — a title can be 150 characters (`0010:34`) — the placeholder's box
  //     GROWS (`min-h-fit` on the media box) instead of clipping. It is a designed placeholder,
  //     not the artifact; the rendered poster keeps its own ratio.
  //   · Nothing is clipped, so the line height is the house heading's 1.4, not a clip margin.
  //     Nothing shrinks (`shrink-0` on every row), and the meta line stays whole at the bottom.
  const placeholder = (
    <div data-slot="poster-placeholder" style={style} className={`@container flex min-h-full w-full flex-col justify-between gap-2 rounded-tile p-3 ${ground}`}>
      <div className="flex shrink-0 items-start justify-between gap-2">
        {category ? (
          <span className={`rounded-pill px-2.5 py-1 text-caption font-bold ${SMALL_CAPTION} ${label}`}>
            <bdi>{category}</bdi>
          </span>
        ) : (
          <span />
        )}
        {sticker ? <span className="shrink-0 p-1.5">{sticker}</span> : null}
      </div>
      {/* Balanced, whole, never clamped, never shrunk (`02-typography.md`, REQ-UIX-032). */}
      <p
        data-slot="poster-title"
        // ★ 1.4, NOT THE DISPLAY SCALE'S 1.15 — ruled by the lead after 91bd5c37; do not tidy it
        // back. 1.15 is for a single line of numerals or a short label. This title wraps to several
        // lines of Arabic that carry marks: Baloo Bhaijaan 2's content area is 1.712 em, so at 1.15
        // a line's stacked marks (a shadda with its vowel) crowd into the line above. The display
        // scale's utilities set their own 1.15, so each size is followed by the same variant's
        // `leading-[1.4]`, which Tailwind emits after it.
        className="shrink-0 font-display text-base leading-[1.4] font-extrabold text-balance @min-[11rem]:text-lg @min-[14rem]:text-play-sm @min-[14rem]:leading-[1.4] @min-[18rem]:text-play-md @min-[18rem]:leading-[1.4]"
      >
        <bdi>{title}</bdi>
      </p>
      <p data-slot="poster-meta" className={`flex shrink-0 flex-wrap items-center gap-x-2 text-caption font-bold ${SMALL_CAPTION}`}>
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

  // The placeholder has its own box. It is 4:5 and may GROW for an exceptionally long title. A box
  // sized by `aspect-ratio` takes its content's height as its minimum — but only while its
  // overflow is VISIBLE, so this box clips nothing, and the placeholder rounds its own corners.
  // The placeholder is `min-h-full`: it fills the box when short and sets its height when long.
  // It cannot go through `CardMedia`, which clips and holds its children in an `h-full` wrapper,
  // pinning them to 4:5. Same `data-slot="media"`, so a row card sizes it as it sizes `CardMedia`.
  if (!src) {
    return (
      <div data-slot="media" className={`relative shrink-0 rounded-tile aspect-[4/5] ${className}`}>
        {placeholder}
      </div>
    );
  }

  // The rendered poster is `CardMedia`'s: contained, never cropped, in the box its ratio reserves.
  return (
    <CardMedia
      src={src}
      alt={alt}
      placeholderFrom={title}
      aspect={aspect}
      priority={priority}
      overlay={sticker ? <span className="ms-auto p-1.5">{sticker}</span> : undefined}
      className={`rounded-tile ${className}`}
    />
  );
}
