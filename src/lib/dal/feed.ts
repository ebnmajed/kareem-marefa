import "server-only";
import { cache } from "react";
import { orgDay } from "@/components/browse/session-post";
import { groupFeed, toEntries, type FeedAnnouncement, type FeedGroup } from "@/components/feed/feed-merge";
import { getRecapPhotos, type RecapPhotos } from "@/lib/dal/photos";
import { getAchievementItems, type AchievementItem } from "@/lib/dal/recognition";
import { getSessionPosts } from "@/lib/dal/search";
import { sessionClient } from "@/lib/dal/session";
import { getShellData, type ShellAttention } from "@/lib/dal/shell";

// The home's one read model — SCR-010, REQ-UIX-055, REQ-UIX-056, STORY-UIX-044, DEC-206, DEC-207.
//
// Four sources, merged by date (`components/feed/feed-merge.ts`, pure):
//   · the session posts — `sessions'` `getSessionPosts()` (contract 3). This module never reads `sessions`;
//   · the recaps — the ended posts among them, with their photographs (`getRecapPhotos()`) and whether they
//     have material a viewer may open (one `materials` read through `materials_read`);
//   · colleagues' badges and streak months — `scoring`'s `getAchievementItems()` (contract 4), where the
//     opt-out is enforced;
//   · the org's announcements — `feed_announcements` (0164), read through RLS with the caller's client.
// And beside them (the rings are `sessions'` story feed since wave 26, DEC-251 §4): the staff strip's counts (`getShellData()`, the
// lead's — null for a member, never a 404). ★ wave 27 (DEC-255 §4): «whether the member has a company» left this
// read with the gate it fed — a company follows the email domain (REQ-PRF-012) and its absence refuses nothing.
//
// ★ ONE SOURCE FAILING DOES NOT TAKE THE HOME WITH IT. The session posts are the page: if they fail, the
// route's error boundary answers. The others are items among many — a failed read drops that source, says so
// in the server log, and the feed renders.
//
// ★ An admin reads every announcement of the org (`feed_announcements_admin_read`), drafts and expired ones
// included, so this applies the member policy's own predicate itself: an admin's home shows what a member's
// shows.

/** How far back the feed looks for a colleague's achievement, and how many it shows. */
const ACHIEVEMENT_DAYS = 7;
const ACHIEVEMENT_LIMIT = 10;
const ANNOUNCEMENT_LIMIT = 5;
const DAY_MS = 86_400_000;

export interface RecapExtra extends RecapPhotos {
  /** A material the viewer may open exists — the recap's «المواد» is drawn only then. */
  hasMaterials: boolean;
}

export interface Feed {
  viewer: { memberId: string; isStaff: boolean };
  groups: FeedGroup[];
  /** Per ended session in the feed. */
  recaps: Record<string, RecapExtra>;
  /** Staff only; null for a member. */
  attention: ShellAttention | null;
  timeZone: string;
  /** "YYYY-MM-DD" on the org's calendar. */
  today: string;
  /** The instant the feed was read — every relative time is measured from it. */
  now: string;
}

export type { FeedAnnouncement, FeedGroup };

async function settled<T>(source: string, read: Promise<T>, fallback: T): Promise<T> {
  try {
    return await read;
  } catch (error) {
    console.error(`feed: ${source} failed; the home renders without it`, error);
    return fallback;
  }
}

export const getFeed = cache(async (locale: string): Promise<Feed> => {
  const { session, supabase } = await sessionClient(locale);
  const now = new Date();
  const nowIso = now.toISOString();
  const isStaff = session.role === "admin" || session.role === "moderator";

  const announcementsRead = async (): Promise<FeedAnnouncement[]> => {
    const { data, error } = await supabase
      .from("feed_announcements")
      .select("id, body, published_at")
      .eq("org_id", session.orgId)
      .lte("published_at", nowIso)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(ANNOUNCEMENT_LIMIT);
    if (error) throw new Error(`feed_announcements: ${error.message}`);
    return ((data ?? []) as { id: string; body: string; published_at: string }[]).map((r) => ({ id: r.id, body: r.body, publishedAt: r.published_at }));
  };

  const [postsData, achievements, announcements, shell] = await Promise.all([
    getSessionPosts(locale, { now }),
    settled<AchievementItem[]>(
      "achievements",
      getAchievementItems(locale, { since: new Date(now.getTime() - ACHIEVEMENT_DAYS * DAY_MS).toISOString(), until: nowIso, limit: ACHIEVEMENT_LIMIT }),
      [],
    ),
    settled("announcements", announcementsRead(), []),
    settled("attention", getShellData(locale), { teamColor: null, attention: null }),
  ]);

  const timeZone = postsData.orgTimeZone;
  const ended = postsData.posts.filter((p) => p.phase === "ended").map((p) => p.id);

  const materialsRead = async (): Promise<Set<string>> => {
    if (ended.length === 0) return new Set();
    const { data, error } = await supabase.from("materials").select("session_id").in("session_id", ended).is("removed_at", null);
    if (error) throw new Error(`materials (recap): ${error.message}`);
    return new Set(((data ?? []) as { session_id: string }[]).map((r) => r.session_id));
  };

  const [photos, withMaterials] = await Promise.all([
    settled("recap photos", getRecapPhotos(locale, ended), new Map<string, RecapPhotos>()),
    settled("recap materials", materialsRead(), new Set<string>()),
  ]);

  const recaps: Record<string, RecapExtra> = {};
  for (const id of ended) recaps[id] = { ...(photos.get(id) ?? { count: 0, photos: [] }), hasMaterials: withMaterials.has(id) };

  const today = orgDay(now, timeZone);
  return {
    viewer: { memberId: session.memberId, isStaff },
    groups: groupFeed(toEntries({ posts: postsData.posts, achievements, announcements }, timeZone), today),
    recaps,
    attention: isStaff ? shell.attention : null,
    timeZone,
    today,
    now: nowIso,
  };
});
