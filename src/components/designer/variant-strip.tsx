"use client";

import { useTranslations } from "next-intl";
import { PRESETS, type PresetName } from "@kareem/designer-runtime";
import { formatNumber } from "@/components/sessions/numerals";
import { DotIcon } from "@/components/ui/icons";

// SCR-057's variant strip — REQ-DSG-029, `16` §10.2.
//
// Every preset the document exports at, one tap to put it on the canvas, and a
// dot where a check fails in THAT preset — «a variant is inspectable before
// export, not discovered at export».
//
// ★ The thumbnail is the worker's own render when one is ready (DEC-017: the
// preview an admin approves is the artifact), never a second live render in a
// small iframe. Until a variant is exported the tile shows its proportions and
// its size, which is what an admin needs to recognise it.
//
// The row scrolls inside itself; it never widens a 390 px page.

export interface VariantStripProps {
  presets: PresetName[];
  current: PresetName;
  onSelect: (preset: PresetName) => void;
  /** Presets with at least one open check. */
  flagged: ReadonlySet<PresetName>;
  /** Signed URLs of READY PNG exports, by preset. */
  previews: Partial<Record<PresetName, string>>;
}

export function VariantStrip({ presets, current, onSelect, flagged, previews }: VariantStripProps) {
  const t = useTranslations("designer.presets");

  return (
    <nav aria-label={t("stripLabel")} className="min-w-0">
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {presets.map((name) => {
          const preset = PRESETS[name];
          const selected = name === current;
          // Tile height fixed; width follows the preset's own proportion, so
          // a story reads tall and an OG card reads wide at a glance.
          const width = Math.round((56 * preset.width) / preset.height);
          const preview = previews[name];
          return (
            <li key={name} className="shrink-0">
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(name)}
                className={`flex min-h-11 flex-col items-center gap-1.5 rounded-field border p-2 ${
                  selected ? "border-edge-strong bg-silver-100" : "border-edge hover:border-edge-strong"
                }`}
              >
                <span className="relative block overflow-hidden rounded-sm border border-edge bg-navy-900" style={{ width, height: 56 }}>
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived export URL; nothing for next/image to optimise
                    <img src={preview} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : null}
                  {flagged.has(name) ? (
                    <span className="absolute -top-0.5 end-0.5 text-[0.625rem] text-error" aria-hidden="true">
                      <DotIcon />
                    </span>
                  ) : null}
                </span>
                <span className="text-caption text-fg-heading">
                  <bdi>{t(`name.${name}`)}</bdi>
                </span>
                <span className="text-caption text-fg-muted">
                  <bdi dir="ltr">
                    {formatNumber(preset.width)} × {formatNumber(preset.height)}
                  </bdi>
                </span>
                {flagged.has(name) ? <span className="sr-only">{t("hasFinding")}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
