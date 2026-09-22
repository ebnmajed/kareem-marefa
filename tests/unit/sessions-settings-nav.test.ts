// REQ-SES-020 — which of a session's admin screens the hub's strip offers
// (DEC-178). Presentation, not authority: each page is still its own boundary.
// The query is mocked at the client; what is asserted is the rule.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));

const SESSION = "00000000-0000-4000-8000-0000000000cc";
type Row = { id: string; session_presenters: { member_id: string; accepted: boolean }[] } | null;
const state: { role: string; row: Row; error: { message: string } | null; throws: boolean; filters: [string, unknown][] } = {
  role: "admin",
  row: null,
  error: null,
  throws: false,
  filters: [],
};

function query() {
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      state.filters.push([column, value]);
      return chain;
    },
    maybeSingle: async () => {
      if (state.throws) throw new Error("network");
      return { data: state.row, error: state.error };
    },
  };
  return chain;
}

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: "me", orgId: "org", role: state.role }, supabase: { from: () => query() } }),
}));

const { getSessionSettingsNav } = await import("@/lib/dal/sessions");

beforeEach(() => {
  state.role = "admin";
  state.row = { id: SESSION, session_presenters: [] };
  state.error = null;
  state.throws = false;
  state.filters = [];
});

describe("getSessionSettingsNav", () => {
  it("an admin gets all five, in the order a session is lived", async () => {
    expect(await getSessionSettingsNav("ar", SESSION)).toEqual({ items: ["schedule", "attendance", "certificates", "survey", "event"] });
    // The presenter rows are the caller's own — the one question the survey asks.
    expect(state.filters).toContainEqual(["session_presenters.member_id", "me"]);
  });

  it("a moderator never sees the schedule, which is an admin's (getSessionForSchedule)", async () => {
    state.role = "moderator";
    expect(await getSessionSettingsNav("ar", SESSION)).toEqual({ items: ["attendance", "certificates", "survey", "event"] });
  });

  it("an admin who presents this session is not offered its survey — survey_results() refuses them", async () => {
    state.row = { id: SESSION, session_presenters: [{ member_id: "me", accepted: true }] };
    expect(await getSessionSettingsNav("ar", SESSION)).toEqual({ items: ["schedule", "attendance", "certificates", "event"] });
  });

  it("a pending presenter row does not count", async () => {
    state.row = { id: SESSION, session_presenters: [{ member_id: "me", accepted: false }] };
    expect((await getSessionSettingsNav("ar", SESSION))?.items).toContain("survey");
  });

  it("null for a member, a session this org cannot see, a malformed id, an error and a throw", async () => {
    state.role = "member";
    expect(await getSessionSettingsNav("ar", SESSION)).toBeNull();
    state.role = "admin";
    expect(await getSessionSettingsNav("ar", "nope")).toBeNull();
    state.row = null;
    expect(await getSessionSettingsNav("ar", SESSION)).toBeNull();
    state.row = { id: SESSION, session_presenters: [] };
    state.error = { message: "boom" };
    expect(await getSessionSettingsNav("ar", SESSION)).toBeNull();
    state.error = null;
    state.throws = true;
    expect(await getSessionSettingsNav("ar", SESSION)).toBeNull();
  });
});
