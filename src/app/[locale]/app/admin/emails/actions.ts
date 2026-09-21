"use server";

import { revalidatePath } from "next/cache";
import { savedState, type SavedFormState } from "@/components/admin/saved-form-state";
import type { Locale } from "@/i18n/routing";
import { blocksToTemplateText, SCHEMA_VERSION } from "@kareem/mail-runtime";
import { deleteTemplate, getTemplateSubject, saveTemplateChecked, sendTestEmail, type TestSendResult } from "@/lib/dal/notifications";
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

/**
 * `REQ-NTF-009` — save a BLOCK template.
 *
 * ★ `body` is written from the blocks, never by the admin. It is the generated
 * text alternative in TEMPLATE form (`REQ-NTF-013`), which is also what
 * `main`'s OLD worker renders down its string path in the merge → Railway
 * window (contract 3). One edit, both parts, and they cannot drift because
 * only one of them is authored.
 */
export async function saveEmailDesign(locale: Locale, previous: State, formData: FormData): Promise<State> {
  const captured = formStateFrom<string>(formData, { fields: ["key", "subject", "blocks"], previous });
  const subject = was(captured, "subject").trim();
  const raw = was(captured, "blocks");

  if (subject === "") return { ...withErrors(captured, { subject: "subjectRequired" }), saved: false };

  let blocks: unknown;
  try {
    blocks = JSON.parse(raw);
  } catch {
    // The editor cannot produce this; a stale tab or a hand-edited request can.
    return { ...withFormError(captured, "blocksUnreadable"), saved: false };
  }

  const body = blocksToTemplateText(blocks);
  if (body.trim() === "") return { ...withFormError(captured, "designEmpty"), saved: false };

  try {
    const result = await saveTemplateChecked(locale, {
      key: was(captured, "key"),
      subject,
      body,
      requiredFields: [],
      blocks,
    });
    if (!result.ok) {
      if (result.error === "unknown_binding") {
        const refused = withFormError(captured, "unknownBinding");
        return { ...refused, values: { ...refused.values, binding: result.binding }, saved: false };
      }
      return { ...withFormError(captured, result.error === "unknown_message_key" ? "unknownMessageKey" : "notPermitted"), saved: false };
    }
  } catch {
    return { ...withFormError(captured, "failed"), saved: false };
  }
  revalidatePath(SCREEN(locale));
  return savedState();
}

/**
 * §X9 — «حوّله إلى تصميم». An org's existing STRING override becomes a design
 * whose blocks are one paragraph per paragraph of the body.
 *
 * ★ It uses `toParagraphs()`'s own split — the same one the renderer has always
 * applied — so nothing is lost and nothing is invented, and the mail the org
 * sends today is the mail the design renders tomorrow. The subject is
 * untouched: it lives on the row, not in the document (DEC-161).
 */
export async function convertTemplateToDesign(locale: Locale, key: string, body: string): Promise<void> {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const blocks = paragraphs.map((text, index) => ({ type: "paragraph" as const, id: `p${index + 1}`, text }));
  await saveTemplateChecked(locale, {
    key,
    subject: (await getTemplateSubject(locale, key)) ?? key,
    body: blocksToTemplateText({ schemaVersion: SCHEMA_VERSION, blocks }),
    requiredFields: [],
    blocks: { schemaVersion: SCHEMA_VERSION, blocks },
  });
  revalidatePath(SCREEN(locale));
}


/**
 * `REQ-NTF-011`. Returns the outcome so the screen can say «sent», «too many»
 * or «not permitted» — never throws for a rate limit, which is an answer and
 * not a failure.
 */
export async function sendTestEmailAction(locale: Locale, key: string): Promise<TestSendResult> {
  return sendTestEmail(locale, key);
}
