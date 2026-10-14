// The reaction write queue — DEC-290 (REQ-EVT-004, REQ-STO-005): taps coalesce into the last state, a state that
// changes while a write is in flight is sent once it returns, and the caller hears only about the last state.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COALESCE_MS, isPending, queueReaction, resetReactionQueue } from "@/lib/reactions/queue";

type Call = { body: Record<string, unknown>; resolve: (ok: boolean) => void };
let calls: Call[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: { body: string }) =>
        new Promise((resolve) =>
          calls.push({
            body: JSON.parse(init.body) as Record<string, unknown>,
            resolve: (ok) => resolve({ ok, json: async () => ({ on: JSON.parse(init.body).on }) }),
          }),
        ),
    ),
  );
});
afterEach(() => {
  resetReactionQueue();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const settle = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

describe("queueReaction", () => {
  it("coalesces quick taps on one target into ONE write of the last state", async () => {
    const done = vi.fn();
    queueReaction({ target: "comment", id: "c1", kind: "like", on: true }, done);
    queueReaction({ target: "comment", id: "c1", kind: "like", on: false }, done);
    queueReaction({ target: "comment", id: "c1", kind: "like", on: true }, done);
    expect(isPending("comment", "c1")).toBe(true);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ target: "comment", id: "c1", kind: "like", on: true });
    calls[0].resolve(true);
    await settle();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0]).toMatchObject({ ok: true });
    expect(isPending("comment", "c1")).toBe(false);
  });

  it("a state changed while a write is in flight is sent after it — and only that answer is the caller's", async () => {
    const first = vi.fn();
    const second = vi.fn();
    queueReaction({ target: "story", id: "f1", kind: "clap" }, first);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(calls).toHaveLength(1);
    queueReaction({ target: "story", id: "f1", kind: null }, second);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(calls).toHaveLength(1); // still waiting on the first
    calls[0].resolve(true);
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toEqual({ target: "story", id: "f1", kind: null });
    calls[1].resolve(true);
    await settle();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("targets do not wait for each other", async () => {
    queueReaction({ target: "comment", id: "a", kind: "like", on: true }, () => {});
    queueReaction({ target: "comment", id: "b", kind: "like", on: true }, () => {});
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    expect(calls.map((c) => c.body.id)).toEqual(["a", "b"]);
  });

  it("a refused write tells the caller it failed", async () => {
    const done = vi.fn();
    queueReaction({ target: "comment", id: "c1", kind: "like", on: true }, done);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    calls[0].resolve(false);
    await settle();
    expect(done).toHaveBeenCalledWith({ ok: false });
  });
});
