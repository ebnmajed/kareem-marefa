import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module may export async functions and types alone, so the
// form's field list, its initial state and the duration presets live here.

export const IMPERSONATE_FIELDS = ["orgId", "reason", "minutes"] as const;
export type ImpersonateField = (typeof IMPERSONATE_FIELDS)[number];

/**
 * `lib/form-state`'s shape plus one fact the client acts on: the session
 * STARTED, so the token must be refreshed before the page re-renders (F2).
 */
export type ImpersonationState = FormState<ImpersonateField> & { started: boolean };

export function emptyImpersonationState(): ImpersonationState {
  return { ...emptyFormState<ImpersonateField>(), started: false };
}

/**
 * The durations an operator may choose, in minutes. The last is the table's
 * ceiling (`02` §4.1: `expires_at <= started_at + 4 hours`), so the form cannot
 * ask for more than Postgres would store — and `start_impersonation()` clamps
 * whatever arrives anyway.
 */
export const DURATION_PRESETS = [15, 30, 60, 120, 240] as const;
export const DEFAULT_DURATION = 60;
