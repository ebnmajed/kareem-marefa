import type { StatProps, Tone } from "@/components/ui";
import { Link } from "@/i18n/navigation";

// content's file — `16` §4.2 Type. One number and what it means.
//
// `value` arrives pre-formatted ("numerals follow the ORG setting,
// REQ-INT-006") — this file never formats a number itself, only lays it out.

const TONE_TEXT: Partial<Record<Tone, string>> = {
  success: "text-success",
  live: "text-live",
  ended: "text-ended",
  error: "text-error",
};

export function Stat({ label, value, hint, tone, href, className = "" }: StatProps) {
  const valueClass = (tone && TONE_TEXT[tone]) || "text-fg-heading";
  const body = (
    <>
      <span className="block text-caption text-fg-muted">{label}</span>
      <strong className={`block text-h2 ${valueClass}`}>
        <bdi>{value}</bdi>
      </strong>
      {hint ? <span className="block text-caption text-fg-muted">{hint}</span> : null}
    </>
  );
  const shared = `block rounded-card border border-edge bg-surface p-4 ${className}`;
  return href ? (
    <Link href={href} className={`${shared} transition-shadow duration-150 hover:shadow-raise`}>
      {body}
    </Link>
  ) : (
    <div className={shared}>{body}</div>
  );
}
