// Wave-4 rows on both orgs, so the isolation sweep is never vacuous for a
// wave-4 table. Built as the owner inside the caller's transaction, after
// the M2–M6 rows. Today: one `brand_kits` row per org (migration 0068) —
// org A's palette and org B's differ so a cross-org leak would be visible
// in the values, not only in the count. And one `data_export_requests` row
// for members[0] (0069) so the P3 self read is non-vacuous; `impersonation_sessions`
// is staff-only by policy, so the sweep lists it among the tables a plain
// member may see none of and `tests/rls/platform-schema.test.ts` proves the read.
//
// Inserted directly as the owner because a fixture arranges history; the
// RPCs, the history trigger and the read policy are proven by
// tests/rls/brand-kits.test.ts.

import type { Tx } from "./db";
import type { M6Fixture } from "./fixture-m6";

export interface M7Org {
  brandKitId: string;
  /** members[0]'s own export request (0069) — the P3 self read is non-vacuous. */
  dataExportRequestId: string;
}

export type M7Fixture = Omit<M6Fixture, "a" | "b"> & { a: M6Fixture["a"] & M7Org; b: M6Fixture["b"] & M7Org };

const LIGHT_A = ["#fffdf7", "#ffffff", "#1a1206", "#3d3320", "#6b5f45", "#eee7d6", "#8a7b5c", "#e2d9c2", "#1a1206"];
const DARK_A = ["#14110a", "#1e1a10", "#ffffff", "#d9d2c2", "#b3ab98", "#3a3324", "#6b6250", "#4a4231", "#d9d2c2"];
const LIGHT_B = ["#f6fbff", "#ffffff", "#06121f", "#213448", "#4b6278", "#d9e6f2", "#5f7f9c", "#c2d5e6", "#06121f"];
const DARK_B = ["#0a1420", "#101c2b", "#ffffff", "#c6d3e0", "#9fb0c2", "#243447", "#4e6480", "#31445a", "#c6d3e0"];

const COLUMNS = [
  "light_canvas", "light_surface", "light_fg_heading", "light_fg_body", "light_fg_muted", "light_edge", "light_edge_strong", "light_spine", "light_node",
  "dark_canvas", "dark_surface", "dark_fg_heading", "dark_fg_body", "dark_fg_muted", "dark_edge", "dark_edge_strong", "dark_spine", "dark_node",
];

async function seedOrg(tx: Tx, orgId: string, memberId: string, light: string[], dark: string[]): Promise<M7Org> {
  const values = [...light, ...dark];
  const placeholders = values.map((_, i) => `$${i + 2}`).join(", ");
  const rows = await tx.q<{ id: string }>(
    `insert into public.brand_kits (org_id, ${COLUMNS.join(", ")}) values ($1, ${placeholders}) returning id`,
    [orgId, ...values],
  );
  const exports = await tx.q<{ id: string }>(
    `insert into public.data_export_requests (org_id, member_id, status, completed_at, storage_path, byte_size)
     values ($1::uuid, $2::uuid, 'ready', now(), $1::text || '/exports/' || $2::text || '/archive.zip', 1024) returning id`,
    [orgId, memberId],
  );
  return { brandKitId: rows[0].id, dataExportRequestId: exports[0].id };
}

export async function seedM7(tx: Tx, f: M6Fixture): Promise<M7Fixture> {
  await tx.asOwner();
  const a = await seedOrg(tx, f.a.id, f.a.members[0].memberId, LIGHT_A, DARK_A);
  const b = await seedOrg(tx, f.b.id, f.b.members[0].memberId, LIGHT_B, DARK_B);
  return { ...f, a: { ...f.a, ...a }, b: { ...f.b, ...b } };
}
