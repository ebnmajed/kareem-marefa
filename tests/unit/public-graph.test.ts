// What the public site is made of — REQ-NFR-019, REQ-UIX-114, DEC-247, DEC-252.
//
// ★★ THIS FILE WAS REWRITTEN IN WAVE 26, ON PURPOSE, AND THE OLD RULE MUST NOT BE RESTORED AS A REGRESSION.
// From wave 15 to wave 25 it said «the playground never reaches the public site» (DEC-186 §6): a guard that
// protected the public routes while the APP was redesigned around them. Wave 26 is the wave that redesigns the
// public site itself, so the owner lifted that rule for the pages the wave rebuilds (DEC-247 §2). The public
// site is inside the playground now, under ONE scope its layout renders.
//
// What the guard was FOR survives, and is held here:
//   1. the set of primitives the public site renders is named one by one, so it cannot drift unseen;
//   2. the scope arrives once, from the route group's layout — no page and no component of the public site
//      renders or imports it (`scope-root.test.ts` holds the same rule for every surface);
//   3. the scope's class is still written in exactly one file.
//
// ★ What REQ-NFR-019 freezes was never in this file and is not loosened by it: the URLs, the registration
// BEHAVIOUR (`tests/e2e/wave26-lead-register-behaviour.spec.ts`, `qa:contract`) and the accessibility floor.
// APPEARANCE AND THE IMPORT GRAPH MAY CHANGE; BEHAVIOUR MAY NOT (DEC-247 §3).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve("src");
const ROOTS = ["src/app/[locale]/(marketing)", "src/app/[locale]/layout.tsx"];

function filesUnder(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => filesUnder(join(path, name))).filter((f) => /\.(tsx?|mjs)$/.test(f));
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null; // a package
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Value imports only: `import type` is erased and pulls nothing into a page. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specs = [...source.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  const bare = [...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  return [...specs, ...bare].map((s) => resolveImport(file, s)).filter((f): f is string => f !== null);
}

function graph(): Set<string> {
  const seen = new Set<string>();
  const queue = ROOTS.flatMap((r) => filesUnder(resolve(r)));
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    queue.push(...importsOf(file));
  }
  return seen;
}

// The primitives the rebuilt pages render. A new one here is a decision, made in a diff.
const PRIMITIVES = [
  "components/ui/button.tsx",
  "components/ui/field.tsx",
  "components/ui/icons.tsx",
  "components/ui/input.tsx",
  "components/ui/scope-portal.tsx",
  "components/ui/scope.tsx",
  "components/ui/textarea.tsx",
];

const reached = graph();
const rel = (f: string) => f.slice(SRC.length + 1);

describe("the public site's import graph", () => {
  it("is found, and is more than the pages themselves", () => {
    expect(reached.size).toBeGreaterThan(10);
    expect([...reached].map(rel)).toContain("components/registration-form.tsx");
  });

  it("reaches exactly these primitives, named one by one (DEC-247 §2.1)", () => {
    const primitives = [...reached].map(rel).filter((f) => f.startsWith("components/ui/") && f !== "components/ui/index.ts").sort();
    expect(primitives).toEqual(PRIMITIVES);
  });

  it("is inside the playground through ONE door: the route group's layout (DEC-247 §2.2)", () => {
    const importing = [...reached].filter((f) => /ui\/scope["']/.test(readFileSync(f, "utf8"))).map(rel).sort();
    expect(importing).toEqual(["app/[locale]/(marketing)/layout.tsx"]);
    // The locale's own layout is shared with every other surface and renders none.
    expect(readFileSync(resolve("src/app/[locale]/layout.tsx"), "utf8")).not.toMatch(/PlayScope|theme-play/);
  });

  it("the scope's class is written in one file", () => {
    const naming = filesUnder(SRC).filter((f) => readFileSync(f, "utf8").includes("theme-play")).map(rel).sort();
    expect(naming).toEqual(["components/ui/scope.tsx"]);
  });

  it("the old look has left it: no file it reaches applies `.theme-dark`", () => {
    // `ui/` primitives still carry the selector beside their `pg:` form; they are `ui-playground.test.ts`'s.
    const dark = [...reached].map(rel).filter((f) => /\.tsx?$/.test(f) && !f.startsWith("components/ui/") && /theme-dark/.test(readFileSync(join(SRC, f), "utf8")));
    expect(dark).toEqual([]);
  });

  it("the registration action and the schema are still what the form reaches", () => {
    expect([...reached].map(rel)).toEqual(expect.arrayContaining(["app/[locale]/(marketing)/register/actions.ts", "lib/schema.ts", "components/form-token.tsx"]));
  });
});
