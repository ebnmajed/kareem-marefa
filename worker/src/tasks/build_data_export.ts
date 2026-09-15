import type { Task } from "graphile-worker";

// JOB-build_data_export (11 §2.7, REQ-PRF-006, REQ-NFR-013). On request, key
// `export:{member_id}:{requested_at}`.
//
// The archive is built by `public.build_data_export_payload()` and stored on
// the request row as `jsonb`, not in a bucket: `exports_storage_read` (0037)
// scopes by ORG prefix with no member conjunct, so an archive there would be
// readable by every member of the org, and a storage policy is permissive —
// an extra policy can only widen. The member's own `data_export_read_self`
// policy is already exactly the right boundary (the file header of
// supabase/proposed/platform/0004_retention_and_privacy.sql has the full
// reasoning and the two alternatives that were rejected).
//
// Idempotent: a replay rebuilds the same payload and overwrites the row. A
// failure is recorded on the row rather than thrown away, so the member's
// privacy screen can say "failed" instead of "still building" forever.
export const build_data_export: Task = async (payload, helpers) => {
  const { request_id, member_id } = payload as { request_id?: string; member_id?: string };
  if (!request_id || !member_id) {
    helpers.logger.error("build_data_export: payload is missing request_id or member_id");
    return;
  }

  await helpers.query(`update public.data_export_requests set status = 'building' where id = $1 and status = 'queued'`, [
    request_id,
  ]);

  try {
    const { rows } = await helpers.query<{ payload: unknown }>(`select public.build_data_export_payload($1) as payload`, [
      member_id,
    ]);
    await helpers.query(`select public.record_data_export($1, $2::jsonb)`, [request_id, JSON.stringify(rows[0].payload)]);
    helpers.logger.info(`build_data_export: request ${request_id} is ready`);
  } catch (error) {
    await helpers.query(`select public.fail_data_export($1, $2)`, [request_id, (error as Error).message]);
    // Rethrown so graphile-worker retries and Sentry sees it: the row now says
    // `failed`, and a retry that succeeds overwrites that.
    throw error;
  }
};
