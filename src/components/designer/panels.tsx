"use client";

import { useTranslations } from "next-intl";
import { BRAND_COLOUR_TOKENS, DESIGN_COLOUR_NAMES, fieldUsage, resolveColour, type DesignDocument, type NewLayerKind, type NewLayerOptions } from "@kareem/designer-runtime";
import { Button } from "@/components/ui/button";
import { BindingsPanel } from "@/components/designer/bindings-panel";
import { AddImage } from "@/components/designer/add-image";
import { formatNumber } from "@/components/sessions/numerals";
import { bindPath } from "@/components/designer/inspector-ops";

// SCR-057's four adding panels — العناصر · الحقول · الملفات · الهوية — written from `AdminDesignerElements.dc.html` and
// `AdminDesigner.dc.html` (wave 23, REQ-UIX-110, DEC-238 §3).
//
// ★ A TAP IS THE PATH (DEC-093, SC 2.5.7). Every tile is a button: a tap adds its layer inside the safe area at the
// document's start edge, selects it and arms «ضع بنقرة», so the next tap on the canvas places it. Nothing here needs a
// drag; a drag onto the canvas, where one is built, is the enhancement.
//
// No objects or stickers tabs (DEC-238 §3): the house objects exist only as raster files under `docs/` and as React
// components the console's register forbids, and a template layer needs an asset the worker can fetch. A certificate
// takes no object anyway (REQ-DSG-026).

export type AddFromPanel = (kind: NewLayerKind, options: NewLayerOptions) => void;

const tile =
  "h-auto flex min-h-16 flex-col items-center justify-center gap-1 p-2 text-caption text-fg-heading";

/** العناصر — the basic layers and four text styles. */
export function ElementsPanel({ purpose, onAdd, disabled }: { purpose: DesignDocument["purpose"]; onAdd: AddFromPanel; disabled: boolean }) {
  const t = useTranslations("designer.studio.elements");
  const tf = useTranslations("designer.bindings.field");
  const basics: { key: string; kind: NewLayerKind; options: NewLayerOptions }[] = [
    { key: "heading", kind: "text", options: { name: t("heading"), literal: t("heading"), fontSize: 96 } },
    { key: "text", kind: "text", options: { name: t("text") } },
    { key: "rect", kind: "shape", options: { name: t("rect"), shape: "rect" } },
    { key: "circle", kind: "shape", options: { name: t("circle"), shape: "ellipse" } },
    { key: "line", kind: "shape", options: { name: t("line"), shape: "line" } },
    {
      key: "qr",
      kind: "qr",
      // The QR the purpose needs — the event page on a poster (REQ-DSG-023), the one /verify route on a certificate
      // (REQ-CRT-010) — both URLs the runtime's resolver builds.
      options: { name: purpose === "certificate" ? tf("certificate.verifyUrl") : tf("session.eventUrl"), binding: purpose === "certificate" ? "certificate.verifyUrl" : "session.eventUrl" },
    },
    { key: "logo", kind: "logo", options: { name: t("logo") } },
  ];
  const styles: { key: string; size: number }[] = [
    { key: "styleTitle", size: 96 },
    { key: "styleSubtitle", size: 64 },
    { key: "styleBody", size: 40 },
    { key: "styleLabel", size: 28 },
  ];
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-label text-fg-muted">{t("basic")}</h3>
        <div className="grid grid-cols-3 gap-2">
          {basics.map((b) => (
            <Button variant="secondary" size="sm" key={b.key} type="button" className={tile} disabled={disabled} onClick={() => onAdd(b.kind, b.options)}>
              {t(b.key)}
            </Button>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-label text-fg-muted">{t("styles")}</h3>
        {styles.map((s) => (
          <Button variant="secondary" size="sm"
            key={s.key}
            type="button"
            disabled={disabled}
            onClick={() => onAdd("text", { name: t(s.key), literal: t(s.key), fontSize: s.size })}
            className="min-h-11 px-3 py-2 text-start text-fg-heading"
          >
            {t(s.key)}
          </Button>
        ))}
      </section>
    </div>
  );
}

/** الحقول — the registry's fields for the document, each «مستخدم» or not, and the values the preview binds. */
export function FieldsPanel({
  document: doc,
  family,
  onAdd,
  disabled,
  declared,
  values,
  fallbacks,
  layerNames,
}: {
  document: DesignDocument;
  family: string | null;
  onAdd: AddFromPanel;
  disabled: boolean;
  declared: string[];
  values: Record<string, string>;
  fallbacks: Record<string, string>;
  layerNames: Record<string, string>;
}) {
  const t = useTranslations("designer.studio.fields");
  const tf = useTranslations("designer.bindings");
  const name = (binding: string) => (tf.has(`field.${binding}`) ? tf(`field.${binding}`) : binding);
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1.5">
        {fieldUsage(doc, family).map(({ field, used }) => (
          <li key={field.binding}>
            <Button variant="secondary" size="sm"
              type="button"
              disabled={disabled}
              onClick={() => onAdd(field.layer, { name: `{${name(field.binding)}}`, binding: field.binding, fallback: name(field.binding) })}
              className="min-h-11 w-full px-3 text-start [&>span]:flex [&>span]:w-full [&>span]:items-center [&>span]:justify-between [&>span]:gap-3"
            >
              <span className="text-body-sm text-fg-heading">
                <bdi>{`{${name(field.binding)}}`}</bdi>
              </span>
              <span className="text-caption text-fg-muted">{used ? t("used") : (<><span aria-hidden="true">—</span><span className="sr-only">{t("unused")}</span></>)}</span>
            </Button>
          </li>
        ))}
      </ul>
      <section className="flex flex-col gap-2 border-t border-edge pt-3">
        <h3 className="text-label text-fg-muted">{t("values")}</h3>
        <BindingsPanel declared={declared} values={values} fallbacks={fallbacks} layerNames={layerNames} />
      </section>
    </div>
  );
}

export interface PanelAsset {
  assetId: string;
  width: number;
  height: number;
  previewUrl: string | null;
}

/** الملفات — upload (the one flow, never SVG) and the org's images; a tap adds one at its own proportion. */
export function UploadsPanel({ assets, onAdd, disabled }: { assets: PanelAsset[]; onAdd: (asset: PanelAsset) => void; disabled: boolean }) {
  const t = useTranslations("designer.studio.uploads");
  return (
    <div className="flex flex-col gap-4">
      {disabled ? null : <AddImage onAdded={onAdd} />}
      {assets.length === 0 ? (
        <p className="text-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {assets.map((a) => (
            <li key={a.assetId}>
              <Button variant="secondary" size="sm" type="button" disabled={disabled} onClick={() => onAdd(a)} className={tile}>
                {a.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a five-minute signed preview; nothing for next/image to optimise
                  <img src={a.previewUrl} alt="" className="h-14 w-full object-contain" loading="lazy" />
                ) : null}
                <span className="sr-only">{t.rich("imageOf", { width: formatNumber(a.width), height: formatNumber(a.height), bdi: (c) => <bdi>{c}</bdi> })}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** الهوية — the brand kit's colour tokens by name (a tap applies one to the selected layer), the faces, the logo. */
export function BrandPanel({
  values,
  fontFamilies,
  onApply,
  canApply,
  onAddLogo,
  disabled,
}: {
  values: Record<string, string>;
  fontFamilies: string[];
  onApply: (token: string) => void;
  canApply: boolean;
  onAddLogo: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("designer.studio.brand");
  const tb = useTranslations("designer.inspector.background");
  const tk = useTranslations("designer.inspector.background.tokens");
  const td = useTranslations("designer.inspector.background.designTokens");
  // ★ Two groups, because there are two namespaces (wave 24's re-colour): the
  //   org's kit, which an org overrides, and the design's own constants, which
  //   it cannot. Without the second a baseline poster's ground is a colour the
  //   studio can show but not re-apply after «انسخ لتعدّل».
  const swatches = (
    heading: string,
    names: readonly string[],
    path: (name: string) => string,
    label: (name: string) => string,
  ) => (
    <section className="flex flex-col gap-2">
      <h3 className="text-label text-fg-muted">{heading}</h3>
      <ul className="grid grid-cols-2 gap-1.5">
        {names.map((name) => (
          <li key={name}>
            <Button variant="secondary" size="sm"
              type="button"
              disabled={disabled || !canApply}
              onClick={() => onApply(bindPath(path(name)))}
              aria-label={t("apply", { name: label(name) })}
              className="flex min-h-11 w-full items-center gap-2 px-2 text-start text-caption text-fg-heading"
            >
              {/* The swatch is the RESOLVED value, painted from data as a style — never a class.
                  Through the runtime, so a `design.*` constant — which is in no render
                  context, by construction — paints as itself rather than as nothing. */}
              <span aria-hidden="true" className="size-4 shrink-0 rounded-sm border border-edge" style={{ background: resolveColour({ values }, bindPath(path(name)), "transparent") }} />
              {label(name)}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <div className="flex flex-col gap-4">
      {swatches(tb("groups.brand"), BRAND_COLOUR_TOKENS, (n) => `brand.${n}`, (n) => tk(n))}
      {swatches(tb("groups.design"), DESIGN_COLOUR_NAMES, (n) => `design.${n}`, (n) => td(n))}
      <section className="flex flex-col gap-2">
        <h3 className="text-label text-fg-muted">{t("fonts")}</h3>
        <ul className="flex flex-col gap-1 text-body-sm text-fg-heading">
          {fontFamilies.map((family) => (
            <li key={family}>
              <bdi>{family}</bdi>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-label text-fg-muted">{t("logo")}</h3>
        <Button variant="secondary" size="sm" type="button" disabled={disabled} onClick={onAddLogo} className={tile}>
          {t("logo")}
        </Button>
      </section>
    </div>
  );
}
