// ★ REQ-DSG-026's roster, COUNTED — DEC-128, DEC-148, and DEC-254 §3 (REQ-DSG-035).
//
// «The seeded roster is counted, not assumed.» 0061 seeded eight
// compositions and REQ-DSG-026 promised more; nothing counted, so the short
// roster survived three milestones. DEC-148 ruled what a row IS — a
// COMPOSITION: five poster families, three certificate families × landscape
// and portrait — and that the scheme is never a row. So this file asserts
// LITERALS: 11 rows and 22 renderable variants. A number read from the
// library would let a short library shrink its own expectation.
//
// ★★ LEDGER C-2 (wave 27, PR D, DEC-254 §3): the roster is counted PER ORG. There is no platform library — the
// baseline is a seed every org receives as its own rows (0205 – 0207), and the platform rows are deleted or retired
// (0209). Until this wave the file rebuilt the PLATFORM library by replaying 0061 → 0196 on an empty world; that
// history wrote live platform rows, which the database now refuses (0210). So each case seeds a fresh org through
// the trigger on `orgs` and counts ITS rows — the same eleven compositions, the same documents, the same defaults.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { platformBrand, colourFieldsOf, resolveColour, type BrandScheme, type DesignDocument } from "@kareem/designer-runtime";
import { pool, withTx, type Tx } from "./db";

afterAll(() => pool.end());

/** A fresh org, seeded by the trigger on `orgs` the moment it exists. */
async function seededOrg(tx: Tx): Promise<string> {
  await tx.asOwner();
  const [o] = await tx.q<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة القائمة', $1, 'RS', $2) returning id`,
    [`roster-${randomUUID().slice(0, 8)}`, randomUUID()],
  );
  return o.id;
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

async function orgRows(tx: Tx, orgId: string): Promise<Row[]> {
  return tx.q<Row>(
    `select t.id, t.purpose, t.family, t.name, t.is_default, v.version, v.document
       from public.design_templates t
       join lateral (
         select version, document from public.design_template_versions v
          where v.template_id = t.id and v.published_at is not null
          order by version desc limit 1
       ) v on true
      where t.org_id = $1 and t.retired_at is null
      order by t.purpose, t.family, t.is_default desc`,
    [orgId],
  );
}

const orientation = (d: DesignDocument) => (d.master.width >= d.master.height ? "landscape" : "portrait");

describe("REQ-DSG-026 — the seeded roster, per org (DEC-148, DEC-254 §3)", () => {
  it("roster.rows — ★ exactly 11 templates an org owns: 5 poster families, 3 certificate families × landscape and portrait", async () => {
    await withTx(async (tx) => {
      const rows = await orgRows(tx, await seededOrg(tx));
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
      const rows = await orgRows(tx, await seededOrg(tx));
      let variants = 0;
      for (const row of rows) {
        for (const scheme of ["light", "dark"] as BrandScheme[]) {
          const palette = platformBrand(scheme);
          // A colour is a `brand.*` token or a `design.*` constant; `resolveColour()` is the one funnel both go
          // through, so the honest assertion is «does the renderer get a colour».
          const unresolved = colourFieldsOf(row.document)
            .map(({ path, value }) => ({ path, hex: resolveColour({ values: palette }, value, "") }))
            .filter(({ hex }) => !/^#[0-9A-Fa-f]{6}$/.test(hex));
          expect(unresolved, `${row.family}@${orientation(row.document)} in ${scheme}`).toEqual([]);
          variants++;
        }
      }
      expect(variants).toBe(22);
    });
  });

  it("roster.poster_ground — ★ every poster family carries a FLAT ground, and five families use five resolved colours", async () => {
    // ★ The five grounds are compared AS RESOLVED COLOURS, not as binding strings: three distinct strings once
    // resolved within 1.10 – 1.22:1 of one another (wave 24's re-colour), and five strings said nothing about it.
    // ★ LEDGER C-2: version 1, not 2 — the platform row carried the re-coloured document as ITS version 2; an org's
    // seeded template carries the same document as its first.
    await withTx(async (tx) => {
      const palette = platformBrand("dark");
      const grounds = new Map<string, string>();
      for (const row of (await orgRows(tx, await seededOrg(tx))).filter((r) => r.purpose === "poster")) {
        expect(row.version, row.family).toBe(1);
        const bg = row.document.background as { type: string; color?: string } | undefined;
        expect(bg?.type, row.family).toBe("solid");
        expect(bg?.color, row.family).toMatch(/^\{\{(?:brand|design)\.[A-Za-z]+\}\}$/);
        const hex = resolveColour({ values: palette }, bg?.color, "");
        expect(hex, `${row.family} resolves`).toMatch(/^#[0-9A-Fa-f]{6}$/);
        grounds.set(row.family, hex);
      }
      expect(grounds.size).toBe(5);
      expect(new Set(grounds.values()).size, `grounds: ${JSON.stringify([...grounds])}`).toBe(5);
    });
  });

  it("roster.no_platform — ★ no LIVE platform template remains; an org's roster is all it reads", async () => {
    // ★ LEDGER C-2: replaced `roster.superseded` («the old eleven are gone from the live roster»). The platform library
    // itself is gone (0209); what may remain is a RETIRED platform row an org's certificate or document still names.
    await withTx(async (tx) => {
      const org = await seededOrg(tx);
      const [{ live }] = await tx.q<{ live: string }>(`select count(*)::text as live from public.design_templates where scope = 'platform' and retired_at is null`);
      expect(live).toBe("0");
      const versions = await tx.q<{ v: string }>(
        `select distinct v.version::text as v from public.design_template_versions v
           join public.design_templates t on t.id = v.template_id where t.org_id = $1 order by 1`,
        [org],
      );
      expect(versions.map((r) => r.v)).toEqual(["1"]);
    });
  });

  it("roster.defaults — one default per family: every poster, and the LANDSCAPE certificates", async () => {
    await withTx(async (tx) => {
      const rows = await orgRows(tx, await seededOrg(tx));
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

  it("roster.idempotent — the seed run again adds no row and no version, and version 1 is never edited", async () => {
    // ★ LEDGER C-2: the re-run is `seed_org_templates()` on the org, not the platform seeds; and the counts are an
    // org's eleven templates with one version each, where the platform's were eleven with two (0193's v1, 0196's v2).
    await withTx(async (tx) => {
      const org = await seededOrg(tx);
      const fingerprint = async () =>
        (
          await tx.q<{ v1: string }>(
            `select md5(string_agg(v.document::text, '|' order by t.purpose, t.family, v.id)) as v1
               from public.design_template_versions v join public.design_templates t on t.id = v.template_id
              where t.org_id = $1 and v.version = 1`,
            [org],
          )
        )[0]!.v1;
      const count = async () =>
        (
          await tx.q<{ templates: string; versions: string }>(
            `select (select count(*) from public.design_templates where org_id = $1)::text as templates,
                    (select count(*) from public.design_template_versions v join public.design_templates t on t.id = v.template_id where t.org_id = $1)::text as versions`,
            [org],
          )
        )[0];
      const before = await count();
      const v1 = await fingerprint();
      expect(before).toEqual({ templates: "11", versions: "11" });

      const [{ n }] = await tx.q<{ n: number }>(`select public.seed_org_templates($1) as n`, [org]);
      expect(n).toBe(0);
      expect(await count()).toEqual(before);
      expect(await fingerprint()).toBe(v1);
    });
  });
});
