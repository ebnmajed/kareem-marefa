"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { StarRating } from "@/components/event/star-rating";
import { SurveyQuestionField } from "@/components/survey/question-field";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import type { Locale } from "@/i18n/routing";
import { summaryErrors, was, wasList } from "@/lib/form-state";
import type { RatingDTO } from "@/lib/dal/ratings";
import type { MemberSurveyDTO } from "@/lib/dal/surveys";
import { submitRatingAction, updateRatingAction } from "./actions";
import {
  RATE_FIELDS,
  RATING_SAVED,
  SURVEY_KEY,
  emptyRateFormState,
  isSurveyField,
  surveyField,
  type RateField,
  type RateFormState,
  type SurveyFormShape,
} from "./state";

// SCR-015's form, on the form model (REQ-UIX-009 … 011, `16` §8.2, DEC-141).
//
// Two star rows, both required, an optional comment — and, when the session
// carries one, the survey below them (REQ-SUR-004). The submit button is
// ENABLED: a missing row or an unanswered required question is a field error
// and a summary line that links to it, not a button that stays grey and says
// nothing about why.
//
// ★ Every value survives a failed round trip. React 19 resets the form when the
// action resolves and the controls are native, so each one reads its default
// back out of what the action captured — the stars, the comment, and every
// survey answer with them.
//
// ★ ONE SCREEN, ONE ACTION, TWO WRITES. The member presses one button; the
// rating is written by the action and the answers are enqueued by the database
// with a jittered delay (DEC-160 §3.2). There is nothing here about a queue —
// no «قيد المعالجة», no spinner after the receipt, no poll. The member's part
// is over, and a progress indicator would be a second surface announcing that
// something about them is in flight.
//
// ★ A SESSION WITH NO SURVEY RENDERS EXACTLY WHAT IT RENDERED BEFORE THIS WAVE:
// `survey` is `null`, the survey section is absent, and the submit button keeps
// its own label. `tests/e2e/{event-rate,wave7-sessions-rate}.spec.ts` pass with
// their assertions untouched, which is REQ-SUR-001's «shows nothing about one,
// anywhere» on this screen.

const LABEL_KEY: Record<"sessionStars" | "presenterStars" | "comment", string> = {
  sessionStars: "sessionLabel",
  presenterStars: "presenterLabel",
  comment: "commentLabel",
};

export function RateForm({
  locale,
  sessionId,
  checkInId,
  existing,
  survey,
}: {
  locale: Locale;
  sessionId: string;
  checkInId: string;
  existing: RatingDTO | null;
  /** `null` when the session has no survey, or the viewer may not answer it. */
  survey: MemberSurveyDTO | null;
}) {
  const t = useTranslations("ratings.form");
  const tErrors = useTranslations("ratings.errors");
  const tSurvey = useTranslations("survey.rate");
  const tSurveyErrors = useTranslations("survey.errors");

  // What the action needs to read the form. Only ids, kinds and `required` —
  // never a prompt or an answer.
  const shape: SurveyFormShape | null = survey
    ? { surveyId: survey.surveyId, answered: survey.answered, questions: survey.questions.map((q) => ({ id: q.id, kind: q.kind, required: q.required })) }
    : null;

  const action = existing
    ? updateRatingAction.bind(null, locale, existing.id, sessionId, shape)
    : submitRatingAction.bind(null, locale, sessionId, checkInId, shape);

  // An edit starts from the rating as saved; a first rating from nothing.
  const initial: RateFormState = existing
    ? {
        ...emptyRateFormState,
        values: { sessionStars: String(existing.sessionStars), presenterStars: String(existing.presenterStars), comment: existing.comment ?? "" },
      }
    : emptyRateFormState;
  const [state, formAction] = useActionState(action, initial);

  const stars = (field: "sessionStars" | "presenterStars") => {
    const raw = was(state, field);
    return raw === "" ? undefined : Number(raw);
  };
  // A key from the survey's namespace is marked; everything else is the
  // rating's, exactly as it was.
  const message = (key: string) => (key.startsWith(SURVEY_KEY) ? tSurveyErrors(key.slice(SURVEY_KEY.length)) : tErrors(key));
  const err = (field: RateField) => (state.errors[field] ? message(state.errors[field]!) : undefined);
  /** The rating is stored and the survey is not (`DEC-164`) — the one whole-form
   *  key that is news rather than a failure. */
  const ratingSaved = state.formError === RATING_SAVED;

  const askable = survey && !survey.answered ? survey.questions : [];
  const summary = summaryErrors(state, {
    fields: [...RATE_FIELDS, ...askable.map((q) => surveyField(q.id))],
    label: (field) =>
      isSurveyField(field)
        ? (askable.find((q) => surveyField(q.id) === field)?.prompt ?? tSurvey("heading"))
        : t(LABEL_KEY[field as keyof typeof LABEL_KEY]),
    message,
  });

  return (
    <form action={formAction} noValidate className="flex flex-col gap-7">
      {/* ★ «حُفظ تقييمك…» is not a failed write, so it is not the red alert —
          it is the summary's DESCRIPTION, above the questions still to answer,
          and the title stops claiming the rating did not go through, which
          would be untrue (`DEC-164`). Any other whole-form key is still the
          alert: those are writes that did not happen. */}
      {state.formError && !ratingSaved ? (
        <FormError key={state.attempt} message={message(state.formError)} />
      ) : (
        <FormSummary
          key={state.attempt}
          title={ratingSaved ? tSurvey("errorSummaryTitle") : t("errorSummaryTitle")}
          description={ratingSaved ? tSurveyErrors("rating_saved") : t("errorSummaryDescription")}
          errors={summary}
        />
      )}

      {/* `key` on each row: a round trip that changes the default must remount
          the radios so `defaultChecked` is read again. */}
      <StarRating key={`s-${state.attempt}`} name="sessionStars" legend={t("sessionLabel")} defaultValue={stars("sessionStars")} required error={err("sessionStars")} />
      <StarRating key={`p-${state.attempt}`} name="presenterStars" legend={t("presenterLabel")} defaultValue={stars("presenterStars")} required error={err("presenterStars")} />

      <Field id="comment" label={t("commentLabel")} hint={t("commentHint")} error={err("comment")}>
        <Textarea name="comment" maxLength={2000} rows={4} defaultValue={was(state, "comment")} />
      </Field>

      {survey ? (
        <section aria-labelledby="survey-heading" className="border-t border-edge pt-7">
          <h2 id="survey-heading" className="text-h3 text-fg-heading">
            {tSurvey("heading")}
          </h2>
          {survey.answered ? (
            <div className="mt-2">
              <p className="text-body text-fg-body">{tSurvey("answered")}</p>
              <p className="mt-1 text-body-sm text-fg-muted">{tSurvey("answeredNote")}</p>
            </div>
          ) : (
            <>
              <p className="mt-2 text-body-sm text-fg-muted">{tSurvey("intro")}</p>
              <div className="mt-6 flex flex-col gap-7">
                {survey.questions.map((question) => (
                  <SurveyQuestionField
                    key={`${question.id}-${state.attempt}`}
                    question={question}
                    name={surveyField(question.id)}
                    error={err(surveyField(question.id))}
                    defaultValue={was(state, surveyField(question.id))}
                    defaultList={wasList(state, surveyField(question.id))}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      ) : null}

      <div>
        <SubmitButton pendingLabel={t("submitting")}>
          {survey && !survey.answered ? (existing ? tSurvey("submitUpdate") : tSurvey("submit")) : existing ? t("update") : t("submit")}
        </SubmitButton>
      </div>
    </form>
  );
}

/** A refused WRITE — the window closed under the member, a rating already there. No control to link to. */
function FormError({ message }: { message: string }) {
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    region.current?.focus();
  }, []);
  return (
    <div ref={region} role="alert" tabIndex={-1} className="flex items-start gap-2 rounded-card border border-error-border bg-error-bg p-4 text-caption text-error">
      <AlertCircleIcon className="mt-[0.2em]" />
      <span>{message}</span>
    </div>
  );
}
