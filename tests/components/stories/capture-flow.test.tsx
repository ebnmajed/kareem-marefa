// «أضف»'s camera and recorder behind `ui/story-capture` (REQ-STO-011, DEC-093) — with a FAKE stream and a fake
// MediaRecorder, so the tap-only path is proven where jsdom has no camera: the shutter starts and stops a recording by
// taps; a refused camera says so and keeps its reason (`data-camera-error`), and the gallery stays open.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import stories from "@/messages/ar/stories.json";
import { CaptureFlow } from "@/components/stories/capture-flow";

const refresh = vi.fn();
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useRouter: () => ({ refresh }) }));
// The transport's backoff sleeps are skipped: a retry is proven by its count, not by waiting for it.
vi.mock("@/components/stories/upload", async (orig) => {
  const real = await orig<typeof import("@/components/stories/upload")>();
  return { ...real, withRetry: <T,>(fn: (a: number) => Promise<T>, o: object = {}) => real.withRetry(fn, { ...o, sleep: async () => {} }) };
});

class FakeRecorder {
  static isTypeSupported = (t: string) => t.startsWith("video/webm");
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: MediaStream, public options: { mimeType: string }) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"], { type: "video/webm" }) });
    this.onstop?.();
  }
}

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: () => {} }] } as unknown as MediaStream;
}

function show(onClose: () => void = () => {}) {
  return render(
    <NextIntlClientProvider locale="ar" messages={stories}>
      <CaptureFlow sessionId="11111111-1111-4111-8111-111111111111" onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("CaptureFlow", () => {
  it("records and stops a video by taps alone, on a stream that resolved", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) } });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    show();
    await act(async () => {});
    await user.click(screen.getByRole("radio", { name: "فيديو" }));
    const start = screen.getByRole("button", { name: "ابدأ التسجيل" });
    expect(start).toBeEnabled();
    await user.click(start);
    expect(screen.getByRole("button", { name: "أوقف التسجيل" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "أوقف التسجيل" }));
    expect(document.querySelector("[data-story-capture]")).toHaveAttribute("data-state", "review");
  });

  it("★ a camera that never answers (a prompt left open) still draws every control — close, mode, gallery, shutter", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(() => new Promise(() => {})) } });
    show();
    await act(async () => {});
    expect(screen.getByRole("button", { name: "إغلاق" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "فيديو" })).toBeEnabled();
    expect(screen.getByLabelText("من الاستوديو")).toBeEnabled();
    expect(screen.getByRole("button", { name: "التقط صورة" })).toBeInTheDocument();
  });

  it("a camera with no mediaDevices at all (an insecure page) still draws close and the gallery", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    show();
    await act(async () => {});
    expect(screen.getByRole("button", { name: "إغلاق" })).toBeEnabled();
    expect(screen.getByLabelText("من الاستوديو")).toBeEnabled();
  });

  it("a refused camera says so, keeps its reason, and leaves the gallery open", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new DOMException("blocked by Permissions-Policy", "NotAllowedError")) },
    });
    show();
    await act(async () => {});
    expect(await screen.findByRole("status")).toHaveTextContent("لا وصول إلى الكاميرا");
    expect(document.querySelector("[data-camera-error]")).toHaveAttribute("data-camera-error", "NotAllowedError");
    expect(screen.getByRole("button", { name: "التقط صورة" })).toBeDisabled();
    expect(screen.getByLabelText("من الاستوديو")).toBeEnabled();
  });
});

// ── the robust path (the owner's report of 2026-10-14): an iOS-like and a Chrome-like recorder, the upload's states,
// the retry that resumes, and no page refresh while the capture is open ──────────────────────────────────────────────

const SESSION = "11111111-1111-4111-8111-111111111111";
const FRAME = "22222222-2222-4222-8222-222222222222";
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

/** A recorder that behaves like one browser: what it says it supports, the type it writes, and its bytes. */
function recorderLike(supports: (t: string) => boolean, writes: { type: string; bytes: Uint8Array<ArrayBuffer> | null }) {
  return class {
    static isTypeSupported = supports;
    state: "inactive" | "recording" = "inactive";
    mimeType: string;
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(
      public stream: MediaStream,
      public options?: { mimeType: string },
    ) {
      this.mimeType = writes.type;
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      if (writes.bytes) this.ondataavailable?.({ data: new Blob([writes.bytes], { type: writes.type }) });
      this.onstop?.();
    }
  };
}

const iosRecorder = recorderLike((t) => t === "video/mp4", { type: "video/mp4", bytes: MP4 });
const chromeRecorder = recorderLike((t) => t.startsWith("video/webm"), { type: "video/webm;codecs=vp9,opus", bytes: WEBM });

/** Each PUT answers from this list in turn; the last answer repeats. */
let putPlan: { status: number; network?: boolean }[] = [];
let puts = 0;
class PlannedXhr {
  status = 0;
  responseText = "";
  timeout = 0;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open() {}
  setRequestHeader() {}
  abort() {
    this.onabort?.();
  }
  send(body: Blob) {
    const plan = putPlan[Math.min(puts, putPlan.length - 1)]!;
    puts += 1;
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: body.size, total: body.size });
      if (plan.network) return this.onerror?.();
      this.status = plan.status;
      this.onload?.();
    });
  }
}

/** The author's poll (`GET /api/stories/video/{id}`) answers 404 — not followed — unless a test says otherwise. */
let statusAnswer: () => Response = () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
function routes(init: Response | (() => Response)) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (url: string, opts: { method?: string; body?: string }) => {
    if (!opts.method || opts.method === "GET") return statusAnswer();
    calls.push({ url, body: JSON.parse(opts.body ?? "{}") as Record<string, unknown> });
    if (url === "/api/stories/video" || url === "/api/upload/photo") return typeof init === "function" ? init() : init.clone();
    return new Response(JSON.stringify({ status: "processing" }), { status: 202 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const videoInit = () =>
  new Response(JSON.stringify({ frameId: FRAME, upload: { path: `org/${SESSION}/${FRAME}.mp4`, signedUrl: "https://storage.test/put", contentType: "video/mp4" } }), {
    status: 201,
  });

async function recordVideo(recorder: unknown, onClose?: () => void) {
  const user = userEvent.setup();
  vi.stubGlobal("MediaRecorder", recorder);
  vi.stubGlobal("XMLHttpRequest", PlannedXhr);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) } });
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  show(onClose);
  await act(async () => {});
  await user.click(screen.getByRole("radio", { name: "فيديو" }));
  await user.click(screen.getByRole("button", { name: "ابدأ التسجيل" }));
  await user.click(screen.getByRole("button", { name: "أوقف التسجيل" }));
  return user;
}

const captureState = () => document.querySelector("[data-story-capture]")?.getAttribute("data-state");

describe("CaptureFlow — robust uploads", () => {
  afterEach(() => {
    putPlan = [];
    puts = 0;
    refresh.mockClear();
    statusAnswer = () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  });

  it("the author's video is followed until the worker answers: ready closes the capture", async () => {
    putPlan = [{ status: 200 }];
    statusAnswer = () => new Response(JSON.stringify({ state: "visible", durationMs: 9000, posterUrl: "https://storage.test/p" }), { status: 200 });
    routes(videoInit);
    const onClose = vi.fn();
    const user = await recordVideo(iosRecorder, onClose);
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("processing"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 3500 });
  });

  it("a refusal from the worker says why — «أطول من 15 ثانية» — and hands the camera back", async () => {
    putPlan = [{ status: 200 }];
    statusAnswer = () => new Response(JSON.stringify({ state: "failed", reason: "too_long" }), { status: 200 });
    routes(videoInit);
    const user = await recordVideo(iosRecorder);
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("refused"), { timeout: 3500 });
    expect(screen.getByRole("status")).toHaveTextContent("أطول من 15 ثانية");
    expect(screen.getByRole("button", { name: "ابدأ التسجيل" })).toBeEnabled();
  });

  it("iOS-like: MP4 is recorded, uploaded as mp4, and the member reads «جارٍ التجهيز» — the page is not refreshed under the dialog", async () => {
    putPlan = [{ status: 200 }];
    const calls = routes(videoInit);
    const user = await recordVideo(iosRecorder);
    expect(captureState()).toBe("review");
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("processing"));
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التجهيز");
    expect(calls.map((c) => c.url)).toEqual(["/api/stories/video", "/api/stories/video/complete"]);
    expect(calls[0]!.body).toMatchObject({ sessionId: SESSION, ext: "mp4", declaredByteSize: MP4.byteLength });
    expect(calls[1]!.body).toMatchObject({ frameId: FRAME, byteSize: MP4.byteLength });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("Chrome-like: what the recorder WROTE (WebM bytes) is what the server is told", async () => {
    putPlan = [{ status: 200 }];
    const calls = routes(videoInit);
    const user = await recordVideo(chromeRecorder);
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("processing"));
    expect(calls[0]!.body).toMatchObject({ ext: "webm" });
  });

  it("★ a recorder that misreports its type is corrected by the bytes", async () => {
    putPlan = [{ status: 200 }];
    const calls = routes(videoInit);
    const user = await recordVideo(recorderLike((t) => t === "video/webm", { type: "video/webm", bytes: MP4 }));
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("processing"));
    expect(calls[0]!.body).toMatchObject({ ext: "mp4" });
  });

  it("a dropped PUT is retried on its own; a PUT that keeps failing keeps the take, says why, and «أعد المحاولة» resumes without a new upload slot", async () => {
    putPlan = [{ status: 0, network: true }];
    const calls = routes(videoInit);
    const user = await recordVideo(iosRecorder);
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("error"));
    expect(puts).toBe(3);
    expect(screen.getByRole("status")).toHaveTextContent("لا اتصال");
    expect(screen.getByRole("button", { name: "أعد" })).toBeEnabled();
    putPlan = [{ status: 200 }];
    await user.click(screen.getByRole("button", { name: "أعد المحاولة" }));
    await waitFor(() => expect(captureState()).toBe("processing"));
    expect(calls.filter((c) => c.url === "/api/stories/video")).toHaveLength(1);
    expect(calls.filter((c) => c.url === "/api/stories/video/complete")).toHaveLength(1);
  });

  it("a refusal is an answer, never retried: «الإضافة لمن سجّل حضوره»", async () => {
    putPlan = [{ status: 200 }];
    const calls = routes(() => new Response(JSON.stringify({ error: "not_authorized" }), { status: 403 }));
    const user = await recordVideo(iosRecorder);
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("error"));
    expect(screen.getByRole("status")).toHaveTextContent("الإضافة لمن سجّل حضوره");
    expect(calls).toHaveLength(1);
    expect(puts).toBe(0);
  });

  it("★ the review plays the take with ONE tapped control — never the browser's controls, which sit under «أعد» and «انشر»", async () => {
    routes(videoInit);
    const user = await recordVideo(iosRecorder);
    expect(document.querySelector("[data-story-capture] video[controls]")).toBeNull();
    const video = document.querySelector<HTMLVideoElement>("[data-review-video]")!;
    expect(video).toHaveAttribute("playsinline");
    const play = vi.spyOn(video, "play").mockImplementation(async () => void video.dispatchEvent(new Event("play")));
    Object.defineProperty(video, "paused", { configurable: true, get: () => !play.mock.calls.length });
    await user.click(screen.getByRole("button", { name: "تابِع" }));
    expect(play).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "أوقف مؤقتًا" })).toBeInTheDocument();
  });

  it("a recording that wrote no bytes is never uploaded", async () => {
    const calls = routes(videoInit);
    await recordVideo(recorderLike((t) => t === "video/mp4", { type: "video/mp4", bytes: null }));
    expect(captureState()).toBe("refused");
    expect(screen.getByRole("status")).toHaveTextContent("قصير جدًا");
    expect(screen.getByRole("button", { name: "ابدأ التسجيل" })).toBeEnabled();
    expect(calls).toHaveLength(0);
  });

  it("the recorder stops itself at 15 seconds exactly, by a timer from the start", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.stubGlobal("MediaRecorder", iosRecorder);
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) } });
      URL.createObjectURL = vi.fn(() => "blob:x");
      URL.revokeObjectURL = vi.fn();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      show();
      await act(async () => {});
      await user.click(screen.getByRole("radio", { name: "فيديو" }));
      await user.click(screen.getByRole("button", { name: "ابدأ التسجيل" }));
      expect(captureState()).toBe("recording");
      await act(async () => void vi.advanceTimersByTime(14_900));
      expect(captureState()).toBe("recording");
      await act(async () => void vi.advanceTimersByTime(200));
      expect(captureState()).toBe("review");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("CaptureFlow — a photograph from the gallery", () => {
  it("is prepared (or kept, when the phone cannot redraw it), uploaded through the album's door with its caption, and the capture closes", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("XMLHttpRequest", PlannedXhr);
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("no decoder")));
    putPlan = [{ status: 200 }];
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) } });
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const calls = routes(
      () =>
        new Response(JSON.stringify({ photoId: FRAME, upload: { path: `org/${SESSION}/${FRAME}.jpg`, signedUrl: "https://storage.test/put", contentType: "image/jpeg" } }), {
          status: 201,
        }),
    );
    const onClose = vi.fn();
    show(onClose);
    await act(async () => {});
    await user.upload(screen.getByLabelText("من الاستوديو"), new File([new Uint8Array([0xff, 0xd8, 0xff])], "IMG_1.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(captureState()).toBe("review"));
    await user.type(screen.getByLabelText("تعليق"), "الشريحة الثالثة");
    await user.click(screen.getByRole("button", { name: "انشر" }));
    // ★ Said and closed: the parent reads the page again once the dialog is gone — never under it.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
    expect(calls.map((c) => c.url)).toEqual(["/api/upload/photo", "/api/stories/photo/complete"]);
    expect(calls[0]!.body).toMatchObject({ sessionId: SESSION, kind: "jpeg" });
    expect(calls[1]!.body).toMatchObject({ photoId: FRAME, kind: "jpeg", caption: "الشريحة الثالثة" });
    putPlan = [];
    puts = 0;
  });
});
