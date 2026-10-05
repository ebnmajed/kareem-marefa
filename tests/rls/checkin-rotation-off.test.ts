// The check-in code may stay fixed for the day — REQ-CHK-019, DEC-254 §6, DEC-255 (D1, D3, D5).
// Proves supabase/proposed/checkin/01_rotation_off.sql through applyProposed().
//
// ★ D5: the lead promotes the core TOGETHER WITH `alter column check_in_rotation_seconds drop not null`, as one
// migration. Until then the column is `not null`, so each case's setup transaction runs the `drop not null` itself
// (rolled back with the test). After the promotion the statement is a no-op on a nullable column and the file passes
// unchanged. ★ It takes an ACCESS EXCLUSIVE lock on `org_settings` for the test's own transaction — run this file alone.
//
// ★ What this file is NOT: the proof that a rotating org issues what it issued before. That is `checkin.test.ts`,
// `checkin-days.test.ts`, `checkin-window.test.ts` and the rest passing UNTOUCHED on the new core — plus the one case
// below that pins a rotating predecessor's `valid_until` as unmoved.
//
// `03` §8.2 rows: RPC-_issue_check_in_code.rotation_off_one_code, .off_keeps_current, .on_resumes;
// RPC-check_in.fixed_code_per_day; RPC-_issue_check_in_code.not_callable (still).
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = "checkin/01_rotation_off.sql";

interface Code {
  id: string;
  code: string;
  session_day_id: string;
  valid_from: string | Date;
  valid_until: string | Date;
  revoked_at: string | Date | null;
}
type Envelope = { status: string };

/** The core and the column, as the lead's one migration will land them. Leaves the transaction as the owner. */
async function setUp(tx: Tx): Promise<void> {
  await tx.asOwner();
  await tx.q(`alter table public.org_settings alter column check_in_rotation_seconds drop not null`);
  await applyProposed(tx, PROPOSED);
}

const setRotation = (tx: Tx, org: Org, seconds: number | null) =>
  tx.asOwner().then(() => tx.q(`update public.org_settings set check_in_rotation_seconds = $2 where org_id = $1`, [org.id, seconds]));

/** A session of n days, offsets in HOURS from now (checkin-days.test.ts's builder). */
async function makeSession(tx: Tx, org: Org, days: [number, number][]): Promise<{ id: string; days: string[] }> {
  const [first, ...rest] = days;
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, allow_walk_ins)
     values ($1, 'جلسة برمز ثابت', 'ملخص', $2, 'introductory',
             now() + ($3 || ' hours')::interval, 60, now() + ($4 || ' hours')::interval,
             $5, 40, 'in_progress', now() - interval '10 days', true)
     returning id`,
    [org.id, org.categoryId, String(first[0]), String(first[1]), org.venueId],
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

const ensure = async (tx: Tx, org: Org, session: string, day: string | null = null): Promise<Code> => {
  await tx.as(org.admin.claims);
  return (await tx.q<Code>(`select * from public.ensure_check_in_code($1, $2)`, [session, day]))[0];
};
const codesOf = async (tx: Tx, session: string): Promise<Code[]> => {
  await tx.asOwner();
  return tx.q<Code>(`select * from public.check_in_codes where session_id = $1 order by valid_from, created_at`, [session]);
};
const ceilingOf = async (tx: Tx, day: string): Promise<Date> => {
  await tx.asOwner();
  return (await tx.q<{ c: Date }>(`select public.check_in_ceiling($1) as c`, [day]))[0].c;
};
const now = async (tx: Tx): Promise<number> => t((await tx.q<{ n: Date }>(`select now() as n`))[0].n);
const t = (at: string | Date) => new Date(at).getTime();

describe("REQ-CHK-019 — rotation off: one code for the day, to its ceiling", () => {
  it("RPC-_issue_check_in_code.rotation_off_one_code — issued once with valid_until = check_in_ceiling(day); every later call returns it; a member checks in with it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await setUp(tx);
      await setRotation(tx, f.a, null);
      const s = await makeSession(tx, f.a, [[-0.5, 1]]);

      const first = await ensure(tx, f.a, s.id);
      expect(t(first.valid_until)).toBe(t(await ceilingOf(tx, s.days[0])));
      expect(t(first.valid_until)).toBe(await now(tx) + 3 * 3_600_000); // ends_at (+1 h) + 2 h, one day

      // the host view's next read, and the worker's twin, both find it current
      expect((await ensure(tx, f.a, s.id)).id).toBe(first.id);
      await tx.asServiceRole();
      const [rotated] = await tx.q<Code>(`select * from public.rotate_check_in_code($1, $2)`, [s.id, s.days[0]]);
      expect(rotated.id).toBe(first.id);

      // aged past any period: still the day's code — nothing rotates it
      await tx.asOwner();
      await tx.q(`update public.check_in_codes set valid_from = now() - interval '25 minutes' where id = $1`, [first.id]);
      expect((await ensure(tx, f.a, s.id)).id).toBe(first.id);
      expect(await codesOf(tx, s.id)).toHaveLength(1);

      await tx.as(f.a.members[0].claims);
      const [r] = await tx.q<{ r: Envelope }>(`select public.check_in($1, $2) as r`, [s.id, first.code]);
      expect(r.r.status).toBe("ok");
    });
  });

  it("past the day's ceiling the core issues nothing — it returns null and writes no row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await setUp(tx);
      await setRotation(tx, f.a, null);
      const s = await makeSession(tx, f.a, [[-5, -4]]); // ceiling was 2 h ago
      await tx.asServiceRole();
      const [row] = await tx.q<{ id: string | null }>(`select (public.rotate_check_in_code($1, $2)).id as id`, [s.id, s.days[0]]);
      expect(row.id).toBeNull();
      expect(await codesOf(tx, s.id)).toHaveLength(0);
    });
  });

  it("a revoke while off issues a FRESH whole-day code — never an older code still inside its grace", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await setUp(tx);
      await setRotation(tx, f.a, 600);
      const s = await makeSession(tx, f.a, [[-1, 1]]);

      // A rotated out 11 minutes ago and still in its grace for another minute; B is current.
      const a = await ensure(tx, f.a, s.id);
      await tx.asOwner();
      await tx.q(`update public.check_in_codes set valid_from = now() - interval '11 minutes', valid_until = now() + interval '1 minute' where id = $1`, [a.id]);
      const b = await ensure(tx, f.a, s.id);
      expect(b.id).not.toBe(a.id);

      await setRotation(tx, f.a, null);
      expect((await ensure(tx, f.a, s.id)).id).toBe(b.id); // B becomes the day's code

      await tx.as(f.a.admin.claims);
      const [c] = await tx.q<Code>(`select * from public.revoke_check_in_code($1)`, [s.id]);
      expect([a.id, b.id]).not.toContain(c.id);
      expect(t(c.valid_until)).toBe(t(await ceilingOf(tx, s.days[0])));
      expect((await ensure(tx, f.a, s.id)).id).toBe(c.id);
      // A was never extended: it still ends inside its own grace
      const [aNow] = (await codesOf(tx, s.id)).filter((x) => x.id === a.id);
      expect(t(aNow.valid_until)).toBe(await now(tx) + 60_000);
    });
  });
});

describe("REQ-CHK-019 — switching, in both directions (D1, D3)", () => {
  it("RPC-_issue_check_in_code.off_keeps_current — the current code's valid_until is raised TO the ceiling; no new code; nothing shortened", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await setUp(tx);
      await setRotation(tx, f.a, 600);
      const s = await makeSession(tx, f.a, [[-0.5, 1]]);

      const current = await ensure(tx, f.a, s.id);
      expect(t(current.valid_until)).toBe(await now(tx) + 720_000); // 600 + 120

      await setRotation(tx, f.a, null);
      const kept = await ensure(tx, f.a, s.id);
      expect(kept.id).toBe(current.id);
      expect(kept.code).toBe(current.code);
      // D3's bound: exactly the ceiling — never past it — and never below what it was
      const ceiling = t(await ceilingOf(tx, s.days[0]));
      expect(t(kept.valid_until)).toBe(ceiling);
      expect(t(kept.valid_until)).toBeGreaterThan(t(current.valid_until));
      expect(await codesOf(tx, s.id)).toHaveLength(1);
    });
  });

  it("RPC-_issue_check_in_code.on_resumes — a whole-day code younger than a period stays current; once older, a successor is minted and the whole-day code keeps exactly the grace (≥ now, ≤ the ceiling)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await setUp(tx);
      await setRotation(tx, f.a, null);
      const s = await makeSession(tx, f.a, [[-3, 1]]);
      const ceiling = t(await ceilingOf(tx, s.days[0]));

      const whole = await ensure(tx, f.a, s.id);
      expect(t(whole.valid_until)).toBe(ceiling);

      // switched on: younger than one period — it is still the current code, unchanged
      await setRotation(tx, f.a, 600);
      const still = await ensure(tx, f.a, s.id);
      expect(still.id).toBe(whole.id);
      expect(t(still.valid_until)).toBe(ceiling);

      // it has stood for two hours — the next read mints a successor and cuts the whole-day code to the grace
      await tx.asOwner();
      await tx.q(`update public.check_in_codes set valid_from = now() - interval '2 hours' where id = $1`, [whole.id]);
      const next = await ensure(tx, f.a, s.id);
      expect(next.id).not.toBe(whole.id);
      const at = await now(tx);
      expect(t(next.valid_until)).toBe(at + 720_000);

      const [clamped] = (await codesOf(tx, s.id)).filter((x) => x.id === whole.id);
      expect(t(clamped.valid_until)).toBe(at + 120_000); // the grace, like any previous code
      expect(t(clamped.valid_until)).toBeGreaterThanOrEqual(at);
      expect(t(clamped.valid_until)).toBeLessThanOrEqual(ceiling);

      // inside its grace it still checks a member in (REQ-CHK-002) — one current, one in grace
      await tx.as(f.a.members[0].claims);
      const [r] = await tx.q<{ r: Envelope }>(`select public.check_in($1, $2) as r`, [s.id, whole.code]);
      expect(r.r.status).toBe("ok");
    });
  });

  it("a rotating org's predecessor is NOT touched when its successor is minted — byte-identical to 0105", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await setUp(tx);
      await setRotation(tx, f.a, 600);
      const s = await makeSession(tx, f.a, [[-1, 1]]);

      const a = await ensure(tx, f.a, s.id);
      await tx.asOwner();
      await tx.q(`update public.check_in_codes set valid_from = valid_from - interval '11 minutes', valid_until = valid_until - interval '11 minutes' where id = $1`, [a.id]);
      const [before] = (await codesOf(tx, s.id)).filter((x) => x.id === a.id);
      const b = await ensure(tx, f.a, s.id);
      expect(b.id).not.toBe(a.id);
      expect(t(b.valid_until)).toBe(await now(tx) + 720_000);
      const [after] = (await codesOf(tx, s.id)).filter((x) => x.id === a.id);
      expect(t(after.valid_until)).toBe(t(before.valid_until));
    });
  });
});

describe("REQ-CHK-019 — multi-day: one code per day, never another day's", () => {
  it("RPC-check_in.fixed_code_per_day — day 1's whole-day code is refused on day 2 and after day 1's ceiling; day 2 has its own", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await setUp(tx);
      await setRotation(tx, f.a, null);
      // day 1 yesterday (its ceiling long past), day 2 now
      const s = await makeSession(tx, f.a, [[-26, -25], [-0.5, 1]]);
      const [day1, day2] = s.days;

      // day 1's code, as the core issued it yesterday: from the day's start to its ceiling
      await tx.asOwner();
      const [yesterday] = await tx.q<Code>(
        `insert into public.check_in_codes (org_id, session_id, session_day_id, code, valid_from, valid_until)
         select $1, $2, d.id, 'ACDEFG', d.starts_at, public.check_in_ceiling(d.id) from public.session_days d where d.id = $3
         returning *`,
        [f.a.id, s.id, day1],
      );

      const today = await ensure(tx, f.a, s.id);
      expect(today.session_day_id).toBe(day2);
      expect(today.id).not.toBe(yesterday.id);
      expect(today.code).not.toBe(yesterday.code);
      expect(t(today.valid_until)).toBe(t(await ceilingOf(tx, day2)));

      await tx.as(f.a.members[0].claims);
      const yesterdaysCode = await tx.q<{ r: Envelope }>(`select public.check_in($1, $2) as r`, [s.id, yesterday.code]);
      expect(yesterdaysCode[0].r.status).toBe("invalid_code");
      const namedDay1 = await tx.q<{ r: Envelope }>(`select public.check_in($1, $2, $3) as r`, [s.id, yesterday.code, day1]);
      expect(namedDay1[0].r.status).toBe("session_ended");
      const todaysCode = await tx.q<{ r: Envelope }>(`select public.check_in($1, $2) as r`, [s.id, today.code]);
      expect(todaysCode[0].r.status).toBe("ok");
    });
  });

  it("a whole-day code never outlives its day: valid_until is capped by the next day's start", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await setUp(tx);
      await setRotation(tx, f.a, null);
      // day 1 now, ending in an hour; day 2 starts 90 minutes from now — before day 1's ends_at + 2 h
      const s = await makeSession(tx, f.a, [[-0.5, 1], [1.5, 3]]);
      const code = await ensure(tx, f.a, s.id, s.days[0]);
      const [day2] = await tx.q<{ starts_at: Date }>(`select starts_at from public.session_days where id = $1`, [s.days[1]]);
      expect(t(code.valid_until)).toBe(t(day2.starts_at));
    });
  });
});

describe("RPC-_issue_check_in_code.not_callable — still, after the replace", () => {
  it("no client role may call the core", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await setUp(tx);
      const s = await makeSession(tx, f.a, [[-0.5, 1]]);
      await tx.as(f.a.admin.claims);
      expect(await errorCode(() => tx.q(`select * from public._issue_check_in_code($1, $2)`, [s.id, null]))).toBe(PERMISSION_DENIED);
      await tx.asServiceRole();
      expect(await errorCode(() => tx.q(`select * from public._issue_check_in_code($1, $2)`, [s.id, null]))).toBe(PERMISSION_DENIED);
    });
  });
});
