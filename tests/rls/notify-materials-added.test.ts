// notify (wave 22, PR D, D-N1) — supabase/proposed/notify/materials_added_notify.sql: MSG-materials_added is sent when
// a material becomes visible on a completed session, to its checked-in attendees, once per session per day, through
// notify() and the member's preference (08 §1.4, REQ-NTF-002, REQ-NTF-003; notes/notify.md W22-D).
//
// Every write that fires the trigger is the PRESENTER's — a link inserted under `p8_presenter_write`, a file made
// current by `finalize_material_upload()` — never the owner's: the trigger is a definer and is tested as the member whose
// write fires it. The results are read back as the owner.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, withTx, type Tx } from "./db";
import { seed } from "./fixture";
import type { M2Fixture } from "./fixture-m2";

afterAll(async () => {
  const { pool } = await import("./db");
  await pool.end();
});

async function setup(tx: Tx): Promise<M2Fixture> {
  const f = (await seed(tx)) as unknown as M2Fixture;
  await applyProposed(tx, "notify/materials_added_notify.sql");
  await tx.asOwner();
  // `seed()` carries M2 – M7. Its one material sits on the PUBLISHED session (fixture-m5), so nothing of the fixture
  // stands as the completed session's batch for today.
  await tx.q(`delete from public.notifications`);
  await tx.q(`delete from graphile_worker._private_jobs`);
  return f;
}

const presenterOf = (f: M2Fixture) => f.a.members[0];
const attendeeOf = (f: M2Fixture) => f.a.members[1];

async function addLink(tx: Tx, f: M2Fixture, session: string, title = "تسجيل الجلسة") {
  await tx.as(presenterOf(f).claims);
  const [{ id }] = await tx.q<{ id: string }>(
    `insert into public.materials (org_id, session_id, kind, title, external_url, added_by)
     values ($1, $2, 'external_link', $3, 'https://example.com/recording', $4) returning id`,
    [f.a.id, session, title, presenterOf(f).memberId],
  );
  await tx.asOwner();
  return id;
}

async function addFile(tx: Tx, f: M2Fixture, session: string) {
  await tx.as(presenterOf(f).claims);
  const [{ id }] = await tx.q<{ id: string }>(
    `insert into public.materials (org_id, session_id, kind, title, added_by) values ($1, $2, 'pdf', 'الشرائح', $3) returning id`,
    [f.a.id, session, presenterOf(f).memberId],
  );
  await tx.asOwner();
  return id;
}

async function finalize(tx: Tx, f: M2Fixture, material: string) {
  await tx.as(presenterOf(f).claims);
  await tx.q(`select public.finalize_material_upload($1, $2, 1024, 'application/pdf', $3)`, [material, `${f.a.id}/sessions/x/materials/${material}.pdf`, "a".repeat(64)]);
  await tx.asOwner();
}

const sent = (tx: Tx) =>
  tx.q<{ member_id: string; payload: { session_id: string; title: string } }>(
    `select member_id, payload from public.notifications where key = 'MSG-materials_added' order by member_id`,
  );
const sendJobs = (tx: Tx) =>
  tx.q<{ member_id: string; in_app: boolean; email: boolean }>(
    `select p.payload ->> 'member_id' as member_id, (p.payload ->> 'in_app')::boolean as in_app, (p.payload ->> 'email')::boolean as email
       from graphile_worker.jobs j join graphile_worker._private_jobs p on p.id = j.id
      where j.task_identifier = 'send_notification' and p.payload ->> 'key' = 'MSG-materials_added'`,
  );

describe("MSG-materials_added — sent when a material is added after the session", () => {
  it("a link added to a completed session notifies each checked-in attendee once, with the session and its title", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await addLink(tx, f, f.m2.a.completed);
      const rows = await sent(tx);
      expect(rows.map((r) => r.member_id)).toEqual([attendeeOf(f).memberId]);
      expect(rows[0].payload.session_id).toBe(f.m2.a.completed);
      expect(rows[0].payload.title).toContain("جلسة مكتملة");
      expect((await sendJobs(tx)).length).toBe(1);
    });
  });

  it("a file notifies when it becomes current — not when its row is written", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const material = await addFile(tx, f, f.m2.a.completed);
      expect(await sent(tx)).toEqual([]);
      await finalize(tx, f, material);
      expect((await sent(tx)).map((r) => r.member_id)).toEqual([attendeeOf(f).memberId]);
    });
  });

  it("once per session per day: a second material notifies nobody, and a replacement notifies nobody", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const file = await addFile(tx, f, f.m2.a.completed);
      await finalize(tx, f, file);
      await addLink(tx, f, f.m2.a.completed, "رابط إضافي");
      await finalize(tx, f, file); // version 2 — a replacement (REQ-MAT-010)
      expect((await sent(tx)).length).toBe(1);
    });
  });

  it("a session not yet completed notifies nobody; neither does a removed check-in's member", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await addLink(tx, f, f.m2.a.published);
      expect(await sent(tx)).toEqual([]);

      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2, removal_reason = 'خطأ في التسجيل' where id = $1`, [
        f.m2.a.checkInCompleted,
        f.a.admin.memberId,
      ]);
      await addLink(tx, f, f.m2.a.completed);
      expect(await sent(tx)).toEqual([]);
    });
  });

  it("the preference decides: off on both channels sends nothing; in-app off and email on sends the mail alone", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const attendee = attendeeOf(f);
      await tx.q(
        `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
         values ($1, $2, 'my_sessions', 'in_app', false), ($1, $2, 'my_sessions', 'email', false)`,
        [f.a.id, attendee.memberId],
      );
      await addLink(tx, f, f.m2.a.completed);
      expect(await sent(tx)).toEqual([]);
      expect(await sendJobs(tx)).toEqual([]);
    });
    await withTx(async (tx) => {
      const f = await setup(tx);
      const attendee = attendeeOf(f);
      await tx.q(
        `insert into public.notification_preferences (org_id, member_id, category, channel, enabled) values ($1, $2, 'my_sessions', 'in_app', false)`,
        [f.a.id, attendee.memberId],
      );
      await addLink(tx, f, f.m2.a.completed);
      expect(await sent(tx)).toEqual([]);
      expect(await sendJobs(tx)).toEqual([{ member_id: attendee.memberId, in_app: false, email: true }]);
    });
  });

  it("another org's session is never touched: org B's attendees hear nothing of org A's material", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await addLink(tx, f, f.m2.a.completed);
      const rows = await tx.q<{ member_id: string }>(`select member_id from public.notifications where key = 'MSG-materials_added' and org_id = $1`, [f.b.id]);
      expect(rows).toEqual([]);
    });
  });

  it("promoted before the fixture is seeded, the whole fixture still seeds and announces nothing (the suite's own guard)", async () => {
    await withTx(async (tx) => {
      await tx.asOwner();
      await applyProposed(tx, "notify/materials_added_notify.sql");
      await seed(tx);
      await tx.asOwner();
      expect(await sent(tx)).toEqual([]);
    });
  });
});
