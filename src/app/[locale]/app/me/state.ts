import { emptyFormState, type FormState } from "@/lib/form-state";

// `/app/me`'s Server Action state (SCR-021, REQ-PRF-001, `16` §8.2 item 6) —
// kept in its own module because a `"use server"` file may export async
// functions and nothing else. `app/propose/actions.ts`'s own header explains
// why: a re-exported type still lands in Turbopack's actions manifest, which
// then tries to import a value that erased at compile time.

/**
 * Every field the profile form can fail on, in the order the page renders
 * them. `leaderboardOptOut` is captured the same way as every other field —
 * `FormState` reads FormData as strings regardless of the control's type, so
 * a checkbox is `"on"` or absent, same as everything else.
 */
export const PROFILE_FIELDS = ["displayName", "companyId", "jobTitle", "bio", "leaderboardOptOut"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/**
 * `saved` is the one thing plain `FormState` does not carry: a signal that
 * lasts for exactly the render after a successful save. It replaces the old
 * `?saved=1` query-param redirect, whose confirmation could be lost when a
 * save was submitted before hydration landed (wave 6 sync 2) — the outcome
 * now travels structurally through `useActionState`'s own returned state,
 * with nothing in the URL to race.
 */
export interface ProfileState extends FormState<ProfileField> {
  saved: boolean;
}

export const emptyProfileState: ProfileState = { ...emptyFormState<ProfileField>(), saved: false };
