// Every cross-track SQL hook the reader inventory found — DEC-141 —
// migrations 0084_check_in_window, 0087_attendance_removal and
// 0088_removed_check_in_hooks (promoted 7b2ac81).
//
// `03` §8.2 rows: RPC-award_points.skips_removed_check_in,
// RPC-issue_certificate.no_check_in_when_removed,
// RPC-fan_out_certificates.excludes_removed,
// RPC-send_rating_prompt.excludes_removed,
// RPC-evaluate_streaks.excludes_removed, RPC-evaluate_badges.excludes_removed,
// RPC-build_data_export_payload.shows_removal.

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx, type Claims, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

async function setup(tx: Tx) {
  return seed(tx);
}

/** `seed()`'s own fixture gives members[0] a baseline badge and streak_award
 *  (fixture-m4.ts) and members[1] two baseline check-ins (fixture-m2.ts) —
 *  neither is right for a scenario that needs a member with NO history at
 *  all before the test's own check-in. */
async function addMember(tx: Tx, org: Org, local: string, name: string): Promise<{ memberId: string; claims: Claims }> {
  const email = `${local}@${org.domain}`;
  const authUserId = randomUUID();
  await tx.q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)`, [authUserId, email, JSON.stringify({ full_name: name })]);
  const [row] = await tx.q<{ id: string; claims_version: number }>(
    `insert into public.members (org_id, auth_user_id, email, display_name, org_role, company_id) values ($1, $2, $3, $4, 'member', $5) returning id, claims_version`,
    [org.id, authUserId, email, name, org.companyId],
  );
  return {
    memberId: row.id,
    claims: { sub: authUserId, email, org_id: org.id, member_id: row.id, org_role: "member", status: "active", claims_version: row.claims_version, org_status: "active" },
  };
}

async function makeSession(tx: Tx, org: Org, opts: { state: string; startsInMinutes: number; endsInMinutes: number; certificateMode?: string }): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, completed_at, allow_walk_ins, certificate_mode)
     values ($1, 'جلسة خطافات', 'ملخص', $2, 'introductory',
             now() + ($3 || ' minutes')::interval, 60, now() + ($4 || ' minutes')::interval,
             $5, 40, $6::public.session_state,
             case when $6 in ('published','in_progress','completed','archived') then now() - interval '1 day' end,
             case when $6 = 'completed' then now() - interval '1 hour' end,
             true, coalesce($7, 'off')::public.certificate_mode)
     returning id`,
    [org.id, org.categoryId, String(opts.startsInMinutes), String(opts.endsInMinutes), org.venueId, opts.state, opts.certificateMode ?? null],
  );
  return row.id;
}

type CheckInEnvelope = { status: string; check_in?: { id: string } };
async function checkIn(tx: Tx, sessionId: string, code: string): Promise<CheckInEnvelope> {
  const [row] = await tx.q<{ r: CheckInEnvelope }>(`select public.check_in($1, $2) as r`, [sessionId, code]);
  return row.r;
}

async function removeCheckIn(tx: Tx, admin: { claims: unknown }, sessionId: string, memberId: string, reason: string) {
  await tx.as(admin.claims as Parameters<Tx["as"]>[0]);
  await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, memberId, reason]);
}

describe("RPC-award_points.skips_removed_check_in", () => {
  it("a late award_points('check_in', ...) call for an already-removed check-in writes nothing", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      const outcome = await checkIn(tx, sessionId, code.code);
      const ciId = outcome.check_in!.id;

      await removeCheckIn(tx, f.a.admin, sessionId, f.a.members[0].memberId, "سبب");

      await tx.asOwner();
      await tx.q(`select public.award_points('check_in', $1, 'check_in', $2, $3)`, [f.a.members[0].memberId, ciId, sessionId]);
      const rows = await tx.q(`select id from public.points_ledger where source = 'check_in' and source_id = $1`, [ciId]);
      expect(rows).toHaveLength(0);
    });
  });
});

describe("RPC-issue_certificate.no_check_in_when_removed", () => {
  it("a late issue_certificate('attendance') call for a removed check-in raises no_check_in, same as never having checked in", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50, certificateMode: "automatic" });
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      await checkIn(tx, sessionId, code.code);

      await removeCheckIn(tx, f.a.admin, sessionId, f.a.members[0].memberId, "سبب");

      await tx.asServiceRole();
      await expect(tx.q(`select * from public.issue_certificate($1, $2, 'attendance')`, [sessionId, f.a.members[0].memberId])).rejects.toThrow(/no_check_in/);
    });
  });
});

describe("RPC-fan_out_certificates.excludes_removed", () => {
  it("completing a session does not enqueue an attendance certificate for a member whose check-in was already removed", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -70, endsInMinutes: -10, certificateMode: "automatic" });
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      await checkIn(tx, sessionId, code.code);

      await removeCheckIn(tx, f.a.admin, sessionId, f.a.members[0].memberId, "سبب");

      // A direct state flip (not transition_session() — its own check-in-code
      // truncation is orthogonal to what this test proves, and every call to
      // now() inside ONE test transaction returns the same instant, which
      // trips that unrelated logic's own check constraint). This still fires
      // sessions_certificate_hook() — the trigger only cares about the edge.
      await tx.asOwner();
      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [sessionId]);

      const jobs = await tx.q(
        `select j.id from graphile_worker._private_jobs j
           join graphile_worker._private_tasks t on t.id = j.task_id
          where t.identifier = 'issue_certificates' and j.key = $1`,
        [`cert:${sessionId}:${f.a.members[0].memberId}:attendance`],
      );
      expect(jobs).toHaveLength(0);
    });
  });
});

describe("RPC-send_rating_prompt.excludes_removed", () => {
  it("a member whose check-in was removed is not prompted to rate the session", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -70, endsInMinutes: -10 });
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      await checkIn(tx, sessionId, code.code);
      await tx.asOwner();
      await tx.q(`update public.sessions set state = 'completed', completed_at = now() where id = $1`, [sessionId]);

      await removeCheckIn(tx, f.a.admin, sessionId, f.a.members[0].memberId, "سبب");

      await tx.asOwner();
      const [{ n }] = await tx.q<{ n: string }>(`select public.send_rating_prompt($1) as n`, [sessionId]);
      expect(Number(n)).toBe(0);
    });
  });
});

describe("RPC-evaluate_streaks.excludes_removed / RPC-evaluate_badges.excludes_removed", () => {
  it("a removed check-in does not count toward a NOT-YET-awarded streak period or badge threshold", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      // A FRESH member — seed()'s own fixture gives members[0] a baseline
      // badge + streak_award (fixture-m4.ts) and members[1] two baseline
      // check-ins (fixture-m2.ts), either of which would make this
      // assertion pass or fail for the wrong reason.
      const fresh = await addMember(tx, f.a, "fresh-streak", "عضو جديد");
      // `_seed_org_scoring()` (0081) already seeds both for every org:
      // `first_check_in` (check_ins_count, gte 1) and `monthly_3` (a streak
      // needing 3 check-ins in a month — lowered to 1 so this one check-in
      // is enough to test the hook, not the threshold).
      await tx.q(`update public.streak_rules set required_count = 1 where org_id = $1 and key = 'monthly_3'`, [f.a.id]);

      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(fresh.claims);
      await checkIn(tx, sessionId, code.code);

      await removeCheckIn(tx, f.a.admin, sessionId, fresh.memberId, "سبب");

      await tx.asServiceRole();
      await tx.q(`select public.evaluate_streaks()`);
      await tx.q(`select public.evaluate_badges()`);

      await tx.asOwner();
      const streaks = await tx.q(`select id from public.streak_awards where member_id = $1`, [fresh.memberId]);
      expect(streaks).toHaveLength(0);
      const badges = await tx.q(`select id from public.member_badges where member_id = $1`, [fresh.memberId]);
      expect(badges).toHaveLength(0);
    });
  });
});

describe("RPC-build_data_export_payload.shows_removal", () => {
  it("a member's own export includes the removed check-in, WITH removed_at and removal_reason — never dropped", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const sessionId = await makeSession(tx, f.a, { state: "in_progress", startsInMinutes: -10, endsInMinutes: 50 });
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);
      await tx.as(f.a.members[0].claims);
      await checkIn(tx, sessionId, code.code);

      await removeCheckIn(tx, f.a.admin, sessionId, f.a.members[0].memberId, "لم يحضر فعليًا");

      await tx.asOwner();
      const [{ payload }] = await tx.q<{ payload: { check_ins: { session: string; removed_at: string | null; removal_reason: string | null }[] } }>(
        `select public.build_data_export_payload($1) as payload`,
        [f.a.members[0].memberId],
      );
      expect(payload.check_ins).toHaveLength(1);
      expect(payload.check_ins[0].removed_at).not.toBeNull();
      expect(payload.check_ins[0].removal_reason).toBe("لم يحضر فعليًا");
    });
  });
});
