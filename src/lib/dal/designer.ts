import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  type BindingContext,
  type DesignDocument,
  type BindingOptions,
  declaredBindingsOf,
  type FingerprintSource,
  fingerprintSource,
  resolveBrand,
  type BrandOverrides,
  type BrandScheme,
  PRESETS,
  presetsForDocument,
  resolveCertificateBindings,
  resolveSessionBindings,
  validateDocument,
  type ValidationIssue,
} from "@kareem/designer-runtime";
import { listEditorFaces } from "@/lib/dal/fonts";
import { signDesignAssetUrl } from "@/lib/dal/posters";
import { sessionClient } from "@/lib/dal/session";

// The designer — REQ-DSG-004, REQ-DSG-005, REQ-DSG-006, SCR-057.
//
// One engine over one document model (D54): a poster document and a
// certificate document differ by `purpose` and by which bindings resolve, and
// by nothing else. That is the requirement — «a change to the layer model
// applies to both without a branch» — so there is no poster path and no
// certificate path in this file, only one that binds different data.
//
// Authority is `03` §5.9b and P2, evaluated by Postgres on the caller's own
// RLS-bound client. Nothing here re-derives it: `documents_read` decides what
// comes back and `p2_admin_update` decides whether a save lands. A 404 below
// is this module translating "the policy returned no row" into a shape the
// page can render, not a second opinion about who may look.

export type DesignerPurpose = "poster" | "certificate";

export interface DesignerFont {
  family: string;
  weight: number;
  style: string;
  /** The binary's SHA-256. The editor addresses the face by it and by nothing
   *  else — never a CDN, whose dynamically subset slices are not byte-stable
   *  (REQ-DSG-016, A39). */
  sha256: string;
  /** `passed` alone is selectable (06 §7.2); the rest are listed with their
   *  status so an admin is told why, rather than finding a font missing. */
  parityStatus: "pending" | "passed" | "failed";
}

export interface DesignerDocumentData {
  id: string;
  purpose: DesignerPurpose;
  document: DesignDocument;
  templateVersionId: string | null;
  boundSessionId: string | null;
  boundCertificateId: string | null;
  /** What the editor sends back as `baseUpdatedAt`, so a save that would
   *  overwrite another admin's is refused rather than merged. */
  updatedAt: string;
  /** Layer ids the pinned template version marked locked. The editor refuses
   *  to move, resize, hide or delete them (REQ-DSG-024) — and so does the
   *  database, which is the line that actually holds. */
  lockedLayerIds: string[];
  /** REQ-DSG-006: real data, never lorem ipsum. Latin placeholder text has
   *  none of the properties that break an Arabic layout — no ascending marks,
   *  no cursive joining that changes width, and roughly 0.8× the length of
   *  the Arabic that replaces it (A30). A poster that fits with fake text and
   *  overflows with real text is the NORMAL outcome of previewing with fake
   *  data, which is why this is resolved server-side from the bound row. */
  bindings: Record<string, string>;
  /** Every binding the document names, bound or not — the properties panel
   *  lists them so an unbound field is visible before it is exported. */
  declaredBindings: string[];
  fonts: DesignerFont[];
  canEdit: boolean;
  timeZone: string;
  /** What the document belongs to — the header's title, its badge and the
   *  way back. There is no designer landing page (DEC-141): «back» is the
   *  screen that owns the document. */
  context: DesignerContext;
  /** The palette the preview resolved, and the one an export from this
   *  screen pins (DEC-125, DEC-148 contract 2). */
  scheme: BrandScheme;
}

export type DesignerContext =
  | { kind: "session_poster"; sessionId: string; title: string; binding: "live" | "detached" | null }
  | { kind: "template_draft"; templateId: string; purpose: DesignerPurpose; title: string }
  | { kind: "certificate"; sessionId: string | null; title: string; serial: string }
  | { kind: "unbound"; purpose: DesignerPurpose };

/**
 * The scheme a document previews and exports in (DEC-148, contract 2).
 *
 * A poster is always `dark` (DEC-125). A certificate bound to a certificate row
 * renders the scheme that row pins — `light` until `0003` adds the column,
 * which is true of every certificate issued so far. A certificate template
 * being edited has no scheme of its own (a scheme is never a row), so the
 * editor previews whichever the admin asks for, `light` by default.
 */
export function previewScheme(purpose: DesignerPurpose, requested?: string | null): BrandScheme {
  if (purpose === "poster") return "dark";
  return requested === "dark" ? "dark" : "light";
}

/* ── binding resolution ─────────────────────────────────────────────────── */

type SessionRow = {
  id: string;
  title: string;
  abstract: string | null;
  starts_at: string | null;
  venues: { name: string; address: string | null } | null;
  custom_venue_name: string | null;
  custom_venue_address: string | null;
  time_zone: string | null;
  session_presenters?: { members: { display_name: string } | null; accepted: boolean }[] | null;
};

type CertificateRow = {
  id: string;
  serial: string;
  verification_code: string;
  issued_at: string | null;
  recipient_name_snapshot: string;
};

/** The row shape this module reads, mapped onto the runtime's binding
 *  resolver. The RESOLUTION itself lives in the runtime because the worker
 *  needs the same answer — a preview that is not the artifact is DEC-017
 *  failing quietly. */
function sessionBindings(row: SessionRow | null, options: BindingOptions): Record<string, string> {
  if (!row) return {};
  return resolveSessionBindings(
    {
      id: row.id,
      title: row.title,
      abstract: row.abstract,
      startsAt: row.starts_at,
      timeZone: row.time_zone,
      // A session names a venue from the list OR carries a one-off (0010's
      // own check); the listed venue wins only when there is one.
      venueName: row.venues?.name ?? row.custom_venue_name,
      venueAddress: row.venues?.address ?? row.custom_venue_address,
      presenters: (row.session_presenters ?? []).filter((p) => p.accepted).map((p) => p.members?.display_name ?? ""),
    },
    options,
  );
}

function certificateBindings(row: CertificateRow | null, options: BindingOptions): Record<string, string> {
  if (!row) return {};
  return resolveCertificateBindings(
    {
      serial: row.serial,
      verificationCode: row.verification_code,
      issuedAt: row.issued_at,
      recipientNameSnapshot: row.recipient_name_snapshot,
    },
    options,
  );
}

/** Every `{{binding}}` a document names. One definition, in the runtime, so
 *  the editor's panel, the baseline library's test and the export pipeline
 *  cannot disagree about what a document asks for. */
export const declaredBindings = declaredBindingsOf;

/** The binding context the runtime renders with — the editor and the export
 *  build it the same way, which is what keeps the preview honest. */
export function bindingContext(values: Record<string, string>, placeholderLabel?: (binding: string) => string): BindingContext {
  return { values, ...(placeholderLabel ? { placeholderLabel } : {}) };
}

/* ── reads ──────────────────────────────────────────────────────────────── */

/** SCR-057. `null` when the policy returns no row: the page calls `notFound()`. */
export async function getDesignerDocument(
  locale: string,
  documentId: string,
  origin: string,
  options: { scheme?: string | null } = {},
): Promise<DesignerDocumentData | null> {
  const { session, supabase } = await sessionClient(locale);

  const [{ data: row }, { data: settings }, { data: org }] = await Promise.all([
    supabase
      .from("design_documents")
      .select("id, purpose, document, template_version_id, bound_session_id, bound_certificate_id, draft_for_template_id, updated_at")
      .eq("id", documentId)
      .maybeSingle(),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
    supabase.from("orgs").select("name").eq("id", session.orgId).maybeSingle(),
  ]);
  if (!row) return null;

  const parsed = validateDocument(row.document);
  if (!parsed.ok) {
    // A stored document that no longer validates is a real incident, not a
    // rendering choice: refusing to open it is what stops an admin "fixing"
    // it by saving over something the renderer never understood.
    throw new Error(`designer: stored document ${documentId} is invalid — ${parsed.issues.map((i) => `${i.path}:${i.code}`).join(", ")}`);
  }
  const document = parsed.document;
  const timeZone = (settings?.time_zone as string | undefined) ?? "Asia/Riyadh";

  const [{ data: sessionRow }, { data: certificateRow }, { data: fontRows }, { data: version }, { data: poster }, { data: draftTemplate }] = await Promise.all([
    row.bound_session_id
      ? supabase.from("sessions").select("id, title, abstract, starts_at, time_zone, custom_venue_name, custom_venue_address, venues(name, address)").eq("id", row.bound_session_id).maybeSingle()
      : Promise.resolve({ data: null }),
    row.bound_certificate_id
      ? supabase
          .from("certificates")
          // `*`, so the pinned `scheme` (designer/0003) is read where the column
          // exists without failing the whole read where it does not yet.
          .select("*")
          .eq("id", row.bound_certificate_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("fonts").select("family, weight, style, sha256, parity_status").order("family"),
    row.template_version_id
      ? supabase.from("design_template_versions").select("document").eq("id", row.template_version_id).maybeSingle()
      : Promise.resolve({ data: null }),
    row.bound_session_id
      ? supabase.from("session_posters").select("binding").eq("session_id", row.bound_session_id).maybeSingle()
      : Promise.resolve({ data: null }),
    row.draft_for_template_id
      ? supabase.from("design_templates").select("id, name, purpose").eq("id", row.draft_for_template_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const purpose = row.purpose as DesignerPurpose;
  // A certificate renders the scheme PINNED on it (DEC-148); a template or an
  // unbound certificate document previews what is asked for; a poster, dark.
  const pinned = (certificateRow as { scheme?: string } | null)?.scheme;
  const scheme = previewScheme(purpose, pinned ?? options.scheme);

  const bindingOptions: BindingOptions = { timeZone, origin, locale: "ar", orgName: (org?.name as string | undefined) ?? null };

  const bindings: Record<string, string> = {
    // The org's brand override over the platform palette (wave 4, DEC-052,
    // 06 §8.3) — the same composition the worker's request path makes, so
    // the preview an admin approves is what the export renders. A template
    // binds `{{brand.*}}` and never a hex literal (REQ-DSG-021); no row is
    // the identity override.
    ...resolveBrand(await editorBrandOverrides(supabase, session.orgId), scheme),
    ...sessionBindings(sessionRow as SessionRow | null, bindingOptions),
    ...certificateBindings(certificateRow as CertificateRow | null, bindingOptions),
  };

  // REQ-DSG-021 / 06 §8.3: the logo is BOUND, never embedded, which is what
  // makes replacing it update every template at once. Wave 4's brand kit
  // supplies the asset id; until then nothing binds and the image layer
  // draws a marked placeholder, which is the correct answer for an org that
  // has not uploaded one.
  const logoAssetId = bindings["brand.logoAssetId"];
  if (logoAssetId) {
    const url = await signDesignAssetUrl(locale, logoAssetId);
    if (url) bindings["brand.logoAssetId"] = url;
    else delete bindings["brand.logoAssetId"];
  }

  const templateLayers = (version?.document as { layers?: { id?: string; locked?: boolean }[] } | null)?.layers ?? [];
  const lockedLayerIds = templateLayers.filter((l) => l.locked === true && typeof l.id === "string").map((l) => l.id as string);

  const boundSession = sessionRow as unknown as SessionRow | null;
  const context: DesignerContext = boundSession
    ? {
        kind: "session_poster",
        sessionId: boundSession.id,
        title: boundSession.title,
        binding: ((poster?.binding as "live" | "detached" | undefined) ?? null),
      }
    : draftTemplate
      ? { kind: "template_draft", templateId: draftTemplate.id as string, purpose: draftTemplate.purpose as DesignerPurpose, title: draftTemplate.name as string }
      : certificateRow
        ? {
            kind: "certificate",
            sessionId: ((certificateRow as { session_id: string | null }).session_id ?? null),
            title: (certificateRow as CertificateRow).recipient_name_snapshot,
            serial: (certificateRow as CertificateRow).serial,
          }
        : { kind: "unbound", purpose };

  return {
    id: row.id as string,
    purpose,
    document,
    templateVersionId: (row.template_version_id as string | null) ?? null,
    boundSessionId: (row.bound_session_id as string | null) ?? null,
    boundCertificateId: (row.bound_certificate_id as string | null) ?? null,
    updatedAt: row.updated_at as string,
    lockedLayerIds,
    bindings,
    declaredBindings: declaredBindings(document),
    fonts: (fontRows ?? []).map((f) => ({
      family: f.family as string,
      weight: f.weight as number,
      style: f.style as string,
      sha256: f.sha256 as string,
      parityStatus: f.parity_status as DesignerFont["parityStatus"],
    })),
    canEdit: session.role === "admin",
    timeZone,
    context,
    scheme,
  };
}

/* ── the autosave ───────────────────────────────────────────────────────── */

/** The Route Handler's envelope. The tree inside is validated by the runtime's
 *  own `validateDocument()` — one definition, shared with the worker. */
export const autosaveInput = z.object({
  /** The document as the editor last READ it. A save that names a version the
   *  row has moved past is refused rather than merged: two admins in one
   *  editor is rare, and silently discarding one of them is not recoverable. */
  baseUpdatedAt: z.string().min(1),
  document: z.unknown(),
});
export type AutosaveInput = z.infer<typeof autosaveInput>;

export type AutosaveResult =
  | { status: "saved"; updatedAt: string }
  | { status: "invalid"; issues: ValidationIssue[] }
  | { status: "conflict"; updatedAt: string }
  | { status: "not_authorized" }
  | { status: "locked_region"; layerId: string };

/**
 * SCR-057's autosave. A Route Handler calls this, never a Server Action:
 * layer trees exceed the 1 MB action body cap (`04` §4.2), and a save that
 * fails at the cap fails AFTER the admin has done the work.
 */
export async function saveDesignDocument(locale: string, documentId: string, input: AutosaveInput): Promise<AutosaveResult> {
  const parsed = validateDocument(input.document);
  if (!parsed.ok) return { status: "invalid", issues: parsed.issues };

  const { session, supabase } = await sessionClient(locale);

  const { data: current } = await supabase.from("design_documents").select("updated_at").eq("id", documentId).maybeSingle();
  if (!current) return { status: "not_authorized" };
  if (new Date(current.updated_at as string).getTime() !== new Date(input.baseUpdatedAt).getTime()) {
    return { status: "conflict", updatedAt: current.updated_at as string };
  }

  const { data, error } = await supabase
    .from("design_documents")
    .update({ document: parsed.document, updated_by: session.memberId })
    .eq("id", documentId)
    .select("updated_at")
    .maybeSingle();

  if (error) {
    // `design_documents_guard` raises 23514 naming the layer, because the
    // editor's own refusal is not the boundary — a locked QR that a bug moved
    // would otherwise print unverifiable (REQ-DSG-024).
    const match = /locked_layer_[a-z]+: (\S+)/.exec(error.message);
    if (match?.[1]) return { status: "locked_region", layerId: match[1] };
    throw new Error(`designer: save failed — ${error.message}`);
  }
  // No row updated means `p2_admin_update` filtered it out: design is an
  // admin act (REQ-DSG-002).
  if (!data) return { status: "not_authorized" };

  return { status: "saved", updatedAt: data.updated_at as string };
}

/* ── the export pipeline (REQ-DSG-011 … REQ-DSG-014, 06 §6) ─────────────── */

export type ExportStatus = "queued" | "rendering" | "ready" | "failed";

export interface ExportArtifact {
  id: string;
  preset: string;
  format: "png" | "webp" | "pdf" | "jpeg";
  status: ExportStatus;
  storagePath: string | null;
  /** What failed, in the worker's own words. REQ-DSG-012: «a failed export
   *  states what failed and offers a retry» — a bare "failed" is neither. */
  error: string | null;
  renderedAt: string | null;
}

/**
 * The source fingerprint — REQ-DSG-013.
 *
 * SHA-256 of the runtime's canonical source string. The canonicalisation is
 * shared with the worker so the two cannot disagree about what "unchanged"
 * means; the hashing is one line of `node:crypto` on each side, which is what
 * keeps the runtime package dependency-free for the worker image and the
 * parity harness.
 */
export function exportFingerprint(source: FingerprintSource): string {
  return createHash("sha256").update(fingerprintSource(source)).digest("hex");
}

/** Every screen and print target for a document, in A29's order. WebP
 *  accompanies every screen PNG for in-app display; JPEG is offered only
 *  where the org enabled it, and that check is the worker's. A certificate
 *  is its one composed page as a PDF, plus the PNG preview (A29) — the same
 *  targets `issue_certificates` requests, so an export from the studio and
 *  an issued certificate are the same files. */
export function exportTargets(document: DesignDocument): Array<{ preset: string; format: ExportArtifact["format"] }> {
  const targets: Array<{ preset: string; format: ExportArtifact["format"] }> = [];
  if (document.purpose === "certificate") {
    for (const preset of presetsForDocument(document)) targets.push({ preset, format: "pdf" }, { preset, format: "png" });
    return targets;
  }
  for (const preset of presetsForDocument(document)) {
    // A29: print is PDF at 300 dpi with the bleed the geometry already
    // carries; screen is PNG at the exact preset size plus a WebP copy for
    // in-app display. JPEG is offered only where the org enabled it, and
    // that check belongs to the worker, which can see org_settings.
    if (PRESETS[preset].bleed > 0) targets.push({ preset, format: "pdf" });
    else targets.push({ preset, format: "png" }, { preset, format: "webp" });
  }
  return targets;
}

export interface ExportQueueData {
  fingerprint: string;
  artifacts: ExportArtifact[];
  /** True once every target for this fingerprint is `ready` — what the
   *  approve action on mobile waits for (SCR-057, view and approve). */
  complete: boolean;
}

function toArtifact(row: Record<string, unknown>): ExportArtifact {
  return {
    id: row.id as string,
    preset: row.preset as string,
    format: row.format as ExportArtifact["format"],
    status: row.status as ExportStatus,
    storagePath: (row.storage_path as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    renderedAt: (row.rendered_at as string | null) ?? null,
  };
}

/** What already exists for this exact source. Nothing is rendered here: the
 *  cache IS the unique constraint, and re-opening a session must render
 *  nothing (REQ-DSG-013). */
export async function getExportQueue(locale: string, documentId: string, fingerprint: string): Promise<ExportQueueData> {
  const { supabase } = await sessionClient(locale);
  const { data } = await supabase
    .from("export_artifacts")
    .select("id, preset, format, status, storage_path, error, rendered_at")
    .eq("document_id", documentId)
    .eq("source_fingerprint", fingerprint)
    .order("preset");
  const artifacts = (data ?? []).map(toArtifact);
  return { fingerprint, artifacts, complete: artifacts.length > 0 && artifacts.every((a) => a.status === "ready") };
}

/**
 * Queue every variant for the document as it stands — REQ-DSG-011/012.
 *
 * The bindings and the faces are pinned into the request rather than
 * re-resolved by the worker: a second resolution of 06 §2.3 is a second thing
 * that can disagree with what the admin previewed, and for a certificate it
 * would break REQ-CRT-014 outright.
 */
export async function requestExports(
  locale: string,
  documentId: string,
  origin: string,
  options: { scheme?: string | null } = {},
): Promise<ExportQueueData | { status: "not_authorized" }> {
  // The same scheme the preview resolved, so the export is what was approved.
  const data = await getDesignerDocument(locale, documentId, origin, options);
  if (!data) return { status: "not_authorized" };

  const { supabase } = await sessionClient(locale);
  const faces = await listEditorFaces(locale);
  const fingerprint = exportFingerprint({
    document: data.document,
    templateVersionId: data.templateVersionId,
    bindings: data.bindings,
    fontHashes: faces.map((f) => f.sha256),
  });

  const { data: rows, error } = await supabase.rpc("request_render", {
    p_document: documentId,
    p_fingerprint: fingerprint,
    p_context: { bindings: data.bindings, faces },
    p_targets: exportTargets(data.document),
  });
  if (error) {
    if (error.code === "42501") return { status: "not_authorized" };
    throw new Error(`designer: request_render failed — ${error.message}`);
  }

  const artifacts = ((rows ?? []) as Record<string, unknown>[]).map(toArtifact);
  return { fingerprint, artifacts, complete: artifacts.length > 0 && artifacts.every((a) => a.status === "ready") };
}

export async function retryExport(locale: string, artifactId: string): Promise<{ status: "ok" } | { status: "not_authorized" }> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("retry_export_artifact", { p_artifact: artifactId });
  if (error) return { status: "not_authorized" };
  return { status: "ok" };
}

/** A short-lived signed URL for a finished artifact. `exports_storage_read`
 *  (0037) is the boundary — org-prefixed, and the path came from the one
 *  builder (03 §6). */
export async function signExportUrl(locale: string, storagePath: string): Promise<string | null> {
  const { supabase } = await sessionClient(locale);
  const { data } = await supabase.storage.from("exports").createSignedUrl(storagePath, 300);
  return data?.signedUrl ?? null;
}

/* ── the org brand override for the editor's preview (wave 4, DEC-052) ──── */

/**
 * The `brand.*` bindings a PREVIEW renders with — the org's override over the
 * platform palette in the given scheme, and the logo as a short-lived signed
 * URL. The template libraries (SCR-055/056) draw each card with it, so a card
 * shows the template as this org's posters and certificates will look.
 */
export async function previewBrandBindings(locale: string, scheme: BrandScheme): Promise<Record<string, string>> {
  const { session, supabase } = await sessionClient(locale);
  const bindings = resolveBrand(await editorBrandOverrides(supabase, session.orgId), scheme);
  const logoAssetId = bindings["brand.logoAssetId"];
  if (logoAssetId) {
    const url = await signDesignAssetUrl(locale, logoAssetId);
    if (url) bindings["brand.logoAssetId"] = url;
    else delete bindings["brand.logoAssetId"];
  }
  return bindings;
}

/** `public.brand_kit()` already merges the platform defaults, so its output
 *  is a complete override; `resolveBrand` over it is exact. RLS scopes the
 *  read to the caller's org whatever id is passed (`security invoker`). */
async function editorBrandOverrides(supabase: Awaited<ReturnType<typeof sessionClient>>["supabase"], orgId: string): Promise<BrandOverrides | null> {
  const { data, error } = await supabase.rpc("brand_kit", { p_org: orgId });
  if (error || !data) return null;
  const kit = data as { isOverridden?: boolean; light?: BrandOverrides["light"]; dark?: BrandOverrides["dark"]; logoAssetId?: string | null };
  if (!kit.isOverridden) return null;
  return { light: kit.light, dark: kit.dark, logoAssetId: kit.logoAssetId ?? null };
}
