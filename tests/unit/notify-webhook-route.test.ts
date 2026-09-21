// POST /api/webhooks/resend — the handler's contract (REQ-NTF-008, 08 §5.2).
//
// The signature, the replay window and the mapping are the database's and are
// proven against real Postgres in `tests/rls/notify-bounce.test.ts`. What is
// left to this file is the four things the HANDLER decides: that it forwards
// the RAW body, that it answers 200 to every outcome a retry cannot fix, that
// it holds no secret, and that it never logs what the body carries.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }));

const { POST, GET } = await import("@/app/api/webhooks/resend/route");

const BODY = '{"type":"email.bounced","data":{"email_id":"m1","to":["sara@example.com"]}}';
const HEADERS = { "svix-id": "msg_1", "svix-timestamp": "1770000000", "svix-signature": "v1,abc" };

const post = (body = BODY, headers: Record<string, string> = HEADERS) =>
  POST(new Request("https://kareem.pp.sa/api/webhooks/resend", { method: "POST", body, headers }));

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { status: "applied" }, error: null });
});

describe("★ the raw body is the signed body", () => {
  it("the bytes that arrived are the bytes forwarded — never a re-serialised object", async () => {
    // A signature is over bytes. `JSON.parse` then `JSON.stringify` reorders
    // keys and rewrites whitespace, and every such body would fail to verify
    // for a reason no log would explain. This is the assertion that keeps a
    // later «tidy-up» from doing it.
    const odd = '{  "type" : "email.delivered" ,\n "data":{"email_id":"m1"} }';
    await post(odd);
    expect(rpc).toHaveBeenCalledWith("resend_webhook", {
      p_id: "msg_1",
      p_timestamp: "1770000000",
      p_signature: "v1,abc",
      p_body: odd,
    });
  });

  it("the three Svix headers are forwarded under their own names", async () => {
    await post();
    const args = rpc.mock.calls[0][1] as Record<string, string>;
    expect(args.p_id).toBe("msg_1");
    expect(args.p_timestamp).toBe("1770000000");
    expect(args.p_signature).toBe("v1,abc");
  });
});

describe("★ 200 to everything a retry cannot fix", () => {
  it("a rejected signature, a stale body and an unknown message are all 200", async () => {
    for (const status of ["rejected", "unknown_message", "ignored", "unconfigured"]) {
      rpc.mockResolvedValue({ data: { status }, error: null });
      const res = await post();
      // A 4xx teaches an attacker which guess was closer; a 5xx turns one
      // malformed request into days of retries.
      expect(res.status, status).toBe(200);
      expect(await res.json()).toEqual({ status });
    }
  });

  it("a missing header is refused WITHOUT calling the database", async () => {
    for (const drop of ["svix-id", "svix-timestamp", "svix-signature"]) {
      rpc.mockClear();
      const headers = { ...HEADERS } as Record<string, string>;
      delete headers[drop];
      const res = await post(BODY, headers);
      expect(res.status, drop).toBe(200);
      expect(rpc, drop).not.toHaveBeenCalled();
    }
  });

  it("★ an unreachable database is the ONE 503 — the only case a retry helps", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection refused" } });
    expect((await post()).status).toBe(503);
  });

  it("a GET is 405 with an `allow` header, not a 200 that looks like an endpoint", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });
});

describe("★ it holds no secret, and logs no body", () => {
  it("the handler reads no environment variable of its own", async () => {
    // The secret lives in the vault and never leaves the database (invariant
    // 7: `service_role` is never on Vercel, so the handler cannot be trusted
    // with a door). If a later change adds `process.env.RESEND_WEBHOOK_SECRET`
    // here, this is what fails.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../../src/app/api/webhooks/resend/route.ts", import.meta.url), "utf8"),
    );
    // Comments stripped first: the file EXPLAINS that it holds no
    // `service_role` key, and a guard that read the explanation as the
    // violation would be unfixable without deleting the reason.
    const code = source.replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/process\.env/);
    expect(code).not.toMatch(/service_role|SERVICE_ROLE|secret_key/i);
  });

  it("a failed outcome logs its STATUS and never the body or the signature", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: { status: "rejected" }, error: null });
    await post();
    const line = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    // The body carries a member's address; a log line is not the delivery log.
    expect(line).toContain("rejected");
    expect(line).not.toContain("sara@example.com");
    expect(line).not.toContain("v1,abc");
    warn.mockRestore();
  });

  it("a successful delivery logs nothing at all", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await post();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
