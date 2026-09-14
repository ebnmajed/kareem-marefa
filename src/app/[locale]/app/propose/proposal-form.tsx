"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ProposeState } from "./actions";
import { emptyProposeState } from "./state";

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
export type ProposalFormMember = { id: string; displayName: string | null; jobTitle: string | null };

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
  members,
  maxCoPresenters,
  maxCoPresentersLabel,
}: {
  action: (prev: ProposeState, formData: FormData) => Promise<ProposeState>;
  categories: ProposalFormCategory[];
  members: ProposalFormMember[];
  maxCoPresenters: number;
  maxCoPresentersLabel: string;
}) {
  const t = useTranslations("proposals.propose");
  const [state, formAction, pending] = useActionState(action, emptyProposeState);
  const summary = useRef<HTMLDivElement>(null);
  const failed = Object.keys(state.errors).length > 0 || state.formError !== null;

  // Move the reader to the summary when a submission comes back with errors,
  // rather than leaving them at the foot of a long form wondering what
  // happened (REQ-NFR-007).
  useEffect(() => {
    if (failed) summary.current?.focus();
  }, [failed, state]);

  const err = (field: string) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : null);
  // ★ React 19 resets a form once its action resolves, so every field reads
  // its value back out of the returned state. Without this a failed
  // validation empties the abstract the member just spent five minutes on.
  const was = (field: string) => state.values[field] ?? "";
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
        <input id="title" name="title" required maxLength={150} defaultValue={was("title")} className={FIELD} {...aria("title")} />
      </Field>

      <Field name="abstract" label={t("form.abstractLabel")} hint={t("form.abstractHint")} error={err("abstract")}>
        <textarea id="abstract" name="abstract" required maxLength={2000} rows={5} defaultValue={was("abstract")} className={AREA} {...aria("abstract")} />
      </Field>

      <Field name="categoryId" label={t("form.categoryLabel")} error={err("categoryId")}>
        <select id="categoryId" name="categoryId" required defaultValue={was("categoryId")} className={FIELD} {...aria("categoryId", false)}>
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
        <select id="level" name="level" required defaultValue={was("level") || "introductory"} className={FIELD} {...aria("level", false)}>
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
        <input id="targetAudience" name="targetAudience" maxLength={300} defaultValue={was("targetAudience")} className={FIELD} {...aria("targetAudience")} />
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
            defaultValue={was("expectedDurationMinutes")}
            className={`${FIELD} mt-0 w-32 text-center`}
            {...aria("expectedDurationMinutes")}
          />
          <span className="text-body text-fg-muted">{t("form.durationUnit")}</span>
        </div>
      </Field>

      {/* REQ-PRO-003. Checkboxes rather than a multi-select: a multi-select
          at 390 px is a scroll trap, and the count has to stay visible
          against the org's limit. The list comes from members_member_view, so
          it cannot show anyone outside the org — and the database refuses one
          anyway. */}
      <fieldset>
        <legend className="text-label text-fg-heading">
          {t("form.coPresentersLabel")}
          <span className="ms-2 text-body-sm font-normal text-fg-muted">{t("form.optional")}</span>
        </legend>
        <p className="mt-1 text-body-sm text-fg-muted">{t("form.coPresentersHint")}</p>
        <p className="mt-1 text-body-sm text-fg-muted">{maxCoPresentersLabel}</p>
        {members.length === 0 ? (
          <p className="mt-3 text-body-sm text-fg-muted">{t("form.coPresentersNone")}</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {members.map((m) => (
              <li key={m.id}>
                <label className="flex min-h-11 items-center gap-3 rounded-field px-2 text-body text-fg-body hover:bg-silver-100">
                  <input
                    type="checkbox"
                    name="coPresenters"
                    value={m.id}
                    defaultChecked={state.coPresenters.includes(m.id)}
                    disabled={maxCoPresenters === 0}
                    className="size-5"
                  />
                  <span>
                    <bdi>{m.displayName}</bdi>
                    {m.jobTitle ? <span className="text-fg-muted"> · <bdi>{m.jobTitle}</bdi></span> : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {err("coPresenters") ? (
          <p className="mt-2 text-body-sm text-fg-heading">{err("coPresenters")}</p>
        ) : null}
      </fieldset>

      <Field name="adminNotes" label={t("form.notesLabel")} hint={t("form.notesHint")} error={err("adminNotes")} optionalLabel={t("form.optional")}>
        <textarea id="adminNotes" name="adminNotes" maxLength={2000} rows={3} defaultValue={was("adminNotes")} className={AREA} {...aria("adminNotes")} />
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
