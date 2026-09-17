import "server-only";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { listSessionDays, type SessionDay } from "@/lib/dal/sessions";
import { resolveDay, sessionPhase, viewerRelation, type PhaseInput, type SessionPhase, type ViewerInput, type ViewerRelation } from "@/lib/session-status";
import { affordancesFor, checkInIneligibleReason, checkInWindowAllowed, type CheckInIneligibleReason } from "@/components/checkin/session-matrix";
import type { RsvpStatus } from "@/lib/dal/rsvp";

// ── the day, on every DTO in this file (DEC-119, DEC-150 contract 4) ───────
//
// ★ ONE SHAPE, AND IT IS WHY THE SCREENS NEED NO `isMultiDay`. Every DTO below
// carries the day it is about and how many days the session has. A screen
// renders a day label when — and only when — `dayCount > 1`, which is contract
// 7's «flat at n ≤ 1» applied to this track: at one day the DTO still has a
// day, the screen simply has nothing to say about it, so the DOM is the one
// wave 7 shipped.
//
// The words are NOT here: `dayLabel()` (`components/sessions/day-label.ts`,
// contract 7) needs a translator, and a DAL module has none. The DTO carries
// `day` and `timeZone`; the page formats.

/** The day a check-in screen is about, as its DTO carries it. */
export interface CheckInDay {
  id: string;
  /** DERIVED IN THE DATABASE (DEC-150): the chronological rank, 1…n. */
  position: number;
  startsAt: string;
  endsAt: string;
}

const asCheckInDay = (d: SessionDay): CheckInDay => ({ id: d.id, position: d.position, startsAt: d.startsAt, endsAt: d.endsAt });

// Check-in and the host view (REQ-CHK-001…017, STORY-CHK-001..006, REQ-UIX-015,
// DEC-090, DEC-141). RPCs live in supabase/migrations/0084-0089 (promoted
// 7b2ac81). check_in() returns a JSON envelope rather than raising for
// expected outcomes (rate limit, wrong code, wrong window, overlap) — see
// 0084's header for why: raising would roll back the check_in_attempts row
// DEC-015 requires to survive.
//
// ★ REQ-CHK-017: `check_ins.removed_at is null` means "still counts as
// checked in." RLS does not hide a removed row (it is a staff-readable
// history row, not a secret), so every read below that decides "is this
// member checked in" filters it explicitly — a bug found post-promotion,
// not caught by the RLS suite because RLS was never the boundary here.

export interface HostViewData {
  sessionId: string;
  /** Null outside the session window — a code exists only while the session is live (REQ-CHK-004, migration 0078). */
  code: string | null;
  /** The full six-phase vocabulary, computed by `sessionPhase()` from the row — not guessed from the RPC's error string (bug (d), 16 §5.4.1 row 6). */
  phase: SessionPhase;
  startsAt: string | null;
  /** DEC-065: off means a code is accepted only from a member with a confirmed reservation. */
  allowWalkIns: boolean;
  /** DEC-141/REQ-CHK-015 — the manual switch, independent of `allowWalkIns`
   *  and of the code's own existence: `ensure_check_in_code()` still issues
   *  a rotating code while closed (0084's own comment — the room can see
   *  what reopening would accept), but `check_in()` refuses every attempt
   *  with `check_in_closed` until it's flipped back open. */
  checkInOpen: boolean;
  validFrom: string | null;
  validUntil: string | null;
  /** ★ THE DAY'S, not the session's — the room is counting who is in it now. */
  checkInCount: number;
  rotationSeconds: number;
  /** `affordancesFor(phase, "staff").hostConsole` — true only for `open` (pre-flight) and `live`. The page gates the walk-in and manual-marking sections on this, not on "is staff" alone. */
  consoleActive: boolean;
  /**
   * The day this console is running (DEC-119). Taken from the CODE the RPC
   * just issued, so the code on the wall and the day named beside it can never
   * be two different meetings; when there is no code — before the first day,
   * or after a ceiling — it falls back to the same rule the RPC uses.
   * Null only for a session with no days at all.
   */
  day: CheckInDay | null;
  /** 1 for nearly every session. The page renders a day label only above 1. */
  dayCount: number;
  /** The SESSION's zone: a day of a workshop is a fact about the room (OQ-018). */
  timeZone: string;
}

/** The live code and count for the host view. Null when the caller isn't the presenter or staff (REQ-CHK-014). */
export async function getHostView(locale: string, sessionId: string): Promise<HostViewData | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const { supabase } = await sessionClient(locale);

  const [codeRes, countRes, settingsRes, sessionRes, days] = await Promise.all([
    // `p_day` left null on purpose: the RPC resolves it, and the row it returns
    // NAMES the day it minted for. Resolving here and passing it would put the
    // app's clock and the database's on either side of a day boundary.
    supabase.rpc("ensure_check_in_code", { p_session: sessionId }),
    // The ids, not a `head: true` count — one round trip answers «how many on
    // THIS day», and the day is not known until the RPC above returns.
    supabase.from("check_ins").select("session_day_id").eq("session_id", sessionId).is("removed_at", null),
    supabase.from("org_settings").select("check_in_rotation_seconds").maybeSingle(),
    supabase.from("sessions").select("state, starts_at, ends_at, duration_minutes, time_zone, allow_walk_ins, check_in_open").eq("id", sessionId).maybeSingle(),
    listSessionDays(locale, sessionId),
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
  const allowWalkIns = s.allow_walk_ins === true;
  const c = codeRes.error ? null : (codeRes.data as { code: string; valid_from: string; valid_until: string; session_day_id: string });
  const phase = sessionPhase({ state: s.state, startsAt: s.starts_at, endsAt: s.ends_at, durationMinutes: s.duration_minutes, days });

  // The code's own day first — it is the one the RPC just minted for, so the
  // six characters on the wall and the day named beside them are the same
  // meeting. With no code (outside every window) the same rule the RPC uses.
  // ★ `resolveDay()` is generic over the day type since `55d09a2`, so this
  // keeps the `SessionDay` — and with it `checkInOpen`, on the same array the
  // day was resolved out of.
  const day = (c ? days.find((d) => d.id === c.session_day_id) : undefined) ?? resolveDay(days, new Date());
  // ★ The DAY's switch and the DAY's count. `sessions.check_in_open` is the
  // `bool_or` shadow of the days (DEC-150 contract 2) and is the right answer
  // only at one day — it is the fallback for a session with no days at all.
  const checkInOpen = day ? day.checkInOpen : s.check_in_open === true;
  const checkInCount = (countRes.data ?? []).filter((r) => !day || r.session_day_id === day.id).length;

  // "staff" and "presenter" carry an identical cell (both are the console's
  // two eligible viewers) — `getHostView()` already only reaches this point
  // for one of the two (the RPC's own not_authorized check above), so either
  // key reads the same answer.
  const consoleActive = affordancesFor(phase, "staff").hostConsole;

  return {
    sessionId,
    code: c?.code ?? null,
    phase,
    startsAt: s.starts_at,
    allowWalkIns,
    checkInOpen,
    validFrom: c?.valid_from ?? null,
    validUntil: c?.valid_until ?? null,
    checkInCount,
    rotationSeconds,
    consoleActive,
    day: day ? asCheckInDay(day) : null,
    dayCount: days.length,
    timeZone: s.time_zone,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// the switch itself — REQ-CHK-015/016, DEC-141. A thin wrapper: authority,
// the role set (presenter of THIS session, or staff) and the ceiling are
// all `set_check_in_open()`'s own (0084) — this only turns its three named
// exceptions into the DAL's usual result shape, the same pattern every
// other RPC wrapper in this file already uses.
// ═══════════════════════════════════════════════════════════════════════════

export type SetCheckInOpenError = "not_found" | "not_authorized" | "not_open" | "ceiling_passed" | "unknown";

export async function setCheckInOpen(
  locale: string,
  sessionId: string,
  open: boolean,
  dayId: string | null = null,
): Promise<{ ok: true } | { ok: false; error: SetCheckInOpenError }> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("set_check_in_open", { p_session: sessionId, p_open: open, p_day: dayId });
  if (error) {
    const known: SetCheckInOpenError[] = ["not_found", "not_authorized", "not_open", "ceiling_passed"];
    return { ok: false, error: known.find((k) => error.message.includes(k)) ?? "unknown" };
  }
  return { ok: true };
}

// ★ `setWalkIns()` is gone — DEC-117: walk-ins move to a publishing setting
// (`schedule_session()`'s new `p_allow_walk_ins` parameter, 0085) and the
// host view loses the toggle entirely. `set_session_walk_ins()` itself is
// dropped as of 0085 too; nothing here calls it anymore either way.

/** `dayId` is the day whose code is on the wall — see `revokeCodeAction`'s own header. */
export async function revokeCode(locale: string, sessionId: string, dayId: string | null = null): Promise<void> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("revoke_check_in_code", { p_session: sessionId, p_day: dayId });
  if (error) throw new Error(`revoke_check_in_code: ${error.message}`);
}

// ── the check-in SCREEN's own read — bug (c), 16 §5.4.1 row 4b ─────────────
//
// Reuses the same `error.*` translation keys the post-submit banner already
// carries (`not_started`, `session_ended`, `presenter_cannot_check_in`,
// `reservation_required`, and now `check_in_closed`) as proactive reasons,
// not just refusals — they already say the right thing before a keystroke,
// not only after one.
export type { CheckInIneligibleReason };

export interface CheckInScreenData {
  sessionId: string;
  title: string;
  phase: SessionPhase;
  relation: ViewerRelation;
  allowWalkIns: boolean;
  /** From `checkInIneligibleReason()` — the screen renders the form on this, never re-derives it. */
  canAttemptCheckIn: boolean;
  /** Null exactly when `canAttemptCheckIn` is true — nothing to explain. */
  ineligibleReason: CheckInIneligibleReason | null;
  /**
   * The day the member is checking into — and, when they are refused, the day
   * the refusal is about. Both come from `checkInDayFor()`, so «انتهى وقت
   * تسجيل الحضور لليوم الثاني» can never name a different meeting from the one
   * the gate judged. Null only for a session with no days.
   */
  day: CheckInDay | null;
  /** 1 for nearly every session; the screen says nothing about the day below 2. */
  dayCount: number;
  timeZone: string;
}

/**
 * Reads the session BEFORE rendering the code form (bug (c): the screen used
 * to render the form for any session id — no title, no phase, no RSVP read —
 * and let the member find out after typing six characters). Null when the
 * session doesn't exist or `sessions_read` doesn't show it to this viewer —
 * the page turns that into a 404, the same boundary the event page uses.
 *
 * ★ DEC-141: `canAttemptCheckIn`/`ineligibleReason` come from
 * `checkInIneligibleReason()` (session-matrix.ts) — self-contained, on the
 * RAW viewer facts, never `phase`/`relation` (the grace window outlives the
 * phase those are bucketed by). `phase`/`relation` are still returned on the
 * DTO — other things on this page may want them later — but nothing here
 * derives eligibility from them any more.
 */
export async function getCheckInScreenData(locale: string, sessionId: string): Promise<CheckInScreenData | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const { session, supabase } = await sessionClient(locale);

  const [sessionRes, presenterRes, rsvpRes, checkInRes, days] = await Promise.all([
    supabase.from("sessions").select("id, title, state, starts_at, ends_at, duration_minutes, time_zone, allow_walk_ins, check_in_open").eq("id", sessionId).maybeSingle(),
    supabase.from("session_presenters").select("member_id").eq("session_id", sessionId).eq("member_id", session.memberId).eq("accepted", true).maybeSingle(),
    supabase.from("rsvps").select("status").eq("session_id", sessionId).eq("member_id", session.memberId).maybeSingle(),
    // Every day, not one: «already checked in» is per day (REQ-CHK-005 per
    // DEC-119), and the screen wants the answer for the day it is about.
    supabase.from("check_ins").select("session_day_id").eq("session_id", sessionId).eq("member_id", session.memberId).is("removed_at", null),
    listSessionDays(locale, sessionId),
    // ★ ONE CALL, and the ONLY definition of «attended the session» (contract
    // 6). Staff-gated inside (`is_staff()`), which this reader already is.
    supabase.rpc("session_complete_attendees", { p_session: sessionId }),
  ]);
  if (sessionRes.error) throw new Error(`sessions: ${sessionRes.error.message}`);
  if (!sessionRes.data) return null;
  if (presenterRes.error) throw new Error(`session_presenters: ${presenterRes.error.message}`);
  if (rsvpRes.error) throw new Error(`rsvps: ${rsvpRes.error.message}`);
  if (checkInRes.error) throw new Error(`check_ins: ${checkInRes.error.message}`);

  const s = sessionRes.data;
  const phaseInput: PhaseInput = { state: s.state, startsAt: s.starts_at, endsAt: s.ends_at, durationMinutes: s.duration_minutes, days };
  const phase = sessionPhase(phaseInput);
  const isStaff = session.role === "admin" || session.role === "moderator";
  const isPresenter = Boolean(presenterRes.data);
  const rsvpStatus = (rsvpRes.data?.status as RsvpStatus | undefined) ?? null;
  // ★ ONE INSTANT for the day and for the gate. `checkInIneligibleReason()`
  // resolves the day itself, so leaving both to default to `new Date()` would
  // let two calls microseconds apart straddle a day boundary — and the screen
  // would then name one meeting and refuse about another.
  const now = new Date();
  const day = resolveDay(days, now);
  // ★ PER DAY. A member who attended day 1 is not «already checked in» to day 2.
  const checkedIn = (checkInRes.data ?? []).some((r) => (day ? r.session_day_id === day.id : true));
  const relation = viewerRelation({ isStaff, isPresenter, rsvpStatus, checkedIn }, phase);
  const allowWalkIns = s.allow_walk_ins === true;
  // The session-level shadow is the fallback the matrix uses only when the day
  // carries no switch of its own (DEC-150 contract 2).
  const checkInOpen = s.check_in_open === true;
  const ineligibleReason = checkInIneligibleReason(phaseInput, { isStaff, isPresenter, rsvpStatus, checkedIn }, allowWalkIns, checkInOpen, now);

  return {
    sessionId,
    title: s.title,
    phase,
    relation,
    allowWalkIns,
    canAttemptCheckIn: ineligibleReason === null,
    ineligibleReason,
    day: day ? asCheckInDay(day) : null,
    dayCount: days.length,
    timeZone: s.time_zone,
  };
}

/**
 * The predicate for the event page's check-in LINK — bug (e), the worst of
 * the five (16 §5.4.1 row 4, DEC-090): a primary navy button offered to any
 * member on any live session, leading to a screen the RPC refuses. Exported
 * as a function, not handed to the lead as prose (DEC-103).
 *
 * Thin re-export of `checkInWindowAllowed()` (session-matrix.ts) — pure,
 * self-contained, never routed through `sessionPhase()`/`viewerRelation()`,
 * because the grace window (`ends_at + 2h`) outlives the phase they derive
 * from. `viewer` is the RAW facts, not a derived `ViewerRelation` — that is
 * the whole point (see session-matrix.ts's own header for the bug this
 * avoids). `sessions` wired the event page's call site at `a55cf37`.
 */
export function canOfferCheckInFor(session: PhaseInput, viewer: ViewerInput, allowWalkIns: boolean, checkInOpen: boolean, now: Date = new Date()): boolean {
  return checkInWindowAllowed(session, viewer, allowWalkIns, checkInOpen, now);
}

export const checkInInput = z.object({ code: z.string().trim().toUpperCase().length(6) });

export type CheckInError = "not_found" | "presenter_cannot_check_in" | "rate_limited" | "not_started" | "session_ended" | "not_open" | "check_in_closed" | "invalid_code" | "overlap" | "unknown";

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
export async function listUncheckedConfirmedRsvps(locale: string, sessionId: string, dayId: string | null = null): Promise<UncheckedAttendee[]> {
  const { supabase } = await sessionClient(locale);
  const [rsvpsRes, checkInsRes] = await Promise.all([
    // One registration covers every day (DEC-120), so the RSVP side is the
    // session's — only the check-in side is the day's.
    supabase.from("rsvps").select("member_id, members(display_name)").eq("session_id", sessionId).eq("status", "confirmed"),
    supabase.from("check_ins").select("member_id, session_day_id").eq("session_id", sessionId).is("removed_at", null),
  ]);
  if (rsvpsRes.error) throw new Error(`rsvps: ${rsvpsRes.error.message}`);
  if (checkInsRes.error) throw new Error(`check_ins: ${checkInsRes.error.message}`);
  const checkedIn = new Set((checkInsRes.data ?? []).filter((c) => !dayId || c.session_day_id === dayId).map((c) => c.member_id));
  return (rsvpsRes.data ?? [])
    .filter((r) => !checkedIn.has(r.member_id))
    .map((r) => {
      const member = Array.isArray(r.members) ? r.members[0] : r.members;
      return { memberId: r.member_id, displayName: (member as { display_name: string | null } | null)?.display_name ?? null };
    });
}

export const manualCheckInInput = z.object({ memberId: z.uuid(), reason: z.string().trim().min(1).max(300) });

export type ManualCheckInError = "not_authorized" | "reason_required" | "not_found" | "not_open" | "member_not_found" | "presenter_cannot_check_in" | "unknown";

/**
 * `dayId` is the day the mark is FOR — SCR-044 always sends it, because an
 * admin corrects Tuesday's list on Thursday and the clock would otherwise say
 * Thursday. Null resolves in the RPC exactly as `main`'s call does, which at
 * one day is the one day (DEC-150 contract 4).
 */
export async function markCheckedInManually(
  locale: string,
  sessionId: string,
  memberId: string,
  reason: string,
  dayId: string | null = null,
): Promise<{ ok: true; arrivedAt: string } | { ok: false; error: ManualCheckInError }> {
  const { supabase } = await sessionClient(locale);
  const { data, error } = await supabase.rpc("mark_checked_in_manually", { p_session: sessionId, p_member: memberId, p_reason: reason, p_day: dayId });
  if (error) {
    const known: ManualCheckInError[] = ["not_authorized", "reason_required", "not_found", "not_open", "member_not_found", "presenter_cannot_check_in"];
    return { ok: false, error: known.find((k) => error.message.includes(k)) ?? "unknown" };
  }
  const row = data as { arrived_at: string };
  return { ok: true, arrivedAt: row.arrived_at };
}

// ── console (wave 3) — added for SCR-044, never changes anything above ─────

/**
 * One member on one day — the cell SCR-044 renders (`REQ-SES-017`: «who
 * attended which»). At one day a row has exactly one of these and the screen
 * renders it inline with no day header, which is the table wave 7 shipped.
 */
export interface AttendanceCell {
  dayId: string;
  /** The chronological rank the database derives (DEC-150). */
  position: number;
  /** An ACTIVE check-in on this day. A removed one reads false here. */
  checkedIn: boolean;
  arrivedAt: string | null;
  method: "code" | "manual" | null;
  /** This day's most recent check-in was removed and never re-added (REQ-CHK-017). */
  removed: boolean;
  removedAt: string | null;
  removalReason: string | null;
  removedByName: string | null;
}

export interface AttendanceRow {
  memberId: string;
  displayName: string | null;
  rsvpStatus: "confirmed" | "waitlisted" | "cancelled" | "late_cancelled" | null;
  /** True only for an ACTIVE check-in (`removed_at is null`) — a removed
   *  one reads as `false` here, same as never having checked in (REQ-CHK-017:
   *  a removal reverses `no_show` symmetrically, so this row's own
   *  `isNoShow` follows the same rule the RPC itself applies). */
  checkedIn: boolean;
  arrivedAt: string | null;
  method: "code" | "manual" | null;
  /** Checked in with no confirmed RSVP at all (REQ-CHK-010's walk-in). Set
   *  from the shape of the row (no matching RSVP), independent of removal —
   *  a removed walk-in is still shown as one, just no longer `checkedIn`. */
  isWalkIn: boolean;
  /** Confirmed RSVP, no ACTIVE check-in (`evaluate_no_shows`' own definition,
   *  `worker/src/tasks/evaluate_no_shows.ts` — computed the same way here so
   *  the report and the points job never disagree on what a no-show is). */
  isNoShow: boolean;
  /** REQ-CHK-017's own report redesign, C3: the row's most recent check-in
   *  was removed and never re-added. `checkedIn` is `false` in this case —
   *  these three fields are what explain why, rather than reading like the
   *  member simply never showed up. */
  removed: boolean;
  removedAt: string | null;
  removalReason: string | null;
  removedByName: string | null;
  /**
   * ★ One cell per day of the session, in `position` order — the whole of
   * «who attended which». Length 1 for nearly every session, and the screen
   * renders a single cell flat (contract 7's rule, applied here).
   *
   * The flat fields above are the row's SUMMARY across days and keep exactly
   * the meaning they had at one day: `checkedIn` is an active check-in on ANY
   * day, which is `has_checked_in()`'s own definition, and the arrival and
   * removal fields describe the representative check-in (an active one wins;
   * between two removed, the more recently removed). They are what
   * `lib/dal/admin-exports.ts` reads, and they do not move.
   */
  days: AttendanceCell[];
  /** How many days this member has an active check-in on. `days.length` means every day. */
  daysAttended: number;
  /**
   * ★ Whether this member counts as having attended the SESSION — contract 6's
   * `session_attendance_complete()`, read through `session_complete_attendees()`
   * (`0108`) and NEVER re-derived here. The predicate itself is executable by
   * no client role, for a good reason: it takes a bare `(session, member)` pair
   * and would otherwise let any member probe anyone's attendance. The staff-
   * gated set function is how a staff screen reaches it, in one call.
   */
  attendanceComplete: boolean;
}

export interface AttendanceReport {
  sessionId: string;
  sessionTitle: string;
  sessionState: string;
  rows: AttendanceRow[];
  /** Every day of the session, in order. Length 1 for nearly every session. */
  days: CheckInDay[];
  /** `sessions.require_all_days` (REQ-SES-017) — what «أكمل الحضور» means for this session. */
  requireAllDays: boolean;
  timeZone: string;
  counts: {
    reserved: number;
    confirmed: number;
    /** An active check-in on ANY day — identical to today's meaning at one day. */
    checkedIn: number;
    walkedIn: number;
    noShowed: number;
    /**
     * Members who count as having attended the SESSION (`REQ-SES-017`) —
     * contract 6's predicate, counted through `session_complete_attendees()`.
     * Null only when that call fails, which the screen renders as an em dash
     * rather than as a zero: «nobody completed» and «I could not ask» are
     * different sentences and a report must not confuse them.
     */
    completedAllDays: number | null;
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
export async function listUncheckedForAdminManualMark(locale: string, sessionId: string, dayId: string | null = null): Promise<UncheckedAttendee[]> {
  const { session, supabase } = await sessionClient(locale);
  if (session.role !== "admin" && session.role !== "moderator") return [];

  const [rsvpsRes, checkInsRes] = await Promise.all([
    supabase.from("rsvps").select("member_id, members(display_name)").eq("session_id", sessionId).in("status", ["confirmed", "waitlisted"]),
    supabase.from("check_ins").select("member_id, session_day_id").eq("session_id", sessionId).is("removed_at", null),
  ]);
  if (rsvpsRes.error) throw new Error(`rsvps: ${rsvpsRes.error.message}`);
  if (checkInsRes.error) throw new Error(`check_ins: ${checkInsRes.error.message}`);
  // Per day when one is named: a member marked present on day 1 is still a
  // candidate for day 2, which is the whole reason SCR-044 sends the day.
  const checkedIn = new Set((checkInsRes.data ?? []).filter((c) => !dayId || c.session_day_id === dayId).map((c) => c.member_id));
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

  const [sessionRes, rsvpsRes, checkInsRes, days, completeRes] = await Promise.all([
    supabase.from("sessions").select("id, title, state, time_zone, require_all_days").eq("id", sessionId).maybeSingle(),
    supabase.from("rsvps").select("member_id, status, members(display_name)").eq("session_id", sessionId),
    // `!check_ins_member_id_fkey` / `remover:...!check_ins_removed_by_fkey`:
    // `check_ins` has THREE foreign keys into `members` now (`member_id`,
    // `marked_by`, `removed_by`) — an unqualified `members(...)` embed is
    // ambiguous and PostgREST refuses it outright, a real bug this had
    // until an e2e run against a real build actually exercised the query
    // for the first time (`checkin.md`).
    //
    // ★ REQ-CHK-017/C3: no longer filtered to active rows — a removed
    // check-in is still fetched, so the report can show it with its own
    // reason instead of reading exactly like the member never showed up.
    // `checkInByMember` below picks the ACTIVE row for a member when one
    // exists, and only falls back to their most-recently-removed row when
    // it doesn't (the rare re-added-after-removal case keeps the active row
    // as the one truth; the removal is still on `check_ins`/`audit_log` for
    // anyone who needs the history).
    supabase
      .from("check_ins")
      .select(
        "member_id, session_day_id, arrived_at, method, removed_at, removal_reason, members!check_ins_member_id_fkey(display_name), remover:members!check_ins_removed_by_fkey(display_name)",
      )
      .eq("session_id", sessionId),
    listSessionDays(locale, sessionId),
    // ★ ONE CALL, and the ONLY definition of «attended the session» (contract
    // 6). Staff-gated inside (`is_staff()`), which this reader already is.
    supabase.rpc("session_complete_attendees", { p_session: sessionId }),
  ]);
  if (sessionRes.error) throw new Error(`sessions: ${sessionRes.error.message}`);
  if (!sessionRes.data) return null;
  if (rsvpsRes.error) throw new Error(`rsvps: ${rsvpsRes.error.message}`);
  if (checkInsRes.error) throw new Error(`check_ins: ${checkInsRes.error.message}`);

  // A failure here is not fatal to the report: every other figure is still
  // true, and the stat says so with an em dash.
  const complete: Set<string> | null = completeRes.error ? null : new Set((completeRes.data as string[] | null) ?? []);

  type MemberEmbed = { display_name: string | null } | { display_name: string | null }[] | null;
  const nameOf = (m: MemberEmbed) => (Array.isArray(m) ? (m[0]?.display_name ?? null) : (m?.display_name ?? null));

  type CheckInJoinRow = NonNullable<typeof checkInsRes.data>[number] & { member_id: string; session_day_id?: string | null };
  const allCheckIns = (checkInsRes.data ?? []) as unknown as CheckInJoinRow[];

  // ★ An active row always wins; between two removed rows, the more recently
  // removed one is the one worth showing. Wave 7's rule, now applied PER CELL
  // as well as per row — a member removed from day 2 and re-added to it has
  // one active day-2 cell, and the removal stays in `check_ins`/`audit_log`.
  const better = (a: CheckInJoinRow, b: CheckInJoinRow | undefined) => {
    if (!b) return true;
    if (!a.removed_at && b.removed_at) return true;
    if (a.removed_at && b.removed_at) return (a.removed_at as string) > (b.removed_at as string);
    return false;
  };

  const byMemberDay = new Map<string, CheckInJoinRow>();
  const checkInByMember = new Map<string, CheckInJoinRow>();
  for (const c of allCheckIns) {
    const key = `${c.member_id}|${c.session_day_id ?? ""}`;
    if (better(c, byMemberDay.get(key))) byMemberDay.set(key, c);
    if (better(c, checkInByMember.get(c.member_id))) checkInByMember.set(c.member_id, c);
  }

  /** One cell per day of the session, in order. Empty only when the session has none. */
  const cellsFor = (memberId: string): AttendanceCell[] =>
    days.map((d) => {
      const c = byMemberDay.get(`${memberId}|${d.id}`);
      const removed = !!c?.removed_at;
      return {
        dayId: d.id,
        position: d.position,
        checkedIn: !!c && !removed,
        arrivedAt: c?.arrived_at ?? null,
        method: (c?.method as AttendanceCell["method"]) ?? null,
        removed,
        removedAt: c?.removed_at ?? null,
        removalReason: c?.removal_reason ?? null,
        removedByName: removed ? nameOf(c?.remover as MemberEmbed) : null,
      };
    });

  const rows: AttendanceRow[] = [];
  const seen = new Set<string>();

  for (const r of rsvpsRes.data ?? []) {
    seen.add(r.member_id);
    const ci = checkInByMember.get(r.member_id);
    const removed = !!ci?.removed_at;
    const status = r.status as AttendanceRow["rsvpStatus"];
    const cells = cellsFor(r.member_id);
    rows.push({
      memberId: r.member_id,
      displayName: nameOf(r.members as MemberEmbed),
      rsvpStatus: status,
      checkedIn: !!ci && !removed,
      arrivedAt: ci?.arrived_at ?? null,
      method: (ci?.method as AttendanceRow["method"]) ?? null,
      isWalkIn: false,
      isNoShow: status === "confirmed" && (!ci || removed),
      removed,
      removedAt: ci?.removed_at ?? null,
      removalReason: ci?.removal_reason ?? null,
      removedByName: removed ? nameOf(ci?.remover as MemberEmbed) : null,
      days: cells,
      daysAttended: cells.filter((c) => c.checkedIn).length,
      attendanceComplete: complete?.has(r.member_id) ?? false,
    });
  }
  for (const [memberId, c] of checkInByMember) {
    if (seen.has(memberId)) continue;
    const removed = !!c.removed_at;
    const cells = cellsFor(memberId);
    rows.push({
      memberId,
      displayName: nameOf(c.members as MemberEmbed),
      rsvpStatus: null,
      checkedIn: !removed,
      arrivedAt: c.arrived_at,
      method: c.method as AttendanceRow["method"],
      isWalkIn: true,
      isNoShow: false,
      removed,
      removedAt: c.removed_at,
      removalReason: c.removal_reason,
      removedByName: removed ? nameOf(c.remover as MemberEmbed) : null,
      days: cells,
      daysAttended: cells.filter((cell) => cell.checkedIn).length,
      attendanceComplete: complete?.has(memberId) ?? false,
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
    days: days.map(asCheckInDay),
    requireAllDays: sessionRes.data.require_all_days !== false,
    timeZone: sessionRes.data.time_zone,
    counts: {
      reserved: rsvpsRes.data?.length ?? 0,
      confirmed,
      checkedIn: rows.filter((r) => r.checkedIn).length,
      walkedIn: rows.filter((r) => r.isWalkIn && r.checkedIn).length,
      noShowed: rows.filter((r) => r.isNoShow).length,
      completedAllDays: complete === null ? null : complete.size,
    },
    attendanceRate: confirmed > 0 ? checkedInAmongConfirmed / confirmed : null,
  };
}

export const removeCheckInInput = z.object({ memberId: z.uuid(), reason: z.string().trim().min(1).max(300) });

// `not_a_member`/`stale_claims`/`not_an_admin` kept as three separate names,
// verbatim from `assert_active_member()`/`assert_fresh_admin()` (0005) — the
// same convention `admin-members.ts`'s own known-error unions already use,
// rather than collapsing them into one bucket the RPC itself doesn't have.
export type RemoveCheckInError = "not_a_member" | "stale_claims" | "not_an_admin" | "reason_required" | "not_found" | "unknown";

/**
 * REQ-CHK-017, C3. `remove_check_in()` (0087) is admin-only, does the whole
 * reversal (points, certificate, no-show symmetry) inline in one
 * transaction, and is idempotent against a second attempt on the same
 * check-in (`not_found` — already removed). This wrapper adds nothing;
 * every consequence is the RPC's, none re-derived here (invariant 9:
 * `points_ledger` is append-only with `service_role` revoked, so a client
 * could never do this write itself even if it wanted to).
 */
export async function removeCheckIn(
  locale: string,
  sessionId: string,
  memberId: string,
  reason: string,
  dayId: string | null = null,
): Promise<{ ok: true } | { ok: false; error: RemoveCheckInError }> {
  const { supabase } = await sessionClient(locale);
  const { error } = await supabase.rpc("remove_check_in", { p_session: sessionId, p_member: memberId, p_reason: reason, p_day: dayId });
  if (error) {
    const known: RemoveCheckInError[] = ["not_a_member", "stale_claims", "not_an_admin", "reason_required", "not_found"];
    return { ok: false, error: known.find((k) => error.message.includes(k)) ?? "unknown" };
  }
  return { ok: true };
}
