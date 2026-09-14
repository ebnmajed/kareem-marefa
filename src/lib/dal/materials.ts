import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { materialSourcePath } from "@/lib/storage/paths";
import { sniffContent, sniffedKindMatchesDeclared, type SniffedKind } from "@/lib/storage/sniff";

// Materials — REQ-MAT-001 … REQ-MAT-012, 02 §4.6, 03 §5.5a, 07 §1/§2.
//
// The upload flow is two Route Handlers, not a Server Action (CLAUDE.md:
// uploads are Route Handlers; the 1 MB body cap is beside the point here —
// bytes go straight to Storage, never through this process at all):
//
//   POST /api/upload/material           → initiateMaterialUpload()
//   POST /api/upload/material/complete  → completeMaterialUpload()
//
// Authorisation for the write itself is the RLS policy on `materials`
// (`p8_presenter_write`) and the `finalize_material_upload()` RPC's own
// re-derivation (proposed/content/0003) — this module's checks are shape,
// never authority (CLAUDE.md, "Validation").

export const materialKindSchema = z.enum(["pdf", "powerpoint", "keynote", "image", "audio", "video_link", "external_link"]);
export type MaterialKind = z.infer<typeof materialKindSchema>;

const FILE_KINDS = ["pdf", "powerpoint", "keynote", "image", "audio"] as const;
const LINK_KINDS = ["video_link", "external_link"] as const;

export const initiateMaterialUploadInput = z
  .object({
    sessionId: z.uuid(),
    kind: materialKindSchema,
    title: z.string().trim().min(1).max(200),
    phase: z.enum(["before", "after"]).default("after"),
    // File kinds only — the ACTUAL type is never trusted from here (REQ-MAT-012); this is only
    // used to shape the storage path and the courtesy pre-check against the org's size limit.
    filename: z.string().trim().min(1).max(255).optional(),
    declaredByteSize: z
      .number()
      .int()
      .positive()
      .max(500 * 1024 * 1024)
      .optional(),
    // Link kinds only.
    externalUrl: z.url().optional(),
  })
  .superRefine((val, ctx) => {
    const isFile = (FILE_KINDS as readonly string[]).includes(val.kind);
    const isLink = (LINK_KINDS as readonly string[]).includes(val.kind);
    if (isFile) {
      if (!val.filename) ctx.addIssue({ code: "custom", message: "filename is required for this kind", path: ["filename"] });
      if (!val.declaredByteSize) ctx.addIssue({ code: "custom", message: "declaredByteSize is required for this kind", path: ["declaredByteSize"] });
      if (val.externalUrl) ctx.addIssue({ code: "custom", message: "externalUrl is not accepted for this kind", path: ["externalUrl"] });
    }
    if (isLink) {
      if (!val.externalUrl) ctx.addIssue({ code: "custom", message: "externalUrl is required for this kind", path: ["externalUrl"] });
      if (val.filename || val.declaredByteSize) ctx.addIssue({ code: "custom", message: "no file is accepted for this kind", path: ["filename"] });
    }
  });

export type InitiateMaterialUploadInput = z.infer<typeof initiateMaterialUploadInput>;

export interface InitiatedUpload {
  materialId: string;
  /** Present only for file kinds — link kinds are complete after the one insert. */
  upload: { versionId: string; bucket: "materials"; path: string; signedUrl: string; token: string } | null;
}

const DOCUMENT_KINDS = ["pdf", "powerpoint", "keynote"] as const;

function orgLimitColumn(kind: MaterialKind): "limit_document_mb" | "limit_audio_mb" | "limit_image_mb" | null {
  if ((DOCUMENT_KINDS as readonly string[]).includes(kind)) return "limit_document_mb";
  if (kind === "audio") return "limit_audio_mb";
  if (kind === "image") return "limit_image_mb";
  return null;
}

/** REQ-MAT-001/002/009: creates the material, and for file kinds a signed upload URL under a
 *  freshly minted version id. Link kinds need no upload — they are ready immediately. */
export async function initiateMaterialUpload(locale: string, input: InitiateMaterialUploadInput): Promise<InitiatedUpload> {
  const { session, supabase } = await sessionClient(locale);

  if (input.externalUrl !== undefined) {
    const { data, error } = await supabase
      .from("materials")
      .insert({
        org_id: session.orgId,
        session_id: input.sessionId,
        kind: input.kind,
        title: input.title,
        phase: input.phase,
        external_url: input.externalUrl,
        render_status: "not_applicable",
        added_by: session.memberId,
      })
      .select("id")
      .single();
    if (error) throw new Error(mapMaterialsInsertError(error));
    return { materialId: data.id as string, upload: null };
  }

  // File kind: check the org's own limit for this kind BEFORE minting a URL — a courtesy
  // rejection that saves a doomed upload, never the control (REQ-MAT-009's control is the
  // RPC's own check in supabase/proposed/content/0003, against the REAL byte size).
  const limitColumn = orgLimitColumn(input.kind);
  if (limitColumn) {
    const { data: settings, error: settingsError } = await supabase.from("org_settings").select(limitColumn).eq("org_id", session.orgId).single();
    if (settingsError) throw new Error(`org_settings: ${settingsError.message}`);
    const limitMb = (settings as Record<string, number>)[limitColumn];
    if (input.declaredByteSize! > limitMb * 1024 * 1024) {
      throw new Error(`file_too_large:${limitMb}`);
    }
  }

  const { data: material, error } = await supabase
    .from("materials")
    .insert({
      org_id: session.orgId,
      session_id: input.sessionId,
      kind: input.kind,
      title: input.title,
      phase: input.phase,
      added_by: session.memberId,
    })
    .select("id")
    .single();
  if (error) throw new Error(mapMaterialsInsertError(error));

  const versionId = randomUUID();
  const path = materialSourcePath(session.orgId, input.sessionId, versionId, input.filename!);
  const { data: signed, error: signError } = await supabase.storage.from("materials").createSignedUploadUrl(path);
  if (signError || !signed) throw new Error(`storage: ${signError?.message ?? "could not sign an upload URL"}`);

  return {
    materialId: material.id as string,
    upload: { versionId, bucket: "materials", path, signedUrl: signed.signedUrl, token: signed.token },
  };
}

function mapMaterialsInsertError(error: { code?: string; message: string }): string {
  // p8_presenter_write's `with check` failing surfaces as 42501 — a member who is
  // not this session's presenter or an org admin.
  if (error.code === "42501") return "not_authorized";
  return `materials: ${error.message}`;
}

export interface CompletedUpload {
  versionId: string;
  version: number;
  renderStatus: string;
  sniffedMime: string;
}

/** REQ-MAT-012: the version is only ever recorded — and only ever becomes retrievable —
 *  once the STORED BYTES have been sniffed and found to match the declared kind. A
 *  mismatch (an SVG named `.png`, a truncated upload, a completely different format)
 *  deletes the object and returns without ever calling finalize_material_upload(). */
export async function completeMaterialUpload(
  locale: string,
  input: { materialId: string; path: string; declaredKind: Exclude<MaterialKind, "video_link" | "external_link"> },
): Promise<CompletedUpload> {
  const { supabase } = await sessionClient(locale);

  const { data: blob, error: downloadError } = await supabase.storage.from("materials").download(input.path);
  if (downloadError || !blob) throw new Error(`storage: ${downloadError?.message ?? "the uploaded object was not found"}`);

  const buf = new Uint8Array(await blob.arrayBuffer());
  const sniffed = sniffContent(buf);

  if (!sniffedKindMatchesDeclared(sniffed.kind, input.declaredKind)) {
    await supabase.storage.from("materials").remove([input.path]); // never retrievable (REQ-MAT-012)
    throw new Error(`sniff_mismatch:${sniffed.kind}`);
  }

  const sha256 = createHash("sha256").update(buf).digest("hex");

  const { data, error } = await supabase
    .rpc("finalize_material_upload", {
      p_material_id: input.materialId,
      p_storage_path: input.path,
      p_byte_size: buf.byteLength,
      p_sniffed_mime: sniffed.mime,
      p_sha256: sha256,
    })
    .single();
  if (error) throw new Error(mapFinalizeError(error));

  const row = data as { id: string; version: number; sniffed_mime: string };
  const { data: material } = await supabase.from("materials").select("render_status").eq("id", input.materialId).single();

  return { versionId: row.id, version: row.version, renderStatus: (material?.render_status as string) ?? "pending", sniffedMime: row.sniffed_mime };
}

function mapFinalizeError(error: { code?: string; message: string }): string {
  if (error.code === "42501") return "not_authorized";
  if (error.message.startsWith("file_too_large")) return error.message;
  if (error.code === "P0002") return "not_found";
  return `finalize_material_upload: ${error.message}`;
}

export interface MaterialSummary {
  id: string;
  kind: MaterialKind;
  title: string;
  phase: "before" | "after";
  allowDownload: boolean;
  renderStatus: string;
  fontSubstitutionWarning: string | null;
  externalUrl: string | null;
  currentVersionId: string | null;
  createdAt: string;
}

function toMaterialSummary(row: Record<string, unknown>): MaterialSummary {
  return {
    id: row.id as string,
    kind: row.kind as MaterialKind,
    title: row.title as string,
    phase: row.phase as "before" | "after",
    allowDownload: row.allow_download as boolean,
    renderStatus: row.render_status as string,
    fontSubstitutionWarning: (row.font_substitution_warning as string | null) ?? null,
    externalUrl: (row.external_url as string | null) ?? null,
    currentVersionId: (row.current_version_id as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

/** The materials list for a session's event page — `materials_read`'s phase gate (03 §5.5a)
 *  does the actual filtering; this never adds an application-level phase filter on top. */
export async function listMaterials(locale: string, sessionId: string): Promise<MaterialSummary[]> {
  if (!z.uuid().safeParse(sessionId).success) return [];
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("materials")
    .select("id, kind, title, phase, allow_download, render_status, font_substitution_warning, external_url, current_version_id, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`materials: ${error.message}`);
  return (data ?? []).map(toMaterialSummary);
}

export interface MaterialsPageData {
  materials: MaterialSummary[];
  numerals: "western" | "arabic_indic";
}

/** The event page's `Materials` slot needs the list plus the org's numeral
 *  setting (REQ-INT-006) for its count line. */
export async function getMaterialsPageData(locale: string, sessionId: string): Promise<MaterialsPageData> {
  if (!z.uuid().safeParse(sessionId).success) return { materials: [], numerals: "western" };
  const { session, supabase } = await sessionClient(locale);
  const [materials, { data: settings }] = await Promise.all([
    listMaterials(locale, sessionId),
    supabase.from("org_settings").select("numerals").eq("org_id", session.orgId).maybeSingle(),
  ]);
  return { materials, numerals: (settings?.numerals as "western" | "arabic_indic" | undefined) ?? "western" };
}

export interface ViewerPage {
  pageNumber: number;
  imageUrl: string;
  thumbnailUrl: string;
}

export interface ViewerData {
  id: string;
  title: string;
  kind: MaterialKind;
  allowDownload: boolean;
  renderStatus: string;
  fontSubstitutionWarning: string | null;
  externalUrl: string | null;
  pages: ViewerPage[];
  numerals: "western" | "arabic_indic";
  /** null for a link kind, or a material with no version yet. */
  currentVersionId: string | null;
}

/** SCR-013, the viewer (REQ-MAT-003). `materials_read`'s phase gate and
 *  `material_pages_storage_read`'s own join back to the same gate (03 §6,
 *  docs/plan/notes/content.md §1.5) are what actually decide whether this
 *  returns anything at all — a phase-gated-out or nonexistent material and
 *  a genuinely absent one are indistinguishable here on purpose (null),
 *  matching the "a moderator gets a 404, not a message" convention already
 *  used elsewhere in this codebase.
 *
 *  Signed URLs for EVERY page are minted up front (page images are
 *  small and a deck is capped at 500 pages by the converter itself) rather
 *  than one Route Handler per page on scroll — a reasonable v1 given 07 §6's
 *  60-minute page-image expiry; windowed/lazy signing for very large decks
 *  is a follow-up, not a correctness requirement. */
export async function getViewerData(locale: string, materialId: string): Promise<ViewerData | null> {
  if (!z.uuid().safeParse(materialId).success) return null;
  const { session, supabase } = await sessionClient(locale);

  const [{ data: material, error }, { data: settings }] = await Promise.all([
    supabase
      .from("materials")
      .select("id, title, kind, allow_download, render_status, font_substitution_warning, external_url, current_version_id")
      .eq("id", materialId)
      .maybeSingle(),
    supabase.from("org_settings").select("numerals").eq("org_id", session.orgId).maybeSingle(),
  ]);
  if (error) throw new Error(`materials: ${error.message}`);
  if (!material) return null;

  const numerals = (settings?.numerals as "western" | "arabic_indic" | undefined) ?? "western";
  const base = {
    id: material.id as string,
    title: material.title as string,
    kind: material.kind as MaterialKind,
    allowDownload: material.allow_download as boolean,
    renderStatus: material.render_status as string,
    fontSubstitutionWarning: (material.font_substitution_warning as string | null) ?? null,
    externalUrl: (material.external_url as string | null) ?? null,
    numerals,
    currentVersionId: (material.current_version_id as string | null) ?? null,
  };

  if (!material.current_version_id || material.render_status !== "ready") {
    return { ...base, pages: [] };
  }

  const { data: pageRows, error: pagesError } = await supabase
    .from("material_pages")
    .select("page_number, image_path, thumbnail_path")
    .eq("material_version_id", material.current_version_id)
    .order("page_number", { ascending: true });
  if (pagesError) throw new Error(`material_pages: ${pagesError.message}`);

  const pages = await Promise.all(
    (pageRows ?? []).map(async (p): Promise<ViewerPage> => {
      const [image, thumb] = await Promise.all([
        supabase.storage.from("material-pages").createSignedUrl(p.image_path as string, 3600),
        supabase.storage.from("material-pages").createSignedUrl(p.thumbnail_path as string, 3600),
      ]);
      return { pageNumber: p.page_number as number, imageUrl: image.data?.signedUrl ?? "", thumbnailUrl: thumb.data?.signedUrl ?? "" };
    }),
  );

  return { ...base, pages };
}

/** REQ-MAT-005: an admin download is always permitted and always audited;
 *  a denied member never receives a URL at all — there is nothing here to
 *  fall back to. Only the `materials` bucket's own storage policy (03 §6),
 *  joined back to `allow_download`, decides — this function does not
 *  duplicate that check, it just asks Storage and lets a denial come back
 *  as no data. */
export async function getMaterialDownloadUrl(locale: string, materialId: string): Promise<string | null> {
  const { session, supabase } = await sessionClient(locale);

  const { data: material } = await supabase.from("materials").select("current_version_id").eq("id", materialId).maybeSingle();
  if (!material?.current_version_id) return null;
  const { data: version } = await supabase.from("material_versions").select("storage_path").eq("id", material.current_version_id).maybeSingle();
  if (!version?.storage_path) return null;

  // REQ-MAT-005: an admin's download is always audited. The app cannot
  // write `audit_log` directly (POL-audit_log.insert) or call write_audit()
  // itself (service_role-only) — record_material_download() is the door,
  // re-deriving admin status itself rather than trusting `session.role`
  // (proposed/content/0005). A presenter downloading their own material
  // skips this call entirely — 03 §6 names only the admin path as audited.
  if (session.role === "admin") {
    const { error: auditError } = await supabase.rpc("record_material_download", { p_material_id: materialId, p_version_id: material.current_version_id });
    if (auditError) return null;
  }

  const { data, error } = await supabase.storage.from("materials").createSignedUrl(version.storage_path as string, 300);
  if (error || !data) return null;
  return data.signedUrl;
}

export type { SniffedKind };
