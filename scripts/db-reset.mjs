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
  if (status === 0) status = await kongReachesAuth();
} finally {
  rmSync(RESET_LOCK, { recursive: true, force: true });
}
process.exit(status);

// A reset restarts the Auth container, which comes back at a new address
// while Kong keeps the old one: every /auth/v1 call then answers 502 and an
// e2e fails in beforeAll on createUser() with "invalid response from the
// upstream server" — the wave-3 housekeeping finding, hit again at wave-4
// sync 2 (DEC-055). Probe the health route through Kong; on a 502, restart
// Kong once and probe again. The API URL is local by construction here.
async function kongReachesAuth() {
  const url = "http://127.0.0.1:54321/auth/v1/health";
  const ok = async () => {
    try {
      return (await fetch(url)).status === 200;
    } catch {
      return false;
    }
  };
  for (let i = 0; i < 5 && !(await ok()); i++) await new Promise((r) => setTimeout(r, 2000));
  if (await ok()) return 0;
  console.error("db-reset: Kong cannot reach Auth after the reset (502) — restarting Kong");
  const kong = spawnSync("docker", ["ps", "--filter", "name=supabase_kong_", "--format", "{{.Names}}"], { encoding: "utf8" }).stdout.trim();
  if (!kong) return 1;
  spawnSync("docker", ["restart", kong], { stdio: "inherit" });
  for (let i = 0; i < 15 && !(await ok()); i++) await new Promise((r) => setTimeout(r, 2000));
  if (await ok()) return 0;
  console.error("db-reset: Auth is still unreachable through Kong — `supabase stop && supabase start`");
  return 1;
}
