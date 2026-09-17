// supabase/proposed/scoring/0004_missed_attendance.sql — REQ-SES-017's
// «the member can see why».
//
// No ledger row is written for an award that did not happen, so the missed-day
// line on /app/me/points cannot come from the ledger. It comes from here, and
// the thing worth testing hardest is that a definer function reachable by every
// signed-in member answers ONLY about the caller.
//
// 03 §8.2 rows proven here: RPC-missed_attendance_days.self_only,
// .multi_day_only, .names_the_missed_day, .silent_when_complete.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const FILES: ReadonlyArray<readonly [string, string]> = [
  ["scoring/0002_attendance_predicate.sql", "public.session_attendance_complete(uuid,uuid)"],
  ["scoring/0004_missed_attendance.sql", "public.missed_attendance_days()"],
];

async function ready(tx: Tx) {
  const f = await seed(tx);
  for (const [path, probe] of FILES) {
    await tx.asOwner();
    const [row] = await tx.q<{ present: boolean }>(`select to_regprocedure($1) is not null as present`, [probe]);
    if (!row.present) await applyProposed(tx, path);
  }
  await tx.asOwner();
  return f;
}

/** A COMPLETED session with `days` days, ten or more days out — clear of the
 *  fixture's own session 24 hours from now (see scoring-days-award.test.ts). */
async function makeWorkshop(tx: Tx, org: Org, days: number, offsetDays = 10): Promise<{ sessionId: string; dayIds: string[] }> {
  await tx.asOwner();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins)
     values ($1, 'ورشة', 'ملخص', $2, 'introductory',
             now() + ($4 || ' days')::interval, 60, now() + ($4 || ' days')::interval + interval '1 hour',
             $3, 40, 'completed', now() - interval '1 day', now() - interval '1 hour', true)
     returning id`,
    [org.id, org.categoryId, org.venueId, String(offsetDays)],
  );
  for (let i = 1; i < days; i += 1) {
    await tx.q(
      `insert into public.session_days (session_id, starts_at, ends_at, venue_id)
       values ($1, now() + ($2 || ' days')::interval, now() + ($2 || ' days')::interval + interval '1 hour', $3)`,
      [row.id, String(offsetDays + i), org.venueId],
    );
  }
  const dayRows = await tx.q<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [row.id]);
  expect(dayRows).toHaveLength(days);
  return { sessionId: row.id, dayIds: dayRows.map((d) => d.id) };
}

async function attend(tx: Tx, org: Org, sessionId: string, dayId: string, memberId: string): Promise<void> {
  await tx.asOwner();
  await tx.q(
    `insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by)
     values ($1, $2, $3, $4, 'manual', 'حضر', $5)`,
    [org.id, sessionId, dayId, memberId, org.admin.memberId],
  );
}

type MissedRow = { session_id: string; session_title: string; day_count: number; day_position: number };
async function missed(tx: Tx): Promise<MissedRow[]> {
  return tx.q<MissedRow>(`select session_id, session_title, day_count, day_position from public.missed_attendance_days()`);
}

describe("RPC-missed_attendance_days.self_only", () => {
  it("anon cannot call it, and a member gets their OWN missed days — never another member's", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const one = f.a.members[1];
      const two = f.a.mod;
      const { sessionId, dayIds } = await makeWorkshop(tx, f.a, 3);

      // members[1] missed day two; the moderator missed day three.
      await attend(tx, f.a, sessionId, dayIds[0], one.memberId);
      await attend(tx, f.a, sessionId, dayIds[2], one.memberId);
      await attend(tx, f.a, sessionId, dayIds[0], two.memberId);
      await attend(tx, f.a, sessionId, dayIds[1], two.memberId);

      await tx.asAnon();
      expect(await errorCode(() => missed(tx))).toBe(PERMISSION_DENIED);

      // ★ The function takes no member id, so there is nothing to point at
      // anyone else. Each caller is told about themselves, and the two answers
      // are different — which is the assertion that would fail if it were
      // parameterised and unguarded.
      await tx.as(one.claims);
      expect((await missed(tx)).map((r) => r.day_position)).toEqual([2]);

      await tx.as(two.claims);
      expect((await missed(tx)).map((r) => r.day_position)).toEqual([3]);
    });
  });
});

describe("RPC-missed_attendance_days.names_the_missed_day", () => {
  it("names the day, its position and how many days the session had", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const person = f.a.members[1];
      const { sessionId, dayIds } = await makeWorkshop(tx, f.a, 3);
      await attend(tx, f.a, sessionId, dayIds[0], person.memberId);
      await attend(tx, f.a, sessionId, dayIds[2], person.memberId);

      await tx.as(person.claims);
      const rows = await missed(tx);
      expect(rows).toHaveLength(1);
      expect(rows[0].session_id).toBe(sessionId);
      expect(rows[0].session_title).toBe("ورشة");
      expect(rows[0].day_count).toBe(3);
      expect(rows[0].day_position).toBe(2);
    });
  });

  it("returns every missed day of a session, in day order", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const person = f.a.members[1];
      const { sessionId, dayIds } = await makeWorkshop(tx, f.a, 4);
      await attend(tx, f.a, sessionId, dayIds[0], person.memberId);

      await tx.as(person.claims);
      expect((await missed(tx)).map((r) => r.day_position)).toEqual([2, 3, 4]);
    });
  });
});

describe("RPC-missed_attendance_days.silent_when_complete", () => {
  it("a workshop attended in full explains nothing, because there is nothing to explain", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const person = f.a.members[1];
      const { sessionId, dayIds } = await makeWorkshop(tx, f.a, 3);
      for (const dayId of dayIds) await attend(tx, f.a, sessionId, dayId, person.memberId);

      await tx.as(person.claims);
      expect(await missed(tx)).toEqual([]);
    });
  });

  it("a member who never turned up at all is not listed — an absence is not a missed day", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const person = f.a.members[1];
      await makeWorkshop(tx, f.a, 3);

      await tx.as(person.claims);
      expect(await missed(tx)).toEqual([]);
    });
  });

  it("require_all_days = false: one day attended is the whole award, so nothing is listed", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const person = f.a.members[1];
      const { sessionId, dayIds } = await makeWorkshop(tx, f.a, 3);
      await tx.q(`update public.sessions set require_all_days = false where id = $1`, [sessionId]);
      await attend(tx, f.a, sessionId, dayIds[0], person.memberId);

      await tx.as(person.claims);
      expect(await missed(tx)).toEqual([]);
    });
  });
});

describe("RPC-missed_attendance_days.multi_day_only", () => {
  it("★ a one-day session never appears, so a one-day history renders exactly as it does today", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const person = f.a.members[1];
      const { sessionId, dayIds } = await makeWorkshop(tx, f.a, 1);
      await attend(tx, f.a, sessionId, dayIds[0], person.memberId);

      await tx.as(person.claims);
      expect(await missed(tx)).toEqual([]);

      // …and still nothing once that one check-in is retracted: a removal is
      // not a missed day either, and the member already sees the reversal row
      // with its own reason.
      await tx.asOwner();
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where session_id = $1`, [sessionId, f.a.admin.memberId]);
      await tx.as(person.claims);
      expect(await missed(tx)).toEqual([]);
    });
  });
});
