// SCR-061's CSVs (REQ-ADM-017) — the two formats a spreadsheet reads.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn() }));
vi.mock("@/lib/dal/admin-members", () => ({ listMembersForAdmin: vi.fn() }));
vi.mock("@/lib/dal/checkin", () => ({ getAttendanceReport: vi.fn() }));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: vi.fn() }));
vi.mock("@/lib/dal/sessions", () => ({ listSessionsForAdmin: vi.fn() }));

const { buildCsv, csvDateTime } = await import("@/lib/dal/admin-exports");

describe("csvDateTime — a date a spreadsheet sorts, on the org's clock", () => {
  it("is YYYY-MM-DD HH:mm in the org's zone, 24-hour, Western digits", () => {
    expect(csvDateTime("2026-09-17T12:05:00Z", "Asia/Riyadh")).toBe("2026-09-17 15:05");
    expect(csvDateTime("2026-09-17T22:30:00Z", "Asia/Riyadh")).toBe("2026-09-18 01:30");
    expect(csvDateTime("2026-01-05T00:00:00Z", "UTC")).toBe("2026-01-05 00:00");
  });
});

describe("buildCsv", () => {
  it("opens with a BOM, ends each record with CRLF, and quotes what needs quoting", () => {
    const csv = buildCsv(["الاسم", "السبب"], [["ريم", 'قالت "نعم", ثم غادرت']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('الاسم,السبب\r\nريم,"قالت ""نعم"", ثم غادرت"\r\n');
  });
});
