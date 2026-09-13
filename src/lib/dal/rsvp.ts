import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";

// RSVP and waitlist (REQ-RSV-001…011, STORY-RSV-001..004). Capacity, the
// deadline and the atomic promotion are all enforced inside reserve_seat()
// and cancel_rsvp() (supabase/proposed/checkin/01_rsvp.sql) — every read
// here is for display, never for a decision the RPC has already made.

export type RsvpStatus = "confirmed" | "waitlisted" | "cancelled" | "late_cancelled";

export interface RsvpPanelData {
  sessionId: string;
  state: string;
  capacity: number | null;
  confirmedCount: number;
  waitlistCount: number;
  /** Computed here, not in the component — comparing against the clock is impure and belongs in the data fetch, not render. */
  deadlinePassed: boolean;
  cutoffPassed: boolean;
  myRsvp: { status: RsvpStatus; waitlistPosition: number | null } | null;
  isPresenter: boolean;
}

/** Everything the RsvpPanel slot needs, in one round trip. Null when the session doesn't exist or isn't visible. */
export async function getRsvpPanelData(locale: string, sessionId: string): Promise<RsvpPanelData | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const { session, supabase } = await sessionClient(locale);

  const [sessionRes, countsRes, mineRes, presenterRes] = await Promise.all([
    supabase.from("sessions").select("id, state, capacity, rsvp_deadline_at, cancellation_cutoff_at").eq("id", sessionId).maybeSingle(),
    supabase.rpc("session_seat_counts", { p_session: sessionId }).single(),
    supabase.from("rsvps").select("status, waitlist_position").eq("session_id", sessionId).eq("member_id", session.memberId).maybeSingle(),
    supabase.from("session_presenters").select("member_id").eq("session_id", sessionId).eq("member_id", session.memberId).eq("accepted", true).maybeSingle(),
  ]);
  if (sessionRes.error) throw new Error(`sessions: ${sessionRes.error.message}`);
  if (!sessionRes.data) return null;
  if (countsRes.error) throw new Error(`session_seat_counts: ${countsRes.error.message}`);
  if (mineRes.error) throw new Error(`rsvps: ${mineRes.error.message}`);

  const s = sessionRes.data;
  const counts = countsRes.data as { confirmed_count: number; waitlist_count: number };
  const mine = mineRes.data;
  const now = Date.now();

  return {
    sessionId,
    state: s.state,
    capacity: s.capacity,
    confirmedCount: counts.confirmed_count,
    waitlistCount: counts.waitlist_count,
    deadlinePassed: s.rsvp_deadline_at != null && new Date(s.rsvp_deadline_at).getTime() < now,
    cutoffPassed: s.cancellation_cutoff_at != null && new Date(s.cancellation_cutoff_at).getTime() < now,
    myRsvp: mine ? { status: mine.status as RsvpStatus, waitlistPosition: mine.waitlist_position } : null,
    isPresenter: Boolean(presenterRes.data),
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
