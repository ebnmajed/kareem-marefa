// @kareem/fonts — the manifest, and nothing else.
//
// This package is ENT-fonts in the repository (06 §7.3, REQ-DSG-016): the
// only way a font enters the editor, the worker's Chromium or the worker's
// LibreOffice. Every consumer reads the manifest and addresses a file by its
// SHA-256, so a different font is a different filename — never a silently
// different render (D66).
//
//   faces  — web faces (.woff2), the exact bytes next/font emits for the app.
//            The editor and the worker's Chromium load these.
//   ttf    — one TrueType file per (family, weight, style), derived losslessly
//            from that face's woff2 subsets and merged, for LibreOffice, which
//            cannot read woff2. `derivedFrom` names the woff2 hashes it came
//            from, so a stale derivation is detectable.
//
// Regenerate with `npm run fonts:extract` (after `npm run build`) and
// `npm run fonts:derive`; `npm run fonts:check` is the CI gate.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FONTS_DIR = dirname(fileURLToPath(import.meta.url))

/** @returns {{ faces: Face[], ttf: Ttf[] }} */
export function readManifest() {
  return JSON.parse(readFileSync(join(FONTS_DIR, 'manifest.json'), 'utf8'))
}

/** Absolute path of a manifest entry's file. */
export function fontPath(entry) {
  return join(FONTS_DIR, entry.file)
}

/**
 * @typedef {{ family: string, weight: number, style: string, script: 'arabic'|'latin', sha256: string, bytes: number, file: string }} Face
 * @typedef {{ family: string, weight: number, style: string, sha256: string, bytes: number, file: string, derivedFrom: string[], tool: string }} Ttf
 */
