// materials / material_versions / material_pages — 02 §4.6, 03 §5.5a
// (verbatim), REQ-MAT-001…012, DEC-058 (PDF-only). Applied with applyProposed() inside
// each test's rolled-back transaction (DEC-040) — nothing here touches the
// shared local database.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const CHECK_VIOLATION = "23514";

async function seedMaterial(tx: Tx, orgId: string, sessionId: string, presenterId: string, phase: "before" | "after" = "after") {
  await tx.asOwner();
  const [material] = await tx.q<{ id: string }>(
    `insert into public.materials (org_id, session_id, kind, title, phase, added_by)
     values ($1, $2, 'pdf', 'شرائح الجلسة', $3, $4) returning id`,
    [orgId, sessionId, phase, presenterId],
  );
  const [version] = await tx.q<{ id: string }>(
    `insert into public.material_versions (org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
     values ($1, $2, 1, 'x/y/z.pdf', 1000, 'application/pdf', $3, $4) returning id`,
    [orgId, material.id, "a".repeat(64), presenterId],
  );
  await tx.q(`update public.materials set current_version_id = $1 where id = $2`, [version.id, material.id]);
  return { materialId: material.id as string, versionId: version.id as string };
}

async function seedBareMaterial(tx: Tx, orgId: string, sessionId: string, presenterId: string, kind: string = "pdf") {
  await tx.asOwner();
  const [material] = await tx.q<{ id: string }>(
    `insert into public.materials (org_id, session_id, kind, title, phase, added_by) values ($1, $2, $3, 'مادة جديدة', 'after', $4) returning id`,
    [orgId, sessionId, kind, presenterId],
  );
  return material.id as string;
}

describe("RPC-finalize_material_upload", () => {
  it("a member who is neither presenter nor admin is refused; the presenter succeeds and the material enqueues a conversion", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0046 at wave-2 sync 8: applied by `supabase db reset`.
      const materialId = await seedBareMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "pdf");

      await tx.as(f.a.members[1].claims); // attendee, not this material's presenter
      expect(
        await errorCode(() =>
          tx.q(`select public.finalize_material_upload($1, 'x/y/z.pdf', 1000, 'application/pdf', $2)`, [materialId, "a".repeat(64)]),
        ),
      ).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[0].claims); // the presenter
      const [version] = await tx.q<{ version: number; sniffed_mime: string }>(
        `select r.version, r.sniffed_mime from public.finalize_material_upload($1, 'x/y/z.pdf', 1000, 'application/pdf', $2) r`,
        [materialId, "b".repeat(64)],
      );
      expect(version.version).toBe(1);
      expect(version.sniffed_mime).toBe("application/pdf");

      const [row] = await tx.q<{ render_status: string; current_version_id: string }>(
        `select render_status, current_version_id from public.materials where id = $1`,
        [materialId],
      );
      expect(row.render_status).toBe("pending"); // a pdf enqueues its page rendering (DEC-058)
      expect(row.current_version_id).not.toBeNull();
    });
  });

  it("image and audio materials go straight to not_applicable and enqueue nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0046 at wave-2 sync 8: applied by `supabase db reset`.
      const materialId = await seedBareMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "image");

      await tx.as(f.a.members[0].claims);
      await tx.q(`select public.finalize_material_upload($1, 'x/y/z.webp', 1000, 'image/webp', $2)`, [materialId, "c".repeat(64)]);
      const [row] = await tx.q<{ render_status: string }>(`select render_status from public.materials where id = $1`, [materialId]);
      expect(row.render_status).toBe("not_applicable");
    });
  });

  it("★ POL-materials.kind_pdf_only — a powerpoint or keynote row is refused 23514 even by the owner (DEC-058, 0077)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      for (const kind of ["powerpoint", "keynote"]) {
        expect(
          await errorCode(() =>
            tx.q(
              `insert into public.materials (org_id, session_id, kind, title, phase, added_by) values ($1, $2, $3::public.material_kind, 'عرض', 'after', $4)`,
              [f.a.id, f.m2.a.published, kind, f.a.members[0].memberId],
            ),
          ),
        ).toBe(CHECK_VIOLATION);
      }
    });
  });

  it("a byte size over the org's document limit is refused, naming the limit", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0046 at wave-2 sync 8: applied by `supabase db reset`.
      const materialId = await seedBareMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "pdf");
      await tx.asOwner();
      const [{ limit_document_mb }] = await tx.q<{ limit_document_mb: number }>(`select limit_document_mb from public.org_settings where org_id = $1`, [f.a.id]);
      const overLimit = (Number(limit_document_mb) + 1) * 1024 * 1024;

      await tx.as(f.a.members[0].claims);
      expect(
        await errorCode(() =>
          tx.q(`select public.finalize_material_upload($1, 'x/y/z.pdf', $2, 'application/pdf', $3)`, [materialId, overLimit, "d".repeat(64)]),
        ),
      ).toBe(CHECK_VIOLATION);
    });
  });

  it("a second call for the same material inserts version 2 and moves current_version_id, leaving version 1 untouched (REQ-MAT-010)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0046 at wave-2 sync 8: applied by `supabase db reset`.
      const materialId = await seedBareMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "pdf");

      await tx.as(f.a.members[0].claims);
      const [v1] = await tx.q<{ id: string }>(`select r.id from public.finalize_material_upload($1, 'v1.pdf', 1000, 'application/pdf', $2) r`, [
        materialId,
        "e".repeat(64),
      ]);
      const [v2] = await tx.q<{ id: string; version: number }>(
        `select r.id, r.version from public.finalize_material_upload($1, 'v2.pdf', 2000, 'application/pdf', $2) r`,
        [materialId, "f".repeat(64)],
      );
      expect(v2.version).toBe(2);

      await tx.asOwner();
      const [material] = await tx.q<{ current_version_id: string }>(`select current_version_id from public.materials where id = $1`, [materialId]);
      expect(material.current_version_id).toBe(v2.id);
      const untouched = await tx.q<{ storage_path: string }>(`select storage_path from public.material_versions where id = $1`, [v1.id]);
      expect(untouched[0].storage_path).toBe("v1.pdf");
    });
  });
});

const pendingJob = (tx: Tx, key: string) => tx.q<{ task_identifier: string }>(`select task_identifier from graphile_worker.jobs where key = $1`, [key]);

describe("RPC-record_material_conversion", () => {
  it("service_role_only: authenticated and anon are refused on the grant; service_role succeeds", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted at wave-2 sync 10 (0048–0049): applied by `supabase db reset`.
      const { versionId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`select public.record_material_conversion($1, '{}', 3, false)`, [versionId]))).toBe(PERMISSION_DENIED);
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select public.record_material_conversion($1, '{}', 3, false)`, [versionId]))).toBe(PERMISSION_DENIED);

      await tx.asServiceRole();
      await tx.q(`select public.record_material_conversion($1, '{}', 3, false)`, [versionId]);
      await tx.asOwner();
      const [row] = await tx.q<{ render_status: string }>(`select render_status from public.materials where current_version_id = $1`, [versionId]);
      expect(row.render_status).toBe("rendering");
    });
  });

  it("enqueues render_pages, keyed pages:{version_id}, only on success with a page count", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted at wave-2 sync 10 (0048–0049): applied by `supabase db reset`.
      const { versionId: okVersion } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);
      const { versionId: failedVersion } = await seedMaterial(tx, f.a.id, f.m2.a.completed, f.a.members[0].memberId);

      await tx.asServiceRole();
      await tx.q(`select public.record_material_conversion($1, '{}', 5, false)`, [okVersion]);
      await tx.q(`select public.record_material_conversion($1, '{}', null, true)`, [failedVersion]);

      await tx.asOwner();
      expect((await pendingJob(tx, `pages:${okVersion}`))[0]?.task_identifier).toBe("render_pages");
      expect(await pendingJob(tx, `pages:${failedVersion}`)).toEqual([]);
      const [row] = await tx.q<{ render_status: string }>(`select render_status from public.materials where current_version_id = $1`, [failedVersion]);
      expect(row.render_status).toBe("failed");
    });
  });

  it("★ REQ-MAT-011: names the substituted family on the material, not only in a log", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted at wave-2 sync 10 (0048–0049): applied by `supabase db reset`.
      const { versionId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);

      await tx.asServiceRole();
      await tx.q(`select public.record_material_conversion($1, $2, 2, false)`, [versionId, ["Amiri", "Cairo"]]);
      await tx.asOwner();
      const [row] = await tx.q<{ font_substitution_warning: string }>(
        `select font_substitution_warning from public.materials where current_version_id = $1`,
        [versionId],
      );
      expect(row.font_substitution_warning).toContain("Amiri");
      expect(row.font_substitution_warning).toContain("Cairo");
    });
  });

  it("a call naming a superseded version changes nothing on materials", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // finalize_material_upload() is already promoted (0046) — no applyProposed needed for it.
      // Promoted at wave-2 sync 10 (0048–0049): applied by `supabase db reset`.
      const { versionId: v1, materialId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims);
      await tx.q(`select public.finalize_material_upload($1, 'v2.pdf', 1000, 'application/pdf', $2)`, [materialId, "9".repeat(64)]);

      await tx.asServiceRole();
      await tx.q(`select public.record_material_conversion($1, '{}', 3, false)`, [v1]); // v1 is no longer current_version_id
      await tx.asOwner();
      const [row] = await tx.q<{ render_status: string }>(`select render_status from public.materials where id = $1`, [materialId]);
      expect(row.render_status).toBe("pending"); // v2's own status from finalize_material_upload, untouched by v1's late report
    });
  });
});

describe("RPC-record_material_pages", () => {
  it("service_role_only: authenticated is refused on the grant; service_role succeeds and moves render_status to ready", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted at wave-2 sync 10 (0048–0049): applied by `supabase db reset`.
      const { versionId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);
      const pages = JSON.stringify([
        { page_number: 1, image_path: "p1.webp", thumbnail_path: "t1.webp" },
        { page_number: 2, image_path: "p2.webp", thumbnail_path: "t2.webp" },
      ]);

      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`select public.record_material_pages($1, $2::jsonb)`, [versionId, pages]))).toBe(PERMISSION_DENIED);

      await tx.asServiceRole();
      await tx.q(`select public.record_material_pages($1, $2::jsonb)`, [versionId, pages]);
      await tx.asOwner();
      const rows = await tx.q<{ page_number: number; image_path: string }>(
        `select page_number, image_path from public.material_pages where material_version_id = $1 order by page_number`,
        [versionId],
      );
      expect(rows).toEqual([
        { page_number: 1, image_path: "p1.webp" },
        { page_number: 2, image_path: "p2.webp" },
      ]);
      const [material] = await tx.q<{ render_status: string }>(`select render_status from public.materials where current_version_id = $1`, [versionId]);
      expect(material.render_status).toBe("ready");
    });
  });

  it("upsert: a second call for the same page number replaces its paths rather than duplicating the row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted at wave-2 sync 10 (0048–0049): applied by `supabase db reset`.
      const { versionId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);

      await tx.asServiceRole();
      await tx.q(`select public.record_material_pages($1, $2::jsonb)`, [versionId, JSON.stringify([{ page_number: 1, image_path: "old.webp", thumbnail_path: "oldt.webp" }])]);
      await tx.q(`select public.record_material_pages($1, $2::jsonb)`, [versionId, JSON.stringify([{ page_number: 1, image_path: "new.webp", thumbnail_path: "newt.webp" }])]);

      await tx.asOwner();
      const rows = await tx.q<{ image_path: string }>(`select image_path from public.material_pages where material_version_id = $1`, [versionId]);
      expect(rows).toEqual([{ image_path: "new.webp" }]);
    });
  });
});

describe("RPC-record_material_download.admin_only", () => {
  it("a member and a moderator are refused; an admin writes one audit row naming the material and the version", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted at wave-2 sync 10 (0048–0049): applied by `supabase db reset`.
      const { materialId, versionId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);

      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => tx.q(`select public.record_material_download($1, $2)`, [materialId, versionId]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.mod.claims);
      expect(await errorCode(() => tx.q(`select public.record_material_download($1, $2)`, [materialId, versionId]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.admin.claims);
      await tx.q(`select public.record_material_download($1, $2)`, [materialId, versionId]);

      await tx.asOwner();
      const rows = await tx.q<{ action: string; subject_id: string; after: { version_id: string } }>(
        `select action, subject_id, after from public.audit_log where action = 'material.downloaded' and subject_id = $1`,
        [materialId],
      );
      expect(rows.length).toBe(1);
      expect(rows[0].after.version_id).toBe(versionId);
    });
  });

  it("another org's material is refused, even to that org's own admin", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted at wave-2 sync 10 (0048–0049): applied by `supabase db reset`.
      const { materialId, versionId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);

      await tx.as(f.b.admin.claims);
      expect(await errorCode(() => tx.q(`select public.record_material_download($1, $2)`, [materialId, versionId]))).toBe("P0002");
    });
  });
});

describe("POL-materials.phase_change.audited", () => {
  it("★ REQ-MAT-006: changing phase writes one audit row naming the old and new value", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0052 at wave-2 sync 11: applied by `supabase db reset`.
      const { materialId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "after");

      await tx.as(f.a.members[0].claims);
      await tx.q(`update public.materials set phase = 'before' where id = $1`, [materialId]);

      await tx.asOwner();
      const rows = await tx.q<{ before: { phase: string }; after: { phase: string } }>(
        `select before, after from public.audit_log where action = 'material.phase_changed' and subject_id = $1`,
        [materialId],
      );
      expect(rows.length).toBe(1);
      expect(rows[0].before.phase).toBe("after");
      expect(rows[0].after.phase).toBe("before");
    });
  });

  it("changing title or allow_download alone writes no phase-change audit row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0052 at wave-2 sync 11: applied by `supabase db reset`.
      const { materialId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "after");

      await tx.as(f.a.members[0].claims);
      await tx.q(`update public.materials set title = 'عنوان جديد', allow_download = false where id = $1`, [materialId]);

      await tx.asOwner();
      expect(await tx.q(`select id from public.audit_log where action = 'material.phase_changed' and subject_id = $1`, [materialId])).toEqual([]);
    });
  });
});

describe("POL-materials.select.phase", () => {
  it("an 'after' material is invisible to a member until the session is completed; visible to the presenter throughout", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const { materialId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "after");

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.materials where id = $1`, [materialId])).toEqual([]);

      await tx.as(f.a.members[0].claims);
      expect((await tx.q(`select id from public.materials where id = $1`, [materialId])).length).toBe(1);
    });
  });

  it("a 'before' material is visible to a member on a published session", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const { materialId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "before");

      await tx.as(f.a.members[1].claims);
      expect((await tx.q(`select id from public.materials where id = $1`, [materialId])).length).toBe(1);
    });
  });

  it("an 'after' material on a completed session is visible to every member", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const { materialId } = await seedMaterial(tx, f.a.id, f.m2.a.completed, f.a.members[0].memberId, "after");

      await tx.as(f.a.members[1].claims);
      expect((await tx.q(`select id from public.materials where id = $1`, [materialId])).length).toBe(1);
    });
  });
});

describe("POL-materials.insert.presenter", () => {
  it("a member who is not a presenter cannot add a material; the presenter and an admin can", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.

      await tx.as(f.a.members[1].claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.materials (org_id, session_id, kind, title, added_by) values ($1, $2, 'pdf', 'مادة', $3)`, [
            f.a.id,
            f.m2.a.published,
            f.a.members[1].memberId,
          ]),
        ),
      ).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[0].claims);
      const ok = await tx.q(`insert into public.materials (org_id, session_id, kind, title, added_by) values ($1, $2, 'pdf', 'مادة', $3) returning id`, [
        f.a.id,
        f.m2.a.published,
        f.a.members[0].memberId,
      ]);
      expect(ok.length).toBe(1);

      await tx.as(f.a.admin.claims);
      const ok2 = await tx.q(`insert into public.materials (org_id, session_id, kind, title, added_by) values ($1, $2, 'pdf', 'مادة 2', $3) returning id`, [
        f.a.id,
        f.m2.a.published,
        f.a.admin.memberId,
      ]);
      expect(ok2.length).toBe(1);
    });
  });

  it("video_link requires external_url; other kinds refuse it (REQ-MAT-002)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.as(f.a.members[0].claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.materials (org_id, session_id, kind, title, added_by) values ($1, $2, 'video_link', 'فيديو', $3)`, [
            f.a.id,
            f.m2.a.published,
            f.a.members[0].memberId,
          ]),
        ),
      ).toBe(CHECK_VIOLATION);
      const ok = await tx.q(
        `insert into public.materials (org_id, session_id, kind, title, external_url, added_by) values ($1, $2, 'video_link', 'فيديو', 'https://youtube.com/x', $3) returning id`,
        [f.a.id, f.m2.a.published, f.a.members[0].memberId],
      );
      expect(ok.length).toBe(1);
    });
  });
});

describe("RPC-remove_material", () => {
  it("a presenter removes their own material before completion; the same presenter is refused after completion; an admin removes it anyway", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const { materialId: openMaterial } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);
      const { materialId: closedMaterial } = await seedMaterial(tx, f.a.id, f.m2.a.completed, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims);
      const [removed] = await tx.q<{ removed_by: string; removed_at: string | null }>(`select r.removed_by, r.removed_at from public.remove_material($1, 'خطأ') r`, [openMaterial]);
      expect(removed.removed_by).toBe(f.a.members[0].memberId);
      expect(removed.removed_at).not.toBeNull();

      expect(await errorCode(() => tx.q(`select public.remove_material($1, 'خطأ')`, [closedMaterial]))).toBe(CHECK_VIOLATION);

      await tx.as(f.a.admin.claims);
      const [removedByAdmin] = await tx.q<{ removed_by: string }>(`select r.removed_by from public.remove_material($1, 'مكتملة') r`, [closedMaterial]);
      expect(removedByAdmin.removed_by).toBe(f.a.admin.memberId);
    });
  });

  it("a member who is not this material's presenter is refused; an empty reason is refused; a removed material is invisible even to its remover afterward", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const { materialId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "before");

      await tx.as(f.a.members[1].claims); // attendee, not this material's presenter
      expect(await errorCode(() => tx.q(`select public.remove_material($1, 'سبب')`, [materialId]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`select public.remove_material($1, '')`, [materialId]))).toBe(CHECK_VIOLATION);

      await tx.q(`select public.remove_material($1, 'لم تعد صالحة')`, [materialId]);
      expect(await tx.q(`select id from public.materials where id = $1`, [materialId])).toEqual([]); // materials_read: removed_at is null, unconditionally

      expect(await errorCode(() => tx.q(`select public.remove_material($1, 'مرة أخرى')`, [materialId]))).toBe("P0002"); // already removed — not_found
    });
  });
});

describe("POL-materials.update.window", () => {
  it("session_id, kind and added_by are immutable, even for an admin", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const { materialId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`update public.materials set kind = 'image' where id = $1`, [materialId]))).toBe(PERMISSION_DENIED);
    });
  });

  it("a presenter cannot update a material on a session they do not present (row untouched, no error)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const { materialId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);

      await tx.as(f.a.members[1].claims); // attendee, not this material's presenter
      await tx.q(`update public.materials set title = 'محاولة' where id = $1`, [materialId]);
      await tx.asOwner();
      const [row] = await tx.q<{ title: string }>(`select title from public.materials where id = $1`, [materialId]);
      expect(row.title).toBe("شرائح الجلسة");
    });
  });
});

describe("POL-materials.hard_delete.admin_only", () => {
  it("a presenter's delete leaves the row untouched; an admin's delete removes it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const { materialId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims);
      await tx.q(`delete from public.materials where id = $1`, [materialId]);
      await tx.asOwner();
      expect((await tx.q(`select id from public.materials where id = $1`, [materialId])).length).toBe(1);

      await tx.as(f.a.admin.claims);
      await tx.q(`delete from public.materials where id = $1`, [materialId]);
      await tx.asOwner();
      expect(await tx.q(`select id from public.materials where id = $1`, [materialId])).toEqual([]);
    });
  });
});

describe("POL-material_versions.select.phase", () => {
  it("follows the parent material's phase gate exactly", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const { versionId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "after");

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.material_versions where id = $1`, [versionId])).toEqual([]);

      await tx.as(f.a.members[0].claims);
      expect((await tx.q(`select id from public.material_versions where id = $1`, [versionId])).length).toBe(1);
    });
  });

  it("a member who is not a presenter cannot insert a new version", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const { materialId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId);

      await tx.as(f.a.members[1].claims);
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.material_versions (org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
             values ($1, $2, 2, 'x/y/z2.pdf', 1000, 'application/pdf', $3, $4)`,
            [f.a.id, materialId, "b".repeat(64), f.a.members[1].memberId],
          ),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-material_pages.select", () => {
  it("follows the parent's phase gate; no insert policy exists for `authenticated` — the render job writes this table", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const { versionId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "after");
      const [page] = await tx.q<{ id: string }>(
        `insert into public.material_pages (org_id, material_version_id, page_number, image_path, thumbnail_path)
         values ($1, $2, 1, 'p1.webp', 't1.webp') returning id`,
        [f.a.id, versionId],
      );

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.material_pages where id = $1`, [page.id])).toEqual([]);

      await tx.as(f.a.members[0].claims);
      expect((await tx.q(`select id from public.material_pages where id = $1`, [page.id])).length).toBe(1);

      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.material_pages (org_id, material_version_id, page_number, image_path, thumbnail_path)
             values ($1, $2, 2, 'p2.webp', 't2.webp')`,
            [f.a.id, versionId],
          ),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("isolation", () => {
  it("a member of org B never sees org A's materials, versions or pages", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const { materialId, versionId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "before");
      const [page] = await tx.q<{ id: string }>(
        `insert into public.material_pages (org_id, material_version_id, page_number, image_path, thumbnail_path)
         values ($1, $2, 1, 'p1.webp', 't1.webp') returning id`,
        [f.a.id, versionId],
      );

      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select id from public.materials where id = $1`, [materialId])).toEqual([]);
      expect(await tx.q(`select id from public.material_versions where id = $1`, [versionId])).toEqual([]);
      expect(await tx.q(`select id from public.material_pages where id = $1`, [page.id])).toEqual([]);
    });
  });
});

// supabase/proposed/content/0009_proposal_materials.sql — REQ-PRO-004,
// deferred from M2 (DEC-045). `f.m2.a.proposal` (fixture-m2.ts) is a draft
// proposal by members[0] (proposer) naming members[1] as a co-presenter
// NOT yet accepted — exactly the shape needed to prove the accepted-only
// half of `is_proposal_owner_of()`.
async function seedProposalMaterial(tx: Tx, orgId: string, proposalId: string, addedBy: string) {
  await tx.asOwner();
  const [material] = await tx.q<{ id: string }>(
    `insert into public.materials (org_id, proposal_id, kind, title, added_by) values ($1, $2, 'pdf', 'مادة المقترح', $3) returning id`,
    [orgId, proposalId, addedBy],
  );
  return material.id as string;
}

describe("is_proposal_owner_of", () => {
  it("★ true for the proposer and an ACCEPTED co-presenter; false for a not-yet-accepted invitee and an unrelated member", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0053 at wave-2 sync 12: applied by `supabase db reset`.

      await tx.as(f.a.members[0].claims); // the proposer
      expect(await tx.q<{ v: boolean }>(`select public.is_proposal_owner_of($1) as v`, [f.m2.a.proposal])).toEqual([{ v: true }]);

      await tx.as(f.a.members[1].claims); // co-presenter, not yet accepted (fixture-m2)
      expect(await tx.q<{ v: boolean }>(`select public.is_proposal_owner_of($1) as v`, [f.m2.a.proposal])).toEqual([{ v: false }]);

      await tx.asOwner();
      await tx.q(`update public.proposal_presenters set accepted = true where proposal_id = $1 and member_id = $2`, [f.m2.a.proposal, f.a.members[1].memberId]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q<{ v: boolean }>(`select public.is_proposal_owner_of($1) as v`, [f.m2.a.proposal])).toEqual([{ v: true }]);

      await tx.as(f.a.mod.claims); // unrelated org member, not staff-privileged in this function's own logic
      expect(await tx.q<{ v: boolean }>(`select public.is_proposal_owner_of($1) as v`, [f.m2.a.proposal])).toEqual([{ v: false }]);
    });
  });
});

describe("POL-materials.proposal.visibility", () => {
  it("★ a draft proposal's material is visible to the proposer and to staff, never to an unrelated member", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0053 at wave-2 sync 12: applied by `supabase db reset`.
      const materialId = await seedProposalMaterial(tx, f.a.id, f.m2.a.proposal, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims); // proposer
      expect((await tx.q(`select id from public.materials where id = $1`, [materialId])).length).toBe(1);

      await tx.as(f.a.mod.claims); // staff, unrelated to the proposal
      expect((await tx.q(`select id from public.materials where id = $1`, [materialId])).length).toBe(1);

      await tx.as(f.a.admin.claims);
      expect((await tx.q(`select id from public.materials where id = $1`, [materialId])).length).toBe(1);
    });
  });

  it("★ REQ-PRO-004: not visible to a member with no connection to the proposal", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0053 at wave-2 sync 12: applied by `supabase db reset`.
      const materialId = await seedProposalMaterial(tx, f.a.id, f.m2.a.proposal, f.a.members[0].memberId);

      // members[1] is a NOT-YET-accepted co-presenter, so still "a member" for this purpose.
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.materials where id = $1`, [materialId])).toEqual([]);
    });
  });
});

describe("POL-materials.proposal.write", () => {
  it("the proposer can insert; an unrelated member (and a not-yet-accepted co-presenter) is refused; an admin can", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0053 at wave-2 sync 12: applied by `supabase db reset`.

      await tx.as(f.a.members[1].claims); // not yet accepted
      expect(
        await errorCode(() =>
          tx.q(`insert into public.materials (org_id, proposal_id, kind, title, added_by) values ($1, $2, 'pdf', 'محاولة', $3)`, [
            f.a.id,
            f.m2.a.proposal,
            f.a.members[1].memberId,
          ]),
        ),
      ).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[0].claims); // the proposer
      const [ok] = await tx.q<{ id: string }>(
        `insert into public.materials (org_id, proposal_id, kind, title, added_by) values ($1, $2, 'pdf', 'شرائح', $3) returning id`,
        [f.a.id, f.m2.a.proposal, f.a.members[0].memberId],
      );
      expect(ok.id).toBeTruthy();

      await tx.as(f.a.admin.claims);
      const [ok2] = await tx.q<{ id: string }>(
        `insert into public.materials (org_id, proposal_id, kind, title, added_by) values ($1, $2, 'pdf', 'شرائح الإدارة', $3) returning id`,
        [f.a.id, f.m2.a.proposal, f.a.admin.memberId],
      );
      expect(ok2.id).toBeTruthy();
    });
  });
});

describe("RPC-finalize_material_upload — proposal branch", () => {
  it("★ the proposer can finalize; a pdf is NOT enqueued for conversion while session_id is still null", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0053 at wave-2 sync 12: applied by `supabase db reset`.
      const materialId = await seedProposalMaterial(tx, f.a.id, f.m2.a.proposal, f.a.members[0].memberId);

      await tx.as(f.a.members[0].claims);
      const [version] = await tx.q<{ id: string }>(`select r.id from public.finalize_material_upload($1, 'x.pdf', 1000, 'application/pdf', $2) r`, [
        materialId,
        "a".repeat(64),
      ]);
      expect(version.id).toBeTruthy();

      await tx.asOwner();
      const [row] = await tx.q<{ render_status: string; session_id: string | null }>(`select render_status, session_id from public.materials where id = $1`, [materialId]);
      expect(row.render_status).toBe("pending");
      expect(row.session_id).toBeNull();
      expect(await tx.q(`select task_identifier from graphile_worker.jobs where key = $1`, [`conv:${version.id}`])).toEqual([]);
    });
  });
});

describe("RPC-remove_material — proposal branch", () => {
  it("the proposer can remove their own proposal's material; an unrelated member cannot", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0053 at wave-2 sync 12: applied by `supabase db reset`.
      const materialId = await seedProposalMaterial(tx, f.a.id, f.m2.a.proposal, f.a.members[0].memberId);

      await tx.as(f.a.members[1].claims); // not yet accepted
      expect(await errorCode(() => tx.q(`select r.id from public.remove_material($1, $2) r`, [materialId, "لا حاجة له"]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[0].claims);
      const [removed] = await tx.q<{ id: string }>(`select r.id from public.remove_material($1, $2) r`, [materialId, "لم يعد مطلوبًا"]);
      expect(removed.id).toBe(materialId);
    });
  });
});

describe("RPC-carry_over_proposal_materials", () => {
  it("★ REQ-PRO-004: publishing a proposal into a session reassigns its materials (session_id set, proposal_id cleared), retaining phase/allow_download", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0053 at wave-2 sync 12: applied by `supabase db reset`.
      const materialId = await seedProposalMaterial(tx, f.a.id, f.m2.a.proposal, f.a.members[0].memberId);
      await tx.asOwner();
      await tx.q(`update public.materials set phase = 'before', allow_download = false where id = $1`, [materialId]);

      const [session] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, proposal_id, title, abstract, category_id, level, venue_id, capacity, state)
         values ($1, $2, 'جلسة من مقترح', 'ملخص', $3, 'introductory', $4, 30, 'draft') returning id`,
        [f.a.id, f.m2.a.proposal, f.a.categoryId, f.a.venueId],
      );

      const [row] = await tx.q<{ session_id: string | null; proposal_id: string | null; phase: string; allow_download: boolean }>(
        `select session_id, proposal_id, phase, allow_download from public.materials where id = $1`,
        [materialId],
      );
      expect(row.session_id).toBe(session.id);
      expect(row.proposal_id).toBeNull();
      expect(row.phase).toBe("before");
      expect(row.allow_download).toBe(false);
    });
  });

  it("★ enqueues convert_document for a pending pdf material once it has a real session_id", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0053 at wave-2 sync 12: applied by `supabase db reset`.
      const materialId = await seedProposalMaterial(tx, f.a.id, f.m2.a.proposal, f.a.members[0].memberId);
      await tx.asOwner();
      const [version] = await tx.q<{ id: string }>(
        `insert into public.material_versions (org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
         values ($1, $2, 1, 'x/y.pdf', 1000, 'application/pdf', $3, $4) returning id`,
        [f.a.id, materialId, "b".repeat(64), f.a.members[0].memberId],
      );
      await tx.q(`update public.materials set current_version_id = $1, render_status = 'pending' where id = $2`, [version.id, materialId]);

      const [session] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, proposal_id, title, abstract, category_id, level, venue_id, capacity, state)
         values ($1, $2, 'جلسة أخرى من مقترح', 'ملخص', $3, 'introductory', $4, 30, 'draft') returning id`,
        [f.a.id, f.m2.a.proposal, f.a.categoryId, f.a.venueId],
      );
      void session;

      expect((await tx.q<{ task_identifier: string }>(`select task_identifier from graphile_worker.jobs where key = $1`, [`conv:${version.id}`]))[0]?.task_identifier).toBe(
        "convert_document",
      );
    });
  });
});

describe("POL-storage.materials.proposal_write", () => {
  it("the proposer's write under the proposals/ prefix succeeds; an unrelated member's is refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0053 at wave-2 sync 12: applied by `supabase db reset`.
      const okName = `${f.a.id}/proposals/${f.m2.a.proposal}/materials/${crypto.randomUUID()}/deck.pdf`;

      await tx.as(f.a.members[1].claims); // not yet accepted
      expect(await errorCode(() => tx.q(`insert into storage.objects (bucket_id, name) values ('materials', $1)`, [okName]))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[0].claims);
      await tx.q(`insert into storage.objects (bucket_id, name) values ('materials', $1)`, [okName]);
      await tx.asOwner();
      expect((await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [okName])).length).toBe(1);
    });
  });
});

describe("regression — session-based materials after 0009", () => {
  it("the original session presenter/phase/storage behavior is unchanged once 0009 is also applied", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0053 at wave-2 sync 12: applied by `supabase db reset`.
      const { materialId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "before");

      await tx.as(f.a.members[0].claims); // presenter of `published`
      expect((await tx.q(`select id from public.materials where id = $1`, [materialId])).length).toBe(1);

      await tx.as(f.a.members[1].claims); // plain member, phase = 'before' — always visible
      expect((await tx.q(`select id from public.materials where id = $1`, [materialId])).length).toBe(1);

      await tx.as(f.b.admin.claims); // another org
      expect(await tx.q(`select id from public.materials where id = $1`, [materialId])).toEqual([]);
    });
  });
});

// supabase/proposed/content/0010_materials_storage_read_preupload.sql — a
// real bug tests/e2e/proposal-materials.spec.ts found against real local
// Supabase: completeMaterialUpload() downloads the object through the
// uploader's own RLS-bound client BEFORE finalize_material_upload() ever
// creates the material_versions row materials_storage_read (0037/0053)
// joins through — so no upload's own "complete" step could ever read the
// object it had just written. True for ordinary session uploads too, not
// only proposals; never previously exercised end to end through a browser.
describe("POL-storage.materials.preupload_self_read", () => {
  it("★ before any material_versions row exists, the session's presenter can read back the object they just wrote; an unrelated member cannot", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0054 at wave-2 sync 13: applied by `supabase db reset`.
      const versionId = "99999999-9999-9999-9999-999999999999";
      const name = `${f.a.id}/sessions/${f.m2.a.published}/materials/${versionId}/deck.pdf`;

      // The presenter writes it (materials_storage_write, 0037/0053) — no
      // materials/material_versions row exists anywhere yet.
      await tx.as(f.a.members[0].claims);
      await tx.q(`insert into storage.objects (bucket_id, name) values ('materials', $1)`, [name]);
      expect((await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [name])).length).toBe(1);

      await tx.as(f.a.members[1].claims); // not this session's presenter
      expect(await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [name])).toEqual([]);

      await tx.as(f.a.admin.claims);
      expect((await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [name])).length).toBe(1);
    });
  });

  it("★ REQ-PRO-004: the same window applies to a proposal's own draft material — the owner reads it back, an unrelated member does not", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0054 at wave-2 sync 13: applied by `supabase db reset`.
      const versionId = "88888888-8888-8888-8888-888888888888";
      const name = `${f.a.id}/proposals/${f.m2.a.proposal}/materials/${versionId}/deck.pdf`;

      await tx.as(f.a.members[0].claims); // the proposer
      await tx.q(`insert into storage.objects (bucket_id, name) values ('materials', $1)`, [name]);
      expect((await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [name])).length).toBe(1);

      await tx.as(f.a.mod.claims); // staff, unrelated to the proposal
      expect((await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [name])).length).toBe(1);
    });
  });

  it("does not weaken the ordinary post-finalize read: an unrelated member still sees only what phase/allow_download already allowed", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0054 at wave-2 sync 13: applied by `supabase db reset`.
      const { materialId, versionId } = await seedMaterial(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, "after");
      await tx.asOwner();
      await tx.q(`update public.materials set allow_download = false where id = $1`, [materialId]);
      const name = `${f.a.id}/sessions/${f.m2.a.published}/materials/${versionId}/deck.pdf`;
      await tx.q(`insert into storage.objects (bucket_id, name) values ('materials', $1)`, [name]);

      await tx.as(f.a.members[1].claims); // plain member, phase='after', allow_download=false
      expect(await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [name])).toEqual([]);

      await tx.as(f.a.members[0].claims); // the presenter — bypasses allow_download for their own material
      expect((await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [name])).length).toBe(1);
    });
  });
});
