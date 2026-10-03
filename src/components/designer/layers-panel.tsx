"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { paintOrder, type DesignDocument, type Layer, type ReorderMove } from "@kareem/designer-runtime";
import { formatNumber } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { LayerList } from "@/components/ui/layer-list";
import { AddImage } from "@/components/designer/add-image";

// SCR-057's الطبقات panel — REQ-DSG-024, REQ-DSG-028, DEC-093 paths 2 and 5, DEC-178, DEC-235 §5.1.
//
// Written from the kept-behaviour table in `docs/plan/notes/designer.md` (wave 23, slice 2) when
// `designer/layer-list.tsx` was deleted: the rows are `ui/layer-list`'s, drawn front-of-the-stack first — the order
// the renderer paints, read backwards — and this panel keeps what is the designer's own: the count, «تحديد متعدّد» and
// «اختر كل طبقات» (more than one layer without a marquee — shift-click needs a keyboard, so on a tablet it is not a
// single-pointer path), and, until the rebuilt chrome moves it to العناصر and الملفات, «أضف».

export interface LayersPanelProps {
  document: DesignDocument;
  selectedLayerId: string | null;
  onSelect: (layerId: string, options?: { additive?: boolean }) => void;
  onToggleHidden: (layerId: string) => void;
  onReorder: (layerId: string, move: ReorderMove) => void;
  lockedLayerIds: string[];
  canEdit: boolean;
  /** The whole selection, when it can be more than one layer. */
  selectedLayerIds?: string[];
  /** «تحديد متعدّد» is on: each tap adds or removes (DEC-178's tap path). */
  multi?: boolean;
  onToggleMulti?: () => void;
  /** «اختر كل طبقات هذا النوع» (DEC-093 path 5). */
  onSelectKind?: (kind: Layer["kind"]) => void;
  /** D1b — «أضف»: text, shape, the org's logo (DEC-178). */
  onAdd?: (kind: "text" | "shape" | "logo") => void;
  /** D1b's uploaded image (DEC-179). */
  onAddImage?: (asset: { assetId: string; width: number; height: number; previewUrl: string | null }) => void;
}

export function LayersPanel({
  document: doc,
  selectedLayerId,
  onSelect,
  onToggleHidden,
  onReorder,
  lockedLayerIds,
  canEdit,
  selectedLayerIds,
  multi = false,
  onToggleMulti,
  onSelectKind,
  onAdd,
  onAddImage,
}: LayersPanelProps) {
  const t = useTranslations("designer.layers");
  const to = useTranslations("designer.inspector.order");
  const ta = useTranslations("designer.add");
  const base = useId();

  const layers = paintOrder(doc).reverse();
  const chosen = selectedLayerIds ?? (selectedLayerId ? [selectedLayerId] : []);
  const kinds = [...new Set(doc.layers.filter((l) => !l.hidden).map((l) => l.kind))];

  return (
    <div className="flex flex-col gap-3">
      {onAdd ? (
        <section aria-labelledby={`${base}-add`} className="flex flex-col gap-2 border-b border-edge pb-4">
          <h3 id={`${base}-add`} className="text-label text-fg-heading">
            {ta("heading")}
          </h3>
          <div className="flex flex-wrap gap-2">
            {(["text", "shape", "logo"] as const).map((kind) => (
              <Button key={kind} type="button" variant="secondary" size="sm" iconStart={<PlusIcon />} onClick={() => onAdd(kind)}>
                {ta(kind)}
              </Button>
            ))}
            {onAddImage ? <AddImage onAdded={onAddImage} /> : null}
          </div>
          <p className="text-body-sm text-fg-muted">{ta("hint")}</p>
        </section>
      ) : null}

      <p className="text-body-sm text-fg-muted">
        {t("count", { count: layers.length, value: formatNumber(layers.length) })}
        {layers.length > 1 && canEdit ? ` · ${t("orderHint")}` : ""}
      </p>

      {onToggleMulti && layers.length > 1 ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant={multi ? "primary" : "secondary"} aria-pressed={multi} onClick={onToggleMulti}>
              {t("multi")}
            </Button>
            {chosen.length > 1 ? (
              <span className="text-body-sm text-fg-heading" role="status">
                {t("selectedCount", { count: chosen.length, value: formatNumber(chosen.length) })}
              </span>
            ) : null}
          </div>
          {multi ? <p className="text-body-sm text-fg-muted">{t("multiHint")}</p> : null}
          {onSelectKind ? (
            <div className="flex flex-wrap gap-2">
              {kinds.map((kind) => (
                <Button key={kind} type="button" size="sm" variant="ghost" onClick={() => onSelectKind(kind)}>
                  {t.rich("selectKind", { kind: t(`kind.${kind}`), bdi: (c) => <bdi>{c}</bdi> })}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <LayerList
        label={t("heading")}
        items={layers.map((layer) => ({
          id: layer.id,
          name: layer.name ?? layer.id,
          kindLabel: t(`kind.${layer.kind}`),
          selected: chosen.includes(layer.id),
          locked: lockedLayerIds.includes(layer.id),
          hidden: layer.hidden === true,
        }))}
        multi={multi}
        onSelect={(id, { additive }) => onSelect(id, { additive })}
        {...(canEdit ? { onMove: (id: string, move: "forward" | "backward") => onReorder(id, move), onToggleHidden } : {})}
        labels={{
          forward: to("forward"),
          backward: to("backward"),
          show: t("show"),
          hide: t("hide"),
          locked: t("locked"),
          hidden: t("hidden"),
          empty: t("empty"),
          handle: t("handle"),
        }}
      />
    </div>
  );
}
