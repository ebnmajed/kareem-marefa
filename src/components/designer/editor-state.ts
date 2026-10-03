"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { DesignDocument, FocalPoint, Frame, Layer, PresetName, ReorderMove } from "@kareem/designer-runtime";
import {
  addLayer,
  alignLayer,
  alignLayers,
  derive,
  distributeLayers,
  duplicateLayer,
  fillSafeWidth,
  fitLayerToSafeArea,
  fontFaceCss,
  newLayer,
  type NewLayerKind,
  type NewLayerOptions,
  nudgeLayers,
  placeLayerCentre,
  PRESETS,
  presetsForDocument,
  removeLayer,
  reorderLayer,
  rotateLayer,
  setFocal,
  snap,
  snapTargets,
  snapTargetsBlock,
  validateDocument,
} from "@kareem/designer-runtime";
import { useCheckFindings, type CheckFinding } from "@/components/designer/checks-panel";
import type { ArrangeOp, GroupOp, TransformOp } from "@/components/designer/inspector-ops";
import type { DesignerEditorProps } from "@/components/designer/editor";
import { useToast } from "@/components/ui/toast";

// SCR-057's state machine — REQ-DSG-022, REQ-DSG-024, REQ-DSG-028, REQ-DSG-029,
// 06 §10, DEC-093, DEC-096, DEC-146, DEC-237 §2.
//
// MOVED VERBATIM out of `editor.tsx` (wave 23, slice 1), so the chrome can be
// rebuilt from its artboard without re-deriving a requirement from memory:
// the document, the selection, fifty-step document-level undo, the autosave
// through the Route Handler, and the rule that a gesture — or a burst of arrow
// presses — is ONE undo entry (W13.1 R5). The one change inside the moved code:
// which panel opens when a layer should be shown is the chrome's, so the four
// `setPanel("inspector")` calls became `onRevealLayer()`.

export type SaveState =
  | { kind: "clean" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error" }
  | { kind: "conflict" }
  | { kind: "forbidden" }
  | { kind: "locked"; layerId: string }
  | { kind: "invalid"; issue: string };

/** Long enough that typing in a number field is one save, short enough that
 *  closing the tab a second after a change does not lose it. */
export const AUTOSAVE_DELAY_MS = 1200;

/** 06 §10: fifty steps. */
export const UNDO_STEPS = 50;

export interface DesignerEditorStateOptions {
  /** Show the selected layer's properties — the chrome decides where. */
  onRevealLayer: () => void;
}

export function useDesignerEditorState(props: DesignerEditorProps, { onRevealLayer }: DesignerEditorStateOptions) {
  const ts = useTranslations("designer.save");
  const tb = useTranslations("designer.bindings");
  const ta = useTranslations("designer.add");
  const toast = useToast();

  const [document, setDocument] = useState<DesignDocument>(props.initialDocument);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  /** The canvas's asset URLs: the page's, plus any image added in this session. */
  const [assets, setAssets] = useState<Record<string, string>>(() => props.assets ?? {});
  /** «تحديد متعدّد» — DEC-178's added tap path: shift-click needs a keyboard. */
  const [multi, setMulti] = useState(false);
  /** Tap-to-place armed for the selected layer (DEC-093's path for a move). */
  const [placing, setPlacing] = useState(false);
  const selectedLayerId = selectedLayerIds.length === 1 ? (selectedLayerIds[0] as string) : null;
  const setSelectedLayerId = useCallback((id: string | null) => setSelectedLayerIds(id ? [id] : []), []);
  const [save, setSave] = useState<SaveState>({ kind: "clean" });
  // 06 §10: undo/redo is document-level, fifty steps. A layer-level history
  // would let an undo half-apply an edit that touched two layers, and the
  // whole document is a few kilobytes.
  const past = useRef<DesignDocument[]>([]);
  /** The burst an edit belongs to: consecutive edits with the SAME key are one
   *  undo entry (a held arrow key). Any other edit, a key release, or a
   *  selection change ends it. No timer (DEC-146). */
  const burst = useRef<string | null>(null);
  const future = useRef<DesignDocument[]>([]);
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  // A certificate is exported at the one page its master is composed for
  // (DEC-148); a poster at all seven. The master does not change while the
  // document is open, so neither does the list.
  const presets = useMemo(() => presetsForDocument(props.initialDocument), [props.initialDocument]);
  const [preset, setPreset] = useState<PresetName>(() => presetsForDocument(props.initialDocument)[0] ?? "master");
  // On by default for print, where crossing a safe area is expensive and the
  // blade is not negotiable (06 §10).
  const [overlays, setOverlays] = useState(() => PRESETS[presetsForDocument(props.initialDocument)[0] ?? "master"].bleed > 0);
  const [fontsReady, setFontsReady] = useState(false);
  const baseUpdatedAt = useRef(props.initialUpdatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  /** Locked by the TEMPLATE, or by the layer's own flag. The database
   *  enforces the first (design_documents_guard compares against the pinned
   *  version); the second is the document's own statement, and ignoring it
   *  would make `locked: true` decoration — an uploaded poster's single
   *  locked layer could then be moved. */
  const isLocked = useCallback(
    (layerId: string) => props.lockedLayerIds.includes(layerId) || document.layers.some((l) => l.id === layerId && l.locked === true),
    [document.layers, props.lockedLayerIds],
  );

  // The canvas draws a STRING, so this must be one: `t.rich` returns a
  // ReactNode the renderer cannot use, and a message carrying a tag called
  // through plain `t()` renders the raw key (DEC-047's lesson, found on the
  // canvas by the wave-3 e2e). The renderer bidi-isolates the result itself.
  // The field's Arabic name, never its path (DEC-149 §4).
  const placeholderLabel = useCallback(
    (binding: string) => `${tb("unbound")} · ${tb.has(`field.${binding}`) ? tb(`field.${binding}`) : tb("field.unknown")}`,
    [tb],
  );

  // The SAME faces the canvas loads, declared in this document too, because
  // the pre-export checks measure here. Measuring against a fallback face
  // would produce a warning list that disagrees with the export.
  const faceCss = useMemo(
    () => fontFaceCss(props.faces.map((f) => ({ ...f, url: `${props.origin}/api/fonts/${f.sha256}` }))),
    [props.faces, props.origin],
  );

  useEffect(() => {
    let cancelled = false;
    const families = [...new Set(props.faces.map((f) => f.family))];
    // `document.fonts.ready` alone is not enough: a face declared but never
    // exercised is not "pending", so ready resolves while the glyphs are
    // still unloaded (DEC-024). Load each family explicitly first.
    void Promise.all(families.map((family) => window.document.fonts.load(`400 40px "${family}"`)))
      .then(() => window.document.fonts.ready)
      .then(() => {
        if (!cancelled) setFontsReady(true);
      })
      .catch(() => {
        if (!cancelled) setFontsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [props.faces]);

  const push = useCallback(
    async (next: DesignDocument) => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setSave({ kind: "saving" });
      try {
        const response = await fetch(`/api/designer/${props.documentId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseUpdatedAt: baseUpdatedAt.current, document: next }),
          signal: controller.signal,
        });
        const body = (await response.json()) as { status?: string; updatedAt?: string; layerId?: string; issues?: { path: string; code: string }[] };
        if (response.ok && body.updatedAt) {
          baseUpdatedAt.current = body.updatedAt;
          setSave({ kind: "saved" });
          return;
        }
        if (response.status === 409 && body.status === "locked_region") return setSave({ kind: "locked", layerId: body.layerId ?? "" });
        if (response.status === 409) return setSave({ kind: "conflict" });
        if (response.status === 403) return setSave({ kind: "forbidden" });
        if (response.status === 422) {
          const first = body.issues?.[0];
          return setSave({ kind: "invalid", issue: first ? `${first.path} — ${first.code}` : "" });
        }
        setSave({ kind: "error" });
      } catch (e) {
        // An aborted request is the NEXT keystroke's save, not a failure.
        if ((e as Error).name !== "AbortError") setSave({ kind: "error" });
      }
    },
    [props.documentId],
  );

  // A failed save is said where the admin is looking — a toast that stays
  // until dismissed (`16` §7.3) — as well as in the toolbar's status. The
  // conflict and the permission cases name what to do; the chip alone would
  // be scrolled past.
  const toasted = useRef<SaveState["kind"]>("clean");
  useEffect(() => {
    // Only a change of KIND is news: a second failed save in a row is the
    // same toast, which is still on screen because errors stay.
    if (toasted.current === save.kind) return;
    toasted.current = save.kind;
    if (save.kind === "conflict" || save.kind === "forbidden" || save.kind === "error") toast.show({ tone: "error", title: ts(save.kind) });
  }, [save.kind, toast, ts]);

  const mutate = useCallback(
    (next: DesignDocument, options: { coalesce?: string } = {}) => {
      // Validated in the browser too, so a bad edit is refused at the field
      // rather than round-tripping to a 422. The Route Handler runs the same
      // function — this is a courtesy, never the boundary.
      const parsed = validateDocument(next);
      if (!parsed.ok) {
        const first = parsed.issues[0];
        setSave({ kind: "invalid", issue: first ? `${first.path} — ${first.code}` : "" });
        return;
      }
      const joins = options.coalesce !== undefined && options.coalesce === burst.current;
      burst.current = options.coalesce ?? null;
      setDocument((current) => {
        // One entry per gesture or burst: a continuing burst replaces what is
        // on screen without pushing another step.
        if (!joins) past.current = [...past.current, current].slice(-UNDO_STEPS);
        // A new edit ends the redo branch: keeping it would let a redo jump
        // to a document that never followed from what is on screen.
        future.current = [];
        setDepth({ past: past.current.length, future: 0 });
        return next;
      });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void push(next), AUTOSAVE_DELAY_MS);
    },
    [push],
  );

  const step = useCallback(
    (direction: "undo" | "redo") => {
      const from = direction === "undo" ? past : future;
      const to = direction === "undo" ? future : past;
      const previous = from.current[from.current.length - 1];
      if (!previous) return;
      from.current = from.current.slice(0, -1);
      setDocument((current) => {
        to.current = [...to.current, current].slice(-UNDO_STEPS);
        setDepth({ past: past.current.length, future: future.current.length });
        return previous;
      });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void push(previous), AUTOSAVE_DELAY_MS);
    },
    [push],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      step(e.shiftKey ? "redo" : "undo");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      inFlight.current?.abort();
    },
    [],
  );

  const patchLayer = useCallback(
    (layerId: string, patch: Partial<Layer>) => {
      if (isLocked(layerId)) return setSave({ kind: "locked", layerId });
      // Guides applied to a TYPED frame, in the document's own logical
      // coordinates, so they mirror with direction rather than jumping to the
      // far side when a template is mirrored for English.
      const snapped = patch.frame
        ? {
            ...patch,
            frame: {
              ...patch.frame,
              x: snap(patch.frame.x, snapTargets(document, layerId)),
              y: snap(patch.frame.y, snapTargetsBlock(document, layerId)),
            },
          }
        : patch;
      mutate({ ...document, layers: document.layers.map((l) => (l.id === layerId ? ({ ...l, ...snapped } as Layer) : l)) });
    },
    [document, mutate, isLocked],
  );

  // ★ Align and fit move a layer, so a locked one is refused (REQ-DSG-024);
  // reordering changes only depth, which the template lock does not cover.
  // The runtime computes the result on the DOCUMENT's axis — nothing here
  // reads the console's direction (DEC-096).
  const arrange = useCallback(
    (layerId: string, op: ArrangeOp) => {
      if (op.kind !== "order" && isLocked(layerId)) return setSave({ kind: "locked", layerId });
      const next =
        op.kind === "align"
          ? alignLayer(document, layerId, op.axis, op.edge, op.target)
          : op.kind === "fit"
            ? fitLayerToSafeArea(document, layerId)
            : reorderLayer(document, layerId, op.move);
      // A no-op is not an edit: no undo step, no autosave.
      if (next !== document && JSON.stringify(next) !== JSON.stringify(document)) mutate(next);
    },
    [document, mutate, isLocked],
  );

  const reorder = useCallback((layerId: string, move: ReorderMove) => arrange(layerId, { kind: "order", move }), [arrange]);

  /** Commits a document only when it changed — a no-op is not an undo step. */
  const commit = useCallback(
    (next: DesignDocument, options?: { coalesce?: string }) => {
      if (next !== document && JSON.stringify(next) !== JSON.stringify(document)) mutate(next, options);
    },
    [document, mutate],
  );

  /** A canvas gesture's result: the new SOURCE frames, once, on release. */
  const applyFrames = useCallback(
    (frames: Record<string, Frame>) => {
      const locked = Object.keys(frames).find((id) => isLocked(id));
      if (locked) return setSave({ kind: "locked", layerId: locked });
      commit({ ...document, layers: document.layers.map((l) => (frames[l.id] ? { ...l, frame: frames[l.id] as Frame } : l)) });
    },
    [commit, document, isLocked],
  );

  /** Arrow keys, on the VISUAL axis (DEC-096) — the runtime maps it to `x`. */
  const nudge = useCallback(
    (dx: number, dy: number) => {
      const ids = selectedLayerIds.filter((id) => !isLocked(id));
      if (ids.length === 0) return;
      commit(nudgeLayers(document, ids, dx, dy), { coalesce: `nudge:${ids.join(",")}` });
    },
    [commit, document, isLocked, selectedLayerIds],
  );
  const endBurst = useCallback(() => {
    burst.current = null;
  }, []);

  /** Align and distribute for two or more layers, on the DOCUMENT's axis. Locked ones stay put. */
  const groupArrange = useCallback(
    (op: GroupOp) => {
      const ids = selectedLayerIds.filter((id) => !isLocked(id));
      if (ids.length === 0) return;
      commit(op.kind === "align" ? alignLayers(document, ids, op.axis, op.edge, op.target) : distributeLayers(document, ids, op.axis));
    },
    [commit, document, isLocked, selectedLayerIds],
  );

  /** ±15°, «صفّر», «املأ عرضًا» and arming «ضع بنقرة» — the taps for rotate, resize and move. */
  const transform = useCallback(
    (layerId: string, op: TransformOp) => {
      if (op.kind === "place") return setPlacing((v) => !v);
      if (isLocked(layerId)) return setSave({ kind: "locked", layerId });
      commit(
        op.kind === "rotate"
          ? rotateLayer(document, layerId, op.degrees, op.mode)
          : fillSafeWidth(document, layerId),
      );
    },
    [commit, document, isLocked],
  );

  const place = useCallback(
    (point: { x: number; y: number }) => {
      setPlacing(false);
      if (!selectedLayerId) return;
      if (isLocked(selectedLayerId)) return setSave({ kind: "locked", layerId: selectedLayerId });
      commit(placeLayerCentre(document, selectedLayerId, point));
    },
    [commit, document, isLocked, selectedLayerId],
  );

  /**
   * The focal point (REQ-DSG-030). Allowed on a layer locked by its OWN flag —
   * an uploaded poster's only layer — because A32's crop override is not a
   * move, a resize, a hide or a delete (REQ-DSG-024), and the database's guard
   * compares exactly those (`0055`'s `design_documents_guard`). On a derived
   * preset it writes that preset's override.
   */
  const focal = useCallback(
    (layerId: string, point: FocalPoint, forPreset?: PresetName) => commit(setFocal(document, layerId, point, forPreset)),
    [commit, document],
  );

  /** A tap selects; shift or «تحديد متعدّد» adds and removes. */
  const select = useCallback(
    (layerId: string | null, options: { additive?: boolean } = {}) => {
      burst.current = null;
      setPlacing(false);
      if (!layerId) return setSelectedLayerIds([]);
      if (options.additive) {
        setSelectedLayerIds((ids) => (ids.includes(layerId) ? ids.filter((id) => id !== layerId) : [...ids, layerId]));
      } else {
        setSelectedLayerIds([layerId]);
      }
    },
    [],
  );

  const marquee = useCallback((ids: string[], additive: boolean) => {
    burst.current = null;
    setSelectedLayerIds((current) => (additive ? [...new Set([...current, ...ids])] : ids));
  }, []);

  /* ── D1b: add, duplicate, delete (DEC-178 — «add images, logos, text») ── */

  const add = useCallback(
    (kind: NewLayerKind) => {
      const layer = newLayer(document, kind, {
        literal: ta("newText"),
        fontFamily: props.faces.find((f) => /arabic/i.test(f.family))?.family ?? props.faces[0]?.family,
        name: ta(kind),
      });
      commit(addLayer(document, layer));
      setSelectedLayerIds([layer.id]);
      onRevealLayer();
    },
    [commit, document, props.faces, ta, onRevealLayer],
  );

  /** An uploaded image: the document stores the asset ID; the canvas shows the
   *  signed preview at once (DEC-179). Sized to the image's own proportion,
   *  inside the safe area. */
  const addImage = useCallback(
    (asset: { assetId: string; width: number; height: number; previewUrl: string | null }) => {
      const base = newLayer(document, "image", { assetId: asset.assetId, name: ta("image") });
      const w = base.frame.w;
      const h = Math.max(1, Math.round((w * asset.height) / Math.max(1, asset.width)));
      const layer = { ...base, frame: { ...base.frame, h } } as Layer;
      if (asset.previewUrl) setAssets((current) => ({ ...current, [asset.assetId]: asset.previewUrl as string }));
      commit(addLayer(document, layer));
      setSelectedLayerIds([layer.id]);
      onRevealLayer();
    },
    [commit, document, ta, onRevealLayer],
  );

  const duplicate = useCallback(
    (layerId: string) => {
      if (isLocked(layerId)) return setSave({ kind: "locked", layerId });
      const next = duplicateLayer(document, layerId);
      commit(next);
      const copy = next.layers[next.layers.length - 1];
      if (copy) setSelectedLayerIds([copy.id]);
    },
    [commit, document, isLocked],
  );

  /** ★ Delete confirms BY NAME (REQ-UIX-013) and a locked region is never
   *  deleted (REQ-DSG-024 — the database's guard refuses it too). */
  const [deleting, setDeleting] = useState<Layer | null>(null);
  const askDelete = useCallback(
    (layerId: string) => {
      if (isLocked(layerId)) return setSave({ kind: "locked", layerId });
      setDeleting(document.layers.find((l) => l.id === layerId) ?? null);
    },
    [document.layers, isLocked],
  );
  const confirmDelete = useCallback(() => {
    if (!deleting) return;
    commit(removeLayer(document, deleting.id));
    setSelectedLayerIds((ids) => ids.filter((id) => id !== deleting.id));
    setDeleting(null);
  }, [commit, deleting, document]);

  const selectKind = useCallback((kind: Layer["kind"]) => {
    burst.current = null;
    setSelectedLayerIds(document.layers.filter((l) => l.kind === kind && !l.hidden).map((l) => l.id));
  }, [document.layers]);

  const toggleHidden = useCallback(
    (layerId: string) => {
      if (isLocked(layerId)) return setSave({ kind: "locked", layerId });
      mutate({ ...document, layers: document.layers.map((l) => (l.id === layerId ? { ...l, hidden: !l.hidden } : l)) });
    },
    [document, mutate, isLocked],
  );

  const selected = useMemo(() => document.layers.find((l) => l.id === selectedLayerId) ?? null, [document.layers, selectedLayerId]);
  // What each binding's template fallback is, so an unbound field can say
  // what will actually print rather than only that nothing bound.
  // …and the layer's own name, for a binding the catalogue has no Arabic name
  // for: an org admin never reads a plan identifier (DEC-149 §4).
  const { fallbacks, bindingLayerNames } = useMemo(() => {
    const out: Record<string, string> = {};
    const names: Record<string, string> = {};
    for (const layer of document.layers) {
      const binding = layer.kind === "text" ? layer.text.binding : layer.kind === "dynamic_field" ? layer.field.binding : undefined;
      const fallback = layer.kind === "text" ? layer.text.fallback : layer.kind === "dynamic_field" ? layer.field.fallback : undefined;
      if (!binding) continue;
      const key = binding.replace(/^\{\{|\}\}$/g, "").trim();
      if (fallback) out[key] = fallback;
      if (layer.name && !names[key]) names[key] = layer.name;
    }
    return { fallbacks: out, bindingLayerNames: names };
  }, [document.layers]);
  const fontFamilies = useMemo(() => [...new Set(props.faces.map((f) => f.family))], [props.faces]);

  const { findings, measuring } = useCheckFindings({ document, bindings: props.bindings, fontsReady, assetSizes: props.assetSizes });
  const flagged = useMemo(() => new Set(findings.map((f) => f.preset)), [findings]);
  const layerNames = useMemo(() => Object.fromEntries(document.layers.filter((l) => l.name).map((l) => [l.id, l.name as string])), [document.layers]);

  // ★ REQ-DSG-029: a check selects the layer that failed it, on the preset it
  // failed in — the canvas shows that variant with that layer outlined.
  const goTo = useCallback(
    (finding: CheckFinding) => {
      setPreset(finding.preset);
      setOverlays(true);
      setSelectedLayerId(finding.layerId);
      onRevealLayer();
    },
    [setSelectedLayerId, onRevealLayer],
  );

  // Selecting on the CANVAS opens the layer's properties; selecting in the
  // layer list stays in the list, so several rows can be reordered in a row.
  const selectOnCanvas = useCallback(
    (layerId: string | null, options: { additive?: boolean } = {}) => {
      select(layerId, options);
      if (layerId) onRevealLayer();
    },
    [select, onRevealLayer],
  );

  const choosePreset = useCallback((name: PresetName) => {
    setPreset(name);
    setOverlays(PRESETS[name].bleed > 0);
  }, []);

  const shown = useMemo(() => derive(document, preset), [document, preset]);
  const sourcePreset = presets[0] ?? "master";
  const onSource = preset === sourcePreset;
  const lockedIds = useMemo(() => document.layers.filter((l) => isLocked(l.id)).map((l) => l.id), [document.layers, isLocked]);
  const selection = useMemo(() => document.layers.filter((l) => selectedLayerIds.includes(l.id)), [document.layers, selectedLayerIds]);

  /* ── wave 23, after the move: what the rebuilt chrome needs beyond it ── */

  /** Save NOW — before a navigation (a preview, a publish) drops the last 1.2 s of work. */
  const flush = useCallback(async () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    await push(document);
  }, [document, push]);

  /** A tile tapped in العناصر, الحقول or الملفات: the layer is added inside the safe area at the document's start,
   *  selected and shown, and «ضع بنقرة» armed — the next tap on the canvas places its centre (DEC-093; the drag is the
   *  enhancement). */
  const addFromPanel = useCallback(
    (kind: NewLayerKind, options: NewLayerOptions) => {
      const layer = newLayer(document, kind, {
        literal: ta("newText"),
        fontFamily: props.faces.find((f) => /arabic/i.test(f.family))?.family ?? props.faces[0]?.family,
        ...options,
      });
      commit(addLayer(document, layer));
      setSelectedLayerIds([layer.id]);
      setPlacing(true);
      onRevealLayer();
    },
    [commit, document, props.faces, ta, onRevealLayer],
  );

  return {
    document,
    selectedLayerIds,
    selectedLayerId,
    assets,
    multi,
    setMulti,
    placing,
    save,
    depth,
    presets,
    preset,
    overlays,
    setOverlays,
    fontsReady,
    isLocked,
    placeholderLabel,
    faceCss,
    mutate,
    step,
    patchLayer,
    arrange,
    reorder,
    commit,
    applyFrames,
    nudge,
    endBurst,
    groupArrange,
    transform,
    place,
    focal,
    select,
    marquee,
    add,
    addImage,
    duplicate,
    deleting,
    setDeleting,
    askDelete,
    confirmDelete,
    selectKind,
    toggleHidden,
    selected,
    fallbacks,
    bindingLayerNames,
    fontFamilies,
    findings,
    measuring,
    flagged,
    layerNames,
    goTo,
    selectOnCanvas,
    choosePreset,
    shown,
    sourcePreset,
    onSource,
    lockedIds,
    selection,
    flush,
    addFromPanel,
    setPlacing,
  };
}
