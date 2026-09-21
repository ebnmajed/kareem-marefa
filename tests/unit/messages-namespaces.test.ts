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

  // ★ Wave 10: nothing proved the two locales agree — `notifications` gained
  // keys in six commits and parity held by care. A key in `ar` and not in `en`
  // renders its raw dotted path to an English reader; a key in `en` and not in
  // `ar` is a string that was never written in Arabic first (invariant 10).
  // `notify-i18n.test.ts` gates its own two namespaces; this is the whole set.
  it("en: every namespace with an English file has exactly the Arabic file's keys, none blank", () => {
    const report: string[] = [];
    for (const ns of NAMESPACES) {
      let en: Record<string, unknown>;
      try {
        en = JSON.parse(readFileSync(`src/messages/en/${ns}.json`, "utf8"));
      } catch {
        continue; // an English file may lag; Arabic never does
      }
      const ar = JSON.parse(readFileSync(`src/messages/ar/${ns}.json`, "utf8")) as Record<string, unknown>;
      const a = new Set(leaves(ar));
      const e = new Set(leaves(en));
      for (const k of a) if (!e.has(k)) report.push(`${ns}: ${k} — in ar, not in en`);
      for (const k of e) if (!a.has(k)) report.push(`${ns}: ${k} — in en, not in ar`);
      const blank = (obj: Record<string, unknown>, loc: string) =>
        leaves(obj).filter((k) => String(k.split(".").reduce<unknown>((o, part) => (o as Record<string, unknown>)?.[part], obj) ?? "").trim() === "")
          .forEach((k) => report.push(`${ns}: ${k} — blank in ${loc}`));
      blank(ar, "ar");
      blank(en, "en");
    }
    expect(report).toEqual([]);
  });

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
