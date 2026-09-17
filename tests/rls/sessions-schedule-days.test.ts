// `schedule_session()` on the day set, and `publish_session()`'s per-day gap —
// contract 3 (DEC-119, DEC-150, DEC-151). Proposed SQL, applied with
// applyProposed() inside each transaction and rolled back with it, so nothing
// here touches the shared database or supabase/migrations/ (DEC-040).
//
// ★ THE FIRST DESCRIBE IS THE HALF OF THE WAVE'S SECOND DEMONSTRABLE THIS
// TRACK OWNS: a null `p_days` does what `main` does, counted — one session
// write, one `session.scheduled` row, one day carrying the window.
//
// A NEW file (wave-9 rule 4). Named `sessions-schedule-days` and not
// `session-days` so it cannot be mistaken for the lead's `0100` suite.
//
// `03` §8.2 rows: RPC-schedule_session.days_null_is_today, .days_written,
// .days_derive_the_session, .days_required, .day_has_attendance,
// .days_refusals, .day_venue_rules, .require_all_days,
// RPC-publish_session.missing_days.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

// Applied while it is proposed; a no-op once the lead has promoted it (it went
// in as `0106_schedule_session_days.sql`). The same guard
// `tests/rls/admin-export-audit.test.ts` uses, and the reason this file did not
// start failing for five other teammates the moment it was promoted.
const FILE = "sessions/0001_schedule_session_days.sql";

async function setup(tx: Tx) {
  const f = await seed(tx);
  if (existsSync(join(process.cwd(), "supabase", "proposed", FILE))) await applyProposed(tx, FILE);
  return f;
}

/** A bare `approved` session, ready to be scheduled. */
async function approvedSession(tx: Tx, org: Org, title = "ورشة ثلاثة أيام"): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, state)
     values ($1, $2, 'ملخص', $3, 'introductory', 'approved') returning id`,
    [org.id, title, org.categoryId],
  );
  return row.id;
}

/** Wednesday, Thursday and Friday evenings — the demonstrable's shape. */
function evenings(n: number, venueId: string | null): { starts_at: string; ends_at: string; venue_id: string | null }[] {
  const base = Date.parse("2026-09-30T15:00:00.000Z");
  return Array.from({ length: n }, (_, i) => ({
    starts_at: new Date(base + i * 86_400_000).toISOString(),
    ends_at: new Date(base + i * 86_400_000 + 2 * 3_600_000).toISOString(),
    venue_id: venueId,
  }));
}

type DayRow = { id: string; position: number; starts_at: Date; ends_at: Date; venue_id: string | null; check_in_open: boolean };

function daysOf(tx: Tx, sessionId: string) {
  return tx.q<DayRow>(
    `select id, position, starts_at, ends_at, venue_id, check_in_open
       from public.session_days where session_id = $1 order by position`,
    [sessionId],
  );
}

/** The 14-argument positional call every existing suite and `main` makes. */
const CALL_14 = `select * from public.schedule_session($1, $2, 60, null, $3, null, null, null, 40, null, null, 'off', 'ar', true)`;
/** The same, plus a day set and the flag. */
const CALL_16 = `select * from public.schedule_session($1, $2, 60, null, $3, null, null, null, 40, null, null, 'off', 'ar', true, $4::jsonb, $5)`;

const STARTS = "2026-09-30T15:00:00.000Z";

describe("RPC-schedule_session.days_null_is_today — main's call, byte for byte", () => {
  it("★ a null p_days writes the session once, audits once, and leaves ONE day carrying the window", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);

      await tx.as(f.a.admin.claims);
      const [row] = await tx.q<{ starts_at: Date; ends_at: Date; venue_id: string; require_all_days: boolean }>(CALL_14, [sessionId, STARTS, f.a.venueId]);
      // `ends_at` is still start + duration, as 0085 derived it.
      expect(new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()).toBe(60 * 60_000);
      expect(row.venue_id).toBe(f.a.venueId);
      // REQ-SES-017's default is untouched by a call that never names it.
      expect(row.require_all_days).toBe(true);

      await tx.asOwner();
      const days = await daysOf(tx, sessionId);
      expect(days).toHaveLength(1);
      expect(days[0].position).toBe(1);
      expect(new Date(days[0].starts_at).toISOString()).toBe(new Date(row.starts_at).toISOString());
      expect(days[0].venue_id).toBe(f.a.venueId);

      const [audit] = await tx.q<{ n: string }>(
        `select count(*) as n from public.audit_log where subject_id = $1 and action = 'session.scheduled'`,
        [sessionId],
      );
      expect(Number(audit.n)).toBe(1);
    });
  });

  it("a 13-argument positional call still resolves — the two new parameters are trailing and defaulted", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const [row] = await tx.q<{ allow_walk_ins: boolean }>(
        `select allow_walk_ins from public.schedule_session($1, $2, 60, null, $3, null, null, null, 40, null, null, 'off', 'ar')`,
        [sessionId, STARTS, f.a.venueId],
      );
      expect(row.allow_walk_ins).toBe(false);
    });
  });
});

describe("RPC-schedule_session.days_written / .days_derive_the_session", () => {
  it("★ three days: the session's stored window spans them, its venue is the first day's, and it is written ONCE", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);

      await tx.as(f.a.admin.claims);
      const three = evenings(3, f.a.venueId);
      const [row] = await tx.q<{ starts_at: Date; ends_at: Date; venue_id: string; require_all_days: boolean }>(
        CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(three), false],
      );
      expect(new Date(row.starts_at).toISOString()).toBe(three[0].starts_at);
      expect(new Date(row.ends_at).toISOString()).toBe(three[2].ends_at);
      expect(row.venue_id).toBe(f.a.venueId);
      expect(row.require_all_days).toBe(false);

      await tx.asOwner();
      const days = await daysOf(tx, sessionId);
      expect(days.map((d) => d.position)).toEqual([1, 2, 3]);
      expect(days.map((d) => new Date(d.starts_at).toISOString())).toEqual(three.map((d) => d.starts_at));
      // A new day is born with its own switch open (0101's column default).
      expect(days.every((d) => d.check_in_open)).toBe(true);

      // ★ ONE session write for the whole change: three inserts through one
      // statement, and trigger B finds nothing left to derive.
      const [audit] = await tx.q<{ n: string }>(
        `select count(*) as n from public.audit_log where subject_id = $1 and action = 'session.scheduled'`,
        [sessionId],
      );
      expect(Number(audit.n)).toBe(1);
    });
  });

  it("★ ONE reschedule notice for a whole day-set change — the reason the diff is one statement", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const two = evenings(2, f.a.venueId);
      await tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(two), null]);
      await tx.q(`select * from public.publish_session($1)`, [sessionId]);

      await tx.asOwner();
      const before = await daysOf(tx, sessionId);
      await tx.q(
        `insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`,
        [f.a.id, sessionId, f.a.members[0].memberId],
      );
      // Publishing announced the session; only `MSG-session_changed` from here
      // on is this case's subject.
      await tx.q(`delete from public.notifications where session_id = $1`, [sessionId]);
      // ★ AND `session_days_changed()` DE-DUPLICATES PER TRANSACTION
      // (`kareem.days_notified`, 0111) — one notice per session however many
      // times it is called, which is right in production, where every RPC is
      // its own transaction. An RLS case is ONE transaction, so the scheduling
      // call above already spent this session's notice on a draft that
      // notified nobody. Cleared here so the act below is the first, exactly as
      // it is for a real admin pressing «احفظ التعديلات».
      await tx.q(`select set_config('kareem.days_notified', '', true)`);

      // ★ THE SHAPE THAT BREAKS A THREE-STATEMENT DIFF. Day 1 moves PAST day 2
      // and day 2 is dropped, so the final window is Saturday alone. Run as
      // update-then-delete, the set after the update is (day 1 on Saturday,
      // day 2 still on Thursday) and derives Thursday-to-Saturday — a window
      // that is never the answer. Trigger B would write it to `sessions` and
      // `sessions_notify` would mail this member a notice naming Thursday, then
      // a second one after the delete. One statement means B only ever sees the
      // final set, finds `sessions` already equal, and writes nothing.
      await tx.as(f.a.admin.claims);
      const saturday = new Date(Date.parse(two[0].starts_at) + 3 * 86_400_000);
      const moved = [{
        id: before[0].id,
        starts_at: saturday.toISOString(),
        ends_at: new Date(saturday.getTime() + 2 * 3_600_000).toISOString(),
        venue_id: f.a.venueId,
      }];
      await tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(moved), null]);

      await tx.asOwner();
      expect(await daysOf(tx, sessionId)).toHaveLength(1);

      const [notices] = await tx.q<{ n: string }>(
        `select count(*) as n from public.notifications
          where session_id = $1 and key = 'MSG-session_changed' and member_id = $2`,
        [sessionId, f.a.members[0].memberId],
      );
      expect(Number(notices.n)).toBe(1);

      // ★ And the one notice names the window that actually resulted — never
      // the Thursday of an intermediate state.
      const [payload] = await tx.q<{ starts_at: string }>(
        `select payload->>'startsAt' as starts_at from public.notifications
          where session_id = $1 and key = 'MSG-session_changed' limit 1`,
        [sessionId],
      );
      expect(new Date(payload.starts_at).toISOString()).toBe(moved[0].starts_at);
    });
  });

  it("matches by id: an entry with an id moves that day, one without inserts, a stored day left out is deleted", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const three = evenings(3, f.a.venueId);
      await tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(three), null]);

      await tx.asOwner();
      const before = await daysOf(tx, sessionId);

      // Keep day 1 where it is, move day 2 a week later (so it becomes the
      // LAST day and the ranks change), drop day 3, add one in between.
      await tx.as(f.a.admin.claims);
      const movedTwo = new Date(Date.parse(three[1].starts_at) + 7 * 86_400_000);
      const next = [
        { id: before[0].id, starts_at: three[0].starts_at, ends_at: three[0].ends_at, venue_id: f.a.venueId },
        { id: before[1].id, starts_at: movedTwo.toISOString(), ends_at: new Date(movedTwo.getTime() + 2 * 3_600_000).toISOString(), venue_id: f.a.venueId },
        { starts_at: three[2].starts_at, ends_at: three[2].ends_at, venue_id: f.a.venueId },
      ];
      const [row] = await tx.q<{ starts_at: Date; ends_at: Date }>(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(next), null]);

      await tx.asOwner();
      const after = await daysOf(tx, sessionId);
      expect(after).toHaveLength(3);
      // ★ `position` is the CHRONOLOGICAL rank, not the array's order: the day
      // that moved a week out is day 3 even though it is second in the payload.
      expect(after.map((d) => d.id)).toEqual([before[0].id, expect.any(String), before[1].id]);
      expect(after[1].id).not.toBe(before[2].id);           // day 3 of the old set is gone
      expect(new Date(row.ends_at).toISOString()).toBe(next[1].ends_at);
      expect(new Date(row.starts_at).toISOString()).toBe(three[0].starts_at);
    });
  });

  it("a day may carry its own one-off place, and the session shows the first day's", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const [a, b] = evenings(2, null);
      const days = [
        { ...a, venue_id: null, custom_venue_name: "مقهى الحي", custom_venue_address: "شارع الأمير" },
        { ...b, venue_id: f.a.venueId },
      ];
      const [row] = await tx.q<{ venue_id: string | null; custom_venue_name: string | null; custom_venue_address: string | null }>(
        CALL_16, [sessionId, STARTS, null, JSON.stringify(days), null],
      );
      expect(row.venue_id).toBeNull();
      expect(row.custom_venue_name).toBe("مقهى الحي");
      expect(row.custom_venue_address).toBe("شارع الأمير");

      await tx.asOwner();
      const stored = await daysOf(tx, sessionId);
      expect(stored[0].venue_id).toBeNull();
      expect(stored[1].venue_id).toBe(f.a.venueId);
    });
  });
});

describe("RPC-schedule_session.days_required", () => {
  it("★ refuses a null p_days on a session that already has more than one day, BY NAME", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      await tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(evenings(3, f.a.venueId)), null]);

      const message = await errorMessage(() => tx.q(CALL_14, [sessionId, STARTS, f.a.venueId]));
      expect(message).toContain("days_required");

      // Nothing moved: the refusal came before the first write.
      await tx.asOwner();
      expect(await daysOf(tx, sessionId)).toHaveLength(3);
    });
  });

  it("allows a null p_days on a session with exactly one day — that is main's call", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      await tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(evenings(1, f.a.venueId)), null]);
      const later = new Date(Date.parse(STARTS) + 86_400_000).toISOString();
      const [row] = await tx.q<{ starts_at: Date }>(CALL_14, [sessionId, later, f.a.venueId]);
      expect(new Date(row.starts_at).toISOString()).toBe(later);

      await tx.asOwner();
      const days = await daysOf(tx, sessionId);
      expect(days).toHaveLength(1);
      expect(new Date(days[0].starts_at).toISOString()).toBe(later);
    });
  });
});

describe("RPC-schedule_session.day_has_attendance", () => {
  it("★ refuses to drop a day that holds a check-in, names its position, and writes nothing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const three = evenings(3, f.a.venueId);
      await tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(three), null]);

      await tx.asOwner();
      const days = await daysOf(tx, sessionId);
      // `check_ins_window()` keeps an explicit `session_day_id` and derives the
      // window and the org from it, so neither is passed here.
      await tx.q(
        `insert into public.check_ins (session_id, session_day_id, member_id, method, manual_reason, marked_by)
         values ($1, $2, $3, 'manual', 'حضر ولم يُسجّل', $4)`,
        [sessionId, days[1].id, f.a.members[0].memberId, f.a.admin.memberId],
      );

      await tx.as(f.a.admin.claims);
      const keepFirstOnly = [{ id: days[0].id, starts_at: three[0].starts_at, ends_at: three[0].ends_at, venue_id: f.a.venueId }];
      const message = await errorMessage(() => tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(keepFirstOnly), null]));
      expect(message).toContain("day_has_attendance: 2");

      await tx.asOwner();
      expect(await daysOf(tx, sessionId)).toHaveLength(3);
    });
  });

  it("a REMOVED check-in still holds its day — attendance is evidence, not a live row", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const two = evenings(2, f.a.venueId);
      await tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(two), null]);

      await tx.asOwner();
      const days = await daysOf(tx, sessionId);
      await tx.q(
        `insert into public.check_ins (session_id, session_day_id, member_id, method, manual_reason, marked_by, removed_at)
         values ($1, $2, $3, 'manual', 'حضر ولم يُسجّل', $4, now())`,
        [sessionId, days[1].id, f.a.members[0].memberId, f.a.admin.memberId],
      );

      await tx.as(f.a.admin.claims);
      const keepFirstOnly = [{ id: days[0].id, starts_at: two[0].starts_at, ends_at: two[0].ends_at, venue_id: f.a.venueId }];
      const message = await errorMessage(() => tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(keepFirstOnly), null]));
      expect(message).toContain("day_has_attendance: 2");
    });
  });

  it("deleting a day PROMOTES its content to the session rather than deleting it (DEC-121)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const two = evenings(2, f.a.venueId);
      await tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(two), null]);

      await tx.asOwner();
      const days = await daysOf(tx, sessionId);
      const [task] = await tx.q<{ id: string }>(
        `insert into public.session_tasks (org_id, session_id, session_day_id, kind, title)
         values ($1, $2, $3, 'checklist', 'أحضر حاسوبك') returning id`,
        [f.a.id, sessionId, days[1].id],
      );

      await tx.as(f.a.admin.claims);
      const keepFirstOnly = [{ id: days[0].id, starts_at: two[0].starts_at, ends_at: two[0].ends_at, venue_id: f.a.venueId }];
      await tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(keepFirstOnly), null]);

      await tx.asOwner();
      const [row] = await tx.q<{ session_id: string; session_day_id: string | null }>(
        `select session_id, session_day_id from public.session_tasks where id = $1`, [task.id],
      );
      expect(row.session_id).toBe(sessionId);
      expect(row.session_day_id).toBeNull();
    });
  });
});

describe("RPC-schedule_session.days_refusals — each by name, each before the first write", () => {
  const cases: [string, (venueId: string, sessionId: string) => unknown][] = [
    ["days_empty", () => []],
    ["days_invalid", () => "not an array"],
    ["days_invalid", (v) => [{ ...evenings(1, v)[0], starts_at: "الأربعاء" }]],
    ["day_window_invalid", (v) => [{ ...evenings(1, v)[0], ends_at: evenings(1, v)[0].starts_at }]],
    ["days_overlap", (v) => { const [a] = evenings(1, v); return [a, { ...a }]; }],
    ["days_too_many", (v) => evenings(31, v)],
  ];

  for (const [name, build] of cases) {
    it(`refuses ${name}`, async () => {
      await withTx(async (tx) => {
        const f = await setup(tx);
        const sessionId = await approvedSession(tx, f.a);
        await tx.as(f.a.admin.claims);
        const payload = JSON.stringify(build(f.a.venueId, sessionId));
        const message = await errorMessage(() => tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, payload, null]));
        expect(message).toContain(name);

        await tx.asOwner();
        const [row] = await tx.q<{ starts_at: Date | null }>(`select starts_at from public.sessions where id = $1`, [sessionId]);
        expect(row.starts_at).toBeNull();            // nothing was written
        expect(await daysOf(tx, sessionId)).toHaveLength(0);
      });
    });
  }

  it("refuses an id that names another session's day — 42501, like session_not_found", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const mine = await approvedSession(tx, f.a);
      const theirs = await approvedSession(tx, f.a, "جلسة أخرى");
      await tx.as(f.a.admin.claims);
      await tx.q(CALL_16, [theirs, STARTS, f.a.venueId, JSON.stringify(evenings(1, f.a.venueId)), null]);

      await tx.asOwner();
      const [alien] = await daysOf(tx, theirs);

      await tx.as(f.a.admin.claims);
      const payload = JSON.stringify([{ ...evenings(1, f.a.venueId)[0], id: alien.id }]);
      const code = await errorCode(() => tx.q(CALL_16, [mine, STARTS, f.a.venueId, payload, null]));
      expect(code).toBe("42501");
    });
  });

  it("refuses the same id twice", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      await tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(evenings(1, f.a.venueId)), null]);

      await tx.asOwner();
      const [day] = await daysOf(tx, sessionId);

      await tx.as(f.a.admin.claims);
      const two = evenings(2, f.a.venueId).map((d) => ({ ...d, id: day.id }));
      const message = await errorMessage(() => tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(two), null]));
      expect(message).toContain("day_repeated");
    });
  });
});

describe("RPC-schedule_session.day_venue_rules", () => {
  it("refuses a day naming both a venue and a one-off place", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const payload = JSON.stringify([{ ...evenings(1, f.a.venueId)[0], custom_venue_name: "مقهى", custom_venue_address: "شارع" }]);
      const message = await errorMessage(() => tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, payload, null]));
      expect(message).toContain("day_venue_or_custom_not_both");
    });
  });

  it("refuses a one-off place with a name and no address", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const payload = JSON.stringify([{ ...evenings(1, null)[0], custom_venue_name: "مقهى" }]);
      const message = await errorMessage(() => tx.q(CALL_16, [sessionId, STARTS, null, payload, null]));
      expect(message).toContain("day_custom_venue_needs_name_and_address");
    });
  });

  it("refuses ANOTHER ORG's venue on a day — the isolation the session-level check already has", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const payload = JSON.stringify(evenings(1, f.b.venueId));
      const message = await errorMessage(() => tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, payload, null]));
      expect(message).toContain("day_venue_not_found");
    });
  });
});

describe("RPC-schedule_session.require_all_days", () => {
  it("sets the flag when named and leaves it alone when null (REQ-SES-017, the p_allow_walk_ins rule)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const one = JSON.stringify(evenings(1, f.a.venueId));

      const [off] = await tx.q<{ require_all_days: boolean }>(CALL_16, [sessionId, STARTS, f.a.venueId, one, false]);
      expect(off.require_all_days).toBe(false);

      const [unchanged] = await tx.q<{ require_all_days: boolean }>(CALL_16, [sessionId, STARTS, f.a.venueId, one, null]);
      expect(unchanged.require_all_days).toBe(false);

      const [on] = await tx.q<{ require_all_days: boolean }>(CALL_16, [sessionId, STARTS, f.a.venueId, one, true]);
      expect(on.require_all_days).toBe(true);
    });
  });
});

describe("RPC-publish_session.missing_days", () => {
  it("★ a one-day session's refusal message is unchanged — no `days`, no `day:…`", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const message = await errorMessage(() => tx.q(`select * from public.publish_session($1)`, [sessionId]));
      // Nothing scheduled at all: 0021's four, and `days` because there is none.
      expect(message).toContain("starts_at");
      expect(message).toContain("capacity");
      expect(message).not.toContain("day:");
    });
  });

  it("names a day after the first that has no place", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const [a, b] = evenings(2, null);
      const payload = JSON.stringify([{ ...a, venue_id: f.a.venueId }, { ...b, venue_id: null }]);
      await tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, payload, null]);

      const message = await errorMessage(() => tx.q(`select * from public.publish_session($1)`, [sessionId]));
      expect(message).toContain("day:2:venue");
    });
  });

  it("publishes a complete three-day workshop", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      await tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(evenings(3, f.a.venueId)), null]);
      const [row] = await tx.q<{ state: string }>(`select state from public.publish_session($1)`, [sessionId]);
      expect(row.state).toBe("published");
    });
  });
});

// ── Contract 11, waiting on `notify` ────────────────────────────────────────
//
// `supabase/proposed/sessions/0002_announce_the_day_set.sql` shapes the day
// snapshots into `notify`'s published words and wires
// `session_days_changed()`. It cannot be exercised until that function is
// promoted — a day-aware save would raise `undefined_function` — so what is
// asserted here is what CAN be: the file is valid SQL, it replaces
// `schedule_session()` without adding an overload, and it leaves main's path
// exactly where `0106` left it. The announcing case joins this file in the same
// commit that promotes both halves.
describe("0002 — the day-set announcement, before notify's half is promoted", () => {
  it("applies, replaces the function rather than overloading it, and leaves a one-day save untouched", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "sessions/0002_announce_the_day_set.sql");

      await tx.asOwner();
      const [overloads] = await tx.q<{ n: string }>(
        `select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'schedule_session'`,
      );
      expect(Number(overloads.n)).toBe(1);

      const sessionId = await approvedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      const [row] = await tx.q<{ starts_at: Date; venue_id: string }>(CALL_14, [sessionId, STARTS, f.a.venueId]);
      expect(new Date(row.starts_at).toISOString()).toBe(STARTS);
      expect(row.venue_id).toBe(f.a.venueId);

      await tx.asOwner();
      expect(await daysOf(tx, sessionId)).toHaveLength(1);
    });
  });
});

// ── The public card (F3), in this file because it shares the seed and the
// migration set: `supabase/proposed/sessions/0003_public_card_day_count.sql`.
//
// `03` §8.2 row: POL-sessions.public_card.day_count.
describe("POL-sessions.public_card.day_count — a shared link says how many days", () => {
  it("★ carries the count for anon, WITHOUT granting anon a single row of session_days", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "sessions/0003_public_card_day_count.sql");
      const sessionId = await approvedSession(tx, f.a);

      await tx.as(f.a.admin.claims);
      const three = evenings(3, f.a.venueId);
      await tx.q(CALL_16, [sessionId, STARTS, f.a.venueId, JSON.stringify(three), null]);
      await tx.q(`select * from public.publish_session($1)`, [sessionId]);

      await tx.asAnon();
      const [card] = await tx.q<{ day_count: number; starts_at: Date; ends_at: Date }>(
        `select day_count, starts_at, ends_at from public.session_public_card($1)`,
        [sessionId],
      );
      expect(card.day_count).toBe(3);
      // ★ The SPAN needs no days at all: contract 1 stored it on the session.
      expect(new Date(card.starts_at).toISOString()).toBe(three[0].starts_at);
      expect(new Date(card.ends_at).toISOString()).toBe(three[2].ends_at);

      // …and the table itself stays shut to a link-holding stranger.
      const code = await errorCode(() => tx.q(`select id from public.session_days where session_id = $1`, [sessionId]));
      expect(code).not.toBeNull();
    });
  });

  it("says one for a one-day session, which is every session on main", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "sessions/0003_public_card_day_count.sql");
      const sessionId = await approvedSession(tx, f.a);

      await tx.as(f.a.admin.claims);
      await tx.q(CALL_14, [sessionId, STARTS, f.a.venueId]);
      await tx.q(`select * from public.publish_session($1)`, [sessionId]);

      await tx.asAnon();
      const [card] = await tx.q<{ day_count: number }>(`select day_count from public.session_public_card($1)`, [sessionId]);
      expect(card.day_count).toBe(1);
    });
  });
});
