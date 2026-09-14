/**
 * The PPI guard — REQ-DSG-019, DEC-009, 06 §8.1.
 *
 * DEC-009 dropped SVG, so «org logos are now raster. An org must supply a
 * high-resolution PNG or the PPI guard blocks A3.» That is the honest cost of
 * the decision, and this is the thing that collects it — at design time,
 * naming the layer and the preset, instead of at the print shop.
 *
 * WARN below 300 PPI, BLOCK below 200. Only on PRINT presets: a screen export
 * is delivered at the preset's exact pixel size (A29), so "dots per inch" has
 * no inch to be per.
 */

import { derive, PRESETS, presetsFor, type PresetName } from './presets.js'
import type { DesignDocument } from './model.js'

export const PPI_WARN_BELOW = 300
export const PPI_BLOCK_BELOW = 200

export interface AssetPixels {
  /** The asset's intrinsic size, from its bytes. */
  width: number
  height: number
}

export interface PpiFinding {
  layerId: string
  preset: PresetName
  /** Rounded down: 199.6 PPI is not 200. */
  ppi: number
  severity: 'warn' | 'block'
}

/**
 * The effective resolution of an image layer on one preset.
 *
 * The frame is in the preset's own pixels and the preset carries its dpi, so
 * the frame's physical width is `frame.w / dpi` inches and the asset spreads
 * its real pixels across that. `contain` fits the whole asset inside the
 * frame, so the constraint is whichever axis has to stretch further.
 */
export function layerPpi(asset: AssetPixels, frame: { w: number; h: number }, dpi: number, fit: 'contain' | 'cover' = 'contain'): number {
  if (asset.width <= 0 || asset.height <= 0 || frame.w <= 0 || frame.h <= 0) return 0
  const across = (asset.width / frame.w) * dpi
  const down = (asset.height / frame.h) * dpi
  // `contain` letterboxes, so the binding axis is the one with MORE room per
  // pixel; `cover` crops, so it is the one with less.
  return Math.floor(fit === 'cover' ? Math.max(across, down) : Math.min(across, down))
}

/**
 * Every image layer that is too low-resolution for a print preset, with the
 * layer and the preset named — because «the fix is obvious» only when the
 * message says which logo on which page.
 *
 * `assets` maps a layer id to the intrinsic size of whatever it resolves to;
 * a layer with no entry is unbound and is the placeholder's problem, not
 * this one's (REQ-DSG-006).
 */
export function ppiFindings(doc: DesignDocument, assets: Readonly<Record<string, AssetPixels>>): PpiFinding[] {
  const out: PpiFinding[] = []
  for (const name of presetsFor(doc.purpose)) {
    const preset = PRESETS[name]
    if (preset.bleed === 0) continue // screen: exact pixels, no inches involved
    for (const layer of derive(doc, name).layers) {
      if (layer.hidden || layer.kind !== 'image') continue
      const asset = assets[layer.id]
      if (!asset) continue
      const ppi = layerPpi(asset, layer.frame, preset.dpi, layer.image.fit ?? 'contain')
      if (ppi >= PPI_WARN_BELOW) continue
      out.push({ layerId: layer.id, preset: name, ppi, severity: ppi < PPI_BLOCK_BELOW ? 'block' : 'warn' })
    }
  }
  return out
}

/** A block is a block: the export does not run. Used by the editor to
 *  disable the request and by the worker to refuse the job. */
export function blocksExport(findings: readonly PpiFinding[]): boolean {
  return findings.some((f) => f.severity === 'block')
}
