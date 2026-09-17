"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderDocumentToHtml, type DesignDocument } from "@kareem/designer-runtime";

// A template card's media — SCR-055/056, `16` §10.3.
//
// ★ THE RENDERER'S OWN OUTPUT, not a picture of one. A template has no
// artifact to show (nothing is exported from a template), so the card draws
// the latest version through `renderDocumentToHtml()` — the same function
// the studio canvas and the worker's Chromium use (DEC-017) — with this org's
// brand in the library's scheme, and the faces by SHA-256, never a CDN
// (REQ-DSG-016). Unbound data shows the template's own fallbacks, and what
// has none is a marked placeholder (REQ-DSG-006).
//
// Mounted only once the card is near the viewport: eleven full-size documents
// in eleven frames on a phone is a page that never settles. The frame is
// inert — no pointer, no tab stop, hidden from assistive technology — because
// the card's heading already names what it shows.
//
// ★ CONTAINED, NOT COVERED: the document is scaled to fit BOTH sides of its
// box and centred, so a box capped short on a phone shows the whole page
// rather than its top. And `data-rendered` turns true only once the frame's
// document has loaded and its faces are ready — a capture waits for it, so a
// blank render can be told from one that never mounted (DEC-149 §4).

export interface TemplatePreviewProps {
  document: DesignDocument;
  bindings: Record<string, string>;
  faces: Array<{ family: string; weight: number; style: string; sha256: string }>;
  origin: string;
  title: string;
}

export function TemplatePreview({ document: doc, bindings, faces, origin, title }: TemplatePreviewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [box, setBox] = useState({ width: 0, height: 0 });
  // The html the frame last finished loading: a new document (a scheme
  // switched) is not rendered until ITS load, so the marker is derived.
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

  // A box with no height yet (a parent sized by its content) fits the width.
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
            bindings: { values: bindings },
          })
        : "",
    [visible, doc, faces, origin, bindings],
  );

  return (
    // The frame is laid out in the DOCUMENT's direction, so its inline start
    // and its scaling origin are the same corner whatever the console's is.
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
            // Same-origin (the sandbox allows it), so the frame's own face set
            // is readable; ready after the load event is ready to be looked at.
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
