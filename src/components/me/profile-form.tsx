"use client";

import { useActionState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSummary } from "@/components/ui/form-summary";
import { SubmitButton } from "@/components/ui/submit-button";
import { AlertCircleIcon } from "@/components/ui/icons";
import { hasAttempted, summaryErrors, was } from "@/lib/form-state";
import type { Locale } from "@/i18n/routing";
import type { Company, SelfProfile } from "@/lib/dal/members";
import { saveProfile } from "@/app/[locale]/app/me/actions";
import { emptyProfileState, PROFILE_FIELDS, type ProfileField, type ProfileState } from "@/app/[locale]/app/me/state";

// SCR-021's profile form (REQ-PRF-001), on `sessions`' form primitives.
//
// `FormError` is a local copy of `app/propose/proposal-form.tsx`'s own — a
// whole-form failure has no control to link to, so it is its own alert
// rather than an invented `FormSummary` entry, and the two states are
// mutually exclusive by construction (`saveProfile` returns field errors
// from the Zod branch, `formError` from the catch, never both).
function FormError({ message }: { message: string }) {
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    region.current?.focus();
  }, []);
  return (
    <div
      ref={region}
      role="alert"
      tabIndex={-1}
      className="flex items-start gap-2 rounded-field border border-error-border bg-error-bg p-4 text-caption text-error"
    >
      <AlertCircleIcon className="mt-[0.2em]" />
      <span>{message}</span>
    </div>
  );
}

export function ProfileForm({ locale, me, companies }: { locale: Locale; me: SelfProfile; companies: Company[] }) {
  const t = useTranslations("profile");
  const [state, formAction, pending] = useActionState<ProfileState, FormData>(
    (prev, formData) => saveProfile(locale, prev, formData),
    emptyProfileState,
  );

  // A fresh page load has an empty `state` (no attempt yet): every field
  // falls back to `me`'s real data. A returned round trip — success or
  // failure — echoes exactly what the member submitted, per `lib/form-state`.
  const attempted = hasAttempted(state);
  const value = (field: ProfileField, fallback: string) => (attempted ? was(state, field) : fallback);
  const errorFor = (field: ProfileField) => {
    const key = state.errors[field];
    return key ? t(`errors.${key}`) : undefined;
  };

  // Reuses the form's own top-level labels rather than a second, duplicate
  // namespace — `PROFILE_FIELDS`' names already match `profile.json`'s keys
  // except the two named here.
  const fieldLabel = (field: ProfileField): string => {
    if (field === "companyId") return t("company");
    if (field === "leaderboardOptOut") return t("leaderboardOptOut");
    return t(field);
  };
  const summary = summaryErrors(state, {
    fields: PROFILE_FIELDS,
    label: fieldLabel,
    message: (key) => t(`errors.${key}`),
  });

  return (
    <form action={formAction} noValidate className="mt-8 max-w-xl space-y-5">
      {state.formError ? (
        <FormError key={state.attempt} message={t(`errors.${state.formError}`)} />
      ) : (
        <FormSummary key={state.attempt} title={t("errors.summaryTitle")} errors={summary} />
      )}

      {state.saved && !pending ? (
        <p role="status" className="rounded-field border border-success/30 bg-success-bg p-3 text-body-sm text-fg-heading">
          {t("saved")}
        </p>
      ) : null}

      <Field id="displayName" label={t("displayName")} required error={errorFor("displayName")}>
        <Input name="displayName" required maxLength={120} defaultValue={value("displayName", me.displayName ?? "")} />
      </Field>

      <Field id="companyId" label={t("company")} error={errorFor("companyId")}>
        <Select name="companyId" defaultValue={value("companyId", me.companyId ?? "")}>
          <option value="">{t("companyNone")}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field id="jobTitle" label={t("jobTitle")} error={errorFor("jobTitle")}>
        <Input name="jobTitle" maxLength={120} defaultValue={value("jobTitle", me.jobTitle ?? "")} />
      </Field>

      <Field id="bio" label={t("bio")} hint={t("bioHint")} error={errorFor("bio")}>
        <Textarea name="bio" maxLength={600} defaultValue={value("bio", me.bio ?? "")} />
      </Field>

      <Checkbox
        name="leaderboardOptOut"
        defaultChecked={attempted ? was(state, "leaderboardOptOut") === "on" : me.leaderboardOptOut}
        label={t("leaderboardOptOut")}
      />

      <SubmitButton pendingLabel={t("saving")}>{t("save")}</SubmitButton>
    </form>
  );
}
