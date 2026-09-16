import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module may export async functions and nothing else.
//
// ★ Replaces the old `SettingsState = { error: string | null; saved: boolean }`
// — moved onto `lib/form-state`'s shared model for wave 7 (`DEC-137`), same
// as every other rebuilt admin form since wave 6. `saved` is no longer part
// of this state: it travels as `?saved=1` after a successful save
// (`admin/scoring`/`admin/emails`'s own established convention), which is
// also what lets the confirmation survive the fresh `FormState` a
// successful `redirect()` never returns through anyway.

export const SETTINGS_FIELDS = [
  "timeZone",
  "checkInRotationSeconds",
  "checkInGraceSeconds",
  "maxCoPresenters",
  "companyMetric",
  "priorityRsvpHours",
  "limitDocumentMb",
  "limitAudioMb",
  "limitImageMb",
  "limitPosterMb",
  "allowJpegExport",
  "emailFromName",
  "emailReplyTo",
  "ratingMinAggregate",
] as const;
export type SettingsField = (typeof SETTINGS_FIELDS)[number];
export const SETTINGS_REQUIRED_FIELDS: readonly SettingsField[] = [
  "timeZone",
  "checkInRotationSeconds",
  "checkInGraceSeconds",
  "maxCoPresenters",
  "companyMetric",
  "priorityRsvpHours",
  "limitDocumentMb",
  "limitAudioMb",
  "limitImageMb",
  "limitPosterMb",
  "ratingMinAggregate",
];

export type SettingsState = FormState<SettingsField>;
export const emptySettingsState: SettingsState = emptyFormState<SettingsField>();
