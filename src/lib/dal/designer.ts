import "server-only";
import { z } from "zod";
import {
  type BindingContext,
  type DesignDocument,
  platformBrand,
  validateDocument,
  type ValidationIssue,
} from "@kareem/designer-runtime";
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
};

/** 06 §2.3's table, resolved from the row the document is bound to. A key that
 *  is absent (not empty) is what makes the canvas draw a marked placeholder. */
function sessionBindings(row: SessionRow | null, numerals: NumeralSystem, timeZone: string, origin: string): Record<string, string> {
  if (!row) return {};
  const out: Record<string, string> = { "session.title": row.title };
  if (row.abstract) out["session.abstract"] = row.abstract;
  // The SESSION's time zone, not the org's, when it carries an override
  // (0010) — a poster printed for a session in another city states that
  // city's time.
  if (row.starts_at) out["session.startsAt"] = formatDateTime(row.starts_at, numerals, row.time_zone ?? timeZone);
  // A session names a venue from the list OR carries a one-off (0010's own
  // check). Neither is authoritative over the other, so the listed venue wins
  // only when there is one.
  const venueName = row.venues?.name ?? row.custom_venue_name;
  if (venueName) out["session.venueName"] = venueName;
  const venueAddress = row.venues?.address ?? row.custom_venue_address;
  if (venueAddress) out["session.venueAddress"] = venueAddress;
  // Absolute: a phone camera needs a URL, not a path (REQ-DSG-023).
  out["session.eventUrl"] = `${origin}/ar/app/sessions/${row.id}`;
  return out;
}

type CertificateRow = {
  id: string;
  serial: string;
  verification_code: string;
  issued_at: string | null;
  recipient_name_snapshot: string;
};

function certificateBindings(row: CertificateRow | null, numerals: NumeralSystem, timeZone: string, origin: string): Record<string, string> {
  if (!row) return {};
  const out: Record<string, string> = {
    // Frozen, not live: a certificate records what was PRINTED, and a member
    // later changing their display name must not retroactively change a
    // document someone is holding (REQ-CRT-014).
    "recipient.name": row.recipient_name_snapshot,
    "certificate.serial": row.serial,
    "certificate.verificationCode": row.verification_code,
    "certificate.verifyUrl": `${origin}/ar/verify/${row.verification_code}`,
  };
  if (row.issued_at) out["certificate.issuedAt"] = formatDateTime(row.issued_at, numerals, timeZone);
  return out;
}

/** Every `{{binding}}` a document names, in document order, deduplicated. */
export function declaredBindings(document: DesignDocument): string[] {
  const found: string[] = [];
  const add = (raw: string | undefined) => {
    if (!raw) return;
    const path = raw.replace(/^\{\{|\}\}$/g, "").trim();
    if (path && !found.includes(path)) found.push(path);
  };
  for (const layer of document.layers) {
    if (layer.kind === "text") add(layer.text.binding);
    if (layer.kind === "dynamic_field") add(layer.field.binding);
    if (layer.kind === "qr") add(layer.qr.binding);
    if (layer.kind === "image") add(layer.image.binding);
    if ("color" in layer) add(layer.color);
    if (layer.kind === "shape") {
      add(layer.shape.fill);
      add(layer.shape.stroke);
    }
  }
  if (document.background?.color) add(document.background.color);
  return found;
}

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

  const bindings: Record<string, string> = {
    // The platform theme until wave 4's brand kit supplies the org override
    // (DEC-048 decision 2). The CONTRACT is the same either way — a template
    // binds `{{brand.*}}` and never a hex literal (REQ-DSG-021).
    ...platformBrand("light"),
    ...(org?.name ? { "org.name": org.name as string } : {}),
    ...sessionBindings(sessionRow as SessionRow | null, numerals, timeZone, origin),
    ...certificateBindings(certificateRow as CertificateRow | null, numerals, timeZone, origin),
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
