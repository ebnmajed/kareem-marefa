// REQ-SES-022 — the event type's writes (0213). A new file.
//   · `setEventType()` calls `set_event_type()` by name and names its refusals;
//   · `createSessionDirect()` applies a chosen type after `create_session()`, and leaves a talk alone;
//   · `createProposal()` passes `p_event_type` — 0213's trailing parameter — by name.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));
vi.mock("@/lib/dal/posters", () => ({ getSessionPoster: async () => null }));

const SESSION = "00000000-0000-4000-8000-0000000000ee";
const CATEGORY = "4f2c9b1e-7d3a-4c8e-9b2f-1a6d5e8c3b70";
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const state: { rpc: Rpc; calls: { name: string; args: Record<string, unknown> }[] } = { rpc: async () => ({ data: SESSION, error: null }), calls: [] };

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({
    session: { memberId: "m", orgId: "org", role: "admin" },
    supabase: {
      rpc: (name: string, args: Record<string, unknown>) => {
        state.calls.push({ name, args });
        return state.rpc(name, args);
      },
    },
  }),
}));

const { setEventType, createSessionDirect, directSessionInput } = await import("@/lib/dal/sessions");
const { createProposal, proposalInput } = await import("@/lib/dal/proposals");

beforeEach(() => {
  state.rpc = async () => ({ data: SESSION, error: null });
  state.calls = [];
});

describe("setEventType", () => {
  it("sends the session and the type", async () => {
    expect(await setEventType("ar", SESSION, "workshop")).toEqual({ ok: true, eventType: "workshop" });
    expect(state.calls).toEqual([{ name: "set_event_type", args: { p_session: SESSION, p_type: "workshop" } }]);
  });

  it("names the function's refusal", async () => {
    state.rpc = async () => ({ data: null, error: { message: "not_an_admin" } });
    expect(await setEventType("ar", SESSION, "panel")).toEqual({ ok: false, error: "not_an_admin" });
  });

  it("refuses a malformed id before any call", async () => {
    expect(await setEventType("ar", "nope", "panel")).toEqual({ ok: false, error: "session_not_found" });
    expect(state.calls).toEqual([]);
  });
});

describe("createSessionDirect", () => {
  const base = { title: "عنوان الجلسة", abstract: "نبذة", categoryId: CATEGORY, level: "introductory", language: "ar", presenterIds: [] };

  it("is a talk when nothing was chosen, and sets nothing more", async () => {
    const input = directSessionInput.parse(base);
    expect(input.eventType).toBe("talk");
    await createSessionDirect("ar", input);
    expect(state.calls.map((c) => c.name)).toEqual(["create_session"]);
  });

  it("applies the chosen type through set_event_type, after the session exists", async () => {
    await createSessionDirect("ar", directSessionInput.parse({ ...base, eventType: "meetup" }));
    expect(state.calls).toEqual([
      expect.objectContaining({ name: "create_session" }),
      { name: "set_event_type", args: { p_session: SESSION, p_type: "meetup" } },
    ]);
  });

  it("refuses a type that is not one of the four", () => {
    expect(directSessionInput.safeParse({ ...base, eventType: "announcement" }).success).toBe(false);
  });
});

describe("createProposal", () => {
  it("passes p_event_type by name", async () => {
    const input = proposalInput.parse({
      title: "عنوان المقترح",
      abstract: "نبذة",
      categoryId: CATEGORY,
      level: "introductory",
      targetAudience: null,
      expectedDurationMinutes: null,
      adminNotes: null,
      eventType: "panel",
    });
    await createProposal("ar", input, false);
    expect(state.calls[0]).toEqual(expect.objectContaining({ name: "create_proposal", args: expect.objectContaining({ p_event_type: "panel" }) }));
  });
});
