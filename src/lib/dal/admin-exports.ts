import "server-only";
import { z } from "zod";
import { dayLabel, type DayLabelKey, type DayLabelT } from "@/components/sessions/day-label";
import { formatNumber } from "@/components/sessions/numerals";
import { listMembersForAdmin } from "@/lib/dal/admin-members";
import { getAttendanceReport, type AttendanceReport } from "@/lib/dal/checkin";
import arSessions from "@/messages/ar/sessions.json";
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
// Arabic column headers, every export audited — REQ-ADM-017's acceptance,
// restated here because every export this track ships has to satisfy it.
//
// ★ Wave 8 (`DEC-148`, the lead's sync-1 ruling on K2), two things a
// spreadsheet needs that the CSVs did not give it:
//
//  · DATES A SPREADSHEET CAN SORT. Every date was Arabic prose — «الخميس، 17
//    سبتمبر 2026 في 3:00 م» — which Excel reads as text. Each is now
//    `YYYY-MM-DD HH:mm` in the org's zone, and the column header names the
//    zone, so a reader in another city knows which clock it is.
//  · ARABIC VALUES UNDER ARABIC HEADERS. A session's state, level and
//    language, a ledger row's source and a certificate's kind printed their
//    English enum values. And an issued certificate printed `issued` raw: the
//    map said `released`, a state the enum never had.
//
// Digits are Western everywhere, always (`DEC-124`, `REQ-INT-006`); there is
// no setting for them to follow.

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

/** A spreadsheet's date: `YYYY-MM-DD HH:mm` on the org's clock. */
export function csvDateTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** A date column's header, naming the clock its values are on. */
const whenHeader = (label: string, timeZone: string) => `${label} (${timeZone})`;

const SESSION_STATE_AR: Record<string, string> = {
  draft: "مسودة",
  submitted: "مُقدَّمة",
  in_review: "قيد المراجعة",
  changes_requested: "بانتظار تعديل",
  approved: "معتمدة",
  published: "منشورة",
  in_progress: "جارية",
  completed: "انتهت",
  archived: "مؤرشفة",
  cancelled: "أُلغيت",
};
const SESSION_LEVEL_AR: Record<string, string> = { introductory: "تمهيدي", intermediate: "متوسط", advanced: "متقدم" };
const SESSION_LANGUAGE_AR: Record<string, string> = { ar: "العربية", en: "الإنجليزية" };
const LEDGER_SOURCE_AR: Record<string, string> = {
  check_in: "تسجيل حضور",
  rating: "تقييم جلسة",
  comment: "تعليق",
  photo: "صورة",
  streak: "سلسلة حضور",
  proposal_accepted: "قبول مقترح",
  session_delivered: "تقديم جلسة",
  attendee_bonus: "مكافأة الحضور",
  rating_bonus: "تقييم عالٍ للجلسة",
  materials_uploaded: "رفع مواد الجلسة",
  no_show: "تغيّب بعد الحجز",
  late_cancellation: "إلغاء متأخر",
  content_removed: "حُذف المحتوى",
  manual_adjustment: "تعديل يدوي",
  reversal: "عكس قيد",
};
const CERT_KIND_AR: Record<string, string> = { attendance: "حضور", presenter: "تقديم", achievement: "إنجاز" };

const ATTENDANCE_HEADERS_AR = (timeZone: string) => ["الاسم", "حالة الحجز", "سجَّل حضوره", whenHeader("وقت الوصول", timeZone), "طريقة التسجيل", "علامة يدوية"];

const RSVP_STATUS_AR: Record<string, string> = {
  confirmed: "مؤكَّد",
  waitlisted: "قائمة انتظار",
  cancelled: "ملغى",
  late_cancelled: "إلغاء متأخر",
};

// ── The day column (DEC-119, REQ-SES-017, wave 9 row L5) ────────────────
//
// ★ AT ONE DAY THE FILE IS BYTE-IDENTICAL TO WAVE 7's. Same six headers, same
// one row per member, read from the row's flat summary fields — which
// `getAttendanceReport()` keeps with exactly the meaning they had. There is no
// «اليوم» column with one value in it: a column that says «اليوم الأول» on
// every line of every export the org has ever downloaded is noise, and a
// spreadsheet somebody built on the six-column shape would shift by one.
//
// From two days the question the file answers changes — «who attended WHICH»
// — so it is one line per member PER DAY, the day named in its own column,
// and «أكمل الحضور» last: `session_attendance_complete()`'s answer (contract
// 6), which is who gets the points and the certificate. Long, not wide: the
// number of columns does not depend on the number of days, so one pivot works
// for a two-day session and a ten-day one.
//
// The day's WORDS are contract 7's — `dayLabel()` over `sessions.days`, the
// same «اليوم الأول · الأربعاء» the attendance screen shows. Exports are
// Arabic-only (every header here is), so the translator is the structural one
// `day-label.ts` was written to accept, over the Arabic source itself; no
// next-intl in a DAL module, and no second copy of the ten ordinals.
const DAY_MESSAGES = arSessions.sessions.days;
const dayWords: DayLabelT = (key: DayLabelKey, values = {}) => {
  const template = key.startsWith("ordinal.")
    ? DAY_MESSAGES.ordinal[key.slice("ordinal.".length) as keyof typeof DAY_MESSAGES.ordinal]
    : (DAY_MESSAGES[key as Exclude<DayLabelKey, `ordinal.${string}`>] as string);
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
};

const methodLabel = (method: "code" | "manual" | null) => (method === "code" ? "رمز الحضور" : method === "manual" ? "تسجيل يدوي" : "");
const rsvpLabel = (r: { rsvpStatus: string | null; isWalkIn: boolean }) =>
  r.rsvpStatus ? (RSVP_STATUS_AR[r.rsvpStatus] ?? r.rsvpStatus) : r.isWalkIn ? "بلا حجز (حضور مباشر)" : "";

/** The per-session attendance sheet — pure, so the one-day shape is pinned by a test. */
export function attendanceSheet(report: Pick<AttendanceReport, "rows" | "days" | "timeZone">, timeZone: string): { headers: string[]; rows: string[][] } {
  if (report.days.length <= 1) {
    return {
      headers: ATTENDANCE_HEADERS_AR(timeZone),
      rows: report.rows.map((r) => [
        r.displayName ?? "",
        rsvpLabel(r),
        r.checkedIn ? "نعم" : "لا",
        r.arrivedAt ? csvDateTime(r.arrivedAt, timeZone) : "",
        methodLabel(r.method),
        r.method === "manual" ? "نعم" : "لا",
      ]),
    };
  }

  // The weekday is read in the SESSION'S zone (contract 7, OQ-018) — a day of a
  // workshop is a fact about the room; the arrival times stay on the org's
  // clock, which is what the header beside them says.
  const labels = new Map(report.days.map((d) => [d.id, dayLabel(d, report.timeZone, dayWords)]));
  const [name, rsvp, ...rest] = ATTENDANCE_HEADERS_AR(timeZone);
  return {
    headers: [name, rsvp, "اليوم", ...rest, "أكمل الحضور"],
    rows: report.rows.flatMap((r) =>
      r.days.map((cell) => [
        r.displayName ?? "",
        rsvpLabel(r),
        labels.get(cell.dayId) ?? "",
        cell.checkedIn ? "نعم" : "لا",
        cell.arrivedAt ? csvDateTime(cell.arrivedAt, timeZone) : "",
        methodLabel(cell.checkedIn ? cell.method : null),
        cell.checkedIn && cell.method === "manual" ? "نعم" : "لا",
        r.attendanceComplete ? "نعم" : "لا",
      ]),
    ),
  };
}

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

  const sheet = attendanceSheet(report, prefs.timeZone);
  await auditExport(locale, "attendance", "session", sessionId);
  return { csv: buildCsv(sheet.headers, sheet.rows), sessionTitle: report.sessionTitle };
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
    SESSION_STATE_AR[s.state] ?? s.state,
    SESSION_LEVEL_AR[s.level] ?? s.level,
    SESSION_LANGUAGE_AR[s.language] ?? s.language,
    s.startsAt ? csvDateTime(s.startsAt, prefs.timeZone) : "",
    s.presenters
      .filter((p) => p.accepted)
      .map((p) => p.displayName ?? "")
      .join("، "),
  ]);
  await auditExport(locale, "sessions");
  return buildCsv(["العنوان", "الحالة", "المستوى", "اللغة", whenHeader("التاريخ والوقت", prefs.timeZone), "المُقدِّمون"], rows);
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
      r.waitlist_position !== null ? formatNumber(r.waitlist_position as number) : "",
      csvDateTime(r.reserved_at as string, prefs.timeZone),
    ];
  });
  await auditExport(locale, "rsvps");
  return buildCsv(["الجلسة", "العضو", "الحالة", "ترتيب الانتظار", whenHeader("وقت الحجز", prefs.timeZone)], rows);
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
    // `removed_at` (0087) is a soft delete — the export is who attended, and
    // a removal is already evidenced in `audit_log` (the lead's own
    // reasoning), so a removed check-in is excluded here rather than
    // reported as attendance that no longer stands.
    .is("removed_at", null)
    .order("arrived_at", { ascending: false });
  if (error) throw new Error(`check_ins: ${error.message}`);
  const prefs = await getOrgPrefs(locale);

  const rows = (data ?? []).map((r) => {
    const s = (r as unknown as { sessions: { title: string } | null }).sessions;
    const m = (r as unknown as { members: { display_name: string | null } | null }).members;
    return [
      s?.title ?? "",
      m?.display_name ?? "",
      csvDateTime(r.arrived_at as string, prefs.timeZone),
      r.method === "code" ? "رمز الحضور" : "تسجيل يدوي",
      r.method === "manual" ? "نعم" : "لا",
    ];
  });
  await auditExport(locale, "attendance");
  return buildCsv(["الجلسة", "العضو", whenHeader("وقت الوصول", prefs.timeZone), "طريقة التسجيل", "علامة يدوية"], rows);
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
  const num = (n: number) => formatNumber(n);

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
    return [
      m?.display_name ?? "",
      formatNumber(r.amount as number),
      LEDGER_SOURCE_AR[r.source as string] ?? (r.source as string),
      r.reason as string,
      csvDateTime(r.occurred_at as string, prefs.timeZone),
    ];
  });
  await auditExport(locale, "points");
  return buildCsv(["العضو", "القيمة", "المصدر", "السبب", whenHeader("التاريخ", prefs.timeZone)], rows);
}

const CERT_STATE_AR: Record<string, string> = { held: "محجوزة", issued: "صادرة", revoked: "مُلغاة" };

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
      CERT_KIND_AR[c.kind as string] ?? (c.kind as string),
      s?.title ?? "",
      CERT_STATE_AR[c.state as string] ?? (c.state as string),
      c.issued_at ? csvDateTime(c.issued_at as string, prefs.timeZone) : "",
    ];
  });
  await auditExport(locale, "certificates");
  return buildCsv(["الرقم التسلسلي", "العضو", "النوع", "الجلسة", "الحالة", whenHeader("تاريخ الإصدار", prefs.timeZone)], rows);
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
    csvDateTime(m.createdAt, prefs.timeZone),
  ]);
  await auditExport(locale, "members");
  return buildCsv(["الاسم", "البريد الإلكتروني", "الدور", "الحالة", whenHeader("تاريخ الانضمام", prefs.timeZone)], rows);
}

// ── SCR-061's «آخر تصدير» ─────────────────────────────────────────────────

export const EXPORT_TYPES = ["sessions", "rsvps", "attendance", "ratings", "points", "certificates", "members"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export interface RecentExport {
  actorName: string | null;
  occurredAt: string;
}

/**
 * The newest `export.created` row per export type — who took the file, and
 * when. «Every export is audited» stops being a sentence the screen asserts
 * and becomes something it shows. A per-session attendance export counts as
 * an attendance export. Admin only: exports sit outside a moderator's scope.
 */
export async function listRecentExports(locale: string): Promise<Partial<Record<ExportType, RecentExport>> | null> {
  const client = await requireAdmin(locale);
  if (!client) return null;
  const { supabase } = client;
  const { data, error } = await supabase
    .from("audit_log")
    .select("actor_id, after, occurred_at")
    .eq("action", "export.created")
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`audit_log: ${error.message}`);

  const latest: Partial<Record<ExportType, { actorId: string | null; occurredAt: string }>> = {};
  for (const row of data ?? []) {
    const type = (row.after as { export_type?: string } | null)?.export_type;
    if (!type || !(EXPORT_TYPES as readonly string[]).includes(type) || latest[type as ExportType]) continue;
    latest[type as ExportType] = { actorId: row.actor_id as string | null, occurredAt: row.occurred_at as string };
  }

  const ids = Array.from(new Set(Object.values(latest).map((l) => l?.actorId).filter((id): id is string => !!id)));
  const names = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: members, error: mErr } = await supabase.from("members").select("id, display_name").in("id", ids);
    if (mErr) throw new Error(`members: ${mErr.message}`);
    for (const m of members ?? []) names.set(m.id as string, m.display_name as string | null);
  }

  const result: Partial<Record<ExportType, RecentExport>> = {};
  for (const [type, entry] of Object.entries(latest) as [ExportType, { actorId: string | null; occurredAt: string }][]) {
    result[type] = { actorName: entry.actorId ? (names.get(entry.actorId) ?? null) : null, occurredAt: entry.occurredAt };
  }
  return result;
}
