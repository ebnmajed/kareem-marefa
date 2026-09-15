// worker/src/tasks/build_data_export.ts — 11 §2.7, REQ-PRF-006, DEC-059:
// a job whose subject is gone returns, it does not retry twenty-five times.
// A fake `helpers.query`/`helpers.logger` stands in for graphile-worker's
// own Helpers — no real Postgres.
import { describe, expect, it, vi } from "vitest";
import { build_data_export, isSubjectGone } from "../../worker/src/tasks/build_data_export";

const REQUEST = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MEMBER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

type Script = {
  request?: { status: string; member_id: string } | null;
  payloadError?: Error;
  recordError?: Error;
};

function fakeHelpers(script: Script) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("select status, member_id from public.data_export_requests")) {
      return { rows: script.request ? [script.request] : [] };
    }
    if (sql.includes("build_data_export_payload")) {
      if (script.payloadError) throw script.payloadError;
      return { rows: [{ payload: { member: { id: MEMBER } } }] };
    }
    if (sql.includes("record_data_export")) {
      if (script.recordError) throw script.recordError;
      return { rows: [] };
    }
    return { rows: [] };
  });
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { query, logger, calls };
}

const pgError = (message: string) => Object.assign(new Error(message), { code: "42501" });

describe("build_data_export — terminal handling (DEC-059)", () => {
  it("the happy path: marks building, builds the payload, records it", async () => {
    const helpers = fakeHelpers({ request: { status: "queued", member_id: MEMBER } });
    await build_data_export({ request_id: REQUEST, member_id: MEMBER }, helpers as never);
    const sqls = helpers.calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes("set status = 'building'"))).toBe(true);
    expect(sqls.some((s) => s.includes("record_data_export"))).toBe(true);
    expect(helpers.logger.info).toHaveBeenCalledWith(expect.stringContaining("is ready"));
  });

  it("★ a request row that no longer exists is skipped — a warning, no build, no throw", async () => {
    const helpers = fakeHelpers({ request: null });
    await expect(build_data_export({ request_id: REQUEST, member_id: MEMBER }, helpers as never)).resolves.toBeUndefined();
    expect(helpers.logger.warn).toHaveBeenCalledWith(expect.stringContaining("no longer exists"));
    expect(helpers.calls.some((c) => c.sql.includes("build_data_export_payload"))).toBe(false);
  });

  it("★ a member that was deleted or anonymised (member_not_found) is recorded as failed ONCE and the job returns — never rethrown", async () => {
    const helpers = fakeHelpers({ request: { status: "queued", member_id: MEMBER }, payloadError: pgError("member_not_found") });
    await expect(build_data_export({ request_id: REQUEST, member_id: MEMBER }, helpers as never)).resolves.toBeUndefined();
    const fail = helpers.calls.find((c) => c.sql.includes("fail_data_export"));
    expect(fail?.params).toEqual([REQUEST, "member_not_found"]);
    expect(helpers.logger.warn).toHaveBeenCalledWith(expect.stringContaining("will not retry"));
  });

  it("★ a request deleted between the build and the record (request_not_found) is terminal too", async () => {
    const helpers = fakeHelpers({ request: { status: "queued", member_id: MEMBER }, recordError: pgError("request_not_found") });
    await expect(build_data_export({ request_id: REQUEST, member_id: MEMBER }, helpers as never)).resolves.toBeUndefined();
    expect(helpers.calls.some((c) => c.sql.includes("fail_data_export"))).toBe(true);
  });

  it("any other failure is recorded on the row AND rethrown, so graphile-worker retries and Sentry sees it", async () => {
    const helpers = fakeHelpers({ request: { status: "queued", member_id: MEMBER }, payloadError: new Error("connection terminated unexpectedly") });
    await expect(build_data_export({ request_id: REQUEST, member_id: MEMBER }, helpers as never)).rejects.toThrow(/connection terminated/);
    const fail = helpers.calls.find((c) => c.sql.includes("fail_data_export"));
    expect(fail?.params).toEqual([REQUEST, "connection terminated unexpectedly"]);
  });

  it("a payload naming a member the request does not belong to is refused without building", async () => {
    const helpers = fakeHelpers({ request: { status: "queued", member_id: "cccccccc-cccc-cccc-cccc-cccccccccccc" } });
    await build_data_export({ request_id: REQUEST, member_id: MEMBER }, helpers as never);
    expect(helpers.logger.error).toHaveBeenCalledWith(expect.stringContaining("belongs to"));
    expect(helpers.calls.some((c) => c.sql.includes("build_data_export_payload"))).toBe(false);
  });

  it("isSubjectGone matches only the two not-found messages", () => {
    expect(isSubjectGone(pgError("member_not_found"))).toBe(true);
    expect(isSubjectGone(pgError("request_not_found"))).toBe(true);
    expect(isSubjectGone(pgError("permission denied for function build_data_export_payload"))).toBe(false);
    expect(isSubjectGone(undefined)).toBe(false);
  });
});
