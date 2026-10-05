// The world the platform library's removal meets — shared by templates-platform-removal and templates-read-narrowed.
// REQ-DSG-035, REQ-CRT-014, DEC-254 §3, DEC-255.
//
// ★ LEDGER (wave 27, PR D): the removal is PROMOTED (0209, with the lead's 0210), so by the time a test's setup runs
// the chain holds no live platform row and refuses one (`design_templates_platform_retired`). These suites therefore
// REBUILD the world 0209 meets, inside the rolled-back transaction, and run 0209's own SQL against it:
//
//   1. A fixture, every org seeded by M1's trigger (0205 – 0207).
//   2. 0210's constraint lifted for this transaction, and LIVE platform rows put back — each a copy of the org's
//      seeded document of the same composition, which is what the platform rows carried (0196's version 2 = the
//      seed's version 1, byte for byte; `templates-org-seed` proves it).
//   3. Org A's references to them: an issued certificate, a poster document, an UNLOCKED session design and a LOCKED
//      one (a certificate of its kind issued — `set_certificate_design()`'s own rule, 0099:126-133).
//   4. `removal()` runs 0209's sections 1 – 3 VERBATIM, read from the migration file — the raise, the repoint, the
//      delete-or-retire loop — and then puts 0210's constraint back, as the promoted chain has it. Sections 4 and 5
//      (the narrowed lookups, the drops) are already in the chain and are not re-run.
//
// ★ The certificate is issued through the product's own function (serial, code, the frozen name — all real) and then,
// as the owner, pointed at the platform version it would have pinned before the wave. The one column that differs is
// the one the scenario is about.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import type { Tx } from "./db";
import { seed } from "./fixture";

/** A promoted migration by its suffix, else the proposed file — so the suites read whichever the chain has. */
function sqlFile(suffix: RegExp, proposed: string): string {
  const p = join(process.cwd(), "supabase", "proposed", "designer", proposed);
  if (existsSync(p)) return readFileSync(p, "utf8");
  const dir = join(process.cwd(), "supabase", "migrations");
  const found = readdirSync(dir)
    .filter((f) => suffix.test(f))
    .sort()
    .at(-1);
  if (!found) throw new Error(`no migration matching ${suffix}`);
  return readFileSync(join(dir, found), "utf8");
}

/** 0209's numbered sections, by their `-- ═══ N ·` markers. */
function removalSection(n: number): string {
  const sql = sqlFile(/_platform_library_removal\.sql$/, "0010_platform_library_removal.sql");
  const start = sql.indexOf(`-- ═══ ${n} ·`);
  if (start < 0) throw new Error(`0209 has no section ${n}`);
  const next = sql.indexOf(`-- ═══ ${n + 1} ·`, start);
  return next < 0 ? sql.slice(start) : sql.slice(start, next);
}

/** 0210's constraint statement, verbatim. */
function platformRetiredConstraint(): string {
  const sql = sqlFile(/_platform_rows_read\.sql$/, "0011_platform_rows_read.sql");
  const m = sql.match(/alter table public\.design_templates\s+add constraint design_templates_platform_retired[^;]*;/);
  if (!m) throw new Error("0210's constraint statement was not found");
  return m[0];
}

/** 0209's raise, alone — the first thing it does. */
export async function raiseFirst(tx: Tx) {
  await tx.asOwner();
  await tx.q(removalSection(1));
}

/** 0209's raise, repoint and delete-or-retire, then 0210's constraint back. */
export async function removal(tx: Tx) {
  await tx.asOwner();
  for (const n of [1, 2, 3]) await tx.q(removalSection(n));
  await tx.q(platformRetiredConstraint());
}

/** A LIVE platform row of a composition, carrying org A's seeded document of the same composition. */
async function livePlatform(tx: Tx, orgId: string, purpose: "poster" | "certificate", family: string, landscape: boolean, isDefault: boolean) {
  const [src] = await tx.q<{ name: string; document: unknown; fields: unknown }>(
    `select t.name, l.document, l.dynamic_fields as fields
       from public.design_templates t
       cross join lateral (select v.document, v.dynamic_fields from public.design_template_versions v where v.template_id = t.id order by v.version desc limit 1) l
      where t.org_id = $1 and t.created_by is null and t.purpose = $2::public.template_purpose and t.family = $3
        and (t.purpose = 'poster' or ((l.document #>> '{master,width}')::numeric >= (l.document #>> '{master,height}')::numeric) = $4)
      limit 1`,
    [orgId, purpose, family, landscape],
  );
  const [t] = await tx.q<{ id: string }>(
    `insert into public.design_templates (org_id, scope, purpose, family, name, is_default) values (null, 'platform', $1, $2, $3, $4) returning id`,
    [purpose, family, src!.name, isDefault],
  );
  const [v] = await tx.q<{ id: string }>(
    `insert into public.design_template_versions (template_id, version, document, dynamic_fields, published_at) values ($1, 1, $2::jsonb, $3::jsonb, now()) returning id`,
    [t.id, JSON.stringify(src!.document), JSON.stringify(src!.fields)],
  );
  return { template_id: t.id, version_id: v.id };
}

export async function futureSession(tx: Tx, orgId: string, categoryId: string, venueId: string, title: string) {
  const [s] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at)
     values ($1, $2, 'ملخص', $3, 'introductory', now() + interval '3 days', 60, now() + interval '3 days 1 hour', $4, 40, 'published', now())
     returning id`,
    [orgId, title, categoryId, venueId],
  );
  return s.id;
}

export async function world(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  // The fixture's own certificates and documents pin the fixture's templates; start from none, as
  // certificates-designs.test.ts does, so the rows below are the only references.
  for (const t of ["certificates", "certificate_serial_counters", "export_artifacts", "session_posters", "design_documents"]) {
    await tx.q(`delete from public.${t}`);
  }
  await tx.q(`update public.sessions set certificate_mode = 'automatic' where org_id = any($1::uuid[])`, [[f.a.id, f.b.id]]);

  // The platform library as 0209 found it — live, for this transaction only.
  await tx.q(`alter table public.design_templates drop constraint design_templates_platform_retired`);
  const attendance = await livePlatform(tx, f.a.id, "certificate", "attendance", true, true);
  const attendancePortrait = await livePlatform(tx, f.a.id, "certificate", "attendance", false, false);
  const presenterPortrait = await livePlatform(tx, f.a.id, "certificate", "presenter", false, false);
  const talk = await livePlatform(tx, f.a.id, "poster", "talk", true, true);
  // One row nothing will name: the removal must DELETE it.
  const workshop = await livePlatform(tx, f.a.id, "poster", "workshop", true, true);

  const [issued] = await tx.q<{ id: string }>(`select id from public.issue_certificate($1, $2, 'attendance')`, [f.m2.a.completed, f.a.members[1].memberId]);
  const [cert] = await tx.q<{ id: string; template_version_id: string }>(
    `update public.certificates set template_version_id = $2 where id = $1 returning id, template_version_id`,
    [issued.id, attendance.version_id],
  );
  expect(cert.template_version_id).toBe(attendance.version_id);

  await tx.q(
    `insert into public.design_documents (org_id, template_version_id, purpose, document)
     values ($1, $2, 'poster', (select document from public.design_template_versions where id = $2))`,
    [f.a.id, talk.version_id],
  );

  const open = await futureSession(tx, f.a.id, f.a.categoryId, f.a.venueId, "جلسة بتصميم مفتوح");
  await tx.q(`insert into public.session_certificate_designs (org_id, session_id, kind, template_id, scheme) values ($1, $2, 'presenter', $3, 'dark')`, [
    f.a.id,
    open,
    presenterPortrait.template_id,
  ]);
  await tx.q(`insert into public.session_certificate_designs (org_id, session_id, kind, template_id, scheme) values ($1, $2, 'attendance', $3, 'light')`, [
    f.a.id,
    f.m2.a.completed,
    attendancePortrait.template_id,
  ]);

  return { f, cert, attendance, talk, presenterPortrait, attendancePortrait, workshop, open };
}
