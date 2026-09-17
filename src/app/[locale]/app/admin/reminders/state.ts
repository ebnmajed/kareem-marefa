import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module may export async functions and nothing else, so the
// state lives here.
//
// The offsets are rows the admin adds and removes, so their field names are
// not a fixed list: each row carries a key the form made, and a row's error is
// `offset-<key>` — an error stays on ITS row even after a row above it is
// removed, which an index would not.

export const MAX_OFFSETS = 6;

/** `reminderScheduleInput`'s bounds (`lib/dal/notifications.ts`), said at the field. */
export const OFFSET_MIN_MINUTES = 5;
export const OFFSET_MAX_MINUTES = 43200;
export const PROMPT_MAX_MINUTES = 10080;

export type RemindersState = FormState<string> & { saved: boolean };
export const emptyRemindersState: RemindersState = { ...emptyFormState<string>(), saved: false };

export const offsetField = (key: string) => `offset-${key}`;
export const offsetControlId = (key: string) => `reminder-offset-${key}`;
export const PROMPT_CONTROL_ID = "reminder-prompt";
