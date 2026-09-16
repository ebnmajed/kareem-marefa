"use client";

import { useTranslations } from "next-intl";
import type { DesignDocument } from "@kareem/designer-runtime";
import { formatNumber } from "@/components/sessions/numerals";

// SCR-057's layer list — RTL-first (06 §10), top of the stack first.
//
// A locked layer is listed and readable, never omitted: an admin who cannot
// see the QR layer cannot understand why the certificate looks the way it
// does, and REQ-DSG-024 removes the ability to MOVE it, not the ability to
// know it is there.

export interface LayerListProps {
  document: DesignDocument;
  selectedLayerId: string | null;
  onSelect: (layerId: string) => void;
  onToggleHidden: (layerId: string) => void;
  lockedLayerIds: string[];
  canEdit: boolean;
}

export function LayerList({ document: doc, selectedLayerId, onSelect, onToggleHidden, lockedLayerIds, canEdit }: LayerListProps) {
  const t = useTranslations("designer.layers");

  // Highest z first: the list reads the way the canvas stacks, so "above" in
  // the list is "in front" on the page.
  const layers = [...doc.layers].sort((a, b) => (b.z ?? 0) - (a.z ?? 0));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-fg-muted">{t("count", { count: layers.length, value: formatNumber(layers.length) })}</p>

      {layers.length === 0 ? (
        <p className="text-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {layers.map((layer) => {
            const locked = lockedLayerIds.includes(layer.id);
            const selected = layer.id === selectedLayerId;
            const label = layer.name ?? layer.id;
            return (
              <li key={layer.id}>
                <div
                  className={`flex items-center gap-2 rounded-field border px-3 py-2 ${
                    selected ? "border-edge-strong bg-silver-100" : "border-edge"
                  }`}
                >
                  <button type="button" onClick={() => onSelect(layer.id)} aria-pressed={selected} className="min-w-0 flex-1 text-start">
                    <span className="block truncate text-body-sm text-fg-heading">
                      <bdi>{label}</bdi>
                    </span>
                    <span className="block text-body-sm text-fg-muted">
                      {t(`kind.${layer.kind}`)}
                      {locked ? ` · ${t("locked")}` : ""}
                      {layer.hidden ? ` · ${t("hidden")}` : ""}
                    </span>
                  </button>

                  {/* Hiding a locked layer is refused here AND by the
                      database (REQ-DSG-024) — a certificate whose QR was
                      hidden cannot be verified, and that only shows up after
                      it is printed. */}
                  <button
                    type="button"
                    onClick={() => onToggleHidden(layer.id)}
                    disabled={locked || !canEdit}
                    className="shrink-0 rounded-field border border-edge px-2 py-1 text-body-sm text-fg-body disabled:opacity-40"
                  >
                    {layer.hidden ? t("show") : t("hide")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
