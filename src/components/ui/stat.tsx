import type { StatProps, Tone } from "@/components/ui";
import { Link } from "@/components/ui/link";

// content's file — `16` §4.2 Type. One number and what it means.
//
// `value` arrives pre-formatted — Western digits, always (`DEC-124`,
// REQ-INT-006) — and this file never formats a number itself, only lays it out.
//
// ★ A linked Stat goes through `ui/link` (wave 8, `platform`'s L4, the lead as
// custodian): the locale-aware link alone showed no pending affordance and never
// fed `RouteProgress`, so a dashboard of linked counts felt dead on a slow tap.

const TONE_TEXT: Partial<Record<Tone, string>> = {
  success: "text-success",
  live: "text-live",
  ended: "text-ended",
  error: "text-error",
};

// ★ Wave 15 — inside the playground's scope (DEC-183, DEC-186 §2 – §3, REQ-UIX-030).
// The number is in the display face at 700 (`00-direction.md`: big numbers in the
// display face); a toned value takes its `DEC-073` on-dark constant in a dark
// scope, where the light ones measure 2.67 – 3.13:1 — a status colour is never
// remapped and never the accent. The box takes the 22 px panel radius and no
// shadow; a linked one's hover steps the hairline up in place, with no
// transition. Added under `pg:`, after every class that exists.
const SCOPE_TONE_TEXT: Partial<Record<Tone, string>> = {
  success: "pg-dark:text-success-on-dark",
  live: "pg-dark:text-live-on-dark",
  ended: "pg-dark:text-ended-on-dark",
  error: "pg-dark:text-error-on-dark",
};

export function Stat({ label, value, hint, tone, href, className = "" }: StatProps) {
  const valueClass = (tone && TONE_TEXT[tone]) || "text-fg-heading";
  const scopeValue = (tone && SCOPE_TONE_TEXT[tone]) || "";
  const body = (
    <>
      <span className="block text-caption text-fg-muted">{label}</span>
      <strong className={`block text-h2 ${valueClass} pg:font-display pg:font-bold ${scopeValue}`}>
        <bdi>{value}</bdi>
      </strong>
      {hint ? <span className="block text-caption text-fg-muted">{hint}</span> : null}
    </>
  );
  const shared = `block rounded-card border border-edge bg-surface p-4 pg:rounded-panel ${className}`;
  return href ? (
    <Link href={href} className={`${shared} transition-shadow duration-150 hover:shadow-raise pg:transition-none pg:hover:shadow-none pg:hover:border-edge-strong`}>
      {body}
    </Link>
  ) : (
    <div className={shared}>{body}</div>
  );
}
