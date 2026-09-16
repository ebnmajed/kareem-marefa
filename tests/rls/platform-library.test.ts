// platform — SCR-083's library read, as contract 3 is ruled (DEC-148). The SQL
// is `supabase/proposed/platform/0009_platform_library_roster.sql`, applied
// inside the transaction and rolled back; the guard below survives promotion.
//
// Three columns the screen needs and must never compute itself: a certificate's
// ORIENTATION (read from its latest version's master, never a column), whether a
// row is BASELINE (no `template.promoted` in the platform's own trail), and
// whether it is RETIRABLE — which is `retire_platform_template()`'s refusal,
// negated, beside the guard, so there is one copy of the rule.
//
// Written against the roster in the database, whatever its size: the eight of
// `0061` today, the eleven of DEC-148 once `designer`'s seed is promoted.
//
// REQ-DSG-008 · REQ-DSG-026 · REQ-ADM-001 · DEC-052

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyProposed, errorMessage, withTx, type Claims, type Tx } from "./db";
import { seed, seedBase } from "./fixture";

const FILE = "platform/0009_platform_library_roster.sql";

async function apply(tx: Tx) {
  if (existsSync(join(process.cwd(), "supabase", "proposed", FILE))) await applyProposed(tx, FILE);
}

function platformClaims(authUserId: string, email: string): Claims {
  return { sub: authUserId, email, platform_admin: true };
}

type Row = {
  id: string;
  purpose: "poster" | "certificate";
  family: string;
  is_default: boolean;
  retired_at: string | null;
  orientation: string | null;
  is_baseline: boolean;
  retirable: boolean;
};

const library = (tx: Tx) => tx.q<Row>(`select * from public.platform_template_library()`);

describe("platform — the library roster (0009)", () => {
  it("RPC-platform_template_library.platform_only — an org admin is refused", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => library(tx))).toMatch(/not_platform_admin/);
    });
  });

  it("RPC-platform_template_library.roster — every seeded row is baseline; a certificate carries its orientation, a poster none", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));

      const rows = await library(tx);
      expect(rows.length).toBeGreaterThanOrEqual(8);
      expect(rows.every((r) => r.is_baseline), "nothing has been promoted in a fresh database").toBe(true);
      for (const r of rows.filter((x) => x.purpose === "poster")) expect(r.orientation, r.family).toBeNull();
      for (const r of rows.filter((x) => x.purpose === "certificate")) expect(["landscape", "portrait"], r.family).toContain(r.orientation);
      // The families of 06 §3.3, each present.
      expect(new Set(rows.filter((r) => r.purpose === "poster").map((r) => r.family))).toEqual(
        new Set(["talk", "workshop", "panel", "meetup", "announcement"]),
      );
      expect(new Set(rows.filter((r) => r.purpose === "certificate").map((r) => r.family))).toEqual(
        new Set(["attendance", "presenter", "achievement"]),
      );
    });
  });

  it("RPC-platform_template_library.roster — orientation is the latest version's master, width against height", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.asOwner();
      const [tpl] = await tx.q<{ id: string }>(
        `insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
         values (null, 'platform', 'certificate', 'attendance', 'شهادة للاختبار', false) returning id`,
      );
      const doc = (w: number, h: number) => JSON.stringify({ schemaVersion: 1, master: { width: w, height: h, unit: "px" }, layers: [] });
      await tx.q(
        `insert into public.design_template_versions (org_id, template_id, version, document, published_at)
         values (null, $1, 1, $2::jsonb, now()), (null, $1, 2, $3::jsonb, now())`,
        [tpl.id, doc(3508, 2480), doc(2480, 3508)],
      );

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      expect((await library(tx)).find((r) => r.id === tpl.id)!.orientation, "version 2 is portrait").toBe("portrait");
    });
  });

  it("RPC-platform_template_library.roster — `retirable` is the guard negated: false for the last default of a purpose, true again beside a second", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));

      const defaults = (await library(tx)).filter((r) => r.purpose === "certificate" && r.is_default && r.retired_at === null);
      expect(defaults.length).toBeGreaterThanOrEqual(2);
      expect(defaults.every((r) => r.retirable)).toBe(true);

      for (const r of defaults.slice(0, -1)) await tx.q(`select public.retire_platform_template($1, true)`, [r.id]);
      const last = defaults[defaults.length - 1];
      let rows = await library(tx);
      expect(rows.find((r) => r.id === last.id)!.retirable, "the last default is not offered").toBe(false);
      // And the guard agrees with the column, which is the point of computing it beside it.
      expect(await errorMessage(() => tx.q(`select public.retire_platform_template($1, true)`, [last.id]))).toMatch(/last_platform_default/);
      // A retired row is never «retirable»: it offers «return to service» instead.
      expect(rows.filter((r) => r.retired_at !== null).every((r) => !r.retirable)).toBe(true);

      await tx.q(`select public.retire_platform_template($1, false)`, [defaults[0].id]);
      rows = await library(tx);
      expect(rows.find((r) => r.id === last.id)!.retirable, "a second default makes the last one retirable again").toBe(true);
    });
  });

  it("RPC-platform_template_library.roster — a promoted row is not baseline, and the seeded ones still are", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const [{ promote_template_to_platform: promoted }] = await tx.q<{ promote_template_to_platform: string }>(
        `select public.promote_template_to_platform($1, 'قالب مرقّى') as promote_template_to_platform`,
        [f.m6.a.certTemplateVersionId],
      );
      const rows = await library(tx);
      expect(rows.find((r) => r.id === promoted)!.is_baseline).toBe(false);
      expect(rows.filter((r) => r.id !== promoted && r.id !== f.m6.platformTemplateId).every((r) => r.is_baseline)).toBe(true);
    });
  });
});
