// The playground never reaches the public site — DEC-186 §6, contract 5,
// REQ-NFR-019, REQ-UIX-028.
//
// `visual` proves the public routes LOOK the same. This proves why: no file the
// public site imports names the scope. It is the graph walk `sessions` ran at
// sync 1 to find that the public site renders five primitives and not eight,
// kept as a test so the count cannot drift unseen.
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

const reached = graph();
const rel = (f: string) => f.slice(SRC.length + 1);

describe("the public site's import graph", () => {
  it("is found, and is more than the pages themselves", () => {
    expect(reached.size).toBeGreaterThan(10);
    expect([...reached].map(rel)).toContain("components/registration-form.tsx");
  });

  it("reaches exactly five primitives: button, field, icons, input, textarea (DEC-186 §1)", () => {
    const primitives = [...reached].map(rel).filter((f) => f.startsWith("components/ui/") && f !== "components/ui/index.ts").sort();
    expect(primitives).toEqual([
      "components/ui/button.tsx",
      "components/ui/field.tsx",
      "components/ui/icons.tsx",
      "components/ui/input.tsx",
      "components/ui/textarea.tsx",
    ]);
  });

  it("names the playground's scope nowhere", () => {
    // A stylesheet that DECLARES the scope renders nothing: an element has to carry the class.
    // So the question is asked of the modules, and `globals.css` is where the class is defined.
    for (const file of [...reached].filter((f) => /\.(tsx?|mjs)$/.test(f))) {
      const source = readFileSync(file, "utf8");
      expect(source.includes("theme-play"), `${rel(file)} names the scope's class`).toBe(false);
      expect(/ui\/scope["']/.test(source), `${rel(file)} imports the scope`).toBe(false);
    }
  });

  // ★ wave 17 (DEC-199 §1.3): WHO renders the scope is `tests/unit/scope-root.test.ts`'s — a layout, and
  // nothing else. Wave 16's list of five moment surfaces lived here and is retired with their scopes.
  // What stays here is this file's own question: the public graph.
  it("the scope's class is written in one file, which the public site does not reach", () => {
    const naming = filesUnder(SRC).filter((f) => readFileSync(f, "utf8").includes("theme-play")).map(rel).sort();
    expect(naming).toEqual(["components/ui/scope.tsx"]);
    expect([...reached].map(rel)).not.toContain("components/ui/scope.tsx");
  });
});
