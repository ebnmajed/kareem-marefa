import { compareSessionPosts, orgDay, type SessionPost } from "@/components/browse/session-post";
import type { AchievementItem } from "@/lib/dal/recognition";

// The home's feed — four sources merged by date (REQ-UIX-055, STORY-UIX-044, DEC-207 §2). Pure, so its unit
// test drives it with a fixed `today`.
//
// ★ EACH ITEM STANDS UNDER ITS OWN DAY (DEC-207 §2, content's §6.6): a session post under the day it happens
// (`SessionPost.day`, sessions'), a recap under the day it ended, an achievement under the day it was awarded,
// an announcement under the day it was published — all on the org's calendar.
// ★ THE DAYS READ today · the coming days ascending · the past days descending (§6.7): what is happening now,
// then what is coming, then what happened.
// ★ INSIDE A DAY: session posts first — committed first, then by start, `sessions'` own comparator — then
// recaps, then announcements, then achievements, the newest first; the last tiebreak is the key, so rows one
// transaction wrote together never swap places between two renders.

export interface FeedAnnouncement {
  id: string;
  body: string;
  publishedAt: string;
}

export type FeedEntry =
  | { kind: "session"; key: string; day: string; at: string; post: SessionPost }
  | { kind: "recap"; key: string; day: string; at: string; post: SessionPost }
  | { kind: "achievement"; key: string; day: string; at: string; item: AchievementItem }
  | { kind: "announcement"; key: string; day: string; at: string; announcement: FeedAnnouncement };

export interface FeedGroup {
  /** "YYYY-MM-DD" on the org's calendar. */
  day: string;
  entries: FeedEntry[];
}

export interface FeedSources {
  posts: readonly SessionPost[];
  achievements: readonly AchievementItem[];
  announcements: readonly FeedAnnouncement[];
}

/** A session that has ended is a recap; every other post — a cancelled one included — is a post. */
export function toEntries(sources: FeedSources, timeZone: string): FeedEntry[] {
  const entries: FeedEntry[] = [];
  for (const post of sources.posts) {
    if (post.day === null) continue;
    const at = post.phase === "ended" ? (post.endsAt ?? post.startsAt ?? "") : (post.startsAt ?? "");
    entries.push(post.phase === "ended" ? { kind: "recap", key: `recap:${post.id}`, day: post.day, at, post } : { kind: "session", key: `session:${post.id}`, day: post.day, at, post });
  }
  for (const item of sources.achievements) {
    entries.push({ kind: "achievement", key: `${item.kind}:${item.id}`, day: orgDay(new Date(item.awardedAt), timeZone), at: item.awardedAt, item });
  }
  for (const a of sources.announcements) {
    entries.push({ kind: "announcement", key: `announcement:${a.id}`, day: orgDay(new Date(a.publishedAt), timeZone), at: a.publishedAt, announcement: a });
  }
  return entries;
}

const KIND_ORDER: Record<FeedEntry["kind"], number> = { session: 0, recap: 1, announcement: 2, achievement: 3 };

function compareWithinDay(a: FeedEntry, b: FeedEntry): number {
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (a.kind === "session" && b.kind === "session") {
    const bySessions = compareSessionPosts(a.post, b.post);
    if (bySessions !== 0) return bySessions;
  } else if (a.at !== b.at) {
    return b.at.localeCompare(a.at);
  }
  return a.key.localeCompare(b.key);
}

/** today first, then the coming days ascending, then the past days descending. */
export function compareDays(a: string, b: string, today: string): number {
  const rank = (d: string) => (d === today ? 0 : d > today ? 1 : 2);
  const [ra, rb] = [rank(a), rank(b)];
  if (ra !== rb) return ra - rb;
  if (a === b) return 0;
  return ra === 2 ? b.localeCompare(a) : a.localeCompare(b);
}

export function groupFeed(entries: readonly FeedEntry[], today: string): FeedGroup[] {
  const byDay = new Map<string, FeedEntry[]>();
  for (const entry of entries) byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry]);
  return [...byDay.keys()]
    .sort((a, b) => compareDays(a, b, today))
    .map((day) => ({ day, entries: [...byDay.get(day)!].sort(compareWithinDay) }));
}
