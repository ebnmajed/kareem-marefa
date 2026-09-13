#!/usr/bin/env node
// The credential-free converter. 04 §7.1, 07 §4, REQ-MAT-003, REQ-MAT-011.
//
// This process parses PowerPoint files uploaded by users — the most hostile
// input in the product — with LibreOffice. It therefore holds NOTHING: no
// Postgres connection string, no service_role key, no Supabase URL. It gets a
// signed input URL and signed output URLs per request, and it refuses to
// start if any credential-shaped variable is in its environment at all.
//
// Dependencies are deliberately zero. The whole service is Node built-ins
// plus four CLI tools installed in the image: soffice, pdfinfo/pdffonts/
// pdftoppm (poppler), cwebp, unzip.
//
//   GET  /healthz
//   POST /convert  { input: { url, kind: 'powerpoint' | 'pdf' },
//                    output: { pdf: { url } } }          → { pages, fonts }
//   POST /pages    { input: { url },  // a PDF
//                    output: { pages: [{ n, url, thumbUrl }] } }
//                                                        → { rendered }
//
// Fonts: the image installs exactly the manifest's TrueType files
// (packages/fonts, REQ-DSG-016), verified by hash at build. A deck that uses a
// family not in the image is reported under `fonts.substituted` so the job can
// write `materials.font_substitution_warning` (07 §4.4).

import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

const PORT = Number(process.env.PORT ?? 8080)
const ALLOW_HTTP = process.env.CONVERTER_ALLOW_HTTP === '1' // local smoke test only
const MAX_INPUT_BYTES = 200 * 1024 * 1024
const MAX_JSON_BYTES = 1024 * 1024
const SOFFICE_TIMEOUT_MS = 180_000
const TOOL_TIMEOUT_MS = 60_000
const PAGE_LONG_EDGE = 1600 // 07 §4.5
const THUMB_LONG_EDGE = 320
const PAGE_QUALITY = 82
const THUMB_QUALITY = 70

/* ------------------------------------------------------------ boot guard */

// A converter with a credential in its environment is the single-app design
// 04 §7.1 rejects. Fail at boot, by NAME only — never print a value.
const CREDENTIAL_SHAPED = /SUPABASE|DATABASE|SERVICE_ROLE|POSTGRES|^PG[A-Z]+$|RESEND|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|ENCRYPTION/i
const leaked = Object.keys(process.env).filter((k) => CREDENTIAL_SHAPED.test(k))
if (leaked.length) {
  console.error(`converter: refusing to start — credential-shaped environment variable(s) present: ${leaked.join(', ')}`)
  console.error('This app must hold no secrets (04 §7.1). Remove them from its environment.')
  process.exit(1)
}

/* ---------------------------------------------------------------- helpers */

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function assertUrl(u, what) {
  let url
  try {
    url = new URL(u)
  } catch {
    throw new HttpError(400, `${what}: not a URL`)
  }
  if (url.protocol !== 'https:' && !(ALLOW_HTTP && url.protocol === 'http:')) throw new HttpError(400, `${what}: must be https`)
  return url.href
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_JSON_BYTES) throw new HttpError(413, 'request body too large')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'body is not JSON')
  }
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'error' })
  if (!res.ok) throw new HttpError(502, `input fetch failed: ${res.status}`)
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_INPUT_BYTES) throw new HttpError(413, 'input too large')
  let seen = 0
  const guard = new TransformStreamGuard((n) => {
    seen += n
    if (seen > MAX_INPUT_BYTES) throw new HttpError(413, 'input too large')
  })
  await pipeline(Readable.fromWeb(res.body), guard, createWriteStream(dest))
  return seen
}

import { Transform } from 'node:stream'
class TransformStreamGuard extends Transform {
  constructor(onChunk) {
    super()
    this.onChunk = onChunk
  }
  _transform(chunk, _enc, cb) {
    try {
      this.onChunk(chunk.length)
      cb(null, chunk)
    } catch (e) {
      cb(e)
    }
  }
}

async function upload(url, path, contentType) {
  const body = await readFile(path)
  const res = await fetch(url, { method: 'PUT', headers: { 'content-type': contentType, 'content-length': String(body.length) }, body, redirect: 'error' })
  if (!res.ok) throw new HttpError(502, `output upload failed: ${res.status}`)
  return body.length
}

async function run(cmd, args, { cwd, timeout = TOOL_TIMEOUT_MS, env } = {}) {
  try {
    return await execFileP(cmd, args, { cwd, timeout, env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024 })
  } catch (e) {
    const detail = (e.stderr || e.stdout || e.message || '').toString().trim().split('\n').slice(-3).join(' | ')
    throw new HttpError(500, `${cmd} failed: ${detail}`)
  }
}

// Sniff on content, never on extension or on what the caller said.
async function sniff(path) {
  const fd = await readFile(path)
  if (fd.subarray(0, 5).toString() === '%PDF-') return 'pdf'
  if (fd[0] === 0x50 && fd[1] === 0x4b) {
    // A zip. PowerPoint if it carries ppt/presentation.xml.
    const { stdout } = await run('unzip', ['-Z1', path])
    if (stdout.split('\n').includes('ppt/presentation.xml')) return 'powerpoint'
  }
  return 'unknown'
}

/* ------------------------------------------------------------------ fonts */

let installedFamilies = null
async function fontsInstalled() {
  if (installedFamilies) return installedFamilies
  const { stdout } = await run('fc-list', [':', 'family'])
  const set = new Set()
  for (const line of stdout.split('\n')) for (const fam of line.split(',')) if (fam.trim()) set.add(fam.trim())
  installedFamilies = set
  return set
}

// Every typeface the deck's content names — slides, layouts and masters. The
// theme declares fonts too, but a theme font only matters if some run points
// at it through a `+mj-*` / `+mn-*` placeholder; LibreOffice's own export
// writes Arial into the theme of every deck it saves, and reporting that as
// "substituted" would warn on every converted file. Embedded fonts are
// listed separately from presentation.xml.
async function fontsUsedByPptx(path) {
  const content = (await run('unzip', ['-p', path, 'ppt/slides/*.xml', 'ppt/slideLayouts/*.xml', 'ppt/slideMasters/*.xml'])).stdout
  const theme = (await run('unzip', ['-p', path, 'ppt/theme/*.xml']).catch(() => ({ stdout: '' }))).stdout
  const presentation = (await run('unzip', ['-p', path, 'ppt/presentation.xml'])).stdout

  const themeFonts = { mj: new Set(), mn: new Set() }
  for (const [key, tag] of [['mj', 'majorFont'], ['mn', 'minorFont']]) {
    const block = theme.match(new RegExp(`<a:${tag}>([\\s\\S]*?)</a:${tag}>`))?.[1] ?? ''
    for (const m of block.matchAll(/<a:(latin|ea|cs)\s+typeface="([^"]+)"/g)) if (m[2].trim()) themeFonts[key].add(m[2].trim())
  }

  const used = new Set()
  for (const m of content.matchAll(/typeface="([^"]*)"/g)) {
    const f = m[1].trim()
    if (!f) continue
    if (f.startsWith('+')) {
      const key = f.slice(1, 3)
      for (const t of themeFonts[key] ?? []) used.add(t)
    } else used.add(f)
  }
  const embedded = new Set()
  for (const block of presentation.matchAll(/<p:embeddedFont>([\s\S]*?)<\/p:embeddedFont>/g)) {
    const f = block[1].match(/typeface="([^"]*)"/)?.[1]?.trim()
    if (f) embedded.add(f)
  }
  return { used: [...used].sort(), embedded: [...embedded].sort() }
}

async function fontsInPdf(path) {
  const { stdout } = await run('pdffonts', [path])
  return stdout
    .split('\n')
    .slice(2)
    .map((l) => l.trim().split(/\s{2,}/)[0])
    .filter(Boolean)
    .sort()
}

async function pageCount(pdf) {
  const { stdout } = await run('pdfinfo', [pdf])
  const n = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1])
  if (!Number.isInteger(n) || n < 1) throw new HttpError(422, 'the PDF has no pages')
  return n
}

// pdftoppm's `-scale-to N` fits the page in an N×N box and rounds each axis
// independently, so a landscape page comes out 1601 wide. Pin the LONG edge
// exactly and let the other axis follow (-1).
async function scaleArgs(pdf, n, longEdge) {
  const { stdout } = await run('pdfinfo', ['-f', String(n), '-l', String(n), pdf])
  const m = stdout.match(new RegExp(`^Page\\s+${n}\\s+size:\\s+([\\d.]+) x ([\\d.]+)`, 'm')) ?? stdout.match(/^Page size:\s+([\d.]+) x ([\d.]+)/m)
  const landscape = m ? Number(m[1]) >= Number(m[2]) : true
  return landscape ? ['-scale-to-x', String(longEdge), '-scale-to-y', '-1'] : ['-scale-to-x', '-1', '-scale-to-y', String(longEdge)]
}

/* ---------------------------------------------------------------- convert */

async function convert(body) {
  const inputUrl = assertUrl(body?.input?.url, 'input.url')
  const kind = body?.input?.kind
  if (kind !== 'powerpoint' && kind !== 'pdf') throw new HttpError(400, "input.kind must be 'powerpoint' or 'pdf'")
  const pdfOut = kind === 'powerpoint' ? assertUrl(body?.output?.pdf?.url, 'output.pdf.url') : null

  const tmp = await mkdtemp(join(tmpdir(), 'conv-'))
  try {
    const input = join(tmp, 'input')
    await download(inputUrl, input)
    const actual = await sniff(input)
    if (actual !== kind) throw new HttpError(415, `input is ${actual}, not ${kind}`)

    let pdf = input
    const fonts = { used: [], embedded: [], substituted: [], inPdf: [] }
    if (kind === 'powerpoint') {
      const { used, embedded } = await fontsUsedByPptx(input)
      const installed = await fontsInstalled()
      fonts.used = used
      fonts.embedded = embedded
      // A family the deck names that the image does not have will be shaped
      // by whatever fontconfig substitutes — for Arabic that changes the
      // text, not just the look (REQ-MAT-011). Report it by name.
      fonts.substituted = used.filter((f) => !installed.has(f))

      // A fresh profile per job: LibreOffice's user profile is where a
      // crashed previous run leaves state, and where a hostile document
      // could try to persist something.
      await run('soffice', ['--headless', '--norestore', '--nologo', '--nolockcheck', `-env:UserInstallation=file://${tmp}/profile`, '--convert-to', 'pdf', '--outdir', tmp, input], {
        cwd: tmp,
        timeout: SOFFICE_TIMEOUT_MS,
        env: { HOME: tmp },
      })
      pdf = join(tmp, 'input.pdf')
      await stat(pdf).catch(() => {
        throw new HttpError(500, 'LibreOffice produced no PDF')
      })
      await upload(pdfOut, pdf, 'application/pdf')
    }
    fonts.inPdf = await fontsInPdf(pdf)
    const pages = await pageCount(pdf)
    return { pages, fonts }
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

/* ------------------------------------------------------------------ pages */

async function renderPages(body) {
  const inputUrl = assertUrl(body?.input?.url, 'input.url')
  const pages = body?.output?.pages
  if (!Array.isArray(pages) || !pages.length || pages.length > 500) throw new HttpError(400, 'output.pages must list 1–500 pages')
  for (const p of pages) {
    if (!Number.isInteger(p?.n) || p.n < 1) throw new HttpError(400, 'each page needs an integer n ≥ 1')
    assertUrl(p.url, `pages[${p.n}].url`)
    if (p.thumbUrl) assertUrl(p.thumbUrl, `pages[${p.n}].thumbUrl`)
  }

  const tmp = await mkdtemp(join(tmpdir(), 'pages-'))
  try {
    const pdf = join(tmp, 'input.pdf')
    await download(inputUrl, pdf)
    if ((await sniff(pdf)) !== 'pdf') throw new HttpError(415, 'input is not a PDF')
    const total = await pageCount(pdf)

    let rendered = 0
    for (const p of pages) {
      if (p.n > total) throw new HttpError(422, `page ${p.n} does not exist (${total} pages)`)
      const png = join(tmp, `p${p.n}`)
      await run('pdftoppm', ['-f', String(p.n), '-l', String(p.n), '-singlefile', '-png', ...(await scaleArgs(pdf, p.n, PAGE_LONG_EDGE)), pdf, png])
      const webp = join(tmp, `p${p.n}.webp`)
      await run('cwebp', ['-quiet', '-q', String(PAGE_QUALITY), `${png}.png`, '-o', webp])
      await upload(p.url, webp, 'image/webp')
      if (p.thumbUrl) {
        const tpng = join(tmp, `t${p.n}`)
        await run('pdftoppm', ['-f', String(p.n), '-l', String(p.n), '-singlefile', '-png', ...(await scaleArgs(pdf, p.n, THUMB_LONG_EDGE)), pdf, tpng])
        const twebp = join(tmp, `t${p.n}.webp`)
        await run('cwebp', ['-quiet', '-q', String(THUMB_QUALITY), `${tpng}.png`, '-o', twebp])
        await upload(p.thumbUrl, twebp, 'image/webp')
      }
      rendered++
    }
    return { rendered, total }
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

/* ----------------------------------------------------------------- server */

async function healthz() {
  const { stdout } = await run('soffice', ['--version'])
  const installed = await fontsInstalled()
  const manifest = JSON.parse(await readFile(new URL('../packages/fonts/manifest.json', import.meta.url), 'utf8'))
  const expected = [...new Set(manifest.ttf.map((t) => t.family))]
  const missing = expected.filter((f) => !installed.has(f))
  return { ok: missing.length === 0, soffice: stdout.trim().split('\n')[0], fonts: { manifest: expected, missing, installed: installed.size } }
}

const routes = {
  'GET /healthz': async () => healthz(),
  'POST /convert': async (req) => convert(await readJson(req)),
  'POST /pages': async (req) => renderPages(await readJson(req)),
}

const server = http.createServer(async (req, res) => {
  const started = Date.now()
  const key = `${req.method} ${new URL(req.url, 'http://x').pathname}`
  const handler = routes[key]
  let status = 200
  let payload
  try {
    if (!handler) throw new HttpError(404, 'not found')
    payload = await handler(req)
  } catch (e) {
    status = e instanceof HttpError ? e.status : 500
    payload = { error: e instanceof HttpError ? e.message : 'internal error' }
    if (status === 500) console.error(`${key}: ${e.stack ?? e}`)
  }
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
  res.end(body)
  console.log(`${key} → ${status} (${Date.now() - started} ms)`)
})

server.listen(PORT, '0.0.0.0', () => console.log(`converter listening on :${PORT} — no credentials, by design`))
