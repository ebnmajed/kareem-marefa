// @kareem/mail-runtime — THE mail renderer (REQ-NTF-010, DEC-160 §4, DEC-161).
//
// «There is exactly one mail renderer; the preview is not a second
// implementation.» The worker sends with it and the app previews with it, so
// the message an admin approves is the message that ships — the discipline
// DEC-017 bought for posters with `@kareem/designer-runtime`, one medium over.
//
// ★ ISOMORPHIC, AND IT STAYS SO. Nothing here imports `node:`, reads
// `process.env` or touches `Buffer`: the tsconfig carries no DOM lib and no
// Node types on purpose, so reaching for either fails the build. The
// TRANSPORTS — SMTP, Resend, the MIME encoder — stay in `worker/src/mail/`:
// the app must not be able to import a way to send mail at all.
//
// ★ MOVED MECHANICALLY (wave 10, row L3). `render.ts` and `templates.ts` came
// from `worker/src/mail/` byte for byte, AFTER `tests/unit/mail-pinned/`
// pinned all 25 rendered messages from the renderer as it stood on `main`.
// Those 116 files are the proof the move changed nothing, and they are never
// auto-refreshed.
//
// The `.js` suffixes on relative imports stay: the worker resolves this
// package's output under NodeNext, which requires them, and a bundler permits
// them.
export {
  renderEmail,
  interpolate,
  changeBlock,
  changesFromPayload,
  dayBlock,
  dayPhrase,
  DAY_ORDINALS,
  TemplateMissingError,
} from "./render.js";
export type { RenderInput, RenderedEmail, ChangedField, LegacyBrand, FullBrand, BrandPalette } from "./render.js";

// The block model and its compiler (wave 10, N2 — REQ-NTF-009, REQ-NTF-013).
// The editor and the preview build documents with these types; the worker and
// the preview render them with the same compiler, which is the whole of
// REQ-NTF-010's «there is exactly one mail renderer».
export { SCHEMA_VERSION, BLOCK_TYPES, isBlockDocument, readBlocks } from "./blocks.js";
export type { EmailBlock, EmailBlockDocument, BlockId, BlockType, ImageSource } from "./blocks.js";
export { compileBlocks, interpolateIsolated, isolate } from "./compile.js";
// The one sample set: the preview renders it and `tests/unit/mail-pinned/`
// pins it, so an admin approves the bytes the suite records.
export { SAMPLE_CASES, SAMPLE_ORG, SAMPLE_MEMBER, SAMPLE_BRAND, sampleFor } from "./samples.js";
export type { SampleCase } from "./samples.js";
export type { CompileContext, CompiledBlocks, CompilePalette } from "./compile.js";
export { DEFAULT_TEMPLATES, SIGNATURE, defaultTemplate } from "./templates.js";
export type { EmailTemplate } from "./templates.js";
