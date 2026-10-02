// SCR-042's bulk «صدّر CSV» (wave 21, `DEC-228` §3.7): the sessions export by
// ids, through the same audited path (`REQ-ADM-017`). Without ids it is today's
// whole export; with ids it is the selection only; the route refuses a
// malformed list rather than widening it to everything.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn(async () => ({ data: null, error: null }));
const role = { value: "admin" };
vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { role: role.value, orgId: "org" }, supabase: { rpc } }),
}));
vi.mock("@/lib/dal/admin-members", () => ({ listMembersForAdmin: vi.fn() }));
vi.mock("@/lib/dal/checkin", () => ({ getAttendanceReport: vi.fn() }));
vi.mock("@/lib/dal/surveys", () => ({ getSurveyExportRows: vi.fn() }));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: vi.fn(async () => ({ timeZone: "Asia/Riyadh" })) }));

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";
const session = (id: string, title: string) => ({
  id,
  title,
  state: "published",
  level: "introductory",
  language: "ar",
  startsAt: "2026-10-04T14:00:00Z",
  fromProposal: false,
  presenters: [],
  createdAt: "2026-09-01T00:00:00Z",
});
vi.mock("@/lib/dal/sessions", () => ({
  listSessionsForAdmin: vi.fn(async () => (role.value === "admin" ? [session(A, "الأولى"), session(B, "الثانية"), session(C, "الثالثة")] : null)),
}));

const { exportSessionsCsv } = await import("@/lib/dal/admin-exports");
const { GET } = await import("@/app/api/admin/exports/[type]/route");

const call = (url: string, type = "sessions") => GET(new Request(url), { params: Promise.resolve({ type }) });

beforeEach(() => {
  role.value = "admin";
  rpc.mockClear();
});

describe("exportSessionsCsv — by ids", () => {
  it("without ids: every session, as before", async () => {
    const csv = (await exportSessionsCsv("ar"))!;
    expect(csv).toContain("الأولى");
    expect(csv).toContain("الثانية");
    expect(csv).toContain("الثالثة");
  });

  // ★ wave 22 (DEC-232 §2.8): the audit row now records the selection it read — `p_detail.ids` (a ledger line).
  it("with ids: the selection only, and an audit row that records the selection", async () => {
    const csv = (await exportSessionsCsv("ar", [A, C]))!;
    expect(csv).toContain("الأولى");
    expect(csv).not.toContain("الثانية");
    expect(csv).toContain("الثالثة");
    expect(rpc).toHaveBeenCalledWith("write_admin_export_audit", { p_export_type: "sessions", p_subject_type: null, p_subject_id: null, p_detail: { ids: [A, C] } });
  });

  it("without ids, the audit call is exactly main's — no slice", async () => {
    await exportSessionsCsv("ar");
    expect(rpc).toHaveBeenCalledWith("write_admin_export_audit", { p_export_type: "sessions", p_subject_type: null, p_subject_id: null });
  });

  it("an id outside the org selects nothing — it never widens", async () => {
    const csv = (await exportSessionsCsv("ar", ["00000000-0000-4000-8000-0000000000ff"]))!;
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(1); // the header alone
  });
});

describe("GET /api/admin/exports/sessions?ids=", () => {
  it("narrows to the ids", async () => {
    const res = await call(`http://x/api/admin/exports/sessions?ids=${A},${B}`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("الثانية");
    expect(body).not.toContain("الثالثة");
  });

  it("refuses a malformed list with 400 and writes no audit row", async () => {
    const res = await call("http://x/api/admin/exports/sessions?ids=not-a-uuid");
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers a moderator with 404, as before", async () => {
    role.value = "moderator";
    const res = await call(`http://x/api/admin/exports/sessions?ids=${A}`);
    expect(res.status).toBe(404);
  });
});
