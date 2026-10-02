// Wave 15 — a company's team colour (REQ-UIX-043, DEC-183 §3 and §4.11,
// DEC-186 §8). 0160.
//
// One nullable column, written through the policies `companies` has had since
// 0004. What is proven: who may write it and who may not, that the database
// refuses anything that is not `#rrggbb` for every writer, and that the
// migration wrote no colour onto any company.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

type F = Awaited<ReturnType<typeof seed>>;

const company = (tx: Tx, orgId: string) =>
  tx.q<{ id: string; team_color: string | null }>(`select id, team_color from public.companies where org_id = $1 order by name limit 1`, [orgId]).then((r) => r[0]);

async function companyOf(tx: Tx, f: F) {
  await tx.asOwner();
  return company(tx, f.a.id);
}

describe("POL-companies.team_color", () => {
  it("★ the migration wrote no colour: every company starts with none", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const rows = await tx.q<{ n: number }>(`select count(*)::int as n from public.companies where org_id in ($1, $2) and team_color is not null`, [f.a.id, f.b.id]);
      expect(rows[0].n).toBe(0);
    });
  });

  it("an admin sets it, a member of the same org reads it, and another org sees no row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await companyOf(tx, f);

      await tx.as(f.a.admin.claims);
      const written = await tx.q<{ team_color: string }>(`update public.companies set team_color = '#ff9a2e' where id = $1 returning team_color`, [c.id]);
      expect(written).toEqual([{ team_color: "#ff9a2e" }]);

      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select team_color from public.companies where id = $1`, [c.id])).toEqual([{ team_color: "#ff9a2e" }]);

      await tx.as(f.b.members[0].claims);
      expect(await tx.q(`select team_color from public.companies where id = $1`, [c.id])).toEqual([]);
      await tx.as(f.b.admin.claims);
      expect(await tx.q(`update public.companies set team_color = '#35d0ff' where id = $1 returning id`, [c.id])).toEqual([]);
    });
  });

  it("an admin clears it back to none", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await companyOf(tx, f);
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.companies set team_color = '#9b7cff' where id = $1`, [c.id]);
      expect(await tx.q(`update public.companies set team_color = null where id = $1 returning team_color`, [c.id])).toEqual([{ team_color: null }]);
    });
  });

  it("a member cannot write it, and neither can a moderator", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await companyOf(tx, f);
      for (const who of [f.a.members[0], f.a.mod]) {
        await tx.as(who.claims);
        expect(await tx.q(`update public.companies set team_color = '#ff9a2e' where id = $1 returning id`, [c.id])).toEqual([]);
      }
      await tx.asOwner();
      expect((await company(tx, f.a.id)).team_color).toBeNull();
    });
  });

  it.each([
    ["a colour's name", "red"],
    ["three digits", "#fff"],
    ["eight digits", "#ff9a2eff"],
    ["no hash", "ff9a2e"],
    ["upper case — the stored form is one form", "#FF9A2E"],
    ["a declaration smuggled after it", "#ff9a2e;color:red"],
    ["a trailing space", "#ff9a2e "],
    ["the empty string — none is null", ""],
  ])("★ the database refuses %s, for an admin and for the owner alike", async (_, value) => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await companyOf(tx, f);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`update public.companies set team_color = $2 where id = $1`, [c.id, value]))).toBe("23514");
    });
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await companyOf(tx, f);
      await tx.asOwner();
      expect(await errorCode(() => tx.q(`update public.companies set team_color = $2 where id = $1`, [c.id, value]))).toBe("23514");
    });
  });

  it("creating a company without a colour still works — main's app sends none", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const made = await tx.q<{ team_color: string | null }>(`insert into public.companies (org_id, name) values ($1, 'شركة بلا لون') returning team_color`, [f.a.id]);
      expect(made).toEqual([{ team_color: null }]);
    });
  });
});

// ★ The owner's own statement (`STATUS.md`, the owner's order; DEC-193). The colours may be set
// on SCR-048 or by one scoped statement run with NO session — `supabase db query --linked`. The
// audit is a trigger, so that path is audited too, and this is the case that says how: a null
// actor and the role `system` (`write_audit()`, 0005). Found missing at the wave-15 rehearsal.
describe("POL-companies.team_color_audit — a write with no session", () => {
  it("★ is recorded with a null actor and the role `system`", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [who] = await tx.q<{ claims: string | null }>(`select nullif(current_setting('request.jwt.claims', true), '') as claims`);
      expect(who.claims).toBeNull();
      await tx.q(`update public.companies set team_color = '#c6ff3d' where id = $1`, [f.a.companyId]);
      const rows = await tx.q(
        `select actor_id, actor_role, subject_type, subject_id, before, after from public.audit_log
          where org_id = $1 and action = 'company.team_color_changed'`,
        [f.a.id],
      );
      expect(rows).toEqual([
        { actor_id: null, actor_role: "system", subject_type: "company", subject_id: f.a.companyId, before: { teamColor: null }, after: { teamColor: "#c6ff3d" } },
      ]);
    });
  });

  // ★ wave 22 (0181, DEC-231 §4): a deactivation is audited now — `company.deactivated`, by its own trigger. What this
  // case still proves is that 0161's colour trigger stays silent: no `company.team_color_changed` row for it.
  it("main's own UPDATE — `{ deactivated_at }` — with no session writes company.deactivated and no colour row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.companies set deactivated_at = now() where id = $1`, [f.a.companyId]);
      const rows = await tx.q<{ action: string; actor_role: string }>(
        `select action, actor_role from public.audit_log where org_id = $1 and subject_id = $2 and action like 'company.%' and action <> 'company.created'`,
        [f.a.id, f.a.companyId],
      );
      expect(rows).toEqual([{ action: "company.deactivated", actor_role: "system" }]);
    });
  });

  it("the trigger's function cannot be called directly, by any client role", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      for (const become of [() => tx.asAnon(), () => tx.asServiceRole(), () => tx.as(f.a.members[0].claims), () => tx.as(f.a.admin.claims)]) {
        await become();
        // `0A000` while the function keeps the default ACL (Postgres refuses to call a trigger
        // function directly), `42501` once EXECUTE is revoked. Either is a refusal; success is not.
        expect(["0A000", "42501"]).toContain(await errorCode(() => tx.q(`select public.companies_team_color_audit()`)));
      }
    });
  });
});
