import type { PanelProps, Tone } from "@/components/ui";

// content's file — `16` §4.2 Surface. A bordered region that is not a card:
// no media slot, no hover elevation, no link — a static frame around
// content that just needs setting apart (a summary block, a warning aside).

const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-edge bg-surface",
  info: "border-edge bg-silver-100",
  success: "border-success/30 bg-success-bg",
  live: "border-live/30 bg-live-bg",
  ended: "border-edge bg-ended-bg",
  error: "border-error-border/40 bg-error-bg",
};

// ★ Wave 15 — inside the playground's scope (DEC-183, DEC-186 §2 – §3, REQ-UIX-030).
// The status tones' fills are near-white constants, while the text inside a
// panel is inherited — and a dark scope turns that text light. So in a dark
// scope a toned panel takes the OUTLINE form: no fill, its `DEC-073` on-dark
// constant as the border. It is exactly what `platform/impersonation-banner.tsx`
// adds by hand under `.theme-dark` today. `info` takes the raised surface. The
// light variant keeps the light fills, under ink text. Added under `pg:` /
// `pg-dark:` after every class that exists, so outside the scope nothing moves.
const SCOPE_TONE: Record<Tone, string> = {
  neutral: "",
  info: "pg:bg-raised",
  success: "pg-dark:border-success-on-dark/50 pg-dark:bg-transparent",
  live: "pg-dark:border-live-on-dark/50 pg-dark:bg-transparent",
  ended: "pg-dark:border-ended-on-dark/50 pg-dark:bg-transparent",
  error: "pg-dark:border-error-on-dark/50 pg-dark:bg-transparent",
};

export function Panel({ tone = "neutral", children, className = "" }: PanelProps) {
  return <div className={`rounded-card border p-4 ${TONE_CLASS[tone]} pg:rounded-panel ${SCOPE_TONE[tone]} ${className}`}>{children}</div>;
}
