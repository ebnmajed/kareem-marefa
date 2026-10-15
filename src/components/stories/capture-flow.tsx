"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { StoryCaptureSource, StoryCaptureState } from "@/components/ui";
import { StoryCapture } from "@/components/ui/story-capture";
import { formatNumber } from "@/components/sessions/numerals";
import {
  STORY_VIDEO_MAX_BYTES,
  STORY_VIDEO_MAX_MB,
  preparePhoto,
  readHead,
  sniffVideoExt,
  videoExtFromName,
  videoExtFromType,
  videoPoster,
  type PhotoKind,
  type VideoExt,
} from "@/components/stories/media";
import { UploadError, isAlreadyUploaded, postJson, putBlob, withRetry } from "@/components/stories/upload";
import { useToast } from "@/components/ui/toast";
import { PauseIcon, PlayIcon } from "@/components/ui/icons";

// «أضف» — the take and the two uploads behind `ui/story-capture` (REQ-STO-011, REQ-STO-012, REQ-STO-016, DEC-293).
// ★★ NO LIVE CAMERA (DEC-293): the phone's own camera app and gallery hand over a File through the primitive's three
// inputs; this file begins there. A photograph goes through the album's OWN door (`/api/upload/photo`, then
// `/api/stories/photo/complete` for the caption and the capture gate); a video PUTs to `story-media` and completes at
// `/api/stories/video/complete`. The bytes never pass through Vercel. The length is the worker's: it keeps the first
// 15 s of a longer video — the phone refuses only a file over the server's byte ceiling, at once and in a word. The
// member is told it is processing, never that it was posted (DEC-139).
//
// ★ ROBUST BY CONSTRUCTION (the owner's report of 2026-10-14, docs/plan/notes/story-media.md):
// - a video's container is read from its bytes before upload — never from the picker's label;
// - a photograph is prepared on the phone — upright, a phone's size, no metadata — before it leaves;
// - the bytes PUT with progress, a timeout and a retry with backoff; a step that succeeded is never repeated, so a
//   retry after a dropped connection resumes where it stopped;
// - a failure keeps the take and says why, with «أعد المحاولة» — never a page of its own, never a lost take;
// - nothing refreshes the page while the capture is open (the parent reads it again on close);
// - the review and the «processing» state show a still of the take, never a black box.

const CAPTION_MAX = 100;
/** The author's poll while a video is transcoded — every 2 s, for at most 90 s (the contract's step 4). */
const POLL_MS = 2000;
const POLL_FOR_MS = 90_000;
const SIGNED_URL_FOR_MS = 110 * 60_000;
/** The age of a signed URL is read in an event handler, never in render. */
const clock = () => performance.now();
const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i;

type VideoStatus = { state: "processing" } | { state: "visible" } | { state: "failed"; reason?: "too_long" | "too_large" | "unsupported" | "failed" };

type Draft = { kind: "photo"; blob: Blob; type: PhotoKind } | { kind: "video"; blob: Blob; ext: VideoExt };

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
  const mounted = useRef(true);
  const inflight = useRef<AbortController | null>(null);
  const ticket = useRef<Ticket>({});
  const poll = useRef<number | null>(null);

  const [state, setState] = useState<StoryCaptureState>("choose");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [caption, setCaption] = useState("");
  const [message, setMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      inflight.current?.abort();
      if (poll.current !== null) window.clearTimeout(poll.current);
    };
  }, []);

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

  function refuse(key: "tooLong" | "tooLarge" | "unsupported") {
    setState("refused");
    setMessage(tooLargeOr(key));
  }

  /** The word for a refusal; «أكبر من 200 ميغابايت» carries the ceiling read from the one constant. */
  function tooLargeOr(key: "tooLong" | "tooLarge" | "unsupported"): string {
    return key === "tooLarge" ? t("capture.tooLarge", { size: formatNumber(STORY_VIDEO_MAX_MB) }) : t(`capture.${key}`);
  }

  /** A file from the camera app or the gallery. Its kind is read from the file, never from which button opened the
   *  picker — a gallery hands over either, and some Android cameras label nothing. */
  async function onPick(file: File, source: StoryCaptureSource) {
    setMessage(undefined);
    const isImage = file.type.startsWith("image/") || (!file.type && IMAGE_NAME.test(file.name)) || (!file.type && source === "photo");
    if (isImage) {
      const prepared = await preparePhoto(file);
      if (!mounted.current) return;
      if (!prepared) return refuse("unsupported");
      return review({ kind: "photo", blob: prepared.blob, type: prepared.kind });
    }
    const ext = videoExtFromType(file.type) ?? videoExtFromName(file.name) ?? sniffVideoExt(await readHead(file).catch(() => new Uint8Array()));
    if (!mounted.current) return;
    if (!ext) return refuse("unsupported");
    if (file.size > STORY_VIDEO_MAX_BYTES) return refuse("tooLarge");
    review({ kind: "video", blob: file, ext });
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
    setState("choose");
    setMessage(undefined);
  }

  function reason(e: unknown): string {
    if (e instanceof UploadError) {
      if (e.status === 403 || e.code === "not_authorized") return t("capture.refused");
      // Storage's own ceiling answers the PUT with 413, or 400 with «Payload too large» — read as too_large either way.
      if (e.status === 413 || e.code === "file_too_large" || /payload too large|too large|exceeded the maximum/i.test(e.code ?? "")) return tooLargeOr("tooLarge");
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
   *  story again and it is there); a refusal says why and offers the three choices again; silence past 90 s leaves it saying
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
    ) : undefined;

  const percent = progress === undefined ? undefined : `${formatNumber(Math.round(progress * 100))}%`;
  return (
    <StoryCapture
      open
      state={state}
      preview={preview}
      onPick={(f, source) => void onPick(f, source)}
      caption={caption}
      onCaptionChange={setCaption}
      captionMaxLength={CAPTION_MAX}
      onSubmit={() => void submit()}
      onRetake={retake}
      onClose={() => {
        inflight.current?.abort();
        onClose();
      }}
      progress={state === "uploading" ? progress : undefined}
      message={state === "uploading" && percent ? t("capture.uploading", { percent }) : message}
      labels={{
        dialog: t("capture.dialog"),
        close: t("viewer.close"),
        photo: t("capture.photo"),
        video: t("capture.video"),
        gallery: t("capture.gallery"),
        caption: t("capture.caption"),
        submit: t("capture.submit"),
        retake: t("capture.retake"),
        retry: t("capture.retry"),
        notice: t("capture.notice"),
      }}
    />
  );
}

/** The take, played back under review. ★ NOT the browser's own controls: they draw at the video's bottom edge, exactly
 *  where the caption, «إعادة» and «انشر» sit, so on a phone the take had no visible way to play (the owner's report).
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
