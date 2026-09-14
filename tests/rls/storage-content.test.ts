// Storage buckets — 03 §6. Applied with applyProposed() inside each test's
// rolled-back transaction (DEC-040) — nothing here touches the shared local
// database, or (in CI) anything beyond the storage shim scripts/ci/roles.sql
// carries for the M5 bucket policies (DEC-044's pattern).
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

async function materialObject(
  tx: Tx,
  orgId: string,
  sessionId: string,
  presenterId: string,
  opts: { phase?: "before" | "after"; allowDownload?: boolean } = {},
) {
  const [material] = await tx.q<{ id: string }>(
    `insert into public.materials (org_id, session_id, kind, title, phase, allow_download, added_by)
     values ($1, $2, 'pdf', 'م', $3, $4, $5) returning id`,
    [orgId, sessionId, opts.phase ?? "after", opts.allowDownload ?? true, presenterId],
  );
  const [version] = await tx.q<{ id: string }>(
    `insert into public.material_versions (org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
     values ($1, $2, 1, 'x', 1000, 'application/pdf', $3, $4) returning id`,
    [orgId, material.id, "a".repeat(64), presenterId],
  );
  const name = `${orgId}/sessions/${sessionId}/materials/${version.id}/deck.pdf`;
  await tx.q(`insert into storage.objects (bucket_id, name) values ('materials', $1)`, [name]);
  return { materialId: material.id as string, versionId: version.id as string, name };
}

describe("POL-storage.materials.prefix", () => {
  it("an authenticated write to another org's prefix is rejected", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.as(f.a.members[0].claims); // presenter in org A
      expect(
        await errorCode(() =>
          tx.q(`insert into storage.objects (bucket_id, name) values ('materials', $1)`, [
            `${f.b.id}/sessions/${f.m2.b.published}/materials/${randomUUID()}/x.pdf`,
          ]),
        ),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-storage.materials.download", () => {
  it("with allow_download = false, the joined materials bucket read policy denies a member but not the presenter or staff (REQ-MAT-005)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.asOwner();
      const { name } = await materialObject(tx, f.a.id, f.m2.a.completed, f.a.members[0].memberId, { phase: "after", allowDownload: false });

      await tx.as(f.a.members[1].claims); // attendee, session completed so phase-visible, but allow_download = false
      expect(await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [name])).toEqual([]);

      await tx.as(f.a.members[0].claims); // the presenter — bypasses allow_download for their own material
      expect((await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [name])).length).toBe(1);

      await tx.as(f.a.admin.claims);
      expect((await tx.q(`select id from storage.objects where bucket_id = 'materials' and name = $1`, [name])).length).toBe(1);
    });
  });
});

describe("POL-storage.material_pages.phase", () => {
  it("an 'after' page image is denied to a member before completion; no insert policy exists for `authenticated`", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.asOwner();
      const { versionId } = await materialObject(tx, f.a.id, f.m2.a.published, f.a.members[0].memberId, { phase: "after", allowDownload: true });
      const name = `${f.a.id}/sessions/${f.m2.a.published}/pages/${versionId}/1.webp`;
      await tx.q(`insert into storage.objects (bucket_id, name) values ('material-pages', $1)`, [name]);

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from storage.objects where bucket_id = 'material-pages' and name = $1`, [name])).toEqual([]);

      expect(
        await errorCode(() => tx.q(`insert into storage.objects (bucket_id, name) values ('material-pages', $1)`, [`${name}-2`])),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("POL-storage.photos.hidden", () => {
  it("a hidden photo's object is denied to a member, permitted to staff", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.asOwner();
      const [photo] = await tx.q<{ id: string }>(
        `insert into public.photos (org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped, hidden_at, hidden_reason)
         values ($1, $2, $3, 'x', 1000, $4, true, now(), 'x') returning id`,
        [f.a.id, f.m2.a.published, f.a.members[1].memberId, "a".repeat(64)],
      );
      const name = `${f.a.id}/sessions/${f.m2.a.published}/photos/${photo.id}.webp`;
      await tx.q(`insert into storage.objects (bucket_id, name) values ('photos', $1)`, [name]);

      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from storage.objects where bucket_id = 'photos' and name = $1`, [name])).toEqual([]);

      await tx.as(f.a.mod.claims);
      expect((await tx.q(`select id from storage.objects where bucket_id = 'photos' and name = $1`, [name])).length).toBe(1);
    });
  });

  it("the check-in gate on the photos bucket matches the table's insert policy", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const deniedName = `${f.a.id}/sessions/${f.m2.a.draft}/photos/${randomUUID()}.webp`; // members[1] not checked in to the draft session
      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => tx.q(`insert into storage.objects (bucket_id, name) values ('photos', $1)`, [deniedName]))).toBe(PERMISSION_DENIED);

      // No RETURNING here: this object's filename names no real `public.photos`
      // row, so the (separate) photos_storage_read policy would deny it visibility —
      // the same reason an UPDATE's RETURNING needs the row to pass the SELECT
      // policy too (docs/plan/notes/content.md §1.4a). The write itself succeeding
      // with no thrown error is what this case proves.
      const okName = `${f.a.id}/sessions/${f.m2.a.published}/photos/${randomUUID()}.webp`; // members[1] is checked in here (fixture-m2)
      await tx.q(`insert into storage.objects (bucket_id, name) values ('photos', $1)`, [okName]);
      await tx.asOwner();
      expect((await tx.q(`select id from storage.objects where bucket_id = 'photos' and name = $1`, [okName])).length).toBe(1);
    });
  });
});

describe("POL-storage.exports.write", () => {
  it("an authenticated client cannot write to exports; only service_role can; org members can read", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      const name = `${f.a.id}/exports/${randomUUID()}/a3.png`;

      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`insert into storage.objects (bucket_id, name) values ('exports', $1)`, [name]))).toBe(PERMISSION_DENIED);

      await tx.asServiceRole();
      const ok = await tx.q(`insert into storage.objects (bucket_id, name) values ('exports', $1) returning id`, [name]);
      expect(ok.length).toBe(1);

      await tx.as(f.a.admin.claims);
      expect((await tx.q(`select id from storage.objects where bucket_id = 'exports' and name = $1`, [name])).length).toBe(1);
    });
  });
});

describe("POL-storage.fonts.read", () => {
  it("any authenticated member reads the fonts bucket with no org prefix required", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.asServiceRole();
      const name = `${"a".repeat(64)}.woff2`;
      await tx.q(`insert into storage.objects (bucket_id, name) values ('fonts', $1)`, [name]);

      await tx.as(f.a.members[0].claims);
      expect((await tx.q(`select id from storage.objects where bucket_id = 'fonts' and name = $1`, [name])).length).toBe(1);

      await tx.as(f.b.members[0].claims); // not org-prefixed — org B reads it too
      expect((await tx.q(`select id from storage.objects where bucket_id = 'fonts' and name = $1`, [name])).length).toBe(1);
    });
  });
});
