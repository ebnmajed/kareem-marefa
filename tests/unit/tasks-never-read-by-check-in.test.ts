// REQ-TSK-002, enforced rather than remembered (DEC-150, contract 10) — the
// TypeScript half. The SQL half is tests/rls/session-days-tasks-guard.test.ts.
//
// «Tasks stay reminder-only and are NEVER read by any check-in path.» Wave 9
// puts a task and a check-in on the same day for the first time (DEC-120), so
// «has this member done the day's tasks?» is one import away from «may this
// member check in?». This test walks the import graph out of every check-in
// entry point and fails if it ever reaches the tasks DAL or a tasks component,
// or if a check-in file names a task table.
//
// It is deliberately NOT a grep for the word «tasks»: the affordance matrix has
// a `tasks` column (whether the tasks SECTION is shown in a phase), and that is
// presentation, not a read of a task.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Every file the `checkin` track owns that decides, records or shows attendance. */
const ENTRY_DIRS = [
  "src/components/checkin",
  "src/app/[locale]/app/sessions/[id]/check-in",
  "src/app/[locale]/app/sessions/[id]/host",
  "src/app/[locale]/app/admin/sessions/[id]/attendance",
];
const ENTRY_FILES = [
  "src/lib/dal/rsvp.ts",
  "src/lib/dal/checkin.ts",
  "worker/src/tasks/rotate_codes.ts",
  "worker/src/tasks/promote_waitlist.ts",
];

const FORBIDDEN_MODULES = [/^src\/lib\/dal\/tasks\.ts$/, /^src\/components\/tasks\//];
const TASK_TABLES = /\b(session_tasks|task_completions|task_form_responses)\b/;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null; // a package, not a file of ours
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const IMPORT = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;

function closure(entries: string[]): Map<string, string> {
  // file → the file that first imported it, so a failure can print the path
  const seen = new Map<string, string>();
  const queue = [...entries];
  for (const e of entries) seen.set(e, "(entry)");
  while (queue.length > 0) {
    const file = queue.pop()!;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT)) {
      const target = resolveImport(file, (m[1] ?? m[2] ?? m[3])!);
      if (target && !seen.has(target)) {
        seen.set(target, file);
        queue.push(target);
      }
    }
  }
  return seen;
}

const rel = (p: string) => relative(ROOT, p);
const entries = [...ENTRY_DIRS.flatMap((d) => walk(join(ROOT, d))), ...ENTRY_FILES.map((f) => join(ROOT, f)).filter(existsSync)];

describe("REQ-TSK-002 — nothing on a check-in path reads a task", () => {
  it("finds the check-in track's files (the guard is not vacuous)", () => {
    expect(entries.length).toBeGreaterThan(10);
    for (const f of ENTRY_FILES) expect(existsSync(join(ROOT, f)), f).toBe(true);
    expect(entries.map(rel)).toContain("src/components/checkin/session-matrix.ts");
  });

  it("the check-in import graph never reaches the tasks DAL or a tasks component", () => {
    const graph = closure(entries);
    const reached = [...graph.keys()].map(rel).filter((f) => FORBIDDEN_MODULES.some((re) => re.test(f)));
    const why = reached.map((f) => {
      const chain = [f];
      let at = join(ROOT, f);
      while (graph.get(at) && graph.get(at) !== "(entry)") {
        at = graph.get(at)!;
        chain.push(rel(at));
      }
      return chain.reverse().join(" → ");
    });
    expect(why).toEqual([]);
  });

  it("no check-in file names a task table", () => {
    const offenders = entries.filter((f) => TASK_TABLES.test(readFileSync(f, "utf8"))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("the walker does resolve this repo's imports — it reaches the session DAL and the status module from the check-in DAL", () => {
    const graph = [...closure([join(ROOT, "src/lib/dal/checkin.ts")]).keys()].map(rel);
    expect(graph).toContain("src/lib/dal/session.ts");
    expect(graph).toContain("src/lib/session-status.ts");
  });
});
