import type { Task } from "graphile-worker";
import { ALERTS, ConsoleAlertSink, EdgeTriggered, type AlertReading } from "../platform/alerts.js";

// JOB-evaluate_alerts (11 §3.2, REQ-NFR-016, `14` M8's third demonstrable).
// Every minute, key `alerts:{minute}`.
//
// ★ It evaluates ALL EIGHT alerts every run and hands each current state to
// the sink; the sink turns that into edges. See worker/src/platform/alerts.ts
// for why "fires once" is the sink's property and not a table's.
//
// The sink is module-level on purpose: its open-alert set has to outlive one
// task invocation, since graphile-worker calls this function afresh every
// minute. A worker restart empties it and every open alert re-fires once,
// which is the correct behaviour for a process that just lost its memory.
//
// Nothing here talks to a network. The lead swaps `ConsoleAlertSink` for a
// Sentry one behind the same interface at Launch.
const sink = new EdgeTriggered(new ConsoleAlertSink());

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
  if (sink.openAlerts.length > 0) {
    helpers.logger.warn(`evaluate_alerts: open — ${sink.openAlerts.join(", ")}`);
  }
};
