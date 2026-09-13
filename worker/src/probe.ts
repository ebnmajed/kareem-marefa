// The LISTEN/NOTIFY boot probe. 04 §7.2, 11 §1.2, DEC-018, DEC-034.
//
// graphile-worker dispatches jobs over LISTEN/NOTIFY, which needs a
// session-mode connection — Supabase's port 5432, never the transaction
// pooler on 6543. The failure is SILENT: on a pooled connection `LISTEN`
// returns normally and notifications simply stop reaching the worker, so it
// degrades to polling and reminders arrive late for months with nothing in
// any log.
//
// So: at boot, prove that a NOTIFY sent on ONE connection reaches a LISTEN
// on ANOTHER, within a second, and refuse to start otherwise.
//
// Why two connections, not one — learned by running it (DEC-034): a
// single connection that LISTENs and then NOTIFYs itself PASSES through
// pgbouncer in transaction mode when the pool is idle, because both
// statements happen to reuse the same server connection. That is exactly
// the quiet moment a boot probe runs in, so a one-connection probe would
// approve the broken configuration. Two connections cannot both hold the
// same server connection, so on a transaction pooler the listener's server
// connection is idle in the pool when the notification lands, and it is
// dropped — which is the real production failure, reproduced on demand.

import { randomUUID } from "node:crypto";
import pg from "pg";

export const PROBE_CHANNEL = "kareem_worker_probe";

export class ProbeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProbeError";
  }
}

/** The slice of `pg.Client` the probe uses — so a test can fake it. */
export interface ProbeClient {
  connect(): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<unknown>;
  on(event: "notification", listener: (msg: { channel: string; payload?: string }) => void): unknown;
  end(): Promise<void>;
}

export interface ProbeOptions {
  /** How long to wait for the NOTIFY to cross connections. Default 1000 ms. */
  timeoutMs?: number;
  /** Injection point for tests. Called twice: listener, then notifier. */
  createClient?: (connectionString: string) => ProbeClient;
}

/**
 * A warning if the URL points at a transaction pooler. Port 6543 is
 * Supabase's convention; the probe would fail anyway, but naming the cause
 * up front saves the reader a search.
 */
export function poolerWarning(connectionString: string): string | null {
  let port = "";
  try {
    port = new URL(connectionString).port;
  } catch {
    return null;
  }
  if (port === "6543") {
    return "DATABASE_URL uses port 6543 — Supabase's TRANSACTION pooler. LISTEN/NOTIFY needs a session-mode connection on port 5432 (04 §7.2).";
  }
  return null;
}

/**
 * Resolves with the cross-connection latency when a NOTIFY sent on the
 * notifier connection arrives on the listener connection. Rejects with
 * `ProbeError` if it does not arrive within `timeoutMs`, or if either
 * connection cannot be opened. Both clients are always closed.
 */
export async function probeListenNotify(connectionString: string, options: ProbeOptions = {}): Promise<{ latencyMs: number }> {
  const timeoutMs = options.timeoutMs ?? 1000;
  const createClient: (cs: string) => ProbeClient = options.createClient ?? ((cs) => new pg.Client({ connectionString: cs }));
  const listener = createClient(connectionString);
  const notifier = createClient(connectionString);
  const nonce = randomUUID();

  try {
    await listener.connect();
    await notifier.connect();
  } catch (e) {
    await Promise.allSettled([listener.end(), notifier.end()]);
    throw new ProbeError(`could not connect for the LISTEN/NOTIFY probe: ${(e as Error).message}`);
  }

  try {
    const started = Date.now();
    const arrived = new Promise<number>((resolve) => {
      listener.on("notification", (msg) => {
        if (msg.channel === PROBE_CHANNEL && msg.payload === nonce) resolve(Date.now() - started);
      });
    });

    await listener.query(`LISTEN ${PROBE_CHANNEL}`);
    await notifier.query("select pg_notify($1, $2)", [PROBE_CHANNEL, nonce]);

    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new ProbeError(
              `a NOTIFY sent on one connection did not reach a LISTEN on another within ${timeoutMs} ms. ` +
                "This is what a transaction-pooled connection looks like: LISTEN succeeds and deliveries are dropped. " +
                "Point DATABASE_URL at a session-mode connection (Supabase port 5432, not 6543) — 04 §7.2, 11 §1.2.",
            ),
          ),
        timeoutMs,
      );
    });

    try {
      const latencyMs = await Promise.race([arrived, timedOut]);
      return { latencyMs };
    } finally {
      clearTimeout(timer);
    }
  } finally {
    await Promise.allSettled([listener.end(), notifier.end()]);
  }
}
