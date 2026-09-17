import { checkInWindowAllowed } from "@/components/checkin/session-matrix";
import type { SessionLanguage, SessionLevel, SessionState } from "@/lib/dal/sessions";
import { closingSoon, seatState, sessionPhase, type DayWindow, type SeatState, type SessionPhase } from "@/lib/session-status";

// One session card's DTO, and the two pure steps that build it — `16` §6.4,
// REQ-UIX-003, REQ-UIX-021, REQ-DSC-006.
//
// ★ WHY THIS IS NOT INSIDE `lib/dal/search.ts`. Two readers build cards now:
// the timeline (`getTimeline`) and the member's saved sessions
// (`getTimelineSessionsByIds`, behind `/app/me/bookmarks`). The reads differ —
// one is the whole visible set narrowed by filters, the other an explicit list
// of ids — but a card must be the SAME card on both pages: the same phase, the
// same seat line, the same check-in predicate. So the row → card derivation
// lives here once, pure, and both readers call it. No query, no cookie, no
// `server-only`: it is handed rows.

/** One session as a timeline card draws it (`16` §6.4). Derived state comes from `session-status.ts`, never re-derived by the card. */
export interface TimelineSession {
  id: string;
  title: string;
  state: SessionState;
  phase: SessionPhase;
  /** `seatState()` — meaningful for an `open` session only. */
  seat: SeatState;
  closingSoon: boolean;
  startsAt: string | null;
  endsAt: string | null;
  /**
   * ★ The session's days (`REQ-SES-015`). One entry for a one-day session, so
   * `days.length` is a count and never a mode: the card says a range when there
   * is more than one row to span, the way any list decides whether to show a
   * second line.
   */
  days: readonly DayWindow[];
  /** The session's own zone — the card prints the time on the room's wall, as the event page does. */
  timeZone: string;
  categoryId: string | null;
  categoryName: string | null;
  venueName: string | null;
  level: SessionLevel;
  language: SessionLanguage;
  capacity: number | null;
  confirmedCount: number;
  waitlistCount: number;
  presenters: { memberId: string; displayName: string | null }[];
  tags: { label: string; normalised: string }[];
  /** The viewer's own seat on it. */
  mine: "confirmed" | "waitlisted" | null;
  /** The viewer checked in — read only for the ended view. */
  attended: boolean;
  bookmarked: boolean;
  /** A signed poster URL when one has rendered; the card draws the title placeholder otherwise. */
  posterUrl: string | null;
  /** «تسجيل الحضور» on the pinned card — `checkInWindowAllowed()`, the predicate behind the event page's link (contract 2). */
  canCheckIn: boolean;
}

/** The sessions a card can show. Drafts and `approved` never appear, even to staff: the console lists those. */
export const TIMELINE_STATES: SessionState[] = ["published", "in_progress", "completed", "archived", "cancelled"];

/** The `sessions` select every card reader uses, so the row shape below is one shape. */
// ★ `session_days(…)` IS EMBEDDED, and that is the one place in the product a
// reader gets days without `listSessionDays()` (DEC-151 ruling 3). A list over
// many sessions cannot afford one call per card, and it needs the day windows
// for two things the session row cannot answer: contract 9's phase — between
// two days a session is `open`, and a card reading the stored window alone says
// «جارية» on the Thursday of a Wednesday-and-Friday workshop — and whether to
// say a range at all. A SINGLE session still goes through `listSessionDays()`.
export const TIMELINE_SESSION_COLUMNS =
  "id, title, state, level, language, category_id, venue_id, starts_at, ends_at, duration_minutes, time_zone, capacity, rsvp_deadline_at, allow_walk_ins, check_in_open, custom_venue_name, categories(name), venues(name), session_days(id, position, starts_at, ends_at, check_in_open)";

export type PresenterEntry = { memberId: string; displayName: string | null; companyId: string | null };
export type TagEntry = { label: string; normalised: string };

/** A card before its seats, poster and attendance are known — what the timeline's filters match against. */
export interface TimelineCandidate extends Omit<TimelineSession, "confirmedCount" | "waitlistCount" | "posterUrl" | "canCheckIn" | "attended" | "seat" | "closingSoon"> {
  venueId: string | null;
  presenterCompanyIds: string[];
  rsvpDeadlineAt: string | null;
  allowWalkIns: boolean;
  /** `sessions.check_in_open` — the room's switch (REQ-CHK-015). */
  checkInOpen: boolean;
  durationMinutes: number | null;
}

/** Accepted presenters per session, with the member-tier name and company (REQ-PRF-004). */
export function groupPresenters(
  rows: { session_id: string; member_id: string }[],
  profiles: Map<string, { displayName: string | null; companyId: string | null }>,
): Map<string, PresenterEntry[]> {
  const bySession = new Map<string, PresenterEntry[]>();
  for (const p of rows) {
    const profile = profiles.get(p.member_id);
    bySession.set(p.session_id, [...(bySession.get(p.session_id) ?? []), { memberId: p.member_id, displayName: profile?.displayName ?? null, companyId: profile?.companyId ?? null }]);
  }
  return bySession;
}

/** Tags per session; a join row whose tag is not visible is skipped. */
export function groupTags(rows: { session_id: string; tags: TagEntry | null }[]): Map<string, TagEntry[]> {
  const bySession = new Map<string, TagEntry[]>();
  for (const row of rows) {
    if (!row.tags) continue;
    bySession.set(row.session_id, [...(bySession.get(row.session_id) ?? []), row.tags]);
  }
  return bySession;
}

export interface CandidateContext {
  presentersBySession: Map<string, PresenterEntry[]>;
  tagsBySession: Map<string, TagEntry[]>;
  mine: Map<string, "confirmed" | "waitlisted">;
  bookmarked: Set<string>;
  orgTimeZone: string;
  now: Date;
}

/** A `TIMELINE_SESSION_COLUMNS` row → a candidate. Phase from `sessionPhase()`, clock included (REQ-UIX-003). */
export function toTimelineCandidate(row: Record<string, unknown>, ctx: CandidateContext): TimelineCandidate {
  const id = row.id as string;
  const state = row.state as SessionState;
  const startsAt = (row.starts_at as string | null) ?? null;
  const endsAt = (row.ends_at as string | null) ?? null;
  const durationMinutes = (row.duration_minutes as number | null) ?? null;
  const presenters = ctx.presentersBySession.get(id) ?? [];
  const days = ((row.session_days as Record<string, unknown>[] | null) ?? [])
    .map((d) => ({
      id: d.id as string,
      position: d.position as number,
      startsAt: d.starts_at as string,
      endsAt: d.ends_at as string,
      checkInOpen: d.check_in_open === true,
    }))
    .sort((a, b) => a.position - b.position);
  return {
    id,
    title: row.title as string,
    state,
    // Contract 9: the days are PASSED, never re-derived. At one day every
    // function returns exactly what it returned before they existed.
    phase: sessionPhase({ state, startsAt, endsAt, durationMinutes, days }, ctx.now),
    days,
    startsAt,
    endsAt,
    durationMinutes,
    timeZone: (row.time_zone as string | null) ?? ctx.orgTimeZone,
    categoryId: (row.category_id as string | null) ?? null,
    categoryName: (row.categories as { name: string } | null)?.name ?? null,
    venueId: (row.venue_id as string | null) ?? null,
    venueName: (row.venues as { name: string } | null)?.name ?? (row.custom_venue_name as string | null) ?? null,
    level: row.level as SessionLevel,
    language: row.language as SessionLanguage,
    capacity: (row.capacity as number | null) ?? null,
    rsvpDeadlineAt: (row.rsvp_deadline_at as string | null) ?? null,
    allowWalkIns: Boolean(row.allow_walk_ins),
    checkInOpen: row.check_in_open === true,
    presenters: presenters.map(({ memberId, displayName }) => ({ memberId, displayName })),
    presenterCompanyIds: presenters.map((p) => p.companyId).filter((v): v is string => v !== null),
    tags: [...(ctx.tagsBySession.get(id) ?? [])].sort((a, b) => a.label.localeCompare(b.label, "ar")),
    mine: ctx.mine.get(id) ?? null,
    bookmarked: ctx.bookmarked.has(id),
  };
}

export interface CardExtras {
  confirmedCount: number;
  waitlistCount: number;
  posterUrl: string | null;
  attended: boolean;
}

/** A candidate plus what is read only for the cards on screen → the card's DTO. */
export function finishTimelineSession(c: TimelineCandidate, extras: CardExtras, now: Date): TimelineSession {
  const { rsvpDeadlineAt, allowWalkIns, checkInOpen, durationMinutes } = c;
  return {
    id: c.id,
    title: c.title,
    state: c.state,
    phase: c.phase,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    days: c.days,
    timeZone: c.timeZone,
    categoryId: c.categoryId,
    categoryName: c.categoryName,
    venueName: c.venueName,
    level: c.level,
    language: c.language,
    capacity: c.capacity,
    presenters: c.presenters,
    tags: c.tags,
    mine: c.mine,
    bookmarked: c.bookmarked,
    seat: seatState({ capacity: c.capacity, confirmedCount: extras.confirmedCount, rsvpDeadlineAt }, now),
    closingSoon: c.phase === "open" && closingSoon(rsvpDeadlineAt, now),
    confirmedCount: extras.confirmedCount,
    waitlistCount: extras.waitlistCount,
    attended: extras.attended,
    posterUrl: extras.posterUrl,
    // Contract 2, the same predicate the event page's link uses: the three
    // states, the window to `ends_at + 2 h`, the room's switch. Only a confirmed
    // seat is pinned, so the viewer's raw facts are that seat.
    canCheckIn:
      c.mine === "confirmed" &&
      checkInWindowAllowed(
        { state: c.state, startsAt: c.startsAt, endsAt: c.endsAt, durationMinutes },
        { isStaff: false, isPresenter: false, rsvpStatus: "confirmed", checkedIn: extras.attended },
        allowWalkIns,
        checkInOpen,
        now,
      ),
  };
}
