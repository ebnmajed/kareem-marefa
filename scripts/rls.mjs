#!/usr/bin/env node
// `npm run test:rls` — installs graphile-worker's own schema, then runs the
// RLS project. DEC-046, 02 §4.17.
//
// The RPCs enqueue jobs through `public.enqueue_job()` (migration 0025),
// which calls `graphile_worker.add_job`. That schema is the library's, not
// ours: `supabase db reset` recreates the database from supabase/migrations/
// and leaves it without one, so every run installs (or updates) it first.
// `--schema-only` is idempotent and takes about a second. CI's `rls` job does
// the same step after applying the migrations (.github/workflows/ci.yml).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const url = process.env.RLS_DATABASE_URL;
if (!url) {
  console.error("rls: RLS_DATABASE_URL is not set — run `npm run test:rls`");
  process.exit(2);
}

const bin = path.join(process.cwd(), "node_modules", ".bin", "graphile-worker");
if (!existsSync(bin)) {
  console.error("rls: node_modules/.bin/graphile-worker is missing — run `npm ci`");
  process.exit(2);
}

const schema = spawnSync(bin, ["--schema-only", "-c", url], { stdio: "inherit" });
if (schema.status !== 0) {
  console.error("rls: graphile-worker --schema-only failed; the enqueue tests would fail with 3F000");
  process.exit(schema.status ?? 1);
}

const vitest = spawnSync(
  path.join(process.cwd(), "node_modules", ".bin", "vitest"),
  ["run", "--project", "rls", ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env },
);
process.exit(vitest.status ?? 1);
