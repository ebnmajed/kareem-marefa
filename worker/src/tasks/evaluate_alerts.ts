import type { Task } from "graphile-worker";
import { ALERTS, ConsoleAlertSink, EdgeTriggered, ESCALATE, EXHAUSTION_ALERT, type AlertReading } from "../platform/alerts.js";

// JOB-evaluate_alerts (11 §3.2, REQ-NFR-016, `14` M8's third demonstrable).
// Every minute, key `alerts:{minute}`.
//
// ★ It evaluates ALL EIGHT alerts every run and hands each current state to
// the sink; the sink turns that into edges.
// Since wave 11 it also reads the ninth, `job_exhausted`, from its own
// function — a job that has used its last attempt, which `queue_stalled`
// excludes by design — and the sink escalates it when a new job dies. See worker/src/platform/alerts.ts
// for why "fires once" is the sink's property and not a table's.
//
// The sink is module-level on purpose: its open-alert set has to outlive one
// task invocation, since graphile-worker calls this function afresh every
// minute. A worker restart empties it and every open alert re-fires once,
// which is the correct behaviour for a process that just lost its memory.
//
// Nothing here talks to a network. The lead swaps `ConsoleAlertSink` for a
// Sentry one behind the same interface at Launch.
const sink = new EdgeTriggered(new ConsoleAlertSink(), ESCALATE);

export const evaluate_alerts: Task = async (_payload, helpers) => {
  const { rows } = await helpers.query<AlertReading>(`select alert, fired, detail from public.evaluate_alerts()`);

  // A missing alert is a silence that looks like health, so it is a failure
  // instead: `11` §3.2 names eight, and eight is what must come back.
  const seen = new Set(rows.map((r) => r.alert));
  const missing = ALERTS.filter((a) => !seen.has(a));
  if (missing.length > 0) {
    throw new Error(`evaluate_alerts: public.evaluate_alerts() returned no reading for ${missing.join(", ")}`);
  }

  sink.apply(rows);

  // The ninth (wave 11): a job with no attempts left. Read AFTER the eight
  // reach the sink, so a missing function can never mask them. Task names and
  // counts only — the function never reads a payload, a key or an error.
  const { rows: exhausted } = await helpers.query<AlertReading>(
    `select alert, fired, detail from public.evaluate_job_exhaustion()`,
  );
  if (exhausted.length !== 1 || exhausted[0].alert !== EXHAUSTION_ALERT) {
    throw new Error(`evaluate_alerts: public.evaluate_job_exhaustion() returned no reading for ${EXHAUSTION_ALERT}`);
  }
  sink.apply(exhausted);
  if (sink.openAlerts.length > 0) {
    helpers.logger.warn(`evaluate_alerts: open — ${sink.openAlerts.join(", ")}`);
  }
};
