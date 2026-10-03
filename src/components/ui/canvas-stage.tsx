"use client";

import { useEffect, useRef, useState } from "react";
import type { CanvasStageProps } from "@/components/ui";

// The stage around an editor's canvas — REQ-UIX-107, REQ-UIX-110, DEC-235 §4 (`DEC-NEXT-36`), DEC-237 §3. `designer`'s;
// the designer's `DesignerCanvas` and the email builder's `block-canvas` are its two children.
//
// ★ THE STAGE, NEVER A SECOND ENGINE. It is the neutral ground, the fit and the zoom, the rulers on demand, the grid and
// the toggles drawn on the canvas, and a positioned overlay for the floating toolbar. It draws NOTHING of a document:
// no layer, no handle, no snap guide, no safe area — those are the child's (the designer's live in `canvas.tsx`, over
// the one renderer's iframe, DEC-017). The fit moved here from `canvas.tsx` in wave 23 (`:216-230` there).
//
// ★ The rulers count from the CONTENT's start edge in the content's own direction (DEC-096): on an Arabic poster 0 is
// at the right, so the ruler reads like the inspector's X field. Their marks are positioned in PHYSICAL px — the
// overlay's exemption, for the same reason (an `inset-inline-start` would resolve against the console's direction).
//
// No motion (`REQ-UIX-053`): no transition on a zoom, a toggle or the grid.

/** Room around the content when it is fitted, px. */
const PAD = 32;

export function CanvasStage({
  label,
  contentWidth,
  contentHeight,
  zoom,
  onScaleChange,
  rulers = null,
  grid = null,
  toggles = [],
  overlay,
  children,
  className = "",
}: CanvasStageProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const scale = zoom === "fit" ? fit : zoom;

  // Fit to the viewport rather than to a breakpoint: the stage is whatever the rail and the panel leave over. Never
  // above 100 % — a fitted poster is never blown up past its own pixels.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth - PAD * 2;
      const h = el.clientHeight - PAD * 2;
      if (w <= 0) return;
      const byWidth = w / contentWidth;
      setFit(Math.min(1, contentHeight && h > 0 ? Math.min(byWidth, h / contentHeight) : byWidth));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [contentWidth, contentHeight]);

  useEffect(() => {
    onScaleChange?.(scale);
  }, [scale, onScaleChange]);

  const width = contentWidth * scale;
  const height = contentHeight === undefined ? undefined : contentHeight * scale;

  return (
    <section aria-label={label} data-slot="canvas-stage" className={`relative flex min-h-0 min-w-0 flex-col bg-canvas ${className}`}>
      <div ref={viewport} data-stage-viewport="" className="min-h-0 min-w-0 flex-1 overflow-auto">
        <div className="flex min-h-full min-w-full items-center justify-center" style={{ padding: PAD }}>
          <div className="relative shrink-0" style={{ width, height }}>
            {children(scale)}
            {grid ? (
              <span
                aria-hidden="true"
                data-stage-grid=""
                className="pointer-events-none absolute inset-0 text-edge"
                style={{
                  backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                  backgroundSize: `${grid.step * scale}px ${grid.step * scale}px`,
                }}
              />
            ) : null}
            {rulers ? <Rulers direction={rulers.direction} step={rulers.step} scale={scale} width={contentWidth} height={contentHeight} /> : null}
            {overlay}
          </div>
        </div>
      </div>

      {toggles.length ? (
        <div className="pointer-events-none absolute bottom-3 start-4 flex flex-wrap gap-1.5">
          {toggles.map((toggle) => (
            <button
              key={toggle.key}
              type="button"
              aria-pressed={toggle.pressed}
              onClick={() => toggle.onPressedChange(!toggle.pressed)}
              className={`pointer-events-auto inline-flex min-h-8 items-center rounded-pill border px-3 text-label ${
                toggle.pressed ? "border-transparent bg-fg-heading text-surface" : "border-edge bg-raised text-fg-heading hover:bg-hover"
              }`}
            >
              {toggle.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * The two rulers — marks every `step` content px, numbered from the content's START edge (DEC-096). `aria-hidden`:
 * the inspector's numeric fields carry the same numbers to a screen reader (DEC-093).
 */
function Rulers({ direction, step, scale, width, height }: { direction: "rtl" | "ltr"; step: number; scale: number; width: number; height?: number }) {
  const along = (length: number) => Array.from({ length: Math.floor(length / step) + 1 }, (_, i) => i * step);
  return (
    <span aria-hidden="true" data-stage-rulers="" className="pointer-events-none absolute inset-0 text-caption text-fg-muted">
      <span className="absolute inset-x-0 bottom-full h-5 border-b border-edge">
        {along(width).map((value) => (
          <span
            key={`x-${value}`}
            dir="ltr"
            className="absolute bottom-0 border-s border-edge ps-0.5"
            // PHYSICAL from the left (DEC-096's exemption): the value counts from the content's start edge.
            style={{ left: (direction === "rtl" ? width - value : value) * scale }}
          >
            {value}
          </span>
        ))}
      </span>
      {height !== undefined ? (
        <span className="absolute inset-y-0 end-full w-6 border-e border-edge">
          {along(height).map((value) => (
            <span key={`y-${value}`} dir="ltr" className="absolute inset-x-0 border-t border-edge" style={{ top: value * scale }}>
              {value}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}
