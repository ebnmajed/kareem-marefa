// A REMOVED check-in is not attendance, on the ADMIN side too (REQ-CHK-017,
// migration 0087) — `tests/unit/sessions-removed-check-in.test.ts` already
// proved this for the member-facing readers; these are the two admin ones
// the lead found in the sync-3/promotion pass and granted a one-filter fix
// for, outside this track's own wave-7 list in `admin-exports.ts`'s case:
//
//   · the dashboard's attendance-rate figure   (lib/dal/admin-dashboard.ts)
//   · the "all sessions" attendance export     (lib/dal/admin-exports.ts)
//
// `remove_check_in()` soft-deletes: `removed_at` is set, the row stays (for
// `certificates.check_in_id` and the audit trail), and RLS does NOT hide it
// — so a reader that does not filter `removed_at is null` itself counts a
// reversed check-in as if it still happened. Each case below holds a removed
// row and NO active one; the stub filters for real, so a reader without the
// filter reads it and fails — proving the bug before the fix, the way the
// lead's own "add a test for each, one that fails before the fix" was meant.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memorySupabase } from "./sessions-memory-supabase";

vi.mock("server-only", () => ({}));

const ORG = "00000000-0000-4000-8000-0000000000aa";
const ADMIN = "00000000-0000-4000-8000-0000000000dd";
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const MEMBER = "00000000-0000-4000-8000-0000000000bb";

const state: { client: ReturnType<typeof memorySupabase> } = { client: memorySupabase({}) };

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: ADMIN, orgId: ORG, role: "admin" }, supabase: state.client }),
}));

const { getAdminDashboardData } = await import("@/lib/dal/admin-dashboard");
const { exportAllAttendanceCsv } = await import("@/lib/dal/admin-exports");

const removed = { org_id: ORG, id: "ci-removed", session_id: SESSION, member_id: MEMBER, arrived_at: "2026-09-10T16:05:00Z", method: "code", removed_at: "2026-09-12T10:00:00Z" };
const active = { org_id: ORG, id: "ci-active", session_id: SESSION, member_id: MEMBER, arrived_at: "2026-09-10T16:07:00Z", method: "manual", removed_at: null };

/** Every OTHER table `getAdminDashboardData()`'s own ten parallel queries
 *  touch is left empty here — this test's only interest is `check_ins`, and
 *  an empty array satisfies every one of the other nine (including the
 *  `.not("category_id", "is", null)` filter, which is a no-op on nothing to
 *  filter) without needing to fake a category, a proposal or a member. */
function world(checkIns: Record<string, unknown>[]) {
  state.client = memorySupabase({
    proposals: [],
    rsvps: [],
    check_ins: checkIns,
    members: [],
    points_ledger: [],
    session_presenters: [],
    sessions: [],
    reports: [],
    org_settings: [],
  });
}

beforeEach(() => world([removed]));

describe("a removed check-in is not attendance — the admin dashboard's figures", () => {
  it("does not count a removed check-in toward checkInsTotal", async () => {
    const data = await getAdminDashboardData("ar");
    expect(data?.checkInsTotal).toBe(0);
  });

  it("counts it once it is re-added, beside the removed one", async () => {
    world([removed, active]);
    const data = await getAdminDashboardData("ar");
    expect(data?.checkInsTotal).toBe(1);
  });
});

describe("a removed check-in is not attendance — the bulk attendance export", () => {
  it("excludes the removed row from the CSV entirely", async () => {
    const csv = await exportAllAttendanceCsv("ar");
    expect(csv).not.toBeNull();
    // The header row is the whole file — one removed check-in and nothing
    // else in this org, so a correctly-filtered export reports zero rows.
    expect(csv!.trim().split("\r\n")).toHaveLength(1);
  });

  it("includes the re-added one, not the removed one", async () => {
    world([removed, active]);
    const csv = await exportAllAttendanceCsv("ar");
    expect(csv).not.toBeNull();
    expect(csv!.trim().split("\r\n")).toHaveLength(2);
  });
});
