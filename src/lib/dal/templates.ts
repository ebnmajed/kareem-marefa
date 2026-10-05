import "server-only";
import { z } from "zod";
import { BASE_SCHEMA_VERSION, type BrandScheme, type DesignDocument, orientationOf, validateDocument } from "@kareem/designer-runtime";
import { previewBrandBindings } from "@/lib/dal/designer";
import { sessionClient } from "@/lib/dal/session";

// The org's template library — REQ-DSG-007, REQ-DSG-008, REQ-DSG-024,
// REQ-DSG-026, REQ-DSG-035, REQ-ADM-013. SCR-055 (posters and certificates).
//
// ONE LEVEL: THE ORG'S (DEC-254 §3). Every org is seeded with the designed
// baseline as its OWN published, editable templates the moment it is created
// (`seed_org_templates()`, the trigger on `orgs`); there is no platform library
// to read or copy. A template is the org's property, so a later improvement to
// the baseline reaches only orgs created after it.
//
// ★ Every read here names `scope = 'org'` explicitly. Until the removal
// migration runs, `templates_read` still returns the old platform rows; after
// it, it returns a retired platform row an org's certificate or document still
// references (REQ-CRT-014). Neither is a library entry, and neither may be
// listed, counted or copied.
//
// The write clauses of 03 §5.9a (`scope = 'org'`, the caller's own org, an
// admin) are the authority, on the caller's own client.
//
// VERSIONS ARE IMMUTABLE (REQ-DSG-007). An artifact records the version that
// produced it, so publishing v4 must not alter a certificate issued against
// v3. A template is therefore edited through its working DOCUMENT
// (`design_documents.draft_for_template_id`) and published AS the next
// version — same model, same editor, same renderer as a poster.

export type TemplatePurpose = "poster" | "certificate";

/** 06 §3.3's baseline library. The database carries the same list as a check
 *  constraint; this is the order the screens offer them in. */
export const POSTER_FAMILIES = ["talk", "workshop", "panel", "meetup", "announcement"] as const;
export const CERTIFICATE_FAMILIES = ["attendance", "presenter", "achievement"] as const;

export function familiesFor(purpose: TemplatePurpose): readonly string[] {
  return purpose === "poster" ? POSTER_FAMILIES : CERTIFICATE_FAMILIES;
}

export interface TemplateSummary {
  id: string;
  purpose: TemplatePurpose;
  family: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  retired: boolean;
  latestVersion: number | null;
  versionCount: number;
  /** REQ-DSG-024 — how many regions the latest version locks. Shown in the
   *  library because "this template locks its QR and signature block" is
   *  information an admin needs BEFORE duplicating it, not after. */
  lockedRegionCount: number;
  /** The working document, when one exists. Opening a template means opening
   *  this in SCR-057. */
  draftDocumentId: string | null;
  /** An admin's: 03 §5.9a's write clauses say so, and the screen reads it
   *  from here rather than re-deriving the rule. */
  canEdit: boolean;
  /** A certificate's composition, from its latest version's master (DEC-148:
   *  a row is a composition, and the document says which). Null for a poster. */
  orientation: "landscape" | "portrait" | null;
  /** The latest version's document, for the card's live preview. */
  previewDocument: DesignDocument | null;
  /** How many of this org's sessions use the template — a poster bound to any
   *  of its versions, or a certificate pinned to one (`16` §10.3). Counted
   *  under RLS, so it is the caller's own org only. */
  usageCount: number;
}

export interface TemplateLibraryData {
  purpose: TemplatePurpose;
  org: TemplateSummary[];
  canManage: boolean;
  /** The palette the cards preview in: posters are dark (DEC-125); a
   *  certificate library offers both, because a scheme is chosen per session
   *  and is never a row (DEC-148). */
  scheme: BrandScheme;
  /** This org's brand over the platform palette, in that scheme. */
  previewBindings: Record<string, string>;
}

type TemplateRow = {
  id: string;
  purpose: TemplatePurpose;
  family: string;
  name: string;
  description: string | null;
  is_default: boolean;
  retired_at: string | null;
};

type VersionRow = { id: string; template_id: string; version: number; document: unknown };

function lockedRegions(document: unknown): number {
  const layers = (document as { layers?: { locked?: boolean }[] } | null)?.layers ?? [];
  return layers.filter((l) => l.locked === true).length;
}

/** SCR-055 / SCR-056. `null` when the caller is not staff — the page 404s. */
export async function getTemplateLibrary(
  locale: string,
  purpose: TemplatePurpose,
  options: { scheme?: string | null } = {},
): Promise<TemplateLibraryData | null> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin" && session.role !== "moderator") return null;
  const scheme: BrandScheme = purpose === "poster" ? "dark" : options.scheme === "dark" ? "dark" : "light";

  const { data: templates, error } = await supabase
    .from("design_templates")
    .select("id, purpose, family, name, description, is_default, retired_at")
    .eq("scope", "org")
    .eq("purpose", purpose)
    .order("family");
  if (error) throw new Error(`templates: ${error.message}`);

  const ids = (templates ?? []).map((t) => t.id as string);
  const [{ data: versions }, { data: drafts }] = await Promise.all([
    ids.length
      ? supabase.from("design_template_versions").select("id, template_id, version, document").in("template_id", ids).order("version")
      : Promise.resolve({ data: [] as VersionRow[] }),
    ids.length
      ? supabase.from("design_documents").select("id, draft_for_template_id").in("draft_for_template_id", ids)
      : Promise.resolve({ data: [] as { id: string; draft_for_template_id: string }[] }),
  ]);

  const byTemplate = new Map<string, VersionRow[]>();
  for (const v of (versions ?? []) as VersionRow[]) {
    byTemplate.set(v.template_id, [...(byTemplate.get(v.template_id) ?? []), v]);
  }
  const draftFor = new Map<string, string>();
  for (const d of (drafts ?? []) as { id: string; draft_for_template_id: string }[]) draftFor.set(d.draft_for_template_id, d.id);

  // Usage: the sessions of THIS org using any version of each template. RLS
  // scopes both reads to the caller's org.
  const versionToTemplate = new Map<string, string>();
  for (const v of (versions ?? []) as VersionRow[]) versionToTemplate.set(v.id, v.template_id);
  const versionIds = [...versionToTemplate.keys()];
  const sessionsByTemplate = new Map<string, Set<string>>();
  if (versionIds.length) {
    const { data: uses } =
      purpose === "poster"
        ? await supabase.from("design_documents").select("template_version_id, bound_session_id").in("template_version_id", versionIds).not("bound_session_id", "is", null)
        : await supabase.from("certificates").select("template_version_id, session_id").in("template_version_id", versionIds).not("session_id", "is", null);
    for (const use of (uses ?? []) as Array<{ template_version_id: string; bound_session_id?: string; session_id?: string }>) {
      const template = versionToTemplate.get(use.template_version_id);
      const sessionId = use.bound_session_id ?? use.session_id;
      if (!template || !sessionId) continue;
      sessionsByTemplate.set(template, (sessionsByTemplate.get(template) ?? new Set()).add(sessionId));
    }
  }

  const summarise = (t: TemplateRow): TemplateSummary => {
    const list = byTemplate.get(t.id) ?? [];
    const latest = list[list.length - 1];
    return {
      id: t.id,
      purpose: t.purpose,
      family: t.family,
      name: t.name,
      description: t.description,
      isDefault: t.is_default,
      retired: t.retired_at !== null,
      latestVersion: latest?.version ?? null,
      versionCount: list.length,
      lockedRegionCount: latest ? lockedRegions(latest.document) : 0,
      draftDocumentId: draftFor.get(t.id) ?? null,
      canEdit: session.role === "admin",
      orientation: t.purpose === "certificate" && latest ? orientationOf(latest.document as DesignDocument) : null,
      previewDocument: latest ? (validateDocument(latest.document).ok ? (latest.document as DesignDocument) : null) : null,
      usageCount: sessionsByTemplate.get(t.id)?.size ?? 0,
    };
  };

  const rows = (templates ?? []) as TemplateRow[];
  const byOrientation = (a: TemplateSummary, b: TemplateSummary) => Number(b.isDefault) - Number(a.isDefault) || (a.orientation ?? "").localeCompare(b.orientation ?? "");
  return {
    purpose,
    org: rows.map(summarise).sort(byOrientation),
    canManage: session.role === "admin",
    scheme,
    previewBindings: await previewBrandBindings(locale, scheme),
  };
}

/* ── writes ─────────────────────────────────────────────────────────────── */

export const templateNameSchema = z.string().trim().min(1).max(120);

export const duplicateInput = z.object({ sourceTemplateId: z.uuid(), name: templateNameSchema });
export const createBlankInput = z.object({
  purpose: z.enum(["poster", "certificate"]),
  family: z.string().min(1).max(40),
  name: templateNameSchema,
  /** A certificate is a landscape or a portrait COMPOSITION (DEC-148); a
   *  blank one starts on the page it will be exported at. */
  orientation: z.enum(["landscape", "portrait"]).optional(),
});

/** `last_template` — the database refused to retire the org's last live published template of a family the code
 *  falls back on (`design_templates_keep_one_live`, DEC-255 D6): issuance or the automatic poster would have nothing. */
export type TemplateWriteFailure = { status: "not_authorized" } | { status: "invalid"; message: string } | { status: "last_template" };
export type TemplateWriteResult = { status: "ok"; templateId: string } | TemplateWriteFailure;
export type PublishResult = { status: "ok"; version: number } | TemplateWriteFailure;

/** A blank document: RTL, brand-token background, no layers. Never a hex
 *  literal — the template guard (0055) refuses one, and the requirement is
 *  that a colour lives in the brand kit (REQ-DSG-021). */
function blankDocument(purpose: TemplatePurpose, orientation: "landscape" | "portrait" = "landscape"): DesignDocument {
  const master =
    purpose === "poster" ? { width: 1080, height: 1350 } : orientation === "portrait" ? { width: 2480, height: 3508 } : { width: 3508, height: 2480 };
  return {
    // The version it needs, never the newest the renderer knows (D2b): a blank
    // template must render on `main`'s worker too.
    schemaVersion: BASE_SCHEMA_VERSION,
    purpose,
    master: { ...master, unit: "px", dpi: purpose === "poster" ? 72 : 300 },
    // RTL is the source composition (D5). LTR is the mirror, never the other
    // way round — an editor that is LTR-first with an RTL toggle produces
    // templates that are LTR-first with an RTL toggle.
    direction: "rtl",
    background: { type: "solid", color: "{{brand.canvas}}" },
    layers: [],
  };
}

/**
 * REQ-DSG-008 — copy one of the org's OWN templates.
 *
 * A COPY, not a reference: the new template's version 1 carries the source's
 * latest document as it stands today, and a later edit of either never
 * reaches the other. Three writes on the caller's own client, so
 * `templates_write_org` and `template_versions_insert_org` are the authority;
 * a moderator's call matches no policy and returns `not_authorized` rather
 * than half a template. ★ The source must be `scope = 'org'`: a retired
 * platform row a certificate still references is readable (REQ-CRT-014), and
 * it is not a library entry anyone may copy (DEC-254 §3.4).
 */
export async function duplicateTemplate(locale: string, input: z.infer<typeof duplicateInput>): Promise<TemplateWriteResult> {
  const { session, supabase } = await sessionClient(locale);

  const { data: source } = await supabase
    .from("design_templates")
    .select("id, purpose, family, description")
    .eq("id", input.sourceTemplateId)
    .eq("scope", "org")
    .maybeSingle();
  if (!source) return { status: "not_authorized" };

  const { data: latest } = await supabase
    .from("design_template_versions")
    .select("document, dynamic_fields, safe_areas, font_hashes")
    .eq("template_id", input.sourceTemplateId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("design_templates")
    .insert({
      org_id: session.orgId,
      scope: "org",
      purpose: source.purpose,
      family: source.family,
      name: input.name,
      description: source.description,
      duplicated_from: source.id,
      created_by: session.memberId,
    })
    .select("id")
    .maybeSingle();
  if (error || !created) return { status: "not_authorized" };

  const document = latest?.document ?? blankDocument(source.purpose as TemplatePurpose);
  const { error: versionError } = await supabase.from("design_template_versions").insert({
    template_id: created.id,
    version: 1,
    document,
    dynamic_fields: latest?.dynamic_fields ?? [],
    safe_areas: latest?.safe_areas ?? {},
    font_hashes: latest?.font_hashes ?? [],
    published_at: new Date().toISOString(),
    published_by: session.memberId,
  });
  if (versionError) return { status: "invalid", message: versionError.message };

  return { status: "ok", templateId: created.id as string };
}

/** REQ-DSG-008 — start blank. Version 1 is published immediately so the
 *  template has something an artifact could reference from the first minute. */
export async function createBlankTemplate(locale: string, input: z.infer<typeof createBlankInput>): Promise<TemplateWriteResult> {
  const { session, supabase } = await sessionClient(locale);

  const { data: created, error } = await supabase
    .from("design_templates")
    .insert({ org_id: session.orgId, scope: "org", purpose: input.purpose, family: input.family, name: input.name, created_by: session.memberId })
    .select("id")
    .maybeSingle();
  // 23514 is the family/purpose check: a certificate template cannot be a
  // `talk` (06 §3.3), and the message names which.
  if (error) return error.code === "23514" ? { status: "invalid", message: error.message } : { status: "not_authorized" };
  if (!created) return { status: "not_authorized" };

  const { error: versionError } = await supabase.from("design_template_versions").insert({
    template_id: created.id,
    version: 1,
    document: blankDocument(input.purpose, input.orientation),
    published_at: new Date().toISOString(),
    published_by: session.memberId,
  });
  if (versionError) return { status: "invalid", message: versionError.message };

  return { status: "ok", templateId: created.id as string };
}

/** The working document a template is edited through. Created on first open,
 *  from the latest version, so an admin never faces an empty editor. */
export async function openTemplateDraft(locale: string, templateId: string): Promise<{ documentId: string } | { status: "not_authorized" }> {
  const { session, supabase } = await sessionClient(locale);

  const { data: existing } = await supabase.from("design_documents").select("id").eq("draft_for_template_id", templateId).maybeSingle();
  if (existing) return { documentId: existing.id as string };

  const { data: template } = await supabase.from("design_templates").select("id, scope, purpose").eq("id", templateId).maybeSingle();
  // REQ-DSG-008: only the org's own template is edited. A retired platform row
  // still readable for a certificate's sake (REQ-CRT-014) is refused here
  // rather than letting the insert succeed and the UPDATE silently match no row.
  if (!template || template.scope !== "org") return { status: "not_authorized" };

  const { data: latest } = await supabase
    .from("design_template_versions")
    .select("id, document")
    .eq("template_id", templateId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("design_documents")
    .insert({
      org_id: session.orgId,
      template_version_id: latest?.id ?? null,
      purpose: template.purpose,
      document: latest?.document ?? blankDocument(template.purpose as TemplatePurpose),
      draft_for_template_id: templateId,
      updated_by: session.memberId,
    })
    .select("id")
    .maybeSingle();
  if (error || !created) return { status: "not_authorized" };

  return { documentId: created.id as string };
}

/**
 * REQ-DSG-007 — publish the draft as the next version.
 *
 * The new version never alters an existing artifact: an artifact references a
 * `template_version_id`, so a certificate issued against v3 renders as v3
 * forever. That is the whole mechanism behind REQ-CRT-014, and it works
 * because nothing here touches the previous row.
 */
export async function publishTemplateVersion(locale: string, templateId: string): Promise<PublishResult> {
  const { session, supabase } = await sessionClient(locale);

  const { data: draft } = await supabase.from("design_documents").select("id, document").eq("draft_for_template_id", templateId).maybeSingle();
  if (!draft) return { status: "not_authorized" };

  const parsed = validateDocument(draft.document);
  if (!parsed.ok) return { status: "invalid", message: parsed.issues.map((i) => `${i.path}:${i.code}`).join(", ") };

  const { data: latest } = await supabase
    .from("design_template_versions")
    .select("version")
    .eq("template_id", templateId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = ((latest?.version as number | undefined) ?? 0) + 1;

  const { error } = await supabase.from("design_template_versions").insert({
    template_id: templateId,
    version,
    document: parsed.document,
    font_hashes: [...new Set(parsed.document.layers.flatMap((l) => ("font" in l && l.font.hash ? [l.font.hash] : [])))],
    published_at: new Date().toISOString(),
    published_by: session.memberId,
  });
  if (error) return error.code === "22023" ? { status: "invalid", message: error.message } : { status: "not_authorized" };

  return { status: "ok", version };
}

/** REQ-DSG-002 — which template the automatic poster path binds to. */
export async function setDefaultTemplate(locale: string, templateId: string): Promise<TemplateWriteResult> {
  const { supabase } = await sessionClient(locale);
  // One statement: `design_templates_single_default` clears the previous one
  // inside the same transaction, so a family is never left with no default.
  const { data } = await supabase.from("design_templates").update({ is_default: true }).eq("id", templateId).select("id").maybeSingle();
  return data ? { status: "ok", templateId: data.id as string } : { status: "not_authorized" };
}

export async function renameTemplate(locale: string, templateId: string, name: string): Promise<TemplateWriteResult> {
  const parsed = templateNameSchema.safeParse(name);
  if (!parsed.success) return { status: "invalid", message: "name" };
  const { supabase } = await sessionClient(locale);
  const { data } = await supabase.from("design_templates").update({ name: parsed.data }).eq("id", templateId).select("id").maybeSingle();
  return data ? { status: "ok", templateId: data.id as string } : { status: "not_authorized" };
}

/** Retired, never deleted: an artifact records the version that produced it,
 *  and a template whose row is gone cannot explain a poster already printed.
 *  ★ The database refuses to retire the org's last live template of a family
 *  the code falls back on (`last_live_template`, DEC-255 D6); that answer is
 *  `last_template`, so the screen can say why. */
export async function retireTemplate(locale: string, templateId: string, retired: boolean): Promise<TemplateWriteResult> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("design_templates")
    .update({ retired_at: retired ? new Date().toISOString() : null, ...(retired ? { is_default: false } : {}) })
    .eq("id", templateId)
    .select("id")
    .maybeSingle();
  if (error?.message.includes("last_live_template")) return { status: "last_template" };
  return data ? { status: "ok", templateId: data.id as string } : { status: "not_authorized" };
}

/** wave 23 (SCR-055), add-only — the org's name for a card's preview. The boards draw a certificate with the org's own
 *  name and every other bound field as `{label}`; the name is the one field the library already knows. */
export async function getOrgPreviewName(locale: string): Promise<string | null> {
  const { session, supabase } = await sessionClient(locale);
  const { data } = await supabase.from("orgs").select("name").eq("id", session.orgId).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}
