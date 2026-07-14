/**
 * The "Knowledge Network" — hand-tuned output of a seeded generator
 * (Poisson-disc-ish sampling + nearest-neighbor links), committed as static
 * artwork. Authored RTL-first: the headline side (high x) stays sparse with
 * a navy fade for legibility; density thickens center-left where the focal
 * node ripples. Mirrored for LTR via CSS ([dir="ltr"] .network-svg).
 * Dots never travel: the only motion is opacity breathing + one ripple.
 * Several dots are deliberately unconnected — knowledge not yet shared.
 */
export function NetworkBg({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 720"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      className={`network-svg pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      <defs>
        <radialGradient id="nk-glow">
          <stop offset="0%" stopColor="rgba(168,179,196,0.10)" />
          <stop offset="100%" stopColor="rgba(168,179,196,0)" />
        </radialGradient>
        <linearGradient id="nk-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.55" stopColor="#0B1220" stopOpacity="0" />
          <stop offset="0.95" stopColor="#0B1220" stopOpacity="0.92" />
        </linearGradient>
      </defs>

      <circle cx="560" cy="300" r="190" fill="url(#nk-glow)" />

      <g stroke="#A8B3C4" strokeWidth="0.75" fill="none">
        <line pathLength={1} x1="595" y1="153" x2="509" y2="203" opacity="0.11" />
        <line pathLength={1} x1="218" y1="133" x2="139" y2="262" opacity="0.11" />
        <line pathLength={1} x1="1272" y1="603" x2="1255" y2="487" opacity="0.1" />
        <line pathLength={1} x1="1272" y1="603" x2="1116" y2="524" opacity="0.08" />
        <line pathLength={1} x1="774" y1="352" x2="760" y2="250" opacity="0.1" />
        <line pathLength={1} x1="774" y1="352" x2="764" y2="461" opacity="0.09" />
        <line pathLength={1} x1="470" y1="341" x2="560" y2="300" opacity="0.11" />
        <line pathLength={1} x1="470" y1="341" x2="546" y2="430" opacity="0.11" />
        <line pathLength={1} x1="830" y1="630" x2="661" y2="583" opacity="0.14" />
        <line pathLength={1} x1="767" y1="111" x2="760" y2="250" opacity="0.11" />
        <line pathLength={1} x1="429" y1="478" x2="546" y2="430" opacity="0.12" />
        <line pathLength={1} x1="957" y1="219" x2="932" y2="87" opacity="0.13" />
        <line pathLength={1} x1="932" y1="87" x2="767" y2="111" opacity="0.1" />
        <line pathLength={1} x1="620" y1="266" x2="560" y2="300" opacity="0.12" />
        <line pathLength={1} x1="620" y1="266" x2="595" y2="153" opacity="0.1" />
        <line pathLength={1} x1="288" y1="510" x2="385" y2="598" opacity="0.08" />
        <line pathLength={1} x1="288" y1="510" x2="429" y2="478" opacity="0.13" />
        <line pathLength={1} x1="854" y1="536" x2="764" y2="461" opacity="0.11" />
        <line pathLength={1} x1="139" y1="613" x2="288" y2="510" opacity="0.12" />
        <line pathLength={1} x1="139" y1="613" x2="129" y2="432" opacity="0.13" />
        <line pathLength={1} x1="639" y1="476" x2="546" y2="430" opacity="0.09" />
        <line pathLength={1} x1="509" y1="203" x2="470" y2="170" opacity="0.14" />
        <line pathLength={1} x1="1029" y1="368" x2="957" y2="219" opacity="0.13" />
        <line pathLength={1} x1="1029" y1="368" x2="1116" y2="524" opacity="0.09" />
        <line pathLength={1} x1="371" y1="120" x2="485" y2="92" opacity="0.13" />
        <line pathLength={1} x1="822" y1="215" x2="760" y2="250" opacity="0.13" />
        <line pathLength={1} x1="661" y1="583" x2="640" y2="520" opacity="0.09" />
        <line pathLength={1} x1="408" y1="237" x2="470" y2="170" opacity="0.11" />
        <line pathLength={1} x1="408" y1="237" x2="509" y2="203" opacity="0.11" />
        <line pathLength={1} x1="139" y1="262" x2="129" y2="432" opacity="0.1" />
        <line pathLength={1} x1="485" y1="92" x2="470" y2="170" opacity="0.08" />
        <line pathLength={1} x1="640" y1="520" x2="639" y2="476" opacity="0.1" />
      </g>

      <g fill="#C9CED6">
        <circle cx="595" cy="153" r="2.2" opacity="0.33" />
        <circle cx="218" cy="133" r="1.5" opacity="0.35" className="max-md:hidden" />
        <circle cx="569" cy="628" r="1.5" opacity="0.4" className="pulse-dot" style={{ animationDelay: "0s" }} />
        <circle cx="1272" cy="603" r="2.2" opacity="0.22" className="max-md:hidden" />
        <circle cx="1351" cy="211" r="1.5" opacity="0.15" className="max-md:hidden" />
        <circle cx="774" cy="352" r="3" opacity="0.26" />
        <circle cx="764" cy="461" r="3" opacity="0.51" />
        <circle cx="470" cy="341" r="1.5" opacity="0.25" />
        <circle cx="830" cy="630" r="3" opacity="0.49" />
        <circle cx="767" cy="111" r="2.2" opacity="0.38" className="pulse-dot" style={{ animationDelay: "1.9s" }} />
        <circle cx="429" cy="478" r="2.2" opacity="0.48" />
        <circle cx="957" cy="219" r="3" opacity="0.3" />
        <circle cx="932" cy="87" r="2.2" opacity="0.26" />
        <circle cx="620" cy="266" r="3" opacity="0.54" />
        <circle cx="288" cy="510" r="3" opacity="0.43" className="max-md:hidden" />
        <circle cx="1255" cy="487" r="2.2" opacity="0.23" className="max-md:hidden" />
        <circle cx="1259" cy="359" r="3" opacity="0.12" className="max-md:hidden" />
        <circle cx="854" cy="536" r="2.2" opacity="0.47" className="pulse-dot" style={{ animationDelay: "3.8s" }} />
        <circle cx="139" cy="613" r="1.5" opacity="0.48" className="max-md:hidden" />
        <circle cx="639" cy="476" r="1.5" opacity="0.35" />
        <circle cx="509" cy="203" r="3" opacity="0.38" />
        <circle cx="1029" cy="368" r="1.5" opacity="0.35" />
        <circle cx="1116" cy="524" r="1.5" opacity="0.26" />
        <circle cx="371" cy="120" r="3" opacity="0.27" className="max-md:hidden" />
        <circle cx="822" cy="215" r="2.2" opacity="0.36" />
        <circle cx="661" cy="583" r="1.5" opacity="0.35" />
        <circle cx="385" cy="598" r="2.2" opacity="0.38" />
        <circle cx="408" cy="237" r="3" opacity="0.39" />
        <circle cx="139" cy="262" r="3" opacity="0.39" className="max-md:hidden" />
        <circle cx="1260" cy="172" r="2.2" opacity="0.11" className="max-md:hidden" />
        <circle cx="546" cy="430" r="1.5" opacity="0.49" />
        <circle cx="1105" cy="172" r="1.5" opacity="0.3" />
        <circle cx="129" cy="432" r="3" opacity="0.25" className="max-md:hidden" />
        <circle cx="485" cy="92" r="1.5" opacity="0.4" />
        <circle cx="470" cy="170" r="3.5" opacity="0.9" />
        <circle cx="760" cy="250" r="3.5" opacity="0.85" />
        <circle cx="640" cy="520" r="4" opacity="0.9" />
        <circle cx="560" cy="300" r="4" opacity="0.95" />
      </g>

      <circle className="ripple-ring" cx="560" cy="300" r="8" fill="none" stroke="#C9CED6" strokeWidth="1" />
      <circle className="ripple-ring" cx="560" cy="300" r="8" fill="none" stroke="#C9CED6" strokeWidth="1" style={{ animationDelay: "0.3s" }} />

      <rect x="0" y="0" width="1440" height="720" fill="url(#nk-fade)" />
    </svg>
  );
}
