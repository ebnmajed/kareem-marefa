"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { paintOrder, type DesignDocument, type ReorderMove } from "@kareem/designer-runtime";
import { formatNumber } from "@/components/sessions/numerals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ChevronIcon, EyeIcon, LockIcon } from "@/components/ui/icons";

// SCR-057's layer list — RTL-first (06 §10), the front of the stack first.
//
// A locked layer is listed and readable, never omitted: an admin who cannot
// see the QR layer cannot understand why the certificate looks the way it
// does, and REQ-DSG-024 removes the ability to MOVE it, not the ability to
// know it is there.
//
// ★ ▲ ▼ on every row are DEC-093's second path — reordering without a drag.
// They are named «one layer forward / back» and described by the row's own
// name (aria-describedby), because a list of twelve identical «forward»
// buttons with no object is not a list anyone can use by ear.

export interface LayerListProps {
  document: DesignDocument;
  selectedLayerId: string | null;
  onSelect: (layerId: string) => void;
  onToggleHidden: (layerId: string) => void;
  onReorder: (layerId: string, move: ReorderMove) => void;
  lockedLayerIds: string[];
  canEdit: boolean;
}

export function LayerList({ document: doc, selectedLayerId, onSelect, onToggleHidden, onReorder, lockedLayerIds, canEdit }: LayerListProps) {
  const t = useTranslations("designer.layers");
  const to = useTranslations("designer.inspector.order");
  const base = useId();

  // Front first: «above» in the list is «in front» on the page — the exact
  // order the renderer paints, read backwards.
  const layers = paintOrder(doc).reverse();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-fg-muted">
        {t("count", { count: layers.length, value: formatNumber(layers.length) })}
        {layers.length > 1 && canEdit ? ` · ${t("orderHint")}` : ""}
      </p>

      {layers.length === 0 ? (
        <p className="text-body-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {layers.map((layer, index) => {
            const locked = lockedLayerIds.includes(layer.id);
            const selected = layer.id === selectedLayerId;
            const nameId = `${base}-${layer.id}`;
            return (
              <li key={layer.id}>
                <div className={`flex items-center gap-1 rounded-field border px-2 py-1 ${selected ? "border-edge-strong bg-silver-100" : "border-edge"}`}>
                  <button type="button" onClick={() => onSelect(layer.id)} aria-pressed={selected} className="min-h-11 min-w-0 flex-1 px-1 text-start">
                    <span id={nameId} className="block text-body-sm text-fg-heading">
                      <bdi>{layer.name ?? layer.id}</bdi>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span className="text-caption text-fg-muted">{t(`kind.${layer.kind}`)}</span>
                      {locked ? (
                        <Badge size="sm" tone="info" icon={<LockIcon />}>
                          {t("locked")}
                        </Badge>
                      ) : null}
                      {layer.hidden ? (
                        <Badge size="sm" outline>
                          {t("hidden")}
                        </Badge>
                      ) : null}
                    </span>
                  </button>

                  {canEdit ? (
                    <>
                      <IconButton
                        size="sm"
                        label={to("forward")}
                        aria-describedby={nameId}
                        disabled={index === 0}
                        onClick={() => onReorder(layer.id, "forward")}
                      >
                        <ChevronIcon direction="up" />
                      </IconButton>
                      <IconButton
                        size="sm"
                        label={to("backward")}
                        aria-describedby={nameId}
                        disabled={index === layers.length - 1}
                        onClick={() => onReorder(layer.id, "backward")}
                      >
                        <ChevronIcon direction="down" />
                      </IconButton>
                    </>
                  ) : null}

                  {/* Hiding a locked layer is refused here AND by the database
                      (REQ-DSG-024) — a certificate whose QR was hidden cannot
                      be verified, and that only shows up after it is printed. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    iconStart={<EyeIcon />}
                    aria-describedby={nameId}
                    onClick={() => onToggleHidden(layer.id)}
                    disabled={locked || !canEdit}
                  >
                    {layer.hidden ? t("show") : t("hide")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
