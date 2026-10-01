"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { PageViewerProps, PageViewerZoomProps } from "@/components/ui";
import { IconButton } from "@/components/ui/icon-button";
import { ChevronIcon, LineIcon, PlusIcon } from "@/components/ui/icons";

// content's file — SCR-013's page, previous and next, the scrubber, the rail, zoom and the keys (DEC-213 §4,
// REQ-UIX-064, REQ-UIX-065, REQ-MAT-003). The one thing called page-viewer in `src/`: it replaces
// `components/viewer/page-viewer.tsx`, deleted in wave 19.
//
// ★★ THE DIRECTION IS A MODEL, NOT A MIRRORED ICON (`09` SCR-013, `07` §5). The file this replaces gave its two
// buttons `rtl ? advance : retreat` — mirrored in behaviour and not in name — so in Arabic, on page 1, the button
// named «الصفحة التالية» was DISABLED (DEC-214 §1). Here no button knows the direction: «next» advances, always,
// and sits at the inline-end because it comes after «previous» in a row the document's direction lays out. `dir`
// reaches three things only, each physical by nature: the arrow keys, the swipe, and the zoom's origin.
//
// Reads no data, no session and no catalogue: every word arrives in `labels`, whose formatters are functions — so
// its parent is a client component (DEC-159, DEC-214 §3). No motion: a page changes by a cut (DEC-214 §3, N5).

/** The zoom's steps — 1, 1.5 and 2, as the viewer has always had (`DEC-213` §5.83: single-pointer controls). */
export const PAGE_VIEWER_ZOOM_STEPS = [1, 1.5, 2] as const;

export type PageViewerMove = "next" | "previous" | "first" | "last";

/**
 * The keyboard model, as one pure function. In RTL a deck reads right to left, so the LEFT arrow is «next» and the
 * RIGHT arrow «previous»; in LTR the reverse. Page Down/Up and Home/End do not depend on direction. A key pressed
 * with Alt, Ctrl or Meta is never the viewer's — Alt+← is the browser's Back (DEC-214 §1).
 */
export function pageViewerKey(key: string, dir: "rtl" | "ltr", modifiers: { altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {}): PageViewerMove | null {
  if (modifiers.altKey || modifiers.ctrlKey || modifiers.metaKey) return null;
  switch (key) {
    case "ArrowLeft":
      return dir === "rtl" ? "next" : "previous";
    case "ArrowRight":
      return dir === "rtl" ? "previous" : "next";
    case "PageDown":
      return "next";
    case "PageUp":
      return "previous";
    case "Home":
      return "first";
    case "End":
      return "last";
    default:
      return null;
  }
}

const SWIPE_MIN = 48; // px — below it a pointer that moved is neither a swipe nor a tap
const TAP_MAX = 10; // px

/** A field the member is typing in owns its keys. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && target.type !== "range";
}

/** The zoom controls, for a screen that draws them in its own chrome (the viewer's top bar). */
export function PageViewerZoom({ zoom, onZoomChange, labels, className = "" }: PageViewerZoomProps) {
  const last = PAGE_VIEWER_ZOOM_STEPS.length - 1;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <IconButton label={labels.zoomOut} variant="secondary" disabled={zoom <= 0} onClick={() => onZoomChange(Math.max(0, zoom - 1))}>
        <LineIcon />
      </IconButton>
      <IconButton label={labels.zoomIn} variant="secondary" disabled={zoom >= last} onClick={() => onZoomChange(Math.min(last, zoom + 1))}>
        <PlusIcon />
      </IconButton>
    </div>
  );
}

export function PageViewer({
  pages,
  dir,
  title,
  labels,
  page,
  defaultPage = 1,
  onPageChange,
  zoom,
  defaultZoom = 0,
  onZoomChange,
  showZoom = true,
  showRail = true,
  onStageTap,
  onKeyActivity,
  className = "",
}: PageViewerProps) {
  const total = pages.length;
  const clamp = useCallback((n: number) => Math.min(Math.max(Math.round(n), 1), Math.max(total, 1)), [total]);

  const [ownPage, setOwnPage] = useState(() => clamp(defaultPage));
  const position = clamp(page ?? ownPage);
  const goTo = useCallback(
    (n: number) => {
      const next = clamp(n);
      if (page === undefined) setOwnPage(next);
      onPageChange?.(next);
    },
    [clamp, page, onPageChange],
  );

  const [ownZoom, setOwnZoom] = useState(defaultZoom);
  const zoomStep = Math.min(Math.max(zoom ?? ownZoom, 0), PAGE_VIEWER_ZOOM_STEPS.length - 1);
  const setZoom = useCallback(
    (z: number) => {
      if (zoom === undefined) setOwnZoom(z);
      onZoomChange?.(z);
    },
    [zoom, onZoomChange],
  );

  const move = useCallback(
    (to: PageViewerMove) => {
      if (to === "next") goTo(position + 1);
      else if (to === "previous") goTo(position - 1);
      else if (to === "first") goTo(1);
      else goTo(total);
    },
    [goTo, position, total],
  );

  const stageRef = useRef<HTMLDivElement>(null);

  // The keys work without focusing anything — a window listener, as the viewer always had (`materials.spec.ts`
  // presses before any focus). While the zoomed stage has focus, its arrows pan it instead (SC 2.1.1).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      onKeyActivity?.();
      if (isTextEntry(e.target)) return;
      const to = pageViewerKey(e.key, dir, e);
      if (!to) return;
      const panning = zoomStep > 0 && e.key.startsWith("Arrow") && e.target instanceof Node && !!stageRef.current?.contains(e.target);
      if (panning) return;
      e.preventDefault();
      move(to);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dir, move, onKeyActivity, zoomStep]);

  // The scrubber owns its keys and applies the same model, so ← is «next» on it too in RTL — never the browser's
  // own reading of a range's arrows.
  function onScrubberKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    onKeyActivity?.();
    const to = pageViewerKey(e.key, dir, e);
    if (!to) return;
    e.preventDefault();
    e.stopPropagation();
    move(to);
  }

  // Swipe is an enhancement (DEC-093): previous and next are always-visible tap targets. In Arabic the next page
  // comes from the left, so a finger dragging the page RIGHTWARD advances; in LTR a leftward drag does. A pointer
  // that barely moved is a tap — the screen's chrome toggle (DEC-213 §5.87). No swipe while zoomed: the drag pans.
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const start = pointer.current;
    pointer.current = null;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) <= TAP_MAX && Math.abs(dy) <= TAP_MAX) {
      onStageTap?.();
      return;
    }
    if (zoomStep > 0 || Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy)) return;
    const rightward = dx > 0;
    move(rightward === (dir === "rtl") ? "next" : "previous");
  }

  // ±2 pages prefetched (`07` §5, REQ-NFR-008): page 1 eager, the neighbours warmed, the rest on demand.
  const prefetch = useMemo(() => pages.slice(Math.max(0, position - 3), Math.min(total, position + 2)).map((p) => p.imageUrl), [pages, position, total]);

  // The rail keeps the current page in view (`ViewerDesktop.dc.html`: pages 5 – 10 around 7).
  const currentThumb = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = currentThumb.current;
    if (el && typeof el.scrollIntoView === "function" && el.offsetParent !== null) el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [position]);

  if (total === 0) {
    return (
      <div data-page-viewer="" className={`flex h-full items-center justify-center p-6 ${className}`}>
        <p className="text-body text-fg-muted">{labels.noPages}</p>
      </div>
    );
  }

  const current = pages[position - 1]!;
  const scale = PAGE_VIEWER_ZOOM_STEPS[zoomStep];
  const zoomed = zoomStep > 0;

  return (
    <div data-page-viewer="" dir={dir} className={`flex h-full min-h-0 ${className}`}>
      {/* One live region: the page change is announced without moving focus (REQ-NFR-007). */}
      <div role="status" aria-live="polite" className="sr-only">
        {labels.pageOf(position, total)}
      </div>
      {prefetch.map((url) => (
        <link key={url} rel="prefetch" href={url} as="image" />
      ))}

      {showRail ? (
        // The rail, at the inline-start, from `lg` only (DEC-213 §5.84): on the phone the scrubber is the overview.
        <div data-page-viewer-rail="" className="hidden w-[168px] shrink-0 overflow-y-auto border-e border-edge bg-chrome px-3 py-3.5 lg:block">
          <ul aria-label={labels.rail} className="flex flex-col gap-2.5">
            {pages.map((p, i) => {
              const isCurrent = i + 1 === position;
              return (
                <li key={p.pageNumber}>
                  <button
                    type="button"
                    ref={isCurrent ? currentThumb : undefined}
                    onClick={() => goTo(i + 1)}
                    aria-current={isCurrent}
                    aria-label={labels.thumbnail(p.pageNumber)}
                    className={`flex w-full flex-col items-center gap-1 rounded-field p-0.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${isCurrent ? "font-bold text-accent" : "text-fg-muted"}`}
                  >
                    <Image
                      src={p.thumbnailUrl}
                      alt=""
                      width={p.width}
                      height={p.height}
                      unoptimized
                      loading="lazy"
                      style={{ aspectRatio: `${p.width} / ${Math.max(p.height, 1)}` }}
                      className={`block h-auto w-full rounded-field bg-surface ${isCurrent ? "outline-3 outline-offset-2 outline-accent" : "opacity-80"}`}
                    />
                    <span aria-hidden="true" className="text-caption">
                      {String(p.pageNumber)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* One set of controls, placed by a grid: the phone's stage over «previous · scrubber · next»; from `lg`
          «previous · stage · next» and no scrubber. Duplicated buttons hidden by a breakpoint would give a screen
          reader and a test two «الصفحة التالية». Column 1 is the inline-start in either direction. */}
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[minmax(0,1fr)_auto] lg:grid-rows-[minmax(0,1fr)] lg:gap-6 lg:p-6">
        <div
          data-page-viewer-controls=""
          className="col-start-1 row-start-2 flex items-center bg-chrome ps-3 pb-2 pt-2.5 lg:row-start-1 lg:self-center lg:bg-transparent lg:p-0"
        >
          <IconButton label={labels.previous} variant="secondary" className="lg:size-12" disabled={position <= 1} onClick={() => goTo(position - 1)}>
            <ChevronIcon direction="back" />
          </IconButton>
        </div>

        <div
          ref={stageRef}
          role={zoomed ? "region" : undefined}
          aria-label={zoomed ? labels.stage : undefined}
          tabIndex={zoomed ? 0 : undefined}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (pointer.current = null)}
          className={`relative col-span-3 row-start-1 flex min-h-0 overflow-auto px-2 [container-type:size] lg:col-span-1 lg:col-start-2 lg:px-0 ${
            zoomed ? "items-start justify-start touch-pan-x touch-pan-y touch-pinch-zoom" : "items-center justify-center touch-pan-y touch-pinch-zoom"
          }`}
        >
          <Image
            key={current.pageNumber}
            src={current.imageUrl}
            alt={`${title} — ${labels.pageOfText(position, total)}`}
            width={current.width}
            height={current.height}
            unoptimized
            preload={position === 1}
            draggable={false}
            // The page WHOLE: as wide as the stage allows and no taller than it — up or down, whatever the page's own
            // size — from the stage's container units and the page's ratio (`material_pages.width`/`height`).
            style={{
              width: `min(100cqw, calc(100cqh * ${current.width / Math.max(current.height, 1)}))`,
              height: "auto",
              // The page's own ratio holds the box before the image paints and after (REQ-NFR-008): an image whose
              // pixels disagree with `material_pages` never reshapes the page.
              aspectRatio: `${current.width} / ${Math.max(current.height, 1)}`,
              ...(zoomed ? { transform: `scale(${scale})`, transformOrigin: dir === "rtl" ? "top right" : "top left" } : null),
            }}
            className="block shrink-0 select-none rounded-field bg-surface"
          />
          {showZoom ? <PageViewerZoom zoom={zoomStep} onZoomChange={setZoom} labels={labels} className="absolute end-2 top-2" /> : null}
        </div>

        <div data-page-viewer-controls="" className="col-start-2 row-start-2 flex flex-col gap-1.5 bg-chrome px-3 pb-2 pt-2.5 lg:hidden">
          <input
            type="range"
            min={1}
            max={total}
            step={1}
            value={position}
            disabled={total < 2}
            aria-label={labels.scrubber}
            aria-valuetext={labels.pageOfText(position, total)}
            onChange={(e) => goTo(Number(e.target.value))}
            onKeyDown={onScrubberKeyDown}
            className="m-0 w-full accent-accent disabled:opacity-45"
          />
          <div aria-hidden="true" className="flex justify-between text-caption text-fg-muted">
            <span>1</span>
            <span>{labels.position(position, total)}</span>
            <span>{String(total)}</span>
          </div>
        </div>

        <div
          data-page-viewer-controls=""
          className="col-start-3 row-start-2 flex items-center bg-chrome pe-3 pb-2 pt-2.5 lg:row-start-1 lg:self-center lg:bg-transparent lg:p-0"
        >
          <IconButton label={labels.next} variant="primary" className="lg:size-12" disabled={position >= total} onClick={() => goTo(position + 1)}>
            <ChevronIcon direction="forward" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
