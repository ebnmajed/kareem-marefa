// The RLS suite's database access. 13 §3, DEC-035.
//
// One connection, one transaction per test, rolled back — a fixture built
// inside `withTx` never outlives the test. Identity is switched the way
// Supabase itself does it: `set local role` plus the `request.jwt.claims`
// setting that `auth.jwt()` reads. Nothing here goes through PostgREST; the
// policies, grants and functions are the same either way, and this is an
// order of magnitude faster.
//
// RLS_DATABASE_URL: local Supabase (54322) by default via `npm run test:rls`;
// CI's container in the `rls` job.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.RLS_DATABASE_URL;
if (!url) throw new Error("RLS_DATABASE_URL is not set — run `npm run test:rls`");

export const pool = new pg.Pool({ connectionString: url, max: 1 });

export type Claims = {
  sub: string;
  org_id?: string;
  member_id?: string;
  org_role?: "admin" | "moderator" | "member";
  status?: "active" | "deactivated";
  claims_version?: number;
  org_status?: "active" | "suspended";
  platform_admin?: boolean;
  email?: string;
};

export interface Tx {
  /** Raw query as whoever the transaction currently is. */
  q<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Become `authenticated` carrying these claims. */
  as(claims: Claims): Promise<void>;
  /** Become `service_role` (bypassrls, like the worker's client). */
  asServiceRole(): Promise<void>;
  /** Become `anon`. */
  asAnon(): Promise<void>;
  /** Back to the migration owner (postgres): bypasses RLS, builds fixtures. */
  asOwner(): Promise<void>;
}

export async function withTx(fn: (tx: Tx) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  const tx: Tx = {
    async q(sql, params) {
      // A failed statement aborts a Postgres transaction. The suite EXPECTS
      // failures (42501 is the point), so every statement runs inside its own
      // savepoint and a failure is rolled back to it, not to the test's start.
      await client.query("savepoint q");
      try {
        const rows = (await client.query(sql, params)).rows;
        await client.query("release savepoint q");
        return rows;
      } catch (e) {
        await client.query("rollback to savepoint q");
        throw e;
      }
    },
    async as(claims) {
      const { sub, email, ...app } = claims;
      const jwt = {
        sub,
        role: "authenticated",
        aud: "authenticated",
        email: email ?? null,
        app_metadata: app,
      };
      await client.query("reset role");
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(jwt)]);
      await client.query("set local role authenticated");
    },
    async asServiceRole() {
      await client.query("reset role");
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
      await client.query("set local role service_role");
    },
    async asAnon() {
      await client.query("reset role");
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
      await client.query("set local role anon");
    },
    async asOwner() {
      await client.query("reset role");
      await client.query("select set_config('request.jwt.claims', '', true)");
    },
  };
  try {
    await client.query("begin");
    await fn(tx);
  } finally {
    try {
      await client.query("rollback");
    } catch {}
    client.release();
  }
}

/** Runs `fn` and returns the Postgres error code it threw, or null. */
export async function errorCode(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "unknown";
  }
}

/** Runs `fn` and returns the error message it threw, or null. */
export async function errorMessage(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message ?? "unknown";
  }
}

export const PERMISSION_DENIED = "42501";

/**
 * Runs a proposed migration (supabase/proposed/<path>) inside the current
 * transaction, as the owner. Postgres DDL is transactional, so the file's
 * tables, functions and policies exist for the rest of the test and vanish
 * at rollback — a teammate proves SQL without touching the shared database
 * or writing into supabase/migrations/ (DEC-040). Restores whichever role the
 * test had before.
 */
export async function applyProposed(tx: Tx, relativePath: string): Promise<void> {
  const sql = readFileSync(join(process.cwd(), "supabase", "proposed", relativePath), "utf8");
  await tx.asOwner();
  await tx.q(sql);
  // asOwner() reset the role; callers re-assume their identity with tx.as().
}
