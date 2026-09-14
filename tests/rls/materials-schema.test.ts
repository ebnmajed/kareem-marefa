// materials / material_versions / material_pages — 02 §4.6, 03 §5.5a
// (verbatim), REQ-MAT-001…012, DEC-006. Applied with applyProposed() inside
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
      const ok2 = await tx.q(`insert into public.materials (org_id, session_id, kind, title, added_by) values ($1, $2, 'pdf', 'مادة ٢', $3) returning id`, [
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
