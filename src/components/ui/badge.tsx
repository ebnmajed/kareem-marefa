import { useTranslations } from "next-intl";
import type { BadgeProps, SessionStatusBadgeProps, Tone } from "@/components/ui";
import type { SeatState, SessionPhase } from "@/lib/session-status";
import { DotIcon } from "@/components/ui/icons";

// content's file — `16` §4.2 Status, §5.2, §16.2. `Badge` is the plain
// building block; `SessionStatusBadge` composes it with the session-lifecycle
// vocabulary (`@/lib/session-status`, never re-derived here).
//
// ★ Colour is never the only channel (REQ-UIX-003): every tone carries
// distinct Arabic text, and `live` additionally carries a pulsing dot.
// `outline` drops the fill entirely rather than reusing a light tint, so "no
// status yet" (`draft` / `pending_schedule`) cannot be mistaken for a real
// one at a glance — which is why `neutral` has no filled form at all.
//
// ★ `live` / `ended` are PLATFORM CONSTANTS, not brand tokens (DEC-073).
// `--color-live*` / `--color-ended*` live in `globals.css`'s raw `@theme`
// block, outside `BRAND_COLOUR_TOKENS` — never add them there.
//
// ★ The event hero sits on a `.theme-dark` band (`16` §4.2.2, M10), and the
// filled tones' backgrounds are fixed near-white values that would be wrong
// there. `--color-live-on-dark` exists for exactly that case; `ended` needs
// no dark counterpart because it already reads as the semantic muted
// foreground, which `.theme-dark` reassigns on its own. `[.theme-dark_&]:` is
// a Tailwind arbitrary variant keyed to an ANCESTOR class, so this file needs
// no prop for it — the badge adapts to wherever it is mounted, same as every
// other component that only consumes semantic utilities.

const FILLED_TONE: Partial<Record<Tone, string>> = {
  info: "bg-silver-100 text-fg-body",
  success:
    "bg-success-bg text-success [.theme-dark_&]:border [.theme-dark_&]:border-success-on-dark/50 [.theme-dark_&]:bg-transparent [.theme-dark_&]:text-success-on-dark",
  live: "bg-live-bg text-live [.theme-dark_&]:border [.theme-dark_&]:border-live-on-dark/50 [.theme-dark_&]:bg-transparent [.theme-dark_&]:text-live-on-dark",
  ended:
    "bg-ended-bg text-ended [.theme-dark_&]:border [.theme-dark_&]:border-edge-strong [.theme-dark_&]:bg-transparent [.theme-dark_&]:text-fg-muted",
  error:
    "bg-error-bg text-error [.theme-dark_&]:border [.theme-dark_&]:border-error-on-dark/50 [.theme-dark_&]:bg-transparent [.theme-dark_&]:text-error-on-dark",
};

// Outline: no fill, ever. `neutral` only ever renders this way (there is no
// `FILLED_TONE.neutral`); the others accept `outline` as an opt-in.
const OUTLINE_TONE: Record<Tone, string> = {
  neutral: "border border-edge-strong text-fg-muted",
  info: "border border-edge-strong text-fg-body",
  success: "border border-success text-success",
  live: "border border-live text-live [.theme-dark_&]:border-live-on-dark [.theme-dark_&]:text-live-on-dark",
  ended: "border border-edge-strong text-ended [.theme-dark_&]:text-fg-muted",
  error: "border border-error-border text-error",
};

const SIZE: Record<"sm" | "md", string> = {
  sm: "h-6 gap-1 px-2 text-caption",
  md: "h-7 gap-1.5 px-2.5 text-label",
};

export function Badge({ tone = "neutral", outline, size = "md", icon, children, className = "" }: BadgeProps) {
  const filled = FILLED_TONE[tone];
  const toneClass = outline || !filled ? OUTLINE_TONE[tone] : filled;
  return (
    <span className={`inline-flex w-fit items-center rounded-full font-medium ${SIZE[size]} ${toneClass} ${className}`}>
      {icon}
      <bdi>{children}</bdi>
    </span>
  );
}

/**
 * `<SessionStatusBadge phase seat closingSoon />` — ★ asks 4 and 6, in one
 * component. `16` §5.2's nine rows, verbatim:
 *
 *   open      available/unlimited        success   «التسجيل مفتوح»
 *   open      available, closing ≤ 48h   live      «يُغلق التسجيل قريبًا»
 *   open      full                       live      «قائمة انتظار»
 *   open      closed                     ended     «أُغلق التسجيل»
 *   live      —                          live      «جارية الآن» (pulsing dot)
 *   ended     —                          ended     «انتهت»
 *   cancelled —                          error     «أُلغيت»
 *   draft     —                          neutral   «مسودة»
 *   pending_schedule —                   neutral   «بانتظار الجدولة»
 *
 * ★ DEC-105: `seat === "unlimited"` can never reach a member-facing surface
 * (a `published` session always has a capacity, `0010`'s own check
 * constraint) — the branch stays implemented below because a `draft` on the
 * schedule screen genuinely has no capacity yet, and a total function that
 * throws on a legal row is worse than a branch that never runs there.
 *
 * ★ `useTranslations`, not `getTranslations`: `session-status.ts` documents
 * this component rendering inside client components (the action card's two
 * states), and the client hook already works from a non-`"use client"`
 * module in this codebase (`footer.tsx`) because `NextIntlClientProvider`
 * wraps the whole tree — so this file stays server-safe either way.
 */
export function SessionStatusBadge({ phase, seat, closingSoon, size = "md", className = "" }: SessionStatusBadgeProps) {
  const t = useTranslations("browse.status");
  const { tone, outline, key } = deriveStatus(phase, seat, closingSoon);
  const icon = tone === "live" && !outline ? <DotIcon className="motion-safe:animate-pulse" /> : undefined;
  return (
    <Badge tone={tone} outline={outline} size={size} icon={icon} className={className}>
      {t(key)}
    </Badge>
  );
}

function deriveStatus(
  phase: SessionPhase,
  seat: SeatState | undefined,
  closingSoon: boolean | undefined,
): { tone: Tone; outline: boolean; key: string } {
  switch (phase) {
    case "open":
      // `seat` is a single value (never both `full` and `available` at
      // once), so this order reads the table's semantics correctly even
      // though the table itself lists "closing soon" before "full": a full
      // session's own row governs regardless of the deadline.
      if (seat === "closed") return { tone: "ended", outline: false, key: "registrationClosed" };
      if (seat === "full") return { tone: "live", outline: false, key: "waitlist" };
      if (closingSoon) return { tone: "live", outline: false, key: "closingSoon" };
      return { tone: "success", outline: false, key: "open" };
    case "live":
      return { tone: "live", outline: false, key: "live" };
    case "ended":
      return { tone: "ended", outline: false, key: "ended" };
    case "cancelled":
      return { tone: "error", outline: false, key: "cancelled" };
    case "pending_schedule":
      return { tone: "neutral", outline: true, key: "pendingSchedule" };
    case "draft":
    default:
      return { tone: "neutral", outline: true, key: "draft" };
  }
}
