import { defineConfig } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, "src") };

// Two projects, deliberately not sharing `resolve.conditions`:
//
// - `unit` runs server modules under Node with the `react-server` condition,
//   which is how `server-only` resolves (it throws in any other environment)
//   and how Next's server bundle sees them.
// - `components` renders React under jsdom with Testing Library. It must NOT
//   carry `react-server`, or react-dom resolves to the server build and
//   `render()` has nothing to mount into. Vitest merges project config with
//   the root by concatenating arrays, so the condition is kept out of the root
//   rather than "overridden" in one project.
// The RLS suite needs a database. It is registered only when RLS_DATABASE_URL
// is set — `npm run test:rls` sets it to local Supabase, CI's `rls` job sets
// it to its container — so `npm test` without one still runs everything else.
const rlsProject = process.env.RLS_DATABASE_URL
  ? [
      {
        resolve: { alias },
        test: {
          name: "rls",
          include: ["tests/rls/**/*.test.ts"],
          environment: "node",
          // One connection, one transaction per test, rolled back. Files must
          // not interleave on the same database.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ]
  : [];

export default defineConfig({
  test: {
    projects: [
      ...rlsProject,
      {
        resolve: { alias, conditions: ["react-server"] },
        test: {
          name: "unit",
          include: ["tests/*.test.ts", "tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: {
          alias: [
            { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "src/$1") },
            // Next ships `next/navigation` as a root-level `.js` file with no
            // `exports` map, so Vite cannot resolve the bare specifier that
            // next-intl (and any component using next/link) imports.
            { find: /^next\/(navigation|link|image|headers)$/, replacement: "next/$1.js" },
          ],
        },
        test: {
          name: "components",
          include: ["tests/components/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["tests/setup/components.ts"],
          // next-intl imports `next/navigation`, which Node cannot resolve
          // on its own (see the alias above). Inline it so Vite transforms
          // it and the alias applies; everything else stays external.
          server: { deps: { inline: ["next-intl"] } },
          // Every component test runs inside an Arabic RTL document, because
          // that is the product (10 §2.1). A test that needs LTR says so.
          environmentOptions: {
            jsdom: { html: '<!doctype html><html lang="ar" dir="rtl"><body></body></html>' },
          },
        },
      },
    ],
  },
});
