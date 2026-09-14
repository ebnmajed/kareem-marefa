import "server-only";
import { z } from "zod";
import { formatDateTime } from "@/components/sessions/numerals";
import { getAttendanceReport } from "@/lib/dal/checkin";
import { getOrgPrefs } from "@/lib/dal/proposals";
import { sessionClient } from "@/lib/dal/session";

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

const HEADERS_AR = ["الاسم", "حالة الحجز", "سجَّل حضوره", "وقت الوصول", "طريقة التسجيل", "علامة يدوية"];

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
  return { csv: buildCsv(HEADERS_AR, rows), sessionTitle: report.sessionTitle };
}
