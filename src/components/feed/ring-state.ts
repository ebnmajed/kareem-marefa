import type { SessionPost } from "@/components/browse/session-post";
import { orgDay } from "@/components/browse/session-post";
import { parseInstant, type DayWindow } from "@/lib/session-status";

// The home's ring row — which sessions have a ring, in which state, in which order (REQ-UIX-055, DEC-206 §1.5,
// DEC-207 §2, `docs/design/05-stories.md` «Window, ordering»). Pure: no query, no clock of its own.
//
// ★ THE WINDOW is 24 hours before a day's start to 24 hours after its end — per day, so a workshop's second
// evening has its own window. Outside it there is no ring. A cancelled session never has one.
// ★ `seen` is never produced: what a member has seen is `story_views`, wave 19's. So a ring is `live`,
// `upcoming` or `recap`, and the row holds fewer rings than the artboard draws (§6.5 of content's plan).
// ★ «Live» is `sessionPhase()`'s, clock included (REQ-UIX-003) — the post's own `phase` — never the stored
// `in_progress` that `05-stories.md` names.

export type FeedRingState = "live" | "upcoming" | "recap";

export interface FeedRing {
  sessionId: string;
  title: string;
  state: FeedRingState;
  /** The instant the caption names: now for a live ring, the day's start or the day's end otherwise. */
  at: string;
  /** "YYYY-MM-DD" of `at` on the org's calendar, for the caption («اليوم», «أمس», a weekday). */
  day: string;
  /** The lead presenter's company — the ring's letter, and an upcoming ring's colour. */
  companyName: string | null;
  teamColor: string | null;
}

const DAY_MS = 86_400_000;

type RingInput = Pick<SessionPost, "id" | "title" | "phase" | "startsAt" | "endsAt" | "days" | "presenters">;

function windows(post: RingInput): { start: number; end: number }[] {
  const days: readonly DayWindow[] = post.days.length > 0 ? post.days : [];
  const pairs = days.length > 0 ? days.map((d) => [d.startsAt, d.endsAt] as const) : [[post.startsAt, post.endsAt] as const];
  return pairs
    .map(([s, e]) => ({ start: parseInstant(s)?.getTime() ?? NaN, end: parseInstant(e ?? s)?.getTime() ?? NaN }))
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end));
}

/** The ring a session has at `now`, or null. */
export function ringFor(post: RingInput, now: Date, timeZone: string): FeedRing | null {
  if (post.phase === "cancelled" || post.phase === "draft" || post.phase === "pending_schedule") return null;
  const t = now.getTime();
  const company = post.presenters[0]?.company ?? null;
  const ring = (state: FeedRingState, atMs: number): FeedRing => ({
    sessionId: post.id,
    title: post.title,
    state,
    at: new Date(atMs).toISOString(),
    day: orgDay(new Date(atMs), timeZone),
    companyName: company?.name ?? null,
    teamColor: company?.teamColor ?? null,
  });

  if (post.phase === "live") return ring("live", t);
  const ws = windows(post);
  const coming = ws.filter((w) => w.start - DAY_MS <= t && t < w.start).sort((a, b) => a.start - b.start)[0];
  if (coming) return ring("upcoming", coming.start);
  const past = ws.filter((w) => w.end < t && t <= w.end + DAY_MS).sort((a, b) => b.end - a.end)[0];
  if (past) return ring("recap", past.end);
  return null;
}

const ORDER: Record<FeedRingState, number> = { live: 0, upcoming: 1, recap: 2 };

/** Every ring, in the row's order: live · upcoming by start, soonest first · recap by end, latest first. */
export function feedRings(posts: readonly RingInput[], now: Date, timeZone: string): FeedRing[] {
  return posts
    .map((p) => ringFor(p, now, timeZone))
    .filter((r): r is FeedRing => r !== null)
    .sort((a, b) => {
      if (a.state !== b.state) return ORDER[a.state] - ORDER[b.state];
      if (a.at !== b.at) return a.state === "recap" ? b.at.localeCompare(a.at) : a.at.localeCompare(b.at);
      return a.sessionId.localeCompare(b.sessionId);
    });
}

/** One letter for the ring — the company's, else the title's, with «ال» set aside as `card`'s placeholder does. */
export function ringGlyph(companyName: string | null, title: string): string {
  const source = (companyName ?? title).trim();
  const first = source.split(/\s+/)[0] ?? "";
  const word = first.startsWith("ال") && first.length > 2 ? first.slice(2) : first;
  return word.charAt(0) || "؟";
}
