"use client";

import { useId, type ReactNode } from "react";
import { Dialog as RadixDialog } from "radix-ui";
import type { StoryCaptureProps, StoryCaptureSource } from "@/components/ui";
import { CameraIcon, CloseIcon, ImageIcon, PlayIcon } from "@/components/ui/icons";
import { usePlayPortal } from "@/components/ui/scope-portal";

// content's file — REQ-STO-011, REQ-EVT-013, DEC-093, DEC-293. The full-screen «أضف». PRESENTATIONAL: it reads nothing.
//
// ★★ NO LIVE CAMERA (DEC-293, the owner's ruling). The first screen is three file inputs, each one big labelled button:
// «صورة» opens the phone's own camera for a photograph (`image/*`, `capture="environment"`), «فيديو» the camera for a
// video (`video/*`, `capture="environment"`), «من الاستوديو» the gallery (no `capture`). On a desktop each opens the file
// picker. The phone's camera app brings its own controls, both cameras, rotation and stabilisation — and a file input
// is a tap, never a gesture, so DEC-093 is met by the platform. Each button IS the input's label, so the tap that
// opens the camera is the member's own.
//
// Our screen begins AFTER the take: the review (the caller's preview — a photo, or a video with its own play button),
// the one caption line, «أعد» (back to the three) and «انشر», the upload's progress, and a failure that keeps the take
// with «أعد المحاولة». The notice says where the post goes, at the point of upload (REQ-EVT-013).

// The wildcard is spliced in rather than written after a slash: the registry gate strips «/» + «*» as a comment opener
// (`tests/unit/ui-playground.test.ts`, `code()`), and a literal one would swallow the rest of this file.
const ANY = "*";
const SOURCES: { source: StoryCaptureSource; accept: string; capture?: "environment" }[] = [
  { source: "photo", accept: `image/${ANY}`, capture: "environment" },
  { source: "video", accept: `video/${ANY}`, capture: "environment" },
  { source: "gallery", accept: `image/${ANY},video/${ANY}` },
];

const GLYPH: Record<StoryCaptureSource, ReactNode> = {
  photo: <CameraIcon aria-hidden className="text-2xl" />,
  video: <PlayIcon aria-hidden className="text-2xl" />,
  gallery: <ImageIcon aria-hidden className="text-2xl" />,
};

export function StoryCapture({
  open,
  state,
  preview,
  onPick,
  caption,
  onCaptionChange,
  captionMaxLength,
  onSubmit,
  onRetake,
  onClose,
  progress,
  message,
  labels,
}: StoryCaptureProps) {
  const landing = usePlayPortal();
  const baseId = useId();
  const captionId = useId();

  const choosing = state === "choose" || state === "refused";
  const failed = state === "error";
  const busy = state === "uploading" || state === "processing";
  const label: Record<StoryCaptureSource, string> = { photo: labels.photo, video: labels.video, gallery: labels.gallery };

  return (
    <RadixDialog.Root open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <RadixDialog.Portal container={landing}>
        <RadixDialog.Content aria-describedby={undefined} data-story-capture="" data-state={state} className="fixed inset-0 z-50 flex h-dvh justify-center bg-canvas text-fg-heading outline-none">
          <div className="relative flex h-full w-full max-w-[24.375rem] flex-col overflow-hidden bg-void pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {/* The take, under the controls: its own layer at z-0, every row of controls a composited layer above it —
                iOS draws a playing <video> in a layer of its own. The height is the visible viewport (`h-dvh`). */}
            {!choosing && preview ? <div className="absolute inset-0 z-0">{preview}</div> : null}

            {/* `StoryAdd.dc.html`: the title pill CENTRED, close at a side — a three-column row whose outer columns are the
                close's width, so the pill stays centred whatever its length. */}
            <div className="relative z-10 grid transform-gpu grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 px-3">
              <span aria-hidden />
              <RadixDialog.Title className="justify-self-center truncate rounded-pill bg-chrome px-3 py-1.5 text-label font-bold leading-[1.7]">{labels.dialog}</RadixDialog.Title>
              <RadixDialog.Close aria-label={labels.close} className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-chrome text-fg-heading hover:bg-hover">
                <CloseIcon aria-hidden />
              </RadixDialog.Close>
            </div>

            {/* The middle carries words only, so a tap there reaches the take — the review's own play control. */}
            <div className="pointer-events-none relative z-10 flex flex-1 transform-gpu flex-col items-center justify-center gap-2 px-4">
              {message ? (
                <p role="status" className="rounded-panel bg-chrome px-3 py-2 text-center text-body-sm font-bold">
                  {message}
                </p>
              ) : null}
            </div>

            <div className="relative z-10 flex transform-gpu flex-col gap-3 px-4">
              {choosing ? (
                <div role="group" aria-label={labels.dialog} className="flex flex-col gap-2.5">
                  {SOURCES.map(({ source, accept, capture }) => {
                    const id = `${baseId}-${source}`;
                    return (
                      <div key={source}>
                        {/* The whole button is the label; the input is visually hidden but keeps its focus, which the
                            label draws (`focus-within`). */}
                        <input
                          id={id}
                          type="file"
                          accept={accept}
                          capture={capture}
                          data-source={source}
                          className="peer sr-only"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) onPick(file, source);
                          }}
                        />
                        <label
                          htmlFor={id}
                          className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-pill bg-chrome px-5 font-display text-h3 font-extrabold text-fg-heading hover:bg-hover peer-focus-visible:outline-2 peer-focus-visible:outline-focus"
                        >
                          {GLYPH[source]}
                          {label[source]}
                        </label>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  {/* The one caption line, written while the take is reviewed. */}
                  <label htmlFor={captionId} className="sr-only">
                    {labels.caption}
                  </label>
                  <input
                    id={captionId}
                    type="text"
                    dir="auto"
                    value={caption}
                    maxLength={captionMaxLength}
                    placeholder={labels.caption}
                    disabled={busy}
                    onChange={(e) => onCaptionChange(e.target.value)}
                    className="min-h-11 w-full rounded-pill border-0 bg-chrome px-3.5 text-body text-fg-heading placeholder:text-fg-muted"
                  />
                  {state === "uploading" ? (
                    <div
                      role="progressbar"
                      aria-label={labels.submit}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress === undefined ? undefined : Math.round(progress * 100)}
                      data-slot="progress"
                      className="h-1.5 w-full overflow-hidden rounded-pill bg-chrome"
                    >
                      <span aria-hidden className="block h-full w-full rounded-pill bg-fg-heading ltr:origin-left rtl:origin-right" style={{ transform: `scaleX(${progress ?? 0.05})` }} />
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={onRetake} disabled={busy} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-pill bg-chrome px-4 font-bold">
                      {labels.retake}
                    </button>
                    <button
                      type="button"
                      onClick={onSubmit}
                      aria-disabled={busy || undefined}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-pill bg-fg-heading px-4 font-display font-extrabold text-canvas aria-disabled:opacity-60"
                    >
                      {failed ? (labels.retry ?? labels.submit) : labels.submit}
                    </button>
                  </div>
                </>
              )}
              <p className="text-center text-caption text-fg-muted">{labels.notice}</p>
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
