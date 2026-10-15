// supabase/migrations/0230_company_logo.sql — a company's logo (DEC-298, REQ-ADM-008, REQ-LDR-004, REQ-UIX-079).
//
// 03 §8.2 rows proven here: POL-storage.design_assets.company_logo, RPC-company_logo.same_org,
// TRG-companies.logo_same_org, TRG-companies.logo_audit.
//
// One object per company is opened, to the members of that company's org only; everything else stays closed.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function asset(tx: Tx, orgId: string): Promise<{ id: string; path: string }> {
  const id = randomUUID();
  const path = `${orgId}/design/assets/${id}.png`;
  await tx.q(
    `insert into public.design_assets (id, org_id, storage_path, sniffed_mime, width, height, byte_size)
     values ($1, $2, $3, 'image/png', 512, 512, 2048)`,
    [id, orgId, path],
  );
  await tx.q(`insert into storage.objects (bucket_id, name) values ('design-assets', $1) on conflict do nothing`, [path]);
  return { id, path };
}

async function company(tx: Tx, orgId: string, logo: string | null = null): Promise<string> {
  const [row] = await tx.q<{ id: string }>(`insert into public.companies (org_id, name, logo_asset_id) values ($1, $2, $3) returning id`, [orgId, `شركة ${randomUUID().slice(0, 6)}`, logo]);
  return row.id;
}

const visible = (tx: Tx, path: string) => tx.q<{ name: string }>(`select name from storage.objects where bucket_id = 'design-assets' and name = $1`, [path]);
const logoOf = (tx: Tx, companyId: string) => tx.q<{ storage_path: string; content_type: string }>(`select * from public.company_logo($1)`, [companyId]);

describe("POL-storage.design_assets.company_logo", () => {
  it("a member of the org reads exactly the object a company names — and no other asset of the org", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const logo = await asset(tx, f.a.id);
      const poster = await asset(tx, f.a.id);
      await company(tx, f.a.id, logo.id);

      await tx.as(f.a.members[0].claims);
      expect(await visible(tx, logo.path)).toEqual([{ name: logo.path }]);
      expect(await visible(tx, poster.path)).toEqual([]);
    });
  });

  it("another org's member and anon are refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const logo = await asset(tx, f.a.id);
      const c = await company(tx, f.a.id, logo.id);

      await tx.as(f.b.members[0].claims);
      expect(await visible(tx, logo.path)).toEqual([]);
      expect(await logoOf(tx, c)).toEqual([]);

      await tx.asAnon();
      expect(await visible(tx, logo.path)).toEqual([]);
      await expect(logoOf(tx, c)).rejects.toThrow();
    });
  });

  it("a replaced logo closes the old object at once; a cleared one closes it entirely", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const first = await asset(tx, f.a.id);
      const second = await asset(tx, f.a.id);
      const c = await company(tx, f.a.id, first.id);
      await tx.q(`update public.companies set logo_asset_id = $2 where id = $1`, [c, second.id]);

      await tx.as(f.a.members[0].claims);
      expect(await visible(tx, first.path)).toEqual([]);
      expect(await visible(tx, second.path)).toHaveLength(1);

      await tx.asOwner();
      await tx.q(`update public.companies set logo_asset_id = null where id = $1`, [c]);
      await tx.as(f.a.members[0].claims);
      expect(await visible(tx, second.path)).toEqual([]);
      expect(await logoOf(tx, c)).toEqual([]);
    });
  });
});

describe("RPC-company_logo.same_org", () => {
  it("answers a member of the company's org with the path and the sniffed type", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const logo = await asset(tx, f.a.id);
      const c = await company(tx, f.a.id, logo.id);
      await tx.as(f.a.members[0].claims);
      expect(await logoOf(tx, c)).toEqual([{ storage_path: logo.path, content_type: "image/png" }]);
      expect(await logoOf(tx, randomUUID())).toEqual([]);
    });
  });
});

describe("TRG-companies.logo_same_org", () => {
  it("refuses another org's asset as a company's logo (23514)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const foreign = await asset(tx, f.b.id);
      await expect(company(tx, f.a.id, foreign.id)).rejects.toMatchObject({ code: "23514" });
    });
  });
});

describe("TRG-companies.logo_audit", () => {
  it("an admin's logo change writes company.logo_changed, once", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const logo = await asset(tx, f.a.id);
      const c = await company(tx, f.a.id);
      await tx.as(f.a.admin.claims);
      const updated = await tx.q(`update public.companies set logo_asset_id = $2 where id = $1 returning id`, [c, logo.id]);
      expect(updated).toHaveLength(1);

      await tx.asOwner();
      const rows = await tx.q<{ action: string }>(`select action from public.audit_log where subject_id = $1 and action like 'company.%' and action <> 'company.created'`, [c]);
      expect(rows.map((r) => r.action)).toEqual(["company.logo_changed"]);
    });
  });
});
