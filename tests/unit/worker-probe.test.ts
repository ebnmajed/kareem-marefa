// The LISTEN/NOTIFY boot probe (04 §7.2, 11 §1.2) against fake clients, so
// the behaviours that matter are pinned without a database:
//   · a NOTIFY on the notifier reaching the listener → the probe passes;
//   · one that never crosses (a transaction pooler) → ProbeError naming the
//     cause, and BOTH clients are still closed;
//   · the probe uses two connections, not one — see probe.ts for why a
//     self-notify on one connection approves a broken pooler.
// The real-database proof is the CI `worker` job: the probe runs straight at
// Postgres (passes) and through pgbouncer in transaction mode (must fail).
import { describe, expect, it } from "vitest";
import { poolerWarning, probeListenNotify, ProbeError, PROBE_CHANNEL, type ProbeClient } from "../../worker/src/probe";

type Listener = (msg: { channel: string; payload?: string }) => void;

/** A fake "server": notifications cross from any notifier to every listener when `delivers`. */
function fakeServer({ delivers }: { delivers: boolean }) {
  const listeners: Listener[] = [];
  const clients: { calls: string[]; ended: boolean }[] = [];
  const createClient = (): ProbeClient => {
    const me = { calls: [] as string[], ended: false };
    clients.push(me);
    return {
      async connect() {
        me.calls.push("connect");
      },
      async query(sql, params) {
        me.calls.push(sql);
        if (sql.startsWith("select pg_notify") && delivers) {
          const [channel, payload] = params as [string, string];
          // Postgres delivers after the statement completes, to OTHER sessions.
          setTimeout(() => listeners.forEach((l) => l({ channel, payload })), 5);
        }
      },
      on(_event, cb) {
        listeners.push(cb);
      },
      async end() {
        me.ended = true;
      },
    };
  };
  return { createClient, clients };
}

describe("probeListenNotify", () => {
  it("passes when the NOTIFY crosses connections, and closes both clients", async () => {
    const srv = fakeServer({ delivers: true });
    const { latencyMs } = await probeListenNotify("postgres://x@localhost:5432/db", { timeoutMs: 500, createClient: srv.createClient });
    expect(latencyMs).toBeGreaterThanOrEqual(0);
    expect(srv.clients).toHaveLength(2);
    const [listener, notifier] = srv.clients;
    expect(listener.calls).toEqual(["connect", `LISTEN ${PROBE_CHANNEL}`]);
    expect(notifier.calls).toEqual(["connect", "select pg_notify($1, $2)"]);
    expect(srv.clients.every((c) => c.ended)).toBe(true);
  });

  it("uses two connections — the listener never notifies itself", async () => {
    const srv = fakeServer({ delivers: true });
    await probeListenNotify("postgres://x@localhost:5432/db", { timeoutMs: 500, createClient: srv.createClient });
    const [listener] = srv.clients;
    expect(listener.calls.some((c) => c.startsWith("select pg_notify"))).toBe(false);
  });

  it("refuses when nothing crosses — the transaction-pooler signature", async () => {
    const srv = fakeServer({ delivers: false });
    await expect(probeListenNotify("postgres://x@localhost:6543/db", { timeoutMs: 50, createClient: srv.createClient })).rejects.toThrow(ProbeError);
    expect(srv.clients.every((c) => c.ended)).toBe(true);
    const srv2 = fakeServer({ delivers: false });
    await expect(probeListenNotify("postgres://x@localhost:6543/db", { timeoutMs: 50, createClient: srv2.createClient })).rejects.toThrow(/port 5432/);
  });

  it("ignores a notification with someone else's payload", async () => {
    const srv = fakeServer({ delivers: false });
    const createClient = (): ProbeClient => {
      const c = srv.createClient();
      return {
        ...c,
        on(_event, cb) {
          setTimeout(() => cb({ channel: PROBE_CHANNEL, payload: "not-our-nonce" }), 5);
        },
      };
    };
    await expect(probeListenNotify("postgres://x@localhost:5432/db", { timeoutMs: 50, createClient })).rejects.toThrow(ProbeError);
  });

  it("wraps a connection failure as a ProbeError and closes what it opened", async () => {
    let ended = 0;
    const createClient = (): ProbeClient => ({
      async connect() {
        throw new Error("ECONNREFUSED");
      },
      async query() {},
      on() {},
      async end() {
        ended++;
      },
    });
    await expect(probeListenNotify("postgres://x@localhost:5432/db", { createClient })).rejects.toThrow(/could not connect/);
    expect(ended).toBe(2);
  });
});

describe("poolerWarning", () => {
  it("names port 6543 as the transaction pooler", () => {
    expect(poolerWarning("postgres://u:p@db.example.supabase.co:6543/postgres")).toMatch(/6543/);
  });
  it("is silent on 5432 and on garbage", () => {
    expect(poolerWarning("postgres://u:p@db.example.supabase.co:5432/postgres")).toBeNull();
    expect(poolerWarning("not a url")).toBeNull();
  });
});
