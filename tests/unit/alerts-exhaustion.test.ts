// `job_exhausted` in the worker — wave 11, REQ-NFR-016, 11 §3.2.
//
// Two properties the SQL half (tests/rls/alerts-exhausted.test.ts) cannot show:
// 1. the sink ESCALATES this alert — it holds until every dead job is resolved,
//    so a second job dying while it is open must fire again, where the eight
//    of 11 §3.2 fire once;
// 2. the task reads the ninth AFTER the eight reach the sink, so a missing
//    function never masks them, and it logs task names and counts only.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALERTS,
  EdgeTriggered,
  ESCALATE,
  EXHAUSTION_ALERT,
  MemoryAlertSink,
  type AlertReading,
} from "../../worker/src/platform/alerts";

const dead = (n: number, byTask: Record<string, number> = { record_survey_response: n }): AlertReading => ({
  alert: EXHAUSTION_ALERT,
  fired: n > 0,
  detail: { exhausted_jobs: n, tasks: Object.keys(byTask).length, by_task: byTask },
});

describe("the sink escalates job_exhausted", () => {
  it("fires on the first dead job, stays quiet while the count holds or falls, fires again when it rises", () => {
    const memory = new MemoryAlertSink();
    const sink = new EdgeTriggered(memory, ESCALATE);

    sink.apply([dead(1)]);
    sink.apply([dead(1)]);
    sink.apply([dead(1)]);
    expect(memory.firedAlerts()).toEqual([EXHAUSTION_ALERT]);

    // A second task dies days later — the alert is still open, and says so again.
    sink.apply([dead(2, { record_survey_response: 1, issue_certificates: 1 })]);
    expect(memory.firedAlerts()).toEqual([EXHAUSTION_ALERT, EXHAUSTION_ALERT]);
    expect(memory.events.at(-1)?.detail).toEqual({
      exhausted_jobs: 2,
      tasks: 2,
      by_task: { record_survey_response: 1, issue_certificates: 1 },
    });

    // One resolved: falling is progress, not news.
    sink.apply([dead(1, { issue_certificates: 1 })]);
    expect(memory.firedAlerts()).toHaveLength(2);
    expect(memory.clearedAlerts()).toEqual([]);

    // All resolved: one clear.
    sink.apply([dead(0, {})]);
    sink.apply([dead(0, {})]);
    expect(memory.clearedAlerts()).toEqual([EXHAUSTION_ALERT]);

    // A new loss after clearing fires from scratch, even at a count seen before.
    sink.apply([dead(1)]);
    expect(memory.firedAlerts()).toHaveLength(3);
  });

  it("a rise after a fall re-fires only above the count it last fired at", () => {
    const memory = new MemoryAlertSink();
    const sink = new EdgeTriggered(memory, ESCALATE);
    sink.apply([dead(3)]);
    sink.apply([dead(1)]);
    sink.apply([dead(3)]);
    expect(memory.firedAlerts()).toHaveLength(1);
    sink.apply([dead(4)]);
    expect(memory.firedAlerts()).toHaveLength(2);
  });

  it("a worker restart re-fires an open job_exhausted once, like the eight", () => {
    const first = new MemoryAlertSink();
    new EdgeTriggered(first, ESCALATE).apply([dead(2)]);
    const second = new MemoryAlertSink();
    const b = new EdgeTriggered(second, ESCALATE);
    b.apply([dead(2)]);
    b.apply([dead(2)]);
    expect(second.firedAlerts()).toEqual([EXHAUSTION_ALERT]);
  });

  it("escalation is per alert: the eight still fire once, whatever their counts do", () => {
    const memory = new MemoryAlertSink();
    const sink = new EdgeTriggered(memory, ESCALATE);
    for (const n of [1, 2, 3, 4]) sink.apply([{ alert: "ledger_divergence", fired: true, detail: { divergences_24h: n } }]);
    expect(memory.firedAlerts()).toEqual(["ledger_divergence"]);
    expect(ALERTS).not.toContain(EXHAUSTION_ALERT);
  });
});

// ── The task ─────────────────────────────────────────────────────────────

type Query = (sql: string) => Promise<{ rows: AlertReading[] }>;

function helpers(query: Query) {
  return {
    query: vi.fn(query),
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
}

const eight = (): AlertReading[] => ALERTS.map((alert) => ({ alert, fired: false, detail: { n: 0 } }));

async function loadTask() {
  // The task's sink is module-level (it must outlive one invocation); a fresh
  // module per case gives each case a fresh memory.
  vi.resetModules();
  return (await import("../../worker/src/tasks/evaluate_alerts")).evaluate_alerts;
}

describe("JOB-evaluate_alerts reads job_exhausted", () => {
  let errors: string[];
  beforeEach(() => {
    errors = [];
    vi.spyOn(console, "error").mockImplementation((line: string) => void errors.push(line));
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("reads the eight first, then evaluate_job_exhaustion(), and fires with task names and counts only", async () => {
    const task = await loadTask();
    const sql: string[] = [];
    const h = helpers(async (q) => {
      sql.push(q);
      return { rows: q.includes("evaluate_job_exhaustion") ? [dead(1)] : eight() };
    });
    await task({}, h as never);

    expect(sql).toHaveLength(2);
    expect(sql[0]).toContain("public.evaluate_alerts()");
    expect(sql[1]).toContain("public.evaluate_job_exhaustion()");
    expect(errors).toEqual([
      `ALERT FIRED job_exhausted {"exhausted_jobs":1,"tasks":1,"by_task":{"record_survey_response":1}}`,
    ]);
    expect(h.logger.warn).toHaveBeenCalledWith("evaluate_alerts: open — job_exhausted");
  });

  it("a missing evaluate_job_exhaustion() cannot mask the eight: they reach the sink before the task throws", async () => {
    const task = await loadTask();
    const firing = eight().map((r) => (r.alert === "storage_prefix_violation" ? { ...r, fired: true } : r));
    const h = helpers(async (q) => {
      if (q.includes("evaluate_job_exhaustion")) throw new Error("function public.evaluate_job_exhaustion() does not exist");
      return { rows: firing };
    });
    await expect(task({}, h as never)).rejects.toThrow(/evaluate_job_exhaustion/);
    expect(errors).toEqual([`ALERT FIRED storage_prefix_violation {"n":0}`]);
  });

  it("an empty reading is a failure, not health", async () => {
    const task = await loadTask();
    const h = helpers(async (q) => ({ rows: q.includes("evaluate_job_exhaustion") ? [] : eight() }));
    await expect(task({}, h as never)).rejects.toThrow(/no reading for job_exhausted/);
  });
});
