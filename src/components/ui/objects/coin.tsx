import { useId } from "react";
import type { ObjectProps } from "./types";

// العملة — النقاط.
//
// ★ THE MASTER CARRIES «+50»; THIS DOES NOT (DEC-183 §4.14, DEC-187). What a member earned is
// computed per session (REQ-CHK-018), so a numeral baked into the coin states a figure the
// product knows to be wrong. The amount is the caller's, drawn over the coin as text.
//
// Converted from `docs/design/assets/objects/svg/coin.svg` and then owned here: the master is
// the drawing, this is the component. A changed master is converted again and reviewed as a
// diff, the way a golden is.

export function CoinObject({ size = 160, shadow = true, className = "", amount }: ObjectProps & { amount?: string }) {
  const uid = useId();
  const drawing = (
    <svg viewBox="0 0 160 160" width={size} height={size} aria-hidden="true" focusable="false" className={amount === undefined ? className : "block"}>
      <defs>
      <radialGradient id={`${uid}-coin-face`} cx="35%" cy="28%" r="80%">
      <stop offset="0" stopColor="#EDFFA3"/>
      <stop offset="0.55" stopColor="#C6FF3D"/>
      <stop offset="1" stopColor="#78AD12"/>
      </radialGradient>
      <linearGradient id={`${uid}-coin-edge`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#9CCF29"/>
      <stop offset="1" stopColor="#4F7A0C"/>
      </linearGradient>
      </defs>{shadow ? (
        <g>
      <ellipse cx="84" cy="146" rx="52" ry="8" fill="#000000" opacity="0.45"/>
      </g>
      ) : null}
      <g transform="rotate(-12 80 80)">
      <circle cx="80" cy="86" r="52" fill={`url(#${uid}-coin-edge)`}/>
      <circle cx="80" cy="76" r="52" fill={`url(#${uid}-coin-face)`}/>
      <circle cx="80" cy="76" r="38" fill="none" stroke="#6E9E12" strokeWidth="4" opacity="0.5"/>
      <ellipse cx="60" cy="48" rx="18" ry="8" fill="#FFFFFF" opacity="0.55" transform="rotate(-30 60 48)"/>
      </g>
    </svg>
  );
  if (amount === undefined) return drawing;
  // The amount is TEXT over the drawing, in the display face: it is the computed figure, and it
  // is read once — the drawing is `aria-hidden`, the text is not.
  return (
    <span className={`relative inline-block ${className}`} style={{ inlineSize: size, blockSize: size }}>
      {drawing}
      <span
        className="absolute inset-0 flex -rotate-12 items-center justify-center pb-[5%] font-display font-extrabold text-on-accent"
        style={{ fontSize: size * 0.24 }}
      >
        <bdi dir="ltr">{amount}</bdi>
      </span>
    </span>
  );
}
