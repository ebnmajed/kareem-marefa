// Wave 18 — an org's announcements (DEC-205, DEC-206 §3, REQ-UIX-056). 0164.
//
// One case per policy, as the role it names. What is proven: a member reads the
// published, unexpired announcements of their own org and no other row; an admin
// reads every row of their org and is the only writer; the author recorded is
// the caller; a row can never be moved to another org or re-attributed; a
// moderator and a member are refused every write; anon and service_role hold
// nothing; and ★ every policy has its grant — a policy without one fails 42501
// on the first statement, which is what migration 0002 exists to remember.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const insert = `insert into public.feed_announcements (org_id, author_id, body) values ($1, $2, $3) returning id`;

describe("POL-feed_announcements.read", () => {
  it("a member reads their own org's published announcement, and only that", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      const rows = await tx.q<{ org_id: string }>(`select org_id from public.feed_announcements`);
      expect(rows).toEqual([{ org_id: f.a.id }]); // the fixture's row; org B's is behind the wall
    });
  });

  it("★ a scheduled or an expired announcement is not a member's or a moderator's to read — and is the admin's", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`insert into public.feed_announcements (org_id, author_id, body, published_at) values ($1, $2, 'later', now() + interval '1 day')`, [f.a.id, f.a.admin.memberId]);
      await tx.q(`insert into public.feed_announcements (org_id, author_id, body, published_at, expires_at) values ($1, $2, 'gone', now() - interval '2 days', now() - interval '1 day')`, [f.a.id, f.a.admin.memberId]);
      for (const who of [f.a.members[0], f.a.mod]) {
        await tx.as(who.claims);
        expect(await tx.q(`select body from public.feed_announcements where body in ('later', 'gone')`)).toEqual([]);
      }
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select body from public.feed_announcements where body in ('later', 'gone') order by body`)).toEqual([{ body: "gone" }, { body: "later" }]);
    });
  });

  it("an admin of another org reads nothing of this one", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select 1 from public.feed_announcements where org_id = $1`, [f.a.id])).toEqual([]);
    });
  });
});

describe("POL-feed_announcements.write", () => {
  it("★ an admin inserts, updates and deletes — every policy has its grant", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(insert, [f.a.id, f.a.admin.memberId, "موسم الشتاء يبدأ 12 أكتوبر"]);
      expect(await tx.q(`update public.feed_announcements set body = 'معدَّل', expires_at = now() + interval '7 days' where id = $1 returning body`, [id])).toEqual([{ body: "معدَّل" }]);
      expect(await tx.q(`delete from public.feed_announcements where id = $1 returning 1 as ok`, [id])).toEqual([{ ok: 1 }]);
    });
  });

  it("the author recorded is the caller", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(insert, [f.a.id, f.a.mod.memberId, "x"]))).toBe("42501");
    });
  });

  it("an admin cannot write into another org", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(insert, [f.b.id, f.a.admin.memberId, "x"]))).toBe("42501");
    });
  });

  it("★ a row is never moved to another org or re-attributed — the update grant names three columns", async () => {
    for (const set of [`org_id = '00000000-0000-0000-0000-000000000000'`, `author_id = author_id`, `created_at = now()`]) {
      await withTx(async (tx) => {
        const f = await seed(tx);
        await tx.as(f.a.admin.claims);
        expect(await errorCode(() => tx.q(`update public.feed_announcements set ${set} where org_id = $1`, [f.a.id]))).toBe("42501");
      });
    }
  });

  it("a moderator and a member are refused an insert, and their update and delete touch nothing", async () => {
    for (const role of ["mod", "member"] as const) {
      await withTx(async (tx) => {
        const f = await seed(tx);
        const who = role === "mod" ? f.a.mod : f.a.members[0];
        await tx.as(who.claims);
        expect(await errorCode(() => tx.q(insert, [f.a.id, who.memberId, "x"]))).toBe("42501");
        expect(await tx.q(`update public.feed_announcements set body = 'x' where org_id = $1 returning 1`, [f.a.id])).toEqual([]);
        expect(await tx.q(`delete from public.feed_announcements where org_id = $1 returning 1`, [f.a.id])).toEqual([]);
        await tx.asOwner();
        expect(await tx.q(`select count(*)::int as n from public.feed_announcements where org_id = $1 and body <> 'x'`, [f.a.id])).toEqual([{ n: 1 }]);
      });
    }
  });

  it("an empty body, an over-long one and an expiry before publication are refused", async () => {
    for (const [body, extra] of [["   ", ""], ["x".repeat(501), ""], ["ok", ", expires_at = now() - interval '1 day'"]] as const) {
      await withTx(async (tx) => {
        const f = await seed(tx);
        await tx.as(f.a.admin.claims);
        const sql = extra
          ? `insert into public.feed_announcements (org_id, author_id, body, expires_at) values ($1, $2, $3, now() - interval '1 day')`
          : `insert into public.feed_announcements (org_id, author_id, body) values ($1, $2, $3)`;
        expect(await errorCode(() => tx.q(sql, [f.a.id, f.a.admin.memberId, body]))).toBe("23514");
      });
    }
  });
});

describe("the table itself", () => {
  it("carries org_id not null, has RLS on, and grants nothing to anon or service_role", async () => {
    await withTx(async (tx) => {
      await tx.asOwner();
      expect(await tx.q(`select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'feed_announcements' and column_name = 'org_id'`)).toEqual([{ is_nullable: "NO" }]);
      expect(await tx.q(`select relrowsecurity from pg_class where oid = 'public.feed_announcements'::regclass`)).toEqual([{ relrowsecurity: true }]);
      expect(await tx.q(`select privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'feed_announcements' and grantee in ('service_role', 'anon')`)).toEqual([]);
      const policies = await tx.q<{ cmd: string }>(`select cmd from pg_policies where schemaname = 'public' and tablename = 'feed_announcements' order by cmd`);
      expect(policies.map((p) => p.cmd)).toEqual(["DELETE", "INSERT", "SELECT", "SELECT", "UPDATE"]);
    });
  });
});
