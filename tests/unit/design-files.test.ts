// The design files never reach the build — REQ-UIX-063, STORY-UIX-046, DEC-206.
//
// `docs/design/` holds the drawings a screen is REBUILT from: the prototypes under
// `prototypes/` and, from wave 18, the artboards under `screens/<batch>/`. They are
// references for layout, size and copy, and nothing in them is a component
// (`docs/design/README.md`). Three rules, and none has an allowlist:
//   1. nothing under `src/` imports from `docs/`;
//   2. no `.dc.html` file stands under `src/` or `public/`;
//   3. no class name a drawing declares appears in a `className` in `src/`.
// The class names are READ from the drawings, never kept here, so a new batch of
// artboards is covered the day it lands.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string, keep: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, keep) : keep(name) ? [path] : [];
  });
}

const SOURCES = walk("src", (n) => /\.(tsx?|mjs|css)$/.test(n));
const DRAWINGS = walk("docs/design", (n) => n.endsWith(".html"));

/** Identifier-shaped class names from `class="…"` — an operator or an interpolation is not a name. */
const CLASS_NAME = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/i;
function drawnClasses(html: string): Set<string> {
  const out = new Set<string>();
  for (const m of html.matchAll(/\bclass="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (CLASS_NAME.test(c)) out.add(c);
  return out;
}
function sourceClasses(code: string): Set<string> {
  const out = new Set<string>();
  for (const m of code.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|'([^']*)')/g)) {
    // ★ wave 20: a template literal's `${…}` is an expression, not class text — `${own ? frame : "border-edge"}` names
    // a variable, and a quoted value in it may be a comparison (`side === "end"`). It is dropped before splitting,
    // exactly as its quoted strings always were (a token with its quotes never matched CLASS_NAME).
    const text = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
    for (const c of text.split(/\s+/)) if (CLASS_NAME.test(c)) out.add(c);
  }
  return out;
}
const importsDocs = (code: string) => /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'][^"']*(?:^|\/|@\/)docs\//m.test(code) || /(?:from\s+|import\s*\()["']docs\//.test(code);

describe("the design files never reach the build (REQ-UIX-063)", () => {
  it("finds the drawings — a gate over nothing passes everything", () => {
    expect(DRAWINGS.some((f) => f.endsWith(".dc.html"))).toBe(true);
    expect(DRAWINGS.some((f) => f.includes("prototypes/"))).toBe(true);
    expect(SOURCES.length).toBeGreaterThan(100);
  });

  it("nothing under src/ imports from docs/", () => {
    expect(SOURCES.filter((f) => importsDocs(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("no .dc.html stands under src/ or public/", () => {
    expect([...walk("src", (n) => n.endsWith(".dc.html")), ...walk("public", (n) => n.endsWith(".dc.html"))]).toEqual([]);
  });

  it("no class name a drawing declares appears in a className in src/", () => {
    const drawn = new Set(DRAWINGS.flatMap((f) => [...drawnClasses(readFileSync(f, "utf8"))]));
    expect(drawn.size).toBeGreaterThan(50);
    const found: string[] = [];
    for (const f of SOURCES) for (const c of sourceClasses(readFileSync(f, "utf8"))) if (drawn.has(c)) found.push(`${f}: ${c}`);
    expect(found).toEqual([]);
  });

  it("bites: each rule refuses what it is meant to refuse", () => {
    expect(importsDocs(`import x from "../../docs/design/screens/m10a/Home.dc.html";`)).toBe(true);
    expect(importsDocs(`import x from "docs/design/x";`)).toBe(true);
    expect(importsDocs(`import { Card } from "@/components/ui/card";`)).toBe(false);
    const drawn = drawnClasses(`<div class="story-frame hud">`);
    expect([...sourceClasses(`<div className="flex story-frame" />`)].filter((c) => drawn.has(c))).toEqual(["story-frame"]);
    expect([...sourceClasses("<div className={`hud ${x}`} />")].filter((c) => drawn.has(c))).toEqual(["hud"]);
  });
});
