"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { StoryCaptureMode, StoryCaptureState } from "@/components/ui";
import { StoryCapture } from "@/components/ui/story-capture";
import { formatNumber } from "@/components/sessions/numerals";

// «أضف» — the camera, the recorder and the two uploads behind `ui/story-capture` (REQ-STO-011, REQ-STO-012,
// REQ-STO-016). A photograph goes through the album's OWN door (`/api/upload/photo`, then `/api/stories/photo/complete`
// for the caption and the capture gate); a video PUTs to `story-media` and completes at `/api/stories/video/complete`.
// The bytes never pass through Vercel. The 15-second limit is enforced HERE (the recorder stops itself, a longer
// gallery video is refused) and AGAIN on the server from ffprobe's reading — this side is a courtesy, never the rule.
// The member is told it is processing, never that it was posted (DEC-139).

export const STORY_VIDEO_LIMIT_SECONDS = 15;
const STORY_VIDEO_MAX_BYTES = 60 * 1024 * 1024;
const CAPTION_MAX = 100;
const PHOTO_KINDS: Record<string, "jpeg" | "png" | "webp"> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
const VIDEO_EXTS: Record<string, "mp4" | "mov" | "webm"> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

type Draft = { kind: "photo"; blob: Blob; type: "jpeg" | "png" | "webp" } | { kind: "video"; blob: Blob; ext: "mp4" | "mov" | "webm" };

function recorderType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
}

function videoDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(el.src);
      resolve(el.duration);
    };
    el.onerror = () => resolve(Number.NaN);
    el.src = URL.createObjectURL(blob);
  });
}

export function CaptureFlow({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const t = useTranslations("stories");
  const locale = useLocale();
  const router = useRouter();
  const live = useRef<HTMLVideoElement | null>(null);
  /** The live preview's element, given the stream WHENEVER either arrives first. ★ The capture is a dialog whose
   *  content mounts in a portal a render after this component, so a stream that resolved quickly (a permission
   *  already granted) found no element and the preview stayed black (DEC-274). A callback ref closes that race. */
  const attach = useCallback((el: HTMLVideoElement | null) => {
    live.current = el;
    if (!el || !stream.current || el.srcObject === stream.current) return;
    try {
      el.srcObject = stream.current;
      void el.play?.()?.catch(() => undefined);
    } catch {
      // An element that refuses the stream is not a refused camera: the shutter still works from `live`.
    }
  }, []);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const started = useRef(0);

  const [mode, setMode] = useState<StoryCaptureMode>("photo");
  const [state, setState] = useState<StoryCaptureState>("idle");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [message, setMessage] = useState<string | undefined>(undefined);
  /** Why the camera is not ours — the DOMException's name (`NotAllowedError`, `NotFoundError`, `NotReadableError`), or
   *  `unsupported` with no `mediaDevices` (an insecure origin). Read by the page and by a spec, never guessed. */
  const [cameraError, setCameraError] = useState<string | null>(null);

  // The camera, for as long as the capture is open and nothing is under review. Video and sound first; video alone if
  // the microphone is refused. ★ The page's own `Permissions-Policy` must allow `camera` and `microphone` for `self`,
  // or both are refused before any prompt (`NotAllowedError`) — the reason is kept, so a refusal says which it was.
  useEffect(() => {
    if (draft) return;
    let cancelled = false;
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) {
      queueMicrotask(() => !cancelled && setCameraError("unsupported"));
      return () => {
        cancelled = true;
      };
    }
    media
      .getUserMedia({ video: { facingMode: facing }, audio: true })
      .catch(() => media.getUserMedia({ video: { facingMode: facing } }))
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((tr) => tr.stop());
        stream.current = s;
        setCameraError(null);
        attach(live.current);
      })
      .catch((e: unknown) => {
        if (!cancelled) setCameraError(e instanceof DOMException ? e.name : "failed");
      });
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((tr) => tr.stop());
      stream.current = null;
    };
  }, [facing, draft, attach]);

  // The elapsed figure while recording, and the stop at the limit.
  useEffect(() => {
    if (state !== "recording") return;
    const id = window.setInterval(() => {
      const s = (performance.now() - started.current) / 1000;
      setElapsed(Math.floor(s));
      if (s >= STORY_VIDEO_LIMIT_SECONDS) recorder.current?.stop();
    }, 250);
    return () => window.clearInterval(id);
  }, [state]);

  useEffect(() => () => (draftUrl ? URL.revokeObjectURL(draftUrl) : undefined), [draftUrl]);

  function review(next: Draft) {
    setDraft(next);
    setDraftUrl(URL.createObjectURL(next.blob));
    setState("review");
    setMessage(undefined);
  }

  function takePhoto() {
    const el = live.current;
    if (!el || !el.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext("2d")?.drawImage(el, 0, 0);
    canvas.toBlob((blob) => blob && review({ kind: "photo", blob, type: "jpeg" }), "image/jpeg", 0.9);
  }

  function startRecording() {
    const s = stream.current;
    const type = recorderType();
    if (!s || !type) return;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(s, { mimeType: type });
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      const base = type.split(";")[0]!;
      review({ kind: "video", blob: new Blob(chunks, { type: base }), ext: VIDEO_EXTS[base] ?? "webm" });
    };
    recorder.current = rec;
    started.current = performance.now();
    setElapsed(0);
    rec.start(250);
    setState("recording");
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function onShutter() {
    if (mode === "photo") takePhoto();
    else if (state === "recording") stopRecording();
    else startRecording();
  }

  async function onPick(file: File) {
    const photo = PHOTO_KINDS[file.type];
    if (photo) return review({ kind: "photo", blob: file, type: photo });
    const ext = VIDEO_EXTS[file.type];
    if (!ext) {
      setState("refused");
      return setMessage(t("frame.failed"));
    }
    if (file.size > STORY_VIDEO_MAX_BYTES) {
      setState("refused");
      return setMessage(t("capture.tooLarge"));
    }
    const seconds = await videoDuration(file);
    if (Number.isFinite(seconds) && seconds > STORY_VIDEO_LIMIT_SECONDS + 0.1) {
      setState("refused");
      return setMessage(t("capture.tooLong"));
    }
    review({ kind: "video", blob: file, ext });
  }

  function retake() {
    setDraft(null);
    setDraftUrl(null);
    setState("idle");
    setMessage(undefined);
  }

  function failure(status: number) {
    setState("error");
    setMessage(status === 403 ? t("capture.refused") : status === 413 ? t("capture.tooLarge") : t("frame.failed"));
  }

  async function submit() {
    if (!draft || state === "uploading" || state === "processing") return;
    setState("uploading");
    const headers = { "content-type": "application/json", "x-locale": locale };
    try {
      if (draft.kind === "photo") {
        const init = await fetch("/api/upload/photo", { method: "POST", headers, body: JSON.stringify({ sessionId, kind: draft.type, declaredByteSize: draft.blob.size }) });
        if (!init.ok) return failure(init.status);
        const { photoId, upload } = (await init.json()) as { photoId: string; upload: { path: string; signedUrl: string; contentType: string } };
        const put = await fetch(upload.signedUrl, { method: "PUT", headers: { "content-type": upload.contentType }, body: draft.blob });
        if (!put.ok) return failure(put.status);
        const done = await fetch("/api/stories/photo/complete", {
          method: "POST",
          headers,
          body: JSON.stringify({ photoId, sessionId, path: upload.path, kind: draft.type, byteSize: draft.blob.size, caption }),
        });
        if (!done.ok) return failure(done.status);
      } else {
        const init = await fetch("/api/stories/video", { method: "POST", headers, body: JSON.stringify({ sessionId, ext: draft.ext, declaredByteSize: draft.blob.size }) });
        if (!init.ok) return failure(init.status);
        const { frameId, upload } = (await init.json()) as { frameId: string; upload: { path: string; signedUrl: string; contentType: string } };
        const put = await fetch(upload.signedUrl, { method: "PUT", headers: { "content-type": upload.contentType }, body: draft.blob });
        if (!put.ok) return failure(put.status);
        const done = await fetch("/api/stories/video/complete", {
          method: "POST",
          headers,
          body: JSON.stringify({ frameId, sessionId, path: upload.path, byteSize: draft.blob.size, caption }),
        });
        if (!done.ok) return failure(done.status);
      }
      setState("processing");
      setMessage(t("frame.processing"));
      router.refresh();
    } catch {
      failure(0);
    }
  }

  const preview =
    draft && draftUrl ? (
      draft.kind === "photo" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL under review
        <img src={draftUrl} alt="" className="h-full w-full object-contain" />
      ) : (
        <video src={draftUrl} playsInline controls className="h-full w-full object-contain" />
      )
    ) : (
      <video ref={attach} autoPlay muted playsInline data-camera-error={cameraError ?? undefined} className="h-full w-full object-cover" />
    );

  const denied = cameraError !== null && !draft && state === "idle";
  return (
    <StoryCapture
      open
      state={denied ? "denied" : state}
      mode={mode}
      onModeChange={setMode}
      preview={preview}
      elapsedSeconds={elapsed}
      limitSeconds={STORY_VIDEO_LIMIT_SECONDS}
      onShutter={onShutter}
      onHoldStart={startRecording}
      onHoldEnd={stopRecording}
      onPick={(f) => void onPick(f)}
      onFlip={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
      caption={caption}
      onCaptionChange={setCaption}
      captionMaxLength={CAPTION_MAX}
      onSubmit={() => void submit()}
      onRetake={retake}
      onClose={() => {
        stopRecording();
        onClose();
      }}
      message={denied ? t("capture.denied") : message}
      labels={{
        dialog: t("capture.dialog"),
        close: t("viewer.close"),
        photoMode: t("capture.photo"),
        videoMode: t("capture.video"),
        shutterPhoto: t("capture.shutter"),
        recordStart: t("capture.start"),
        recordStop: t("capture.stop"),
        gallery: t("capture.gallery"),
        flip: t("capture.flip"),
        caption: t("capture.caption"),
        submit: t("capture.submit"),
        retake: t("capture.retake"),
        notice: t("capture.notice"),
        elapsed: (s, limit) =>
          t("capture.elapsed", {
            elapsed: `${formatNumber(Math.floor(s / 60))}:${String(s % 60).padStart(2, "0")}`,
            limit: `${formatNumber(Math.floor(limit / 60))}:${String(limit % 60).padStart(2, "0")}`,
          }),
      }}
    />
  );
}
