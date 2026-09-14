"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  allSafeAreaViolations,
  computeAutoFit,
  derive,
  domTextMeasurer,
  presetsFor,
  resolveText,
  type AutoFitWarning,
  type DesignDocument,
  type PresetName,
} from "@kareem/designer-runtime";
import { formatNumber, type NumeralSystem } from "@/components/sessions/numerals";

// «Content crossing a safe area is flagged BEFORE export, not after»
// (REQ-DSG-010), and a title that hit its floor and still overflows is
// reported rather than silently clipped (REQ-DSG-025).
//
// Both checks run over EVERY preset the document will be exported at, not
// only the one on screen. The whole failure this prevents is the admin who
// approves the master, exports seven variants, and finds out from a cramped
// link preview — or from two hundred printed A3s.
//
// The text measurement runs in THIS document, with the same faces the canvas
// loads and through the runtime's own `domTextMeasurer` — the same function
// the worker will call. Measuring with a different engine or different bytes
// would produce a warning list that disagrees with the export, which is worse
// than no list.

export interface ChecksPanelProps {
  document: DesignDocument;
  bindings: Record<string, string>;
  numerals: NumeralSystem;
  /** Set once the canvas's faces are usable; measuring before that measures a
   *  fallback face, and every number would be wrong. */
  fontsReady: boolean;
}

type Finding =
  | { kind: "safeArea"; preset: PresetName; layerId: string; overflowPx: number }
  | { kind: AutoFitWarning; preset: PresetName; layerId: string };

export function ChecksPanel({ document: doc, bindings, numerals, fontsReady }: ChecksPanelProps) {
  const t = useTranslations("designer.checks");
  const tp = useTranslations("designer.presets");
  const [fitFindings, setFitFindings] = useState<Finding[]>([]);

  // Geometry needs no measurement, so it is available immediately.
  const safeFindings = useMemo<Finding[]>(
    () =>
      allSafeAreaViolations(doc).map((v) => ({
        kind: "safeArea" as const,
        preset: v.preset,
        layerId: v.layerId,
        overflowPx: Math.max(...v.edges.map((e) => e.overflowPx)),
      })),
    [doc],
  );

  useEffect(() => {
    if (!fontsReady) return;
    let cancelled = false;
    const measure = domTextMeasurer(window.document, doc.direction);
    const found: Finding[] = [];

    // Yielded between presets rather than run in one pass. Nine presets times
    // the layers times up to sixty integer steps each is real work, and an
    // editor that stutters for a third of a second every time a number field
    // changes is an editor people stop trusting. Cancelled on the next edit,
    // so only the last document's findings ever reach the state.
    const run = async () => {
      for (const preset of presetsFor(doc.purpose)) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (cancelled) return;
        measurePreset(preset);
      }
      if (!cancelled) setFitFindings(found);
    };

    function measurePreset(preset: PresetName) {
      for (const layer of derive(doc, preset).layers) {
        if (layer.hidden) continue;
        if (layer.kind !== "text" && layer.kind !== "dynamic_field") continue;
        const spec =
          layer.kind === "text"
            ? { binding: layer.text.binding, literal: layer.text.literal, fallback: layer.text.fallback }
            : { binding: layer.field.binding, fallback: layer.field.fallback };
        // Measured against the REAL value, because that is what overflows —
        // Arabic runs ~1.2x the length of the Latin a designer often types in
        // while laying out, and a box that fits the sample overflows the
        // session (A30, 06 §2.4).
        const resolved = resolveText({ values: bindings }, spec);
        const result = computeAutoFit(
          { text: resolved.text, frame: layer.frame, font: layer.font, ...(layer.autoFit ? { autoFit: layer.autoFit } : {}) },
          measure,
        );
        if (!result.fits && result.warning) found.push({ kind: result.warning, preset, layerId: layer.id });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [doc, bindings, fontsReady]);

  const findings = [...safeFindings, ...fitFindings];

  if (!fontsReady && safeFindings.length === 0) return <p className="text-body-sm text-fg-muted">{t("measuring")}</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-fg-muted">{t("intro")}</p>
      {findings.length === 0 ? (
        <p className="text-body-sm text-fg-heading">{t("clean")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {findings.map((f, i) => (
            <li key={`${f.kind}-${f.preset}-${f.layerId}-${i}`} className="rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
              {f.kind === "safeArea"
                ? t.rich("safeArea", {
                    layer: f.layerId,
                    preset: tp(`name.${f.preset}`),
                    px: formatNumber(f.overflowPx, numerals),
                    bdi: (c) => <bdi>{c}</bdi>,
                  })
                : t.rich(f.kind === "min_size_reached" ? "minSize" : "maxLines", {
                    layer: f.layerId,
                    preset: tp(`name.${f.preset}`),
                    bdi: (c) => <bdi>{c}</bdi>,
                  })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
