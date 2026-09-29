import "server-only";
import { cache } from "react";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { listSessionDays } from "@/lib/dal/sessions";
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

/** Everything the RsvpPanel and AttendanceOutcome slots need, in one round trip. Null when the session doesn't exist or isn't visible.
 *  ★ Request-scoped `cache()` (wave 6): the event page's hero badge, the panel, the phone action bar and the
 *  outcome all read it, and without the cache each made its own round trip. No logic change. */
export const getRsvpPanelData = cache(loadRsvpPanelData);

async function loadRsvpPanelData(locale: string, sessionId: string): Promise<RsvpPanelData | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const { session, supabase } = await sessionClient(locale);

  const [sessionRes, countsRes, mineRes, presenterRes, checkInRes, days] = await Promise.all([
    supabase.from("sessions").select("id, state, starts_at, ends_at, duration_minutes, capacity, rsvp_deadline_at, cancellation_cutoff_at").eq("id", sessionId).maybeSingle(),
    supabase.rpc("session_seat_counts", { p_session: sessionId }).single(),
    supabase.from("rsvps").select("status, waitlist_position").eq("session_id", sessionId).eq("member_id", session.memberId).maybeSingle(),
    supabase.from("session_presenters").select("member_id").eq("session_id", sessionId).eq("member_id", session.memberId).eq("accepted", true).maybeSingle(),
    // ★ A LIST, never `.maybeSingle()` (DEC-197 §3): a member checked in on two
    // days of a workshop holds two active rows, and `.maybeSingle()` refused
    // them with an error nobody read — so from day 2 the member read as NOT
    // checked in. One row is enough to know; the error is read below.
    supabase.from("check_ins").select("id").eq("session_id", sessionId).eq("member_id", session.memberId).is("removed_at", null).limit(1),
    // ★ THE DAYS, and this panel is wrong without them (DEC-119, contract 9).
    // `sessionPhase()` only reads the NIGHT between two days as `open` when it
    // is given the day set; handed the session's stored window alone, a
    // three-day workshop is `live` from day 1's start to day 3's end. The
    // event page already computes its phase WITH days, so a day-less read here
    // makes the page and this panel disagree about the phase on ONE screen —
    // and `rsvp`/`cancel` are exactly the affordances the difference removes.
    // `listSessionDays()` is `cache()`-wrapped and the page reads it too, so
    // this is not a second round trip.
    listSessionDays(locale, sessionId),
  ]);
  if (sessionRes.error) throw new Error(`sessions: ${sessionRes.error.message}`);
  if (!sessionRes.data) return null;
  if (countsRes.error) throw new Error(`session_seat_counts: ${countsRes.error.message}`);
  if (mineRes.error) throw new Error(`rsvps: ${mineRes.error.message}`);
  if (checkInRes.error) throw new Error(`check_ins: ${checkInRes.error.message}`);

  const s = sessionRes.data;
  const counts = countsRes.data as { confirmed_count: number; waitlist_count: number };
  const mine = mineRes.data;
  const now = new Date();

  const phaseInput: PhaseInput = { state: s.state, startsAt: s.starts_at, endsAt: s.ends_at, durationMinutes: s.duration_minutes, days };
  const phase = sessionPhase(phaseInput, now);
  const isStaff = session.role === "admin" || session.role === "moderator";
  const rsvpStatus = (mine?.status as RsvpStatus | undefined) ?? null;
  const relation = viewerRelation({ isStaff, isPresenter: Boolean(presenterRes.data), rsvpStatus, checkedIn: (checkInRes.data ?? []).length > 0 }, phase);
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
  /** The `rsvps` row's id — moment 1's occurrence (DEC-195 §2.1, contract 4, `sessions'` R2). */
  id: string;
  reservedAt: string;
  /**
   * ★ True when THIS call created or reactivated the reservation. `reserve_seat()` (`0045:80-100`) sets
   * `reserved_at = now()` in the same statement as `updated_at = now()` on a new or reactivated row — one
   * transaction, one `now()` — and on a repeat submit keeps the old `reserved_at` while `updated_at` moves.
   * So `fresh ⇔ reserved_at = updated_at`, compared as instants, never as strings.
   */
  fresh: boolean;
}

type RsvpRow = { id: string; status: RsvpStatus; waitlist_position: number | null; reserved_at: string; updated_at: string };

/** The row the two RPCs return, as the outcome — exported for its unit test only. */
export function toRsvpOutcome(row: RsvpRow): RsvpOutcome {
  const reserved = new Date(row.reserved_at).getTime();
  return {
    status: row.status,
    waitlistPosition: row.waitlist_position,
    id: row.id,
    reservedAt: row.reserved_at,
    fresh: Number.isFinite(reserved) && reserved === new Date(row.updated_at).getTime(),
  };
}

export async function reserveSeat(locale: string, sessionId: string): Promise<RsvpOutcome | { error: RsvpRpcError }> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("reserve_seat", { p_session: sessionId });
  if (error) return { error: mapRpcError(error.message) };
  return toRsvpOutcome(data as RsvpRow);
}

export async function cancelRsvp(locale: string, sessionId: string): Promise<RsvpOutcome | { error: RsvpRpcError }> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("cancel_rsvp", { p_session: sessionId });
  if (error) return { error: mapRpcError(error.message) };
  return toRsvpOutcome(data as RsvpRow);
}
