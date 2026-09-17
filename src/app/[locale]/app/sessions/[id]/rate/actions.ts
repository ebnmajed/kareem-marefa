"use server";

import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { submitRating, submitRatingInput, updateRating, updateRatingInput } from "@/lib/dal/ratings";
import { submitSurveyResponse, type AnswerInput } from "@/lib/dal/surveys";
import { formStateFrom, was, wasList, withErrors, withFormError } from "@/lib/form-state";
import { RATE_FIELDS, surveyField, surveyKey, type RateField, type RateFormState, type SurveyFormShape } from "./state";

// SCR-015's Server Actions. Zod first (REQ-NFR-002), then the DAL — the
// `with check` on `ratings_write_self` (0010, 0087) is the real authority
// boundary (someone else's check-in id, a non-completed session, an org
// mismatch all fail there regardless of what this validates).
//
// ★ WAVE 7 — onto the form model (`lib/form-state`, `16` §8.2). React 19 resets
// a `<form action={…}>` once the action resolves, and the star rows are now
// native radios, so they reset too: every field is captured once and handed
// back, and the form reads its defaults from what came back.
//
// ★ SUCCESS IS A RECEIPT ON THIS PAGE (DEC-141 ruling 2): `rate?rated=1`.
//
// ★★ WAVE 10 — ONE SCREEN, ONE ACTION, TWO WRITES (REQ-SUR-004, DEC-094,
// DEC-160 §3). When the session carries a survey, this action also submits it,
// and the two writes stay DECORRELATED because the second one is not a write at
// all from here: `submit_survey_response()` records the member in the register
// and puts the ANSWERS on the queue with a jittered delay. Nothing in this file
// carries an answer into a log, an error message or a redirect.
//
// The order is what makes the screen honest:
//   1. validate everything, the survey's required questions included, so a
//      missing answer never costs the member their rating;
//   2. write the rating;
//   3. submit the survey.
// A session with NO survey runs exactly step 1 and 2, exactly as it did before
// this wave — `survey` is `null` and nothing below it executes.
//
// No type is exported from here — see `state.ts`.

interface Captured {
  state: RateFormState;
  errors: Partial<Record<RateField, string>>;
  sessionStars: number;
  presenterStars: number;
  comment: string | null;
  answers: AnswerInput[];
}

function capture(prev: RateFormState, formData: FormData, survey: SurveyFormShape | null): Captured {
  const questionFields = survey ? survey.questions.map((q) => surveyField(q.id)) : [];
  const listFields = survey ? survey.questions.filter((q) => q.kind === "multi_choice").map((q) => surveyField(q.id)) : [];
  const state = formStateFrom<RateField>(formData, {
    fields: [...RATE_FIELDS, ...questionFields],
    lists: listFields,
    previous: prev,
  });

  const stars = (field: "sessionStars" | "presenterStars") => {
    const raw = was(state, field);
    return raw === "" ? 0 : Number(raw);
  };
  const comment = was(state, "comment");
  const errors: Partial<Record<RateField, string>> = {};
  if (!(stars("sessionStars") >= 1 && stars("sessionStars") <= 5)) errors.sessionStars = "starsRequired";
  if (!(stars("presenterStars") >= 1 && stars("presenterStars") <= 5)) errors.presenterStars = "starsRequired";
  if (comment.trim().length > 2000) errors.comment = "commentTooLong";

  // The survey's own shape. Answered questions become answers; a required one
  // left empty is a field error and a summary line (REQ-UIX-009, 010) — and
  // the rating is not written on a round trip that carries one.
  const answers: AnswerInput[] = [];
  for (const question of survey && !survey.answered ? survey.questions : []) {
    const field = surveyField(question.id);
    if (question.kind === "multi_choice") {
      const optionIds = wasList(state, field);
      if (optionIds.length > 0) answers.push({ questionId: question.id, optionIds });
      else if (question.required) errors[field] = surveyKey("required");
      continue;
    }
    const raw = was(state, field).trim();
    if (raw === "") {
      if (question.required) errors[field] = surveyKey("required");
      continue;
    }
    if (question.kind === "scale_1_5") {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1 || value > 5) errors[field] = surveyKey("invalid");
      else answers.push({ questionId: question.id, scaleValue: value });
    } else if (question.kind === "single_choice") {
      answers.push({ questionId: question.id, optionIds: [raw] });
    } else {
      if (raw.length > 2000) errors[field] = surveyKey("invalid");
      else answers.push({ questionId: question.id, textValue: raw });
    }
  }

  return { state, errors, sessionStars: stars("sessionStars"), presenterStars: stars("presenterStars"), comment: comment.trim() || null, answers };
}

/** A DAL refusal the member can act on is a whole-form message; anything else is the generic one. */
function refusal(state: RateFormState, e: unknown): RateFormState {
  const message = e instanceof Error ? e.message : "";
  return withFormError(state, message === "already_rated" || message === "not_permitted" || message === "window_closed" ? message : "generic");
}

/**
 * The survey half. Returns the state to hand back, or `null` when the survey
 * went through (or there was none to send).
 *
 * ★ The rating is already written by the time this runs, so a refusal here says
 * exactly that — «حُفظ تقييمك، ولم تُرسَل الإجابات» — rather than claiming both
 * or neither.
 */
async function sendSurvey(locale: Locale, sessionId: string, survey: SurveyFormShape | null, captured: Captured): Promise<RateFormState | null> {
  if (!survey || survey.answered) return null;
  let outcome;
  try {
    outcome = await submitSurveyResponse(locale, sessionId, captured.answers);
  } catch {
    // The DAL already reduced this to a key; nothing about the answers travels.
    return withFormError(captured.state, surveyKey("survey_not_sent"));
  }
  switch (outcome.status) {
    case "ok":
    case "already_answered":
      // A second submission is not an error to a member who pressed once and
      // saw a retry: the register refused it by name and nothing was written.
      return null;
    case "invalid": {
      const errors: Partial<Record<RateField, string>> = {};
      for (const id of outcome.missing) errors[surveyField(id)] = surveyKey("required");
      for (const id of outcome.invalid) errors[surveyField(id)] = surveyKey("invalid");
      return withErrors(captured.state, errors);
    }
    case "not_eligible":
      return withFormError(captured.state, surveyKey(outcome.reason));
    default:
      return withFormError(captured.state, surveyKey("survey_not_sent"));
  }
}

export async function submitRatingAction(
  locale: Locale,
  sessionId: string,
  checkInId: string,
  survey: SurveyFormShape | null,
  prev: RateFormState,
  formData: FormData,
): Promise<RateFormState> {
  const captured = capture(prev, formData, survey);
  const { state, errors, sessionStars, presenterStars, comment } = captured;
  if (Object.keys(errors).length > 0) return withErrors(state, errors);
  const parsed = submitRatingInput.safeParse({ sessionId, checkInId, sessionStars, presenterStars, comment });
  if (!parsed.success) return withFormError(state, "generic");
  try {
    await submitRating(locale, parsed.data);
  } catch (e) {
    // ★ With a survey on the screen, a rating that is already there is not a
    // refusal: the member pressed one button for two things, and the first was
    // already done — a retry after a failed survey must not stop here. Without
    // a survey the behaviour is exactly what it was.
    const already = e instanceof Error && e.message === "already_rated";
    if (!survey || !already) return refusal(state, e);
  }
  const refused = await sendSurvey(locale, sessionId, survey, captured);
  if (refused) return refused;
  return redirect({ href: { pathname: `/app/sessions/${sessionId}/rate`, query: { rated: "1" } }, locale });
}

export async function updateRatingAction(
  locale: Locale,
  ratingId: string,
  sessionId: string,
  survey: SurveyFormShape | null,
  prev: RateFormState,
  formData: FormData,
): Promise<RateFormState> {
  const captured = capture(prev, formData, survey);
  const { state, errors, sessionStars, presenterStars, comment } = captured;
  if (Object.keys(errors).length > 0) return withErrors(state, errors);
  const parsed = updateRatingInput.safeParse({ ratingId, sessionStars, presenterStars, comment });
  if (!parsed.success) return withFormError(state, "generic");
  try {
    await updateRating(locale, parsed.data);
  } catch (e) {
    return refusal(state, e);
  }
  const refused = await sendSurvey(locale, sessionId, survey, captured);
  if (refused) return refused;
  return redirect({ href: { pathname: `/app/sessions/${sessionId}/rate`, query: { rated: "1" } }, locale });
}
