// platform (wave 14) — Google's photo copied into our storage (REQ-PRF-008,
// REQ-PRF-009, REQ-PRF-011, REQ-NFR-014; DEC-099, DEC-180 §3, DEC-182).
// The schema is the lead's `0157`; the behaviour is
// `supabase/proposed/platform/0010_avatar_import.sql`, applied inside each
// transaction and rolled back until it is promoted.
//
// ★ The two cases the wave's definition of done names: a member of ANOTHER org
// is refused our copy, and after anonymisation nothing is readable and the
// delete is enqueued.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, withTx, type Tx } from "./db";
import { seed } from "./fixture";

const FILE = "platform/0010_avatar_import.sql";
// ★ Wave 29 (DEC-281): 0158's writers widened for an upload and moved onto the member's own queue.
const WAVE29 = "platform/0011_avatar_uploads.sql";
const SOURCE = "https://lh3.googleusercontent.com/a/ACg8ocTEST=s96-c";

async function apply(tx: Tx) {
  if (existsSync(join(process.cwd(), "supabase", "proposed", FILE))) await applyProposed(tx, FILE);
  await applyProposed(tx, WAVE29);
}

async function jobsForKey(tx: Tx, key: string) {
  return tx.q<{ task_identifier: string; payload: Record<string, unknown>; queue: string | null }>(
    `select t.identifier as task_identifier, j.payload, q.queue_name as queue
       from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
       left join graphile_worker._private_job_queues q on q.id = j.job_queue_id
      where j.key = $1`,
    [key],
  );
}

/** A member of org A with a Google source and, optionally, a stored copy. */
async function ready(tx: Tx, opts: { answer?: "accepted" | "declined" | null; version?: number | null } = {}) {
  const f = await seed(tx);
  await apply(tx);
  await tx.asOwner();
  const who = f.a.members[1];
  await tx.q(`update public.members set avatar_url = $2, avatar_import = $3, avatar_version = $4 where id = $1`, [
    who.memberId,
    SOURCE,
    opts.answer ?? null,
    opts.version ?? null,
  ]);
  await tx.q(`delete from graphile_worker._private_jobs where key = $1`, [`avatar:${who.memberId}`]);
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

describe("POL-avatars_storage_read (0157)", () => {
  it("★ a member of the same org reads the current copy; a member of ANOTHER org is refused it", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: "accepted", version: 1790000000000 });
      const name = await storeCopy(tx, f.a.id, who.memberId, 1790000000000);

      await tx.as(f.a.members[0].claims);
      expect(await readable(tx, name)).toBe(true);

      await tx.as(f.b.members[0].claims);
      expect(await readable(tx, name)).toBe(false);
      await tx.as(f.b.admin.claims);
      expect(await readable(tx, name)).toBe(false);
    });
  });

  it("a stale version is refused — only the current copy is ever served", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: "accepted", version: 1790000000000 });
      const old = await storeCopy(tx, f.a.id, who.memberId, 1700000000000);
      await tx.as(f.a.members[0].claims);
      expect(await readable(tx, old)).toBe(false);
    });
  });

  it("no client role writes an avatar object", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx);
      await tx.as(who.claims);
      expect(
        await errorCode(() => tx.q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${f.a.id}/members/${who.memberId}/1/96.webp`])),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("RPC-set_avatar_import", () => {
  it("yes: records the answer, audits it, and enqueues ONE import_avatar on the member's queue under avatar:{id}", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx);
      await tx.as(who.claims);
      const [{ out }] = await tx.q<{ out: { status: string } }>(`select public.set_avatar_import('accepted') as out`);
      expect(out.status).toBe("ok");

      await tx.asOwner();
      const [m] = await tx.q<{ avatar_import: string }>(`select avatar_import from public.members where id = $1`, [who.memberId]);
      expect(m.avatar_import).toBe("accepted");
      const jobs = await jobsForKey(tx, `avatar:${who.memberId}`);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ task_identifier: "import_avatar", payload: { member_id: who.memberId }, queue: `avatar:${who.memberId}` });
      const audit = await tx.q(`select 1 from public.audit_log where org_id = $1 and action = 'member.avatar_import_answered' and subject_id = $2`, [
        f.a.id,
        who.memberId,
      ]);
      expect(audit).toHaveLength(1);
    });
  });

  it("★ no: the version is cleared in the same statement, so the read stops AT ONCE, and the delete is enqueued", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: "accepted", version: 1790000000000 });
      const name = await storeCopy(tx, f.a.id, who.memberId, 1790000000000);
      await tx.as(who.claims);
      await tx.q(`select public.set_avatar_import('declined')`);

      await tx.as(f.a.members[0].claims);
      expect(await readable(tx, name)).toBe(false);
      await tx.asOwner();
      expect(await jobsForKey(tx, `avatar:${who.memberId}`)).toHaveLength(1);
    });
  });

  it("yes with no Google source: the answer is kept, nothing is enqueued, and it says so", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx);
      await tx.asOwner();
      await tx.q(`update public.members set avatar_url = null where id = $1`, [who.memberId]);
      await tx.as(who.claims);
      const [{ out }] = await tx.q<{ out: { status: string } }>(`select public.set_avatar_import('accepted') as out`);
      expect(out.status).toBe("no_source");
      await tx.asOwner();
      expect(await jobsForKey(tx, `avatar:${who.memberId}`)).toHaveLength(0);
    });
  });

  it("my_avatar() answers for the caller only, and never with the source URL", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: "accepted", version: 1790000000000 });
      await tx.as(who.claims);
      const [{ mine }] = await tx.q<{ mine: Record<string, unknown> }>(`select public.my_avatar() as mine`);
      expect(mine).toEqual({ answer: "accepted", has_source: true, version: 1790000000000, key: expect.any(String), source: "google" });
      expect(JSON.stringify(mine)).not.toContain("googleusercontent");

      await tx.as(f.a.members[0].claims);
      const [{ theirs }] = await tx.q<{ theirs: Record<string, unknown> }>(`select public.my_avatar() as theirs`);
      expect(theirs.version).toBeNull();
    });
  });

  it("the answer column is in no client grant — a member cannot read or write it directly", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx);
      await tx.as(who.claims);
      expect(await errorCode(() => tx.q(`select avatar_import from public.members where id = $1`, [who.memberId]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`update public.members set avatar_version = 1 where id = $1`, [who.memberId]))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("RPC-avatar_job_target / RPC-record_avatar_copy / RPC-avatar_member_orgs — worker only", () => {
  it("authenticated and anon cannot call any of the three", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx);
      for (const become of [() => tx.as(who.claims), () => tx.asAnon()]) {
        await become();
        expect(await errorCode(() => tx.q(`select public.avatar_job_target($1)`, [who.memberId]))).toBe(PERMISSION_DENIED);
        expect(await errorCode(() => tx.q(`select public.record_avatar_copy($1, 1, $2)`, [who.memberId, SOURCE]))).toBe(PERMISSION_DENIED);
        expect(await errorCode(() => tx.q(`select * from public.avatar_member_orgs(array[$1::uuid])`, [who.memberId]))).toBe(PERMISSION_DENIED);
      }
    });
  });

  it("record_avatar_copy records only what is still wanted — stale after a decline, or a changed source", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx, { answer: "accepted" });
      await tx.asServiceRole();
      const rec = async (v: number, src: string) =>
        (await tx.q<{ r: { status: string; version: number | null } }>(`select public.record_avatar_copy($1, $2, $3) as r`, [who.memberId, v, src]))[0].r;

      expect(await rec(1790000000000, SOURCE)).toEqual({ status: "recorded", version: 1790000000000 });
      expect(await rec(1700000000000, SOURCE)).toEqual({ status: "stale", version: 1790000000000 }); // never backwards
      expect(await rec(1790000000001, "https://lh3.googleusercontent.com/a/OTHER")).toMatchObject({ status: "stale" });

      await tx.asOwner();
      await tx.q(`update public.members set avatar_import = 'declined', avatar_version = null where id = $1`, [who.memberId]);
      await tx.asServiceRole();
      expect(await rec(1790000000002, SOURCE)).toEqual({ status: "stale", version: null });
    });
  });

  it("avatar_member_orgs names each member's org", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx);
      await tx.asServiceRole();
      expect(await tx.q(`select member_id, org_id from public.avatar_member_orgs(array[$1::uuid])`, [who.memberId])).toEqual([
        { member_id: who.memberId, org_id: f.a.id },
      ]);
    });
  });
});

describe("TRG-members_avatar_source_changed", () => {
  it("a changed source re-enqueues the copy for a member who said yes — and for nobody else", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: "accepted", version: 1790000000000 });
      await tx.q(`update public.members set avatar_url = 'https://lh3.googleusercontent.com/a/NEW' where id = $1`, [who.memberId]);
      expect(await jobsForKey(tx, `avatar:${who.memberId}`)).toHaveLength(1);

      const other = f.a.members[0];
      await tx.q(`update public.members set avatar_url = $2, avatar_import = null where id = $1`, [other.memberId, SOURCE]);
      await tx.q(`update public.members set avatar_url = 'https://lh3.googleusercontent.com/a/NEW2' where id = $1`, [other.memberId]);
      expect(await jobsForKey(tx, `avatar:${other.memberId}`)).toHaveLength(0);
    });
  });

  it("the same source, re-written on sign-in, enqueues nothing", async () => {
    await withTx(async (tx) => {
      const { who } = await ready(tx, { answer: "accepted" });
      await tx.q(`update public.members set avatar_url = $2 where id = $1`, [who.memberId, SOURCE]);
      expect(await jobsForKey(tx, `avatar:${who.memberId}`)).toHaveLength(0);
    });
  });
});

describe("RPC-anonymise_members.avatar (REQ-PRF-011)", () => {
  it("★ anonymisation clears the answer and the copy's version, the read stops, and the delete is enqueued", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: "accepted", version: 1790000000000 });
      const name = await storeCopy(tx, f.a.id, who.memberId, 1790000000000);
      await tx.q(
        `update public.members set status = 'deactivated', deactivated_at = now() - interval '400 days', deactivated_reason = 'test' where id = $1`,
        [who.memberId],
      );
      await tx.asServiceRole();
      const [{ s }] = await tx.q<{ s: Record<string, number> }>(`select public.anonymise_members() as s`);
      expect(Object.keys(s).sort()).toEqual(["after_days", "anonymised"]); // the summary is unchanged

      await tx.asOwner();
      const [m] = await tx.q<{ avatar_url: string | null; avatar_import: string | null; avatar_version: string | null }>(
        `select avatar_url, avatar_import, avatar_version from public.members where id = $1`,
        [who.memberId],
      );
      expect(m).toEqual({ avatar_url: null, avatar_import: null, avatar_version: null });
      expect(await jobsForKey(tx, `avatar:${who.memberId}`)).toHaveLength(1);

      await tx.as(f.a.members[0].claims);
      expect(await readable(tx, name)).toBe(false);
    });
  });
});
