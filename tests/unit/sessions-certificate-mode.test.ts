// REQ-SES-020 — the certificate mode has one writer (DEC-178 contract 2).
// `setSessionCertificateMode()` is what SCR-045 calls: shape checked before the
// RPC, a refusal the function names returned as a DTO, anything else thrown.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));

const SESSION = "00000000-0000-4000-8000-0000000000cc";
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const state: { role: string; rpc: Rpc; calls: { name: string; args: Record<string, unknown> }[] } = {
  role: "admin",
  rpc: async () => ({ data: "ok", error: null }),
  calls: [],
};

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({
    session: { memberId: "m", orgId: "org", role: state.role },
    supabase: {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.calls.push({ name, args });
        return state.rpc(name, args);
      },
    },
  }),
}));

const { setSessionCertificateMode } = await import("@/lib/dal/sessions");

beforeEach(() => {
  state.role = "admin";
  state.rpc = async () => ({ data: "ok", error: null });
  state.calls = [];
});

describe("setSessionCertificateMode", () => {
  it("sends the session and the mode, and reports a change", async () => {
    expect(await setSessionCertificateMode("ar", SESSION, "review")).toEqual({ status: "ok" });
    expect(state.calls).toEqual([{ name: "set_session_certificate_mode", args: { p_session: SESSION, p_mode: "review" } }]);
  });

  it("reports the same mode as unchanged", async () => {
    state.rpc = async () => ({ data: "unchanged", error: null });
    expect(await setSessionCertificateMode("ar", SESSION, "off")).toEqual({ status: "unchanged" });
  });

  it("returns each refusal the function names, by name", async () => {
    for (const error of ["session_completed", "session_cancelled", "session_not_found", "stale_claims"] as const) {
      state.rpc = async () => ({ data: null, error: { message: error } });
      expect(await setSessionCertificateMode("ar", SESSION, "automatic")).toEqual({ status: "refused", error });
    }
  });

  it("throws anything it does not know", async () => {
    state.rpc = async () => ({ data: null, error: { message: "connection reset" } });
    await expect(setSessionCertificateMode("ar", SESSION, "automatic")).rejects.toThrow(/set_session_certificate_mode/);
  });

  it("never reaches the RPC for a malformed id, an unknown mode, or a non-admin", async () => {
    expect(await setSessionCertificateMode("ar", "not-a-uuid", "automatic")).toEqual({ status: "refused", error: "session_not_found" });
    expect(await setSessionCertificateMode("ar", SESSION, "sometimes" as never)).toEqual({ status: "refused", error: "session_not_found" });
    state.role = "moderator";
    expect(await setSessionCertificateMode("ar", SESSION, "automatic")).toEqual({ status: "refused", error: "not_an_admin" });
    expect(state.calls).toEqual([]);
  });
});
