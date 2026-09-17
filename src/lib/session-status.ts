// The session-lifecycle vocabulary — `16` §5, REQ-UIX-003, REQ-UIX-004, DEC-071.
//
// THREE functions, not one enum. The first draft of `16` defined a single
// nine-value `sessionStatus()` and it failed three ways, which is worth
// recording because the obvious design is the broken one:
//
//   1. It conflated three independent axes. `waitlist` is a CAPACITY fact,
//      `closing` is a CLOCK fact, and neither is a lifecycle state. Worse, the
//      affordance table it was meant to drive depends on a fourth thing an enum
//      cannot carry at all — WHO IS LOOKING. A member with a confirmed seat, a
//      member on the waitlist, the presenter and an admin see four different
//      pages on the same session in the same state.
//   2. It was not total. A `published` session with a null `startsAt` matched
//      no branch, and those exist.
//   3. It renamed a database state for no reason — `pending_schedule` became
//      `awaiting_schedule`, which guarantees that one day someone compares the
//      two and they do not match.
//
// So: `sessionPhase` (lifecycle x clock, TOTAL), `seatState` (capacity,
// presentation only, never gates a write) and `viewerRelation` (read from the
// viewer's own rows, never inferred). `<SessionStatusBadge>` composes the first
// two, which is why «قائمة انتظار» and «يُغلق التسجيل قريبًا» are DERIVATIONS
// and not states.
//
// ★★ THESE ARE PRESENTATION, NEVER AUTHORITY. RLS and the RPCs remain the
// boundary (REQ-NFR-001); a hidden button is a courtesy and the database
// refuses the write regardless. And the direction is one-way — see
// `canGrantOn` at the bottom, and DEC-090.
//
// ★ NO `import "server-only"`, deliberately. Every other module that shapes
// what a member sees is server-only because it touches the DAL; this one
// touches nothing. `<SessionStatusBadge>` is rendered inside client components
// (the action card's two states) and the 49-cell matrix is asserted in a Node
// unit test, so marking it server-only would break both for no gain. It reads
// no cookie, takes no client, and cannot leak a row because it is handed one.

// ── the database's own spellings, verbatim ────────────────────────────────
// `public.session_state` (0010_m2_schema.sql:17). Not renamed, not narrowed.
export type SessionState =
  | "draft"
  | "submitted"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "published"
  | "in_progress"
  | "completed"
  | "archived"
  | "cancelled";

/** 1 — LIFECYCLE x CLOCK. Total: every session maps to exactly one. */
export type SessionPhase = "draft" | "pending_schedule" | "open" | "live" | "ended" | "cancelled";

/** 2 — CAPACITY x now. Presentation only; never gates a write. */
export type SeatState = "unlimited" | "available" | "full" | "closed";

/** 3 — WHO IS LOOKING. Read from the viewer's own rows, never inferred. */
export type ViewerRelation =
  | "none"
  | "confirmed"
  | "waitlisted"
  /** `attended` and `absent` are only meaningful once the phase is `ended`. */
  | "attended"
  | "absent"
  | "presenter"
  | "staff";

export const SESSION_PHASES: readonly SessionPhase[] = [
  "draft",
  "pending_schedule",
  "open",
  "live",
  "ended",
  "cancelled",
] as const;

export const VIEWER_RELATIONS: readonly ViewerRelation[] = [
  "none",
  "confirmed",
  "waitlisted",
  "attended",
  "absent",
  "presenter",
  "staff",
] as const;

// ── 1 · sessionPhase ──────────────────────────────────────────────────────

/**
 * One day of a session — `ENT-session_days` (DEC-119), as `listSessionDays()`
 * returns it. `position` is the chronological rank and is derived in the
 * database (DEC-150); nothing here sorts by it or trusts it over the instants.
 */
export interface DayWindow {
  id: string;
  position: number;
  startsAt: string;
  endsAt: string;
  /**
   * The day's own check-in switch (`session_days.check_in_open`, DEC-116 per
   * day). Optional so a caller that only needs windows need not read it; the
   * matrix reads it off the SAME array it resolved the day out of, so the
   * switch can never go stale beside the window (DEC-151).
   */
  checkInOpen?: boolean;
}

export interface PhaseInput {
  state: SessionState;
  /** DERIVED AND STORED (DEC-150): the first day's start. Read it; never recompute it from `days`. */
  startsAt: string | null;
  /** DERIVED AND STORED (DEC-150): the last day's end. */
  endsAt: string | null;
  /** Falls back to `startsAt + durationMinutes` when `endsAt` is null. */
  durationMinutes?: number | null;
  /**
   * The session's days (DEC-119). ★ OPTIONAL ON PURPOSE, AND NOT A MODE SWITCH:
   * a caller that does not pass them — every caller that existed before wave 9
   * — is asking about a session whose own window IS its one day's, which is
   * what a session with one day is. With days, the only thing that changes is
   * that the hours BETWEEN two days stop reading as `live`.
   */
  days?: readonly DayWindow[] | null;
}

/**
 * ★ The `published && clock` clauses are the fix for ask 4.
 *
 * The clock job is authoritative for the DATABASE; the clock is authoritative
 * for the SCREEN. A `published` session whose start has passed reads `live`
 * here even while `JOB-start_session` lags, and one whose end has passed reads
 * `ended` — so the register button is gone before the row catches up.
 *
 * `16` §5.1's totality table, restated so the awkward cases are visible:
 *
 *   published, startsAt null      → `open`   it can be reserved, and there is
 *                                            nothing to compare to the clock
 *   published, start set, end null → start + durationMinutes, else `live`
 *                                            once the start has passed
 *   in_progress, end passed        → `ended`  the clock wins over a stale row
 *   archived                       → `ended`  an ended session that was filed
 *
 * ★★ TWO OF THOSE ROWS CANNOT HAPPEN, and `16` §5.1 does not know it (DEC-105).
 * `0010_m2_schema.sql:102-104` is a table check constraint:
 *
 *   check (state not in ('published','in_progress','completed','archived')
 *          or (starts_at is not null and ends_at is not null
 *              and capacity is not null and (venue_id is not null or …)))
 *
 * so a `published` session ALWAYS has both ends, and always has a capacity.
 * Nothing since has relaxed it. Totality is still written and still tested,
 * because a `draft` or `approved` session legitimately has nulls and because a
 * constraint is not a type — but the unreachable rows are marked so that the
 * next reader does not spend an afternoon on the `open` forever case, and so
 * that nobody reasons from it to a member-facing conclusion.
 *
 * ★ `16` §5.1 resolves the end-less case to «`open` forever». That reading was
 * written for a session the clock cannot place, and it is the wrong answer for
 * one whose START has passed: «احجز مقعدًا» on a talk that began an hour ago is
 * exactly ask 4. `live` is the conservative answer — it removes registration
 * and, because the source is then the clock, `canGrantOn()` still refuses
 * check-in. The row is unreachable in any case.
 */
export function sessionPhase(session: PhaseInput, now: Date = new Date()): SessionPhase {
  const { state } = session;
  if (state === "cancelled") return "cancelled";
  if (state === "completed" || state === "archived") return "ended";

  // Everything before `approved` is a draft as far as a screen is concerned:
  // it is not schedulable, not visible to a member, and offers nothing.
  if (state === "draft" || state === "submitted" || state === "in_review" || state === "changes_requested") {
    return "draft";
  }

  const start = parseInstant(session.startsAt);
  const end = scheduledEnd(session, start);

  // Approved is awaiting publication whether or not it has a date: the schedule
  // screen is where both cases are handled, and neither offers a member
  // anything. `pending_schedule` is the database's own spelling, kept.
  if (state === "approved") return "pending_schedule";

  // ★ DEC-119: «a session is `live` while ANY day is running, `ended` once the
  // LAST day has ended». The session's stored window already IS first start →
  // last end, so `ended` needs nothing new. `live` needs one refinement: the
  // night between two days is inside the window and is not a day. It reads
  // `open` — the next day is ahead, its tasks and «قبل» materials are what a
  // member needs, and registration is already shut by the deadline (≤ the
  // first day's start, by CHECK). There is deliberately NO seventh phase: the
  // 42-cell matrix and every badge stay as they are (DEC-150, contract 9).
  // `betweenDays()` walks consecutive PAIRS of days, so with one day or none it
  // has nothing to walk and is false — this is not a multi-day branch.
  const inGap = betweenDays(session.days, now);

  if (state === "in_progress") {
    // The clock beats a stale row: a session the job started and never
    // completed is `ended` once its end time has passed.
    if (end && end.getTime() <= now.getTime()) return "ended";
    return inGap ? "open" : "live";
  }

  // state === "published"
  if (!start) return "open"; // reservable; nothing to compare to the clock
  if (end && end.getTime() <= now.getTime()) return "ended";
  if (start.getTime() <= now.getTime()) return inGap ? "open" : "live";
  return "open";
}

// ── 1a · the days ─────────────────────────────────────────────────────────

/** REQ-CHK-016: check-in may stay open until the day's end + 2 h, and no later. */
export const CHECK_IN_CEILING_MS = 2 * 3_600_000;

export type DayPhase = "upcoming" | "live" | "ended";

/** One day against the clock. `[startsAt, endsAt)`, as the database's range is. */
export function dayPhase(day: DayWindow, now: Date = new Date()): DayPhase {
  const start = parseInstant(day.startsAt);
  const end = parseInstant(day.endsAt);
  if (!start || now.getTime() < start.getTime()) return "upcoming";
  if (end && now.getTime() >= end.getTime()) return "ended";
  return "live";
}

/** The days in the order they happen. Sorted by instant, never by a `position` someone typed. */
function chronological<T extends DayWindow>(days: readonly T[] | null | undefined): T[] {
  const at = (d: T) => parseInstant(d.startsAt)?.getTime() ?? 0;
  // The same order as the database's `order by starts_at, id`.
  return [...(days ?? [])].sort((a, b) => at(a) - at(b) || a.id.localeCompare(b.id));
}

/**
 * True in the hours after one day has ended and before the next begins. Walks
 * consecutive pairs, so it is false for one day and for none — by arithmetic,
 * not by a branch.
 */
export function betweenDays(days: readonly DayWindow[] | null | undefined, now: Date = new Date()): boolean {
  const ordered = chronological(days);
  const t = now.getTime();
  for (let i = 0; i + 1 < ordered.length; i++) {
    const ended = parseInstant(ordered[i].endsAt);
    const next = parseInstant(ordered[i + 1].startsAt);
    if (ended && next && t >= ended.getTime() && t < next.getTime()) return true;
  }
  return false;
}

/**
 * The instant a day stops taking attendance: its end + 2 h, ★ CAPPED BY THE
 * NEXT DAY'S START (DEC-151). A 9–12 day and a 13–16 day on one date would
 * otherwise both hold 13:30; capped, the windows of one session's days never
 * overlap and «which day?» has one answer. With no next day there is no cap,
 * so a one-day session's ceiling is its end + 2 h, as it always was.
 * The twin of `public.check_in_ceiling()` (0101). `ordered` must be chronological.
 */
export function checkInCeiling(ordered: readonly DayWindow[], index: number): number | null {
  const end = parseInstant(ordered[index]?.endsAt);
  if (!end) return null;
  const next = parseInstant(ordered[index + 1]?.startsAt);
  const grace = end.getTime() + CHECK_IN_CEILING_MS;
  return next ? Math.min(grace, next.getTime()) : grace;
}

/**
 * The day a check-in made `now` would belong to: the day whose window — its
 * start to its capped ceiling — contains `now`. Null when no day is taking
 * attendance. This is rule 1 of `public.resolve_session_day()` (0100, 0101),
 * and ONLY rule 1: the SQL function's fallbacks exist for inserters that must
 * land somewhere; a screen asking «is check-in open?» must be told no.
 *
 * ★ PRESENTATION, NEVER AUTHORITY — `check_in()` decides, and resolves the day
 * from the CODE, which belongs to exactly one day.
 *
 * Generic on purpose (`sessions`' request, sync 3): a `SessionDay[]` in is a
 * `SessionDay` out, so the day's own `checkInOpen` — required there, optional on
 * `DayWindow` — is read off the very element that was resolved, never re-found.
 */
export function checkInDay<T extends DayWindow>(days: readonly T[] | null | undefined, now: Date = new Date()): T | null {
  const t = now.getTime();
  const ordered = chronological(days);
  const open = ordered.filter((d, i) => {
    const start = parseInstant(d.startsAt);
    const ceiling = checkInCeiling(ordered, i);
    return !!start && ceiling !== null && t >= start.getTime() && t < ceiling;
  });
  // With the cap at most one day qualifies; the later-started is kept as defence.
  return open.at(-1) ?? null;
}

/**
 * All three rules of `public.resolve_session_day()`, for a screen that must
 * open on SOME day — the attendance list, the host view outside any window:
 * the day taking attendance; else the latest day already begun; else, nothing
 * having begun, the first. Null only when there are no days.
 */
export function resolveDay<T extends DayWindow>(days: readonly T[] | null | undefined, now: Date = new Date()): T | null {
  const taking = checkInDay(days, now);
  if (taking) return taking;
  const ordered = chronological(days);
  const begun = ordered.filter((d) => (parseInstant(d.startsAt)?.getTime() ?? Infinity) <= now.getTime());
  return begun.at(-1) ?? ordered[0] ?? null;
}

/** A stored instant, or null when absent or unparseable. Exported for `checkInWindowAllowed()` (DEC-141). */
export function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The scheduled end: `endsAt`, else start + duration, else null. Exported for `checkInWindowAllowed()` (DEC-141). */
export function scheduledEnd(session: PhaseInput, start: Date | null): Date | null {
  const explicit = parseInstant(session.endsAt);
  if (explicit) return explicit;
  if (start && session.durationMinutes) return new Date(start.getTime() + session.durationMinutes * 60_000);
  return null;
}

// ── 2 · seatState ─────────────────────────────────────────────────────────

export interface SeatInput {
  capacity: number | null;
  confirmedCount: number;
  /** `rsvp_deadline_at`. Null means no deadline, which is not the same as passed. */
  rsvpDeadlineAt: string | null;
}

/**
 * Capacity as a member reads it. **Never gates a write** — `reserve_seat()`
 * decides, and it holds the only count that cannot race.
 *
 * `capacity` null means unlimited, so such a session is never `full` and never
 * has a waitlist.
 *
 * ★ `unlimited` is unreachable on any member-facing surface (DEC-105). The
 * `open` phase comes only from `published`, and the same check constraint that
 * pins both ends also makes `capacity` not null from `published` onward. So
 * §5.2's badge row «`open` + `available`/`unlimited`» has a dead half. It stays
 * implemented: a draft on the schedule screen genuinely has no capacity yet,
 * and a total function that throws on a legal row is worse than a branch that
 * never runs.
 */
export function seatState(seats: SeatInput, now: Date = new Date()): SeatState {
  const deadline = parseInstant(seats.rsvpDeadlineAt);
  if (deadline && deadline.getTime() <= now.getTime()) return "closed";
  if (seats.capacity == null) return "unlimited";
  return seats.confirmedCount >= seats.capacity ? "full" : "available";
}

/** «يُغلق التسجيل قريبًا» is a derivation of the deadline, not a state. */
export function closingSoon(rsvpDeadlineAt: string | null, now: Date = new Date(), withinHours = 48): boolean {
  const deadline = parseInstant(rsvpDeadlineAt);
  if (!deadline) return false;
  const ms = deadline.getTime() - now.getTime();
  return ms > 0 && ms <= withinHours * 3_600_000;
}

// ── 3 · viewerRelation ────────────────────────────────────────────────────

export interface ViewerInput {
  isStaff: boolean;
  /** An ACCEPTED presenter of this session (REQ-CHK-011's split starts here). */
  isPresenter: boolean;
  /** The viewer's own `rsvps` row, or null. `cancelled` reads as no seat. */
  rsvpStatus: "confirmed" | "waitlisted" | "cancelled" | "late_cancelled" | null;
  /** The viewer's own `check_ins` row exists. */
  checkedIn: boolean;
}

/**
 * Read from the viewer's own rows, never inferred from the session.
 *
 * ★ Order matters and is not arbitrary. `presenter` outranks a seat because a
 * presenter cannot check in (REQ-CHK-011) and must not be offered attendee
 * affordances; `staff` outranks nothing but `none`, because an admin who also
 * holds a seat is an attendee first — the console is where they act as staff.
 *
 * `attended` / `absent` are only returned once the phase is `ended`; before
 * that, a checked-in member is still `confirmed`, because the session is not
 * over and the outcome is not final.
 */
export function viewerRelation(viewer: ViewerInput, phase: SessionPhase): ViewerRelation {
  if (viewer.isPresenter) return "presenter";

  const holdsSeat = viewer.rsvpStatus === "confirmed";
  const waits = viewer.rsvpStatus === "waitlisted";

  if (phase === "ended") {
    // The outcome is a fact once the session is over. A member who never
    // reserved and never checked in has no outcome to show — they are `none`.
    if (viewer.checkedIn) return "attended";
    if (holdsSeat || waits) return "absent";
    return viewer.isStaff ? "staff" : "none";
  }

  if (holdsSeat) return "confirmed";
  if (waits) return "waitlisted";
  if (viewer.isStaff) return "staff";
  return "none";
}

// ── the direction rule — DEC-090 corollary 2 ─────────────────────────────

/**
 * ★ Whether this phase came from the stored row or from the clock.
 *
 * `16` §5.4's corollary 2 says the derived phase may only ever REMOVE an
 * affordance, never add one — and a scalar "permissiveness" order cannot
 * express that, because permissiveness is not one-dimensional. `ended` REMOVES
 * registration and cancellation, and it GRANTS rating and the certificate. So
 * a session the clock calls `ended` while `complete_session` has not run is
 * safe to hide the register button on and unsafe to offer a rate button on:
 * the member would click and the RPC would refuse. That is §5.4.1 row 5, which
 * this plan introduced into itself.
 *
 * Hence the rule, stated as a rule about affordances rather than about phases:
 *
 *   · an affordance a phase REMOVES  → use `sessionPhase()`, clock included
 *   · an affordance a phase GRANTS   → additionally require `source === "stored"`
 *
 * `canGrantOn()` below is the one predicate every granting affordance calls,
 * so the rule lives in one place instead of in each of the 49 cells.
 */
export type PhaseSource = "stored" | "clock";

export function sessionPhaseSource(session: PhaseInput, now: Date = new Date()): PhaseSource {
  return sessionPhase(session, now) === storedPhase(session.state) ? "stored" : "clock";
}

/** The phase the stored state alone implies, with the clock ignored entirely. */
export function storedPhase(state: SessionState): SessionPhase {
  switch (state) {
    case "cancelled":
      return "cancelled";
    case "completed":
    case "archived":
      return "ended";
    case "approved":
      return "pending_schedule";
    case "published":
      return "open";
    case "in_progress":
      return "live";
    default:
      return "draft";
  }
}

/**
 * The affordances a phase GRANTS — the ones that do not exist in any earlier
 * phase, and therefore the ones the clock may not hand out on its own.
 *
 * Everything not listed here is either always available (share) or is REMOVED
 * by a later phase (rsvp, cancel, calendar, tasks), and those read the derived
 * phase directly.
 */
// ★ DEC-141: `checkIn` is no longer here. Check-in is gated by a stored switch
// and a scheduled window whose ceiling (`ends_at + 2 h`) outlives `ended`, so no
// phase grants it — `checkInWindowAllowed()` in `components/checkin/session-matrix.ts`
// decides it from the schedule, the switch and the viewer's raw facts.
export const GRANTING_AFFORDANCES = {
  live: ["hostConsole"],
  ended: ["rate", "survey", "certificate", "attendanceOutcome"],
} as const satisfies Partial<Record<SessionPhase, readonly string[]>>;

export type GrantingAffordance =
  | (typeof GRANTING_AFFORDANCES)["live"][number]
  | (typeof GRANTING_AFFORDANCES)["ended"][number];

/**
 * True when a granting affordance may be offered: the phase grants it AND the
 * phase is the stored row's, not the clock's.
 *
 * ★ This is the whole of corollary 2, and it is why `checkIn` is listed: the
 * check-in RPC refuses on a session `start_session` has not moved to
 * `in_progress`, so a clock-derived `live` must not render the button either.
 * A member standing in a room typing six characters into a screen that was
 * never going to accept them is the exact failure `16` §5.4.1 row 4 describes.
 */
export function canGrantOn(session: PhaseInput, affordance: GrantingAffordance, now: Date = new Date()): boolean {
  const phase = sessionPhase(session, now);
  const granted = (GRANTING_AFFORDANCES as Record<string, readonly string[]>)[phase];
  if (!granted?.includes(affordance)) return false;
  return sessionPhaseSource(session, now) === "stored";
}

/**
 * The test-facing form of the same rule: no derived phase may grant an
 * affordance the stored phase does not. The unit test runs it over every
 * state x schedule x clock combination, which is the assertion DEC-090 asks
 * for and the one a future refactor will break first.
 */
export function neverGrantsMoreThanStored(session: PhaseInput, now: Date = new Date()): boolean {
  const derived = sessionPhase(session, now);
  const stored = storedPhase(session.state);
  if (derived === stored) return true;
  const all = (p: SessionPhase) => (GRANTING_AFFORDANCES as Record<string, readonly string[]>)[p] ?? [];
  // `canGrantOn` already refuses everything once the source is the clock, so
  // this holds by construction — the test exists to keep it holding.
  return all(derived).every((a) => all(stored).includes(a) || !canGrantOn(session, a as GrantingAffordance, now));
}
