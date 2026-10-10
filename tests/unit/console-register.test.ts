// The console's register — REQ-UIX-053, DEC-199 §1.1, contract 6.
//
// `/app/admin/**` and `/app/platform/**` take the playground's palette, radii and type and NONE of its motion,
// objects or stickers. Two things are held here: (1) no file the console renders imports a moment, confetti, an
// object or a sticker — a graph walk, shaped like `public-graph.test.ts`'s; (2) the six data-dense primitives, the
// picker they wrap and the staff tree declare no animation. The set measured on 2026-09-30 is EMPTY, so the
// assertion pins the empty set. `scope.tsx` and `scope-portal.tsx` are not forbidden: the layout renders the scope and
// `sheet`/`menu` land in it (DEC-188). Tokens and the raw palette are `no-raw-palette.test.ts`'s, not this file's.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve("src");
const ROOTS = ["src/app/[locale]/app/admin", "src/app/[locale]/app/platform", "src/app/[locale]/app/layout.tsx"];
const STAFF_DIRS = [
  "src/app/[locale]/app/admin",
  "src/app/[locale]/app/platform",
  ...["admin", "platform", "designer", "branding", "email", "survey"].map((d) => `src/components/${d}`),
];
// ★ wave 29 (DEC-280 §6): what the shell's navigation boundary reaches under `lib/ui/` — the kind, the poster's flight
// and the two neutral readers they use. Each one checks `isStillPath()` before anything moves; none celebrates.
// ★ DEC-284: `intent-prefetch.ts` fetches the next page early — no motion, no celebration.
const NAVIGATION = new Set(["lib/ui/nav-motion.ts", "lib/ui/poster-flight.ts", "lib/ui/reduced-motion.ts", "lib/ui/duration.ts", "lib/ui/intent-prefetch.ts"]);
// ★ wave 21 (DEC-227 §2, the owner): the console's three primitives live in `ui/`, outside the staff directories, so
// they are named here — the one amendment this file has had, and it reads more, never less.
const PRIMITIVES = ["data-table", "combobox", "menu", "tabs", "sheet", "date-time", "admin-rail", "split-view", "kv-card"].map((n) => `src/components/ui/${n}.tsx`);
const SIX_AND_PICKER = [...PRIMITIVES, "src/components/admin/rtl-datetime-picker.tsx"];

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

/** Value imports and dynamic `import()` only: `import type` is erased and pulls nothing into a page. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specs = [...source.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  const bare = [...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1]);
  const dynamic = [...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  return [...specs, ...bare, ...dynamic].map((s) => resolveImport(file, s)).filter((f): f is string => f !== null);
}

/** The reached set, each file with the file that first reached it — so a failure can print its chain. */
function graph(): Map<string, string | null> {
  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  for (const file of ROOTS.flatMap((r) => filesUnder(resolve(r)))) {
    if (!parent.has(file)) {
      parent.set(file, null);
      queue.push(file);
    }
  }
  while (queue.length) {
    const file = queue.shift()!;
    for (const next of importsOf(file)) {
      if (!parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return parent;
}

const reached = graph();
const rel = (f: string) => f.slice(SRC.length + 1);
const chain = (f: string) => {
  const out: string[] = [];
  for (let c: string | null | undefined = f; c; c = reached.get(c)) out.push(rel(c));
  return out.join(" <- ");
};

/** Comments carry prose («a transition», `--dur-*`); only code and class strings are asked. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

// A class token, not an identifier: `runTransition`, `transitionActions` and `duration-input` are not animation.
const ANIMATION = new RegExp(
  [
    String.raw`(?<![\w-])animate-[\w[]`,
    String.raw`(?<![\w-])transition(?:-[a-z]+)?(?=[\s"'\`])`,
    String.raw`(?<![\w-])duration-\d`,
    String.raw`(?<![\w-])delay-\d`,
    String.raw`(?<![\w-])ease-(?:in|out|linear|\[)`,
    String.raw`(?<![\w-])motion-(?:safe|reduce):`,
    String.raw`@keyframes`,
    String.raw`\.animate\(`,
    String.raw`\buseCountUp\b`,
  ].join("|"),
);

const animationIn = (file: string) => stripComments(readFileSync(file, "utf8")).match(ANIMATION)?.[0] ?? null;

describe("the console's import graph (REQ-UIX-053)", () => {
  it("is found, and is the console and its shell", () => {
    expect(reached.size).toBeGreaterThan(150);
    const files = [...reached.keys()].map(rel);
    for (const expected of [
      "components/ui/admin-rail.tsx",
      "components/platform/platform-nav.tsx",
      "components/ui/data-table.tsx",
      "app/[locale]/app/layout.tsx",
    ]) {
      expect(files, expected).toContain(expected);
    }
  });

  it("reaches no moment, confetti, object or sticker", () => {
    const forbidden = [...reached.keys()].filter((f) => {
      const r = rel(f);
      // ★ wave 29 (DEC-280 §6): `lib/ui/nav-motion.ts` is reached through the shell's boundary, and it is what KEEPS the
      // console still — its `isStillPath()` clears every kind in the staff tree. It celebrates nothing; it is named.
      return (r.startsWith("lib/ui/") && !NAVIGATION.has(r)) || r.startsWith("components/ui/objects/") || r === "components/ui/sticker.tsx" || /(^|\/)moment-[^/]*$/.test(r);
    });
    expect(forbidden.map(chain), "the console reaches a celebration").toEqual([]);
  });

  it("renders no scope of its own: the layout's is theirs", () => {
    const staff = STAFF_DIRS.flatMap((d) => filesUnder(resolve(d)));
    for (const file of staff) expect(/<PlayScope\b/.test(readFileSync(file, "utf8")), `${rel(file)} renders the scope`).toBe(false);
  });
});

// ★ wave 29 (DEC-280 §6, REQ-UIX-129, TRN-09): the console and the platform cut. No staff file asks for a move — no
// `nav` kind on a link, no `data-nav-kind`, no shared name — and the shell's boundary says the staff tree is still.
const MOVE = /\bnav=["{]|data-nav-kind|<ViewTransition\b|<PosterName\b|view-transition-name|viewTransitionName|\bzoomOpen\b|\bzoomShut\b/;

describe("the console moves nowhere (REQ-UIX-129)", () => {
  it("no file of the staff tree asks for a navigation move", () => {
    for (const file of STAFF_DIRS.flatMap((d) => filesUnder(resolve(d)))) {
      expect(stripComments(readFileSync(file, "utf8")).match(MOVE)?.[0] ?? null, `${rel(file)} asks for a move`).toBeNull();
    }
  });

  it("the console's primitives ask for none either", () => {
    for (const file of SIX_AND_PICKER) expect(stripComments(readFileSync(resolve(file), "utf8")).match(MOVE)?.[0] ?? null, file).toBeNull();
  });

  it("the shell's boundary and every setter treat /app/admin and /app/platform as still", async () => {
    const { isStillPath } = await import("@/lib/ui/nav-motion");
    for (const path of ["/ar/app/admin", "/ar/app/admin/sessions/x", "/en/app/platform/orgs", "/app/admin"]) expect(isStillPath(path), path).toBe(true);
    for (const path of ["/ar/app", "/ar/app/sessions/x", "/ar/app/administrator", "/ar/app/me"]) expect(isStillPath(path), path).toBe(false);
    const motion = readFileSync(resolve("src/components/shell/route-motion.tsx"), "utf8");
    expect(motion).toMatch(/update=\{still \? "none" : "route"\}/);
  });
});

describe("the console declares no animation (03-motion: tables, lists and admin surfaces never animate)", () => {
  it("the six primitives and the picker they wrap", () => {
    for (const file of SIX_AND_PICKER) {
      expect(existsSync(resolve(file)), file).toBe(true);
      expect(animationIn(resolve(file)), `${file} declares an animation`).toBeNull();
    }
  });

  it("every file of the staff tree", () => {
    for (const file of STAFF_DIRS.flatMap((d) => filesUnder(resolve(d)))) {
      expect(animationIn(file), `${rel(file)} declares an animation`).toBeNull();
    }
  });
});
