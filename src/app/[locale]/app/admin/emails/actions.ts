"use server";

import { revalidatePath } from "next/cache";
import { savedState, type SavedFormState } from "@/components/admin/saved-form-state";
import type { Locale } from "@/i18n/routing";
import { blocksToTemplateText, DESIGN_FOR } from "@kareem/mail-runtime";
import { deleteTemplate, getOwnTemplate, saveTemplateChecked, sendTestEmail, type TestSendResult } from "@/lib/dal/notifications";
import { formStateFrom, was, withErrors, withFormError } from "@/lib/form-state";

// SCR-058's Server Actions — REQ-NTF-007, REQ-NTF-009, REQ-NTF-011, the builder's since wave 23 (DEC-238 §4).
//
// The authority is the `notification_templates_validate` trigger (0026, 0133): it refuses a key or channel `08` §1
// does not list and a binding the key does not offer, for every writer. These actions say its refusal where the
// screen can show it and hand back what was sent.
//
// ★ WAVE 23 RETIRED THE STRING EDITOR (DEC-238 §4, Q2). Its three actions — save a string template, convert it,
// adopt a design — are gone: the builder opens every key as a design (a string row as the paragraphs it already sends,
// an untouched key as its platform design), and its one save records where the design came from.

type State = SavedFormState;
const SCREEN = (locale: Locale) => `/${locale}/app/admin/emails`;

/** The confirmation is the screen's; this only deletes the org's row, so the default applies again. */
export async function restoreDefaultTemplate(locale: Locale, templateId: string): Promise<void> {
  await deleteTemplate(locale, templateId);
  revalidatePath(SCREEN(locale));
}

/**
 * `REQ-NTF-009` — «احفظ وفعّل»: save the builder's design. A saved row is what is sent, at once.
 *
 * ★ `body` is written from the blocks, never by the admin. It is the generated text alternative in TEMPLATE form
 * (`REQ-NTF-013`) — one edit, both parts, and they cannot drift because only one of them is authored.
 *
 * ★ PROVENANCE, decided here from what the org had (`0125`'s `source_family`): no row means the admin started from the
 * platform design for this key, so the row records that family; a design row keeps the family it had; a string row
 * (the admin's own words) records none — naming a family would be a false provenance. It used to be cleared on every
 * save after adoption; it no longer is.
 *
 * ★ The saved mark is the `updated_at` the database wrote, read back after the write — never the client's clock.
 */
export async function saveEmailDesign(locale: Locale, previous: State, formData: FormData): Promise<State> {
  const captured = formStateFrom<string>(formData, { fields: ["key", "subject", "blocks"], previous });
  const key = was(captured, "key");
  const subject = was(captured, "subject").trim();
  const raw = was(captured, "blocks");

  if (subject === "") return { ...withErrors(captured, { subject: "subjectRequired" }), formError: "subjectRequired", saved: false };

  let blocks: unknown;
  try {
    blocks = JSON.parse(raw);
  } catch {
    // The builder cannot produce this; a stale tab or a hand-edited request can.
    return { ...withFormError(captured, "blocksUnreadable"), saved: false };
  }

  const body = blocksToTemplateText(blocks);
  if (body.trim() === "") return { ...withFormError(captured, "designEmpty"), saved: false };

  try {
    const own = await getOwnTemplate(locale, key);
    const sourceFamily = own === null ? (DESIGN_FOR[key] ?? null) : own.isDesign ? own.sourceFamily : null;
    const result = await saveTemplateChecked(locale, { key, subject, body, requiredFields: [], blocks, sourceFamily });
    if (!result.ok) {
      if (result.error === "unknown_binding") {
        const refused = withFormError(captured, "unknownBinding");
        return { ...refused, values: { ...refused.values, binding: result.binding }, saved: false };
      }
      const formError = result.error === "unknown_message_key" ? "unknownMessageKey" : result.error === "malformed_blocks" ? "malformedBlocks" : "notPermitted";
      return { ...withFormError(captured, formError), saved: false };
    }
    const after = await getOwnTemplate(locale, key);
    revalidatePath(SCREEN(locale));
    const saved = savedState();
    return { ...saved, values: { ...saved.values, updatedAt: after?.updatedAt ?? "" } };
  } catch {
    return { ...withFormError(captured, "failed"), saved: false };
  }
}

/**
 * `REQ-NTF-011`. Returns the outcome so the screen can say «sent», «too many»
 * or «not permitted» — never throws for a rate limit, which is an answer and
 * not a failure.
 */
export async function sendTestEmailAction(locale: Locale, key: string): Promise<TestSendResult> {
  return sendTestEmail(locale, key);
}
