// SCR-006's two guarantees that do not need a database: a SERIAL never
// reaches `verify_certificate()` (REQ-CRT-009), and enumeration is rate
// limited (REQ-NFR-005, REQ-CRT-010).
//
// The database half — that an unknown code and a revoked-nonexistent one are
// indistinguishable, and that the return type is the allowlist — is proven
// in tests/rls/designer-certificates.test.ts against the real function.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn(async () => ({ rpc })) }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T extends (...a: never[]) => unknown>(fn: T) => fn };
});

import { rateLimit, verifyCertificate } from "@/lib/dal/certificates";

const found = {
  data: [
    {
      recipient_name: "سارة العتيبي",
      kind: "attendance",
      session_title: "مقدمة في التصميم",
      session_date: "2026-03-01",
      achievement_name: null,
      org_name: "كريم معرفة",
      issued_at: "2026-03-01T10:00:00Z",
      state: "issued",
    },
  ],
  error: null,
};

// 24 characters of base64url — the shape `new_verification_code()` produces.
const CODE = "aB3-_xYz9QwErTyUiOpAsDfG";

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue(found);
});

let ip = 0;
const freshKey = () => `test-${ip++}`;

describe("verifyCertificate", () => {
  it("★ REQ-CRT-009: a SERIAL is not-found, and the database is never asked", async () => {
    const result = await verifyCertificate("KM-2026-000001", freshKey());
    expect(result).toEqual({ status: "not_found" });
    // The whole point: a serial does not become a lookup. If it did, the
    // shape check would be cosmetic and the guarantee would rest entirely
    // on the SQL function's where-clause.
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a valid code resolves", async () => {
    const result = await verifyCertificate(CODE, freshKey());
    expect(result.status).toBe("found");
    expect(rpc).toHaveBeenCalledWith("verify_certificate", { p_code: CODE });
  });

  it("★ the code is CASE-SENSITIVE and is passed through untouched", async () => {
    // base64url is mixed-case. Normalising to upper case here would turn
    // every real code into a miss while every test with an upper-case
    // fixture still passed.
    await verifyCertificate(`  ${CODE}  `, freshKey());
    expect(rpc).toHaveBeenCalledWith("verify_certificate", { p_code: CODE });
  });

  it("an empty result is not-found — the same answer a revoked-nonexistent code gets", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await verifyCertificate(CODE, freshKey())).toEqual({ status: "not_found" });
  });

  it("a database error is not-found, never a leak of what went wrong", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied for table certificates" } });
    expect(await verifyCertificate(CODE, freshKey())).toEqual({ status: "not_found" });
  });
});

describe("rateLimit", () => {
  it("★ REQ-NFR-005: allows a burst, then refuses within the window", () => {
    const key = freshKey();
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) expect(rateLimit(key, t0)).toBe(true);
    expect(rateLimit(key, t0)).toBe(false);
  });

  it("the window reopens", () => {
    const key = freshKey();
    const t0 = 2_000_000;
    for (let i = 0; i < 21; i++) rateLimit(key, t0);
    expect(rateLimit(key, t0 + 60_001)).toBe(true);
  });

  it("one client's burst never refuses another", () => {
    const a = freshKey();
    const b = freshKey();
    const t0 = 3_000_000;
    for (let i = 0; i < 25; i++) rateLimit(a, t0);
    expect(rateLimit(b, t0)).toBe(true);
  });

  it("a rate-limited caller is told so, and the database is never asked", async () => {
    const key = freshKey();
    for (let i = 0; i < 21; i++) rateLimit(key);
    rpc.mockClear();
    expect(await verifyCertificate(CODE, key)).toEqual({ status: "rate_limited" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
