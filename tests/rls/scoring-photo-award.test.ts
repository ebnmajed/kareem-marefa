// Wave 20, PR C — the photo award, with its reversal first (DEC-220 §2, DEC-222, REQ-UIX-083, STORY-UIX-073,
// REQ-PTS-002, REQ-PTS-006, REQ-PTS-012, REQ-PTS-013).
//
// `0177_photo_award.sql`. `content`'s trigger on `photos` (`0178`) decides WHEN and calls these; here they are also
// called directly, as that trigger would, and the job `award_points` would run is run the way the worker runs it —
// so what is paid is proven apart from when. A photo the trigger must not see (one «from before the migration», or
// one already hidden) is inserted hidden: `0178`'s insert trigger fires for a visible photo only.
//
// 03 §8.2 rows proven here: RPC-reverse_photo_points.{compensating, frees_cap}; RPC-award_photo_points.{visible_only,
// epoch, restore_only_reversed, cap, grants}; RPC-award_points.photo_epoch.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const SHA = "a".repeat(64);

async function setup(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  const uploader = f.a.members[1];
  return { f, uploader, session: f.m2.a.published };
}

let n = 0;
async function photo(tx: Tx, orgId: string, sessionId: string, uploaderId: string, hidden = false) {
  n += 1;
  const [p] = await tx.q<{ id: string }>(
    `insert into public.photos (org_id, session_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped, hidden_at, hidden_reason)
     values ($1, $2, $3, $4, 1200, 800, 2048, $5, true, case when $6 then now() end, case when $6 then 'takedown_requested' end) returning id`,
    [orgId, sessionId, uploaderId, `${orgId}/sessions/${sessionId}/photos/award-${n}-${Math.random()}.jpg`, SHA, hidden],
  );
  return p.id;
}

/** What content's trigger would call, and then what the worker's `award_points` task runs for the job it enqueued. */
async function award(tx: Tx, photoId: string, restore = false) {
  await tx.asOwner();
  await tx.q(`select public.award_photo_points($1, $2)`, [photoId, restore]);
  const jobs = await tx.q<{ key: string; payload: { rule: string; member_id: string; source: string; source_id: string; session_id: string } }>(
    `select j.key, j.payload from graphile_worker._private_jobs j where j.key like $1 order by j.id`,
    [`pts:photo:${photoId}:%`],
  );
  for (const j of jobs) {
    await tx.q(`select public.award_points($1, $2, $3::public.ledger_source, $4, $5)`, [j.payload.rule, j.payload.member_id, j.payload.source, j.payload.source_id, j.payload.session_id]);
  }
  return jobs.map((j) => j.key);
}

const ledger = (tx: Tx, photoId: string) =>
  tx.q<{ amount: number; source: string; reason: string }>(
    `select amount, source, reason from public.points_ledger
      where (source = 'photo' and source_id = $1)
         or (source = 'reversal' and source_id in (select id from public.points_ledger where source = 'photo' and source_id = $1))
      order by occurred_at, id`,
    [photoId],
  );

describe("RPC-award_photo_points", () => {
  it("★ a visible photo is paid 3 — the rule's — once, under the existing job and key shapes", async () => {
    await withTx(async (tx) => {
      const { f, uploader, session } = await setup(tx);
      const p = await photo(tx, f.a.id, session, uploader.memberId);
      expect(await award(tx, p)).toEqual([`pts:photo:${p}:v1`]);
      await award(tx, p); // a replay
      expect(await ledger(tx, p)).toEqual([{ amount: 3, source: "photo", reason: "صورة من الجلسة" }]);
    });
  });

  it("★ visible_only: a hidden or removed photo enqueues nothing; a late job after a hide writes nothing", async () => {
    await withTx(async (tx) => {
      const { f, uploader, session } = await setup(tx);
      const hidden = await photo(tx, f.a.id, session, uploader.memberId, true);
      expect(await award(tx, hidden)).toEqual([]);
      const late = await photo(tx, f.a.id, session, uploader.memberId);
      await tx.q(`select public.award_photo_points($1, false)`, [late]);
      await tx.q(`update public.photos set hidden_at = now(), hidden_reason = 'takedown_requested' where id = $1`, [late]);
      await tx.q(`select public.award_points('photo', $1, 'photo', $2, $3)`, [uploader.memberId, late, session]);
      expect(await ledger(tx, late)).toEqual([]);
    });
  });

  it("★★ epoch: award → hide → restore → award nets ONE award; a second hide reverses the second", async () => {
    await withTx(async (tx) => {
      const { f, uploader, session } = await setup(tx);
      const p = await photo(tx, f.a.id, session, uploader.memberId);
      await award(tx, p);
      await tx.q(`update public.photos set hidden_at = now(), hidden_reason = 'takedown_requested' where id = $1`, [p]);
      await tx.q(`select public.reverse_photo_points($1, 'أُخفيت الصورة')`, [p]);
      await tx.q(`update public.photos set hidden_at = null, hidden_reason = null where id = $1`, [p]);
      expect(await award(tx, p, true)).toContain(`pts:photo:${p}:v2`);
      let rows = await ledger(tx, p);
      expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(3);
      expect(rows.map((r) => r.amount)).toEqual([3, -3, 3]);
      await tx.q(`update public.photos set hidden_at = now(), hidden_reason = 'takedown_requested' where id = $1`, [p]);
      await tx.q(`select public.reverse_photo_points($1, 'أُخفيت الصورة')`, [p]);
      rows = await ledger(tx, p);
      expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(0);
    });
  });

  it("★ restore_only_reversed: a photo never paid (from before the migration), hidden and restored, is paid nothing", async () => {
    await withTx(async (tx) => {
      const { f, uploader, session } = await setup(tx);
      const p = await photo(tx, f.a.id, session, uploader.memberId, true);
      await tx.q(`update public.photos set hidden_at = null, hidden_reason = null where id = $1`, [p]);
      expect(await award(tx, p, true)).toEqual([]);
      expect(await ledger(tx, p)).toEqual([]);
    });
  });

  it("★ cap: the sixth visible photo on one session writes nothing — and SCR-022's explanation names that session", async () => {
    await withTx(async (tx) => {
      const { f, uploader, session } = await setup(tx);
      const ids: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        const p = await photo(tx, f.a.id, session, uploader.memberId);
        ids.push(p);
        await award(tx, p);
      }
      const [{ total }] = await tx.q<{ total: number }>(
        `select coalesce(sum(amount), 0)::int as total from public.points_ledger where member_id = $1 and rule_key = 'photo' and session_id = $2`,
        [uploader.memberId, session],
      );
      expect(total).toBe(15);
      expect(await ledger(tx, ids[5])).toEqual([]);
      await tx.as(uploader.claims);
      const explained = await tx.q<{ session_id: string; rule_key: string; cap_per_session: number }>(`select session_id, rule_key, cap_per_session from public.capped_award_explanations()`);
      expect(explained).toContainEqual({ session_id: session, rule_key: "photo", cap_per_session: 5 });
    });
  });

  it("★ frees_cap: a reversed award frees its place — the next visible photo on that session is paid", async () => {
    await withTx(async (tx) => {
      const { f, uploader, session } = await setup(tx);
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const p = await photo(tx, f.a.id, session, uploader.memberId);
        ids.push(p);
        await award(tx, p);
      }
      await tx.q(`update public.photos set removed_at = now(), removed_by = $2, removal_reason = 'اختبار' where id = $1`, [ids[0], f.a.admin.memberId]);
      const sixth = await photo(tx, f.a.id, session, uploader.memberId);
      await award(tx, sixth);
      expect(await ledger(tx, sixth)).toEqual([{ amount: 3, source: "photo", reason: "صورة من الجلسة" }]);
      expect((await ledger(tx, ids[0])).map((r) => r.reason)).toEqual(["صورة من الجلسة", "حُذف المحتوى"]);
    });
  });
});

describe("RPC-reverse_photo_points", () => {
  it("★ compensating: one row per standing award, 0149's key, its own reason — and a no-op when nothing stands", async () => {
    await withTx(async (tx) => {
      const { f, uploader, session } = await setup(tx);
      const p = await photo(tx, f.a.id, session, uploader.memberId);
      await award(tx, p);
      await tx.q(`select public.reverse_photo_points($1, 'أُخفيت الصورة')`, [p]);
      await tx.q(`select public.reverse_photo_points($1, 'حُذف المحتوى')`, [p]);
      const rows = await tx.q<{ amount: number; reason: string; idempotency_key: string; rule_key: string }>(
        `select amount, reason, idempotency_key, rule_key from public.points_ledger where source = 'reversal' and source_id in (select id from public.points_ledger where source = 'photo' and source_id = $1)`,
        [p],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ amount: -3, reason: "أُخفيت الصورة", rule_key: "photo" });
      expect(rows[0].idempotency_key).toMatch(/^reversal:[0-9a-f-]+:v1$/);
    });
  });

  it("the removal path (0059's trigger) reverses through it with «حُذف المحتوى», and keeps the penalty's call", async () => {
    await withTx(async (tx) => {
      const { f, uploader, session } = await setup(tx);
      const p = await photo(tx, f.a.id, session, uploader.memberId);
      await award(tx, p);
      await tx.q(`update public.photos set removed_at = now(), removed_by = $2, removal_reason = 'اختبار' where id = $1`, [p, f.a.admin.memberId]);
      expect((await ledger(tx, p)).map((r) => [r.amount, r.reason])).toEqual([
        [3, "صورة من الجلسة"],
        [-3, "حُذف المحتوى"],
      ]);
    });
  });
});

describe("RPC-award_points.photo_epoch", () => {
  it("every other source keys as before — a comment's ledger key is v1", async () => {
    await withTx(async (tx) => {
      const { f, uploader } = await setup(tx);
      await tx.q(`select public.award_points('comment', $1, 'comment', $2, $3)`, [uploader.memberId, f.m2.a.commentId, f.m2.a.published]);
      const [{ key }] = await tx.q<{ key: string }>(`select idempotency_key as key from public.points_ledger where source = 'comment' and source_id = $1`, [f.m2.a.commentId]);
      expect(key).toBe(`comment:comment:${f.m2.a.commentId}:${uploader.memberId}:v1`);
    });
  });
});

describe("RPC-award_photo_points.grants", () => {
  it("neither function is callable by a member or by anon", async () => {
    await withTx(async (tx) => {
      const { f, uploader, session } = await setup(tx);
      const p = await photo(tx, f.a.id, session, uploader.memberId);
      await tx.as(uploader.claims);
      expect(await errorCode(() => tx.q(`select public.award_photo_points($1, false)`, [p]))).toBe("42501");
      expect(await errorCode(() => tx.q(`select public.reverse_photo_points($1, 'x')`, [p]))).toBe("42501");
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select public.award_photo_points($1, false)`, [p]))).toBe("42501");
    });
  });
});
