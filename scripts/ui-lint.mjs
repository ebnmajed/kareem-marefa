#!/usr/bin/env node
// ui-lint — the design system's own gate (REQ-UIX-001, DEC-087).
//
//   node scripts/ui-lint.mjs            # check against the allowlist
//   node scripts/ui-lint.mjs --prune    # rewrite the allowlist DOWN to what is on disk
//   node scripts/ui-lint.mjs --strict   # ignore the allowlist entirely (this is M13)
//
// Two rules, over src/app/** and src/components/**:
//
//   field         a JSX <input>/<select>/<textarea> with no <Field> ancestor
//   class-string  a string literal matching /rounded-field border border-edge(-strong)?/
//
// ★ BOTH rules exclude src/components/ui/ and it is not optional. `ui/input.tsx` and
// `ui/select.tsx` MUST contain a raw <input> that is not wrapped in <Field> — they are what
// <Field> wraps — and `ui/*.tsx` is the one place the control class string is allowed to be
// written down. A pass scoped to src/components/** without this exclusion fails the primitives
// it exists to protect, which is exactly the shape of gate that gets disabled a week later.
//
// THE ALLOWLIST MAY ONLY SHRINK. 65 files carry `rounded-field border border-edge-strong`
// today and 105 carry one of the two variants; a gate that hard-fails from M9 blocks every PR
// until M13. So the allowlist records a per-file, per-rule COUNT: more than the recorded count
// fails, fewer is progress and is reported. It flips to --strict in M13 (`16` §16.1).
//
// The parse is `typescript`, which is already a dependency, rather than ts-morph, which is not
// (DEC-104). A walk over a TSX AST needs no object model.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ALLOWLIST = join(ROOT, 'scripts', 'ui-lint-allowlist.json')
const PRUNE = process.argv.includes('--prune')
const STRICT = process.argv.includes('--strict')

const ROOTS = ['src/app', 'src/components']
const EXCLUDE = ['src/components/ui/'] // see the note above — load-bearing for both rules
const CLASS_STRING = /rounded-field\s+border\s+border-edge(-strong)?\b/
const CONTROLS = new Set(['input', 'select', 'textarea'])
// `// ui-lint-disable-next-line <rule> — <reason>` on the line before. The reason is not
// enforced by the script and is enforced by review, which is the right place for it.
const ESCAPE = /ui-lint-disable-next-line\s+(field|class-string)/

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      yield* walk(full)
    } else if (/\.tsx$/.test(entry)) {
      yield full
    }
  }
}

const tagName = (node) => {
  const open = ts.isJsxElement(node) ? node.openingElement : node
  const name = open.tagName
  if (ts.isIdentifier(name)) return name.text
  if (ts.isPropertyAccessExpression(name)) return name.name.text // <Form.Field>
  return ''
}

// A hidden input is not a control a member fills in; wrapping it in a labelled <Field> would be
// wrong, not merely unnecessary. Same for a file input inside `ui/file-drop`'s consumers, which
// carry their own labelling — those go in the allowlist with a reason, not here.
const isHidden = (node) => {
  const open = ts.isJsxElement(node) ? node.openingElement : node
  return open.attributes.properties.some(
    (p) =>
      ts.isJsxAttribute(p) &&
      p.name.getText() === 'type' &&
      p.initializer &&
      ts.isStringLiteral(p.initializer) &&
      p.initializer.text === 'hidden'
  )
}

function lintFile(file) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const hits = { field: [], 'class-string': [] }

  const suppressed = (pos, rule) => {
    const line = src.getLineAndCharacterOfPosition(pos).line
    const prev = lines[line - 1] ?? ''
    const m = prev.match(ESCAPE)
    return m ? m[1] === rule : false
  }

  const hasFieldAncestor = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isJsxElement(p) && tagName(p) === 'Field') return true
    }
    return false
  }

  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const name = tagName(node)
      if (CONTROLS.has(name) && !isHidden(node) && !hasFieldAncestor(node)) {
        const { line } = src.getLineAndCharacterOfPosition(node.getStart(src))
        if (!suppressed(node.getStart(src), 'field')) hits.field.push({ line: line + 1, name })
      }
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && CLASS_STRING.test(node.text)) {
      const { line } = src.getLineAndCharacterOfPosition(node.getStart(src))
      if (!suppressed(node.getStart(src), 'class-string')) hits['class-string'].push({ line: line + 1 })
    }
    if (ts.isTemplateExpression(node)) {
      // a class string split across a template's spans still reads as one string to a human
      const flat = node.head.text + node.templateSpans.map((s) => s.literal.text).join(' ')
      if (CLASS_STRING.test(flat)) {
        const { line } = src.getLineAndCharacterOfPosition(node.getStart(src))
        if (!suppressed(node.getStart(src), 'class-string')) hits['class-string'].push({ line: line + 1 })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(src)
  return hits
}

// ── run ───────────────────────────────────────────────────────────────────
const files = ROOTS.flatMap((r) => [...walk(join(ROOT, r))])
  .map((f) => relative(ROOT, f).split('\\').join('/'))
  .filter((f) => !EXCLUDE.some((e) => f.startsWith(e)))
  .sort()

const found = {}
for (const f of files) {
  const hits = lintFile(join(ROOT, f))
  const counts = {}
  for (const rule of ['field', 'class-string']) if (hits[rule].length) counts[rule] = hits[rule].length
  if (Object.keys(counts).length) found[f] = { counts, hits }
}

if (PRUNE) {
  const next = {}
  for (const f of Object.keys(found).sort()) next[f] = found[f].counts
  writeFileSync(
    ALLOWLIST,
    JSON.stringify(
      {
        $comment:
          'ui-lint allowlist (DEC-087). MAY ONLY SHRINK. A count is the number of existing violations a file is permitted to keep; exceeding it fails CI, going below it is progress. Regenerate DOWNWARD with `node scripts/ui-lint.mjs --prune`, never upward to admit a new one. Empty by M13, when the gate flips to --strict.',
        files: next,
      },
      null,
      2
    ) + '\n'
  )
  const total = Object.values(next).reduce((n, c) => n + Object.values(c).reduce((a, b) => a + b, 0), 0)
  console.log(`✓ allowlist written: ${Object.keys(next).length} files · ${total} violations`)
  process.exit(0)
}

let allow = { files: {} }
if (!STRICT) {
  try {
    allow = JSON.parse(readFileSync(ALLOWLIST, 'utf8'))
  } catch {
    console.error(`✗ ${relative(ROOT, ALLOWLIST)} is missing. Run \`node scripts/ui-lint.mjs --prune\` once and commit it.`)
    process.exit(1)
  }
}

const failures = []
let allowed = 0
let shrunk = 0
for (const f of files) {
  const actual = found[f]?.counts ?? {}
  const permitted = allow.files?.[f] ?? {}
  for (const rule of ['field', 'class-string']) {
    const a = actual[rule] ?? 0
    const p = permitted[rule] ?? 0
    if (a > p) {
      for (const h of found[f].hits[rule].slice(0, 5)) {
        failures.push(
          rule === 'field'
            ? `${f}:${h.line}  <${h.name}> is not inside <Field> — the system owns form control markup (REQ-UIX-001)`
            : `${f}:${h.line}  a control class string the system already owns — use src/components/ui/ (REQ-UIX-001)`
        )
      }
      if (p) failures.push(`${f}  ${rule}: ${a} violations, allowlist permits ${p}`)
    } else {
      allowed += a
      if (a < p) shrunk += p - a
    }
  }
}
// A file in the allowlist that no longer exists, or whose violations are gone, is dead weight.
for (const f of Object.keys(allow.files ?? {})) {
  if (!files.includes(f)) shrunk += Object.values(allow.files[f]).reduce((a, b) => a + b, 0)
}

if (failures.length) {
  console.error(`\n✗ ui-lint (${failures.length}):`)
  for (const l of failures.slice(0, 40)) console.error(`    ${l}`)
  if (failures.length > 40) console.error(`    … and ${failures.length - 40} more`)
  console.error('\nThe allowlist may only SHRINK. Fix the violation, or — if it is genuinely')
  console.error('correct — add `// ui-lint-disable-next-line <rule> — <reason>` above the line.\n')
  process.exit(1)
}
const msg = shrunk ? ` · ${shrunk} fewer than the allowlist permits — run --prune` : ''
console.log(`✓ ui-lint · ${files.length} files · ${allowed} pre-existing violations held${msg}`)
