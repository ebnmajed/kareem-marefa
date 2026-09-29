// Wave 16 — what a member has seen (DEC-195 §2.6, DEC-197, REQ-UIX-047, REQ-UIX-048). 0162.
//
// A cursor, one row per member, written only by that member. What is proven:
// a member reads and writes their own row and nobody else's — not an admin, not
// a moderator, not another org; a bookmark cannot name a level or a company of
// another org; nobody deletes; service_role holds nothing; and the table has no
// timestamp column at all.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("POL-member_seen_marks", () => {
  it("a member writes and reads their own mark", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const me = f.a.members[1];
      await tx.as(me.claims);
      await tx.q(`insert into public.member_seen_marks (member_id, org_id, points_total, all_time_rank, company_id) values ($1, $2, 680, 5, $3)`, [me.memberId, f.a.id, f.a.companyId]);
      await tx.q(`update public.member_seen_marks set points_total = 730, all_time_rank = 4 where member_id = $1`, [me.memberId]);
      expect(await tx.q(`select points_total, all_time_rank from public.member_seen_marks`)).toEqual([{ points_total: 730, all_time_rank: 4 }]);
    });
  });

  it("★ nobody else reads it — another member, the admin, the moderator, another org", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const me = f.a.members[0]; // the fixture's mark (tests/rls/fixture.ts)
      for (const other of [f.a.members[1], f.a.admin, f.a.mod, f.b.admin, f.b.members[0]]) {
        await tx.as(other.claims);
        expect(await tx.q(`select 1 from public.member_seen_marks where member_id = $1`, [me.memberId])).toEqual([]);
        expect(await tx.q(`update public.member_seen_marks set points_total = 0 where member_id = $1 returning 1`, [me.memberId])).toEqual([]);
      }
    });
  });

  it("a member cannot write a mark for someone else, or into another org", async () => {
    for (const [who, org] of [["other", "a"], ["self", "b"]] as const) {
      await withTx(async (tx) => {
        const f = await seed(tx);
        const me = f.a.members[1];
        await tx.as(me.claims);
        const member = who === "other" ? f.a.members[0].memberId : me.memberId;
        const orgId = org === "a" ? f.a.id : f.b.id;
        expect(await errorCode(() => tx.q(`insert into public.member_seen_marks (member_id, org_id) values ($1, $2)`, [member, orgId]))).toBe("42501");
      });
    }
  });

  it("★ a mark cannot name another org's company or level", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const me = f.a.members[1];
      await tx.as(me.claims);
      expect(await errorCode(() => tx.q(`insert into public.member_seen_marks (member_id, org_id, company_id) values ($1, $2, $3)`, [me.memberId, f.a.id, f.b.companyId]))).toBe("42501");
    });
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [lvl] = await tx.q<{ id: string }>(`insert into public.levels (org_id, name, threshold_points, sort_order) values ($1, 'x', 987654, 99) returning id`, [f.b.id]);
      const me = f.a.members[1];
      await tx.as(me.claims);
      expect(await errorCode(() => tx.q(`insert into public.member_seen_marks (member_id, org_id, level_id) values ($1, $2, $3)`, [me.memberId, f.a.id, lvl.id]))).toBe("42501");
    });
  });

  it("nobody deletes a mark, not even its member", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const me = f.a.members[0]; // the fixture's mark
      await tx.as(me.claims);
      expect(await errorCode(() => tx.q(`delete from public.member_seen_marks where member_id = $1`, [me.memberId]))).toBe("42501");
    });
  });

  it("★ a cursor, not a log: the table has no timestamp column, and service_role holds nothing", async () => {
    await withTx(async (tx) => {
      await tx.asOwner();
      const types = await tx.q<{ data_type: string }>(`select data_type from information_schema.columns where table_schema = 'public' and table_name = 'member_seen_marks'`);
      expect(types.length).toBeGreaterThan(0);
      expect(types.filter((t) => /timestamp|time/.test(t.data_type))).toEqual([]);
      const grants = await tx.q(`select privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'member_seen_marks' and grantee in ('service_role', 'anon')`);
      expect(grants).toEqual([]);
    });
  });

  it("★ anonymisation takes the mark with the person (0162's anonymise_members)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const who = f.a.members[0]; // the fixture's mark
      await tx.asOwner();
      await tx.q(`update public.members set status = 'deactivated', deactivated_at = now() - interval '400 days', deactivated_reason = 'test' where id = $1`, [who.memberId]);
      await tx.asServiceRole();
      const [{ s: summary }] = await tx.q<{ s: Record<string, number> }>(`select public.anonymise_members() as s`);
      expect(Object.keys(summary).sort()).toEqual(["after_days", "anonymised"]);
      await tx.asOwner();
      expect(await tx.q(`select 1 from public.member_seen_marks where member_id = $1`, [who.memberId])).toEqual([]);
      // Org B's mark is untouched.
      expect(await tx.q(`select 1 from public.member_seen_marks where member_id = $1`, [f.b.members[0].memberId])).toHaveLength(1);
    });
  });
});
