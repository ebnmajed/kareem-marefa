import "server-only";
import { z } from "zod";
import { formatDateTime, formatNumber } from "@/components/sessions/numerals";
import { listMembersForAdmin } from "@/lib/dal/admin-members";
import { getAttendanceReport } from "@/lib/dal/checkin";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { sessionClient } from "@/lib/dal/session";
import { listSessionsForAdmin } from "@/lib/dal/sessions";

// SCR-044/SCR-061 — CSV exports (REQ-ADM-017, REQ-CHK-012's CSV acceptance).
//
// Exports are Route Handlers, never Server Actions (CLAUDE.md's own rule —
// a download, not a 1 MB-capped mutation). This module holds the shape and
// the audit call; the route handler under `src/app/api/admin/**` is a thin
// caller that turns the result into a `text/csv` response.
//
// UTF-8 **with a BOM** so Excel opens Arabic without a manual import step,
// Arabic column headers, the org's own numeral system wherever a number
// appears (dates and times already carry it through `formatDateTime`) —
// REQ-ADM-017's three acceptance criteria, restated here because every
// export this track ships has to satisfy all three, not just this one.

const BOM = "﻿";

/** RFC 4180: a field containing a comma, a quote or a newline is quoted,
 *  and an internal quote is doubled. Excel and every other reader agree on
 *  this even though the RFC predates them; nothing here is Excel-specific. */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(","));
  // CRLF per RFC 4180 — a reader that only recognises \n still works, but a
  // strict one does not accept a bare \n as a record terminator.
  return BOM + lines.join("\r\n") + "\r\n";
}

/** REQ-ADM-017: "every export is audited — an export is a bulk read of
 *  personal data." Calls `write_admin_export_audit()`
 *  (`supabase/proposed/console/0002_admin_export_audit.sql`) — a
 *  `security definer` function whose OWN `assert_fresh_admin()` is the
 *  real boundary; this never trusts the caller's claim-side role alone. */
async function auditExport(locale: string, exportType: string, subjectType?: string, subjectId?: string): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("write_admin_export_audit", {
    p_export_type: exportType,
    p_subject_type: subjectType ?? null,
    p_subject_id: subjectId ?? null,
  });
  if (error) throw new Error(`write_admin_export_audit: ${error.message}`);
}

const ATTENDANCE_HEADERS_AR = ["الاسم", "حالة الحجز", "سجَّل حضوره", "وقت الوصول", "طريقة التسجيل", "علامة يدوية"];

const RSVP_STATUS_AR: Record<string, string> = {
  confirmed: "مؤكَّد",
  waitlisted: "قائمة انتظار",
  cancelled: "ملغى",
  late_cancelled: "إلغاء متأخر",
};

/**
 * SCR-044's own export (`REQ-CHK-012`: "exportable as CSV with the
 * manual-mark flag intact"). Admin only — exports sit outside a
 * moderator's scope (09 §5's coverage table), checked here AND by
 * `write_admin_export_audit()`'s own `assert_fresh_admin()`.
 */
export async function exportAttendanceCsv(locale: string, sessionId: string): Promise<{ csv: string; sessionTitle: string } | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const { session } = await sessionClient(locale);
  if (session.role !== "admin") return null;

  const [report, prefs] = await Promise.all([getAttendanceReport(locale, sessionId), getOrgPrefs(locale)]);
  if (!report) return null;

  const rows = report.rows.map((r) => [
    r.displayName ?? "",
    r.rsvpStatus ? (RSVP_STATUS_AR[r.rsvpStatus] ?? r.rsvpStatus) : r.isWalkIn ? "بلا حجز (حضور مباشر)" : "",
    r.checkedIn ? "نعم" : "لا",
    r.arrivedAt ? formatDateTime(r.arrivedAt, prefs.numerals, prefs.timeZone, locale) : "",
    r.method === "code" ? "رمز الحضور" : r.method === "manual" ? "تسجيل يدوي" : "",
    r.method === "manual" ? "نعم" : "لا",
  ]);

  await auditExport(locale, "attendance", "session", sessionId);
  return { csv: buildCsv(ATTENDANCE_HEADERS_AR, rows), sessionTitle: report.sessionTitle };
}

// ── SCR-061 — org-wide exports (REQ-ADM-017) ─────────────────────────────
//
// Six more types, all admin-only, all audited the same way. Each is a
// plain read through a table/view/function the admin's own RLS already
// lets them see in full — no new RPC needed for any of them.

async function requireAdmin(locale: string) {
  const client = await sessionClient(locale);
  return client.session.role === "admin" ? client : null;
}

export async function exportSessionsCsv(locale: string): Promise<string | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const [sessions, prefs] = await Promise.all([listSessionsForAdmin(locale), getOrgPrefs(locale)]);
  if (sessions === null) return null;

  const rows = sessions.map((s) => [
    s.title,
    s.state,
    s.level,
    s.language,
    s.startsAt ? formatDateTime(s.startsAt, prefs.numerals, prefs.timeZone, locale) : "",
    s.presenters
      .filter((p) => p.accepted)
      .map((p) => p.displayName ?? "")
      .join("، "),
  ]);
  await auditExport(locale, "sessions");
  return buildCsv(["العنوان", "الحالة", "المستوى", "اللغة", "التاريخ والوقت", "المُقدِّمون"], rows);
}

export async function exportRsvpsCsv(locale: string): Promise<string | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const { data, error } = await supabase
    .from("rsvps")
    .select("status, waitlist_position, reserved_at, session_id, member_id, sessions(title), members(display_name)")
    .eq("org_id", session.orgId)
    .order("reserved_at", { ascending: false });
  if (error) throw new Error(`rsvps: ${error.message}`);
  const prefs = await getOrgPrefs(locale);

  const rows = (data ?? []).map((r) => {
    const s = (r as unknown as { sessions: { title: string } | null }).sessions;
    const m = (r as unknown as { members: { display_name: string | null } | null }).members;
    return [
      s?.title ?? "",
      m?.display_name ?? "",
      RSVP_STATUS_AR[r.status as string] ?? (r.status as string),
      r.waitlist_position !== null ? formatNumber(r.waitlist_position as number, prefs.numerals) : "",
      formatDateTime(r.reserved_at as string, prefs.numerals, prefs.timeZone, locale),
    ];
  });
  await auditExport(locale, "rsvps");
  return buildCsv(["الجلسة", "العضو", "الحالة", "ترتيب الانتظار", "وقت الحجز"], rows);
}

export async function exportAllAttendanceCsv(locale: string): Promise<string | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const { data, error } = await supabase
    .from("check_ins")
    // `!check_ins_member_id_fkey`: `check_ins` has two FKs into `members`
    // (`member_id`, `marked_by`) — an unqualified embed is ambiguous and
    // PostgREST refuses it (`getAttendanceReport()`'s own header explains
    // the discovery).
    .select("arrived_at, method, session_id, member_id, sessions(title), members!check_ins_member_id_fkey(display_name)")
    .eq("org_id", session.orgId)
    .order("arrived_at", { ascending: false });
  if (error) throw new Error(`check_ins: ${error.message}`);
  const prefs = await getOrgPrefs(locale);

  const rows = (data ?? []).map((r) => {
    const s = (r as unknown as { sessions: { title: string } | null }).sessions;
    const m = (r as unknown as { members: { display_name: string | null } | null }).members;
    return [
      s?.title ?? "",
      m?.display_name ?? "",
      formatDateTime(r.arrived_at as string, prefs.numerals, prefs.timeZone, locale),
      r.method === "code" ? "رمز الحضور" : "تسجيل يدوي",
      r.method === "manual" ? "نعم" : "لا",
    ];
  });
  await auditExport(locale, "attendance");
  return buildCsv(["الجلسة", "العضو", "وقت الوصول", "طريقة التسجيل", "علامة يدوية"], rows);
}

/**
 * Aggregate, not per-rater. Per-rater ratings are `REQ-RAT-005`'s own
 * audited screen (SCR-044), read one session at a time through
 * `list_session_ratings_admin()`; looping that RPC over every session in
 * the org to build one bulk export would multiply its audit rows for a
 * shape nobody asked for. `session_rating_aggregates` (0010) already gives
 * admin the count/averages without a second audited path — the same
 * `rating_min_aggregate` withholding it applies to a presenter also
 * applies here, unrelated to anything this track changed.
 */
export async function exportRatingsCsv(locale: string): Promise<string | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const { data, error } = await supabase
    .from("session_rating_aggregates")
    .select("session_id, rating_count, session_avg, presenter_avg, sessions(title)")
    .eq("org_id", session.orgId);
  if (error) throw new Error(`session_rating_aggregates: ${error.message}`);
  const prefs = await getOrgPrefs(locale);
  const num = (n: number) => formatNumber(n, prefs.numerals);

  const rows = (data ?? []).map((r) => {
    const s = (r as unknown as { sessions: { title: string } | null }).sessions;
    return [s?.title ?? "", num(r.rating_count as number), num(r.session_avg as number), num(r.presenter_avg as number)];
  });
  await auditExport(locale, "ratings");
  return buildCsv(["الجلسة", "عدد التقييمات", "متوسط تقييم الجلسة", "متوسط تقييم المُقدِّم"], rows);
}

export async function exportPointsCsv(locale: string): Promise<string | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const { data, error } = await supabase
    .from("points_ledger")
    // `!points_ledger_member_id_fkey`: `points_ledger` has two FKs into
    // `members` (`member_id`, the recipient, and `actor_id`, who wrote a
    // manual adjustment) — the same ambiguous-embed shape
    // `getAttendanceReport()`'s header explains.
    .select("amount, source, reason, occurred_at, member_id, members!points_ledger_member_id_fkey(display_name)")
    .eq("org_id", session.orgId)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(`points_ledger: ${error.message}`);
  const prefs = await getOrgPrefs(locale);

  const rows = (data ?? []).map((r) => {
    const m = (r as unknown as { members: { display_name: string | null } | null }).members;
    return [m?.display_name ?? "", formatNumber(r.amount as number, prefs.numerals), r.source as string, r.reason as string, formatDateTime(r.occurred_at as string, prefs.numerals, prefs.timeZone, locale)];
  });
  await auditExport(locale, "points");
  return buildCsv(["العضو", "القيمة", "المصدر", "السبب", "التاريخ"], rows);
}

const CERT_STATE_AR: Record<string, string> = { held: "محجوزة", released: "صادرة", revoked: "مُلغاة" };

export async function exportCertificatesCsv(locale: string): Promise<string | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { session, supabase } = client;

  const { data, error } = await supabase
    .from("certificates")
    .select("serial, kind, state, recipient_name_snapshot, issued_at, session_id, sessions(title)")
    .eq("org_id", session.orgId)
    .order("issued_at", { ascending: false, nullsFirst: true });
  if (error) throw new Error(`certificates: ${error.message}`);
  const prefs = await getOrgPrefs(locale);

  const rows = (data ?? []).map((c) => {
    const s = (c as unknown as { sessions: { title: string } | null }).sessions;
    return [
      c.serial as string,
      c.recipient_name_snapshot as string,
      c.kind as string,
      s?.title ?? "",
      CERT_STATE_AR[c.state as string] ?? (c.state as string),
      c.issued_at ? formatDateTime(c.issued_at as string, prefs.numerals, prefs.timeZone, locale) : "",
    ];
  });
  await auditExport(locale, "certificates");
  return buildCsv(["الرقم التسلسلي", "العضو", "النوع", "الجلسة", "الحالة", "تاريخ الإصدار"], rows);
}

const MEMBER_ROLE_AR: Record<string, string> = { admin: "مشرف المؤسسة", moderator: "مُنظِّم", member: "عضو" };
const MEMBER_STATUS_AR: Record<string, string> = { active: "نشط", deactivated: "معطَّل" };

export async function exportMembersCsv(locale: string): Promise<string | null> {
  const [members, prefs] = await Promise.all([listMembersForAdmin(locale), getOrgPrefs(locale)]);
  if (members === null) return null;

  const rows = members.map((m) => [
    m.displayName ?? "",
    m.email,
    MEMBER_ROLE_AR[m.role],
    MEMBER_STATUS_AR[m.status],
    formatDateTime(m.createdAt, prefs.numerals, prefs.timeZone, locale),
  ]);
  await auditExport(locale, "members");
  return buildCsv(["الاسم", "البريد الإلكتروني", "الدور", "الحالة", "تاريخ الانضمام"], rows);
}
