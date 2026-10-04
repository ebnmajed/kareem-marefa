// Wave 26 — session stories: the four tables (DEC-248 §5, DEC-251 §5; REQ-STO-002, 003, 005, 010, 014, 018). 0198.
//
// One case per policy, as the role it names. The frames are the fixture's: a `published` frame and an attendee's
// video on each org's published session, with one view, one reaction and one removal request (tests/rls/fixture.ts). The author is the org's first
// member; the plain reader in these cases is its second.
// ★ Every policy has its grant — a policy without one fails 42501 on the first statement (0002's lesson) — and the
// tables that take no client write prove it by refusing one.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx } from "./db";
import { seed as seedFixture } from "./fixture";
import type { Tx } from "./db";

// ★ With 0199 live, SEEDING ITSELF writes frames: the fixture's visible photograph fires `photos_story_frame` and its
// «قبل» material fires `materials_story_frame` (`sessions'` hooks, proven in story-generator.test.ts). These cases are
// about the TABLES' policies, so each starts from the two frames the fixture inserts by hand and drives its own rows.
async function seed(tx: Tx) {
  const f = await seedFixture(tx);
  await tx.asOwner();
  await tx.q(`delete from public.story_frames where kind in ('photo', 'materials')`);
  return f;
}

afterAll(() => pool.end());

const frames = `select kind::text as kind from public.story_frames where org_id = $1 order by kind::text`;

describe("POL-story_frames.read_visible", () => {
  it("a member reads their own org's visible frames, and no other org's", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(frames, [f.a.id])).toEqual([{ kind: "published" }, { kind: "video" }]);
      expect(await tx.q(`select 1 from public.story_frames where org_id = $1`, [f.b.id])).toEqual([]);
      expect(await tx.q<{ n: number }>(`select count(*)::int as n from public.story_frames`)).toEqual([{ n: 2 }]);
    });
  });

  it("★ a frame is gone at its trigger plus 24 hours, and present a second before (REQ-STO-002)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.story_frames set triggered_at = now() - interval '24 hours' where org_id = $1 and kind = 'published'`, [f.a.id]);
      await tx.q(`update public.story_frames set triggered_at = now() - interval '23 hours 59 minutes 59 seconds' where org_id = $1 and kind = 'video'`, [f.a.id]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(frames, [f.a.id])).toEqual([{ kind: "video" }]);
    });
  });

  it("a frame triggered in the future, a hidden one and a removed one are not a member's to read", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.story_frames set triggered_at = now() + interval '1 minute' where org_id = $1 and kind = 'published'`, [f.a.id]);
      await tx.q(`update public.story_frames set hidden_at = now(), hidden_reason = 'reported' where org_id = $1 and kind = 'video'`, [f.a.id]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(frames, [f.a.id])).toEqual([]);
      await tx.asOwner();
      await tx.q(`update public.story_frames set hidden_at = null, hidden_reason = null, removed_at = now(), removed_by = $2 where org_id = $1 and kind = 'video'`, [f.a.id, f.a.admin.memberId]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(frames, [f.a.id])).toEqual([]);
    });
  });

  it("★ cancelling the session ends its story for members (REQ-STO-018)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.sessions set state = 'cancelled', cancelled_at = now(), cancellation_reason = 'تعذّر الحضور' where id = $1`, [f.m2.a.published]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(frames, [f.a.id])).toEqual([]);
    });
  });

  it("★ a photo frame goes when its photograph is hidden — the frame copies nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ session_id }] = await tx.q<{ session_id: string }>(`select session_id from public.photos where id = $1`, [f.m5.a.photoId]);
      await tx.q(
        `insert into public.story_frames (org_id, session_id, kind, trigger_key, triggered_at, photo_id) values ($1, $2, 'photo', $3::text, now(), $4::uuid)`,
        [f.a.id, session_id, f.m5.a.photoId, f.m5.a.photoId],
      );
      const photo = `select 1 as ok from public.story_frames where kind = 'photo' and photo_id = $1`;
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(photo, [f.m5.a.photoId])).toEqual([{ ok: 1 }]);
      await tx.asOwner();
      await tx.q(`update public.photos set hidden_at = now(), hidden_reason = 'takedown_requested' where id = $1`, [f.m5.a.photoId]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(photo, [f.m5.a.photoId])).toEqual([]);
    });
  });
});

describe("POL-story_frames.read_own", () => {
  it("the author alone reads their processing or failed video", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.story_frames set state = 'failed', failure_reason = 'too_long' where org_id = $1 and kind = 'video'`, [f.a.id]);
      await tx.as(f.a.mod.claims); // the fixture's author — and staff, so the frame is theirs twice over
      expect(await tx.q(`select state::text as state from public.story_frames where kind = 'video'`)).toEqual([{ state: "failed" }]);
      await tx.asOwner();
      await tx.q(`update public.story_frames set author_id = $2 where org_id = $1 and kind = 'video'`, [f.a.id, f.a.members[0].memberId]);
      await tx.as(f.a.members[0].claims); // a plain member who is the author
      expect(await tx.q(`select state::text as state, failure_reason from public.story_frames where kind = 'video'`)).toEqual([{ state: "failed", failure_reason: "too_long" }]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select 1 from public.story_frames where kind = 'video'`)).toEqual([]);
    });
  });
});

describe("POL-story_frames.staff_read", () => {
  it("an admin and a moderator read every frame of their org, expired and hidden too — and none of another org's", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.story_frames set triggered_at = now() - interval '9 days' where org_id = $1 and kind = 'published'`, [f.a.id]);
      await tx.q(`update public.story_frames set hidden_at = now(), hidden_reason = 'reported' where org_id = $1 and kind = 'video'`, [f.a.id]);
      for (const who of [f.a.admin, f.a.mod]) {
        await tx.as(who.claims);
        expect(await tx.q(frames, [f.a.id])).toEqual([{ kind: "published" }, { kind: "video" }]);
      }
      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select 1 from public.story_frames where org_id = $1`, [f.a.id])).toEqual([]);
    });
  });
});

describe("POL-story_frames.no_client_write · one_per_trigger", () => {
  it("★ no client role inserts, updates or deletes a frame — not a member, not an admin, not the worker's role", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      for (const who of [f.a.members[0], f.a.admin]) {
        await tx.as(who.claims);
        expect(await errorCode(() => tx.q(`insert into public.story_frames (org_id, session_id, kind, trigger_key, triggered_at) values ($1, $2, 'live', 'x', now())`, [f.a.id, f.m2.a.published]))).toBe("42501");
        expect(await errorCode(() => tx.q(`update public.story_frames set hidden_at = null where org_id = $1`, [f.a.id]))).toBe("42501");
        expect(await errorCode(() => tx.q(`delete from public.story_frames where org_id = $1`, [f.a.id]))).toBe("42501");
      }
      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(`delete from public.story_frames where org_id = $1`, [f.a.id]))).toBe("42501");
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select 1 from public.story_frames`))).toBe("42501");
    });
  });

  it("★ a trigger that fires twice leaves one frame (REQ-STO-004)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const again = `insert into public.story_frames (org_id, session_id, kind, trigger_key, triggered_at) values ($1, $2, 'published', 'published', now())`;
      expect(await errorCode(() => tx.q(again, [f.a.id, f.m2.a.published]))).toBe("23505");
      expect(await tx.q(`${again} on conflict (session_id, kind, trigger_key) do nothing returning id`, [f.a.id, f.m2.a.published])).toEqual([]);
    });
  });
});

describe("POL-story_views.own", () => {
  it("a member records a view of a frame they may read, once, and reads only their own", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      const [{ id }] = await tx.q<{ id: string }>(`select id from public.story_frames where kind = 'published'`);
      const view = `insert into public.story_views (org_id, member_id, frame_id) values ($1, $2, $3) on conflict (member_id, frame_id) do nothing returning 1 as ok`;
      expect(await tx.q(view, [f.a.id, f.a.members[1].memberId, id])).toEqual([{ ok: 1 }]);
      expect(await tx.q(view, [f.a.id, f.a.members[1].memberId, id])).toEqual([]);
      expect(await tx.q<{ n: number }>(`select count(*)::int as n from public.story_views`)).toEqual([{ n: 1 }]); // not the fixture author's
    });
  });

  it("★ nobody reads another member's views — not a member, not an admin (REQ-STO-010)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      for (const who of [f.a.members[1], f.a.mod, f.a.admin, f.b.admin]) {
        await tx.as(who.claims);
        expect(await tx.q(`select 1 from public.story_views where member_id = $1`, [f.a.members[0].memberId])).toEqual([]);
      }
    });
  });

  it("a view cannot be written for another member, nor for a frame the member may not read", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ id: other }] = await tx.q<{ id: string }>(`select id from public.story_frames where org_id = $1 and kind = 'published'`, [f.b.id]);
      const [{ id: mine }] = await tx.q<{ id: string }>(`select id from public.story_frames where org_id = $1 and kind = 'published'`, [f.a.id]);
      await tx.q(`update public.story_frames set triggered_at = now() - interval '2 days' where id = $1`, [mine]);
      await tx.as(f.a.members[1].claims);
      const view = `insert into public.story_views (org_id, member_id, frame_id) values ($1, $2, $3)`;
      expect(await errorCode(() => tx.q(view, [f.a.id, f.a.mod.memberId, mine]))).toBe("42501");
      expect(await errorCode(() => tx.q(view, [f.a.id, f.a.members[1].memberId, other]))).toBe("42501"); // another org's frame
      expect(await errorCode(() => tx.q(view, [f.a.id, f.a.members[1].memberId, mine]))).toBe("42501"); // expired
      expect(await errorCode(() => tx.q(`update public.story_views set viewed_at = now()`))).toBe("42501");
      expect(await errorCode(() => tx.q(`delete from public.story_views`))).toBe("42501");
    });
  });
});

describe("POL-story_reactions.own", () => {
  it("★ one per member per frame, changed and removed by its owner — every policy has its grant — and no ledger row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ n: before }] = await tx.q<{ n: number }>(`select count(*)::int as n from public.points_ledger`);
      await tx.as(f.a.members[1].claims);
      const [{ id }] = await tx.q<{ id: string }>(`select id from public.story_frames where kind = 'published'`);
      const add = `insert into public.story_reactions (org_id, frame_id, member_id, kind) values ($1, $2, $3, $4)`;
      await tx.q(add, [f.a.id, id, f.a.members[1].memberId, "heart"]);
      expect(await errorCode(() => tx.q(add, [f.a.id, id, f.a.members[1].memberId, "fire"]))).toBe("23505");
      expect(await tx.q(`update public.story_reactions set kind = 'fire' where member_id = $1 returning kind::text as kind`, [f.a.members[1].memberId])).toEqual([{ kind: "fire" }]);
      // The org reads the counts of a readable frame: mine and the fixture's.
      expect(await tx.q(`select kind::text as kind from public.story_reactions where frame_id = $1 order by 1`, [id])).toEqual([{ kind: "clap" }, { kind: "fire" }]);
      expect(await tx.q(`delete from public.story_reactions where member_id = $1 returning 1 as ok`, [f.a.members[1].memberId])).toEqual([{ ok: 1 }]);
      await tx.asOwner();
      expect(await tx.q<{ n: number }>(`select count(*)::int as n from public.points_ledger`)).toEqual([{ n: before }]);
    });
  });

  it("a member cannot react as another, move a reaction, or touch another's — and another org reads nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      const [{ id }] = await tx.q<{ id: string }>(`select id from public.story_frames where kind = 'published'`);
      expect(await errorCode(() => tx.q(`insert into public.story_reactions (org_id, frame_id, member_id, kind) values ($1, $2, $3, 'idea')`, [f.a.id, id, f.a.mod.memberId]))).toBe("42501");
      expect(await errorCode(() => tx.q(`update public.story_reactions set frame_id = $1`, [id]))).toBe("42501"); // no grant on the column
      expect(await tx.q(`update public.story_reactions set kind = 'idea' where member_id = $1 returning 1`, [f.a.members[0].memberId])).toEqual([]);
      expect(await tx.q(`delete from public.story_reactions where member_id = $1 returning 1`, [f.a.members[0].memberId])).toEqual([]);
      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select 1 from public.story_reactions where org_id = $1`, [f.a.id])).toEqual([]);
    });
  });
});

describe("POL-story_frame_takedowns.read", () => {
  it("the requester and staff read a request; another member does not; nobody writes one directly", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const mine = `select 1 as ok from public.story_frame_takedowns where org_id = $1`;
      for (const who of [f.a.members[0], f.a.mod, f.a.admin]) { // the fixture's requester is the org's first member
        await tx.as(who.claims);
        expect(await tx.q(mine, [f.a.id])).toEqual([{ ok: 1 }]);
      }
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(mine, [f.a.id])).toEqual([]);
      const [{ id }] = await tx.q<{ id: string }>(`select id from public.story_frames where kind = 'video'`);
      expect(await errorCode(() => tx.q(`insert into public.story_frame_takedowns (org_id, frame_id, requester_id) values ($1, $2, $3)`, [f.a.id, id, f.a.members[1].memberId]))).toBe("42501");
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`update public.story_frame_takedowns set resolved_at = now(), resolution = 'dismissed'`))).toBe("42501");
      await tx.as(f.b.admin.claims);
      expect(await tx.q(mine, [f.a.id])).toEqual([]);
    });
  });
});

describe("POL-reports.story_frame", () => {
  it("a report names a frame exactly when its target says so", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ id }] = await tx.q<{ id: string }>(`select id from public.story_frames where org_id = $1 and kind = 'video'`, [f.a.id]);
      const report = `insert into public.reports (org_id, target, comment_id, story_frame_id, reporter_id, reason) values ($1, $2, $3, $4, $5, 'سبب البلاغ')`;
      expect(await errorCode(() => tx.q(report, [f.a.id, "story_frame", null, null, f.a.members[1].memberId]))).toBe("23514");
      expect(await errorCode(() => tx.q(report, [f.a.id, "comment", f.m2.a.commentId, id, f.a.members[1].memberId]))).toBe("23514");
    });
  });
});

describe("POL-story_media_read", () => {
  const object = (org: string, session: string, frame: string, file: string) => `${org}/sessions/${session}/frames/${frame}/${file}`;
  it("★ a visible frame's rendition and poster are readable with the frame; the source never is", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ id }] = await tx.q<{ id: string }>(`select id from public.story_frames where org_id = $1 and kind = 'video'`, [f.a.id]);
      for (const file of ["video.mp4", "poster.webp", "source.mov"]) {
        await tx.q(`insert into storage.objects (bucket_id, name) values ('story-media', $1)`, [object(f.a.id, f.m2.a.published, id, file)]);
      }
      const names = `select storage.filename(name) as file from storage.objects where bucket_id = 'story-media' order by 1`;
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(names)).toEqual([{ file: "poster.webp" }, { file: "video.mp4" }]);
      await tx.as(f.b.members[0].claims);
      expect(await tx.q(names)).toEqual([]);
      // Expired for members, still playable by staff in the queue.
      await tx.asOwner();
      await tx.q(`update public.story_frames set triggered_at = now() - interval '3 days' where id = $1`, [id]);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(names)).toEqual([]);
      await tx.as(f.a.mod.claims);
      expect(await tx.q(names)).toEqual([{ file: "poster.webp" }, { file: "video.mp4" }]);
    });
  });
});
