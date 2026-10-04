// The story feed's read model (contract 4, REQ-STO-001, 004, 006, 008; DEC-251 §4). What the DAL decides on top of
// `story_feed()`'s rows: the frames' order, what each draws, the ring's state and the feed's order. Who may see a frame
// is NOT decided here — `tests/rls/story-generator-feed.test.ts` proves that over RLS.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Rows = Record<string, unknown[]>;
let tables: Rows = {};
let rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {};

function query(table: string) {
  const q = {
    select: () => q,
    in: () => q,
    eq: () => q,
    is: () => q,
    or: () => q,
    order: () => q,
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: tables[table] ?? [], error: null }),
  };
  return q;
}

const supabase = {
  from: (table: string) => query(table),
  rpc: async (name: string, args: Record<string, unknown> = {}) => ({ data: rpcs[name]?.(args) ?? null, error: null }),
};

vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn(async () => ({ session: { memberId: "me" }, supabase })) }));
vi.mock("@/lib/dal/posters", () => ({ getSessionPoster: vi.fn(async () => ({ imageUrl: "https://signed/poster.png" })) }));
vi.mock("@/lib/dal/sessions", () => ({
  storyVenueFrom: (row: { venues?: { name: string } | null; custom_venue_name?: string | null }) =>
    row.venues ? { name: row.venues.name } : row.custom_venue_name ? { name: row.custom_venue_name } : null,
  readPresenterProfiles: vi.fn(async (_locale: string, ids: readonly string[]) =>
    new Map(ids.map((id) => [id, { memberId: id, displayName: `اسم ${id}`, jobTitle: null, companyName: "مواهب", bio: null, avatarUrl: null, teamColor: "#ff6e4f" }])),
  ),
}));

const { getStoryFeed, compareFrames, capPhotoFrames, ringState, firstUnseen } = await import("@/lib/dal/stories");

const LIVE = "11111111-1111-4111-8111-111111111111";
const DONE = "22222222-2222-4222-8222-222222222222";
const DAY_LIVE = "33333333-3333-4333-8333-333333333333";
const DAY_DONE = "44444444-4444-4444-8444-444444444444";
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const hoursAhead = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

function frame(id: string, session: string, kind: string, at: string, extra: Record<string, unknown> = {}) {
  return { frame_id: id, session_id: session, session_day_id: null, kind, state: "visible", triggered_at: at, photo_id: null, author_id: null, seen: false, ...extra };
}

beforeEach(() => {
  tables = {
    sessions: [
      { id: LIVE, title: "العرض في 5 شرائح", state: "in_progress", starts_at: hoursAgo(1), ends_at: hoursAhead(1), time_zone: "Asia/Riyadh", rsvp_deadline_at: hoursAgo(1), custom_venue_name: null, venues: { name: "قاعة الرياض" } },
      { id: DONE, title: "الأرقام التي تكذب", state: "completed", starts_at: hoursAgo(20), ends_at: hoursAgo(18), time_zone: "Asia/Riyadh", rsvp_deadline_at: hoursAgo(20), custom_venue_name: "قاعة جدة", venues: null },
    ],
    session_days: [
      { id: DAY_LIVE, session_id: LIVE, position: 1, starts_at: hoursAgo(1), ends_at: hoursAhead(1), venues: { name: "قاعة الرياض", address: null, map_url: null } },
      { id: DAY_DONE, session_id: DONE, position: 1, starts_at: hoursAgo(20), ends_at: hoursAgo(18), venues: null, custom_venue_name: "قاعة جدة" },
    ],
    session_presenters: [
      { session_id: LIVE, member_id: "p1" },
      { session_id: DONE, member_id: "p2" },
    ],
    photos: [
      { id: "ph1", uploader_id: "u1", caption: "أول صورة من القاعة", session_id: DONE },
      { id: "ph2", uploader_id: "u1", caption: null, session_id: DONE },
    ],
    story_frames: [],
    materials: [{ session_id: DONE }, { session_id: DONE }, { session_id: DONE }],
  };
  rpcs = {
    story_feed: () => [
      frame("f-done-recap", DONE, "recap", hoursAgo(18), { seen: true }),
      frame("f-done-photo", DONE, "photo", hoursAgo(19), { photo_id: "ph1", seen: true }),
      frame("f-live", LIVE, "live", hoursAgo(1), { session_day_id: DAY_LIVE }),
    ],
    story_live_count: () => 23,
    story_recap_figures: () => [{ attended: 28, rating_count: 2, rating_avg: null, rating_min: 3 }],
  };
});

describe("getStoryFeed — what each frame draws", () => {
  it("puts a live session first, whatever was seen, and the newest after it", async () => {
    const feed = await getStoryFeed("ar");
    expect(feed.sessions.map((s) => s.sessionId)).toEqual([LIVE, DONE]);
    expect(feed.sessions[0]).toMatchObject({ phase: "live", ring: "live" });
    expect(feed.sessions[1]).toMatchObject({ phase: "completed", ring: "seen" });
  });

  it("the live frame carries a count, never who, and the day's place and end", async () => {
    const live = (await getStoryFeed("ar")).sessions[0].frames[0];
    expect(live).toMatchObject({ kind: "live", checkedInCount: 23, venueName: "قاعة الرياض", action: { kind: "open_session", href: `/app/sessions/${LIVE}` } });
    expect(JSON.stringify(live)).not.toMatch(/memberId/);
  });

  it("the recap withholds the rating below the minimum, and points at the materials section", async () => {
    const done = (await getStoryFeed("ar")).sessions[1];
    const recap = done.frames.find((f) => f.kind === "recap");
    expect(recap).toMatchObject({
      attended: 28,
      rating: { state: "withheld", count: 2, minimum: 3 },
      materialsCount: 3,
      action: { kind: "download_materials", href: `/app/sessions/${DONE}#materials` },
    });
  });

  it("shows the rating at the minimum", async () => {
    rpcs.story_recap_figures = () => [{ attended: 28, rating_count: 3, rating_avg: "4.6", rating_min: 3 }];
    const recap = (await getStoryFeed("ar")).sessions[1].frames.find((f) => f.kind === "recap");
    expect(recap).toMatchObject({ rating: { state: "shown", average: 4.6, count: 3 } });
  });

  it("a photo frame names its uploader at member tier and carries photos.caption", async () => {
    const photo = (await getStoryFeed("ar")).sessions[1].frames.find((f) => f.kind === "photo");
    expect(photo).toMatchObject({ photoId: "ph1", caption: "أول صورة من القاعة", uploader: { memberId: "u1", name: "اسم u1", teamColor: "#ff6e4f" } });
  });

  it("orders a story's frames by their triggers, never by the rows' order", async () => {
    const done = (await getStoryFeed("ar")).sessions[1];
    expect(done.frames.map((f) => f.kind)).toEqual(["photo", "recap"]);
  });

  it("a frame whose photograph the caller no longer reads is dropped, and an empty story has no ring", async () => {
    tables.photos = [];
    rpcs.story_feed = () => [frame("f-done-photo", DONE, "photo", hoursAgo(19), { photo_id: "ph1" })];
    expect((await getStoryFeed("ar")).sessions).toEqual([]);
  });

  it("no rows, no sessions", async () => {
    rpcs.story_feed = () => [];
    expect((await getStoryFeed("ar")).sessions).toEqual([]);
  });
});

describe("the pure rules", () => {
  it("ties in time fall to the kind's place in a session's life, then the id", () => {
    const at = hoursAgo(1);
    const sorted = [
      { id: "b", kind: "recap" as const, triggeredAt: at },
      { id: "a", kind: "published" as const, triggeredAt: at },
      { id: "c", kind: "materials" as const, triggeredAt: at },
    ].sort(compareFrames);
    expect(sorted.map((f) => f.kind)).toEqual(["published", "materials", "recap"]);
  });

  it("keeps the last twelve photo frames and every other kind", () => {
    const frames = [{ kind: "published" as const }, ...Array.from({ length: 15 }, (_, i) => ({ kind: "photo" as const, i })), { kind: "recap" as const }];
    const kept = capPhotoFrames(frames);
    expect(kept.filter((f) => f.kind === "photo")).toHaveLength(12);
    expect(kept[0].kind).toBe("published");
    expect((kept[1] as { i: number }).i).toBe(3);
    expect(kept.at(-1)?.kind).toBe("recap");
  });

  it("a ring is seen only when every frame is; live overrides", () => {
    expect(ringState("upcoming", [{ seen: true }, { seen: false }])).toBe("unseen");
    expect(ringState("completed", [{ seen: true }, { seen: true }])).toBe("seen");
    expect(ringState("live", [{ seen: true }])).toBe("live");
  });

  it("opens on the first unseen frame, else the first", () => {
    expect(firstUnseen([{ seen: true }, { seen: false }, { seen: false }])).toBe(1);
    expect(firstUnseen([{ seen: true }])).toBe(0);
  });
});
