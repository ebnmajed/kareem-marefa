// notify (wave 2, M3) — supabase/proposed/notify/0008_reminder_schedule.sql.
//
// 03 §8.2 rows proven here:
//   POL-org_settings.reminder_reschedule ·
//   POL-org_settings.prompt_delay_reschedule
//
// 08 §4.1's fourth row: "Org changes the reminder schedule → Old-offset keys
// removed, new-offset keys added." The orphan is the whole point — a job left
// under an offset the org abandoned still fires, and the member gets «بعد
// أسبوع» from a schedule that no longer exists.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const PROPOSED = ["notify/0008_reminder_schedule.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  return f;
}

async function futureSession(tx: Tx, org: { id: string; categoryId: string; venueId: string }) {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at)
     values ($1, 'جلسة الجدول', 'ملخص', $2, 'introductory', now() + interval '30 days', 60,
             now() + interval '30 days' + interval '1 hour', $3, 30, 'published', now())
     returning id`,
    [org.id, org.categoryId, org.venueId],
  );
  return row.id;
}

const keysFor = (tx: Tx, session: string) =>
  tx.q<{ key: string }>(`select key from graphile_worker.jobs where key like $1 order by key`, [`remind:${session}:%`]);

describe("POL-org_settings.reminder_reschedule — REQ-NTF-004", () => {
  it("removes every old-offset key and adds the new ones, with nothing orphaned", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      const me = f.a.members[0].memberId;
      await tx.q(`insert into public.rsvps (org_id, session_id, member_id, status, reserved_at) values ($1, $2, $3, 'confirmed', now())`, [f.a.id, session, me]);

      expect((await keysFor(tx, session)).map((r) => r.key.split(":")[2]).sort()).toEqual(["10080", "120", "1440"]);

      // The admin rewrites the schedule: 2 days and 1 hour.
      await tx.q(`update public.org_settings set reminder_offsets_minutes = '{2880,60}' where org_id = $1`, [f.a.id]);

      const after = (await keysFor(tx, session)).map((r) => r.key.split(":")[2]).sort();
      // Not five. Two — and specifically NOT the three the org abandoned,
      // which would otherwise still fire on their old schedule.
      expect(after).toEqual(["2880", "60"]);
    });
  });

  it("moves every member's reminders, in every published session of the org", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const first = await futureSession(tx, f.a);
      const second = await futureSession(tx, f.a);
      for (const session of [first, second]) {
        for (const member of [f.a.members[0].memberId, f.a.members[1].memberId]) {
          await tx.q(`insert into public.rsvps (org_id, session_id, member_id, status, reserved_at) values ($1, $2, $3, 'confirmed', now())`, [f.a.id, session, member]);
        }
      }
      expect(await keysFor(tx, first)).toHaveLength(6);
      expect(await keysFor(tx, second)).toHaveLength(6);

      await tx.q(`update public.org_settings set reminder_offsets_minutes = '{4320}' where org_id = $1`, [f.a.id]);

      expect(await keysFor(tx, first)).toHaveLength(2); // one offset × two members
      expect(await keysFor(tx, second)).toHaveLength(2);
    });
  });

  it("leaves another org's pending reminders alone", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const theirs = await futureSession(tx, f.b);
      await tx.q(`insert into public.rsvps (org_id, session_id, member_id, status, reserved_at) values ($1, $2, $3, 'confirmed', now())`, [
        f.b.id,
        theirs,
        f.b.members[0].memberId,
      ]);
      expect(await keysFor(tx, theirs)).toHaveLength(3);

      await tx.q(`update public.org_settings set reminder_offsets_minutes = '{60}' where org_id = $1`, [f.a.id]);
      expect(await keysFor(tx, theirs)).toHaveLength(3);
    });
  });

  it("does nothing when the update leaves the schedule alone", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const session = await futureSession(tx, f.a);
      await tx.q(`insert into public.rsvps (org_id, session_id, member_id, status, reserved_at) values ($1, $2, $3, 'confirmed', now())`, [
        f.a.id,
        session,
        f.a.members[0].memberId,
      ]);
      const before = (await keysFor(tx, session)).map((r) => r.key);

      // A DAL that writes the whole settings row names the column on every
      // save; an unchanged value must not churn the queue.
      await tx.q(`update public.org_settings set reminder_offsets_minutes = reminder_offsets_minutes, email_from_name = 'اسم مُرسِل آخر' where org_id = $1`, [f.a.id]);
      expect((await keysFor(tx, session)).map((r) => r.key)).toEqual(before);
    });
  });
});

describe("POL-org_settings.prompt_delay_reschedule — REQ-RAT-007", () => {
  it("moves the pending rating prompt of a recently completed session", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      await tx.q(`select public.schedule_rating_prompt($1)`, [f.m2.a.completed]);
      const [{ run_at: before }] = await tx.q<{ run_at: Date }>(`select run_at from graphile_worker.jobs where key = $1`, [`rate:${f.m2.a.completed}`]);

      await tx.q(`update public.org_settings set rating_prompt_delay_minutes = 180 where org_id = $1`, [f.a.id]);

      const rows = await tx.q<{ run_at: Date }>(`select run_at from graphile_worker.jobs where key = $1`, [`rate:${f.m2.a.completed}`]);
      expect(rows).toHaveLength(1); // moved, not duplicated
      expect(new Date(rows[0].run_at).getTime() - new Date(before).getTime()).toBe(120 * 60_000);
    });
  });
});
