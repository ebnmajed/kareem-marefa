"use server";

import { updateOrgSettings, orgSettingsInput } from "@/lib/dal/admin-settings";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formStateFrom, was, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import { SETTINGS_FIELDS, type SettingsField, type SettingsState } from "./state";

// SCR-063's Server Action (REQ-TEN-008, REQ-INT-006, REQ-MAT-009), onto
// `lib/form-state`'s shared model for wave 7 (`16` §8.2, `DEC-137`). Zod
// first (`orgSettingsInput`, already `.strict()`), then the DAL — no RPC
// here either: `p2_admin_update`'s column grant (0004) already says who may
// write, and `org_settings_history()`'s trigger already audits every column
// on every write regardless of which screen makes it (`lib/dal/
// admin-settings.ts`'s own header).

function errorKey(field: SettingsField, code: string, empty: boolean): string {
  switch (field) {
    case "timeZone":
      return empty ? "timeZoneRequired" : "timeZoneTooLong";
    case "checkInRotationSeconds":
      return "checkInRotationInvalid";
    case "checkInGraceSeconds":
      return "checkInGraceInvalid";
    case "maxCoPresenters":
      return "maxCoPresentersInvalid";
    case "companyMetric":
      return "companyMetricInvalid";
    case "priorityRsvpHours":
      return "priorityRsvpHoursInvalid";
    case "limitDocumentMb":
      return "limitDocumentInvalid";
    case "limitAudioMb":
      return "limitAudioInvalid";
    case "limitImageMb":
      return "limitImageInvalid";
    case "limitPosterMb":
      return "limitPosterInvalid";
    case "emailReplyTo":
      // `orgSettingsInput`'s `emailReplyTo` is `z.email().nullable()` with no
      // length bound — invalid format is its only failure mode.
      return "emailReplyToInvalid";
    case "emailFromName":
      return "emailFromNameTooLong";
    case "ratingMinAggregate":
      return "ratingMinAggregateInvalid";
    default:
      return "failed";
  }
}

export async function saveSettings(locale: Locale, prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const captured = formStateFrom<SettingsField>(formData, { fields: SETTINGS_FIELDS, previous: prev });
  const opt = (v: string) => (v.trim() === "" ? null : v.trim());
  const num = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));

  const raw = {
    timeZone: was(captured, "timeZone"),
    checkInRotationSeconds: num(was(captured, "checkInRotationSeconds")),
    checkInGraceSeconds: num(was(captured, "checkInGraceSeconds")),
    maxCoPresenters: num(was(captured, "maxCoPresenters")),
    companyMetric: was(captured, "companyMetric"),
    priorityRsvpHours: num(was(captured, "priorityRsvpHours")),
    limitDocumentMb: num(was(captured, "limitDocumentMb")),
    limitAudioMb: num(was(captured, "limitAudioMb")),
    limitImageMb: num(was(captured, "limitImageMb")),
    limitPosterMb: num(was(captured, "limitPosterMb")),
    allowJpegExport: was(captured, "allowJpegExport") === "on",
    emailFromName: opt(was(captured, "emailFromName")),
    emailReplyTo: opt(was(captured, "emailReplyTo")),
    ratingMinAggregate: num(was(captured, "ratingMinAggregate")),
  };
  const parsed = orgSettingsInput.safeParse(raw);
  if (!parsed.success) return withErrors(captured, zodErrors<SettingsField>(parsed.error, errorKey, raw));

  const { error } = await updateOrgSettings(locale, parsed.data);
  if (error) return withFormError(captured, "failed");

  // A fresh confirmation travels as `?saved=1` — `admin/scoring`/`admin/
  // emails`'s own established convention — rather than a `done` flag this
  // shared `FormState` shape has no room for. `page.tsx` reads it and hands
  // `SettingsForm` a one-shot toast trigger; the form's own values come back
  // from the revalidated `settings` prop, not from this cleared state.
  return redirect({ href: { pathname: "/app/admin/settings", query: { saved: "1" } }, locale });
}
