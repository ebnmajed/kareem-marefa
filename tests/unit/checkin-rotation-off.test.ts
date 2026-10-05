// Contract 2 (wave 27, REQ-CHK-019, DEC-254 §6, DEC-255 D6) — `rotationSeconds: number | null`.
// null is «لا يتغيّر» (the day's one code) and also a failed read: the two checkin DTOs carry null, never a guessed 600,
// and the host view's `rotatesAt` is null with it, so no countdown is drawn. `validUntil` is still carried — the host
// view and SCR-044 refresh at it when there is no rotation.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memorySupabase } from "./sessions-memory-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));

const ORG = "00000000-0000-4000-8000-0000000000aa";
const ME = "00000000-0000-4000-8000-0000000000bb";
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const DAY1 = "00000000-0000-4000-8000-0000000000d1";

const state: { client: ReturnType<typeof memorySupabase>; role: string } = { client: null as unknown as ReturnType<typeof memorySupabase>, role: "admin" };
vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: ME, orgId: ORG, role: state.role }, supabase: state.client }),
}));

const { getHostView, getCheckInScreenData } = await import("@/lib/dal/checkin");

const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const VALID_FROM = at(-3);
const CEILING = at(3);

function world(settings: Record<string, unknown>[]) {
  state.client = memorySupabase(
    {
      sessions: [
        {
          id: SESSION,
          title: "جلسة برمز ثابت",
          state: "in_progress",
          starts_at: at(-3),
          ends_at: at(1),
          duration_minutes: 240,
          time_zone: "Asia/Riyadh",
          allow_walk_ins: true,
          check_in_open: true,
          capacity: 40,
          require_all_days: true,
        },
      ],
      session_days: [{ id: DAY1, session_id: SESSION, position: 1, starts_at: at(-3), ends_at: at(1), check_in_open: true }],
      session_presenters: [],
      org_settings: settings,
      rsvps: [],
      check_ins: [],
      members: [],
    },
    // The whole-day code: issued three hours ago, valid to the day's ceiling.
    { ensure_check_in_code: { code: "M7K2QX", valid_from: VALID_FROM, valid_until: CEILING, session_day_id: DAY1 } },
  );
}

// Two rows make `.maybeSingle()` answer an error — the memory client's only way to fail a read.
const FAILED = [
  { check_in_rotation_seconds: 600, check_in_grace_seconds: 120 },
  { check_in_rotation_seconds: 600, check_in_grace_seconds: 120 },
];

beforeEach(() => {
  state.role = "admin";
  world([{ check_in_rotation_seconds: null, check_in_grace_seconds: 120 }]);
});

describe("getHostView — rotation off", () => {
  it("null rotation: no rotation instant, the code and its validUntil carried", async () => {
    const v = (await getHostView("ar", SESSION))!;
    expect(v.rotationSeconds).toBeNull();
    expect(v.rotatesAt).toBeNull();
    expect(v.code).toBe("M7K2QX");
    expect(v.validUntil).toBe(CEILING);
  });

  it("★ a failed settings read is null too — never a guessed 600 (D6)", async () => {
    world(FAILED);
    const v = (await getHostView("ar", SESSION))!;
    expect(v.rotationSeconds).toBeNull();
    expect(v.rotatesAt).toBeNull();
  });

  it("a period still counts down from the code's valid_from", async () => {
    world([{ check_in_rotation_seconds: 300, check_in_grace_seconds: 120 }]);
    const v = (await getHostView("ar", SESSION))!;
    expect(v.rotationSeconds).toBe(300);
    expect(Date.parse(v.rotatesAt!) - Date.parse(VALID_FROM)).toBe(300_000);
  });
});

describe("getCheckInScreenData — rotation off", () => {
  beforeEach(() => {
    state.role = "member";
  });

  it("null rotation reads as null", async () => {
    expect((await getCheckInScreenData("ar", SESSION))!.rotationSeconds).toBeNull();
  });

  it("★ a failed read is null, not 600 (D6)", async () => {
    world(FAILED);
    expect((await getCheckInScreenData("ar", SESSION))!.rotationSeconds).toBeNull();
  });

  it("a period is carried as it is", async () => {
    world([{ check_in_rotation_seconds: 900, check_in_grace_seconds: 120 }]);
    expect((await getCheckInScreenData("ar", SESSION))!.rotationSeconds).toBe(900);
  });
});
