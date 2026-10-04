"use client";

import { useId, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { Dialog as RadixDialog } from "radix-ui";
import type { StoryCaptureMode, StoryCaptureProps } from "@/components/ui";
import { CameraIcon, CloseIcon, ImageIcon } from "@/components/ui/icons";
import { usePlayPortal } from "@/components/ui/scope-portal";

// content's file — REQ-STO-011, REQ-EVT-013, DEC-093, DEC-248 §7.7. The full-screen «أضف»: tap for a photograph, a
// video of up to 15 seconds, the gallery at the start, flip at the end, one caption line. PRESENTATIONAL: the camera,
// the recorder and the upload live in `components/stories/` — this file renders every state from props and reads
// nothing.
//
// ★★ A HOLD IS A GESTURE, SO IT IS NEVER THE ONLY WAY TO RECORD (DEC-093, REQ-STO-011 «started and stopped by taps
// alone»). The mode switch «صورة · فيديو» sits above the shutter: in «فيديو» the shutter is TAP TO START, TAP TO STOP,
// `aria-pressed` while recording, its name saying what the next tap does. In «صورة» a tap takes the photograph and a
// hold records — the enhancement `StoryAdd.dc.html` draws, kept and no longer alone.
//
// ★ The notice says where the post goes, at the point of upload (REQ-EVT-013) — one line, never the board's «تظهر في
// قصة الجلسة وألبومها», which is wrong for a video (REQ-STO-012).

const HOLD_MS = 220;
const ROUND = "inline-flex size-[3.25rem] shrink-0 items-center justify-center rounded-pill bg-chrome text-fg-heading hover:bg-hover";
const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";

export function StoryCapture({
  open,
  state,
  mode,
  onModeChange,
  preview,
  elapsedSeconds,
  limitSeconds,
  onShutter,
  onHoldStart,
  onHoldEnd,
  onPick,
  onFlip,
  caption,
  onCaptionChange,
  captionMaxLength,
  onSubmit,
  onRetake,
  onClose,
  message,
  labels,
}: StoryCaptureProps) {
  const landing = usePlayPortal();
  const pickId = useId();
  const captionId = useId();
  const hold = useRef<{ timer: number; held: boolean } | null>(null);

  const recording = state === "recording";
  const reviewing = state === "review";
  const busy = state === "uploading" || state === "processing";
  const canShoot = state === "idle" || recording;

  const shutterName = mode === "photo" ? labels.shutterPhoto : recording ? labels.recordStop : labels.recordStart;

  function shutterDown(event: PointerEvent<HTMLButtonElement>) {
    if (mode !== "photo" || !onHoldStart || event.button !== 0) return;
    const timer = window.setTimeout(() => {
      if (hold.current) hold.current.held = true;
      onHoldStart();
    }, HOLD_MS);
    hold.current = { timer, held: false };
  }

  function shutterUp() {
    const h = hold.current;
    hold.current = null;
    if (!h) return;
    window.clearTimeout(h.timer);
    if (h.held) onHoldEnd?.();
  }

  function shutterClick() {
    // A hold already did its work on release; its click is not also a photograph.
    if (hold.current?.held) return;
    onShutter();
  }

  function modeKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const nextMode: StoryCaptureMode = mode === "photo" ? "video" : "photo";
    onModeChange(nextMode);
    (event.currentTarget.querySelector(`[data-mode="${nextMode}"]`) as HTMLElement | null)?.focus();
  }

  const elapsed = labels.elapsed(Math.min(elapsedSeconds, limitSeconds), limitSeconds);

  return (
    <RadixDialog.Root open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <RadixDialog.Portal container={landing}>
        <RadixDialog.Content aria-describedby={undefined} data-story-capture="" data-state={state} className="fixed inset-0 z-50 flex justify-center bg-canvas text-fg-heading outline-none">
          <div className="relative flex h-full w-full max-w-[24.375rem] flex-col overflow-hidden bg-void pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="absolute inset-0">{preview}</div>

            <div className="relative z-10 flex items-center justify-between gap-2 px-3">
              <RadixDialog.Title className="truncate rounded-pill bg-chrome px-3 py-1.5 text-label font-bold">{labels.dialog}</RadixDialog.Title>
              <RadixDialog.Close aria-label={labels.close} className={`${ROUND} size-11`}>
                <CloseIcon aria-hidden />
              </RadixDialog.Close>
            </div>

            <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-2 px-4">
              {mode === "video" && (recording || state === "idle") ? (
                <span data-slot="elapsed" className="rounded-pill bg-chrome px-2.5 py-1 text-caption font-bold tabular-nums">
                  <bdi dir="ltr">{elapsed}</bdi>
                </span>
              ) : null}
              {message ? (
                <p role="status" className="rounded-panel bg-chrome px-3 py-2 text-center text-body-sm font-bold">
                  {message}
                </p>
              ) : null}
            </div>

            <div className="relative z-10 flex flex-col gap-3 px-4">
              {reviewing || busy ? (
                <>
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
                      {labels.submit}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div role="radiogroup" aria-label={labels.dialog} onKeyDown={modeKeys} className="flex self-center rounded-pill bg-chrome p-1">
                    {(["photo", "video"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        data-mode={m}
                        aria-checked={mode === m}
                        tabIndex={mode === m ? 0 : -1}
                        disabled={recording}
                        onClick={() => onModeChange(m)}
                        className={`inline-flex min-h-11 min-w-20 items-center justify-center rounded-pill px-4 text-label font-bold ${mode === m ? "bg-fg-heading text-canvas" : "text-fg-heading"}`}
                      >
                        {m === "photo" ? labels.photoMode : labels.videoMode}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <label htmlFor={pickId} className="inline-flex size-[3.25rem] shrink-0 cursor-pointer items-center justify-center rounded-tile border-2 border-edge-strong bg-chrome text-fg-heading focus-within:outline-2 focus-within:outline-focus hover:bg-hover">
                      <span className="sr-only">{labels.gallery}</span>
                      <ImageIcon aria-hidden className="text-xl" />
                    </label>
                    <input
                      id={pickId}
                      type="file"
                      accept={ACCEPT}
                      className="sr-only"
                      disabled={recording}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) onPick(file);
                      }}
                    />
                    <button
                      type="button"
                      aria-label={shutterName}
                      aria-pressed={mode === "video" ? recording : undefined}
                      disabled={!canShoot}
                      onClick={shutterClick}
                      onPointerDown={shutterDown}
                      onPointerUp={shutterUp}
                      onPointerLeave={shutterUp}
                      onPointerCancel={shutterUp}
                      onContextMenu={(e) => e.preventDefault()}
                      data-recording={recording || undefined}
                      className="inline-flex size-[4.75rem] items-center justify-center rounded-pill border-[5px] border-fg-heading p-1 disabled:opacity-50"
                    >
                      <span aria-hidden className={`block bg-signal ${recording ? "size-7 rounded-field" : "size-full rounded-pill"}`} />
                    </button>
                    {onFlip ? (
                      <button type="button" aria-label={labels.flip} onClick={onFlip} disabled={recording} className={ROUND}>
                        <CameraIcon aria-hidden className="text-xl" />
                      </button>
                    ) : (
                      <span aria-hidden className="size-[3.25rem]" />
                    )}
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
