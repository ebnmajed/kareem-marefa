import "server-only";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requirePlatformAdmin, type PlatformWriteResult } from "@/lib/dal/platform";

// SCR-083's data access — REQ-DSG-008, DEC-052.
//
// ★ MANAGED, NOT AUTHORED. A super admin has no org and the designer's editor
// is org-scoped, so there is no authoring path here and there is not meant to
// be one: a platform template is either shipped by migration (the A27 baseline,
// `0061`) or promoted from an org's PUBLISHED version, which is a copy that no
// later org edit reaches (`REQ-DSG-008`). Everything on this screen is list,
// promote, set-default and retire.
//
// It lives beside the rest of the platform DAL rather than being appended to
// `src/lib/dal/templates.ts`: every read here goes through a definer RPC gated
// on `platform_admins`, and `templates.ts` is built on `sessionClient()`, which
// a super admin — who has no member row — can never satisfy. Sharing the file
// would mean two incompatible gates in one module.
//
// There is no preview and no document on this screen. `promote_template_to_platform()`
// copies the document server-side without ever handing it to the caller, which
// is what keeps "managed" from quietly becoming "can read every org's designs".

export interface PlatformTemplate {
  id: string;
  purpose: "poster" | "certificate";
  family: string;
  name: string;
  isDefault: boolean;
  retiredAt: string | null;
  versions: number;
  createdAt: string;
}

export async function listPlatformTemplates(locale: string): Promise<PlatformTemplate[]> {
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("platform_template_library");
  if (error || !data) return [];
  return (data as {
    id: string;
    purpose: "poster" | "certificate";
    family: string;
    name: string;
    is_default: boolean;
    retired_at: string | null;
    versions: number;
    created_at: string;
  }[]).map((r) => ({
    id: r.id,
    purpose: r.purpose,
    family: r.family,
    name: r.name,
    isDefault: r.is_default,
    retiredAt: r.retired_at,
    versions: r.versions,
    createdAt: r.created_at,
  }));
}

export interface PromotableVersion {
  versionId: string;
  templateId: string;
  orgId: string;
  orgName: string;
  purpose: "poster" | "certificate";
  family: string;
  name: string;
  version: number;
  publishedAt: string;
  alreadyPromoted: boolean;
}

/**
 * The promotion candidates: published org versions, by identity alone. The RPC
 * returns no document and no author (see the file header of
 * `supabase/proposed/platform/0003_platform_library.sql` for why this door
 * exists at all and what it deliberately does not open).
 */
export async function listPromotableVersions(locale: string, orgId?: string): Promise<PromotableVersion[]> {
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("platform_promotable_versions", { p_org: orgId ?? null });
  if (error || !data) return [];
  return (data as {
    version_id: string;
    template_id: string;
    org_id: string;
    org_name: string;
    purpose: "poster" | "certificate";
    family: string;
    name: string;
    version: number;
    published_at: string;
    already_promoted: boolean;
  }[]).map((r) => ({
    versionId: r.version_id,
    templateId: r.template_id,
    orgId: r.org_id,
    orgName: r.org_name,
    purpose: r.purpose,
    family: r.family,
    name: r.name,
    version: r.version,
    publishedAt: r.published_at,
    alreadyPromoted: r.already_promoted,
  }));
}

export const promoteInput = z.object({
  versionId: z.uuid(),
  name: z.string().trim().min(1).max(120).optional(),
});

export async function promoteTemplate(locale: string, input: z.infer<typeof promoteInput>): Promise<PlatformWriteResult> {
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("promote_template_to_platform", {
    p_version: input.versionId,
    p_name: input.name ?? null,
  });
  if (error) return mapError(error);
  return { status: "ok", id: data as string };
}

/**
 * DEC-052: the baseline never falls below one default per purpose, so the RPC
 * refuses the last one with `last_platform_default`. A library that can be
 * retired to empty is a library that breaks a new org's first day.
 */
export async function retirePlatformTemplate(locale: string, templateId: string, retired: boolean): Promise<PlatformWriteResult> {
  if (!z.uuid().safeParse(templateId).success) return { status: "failed", message: "failed" };
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("retire_platform_template", { p_template: templateId, p_retired: retired });
  return error ? mapError(error) : { status: "ok" };
}

export async function setPlatformTemplateDefault(locale: string, templateId: string): Promise<PlatformWriteResult> {
  if (!z.uuid().safeParse(templateId).success) return { status: "failed", message: "failed" };
  await requirePlatformAdmin(locale);
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_platform_template_default", { p_template: templateId });
  return error ? mapError(error) : { status: "ok" };
}

function mapError(error: { message?: string } | null): PlatformWriteResult {
  const raw = error?.message ?? "";
  const known = [
    "not_platform_admin",
    "version_not_found",
    "version_not_published",
    "already_platform",
    "template_not_found",
    "template_retired",
    "last_platform_default",
  ].find((k) => raw.includes(k));
  return { status: "failed", message: known ?? "failed" };
}
