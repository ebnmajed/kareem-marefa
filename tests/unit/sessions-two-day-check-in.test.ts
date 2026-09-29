// A member checked in on two days of a workshop IS checked in (DEC-197 §3,
// REQ-SES-015, REQ-CHK-017). Since wave 9 a workshop holds one active
// check-in PER DAY, so this member has two rows. The event page read them with
// `.maybeSingle()`, which refuses two rows; the error went unchecked and the
// member read as NOT checked in from day 2 on — the relation, the raw fact
// the check-in link reads, and so the button the card offered.
//
// The stub's `maybeSingle()` refuses more than one row exactly as PostgREST
// does, so the old read fails this test the way it failed in production.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memorySupabase } from "./sessions-memory-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));
vi.mock("@/lib/dal/posters", () => ({ getSessionPoster: async () => null }));

const ORG = "00000000-0000-4000-8000-0000000001aa";
const ME = "00000000-0000-4000-8000-0000000001bb";
const SESSION = "00000000-0000-4000-8000-0000000001cc";
const ADMIN = "00000000-0000-4000-8000-0000000001dd";
const DAY_1 = "00000000-0000-4000-8000-0000000001d1";
const DAY_2 = "00000000-0000-4000-8000-0000000001d2";
const DAY_3 = "00000000-0000-4000-8000-0000000001d3";

const state: { client: ReturnType<typeof memorySupabase> } = { client: memorySupabase({}) };

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: ME, orgId: ORG, role: "member" }, supabase: state.client }),
}));

const { getSessionForEvent } = await import("@/lib/dal/sessions");

const workshop = {
  id: SESSION,
  org_id: ORG,
  title: "ورشة التحليل المالي",
  abstract: "ثلاثة أيام",
  state: "completed",
  level: "introductory",
  language: "ar",
  category_id: null,
  venue_id: null,
  duration_minutes: 120,
  starts_at: "2026-09-10T15:00:00Z",
  ends_at: "2026-09-12T17:00:00Z",
  completed_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  time_zone: "Asia/Riyadh",
  capacity: 30,
  rsvp_deadline_at: null,
  cancellation_cutoff_at: null,
  cancellation_reason: null,
  allow_walk_ins: false,
  check_in_open: true,
  custom_venue_name: "قاعة الابتكار",
  categories: null,
  venues: null,
};

const day = (id: string, position: number) => ({
  id,
  org_id: ORG,
  session_id: SESSION,
  position,
  starts_at: `2026-09-1${position - 1}T15:00:00Z`,
  ends_at: `2026-09-1${position - 1}T17:00:00Z`,
  venue_id: null,
  custom_venue_name: null,
  venues: null,
});

const checkIn = (id: string, dayId: string, removedAt: string | null = null) => ({
  id,
  org_id: ORG,
  session_id: SESSION,
  member_id: ME,
  session_day_id: dayId,
  removed_at: removedAt,
  removed_by: removedAt ? ADMIN : null,
});

function world(checkIns: Record<string, unknown>[]) {
  state.client = memorySupabase({
    sessions: [workshop],
    session_days: [day(DAY_1, 1), day(DAY_2, 2), day(DAY_3, 3)],
    check_ins: checkIns,
    rsvps: [{ org_id: ORG, session_id: SESSION, member_id: ME, status: "confirmed" }],
    session_presenters: [],
    session_tags: [],
    categories: [],
    venues: [],
    companies: [],
  });
}

beforeEach(() => world([]));

describe("a member checked in on two workshop days reads as checked in (DEC-197 §3)", () => {
  it("reads checked in, on both days, and attended — not absent", async () => {
    world([checkIn("ci-1", DAY_1), checkIn("ci-2", DAY_2)]);
    const event = await getSessionForEvent("ar", SESSION);
    expect(event?.checkedIn).toBe(true);
    expect([...(event?.checkedInDayIds ?? [])].sort()).toEqual([DAY_1, DAY_2]);
    expect(event?.viewerRelation).toBe("attended");
  });

  it("three days, three rows: every one counted", async () => {
    world([checkIn("ci-1", DAY_1), checkIn("ci-2", DAY_2), checkIn("ci-3", DAY_3)]);
    const event = await getSessionForEvent("ar", SESSION);
    expect(event?.checkedIn).toBe(true);
    expect(event?.checkedInDayIds).toHaveLength(3);
  });

  it("a removed day is not a checked-in day, beside an active one", async () => {
    world([checkIn("ci-1", DAY_1, "2026-09-12T10:00:00Z"), checkIn("ci-2", DAY_2)]);
    const event = await getSessionForEvent("ar", SESSION);
    expect(event?.checkedIn).toBe(true);
    expect(event?.checkedInDayIds).toEqual([DAY_2]);
  });

  it("one day, one row: as before", async () => {
    world([checkIn("ci-1", DAY_1)]);
    const event = await getSessionForEvent("ar", SESSION);
    expect(event?.checkedIn).toBe(true);
    expect(event?.checkedInDayIds).toEqual([DAY_1]);
  });

  it("no active check-in: not checked in, no days", async () => {
    world([checkIn("ci-1", DAY_1, "2026-09-12T10:00:00Z")]);
    const event = await getSessionForEvent("ar", SESSION);
    expect(event?.checkedIn).toBe(false);
    expect(event?.checkedInDayIds).toEqual([]);
    expect(event?.viewerRelation).toBe("absent");
  });
});
