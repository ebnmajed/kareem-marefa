// The world the platform library's removal meets — shared by templates-platform-removal and templates-read-narrowed.
// REQ-DSG-035, REQ-CRT-014, DEC-254 §3, DEC-255.
//
// A fixture whose org A holds, against PLATFORM rows: an issued certificate, a poster document, an UNLOCKED session
// design and a LOCKED one (a certificate of its kind issued — `set_certificate_design()`'s own rule, 0099:126-133).
// Then M1, so every org holds the baseline as its own.
//
// ★ HOW A «PRE-WAVE» CERTIFICATE IS MADE once M1 is in the chain (0205 – 0207). Every fixture org is seeded at insert, so
// `issue_certificate()` now resolves the ORG's attendance template — correctly. A certificate issued before the wave
// resolved the platform's, and production may hold such rows by the time M2 runs. So the certificate is issued through
// the product's own function (serial, code, the frozen name — all real) and then, as the owner, pointed at the platform
// version it would have pinned before M1. The one column that differs is the one the scenario is about.
import { expect } from "vitest";
import { applyProposed, type Tx } from "./db";
import { seed } from "./fixture";

export const M1 = ["designer/0007_seed_org_templates.sql", "designer/0008_org_templates_guard.sql", "designer/0009_org_templates_backfill.sql"];
export const M2 = "designer/0010_platform_library_removal.sql";
export const M2_POLICIES = "designer/0011_platform_rows_read.sql";

/** M1 under `proposed/`, or a no-op once the lead has promoted it (0205 – 0207). */
export async function m1(tx: Tx) {
  for (const file of M1) await applyProposed(tx, file);
}

/** The live platform composition of a family by orientation — the row an org with no template of its own resolved. */
export async function platform(tx: Tx, purpose: string, family: string, landscape = true) {
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
  await m1(tx);
  await tx.asOwner();
  // The fixture's own certificates and documents pin the fixture's templates; start from none, as
  // certificates-designs.test.ts does, so the rows below are the only references.
  for (const t of ["certificates", "certificate_serial_counters", "export_artifacts", "session_posters", "design_documents"]) {
    await tx.q(`delete from public.${t}`);
  }
  await tx.q(`update public.sessions set certificate_mode = 'automatic' where org_id = any($1::uuid[])`, [[f.a.id, f.b.id]]);

  const attendance = await platform(tx, "certificate", "attendance");
  const [issued] = await tx.q<{ id: string }>(`select id from public.issue_certificate($1, $2, 'attendance')`, [f.m2.a.completed, f.a.members[1].memberId]);
  const [cert] = await tx.q<{ id: string; template_version_id: string }>(
    `update public.certificates set template_version_id = $2 where id = $1 returning id, template_version_id`,
    [issued.id, attendance.version_id],
  );
  expect(cert.template_version_id).toBe(attendance.version_id);

  const talk = await platform(tx, "poster", "talk");
  await tx.q(
    `insert into public.design_documents (org_id, template_version_id, purpose, document)
     values ($1, $2, 'poster', (select document from public.design_template_versions where id = $2))`,
    [f.a.id, talk.version_id],
  );

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

  return { f, cert, attendance, talk, presenterPortrait, attendancePortrait, open };
}
