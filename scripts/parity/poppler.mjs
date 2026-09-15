// Path 4 — our PDF through poppler, the way a PDF material's page images are
// produced (07 §4.5, REQ-DSG-015, DEC-058).
//
// SKIPPED LOUDLY, NEVER SILENTLY. Without `pdftoppm`, `pdffonts` and `cwebp`
// on the PATH the harness reports «21 of 28 — poppler path not available»
// and exits on the other three paths' result. A skip that reads like a pass
// is how a suite comes to test nothing, and 06 §9.3 is explicit that the
// goldens exist to stop exactly that.
//
// This is the same tool chain worker/src/content/pdf.ts runs inside the
// worker image — pdftoppm's PNG at the 1600 px long edge, then cwebp at
// quality 82 — so what CI measures inside that image is what a member's
// page image is. Until DEC-058 the path posted the PDF to the credential-free
// converter (DEC-032); the goldens did not move when it came home.

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
const PAGE_LONG_EDGE = 1600
const PAGE_QUALITY = 82

async function run(cmd, args) {
  return execFileP(cmd, args, { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 })
}

async function available() {
  for (const tool of ['pdfinfo', 'pdffonts', 'pdftoppm', 'cwebp']) {
    try {
      await run(tool, tool === 'cwebp' ? ['-version'] : ['-v'])
    } catch (e) {
      if (e?.code === 'ENOENT') return { ok: false, reason: `${tool} is not on the PATH` }
      // `-v` exits non-zero on some poppler builds after printing the version — that is present.
    }
  }
  return { ok: true }
}

/** pdffonts' table: two header lines, then rows whose last five columns are
 *  `emb sub uni objectID gen`. Names are PostScript names, subset tag stripped. */
export function parsePdfFonts(stdout) {
  const fonts = []
  for (const line of stdout.split('\n').slice(2)) {
    const tokens = line.trim().split(/\s+/)
    if (tokens.length < 6) continue
    const emb = tokens[tokens.length - 5]
    if (emb !== 'yes' && emb !== 'no') continue
    const name = tokens[0].replace(/^[A-Z]{6}\+/, '')
    if (!name || name === '[none]') continue
    fonts.push({ name, embedded: emb === 'yes' })
  }
  return fonts
}

/**
 * Runs the PDF through poppler and returns what path 4 can honestly assert.
 *
 * `substituted` is the valuable one. Our Chromium PDF embeds its faces as
 * subsets; if pdffonts reports a face that is not embedded, the export
 * claims a font it did not carry — which is REQ-CRT-005's «renders
 * correctly on a machine with no fonts installed» failing, and it fails
 * invisibly because the PDF still opens and still looks like Arabic.
 */
export async function runPopplerPath(pdf, { pageCount = 1 } = {}) {
  const tools = await available()
  if (!tools.ok) return { skipped: true, reason: tools.reason }

  const dir = await mkdtemp(join(tmpdir(), 'parity-poppler-'))
  try {
    const input = join(dir, 'input.pdf')
    await writeFile(input, pdf)

    const fonts = parsePdfFonts((await run('pdffonts', [input])).stdout)
    const { stdout: info } = await run('pdfinfo', [input])
    const total = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0)
    const sizeMatch = info.match(/^Page size:\s+([\d.]+) x ([\d.]+)/m)
    const landscape = sizeMatch ? Number(sizeMatch[1]) >= Number(sizeMatch[2]) : true
    const scale = landscape ? ['-scale-to-x', String(PAGE_LONG_EDGE), '-scale-to-y', '-1'] : ['-scale-to-x', '-1', '-scale-to-y', String(PAGE_LONG_EDGE)]

    const pageBytes = []
    for (let n = 1; n <= Math.min(pageCount, total); n++) {
      const stem = join(dir, `p${n}`)
      await run('pdftoppm', ['-f', String(n), '-l', String(n), '-singlefile', '-png', ...scale, input, stem])
      await run('cwebp', ['-quiet', '-q', String(PAGE_QUALITY), `${stem}.png`, '-o', `${stem}.webp`])
      pageBytes.push(await readFile(`${stem}.webp`))
    }

    return {
      skipped: false,
      substituted: fonts.filter((f) => !f.embedded).map((f) => f.name),
      embedded: fonts.filter((f) => f.embedded).map((f) => f.name),
      pageBytes,
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
