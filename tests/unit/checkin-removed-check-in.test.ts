// A REMOVED check-in is not attendance (REQ-CHK-017, migration 0087). An
// admin's removal soft-deletes the row — `check_ins.removed_at` is set and
// the row stays, for `certificates.check_in_id` and the audit trail — and
// RLS does NOT hide it. So every reader in `checkin`'s own DAL that asks
// "did this member check in" must say `removed_at is null` itself, the
// same bug and the same fix `sessions` found in its own DAL
// (tests/unit/sessions-removed-check-in.test.ts, which this mirrors) —
// found post-promotion (7b2ac81), not caught by the RLS suite because RLS
// was never the boundary here.
//
// Readers proven here, each with a case that would have read the removed
// row before the `.is("removed_at", null)` fix landed:
//   · getAttendanceReport()             — SCR-044's own list and counts
//   · listUncheckedConfirmedRsvps()     — the host view's manual-mark candidates
//   · listUncheckedForAdminManualMark() — SCR-044's own candidates
//   · getRsvpPanelData()                — «حضرت»/«لم تُسجّل حضورك» on the event page
//
// `getHostView()`'s live count and `getCheckInScreenData()`'s own-check-in
// read use the identical `.eq(...).is("removed_at", null)` shape — not
// independently asserted here (the shared `memorySupabase` stub has no
// `count`/`head` support, and `getCheckInScreenData()`'s `relation` only
// branches on `checkedIn` once phase is `ended`, where check-in is refused
// either way) — the fix is the same one-clause change, mechanically.
//
// ★ REQ-CHK-017/C3 (this wave): `getAttendanceReport()`'s own read went
// further than the stopgap above — it no longer filters removed rows out of
// its query at all, and shows one with its reason and remover instead of
// reading exactly like "never checked in". Those cases are below, in the
// same describe block the stopgap's own cases live in.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memorySupabase } from "./sessions-memory-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));

const ORG = "00000000-0000-4000-8000-0000000000aa";
const ME = "00000000-0000-4000-8000-0000000000bb";
const ADMIN = "00000000-0000-4000-8000-0000000000dd";
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const RSVP_SESSION = "00000000-0000-4000-8000-0000000000ee";

const state: { client: ReturnType<typeof memorySupabase>; role: "member" | "admin" | "moderator" } = {
  client: memorySupabase({}),
  role: "admin",
};

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: ME, orgId: ORG, role: state.role }, supabase: state.client }),
}));

const { getAttendanceReport, listUncheckedConfirmedRsvps, listUncheckedForAdminManualMark } = await import("@/lib/dal/checkin");
const { getRsvpPanelData } = await import("@/lib/dal/rsvp");

const removed = {
  id: "ci-removed",
  org_id: ORG,
  session_id: SESSION,
  member_id: ME,
  removed_at: "2026-09-16T10:00:00Z",
  removed_by: ADMIN,
  removal_reason: "خطأ في تسجيل الحضور",
  arrived_at: "2026-09-15T10:00:00Z",
  method: "code",
  members: { display_name: "يمان رضا" },
  remover: { display_name: "مشرف الاختبار" },
};
const active = { id: "ci-active", org_id: ORG, session_id: SESSION, member_id: ME, removed_at: null, arrived_at: "2026-09-16T11:00:00Z", method: "manual", members: { display_name: "يمان رضا" } };

function worldFor(checkIns: Record<string, unknown>[]) {
  state.client = memorySupabase({
    sessions: [{ id: SESSION, title: "جلسة اختبار", state: "in_progress" }],
    rsvps: [{ org_id: ORG, session_id: SESSION, member_id: ME, status: "confirmed", members: { display_name: "يمان رضا" } }],
    check_ins: checkIns,
  });
}

describe("a removed check-in is not attendance — SCR-044's report", () => {
  beforeEach(() => worldFor([removed]));

  it("reads the member as NOT checked in — a no-show, not an attendee", async () => {
    const report = await getAttendanceReport("ar", SESSION);
    const row = report?.rows.find((r) => r.memberId === ME);
    expect(row?.checkedIn).toBe(false);
    expect(row?.isNoShow).toBe(true);
    expect(report?.counts.checkedIn).toBe(0);
  });

  it("reads them as checked in once re-added, beside the removed row", async () => {
    worldFor([removed, active]);
    const report = await getAttendanceReport("ar", SESSION);
    const row = report?.rows.find((r) => r.memberId === ME);
    expect(row?.checkedIn).toBe(true);
    expect(row?.method).toBe("manual");
    // ★ REQ-CHK-017/C3: the ACTIVE row wins for display, but that does not
    // erase the removal that happened first — this member's row shows
    // "currently checked in", not "was once removed".
    expect(row?.removed).toBe(false);
  });

  // ★ REQ-CHK-017/C3 — the report's own redesign: a removed-and-never-
  // re-added row is shown WITH its reason and who removed it, not silently
  // folded into "never checked in" (the earlier stopgap's own behaviour).
  it("★ shows the removal itself — reason and remover, when it was never re-added", async () => {
    const report = await getAttendanceReport("ar", SESSION);
    const row = report?.rows.find((r) => r.memberId === ME);
    expect(row?.removed).toBe(true);
    expect(row?.removedAt).toBe(removed.removed_at);
    expect(row?.removalReason).toBe(removed.removal_reason);
    expect(row?.removedByName).toBe("مشرف الاختبار");
  });

  it("a re-added member's row carries no removal fields — the active row is the whole truth shown", async () => {
    worldFor([removed, active]);
    const report = await getAttendanceReport("ar", SESSION);
    const row = report?.rows.find((r) => r.memberId === ME);
    expect(row?.removedAt).toBeNull();
    expect(row?.removalReason).toBeNull();
    expect(row?.removedByName).toBeNull();
  });
});

describe("a removed check-in is not attendance — the manual-mark candidate lists", () => {
  beforeEach(() => worldFor([removed]));

  it("listUncheckedConfirmedRsvps() offers the member again — they are not already checked in", async () => {
    const candidates = await listUncheckedConfirmedRsvps("ar", SESSION);
    expect(candidates.map((c) => c.memberId)).toContain(ME);
  });

  it("listUncheckedForAdminManualMark() offers them too", async () => {
    state.role = "admin";
    const candidates = await listUncheckedForAdminManualMark("ar", SESSION);
    expect(candidates.map((c) => c.memberId)).toContain(ME);
  });

  it("neither offers them once re-added", async () => {
    worldFor([removed, active]);
    const a = await listUncheckedConfirmedRsvps("ar", SESSION);
    const b = await listUncheckedForAdminManualMark("ar", SESSION);
    expect(a.map((c) => c.memberId)).not.toContain(ME);
    expect(b.map((c) => c.memberId)).not.toContain(ME);
  });
});

describe("a removed check-in is not attendance — «حضرت» on the event page", () => {
  function worldRsvpFor(checkIns: Record<string, unknown>[]) {
    state.client = memorySupabase(
      {
        sessions: [
          {
            id: RSVP_SESSION,
            state: "completed",
            starts_at: "2026-09-10T15:00:00Z",
            ends_at: "2026-09-10T16:00:00Z",
            duration_minutes: 60,
            capacity: 30,
            rsvp_deadline_at: null,
            cancellation_cutoff_at: null,
          },
        ],
        rsvps: [{ org_id: ORG, session_id: RSVP_SESSION, member_id: ME, status: "confirmed", waitlist_position: null }],
        session_presenters: [],
        check_ins: checkIns,
      },
      { session_seat_counts: { confirmed_count: 12, waitlist_count: 0 } },
    );
  }

  it("reads the viewer of an ended session whose only check-in was removed as absent, not attended", async () => {
    worldRsvpFor([{ ...removed, session_id: RSVP_SESSION }]);
    const data = await getRsvpPanelData("ar", RSVP_SESSION);
    expect(data?.relation).toBe("absent");
  });

  it("reads a re-added check-in as attended", async () => {
    worldRsvpFor([{ ...removed, session_id: RSVP_SESSION }, { ...active, session_id: RSVP_SESSION }]);
    const data = await getRsvpPanelData("ar", RSVP_SESSION);
    expect(data?.relation).toBe("attended");
  });
});
