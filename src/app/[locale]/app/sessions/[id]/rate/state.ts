import { emptyFormState, type FormState } from "@/lib/form-state";
import type { SurveyQuestionKind } from "@/lib/dal/surveys";

// A "use server" module exports async functions and nothing else — types
// included — so the rate form's fields and its initial state live here, and
// both halves of the round trip import them (`propose/state.ts` is the model).

/** Every field SCR-015 can fail on, IN THE ORDER THE PAGE RENDERS THEM — the summary lists failures in it. */
export const RATE_FIELDS = ["sessionStars", "presenterStars", "comment"] as const;

export type RatingField = (typeof RATE_FIELDS)[number];

/**
 * ★ The survey's fields are dynamic: one per question, named for the question.
 *
 * The rating's three are fixed and the survey's are not, so the form's field
 * type is a union with a template literal — `FormState<F extends string>`
 * already carries whatever `F` is, and `formStateFrom`/`was`/`summaryErrors`
 * are given the whole list at call time (the rating's three, then the questions
 * in their authored order, which is the order the page renders them in).
 */
export type RateField = RatingField | `q:${string}`;

export const surveyField = (questionId: string): RateField => `q:${questionId}`;
export const isSurveyField = (field: string): boolean => field.startsWith("q:");

/** The two star rows — a zero-star rating is not "no opinion", it is invalid input (REQ-RAT-002). */
export const RATE_REQUIRED_FIELDS: readonly RatingField[] = ["sessionStars", "presenterStars"];

export type RateFormState = FormState<RateField>;

export const emptyRateFormState: RateFormState = emptyFormState<RateField>();

/**
 * What the action needs to know about the survey to read the form: the
 * questions, their types and whether each blocks submission. Bound into the
 * action by the form, so a member cannot add a question to their own
 * submission — `submit_survey_response()` re-derives all of it in SQL anyway
 * and refuses a question of another survey by id.
 */
export interface SurveyFormShape {
  surveyId: string;
  /** Already answered: the form renders «أجبت» and the action writes only the rating. */
  answered: boolean;
  questions: { id: string; kind: SurveyQuestionKind; required: boolean }[];
}

/** A message key that came from the SURVEY's namespace rather than the rating's. */
export const SURVEY_KEY = "survey:";
export const surveyKey = (key: string) => `${SURVEY_KEY}${key}`;

/**
 * ★ «The rating was saved; the survey was not» (`DEC-164`).
 *
 * A required survey question blocks the SURVEY, never the rating: the rating
 * has exactly two gates (an active check-in and the window, `REQ-RAT-001` …
 * `007`), and a third that no requirement states would silently suppress the
 * presenter's aggregate, the rating's points and the recognition evaluators.
 *
 * It is a whole-form key rather than a field error because it names what
 * HAPPENED, not what to fix — the questions to fix are the field errors beside
 * it — and the form reads it to change the summary's title from «لم نستطع
 * إرسال تقييمك» (untrue: the rating is stored) to the survey's own.
 */
export const RATING_SAVED = surveyKey("rating_saved");

/** The rating's own three fields, so the two halves can be told apart. */
export const isRatingField = (field: string): field is RatingField => (RATE_FIELDS as readonly string[]).includes(field);
