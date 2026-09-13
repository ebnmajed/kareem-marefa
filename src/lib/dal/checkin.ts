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
  if (envelope.status === "ok" && envelope.check_in) {
    return { ok: true, method: envelope.check_in.method, arrivedAt: envelope.check_in.arrived_at };
  }
  return { ok: false, error: envelope.status as CheckInError, conflictSessionId: envelope.conflict_session_id };
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
