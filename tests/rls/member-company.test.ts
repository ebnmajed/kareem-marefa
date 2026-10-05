// Wave 27 — an admin's placement outranks the domain (REQ-PRF-013, DEC-254 §2.6, DEC-255 §4; STORY-ADM-013).
// `console`'s `set_member_company()` and the replaced `add_member()`, proved under
// `supabase/proposed/console/companies_by_domain.sql` against the lead's 0203. Called as an admin MEMBER, never as the
// owner; the owner builds the world and reads it back.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const SQL = "console/companies_by_domain.sql";

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, SQL);
  await tx.asOwner();
  const [{ id: acme }] = await tx.q<{ id: string }>(`insert into public.companies (org_id, name) values ($1, 'أكمي') returning id`, [f.a.id]);
  const [{ id: other }] = await tx.q<{ id: string }>(`insert into public.companies (org_id, name) values ($1, 'شركة أخرى') returning id`, [f.a.id]);
  await tx.q(`insert into public.company_domains (org_id, company_id, domain) values ($1, $2, 'acme.example')`, [f.a.id, acme]);
  const [{ id: person }] = await tx.q<{ id: string }>(`insert into public.members (org_id, email, display_name) values ($1, 'one@acme.example', 'عضو') returning id`, [f.a.id]);
  return { f, acme, other, person };
}

async function placement(tx: Tx, id: string) {
  await tx.asOwner();
  return (await tx.q<{ company_id: string | null; company_assigned_by: string | null }>(
    `select company_id, company_assigned_by::text as company_assigned_by from public.members where id = $1`,
    [id],
  ))[0];
}

async function place(tx: Tx, claims: Parameters<Tx["as"]>[0], member: string, company: string | null) {
  await tx.as(claims);
  return (await tx.q<{ r: { status: string } }>(`select public.set_member_company($1, $2) as r`, [member, company]))[0].r;
}

/** The whole re-derive for a company's current domains, confirmed with its own preview's token. */
async function resave(tx: Tx, claims: Parameters<Tx["as"]>[0], company: string, name: string, domains: string[]) {
  await tx.as(claims);
  const [{ r: p }] = await tx.q<{ r: { token: string; moving: number; held: number } }>(`select public.save_company($1, $2, null, $3::text[]) as r`, [company, name, domains]);
  const [{ r }] = await tx.q<{ r: { status: string } }>(`select public.save_company($1, $2, null, $3::text[], true, $4) as r`, [company, name, domains, p.token]);
  return { preview: p, result: r };
}

describe("RPC-set_member_company — REQ-PRF-013", () => {
  it("by_hand — 'admin', audited with the old and the new, and no later save moves it", async () => {
    await withTx(async (tx) => {
      const { f, acme, other, person } = await setup(tx);
      expect(await place(tx, f.a.admin.claims, person, other)).toMatchObject({ status: "saved" });
      expect(await placement(tx, person)).toEqual({ company_id: other, company_assigned_by: "admin" });

      const [row] = await tx.q<{ actor_id: string; before: unknown; after: unknown }>(
        `select actor_id, before, after from public.audit_log where action = 'member.company_changed' and subject_id = $1`,
        [person],
      );
      expect(row).toEqual({ actor_id: f.a.admin.memberId, before: { company_id: null, company_assigned_by: null }, after: { company_id: other, company_assigned_by: "admin" } });

      const { preview } = await resave(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"]);
      expect(preview).toMatchObject({ moving: 0, held: 1 });
      expect(await placement(tx, person)).toEqual({ company_id: other, company_assigned_by: "admin" });
    });
  });

  it("removal by hand — no company, the admin's; a later save does not re-place them (DEC-255 §4, Q1)", async () => {
    await withTx(async (tx) => {
      const { f, acme, person } = await setup(tx);
      await resave(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"]);
      expect(await placement(tx, person)).toEqual({ company_id: acme, company_assigned_by: "domain" });

      await place(tx, f.a.admin.claims, person, null);
      expect(await placement(tx, person)).toEqual({ company_id: null, company_assigned_by: "admin" });
      const { preview } = await resave(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"]);
      expect(preview).toMatchObject({ moving: 0, held: 1 });
      expect(await placement(tx, person)).toEqual({ company_id: null, company_assigned_by: "admin" });
    });
  });

  it("the company they have by domain, confirmed by hand, becomes the admin's; repeating it is unchanged", async () => {
    await withTx(async (tx) => {
      const { f, acme, person } = await setup(tx);
      await resave(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"]);
      expect(await place(tx, f.a.admin.claims, person, acme)).toMatchObject({ status: "saved" });
      expect(await placement(tx, person)).toEqual({ company_id: acme, company_assigned_by: "admin" });
      expect(await place(tx, f.a.admin.claims, person, acme)).toMatchObject({ status: "unchanged" });
      await tx.asOwner();
      const [{ n }] = await tx.q<{ n: number }>(`select count(*)::int as n from public.audit_log where action = 'member.company_changed' and subject_id = $1 and after ->> 'company_assigned_by' = 'admin'`, [person]);
      expect(n).toBe(1);
    });
  });

  it("refusals — a moderator and a member 42501; another org's company 23503; a deactivated one 22023", async () => {
    await withTx(async (tx) => {
      const { f, other, person } = await setup(tx);
      for (const who of [f.a.mod, f.a.members[0]]) {
        await tx.as(who.claims);
        expect(await errorCode(() => tx.q(`select public.set_member_company($1, $2)`, [person, other]))).toBe("42501");
      }
      await tx.as(f.b.admin.claims);
      expect(await errorCode(() => tx.q(`select public.set_member_company($1, $2)`, [person, f.b.companyId]))).toBe("42501");
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.set_member_company($1, $2)`, [person, f.b.companyId]))).toBe("23503");
      await tx.asOwner();
      await tx.q(`update public.companies set deactivated_at = now() where id = $1`, [other]);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.set_member_company($1, $2)`, [person, other]))).toBe("22023");
      expect(await placement(tx, person)).toEqual({ company_id: null, company_assigned_by: null });
    });
  });
});

describe("RPC-add_member.company_source — DEC-254 §2.6, DEC-255 §4 Q4", () => {
  const add = async (tx: Tx, claims: Parameters<Tx["as"]>[0], email: string, company: string | null, role = "member") => {
    await tx.as(claims);
    return (await tx.q<{ id: string }>(`select (public.add_member(p_email => $1, p_company => $2, p_role => $3::public.org_role)).id as id`, [email, company, role]))[0].id;
  };

  it("a company given is 'admin'; none given and a matching domain is 'domain'; none at all is null", async () => {
    await withTx(async (tx) => {
      const { f, acme, other } = await setup(tx);
      const byHand = await add(tx, f.a.admin.claims, "hand@acme.example", other);
      expect(await placement(tx, byHand)).toEqual({ company_id: other, company_assigned_by: "admin" });
      const byDomain = await add(tx, f.a.admin.claims, "two@acme.example", null);
      expect(await placement(tx, byDomain)).toEqual({ company_id: acme, company_assigned_by: "domain" });
      const nobody = await add(tx, f.a.admin.claims, "x@nowhere.example", null);
      expect(await placement(tx, nobody)).toEqual({ company_id: null, company_assigned_by: null });

      await tx.asOwner();
      const [{ after }] = await tx.q<{ after: Record<string, unknown> }>(`select after from public.audit_log where action = 'member.added' and subject_id = $1`, [byDomain]);
      expect(after).toMatchObject({ company_id: acme, company_assigned_by: "domain" });
    });
  });

  it("add_members inherits it line by line; an addition still never grants admin (DEC-244 §11)", async () => {
    await withTx(async (tx) => {
      const { f, acme } = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [{ r }] = await tx.q<{ r: { email: string; outcome: string; member_id?: string }[] }>(
        `select public.add_members(array['p@acme.example', 'q@nowhere.example']) as r`,
      );
      expect(r.map((l) => l.outcome)).toEqual(["added", "added"]);
      expect(await placement(tx, r[0].member_id!)).toEqual({ company_id: acme, company_assigned_by: "domain" });
      expect(await placement(tx, r[1].member_id!)).toEqual({ company_id: null, company_assigned_by: null });
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.add_member(p_email => 'boss@acme.example', p_role => 'admin')`))).toBe("22023");
    });
  });
});
