"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { DesignDocument, Layer, PresetName } from "@kareem/designer-runtime";
import { derive, fontFaceCss, PRESETS, presetsFor, validateDocument } from "@kareem/designer-runtime";
import type { NumeralSystem } from "@/components/sessions/numerals";
import { DesignerCanvas } from "@/components/designer/canvas";
import { LayerList } from "@/components/designer/layer-list";
import { PropertiesPanel } from "@/components/designer/properties-panel";
import { BindingsPanel } from "@/components/designer/bindings-panel";
import { ChecksPanel } from "@/components/designer/checks-panel";
import { formatNumber } from "@/components/sessions/numerals";

// SCR-057 — the shared designer. REQ-DSG-004, REQ-DSG-005, REQ-DSG-006.
//
// ONE ENGINE (D54). There is no poster branch and no certificate branch in
// this component: a certificate document is a document whose `purpose` is
// `certificate` and whose bindings resolve from a certificate row. That is
// what «a change to the layer model applies to both without a branch» means
// in code, and it is why this file has no `if (purpose === …)` in it.
//
// AUTOSAVE IS A ROUTE HANDLER, NOT A SERVER ACTION (06 §10, `04` §4.2): layer
// trees exceed the 1 MB action body cap, and Server Actions dispatch one at a
// time per client — a queued save behind a slow one is an editor that feels
// broken. A PUT is also cancellable, which a debounced editor wants.
//
// MOBILE IS VIEW AND APPROVE, NOT EDIT (09, SCR-057). The layer chrome is
// hidden below the editor breakpoint rather than reflowed: a layer editor at
// 390 px is a bad tool pretending to be a feature, and shipping one invites
// an admin to do precise work with no precision available.

export interface DesignerEditorProps {
  documentId: string;
  purpose: "poster" | "certificate";
  initialDocument: DesignDocument;
  initialUpdatedAt: string;
  bindings: Record<string, string>;
  declaredBindings: string[];
  faces: Array<{ family: string; weight: number; style: string; sha256: string; unicodeRange?: string }>;
  lockedLayerIds: string[];
  canEdit: boolean;
  numerals: NumeralSystem;
  origin: string;
  /** Each image layer's intrinsic pixel size, for the PPI guard. */
  assetSizes: Record<string, { width: number; height: number }>;
}

type SaveState =
  | { kind: "clean" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error" }
  | { kind: "conflict" }
  | { kind: "forbidden" }
  | { kind: "locked"; layerId: string }
  | { kind: "invalid"; issue: string };

/** Long enough that typing in a number field is one save, short enough that
 *  closing the tab a second after a change does not lose it. */
const AUTOSAVE_DELAY_MS = 1200;

export function DesignerEditor(props: DesignerEditorProps) {
  const t = useTranslations("designer.editor");
  const ts = useTranslations("designer.save");
  const tb = useTranslations("designer.bindings");
  const tl = useTranslations("designer.layers");
  const tp = useTranslations("designer.properties");
  const tpr = useTranslations("designer.presets");
  const tc = useTranslations("designer.checks");

  const [document, setDocument] = useState<DesignDocument>(props.initialDocument);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "clean" });
  const presets = useMemo(() => presetsFor(props.purpose), [props.purpose]);
  const [preset, setPreset] = useState<PresetName>(() => presetsFor(props.purpose)[0] ?? "master");
  // On by default for print, where crossing a safe area is expensive and the
  // blade is not negotiable (06 §10).
  const [overlays, setOverlays] = useState(() => PRESETS[presetsFor(props.purpose)[0] ?? "master"].bleed > 0);
  const [fontsReady, setFontsReady] = useState(false);
  const baseUpdatedAt = useRef(props.initialUpdatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const placeholderLabel = useCallback((binding: string) => tb("value", { value: `‹ ${binding} ›` }), [tb]);

  // The SAME faces the canvas loads, declared in this document too, because
  // the pre-export checks measure here (checks-panel.tsx). Measuring against
  // a fallback face would produce a warning list that disagrees with the
  // export — worse than no list. The family names are the manifest's plain
  // ones; next/font emits hashed names for the app's own type, so nothing
  // collides.
  const faceCss = useMemo(
    () => fontFaceCss(props.faces.map((f) => ({ ...f, url: `${props.origin}/api/fonts/${f.sha256}` }))),
    [props.faces, props.origin],
  );

  useEffect(() => {
    let cancelled = false;
    const families = [...new Set(props.faces.map((f) => f.family))];
    // `document.fonts.ready` alone is not enough: a face declared but never
    // exercised is not "pending", so ready resolves while the glyphs are
    // still unloaded (DEC-024). Load each family explicitly first.
    void Promise.all(families.map((family) => window.document.fonts.load(`400 40px "${family}"`)))
      .then(() => window.document.fonts.ready)
      .then(() => {
        if (!cancelled) setFontsReady(true);
      })
      .catch(() => {
        if (!cancelled) setFontsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [props.faces]);

  const push = useCallback(
    async (next: DesignDocument) => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setSave({ kind: "saving" });
      try {
        const response = await fetch(`/api/designer/${props.documentId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseUpdatedAt: baseUpdatedAt.current, document: next }),
          signal: controller.signal,
        });
        const body = (await response.json()) as { status?: string; updatedAt?: string; layerId?: string; issues?: { path: string; code: string }[] };
        if (response.ok && body.updatedAt) {
          baseUpdatedAt.current = body.updatedAt;
          setSave({ kind: "saved" });
          return;
        }
        if (response.status === 409 && body.status === "locked_region") return setSave({ kind: "locked", layerId: body.layerId ?? "" });
        if (response.status === 409) return setSave({ kind: "conflict" });
        if (response.status === 403) return setSave({ kind: "forbidden" });
        if (response.status === 422) {
          const first = body.issues?.[0];
          return setSave({ kind: "invalid", issue: first ? `${first.path} — ${first.code}` : "" });
        }
        setSave({ kind: "error" });
      } catch (e) {
        // An aborted request is the NEXT keystroke's save, not a failure.
        if ((e as Error).name !== "AbortError") setSave({ kind: "error" });
      }
    },
    [props.documentId],
  );

  const mutate = useCallback(
    (next: DesignDocument) => {
      // Validated in the browser too, so a bad edit is refused at the field
      // rather than round-tripping to a 422. The Route Handler runs the same
      // function — this is a courtesy, never the boundary.
      const parsed = validateDocument(next);
      if (!parsed.ok) {
        const first = parsed.issues[0];
        setSave({ kind: "invalid", issue: first ? `${first.path} — ${first.code}` : "" });
        return;
      }
      setDocument(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void push(next), AUTOSAVE_DELAY_MS);
    },
    [push],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      inFlight.current?.abort();
    },
    [],
  );

  const patchLayer = useCallback(
    (layerId: string, patch: Partial<Layer>) => {
      if (props.lockedLayerIds.includes(layerId)) return setSave({ kind: "locked", layerId });
      mutate({ ...document, layers: document.layers.map((l) => (l.id === layerId ? ({ ...l, ...patch } as Layer) : l)) });
    },
    [document, mutate, props.lockedLayerIds],
  );

  const toggleHidden = useCallback(
    (layerId: string) => {
      if (props.lockedLayerIds.includes(layerId)) return setSave({ kind: "locked", layerId });
      mutate({ ...document, layers: document.layers.map((l) => (l.id === layerId ? { ...l, hidden: !l.hidden } : l)) });
    },
    [document, mutate, props.lockedLayerIds],
  );

  const selected = useMemo(() => document.layers.find((l) => l.id === selectedLayerId) ?? null, [document.layers, selectedLayerId]);
  const fontFamilies = useMemo(() => [...new Set(props.faces.map((f) => f.family))], [props.faces]);

  const status = (() => {
    switch (save.kind) {
      case "saving":
        return { tone: "muted" as const, node: ts("saving") };
      case "saved":
        return { tone: "muted" as const, node: ts("saved") };
      case "conflict":
        return { tone: "alert" as const, node: ts("conflict") };
      case "forbidden":
        return { tone: "alert" as const, node: ts("forbidden") };
      case "locked":
        return { tone: "alert" as const, node: ts.rich("lockedRegion", { layer: save.layerId, bdi: (c) => <bdi>{c}</bdi> }) };
      case "invalid":
        return { tone: "alert" as const, node: ts.rich("invalid", { issue: save.issue, bdi: (c) => <bdi dir="ltr">{c}</bdi> }) };
      case "error":
        return { tone: "alert" as const, node: ts("error") };
      default:
        return null;
    }
  })();

  // What the canvas shows IS the derived variant, not the master with a
  // label — REQ-DSG-009's «no manual step» is only true if the editor
  // exercises the same derivation the export will.
  const shown = useMemo(() => derive(document, preset), [document, preset]);

  const presetTabs = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {presets.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={name === preset}
            onClick={() => {
              setPreset(name);
              setOverlays(PRESETS[name].bleed > 0);
            }}
            className={`h-11 rounded-field border px-3 text-body-sm ${
              name === preset ? "border-edge-strong bg-silver-100 text-fg-heading" : "border-edge text-fg-body"
            }`}
          >
            <bdi>{tpr(`name.${name}`)}</bdi>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOverlays((v) => !v)} className="h-11 rounded-field border border-edge px-3 text-body-sm text-fg-body">
          {overlays ? tpr("overlaysHide") : tpr("overlaysShow")}
        </button>
        <p className="text-body-sm text-fg-muted">
          {tpr.rich("size", {
            width: formatNumber(PRESETS[preset].width, props.numerals),
            height: formatNumber(PRESETS[preset].height, props.numerals),
            bdi: (c) => <bdi>{c}</bdi>,
          })}
        </p>
        {PRESETS[preset].bleed > 0 ? <p className="text-body-sm text-fg-muted">{tpr("bleedHint")}</p> : null}
      </div>
    </div>
  );

  const canvas = (
    <DesignerCanvas
      document={shown}
      preset={preset}
      showOverlays={overlays}
      bindings={props.bindings}
      faces={props.faces}
      origin={props.origin}
      selectedLayerId={selectedLayerId}
      onSelect={setSelectedLayerId}
      lockedLayerIds={props.lockedLayerIds}
      numerals={props.numerals}
      placeholderLabel={placeholderLabel}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {/* eslint-disable-next-line react/no-danger -- generated by the runtime's
          own fontFaceCss() from the manifest; no user input reaches it, and
          the family names are escaped there. */}
      <style dangerouslySetInnerHTML={{ __html: faceCss }} />
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-body-sm text-fg-muted">{t(`purpose.${props.purpose}`)}</p>
        {status ? (
          <p
            role={status.tone === "alert" ? "alert" : "status"}
            className={`text-body-sm ${status.tone === "alert" ? "rounded-field border border-edge-strong px-3 py-2 text-fg-heading" : "text-fg-muted"}`}
          >
            {status.node}
          </p>
        ) : null}
        {!props.canEdit ? (
          <p role="status" className="text-body-sm text-fg-muted">
            {t("readOnly")}
          </p>
        ) : null}
      </div>

      {/* Mobile: view and approve. One canvas, the dynamic fields, and the
          note that says why the editor is not here. */}
      <div className="flex flex-col gap-6 xl:hidden">
        <p className="rounded-field border border-edge bg-silver-100 p-3 text-body-sm text-fg-body">{t("mobileNotice")}</p>
        {presetTabs}
        {canvas}
        <section aria-labelledby="dr-checks-m" className="flex flex-col gap-3">
          <h2 id="dr-checks-m" className="text-body font-medium text-fg-heading">
            {tc("heading")}
          </h2>
          <ChecksPanel document={document} bindings={props.bindings} numerals={props.numerals} fontsReady={fontsReady} assetSizes={props.assetSizes} />
        </section>
        <section aria-labelledby="dr-bindings-m" className="flex flex-col gap-3">
          <h2 id="dr-bindings-m" className="text-body font-medium text-fg-heading">
            {tb("heading")}
          </h2>
          <BindingsPanel declared={props.declaredBindings} values={props.bindings} />
        </section>
      </div>

      {/* Desktop: the full editor. Composed for RTL — the layer list sits at
          the start edge, the properties at the end, and both mirror with the
          document rather than being flipped by a toggle (06 §10). */}
      <div className="hidden gap-6 xl:grid xl:grid-cols-[18rem_minmax(0,1fr)_20rem]">
        <section aria-labelledby="dr-layers" className="flex flex-col gap-3">
          <h2 id="dr-layers" className="text-body font-medium text-fg-heading">
            {tl("heading")}
          </h2>
          <LayerList
            document={document}
            selectedLayerId={selectedLayerId}
            onSelect={setSelectedLayerId}
            onToggleHidden={toggleHidden}
            lockedLayerIds={props.lockedLayerIds}
            canEdit={props.canEdit}
            numerals={props.numerals}
          />
        </section>

        <section aria-labelledby="dr-canvas" className="flex min-w-0 flex-col gap-3">
          <h2 id="dr-canvas" className="text-body font-medium text-fg-heading">
            {t("previewHeading")}
          </h2>
          <p className="text-body-sm text-fg-muted">{t("realDataNote")}</p>
          {presetTabs}
          {canvas}
        </section>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="dr-props" className="flex flex-col gap-3">
            <h2 id="dr-props" className="text-body font-medium text-fg-heading">
              {tp("heading")}
            </h2>
            <PropertiesPanel
              document={document}
              layer={selected}
              locked={selected ? props.lockedLayerIds.includes(selected.id) : false}
              canEdit={props.canEdit}
              onChange={patchLayer}
              fontFamilies={fontFamilies}
            />
          </section>

          <section aria-labelledby="dr-bindings" className="flex flex-col gap-3">
            <h2 id="dr-bindings" className="text-body font-medium text-fg-heading">
              {tb("heading")}
            </h2>
            <BindingsPanel declared={props.declaredBindings} values={props.bindings} />
          </section>

          <section aria-labelledby="dr-checks" className="flex flex-col gap-3">
            <h2 id="dr-checks" className="text-body font-medium text-fg-heading">
              {tc("heading")}
            </h2>
            <ChecksPanel document={document} bindings={props.bindings} numerals={props.numerals} fontsReady={fontsReady} assetSizes={props.assetSizes} />
          </section>
        </div>
      </div>
    </div>
  );
}
