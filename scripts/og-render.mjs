#!/usr/bin/env node
// Renders public/og.png (1200 × 630) from scripts/og-card.html — the one place the card is drawn.
//
//   node scripts/og-render.mjs            # writes public/og.png
//
// `/og.png` is part of the live public contract (REQ-NFR-019, DEC-167): its URL and its shape
// (a PNG, 1200 × 630) are guarded by qa:contract; its appearance changes only in the same commit
// as a decision that says why. The card loads IBM Plex from Google Fonts, so this needs the
// network; it prints the families that loaded so a fallback font is visible, not silent.

import puppeteer from 'puppeteer-core'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './lib/stubbed-server.mjs'

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(join(ROOT, 'scripts', 'og-card.html')).href, { waitUntil: 'networkidle0' })
await page.evaluate(() => document.fonts.ready)
const loaded = await page.evaluate(() => [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family))])
console.log(`fonts loaded: ${loaded.join(', ') || 'NONE — the card would render in a fallback font'}`)
if (!loaded.some((f) => f.includes('Arabic'))) {
  console.error('refusing to write: IBM Plex Sans Arabic did not load')
  process.exit(1)
}
await page.screenshot({ path: join(ROOT, 'public', 'og.png'), type: 'png' })
await browser.close()
console.log('wrote public/og.png')
