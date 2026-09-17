// The lead's guard (wave 10, row L3, DEC-161 R10).
//
// Every mail test imports `@kareem/mail-runtime` by NAME, which resolves to its
// `dist/` — the bytes the worker and the app actually run. That is the right
// thing to test and it has one trap: edit `src/`, forget to rebuild, and the
// pinned comparison passes against YESTERDAY's renderer. A green pin over a
// stale build is worse than no pin.
//
// So: no source file of the package may be newer than its built twin. CI builds
// on install (`prepare`), so this is only ever red on a machine where someone
// changed the renderer and did not rebuild it — and it says what to run.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "packages", "mail-runtime", "src");
const DIST = join(process.cwd(), "packages", "mail-runtime", "dist");

describe("@kareem/mail-runtime — dist is not stale", () => {
  it("every src/*.ts has a dist/*.js at least as new — otherwise run `npm run build -w @kareem/mail-runtime`", () => {
    const sources = readdirSync(SRC).filter((f) => f.endsWith(".ts"));
    expect(sources.length).toBeGreaterThan(0);
    const stale = sources.filter((file) => {
      const built = join(DIST, file.replace(/\.ts$/, ".js"));
      try {
        return statSync(built).mtimeMs < statSync(join(SRC, file)).mtimeMs;
      } catch {
        return true; // never built
      }
    });
    expect(stale).toEqual([]);
  });
});
