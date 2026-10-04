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
/**
 * ★ wave 24 (DEC-242) — the supersede function and the rebuilt library, in the
 * order they must be applied: 0005 CALLS `supersede_baseline_template()`, so the
 * function comes first.
 *
 * ★★ RETURNS A LIST, because the shape of this wave changes under the test's
 * feet when the lead promotes. Under `supabase/proposed/` it is TWO files; the
 * lead promotes them as ONE migration (`0193_baseline_library_playground.sql`),
 * whose name ends with neither proposed suffix. `db.ts`'s own rule is that a
 * test which proved something under `proposed/` must keep passing the moment it
 * is promoted — so this resolves both states rather than naming one, and a
 * missing wave is a loud failure rather than a silent no-op.
 */
function wave24(): string[] {
  const proposed = ["0006_supersede_baseline.sql", "0005_playground_library.sql"]
    .map((f) => join(process.cwd(), "supabase", "proposed", "designer", f))
    .filter((f) => existsSync(f));
  if (proposed.length === 2) return proposed.map((f) => readFileSync(f, "utf8"));
  const dir = join(process.cwd(), "supabase", "migrations");
  // The promoted migration carries the function AND the seed, in that order.
  const found = readdirSync(dir).find((f) => /_baseline_library_playground\.sql$/.test(f));
  if (!found) throw new Error("wave 24's baseline seed is neither under supabase/proposed/designer/ nor promoted");
  return [readFileSync(join(dir, found), "utf8")];
}

/** The platform library as the migrations build it on an empty world. */
async function buildLibrary(tx: Tx) {
  await tx.asOwner();
  for (const t of ["certificates", "export_artifacts", "session_posters", "design_documents", "design_assets", "design_template_versions", "design_templates"]) {
    await tx.q(`delete from public.${t}`);
  }
  await tx.q(BASELINE());
  await tx.q(GUARD());
  await tx.q(SEED());
  // ★ LEDGER (wave 24): the wave's own SQL is applied. The roster is still
  // counted from the migrations alone, on an empty world — it is just that they
  // now include the wave that rebuilt every document and superseded the old rows.
  for (const body of wave24()) await tx.q(body);
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

  it("roster.poster_ground — ★ every poster family's latest version carries a FLAT brand ground, and five families use five", async () => {
    // ★ LEDGER (wave 24): replaced `roster.poster_gradient`. DEC-127's gradient
    // is one of the four visual clauses DEC-242 supersedes in REQ-DSG-026, and
    // the version is 1 because these are eleven NEW rows (REQ-DSG-034), not new
    // versions of the old ones.
    await withTx(async (tx) => {
      await buildLibrary(tx);
      const grounds = new Set<string>();
      for (const row of (await platformRows(tx)).filter((r) => r.purpose === "poster")) {
        expect(row.version, row.family).toBe(1);
        const bg = row.document.background as { type: string; color?: string } | undefined;
        expect(bg?.type, row.family).toBe("solid");
        expect(bg?.color, row.family).toMatch(/^\{\{brand\.[A-Za-z]+\}\}$/);
        grounds.add(bg!.color as string);
      }
      expect(grounds.size).toBe(5);
    });
  });

  it("roster.superseded — ★ the old eleven are gone from the live roster, and a retired row never takes a new one's place", async () => {
    // REQ-DSG-034. On an empty world nothing references a baseline version, so
    // all eleven old rows DELETE — which is also the branch that proves the
    // seed's own idempotency guard is not relying on `retired_at`.
    await withTx(async (tx) => {
      await buildLibrary(tx);
      const [{ live, total }] = await tx.q<{ live: string; total: string }>(
        `select (select count(*) from public.design_templates where scope = 'platform' and retired_at is null)::text as live,
                (select count(*) from public.design_templates where scope = 'platform')::text as total`,
      );
      expect({ live, total }).toEqual({ live: "11", total: "11" });
      // Every live row is version 1 — i.e. a row this wave seeded, never a
      // survivor of 0061 or 0098.
      const versions = await tx.q<{ v: string }>(
        `select distinct v.version::text as v from public.design_template_versions v
           join public.design_templates t on t.id = v.template_id
          where t.scope = 'platform' and t.retired_at is null`,
      );
      expect(versions.map((r) => r.v)).toEqual(["1"]);
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

  it("roster.idempotent — the LATEST seed run twice adds no row and no version, and version 1 is never edited", async () => {
    // ★ LEDGER (wave 24): the re-run is now the latest seed's, not 0098's.
    //
    // ★ AND THE REASON IS A FINDING WORTH WRITING DOWN. Re-applying 0098 AFTER
    // wave 24's seed adds its own version 2 — the OLD design — to the eleven NEW
    // rows, because they are the live defaults it looks for. Eleven templates,
    // nineteen versions, and since `certificate_template_latest_version()` takes
    // the highest PUBLISHED version, issuance would quietly resolve the old
    // design again. It is not reachable: migrations run once, in order, and 0098
    // precedes 0193 in every environment for ever. But a future «reseed the
    // library» script that replays 0061/0098 WOULD do it, which is why this
    // comment is here and not in a commit message.
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
      // ★ LEDGER (wave 24): was `{ templates: "11", versions: "19" }` — 8
      // version-1 rows from 0061, 8 version-2 rows and 3 portrait version-1
      // rows. The wave deleted all eleven old rows on an empty world, so what
      // remains is the eleven it seeded, one version each.
      expect(before).toEqual({ templates: "11", versions: "11" });

      for (const body of wave24()) await tx.q(body);
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
