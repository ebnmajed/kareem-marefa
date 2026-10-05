// Wave 14, contract 1 — every photograph download is audited, the album is
// requested through a definer that enqueues its job, and a removed photograph is
// no longer readable (REQ-ADM-021, REQ-EVT-012, DEC-180, DEC-182). 0156.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

type F = Awaited<ReturnType<typeof seed>>;

async function photo(tx: Tx, f: F, opts: { hidden?: boolean; removed?: boolean } = {}) {
  await tx.asOwner();
  const session = f.m2.a.published;
  const [p] = await tx.q<{ id: string }>(
    `insert into public.photos (org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped, hidden_at, removed_at)
     values ($1, $2, $3, 'pending', 1200, 800, 2048, $4, true, $5, $6) returning id`,
    [f.a.id, session, f.a.members[0].memberId, "c".repeat(64), opts.hidden ? new Date() : null, opts.removed ? new Date() : null],
  );
  const path = `${f.a.id}/sessions/${session}/photos/${p.id}.jpg`;
  await tx.q(`update public.photos set storage_path = $1 where id = $2`, [path, p.id]);
  await tx.q(`insert into storage.objects (bucket_id, name) values ('photos', $1)`, [path]);
  return { id: p.id, path, session };
}

const audits = (tx: Tx, action: string, subject: string) =>
  tx.q<{ n: number }>(`select count(*)::int as n from public.audit_log where action = $1 and subject_id = $2`, [action, subject]).then((r) => r[0].n);

const listed = (tx: Tx, bucket: string, name: string) =>
  tx.q<{ n: number }>(`select count(*)::int as n from storage.objects where bucket_id = $1 and name = $2`, [bucket, name]).then((r) => r[0].n);

describe("POL-photos_storage_read.removed", () => {
  it("★ a removed photograph's object is readable by nobody — it was readable by every member before 0156", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const visible = await photo(tx, f);
      const removed = await photo(tx, f, { removed: true });
      for (const who of [f.a.members[1], f.a.admin, f.a.mod]) {
        await tx.as(who.claims);
        expect(await listed(tx, "photos", visible.path)).toBe(1);
        expect(await listed(tx, "photos", removed.path)).toBe(0);
      }
    });
  });
});

describe("RPC-record_photo_download", () => {
  // ★ DEC-266 (the owner's ruling, 0212): staff alone download a photograph — a member sees it and is refused here.
  it("★ a member who sees a visible photo is refused its download, and nothing is audited", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const p = await photo(tx, f);
      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => tx.q(`select * from public.record_photo_download($1)`, [p.id]))).toBe(PERMISSION_DENIED);
      await tx.asOwner();
      expect(await audits(tx, "photo.downloaded", p.id)).toBe(0);
    });
  });

  it("staff download a visible photo; one audit row names the session", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const p = await photo(tx, f);
      await tx.as(f.a.mod.claims);
      const rows = await tx.q<{ storage_path: string; file_name: string }>(`select * from public.record_photo_download($1)`, [p.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0].storage_path).toBe(p.path);
      expect(rows[0].file_name).toMatch(/^photo-(\d{8}|undated)-[0-9a-f]{8}\.jpg$/);
      await tx.asOwner();
      expect(await audits(tx, "photo.downloaded", p.id)).toBe(1);
      const [a] = await tx.q<{ after: { session_id: string } }>(`select after from public.audit_log where action = 'photo.downloaded' and subject_id = $1`, [p.id]);
      expect(a.after.session_id).toBe(p.session);
    });
  });

  it("★ a hidden photo is refused to staff too (DEC-182 Q3); a removed one, another org and an unknown id are refused; nothing is audited", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const hidden = await photo(tx, f, { hidden: true });
      const removed = await photo(tx, f, { removed: true });
      const visible = await photo(tx, f);
      for (const [who, id] of [
        [f.a.admin, hidden.id],
        [f.a.mod, hidden.id],
        [f.a.members[1], removed.id],
        [f.b.admin, visible.id],
        [f.a.admin, "00000000-0000-0000-0000-000000000000"],
      ] as const) {
        await tx.as(who.claims);
        expect(await errorCode(() => tx.q(`select * from public.record_photo_download($1)`, [id]))).toBe("42501");
      }
      await tx.asOwner();
      expect(await audits(tx, "photo.downloaded", hidden.id)).toBe(0);
      expect(await audits(tx, "photo.downloaded", visible.id)).toBe(0);
    });
  });
});

describe("RPC-request_photo_album", () => {
  it("staff request an album: one row queued, one audit row, one job under zipphotos:{session}; a repeat moves the build, not the row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const p = await photo(tx, f);
      await tx.as(f.a.mod.claims);
      const [first] = await tx.q<{ album_id: string; build_id: string }>(`select * from public.request_photo_album($1)`, [p.session]);
      await tx.as(f.a.admin.claims);
      const [second] = await tx.q<{ album_id: string; build_id: string }>(`select * from public.request_photo_album($1)`, [p.session]);
      expect(second.album_id).toBe(first.album_id);
      expect(second.build_id).not.toBe(first.build_id);

      const [row] = await tx.q<{ status: string; build_id: string }>(`select status, build_id from public.photo_albums where id = $1`, [first.album_id]);
      expect(row).toEqual({ status: "queued", build_id: second.build_id });

      await tx.asOwner();
      expect(await audits(tx, "photo_album.requested", first.album_id)).toBe(2);
      const jobs = await tx.q<{ n: number }>(
        `select count(*)::int as n from graphile_worker._private_jobs j
           join graphile_worker._private_tasks t on t.id = j.task_id
          where t.identifier = 'zip_session_photos' and j.key = $1`,
        [`zipphotos:${p.session}`],
      );
      expect(jobs[0].n).toBe(1);
    });
  });

  it("a member, another org's admin and an unknown session are refused with 42501; a session with no visible photo is album_empty (P0002)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const p = await photo(tx, f);
      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => tx.q(`select * from public.request_photo_album($1)`, [p.session]))).toBe("42501");
      await tx.as(f.b.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.request_photo_album($1)`, [p.session]))).toBe("42501");

      await tx.asOwner();
      await tx.q(`update public.photos set hidden_at = now() where session_id = $1`, [p.session]);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.request_photo_album($1)`, [p.session]))).toBe("P0002");
      await tx.asOwner();
      expect((await tx.q(`select id from public.photo_albums where session_id = $1`, [p.session])).length).toBe(0);
    });
  });
});

describe("RPC-record_photo_album_download + POL-photo_albums_*", () => {
  async function readyAlbum(tx: Tx, f: F, expiresInDays = 7) {
    const p = await photo(tx, f);
    await tx.as(f.a.admin.claims);
    const [{ album_id, build_id }] = await tx.q<{ album_id: string; build_id: string }>(`select * from public.request_photo_album($1)`, [p.session]);
    const part = (n: number) => `${f.a.id}/sessions/${p.session}/albums/${build_id}/part-${n}.zip`;
    await tx.asOwner();
    await tx.q(
      `update public.photo_albums set status = 'ready', built_at = now(), expires_at = now() + ($2 || ' days')::interval,
              photo_count = 1, byte_size = 10, parts = $3::jsonb where id = $1`,
      [album_id, String(expiresInDays), JSON.stringify([{ path: part(1), byteSize: 5, photoCount: 1 }, { path: part(2), byteSize: 5, photoCount: 0 }])],
    );
    await tx.q(`insert into storage.objects (bucket_id, name) values ('photo-albums', $1), ('photo-albums', $2)`, [part(1), part(2)]);
    return { session: p.session, album_id, build_id, part };
  }

  it("staff download each part of a ready album with one audit row each; the file is named by date and part", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const a = await readyAlbum(tx, f);
      await tx.as(f.a.mod.claims);
      const [one] = await tx.q<{ storage_path: string; file_name: string }>(`select * from public.record_photo_album_download($1, 1)`, [a.session]);
      expect(one.storage_path).toBe(a.part(1));
      expect(one.file_name).toMatch(/^photos-(\d{8}|undated)-part-1-of-2\.zip$/);
      expect(await listed(tx, "photo-albums", a.part(1))).toBe(1);
      expect((await tx.q(`select id from public.photo_albums where id = $1`, [a.album_id])).length).toBe(1);
      await tx.asOwner();
      expect(await audits(tx, "photo_album.downloaded", a.album_id)).toBe(1);
    });
  });

  it("a member is refused the definer, the row and the object; a part out of range is refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const a = await readyAlbum(tx, f);
      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => tx.q(`select * from public.record_photo_album_download($1, 1)`, [a.session]))).toBe("42501");
      expect((await tx.q(`select id from public.photo_albums where id = $1`, [a.album_id])).length).toBe(0);
      expect(await listed(tx, "photo-albums", a.part(1))).toBe(0);
      await tx.as(f.b.admin.claims);
      expect((await tx.q(`select id from public.photo_albums where id = $1`, [a.album_id])).length).toBe(0);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.record_photo_album_download($1, 3)`, [a.session]))).toBe("42501");
      expect(await errorCode(() => tx.q(`select * from public.record_photo_album_download($1, 0)`, [a.session]))).toBe("42501");
    });
  });

  it("★ a stale, expired or superseded build is unreadable and refused, even to staff with its path in hand", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const a = await readyAlbum(tx, f);

      await tx.asOwner();
      await tx.q(`update public.photo_albums set status = 'stale' where id = $1`, [a.album_id]);
      await tx.as(f.a.admin.claims);
      expect(await listed(tx, "photo-albums", a.part(1))).toBe(0);
      expect(await errorCode(() => tx.q(`select * from public.record_photo_album_download($1, 1)`, [a.session]))).toBe("42501");

      await tx.asOwner();
      await tx.q(`update public.photo_albums set status = 'ready', expires_at = now() - interval '1 minute' where id = $1`, [a.album_id]);
      await tx.as(f.a.admin.claims);
      expect(await listed(tx, "photo-albums", a.part(1))).toBe(0);
      expect(await errorCode(() => tx.q(`select * from public.record_photo_album_download($1, 1)`, [a.session]))).toBe("42501");

      await tx.asOwner();
      await tx.q(`update public.photo_albums set expires_at = now() + interval '1 day', build_id = gen_random_uuid() where id = $1`, [a.album_id]);
      await tx.as(f.a.admin.claims);
      expect(await listed(tx, "photo-albums", a.part(1))).toBe(0);
    });
  });
});
