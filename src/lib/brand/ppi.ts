// What a logo yields at A3 — SCR-059, REQ-DSG-019, REQ-DSG-021.
//
// DEC-009 made the org logo raster: an org must supply a high-resolution
// PNG/JPEG/WebP or the export pipeline's own PPI guard blocks it at print
// time (warn below 300 PPI at the layer's print frame, block below 200).
// This is the same threshold read BACKWARDS at upload time: "if this logo
// were used at full A3 bleed, what PPI would it be?" — a conservative,
// worst-case number (any smaller placement on a real template only
// improves it), computed once here so the upload Route Handler and the
// branding screen agree on one number rather than two roundings of it.
//
// No `server-only`: pure arithmetic, safe to import from the client-side
// upload widget for an instant readout before the server round-trip too.

/** A3, ISO 216, in millimetres. */
const A3_WIDTH_MM = 297;
const A3_HEIGHT_MM = 420;
const MM_PER_INCH = 25.4;

export type PpiRating = "sufficient" | "warning" | "insufficient";

export interface PpiAtA3 {
  ppi: number;
  rating: PpiRating;
}

/** REQ-DSG-019's thresholds, read at upload time rather than export time. */
export function ppiAtA3(widthPx: number, heightPx: number): PpiAtA3 {
  const ppiWidth = widthPx / (A3_WIDTH_MM / MM_PER_INCH);
  const ppiHeight = heightPx / (A3_HEIGHT_MM / MM_PER_INCH);
  // The tighter of the two governs a full-bleed placement — the logo cannot
  // be stretched non-uniformly to fill A3 without one dimension falling
  // short first.
  const ppi = Math.round(Math.min(ppiWidth, ppiHeight));
  const rating: PpiRating = ppi >= 300 ? "sufficient" : ppi >= 200 ? "warning" : "insufficient";
  return { ppi, rating };
}

/** The pixel size a logo needs to clear A3 at 300 PPI without warning —
 *  what SCR-059 states before the picker opens. */
export const MIN_LOGO_PX_FOR_A3 = {
  width: Math.ceil((A3_WIDTH_MM / MM_PER_INCH) * 300),
  height: Math.ceil((A3_HEIGHT_MM / MM_PER_INCH) * 300),
};
