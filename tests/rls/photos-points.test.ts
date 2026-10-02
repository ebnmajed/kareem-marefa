// The photo award's trigger on `photos` — content · wave 20, PR C (DEC-220 §2, DEC-222 §1.1; REQ-UIX-083,
// REQ-PTS-013, REQ-EVT-010 … 012). `content` decides WHEN (`photos_points()`); `scoring` decides what is paid
// (`award_photo_points`, `reverse_photo_points`). Both proposed files are applied inside each rolled-back transaction,
// `scoring`'s first (DEC-040). The award follows visibility: an insert pays, a hide reverses, a restore re-pays, and a
// removal is `scoring`'s alone.
//
// ★ The award is a JOB: `award_photo_points()` enqueues the existing `award_points` job keyed `pts:photo:<id>:v<epoch>`
// (scoring's plan). So each case asserts the job and its key, then RUNS it — the worker's own call,
// `public.award_points(rule, member, source, source_id, session)` with the job's payload — to see the ledger. A
// reversal is synchronous SQL and is asserted on the ledger directly.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, PERMISSION_DENIED, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

// ★ Order matters: the trigger calls `scoring`'s functions.
const PROPOSED = ["scoring/w20c_0001_photo_award.sql", "content/w20_photo_points_trigger.sql"];

type Seeded = Awaited<ReturnType<typeof seed>>;

async function setup(tx: Tx): Promise<Seeded> {
  const f = await seed(tx);
  for (const file of PROPOSED) await applyProposed(tx, file);
  return f;
}

/** A stripped photo, written the only way one is since 0174: `record_photo_upload()`, as the worker. */
async function upload(tx: Tx, f: Seeded, uploader: string, session: string): Promise<string> {
  const id = randomUUID();
  await tx.asServiceRole();
  await tx.q(`select public.record_photo_upload($1, $2, $3, $4, $5, 1000, $6, 10, 20)`, [
    id,
    f.a.id,
    session,
    uploader,
    `${f.a.id}/sessions/${session}/photos/${id}.webp`,
    randomUUID().replace(/-/g, "").padEnd(64, "0"),
  ]);
  await tx.asOwner();
  return id;
}

interface Job {
  key: string;
  payload: { rule: string; member_id: string; source: string; source_id: string; session_id: string | null };
}

/** The `award_points` jobs a photo has enqueued, in key order. */
async function jobsFor(tx: Tx, photo: string): Promise<Job[]> {
  await tx.asOwner();
  return tx.q<Job>(
    `select j.key, j.payload
       from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = 'award_points' and j.key like $1
      order by j.key`,
    [`pts:photo:${photo}:v%`],
  );
}

/** Run a job as the worker does, then drop it — `main`'s and the new worker's `award_points` task, verbatim. */
async function runJob(tx: Tx, job: Job): Promise<void> {
  await tx.asServiceRole();
  const p = job.payload;
  await tx.q(`select public.award_points($1, $2, $3::public.ledger_source, $4, $5)`, [p.rule, p.member_id, p.source, p.source_id, p.session_id]);
  await tx.asOwner();
  await tx.q(`delete from graphile_worker._private_jobs where key = $1`, [job.key]);
}

/** Upload, assert the one job its insert enqueued, and run it. */
async function uploadAndPay(tx: Tx, f: Seeded, uploader: string, session: string): Promise<string> {
  const photo = await upload(tx, f, uploader, session);
  const jobs = await jobsFor(tx, photo);
  expect(jobs.map((j) => j.key)).toEqual([`pts:photo:${photo}:v1`]);
  await runJob(tx, jobs[0]);
  return photo;
}

interface Row {
  amount: number;
  source: string;
  reason: string;
}

/** Every ledger row a photo produced: its awards and the reversals that name them, in the order written. */
async function ledgerFor(tx: Tx, photo: string): Promise<Row[]> {
  await tx.asOwner();
  return tx.q<Row>(
    `select l.amount, l.source::text as source, l.reason
       from public.points_ledger l
      where (l.source = 'photo' and l.source_id = $1)
         or (l.source = 'reversal' and l.source_id in (select a.id from public.points_ledger a where a.source = 'photo' and a.source_id = $1))
      order by l.occurred_at, l.id`,
    [photo],
  );
}

const net = (rows: Row[]) => rows.reduce((sum, r) => sum + r.amount, 0);

describe("POL-photos.points", () => {
  it("1 · as the uploader: a direct insert is refused (0174); a photo the worker writes pays one `photo` award", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const uploader = f.a.members[1];

      await tx.as(uploader.claims);
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.photos (org_id, session_id, uploader_id, storage_path, byte_size, sha256, exif_stripped)
             values ($1, $2, $3, 'x.webp', 1000, $4, true)`,
            [f.a.id, f.m2.a.published, uploader.memberId, "a".repeat(64)],
          ),
        ),
      ).toBe(PERMISSION_DENIED);

      const photo = await upload(tx, f, uploader.memberId, f.m2.a.published);
      const [job] = await jobsFor(tx, photo);
      expect(job.key).toBe(`pts:photo:${photo}:v1`);
      expect(job.payload).toEqual({ rule: "photo", member_id: uploader.memberId, source: "photo", source_id: photo, session_id: f.m2.a.published });
      await runJob(tx, job);
      const rows = await ledgerFor(tx, photo);
      expect(rows.map((r) => [r.source, r.amount])).toEqual([["photo", 3]]);
      const [owner] = await tx.q<{ member_id: string; session_id: string }>(
        `select member_id, session_id from public.points_ledger where source = 'photo' and source_id = $1`,
        [photo],
      );
      expect(owner).toEqual({ member_id: uploader.memberId, session_id: f.m2.a.published });
    });
  });

  it("2 · as a member requesting a takedown: the hide reverses the uploader's award once, «أُخفيت الصورة», and nothing reaches the requester", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const photo = await uploadAndPay(tx, f, f.a.members[1].memberId, f.m2.a.published);

      await tx.as(f.a.members[0].claims);
      await tx.q(`insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3)`, [f.a.id, photo, f.a.members[0].memberId]);

      expect(await jobsFor(tx, photo)).toEqual([]);
      const rows = await ledgerFor(tx, photo);
      expect(rows.map((r) => [r.source, r.amount, r.reason])).toEqual([
        ["photo", 3, rows[0].reason],
        ["reversal", -3, "أُخفيت الصورة"],
      ]);
      // The requester is paid and charged nothing.
      expect(
        await tx.q(`select 1 from public.points_ledger where member_id = $1 and source in ('photo', 'reversal') and session_id = $2`, [f.a.members[0].memberId, f.m2.a.published]),
      ).toHaveLength(0);

      // The requester reads none of the uploader's ledger rows.
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select 1 from public.points_ledger where member_id = $1 and source in ('photo', 'reversal')`, [f.a.members[1].memberId])).toHaveLength(0);
    });
  });

  it("3 · as a moderator: a removal reverses once on scoring's path; restored, paid once more — never twice net", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const uploader = f.a.members[1].memberId;

      // A visible photo removed: one reversal, the removal's own reason — this trigger never reached it.
      const removed = await uploadAndPay(tx, f, uploader, f.m2.a.published);
      await tx.as(f.a.mod.claims);
      await tx.q(`select public.remove_photo($1, 'سبب الإزالة')`, [removed]);
      const afterRemoval = await ledgerFor(tx, removed);
      expect(afterRemoval.filter((r) => r.source === "reversal").map((r) => [r.amount, r.reason])).toEqual([[-3, "حُذف المحتوى"]]);

      // Hidden by a takedown, then removed: still ONE reversal, the hide's.
      const hiddenThenRemoved = await uploadAndPay(tx, f, uploader, f.m2.a.published);
      await tx.as(f.a.members[0].claims);
      await tx.q(`insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3)`, [f.a.id, hiddenThenRemoved, f.a.members[0].memberId]);
      await tx.as(f.a.mod.claims);
      await tx.q(`select public.remove_photo($1, 'سبب الإزالة')`, [hiddenThenRemoved]);
      const both = await ledgerFor(tx, hiddenThenRemoved);
      expect(both.filter((r) => r.source === "reversal").map((r) => [r.amount, r.reason])).toEqual([[-3, "أُخفيت الصورة"]]);

      // Award → hide → restore → hide: two awards, two reversals; one award standing while it was restored.
      const restored = await uploadAndPay(tx, f, uploader, f.m2.a.published);
      await tx.as(f.a.members[0].claims);
      const [{ id: takedown }] = await tx.q<{ id: string }>(
        `insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3) returning id`,
        [f.a.id, restored, f.a.members[0].memberId],
      );
      expect(net(await ledgerFor(tx, restored))).toBe(0);

      await tx.as(f.a.mod.claims);
      await tx.q(`update public.photo_takedowns set resolved_at = now(), resolution = 'restored' where id = $1`, [takedown]);
      const restoreJobs = await jobsFor(tx, restored);
      expect(restoreJobs.map((j) => j.key)).toEqual([`pts:photo:${restored}:v2`]);
      await runJob(tx, restoreJobs[0]);
      const afterRestore = await ledgerFor(tx, restored);
      expect(net(afterRestore)).toBe(3);
      expect(afterRestore.filter((r) => r.source === "photo")).toHaveLength(2);

      await tx.as(f.a.mod.claims);
      await tx.q(`update public.photos set hidden_at = now(), hidden_reason = 'staff' where id = $1`, [restored]);
      expect(net(await ledgerFor(tx, restored))).toBe(0);

      // An unhide of a REMOVED photo enqueues nothing and never pays.
      await tx.as(f.a.mod.claims);
      await tx.q(`update public.photos set hidden_at = null where id = $1`, [removed]);
      expect(await jobsFor(tx, removed)).toEqual([]);
      expect(net(await ledgerFor(tx, removed))).toBe(0);
    });
  });

  it("4 · as another member: cannot hide a photo, so cannot reach the reversal", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const photo = await uploadAndPay(tx, f, f.a.members[1].memberId, f.m2.a.published);

      await tx.as(f.a.members[0].claims);
      // The column grant admits the statement; `p6_staff_update` matches no row for a member.
      await tx.q(`update public.photos set hidden_at = now() where id = $1`, [photo]);

      await tx.asOwner();
      const [row] = await tx.q<{ hidden_at: string | null }>(`select hidden_at from public.photos where id = $1`, [photo]);
      expect(row.hidden_at).toBeNull();
      expect(net(await ledgerFor(tx, photo))).toBe(3);
    });
  });

  it("5 · the cap is the rule's: the sixth photo on one session pays nothing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const [{ points, cap }] = await tx.q<{ points: number; cap: number }>(
        `select points, cap_per_session as cap from public.scoring_rules where org_id = $1 and action_key = 'photo'`,
        [f.a.id],
      );
      const photos: string[] = [];
      for (let i = 0; i <= cap; i++) photos.push(await uploadAndPay(tx, f, f.a.members[1].memberId, f.m2.a.published));

      const [{ total }] = await tx.q<{ total: number }>(
        `select coalesce(sum(amount), 0)::int as total from public.points_ledger where member_id = $1 and session_id = $2 and rule_key = 'photo'`,
        [f.a.members[1].memberId, f.m2.a.published],
      );
      expect(total).toBe(points * cap);
      expect(await ledgerFor(tx, photos[cap])).toEqual([]);
    });
  });

  it("6 · a reason edit or a re-scope fires nothing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const photo = await uploadAndPay(tx, f, f.a.members[1].memberId, f.m2.a.published);
      await tx.asOwner();
      await tx.q(`update public.photos set hidden_reason = 'ملاحظة', session_day_id = null where id = $1`, [photo]);
      expect(await jobsFor(tx, photo)).toEqual([]);
      expect((await ledgerFor(tx, photo)).map((r) => r.source)).toEqual(["photo"]);
    });
  });

  it("7 · a photo deleted by a cascade writes no reversal and raises nothing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const photo = await uploadAndPay(tx, f, f.a.members[1].memberId, f.m2.a.published);
      await tx.asOwner();
      await tx.q(`delete from public.photos where id = $1`, [photo]);
      expect(await jobsFor(tx, photo)).toEqual([]);
      expect((await ledgerFor(tx, photo)).map((r) => r.source)).toEqual(["photo"]);
    });
  });
});
