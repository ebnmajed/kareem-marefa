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

// ★ Wave 15 — inside the playground's scope (DEC-183, DEC-186 §3, REQ-UIX-030).
// The status colours are `DEC-073`'s on EVERY surface, the scope included: the
// scope never remaps them, and this file adds no colour. What the dark scope
// needs is the ON-DARK form each tone already has for `.theme-dark` — the light
// constants measure 2.67 – 3.13:1 on the scope's surface, the on-dark ones 7.05 –
// 8.61:1. So `pg-dark:` carries exactly those forms, added after the classes
// that exist, and `ended` reads its own constant (`--color-ended-on-dark`, the
// value it borrows from `.theme-dark`'s muted text) because the scope reassigns
// muted. Two tones `.theme-dark` never covered get the same treatment here:
// `info` filled (a near-white fill under text the scope turns light) and the
// `success` / `error` outlines. The light variant keeps the light constants,
// which pass on paper (5.13 – 6.01:1). The 6 px corner stays: a sober rectangle
// is what tells a status from a sticker without colour (DEC-186 §3).
const SCOPE_FILLED: Partial<Record<Tone, string>> = {
  info: "pg-dark:border pg-dark:border-edge-strong pg-dark:bg-transparent",
  success: "pg-dark:border pg-dark:border-success-on-dark/50 pg-dark:bg-transparent pg-dark:text-success-on-dark",
  live: "pg-dark:border pg-dark:border-live-on-dark/50 pg-dark:bg-transparent pg-dark:text-live-on-dark",
  ended: "pg-dark:border pg-dark:border-edge-strong pg-dark:bg-transparent pg-dark:text-ended-on-dark",
  error: "pg-dark:border pg-dark:border-error-on-dark/50 pg-dark:bg-transparent pg-dark:text-error-on-dark",
};

const SCOPE_OUTLINE: Partial<Record<Tone, string>> = {
  success: "pg-dark:border-success-on-dark pg-dark:text-success-on-dark",
  live: "pg-dark:border-live-on-dark pg-dark:text-live-on-dark",
  ended: "pg-dark:text-ended-on-dark",
  error: "pg-dark:border-error-on-dark pg-dark:text-error-on-dark",
};

// ★ A MINIMUM height, never a fixed one (the lead's wave-14 capture review): a
// label longer than its container — «مخفية — بانتظار المراجعة» on a photo tile
// at 390 px — wraps, and a fixed `h-6` kept the outlined box one line tall while
// the text spilled across its border. The box now grows with its lines. No
// vertical padding is added: the line-height's own leading keeps a wrapped
// glyph off the border, and a one-line badge keeps its height — one line plus
// the border fits inside `min-h-6`/`min-h-7` at the phone type scale, and the
// desktop `sm` badge, whose 24 px line never fitted a 24 px box with its
// border, now holds its border instead of overlapping it by a pixel.
const SIZE: Record<"sm" | "md", string> = {
  sm: "min-h-6 gap-1 px-2 text-caption",
  md: "min-h-7 gap-1.5 px-2.5 text-label",
};

// ★ `rounded-field` (6 px), not a pill — the canvas's own shape for a status
// badge (`Main`, `Browse`), matched here per the lead's ruling (DEC-110's
// "match the mockups"; `docs/plan/notes/content.md` §8's own note). Was
// `rounded-full` through M9; no test asserted the pill shape, so nothing
// else moves.
export function Badge({ tone = "neutral", outline, size = "md", icon, children, className = "" }: BadgeProps) {
  const filled = FILLED_TONE[tone];
  const outlined = outline || !filled;
  const toneClass = outlined ? OUTLINE_TONE[tone] : filled;
  const scopeClass = (outlined ? SCOPE_OUTLINE[tone] : SCOPE_FILLED[tone]) ?? "";
  return (
    <span className={`inline-flex w-fit items-center rounded-field font-medium ${SIZE[size]} ${toneClass} ${scopeClass} ${className}`}>
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
