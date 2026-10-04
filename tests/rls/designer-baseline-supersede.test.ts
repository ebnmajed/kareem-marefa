// ★★ The baseline, superseded — supabase/proposed/designer/{0006_supersede_baseline,0005_playground_library}.sql
// (REQ-DSG-034, REQ-CRT-014, REQ-DSG-033, REQ-CRT-016, DEC-242 §3).
//
// THE WAVE'S HARDEST CLAIM, AND THE ONLY FILE THAT PROVES IT: a certificate
// issued BEFORE the rebuild still renders as the version it was issued against.
// The owner asked for a hard delete; the schema grants part of it and refuses
// the rest, and the refusal is the requirement — so what is proved here is not
// «the delete worked» but «the delete was REFUSED, and the refusal left the old
// document reachable by exactly the row that needs it».
//
// ★ Both branches, on fixtures, because production cannot show both. The owner's
// read at sync 1 says production holds `certs = 0` on all eleven baseline rows
// and `docs = 2` on `poster/talk` alone — so production exercises the DELETE
// branch ten times and the RETIRE branch once, and never the certificate path
// that `REQ-CRT-014` is actually about. A test is the only place that path runs
// before a member's certificate depends on it.
//
// 03 §8.2: RPC-supersede_baseline_template.{deleted,retired_by_certificate,
// retired_by_document,retired_by_design,not_callable}.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FN = "designer/0006_supersede_baseline.sql";

/**
 * ★★ The wave's own SQL, in application order, under EITHER shape.
 *
 * Under `supabase/proposed/` it is two files; the lead promotes them as ONE
 * migration (`0193_baseline_library_playground.sql`) whose name ends with
 * neither proposed suffix. `applyProposed()` cannot stand in for this: it
 * correctly no-ops once a file is promoted, on the reasoning that `db:reset`
 * already applied it — but these tests DELETE every template row to rebuild a
 * pre-wave world, so the wave's inserts have to run again inside the
 * transaction. A no-op there would leave no new rows and the assertions would
 * be measuring nothing.
 */
function wave24(): string[] {
  const proposed = ["0006_supersede_baseline.sql", "0005_playground_library.sql"]
    .map((f) => join(process.cwd(), "supabase", "proposed", "designer", f))
    .filter((f) => existsSync(f));
  if (proposed.length === 2) return proposed.map((f) => readFileSync(f, "utf8"));
  const dir = join(process.cwd(), "supabase", "migrations");
  const found = readdirSync(dir).find((f) => /_baseline_library_playground\.sql$/.test(f));
  if (!found) throw new Error("wave 24's baseline seed is neither under supabase/proposed/designer/ nor promoted");
  return [readFileSync(join(dir, found), "utf8")];
}

/** The platform baseline as it stands BEFORE this wave, built from the
 *  migrations on an empty world — 0061's eight compositions and 0098's versions.
 *  Nothing is faked: these are the rows an org's certificates actually point at. */
async function preWaveLibrary(tx: Tx): Promise<void> {
  await tx.asOwner();
  for (const t of ["certificates", "export_artifacts", "session_posters", "design_documents", "design_assets", "design_template_versions", "design_templates"]) {
    await tx.q(`delete from public.${t}`);
  }
  await tx.q(migrationText("_baseline_library.sql"));
  await tx.q(migrationText("_certificate_library.sql", "designer/0002_certificate_library.sql"));
}

function migrationText(suffix: string, proposed?: string): string {
  if (proposed) {
    const file = join(process.cwd(), "supabase", "proposed", proposed);
    if (existsSync(file)) return readFileSync(file, "utf8");
  }
  const dir = join(process.cwd(), "supabase", "migrations");
  const found = readdirSync(dir).find((f) => f.endsWith(suffix));
  if (!found) throw new Error(`no migration ending ${suffix}`);
  return readFileSync(join(dir, found), "utf8");
}

/** One platform certificate row and its latest version — what `issue_certificate()`
 *  resolves when an org has authored no template of its own. */
async function platformCertificate(tx: Tx, family: string): Promise<{ templateId: string; versionId: string }> {
  const [row] = await tx.q<{ template_id: string; id: string }>(
    `select v.template_id, v.id from public.design_templates t
       join public.design_template_versions v on v.template_id = t.id
      where t.scope = 'platform' and t.purpose = 'certificate' and t.family = $1 and t.is_default
      order by v.version desc limit 1`,
    [family],
  );
  return { templateId: row.template_id, versionId: row.id };
}

describe("REQ-DSG-034 — the superseded baseline leaves the library", () => {
  it("supersede.deleted — a platform row nothing references is DELETED, and its versions go with it", async () => {
    await withTx(async (tx) => {
      await preWaveLibrary(tx);
      await applyProposed(tx, FN);
      const { templateId } = await platformCertificate(tx, "achievement");
      const versions = await tx.q<{ c: string }>(`select count(*)::text c from public.design_template_versions where template_id = $1`, [templateId]);
      expect(Number(versions[0]!.c)).toBeGreaterThan(0);

      const [out] = await tx.q<{ outcome: string; refused_by: string | null }>(`select * from public.supersede_baseline_template($1)`, [templateId]);
      expect(out).toEqual({ outcome: "deleted", refused_by: null });
      // ON DELETE CASCADE on `template_id` (0055:111) — the versions follow.
      expect((await tx.q<{ c: string }>(`select count(*)::text c from public.design_template_versions where template_id = $1`, [templateId]))[0]!.c).toBe("0");
      expect((await tx.q<{ c: string }>(`select count(*)::text c from public.design_templates where id = $1`, [templateId]))[0]!.c).toBe("0");
    });
  });

  it("★★ supersede.retired_by_certificate — a version a CERTIFICATE references is never deleted, and the certificate still resolves the document it was issued against", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await preWaveLibrary(tx);
      await applyProposed(tx, FN);

      // A real certificate through the product's own function, so it pins the
      // PLATFORM version the way every certificate in an org with no template of
      // its own does (`issue_certificate()` — «the org's default, else the
      // platform's», `t.org_id is null` in the predicate).
      const [session] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                      venue_id, capacity, state, published_at, completed_at, certificate_mode)
         values ($1, 'جلسة قبل إعادة البناء', 'ملخص', $2, 'introductory', now() - interval '3 hours', 60,
                 now() - interval '2 hours', $3, 40, 'completed', now() - interval '2 days', now() - interval '1 hour', 'review')
         returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId],
      );
      const member = f.a.members[0]!;
      await tx.q(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
         values ($1, $2, $3, 'manual', 'حضر', $4, 'empty'::tstzrange)`,
        [f.a.id, session.id, member.memberId, f.a.admin.memberId],
      );
      const [cert] = await tx.q<{ id: string; template_version_id: string }>(
        `select id, template_version_id from public.issue_certificate($1, $2, 'attendance')`,
        [session.id, member.memberId],
      );
      const pinned = cert.template_version_id;
      const [{ template_id: templateId, document: before }] = await tx.q<{ template_id: string; document: unknown }>(
        `select template_id, document from public.design_template_versions where id = $1`,
        [pinned],
      );
      // It really is a PLATFORM row — the whole reason the delete is refused.
      expect((await tx.q<{ org_id: string | null }>(`select org_id from public.design_templates where id = $1`, [templateId]))[0]!.org_id).toBeNull();

      const [out] = await tx.q<{ outcome: string; refused_by: string | null }>(`select * from public.supersede_baseline_template($1)`, [templateId]);
      expect(out.outcome).toBe("retired");
      // The database's own message, not ours — proof the refusal came from the
      // constraint rather than from a count this function did first.
      expect(out.refused_by).toContain("certificates");

      const [row] = await tx.q<{ retired: boolean; is_default: boolean }>(
        `select retired_at is not null as retired, is_default from public.design_templates where id = $1`,
        [templateId],
      );
      expect(row).toEqual({ retired: true, is_default: false });

      // ★★ REQ-CRT-014, the claim itself: the certificate still points at its own
      // version, and that version still carries the document it was issued
      // against, byte for byte.
      const [after] = await tx.q<{ template_version_id: string }>(`select template_version_id from public.certificates where id = $1`, [cert.id]);
      expect(after.template_version_id).toBe(pinned);
      const [doc] = await tx.q<{ document: unknown }>(`select document from public.design_template_versions where id = $1`, [pinned]);
      expect(doc.document).toEqual(before);

      // And the renderer's own entry point agrees — this is what the worker reads.
      const [ctx] = await tx.q<{ template_version_id: string; template_document: unknown }>(
        `select template_version_id, template_document from public.certificate_render_context($1)`,
        [cert.id],
      );
      expect(ctx.template_version_id).toBe(pinned);
      expect(ctx.template_document).toEqual(before);

      // ★ Nothing was forced: the serial, the frozen name and the pinned fonts
      // are untouched (DEC-242 §3's forbidden list).
      const [kept] = await tx.q<{ serial: string; recipient_name_snapshot: string; font_hashes: string[] }>(
        `select serial, recipient_name_snapshot, font_hashes from public.certificates where id = $1`,
        [cert.id],
      );
      expect(kept.serial).toBeTruthy();
      expect(kept.recipient_name_snapshot).toBeTruthy();
    });
  });

  it("★ supersede.retired_by_document — the automatic POSTER path refuses it too, through design_documents", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await preWaveLibrary(tx);
      await applyProposed(tx, FN);

      // `poster_render_context()` resolves the `talk` family and only `talk`
      // (0063:113-121), and `regenerate_poster` writes a design_documents row
      // carrying that version. This is the one row the owner's production read
      // found referenced — `docs = 2` on poster/talk.
      const [v] = await tx.q<{ template_id: string; id: string }>(
        `select v.template_id, v.id from public.design_templates t
           join public.design_template_versions v on v.template_id = t.id
          where t.scope = 'platform' and t.purpose = 'poster' and t.family = 'talk'
          order by v.version desc limit 1`,
      );
      await tx.q(
        `insert into public.design_documents (org_id, template_version_id, purpose, document)
         values ($1, $2, 'poster', (select document from public.design_template_versions where id = $2))`,
        [f.a.id, v.id],
      );

      const [out] = await tx.q<{ outcome: string; refused_by: string | null }>(`select * from public.supersede_baseline_template($1)`, [v.template_id]);
      expect(out.outcome).toBe("retired");
      expect(out.refused_by).toContain("design_documents");
      expect((await tx.q<{ c: string }>(`select count(*)::text c from public.design_template_versions where id = $1`, [v.id]))[0]!.c).toBe("1");
    });
  });

  it("★ supersede.retired_by_design — a template SCR-045 named directly is refused on the template itself", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await preWaveLibrary(tx);
      await applyProposed(tx, FN);
      const { templateId } = await platformCertificate(tx, "presenter");
      const [session] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                      venue_id, capacity, state, published_at)
         values ($1, 'جلسة باختيار قالب', 'ملخص', $2, 'introductory', now() + interval '3 days', 60,
                 now() + interval '3 days 1 hour', $3, 40, 'published', now()) returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId],
      );
      // The row SCR-045 writes. `session_certificate_designs.template_id` is
      // `on delete restrict` (0099:63) and names the TEMPLATE, not a version.
      await tx.q(
        `insert into public.session_certificate_designs (org_id, session_id, kind, template_id, scheme)
         values ($1, $2, 'presenter', $3, 'light')`,
        [f.a.id, session.id, templateId],
      );

      const [out] = await tx.q<{ outcome: string; refused_by: string | null }>(`select * from public.supersede_baseline_template($1)`, [templateId]);
      expect(out.outcome).toBe("retired");
      expect(out.refused_by).toContain("session_certificate_designs");
    });
  });

  it("supersede.idempotent — a row already retired is reported, not written again; an absent one is `absent`", async () => {
    await withTx(async (tx) => {
      await preWaveLibrary(tx);
      await applyProposed(tx, FN);
      const { templateId } = await platformCertificate(tx, "attendance");
      await tx.q(`update public.design_templates set retired_at = now() - interval '1 day' where id = $1`, [templateId]);
      const [{ retired_at: was }] = await tx.q<{ retired_at: string }>(`select retired_at from public.design_templates where id = $1`, [templateId]);
      const [out] = await tx.q<{ outcome: string }>(`select outcome from public.supersede_baseline_template($1)`, [templateId]);
      expect(out.outcome).toBe("already_retired");
      // Not re-stamped: a re-run of the migration reports nothing new.
      expect((await tx.q<{ retired_at: string }>(`select retired_at from public.design_templates where id = $1`, [templateId]))[0]!.retired_at).toEqual(was);

      const [gone] = await tx.q<{ outcome: string }>(`select outcome from public.supersede_baseline_template('00000000-0000-0000-0000-000000000000')`);
      expect(gone.outcome).toBe("absent");
    });
  });

  it("supersede.org_template_refused — an ORG's own template is never superseded by a platform seed", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await preWaveLibrary(tx);
      await applyProposed(tx, FN);
      const [own] = await tx.q<{ id: string }>(
        `insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
         values ($1, 'org', 'poster', 'talk', 'قالب المؤسسة', true) returning id`,
        [f.a.id],
      );
      // REQ-DSG-008: an org's library is its own property, whatever its document
      // resembles. The guard is in the function, not in the caller's loop.
      expect(await errorCode(() => tx.q(`select * from public.supersede_baseline_template($1)`, [own.id]))).toBe("42501");
    });
  });

  it("★★ supersede.not_callable — no role may execute it: it is the owner's, and invisible through PostgREST", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, FN);
      const rows = await tx.q<{ grantee: string }>(
        `select grantee from information_schema.role_routine_grants
          where routine_name = 'supersede_baseline_template' and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')`,
      );
      expect(rows).toEqual([]);
    });
  });
});

describe("REQ-DSG-033 · REQ-CRT-016 — the rebuilt library replaces the old one and issuance follows it", () => {
  it("★★ the eleven are replaced, and issuance after the wave resolves a NEW row — never a retired one", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await preWaveLibrary(tx);

      // A certificate issued BEFORE the wave, pinning a pre-wave platform version.
      const [session] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                      venue_id, capacity, state, published_at, completed_at, certificate_mode)
         values ($1, 'جلسة سابقة', 'ملخص', $2, 'introductory', now() - interval '3 hours', 60,
                 now() - interval '2 hours', $3, 40, 'completed', now() - interval '2 days', now() - interval '1 hour', 'review')
         returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId],
      );
      const older = f.a.members[0]!;
      await tx.q(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
         values ($1, $2, $3, 'manual', 'حضر', $4, 'empty'::tstzrange)`,
        [f.a.id, session.id, older.memberId, f.a.admin.memberId],
      );
      const [old] = await tx.q<{ id: string; template_version_id: string }>(
        `select id, template_version_id from public.issue_certificate($1, $2, 'attendance')`,
        [session.id, older.memberId],
      );
      const [{ document: oldDocument }] = await tx.q<{ document: unknown }>(`select document from public.design_template_versions where id = $1`, [old.template_version_id]);

      // ★ The wave, exactly as the migration runs it: the function, then the seed,
      // which inserts the eleven and then supersedes everything else.
      // ★ The wave, exactly as the migration runs it.
      for (const body of wave24()) await tx.q(body);

      // The live roster is the new eleven, each at version 1.
      const live = await tx.q<{ purpose: string; family: string; version: string }>(
        `select t.purpose::text as purpose, t.family, v.version::text as version
           from public.design_templates t join public.design_template_versions v on v.template_id = t.id
          where t.scope = 'platform' and t.retired_at is null order by t.purpose, t.family`,
      );
      expect(live).toHaveLength(11);
      expect([...new Set(live.map((r) => r.version))]).toEqual(["1"]);

      // ★★ The held certificate did not move, and still renders its own version.
      const [still] = await tx.q<{ template_version_id: string }>(`select template_version_id from public.certificates where id = $1`, [old.id]);
      expect(still.template_version_id).toBe(old.template_version_id);
      const [ctx] = await tx.q<{ template_document: unknown }>(`select template_document from public.certificate_render_context($1)`, [old.id]);
      expect(ctx.template_document).toEqual(oldDocument);
      // Its row is retired, so it is gone from the library and the picker — and
      // still there, which is the whole point.
      const [host] = await tx.q<{ retired: boolean }>(
        `select t.retired_at is not null as retired from public.design_templates t
           join public.design_template_versions v on v.template_id = t.id where v.id = $1`,
        [old.template_version_id],
      );
      expect(host.retired).toBe(true);

      // ★ And the NEXT certificate takes the new design: `issue_certificate()`
      // filters `retired_at is null`, so a retired row can never be resolved.
      const newer = f.a.members[1]!;
      await tx.q(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
         values ($1, $2, $3, 'manual', 'حضر', $4, 'empty'::tstzrange)`,
        [f.a.id, session.id, newer.memberId, f.a.admin.memberId],
      );
      const [fresh] = await tx.q<{ template_version_id: string }>(
        `select template_version_id from public.issue_certificate($1, $2, 'attendance')`,
        [session.id, newer.memberId],
      );
      expect(fresh.template_version_id).not.toBe(old.template_version_id);
      const [freshHost] = await tx.q<{ retired: boolean; version: string }>(
        `select t.retired_at is not null as retired, v.version::text as version
           from public.design_template_versions v join public.design_templates t on t.id = v.template_id where v.id = $1`,
        [fresh.template_version_id],
      );
      expect(freshHost).toEqual({ retired: false, version: "1" });
    });
  });
});
