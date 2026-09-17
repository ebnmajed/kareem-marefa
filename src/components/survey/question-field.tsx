"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { AlertCircleIcon } from "@/components/ui/icons";
import { Textarea } from "@/components/ui/textarea";
import type { SurveyQuestionDTO } from "@/lib/dal/surveys";

// One survey question, as a member answers it (REQ-SUR-002, REQ-UIX-009/010).
//
// The four types share one shape, and it is `star-rating.tsx`'s — which is the
// shape because `ui/radio-group` cannot carry an error: its `legend` is a
// `string`, so the «مطلوب» marker cannot be a separate span, and there is no
// `error` prop to associate an adjacent message with the group. A question that
// blocks submission has to say so AT the field (`REQ-UIX-010`), so the fieldset
// is written here. Everything else follows the house: the ROW styling is
// `ui/radio-group`'s and `ui/checkbox`'s to the class, the radio is the native
// control at `size-5 accent-[var(--btn-bg)]`, and no bordered box is invented.
//
// ★ NATIVE CONTROLS, and every value survives a failed round trip. React 19
// resets the form once the action resolves, so each control reads its default
// back out of the returned state (`lib/form-state.ts`) rather than holding
// state of its own: `defaultValue` for a scale, a single choice and a text
// answer, `defaultList` for a multiple choice.
//
// ★ NOTHING HERE EVER SHOWS AN ANSWER BACK AFTER IT IS SENT. A member cannot
// re-open their answers (DEC-160 §3) — the rate screen renders «أجبت» in place
// of this component, which is a property of the screen and not a `disabled`
// prop nobody would notice was missing.

const SCALE = [1, 2, 3, 4, 5] as const;

const ROW = "flex min-h-11 items-center gap-3 rounded-field px-2 text-body text-fg-body cursor-pointer hover:bg-[var(--btn2-bg-hover)]";

export function SurveyQuestionField({
  question,
  name,
  error,
  defaultValue,
  defaultList,
}: {
  question: SurveyQuestionDTO;
  /** The form field's name — `q:<question id>`, from `surveyField()`. */
  name: string;
  /** A rendered message, adjacent and icon-marked. */
  error?: string;
  defaultValue?: string;
  defaultList?: string[];
}) {
  const t = useTranslations("survey.rate");
  const tField = useTranslations("ui.field");
  const legendId = useId();
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  if (question.kind === "free_text") {
    return (
      <Field id={name} label={question.prompt} error={error} required={question.required}>
        <Textarea name={name} rows={3} maxLength={2000} defaultValue={defaultValue ?? ""} placeholder={t("textPlaceholder")} invalid={error ? true : undefined} />
      </Field>
    );
  }

  const multi = question.kind === "multi_choice";
  const describedBy = [error ? errorId : null, multi ? hintId : null].filter(Boolean).join(" ") || undefined;
  const chosen = new Set(defaultList ?? []);

  return (
    <fieldset
      id={name}
      role={multi ? "group" : "radiogroup"}
      aria-labelledby={legendId}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      aria-required={question.required || undefined}
    >
      <legend id={legendId} className="text-label text-fg-heading">
        <bdi>{question.prompt}</bdi>
        {question.required ? <span className="ms-2 text-caption font-normal text-fg-muted">{tField("required")}</span> : null}
      </legend>

      {multi ? (
        <p id={hintId} className="mt-1 text-caption text-fg-muted">
          {t("multiHint")}
        </p>
      ) : null}

      <div className="mt-2">
        {multi
          ? question.options.map((option) => (
              <Checkbox key={option.id} name={name} value={option.id} defaultChecked={chosen.has(option.id)} label={<bdi>{option.label}</bdi>} />
            ))
          : (question.kind === "scale_1_5"
              ? SCALE.map((value) => ({ value: String(value), label: formatNumber(value), scale: value }))
              : question.options.map((option) => ({ value: option.id, label: option.label, scale: null }))
            ).map((option) => (
              <label key={option.value} className={ROW}>
                {/* ui-lint-disable-next-line field — the label IS the wrapper, `ui/radio-group`'s own shape (`16` §17) */}
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  defaultChecked={defaultValue === option.value}
                  className="size-5 shrink-0 accent-[var(--btn-bg)]"
                />
                <span>
                  {option.scale === null ? (
                    <bdi>{option.label}</bdi>
                  ) : (
                    <>
                      {/* The digit is what a scale looks like; the name it is
                          ANNOUNCED by is the sentence — `star-rating.tsx`'s own
                          split, so «3» is never read as a bare number out of
                          context. */}
                      <span aria-hidden="true">{option.label}</span>
                      <span className="sr-only">{t("scalePointLabel", { count: option.scale, value: option.label })}</span>
                    </>
                  )}
                </span>
              </label>
            ))}
      </div>

      {error ? (
        <p id={errorId} className="mt-2 flex items-start gap-2 text-caption text-error">
          <AlertCircleIcon className="mt-[0.2em]" />
          <span>{error}</span>
        </p>
      ) : null}
    </fieldset>
  );
}
