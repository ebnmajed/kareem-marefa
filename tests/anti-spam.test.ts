import { beforeAll, describe, expect, it } from "vitest";
import {
  createFormToken,
  verifyFormToken,
  isRateLimited,
  MIN_SUBMIT_MS,
  MAX_TOKEN_AGE_MS,
} from "@/lib/anti-spam";

beforeAll(() => {
  process.env.FORM_TOKEN_SECRET = "test-secret";
});

describe("form token", () => {
  it("round-trips after the minimum wait", () => {
    const t0 = 1_700_000_000_000;
    const token = createFormToken(t0);
    expect(verifyFormToken(token, t0 + MIN_SUBMIT_MS + 1)).toBe("valid");
  });

  it("rejects a tampered signature", () => {
    const t0 = 1_700_000_000_000;
    const token = createFormToken(t0);
    expect(verifyFormToken(`${token}ff`, t0 + 10_000)).toBe("invalid");
    expect(verifyFormToken("garbage", t0)).toBe("invalid");
    expect(verifyFormToken("", t0)).toBe("invalid");
  });

  it("rejects a too-fast submission", () => {
    const t0 = 1_700_000_000_000;
    const token = createFormToken(t0);
    expect(verifyFormToken(token, t0 + MIN_SUBMIT_MS - 1)).toBe("tooFast");
  });

  it("rejects a replayed (expired) token", () => {
    const t0 = 1_700_000_000_000;
    const token = createFormToken(t0);
    expect(verifyFormToken(token, t0 + MAX_TOKEN_AGE_MS + 1)).toBe("expired");
  });
});

describe("rate-limit tripwire", () => {
  it("trips per ip+email after 5 in-window submissions", () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited("10.0.0.1", "a@x.com", t0 + i)).toBe(false);
    }
    expect(isRateLimited("10.0.0.1", "a@x.com", t0 + 10)).toBe(true);
  });

  it("lets many distinct emails share one corporate NAT IP", () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 30; i++) {
      expect(isRateLimited("10.0.0.2", `user${i}@x.com`, t0 + i)).toBe(false);
    }
  });
});
