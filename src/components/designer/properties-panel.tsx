"use client";

import { useTranslations } from "next-intl";
import type { DesignDocument, Layer } from "@kareem/designer-runtime";

// SCR-057's properties panel — RTL-first (06 §10), REQ-DSG-005.
//
// Three rules this panel keeps, each of them a way Arabic breaks quietly:
//
//   · letter-spacing is not editable. A30: spacing Arabic breaks the cursive
//     join, so the result is a BROKEN word rather than a loose one, and the
//     field says so instead of offering a control nobody should touch.
//   · alignment is start / centre / end, never left / right (06 §2.2). A
//     template written with physical alignment has to be redrawn for English.
//   · a locked layer's fields are disabled and explained. The database
//     refuses the write too (REQ-DSG-024); this is the half that tells the
//     admin why, which a 23514 never would.
//
// Frames are numeric here. Dragging, snapping, alignment guides and undo are
// REQ-DSG-022 and land with STORY-DSG-010; numbers are what DSG-003 needs and
// they are also the only thing that is exact.

export interface PropertiesPanelProps {
  document: DesignDocument;
  layer: Layer | null;
  locked: boolean;
  canEdit: boolean;
  onChange: (layerId: string, patch: Partial<Layer>) => void;
  fontFamilies: string[];
}

const field = "mt-1 block h-11 w-full rounded-field border border-edge-strong bg-canvas px-3 text-body text-fg-heading disabled:opacity-40";

export function PropertiesPanel({ layer, locked, canEdit, onChange, fontFamilies }: PropertiesPanelProps) {
  const t = useTranslations("designer.properties");

  if (!layer) return <p className="text-body-sm text-fg-muted">{t("none")}</p>;

  const disabled = locked || !canEdit;
  const frame = layer.frame;

  const setFrame = (key: "x" | "y" | "w" | "h" | "rotation", value: number) =>
    onChange(layer.id, { frame: { ...frame, [key]: value } } as Partial<Layer>);

  const number = (label: string, value: number, onValue: (n: number) => void, step = 1, min?: number) => (
    <label className="block">
      <span className="text-body-sm text-fg-body">{label}</span>
      <input
        type="number"
        className={field}
        value={Number.isFinite(value) ? value : 0}
        step={step}
        {...(min !== undefined ? { min } : {})}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onValue(n);
        }}
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-5">
      {locked ? (
        <p role="note" className="rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
          {t("lockedNotice")}
        </p>
      ) : null}

      <section aria-labelledby="dr-props-position" className="flex flex-col gap-3">
        <h3 id="dr-props-position" className="text-body font-medium text-fg-heading">
          {t("positionHeading")}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {number(t("x"), frame.x, (n) => setFrame("x", n))}
          {number(t("y"), frame.y, (n) => setFrame("y", n))}
          {number(t("w"), frame.w, (n) => setFrame("w", Math.max(1, n)), 1, 1)}
          {number(t("h"), frame.h, (n) => setFrame("h", Math.max(1, n)), 1, 1)}
          {number(t("rotation"), frame.rotation ?? 0, (n) => setFrame("rotation", n))}
          {number(t("opacity"), layer.opacity ?? 1, (n) => onChange(layer.id, { opacity: Math.min(1, Math.max(0, n)) }), 0.05, 0)}
        </div>
      </section>

      {layer.kind === "text" || layer.kind === "dynamic_field" ? (
        <>
          <section aria-labelledby="dr-props-type" className="flex flex-col gap-3">
            <h3 id="dr-props-type" className="text-body font-medium text-fg-heading">
              {t("typographyHeading")}
            </h3>

            <label className="block">
              <span className="text-body-sm text-fg-body">{t("fontFamily")}</span>
              <select
                className={field}
                value={layer.font.family}
                disabled={disabled}
                onChange={(e) => onChange(layer.id, { font: { ...layer.font, family: e.target.value } } as Partial<Layer>)}
              >
                {(fontFamilies.includes(layer.font.family) ? fontFamilies : [layer.font.family, ...fontFamilies]).map((family) => (
                  <option key={family} value={family}>
                    {family}
                  </option>
                ))}
              </select>
            </label>

            {number(
              t("fontSize"),
              layer.font.size,
              (n) => onChange(layer.id, { font: { ...layer.font, size: Math.max(1, n) } } as Partial<Layer>),
              1,
              1,
            )}

            <fieldset className="border-0 p-0">
              <legend className="text-body-sm text-fg-body">{t("align")}</legend>
              <div className="mt-1 flex gap-2">
                {(["start", "center", "end"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={disabled}
                    aria-pressed={(layer.align ?? "start") === value}
                    onClick={() => onChange(layer.id, { align: value } as Partial<Layer>)}
                    className={`h-11 flex-1 rounded-field border px-3 text-body-sm disabled:opacity-40 ${
                      (layer.align ?? "start") === value ? "border-edge-strong bg-silver-100 text-fg-heading" : "border-edge text-fg-body"
                    }`}
                  >
                    {t(value === "start" ? "alignStart" : value === "center" ? "alignCenter" : "alignEnd")}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-body-sm text-fg-muted">{t("alignNote")}</p>
            </fieldset>

            <p className="text-body-sm text-fg-muted">{t("letterSpacingNote")}</p>
          </section>

          <section aria-labelledby="dr-props-content" className="flex flex-col gap-3">
            <h3 id="dr-props-content" className="text-body font-medium text-fg-heading">
              {t("contentHeading")}
            </h3>
            <label className="block">
              <span className="text-body-sm text-fg-body">{t("binding")}</span>
              <input
                type="text"
                dir="ltr"
                className={field}
                value={layer.kind === "text" ? (layer.text.binding ?? "") : layer.field.binding}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    layer.id,
                    layer.kind === "text"
                      ? ({ text: { ...layer.text, binding: e.target.value || undefined } } as Partial<Layer>)
                      : ({ field: { ...layer.field, binding: e.target.value } } as Partial<Layer>),
                  )
                }
              />
            </label>
            <label className="block">
              <span className="text-body-sm text-fg-body">{t("fallback")}</span>
              <input
                type="text"
                className={field}
                value={layer.kind === "text" ? (layer.text.fallback ?? "") : (layer.field.fallback ?? "")}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    layer.id,
                    layer.kind === "text"
                      ? ({ text: { ...layer.text, fallback: e.target.value || undefined } } as Partial<Layer>)
                      : ({ field: { ...layer.field, fallback: e.target.value || undefined } } as Partial<Layer>),
                  )
                }
              />
            </label>
          </section>
        </>
      ) : null}
    </div>
  );
}
