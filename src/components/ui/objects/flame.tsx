import { useId } from "react";
import type { ObjectProps } from "./types";

// اللهب — السلسلة.
//
// Converted from `docs/design/assets/objects/svg/flame.svg` and then owned here: the master is
// the drawing, this is the component. A changed master is converted again and reviewed as a
// diff, the way a golden is.

export function FlameObject({ size = 160, shadow = true, className = "" }: ObjectProps) {
  const uid = useId();
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden="true" focusable="false" className={className}>
      <defs>
      <radialGradient id={`${uid}-flame-body`} cx="50%" cy="80%" r="70%">
      <stop offset="0" stopColor="#FFD23F"/>
      <stop offset="0.5" stopColor="#FF6E4F"/>
      <stop offset="1" stopColor="#B8321B"/>
      </radialGradient>
      <clipPath id={`${uid}-flame-clip`}>
      <path d="M82 14c8 34 44 44 44 88a44 44 0 0 1-88 0c0-18 10-28 20-38 0 18 8 28 18 28 0-28-10-52 6-78z"/>
      </clipPath>
      </defs>{shadow ? (
        <g>
      <ellipse cx="82" cy="146" rx="40" ry="8" fill="#000000" opacity="0.45"/>
      </g>
      ) : null}
      <g transform="rotate(8 80 80)">
      <path d="M82 14c8 34 44 44 44 88a44 44 0 0 1-88 0c0-18 10-28 20-38 0 18 8 28 18 28 0-28-10-52 6-78z" fill={`url(#${uid}-flame-body)`}/>
      <path d="M84 68c3 16 20 20 20 38a20 20 0 0 1-40 0c0-10 5-15 10-20 0 8 3 13 8 13 0-13-5-20 2-31z" fill="#FFF3C4" opacity="0.92"/>
      <g clipPath={`url(#${uid}-flame-clip)`}>
      <ellipse cx="58" cy="86" rx="6" ry="13" fill="#FFFFFF" opacity="0.4" transform="rotate(18 58 86)"/>
      </g>
      </g>
    </svg>
  );
}
