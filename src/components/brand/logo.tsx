import { useId, type ComponentProps } from "react";

// The mark — «كريم معرفة», REQ-UIX-119, DEC-245 §6, DEC-247, DEC-248 §3.2.
// `docs/design/assets/brand/logo/README.md`, `logo-animated.svg`, `prototypes/logo-motion.html`. The lead's.
//
// ★ IT IS THE OWNER'S DRAWING, INLINED. Four arcs, each a face over its shadow, every stroke `pathLength="1"` so the
// reveal needs no measuring. The eight colours are the artwork's own — a mark is not a themed surface, and it reads
// the same on ink, on bone and in an email — so they are attributes on the paths, as the six objects' are
// (`ui/objects/`), and no class names them. Nothing is uploaded (invariant 11): it is a repository asset a component
// draws.
//
// ★ THREE MOVES, AND STATIC IS ONE OF THEM (`logo/README.md`, «Motion»). `motion`:
//   · `none`    — the mark, still. The default, and what every console and studio bar uses (REQ-UIX-053).
//   · `reveal`  — the four faces draw in order coral → lime → violet → orange, each shadow 90 ms behind its face,
//                 then one settle. Sign-in and a cold start of the landing, ONCE: it is a page-load animation on an
//                 element a layout keeps mounted, so a client-side navigation never replays it.
//   · `loading` — the four faces breathe in sequence; the shadows wait at half strength.
//   · `tap`     — one settle while it is pressed, as the home control.
// The keyframes and the delays live in `globals.css` (the lead's, like every keyframe), keyed on the `data-*`
// attributes below — never on the prototype's class names, which `design-files.test.ts` keeps out of `src/`.
// ★ Under `prefers-reduced-motion` all four are the still mark: nothing is hidden waiting for an animation that will
// not run, because the paths rest at `stroke-dashoffset: 0` and only an animation ever moves them.
// ★ It is not a moment, and there is no sixth (DEC-183 §2): it never plays inside one of the five.
//
// It is not a link. What it leads to is the decision of whoever places it (REQ-UIX-027, REQ-UIX-120).

const VIEW_BOX = "0 0 215.78 294.03";
const RATIO = 215.78 / 294.03;

export type LogoMotion = "none" | "reveal" | "loading" | "tap";

export interface LogoProps extends Omit<ComponentProps<"svg">, "children" | "viewBox"> {
  /** The block size, in pixels; the inline size follows the drawing's ratio. */
  height?: number;
  /** Its accessible name. Pass `null` where the name is already in text beside it. */
  label?: string | null;
  motion?: LogoMotion;
}

type Arc = "coral" | "lime" | "violet" | "orange";

function Stroke({ arc, part, d, stroke, width }: { arc: Arc; part: "face" | "shadow"; d: string; stroke: string; width: number }) {
  return <path data-arc={arc} data-part={part} d={d} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" pathLength={1} />;
}

export function Logo({ height = 36, label = "كريم معرفة", motion = "none", className = "", ...props }: LogoProps) {
  const named = label !== null;
  // Two marks on one page — a header's and a footer's — must not share a clip path's id.
  const id = useId();
  const clipShadow = `${id}-shadow`;
  const clipFace = `${id}-face`;
  const ORANGE_SHADOW = "M124.1,31.04c0,50.39-41.3,91.16-92.35,91.16";
  const ORANGE_FACE = "M118.47,26.68c0,50.39-41.3,91.16-92.35,91.16";

  return (
    <svg
      data-logo=""
      data-motion={motion}
      viewBox={VIEW_BOX}
      width={Math.round(height * RATIO)}
      height={height}
      role={named ? "img" : undefined}
      aria-label={named ? label : undefined}
      aria-hidden={named ? undefined : true}
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
      {...props}
    >
      <defs>
        <clipPath id={clipShadow}>
          <path d={`${ORANGE_SHADOW}L124.1,31.04Z`} />
        </clipPath>
        <clipPath id={clipFace}>
          <path d={`${ORANGE_FACE}L118.47,26.68Z`} />
        </clipPath>
      </defs>
      <Stroke arc="coral" part="shadow" d="M52.52,193.11c40.42,5.32,69.11,40.13,64.15,77.83" stroke="#ff4d2d" width={37.83} />
      <Stroke arc="coral" part="face" d="M46.9,197.29c40.42,5.32,69.11,40.13,64.15,77.83" stroke="#ff6e4f" width={37.83} />
      <Stroke arc="lime" part="shadow" d="M196.47,26.85c0,94.55-76.23,171.06-170.44,171.06" stroke="#8eff3d" width={38.63} />
      <Stroke arc="lime" part="face" d="M189.76,19.32c0,94.55-76.23,171.06-170.44,171.06" stroke="#c6ff3d" width={38.63} />
      <Stroke arc="violet" part="shadow" d="M25.22,123.17c83.56-6.87,157.01,58.54,164.22,146.25" stroke="#9b61ff" width={38.63} />
      <Stroke arc="violet" part="face" d="M30.7,118.59c83.56-6.87,157.01,58.54,164.22,146.25" stroke="#9b7cff" width={38.63} />
      <g>
        <g clipPath={`url(#${clipShadow})`}>
          <Stroke arc="orange" part="shadow" d={ORANGE_SHADOW} stroke="#d48300" width={23} />
        </g>
        <Stroke arc="orange" part="shadow" d={ORANGE_SHADOW} stroke="#d48300" width={38.63} />
      </g>
      <g>
        <g clipPath={`url(#${clipFace})`}>
          <Stroke arc="orange" part="face" d={ORANGE_FACE} stroke="#ff9a2e" width={23} />
        </g>
        <Stroke arc="orange" part="face" d={ORANGE_FACE} stroke="#ff9a2e" width={38.63} />
      </g>
    </svg>
  );
}
