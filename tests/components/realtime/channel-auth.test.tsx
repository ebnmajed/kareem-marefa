// The private join carries the member's token (wave 18, found by `content`'s real-worker run): the socket's auth is
// set BEFORE `subscribe()`, so the first `phx_join` is never refused as «Unauthorized» and no broadcast is lost in
// the ~6 s before a rejoin (REQ-EVT-015, REQ-CHK-001). And a caller that leaves before the token arrives never joins.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let releaseAuth: () => void = () => {};
const channel = {
  on: vi.fn(() => channel),
  subscribe: vi.fn(() => {
    calls.push("subscribe");
    return channel;
  }),
};
const client = {
  channel: vi.fn(() => channel),
  removeChannel: vi.fn(() => calls.push("remove")),
  realtime: {
    setAuth: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseAuth = () => {
            calls.push("auth");
            resolve();
          };
        }),
    ),
  },
};
vi.mock("@/lib/supabase/browser", () => ({ createBrowserClient: () => client }));

import { subscribeToHostTopic, subscribeToSessionTopic } from "@/lib/realtime/channel";

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("subscribeToTopic — the private join waits for the token", () => {
  it("sets the socket's auth, then subscribes, on a private channel", async () => {
    subscribeToSessionTopic("s1", () => {});
    expect(client.channel).toHaveBeenCalledWith("session:s1", { config: { private: true } });
    expect(channel.subscribe).not.toHaveBeenCalled();
    releaseAuth();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(["auth", "subscribe"]);
  });

  it("never joins when the caller unsubscribed before the token arrived", async () => {
    const stop = subscribeToHostTopic("s2", () => {});
    stop();
    releaseAuth();
    await Promise.resolve();
    await Promise.resolve();
    expect(channel.subscribe).not.toHaveBeenCalled();
    expect(calls).toEqual(["remove", "auth"]);
  });
});
