// content, wave 9 (DEC-119, DEC-120, DEC-121, DEC-150) — T3: materials_storage_read's day-scoped
// release, the twin of materials-days.test.ts's table-level policy — and its three dependants
// (material_versions_read, material_pages_read, material_pages_storage_read), which carry their
// own copy of the SAME phase gate (0037) and were found broken by this file's first draft: the
// material row and its source file were visible once the fix landed, but the version row was
// not, because material_versions_read still applied the old, un-day-aware gate. New behaviour,
// new file (rule 4) — storage-content.test.ts is untouched. "A row readable whose object is not
// is wave 2's 0054 bug again" (this track's own rule), so this always applies both proposed files
// together and proves every dependant, not just the two originally planned.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

async function apply(tx: Tx) {
  await applyProposed(tx, "content/0001_day_scope_writes.sql");
  await applyProposed(tx, "content/0002_materials_phase_by_scope.sql");
}

// A session with its single, auto-created day (0100, trigger A) at `T0-3d .. T0-3d+2h` — well
// clear of any second day a test inserts near "now", so the exclusion constraint never collides.
async function seedSession(tx: Tx, orgId: string, categoryId: string, venueId: string, presenterId: string, state: string = "published") {
  const [session] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, rsvp_deadline_at, cancellation_cutoff_at, state, published_at, completed_at)
     values ($1, 'ورشة ثلاثية الأيام', 'ملخص', $2, 'introductory',
             now() - interval '3 days', 120, now() - interval '3 days' + interval '2 hours',
             $3, 30, now() - interval '4 days', now() - interval '4 days', $4::public.session_state,
             now() - interval '5 days', case when $4 = 'completed' then now() - interval '1 hour' end)
     returning id`,
    [orgId, categoryId, venueId, state],
  );
  const sessionId = session.id as string;
  await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [orgId, sessionId, presenterId]);
  return sessionId;
}

async function dayScopedMaterialObject(tx: Tx, orgId: string, sessionId: string, dayId: string | null, presenterId: string) {
  const [material] = await tx.q<{ id: string }>(
    `insert into public.materials (org_id, session_id, session_day_id, kind, title, phase, allow_download, added_by)
     values ($1, $2, $3, 'pdf', 'م', 'after', true, $4) returning id`,
    [orgId, sessionId, dayId, presenterId],
  );
  const [version] = await tx.q<{ id: string }>(
    `insert into public.material_versions (org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
     values ($1, $2, 1, 'x', 1000, 'application/pdf', $3, $4) returning id`,
    [orgId, material.id, "a".repeat(64), presenterId],
  );
  await tx.q(`update public.materials set current_version_id = $1 where id = $2`, [version.id, material.id]);
  const [page] = await tx.q<{ id: string }>(
    `insert into public.material_pages (org_id, material_version_id, page_number, image_path, thumbnail_path)
     values ($1, $2, 1, 'x/1.webp', 'x/1-thumb.webp') returning id`,
    [orgId, version.id],
  );
  const objectName = `${orgId}/sessions/${sessionId}/materials/${version.id}/deck.pdf`;
  const pageObjectName = `${orgId}/sessions/${sessionId}/pages/${version.id}/1.webp`;
  await tx.q(`insert into storage.objects (bucket_id, name) values ('materials', $1)`, [objectName]);
  await tx.q(`insert into storage.objects (bucket_id, name) values ('material-pages', $1)`, [pageObjectName]);
  return { materialId: material.id as string, versionId: version.id as string, pageId: page.id as string, objectName, pageObjectName };
}

describe("POL-storage.materials.day_scoped_after_release", () => {
  it("the source object, the version row and the rendered page (table AND storage) are all hidden from a plain member while the material's own day has not ended, and all four become visible once it has", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      // A day still running — none of the four should be visible yet.
      const sessionId = await seedSession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId);
      const [runningDay] = await tx.q<{ id: string }>(
        `insert into public.session_days (org_id, session_id, starts_at, ends_at, venue_id)
         values ($1, $2, now() - interval '30 minutes', now() + interval '90 minutes', $3) returning id`,
        [f.a.id, sessionId, f.a.venueId],
      );
      await apply(tx);
      const { versionId, pageId, objectName, pageObjectName } = await dayScopedMaterialObject(tx, f.a.id, sessionId, runningDay.id, f.a.members[0].memberId);

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.material_versions where id = $1`, [versionId])).toEqual([]);
      expect(await tx.q(`select id from public.material_pages where id = $1`, [pageId])).toEqual([]);
      expect(await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [objectName])).toEqual([]);
      expect(await tx.q(`select id from storage.objects where bucket_id = 'material-pages' and name = $1`, [pageObjectName])).toEqual([]);

      // The day ends.
      await tx.asOwner();
      await tx.q(`update public.session_days set ends_at = now() - interval '1 minute' where id = $1`, [runningDay.id]);

      await tx.as(f.a.members[1].claims);
      expect((await tx.q(`select id from public.material_versions where id = $1`, [versionId])).length).toBe(1);
      expect((await tx.q(`select id from public.material_pages where id = $1`, [pageId])).length).toBe(1);
      expect((await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [objectName])).length).toBe(1);
      expect((await tx.q(`select id from storage.objects where bucket_id = 'material-pages' and name = $1`, [pageObjectName])).length).toBe(1);
    });
  });

  it("★ releases the version, the page and both storage objects on the session's early completion too, even while the material's own day has not ended", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const sessionId = await seedSession(tx, f.a.id, f.a.categoryId, f.a.venueId, f.a.members[0].memberId, "completed");
      // A second day in the FUTURE — the session completed early, before this day.
      const [futureDay] = await tx.q<{ id: string }>(
        `insert into public.session_days (org_id, session_id, starts_at, ends_at, venue_id)
         values ($1, $2, now() + interval '1 day', now() + interval '1 day' + interval '2 hours', $3) returning id`,
        [f.a.id, sessionId, f.a.venueId],
      );
      await apply(tx);
      const { versionId, pageId, objectName, pageObjectName } = await dayScopedMaterialObject(tx, f.a.id, sessionId, futureDay.id, f.a.members[0].memberId);

      await tx.as(f.a.members[1].claims);
      expect((await tx.q(`select id from public.material_versions where id = $1`, [versionId])).length).toBe(1);
      expect((await tx.q(`select id from public.material_pages where id = $1`, [pageId])).length).toBe(1);
      expect((await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [objectName])).length).toBe(1);
      expect((await tx.q(`select id from storage.objects where bucket_id = 'material-pages' and name = $1`, [pageObjectName])).length).toBe(1);
    });
  });
});
