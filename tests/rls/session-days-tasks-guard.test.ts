// REQ-TSK-002, enforced rather than remembered (DEC-150, contract 10).
//
// «Tasks stay reminder-only and are NEVER read by any check-in path.» Until
// wave 9 that held by distance: tasks hung off the session, attendance off the
// session, and nothing put them side by side. 0100 gives `session_tasks` a
// `session_day_id` — the same day a check-in belongs to — so for the first time
// «has this member done the day's tasks?» is one join away from «may this
// member check in?». DEC-120 names this exactly: it is the invariant a later
// reader assumes away. This file is what stops them.
//
// The TypeScript half — the check-in import graph — is
// tests/unit/tasks-never-read-by-check-in.test.ts.
import { afterAll, describe, expect, it } from "vitest";
import { pool } from "./db";

afterAll(() => pool.end());

const TASK_TABLES = "session_tasks|task_completions|task_form_responses";
// Anything that records, gates, counts or rewards attendance.
const CHECK_IN_PATH = "check_in|checked_in|attendance|session_day";

describe("REQ-TSK-002 — nothing on a check-in path reads a task", () => {
  it("no function names both a task table and anything of check-in, attendance or the day", async () => {
    const { rows } = await pool.query<{ proname: string }>(
      `select p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind in ('f', 'p')
          and p.prosrc ~ $1 and p.prosrc ~ $2
        order by 1`,
      [TASK_TABLES, CHECK_IN_PATH],
    );
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it("no policy on a check-in table, and no policy on session_days, names a task table", async () => {
    const { rows } = await pool.query<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
        where schemaname = 'public'
          and tablename in ('check_ins', 'check_in_codes', 'check_in_attempts', 'session_days', 'rsvps')
          and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ $1`,
      [TASK_TABLES],
    );
    expect(rows).toEqual([]);
  });

  it("no trigger on a task table runs a function that touches check-in, and none on a check-in table touches a task", async () => {
    const { rows } = await pool.query<{ relname: string; tgname: string }>(
      `select c.relname, t.tgname
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid and c.relnamespace = 'public'::regnamespace
         join pg_proc p on p.oid = t.tgfoid
        where not t.tgisinternal
          and ( (c.relname in ('session_tasks', 'task_completions', 'task_form_responses') and p.prosrc ~ $2)
             or (c.relname in ('check_ins', 'check_in_codes', 'check_in_attempts') and p.prosrc ~ $1) )`,
      [TASK_TABLES, "check_in|checked_in|attendance"],
    );
    expect(rows).toEqual([]);
  });

  it("the guard is not vacuous: the three task tables and the three check-in tables exist, and a day column sits on session_tasks", async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'session_day_id' order by 1`,
    );
    const withDay = rows.map((r) => r.table_name);
    expect(withDay).toEqual(expect.arrayContaining(["check_ins", "check_in_codes", "check_in_attempts", "session_tasks"]));
    const t = await pool.query(`select 1 from pg_tables where schemaname = 'public' and tablename in ('task_completions', 'task_form_responses')`);
    expect(t.rowCount).toBe(2);
  });
});
