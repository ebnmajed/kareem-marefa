// The worker after its six-day silence (19 – 25 Oct 2026): the Resend gate that
// keeps a backlog under the provider's 10-a-second limit, and the reminder that
// is dropped once the session it announces has started. The pool settings and
// the watchdog live in worker/src/index.ts, which boots a runner on import, so
// they are proven on the real worker, not here.
import { describe, expect, it, vi } from "vitest";
import type { JobHelpers } from "graphile-worker";
import { reserveSendSlot } from "../../worker/src/mail/resend";
import { send_reminder } from "../../worker/src/tasks/send_reminder";

describe("reserveSendSlot — a burst is spaced, not refused", () => {
  it("gives twenty sends at the same instant slots 125 ms apart — eight a second", () => {
    const t = Date.now() + 3_600_000; // clear of any slot booked before
    const waits = Array.from({ length: 20 }, () => reserveSendSlot(t));
    expect(waits).toEqual(Array.from({ length: 20 }, (_, i) => i * 125));
  });

  it("does not delay a send that comes after the last slot has passed", () => {
    const t = Date.now() + 7_200_000;
    expect(reserveSendSlot(t)).toBe(0);
    expect(reserveSendSlot(t + 1_000)).toBe(0);
  });
});

function helpers(runAt: Date) {
  const query = vi.fn(async () => ({ rows: [{ sent: true }] }));
  const info = vi.fn();
  return {
    h: { job: { run_at: runAt }, query, logger: { info, error: vi.fn(), warn: vi.fn(), debug: vi.fn() } } as unknown as JobHelpers,
    query,
    info,
  };
}

describe("send_reminder — never after the moment it announces", () => {
  const payload = { session_id: "s", member_id: "m", offset_minutes: 120 };

  it("sends a reminder that runs on time", async () => {
    const { h, query } = helpers(new Date());
    await send_reminder(payload, h);
    expect(query).toHaveBeenCalledOnce();
  });

  it("still sends one that runs late but before the session starts", async () => {
    const { h, query } = helpers(new Date(Date.now() - 90 * 60_000)); // due 90 min ago, start in 30
    await send_reminder(payload, h);
    expect(query).toHaveBeenCalledOnce();
  });

  it("drops one that runs after the session has started — 25 Oct's «in 2 hours», five days on", async () => {
    const { h, query, info } = helpers(new Date(Date.now() - 5 * 24 * 60 * 60_000));
    await send_reminder(payload, h);
    expect(query).not.toHaveBeenCalled();
    expect(info.mock.calls[0][0]).toMatch(/after the start — dropped/);
  });
});
