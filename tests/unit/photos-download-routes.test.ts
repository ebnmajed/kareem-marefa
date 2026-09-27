// The three photo download routes — the handlers' contract (REQ-ADM-021,
// DEC-180 contract 1, DEC-182).
//
// WHO may take a file is the three audit definers' (`0156`, the lead's, with
// their own tests in `photo-downloads*`); a unit test mocking the DAL cannot
// prove it. What IS the handlers': a malformed id never reaches the DAL; every
// refusal answers one way, back to the page at `#photos` with
// `?download=photo_failed` / `album_failed` — never `failed`, the poster's —
// and never a raw body; «back» never leaves this origin; a download is a `303`
// with nothing cached; and «تنزيل الكل» returns at once, refusing a POST from
// another origin before the DAL is reached.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const recordPhotoDownload = vi.fn();
const requestPhotoAlbum = vi.fn();
const recordPhotoAlbumDownload = vi.fn();
vi.mock("@/lib/dal/photos", () => ({
  recordPhotoDownload: (...a: unknown[]) => recordPhotoDownload(...a),
  requestPhotoAlbum: (...a: unknown[]) => requestPhotoAlbum(...a),
  recordPhotoAlbumDownload: (...a: unknown[]) => recordPhotoAlbumDownload(...a),
}));

const photoRoute = await import("@/app/api/photos/[photoId]/download/route");
const albumRoute = await import("@/app/api/photos/albums/[sessionId]/route");
const albumDownloadRoute = await import("@/app/api/photos/albums/[sessionId]/download/route");

const ORIGIN = "https://kareem.pp.sa";
const ID = "5f0c1d7e-2b8e-4b7a-9d3a-0e6f1c2a4b5c";
const PAGE = `${ORIGIN}/ar/app/sessions/${ID}?tab=1`;

const getPhoto = (id: string, referer?: string) =>
  photoRoute.GET(new Request(`${ORIGIN}/api/photos/${id}/download`, { headers: referer ? { referer } : {} }), { params: Promise.resolve({ photoId: id }) });
const postAlbum = (id: string, headers: Record<string, string>) =>
  albumRoute.POST(new Request(`${ORIGIN}/api/photos/albums/${id}`, { method: "POST", headers }), { params: Promise.resolve({ sessionId: id }) });
const getAlbum = (id: string, query: string, referer?: string) =>
  albumDownloadRoute.GET(new Request(`${ORIGIN}/api/photos/albums/${id}/download${query}`, { headers: referer ? { referer } : {} }), {
    params: Promise.resolve({ sessionId: id }),
  });

const location = (res: Response) => new URL(res.headers.get("location") as string);

beforeEach(() => {
  recordPhotoDownload.mockReset();
  requestPhotoAlbum.mockReset();
  recordPhotoAlbumDownload.mockReset();
});

describe("GET /api/photos/{photoId}/download", () => {
  it("★ a download is a 303 to the URL minted after the audit, uncached", async () => {
    recordPhotoDownload.mockResolvedValueOnce({ status: "ok", url: "https://storage.example/signed?token=t" });
    const res = await getPhoto(ID, PAGE);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://storage.example/signed?token=t");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(recordPhotoDownload).toHaveBeenCalledWith("ar", ID);
  });

  it("★ a refusal and a failure answer one way — back to the page at #photos, ?download=photo_failed", async () => {
    for (const status of ["refused", "failed"] as const) {
      recordPhotoDownload.mockResolvedValueOnce({ status });
      const res = await getPhoto(ID, PAGE);
      expect(res.status).toBe(303);
      const back = location(res);
      expect(back.pathname).toBe(`/ar/app/sessions/${ID}`);
      expect(back.searchParams.get("download")).toBe("photo_failed");
      expect(back.searchParams.get("tab")).toBe("1");
      expect(back.hash).toBe("#photos");
      expect(await res.text()).toBe("");
    }
  });

  it("a malformed id never reaches the DAL", async () => {
    const res = await getPhoto("not-a-uuid", PAGE);
    expect(location(res).searchParams.get("download")).toBe("photo_failed");
    expect(recordPhotoDownload).not.toHaveBeenCalled();
  });

  it("«back» never leaves this origin: another origin's Referer falls back to the app's home", async () => {
    recordPhotoDownload.mockResolvedValueOnce({ status: "refused" });
    const back = location(await getPhoto(ID, "https://evil.example/ar/app"));
    expect(back.origin).toBe(ORIGIN);
    expect(back.pathname).toBe("/ar/app");
  });

  it("an earlier failure's parameter is replaced, not stacked", async () => {
    recordPhotoDownload.mockResolvedValueOnce({ status: "ok", url: "https://storage.example/x" });
    recordPhotoDownload.mockResolvedValueOnce({ status: "failed" });
    await getPhoto(ID, PAGE);
    const back = location(await getPhoto(ID, `${PAGE}&download=album_failed`));
    expect(back.searchParams.getAll("download")).toEqual(["photo_failed"]);
  });
});

describe("POST /api/photos/albums/{sessionId} — «تنزيل الكل»", () => {
  it("★ returns at once: queued → back to the page at #photos, with no failure parameter", async () => {
    requestPhotoAlbum.mockResolvedValueOnce({ status: "queued" });
    const res = await postAlbum(ID, { origin: ORIGIN, referer: PAGE });
    expect(res.status).toBe(303);
    const back = location(res);
    expect(back.pathname).toBe(`/ar/app/sessions/${ID}`);
    expect(back.searchParams.get("download")).toBeNull();
    expect(back.hash).toBe("#photos");
    expect(requestPhotoAlbum).toHaveBeenCalledWith("ar", ID);
  });

  it("a refusal, an empty album and a failure all come back as ?download=album_failed", async () => {
    for (const status of ["refused", "empty", "failed"] as const) {
      requestPhotoAlbum.mockResolvedValueOnce({ status });
      const res = await postAlbum(ID, { origin: ORIGIN, referer: PAGE });
      expect(location(res).searchParams.get("download")).toBe("album_failed");
    }
  });

  it("★ a POST from another origin, or with no Origin, never reaches the DAL", async () => {
    for (const headers of [{ origin: "https://evil.example", referer: PAGE }, { referer: PAGE }] as Record<string, string>[]) {
      const res = await postAlbum(ID, headers);
      expect(location(res).searchParams.get("download")).toBe("album_failed");
    }
    expect(requestPhotoAlbum).not.toHaveBeenCalled();
  });

  it("a malformed session id never reaches the DAL", async () => {
    await postAlbum("nope", { origin: ORIGIN, referer: PAGE });
    expect(requestPhotoAlbum).not.toHaveBeenCalled();
  });
});

describe("GET /api/photos/albums/{sessionId}/download", () => {
  it("★ part defaults to 1, and a download is a 303, uncached", async () => {
    recordPhotoAlbumDownload.mockResolvedValueOnce({ status: "ok", url: "https://storage.example/part1" });
    const res = await getAlbum(ID, "", PAGE);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://storage.example/part1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(recordPhotoAlbumDownload).toHaveBeenCalledWith("ar", ID, 1);
  });

  it("passes the part it was asked for", async () => {
    recordPhotoAlbumDownload.mockResolvedValueOnce({ status: "ok", url: "https://storage.example/part3" });
    await getAlbum(ID, "?part=3", PAGE);
    expect(recordPhotoAlbumDownload).toHaveBeenCalledWith("ar", ID, 3);
  });

  it("a malformed part or id never reaches the DAL", async () => {
    for (const query of ["?part=0", "?part=-1", "?part=two", "?part=1.5"]) {
      const res = await getAlbum(ID, query, PAGE);
      expect(location(res).searchParams.get("download")).toBe("album_failed");
    }
    await getAlbum("nope", "", PAGE);
    expect(recordPhotoAlbumDownload).not.toHaveBeenCalled();
  });

  it("a refusal comes back as ?download=album_failed at #photos", async () => {
    recordPhotoAlbumDownload.mockResolvedValueOnce({ status: "refused" });
    const back = location(await getAlbum(ID, "?part=2", PAGE));
    expect(back.searchParams.get("download")).toBe("album_failed");
    expect(back.hash).toBe("#photos");
  });
});
