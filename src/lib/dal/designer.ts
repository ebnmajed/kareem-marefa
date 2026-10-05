import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  assetIdsOf,
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
// ★ `sessions`' own reader of `session_days`, request-scoped through React
// `cache()` (wave 9 contract 3). Read, never edited, and never replaced by a
// query of my own: two readers of one table is how two answers happen.
import { listSessionDays } from "@/lib/dal/sessions";

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
  /**
   * ★ DEC-179: each design asset the document's images name → a five-minute
   * signed URL, for the STUDIO's canvas only. The ids stay ids in `bindings`,
   * which are pinned into the render request and hashed into the fingerprint:
   * a signed URL there changed the fingerprint on every page load (so the
   * export queue never matched) and could expire before the serial render
   * queue reached the job. The worker inlines the bytes itself.
   */
  assets: Record<string, string>;
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
  /* ── wave 23, add-only ── */
  /** «معاينة بجلسة»: a real session's bindings over the canvas and the checks ONLY. Never in `bindings`, so the
   *  fingerprint, the export queue and every render keep the saved document's own (REQ-DSG-013). */
  previewBindings: Record<string, string>;
  /** A template draft's latest PUBLISHED version, so the bar offers «انشر» only when the draft differs. */
  publishedDocument: DesignDocument | null;
  /** The family a template draft serves — a certificate's kind (DEC-236 §1). */
  family: string | null;
  /** A certificate template's other orientation in the org's library — the strip links to it (DEC-148: an
   *  orientation is a composition, its own row, never a derivation). */
  sibling: { templateId: string; orientation: "landscape" | "portrait" } | null;
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
  /** ★ wave 10: the session's days, read through `sessions`' own
   *  `listSessionDays()` rather than queried here — one reader of
   *  `session_days` in TypeScript, and `position` is the database's derived
   *  rank (DEC-150, wave 9 contract 3). */
  days?: readonly { startsAt: string; endsAt: string }[] | null;
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
      // ★ The day set decides `{{session.startsAt}}`'s value; the session's own
      // instant is its stored shadow and the fallback (DEC-150, DEC-160). The
      // editor and the worker must reach the same string or the preview is not
      // the artifact (DEC-017), which is why the RESOLUTION is the runtime's
      // and only the ROW is assembled here.
      days: row.days ?? null,
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

/* ── reads ──────────────────────────────────────────────────────────────── */

/** SCR-057. `null` when the policy returns no row: the page calls `notFound()`. */
export async function getDesignerDocument(
  locale: string,
  documentId: string,
  origin: string,
  options: { scheme?: string | null; previewSessionId?: string | null; previewMemberId?: string | null } = {},
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

  const reads = await Promise.all([
    row.bound_session_id
      ? supabase.from("sessions").select("id, title, abstract, starts_at, time_zone, custom_venue_name, custom_venue_address, venues(name, address)").eq("id", row.bound_session_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.bound_certificate_id
      ? supabase
          .from("certificates")
          // `*`, so the pinned `scheme` (designer/0003) is read where the column
          // exists without failing the whole read where it does not yet.
          .select("*")
          .eq("id", row.bound_certificate_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("fonts").select("family, weight, style, sha256, parity_status").order("family"),
    row.template_version_id
      ? supabase.from("design_template_versions").select("document").eq("id", row.template_version_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.bound_session_id
      ? supabase.from("session_posters").select("binding").eq("session_id", row.bound_session_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.draft_for_template_id
      ? supabase.from("design_templates").select("id, name, purpose, family").eq("id", row.draft_for_template_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  // A failed read is thrown, never rendered as an editor with no session, no certificate or no fonts — an admin
  // who saved over that would lose the binding for good.
  for (const read of reads) if (read.error) throw new Error(`designer: ${read.error.message}`);
  const [{ data: sessionRow }, { data: certificateRow }, { data: fontRows }, { data: version }, { data: poster }, { data: draftTemplate }] = reads;
  const purpose = row.purpose as DesignerPurpose;
  // A certificate renders the scheme PINNED on it (DEC-148); a template or an
  // unbound certificate document previews what is asked for; a poster, dark.
  const pinned = (certificateRow as { scheme?: string } | null)?.scheme;
  const scheme = previewScheme(purpose, pinned ?? options.scheme);

  const bindingOptions: BindingOptions = { timeZone, origin, locale: "ar", orgName: (org?.name as string | undefined) ?? null };

  // ★ The bound session's days, through `sessions`' `listSessionDays()` — read,
  // never re-queried here (wave 9 contract 3). It is `cache()`-wrapped, so the
  // editor page paying for it once is the whole cost. A reader handles n days
  // and is right at n = 1 because 1 is a value of n: no `isMultiDay` branch.
  const days = row.bound_session_id ? await listSessionDays(locale, row.bound_session_id) : [];
  const boundSessionRow: SessionRow | null = sessionRow
    ? { ...(sessionRow as unknown as SessionRow), days: days.map((d) => ({ startsAt: d.startsAt, endsAt: d.endsAt })) }
    : null;

  const bindings: Record<string, string> = {
    // The org's brand override over the platform palette (wave 4, DEC-052,
    // 06 §8.3) — the same composition the worker's request path makes, so
    // the preview an admin approves is what the export renders. A template
    // binds `{{brand.*}}` and never a hex literal (REQ-DSG-021); no row is
    // the identity override.
    ...resolveBrand(await editorBrandOverrides(supabase, session.orgId), scheme),
    ...sessionBindings(boundSessionRow, bindingOptions),
    ...certificateBindings(certificateRow as CertificateRow | null, bindingOptions),
  };

  // REQ-DSG-021 / 06 §8.3: the logo is BOUND, never embedded, which is what
  // makes replacing it update every template at once. The binding keeps the
  // asset's ID (DEC-179) — the studio's canvas gets signed URLs through
  // `assets` below, and the worker inlines the bytes; an org with no logo
  // binds nothing and the layer draws a marked placeholder.
  const assetIds = assetIdsOf(document, { values: bindings });
  const signedAssets = await Promise.all(assetIds.map(async (id) => [id, await signDesignAssetUrl(locale, id)] as const));
  const assets: Record<string, string> = {};
  for (const [id, url] of signedAssets) if (url) assets[id] = url;

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
    assets,
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
    previewBindings:
      purpose === "certificate"
        ? row.bound_certificate_id
          ? {}
          : await previewCertificateBindings(
              supabase,
              { memberId: options.previewMemberId ?? null, sessionId: options.previewSessionId ?? null, family: (draftTemplate?.family as string | undefined) ?? null },
              bindingOptions,
            )
        : await previewSessionBindings(supabase, locale, row.bound_session_id ? null : (options.previewSessionId ?? null), bindingOptions),
    publishedDocument: draftTemplate ? await latestPublished(supabase, draftTemplate.id as string) : null,
    family: (draftTemplate?.family as string | undefined) ?? ((certificateRow as { kind?: string } | null)?.kind ?? null),
    sibling: draftTemplate && purpose === "certificate" ? await siblingOrientation(supabase, draftTemplate.id as string, draftTemplate.family as string, document) : null,
  };
}

type Client = Awaited<ReturnType<typeof sessionClient>>["supabase"];

/** A real session's bindings for «معاينة بجلسة» — through RLS as the caller; nothing when it is not readable. */
async function previewSessionBindings(supabase: Client, locale: string, sessionId: string | null, options: BindingOptions): Promise<Record<string, string>> {
  if (!sessionId || !z.uuid().safeParse(sessionId).success) return {};
  const { data } = await supabase
    .from("sessions")
    .select("id, title, abstract, starts_at, time_zone, custom_venue_name, custom_venue_address, venues(name, address), session_presenters(accepted, members(display_name))")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) return {};
  const days = await listSessionDays(locale, sessionId);
  return sessionBindings({ ...(data as unknown as SessionRow), days: days.map((d) => ({ startsAt: d.startsAt, endsAt: d.endsAt })) }, options);
}

async function latestPublished(supabase: Client, templateId: string): Promise<DesignDocument | null> {
  const { data } = await supabase
    .from("design_template_versions")
    .select("document")
    .eq("template_id", templateId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const parsed = validateDocument(data.document);
  return parsed.ok ? parsed.document : null;
}

/**
 * «معاينة بعضو» (C5): a real member, and for a session kind a real session. If the member HOLDS an issued certificate of
 * this kind from this org, its own row is bound — serial, code and the QR's /verify URL all real. Otherwise only the
 * name and the session's title are bound, and the serial, the code and the QR are left ABSENT, so the canvas draws
 * their marked placeholders (REQ-DSG-006) — never an invented serial, never a URL the editor built (REQ-CRT-010).
 * Through RLS as the caller. Never in `bindings`: the fingerprint keeps the document's own (REQ-DSG-013).
 */
async function previewCertificateBindings(
  supabase: Client,
  input: { memberId: string | null; sessionId: string | null; family: string | null },
  options: BindingOptions,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const uuid = (v: string | null) => (v && z.uuid().safeParse(v).success ? v : null);
  const memberId = uuid(input.memberId);
  const sessionId = uuid(input.sessionId);
  if (sessionId && input.family !== "achievement") {
    const { data } = await supabase.from("sessions").select("title").eq("id", sessionId).maybeSingle();
    if (data?.title) out["session.title"] = data.title as string;
  }
  if (!memberId) return out;
  const { data: member } = await supabase.from("members").select("display_name").eq("id", memberId).maybeSingle();
  if (!member?.display_name) return out;
  out["recipient.name"] = member.display_name as string;
  if (input.family) {
    let held = supabase
      .from("certificates")
      .select("id, serial, verification_code, issued_at, recipient_name_snapshot, session_id")
      .eq("member_id", memberId)
      .eq("kind", input.family)
      .eq("state", "issued");
    if (sessionId && input.family !== "achievement") held = held.eq("session_id", sessionId);
    const { data: certificate } = await held.order("issued_at", { ascending: false }).limit(1).maybeSingle();
    if (certificate) Object.assign(out, certificateBindings(certificate as unknown as CertificateRow, options));
  }
  return out;
}

async function siblingOrientation(
  supabase: Client,
  templateId: string,
  family: string,
  document: DesignDocument,
): Promise<{ templateId: string; orientation: "landscape" | "portrait" } | null> {
  const want = document.master.width >= document.master.height ? "portrait" : "landscape";
  const { data: templates } = await supabase
    .from("design_templates")
    .select("id")
    .eq("purpose", "certificate")
    .eq("family", family)
    .not("org_id", "is", null)
    .is("retired_at", null)
    .neq("id", templateId);
  const ids = (templates ?? []).map((t) => t.id as string);
  if (!ids.length) return null;
  const { data: versions } = await supabase.from("design_template_versions").select("template_id, version, master:document->master").in("template_id", ids).order("version", { ascending: false });
  const seen = new Set<string>();
  for (const v of versions ?? []) {
    const id = v.template_id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const m = v.master as { width?: number; height?: number } | null;
    if (!m?.width || !m.height) continue;
    if ((m.width >= m.height ? "landscape" : "portrait") === want) return { templateId: id, orientation: want };
  }
  return null;
}

/** «معاينة بعضو»'s members: names only — no email reaches the page. Through RLS. */
export async function listPreviewMembers(locale: string): Promise<{ id: string; name: string }[]> {
  const { supabase } = await sessionClient(locale);
  const { data } = await supabase.from("members").select("id, display_name").eq("status", "active").order("display_name").limit(300);
  return (data ?? []).filter((m) => m.display_name).map((m) => ({ id: m.id as string, name: m.display_name as string }));
}

/**
 * The checks' samples (C4): the org's longest session title and the longest active member's name — what a poster's
 * title and a certificate's name layer must fit at their max lines. Read through RLS; the longest is chosen here
 * (PostgREST cannot order by a length, and this needs no SQL function).
 */
export async function getLongestSamples(locale: string): Promise<Record<string, string>> {
  const { supabase } = await sessionClient(locale);
  const [{ data: sessions }, { data: members }] = await Promise.all([
    supabase.from("sessions").select("title").limit(2000),
    supabase.from("members").select("display_name").eq("status", "active").limit(5000),
  ]);
  const longest = (values: (string | null | undefined)[]) => values.reduce<string>((best, v) => (v && v.length > best.length ? v : best), "");
  const out: Record<string, string> = {};
  const title = longest((sessions ?? []).map((s) => s.title as string));
  const name = longest((members ?? []).map((m) => m.display_name as string | null));
  if (title) out["session.title"] = title;
  if (name) out["recipient.name"] = name;
  return out;
}

/** «معاينة بجلسة»'s choices: the org's sessions, the latest first. Through RLS. */
export async function listPreviewSessions(locale: string): Promise<{ id: string; title: string }[]> {
  const { supabase } = await sessionClient(locale);
  const { data } = await supabase.from("sessions").select("id, title").order("starts_at", { ascending: false, nullsFirst: false }).limit(30);
  return (data ?? []).map((r) => ({ id: r.id as string, title: r.title as string }));
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
  | { status: "locked_region"; layerId: string }
  /** The document is a session's LIVE poster: it is the template's, and an
   *  edit would be discarded by the next regeneration. Detach first, through
   *  the confirm (REQ-DSG-003, REQ-UIX-013). */
  | { status: "live_poster" };

/**
 * SCR-057's autosave. A Route Handler calls this, never a Server Action:
 * layer trees exceed the 1 MB action body cap (`04` §4.2), and a save that
 * fails at the cap fails AFTER the admin has done the work.
 */
export async function saveDesignDocument(locale: string, documentId: string, input: AutosaveInput): Promise<AutosaveResult> {
  const parsed = validateDocument(input.document);
  if (!parsed.ok) return { status: "invalid", issues: parsed.issues };

  const { session, supabase } = await sessionClient(locale);

  const [{ data: current }, { data: livePoster }] = await Promise.all([
    supabase.from("design_documents").select("updated_at").eq("id", documentId).maybeSingle(),
    supabase.from("session_posters").select("id").eq("document_id", documentId).eq("binding", "live").maybeSingle(),
  ]);
  if (!current) return { status: "not_authorized" };
  // ★ A live poster is a pure function of template and data; a save to it
  // would stay `live` and be regenerated away on the next title change — the
  // admin's work silently gone. Refused, never detached on the side: detaching
  // is confirmed by name (REQ-UIX-013), in the picker or the studio's gate.
  if (livePoster) return { status: "live_poster" };
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

/** The one signer lives in `posters.ts` (REQ-DSG-027 — «there is one»); it is
 *  re-exported here so the studio's import did not move. */
export { signExportUrl } from "@/lib/dal/posters";

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
