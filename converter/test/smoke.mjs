#!/usr/bin/env node
// Smoke test for the converter image. Builds it, proves the credential guard
// refuses to boot with a secret in the environment, then drives the real
// service through the real contract — signed-URL-shaped GET in, PUT out —
// with a throwaway callback server standing in for Supabase Storage.
//
//   node converter/test/smoke.mjs                 # build + test
//   SKIP_BUILD=1 node converter/test/smoke.mjs    # reuse the image
//   node converter/test/smoke.mjs --make-fixtures # regenerate the .pptx fixtures
//
// What it asserts, and why each matters:
//   · /healthz says the manifest's families are installed (REQ-DSG-016)
//   · a deck set in IBM Plex Sans Arabic converts with NO substitution and
//     the PDF embeds that face — the fonts LibreOffice used are ours
//   · a deck set in a family the image lacks is reported by name
//     (REQ-MAT-011, the report the job writes to the material)
//   · page images come back as WebP at the long edge 07 §4.5 specifies, and
//     are not blank
//   · content is sniffed: a PowerPoint declared as PDF is refused (415)

import { execFile, spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const FIXTURES = join(HERE, '..', 'fixtures')
const IMAGE = process.env.IMAGE ?? 'kareem-converter'
const HOST_PORT = Number(process.env.CONVERTER_PORT ?? 18080)
const CONVERTER = `http://localhost:${HOST_PORT}`
// How the container reaches the callback server on this machine.
const CALLBACK_HOST = process.env.CALLBACK_HOST ?? 'host.docker.internal'
const NAME = `kareem-converter-smoke-${process.pid}`

let failed = 0
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}${cond || !extra ? '' : `  — ${extra}`}`)
  if (!cond) failed++
}
const docker = (args, opts = {}) => execFileP('docker', args, { maxBuffer: 64 * 1024 * 1024, ...opts })

/* ------------------------------------------------------------------ image */

if (!process.env.SKIP_BUILD) {
  console.log(`· building ${IMAGE} (LibreOffice — the first build takes a few minutes)`)
  await new Promise((resolve, reject) => {
    const b = spawn('docker', ['build', '-f', 'converter/Dockerfile', '-t', IMAGE, '.'], { cwd: ROOT, stdio: 'inherit' })
    b.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`docker build exited ${code}`))))
  })
}

if (process.argv.includes('--make-fixtures')) {
  console.log('· regenerating .pptx fixtures inside the image')
  await docker(['run', '--rm', '-v', `${FIXTURES}:/f`, '-w', '/f', '-e', 'HOME=/tmp', IMAGE, 'soffice', '--headless', '--convert-to', 'pptx', '--outdir', '/f', 'plex-arabic.fodp', 'cairo-missing.fodp'])
  console.log('  done — commit converter/fixtures/*.pptx')
  process.exit(0)
}

/* ---------------------------------------------------------- boot guard */

{
  let code = 0
  let stderr = ''
  try {
    await docker(['run', '--rm', '-e', 'SUPABASE_SERVICE_ROLE_KEY=not-a-real-key', IMAGE])
  } catch (e) {
    code = e.code
    stderr = e.stderr ?? ''
  }
  ok(code !== 0 && /refusing to start/.test(stderr), 'refuses to boot with a credential-shaped variable in its environment', `exit ${code}`)
  ok(!/not-a-real-key/.test(stderr), 'and never prints the value')
}

/* ------------------------------------------------------ callback server */

const stored = new Map()
const callback = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  if (req.method === 'GET' && path.startsWith('/fixtures/')) {
    try {
      const body = await readFile(join(FIXTURES, path.slice('/fixtures/'.length)))
      res.writeHead(200, { 'content-length': body.length })
      return res.end(body)
    } catch {
      res.writeHead(404)
      return res.end()
    }
  }
  if (path.startsWith('/out/')) {
    const key = path.slice('/out/'.length)
    if (req.method === 'PUT') {
      const chunks = []
      for await (const c of req) chunks.push(c)
      stored.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'] })
      res.writeHead(200)
      return res.end()
    }
    if (req.method === 'GET' && stored.has(key)) {
      const { body } = stored.get(key)
      res.writeHead(200, { 'content-length': body.length })
      return res.end(body)
    }
  }
  res.writeHead(404)
  res.end()
})
await new Promise((r) => callback.listen(0, '0.0.0.0', r))
const cbPort = callback.address().port
const cb = (p) => `http://${CALLBACK_HOST}:${cbPort}${p}`

/* -------------------------------------------------------------- service */

console.log(`· starting ${IMAGE} on :${HOST_PORT}`)
await docker(['run', '-d', '--rm', '--name', NAME, '-p', `${HOST_PORT}:8080`, '--add-host=host.docker.internal:host-gateway', '-e', 'CONVERTER_ALLOW_HTTP=1', IMAGE])
const stop = async () => {
  try {
    await docker(['stop', '-t', '2', NAME])
  } catch {}
  callback.close()
}
process.on('SIGINT', async () => {
  await stop()
  process.exit(130)
})

try {
  let health
  for (let i = 0; i < 60 && !health; i++) {
    try {
      health = await (await fetch(`${CONVERTER}/healthz`)).json()
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  ok(health?.ok === true, 'healthz: every manifest family is installed in the image', JSON.stringify(health?.fonts))
  console.log(`      ${health?.soffice}`)

  const post = async (path, body) => {
    const res = await fetch(`${CONVERTER}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: res.status, json: await res.json() }
  }

  // 1. A deck in our font: converts, no substitution, our face in the PDF.
  const plex = await post('/convert', { input: { url: cb('/fixtures/plex-arabic.pptx'), kind: 'powerpoint' }, output: { pdf: { url: cb('/out/plex.pdf') } } })
  ok(plex.status === 200, 'convert: IBM Plex Sans Arabic deck → 200', JSON.stringify(plex.json))
  ok(plex.json.pages === 1, 'convert: reports one page', `pages=${plex.json.pages}`)
  ok(Array.isArray(plex.json.fonts?.substituted) && plex.json.fonts.substituted.length === 0, 'convert: no font substituted', JSON.stringify(plex.json.fonts))
  ok(plex.json.fonts?.inPdf?.some((f) => /IBMPlexSansArabic/.test(f)), 'convert: the PDF embeds IBM Plex Sans Arabic — LibreOffice used the manifest font', JSON.stringify(plex.json.fonts?.inPdf))
  const pdf = stored.get('plex.pdf')
  ok(pdf && pdf.body.subarray(0, 5).toString() === '%PDF-', 'convert: PUT a PDF to the output URL', `type=${pdf?.type} bytes=${pdf?.body.length}`)

  // 2. Pages from that PDF: WebP at the specified long edge, not blank.
  const pages = await post('/pages', { input: { url: cb('/out/plex.pdf') }, output: { pages: [{ n: 1, url: cb('/out/p1.webp'), thumbUrl: cb('/out/t1.webp') }] } })
  ok(pages.status === 200 && pages.json.rendered === 1, 'pages: rendered page 1', JSON.stringify(pages.json))
  const p1 = stored.get('p1.webp')
  const t1 = stored.get('t1.webp')
  const isWebp = (b) => b && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'
  ok(isWebp(p1?.body) && p1.type === 'image/webp', 'pages: page image is WebP', `type=${p1?.type}`)
  ok(isWebp(t1?.body), 'pages: thumbnail is WebP')
  // WebP dimensions: a lossy 'VP8 ' frame stores them plainly at 26/28; a
  // lossless 'VP8L' frame stores 14-bit width-1 / height-1 after the signature.
  const dims = (b) => {
    if (!b) return null
    const fourcc = b.subarray(12, 16).toString()
    if (fourcc === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
    if (fourcc === 'VP8L') {
      const bits = b.readUInt32LE(21)
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }
    }
    return { fourcc }
  }
  const d = dims(p1?.body)
  ok(d && Math.max(d.w, d.h) === 1600, 'pages: long edge is 1600 px (07 §4.5)', JSON.stringify(d))
  ok(p1?.body.length > 8_000, 'pages: page image is not blank', `${p1?.body.length} bytes`)

  // 3. A deck in a family the image lacks is reported by name.
  const cairo = await post('/convert', { input: { url: cb('/fixtures/cairo-missing.pptx'), kind: 'powerpoint' }, output: { pdf: { url: cb('/out/cairo.pdf') } } })
  ok(cairo.status === 200, 'convert: deck in a missing family still converts', JSON.stringify(cairo.json))
  ok(cairo.json.fonts?.substituted?.includes('Cairo'), 'convert: reports "Cairo" as substituted (REQ-MAT-011)', JSON.stringify(cairo.json.fonts))

  // 4. Sniffing: what the caller claims does not matter.
  const lied = await post('/convert', { input: { url: cb('/fixtures/plex-arabic.pptx'), kind: 'pdf' }, output: {} })
  ok(lied.status === 415, 'convert: a PowerPoint declared as PDF is refused (415)', `${lied.status} ${JSON.stringify(lied.json)}`)
  const https = await post('/convert', { input: { url: 'ftp://example.com/x', kind: 'pdf' }, output: {} })
  ok(https.status === 400, 'convert: a non-http(s) URL is refused (400)')
} finally {
  await stop()
}

console.log(failed ? `\n${failed} check(s) failed` : '\nconverter smoke test passed')
process.exit(failed ? 1 : 0)
