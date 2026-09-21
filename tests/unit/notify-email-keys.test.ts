// ★ EVERY KEY THE EMAIL STUDIO CALLS EXISTS — in both locales.
//
// The subject field's label shipped as the raw dotted path
// `notifications.admin.emails.design.subject`, on screen, to an admin. The
// key was missing from BOTH locales, which is exactly the hole an ar/en parity
// gate cannot see: parity compares the two files to each other, and two files
// that both lack a key agree perfectly.
//
// So this reads the components instead. It resolves every `t("…")` a pane
// calls against the namespace that `t` was bound to, and fails with the key's
// full path — which is the string that would otherwise appear on the screen.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS = join(process.cwd(), "src", "components", "email");
const MESSAGES = join(process.cwd(), "src", "messages");

const catalogue = (locale: string) =>
  JSON.parse(readFileSync(join(MESSAGES, locale, "notifications.json"), "utf8")) as Record<string, unknown>;

/** `a.b.c` against a nested object; undefined when any step is missing. */
function lookup(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, step) => (node && typeof node === "object" ? (node as Record<string, unknown>)[step] : undefined), root);
}

/**
 * Every (namespace, key) a file calls, by pairing each
 * `const x = useTranslations("ns")` with the `x("key")` calls that follow.
 *
 * ★ Template-literal keys — `t(`mode.${value}`)` — cannot be resolved
 * statically, so the PREFIX is checked instead: `mode` must exist and be an
 * object. That catches the whole group going missing, which is the failure
 * worth catching; it cannot catch one arm of it, and says so rather than
 * pretending otherwise.
 */
function calls(source: string): { statics: Array<[string, string]>; prefixes: Array<[string, string]> } {
  const bindings = new Map<string, string>();
  for (const m of source.matchAll(/const\s+(\w+)\s*=\s*useTranslations\("([^"]+)"\)/g)) bindings.set(m[1], m[2]);

  const statics: Array<[string, string]> = [];
  const prefixes: Array<[string, string]> = [];
  for (const [variable, namespace] of bindings) {
    for (const m of source.matchAll(new RegExp(`\\b${variable}\\("([^"\`]+)"\\)`, "g"))) statics.push([namespace, m[1]]);
    for (const m of source.matchAll(new RegExp(`\\b${variable}\\(\`([^\`$]*)\\$\\{`, "g"))) {
      const prefix = m[1].replace(/\.$/, "");
      if (prefix) prefixes.push([namespace, prefix]);
    }
  }
  return { statics, prefixes };
}

const FILES = readdirSync(COMPONENTS).filter((name) => name.endsWith(".tsx"));

describe("★ the studio's panes call no key that does not exist", () => {
  it("there are panes to check — a directory that emptied must fail, not pass", () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  for (const file of FILES) {
    const source = readFileSync(join(COMPONENTS, file), "utf8");
    const { statics, prefixes } = calls(source);
    if (statics.length === 0 && prefixes.length === 0) continue;

    it(`${file}: every key resolves in ar and en`, () => {
      const missing: string[] = [];
      for (const locale of ["ar", "en"]) {
        const root = catalogue(locale);
        for (const [namespace, key] of statics) {
          const path = `${namespace}.${key}`;
          // A string, not an object: `t()` on a group renders the path too.
          if (typeof lookup(root, path) !== "string") missing.push(`${locale}: ${path}`);
        }
        for (const [namespace, prefix] of prefixes) {
          const path = `${namespace}.${prefix}`;
          const node = lookup(root, path);
          if (!node || typeof node !== "object") missing.push(`${locale}: ${path}.* (template key)`);
        }
      }
      // The message lists the exact strings an admin would have read.
      expect(missing, `${file} would render these as raw paths`).toEqual([]);
    });
  }
});
