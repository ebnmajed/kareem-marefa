// ★ Wave 22 (REQ-UIX-105, DEC-232 §3 row 7) — the defect DEC-208's table found on SCR-064.
//
// `survey_results()` refuses the session's presenter — an admin who presented included — and another org's
// session, and `getSurveyResults()` THROWS both. The tab rendered the error boundary for them, while its comment
// promised `notFound()`; the e2e covered only a plain member, who is refused earlier. These pin the one «nothing
// here», the database's actual error strings fed in, and that the header's CSV never throws inside the layout.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
let role = "admin";
vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { orgId: "org", memberId: "me", role }, supabase: { rpc } }),
}));

const { getSurveyResultsOrNull, offersSurveyExport } = await import("@/lib/dal/surveys");

const SESSION = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  rpc.mockReset();
  role = "admin";
});

describe("getSurveyResultsOrNull", () => {
  it("★ an admin who presented the session is `null` — the page's notFound(), not the error boundary", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not_authorized" } });
    expect(await getSurveyResultsOrNull("ar", SESSION)).toBeNull();
  });

  it("★ another org's session, or none, is the same `null`", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not_found" } });
    expect(await getSurveyResultsOrNull("ar", SESSION)).toBeNull();
  });

  it("a member never reaches the function at all", async () => {
    role = "member";
    expect(await getSurveyResultsOrNull("ar", SESSION)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("anything else still throws — an outage is not «nothing here»", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } });
    await expect(getSurveyResultsOrNull("ar", SESSION)).rejects.toThrow();
  });

  it("a malformed id asks nothing", async () => {
    expect(await getSurveyResultsOrNull("ar", "not-a-uuid")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("offersSurveyExport — the header's «CSV»", () => {
  it("an admin, with a survey attached", async () => {
    rpc.mockResolvedValue({ data: { status: "withheld", min: 3, eligible_count: 4 }, error: null });
    expect(await offersSurveyExport("ar", SESSION)).toBe(true);
  });

  it("no survey, no link", async () => {
    rpc.mockResolvedValue({ data: { status: "no_survey" }, error: null });
    expect(await offersSurveyExport("ar", SESSION)).toBe(false);
  });

  it("★ a moderator gets no link — the export is an admin's, and the route answers a moderator as a stranger", async () => {
    role = "moderator";
    expect(await offersSurveyExport("ar", SESSION)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("★ it never throws: it renders inside the hub's layout", async () => {
    rpc.mockRejectedValue(new Error("boom"));
    expect(await offersSurveyExport("ar", SESSION)).toBe(false);
  });
});
