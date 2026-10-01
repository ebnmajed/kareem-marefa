"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { SurveyQuestionField } from "@/components/survey/question-field";
import type { StarLabels } from "@/components/ui";
import { ActionBar } from "@/components/ui/action-bar";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { StarInput } from "@/components/ui/star-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import type { Locale } from "@/i18n/routing";
import { summaryErrors, was, wasList } from "@/lib/form-state";
import type { RatingDTO } from "@/lib/dal/ratings";
import type { MemberSurveyDTO } from "@/lib/dal/surveys";
import { submitRatingAction, updateRatingAction } from "./actions";
import {
  RATE_FIELDS,
  RATING_COMMENT_MAX,
  RATING_SAVED,
  SURVEY_KEY,
  emptyRateFormState,
  isSurveyField,
  surveyField,
  type RateField,
  type RateFormState,
  type SurveyFormShape,
} from "./state";

// SCR-015's form, rebuilt from `Rate.dc.html` (wave 19, DEC-213, DEC-214 §3) on the form model
// (REQ-UIX-009 … 011, `16` §8.2). In the artboard's order: two `star-input` rows, the comment with
// «N من 2000», the anonymity panel — then ★★ the survey, which the artboard does not draw and
// REQ-SUR-004 keeps (DEC-213 §5.90) — then the bottom `action-bar` with the submit and the window line.
//
// ★ THE BAR IS INSIDE THE FORM: `SubmitButton` reads `useFormStatus()` of its enclosing form, so a
// bar outside it would never show the pending state. Below `lg` it is fixed to the viewport (the
// shell clears it — `hasActionBar()`); from `lg` it sits in flow at the end of the form (DEC-214 §3).
//
// ★ Every value survives a failed round trip (REQ-UIX-011, DEC-149 §1). React 19 resets the form when
// the action resolves and the controls are native, so each one reads its default back out of what the
// action captured — the stars, the comment, and every survey answer — remounted by `key={…attempt}`.
//
// ★ ONE SCREEN, ONE ACTION, TWO WRITES (REQ-SUR-004, DEC-160 §3). The member presses one button; the
// rating is written by the action and the answers are enqueued by the database with a jittered delay.
// There is nothing here about a queue — no «قيد المعالجة», no spinner after the receipt, no poll.
//
// ★ A SESSION WITH NO SURVEY RENDERS NOTHING ABOUT ONE (REQ-SUR-001): `survey` is `null`, the section
// is absent, and the submit keeps its own label.
//
// ★ A REQUIRED QUESTION BLOCKS THE SURVEY, NEVER THE RATING (DEC-164): `RATING_SAVED` is not the red
// alert — it is the summary's description, above the questions still to answer, and the title stops
// claiming the rating did not go through.

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
  notice,
  windowNote,
}: {
  locale: Locale;
  sessionId: string;
  checkInId: string;
  existing: RatingDTO | null;
  /** `null` when the session has no survey, or the viewer may not answer it. */
  survey: MemberSurveyDTO | null;
  /** The anonymity panel, drawn between the comment and the survey (`Rate.dc.html`). */
  notice?: ReactNode;
  /** The window line under the submit — «يُغلق باب التقييم في … · يمكنك تعديله حتى ذلك الحين» (REQ-RAT-003). */
  windowNote?: ReactNode;
}) {
  const t = useTranslations("ratings.form");
  const tErrors = useTranslations("ratings.errors");
  const tField = useTranslations("ui.field");
  const tSurvey = useTranslations("survey.rate");
  const tSurveyErrors = useTranslations("survey.errors");

  // What the action needs to read the form. Only ids, kinds and `required` — never a prompt or an answer.
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

  const starLabels = [1, 2, 3, 4, 5].map((n) => t("starCount", { count: n, value: formatNumber(n) })) as unknown as StarLabels;
  const stars = (field: "sessionStars" | "presenterStars") => {
    const raw = Number(was(state, field));
    return raw >= 1 && raw <= 5 ? (raw as 1 | 2 | 3 | 4 | 5) : undefined;
  };
  // A key from the survey's namespace is marked; everything else is the rating's.
  const message = (key: string) => (key.startsWith(SURVEY_KEY) ? tSurveyErrors(key.slice(SURVEY_KEY.length)) : tErrors(key));
  const err = (field: RateField) => (state.errors[field] ? message(state.errors[field]!) : undefined);
  /** The rating is stored and the survey is not (`DEC-164`) — the one whole-form key that is news rather than a failure. */
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

  // The bar's label follows the survey's state (REQ-SUR-004, DEC-213 §5.90).
  const submitLabel = survey && !survey.answered ? (existing ? tSurvey("submitUpdate") : tSurvey("submit")) : existing ? t("update") : t("submit");

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
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

      {(["sessionStars", "presenterStars"] as const).map((name) => (
        <StarInput
          key={`${name}-${state.attempt}`}
          name={name}
          legend={t(LABEL_KEY[name])}
          starLabels={starLabels}
          size="lg"
          defaultValue={stars(name)}
          required
          requiredLabel={tField("required")}
          error={err(name)}
        />
      ))}

      <Comment
        key={`comment-${state.attempt}`}
        defaultValue={was(state, "comment")}
        error={err("comment")}
        label={
          <>
            {t("commentName")} <span className="font-normal text-fg-muted">{t("commentOptional")}</span>
          </>
        }
        placeholder={t("commentPlaceholder")}
        // A character count, drawn as the artboard draws it — «0 من 2000», no grouping separator
        // (`formatNumber` would write «2,000»). `String()` of a number is Western digits (DEC-124).
        count={(n) => t("commentCount", { count: String(n), max: String(RATING_COMMENT_MAX) })}
      />

      {notice}

      {survey ? (
        <section aria-labelledby="survey-heading" className="border-t border-edge pt-6">
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

      <ActionBar
        label={t("actionsLabel")}
        primary={
          <SubmitButton size="lg" className="w-full" pendingLabel={t("submitting")}>
            {submitLabel}
          </SubmitButton>
        }
        note={windowNote ?? undefined}
        // Fixed below `lg`; from `lg` in flow at the end of the form (DEC-214 §3). The shell's padding
        // for a fixed bar stops at `lg` too (`globals.css`), so nothing is reserved for a bar in flow.
        className="lg:static lg:border-t-0 lg:bg-transparent lg:px-0"
      />
    </form>
  );
}

/** The comment, with «N من 2000» under it, counted as the member types. Without JavaScript the count is the one the server drew. */
function Comment({
  defaultValue,
  error,
  label,
  placeholder,
  count,
}: {
  defaultValue: string;
  error?: string;
  label: ReactNode;
  placeholder: string;
  count: (n: number) => string;
}) {
  const [length, setLength] = useState(defaultValue.length);
  return (
    <Field id="comment" label={label} hint={count(length)} error={error}>
      <Textarea
        name="comment"
        maxLength={RATING_COMMENT_MAX}
        rows={3}
        placeholder={placeholder}
        defaultValue={defaultValue}
        onInput={(e) => setLength(e.currentTarget.value.length)}
      />
    </Field>
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
