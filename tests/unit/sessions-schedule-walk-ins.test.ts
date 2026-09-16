// Contract 1 — walk-ins as a publishing setting, through `schedule_session()`
// (DEC-117, DEC-118, migration 0085). The RPC's last parameter is
// `p_allow_walk_ins boolean default null`, and NULL MEANS UNCHANGED
// (`coalesce(p_allow_walk_ins, target.allow_walk_ins)`, DEC-141 correction B).
// So the DAL must deliver `null` as `null` — a `false` there would switch
// walk-ins off on every save that did not carry the field — and a boolean as
// that boolean. And the schedule form reads the stored value back.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memorySupabase } from "./sessions-memory-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));

const SESSION = "00000000-0000-4000-8000-0000000000cc";
const calls: { name: string; args: Record<string, unknown> }[] = [];
/** The in-memory tables, with an `rpc` that records what it was handed. */
type Client = Omit<ReturnType<typeof memorySupabase>, "rpc"> & { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: null; error: null }> };
const state: { client: Client | null } = { client: null };

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: "m", orgId: "org", role: "admin" }, supabase: state.client }),
}));

const { getSessionForSchedule, scheduleInput, scheduleSession } = await import("@/lib/dal/sessions");

const base = {
  startsAt: "2026-10-01T15:00:00+03:00",
  durationMinutes: 60,
  endsAt: null,
  venueId: null,
  customVenueName: "قاعة الابتكار",
  customVenueAddress: null,
  customVenueMapUrl: null,
  capacity: 30,
  rsvpDeadlineAt: null,
  cancellationCutoffAt: null,
  certificateMode: "off",
  language: "ar",
};

beforeEach(() => {
  calls.length = 0;
  const client = memorySupabase({
    sessions: [{ id: SESSION, title: "جلسة", state: "approved", language: "ar", allow_walk_ins: true, certificate_mode: "off", time_zone: "Asia/Riyadh" }],
  });
  state.client = {
    ...client,
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: null, error: null };
    },
  };
});

describe("scheduleInput — the walk-in field", () => {
  it("keeps null as null, and parses an absent key to null — never to false", () => {
    expect(scheduleInput.parse({ ...base, allowWalkIns: null }).allowWalkIns).toBeNull();
    expect(scheduleInput.parse(base).allowWalkIns).toBeNull();
  });

  it("keeps a boolean as that boolean", () => {
    expect(scheduleInput.parse({ ...base, allowWalkIns: false }).allowWalkIns).toBe(false);
    expect(scheduleInput.parse({ ...base, allowWalkIns: true }).allowWalkIns).toBe(true);
  });

  it("is still .strict() — an unknown key is refused", () => {
    expect(scheduleInput.safeParse({ ...base, allowWalkIns: true, title: "x" }).success).toBe(false);
  });
});

describe("scheduleSession — what reaches schedule_session()", () => {
  it("★ a null input sends p_allow_walk_ins: null, present and not coerced", async () => {
    await scheduleSession("ar", SESSION, scheduleInput.parse({ ...base, allowWalkIns: null }));
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("schedule_session");
    expect("p_allow_walk_ins" in calls[0].args).toBe(true);
    expect(calls[0].args.p_allow_walk_ins).toBeNull();
  });

  it("a boolean sends that boolean", async () => {
    await scheduleSession("ar", SESSION, scheduleInput.parse({ ...base, allowWalkIns: false }));
    await scheduleSession("ar", SESSION, scheduleInput.parse({ ...base, allowWalkIns: true }));
    expect(calls.map((c) => c.args.p_allow_walk_ins)).toEqual([false, true]);
  });
});

describe("getSessionForSchedule — the read-back", () => {
  it("carries the stored walk-in setting as allowWalkIns", async () => {
    expect((await getSessionForSchedule("ar", SESSION))?.allowWalkIns).toBe(true);
  });
});
