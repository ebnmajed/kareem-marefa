// What a failed export's reason IS, in the admin's words — REQ-DSG-012,
// DEC-149 §4.
//
// `export_artifacts.error` is the worker's own sentence («tier_a: l_title
// fitted 88px, expected 96px»), which is right for whoever debugs the render
// and wrong as the first thing an org admin reads. The panel says the reason
// in Arabic and keeps the raw text beneath it, isolated left-to-right, the way
// the email delivery log does. The classifier reads the prefixes the worker
// writes (`worker/src/render/variant.ts`, `worker/src/tasks/render_variant.ts`);
// anything it does not recognise is «تعذّر توليد هذا المقاس», never a guess.

export type ExportFailureReason =
  | "textDidNotFit"
  | "fontNeverLoaded"
  | "layoutMismatch"
  | "blank"
  | "fonts"
  | "invalidDocument"
  | "documentChanged"
  | "jpegDisabled"
  | "unknown";

export function exportFailureReason(error: string | null | undefined): ExportFailureReason {
  const text = error ?? "";
  if (text.startsWith("tier_a:")) {
    if (text.includes("font_never_loaded")) return "fontNeverLoaded";
    if (text.includes("fitted_size") || text.includes("line_count") || /fitted \d+px/.test(text)) return "textDidNotFit";
    return "layoutMismatch";
  }
  if (text.includes("capture is blank")) return "blank";
  if (text.includes("faces never became usable") || text.includes("pins no faces")) return "fonts";
  if (text.includes("stored document is invalid")) return "invalidDocument";
  if (text.includes("document changed after this export was requested")) return "documentChanged";
  if (text.includes("jpeg export is not enabled")) return "jpegDisabled";
  return "unknown";
}
