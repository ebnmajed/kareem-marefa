"use server";

import { revalidatePath } from "next/cache";
import { promoteInput, promoteTemplate, retirePlatformTemplate, setPlatformTemplateDefault } from "@/lib/dal/platform-templates";
import type { Locale } from "@/i18n/routing";
import { emptyFormState, formStateFrom, was, withErrors, withFormError } from "@/lib/form-state";
import type { LibraryActResult, PromoteState } from "./state";

// SCR-083's Server Actions — REQ-DSG-008, DEC-052.
//
// There is no create, no edit and no delete here, and that is the requirement
// rather than an omission: a platform template is shipped by migration or
// promoted by copy, and an org cannot edit one in place either (0055's
// `templates_update_org` carries `scope = 'org'` in its USING clause).
//
// ★ Every act answers (wave 8, notes W8.0 F4/F5). Retiring the last default of
// a purpose used to be refused by the RPC and shown as nothing at all.

export async function promoteAction(locale: Locale, versionId: string, prev: PromoteState, formData: FormData): Promise<PromoteState> {
  const captured = formStateFrom<"name">(formData, { fields: ["name"], previous: prev });
  const name = was(captured, "name").trim();
  const parsed = promoteInput.safeParse({ versionId, name: name ? name : undefined });
  if (!parsed.success) return { ...withErrors(captured, { name: "invalid" }), promoted: false };

  const result = await promoteTemplate(locale, parsed.data);
  if (result.status === "failed") return { ...withFormError(captured, result.message), promoted: false };
  revalidatePath(`/${locale}/app/platform/templates`);
  return { ...emptyFormState<"name">(), promoted: true };
}

export async function retireAction(locale: Locale, templateId: string, retired: boolean): Promise<LibraryActResult> {
  const result = await retirePlatformTemplate(locale, templateId, retired);
  if (result.status === "failed") return { error: result.message };
  revalidatePath(`/${locale}/app/platform/templates`);
  return { error: null };
}

export async function setDefaultAction(locale: Locale, templateId: string): Promise<LibraryActResult> {
  const result = await setPlatformTemplateDefault(locale, templateId);
  if (result.status === "failed") return { error: result.message };
  revalidatePath(`/${locale}/app/platform/templates`);
  return { error: null };
}
