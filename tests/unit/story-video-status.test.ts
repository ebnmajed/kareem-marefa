// GET /api/stories/video/{frameId} — the author's poll (REQ-STO-016, notes/story-media.md §1.2 step 4).
//
// WHO may read a frame is RLS's (`story_frames_read_own`, 0198) and the DAL answers only for the caller's own frame; a
// unit test mocking the DAL cannot prove that. What IS the handler's: a malformed id never reaches the DAL; anything
// the DAL does not answer is a 404 with no detail; every answer is uncached; a refusal of the session is a 403.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getMyStoryVideoStatus = vi.fn();
vi.mock("@/lib/dal/story-frames", () => ({ getMyStoryVideoStatus: (...a: unknown[]) => getMyStoryVideoStatus(...a) }));

const route = await import("@/app/api/stories/video/[frameId]/route");
const ID = "5f0c1d7e-2b8e-4b7a-9d3a-0e6f1c2a4b5c";
const get = (id: string) => route.GET(new Request(`https://kareem.pp.sa/api/stories/video/${id}`, { headers: { "x-locale": "ar" } }), { params: Promise.resolve({ frameId: id }) });

describe("the author's poll", () => {
  beforeEach(() => getMyStoryVideoStatus.mockReset());

  it("refuses a malformed id before the DAL", async () => {
    const res = await get("not-a-uuid");
    expect(res.status).toBe(400);
    expect(getMyStoryVideoStatus).not.toHaveBeenCalled();
  });

  it("passes processing, visible and failed through as they are, uncached", async () => {
    for (const status of [{ state: "processing" }, { state: "visible", durationMs: 15000, posterUrl: "https://x/p.webp" }, { state: "failed", reason: "too_long" }]) {
      getMyStoryVideoStatus.mockResolvedValueOnce(status);
      const res = await get(ID);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.json()).toEqual(status);
    }
    expect(getMyStoryVideoStatus).toHaveBeenCalledWith("ar", ID);
  });

  it("answers 404 for a frame that is not the caller's — the same as one that does not exist", async () => {
    getMyStoryVideoStatus.mockResolvedValueOnce(null);
    const res = await get(ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("translates a refused session to 403 and anything else to 500, never a raw message", async () => {
    getMyStoryVideoStatus.mockRejectedValueOnce(new Error("not_authorized"));
    expect((await get(ID)).status).toBe(403);
    getMyStoryVideoStatus.mockRejectedValueOnce(new Error("story_frames (status): boom"));
    const res = await get(ID);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "upload_failed" });
  });
});
