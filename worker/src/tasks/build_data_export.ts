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
//
// ★ TERMINAL WHEN THE SUBJECT IS GONE (DEC-059, the item DEC-057 left open).
// A request whose row was deleted, or whose member was deleted or
// anonymised, can never succeed: rethrowing would make graphile-worker
// retry it twenty-five times over two days, each attempt an identical
// `member_not_found`. So the two errors the SQL raises for a missing subject
// (`42501` from build_data_export_payload() and record_data_export()) are
// recorded once and RETURNED, render_variant's shape for a deleted
// artifact; everything else — a transient database error, a bug — is still
// recorded and rethrown so the retry and Sentry see it.
export const build_data_export: Task = async (payload, helpers) => {
  const { request_id, member_id } = payload as { request_id?: string; member_id?: string };
  if (!request_id || !member_id) {
    helpers.logger.error("build_data_export: payload is missing request_id or member_id");
    return;
  }

  const { rows: requests } = await helpers.query<{ status: string; member_id: string }>(
    `select status, member_id from public.data_export_requests where id = $1`,
    [request_id],
  );
  const request = requests[0];
  if (!request) {
    helpers.logger.warn(`build_data_export: request ${request_id} no longer exists — skipping`);
    return;
  }
  if (request.member_id !== member_id) {
    // The row is the authority on whose export this is; a payload that
    // names another member is not something to build.
    helpers.logger.error(`build_data_export: request ${request_id} belongs to ${request.member_id}, payload said ${member_id} — skipping`);
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
    const message = (error as Error).message;
    await helpers.query(`select public.fail_data_export($1, $2)`, [request_id, message]);
    if (isSubjectGone(error)) {
      helpers.logger.warn(`build_data_export: request ${request_id} — ${message}; the row says failed and the job will not retry`);
      return;
    }
    // Rethrown so graphile-worker retries and Sentry sees it: the row now says
    // `failed`, and a retry that succeeds overwrites that.
    throw error;
  }
};

/** `member_not_found` / `request_not_found` — both raised with errcode 42501
 *  by 0073's functions. Matched on the message, not the code alone, because
 *  42501 is also what an unrelated grant failure would carry. */
export function isSubjectGone(error: unknown): boolean {
  const message = (error as Error | undefined)?.message ?? "";
  return /\b(member|request)_not_found\b/.test(message);
}
