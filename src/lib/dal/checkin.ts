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
