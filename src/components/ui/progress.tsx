import type { ProgressProps, Tone } from "@/components/ui";

// content's file — `16` §4.2 Status. Determinate (seats filled, a file's
// declared size) or indeterminate (queued work with no known extent) —
// omitting `value` switches modes; both share the same track.
//
// ★ No new `@keyframes`: `globals.css` is lead-only. The indeterminate state
// uses Tailwind's own built-in `animate-pulse` (already used the same way by
// `icons.tsx`'s `SpinnerIcon`, gated the same way through `motion-safe:`)
// rather than a custom sliding-bar keyframe this file cannot define.

const TONE_FILL: Record<Tone, string> = {
  neutral: "bg-navy-900",
  info: "bg-navy-900",
  success: "bg-success",
  live: "bg-live",
  ended: "bg-ended",
  error: "bg-error",
};

// ★ Wave 15 — inside the playground's scope (DEC-183, DEC-186 §2 – §3, REQ-UIX-030).
// The track is the raised surface; the neutral fill is the accent, because navy
// measures 1.02:1 against the scope's surface; and a status fill takes its
// on-dark constant in a dark scope — the status colours are `DEC-073`'s and are
// never remapped. Added under `pg:`, after every class that exists, so outside
// the scope nothing moves. The `width` fill and the indeterminate pulse stay as
// they are: `progress-bar.tsx` is the playground's transform-grown bar, and this
// one retires its determinate mode when its consumers adopt that one.
const SCOPE_FILL: Record<Tone, string> = {
  neutral: "pg:bg-accent",
  info: "pg:bg-accent",
  success: "pg-dark:bg-success-on-dark",
  live: "pg-dark:bg-live-on-dark",
  ended: "pg-dark:bg-ended-on-dark",
  error: "pg-dark:bg-error-on-dark",
};

export function Progress({ value, max = 100, label, valueText, tone = "info", className = "" }: ProgressProps) {
  const determinate = typeof value === "number";
  const pct = determinate ? Math.max(0, Math.min(100, (value / max) * 100)) : null;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={determinate ? value : undefined}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={valueText}
      className={`h-2 w-full overflow-hidden rounded-full bg-silver-200 pg:bg-raised ${className}`}
    >
      <div
        className={`h-full rounded-full ${TONE_FILL[tone]} ${SCOPE_FILL[tone]} ${determinate ? "" : "w-full motion-safe:animate-pulse"}`}
        style={determinate ? { width: `${pct}%` } : undefined}
      />
    </div>
  );
}
