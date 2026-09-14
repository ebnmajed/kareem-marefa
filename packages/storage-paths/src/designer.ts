// The M6 shapes — design assets, exports, fonts (06 §6.4). The `designer`
// teammate's file (wave 3): add shapes here, never in content.ts, and never a
// shape a bucket policy in 03 §6 does not already expect.
import { assertSafeSegment, assertSha256, assertUuid } from "./guards.js";

/** `design-assets/{org_id}/design/assets/{asset_id}.{ext}` — admin-only, DEC-009 never accepts an `svg` extension here. */
export function designAssetPath(orgId: string, assetId: string, ext: "png" | "jpg" | "webp"): string {
  return [assertUuid(orgId, "orgId"), "design", "assets", `${assertUuid(assetId, "assetId")}.${assertSafeSegment(ext, "ext")}`].join("/");
}

/** `exports/{org_id}/exports/{document_id}/{preset}.{ext}` — worker-written only. */
export function exportPath(orgId: string, documentId: string, preset: string, ext: string): string {
  return [
    assertUuid(orgId, "orgId"),
    "exports",
    assertUuid(documentId, "documentId"),
    `${assertSafeSegment(preset, "preset")}.${assertSafeSegment(ext, "ext")}`,
  ].join("/");
}

/** `fonts/{sha256}.{ext}` — content-addressed, deliberately not org-prefixed (REQ-DSG-016, 07 §3). */
export function fontPath(sha256: string, ext: "woff2" | "ttf"): string {
  return `${assertSha256(sha256, "sha256")}.${assertSafeSegment(ext, "ext")}`;
}
