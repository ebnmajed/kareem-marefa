// Which transport this process holds — DEC-046.
//
// The owner's decision was: **email in development and CI never reaches a
// provider.** That is one `switch` in worker/src/mail/index.ts, and it is the
// kind of code whose failure mode is not a red test but two hundred real
// emails leaving a test run. So the default is asserted from both sides: what
// it selects, and — the one that actually catches a regression — that
// `RESEND_API_KEY` is not so much as READ unless Resend was asked for by name.
import { describe, expect, it } from "vitest";
import { createTransport, selectTransportName, fromAddress, DEFAULT_FROM_ADDRESS } from "../../worker/src/mail/index";
import { MemoryTransport } from "../../worker/src/mail/memory";
import type { TransportEnv } from "../../worker/src/mail/transport";

/** An env that records every property read, so "never read" is testable. */
function spyEnv(values: TransportEnv): { env: TransportEnv; read: string[] } {
  const read: string[] = [];
  const env = new Proxy(values, {
    get(target, property: string) {
      read.push(property);
      return target[property as keyof TransportEnv];
    },
  }) as TransportEnv;
  return { env, read };
}

describe("selectTransportName", () => {
  it("defaults to the sink when nothing is configured", () => {
    expect(selectTransportName({})).toBe("smtp-sink");
  });

  it("picks the in-memory transport under a test run and under CI", () => {
    expect(selectTransportName({ VITEST: "true" })).toBe("memory");
    expect(selectTransportName({ NODE_ENV: "test" })).toBe("memory");
    expect(selectTransportName({ CI: "true" })).toBe("memory");
  });

  it("reaches a provider ONLY when asked for by name", () => {
    expect(selectTransportName({ MAIL_TRANSPORT: "resend" })).toBe("resend");
    // Every other way of holding it wrong lands on a sink, not on Resend.
    for (const env of [{}, { RESEND_API_KEY: "re_live_key" }, { MAIL_TRANSPORT: "" }, { MAIL_TRANSPORT: "production" }, { NODE_ENV: "production" }]) {
      expect(selectTransportName(env)).not.toBe("resend");
    }
  });
});

describe("REQ-NTF-008 / DEC-046 — RESEND_API_KEY is not read before Launch", () => {
  it("is never touched in development", () => {
    const { env, read } = spyEnv({ RESEND_API_KEY: "re_live_key" });
    expect(createTransport(env).name).toBe("smtp-sink");
    expect(read).not.toContain("RESEND_API_KEY");
  });

  it("is never touched in CI", () => {
    const { env, read } = spyEnv({ CI: "true", RESEND_API_KEY: "re_live_key" });
    expect(createTransport(env).name).toBe("memory");
    expect(read).not.toContain("RESEND_API_KEY");
  });

  it("is read only once the transport is named, and refuses to construct without it", () => {
    const { env, read } = spyEnv({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_test_key" });
    expect(createTransport(env).name).toBe("resend");
    expect(read).toContain("RESEND_API_KEY");
    expect(() => createTransport({ MAIL_TRANSPORT: "resend" })).toThrow(/Launch input/);
  });
});

describe("fromAddress", () => {
  it("is the one platform-verified sending address (08 §3.4, OQ-016)", () => {
    expect(fromAddress({})).toBe(DEFAULT_FROM_ADDRESS);
    expect(fromAddress({ MAIL_FROM_ADDRESS: "hello@example.test" })).toBe("hello@example.test");
  });
});

describe("MemoryTransport", () => {
  it("returns a provider message id and keeps the bytes for inspection", async () => {
    const transport = new MemoryTransport();
    const sent = await transport.send({
      to: "sara@kareem.example",
      fromName: "كريم معرفة",
      fromAddress: DEFAULT_FROM_ADDRESS,
      replyTo: "admin@kareem.example",
      subject: "حصلت على مقعد في جلسة",
      html: "<p>مرحبًا</p>",
      text: "مرحبًا",
    });
    expect(sent.providerMessageId).toMatch(/^mem_1_/);
    expect(transport.sent).toHaveLength(1);
    // The captured MIME is what makes REQ-NTF-008 testable now rather than
    // after Launch: the subject really is RFC 2047 encoded, in CI.
    expect(transport.sent[0].mime).toContain("=?UTF-8?B?");
    expect(transport.sent[0].mime).toContain("Reply-To: admin@kareem.example");
  });

  it("can be made to fail once, so the failure path has something to exercise", async () => {
    const transport = new MemoryTransport();
    transport.failNext = "mailbox full";
    await expect(transport.send({ to: "a@b.c", fromName: "x", fromAddress: "y@z.c", subject: "s", html: "h", text: "t" })).rejects.toThrow("mailbox full");
    // And only once — the next send succeeds, like a real transient failure.
    await expect(transport.send({ to: "a@b.c", fromName: "x", fromAddress: "y@z.c", subject: "s", html: "h", text: "t" })).resolves.toBeTruthy();
  });
});
