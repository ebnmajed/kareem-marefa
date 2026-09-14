import type { Task } from "graphile-worker";

// JOB-snapshot_leaderboards (11 §2.3, REQ-LDR-002, REQ-LDR-006, A11,
// DEC-016). Cron at period end, plus a nightly provisional — this task IS
// the nightly provisional run; the finalisation half doubles as "period
// end" by checking, each night, whether the previous month has been
// finalised yet.
//
// Scope decision, flagged rather than silently narrowed: `seasonal`
// leaderboards are NOT snapshotted here. Nothing in 02's frozen domain
// model or org_settings defines a season's boundaries — there is no
// `seasons` table or setting to read one from — so this job snapshots
// `monthly`, `topic` (all-time per category) and `company` (monthly) only.
// Seasonal is left to whoever defines what a season is; the schema
// (leaderboard_kind's 'seasonal' value) is already there to receive it.
//
// All the period arithmetic that matters — the calendar-month boundary —
// happens in SQL against public.snapshot_leaderboard(), never here, so it
// is provable in the RLS suite exactly like the other evaluators.
export const snapshot_leaderboards: Task = async (_payload, helpers) => {
  const { rows: orgs } = await helpers.query<{ id: string }>(`select id from public.orgs where status = 'active'`);

  for (const { id: orgId } of orgs) {
    // Current month, provisional.
    await helpers.query(
      `select public.snapshot_leaderboard($1, 'monthly', date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month')::date, null, false)`,
      [orgId],
    );
    await helpers.query(
      `select public.snapshot_leaderboard($1, 'company', date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month')::date, null, false)`,
      [orgId],
    );

    // The previous month, finalised once — only if it is not final yet
    // (a final snapshot's own immutability trigger would refuse the
    // replace-in-place delete snapshot_leaderboard() does for a provisional
    // one, so this check is what keeps a nightly re-run from erroring
    // instead of skipping quietly).
    const prevStart = `date_trunc('month', now() - interval '1 month')::date`;
    const prevEnd = `date_trunc('month', now())::date`;
    const { rows: existingMonthly } = await helpers.query<{ is_final: boolean }>(
      `select is_final from public.leaderboard_snapshots
        where org_id = $1 and kind = 'monthly' and period_start = ${prevStart} and period_end = ${prevEnd}`,
      [orgId],
    );
    if (!existingMonthly.some((r) => r.is_final)) {
      await helpers.query(
        `select public.snapshot_leaderboard($1, 'monthly', ${prevStart}, ${prevEnd}, null, true)`,
        [orgId],
      );
      await helpers.query(
        `select public.snapshot_leaderboard($1, 'company', ${prevStart}, ${prevEnd}, null, true)`,
        [orgId],
      );
    }

    // Topic boards: all-time per category, re-snapshotted (never finalised
    // — there is no natural "period end" for an all-time board).
    const { rows: categories } = await helpers.query<{ id: string }>(`select id from public.categories where org_id = $1`, [orgId]);
    for (const { id: categoryId } of categories) {
      await helpers.query(`select public.snapshot_leaderboard($1, 'topic', null, null, $2, false)`, [orgId, categoryId]);
    }
  }

  helpers.logger.info(`snapshot_leaderboards: ran for ${orgs.length} org(s)`);
};
