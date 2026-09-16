// Per-policy cases for the tenancy tables. 03 §8.2 rows named POL-orgs.*,
// POL-org_domains.*, POL-org_settings.*, POL-companies.*, POL-categories.*,
// POL-venues.*, POL-member_interests.*, POL-scoring_config_history.*,
// POL-platform_admins.none, POL-audit_log.*.

import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("POL-orgs", () => {
  it("select.member — a member of org A reading org B's row gets nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      const rows = await tx.q<{ id: string }>(`select id from public.orgs where id = $1`, [f.b.id]);
      expect(rows).toEqual([]);
    });
  });

  it("update.admin — a member cannot update the org; an admin can; neither can delete it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      const asMember = await tx.q<{ id: string }>(`update public.orgs set name = 'x' where id = $1 returning id`, [f.a.id]);
      expect(asMember).toEqual([]);
      await tx.as(f.a.admin.claims);
      const asAdmin = await tx.q<{ name: string }>(`update public.orgs set name = 'كريم معرفة 2' where id = $1 returning name`, [f.a.id]);
      expect(asAdmin[0].name).toBe("كريم معرفة 2");
      expect(await errorCode(() => tx.q(`delete from public.orgs where id = $1`, [f.a.id]))).toBe(PERMISSION_DENIED);
      // The slug is outside the update grant even for an admin.
      expect(await errorCode(() => tx.q(`update public.orgs set slug = 'other' where id = $1`, [f.a.id]))).toBe(PERMISSION_DENIED);
    });
  });

  it("first_admin_email is outside the select grant", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select first_admin_email from public.orgs`))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-org_domains", () => {
  it("select.member — a non-admin member reading the domain list gets nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select domain from public.org_domains`)).toEqual([]);
      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select domain from public.org_domains`)).toEqual([]);
      await tx.as(f.a.admin.claims);
      const rows = await tx.q<{ domain: string }>(`select domain from public.org_domains`);
      expect(rows.map((r) => r.domain)).toEqual(["kareem.example"]);
    });
  });

  it("admin writes normalise the domain and are audited; a member's insert is rejected", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [row] = await tx.q<{ domain: string }>(
        `insert into public.org_domains (org_id, domain) values ($1, '  @Kareem-Two.Example ') returning domain`,
        [f.a.id],
      );
      expect(row.domain).toBe("kareem-two.example");
      const audit = await tx.q<{ actor_id: string; actor_role: string; after: { domain: string } }>(
        `select actor_id, actor_role, after from public.audit_log
          where org_id = $1 and action = 'domain.added' and after ->> 'domain' = 'kareem-two.example'`,
        [f.a.id],
      );
      expect(audit).toEqual([{ actor_id: f.a.admin.memberId, actor_role: "admin", after: { domain: "kareem-two.example" } }]);
      // with check: an admin cannot insert a domain for another org
      expect(await errorCode(() => tx.q(`insert into public.org_domains (org_id, domain) values ($1, 'x.example')`, [f.b.id]))).toBe(PERMISSION_DENIED);
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`insert into public.org_domains (org_id, domain) values ($1, 'y.example')`, [f.a.id]))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-org_domains.cascade", () => {
  it("deleting an org cascades through its domains without an audit row (0008); removing a domain directly is still audited", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`delete from public.org_domains where org_id = $1`, [f.a.id]);
      const removed = await tx.q<{ action: string }>(`select action from public.audit_log where org_id = $1 and action = 'domain.removed'`, [f.a.id]);
      expect(removed).toEqual([{ action: "domain.removed" }]);
      await tx.asOwner();
      await tx.q(`delete from public.orgs where id = $1`, [f.b.id]);
      expect(await tx.q(`select id from public.org_domains where org_id = $1`, [f.b.id])).toEqual([]);
      expect(await tx.q(`select id from public.audit_log where org_id = $1`, [f.b.id])).toEqual([]);
    });
  });
});

describe("POL-org_settings", () => {
  it("update.admin — a moderator updating settings is rejected; an admin succeeds and history records each column", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.mod.claims);
      const asMod = await tx.q(`update public.org_settings set time_zone = 'Asia/Dubai' where org_id = $1 returning id`, [f.a.id]);
      expect(asMod).toEqual([]);
      await tx.as(f.a.admin.claims);
      const asAdmin = await tx.q<{ time_zone: string }>(
        `update public.org_settings set time_zone = 'Asia/Dubai' where org_id = $1 returning time_zone`,
        [f.a.id],
      );
      expect(asAdmin[0].time_zone).toBe("Asia/Dubai");
      const history = await tx.q<{ field: string; old_value: unknown; new_value: unknown; actor_id: string }>(
        `select field, old_value, new_value, actor_id from public.scoring_config_history
          where org_id = $1 and scope = 'org_settings' and entity_id = $2 order by field`,
        [f.a.id, f.a.settingsId],
      );
      expect(history.map((h) => [h.field, h.old_value, h.new_value])).toEqual([
        ["time_zone", "Asia/Riyadh", "Asia/Dubai"],
      ]);
      expect(history.every((h) => h.actor_id === f.a.admin.memberId)).toBe(true);
      // No insert or delete path, even for an admin.
      expect(await errorCode(() => tx.q(`delete from public.org_settings where org_id = $1`, [f.a.id]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`update public.org_settings set org_id = $2 where org_id = $1`, [f.a.id, f.b.id]))).toBe(PERMISSION_DENIED);
    });
  });
});

for (const table of ["companies", "categories", "venues"] as const) {
  describe(`POL-${table}`, () => {
    it("select.member — a member sees all of A's rows and none of B's", async () => {
      await withTx(async (tx) => {
        const f = await seed(tx);
        await tx.as(f.a.members[0].claims);
        const rows = await tx.q<{ org_id: string }>(`select org_id from public.${table}`);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.org_id === f.a.id)).toBe(true);
      });
    });

    it("insert.admin — a member's insert is rejected; an admin's succeeds; an admin cannot insert into org B", async () => {
      await withTx(async (tx) => {
        const f = await seed(tx);
        await tx.as(f.a.members[0].claims);
        expect(await errorCode(() => tx.q(`insert into public.${table} (org_id, name) values ($1, 'جديد')`, [f.a.id]))).toBe(PERMISSION_DENIED);
        await tx.as(f.a.admin.claims);
        const [row] = await tx.q<{ org_id: string }>(`insert into public.${table} (org_id, name) values ($1, 'جديد') returning org_id`, [f.a.id]);
        expect(row.org_id).toBe(f.a.id);
        expect(await errorCode(() => tx.q(`insert into public.${table} (org_id, name) values ($1, 'تسلل')`, [f.b.id]))).toBe(PERMISSION_DENIED);
      });
    });

    it("update.admin — an admin deactivates a row; no role can delete one", async () => {
      await withTx(async (tx) => {
        const f = await seed(tx);
        await tx.as(f.a.admin.claims);
        const rows = await tx.q<{ deactivated_at: string }>(`update public.${table} set deactivated_at = now() where org_id = $1 returning deactivated_at`, [f.a.id]);
        expect(rows.length).toBeGreaterThan(0);
        expect(await errorCode(() => tx.q(`delete from public.${table} where org_id = $1`, [f.a.id]))).toBe(PERMISSION_DENIED);
        // an admin cannot move a row to another org
        expect(await errorCode(() => tx.q(`update public.${table} set org_id = $2 where org_id = $1`, [f.a.id, f.b.id]))).toBe(PERMISSION_DENIED);
      });
    });
  });
}

describe("POL-member_interests", () => {
  it("write.self — a member writes only their own interests", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const me = f.a.members[1];
      await tx.as(me.claims);
      const [row] = await tx.q<{ member_id: string }>(
        `insert into public.member_interests (org_id, member_id, category_id) values ($1, $2, $3) returning member_id`,
        [f.a.id, me.memberId, f.a.categoryId],
      );
      expect(row.member_id).toBe(me.memberId);
      expect(
        await errorCode(() => tx.q(`insert into public.member_interests (org_id, member_id, category_id) values ($1, $2, $3)`, [f.a.id, f.a.members[0].memberId, f.a.categoryId])),
      ).toBe(PERMISSION_DENIED);
      const deleted = await tx.q(`delete from public.member_interests where member_id = $1 returning member_id`, [f.a.members[0].memberId]);
      expect(deleted).toEqual([]);
    });
  });
});

describe("POL-scoring_config_history", () => {
  it("select.admin — an admin reads the org's history; a moderator and a member get nothing; nobody writes directly", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const asAdmin = await tx.q<{ org_id: string }>(`select org_id from public.scoring_config_history`);
      expect(asAdmin.length).toBeGreaterThan(0);
      expect(asAdmin.every((r) => r.org_id === f.a.id)).toBe(true);
      expect(await errorCode(() => tx.q(`insert into public.scoring_config_history (org_id, scope, field) values ($1, 'scoring', 'x')`, [f.a.id]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`delete from public.scoring_config_history where org_id = $1`, [f.a.id]))).toBe(PERMISSION_DENIED);
      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select org_id from public.scoring_config_history`)).toEqual([]);
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select org_id from public.scoring_config_history`)).toEqual([]);
      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(`update public.scoring_config_history set field = 'y' where org_id = $1`, [f.a.id]))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-platform_admins.none", () => {
  it("every client role selecting from platform_admins fails on the grant", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      for (const c of [f.a.admin.claims, f.a.members[0].claims]) {
        await tx.as(c);
        expect(await errorCode(() => tx.q(`select * from public.platform_admins`))).toBe(PERMISSION_DENIED);
      }
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.platform_admins`))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-audit_log", () => {
  it("read.admin / read.moderator_own — the admin reads the org's log; a moderator only their own actions; a member nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const asAdmin = await tx.q<{ org_id: string; actor_id: string; action: string }>(`select org_id, actor_id, action from public.audit_log`);
      // two seeded rows plus the fixture's own domain.added trigger row
      expect(asAdmin.filter((r) => r.action === "fixture.seeded").length).toBe(2);
      expect(asAdmin.every((r) => r.org_id === f.a.id)).toBe(true);
      await tx.as(f.a.mod.claims);
      const asMod = await tx.q<{ actor_id: string }>(`select actor_id from public.audit_log`);
      expect(asMod.map((r) => r.actor_id)).toEqual([f.a.mod.memberId]);
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select actor_id from public.audit_log`)).toEqual([]);
    });
  });

  it("is append-only for every role, service_role included", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`insert into public.audit_log (org_id, action) values ($1, 'x.y')`, [f.a.id]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`update public.audit_log set action = 'x.y' where org_id = $1`, [f.a.id]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`delete from public.audit_log where org_id = $1`, [f.a.id]))).toBe(PERMISSION_DENIED);
      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(`update public.audit_log set action = 'x.y' where org_id = $1`, [f.a.id]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`delete from public.audit_log where org_id = $1`, [f.a.id]))).toBe(PERMISSION_DENIED);
    });
  });
});
