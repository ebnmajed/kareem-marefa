import { useId } from "react";
import type { ObjectProps } from "./types";

// الكأس — سباق الشركات ونهاية الموسم.
//
// Converted from `docs/design/assets/objects/svg/cup.svg` and then owned here: the master is
// the drawing, this is the component. A changed master is converted again and reviewed as a
// diff, the way a golden is.

export function CupObject({ size = 160, shadow = true, className = "" }: ObjectProps) {
  const uid = useId();
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden="true" focusable="false" className={className}>
      <defs>
      <radialGradient id={`${uid}-cup-body`} cx="35%" cy="25%" r="85%">
      <stop offset="0" stopColor="#FFF0A8"/>
      <stop offset="0.5" stopColor="#FFD23F"/>
      <stop offset="1" stopColor="#B8860B"/>
      </radialGradient>
      </defs>{shadow ? (
        <g>
      <ellipse cx="84" cy="146" rx="46" ry="8" fill="#000000" opacity="0.45"/>
      </g>
      ) : null}
      <g transform="rotate(-10 80 80)">
      <path d="M40 28h80l-8 56a32 32 0 0 1-64 0z" fill={`url(#${uid}-cup-body)`}/>
      <path d="M40 36c-18 0-24 10-18 22 5 10 15 15 26 15M120 36c18 0 24 10 18 22-5 10-15 15-26 15" fill="none" stroke="#B8860B" strokeWidth="7" strokeLinecap="round"/>
      <rect x="70" y="112" width="20" height="14" fill="#B8860B"/>
      <rect x="52" y="124" width="56" height="14" rx="5" fill="#FFD23F"/>
      <path d="m80 52 5 10 11 1-8 8 2 11-10-5-10 5 2-11-8-8 11-1z" fill="#B8860B" opacity="0.6"/>
      <ellipse cx="58" cy="44" rx="12" ry="5" fill="#FFFFFF" opacity="0.6" transform="rotate(-25 58 44)"/>
      </g>
    </svg>
  );
}
