import type { Task } from "graphile-worker";

// JOB-audit_balances (11 §2.3, REQ-PTS-011, 05 §4.1). Nightly. Re-derives
// every balance from the ledger with public.audit_balances() and logs each
// divergence as an error (Sentry's worker integration is the on-call path)
// plus an audit_log row, for a durable trail an admin can read later. It
// NEVER writes to points_balances — a rollup that silently corrects itself
// hides the bug that caused the divergence. The fix, when one is needed, is
// a deliberate `select public.rebuild_points_balances()` (05 §4.2), never
// automatic.
//
// Post-launch (docs/plan/notes/scoring.md "Company points rules"): the same
// check runs against company_points_balances via public.audit_company_balances()
// — same non-self-healing contract, same rebuild-not-repair response
// (public.rebuild_company_points_balances()), one more append-only ledger
// this invariant now covers.
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

  const { rows: companyRows } = await helpers.query<{
    org_id: string;
    company_id: string;
    expected_total: number;
    actual_total: number;
    expected_last_entry_id: string | null;
    actual_last_entry_id: string | null;
  }>(`select * from public.audit_company_balances()`);

  for (const row of companyRows) {
    helpers.logger.error(
      `audit_balances: DIVERGENCE company ${row.company_id} (org ${row.org_id}) — company_points_balances says ${row.actual_total}, the ledger sums to ${row.expected_total}`,
    );
    await helpers.query(
      `select public.write_audit($1, 'company_points.balance_divergence', 'company_points_balances', $2, $3::jsonb, $4::jsonb, null, null, null)`,
      [
        row.org_id,
        row.company_id,
        JSON.stringify({ total_points: row.actual_total, last_entry_id: row.actual_last_entry_id }),
        JSON.stringify({ total_points: row.expected_total, last_entry_id: row.expected_last_entry_id }),
      ],
    );
  }

  helpers.logger.info(
    `audit_balances: checked every balance — ${rows.length} member divergence(s), ${companyRows.length} company divergence(s)`,
  );
};
