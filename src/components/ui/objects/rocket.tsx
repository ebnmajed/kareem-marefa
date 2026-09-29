import { useId } from "react";
import type { ObjectProps } from "./types";

// الصاروخ — ترقية المستوى.
//
// Converted from `docs/design/assets/objects/svg/rocket.svg` and then owned here: the master is
// the drawing, this is the component. A changed master is converted again and reviewed as a
// diff, the way a golden is.

export function RocketObject({ size = 160, shadow = true, className = "" }: ObjectProps) {
  const uid = useId();
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden="true" focusable="false" className={className}>
      <defs>
      <radialGradient id={`${uid}-rocket-body`} cx="35%" cy="25%" r="85%">
      <stop offset="0" stopColor="#D7CCFF"/>
      <stop offset="0.5" stopColor="#9B7CFF"/>
      <stop offset="1" stopColor="#4E35B8"/>
      </radialGradient>
      <radialGradient id={`${uid}-rocket-flame`} cx="50%" cy="20%" r="70%">
      <stop offset="0" stopColor="#FFD23F"/>
      <stop offset="1" stopColor="#FF6E4F"/>
      </radialGradient>
      <clipPath id={`${uid}-rocket-clip`}>
      <path d="M80 12c22 18 30 48 30 78H50c0-30 8-60 30-78z"/>
      </clipPath>
      </defs>{shadow ? (
        <g>
      <ellipse cx="84" cy="146" rx="40" ry="8" fill="#000000" opacity="0.45"/>
      </g>
      ) : null}
      <g transform="rotate(-24 80 80)">
      <path d="M80 12c22 18 30 48 30 78H50c0-30 8-60 30-78z" fill={`url(#${uid}-rocket-body)`}/>
      <path d="M50 78 32 104h22zM110 78l18 26h-22z" fill="#4E35B8"/>
      <rect x="62" y="90" width="36" height="16" rx="4" fill="#4E35B8"/>
      <path d="M66 106c4 20 10 30 14 34 4-4 10-14 14-34z" fill={`url(#${uid}-rocket-flame)`}/>
      <circle cx="80" cy="56" r="12" fill="#0B0C12"/>
      <circle cx="80" cy="56" r="7" fill="#35D0FF"/>
      <g clipPath={`url(#${uid}-rocket-clip)`}>
      <ellipse cx="70" cy="44" rx="5" ry="14" fill="#FFFFFF" opacity="0.45" transform="rotate(10 70 44)"/>
      </g>
      </g>
    </svg>
  );
}
