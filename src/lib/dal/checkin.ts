import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// Check-in and the host view (REQ-CHK-001…014, STORY-CHK-001..006). RPCs live
// in supabase/proposed/checkin/02_check_in.sql. check_in() returns a JSON
// envelope rather than raising for expected outcomes (rate limit, wrong
// code, wrong window, overlap) — see that file's header for why: raising
// would roll back the check_in_attempts row DEC-015 requires to survive.

export interface HostViewData {
  sessionId: string;
  code: string;
  validFrom: string;
  validUntil: string;
  checkInCount: number;
  rotationSeconds: number;
}

/** The live code and count for the host view. Null when the caller isn't the presenter or staff (REQ-CHK-014). */
export async function getHostView(locale: string, sessionId: string): Promise<HostViewData | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const { supabase } = await sessionClient(locale);

  const [codeRes, countRes, settingsRes] = await Promise.all([
    supabase.rpc("ensure_check_in_code", { p_session: sessionId }),
    supabase.from("check_ins").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
    supabase.from("org_settings").select("check_in_rotation_seconds").maybeSingle(),
  ]);
  if (codeRes.error) {
    if (codeRes.error.message.includes("not_authorized") || codeRes.error.message.includes("not_found")) return null;
    throw new Error(`ensure_check_in_code: ${codeRes.error.message}`);
  }
  if (countRes.error) throw new Error(`check_ins count: ${countRes.error.message}`);

  const c = codeRes.data as { code: string; valid_from: string; valid_until: string };
  return {
    sessionId,
    code: c.code,
    validFrom: c.valid_from,
    validUntil: c.valid_until,
    checkInCount: countRes.count ?? 0,
    rotationSeconds: settingsRes.data?.check_in_rotation_seconds ?? 600,
  };
}

export async function revokeCode(locale: string, sessionId: string): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("revoke_check_in_code", { p_session: sessionId });
  if (error) throw new Error(`revoke_check_in_code: ${error.message}`);
}

export const checkInInput = z.object({ code: z.string().trim().toUpperCase().length(6) });

export type CheckInError = "not_found" | "presenter_cannot_check_in" | "rate_limited" | "not_started" | "session_ended" | "not_open" | "invalid_code" | "overlap" | "unknown";

export interface CheckInSuccess {
  ok: true;
  /** `alreadyCheckedIn` is its own state (09 SCR-014) — a no-op, not a duplicate "success". */
  alreadyCheckedIn: boolean;
  method: "code" | "manual";
  arrivedAt: string;
}
export interface CheckInFailure {
  ok: false;
  error: CheckInError;
  conflictSessionId?: string;
}

export async function submitCheckIn(locale: string, sessionId: string, code: string): Promise<CheckInSuccess | CheckInFailure> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("check_in", { p_session: sessionId, p_code: code });
  if (error) {
    return { ok: false, error: error.message.includes("not_found") ? "not_found" : "unknown" };
  }
  const envelope = data as { status: string; check_in?: { method: "code" | "manual"; arrived_at: string }; conflict_session_id?: string };
  if ((envelope.status === "ok" || envelope.status === "already_checked_in") && envelope.check_in) {
    return { ok: true, alreadyCheckedIn: envelope.status === "already_checked_in", method: envelope.check_in.method, arrivedAt: envelope.check_in.arrived_at };
  }
  return { ok: false, error: envelope.status as CheckInError, conflictSessionId: envelope.conflict_session_id };
}

export interface UncheckedAttendee {
  memberId: string;
  displayName: string | null;
}

/**
 * Confirmed RSVP holders with no check-in yet, for the host view's manual
 * mark form (REQ-CHK-008). Two reads rather than a NOT EXISTS join because
 * PostgREST embeds don't express anti-joins — both `rsvps` and `check_ins`
 * are staff-readable for the whole session (0010's `rsvps_read` /
 * `checkins_read`), so this is a caller-side set difference, not a
 * permission workaround.
 */
export async function listUncheckedConfirmedRsvps(locale: string, sessionId: string): Promise<UncheckedAttendee[]> {
  const { supabase } = await sessionClient(locale);
  const [rsvpsRes, checkInsRes] = await Promise.all([
    supabase.from("rsvps").select("member_id, members(display_name)").eq("session_id", sessionId).eq("status", "confirmed"),
    supabase.from("check_ins").select("member_id").eq("session_id", sessionId),
  ]);
  if (rsvpsRes.error) throw new Error(`rsvps: ${rsvpsRes.error.message}`);
  if (checkInsRes.error) throw new Error(`check_ins: ${checkInsRes.error.message}`);
  const checkedIn = new Set((checkInsRes.data ?? []).map((c) => c.member_id));
  return (rsvpsRes.data ?? [])
    .filter((r) => !checkedIn.has(r.member_id))
    .map((r) => {
      const member = Array.isArray(r.members) ? r.members[0] : r.members;
      return { memberId: r.member_id, displayName: (member as { display_name: string | null } | null)?.display_name ?? null };
    });
}

export const manualCheckInInput = z.object({ memberId: z.uuid(), reason: z.string().trim().min(1).max(300) });

export type ManualCheckInError = "not_authorized" | "reason_required" | "not_found" | "not_open" | "member_not_found" | "presenter_cannot_check_in" | "unknown";

export async function markCheckedInManually(
  locale: string,
  sessionId: string,
  memberId: string,
  reason: string,
): Promise<{ ok: true; arrivedAt: string } | { ok: false; error: ManualCheckInError }> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("mark_checked_in_manually", { p_session: sessionId, p_member: memberId, p_reason: reason });
  if (error) {
    const known: ManualCheckInError[] = ["not_authorized", "reason_required", "not_found", "not_open", "member_not_found", "presenter_cannot_check_in"];
    return { ok: false, error: known.find((k) => error.message.includes(k)) ?? "unknown" };
  }
  const row = data as { arrived_at: string };
  return { ok: true, arrivedAt: row.arrived_at };
}

// ── console (wave 3) — added for SCR-044, never changes anything above ─────

export interface AttendanceRow {
  memberId: string;
  displayName: string | null;
  rsvpStatus: "confirmed" | "waitlisted" | "cancelled" | "late_cancelled" | null;
  checkedIn: boolean;
  arrivedAt: string | null;
  method: "code" | "manual" | null;
  /** Checked in with no confirmed RSVP at all (REQ-CHK-010's walk-in). */
  isWalkIn: boolean;
  /** Confirmed RSVP, no check-in (`evaluate_no_shows`' own definition,
   *  `worker/src/tasks/evaluate_no_shows.ts` — computed the same way here so
   *  the report and the points job never disagree on what a no-show is). */
  isNoShow: boolean;
}

export interface AttendanceReport {
  sessionId: string;
  sessionTitle: string;
  sessionState: string;
  rows: AttendanceRow[];
  counts: {
    reserved: number;
    confirmed: number;
    checkedIn: number;
    walkedIn: number;
    noShowed: number;
  };
  /** Checked-in **among confirmed RSVPs**, divided by confirmed — a walk-in
   *  inflates check-ins without ever having promised to come, so it stays
   *  out of both sides of this fraction. Null with zero confirmed RSVPs. */
  attendanceRate: number | null;
}

/**
 * SCR-044's own manual-mark picker (`REQ-CHK-008`) — deliberately broader
 * than `listUncheckedConfirmedRsvps()` above (the presenter's own host
 * view, scoped on purpose to who actually holds a confirmed seat). Staff
 * doing event-day operations also need to mark someone who was on the
 * waitlist and simply showed up — not a fabricated "walk-in" so much as an
 * RSVP holder who never got promoted, a real e2e run against SCR-044's own
 * page surfaced this gap (a waitlisted attendee was never selectable).
 * Staff-only, like `getAttendanceReport()` right below; a member or an
 * unauthenticated caller gets the empty list rather than an error, since
 * this backs a form's own option list, not a page gate.
 */
export async function listUncheckedForAdminManualMark(locale: string, sessionId: string): Promise<UncheckedAttendee[]> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin" && session.role !== "moderator") return [];

  const [rsvpsRes, checkInsRes] = await Promise.all([
    supabase.from("rsvps").select("member_id, members(display_name)").eq("session_id", sessionId).in("status", ["confirmed", "waitlisted"]),
    supabase.from("check_ins").select("member_id").eq("session_id", sessionId),
  ]);
  if (rsvpsRes.error) throw new Error(`rsvps: ${rsvpsRes.error.message}`);
  if (checkInsRes.error) throw new Error(`check_ins: ${checkInsRes.error.message}`);
  const checkedIn = new Set((checkInsRes.data ?? []).map((c) => c.member_id));
  return (rsvpsRes.data ?? [])
    .filter((r) => !checkedIn.has(r.member_id))
    .map((r) => {
      const member = Array.isArray(r.members) ? r.members[0] : r.members;
      return { memberId: r.member_id, displayName: (member as { display_name: string | null } | null)?.display_name ?? null };
    });
}

/**
 * SCR-044 (`REQ-CHK-008`, `REQ-CHK-012`). Staff-only — admin or moderator,
 * REQ-ADM-020's "event-day operations." `rsvps`/`check_ins` are already
 * staff-readable for the whole session (0010's `rsvps_read`/`checkins_read`
 * — `listUncheckedConfirmedRsvps`'s own comment says so), so this is a
 * caller-side join of two already-authorized reads, the same shape as that
 * function, not a new permission boundary.
 */
export async function getAttendanceReport(locale: string, sessionId: string): Promise<AttendanceReport | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin" && session.role !== "moderator") return null;

  const [sessionRes, rsvpsRes, checkInsRes] = await Promise.all([
    supabase.from("sessions").select("id, title, state").eq("id", sessionId).maybeSingle(),
    supabase.from("rsvps").select("member_id, status, members(display_name)").eq("session_id", sessionId),
    // `!check_ins_member_id_fkey`: `check_ins` has TWO foreign keys into
    // `members` (`member_id` and `marked_by`, for a manual mark's actor) —
    // an unqualified `members(...)` embed is ambiguous and PostgREST
    // refuses it outright, a real bug this had until an e2e run against a
    // real build actually exercised the query for the first time.
    supabase.from("check_ins").select("member_id, arrived_at, method, members!check_ins_member_id_fkey(display_name)").eq("session_id", sessionId),
  ]);
  if (sessionRes.error) throw new Error(`sessions: ${sessionRes.error.message}`);
  if (!sessionRes.data) return null;
  if (rsvpsRes.error) throw new Error(`rsvps: ${rsvpsRes.error.message}`);
  if (checkInsRes.error) throw new Error(`check_ins: ${checkInsRes.error.message}`);

  type MemberEmbed = { display_name: string | null } | { display_name: string | null }[] | null;
  const nameOf = (m: MemberEmbed) => (Array.isArray(m) ? (m[0]?.display_name ?? null) : (m?.display_name ?? null));

  const checkIns = checkInsRes.data ?? [];
  const checkInByMember = new Map(checkIns.map((c) => [c.member_id, c]));
  const rows: AttendanceRow[] = [];
  const seen = new Set<string>();

  for (const r of rsvpsRes.data ?? []) {
    seen.add(r.member_id);
    const ci = checkInByMember.get(r.member_id);
    const status = r.status as AttendanceRow["rsvpStatus"];
    rows.push({
      memberId: r.member_id,
      displayName: nameOf(r.members as MemberEmbed),
      rsvpStatus: status,
      checkedIn: !!ci,
      arrivedAt: ci?.arrived_at ?? null,
      method: (ci?.method as AttendanceRow["method"]) ?? null,
      isWalkIn: false,
      isNoShow: status === "confirmed" && !ci,
    });
  }
  for (const c of checkIns) {
    if (seen.has(c.member_id)) continue;
    rows.push({
      memberId: c.member_id,
      displayName: nameOf(c.members as MemberEmbed),
      rsvpStatus: null,
      checkedIn: true,
      arrivedAt: c.arrived_at,
      method: c.method as AttendanceRow["method"],
      isWalkIn: true,
      isNoShow: false,
    });
  }
  rows.sort((a, b) => (a.displayName ?? "").localeCompare(b.displayName ?? "", "ar"));

  const confirmedRows = rows.filter((r) => r.rsvpStatus === "confirmed");
  const confirmed = confirmedRows.length;
  const checkedInAmongConfirmed = confirmedRows.filter((r) => r.checkedIn).length;

  return {
    sessionId,
    sessionTitle: sessionRes.data.title,
    sessionState: sessionRes.data.state,
    rows,
    counts: {
      reserved: rsvpsRes.data?.length ?? 0,
      confirmed,
      checkedIn: checkIns.length,
      walkedIn: rows.filter((r) => r.isWalkIn).length,
      noShowed: rows.filter((r) => r.isNoShow).length,
    },
    attendanceRate: confirmed > 0 ? checkedInAmongConfirmed / confirmed : null,
  };
}
