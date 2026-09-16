import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { sessionPhase, viewerRelation, type PhaseInput, type SessionPhase, type ViewerRelation } from "@/lib/session-status";
import { affordancesFor, checkInAllowed } from "@/components/checkin/session-matrix";
import type { RsvpStatus } from "@/lib/dal/rsvp";

// Check-in and the host view (REQ-CHK-001…014, STORY-CHK-001..006, REQ-UIX-015,
// DEC-090). RPCs live in supabase/proposed/checkin/02_check_in.sql. check_in()
// returns a JSON envelope rather than raising for expected outcomes (rate
// limit, wrong code, wrong window, overlap) — see that file's header for why:
// raising would roll back the check_in_attempts row DEC-015 requires to
// survive. No SQL changed this wave — every fix below is presentation-layer,
// re-reading the same authoritative RPCs (docs/plan/notes/checkin.md "Wave 5").

export interface HostViewData {
  sessionId: string;
  /** Null outside the session window — a code exists only while the session is live (REQ-CHK-004, migration 0078). */
  code: string | null;
  /** The full six-phase vocabulary, computed by `sessionPhase()` from the row — not guessed from the RPC's error string (bug (d), 16 §5.4.1 row 6). */
  phase: SessionPhase;
  startsAt: string | null;
  /** DEC-065: off means a code is accepted only from a member with a confirmed reservation. */
  allowWalkIns: boolean;
  validFrom: string | null;
  validUntil: string | null;
  checkInCount: number;
  rotationSeconds: number;
  /** `affordancesFor(phase, "staff").hostConsole` — true only for `open` (pre-flight) and `live`. The page gates the walk-in and manual-marking sections on this, not on "is staff" alone. */
  consoleActive: boolean;
}

/** The live code and count for the host view. Null when the caller isn't the presenter or staff (REQ-CHK-014). */
export async function getHostView(locale: string, sessionId: string): Promise<HostViewData | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const { supabase } = await sessionClient(locale);

  const [codeRes, countRes, settingsRes, sessionRes] = await Promise.all([
    supabase.rpc("ensure_check_in_code", { p_session: sessionId }),
    supabase.from("check_ins").select("id", { count: "exact", head: true }).eq("session_id", sessionId),
    supabase.from("org_settings").select("check_in_rotation_seconds").maybeSingle(),
    supabase.from("sessions").select("state, starts_at, ends_at, duration_minutes, allow_walk_ins").eq("id", sessionId).maybeSingle(),
  ]);
  // Authorisation is the RPC's (REQ-CHK-014): a member gets `not_authorized`
  // whatever the state, so the window is never revealed to someone who may
  // not see the code either.
  if (codeRes.error && (codeRes.error.message.includes("not_authorized") || codeRes.error.message.includes("not_found"))) return null;
  if (codeRes.error && !codeRes.error.message.includes("not_open")) throw new Error(`ensure_check_in_code: ${codeRes.error.message}`);
  if (countRes.error) throw new Error(`check_ins count: ${countRes.error.message}`);
  if (!sessionRes.data) return null;

  const s = sessionRes.data;
  const rotationSeconds = settingsRes.data?.check_in_rotation_seconds ?? 600;
  const checkInCount = countRes.count ?? 0;
  const allowWalkIns = s.allow_walk_ins === true;
  const phase = sessionPhase({ state: s.state, startsAt: s.starts_at, endsAt: s.ends_at, durationMinutes: s.duration_minutes });
  // "staff" and "presenter" carry an identical cell (both are the console's
  // two eligible viewers) — `getHostView()` already only reaches this point
  // for one of the two (the RPC's own not_authorized check above), so either
  // key reads the same answer.
  const consoleActive = affordancesFor(phase, "staff").hostConsole;

  if (codeRes.error) {
    return { sessionId, code: null, phase, startsAt: s.starts_at, allowWalkIns, validFrom: null, validUntil: null, checkInCount, rotationSeconds, consoleActive };
  }

  const c = codeRes.data as { code: string; valid_from: string; valid_until: string };
  return { sessionId, code: c.code, phase, startsAt: s.starts_at, allowWalkIns, validFrom: c.valid_from, validUntil: c.valid_until, checkInCount, rotationSeconds, consoleActive };
}

/** DEC-065: staff open or close a session to walk-ins. The RPC re-derives the role; a member is refused. */
export async function setWalkIns(locale: string, sessionId: string, allow: boolean): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("set_session_walk_ins", { p_session: sessionId, p_allow: allow });
  if (error) {
    if (error.message.includes("not_authorized")) throw new Error("not_authorized");
    throw new Error(`set_session_walk_ins: ${error.message}`);
  }
}

export async function revokeCode(locale: string, sessionId: string): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("revoke_check_in_code", { p_session: sessionId });
  if (error) throw new Error(`revoke_check_in_code: ${error.message}`);
}

// ── the check-in SCREEN's own read — bug (c), 16 §5.4.1 row 4b ─────────────
//
// Reuses the same `error.*` translation keys the post-submit banner already
// carries (`not_started`, `session_ended`, `presenter_cannot_check_in`,
// `reservation_required`) as proactive reasons, not just refusals — they
// already say the right thing before a keystroke, not only after one. Only
// two keys are genuinely new: `not_published`, `cancelled`.
export type CheckInIneligibleReason = "not_published" | "cancelled" | "not_started" | "session_ended" | "presenter_cannot_check_in" | "reservation_required";

export interface CheckInScreenData {
  sessionId: string;
  title: string;
  phase: SessionPhase;
  relation: ViewerRelation;
  allowWalkIns: boolean;
  /** From `checkInAllowed()` — the screen renders the form on this, never re-derives it. */
  canAttemptCheckIn: boolean;
  /** Null exactly when `canAttemptCheckIn` is true — nothing to explain. */
  ineligibleReason: CheckInIneligibleReason | null;
}

/**
 * Reads the session BEFORE rendering the code form (bug (c): the screen used
 * to render the form for any session id — no title, no phase, no RSVP read —
 * and let the member find out after typing six characters). Null when the
 * session doesn't exist or `sessions_read` doesn't show it to this viewer —
 * the page turns that into a 404, the same boundary the event page uses.
 */
export async function getCheckInScreenData(locale: string, sessionId: string): Promise<CheckInScreenData | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const { session, supabase } = await sessionClient(locale);

  const [sessionRes, presenterRes, rsvpRes, checkInRes] = await Promise.all([
    supabase.from("sessions").select("id, title, state, starts_at, ends_at, duration_minutes, allow_walk_ins").eq("id", sessionId).maybeSingle(),
    supabase.from("session_presenters").select("member_id").eq("session_id", sessionId).eq("member_id", session.memberId).eq("accepted", true).maybeSingle(),
    supabase.from("rsvps").select("status").eq("session_id", sessionId).eq("member_id", session.memberId).maybeSingle(),
    supabase.from("check_ins").select("id").eq("session_id", sessionId).eq("member_id", session.memberId).maybeSingle(),
  ]);
  if (sessionRes.error) throw new Error(`sessions: ${sessionRes.error.message}`);
  if (!sessionRes.data) return null;
  if (presenterRes.error) throw new Error(`session_presenters: ${presenterRes.error.message}`);
  if (rsvpRes.error) throw new Error(`rsvps: ${rsvpRes.error.message}`);
  if (checkInRes.error) throw new Error(`check_ins: ${checkInRes.error.message}`);

  const s = sessionRes.data;
  const phaseInput: PhaseInput = { state: s.state, startsAt: s.starts_at, endsAt: s.ends_at, durationMinutes: s.duration_minutes };
  const phase = sessionPhase(phaseInput);
  const isStaff = session.role === "admin" || session.role === "moderator";
  const rsvpStatus = (rsvpRes.data?.status as RsvpStatus | undefined) ?? null;
  const relation = viewerRelation({ isStaff, isPresenter: Boolean(presenterRes.data), rsvpStatus, checkedIn: Boolean(checkInRes.data) }, phase);
  const allowWalkIns = s.allow_walk_ins === true;
  const canAttemptCheckIn = checkInAllowed(phaseInput, relation, allowWalkIns);

  return {
    sessionId,
    title: s.title,
    phase,
    relation,
    allowWalkIns,
    canAttemptCheckIn,
    ineligibleReason: canAttemptCheckIn ? null : ineligibleReasonFor(phase, relation),
  };
}

function ineligibleReasonFor(phase: SessionPhase, relation: ViewerRelation): CheckInIneligibleReason {
  if (phase === "draft" || phase === "pending_schedule") return "not_published";
  if (phase === "cancelled") return "cancelled";
  if (phase === "open") return "not_started";
  if (phase === "ended") return "session_ended";
  // phase is "live" here, but the relation itself isn't eligible.
  if (relation === "presenter") return "presenter_cannot_check_in";
  return "reservation_required"; // none without walk-ins, waitlisted, staff with no seat
}

/**
 * The predicate for the event page's check-in LINK — bug (e), the worst of
 * the five (16 §5.4.1 row 4, DEC-090): a primary navy button offered to any
 * member on any live session, leading to a screen the RPC refuses. Exported
 * as a function, not handed to the lead as prose (DEC-103) — `page.tsx`
 * wires it once `getSessionForEvent()` carries `viewerRelation` (DEC-092,
 * already promised) and `allowWalkIns` (NOT in that DTO yet — flagged in
 * docs/plan/notes/checkin.md "Wave 5").
 */
export function canOfferCheckInLink(session: PhaseInput, relation: ViewerRelation, allowWalkIns: boolean, now: Date = new Date()): boolean {
  return checkInAllowed(session, relation, allowWalkIns, now);
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
