"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { DesignDocument, FocalPoint, Layer, PresetName } from "@kareem/designer-runtime";
import { paintOrder } from "@kareem/designer-runtime";
import { DesignerCanvas } from "@/components/designer/canvas";
import { useDesignerEditorState } from "@/components/designer/editor-state";
import { LayersPanel } from "@/components/designer/layers-panel";
import { Inspector } from "@/components/designer/inspector";
import { BindingsPanel } from "@/components/designer/bindings-panel";
import { ChecksPanel } from "@/components/designer/checks-panel";
import { VariantStrip } from "@/components/designer/variant-strip";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { CanvasStage } from "@/components/ui/canvas-stage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
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
// ★ DIRECT MANIPULATION, AND A TAP FOR EVERY DRAG (wave 13 — REQ-DSG-028,
// DEC-093, DEC-178). The canvas drags, resizes, rotates, snaps, nudges and
// marquee-selects (`canvas.tsx`); and every one of those has a single-pointer
// path here — align, distribute, «لائم», «املأ عرضًا», ±15°, «ضع بنقرة», the
// numbers, ▲▼, «تحديد متعدّد» — which `wave8-designer-editor.spec.ts` and
// `wave13-designer-studio-taps.spec.ts` perform with `click()` alone. A gesture
// is ONE undo entry, and a burst of arrow presses is one too (W13.1 R5).
//
// ★ ONLY THE SOURCE PRESET IS MANIPULATED. A derived preset's frames are
// `derive()`'s, and writing one back would be a guess; there the canvas shows
// and the focal point alone is set per preset (A32).
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
  /** Design asset id → a signed URL, for the canvas only (DEC-179). */
  assets?: Record<string, string>;
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

type PanelTab = "inspector" | "layers" | "checks";

export function DesignerEditor(props: DesignerEditorProps) {
  const t = useTranslations("designer.editor");
  const ts = useTranslations("designer.save");
  const tb = useTranslations("designer.bindings");
  const tp = useTranslations("designer.inspector");
  const tprops = useTranslations("designer.properties");
  const tpr = useTranslations("designer.presets");
  const tc = useTranslations("designer.checks");
  const tcv = useTranslations("designer.canvas");
  const tly = useTranslations("designer.inspector.layer");
  const tl = useTranslations("designer.layers");
  const ui = useTranslations("ui");

  const [panel, setPanel] = useState<PanelTab>("layers");
  const revealLayer = useCallback(() => setPanel("inspector"), []);
  // The document, the selection, undo and the autosave: `editor-state.ts` (DEC-237 §2).
  const {
    document, selectedLayerIds, selectedLayerId, assets, multi, setMulti, placing, save, depth, presets, preset, overlays, setOverlays,
    isLocked, placeholderLabel, faceCss, mutate, step, patchLayer, arrange, reorder, applyFrames, nudge, endBurst, groupArrange, transform,
    place, focal, select, marquee, add, addImage, duplicate, deleting, setDeleting, askDelete, confirmDelete, selectKind, toggleHidden,
    selected, fallbacks, bindingLayerNames, fontFamilies, findings, measuring, flagged, layerNames, goTo, selectOnCanvas, choosePreset,
    shown, sourcePreset, onSource, lockedIds, selection,
  } = useDesignerEditorState(props, { onRevealLayer: revealLayer });

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


  const canvas = (scale: number, selectable = true) => (
    <DesignerCanvas
      scale={scale}
      selectable={selectable}
      document={shown}
      preset={preset}
      showOverlays={overlays}
      bindings={props.bindings}
      assets={assets}
      faces={props.faces}
      origin={props.origin}
      selectedLayerIds={selectedLayerIds}
      onSelect={selectOnCanvas}
      lockedLayerIds={lockedIds}
      placeholderLabel={placeholderLabel}
      {...(props.canEdit ? { onFocal: (layerId: string, point: FocalPoint) => focal(layerId, point, onSource ? undefined : preset) } : {})}
      {...(props.canEdit && onSource
        ? {
            source: document,
            multi,
            placing,
            onFrames: applyFrames,
            onMarquee: marquee,
            onPlace: place,
            onNudge: nudge,
            onNudgeEnd: endBurst,
            onReorderKey: reorder,
            onDeleteKey: askDelete,
          }
        : {})}
    />
  );

  const strip = <VariantStrip presets={presets} current={preset} onSelect={choosePreset} flagged={flagged} previews={props.variantPreviews} />;

  const overlaysSwitch = (
    <Switch label={tpr("safeAreaLabel")} checked={overlays} onCheckedChange={setOverlays} />
  );

  /**
   * ★ WHICH layer, not what kind (REQ-UIX-013, the lead's ruling on DEC-178's
   * «a confirm that names the layer»): with two text layers, «نص» cannot tell
   * the admin which one is about to go. A text is named by its own words,
   * shortened; a field by its layer name; anything else by its name, with its
   * kind and its place in the list said beneath. The kind alone is only the
   * fallback for a layer with nothing else to say.
   */
  const identify = (layer: Layer): string => {
    const words = layer.kind === "text" ? (layer.text.literal ?? layer.text.fallback ?? "").trim() : "";
    if (words) return words.length > 40 ? `${words.slice(0, 40).trimEnd()}…` : words;
    return layer.name ?? tl(`kind.${layer.kind}`);
  };

  const deleteDialog = (
    <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
      <DialogContent title={tly("deleteTitle")} closeLabel={ui("dialog.close")}>
        <p className="text-body-sm text-fg-body">{tly.rich("deleteBody", { name: deleting ? identify(deleting) : "", bdi: (c) => <bdi>{c}</bdi> })}</p>
        {deleting ? (
          <p className="mt-1 text-body-sm text-fg-muted">
            {tly.rich("deletePosition", {
              kind: tl(`kind.${deleting.kind}`),
              position: formatNumber(paintOrder(document).reverse().findIndex((l) => l.id === deleting.id) + 1),
              total: formatNumber(document.layers.length),
              bdi: (c) => <bdi>{c}</bdi>,
            })}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" size="md" onClick={confirmDelete}>
            {tly("deleteConfirm")}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="md">
              {tly("cancel")}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="flex flex-col gap-6">
      {deleteDialog}
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
        {/* The canvas is named in the outline on the phone as it is on the desktop (wave 10's
            carried row): the iframe's title satisfied 4.1.2, but a member moving by heading met
            the checks before the thing being checked. */}
        <section aria-labelledby="dr-canvas-m" className="flex flex-col gap-3">
          <h2 id="dr-canvas-m" className="text-h3 text-fg-heading">
            {t("previewHeading")}
          </h2>
          {strip}
          {/* The phone reviews and approves; it does not select layers (see `selectable`). */}
          <CanvasFrame width={document.master.width} height={document.master.height} placing={placing}>
            {(scale) => canvas(scale, false)}
          </CanvasFrame>
        </section>
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
          <BindingsPanel declared={props.declaredBindings} values={props.bindings} fallbacks={fallbacks} layerNames={bindingLayerNames} />
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
            {props.canEdit ? (
              onSource ? (
                <p className="text-body-sm text-fg-muted">{tcv("dragHint")}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-body-sm text-fg-muted">{tcv("derivedNote")}</p>
                  <Button type="button" variant="secondary" size="sm" onClick={() => choosePreset(sourcePreset)}>
                    {tcv("editSource")}
                  </Button>
                </div>
              )
            ) : null}
            <CanvasFrame width={document.master.width} height={document.master.height} placing={placing}>
              {(scale) => canvas(scale)}
            </CanvasFrame>
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
                      selection={selection}
                      lockedLayerIds={lockedIds}
                      onGroupArrange={groupArrange}
                      onTransform={transform}
                      placing={placing}
                      canPlace={onSource}
                      onFocal={focal}
                      focalPreset={onSource ? undefined : preset}
                      {...(props.canEdit ? { onDuplicate: duplicate, onDelete: askDelete } : {})}
                    />
                    {selected || selection.length > 1 ? null : (
                      <div className="flex flex-col gap-3 pt-4">
                        <h3 className="text-label text-fg-heading">{tb("heading")}</h3>
                        <BindingsPanel declared={props.declaredBindings} values={props.bindings} fallbacks={fallbacks} layerNames={bindingLayerNames} />
                      </div>
                    )}
                  </section>
                ) : panel === "layers" ? (
                  <LayersPanel
                    document={document}
                    selectedLayerId={selectedLayerId}
                    selectedLayerIds={selectedLayerIds}
                    onSelect={(id: string, options?: { additive?: boolean }) => select(id, { additive: options?.additive || multi })}
                    onToggleHidden={toggleHidden}
                    onReorder={reorder}
                    lockedLayerIds={lockedIds}
                    canEdit={props.canEdit}
                    multi={multi}
                    onToggleMulti={() => setMulti((v) => !v)}
                    onSelectKind={selectKind}
                    {...(props.canEdit && onSource ? { onAdd: add, onAddImage: addImage } : {})}
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

/**
 * The canvas on `ui/canvas-stage` (wave 23, slice 2): the stage fits it, and the size, the zoom and the placing note —
 * the frame that lived inside `canvas.tsx` until `DEC-237` §3 — are said here until the rebuilt chrome's bar says them.
 */
function CanvasFrame({ width, height, placing, children }: { width: number; height: number; placing: boolean; children: (scale: number) => ReactNode }) {
  const t = useTranslations("designer.canvas");
  const [scale, setScale] = useState(0.4);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-body-sm text-fg-muted">
        {t.rich("size", { width: formatNumber(width), height: formatNumber(height), bdi: (c) => <bdi>{c}</bdi> })}
        {" · "}
        {t.rich("zoom", { value: formatNumber(Math.round(scale * 100)), bdi: (c) => <bdi>{c}</bdi> })}
      </p>
      <CanvasStage label={t("label")} contentWidth={width} zoom="fit" onScaleChange={setScale} className="rounded-card">
        {children}
      </CanvasStage>
      {placing ? <p className="text-body-sm text-fg-heading">{t("placingNote")}</p> : null}
    </div>
  );
}
