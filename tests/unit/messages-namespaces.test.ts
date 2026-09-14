// The message catalogue is one deep-merged object over per-track namespaces
// (src/messages/index.ts). Two namespaces may share a top-level key — the
// marketing page's «التكريم» section and the scoring screens both live under
// `recognition` — but never a LEAF path: the later file would silently win,
// which is exactly how the frozen landing page lost a section at wave 2
// before the visual gate caught it (DEC-047).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NAMESPACES } from "@/messages/index";

function leaves(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? leaves(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("message namespaces", () => {
  for (const locale of ["ar", "en"] as const) {
    it(`${locale}: no leaf path is defined by two namespaces`, () => {
      const owner = new Map<string, string>();
      const collisions: string[] = [];
      for (const ns of NAMESPACES) {
        let json: Record<string, unknown>;
        try {
          json = JSON.parse(readFileSync(`src/messages/${locale}/${ns}.json`, "utf8"));
        } catch {
          continue; // an English file may lag; Arabic never does
        }
        for (const path of leaves(json)) {
          const prev = owner.get(path);
          if (prev) collisions.push(`${path} (${prev} and ${ns})`);
          owner.set(path, ns);
        }
      }
      expect(collisions).toEqual([]);
    });
  }

  it("ar: every namespace named in index.ts has its Arabic file", () => {
    const missing = NAMESPACES.filter((ns) => {
      try {
        readFileSync(`src/messages/ar/${ns}.json`);
        return false;
      } catch {
        return true;
      }
    });
    expect(missing).toEqual([]);
  });
});
