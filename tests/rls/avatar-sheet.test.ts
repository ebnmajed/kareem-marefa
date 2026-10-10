// platform (wave 29, PR B) — the sheet's writes: a library pick, «أزل الصورة», «من Google» (DEC-280 §2 – §3,
// DEC-281; REQ-PRF-016, REQ-PRF-018, REQ-PRF-019). Contract 3's database half; the behaviour is
// `supabase/proposed/platform/0011_avatar_uploads.sql`.
//
// ★ A library pick and a removal each leave NO readable object, and no later refresh brings Google back: leaving a
//   photo turns an `accepted` answer into `declined`, audited as the answer it is.

import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "platform/0011_avatar_uploads.sql";
const SOURCE = "https://lh3.googleusercontent.com/a/ACg8ocTEST=s96-c";
const UPLOAD = "6f0d8a52-6a43-4c55-8f53-0f8d7e1d2c01";

const jobCount = (tx: Tx, key: string) =>
  tx.q(`select 1 from graphile_worker._private_jobs where key = $1`, [key]).then((r) => r.length);

async function ready(tx: Tx, opts: { answer?: "accepted" | "declined" | null; version?: number | null; source?: "google" | "upload" | null; url?: string | null } = {}) {
  const f = await seed(tx);
  await applyProposed(tx, FILE);
  await tx.asOwner();
  const who = f.a.members[1];
  await tx.q(
    `update public.members set avatar_url = $2, avatar_import = $3, avatar_version = $4, avatar_source = $5, avatar_key = 'characters/director' where id = $1`,
    [who.memberId, opts.url === undefined ? SOURCE : opts.url, opts.answer ?? null, opts.version ?? null, opts.source ?? null],
  );
  await tx.q(`delete from graphile_worker._private_jobs where key = any ($1)`, [[`avatar:${who.memberId}`, `avatar-upload:${who.memberId}`]]);
  return { f, who };
}

async function storeCopy(tx: Tx, orgId: string, memberId: string, version: number) {
  await tx.asOwner();
  for (const size of [96, 192]) {
    await tx.q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${orgId}/members/${memberId}/${version}/${size}.webp`]);
  }
  return `${orgId}/members/${memberId}/${version}/96.webp`;
}

const readable = async (tx: Tx, name: string) =>
  (await tx.q(`select name from storage.objects where bucket_id = 'avatars' and name = $1`, [name])).length === 1;

const row = (tx: Tx, id: string) =>
  tx
    .q<{ avatar_version: string | null; avatar_source: string | null; avatar_import: string | null; avatar_key: string | null }>(
      `select avatar_version, avatar_source, avatar_import, avatar_key from public.members where id = $1`,
      [id],
    )
    .then((r) => r[0]);

const call = async (tx: Tx, sql: string, args: unknown[] = []) => (await tx.q<{ out: Record<string, unknown> }>(`select ${sql} as out`, args))[0].out;

const answerAudits = (tx: Tx, orgId: string, memberId: string) =>
  tx.q<{ before: { answer: string | null }; after: { answer: string }; reason: string | null }>(
    `select before, after, reason from public.audit_log where org_id = $1 and action = 'member.avatar_import_answered' and subject_id = $2`,
    [orgId, memberId],
  );

describe("RPC-set_avatar_library", () => {
  it("★ clears_photo — the key changes, a Google copy goes at once, the reconcile is enqueued", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: "accepted", version: 1790000000000, source: "google" });
      const name = await storeCopy(tx, f.a.id, who.memberId, 1790000000000);
      await tx.as(who.claims);
      expect(await call(tx, `public.set_avatar_library('objects/clapper')`)).toEqual({ status: "ok" });

      await tx.asOwner();
      expect(await row(tx, who.memberId)).toEqual({ avatar_version: null, avatar_source: null, avatar_import: "declined", avatar_key: "objects/clapper" });
      expect(await jobCount(tx, `avatar:${who.memberId}`)).toBe(1);
      await tx.as(f.a.members[0].claims);
      expect(await readable(tx, name)).toBe(false);
    });
  });

  it("★ declines_and_audits — no later Google refresh brings the copy back over the member's pick", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: "accepted", version: 1790000000000, source: "google" });
      await tx.as(who.claims);
      await tx.q(`select public.set_avatar_library('objects/clapper')`);
      await tx.asOwner();
      const audits = await answerAudits(tx, f.a.id, who.memberId);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ before: { answer: "accepted" }, after: { answer: "declined" }, reason: "library" });

      await tx.q(`delete from graphile_worker._private_jobs where key = $1`, [`avatar:${who.memberId}`]);
      await tx.q(`update public.members set avatar_url = 'https://lh3.googleusercontent.com/a/NEW' where id = $1`, [who.memberId]);
      expect(await jobCount(tx, `avatar:${who.memberId}`)).toBe(0);
      await tx.asServiceRole();
      const [{ r }] = await tx.q<{ r: { status: string } }>(
        `select public.record_avatar_copy($1, 1790000000900, 'https://lh3.googleusercontent.com/a/NEW') as r`,
        [who.memberId],
      );
      expect(r.status).toBe("stale");
    });
  });

  it("clears an upload too, and a library pick with no photo writes no answer and enqueues nothing", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: null, version: null });
      await tx.as(who.claims);
      expect(await call(tx, `public.set_avatar_library('characters/actor')`)).toEqual({ status: "ok" });
      await tx.asOwner();
      expect(await row(tx, who.memberId)).toMatchObject({ avatar_key: "characters/actor", avatar_import: null });
      expect(await jobCount(tx, `avatar:${who.memberId}`)).toBe(0);
      expect(await answerAudits(tx, f.a.id, who.memberId)).toHaveLength(0);

      await tx.q(`update public.members set avatar_version = 1790000000500, avatar_source = 'upload' where id = $1`, [who.memberId]);
      await tx.as(who.claims);
      await tx.q(`select public.set_avatar_library('objects/reel')`);
      await tx.asOwner();
      expect(await row(tx, who.memberId)).toMatchObject({ avatar_version: null, avatar_source: null, avatar_key: "objects/reel" });
      expect(await jobCount(tx, `avatar:${who.memberId}`)).toBe(1);
    });
  });

  it("invalid_key — a key outside the library writes nothing", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx, { answer: "accepted", version: 1790000000000 });
      await tx.as(who.claims);
      for (const key of ["objects/nope", "../../etc", ""]) {
        expect(await call(tx, `public.set_avatar_library($1)`, [key])).toEqual({ status: "invalid_key" });
      }
      await tx.asOwner();
      expect(await row(tx, who.memberId)).toMatchObject({ avatar_version: "1790000000000", avatar_key: "characters/director" });
    });
  });

  it("cancels_pending — an upload still in flight is cancelled by a pick", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx);
      await tx.as(who.claims);
      await tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD]);
      await tx.q(`select public.set_avatar_library('objects/reel')`);
      const [{ s }] = await tx.q<{ s: { state: string } }>(`select public.my_avatar_upload($1) as s`, [UPLOAD]);
      expect(s.state).toBe("cancelled");
    });
  });
});

describe("RPC-remove_avatar_photo", () => {
  it("★ clears — the photo goes at once and the key the member holds shows", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: null, version: 1790000000500, source: "upload" });
      const name = await storeCopy(tx, f.a.id, who.memberId, 1790000000500);
      await tx.as(who.claims);
      expect(await call(tx, `public.remove_avatar_photo()`)).toEqual({ status: "ok" });
      await tx.asOwner();
      expect(await row(tx, who.memberId)).toMatchObject({ avatar_version: null, avatar_source: null, avatar_key: "characters/director" });
      expect(await jobCount(tx, `avatar:${who.memberId}`)).toBe(1);
      await tx.as(f.a.members[0].claims);
      expect(await readable(tx, name)).toBe(false);
    });
  });

  it("no_photo — a library avatar alone has nothing to remove, and nothing is written", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx);
      await tx.as(who.claims);
      expect(await call(tx, `public.remove_avatar_photo()`)).toEqual({ status: "no_photo" });
      await tx.asOwner();
      expect(await jobCount(tx, `avatar:${who.memberId}`)).toBe(0);
    });
  });
});

describe("RPC-request_avatar_google", () => {
  it("★ replaces_upload — the upload's version is cleared in the statement and the import enqueued", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: "declined", version: 1790000000500, source: "upload" });
      const name = await storeCopy(tx, f.a.id, who.memberId, 1790000000500);
      await tx.as(who.claims);
      expect(await call(tx, `public.request_avatar_google()`)).toEqual({ status: "ok" });
      await tx.asOwner();
      expect(await row(tx, who.memberId)).toMatchObject({ avatar_version: null, avatar_source: null, avatar_import: "accepted" });
      expect(await jobCount(tx, `avatar:${who.memberId}`)).toBe(1);
      const audits = await answerAudits(tx, f.a.id, who.memberId);
      expect(audits[0]).toMatchObject({ before: { answer: "declined" }, after: { answer: "accepted" }, reason: "sheet" });
      await tx.as(f.a.members[0].claims);
      expect(await readable(tx, name)).toBe(false);

      // …and the copy it then makes is recorded, as `google`.
      await tx.asServiceRole();
      const [{ r }] = await tx.q<{ r: { status: string } }>(`select public.record_avatar_copy($1, 1790000000900, $2) as r`, [who.memberId, SOURCE]);
      expect(r.status).toBe("recorded");
      await tx.asOwner();
      expect((await row(tx, who.memberId)).avatar_source).toBe("google");
    });
  });

  it("keeps_current_copy — a Google copy stays until the fresh one lands", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: "accepted", version: 1790000000000, source: "google" });
      await tx.as(who.claims);
      await tx.q(`select public.request_avatar_google()`);
      await tx.asOwner();
      expect(await row(tx, who.memberId)).toMatchObject({ avatar_version: "1790000000000", avatar_source: "google" });
      expect(await answerAudits(tx, f.a.id, who.memberId)).toHaveLength(0); // no flip, no line
    });
  });

  it("no_source — Google gave no picture, nothing is written", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx, { url: null, version: 1790000000500, source: "upload" });
      await tx.as(who.claims);
      expect(await call(tx, `public.request_avatar_google()`)).toEqual({ status: "no_source" });
      await tx.asOwner();
      expect(await row(tx, who.memberId)).toMatchObject({ avatar_version: "1790000000500", avatar_source: "upload", avatar_import: null });
      expect(await jobCount(tx, `avatar:${who.memberId}`)).toBe(0);
    });
  });

  it("cancels_pending — an upload in flight loses to «من Google» committed after it", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx);
      await tx.as(who.claims);
      await tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD]);
      await tx.q(`select public.request_avatar_google()`);
      const [{ s }] = await tx.q<{ s: { state: string } }>(`select public.my_avatar_upload($1) as s`, [UPLOAD]);
      expect(s.state).toBe("cancelled");
    });
  });
});

describe("RPC-my_avatar.sheet_keys", () => {
  it("the sheet reads the key and the source, still never the URL", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx, { answer: "accepted", version: 1790000000000, source: "google" });
      await tx.as(who.claims);
      expect(await call(tx, `public.my_avatar()`)).toEqual({
        answer: "accepted",
        has_source: true,
        version: 1790000000000,
        key: "characters/director",
        source: "google",
      });
    });
  });
});

describe("the sheet's writes are the member's own", () => {
  it("anon is refused every one; the internal helpers are callable by nobody", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx);
      await tx.asAnon();
      for (const sql of [
        `public.set_avatar_library('objects/reel')`,
        `public.remove_avatar_photo()`,
        `public.request_avatar_google()`,
        `public.my_avatar_upload('${UPLOAD}')`,
      ]) {
        expect(await errorCode(() => tx.q(`select ${sql}`))).toBe(PERMISSION_DENIED);
      }
      for (const become of [() => tx.as(who.claims), () => tx.asServiceRole()]) {
        await become();
        expect(await errorCode(() => tx.q(`select public.avatar_leave_photo($1, null)`, [who.memberId]))).toBe(PERMISSION_DENIED);
        expect(await errorCode(() => tx.q(`select public.enqueue_avatar_reconcile($1)`, [who.memberId]))).toBe(PERMISSION_DENIED);
      }
    });
  });
});
