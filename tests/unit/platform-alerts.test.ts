// The alert sink's transition logic — `11` §3.2, `REQ-NFR-016`.
//
// The SQL half of the drill lives in tests/rls/platform-alerts.test.ts: eight
// conditions, eight alerts, each proven not to fire the other seven. This half
// is the other property the demonstrable needs — **fires once, and clears when
// the condition clears** — which is the sink's, not the database's, because
// there is deliberately no alert-state table.

import { describe, expect, it } from "vitest";
import { ALERTS, EdgeTriggered, MemoryAlertSink, type AlertReading } from "../../worker/src/platform/alerts";

const reading = (alert: string, fired: boolean): AlertReading => ({ alert, fired, detail: { n: 1 } });

/** One evaluation of all eight, with the named ones firing. */
function evaluation(...firing: string[]): AlertReading[] {
  return ALERTS.map((a) => reading(a, firing.includes(a)));
}

describe("the alert sink", () => {
  it("fires once however many evaluations the condition survives", () => {
    const memory = new MemoryAlertSink();
    const sink = new EdgeTriggered(memory);

    // A minute-by-minute task run: the same condition, five times over.
    for (let i = 0; i < 5; i++) sink.apply(evaluation("queue_stalled"));

    expect(memory.firedAlerts()).toEqual(["queue_stalled"]);
    expect(memory.clearedAlerts()).toEqual([]);
    expect(sink.openAlerts).toEqual(["queue_stalled"]);
  });

  it("clears once, and only after it fired", () => {
    const memory = new MemoryAlertSink();
    const sink = new EdgeTriggered(memory);

    // Quiet first: a condition that never held must not produce a `clear`,
    // or every run would emit eight clears and the signal would be noise.
    sink.apply(evaluation());
    sink.apply(evaluation());
    expect(memory.events).toEqual([]);

    sink.apply(evaluation("render_failures"));
    sink.apply(evaluation("render_failures"));
    sink.apply(evaluation());
    sink.apply(evaluation());

    expect(memory.events.map((e) => `${e.kind}:${e.alert}`)).toEqual(["fired:render_failures", "cleared:render_failures"]);
    expect(sink.openAlerts).toEqual([]);
  });

  it("re-fires after a clear — a condition that comes back is news again", () => {
    const memory = new MemoryAlertSink();
    const sink = new EdgeTriggered(memory);
    sink.apply(evaluation("calendar_backlog"));
    sink.apply(evaluation());
    sink.apply(evaluation("calendar_backlog"));
    expect(memory.events.map((e) => `${e.kind}:${e.alert}`)).toEqual([
      "fired:calendar_backlog",
      "cleared:calendar_backlog",
      "fired:calendar_backlog",
    ]);
  });

  it("tracks the eight independently — one firing does not mask another", () => {
    const memory = new MemoryAlertSink();
    const sink = new EdgeTriggered(memory);
    sink.apply(evaluation("queue_stalled"));
    sink.apply(evaluation("queue_stalled", "impersonation_active"));
    expect(memory.firedAlerts()).toEqual(["queue_stalled", "impersonation_active"]);
    expect(sink.openAlerts).toEqual(["impersonation_active", "queue_stalled"]);

    // The first clears while the second holds.
    sink.apply(evaluation("impersonation_active"));
    expect(memory.clearedAlerts()).toEqual(["queue_stalled"]);
    expect(sink.openAlerts).toEqual(["impersonation_active"]);
  });

  it("★ all eight fire together, once each", () => {
    const memory = new MemoryAlertSink();
    const sink = new EdgeTriggered(memory);
    sink.apply(evaluation(...ALERTS));
    sink.apply(evaluation(...ALERTS));
    expect(memory.firedAlerts().sort()).toEqual([...ALERTS].sort());
    expect(memory.firedAlerts()).toHaveLength(ALERTS.length);
  });

  it("carries the detail on the firing edge, so a page says how far past the threshold", () => {
    const memory = new MemoryAlertSink();
    const sink = new EdgeTriggered(memory);
    sink.apply([{ alert: "queue_stalled", fired: true, detail: { oldest_pending_seconds: 1800 } }]);
    expect(memory.events[0].detail).toEqual({ oldest_pending_seconds: 1800 });
  });

  it("a fresh sink re-fires what is still open — the restart cost, stated in the file", () => {
    const first = new MemoryAlertSink();
    const a = new EdgeTriggered(first);
    a.apply(evaluation("storage_prefix_violation"));
    a.apply(evaluation("storage_prefix_violation"));
    expect(first.firedAlerts()).toEqual(["storage_prefix_violation"]);

    // The worker restarts: a new sink, the same condition still holding.
    const second = new MemoryAlertSink();
    const b = new EdgeTriggered(second);
    b.apply(evaluation("storage_prefix_violation"));
    expect(second.firedAlerts()).toEqual(["storage_prefix_violation"]);
  });

  it("names exactly the eight of 11 §3.2", () => {
    expect([...ALERTS].sort()).toEqual(
      [
        "calendar_backlog",
        "email_bounce_spike",
        "impersonation_active",
        "ledger_divergence",
        "parity_failure",
        "queue_stalled",
        "render_failures",
        "storage_prefix_violation",
      ].sort(),
    );
  });
});
