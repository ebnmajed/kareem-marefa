// requireSession() narrows on `data`, not `error` (REQ-NFR-004, 04 §5).
// getClaims() returns a three-way union in which { data: null, error: null }
// is a reachable no-session state; an implementation narrowing on `error`
// would let that request through. This test would fail on it.
import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ auth: { getClaims } })),
}));
// react's cache() memoises per request; give each test a fresh identity.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T extends (...a: never[]) => unknown>(fn: T) => fn };
});

import { getSessionState, pathForState, requireSession } from "@/lib/dal/session";

const member = (over: Record<string, unknown> = {}) => ({
  data: {
    claims: {
      sub: "u1",
      email: "sara@kareem.example",
      app_metadata: { org_id: "o1", member_id: "m1", org_role: "member", status: "active", claims_version: 1, org_status: "active", ...over },
    },
  },
  error: null,
});

beforeEach(() => getClaims.mockReset());

describe("getSessionState", () => {
  it("{ data: null, error: null } is NO session — not a pass", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    expect(await getSessionState()).toEqual({ kind: "none" });
  });

  it("an error is also no session", async () => {
    getClaims.mockResolvedValue({ data: null, error: { message: "bad token" } });
    expect(await getSessionState()).toEqual({ kind: "none" });
  });

  it("claims without org claims are a signed-in stranger", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "u9", app_metadata: {} } }, error: null });
    expect(await getSessionState()).toEqual({ kind: "no_org", userId: "u9", platformAdmin: false });
  });

  it("a suspended org and a deactivated member are their own states", async () => {
    getClaims.mockResolvedValue(member({ org_status: "suspended" }));
    expect(await getSessionState()).toEqual({ kind: "suspended", userId: "u1" });
    getClaims.mockResolvedValue(member({ status: "deactivated" }));
    expect(await getSessionState()).toEqual({ kind: "deactivated", userId: "u1" });
  });

  it("a member gets a DTO, never the raw claims", async () => {
    getClaims.mockResolvedValue(member());
    expect(await getSessionState()).toEqual({
      kind: "member",
      session: { userId: "u1", orgId: "o1", memberId: "m1", role: "member", claimsVersion: 1, email: "sara@kareem.example" },
    });
  });
});

describe("requireSession", () => {
  it("redirects to sign-in with next when there is no session", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    await expect(requireSession("ar", "/ar/app/sessions/x")).rejects.toThrow("REDIRECT:/ar/sign-in?next=%2Far%2Fapp%2Fsessions%2Fx");
  });

  it("routes each non-member state to its explanation", () => {
    expect(pathForState({ kind: "no_org", userId: "u", platformAdmin: false }, "ar")).toBe("/ar/no-access");
    expect(pathForState({ kind: "suspended", userId: "u" }, "ar")).toBe("/ar/no-access?reason=suspended");
    expect(pathForState({ kind: "deactivated", userId: "u" }, "ar")).toBe("/ar/no-access?reason=deactivated");
  });

  it("returns the session for a member", async () => {
    getClaims.mockResolvedValue(member());
    const s = await requireSession("ar");
    expect(s.memberId).toBe("m1");
  });
});
