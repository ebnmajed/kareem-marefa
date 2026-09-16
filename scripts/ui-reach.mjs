#!/usr/bin/env node
// Does a route reach the design system? — DEC-130's measure, part (1).
//
// A route counts only when its `page.tsx` reaches `src/components/ui/` through
// its import graph: directly, or through a component it imports, at any depth.
// Type-only imports are skipped — they render nothing.
//
// ★ STRICT BY DEFAULT. `button.tsx`, `dialog.tsx` and `icons.tsx` predate M9
// (`16` §1.1: "`src/components/ui/` contains three files"), so a page that
// reaches `ui/` only through a legacy `ButtonLink` is not on the system and
// does not count. `--loose` counts any `ui/` file, for comparison.
//
// Part (2) of the measure — a 390 px RTL capture that someone LOOKED AT — is
// not computable, and this script does not pretend otherwise.
//
//   node scripts/ui-reach.mjs            the group totals
//   node scripts/ui-reach.mjs -v         every route, ✓ or ·
//   node scripts/ui-reach.mjs --wave6    the fourteen of DEC-130
//   node scripts/ui-reach.mjs --loose    count the pre-M9 files too
//   node scripts/ui-reach.mjs <file…>    any files, with the path that reaches

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const loose = args.includes("--loose");
const verbose = args.includes("-v");
const UI = path.join(root, "src", "components", "ui") + path.sep;
const PRE_M9 = new Set(["button.tsx", "dialog.tsx", "icons.tsx"]);

const importRe = /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/gm;

function resolve(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(root, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

function isSystem(file) {
  if (!file.startsWith(UI)) return false;
  return loose || !PRE_M9.has(path.basename(file));
}

/** The import trail from `file` to the first system primitive, or null. */
function trail(file, seen = new Set()) {
  if (isSystem(file)) return [file];
  if (file.startsWith(UI) || seen.has(file)) return null;
  seen.add(file);
  for (const m of fs.readFileSync(file, "utf8").matchAll(importRe)) {
    if (m[1]) continue;
    const next = resolve(file, m[2]);
    const t = next && trail(next, seen);
    if (t) return [file, ...t];
  }
  return null;
}

const rel = (f) => path.relative(root, f);
const reaches = (f) => !!trail(path.join(root, f));

function pages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? pages(p) : e.name === "page.tsx" ? [rel(p)] : [];
  });
}

const L = "src/app/[locale]";
const WAVE6 = [
  ["lead", `${L}/(auth)/sign-in/page.tsx`],
  ["lead", `${L}/(auth)/choose-org/page.tsx`],
  ["lead", `${L}/(auth)/no-access/page.tsx`],
  ["sessions", `${L}/app/page.tsx`],
  ["sessions", `${L}/app/sessions/page.tsx`],
  ["sessions", `${L}/app/sessions/[id]/page.tsx`],
  ["content", "src/components/event/comments.tsx"],
  ["content", "src/components/materials/list.tsx"],
  ["content", `${L}/app/sessions/[id]/materials/[materialId]/page.tsx`],
  ["content", "src/components/photos/gallery.tsx"],
  ["console", `${L}/app/admin/page.tsx`],
  ["console", `${L}/app/admin/proposals/page.tsx`],
  ["console", `${L}/app/admin/sessions/page.tsx`],
  ["console", `${L}/app/admin/members/page.tsx`],
  ["console", `${L}/app/admin/moderation/reports/page.tsx`],
  ["console", `${L}/app/admin/layout.tsx`],
];

const files = args.filter((a) => !a.startsWith("-"));
const mode = loose ? "loose" : "strict";

if (files.length) {
  for (const f of files) {
    const t = trail(path.join(root, f));
    console.log(`${t ? "✓" : "·"} ${f}${t ? "\n    " + t.map(rel).join("\n    → ") : ""}`);
  }
} else if (args.includes("--wave6")) {
  let ok = 0;
  for (const [owner, f] of WAVE6) {
    const hit = reaches(f);
    ok += hit ? 1 : 0;
    console.log(`${hit ? "✓" : "·"} ${owner.padEnd(9)} ${f}`);
  }
  console.log(`\n${ok}/${WAVE6.length} reach the system (${mode}) — part (1) only; part (2) is a capture someone looked at`);
} else {
  const all = pages(path.join(root, L));
  const groups = [
    ["(auth)", /\/\(auth\)\//],
    ["app/admin", /\]\/app\/admin\//],
    ["app/sessions", /\]\/app\/sessions\//],
    ["app/me", /\]\/app\/me\//],
    ["app/platform", /\]\/app\/platform\//],
    ["/app", /\]\/app\/page\.tsx$/],
  ];
  console.log(`ui reach (${mode})`);
  for (const [name, re] of groups) {
    const ps = all.filter((p) => re.test(p));
    const hits = ps.filter(reaches);
    console.log(`  ${name.padEnd(13)} ${hits.length}/${ps.length}`);
    if (verbose) for (const p of ps) console.log(`      ${hits.includes(p) ? "✓" : "·"} ${p}`);
  }
}
