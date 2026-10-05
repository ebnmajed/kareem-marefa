// The callback keeps a platform admin's session when no org matches — DEC-253 §7.1, DEC-261.
//
// Measured live on 2026-10-05: with the only org deleted, `provision_member()` answers `no_match` for every
// address, the callback signed the session out, and the super admin could not reach the console to create an org.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const client = vi.hoisted(() => ({
  auth: { exchangeCodeForSession: vi.fn(), signOut: vi.fn(), refreshSession: vi.fn() },
  rpc: vi.fn(),
}));
const provision = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => client }));
vi.mock("@/lib/supabase/env", () => ({ platformConfigured: () => true }));
vi.mock("@/lib/auth/flow", async (original) => ({ ...(await original<typeof import("@/lib/auth/flow")>()), provision }));

import { GET } from "@/app/api/auth/callback/route";

const call = () => GET(new NextRequest("http://localhost:3000/api/auth/callback?code=abc"));

beforeEach(() => {
  vi.clearAllMocks();
  client.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  provision.mockResolvedValue({ status: "no_match" });
});

describe("the callback, when no org matches", () => {
  it("★ a platform admin keeps the session and lands on the console", async () => {
    client.rpc.mockResolvedValue({ error: null });
    const response = await call();
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("assert_platform_admin");
    expect(client.auth.signOut).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/ar/app/platform");
  });

  it("anybody else is signed out and lands on /no-access, as before", async () => {
    client.rpc.mockResolvedValue({ error: { code: "42501" } });
    const response = await call();
    expect(client.auth.signOut).toHaveBeenCalledOnce();
    expect(new URL(response.headers.get("location")!).pathname).toBe("/ar/no-access");
  });

  it("a member is never asked whether they are a platform admin", async () => {
    provision.mockResolvedValue({ status: "member", org_status: "active", member_status: "active" });
    await call();
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });
});
