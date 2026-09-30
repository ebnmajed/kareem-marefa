// The raw palette has left the app — DEC-199 §3, contract 4, REQ-UIX-049.
//
// A screen that writes `bg-silver-100` or `text-white` names a colour the scope
// cannot reassign: inside the playground each is a light patch on the dark
// ground. Wave 17 replaced every one outside the primitives with the semantic
// name of the role it plays (`STATUS.md`, «C4's mapping»). This holds the count
// at zero.
//
// Three things it does NOT cover, each on purpose:
//   · `src/components/ui/` — a primitive keeps its old class beside its `pg:`
//     form until the public site's wave deletes both (`tokens-only.test.ts` and
//     `ui-playground.test.ts` are its gates);
//   · the public site's own files — they keep today's look until their wave;
//   · a STATUS class (`text-error`, `bg-success-bg`): those names take DEC-073's
//     on-dark forms inside the scope, once, in `globals.css`.
//
// ★ `var(--color-…)` IN BRACKETS IS REFUSED TOO (`content`'s finding, sync 1).
// `--color-canvas` is `var(--bg)` resolved at `:root`, so `bg-[var(--color-canvas)]`
// stays white inside the scope — a light patch a search for palette NAMES cannot
// find. A context variable in brackets (`var(--btn-bg)`, `var(--edge)`) resolves
// at the element and is allowed.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = "src";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}
const code = (source: string) => source.replace(/(^|[^:"'`])\/\/.*$/gm, "$1").replace(/\{?\/\*[\s\S]*?\*\/\}?/g, " ");

const EXEMPT = [
  "components/ui/",
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
  // The renderer's and the mail's own drawings are artifacts, not the app (DEC-199, rule 10).
  "components/email/blocks/",
];
const exempt = (file: string) => EXEMPT.some((p) => file === p || (p.endsWith("/") && file.startsWith(p)));

const PREFIX = "(?:bg|text|border|ring|outline|fill|stroke|divide|from|to|via|decoration|shadow|accent|caret|placeholder)";
export const RAW_CLASS = new RegExp(`\\b${PREFIX}-(?:(?:navy|silver|slate)-[a-z0-9]+|white|black)\\b(?:/\\d+)?`, "g");
// The names that are wrong inside the scope: the old palette, and the semantic aliases `@theme inline`
// resolves at `:root`. A CONSTANT — a team colour, a status colour, the confetti's lime and bone
// (REQ-UIX-044) — is the same value on every ground and is not refused.
export const ROOT_VAR = /var\(--color-(?:canvas|surface|fg-[a-z]+|edge(?:-strong)?|spine|node|navy-\d+|silver-\d+|slate-[a-z]+)\)/g;

/** Every raw class and every root-resolved colour variable in a file's code. */
export function rawIn(source: string): string[] {
  const text = code(source);
  return [...(text.match(RAW_CLASS) ?? []), ...(text.match(ROOT_VAR) ?? [])];
}

const offenders = walk(SRC)
  .map((path) => ({ file: relative(SRC, path), hits: rawIn(readFileSync(path, "utf8")) }))
  .filter(({ file, hits }) => !exempt(file) && hits.length > 0);

const STAFF = /^(?:app\/\[locale\]\/app\/(?:admin|platform)\/|components\/(?:admin|platform|designer|branding|email|survey)\/)/;
const SHELL = /^(?:app\/\[locale\]\/app\/layout\.tsx|app\/\[locale\]\/\(auth\)\/|app\/\[locale\]\/\(dev\)\/|components\/shell\/|app\/global-error\.tsx)/;
const side = (file: string) => (STAFF.test(file) ? "console" : SHELL.test(file) ? "lead" : "content");
const list = (who: string) => offenders.filter((o) => side(o.file) === who).map((o) => `${o.file}: ${o.hits.join(" ")}`);

describe("no raw palette name outside the primitives and the public site", () => {
  it("the member side — `content`'s", () => {
    expect(list("content")).toEqual([]);
  });

  it("the staff side — `console`'s", () => {
    expect(list("console")).toEqual([]);
  });

  it("the shell, the (auth) screens and the gallery — the lead's", () => {
    expect(list("lead")).toEqual([]);
  });

  it("the gate bites: it refuses what it is meant to refuse", () => {
    const refuses = (cls: string) => rawIn(`const c = "${cls}";`).length > 0;
    expect(refuses("hover:bg-silver-100")).toBe(true);
    expect(refuses("bg-navy-950 text-white")).toBe(true);
    expect(refuses("border-silver-300/60")).toBe(true);
    expect(refuses("bg-[var(--color-canvas)]")).toBe(true);
    expect(refuses("bg-[linear-gradient(140deg,var(--color-navy-950),var(--color-navy-800))]")).toBe(true);
    // And lets through what it must.
    expect(refuses("bg-raised hover:bg-hover text-on-accent border-edge-strong")).toBe(false);
    expect(refuses("bg-[var(--btn-bg)] text-[var(--btn-fg)] border-[var(--edge)]")).toBe(false);
    expect(refuses("text-error bg-success-bg border-live-on-dark/50")).toBe(false);
    expect(refuses("[mask-image:linear-gradient(to_right,black,transparent)]")).toBe(false);
    expect(refuses("var(--color-play-lime)")).toBe(false);
    expect(refuses("bg-[var(--color-fg-heading)]")).toBe(true);
    // A comment may quote a class; code may not.
    expect(rawIn("// was `bg-silver-100`\nconst c = \"bg-raised\";")).toEqual([]);
  });
});
