import type { DurationUnit } from "@/components/admin/duration";

// SCR-060's set — `AdminReminders.dc.html`, ruled by the owner (`DEC-232` §1.3): three fixed pre-session reminders and
// the rating prompt. No column: a row is ON when `reminder_offsets_minutes` holds an offset inside its band, and «off»
// removes that offset. No `"use client"` and no `server-only` — the page reads it, the form edits with it, the Server
// Action re-checks with it.
//
// ★ THE BANDS ARE `reminder_message_key()`'s (`0062:28-30`): an offset inside one is sent as that row's own message.
// A timing outside its band would silently become `MSG-reminder_generic`, so the action refuses it at the row.
// `tests/rls/notify-reminder-bands.test.ts` calls the SQL function at every edge, so this copy cannot drift.
//
// ★ NOTHING STORED IS HIDDEN: an offset outside all three bands — or a second one inside a band — is an «other»
// reminder, shown read-only below the three and written back untouched.

export const REMINDER_ROWS = [
  { key: "week", exact: 10080, min: 8064, max: 12096 },
  { key: "day", exact: 1440, min: 1152, max: 1728 },
  { key: "hours", exact: 120, min: 96, max: 144 },
] as const;

export type ReminderRowKey = (typeof REMINDER_ROWS)[number]["key"];

export const UNITS: readonly DurationUnit[] = ["minutes", "hours", "days"];

/** `reminderScheduleInput`'s bound (`lib/dal/notifications.ts`): a prompt from at once to a week after. */
export const PROMPT_MAX_MINUTES = 10080;

/** The `org_settings` columns this page writes — the saved mark reads their history. */
export const REMINDER_FIELDS = ["reminder_offsets_minutes", "rating_prompt_delay_minutes"] as const;

export interface ScheduleView {
  /** Each fixed row's stored offset, or null when it is off. */
  rows: Record<ReminderRowKey, number | null>;
  /** Stored offsets no fixed row holds, largest first. */
  others: number[];
}

export function inBand(key: ReminderRowKey, minutes: number): boolean {
  const row = REMINDER_ROWS.find((r) => r.key === key)!;
  return minutes >= row.min && minutes <= row.max;
}

/** The stored array as the three rows and the rest. Largest first, so a row takes the offset an admin sees first. */
export function viewOf(offsetsMinutes: readonly number[]): ScheduleView {
  const rows = { week: null, day: null, hours: null } as Record<ReminderRowKey, number | null>;
  const others: number[] = [];
  for (const minutes of [...offsetsMinutes].sort((a, b) => b - a)) {
    const row = REMINDER_ROWS.find((r) => rows[r.key] === null && inBand(r.key, minutes));
    if (row) rows[row.key] = minutes;
    else others.push(minutes);
  }
  return { rows, others };
}

/** Two schedules hold the same offsets, whatever their order. */
export function sameOffsets(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  return x.every((v, i) => v === y[i]);
}

/** A row's band in the unit its message names — «بين 6 و8 أيام» — read from the band, never typed (whole units inside it). */
export function bandWords(key: ReminderRowKey): { min: number; max: number } {
  const row = REMINDER_ROWS.find((r) => r.key === key)!;
  const size = key === "week" ? 1440 : key === "day" ? 60 : 1;
  return { min: Math.ceil(row.min / size), max: Math.floor(row.max / size) };
}
