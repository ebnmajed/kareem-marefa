#!/usr/bin/env node
// Installs (or updates) graphile-worker's own schema on the local database.
// `supabase db reset` recreates the database from supabase/migrations/ and
// leaves it without one; since 0028, check_in() enqueues through
// public.enqueue_job() (0025), so an app served against a freshly reset
// database would fail every check-in with 3F000. `npm run db:reset` chains
// this; scripts/rls.mjs does the same before the RLS suite. DEC-046.
import { spawnSync } from "node:child_process";
import path from "node:path";

const url = process.env.RLS_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const bin = path.join(process.cwd(), "node_modules", ".bin", "graphile-worker");
const r = spawnSync(bin, ["--schema-only", "-c", url], { stdio: "inherit" });
process.exit(r.status ?? 1);
