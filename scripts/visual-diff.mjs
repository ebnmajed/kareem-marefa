#!/usr/bin/env node
// Visual diff of the frozen public contract (REQ-NFR-019).
//
// 14-roadmap.md asks for "a visual diff of the landing page before and after"
// any M0 change that touches the live site. This is that diff.
//
//   node scripts/visual-diff.mjs capture <name>          # .qa-shots/visual/<name>/
//   node scripts/visual-diff.mjs compare <before> <after>
//
// `capture` starts the QA stub and `next start` through the same helper
// scripts/qa-run.mjs uses (never a real project), then screenshots every frozen route at a phone
// and a desktop width. Motion is frozen — reduced-motion is emulated, so the
// sting never plays and the WebGL constellation yields to its static SVG
// fallback — and every capture waits for `document.fonts.ready`, so what is
// compared is layout and type, not an animation frame.
//
// `compare` diffs each pair in the browser with the same routine the parity
// harness uses (scripts/parity/harness.mjs, Tier B): no image library, and a
// per-channel tolerance of 2 so JPEG-free re-encodes never count. It exits 1
// on any pair above THRESHOLD, or on a size mismatch, which is what a changed
// line break looks like.

import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'
import { BASE, ROOT, startStubbedServer } from './lib/stubbed-server.mjs'

const OUT = join(ROOT, '.qa-shots', 'visual')
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
// 0.1% of pixels — the parity harness's own bar. Below it is anti-aliasing.
const THRESHOLD = Number(process.env.VISUAL_THRESHOLD ?? 0.001)

const ROUTES = ['/ar', '/en', '/ar/register']
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, deviceScaleFactor: 1 },
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
]

const [mode, ...rest] = process.argv.slice(2)
if (mode === 'capture' && rest[0]) await capture(rest[0])
else if (mode === 'compare' && rest[0] && rest[1]) await compare(rest[0], rest[1])
else {
  console.error('usage: visual-diff.mjs capture <name> | compare <before> <after>')
  process.exit(2)
}

/* ---------------------------------------------------------------- capture */

async function capture(name) {
  const dir = join(OUT, name)
  mkdirSync(dir, { recursive: true })
  const { shutdown } = await startStubbedServer()

  const browser = await launch()
  try {
    for (const vp of VIEWPORTS) {
      for (const route of ROUTES) {
        const page = await browser.newPage()
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
        await page.setViewport(vp)
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle0' })
        const blank = await page.evaluate(async () => {
          await document.fonts.ready
          // Freeze anything still transitioning in. Below-the-fold sections use
          // `content-visibility: auto`, which a full-page screenshot does NOT
          // un-skip — the layout viewport never moves — so they capture as
          // solid background. Force them visible; the point is the content.
          const style = document.createElement('style')
          style.textContent =
            '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' +
            ' .cv-section { content-visibility: visible !important; }'
          document.head.appendChild(style)
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
          // A blank capture passes every diff (DEC-024 learned this the hard
          // way). Refuse one: every section must be laid out and no text may
          // sit at opacity 0.
          const skipped = [...document.querySelectorAll('section')].filter(
            (s) => getComputedStyle(s).contentVisibility === 'auto' || s.getBoundingClientRect().height === 0,
          ).length
          const invisible = [...document.querySelectorAll('main h1, main h2, main h3, main p, main li')].filter(
            (el) => el.textContent.trim() && getComputedStyle(el).opacity === '0',
          ).length
          return { skipped, invisible }
        })
        if (blank.skipped || blank.invisible)
          fail(`${route} @ ${vp.name}: ${blank.skipped} skipped sections, ${blank.invisible} invisible text elements — refusing a blank capture`)
        const file = `${vp.name}${route.replace(/\//g, '_')}.png`
        await page.screenshot({ path: join(dir, file), fullPage: true })
        console.log(`  ✓ ${file}`)
        await page.close()
      }
    }
  } finally {
    await browser.close()
    shutdown()
  }
  console.log(`\ncaptured ${ROUTES.length * VIEWPORTS.length} screenshots → ${dir}`)
}

/* ---------------------------------------------------------------- compare */

async function compare(before, after) {
  const a = join(OUT, before)
  const b = join(OUT, after)
  for (const d of [a, b]) if (!existsSync(d)) fail(`no capture at ${d}`)
  const files = readdirSync(a).filter((f) => f.endsWith('.png')).sort()
  if (files.length === 0) fail(`nothing captured in ${a}`)

  const browser = await launch()
  const page = await browser.newPage()
  await page.setContent('<canvas></canvas>')
  let failed = 0
  console.log(`visual diff: ${before} → ${after}  (threshold ${(THRESHOLD * 100).toFixed(2)}%)\n`)
  for (const f of files) {
    const bp = join(b, f)
    if (!existsSync(bp)) {
      console.log(`  ✗ ${f.padEnd(28)} missing in ${after}`)
      failed++
      continue
    }
    const r = await diffOf(page, readFileSync(join(a, f)).toString('base64'), readFileSync(bp).toString('base64'))
    const ok = !r.sizeMismatch && r.ratio <= THRESHOLD
    if (!ok) failed++
    const detail = r.sizeMismatch ? `size ${r.a} → ${r.b}` : `${(r.ratio * 100).toFixed(3)}% pixels differ`
    console.log(`  ${ok ? '✓' : '✗'} ${f.padEnd(28)} ${detail}`)
  }
  await browser.close()
  console.log(failed ? `\n${failed} of ${files.length} differ` : `\nidentical within threshold — ${files.length} pairs`)
  process.exit(failed ? 1 : 0)
}

function diffOf(page, p, q) {
  return page.evaluate(
    async (p, q) => {
      const load = (b64) =>
        new Promise((res) => {
          const img = new Image()
          img.onload = () => res(img)
          img.src = `data:image/png;base64,${b64}`
        })
      const [i1, i2] = await Promise.all([load(p), load(q)])
      if (i1.width !== i2.width || i1.height !== i2.height)
        return { sizeMismatch: true, ratio: 1, a: `${i1.width}×${i1.height}`, b: `${i2.width}×${i2.height}` }
      const cv = document.querySelector('canvas')
      cv.width = i1.width
      cv.height = i1.height
      const ctx = cv.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(i1, 0, 0)
      const d1 = ctx.getImageData(0, 0, cv.width, cv.height).data
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.drawImage(i2, 0, 0)
      const d2 = ctx.getImageData(0, 0, cv.width, cv.height).data
      let differing = 0
      for (let i = 0; i < d1.length; i += 4) {
        if (Math.abs(d1[i] - d2[i]) > 2 || Math.abs(d1[i + 1] - d2[i + 1]) > 2 || Math.abs(d1[i + 2] - d2[i + 2]) > 2) differing++
      }
      return { sizeMismatch: false, ratio: differing / (d1.length / 4) }
    },
    p,
    q,
  )
}

/* ---------------------------------------------------------------- helpers */

function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      '--no-first-run',
      '--font-render-hinting=none',
      '--force-color-profile=srgb',
      ...(process.env.CHROME_NO_SANDBOX ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    ],
  })
}

function fail(msg) {
  console.error(msg)
  process.exit(2)
}
