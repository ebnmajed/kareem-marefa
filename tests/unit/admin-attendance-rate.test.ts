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

const { getAdminDashboardData } = await import("@/lib/dal/admin-dashboard");
const { attendanceRate } = await import("@/components/checkin/attendance-rate");
const { getAttendanceReport } = await import("@/lib/dal/checkin");

describe("one attendance rate — the dashboard's is checkin's", () => {
  it("both readers give 1 / 3 from the same fixture, and it is the shared function's: the walk-in, the removed check-in and the waitlist are outside it", async () => {
    const [dashboard, report] = await Promise.all([getAdminDashboardData("ar"), getAttendanceReport("ar", SESSION)]);
    // ★ Since PR B, the dashboard computes it THROUGH `attendanceRate()` (`DEC-228` §3.4): one definition in code.
    const shared = attendanceRate([`${SESSION}:${m(1)}`, `${SESSION}:${m(2)}`, `${SESSION}:${m(3)}`], [`${SESSION}:${m(1)}`, `${SESSION}:${m(5)}`]);
    expect(shared).toEqual({ confirmed: 3, attended: 1, outsideConfirmed: 1, rate: 1 / 3 });
    expect(report?.attendanceRate).toBeCloseTo(1 / 3);
    expect(dashboard?.attendanceRate).toBe(shared.rate);
    expect(dashboard?.attendanceRate).toBe(report?.attendanceRate);
  });

  it("never passes 100 %: walk-ins sit beside the rate, never inside it", () => {
    const r = attendanceRate(["s:a"], ["s:a", "s:walk-in-1", "s:walk-in-2"]);
    expect(r.rate).toBe(1);
    expect(r.outsideConfirmed).toBe(2);
  });

  it("is null when nothing has a confirmed reservation", () => {
    expect(attendanceRate([], ["s:a"]).rate).toBeNull();
  });
});
