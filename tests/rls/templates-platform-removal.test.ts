// The platform library leaves — REQ-DSG-035, REQ-CRT-014, REQ-CRT-015, DEC-254 §3.3 – §3.4, DEC-255 (D2 the raise,
// D3 the repoint, D4 the drops, D10 the lookup).
//
// ★★ M2 is NOT in PR C's chain (DEC-255, D9): the lead promotes it in the follow-up PR after C merges. Here it is
// `supabase/proposed/designer/0010_platform_library_removal.sql`, applied inside a rolled-back transaction AFTER M1
// (0007 – 0009), which is exactly the order production meets them in. Once promoted, `applyProposed()` is a no-op and
// these cases read the promoted schema.
//
// ★ The «pre-wave» rows are made the honest way: a certificate is issued, a poster document bound and a session
// design set BEFORE M1, when the platform row is still what `issue_certificate()` and `poster_render_context()`
// resolve for an org with no template of its own. Nothing is faked.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const M1 = ["designer/0007_seed_org_templates.sql", "designer/0008_org_templates_guard.sql", "designer/0009_org_templates_backfill.sql"];
const M2 = "designer/0010_platform_library_removal.sql";

async function m1(tx: Tx) {
  for (const file of M1) await applyProposed(tx, file);
}

/** The platform composition of a family by orientation — the row an org with no template of its own resolved. */
async function platform(tx: Tx, purpose: string, family: string, landscape = true) {
  await tx.asOwner();
  const [row] = await tx.q<{ template_id: string; version_id: string }>(
    `select t.id as template_id, l.id as version_id
       from public.design_templates t
       cross join lateral (select v.id, v.document from public.design_template_versions v where v.template_id = t.id order by v.version desc limit 1) l
      where t.scope = 'platform' and t.retired_at is null and t.purpose = $1::public.template_purpose and t.family = $2
        and (t.purpose = 'poster' or ((l.document #>> '{master,width}')::numeric >= (l.document #>> '{master,height}')::numeric) = $3)
      order by t.is_default desc limit 1`,
    [purpose, family, landscape],
  );
  return row!;
}

async function futureSession(tx: Tx, orgId: string, categoryId: string, venueId: string, title: string) {
  const [s] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at)
     values ($1, $2, 'ملخص', $3, 'introductory', now() + interval '3 days', 60, now() + interval '3 days 1 hour', $4, 40, 'published', now())
     returning id`,
    [orgId, title, categoryId, venueId],
  );
  return s.id;
}

/** The world the removal meets: a fixture, a certificate, a poster document and two session designs made against
 *  the PLATFORM rows, then M1 — every org seeded. */
async function world(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  // The fixture's own certificates and documents pin the fixture's templates; start from none, as
  // certificates-designs.test.ts does, so the rows below are the only references.
  for (const t of ["certificates", "certificate_serial_counters", "export_artifacts", "session_posters", "design_documents"]) {
    await tx.q(`delete from public.${t}`);
  }
  await tx.q(`update public.sessions set certificate_mode = 'automatic' where org_id = any($1::uuid[])`, [[f.a.id, f.b.id]]);
  // Fixture org A has an org PRESENTER template of its own (fixture-m6) but no attendance one, so this pins the
  // platform's attendance landscape — the way every pre-wave certificate on production would.
  const [cert] = await tx.q<{ id: string; template_version_id: string }>(
    `select id, template_version_id from public.issue_certificate($1, $2, 'attendance')`,
    [f.m2.a.completed, f.a.members[1].memberId],
  );
  const attendance = await platform(tx, "certificate", "attendance");
  expect(cert.template_version_id).toBe(attendance.version_id);

  const talk = await platform(tx, "poster", "talk");
  await tx.q(
    `insert into public.design_documents (org_id, template_version_id, purpose, document)
     values ($1, $2, 'poster', (select document from public.design_template_versions where id = $2))`,
    [f.a.id, talk.version_id],
  );

  // Two session designs naming platform templates: one UNLOCKED (nothing issued), one LOCKED (a presenter
  // certificate issued for its session — `set_certificate_design()`'s own rule).
  const presenterPortrait = await platform(tx, "certificate", "presenter", false);
  const open = await futureSession(tx, f.a.id, f.a.categoryId, f.a.venueId, "جلسة بتصميم مفتوح");
  await tx.q(`insert into public.session_certificate_designs (org_id, session_id, kind, template_id, scheme) values ($1, $2, 'presenter', $3, 'dark')`, [
    f.a.id,
    open,
    presenterPortrait.template_id,
  ]);
  const attendancePortrait = await platform(tx, "certificate", "attendance", false);
  await tx.q(`insert into public.session_certificate_designs (org_id, session_id, kind, template_id, scheme) values ($1, $2, 'attendance', $3, 'light')`, [
    f.a.id,
    f.m2.a.completed,
    attendancePortrait.template_id,
  ]);

  await m1(tx);
  return { f, cert, attendance, talk, presenterPortrait, attendancePortrait, open };
}

describe("MIG-platform_removal — the order is the safety", () => {
  it("★★ raises_first — an org that cannot resolve every fallback template stops the removal before anything changes", async () => {
    await withTx(async (tx) => {
      await seed(tx);
      // The seed function and the guard, but NO backfill: the fixture orgs hold nothing of their own.
      await applyProposed(tx, M1[0]!);
      await applyProposed(tx, M1[1]!);
      const before = await tx.q<{ c: number }>(`select count(*)::int as c from public.design_templates where scope = 'platform'`);
      expect(await errorMessage(() => applyProposed(tx, M2))).toMatch(/org_without_template/);
      await tx.asOwner();
      expect(await tx.q<{ c: number }>(`select count(*)::int as c from public.design_templates where scope = 'platform'`)).toEqual(before);
      // The functions it would have dropped are still there.
      expect((await tx.q<{ ok: boolean }>(`select to_regprocedure('public.promote_template_to_platform(uuid,text)') is not null as ok`))[0]!.ok).toBe(true);
    });
  });

  it("★★ removal — every platform row is deleted or retired; the referenced ones are retired and still render (REQ-CRT-014)", async () => {
    await withTx(async (tx) => {
      const w = await world(tx);
      const [{ document: before }] = await tx.q<{ document: unknown }>(`select document from public.design_template_versions where id = $1`, [w.cert.template_version_id]);
      await applyProposed(tx, M2);
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
      await applyProposed(tx, M2);
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
      await applyProposed(tx, M2);
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
      await applyProposed(tx, M2);
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
      await applyProposed(tx, M2);
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
