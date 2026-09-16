"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { hasAttempted, summaryErrors, was, wasList } from "@/lib/form-state";
import { emptyCreateState, SESSION_FIELDS, SESSION_REQUIRED_FIELDS, type CreateSessionState, type SessionField } from "./state";

// SCR-042's «أنشئ جلسة مباشرة» (REQ-PRO-007), onto the system for wave 6
// (`16` §8.2, `DEC-130`).
//
// ★ No date, no venue, no capacity — and not because they are hidden. Creating
// a session and scheduling it are two acts (D13/D14), `create_session()` has
// no parameter for any of them, and `directSessionInput` is `.strict()` so one
// arriving here would be a parse failure.
//
// ★ The presenter field was every org member as a checkbox list — a scroll
// trap at 40 members, unusable at 400, the exact pattern `ui/combobox` was
// built to fix (`16` §4.2 ★). It is now a multi-select combobox with the
// same Arabic-normalised typeahead the member picker uses.
//
// ★ This form adopts `lib/form-state` (the model `app/propose/proposal-form.tsx`
// established) — `<FormSummary>`, values surviving a failed round trip, «مطلوب»
// on the label. What it does NOT adopt is that form's live reward/punish
// on-blur error-clearing: this is a secondary action (DEC-130 — «إنشاء بدون
// مقترح» stays secondary), not the flagship form, and the summary/adjacent
// error/required-marking/value-survival set is REQ-UIX-009/010/011's full
// acceptance criteria on its own.

const LABEL_KEY: Record<SessionField, string> = {
  title: "titleLabel",
  abstract: "abstractLabel",
  categoryId: "categoryLabel",
  level: "levelLabel",
  language: "languageLabel",
  presenterIds: "presentersLabel",
};

const FIELD_ID: Record<SessionField, string> = {
  title: "direct-title",
  abstract: "direct-abstract",
  categoryId: "direct-category",
  level: "direct-level",
  language: "direct-language",
  presenterIds: "direct-presenters",
};

export function DirectSessionForm({
  action,
  categories,
  members,
}: {
  action: (prev: CreateSessionState, formData: FormData) => Promise<CreateSessionState>;
  categories: { id: string; name: string }[];
  members: { id: string; displayName: string | null }[];
}) {
  const t = useTranslations("admin.sessions");
  // The three level labels are `proposals.propose`'s own copy (`sessions`'
  // namespace, read-only) — reused rather than duplicated, same as the
  // original version of this form already did.
  const tp = useTranslations("proposals.propose");
  const [state, formAction, pending] = useActionState(action, emptyCreateState);
  const err = (field: SessionField) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
  const required = (field: SessionField) => SESSION_REQUIRED_FIELDS.includes(field);

  const summary = summaryErrors(state, {
    fields: SESSION_FIELDS,
    label: (field) => t(LABEL_KEY[field]),
    message: (key) => t(`errors.${key}`),
    // ★ The summary's links target the CONTROL's id, which is the `<Field id>`
    // below — not the field's name. Without this map every link pointed at an
    // element that does not exist and focused nothing (wave 8, F4; REQ-UIX-009).
    fieldId: (field) => FIELD_ID[field],
  });

  const memberOptions = members.map((m) => ({ value: m.id, label: m.displayName ?? "" }));

  return (
    <form action={formAction} noValidate className="mt-4 max-w-2xl space-y-6">
      {hasAttempted(state) ? <FormSummary key={state.attempt} title={t("errorSummaryTitle")} errors={summary} /> : null}
      {state.formError ? (
        <p role="alert" className="rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {t(`errors.${state.formError}`)}
        </p>
      ) : null}

      <Field id="direct-title" label={t("titleLabel")} required={required("title")} error={err("title")}>
        <Input name="title" defaultValue={was(state, "title")} maxLength={150} />
      </Field>

      <Field id="direct-abstract" label={t("abstractLabel")} required={required("abstract")} error={err("abstract")}>
        <Textarea name="abstract" defaultValue={was(state, "abstract")} rows={4} maxLength={2000} className="min-h-28" />
      </Field>

      <Field id="direct-category" label={t("categoryLabel")} required={required("categoryId")} error={err("categoryId")}>
        <Select name="categoryId" defaultValue={was(state, "categoryId")}>
          <option value="" disabled>
            {t("categoryPlaceholder")}
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="direct-level" label={t("levelLabel")} required={required("level")} error={err("level")}>
        <Select name="level" defaultValue={was(state, "level") || "introductory"}>
          <option value="introductory">{tp("form.levelIntroductory")}</option>
          <option value="intermediate">{tp("form.levelIntermediate")}</option>
          <option value="advanced">{tp("form.levelAdvanced")}</option>
        </Select>
      </Field>

      <Field id="direct-language" label={t("languageLabel")} required={required("language")} error={err("language")}>
        <Select name="language" defaultValue={was(state, "language") || "ar"}>
          <option value="ar">{t("languageAr")}</option>
          <option value="en">{t("languageEn")}</option>
        </Select>
      </Field>

      <Field id="direct-presenters" label={t("presentersLabel")} hint={t("presentersHint")} error={err("presenterIds")}>
        <Combobox
          id="direct-presenters"
          name="presenterIds"
          multiple
          options={memberOptions}
          defaultValue={wasList(state, "presenterIds")}
          placeholder={t("presentersPlaceholder")}
        />
      </Field>

      <p className="text-body-sm text-fg-muted">{t("scheduleNote")}</p>
      <Button type="submit" pending={pending} pendingLabel={t("creating")}>
        {t("create")}
      </Button>
    </form>
  );
}

/**
 * «إنشاء بدون مقترح» stays a SECONDARY action (`DEC-130`'s own wording) —
 * collapsed behind this toggle rather than a permanently-visible section, so
 * the page's primary flow (proposals → sessions) is not competing with a
 * form most admins will rarely open.
 */
export function DirectSessionSection({
  action,
  categories,
  members,
  title,
}: {
  action: (prev: CreateSessionState, formData: FormData) => Promise<CreateSessionState>;
  categories: { id: string; name: string }[];
  members: { id: string; displayName: string | null }[];
  title: string;
}) {
  const t = useTranslations("admin.sessions");
  const [open, setOpen] = useState(false);
  const regionId = "direct-session-region";
  return (
    <div>
      <Button id="direct-session-toggle" type="button" variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={regionId}>
        {open ? t("directToggleHide") : t("directToggleShow")}
      </Button>
      {open ? (
        <div id={regionId} className="mt-4">
          <h2 className="text-h2 text-fg-heading">{title}</h2>
          <p className="mt-2 text-body-sm text-fg-muted">{t("directIntro")}</p>
          <DirectSessionForm action={action} categories={categories} members={members} />
        </div>
      ) : null}
    </div>
  );
}
