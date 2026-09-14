// The alert transport seam — `11` §3.2, `REQ-NFR-016`, `14` M8's third
// demonstrable.
//
// ★ NO NETWORK CALL LIVES IN THIS FILE, and none may be added to it. Sentry is
// wired behind `AlertSink` by the lead at Launch; locally and in CI the sink is
// a console or an in-memory one. That is what makes the drill possible: a
// transport cannot be drilled, but an interface with a recording
// implementation can be asserted on line by line.
//
// ★ "FIRES ONCE AND CLEARS" IS THE SINK'S PROPERTY, not the database's. The
// task evaluates all eight alerts every minute and hands the sink the CURRENT
// state of each; the sink turns that stream of states into transitions. There
// is deliberately no alert-state table: a ninth entity holding open/closed
// would need a decision, a policy and a retention row, and it would duplicate
// what every real transport already does — Sentry, PagerDuty and a log
// pipeline all dedupe by fingerprint.
//
// The honest cost, recorded so nobody files it as a bug: **a worker restart
// re-fires every currently-open alert once.** That is the right behaviour for a
// process that has just lost its memory, and it is what the real transport
// deduplicates.

/** One evaluated alert, exactly as `public.evaluate_alerts()` returns it. */
export interface AlertReading {
  alert: string;
  fired: boolean;
  detail: Record<string, unknown>;
}

export interface AlertSink {
  /** The condition has just started holding. Called on the rising edge only. */
  fire(alert: string, detail: Record<string, unknown>): void;
  /** The condition has just stopped holding. Called on the falling edge only. */
  clear(alert: string): void;
}

/**
 * Turns a stream of readings into edges. Wrap any sink in this and it sees a
 * `fire` the first time a condition holds and a `clear` the first time it stops
 * — however many times the task runs in between.
 */
export class EdgeTriggered implements AlertSink {
  private readonly open = new Set<string>();

  constructor(private readonly inner: AlertSink) {}

  fire(alert: string, detail: Record<string, unknown>): void {
    if (this.open.has(alert)) return;
    this.open.add(alert);
    this.inner.fire(alert, detail);
  }

  clear(alert: string): void {
    if (!this.open.delete(alert)) return;
    this.inner.clear(alert);
  }

  /** Hand it a whole evaluation; it works out which edges were crossed. */
  apply(readings: AlertReading[]): void {
    for (const r of readings) {
      if (r.fired) this.fire(r.alert, r.detail);
      else this.clear(r.alert);
    }
  }

  /** For the drill, and for a status line. */
  get openAlerts(): string[] {
    return [...this.open].sort();
  }
}

/** The default sink: stderr for a firing alert, stdout for a clearing one. */
export class ConsoleAlertSink implements AlertSink {
  fire(alert: string, detail: Record<string, unknown>): void {
    // `console.error` on purpose: this is the line an on-call pipeline greps
    // for, and a firing alert on stdout is a firing alert nobody sees.
    console.error(`ALERT FIRED ${alert} ${JSON.stringify(detail)}`);
  }

  clear(alert: string): void {
    console.log(`alert cleared ${alert}`);
  }
}

/** The drill's sink: it remembers every transition, in order. */
export class MemoryAlertSink implements AlertSink {
  readonly events: { kind: "fired" | "cleared"; alert: string; detail?: Record<string, unknown> }[] = [];

  fire(alert: string, detail: Record<string, unknown>): void {
    this.events.push({ kind: "fired", alert, detail });
  }

  clear(alert: string): void {
    this.events.push({ kind: "cleared", alert });
  }

  firedAlerts(): string[] {
    return this.events.filter((e) => e.kind === "fired").map((e) => e.alert);
  }

  clearedAlerts(): string[] {
    return this.events.filter((e) => e.kind === "cleared").map((e) => e.alert);
  }
}

/** The eight of `11` §3.2, so a missing one is a failure rather than a silence. */
export const ALERTS = [
  "queue_stalled",
  "ledger_divergence",
  "parity_failure",
  "calendar_backlog",
  "email_bounce_spike",
  "render_failures",
  "storage_prefix_violation",
  "impersonation_active",
] as const;
