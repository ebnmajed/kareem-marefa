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
  platformBrand,
  PRESETS,
  presetsFor,
  resolveCertificateBindings,
  resolveSessionBindings,
  validateDocument,
  type ValidationIssue,
} from "@kareem/designer-runtime";
import { listEditorFaces } from "@/lib/dal/fonts";
import { sessionClient } from "@/lib/dal/session";
import { formatDateTime, type NumeralSystem } from "@/components/sessions/numerals";

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
  numerals: NumeralSystem;
  timeZone: string;
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
export async function getDesignerDocument(locale: string, documentId: string, origin: string): Promise<DesignerDocumentData | null> {
  const { session, supabase } = await sessionClient(locale);

  const [{ data: row }, { data: settings }, { data: org }] = await Promise.all([
    supabase
      .from("design_documents")
      .select("id, purpose, document, template_version_id, bound_session_id, bound_certificate_id, updated_at")
      .eq("id", documentId)
      .maybeSingle(),
    supabase.from("org_settings").select("numerals, time_zone").eq("org_id", session.orgId).maybeSingle(),
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

  const numerals = (settings?.numerals as NumeralSystem | undefined) ?? "western";
  const timeZone = (settings?.time_zone as string | undefined) ?? "Asia/Riyadh";

  const [{ data: sessionRow }, { data: certificateRow }, { data: fontRows }, { data: version }] = await Promise.all([
    row.bound_session_id
      ? supabase.from("sessions").select("id, title, abstract, starts_at, time_zone, custom_venue_name, custom_venue_address, venues(name, address)").eq("id", row.bound_session_id).maybeSingle()
      : Promise.resolve({ data: null }),
    row.bound_certificate_id
      ? supabase
          .from("certificates")
          .select("id, serial, verification_code, issued_at, recipient_name_snapshot")
          .eq("id", row.bound_certificate_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("fonts").select("family, weight, style, sha256, parity_status").order("family"),
    row.template_version_id
      ? supabase.from("design_template_versions").select("document").eq("id", row.template_version_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const bindingOptions: BindingOptions = { numerals, timeZone, origin, locale: "ar", orgName: (org?.name as string | undefined) ?? null };

  const bindings: Record<string, string> = {
    // The platform theme until wave 4's brand kit supplies the org override
    // (DEC-048 decision 2). The CONTRACT is the same either way — a template
    // binds `{{brand.*}}` and never a hex literal (REQ-DSG-021).
    ...platformBrand("light"),
    ...sessionBindings(sessionRow as SessionRow | null, bindingOptions),
    ...certificateBindings(certificateRow as CertificateRow | null, bindingOptions),
  };

  const templateLayers = (version?.document as { layers?: { id?: string; locked?: boolean }[] } | null)?.layers ?? [];
  const lockedLayerIds = templateLayers.filter((l) => l.locked === true && typeof l.id === "string").map((l) => l.id as string);

  return {
    id: row.id as string,
    purpose: row.purpose as DesignerPurpose,
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
    numerals,
    timeZone,
  };
}

/** The org's numeral system, for any designer screen that prints a count.
 *  One query rather than each screen remembering `org_settings` exists. */
export async function getOrgNumerals(locale: string): Promise<NumeralSystem> {
  const { session, supabase } = await sessionClient(locale);
  const { data } = await supabase.from("org_settings").select("numerals").eq("org_id", session.orgId).maybeSingle();
  return (data?.numerals as NumeralSystem | undefined) ?? "western";
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

/** Every screen and print target for a document's purpose, in A29's order.
 *  WebP accompanies every screen PNG for in-app display; JPEG is offered
 *  only where the org enabled it, and that check is the worker's. */
export function exportTargets(purpose: DesignerPurpose): Array<{ preset: string; format: ExportArtifact["format"] }> {
  const targets: Array<{ preset: string; format: ExportArtifact["format"] }> = [];
  for (const preset of presetsFor(purpose)) {
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
export async function requestExports(locale: string, documentId: string, origin: string): Promise<ExportQueueData | { status: "not_authorized" }> {
  const data = await getDesignerDocument(locale, documentId, origin);
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
    p_targets: exportTargets(data.purpose),
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
