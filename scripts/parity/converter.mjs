// Path 4 — our PDF through the converter's poppler, the way a PDF material's
// page images are produced (07 §4.5, REQ-DSG-015).
//
// SKIPPED LOUDLY, NEVER SILENTLY. With `CONVERTER_URL` unset the harness
// reports «21 of 28 — converter path not configured» and exits on the other
// three paths' result. A skip that reads like a pass is how a suite comes to
// test nothing, and 06 §9.3 is explicit that the goldens exist to stop
// exactly that.
//
// The converter holds no credentials by design (DEC-032): it takes a signed
// input URL and signed output URLs per request. The harness therefore stands
// up a one-request loopback server — serving the PDF, accepting the page
// PUTs — rather than reaching into Storage. `CONVERTER_ALLOW_HTTP=1` is what
// lets it accept a plain-http neighbour, and the converter's own boot guard
// refuses to start if anything credential-shaped is in its environment, so
// there is nothing here for a local server to leak.

import http from 'node:http'
import { once } from 'node:events'

/** A loopback server that serves one PDF and collects whatever is PUT back. */
async function stand(pdf) {
  const uploads = new Map()
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (req.method === 'GET' && url.pathname === '/input.pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf', 'content-length': pdf.byteLength })
      res.end(pdf)
      return
    }
    if (req.method === 'PUT') {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        uploads.set(url.pathname, Buffer.concat(chunks))
        res.writeHead(200)
        res.end('{}')
      })
      return
    }
    res.writeHead(404)
    res.end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  return { uploads, base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) }
}

async function post(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`converter ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

/**
 * Runs the PDF through the converter and returns what path 4 can honestly
 * assert.
 *
 * `fonts.substituted` is the valuable one. Our Chromium PDF embeds its faces
 * as subsets; if poppler reports a substitution, the export claims a font it
 * did not carry — which is REQ-CRT-005's «renders correctly on a machine
 * with no fonts installed» failing, and it fails invisibly because the PDF
 * still opens and still looks like Arabic.
 */
export async function runConverterPath(pdf, { pageCount = 1 } = {}) {
  const converterUrl = process.env.CONVERTER_URL
  if (!converterUrl) return { skipped: true, reason: 'CONVERTER_URL is not set' }

  const site = await stand(pdf)
  try {
    const report = await post(converterUrl, '/convert', {
      input: { url: `${site.base}/input.pdf`, kind: 'pdf' },
      // A PDF in is a PDF out; the call is made for the font report, which
      // is the only shaping evidence this path can produce.
      output: { pdf: { url: `${site.base}/out.pdf` } },
    })

    const pages = Array.from({ length: Math.min(pageCount, report.pages ?? pageCount) }, (_, i) => ({
      n: i + 1,
      url: `${site.base}/page-${i + 1}.webp`,
      thumbUrl: `${site.base}/thumb-${i + 1}.webp`,
    }))
    await post(converterUrl, '/pages', { input: { url: `${site.base}/input.pdf` }, output: { pages } })

    return {
      skipped: false,
      substituted: report.fonts?.substituted ?? [],
      embedded: report.fonts?.embedded ?? report.fonts?.used ?? [],
      pageBytes: pages.map((p) => site.uploads.get(new URL(p.url).pathname) ?? null),
    }
  } finally {
    await site.close()
  }
}
