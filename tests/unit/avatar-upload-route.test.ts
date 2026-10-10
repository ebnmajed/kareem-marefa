// Wave 29, PR B — the upload's two routes and the DAL behind them (DEC-280 §2, DEC-281; REQ-PRF-017).
//
// `POST /api/avatars/upload` refuses the declared type (415) and the size by header AND by the counted stream (413)
// before anything reaches Storage; ★ it does not sniff — the worker refuses an SVG renamed `.png` after it lands. The
// bytes are written AS THE MEMBER under their own staging prefix and `begin_avatar_upload()` records them. `GET
// /api/avatars/upload/{id}` answers the caller's own upload and 404s everything else alike.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/avatar-upload";

vi.mock("server-only", () => ({}));

const ORG = "11111111-1111-4111-8111-111111111111";
const ME = "22222222-2222-4222-8222-222222222222";
const UPLOAD = "6f0d8a52-6a43-4c55-8f53-0f8d7e1d2c01";

const state = {
  session: { kind: "member", session: { memberId: ME, orgId: ORG, role: "member" } } as { kind: string; session?: { memberId: string; orgId: string; role: string } },
  stored: [] as { bucket: string; path: string; bytes: Uint8Array; contentType?: string }[],
  storageError: null as { message: string } | null,
  rpc: vi.fn(),
};

vi.mock("@/lib/dal/session", () => ({
  getSessionState: async () => state.session,
  sessionClient: async () => ({ session: state.session.session, supabase: client() }),
}));
function client() {
  return {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array, opts: { contentType?: string }) => {
          if (state.storageError) return { error: state.storageError };
          state.stored.push({ bucket, path, bytes, contentType: opts.contentType });
          return { error: null };
        },
      }),
    },
    rpc: (...args: unknown[]) => state.rpc(...args),
  };
}
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => client() }));

const { POST } = await import("@/app/api/avatars/upload/route");
const { GET } = await import("@/app/api/avatars/upload/[uploadId]/route");

const post = (body: BodyInit | null, headers: Record<string, string>) =>
  POST(new Request("http://localhost/api/avatars/upload", { method: "POST", body, headers, duplex: "half" } as RequestInit));

const jpeg = (n: number) => new Uint8Array(n).fill(0xab);

beforeEach(() => {
  state.session = { kind: "member", session: { memberId: ME, orgId: ORG, role: "member" } };
  state.stored = [];
  state.storageError = null;
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({ data: { status: "ok" }, error: null });
});

describe("POST /api/avatars/upload", () => {
  it("★ 202 — the bytes land under the member's OWN staging prefix, as the member, and the upload is recorded", async () => {
    const res = await post(jpeg(1000), { "content-type": "image/jpeg", "content-length": "1000" });
    expect(res.status).toBe(202);
    const { uploadId } = (await res.json()) as { uploadId: string };
    expect(uploadId).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.stored).toHaveLength(1);
    expect(state.stored[0]).toMatchObject({ bucket: "avatar-staging", path: `${ORG}/members/${ME}/${uploadId}`, contentType: "image/jpeg" });
    expect(state.stored[0].bytes.byteLength).toBe(1000);
    expect(state.rpc).toHaveBeenCalledWith("begin_avatar_upload", { p_upload: uploadId });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["image/svg+xml", "image/webp", "image/gif", "text/plain", ""])("415 for a declared %s — nothing stored", async (type) => {
    const res = await post(jpeg(10), { "content-type": type, "content-length": "10" });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "png_jpg_only" });
    expect(state.stored).toHaveLength(0);
  });

  it("★ does NOT sniff — SVG bytes declared as PNG are stored for the worker to refuse after they land (REQ-PRF-017)", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const res = await post(svg, { "content-type": "image/png", "content-length": String(svg.byteLength) });
    expect(res.status).toBe(202);
    expect(state.stored).toHaveLength(1);
  });

  it("413 when the header says more than 1 MiB", async () => {
    const res = await post(jpeg(10), { "content-type": "image/jpeg", "content-length": String(MAX_UPLOAD_BYTES + 1) });
    expect(res.status).toBe(413);
    expect(state.stored).toHaveLength(0);
  });

  it("★ 413 when the header lies — the stream is counted and cut one byte past the cap", async () => {
    const res = await post(jpeg(MAX_UPLOAD_BYTES + 1), { "content-type": "image/jpeg", "content-length": "100" });
    expect(res.status).toBe(413);
    expect(state.stored).toHaveLength(0);
  });

  it("exactly 1 MiB is accepted", async () => {
    const res = await post(jpeg(MAX_UPLOAD_BYTES), { "content-type": "image/jpeg", "content-length": String(MAX_UPLOAD_BYTES) });
    expect(res.status).toBe(202);
  });

  it("401 without a member session — a status, never a redirect", async () => {
    state.session = { kind: "none" };
    const res = await post(jpeg(10), { "content-type": "image/jpeg", "content-length": "10" });
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    expect(state.stored).toHaveLength(0);
  });

  it("500 when Storage refuses, or the RPC does", async () => {
    state.storageError = { message: "new row violates row-level security policy" };
    expect((await post(jpeg(10), { "content-type": "image/jpeg", "content-length": "10" })).status).toBe(500);
    state.storageError = null;
    state.rpc.mockResolvedValue({ data: null, error: { message: "not_a_member" } });
    expect((await post(jpeg(10), { "content-type": "image/jpeg", "content-length": "10" })).status).toBe(500);
  });
});

describe("GET /api/avatars/upload/{uploadId}", () => {
  const get = (id: string) => GET(new Request(`http://localhost/api/avatars/upload/${id}`), { params: Promise.resolve({ uploadId: id }) });

  it.each(["pending", "refused", "failed", "cancelled"])("answers %s with no href", async (s) => {
    state.rpc.mockResolvedValue({ data: { state: s, version: null, key: "objects/reel" }, error: null });
    const res = await get(UPLOAD);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: s, href: null });
    expect(state.rpc).toHaveBeenCalledWith("my_avatar_upload", { p_upload: UPLOAD });
  });

  it("★ done carries the new picture's same-origin href", async () => {
    state.rpc.mockResolvedValue({ data: { state: "done", version: 1790000000500, key: "objects/reel" }, error: null });
    expect(await (await get(UPLOAD)).json()).toEqual({ state: "done", href: `/api/avatars/${ME}?v=1790000000500&s=192` });
  });

  it("another member's id, an unknown one, a malformed one and no session are the same 404", async () => {
    state.rpc.mockResolvedValue({ data: null, error: null });
    expect((await get(UPLOAD)).status).toBe(404);
    expect((await get("not-a-uuid")).status).toBe(404);
    state.session = { kind: "none" };
    expect((await get(UPLOAD)).status).toBe(404);
  });
});

describe("MAX_UPLOAD_BYTES", () => {
  it("is 1 MiB — the staging bucket's `file_size_limit` in 0222", () => {
    expect(MAX_UPLOAD_BYTES).toBe(1_048_576);
  });
});
