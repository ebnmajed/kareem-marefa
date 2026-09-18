// A source file nobody can diff is a source file nobody reviews.
//
// ★ WHY THIS EXISTS, and it is a scar rather than a precaution. Writing the
// block compiler I put `U+0000` in a template literal and `U+2068` / `U+2069`
// in two constants, and BOTH reached disk as the actual characters rather than
// as the six-character escapes. The NUL one was committed. The symptom is not
// a failing test — the code runs correctly — it is that `file` reports the
// source as «data», `grep` silently treats it as binary and prints nothing
// (`grep -a` is needed), and a diff of an invisible change is unreadable. A
// reviewer looking at the right line sees nothing wrong, because there is
// nothing to see.
//
// ★ WHY IT IS NOT «printable ASCII + Arabic», which is the rule as first
// proposed. Measured against these same files: that rule flags **2,480
// characters across 16 code points**, every one of them deliberate — `═` and
// `─` in the comment banners this repo uses everywhere, `—`, `§`, `·`, `★`,
// `«»`, `←`, `→`, `…`. Banning them would be a formatting fight with the whole
// tree for no safety. What actually hurt was INVISIBILITY, so that is what is
// forbidden: control characters, the bidi and zero-width formatters, the soft
// hyphen and the byte-order mark.
//
// A bidi isolate is still perfectly legal in OUTPUT — the compiler emits
// U+2068 and U+2069 around every bound value, because Outlook's Word engine
// has no `<bdi>`. It builds them with `String.fromCharCode(0x2068)`, so the
// SOURCE stays readable and the OUTPUT stays correct. That is the whole rule:
// invisible characters are produced, never typed.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The files this guard covers: the one mail renderer, and the mail and notify
 *  tests — which is where the trap landed the second time. */
const ROOTS = [
  join(process.cwd(), "packages", "mail-runtime", "src"),
  join(process.cwd(), "tests", "unit"),
  join(process.cwd(), "tests", "rls"),
];
const COVERS = (path: string) =>
  path.includes(join("packages", "mail-runtime", "src")) ||
  /\/(mail|notify)-[^/]*\.ts$/.test(path) ||
  /\/mail-pinned\.fixtures\.ts$/.test(path);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      // `mail-pinned/` holds GENERATED mail, not source: a rendered message is
      // allowed to carry anything the renderer emits.
      if (name === "mail-pinned") continue;
      out.push(...sourceFiles(path));
      continue;
    }
    if (path.endsWith(".ts") && COVERS(path)) out.push(path);
  }
  return out;
}

/**
 * Forbidden: anything a reader cannot see.
 *
 * Written as numeric comparisons and never as an escape in a regex literal,
 * for the reason this file exists — an escape is exactly what turned into the
 * character it was meant to describe.
 */
function isInvisible(code: number): boolean {
  if (code === 0x09 || code === 0x0a) return false; // tab and newline
  if (code < 0x20) return true; // C0 controls, NUL and CR among them (this tree is LF)
  if (code >= 0x7f && code <= 0x9f) return true; // DEL and the C1 controls
  if (code === 0x00ad) return true; // SOFT HYPHEN
  if (code === 0x061c) return true; // ARABIC LETTER MARK
  if (code >= 0x200b && code <= 0x200f) return true; // ZWSP, ZWNJ, ZWJ, LRM, RLM
  if (code >= 0x202a && code <= 0x202e) return true; // the bidi embedding controls
  if (code >= 0x2060 && code <= 0x206f) return true; // word joiner, the ISOLATES, deprecated formatters
  if (code === 0xfeff) return true; // BYTE ORDER MARK
  return false;
}

describe("the mail renderer's source is visible to a reader", () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root));

  it("covers the package and the mail and notify tests — a vacuous sweep would pass forever", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith("compile.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("mail-pinned.test.ts"))).toBe(true);
  });

  it("★ carries no character a reviewer cannot see", () => {
    const found: string[] = [];
    for (const path of files) {
      const lines = readFileSync(path, "utf8").split("\n");
      lines.forEach((line, index) => {
        [...line].forEach((ch, column) => {
          const code = ch.codePointAt(0) ?? 0;
          if (isInvisible(code)) {
            found.push(`${path.replace(process.cwd() + "/", "")}:${index + 1}:${column + 1} U+${code.toString(16).toUpperCase().padStart(4, "0")}`);
          }
        });
      });
    }
    // The message names file, line, column and code point, because the one
    // thing a reader cannot do with this defect is find it by looking.
    expect(found).toEqual([]);
  });

  it("the guard itself catches what it is for — proven on a planted string, not assumed", () => {
    const planted = `const FSI = "${String.fromCharCode(0x2068)}";`;
    const hits = [...planted].filter((ch) => isInvisible(ch.codePointAt(0) ?? 0));
    expect(hits).toHaveLength(1);
    // And a NUL, which is the one that was actually committed.
    expect(isInvisible(0)).toBe(true);
    // While the typography this repo writes on purpose stays legal.
    for (const ch of "═─—§·★«»←→… 🎓") expect(isInvisible(ch.codePointAt(0) ?? 0)).toBe(false);
  });
});
