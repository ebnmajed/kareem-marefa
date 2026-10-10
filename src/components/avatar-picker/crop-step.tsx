"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AlertCircleIcon } from "@/components/ui/icons";
import { formatNumber } from "@/components/sessions/numerals";
import { centreOn, clampView, panBy, viewScale, zoomAbout, ZOOM_MAX, ZOOM_MIN, type CropView, type ImageSize } from "./crop-geometry";
import { encodeSquare } from "./encode";
import { MAX_UPLOAD_BYTES, uploadPicture, type UploadOutcome } from "./upload";

// The crop step (REQ-PRF-017, AVA-06, AVA-07; `AvatarCrop.dc.html`): «إلغاء» · the image behind a 300 px circle · a
// zoom slider · «حفظ». It replaces the sheet's body in the same frame — not a second dialog — so «صورتك» is the frame's
// title, at the start of its row rather than centred as drawn (`ui/sheet` draws the one title).
//
// ★ EVERY GESTURE HAS A SINGLE-POINTER PATH THAT IS NOT A GESTURE (DEC-093, SC 2.5.7), and a key:
//   drag to pan       → a TAP on the image brings that point to the centre · arrow keys on the stage
//   pinch / wheel     → a TAP on the slider's track sets the zoom          · the slider's own keys
//
// «حفظ» encodes the circle's square at 1024 px under the route's cap and sends it (`upload.ts`); the button stays
// pending until the worker answers. Nothing changes in the ring or the shell before `done` — no optimistic preview.
// «إلغاء» returns to the sheet with nothing changed, aborting an upload in flight.

const CIRCLE_MAX = 300;
/** A pointer that moved less than this between down and up was a tap. */
const TAP_SLOP = 6;
const KEY_STEP = 8;

export interface CropStepProps {
  bitmap: CanvasImageSource & ImageSize;
  onCancel: () => void;
  /** The worker said `done`; the flow closes and the page rereads. */
  onDone: (href: string | null) => void;
}

type Failure = "type" | "upload" | null;

export function CropStep({ bitmap, onCancel, onDone }: CropStepProps) {
  const t = useTranslations("profile.picture");
  const tProfile = useTranslations("profile");
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const circle = Math.min(CIRCLE_MAX, Math.max(0, box.width - 32), Math.max(0, box.height - 32)) || CIRCLE_MAX;
  const [view, setView] = useState<CropView>({ zoom: 1, x: 0, y: 0 });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const blob = useRef<Blob | null>(null);
  const abort = useRef<AbortController | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; startX: number; startY: number; pinch: number | null }>({ moved: false, startX: 0, startY: 0, pinch: null });

  // The stage's size, so the circle fits a short phone and the canvas is drawn at the device's density.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // What is drawn and saved: the view, clamped to the circle as it measures now (a resize can shrink the circle).
  const shown = clampView(bitmap, circle, view);

  // Draw. A canvas, not a CSS-transformed <img>, so what is drawn is what `encodeSquare()` will save.
  useEffect(() => {
    const el = canvas.current;
    const context = el?.getContext?.("2d");
    if (!el || !context || box.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(box.width * dpr);
    el.height = Math.round(box.height * dpr);
    const scale = viewScale(bitmap, circle, shown.zoom);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, box.width, box.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    context.drawImage(bitmap, box.width / 2 + shown.x - w / 2, box.height / 2 + shown.y - h / 2, w, h);
  }, [bitmap, box, circle, shown.zoom, shown.x, shown.y]);

  // Abort an upload in flight if the step leaves.
  useEffect(() => () => abort.current?.abort(), []);

  const local = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (pending) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) gesture.current = { moved: false, startX: event.clientX, startY: event.clientY, pinch: null };
    else gesture.current = { ...gesture.current, moved: true, pinch: null };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || pending) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const last = gesture.current.pinch;
      gesture.current.pinch = distance;
      if (last) setView((v) => zoomAbout(bitmap, circle, v, v.zoom * (distance / last)));
      return;
    }
    if (Math.hypot(event.clientX - gesture.current.startX, event.clientY - gesture.current.startY) > TAP_SLOP) gesture.current.moved = true;
    if (gesture.current.moved) setView((v) => panBy(bitmap, circle, v, event.clientX - previous.x, event.clientY - previous.y));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    if (pointers.current.size === 0 && !gesture.current.moved && !pending) {
      const p = local(event);
      setView((v) => centreOn(bitmap, circle, v, p.x, p.y));
    }
    if (pointers.current.size < 2) gesture.current.pinch = null;
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (pending) return;
    setView((v) => zoomAbout(bitmap, circle, v, v.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = move[event.key];
    if (!delta || pending) return;
    event.preventDefault();
    setView((v) => panBy(bitmap, circle, v, delta[0], delta[1]));
  };

  const send = async () => {
    setFailure(null);
    setPending(true);
    try {
      blob.current ??= await encodeSquare(bitmap, circle, shown, MAX_UPLOAD_BYTES);
      if (!blob.current) {
        setFailure("upload");
        return;
      }
      abort.current = new AbortController();
      const outcome: UploadOutcome = await uploadPicture(blob.current, abort.current.signal);
      if (outcome.state === "done") return onDone(outcome.href);
      setFailure(outcome.state === "refused" ? "type" : "upload");
    } catch {
      // Aborted by «إلغاء»: the step is leaving.
    } finally {
      setPending(false);
    }
  };

  // A changed view is a new picture: the encoded blob is for the old one.
  useEffect(() => {
    blob.current = null;
  }, [view]);

  const cancel = () => {
    abort.current?.abort();
    onCancel();
  };

  const zoomPercent = Math.round(shown.zoom * 100);

  return (
    <div className="flex flex-col gap-4">
      {/* «صورتك» is the frame's title, so this row carries «إلغاء» alone. */}
      <div className="-mt-2 flex min-h-11 items-center">
        <button type="button" onClick={cancel} className="min-h-11 px-1 text-body-sm font-bold text-fg-muted">
          {t("crop.cancel")}
        </button>
      </div>

      <div
        ref={stage}
        role="group"
        aria-label={t("crop.image")}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        className="relative -mx-5 h-[min(26rem,52dvh)] touch-none overflow-hidden bg-canvas select-none"
      >
        <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 h-full w-full" />
        <span
          aria-hidden="true"
          data-slot="circle"
          className="pointer-events-none absolute inset-0 m-auto rounded-pill border-2 border-fg-heading/70 shadow-[0_0_0_2000px_var(--color-scrim)]"
          style={{ width: circle, height: circle }}
        />
      </div>

      <Field id="avatar-crop-zoom" label={<span className="sr-only">{t("crop.zoom")}</span>}>
        <input
          id="avatar-crop-zoom"
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={0.01}
          value={shown.zoom}
          disabled={pending}
          aria-valuetext={`${formatNumber(zoomPercent)}%`}
          onChange={(event) => setView((v) => zoomAbout(bitmap, circle, v, Number(event.target.value)))}
          className="block h-6 w-full accent-accent"
        />
      </Field>

      {failure ? (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption font-bold text-error">
          <span className="inline-flex items-center gap-1.5">
            <AlertCircleIcon />
            {failure === "type" ? t.rich("errors.type", { ltr: (c) => <bdi dir="ltr">{c}</bdi> }) : t("errors.upload")}
          </span>
          {failure === "upload" ? (
            <button type="button" onClick={send} className="min-h-9 text-caption font-bold text-fg-heading underline underline-offset-4">
              {t("retry")}
            </button>
          ) : null}
        </div>
      ) : null}

      <Button type="button" size="lg" className="w-full" pending={pending} pendingLabel={tProfile("saving")} onClick={send}>
        {tProfile("save")}
      </Button>
    </div>
  );
}
