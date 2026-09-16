"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  allSafeAreaViolations,
  computeAutoFit,
  derive,
  domTextMeasurer,
  ppiFindings,
  presetsFor,
  resolveText,
  type AutoFitWarning,
  type DesignDocument,
  type PresetName,
} from "@kareem/designer-runtime";
import { formatNumber } from "@/components/sessions/numerals";
import { Button } from "@/components/ui/button";

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

export interface CheckInputs {
  document: DesignDocument;
  bindings: Record<string, string>;
  /** Set once the canvas's faces are usable; measuring before that measures a
   *  fallback face, and every number would be wrong. */
  fontsReady: boolean;
  /** Each image layer's intrinsic pixel size, for the PPI guard
   *  (REQ-DSG-019). Keyed by LAYER id: the same logo in two frames has two
   *  answers. */
  assetSizes: Record<string, { width: number; height: number }>;
}

export interface ChecksPanelProps {
  findings: CheckFinding[];
  /** True until the faces are usable; measuring before that measures a
   *  fallback face. */
  measuring: boolean;
  /** ★ REQ-DSG-029: «clicking a failed check moves the selection to the layer
   *  that failed it». A check that does not point at its layer is a riddle. */
  onGoTo?: (finding: CheckFinding) => void;
  /** Layer id → its name in the layer list. */
  layerNames?: Record<string, string>;
}

export type CheckFinding =
  | { kind: "safeArea"; preset: PresetName; layerId: string; overflowPx: number }
  | { kind: "ppi"; preset: PresetName; layerId: string; ppi: number; severity: "warn" | "block" }
  | { kind: AutoFitWarning; preset: PresetName; layerId: string };

type Finding = CheckFinding;

/**
 * The findings, computed once for the whole editor. A HOOK, not the panel's
 * own state: the checks badge and the variant strip's dots need the list
 * whether or not the checks panel is the tab on screen, and a tab that is not
 * shown is unmounted — so a panel that measured for itself would leave the
 * badge reading zero exactly when nobody is looking at the list.
 */
export function useCheckFindings({ document: doc, bindings, fontsReady, assetSizes }: CheckInputs): { findings: CheckFinding[]; measuring: boolean } {
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

  // REQ-DSG-019, and it needs no measurement either: the asset's pixel count
  // against the frame's physical size is arithmetic.
  const ppi = useMemo<Finding[]>(
    () => ppiFindings(doc, assetSizes).map((f) => ({ kind: "ppi" as const, preset: f.preset, layerId: f.layerId, ppi: f.ppi, severity: f.severity })),
    [doc, assetSizes],
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

  const findings = useMemo(() => [...safeFindings, ...ppi, ...fitFindings], [safeFindings, ppi, fitFindings]);
  return { findings, measuring: !fontsReady };
}

/** One line per (check, layer): the same overflow on seven presets is one
 *  problem with seven places, not seven problems — a list of thirteen near-
 *  identical rows buried the one that mattered at 390 px (seen on the capture). */
interface FindingGroup {
  key: string;
  first: CheckFinding;
  presets: PresetName[];
  overflowPx: number;
  ppi: number;
}

function group(findings: CheckFinding[]): FindingGroup[] {
  const groups = new Map<string, FindingGroup>();
  for (const f of findings) {
    const key = `${f.kind}|${f.layerId}|${f.kind === "ppi" ? f.severity : ""}`;
    const g = groups.get(key) ?? { key, first: f, presets: [], overflowPx: 0, ppi: Number.POSITIVE_INFINITY };
    if (!g.presets.includes(f.preset)) g.presets.push(f.preset);
    if (f.kind === "safeArea") g.overflowPx = Math.max(g.overflowPx, f.overflowPx);
    if (f.kind === "ppi") g.ppi = Math.min(g.ppi, f.ppi);
    groups.set(key, g);
  }
  return [...groups.values()];
}

export function ChecksPanel({ findings, measuring, onGoTo, layerNames = {} }: ChecksPanelProps) {
  const t = useTranslations("designer.checks");
  const tp = useTranslations("designer.presets");
  const blocked = findings.some((f) => f.kind === "ppi" && f.severity === "block");
  const groups = useMemo(() => group(findings), [findings]);

  if (measuring && findings.length === 0) return <p className="text-body-sm text-fg-muted">{t("measuring")}</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-fg-muted">{t("intro")}</p>
      {findings.length === 0 ? (
        <p className="text-body-sm text-fg-heading">{t("clean")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.map((g) => {
            const f = g.first;
            // The layer's own name where it has one — «المكان», not «l_where».
            const layer = layerNames[f.layerId] ?? f.layerId;
            const preset = g.presets.map((p) => tp(`name.${p}`)).join("، ");
            return (
              <li key={g.key} className="flex flex-col gap-2 rounded-field border border-edge-strong p-3 text-body-sm text-fg-heading">
                <p>
                  {f.kind === "ppi"
                    ? t.rich(f.severity === "block" ? "ppiBlock" : "ppiWarn", { layer, preset, ppi: formatNumber(g.ppi), bdi: (c) => <bdi>{c}</bdi> })
                    : f.kind === "safeArea"
                      ? t.rich("safeArea", { layer, preset, px: formatNumber(g.overflowPx), bdi: (c) => <bdi>{c}</bdi> })
                      : t.rich(f.kind === "min_size_reached" ? "minSize" : "maxLines", { layer, preset, bdi: (c) => <bdi>{c}</bdi> })}
                </p>
                {onGoTo ? (
                  <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => onGoTo(f)}>
                    {t("goToLayer")}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {blocked ? <p className="text-body-sm text-fg-muted">{t("ppiHint")}</p> : null}
    </div>
  );
}
