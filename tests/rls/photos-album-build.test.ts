// The album's build — supabase/proposed/content/0158_photo_album_build.sql,
// on the lead's 0156 (REQ-ADM-021, REQ-EVT-012, DEC-182).
//
// ★ A HIDE ALWAYS REACHES THE ZIP. A photograph hidden during a build makes
// `record_photo_album_built()` answer 'stale' and leaves the row building; one
// hidden after makes the ready album stale — through a MEMBER's takedown (the
// trigger is tested as a member, the house rule for a trigger that writes), a
// staff removal and a delete. And the takedown still succeeds.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

// Promoted as 0159 (the lead, DEC-182); applied here only while the proposed copy still exists.
const PROPOSED = "content/0158_photo_album_build.sql";
const proposedExists = existsSync(join(process.cwd(), "supabase", "proposed", PROPOSED));
type F = Awaited<ReturnType<typeof seed>>;

async function photo(tx: Tx, f: F, opts: { hidden?: boolean; removed?: boolean; minutesAgo?: number } = {}) {
  await tx.asOwner();
  const session = f.m2.a.published;
  const [p] = await tx.q<{ id: string }>(
    `insert into public.photos (org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped, hidden_at, removed_at, created_at)
     values ($1, $2, $3, 'pending', 1200, 800, 2048, $4, true, $5, $6, now() - ($7 || ' minutes')::interval) returning id`,
    [f.a.id, session, f.a.members[0].memberId, "c".repeat(64), opts.hidden ? new Date() : null, opts.removed ? new Date() : null, String(opts.minutesAgo ?? 0)],
  );
  const path = `${f.a.id}/sessions/${session}/photos/${p.id}.jpg`;
  await tx.q(`update public.photos set storage_path = $1 where id = $2`, [path, p.id]);
  return { id: p.id, path, session };
}

async function request(tx: Tx, f: F, session: string) {
  await tx.as(f.a.admin.claims);
  const [r] = await tx.q<{ album_id: string; build_id: string }>(`select * from public.request_photo_album($1)`, [session]);
  await tx.asOwner();
  return r;
}

const partsFor = (f: F, session: string, build: string, n = 1) =>
  JSON.stringify(Array.from({ length: n }, (_, i) => ({ path: `${f.a.id}/sessions/${session}/albums/${build}/part-${i + 1}.zip`, byteSize: 1000, photoCount: 1 })));

const status = (tx: Tx, album: string) =>
  tx.q<{ status: string }>(`select status from public.photo_albums where id = $1`, [album]).then((r) => r[0].status);

async function ready(tx: Tx, f: F) {
  const p = await photo(tx, f);
  const r = await request(tx, f, p.session);
  await tx.q(`select * from public.begin_photo_album_build($1)`, [r.build_id]);
  await tx.q(`select public.record_photo_album_built($1, $2::jsonb, $3::uuid[])`, [r.build_id, partsFor(f, p.session, r.build_id), [p.id]]);
  expect(await status(tx, r.album_id)).toBe("ready");
  return { p, r };
}

describe("RPC-begin_photo_album_build", () => {
  it("is the worker's alone — no client role may execute any of the three", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      if (proposedExists) await applyProposed(tx, PROPOSED);
      const p = await photo(tx, f);
      const r = await request(tx, f, p.session);
      for (const who of [f.a.admin, f.a.members[0]]) {
        await tx.as(who.claims);
        expect(await errorCode(() => tx.q(`select * from public.begin_photo_album_build($1)`, [r.build_id]))).toBe("42501");
        expect(await errorCode(() => tx.q(`select public.record_photo_album_built($1, '[]'::jsonb, '{}'::uuid[])`, [r.build_id]))).toBe("42501");
        expect(await errorCode(() => tx.q(`select public.fail_photo_album($1, 'x')`, [r.build_id]))).toBe("42501");
      }
    });
  });

  it("★ returns the visible set only, oldest first, and marks the album building", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      if (proposedExists) await applyProposed(tx, PROPOSED);
      const older = await photo(tx, f, { minutesAgo: 10 });
      const newer = await photo(tx, f, { minutesAgo: 1 });
      const hidden = await photo(tx, f, { hidden: true });
      const removed = await photo(tx, f, { removed: true });
      const r = await request(tx, f, older.session);
      const rows = await tx.q<{ photo_id: string; storage_path: string; sha256: string }>(`select * from public.begin_photo_album_build($1)`, [r.build_id]);
      const ids = rows.map((x) => x.photo_id);
      // The fixture's own visible photographs of this session may be in the set too; ours keep
      // their order, and the hidden and removed ones are never in it.
      expect(ids.filter((id) => id === older.id || id === newer.id)).toEqual([older.id, newer.id]);
      expect(ids).not.toContain(hidden.id);
      expect(ids).not.toContain(removed.id);
      const [{ n }] = await tx.q<{ n: number }>(
        `select count(*)::int as n from public.photos where session_id = $1 and hidden_at is null and removed_at is null`,
        [older.session],
      );
      expect(rows).toHaveLength(n);
      expect(rows.find((x) => x.photo_id === older.id)?.storage_path).toBe(older.path);
      expect(await status(tx, r.album_id)).toBe("building");
    });
  });

  it("a build a newer request replaced gets no rows", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      if (proposedExists) await applyProposed(tx, PROPOSED);
      const p = await photo(tx, f);
      const first = await request(tx, f, p.session);
      await request(tx, f, p.session);
      expect(await tx.q(`select * from public.begin_photo_album_build($1)`, [first.build_id])).toHaveLength(0);
    });
  });
});

describe("RPC-record_photo_album_built", () => {
  it("★ ready: the parts, the count, a seven-day expiry, the in-app notice to the one who asked, and the expiry job", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      if (proposedExists) await applyProposed(tx, PROPOSED);
      const p = await photo(tx, f);
      const r = await request(tx, f, p.session);
      await tx.q(`select * from public.begin_photo_album_build($1)`, [r.build_id]);
      const [{ outcome }] = await tx.q<{ outcome: string }>(`select public.record_photo_album_built($1, $2::jsonb, $3::uuid[]) as outcome`, [
        r.build_id,
        partsFor(f, p.session, r.build_id, 2),
        [p.id],
      ]);
      expect(outcome).toBe("ready");
      const [a] = await tx.q<{ status: string; photo_count: number; byte_size: string; days: number; parts: unknown[] }>(
        `select status, photo_count, byte_size, round(extract(epoch from expires_at - built_at) / 86400)::int as days, parts from public.photo_albums where id = $1`,
        [r.album_id],
      );
      expect(a).toMatchObject({ status: "ready", photo_count: 1, byte_size: "2000", days: 7 });
      expect(a.parts).toHaveLength(2);

      const notes = await tx.q<{ member_id: string; payload: { session_id: string } }>(
        `select member_id, payload from public.notifications where key = 'MSG-photo_album_ready'`,
      );
      expect(notes).toHaveLength(1);
      expect(notes[0].member_id).toBe(f.a.admin.memberId);
      expect(notes[0].payload.session_id).toBe(p.session);

      const jobs = await tx.q<{ key: string }>(`select key from graphile_worker.jobs where key = $1`, [`zipphotos-expire:${p.session}`]);
      expect(jobs).toHaveLength(1);

      // The lead's download definer now hands out part 2 — the path this build wrote.
      await tx.as(f.a.admin.claims);
      const [part] = await tx.q<{ storage_path: string }>(`select * from public.record_photo_album_download($1, 2)`, [p.session]);
      expect(part.storage_path).toBe(`${f.a.id}/sessions/${p.session}/albums/${r.build_id}/part-2.zip`);
    });
  });

  it("★ a photograph hidden mid-build: 'stale', and the row stays building for the retry", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      if (proposedExists) await applyProposed(tx, PROPOSED);
      const p = await photo(tx, f);
      const r = await request(tx, f, p.session);
      await tx.q(`select * from public.begin_photo_album_build($1)`, [r.build_id]);
      await tx.q(`update public.photos set hidden_at = now() where id = $1`, [p.id]);
      const [{ outcome }] = await tx.q<{ outcome: string }>(`select public.record_photo_album_built($1, $2::jsonb, $3::uuid[]) as outcome`, [
        r.build_id,
        partsFor(f, p.session, r.build_id),
        [p.id],
      ]);
      expect(outcome).toBe("stale");
      expect(await status(tx, r.album_id)).toBe("building");
      expect(await tx.q(`select id from public.notifications where key = 'MSG-photo_album_ready'`)).toHaveLength(0);
    });
  });

  it("a replaced build is 'superseded' and changes nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      if (proposedExists) await applyProposed(tx, PROPOSED);
      const p = await photo(tx, f);
      const first = await request(tx, f, p.session);
      const second = await request(tx, f, p.session);
      const [{ outcome }] = await tx.q<{ outcome: string }>(`select public.record_photo_album_built($1, $2::jsonb, $3::uuid[]) as outcome`, [
        first.build_id,
        partsFor(f, p.session, first.build_id),
        [p.id],
      ]);
      expect(outcome).toBe("superseded");
      expect(await status(tx, second.album_id)).toBe("queued");
    });
  });

  it("★ a part outside this build's prefix is refused — the path handed out is always one the bucket policy admits", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      if (proposedExists) await applyProposed(tx, PROPOSED);
      const p = await photo(tx, f);
      const r = await request(tx, f, p.session);
      await tx.q(`select * from public.begin_photo_album_build($1)`, [r.build_id]);
      for (const parts of [
        "[]",
        JSON.stringify([{ path: `${f.b.id}/sessions/${p.session}/albums/${r.build_id}/part-1.zip`, byteSize: 10 }]),
        partsFor(f, p.session, "00000000-0000-4000-8000-000000000000"),
      ]) {
        expect(await errorCode(() => tx.q(`select public.record_photo_album_built($1, $2::jsonb, $3::uuid[])`, [r.build_id, parts, [p.id]]))).toBe("22023");
      }
    });
  });
});

describe("RPC-fail_photo_album", () => {
  it("fails the current build with its error, and leaves a replaced build's album alone", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      if (proposedExists) await applyProposed(tx, PROPOSED);
      const p = await photo(tx, f);
      const first = await request(tx, f, p.session);
      const second = await request(tx, f, p.session);
      await tx.q(`select public.fail_photo_album($1, 'late')`, [first.build_id]);
      expect(await status(tx, second.album_id)).toBe("queued");
      await tx.q(`select public.fail_photo_album($1, $2)`, [second.build_id, "zip is not installed"]);
      const [a] = await tx.q<{ status: string; error: string }>(`select status, error from public.photo_albums where id = $1`, [second.album_id]);
      expect(a).toEqual({ status: "failed", error: "zip is not installed" });
    });
  });
});

describe("TRG-photo_albums_stale", () => {
  it("★ a MEMBER's «remove photos of me» makes the ready album stale — and the takedown still hides the photo", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      if (proposedExists) await applyProposed(tx, PROPOSED);
      const { p, r } = await ready(tx, f);
      await tx.as(f.a.members[1].claims);
      await tx.q(`insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3)`, [f.a.id, p.id, f.a.members[1].memberId]);
      await tx.asOwner();
      expect(await status(tx, r.album_id)).toBe("stale");
      const [row] = await tx.q<{ hidden_at: string | null }>(`select hidden_at from public.photos where id = $1`, [p.id]);
      expect(row.hidden_at).not.toBeNull();
      // And nobody can take the stale zip.
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public.record_photo_album_download($1, 1)`, [p.session]))).toBe("42501");
    });
  });

  it("a staff removal and a delete each make it stale", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      if (proposedExists) await applyProposed(tx, PROPOSED);
      const one = await ready(tx, f);
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.remove_photo($1, 'test')`, [one.p.id]);
      await tx.asOwner();
      expect(await status(tx, one.r.album_id)).toBe("stale");

      const extra = await photo(tx, f);
      const r = await request(tx, f, extra.session);
      await tx.q(`select * from public.begin_photo_album_build($1)`, [r.build_id]);
      await tx.q(`select public.record_photo_album_built($1, $2::jsonb, $3::uuid[])`, [r.build_id, partsFor(f, extra.session, r.build_id), [extra.id]]);
      expect(await status(tx, r.album_id)).toBe("ready");
      await tx.q(`delete from public.photos where id = $1`, [extra.id]);
      expect(await status(tx, r.album_id)).toBe("stale");
    });
  });

  it("a new upload or a restore leaves a ready album ready — the slot offers a rebuild, nothing is refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      if (proposedExists) await applyProposed(tx, PROPOSED);
      const { r } = await ready(tx, f);
      await photo(tx, f);
      expect(await status(tx, r.album_id)).toBe("ready");
    });
  });
});
