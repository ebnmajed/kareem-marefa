"use server";

import { revalidatePath } from "next/cache";
import { promoteInput, promoteTemplate, retirePlatformTemplate, setPlatformTemplateDefault } from "@/lib/dal/platform-templates";
import type { Locale } from "@/i18n/routing";

// SCR-083's Server Actions — REQ-DSG-008, DEC-052.
//
// There is no create, no edit and no delete here, and that is the requirement
// rather than an omission: a platform template is shipped by migration or
// promoted by copy, and an org cannot edit one in place either (0055's
// `templates_update_org` carries `scope = 'org'` in its USING clause).

export type LibraryState = { error: string | null; ok: boolean };

export async function promoteAction(locale: Locale, versionId: string, _prev: LibraryState, formData: FormData): Promise<LibraryState> {
  const name = formData.get("name")?.toString().trim();
  const parsed = promoteInput.safeParse({ versionId, name: name ? name : undefined });
  if (!parsed.success) return { error: "invalid", ok: false };

  const result = await promoteTemplate(locale, parsed.data);
  if (result.status === "failed") return { error: result.message, ok: false };
  revalidatePath(`/${locale}/app/platform/templates`);
  return { error: null, ok: true };
}

export async function retireAction(locale: Locale, templateId: string, retired: boolean): Promise<void> {
  await retirePlatformTemplate(locale, templateId, retired);
  revalidatePath(`/${locale}/app/platform/templates`);
}

export async function setDefaultAction(locale: Locale, templateId: string): Promise<void> {
  await setPlatformTemplateDefault(locale, templateId);
  revalidatePath(`/${locale}/app/platform/templates`);
}
