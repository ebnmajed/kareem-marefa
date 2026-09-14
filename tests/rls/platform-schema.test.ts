// platform — the M8 schema (supabase/proposed/platform/0001_m8_schema.sql).
// Applied with applyProposed() inside this test's transaction, which is rolled
// back, so the shared database never sees it (DEC-040). The existsSync guard
// means a promotion mid-session turns nothing red: once the lead moves the file
// into supabase/migrations/ the objects are already there and the file is gone.
//
// The case that matters most is the last one in §1: as a platform admin, every
// table with an org_id returns ZERO ROWS or 42501. If that ever passes rows,
// DEC-014 has been undone and D3 with it.
//
// REQ-ADM-001 · REQ-ADM-002 · REQ-ADM-003 · REQ-ADM-019 · REQ-TEN-002 ·
// REQ-TEN-007 · REQ-DSG-008 · REQ-NFR-012 · REQ-NFR-014 · REQ-PRF-006 ·
// 02 §4.1 · 03 §1.4 · 03 §5.1 · 11 §2.7 · 12 §5.3 · DEC-052

import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, PERMISSION_DENIED, pool, withTx, type Claims, type Tx } from "./db";
import { seed, seedBase } from "./fixture";

const FILE = "platform/0001_m8_schema.sql";

async function apply(tx: Tx) {
  if (existsSync(join(process.cwd(), "supabase", "proposed", FILE))) await applyProposed(tx, FILE);
}

/** A super admin's token: platform_admin and nothing else. No org_id, ever. */
function platformClaims(authUserId: string, email: string): Claims {
  return { sub: authUserId, email, platform_admin: true };
}

beforeAll(async () => {
  await pool.query("select 1");
});

describe("platform — impersonation_sessions (02 §4.1, REQ-ADM-019)", () => {
  it("POL-impersonation_sessions.select — the org's own staff see it; another org's staff see nothing", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.asOwner();
      await tx.q(
        `insert into public.impersonation_sessions (org_id, platform_admin_id, reason, expires_at)
         values ($1, $2, 'تحقيق من بلاغ', now() + interval '1 hour')`,
        [f.a.id, f.platformAdmin.authUserId],
      );

      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select id from public.impersonation_sessions`)).toHaveLength(1);

      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select id from public.impersonation_sessions`)).toHaveLength(1);

      // A plain member is not staff: the record is an admin control, not a feed.
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.impersonation_sessions`)).toHaveLength(0);

      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select id from public.impersonation_sessions`)).toHaveLength(0);
    });
  });

  it("POL-impersonation_sessions.append_only — no role inserts, updates or deletes", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.asOwner();
      const [s] = await tx.q<{ id: string }>(
        `insert into public.impersonation_sessions (org_id, platform_admin_id, reason, expires_at)
         values ($1, $2, 'سبب', now() + interval '1 hour') returning id`,
        [f.a.id, f.platformAdmin.authUserId],
      );

      for (const who of ["admin", "platform", "service"] as const) {
        if (who === "admin") await tx.as(f.a.admin.claims);
        else if (who === "platform") await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
        else await tx.asServiceRole();

        expect(
          await errorCode(() =>
            tx.q(
              `insert into public.impersonation_sessions (org_id, platform_admin_id, reason, expires_at)
               values ($1, $2, 'تسلل', now() + interval '1 hour')`,
              [f.a.id, f.platformAdmin.authUserId],
            ),
          ),
          `insert as ${who}`,
        ).toBe(PERMISSION_DENIED);
        expect(
          await errorCode(() => tx.q(`update public.impersonation_sessions set ended_at = now() where id = $1`, [s.id])),
          `update as ${who}`,
        ).toBe(PERMISSION_DENIED);
        expect(
          await errorCode(() => tx.q(`delete from public.impersonation_sessions where id = $1`, [s.id])),
          `delete as ${who}`,
        ).toBe(PERMISSION_DENIED);
      }
    });
  });

  it("POL-impersonation_sessions.expiry — over four hours is refused by the table, and start_impersonation clamps", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.asOwner();
      // 23514: the constraint, not a convention — past every RPC.
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.impersonation_sessions (org_id, platform_admin_id, reason, expires_at)
             values ($1, $2, 'طويل', now() + interval '5 hours')`,
            [f.a.id, f.platformAdmin.authUserId],
          ),
        ),
      ).toBe("23514");

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const [s] = await tx.q<{ expires_at: string; started_at: string }>(
        `select * from public.start_impersonation($1, 'تحقيق', 10000)`,
        [f.a.id],
      );
      const minutes = (Date.parse(s.expires_at) - Date.parse(s.started_at)) / 60000;
      expect(Math.round(minutes)).toBe(240);
    });
  });

  it("RPC-start_impersonation.platform_only — a member and an org admin are refused; the audit row lands in the ORG's log", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);

      await tx.as(f.a.members[0].claims);
      expect(await errorMessage(() => tx.q(`select public.start_impersonation($1, 'سبب', 60)`, [f.a.id]))).toMatch(/not_platform_admin/);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.start_impersonation($1, 'سبب', 60)`, [f.a.id]))).toMatch(/not_platform_admin/);

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const [s] = await tx.q<{ id: string; org_id: string }>(`select * from public.start_impersonation($1, 'تحقيق من بلاغ', 60)`, [f.a.id]);
      expect(s.org_id).toBe(f.a.id);

      // REQ-ADM-019: the org's OWN admin reads it in their OWN audit log.
      await tx.as(f.a.admin.claims);
      const rows = await tx.q<{ action: string; actor_role: string; reason: string; subject_id: string }>(
        `select action, actor_role, reason, subject_id from public.audit_log where org_id = $1 and action = 'impersonation.started'`,
        [f.a.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_role).toBe("platform_admin");
      expect(rows[0].reason).toBe("تحقيق من بلاغ");
      expect(rows[0].subject_id).toBe(s.id);

      // Org B learns nothing.
      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select id from public.audit_log where action = 'impersonation.started'`)).toHaveLength(0);
    });
  });

  it("RPC-start_impersonation.one_at_a_time — a second live session is refused", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      await tx.q(`select public.start_impersonation($1, 'الأول', 60)`, [f.a.id]);
      expect(await errorMessage(() => tx.q(`select public.start_impersonation($1, 'الثاني', 60)`, [f.b.id]))).toMatch(
        /impersonation_already_active/,
      );
    });
  });

  it("RPC-start_impersonation.enqueues — 11 §2.7's key, scheduled at expiry", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const [s] = await tx.q<{ id: string; expires_at: string }>(`select * from public.start_impersonation($1, 'سبب', 30)`, [f.a.id]);
      await tx.asOwner();
      const jobs = await tx.q<{ key: string; identifier: string; run_at: string }>(
        `select j.key, t.identifier, j.run_at
           from graphile_worker._private_jobs j
           join graphile_worker._private_tasks t on t.id = j.task_id
          where j.key = $1`,
        [`impexp:${s.id}`],
      );
      expect(jobs).toHaveLength(1);
      expect(jobs[0].identifier).toBe("expire_impersonation");
      expect(Date.parse(jobs[0].run_at)).toBe(Date.parse(s.expires_at));
    });
  });

  it("RPC-end_impersonation.actor — the starting super admin ends it; the org's admin cannot; ending twice is a no-op", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const [s] = await tx.q<{ id: string }>(`select * from public.start_impersonation($1, 'سبب', 60)`, [f.a.id]);

      // The org sees it and cannot stop it: the record is evidence, not a control.
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.end_impersonation($1)`, [s.id]))).toMatch(/not_platform_admin/);

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const [ended] = await tx.q<{ ended_at: string | null }>(`select * from public.end_impersonation($1)`, [s.id]);
      expect(ended.ended_at).not.toBeNull();
      const [again] = await tx.q<{ ended_at: string | null }>(`select * from public.end_impersonation($1)`, [s.id]);
      expect(again.ended_at).toBeNull(); // no row to end: null composite, not an error

      await tx.as(f.a.admin.claims);
      expect(
        await tx.q(`select id from public.audit_log where org_id = $1 and action = 'impersonation.ended'`, [f.a.id]),
      ).toHaveLength(1);
    });
  });

  it("JOB-expire_impersonation — the sweep ends every due session and audits it; a replay finds none", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.asOwner();
      await tx.q(
        `insert into public.impersonation_sessions (org_id, platform_admin_id, reason, started_at, expires_at)
         values ($1, $2, 'قديمة', now() - interval '3 hours', now() - interval '1 hour')`,
        [f.a.id, f.platformAdmin.authUserId],
      );
      await tx.asServiceRole();
      expect((await tx.q<{ n: number }>(`select public.expire_impersonation_sessions() as n`))[0].n).toBe(1);
      expect((await tx.q<{ n: number }>(`select public.expire_impersonation_sessions() as n`))[0].n).toBe(0);

      await tx.as(f.a.admin.claims);
      const rows = await tx.q(`select id from public.audit_log where org_id = $1 and action = 'impersonation.expired'`, [f.a.id]);
      expect(rows).toHaveLength(1);
    });
  });

  it("POL-auth_hook.impersonation — the token carries the org and NO member_id, and never raises", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);

      const hook = async (userId: string) =>
        (
          await tx.q<{ out: { claims?: { app_metadata?: Record<string, unknown> } } }>(
            `select public.custom_access_token_hook($1::jsonb) as out`,
            [JSON.stringify({ user_id: userId, claims: { app_metadata: {} } })],
          )
        )[0].out.claims?.app_metadata ?? {};

      await tx.asOwner();
      // Before: platform_admin alone, no org anywhere on the token.
      const before = await hook(f.platformAdmin.authUserId);
      expect(before.platform_admin).toBe(true);
      expect(before.org_id).toBeUndefined();

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const [s] = await tx.q<{ id: string }>(`select * from public.start_impersonation($1, 'سبب', 60)`, [f.a.id]);

      await tx.asOwner();
      const during = await hook(f.platformAdmin.authUserId);
      expect(during.org_id).toBe(f.a.id);
      expect(during.org_role).toBe("member");
      expect(during.status).toBe("active");
      expect(during.impersonation).toBe(s.id);
      // The property the whole design rests on: no member_id, so every
      // privileged RPC (03 §1.3 re-reads the member row) refuses this token.
      expect(during.member_id).toBeUndefined();
      expect(during.claims_version).toBeUndefined();

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      await tx.q(`select public.end_impersonation($1)`, [s.id]);
      await tx.asOwner();
      const after = await hook(f.platformAdmin.authUserId);
      expect(after.org_id).toBeUndefined();
      expect(after.platform_admin).toBe(true);

      // 0006's rule 2 still holds for a user who is neither.
      const stranger = await hook(f.stranger.authUserId);
      expect(stranger).toEqual({});
    });
  });

  it("an impersonating token reads like a member and writes nothing privileged", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      await tx.q(`select public.start_impersonation($1, 'تحقيق', 60)`, [f.a.id]);

      // What the hook would mint: org_id, org_role member, no member_id.
      await tx.as({ sub: f.platformAdmin.authUserId, email: f.platformAdmin.email, platform_admin: true, org_id: f.a.id, org_role: "member", status: "active", org_status: "active" });
      const sessions = await tx.q(`select id from public.sessions`);
      expect(sessions.length).toBeGreaterThan(0); // break-glass READS
      expect(await tx.q(`select id from public.sessions where org_id = $1`, [f.b.id])).toHaveLength(0);
      // …and writes nothing privileged: there is no member row behind the token.
      expect(await errorMessage(() => tx.q(`select public.assert_fresh_admin()`))).toMatch(/not_a_member/);
    });
  });
});

describe("platform — no data plane (REQ-ADM-002, DEC-014) ★", () => {
  it("POL-super_admin.no_data_plane — every org table returns zero rows or 42501 for a platform admin", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);

      await tx.asOwner();
      const tables = await tx.q<{ table_name: string }>(
        `select c.table_name
           from information_schema.columns c
           join information_schema.tables t
             on t.table_schema = c.table_schema and t.table_name = c.table_name
          where c.table_schema = 'public' and c.column_name = 'org_id' and t.table_type = 'BASE TABLE'
          order by c.table_name`,
      );
      expect(tables.length).toBeGreaterThan(40);

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const leaked: string[] = [];
      for (const { table_name } of tables) {
        try {
          // `org_id is not null` matters for exactly one table: platform
          // templates are readable by every org by requirement (03 §5.9a, D67)
          // and carry a null org_id. The claim under test is that no row
          // BELONGING TO AN ORG is visible.
          const rows = await tx.q(`select 1 from public.${table_name} where org_id is not null limit 1`);
          if (rows.length > 0) leaked.push(table_name);
        } catch (e) {
          // 42501 is the other acceptable answer: the grant refused it outright.
          expect((e as { code?: string }).code, table_name).toBe(PERMISSION_DENIED);
        }
      }
      expect(leaked).toEqual([]);

      // orgs itself is platform metadata, but a policy still scopes it: a super
      // admin with no org_id claim reads none of it either.
      expect(await tx.q(`select id from public.orgs`)).toHaveLength(0);
      // And platform_admins keeps its no-policy-no-grant shape (DEC-035).
      expect(await errorCode(() => tx.q(`select auth_user_id from public.platform_admins`))).toBe(PERMISSION_DENIED);
    });
  });

  it("no policy created by this file names platform_admins (invariant 8)", async () => {
    await withTx(async (tx) => {
      await seedBase(tx);
      await apply(tx);
      await tx.asOwner();
      const rows = await tx.q<{ tablename: string; policyname: string }>(
        `select tablename, policyname from pg_policies
          where schemaname = 'public'
            and (coalesce(qual, '') ilike '%platform_admins%' or coalesce(with_check, '') ilike '%platform_admins%')`,
      );
      expect(rows).toEqual([]);
    });
  });
});

describe("platform — the org write paths (REQ-TEN-002, REQ-TEN-007)", () => {
  it("RPC-set_first_admin.platform_only — only a platform admin, and an existing member is promoted", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      const target = f.a.members[0];

      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.set_first_admin($1, $2)`, [f.a.id, target.email]))).toMatch(/not_platform_admin/);

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      await tx.q(`select public.set_first_admin($1, $2)`, [f.a.id, target.email]);

      await tx.asOwner();
      const [m] = await tx.q<{ org_role: string; claims_version: number }>(
        `select org_role, claims_version from public.members where id = $1`,
        [target.memberId],
      );
      expect(m.org_role).toBe("admin");
      expect(m.claims_version).toBe(target.claims.claims_version! + 1);

      await tx.as(f.a.admin.claims);
      const audit = await tx.q<{ actor_role: string }>(
        `select actor_role from public.audit_log where org_id = $1 and action = 'org.first_admin_set'`,
        [f.a.id],
      );
      expect(audit).toHaveLength(1);
      expect(audit[0].actor_role).toBe("platform_admin");
    });
  });

  it("RPC-add_org_domain.platform_only — added and removed from outside the org, attributed platform_admin", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);

      await tx.as(f.a.members[0].claims);
      expect(await errorMessage(() => tx.q(`select public.add_org_domain($1, 'new.example')`, [f.a.id]))).toMatch(/not_platform_admin/);

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      await tx.q(`select public.add_org_domain($1, '  NEW.example ')`, [f.a.id]);

      await tx.as(f.a.admin.claims);
      const domains = await tx.q<{ domain: string }>(`select domain from public.org_domains where org_id = $1 order by domain`, [f.a.id]);
      expect(domains.map((d) => d.domain)).toContain("new.example");
      const added = await tx.q<{ actor_role: string }>(
        `select actor_role from public.audit_log where org_id = $1 and action = 'domain.added' order by occurred_at desc limit 1`,
        [f.a.id],
      );
      // 0005's trigger said 'system' for an account with no member row.
      expect(added[0].actor_role).toBe("platform_admin");

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      expect((await tx.q<{ ok: boolean }>(`select public.remove_org_domain($1, 'new.example') as ok`, [f.a.id]))[0].ok).toBe(true);

      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select id from public.org_domains where org_id = $1 and domain = 'new.example'`, [f.a.id])).toHaveLength(0);
    });
  });

  it("DEC-052 — a freshly created org reads all eight A27 baseline templates, defaults set, before publishing anything", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const [{ create_org: orgId }] = await tx.q<{ create_org: string }>(
        `select public.create_org('مؤسسة جديدة', 'brand-new', 'BN', array['brandnew.example'], 'first@brandnew.example') as create_org`,
      );

      // A member of the brand-new org — no session, no template, nothing published.
      await tx.asOwner();
      const authUserId = (
        await tx.q<{ id: string }>(
          `insert into auth.users (id, email) values (gen_random_uuid(), 'first@brandnew.example') returning id`,
        )
      )[0].id;
      const [m] = await tx.q<{ id: string; claims_version: number }>(
        `insert into public.members (org_id, auth_user_id, email, display_name, org_role)
         values ($1, $2, 'first@brandnew.example', 'أول مشرف', 'admin') returning id, claims_version`,
        [orgId, authUserId],
      );

      await tx.as({
        sub: authUserId,
        email: "first@brandnew.example",
        org_id: orgId,
        member_id: m.id,
        org_role: "admin",
        status: "active",
        claims_version: m.claims_version,
        org_status: "active",
      });

      const platform = await tx.q<{ purpose: string; family: string; is_default: boolean }>(
        `select purpose, family, is_default from public.design_templates
          where scope = 'platform' and retired_at is null order by purpose, family`,
      );
      expect(platform).toHaveLength(8);
      expect(platform.filter((t) => t.purpose === "poster").map((t) => t.family)).toEqual([
        "announcement",
        "meetup",
        "panel",
        "talk",
        "workshop",
      ]);
      expect(platform.filter((t) => t.purpose === "certificate").map((t) => t.family)).toEqual([
        "achievement",
        "attendance",
        "presenter",
      ]);
      // One default per purpose, at minimum — the floor DEC-052 names.
      expect(platform.filter((t) => t.purpose === "poster" && t.is_default).length).toBeGreaterThanOrEqual(1);
      expect(platform.filter((t) => t.purpose === "certificate" && t.is_default).length).toBeGreaterThanOrEqual(1);
      // And every one has a published version to render from.
      const versions = await tx.q<{ n: string }>(
        `select count(*) as n from public.design_template_versions v
           join public.design_templates t on t.id = v.template_id
          where t.scope = 'platform' and v.published_at is not null`,
      );
      expect(Number(versions[0].n)).toBeGreaterThanOrEqual(8);

      // The org owns none of them and can edit none of them (REQ-DSG-008).
      // `templates_update_org` has `scope = 'org'` in its USING clause, so the
      // statement matches no row: it is not an error, it is a no-op. Asserting
      // 42501 here would pass for the wrong reason the day the policy widened.
      await tx.q(`update public.design_templates set name = 'مخطوف' where scope = 'platform' and family = 'talk'`);
      await tx.asOwner();
      expect(
        await tx.q(`select id from public.design_templates where scope = 'platform' and name = 'مخطوف'`),
      ).toHaveLength(0);
      // Creating one is refused outright: `with check` on an insert DOES raise.
      await tx.as({
        sub: authUserId,
        email: "first@brandnew.example",
        org_id: orgId,
        member_id: m.id,
        org_role: "admin",
        status: "active",
        claims_version: m.claims_version,
        org_status: "active",
      });
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.design_templates (org_id, scope, purpose, family, name)
             values (null, 'platform', 'poster', 'talk', 'مزيّف')`,
          ),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("platform — the template library (REQ-DSG-008, SCR-083)", () => {
  it("RPC-promote_template_to_platform — a published org version becomes a platform template BY COPY", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);

      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.promote_template_to_platform($1)`, [f.m6.a.certTemplateVersionId]))).toMatch(
        /not_platform_admin/,
      );

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const [{ id: promoted }] = await tx.q<{ id: string }>(
        `select public.promote_template_to_platform($1, 'شهادة المقدّم (المنصة)') as id`,
        [f.m6.a.certTemplateVersionId],
      );

      await tx.asOwner();
      const [t] = await tx.q<{ scope: string; org_id: string | null; name: string; duplicated_from: string; is_default: boolean }>(
        `select scope, org_id, name, duplicated_from, is_default from public.design_templates where id = $1`,
        [promoted],
      );
      expect(t.scope).toBe("platform");
      expect(t.org_id).toBeNull();
      expect(t.name).toBe("شهادة المقدّم (المنصة)");
      expect(t.duplicated_from).toBe(f.m6.a.certTemplateId);
      expect(t.is_default).toBe(false);

      // A COPY: renaming the org's template afterwards does not reach it.
      await tx.q(`update public.design_templates set name = 'غُيّر بعد الترقية' where id = $1`, [f.m6.a.certTemplateId]);
      const [still] = await tx.q<{ name: string }>(`select name from public.design_templates where id = $1`, [promoted]);
      expect(still.name).toBe("شهادة المقدّم (المنصة)");

      // And the version came across, published.
      const versions = await tx.q<{ version: number; published_at: string | null }>(
        `select version, published_at from public.design_template_versions where template_id = $1`,
        [promoted],
      );
      expect(versions).toHaveLength(1);
      expect(versions[0].published_at).not.toBeNull();
    });
  });

  it("RPC-promote_template_to_platform — an unpublished version and a platform version are refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.asOwner();
      const [draft] = await tx.q<{ id: string }>(
        `insert into public.design_template_versions (template_id, version, document)
         values ($1, 2, '{"schemaVersion":1,"layers":[]}'::jsonb) returning id`,
        [f.m6.a.certTemplateId],
      );

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      expect(await errorMessage(() => tx.q(`select public.promote_template_to_platform($1)`, [draft.id]))).toMatch(
        /version_not_published/,
      );
      expect(
        await errorMessage(() => tx.q(`select public.promote_template_to_platform($1)`, [f.m6.platformTemplateVersionId])),
      ).toMatch(/already_platform/);
    });
  });

  it("RPC-retire_platform_template.floor — the library never falls below one default per purpose", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));

      const library = await tx.q<{ id: string; purpose: string; family: string; is_default: boolean }>(
        `select * from public.platform_template_library()`,
      );
      expect(library).toHaveLength(8);

      const certs = library.filter((t) => t.purpose === "certificate" && t.is_default);
      // Retire every certificate default but the last; the last is refused.
      for (const t of certs.slice(0, -1)) {
        await tx.q(`select public.retire_platform_template($1, true)`, [t.id]);
      }
      const last = certs[certs.length - 1];
      expect(await errorMessage(() => tx.q(`select public.retire_platform_template($1, true)`, [last.id]))).toMatch(
        /last_platform_default/,
      );
    });
  });

  it("RPC-platform_template_library — a non-platform-admin is refused, and only platform scope comes back", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select * from public.platform_template_library()`))).toMatch(/not_platform_admin/);

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const rows = await tx.q<{ id: string }>(`select id from public.platform_template_library()`);
      expect(rows.map((r) => r.id)).not.toContain(f.m6.a.certTemplateId);
    });
  });
});

describe("platform — metrics (REQ-ADM-003, SCR-084)", () => {
  const ALLOWED_ORG_COLUMNS = [
    "org_id",
    "name",
    "slug",
    "status",
    "created_at",
    "members",
    "active_members",
    "sessions",
    "published_sessions",
    "completed_sessions",
    "certificates",
    "org_templates",
  ];

  it("RPC-platform_metrics.aggregate_only — the view exposes counts and org metadata, nothing else", async () => {
    await withTx(async (tx) => {
      await seedBase(tx);
      await apply(tx);
      await tx.asOwner();
      const cols = await tx.q<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'platform_org_metrics' order by ordinal_position`,
      );
      expect(cols.map((c) => c.column_name)).toEqual(ALLOWED_ORG_COLUMNS);
      // The negative REQ-ADM-003 actually states: no member, no title, no content.
      for (const forbidden of ["title", "display_name", "email", "body", "comment", "member_id", "session_id"]) {
        expect(cols.map((c) => c.column_name), forbidden).not.toContain(forbidden);
      }
    });
  });

  it("RPC-platform_metrics — a member and an org admin are refused; the views are ungranted", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);

      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select * from public.platform_metrics_totals()`))).toMatch(/not_platform_admin/);
      expect(await errorCode(() => tx.q(`select * from public.platform_org_metrics`))).toBe(PERMISSION_DENIED);

      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(`select * from public.platform_totals`))).toBe(PERMISSION_DENIED);

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const [totals] = await tx.q<{ orgs: string; members: string }>(`select * from public.platform_metrics_totals()`);
      expect(Number(totals.orgs)).toBeGreaterThanOrEqual(2);
      expect(Number(totals.members)).toBeGreaterThanOrEqual(7);
      const perOrg = await tx.q<{ org_id: string; members: string }>(`select * from public.platform_metrics_by_org()`);
      expect(perOrg.map((r) => r.org_id)).toContain(f.a.id);
      // Job health answers with rows or with none — never with an error.
      await tx.q(`select * from public.platform_job_health()`);
    });
  });
});

describe("platform — retention and the platform trail (REQ-NFR-012, 12 §5.3)", () => {
  it("POL-retention_periods.none — no client role reads the table; 12 §5.3 is seeded", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);

      for (const become of [
        () => tx.as(f.a.admin.claims),
        () => tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email)),
        () => tx.asServiceRole(),
        () => tx.asAnon(),
      ]) {
        await become();
        expect(await errorCode(() => tx.q(`select data_class from public.retention_periods`))).toBe(PERMISSION_DENIED);
      }

      await tx.asServiceRole();
      const schedule = await tx.q<{ data_class: string; days: number | null; action: string }>(
        `select data_class, days, action from public.retention_schedule()`,
      );
      const byClass = Object.fromEntries(schedule.map((r) => [r.data_class, r]));
      expect(byClass.audit_log.days).toBe(2557);
      expect(byClass.check_in_attempts.days).toBe(90);
      expect(byClass.email_deliveries.days).toBe(180);
      expect(byClass.deactivated_members.action).toBe("anonymise");
      // The ledger's exemption is a ROW, so it is visible rather than inferred.
      expect(byClass.points_ledger.action).toBe("retain");
      expect(byClass.points_ledger.days).toBeNull();
    });
  });

  it("POL-platform_audit_log.none — ungranted to every client role, readable through the RPC", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select id from public.platform_audit_log`))).toBe(PERMISSION_DENIED);
      expect(await errorMessage(() => tx.q(`select * from public.platform_audit(10)`))).toMatch(/not_platform_admin/);

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      expect(await errorCode(() => tx.q(`select id from public.platform_audit_log`))).toBe(PERMISSION_DENIED);
      await tx.q(`select public.start_impersonation($1, 'سبب', 60)`, [f.a.id]);
      const rows = await tx.q<{ action: string }>(`select action from public.platform_audit(10)`);
      expect(rows.map((r) => r.action)).toContain("impersonation.started");
    });
  });
});

describe("platform — the member's own data (REQ-PRF-006, REQ-PRF-007)", () => {
  it("POL-data_export_requests.select.self — a member reads their own request and nobody else's", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      const me = f.a.members[0];

      await tx.as(me.claims);
      const [req] = await tx.q<{ id: string; status: string }>(`select * from public.request_data_export()`);
      expect(req.status).toBe("queued");
      // Idempotent while one is open (REQ-NFR-005's first containment).
      const [again] = await tx.q<{ id: string }>(`select * from public.request_data_export()`);
      expect(again.id).toBe(req.id);
      expect(await tx.q(`select id from public.data_export_requests`)).toHaveLength(1);

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.data_export_requests`)).toHaveLength(0);
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select id from public.data_export_requests`)).toHaveLength(0);

      // No role writes the table directly; the RPC is the only door.
      for (const become of [() => tx.as(me.claims), () => tx.asServiceRole()]) {
        await become();
        expect(
          await errorCode(() => tx.q(`update public.data_export_requests set status = 'ready' where id = $1`, [req.id])),
        ).toBe(PERMISSION_DENIED);
        expect(await errorCode(() => tx.q(`delete from public.data_export_requests where id = $1`, [req.id]))).toBe(
          PERMISSION_DENIED,
        );
      }
    });
  });

  it("JOB-build_data_export — 11 §2.7's key, verbatim", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      const me = f.a.members[0];
      await tx.as(me.claims);
      const [req] = await tx.q<{ id: string; requested_at: string }>(`select * from public.request_data_export()`);

      await tx.asOwner();
      const jobs = await tx.q<{ key: string; identifier: string }>(
        `select j.key, t.identifier from graphile_worker._private_jobs j
           join graphile_worker._private_tasks t on t.id = j.task_id
          where j.key like $1`,
        [`export:${me.memberId}:%`],
      );
      expect(jobs).toHaveLength(1);
      expect(jobs[0].identifier).toBe("build_data_export");
      expect(jobs[0].key.startsWith(`export:${me.memberId}:`)).toBe(true);
      expect(req.id).toBeTruthy();
    });
  });

  it("REQ-PRF-007 — a deactivation request is an audit row the org's admin sees, and never a self-delete", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      const me = f.a.members[0];

      await tx.as(me.claims);
      expect(await errorCode(() => tx.q(`select public.request_deactivation('ok')`))).toBe("22023");
      await tx.q(`select public.request_deactivation($1)`, ["أغادر المؤسسة"]);
      // The member is still active: only an admin deactivates (REQ-AUT-008).
      await tx.asOwner();
      expect((await tx.q<{ status: string }>(`select status from public.members where id = $1`, [me.memberId]))[0].status).toBe("active");

      await tx.as(f.a.admin.claims);
      const rows = await tx.q<{ reason: string }>(
        `select reason from public.audit_log where org_id = $1 and action = 'member.deactivation_requested'`,
        [f.a.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].reason).toBe("أغادر المؤسسة");
    });
  });
});

describe("platform — org deletion (REQ-NFR-014, 12 §5.5)", () => {
  it("RPC-delete_org.slug — a wrong slug changes nothing; the right one suspends, records and enqueues", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);

      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select public.delete_org($1, $2)`, [f.a.id, f.a.slug]))).toMatch(/not_platform_admin/);

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      expect(await errorCode(() => tx.q(`select public.delete_org($1, $2)`, [f.a.id, "wrong-slug"]))).toBe("22023");
      await tx.asOwner();
      expect((await tx.q<{ status: string }>(`select status from public.orgs where id = $1`, [f.a.id]))[0].status).toBe("active");

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      await tx.q(`select public.delete_org($1, $2)`, [f.a.id, f.a.slug]);
      await tx.asOwner();
      const [org] = await tx.q<{ status: string; suspended_reason: string }>(
        `select status, suspended_reason from public.orgs where id = $1`,
        [f.a.id],
      );
      expect(org.status).toBe("suspended");
      expect(org.suspended_reason).toBe("pending_deletion");

      const jobs = await tx.q<{ identifier: string }>(
        `select t.identifier from graphile_worker._private_jobs j
           join graphile_worker._private_tasks t on t.id = j.task_id
          where j.key = $1`,
        [`orgdel:${f.a.id}`],
      );
      expect(jobs).toHaveLength(1);
      expect(jobs[0].identifier).toBe("delete_org");
    });
  });

  it("RPC-assert_org_deleted — after the job, no table with an org_id holds a row for it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);

      await tx.asServiceRole();
      const before = await tx.q<{ residue: Record<string, number> }>(`select public.assert_org_deleted($1) as residue`, [f.a.id]);
      expect(Object.keys(before[0].residue).length).toBeGreaterThan(10); // the fixture is real

      const [{ out }] = await tx.q<{ out: { deleted: boolean; residue: Record<string, number> } }>(
        `select public.perform_org_deletion($1) as out`,
        [f.a.id],
      );
      expect(out.deleted).toBe(true);
      expect(out.residue).toEqual({}); // REQ-NFR-014, the assertion itself

      // Org B is untouched, and the platform trail survives the org.
      const [after] = await tx.q<{ residue: Record<string, number> }>(`select public.assert_org_deleted($1) as residue`, [f.b.id]);
      expect(Object.keys(after.residue).length).toBeGreaterThan(10);

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const trail = await tx.q<{ action: string }>(`select action from public.platform_audit(50, $1)`, [f.a.id]);
      expect(trail.map((r) => r.action)).toContain("org.deleted");

      // Replaying the job is safe.
      await tx.asServiceRole();
      const [{ out: replay }] = await tx.q<{ out: { deleted: boolean } }>(`select public.perform_org_deletion($1) as out`, [f.a.id]);
      expect(replay.deleted).toBe(false);
    });
  });
});
