"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ProposeState } from "./actions";

// SCR-017's form. A client component only because it renders field errors
// from `useActionState`; everything it needs is passed in, so it holds no
// data of its own.
//
// ★ REQ-PRO-001: there is no date input, no time input and no venue input
// here, and the schema behind it has no key for one either. The note above
// the fields says so out loud, because a member arriving from the pre-launch
// form will look for a date box and should be told why there isn't one
// rather than left to wonder.
//
// `Field` is declared at module scope on purpose. Declared inside the form it
// would be a new component type on every render, so React would remount the
// inputs and wipe what the member typed — which is exactly what a failed
// validation round trip must not do to a 2000-character abstract.

export type ProposalFormCategory = { id: string; name: string };

const FIELD = "mt-2 block w-full rounded-field border border-edge-strong bg-canvas px-4 py-3 text-body text-fg-heading";
const AREA = `${FIELD} min-h-32`;

function Field({
  name,
  label,
  hint,
  error,
  optionalLabel,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string | null;
  optionalLabel?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="text-label text-fg-heading">
        {label}
        {optionalLabel ? <span className="ms-2 text-body-sm font-normal text-fg-muted">{optionalLabel}</span> : null}
      </label>
      {hint ? (
        <p id={`${name}-hint`} className="mt-1 text-body-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${name}-error`} className="mt-2 text-body-sm text-fg-heading">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ProposalForm({
  action,
  categories,
}: {
  action: (prev: ProposeState, formData: FormData) => Promise<ProposeState>;
  categories: ProposalFormCategory[];
}) {
  const t = useTranslations("proposals.propose");
  const [state, formAction, pending] = useActionState(action, { errors: {}, formError: null });
  const summary = useRef<HTMLDivElement>(null);
  const failed = Object.keys(state.errors).length > 0 || state.formError !== null;

  // Move the reader to the summary when a submission comes back with errors,
  // rather than leaving them at the foot of a long form wondering what
  // happened (REQ-NFR-007).
  useEffect(() => {
    if (failed) summary.current?.focus();
  }, [failed, state]);

  const err = (field: string) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : null);
  const aria = (name: string, hinted = true) => ({
    "aria-describedby": [state.errors[name] ? `${name}-error` : null, hinted ? `${name}-hint` : null].filter(Boolean).join(" ") || undefined,
    "aria-invalid": state.errors[name] ? true : undefined,
  });

  return (
    <form action={formAction} noValidate className="mt-8 max-w-2xl space-y-7">
      <div ref={summary} tabIndex={-1} aria-live="polite">
        {failed ? (
          <div role="alert" className="rounded-field border border-edge-strong p-4">
            <p className="text-label text-fg-heading">{t("form.errorSummaryTitle")}</p>
            <ul className="mt-2 space-y-1 text-body-sm text-fg-body">
              {state.formError ? <li>{t(`errors.${state.formError}`)}</li> : null}
              {Object.entries(state.errors).map(([field, key]) => (
                <li key={field}>{t(`errors.${key}`)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <Field name="title" label={t("form.titleLabel")} hint={t("form.titleHint")} error={err("title")}>
        <input id="title" name="title" required maxLength={150} className={FIELD} {...aria("title")} />
      </Field>

      <Field name="abstract" label={t("form.abstractLabel")} hint={t("form.abstractHint")} error={err("abstract")}>
        <textarea id="abstract" name="abstract" required maxLength={2000} rows={5} className={AREA} {...aria("abstract")} />
      </Field>

      <Field name="categoryId" label={t("form.categoryLabel")} error={err("categoryId")}>
        <select id="categoryId" name="categoryId" required defaultValue="" className={FIELD} {...aria("categoryId", false)}>
          <option value="" disabled>
            {t("form.categoryPlaceholder")}
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field name="level" label={t("form.levelLabel")} error={err("level")}>
        <select id="level" name="level" required defaultValue="introductory" className={FIELD} {...aria("level", false)}>
          <option value="introductory">{t("form.levelIntroductory")}</option>
          <option value="intermediate">{t("form.levelIntermediate")}</option>
          <option value="advanced">{t("form.levelAdvanced")}</option>
        </select>
      </Field>

      <Field
        name="targetAudience"
        label={t("form.audienceLabel")}
        hint={t("form.audienceHint")}
        error={err("targetAudience")}
        optionalLabel={t("form.optional")}
      >
        <input id="targetAudience" name="targetAudience" maxLength={300} className={FIELD} {...aria("targetAudience")} />
      </Field>

      <Field
        name="expectedDurationMinutes"
        label={t("form.durationLabel")}
        hint={t("form.durationHint")}
        error={err("expectedDurationMinutes")}
        optionalLabel={t("form.optional")}
      >
        <div className="mt-2 flex items-center gap-3">
          {/* The box is dir="ltr" because a typed number enters left to right
              whatever the surrounding direction; the unit label keeps its
              place in the reading order because the row is a flex row, not a
              physical float. */}
          <input
            id="expectedDurationMinutes"
            name="expectedDurationMinutes"
            type="number"
            inputMode="numeric"
            min={15}
            max={480}
            step={5}
            dir="ltr"
            className={`${FIELD} mt-0 w-32 text-center`}
            {...aria("expectedDurationMinutes")}
          />
          <span className="text-body text-fg-muted">{t("form.durationUnit")}</span>
        </div>
      </Field>

      <Field name="adminNotes" label={t("form.notesLabel")} hint={t("form.notesHint")} error={err("adminNotes")} optionalLabel={t("form.optional")}>
        <textarea id="adminNotes" name="adminNotes" maxLength={2000} rows={3} className={AREA} {...aria("adminNotes")} />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="intent" value="submit" disabled={pending}>
          {pending ? t("form.submitting") : t("form.submit")}
        </Button>
        <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>
          {t("form.saveDraft")}
        </Button>
      </div>
    </form>
  );
}
