// «أضف» behind `ui/story-capture` (REQ-STO-011, REQ-STO-016, DEC-293): the phone's own camera app and gallery hand over
// a File; this flow reviews it, uploads it robustly — progress, a retry that resumes, refusals in a word — and never
// refreshes the page under the dialog. The transport's backoff sleeps are skipped: a retry is proven by its count.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import stories from "@/messages/ar/stories.json";
import { CaptureFlow } from "@/components/stories/capture-flow";
import { STORY_VIDEO_MAX_BYTES } from "@/components/stories/media";

const refresh = vi.fn();
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), useRouter: () => ({ refresh }) }));
vi.mock("@/components/stories/upload", async (orig) => {
  const real = await orig<typeof import("@/components/stories/upload")>();
  return { ...real, withRetry: <T,>(fn: (a: number) => Promise<T>, o: object = {}) => real.withRetry(fn, { ...o, sleep: async () => {} }) };
});

const SESSION = "11111111-1111-4111-8111-111111111111";
const FRAME = "22222222-2222-4222-8222-222222222222";
const MOV = new Uint8Array([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20, 0, 0, 0, 0]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

function show(onClose: () => void = () => {}) {
  return render(
    <NextIntlClientProvider locale="ar" messages={stories}>
      <CaptureFlow sessionId={SESSION} onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

const captureState = () => document.querySelector("[data-story-capture]")?.getAttribute("data-state");

/** A file from one of the three inputs, as the phone's camera app or gallery hands it over. */
async function pick(label: "صورة" | "فيديو" | "من الاستوديو", file: File) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
  });
}

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
function routes(init: () => Response) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts: { method?: string; body?: string }) => {
      if (!opts.method || opts.method === "GET") return statusAnswer();
      calls.push({ url, body: JSON.parse(opts.body ?? "{}") as Record<string, unknown> });
      if (url === "/api/stories/video" || url === "/api/upload/photo") return init();
      return new Response(JSON.stringify({ status: "processing" }), { status: 202 });
    }),
  );
  return calls;
}

const videoInit = () =>
  new Response(JSON.stringify({ frameId: FRAME, upload: { path: `org/${SESSION}/${FRAME}.mov`, signedUrl: "https://storage.test/put", contentType: "video/quicktime" } }), {
    status: 201,
  });
const photoInit = () =>
  new Response(JSON.stringify({ photoId: FRAME, upload: { path: `org/${SESSION}/${FRAME}.jpg`, signedUrl: "https://storage.test/put", contentType: "image/jpeg" } }), {
    status: 201,
  });

const cameraVideo = () => new File([MOV], "IMG_0042.MOV", { type: "video/quicktime" });

beforeEach(() => {
  vi.stubGlobal("XMLHttpRequest", PlannedXhr);
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  putPlan = [{ status: 200 }];
  puts = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
  statusAnswer = () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
});

describe("CaptureFlow — the phone's own camera, then our screen (DEC-293)", () => {
  it("opens on the three choices, and asks for no camera of its own", () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    show();
    expect(captureState()).toBe("choose");
    expect(screen.getByLabelText("صورة")).toHaveAttribute("capture", "environment");
    expect(screen.getByLabelText("فيديو")).toHaveAttribute("capture", "environment");
    expect(screen.getByLabelText("من الاستوديو")).not.toHaveAttribute("capture");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("a video from the camera app: reviewed, uploaded as the container its bytes say, «جارٍ التجهيز» — no refresh under the dialog", async () => {
    const calls = routes(videoInit);
    const user = userEvent.setup();
    show();
    await pick("فيديو", cameraVideo());
    expect(captureState()).toBe("review");
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("processing"));
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التجهيز");
    expect(calls.map((c) => c.url)).toEqual(["/api/stories/video", "/api/stories/video/complete"]);
    expect(calls[0]!.body).toMatchObject({ sessionId: SESSION, ext: "mov", declaredByteSize: MOV.byteLength });
    expect(calls[1]!.body).toMatchObject({ frameId: FRAME, byteSize: MOV.byteLength });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("★ a long video is NOT refused on the phone — the worker keeps its first 15 s", async () => {
    routes(videoInit);
    show();
    // Any length: the flow never reads a duration any more.
    await pick("من الاستوديو", new File([MP4], "long-clip.mp4", { type: "video/mp4" }));
    expect(captureState()).toBe("review");
  });

  it("a gallery file with no type is read by its name, then by its bytes", async () => {
    const calls = routes(videoInit);
    const user = userEvent.setup();
    show();
    await pick("من الاستوديو", new File([WEBM], "clip.webm", { type: "" }));
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("processing"));
    expect(calls[0]!.body).toMatchObject({ ext: "webm" });
  });

  it("★ a label the bytes contradict is corrected by the bytes", async () => {
    const calls = routes(videoInit);
    const user = userEvent.setup();
    show();
    await pick("من الاستوديو", new File([MP4], "clip.webm", { type: "video/webm" }));
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("processing"));
    expect(calls[0]!.body).toMatchObject({ ext: "mp4" });
  });

  it("★ over the server's ceiling: refused at once, in a word, nothing sent — and the choices are back", async () => {
    const calls = routes(videoInit);
    show();
    const big = cameraVideo();
    Object.defineProperty(big, "size", { value: STORY_VIDEO_MAX_BYTES + 1 });
    await pick("فيديو", big);
    expect(captureState()).toBe("refused");
    expect(screen.getByRole("status")).toHaveTextContent("أكبر من 200 ميغابايت");
    expect(screen.getByLabelText("فيديو")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("★ the bucket's own ceiling (413 on the PUT, before 0225 moves it) reads as too large, never «تعذّر»", async () => {
    putPlan = [{ status: 413 }];
    routes(videoInit);
    const user = userEvent.setup();
    show();
    await pick("فيديو", cameraVideo());
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("error"));
    expect(screen.getByRole("status")).toHaveTextContent("أكبر من 200 ميغابايت");
    expect(puts).toBe(1);
  });

  it("a file that is neither a picture nor a video is «صيغة غير مدعومة»", async () => {
    routes(videoInit);
    show();
    await pick("من الاستوديو", new File(["%PDF-1.7"], "notes.pdf", { type: "application/pdf" }));
    expect(captureState()).toBe("refused");
    expect(screen.getByRole("status")).toHaveTextContent("صيغة غير مدعومة");
  });

  it("«إعادة» goes back to the three choices", async () => {
    routes(videoInit);
    const user = userEvent.setup();
    show();
    await pick("فيديو", cameraVideo());
    await user.click(screen.getByRole("button", { name: "إعادة" }));
    expect(captureState()).toBe("choose");
    expect(screen.getByLabelText("فيديو")).toBeInTheDocument();
  });

  it("a dropped PUT is retried on its own; one that keeps failing keeps the take, says why, and «أعد المحاولة» resumes without a new upload slot", async () => {
    putPlan = [{ status: 0, network: true }];
    const calls = routes(videoInit);
    const user = userEvent.setup();
    show();
    await pick("فيديو", cameraVideo());
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("error"));
    expect(puts).toBe(3);
    expect(screen.getByRole("status")).toHaveTextContent("لا اتصال");
    putPlan = [{ status: 200 }];
    await user.click(screen.getByRole("button", { name: "أعد المحاولة" }));
    await waitFor(() => expect(captureState()).toBe("processing"));
    expect(calls.filter((c) => c.url === "/api/stories/video")).toHaveLength(1);
    expect(calls.filter((c) => c.url === "/api/stories/video/complete")).toHaveLength(1);
  });

  it("a refusal is an answer, never retried: «الإضافة لمن سجّل حضوره»", async () => {
    const calls = routes(() => new Response(JSON.stringify({ error: "not_authorized" }), { status: 403 }));
    const user = userEvent.setup();
    show();
    await pick("فيديو", cameraVideo());
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("error"));
    expect(screen.getByRole("status")).toHaveTextContent("الإضافة لمن سجّل حضوره");
    expect(calls).toHaveLength(1);
    expect(puts).toBe(0);
  });

  it("the author's video is followed until the worker answers: ready closes the capture", async () => {
    statusAnswer = () => new Response(JSON.stringify({ state: "visible", durationMs: 9000, posterUrl: "https://storage.test/p" }), { status: 200 });
    routes(videoInit);
    const onClose = vi.fn();
    const user = userEvent.setup();
    show(onClose);
    await pick("فيديو", cameraVideo());
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("processing"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 3500 });
  });

  it("a refusal from the worker says why and offers the choices again", async () => {
    statusAnswer = () => new Response(JSON.stringify({ state: "failed", reason: "unsupported" }), { status: 200 });
    routes(videoInit);
    const user = userEvent.setup();
    show();
    await pick("فيديو", cameraVideo());
    await user.click(screen.getByRole("button", { name: "انشر" }));
    await waitFor(() => expect(captureState()).toBe("refused"), { timeout: 3500 });
    expect(screen.getByRole("status")).toHaveTextContent("صيغة غير مدعومة");
    expect(screen.getByLabelText("من الاستوديو")).toBeInTheDocument();
  });

  it("★ the review plays the take with ONE tapped control — never the browser's controls", async () => {
    routes(videoInit);
    const user = userEvent.setup();
    show();
    await pick("فيديو", cameraVideo());
    expect(document.querySelector("[data-story-capture] video[controls]")).toBeNull();
    const video = document.querySelector<HTMLVideoElement>("[data-review-video]")!;
    expect(video).toHaveAttribute("playsinline");
    const play = vi.spyOn(video, "play").mockImplementation(async () => void video.dispatchEvent(new Event("play")));
    Object.defineProperty(video, "paused", { configurable: true, get: () => !play.mock.calls.length });
    await user.click(screen.getByRole("button", { name: "تابِع" }));
    expect(play).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "أوقف مؤقتًا" })).toBeInTheDocument();
  });
});

describe("CaptureFlow — a photograph", () => {
  it("from the camera app: prepared (or kept when the phone cannot redraw it), through the album's door with its caption, and the capture closes", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("no decoder")));
    const calls = routes(photoInit);
    const onClose = vi.fn();
    const user = userEvent.setup();
    show(onClose);
    await pick("صورة", new File([new Uint8Array([0xff, 0xd8, 0xff])], "image.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(captureState()).toBe("review"));
    await user.type(screen.getByLabelText("تعليق"), "الشريحة الثالثة");
    await user.click(screen.getByRole("button", { name: "انشر" }));
    // ★ Said and closed: the parent reads the page again once the dialog is gone — never under it.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
    expect(calls.map((c) => c.url)).toEqual(["/api/upload/photo", "/api/stories/photo/complete"]);
    expect(calls[0]!.body).toMatchObject({ sessionId: SESSION, kind: "jpeg" });
    expect(calls[1]!.body).toMatchObject({ photoId: FRAME, kind: "jpeg", caption: "الشريحة الثالثة" });
  });
});
