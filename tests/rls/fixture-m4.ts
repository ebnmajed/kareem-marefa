// M4 rows on both orgs (migration 0027), so the isolation sweep is never
// vacuous for a scoring table. The catalogues (scoring_rules, badges, levels,
// streak_rules, perks) are seeded by the trigger on `orgs` the moment the
// base fixture inserts an org; this adds what only a member can have. Built as
// the owner inside the caller's transaction, after the M2 and M3 rows.
//
// Per org, for members[0]: one ledger row (a check-in on the completed
// session — the rollup trigger fills points_balances), one badge, one streak
// award, one perk grant; and one final all-time leaderboard snapshot with an
// entry for members[0] and one for the org's company. Inserted directly as
// the owner because a fixture arranges history; award_points() and the jobs
// are proven by the scoring track's own tests.

import type { Tx } from "./db";
import type { M3Fixture } from "./fixture-m3";
import type { M2Org } from "./fixture-m2";
import type { Org } from "./fixture";

export interface M4Org {
  ledgerId: string;
  badgeId: string;
  memberBadgeId: string;
  streakRuleId: string;
  streakAwardId: string;
  perkId: string;
  memberPerkId: string;
  snapshotId: string;
  entryId: string;
}

export interface M4Fixture extends M3Fixture {
  m4: { a: M4Org; b: M4Org };
}

async function orgRows(tx: Tx, o: Org, m2: M2Org): Promise<M4Org> {
  const member = o.members[0];
  const q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => tx.q<T>(sql, params);
  const one = async (sql: string, params: unknown[]) => (await q<{ id: string }>(sql, params))[0].id;

  const ledgerId = await one(
    `insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key, occurred_at)
     values ($1, $2, 10, 'check_in', $3, $3, 'حضور الجلسة', 'check_in', 1, $4, now() - interval '30 days') returning id`,
    [o.id, member.memberId, m2.completed, `check_in:check_in:${m2.completed}:${member.memberId}:v1`],
  );

  // DEC-067 (0081): one company ledger row per org, as the owner (client
  // roles are revoked on purpose; the rollup trigger writes the balance), so
  // the generated isolation sweep sees org A's rows and is not vacuous.
  await q(
    `insert into public.company_points_ledger (org_id, company_id, amount, source, session_id, reason, rule_key, rule_version, idempotency_key, occurred_at)
     values ($1, $2, 100, 'company_hosting', $3, 'استضافة جلسة', 'company_hosting', 1, $4, now() - interval '30 days')`,
    [o.id, o.companyId, m2.completed, `company_hosting:${m2.completed}:${o.companyId}:v1`],
  );

  const badgeId = (await q<{ id: string }>(`select id from public.badges where org_id = $1 order by key limit 1`, [o.id]))[0].id;
  const memberBadgeId = await one(
    `insert into public.member_badges (org_id, member_id, badge_id) values ($1, $2, $3) returning id`,
    [o.id, member.memberId, badgeId],
  );

  const streakRuleId = (await q<{ id: string }>(`select id from public.streak_rules where org_id = $1 order by key limit 1`, [o.id]))[0].id;
  const streakAwardId = await one(
    `insert into public.streak_awards (org_id, member_id, rule_id, period_start) values ($1, $2, $3, date_trunc('month', now())::date) returning id`,
    [o.id, member.memberId, streakRuleId],
  );

  const perkId = (await q<{ id: string }>(`select id from public.perks where org_id = $1 and key = 'priority_rsvp'`, [o.id]))[0].id;
  const memberPerkId = await one(
    `insert into public.member_perks (org_id, member_id, perk_id) values ($1, $2, $3) returning id`,
    [o.id, member.memberId, perkId],
  );

  const snapshotId = await one(
    `insert into public.leaderboard_snapshots (org_id, kind, active_member_count, is_final)
     values ($1, 'all_time', 3, true) returning id`,
    [o.id],
  );
  const entryId = await one(
    `insert into public.leaderboard_entries (org_id, snapshot_id, member_id, rank, points) values ($1, $2, $3, 1, 10) returning id`,
    [o.id, snapshotId, member.memberId],
  );
  await q(
    `insert into public.leaderboard_entries (org_id, snapshot_id, company_id, rank, points, points_per_active_member) values ($1, $2, $3, 1, 10, 3.33)`,
    [o.id, snapshotId, o.companyId],
  );

  return { ledgerId, badgeId, memberBadgeId, streakRuleId, streakAwardId, perkId, memberPerkId, snapshotId, entryId };
}

/** Adds the M4 rows to an M3 fixture. Call as the owner; returns to the owner. */
export async function seedM4(tx: Tx, f: M3Fixture): Promise<M4Fixture> {
  await tx.asOwner();
  const a = await orgRows(tx, f.a, f.m2.a);
  const b = await orgRows(tx, f.b, f.m2.b);
  return { ...f, m4: { a, b } };
}
