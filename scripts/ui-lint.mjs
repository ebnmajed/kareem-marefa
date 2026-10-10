#!/usr/bin/env node
// ui-lint — the design system's own gate (REQ-UIX-001, DEC-087).
//
//   node scripts/ui-lint.mjs            # every file, no exceptions (strict since M13)
//
// ★ M13 (wave 11, DEC-087's flip): the allowlist reached ZERO and was deleted in the same commit
// as this change. There is nothing to prune and nothing may be admitted; `--strict` is accepted and
// changes nothing; `--prune` refuses. A control the system genuinely cannot express takes a
// reasoned `ui-lint-disable-next-line`, approved in review — never a list.
//
// Two rules, over src/app/** and src/components/** — and ★ a third, `keyframes`, over globals.css and src/lib/ui (wave 29):
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
// (History, M9 → M13.) THE ALLOWLIST MAY ONLY SHRINK. 65 files carry `rounded-field border border-edge-strong`
// today and 105 carry one of the two variants; a gate that hard-fails from M9 blocks every PR
// until M13. So the allowlist records a per-file, per-rule COUNT: more than the recorded count
// fails, fewer is progress and is reported. It flips to --strict in M13 (`16` §16.1).
//
// The parse is `typescript`, which is already a dependency, rather than ts-morph, which is not
// (DEC-104). A walk over a TSX AST needs no object model.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
if (process.argv.includes('--prune')) {
  console.error('✗ ui-lint has no allowlist since M13 (DEC-087): it reached zero and was deleted. Fix the violation.')
  process.exit(1)
}

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

const failures = []
for (const f of Object.keys(found)) {
  for (const rule of ['field', 'class-string']) {
    for (const h of found[f].hits[rule]) {
      failures.push(
        rule === 'field'
          ? `${f}:${h.line}  <${h.name}> is not inside <Field> — the system owns form control markup (REQ-UIX-001)`
          : `${f}:${h.line}  a control class string the system already owns — use src/components/ui/ (REQ-UIX-001)`
      )
    }
  }
}

// ★ Rule 3, `keyframes` — wave 29 (DEC-280 §5, REQ-UIX-020, REQ-UIX-130). Motion moves only `transform`, `opacity` and
// `filter`. Every `@keyframes` in `globals.css`, and every keyframe passed to `element.animate()` under
// `src/lib/ui/`, animates nothing else — unless the line right above it carries a written reason,
// `ui-lint-keyframes: <why>`. The two the transitions spec names are the story portal's `border-radius` and the
// poster's view-transition group (whose size the browser animates, so it is never written here); the five that predate
// the rule carry theirs: the mark's and the sting's stroke draws, the cut-in's clip, the stepper's colour.
const MOTION_OK = new Set(['transform', 'opacity', 'filter', 'translate', 'scale', 'rotate', 'offset', 'animation-timing-function', 'transform-origin', 'transformOrigin', 'easing'])
const REASON = /ui-lint-keyframes:\s*\S/
{
  const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8')
  const lines = css.split('\n')
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let depth = 1
    let j = m.index + m[0].length
    while (depth && j < css.length) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    const body = css.slice(m.index + m[0].length, j - 1).replace(/\/\*[\s\S]*?\*\//g, '')
    const bad = [...body.matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1]).filter((p) => !MOTION_OK.has(p))
    const line = css.slice(0, m.index).split('\n').length
    if (bad.length && !REASON.test(lines[line - 2] ?? '')) {
      failures.push(`src/app/globals.css:${line}  @keyframes ${m[1]} animates ${[...new Set(bad)].join(', ')} — transform, opacity and filter only (REQ-UIX-020), or a \`ui-lint-keyframes:\` reason above it`)
    }
  }
  const libUi = join(ROOT, 'src/lib/ui')
  for (const name of readdirSync(libUi).filter((n) => n.endsWith('.ts'))) {
    const src = readFileSync(join(libUi, name), 'utf8')
    const srcLines = src.split('\n')
    srcLines.forEach((text, i) => {
      if (!/^\s*\{\s*[a-zA-Z]+\s*:/.test(text) || !/\.animate\(/.test(srcLines.slice(Math.max(0, i - 6), i + 1).join('\n'))) return
      const keys = [...text.matchAll(/([a-zA-Z]+)\s*:/g)].map((k) => k[1])
      const bad = keys.filter((k) => !MOTION_OK.has(k) && !['duration', 'fill', 'iterations', 'delay', 'composite'].includes(k))
      if (bad.length && !srcLines.slice(Math.max(0, i - 8), i).some((l) => REASON.test(l))) {
        failures.push(`src/lib/ui/${name}:${i + 1}  element.animate() moves ${bad.join(', ')} — transform, opacity and filter only, or a \`ui-lint-keyframes:\` reason above it`)
      }
    })
  }
}

if (failures.length) {
  console.error(`\n✗ ui-lint (${failures.length}):`)
  for (const l of failures.slice(0, 40)) console.error(`    ${l}`)
  if (failures.length > 40) console.error(`    … and ${failures.length - 40} more`)
  console.error('\nui-lint is strict since M13 (DEC-087). Fix the violation, or — only if the system genuinely cannot')
  console.error('express the control — add `// ui-lint-disable-next-line <rule> — <reason>` above the line, for review.\n')
  process.exit(1)
}
console.log(`✓ ui-lint · ${files.length} files · strict — no allowlist, no exceptions but reasoned escapes · keyframes: transform, opacity, filter`)
