"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { formatNumber } from "@/components/sessions/numerals";

export interface ViewerPageDTO {
  pageNumber: number;
  imageUrl: string;
  thumbnailUrl: string;
}

interface PageViewerProps {
  pages: ViewerPageDTO[];
  /** `true` for an RTL reading direction (07 §5, SCR-013's ★ requirement). */
  rtl: boolean;
  title: string;
}

const ZOOM_STEPS = [1, 1.5, 2] as const;

/**
 * SCR-013 — the page-by-page viewer. ★ The arrow keys follow the READING
 * DIRECTION, not the physical key: in an RTL deck, the LEFT arrow advances
 * (the reader's "next" moves them further into a right-to-left document,
 * which is visually leftward — the same reason a physical Arabic book is
 * turned leaftward), and the RIGHT arrow goes back. This is a navigation
 * MODEL, not a mirrored icon (07 §5's own warning) — a viewer built LTR-first
 * and then RTL-mirrored only in its icons still advances on the wrong key.
 * Home/End and Page Up/Down are direction-independent, matching SCR-013.
 */
export function PageViewer({ pages, rtl, title }: PageViewerProps) {
  const t = useTranslations("materials.viewer");
  const [index, setIndex] = useState(0); // 0-based into `pages`
  const [zoomStep, setZoomStep] = useState(0);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  const total = pages.length;
  const current = pages[index];

  const goTo = useCallback(
    (next: number) => {
      setIndex(Math.min(Math.max(next, 0), total - 1));
    },
    [total],
  );

  const advance = useCallback(() => goTo(index + 1), [goTo, index]);
  const retreat = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          (rtl ? advance : retreat)();
          break;
        case "ArrowRight":
          e.preventDefault();
          (rtl ? retreat : advance)();
          break;
        case "PageDown":
          e.preventDefault();
          advance();
          break;
        case "PageUp":
          e.preventDefault();
          retreat();
          break;
        case "Home":
          e.preventDefault();
          goTo(0);
          break;
        case "End":
          e.preventDefault();
          goTo(total - 1);
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [advance, retreat, goTo, rtl, total]);

  // Announce the page change to assistive tech (REQ-NFR-007) without
  // stealing focus from the viewer itself.
  useEffect(() => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = t.markup("pageOf", { current: formatNumber(index + 1), total: formatNumber(total), bdi: (chunks) => chunks });
    }
  }, [index, total, t]);

  // ±2 pages prefetched (07 §5) — the browser has already fetched the
  // signed URL's image the moment it appears in this list.
  const prefetchWindow = useMemo(() => {
    const start = Math.max(0, index - 2);
    const end = Math.min(total, index + 3);
    return pages.slice(start, end).map((p) => p.imageUrl);
  }, [pages, index, total]);

  const zoom = ZOOM_STEPS[zoomStep];

  if (total === 0 || !current) {
    return <p className="text-body-sm text-fg-muted">{t("states.noPages")}</p>;
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row-reverse md:items-start" dir={rtl ? "rtl" : "ltr"}>
      <div ref={liveRegionRef} role="status" aria-live="polite" className="sr-only" />
      {/* Prefetch hints — invisible, not part of the visible DOM tree the reader interacts with. */}
      {prefetchWindow.map((url) => (
        <link key={url} rel="prefetch" href={url} as="image" />
      ))}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p data-testid="page-indicator" className="text-body-sm text-fg-muted">
            {t.rich("pageOf", { current: formatNumber(index + 1), total: formatNumber(total), bdi: (chunks) => <bdi>{chunks}</bdi> })}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setZoomStep((z) => Math.max(0, z - 1))} disabled={zoomStep === 0} className="rounded-field border border-edge px-3 py-1 text-label text-fg-body disabled:opacity-40">
              {t("zoomOut")}
            </button>
            <button
              type="button"
              onClick={() => setZoomStep((z) => Math.min(ZOOM_STEPS.length - 1, z + 1))}
              disabled={zoomStep === ZOOM_STEPS.length - 1}
              className="rounded-field border border-edge px-3 py-1 text-label text-fg-body disabled:opacity-40"
            >
              {t("zoomIn")}
            </button>
          </div>
        </div>

        <div className="relative mt-3 overflow-auto rounded-field border border-edge">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: rtl ? "top right" : "top left" }}>
            <Image
              src={current.imageUrl}
              alt={`${title} — ${t.markup("pageOf", { current: index + 1, total, bdi: (chunks) => chunks })}`}
              width={1600}
              height={900}
              className="h-auto w-full"
              unoptimized
              priority={index === 0}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <button type="button" onClick={rtl ? advance : retreat} disabled={rtl ? index === total - 1 : index === 0} className="rounded-field border border-edge px-4 py-2 text-label text-fg-body disabled:opacity-40">
            {t("previous")}
          </button>
          <button type="button" onClick={() => setShowThumbnails((s) => !s)} className="text-label text-fg-body md:hidden">
            {t("thumbnailsLabel")}
          </button>
          <button type="button" onClick={rtl ? retreat : advance} disabled={rtl ? index === 0 : index === total - 1} className="rounded-field border border-edge px-4 py-2 text-label text-fg-body disabled:opacity-40">
            {t("next")}
          </button>
        </div>
      </div>

      {showThumbnails ? (
        <ul aria-label={t("thumbnailsLabel")} className="flex shrink-0 flex-row gap-2 overflow-x-auto md:w-32 md:flex-col md:overflow-y-auto">
          {pages.map((p, i) => (
            <li key={p.pageNumber}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === index}
                aria-label={t.markup("thumbnailLabel", { number: formatNumber(p.pageNumber), bdi: (chunks) => chunks })}
                className={`block overflow-hidden rounded-field border ${i === index ? "border-edge-strong" : "border-edge"}`}
              >
                <Image src={p.thumbnailUrl} alt="" width={320} height={180} className="h-auto w-20 md:w-full" unoptimized />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
