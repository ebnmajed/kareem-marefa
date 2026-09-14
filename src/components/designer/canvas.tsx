"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { type DesignDocument, PRESETS, type PresetName, renderDocumentToHtml, safeBox } from "@kareem/designer-runtime";
import { formatNumber, type NumeralSystem } from "@/components/sessions/numerals";

// SCR-057's canvas — RTL-first (06 §10), and rendered by THE renderer.
//
// The canvas is an iframe carrying `renderDocumentToHtml()`'s output: not a
// React re-implementation of the layer model that happens to look the same,
// but the very document the worker's Chromium will open. DEC-017 buys code
// identity with one shared package; this spends it. A second drawing path in
// the editor would be a second place for Arabic to go wrong, and the one that
// an admin approves is the one that would be wrong.
//
// It is an iframe and not a mounted fragment for one concrete reason: the
// renderer's base CSS opens with `*{margin:0;padding:0;box-sizing:border-box}`,
// which is correct inside a 1080×1350 document and would flatten the admin
// console around it. Scoping that reset would mean forking the CSS, which is
// forking the renderer.
//
// Interaction lives in the OVERLAY above it, in document coordinates scaled to
// fit. The iframe takes no pointer events at all, so there is no second event
// model to keep in step.

export interface DesignerCanvasProps {
  document: DesignDocument;
  /** Resolved binding values — real data (REQ-DSG-006). */
  bindings: Record<string, string>;
  /** The face set, by SHA-256. Never a CDN (REQ-DSG-016, A39). */
  faces: Array<{ family: string; weight: number; style: string; sha256: string; unicodeRange?: string }>;
  /** Absolute, so a `srcdoc` document resolves the font URLs the same way in
   *  every browser rather than depending on how it inherits a base URL. */
  origin: string;
  selectedLayerId: string | null;
  onSelect: (layerId: string | null) => void;
  lockedLayerIds: string[];
  numerals: NumeralSystem;
  /** The placeholder label an unbound field draws, translated. */
  placeholderLabel: (binding: string) => string;
  /** The preset the canvas is showing. The document handed in is already
   *  derived for it; this names it so the overlays can be drawn. */
  preset: PresetName;
  /** Safe-area and bleed overlays — on by default for print presets
   *  (06 §10), because a print preset is where crossing one is expensive. */
  showOverlays: boolean;
}

export function DesignerCanvas({
  document: doc,
  bindings,
  faces,
  origin,
  selectedLayerId,
  onSelect,
  lockedLayerIds,
  numerals,
  placeholderLabel,
  preset,
  showOverlays,
}: DesignerCanvasProps) {
  const t = useTranslations("designer.canvas");
  const tl = useTranslations("designer.layers");
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  const html = useMemo(
    () =>
      renderDocumentToHtml(doc, {
        fonts: faces.map((f) => ({ ...f, url: `${origin}/api/fonts/${f.sha256}` })),
        bindings: { values: bindings, placeholderLabel },
      }),
    [doc, faces, origin, bindings, placeholderLabel],
  );

  // Fit to the container rather than to a breakpoint: the editor is a
  // three-column layout whose middle column is whatever is left over.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const fit = () => {
      const available = host.clientWidth;
      if (!available) return;
      setScale(Math.min(1, available / doc.master.width));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    return () => observer.disconnect();
  }, [doc.master.width]);

  const { width, height } = doc.master;
  const presetSpec = PRESETS[preset];
  const safe = safeBox(presetSpec);
  // `transform-origin` is physical, so it is chosen from the DOCUMENT's own
  // direction: an RTL canvas grows from its start edge, which is the right.
  const originSide = doc.direction === "rtl" ? "top right" : "top left";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-body-sm text-fg-muted">
        {t.rich("size", { width: formatNumber(width, numerals), height: formatNumber(height, numerals), bdi: (c) => <bdi>{c}</bdi> })}
        {" · "}
        {t.rich("zoom", { value: formatNumber(Math.round(scale * 100), numerals), bdi: (c) => <bdi>{c}</bdi> })}
      </p>

      <div ref={hostRef} className="min-w-0 overflow-x-auto">
        <div className="relative" style={{ width: width * scale, height: height * scale }}>
          <iframe
            title={t("label")}
            srcDoc={html}
            width={width}
            height={height}
            // No scripts are emitted by the renderer and none are permitted
            // here. `allow-same-origin` is present so the font subresource
            // requests carry the session cookie `fonts_storage_read` needs.
            sandbox="allow-same-origin"
            className="pointer-events-none absolute top-0 border-0"
            style={{ insetInlineStart: 0, transform: `scale(${scale})`, transformOrigin: originSide }}
          />

          {/* Safe-area and bleed guides. Drawn by the EDITOR and never by the
              renderer: a guide that could reach an export is a guide that
              will, on the one poster nobody re-checked. Logical insets, so
              they mirror with the canvas. */}
          {showOverlays ? (
            <div className="pointer-events-none absolute inset-0" aria-hidden="true" dir={doc.direction}>
              <div
                className="absolute border border-dashed border-fg-muted/70"
                style={{
                  insetInlineStart: safe.x * scale,
                  top: safe.y * scale,
                  width: safe.w * scale,
                  height: safe.h * scale,
                }}
              />
              {presetSpec.bleed > 0 ? (
                <div
                  className="absolute border border-dotted border-fg-heading/50"
                  style={{
                    insetInlineStart: presetSpec.bleed * scale,
                    top: presetSpec.bleed * scale,
                    width: (width - presetSpec.bleed * 2) * scale,
                    height: (height - presetSpec.bleed * 2) * scale,
                  }}
                />
              ) : null}
            </div>
          ) : null}

          {/* The selection overlay, in document coordinates × scale. Logical
              positioning, so it mirrors with the canvas instead of drifting
              off the far edge in the other direction. */}
          <div className="absolute inset-0" dir={doc.direction}>
            {doc.layers
              .filter((l) => !l.hidden)
              .map((layer) => {
                const locked = lockedLayerIds.includes(layer.id);
                const selected = layer.id === selectedLayerId;
                const label = layer.name ?? `${tl(`kind.${layer.kind}`)} · ${layer.id}`;
                return (
                  <button
                    key={layer.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(selected ? null : layer.id)}
                    className={`absolute cursor-pointer bg-transparent ${
                      selected ? "outline-2 outline-offset-2 outline-fg-heading" : "outline-1 outline-transparent hover:outline-edge-strong"
                    }`}
                    style={{
                      insetInlineStart: layer.frame.x * scale,
                      top: layer.frame.y * scale,
                      width: layer.frame.w * scale,
                      height: layer.frame.h * scale,
                    }}
                  >
                    <span className="sr-only">
                      {tl.rich("select", { name: label, bdi: (c) => <bdi>{c}</bdi> })}
                      {locked ? ` — ${tl("locked")}` : ""}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
