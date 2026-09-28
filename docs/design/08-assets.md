# 08 — Assets

**Serves:** `04-components.md` (objects, glyphs), `02-typography.md` (the display face),
`REQ-INT-009` (self-hosted fonts), `REQ-DSG-018`/`DEC-009` (no SVG in the designer; raster only),
`REQ-DSG-019` (print resolution), `REQ-DSG-021` (brand kit is the single source of brand truth).
**Folder:** `docs/design/assets/`. Everything in it is generated from masters by the scripts in
`assets/scripts/`, so a change to a master is one command away from every derived file.

## What ships

| Path | What | Format | Sizes |
|---|---|---|---|
| `assets/brand/wordmark-ar-{ink,lime,bone}.svg` | the Arabic wordmark «كريم معرفة» as **outlines** (no font dependency), three tones | SVG | vector |
| `assets/brand/png/wordmark-ar-*-{1200,3000}.{png,webp}` | the same, rasterised, transparent | PNG, WebP | 1200 px and 3000 px wide |
| `assets/brand/mark.svg`, `mark-mono-ink.svg` | the app mark: isolated kaf on a lime tile (and lime-on-ink) | SVG | vector |
| `assets/brand/icons/icon-{32,180,192,512}.png`, `icon-ink-512.png` | favicon, apple-touch, android, store | PNG | as named |
| `assets/objects/svg/{coin,cup,flame,ticket,star,rocket}.svg` | the six toy-gloss objects, masters, labels outlined | SVG | 160 × 160 viewBox |
| `assets/objects/{png,webp}/<name>-{160,320,640,2048}.*` | rasters for the app (1×, 2×, 4×) and for posters (2048) | PNG, WebP | as named |
| `assets/objects/contact-sheet.png` | all six on the ink ground, for humans | PNG | — |
| `assets/fonts/baloo-bhaijaan-2/*.woff2`, `fonts.css`, `LICENSE-OFL.txt` | the display face: Arabic and Latin subsets at 700 and 800, plus the variable files; `@font-face` with unicode ranges and a metric-matched fallback | WOFF2 | — |
| `assets/icons/icons-additions.tsx` | fifteen new house glyphs as React components | TSX | 24 px grid |
| `assets/scripts/generate-masters.py`, `render-assets.mjs` | the pipeline (below) | — | — |

## Where each asset goes in the repo

| Asset | Destination | Notes |
|---|---|---|
| wordmark SVGs | `src/components/brand/wordmark.tsx` as inline SVG (three tones via `fill="currentColor"`) | It is UI code, so SVG is fine here. It links to `/app` inside the platform (`REQ-UIX-027`) |
| wordmark PNG 3000 | the first org's brand kit logo (`ENT-brand_kits.logo_asset_id`) | The designer takes **raster only** (`DEC-009`); 3000 px clears the A3 PPI guard (`REQ-DSG-019`) |
| wordmark PNG 1200 | the mail shell header (`@kareem/mail-runtime`) | Served through the brand logo route |
| mark SVG + PNGs | `src/app/icon.svg`, `apple-icon.png`, `public/icons/*` | Next.js metadata files; `mark-mono-ink` for dark chrome |
| object SVGs | `src/components/ui/objects/*.tsx` as inline SVG, **or** served as `<img>` from `public/objects/` | Inline when the object animates (coin, flame); `<img>` with `srcset` 1×/2× elsewhere |
| object PNG/WebP 2048 | platform design assets (`ENT-design_assets`, sniffed `image/png`/`image/webp`) | The optional poster layer of `DEC-NEXT-2`; **never** the SVG — the designer refuses it by design |
| fonts | wherever IBM Plex Sans Arabic already lives; `fonts.css` merged into `globals.css`; the family registered in `ENT-fonts` through the materialisation path | See `02-typography.md` §"Getting the display face into the product" |
| icons | merged into `src/components/ui/icons.tsx` | Adapt to the house export shape; mirror the chevron pair by CSS |

## Rules the assets obey

- **Labels are outlines.** «+50» and «محجوز» inside the objects and the wordmark itself are paths, so
  rasterisers and the worker's Chromium need no font, and the mark cannot fall back to a system face.
- **No SVG reaches the designer or an `<img>` from user storage.** SVG lives only as inline UI
  markup in `src/`. Poster layers are the 2048 px rasters.
- **Highlights are clipped to the silhouette**, so an object never leaves a grey smudge on a dark
  surface.
- **Every object carries its shadow in a separate `<g id="shadow">`** so it can be dropped when the
  object sits on a coloured poster ground.
- **Team-coloured objects** (the coin, the confetti) take their colour at runtime from `--team`; the
  masters are the brand-lime versions.
- **Licences:** Baloo Bhaijaan 2 is SIL OFL 1.1 (licence file included); everything else in the
  folder is original work for this product.

## Regenerating

```
# masters (needs python3, fonttools, brotli, uharfbuzz; the instanced TTFs come from the
# variable woff2 files in assets/fonts — see the header of generate-masters.py)
python3 docs/design/assets/scripts/generate-masters.py

# rasters (needs sharp, already a Next.js dependency)
node docs/design/assets/scripts/render-assets.mjs docs/design/assets
```

The masters script instances the variable font at weight 800, shapes the Arabic with HarfBuzz and
writes the outlines; the render script produces every PNG/WebP and the contact sheet. Sizes and the
list of objects are constants at the top of each script.

## If you want true 3D renders later

The SVG objects are on-brand and ship now. If the owner wants rendered 3D (Blender or Spline), the
brief per object is: rounded forms, matte plastic, soft key light from the upper start side, a lime rim
light, camera tilted −12°, a long soft contact shadow on ink, exported as PNG/WebP with alpha at
640 and 2048 px on the long side, same file names. Replacing a file in `assets/objects/png/` with a
render is the whole migration; nothing in the code changes.
