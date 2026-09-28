// scripts/render-assets.mjs — regenerate rasters from the SVG masters in docs/design/assets.
// Usage: node scripts/render-assets.mjs [assetsDir]   (default: docs/design/assets)
// Requires sharp (already a Next.js dependency). Text in the masters is outlined, so no fonts are needed.
import sharp from 'sharp';
import { readdir, mkdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

const ROOT = process.argv[2] || 'docs/design/assets';
const OBJECT_SIZES = [160, 320, 640, 2048];          // 1×, 2×, 4× for the UI; 2048 for posters up to A3 at 300 ppi
const WORDMARK_WIDTHS = [1200, 3000];                // email header / brand kit logo (raster, REQ-DSG-019)
const ICON_SIZES = [32, 180, 192, 512];              // favicon, apple-touch, android, store

async function renderSvg(svgPath, outPath, { width, height, format }) {
  const svg = await readFile(svgPath);
  let img = sharp(svg, { density: 300 }).resize({ width, height, fit: 'inside', withoutEnlargement: false });
  img = format === 'webp' ? img.webp({ quality: 88, alphaQuality: 90 }) : img.png({ compressionLevel: 9 });
  await img.toFile(outPath);
}

async function objects() {
  const dir = join(ROOT, 'objects', 'svg');
  const files = (await readdir(dir)).filter(f => f.endsWith('.svg'));
  for (const f of files) {
    const name = basename(f, '.svg');
    for (const size of OBJECT_SIZES) {
      for (const format of ['png', 'webp']) {
        const out = join(ROOT, 'objects', format);
        await mkdir(out, { recursive: true });
        await renderSvg(join(dir, f), join(out, `${name}-${size}.${format}`), { width: size, height: size, format });
      }
    }
  }
  return files.map(f => basename(f, '.svg'));
}

async function brand() {
  const dir = join(ROOT, 'brand');
  const out = join(dir, 'png'); await mkdir(out, { recursive: true });
  for (const tone of ['ink', 'lime', 'bone']) {
    for (const w of WORDMARK_WIDTHS) {
      await renderSvg(join(dir, `wordmark-ar-${tone}.svg`), join(out, `wordmark-ar-${tone}-${w}.png`), { width: w, format: 'png' });
      await renderSvg(join(dir, `wordmark-ar-${tone}.svg`), join(out, `wordmark-ar-${tone}-${w}.webp`), { width: w, format: 'webp' });
    }
  }
  const icons = join(dir, 'icons'); await mkdir(icons, { recursive: true });
  for (const s of ICON_SIZES) {
    await renderSvg(join(dir, 'mark.svg'), join(icons, `icon-${s}.png`), { width: s, height: s, format: 'png' });
  }
  await renderSvg(join(dir, 'mark-mono-ink.svg'), join(icons, `icon-ink-512.png`), { width: 512, height: 512, format: 'png' });
}

async function sheet(names) {
  // a contact sheet for humans: six objects on the ink ground
  const cell = 320, pad = 40;
  const w = pad + names.length * (cell + pad), h = cell + pad * 2;
  const composites = [];
  for (let i = 0; i < names.length; i++) {
    const input = await readFile(join(ROOT, 'objects', 'png', `${names[i]}-320.png`));
    composites.push({ input, left: pad + i * (cell + pad), top: pad });
  }
  await sharp({ create: { width: w, height: h, channels: 4, background: '#0B0C12' } })
    .composite(composites).png().toFile(join(ROOT, 'objects', 'contact-sheet.png'));
}

const names = await objects();
await brand();
await sheet(names);
console.log('rendered', names.length, 'objects, wordmark and icons into', ROOT);
