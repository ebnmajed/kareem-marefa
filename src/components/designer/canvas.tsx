"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import {
  boundsOf,
  type DesignDocument,
  type FocalPoint,
  focalOf,
  type Frame,
  intersects,
  moveFrame,
  PRESETS,
  type PresetName,
  renderDocumentToHtml,
  RESIZE_HANDLES,
  type ResizeHandle,
  resizeFrame,
  rotateFromPointer,
  safeBox,
  snapFrame,
  snapTolerance,
  toPhysical,
} from "@kareem/designer-runtime";
import { formatNumber } from "@/components/sessions/numerals";

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
//
// ★ DIRECT MANIPULATION (wave 13, REQ-DSG-028, DEC-077, DEC-178): drag, eight
// handles, a rotation knob, snapping with guides, arrow-key nudge and the
// marquee — ALL in this overlay, with Pointer Events and pointer capture, no
// library (W13.1). Every one of them has a TAP path in the inspector and the
// layer list (DEC-093), which is what `wave13-designer-studio-taps.spec.ts`
// proves with `click()` alone. A gesture is ONE undo entry: nothing is written
// while the pointer moves; the frames are handed to the editor once, on
// release (R5). A press that moves less than three screen pixels is a tap.
//
// ★★ THE OVERLAY IS POSITIONED IN PHYSICAL `left`/`top`, AND THAT IS A
// DOCUMENTED EXEMPTION FROM THE LOGICAL-PROPERTIES RULE (DEC-096, `10`). The
// boxes stand for the DOCUMENT's geometry inside the CONSOLE's DOM: an
// `inset-inline-start` here resolves against the console's direction and lands
// on the wrong side whenever the two differ (an Arabic poster in an English
// console). `toPhysical()` computes `left` from the document's own direction —
// the only place that knows `W − x − w`. Do not tidy these to logical
// properties: it silently mirrors the wrong axis.

export interface DesignerCanvasProps {
  document: DesignDocument;
  /** Resolved binding values — real data (REQ-DSG-006). */
  bindings: Record<string, string>;
  /** Design asset id → a URL the browser can load (DEC-179). */
  assets?: Record<string, string>;
  /** The face set, by SHA-256. Never a CDN (REQ-DSG-016, A39). */
  faces: Array<{ family: string; weight: number; style: string; sha256: string; unicodeRange?: string }>;
  /** Absolute, so a `srcdoc` document resolves the font URLs the same way in
   *  every browser rather than depending on how it inherits a base URL. */
  origin: string;
  /** The selection. One id is one layer; several are a group. */
  selectedLayerIds: string[];
  /** A tap on a layer: `additive` when shift is held or «تحديد متعدّد» is on. */
  onSelect: (layerId: string | null, options?: { additive?: boolean }) => void;
  /**
   * False where nothing can be edited — the phone's view-and-approve layout. The per-layer selection
   * buttons are then not rendered at all: sized to their layers, small ones fall under SC 2.5.8's
   * 24 px at phone scale, and a control with nothing to do is noise to a screen reader (wave 11 sweep).
   */
  selectable?: boolean;
  lockedLayerIds: string[];
  /** The placeholder label an unbound field draws, translated. */
  placeholderLabel: (binding: string) => string;
  /** The preset the canvas is showing. The document handed in is already
   *  derived for it; this names it so the overlays can be drawn. */
  preset: PresetName;
  /** Safe-area and bleed overlays — on by default for print presets
   *  (06 §10), because a print preset is where crossing one is expensive. */
  showOverlays: boolean;
  /**
   * The SOURCE document, when this canvas may be manipulated: only on the
   * preset the document is authored at. A derived preset's frames are
   * computed by `derive()`, and writing one back would be a guess. Gestures
   * move the source frames; the canvas shows their derivation.
   */
  source?: DesignDocument;
  /** «تحديد متعدّد» — every tap adds to or removes from the selection. */
  multi?: boolean;
  /** Tap-to-place is armed: the next tap on the canvas is a point, not a selection. */
  placing?: boolean;
  /** A gesture's result, once, on release: the new SOURCE frames by layer id. */
  onFrames?: (frames: Record<string, Frame>) => void;
  /** The marquee's result. */
  onMarquee?: (layerIds: string[], additive: boolean) => void;
  /** Tap-to-place: the point tapped, in LOGICAL document coordinates. */
  onPlace?: (point: { x: number; y: number }) => void;
  /** An arrow key on a selected layer, on the VISUAL axis (DEC-096). */
  onNudge?: (dx: number, dy: number) => void;
  /** The arrow key was released — the nudge burst is one undo entry. */
  onNudgeEnd?: () => void;
  /** `⌘/Ctrl + ↑↓` on a selected layer. */
  onReorderKey?: (layerId: string, move: "forward" | "backward") => void;
  /** `Delete` on a selected layer. */
  onDeleteKey?: (layerId: string) => void;
  /**
   * The focal point's draggable dot (REQ-DSG-030) — on any preset, because a
   * derived preset's crop is exactly what A32's override is for. The editor
   * decides where the point is written; the nine-point grid in the inspector is
   * the path, this dot the refinement (DEC-093 path 3).
   */
  onFocal?: (layerId: string, point: FocalPoint) => void;
}

/** A press that moves less than this, in screen pixels, is a tap. */
const TAP_SLOP = 3;
/** Below this on-screen size the four edge handles give way to the corners. */
const EDGE_HANDLES_MIN = 48;
/** Below this, no handles at all: the fields and the align buttons are the way (DEC-093). */
const HANDLES_MIN = 24;

type Gesture =
  | { kind: "move"; pointerId: number; x0: number; y0: number; layerId: string; ids: string[]; moved: boolean }
  | { kind: "resize"; pointerId: number; x0: number; y0: number; layerId: string; handle: ResizeHandle }
  | { kind: "rotate"; pointerId: number; x0: number; y0: number; layerId: string; centre: { x: number; y: number } }
  | { kind: "marquee"; pointerId: number; x0: number; y0: number; additive: boolean; moved: boolean }
  | { kind: "focal"; pointerId: number; x0: number; y0: number; layerId: string };

type Preview =
  | { kind: "frames"; frames: Record<string, Frame>; guides: { inline: number[]; block: number[] } }
  | { kind: "marquee"; left: number; top: number; right: number; bottom: number }
  | { kind: "focal"; layerId: string; point: FocalPoint }
  | null;

const HANDLE_POSITION: Record<ResizeHandle, { left: string; top: string; cursor: string }> = {
  nw: { left: "0%", top: "0%", cursor: "nwse-resize" },
  n: { left: "50%", top: "0%", cursor: "ns-resize" },
  ne: { left: "100%", top: "0%", cursor: "nesw-resize" },
  e: { left: "100%", top: "50%", cursor: "ew-resize" },
  se: { left: "100%", top: "100%", cursor: "nwse-resize" },
  s: { left: "50%", top: "100%", cursor: "ns-resize" },
  sw: { left: "0%", top: "100%", cursor: "nesw-resize" },
  w: { left: "0%", top: "50%", cursor: "ew-resize" },
};

export function DesignerCanvas({
  document: doc,
  bindings,
  assets,
  faces,
  origin,
  selectedLayerIds,
  onSelect,
  selectable = true,
  lockedLayerIds,
  placeholderLabel,
  preset,
  showOverlays,
  source,
  multi = false,
  placing = false,
  onFrames,
  onMarquee,
  onPlace,
  onNudge,
  onNudgeEnd,
  onReorderKey,
  onDeleteKey,
  onFocal,
}: DesignerCanvasProps) {
  const t = useTranslations("designer.canvas");
  const tl = useTranslations("designer.layers");
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const gesture = useRef<Gesture | null>(null);
  /** Set when a press became a drag, so the click that follows it is not also a selection. */
  const swallowClick = useRef(false);
  const [scale, setScale] = useState(0.4);
  const [preview, setPreviewState] = useState<Preview>(null);
  /**
   * ★ The gesture's result is read from THIS, never from the state. A fast hand
   * — or Playwright's mouse — delivers the last pointermove and the pointerup
   * inside one frame, before React commits the move; the release handler bound
   * in the previous render then saw no preview and saved nothing (the lead's
   * run on dfafeab: «no PUT in 90 s»). The state draws; the ref decides.
   */
  const previewRef = useRef<Preview>(null);
  const setPreview = useCallback((next: Preview) => {
    previewRef.current = next;
    setPreviewState(next);
  }, []);

  const html = useMemo(
    () =>
      renderDocumentToHtml(doc, {
        fonts: faces.map((f) => ({ ...f, url: `${origin}/api/fonts/${f.sha256}` })),
        bindings: { values: bindings, placeholderLabel, ...(assets ? { assets } : {}) },
      }),
    [doc, faces, origin, bindings, placeholderLabel, assets],
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
  const editable = Boolean(source && onFrames);
  const sourceOf = useCallback((id: string) => source?.layers.find((l) => l.id === id) ?? null, [source]);
  const isLocked = useCallback((id: string) => lockedLayerIds.includes(id), [lockedLayerIds]);

  /** A pointer's position in PHYSICAL document pixels. */
  const docPoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
    },
    [scale],
  );

  /**
   * The rendered element's own transient offset while a MOVE or a ROTATION
   * runs — the frame is `allow-same-origin` with no scripts, so its DOM is
   * reachable. Only the individual `translate` and `rotate` properties are
   * touched: the renderer never sets them (it writes `transform`), so clearing
   * them restores exactly what it drew, and the committed `srcDoc` replaces the
   * element on release anyway. A RESIZE is shown by the overlay's box alone:
   * resizing the real element would show text at a fit auto-fit has not run
   * for, which is a lie about the export (autofit runs at render).
   */
  const paintTransient = useCallback(
    (frames: Record<string, Frame> | null) => {
      const inner = frameRef.current?.contentDocument;
      if (!inner) return;
      for (const el of inner.querySelectorAll<HTMLElement>("[data-layer]")) {
        const id = el.dataset.layer ?? "";
        const next = frames?.[id];
        const src = sourceOf(id)?.frame;
        if (!next || !src || next.w !== src.w || next.h !== src.h) {
          el.style.translate = "";
          el.style.rotate = "";
          continue;
        }
        const a = toPhysical(src, doc);
        const b = toPhysical(next, doc);
        el.style.translate = `${b.left - a.left}px ${b.top - a.top}px`;
        el.style.rotate = b.rotation !== a.rotation ? `${b.rotation - a.rotation}deg` : "";
      }
    },
    [doc, sourceOf],
  );

  const finish = useCallback(() => {
    gesture.current = null;
    setPreview(null);
    paintTransient(null);
  }, [paintTransient, setPreview]);

  // A gesture never outlives the document it started on.
  useEffect(() => finish, [finish]);

  const onLayerPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, layerId: string) => {
    swallowClick.current = false;
    if (!editable || placing || event.button !== 0) return;
    if (isLocked(layerId)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const ids = selectedLayerIds.includes(layerId) ? selectedLayerIds.filter((id) => !isLocked(id)) : [layerId];
    gesture.current = { kind: "move", pointerId: event.pointerId, x0: event.clientX, y0: event.clientY, layerId, ids, moved: false };
  };

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLSpanElement>, layerId: string, handle: ResizeHandle | "rotate") => {
    if (!editable || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const frame = sourceOf(layerId)?.frame;
    if (!frame || !source) return;
    if (handle === "rotate") {
      const b = toPhysical(frame, source);
      gesture.current = { kind: "rotate", pointerId: event.pointerId, x0: event.clientX, y0: event.clientY, layerId, centre: { x: b.left + b.width / 2, y: b.top + b.height / 2 } };
    } else {
      gesture.current = { kind: "resize", pointerId: event.pointerId, x0: event.clientX, y0: event.clientY, layerId, handle };
    }
  };

  const onStagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Only on empty canvas, with a mouse or a pen: on touch, empty canvas keeps
    // the page's scroll, and «تحديد متعدّد» is the taught way (DEC-178).
    swallowClick.current = false;
    if (event.target !== event.currentTarget || placing || !editable || event.pointerType === "touch" || event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = { kind: "marquee", pointerId: event.pointerId, x0: event.clientX, y0: event.clientY, additive: event.shiftKey || multi, moved: false };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId || (!source && g.kind !== "focal")) return;
    const dxScreen = event.clientX - g.x0;
    const dyScreen = event.clientY - g.y0;
    if ((g.kind === "move" || g.kind === "marquee") && !g.moved) {
      if (Math.hypot(dxScreen, dyScreen) < TAP_SLOP) return;
      g.moved = true;
      if (g.kind === "move" && !selectedLayerIds.includes(g.layerId)) onSelect(g.layerId);
    }
    const dx = dxScreen / scale;
    const dy = dyScreen / scale;

    if (g.kind === "focal") {
      const layer = doc.layers.find((l) => l.id === g.layerId);
      if (!layer) return;
      const b = toPhysical(layer.frame, doc);
      const p = docPoint(event.clientX, event.clientY);
      const clamp = (n: number) => Math.min(1, Math.max(0, n));
      setPreview({ kind: "focal", layerId: g.layerId, point: { x: clamp((p.x - b.left) / b.width), y: clamp((p.y - b.top) / b.height) } });
      return;
    }
    if (!source) return;

    if (g.kind === "move") {
      const frames: Record<string, Frame> = {};
      let guides = { inline: [] as number[], block: [] as number[] };
      for (const id of g.ids) {
        const f = sourceOf(id)?.frame;
        if (f) frames[id] = moveFrame(f, dx, dy, source);
      }
      // One layer snaps; a group moves as it is — its own members would be its targets.
      const only = g.ids.length === 1 ? g.ids[0] : undefined;
      if (only && frames[only] && !event.altKey) {
        const snapped = snapFrame(source, only, frames[only], snapTolerance(scale));
        frames[only] = snapped.frame;
        guides = snapped.guides;
      }
      setPreview({ kind: "frames", frames, guides });
      paintTransient(frames);
    } else if (g.kind === "resize") {
      const f = sourceOf(g.layerId)?.frame;
      if (!f) return;
      const keepRatio = event.shiftKey || sourceOf(g.layerId)?.kind === "image";
      const frames = { [g.layerId]: resizeFrame(f, g.handle, dx, dy, source, { keepRatio }) };
      setPreview({ kind: "frames", frames, guides: { inline: [], block: [] } });
      paintTransient(frames);
    } else if (g.kind === "rotate") {
      const f = sourceOf(g.layerId)?.frame;
      if (!f) return;
      const start = docPoint(g.x0, g.y0);
      const now = docPoint(event.clientX, event.clientY);
      const rotation = rotateFromPointer(g.centre, start, now, f.rotation ?? 0, event.shiftKey ? 15 : undefined);
      const frames = { [g.layerId]: { ...f, rotation } };
      setPreview({ kind: "frames", frames, guides: { inline: [], block: [] } });
      paintTransient(frames);
    } else {
      const a = docPoint(g.x0, g.y0);
      const b = docPoint(event.clientX, event.clientY);
      setPreview({ kind: "marquee", left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== event.pointerId) return;
    const current = previewRef.current;
    if (g.kind === "focal") {
      if (current?.kind === "focal") onFocal?.(g.layerId, current.point);
      finish();
      return;
    }
    if (g.kind === "marquee") {
      if (g.moved && current?.kind === "marquee") {
        const hit = doc.layers.filter((l) => !l.hidden && intersects(current, boundsOf(l.frame, doc))).map((l) => l.id);
        onMarquee?.(hit, g.additive);
      } else if (!g.additive) {
        onSelect(null);
      }
    } else if (current?.kind === "frames" && (g.kind !== "move" || g.moved)) {
      swallowClick.current = true;
      // ★ ONE undo entry for the whole gesture (R5): handed over once, here.
      onFrames?.(current.frames);
    }
    finish();
  };

  const onPointerCancel = () => finish();

  const onLayerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, layerId: string) => {
    swallowClick.current = false;
    if (!editable) return;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if ((event.metaKey || event.ctrlKey) && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      onReorderKey?.(layerId, event.key === "ArrowUp" ? "forward" : "backward");
      return;
    }
    const arrow = arrows[event.key];
    if (arrow && selectedLayerIds.includes(layerId)) {
      // ★ The VISUAL axis (DEC-096): → moves right on the screen. The runtime
      // turns it into the logical `x` of the document's own direction.
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      onNudge?.(arrow[0] * step, arrow[1] * step);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedLayerIds.includes(layerId)) {
      event.preventDefault();
      onDeleteKey?.(layerId);
      return;
    }
    if (event.key === "Escape") onSelect(null);
  };

  const onLayerKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key.startsWith("Arrow")) onNudgeEnd?.();
  };

  // Tap-to-place (DEC-093's path for a move): a click, never a drag.
  const onStageClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!placing || !source) return;
    event.preventDefault();
    event.stopPropagation();
    const p = docPoint(event.clientX, event.clientY);
    onPlace?.({ x: Math.round(source.direction === "rtl" ? width - p.x : p.x), y: Math.round(p.y) });
  };

  const frameFor = (id: string, shown: Frame): Frame => {
    const moved = preview?.kind === "frames" ? preview.frames[id] : undefined;
    const src = sourceOf(id)?.frame;
    return moved && src ? sourceShift(shown, moved, src) : shown;
  };

  const single = selectedLayerIds.length === 1 ? doc.layers.find((l) => l.id === selectedLayerIds[0] && !l.hidden) : undefined;
  const readout = preview?.kind === "frames" && single ? preview.frames[single.id] : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-body-sm text-fg-muted">
        {t.rich("size", { width: formatNumber(width), height: formatNumber(height), bdi: (c) => <bdi>{c}</bdi> })}
        {" · "}
        {t.rich("zoom", { value: formatNumber(Math.round(scale * 100)), bdi: (c) => <bdi>{c}</bdi> })}
        {readout ? (
          <>
            {" · "}
            {/* ★ Reads like the inspector's fields — `x` from the DOCUMENT's
                start edge — so the chip and the numbers are one truth (DEC-096;
                no rulers this wave, DEC-178). */}
            <span role="status">{t.rich("coords", { x: formatNumber(readout.x), y: formatNumber(readout.y), bdi: (c) => <bdi>{c}</bdi> })}</span>
          </>
        ) : null}
      </p>

      <div ref={hostRef} className="min-w-0 overflow-x-auto">
        <div className="relative" style={{ width: width * scale, height: height * scale }}>
          <iframe
            ref={frameRef}
            title={t("label")}
            srcDoc={html}
            width={width}
            height={height}
            // No scripts are emitted by the renderer and none are permitted
            // here. `allow-same-origin` is present so the font subresource
            // requests carry the session cookie `fonts_storage_read` needs.
            sandbox="allow-same-origin"
            className="pointer-events-none absolute top-0 border-0"
            // ★ PHYSICAL, from the top-left, in every direction (DEC-096's
            // exemption). The frame is `width` wide and scaled into a box
            // `width × scale` wide; pinned at its left and scaled from its
            // top-left it lands exactly on that box whatever the console's or
            // the document's direction. The old `inset-inline-start` + an
            // origin chosen from the DOCUMENT's direction landed W·(1 − s) off
            // the box whenever the two directions differed (W13.0 item 4).
            style={{ left: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}
          />

          {/* Safe-area and bleed guides. Drawn by the EDITOR and never by the
              renderer: a guide that could reach an export is a guide that
              will, on the one poster nobody re-checked. Logical insets under
              the document's own `dir`, so they mirror with the canvas. */}
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

          {/* The selection overlay, in document coordinates × scale, PHYSICAL
              (see the header: DEC-096's exemption). */}
          {selectable ? (
            // ★ SC 2.5.8's «equivalent» exception, named rather than assumed: a box here is sized to its
            // layer, so a small layer is a small target — and the Layers panel selects the same layer
            // with a 44 px row. The sweep excludes this overlay by this attribute, and says why.
            <div
              ref={stageRef}
              className={`absolute inset-0 ${placing ? "cursor-crosshair" : ""}`}
              data-layer-hit-area=""
              onPointerDown={onStagePointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onClickCapture={onStageClickCapture}
            >
              {doc.layers
                .filter((l) => !l.hidden)
                .map((layer) => {
                  const locked = isLocked(layer.id);
                  const selected = selectedLayerIds.includes(layer.id);
                  const label = layer.name ?? `${tl(`kind.${layer.kind}`)} · ${layer.id}`;
                  const b = toPhysical(frameFor(layer.id, layer.frame), doc);
                  return (
                    <button
                      key={layer.id}
                      type="button"
                      aria-pressed={selected}
                      onPointerDown={(e) => onLayerPointerDown(e, layer.id)}
                      onKeyDown={(e) => onLayerKeyDown(e, layer.id)}
                      onKeyUp={onLayerKeyUp}
                      onClick={(e) => {
                        if (swallowClick.current) {
                          swallowClick.current = false;
                          return;
                        }
                        const additive = e.shiftKey || multi;
                        onSelect(selected && !additive && selectedLayerIds.length === 1 ? null : layer.id, { additive });
                      }}
                      className={`absolute bg-transparent ${editable && !locked ? "cursor-move touch-none" : "cursor-pointer"} ${
                        selected ? "outline-2 outline-offset-2 outline-fg-heading" : "outline-1 outline-transparent hover:outline-edge-strong"
                      }`}
                      style={{
                        left: b.left * scale,
                        top: b.top * scale,
                        width: b.width * scale,
                        height: b.height * scale,
                        rotate: b.rotation ? `${b.rotation}deg` : undefined,
                      }}
                    >
                      <span className="sr-only">
                        {tl.rich("select", { name: label, bdi: (c) => <bdi>{c}</bdi> })}
                        {locked ? ` — ${tl("locked")}` : ""}
                      </span>
                    </button>
                  );
                })}

              {editable && single && !isLocked(single.id) ? (
                <Handles box={toPhysical(frameFor(single.id, single.frame), doc)} scale={scale} onPointerDown={(e, handle) => onHandlePointerDown(e, single.id, handle)} />
              ) : null}

              {onFocal && single && single.kind === "image" && single.image.fit === "cover" ? (
                <FocalDot
                  box={toPhysical(single.frame, doc)}
                  point={preview?.kind === "focal" && preview.layerId === single.id ? preview.point : focalOf(single)}
                  scale={scale}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                    gesture.current = { kind: "focal", pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, layerId: single.id };
                  }}
                />
              ) : null}

              {preview?.kind === "frames"
                ? [
                    ...preview.guides.inline.map((x) => (
                      <span
                        key={`gi-${x}`}
                        aria-hidden="true"
                        className="pointer-events-none absolute top-0 bottom-0 w-px bg-fg-heading"
                        style={{ left: (doc.direction === "rtl" ? width - x : x) * scale }}
                      />
                    )),
                    ...preview.guides.block.map((y) => (
                      <span key={`gb-${y}`} aria-hidden="true" className="pointer-events-none absolute inset-x-0 h-px bg-fg-heading" style={{ top: y * scale }} />
                    )),
                  ]
                : null}

              {preview?.kind === "marquee" ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute border border-dashed border-fg-heading bg-fg-heading/10"
                  style={{
                    left: preview.left * scale,
                    top: preview.top * scale,
                    width: (preview.right - preview.left) * scale,
                    height: (preview.bottom - preview.top) * scale,
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {placing ? <p className="text-body-sm text-fg-heading">{t("placingNote")}</p> : null}
    </div>
  );
}

/**
 * The frame SHOWN for a layer mid-gesture: its shown (derived) frame moved by
 * however far the gesture moved its source frame. On the source preset the two
 * coincide except where `derive()` clamps into the safe area.
 */
function sourceShift(shown: Frame, next: Frame, source: Frame): Frame {
  const out: Frame = {
    x: shown.x + (next.x - source.x),
    y: shown.y + (next.y - source.y),
    w: shown.w + (next.w - source.w),
    h: shown.h + (next.h - source.h),
  };
  const rotation = next.rotation ?? shown.rotation;
  if (rotation !== undefined) out.rotation = rotation;
  return out;
}

/**
 * The eight handles and the rotation knob — POINTER affordances only.
 *
 * ★ `aria-hidden` and not focusable, on purpose: every function they perform
 * is on the page in controls a keyboard and a single tap reach — the numeric
 * fields, align, «لائم», «املأ عرضًا», ±15° (DEC-093). That is what lets them
 * claim SC 2.5.7's essential exception for the affordance and SC 2.5.8's
 * «equivalent» exception for their size (W13.1 R4). Each is a 24 px hit area
 * around an 8 px mark; on a small layer the edge handles give way to the
 * corners, and on a tiny one to nothing.
 */
function Handles({
  box,
  scale,
  onPointerDown,
}: {
  box: { left: number; top: number; width: number; height: number; rotation: number };
  scale: number;
  onPointerDown: (e: ReactPointerEvent<HTMLSpanElement>, handle: ResizeHandle | "rotate") => void;
}) {
  const w = box.width * scale;
  const h = box.height * scale;
  if (w < HANDLES_MIN || h < HANDLES_MIN) return null;
  const edges = w >= EDGE_HANDLES_MIN && h >= EDGE_HANDLES_MIN;
  const shown = RESIZE_HANDLES.filter((handle) => edges || handle.length === 2);
  // A captured pointer's move and release bubble to the stage, which runs the
  // one gesture — the handles only start it.

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{ left: box.left * scale, top: box.top * scale, width: w, height: h, rotate: box.rotation ? `${box.rotation}deg` : undefined }}
    >
      {shown.map((handle) => (
        <span
          key={handle}
          data-handle={handle}
          className="pointer-events-auto absolute flex size-6 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center"
          style={{ left: HANDLE_POSITION[handle].left, top: HANDLE_POSITION[handle].top, cursor: HANDLE_POSITION[handle].cursor }}
          onPointerDown={(e) => onPointerDown(e, handle)}
        >
          <span className="block size-2 border border-fg-heading bg-surface" />
        </span>
      ))}
      <span
        data-handle="rotate"
        className="pointer-events-auto absolute flex size-6 -translate-x-1/2 touch-none items-center justify-center"
        style={{ left: "50%", top: -32, cursor: "grab" }}
        onPointerDown={(e) => onPointerDown(e, "rotate")}
      >
        <span className="block size-2.5 rounded-full border border-fg-heading bg-surface" />
      </span>
    </div>
  );
}

/**
 * The focal point's dot, over the image on the canvas — the refinement
 * (REQ-DSG-030). `aria-hidden`: the inspector's nine-point grid is the path,
 * and it alone is sufficient (DEC-093 path 3). PHYSICAL, like
 * `object-position` itself: `x: 0` is the image's left edge.
 */
function FocalDot({
  box,
  point,
  scale,
  onPointerDown,
}: {
  box: { left: number; top: number; width: number; height: number };
  point: FocalPoint;
  scale: number;
  onPointerDown: (e: ReactPointerEvent<HTMLSpanElement>) => void;
}) {
  return (
    <span
      aria-hidden="true"
      data-focal-dot=""
      className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center"
      style={{ left: (box.left + point.x * box.width) * scale, top: (box.top + point.y * box.height) * scale }}
      onPointerDown={onPointerDown}
    >
      <span className="block size-4 rounded-full border-2 border-surface bg-fg-heading shadow" />
    </span>
  );
}
