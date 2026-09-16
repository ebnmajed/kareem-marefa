import { emptyFormState, type FormState } from "@/lib/form-state";

// `lib/form-state`'s model with one more fact: the write happened. A console
// form closes its dialog and toasts from `saved`, which `FormState` alone
// cannot say — an untouched state and a successful save both carry no errors.
//
// No `"use client"`: a Server Action returns it and a form reads it.

export type SavedFormState<F extends string = string> = FormState<F> & { saved: boolean };

export function emptySavedState<F extends string = string>(): SavedFormState<F> {
  return { ...emptyFormState<F>(), saved: false };
}

/** A successful write: a fresh state, and the fact that it saved. */
export function savedState<F extends string = string>(): SavedFormState<F> {
  return { ...emptyFormState<F>(), saved: true };
}
