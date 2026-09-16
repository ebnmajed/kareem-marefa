// The `react-dom` ping patch is applied — DEC-135, DEC-136.
//
// React 19.2.4 drops a ping that arrives synchronously inside a render whose
// root is already "suspended with delay", so a transition that re-renders
// server content can hang forever: about one «احجز مقعدك» in three never
// committed. `patches/next+16.2.10.patch` makes `pingSuspendedRoot` record that
// ping instead of dropping it, in the four client builds Next vendors.
//
// This test does not prove the fix — only a production build does, and
// `tests/e2e/reserve-probe.spec.ts` presses sixteen times. It proves the patch
// is in the `react-dom` the app actually bundles, so a reinstall that skipped
// `postinstall`, or a Next upgrade that silently dropped the patch, fails here
// instead of hanging one press in three with nothing red anywhere.
//
// ★ When a React or Next release carries the fix: the patch will stop applying
// (patch-package fails the install), delete it, delete this test, and keep the
// probe (DEC-136, "the exit").
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CJS = join(process.cwd(), "node_modules", "next", "dist", "compiled", "react-dom", "cjs");

// The body of `pingSuspendedRoot`, from its name to the `ensureRootIsScheduled`
// that ends it — so a match elsewhere in the file cannot pass for the fix.
function pingSuspendedRoot(file: string): string {
  const source = readFileSync(join(CJS, file), "utf8");
  const start = source.indexOf("function pingSuspendedRoot(");
  expect(start, `${file} has no pingSuspendedRoot`).toBeGreaterThan(-1);
  const end = source.indexOf("ensureRootIsScheduled(root);", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("the react-dom ping patch (DEC-136)", () => {
  it.each(["react-dom-client.production.js", "react-dom-profiling.profiling.js"])(
    "%s records a render-phase ping instead of dropping it",
    (file) => {
      const body = pingSuspendedRoot(file).replace(/\s+/g, " ");
      expect(body).toContain("? 0 === (executionContext & 2) ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes)");
      expect(body).not.toContain("0 === (executionContext & 2) && prepareFreshStack(root, 0)");
    },
  );

  it.each(["react-dom-client.development.js", "react-dom-profiling.development.js"])(
    "%s records a render-phase ping instead of dropping it",
    (file) => {
      const body = pingSuspendedRoot(file).replace(/\s+/g, " ");
      expect(body).toContain(
        "? (executionContext & RenderContext) === NoContext ? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes)",
      );
      expect(body).not.toContain("(executionContext & RenderContext) === NoContext && prepareFreshStack(root, 0)");
    },
  );
});
