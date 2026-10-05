// Wave 27 — a company carries its domains, and a member's company follows theirs (0203, REQ-PRF-012, REQ-PRF-013,
// DEC-254 §2, DEC-255 §4, STORY-PRF-006).
//
// This file proves the lead's half: the table, the placement column and `provision_member()`. The save with its dry
// run, the sweep and the placement by hand are `console`'s functions and `console`'s suites.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

type Envelope = { status: string; org_id?: string; member_id?: string };
const provision = (tx: Tx) => tx.q<{ r: Envelope }>(`select public.provision_member(null) as r`).then((r) => r[0].r);

/** A Google account arriving for the first time. */
async function arrive(tx: Tx, email: string): Promise<Envelope> {
  await tx.asOwner();
  const id = randomUUID();
  await tx.q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [id, email, JSON.stringify({ full_name: "وافد" })]);
  await tx.as({ sub: id, email });
  return provision(tx);
}

const placement = async (tx: Tx, email: string) => {
  await tx.asOwner();
  return (await tx.q<{ company_id: string | null; company_assigned_by: string | null }>(
    `select company_id, company_assigned_by::text as company_assigned_by from public.members where email = $1`,
    [email],
  ))[0];
};

describe("POL-company_domains", () => {
  it("read_admin — an admin reads their org's rows; a moderator, a member and another org's admin read none", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const mine = await tx.q<{ org_id: string }>(`select org_id from public.company_domains`);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.every((r) => r.org_id === f.a.id)).toBe(true);
      for (const who of [f.a.mod, f.a.members[0]]) {
        await tx.as(who.claims);
        expect(await tx.q(`select 1 from public.company_domains`)).toHaveLength(0);
      }
    });
  });

  it("no_client_write — no client role inserts, updates or deletes", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`insert into public.company_domains (org_id, company_id, domain) values ($1, $2, 'x.example')`, [f.a.id, f.a.companyId]))).toBe("42501");
      expect(await errorCode(() => tx.q(`update public.company_domains set domain = 'y.example'`))).toBe("42501");
      expect(await errorCode(() => tx.q(`delete from public.company_domains`))).toBe("42501");
    });
  });
});

describe("CHK / TRG-company_domains", () => {
  it("one_company_per_domain — refused twice in one org, accepted across two", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ id: second }] = await tx.q<{ id: string }>(`insert into public.companies (org_id, name) values ($1, 'شركة ثانية') returning id`, [f.a.id]);
      await tx.q(`insert into public.company_domains (org_id, company_id, domain) values ($1, $2, 'shared.example')`, [f.a.id, f.a.companyId]);
      await tx.q(`insert into public.company_domains (org_id, company_id, domain) values ($1, $2, 'shared.example')`, [f.b.id, f.b.companyId]);
      expect(await errorCode(() => tx.q(`insert into public.company_domains (org_id, company_id, domain) values ($1, $2, 'shared.example')`, [f.a.id, second]))).toBe("23505");
    });
  });

  it("lowercase — stored lowercase without a leading @; a malformed one is refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ domain }] = await tx.q<{ domain: string }>(
        `insert into public.company_domains (org_id, company_id, domain) values ($1, $2, '@Mixed.Example') returning domain::text as domain`,
        [f.a.id, f.a.companyId],
      );
      expect(domain).toBe("mixed.example");
      expect(await errorCode(() => tx.q(`insert into public.company_domains (org_id, company_id, domain) values ($1, $2, 'not a domain')`, [f.a.id, f.a.companyId]))).toBe("23514");
    });
  });

  it("same_org — a row naming a company of another org is refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      expect(await errorCode(() => tx.q(`insert into public.company_domains (org_id, company_id, domain) values ($1, $2, 'cross.example')`, [f.a.id, f.b.companyId]))).toBe("23503");
    });
  });
});

describe("TRG-members.company_source", () => {
  it("no source named is 'admin'; a named 'domain' is 'domain'; never placed is null", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // the fixture inserts every member with a company and names no source
      expect((await placement(tx, f.a.members[0].email)).company_assigned_by).toBe("admin");

      await tx.asOwner();
      await tx.q(`insert into public.members (org_id, email) values ($1, 'nobody@x.example')`, [f.a.id]);
      expect(await placement(tx, "nobody@x.example")).toEqual({ company_id: null, company_assigned_by: null });

      await tx.q(`select set_config('kareem.company_source', 'domain', true)`);
      await tx.q(`update public.members set company_id = $1 where email = 'nobody@x.example'`, [f.a.companyId]);
      await tx.q(`select set_config('kareem.company_source', '', true)`);
      expect((await placement(tx, "nobody@x.example")).company_assigned_by).toBe("domain");

      // a member's own profile save in the gap before the revoke: no source named, so it is the conservative 'admin'
      await tx.q(`update public.members set company_id = null where email = 'nobody@x.example'`);
      expect(await placement(tx, "nobody@x.example")).toEqual({ company_id: null, company_assigned_by: "admin" });
    });
  });
});

describe("RPC-provision_member — REQ-PRF-012", () => {
  it("places_by_domain — a first sign-in from a company's domain lands in it; no match leaves both null", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      // the org admits the domain AND a company carries it — two independent lists (ruling 1)
      await tx.q(`insert into public.org_domains (org_id, domain) values ($1, 'partner.example'), ($1, 'nomatch.example')`, [f.a.id]);
      await tx.q(`insert into public.company_domains (org_id, company_id, domain) values ($1, $2, 'partner.example')`, [f.a.id, f.a.companyId]);

      expect((await arrive(tx, "new@partner.example")).status).toBe("provisioned");
      expect(await placement(tx, "new@partner.example")).toEqual({ company_id: f.a.companyId, company_assigned_by: "domain" });

      expect((await arrive(tx, "new@nomatch.example")).status).toBe("provisioned");
      expect(await placement(tx, "new@nomatch.example")).toEqual({ company_id: null, company_assigned_by: null });
    });
  });

  it("a deactivated company places nobody", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ id: gone }] = await tx.q<{ id: string }>(`insert into public.companies (org_id, name, deactivated_at) values ($1, 'شركة متوقفة', now()) returning id`, [f.a.id]);
      await tx.q(`insert into public.org_domains (org_id, domain) values ($1, 'gone.example')`, [f.a.id]);
      await tx.q(`insert into public.company_domains (org_id, company_id, domain) values ($1, $2, 'gone.example')`, [f.a.id, gone]);
      await arrive(tx, "x@gone.example");
      expect((await placement(tx, "x@gone.example")).company_id).toBeNull();
    });
  });

  it("binding_keeps_admin_choice — an added member keeps the admin's company; one added with none is placed by domain", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ id: other }] = await tx.q<{ id: string }>(`insert into public.companies (org_id, name) values ($1, 'شركة أخرى') returning id`, [f.a.id]);
      await tx.q(`insert into public.company_domains (org_id, company_id, domain) values ($1, $2, 'partner.example')`, [f.a.id, other]);
      // two waiting rows, as add_member() leaves them: one with the admin's company, one with none
      await tx.q(`insert into public.members (org_id, email, company_id) values ($1, 'placed@partner.example', $2)`, [f.a.id, f.a.companyId]);
      await tx.q(`insert into public.members (org_id, email) values ($1, 'open@partner.example')`, [f.a.id]);

      await arrive(tx, "placed@partner.example");
      expect(await placement(tx, "placed@partner.example")).toEqual({ company_id: f.a.companyId, company_assigned_by: "admin" });

      await arrive(tx, "open@partner.example");
      expect(await placement(tx, "open@partner.example")).toEqual({ company_id: other, company_assigned_by: "domain" });
    });
  });

  it("★ company_never_blocks — with the lookup made to raise, the sign-in still provisions, with no company", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`insert into public.org_domains (org_id, domain) values ($1, 'partner.example')`, [f.a.id]);
      await tx.q(`insert into public.company_domains (org_id, company_id, domain) values ($1, $2, 'partner.example')`, [f.a.id, f.a.companyId]);
      await tx.q(`create or replace function public.company_for_domain(p_org uuid, p_domain text) returns uuid
                  language plpgsql as $$ begin raise exception 'boom'; end $$`);
      expect((await arrive(tx, "safe@partner.example")).status).toBe("provisioned");
      expect((await placement(tx, "safe@partner.example")).company_id).toBeNull();
    });
  });
});
