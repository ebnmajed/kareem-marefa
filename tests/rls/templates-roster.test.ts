// ★ REQ-DSG-026's roster, COUNTED — DEC-128, DEC-148.
//
// «The seeded roster is counted, not assumed.» 0061 seeded eight
// compositions and REQ-DSG-026 promised more; nothing counted, so the short
// roster survived three milestones. DEC-148 ruled what a row IS — a
// COMPOSITION: five poster families, three certificate families × landscape
// and portrait — and that the scheme is never a row. So this file asserts
// LITERALS: 11 rows and 22 renderable variants. A number read from the
// library would let a short library shrink its own expectation.
//
// It builds the platform library from the migrations alone, inside a
// rolled-back transaction: every M6 row is cleared (fixtures and e2e
// leftovers included), then 0061's seed runs, then the wave-8 guard and seed
// — from `supabase/proposed/` while they are proposed, from the migrations
// once the lead promotes them.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { platformBrand, colourFieldsOf, type BrandScheme, type DesignDocument } from "@kareem/designer-runtime";
import { pool, withTx, type Tx } from "./db";

afterAll(() => pool.end());

function migration(suffix: string, proposed?: string): string {
  if (proposed) {
    const file = join(process.cwd(), "supabase", "proposed", "designer", proposed);
    if (existsSync(file)) return readFileSync(file, "utf8");
  }
  const dir = join(process.cwd(), "supabase", "migrations");
  const found = readdirSync(dir).find((f) => f.endsWith(suffix));
  if (!found) throw new Error(`no migration ending ${suffix}`);
  return readFileSync(join(dir, found), "utf8");
}

const BASELINE = () => migration("_baseline_library.sql");
const GUARD = () => migration("_template_guard_walks_every_colour.sql", "0001_template_guard_walks_every_colour.sql");
const SEED = () => migration("_certificate_library.sql", "0002_certificate_library.sql");

/** The platform library as the migrations build it on an empty world. */
async function buildLibrary(tx: Tx) {
  await tx.asOwner();
  for (const t of ["certificates", "export_artifacts", "session_posters", "design_documents", "design_assets", "design_template_versions", "design_templates"]) {
    await tx.q(`delete from public.${t}`);
  }
  await tx.q(BASELINE());
  await tx.q(GUARD());
  await tx.q(SEED());
}

interface Row {
  id: string;
  purpose: "poster" | "certificate";
  family: string;
  name: string;
  is_default: boolean;
  version: number;
  document: DesignDocument;
}

async function platformRows(tx: Tx): Promise<Row[]> {
  return tx.q<Row>(
    `select t.id, t.purpose, t.family, t.name, t.is_default, v.version, v.document
       from public.design_templates t
       join lateral (
         select version, document from public.design_template_versions v
          where v.template_id = t.id and v.published_at is not null
          order by version desc limit 1
       ) v on true
      where t.scope = 'platform' and t.retired_at is null
      order by t.purpose, t.family, t.is_default desc`,
  );
}

const orientation = (d: DesignDocument) => (d.master.width >= d.master.height ? "landscape" : "portrait");

describe("REQ-DSG-026 — the seeded roster (DEC-148)", () => {
  it("roster.rows — ★ exactly 11 platform templates: 5 poster families, 3 certificate families × landscape and portrait", async () => {
    await withTx(async (tx) => {
      await buildLibrary(tx);
      const rows = await platformRows(tx);
      expect(rows).toHaveLength(11);

      expect(
        rows
          .filter((r) => r.purpose === "poster")
          .map((r) => r.family)
          .sort(),
      ).toEqual(["announcement", "meetup", "panel", "talk", "workshop"]);
      expect(
        rows
          .filter((r) => r.purpose === "certificate")
          .map((r) => `${r.family}@${orientation(r.document)}`)
          .sort(),
      ).toEqual([
        "achievement@landscape",
        "achievement@portrait",
        "attendance@landscape",
        "attendance@portrait",
        "presenter@landscape",
        "presenter@portrait",
      ]);
      // Every row has a published version to render from.
      expect(rows.every((r) => r.version >= 1)).toBe(true);
    });
  });

  it("roster.variants — ★ 22 renderable variants: every row resolves every colour it names in BOTH schemes", async () => {
    await withTx(async (tx) => {
      await buildLibrary(tx);
      const rows = await platformRows(tx);
      let variants = 0;
      for (const row of rows) {
        for (const scheme of ["light", "dark"] as BrandScheme[]) {
          const palette = platformBrand(scheme);
          const unresolved = colourFieldsOf(row.document)
            .map(({ path, value }) => ({ path, token: /^\{\{\s*(brand\.[A-Za-z]+)\s*\}\}$/.exec(value)?.[1] }))
            .filter(({ token }) => !token || !palette[token]);
          expect(unresolved, `${row.family}@${orientation(row.document)} in ${scheme}`).toEqual([]);
          variants++;
        }
      }
      expect(variants).toBe(22);
    });
  });

  it("roster.poster_gradient — every poster family's latest version carries DEC-127's gradient, exactly", async () => {
    await withTx(async (tx) => {
      await buildLibrary(tx);
      for (const row of (await platformRows(tx)).filter((r) => r.purpose === "poster")) {
        expect(row.version, row.family).toBe(2);
        expect(row.document.background, row.family).toEqual({
          type: "gradient",
          angle: 140,
          stops: [{ color: "{{brand.surface}}" }, { color: "{{brand.canvasRaise}}" }],
        });
      }
    });
  });

  it("roster.defaults — one platform default per family: every poster, and the LANDSCAPE certificates", async () => {
    await withTx(async (tx) => {
      await buildLibrary(tx);
      const rows = await platformRows(tx);
      for (const family of ["talk", "workshop", "panel", "meetup", "announcement"]) {
        expect(rows.filter((r) => r.family === family && r.is_default), family).toHaveLength(1);
      }
      for (const family of ["attendance", "presenter", "achievement"]) {
        const defaults = rows.filter((r) => r.family === family && r.is_default);
        expect(defaults, family).toHaveLength(1);
        expect(orientation(defaults[0]!.document), family).toBe("landscape");
        const portrait = rows.find((r) => r.family === family && !r.is_default);
        expect(portrait && orientation(portrait.document), family).toBe("portrait");
      }
      // The two compositions say which they are.
      expect(rows.filter((r) => r.purpose === "certificate").map((r) => r.name).sort()).toEqual(
        ["شهادة إنجاز أفقية", "شهادة إنجاز عمودية", "شهادة تقديم أفقية", "شهادة تقديم عمودية", "شهادة حضور أفقية", "شهادة حضور عمودية"].sort(),
      );
    });
  });

  it("roster.idempotent — the seed run twice adds no row and no version, and version 1 is never edited", async () => {
    await withTx(async (tx) => {
      await buildLibrary(tx);
      const [{ v1 }] = await tx.q<{ v1: string }>(
        `select md5(string_agg(v.document::text, '|' order by t.family, t.purpose)) as v1
           from public.design_template_versions v join public.design_templates t on t.id = v.template_id
          where t.scope = 'platform' and v.version = 1 and t.is_default`,
      );
      const count = async () =>
        (await tx.q<{ templates: string; versions: string }>(
          `select (select count(*) from public.design_templates where scope = 'platform')::text as templates,
                  (select count(*) from public.design_template_versions v join public.design_templates t on t.id = v.template_id where t.scope = 'platform')::text as versions`,
        ))[0];
      const before = await count();
      // 8 version-1 rows from 0061, 8 version-2 rows, 3 portrait version-1 rows.
      expect(before).toEqual({ templates: "11", versions: "19" });

      await tx.q(SEED());
      expect(await count()).toEqual(before);
      const [{ v1: after }] = await tx.q<{ v1: string }>(
        `select md5(string_agg(v.document::text, '|' order by t.family, t.purpose)) as v1
           from public.design_template_versions v join public.design_templates t on t.id = v.template_id
          where t.scope = 'platform' and v.version = 1 and t.is_default`,
      );
      expect(after).toBe(v1);
    });
  });
});
