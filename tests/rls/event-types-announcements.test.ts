// 0213 — a session's event type, and an org announcement that is scheduled and sent once (REQ-SES-022, REQ-ADM-025,
// DEC-267). Each case runs for whom the change serves and for whom it refuses.
//
//   RPC-set_event_type.admin_only · RPC-set_event_type.audited · RPC-poster_render_context.by_event_type ·
//   TRG-sessions_poster_hook.event_type · RPC-create_proposal.event_type · RPC-create_session.copies_event_type ·
//   POL-feed_announcements.admin_writes · TRG-feed_announcements_schedule · RPC-publish_announcement.once

import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const job = (tx: Tx, key: string) =>
  tx.q<{ task_identifier: string; run_at: string }>(`select task_identifier, run_at from graphile_worker.jobs where key = $1`, [key]);

describe("RPC-set_event_type", () => {
  it("★ every session is a talk until an admin changes it; the change is audited with the old and the new type", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const s = f.m2.a.published;
      await tx.asOwner();
      expect(await tx.q(`select event_type from public.sessions where id = $1`, [s])).toEqual([{ event_type: "talk" }]);
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.set_event_type($1, 'workshop')`, [s]);
      expect(await tx.q(`select event_type from public.sessions where id = $1`, [s])).toEqual([{ event_type: "workshop" }]);
      await tx.asOwner();
      const audit = await tx.q<{ before: unknown; after: unknown }>(
        `select before, after from public.audit_log where action = 'session.event_type_changed' and subject_id = $1`,
        [s],
      );
      expect(audit).toEqual([{ before: { event_type: "talk" }, after: { event_type: "workshop" } }]);
    });
  });

  it("★ a moderator, the session's presenter and a member are refused; another org's admin finds no session", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const s = f.m2.a.published;
      for (const who of [f.a.mod, f.a.members[0], f.a.members[1]]) {
        await tx.as(who.claims);
        expect(await errorCode(() => tx.q(`select public.set_event_type($1, 'panel')`, [s]))).toBe(PERMISSION_DENIED);
      }
      await tx.as(f.b.admin.claims);
      expect(await errorCode(() => tx.q(`select public.set_event_type($1, 'panel')`, [s]))).toBe("P0002");
    });
  });
});

describe("RPC-poster_render_context.by_event_type", () => {
  it("★ the automatic poster is drawn from the org's template of the session's type, and falls back to its talk", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const s = f.m2.a.published;
      await tx.asOwner();
      const versionOf = async (family: string) =>
        (await tx.q<{ v: string | null }>(`select public.org_template_version($1, 'poster', $2) as v`, [f.a.id, family]))[0].v;
      const context = async () => (await tx.q<{ template_version_id: string }>(`select template_version_id from public.poster_render_context($1)`, [s]))[0];
      expect((await context()).template_version_id).toBe(await versionOf("talk"));
      await tx.q(`update public.sessions set event_type = 'meetup' where id = $1`, [s]);
      expect((await context()).template_version_id).toBe(await versionOf("meetup"));
      // No live meetup template: the talk's.
      await tx.q(`update public.design_templates set retired_at = now(), is_default = false where org_id = $1 and purpose = 'poster' and family = 'meetup'`, [f.a.id]);
      expect((await context()).template_version_id).toBe(await versionOf("talk"));
    });
  });
});

describe("TRG-sessions_poster_hook.event_type", () => {
  it("★ changing a published session's type queues its poster; a draft's does not", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`delete from graphile_worker._private_jobs where key in ($1, $2)`, [`poster:${f.m2.a.published}`, `poster:${f.m2.a.draft}`]);
      await tx.as(f.a.admin.claims);
      await tx.q(`select public.set_event_type($1, 'panel')`, [f.m2.a.published]);
      await tx.q(`select public.set_event_type($1, 'panel')`, [f.m2.a.draft]);
      await tx.asOwner();
      expect((await job(tx, `poster:${f.m2.a.published}`)).map((j) => j.task_identifier)).toEqual(["regenerate_poster"]);
      expect(await job(tx, `poster:${f.m2.a.draft}`)).toEqual([]);
    });
  });
});

describe("RPC-create_proposal.event_type / RPC-create_session.copies_event_type", () => {
  it("★ a proposer picks the type; the session made from the approved proposal starts as it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      const [{ id }] = await tx.q<{ id: string }>(
        `select public.create_proposal(p_title => 'ورشة الأدوات', p_abstract => 'ملخص', p_category => $1, p_level => 'introductory', p_event_type => 'workshop') as id`,
        [f.a.categoryId],
      );
      expect(await tx.q(`select event_type from public.proposals where id = $1`, [id])).toEqual([{ event_type: "workshop" }]);
      await tx.asOwner();
      await tx.q(`alter table public.proposals disable trigger user`);
      await tx.q(`update public.proposals set state = 'approved' where id = $1`, [id]);
      await tx.q(`alter table public.proposals enable trigger user`);
      await tx.as(f.a.admin.claims);
      const [{ s }] = await tx.q<{ s: string }>(`select public.create_session(p_proposal => $1) as s`, [id]);
      expect(await tx.q(`select event_type from public.sessions where id = $1`, [s])).toEqual([{ event_type: "workshop" }]);
    });
  });

  it("a proposal written without a type is a talk", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      const [{ id }] = await tx.q<{ id: string }>(
        `select public.create_proposal(p_title => 'محاضرة', p_abstract => 'ملخص', p_category => $1, p_level => 'introductory') as id`,
        [f.a.categoryId],
      );
      expect(await tx.q(`select event_type from public.proposals where id = $1`, [id])).toEqual([{ event_type: "talk" }]);
    });
  });
});

describe("POL-feed_announcements.admin_writes / TRG-feed_announcements_schedule", () => {
  it("★ an admin writes, edits and deletes one; a moderator and a member cannot", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      for (const who of [f.a.mod, f.a.members[1]]) {
        await tx.as(who.claims);
        expect(
          await errorCode(() => tx.q(`insert into public.feed_announcements (org_id, author_id, body) values ($1, $2, 'إعلان')`, [f.a.id, who.memberId])),
        ).toBe(PERMISSION_DENIED);
      }
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(`insert into public.feed_announcements (org_id, author_id, body) values ($1, $2, 'إعلان أول') returning id`, [
        f.a.id,
        f.a.admin.memberId,
      ]);
      expect(await tx.q(`update public.feed_announcements set body = 'إعلان معدَّل' where id = $1 returning body`, [id])).toEqual([{ body: "إعلان معدَّل" }]);
      expect(await tx.q(`delete from public.feed_announcements where id = $1 returning id`, [id])).toEqual([{ id }]);
    });
  });

  it("★ written for later: queued for its time, unseen by a member until then; moving the time moves the job", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(
        `insert into public.feed_announcements (org_id, author_id, body, published_at) values ($1, $2, 'غدًا', now() + interval '1 day') returning id`,
        [f.a.id, f.a.admin.memberId],
      );
      await tx.asOwner();
      const [first] = await job(tx, `announce:${id}`);
      expect(first.task_identifier).toBe("publish_announcement");
      expect(new Date(first.run_at).getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.feed_announcements where id = $1`, [id])).toEqual([]);
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.feed_announcements set published_at = now() + interval '2 days' where id = $1`, [id]);
      await tx.asOwner();
      const moved = await job(tx, `announce:${id}`);
      expect(moved).toHaveLength(1);
      expect(new Date(moved[0].run_at).getTime()).toBeGreaterThan(Date.now() + 47 * 3600 * 1000);
    });
  });
});

describe("RPC-publish_announcement.once", () => {
  it("★ sent once to every active member of the org at its time — early does nothing, a second call nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(
        `insert into public.feed_announcements (org_id, author_id, body, published_at) values ($1, $2, 'قريبًا', now() + interval '1 hour') returning id`,
        [f.a.id, f.a.admin.memberId],
      );
      await tx.asServiceRole();
      expect(await tx.q(`select public.publish_announcement($1) as o`, [id])).toEqual([{ o: "early" }]);
      await tx.asOwner();
      await tx.q(`update public.feed_announcements set published_at = now() - interval '1 minute' where id = $1`, [id]);
      const [{ n }] = await tx.q<{ n: number }>(`select count(*)::int as n from public.members where org_id = $1 and status = 'active'`, [f.a.id]);
      await tx.asServiceRole();
      expect(await tx.q(`select public.publish_announcement($1) as o`, [id])).toEqual([{ o: `sent:${n}` }]);
      expect(await tx.q(`select public.publish_announcement($1) as o`, [id])).toEqual([{ o: "already" }]);
      await tx.asOwner();
      const sent = await tx.q<{ c: number; orgs: number }>(
        `select count(*)::int as c, count(distinct org_id)::int as orgs from public.notifications where key = 'MSG-announcement_published' and payload->>'announcement_id' = $1`,
        [id],
      );
      expect(sent).toEqual([{ c: n, orgs: 1 }]);
    });
  });

  it("a member who switched الإعلانات off in the app gets no inbox row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`insert into public.notification_preferences (org_id, member_id, category, channel, enabled) values ($1, $2, 'announcements', 'in_app', false)`, [
        f.a.id,
        f.a.members[1].memberId,
      ]);
      const [{ id }] = await tx.q<{ id: string }>(`insert into public.feed_announcements (org_id, author_id, body) values ($1, $2, 'الآن') returning id`, [
        f.a.id,
        f.a.admin.memberId,
      ]);
      await tx.asServiceRole();
      await tx.q(`select public.publish_announcement($1)`, [id]);
      await tx.asOwner();
      expect(
        await tx.q(`select member_id from public.notifications where key = 'MSG-announcement_published' and member_id = $1`, [f.a.members[1].memberId]),
      ).toEqual([]);
    });
  });

  it("no client role may call it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select public.publish_announcement(gen_random_uuid())`))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("TRG-feed_announcements_audit", () => {
  it("★ writing, editing and deleting are each one audit row; the system's send is none", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(`insert into public.feed_announcements (org_id, author_id, body) values ($1, $2, 'أول') returning id`, [
        f.a.id,
        f.a.admin.memberId,
      ]);
      await tx.q(`update public.feed_announcements set body = 'ثانٍ' where id = $1`, [id]);
      await tx.asServiceRole();
      await tx.q(`select public.publish_announcement($1)`, [id]);
      await tx.as(f.a.admin.claims);
      await tx.q(`delete from public.feed_announcements where id = $1`, [id]);
      await tx.asOwner();
      const rows = await tx.q<{ action: string; before: unknown; after: unknown }>(
        `select action, before, after from public.audit_log where subject_id = $1 order by occurred_at, action`,
        [id],
      );
      expect(rows.map((r) => r.action)).toEqual(["announcement.created", "announcement.changed", "announcement.deleted"]);
      expect(rows[1]).toMatchObject({ before: { body: "أول" }, after: { body: "ثانٍ" } });
    });
  });
});
