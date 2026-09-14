import type { Task } from "graphile-worker";

// JOB-audit_balances (11 §2.3, REQ-PTS-011, 05 §4.1). Nightly. Re-derives
// every balance from the ledger with public.audit_balances() and logs each
// divergence as an error (Sentry's worker integration is the on-call path)
// plus an audit_log row, for a durable trail an admin can read later. It
// NEVER writes to points_balances — a rollup that silently corrects itself
// hides the bug that caused the divergence. The fix, when one is needed, is
// a deliberate `select public.rebuild_points_balances()` (05 §4.2), never
// automatic.
export const audit_balances: Task = async (_payload, helpers) => {
  const { rows } = await helpers.query<{
    org_id: string;
    member_id: string;
    expected_total: number;
    actual_total: number;
    expected_last_entry_id: string | null;
    actual_last_entry_id: string | null;
  }>(`select * from public.audit_balances()`);

  for (const row of rows) {
    helpers.logger.error(
      `audit_balances: DIVERGENCE member ${row.member_id} (org ${row.org_id}) — points_balances says ${row.actual_total}, the ledger sums to ${row.expected_total}`,
    );
    await helpers.query(
      `select public.write_audit($1, 'points.balance_divergence', 'points_balances', $2, $3::jsonb, $4::jsonb, null, null, null)`,
      [
        row.org_id,
        row.member_id,
        JSON.stringify({ total_points: row.actual_total, last_entry_id: row.actual_last_entry_id }),
        JSON.stringify({ total_points: row.expected_total, last_entry_id: row.expected_last_entry_id }),
      ],
    );
  }

  helpers.logger.info(`audit_balances: checked every balance — ${rows.length} divergence(s)`);
};
