"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BRAND_COLOUR_TOKENS,
  FOCAL_GRID,
  focalOf,
  type AlignAxis,
  type AlignEdge,
  type AlignTarget,
  type DesignDocument,
  type FocalPoint,
  type GroupAlignTarget,
  type ImageLayer,
  type Layer,
  type PresetName,
  type ReorderMove,
} from "@kareem/designer-runtime";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { InspectorSection } from "@/components/designer/inspector-section";
import { formatNumber } from "@/components/sessions/numerals";

// SCR-057's inspector — `16` §10.2, REQ-DSG-005, REQ-DSG-028, DEC-093, DEC-096.
//
// Only the sections the selected layer HAS: a text layer and a shape do not
// share a property set, and showing both was the old panel's confusion. With
// nothing selected, the document's own properties — its background.
//
// Four rules this panel keeps, each a way the product breaks quietly:
//
//   · ★ the numeric X/Y/W/H/rotation fields are DEMOTED, never removed
//     (DEC-093): «الموضع والحجم» opens closed. They are the non-dragging path
//     SC 2.5.7 requires, beside the align and order buttons that do the same
//     job in one tap.
//   · ★ align operates on the DOCUMENT's axis (DEC-096). The buttons name the
//     edge they set — start, centre, end — and hand that word to the runtime,
//     which knows nothing about the locale of this screen. Nothing here reads
//     the console's direction, so an Arabic poster aligned from an English
//     console stores the same bytes.
//   · letter-spacing is not editable. A30: spacing Arabic breaks the join.
//   · a colour is a brand TOKEN from a list, never a picker (REQ-DSG-021): the
//     template guard refuses anything else, and so does the brand check.

export type ArrangeOp =
  | { kind: "align"; axis: AlignAxis; edge: AlignEdge; target: AlignTarget }
  | { kind: "fit" }
  | { kind: "order"; move: ReorderMove };

/** Two or more layers at once (wave 13) — on the DOCUMENT's axis, like one. */
export type GroupOp = { kind: "align"; axis: AlignAxis; edge: AlignEdge; target: GroupAlignTarget } | { kind: "distribute"; axis: AlignAxis };

/** The taps for rotate, resize and move (DEC-093): ±15°, «صفّر», «املأ عرضًا», «ضع بنقرة». */
export type TransformOp = { kind: "rotate"; degrees: number; mode: "by" | "to" } | { kind: "fillWidth" } | { kind: "place" };

export interface InspectorProps {
  document: DesignDocument;
  layer: Layer | null;
  locked: boolean;
  canEdit: boolean;
  fontFamilies: string[];
  onPatchLayer: (layerId: string, patch: Partial<Layer>) => void;
  onArrange: (layerId: string, op: ArrangeOp) => void;
  onDocument: (next: DesignDocument) => void;
  /* ── wave 13, all optional: the panel mounts exactly as before without them ── */
  /** The selection, when more than one layer: the group section replaces the layer's. */
  selection?: Layer[];
  lockedLayerIds?: string[];
  onGroupArrange?: (op: GroupOp) => void;
  onTransform?: (layerId: string, op: TransformOp) => void;
  /** «ضع بنقرة» is armed. */
  placing?: boolean;
  /** Tap-to-place is offered only on the source preset. */
  canPlace?: boolean;
  onFocal?: (layerId: string, point: FocalPoint, preset?: PresetName) => void;
  /** The derived preset on screen, whose own focal override the grid sets. */
  focalPreset?: PresetName;
}

const token = (value: string | undefined): string | null => /^\{\{\s*brand\.([A-Za-z]+)\s*\}\}$/.exec(value ?? "")?.[1] ?? null;
const bind = (name: string) => `{{brand.${name}}}`;

export function Inspector({
  document: doc,
  layer,
  locked,
  canEdit,
  fontFamilies,
  onPatchLayer,
  onArrange,
  onDocument,
  selection = [],
  lockedLayerIds = [],
  onGroupArrange,
  onTransform,
  placing = false,
  canPlace = false,
  onFocal,
  focalPreset,
}: InspectorProps) {
  const t = useTranslations("designer.inspector");
  const tp = useTranslations("designer.properties");
  const [target, setTarget] = useState<AlignTarget>("safe");

  if (selection.length > 1 && onGroupArrange) {
    return <GroupSection selection={selection} lockedLayerIds={lockedLayerIds} canEdit={canEdit} onGroupArrange={onGroupArrange} />;
  }

  if (!layer) {
    return (
      <div className="flex flex-col">
        <p className="pb-3 text-body-sm text-fg-muted">{t("documentHint")}</p>
        <InspectorSection title={t("sections.background")}>
          <BackgroundControl document={doc} canEdit={canEdit} onDocument={onDocument} />
        </InspectorSection>
      </div>
    );
  }

  const disabled = locked || !canEdit;
  const frame = layer.frame;
  const setFrame = (key: "x" | "y" | "w" | "h" | "rotation", value: number) => onPatchLayer(layer.id, { frame: { ...frame, [key]: value } } as Partial<Layer>);

  const number = (label: string, value: number, onValue: (n: number) => void, step = 1, min?: number) => (
    <Field label={label}>
      <Input
        type="number"
        inputMode="decimal"
        dir="ltr"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        {...(min !== undefined ? { min } : {})}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onValue(n);
        }}
      />
    </Field>
  );

  const edgeButton = (axis: AlignAxis, edge: AlignEdge, label: string) => (
    <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onArrange(layer.id, { kind: "align", axis, edge, target })}>
      {label}
    </Button>
  );

  return (
    <div className="flex flex-col">
      {locked ? (
        <Panel tone="info" className="mb-3">
          <p role="note" className="text-body-sm text-fg-heading">
            {tp("lockedNotice")}
          </p>
        </Panel>
      ) : null}

      <InspectorSection title={t("sections.arrange")}>
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="text-label text-fg-heading">{t("align.target")}</legend>
          <div className="flex flex-wrap gap-2">
            {(["safe", "page"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={target === value ? "primary" : "secondary"}
                aria-pressed={target === value}
                disabled={disabled}
                onClick={() => setTarget(value)}
              >
                {t(`align.${value}`)}
              </Button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="text-label text-fg-heading">{t("align.inline")}</legend>
          <div className="flex flex-wrap gap-2">
            {edgeButton("inline", "start", t("align.start"))}
            {edgeButton("inline", "center", t("align.center"))}
            {edgeButton("inline", "end", t("align.end"))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="text-label text-fg-heading">{t("align.block")}</legend>
          <div className="flex flex-wrap gap-2">
            {edgeButton("block", "start", t("align.top"))}
            {edgeButton("block", "center", t("align.middle"))}
            {edgeButton("block", "end", t("align.bottom"))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onArrange(layer.id, { kind: "fit" })}>
            {t("align.fit")}
          </Button>
          {onTransform ? (
            <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onTransform(layer.id, { kind: "fillWidth" })}>
              {t("transform.fillWidth")}
            </Button>
          ) : null}
        </div>
        <p className="text-body-sm text-fg-muted">{t("align.note")}</p>
        {onTransform ? (
          <>
            {/* ★ The taps for ROTATE and MOVE (DEC-093): the canvas's knob and
                drag are the enhancement, these are the path. */}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onTransform(layer.id, { kind: "rotate", degrees: -15, mode: "by" })}>
                {t("transform.rotateBack")}
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onTransform(layer.id, { kind: "rotate", degrees: 15, mode: "by" })}>
                {t("transform.rotateForward")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled || !frame.rotation}
                onClick={() => onTransform(layer.id, { kind: "rotate", degrees: 0, mode: "to" })}
              >
                {t("transform.rotateReset")}
              </Button>
            </div>
            {canPlace ? (
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant={placing ? "primary" : "secondary"}
                  size="sm"
                  aria-pressed={placing}
                  disabled={disabled}
                  onClick={() => onTransform(layer.id, { kind: "place" })}
                  className="self-start"
                >
                  {placing ? t("transform.placeCancel") : t("transform.place")}
                </Button>
                <p className="text-body-sm text-fg-muted">{t("transform.placeNote")}</p>
              </div>
            ) : null}
          </>
        ) : null}
      </InspectorSection>

      <InspectorSection title={t("sections.order")}>
        <div className="flex flex-wrap gap-2">
          {(["forward", "backward", "front", "back"] as const).map((move) => (
            <Button key={move} type="button" variant="secondary" size="sm" disabled={!canEdit} onClick={() => onArrange(layer.id, { kind: "order", move })}>
              {t(`order.${move}`)}
            </Button>
          ))}
        </div>
      </InspectorSection>

      {layer.kind === "text" || layer.kind === "dynamic_field" ? (
        <>
          <InspectorSection title={t("sections.type")}>
            <Field label={tp("fontFamily")}>
              <Select
                value={layer.font.family}
                disabled={disabled}
                onChange={(e) => onPatchLayer(layer.id, { font: { ...layer.font, family: e.target.value } } as Partial<Layer>)}
              >
                {(fontFamilies.includes(layer.font.family) ? fontFamilies : [layer.font.family, ...fontFamilies]).map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </Select>
            </Field>
            {number(tp("fontSize"), layer.font.size, (n) => onPatchLayer(layer.id, { font: { ...layer.font, size: Math.max(1, n) } } as Partial<Layer>), 1, 1)}
            <fieldset className="flex flex-col gap-2 border-0 p-0">
              <legend className="text-label text-fg-heading">{tp("align")}</legend>
              <div className="flex flex-wrap gap-2">
                {(["start", "center", "end"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={(layer.align ?? "start") === value ? "primary" : "secondary"}
                    aria-pressed={(layer.align ?? "start") === value}
                    disabled={disabled}
                    onClick={() => onPatchLayer(layer.id, { align: value } as Partial<Layer>)}
                  >
                    {tp(value === "start" ? "alignStart" : value === "center" ? "alignCenter" : "alignEnd")}
                  </Button>
                ))}
              </div>
              <p className="text-body-sm text-fg-muted">{tp("alignNote")}</p>
            </fieldset>
            <p className="text-body-sm text-fg-muted">{tp("letterSpacingNote")}</p>
          </InspectorSection>

          <InspectorSection title={t("sections.binding")}>
            <Field label={tp("binding")}>
              <Input
                type="text"
                dir="ltr"
                value={layer.kind === "text" ? (layer.text.binding ?? "") : layer.field.binding}
                disabled={disabled}
                onChange={(e) =>
                  onPatchLayer(
                    layer.id,
                    layer.kind === "text"
                      ? ({ text: { ...layer.text, binding: e.target.value || undefined } } as Partial<Layer>)
                      : ({ field: { ...layer.field, binding: e.target.value } } as Partial<Layer>),
                  )
                }
              />
            </Field>
            <Field label={tp("fallback")}>
              <Input
                type="text"
                value={layer.kind === "text" ? (layer.text.fallback ?? "") : (layer.field.fallback ?? "")}
                disabled={disabled}
                onChange={(e) =>
                  onPatchLayer(
                    layer.id,
                    layer.kind === "text"
                      ? ({ text: { ...layer.text, fallback: e.target.value || undefined } } as Partial<Layer>)
                      : ({ field: { ...layer.field, fallback: e.target.value || undefined } } as Partial<Layer>),
                  )
                }
              />
            </Field>
          </InspectorSection>
        </>
      ) : null}

      {layer.kind === "image" && onFocal ? (
        <InspectorSection title={t("sections.image")}>
          <ImageSection layer={layer} locked={locked} canEdit={canEdit} onPatchLayer={onPatchLayer} onFocal={onFocal} preset={focalPreset} />
        </InspectorSection>
      ) : null}

      {/* ★ DEC-093: DEMOTED, NEVER DELETED. These numbers are SC 2.5.7's
          conformance path for move, resize and rotate — whatever the canvas
          learns to drag, and however the panel is tidied. */}
      <InspectorSection title={t("sections.position")} defaultOpen={false}>
        <p className="text-body-sm text-fg-muted">{t("positionNote")}</p>
        <div className="grid grid-cols-2 gap-3">
          {number(tp("x"), frame.x, (n) => setFrame("x", n))}
          {number(tp("y"), frame.y, (n) => setFrame("y", n))}
          {number(tp("w"), frame.w, (n) => setFrame("w", Math.max(1, n)), 1, 1)}
          {number(tp("h"), frame.h, (n) => setFrame("h", Math.max(1, n)), 1, 1)}
          {number(tp("rotation"), frame.rotation ?? 0, (n) => setFrame("rotation", n))}
          {number(tp("opacity"), layer.opacity ?? 1, (n) => onPatchLayer(layer.id, { opacity: Math.min(1, Math.max(0, n)) }), 0.05, 0)}
        </div>
      </InspectorSection>
    </div>
  );
}

/**
 * The document's background — solid or DEC-127's gradient, in brand tokens
 * only. The angle is the RTL source's; the renderer mirrors it for LTR, so
 * nothing here ever writes a mirrored angle.
 */
function BackgroundControl({ document: doc, canEdit, onDocument }: { document: DesignDocument; canEdit: boolean; onDocument: (next: DesignDocument) => void }) {
  const t = useTranslations("designer.inspector.background");
  const bg = doc.background ?? { type: "solid" as const, color: bind("canvas") };

  const tokenSelect = (label: string, value: string, onValue: (next: string) => void) => {
    const current = token(value);
    return (
      <Field label={label}>
        <Select value={current ?? value} disabled={!canEdit} onChange={(e) => onValue(bind(e.target.value))}>
          {/* A legacy colour that is not a token stays visible as what it is,
              so the admin can see it and replace it — never silently lost. */}
          {current === null ? <option value={value}>{value}</option> : null}
          {BRAND_COLOUR_TOKENS.map((name) => (
            <option key={name} value={name}>
              {t(`tokens.${name}`)}
            </option>
          ))}
        </Select>
      </Field>
    );
  };

  const setType = (type: string) => {
    if (type === bg.type) return;
    if (type === "gradient") {
      const from = bg.type === "solid" ? bg.color : bind("surface");
      onDocument({ ...doc, background: { type: "gradient", angle: 140, stops: [{ color: from }, { color: bind("canvasRaise") }] } });
    } else {
      const first = bg.type === "gradient" ? (bg.stops[0]?.color ?? bind("canvas")) : bind("canvas");
      onDocument({ ...doc, background: { type: "solid", color: first } });
    }
  };

  return (
    <>
      <Field label={t("type")}>
        <Select value={bg.type} disabled={!canEdit} onChange={(e) => setType(e.target.value)}>
          <option value="solid">{t("solid")}</option>
          <option value="gradient">{t("gradient")}</option>
        </Select>
      </Field>
      {bg.type === "solid"
        ? tokenSelect(t("colour"), bg.color, (color) => onDocument({ ...doc, background: { type: "solid", color } }))
        : (
            <>
              {tokenSelect(t("from"), bg.stops[0]?.color ?? bind("surface"), (color) =>
                onDocument({ ...doc, background: { ...bg, stops: [{ ...bg.stops[0], color }, ...bg.stops.slice(1)] } }),
              )}
              {tokenSelect(t("to"), bg.stops[bg.stops.length - 1]?.color ?? bind("canvasRaise"), (color) =>
                onDocument({ ...doc, background: { ...bg, stops: [...bg.stops.slice(0, -1), { ...bg.stops[bg.stops.length - 1], color }] } }),
              )}
              <Field label={t("angle")} hint={t("angleHint")}>
                <Input
                  type="number"
                  inputMode="numeric"
                  dir="ltr"
                  min={0}
                  max={360}
                  step={1}
                  value={bg.angle}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 0 && n <= 360) onDocument({ ...doc, background: { ...bg, angle: Math.round(n) } });
                  }}
                />
              </Field>
            </>
          )}
      <p className="text-body-sm text-fg-muted">{t("tokenNote")}</p>
    </>
  );
}

/**
 * Two or more layers (wave 13, REQ-DSG-028): align and distribute, PROMINENT —
 * they are conformance, not a convenience (DEC-093) — on the DOCUMENT's axis
 * (DEC-096), against the safe area, the page or the selection itself. The
 * numbers are one layer's, so they say how to reach them rather than vanish.
 */
function GroupSection({
  selection,
  lockedLayerIds,
  canEdit,
  onGroupArrange,
}: {
  selection: Layer[];
  lockedLayerIds: string[];
  canEdit: boolean;
  onGroupArrange: (op: GroupOp) => void;
}) {
  const t = useTranslations("designer.inspector");
  const tl = useTranslations("designer.layers");
  const [target, setTarget] = useState<GroupAlignTarget>("selection");
  const movable = selection.filter((l) => !lockedLayerIds.includes(l.id));
  const disabled = !canEdit || movable.length === 0;
  const edge = (axis: AlignAxis, value: AlignEdge, label: string) => (
    <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onGroupArrange({ kind: "align", axis, edge: value, target })}>
      {label}
    </Button>
  );

  return (
    <div className="flex flex-col">
      <p className="pb-3 text-body-sm text-fg-heading">{tl("selectedCount", { count: selection.length, value: formatNumber(selection.length) })}</p>
      <InspectorSection title={t("sections.group")}>
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="text-label text-fg-heading">{t("align.target")}</legend>
          <div className="flex flex-wrap gap-2">
            {(["selection", "safe", "page"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={target === value ? "primary" : "secondary"}
                aria-pressed={target === value}
                disabled={disabled}
                onClick={() => setTarget(value)}
              >
                {value === "selection" ? t("group.selection") : t(`align.${value}`)}
              </Button>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="text-label text-fg-heading">{t("align.inline")}</legend>
          <div className="flex flex-wrap gap-2">
            {edge("inline", "start", t("align.start"))}
            {edge("inline", "center", t("align.center"))}
            {edge("inline", "end", t("align.end"))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="text-label text-fg-heading">{t("align.block")}</legend>
          <div className="flex flex-wrap gap-2">
            {edge("block", "start", t("align.top"))}
            {edge("block", "center", t("align.middle"))}
            {edge("block", "end", t("align.bottom"))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="text-label text-fg-heading">{t("group.distribute")}</legend>
          <div className="flex flex-wrap gap-2">
            {(["inline", "block"] as const).map((axis) => (
              <Button
                key={axis}
                type="button"
                variant="secondary"
                size="sm"
                disabled={!canEdit || movable.length < 3}
                onClick={() => onGroupArrange({ kind: "distribute", axis })}
              >
                {t(axis === "inline" ? "group.distributeInline" : "group.distributeBlock")}
              </Button>
            ))}
          </div>
          <p className="text-body-sm text-fg-muted">{t("group.distributeNote")}</p>
        </fieldset>
        <p className="text-body-sm text-fg-muted">{t("align.note")}</p>
        {movable.length < selection.length ? <p className="text-body-sm text-fg-muted">{t("group.lockedSkipped")}</p> : null}
      </InspectorSection>
      <p className="pt-3 text-body-sm text-fg-muted">{t("group.numbersNote")}</p>
    </div>
  );
}

const FOCAL_NAMES = ["topLeft", "top", "topRight", "left", "centre", "right", "bottomLeft", "bottom", "bottomRight"] as const;

/**
 * An image layer: its fit, and its focal point (REQ-DSG-030, DEC-093 path 3).
 *
 * ★ THE NINE-POINT GRID ALONE IS SUFFICIENT — nine 44 px radios, each a tap.
 * The dot on the thumbnail refines it; it is the enhancement, never the path.
 * The grid is laid out LEFT TO RIGHT in any console, because `object-position`
 * is physical: its top-left radio is the image's top-left corner. Its names
 * say left and right for the same reason.
 *
 * The point only shows under «تملأ الإطار» (`cover`): an image drawn whole
 * inside its frame is never cropped, so there the section says so rather than
 * offering a control with no visible effect.
 */
function ImageSection({
  layer,
  locked,
  canEdit,
  onPatchLayer,
  onFocal,
  preset,
}: {
  layer: ImageLayer;
  locked: boolean;
  canEdit: boolean;
  onPatchLayer: (layerId: string, patch: Partial<Layer>) => void;
  onFocal: (layerId: string, point: FocalPoint, preset?: PresetName) => void;
  preset?: PresetName;
}) {
  const t = useTranslations("designer.inspector.image");
  const fit = layer.image.fit ?? "contain";
  const point = focalOf(layer, preset);
  const name = useId();

  return (
    <>
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-label text-fg-heading">{t("fit")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["contain", "cover"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={fit === value ? "primary" : "secondary"}
              aria-pressed={fit === value}
              disabled={locked || !canEdit}
              onClick={() => onPatchLayer(layer.id, { image: { ...layer.image, fit: value } } as Partial<Layer>)}
            >
              {t(value)}
            </Button>
          ))}
        </div>
      </fieldset>

      {fit !== "cover" ? (
        <p className="text-body-sm text-fg-muted">{t("focalContainNote")}</p>
      ) : (
        <fieldset className="flex flex-col gap-3 border-0 p-0">
          <legend className="text-label text-fg-heading">{t("focal")}</legend>
          <p className="text-body-sm text-fg-muted">{t(preset ? "focalPresetNote" : "focalNote")}</p>
          {/* Physical on purpose — see the comment above. */}
          <div role="radiogroup" aria-label={t("focal")} dir="ltr" className="grid w-fit grid-cols-3 gap-1">
            {FOCAL_GRID.map((p, i) => {
              const checked = Math.abs(point.x - p.x) < 0.005 && Math.abs(point.y - p.y) < 0.005;
              return (
                <button
                  key={`${name}-${i}`}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={t(`points.${FOCAL_NAMES[i] ?? "centre"}`)}
                  disabled={!canEdit}
                  onClick={() => onFocal(layer.id, p, preset)}
                  className={`flex size-11 items-center justify-center rounded-field border ${checked ? "border-edge-strong bg-silver-100" : "border-edge hover:border-edge-strong"}`}
                >
                  <span aria-hidden="true" className={`block rounded-full ${checked ? "size-3 bg-fg-heading" : "size-1.5 bg-fg-muted"}`} />
                </button>
              );
            })}
          </div>
          <p className="text-body-sm text-fg-muted">
            {t.rich("current", { x: formatNumber(Math.round(point.x * 100)), y: formatNumber(Math.round(point.y * 100)), bdi: (c) => <bdi>{c}</bdi> })}
          </p>
        </fieldset>
      )}
    </>
  );
}
