// The facts a designed mail draws, formatted — `REQ-NTF-018`, `DEC-289`.
//
// `public.email_facts()` (`0224`) resolves the RAW facts in SQL — the session's start, its venue, the host company,
// the first presenter, the seats, the scoring rule's amount, the comment and its counts, the certificate if one was
// issued. This turns them into the strings the design prints, in the ORG's zone and in Western digits (`DEC-124`).
//
// ★ ONE FORMATTER, two callers: the worker before it renders, and the tests that pin what it prints. Pure — no
// clock unless one is passed, no `process`, no `Buffer` — like the rest of this package.

import { formatNumber } from "./primitives.js";

/** What `email_facts()` returns. Every field is optional: a fact that does not exist is absent. */
export interface RawFacts {
  starts_at?: string | null;
  time_zone?: string | null;
  event_type?: string | null;
  venue?: string | null;
  directions_url?: string | null;
  company?: string | null;
  presenter?: string | null;
  capacity?: number | null;
  going_count?: number | null;
  points_on_attend?: number | null;
  poster_wide?: boolean | null;
  member_name?: string | null;
  actor?: string | null;
  comment?: string | null;
  comment_at?: string | null;
  likes?: number | null;
  comments?: number | null;
  serial?: string | null;
  verification_code?: string | null;
  kind?: string | null;
}

const EVENT_TYPE: Readonly<Record<string, string>> = { talk: "محاضرة", workshop: "ورشة", panel: "ندوة", meetup: "لقاء" };

/** «سارة القحطاني» → «سق»: the first letter of the first two words. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => Array.from(w.replace(/^ال(?=\S{2,})/, ""))[0] ?? "")
    .join("");
}

function parts(at: Date, timeZone: string) {
  const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ar-u-nu-latn", { timeZone, ...options }).format(at);
  return {
    day: fmt({ day: "numeric" }),
    month: fmt({ month: "long" }),
    weekday: fmt({ weekday: "long" }),
    time: fmt({ hour: "numeric", minute: "2-digit" }),
  };
}

/** «قبل 5 دقائق», «قبل ساعتين», «أمس» — how long ago, in the words a person uses. */
export function ago(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return minutes === 1 ? "قبل دقيقة" : minutes === 2 ? "قبل دقيقتين" : minutes <= 10 ? `قبل ${formatNumber(minutes)} دقائق` : `قبل ${formatNumber(minutes)} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "قبل ساعة" : hours === 2 ? "قبل ساعتين" : hours <= 10 ? `قبل ${formatNumber(hours)} ساعات` : `قبل ${formatNumber(hours)} ساعة`;
  const days = Math.round(hours / 24);
  return days === 1 ? "أمس" : days === 2 ? "قبل يومين" : days <= 10 ? `قبل ${formatNumber(days)} أيام` : `قبل ${formatNumber(days)} يومًا`;
}

/** A short, stable reference for a reservation — `KM-` and the first six of its id, upper case. Not a secret. */
export function ticketRef(rsvpId: string): string {
  return `KM-${rsvpId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/**
 * The strings a designed mail prints, from the raw facts and the message's own payload. A payload value wins: the
 * sender knows better (a reminder carries THE DAY's start and room, a session's first day is in the facts).
 */
export function formatFacts(raw: RawFacts, payload: Record<string, unknown>, orgTimeZone: string, now: Date = new Date()): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const zone = raw.time_zone || orgTimeZone;
  const startsAt = typeof payload.startsAt === "string" ? payload.startsAt : raw.starts_at;
  if (startsAt) {
    const at = new Date(startsAt);
    if (!Number.isNaN(at.getTime())) {
      const p = parts(at, zone);
      out.date_day = p.day;
      out.date_month = p.month;
      out.weekday = p.weekday;
      out.time = p.time;
    }
  }
  if (raw.event_type && EVENT_TYPE[raw.event_type]) out.type = EVENT_TYPE[raw.event_type];
  if (raw.venue && typeof payload.venue !== "string") out.venue = raw.venue;
  if (raw.directions_url && /^https:\/\//.test(raw.directions_url)) out.directions_url = raw.directions_url;
  if (raw.company) out.company = raw.company;
  if (raw.presenter) {
    out.presenter = raw.presenter;
    out.presenter_initials = initials(raw.presenter);
  }
  if (typeof raw.capacity === "number" && raw.capacity > 0 && typeof raw.going_count === "number") {
    const left = Math.max(0, raw.capacity - raw.going_count);
    out.seats_left = left;
    out.seats_taken_pct = Math.round((Math.min(raw.going_count, raw.capacity) / raw.capacity) * 100);
  }
  if (typeof raw.going_count === "number") out.going_count = raw.going_count;
  // A figure the rule pays — read, never a literal (`DEC-289`); «+20» is drawn left-to-right. None, or zero: absent.
  if (typeof raw.points_on_attend === "number" && raw.points_on_attend > 0) out.points_on_attend = `+${formatNumber(raw.points_on_attend)}`;
  if (raw.poster_wide === true) out.poster_wide = true;
  if (raw.member_name) {
    out.full_name = raw.member_name;
    out.first_name = raw.member_name.trim().split(/\s+/)[0] ?? raw.member_name;
    out.initials = initials(raw.member_name);
  }
  if (raw.actor) {
    out.actor = raw.actor;
    out.actor_initials = initials(raw.actor);
  }
  if (raw.comment) {
    out.comment = raw.comment;
    const chars = Array.from(raw.comment.replace(/\s+/g, " ").trim());
    out.comment_short = chars.length > 60 ? `${chars.slice(0, 59).join("")}…` : chars.join("");
  }
  if (raw.comment_at) {
    const at = new Date(raw.comment_at);
    if (!Number.isNaN(at.getTime())) out.ago = ago(at, now);
  }
  if (typeof raw.likes === "number") out.likes = raw.likes;
  if (typeof raw.comments === "number") out.comments = raw.comments;
  if (raw.serial) out.serial = raw.serial;
  if (raw.verification_code) out.verification_code = raw.verification_code;
  if (raw.kind) out.kind = raw.kind;
  if (typeof payload.rsvp_id === "string" && payload.rsvp_id !== "") out.ticket_ref = ticketRef(payload.rsvp_id);
  Object.assign(out, weekFacts(payload));
  return out;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** «27 سبتمبر – 3 أكتوبر», or «12 – 18 أكتوبر» inside one month — a calendar span, read in UTC because it is a date. */
export function weekLabel(start: string, end: string): string {
  const fmt = (d: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ar-u-nu-latn", { timeZone: "UTC", ...options }).format(new Date(`${d}T00:00:00Z`));
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return sameMonth
    ? `${fmt(start, { day: "numeric" })} – ${fmt(end, { day: "numeric" })} ${fmt(end, { month: "long" })}`
    : `${fmt(start, { day: "numeric", month: "long" })} – ${fmt(end, { day: "numeric", month: "long" })}`;
}

/** The weekly close's words (`REQ-LDR-009`): the span, «↑ 2» / «↓ 1» (nothing when new or unchanged), and each
 *  board row's initials. A payload from `send_weekly_leaderboard_digests()` (`0224`) carries the figures. */
function weekFacts(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof payload.week_start === "string" && typeof payload.week_end === "string" && DATE.test(payload.week_start) && DATE.test(payload.week_end)) {
    out.week_label = weekLabel(payload.week_start, payload.week_end);
  }
  if (typeof payload.rank_delta === "number" && payload.rank_delta !== 0) {
    out.rank_change = `${payload.rank_delta > 0 ? "↑" : "↓"} ${formatNumber(Math.abs(payload.rank_delta))}`;
  }
  const withInitials = (entry: unknown) =>
    entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string"
      ? { ...(entry as Record<string, unknown>), initials: initials((entry as { name: string }).name) }
      : entry;
  if (Array.isArray(payload.top)) out.top = payload.top.map(withInitials);
  if (payload.me && typeof payload.me === "object") out.me = withInitials(payload.me);
  return out;
}
