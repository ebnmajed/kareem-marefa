// Contract 1 (REQ-CHK-018, DEC-172, DEC-174) — the DAL half of the pending
// state: session_award_state()'s one row, as the DTO `checkin` renders. The
// SQL half is tests/rls/scoring-award-state.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: "m", orgId: "o" }, supabase: { rpc } }),
}));

const SESSION = "00000000-0000-4000-8000-0000000000cc";

async function load() {
  return import("@/lib/dal/points");
}

const row = (over: Record<string, unknown>) => ({
  state: "none",
  points: 0,
  days_attended: 0,
  days_required: 1,
  day_count: 1,
  missed_days: [],
  ...over,
});

describe("toSessionAwardState — the row as the DTO", () => {
  it("none carries nothing", async () => {
    const { toSessionAwardState } = await load();
    expect(toSessionAwardState(row({ state: "none" }) as never)).toEqual({ state: "none" });
  });

  it("pending carries the amount and the days", async () => {
    const { toSessionAwardState } = await load();
    expect(toSessionAwardState(row({ state: "pending", points: 20, days_attended: 2, days_required: 3, day_count: 3 }) as never)).toEqual({
      state: "pending",
      points: 20,
      daysAttended: 2,
      daysRequired: 3,
      dayCount: 3,
    });
  });

  it("paid carries only the amount the ledger holds", async () => {
    const { toSessionAwardState } = await load();
    expect(toSessionAwardState(row({ state: "paid", points: 20 }) as never)).toEqual({ state: "paid", points: 20 });
  });

  it("incomplete names the missed days as { position, startsAt }, in the order given", async () => {
    const { toSessionAwardState } = await load();
    const missed = [
      { position: 2, starts_at: "2026-10-02T07:00:00Z" },
      { position: 3, starts_at: "2026-10-03T07:00:00Z" },
    ];
    expect(toSessionAwardState(row({ state: "incomplete", days_attended: 1, days_required: 3, day_count: 3, missed_days: missed }) as never)).toEqual({
      state: "incomplete",
      missedDays: [
        { position: 2, startsAt: "2026-10-02T07:00:00Z" },
        { position: 3, startsAt: "2026-10-03T07:00:00Z" },
      ],
      daysAttended: 1,
      daysRequired: 3,
      dayCount: 3,
    });
  });
});

describe("getSessionAwardState — one RPC, null when not visible", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.resetModules();
  });

  it("calls session_award_state with the session and maps its one row", async () => {
    rpc.mockResolvedValue({ data: [row({ state: "paid", points: 20 })], error: null });
    const { getSessionAwardState } = await load();
    expect(await getSessionAwardState("ar", SESSION)).toEqual({ state: "paid", points: 20 });
    expect(rpc).toHaveBeenCalledWith("session_award_state", { p_session: SESSION });
  });

  it("zero rows — another org's session, or none — is null", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { getSessionAwardState } = await load();
    expect(await getSessionAwardState("ar", SESSION)).toBeNull();
  });

  it("a malformed id is null without a round trip", async () => {
    const { getSessionAwardState } = await load();
    expect(await getSessionAwardState("ar", "not-a-uuid")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a failed RPC throws; the caller decides what a failure renders", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { getSessionAwardState } = await load();
    await expect(getSessionAwardState("ar", SESSION)).rejects.toThrow(/session_award_state: boom/);
  });
});
