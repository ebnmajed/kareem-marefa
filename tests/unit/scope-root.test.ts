// The scope is the root of every layout but the public site's — DEC-199 §1.3,
// contract 1, REQ-UIX-049.
//
// Until wave 17 the scope wrapped five surfaces, each by itself, and every other
// screen was outside it: the mixture the owner called a Frankenstein. Now a
// LAYOUT renders it, once, and everything under that layout is inside. Three
// rules keep it one scope and one look, and each is held here:
//
//   1. `<PlayScope>` is rendered by a layout and by nothing else — no screen, no
//      component. (The gallery renders it twice, side by side, to show both
//      grounds; it is the one exception and it is named.)
//   2. Every route that is not the public site's sits under a layout that renders
//      it with `root`.
//   3. `.theme-dark` appears in no file but the public site's and the primitives
//      that still serve it. Under a scoped layout it would reassign the context
//      variables to the old navy values and cut an old-look island into the page.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = "src";
const LOCALE = "src/app/[locale]";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}
/** Comments explain, and may name the scope. Code may not. Line comments first (see `ui-playground.test.ts`). */
const code = (path: string) =>
  readFileSync(path, "utf8")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, " ");

const all = walk(SRC);
const rel = (path: string) => relative(SRC, path);

// The layouts that render the root scope. One line each, and each is a surface DEC-199 §1.3 names.
const ROOT_LAYOUTS = [
  "app/[locale]/app/layout.tsx", // the shell: every member, staff and platform screen
  "app/[locale]/(auth)/layout.tsx", // sign-in, choose-org, no-access
  "app/[locale]/legal/layout.tsx",
  "app/[locale]/s/layout.tsx", // the public session card
  "app/[locale]/verify/layout.tsx", // the certificate's verification page
];
// The gallery shows both of the scope's grounds, so it renders two scopes side by side.
const GALLERY = "app/[locale]/(dev)/ui/playground.tsx";

// The public site's own files, which keep today's look until their wave (DEC-199 §1.2): the five
// frozen routes' group, and the components it renders.
const PUBLIC = [
  "app/[locale]/(marketing)/",
  "app/[locale]/layout.tsx",
  "components/header.tsx",
  "components/footer.tsx",
  "components/chapter.tsx",
  "components/wordmark.tsx",
  "components/intro-sting.tsx",
  "components/network-bg.tsx",
  "components/network-gl.tsx",
  "components/ornaments.tsx",
  "components/mobile-cta.tsx",
  "components/language-toggle.tsx",
  "components/registration-form.tsx",
  "components/form-token.tsx",
];
const isPublic = (file: string) => PUBLIC.some((p) => file === p || (p.endsWith("/") && file.startsWith(p)));

describe("the scope is rendered by a layout, and by nothing else", () => {
  const rendering = all.filter((path) => /<PlayScope\b/.test(code(path))).map(rel).sort();

  it("exactly the five layouts and the gallery render it", () => {
    expect(rendering).toEqual([...ROOT_LAYOUTS, GALLERY].sort());
  });

  it.each(ROOT_LAYOUTS)("%s renders it once, as the root, at full height", (file) => {
    const source = code(join(SRC, file));
    const opens = source.match(/<PlayScope\b[^>]*>/g) ?? [];
    expect(opens).toHaveLength(1);
    expect(opens[0]).toMatch(/\broot\b/);
    expect(opens[0]).toContain("min-h-dvh");
    // The root scope is never transformed, filtered or clipped (DEC-188 §5): it holds every portal.
    expect(opens[0]).not.toMatch(/transform|translate-|scale-|rotate-|filter|blur-|overflow-hidden|overflow-clip|contain-/);
  });

  it("the scope's class is written in one file", () => {
    expect(all.filter((path) => readFileSync(path, "utf8").includes("theme-play")).map(rel)).toEqual(["components/ui/scope.tsx"]);
  });

  it("no public file renders or imports it", () => {
    for (const file of all.map(rel).filter(isPublic)) {
      const source = readFileSync(join(SRC, file), "utf8");
      expect(/ui\/scope["']/.test(source), `${file} imports the scope`).toBe(false);
    }
  });
});

describe("every route that is not the public site's is under a root scope", () => {
  // A route is a `page.tsx` or a `not-found.tsx`. Its layouts are the `layout.tsx` files on the way up.
  const routes = walk(LOCALE).filter((path) => /\/(page|not-found)\.tsx$/.test(path)).map(rel);

  it("finds the routes", () => {
    expect(routes.length).toBeGreaterThan(60);
  });

  it.each(routes.filter((r) => !isPublic(r) && !r.startsWith("app/[locale]/(dev)/")))("%s", (route) => {
    expect(ROOT_LAYOUTS.some((layout) => route.startsWith(layout.replace(/layout\.tsx$/, ""))), "no root scope above it").toBe(true);
  });

  it("the locale's own layout renders none: the public site shares it", () => {
    expect(code(join(LOCALE, "layout.tsx"))).not.toMatch(/PlayScope|theme-play/);
  });
});

describe(".theme-dark never appears under a scoped layout", () => {
  // `ui/` primitives still name it in selectors that serve the public site's dark sections; they are
  // `tests/unit/ui-playground.test.ts`'s, and the variants go with the public site's wave.
  const naming = all
    .filter((path) => /theme-dark/.test(code(path)))
    .map(rel)
    .filter((file) => !isPublic(file) && !file.startsWith("components/ui/"))
    .sort();

  it("no file of the app applies it or selects on it", () => {
    expect(naming).toEqual([]);
  });
});
