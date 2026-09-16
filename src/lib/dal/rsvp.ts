import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { seatState, sessionPhase, viewerRelation, type PhaseInput, type SeatState, type SessionPhase, type ViewerRelation } from "@/lib/session-status";
import { affordancesFor } from "@/components/checkin/session-matrix";

// RSVP and waitlist (REQ-RSV-001…011, STORY-RSV-001..004). Capacity, the
// deadline and the atomic promotion are all enforced inside reserve_seat()
// and cancel_rsvp() (supabase/proposed/checkin/01_rsvp.sql) — every read
// here is for display, never for a decision the RPC has already made.
//
// ★ `phase`/`relation`/`canReserve`/`canCancel` are computed HERE, not in
// the component — the `getPhotosPageData()` pattern (`lib/dal/photos.ts`):
// the capability is derived in the DAL, returned in the DTO, and the
// component renders on it rather than re-deriving (16 §5.4.1, DEC-090).

export type RsvpStatus = "confirmed" | "waitlisted" | "cancelled" | "late_cancelled";

export interface RsvpPanelData {
  sessionId: string;
  phase: SessionPhase;
  relation: ViewerRelation;
  seat: SeatState;
  capacity: number | null;
  confirmedCount: number;
  waitlistCount: number;
  /** Wording only — `cancel` itself does not stop at the cutoff (16 §5.3's starred note). */
  cutoffPassed: boolean;
  myRsvp: { status: RsvpStatus; waitlistPosition: number | null } | null;
  /** From `affordancesFor(phase, relation)` — the panel renders on these, never re-derives. */
  canReserve: boolean;
  canCancel: boolean;
}

/** Everything the RsvpPanel and AttendanceOutcome slots need, in one round trip. Null when the session doesn't exist or isn't visible. */
export async function getRsvpPanelData(locale: string, sessionId: string): Promise<RsvpPanelData | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const { session, supabase } = await sessionClient(locale);

  const [sessionRes, countsRes, mineRes, presenterRes, checkInRes] = await Promise.all([
    supabase.from("sessions").select("id, state, starts_at, ends_at, duration_minutes, capacity, rsvp_deadline_at, cancellation_cutoff_at").eq("id", sessionId).maybeSingle(),
    supabase.rpc("session_seat_counts", { p_session: sessionId }).single(),
    supabase.from("rsvps").select("status, waitlist_position").eq("session_id", sessionId).eq("member_id", session.memberId).maybeSingle(),
    supabase.from("session_presenters").select("member_id").eq("session_id", sessionId).eq("member_id", session.memberId).eq("accepted", true).maybeSingle(),
    supabase.from("check_ins").select("id").eq("session_id", sessionId).eq("member_id", session.memberId).maybeSingle(),
  ]);
  if (sessionRes.error) throw new Error(`sessions: ${sessionRes.error.message}`);
  if (!sessionRes.data) return null;
  if (countsRes.error) throw new Error(`session_seat_counts: ${countsRes.error.message}`);
  if (mineRes.error) throw new Error(`rsvps: ${mineRes.error.message}`);

  const s = sessionRes.data;
  const counts = countsRes.data as { confirmed_count: number; waitlist_count: number };
  const mine = mineRes.data;
  const now = new Date();

  const phaseInput: PhaseInput = { state: s.state, startsAt: s.starts_at, endsAt: s.ends_at, durationMinutes: s.duration_minutes };
  const phase = sessionPhase(phaseInput, now);
  const isStaff = session.role === "admin" || session.role === "moderator";
  const rsvpStatus = (mine?.status as RsvpStatus | undefined) ?? null;
  const relation = viewerRelation({ isStaff, isPresenter: Boolean(presenterRes.data), rsvpStatus, checkedIn: Boolean(checkInRes.data) }, phase);
  const cellAffordances = affordancesFor(phase, relation);

  return {
    sessionId,
    phase,
    relation,
    seat: seatState({ capacity: s.capacity, confirmedCount: counts.confirmed_count, rsvpDeadlineAt: s.rsvp_deadline_at }, now),
    capacity: s.capacity,
    confirmedCount: counts.confirmed_count,
    waitlistCount: counts.waitlist_count,
    cutoffPassed: s.cancellation_cutoff_at != null && new Date(s.cancellation_cutoff_at).getTime() < now.getTime(),
    myRsvp: mine ? { status: rsvpStatus as RsvpStatus, waitlistPosition: mine.waitlist_position } : null,
    canReserve: cellAffordances.rsvp,
    canCancel: cellAffordances.cancel,
  };
}

export type RsvpRpcError = "not_found" | "not_open" | "deadline_passed" | "no_rsvp" | "unknown";

function mapRpcError(message: string): RsvpRpcError {
  const known: RsvpRpcError[] = ["not_found", "not_open", "deadline_passed", "no_rsvp"];
  return known.find((k) => message.includes(k)) ?? "unknown";
}

export interface RsvpOutcome {
  status: RsvpStatus;
  waitlistPosition: number | null;
}

export async function reserveSeat(locale: string, sessionId: string): Promise<RsvpOutcome | { error: RsvpRpcError }> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("reserve_seat", { p_session: sessionId });
  if (error) return { error: mapRpcError(error.message) };
  const row = data as { status: RsvpStatus; waitlist_position: number | null };
  return { status: row.status, waitlistPosition: row.waitlist_position };
}

export async function cancelRsvp(locale: string, sessionId: string): Promise<RsvpOutcome | { error: RsvpRpcError }> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("cancel_rsvp", { p_session: sessionId });
  if (error) return { error: mapRpcError(error.message) };
  const row = data as { status: RsvpStatus; waitlist_position: number | null };
  return { status: row.status, waitlistPosition: row.waitlist_position };
}
