// Wave 29, PR B — contract 3's DAL: the sheet's read and its three writes (DEC-280 §2 – §3, DEC-281; REQ-PRF-016,
// REQ-PRF-018, REQ-PRF-019), and the takedown's DAL call (REQ-PRF-019, REQ-ADM-010). Each write is ONE RPC; on `ok`
// it answers the sheet as it now stands. A key outside the library never reaches the database.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));

const ME = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const rpc = vi.fn();
vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: ME, orgId: "11111111-1111-4111-8111-111111111111", role: "admin" }, supabase: { rpc } }),
  getSessionState: async () => ({ kind: "none" }),
}));

const { getAvatarSheet, pickAvatarKey, removeAvatarPhoto, requestAvatarGoogle } = await import("@/lib/dal/avatars");
const { takeDownMemberPhoto } = await import("@/lib/dal/admin-members");

const mine = (over: Record<string, unknown> = {}) => ({ answer: null, has_source: true, version: null, key: "objects/reel", source: null, ...over });

beforeEach(() => rpc.mockReset());

describe("getAvatarSheet", () => {
  it("a library avatar: its SVG, its key, no photo source, Google offered", async () => {
    rpc.mockResolvedValue({ data: mine(), error: null });
    expect(await getAvatarSheet("ar")).toEqual({ href: "/avatars/objects/reel.svg", key: "objects/reel", source: null, googleAvailable: true });
  });

  it("an upload: our copy at 192 px, the source named — «أزل الصورة» applies", async () => {
    rpc.mockResolvedValue({ data: mine({ version: 1790000000500, source: "upload", has_source: false }), error: null });
    expect(await getAvatarSheet("ar")).toEqual({
      href: `/api/avatars/${ME}?v=1790000000500&s=192`,
      key: "objects/reel",
      source: "upload",
      googleAvailable: false,
    });
  });

  it("unreadable is «nothing to offer», never a throw", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    expect(await getAvatarSheet("ar")).toEqual({ href: null, key: null, source: null, googleAvailable: false });
  });
});

describe("the three writes", () => {
  it("★ pickAvatarKey refuses a key outside the library before any RPC", async () => {
    for (const key of ["objects/nope", "../x", 7, null]) expect(await pickAvatarKey("ar", key)).toEqual({ status: "invalid_key" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("pickAvatarKey: one RPC, then the sheet as it now stands", async () => {
    rpc.mockResolvedValueOnce({ data: { status: "ok" }, error: null }).mockResolvedValueOnce({ data: mine({ key: "characters/actor" }), error: null });
    const got = await pickAvatarKey("ar", "characters/actor");
    expect(rpc).toHaveBeenNthCalledWith(1, "set_avatar_library", { p_key: "characters/actor" });
    expect(got).toEqual({ status: "ok", sheet: { href: "/avatars/characters/actor.svg", key: "characters/actor", source: null, googleAvailable: true } });
  });

  it("removeAvatarPhoto and requestAvatarGoogle pass the database's own refusal through", async () => {
    rpc.mockResolvedValue({ data: { status: "no_photo" }, error: null });
    expect(await removeAvatarPhoto("ar")).toEqual({ status: "no_photo" });
    expect(rpc).toHaveBeenCalledWith("remove_avatar_photo", undefined);
    rpc.mockResolvedValue({ data: { status: "no_source" }, error: null });
    expect(await requestAvatarGoogle("ar")).toEqual({ status: "no_source" });
    expect(rpc).toHaveBeenCalledWith("request_avatar_google", undefined);
  });

  it("a raised error or an unknown answer is `failed`", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not_a_member" } });
    expect(await removeAvatarPhoto("ar")).toEqual({ status: "failed" });
    rpc.mockResolvedValue({ data: { status: "surprise" }, error: null });
    expect(await requestAvatarGoogle("ar")).toEqual({ status: "failed" });
  });
});

describe("takeDownMemberPhoto (SCR-049)", () => {
  it("calls take_down_avatar for the member and maps its answers", async () => {
    rpc.mockResolvedValue({ data: { status: "ok" }, error: null });
    expect(await takeDownMemberPhoto("ar", OTHER)).toEqual({ error: null });
    expect(rpc).toHaveBeenCalledWith("take_down_avatar", { p_member: OTHER });
    rpc.mockResolvedValue({ data: { status: "no_photo" }, error: null });
    expect(await takeDownMemberPhoto("ar", OTHER)).toEqual({ error: "no_photo" });
    rpc.mockResolvedValue({ data: { status: "not_found" }, error: null });
    expect(await takeDownMemberPhoto("ar", OTHER)).toEqual({ error: "member_not_found" });
    rpc.mockResolvedValue({ data: null, error: { message: "not_an_admin" } });
    expect(await takeDownMemberPhoto("ar", OTHER)).toEqual({ error: "not_an_admin" });
  });

  it("a malformed id never reaches the database", async () => {
    expect(await takeDownMemberPhoto("ar", "x")).toEqual({ error: "failed" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
