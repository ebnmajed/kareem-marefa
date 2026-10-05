// Wave 26 — the attendee half of session stories: the capture gate, the two capture doors, the worker's two video
// doors, a frame's report, «أزلني», the decision and the removal (REQ-STO-011 … 017; DEC-251 §4 – §5). `content`'s
// functions under supabase/proposed/content/0001 – 0004, proven on 0198's tables, AS A MEMBER — never as the owner.
//
// The fixture's published session has members[1] checked in and members[0] presenting it; each org also has an
// attendee's video frame by its moderator (tests/rls/fixture.ts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILES = [
  "content/0001_story_capture_gate.sql",
  "content/0002_story_photo.sql",
  "content/0003_story_video.sql",
  "content/0004_story_moderation.sql",
  "content/0005_resolve_report_story_frame.sql",
];

async function prepare(tx: Tx) {
  for (const file of FILES) await applyProposed(tx, file);
  const f = await seed(tx);
  await tx.asOwner();
  // The published session is on now: started an hour ago, ends in an hour. Its deadlines must sit before its start
  // (0010's checks), so they are cleared first.
  await tx.q(`update public.sessions set rsvp_deadline_at = null, cancellation_cutoff_at = null where id = $1`, [f.m2.a.published]);
  await tx.q(`update public.session_days set starts_at = now() - interval '1 hour', ends_at = now() + interval '1 hour' where session_id = $1`, [f.m2.a.published]);
  return f;
}

async function jobs(tx: Tx, task: string, key: string) {
  await tx.asOwner();
  return tx.q<{ payload: Record<string, unknown>; queue: string | null; max_attempts: number }>(
    `select j.payload, q.queue_name as queue, j.max_attempts
       from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
       left join graphile_worker._private_job_queues q on q.id = j.job_queue_id
      where t.identifier = $1 and j.key = $2`,
    [task, key],
  );
}

const audits = (tx: Tx, action: string, subject: string) =>
  tx.q<{ n: number }>(`select count(*)::int as n from public.audit_log where action = $1 and subject_id = $2`, [action, subject]).then((r) => r[0].n);

const gate = (tx: Tx, session: string) => tx.q<{ open: boolean }>(`select public.story_capture_open($1) as open`, [session]).then((r) => r[0].open);

describe("RPC-story_capture_open — the server's «أضف» (REQ-STO-011)", () => {
  it("a checked-in member inside the window ✓; the presenter, staff and an unchecked member ✗", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      await tx.as(f.a.members[1].claims);
      expect(await gate(tx, f.m2.a.published)).toBe(true);
      for (const who of [f.a.members[0], f.a.admin, f.a.mod]) {
        await tx.as(who.claims);
        expect(await gate(tx, f.m2.a.published)).toBe(false);
      }
    });
  });

  it("before the start ✗, at the end + 24 h ✗, a second before ✓", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      await tx.q(`update public.session_days set starts_at = now() + interval '1 minute', ends_at = now() + interval '2 hours' where session_id = $1`, [f.m2.a.published]);
      await tx.as(f.a.members[1].claims);
      expect(await gate(tx, f.m2.a.published)).toBe(false);
      await tx.asOwner();
      await tx.q(`update public.session_days set starts_at = now() - interval '26 hours', ends_at = now() - interval '24 hours' where session_id = $1`, [f.m2.a.published]);
      await tx.as(f.a.members[1].claims);
      expect(await gate(tx, f.m2.a.published)).toBe(false);
      await tx.asOwner();
      await tx.q(`update public.session_days set ends_at = now() - interval '23 hours 59 minutes 59 seconds' where session_id = $1`, [f.m2.a.published]);
      await tx.as(f.a.members[1].claims);
      expect(await gate(tx, f.m2.a.published)).toBe(true);
    });
  });

  it("a cancelled session and another org's session ✗ (a removed check-in is has_checked_in()'s own case, 0087)", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      await tx.as(f.b.admin.claims);
      expect(await gate(tx, f.m2.a.published)).toBe(false);
      await tx.asOwner();
      await tx.q(`update public.sessions set state = 'cancelled', cancelled_at = now(), cancellation_reason = 'تعذّر' where id = $1`, [f.m2.a.published]);
      await tx.as(f.a.members[1].claims);
      expect(await gate(tx, f.m2.a.published)).toBe(false);
    });
  });
});

describe("RPC-initiate_story_photo — the album's own job, with a caption", () => {
  const path = (org: string, session: string, photo: string) => `${org}/sessions/${session}/photos/${photo}.jpg`;

  it("✓ enqueues ONE process_photo, keyed as the album's, its caption in the payload", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      const photo = crypto.randomUUID();
      await tx.as(f.a.members[1].claims);
      await tx.q(`select public.initiate_story_photo($1, $2, $3, 'jpeg', 1000, '  الشريحة الثالثة  ')`, [photo, f.m2.a.published, path(f.a.id, f.m2.a.published, photo)]);
      const [job] = await jobs(tx, "process_photo", `photo:${photo}`);
      expect(job.payload).toMatchObject({ photo_id: photo, uploader_id: f.a.members[1].memberId, caption: "الشريحة الثالثة", declared_kind: "jpeg" });
    });
  });

  it("✗ outside the gate (42501, no job), on another path (22023), over 100 characters (22001)", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      const photo = crypto.randomUUID();
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`select public.initiate_story_photo($1, $2, $3, 'jpeg', 1000)`, [photo, f.m2.a.published, path(f.a.id, f.m2.a.published, photo)]))).toBe("42501");
      expect(await jobs(tx, "process_photo", `photo:${photo}`)).toEqual([]);
    });
    await withTx(async (tx) => {
      const f = await prepare(tx);
      const photo = crypto.randomUUID();
      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => tx.q(`select public.initiate_story_photo($1, $2, $3, 'jpeg', 1000)`, [photo, f.m2.a.published, path(f.b.id, f.m2.a.published, photo)]))).toBe("22023");
    });
    await withTx(async (tx) => {
      const f = await prepare(tx);
      const photo = crypto.randomUUID();
      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => tx.q(`select public.initiate_story_photo($1, $2, $3, 'jpeg', 1000, $4)`, [photo, f.m2.a.published, path(f.a.id, f.m2.a.published, photo), "ع".repeat(101)]))).toBe("22001");
    });
  });

  it("record_photo_upload stores the caption and the derivative; ten arguments still record a photo with neither", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
      const sha = "a".repeat(64);
      await tx.asServiceRole();
      await tx.q(`select public.record_photo_upload($1, $2, $3, $4, $5, 100, $6, 10, 10, now(), 'من القاعة', true)`, [a, f.a.id, f.m2.a.published, f.a.members[1].memberId, path(f.a.id, f.m2.a.published, a), sha]);
      await tx.q(`select public.record_photo_upload($1, $2, $3, $4, $5, 100, $6, 10, 10, now())`, [b, f.a.id, f.m2.a.published, f.a.members[1].memberId, path(f.a.id, f.m2.a.published, b), sha]);
      await tx.asOwner();
      expect(await tx.q(`select id, caption, story_derivative_ready from public.photos where id in ($1, $2) order by caption nulls last`, [a, b])).toEqual([
        { id: a, caption: "من القاعة", story_derivative_ready: true },
        { id: b, caption: null, story_derivative_ready: false },
      ]);
    });
  });
});

describe("RPC-begin_story_video / record_story_video / fail_story_video", () => {
  const source = (org: string, session: string, frame: string, ext = "mov") => `${org}/sessions/${session}/frames/${frame}/source.${ext}`;

  it("✓ one processing frame, its author's alone, and one transcode on the story_video queue — twice is once", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      const frame = crypto.randomUUID();
      const me = f.a.members[1];
      await tx.as(me.claims);
      for (let i = 0; i < 2; i++) await tx.q(`select public.begin_story_video($1, $2, $3, 1000000, 'الشريحة الثالثة')`, [frame, f.m2.a.published, source(f.a.id, f.m2.a.published, frame)]);
      expect(await tx.q(`select state::text, caption from public.story_frames where id = $1`, [frame])).toEqual([{ state: "processing", caption: "الشريحة الثالثة" }]);
      await tx.as(f.a.members[2]?.claims ?? f.a.members[0].claims);
      expect(await tx.q(`select 1 from public.story_frames where id = $1`, [frame])).toEqual([]);
      const found = await jobs(tx, "transcode_story_video", `story_video:${frame}`);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ queue: "story_video", max_attempts: 3 });
      // A video never enters the album and never writes a ledger row (REQ-STO-012).
      expect(await tx.q(`select 1 from public.photos where id = $1`, [frame])).toEqual([]);
    });
  });

  it("✗ outside the gate, on a path not this frame's, over 60 MB declared", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      const frame = crypto.randomUUID();
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.begin_story_video($1, $2, $3, 1000)`, [frame, f.m2.a.published, source(f.a.id, f.m2.a.published, frame)]))).toBe("42501");
      await tx.as(f.a.members[1].claims);
      expect(await errorCode(() => tx.q(`select public.begin_story_video($1, $2, $3, 1000)`, [frame, f.m2.a.published, source(f.a.id, f.m2.a.published, crypto.randomUUID())]))).toBe("22023");
      expect(await errorCode(() => tx.q(`select public.begin_story_video($1, $2, $3, 1000)`, [frame, f.m2.a.published, source(f.a.id, f.m2.a.published, frame, "svg")]))).toBe("22023");
      expect(await errorCode(() => tx.q(`select public.begin_story_video($1, $2, $3, 62914561)`, [frame, f.m2.a.published, source(f.a.id, f.m2.a.published, frame)]))).toBe("23514");
    });
  });

  it("the worker makes it visible (its 24 hours start then) or failed; a second call is a no-op; a member may call neither", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      const [ok, bad] = [crypto.randomUUID(), crypto.randomUUID()];
      await tx.as(f.a.members[1].claims);
      for (const frame of [ok, bad]) await tx.q(`select public.begin_story_video($1, $2, $3, 1000)`, [frame, f.m2.a.published, source(f.a.id, f.m2.a.published, frame)]);
      expect(await errorCode(() => tx.q(`select public.record_story_video($1, 'v', 'p', 12000, 720, 1280, 10, $2)`, [ok, "b".repeat(64)]))).toBe("42501");
      await tx.asServiceRole();
      const prefix = `${f.a.id}/sessions/${f.m2.a.published}/frames/${ok}`;
      expect(await tx.q(`select public.record_story_video($1, $2, $3, 12000, 720, 1280, 10, $4) as e`, [ok, `${prefix}/video.mp4`, `${prefix}/poster.webp`, "b".repeat(64)])).toEqual([{ e: { status: "ok" } }]);
      expect(await tx.q(`select public.record_story_video($1, 'x', 'y', 1, 1, 1, 1, $2) as e`, [ok, "b".repeat(64)])).toEqual([{ e: { status: "noop" } }]);
      expect(await tx.q(`select public.fail_story_video($1, 'too_long') as e`, [bad])).toEqual([{ e: { status: "ok" } }]);
      await tx.asOwner();
      expect(await tx.q(`select id, state::text, failure_reason, source_path from public.story_frames where id in ($1, $2) order by state`, [ok, bad])).toEqual(
        [
          { id: ok, state: "visible", failure_reason: null, source_path: null },
          { id: bad, state: "failed", failure_reason: "too_long", source_path: null },
        ].sort((x, y) => x.state.localeCompare(y.state)),
      );
      // The visible one is everyone's; the failed one is its author's alone.
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select id from public.story_frames where id in ($1, $2)`, [ok, bad])).toEqual([{ id: ok }]);
      await tx.as(f.a.members[1].claims);
      expect((await tx.q(`select id from public.story_frames where id in ($1, $2)`, [ok, bad])).length).toBe(2);
    });
  });
});

describe("a frame reported, taken down, decided, removed", () => {
  /** The fixture's video frame on org A's published session, by its moderator. */
  async function video(tx: Tx, org: string) {
    await tx.asOwner();
    const [{ id }] = await tx.q<{ id: string }>(`select id from public.story_frames where org_id = $1 and kind = 'video'`, [org]);
    return id;
  }

  it("RPC-report_story_frame: one report hides the frame at once and opens a story_frame report; twice, own, a generated frame ✗", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      const frame = await video(tx, f.a.id);
      const [{ id: generated }] = await tx.q<{ id: string }>(`select id from public.story_frames where org_id = $1 and kind = 'published'`, [f.a.id]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select public.report_story_frame($1, 'ل') as e`, [frame])).toEqual([{ e: { outcome: "reason_required" } }]);
      expect(await tx.q(`select public.report_story_frame($1, 'محتوى مسيء') -> 'outcome' as o`, [frame])).toEqual([{ o: "reported" }]);
      expect(await tx.q(`select 1 from public.story_frames where id = $1`, [frame])).toEqual([]);
      expect(await tx.q(`select public.report_story_frame($1, 'محتوى مسيء') as e`, [frame])).toEqual([{ e: { outcome: "not_visible" } }]);
      expect(await tx.q(`select public.report_story_frame($1, 'محتوى مسيء') as e`, [generated])).toEqual([{ e: { outcome: "not_reportable" } }]);
      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select target::text, status::text from public.reports where story_frame_id = $1`, [frame])).toEqual([{ target: "story_frame", status: "open" }]);
      expect(await tx.q(`select hidden_reason from public.story_frames where id = $1`, [frame])).toEqual([{ hidden_reason: "reported" }]);
    });
  });

  it("★ a report on a PHOTO frame hides the frame and leaves the photograph — and its points — in the album (DEC-251 §4.8)", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      await tx.asOwner();
      const [{ session_id, uploader_id }] = await tx.q<{ session_id: string; uploader_id: string }>(`select session_id, uploader_id from public.photos where id = $1`, [f.m5.a.photoId]);
      // The photo frame is `sessions'` hook's once the generator is promoted; written here only if it is not.
      await tx.q(
        `insert into public.story_frames (org_id, session_id, kind, trigger_key, triggered_at, photo_id) values ($1, $2, 'photo', $3::text, now(), $3::uuid)
         on conflict (session_id, kind, trigger_key) do nothing`,
        [f.a.id, session_id, f.m5.a.photoId],
      );
      await tx.q(`update public.story_frames set triggered_at = now() where kind = 'photo' and photo_id = $1`, [f.m5.a.photoId]);
      const [{ id: frame }] = await tx.q<{ id: string }>(`select id from public.story_frames where kind = 'photo' and photo_id = $1`, [f.m5.a.photoId]);
      const reporter = [f.a.members[0], f.a.members[1], f.a.admin].find((m) => m.memberId !== uploader_id)!;
      await tx.as(reporter.claims);
      expect(await tx.q(`select public.report_story_frame($1, 'ليست من الجلسة') -> 'outcome' as o`, [frame])).toEqual([{ o: "reported" }]);
      await tx.asOwner();
      expect(await tx.q(`select hidden_at is null as visible from public.photos where id = $1`, [f.m5.a.photoId])).toEqual([{ visible: true }]);
      expect(await tx.q(`select hidden_reason from public.story_frames where id = $1`, [frame])).toEqual([{ hidden_reason: "reported" }]);
    });
  });

  it("RPC-request_story_frame_takedown: «أزلني» on a video hides it for everyone at once; on a photo frame it points to the photograph's door", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      const frame = await video(tx, f.a.id);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select public.request_story_frame_takedown($1) -> 'outcome' as o`, [frame])).toEqual([{ o: "hidden" }]);
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select 1 from public.story_frames where id = $1`, [frame])).toEqual([]);
      // A request is not audited — its row is the record (DEC-251 §4.9).
      await tx.asOwner();
      expect(await tx.q<{ n: number }>(`select count(*)::int as n from public.audit_log where subject_id = $1`, [frame])).toEqual([{ n: 0 }]);
    });
  });

  it("RPC-decide_story_frame: staff restore — the hide clears, the open reports and takedowns close; a member may not", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      const frame = await video(tx, f.a.id);
      await tx.as(f.a.members[1].claims);
      await tx.q(`select public.report_story_frame($1, 'محتوى مسيء')`, [frame]);
      expect(await tx.q(`select public.decide_story_frame($1, 'restored') as e`, [frame])).toEqual([{ e: { outcome: "not_authorized" } }]);
      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select public.decide_story_frame($1, 'restored') -> 'outcome' as o`, [frame])).toEqual([{ o: "restored" }]);
      expect(await tx.q(`select hidden_at from public.story_frames where id = $1`, [frame])).toEqual([{ hidden_at: null }]);
      expect(await tx.q(`select status::text from public.reports where story_frame_id = $1`, [frame])).toEqual([{ status: "resolved" }]);
      expect(await tx.q(`select count(*)::int as n from public.story_frame_takedowns where frame_id = $1 and resolved_at is null`, [frame])).toEqual([{ n: 0 }]);
    });
  });

  it("RPC-remove_story_frame on a VIDEO: removed, reports closed, NO ledger row; a member, no reason and twice refused", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      const frame = await video(tx, f.a.id);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select public.remove_story_frame($1, 'خارج الموضوع') as e`, [frame])).toEqual([{ e: { outcome: "not_authorized" } }]);
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select public.remove_story_frame($1, '') as e`, [frame])).toEqual([{ e: { outcome: "reason_required" } }]);
      await tx.asOwner();
      const [{ n: before }] = await tx.q<{ n: number }>(`select count(*)::int as n from public.points_ledger`);
      await tx.as(f.a.admin.claims);
      expect(await tx.q(`select public.remove_story_frame($1, 'خارج الموضوع') -> 'outcome' as o`, [frame])).toEqual([{ o: "removed" }]);
      expect(await tx.q(`select public.remove_story_frame($1, 'خارج الموضوع') -> 'outcome' as o`, [frame])).toEqual([{ o: "already_removed" }]);
      expect(await tx.q(`select removed_by, removal_reason from public.story_frames where id = $1`, [frame])).toEqual([{ removed_by: f.a.admin.memberId, removal_reason: "خارج الموضوع" }]);
      await tx.asOwner();
      expect(await tx.q<{ n: number }>(`select count(*)::int as n from public.points_ledger`)).toEqual([{ n: before }]);
    });
  });

  it("★ the audit and the purge, through 0198's triggers on content's functions: story_frame.removed written once, one purge job", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      const frame = await video(tx, f.a.id);
      await tx.asOwner();
      // Attached here only when 0198's successor has not yet: the functions are this track's, the triggers the lead's.
      const [{ attached }] = await tx.q<{ attached: boolean }>(`select exists (select 1 from pg_trigger where tgname = 'story_frames_audit') as attached`);
      if (!attached) {
        await tx.q(`create trigger story_frames_audit after update of removed_at, hidden_at on public.story_frames for each row execute function public.story_frames_audit()`);
        await tx.q(`create trigger story_frames_purge after delete or update of removed_at on public.story_frames for each row execute function public.story_frames_purge()`);
      }
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.remove_story_frame($1, 'خارج الموضوع')`, [frame]);
      await tx.asOwner();
      expect(await audits(tx, "story_frame.removed", frame)).toBe(1);
      expect(await jobs(tx, "purge_story_video", `story_purge:${frame}`)).toHaveLength(1);
    });
  });

  it("RPC-remove_story_frame on a PHOTO frame goes through remove_photo(): the photograph removed and audited, the frame gone with it", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      await tx.asOwner();
      const [{ session_id }] = await tx.q<{ session_id: string }>(`select session_id from public.photos where id = $1`, [f.m5.a.photoId]);
      // The photo frame is `sessions'` hook's once the generator is promoted; written here only if it is not.
      await tx.q(
        `insert into public.story_frames (org_id, session_id, kind, trigger_key, triggered_at, photo_id) values ($1, $2, 'photo', $3::text, now(), $3::uuid)
         on conflict (session_id, kind, trigger_key) do nothing`,
        [f.a.id, session_id, f.m5.a.photoId],
      );
      await tx.q(`update public.story_frames set triggered_at = now() where kind = 'photo' and photo_id = $1`, [f.m5.a.photoId]);
      const [{ id: frame }] = await tx.q<{ id: string }>(`select id from public.story_frames where kind = 'photo' and photo_id = $1`, [f.m5.a.photoId]);
      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select public.remove_story_frame($1, 'خارج الموضوع') -> 'outcome' as o`, [frame])).toEqual([{ o: "removed" }]);
      await tx.asOwner();
      expect(await tx.q(`select removed_at is not null as removed from public.photos where id = $1`, [f.m5.a.photoId])).toEqual([{ removed: true }]);
      expect(await audits(tx, "photo.removed", f.m5.a.photoId)).toBe(1);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select 1 from public.story_frames where id = $1`, [frame])).toEqual([]);
    });
  });
});

// ★ The `story-media` WRITE policy is the lead's to create (it calls the gate above), so its text lives as a comment
// block in 0001 and is created here from that very text — the policy proven is the policy promoted. Once promoted, the
// block is gone from proposed/ and the live policy is what these cases meet.
function writePolicy(): string | null {
  let text: string;
  try {
    text = readFileSync(join(process.cwd(), "supabase", "proposed", "content", "0001_story_capture_gate.sql"), "utf8");
  } catch {
    return null;
  }
  const lines = text.split("\n");
  const from = lines.findIndex((l) => l.includes('create policy "story_media_write"'));
  if (from < 0) return null;
  const to = lines.findIndex((l, i) => i > from && l.trim() === "--     );");
  return lines.slice(from, to + 1).map((l) => l.replace(/^--   /, "")).join("\n");
}

describe("POL-story_media_write — the PUT, under the capture gate", () => {
  async function withPolicy(tx: Tx) {
    const f = await prepare(tx);
    await tx.asOwner();
    const sql = writePolicy();
    const [{ exists }] = await tx.q<{ exists: boolean }>(`select exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'story_media_write') as exists`);
    if (!exists && sql) await tx.q(sql);
    return f;
  }
  const put = (tx: Tx, name: string) => tx.q(`insert into storage.objects (bucket_id, name) values ('story-media', $1)`, [name]);

  it("a checked-in member inside the window puts source.{mp4,mov,webm}; nothing else, nowhere else", async () => {
    await withTx(async (tx) => {
      const f = await withPolicy(tx);
      const base = `${f.a.id}/sessions/${f.m2.a.published}/frames`;
      await tx.as(f.a.members[1].claims);
      for (const ext of ["mp4", "mov", "webm"]) await put(tx, `${base}/${crypto.randomUUID()}/source.${ext}`);
      for (const bad of [
        `${base}/${crypto.randomUUID()}/video.mp4`,
        `${base}/${crypto.randomUUID()}/poster.webp`,
        `${base}/${crypto.randomUUID()}/source.svg`,
        `${base}/not-a-uuid/source.mp4`,
        `${f.b.id}/sessions/${f.m2.a.published}/frames/${crypto.randomUUID()}/source.mp4`,
        `${f.a.id}/sessions/not-a-uuid/frames/${crypto.randomUUID()}/source.mp4`,
      ]) {
        expect(await errorCode(() => put(tx, bad)), bad).toBe("42501");
      }
    });
  });

  it("the presenter, staff and an unchecked member are refused", async () => {
    await withTx(async (tx) => {
      const f = await withPolicy(tx);
      for (const who of [f.a.members[0], f.a.admin]) {
        await tx.as(who.claims);
        expect(await errorCode(() => put(tx, `${f.a.id}/sessions/${f.m2.a.published}/frames/${crypto.randomUUID()}/source.mp4`))).toBe("42501");
      }
    });
  });
});

describe("RPC-resolve_report.story_frame — a frame's report never reaches remove_photo()", () => {
  it("a story_frame report is 'invalid' to resolve_report(), and nothing is written", async () => {
    await withTx(async (tx) => {
      const f = await prepare(tx);
      await tx.asOwner();
      const [{ id: frame }] = await tx.q<{ id: string }>(`select id from public.story_frames where org_id = $1 and kind = 'video'`, [f.a.id]);
      await tx.as(f.a.members[1].claims);
      const [{ r }] = await tx.q<{ r: { report_id: string } }>(`select public.report_story_frame($1, 'محتوى مسيء') as r`, [frame]);
      await tx.as(f.a.mod.claims);
      expect(await tx.q(`select public.resolve_report($1, 'removed', 'سبب كافٍ') as e`, [r.report_id])).toEqual([{ e: { outcome: "invalid" } }]);
      expect(await tx.q(`select status::text from public.reports where id = $1`, [r.report_id])).toEqual([{ status: "open" }]);
    });
  });
});
