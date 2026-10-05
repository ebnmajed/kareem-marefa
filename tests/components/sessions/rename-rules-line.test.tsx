// The event page's live rules line — REQ-CHK-019, REQ-CHK-018, DEC-255 D4 (wave 27).
//
// With the check-in code rotating, the line names the period; with it off it keeps its first clause and drops only the
// period. ★ The pending-points sentence never goes with the rotation — at a null that means «off» and at a null that
// means the settings read FAILED (`getEventFigures()` returns null for both, `checkin`'s contract 2).
import { describe, expect, it, vi } from "vitest";
import { rotationLineFor } from "@/components/sessions/event-actions";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));

const ORG = "00000000-0000-4000-8000-0000000000aa";
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const settings: { result: { data: unknown; error: unknown } } = { result: { data: null, error: null } };

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({
    session: { memberId: "m", orgId: ORG, role: "member" },
    supabase: {
      rpc: async () => ({ data: 7, error: null }),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => settings.result }) }) }),
    },
  }),
}));

const { getEventFigures } = await import("@/lib/dal/sessions");

describe("the rules line (REQ-CHK-019)", () => {
  it("a rotating code names its period, and the points follow", () => {
    expect(rotationLineFor(600, 10)).toEqual({ rotation: { key: "rotation", minutes: 10 }, points: 10 });
  });

  it("★ rotation off: no period — and the points sentence stays", () => {
    expect(rotationLineFor(null, 10)).toEqual({ rotation: { key: "rotationFixed" }, points: 10 });
  });

  it("no points to promise: none drawn, with or without a period (a +0 is never drawn)", () => {
    expect(rotationLineFor(null, 0).points).toBeNull();
    expect(rotationLineFor(600, null).points).toBeNull();
  });

  it("the setting null in the row reads as off, and the points survive it", async () => {
    settings.result = { data: { check_in_rotation_seconds: null }, error: null };
    const figures = await getEventFigures("ar", SESSION);
    expect(figures.rotationSeconds).toBeNull();
    expect(rotationLineFor(figures.rotationSeconds, 15)).toEqual({ rotation: { key: "rotationFixed" }, points: 15 });
  });

  it("★ a FAILED settings read prints no period it does not know — and the points survive it", async () => {
    settings.result = { data: null, error: { message: "boom" } };
    const figures = await getEventFigures("ar", "00000000-0000-4000-8000-0000000000c1");
    expect(figures.rotationSeconds).toBeNull();
    expect(figures.attendedCount).toBe(7);
    expect(rotationLineFor(figures.rotationSeconds, 15)).toEqual({ rotation: { key: "rotationFixed" }, points: 15 });
  });

  it("a rotating setting still reads through", async () => {
    settings.result = { data: { check_in_rotation_seconds: 900 }, error: null };
    const figures = await getEventFigures("ar", "00000000-0000-4000-8000-0000000000c2");
    expect(rotationLineFor(figures.rotationSeconds, null).rotation).toEqual({ key: "rotation", minutes: 15 });
  });
});
