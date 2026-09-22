// ★ REQ-DSG-027 — «the same signing function serves the designer's export panel
// and this menu; there is one». Wave 13 found three (DEC-176 §1): the studio's,
// the certificates', and one inline in the poster slot. They are folded into
// `signExportUrl()` in `lib/dal/posters.ts`; this fails the build the day a
// second `createSignedUrl` on the `exports` bucket appears anywhere in `src/`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** Every `.from("exports")` whose chain reaches `createSignedUrl`, allowing for
 *  the call being split across lines. */
function signersIn(source: string): number {
  const matches = source.match(/\.from\(\s*["']exports["']\s*\)\s*\.createSignedUrl\(/g);
  return matches?.length ?? 0;
}

describe("the one export signer", () => {
  it("★ exactly one place in src/ signs an `exports` URL, and it is posters.ts's signExportUrl()", () => {
    const found = walk(join(root, "src"))
      .map((path) => ({ path: relative(root, path), count: signersIn(readFileSync(path, "utf8")) }))
      .filter((f) => f.count > 0);
    expect(found).toEqual([{ path: join("src", "lib", "dal", "posters.ts"), count: 1 }]);
  });

  it("the other two names are the same function, not copies", async () => {
    const source = (p: string) => readFileSync(join(root, p), "utf8");
    expect(source("src/lib/dal/designer.ts")).toContain('export { signExportUrl } from "@/lib/dal/posters"');
    expect(source("src/lib/dal/certificates.ts")).toMatch(/export const signCertificateUrl = signExportUrl;/);
  });

  it("the matcher sees a chain split across lines", () => {
    expect(signersIn('supabase.storage\n  .from("exports")\n  .createSignedUrl(p, 300)')).toBe(1);
    expect(signersIn('supabase.storage.from("photos").createSignedUrl(p, 300)')).toBe(0);
  });
});
