// `buildCsv()` and a cell a spreadsheet would EXECUTE (REQ-ADM-017, REQ-SUR-008;
// DEC-160 contract 6). New with wave 10: the survey's export is the first to
// put text a member typed into an admin's spreadsheet, and the guard lives in
// the one builder every export shares. `admin-exports-csv.test.ts` is
// untouched and still green — a value that opens with none of these
// characters leaves the builder byte for byte as it did.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn() }));
vi.mock("@/lib/dal/admin-members", () => ({ listMembersForAdmin: vi.fn() }));
vi.mock("@/lib/dal/checkin", () => ({ getAttendanceReport: vi.fn() }));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: vi.fn() }));
vi.mock("@/lib/dal/sessions", () => ({ listSessionsForAdmin: vi.fn() }));
vi.mock("@/lib/dal/surveys", () => ({ getSurveyExportRows: vi.fn() }));

const { buildCsv } = await import("@/lib/dal/admin-exports");

const body = (rows: string[][]) => buildCsv(["ق"], rows).slice(1).split("\r\n").slice(1, -1);

describe("buildCsv — a member's text never runs in an admin's spreadsheet", () => {
  it.each([
    ["=HYPERLINK(\"http://x\",\"اضغط\")", "\"'=HYPERLINK(\"\"http://x\"\",\"\"اضغط\"\")\""],
    ["+cmd|' /C calc'!A0", "'+cmd|' /C calc'!A0"],
    ["-2+3+cmd", "'-2+3+cmd"],
    ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["\t=1+1", "'\t=1+1"],
  ])("neutralises %j", (input, expected) => {
    expect(body([[input]])).toEqual([expected]);
  });

  it("a carriage return in front does not hide the formula — the cell is both neutralised and quoted", () => {
    expect(buildCsv(["ق"], [["\r=1+1"]]).slice(1)).toBe("ق\r\n\"'\r=1+1\"\r\n");
  });

  it("a number keeps its sign, so a points column still sums", () => {
    expect(body([["-5"], ["+12"], ["-0.5"], ["42"]])).toEqual(["-5", "+12", "-0.5", "42"]);
  });

  it("leaves ordinary Arabic, a date and an inner sign alone", () => {
    expect(body([["كانت الجلسة ممتازة"], ["2026-09-17 15:05"], ["أ = ب"], ["مقياس 1–5"]])).toEqual([
      "كانت الجلسة ممتازة",
      "2026-09-17 15:05",
      "أ = ب",
      "مقياس 1–5",
    ]);
  });
});
