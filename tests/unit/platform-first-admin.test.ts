// F3 (wave 8, `docs/plan/notes/platform.md` W8.0/W8.5) — `setFirstAdmin()` trims
// and lowercases before `set_first_admin()`, whose check runs on the address as
// sent and refuses `Boss@Example.COM` (pinned in tests/rls/platform-console.test.ts).
// REQ-TEN-002.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({ getSessionState: vi.fn(async () => ({ kind: "no_org", userId: "u", platformAdmin: true })) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc, auth: { getClaims: async () => ({ data: { claims: { sub: "u" } }, error: null }) } })),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T extends (...a: never[]) => unknown>(fn: T) => fn };
});

import { addDomain, setFirstAdmin } from "@/lib/dal/platform";

const ORG = "0c1a3a2e-6a55-4d6f-8f1e-3f5b0b9e2a11";

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("platform DAL — case is forgiven where storage fixes it", () => {
  it("★ setFirstAdmin sends the address trimmed and lowercased", async () => {
    expect(await setFirstAdmin("ar", ORG, "  Boss@Example.COM ")).toEqual({ status: "ok" });
    expect(rpc).toHaveBeenCalledWith("set_first_admin", { p_org: ORG, p_email: "boss@example.com" });
  });

  it("an address that is not one is refused before the RPC", async () => {
    expect(await setFirstAdmin("ar", ORG, "not an email")).toEqual({ status: "failed", message: "invalid_email" });
    expect(rpc).not.toHaveBeenCalledWith("set_first_admin", expect.anything());
  });

  it("addDomain reports a new row with its id, and an existing one without", async () => {
    rpc.mockImplementation(async (name: string) => (name === "add_org_domain" ? { data: "row-id", error: null } : { data: null, error: null }));
    expect(await addDomain("ar", ORG, "Mixed-Case.Example")).toEqual({ status: "ok", id: "row-id" });
    expect(rpc).toHaveBeenCalledWith("add_org_domain", { p_org: ORG, p_domain: "mixed-case.example" });
    rpc.mockImplementation(async () => ({ data: null, error: null }));
    expect(await addDomain("ar", ORG, "mixed-case.example")).toEqual({ status: "ok", id: undefined });
  });
});
