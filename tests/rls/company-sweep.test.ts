// Wave 27 — a company carries its domains, and the save asks before it moves anyone (REQ-ADM-024, REQ-PRF-012,
// DEC-254 §2.7, DEC-255 §4; STORY-ADM-012). `console`'s `save_company()`, proved under
// `supabase/proposed/console/companies_by_domain.sql` against the lead's 0203.
//
// ★ Every call is made AS AN ADMIN MEMBER, never as the owner: the function is a definer, and what is proved is what a
// member's session can make it do. The owner only builds the world and reads it back.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const SQL = "console/companies_by_domain.sql";

type Envelope = {
  status: "invalid" | "preview" | "changed" | "saved";
  moving?: number;
  held?: number;
  moved?: number;
  token?: string;
  company_name?: string;
  company_id?: string;
  errors?: { domain: string | null; reason: string; company?: string }[];
};

async function setup(tx: Tx) {
  const f = await seed(tx);
  await applyProposed(tx, SQL);
  await tx.asOwner();
  const [{ id: acme }] = await tx.q<{ id: string }>(`insert into public.companies (org_id, name) values ($1, 'أكمي') returning id`, [f.a.id]);
  const [{ id: other }] = await tx.q<{ id: string }>(`insert into public.companies (org_id, name) values ($1, 'شركة أخرى') returning id`, [f.a.id]);
  return { f, acme, other };
}

/** A member of the org with no company and nobody's placement — unbound, as an admin's addition is. */
async function member(tx: Tx, orgId: string, email: string): Promise<string> {
  await tx.asOwner();
  const [{ id }] = await tx.q<{ id: string }>(`insert into public.members (org_id, email, display_name) values ($1, $2, 'عضو') returning id`, [orgId, email]);
  return id;
}

async function placement(tx: Tx, id: string) {
  await tx.asOwner();
  return (await tx.q<{ company_id: string | null; company_assigned_by: string | null }>(
    `select company_id, company_assigned_by::text as company_assigned_by from public.members where id = $1`,
    [id],
  ))[0];
}

async function save(tx: Tx, claims: Parameters<Tx["as"]>[0], company: string | null, name: string, domains: string[], confirm = false, expected: string | null = null): Promise<Envelope> {
  await tx.as(claims);
  const [{ r }] = await tx.q<{ r: Envelope }>(`select public.save_company($1, $2, null, $3::text[], $4, $5) as r`, [company, name, domains, confirm, expected]);
  return r;
}

const domainsOf = async (tx: Tx, company: string) => {
  await tx.asOwner();
  return (await tx.q<{ domain: string }>(`select domain::text as domain from public.company_domains where company_id = $1 order by domain`, [company])).map((r) => r.domain);
};

describe("RPC-save_company — REQ-ADM-024", () => {
  it("admin_only — a moderator and a member are refused; another org's company is not found", async () => {
    await withTx(async (tx) => {
      const { f, acme } = await setup(tx);
      for (const who of [f.a.mod, f.a.members[0]]) {
        await tx.as(who.claims);
        expect(await errorCode(() => tx.q(`select public.save_company($1, 'أكمي', null, array['acme.example'])`, [acme]))).toBe("42501");
      }
      await tx.as(f.b.admin.claims);
      expect(await errorCode(() => tx.q(`select public.save_company($1, 'أكمي', null, array['acme.example'])`, [acme]))).toBe("42501");
    });
  });

  it("dry_run_writes_nothing — two counts and the destination's NAME, never a member's, and no row", async () => {
    await withTx(async (tx) => {
      const { f, acme, other } = await setup(tx);
      const a1 = await member(tx, f.a.id, "one@acme.example");
      const a2 = await member(tx, f.a.id, "two@acme.example");
      const pinned = await member(tx, f.a.id, "pinned@acme.example");
      await tx.q(`update public.members set company_id = $1 where id = $2`, [other, pinned]); // no source named → 'admin'
      await member(tx, f.a.id, "elsewhere@other.example");

      const r = await save(tx, f.a.admin.claims, acme, "أكمي", ["ACME.example", "@acme.example", " "]);
      expect(Object.keys(r).sort()).toEqual(["company_name", "held", "moving", "status", "token"]);
      expect(r).toMatchObject({ status: "preview", moving: 2, held: 1, company_name: "أكمي" });
      expect(await domainsOf(tx, acme)).toEqual([]);
      for (const id of [a1, a2]) expect(await placement(tx, id)).toEqual({ company_id: null, company_assigned_by: null });
    });
  });

  it("moves_exactly_the_preview — with source 'domain'; the admin-placed stay", async () => {
    await withTx(async (tx) => {
      const { f, acme, other } = await setup(tx);
      const a1 = await member(tx, f.a.id, "one@acme.example");
      const a2 = await member(tx, f.a.id, "two@acme.example");
      const pinned = await member(tx, f.a.id, "pinned@acme.example");
      await tx.q(`update public.members set company_id = $1 where id = $2`, [other, pinned]);

      const preview = await save(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"]);
      const done = await save(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"], true, preview.token!);
      expect(done).toMatchObject({ status: "saved", moved: 2, held: 1, company_id: acme });
      for (const id of [a1, a2]) expect(await placement(tx, id)).toEqual({ company_id: acme, company_assigned_by: "domain" });
      expect(await placement(tx, pinned)).toEqual({ company_id: other, company_assigned_by: "admin" });
      expect(await domainsOf(tx, acme)).toEqual(["acme.example"]);
    });
  });

  it("★ token — a member who arrives between the dry run and the confirm: «changed», nothing written, the new numbers", async () => {
    await withTx(async (tx) => {
      const { f, acme } = await setup(tx);
      await member(tx, f.a.id, "one@acme.example");
      const preview = await save(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"]);
      expect(preview).toMatchObject({ moving: 1, held: 0 });

      const late = await member(tx, f.a.id, "late@acme.example");
      const again = await save(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"], true, preview.token!);
      expect(again).toMatchObject({ status: "changed", moving: 2, held: 0, company_name: "أكمي" });
      expect(again.token).not.toBe(preview.token);
      expect(await domainsOf(tx, acme)).toEqual([]);
      expect(await placement(tx, late)).toEqual({ company_id: null, company_assigned_by: null });

      // Confirmed with the numbers now shown, it moves both.
      expect(await save(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"], true, again.token!)).toMatchObject({ status: "saved", moved: 2 });
      expect(await placement(tx, late)).toEqual({ company_id: acme, company_assigned_by: "domain" });
    });
  });

  it("a save that moves nobody saves without a token", async () => {
    await withTx(async (tx) => {
      const { f, acme } = await setup(tx);
      expect(await save(tx, f.a.admin.claims, acme, "أكمي الجديدة", ["nobody.example"], true, null)).toMatchObject({ status: "saved", moved: 0 });
      expect(await domainsOf(tx, acme)).toEqual(["nobody.example"]);
      await tx.asOwner();
      expect((await tx.q<{ name: string }>(`select name from public.companies where id = $1`, [acme]))[0].name).toBe("أكمي الجديدة");
    });
  });

  it("removal_unplaces_nobody — and a domain moved to another company re-derives its members there", async () => {
    await withTx(async (tx) => {
      const { f, acme, other } = await setup(tx);
      const a1 = await member(tx, f.a.id, "one@acme.example");
      // A confirm with no token when someone would move is refused: it asks.
      const asked = await save(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"], true, null);
      expect(asked).toMatchObject({ status: "changed", moving: 1 });
      expect(await save(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"], true, asked.token!)).toMatchObject({ status: "saved" });
      const p = await save(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"], false);
      expect(p).toMatchObject({ moving: 0 });

      // Removed: nobody leaves.
      expect(await save(tx, f.a.admin.claims, acme, "أكمي", [], true, null)).toMatchObject({ status: "saved", moved: 0 });
      expect(await placement(tx, a1)).toEqual({ company_id: acme, company_assigned_by: "domain" });

      // On another company now: the member placed by domain elsewhere is counted and moved (ruling 7).
      const moveIt = await save(tx, f.a.admin.claims, other, "شركة أخرى", ["acme.example"]);
      expect(moveIt).toMatchObject({ status: "preview", moving: 1, held: 0, company_name: "شركة أخرى" });
      await save(tx, f.a.admin.claims, other, "شركة أخرى", ["acme.example"], true, moveIt.token!);
      expect(await placement(tx, a1)).toEqual({ company_id: other, company_assigned_by: "domain" });
    });
  });

  it("refusals_name_the_domain — malformed and taken, each with its reason; nothing is written", async () => {
    await withTx(async (tx) => {
      const { f, acme, other } = await setup(tx);
      await save(tx, f.a.admin.claims, other, "شركة أخرى", ["taken.example"], true, null);
      const r = await save(tx, f.a.admin.claims, acme, "أكمي", ["not a domain", "taken.example", "fine.example"], true, null);
      expect(r.status).toBe("invalid");
      expect(r.errors).toEqual(
        expect.arrayContaining([
          { domain: "not a domain", reason: "malformed" },
          { domain: "taken.example", reason: "taken", company: "شركة أخرى" },
        ]),
      );
      expect(await domainsOf(tx, acme)).toEqual([]);

      const many = await save(tx, f.a.admin.claims, acme, "أكمي", Array.from({ length: 21 }, (_, i) => `d${i}.example`));
      expect(many).toMatchObject({ status: "invalid", errors: [{ domain: null, reason: "too_many" }] });
    });
  });

  it("the same domain on another org's company is accepted (ruling 3)", async () => {
    await withTx(async (tx) => {
      const { f, acme } = await setup(tx);
      const theirs = `co.${f.b.domain}`; // the fixture's domain on org B's company
      expect(await save(tx, f.a.admin.claims, acme, "أكمي", [theirs], true, null)).toMatchObject({ status: "saved" });
    });
  });

  it("deactivated_places_nobody — the domains are kept, nobody moves (DEC-255 §4)", async () => {
    await withTx(async (tx) => {
      const { f, acme } = await setup(tx);
      const a1 = await member(tx, f.a.id, "one@acme.example");
      await tx.q(`update public.companies set deactivated_at = now() where id = $1`, [acme]);
      expect(await save(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"])).toMatchObject({ status: "preview", moving: 0, held: 0 });
      expect(await save(tx, f.a.admin.claims, acme, "أكمي", ["acme.example"], true, null)).toMatchObject({ status: "saved", moved: 0 });
      expect(await domainsOf(tx, acme)).toEqual(["acme.example"]);
      expect(await placement(tx, a1)).toEqual({ company_id: null, company_assigned_by: null });
    });
  });

  it("a new company with domains is one call: the company, its domains and its members", async () => {
    await withTx(async (tx) => {
      const { f } = await setup(tx);
      const a1 = await member(tx, f.a.id, "one@fresh.example");
      const p = await save(tx, f.a.admin.claims, null, "شركة جديدة", ["fresh.example"]);
      expect(p).toMatchObject({ status: "preview", moving: 1, company_name: "شركة جديدة" });
      const done = await save(tx, f.a.admin.claims, null, "شركة جديدة", ["fresh.example"], true, p.token!);
      expect(done.status).toBe("saved");
      expect(await placement(tx, a1)).toEqual({ company_id: done.company_id, company_assigned_by: "domain" });
      expect(await domainsOf(tx, done.company_id!)).toEqual(["fresh.example"]);
    });
  });

  it("audit — one row per mutation, each the admin's, none twice (REQ-ADM-023)", async () => {
    await withTx(async (tx) => {
      const { f, acme } = await setup(tx);
      const a1 = await member(tx, f.a.id, "one@acme.example");
      const p = await save(tx, f.a.admin.claims, acme, "أكمي", ["acme.example", "keep.example"]);
      await save(tx, f.a.admin.claims, acme, "أكمي", ["acme.example", "keep.example"], true, p.token!);
      await save(tx, f.a.admin.claims, acme, "أكمي", ["keep.example"], true, null);

      await tx.asOwner();
      const rows = await tx.q<{ action: string; subject_id: string; actor_id: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }>(
        `select action, subject_id, actor_id, before, after from public.audit_log
          where org_id = $1 and action in ('company.domain_added', 'company.domain_removed', 'member.company_changed')
          order by occurred_at, action`,
        [f.a.id],
      );
      expect(rows.every((r) => r.actor_id === f.a.admin.memberId)).toBe(true);
      expect(rows.filter((r) => r.action === "company.domain_added").map((r) => r.after!.domain).sort()).toEqual(["acme.example", "keep.example"]);
      expect(rows.filter((r) => r.action === "company.domain_removed").map((r) => r.before!.domain)).toEqual(["acme.example"]);
      const moved = rows.filter((r) => r.action === "member.company_changed");
      expect(moved).toHaveLength(1);
      expect(moved[0]).toMatchObject({
        subject_id: a1,
        before: { company_id: null, company_assigned_by: null },
        after: { company_id: acme, company_assigned_by: "domain", domain: "acme.example" },
      });
    });
  });
});
