"use client";

import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { BRAND_COLOUR_TOKENS, fieldsFor, fingerprintSource, paintOrder, PRESETS, toPhysical, type DesignDocument, type FocalPoint, type Layer, type PresetName } from "@kareem/designer-runtime";
import { DesignerCanvas } from "@/components/designer/canvas";
import { useDesignerEditorState } from "@/components/designer/editor-state";
import { Inspector } from "@/components/designer/inspector";
import { bind, token } from "@/components/designer/inspector-ops";
import { ChecksPanel, checkRowCount } from "@/components/designer/checks-panel";
import { LayersPanel } from "@/components/designer/layers-panel";
import { BrandPanel, ElementsPanel, FieldsPanel, UploadsPanel, type PanelAsset } from "@/components/designer/panels";
import { BindingsPanel } from "@/components/designer/bindings-panel";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CanvasStage } from "@/components/ui/canvas-stage";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EditorRail } from "@/components/ui/editor-rail";
import { FloatingToolbar } from "@/components/ui/floating-toolbar";
import { IconButton } from "@/components/ui/icon-button";
import { AlertTriangleIcon, CheckIcon, ChevronIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";

// SCR-056/057 — the studio's editor, rebuilt from `AdminDesigner.dc.html` and `AdminDesignerElements.dc.html` (wave 23,
// REQ-UIX-107, REQ-UIX-110, DEC-199 §2, DEC-208, DEC-237, DEC-238). The chrome is new; the machine under it is
// `editor-state.ts` (moved verbatim in slice 1) and the canvas is `canvas.tsx`'s engine on `ui/canvas-stage`.
//
// ONE SIDEBAR (`DEC-NEXT-36`): the bar · the 68 px rail of seven items and the 300 px panel that swaps · the canvas ·
// no right panel · a floating toolbar on the selection. The route renders bare (the studio frame, contract 1), so
// this owns the viewport and draws its own bar, with the document's name as the page's `h1`.
//
// ★ EVERY DRAG HAS A TAP (DEC-093). A tile in العناصر, الحقول or الملفات adds its layer on a tap and arms «ضع بنقرة»;
// layers reorder by ▲▼; the canvas's drag, handles, knob and marquee keep their wave-13 taps under الطبقة's الموضع.
// `wave23-designer-taps.spec.ts` performs every one with `click()` alone.
//
// MOBILE IS VIEW AND APPROVE (`09` SCR-057, D-8): below `xl` the canvas, every variant, the checks, the bindings and
// «صدّر» — a layer editor at 390 px is a bad tool pretending to be a feature.

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
  /** Signed URLs of READY PNG exports of the saved source, by preset (DEC-017). */
  variantPreviews: Partial<Record<PresetName, string>>;
  /* ── wave 23 ── */
  /** The bar's start: the way back, the name as the `h1`, the document's badges — the page's, it knows the context. */
  barStart?: ReactNode;
  /** Controls the page adds to the bar's end — a certificate template's light/dark. */
  barEnd?: ReactNode;
  /** The «صدّر» sheet's content: the request, the queue, the thumbnails (server-rendered by the page). */
  exportContent?: ReactNode;
  /** Above the canvas — a live poster's detach gate, a failed download. */
  notice?: ReactNode;
  /** A template draft's last published version; «انشر» shows when the draft differs from it. */
  publishedDocument?: DesignDocument | null;
  /** Publishes the draft — `templates/actions.ts`'s `publishVersion`, bound by the page. */
  publish?: () => Promise<{ status: string }>;
  /** A certificate template's kind (DEC-236 §1), for the fields it may carry. */
  family?: string | null;
  /** «معاينة بجلسة»'s choices and the one on screen. Absent for a document bound to its own session. */
  previewSessions?: { id: string; title: string }[];
  previewSessionId?: string | null;
  /** الملفات — the org's images. */
  uploads?: PanelAsset[];
}

type RailKey = "elements" | "fields" | "uploads" | "brand" | "layers" | "checks" | "layer";
type Zoom = "fit" | number;

/** The rotation knob sits 32 px above a selected layer (`canvas.tsx`); the toolbar clears it. */
const TOOLBAR_OFFSET = 44;

export function DesignerEditor(props: DesignerEditorProps) {
  const t = useTranslations("designer.editor");
  const ts = useTranslations("designer.save");
  const tb = useTranslations("designer.bindings");
  const tc = useTranslations("designer.checks");
  const tp = useTranslations("designer.properties");
  const tpr = useTranslations("designer.presets");
  const tcv = useTranslations("designer.canvas");
  const tly = useTranslations("designer.inspector.layer");
  const tl = useTranslations("designer.layers");
  const st = useTranslations("designer.studio");
  const ui = useTranslations("ui");
  const toast = useToast();
  const router = useRouter();

  const [rail, setRail] = useState<RailKey>(props.canEdit ? "elements" : "layers");
  /** The الطبقة panel's tab, remembered for the layer it was chosen on — another layer opens on its own first tab. */
  const [layerTab, setLayerTab] = useState<{ id: string | null; tab: string } | null>(null);
  const revealLayer = useCallback(() => {
    setRail("layer");
    setLayerTab(null);
  }, []);
  const s = useDesignerEditorState(props, { onRevealLayer: revealLayer });
  const {
    document,
    selectedLayerIds,
    selectedLayerId,
    multi,
    setMulti,
    placing,
    save,
    depth,
    presets,
    preset,
    overlays,
    setOverlays,
    selected,
    selection,
    lockedIds,
    findings,
    onSource,
    sourcePreset,
  } = s;

  const [zoom, setZoom] = useState<Zoom>("fit");
  const [scale, setScale] = useState(0.4);
  const [grid, setGrid] = useState(false);
  const [rulers, setRulers] = useState(false);
  const [snapping, setSnapping] = useState(true);
  const [gesturing, setGesturing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [published, setPublished] = useState<DesignDocument | null>(props.publishedDocument ?? null);
  const [publishing, startPublish] = useTransition();

  const bindingChoices = useMemo(
    () => Object.fromEntries(fieldsFor(document.purpose, props.family ?? null).filter((f) => f.layer === "field").map((f) => [f.binding, tb.has(`field.${f.binding}`) ? tb(`field.${f.binding}`) : f.binding])),
    [document.purpose, props.family, tb],
  );
  const qrNames = useMemo(() => ({ "session.eventUrl": tb("field.session.eventUrl"), "certificate.verifyUrl": tb("field.certificate.verifyUrl") }), [tb]);

  const rows = checkRowCount(findings);
  // The draft differs from what was published when their canonical forms differ — key order is not a change.
  const differs = useMemo(() => {
    if (!props.publish) return false;
    if (!published) return true;
    const canon = (d: DesignDocument) => fingerprintSource({ document: d, templateVersionId: null, bindings: {}, fontHashes: [] });
    return canon(published) !== canon(document);
  }, [document, published, props.publish]);

  const onPublish = () =>
    startPublish(async () => {
      await s.flush();
      const result = await props.publish!();
      if (result.status === "ok") {
        setPublished(document);
        toast.show({ tone: "success", title: st("bar.published") });
      } else {
        toast.show({ tone: "error", title: st("bar.publishFailed") });
      }
    });

  const choosePreview = async (sessionId: string) => {
    await s.flush();
    router.push(sessionId ? `?session=${sessionId}` : "?");
  };

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

  const canvasAt = (scaleNow: number, selectable = true) => (
    <DesignerCanvas
      scale={scaleNow}
      selectable={selectable}
      snapping={snapping}
      onGestureChange={setGesturing}
      document={s.shown}
      preset={preset}
      showOverlays={overlays}
      bindings={props.bindings}
      assets={s.assets}
      faces={props.faces}
      origin={props.origin}
      selectedLayerIds={selectedLayerIds}
      onSelect={s.selectOnCanvas}
      lockedLayerIds={lockedIds}
      placeholderLabel={s.placeholderLabel}
      {...(props.canEdit ? { onFocal: (layerId: string, point: FocalPoint) => s.focal(layerId, point, onSource ? undefined : preset) } : {})}
      {...(props.canEdit && onSource
        ? {
            source: document,
            multi,
            placing,
            onFrames: s.applyFrames,
            onMarquee: s.marquee,
            onPlace: s.place,
            onNudge: s.nudge,
            onNudgeEnd: s.endBurst,
            onReorderKey: s.reorder,
            onDeleteKey: s.askDelete,
          }
        : {})}
    />
  );

  /* ── the floating toolbar — the five things touched most, on one selected layer ── */
  const toolbarLayer = selected && props.canEdit && !gesturing && !s.isLocked(selected.id) ? s.shown.layers.find((l) => l.id === selected.id) : undefined;
  const toolbar = toolbarLayer ? (
    <FloatingToolbar label={st("toolbar.label")} anchor={boundingBox(toolbarLayer, s.shown, scale)} offset={TOOLBAR_OFFSET}>
      <LayerToolbar
        layer={selected!}
        fontFamilies={s.fontFamilies}
        values={props.bindings}
        alignLabels={{
          // Named as the eye sees it on THIS document: start is the right of an RTL page (DEC-096).
          start: document.direction === "rtl" ? st("layer.alignRight") : st("layer.alignLeft"),
          center: st("layer.alignMiddle"),
          end: document.direction === "rtl" ? st("layer.alignLeft") : st("layer.alignRight"),
        }}
        onPatch={(patch) => s.patchLayer(selected!.id, patch)}
        onFillWidth={() => s.transform(selected!.id, { kind: "fillWidth" })}
        onBind={() => {
          setRail("layer");
          setLayerTab({ id: selected!.id, tab: "text" });
        }}
      />
    </FloatingToolbar>
  ) : null;

  const stage = (selectable: boolean) => (
    <CanvasStage
      label={tcv("label")}
      contentWidth={document.master.width}
      contentHeight={document.master.height}
      zoom={zoom}
      {...(selectable ? { onScaleChange: setScale } : {})}
      rulers={rulers ? { direction: document.direction, step: rulerStep(document.master.width) } : null}
      grid={grid ? { step: rulerStep(document.master.width) / 2 } : null}
      toggles={[
        { key: "safe", label: st("stage.safeArea"), pressed: overlays, onPressedChange: setOverlays },
        { key: "grid", label: st("stage.grid"), pressed: grid, onPressedChange: setGrid },
        ...(selectable ? [{ key: "snap", label: st("stage.snap"), pressed: snapping, onPressedChange: setSnapping }] : []),
        { key: "rulers", label: st("stage.rulers"), pressed: rulers, onPressedChange: setRulers },
      ]}
      overlay={selectable ? toolbar : null}
      className="min-h-0 flex-1"
    >
      {(scaleNow) => canvasAt(scaleNow, selectable)}
    </CanvasStage>
  );

  const strip = (
    <nav aria-label={tpr("stripLabel")} className="min-w-0">
      <ul className="flex gap-1 overflow-x-auto">
        {presets.map((name) => {
          const flagged = s.flagged.has(name);
          const p = PRESETS[name];
          return (
            <li key={name} className="shrink-0">
              <button
                type="button"
                aria-pressed={name === preset}
                onClick={() => s.choosePreset(name)}
                className={`relative inline-flex min-h-8 items-center gap-1 rounded-pill border px-3 text-label ${
                  name === preset ? "border-transparent bg-fg-heading text-surface" : "border-edge bg-raised text-fg-heading hover:bg-hover"
                }`}
              >
                {p.bleed === 0 && name !== "og" ? <bdi dir="ltr">{ratioOf(p.width, p.height)}</bdi> : <bdi>{tpr(`name.${name}`)}</bdi>}
                <span className="sr-only">
                  {" · "}
                  {tpr(`name.${name}`)} · {formatNumber(p.width)} × {formatNumber(p.height)}
                  {flagged ? ` · ${tpr("hasFinding")}` : ""}
                </span>
                {flagged ? <span aria-hidden="true" className="size-1.5 rounded-full bg-error" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const zoomControl = (
    <Select
      aria-label={st("bar.zoom")}
      value={zoom === "fit" ? "fit" : String(zoom)}
      onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}
      className="w-36! shrink-0"
    >
      <option value="fit">
        {st("bar.fit")} · {formatNumber(Math.round(scale * 100))}%
      </option>
      {[0.25, 0.5, 1].map((z) => (
        <option key={z} value={String(z)}>
          {formatNumber(z * 100)}%
        </option>
      ))}
    </Select>
  );

  const bar = (
    <div role="toolbar" aria-label={t("title")} className="flex min-h-13 flex-wrap items-center gap-2 border-b border-edge px-4 py-2 xl:h-13 xl:flex-nowrap xl:py-0">
      {props.barStart}
      {saveBadge}
      {props.canEdit ? (
        // Below xl the page is view and approve: nothing to undo, so the name keeps the room.
        <span className="hidden shrink-0 gap-1 xl:flex">
          <IconButton size="sm" variant="secondary" label={t("undo")} onClick={() => s.step("undo")} disabled={depth.past === 0}>
            <ChevronIcon direction="forward" />
          </IconButton>
          <IconButton size="sm" variant="secondary" label={t("redo")} onClick={() => s.step("redo")} disabled={depth.future === 0}>
            <ChevronIcon direction="back" />
          </IconButton>
        </span>
      ) : null}
      {/* ★ ONE ROW AT xl (the board's 52 px) — below it the bar may wrap, so the name never shrinks to nothing:
          the strip takes what is left and scrolls on its own axis; everything after
          it keeps its intrinsic width at the inline-end. */}
      <span className="hidden min-w-0 flex-1 xl:block">{strip}</span>
      <span className="grow xl:hidden" />
      <span className="hidden shrink-0 xl:block">{zoomControl}</span>
      {props.barEnd}
      {props.previewSessions ? (
        <Select aria-label={st("bar.previewSession")} value={props.previewSessionId ?? ""} onChange={(e) => void choosePreview(e.target.value)} className="hidden w-48! shrink-0 xl:block">
          <option value="">{st("bar.previewSession")}</option>
          {props.previewSessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title}
            </option>
          ))}
        </Select>
      ) : null}
      {props.publish && differs && props.canEdit ? (
        <Button type="button" variant="secondary" size="sm" pending={publishing} onClick={onPublish} className="shrink-0">
          {st("bar.publish")}
        </Button>
      ) : null}
      {props.exportContent ? (
        <Button type="button" size="sm" onClick={() => setExporting(true)} className="shrink-0">
          {st("bar.export")}
        </Button>
      ) : null}
    </div>
  );

  const identify = (layer: Layer): string => {
    const words = layer.kind === "text" ? (layer.text.literal ?? layer.text.fallback ?? "").trim() : "";
    if (words) return words.length > 40 ? `${words.slice(0, 40).trimEnd()}…` : words;
    return layer.name ?? tl(`kind.${layer.kind}`);
  };

  const deleting = s.deleting;
  const deleteDialog = (
    <Dialog open={deleting !== null} onOpenChange={(open) => !open && s.setDeleting(null)}>
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
          <Button type="button" size="md" onClick={s.confirmDelete}>
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

  const addDisabled = !props.canEdit || !onSource;
  const railItems = [
    ...(props.canEdit
      ? [
          { key: "elements", label: st("rail.elements"), glyph: "elements" as const },
          { key: "fields", label: st("rail.fields"), glyph: "fields" as const },
          { key: "uploads", label: st("rail.uploads"), glyph: "uploads" as const },
          { key: "brand", label: st("rail.brand"), glyph: "brand" as const },
        ]
      : [{ key: "fields", label: st("rail.fields"), glyph: "fields" as const }]),
    { key: "layers", label: st("rail.layers"), glyph: "layers" as const },
    {
      key: "checks",
      label: st("rail.checks"),
      glyph: "checks" as const,
      ...(rows ? { count: { value: rows, label: st("rail.checksCount", { count: rows, value: formatNumber(rows) }) } } : {}),
    },
    ...(selected || selection.length > 1 ? [{ key: "layer", label: st("rail.layer"), glyph: "layer" as const }] : []),
  ];
  const railSelected: RailKey = rail === "layer" && !(selected || selection.length > 1) ? "layers" : rail;

  const panel = (() => {
    switch (railSelected) {
      case "elements":
        return <ElementsPanel purpose={document.purpose} onAdd={s.addFromPanel} disabled={addDisabled} />;
      case "fields":
        return (
          <FieldsPanel
            document={document}
            family={props.family ?? null}
            onAdd={s.addFromPanel}
            disabled={addDisabled}
            declared={props.declaredBindings}
            values={props.bindings}
            fallbacks={s.fallbacks}
            layerNames={s.bindingLayerNames}
          />
        );
      case "uploads":
        return <UploadsPanel assets={props.uploads ?? []} onAdd={(a) => s.addImage(a)} disabled={addDisabled} />;
      case "brand":
        return (
          <BrandPanel
            values={props.bindings}
            fontFamilies={s.fontFamilies}
            canApply={selected !== null && (selected.kind === "text" || selected.kind === "dynamic_field" || selected.kind === "shape")}
            onApply={(token) =>
              selected && s.patchLayer(selected.id, (selected.kind === "shape" ? { shape: { ...selected.shape, fill: token } } : { color: token }) as Partial<Layer>)
            }
            onAddLogo={() => s.addFromPanel("logo", {})}
            disabled={addDisabled}
          />
        );
      case "layers":
        return (
          <LayersPanel
            document={document}
            selectedLayerId={selectedLayerId}
            selectedLayerIds={selectedLayerIds}
            onSelect={(id: string, options?: { additive?: boolean }) => s.select(id, { additive: options?.additive || multi })}
            onToggleHidden={s.toggleHidden}
            onReorder={s.reorder}
            lockedLayerIds={lockedIds}
            canEdit={props.canEdit}
            multi={multi}
            onToggleMulti={() => setMulti((v) => !v)}
            onSelectKind={s.selectKind}
          />
        );
      case "checks":
        return <ChecksPanel findings={findings} measuring={s.measuring} onGoTo={s.goTo} layerNames={s.layerNames} />;
      case "layer":
        return (
          // The region keeps its name «الخصائص»: what the properties are OF is the panel's heading.
          <section aria-label={tp("heading")}>
            <Inspector
              document={document}
              layer={selected}
              locked={selected ? s.isLocked(selected.id) : false}
              canEdit={props.canEdit}
              fontFamilies={s.fontFamilies}
              onPatchLayer={s.patchLayer}
              onArrange={s.arrange}
              onDocument={s.mutate}
              selection={selection}
              lockedLayerIds={lockedIds}
              onGroupArrange={s.groupArrange}
              onTransform={s.transform}
              placing={placing}
              canPlace={onSource}
              onFocal={s.focal}
              focalPreset={onSource ? undefined : preset}
              bindingChoices={{ ...bindingChoices, ...qrNames }}
              {...(layerTab && layerTab.id === (selected?.id ?? null) ? { tab: layerTab.tab } : {})}
              onTabChange={(tab) => setLayerTab({ id: selected?.id ?? null, tab })}
              {...(props.canEdit ? { onDuplicate: s.duplicate, onDelete: s.askDelete } : {})}
            />
          </section>
        );
    }
  })();

  const layerTitle = selected ? (
    <bdi>
      {tl(`kind.${selected.kind}`)} · {selected.name ?? selected.id}
    </bdi>
  ) : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {deleteDialog}
      {/* Generated by the runtime's own fontFaceCss() from the manifest; no user input reaches it. */}
      <style dangerouslySetInnerHTML={{ __html: s.faceCss }} />

      {bar}

      {props.exportContent ? (
        <Sheet open={exporting} onOpenChange={setExporting} title={st("bar.exportTitle")} side="inline-end">
          {props.exportContent}
        </Sheet>
      ) : null}

      {props.notice}
      {alert ? (
        <Panel tone="error" className="m-4">
          <p role="alert" className="text-body-sm text-fg-heading">
            {alert}
          </p>
        </Panel>
      ) : null}

      {/* ── Phone: view and approve ── */}
      <div className="flex flex-col gap-6 p-4 xl:hidden">
        <Panel tone="info">
          <p className="text-body-sm text-fg-body">{t.rich("phoneNotice", { width: formatNumber(1280), bdi: (c) => <bdi>{c}</bdi> })}</p>
        </Panel>
        <section aria-labelledby="dr-canvas-m" className="flex flex-col gap-3">
          <h2 id="dr-canvas-m" className="text-h3 text-fg-heading">
            {t("previewHeading")}
          </h2>
          {strip}
          <div className="flex h-[28rem] flex-col">{stage(false)}</div>
        </section>
        <section aria-labelledby="dr-checks-m" className="flex flex-col gap-3">
          <h2 id="dr-checks-m" className="text-h3 text-fg-heading">
            {tc("heading")}
          </h2>
          <ChecksPanel findings={findings} measuring={s.measuring} onGoTo={s.goTo} layerNames={s.layerNames} />
        </section>
        <section aria-labelledby="dr-bindings-m" className="flex flex-col gap-3">
          <h2 id="dr-bindings-m" className="text-h3 text-fg-heading">
            {tb("heading")}
          </h2>
          <BindingsPanel declared={props.declaredBindings} values={props.bindings} fallbacks={s.fallbacks} layerNames={s.bindingLayerNames} />
        </section>
      </div>

      {/* ── Desktop: the rail, the panel, the canvas ── */}
      <div className="hidden min-h-0 flex-1 xl:flex">
        <EditorRail
          label={t("rail.label")}
          items={railItems}
          selected={railSelected}
          onSelect={(key) => setRail(key as RailKey)}
          {...(railSelected === "layer" && layerTitle ? { panelTitle: layerTitle } : {})}
          {...(railSelected === "layer"
            ? {
                panelAction: (
                  <Button type="button" variant="ghost" size="sm" onClick={() => s.select(null)}>
                    {st("layer.close")}
                  </Button>
                ),
              }
            : {})}
        >
          {panel}
        </EditorRail>

        <section aria-labelledby="dr-canvas" className="flex min-w-0 flex-1 flex-col">
          <h2 id="dr-canvas" className="sr-only">
            {t("previewHeading")}
          </h2>
          {props.canEdit && !onSource ? (
            <div className="flex flex-wrap items-center gap-3 border-b border-edge px-4 py-2">
              <p className="text-body-sm text-fg-muted">{tcv("derivedNote")}</p>
              <Button type="button" variant="secondary" size="sm" onClick={() => s.choosePreset(sourcePreset)}>
                {tcv("editSource")}
              </Button>
            </div>
          ) : null}
          {placing ? <p className="border-b border-edge px-4 py-2 text-body-sm text-fg-heading">{tcv("placingNote")}</p> : null}
          {stage(true)}
        </section>
      </div>
    </div>
  );
}

/**
 * The five on the floating toolbar, by layer kind; a QR or an image has fewer things to touch. ★ Each control has its
 * own intrinsic width and shows its value legibly — the face, the size, the colour's swatch and name, the alignment —
 * never a squeezed select showing one character (the lead's capture of 8177cc6d).
 */
function LayerToolbar({
  layer,
  fontFamilies,
  alignLabels,
  values,
  onPatch,
  onFillWidth,
  onBind,
}: {
  layer: Layer;
  fontFamilies: string[];
  alignLabels: Record<"start" | "center" | "end", string>;
  /** The resolved brand values, for the colour's swatch. */
  values: Record<string, string>;
  onPatch: (patch: Partial<Layer>) => void;
  onFillWidth: () => void;
  onBind: () => void;
}) {
  const tp = useTranslations("designer.properties");
  const st = useTranslations("designer.studio");
  if (layer.kind === "shape") {
    return <ToolbarToken label={tp("fill")} value={layer.shape.fill ?? "{{brand.surface}}"} values={values} onValue={(fill) => onPatch({ shape: { ...layer.shape, fill } } as Partial<Layer>)} />;
  }
  if (layer.kind !== "text" && layer.kind !== "dynamic_field") {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={onFillWidth} className="shrink-0 whitespace-nowrap">
        {st("toolbar.fillWidth")}
      </Button>
    );
  }
  const align = layer.align ?? "start";
  return (
    <>
      <Select aria-label={tp("fontFamily")} value={layer.font.family} onChange={(e) => onPatch({ font: { ...layer.font, family: e.target.value } } as Partial<Layer>)} className="w-48! shrink-0">
        {(fontFamilies.includes(layer.font.family) ? fontFamilies : [layer.font.family, ...fontFamilies]).map((family) => (
          <option key={family} value={family}>
            {family === layer.font.family ? `${family} ${formatNumber(layer.font.weight ?? 400)}` : family}
          </option>
        ))}
      </Select>
      <Select
        aria-label={tp("fontSize")}
        value={String(layer.font.size)}
        onChange={(e) => onPatch({ font: { ...layer.font, size: Math.max(1, Number(e.target.value)) } } as Partial<Layer>)}
        className="w-24! shrink-0"
      >
        {[...new Set([layer.font.size, 24, 32, 40, 48, 64, 80, 96, 128])].sort((a, b) => a - b).map((size) => (
          <option key={size} value={size}>
            {formatNumber(size)}
          </option>
        ))}
      </Select>
      <ToolbarToken label={tp("colour")} value={layer.color ?? "{{brand.fgHeading}}"} values={values} onValue={(color) => onPatch({ color } as Partial<Layer>)} />
      <span role="group" aria-label={tp("align")} className="flex shrink-0 gap-0.5">
        {(["start", "center", "end"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={align === value ? "primary" : "ghost"}
            aria-pressed={align === value}
            onClick={() => onPatch({ align: value } as Partial<Layer>)}
            className="shrink-0 whitespace-nowrap"
          >
            {alignLabels[value]}
          </Button>
        ))}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onFillWidth} aria-label={st("toolbar.fillWidth")} className="shrink-0">
        ↔
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onBind} className="shrink-0 whitespace-nowrap">
        {st("toolbar.bind")}
      </Button>
    </>
  );
}

/** A brand colour by NAME, never a picker (REQ-DSG-021) — its swatch beside it, painted from the resolved value as a
 *  style (never a class); the select's value is the token's name. The panel's control is `TokenSelect`. */
function ToolbarToken({ label, value, values, onValue }: { label: string; value: string; values: Record<string, string>; onValue: (next: string) => void }) {
  const tk = useTranslations("designer.inspector.background.tokens");
  const current = token(value);
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span aria-hidden="true" className="size-5 shrink-0 rounded-sm border border-edge" style={{ background: current ? values[`brand.${current}`] : undefined }} />
      <Select aria-label={label} value={current ?? value} onChange={(e) => onValue(bind(e.target.value))} className="w-32! shrink-0">
        {current === null ? <option value={value}>{value}</option> : null}
        {BRAND_COLOUR_TOKENS.map((name) => (
          <option key={name} value={name}>
            {tk(name)}
          </option>
        ))}
      </Select>
    </span>
  );
}

/** The axis-aligned box that contains a layer's frame on screen, in physical px (DEC-096) — the toolbar's anchor. */
function boundingBox(layer: Layer, doc: DesignDocument, scale: number) {
  const b = toPhysical(layer.frame, doc);
  const rad = ((b.rotation ?? 0) * Math.PI) / 180;
  const w = Math.abs(b.width * Math.cos(rad)) + Math.abs(b.height * Math.sin(rad));
  const h = Math.abs(b.width * Math.sin(rad)) + Math.abs(b.height * Math.cos(rad));
  const cx = b.left + b.width / 2;
  const cy = b.top + b.height / 2;
  return { left: (cx - w / 2) * scale, top: (cy - h / 2) * scale, width: w * scale, height: h * scale };
}

/** A screen preset's proportion, as a chip says it — 1080 × 1350 is «4:5». A number, never copy. */
function ratioOf(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(width, height);
  return `${formatNumber(width / g)}:${formatNumber(height / g)}`;
}

/** A ruler mark every tenth of the width, rounded to a readable step. */
function rulerStep(width: number): number {
  return Math.max(10, Math.round(width / 10 / 10) * 10);
}
