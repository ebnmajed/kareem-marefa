"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { DesignDocument, Layer, PresetName, ReorderMove } from "@kareem/designer-runtime";
import {
  alignLayer,
  derive,
  fitLayerToSafeArea,
  fontFaceCss,
  PRESETS,
  presetsFor,
  reorderLayer,
  snap,
  snapTargets,
  snapTargetsBlock,
  validateDocument,
} from "@kareem/designer-runtime";
import { DesignerCanvas } from "@/components/designer/canvas";
import { LayerList } from "@/components/designer/layer-list";
import { Inspector, type ArrangeOp } from "@/components/designer/inspector";
import { BindingsPanel } from "@/components/designer/bindings-panel";
import { ChecksPanel, useCheckFindings, type CheckFinding } from "@/components/designer/checks-panel";
import { VariantStrip } from "@/components/designer/variant-strip";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { AlertTriangleIcon, CheckIcon } from "@/components/ui/icons";

// SCR-057 — the shared designer, on the M9 system. REQ-DSG-004 … REQ-DSG-006,
// REQ-DSG-022, REQ-DSG-028, REQ-DSG-029, DEC-077, DEC-093, DEC-096, DEC-148.
//
// ONE ENGINE (D54). There is no poster branch and no certificate branch in
// this component: a certificate document is a document whose `purpose` is
// `certificate` and whose bindings resolve from a certificate row.
//
// THE ENGINE IS UNCHANGED (DEC-048, `16` §10.1). The canvas is an iframe of
// `renderDocumentToHtml()`'s real output, bindings come from real rows, the
// faces load by SHA-256, autosave is a Route Handler (layer trees exceed the
// 1 MB action cap), undo is fifty document-level steps. What changed is the
// chrome above it: a toolbar, a tabbed side panel — the inspector showing only
// the sections the selected layer has, the layers, the data, the checks as a
// count that selects its layer — and a strip of every variant.
//
// ★ TWO COLUMNS, NOT `16` §10.2's THREE. The studio lives inside the admin
// console's content column, which is about 830 px wide at every desktop size;
// a rail, a canvas and an inspector side by side there left the canvas 160 px
// wide (measured). So the canvas takes the start column and one tabbed panel
// the end — properties, layers, checks — one tap apart. The dynamic fields
// are the document's own properties, so they sit under «المستند».
//
// ★ NO DRAGGING THIS WAVE (DEC-148). Every operation here is a tap: select in
// the list or on the canvas, align, fit, reorder, type a number. That is
// SC 2.5.7's non-dragging path, and `tests/e2e/wave8-designer-editor.spec.ts`
// performs each one with `click()` alone.
//
// MOBILE IS VIEW AND APPROVE (09, SCR-057). Below the editor breakpoint the
// layer chrome is not reflowed but replaced: the canvas, every variant, the
// checks, and «اطلب التصدير» in the page header — a layer editor at 390 px is
// a bad tool pretending to be a feature.

export interface DesignerEditorProps {
  documentId: string;
  purpose: "poster" | "certificate";
  initialDocument: DesignDocument;
  initialUpdatedAt: string;
  bindings: Record<string, string>;
  declaredBindings: string[];
  faces: Array<{ family: string; weight: number; style: string; sha256: string; unicodeRange?: string }>;
  lockedLayerIds: string[];
  canEdit: boolean;
  origin: string;
  /** Each image layer's intrinsic pixel size, for the PPI guard. */
  assetSizes: Record<string, { width: number; height: number }>;
  /** Signed URLs of READY PNG exports of the saved source, by preset — the
   *  variant strip shows the worker's own renders (DEC-017). */
  variantPreviews: Partial<Record<PresetName, string>>;
}

type SaveState =
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
const AUTOSAVE_DELAY_MS = 1200;

/** 06 §10: fifty steps. */
const UNDO_STEPS = 50;

type PanelTab = "inspector" | "layers" | "checks";

export function DesignerEditor(props: DesignerEditorProps) {
  const t = useTranslations("designer.editor");
  const ts = useTranslations("designer.save");
  const tb = useTranslations("designer.bindings");
  const tp = useTranslations("designer.inspector");
  const tprops = useTranslations("designer.properties");
  const tpr = useTranslations("designer.presets");
  const tc = useTranslations("designer.checks");
  const toast = useToast();

  const [document, setDocument] = useState<DesignDocument>(props.initialDocument);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "clean" });
  const [panel, setPanel] = useState<PanelTab>("layers");
  // 06 §10: undo/redo is document-level, fifty steps. A layer-level history
  // would let an undo half-apply an edit that touched two layers, and the
  // whole document is a few kilobytes.
  const past = useRef<DesignDocument[]>([]);
  const future = useRef<DesignDocument[]>([]);
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  const presets = useMemo(() => presetsFor(props.purpose), [props.purpose]);
  const [preset, setPreset] = useState<PresetName>(() => presetsFor(props.purpose)[0] ?? "master");
  // On by default for print, where crossing a safe area is expensive and the
  // blade is not negotiable (06 §10).
  const [overlays, setOverlays] = useState(() => PRESETS[presetsFor(props.purpose)[0] ?? "master"].bleed > 0);
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
  const placeholderLabel = useCallback((binding: string) => `${tb("unbound")} · ${binding}`, [tb]);

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
    (next: DesignDocument) => {
      // Validated in the browser too, so a bad edit is refused at the field
      // rather than round-tripping to a 422. The Route Handler runs the same
      // function — this is a courtesy, never the boundary.
      const parsed = validateDocument(next);
      if (!parsed.ok) {
        const first = parsed.issues[0];
        setSave({ kind: "invalid", issue: first ? `${first.path} — ${first.code}` : "" });
        return;
      }
      setDocument((current) => {
        past.current = [...past.current, current].slice(-UNDO_STEPS);
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
  const fallbacks = useMemo(() => {
    const out: Record<string, string> = {};
    for (const layer of document.layers) {
      const binding = layer.kind === "text" ? layer.text.binding : layer.kind === "dynamic_field" ? layer.field.binding : undefined;
      const fallback = layer.kind === "text" ? layer.text.fallback : layer.kind === "dynamic_field" ? layer.field.fallback : undefined;
      if (binding && fallback) out[binding.replace(/^\{\{|\}\}$/g, "").trim()] = fallback;
    }
    return out;
  }, [document.layers]);
  const fontFamilies = useMemo(() => [...new Set(props.faces.map((f) => f.family))], [props.faces]);

  const { findings, measuring } = useCheckFindings({ document, bindings: props.bindings, fontsReady, assetSizes: props.assetSizes });
  const flagged = useMemo(() => new Set(findings.map((f) => f.preset)), [findings]);
  const layerNames = useMemo(() => Object.fromEntries(document.layers.filter((l) => l.name).map((l) => [l.id, l.name as string])), [document.layers]);

  // ★ REQ-DSG-029: a check selects the layer that failed it, on the preset it
  // failed in — the canvas shows that variant with that layer outlined.
  const goTo = useCallback((finding: CheckFinding) => {
    setPreset(finding.preset);
    setOverlays(true);
    setSelectedLayerId(finding.layerId);
    setPanel("inspector");
  }, []);

  // Selecting on the CANVAS opens the layer's properties; selecting in the
  // layer list stays in the list, so several rows can be reordered in a row.
  const selectOnCanvas = useCallback((layerId: string | null) => {
    setSelectedLayerId(layerId);
    if (layerId) setPanel("inspector");
  }, []);

  const choosePreset = useCallback((name: PresetName) => {
    setPreset(name);
    setOverlays(PRESETS[name].bleed > 0);
  }, []);

  const alert = (() => {
    switch (save.kind) {
      case "locked":
        return ts.rich("lockedRegion", { layer: save.layerId, bdi: (c) => <bdi>{c}</bdi> });
      case "invalid":
        return ts.rich("invalid", { issue: save.issue, bdi: (c) => <bdi dir="ltr">{c}</bdi> });
      default:
        return null;
    }
  })();

  const saveBadge =
    save.kind === "saving" ? (
      <Badge tone="neutral" outline>
        {ts("saving")}
      </Badge>
    ) : save.kind === "saved" ? (
      <Badge tone="success" icon={<CheckIcon />}>
        {ts("saved")}
      </Badge>
    ) : save.kind === "conflict" || save.kind === "forbidden" || save.kind === "error" ? (
      <Badge tone="error" icon={<AlertTriangleIcon />}>
        {ts("failedBadge")}
      </Badge>
    ) : null;

  const checksCount = findings.length;
  const checksBadge = (
    <Badge tone={checksCount ? "error" : "success"} outline={!checksCount} icon={checksCount ? <AlertTriangleIcon /> : <CheckIcon />}>
      {tc("badge", { count: checksCount, value: formatNumber(checksCount) })}
    </Badge>
  );

  const shown = useMemo(() => derive(document, preset), [document, preset]);

  const canvas = (
    <DesignerCanvas
      document={shown}
      preset={preset}
      showOverlays={overlays}
      bindings={props.bindings}
      faces={props.faces}
      origin={props.origin}
      selectedLayerId={selectedLayerId}
      onSelect={selectOnCanvas}
      lockedLayerIds={props.lockedLayerIds}
      placeholderLabel={placeholderLabel}
    />
  );

  const strip = <VariantStrip presets={presets} current={preset} onSelect={choosePreset} flagged={flagged} previews={props.variantPreviews} />;

  const overlaysSwitch = (
    <Switch label={tpr("safeAreaLabel")} checked={overlays} onCheckedChange={setOverlays} />
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Generated by the runtime's own fontFaceCss() from the manifest; no
          user input reaches it, and the family names are escaped there. */}
      <style dangerouslySetInnerHTML={{ __html: faceCss }} />

      {alert ? (
        <Panel tone="error">
          <p role="alert" className="text-body-sm text-fg-heading">
            {alert}
          </p>
        </Panel>
      ) : null}

      {/* ── Phone: view and approve ─────────────────────────────────────── */}
      <div className="flex flex-col gap-6 xl:hidden">
        <Panel tone="info">
          <p className="text-body-sm text-fg-body">{t.rich("phoneNotice", { width: formatNumber(1280), bdi: (c) => <bdi>{c}</bdi> })}</p>
        </Panel>
        {strip}
        {canvas}
        <section aria-labelledby="dr-checks-m" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="dr-checks-m" className="text-h3 text-fg-heading">
              {tc("heading")}
            </h2>
            {checksBadge}
          </div>
          <ChecksPanel findings={findings} measuring={measuring} onGoTo={goTo} layerNames={layerNames} />
        </section>
        <section aria-labelledby="dr-bindings-m" className="flex flex-col gap-3">
          <h2 id="dr-bindings-m" className="text-h3 text-fg-heading">
            {tb("heading")}
          </h2>
          <BindingsPanel declared={props.declaredBindings} values={props.bindings} fallbacks={fallbacks} />
        </section>
      </div>

      {/* ── Desktop: the editor ─────────────────────────────────────────────
          Composed for RTL: the canvas at the start edge, the panel at the end,
          and both mirror with the document rather than being flipped by a
          toggle (06 §10). */}
      <div className="hidden flex-col gap-4 xl:flex">
        <div role="toolbar" aria-label={t("title")} className="flex flex-wrap items-center gap-3 rounded-card border border-edge bg-surface px-4 py-2">
          <p className="text-label text-fg-muted">{t(`purpose.${props.purpose}`)}</p>
          {saveBadge}
          {props.canEdit ? (
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => step("undo")} disabled={depth.past === 0}>
                {t("undo")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => step("redo")} disabled={depth.future === 0}>
                {t("redo")}
              </Button>
            </div>
          ) : null}
          <span className="grow" />
          <button type="button" onClick={() => setPanel("checks")} className="rounded-field">
            {checksBadge}
          </button>
          {overlaysSwitch}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_20rem] items-start gap-6">
          <section aria-labelledby="dr-canvas" className="flex min-w-0 flex-col gap-3">
            <h2 id="dr-canvas" className="text-h3 text-fg-heading">
              {t("previewHeading")}
            </h2>
            <p className="text-body-sm text-fg-muted">{t("realDataNote")}</p>
            {canvas}
            {strip}
          </section>

          <section aria-labelledby="dr-panel" className="flex min-w-0 flex-col gap-3">
            <h2 id="dr-panel" className="sr-only">
              {t("rail.label")}
            </h2>
            <Tabs
              label={t("rail.label")}
              value={panel}
              onValueChange={(v) => setPanel(v as PanelTab)}
              items={[
                { value: "inspector", label: tprops("heading") },
                { value: "layers", label: t("rail.layers") },
                { value: "checks", label: t("rail.checks"), count: checksCount },
              ]}
            >
              <div className="pt-4">
                {panel === "inspector" ? (
                  <section aria-label={tprops("heading")} className="flex flex-col gap-2">
                    {/* What the properties are OF: the layer's own name, or the
                        document when nothing is selected. The tab already
                        says «الخصائص». */}
                    <h3 className="text-label text-fg-heading">
                      <bdi>{selected ? (selected.name ?? selected.id) : tp("documentHeading")}</bdi>
                    </h3>
                    <Inspector
                      document={document}
                      layer={selected}
                      locked={selected ? isLocked(selected.id) : false}
                      canEdit={props.canEdit}
                      fontFamilies={fontFamilies}
                      onPatchLayer={patchLayer}
                      onArrange={arrange}
                      onDocument={mutate}
                    />
                    {selected ? null : (
                      <div className="flex flex-col gap-3 pt-4">
                        <h3 className="text-label text-fg-heading">{tb("heading")}</h3>
                        <BindingsPanel declared={props.declaredBindings} values={props.bindings} fallbacks={fallbacks} />
                      </div>
                    )}
                  </section>
                ) : panel === "layers" ? (
                  <LayerList
                    document={document}
                    selectedLayerId={selectedLayerId}
                    onSelect={setSelectedLayerId}
                    onToggleHidden={toggleHidden}
                    onReorder={reorder}
                    lockedLayerIds={document.layers.filter((l) => isLocked(l.id)).map((l) => l.id)}
                    canEdit={props.canEdit}
                  />
                ) : (
                  <ChecksPanel findings={findings} measuring={measuring} onGoTo={goTo} layerNames={layerNames} />
                )}
              </div>
            </Tabs>
          </section>
        </div>
      </div>
    </div>
  );
}
