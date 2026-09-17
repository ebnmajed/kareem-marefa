// A duration as an admin types it — a whole number and a unit — and as the
// database stores it — one integer in a base unit. Shared by the reminder
// schedule (minutes, `org_settings.reminder_offsets_minutes`) and the scoring
// catalogue's cooldowns (seconds, `scoring_rules.cooldown`), so the two screens
// cannot disagree about what «يوم» is.
//
// No `"use client"` and no `server-only`: the form renders with it and the
// Server Action parses with it.

export type DurationUnit = "seconds" | "minutes" | "hours" | "days";
export type DurationBase = "seconds" | "minutes";

const SECONDS: Record<DurationUnit, number> = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };

export const DURATION_UNITS: readonly DurationUnit[] = ["seconds", "minutes", "hours", "days"];

/** How many base units one of `unit` is. `null` when the unit is finer than the base. */
export function unitSize(unit: DurationUnit, base: DurationBase): number | null {
  const size = SECONDS[unit] / SECONDS[base];
  return Number.isInteger(size) ? size : null;
}

/**
 * An amount in base units, as the largest of `units` that divides it exactly —
 * 10080 minutes reads «7 أيام», 120 reads «2 ساعة», 90 stays «90 دقيقة». An
 * admin who stored an odd number is shown the odd number, never a rounded one,
 * which is why `units` must include the base unit itself: it is the fallback.
 */
export function splitDuration(amount: number, base: DurationBase, units: readonly DurationUnit[]): { amount: number; unit: DurationUnit } {
  const largestFirst = units
    .map((unit) => ({ unit, size: unitSize(unit, base) }))
    .filter((u): u is { unit: DurationUnit; size: number } => u.size !== null)
    .sort((a, b) => b.size - a.size);
  for (const { unit, size } of largestFirst) {
    if (amount !== 0 && amount % size === 0) return { amount: amount / size, unit };
  }
  return { amount, unit: base };
}

export type ParsedDuration = { ok: true; amount: number } | { ok: false; error: "required" | "invalid" };

/**
 * What the admin typed → base units. A whole number only, zero allowed (the
 * caller decides whether zero means anything), Western digits only — an
 * Arabic-Indic digit is not silently accepted and converted (`DEC-124`).
 */
export function parseDuration(amount: string, unit: string, base: DurationBase): ParsedDuration {
  const trimmed = amount.trim();
  if (trimmed === "") return { ok: false, error: "required" };
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: "invalid" };
  if (!(DURATION_UNITS as readonly string[]).includes(unit)) return { ok: false, error: "invalid" };
  const size = unitSize(unit as DurationUnit, base);
  if (size === null) return { ok: false, error: "invalid" };
  const value = Number(trimmed) * size;
  return Number.isSafeInteger(value) ? { ok: true, amount: value } : { ok: false, error: "invalid" };
}
