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

export function Panel({ tone = "neutral", children, className = "" }: PanelProps) {
  return <div className={`rounded-card border p-4 ${TONE_CLASS[tone]} ${className}`}>{children}</div>;
}
