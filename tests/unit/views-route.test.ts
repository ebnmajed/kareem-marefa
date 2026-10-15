// POST /api/views and GET /api/views/{kind}/{id} — the handlers' contract (REQ-VEW-001 … 006, DEC-297,
// notes/views.md §1). WHO may record, count and list is the definer functions' (tests/rls/views.test.ts); a unit test
// mocking the DAL cannot prove it. What IS the handlers': shape before anything; a well-formed batch is always 204
// with no body; no session is a 401, never a redirect; a refused list is a 404 indistinguishable from a missing
// subject; nothing is cached.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const recordViews = vi.fn();
const getViewerList = vi.fn();
const hasMemberSession = vi.fn();
vi.mock("@/lib/dal/views", async () => {
  const real = await vi.importActual<typeof import("@/lib/dal/views")>("@/lib/dal/views");
  return {
    VIEW_KINDS: real.VIEW_KINDS,
    recordViewsInput: real.recordViewsInput,
    recordViews: (...a: unknown[]) => recordViews(...a),
    getViewerList: (...a: unknown[]) => getViewerList(...a),
    hasMemberSession: () => hasMemberSession(),
  };
});
vi.mock("@/lib/dal/session", () => ({ getSessionState: vi.fn(), sessionClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }));

const post = await import("@/app/api/views/route");
const list = await import("@/app/api/views/[kind]/[id]/route");
const { collapseViews } = await vi.importActual<typeof import("@/lib/dal/views")>("@/lib/dal/views");

const ID = "5f0c1d7e-2b8e-4b7a-9d3a-0e6f1c2a4b5c";
const ID2 = "6a1d2e8f-3c9f-4c8b-8e4b-1f7a2d3b5c6d";
const send = (body: unknown) =>
  post.POST(new Request("https://kareem.pp.sa/api/views", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
const getList = (kind: string, id: string) =>
  list.GET(new Request(`https://kareem.pp.sa/api/views/${kind}/${id}`), { params: Promise.resolve({ kind, id }) });

describe("POST /api/views", () => {
  beforeEach(() => {
    recordViews.mockReset().mockResolvedValue(1);
    hasMemberSession.mockReset().mockResolvedValue(true);
  });

  it("answers 204 with no body for a well-formed batch — whatever was recorded, even nothing", async () => {
    for (const recorded of [3, 0]) {
      recordViews.mockResolvedValueOnce(recorded);
      const res = await send({ views: [{ kind: "frame", id: ID, completed: true }, { kind: "post", id: ID2 }] });
      expect(res.status).toBe(204);
      expect(await res.text()).toBe("");
    }
  });

  it("accepts the beacon's body (a JSON string with no special header)", async () => {
    const res = await post.POST(new Request("https://kareem.pp.sa/api/views", { method: "POST", body: new Blob([JSON.stringify({ views: [{ kind: "announcement", id: ID }] })], { type: "application/json" }) }));
    expect(res.status).toBe(204);
  });

  it("refuses bad shape before the session or the database: not JSON, empty, over 50, an unknown kind, a non-uuid, an extra key", async () => {
    const many = Array.from({ length: 51 }, () => ({ kind: "post", id: ID }));
    for (const body of ["{not json", { views: [] }, { views: many }, { views: [{ kind: "photo", id: ID }] }, { views: [{ kind: "post", id: "x" }] }, { views: [{ kind: "post", id: ID, who: "me" }] }]) {
      const res = await send(body);
      expect(res.status).toBe(400);
    }
    expect(recordViews).not.toHaveBeenCalled();
    expect(hasMemberSession).not.toHaveBeenCalled();
  });

  it("answers 401 without a member session — never a redirect", async () => {
    hasMemberSession.mockResolvedValueOnce(false);
    const res = await send({ views: [{ kind: "post", id: ID }] });
    expect(res.status).toBe(401);
    expect(recordViews).not.toHaveBeenCalled();
  });

  it("answers 500 views_failed when the database fails, never its message", async () => {
    recordViews.mockRejectedValueOnce(new Error("record_views: secret detail"));
    const res = await send({ views: [{ kind: "post", id: ID }] });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "views_failed" });
  });
});

describe("collapseViews — one entry per subject", () => {
  it("drops a repeat and keeps `completed: true` from any of them", () => {
    expect(collapseViews([{ kind: "frame", id: ID }, { kind: "frame", id: ID.toUpperCase(), completed: true }, { kind: "post", id: ID }])).toEqual([
      { kind: "frame", id: ID, completed: true },
      { kind: "post", id: ID },
    ]);
  });
});

describe("GET /api/views/{kind}/{id}", () => {
  beforeEach(() => {
    getViewerList.mockReset();
    hasMemberSession.mockReset().mockResolvedValue(true);
  });

  it("returns the list, uncached", async () => {
    const body = { viewers: [{ memberId: ID2, name: "ريم", avatarHref: null, day: "2026-10-15" }], total: 1 };
    getViewerList.mockResolvedValueOnce(body);
    const res = await getList("recap", ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual(body);
  });

  it("answers 404 for a refusal — the same as a subject that does not exist", async () => {
    getViewerList.mockResolvedValueOnce(null);
    const res = await getList("frame", ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("refuses a bad kind or id before the DAL, and no session with 401", async () => {
    expect((await getList("story_frame", ID)).status).toBe(400);
    expect((await getList("post", "nope")).status).toBe(400);
    hasMemberSession.mockResolvedValueOnce(false);
    expect((await getList("post", ID)).status).toBe(401);
    expect(getViewerList).not.toHaveBeenCalled();
  });
});
