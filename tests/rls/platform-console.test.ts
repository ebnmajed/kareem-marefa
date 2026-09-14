// platform — the console's reads (migration `0070`, proposed as 0002).
// Applied with applyProposed() inside this test's transaction, rolled back.
//
// It opens exactly two doors a super admin does not otherwise have: an org's
// own row with its domain list, and their own impersonation history. The cases
// below are about what does NOT come back through them.
//
// REQ-ADM-001 · REQ-ADM-002 · REQ-ADM-003 · REQ-ADM-019 · REQ-TEN-007

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyProposed, errorMessage, PERMISSION_DENIED, errorCode, withTx, type Claims, type Tx } from "./db";
import { seed, seedBase } from "./fixture";

const FILES = [
  "platform/0001_m8_schema.sql",
  "platform/0002_platform_console_reads.sql",
  "platform/0003_platform_library.sql",
  "platform/0007_job_health_due.sql",
];

async function apply(tx: Tx) {
  for (const file of FILES) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
}

function platformClaims(authUserId: string, email: string): Claims {
  return { sub: authUserId, email, platform_admin: true };
}

describe("platform — the console's reads (0002)", () => {
  it("RPC-platform_org.platform_only — every org role is refused; anon is refused", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);

      for (const claims of [f.a.admin.claims, f.a.mod.claims, f.a.members[0].claims, f.b.admin.claims]) {
        await tx.as(claims);
        expect(await errorMessage(() => tx.q(`select public.platform_org($1)`, [f.a.id]))).toMatch(/not_platform_admin/);
      }
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select public.platform_org($1)`, [f.a.id]))).toBe(PERMISSION_DENIED);
    });
  });

  it("RPC-platform_org — the org's row, its domains and counts, and nothing that names anyone", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));

      const [{ platform_org: org }] = await tx.q<{ platform_org: Record<string, unknown> }>(
        `select public.platform_org($1) as platform_org`,
        [f.a.id],
      );
      expect(org.slug).toBe(f.a.slug);
      expect(org.domains).toEqual([f.a.domain]);
      expect((org.counts as Record<string, number>).members).toBeGreaterThan(0);

      // REQ-ADM-003 as a shape assertion: the envelope's keys are a closed set,
      // and none of them is a member, a title or a piece of content.
      expect(Object.keys(org).sort()).toEqual(
        [
          "certificatePrefix",
          "counts",
          "createdAt",
          "domains",
          "firstAdminEmail",
          "id",
          "name",
          "slug",
          "status",
          "suspendedAt",
          "suspendedReason",
        ].sort(),
      );

      // An unknown org is null, not an error: the console's not-found boundary
      // must not distinguish "no such org" from "not a uuid" for a guesser.
      const [{ platform_org: missing }] = await tx.q<{ platform_org: unknown }>(
        `select public.platform_org('00000000-0000-0000-0000-000000000000'::uuid) as platform_org`,
      );
      expect(missing).toBeNull();
    });
  });

  it("RPC-platform_org — a domain added through the RPC is the one that comes back", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      await tx.q(`select public.add_org_domain($1, 'second.example')`, [f.a.id]);

      const [{ platform_org: org }] = await tx.q<{ platform_org: { domains: string[] } }>(
        `select public.platform_org($1) as platform_org`,
        [f.a.id],
      );
      expect(org.domains.sort()).toEqual([f.a.domain, "second.example"].sort());
    });
  });

  it("RPC-platform_impersonations.own — a platform admin sees their own sessions and not another's", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);

      // A second super admin, so "their own" is a real distinction rather than
      // a filter that happens to match everything.
      await tx.asOwner();
      const [other] = await tx.q<{ id: string }>(
        `insert into auth.users (id, email) values (gen_random_uuid(), 'other-platform@example.test') returning id`,
      );
      await tx.q(`insert into public.platform_admins (auth_user_id) values ($1)`, [other.id]);

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      await tx.q(`select public.start_impersonation($1, 'تحقيق أول', 60)`, [f.a.id]);

      await tx.as(platformClaims(other.id, "other-platform@example.test"));
      await tx.q(`select public.start_impersonation($1, 'تحقيق ثانٍ', 60)`, [f.b.id]);
      const mine = await tx.q<{ reason: string; org_slug: string }>(`select reason, org_slug from public.platform_impersonations()`);
      expect(mine).toHaveLength(1);
      expect(mine[0].reason).toBe("تحقيق ثانٍ");
      expect(mine[0].org_slug).toBe(f.b.slug);

      // The ORG still sees what happened to it, through the table's own policy.
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select id from public.impersonation_sessions`)).toHaveLength(1);

      // And an org admin cannot call the platform reader at all.
      expect(await errorMessage(() => tx.q(`select * from public.platform_impersonations()`))).toMatch(/not_platform_admin/);
    });
  });

  it("RPC-platform_promotable_versions.platform_only — refused to every org role; identity only for a platform admin", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);

      for (const claims of [f.a.admin.claims, f.a.mod.claims, f.a.members[0].claims]) {
        await tx.as(claims);
        expect(await errorMessage(() => tx.q(`select * from public.platform_promotable_versions()`))).toMatch(
          /not_platform_admin/,
        );
      }

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const rows = await tx.q<Record<string, unknown>>(`select * from public.platform_promotable_versions()`);
      expect(rows.length).toBeGreaterThan(0);
      // The whole point of 0003's header: identity, never content.
      expect(Object.keys(rows[0]).sort()).toEqual(
        [
          "already_promoted",
          "family",
          "name",
          "org_id",
          "org_name",
          "published_at",
          "purpose",
          "template_id",
          "version",
          "version_id",
        ].sort(),
      );
      expect(Object.keys(rows[0])).not.toContain("document");
      expect(Object.keys(rows[0])).not.toContain("published_by");
    });
  });

  it("RPC-platform_promotable_versions.scope — drafts and platform versions never appear", async () => {
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
      const ids = (await tx.q<{ version_id: string }>(`select version_id from public.platform_promotable_versions()`)).map(
        (r) => r.version_id,
      );
      expect(ids).toContain(f.m6.a.certTemplateVersionId);
      expect(ids, "an unpublished draft is not promotable").not.toContain(draft.id);
      expect(ids, "the library does not offer to promote itself").not.toContain(f.m6.platformTemplateVersionId);

      // Scoping to one org narrows it, and never widens it.
      const scoped = await tx.q<{ org_id: string }>(`select org_id from public.platform_promotable_versions($1)`, [f.a.id]);
      expect(scoped.every((r) => r.org_id === f.a.id)).toBe(true);
    });
  });

  it("RPC-promote_template_to_platform — after promotion the candidate is flagged already_promoted", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await apply(tx);
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      await tx.q(`select public.promote_template_to_platform($1, 'قالب مرقّى')`, [f.m6.a.certTemplateVersionId]);

      const rows = await tx.q<{ version_id: string; already_promoted: boolean }>(
        `select version_id, already_promoted from public.platform_promotable_versions($1)`,
        [f.a.id],
      );
      expect(rows.find((r) => r.version_id === f.m6.a.certTemplateVersionId)!.already_promoted).toBe(true);
    });
  });

  it("RPC-platform_job_health.due — a future job is neither pending nor old, and the age is never negative", async () => {
    await withTx(async (tx) => {
      const f = await seedBase(tx);
      await apply(tx);
      await tx.asOwner();

      // Exactly the shape that put «-1,679» on SCR-084: `expire_impersonation`
      // is enqueued at the session's `expires_at`, an hour ahead, and the
      // first version measured `now() - run_at` over it.
      await tx.q(
        `insert into graphile_worker._private_jobs (job_queue_id, task_id, payload, run_at, max_attempts)
         select null, t.id, '{}'::json, now() + interval '1 hour', 25
           from graphile_worker._private_tasks t limit 1`,
      );

      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const scheduled = await tx.q<{ task_identifier: string; pending: string; oldest_pending_seconds: string }>(
        `select task_identifier, pending::text, oldest_pending_seconds::text from public.platform_job_health()`,
      );
      for (const row of scheduled) {
        expect(Number(row.oldest_pending_seconds), `${row.task_identifier} age is never negative`).toBeGreaterThanOrEqual(0);
      }
      const total = scheduled.reduce((n, r) => n + Number(r.pending), 0);

      // An OVERDUE job counts on both numbers.
      await tx.asOwner();
      await tx.q(
        `insert into graphile_worker._private_jobs (job_queue_id, task_id, payload, run_at, max_attempts)
         select null, t.id, '{}'::json, now() - interval '20 minutes', 25
           from graphile_worker._private_tasks t limit 1`,
      );
      await tx.as(platformClaims(f.platformAdmin.authUserId, f.platformAdmin.email));
      const overdue = await tx.q<{ pending: string; oldest_pending_seconds: string }>(
        `select pending::text, oldest_pending_seconds::text from public.platform_job_health()`,
      );
      expect(overdue.reduce((n, r) => n + Number(r.pending), 0)).toBe(total + 1);
      expect(Math.max(...overdue.map((r) => Number(r.oldest_pending_seconds)))).toBeGreaterThan(1000);
    });
  });
});
