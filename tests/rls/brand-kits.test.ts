// The org brand kit — 02 §4.13 (amended under DEC-052), 03 §5.9, 06 §8.3,
// REQ-DSG-021, REQ-ADM-015.
//
// The property this file exists to prove: THE PLATFORM DEFAULT IS THE
// IDENTITY OVERRIDE. An org that has never saved a kit must read back
// exactly the platform theme — `packages/designer-runtime/src/brand.ts`'s
// `platformBrand()` — from both `public.brand_kit()` (the mail renderer's
// door) and `export_render_context()`'s new `brand` column (the poster
// renderer's door), which is what lets the parity goldens stay untouched
// this wave.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { platformBrand } from "@kareem/designer-runtime";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["branding/0001_brand_kits.sql"];

const SHA = (c: string) => c.repeat(64).slice(0, 64);

const LIGHT = {
  canvas: "#111111",
  surface: "#222222",
  fgHeading: "#333333",
  fgBody: "#444444",
  fgMuted: "#555555",
  edge: "#666666",
  edgeStrong: "#777777",
  spine: "#888888",
  node: "#999999",
};
const DARK = {
  canvas: "#0a0a0a",
  surface: "#1a1a1a",
  fgHeading: "#2a2a2a",
  fgBody: "#3a3a3a",
  fgMuted: "#4a4a4a",
  edge: "#5a5a5a",
  edgeStrong: "#6a6a6a",
  spine: "#7a7a7a",
  node: "#8a8a8a",
};

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  // The lead's fixture (tests/rls/fixture-m7.ts) seeds one kit per org so
  // the isolation sweep is non-vacuous; these cases start from "no row" —
  // the identity override — so they clear the table in their own setup, as
  // TEAM.md §3 asks (the lead, at sync 1).
  await tx.asOwner();
  await tx.q(`delete from public.brand_kits`);
  // The fixture's inserts fired the history trigger too; the history cases
  // count from zero.
  await tx.q(`delete from public.scoring_config_history where scope = 'branding'`);
  return f;
}

const saveKit = (tx: Tx, logoAssetId: string | null, headingFontId: string | null, bodyFontId: string | null) =>
  tx.q<{ id: string; org_id: string }>(
    `select * from public.save_brand_kit($1::jsonb, $2::jsonb, $3, $4, $5)`,
    [JSON.stringify(LIGHT), JSON.stringify(DARK), logoAssetId, headingFontId, bodyFontId],
  );

const readKit = async (tx: Tx, orgId: string) => {
  const [row] = await tx.q<{ brand_kit: Record<string, unknown> }>(`select public.brand_kit($1) as brand_kit`, [orgId]);
  return row.brand_kit as {
    orgId: string;
    isOverridden: boolean;
    light: Record<string, string>;
    dark: Record<string, string>;
    logoAssetId: string | null;
    headingFontId: string | null;
    bodyFontId: string | null;
  };
};

const readRenderContext = async (tx: Tx, artifactId: string) => {
  const [row] = await tx.q<{ brand: Record<string, unknown> }>(
    `select brand from public.export_render_context($1)`,
    [artifactId],
  );
  return row.brand as { light?: Record<string, string>; dark?: Record<string, string>; logoAssetId?: string } | Record<string, never>;
};

describe("POL-brand_kits.select.member", () => {
  it("a member reads the org's kit; a member of another org reads nothing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await saveKit(tx, null, null, null);

      await tx.as(f.a.members[0].claims);
      const own = await tx.q<{ org_id: string }>(`select org_id from public.brand_kits where org_id = $1`, [f.a.id]);
      expect(own).toHaveLength(1);

      await tx.as(f.b.admin.claims);
      const other = await tx.q(`select org_id from public.brand_kits where org_id = $1`, [f.a.id]);
      expect(other).toEqual([]);
    });
  });
});

describe("POL-brand_kits.write.rpc_only", () => {
  it("a direct write is refused on the grant, even by an admin", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.brand_kits (org_id, logo_asset_id, light_canvas, light_surface, light_fg_heading, light_fg_body, light_fg_muted, light_edge, light_edge_strong, light_spine, light_node, dark_canvas, dark_surface, dark_fg_heading, dark_fg_body, dark_fg_muted, dark_edge, dark_edge_strong, dark_spine, dark_node)
             values ($1, null, '#111111','#222222','#333333','#444444','#555555','#666666','#777777','#888888','#999999','#0a0a0a','#1a1a1a','#2a2a2a','#3a3a3a','#4a4a4a','#5a5a5a','#6a6a6a','#7a7a7a','#8a8a8a')`,
            [f.a.id],
          ),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-save_brand_kit.admin_only", () => {
  it("a member and a moderator are refused; an admin succeeds", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      for (const claims of [f.a.mod.claims, f.a.members[0].claims]) {
        await tx.as(claims);
        expect(await errorCode(() => saveKit(tx, null, null, null))).toBe(PERMISSION_DENIED);
      }
      await tx.as(f.a.admin.claims);
      const [row] = await saveKit(tx, null, null, null);
      expect(row.org_id).toBe(f.a.id);
    });
  });
});

describe("POL-save_brand_kit.history", () => {
  it("writes one scoring_config_history row per changed column (scope='branding') and one audit row", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await saveKit(tx, f.m6.a.assetId, f.m6.fontId, f.m6.fontId);

      await tx.asOwner();
      const history = await tx.q<{ field: string }>(
        `select field from public.scoring_config_history where org_id = $1 and scope = 'branding'`,
        [f.a.id],
      );
      // 18 colour columns + logo_asset_id + heading_font_id + body_font_id = 21.
      expect(history.length).toBe(21);

      const audit = await tx.q<{ actor_id: string; action: string }>(
        `select actor_id, action from public.audit_log where org_id = $1 and action = 'branding.kit_saved'`,
        [f.a.id],
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]?.actor_id).toBe(f.a.admin.memberId);
    });
  });

  it("a second save only writes history for the columns that actually changed", async () => {
    // scoring_config_history.changed_at is `now()`, which is TRANSACTION
    // time in Postgres — every row this test's single transaction writes
    // shares one timestamp, so "order by changed_at" cannot tell the two
    // saves apart. Counting the delta can, and so can asking for the
    // specific field/value pair the second save is expected to add.
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await saveKit(tx, null, null, null);

      await tx.asOwner();
      const [{ count: before }] = await tx.q<{ count: string }>(
        `select count(*)::int as count from public.scoring_config_history where org_id = $1 and scope = 'branding'`,
        [f.a.id],
      );

      // Same light/dark, only the logo changes.
      await tx.as(f.a.admin.claims);
      await saveKit(tx, f.m6.a.assetId, null, null);

      await tx.asOwner();
      const [{ count: after }] = await tx.q<{ count: string }>(
        `select count(*)::int as count from public.scoring_config_history where org_id = $1 and scope = 'branding'`,
        [f.a.id],
      );
      expect(Number(after) - Number(before)).toBe(1);

      const added = await tx.q(
        `select 1 from public.scoring_config_history
          where org_id = $1 and scope = 'branding' and field = 'logo_asset_id' and new_value = to_jsonb($2::text)`,
        [f.a.id, f.m6.a.assetId],
      );
      expect(added).toHaveLength(1);
    });
  });
});

describe("POL-save_brand_kit.logo_ownership", () => {
  it("a logo asset belonging to another org is refused", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => saveKit(tx, f.m6.b.assetId, null, null))).toBe("22023");
    });
  });
});

describe("POL-save_brand_kit.font_gate", () => {
  it("a font at parity_status <> 'passed' is refused for either face", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [{ id: pendingFontId }] = await tx.q<{ id: string }>(
        `insert into public.fonts (family, style, weight, source, storage_path, sha256, subsets, parity_status)
         values ('Pending Face', 'normal', 400, 'google', $1, $2, '{arabic}', 'pending') returning id`,
        [`fonts/${SHA("d")}.woff2`, SHA("d")],
      );

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => saveKit(tx, null, pendingFontId, null))).toBe("22023");
      expect(await errorCode(() => saveKit(tx, null, null, pendingFontId))).toBe("22023");
      // The passed platform font from the M6 fixture is accepted.
      const [row] = await saveKit(tx, null, f.m6.fontId, f.m6.fontId);
      expect(row.org_id).toBe(f.a.id);
    });
  });
});

describe("POL-reset_brand_kit.admin_only", () => {
  it("a moderator is refused; an admin's reset deletes the row and is audited", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await saveKit(tx, null, null, null);

      await tx.as(f.a.mod.claims);
      expect(await errorCode(() => tx.q(`select public.reset_brand_kit()`))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.admin.claims);
      await tx.q(`select public.reset_brand_kit()`);

      await tx.asOwner();
      const rows = await tx.q(`select id from public.brand_kits where org_id = $1`, [f.a.id]);
      expect(rows).toEqual([]);
      const audit = await tx.q(`select id from public.audit_log where org_id = $1 and action = 'branding.kit_reset'`, [f.a.id]);
      expect(audit).toHaveLength(1);
    });
  });

  it("resetting an org with no kit is a no-op, not an error", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.reset_brand_kit()`))).toBeNull();
    });
  });
});

describe("POL-brand_kit.identity_default", () => {
  it("★ for an org with no row, brand_kit() matches platformBrand() byte-for-byte — the identity override", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[0].claims);
      const kit = await readKit(tx, f.a.id);
      expect(kit.isOverridden).toBe(false);

      const expectedLight = platformBrand("light");
      const expectedDark = platformBrand("dark");
      for (const token of Object.keys(kit.light)) {
        expect(kit.light[token]).toBe(expectedLight[`brand.${token}`]);
      }
      for (const token of Object.keys(kit.dark)) {
        expect(kit.dark[token]).toBe(expectedDark[`brand.${token}`]);
      }
      expect(kit.logoAssetId).toBeNull();
    });
  });
});

describe("POL-brand_kit.override", () => {
  it("with a row, brand_kit() returns the org's own colours, not the platform defaults", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await saveKit(tx, f.m6.a.assetId, null, null);

      const kit = await readKit(tx, f.a.id);
      expect(kit.isOverridden).toBe(true);
      expect(kit.light.canvas).toBe(LIGHT.canvas);
      expect(kit.dark.canvas).toBe(DARK.canvas);
      expect(kit.logoAssetId).toBe(f.m6.a.assetId);

      // Org B, having saved nothing, is unaffected (isolation, not just identity).
      const kitB = await readKit(tx, f.b.id);
      expect(kitB.isOverridden).toBe(false);
      expect(kitB.light.canvas).toBe(platformBrand("light")["brand.canvas"]);
    });
  });
});

describe("POL-export_render_context.brand_identity", () => {
  it("★ for an org with no brand_kits row, `brand` is {} and every prior column is unchanged", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asServiceRole();
      const [row] = await tx.q<{
        artifact_id: string;
        document_id: string;
        preset: string;
        brand: Record<string, unknown>;
      }>(`select artifact_id, document_id, preset, brand from public.export_render_context($1)`, [f.m6.a.artifactId]);

      expect(row.artifact_id).toBe(f.m6.a.artifactId);
      expect(row.document_id).toBe(f.m6.a.documentId);
      expect(row.preset).toBe("master");
      expect(row.brand).toEqual({});
    });
  });
});

describe("POL-export_render_context.brand_override", () => {
  it("with a row, `brand` carries exactly the light/dark overrides and logoAssetId — raw, not merged", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      await saveKit(tx, f.m6.a.assetId, null, null);

      await tx.asServiceRole();
      const brand = await readRenderContext(tx, f.m6.a.artifactId);
      expect(brand.light).toEqual(LIGHT);
      expect(brand.dark).toEqual(DARK);
      expect(brand.logoAssetId).toBe(f.m6.a.assetId);

      // Org B's artifact is untouched — org A's save must not leak across.
      const brandB = await readRenderContext(tx, f.m6.b.artifactId);
      expect(brandB).toEqual({});
    });
  });
});

describe("POL-export_render_context.grant", () => {
  it("stays service_role only", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.export_render_context($1)`, [f.m6.a.artifactId]))).toBe(PERMISSION_DENIED);
    });
  });
});
