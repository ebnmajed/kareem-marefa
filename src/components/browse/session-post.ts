import { checkInOffer } from "@/components/checkin/session-matrix";
import type { TimelineCandidate, TimelineSession } from "@/components/browse/timeline-session";

// Contract 3 of wave 18 — a SESSION POST on the home feed (`SCR-010`), and the
// member's own next sessions for the game rail's «التالية لك» — `REQ-UIX-055`,
// `DEC-206` §4.45 / §4.57 / §4.59, `DEC-207` §2.
//
// ★ WHY THIS FILE IS NOT `server-only`. The reads are `lib/dal/search.ts`'s;
// what a post IS — its types, its action, its day and its order — is pure, so
// the feed's tests (`content`'s) build fixtures against the same shapes the DAL
// returns, and the home merges three tracks' items with the one comparator.
//
// ★ A FEED NEVER RESERVES (§4.57). Moment 1 plays from the reserve action's own
// result on `SCR-012`, so every action here is a LINK — to the event page to
// reserve or cancel, to `SCR-014` to check in, to `SCR-015` to rate.
//
// ★ EVERY FIGURE IS READ (contract 7). `attendancePoints` is the org's
// `check_in` rule, never a literal «+50»; null means «draw nothing», and a 0 is
// never returned.

export interface SessionPostPresenter {
  memberId: string;
  displayName: string | null;
  /** Same-origin `/api/avatars/…` or null — `avatarHref()`, never Google's URL (DEC-099). */
  avatarUrl: string | null;
  /** Null when the presenter has no company. `teamColor` is `companies.team_color`: "#rrggbb" or null. */
  company: { id: string; name: string; teamColor: string | null } | null;
}

/** Where the post's last row LEADS. Always a link — a feed never reserves (DEC-206 §4.57). */
export type SessionPostAction =
  /** Open, a seat, no hold → the event page. */
  | { kind: "reserve"; href: string }
  /** Open and full, no hold → the event page. */
  | { kind: "waitlist"; href: string }
  /** The viewer holds a seat or a waitlist place and has nothing to do yet → the event page. */
  | { kind: "booked"; hold: "seat" | "waitlist"; waitlistPosition: number | null; href: string }
  /** The check-in window is open to this viewer (`checkInOffer()`) → `SCR-014`. `booked`: they hold a seat. */
  | { kind: "checkIn"; href: string; booked: boolean }
  /** Checked in on the current day; nothing to do until the session ends. */
  | { kind: "attended"; href: string }
  /** `getRatingEligibility()` says yes and the viewer has not rated → `SCR-015`. */
  | { kind: "rate"; href: string; closesAt: string }
  /** Cancelled, registration closed, ended with nothing owed, or the viewer presents it. */
  | { kind: "none" };

export interface SessionPost extends Omit<TimelineSession, "presenters"> {
  presenters: SessionPostPresenter[];
  /** `/app/sessions/{id}` — locale-less, as the house `Link` takes it. */
  href: string;
  /** The session's abstract, trimmed — the desktop post's copy. Null when empty. */
  excerpt: string | null;
  /**
   * The org-calendar day the post stands under, "YYYY-MM-DD": today's for a live session, the last
   * day's for an ended one, the first day's otherwise. Null when the session has no time.
   */
  day: string | null;
  /** ★ The ordering input: a CONFIRMED seat on an open or live session. A waitlist place is not a commitment. */
  committed: boolean;
  /**
   * `scoring_rules.check_in.points` for this org — READ, never a literal (§4.45, contract 7).
   * Null = draw nothing: the rule is off or not positive, the session is ended or cancelled, or the
   * viewer presents it (REQ-CHK-011). A 0 is never returned.
   */
  attendancePoints: number | null;
  /** Visible comments, replies included (`deleted_at is null`), under `comments`' org-read policy. */
  commentCount: number;
  /** `reactions` of kind `like` on the SESSION (§4.51), under its org-read policy. */
  likeCount: number;
  likedByMe: boolean;
  /** How many attended — the lead's count function (§4.54). Null until it is published, and never who. */
  attendedCount: number | null;
  action: SessionPostAction;
}

/** One of the member's own coming sessions, for «التالية لك». */
export interface NextForMeItem {
  id: string;
  title: string;
  href: string;
  startsAt: string | null;
  timeZone: string;
  phase: "open" | "live";
  hold: "seat" | "waitlist";
  /** `rsvps.waitlist_position`, for «قائمة الانتظار 3». */
  waitlistPosition: number | null;
  posterUrl: string | null;
  /** The lead presenter's company colour, for the placeholder thumb. */
  teamColor: string | null;
}

/** "YYYY-MM-DD" of an instant on the org's wall calendar. */
export function orgDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** The day a post stands under — see `SessionPost.day`. */
export function postDay(post: Pick<TimelineSession, "phase" | "startsAt" | "endsAt">, now: Date, timeZone: string): string | null {
  if (post.phase === "live") return orgDay(now, timeZone);
  const at = post.phase === "ended" ? (post.endsAt ?? post.startsAt) : post.startsAt;
  return at ? orgDay(new Date(at), timeZone) : null;
}

/**
 * The feed's order (`M10a.md` §5, `DEC-207` §2): the days read today · the coming days ascending ·
 * the past days descending; within a day, committed first, then by start. Without `today` the days
 * simply ascend. Pure — `content` sorts the merged feed with it.
 */
export function compareSessionPosts(a: Pick<SessionPost, "day" | "committed" | "startsAt">, b: Pick<SessionPost, "day" | "committed" | "startsAt">, today?: string): number {
  const rank = (day: string | null): [number, string] => {
    if (day === null) return [3, ""];
    if (today === undefined) return [1, day];
    if (day === today) return [0, day];
    return day > today ? [1, day] : [2, day];
  };
  const [ra, da] = rank(a.day);
  const [rb, db] = rank(b.day);
  if (ra !== rb) return ra - rb;
  if (da !== db) return ra === 2 ? db.localeCompare(da) : da.localeCompare(db);
  if (a.committed !== b.committed) return a.committed ? -1 : 1;
  return (a.startsAt ?? "9999").localeCompare(b.startsAt ?? "9999");
}

/** What the viewer is to the session, as `postAction()` needs it. */
export interface PostViewer {
  isStaff: boolean;
  isPresenter: boolean;
  /** The viewer's hold — `rsvps.status` when confirmed or waitlisted. */
  mine: "confirmed" | "waitlisted" | null;
  waitlistPosition: number | null;
  /** The days the viewer holds an ACTIVE check-in on. */
  checkedInDayIds: readonly string[];
  /** Any active check-in on the session. */
  attended: boolean;
  /** From `getRatingEligibility()`, read only for an ended session the viewer attended. */
  rating: { eligible: boolean; rated: boolean; closesAt: string | null } | null;
}

/**
 * The post's action — the affordance matrix's inputs, read, never re-derived: the check-in window is
 * `checkInOffer()` (the event page's own link), the seat is `seatState()` via the card, the rating is
 * `getRatingEligibility()`.
 */
export function postAction(
  c: Pick<TimelineCandidate, "id" | "state" | "phase" | "startsAt" | "endsAt" | "durationMinutes" | "days" | "allowWalkIns" | "checkInOpen">,
  seat: TimelineSession["seat"],
  viewer: PostViewer,
  now: Date,
): SessionPostAction {
  const href = `/app/sessions/${c.id}`;
  if (c.phase === "cancelled" || viewer.isPresenter) return { kind: "none" };

  if (c.phase === "open" || c.phase === "live") {
    const offer = checkInOffer(
      { state: c.state, startsAt: c.startsAt, endsAt: c.endsAt, durationMinutes: c.durationMinutes, days: c.days },
      { isStaff: viewer.isStaff, isPresenter: false, rsvpStatus: viewer.mine, checkedIn: viewer.attended,
        // Per day at more than one day (DEC-195 §2.5); at one, any active check-in IS the day's.
        checkedInDayIds: c.days.length > 1 ? viewer.checkedInDayIds : undefined },
      c.allowWalkIns,
      c.checkInOpen,
      now,
    );
    if (offer === "offer") return { kind: "checkIn", href: `${href}/check-in`, booked: viewer.mine === "confirmed" };
    if (offer === "recorded") return { kind: "attended", href };
    if (viewer.mine) return { kind: "booked", hold: viewer.mine === "confirmed" ? "seat" : "waitlist", waitlistPosition: viewer.waitlistPosition, href };
    if (c.phase === "open" && (seat === "available" || seat === "unlimited")) return { kind: "reserve", href };
    if (c.phase === "open" && seat === "full") return { kind: "waitlist", href };
    return { kind: "none" };
  }

  if (c.phase === "ended" && viewer.rating?.eligible && !viewer.rating.rated && viewer.rating.closesAt) {
    return { kind: "rate", href: `${href}/rate`, closesAt: viewer.rating.closesAt };
  }
  return { kind: "none" };
}

/** The rule's figure on a post: an open or live session the viewer does not present, and a positive rule. */
export function postPoints(rulePoints: number | null, phase: TimelineSession["phase"], isPresenter: boolean): number | null {
  if (rulePoints === null || rulePoints <= 0 || isPresenter) return null;
  return phase === "open" || phase === "live" ? rulePoints : null;
}

/** The abstract as a post's excerpt: trimmed, or null. The post clamps nothing — it wraps. */
export function postExcerpt(abstract: string | null | undefined): string | null {
  const trimmed = abstract?.trim();
  return trimmed ? trimmed : null;
}
