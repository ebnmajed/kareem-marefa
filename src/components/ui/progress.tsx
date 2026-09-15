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
      className={`h-2 w-full overflow-hidden rounded-full bg-silver-200 ${className}`}
    >
      <div
        className={`h-full rounded-full ${TONE_FILL[tone]} ${determinate ? "" : "w-full motion-safe:animate-pulse"}`}
        style={determinate ? { width: `${pct}%` } : undefined}
      />
    </div>
  );
}
