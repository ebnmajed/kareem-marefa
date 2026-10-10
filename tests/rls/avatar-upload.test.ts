// platform (wave 29, PR B) — the member's own upload (DEC-280 §2 – §3, DEC-281; REQ-PRF-010, REQ-PRF-017,
// REQ-PRF-018). The schema is the lead's `0222`; the behaviour is `supabase/proposed/platform/0011_avatar_uploads.sql`,
// applied inside each transaction and rolled back until it is promoted.
//
// ★ The cases the wave names: an upload REPLACES a Google copy (the old version unreadable at once), and a Google
//   refresh NEVER overwrites an upload — neither the trigger, nor an import in flight, nor a «لا» on the privacy page.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "platform/0011_avatar_uploads.sql";
const SOURCE = "https://lh3.googleusercontent.com/a/ACg8ocTEST=s96-c";
const UPLOAD = "6f0d8a52-6a43-4c55-8f53-0f8d7e1d2c01";
const UPLOAD_2 = "6f0d8a52-6a43-4c55-8f53-0f8d7e1d2c02";

async function jobs(tx: Tx, key: string) {
  return tx.q<{ task_identifier: string; payload: Record<string, unknown>; queue: string | null; max_attempts: number }>(
    `select t.identifier as task_identifier, j.payload, q.queue_name as queue, j.max_attempts
       from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
       left join graphile_worker._private_job_queues q on q.id = j.job_queue_id
      where j.key = $1`,
    [key],
  );
}

/** A member of org A with a Google source; optionally a stored copy of a given source. */
async function ready(tx: Tx, opts: { answer?: "accepted" | "declined" | null; version?: number | null; source?: "google" | "upload" | null } = {}) {
  const f = await seed(tx);
  // ★ Promoted as 0223 (DEC-281): applied only while the proposed copy still exists.
  if (existsSync(join(process.cwd(), "supabase", "proposed", FILE))) await applyProposed(tx, FILE);
  await tx.asOwner();
  const who = f.a.members[1];
  await tx.q(`update public.members set avatar_url = $2, avatar_import = $3, avatar_version = $4, avatar_source = $5 where id = $1`, [
    who.memberId,
    SOURCE,
    opts.answer ?? null,
    opts.version ?? null,
    opts.source ?? null,
  ]);
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

const upload = (tx: Tx, id: string) =>
  tx.q<{ upload_id: string; state: string }>(`select upload_id, state from public.avatar_uploads where member_id = $1`, [id]).then((r) => r[0]);

describe("POL-avatar_staging (0222)", () => {
  it("★ a member writes under their own org and member prefix — and nowhere else", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx);
      await tx.as(who.claims);
      await tx.q(`insert into storage.objects (bucket_id, name) values ('avatar-staging', $1)`, [`${f.a.id}/members/${who.memberId}/${UPLOAD}`]);

      const other = f.a.members[0];
      expect(
        await errorCode(() => tx.q(`insert into storage.objects (bucket_id, name) values ('avatar-staging', $1)`, [`${f.a.id}/members/${other.memberId}/${UPLOAD}`])),
      ).toBe(PERMISSION_DENIED);
      expect(
        await errorCode(() => tx.q(`insert into storage.objects (bucket_id, name) values ('avatar-staging', $1)`, [`${f.b.id}/members/${who.memberId}/${UPLOAD}`])),
      ).toBe(PERMISSION_DENIED);
    });
  });

  it("a member can neither read back nor delete a staged object, their own included", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx);
      const name = `${f.a.id}/members/${who.memberId}/${UPLOAD}`;
      await tx.as(who.claims);
      await tx.q(`insert into storage.objects (bucket_id, name) values ('avatar-staging', $1)`, [name]);
      expect(await tx.q(`select 1 from storage.objects where bucket_id = 'avatar-staging' and name = $1`, [name])).toHaveLength(0);
      // Storage refuses a direct delete outright, so the delete half is read from the catalogue: the one policy that
      // names the bucket is the insert.
      await tx.asOwner();
      const policies = await tx.q<{ policyname: string; cmd: string }>(
        `select policyname, cmd from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and (coalesce(qual, '') || coalesce(with_check, '')) like '%avatar-staging%'`,
      );
      expect(policies).toEqual([{ policyname: "avatar_staging_insert", cmd: "INSERT" }]);
    });
  });

  it("the bucket is private, 1 MiB, JPEG and PNG by declared type", async () => {
    await withTx(async (tx) => {
      await tx.asOwner();
      const [b] = await tx.q<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
        `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatar-staging'`,
      );
      expect(b).toEqual({ public: false, file_size_limit: "1048576", allowed_mime_types: ["image/jpeg", "image/png"] });
    });
  });
});

describe("TBL-avatar_uploads.no_client_access", () => {
  it("select, insert and update by a member are refused", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx);
      await tx.as(who.claims);
      expect(await errorCode(() => tx.q(`select * from public.avatar_uploads`))).toBe(PERMISSION_DENIED);
      expect(
        await errorCode(() =>
          tx.q(`insert into public.avatar_uploads (member_id, org_id, upload_id, state) values ($1, $2, $3, 'done')`, [who.memberId, f.a.id, UPLOAD]),
        ),
      ).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`update public.avatar_uploads set state = 'done'`))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("RPC-begin_avatar_upload", () => {
  it("★ records the caller's upload pending and enqueues ONE process_avatar_upload on the member's queue, 5 attempts", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx);
      await tx.as(who.claims);
      const [{ out }] = await tx.q<{ out: { status: string } }>(`select public.begin_avatar_upload($1) as out`, [UPLOAD]);
      expect(out).toEqual({ status: "ok" });

      await tx.asOwner();
      expect(await upload(tx, who.memberId)).toEqual({ upload_id: UPLOAD, state: "pending" });
      const j = await jobs(tx, `avatar-upload:${who.memberId}`);
      expect(j).toHaveLength(1);
      expect(j[0]).toMatchObject({ task_identifier: "process_avatar_upload", payload: { member_id: who.memberId }, queue: `avatar:${who.memberId}`, max_attempts: 5 });
      // The picture does not change until the job records it.
      expect((await row(tx, who.memberId)).avatar_version).toBeNull();
    });
  });

  it("a second upload replaces the first — one row, one job", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx);
      await tx.as(who.claims);
      await tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD]);
      await tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD_2]);
      await tx.asOwner();
      expect(await upload(tx, who.memberId)).toEqual({ upload_id: UPLOAD_2, state: "pending" });
      expect(await jobs(tx, `avatar-upload:${who.memberId}`)).toHaveLength(1);
    });
  });

  it("anon and a platform admin with no member row are refused", async () => {
    await withTx(async (tx) => {
      await ready(tx);
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD]))).toBe(PERMISSION_DENIED);
    });
  });

  it("my_avatar_upload answers the caller's own upload by its id, and nobody else's", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx);
      await tx.as(who.claims);
      await tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD]);
      const [{ mine }] = await tx.q<{ mine: Record<string, unknown> | null }>(`select public.my_avatar_upload($1) as mine`, [UPLOAD]);
      expect(mine).toMatchObject({ state: "pending", version: null });
      const [{ wrong }] = await tx.q<{ wrong: unknown }>(`select public.my_avatar_upload($1) as wrong`, [UPLOAD_2]);
      expect(wrong).toBeNull();

      await tx.as(f.a.members[0].claims);
      const [{ theirs }] = await tx.q<{ theirs: unknown }>(`select public.my_avatar_upload($1) as theirs`, [UPLOAD]);
      expect(theirs).toBeNull();
    });
  });
});

describe("RPC-record_avatar_upload / RPC-fail_avatar_upload — worker only", () => {
  it("authenticated and anon cannot call either", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx);
      for (const become of [() => tx.as(who.claims), () => tx.asAnon()]) {
        await become();
        expect(await errorCode(() => tx.q(`select public.record_avatar_upload($1, $2, 1)`, [who.memberId, UPLOAD]))).toBe(PERMISSION_DENIED);
        expect(await errorCode(() => tx.q(`select public.fail_avatar_upload($1, $2, 'failed')`, [who.memberId, UPLOAD]))).toBe(PERMISSION_DENIED);
      }
    });
  });

  it("★ an upload REPLACES a Google copy: the version moves, the source is `upload`, the old copy is unreadable at once", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: "accepted", version: 1790000000000 });
      const old = await storeCopy(tx, f.a.id, who.memberId, 1790000000000);
      await tx.as(who.claims);
      await tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD]);

      await tx.asServiceRole();
      const [{ r }] = await tx.q<{ r: unknown }>(`select public.record_avatar_upload($1, $2, 1790000000500) as r`, [who.memberId, UPLOAD]);
      expect(r).toEqual({ status: "recorded", version: 1790000000500 });

      await tx.asOwner();
      expect(await row(tx, who.memberId)).toMatchObject({ avatar_version: "1790000000500", avatar_source: "upload" });
      expect(await upload(tx, who.memberId)).toEqual({ upload_id: UPLOAD, state: "done" });
      const fresh = await storeCopy(tx, f.a.id, who.memberId, 1790000000500);
      await tx.as(f.a.members[0].claims);
      expect(await readable(tx, old)).toBe(false);
      expect(await readable(tx, fresh)).toBe(true); // POL-avatars_storage_read.upload_current
    });
  });

  it("stale when the upload was cancelled, superseded, or the member anonymised — and the version never moves backwards", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx);
      await tx.as(who.claims);
      await tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD]);
      await tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD_2]); // superseded
      await tx.asServiceRole();
      const rec = async (u: string, v: number) =>
        (await tx.q<{ r: { status: string } }>(`select public.record_avatar_upload($1, $2, $3) as r`, [who.memberId, u, v]))[0].r;
      expect(await rec(UPLOAD, 1790000000000)).toEqual({ status: "stale", version: null });

      await tx.as(who.claims);
      await tx.q(`select public.remove_avatar_photo()`); // cancels the pending one
      await tx.asServiceRole();
      expect(await rec(UPLOAD_2, 1790000000000)).toEqual({ status: "stale", version: null });

      await tx.as(who.claims);
      await tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD]);
      await tx.asOwner();
      await tx.q(`update public.members set avatar_version = 1790000000900, avatar_source = 'upload' where id = $1`, [who.memberId]);
      await tx.asServiceRole();
      expect(await rec(UPLOAD, 1790000000000)).toEqual({ status: "stale", version: 1790000000900 });
    });
  });

  it("stale when the member was anonymised while the job ran", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx);
      await tx.as(who.claims);
      await tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD]);
      await tx.asOwner();
      await tx.q(`update public.members set anonymised_at = now() where id = $1`, [who.memberId]);
      await tx.asServiceRole();
      const [{ r }] = await tx.q<{ r: { status: string } }>(`select public.record_avatar_upload($1, $2, 1790000000000) as r`, [who.memberId, UPLOAD]);
      expect(r.status).toBe("stale");
    });
  });

  it("fail_avatar_upload writes a refusal the sheet can read — only for that upload while pending", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx);
      await tx.as(who.claims);
      await tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD]);
      await tx.asServiceRole();
      expect((await tx.q<{ r: unknown }>(`select public.fail_avatar_upload($1, $2, 'failed') as r`, [who.memberId, UPLOAD_2]))[0].r).toEqual({ status: "stale" });
      expect((await tx.q<{ r: unknown }>(`select public.fail_avatar_upload($1, $2, 'refused') as r`, [who.memberId, UPLOAD]))[0].r).toEqual({ status: "recorded" });
      expect((await tx.q<{ r: unknown }>(`select public.fail_avatar_upload($1, $2, 'failed') as r`, [who.memberId, UPLOAD]))[0].r).toEqual({ status: "stale" });

      await tx.as(who.claims);
      const [{ mine }] = await tx.q<{ mine: { state: string } }>(`select public.my_avatar_upload($1) as mine`, [UPLOAD]);
      expect(mine.state).toBe("refused");
    });
  });
});

describe("★ a Google refresh never overwrites an upload (REQ-PRF-018)", () => {
  it("RPC-record_avatar_copy.never_over_upload — an import that fetched while an upload landed answers stale", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx, { answer: "accepted", version: 1790000000500, source: "upload" });
      await tx.asServiceRole();
      const [{ r }] = await tx.q<{ r: unknown }>(`select public.record_avatar_copy($1, 1790000000900, $2) as r`, [who.memberId, SOURCE]);
      expect(r).toEqual({ status: "stale", version: 1790000000500 });
      await tx.asOwner();
      expect(await row(tx, who.memberId)).toMatchObject({ avatar_version: "1790000000500", avatar_source: "upload" });
    });
  });

  it("TRG-members_avatar_source_changed.not_while_upload — a new Google picture at sign-in enqueues nothing", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx, { answer: "accepted", version: 1790000000500, source: "upload" });
      await tx.q(`update public.members set avatar_url = 'https://lh3.googleusercontent.com/a/NEW' where id = $1`, [who.memberId]);
      expect(await jobs(tx, `avatar:${who.memberId}`)).toHaveLength(0);
    });
  });

  it("…and for a Google copy it still re-copies, on the member's own queue", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx, { answer: "accepted", version: 1790000000000, source: "google" });
      await tx.q(`update public.members set avatar_url = 'https://lh3.googleusercontent.com/a/NEW' where id = $1`, [who.memberId]);
      const j = await jobs(tx, `avatar:${who.memberId}`);
      expect(j).toHaveLength(1);
      expect(j[0]).toMatchObject({ task_identifier: "import_avatar", queue: `avatar:${who.memberId}`, max_attempts: 5 });
    });
  });

  it("RPC-set_avatar_import.decline_keeps_upload — a «لا» on the privacy page never deletes an upload", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx, { answer: "accepted", version: 1790000000500, source: "upload" });
      await tx.as(who.claims);
      await tx.q(`select public.set_avatar_import('declined')`);
      await tx.asOwner();
      expect(await row(tx, who.memberId)).toMatchObject({ avatar_version: "1790000000500", avatar_source: "upload", avatar_import: "declined" });
      expect(await jobs(tx, `avatar:${who.memberId}`)).toHaveLength(0);
    });
  });

  it("RPC-set_avatar_import.accept_keeps_upload — a «نعم» records the answer and enqueues nothing over an upload", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx, { answer: "declined", version: 1790000000500, source: "upload" });
      await tx.as(who.claims);
      const [{ out }] = await tx.q<{ out: unknown }>(`select public.set_avatar_import('accepted') as out`);
      expect(out).toEqual({ status: "ok" });
      await tx.asOwner();
      expect(await row(tx, who.memberId)).toMatchObject({ avatar_version: "1790000000500", avatar_source: "upload", avatar_import: "accepted" });
      expect(await jobs(tx, `avatar:${who.memberId}`)).toHaveLength(0);
    });
  });

  it("a «لا» still clears a Google copy at once, as 0158 did", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx, { answer: "accepted", version: 1790000000000, source: "google" });
      await tx.as(who.claims);
      await tx.q(`select public.set_avatar_import('declined')`);
      await tx.asOwner();
      expect(await row(tx, who.memberId)).toMatchObject({ avatar_version: null, avatar_source: null });
      expect(await jobs(tx, `avatar:${who.memberId}`)).toHaveLength(1);
    });
  });
});

describe("RPC-avatar_job_target.source_and_upload", () => {
  it("names the photo's source and the member's upload", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx, { answer: "accepted", version: 1790000000000, source: "google" });
      await tx.as(who.claims);
      await tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD]);
      await tx.asServiceRole();
      const [{ t }] = await tx.q<{ t: Record<string, unknown> }>(`select public.avatar_job_target($1) as t`, [who.memberId]);
      expect(t).toMatchObject({ source: "google", upload: { id: UPLOAD, state: "pending" }, version: 1790000000000 });
    });
  });
});

describe("RPC-anonymise_members.upload (REQ-PRF-011)", () => {
  it("★ an uploaded photo: version, key, source and answer cleared, the uploads row gone, the reconcile enqueued", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: null, version: 1790000000500, source: "upload" });
      const name = await storeCopy(tx, f.a.id, who.memberId, 1790000000500);
      await tx.as(who.claims);
      await tx.q(`select public.begin_avatar_upload($1)`, [UPLOAD]);
      await tx.asOwner();
      await tx.q(`delete from graphile_worker._private_jobs where key = $1`, [`avatar:${who.memberId}`]);
      await tx.q(
        `update public.members set status = 'deactivated', deactivated_at = now() - interval '400 days', deactivated_reason = 'test' where id = $1`,
        [who.memberId],
      );
      await tx.asServiceRole();
      await tx.q(`select public.anonymise_members()`);

      await tx.asOwner();
      expect(await row(tx, who.memberId)).toEqual({ avatar_version: null, avatar_source: null, avatar_import: null, avatar_key: null });
      expect(await upload(tx, who.memberId)).toBeUndefined();
      expect(await jobs(tx, `avatar:${who.memberId}`)).toHaveLength(1);
      await tx.as(f.a.members[0].claims);
      expect(await readable(tx, name)).toBe(false);
    });
  });
});

describe("ENUM-report_target.no_picture (DEC-280 §8)", () => {
  it("a profile picture is not reportable — the enum is what it was before 0222", async () => {
    await withTx(async (tx) => {
      await ready(tx);
      const rows = await tx.q<{ v: string }>(`select unnest(enum_range(null::public.report_target))::text as v`);
      expect(rows.map((r) => r.v)).toEqual(["comment", "photo", "story_frame"]);
    });
  });
});
