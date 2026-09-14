#!/usr/bin/env node
// `npm run db:reset` — recreate the local database from supabase/migrations/,
// reinstall graphile-worker's schema (DEC-046), and hold a lock while doing
// it. A suite that starts mid-reset fails with "function … does not exist"
// and nothing was wrong; scripts/rls.mjs waits on this lock instead. Only
// the lead runs this (TEAM.md §3).
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

export const RESET_LOCK = "/tmp/db-reset.lock";

mkdirSync(RESET_LOCK, { recursive: true });
writeFileSync(`${RESET_LOCK}/pid`, String(process.pid));
let status = 1;
try {
  status = spawnSync("supabase", ["db", "reset"], { stdio: "inherit" }).status ?? 1;
  if (status === 0) status = spawnSync(process.execPath, ["scripts/worker-schema.mjs"], { stdio: "inherit" }).status ?? 1;
} finally {
  rmSync(RESET_LOCK, { recursive: true, force: true });
}
process.exit(status);
