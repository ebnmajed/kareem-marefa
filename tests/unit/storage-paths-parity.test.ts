// "One path builder" (03 §6) has to stay true in fact, not just in name.
// worker/src/content/paths.ts is a port — the worker is a separate
// TypeScript project with no import back into `src/` (that file's own
// header explains why, and src/lib/storage/paths.ts's header points back
// at this test). Every shape BOTH files carry — convertedPdfPath,
// materialPagePath, materialPageThumbnailPath, photoPath — must produce
// byte-for-byte identical output for the same inputs; a mismatch would put
// an object outside the org prefix its own storage policy checks for, the
// exact weakness 03 §6 names. Kept as a test rather than the
// `packages/storage-paths` workspace member the lead considered (wave-2
// sync 10): a package move needs a `package.json` edit and a lockfile
// regeneration this late in the wave, and this test makes the alternative
// a checked fact instead of a hoped one.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { convertedPdfPath as appConvertedPdfPath, materialPagePath as appMaterialPagePath, materialPageThumbnailPath as appMaterialPageThumbnailPath, photoPath as appPhotoPath } from "@/lib/storage/paths";
import {
  convertedPdfPath as workerConvertedPdfPath,
  materialPagePath as workerMaterialPagePath,
  materialPageThumbnailPath as workerMaterialPageThumbnailPath,
  photoPath as workerPhotoPath,
} from "../../worker/src/content/paths";

const ORG = "11111111-1111-1111-1111-111111111111";
const SESSION = "22222222-2222-2222-2222-222222222222";
const VERSION = "33333333-3333-3333-3333-333333333333";
const PHOTO = "44444444-4444-4444-4444-444444444444";

describe("storage path parity — app (src/lib/storage/paths.ts) vs. worker (worker/src/content/paths.ts)", () => {
  it("★ convertedPdfPath is identical", () => {
    expect(workerConvertedPdfPath(ORG, SESSION, VERSION)).toBe(appConvertedPdfPath(ORG, SESSION, VERSION));
  });

  it("★ materialPagePath is identical across several page numbers", () => {
    for (const page of [1, 2, 42, 500]) {
      expect(workerMaterialPagePath(ORG, SESSION, VERSION, page)).toBe(appMaterialPagePath(ORG, SESSION, VERSION, page));
    }
  });

  it("★ materialPageThumbnailPath is identical", () => {
    expect(workerMaterialPageThumbnailPath(ORG, SESSION, VERSION, 7)).toBe(appMaterialPageThumbnailPath(ORG, SESSION, VERSION, 7));
  });

  it("★ photoPath is identical across every accepted extension", () => {
    for (const ext of ["jpg", "png", "webp"] as const) {
      expect(workerPhotoPath(ORG, SESSION, PHOTO, ext)).toBe(appPhotoPath(ORG, SESSION, PHOTO, ext));
    }
    // the shared default (webp) too.
    expect(workerPhotoPath(ORG, SESSION, PHOTO)).toBe(appPhotoPath(ORG, SESSION, PHOTO));
  });

  it("both sides reject the same malformed input (a non-UUID segment) rather than silently diverging", () => {
    expect(() => workerConvertedPdfPath("not-a-uuid", SESSION, VERSION)).toThrow();
    expect(() => appConvertedPdfPath("not-a-uuid", SESSION, VERSION)).toThrow();
  });
});
