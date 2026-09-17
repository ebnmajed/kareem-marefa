// Wave 9 row L5 — the per-session attendance CSV (REQ-ADM-017, REQ-CHK-012)
// at one day and at three.
//
// ★ The first case is the one that matters: a one-day session's file has the
// six columns and the one line per member it had in wave 7, whatever the day
// cells say. `admin-exports-csv.test.ts` is left exactly as it was; this file
// is new.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn() }));
vi.mock("@/lib/dal/admin-members", () => ({ listMembersForAdmin: vi.fn() }));
vi.mock("@/lib/dal/checkin", () => ({ getAttendanceReport: vi.fn() }));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: vi.fn() }));
vi.mock("@/lib/dal/sessions", () => ({ listSessionsForAdmin: vi.fn() }));

const { attendanceSheet } = await import("@/lib/dal/admin-exports");
type Report = Parameters<typeof attendanceSheet>[0];
type Row = Report["rows"][number];
type Cell = Row["days"][number];

const TZ = "Asia/Riyadh";
const D1 = { id: "d1", position: 1, startsAt: "2026-10-07T06:00:00Z", endsAt: "2026-10-07T09:00:00Z" }; // Wednesday
const D2 = { id: "d2", position: 2, startsAt: "2026-10-08T06:00:00Z", endsAt: "2026-10-08T09:00:00Z" }; // Thursday
const D3 = { id: "d3", position: 3, startsAt: "2026-10-09T06:00:00Z", endsAt: "2026-10-09T09:00:00Z" }; // Friday

const cell = (day: typeof D1, over: Partial<Cell> = {}): Cell => ({
  dayId: day.id,
  position: day.position,
  checkedIn: false,
  arrivedAt: null,
  method: null,
  removed: false,
  removedAt: null,
  removalReason: null,
  removedByName: null,
  ...over,
});

const row = (over: Partial<Row>): Row => ({
  memberId: "m",
  displayName: "ريم",
  rsvpStatus: "confirmed",
  checkedIn: false,
  arrivedAt: null,
  method: null,
  isWalkIn: false,
  isNoShow: false,
  removed: false,
  removedAt: null,
  removalReason: null,
  removedByName: null,
  days: [],
  daysAttended: 0,
  attendanceComplete: false,
  ...over,
});

describe("attendanceSheet — one day", () => {
  it("is wave 7's file: six headers, one line per member, no day column, no completeness column", () => {
    const sheet = attendanceSheet(
      {
        timeZone: TZ,
        days: [D1],
        rows: [
          row({
            checkedIn: true,
            arrivedAt: "2026-10-07T06:05:00Z",
            method: "manual",
            days: [cell(D1, { checkedIn: true, arrivedAt: "2026-10-07T06:05:00Z", method: "manual" })],
            daysAttended: 1,
            attendanceComplete: true,
          }),
          row({ displayName: "سلمان", rsvpStatus: null, isWalkIn: true, days: [cell(D1)] }),
        ],
      },
      TZ,
    );
    expect(sheet.headers).toEqual(["الاسم", "حالة الحجز", "سجَّل حضوره", "وقت الوصول (Asia/Riyadh)", "طريقة التسجيل", "علامة يدوية"]);
    expect(sheet.rows).toEqual([
      ["ريم", "مؤكَّد", "نعم", "2026-10-07 09:05", "تسجيل يدوي", "نعم"],
      ["سلمان", "بلا حجز (حضور مباشر)", "لا", "", "", "لا"],
    ]);
  });

  it("a session with no days at all is the same six columns", () => {
    const sheet = attendanceSheet({ timeZone: TZ, days: [], rows: [row({})] }, TZ);
    expect(sheet.headers).toHaveLength(6);
    expect(sheet.rows).toEqual([["ريم", "مؤكَّد", "لا", "", "", "لا"]]);
  });
});

describe("attendanceSheet — three days", () => {
  const sheet = attendanceSheet(
    {
      timeZone: TZ,
      days: [D1, D2, D3],
      rows: [
        row({
          checkedIn: true,
          arrivedAt: "2026-10-09T06:02:00Z",
          method: "code",
          daysAttended: 2,
          attendanceComplete: false,
          days: [
            cell(D1, { checkedIn: true, arrivedAt: "2026-10-07T06:05:00Z", method: "code" }),
            // removed by the admin: the method of a check-in that no longer stands is not reported
            cell(D2, { removed: true, removedAt: "2026-10-08T08:00:00Z", method: "manual", arrivedAt: null }),
            cell(D3, { checkedIn: true, arrivedAt: "2026-10-09T06:02:00Z", method: "manual" }),
          ],
        }),
      ],
    },
    TZ,
  );

  it("adds «اليوم» after the reservation and «أكمل الحضور» last — and nothing per day", () => {
    expect(sheet.headers).toEqual([
      "الاسم",
      "حالة الحجز",
      "اليوم",
      "سجَّل حضوره",
      "وقت الوصول (Asia/Riyadh)",
      "طريقة التسجيل",
      "علامة يدوية",
      "أكمل الحضور",
    ]);
  });

  it("is one line per member per day, the day named in contract 7's words", () => {
    expect(sheet.rows).toEqual([
      ["ريم", "مؤكَّد", "اليوم الأول · الأربعاء", "نعم", "2026-10-07 09:05", "رمز الحضور", "لا", "لا"],
      ["ريم", "مؤكَّد", "اليوم الثاني · الخميس", "لا", "", "", "لا", "لا"],
      ["ريم", "مؤكَّد", "اليوم الثالث · الجمعة", "نعم", "2026-10-09 09:02", "تسجيل يدوي", "نعم", "لا"],
    ]);
  });

  it("carries no Arabic-Indic digit (DEC-124), at day eleven either", () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({
      id: `x${i + 1}`,
      position: i + 1,
      startsAt: new Date(Date.UTC(2026, 9, 1 + i, 6)).toISOString(),
      endsAt: new Date(Date.UTC(2026, 9, 1 + i, 9)).toISOString(),
    }));
    const long = attendanceSheet(
      { timeZone: TZ, days: eleven, rows: [row({ days: eleven.map((d) => cell(d)) })] },
      TZ,
    );
    expect(long.rows).toHaveLength(11);
    expect(long.rows[10][2]).toMatch(/^اليوم 11 · /);
    expect(JSON.stringify(long)).not.toMatch(/[٠-٩۰-۹]/);
  });
});
