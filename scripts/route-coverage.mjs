#!/usr/bin/env node
// loading-coverage and error-coverage — REQ-UIX-005, REQ-UIX-016, DEC-087, DEC-091.
//
//   node scripts/route-coverage.mjs --kind=loading   # npm run loading-coverage
//   node scripts/route-coverage.mjs --kind=error     # npm run error-coverage
//   node scripts/route-coverage.mjs --prune          # rewrite the allowlist DOWN to disk
//   node scripts/route-coverage.mjs --strict         # ignore the allowlist (this is M13)
//
// ★ "AT OR ABOVE" IS LOAD-BEARING. A loading.tsx covers its own segment AND every child
// segment, so the 49 pages under src/app/[locale]/app/** need roughly a DOZEN files at
// meaningful boundaries — not 49. A gate written as "one per route" produces 49 files, 37 of
// which are noise, and the team deletes the gate rather than the files (`16` §17).
//
// error-coverage additionally asserts three things loading-coverage has no analogue for:
//   · every DYNAMIC segment ([id], [code], [...rest]) that has a page has a not-found.tsx at or
//     above it — notFound() is already called in six places with no boundary to catch it;
//   · global-error.tsx exists;
//   · global-error.tsx contains dir="rtl" — it replaces the root layout, so there is no
//     NextIntlClientProvider and no <html lang> above it and getTranslations is unavailable BY
//     CONSTRUCTION. It is the one file in the product that may hard-code Arabic, and the one
//     that renders Next's English left-to-right default if it does not exist (DEC-091).
//
// Route groups — (auth), (dev), (marketing) — are directories that add no URL segment, and a
// boundary file inside one still covers its children, so the plain directory walk is correct.
// @parallel and @intercepted routes do not exist in this app; if one is added, this walk needs
// to learn about them before it is trusted.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCOPE = join(ROOT, 'src/app/[locale]/app') // the 49 pages this milestone is scoped to
const GLOBAL_ERROR = join(ROOT, 'src/app/global-error.tsx')
const ALLOWLIST = join(ROOT, 'scripts', 'route-coverage-allowlist.json')

const argKind = process.argv.find((a) => a.startsWith('--kind='))?.slice(7)
const KINDS = argKind ? [argKind] : ['loading', 'error']
const PRUNE = process.argv.includes('--prune')
const STRICT = process.argv.includes('--strict')
const isDynamic = (seg) => seg.startsWith('[')

function pageDirs(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (!statSync(full).isDirectory()) continue
    pageDirs(full, acc)
  }
  if (existsSync(join(dir, 'page.tsx'))) acc.push(dir)
  return acc
}

// Walk up to SCOPE inclusive, looking for `file`. Anything above SCOPE belongs to the locale
// layout and is not this gate's business.
function coveredAtOrAbove(dir, file) {
  let d = dir
  for (;;) {
    if (existsSync(join(d, file))) return relative(ROOT, join(d, file)).split('\\').join('/')
    if (d === SCOPE) return null
    const up = dirname(d)
    if (up === d) return null
    d = up
  }
}

const dirs = pageDirs(SCOPE).sort()
const rel = (d) => relative(ROOT, d).split('\\').join('/')

const missing = { loading: [], error: [], 'not-found': [] }
for (const d of dirs) {
  if (!coveredAtOrAbove(d, 'loading.tsx')) missing.loading.push(rel(d))
  if (!coveredAtOrAbove(d, 'error.tsx')) missing.error.push(rel(d))
  // A not-found boundary is only required where a dynamic segment can fail to resolve — and the
  // segments are measured from SCOPE, not from the repo root: `[locale]` sits above it and is
  // dynamic for every route in the product, so counting it would demand a not-found.tsx beside
  // all 49 pages and make the gate meaningless.
  const hasDynamic = relative(SCOPE, d).split(/[\\/]/).filter(Boolean).some(isDynamic)
  if (hasDynamic && !coveredAtOrAbove(d, 'not-found.tsx')) missing['not-found'].push(rel(d))
}

if (PRUNE) {
  writeFileSync(
    ALLOWLIST,
    JSON.stringify(
      {
        $comment:
          'route-coverage allowlist (DEC-087, DEC-091). MAY ONLY SHRINK. Each list holds the page segments still permitted to have no boundary at or above them. Regenerate DOWNWARD with `node scripts/route-coverage.mjs --prune`, never upward to admit a new one. Empty by M13, when the gate flips to --strict.',
        loading: missing.loading,
        error: missing.error,
        'not-found': missing['not-found'],
        globalError: !existsSync(GLOBAL_ERROR),
      },
      null,
      2
    ) + '\n'
  )
  console.log(
    `✓ allowlist written: ${missing.loading.length} loading · ${missing.error.length} error · ${missing['not-found'].length} not-found`
  )
  process.exit(0)
}

let allow = { loading: [], error: [], 'not-found': [], globalError: false }
if (!STRICT) {
  try {
    allow = JSON.parse(readFileSync(ALLOWLIST, 'utf8'))
  } catch {
    console.error(`✗ ${relative(ROOT, ALLOWLIST)} is missing. Run \`node scripts/route-coverage.mjs --prune\` once and commit it.`)
    process.exit(1)
  }
}

const failures = []
const shrunk = []

const check = (kind, label) => {
  const permitted = new Set(allow[kind] ?? [])
  for (const d of missing[kind]) {
    if (!permitted.has(d)) failures.push(`${d} has a page.tsx and no ${label} at or above it`)
  }
  for (const d of permitted) if (!missing[kind].includes(d)) shrunk.push(`${kind}: ${d}`)
}

if (KINDS.includes('loading')) check('loading', 'loading.tsx')
if (KINDS.includes('error')) {
  check('error', 'error.tsx')
  check('not-found', 'not-found.tsx')
  if (!existsSync(GLOBAL_ERROR)) {
    if (!allow.globalError) failures.push('src/app/global-error.tsx does not exist — the root has no boundary (REQ-UIX-016)')
  } else {
    if (allow.globalError) shrunk.push('globalError')
    const body = readFileSync(GLOBAL_ERROR, 'utf8')
    // Not negotiable and not allowlistable: it is the ONE file that cannot get its direction
    // from a provider, so if it lacks dir="rtl" a member meets an English LTR page.
    if (!/dir\s*=\s*["'{`]?\s*rtl/.test(body)) {
      failures.push('src/app/global-error.tsx does not contain dir="rtl" — it has no provider above it (DEC-091)')
    }
    // ★ Comments are stripped before this test, and that is not fussiness: the
    // first version matched the file's own explanation of why it cannot use
    // next-intl, which is exactly the prose that has to be there for the next
    // reader. A gate that punishes its own documentation gets deleted.
    const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    if (/from\s+['"]next-intl/.test(code) || /\b(getTranslations|useTranslations)\s*\(/.test(code)) {
      failures.push('src/app/global-error.tsx uses next-intl — it replaces the root layout, so there is no provider; hand-write the two sentences (DEC-091)')
    }
  }
}

if (failures.length) {
  console.error(`\n✗ route-coverage (${failures.length}):`)
  for (const l of failures.slice(0, 30)) console.error(`    ${l}`)
  if (failures.length > 30) console.error(`    … and ${failures.length - 30} more`)
  console.error('\nA boundary covers its segment AND its children — place one at a meaningful')
  console.error('boundary, not one per route. The allowlist may only shrink.\n')
  process.exit(1)
}
const note = shrunk.length ? ` · ${shrunk.length} fewer than the allowlist permits — run --prune` : ''
console.log(`✓ route-coverage [${KINDS.join(', ')}] · ${dirs.length} pages under src/app/[locale]/app${note}`)
