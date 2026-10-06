"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { RadioGroup } from "@/components/ui/radio-group";
import { DEFAULT_EVENT_TYPE, EVENT_TYPES, type EventType } from "@/components/sessions/event-type";
import { Field } from "@/components/ui/field";
import { FormSummary } from "@/components/ui/form-summary";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormAlert } from "@/components/admin/form-alert";
import { hasAttempted, summaryErrors, was, wasList } from "@/lib/form-state";
import { emptyCreateState, SESSION_FIELDS, SESSION_REQUIRED_FIELDS, type CreateSessionState, type SessionField } from "./state";

// SCR-042's direct create (`REQ-PRO-007`), written again for wave 21 (`DEC-208`)
// and reached from «جلسة جديدة» (`?new=1`) beside the approved proposals.
//
// ★ No toggle any more: the form is in the server-rendered region, so it works
// without JS (`DEC-228` §3.11) — the old JS-only toggle hid it from a browser
// without scripts. ★ No date, venue or capacity: creating and scheduling are
// two acts (D13/D14) and `directSessionInput` is `.strict()`; a created session
// lands on its الجدولة (`DEC-228` §3.6). Kept: `lib/form-state`'s model —
// `FormSummary` linking each failure to its control's id, values surviving a
// failed round trip, «مطلوب» on the label (`REQ-UIX-009` – `011`), the
// multi-select member combobox (`REQ-UIX-008`), and the field ids the suites
// pin («direct-title» …).

const LABEL_KEY: Record<Exclude<SessionField, "eventType">, string> = {
  title: "titleLabel",
  abstract: "abstractLabel",
  categoryId: "categoryLabel",
  level: "levelLabel",
  language: "languageLabel",
  presenterIds: "presentersLabel",
};

const FIELD_ID: Record<SessionField, string> = {
  // `ui/radio-group`'s fieldset carries `id={name}` — the summary's link lands on its first radio.
  eventType: "eventType",
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
  defaultEventType = DEFAULT_EVENT_TYPE,
}: {
  action: (prev: CreateSessionState, formData: FormData) => Promise<CreateSessionState>;
  categories: { id: string; name: string }[];
  members: { id: string; displayName: string | null }[];
  /** REQ-SES-022: the type «create» was opened for; a talk otherwise. */
  defaultEventType?: EventType;
}) {
  const t = useTranslations("admin.sessions");
  const tType = useTranslations("sessions.eventType");
  // The level labels are `proposals.propose`'s own copy, read (`sessions`' namespace).
  const tp = useTranslations("proposals.propose");
  const [state, formAction, pending] = useActionState(action, emptyCreateState);
  const err = (field: SessionField) => (state.errors[field] ? t(`errors.${state.errors[field]}`) : undefined);
  const required = (field: SessionField) => SESSION_REQUIRED_FIELDS.includes(field);
  const summary = summaryErrors(state, {
    fields: SESSION_FIELDS,
    label: (field) => (field === "eventType" ? tType("label") : t(LABEL_KEY[field])),
    message: (key) => t(`errors.${key}`),
    fieldId: (field) => FIELD_ID[field],
  });

  return (
    // `noValidate`: the app shows its own errors (`16` §8.2).
    <form action={formAction} noValidate className="max-w-2xl space-y-6">
      {hasAttempted(state) ? <FormSummary key={state.attempt} title={t("errorSummaryTitle")} errors={summary} /> : null}
      {state.formError ? <FormAlert>{t(`errors.${state.formError}`)}</FormAlert> : null}

      {/* REQ-SES-022: «نوع الفعالية», the four types, a talk unless chosen. */}
      <RadioGroup
        name="eventType"
        appearance="chips"
        legend={tType("label")}
        defaultValue={was(state, "eventType") || defaultEventType}
        options={EVENT_TYPES.map((type) => ({ value: type, label: tType(type) }))}
        error={err("eventType")}
      />

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
          options={members.map((m) => ({ value: m.id, label: m.displayName ?? "" }))}
          defaultValue={wasList(state, "presenterIds")}
          placeholder={t("presentersPlaceholder")}
        />
      </Field>

      <Button type="submit" pending={pending} pendingLabel={t("creating")}>
        {t("create")}
      </Button>
    </form>
  );
}
