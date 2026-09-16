import type { Page } from "puppeteer-core";
import {
  autoFitCandidates,
  autoFitRequest,
  checkTierA,
  compareTierA,
  derive,
  describeTierA,
  INK_REFERENCE_CSS,
  inkedRatio,
  measureTextBatch,
  pickAutoFit,
  PRESETS,
  renderDocumentToHtml,
  resolveText,
  tierASignatureBatch,
  type DesignDocument,
  type Layer,
  type MeasureRequest,
  type PresetName,
  type TextMetrics,
  type TierAExpectation,
  type TierASignature,
} from "@kareem/designer-runtime";
import { withPage } from "./chromium.js";
import type { WorkerFace } from "./fonts.js";

// One export, end to end — REQ-DSG-011 … REQ-DSG-014, 06 §6.2, DEC-017.
//
//   derive for the preset → auto-fit against the real text → lay out →
//   TIER A → capture → hand back the bytes.
//
// Tier A sits BEFORE the capture is returned and a failure throws, so a
// mismatch fails the export rather than shipping it (11 §2.5). That ordering
// is the requirement: an artifact that reached storage and was then found
// wrong is an artifact someone has already downloaded.

export type ExportFormat = "png" | "webp" | "pdf" | "jpeg";

export interface RenderRequest {
  document: DesignDocument;
  preset: PresetName;
  format: ExportFormat;
  bindings: Record<string, string>;
  faces: WorkerFace[];
  /** The Tier A signature the previous render of this exact fingerprint
   *  produced, when there is one. Same source, same geometry — a difference
   *  means something outside the fingerprint moved (06 §9.1). */
  previousSignature?: TierASignature | null;
  /** JPEG only if the org enabled it (A29, `org_settings.allow_jpeg_export`);
   *  the caller has already checked, this is the quality to use. */
  jpegQuality?: number;
}

export interface RenderResult {
  bytes: Uint8Array;
  contentType: string;
  widthPx: number;
  heightPx: number;
  signature: TierASignature;
  /** What auto-fit settled on, per layer — stored so the next render of the
   *  same fingerprint can be compared against it. */
  expectations: TierAExpectation[];
}

const CONTENT_TYPE: Record<ExportFormat, string> = {
  png: "image/png",
  webp: "image/webp",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
};

/** A capture with almost no ink is the failure mode that produced two blank
 *  goldens before it was understood: `font-display: block` hid the glyphs
 *  while the metrics still resolved, so everything measured fine and the
 *  image was empty (DEC-024). Hard failure, never a warning. */
const MIN_INK_RATIO = 0.001;

function textLayers(doc: DesignDocument): Layer[] {
  return doc.layers.filter((l) => !l.hidden && (l.kind === "text" || l.kind === "dynamic_field"));
}

function textOf(layer: Layer, bindings: Record<string, string>): string {
  const spec =
    layer.kind === "text"
      ? { binding: layer.text.binding, literal: layer.text.literal, fallback: layer.text.fallback }
      : layer.kind === "dynamic_field"
        ? { binding: layer.field.binding, fallback: layer.field.fallback }
        : {};
  return resolveText({ values: bindings }, spec).text;
}

/**
 * Auto-fit every text layer, in one round-trip per layer.
 *
 * The DECISION is the runtime's pure `pickAutoFit`; only the MEASUREMENT
 * happens in the page, through the same self-contained probe the editor
 * calls. That is what makes the fitted size the same integer here and in the
 * editor — and the fitted size is one of the things Tier A compares exactly
 * (06 §9.3).
 */
async function applyAutoFit(page: Page, doc: DesignDocument, bindings: Record<string, string>): Promise<{ document: DesignDocument; expectations: TierAExpectation[] }> {
  const expectations: TierAExpectation[] = [];
  const layers: Layer[] = [];

  for (const layer of doc.layers) {
    if (layer.hidden || (layer.kind !== "text" && layer.kind !== "dynamic_field")) {
      layers.push(layer);
      continue;
    }
    const input = { text: textOf(layer, bindings), frame: layer.frame, font: layer.font, ...(layer.autoFit ? { autoFit: layer.autoFit } : {}), direction: doc.direction };
    const candidates = autoFitCandidates(input);
    const requests: MeasureRequest[] = candidates.map((size) => autoFitRequest(input, size));
    // One evaluate for every candidate size of this layer: sixty round-trips
    // over the devtools bridge would be sixty times the latency for the same
    // answer, and the search is identical because the candidate LIST is.
    const metrics = (await page.evaluate(measureTextBatch, requests)) as TextMetrics[];
    const fit = pickAutoFit(input, candidates, metrics);

    layers.push({ ...layer, font: { ...layer.font, size: fit.size } } as Layer);
    expectations.push({ layerId: layer.id, fittedSize: fit.size, lines: fit.lines });
  }

  return { document: { ...doc, layers }, expectations };
}

export async function renderVariant(request: RenderRequest): Promise<RenderResult> {
  const preset = PRESETS[request.preset];
  const derived = derive(request.document, request.preset);

  return withPage(preset.width, preset.height, async (page) => {
    // Pass 1: an empty page carrying only the faces, so the measurement the
    // auto-fit search depends on is made against the real bytes. Measuring
    // before the faces are usable measures a fallback, and every number after
    // that is wrong in a way nothing downstream notices.
    const shell = renderDocumentToHtml({ ...derived, layers: [] }, { fonts: request.faces });
    await page.setContent(shell, { waitUntil: "load" });
    await assertFacesUsable(page, request.faces);

    const { document: fitted, expectations } = await applyAutoFit(page, derived, request.bindings);

    // Pass 2: the real document at the fitted sizes.
    const html = renderDocumentToHtml(fitted, { fonts: request.faces, bindings: { values: request.bindings } });
    await page.setContent(html, { waitUntil: "load" });
    await assertFacesUsable(page, request.faces);

    const signature = (await page.evaluate(
      tierASignatureBatch,
      textLayers(fitted).map((l) => l.id),
    )) as TierASignature;

    // ★ Tier A, before anything is returned. A mismatch FAILS the export.
    const failures = [...checkTierA(signature, expectations), ...(request.previousSignature ? compareTierA(request.previousSignature, signature) : [])];
    if (failures.length) throw new Error(`tier_a: ${describeTierA(failures)}`);

    const bytes = await capture(page, request, preset.width, preset.height);

    return {
      bytes,
      contentType: CONTENT_TYPE[request.format],
      widthPx: preset.width,
      heightPx: preset.height,
      signature,
      expectations,
    };
  });
}

/** `document.fonts.ready` alone is not enough: a face declared but never
 *  exercised is not "pending", so ready resolves while the glyphs are still
 *  unpainted. Load each family explicitly, then assert it is usable for
 *  ARABIC — `check()` against a Latin string passes on a face with no Arabic
 *  coverage at all, which is the exact font that renders Latin perfectly and
 *  breaks lam-alef (06 §7.2). */
async function assertFacesUsable(page: Page, faces: readonly WorkerFace[]): Promise<void> {
  const families = [...new Set(faces.map((f) => f.family))];
  if (!families.length) return;
  const unusable = await page.evaluate(async (list: string[]) => {
    const bad: string[] = [];
    for (const family of list) {
      await Promise.all([400, 500, 600].map((w) => document.fonts.load(`${w} 40px "${family}"`)));
    }
    await document.fonts.ready;
    for (const family of list) {
      if (!document.fonts.check(`40px "${family}"`, "لا")) bad.push(family);
    }
    return bad;
  }, families);
  if (unusable.length) throw new Error(`render: these faces never became usable for Arabic: ${unusable.join(", ")}`);
}

async function capture(page: Page, request: RenderRequest, width: number, height: number): Promise<Uint8Array> {
  if (request.format === "pdf") {
    // Print emulation CHANGES LINE BREAKING, so it is applied before the
    // capture and after Tier A measured the screen layout — which is why the
    // parity suite measures the PDF path under print emulation separately
    // (REQ-DSG-015's four paths).
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      width: `${width}px`,
      height: `${height}px`,
      printBackground: true,
      // The document already carries its own bleed and safe margins in its
      // geometry (06 §5); a second margin here would inset them again.
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: false,
    });
    return new Uint8Array(pdf);
  }

  const shot = await page.screenshot({
    type: request.format === "jpeg" ? "jpeg" : request.format === "webp" ? "webp" : "png",
    ...(request.format === "jpeg" ? { quality: request.jpegQuality ?? 82 } : {}),
    encoding: "base64",
    captureBeyondViewport: false,
  });
  const base64 = typeof shot === "string" ? shot : Buffer.from(shot).toString("base64");

  // Only a PNG can be measured by the ink probe without re-encoding; a WebP
  // or JPEG of the same page is the same pixels, so the PNG check stands for
  // all three and the extra capture is cheap next to a 30-second A3.
  if (request.format === "png") {
    // ★ Measured against the page's OWN background, captured after the
    // artifact with every layer hidden. Against white, a dark poster
    // (DEC-125) is 100% ink whether or not its text painted, and the guard
    // that caught two blank goldens would pass a blank export.
    await page.addStyleTag({ content: INK_REFERENCE_CSS });
    const reference = await page.screenshot({ type: "png", encoding: "base64", captureBeyondViewport: false });
    const ratio = (await page.evaluate(inkedRatio, {
      capture: base64,
      reference: typeof reference === "string" ? reference : Buffer.from(reference).toString("base64"),
    })) as number;
    if (ratio < MIN_INK_RATIO) {
      throw new Error(`render: the capture is blank (${(ratio * 100).toFixed(3)}% inked) — an empty artifact passes every later check`);
    }
  }

  return new Uint8Array(Buffer.from(base64, "base64"));
}
