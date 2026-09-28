import { useId } from "react";
import type { ObjectProps } from "./types";

// النجمة — الإنجازات والشارات.
//
// Converted from `docs/design/assets/objects/svg/star.svg` and then owned here: the master is
// the drawing, this is the component. A changed master is converted again and reviewed as a
// diff, the way a golden is.

export function StarObject({ size = 160, shadow = true, className = "" }: ObjectProps) {
  const uid = useId();
  return (
    <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden="true" focusable="false" className={className}>
      <defs>
      <radialGradient id={`${uid}-star-body`} cx="38%" cy="30%" r="80%">
      <stop offset="0" stopColor="#FFB3DE"/>
      <stop offset="0.5" stopColor="#FF4FB8"/>
      <stop offset="1" stopColor="#A81C74"/>
      </radialGradient>
      <clipPath id={`${uid}-star-clip`}>
      <path d="m80 8 19 40 44 6-32 30 8 44-39-21-39 21 8-44-32-30 44-6z"/>
      </clipPath>
      </defs>{shadow ? (
        <g>
      <ellipse cx="82" cy="146" rx="44" ry="8" fill="#000000" opacity="0.45"/>
      </g>
      ) : null}
      <g transform="rotate(-8 80 80)">
      <path d="m80 14 19 40 44 6-32 30 8 44-39-21-39 21 8-44-32-30 44-6z" fill="#A81C74"/>
      <path d="m80 8 19 40 44 6-32 30 8 44-39-21-39 21 8-44-32-30 44-6z" fill={`url(#${uid}-star-body)`}/>
      <circle cx="80" cy="66" r="20" fill="#0B0C12" opacity="0.85"/>
      <path d="m71 66 6 6 12-13" fill="none" stroke="#FF4FB8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <g clipPath={`url(#${uid}-star-clip)`}>
      <ellipse cx="70" cy="36" rx="12" ry="6" fill="#FFFFFF" opacity="0.5" transform="rotate(-35 70 36)"/>
      </g>
      </g>
    </svg>
  );
}
