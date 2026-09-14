"use server";

import { redirect } from "next/navigation";
import {
  createBlankInput,
  createBlankTemplate,
  duplicateInput,
  duplicateTemplate,
  openTemplateDraft,
  publishTemplateVersion,
  renameTemplate,
  retireTemplate,
  setDefaultTemplate,
  type TemplatePurpose,
} from "@/lib/dal/templates";

// SCR-055 · SCR-056. `"use server"` modules export async functions and types
// alone — `npm run build` is the only gate that catches a constant export
// here, so nothing else lives in this file.
//
// Every action's payload is IDS AND A NAME: the document itself never crosses
// an action boundary. Duplicating copies the source's document server-side
// and publishing reads the draft from the database, so nothing here goes near
// the 1 MB action cap that forced the designer's own autosave onto a Route
// Handler (`04` §4.2).

const screen = (purpose: TemplatePurpose) => `/ar/app/admin/templates/${purpose === "poster" ? "posters" : "certificates"}`;

function purposeOf(formData: FormData): TemplatePurpose {
  return formData.get("purpose")?.toString() === "certificate" ? "certificate" : "poster";
}

export async function duplicateFromPlatform(formData: FormData) {
  const purpose = purposeOf(formData);
  const parsed = duplicateInput.safeParse({
    sourceTemplateId: formData.get("templateId")?.toString(),
    name: formData.get("name")?.toString(),
  });
  if (!parsed.success) redirect(`${screen(purpose)}?error=invalid`);

  const result = await duplicateTemplate("ar", parsed.data);
  if (result.status !== "ok") redirect(`${screen(purpose)}?error=${result.status}`);
  redirect(`${screen(purpose)}?done=duplicated`);
}

export async function createTemplate(formData: FormData) {
  const purpose = purposeOf(formData);
  const parsed = createBlankInput.safeParse({
    purpose,
    family: formData.get("family")?.toString(),
    name: formData.get("name")?.toString(),
  });
  if (!parsed.success) redirect(`${screen(purpose)}?error=invalid`);

  const result = await createBlankTemplate("ar", parsed.data);
  if (result.status !== "ok") redirect(`${screen(purpose)}?error=${result.status}`);
  redirect(`${screen(purpose)}?done=created`);
}

/** Opens the template's working document in SCR-057, creating it on the first
 *  open from the latest version — so an admin never faces an empty editor. */
export async function editTemplate(formData: FormData) {
  const purpose = purposeOf(formData);
  const templateId = formData.get("templateId")?.toString() ?? "";
  const result = await openTemplateDraft("ar", templateId);
  if ("status" in result) redirect(`${screen(purpose)}?error=${result.status}`);
  redirect(`/ar/app/admin/designer/${result.documentId}`);
}

export async function publishVersion(formData: FormData) {
  const purpose = purposeOf(formData);
  const templateId = formData.get("templateId")?.toString() ?? "";
  const result = await publishTemplateVersion("ar", templateId);
  if (result.status !== "ok") redirect(`${screen(purpose)}?error=${result.status}`);
  redirect(`${screen(purpose)}?done=published&version=${result.version}`);
}

export async function makeDefault(formData: FormData) {
  const purpose = purposeOf(formData);
  const result = await setDefaultTemplate("ar", formData.get("templateId")?.toString() ?? "");
  if (result.status !== "ok") redirect(`${screen(purpose)}?error=${result.status}`);
  redirect(`${screen(purpose)}?done=defaultSet`);
}

export async function rename(formData: FormData) {
  const purpose = purposeOf(formData);
  const result = await renameTemplate("ar", formData.get("templateId")?.toString() ?? "", formData.get("name")?.toString() ?? "");
  if (result.status !== "ok") redirect(`${screen(purpose)}?error=${result.status}`);
  redirect(`${screen(purpose)}?done=renamed`);
}

export async function toggleRetired(formData: FormData) {
  const purpose = purposeOf(formData);
  const retired = formData.get("retired") === "1";
  const result = await retireTemplate("ar", formData.get("templateId")?.toString() ?? "", retired);
  if (result.status !== "ok") redirect(`${screen(purpose)}?error=${result.status}`);
  redirect(`${screen(purpose)}?done=${retired ? "retired" : "restored"}`);
}
