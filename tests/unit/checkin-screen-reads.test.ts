// SCR-014's own read, `getCheckInScreenData()` — two things DEC-174 pins.
//
// Q5: it no longer calls `session_complete_attendees()`. That function is
// staff-only (`0108`, `RPC-session_complete_attendees.staff_only`) and this is
// the MEMBER's screen, so the call was refused 42501 on every render and its
// result never read — one wasted round trip on the room's most time-critical
// screen, from `dd607c2`. This test fails if any RPC is called at all: the
// screen's read is five table reads and the day list, nothing more.
//
// Q6: `checkedInToday` — an active check-in on the day the screen is about. It
// orders the form and the award state and gates nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memorySupabase } from "./sessions-memory-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));

const ORG = "00000000-0000-4000-8000-0000000000aa";
const ME = "00000000-0000-4000-8000-0000000000bb";
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const DAY1 = "00000000-0000-4000-8000-0000000000d1";
const DAY2 = "00000000-0000-4000-8000-0000000000d2";

type Client = ReturnType<typeof memorySupabase> & { rpc: ReturnType<typeof vi.fn> };
const state: { client: Client } = { client: null as unknown as Client };

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: ME, orgId: ORG, role: "member" }, supabase: state.client }),
}));

const { getCheckInScreenData } = await import("@/lib/dal/checkin");

const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

function world(days: Record<string, unknown>[], checkIns: Record<string, unknown>[]) {
  const base = memorySupabase({
    sessions: [
      {
        id: SESSION,
        title: "جلسة اختبار",
        state: "in_progress",
        starts_at: days[0].starts_at,
        ends_at: days[days.length - 1].ends_at,
        duration_minutes: 120,
        time_zone: "Asia/Riyadh",
        allow_walk_ins: false,
        check_in_open: true,
      },
    ],
    session_days: days,
    session_presenters: [],
    rsvps: [{ session_id: SESSION, member_id: ME, status: "confirmed" }],
    check_ins: checkIns,
  });
  state.client = { ...base, rpc: vi.fn(base.rpc) };
}

const oneDay = [{ id: DAY1, session_id: SESSION, position: 1, starts_at: at(-1), ends_at: at(1), check_in_open: true }];
/** Day 1 is over; day 2 is running now. */
const twoDays = [
  { id: DAY1, session_id: SESSION, position: 1, starts_at: at(-30), ends_at: at(-28), check_in_open: true },
  { id: DAY2, session_id: SESSION, position: 2, starts_at: at(-1), ends_at: at(1), check_in_open: true },
];
const checkIn = (dayId: string, removedAt: string | null = null) => ({ session_id: SESSION, member_id: ME, session_day_id: dayId, removed_at: removedAt });

describe("getCheckInScreenData — no staff-only read on the member's screen (DEC-174 Q5)", () => {
  beforeEach(() => world(oneDay, []));

  it("★ calls no RPC at all — `session_complete_attendees()` is gone", async () => {
    const data = await getCheckInScreenData("ar", SESSION);
    expect(data).not.toBeNull();
    expect(state.client.rpc).not.toHaveBeenCalled();
  });
});

describe("getCheckInScreenData — checkedInToday orders the screen (DEC-174 Q6)", () => {
  it("is false before the member's check-in, and the form is still offered", async () => {
    world(oneDay, []);
    const data = await getCheckInScreenData("ar", SESSION);
    expect(data?.checkedInToday).toBe(false);
    expect(data?.canAttemptCheckIn).toBe(true);
  });

  it("is true after it — and gates nothing: the form is still offered, `check_in()` answers «already»", async () => {
    world(oneDay, [checkIn(DAY1)]);
    const data = await getCheckInScreenData("ar", SESSION);
    expect(data?.checkedInToday).toBe(true);
    expect(data?.canAttemptCheckIn).toBe(true);
  });

  it("★ is per day: attending day 1 is not being checked in to day 2", async () => {
    world(twoDays, [checkIn(DAY1)]);
    const data = await getCheckInScreenData("ar", SESSION);
    expect(data?.day?.id).toBe(DAY2);
    expect(data?.checkedInToday).toBe(false);
  });

  it("a removed check-in is not a check-in (REQ-CHK-017)", async () => {
    world(oneDay, [checkIn(DAY1, at(-0.5))]);
    const data = await getCheckInScreenData("ar", SESSION);
    expect(data?.checkedInToday).toBe(false);
  });
});
