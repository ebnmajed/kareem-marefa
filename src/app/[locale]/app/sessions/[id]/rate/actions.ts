"use server";

import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { submitRating, submitRatingInput, updateRating, updateRatingInput } from "@/lib/dal/ratings";
import { formStateFrom, was, withErrors, withFormError } from "@/lib/form-state";
import { RATE_FIELDS, type RateField, type RateFormState } from "./state";

// SCR-015's Server Actions. Zod first (REQ-NFR-002), then the DAL — the
// `with check` on `ratings_write_self` (0010) is the real authority boundary
// (someone else's check-in id, a non-completed session, an org mismatch all
// fail there regardless of what this validates).
//
// ★ WAVE 7 — onto the form model (`lib/form-state`, `16` §8.2). React 19 resets
// a `<form action={…}>` once the action resolves, and the star rows are now
// native radios, so they reset too: every field is captured once and handed
// back, and the form reads its defaults from what came back. The two star rows
// are field errors with a summary, not a submit button that stays disabled and
// says nothing.
//
// ★ SUCCESS IS A RECEIPT ON THIS PAGE (DEC-141 ruling 2): `rate?rated=1`. It
// used to land on the event page, which reads nothing from `?rated=1`, so a
// rating went in without a word.
//
// No type is exported from here — see `state.ts`.

function capture(prev: RateFormState, formData: FormData) {
  const state = formStateFrom<RateField>(formData, { fields: RATE_FIELDS, previous: prev });
  const stars = (field: "sessionStars" | "presenterStars") => {
    const raw = was(state, field);
    return raw === "" ? 0 : Number(raw);
  };
  const comment = was(state, "comment");
  const errors: Partial<Record<RateField, string>> = {};
  if (!(stars("sessionStars") >= 1 && stars("sessionStars") <= 5)) errors.sessionStars = "starsRequired";
  if (!(stars("presenterStars") >= 1 && stars("presenterStars") <= 5)) errors.presenterStars = "starsRequired";
  if (comment.trim().length > 2000) errors.comment = "commentTooLong";
  return { state, errors, sessionStars: stars("sessionStars"), presenterStars: stars("presenterStars"), comment: comment.trim() || null };
}

/** A DAL refusal the member can act on is a whole-form message; anything else is the generic one. */
function refusal(state: RateFormState, e: unknown): RateFormState {
  const message = e instanceof Error ? e.message : "";
  return withFormError(state, message === "already_rated" || message === "not_permitted" || message === "window_closed" ? message : "generic");
}

export async function submitRatingAction(locale: Locale, sessionId: string, checkInId: string, prev: RateFormState, formData: FormData): Promise<RateFormState> {
  const { state, errors, sessionStars, presenterStars, comment } = capture(prev, formData);
  if (Object.keys(errors).length > 0) return withErrors(state, errors);
  const parsed = submitRatingInput.safeParse({ sessionId, checkInId, sessionStars, presenterStars, comment });
  if (!parsed.success) return withFormError(state, "generic");
  try {
    await submitRating(locale, parsed.data);
  } catch (e) {
    return refusal(state, e);
  }
  return redirect({ href: { pathname: `/app/sessions/${sessionId}/rate`, query: { rated: "1" } }, locale });
}

export async function updateRatingAction(locale: Locale, ratingId: string, sessionId: string, prev: RateFormState, formData: FormData): Promise<RateFormState> {
  const { state, errors, sessionStars, presenterStars, comment } = capture(prev, formData);
  if (Object.keys(errors).length > 0) return withErrors(state, errors);
  const parsed = updateRatingInput.safeParse({ ratingId, sessionStars, presenterStars, comment });
  if (!parsed.success) return withFormError(state, "generic");
  try {
    await updateRating(locale, parsed.data);
  } catch (e) {
    return refusal(state, e);
  }
  return redirect({ href: { pathname: `/app/sessions/${sessionId}/rate`, query: { rated: "1" } }, locale });
}
