import { describe, expect, it } from "vitest";
import { exportFailureReason } from "@/components/designer/export-reason";

// REQ-DSG-012, DEC-149 §4 — a failed export says why in the admin's words.
// Each case is a sentence the worker actually writes
// (`worker/src/render/variant.ts`, `worker/src/tasks/render_variant.ts`).
describe("exportFailureReason", () => {
  it.each([
    ["tier_a: l_title fitted 88px, expected 96px", "textDidNotFit"],
    ["tier_a: l_title: fitted_size — auto-fit chose 96px, the page laid out 88px", "textDidNotFit"],
    ["tier_a: l_where: line_count — auto-fit predicted 1 line(s), the page laid out 2", "textDidNotFit"],
    ["tier_a: l_title: font_never_loaded — advance 400 equals the fallback's 400 — the face never resolved", "fontNeverLoaded"],
    ["tier_a: l_title: geometry_drift — lineWidths changed for an unchanged source fingerprint", "layoutMismatch"],
    ["render: the capture is blank (0.000% inked) — an empty artifact passes every later check", "blank"],
    ["render: these faces never became usable for Arabic: IBM Plex Sans Arabic 600", "fonts"],
    ["the render context pins no faces — a render with no font set cannot be reproduced (REQ-DSG-016)", "fonts"],
    ["the stored document is invalid — layers[0].frame:negative", "invalidDocument"],
    ["the document changed after this export was requested — request it again to get a key that matches", "documentChanged"],
    ["jpeg export is not enabled for this org (org_settings.allow_jpeg_export)", "jpegDisabled"],
    ["Protocol error (Page.printToPDF): Printing failed", "unknown"],
  ] as const)("%s → %s", (error, reason) => {
    expect(exportFailureReason(error)).toBe(reason);
  });

  it("an empty reason is unknown, never a guess", () => {
    expect(exportFailureReason(null)).toBe("unknown");
    expect(exportFailureReason("")).toBe("unknown");
  });
});
