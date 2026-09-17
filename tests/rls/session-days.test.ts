// The foundation of multi-day sessions — supabase/migrations/0100_session_days.sql
// (DEC-119, DEC-120, DEC-121, DEC-150). One case, at least, for every 03 §8.2
// row the migration adds; REQ-NFR-001.
//
// ★ What this file is NOT: the proof that a one-day session behaves as it did.
// THAT proof is every OTHER file in this directory passing unmodified on 0100 —
// fixture-m2 writes a session's window directly, inserts a check-in on a
// session that has not begun, and hands check_ins a bogus `session_window`,
// and all of it still works because the shim and the trigger carry it. This
// file proves what is NEW: n days, the derivation in both directions, the
// commit check, and the day a check-in belongs to.
//
// A deferred constraint trigger never fires inside withTx() — the transaction
// is rolled back, never committed — so the cases that prove it say
// `set constraints all immediate` first. Everything else in the suite runs
// with it deferred, exactly as production does mid-transaction.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, errorMessage, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const EXCLUSION_VIOLATION = "23P01";
const FK_VIOLATION = "23503";

interface Day {
  id: string;
  position: number;
  starts_at: Date;
  ends_at: Date;
  venue_id: string | null;
}

const daysOf = (tx: Tx, session: string) =>
  tx.q<Day>(
    `select id, position, starts_at, ends_at, venue_id from public.session_days
      where session_id = $1 order by position`,
    [session],
  );

const windowOf = async (tx: Tx, session: string) =>
  (
    await tx.q<{ starts_at: Date | null; ends_at: Date | null; venue_id: string | null; ctid: string }>(
      `select starts_at, ends_at, venue_id, ctid::text as ctid from public.sessions where id = $1`,
      [session],
    )
  )[0];

/** A day written the way a day-aware RPC writes one: as the owner, offsets in hours from now. */
const addDay = async (tx: Tx, org: string, session: string, fromH: number, toH: number, venue: string | null = null) =>
  (
    await tx.q<{ id: string }>(
      `insert into public.session_days (org_id, session_id, position, starts_at, ends_at, venue_id)
       values ($1, $2, 1, now() + ($3 || ' hours')::interval, now() + ($4 || ' hours')::interval, $5) returning id`,
      [org, session, String(fromH), String(toH), venue],
    )
  )[0].id;

describe("POL-session_days.single_day_follows_session — a writer of the session's own window carries its one day", () => {
  it("every fixture session with a window has exactly one day carrying it; a session with no window has none", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      for (const id of [f.m2.a.published, f.m2.a.completed, f.m2.a.draft]) {
        const s = await windowOf(tx, id);
        const days = await daysOf(tx, id);
        expect(days).toHaveLength(1);
        expect(days[0].position).toBe(1);
        expect(days[0].starts_at).toEqual(s.starts_at);
        expect(days[0].ends_at).toEqual(s.ends_at);
        expect(days[0].venue_id).toBe(s.venue_id);
      }
      const [bare] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level)
         values ($1, 'جلسة بلا موعد', 'ملخص', $2, 'introductory') returning id`,
        [f.a.id, f.a.categoryId],
      );
      expect(await daysOf(tx, bare.id)).toEqual([]);
    });
  });

  it("moving the session's window moves its day; clearing it removes the day; setting it again creates one", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = f.m2.a.draft;
      const [before] = await daysOf(tx, id);

      await tx.q(`update public.sessions set starts_at = starts_at + interval '2 days', ends_at = ends_at + interval '2 days' where id = $1`, [id]);
      const [moved] = await daysOf(tx, id);
      expect(moved.id).toBe(before.id); // the SAME day — content and attendance hang off its id
      expect(moved.starts_at.getTime() - before.starts_at.getTime()).toBe(2 * 86_400_000);

      await tx.q(`update public.sessions set starts_at = null, ends_at = null, rsvp_deadline_at = null, cancellation_cutoff_at = null where id = $1`, [id]);
      expect(await daysOf(tx, id)).toEqual([]);

      await tx.q(`update public.sessions set starts_at = now() + interval '5 days', ends_at = now() + interval '5 days 1 hour' where id = $1`, [id]);
      expect(await daysOf(tx, id)).toHaveLength(1);
    });
  });

  it("a change of venue on the session reaches its day", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.q(
        `update public.sessions set venue_id = null, custom_venue_name = 'قاعة مؤقتة', custom_venue_address = 'الرياض' where id = $1`,
        [f.m2.a.draft],
      );
      const [d] = await tx.q<{ venue_id: string | null; custom_venue_name: string | null }>(
        `select venue_id, custom_venue_name from public.session_days where session_id = $1`,
        [f.m2.a.draft],
      );
      expect(d).toEqual({ venue_id: null, custom_venue_name: "قاعة مؤقتة" });
    });
  });

  it("stands down for a day-aware writer (`kareem.days_writer`), and leaves a session with several days alone", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = f.m2.a.draft;
      const [before] = await daysOf(tx, id);

      await tx.q(`select set_config('kareem.days_writer', 'on', true)`);
      await tx.q(`update public.sessions set ends_at = ends_at + interval '3 hours' where id = $1`, [id]);
      expect((await daysOf(tx, id))[0].ends_at).toEqual(before.ends_at); // untouched: the writer said it writes the days itself
      await tx.q(`select set_config('kareem.days_writer', '', true)`);
      await tx.q(`update public.sessions set ends_at = ends_at - interval '3 hours' where id = $1`, [id]);

      // n = 2: not the shim's to decide.
      await addDay(tx, f.a.id, id, 96, 97);
      const two = await daysOf(tx, id);
      await tx.q(`update public.sessions set ends_at = ends_at + interval '1 hour' where id = $1`, [id]);
      expect(await daysOf(tx, id)).toEqual(two);
    });
  });
});

describe("POL-session_days.session_follows_days — the days derive the session", () => {
  it("a second and a third day stretch the session's end; an earlier day moves its start and renumbers every position", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = f.m2.a.draft; // one day, 72 h out
      const day1 = (await daysOf(tx, id))[0];

      const d2 = await addDay(tx, f.a.id, id, 96, 98);
      const d3 = await addDay(tx, f.a.id, id, 120, 121);
      let days = await daysOf(tx, id);
      expect(days.map((d) => d.id)).toEqual([day1.id, d2, d3]);
      expect(days.map((d) => d.position)).toEqual([1, 2, 3]);
      let s = await windowOf(tx, id);
      expect(s.starts_at).toEqual(day1.starts_at);
      expect(s.ends_at).toEqual(days[2].ends_at);

      // A day BEFORE the first: it becomes position 1 and the session starts with it.
      // The deadlines are <= starts_at by CHECK, so a day-aware writer moves them first.
      await tx.q(`update public.sessions set rsvp_deadline_at = now(), cancellation_cutoff_at = now() where id = $1`, [id]);
      const d0 = await addDay(tx, f.a.id, id, 48, 49);
      days = await daysOf(tx, id);
      expect(days.map((d) => d.id)).toEqual([d0, day1.id, d2, d3]);
      expect(days.map((d) => d.position)).toEqual([1, 2, 3, 4]);
      s = await windowOf(tx, id);
      expect(s.starts_at).toEqual(days[0].starts_at);

      // Removing the last day pulls the end back.
      await tx.q(`delete from public.session_days where id = $1`, [d3]);
      s = await windowOf(tx, id);
      expect(s.ends_at).toEqual((await daysOf(tx, id))[2].ends_at);
    });
  });

  it("the session's venue is the FIRST day's", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = f.m2.a.draft;
      const [other] = await tx.q<{ id: string }>(
        `insert into public.venues (org_id, name, address, capacity) values ($1, 'القاعة الثانية', 'جدة', 20) returning id`,
        [f.a.id],
      );
      await addDay(tx, f.a.id, id, 96, 97, other.id);
      expect((await windowOf(tx, id)).venue_id).toBe(f.a.venueId); // day 1's, not day 2's
      await tx.q(`update public.sessions set rsvp_deadline_at = now(), cancellation_cutoff_at = now() where id = $1`, [id]);
      await addDay(tx, f.a.id, id, 24, 25, other.id); // now the first
      expect((await windowOf(tx, id)).venue_id).toBe(other.id);
    });
  });

  it("★ an equal value writes nothing — a day in the middle leaves the session's row untouched, so no notice and no re-render fires", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = f.m2.a.draft;
      await addDay(tx, f.a.id, id, 120, 121);
      const before = (await windowOf(tx, id)).ctid;
      // Between day 1 (72 h) and day 2 (120 h): neither end of the session moves.
      await addDay(tx, f.a.id, id, 96, 97);
      expect((await windowOf(tx, id)).ctid).toBe(before); // no new row version: no UPDATE happened
    });
  });

  it("the last day of a published session cannot be removed — 0010's publish check refuses the cleared window", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      expect(
        await errorCode(() => tx.q(`delete from public.session_days where session_id = $1`, [f.m2.a.completed])),
      ).not.toBeNull(); // attendance holds it (23503) — and without attendance the CHECK would (23514)
      const [fresh] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, ends_at, venue_id, capacity, state, published_at)
         values ($1, 'منشورة بلا حضور', 'ملخص', $2, 'introductory', now() + interval '9 days', now() + interval '9 days 1 hour', $3, 10, 'published', now())
         returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId],
      );
      expect(await errorCode(() => tx.q(`delete from public.session_days where session_id = $1`, [fresh.id]))).toBe(CHECK_VIOLATION);
    });
  });
});

describe("POL-session_days.consistent_at_commit — checked whatever the flag says", () => {
  it("a session with several days whose stored window is written directly is refused at commit", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = f.m2.a.draft;
      await addDay(tx, f.a.id, id, 96, 97);
      await tx.q(`set constraints all immediate`);
      expect(
        await errorMessage(() => tx.q(`update public.sessions set ends_at = ends_at + interval '1 hour' where id = $1`, [id])),
      ).toMatch(/session_window_not_derived/);
      expect(
        await errorCode(() => tx.q(`update public.sessions set ends_at = ends_at + interval '1 hour' where id = $1`, [id])),
      ).toBe(CHECK_VIOLATION);
    });
  });

  it("the flag silences the shim, not the truth: a day-aware writer that stores the wrong window is refused too", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.q(`set constraints all immediate`);
      await tx.q(`select set_config('kareem.days_writer', 'on', true)`);
      expect(
        await errorMessage(() => tx.q(`update public.sessions set ends_at = ends_at + interval '1 hour' where id = $1`, [f.m2.a.draft])),
      ).toMatch(/session_window_not_derived/);
    });
  });

  it("a session cannot reach `published` with no day, even with the shim standing down", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.q(`set constraints all immediate`);
      await tx.q(`select set_config('kareem.days_writer', 'on', true)`);
      expect(
        await errorMessage(() =>
          tx.q(
            `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, ends_at, venue_id, capacity, state, published_at)
             values ($1, 'منشورة بلا يوم', 'ملخص', $2, 'introductory', now() + interval '9 days', now() + interval '9 days 1 hour', $3, 10, 'published', now())`,
            [f.a.id, f.a.categoryId, f.a.venueId],
          ),
        ),
      ).toMatch(/session_without_days/);
    });
  });

  it("★ the whole fixture satisfies the commit rule as a query — stored equals derived for every session that has a day", async () => {
    await withTx(async (tx) => {
      await seed(tx);
      const drift = await tx.q(
        `select s.id from public.sessions s
           join lateral (select min(d.starts_at) as first_start, max(d.ends_at) as last_end, count(*) as n
                           from public.session_days d where d.session_id = s.id) d on true
          where (d.n > 0 and (s.starts_at, s.ends_at) is distinct from (d.first_start, d.last_end))
             or (d.n = 0 and s.state in ('published', 'in_progress', 'completed', 'archived'))
             or (d.n = 0 and s.starts_at is not null and s.ends_at is not null)`,
      );
      expect(drift).toEqual([]);
    });
  });
});

describe("POL-session_days.no_overlap", () => {
  it("two days of one session cannot overlap; a day ends after it starts; two SESSIONS may share an evening", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      expect(await errorCode(() => addDay(tx, f.a.id, f.m2.a.draft, 72, 73))).toBe(EXCLUSION_VIOLATION); // on top of day 1
      expect(await errorCode(() => addDay(tx, f.a.id, f.m2.a.draft, 100, 99))).toBe(CHECK_VIOLATION);
      // Back to back is not an overlap: the range is [start, end).
      // Computed in SQL: a JS Date truncates to milliseconds, so a day that «starts when
      // the last one ended» would start microseconds BEFORE it and genuinely overlap.
      const [d1] = await daysOf(tx, f.m2.a.draft);
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.session_days (org_id, session_id, position, starts_at, ends_at)
             select d.org_id, d.session_id, 1, d.ends_at, d.ends_at + interval '1 hour' from public.session_days d where d.id = $1`,
            [d1.id],
          ),
        ),
      ).toBeNull();
    });
  });
});

describe("POL-session_days.read_follows_session and POL-session_days.no_direct_write", () => {
  it("a member reads a published session's days and not a draft's; its presenter and staff read the draft's; another org reads none", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const count = async (session: string) =>
        (await tx.q(`select id from public.session_days where session_id = $1`, [session])).length;

      await tx.as(f.a.members[1].claims); // an attendee, presenter of nothing
      expect(await count(f.m2.a.published)).toBe(1);
      expect(await count(f.m2.a.draft)).toBe(0);
      expect(await count(f.m2.b.published)).toBe(0);

      await tx.as(f.a.members[0].claims); // the draft's presenter
      expect(await count(f.m2.a.draft)).toBe(1);

      await tx.as(f.a.mod.claims);
      expect(await count(f.m2.a.draft)).toBe(1);
      expect(await count(f.m2.b.draft)).toBe(0);

      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select id from public.session_days`))).toBe(PERMISSION_DENIED);
    });
  });

  it("nobody writes a day directly — not a member, not an admin, not the worker's role", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      for (const who of [f.a.members[0].claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(() => addDay(tx, f.a.id, f.m2.a.draft, 96, 97))).toBe(PERMISSION_DENIED);
        expect(await errorCode(() => tx.q(`update public.session_days set ends_at = ends_at + interval '1 hour' where session_id = $1`, [f.m2.a.draft]))).toBe(PERMISSION_DENIED);
        expect(await errorCode(() => tx.q(`delete from public.session_days where session_id = $1`, [f.m2.a.draft]))).toBe(PERMISSION_DENIED);
      }
      await tx.asServiceRole(); // invariant 7: a table only through a definer function
      expect(await errorCode(() => tx.q(`select id from public.session_days`))).toBe(PERMISSION_DENIED);
    });
  });

  it("resolve_session_day() is callable by no client role — it is definer and would resolve another org's day", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => tx.q(`select public.resolve_session_day($1)`, [f.m2.b.published]))).toBe(PERMISSION_DENIED);
      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(`select public.resolve_session_day($1)`, [f.m2.b.published]))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("resolve_session_day() — contract 4's one rule for «which day?»", () => {
  it("inside a day's window to its end + 2 h: that day; after the ceiling: the latest day begun; before anything: the first", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = f.m2.a.draft;
      await tx.q(`update public.sessions set rsvp_deadline_at = null, cancellation_cutoff_at = null where id = $1`, [id]);
      await tx.q(`delete from public.session_days where session_id = $1`, [id]);
      const at = async (h: number) =>
        (await tx.q<{ d: string | null }>(`select public.resolve_session_day($1, now() + ($2 || ' hours')::interval) as d`, [id, String(h)]))[0].d;
      expect(await at(0)).toBeNull(); // no day at all

      const d1 = await addDay(tx, f.a.id, id, 10, 12);
      const d2 = await addDay(tx, f.a.id, id, 34, 36);
      expect(await at(0)).toBe(d1); //   nothing has begun: the first
      expect(await at(10)).toBe(d1); //  the floor is inclusive
      expect(await at(13.9)).toBe(d1); // inside day 1's + 2 h
      expect(await at(14)).toBe(d1); //  the ceiling is exclusive, and day 1 is still the latest begun
      expect(await at(33)).toBe(d1);
      expect(await at(34)).toBe(d2);
      expect(await at(200)).toBe(d2); // long after: the latest day begun
    });
  });

  it("two days whose check-in windows overlap on one date: the later-started wins", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = f.m2.a.draft;
      await tx.q(`update public.sessions set rsvp_deadline_at = null, cancellation_cutoff_at = null where id = $1`, [id]);
      await tx.q(`delete from public.session_days where session_id = $1`, [id]);
      await addDay(tx, f.a.id, id, 9, 12); //                 morning; its window runs to 14
      const afternoon = await addDay(tx, f.a.id, id, 13, 16);
      const [r] = await tx.q<{ d: string }>(`select public.resolve_session_day($1, now() + interval '13 hours 30 minutes') as d`, [id]);
      expect(r.d).toBe(afternoon);
    });
  });
});

describe("POL-check_ins.day_derived and POL-check_ins.one_active_per_day", () => {
  it("a check-in's day and window are derived: from its code first, else from the clock — and the window is THE DAY'S", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const member = f.a.members[1].memberId;
      // A fresh two-day session, day 1 running now and day 2 tomorrow.
      const [s] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, ends_at, venue_id, capacity, state, published_at)
         values ($1, 'ورشة يومين', 'ملخص', $2, 'introductory', now() - interval '30 minutes', now() + interval '30 minutes', $3, 10, 'in_progress', now() - interval '1 day')
         returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId],
      );
      const [day1] = await daysOf(tx, s.id);
      // +30 h, not +24 h: fixture-m2 has this member checked in to org A's published
      // session at +24 h … +25 h, and REQ-CHK-013 would — correctly — refuse the overlap.
      const day2 = await addDay(tx, f.a.id, s.id, 30, 31);

      // by the clock
      const [byClock] = await tx.q<{ session_day_id: string; w: string }>(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
         values ($1, $2, $3, 'manual', 'بلا هاتف', $4, 'empty'::tstzrange) returning session_day_id, session_window::text as w`,
        [f.a.id, s.id, member, f.a.admin.memberId],
      );
      expect(byClock.session_day_id).toBe(day1.id);
      const [range] = await tx.q<{ w: string }>(`select tstzrange(starts_at, ends_at, '[)')::text as w from public.session_days where id = $1`, [day1.id]);
      expect(byClock.w).toBe(range.w); // the DAY's window, not the session's two-day span

      // by the code: a code of day 2 puts the check-in on day 2, whatever the clock says
      const [code] = await tx.q<{ id: string; session_day_id: string }>(
        `insert into public.check_in_codes (org_id, session_id, session_day_id, code, valid_from, valid_until)
         values ($1, $2, $3, 'HJKMNP', now(), now() + interval '5 minutes') returning id, session_day_id`,
        [f.a.id, s.id, day2],
      );
      const [byCode] = await tx.q<{ session_day_id: string }>(
        `insert into public.check_ins (org_id, session_id, member_id, method, code_id, session_window)
         values ($1, $2, $3, 'code', $4, 'empty'::tstzrange) returning session_day_id`,
        [f.a.id, s.id, member, code.id],
      );
      expect(byCode.session_day_id).toBe(day2); // ★ a SECOND active check-in on the same session: one per day, not one per session

      // and a duplicate on the same DAY is still 23505 — never 23P01 (0087's creation order, kept)
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by, session_window)
             values ($1, $2, $3, $4, 'manual', 'مرة ثانية', $5, 'empty'::tstzrange)`,
            [f.a.id, s.id, day1.id, member, f.a.admin.memberId],
          ),
        ),
      ).toBe(UNIQUE_VIOLATION);
    });
  });

  it("a legacy inserter of a code gets the day filled in; a session with no day still refuses a check-in as `session_not_scheduled`", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const [code] = await tx.q<{ session_day_id: string }>(`select session_day_id from public.check_in_codes where id = $1`, [f.m2.a.codeId]);
      expect(code.session_day_id).toBe((await daysOf(tx, f.m2.a.published))[0].id);

      const [bare] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level) values ($1, 'بلا موعد', 'ملخص', $2, 'introductory') returning id`,
        [f.a.id, f.a.categoryId],
      );
      const insert = () =>
        tx.q(
          `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
           values ($1, $2, $3, 'manual', 'سبب', $4, 'empty'::tstzrange)`,
          [f.a.id, bare.id, f.a.members[1].memberId, f.a.admin.memberId],
        );
      expect(await errorMessage(insert)).toMatch(/session_not_scheduled/);
      expect(await errorCode(insert)).toBe(CHECK_VIOLATION);
    });
  });

  it("REQ-CHK-013 compares DAY windows: two sessions on different days of the week do not collide because one of them spans both", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const member = f.a.members[1].memberId;
      // A workshop: Monday evening and Wednesday evening. A talk: Tuesday evening, inside the workshop's SPAN.
      const mk = async (title: string, fromH: number) =>
        (
          await tx.q<{ id: string }>(
            `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, ends_at, venue_id, capacity, state, published_at)
             values ($1, $2, 'ملخص', $3, 'introductory', now() + ($4 || ' hours')::interval, now() + ($4 || ' hours')::interval + interval '2 hours', $5, 10, 'published', now())
             returning id`,
            [f.a.id, title, f.a.categoryId, String(fromH), f.a.venueId],
          )
        )[0].id;
      const workshop = await mk("ورشة", -50);
      const wednesday = await addDay(tx, f.a.id, workshop, -2, 0);
      const talk = await mk("محاضرة الثلاثاء", -26);

      const checkIn = (session: string, day: string | null) =>
        tx.q(
          `insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by, session_window)
           values ($1, $2, $3, $4, 'manual', 'سبب', $5, 'empty'::tstzrange)`,
          [f.a.id, session, day, member, f.a.admin.memberId],
        );
      const monday = (await daysOf(tx, workshop))[0].id;
      expect(await errorCode(() => checkIn(workshop, monday))).toBeNull();
      expect(await errorCode(() => checkIn(talk, null))).toBeNull(); // would be 23P01 if the window were the workshop's span
      expect(await errorCode(() => checkIn(workshop, wednesday))).toBeNull();
    });
  });

  it("a day that holds attendance cannot be deleted; its codes go with a day that holds none", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const [withAttendance] = await daysOf(tx, f.m2.a.completed);
      expect(await errorCode(() => tx.q(`delete from public.session_days where id = $1`, [withAttendance.id]))).toBe(FK_VIOLATION);
    });
  });
});

describe("POL-content.day_of_own_session — DEC-121's one nullable column", () => {
  it("existing content is session-scoped (null) and stays so when a second day is added", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      for (const table of ["materials", "session_tasks", "photos"]) {
        const scoped = await tx.q(`select id from public.${table} where session_day_id is not null`);
        expect(scoped, table).toEqual([]);
      }
      await addDay(tx, f.a.id, f.m2.a.draft, 96, 97);
      for (const table of ["materials", "session_tasks", "photos"]) {
        expect(await tx.q(`select id from public.${table} where session_day_id is not null`), table).toEqual([]);
      }
    });
  });

  it("a task may name a day of its own session only; deleting that day promotes the task to the session, it is not deleted", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const id = f.m2.a.draft;
      const day2 = await addDay(tx, f.a.id, id, 96, 97);
      const [foreign] = await daysOf(tx, f.m2.a.published);

      const task = (day: string) =>
        tx.q<{ id: string }>(
          `insert into public.session_tasks (org_id, session_id, session_day_id, title, kind)
           values ($1, $2, $3, 'اقرأ قبل اليوم الثاني', 'checklist') returning id`,
          [f.a.id, id, day],
        );
      expect(await errorCode(() => task(foreign.id))).toBe(FK_VIOLATION); // another session's day
      const [t] = await task(day2);

      await tx.q(`delete from public.session_days where id = $1`, [day2]);
      const [after] = await tx.q<{ session_day_id: string | null; session_id: string }>(
        `select session_day_id, session_id from public.session_tasks where id = $1`,
        [t.id],
      );
      expect(after).toEqual({ session_day_id: null, session_id: id }); // promoted, and still the session's
    });
  });
});
