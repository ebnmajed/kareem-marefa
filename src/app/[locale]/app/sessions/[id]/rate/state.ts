import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module exports async functions and nothing else — types
// included — so the rate form's fields and its initial state live here, and
// both halves of the round trip import them (`propose/state.ts` is the model).

/** Every field SCR-015 can fail on, IN THE ORDER THE PAGE RENDERS THEM — the summary lists failures in it. */
export const RATE_FIELDS = ["sessionStars", "presenterStars", "comment"] as const;

export type RateField = (typeof RATE_FIELDS)[number];

/** The two star rows — a zero-star rating is not "no opinion", it is invalid input (REQ-RAT-002). */
export const RATE_REQUIRED_FIELDS: readonly RateField[] = ["sessionStars", "presenterStars"];

export type RateFormState = FormState<RateField>;

export const emptyRateFormState: RateFormState = emptyFormState<RateField>();
