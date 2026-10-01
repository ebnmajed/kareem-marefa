// `getHostView()`'s wave-18 fields — REQ-UIX-062, REQ-CHK-001, -002, -016 (add-only; nothing the host
// view already carried moves). The rotation instant is the code's own `valid_from + rotation`; the
// ceiling is `checkInCeiling()`'s, never a third copy; a walk-in is the attendance report's (no RSVP row
// at all); removed check-ins count for nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memorySupabase } from "./sessions-memory-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));

const ORG = "00000000-0000-4000-8000-0000000000aa";
const ME = "00000000-0000-4000-8000-0000000000bb";
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const DAY1 = "00000000-0000-4000-8000-0000000000d1";
const DAY2 = "00000000-0000-4000-8000-0000000000d2";
const [A, B, C, D] = ["a", "b", "c", "d"].map((x) => `00000000-0000-4000-8000-00000000000${x}`);

const state: { client: ReturnType<typeof memorySupabase> } = { client: null as unknown as ReturnType<typeof memorySupabase> };
vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: ME, orgId: ORG, role: "admin" }, supabase: state.client }),
}));

const { getHostView } = await import("@/lib/dal/checkin");

const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const VALID_FROM = at(-0.05);

function world(days: Record<string, unknown>[], extra: { capacity?: number | null; settings?: Record<string, unknown>[] } = {}) {
  state.client = memorySupabase(
    {
      sessions: [
        {
          id: SESSION,
          title: "العرض في 5 شرائح",
          state: "in_progress",
          starts_at: days[0].starts_at,
          ends_at: days[days.length - 1].ends_at,
          duration_minutes: 120,
          time_zone: "Asia/Riyadh",
          allow_walk_ins: true,
          check_in_open: true,
          capacity: extra.capacity === undefined ? 40 : extra.capacity,
        },
      ],
      session_days: days,
      org_settings: extra.settings ?? [{ check_in_rotation_seconds: 600, check_in_grace_seconds: 120 }],
      // A and B reserved; C walked in; D walked in and was removed.
      rsvps: [
        { session_id: SESSION, member_id: A, status: "confirmed" },
        { session_id: SESSION, member_id: B, status: "waitlisted" },
      ],
      check_ins: [
        { session_id: SESSION, session_day_id: days[days.length - 1].id, member_id: A, removed_at: null },
        { session_id: SESSION, session_day_id: days[days.length - 1].id, member_id: B, removed_at: null },
        { session_id: SESSION, session_day_id: days[days.length - 1].id, member_id: C, removed_at: null },
        { session_id: SESSION, session_day_id: days[days.length - 1].id, member_id: D, removed_at: at(-0.01) },
      ],
    },
    { ensure_check_in_code: { code: "M7K2QX", valid_from: VALID_FROM, valid_until: at(1), session_day_id: days[days.length - 1].id } },
  );
}

const day = (id: string, position: number, from: number, to: number) => ({ id, session_id: SESSION, position, starts_at: at(from), ends_at: at(to), check_in_open: true, custom_venue_name: "قاعة الرياض" });

beforeEach(() => world([day(DAY1, 1, -1, 1)]));

describe("getHostView — wave 18's add-only fields", () => {
  it("the rotation instant is the code's valid_from + the org's rotation; the read instant is carried", async () => {
    const v = (await getHostView("ar", SESSION))!;
    expect(Date.parse(v.rotatesAt!) - Date.parse(VALID_FROM)).toBe(600_000);
    expect(Number.isNaN(Date.parse(v.readAt))).toBe(false);
    expect(v.graceSeconds).toBe(120);
  });

  it("the title, the capacity; a walk-in is a check-in with no RSVP row at all, and a removed one is nothing", async () => {
    const v = (await getHostView("ar", SESSION))!;
    expect(v.title).toBe("العرض في 5 شرائح");
    expect(v.capacity).toBe(40);
    expect(v.checkInCount).toBe(3);
    expect(v.walkInCount).toBe(1); // C — B is waitlisted, which the report does not call a walk-in
  });

  it("no capacity reads as null, never zero", async () => {
    world([day(DAY1, 1, -1, 1)], { capacity: null });
    expect((await getHostView("ar", SESSION))!.capacity).toBeNull();
  });

  it("★ the ceiling at one day is the end + 2 h (REQ-CHK-016)", async () => {
    const v = (await getHostView("ar", SESSION))!;
    const end = Date.parse(v.day!.endsAt);
    expect(Date.parse(v.closesAt!) - end).toBe(2 * 3_600_000);
  });

  it("★ the ceiling is capped by the next day's start (DEC-151)", async () => {
    world([day(DAY1, 1, -1, 1), day(DAY2, 2, 1.5, 3)]);
    // The code names day 2 here, so its ceiling has no next day; ask about day 1 instead.
    state.client = memorySupabase(
      {
        sessions: [{ id: SESSION, title: "ورشة", state: "in_progress", starts_at: at(-1), ends_at: at(3), duration_minutes: 60, time_zone: "Asia/Riyadh", allow_walk_ins: false, check_in_open: true, capacity: 40 }],
        session_days: [day(DAY1, 1, -1, 1), day(DAY2, 2, 1.5, 3)],
        org_settings: [{ check_in_rotation_seconds: 600, check_in_grace_seconds: 120 }],
        rsvps: [],
        check_ins: [],
      },
      { ensure_check_in_code: { code: "M7K2QX", valid_from: VALID_FROM, valid_until: at(1), session_day_id: DAY1 } },
    );
    const v = (await getHostView("ar", SESSION))!;
    expect(v.day!.id).toBe(DAY1);
    expect(v.closesAt).toBe(new Date(Date.parse(v.day!.startsAt) + 2.5 * 3_600_000).toISOString());
  });

  it("the day's venue", async () => {
    expect((await getHostView("ar", SESSION))!.venueName).toBe("قاعة الرياض");
  });
});
