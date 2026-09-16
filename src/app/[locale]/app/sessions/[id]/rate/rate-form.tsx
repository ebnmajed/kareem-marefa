"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { StarRating } from "@/components/event/star-rating";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { AlertCircleIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import type { Locale } from "@/i18n/routing";
import { summaryErrors, was } from "@/lib/form-state";
import type { RatingDTO } from "@/lib/dal/ratings";
import { submitRatingAction, updateRatingAction } from "./actions";
import { RATE_FIELDS, emptyRateFormState, type RateField, type RateFormState } from "./state";

// SCR-015's form, on the form model (REQ-UIX-009 … 011, `16` §8.2, DEC-141).
//
// Ratings only — the survey is not this wave (DEC-137). Two star rows, both
// required, and an optional comment. The submit button is ENABLED: a missing
// row is a field error and a summary line that links to it, not a button that
// stays grey and says nothing about why.
//
// ★ Every value survives a failed round trip. React 19 resets the form when the
// action resolves, the star rows are native radios now and reset with it, so
// each control's default reads back what the action captured — or, before any
// round trip, the saved rating being edited.

const LABEL_KEY: Record<RateField, string> = {
  sessionStars: "sessionLabel",
  presenterStars: "presenterLabel",
  comment: "commentLabel",
};

export function RateForm({ locale, sessionId, checkInId, existing }: { locale: Locale; sessionId: string; checkInId: string; existing: RatingDTO | null }) {
  const t = useTranslations("ratings.form");
  const tErrors = useTranslations("ratings.errors");

  const action = existing ? updateRatingAction.bind(null, locale, existing.id, sessionId) : submitRatingAction.bind(null, locale, sessionId, checkInId);
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
  const err = (field: RateField) => (state.errors[field] ? tErrors(state.errors[field]!) : undefined);

  const summary = summaryErrors(state, {
    fields: RATE_FIELDS,
    label: (field) => t(LABEL_KEY[field]),
    message: (key) => tErrors(key),
  });

  return (
    <form action={formAction} noValidate className="flex flex-col gap-7">
      {state.formError ? (
        <FormError key={state.attempt} message={tErrors(state.formError)} />
      ) : (
        <FormSummary key={state.attempt} title={t("errorSummaryTitle")} description={t("errorSummaryDescription")} errors={summary} />
      )}

      {/* `key` on each row: a round trip that changes the default must remount
          the radios so `defaultChecked` is read again. */}
      <StarRating key={`s-${state.attempt}`} name="sessionStars" legend={t("sessionLabel")} defaultValue={stars("sessionStars")} required error={err("sessionStars")} />
      <StarRating key={`p-${state.attempt}`} name="presenterStars" legend={t("presenterLabel")} defaultValue={stars("presenterStars")} required error={err("presenterStars")} />

      <Field id="comment" label={t("commentLabel")} hint={t("commentHint")} error={err("comment")}>
        <Textarea name="comment" maxLength={2000} rows={4} defaultValue={was(state, "comment")} />
      </Field>

      <div>
        <SubmitButton pendingLabel={t("submitting")}>{existing ? t("update") : t("submit")}</SubmitButton>
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
