// ★ No level-up moment on the profile (DEC-213 §5.117, DEC-207 §1.3, REQ-UIX-069): the level cursor moves only on
// `SCR-022`, so nothing the members' route renders may play a moment, read the moments' mechanism, or write a mark.
// Walked over the import graph from the route's own files, so a moment reached through a helper is caught too.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src/app/[locale]/app/members", "src/components/members"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join("src", spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, "index.ts")]) if (existsSync(candidate)) return candidate;
  return null;
}

function graph(): Set<string> {
  const seen = new Set<string>();
  const queue = ROOTS.flatMap(walk);
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const [, spec] of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const target = resolveImport(file, spec);
      // The DAL is server data, not rendering; its own modules are walked only for the mark writers below.
      if (target && !target.includes("node_modules")) queue.push(target);
    }
  }
  return seen;
}

describe("the members' route plays no moment", () => {
  const files = [...graph()];

  it("walks the route", () => {
    expect(files.some((f) => f.endsWith(join("members", "[id]", "page.tsx")))).toBe(true);
    expect(files.some((f) => f.endsWith(join("members", "page.tsx")))).toBe(true);
  });

  it("★ reaches nothing of the moments' mechanism and no moment component", () => {
    const rendered = files.filter((f) => !f.startsWith(join("src", "lib", "dal")));
    expect(rendered.filter((f) => f.startsWith(join("src", "lib", "ui")))).toEqual([]);
    expect(rendered.filter((f) => /moment-[^/]*\.tsx$/.test(f))).toEqual([]);
  });

  it("★ writes no mark — the level cursor is SCR-022's alone", () => {
    const own = ROOTS.flatMap(walk).map((f) => readFileSync(f, "utf8")).join("\n");
    expect(own).not.toMatch(/mark_points_seen|markPointsSeen|markBoardSeen|member_seen_marks|useMoment/);
  });
});
