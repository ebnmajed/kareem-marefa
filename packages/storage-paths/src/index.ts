// The single storage path builder — 07-content-pipeline.md §3, 03-permissions-rls.md §6.
//
// "Paths are built by one server-side function. This is the only place in
// the whole design where isolation depends on application correctness
// rather than on a constraint" (03 §6). No route, action or job may build a
// storage path any other way — every function here returns a path already
// shaped to match one of the six bucket policies' `(storage.foldername(name))`
// expectations exactly, so a caller can never construct a path that a
// policy would misread as belonging to another org.
//
// One workspace package, imported by the app (through src/lib/storage/paths.ts,
// which adds `server-only`) and by the worker image directly (DEC-047: "the
// path builder is a workspace package, not a port"). Until wave 3 the worker
// carried a comment-linked port checked by a parity test; a package makes
// "one builder" a fact rather than a test.
export { InvalidStoragePathError, type Bucket, type StorageLocation } from "./guards.js";
export * from "./content.js";
export * from "./designer.js";
export * from "./brand.js";

import type { StorageLocation } from "./guards.js";
import { convertedPdfPath, materialPagePath, materialPageThumbnailPath, materialSourcePath, photoPath } from "./content.js";
import { designAssetPath, exportPath, fontPath } from "./designer.js";

export const storagePaths = {
  materialSource: (orgId: string, sessionId: string, versionId: string, filename: string): StorageLocation => ({
    bucket: "materials",
    path: materialSourcePath(orgId, sessionId, versionId, filename),
  }),
  convertedPdf: (orgId: string, sessionId: string, versionId: string): StorageLocation => ({
    bucket: "materials",
    path: convertedPdfPath(orgId, sessionId, versionId),
  }),
  materialPage: (orgId: string, sessionId: string, versionId: string, page: number): StorageLocation => ({
    bucket: "material-pages",
    path: materialPagePath(orgId, sessionId, versionId, page),
  }),
  materialPageThumbnail: (orgId: string, sessionId: string, versionId: string, page: number): StorageLocation => ({
    bucket: "material-pages",
    path: materialPageThumbnailPath(orgId, sessionId, versionId, page),
  }),
  photo: (orgId: string, sessionId: string, photoId: string, ext: "jpg" | "png" | "webp" = "webp"): StorageLocation => ({
    bucket: "photos",
    path: photoPath(orgId, sessionId, photoId, ext),
  }),
  designAsset: (orgId: string, assetId: string, ext: "png" | "jpg" | "webp"): StorageLocation => ({
    bucket: "design-assets",
    path: designAssetPath(orgId, assetId, ext),
  }),
  export: (orgId: string, documentId: string, preset: string, ext: string): StorageLocation => ({
    bucket: "exports",
    path: exportPath(orgId, documentId, preset, ext),
  }),
  font: (sha256: string, ext: "woff2" | "ttf"): StorageLocation => ({ bucket: "fonts", path: fontPath(sha256, ext) }),
} as const;
