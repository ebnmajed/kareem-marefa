import "server-only";
import { z } from "zod";
import { type BrandScheme, type DesignDocument, formatBindingDate, orientationOf, validateDocument } from "@kareem/designer-runtime";
import { createServerClient } from "@/lib/supabase/server";
import { previewBrandBindings } from "@/lib/dal/designer";
import { sessionClient } from "@/lib/dal/session";

// Certificates — REQ-CRT-004 … REQ-CRT-014, 03 §5.8/§5.8a, A13.
//
// THREE AUDIENCES, THREE DIFFERENT TRUTHS, and the difference is the point:
//
//   the member  (SCR-023) sees their own, with the revocation REASON.
//   the admin   (SCR-045) sees every one in the org, `held` included, and is
//               the only role that can release or revoke.
//   the public  (SCR-006) sees an allowlist of six fields and NEVER the
//               reason, resolves by verification code only, and cannot tell
//               «unknown» from «never existed» (REQ-CRT-007, REQ-CRT-009).
//
// The first two go through `certificates` under RLS — `certs_read_self_or_
// admin` and `certs_read_held_admin` do the whole job, and the filters below
// are defence in depth. The third goes through `verify_certificate()`, whose
// RETURN TYPE is the allowlist, because `anon` has no policy on the table at
// all and a policy would leak every column added after it was written.

export type CertificateKind = "attendance" | "presenter" | "achievement";
export type CertificateState = "held" | "issued" | "revoked";

export interface CertificateRow {
  id: string;
  kind: CertificateKind;
  state: CertificateState;
  serial: string;
  verificationCode: string;
  recipientName: string;
  issuedAt: string | null;
  revokedAt: string | null;
  /** The member sees it and the admin sees it. The public page never does. */
  revocationReason: string | null;
  sessionId: string | null;
  sessionTitle: string | null;
  achievementName: string | null;
  /** The finished artifact, when one has rendered. */
  documentId: string | null;
  /** The storage path of the rendered PDF, once one is `ready`. `null`
   *  while the render is still in flight — which the screen says, rather
   *  than showing a download that 404s. */
  pdfPath: string | null;
  /** An achievement certificate's badge, when it is one. Filled by
   *  `listHeldAchievements()` (wave 8, `console`'s R-D2). */
  badgeName?: string | null;
  /** An achievement certificate's leaderboard period, when it is one — the
   *  board's kind and the frozen snapshot's dates, so a screen can say
   *  «المتصدّرون · أغسطس 2026» rather than print an ISO date (R-D2). */
  period?: { kind: string; start: string | null; end: string | null } | null;
}

interface RawRow {
  id: string;
  kind: CertificateKind;
  state: CertificateState;
  serial: string;
  verification_code: string;
  recipient_name_snapshot: string;
  issued_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  session_id: string | null;
  sessions: { title: string } | { title: string }[] | null;
  badges: { name: string } | { name: string }[] | null;
  design_documents: { id: string } | { id: string }[] | null;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const SELECT =
  "id, kind, state, serial, verification_code, recipient_name_snapshot, issued_at, revoked_at, revocation_reason, session_id, sessions(title), badges(name), design_documents(id)";

function toRow(r: RawRow): CertificateRow {
  return {
    id: r.id,
    kind: r.kind,
    state: r.state,
    serial: r.serial,
    verificationCode: r.verification_code,
    recipientName: r.recipient_name_snapshot,
    issuedAt: r.issued_at,
    revokedAt: r.revoked_at,
    revocationReason: r.revocation_reason,
    sessionId: r.session_id,
    sessionTitle: one(r.sessions)?.title ?? null,
    achievementName: one(r.badges)?.name ?? null,
    documentId: one(r.design_documents)?.id ?? null,
    pdfPath: null,
  };
}

/**
 * Fills in `pdfPath` for a batch of certificates.
 *
 * One query for the whole list, not one per row. `export_artifacts` is
 * readable to an org member whose `design_documents` row they can read
 * (`exports_read` joins to it, and that join runs under RLS), so a member
 * sees the artifact of their OWN certificate and no other — the filter
 * below is defence in depth.
 */
async function attachPdfs(supabase: SupabaseLike, rows: CertificateRow[]): Promise<CertificateRow[]> {
  const ids = rows.map((r) => r.documentId).filter((v): v is string => v !== null);
  if (ids.length === 0) return rows;
  const { data } = await supabase
    .from("export_artifacts")
    .select("document_id, storage_path, preset")
    .in("document_id", ids)
    .eq("format", "pdf")
    .eq("status", "ready");

  const byDocument = new Map<string, string>();
  for (const a of (data ?? []) as Array<{ document_id: string; storage_path: string | null; preset: string }>) {
    if (!a.storage_path) continue;
    // Landscape is the one the certificate templates are drawn for; the
    // portrait is there for an org that chose it. First one wins otherwise.
    if (a.preset === "cert_landscape" || !byDocument.has(a.document_id)) byDocument.set(a.document_id, a.storage_path);
  }
  return rows.map((r) => (r.documentId ? { ...r, pdfPath: byDocument.get(r.documentId) ?? null } : r));
}

/** The narrow slice of the Supabase client these helpers use. Typing it
 *  structurally keeps the generated database types out of this module. */
type SupabaseLike = Awaited<ReturnType<typeof sessionClient>>["supabase"];

/* ── SCR-023: the member's own ─────────────────────────────────────────── */

export interface MyCertificates {
  certificates: CertificateRow[];
}

/** REQ-CRT-013. A `held` certificate is not here and must not be: it is
 *  invisible until an admin releases it, and the RLS policy says so too —
 *  this filter is the second lock, not the first. */
export async function listMyCertificates(locale: string): Promise<MyCertificates> {
  const { session, supabase } = await sessionClient(locale);
  const [{ data }] = await Promise.all([
    supabase
      .from("certificates")
      .select(SELECT)
      .eq("member_id", session.memberId)
      .neq("state", "held")
      .order("issued_at", { ascending: false, nullsFirst: false }),
  ]);
  return {
    certificates: await attachPdfs(supabase, ((data ?? []) as unknown as RawRow[]).map(toRow)),
  };
}

/** A short-lived signed URL for a certificate PDF. Five minutes, the same as
 *  every other export: the bucket is private and the link is not a share. */
export async function signCertificateUrl(locale: string, storagePath: string): Promise<string | null> {
  const { supabase } = await sessionClient(locale);
  const { data } = await supabase.storage.from("exports").createSignedUrl(storagePath, 300);
  return data?.signedUrl ?? null;
}

/* ── SCR-045: the session's, for review and release ────────────────────── */

export interface SessionCertificates {
  sessionId: string;
  sessionTitle: string;
  mode: "off" | "automatic" | "review";
  state: string;
  held: CertificateRow[];
  issued: CertificateRow[];
  revoked: CertificateRow[];
  canRelease: boolean;
}

export async function getSessionCertificates(locale: string, sessionId: string): Promise<SessionCertificates | null> {
  const { session, supabase } = await sessionClient(locale);

  const [{ data: sessionRow }, { data: rows }] = await Promise.all([
    supabase.from("sessions").select("id, title, certificate_mode, state").eq("id", sessionId).maybeSingle(),
    supabase.from("certificates").select(SELECT).eq("session_id", sessionId).order("serial"),
  ]);
  if (!sessionRow) return null;

  const all = await attachPdfs(supabase, ((rows ?? []) as unknown as RawRow[]).map(toRow));
  return {
    sessionId,
    sessionTitle: sessionRow.title as string,
    mode: sessionRow.certificate_mode as SessionCertificates["mode"],
    state: sessionRow.state as string,
    held: all.filter((c) => c.state === "held"),
    issued: all.filter((c) => c.state === "issued"),
    revoked: all.filter((c) => c.state === "revoked"),
    canRelease: session.role === "admin",
  };
}

/* ── SCR-045 on the M9 system (wave 8): the design, who, and the render ── */

export type CertificateRenderStatus = "none" | "queued" | "rendering" | "ready" | "failed";

/** A session certificate with what SCR-045's rebuilt lists need on top of
 *  `CertificateRow`: the member, the pinned design, and whether its files
 *  rendered (REQ-DSG-031's «a failed certificate is re-issuable
 *  individually»). */
export interface SessionCertificateRow extends CertificateRow {
  memberId: string;
  /** Pinned at issue (DEC-148). `light` on a database before designer/0003. */
  scheme: BrandScheme;
  templateVersionId: string;
  renderStatus: CertificateRenderStatus;
  /** The failed artifact to retry, when the render failed. */
  failedArtifactId: string | null;
  renderError: string | null;
}

export interface SessionCertificatesV2 extends Omit<SessionCertificates, "held" | "issued" | "revoked"> {
  held: SessionCertificateRow[];
  issued: SessionCertificateRow[];
  revoked: SessionCertificateRow[];
}

/** SCR-045's certificates with their render status. `*` rather than a column
 *  list, so the pinned scheme is read where designer/0003 has added it
 *  without failing where it has not. */
export async function getSessionCertificatesWithRender(locale: string, sessionId: string): Promise<SessionCertificatesV2 | null> {
  const base = await getSessionCertificates(locale, sessionId);
  if (!base) return null;
  const { supabase } = await sessionClient(locale);

  const { data: raw } = await supabase.from("certificates").select("*").eq("session_id", sessionId);
  const extra = new Map<string, { member_id: string; template_version_id: string; scheme?: BrandScheme }>();
  for (const r of (raw ?? []) as Array<{ id: string; member_id: string; template_version_id: string; scheme?: BrandScheme }>) extra.set(r.id, r);

  const documentIds = [...base.held, ...base.issued, ...base.revoked].map((c) => c.documentId).filter((v): v is string => v !== null);
  const { data: artifacts } = documentIds.length
    ? await supabase.from("export_artifacts").select("id, document_id, status, error, created_at").in("document_id", documentIds).order("created_at", { ascending: false })
    : { data: [] as Array<{ id: string; document_id: string; status: string; error: string | null }> };

  // The latest request per document decides: a render retried after a
  // failure is `queued`, not failed, even though the old row still exists.
  const byDocument = new Map<string, Array<{ id: string; status: string; error: string | null }>>();
  for (const a of (artifacts ?? []) as Array<{ id: string; document_id: string; status: string; error: string | null }>) {
    byDocument.set(a.document_id, [...(byDocument.get(a.document_id) ?? []), a]);
  }

  const enrich = (c: CertificateRow): SessionCertificateRow => {
    const e = extra.get(c.id);
    const list = c.documentId ? (byDocument.get(c.documentId) ?? []) : [];
    const failed = list.find((a) => a.status === "failed");
    const status: CertificateRenderStatus = list.length === 0
      ? "none"
      : failed
        ? "failed"
        : list.some((a) => a.status === "rendering")
          ? "rendering"
          : list.some((a) => a.status === "queued")
            ? "queued"
            : "ready";
    return {
      ...c,
      memberId: e?.member_id ?? "",
      scheme: e?.scheme ?? "light",
      templateVersionId: e?.template_version_id ?? "",
      renderStatus: status,
      failedArtifactId: failed?.id ?? null,
      renderError: failed?.error ?? null,
    };
  };

  return { ...base, held: base.held.map(enrich), issued: base.issued.map(enrich), revoked: base.revoked.map(enrich) };
}

export type SessionCertificateKind = "attendance" | "presenter";

export interface CertificateTemplateOption {
  id: string;
  name: string;
  scope: "platform" | "org";
  isDefault: boolean;
  orientation: "landscape" | "portrait";
  document: DesignDocument;
}

export interface CertificateDesignData {
  kinds: Array<{
    kind: SessionCertificateKind;
    /** The design set for this session, or null — issuance then uses the
     *  family default, light. */
    chosen: { templateId: string; scheme: BrandScheme } | null;
    /** What issuance would use right now: the chosen template, else the
     *  family default (the org's, else the platform's). */
    effectiveTemplateId: string | null;
    options: CertificateTemplateOption[];
    /** A certificate of this kind has reached a member — the design is fixed. */
    locked: boolean;
    heldCount: number;
    /** What this kind's certificates were pinned to at issue (DEC-148), when
     *  any exist — the screen says what they WERE issued with, not what a
     *  design that was never saved would fall back to. */
    issuedWith: { templateName: string; scheme: BrandScheme } | null;
  }>;
  /** The org's brand over the platform palette, in both schemes, so the
   *  preview follows the scheme the admin is choosing without a round trip. */
  brand: Record<BrandScheme, Record<string, string>>;
  /** Real data for the preview (REQ-DSG-006): a real name from this session,
   *  its title, the org. The serial and the code are the template's own
   *  fallbacks until a certificate exists. */
  sample: Record<string, string>;
  canEdit: boolean;
}

/** SCR-045's «التصميم» — DEC-128, DEC-148. */
export async function getCertificateDesign(locale: string, sessionId: string): Promise<CertificateDesignData | null> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin" && session.role !== "moderator") return null;

  const [{ data: sessionRow }, { data: templates }, { data: designs }, { data: certs }, { data: org }, { data: settings }] = await Promise.all([
    supabase.from("sessions").select("id, title, completed_at, starts_at").eq("id", sessionId).maybeSingle(),
    supabase.from("design_templates").select("id, name, scope, family, is_default, org_id").eq("purpose", "certificate").is("retired_at", null).in("family", ["attendance", "presenter"]),
    // Absent before designer/0003 — an error there reads as «no design».
    supabase.from("session_certificate_designs").select("kind, template_id, scheme").eq("session_id", sessionId),
    supabase
      .from("certificates")
      .select("kind, state, scheme, issued_at, design_template_versions(design_templates(name))")
      .eq("session_id", sessionId)
      .order("serial"),
    supabase.from("orgs").select("name").eq("id", session.orgId).maybeSingle(),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
  ]);
  if (!sessionRow) return null;

  const ids = (templates ?? []).map((t) => t.id as string);
  const { data: versions } = ids.length
    ? await supabase.from("design_template_versions").select("template_id, version, document, published_at").in("template_id", ids).not("published_at", "is", null).order("version", { ascending: false })
    : { data: [] as Array<{ template_id: string; version: number; document: unknown }> };
  const latest = new Map<string, DesignDocument>();
  for (const v of (versions ?? []) as Array<{ template_id: string; document: unknown }>) {
    if (latest.has(v.template_id)) continue;
    const parsed = validateDocument(v.document);
    if (parsed.ok) latest.set(v.template_id, parsed.document);
  }

  const rows = (templates ?? []) as Array<{ id: string; name: string; scope: "platform" | "org"; family: string; is_default: boolean; org_id: string | null }>;
  const kinds = (["attendance", "presenter"] as const).map((kind) => {
    const options: CertificateTemplateOption[] = rows
      .filter((t) => t.family === kind && latest.has(t.id))
      .map((t) => ({ id: t.id, name: t.name, scope: t.scope, isDefault: t.is_default, orientation: orientationOf(latest.get(t.id)!), document: latest.get(t.id)! }))
      // The org's own first, then defaults, then landscape before portrait.
      .sort((a, b) => Number(a.scope === "platform") - Number(b.scope === "platform") || Number(b.isDefault) - Number(a.isDefault) || a.orientation.localeCompare(b.orientation));
    const design = ((designs ?? []) as Array<{ kind: string; template_id: string; scheme: BrandScheme }>).find((d) => d.kind === kind) ?? null;
    const fallback = options.find((o) => o.scope === "org" && o.isDefault) ?? options.find((o) => o.isDefault) ?? options[0] ?? null;
    type Cert = {
      kind: string;
      state: string;
      scheme: BrandScheme;
      design_template_versions: { design_templates: { name: string } | { name: string }[] | null } | { design_templates: { name: string } | { name: string }[] | null }[] | null;
    };
    const mine = ((certs ?? []) as unknown as Cert[]).filter((c) => c.kind === kind);
    // A redesign re-pins only held rows, so the newest pin is the one a held
    // row carries; an issued row's is fixed. The first row in serial order is
    // what the kind was issued with.
    const pinned = mine[0] ?? null;
    const templateName = pinned ? (one(one(pinned.design_template_versions)?.design_templates ?? null)?.name ?? null) : null;
    return {
      kind,
      chosen: design ? { templateId: design.template_id, scheme: design.scheme } : null,
      effectiveTemplateId: design?.template_id ?? fallback?.id ?? null,
      options,
      locked: mine.some((c) => c.state === "issued" || c.state === "revoked"),
      heldCount: mine.filter((c) => c.state === "held").length,
      issuedWith: pinned && templateName ? { templateName, scheme: pinned.scheme } : null,
    };
  });

  const timeZone = (settings?.time_zone as string | undefined) ?? "Asia/Riyadh";
  // ★ No recipient name here: a name belongs to a KIND — an attendee's name on
  // the presenter preview is a person who will never receive that
  // certificate. The panel binds each kind's own longest eligible name, and
  // with none the template's marked placeholder shows (REQ-DSG-006).
  const sample: Record<string, string> = { "session.title": sessionRow.title as string };
  if (org?.name) sample["org.name"] = org.name as string;
  const when = (sessionRow.completed_at as string | null) ?? (sessionRow.starts_at as string | null);
  if (when) sample["certificate.issuedAt"] = formatBindingDate(when, timeZone, "ar");

  const [light, dark] = await Promise.all([previewBrandBindings(locale, "light"), previewBrandBindings(locale, "dark")]);
  return { kinds, brand: { light, dark }, sample, canEdit: session.role === "admin" };
}

export interface EligibleRecipient {
  memberId: string;
  name: string;
  kind: SessionCertificateKind;
  /** ★ A checked-in member whose attendance certificate was revoked — a
   *  removed-then-re-added check-in, which today gets no new certificate
   *  (the fan-out fires once, at completion). Shown so staff SEE the gap
   *  rather than finding it (my note, W8.g). */
  revokedButPresent: boolean;
}

/** SCR-045's «من يستحق» — exactly who `fan_out_certificates()` reads: active
 *  check-ins and accepted presenters (REQ-CRT-001, DEC-141). */
export async function listEligibleRecipients(locale: string, sessionId: string): Promise<EligibleRecipient[]> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin" && session.role !== "moderator") return [];

  const [checkInRead, presenterRead, { data: certs }] = await Promise.all([
    // The member's own embed, named: `check_ins` reaches `members` through
    // `marked_by` and `removed_by` too, and the unnamed embed is an ambiguity
    // error — which, swallowed, rendered as «لا أحد بعد» over a full room.
    supabase.from("check_ins").select("member_id, members!check_ins_member_id_fkey(display_name)").eq("session_id", sessionId).is("removed_at", null),
    supabase.from("session_presenters").select("member_id, members(display_name)").eq("session_id", sessionId).eq("accepted", true),
    supabase.from("certificates").select("id, member_id, kind, state").eq("session_id", sessionId),
  ]);
  // A failed read is thrown, never shown as an empty list: «nobody is
  // eligible» is a claim, and the route's error boundary is the honest answer.
  if (checkInRead.error) throw checkInRead.error;
  if (presenterRead.error) throw presenterRead.error;
  const checkIns = checkInRead.data;
  const presenters = presenterRead.data;
  type Joined = { member_id: string; members: { display_name: string } | { display_name: string }[] | null };
  const certsBy = (memberId: string, kind: string) => ((certs ?? []) as Array<{ member_id: string; kind: string; state: string }>).filter((c) => c.member_id === memberId && c.kind === kind);

  const out: EligibleRecipient[] = [];
  for (const [kind, list] of [
    ["attendance", checkIns],
    ["presenter", presenters],
  ] as const) {
    for (const r of (list ?? []) as Joined[]) {
      const mine = certsBy(r.member_id, kind);
      out.push({
        memberId: r.member_id,
        name: one(r.members)?.display_name ?? "",
        kind,
        revokedButPresent: mine.length > 0 && mine.every((c) => c.state === "revoked"),
      });
    }
  }
  return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "ar"));
}

export const certificateDesignInput = z.object({
  sessionId: z.uuid(),
  kind: z.enum(["attendance", "presenter"]),
  templateId: z.uuid(),
  scheme: z.enum(["light", "dark"]),
});

export type DesignWriteResult = { status: "ok"; count?: number } | { status: "locked" } | { status: "invalid" } | { status: "not_authorized" };

export async function setCertificateDesign(locale: string, input: z.infer<typeof certificateDesignInput>): Promise<DesignWriteResult> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("set_certificate_design", {
    p_session: input.sessionId,
    p_kind: input.kind,
    p_template: input.templateId,
    p_scheme: input.scheme,
  });
  if (!error) return { status: "ok" };
  return error.code === "55000" ? { status: "locked" } : error.code === "22023" ? { status: "invalid" } : { status: "not_authorized" };
}

export async function redesignHeldCertificates(locale: string, sessionId: string, kind: SessionCertificateKind): Promise<DesignWriteResult> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("redesign_held_certificates", { p_session: sessionId, p_kind: kind });
  if (!error) return { status: "ok", count: typeof data === "number" ? data : 0 };
  return error.code === "22023" ? { status: "invalid" } : { status: "not_authorized" };
}

/* ── the two writes, both RPCs, both audited in their own transaction ──── */

export const releaseInput = z.object({ ids: z.array(z.uuid()).min(1).max(500) });
export const revokeInput = z.object({
  id: z.uuid(),
  // MANDATORY (REQ-CRT-011). Checked here for the message and again in the
  // function for the guarantee.
  reason: z.string().trim().min(3).max(500),
});

export type WriteResult = { status: "ok"; count: number } | { status: "not_authorized" } | { status: "reason_required" };

export async function releaseCertificates(locale: string, input: z.infer<typeof releaseInput>): Promise<WriteResult> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("release_certificates", { p_ids: input.ids });
  if (error) return { status: "not_authorized" };
  return { status: "ok", count: Array.isArray(data) ? data.length : 0 };
}

export async function revokeCertificate(locale: string, input: z.infer<typeof revokeInput>): Promise<WriteResult> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("revoke_certificate", { p_certificate: input.id, p_reason: input.reason });
  if (error) return { status: error.code === "22023" ? "reason_required" : "not_authorized" };
  return { status: "ok", count: 1 };
}

/* ── REQ-CRT-002: the mode, for the event page's badge ─────────────────── */

export async function getCertificateMode(locale: string, sessionId: string): Promise<"off" | "automatic" | "review" | null> {
  const { supabase } = await sessionClient(locale);
  const { data } = await supabase.from("sessions").select("certificate_mode").eq("id", sessionId).maybeSingle();
  return (data?.certificate_mode as "off" | "automatic" | "review" | undefined) ?? null;
}

/* ── SCR-006: the public page ──────────────────────────────────────────── */

export interface VerifiedCertificate {
  recipientName: string;
  kind: CertificateKind;
  sessionTitle: string | null;
  sessionDate: string | null;
  achievementName: string | null;
  orgName: string;
  issuedAt: string | null;
  state: "issued" | "revoked";
}

export type VerifyOutcome = { status: "found"; certificate: VerifiedCertificate } | { status: "not_found" } | { status: "rate_limited" };

/** The shape of a verification code: `new_verification_code()` (0055) takes
 *  24 characters of base64url, so the alphabet is `A–Z a–z 0–9 - _` and it
 *  is CASE-SENSITIVE — upper-casing the input here would turn every valid
 *  code into a miss. A serial (`KM-2026-000001`, 14 characters) cannot match
 *  it, which is REQ-CRT-009 enforced twice: here so the database is not even
 *  touched, and in `verify_certificate()` for the guarantee. */
const CODE_SHAPE = /^[A-Za-z0-9_-]{24}$/;

/** REQ-NFR-005. A fixed window per client, in this process.
 *
 *  ★ IT IS PER-INSTANCE, AND THAT IS A KNOWN LIMIT, not an oversight. A
 *  shared counter needs a store the platform does not have yet; until it
 *  does, this raises the cost of enumeration by a large factor without
 *  pretending to be a global limit. The real guarantee against enumeration
 *  is the code itself — `new_verification_code()`'s alphabet over 12
 *  characters is far beyond what any rate can walk (REQ-CRT-010). */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, now = Date.now()): boolean {
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    // Bounded: an unbounded map keyed by client IP is a memory leak with a
    // user-supplied key, which is a denial of service with extra steps.
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_PER_WINDOW;
}

/**
 * The public lookup. NO SESSION — this is the one DAL function that does not
 * call `requireSession()`, because SCR-006 is unauthenticated by design and
 * `verify_certificate()` is granted to `anon`. The server client with no
 * cookie runs as `anon`, which has no policy on `certificates` at all.
 */
export async function verifyCertificate(code: string, clientKey: string): Promise<VerifyOutcome> {
  if (!rateLimit(clientKey)) return { status: "rate_limited" };
  const normalised = code.trim();
  if (!CODE_SHAPE.test(normalised)) return { status: "not_found" };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("verify_certificate", { p_code: normalised });
  if (error) return { status: "not_found" };
  const row = (Array.isArray(data) ? data[0] : null) as
    | {
        recipient_name: string;
        kind: CertificateKind;
        session_title: string | null;
        session_date: string | null;
        achievement_name: string | null;
        org_name: string;
        issued_at: string | null;
        state: "issued" | "revoked";
      }
    | null
    | undefined;
  if (!row) return { status: "not_found" };

  return {
    status: "found",
    certificate: {
      recipientName: row.recipient_name,
      kind: row.kind,
      sessionTitle: row.session_title,
      sessionDate: row.session_date,
      achievementName: row.achievement_name,
      orgName: row.org_name,
      issuedAt: row.issued_at,
      state: row.state,
    },
  };
}

/** The org's time zone, for a screen that prints an issue date. Paired with
 *  `getOrgNumerals` in the designer DAL; both read `org_settings` so a
 *  screen never has to know that table exists. */
export async function getOrgTimeZone(locale: string): Promise<string> {
  const { session, supabase } = await sessionClient(locale);
  const { data } = await supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle();
  return (data?.time_zone as string | undefined) ?? "Asia/Riyadh";
}

/* ── SCR-045's serial line: an ESTIMATE, never a reservation ───────────── */

/**
 * The next serial this org would allocate, read from the org's own
 * certificates — never from `certificate_serial_counters`, which has no
 * policy at all (03 §5.8) and is touched only inside `allocate_serial()`.
 *
 * ★ An estimate, and the screen says so (DEC-148). The counter is gapless —
 * a rollback returns its number (DEC-010) — so this year's highest issued
 * serial plus one IS the counter's state at the moment of reading. But
 * another session completing first takes those numbers, and nothing here
 * holds them: a reservation would be a second allocator, and a second
 * allocator is how a register grows a gap.
 *
 * Admin only: `certs_read_held_admin` is what makes every serial in the org
 * readable, and a moderator reads none (null).
 */
export async function estimateNextSerial(locale: string): Promise<{ prefix: string; year: number; next: number } | null> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return null;

  const [{ data: org }, { data: settings }] = await Promise.all([
    supabase.from("orgs").select("certificate_prefix").eq("id", session.orgId).maybeSingle(),
    supabase.from("org_settings").select("time_zone").eq("org_id", session.orgId).maybeSingle(),
  ]);
  const prefix = org?.certificate_prefix as string | undefined;
  if (!prefix) return null;

  // The ORG's year, as `allocate_serial()` reads it — a certificate issued
  // at 02:00 Riyadh on 1 January prints the new year.
  const timeZone = (settings?.time_zone as string | undefined) ?? "UTC";
  const year = Number(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(new Date()));

  // `lpad(…, 6, '0')` makes the text order the numeric order.
  const { data } = await supabase
    .from("certificates")
    .select("serial")
    .like("serial", `${prefix}-${year}-%`)
    .order("serial", { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = data?.serial ? Number((data.serial as string).slice(`${prefix}-${year}-`.length)) : 0;
  return { prefix, year, next: (Number.isFinite(last) ? last : 0) + 1 };
}

/* ── the held achievement certificates (REQ-CRT-012) ───────────────────── */

/**
 * Every `held` achievement certificate in the org.
 *
 * SCR-045 is per session, and an achievement certificate has no session, so
 * there is no screen in `09` that can release one. `<HeldAchievements>` is
 * this track's answer: a slot the recognition screen renders, published the
 * same way as the three event-page slots (TEAM.md §2) so the wiring is one
 * import rather than a new route in somebody else's folder.
 */
export async function listHeldAchievements(locale: string): Promise<{ certificates: CertificateRow[]; canRelease: boolean }> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin") return { certificates: [], canRelease: false };

  const { data } = await supabase
    .from("certificates")
    .select("id, kind, state, serial, verification_code, recipient_name_snapshot, issued_at, revoked_at, revocation_reason, session_id, sessions(title), badges(name), design_documents(id), leaderboard_snapshots(kind, period_start, period_end)")
    .eq("kind", "achievement")
    .eq("state", "held")
    .order("serial");

  type Raw = RawRow & { leaderboard_snapshots: { kind: string; period_start: string | null; period_end: string | null } | null };
  const rows = ((data ?? []) as unknown as Raw[]).map((r) => ({
    ...toRow(r),
    // The achievement's own name when it is a badge; the period when it is a
    // leaderboard, because «الشهر الماضي» is what an admin recognises and a
    // snapshot uuid is not.
    achievementName: one(r.badges)?.name ?? (r.leaderboard_snapshots?.period_start ?? null),
    badgeName: one(r.badges)?.name ?? null,
    period: r.leaderboard_snapshots
      ? { kind: r.leaderboard_snapshots.kind, start: r.leaderboard_snapshots.period_start, end: r.leaderboard_snapshots.period_end }
      : null,
  }));
  return { certificates: rows, canRelease: true };
}
