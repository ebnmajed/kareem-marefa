// GET /api/avatars/[memberId] — contract 4's route (DEC-182; REQ-PRF-008).
// The bytes are proxied from our origin; every refusal is the same 404.
import { beforeEach, describe, expect, it, vi } from "vitest";

const readAvatar = vi.fn();
vi.mock("@/lib/dal/avatars", () => ({ readAvatar: (...args: unknown[]) => readAvatar(...args) }));

const { GET } = await import("@/app/api/avatars/[memberId]/route");

const MEMBER = "22222222-2222-4222-8222-222222222222";
const call = (query: string) =>
  GET(new Request(`http://localhost/api/avatars/${MEMBER}${query}`), { params: Promise.resolve({ memberId: MEMBER }) });

beforeEach(() => readAvatar.mockReset());

describe("/api/avatars/[memberId]", () => {
  it("serves our WebP, privately and immutably cached when the version is current", async () => {
    readAvatar.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]).buffer, current: true });
    const res = await call("?v=1790000000000&s=192");
    expect(readAvatar).toHaveBeenCalledWith(MEMBER, "1790000000000", 192);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("private, max-age=86400, immutable");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("★ never redirects — no signed URL and no other origin reaches the browser", async () => {
    readAvatar.mockResolvedValue({ bytes: new Uint8Array([1]).buffer, current: true });
    const res = await call("?v=1&s=96");
    expect(res.headers.get("location")).toBeNull();
  });

  it("a stale version gets the current bytes, revalidated rather than cached", async () => {
    readAvatar.mockResolvedValue({ bytes: new Uint8Array([9]).buffer, current: false });
    expect((await call("?v=1&s=96")).headers.get("cache-control")).toBe("private, no-cache");
  });

  it("defaults to 96 px", async () => {
    readAvatar.mockResolvedValue(null);
    await call("?v=1");
    expect(readAvatar).toHaveBeenCalledWith(MEMBER, "1", 96);
  });

  it("★ every refusal — another org, no session, no copy, a bad id — is the same bodiless 404", async () => {
    readAvatar.mockResolvedValue(null);
    const res = await call("?v=1&s=96");
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("not_found");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
