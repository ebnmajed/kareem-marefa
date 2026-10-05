// The platform library leaves — REQ-DSG-035, REQ-CRT-014, REQ-CRT-015, DEC-254 §3.3 – §3.4, DEC-255 (D2 the raise,
// D3 the repoint, D4 the drops, D10 the lookup).
//
// ★★ LEDGER (wave 27, PR D): M2 is PROMOTED (0209, the lead's 0210). The chain a test meets has no live platform
// row, so `templates-world.ts` rebuilds the world 0209 meets inside the rolled-back transaction and `removal()` runs
// 0209's own sections 1 – 3, read from the migration file. The narrowed lookups and the drops (sections 4 – 5) are the
// chain's. How the world is rebuilt, and how a «pre-wave» certificate is made, is said there.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, errorMessage, pool, withTx } from "./db";
import { raiseFirst, removal, world } from "./templates-world";

afterAll(() => pool.end());

describe("MIG-platform_removal — the order is the safety", () => {
  it("★★ raises_first — an org that cannot resolve every fallback template stops the removal before anything changes", async () => {
    await withTx(async (tx) => {
      const w = await world(tx);
      const f = w.f;
      // An org the seed never reached — what a failed or skipped backfill would leave. Inserted with the seed trigger
      // off, so it holds nothing of its own.
      await tx.asOwner();
      await tx.q(`alter table public.orgs disable trigger orgs_seed_templates`);
      await tx.q(`insert into public.orgs (name, slug, certificate_prefix, created_by) values ('غير مبذورة', $1, 'UN', $2)`, [
        `unseeded-${randomUUID().slice(0, 8)}`,
        f.platformAdmin.authUserId,
      ]);
      await tx.q(`alter table public.orgs enable trigger orgs_seed_templates`);
      const live = `select count(*)::int as c from public.design_templates where scope = 'platform' and retired_at is null`;
      const before = await tx.q<{ c: number }>(live);
      expect(before[0]!.c).toBeGreaterThan(0);
      expect(await errorMessage(() => raiseFirst(tx))).toMatch(/org_without_template/);
      await tx.asOwner();
      // Nothing moved: every platform row is still live, and the unlocked design still names its platform template.
      expect(await tx.q<{ c: number }>(live)).toEqual(before);
      const [{ scope }] = await tx.q<{ scope: string }>(
        `select t.scope::text as scope from public.session_certificate_designs d join public.design_templates t on t.id = d.template_id where d.session_id = $1`,
        [w.open],
      );
      expect(scope).toBe("platform");
    });
  });

  it("★★ removal — every platform row is deleted or retired; the referenced ones are retired and still render (REQ-CRT-014)", async () => {
    await withTx(async (tx) => {
      const w = await world(tx);
      const [{ document: before }] = await tx.q<{ document: unknown }>(`select document from public.design_template_versions where id = $1`, [w.cert.template_version_id]);
      await removal(tx);
      await tx.asOwner();

      // No LIVE platform row remains.
      expect(await tx.q(`select id from public.design_templates where scope = 'platform' and retired_at is null`)).toEqual([]);
      // The survivors are exactly the referenced ones: the certificate's, the document's and the locked design's.
      const survivors = await tx.q<{ id: string; is_default: boolean }>(`select id, is_default from public.design_templates where scope = 'platform' order by id`);
      expect(survivors.map((s) => s.id).sort()).toEqual([w.attendance.template_id, w.talk.template_id, w.attendancePortrait.template_id].sort());
      for (const s of survivors) expect(s.is_default).toBe(false);

      // ★★ The certificate still pins its own version, and the renderer reads the document it was issued against.
      const [cert] = await tx.q<{ template_version_id: string }>(`select template_version_id from public.certificates where id = $1`, [w.cert.id]);
      expect(cert.template_version_id).toBe(w.cert.template_version_id);
      const [ctx] = await tx.q<{ template_version_id: string; template_document: unknown }>(
        `select template_version_id, template_document from public.certificate_render_context($1)`,
        [w.cert.id],
      );
      expect(ctx).toEqual({ template_version_id: w.cert.template_version_id, template_document: before });

      // Every org still resolves every fallback template.
      expect(await tx.q(`select o.id from public.orgs o where exists (select 1 from public.org_missing_templates(o.id))`)).toEqual([]);
    });
  });

  it("★ repoint (D3) — the UNLOCKED design now names the org's own template of the same family and orientation; the LOCKED one is left", async () => {
    await withTx(async (tx) => {
      const w = await world(tx);
      // Lock the second design: an ISSUED attendance certificate exists for its session (made in world()).
      await removal(tx);
      await tx.asOwner();
      const designs = await tx.q<{ session_id: string; kind: string; template_id: string; scheme: string; scope: string; org_id: string | null; portrait: boolean }>(
        `select d.session_id, d.kind::text as kind, d.template_id, d.scheme::text as scheme, t.scope::text as scope, t.org_id,
                (select (v.document #>> '{master,width}')::numeric < (v.document #>> '{master,height}')::numeric
                   from public.design_template_versions v where v.template_id = t.id order by v.version desc limit 1) as portrait
           from public.session_certificate_designs d join public.design_templates t on t.id = d.template_id
          where d.org_id = $1 order by d.kind`,
        [w.f.a.id],
      );
      const open = designs.find((d) => d.session_id === w.open)!;
      expect(open).toMatchObject({ kind: "presenter", scope: "org", org_id: w.f.a.id, scheme: "dark", portrait: true });
      const locked = designs.find((d) => d.session_id === w.f.m2.a.completed)!;
      expect(locked).toMatchObject({ kind: "attendance", template_id: w.attendancePortrait.template_id, scope: "platform" });
      // Audited as the design's write is, with no member as the actor.
      const audit = await tx.q<{ actor_role: string; before: { template_id: string }; after: { template_id: string } }>(
        `select actor_role, before, after from public.audit_log where org_id = $1 and action = 'certificate.design_set' and subject_id = $2`,
        [w.f.a.id, w.open],
      );
      expect(audit).toEqual([{ actor_role: "system", before: { template_id: w.presenterPortrait.template_id, scheme: "dark" }, after: { kind: "presenter", template_id: open.template_id, scheme: "dark" } }]);
    });
  });

  it("★ org_only — issuance, achievement, the poster and SCR-045's design read the org's own; a platform template is refused", async () => {
    await withTx(async (tx) => {
      const w = await world(tx);
      await removal(tx);
      await tx.asOwner();
      // A NEW attendance certificate pins the org's own default — never the retired platform row.
      await tx.q(`delete from public.session_certificate_designs where session_id = $1`, [w.f.m2.a.completed]);
      await tx.q(`delete from public.certificates where id = $1`, [w.cert.id]);
      const [fresh] = await tx.q<{ template_version_id: string }>(`select template_version_id from public.issue_certificate($1, $2, 'attendance')`, [
        w.f.m2.a.completed,
        w.f.a.members[1].memberId,
      ]);
      const [{ v: orgAttendance }] = await tx.q<{ v: string }>(`select public.org_template_version($1, 'certificate', 'attendance') as v`, [w.f.a.id]);
      expect(fresh.template_version_id).toBe(orgAttendance);

      const [badge] = await tx.q<{ id: string }>(`insert into public.badges (org_id, key, name, issues_certificate) values ($1, $2, 'مثابر', true) returning id`, [
        w.f.a.id,
        `k-${randomUUID().slice(0, 8)}`,
      ]);
      const [ach] = await tx.q<{ template_version_id: string }>(`select template_version_id from public.issue_achievement_certificate($1, $2)`, [w.f.a.members[1].memberId, badge.id]);
      const [{ v: orgAchievement }] = await tx.q<{ v: string }>(`select public.org_template_version($1, 'certificate', 'achievement') as v`, [w.f.a.id]);
      expect(ach.template_version_id).toBe(orgAchievement);

      const [poster] = await tx.q<{ template_version_id: string }>(`select template_version_id from public.poster_render_context($1)`, [w.f.m2.a.published]);
      const [{ v: orgTalk }] = await tx.q<{ v: string }>(`select public.org_template_version($1, 'poster', 'talk') as v`, [w.f.a.id]);
      expect(poster.template_version_id).toBe(orgTalk);

      // SCR-045 cannot name the platform row, even the one a locked design still names.
      await tx.as(w.f.a.admin.claims);
      expect(
        await errorCode(() => tx.q(`select public.set_certificate_design($1, 'attendance', $2, 'light')`, [w.open, w.attendancePortrait.template_id])),
      ).toBe("22023");
    });
  });

  it("★ the platform library's functions are gone (D4), and `remove_platform_template()` is owner-only", async () => {
    await withTx(async (tx) => {
      const w = await world(tx);
      await removal(tx);
      await tx.asOwner();
      for (const sig of [
        "public.promote_template_to_platform(uuid,text)",
        "public.retire_platform_template(uuid,boolean)",
        "public.set_platform_template_default(uuid)",
        "public.platform_template_library()",
        "public.platform_promotable_versions(uuid)",
        "public.supersede_baseline_template(uuid)",
      ]) {
        expect((await tx.q<{ gone: boolean }>(`select to_regprocedure($1) is null as gone`, [sig]))[0]!.gone, sig).toBe(true);
      }
      await tx.as(w.f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select * from public.remove_platform_template($1)`, [w.talk.template_id]))).toMatch(/permission denied/);
    });
  });
});

describe("RPC-remove_platform_template — 0193's shape, one difference", () => {
  it("kept_retired · absent · an org's template refused · a retired, now-unreferenced row is DELETED on a second pass", async () => {
    await withTx(async (tx) => {
      const w = await world(tx);
      await removal(tx);
      await tx.asOwner();
      const call = async (id: string) => (await tx.q<{ outcome: string; refused_by: string | null }>(`select * from public.remove_platform_template($1)`, [id]))[0]!;

      // Still referenced by the certificate: reported, not written.
      const kept = await call(w.attendance.template_id);
      expect(kept.outcome).toBe("kept_retired");
      expect(kept.refused_by).toContain("certificates");

      expect((await call(randomUUID())).outcome).toBe("absent");

      const [{ id: orgTemplate }] = await tx.q<{ id: string }>(`select id from public.design_templates where org_id = $1 limit 1`, [w.f.a.id]);
      expect(await errorCode(() => call(orgTemplate))).toBe("42501");

      // ★ The difference from `supersede_baseline_template()`: the document that kept the old talk is gone, so a
      // RETIRED row is tried again and deleted — production's old `talk` exactly.
      await tx.q(`delete from public.design_documents where template_version_id = $1`, [w.talk.version_id]);
      expect((await call(w.talk.template_id)).outcome).toBe("deleted");
      expect(await tx.q(`select id from public.design_templates where id = $1`, [w.talk.template_id])).toEqual([]);
    });
  });
});
