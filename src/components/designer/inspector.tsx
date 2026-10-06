"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
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
} from "@kareem/designer-runtime";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ChevronIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/components/sessions/numerals";
import { ColourControl } from "@/components/designer/colour-control";
import { bind, FOCAL_NAMES, focalChecked, nextBackground, type ArrangeOp, type GroupOp, type TransformOp } from "@/components/designer/inspector-ops";

export type { ArrangeOp, GroupOp, TransformOp };

// SCR-057's الطبقة panel — REQ-DSG-005, REQ-DSG-021, REQ-DSG-024, REQ-DSG-025, REQ-DSG-028, REQ-DSG-030, DEC-093,
// DEC-096, written from `AdminDesigner.dc.html` (wave 23, DEC-208): the layer's properties in tabs — النص · الموضع ·
// التأثيرات for a text or a field, الصورة · الموضع for an image, الشكل · الموضع for a shape, الرمز · الموضع for a QR.
// With nothing selected, the document's background; with two or more, the group's align and distribute.
//
// The rules this panel keeps, each a way the product breaks quietly (the kept-behaviour table, designer.md §W23.2):
//   · ★ the numeric X/Y/W/H/rotation fields are DEMOTED, never removed (DEC-093): «الموضع والحجم» opens closed,
//     under الموضع, beside the align, order and transform buttons that do the same job in one tap.
//   · ★ align operates on the DOCUMENT's axis (DEC-096): the buttons hand «start/centre/end» to the runtime, which
//     knows nothing of this screen's locale — an Arabic poster aligned from an English console stores the same bytes.
//   · a text's alignment is stored logically and LABELLED from the document's direction (يمين is start on an RTL page).
//   · letter-spacing is not editable (A30). ★ A colour may be ANY value (DEC-272, the owner, 2026-10-06): the brand
//     kit's colours — and the design's own — are one-tap swatches that stay linked as `{{brand.*}}` bindings, beside a
//     picker and a `#rrggbb` field that store the literal (`colour-control.tsx`).
//   · the binding is chosen by its Arabic name, never typed as a path (DEC-149 §4).

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
  selection?: Layer[];
  lockedLayerIds?: string[];
  onGroupArrange?: (op: GroupOp) => void;
  onTransform?: (layerId: string, op: TransformOp) => void;
  placing?: boolean;
  canPlace?: boolean;
  onFocal?: (layerId: string, point: FocalPoint, preset?: PresetName) => void;
  focalPreset?: PresetName;
  onDuplicate?: (layerId: string) => void;
  onDelete?: (layerId: string) => void;
  /* ── wave 23, optional ── */
  /** The bindings a field may choose, by path → its Arabic name. Without it the binding is shown, not chosen. */
  bindingChoices?: Record<string, string>;
  /** The tab on screen, when the editor drives it («{ } ربط» opens النص). */
  tab?: string;
  onTabChange?: (tab: string) => void;
  /* ── DEC-272, optional ── */
  /** The resolved brand values (`brand.canvas` → `#…`), so a brand swatch is painted the org's colour. */
  colourValues?: Record<string, string>;
}

type Tab = "text" | "position" | "effects" | "image" | "shape" | "qr";

function tabsOf(layer: Layer): Tab[] {
  switch (layer.kind) {
    case "text":
    case "dynamic_field":
      return ["text", "position", "effects"];
    case "image":
      return ["image", "position"];
    case "shape":
      return ["shape", "position", "effects"];
    default:
      return ["qr", "position"];
  }
}

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
  onDuplicate,
  onDelete,
  bindingChoices,
  tab,
  onTabChange,
  colourValues,
}: InspectorProps) {
  const t = useTranslations("designer.inspector");
  const tp = useTranslations("designer.properties");
  const ts = useTranslations("designer.studio.layer");
  const [target, setTarget] = useState<AlignTarget>("safe");
  const [ownTab, setOwnTab] = useState<string | null>(null);

  if (selection.length > 1 && onGroupArrange) {
    return <GroupSection selection={selection} lockedLayerIds={lockedLayerIds} canEdit={canEdit} onGroupArrange={onGroupArrange} />;
  }

  if (!layer) {
    return (
      <div className="flex flex-col">
        <p className="pb-3 text-body-sm text-fg-muted">{t("documentHint")}</p>
        <Section title={t("sections.background")}>
          <BackgroundControl document={doc} canEdit={canEdit} onDocument={onDocument} colourValues={colourValues} />
        </Section>
      </div>
    );
  }

  const tabs = tabsOf(layer);
  const requested = tab ?? ownTab;
  const current: Tab = requested && (tabs as string[]).includes(requested) ? (requested as Tab) : tabs[0]!;
  const choose = (next: string) => {
    setOwnTab(next);
    onTabChange?.(next);
  };

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

  // The text's alignment, named as the eye sees it on THIS document: start is the right edge of an RTL page.
  const alignLabel = (value: "start" | "center" | "end") =>
    value === "center" ? ts("alignMiddle") : (value === "start") === (doc.direction === "rtl") ? ts("alignRight") : ts("alignLeft");

  const textBody =
    layer.kind === "text" || layer.kind === "dynamic_field" ? (
      <div className="flex flex-col gap-4">
        <Field label={tp("binding")}>
          {bindingChoices ? (
            <Select
              value={layer.kind === "text" ? (layer.text.binding ?? "") : layer.field.binding}
              disabled={disabled}
              onChange={(e) =>
                onPatchLayer(
                  layer.id,
                  layer.kind === "text"
                    ? ({ text: { ...layer.text, binding: e.target.value || undefined } } as Partial<Layer>)
                    : ({ field: { ...layer.field, binding: e.target.value || layer.field.binding } } as Partial<Layer>),
                )
              }
            >
              {layer.kind === "text" ? <option value="">{tp("text")}</option> : null}
              {Object.entries(bindingChoices).map(([path, name]) => (
                <option key={path} value={path}>
                  {name}
                </option>
              ))}
              {(() => {
                const currentBinding = layer.kind === "text" ? layer.text.binding : layer.field.binding;
                return currentBinding && !bindingChoices[currentBinding] ? <option value={currentBinding}>{currentBinding}</option> : null;
              })()}
            </Select>
          ) : (
            <Input type="text" dir="ltr" value={layer.kind === "text" ? (layer.text.binding ?? "") : layer.field.binding} disabled readOnly />
          )}
        </Field>
        {layer.kind === "text" ? (
          // The layer's own words (D1b, «format the text»): what prints when nothing binds.
          <Field label={tp("text")} hint={tp("textHint")}>
            <Textarea
              value={layer.text.literal ?? ""}
              rows={3}
              disabled={disabled}
              onChange={(e) => onPatchLayer(layer.id, { text: { ...layer.text, literal: e.target.value } } as Partial<Layer>)}
            />
          </Field>
        ) : null}
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
        <Field label={tp("fontFamily")}>
          <Select value={layer.font.family} disabled={disabled} onChange={(e) => onPatchLayer(layer.id, { font: { ...layer.font, family: e.target.value } } as Partial<Layer>)}>
            {(fontFamilies.includes(layer.font.family) ? fontFamilies : [layer.font.family, ...fontFamilies]).map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tp("weight")}>
          <Select
            value={String(layer.font.weight ?? 400)}
            disabled={disabled}
            onChange={(e) => onPatchLayer(layer.id, { font: { ...layer.font, weight: Number(e.target.value) as 400 | 500 | 600 } } as Partial<Layer>)}
          >
            {([400, 500, 600] as const).map((w) => (
              <option key={w} value={w}>
                {tp(`weights.${w === 400 ? "regular" : w === 500 ? "medium" : "bold"}`)}
              </option>
            ))}
          </Select>
        </Field>
        {number(tp("fontSize"), layer.font.size, (n) => onPatchLayer(layer.id, { font: { ...layer.font, size: Math.max(1, n) } } as Partial<Layer>), 1, 1)}
        {/* ★ Any colour, the brand's as linked swatches (DEC-272; `0195` dropped the database's token-only guard). */}
        <ColourControl label={tp("colour")} value={layer.color ?? bind("fgHeading")} disabled={disabled} values={colourValues} onValue={(color) => onPatchLayer(layer.id, { color } as Partial<Layer>)} />
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
                {alignLabel(value)}
              </Button>
            ))}
          </div>
        </fieldset>
        {/* REQ-DSG-025: the auto-fit's line limit — in the model since M6, editable from wave 23. */}
        {number(ts("maxLines"), layer.autoFit?.maxLines ?? 0, (n) =>
          onPatchLayer(layer.id, { autoFit: { mode: "shrink-then-wrap", ...(n >= 1 ? { maxLines: Math.round(n) } : {}) } } as Partial<Layer>),
        1, 0)}
        <p className="text-body-sm text-fg-muted">{tp("letterSpacingNote")}</p>
      </div>
    ) : null;

  const positionBody = (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-label text-fg-heading">{t("align.target")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["safe", "page"] as const).map((value) => (
            <Button key={value} type="button" size="sm" variant={target === value ? "primary" : "secondary"} aria-pressed={target === value} disabled={disabled} onClick={() => setTarget(value)}>
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
      {onTransform ? (
        <>
          {/* ★ The taps for ROTATE and MOVE (DEC-093): the canvas's knob and drag are the enhancement, these the path. */}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onTransform(layer.id, { kind: "rotate", degrees: -15, mode: "by" })}>
              {t.rich("transform.rotateBack", { degrees: formatNumber(15), bdi: (c) => <bdi>{c}</bdi> })}
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onTransform(layer.id, { kind: "rotate", degrees: 15, mode: "by" })}>
              {t.rich("transform.rotateForward", { degrees: formatNumber(15), bdi: (c) => <bdi>{c}</bdi> })}
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={disabled || !frame.rotation} onClick={() => onTransform(layer.id, { kind: "rotate", degrees: 0, mode: "to" })}>
              {t("transform.rotateReset")}
            </Button>
          </div>
          {canPlace ? (
            <Button type="button" variant={placing ? "primary" : "secondary"} size="sm" aria-pressed={placing} disabled={disabled} onClick={() => onTransform(layer.id, { kind: "place" })} className="self-start">
              {placing ? t("transform.placeCancel") : t("transform.place")}
            </Button>
          ) : null}
        </>
      ) : null}
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-label text-fg-heading">{t("sections.order")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["forward", "backward", "front", "back"] as const).map((move) => (
            <Button key={move} type="button" variant="secondary" size="sm" disabled={!canEdit} onClick={() => onArrange(layer.id, { kind: "order", move })}>
              {t(`order.${move}`)}
            </Button>
          ))}
        </div>
      </fieldset>
      {/* ★ DEC-093: DEMOTED, NEVER DELETED. These numbers are SC 2.5.7's conformance path for move, resize and rotate. */}
      <Disclosure title={t("sections.position")}>
        <div className="grid grid-cols-2 gap-3">
          {number(tp("x"), frame.x, (n) => setFrame("x", n))}
          {number(tp("y"), frame.y, (n) => setFrame("y", n))}
          {number(tp("w"), frame.w, (n) => setFrame("w", Math.max(1, n)), 1, 1)}
          {number(tp("h"), frame.h, (n) => setFrame("h", Math.max(1, n)), 1, 1)}
          {number(tp("rotation"), frame.rotation ?? 0, (n) => setFrame("rotation", n))}
        </div>
      </Disclosure>
    </div>
  );

  const effectsBody = number(tp("opacity"), layer.opacity ?? 1, (n) => onPatchLayer(layer.id, { opacity: Math.min(1, Math.max(0, n)) }), 0.05, 0);

  const body =
    current === "text" ? textBody
    : current === "position" ? positionBody
    : current === "effects" ? effectsBody
    : current === "image" && layer.kind === "image" && onFocal ? <ImageSection layer={layer} locked={locked} canEdit={canEdit} onPatchLayer={onPatchLayer} onFocal={onFocal} preset={focalPreset} />
    : current === "shape" && layer.kind === "shape" ? (
      <ColourControl label={tp("fill")} value={layer.shape.fill ?? bind("surface")} disabled={disabled} values={colourValues} onValue={(fill) => onPatchLayer(layer.id, { shape: { ...layer.shape, fill } } as Partial<Layer>)} />
    )
    : current === "qr" && layer.kind === "qr" ? (
      <p className="text-body-sm text-fg-heading">
        {ts("qrTarget")} · <bdi>{bindingChoices?.[layer.qr.binding] ?? layer.qr.binding}</bdi>
      </p>
    )
    : null;

  return (
    <div className="flex flex-col gap-3">
      {locked ? (
        <Panel tone="info">
          <p role="note" className="text-body-sm text-fg-heading">
            {tp("lockedNotice")}
          </p>
        </Panel>
      ) : null}
      <Tabs label={ts("document")} items={tabs.map((value) => ({ value, label: ts(value) }))} value={current} onValueChange={choose}>
        {body}
      </Tabs>
      {onDuplicate && onDelete ? (
        // A locked layer's buttons are simply disabled: the note above already says why.
        <div className="flex flex-wrap gap-2 border-t border-edge pt-3">
          <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onDuplicate(layer.id)}>
            {t("layer.duplicate")}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onDelete(layer.id)}>
            {t("layer.delete")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** A titled group of controls, always open. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 pb-4">
      <h3 className="text-label text-fg-heading">{title}</h3>
      {children}
    </section>
  );
}

/**
 * «الموضع والحجم» — closed by default (DEC-093: demoted, never removed). A real `<button aria-expanded>` over the
 * region it controls, never a `<summary>`: Chromium exposes a `<summary>` as a disclosure triangle, and a spec
 * looking for the control by role waits thirty seconds for nothing (wave 3).
 */
function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const regionId = useId();
  return (
    <section className="border-t border-edge">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-2 py-2 text-start text-label text-fg-heading"
        >
          <span>{title}</span>
          <ChevronIcon direction={open ? "up" : "down"} className="text-fg-muted" />
        </button>
      </h3>
      <div id={regionId} hidden={!open} className="flex flex-col gap-4 pb-4">
        {children}
      </div>
    </section>
  );
}


/**
 * The document's background — solid or DEC-127's gradient, in any colour
 * (DEC-272), the brand's as linked swatches. The angle is the RTL source's; the renderer mirrors it for LTR, so
 * nothing here ever writes a mirrored angle.
 */
function BackgroundControl({
  document: doc,
  canEdit,
  onDocument,
  colourValues,
}: {
  document: DesignDocument;
  canEdit: boolean;
  onDocument: (next: DesignDocument) => void;
  colourValues?: Record<string, string>;
}) {
  const t = useTranslations("designer.inspector.background");
  const bg = doc.background ?? { type: "solid" as const, color: bind("canvas") };

  const colourControl = (label: string, value: string, onValue: (next: string) => void) => (
    <ColourControl label={label} value={value} disabled={!canEdit} values={colourValues} onValue={onValue} />
  );

  const setType = (type: string) => {
    const next = nextBackground(doc, type);
    if (next) onDocument(next);
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
        ? colourControl(t("colour"), bg.color, (color) => onDocument({ ...doc, background: { type: "solid", color } }))
        : (
            <>
              {colourControl(t("from"), bg.stops[0]?.color ?? bind("surface"), (color) =>
                onDocument({ ...doc, background: { ...bg, stops: [{ ...bg.stops[0], color }, ...bg.stops.slice(1)] } }),
              )}
              {colourControl(t("to"), bg.stops[bg.stops.length - 1]?.color ?? bind("canvasRaise"), (color) =>
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
      <Section title={t("sections.group")}>
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
      </Section>
      <p className="pt-3 text-body-sm text-fg-muted">{t("group.numbersNote")}</p>
    </div>
  );
}


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
              const checked = focalChecked(point, p);
              return (
                <button
                  key={`${name}-${i}`}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={t(`points.${FOCAL_NAMES[i] ?? "centre"}`)}
                  disabled={!canEdit}
                  onClick={() => onFocal(layer.id, p, preset)}
                  className={`flex size-11 items-center justify-center rounded-field border ${checked ? "border-edge-strong bg-raised" : "border-edge hover:border-edge-strong"}`}
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
