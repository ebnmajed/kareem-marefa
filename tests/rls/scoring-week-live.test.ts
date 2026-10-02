// Wave 20 — this week, live (DEC-216 §2.2, DEC-217 §3.3 – §3.4, REQ-UIX-078, REQ-LDR-007, REQ-LDR-008).
//
// supabase/proposed/scoring/w20_0001_week.sql — `org_week()` and `weekly_leaderboard()`. The week is summed from
// `points_ledger` at read time — no enum value, no snapshot, no job — over Saturday to Friday in the org's own
// time zone, following `all_time_leaderboard()`'s (0044) opt-out and active rules.
//
// 03 §8.2 rows proven here: RPC-org_week.boundary, RPC-weekly_leaderboard.{window,opt_out,active,org,net_positive},
// RPC-week.anon.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "scoring/w20_0001_week.sql";

let key = 0;
async function award(tx: Tx, orgId: string, memberId: string, amount: number, at: string | null = null) {
  key += 1;
  await tx.q(
    `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key, occurred_at)
     values ($1, $2, $3, 'manual_adjustment', 'اختبار الأسبوع', $4, coalesce($5::timestamptz, clock_timestamp()))`,
    [orgId, memberId, amount, `test:week:${key}:${Math.random()}`, at],
  );
}

async function ready(tx: Tx) {
  await applyProposed(tx, FILE);
  const f = await seed(tx);
  await tx.asOwner();
  return f;
}

type Bounds = { week_start: string; week_end: string; starts_at: Date; ends_at: Date; time_zone: string };
const bounds = (tx: Tx, at: string) => tx.q<Bounds>(`select week_start::text, week_end::text, starts_at, ends_at, time_zone from public.org_week($1::timestamptz)`, [at]);

describe("RPC-org_week.boundary", () => {
  it("★ Saturday 00:00 to Friday 23:59 in the org's zone — Riyadh, UTC+3, crossing the UTC date line", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.q(`update public.org_settings set time_zone = 'Asia/Riyadh' where org_id = $1`, [f.a.id]);
      await tx.as(f.a.members[0].claims);
      // 2026-10-02 is a Friday. 20:59 UTC is Friday 23:59 in Riyadh — the week's last minute.
      const [friday] = await bounds(tx, "2026-10-02T20:59:00Z");
      expect(friday.week_start).toBe("2026-09-26");
      expect(friday.week_end).toBe("2026-10-02");
      expect(friday.time_zone).toBe("Asia/Riyadh");
      expect(friday.starts_at.toISOString()).toBe("2026-09-25T21:00:00.000Z");
      expect(friday.ends_at.toISOString()).toBe("2026-10-02T21:00:00.000Z");
      // 21:00 UTC Friday is Saturday 00:00 in Riyadh — already the next week, though UTC still says Friday.
      const [saturday] = await bounds(tx, "2026-10-02T21:00:00Z");
      expect(saturday.week_start).toBe("2026-10-03");
      expect(saturday.week_end).toBe("2026-10-09");
    });
  });

  it("follows the org's own zone, not the server's", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.q(`update public.org_settings set time_zone = 'America/New_York' where org_id = $1`, [f.a.id]);
      await tx.as(f.a.members[0].claims);
      // Saturday 2026-10-03 02:00 UTC is still Friday 22:00 in New York.
      const [r] = await bounds(tx, "2026-10-03T02:00:00Z");
      expect(r.week_start).toBe("2026-09-26");
      expect(r.time_zone).toBe("America/New_York");
    });
  });
});

describe("RPC-weekly_leaderboard", () => {
  it("★ window: only this week's rows count — a row a second before Saturday 00:00 is last week's", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [{ starts_at }] = await tx.q<{ starts_at: Date }>(`select starts_at from public.org_week() limit 1`);
      const [m0, m1] = f.a.members;
      await award(tx, f.a.id, m0.memberId, 40);
      await award(tx, f.a.id, m0.memberId, 500, new Date(starts_at.getTime() - 1000).toISOString());
      await award(tx, f.a.id, m1.memberId, 30, starts_at.toISOString());
      await tx.as(m0.claims);
      const rows = await tx.q<{ member_id: string; rank: string; points: number }>(`select member_id, rank::text, points from public.weekly_leaderboard()`);
      expect(rows).toEqual([
        { member_id: m0.memberId, rank: "1", points: 40 },
        { member_id: m1.memberId, rank: "2", points: 30 },
      ]);
    });
  });

  it("★ opt_out: absent from another member's call, present in their own — ranked over what each may see", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [m0, m1] = f.a.members;
      await award(tx, f.a.id, f.a.mod.memberId, 90);
      await award(tx, f.a.id, m0.memberId, 50);
      await award(tx, f.a.id, m1.memberId, 20);
      await tx.q(`update public.members set leaderboard_opt_out = true where id = $1`, [f.a.mod.memberId]);

      await tx.as(m1.claims);
      const others = await tx.q<{ member_id: string; rank: string }>(`select member_id, rank::text from public.weekly_leaderboard()`);
      expect(others.map((r) => r.member_id)).not.toContain(f.a.mod.memberId);
      expect(others).toEqual([
        { member_id: m0.memberId, rank: "1" },
        { member_id: m1.memberId, rank: "2" },
      ]);

      await tx.as(f.a.mod.claims);
      const own = await tx.q<{ member_id: string; rank: string }>(`select member_id, rank::text from public.weekly_leaderboard()`);
      expect(own[0]).toEqual({ member_id: f.a.mod.memberId, rank: "1" });
    });
  });

  it("active: a deactivated member never appears", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [m0, m1] = f.a.members;
      await award(tx, f.a.id, m0.memberId, 50);
      await award(tx, f.a.id, m1.memberId, 20);
      await tx.q(`update public.members set status = 'deactivated', deactivated_at = now(), deactivated_reason = 'اختبار' where id = $1`, [m0.memberId]);
      await tx.as(m1.claims);
      const rows = await tx.q<{ member_id: string }>(`select member_id from public.weekly_leaderboard()`);
      expect(rows.map((r) => r.member_id)).toEqual([m1.memberId]);
    });
  });

  it("org: another org's ledger never appears (REQ-LDR-007)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await award(tx, f.b.id, f.b.members[0].memberId, 80);
      await award(tx, f.a.id, f.a.members[0].memberId, 10);
      await tx.as(f.a.members[0].claims);
      const rows = await tx.q<{ member_id: string }>(`select member_id from public.weekly_leaderboard()`);
      expect(rows.map((r) => r.member_id)).toEqual([f.a.members[0].memberId]);
    });
  });

  it("net_positive: a week netting 0 or less is not ranked — a reversal counts in the week it was written", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [m0, m1] = f.a.members;
      await award(tx, f.a.id, m0.memberId, 50);
      await award(tx, f.a.id, m0.memberId, -50);
      await award(tx, f.a.id, m1.memberId, 5);
      await tx.as(m0.claims);
      const rows = await tx.q<{ member_id: string }>(`select member_id from public.weekly_leaderboard()`);
      expect(rows.map((r) => r.member_id)).toEqual([m1.memberId]);
    });
  });

  it("ties share a rank", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [m0, m1] = f.a.members;
      await award(tx, f.a.id, m0.memberId, 30);
      await award(tx, f.a.id, m1.memberId, 30);
      await award(tx, f.a.id, f.a.admin.memberId, 10);
      await tx.as(m0.claims);
      const rows = await tx.q<{ rank: string }>(`select rank::text from public.weekly_leaderboard()`);
      expect(rows.map((r) => r.rank)).toEqual(["1", "1", "3"]);
    });
  });
});

describe("RPC-week.anon", () => {
  it("anon cannot execute either function", async () => {
    await withTx(async (tx) => {
      await ready(tx);
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select * from public.org_week()`))).toBe("42501");
      expect(await errorCode(() => tx.q(`select * from public.weekly_leaderboard()`))).toBe("42501");
    });
  });
});
