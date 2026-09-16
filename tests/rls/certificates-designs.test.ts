// The certificate design chosen for a session, and the scheme pinned on a
// certificate — DEC-128, DEC-148, REQ-CRT-001 … REQ-CRT-004, REQ-CRT-014.
//
// `supabase/proposed/designer/0003_certificate_designs.sql`, applied with
// applyProposed() inside each rolled-back transaction while it is proposed —
// and 0002 (the certificate library) with it, so the portrait compositions
// exist to be chosen. Once the lead promotes them, `supabase db reset` has
// applied both and the same cases run against the migrations.
//
// The properties this file exists for:
//
//   · automatic issuance has no human at issue time, so the design is chosen
//     BEFORE completion and issuance pins it: the template's latest published
//     version, and the scheme (REQ-CRT-014 needs both to reissue);
//   · no design is exactly the old behaviour — the family default, light;
//   · the design locks once a certificate has reached a member, and a held
//     one (review mode) can be redesigned, serial untouched;
//   · 0088's removed-check-in guard survives `issue_certificate()` being
//     re-created (DEC-141).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const INVALID = "22023";
const LOCKED = "55000";
const PROPOSED = ["designer/0002_certificate_library.sql", "designer/0003_certificate_designs.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  await tx.asOwner();
  for (const t of ["certificates", "certificate_serial_counters", "export_artifacts", "design_documents"]) {
    await tx.q(`delete from public.${t}`);
  }
  await tx.q(`delete from graphile_worker._private_jobs`);
  await tx.q(`update public.sessions set certificate_mode = 'automatic' where org_id = any($1::uuid[])`, [[f.a.id, f.b.id]]);
  return f;
}

/** The platform composition of a family, by its master. */
async function platform(tx: Tx, family: string, orientation: "landscape" | "portrait") {
  await tx.asOwner();
  const [row] = await tx.q<{ template_id: string; version_id: string }>(
    `select t.id as template_id, v.id as version_id
       from public.design_templates t
       join lateral (select id, document from public.design_template_versions v
                      where v.template_id = t.id and v.published_at is not null order by version desc limit 1) v on true
      where t.scope = 'platform' and t.purpose = 'certificate' and t.family = $1 and t.retired_at is null
        and ((v.document->'master'->>'width')::int >= (v.document->'master'->>'height')::int) = ($2 = 'landscape')
      order by t.is_default desc limit 1`,
    [family, orientation],
  );
  return row!;
}

const issue = (tx: Tx, sessionId: string, memberId: string, kind = "attendance") =>
  tx.q<{ id: string; state: string; serial: string; template_version_id: string; scheme: string }>(
    `select id, state, serial, template_version_id, scheme from public.issue_certificate($1, $2, $3::public.certificate_kind)`,
    [sessionId, memberId, kind],
  );

describe("POL-session_certificate_designs", () => {
  it("select_staff — the admin and the moderator read a session's design; a member and another org do not", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const portrait = await platform(tx, "attendance", "portrait");
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.set_certificate_design($1, 'attendance', $2, 'dark')`, [f.m2.a.completed, portrait.template_id]);

      const read = async () => tx.q<{ id: string }>(`select id from public.session_certificate_designs`);
      expect(await read()).toHaveLength(1);
      await tx.as(f.a.mod.claims);
      expect(await read()).toHaveLength(1);
      await tx.as(f.a.members[1].claims);
      expect(await read()).toHaveLength(0);
      await tx.as(f.b.admin.claims);
      expect(await read()).toHaveLength(0);
    });
  });

  it("no_write_grant — an authenticated insert is refused; the RPC is the only door", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const landscape = await platform(tx, "attendance", "landscape");
      await tx.as(f.a.admin.claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.session_certificate_designs (org_id, session_id, kind, template_id) values ($1, $2, 'attendance', $3)`, [
            f.a.id,
            f.m2.a.completed,
            landscape.template_id,
          ]),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("RPC-set_certificate_design", () => {
  it("admin — an admin sets and resets it, audited; a moderator is refused", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const portrait = await platform(tx, "attendance", "portrait");
      const landscape = await platform(tx, "attendance", "landscape");

      await tx.as(f.a.mod.claims);
      expect(await errorCode(() => tx.q(`select public.set_certificate_design($1, 'attendance', $2, 'dark')`, [f.m2.a.completed, portrait.template_id]))).toBe(
        PERMISSION_DENIED,
      );

      await tx.as(f.a.admin.claims);
      await tx.q(`select public.set_certificate_design($1, 'attendance', $2, 'dark')`, [f.m2.a.completed, portrait.template_id]);
      await tx.q(`select public.set_certificate_design($1, 'attendance', $2, 'light')`, [f.m2.a.completed, landscape.template_id]);

      await tx.asOwner();
      const rows = await tx.q<{ template_id: string; scheme: string }>(`select template_id, scheme from public.session_certificate_designs where session_id = $1`, [
        f.m2.a.completed,
      ]);
      expect(rows).toEqual([{ template_id: landscape.template_id, scheme: "light" }]);
      const audit = await tx.q<{ n: string }>(`select count(*)::text as n from public.audit_log where action = 'certificate.design_set' and subject_id = $1`, [
        f.m2.a.completed,
      ]);
      expect(audit[0]!.n).toBe("2");
    });
  });

  it("family_matches_kind — another family, a poster, a retired template or another org's is refused", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const presenter = await platform(tx, "presenter", "landscape");
      await tx.asOwner();
      const [poster] = await tx.q<{ id: string }>(`select id from public.design_templates where scope = 'platform' and purpose = 'poster' limit 1`);
      const [otherOrg] = await tx.q<{ id: string }>(
        `insert into public.design_templates (org_id, scope, purpose, family, name) values ($1, 'org', 'certificate', 'attendance', 'قالب مؤسسة أخرى') returning id`,
        [f.b.id],
      );
      await tx.q(`insert into public.design_template_versions (template_id, version, document, published_at)
                  select $1, 1, v.document, now() from public.design_template_versions v where v.template_id = $2 order by version desc limit 1`, [
        otherOrg!.id,
        presenter.template_id,
      ]);

      await tx.as(f.a.admin.claims);
      for (const template of [presenter.template_id, poster!.id, otherOrg!.id]) {
        expect(await errorCode(() => tx.q(`select public.set_certificate_design($1, 'attendance', $2, 'light')`, [f.m2.a.completed, template])), template).toBe(
          INVALID,
        );
      }
      // Achievement certificates have no session design.
      expect(
        await errorCode(() => tx.q(`select public.set_certificate_design($1, 'achievement', $2, 'light')`, [f.m2.a.completed, presenter.template_id])),
      ).toBe(INVALID);
    });
  });

  it("locked_after_issue — once a certificate of that kind is issued the design is refused; while held it may change", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const portrait = await platform(tx, "attendance", "portrait");
      const landscape = await platform(tx, "attendance", "landscape");

      await tx.q(`update public.sessions set certificate_mode = 'review' where id = $1`, [f.m2.a.completed]);
      const [held] = await issue(tx, f.m2.a.completed, f.a.members[1].memberId);
      expect(held!.state).toBe("held");

      await tx.as(f.a.admin.claims);
      await tx.q(`select public.set_certificate_design($1, 'attendance', $2, 'dark')`, [f.m2.a.completed, portrait.template_id]);

      await tx.q(`select public.release_certificates($1::uuid[])`, [[held!.id]]);
      expect(await errorCode(() => tx.q(`select public.set_certificate_design($1, 'attendance', $2, 'light')`, [f.m2.a.completed, landscape.template_id]))).toBe(
        LOCKED,
      );
      // The other kind is its own design, and is still open.
      const presenter = await platform(tx, "presenter", "portrait");
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.set_certificate_design($1, 'presenter', $2, 'light')`, [f.m2.a.completed, presenter.template_id]))).toBeNull();
    });
  });
});

describe("RPC-issue_certificate — the design, pinned", () => {
  it("pins_design — the chosen template's latest published version and its scheme", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const portrait = await platform(tx, "attendance", "portrait");
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.set_certificate_design($1, 'attendance', $2, 'dark')`, [f.m2.a.completed, portrait.template_id]);

      await tx.asOwner();
      const [cert] = await issue(tx, f.m2.a.completed, f.a.members[1].memberId);
      expect(cert).toMatchObject({ template_version_id: portrait.version_id, scheme: "dark", state: "issued" });

      // …and the worker reads the scheme it renders in.
      await tx.asServiceRole();
      const [ctx] = await tx.q<{ scheme: string; template_version_id: string }>(`select scheme, template_version_id from public.certificate_render_context($1)`, [
        cert!.id,
      ]);
      expect(ctx).toEqual({ scheme: "dark", template_version_id: portrait.version_id });
    });
  });

  it("no_design_is_default_light — the family default, and light: every certificate before wave 8", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const landscape = await platform(tx, "attendance", "landscape");
      await tx.asOwner();
      // No org template competes with the platform default here.
      await tx.q(`update public.design_templates set retired_at = now() where org_id = $1 and purpose = 'certificate'`, [f.a.id]);
      const [cert] = await issue(tx, f.m2.a.completed, f.a.members[1].memberId);
      expect(cert).toMatchObject({ template_version_id: landscape.version_id, scheme: "light" });
    });
  });

  it("no_check_in_when_removed — 0088's guard survives the re-creation (DEC-141)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $3, removal_reason = 'أُزيل للاختبار' where session_id = $1 and member_id = $2`, [
        f.m2.a.completed,
        f.a.members[1].memberId,
        f.a.admin.memberId,
      ]);
      expect(await errorCode(() => issue(tx, f.m2.a.completed, f.a.members[1].memberId))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("RPC-redesign_held_certificates", () => {
  it("held_only — re-pins the held certificates of a kind, re-enqueues each render with its key, and leaves issued ones alone", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const portrait = await platform(tx, "attendance", "portrait");
      const landscape = await platform(tx, "attendance", "landscape");

      await tx.q(`update public.sessions set certificate_mode = 'review' where id = $1`, [f.m2.a.completed]);
      const [held] = await issue(tx, f.m2.a.completed, f.a.members[1].memberId);
      expect(held).toMatchObject({ template_version_id: landscape.version_id, scheme: "light" });
      await tx.q(`delete from graphile_worker._private_jobs`);

      await tx.as(f.a.mod.claims);
      expect(await errorCode(() => tx.q(`select public.redesign_held_certificates($1, 'attendance')`, [f.m2.a.completed]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.admin.claims);
      // No design yet: nothing to apply.
      expect(await errorCode(() => tx.q(`select public.redesign_held_certificates($1, 'attendance')`, [f.m2.a.completed]))).toBe(INVALID);
      await tx.q(`select public.set_certificate_design($1, 'attendance', $2, 'dark')`, [f.m2.a.completed, portrait.template_id]);
      const [{ redesign_held_certificates: count }] = await tx.q<{ redesign_held_certificates: number }>(
        `select public.redesign_held_certificates($1, 'attendance')`,
        [f.m2.a.completed],
      );
      expect(count).toBe(1);

      await tx.asOwner();
      const [after] = await tx.q<{ template_version_id: string; scheme: string; serial: string; state: string }>(
        `select template_version_id, scheme, serial, state from public.certificates where id = $1`,
        [held!.id],
      );
      expect(after).toEqual({ template_version_id: portrait.version_id, scheme: "dark", serial: held!.serial, state: "held" });
      const jobs = await tx.q<{ key: string }>(`select key from graphile_worker.jobs where task_identifier = 'issue_certificates'`);
      expect(jobs.map((j) => j.key)).toEqual([`cert:${f.m2.a.completed}:${f.a.members[1].memberId}:attendance`]);
      const [audit] = await tx.q<{ n: string }>(`select count(*)::text as n from public.audit_log where action = 'certificate.redesigned'`);
      expect(audit!.n).toBe("1");

      // Released, it is no longer redesigned.
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.release_certificates($1::uuid[])`, [[held!.id]]);
      const [{ redesign_held_certificates: none }] = await tx.q<{ redesign_held_certificates: number }>(
        `select public.redesign_held_certificates($1, 'attendance')`,
        [f.m2.a.completed],
      );
      expect(none).toBe(0);
    });
  });

  it("record_certificate_document follows the pin — a redesigned held certificate's document is not refused by the locked-region guard", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const portrait = await platform(tx, "attendance", "portrait");
      await tx.q(`update public.sessions set certificate_mode = 'review' where id = $1`, [f.m2.a.completed]);
      const [held] = await issue(tx, f.m2.a.completed, f.a.members[1].memberId);

      await tx.asServiceRole();
      // The landscape document first, as the original issuance recorded it.
      const [{ document: landscapeDoc }] = await tx.q<{ document: unknown }>(`select template_document as document from public.certificate_render_context($1)`, [
        held!.id,
      ]);
      await tx.q(`select public.record_certificate_document($1, $2::jsonb)`, [held!.id, JSON.stringify(landscapeDoc)]);

      await tx.as(f.a.admin.claims);
      await tx.q(`select public.set_certificate_design($1, 'attendance', $2, 'dark')`, [f.m2.a.completed, portrait.template_id]);
      await tx.q(`select public.redesign_held_certificates($1, 'attendance')`, [f.m2.a.completed]);

      await tx.asServiceRole();
      const [{ document: portraitDoc }] = await tx.q<{ document: unknown }>(`select template_document as document from public.certificate_render_context($1)`, [
        held!.id,
      ]);
      expect(await errorCode(() => tx.q(`select public.record_certificate_document($1, $2::jsonb)`, [held!.id, JSON.stringify(portraitDoc)]))).toBeNull();
      await tx.asOwner();
      const [doc] = await tx.q<{ template_version_id: string }>(`select template_version_id from public.design_documents where bound_certificate_id = $1`, [held!.id]);
      expect(doc!.template_version_id).toBe(portrait.version_id);
    });
  });
});
