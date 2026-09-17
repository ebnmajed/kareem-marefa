// Check-in moves to the day — migrations 0104_check_in_open_shadow.sql and
// 0105_check_in_day.sql (DEC-150 contract 4, DEC-151), promoted at sync 1.
//
// ★ What this file is NOT: the proof that a one-day session behaves as it did.
// That proof is `checkin.test.ts`, `checkin-window.test.ts`,
// `checkin-manual-mark.test.ts`, `checkin-removal.test.ts` and
// `checkin-early-completion.test.ts` passing UNMODIFIED on these two files —
// rule 4's untouched-suite ledger. This file proves what is NEW.
//
// `03` §8.2 rows: RPC-check_in.day_from_code, .already_checked_in_per_day,
// .rate_limit_per_day, .day_window, .day_switch, .overlap_compares_days;
// RPC-ensure_check_in_code.per_day; RPC-_issue_check_in_code.not_callable;
// RPC-revoke_check_in_code.per_day; RPC-mark_checked_in_manually.day;
// RPC-remove_check_in.day; RPC-set_check_in_open.day;
// POL-check_in_open.shadow_is_bool_or, .reopening_one_day_opens_only_that_day,
// .session_write_carries_to_every_day, .one_day_is_identical.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, errorMessage, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

interface DaySession {
  id: string;
  days: string[];
}

/**
 * A session with n days, built the way the schema itself builds one: the
 * session's own window creates day 1 through `0100`'s shim, and every further
 * day is inserted as the owner, which stretches the session's stored window
 * through `session_days_derive()`. Offsets are HOURS from now and may be
 * fractional.
 */
async function makeDaySession(tx: Tx, org: Org, state: string, days: [number, number][], opts: { checkInOpen?: boolean } = {}): Promise<DaySession> {
  const [first, ...rest] = days;
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins, check_in_open)
     values ($1, 'ورشة متعددة الأيام', 'ملخص', $2, 'introductory',
             now() + ($3 || ' hours')::interval, 60, now() + ($4 || ' hours')::interval,
             $5, 40, $6::public.session_state,
             case when $6 in ('published','in_progress','completed','archived') then now() - interval '10 days' end,
             case when $6 = 'completed' then now() - interval '1 hour' end,
             true, $7)
     returning id`,
    [org.id, org.categoryId, String(first[0]), String(first[1]), org.venueId, state, opts.checkInOpen ?? true],
  );
  for (const [from, to] of rest) {
    await tx.q(
      `insert into public.session_days (org_id, session_id, position, starts_at, ends_at, venue_id)
       values ($1, $2, 1, now() + ($3 || ' hours')::interval, now() + ($4 || ' hours')::interval, $5)`,
      [org.id, row.id, String(from), String(to), org.venueId],
    );
  }
  const ids = await tx.q<{ id: string }>(`select id from public.session_days where session_id = $1 order by position`, [row.id]);
  return { id: row.id, days: ids.map((d) => d.id) };
}

type Envelope = { status: string; check_in?: { id: string; session_day_id: string }; conflict_session_id?: string };

const checkIn = async (tx: Tx, session: string, code: string, day: string | null = null): Promise<Envelope> =>
  (await tx.q<{ r: Envelope }>(`select public.check_in($1, $2, $3) as r`, [session, code, day]))[0].r;

const codeFor = async (tx: Tx, session: string, day: string | null): Promise<string> =>
  (await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1, $2)`, [session, day]))[0].code;

const switchesOf = (tx: Tx, session: string) =>
  tx.q<{ check_in_open: boolean }>(`select check_in_open from public.session_days where session_id = $1 order by position`, [session]).then((r) =>
    r.map((d) => d.check_in_open),
  );

const shadowOf = async (tx: Tx, session: string): Promise<boolean> =>
  (await tx.q<{ check_in_open: boolean }>(`select check_in_open from public.sessions where id = $1`, [session]))[0].check_in_open;

// ═══════════════════════════════════════════════════════════════════════════
// the resolution rule — pinned to 0100's own trigger, at the same instant
// ═══════════════════════════════════════════════════════════════════════════
describe("contract 4 — a null day resolves exactly as 0100's trigger does", () => {
  /** What the legacy inserter gets: a check_ins row written with no day at all. */
  async function legacyDay(tx: Tx, org: Org, session: string, member: string): Promise<string> {
    const [row] = await tx.q<{ session_day_id: string }>(
      `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by)
       values ($1, $2, $3, 'manual', 'قديم', $3) returning session_day_id`,
      [org.id, session, member],
    );
    return row.session_day_id;
  }

  it("two meetings on one date: at 13:30 both the trigger and the RPCs name the AFTERNOON", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      // day 1 ran -4h … -1h; day 2 runs -0.5h … +2.5h. Uncapped, day 1's
      // ceiling would still be +1h — the exact overlap DEC-151 capped.
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-4, -1],
        [-0.5, 2.5],
      ]);

      expect(await legacyDay(tx, f.a, s.id, f.a.members[1].memberId)).toBe(s.days[1]);

      const code = await codeFor(tx, s.id, null);
      const [issued] = await tx.q<{ session_day_id: string }>(`select session_day_id from public.check_in_codes where code = $1`, [code]);
      expect(issued.session_day_id).toBe(s.days[1]);

      await tx.as(f.a.members[0].claims);
      const r = await checkIn(tx, s.id, code);
      expect(r.status).toBe("ok");
      expect(r.check_in?.session_day_id).toBe(s.days[1]);
    });
  });

  it("the morning of the same date, before the afternoon begins, names the MORNING", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-1, 1],
        [3, 5],
      ]);
      expect(await legacyDay(tx, f.a, s.id, f.a.members[1].memberId)).toBe(s.days[0]);
      const code = await codeFor(tx, s.id, null);
      const [issued] = await tx.q<{ session_day_id: string }>(`select session_day_id from public.check_in_codes where code = $1`, [code]);
      expect(issued.session_day_id).toBe(s.days[0]);
    });
  });

  it("after the last day: the latest day begun; before the first: the first, and check-in answers not_started", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const past = await makeDaySession(tx, f.a, "completed", [
        [-10, -8],
        [-6, -4],
      ]);
      expect(await legacyDay(tx, f.a, past.id, f.a.members[1].memberId)).toBe(past.days[1]);

      // Far out on purpose: fixture-m2's own `published` session is at +24 h
      // and `members[1]` holds a check-in on it, so a day there would collide
      // on the exclusion constraint for a reason that has nothing to do with
      // this case.
      const future = await makeDaySession(tx, f.a, "published", [
        [500, 502],
        [524, 526],
      ]);
      expect(await legacyDay(tx, f.a, future.id, f.a.members[1].memberId)).toBe(future.days[0]);
      await tx.as(f.a.members[0].claims);
      expect((await checkIn(tx, future.id, "ABCDEF")).status).toBe("not_started");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// check_in
// ═══════════════════════════════════════════════════════════════════════════
describe("RPC-check_in — the day's check-in", () => {
  it("the CODE names the day it is taking attendance for", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-30, -28],
        [-1, 1],
      ]);
      const code = await codeFor(tx, s.id, null);

      await tx.as(f.a.members[0].claims);
      const ok = await checkIn(tx, s.id, code);
      expect(ok.status).toBe("ok");
      expect(ok.check_in?.session_day_id).toBe(s.days[1]);
    });
  });

  it("★ a LEFTOVER live code of another day is invalid_code — never a refusal that says it was real (REQ-CHK-004)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      // Two meetings on one date. Day 1's code was minted inside day 1 and is
      // still within `valid_until` now that day 2 has begun — the case that
      // forced «the code's day, AND only while that day is taking attendance».
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-3, -1],
        [-0.25, 2],
      ]);
      const leftover = (
        await tx.q<{ code: string }>(
          `insert into public.check_in_codes (org_id, session_id, session_day_id, code, valid_from, valid_until)
           values ($1, $2, $3, 'CDEFGH', now() - interval '20 minutes', now() + interval '10 minutes') returning code`,
          [f.a.id, s.id, s.days[0]],
        )
      )[0].code;

      await tx.as(f.a.members[0].claims);
      // Unconstrained, this would resolve to day 1 and answer `session_ended`
      // — wrong (the member is standing in day 2) and a disclosure.
      expect((await checkIn(tx, s.id, leftover)).status).toBe("invalid_code");
    });
  });

  it("a code minted for a day that has not begun is invalid_code too", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-1, 1],
        [3, 5],
      ]);
      const early = (await tx.q<{ code: string }>(`select * from public._issue_check_in_code($1, $2)`, [s.id, s.days[1]]))[0].code;

      await tx.as(f.a.members[0].claims);
      expect((await checkIn(tx, s.id, early)).status).toBe("invalid_code");
    });
  });

  it("«already checked in» is per day: three days of one session are three check-ins, and the second attempt on one of them is the no-op", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-30, -28],
        [-6, -4],
        [-1, 1],
      ]);
      const member = f.a.members[0];

      // Days 1 and 2 are past their ceilings — the admin's correction path,
      // which has no ceiling (REQ-CHK-017).
      await tx.as(f.a.admin.claims);
      for (const day of [s.days[0], s.days[1]]) {
        await tx.q(`select * from public.mark_checked_in_manually($1, $2, 'حضر', $3)`, [s.id, member.memberId, day]);
      }

      await tx.asOwner();
      const code = await codeFor(tx, s.id, null);
      await tx.as(member.claims);
      expect((await checkIn(tx, s.id, code)).status).toBe("ok");
      // ★ Three rows, three DISJOINT session_windows. Had the window stayed
      // the session's, the exclusion constraint would have refused days 2 and 3.
      const rows = await tx.q<{ n: string }>(`select count(*) as n from public.check_ins where session_id = $1 and removed_at is null`, [s.id]);
      expect(rows[0].n).toBe("3");

      const again = await checkIn(tx, s.id, code);
      expect(again.status).toBe("already_checked_in");
      expect(again.check_in?.session_day_id).toBe(s.days[2]);
    });
  });

  it("the attempt stream is the day's: ten wrong codes against day 1 leave day 2 unlimited", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-1, 1],
        [3, 5],
      ]);
      const member = f.a.members[0];
      await tx.as(member.claims);
      for (let i = 0; i < 10; i++) await checkIn(tx, s.id, "WRONG1");
      expect((await checkIn(tx, s.id, "WRONG1")).status).toBe("rate_limited");

      // The same member, day 2 named explicitly: its own stream, untouched.
      // (Day 2 has not begun, so the answer is the window's, never the limit's.)
      expect((await checkIn(tx, s.id, "WRONG1", s.days[1])).status).toBe("not_started");

      await tx.asOwner();
      const stamped = await tx.q<{ session_day_id: string; n: string }>(
        `select session_day_id, count(*) as n from public.check_in_attempts where session_id = $1 group by 1`,
        [s.id],
      );
      expect(stamped.find((r) => r.session_day_id === s.days[0])?.n).toBe("11");
      expect(stamped.find((r) => r.session_day_id === s.days[1])?.n).toBe("1");
    });
  });

  it("day 2's ceiling refuses session_ended while day 3 is still ahead; day 2's switch refuses check_in_closed and leaves day 3 open", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-30, -28],
        [-6, -4],
        [20, 22],
      ]);
      await tx.as(f.a.members[0].claims);
      // Day 2 ended 4 h ago and its ceiling (−2 h) has passed; day 3 is ahead.
      expect((await checkIn(tx, s.id, "WRONG1", s.days[1])).status).toBe("session_ended");

      // Now a session whose day 2 is live, with its switch closed.
      await tx.asOwner();
      const live = await makeDaySession(tx, f.a, "in_progress", [
        [-30, -28],
        [-1, 1],
        [20, 22],
      ]);
      const code = await codeFor(tx, live.id, null);
      await tx.q(`update public.session_days set check_in_open = false where id = $1`, [live.days[1]]);
      expect(await switchesOf(tx, live.id)).toEqual([true, false, true]);

      await tx.as(f.a.members[0].claims);
      expect((await checkIn(tx, live.id, code)).status).toBe("check_in_closed");
    });
  });

  it("REQ-CHK-013 compares DAY windows: another session overlapping day 2 is named as the conflict", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const workshop = await makeDaySession(tx, f.a, "in_progress", [
        [-30, -28],
        [-1, 1],
      ]);
      const clash = await makeDaySession(tx, f.a, "in_progress", [[-0.5, 0.5]]);
      const member = f.a.members[0];

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.mark_checked_in_manually($1, $2, 'حضر', null)`, [clash.id, member.memberId]);

      await tx.asOwner();
      const code = await codeFor(tx, workshop.id, null);
      await tx.as(member.claims);
      const r = await checkIn(tx, workshop.id, code);
      expect(r.status).toBe("overlap");
      expect(r.conflict_session_id).toBe(clash.id);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// the codes
// ═══════════════════════════════════════════════════════════════════════════
describe("the day's code", () => {
  it("★ _issue_check_in_code is callable by no client role — the private core no longer defaults to `execute` for public", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [[-1, 1]]);

      for (const who of [f.a.members[0], f.a.mod, f.a.admin]) {
        await tx.as(who.claims);
        expect(await errorCode(() => tx.q(`select * from public._issue_check_in_code($1, $2)`, [s.id, s.days[0]]))).toBe(PERMISSION_DENIED);
      }
      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(`select * from public._issue_check_in_code($1, $2)`, [s.id, s.days[0]]))).toBe(PERMISSION_DENIED);
    });
  });

  it("issuance is the day's, and refused outside that day's floor and ceiling even while a later day is ahead", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-1, 1],
        [20, 22],
      ]);
      await tx.as(f.a.admin.claims);
      const [live] = await tx.q<{ session_day_id: string }>(`select * from public.ensure_check_in_code($1, $2)`, [s.id, s.days[0]]);
      expect(live.session_day_id).toBe(s.days[0]);
      expect(await errorMessage(() => tx.q(`select * from public.ensure_check_in_code($1, $2)`, [s.id, s.days[1]]))).toMatch(/not_open/);
    });
  });

  it("revoking is the day's: day 2's code is replaced and day 1's is untouched", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-30, -28],
        [-1, 1],
      ]);
      const stale = (await tx.q<{ id: string; code: string }>(`select * from public._issue_check_in_code($1, $2)`, [s.id, s.days[0]]))[0];
      const before = await codeFor(tx, s.id, s.days[1]);

      await tx.as(f.a.admin.claims);
      const [fresh] = await tx.q<{ code: string; session_day_id: string }>(`select * from public.revoke_check_in_code($1, null)`, [s.id]);
      expect(fresh.session_day_id).toBe(s.days[1]);
      expect(fresh.code).not.toBe(before);

      await tx.asOwner();
      const [day1] = await tx.q<{ revoked_at: Date | null }>(`select revoked_at from public.check_in_codes where id = $1`, [stale.id]);
      expect(day1.revoked_at).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// the manual mark and the removal
// ═══════════════════════════════════════════════════════════════════════════
describe("an admin corrects Tuesday's list on Thursday", () => {
  it("marks a past day present, is refused not_open on a FUTURE day, and a moderator is still bound by that day's ceiling", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-30, -28],
        [-1, 1],
        [20, 22],
      ]);
      const member = f.a.members[0];

      await tx.as(f.a.admin.claims);
      const [past] = await tx.q<{ session_day_id: string }>(`select * from public.mark_checked_in_manually($1, $2, 'تأخر التسجيل', $3)`, [
        s.id,
        member.memberId,
        s.days[0],
      ]);
      expect(past.session_day_id).toBe(s.days[0]);
      expect(
        await errorMessage(() => tx.q(`select * from public.mark_checked_in_manually($1, $2, 'مبكرًا', $3)`, [s.id, member.memberId, s.days[2]])),
      ).toMatch(/not_open/);

      await tx.as(f.a.mod.claims);
      expect(
        await errorMessage(() => tx.q(`select * from public.mark_checked_in_manually($1, $2, 'متأخر', $3)`, [s.id, f.a.members[1].memberId, s.days[0]])),
      ).toMatch(/not_open/);
      const [now] = await tx.q<{ session_day_id: string }>(`select * from public.mark_checked_in_manually($1, $2, 'حضر', null)`, [
        s.id,
        f.a.members[1].memberId,
      ]);
      expect(now.session_day_id).toBe(s.days[1]);
    });
  });

  it("removing day 2 leaves days 1 and 3 standing, and a second removal of the same day is not_found", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-30, -28],
        [-6, -4],
        [-1, 1],
      ]);
      const member = f.a.members[0];
      await tx.as(f.a.admin.claims);
      for (const day of s.days) {
        await tx.q(`select * from public.mark_checked_in_manually($1, $2, 'حضر', $3)`, [s.id, member.memberId, day]);
      }

      await tx.q(`select * from public.remove_check_in($1, $2, 'سُجّل خطأً', $3)`, [s.id, member.memberId, s.days[1]]);
      expect(await errorMessage(() => tx.q(`select * from public.remove_check_in($1, $2, 'مرة أخرى', $3)`, [s.id, member.memberId, s.days[1]]))).toMatch(
        /not_found/,
      );

      await tx.asOwner();
      const live = await tx.q<{ session_day_id: string }>(
        `select session_day_id from public.check_ins where session_id = $1 and member_id = $2 and removed_at is null order by session_day_id`,
        [s.id, member.memberId],
      );
      expect(live.map((r) => r.session_day_id).sort()).toEqual([s.days[0], s.days[2]].sort());
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// n = 1 — the whole path in one case
// ═══════════════════════════════════════════════════════════════════════════
// ★ This is not THE one-day proof: that is `checkin.test.ts`,
// `checkin-window.test.ts`, `checkin-manual-mark.test.ts`,
// `checkin-removal.test.ts` and `checkin-early-completion.test.ts` passing
// with their assertions untouched, which they do. This walks the same path in
// one place — issue, check in, repeat, rate limit, manual mark, removal — so
// a regression in the day-aware bodies reads as one failure with a name,
// rather than as a scatter across five files.
describe("a one-day session, end to end, on the day-aware functions", () => {
  it("issues, checks in, repeats as already_checked_in, rate-limits, marks manually, and removes — every envelope and error as main's", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [[-1, 1]]);
      expect(s.days).toHaveLength(1);

      await tx.as(f.a.admin.claims);
      const [issued] = await tx.q<{ code: string; session_day_id: string }>(`select * from public.ensure_check_in_code($1)`, [s.id]);
      expect(issued.session_day_id).toBe(s.days[0]);
      // Idempotent inside the rotation window — the host view calls it every render.
      expect((await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [s.id]))[0].code).toBe(issued.code);

      const member = f.a.members[0];
      await tx.as(member.claims);
      expect((await tx.q<{ r: Envelope }>(`select public.check_in($1, $2) as r`, [s.id, "WRONG1"]))[0].r.status).toBe("invalid_code");
      const ok = await checkIn(tx, s.id, issued.code);
      expect(ok.status).toBe("ok");
      expect((await checkIn(tx, s.id, issued.code)).status).toBe("already_checked_in");

      // The attempt stream, still ten in ten minutes — and on a member who is
      // NOT already checked in: `already_checked_in` returns before the
      // attempt row is written, so a checked-in member never reaches the
      // counter. That ordering is main's and is deliberate (DEC-015).
      const other = f.a.members[1];
      await tx.as(other.claims);
      for (let i = 0; i < 10; i++) await checkIn(tx, s.id, "WRONG1");
      expect((await checkIn(tx, s.id, "WRONG1")).status).toBe("rate_limited");

      await tx.as(f.a.admin.claims);
      const [marked] = await tx.q<{ session_day_id: string }>(`select * from public.mark_checked_in_manually($1, $2, 'نسي هاتفه')`, [
        s.id,
        other.memberId,
      ]);
      expect(marked.session_day_id).toBe(s.days[0]);
      await tx.q(`select * from public.remove_check_in($1, $2, 'سُجّل خطأً')`, [s.id, other.memberId]);

      await tx.asOwner();
      const live = await tx.q<{ member_id: string }>(`select member_id from public.check_ins where session_id = $1 and removed_at is null`, [s.id]);
      expect(live.map((r) => r.member_id)).toEqual([member.memberId]);
      // The reversal is still main's text until contract 5 switches it.
      const reversal = await tx.q<{ idempotency_key: string }>(
        `select idempotency_key from public.points_ledger where source = 'reversal' and session_id = $1`,
        [s.id],
      );
      expect(reversal.every((r) => /^reversal:.+:v1$/.test(r.idempotency_key))).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// the switch and its shadow
// ═══════════════════════════════════════════════════════════════════════════
describe("RPC-set_check_in_open — the day's switch, and sessions.check_in_open as its shadow", () => {
  it("moves the day's column, names the session in the audit row with the day in the payload, and returns the recomputed shadow", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-1, 1],
        [20, 22],
      ]);

      await tx.as(f.a.admin.claims);
      const [closed] = await tx.q<{ check_in_open: boolean }>(`select * from public.set_check_in_open($1, false, null)`, [s.id]);
      // Day 2 is still open, so bool_or keeps the session open — and the
      // returned row is re-read after the trigger, never the stale one.
      expect(closed.check_in_open).toBe(true);
      expect(await switchesOf(tx, s.id)).toEqual([false, true]);

      await tx.q(`select * from public.set_check_in_open($1, false, $2)`, [s.id, s.days[1]]);
      expect(await switchesOf(tx, s.id)).toEqual([false, false]);
      expect(await shadowOf(tx, s.id)).toBe(false);

      await tx.asOwner();
      const audit = await tx.q<{ subject_type: string; subject_id: string; after: { check_in_open: boolean; session_day_id: string } }>(
        `select subject_type, subject_id, after from public.audit_log
          where subject_id = $1 and action = 'session.check_in_open_changed' order by occurred_at`,
        [s.id],
      );
      expect(audit.map((a) => a.subject_type)).toEqual(["session", "session"]);
      expect(audit.map((a) => a.after.session_day_id)).toEqual([s.days[0], s.days[1]]);
      expect(audit.every((a) => a.after.check_in_open === false)).toBe(true);
    });
  });

  it("★ reopening ONE day of three opens only that day — the defect two mutually-triggering directions would have had", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-30, -28],
        [-1, 1],
        [20, 22],
      ]);
      await tx.q(`update public.session_days set check_in_open = false where session_id = $1`, [s.id]);
      expect(await switchesOf(tx, s.id)).toEqual([false, false, false]);
      expect(await shadowOf(tx, s.id)).toBe(false);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.set_check_in_open($1, true, $2)`, [s.id, s.days[1]]);

      await tx.asOwner();
      expect(await switchesOf(tx, s.id)).toEqual([false, true, false]);
      expect(await shadowOf(tx, s.id)).toBe(true);
    });
  });

  it("a writer of the SESSION's own column closes every day — which is how transition_session()'s early completion still works, untouched", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [
        [-1, 1],
        [20, 22],
        [44, 46],
      ]);
      expect(await switchesOf(tx, s.id)).toEqual([true, true, true]);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.transition_session($1, 'complete', null)`, [s.id]);

      await tx.asOwner();
      expect(await switchesOf(tx, s.id)).toEqual([false, false, false]);
      expect(await shadowOf(tx, s.id)).toBe(false);
    });
  });

  it("at one day the pair moves together in both directions, and the ceiling still refuses an open past it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const s = await makeDaySession(tx, f.a, "in_progress", [[-1, 1]]);

      await tx.as(f.a.admin.claims);
      const [closed] = await tx.q<{ check_in_open: boolean }>(`select * from public.set_check_in_open($1, false, null)`, [s.id]);
      expect(closed.check_in_open).toBe(false);
      expect(await switchesOf(tx, s.id)).toEqual([false]);

      const [reopened] = await tx.q<{ check_in_open: boolean }>(`select * from public.set_check_in_open($1, true, null)`, [s.id]);
      expect(reopened.check_in_open).toBe(true);

      await tx.asOwner();
      await tx.q(`update public.sessions set check_in_open = false where id = $1`, [s.id]);
      expect(await switchesOf(tx, s.id)).toEqual([false]);

      const past = await makeDaySession(tx, f.a, "completed", [[-5, -3]]);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => tx.q(`select * from public.set_check_in_open($1, true, null)`, [past.id]))).toMatch(/ceiling_passed/);
    });
  });
});
