import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { cache } from "react";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { materialSourcePath, proposalMaterialSourcePath } from "@/lib/storage/paths";
import { sniffContent, sniffedKindMatchesDeclared, type SniffedKind } from "@/lib/storage/sniff";
// Contract 3 (DEC-150) — the day set, read only through `sessions'` own module; contract 7 —
// `content` groups the three slots, `sessions` publishes the day set and its label.
import { getSessionHeading, listSessionDays, type SessionDay } from "@/lib/dal/sessions";

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

// DEC-058: uploads are PDF-only from Launch. `powerpoint` and `keynote` are
// still values of the Postgres enum (an enum value cannot be dropped, and
// migrations are forward-only) but no upload declares them, the CHECK
// `materials_kind_pdf_only` (0077) refuses them, and finalize_material_upload()
// enqueues a conversion for `pdf` alone.
export const materialKindSchema = z.enum(["pdf", "image", "audio", "video_link", "external_link"]);
export type MaterialKind = z.infer<typeof materialKindSchema>;

const FILE_KINDS = ["pdf", "image", "audio"] as const;
const LINK_KINDS = ["video_link", "external_link"] as const;

export const initiateMaterialUploadInput = z
  .object({
    // REQ-PRO-004: a material belongs to a session XOR a proposal — never both.
    sessionId: z.uuid().optional(),
    proposalId: z.uuid().optional(),
    // REQ-SES-018/DEC-121: sent by the group's own «أضف» the member pressed, never chosen from a
    // field — omitted (or a proposal upload, which has no days) means the whole session. The
    // composite FK (0100) is the authority that a day names a day of THIS session; this is shape
    // only (CLAUDE.md, "Validation").
    sessionDayId: z.uuid().optional(),
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
    if (!val.sessionId === !val.proposalId) {
      ctx.addIssue({ code: "custom", message: "exactly one of sessionId or proposalId is required", path: ["sessionId"] });
    }
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

const DOCUMENT_KINDS = ["pdf"] as const;

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
        session_id: input.sessionId ?? null,
        proposal_id: input.proposalId ?? null,
        session_day_id: input.sessionDayId ?? null,
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
      session_id: input.sessionId ?? null,
      proposal_id: input.proposalId ?? null,
      session_day_id: input.sessionDayId ?? null,
      kind: input.kind,
      title: input.title,
      phase: input.phase,
      added_by: session.memberId,
    })
    .select("id")
    .single();
  if (error) throw new Error(mapMaterialsInsertError(error));

  const versionId = randomUUID();
  const path = input.sessionId
    ? materialSourcePath(session.orgId, input.sessionId, versionId, input.filename!)
    : proposalMaterialSourcePath(session.orgId, input.proposalId!, versionId, input.filename!);
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
  /** REQ-SES-018/DEC-121: absent or null is the whole session — both read the same way
   *  (`item.sessionDayId ?? null`); OPTIONAL, not required, so an existing fixture literal that
   *  predates this field (every one of them, on `main`) still type-checks without editing files
   *  rule 4 asks to stay untouched. A proposal's own material (no session) is always null —
   *  `materials_day_needs_session` (0100) refuses it any other value. */
  sessionDayId?: string | null;
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
    sessionDayId: (row.session_day_id as string | null) ?? null,
  };
}

/** The materials list for a session's event page — `materials_read`'s phase gate (03 §5.5a)
 *  does the actual filtering; this never adds an application-level phase filter on top. */
export async function listMaterials(locale: string, sessionId: string): Promise<MaterialSummary[]> {
  if (!z.uuid().safeParse(sessionId).success) return [];
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase
    .from("materials")
    .select("id, kind, title, phase, allow_download, render_status, font_substitution_warning, external_url, current_version_id, created_at, session_day_id")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`materials: ${error.message}`);
  return (data ?? []).map(toMaterialSummary);
}

/** The org's per-kind upload ceilings (REQ-MAT-009, `org_settings.limit_{document,audio,image}_mb`)
 *  — read here so the uploader can state a size limit BEFORE a file is chosen (`REQ-UIX-024`'s
 *  acceptance), not only learn it from a 413 after the fact. The real control stays
 *  `initiateMaterialUpload`'s own courtesy check and `finalize_material_upload()`'s RPC check
 *  against the REAL byte size — this is advisory, same as `ui/file-drop`'s own header says of
 *  `accept`/`maxBytes`. */
export interface MaterialUploadLimits {
  documentMb: number;
  audioMb: number;
  imageMb: number;
}

export interface MaterialsPageData {
  materials: MaterialSummary[];
  /** REQ-MAT-005/006: can this viewer change `phase`/`allow_download` on THEIR OWN materials?
   *  An admin can manage every material; a presenter only the ones on a session they present —
   *  `canManageAll` covers the admin case, `presenterOfSession` narrows it for everyone else. */
  canManageAll: boolean;
  presenterOfSession: boolean;
  uploadLimits: MaterialUploadLimits;
  /** Contract 3 — every day of the session, in order. `[]` for a session with none (a draft never
   *  scheduled) or a proposal (no `sessionId`, which never calls this). The slot renders flat at
   *  `(days ?? []).length <= 1` (contract 7) — never at "every group happens to be empty right
   *  now". OPTIONAL, not required — same reasoning as `MaterialSummary.sessionDayId` (rule 4): an
   *  existing test fixture that predates T2 has no opinion about days, and "absent" reads the same
   *  as "one day" (`materials-schema.test.ts`'s own suite is proof: it never needed to change). */
  days?: SessionDay[];
  /** The session's own zone, else the org's (`getSessionHeading`) — `dayLabel()`'s weekday reads
   *  the room's clock, not the viewer's (OQ-018). OPTIONAL for the same reason as `days`. */
  timeZone?: string;
}

const DEFAULT_UPLOAD_LIMITS: MaterialUploadLimits = { documentMb: 50, audioMb: 200, imageMb: 20 };
const DEFAULT_TIME_ZONE = "Asia/Riyadh";

/** The event page's `Materials` slot needs the list, whether this viewer may
 *  manage phase/allow_download at all (materials_update_presenter/admin,
 *  0037 — this mirrors that policy for the UI, never replaces it: the
 *  update itself is still checked by RLS regardless of what this returns),
 *  and the org's upload size ceilings for the uploader (`content` §2.3).
 *
 *  ★ Wrapped in React `cache()` (wave 6, `sessions.md` §22.4 R-C3): the page
 *  gates the materials `<section>` on `materialsSummary()` (below), which
 *  needs this same read. */
export const getMaterialsPageData = cache(async (locale: string, sessionId: string): Promise<MaterialsPageData> => {
  if (!z.uuid().safeParse(sessionId).success) {
    return { materials: [], canManageAll: false, presenterOfSession: false, uploadLimits: DEFAULT_UPLOAD_LIMITS, days: [], timeZone: DEFAULT_TIME_ZONE };
  }
  const { session, supabase } = await sessionClient(locale);
  const [materials, { data: presenterRow }, { data: settings }, days, heading] = await Promise.all([
    listMaterials(locale, sessionId),
    supabase.from("session_presenters").select("member_id").eq("session_id", sessionId).eq("member_id", session.memberId).eq("accepted", true).maybeSingle(),
    supabase.from("org_settings").select("limit_document_mb, limit_audio_mb, limit_image_mb").eq("org_id", session.orgId).maybeSingle(),
    listSessionDays(locale, sessionId),
    getSessionHeading(locale, sessionId),
  ]);
  return {
    materials,
    canManageAll: session.role === "admin",
    presenterOfSession: !!presenterRow,
    days,
    timeZone: heading?.timeZone ?? DEFAULT_TIME_ZONE,
    uploadLimits: {
      documentMb: (settings?.limit_document_mb as number | undefined) ?? DEFAULT_UPLOAD_LIMITS.documentMb,
      audioMb: (settings?.limit_audio_mb as number | undefined) ?? DEFAULT_UPLOAD_LIMITS.audioMb,
      imageMb: (settings?.limit_image_mb as number | undefined) ?? DEFAULT_UPLOAD_LIMITS.imageMb,
    },
  };
});

export interface ProposalMaterialsPageData {
  materials: MaterialSummary[];
  /** REQ-PRO-004: the proposer or an accepted co-presenter (`is_proposal_owner_of`,
   *  proposed/content/0009) — this mirrors that policy for the UI, never replaces it. */
  canManage: boolean;
  uploadLimits: MaterialUploadLimits;
}

/** `<ProposalMaterials proposalId memberId locale />`'s data — REQ-PRO-004: draft materials,
 *  visible only to admins and the proposal's own owner until it becomes a session. `materials_
 *  read`'s proposal branch (proposed/content/0009) is what actually filters this — a plain
 *  member's query against a proposal they do not own returns nothing, not an error. */
export async function getProposalMaterialsPageData(locale: string, proposalId: string): Promise<ProposalMaterialsPageData> {
  if (!z.uuid().safeParse(proposalId).success) return { materials: [], canManage: false, uploadLimits: DEFAULT_UPLOAD_LIMITS };
  const { session, supabase } = await sessionClient(locale);

  const [{ data: rows, error }, { data: proposal }, { data: presenterRow }, { data: settings }] = await Promise.all([
    supabase
      .from("materials")
      .select("id, kind, title, phase, allow_download, render_status, font_substitution_warning, external_url, current_version_id, created_at")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: true }),
    supabase.from("proposals").select("proposer_id").eq("id", proposalId).maybeSingle(),
    supabase.from("proposal_presenters").select("member_id").eq("proposal_id", proposalId).eq("member_id", session.memberId).eq("accepted", true).maybeSingle(),
    supabase.from("org_settings").select("limit_document_mb, limit_audio_mb, limit_image_mb").eq("org_id", session.orgId).maybeSingle(),
  ]);
  if (error) throw new Error(`materials: ${error.message}`);

  const isOwner = proposal?.proposer_id === session.memberId || !!presenterRow;
  return {
    materials: (rows ?? []).map(toMaterialSummary),
    canManage: session.role === "admin" || isOwner,
    uploadLimits: {
      documentMb: (settings?.limit_document_mb as number | undefined) ?? DEFAULT_UPLOAD_LIMITS.documentMb,
      audioMb: (settings?.limit_audio_mb as number | undefined) ?? DEFAULT_UPLOAD_LIMITS.audioMb,
      imageMb: (settings?.limit_image_mb as number | undefined) ?? DEFAULT_UPLOAD_LIMITS.imageMb,
    },
  };
}

const materialSettingsInput = z.object({
  materialId: z.uuid(),
  phase: z.enum(["before", "after"]).optional(),
  allowDownload: z.boolean().optional(),
});

/** REQ-MAT-005/006 — a plain RLS-gated update, no RPC: `title`/`phase`/
 *  `allow_download` are the only columns the client column grant covers
 *  (0037), and `materials_update_presenter`/`_admin` are the real
 *  authority — a member who is neither writes nothing (silently, 0 rows —
 *  that is how a non-matching UPDATE behaves, docs/plan/notes/content.md
 *  §1.4a) rather than raising, so this checks the row actually changed. */
export async function updateMaterialSettings(locale: string, input: z.infer<typeof materialSettingsInput>): Promise<boolean> {
  const parsed = materialSettingsInput.parse(input);
  const { supabase } = await sessionClient(locale);
  const patch: Record<string, unknown> = {};
  if (parsed.phase !== undefined) patch.phase = parsed.phase;
  if (parsed.allowDownload !== undefined) patch.allow_download = parsed.allowDownload;
  if (Object.keys(patch).length === 0) return true;
  const { data, error } = await supabase.from("materials").update(patch).eq("id", parsed.materialId).select("id");
  if (error) throw new Error(`materials: ${error.message}`);
  return (data ?? []).length > 0;
}

const rescopeMaterialInput = z.object({ materialId: z.uuid(), sessionDayId: z.uuid().nullable() });

/** REQ-SES-018/DEC-121 — one tap on the item's chip («اليوم الثاني ▾»). `session_day_id` is not in
 *  `updateMaterialSettings`'s column grant on purpose (docs/plan/notes/content.md, wave-9 plan §1):
 *  staff (admin OR moderator) may rescope, which is wider than `materials_update_admin`'s
 *  admin-only reach, so a dedicated RPC keeps that authority from leaking onto `title`/`phase`/
 *  `allow_download` too. `rescope_material()` (proposed/content/0001) re-derives authority itself
 *  and audits the move (`material.rescoped`) — 0052 already audits a phase change for the same
 *  reason: this moves WHEN the material is visible. */
export async function rescopeMaterial(locale: string, input: z.infer<typeof rescopeMaterialInput>): Promise<boolean> {
  const parsed = rescopeMaterialInput.parse(input);
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("rescope_material", { p_material_id: parsed.materialId, p_day_id: parsed.sessionDayId });
  if (error) throw new Error(mapRescopeError(error));
  return true;
}

function mapRescopeError(error: { code?: string; message: string }): string {
  if (error.code === "42501") return "not_authorized";
  if (error.code === "P0002") return "not_found";
  if (error.message.startsWith("day_not_of_session")) return "day_not_of_session";
  return `rescope: ${error.message}`;
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
 *  small and a deck is bounded by the org's document size limit) rather
 *  than one Route Handler per page on scroll — a reasonable v1 given 07 §6's
 *  60-minute page-image expiry; windowed/lazy signing for very large decks
 *  is a follow-up, not a correctness requirement. */
export async function getViewerData(locale: string, materialId: string): Promise<ViewerData | null> {
  if (!z.uuid().safeParse(materialId).success) return null;
  const { supabase } = await sessionClient(locale);

  const [{ data: material, error }] = await Promise.all([
    supabase
      .from("materials")
      .select("id, title, kind, allow_download, render_status, font_substitution_warning, external_url, current_version_id")
      .eq("id", materialId)
      .maybeSingle(),
  ]);
  if (error) throw new Error(`materials: ${error.message}`);
  if (!material) return null;
  const base = {
    id: material.id as string,
    title: material.title as string,
    kind: material.kind as MaterialKind,
    allowDownload: material.allow_download as boolean,
    renderStatus: material.render_status as string,
    fontSubstitutionWarning: (material.font_substitution_warning as string | null) ?? null,
    externalUrl: (material.external_url as string | null) ?? null,
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
