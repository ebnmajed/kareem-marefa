import "server-only";
import { cache } from "react";
import { z } from "zod";
import { sessionClient } from "@/lib/dal/session";
import { getSessionPoster } from "@/lib/dal/posters";
import { readPresenterProfiles, storyVenueFrom, type EventPresenter, type SessionState } from "@/lib/dal/sessions";
import { sessionPhase, type DayWindow } from "@/lib/session-status";

// The story feed (contract 4, DEC-248 §5, DEC-251 §4) — the ring row's sessions and each session's frames, with what
// each frame draws. `content` renders these types and never queries a session's tables itself.
//
// ★ NOTHING HERE DECIDES WHO SEES A FRAME. `story_feed()` (proposed/sessions/02) applies `story_frame_is_visible()` —
// the members' policy's own predicate — on top of RLS: inside 24 hours of its trigger (REQ-STO-002), of a session not
// cancelled (REQ-STO-018), a photo frame only while its photograph is visible, of the caller's org (REQ-STO-003). A
// component that filters is a component that leaks; so does a DAL that re-states a policy.
//
// ★ COMPUTED, NEVER STORED. A frame row holds an identity and an instant; every figure it draws — the live count, the
// recap's attendance and rating, the materials — is read here, at request time.

export type StoryRingState = "live" | "unseen" | "seen";
/** For `story-ring`'s shape (DEC-251 §4.5): `unseen` is drawn `upcoming` before completion and `recap` after. */
export type StoryPhase = "upcoming" | "live" | "completed";
export type StoryFrameKind =
  | "published"
  | "registration_opened"
  | "registration_closed"
  | "starts_soon"
  | "live"
  | "photo"
  | "recap"
  | "materials"
  | "video";
export type StoryFrameState = "processing" | "visible" | "failed";

export interface StoryPerson {
  memberId: string;
  /** Member tier only (REQ-PRF-004). */
  name: string | null;
  /** Our own copy of the picture, never Google's (DEC-099) — or null for initials. */
  avatarUrl: string | null;
  /** `#rrggbb`, reaching the DOM only as `--team`. */
  teamColor: string | null;
  company: string | null;
}

/** The frame's one action (REQ-STO-008) — a path, never a signed URL. */
export interface StoryAction {
  kind: "open_session" | "download_materials";
  href: string;
}

interface FrameBase {
  id: string;
  /** ISO. The order, and the age the header draws. */
  triggeredAt: string;
  /** `triggeredAt + 24 h`. For an age line only — never a filter; the feed has already applied expiry. */
  expiresAt: string;
  /** I have a `story_views` row for this frame (REQ-STO-010). */
  seen: boolean;
  /** The day a per-day frame is of; null for a session-level frame. */
  dayId: string | null;
  /** «اليوم 2» — null when the session has one day, or the frame is session-level. */
  dayPosition: number | null;
  action: StoryAction;
}

export type StoryFrame = FrameBase &
  (
    | { kind: "published"; startsAt: string | null; venueName: string | null; posterUrl: string | null }
    | { kind: "registration_opened"; startsAt: string | null; closesAt: string | null }
    | { kind: "registration_closed"; startsAt: string | null }
    | { kind: "starts_soon"; startsAt: string; venueName: string | null }
    /** «23 في القاعة · حتى 7:30 م» — a number, never who (A33). Refetch with `getStoryLiveCount()` when shown. */
    | { kind: "live"; checkedInCount: number | null; venueName: string | null; endsAt: string }
    /** The image is `content`'s to sign from `photoId`; the caption is `photos.caption` (DEC-251 §4.2). */
    | { kind: "photo"; photoId: string; uploader: StoryPerson | null; caption: string | null }
    | {
        kind: "recap";
        attended: number | null;
        /** Shown only at or above the org's minimum (REQ-RAT-006); else the count and the minimum, for «بعد N». */
        rating: { state: "shown"; average: number; count: number } | { state: "withheld"; count: number; minimum: number } | null;
        materialsCount: number;
        /** The first three visible photographs, by when they were taken in — `content` signs them. */
        photoIds: string[];
      }
    | { kind: "materials"; materialsCount: number }
    /** `content`'s attendee video. Its media are `content`'s to sign from `id`; a non-visible one is its author's alone. */
    | { kind: "video"; state: StoryFrameState; author: StoryPerson | null; caption: string | null; durationSeconds: number | null }
  );

export interface StorySession {
  sessionId: string;
  title: string;
  /** The first presenter's company colour, as the event page's presenter card reads it. */
  teamColor: string | null;
  presenter: StoryPerson | null;
  /** The org's time zone, for «حتى 7:30 م» and the age line. */
  timeZone: string;
  phase: StoryPhase;
  ring: StoryRingState;
  /** In the order their triggers fired (REQ-STO-001). */
  frames: StoryFrame[];
  /** Where a ring opens (REQ-STO-007): the first frame I have not seen, else 0. */
  firstUnseenIndex: number;
}

export interface StoryFeed {
  /** Live first, then the newest; a session with no visible frame is absent (REQ-STO-006). */
  sessions: StorySession[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** `05-stories.md`'s cap, standing where §25 is silent (DEC-248 §7.7): the last twelve photographs. */
const PHOTO_FRAMES = 12;
const RECAP_PHOTOS = 3;
const KIND_ORDER: readonly StoryFrameKind[] = [
  "published",
  "registration_opened",
  "registration_closed",
  "starts_soon",
  "live",
  "photo",
  "video",
  "materials",
  "recap",
];

interface FeedRow {
  frame_id: string;
  session_id: string;
  session_day_id: string | null;
  kind: StoryFrameKind;
  state: StoryFrameState;
  triggered_at: string;
  photo_id: string | null;
  author_id: string | null;
  seen: boolean;
}

interface DayRow {
  id: string;
  session_id: string;
  position: number;
  starts_at: string;
  ends_at: string;
  venue: string | null;
}

function person(p: EventPresenter | undefined): StoryPerson | null {
  if (!p) return null;
  return { memberId: p.memberId, name: p.displayName, avatarUrl: p.avatarUrl ?? null, teamColor: p.teamColor ?? null, company: p.companyName };
}

/** Frames in trigger order: the instant, then the kind's place in a session's life, then the id — never `created_at`. */
export function compareFrames(a: { triggeredAt: string; kind: StoryFrameKind; id: string }, b: { triggeredAt: string; kind: StoryFrameKind; id: string }): number {
  const t = Date.parse(a.triggeredAt) - Date.parse(b.triggeredAt);
  if (t !== 0) return t;
  const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  if (k !== 0) return k;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Keeps the last `PHOTO_FRAMES` photo frames of a session, in place; every other kind is kept. */
export function capPhotoFrames<T extends { kind: StoryFrameKind }>(frames: readonly T[]): T[] {
  const photos = frames.filter((f) => f.kind === "photo").length;
  let drop = Math.max(0, photos - PHOTO_FRAMES);
  return frames.filter((f) => {
    if (f.kind !== "photo" || drop === 0) return true;
    drop -= 1;
    return false;
  });
}

/** The ring (REQ-STO-006): live while a day runs, whatever was seen; else seen when every frame is. */
export function ringState(phase: StoryPhase, frames: readonly { seen: boolean }[]): StoryRingState {
  if (phase === "live") return "live";
  return frames.every((f) => f.seen) ? "seen" : "unseen";
}

/** Live first, then the session whose newest frame is newest; the id breaks a tie. */
export function compareSessions(a: StorySession, b: StorySession): number {
  const live = Number(b.phase === "live") - Number(a.phase === "live");
  if (live !== 0) return live;
  const newest = (s: StorySession) => Math.max(...s.frames.map((f) => Date.parse(f.triggeredAt)));
  const n = newest(b) - newest(a);
  if (n !== 0) return n;
  return a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0;
}

/** A day is running at `now`: started and not yet ended. */
export function liveNow(day: { starts_at: string; ends_at: string }, now: number): boolean {
  return Date.parse(day.starts_at) <= now && now < Date.parse(day.ends_at);
}

export function firstUnseen(frames: readonly { seen: boolean }[]): number {
  const i = frames.findIndex((f) => !f.seen);
  return i === -1 ? 0 : i;
}

/** The ring row: every session with a frame I may see now. */
export const getStoryFeed = cache(async (locale: string): Promise<StoryFeed> => {
  const { supabase } = await sessionClient(locale);

  const { data, error } = await supabase.rpc("story_feed");
  if (error) throw new Error(`story_feed: ${error.message}`);
  const rows = (data ?? []) as FeedRow[];
  if (rows.length === 0) return { sessions: [] };

  const sessionIds = [...new Set(rows.map((r) => r.session_id))];
  const photoIds = rows.map((r) => r.photo_id).filter((v): v is string => v !== null);
  const videoIds = rows.filter((r) => r.kind === "video").map((r) => r.frame_id);

  const [sessionsRes, daysRes, presentersRes, photosRes, videosRes, materialsRes] = await Promise.all([
    supabase.from("sessions").select("id, title, state, starts_at, ends_at, time_zone, rsvp_deadline_at, custom_venue_name, venues(name)").in("id", sessionIds),
    supabase
      .from("session_days")
      .select("id, session_id, position, starts_at, ends_at, custom_venue_name, custom_venue_address, custom_venue_map_url, venues(name, address, map_url)")
      .in("session_id", sessionIds),
    supabase.from("session_presenters").select("session_id, member_id").in("session_id", sessionIds).eq("accepted", true),
    photoIds.length > 0 ? supabase.from("photos").select("id, uploader_id, caption").in("id", photoIds) : Promise.resolve({ data: [], error: null }),
    videoIds.length > 0 ? supabase.from("story_frames").select("id, caption, duration_ms").in("id", videoIds) : Promise.resolve({ data: [], error: null }),
    // What a member may open, per session: `materials_read` is the whole gate; a file still being accepted is not one.
    supabase.from("materials").select("session_id").in("session_id", sessionIds).or("current_version_id.not.is.null,external_url.not.is.null"),
  ]);
  for (const [name, res] of [
    ["sessions", sessionsRes],
    ["session_days", daysRes],
    ["session_presenters", presentersRes],
    ["photos", photosRes],
    ["story_frames", videosRes],
    ["materials", materialsRes],
  ] as const) {
    if (res.error) throw new Error(`${name}: ${res.error.message}`);
  }

  const sessions = new Map(
    ((sessionsRes.data ?? []) as unknown as {
      id: string;
      title: string;
      state: SessionState;
      starts_at: string | null;
      ends_at: string | null;
      time_zone: string | null;
      rsvp_deadline_at: string | null;
      custom_venue_name: string | null;
      venues: { name: string } | null;
    }[]).map((s) => [s.id, s]),
  );

  const days = new Map<string, DayRow[]>();
  for (const raw of (daysRes.data ?? []) as unknown as Record<string, unknown>[]) {
    const venue = storyVenueFrom({
      venues: raw.venues as { name: string; address: string | null; map_url: string | null } | null,
      custom_venue_name: raw.custom_venue_name as string | null,
      custom_venue_address: raw.custom_venue_address as string | null,
      custom_venue_map_url: raw.custom_venue_map_url as string | null,
    });
    const day: DayRow = {
      id: raw.id as string,
      session_id: raw.session_id as string,
      position: raw.position as number,
      starts_at: raw.starts_at as string,
      ends_at: raw.ends_at as string,
      venue: venue?.name ?? null,
    };
    days.set(day.session_id, [...(days.get(day.session_id) ?? []), day].sort((a, b) => a.position - b.position));
  }

  const presenterBySession = new Map<string, string>();
  for (const p of (presentersRes.data ?? []) as { session_id: string; member_id: string }[]) {
    // One presenter heads a story; the lowest id is a stable choice, not a ranking.
    const held = presenterBySession.get(p.session_id);
    if (!held || p.member_id < held) presenterBySession.set(p.session_id, p.member_id);
  }

  const photos = new Map(((photosRes.data ?? []) as { id: string; uploader_id: string; caption: string | null }[]).map((p) => [p.id, p]));
  const videos = new Map(((videosRes.data ?? []) as { id: string; caption: string | null; duration_ms: number | null }[]).map((v) => [v.id, v]));
  const materialsCount = new Map<string, number>();
  for (const m of (materialsRes.data ?? []) as { session_id: string }[]) materialsCount.set(m.session_id, (materialsCount.get(m.session_id) ?? 0) + 1);

  const videoAuthors = rows.filter((r) => r.kind === "video" && r.author_id).map((r) => r.author_id as string);
  const people = await readPresenterProfiles(locale, [...presenterBySession.values(), ...[...photos.values()].map((p) => p.uploader_id), ...videoAuthors]);

  // The figures only a frame that draws them asks for.
  const liveRows = rows.filter((r) => r.kind === "live" && r.session_day_id);
  const recapSessions = [...new Set(rows.filter((r) => r.kind === "recap").map((r) => r.session_id))];
  const publishedSessions = [...new Set(rows.filter((r) => r.kind === "published").map((r) => r.session_id))];
  const [liveCounts, recaps, recapPhotos, posters] = await Promise.all([
    Promise.all(liveRows.map(async (r) => [r.frame_id, await liveCount(supabase, r.session_id, r.session_day_id as string)] as const)),
    Promise.all(recapSessions.map(async (id) => [id, await recapFigures(supabase, id)] as const)),
    recapSessions.length > 0
      ? supabase
          .from("photos")
          .select("id, session_id")
          .in("session_id", recapSessions)
          .is("hidden_at", null)
          .is("removed_at", null)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    Promise.all(publishedSessions.map(async (id) => [id, (await getSessionPoster(locale, id, "story"))?.imageUrl ?? null] as const)),
  ]);
  if (recapPhotos.error) throw new Error(`photos (recap): ${recapPhotos.error.message}`);
  const liveCountByFrame = new Map(liveCounts);
  const recapBySession = new Map(recaps);
  const posterBySession = new Map(posters);
  const firstPhotos = new Map<string, string[]>();
  for (const p of (recapPhotos.data ?? []) as { id: string; session_id: string }[]) {
    const held = firstPhotos.get(p.session_id) ?? [];
    if (held.length < RECAP_PHOTOS) firstPhotos.set(p.session_id, [...held, p.id]);
  }

  const now = Date.now();
  const out: StorySession[] = [];
  for (const sessionId of sessionIds) {
    const s = sessions.get(sessionId);
    if (!s) continue; // RLS returned the frame and not its session: draw nothing rather than half a story.
    const sessionDays = days.get(sessionId) ?? [];
    const dayById = new Map(sessionDays.map((d) => [d.id, d]));
    const multi = sessionDays.length > 1;
    const href = `/app/sessions/${sessionId}`;
    const open: StoryAction = { kind: "open_session", href };
    const materials: StoryAction = { kind: "download_materials", href: `${href}#materials` };
    const sessionVenue = s.venues?.name ?? s.custom_venue_name ?? null;

    const frames = rows
      .filter((r) => r.session_id === sessionId)
      .map((r): StoryFrame | null => {
        const day = r.session_day_id ? dayById.get(r.session_day_id) : undefined;
        const base: FrameBase = {
          id: r.frame_id,
          triggeredAt: r.triggered_at,
          expiresAt: new Date(Date.parse(r.triggered_at) + DAY_MS).toISOString(),
          seen: r.seen,
          dayId: r.session_day_id,
          dayPosition: multi && day ? day.position : null,
          action: open,
        };
        switch (r.kind) {
          case "published":
            return { ...base, kind: "published", startsAt: s.starts_at, venueName: sessionVenue, posterUrl: posterBySession.get(sessionId) ?? null };
          case "registration_opened":
            return { ...base, kind: "registration_opened", startsAt: s.starts_at, closesAt: s.rsvp_deadline_at };
          case "registration_closed":
            return { ...base, kind: "registration_closed", startsAt: s.starts_at };
          case "starts_soon":
            return day ? { ...base, kind: "starts_soon", startsAt: day.starts_at, venueName: day.venue } : null;
          case "live":
            // ★ «جارية الآن» is true only while its day runs (REQ-STO-004: «current while the session is live»). A
            // frame row lives 24 hours; once its day has ended — or the session completed early — it says nothing
            // true, and the recap carries the room's figure from then on.
            return day && s.state === "in_progress" && liveNow(day, now)
              ? { ...base, kind: "live", checkedInCount: liveCountByFrame.get(r.frame_id) ?? null, venueName: day.venue, endsAt: day.ends_at }
              : null;
          case "photo": {
            if (!r.photo_id) return null;
            const p = photos.get(r.photo_id);
            if (!p) return null; // the photograph left the caller's reach between two reads: so does its frame
            return { ...base, kind: "photo", photoId: p.id, uploader: person(people.get(p.uploader_id)), caption: p.caption };
          }
          case "recap": {
            const fig = recapBySession.get(sessionId) ?? null;
            return {
              ...base,
              action: materials,
              kind: "recap",
              attended: fig?.attended ?? null,
              rating: fig ? fig.rating : null,
              materialsCount: materialsCount.get(sessionId) ?? 0,
              photoIds: firstPhotos.get(sessionId) ?? [],
            };
          }
          case "materials":
            return { ...base, action: materials, kind: "materials", materialsCount: materialsCount.get(sessionId) ?? 0 };
          case "video": {
            const v = videos.get(r.frame_id);
            return {
              ...base,
              kind: "video",
              state: r.state,
              author: r.author_id ? person(people.get(r.author_id)) : null,
              caption: v?.caption ?? null,
              durationSeconds: v?.duration_ms != null ? Math.round(v.duration_ms / 1000) : null,
            };
          }
          default:
            return null;
        }
      })
      .filter((f): f is StoryFrame => f !== null)
      .sort(compareFrames);

    const kept = capPhotoFrames(frames);
    if (kept.length === 0) continue;

    const phase = sessionPhase({
      state: s.state,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      days: sessionDays.map((d): DayWindow => ({ id: d.id, position: d.position, startsAt: d.starts_at, endsAt: d.ends_at }) as DayWindow),
    });
    const storyPhase: StoryPhase = phase === "live" ? "live" : phase === "ended" ? "completed" : "upcoming";
    const presenter = person(people.get(presenterBySession.get(sessionId) ?? ""));

    out.push({
      sessionId,
      title: s.title,
      teamColor: presenter?.teamColor ?? null,
      presenter,
      timeZone: s.time_zone ?? "Asia/Riyadh",
      phase: storyPhase,
      ring: ringState(storyPhase, kept),
      frames: kept,
      firstUnseenIndex: firstUnseen(kept),
    });
  }

  return { sessions: out.sort(compareSessions) };
});

/** One session's story — «شاهد القصة» on a live `012` (REQ-STO-008). Null when it has no frame I may see. */
export async function getSessionStory(locale: string, sessionId: string): Promise<StorySession | null> {
  if (!z.uuid().safeParse(sessionId).success) return null;
  const feed = await getStoryFeed(locale);
  return feed.sessions.find((s) => s.sessionId === sessionId) ?? null;
}

/** The live frame's count, again, when it is shown — a refetch: nothing broadcasts check-ins to members (0166). */
export async function getStoryLiveCount(locale: string, sessionId: string, dayId: string): Promise<number | null> {
  if (!z.uuid().safeParse(sessionId).success || !z.uuid().safeParse(dayId).success) return null;
  const { supabase } = await sessionClient(locale);
  return liveCount(supabase, sessionId, dayId);
}

type Client = Awaited<ReturnType<typeof sessionClient>>["supabase"];

async function liveCount(supabase: Client, sessionId: string, dayId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("story_live_count", { p_session: sessionId, p_day: dayId });
  return error || typeof data !== "number" ? null : data;
}

interface RecapFigures {
  attended: number | null;
  rating: { state: "shown"; average: number; count: number } | { state: "withheld"; count: number; minimum: number } | null;
}

async function recapFigures(supabase: Client, sessionId: string): Promise<RecapFigures | null> {
  const { data, error } = await supabase.rpc("story_recap_figures", { p_session: sessionId });
  if (error) return null;
  const row = ((data ?? []) as { attended: number; rating_count: number; rating_avg: number | string | null; rating_min: number }[])[0];
  if (!row) return null;
  const rating =
    row.rating_avg !== null
      ? { state: "shown" as const, average: Number(row.rating_avg), count: row.rating_count }
      : { state: "withheld" as const, count: row.rating_count, minimum: row.rating_min };
  return { attended: row.attended, rating };
}
