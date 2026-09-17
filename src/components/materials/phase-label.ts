// REQ-MAT-006 as amended (DEC-121): «قبل»/«بعد» reads relative to the item's own SCOPE, never
// the session — a day-scoped material asks about ITS day. Shared by `list.tsx` (the badge),
// `settings-form.tsx` and `upload-form.tsx` (the phase `<select>` each renders) — a standalone
// module rather than exported from `list.tsx`, which already imports both of those, so importing
// this back from either would be circular.
//
// Driven from `sessionDayId` alone, never from the day count: a one-day session's materials are
// always session-scoped (`sessionDayId` null), so this can never reach the new strings there —
// REQ-SES-018's "no scope concept at all" at `n <= 1`, held structurally rather than by a second
// branch on `days.length`.
export function phaseLabelKey(phase: "before" | "after", sessionDayId: string | null | undefined): "phase.before" | "phase.after" | "phase.beforeDay" | "phase.afterDay" {
  if (!sessionDayId) return phase === "before" ? "phase.before" : "phase.after";
  return phase === "before" ? "phase.beforeDay" : "phase.afterDay";
}
