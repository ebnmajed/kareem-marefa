// An org owns its templates from the day it is created — REQ-DSG-035, REQ-DSG-026 as DEC-254 §3 amends it,
// REQ-CRT-015, DEC-255 (the sync-1 rulings D1, D2, D6, D7, D10).
//
// M1, proven under `supabase/proposed/designer/` and still green the moment the lead promotes it (`applyProposed()`
// is a no-op for a promoted file): 0007 `seed_org_templates()`, 0008 the predicate, the trigger on `orgs` and the
// retire guard, 0009 the backfill.
//
// ★ The roster is counted PER ORG: five poster families, three certificate families × landscape and portrait, one
// default per (purpose, family) — every poster and the landscape certificates. ★ And a seeded document is the
// platform document it replaces, byte for byte: the same `jsonb`, and the same HTML from the one renderer.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { renderDocumentToHtml, type DesignDocument } from "@kareem/designer-runtime";
import { applyProposed, errorMessage, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const SEED = "designer/0007_seed_org_templates.sql";
const GUARD = "designer/0008_org_templates_guard.sql";
const BACKFILL = "designer/0009_org_templates_backfill.sql";

async function m1(tx: Tx) {
  await applyProposed(tx, SEED);
  await applyProposed(tx, GUARD);
}

/** A bare org, inserted the way a fixture or the owner's hand inserts one — not through `create_org()`. */
async function bareOrg(tx: Tx, slug = `seed-${randomUUID().slice(0, 8)}`) {
  await tx.asOwner();
  const [o] = await tx.q<{ id: string }>(
    `insert into public.orgs (name, slug, certificate_prefix, created_by) values ('مؤسسة البذرة', $1, 'SD', $2) returning id`,
    [slug, randomUUID()],
  );
  return o.id;
}

type Row = { purpose: string; family: string; orientation: string | null; name: string; is_default: boolean; versions: number; v1_published: boolean };

async function roster(tx: Tx, orgId: string): Promise<Row[]> {
  await tx.asOwner();
  return tx.q<Row>(
    `select t.purpose::text as purpose, t.family, t.name, t.is_default,
            case when t.purpose = 'certificate' then
              case when (l.document #>> '{master,width}')::numeric >= (l.document #>> '{master,height}')::numeric then 'landscape' else 'portrait' end
            end as orientation,
            (select count(*)::int from public.design_template_versions v where v.template_id = t.id) as versions,
            exists (select 1 from public.design_template_versions v where v.template_id = t.id and v.version = 1 and v.published_at is not null) as v1_published
       from public.design_templates t
       cross join lateral (select v.document from public.design_template_versions v where v.template_id = t.id order by v.version desc limit 1) l
      where t.org_id = $1 and t.scope = 'org'
      order by t.purpose::text, t.family, orientation`,
    [orgId],
  );
}

const EXPECTED = [
  ["certificate", "achievement", "landscape", true],
  ["certificate", "achievement", "portrait", false],
  ["certificate", "attendance", "landscape", true],
  ["certificate", "attendance", "portrait", false],
  ["certificate", "presenter", "landscape", true],
  ["certificate", "presenter", "portrait", false],
  ["poster", "announcement", null, true],
  ["poster", "meetup", null, true],
  ["poster", "panel", null, true],
  ["poster", "talk", null, true],
  ["poster", "workshop", null, true],
];

function expectTheSet(rows: Row[]) {
  expect(rows.map((r) => [r.purpose, r.family, r.orientation, r.is_default])).toEqual(EXPECTED);
  for (const r of rows) {
    expect(r.versions, `${r.family}@${r.orientation}`).toBe(1);
    expect(r.v1_published, `${r.family}@${r.orientation}`).toBe(true);
  }
}

describe("RPC-seed_org_templates — REQ-DSG-035", () => {
  it("★ seed.set — an org inserted directly holds the eleven compositions as its OWN published v1 rows, one default per family", async () => {
    await withTx(async (tx) => {
      await m1(tx);
      const org = await bareOrg(tx);
      expectTheSet(await roster(tx, org));
      // ★ Nothing missing of what the code falls back on.
      expect(await tx.q(`select * from public.org_missing_templates($1)`, [org])).toEqual([]);
    });
  });

  it("★ seed.create_org — an org created through the product holds the same set, audited as `system`", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await m1(tx);
      await tx.as({ sub: f.platformAdmin.authUserId, email: f.platformAdmin.email, platform_admin: true });
      const [{ id }] = await tx.q<{ id: string }>(
        `select public.create_org('مؤسسة جديدة', $1, 'NO', array['neworg.example'], 'lead@neworg.example') as id`,
        [`new-${randomUUID().slice(0, 8)}`],
      );
      expectTheSet(await roster(tx, id));
      // D7: eleven `design_template.created` rows, no member as the actor, and no `.published` for a v1.
      const audit = await tx.q<{ action: string; actor_id: string | null; actor_role: string }>(
        `select action, actor_id, actor_role from public.audit_log where org_id = $1 and action like 'design_template.%'`,
        [id],
      );
      expect(audit).toHaveLength(11);
      for (const row of audit) expect(row).toEqual({ action: "design_template.created", actor_id: null, actor_role: "system" });
    });
  });

  it("★★ seed.byte_identical — every seeded document IS the platform document it replaces: the same jsonb, the same HTML", async () => {
    await withTx(async (tx) => {
      await m1(tx);
      const org = await bareOrg(tx);
      const pairs = await tx.q<{ key: string; equal: boolean; seeded: DesignDocument; platform: DesignDocument }>(
        `with mine as (
           select t.purpose, t.family, v.document,
                  (v.document #>> '{master,width}')::numeric >= (v.document #>> '{master,height}')::numeric as landscape
             from public.design_templates t join public.design_template_versions v on v.template_id = t.id
            where t.org_id = $1
         ), theirs as (
           select t.purpose, t.family, l.document,
                  (l.document #>> '{master,width}')::numeric >= (l.document #>> '{master,height}')::numeric as landscape
             from public.design_templates t
             cross join lateral (select v.document from public.design_template_versions v where v.template_id = t.id order by v.version desc limit 1) l
            where t.scope = 'platform' and t.retired_at is null
         )
         select m.purpose || '/' || m.family || '/' || m.landscape as key, m.document = p.document as equal,
                m.document as seeded, p.document as platform
           from mine m join theirs p using (purpose, family, landscape)`,
        [org],
      );
      expect(pairs).toHaveLength(11);
      const opts = { fonts: [], bindings: { values: {} } };
      for (const p of pairs) {
        expect(p.equal, p.key).toBe(true);
        expect(renderDocumentToHtml(p.seeded, opts), p.key).toBe(renderDocumentToHtml(p.platform, opts));
      }
    });
  });

  it("seed.idempotent — a second call inserts nothing; a retired seeded row is not brought back", async () => {
    await withTx(async (tx) => {
      await m1(tx);
      const org = await bareOrg(tx);
      // Retire one that is not the last of its family — the guard refuses the last (below).
      await tx.q(
        `update public.design_templates set retired_at = now()
          where org_id = $1 and purpose = 'certificate' and family = 'attendance' and not is_default`,
        [org],
      );
      const [{ n }] = await tx.q<{ n: number }>(`select public.seed_org_templates($1) as n`, [org]);
      expect(n).toBe(0);
      const [{ count }] = await tx.q<{ count: number }>(`select count(*)::int as count from public.design_templates where org_id = $1`, [org]);
      expect(count).toBe(11);
      expect((await roster(tx, org)).reduce((sum, r) => sum + r.versions, 0)).toBe(11);
    });
  });

  it("seed.keeps_my_default — an org's own live default is never demoted, and its own composition is not doubled", async () => {
    await withTx(async (tx) => {
      await m1(tx);
      // An org that already owns an attendance LANDSCAPE default before the seed reaches it — inserted with the trigger
      // off, as an org that predates M1 is, then given its own template the way an admin's «قالب جديد» gives one.
      await tx.asOwner();
      await tx.q(`alter table public.orgs disable trigger orgs_seed_templates`);
      const org = await bareOrg(tx);
      await tx.q(`alter table public.orgs enable trigger orgs_seed_templates`);
      const [{ id: mine }] = await tx.q<{ id: string }>(
        `insert into public.design_templates (org_id, scope, purpose, family, name, is_default) values ($1, 'org', 'certificate', 'attendance', 'شهادتنا', true) returning id`,
        [org],
      );
      await tx.q(
        `insert into public.design_template_versions (template_id, version, document, published_at)
         values ($1, 1, '{"schemaVersion":1,"purpose":"certificate","master":{"width":3508,"height":2480,"unit":"px","dpi":300},"direction":"rtl","layers":[]}'::jsonb, now())`,
        [mine],
      );

      // The attendance landscape composition is present, so ten are seeded, not eleven…
      const [{ n }] = await tx.q<{ n: number }>(`select public.seed_org_templates($1) as n`, [org]);
      expect(n).toBe(10);
      // …and the org's own default is still the default.
      const defaults = await tx.q<{ id: string }>(`select id from public.design_templates where org_id = $1 and family = 'attendance' and is_default`, [org]);
      expect(defaults).toEqual([{ id: mine }]);
      expect(await tx.q(`select * from public.org_missing_templates($1)`, [org])).toEqual([]);
    });
  });

  it("★ seed.not_callable — no client role executes the seed, the lookup or the predicate", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await m1(tx);
      for (const sql of [
        `select public.seed_org_templates($1)`,
        `select public.org_template_version($1, 'poster', 'talk')`,
        `select * from public.org_missing_templates($1)`,
      ]) {
        await tx.as(f.a.admin.claims);
        expect(await errorMessage(() => tx.q(sql, [f.a.id])), sql).toMatch(/permission denied/);
        await tx.asServiceRole();
        expect(await errorMessage(() => tx.q(sql, [f.a.id])), sql).toMatch(/permission denied/);
      }
    });
  });

  it("seed.backfill — every org that existed before the trigger is seeded, and the file checks itself", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await m1(tx);
      await applyProposed(tx, BACKFILL);
      for (const org of [f.a.id, f.b.id]) {
        // The fixture's own presenter template (created by its admin) stays; the eleven seeded rows are made by no one.
        const [{ count }] = await tx.q<{ count: number }>(`select count(*)::int as count from public.design_templates where org_id = $1 and created_by is null`, [org]);
        expect(count).toBe(11);
        expect(await tx.q(`select * from public.org_missing_templates($1)`, [org])).toEqual([]);
      }
      // A re-run reports zeros and changes nothing.
      await applyProposed(tx, BACKFILL);
      const [{ count }] = await tx.q<{ count: number }>(`select count(*)::int as count from public.design_templates where org_id = any($1::uuid[])`, [[f.a.id, f.b.id]]);
      expect(count).toBe(24);
    });
  });
});

describe("RPC-org_template_version — D10's order", () => {
  it("the default, then the highest published version, then the id; a retired or unpublished template never", async () => {
    await withTx(async (tx) => {
      await m1(tx);
      const org = await bareOrg(tx);
      const lookup = async () => (await tx.q<{ v: string }>(`select public.org_template_version($1, 'certificate', 'attendance') as v`, [org]))[0].v;
      const [seededDefault] = await tx.q<{ id: string }>(
        `select v.id from public.design_templates t join public.design_template_versions v on v.template_id = t.id
          where t.org_id = $1 and t.family = 'attendance' and t.is_default`,
        [org],
      );
      expect(await lookup()).toBe(seededDefault.id);
      // A later, unpublished version of the default is not a certificate.
      const [{ id: tpl }] = await tx.q<{ id: string }>(`select id from public.design_templates where org_id = $1 and family = 'attendance' and is_default`, [org]);
      await tx.q(`insert into public.design_template_versions (template_id, version, document) select $1, 2, document from public.design_template_versions where template_id = $1`, [tpl]);
      expect(await lookup()).toBe(seededDefault.id);
    });
  });
});

describe("TRG-design_templates_keep_one_live — D6", () => {
  it("★ retiring the LAST live template of a fallback family is refused, and nothing changes", async () => {
    await withTx(async (tx) => {
      await m1(tx);
      const org = await bareOrg(tx);
      // Two attendance compositions: the first retire passes, the second is the last and is refused.
      await tx.q(`update public.design_templates set retired_at = now() where org_id = $1 and family = 'attendance' and not is_default`, [org]);
      expect(
        await errorMessage(() => tx.q(`update public.design_templates set retired_at = now(), is_default = false where org_id = $1 and family = 'attendance' and retired_at is null`, [org])),
      ).toMatch(/last_live_template/);
      expect(await tx.q(`select * from public.org_missing_templates($1)`, [org])).toEqual([]);
    });
  });

  it("the guard covers poster `talk` and the three certificate kinds — and not the other poster families", async () => {
    await withTx(async (tx) => {
      await m1(tx);
      const org = await bareOrg(tx);
      for (const family of ["talk", "achievement", "presenter"]) {
        await tx.q(`update public.design_templates set retired_at = now() where org_id = $1 and family = $2 and not is_default`, [org, family]);
        expect(await errorMessage(() => tx.q(`update public.design_templates set retired_at = now() where org_id = $1 and family = $2`, [org, family])), family).toMatch(
          /last_live_template/,
        );
      }
      // `workshop` is not a fallback: retiring the only one is the org's choice.
      await tx.q(`update public.design_templates set retired_at = now() where org_id = $1 and family = 'workshop'`, [org]);
      // Deleting the last talk, or moving it to another family, is refused the same way.
      expect(await errorMessage(() => tx.q(`delete from public.design_templates where org_id = $1 and family = 'talk'`, [org]))).toMatch(/last_live_template/);
      expect(await errorMessage(() => tx.q(`update public.design_templates set family = 'panel', is_default = false where org_id = $1 and family = 'talk'`, [org]))).toMatch(/last_live_template/);
    });
  });

  it("an org's DELETION is not blocked — its templates go with it (0191's escape)", async () => {
    await withTx(async (tx) => {
      await m1(tx);
      const org = await bareOrg(tx);
      await tx.q(`delete from public.orgs where id = $1`, [org]);
      expect(await tx.q(`select id from public.design_templates where org_id = $1`, [org])).toEqual([]);
    });
  });
});
