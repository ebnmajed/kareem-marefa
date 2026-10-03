// Every primitive has a playground design — DEC-199 §3 – §4, REQ-UIX-050, REQ-UIX-001.
//
// ★★ THIS TEST READS THE DIRECTORY, NOT A LIST. Wave 15 migrated the primitives
// `docs/design/07-tasks.md` named, and that list left out eight: `page-header`,
// `prose`, `link`, `icon-button`, `section-header`, `submit-button`,
// `reorderable-list` and `icons`. Nothing checked the list against the tree, so
// every scoped screen drew its title, its text and its links in the old design,
// and the owner opened the app on a phone and called it a Frankenstein. A plan
// that is a list of names cannot notice what it omits. This cannot omit anything:
// a file added to `src/components/ui/` tomorrow fails here until it has
//
//   1. an entry in `ui-playground.registry.ts` saying HOW it wears the playground,
//      which is checked against its source;
//   2. a test that imports it and speaks of the scope;
//   3. a demo the gallery imports.
//
// There is no allowlist and no «pending» kind. `REQ-UIX-001` always asked for a
// jsdom test, an RTL check and a gallery entry per primitive; this is where it is
// asked of the directory.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REGISTRY, type Entry } from "./ui-playground.registry";

const UI = "src/components/ui";
const COMPONENTS = "src/components";
const TESTS = "tests/components/ui";
const GALLERY = "src/app/[locale]/(dev)/ui";
const DEMOS = `${GALLERY}/demos`;

/**
 * Comments explain, and an explanation may quote a class. Code may not.
 * ★ Line comments go FIRST: `ui/skeleton` says «every `/app/**` route» in one, and `/**` read as
 * the start of a block comment swallowed the file down to its next JSDoc — class string and all.
 */
function code(source: string): string {
  return source.replace(/(^|[^:"'`])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, " ");
}
const read = (path: string) => readFileSync(path, "utf8");

const SCOPED = /\bpg(?:-dark|-light)?:/;
const RAW_PALETTE = /\b(?:navy|silver|slate)-[a-z0-9]|\bplay-(?:ink|surface|line|bone|muted|lime|coral|paper|edge)\b/;
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const LITERAL_DURATION = /(?:\bduration-\d|\bdelay-\d|\[\d+(?:\.\d+)?m?s\]|:\s*["'`]?\d+(?:\.\d+)?m?s\b)/;
/** A test «speaks of the scope» when it renders inside it or asserts what it adds. */
const SPEAKS_OF_SCOPE = /\bpg(?:-dark|-light)?:|\bPlayScope\b|theme-play/;

const files = readdirSync(UI)
  .filter((name) => name.endsWith(".tsx"))
  .sort();
const drawn = files.filter((name) => REGISTRY[name] && REGISTRY[name].treatment.kind !== "infrastructure");
const imports = (source: string, mod: string) => new RegExp(`from\\s+["']@/components/${mod.replace(/[/-]/g, "\\$&")}["']`).test(source);

/** Why a file's source does not match the treatment its entry declares — or null. */
function mismatch(name: string, entry: Entry): string | null {
  const source = code(read(join(UI, name)));
  const t = entry.treatment;
  if (t.kind === "variant") return SCOPED.test(source) ? null : "declared `variant`, and carries no `pg:` class";
  if (t.kind === "tokens") {
    if (SCOPED.test(source)) return "declared `tokens`, and carries a `pg:` class — it is a `variant`";
    if (RAW_PALETTE.test(source)) return `declared \`tokens\`, and names the raw palette: ${source.match(RAW_PALETTE)![0]}`;
    if (HEX.test(source)) return `declared \`tokens\`, and holds a hex: ${source.match(HEX)![0]}`;
    if (LITERAL_DURATION.test(source)) return `declared \`tokens\`, and holds a literal duration: ${source.match(LITERAL_DURATION)![0]}`;
    if (!t.reads.length) return "declared `tokens`, and names nothing it reads";
    const missing = t.reads.filter((token) => !source.includes(token));
    return missing.length ? `declared \`tokens\`, and does not read: ${missing.join(", ")}` : null;
  }
  if (t.kind === "composes") {
    if (SCOPED.test(source)) return "declared `composes`, and carries a `pg:` class of its own — it is a `variant`";
    if (RAW_PALETTE.test(source) || HEX.test(source)) return "declared `composes`, and draws a colour of its own";
    if (!t.of.length) return "declared `composes`, and composes nothing";
    for (const mod of t.of) {
      if (!imports(source, mod)) return `declared \`composes\` ${mod}, and does not import it`;
      if (mod.startsWith("ui/")) {
        const target = REGISTRY[`${mod.slice(3)}.tsx`];
        if (!target) return `composes ${mod}, which has no entry`;
        if (target.treatment.kind === "infrastructure") return `composes ${mod}, which draws nothing`;
      } else {
        const path = join(COMPONENTS, `${mod}.tsx`);
        if (!existsSync(path)) return `composes ${mod}, which does not exist`;
        // Outside `ui/` a file wears the playground by reading semantic names only (`no-raw-palette`
        // holds the app to that), or by carrying `pg:` classes beside what it had.
        const target = code(read(path));
        if (!SCOPED.test(target) && (RAW_PALETTE.test(target) || HEX.test(target))) return `composes ${mod}, which names a raw colour and carries no \`pg:\` class`;
      }
    }
    return null;
  }
  return t.why.trim().length > 20 ? null : "declared `infrastructure`, and does not say why";
}

/** Why the entry's test is not evidence — or null. */
function testGap(name: string, entry: Entry): string | null {
  if (!entry.test) return "names no test";
  const path = join(TESTS, entry.test);
  if (!existsSync(path)) return `${entry.test} does not exist`;
  const source = read(path);
  const stem = name.replace(/\.tsx$/, "");
  const subjects = [`ui/${stem}`, ...(entry.treatment.kind === "composes" ? entry.treatment.of : [])];
  if (!subjects.some((mod) => imports(source, mod))) return `${entry.test} imports neither the primitive nor what it composes`;
  return SPEAKS_OF_SCOPE.test(source) ? null : `${entry.test} never speaks of the scope`;
}

/** Why the entry's demo is not a gallery entry — or null. */
function demoGap(name: string, entry: Entry): string | null {
  if (!entry.demo) return "names no demo";
  const path = join(DEMOS, entry.demo);
  if (!existsSync(path)) return `demos/${entry.demo} does not exist`;
  const stem = name.replace(/\.tsx$/, "");
  if (!imports(read(path), `ui/${stem}`)) return `demos/${entry.demo} does not import the primitive`;
  const wired = ["page.tsx", "playground.tsx"].some((page) => read(join(GALLERY, page)).includes(`./demos/${entry.demo!.replace(/\.tsx$/, "")}"`));
  return wired ? null : `demos/${entry.demo} is not imported by the gallery`;
}

describe("every file in src/components/ui has a playground design", () => {
  it("finds the directory, and it is not a list kept here", () => {
    // wave 18 (DEC-206 §1.3): 49 + `action-bar`, `attendee-stack`, `feed-item`, `week-hud`.
    // wave 19 (DEC-213 §2.1): 53 + `star-input`, `stepper`, `page-viewer`, `badge-medallion`.
    // wave 20 (DEC-216 §2.1, DEC-218): 57 + `ledger-row`, `podium`, `settings-group` — no `status-mark`.
    // wave 21 (DEC-225 §2, DEC-227): 60 + `admin-rail`, `split-view`, `kv-card`.
    // wave 23 (DEC-235, DEC-237): 63 + `editor-rail`, `floating-toolbar` (PR B, the lead's); `canvas-stage`, `layer-list`
    // follow in B (→ 67) and `block-canvas`, `block-library` in C (→ 69).
    expect(files.length).toBeGreaterThanOrEqual(67);
    for (const name of ["page-header.tsx", "prose.tsx", "link.tsx", "icon-button.tsx", "section-header.tsx", "submit-button.tsx", "reorderable-list.tsx", "icons.tsx"]) {
      expect(files, `the eight wave 15 missed: ${name}`).toContain(name);
    }
  });

  it("every file has an entry, and every entry a file", () => {
    expect(files.filter((name) => !REGISTRY[name]), "in the directory with no entry").toEqual([]);
    expect(Object.keys(REGISTRY).filter((name) => !files.includes(name)), "an entry whose file is gone").toEqual([]);
  });

  it.each(files)("%s is treated as its entry declares", (name) => {
    const entry = REGISTRY[name];
    expect(entry, "no entry").toBeDefined();
    expect(mismatch(name, entry)).toBeNull();
  });

  it.each(drawn)("%s has a test that imports it and speaks of the scope", (name) => {
    expect(testGap(name, REGISTRY[name])).toBeNull();
  });

  it.each(drawn)("%s has a demo, and the gallery imports it", (name) => {
    expect(demoGap(name, REGISTRY[name])).toBeNull();
  });

  it("only what renders no pixel is excused a test and a demo, and says why", () => {
    const excused = Object.entries(REGISTRY).filter(([, entry]) => entry.treatment.kind === "infrastructure");
    expect(excused.map(([name]) => name).sort()).toEqual(["scope-portal.tsx", "scope.tsx"]);
  });

  it("the gate bites: it refuses what it is meant to refuse", () => {
    // A guard against a vacuous pass. Each case is a file that must NOT get through.
    const variant: Entry = { treatment: { kind: "variant" }, test: "x", demo: "x" };
    const scope = "scope.tsx"; // a real file with no `pg:` class and no colour
    expect(mismatch(scope, variant)).toMatch(/carries no `pg:` class/);
    expect(mismatch("button.tsx", { treatment: { kind: "tokens", reads: ["bg-accent"] } })).toMatch(/it is a `variant`/);
    expect(mismatch(scope, { treatment: { kind: "tokens", reads: [] } })).toMatch(/names nothing it reads/);
    expect(mismatch(scope, { treatment: { kind: "tokens", reads: ["bg-no-such-token"] } })).toMatch(/does not read/);
    expect(mismatch(scope, { treatment: { kind: "composes", of: ["ui/button"] } })).toMatch(/does not import it/);
    expect(mismatch("submit-button.tsx", { treatment: { kind: "composes", of: ["ui/no-such-file"] } })).toMatch(/does not import it/);
    expect(mismatch(scope, { treatment: { kind: "infrastructure", why: "no" } })).toMatch(/does not say why/);
    expect(testGap("button.tsx", { ...variant, test: "no-such.test.tsx" })).toMatch(/does not exist/);
    // A real test of another primitive is not evidence for this one.
    expect(testGap("button.tsx", { ...variant, test: "panel-scope.test.tsx" })).toMatch(/imports neither/);
    expect(demoGap("button.tsx", { ...variant, demo: "no-such.tsx" })).toMatch(/does not exist/);
    expect(demoGap("button.tsx", { ...variant, demo: "panel.tsx" })).toMatch(/does not import the primitive/);
    // And the patterns themselves.
    expect(SCOPED.test('className="pg:rounded-pill"')).toBe(true);
    expect(SCOPED.test('className="rounded-field bg-surface"')).toBe(false);
    expect(SPEAKS_OF_SCOPE.test("render(<Button />)")).toBe(false);
    expect(SPEAKS_OF_SCOPE.test("render(<PlayScope><Button /></PlayScope>)")).toBe(true);
  });
});
