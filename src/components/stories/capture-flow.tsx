"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { StoryCaptureMode, StoryCaptureState } from "@/components/ui";
import { StoryCapture } from "@/components/ui/story-capture";
import { formatNumber } from "@/components/sessions/numerals";
import {
  STORY_PHOTO_MAX_EDGE,
  STORY_VIDEO_LIMIT_SECONDS,
  STORY_VIDEO_MAX_BYTES,
  fitWithin,
  pickRecorderType,
  preparePhoto,
  readHead,
  sniffVideoExt,
  videoDuration,
  videoExtFromName,
  videoExtFromType,
  videoPoster,
  type PhotoKind,
  type VideoExt,
} from "@/components/stories/media";
import { UploadError, isAlreadyUploaded, postJson, putBlob, withRetry } from "@/components/stories/upload";
import { useToast } from "@/components/ui/toast";
import { PauseIcon, PlayIcon } from "@/components/ui/icons";

// «أضف» — the camera, the recorder and the two uploads behind `ui/story-capture` (REQ-STO-011, REQ-STO-012,
// REQ-STO-016). A photograph goes through the album's OWN door (`/api/upload/photo`, then `/api/stories/photo/complete`
// for the caption and the capture gate); a video PUTs to `story-media` and completes at `/api/stories/video/complete`.
// The bytes never pass through Vercel. The 15-second limit is enforced HERE (the recorder stops itself, a longer
// gallery video is refused) and AGAIN on the server from ffprobe's reading — this side is a courtesy, never the rule.
// The member is told it is processing, never that it was posted (DEC-139).
//
// ★ ROBUST BY CONSTRUCTION (the owner's report of 2026-10-14, docs/plan/notes/story-media.md):
// - the recorder's container is feature-detected, and what it WROTE is read from the bytes before upload — never the
//   type it was asked for; an empty recording is never uploaded;
// - the 15-second stop is a timer set at the start, exact, not a poll;
// - a photograph is prepared on the phone — upright, a phone's size, no metadata — before it leaves;
// - the bytes PUT with progress, a timeout and a retry with backoff; a step that succeeded is never repeated, so a
//   retry after a dropped connection resumes where it stopped;
// - a failure keeps the take and says why, with «أعد المحاولة» — never a page of its own, never a lost take;
// - nothing refreshes the page while the capture is open (the parent reads it again on close);
// - the review and the «processing» state show a still of the take, never a black box.

export { STORY_VIDEO_LIMIT_SECONDS };
const CAPTION_MAX = 100;
/** The server trims a recording that ran to 16 s and refuses one past it (docs/plan/notes/story-media.md §1.2): a
 *  gallery video is refused here by the same figure, never by a stricter one. */
const PICK_LIMIT_SECONDS = STORY_VIDEO_LIMIT_SECONDS + 1;
/** The author's poll while a video is transcoded — every 2 s, for at most 90 s (the contract's step 4). */
const POLL_MS = 2000;
const POLL_FOR_MS = 90_000;
const SIGNED_URL_FOR_MS = 110 * 60_000;
/** The age of a signed URL is read in an event handler, never in render. */
const clock = () => performance.now();

type VideoStatus = { state: "processing" } | { state: "visible" } | { state: "failed"; reason?: "too_long" | "too_large" | "unsupported" | "failed" };

type Draft =
  | { kind: "photo"; blob: Blob; type: PhotoKind }
  | { kind: "video"; blob: Blob; ext: VideoExt; seconds: number | null };

/** What has already succeeded for the draft in hand — so a retry starts at the first step that did not. */
type Ticket = {
  init?: { id: string; path: string; signedUrl: string; contentType: string; at: number };
  put?: boolean;
};

type Init = { upload: { path: string; signedUrl: string; contentType: string } } & ({ photoId: string } | { frameId: string });

export function CaptureFlow({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const t = useTranslations("stories");
  const locale = useLocale();
  const toast = useToast();
  const live = useRef<HTMLVideoElement | null>(null);
  /** The live preview's element, given the stream WHENEVER either arrives first. ★ The capture is a dialog whose
   *  content mounts in a portal a render after this component, so a stream that resolved quickly (a permission
   *  already granted) found no element and the preview stayed black (DEC-274). A callback ref closes that race. */
  const attach = useCallback((el: HTMLVideoElement | null) => {
    live.current = el;
    if (!el || !stream.current || el.srcObject === stream.current) return;
    try {
      // iOS plays a <video> inline only when these are ATTRIBUTES at play() — never fullscreen in the native player,
      // which has no shutter and no way back (the owner's «there weren't any [controls]»).
      el.muted = true;
      el.setAttribute("muted", "");
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");
      el.srcObject = stream.current;
      void el.play?.()?.catch(() => undefined);
    } catch {
      // An element that refuses the stream is not a refused camera: the shutter still works from `live`.
    }
  }, []);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const started = useRef(0);
  const limitTimer = useRef<number | null>(null);
  const mounted = useRef(true);
  const inflight = useRef<AbortController | null>(null);
  const ticket = useRef<Ticket>({});
  const poll = useRef<number | null>(null);

  const [mode, setMode] = useState<StoryCaptureMode>("photo");
  const [state, setState] = useState<StoryCaptureState>("idle");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [caption, setCaption] = useState("");
  const [message, setMessage] = useState<string | undefined>(undefined);
  /** Why the camera is not ours — the DOMException's name (`NotAllowedError`, `NotFoundError`, `NotReadableError`), or
   *  `unsupported` with no `mediaDevices` (an insecure origin). Read by the page and by a spec, never guessed. */
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inflight.current?.abort();
      if (limitTimer.current !== null) window.clearTimeout(limitTimer.current);
      if (poll.current !== null) window.clearTimeout(poll.current);
    };
  }, []);

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

  // The elapsed figure while recording. The STOP is not here: it is a timer set at the start (`startRecording`).
  useEffect(() => {
    if (state !== "recording") return;
    const id = window.setInterval(() => {
      setElapsed(Math.min(STORY_VIDEO_LIMIT_SECONDS, Math.floor((performance.now() - started.current) / 1000)));
    }, 200);
    return () => window.clearInterval(id);
  }, [state]);

  useEffect(() => () => (draftUrl ? URL.revokeObjectURL(draftUrl) : undefined), [draftUrl]);
  useEffect(() => () => (posterUrl ? URL.revokeObjectURL(posterUrl) : undefined), [posterUrl]);

  function review(next: Draft) {
    if (!mounted.current) return;
    ticket.current = {};
    setDraft(next);
    setDraftUrl(URL.createObjectURL(next.blob));
    setPosterUrl(null);
    setProgress(undefined);
    setState("review");
    setMessage(undefined);
    // A still of a video for the review and the «processing» state — iOS paints a blob <video> black until it plays.
    if (next.kind === "video") {
      void videoPoster(next.blob).then((still) => {
        if (still && mounted.current) setPosterUrl(URL.createObjectURL(still));
      });
    }
  }

  function refuse(key: "tooLong" | "tooLarge" | "tooShort" | "unsupported") {
    setState("refused");
    setMessage(t(`capture.${key}`));
  }

  function takePhoto() {
    const el = live.current;
    if (!el || !el.videoWidth) return;
    // Drawn at a phone's size from the start; a canvas carries no metadata.
    const size = fitWithin(el.videoWidth, el.videoHeight, STORY_PHOTO_MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d")?.drawImage(el, 0, 0, size.width, size.height);
    canvas.toBlob((blob) => (blob && blob.size > 0 ? review({ kind: "photo", blob, type: "jpeg" }) : setMessage(t("frame.failed"))), "image/jpeg", 0.88);
  }

  function startRecording() {
    const s = stream.current;
    if (!s || recorder.current?.state === "recording") return;
    if (typeof MediaRecorder === "undefined") return refuse("unsupported");
    const requested = pickRecorderType(MediaRecorder.isTypeSupported?.bind(MediaRecorder));
    let rec: MediaRecorder;
    try {
      rec = requested ? new MediaRecorder(s, { mimeType: requested }) : new MediaRecorder(s);
    } catch {
      // A type the browser said yes to and then refused: its own default is the last resort.
      try {
        rec = new MediaRecorder(s);
      } catch {
        return refuse("unsupported");
      }
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      if (limitTimer.current !== null) window.clearTimeout(limitTimer.current);
      limitTimer.current = null;
      recorder.current = null;
      if (!mounted.current) return;
      const seconds = (performance.now() - started.current) / 1000;
      // What the recorder WROTE: its own `mimeType`, else the first chunk's, else what was asked for. The bytes are
      // read again at upload (`resolveExt`), so a recorder that misreports is corrected before the server sees it.
      const actual = rec.mimeType || chunks[0]?.type || requested || "";
      const blob = new Blob(chunks, { type: actual.split(";")[0] || "video/mp4" });
      if (blob.size === 0) return refuse("tooShort");
      review({ kind: "video", blob, ext: videoExtFromType(actual) ?? "mp4", seconds: Math.min(seconds, STORY_VIDEO_LIMIT_SECONDS) });
    };
    rec.onerror = () => {
      if (rec.state === "recording") rec.stop();
    };
    // ★ The limit is a timer from the first frame, not a poll: fifteen seconds exactly. Armed at `start()` and armed
    // again by `onstart`, which is when the recorder really began (Safari starts a beat late).
    const arm = () => {
      if (limitTimer.current !== null) window.clearTimeout(limitTimer.current);
      started.current = performance.now();
      limitTimer.current = window.setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, STORY_VIDEO_LIMIT_SECONDS * 1000);
    };
    rec.onstart = arm;
    recorder.current = rec;
    setElapsed(0);
    setMessage(undefined);
    // A timeslice, so a recording stopped early or cut short by the system still hands over what it captured.
    rec.start(1000);
    arm();
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
    setMessage(undefined);
    const isImage = file.type.startsWith("image/") || (!file.type && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name));
    if (isImage) {
      const prepared = await preparePhoto(file);
      if (!mounted.current) return;
      if (!prepared) return refuse("unsupported");
      return review({ kind: "photo", blob: prepared.blob, type: prepared.kind });
    }
    const ext = videoExtFromType(file.type) ?? videoExtFromName(file.name) ?? sniffVideoExt(await readHead(file));
    if (!mounted.current) return;
    if (!ext) return refuse("unsupported");
    if (file.size > STORY_VIDEO_MAX_BYTES) return refuse("tooLarge");
    const seconds = await videoDuration(file);
    if (!mounted.current) return;
    if (Number.isFinite(seconds) && seconds > PICK_LIMIT_SECONDS) return refuse("tooLong");
    review({ kind: "video", blob: file, ext, seconds: Number.isFinite(seconds) ? seconds : null });
  }

  function retake() {
    inflight.current?.abort();
    if (poll.current !== null) window.clearTimeout(poll.current);
    poll.current = null;
    ticket.current = {};
    setDraft(null);
    setDraftUrl(null);
    setPosterUrl(null);
    setProgress(undefined);
    setState("idle");
    setMessage(undefined);
  }

  function reason(e: unknown): string {
    if (e instanceof UploadError) {
      if (e.status === 403 || e.code === "not_authorized") return t("capture.refused");
      if (e.status === 413 || e.code === "file_too_large" || e.code === "Payload too large") return t("capture.tooLarge");
      // No answer at all — offline, a timeout, a dropped connection — after the retries ran out.
      if (e.status === 0) return t("capture.offline");
    }
    return t("frame.failed");
  }

  /** The container the server is told — the bytes' own answer, never the label's. */
  async function resolveExt(d: Extract<Draft, { kind: "video" }>): Promise<VideoExt> {
    try {
      return sniffVideoExt(await readHead(d.blob)) ?? d.ext;
    } catch {
      return d.ext;
    }
  }

  async function submit() {
    if (!draft || state === "uploading" || state === "processing") return;
    const controller = new AbortController();
    inflight.current = controller;
    const signal = controller.signal;
    const headers = { "x-locale": locale };
    // A signed upload URL lives 2 hours: a retry after that starts again at the first step.
    if (ticket.current.init && !ticket.current.put && clock() - ticket.current.init.at > SIGNED_URL_FOR_MS) ticket.current = {};
    const done = ticket.current;
    setState("uploading");
    setMessage(undefined);
    setProgress(done.put ? 0.95 : 0);
    // Init 5 %, the bytes to 95 %, the hand-over the rest — the bar never sits at zero while the first request flies.
    const onBytes = (f: number) => mounted.current && setProgress(0.05 + f * 0.9);
    try {
      if (!done.init) {
        const body =
          draft.kind === "photo"
            ? { url: "/api/upload/photo", json: { sessionId, kind: draft.type, declaredByteSize: draft.blob.size } }
            : { url: "/api/stories/video", json: { sessionId, ext: await resolveExt(draft), declaredByteSize: draft.blob.size } };
        const init = await withRetry(() => postJson<Init>(body.url, body.json, headers, signal), { signal });
        done.init = { id: "photoId" in init ? init.photoId : init.frameId, ...init.upload, at: clock() };
        if (mounted.current) setProgress(0.05);
      }
      const init = done.init;
      if (!done.put) {
        await withRetry(
          async () => {
            try {
              await putBlob(init.signedUrl, draft.blob, init.contentType, { onProgress: onBytes, signal });
            } catch (e) {
              // An earlier PUT of this take landed and only its answer was lost: what we wanted is there.
              if (isAlreadyUploaded(e)) return;
              throw e;
            }
          },
          { signal },
        );
        done.put = true;
      }
      const text = caption.trim() || undefined;
      if (draft.kind === "photo") {
        await withRetry(
          () =>
            postJson(
              "/api/stories/photo/complete",
              { photoId: init.id, sessionId, path: init.path, kind: draft.type, byteSize: draft.blob.size, caption: text },
              headers,
              signal,
            ),
          { signal },
        );
      } else {
        await withRetry(
          () => postJson("/api/stories/video/complete", { frameId: init.id, sessionId, path: init.path, byteSize: draft.blob.size, caption: text }, headers, signal),
          { signal },
        );
      }
      if (!mounted.current) return;
      ticket.current = {};
      setProgress(1);
      if (draft.kind === "photo") {
        // ★ Said, then closed — the parent reads the page again AFTER the dialog is gone. A refresh under an open
        // capture re-rendered the page around a live portal (the owner's «error page, then it uploaded»).
        toast.show({ tone: "success", title: t("frame.processing") });
        return onClose();
      }
      setState("processing");
      setMessage(t("frame.processing"));
      watch(init.id, POLL_FOR_MS / POLL_MS);
    } catch (e) {
      if (!mounted.current || (e instanceof UploadError && e.aborted)) return;
      // ★ The take is KEPT: «أعد المحاولة» resumes from the first step that did not succeed.
      setProgress(undefined);
      setState("error");
      setMessage(reason(e));
    } finally {
      if (inflight.current === controller) inflight.current = null;
    }
  }

  /** The author's own video, followed until the worker has answered: ready closes the capture (the parent reads the
   *  story again and it is there); a refusal says why and hands the camera back; silence past 90 s leaves it saying
   *  «جارٍ التجهيز» — the story says the same. A route that does not answer (404) is not followed. */
  function watch(frameId: string, left: number) {
    poll.current = window.setTimeout(async () => {
      poll.current = null;
      if (!mounted.current) return;
      let status: VideoStatus | null = null;
      try {
        const res = await fetch(`/api/stories/video/${frameId}`, { headers: { "x-locale": locale }, credentials: "same-origin", cache: "no-store" });
        if (res.status === 404) return;
        if (res.ok) status = (await res.json()) as VideoStatus;
      } catch {
        // A dropped poll is asked again.
      }
      if (!mounted.current) return;
      if (status?.state === "visible") return onClose();
      if (status?.state === "failed") {
        const why = status.reason;
        if (why === "too_long" || why === "too_large" || why === "unsupported") {
          retake();
          return refuse(why === "too_long" ? "tooLong" : why === "too_large" ? "tooLarge" : "unsupported");
        }
        // A failure that was not the take's fault: the take is still here, and «أعد المحاولة» sends it afresh.
        ticket.current = {};
        setState("error");
        return setMessage(t("frame.failed"));
      }
      if (left > 1) watch(frameId, left - 1);
    }, POLL_MS);
  }

  const preview =
    draft && draftUrl ? (
      draft.kind === "photo" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL under review
        <img src={draftUrl} alt="" className="h-full w-full object-contain" />
      ) : (
        <ReviewVideo src={draftUrl} poster={posterUrl} playLabel={t("viewer.resume")} pauseLabel={t("viewer.pause")} />
      )
    ) : (
      <video ref={attach} autoPlay muted playsInline disablePictureInPicture data-camera-error={cameraError ?? undefined} className="h-full w-full object-cover" />
    );

  const denied = cameraError !== null && !draft && state === "idle";
  const percent = progress === undefined ? undefined : `${formatNumber(Math.round(progress * 100))}%`;
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
        inflight.current?.abort();
        onClose();
      }}
      progress={state === "uploading" ? progress : undefined}
      message={denied ? t("capture.denied") : state === "uploading" && percent ? t("capture.uploading", { percent }) : message}
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
        retry: t("capture.retry"),
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

/** The take, played back under review. ★ NOT the browser's own controls: they draw at the video's bottom edge, exactly
 *  where the caption, «أعد» and «انشر» sit, so on a phone the take had no visible way to play (the owner's report).
 *  One centred button — a tap, never a gesture (DEC-093) — plays it with its sound and pauses it; the still read from
 *  the take is the poster, so it is never a black box. */
function ReviewVideo({ src, poster, playLabel, pauseLabel }: { src: string; poster: string | null; playLabel: string; pauseLabel: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play()?.catch(() => setPlaying(false));
    else el.pause();
  }
  return (
    <div className="relative h-full w-full">
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        playsInline
        disablePictureInPicture
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        data-review-video=""
        className="h-full w-full object-contain"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? pauseLabel : playLabel}
        className="absolute start-1/2 top-1/2 inline-flex size-16 -translate-y-1/2 items-center justify-center rounded-pill bg-chrome text-2xl text-fg-heading ltr:-translate-x-1/2 rtl:translate-x-1/2"
      >
        {playing ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
      </button>
    </div>
  );
}
