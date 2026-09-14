// supabase/proposed/scoring/0007_recognition_evaluators.sql —
// evaluate_streaks(), evaluate_badges(), evaluate_levels_perks()
// (STORY-REC-001…004, 11 §2.3).
//
// 03 §8.2 rows proven here: RPC-evaluate_streaks.idempotent,
// RPC-evaluate_badges.idempotent, RPC-evaluate_levels_perks.no_demotion,
// RPC-evaluate_levels_perks.perk_materialisation,
// RPC-*.service_role_only.
//
// Uses f.a.members[1]/mod/admin throughout, never members[0]: fixture-m4.ts
// seeds a badge, a streak award and a perk grant directly for every org's
// members[0], which would make an idempotency assertion here ambiguous
// about which award produced a given row.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  // Promoted at wave-2 sync 6 (0041–0043): applied by `supabase db reset`.
  return f;
}

/** A session whose own starts_at/ends_at are distinct per call — REQUIRED,
 * not cosmetic: check_ins_window() (0010) derives session_window from the
 * SESSION's own times on every insert, overriding whatever the insert
 * itself names, so two check-ins for one member need two sessions with
 * non-overlapping times, not just two different session_window literals. */
async function sessionAtOffset(tx: Tx, f: { id: string; categoryId: string; venueId: string }, hoursAgoOffset: number): Promise<string> {
  // A full hour of slack between successive windows (2*offset, not
  // offset*1) — two adjacent windows computed from two separate Date.now()
  // calls a few milliseconds apart are NOT exactly adjacent, and the
  // resulting sliver of drift is enough to trip
  // check_ins_member_id_session_window_excl.
  const startsAt = new Date(Date.now() - (2 * hoursAgoOffset + 1) * 3_600_000).toISOString();
  const endsAt = new Date(Date.now() - 2 * hoursAgoOffset * 3_600_000).toISOString();
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at, venue_id, capacity, state, published_at)
     values ($1, 'جلسة اختبار', 'ملخص', $2, 'introductory', $3::timestamptz, 60, $4::timestamptz, $5, 40, 'in_progress', now() - interval '1 day')
     returning id`,
    [f.id, f.categoryId, startsAt, endsAt, f.venueId],
  );
  return row.id;
}
async function checkInAt(tx: Tx, sessionId: string, member: string, orgId: string, admin: string) {
  await tx.q(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by)
     values ($1, $2, $3, 'manual', 'اختبار', $4)`,
    [orgId, sessionId, member, admin],
  );
}

describe("RPC-*.service_role_only", () => {
  it("no client role may call any of the three evaluators", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.as(f.a.admin.claims);
      for (const fn of ["evaluate_streaks", "evaluate_badges", "evaluate_levels_perks"]) {
        expect(await errorCode(() => tx.q(`select public.${fn}()`))).toBe(PERMISSION_DENIED);
      }
      await tx.asServiceRole();
      for (const fn of ["evaluate_streaks", "evaluate_badges", "evaluate_levels_perks"]) {
        await tx.q(`select public.${fn}()`); // does not throw
      }
    });
  });
});

describe("RPC-evaluate_streaks.idempotent", () => {
  it("three check-ins this month awards the streak once; two does not; re-running never doubles it", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const streaker = f.a.members[1].memberId;
      const short = f.a.mod.memberId;
      let offset = 0;
      // Each check-in needs its OWN session with a non-overlapping time —
      // check_ins_window() (0010) derives session_window from the session's
      // own starts_at/ends_at on every insert, overriding anything named in
      // the insert itself, so distinct check-ins for one member need
      // distinct session times, not just distinct session rows.
      const nextSession = async () => {
        offset += 1;
        return sessionAtOffset(tx, f.a, offset);
      };

      for (let i = 0; i < 3; i++) {
        const s = await nextSession();
        await checkInAt(tx, s, streaker, f.a.id, f.a.admin.memberId);
      }
      const s = await nextSession();
      await checkInAt(tx, s, short, f.a.id, f.a.admin.memberId);

      await tx.asServiceRole();
      await tx.q(`select public.evaluate_streaks()`);
      await tx.q(`select public.evaluate_streaks()`); // re-run: must not double-award

      await tx.asOwner();
      const streakerAwards = await tx.q(`select id from public.streak_awards where member_id = $1`, [streaker]);
      expect(streakerAwards).toHaveLength(1);
      const shortAwards = await tx.q(`select id from public.streak_awards where member_id = $1`, [short]);
      expect(shortAwards).toEqual([]);

      const [balance] = await tx.q<{ total_points: number }>(`select total_points from public.points_balances where member_id = $1`, [streaker]);
      expect(balance.total_points).toBe(15); // streak_month's A10 default
    });
  });
});

describe("RPC-evaluate_badges.idempotent", () => {
  it("ten check-ins earns 'regular'; the 'annual' (manual) badge is never auto-awarded; a re-run does not duplicate", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      for (let i = 0; i < 10; i++) {
        const s = await sessionAtOffset(tx, f.a, i + 1);
        await checkInAt(tx, s, member, f.a.id, f.a.admin.memberId);
      }

      await tx.asServiceRole();
      await tx.q(`select public.evaluate_badges()`);
      await tx.q(`select public.evaluate_badges()`); // re-run: must not duplicate

      await tx.asOwner();
      const badges = await tx.q<{ key: string }>(
        `select b.key from public.member_badges mb join public.badges b on b.id = mb.badge_id where mb.member_id = $1`,
        [member],
      );
      const keys = badges.map((b) => b.key);
      expect(keys.filter((k) => k === "regular")).toHaveLength(1); // 10 check-ins, exactly once
      expect(keys.filter((k) => k === "first_check_in")).toHaveLength(1); // ≥1 check-in also qualifies
      expect(keys).not.toContain("annual"); // manual-only, never auto-awarded
    });
  });
});

describe("RPC-evaluate_levels_perks", () => {
  it("no_demotion — a level, once reached, is never lowered by re-evaluation (REQ-REC-003)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const member = f.a.members[1].memberId;
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key)
         values ($1, $2, 300, 'manual_adjustment', 'اختبار', 'test:level:1')`,
        [f.a.id, member],
      );
      await tx.asServiceRole();
      await tx.q(`select public.evaluate_levels_perks()`);
      await tx.asOwner();
      let [row] = await tx.q<{ name: string; sort_order: number }>(
        `select l.name, l.sort_order from public.points_balances pb join public.levels l on l.id = pb.current_level_id where pb.member_id = $1`,
        [member],
      );
      expect(row.sort_order).toBe(3); // صاحب أثر (300)

      // Balance somehow drops back below the threshold (never happens via the
      // ledger in practice — this simulates the scenario the rule guards).
      await tx.q(`update public.points_balances set total_points = 0 where member_id = $1`, [member]);
      await tx.asServiceRole();
      await tx.q(`select public.evaluate_levels_perks()`);
      await tx.asOwner();
      ([row] = await tx.q<{ name: string; sort_order: number }>(
        `select l.name, l.sort_order from public.points_balances pb join public.levels l on l.id = pb.current_level_id where pb.member_id = $1`,
        [member],
      ));
      expect(row.sort_order).toBe(3); // unchanged — never demoted
    });
  });

  it("perk_materialisation — priority_rsvp grants at level 3; can_host stays ungranted at level 4 (disabled by default, REQ-REC-008)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      // priority_rsvp ships disabled (0027, sync 7); this case is about the grant, so turn it on.
      await tx.asOwner();
      await tx.q(`update public.perks set enabled = true where key = 'priority_rsvp'`);
      const member = f.a.members[1].memberId;
      await tx.q(
        `insert into public.points_ledger (org_id, member_id, amount, source, reason, idempotency_key)
         values ($1, $2, 700, 'manual_adjustment', 'اختبار', 'test:level:2')`,
        [f.a.id, member],
      );
      await tx.asServiceRole();
      await tx.q(`select public.evaluate_levels_perks()`);
      await tx.q(`select public.evaluate_levels_perks()`); // re-run: must not duplicate the grant

      await tx.asOwner();
      const grants = await tx.q<{ key: string }>(
        `select p.key from public.member_perks mp join public.perks p on p.id = mp.perk_id where mp.member_id = $1`,
        [member],
      );
      const keys = grants.map((g) => g.key);
      expect(keys.filter((k) => k === "priority_rsvp")).toHaveLength(1);
      expect(keys).not.toContain("can_host"); // disabled by default — no grant regardless of level
    });
  });
});
