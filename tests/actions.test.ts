import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({ insert: insertMock }) },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));

process.env.FORM_TOKEN_SECRET = "test-secret";

import { submitRegistration } from "@/app/[locale]/register/actions";
import {
  createFormToken,
  verifyFormToken,
  HONEYPOT_FIELD,
  MIN_SUBMIT_MS,
  MAX_TOKEN_AGE_MS,
} from "@/lib/anti-spam";

const prev = { status: "idle" as const };

function makeFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    role: "provider",
    name: "Yaman Reda",
    email: "Yaman@Example.com",
    topicTitle: "Cutting reporting time in half",
    topicDescription: "",
    topicCategory: "technical",
    locale: "ar",
    form_token: createFormToken(Date.now() - MIN_SUBMIT_MS - 1000),
    [HONEYPOT_FIELD]: "",
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    fd.set(k, v);
  }
  return fd;
}

beforeEach(() => {
  insertMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
});

describe("submitRegistration", () => {
  it("inserts a snake_case provider row with locale and null empty description", async () => {
    const state = await submitRegistration(prev, makeFormData());
    expect(state.status).toBe("success");
    expect(state.role).toBe("provider");
    expect(insertMock).toHaveBeenCalledWith({
      name: "Yaman Reda",
      email: "yaman@example.com", // normalized
      role: "provider",
      locale: "ar",
      topic_title: "Cutting reporting time in half",
      topic_description: null, // '' → null
      topic_category: "technical",
    });
  });

  it("nulls all topic fields for attendees even if submitted (kept-but-hidden)", async () => {
    const state = await submitRegistration(
      prev,
      makeFormData({ role: "attendee", topicTitle: "left over from switch" }),
    );
    expect(state.status).toBe("success");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "attendee",
        topic_title: null,
        topic_description: null,
        topic_category: null,
      }),
    );
  });

  it("maps unique-violation 23505 to the duplicate state", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505", message: "dup" } });
    const state = await submitRegistration(prev, makeFormData());
    expect(state.status).toBe("duplicate");
    expect(state.role).toBe("provider");
  });

  it("returns field error keys and echoes values on validation failure", async () => {
    const state = await submitRegistration(
      prev,
      makeFormData({ email: "broken", name: "Kept Name" }),
    );
    expect(state.status).toBe("error");
    expect(state.errors?.email).toBe("emailInvalid");
    expect(state.values?.name).toBe("Kept Name"); // React 19 reset antidote
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns fake success on honeypot without inserting", async () => {
    const state = await submitRegistration(
      prev,
      makeFormData({ [HONEYPOT_FIELD]: "bot filled me" }),
    );
    expect(state.status).toBe("success");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns fake success on a tampered token without inserting", async () => {
    const state = await submitRegistration(
      prev,
      makeFormData({ form_token: "1234.tampered" }),
    );
    expect(state.status).toBe("success");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns a retryable error + fresh token on a too-fast submit", async () => {
    const state = await submitRegistration(
      prev,
      makeFormData({ form_token: createFormToken(Date.now()) }),
    );
    expect(state.status).toBe("error");
    expect(state.errors?.form).toBe("retry");
    expect(state.freshToken).toBeDefined();
    // the replacement still enforces the minimum wait
    expect(verifyFormToken(state.freshToken!)).toBe("tooFast");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns a retryable error + immediately-usable token on an expired token", async () => {
    const state = await submitRegistration(
      prev,
      makeFormData({
        form_token: createFormToken(Date.now() - MAX_TOKEN_AGE_MS - 1000),
      }),
    );
    expect(state.status).toBe("error");
    expect(state.errors?.form).toBe("retry");
    // expired sessions already proved patience: replacement is pre-aged
    expect(verifyFormToken(state.freshToken!)).toBe("valid");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns a real network error key on unexpected insert failure", async () => {
    insertMock.mockResolvedValue({ error: { code: "XX000", message: "boom" } });
    const state = await submitRegistration(prev, makeFormData());
    expect(state.status).toBe("error");
    expect(state.errors?.form).toBe("network");
  });
});
