// worker/src/tasks/rotate_codes.ts — JOB-rotate_check_in_code on the day
// (REQ-CHK-002, DEC-119, DEC-151 named difference 1). A fake
// `helpers.query`/`helpers.logger` standing in for graphile-worker's own
// Helpers; no real Postgres.
//
// What this guards is narrow and worth having: a three-day workshop is
// `in_progress` for three days AND TWO NIGHTS, because `sessions.ends_at` is
// the stored shadow of the last day's end. A session-shaped query would mint a
// code every rotation through those nights, for a room nobody is in.
import { describe, expect, it, vi } from "vitest";
import { rotate_codes } from "../../worker/src/tasks/rotate_codes";

type Row = { session_id: string; day_id: string };

function helpersWith(rows: Row[]) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const info = vi.fn<(message: string) => void>();
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return { rows: sql.includes("session_days") ? rows : [] };
  });
  // graphile-worker's Helpers carries more than this task touches; the cast is
  // the same one worker-tasks.test.ts uses for the same reason.
  return { helpers: { query, logger: { info } } as never, calls, info };
}

const run = async (rows: Row[]) => {
  const h = helpersWith(rows);
  await rotate_codes({}, h.helpers);
  return h;
};

describe("rotate_codes rotates DAYS taking attendance, not sessions that are in_progress", () => {
  it("selects from session_days inside the day's own window", async () => {
    const { calls } = await run([]);
    const select = calls[0].sql;
    expect(select).toContain("public.session_days");
    expect(select).toContain("s.state = 'in_progress'");
    expect(select).toContain("now() >= d.starts_at");
  });

  it("★ reads the ceiling from the lead's one function and never copies the cap", async () => {
    const { calls } = await run([]);
    const select = calls[0].sql;
    expect(select).toContain("public.check_in_ceiling(d.id)");
    // A hand-rolled `ends_at + interval '2 hours'` here would be a second
    // definition of the ceiling, and would miss DEC-151's cap at the next
    // day's start — so a morning meeting would keep minting through the
    // afternoon one.
    expect(select).not.toContain("2 hours");
    expect(select).not.toContain("interval");
  });

  it("rotates once per day, passing BOTH the session and the day", async () => {
    const rows = [
      { session_id: "s1", day_id: "d1" },
      { session_id: "s1", day_id: "d2" },
      { session_id: "s2", day_id: "d9" },
    ];
    const { calls, info } = await run(rows);
    const rotations = calls.filter((c) => c.sql.includes("rotate_check_in_code"));
    expect(rotations).toHaveLength(3);
    expect(rotations.map((c) => c.params)).toEqual([
      ["s1", "d1"],
      ["s1", "d2"],
      ["s2", "d9"],
    ]);
    expect(info).toHaveBeenCalledWith("rotate_codes: checked 3 day(s) taking attendance");
  });

  it("mints nothing through the night: no day inside its window, no rotation at all", async () => {
    const { calls, info } = await run([]);
    expect(calls.filter((c) => c.sql.includes("rotate_check_in_code"))).toHaveLength(0);
    expect(info).toHaveBeenCalledWith("rotate_codes: checked 0 day(s) taking attendance");
  });
});
