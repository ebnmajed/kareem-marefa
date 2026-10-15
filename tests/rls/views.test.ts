// 0228 — views (DEC-297; REQ-VEW-001 … 004, REQ-STO-010 as amended). `content`'s functions under
// supabase/proposed/content/02_views.sql, proven on the lead's 0228 tables, AS A MEMBER — never as the owner.
//
// The fixture (tests/rls/fixture.ts): each org's published session is presented by members[0]; its story has a
// generated frame and an attendee video by the moderator; one announcement per org by the admin.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Claims, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

async function prepare(tx: Tx) {
  await applyProposed(tx, "content/02_views.sql");
  const f = await seed(tx);
  await tx.asOwner();
  const [frames] = [
    await tx.q<{ id: string; kind: string }>(`select id, kind::text from public.story_frames where session_id = $1 order by kind`, [f.m2.a.published]),
  ];
  const generated = frames.find((r) => r.kind === "published")!.id;
  const video = frames.find((r) => r.kind === "video")!.id;
  const [{ id: announcement }] = await tx.q<{ id: string }>(`select id from public.feed_announcements where org_id = $1`, [f.a.id]);
  // A clean slate: the fixture's own sample views are for the isolation sweep, not for these counts.
  await tx.q(`delete from public.story_views where org_id = $1`, [f.a.id]);
  await tx.q(`delete from public.content_views where org_id = $1`, [f.a.id]);
  return { f, session: f.m2.a.published, generated, video, announcement };
}

type Kind = "frame" | "post" | "recap" | "announcement";
const record = (tx: Tx, views: { kind: Kind; id: string; completed?: boolean }[]) =>
  tx.q<{ n: number }>(`select public.record_views($1::jsonb) as n`, [JSON.stringify(views)]).then((r) => r[0].n);
const counts = (tx: Tx, kind: Kind, ids: string[]) =>
  tx.q<{ subject_id: string; viewers: number; can_list: boolean }>(`select * from public.view_counts($1::public.view_subject, $2::uuid[])`, [kind, ids]);
const list = (tx: Tx, kind: Kind, id: string) =>
  tx.q<Record<string, unknown>>(`select * from public.view_list($1::public.view_subject, $2)`, [kind, id]);

async function completeSession(tx: Tx, session: string) {
  await tx.asOwner();
  await tx.q(`update public.sessions set state = 'in_progress' where id = $1`, [session]);
  await tx.q(`update public.sessions set state = 'completed' where id = $1`, [session]);
}

describe("record_views — the one write (REQ-VEW-001, 002)", () => {
  it("records a visible subject of each kind once per member; a second call within 30 s bumps nothing", async () => {
    await withTx(async (tx) => {
      const { f, session, generated, video, announcement } = await prepare(tx);
      const me = f.a.members[1];
      await tx.as(me.claims);
      expect(await record(tx, [{ kind: "frame", id: generated }, { kind: "post", id: session }, { kind: "announcement", id: announcement }])).toBe(3);
      expect(await record(tx, [{ kind: "frame", id: generated }, { kind: "post", id: session }])).toBe(2);
      await tx.asOwner();
      expect(await tx.q(`select times_seen from public.story_views where member_id = $1 and frame_id = $2`, [me.memberId, generated])).toEqual([{ times_seen: 1 }]);
      expect(await tx.q(`select kind::text, times_seen from public.content_views where member_id = $1 order by 1`, [me.memberId])).toEqual([
        { kind: "announcement", times_seen: 1 },
        { kind: "post", times_seen: 1 },
      ]);
      // Over 30 s later: one more impression; the first sight is kept.
      await tx.q(`update public.story_views set last_seen_at = last_seen_at - interval '31 seconds', viewed_at = viewed_at - interval '31 seconds' where member_id = $1`, [me.memberId]);
      const [{ first }] = await tx.q<{ first: string }>(`select viewed_at::text as first from public.story_views where member_id = $1 and frame_id = $2`, [me.memberId, generated]);
      await tx.as(me.claims);
      await record(tx, [{ kind: "frame", id: generated }, { kind: "frame", id: video, completed: true }]);
      await tx.asOwner();
      expect(await tx.q(`select viewed_at::text as first, times_seen from public.story_views where member_id = $1 and frame_id = $2`, [me.memberId, generated])).toEqual([{ first, times_seen: 2 }]);
      expect((await tx.q<{ c: boolean }>(`select completed_at is not null as c from public.story_views where member_id = $1 and frame_id = $2`, [me.memberId, video]))[0].c).toBe(true);
    });
  });

  it("`completed` means something on a video frame only", async () => {
    await withTx(async (tx) => {
      const { f, generated } = await prepare(tx);
      await tx.as(f.a.members[1].claims);
      await record(tx, [{ kind: "frame", id: generated, completed: true }]);
      await tx.asOwner();
      expect(await tx.q(`select completed_at from public.story_views where frame_id = $1`, [generated])).toEqual([{ completed_at: null }]);
    });
  });

  it("✗ a subject the caller may not see: an expired or hidden frame, a draft or deleted session, a recap before the end, an unpublished or expired announcement, another org's", async () => {
    await withTx(async (tx) => {
      const { f, session, generated, video, announcement } = await prepare(tx);
      await tx.asOwner();
      await tx.q(`update public.story_frames set triggered_at = now() - interval '25 hours' where id = $1`, [generated]);
      await tx.q(`update public.story_frames set hidden_at = now(), hidden_reason = 'reported' where id = $1`, [video]);
      await tx.q(`update public.feed_announcements set published_at = now() + interval '1 day' where id = $1`, [announcement]);
      const me = f.a.members[1];
      await tx.as(me.claims);
      expect(await record(tx, [{ kind: "frame", id: generated }, { kind: "frame", id: video }, { kind: "recap", id: session }, { kind: "announcement", id: announcement }])).toBe(0);
      expect(await record(tx, [{ kind: "post", id: f.m2.a.draft }, { kind: "post", id: f.m2.b.published }])).toBe(0);
      await tx.asOwner();
      await tx.q(`update public.sessions set deleted_at = now() where id = $1`, [session]);
      await tx.as(me.claims);
      expect(await record(tx, [{ kind: "post", id: session }])).toBe(0);
      await tx.asOwner();
      expect(await tx.q(`select 1 from public.story_views where member_id = $1 union all select 1 from public.content_views where member_id = $1`, [me.memberId])).toEqual([]);
    });
  });

  it("✗ nothing is recorded inside an impersonation session — no member_id, or the impersonation claim", async () => {
    await withTx(async (tx) => {
      const { f, session } = await prepare(tx);
      const { member_id: _drop, ...noMember } = f.a.members[1].claims;
      await tx.as({ ...noMember, org_role: "member" } as Claims);
      expect(await record(tx, [{ kind: "post", id: session }])).toBe(0);
      await tx.as({ ...f.a.members[1].claims, impersonation: "3b1e2c4d-0000-4000-8000-000000000000" } as unknown as Claims);
      expect(await record(tx, [{ kind: "post", id: session }])).toBe(0);
      await tx.asOwner();
      expect(await tx.q(`select 1 from public.content_views where member_id = $1`, [f.a.members[1].memberId])).toEqual([]);
    });
  });

  it("✗ no client role writes or reads another member's rows directly, staff included", async () => {
    await withTx(async (tx) => {
      const { f, session, generated } = await prepare(tx);
      await tx.as(f.a.members[1].claims);
      await record(tx, [{ kind: "post", id: session }, { kind: "frame", id: generated }]);
      for (const who of [f.a.members[2] ?? f.a.mod, f.a.admin, f.a.mod]) {
        await tx.as(who.claims);
        expect(await tx.q(`select 1 from public.content_views where member_id = $1`, [f.a.members[1].memberId])).toEqual([]);
        expect(await tx.q(`select 1 from public.story_views where member_id = $1`, [f.a.members[1].memberId])).toEqual([]);
      }
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select kind::text from public.content_views`)).toEqual([{ kind: "post" }]); // their own, through read_own
      expect(await errorCode(() => tx.q(`insert into public.content_views (org_id, member_id, kind, session_id) values ($1, $2, 'recap', $3)`, [f.a.id, f.a.members[1].memberId, session]))).toBe("42501");
      // 0228 keeps `story_views`' own insert path for `main`'s viewer until after the merge — but never another's row.
      expect(await errorCode(() => tx.q(`insert into public.story_views (org_id, member_id, frame_id) values ($1, $2, $3)`, [f.a.id, f.a.admin.memberId, generated]))).toBe("42501");
      expect(await errorCode(() => tx.q(`update public.content_views set times_seen = 99`))).toBe("42501");
      expect(await errorCode(() => tx.q(`delete from public.story_views`))).toBe("42501");
      // The internal predicates are nobody's to call.
      expect(await errorCode(() => tx.q(`select public.view_can_see('post', $1, true)`, [session]))).toBe("42501");
      expect(await errorCode(() => tx.q(`select public.view_member_owns('post', $1, $2)`, [session, f.a.members[1].memberId]))).toBe("42501");
    });
  });
});

describe("view_counts — everyone who sees it sees how many (REQ-VEW-003)", () => {
  it("counts unique viewers; never the owner's own look; never a row at 0; can_list for owners and staff only", async () => {
    await withTx(async (tx) => {
      const { f, session, generated, video, announcement } = await prepare(tx);
      const presenter = f.a.members[0];
      // Two members, the presenter (an owner of the post and the generated frame), the video's author and the
      // announcement's author all look.
      for (const who of [f.a.members[1], f.a.members[2] ?? f.a.mod, presenter, f.a.mod, f.a.admin]) {
        await tx.as(who.claims);
        await record(tx, [{ kind: "post", id: session }, { kind: "frame", id: generated }, { kind: "frame", id: video }, { kind: "announcement", id: announcement }]);
      }
      // A member: counts, no list.
      await tx.as(f.a.members[1].claims);
      const others = f.a.members[2] ? 4 : 3;
      expect(await counts(tx, "post", [session])).toEqual([{ subject_id: session, viewers: others, can_list: false }]); // the presenter not counted
      expect((await counts(tx, "frame", [video]))[0]).toMatchObject({ viewers: others, can_list: false }); // the author (mod) not counted
      expect((await counts(tx, "announcement", [announcement]))[0]).toMatchObject({ viewers: others, can_list: false }); // the admin not counted
      // Owners and staff may list.
      await tx.as(presenter.claims);
      expect((await counts(tx, "post", [session]))[0].can_list).toBe(true);
      expect((await counts(tx, "frame", [generated]))[0].can_list).toBe(true);
      expect((await counts(tx, "frame", [video]))[0].can_list).toBe(false);
      await tx.as(f.a.mod.claims);
      expect((await counts(tx, "announcement", [announcement]))[0].can_list).toBe(true);
      // Nobody viewed the recap: no row at all — never 0.
      await completeSession(tx, session);
      await tx.as(f.a.members[1].claims);
      expect(await counts(tx, "recap", [session])).toEqual([]);
      // After the end a recap is recorded, and a post-view does not become a recap-view: two subjects, counted apart.
      expect(await record(tx, [{ kind: "recap", id: session }])).toBe(1);
      await tx.as(f.a.mod.claims);
      expect(await counts(tx, "recap", [session])).toEqual([{ subject_id: session, viewers: 1, can_list: true }]);
    });
  });

  it("an anonymised viewer leaves the count; a subject the caller cannot see returns nothing; another org's ids return nothing", async () => {
    await withTx(async (tx) => {
      const { f, session } = await prepare(tx);
      await tx.as(f.a.members[1].claims);
      await record(tx, [{ kind: "post", id: session }]);
      await tx.as(f.a.mod.claims);
      expect((await counts(tx, "post", [session]))[0].viewers).toBe(1);
      await tx.asOwner();
      await tx.q(`update public.members set anonymised_at = now() where id = $1`, [f.a.members[1].memberId]);
      await tx.as(f.a.mod.claims);
      expect(await counts(tx, "post", [session])).toEqual([]);
      await tx.as(f.b.admin.claims);
      expect(await counts(tx, "post", [session])).toEqual([]);
    });
  });
});

describe("view_list — the owners and staff see who (REQ-VEW-004)", () => {
  it("name, avatar inputs and the day only, newest first, to an owner or staff; 42501 to anyone else", async () => {
    await withTx(async (tx) => {
      const { f, session } = await prepare(tx);
      const [a, b] = [f.a.members[1], f.a.members[2] ?? f.a.mod];
      await tx.as(a.claims);
      await record(tx, [{ kind: "post", id: session }]);
      await tx.as(b.claims);
      await record(tx, [{ kind: "post", id: session }]);
      await tx.asOwner();
      await tx.q(`update public.content_views set last_seen_at = now() - interval '1 day' where member_id = $1`, [a.memberId]);

      for (const who of [f.a.members[0], f.a.admin, f.a.mod]) {
        await tx.as(who.claims);
        const rows = await list(tx, "post", session);
        expect(rows.map((r) => r.member_id)).toEqual([b.memberId, a.memberId]);
        expect(Object.keys(rows[0]).sort()).toEqual(["avatar_key", "avatar_version", "display_name", "member_id", "seen_on", "total"]);
        expect(rows[0].seen_on).toBeInstanceOf(Date); // a date — no time finer than the day leaves the database
        expect(rows[0].total).toBe(2);
      }
      await tx.as(a.claims);
      expect(await errorCode(() => list(tx, "post", session))).toBe("42501");
      await tx.as(f.b.admin.claims);
      expect(await errorCode(() => list(tx, "post", session))).toBe("42501");
    });
  });
});

describe("privacy plumbing", () => {
  it("anonymisation deletes the member's views in both tables; the export carries their own and nobody else's", async () => {
    await withTx(async (tx) => {
      const { f, session, generated } = await prepare(tx);
      const [me, other] = [f.a.members[1], f.a.members[2] ?? f.a.mod];
      for (const who of [me, other]) {
        await tx.as(who.claims);
        await record(tx, [{ kind: "post", id: session }, { kind: "frame", id: generated }]);
      }
      await tx.asOwner();
      const [{ payload }] = await tx.q<{ payload: { views: { kind: string; subject_id: string }[] } }>(`select public.build_data_export_payload($1) as payload`, [me.memberId]);
      expect(payload.views.map((v) => v.kind).sort()).toEqual(["frame", "post"]);
      expect(payload.views.every((v) => [session, generated].includes(v.subject_id))).toBe(true);
      expect(payload.views).toHaveLength(2); // the other member's views of the same subjects are not in it

      await tx.q(`update public.members set status = 'deactivated', deactivated_at = now() - interval '10 years', deactivated_reason = 'test' where id = $1`, [me.memberId]);
      await tx.q(`select public.anonymise_members()`);
      expect(await tx.q(`select 1 from public.story_views where member_id = $1 union all select 1 from public.content_views where member_id = $1`, [me.memberId])).toEqual([]);
      expect(await tx.q(`select count(*)::int as n from public.content_views where member_id = $1`, [other.memberId])).toEqual([{ n: 1 }]);
    });
  });
});
