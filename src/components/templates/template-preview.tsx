"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderDocumentToHtml, type DesignDocument } from "@kareem/designer-runtime";

// A template drawn by THE renderer — SCR-055's card, and SCR-045's template control (wave 23, `REQ-UIX-108`).
//
// ★ THE RENDERER'S OWN OUTPUT, not a picture of one (DEC-017). A template has no artifact, so its latest version goes
// through `renderDocumentToHtml()` — the function the studio's canvas and the worker's Chromium call — with the faces
// by SHA-256 from `/api/fonts` (REQ-DSG-016, never a CDN) and the values the caller passes: the org's brand, and on the
// library every bound text field as `{label}`, so the card shows the template's fields as the boards draw them.
//
// Mounted only once near the viewport; inert (no pointer, no tab stop, hidden from assistive technology) because the
// card's heading names it. ★ CONTAINED, never covered: scaled to fit both sides of its box and centred. `data-rendered`
// turns true only after the frame's document has loaded AND its faces are ready, so a capture can tell a blank render
// from one that never mounted (DEC-149 §4) — the attribute names wave 8's specs read are kept.

export interface TemplatePreviewProps {
  document: DesignDocument;
  values: Record<string, string>;
  faces: Array<{ family: string; weight: number; style: string; sha256: string }>;
  origin: string;
  title: string;
}

export function TemplatePreview({ document: doc, values, faces, origin, title }: TemplatePreviewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [loadedHtml, setLoadedHtml] = useState<string | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const fit = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = box.width
    ? box.height
      ? Math.min(box.width / doc.master.width, box.height / doc.master.height)
      : box.width / doc.master.width
    : 0;
  const offsetInline = Math.max(0, (box.width - doc.master.width * scale) / 2);
  const offsetBlock = box.height ? Math.max(0, (box.height - doc.master.height * scale) / 2) : 0;

  const html = useMemo(
    () =>
      visible
        ? renderDocumentToHtml(doc, {
            fonts: faces.map((f) => ({ ...f, url: `${origin}/api/fonts/${f.sha256}` })),
            bindings: { values },
          })
        : "",
    [visible, doc, faces, origin, values],
  );

  return (
    // Laid out in the DOCUMENT's direction, so its inline start and the scaling origin are one corner (DEC-096).
    <div ref={host} dir={doc.direction} data-template-preview="" data-rendered={html !== "" && loadedHtml === html ? "true" : "false"} className="relative h-full w-full overflow-hidden">
      {visible && scale > 0 ? (
        <iframe
          title={title}
          srcDoc={html}
          width={doc.master.width}
          height={doc.master.height}
          sandbox="allow-same-origin"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute border-0"
          style={{
            top: offsetBlock,
            insetInlineStart: offsetInline,
            transform: `scale(${scale})`,
            transformOrigin: doc.direction === "rtl" ? "top right" : "top left",
          }}
          onLoad={(event) => {
            const loaded = html;
            const fonts = event.currentTarget.contentDocument?.fonts;
            if (fonts) void fonts.ready.then(() => setLoadedHtml(loaded));
            else setLoadedHtml(loaded);
          }}
        />
      ) : null}
    </div>
  );
}
