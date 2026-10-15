// The capture's transport (REQ-STO-016): a retry with backoff for what is transient and none for an answer; a JSON
// route that redirected to a page is a failure, not a success; the PUT reports progress and its status.
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadError, isAlreadyUploaded, postJson, putBlob, withRetry } from "@/components/stories/upload";

const noSleep = async () => {};

afterEach(() => vi.unstubAllGlobals());

describe("withRetry", () => {
  it("retries a dropped connection and a 5xx, then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new UploadError(0))
      .mockRejectedValueOnce(new UploadError(503))
      .mockResolvedValueOnce("ok");
    await expect(withRetry(fn, { sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("never retries an answer — a 403 is thrown at once", async () => {
    const fn = vi.fn().mockRejectedValue(new UploadError(403, "not_authorized"));
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toMatchObject({ status: 403 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops after its attempts, and backs off between them", async () => {
    const waits: number[] = [];
    const fn = vi.fn().mockRejectedValue(new UploadError(500));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1000, sleep: async (ms) => void waits.push(ms) })).rejects.toBeInstanceOf(UploadError);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(waits).toHaveLength(2);
    expect(waits[0]).toBeGreaterThanOrEqual(1000);
    expect(waits[1]).toBeGreaterThanOrEqual(2000);
  });

  it("an aborted signal stops before the next attempt", async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new UploadError(0);
    });
    await expect(withRetry(fn, { sleep: noSleep, signal: controller.signal })).rejects.toMatchObject({ aborted: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("postJson", () => {
  it("returns the route's JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ frameId: "f" }), { status: 201 })));
    await expect(postJson("/api/x", {}, {})).resolves.toEqual({ frameId: "f" });
  });

  it("carries the status and the route's error word", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "file_too_large" }), { status: 413 })));
    await expect(postJson("/api/x", {}, {})).rejects.toMatchObject({ status: 413, code: "file_too_large" });
  });

  it("★ a 200 that is a page (a redirect to sign-in) is not a success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<!doctype html><p>sign in</p>", { status: 200 })));
    await expect(postJson("/api/x", {}, {})).rejects.toBeInstanceOf(UploadError);
  });

  it("no network is status 0, which is transient", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const e = await postJson("/api/x", {}, {}).catch((x: UploadError) => x);
    expect(e).toBeInstanceOf(UploadError);
    expect((e as UploadError).transient).toBe(true);
  });
});

class FakeXhr {
  static next: { status: number; body?: string; network?: boolean } = { status: 200 };
  static last: FakeXhr | null = null;
  status = 0;
  responseText = "";
  timeout = 0;
  headers: Record<string, string> = {};
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXhr.last = this;
  }
  open() {}
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  abort() {
    this.onabort?.();
  }
  send(body: Blob) {
    const plan = FakeXhr.next;
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: body.size / 2, total: body.size });
      if (plan.network) return this.onerror?.();
      this.status = plan.status;
      this.responseText = plan.body ?? "";
      this.onload?.();
    });
  }
}

describe("putBlob", () => {
  it("sends the type, reports progress and resolves on 2xx", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    FakeXhr.next = { status: 200 };
    const seen: number[] = [];
    await putBlob("https://storage/x", new Blob(["abcd"]), "video/mp4", { onProgress: (f) => seen.push(f) });
    expect(FakeXhr.last?.headers["content-type"]).toBe("video/mp4");
    // The buckets are insert-only (0199 §A): never an upsert.
    expect(FakeXhr.last?.headers["x-upsert"]).toBeUndefined();
    expect(seen).toEqual([0.5, 1]);
  });

  it("a 5xx rejects with its status; a dropped connection with 0", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    FakeXhr.next = { status: 500, body: '{"error":"boom"}' };
    await expect(putBlob("https://storage/x", new Blob(["a"]), "video/mp4")).rejects.toMatchObject({ status: 500, code: "boom" });
    FakeXhr.next = { status: 0, network: true };
    await expect(putBlob("https://storage/x", new Blob(["a"]), "video/mp4")).rejects.toMatchObject({ status: 0 });
  });
});

describe("isAlreadyUploaded — Storage's 400 Duplicate on a retried PUT means the take landed", () => {
  it("reads Storage's own body", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    FakeXhr.next = { status: 400, body: '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}' };
    const e = await putBlob("https://storage/x", new Blob(["a"]), "video/mp4").catch((x: unknown) => x);
    expect(isAlreadyUploaded(e)).toBe(true);
  });
  it("any other 400 is a refusal", () => {
    expect(isAlreadyUploaded(new UploadError(400, "mime type not supported"))).toBe(false);
    expect(isAlreadyUploaded(new UploadError(0))).toBe(false);
  });
});
