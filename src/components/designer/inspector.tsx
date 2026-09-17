"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  BRAND_COLOUR_TOKENS,
  type AlignAxis,
  type AlignEdge,
  type AlignTarget,
  type DesignDocument,
  type Layer,
  type ReorderMove,
} from "@kareem/designer-runtime";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { InspectorSection } from "@/components/designer/inspector-section";

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

export interface InspectorProps {
  document: DesignDocument;
  layer: Layer | null;
  locked: boolean;
  canEdit: boolean;
  fontFamilies: string[];
  onPatchLayer: (layerId: string, patch: Partial<Layer>) => void;
  onArrange: (layerId: string, op: ArrangeOp) => void;
  onDocument: (next: DesignDocument) => void;
}

const token = (value: string | undefined): string | null => /^\{\{\s*brand\.([A-Za-z]+)\s*\}\}$/.exec(value ?? "")?.[1] ?? null;
const bind = (name: string) => `{{brand.${name}}}`;

export function Inspector({ document: doc, layer, locked, canEdit, fontFamilies, onPatchLayer, onArrange, onDocument }: InspectorProps) {
  const t = useTranslations("designer.inspector");
  const tp = useTranslations("designer.properties");
  const [target, setTarget] = useState<AlignTarget>("safe");

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
        <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => onArrange(layer.id, { kind: "fit" })} className="self-start">
          {t("align.fit")}
        </Button>
        <p className="text-body-sm text-fg-muted">{t("align.note")}</p>
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
