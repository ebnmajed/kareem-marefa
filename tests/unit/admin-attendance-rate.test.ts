// ★ One attendance rate, everywhere (`DEC-228` §3.4): the dashboard's figure
// (SCR-040) and `checkin`'s session report (SCR-044) are the same definition —
// members checked in WHO HELD a confirmed reservation, over confirmed
// reservations; a walk-in is never inside it, a removed check-in is not
// attendance, a waitlisted member is not a seat. Both are computed here from
// ONE fixture, through each module's real reader, so the two cannot drift.
import { describe, expect, it, vi } from "vitest";
import { memorySupabase } from "./sessions-memory-supabase";

vi.mock("server-only", () => ({}));

const ORG = "00000000-0000-4000-8000-0000000000aa";
const ADMIN = "00000000-0000-4000-8000-0000000000dd";
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const m = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;

const startedAt = new Date().toISOString(); // a session of this month that has started

const client = memorySupabase(
  {
    sessions: [
      { org_id: ORG, id: SESSION, title: "جلسة القياس", state: "completed", starts_at: startedAt, ends_at: startedAt, time_zone: "Asia/Riyadh", require_all_days: true, category_id: null },
    ],
    rsvps: [
      { org_id: ORG, session_id: SESSION, member_id: m(1), status: "confirmed", members: { display_name: "أ" } },
      { org_id: ORG, session_id: SESSION, member_id: m(2), status: "confirmed", members: { display_name: "ب" } },
      { org_id: ORG, session_id: SESSION, member_id: m(3), status: "confirmed", members: { display_name: "ج" } },
      { org_id: ORG, session_id: SESSION, member_id: m(4), status: "waitlisted", members: { display_name: "د" } },
    ],
    check_ins: [
      // m1 came; m2's check-in was removed; m5 walked in with no reservation.
      { org_id: ORG, session_id: SESSION, member_id: m(1), arrived_at: startedAt, method: "code", removed_at: null },
      { org_id: ORG, session_id: SESSION, member_id: m(2), arrived_at: startedAt, method: "code", removed_at: startedAt },
      { org_id: ORG, session_id: SESSION, member_id: m(5), arrived_at: startedAt, method: "manual", removed_at: null },
    ],
    proposals: [],
    members: [],
    points_ledger: [],
    session_presenters: [],
    session_days: [],
    reports: [],
    org_settings: [],
  },
  { session_complete_attendees: [] },
);

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: ADMIN, orgId: ORG, role: "admin" }, supabase: client }),
}));

const { getAdminDashboardData, attendanceRateOf } = await import("@/lib/dal/admin-dashboard");
const { getAttendanceReport } = await import("@/lib/dal/checkin");

describe("one attendance rate — the dashboard's is checkin's", () => {
  it("both readers give 1 / 3 from the same fixture: the walk-in, the removed check-in and the waitlist are outside it", async () => {
    const [dashboard, report] = await Promise.all([getAdminDashboardData("ar"), getAttendanceReport("ar", SESSION)]);
    expect(report?.attendanceRate).toBeCloseTo(1 / 3);
    expect(dashboard?.attendanceRate).toBeCloseTo(1 / 3);
    expect(dashboard?.attendanceRate).toBe(report?.attendanceRate);
  });

  it("never passes 100 %: more check-ins than reservations still divides attendees-with-a-seat by seats", () => {
    const confirmed = [{ session_id: "s", member_id: "a" }];
    const checkedIn = [
      { session_id: "s", member_id: "a" },
      { session_id: "s", member_id: "walk-in-1" },
      { session_id: "s", member_id: "walk-in-2" },
    ];
    expect(attendanceRateOf(confirmed, checkedIn)).toBe(1);
  });

  it("is null when nothing has a confirmed reservation", () => {
    expect(attendanceRateOf([], [{ session_id: "s", member_id: "a" }])).toBeNull();
  });
});
