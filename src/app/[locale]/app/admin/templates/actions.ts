"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
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
  templateNameSchema,
  type TemplatePurpose,
  type TemplateWriteResult,
} from "@/lib/dal/templates";
import type { TemplateActionKind, TemplateActionState } from "./state";

// SCR-055 · SCR-056. Zod first, then the DAL, which answers on the caller's
// own RLS-bound client: `templates_write_org` and friends are the authority.
//
// Every action's payload is IDS AND A NAME: the document itself never crosses
// an action boundary. Duplicating copies the source's document server-side
// and publishing reads the draft from the database, so nothing here goes near
// the 1 MB action cap that forced the designer's autosave onto a Route
// Handler (`04` §4.2).
//
// They answer with a state the calling control toasts, and revalidate the
// library — never a redirect with a query string. A form's action takes the
// FormData last and no previous state: the client wrapper that hands it to
// `useActionState` drops the state it has no use for. The one exception is
// «عدّل في الاستوديو», which IS a navigation.
//
// `"use server"` modules export async functions and types alone.

const id = z.uuid();
const screen = (locale: string, purpose: TemplatePurpose) => `/${locale}/app/admin/templates/${purpose === "poster" ? "posters" : "certificates"}`;

function answer(locale: string, purpose: TemplatePurpose, result: TemplateWriteResult | { status: "ok" }, kind: TemplateActionKind): TemplateActionState {
  if (result.status === "ok") {
    revalidatePath(screen(locale, purpose));
    return { status: "ok", kind, at: Date.now() };
  }
  return result.status === "not_authorized" ? { status: "not_authorized", at: Date.now() } : { status: "invalid", at: Date.now() };
}

function nameError(raw: unknown): TemplateActionState | null {
  const parsed = templateNameSchema.safeParse(raw);
  if (parsed.success) return null;
  const empty = typeof raw !== "string" || raw.trim() === "";
  return { status: "invalid_field", field: "name", error: empty ? "nameRequired" : "nameTooLong", at: Date.now() };
}

/** REQ-DSG-008 — a copy the org owns; no later platform change reaches it. */
export async function duplicateFromPlatform(locale: string, purpose: TemplatePurpose, sourceTemplateId: string, form: FormData): Promise<TemplateActionState> {
  const name = form.get("name");
  const invalidName = nameError(name);
  if (invalidName) return invalidName;
  const parsed = duplicateInput.safeParse({ sourceTemplateId, name });
  if (!parsed.success) return { status: "invalid", at: Date.now() };
  return answer(locale, purpose, await duplicateTemplate(locale, parsed.data), "duplicated");
}

/** A blank template — and for a certificate, the composition it starts on. */
export async function createTemplate(locale: string, purpose: TemplatePurpose, form: FormData): Promise<TemplateActionState> {
  const name = form.get("name");
  const invalidName = nameError(name);
  if (invalidName) return invalidName;
  const orientation = form.get("orientation");
  const parsed = createBlankInput.safeParse({
    purpose,
    family: form.get("family"),
    name,
    ...(purpose === "certificate" && typeof orientation === "string" ? { orientation } : {}),
  });
  if (!parsed.success) return { status: "invalid", at: Date.now() };
  return answer(locale, purpose, await createBlankTemplate(locale, parsed.data), "created");
}

/** Opens the template's working document in SCR-057, creating it on the first
 *  open from the latest version — so an admin never faces an empty editor. */
export async function editTemplate(locale: string, templateId: string): Promise<TemplateActionState> {
  if (!id.safeParse(templateId).success) return { status: "invalid", at: Date.now() };
  const result = await openTemplateDraft(locale, templateId);
  if ("status" in result) return { status: "not_authorized", at: Date.now() };
  redirect(`/${locale}/app/admin/designer/${result.documentId}`);
}

export async function publishVersion(locale: string, purpose: TemplatePurpose, templateId: string): Promise<TemplateActionState> {
  if (!id.safeParse(templateId).success) return { status: "invalid", at: Date.now() };
  return answer(locale, purpose, await publishTemplateVersion(locale, templateId), "published");
}

export async function makeDefault(locale: string, purpose: TemplatePurpose, templateId: string): Promise<TemplateActionState> {
  if (!id.safeParse(templateId).success) return { status: "invalid", at: Date.now() };
  return answer(locale, purpose, await setDefaultTemplate(locale, templateId), "defaultSet");
}

export async function rename(locale: string, purpose: TemplatePurpose, templateId: string, form: FormData): Promise<TemplateActionState> {
  const name = form.get("name");
  const invalidName = nameError(name);
  if (invalidName) return invalidName;
  if (!id.safeParse(templateId).success) return { status: "invalid", at: Date.now() };
  return answer(locale, purpose, await renameTemplate(locale, templateId, String(name)), "renamed");
}

export async function setRetired(locale: string, purpose: TemplatePurpose, templateId: string, retired: boolean): Promise<TemplateActionState> {
  if (!id.safeParse(templateId).success) return { status: "invalid", at: Date.now() };
  return answer(locale, purpose, await retireTemplate(locale, templateId, retired), retired ? "retired" : "restored");
}
