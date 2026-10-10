// The crop's pure parts — the geometry, the JPEG ladder and the upload's poll (REQ-PRF-017, AVA-06, AVA-07, DEC-281).
import { afterEach, describe, expect, it, vi } from "vitest";
import { centreOn, clampView, coverScale, sourceSquare, zoomAbout, ZOOM_MAX } from "@/components/avatar-picker/crop-geometry";
import { encodeUnder, QUALITIES } from "@/components/avatar-picker/encode";
import { uploadPicture } from "@/components/avatar-picker/upload";

const LANDSCAPE = { width: 800, height: 600 };
const CIRCLE = 300;

describe("crop geometry", () => {
  it("covers the circle with the shorter side at zoom 1", () => {
    expect(coverScale(LANDSCAPE, CIRCLE)).toBeCloseTo(0.5);
    // At zoom 1 the square is the image's full height, centred.
    expect(sourceSquare(LANDSCAPE, CIRCLE, { zoom: 1, x: 0, y: 0 })).toEqual({ sx: 100, sy: 0, side: 600 });
  });

  it("never leaves an empty corner: the offset is clamped to the image's overhang", () => {
    // 800·0.5 = 400 px wide on the stage, 50 px of overhang each side; no vertical overhang.
    expect(clampView(LANDSCAPE, CIRCLE, { zoom: 1, x: 500, y: -90 })).toEqual({ zoom: 1, x: 50, y: 0 });
    expect(clampView(LANDSCAPE, CIRCLE, { zoom: 9, x: 0, y: 0 }).zoom).toBe(ZOOM_MAX);
    expect(clampView(LANDSCAPE, CIRCLE, { zoom: 0.2, x: 0, y: 0 }).zoom).toBe(1);
  });

  it("zooms about the circle's centre — the point under it stays under it", () => {
    const before = { zoom: 1, x: 40, y: 0 };
    const after = zoomAbout(LANDSCAPE, CIRCLE, before, 2);
    const centre = (v: typeof before) => {
      const s = sourceSquare(LANDSCAPE, CIRCLE, v);
      return [s.sx + s.side / 2, s.sy + s.side / 2];
    };
    expect(centre(after)[0]).toBeCloseTo(centre(before)[0]);
    expect(centre(after)[1]).toBeCloseTo(centre(before)[1]);
  });

  it("★ a tap brings the tapped point to the centre — the drag's single-pointer path (DEC-093)", () => {
    const view = { zoom: 2, x: 0, y: 0 };
    // A tap 30 px to the right of and 20 px above the centre.
    expect(centreOn(LANDSCAPE, CIRCLE, view, 30, -20)).toEqual({ zoom: 2, x: -30, y: 20 });
  });
});

describe("the JPEG ladder", () => {
  it("steps the quality down until the blob is under the cap", async () => {
    const asked: number[] = [];
    const encode = async (q: number) => {
      asked.push(q);
      return new Blob([new Uint8Array(Math.round(q * 2_000_000))]);
    };
    const blob = await encodeUnder(encode, 1_048_576);
    expect(blob?.size).toBeLessThanOrEqual(1_048_576);
    expect(asked).toEqual([0.92, 0.84, 0.76, 0.68, 0.6, 0.52]);
  });

  it("answers null when even the last rung is over", async () => {
    expect(await encodeUnder(async () => new Blob([new Uint8Array(2_000_000)]), 1_048_576)).toBeNull();
    expect(QUALITIES.at(-1)).toBe(0.44);
  });
});

describe("the upload's poll", () => {
  afterEach(() => vi.unstubAllGlobals());

  function respond(...answers: Array<{ status: number; body?: unknown }>) {
    const fetchMock = vi.fn(async (..._args: unknown[]) => {
      const next = answers.shift() ?? { status: 500 };
      return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const blob = new Blob([new Uint8Array(10)], { type: "image/jpeg" });
  const signal = () => new AbortController().signal;

  it("sends the raw JPEG, then reads until done", async () => {
    const fetchMock = respond({ status: 202, body: { uploadId: "u1" } }, { status: 200, body: { state: "pending" } }, { status: 200, body: { state: "done", href: "/api/avatars/x?v=2&s=192" } });
    expect(await uploadPicture(blob, signal(), [0, 0, 0])).toEqual({ state: "done", href: "/api/avatars/x?v=2&s=192" });
    expect(fetchMock.mock.calls[0]).toEqual(["/api/avatars/upload", expect.objectContaining({ method: "POST", body: blob, headers: { "content-type": "image/jpeg" } })]);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/avatars/upload/u1");
  });

  it("maps refused to refused, and everything else to failed", async () => {
    respond({ status: 202, body: { uploadId: "u1" } }, { status: 200, body: { state: "refused" } });
    expect(await uploadPicture(blob, signal(), [0])).toEqual({ state: "refused" });
    respond({ status: 202, body: { uploadId: "u1" } }, { status: 200, body: { state: "cancelled" } });
    expect(await uploadPicture(blob, signal(), [0])).toEqual({ state: "failed" });
    respond({ status: 202, body: { uploadId: "u1" } }, { status: 404 });
    expect(await uploadPicture(blob, signal(), [0])).toEqual({ state: "failed" });
    respond({ status: 413, body: { error: "too_large" } });
    expect(await uploadPicture(blob, signal(), [0])).toEqual({ state: "failed" });
    respond({ status: 415, body: { error: "png_jpg_only" } });
    expect(await uploadPicture(blob, signal(), [0])).toEqual({ state: "refused" });
  });

  it("gives up as failed when the budget is spent", async () => {
    respond({ status: 202, body: { uploadId: "u1" } }, { status: 200, body: { state: "pending" } }, { status: 200, body: { state: "pending" } });
    expect(await uploadPicture(blob, signal(), [0, 0])).toEqual({ state: "failed" });
  });

  it("rejects when aborted — «إلغاء» left the step", async () => {
    respond({ status: 202, body: { uploadId: "u1" } });
    const controller = new AbortController();
    const pending = uploadPicture(blob, controller.signal, [50]);
    controller.abort();
    await expect(pending).rejects.toBeDefined();
  });
});
