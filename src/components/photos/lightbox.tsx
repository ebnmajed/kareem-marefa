"use client";

import { createContext, useContext, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { buttonClass } from "@/components/ui/button";
import { ChevronIcon, DownloadIcon } from "@/components/ui/icons";
import { formatNumber } from "@/components/sessions/numerals";

// REQ-EVT-016 — a session's photographs open WHOLE, and are moved through by
// tapping. ★ `DEC-093`'s sixth place: «السابقة» and «التالية» are always-visible
// tap targets, and the swipe below is an enhancement layered on them, never the
// only way to move (`SC 2.5.7`). The gate is `wave14-content-lightbox.spec.ts`,
// driven with `page.click()` alone.
//
// The sequence is the VISIBLE photographs only (`hiddenAt === null`), in page
// order, across every day group — one album, one «3 من 12» (DEC-182, Q11). A
// hidden tile never opens it, for anyone, staff included (Q2): the lightbox
// never shows a photograph someone asked to be removed from.
//
// ★ Everything the dialog shows is DERIVED from `photos` and the id on screen,
// never copied into state. A `router.refresh()` while it is open — the viewer's
// own upload landing, a takedown or a restore revalidating the page — hands
// this new props: if the id on screen is still there it stays, and «n من m» is
// recomputed; if it is gone, the photograph now at the same position takes its
// place; if none is left, the dialog closes. (REQ-EVT-015 is not this path —
// only the uploader's widget listens to `0091`'s broadcast.)

export interface LightboxPhoto {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

interface LightboxContext {
  open: (photoId: string, opener: HTMLElement) => void;
  positionOf: (photoId: string) => number;
  total: number;
}

const Context = createContext<LightboxContext | null>(null);

/** An attribute and a live region carry plain text: the catalogue's <bdi> (every value is
 *  isolated there, the house rule) is dropped here, as `gallery.tsx`'s rescope label does — the
 *  values are Western digits, which cannot reorder the sentence around them. */
const plain = (chunks: string) => chunks;

/** A horizontal travel shorter than this is a tap, not a swipe. */
const SWIPE_PX = 48;

export function PhotoLightbox({ photos, children }: { photos: LightboxPhoto[]; children: ReactNode }) {
  const t = useTranslations("photos.lightbox");
  const rtl = useLocale() === "ar";
  const [currentId, setCurrentId] = useState<string | null>(null);
  // The position last shown — where a photograph that disappears is replaced from.
  const [lastIndex, setLastIndex] = useState(0);
  // The display URL each photograph had when the dialog opened. A refresh re-signs
  // every URL (`photos.ts`), and swapping `src` for the photograph already on
  // screen would blank it while the new one loads.
  const [pinned, setPinned] = useState<Record<string, string>>({});
  const opener = useRef<HTMLElement | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  // Every photograph left the sequence while the dialog was open: it closes, and
  // stays closed when photographs come back (React's «adjust state during render»
  // pattern — no effect, no timer).
  if (currentId !== null && photos.length === 0) setCurrentId(null);

  const found = currentId === null ? -1 : photos.findIndex((p) => p.id === currentId);
  const index = found >= 0 ? found : Math.min(lastIndex, photos.length - 1);
  const isOpen = currentId !== null && photos.length > 0;
  const photo = isOpen ? photos[index] : null;
  const current = formatNumber(index + 1);
  const total = formatNumber(photos.length);

  function open(photoId: string, from: HTMLElement) {
    const at = photos.findIndex((p) => p.id === photoId);
    if (at < 0) return;
    opener.current = from;
    setPinned(Object.fromEntries(photos.map((p) => [p.id, p.url])));
    setLastIndex(at);
    setCurrentId(photoId);
  }

  function close() {
    setCurrentId(null);
  }

  function go(step: 1 | -1) {
    const next = index + step;
    if (next < 0 || next >= photos.length) return;
    setLastIndex(next);
    setCurrentId(photos[next].id);
  }

  // The arrow keys follow the VISUAL axis (`page-viewer.tsx`'s rule): in RTL the
  // next photograph is to the left.
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") go(rtl ? 1 : -1);
    else if (event.key === "ArrowRight") go(rtl ? -1 : 1);
  }

  function onPointerDown(event: PointerEvent) {
    pointer.current = { x: event.clientX, y: event.clientY };
  }

  // In RTL the next photograph lies to the left, so a finger moving rightward
  // pulls it into view.
  function onPointerUp(event: PointerEvent) {
    const start = pointer.current;
    pointer.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
    swiped.current = true;
    const forward = rtl ? dx > 0 : dx < 0;
    go(forward ? 1 : -1);
  }

  // A full-viewport dialog has no Radix «outside», so the letterbox around the
  // photograph is the backdrop: a click on the stage itself — not the image, not
  // a control — closes it (REQ-EVT-016).
  function onStageClick(event: MouseEvent) {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if (event.target === event.currentTarget) close();
  }

  const context: LightboxContext = {
    open,
    positionOf: (photoId) => photos.findIndex((p) => p.id === photoId),
    total: photos.length,
  };

  const atStart = index <= 0;
  const atEnd = index >= photos.length - 1;
  // ★ `aria-disabled`, never `disabled`: a disabled button drops focus to <body>,
  // and Radix's FocusScope does not pull it back, so a keyboard user pressing
  // «التالية» onto the last photograph would lose their place.
  const edge = "aria-disabled:cursor-not-allowed aria-disabled:opacity-45";

  return (
    <Context.Provider value={context}>
      {children}
      <Dialog open={isOpen} onOpenChange={(next) => (next ? null : close())}>
        {photo ? (
          <DialogContent
            size="media"
            // Wave 17 (DEC-199 §1.3.5): no `.theme-dark` — the frame is inside the scope, whose
            // dark ground gives the controls and the focus ring their tokens.
            title={t("title")}
            closeLabel={t("close")}
            aria-describedby={undefined}
            onKeyDown={onKeyDown}
            // Radix's modal content focuses its trigger on close, and there is none
            // here — each tile opens the one controlled dialog — so focus would fall
            // to <body>. It returns to the tile that opened it instead.
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (opener.current?.isConnected) opener.current.focus();
            }}
          >
            <div className="flex items-center justify-between gap-3 pb-3">
              <p className="text-body-sm">{t.rich("position", { current, total, bdi: (chunks) => <bdi>{chunks}</bdi> })}</p>
              {/* A route, never a signed URL in page data and never `download`: it
                  audits, then 303s (REQ-ADM-021, DEC-177). A plain <a> so nothing
                  prefetches it. */}
              <a href={`/api/photos/${photo.id}/download`} className={buttonClass("secondary", "md", "gap-2")}>
                <DownloadIcon aria-hidden />
                {t("download")}
              </a>
            </div>
            <div
              data-testid="lightbox-stage"
              className="flex min-h-0 flex-1 touch-pan-y items-center justify-center"
              onClick={onStageClick}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
            >
              {/* ★ NEVER CROPPED: `object-contain` inside the stage (REQ-EVT-016,
                  REQ-UIX-026). The row's own dimensions reserve the box. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed URL, not a static/optimizable asset */}
              <img
                key={photo.id}
                src={pinned[photo.id] ?? photo.url}
                alt={t.markup("alt", { current, total, bdi: plain })}
                width={photo.width ?? undefined}
                height={photo.height ?? undefined}
                data-photo-id={photo.id}
                className="h-auto max-h-full w-auto max-w-full object-contain"
              />
            </div>
            <div className="flex items-center justify-between gap-3 pt-3">
              <IconButton
                label={t("previous")}
                variant="secondary"
                aria-disabled={atStart || undefined}
                onClick={() => go(-1)}
                className={edge}
              >
                <ChevronIcon direction="back" />
              </IconButton>
              <p aria-live="polite" className="sr-only">
                {t.markup("announce", { current, total, bdi: plain })}
              </p>
              <IconButton label={t("next")} variant="secondary" aria-disabled={atEnd || undefined} onClick={() => go(1)} className={edge}>
                <ChevronIcon direction="forward" />
              </IconButton>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </Context.Provider>
  );
}

/** A tile's photograph as the lightbox's trigger. A photograph outside the sequence — a hidden
 *  one, which only staff see in the grid — renders exactly as it did, with no button. */
export function LightboxTile({ photoId, children }: { photoId: string; children: ReactNode }) {
  const t = useTranslations("photos.lightbox");
  const context = useContext(Context);
  const position = context ? context.positionOf(photoId) : -1;
  if (!context || position < 0) return <>{children}</>;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={t.markup("open", { current: formatNumber(position + 1), total: formatNumber(context.total), bdi: plain })}
      onClick={(event) => context.open(photoId, event.currentTarget)}
      className="block w-full rounded-field focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
    >
      {children}
    </button>
  );
}
