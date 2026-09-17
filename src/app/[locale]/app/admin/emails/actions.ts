"use server";

import { revalidatePath } from "next/cache";
import { savedState, type SavedFormState } from "@/components/admin/saved-form-state";
import type { Locale } from "@/i18n/routing";
import { deleteTemplate, saveTemplateChecked } from "@/lib/dal/notifications";
import { formStateFrom, was, withErrors, withFormError } from "@/lib/form-state";

// SCR-058's Server Actions — REQ-NTF-007, on the form model for wave 8 (K6).
//
// The authority is the `notification_templates_validate` trigger (0026): it
// refuses a subject and body that omit a declared required field, and a key
// or channel `08` §1 does not list, for every writer. These actions say its
// refusal at the field it concerns — `saveTemplateChecked()` keeps the field's
// name, which `saveTemplate()` threw away — and hand back what was typed.

type State = SavedFormState;
const SCREEN = (locale: Locale) => `/${locale}/app/admin/emails`;

export async function saveEmailTemplate(locale: Locale, previous: State, formData: FormData): Promise<State> {
  const captured = formStateFrom<string>(formData, { fields: ["key", "subject", "body", "requiredFields"], previous });
  const errors: Record<string, string> = {};
  const subject = was(captured, "subject").trim();
  const body = was(captured, "body").trim();
  const requiredFields = was(captured, "requiredFields")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  if (subject === "") errors.subject = "subjectRequired";
  else if (subject.length > 200) errors.subject = "subjectTooLong";
  if (body === "") errors.body = "bodyRequired";
  else if (body.length > 20000) errors.body = "bodyTooLong";
  if (requiredFields.length > 20 || requiredFields.some((f) => !/^[A-Za-z_][A-Za-z0-9_.]{0,79}$/.test(f))) errors.requiredFields = "requiredFieldsInvalid";
  if (Object.keys(errors).length > 0) return { ...withErrors(captured, errors), saved: false };

  try {
    const result = await saveTemplateChecked(locale, { key: was(captured, "key"), subject, body, requiredFields });
    if (!result.ok) {
      if (result.error === "missing_required_field") {
        const refused = withErrors(captured, { body: "missingRequiredField" });
        // The field's name travels in `values`, the state's one channel for a fact beside a key.
        return { ...refused, values: { ...refused.values, missingField: result.field }, saved: false };
      }
      return { ...withFormError(captured, result.error === "unknown_message_key" ? "unknownMessageKey" : "notPermitted"), saved: false };
    }
  } catch {
    return { ...withFormError(captured, "failed"), saved: false };
  }
  revalidatePath(SCREEN(locale));
  return savedState();
}

/** The confirmation is the screen's; this only deletes the org's row, so the default applies again. */
export async function restoreDefaultTemplate(locale: Locale, templateId: string): Promise<void> {
  await deleteTemplate(locale, templateId);
  revalidatePath(SCREEN(locale));
}
