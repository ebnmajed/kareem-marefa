import { emptyFormState, type FormState } from "@/lib/form-state";
import type { TransitionState } from "./actions";

// A "use server" module may export async functions and nothing else — Next 16
// refuses a non-function export from a server-action module at BUILD time,
// where `tsc` cannot see it. Same rule, same fix as the review route's
// state.ts.

/**
 * Every field the direct-create form can fail on, IN THE ORDER THE PAGE
 * RENDERS THEM — `<FormSummary>` lists failures in this order (`16` §8.2
 * item 4), same convention `app/propose/state.ts` already established.
 *
 * ★ Replaces the old `CreateSessionState = { error: string | null }` — the
 * form moved onto `lib/form-state`'s shared model, so its state is now a
 * plain `FormState<SessionField>` like every other rebuilt form.
 */
export const SESSION_FIELDS = ["title", "abstract", "categoryId", "level", "language", "presenterIds"] as const;
export type SessionField = (typeof SESSION_FIELDS)[number];

/** The scalars. `presenterIds` is a list and is captured separately. */
export const SESSION_VALUE_FIELDS: readonly SessionField[] = SESSION_FIELDS.filter((f) => f !== "presenterIds");

/** Every field but `presenterIds` — `directSessionInput` has no `.min()` on
 *  the presenter list, so a direct session may have none yet. */
export const SESSION_REQUIRED_FIELDS: readonly SessionField[] = ["title", "abstract", "categoryId", "level", "language"];

export type CreateSessionState = FormState<SessionField>;
export const emptyCreateState: CreateSessionState = emptyFormState<SessionField>();

export const emptyTransitionState: TransitionState = { error: null, done: false };
