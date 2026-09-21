-- platform (wave 11, M13) — `job_exhausted`: a job that has used its last
-- attempt raises an alert. Follows `0075`, `0076`, `0142`.
--
-- Serves:  REQ-NFR-016, REQ-ADM-003 (SCR-084's job health, aggregate only)
-- Cites:   11 §3.2, 11 §3.3 («a dead-lettered job keeps its payload so it can
--          be replayed after a fix»), DEC-014, DEC-160 §3, DEC-166
--
-- ── The gap ───────────────────────────────────────────────────────────────
-- `queue_stalled` (0075) filters `attempts < max_attempts` on purpose: a dead
-- job is not a backlog. Nothing read the other side, so a job that failed
-- permanently raised nothing. For `record_survey_response` that is a member's
-- answers lost with no trace while the register says «أجبت» for ever.
--
-- ── The source is graphile's own rows, not a failure hook ─────────────────
-- graphile-worker never deletes an exhausted job; it stays in `_private_jobs`
-- with its payload, which is the recovery path `11` §3.3 asks for. So the
-- condition already exists as rows, like `ledger_divergence` reading
-- `audit_log`. A hook in the worker would be a second record of the same fact
-- and would miss a job that exhausts between two deploys.
--
-- ── The predicate ─────────────────────────────────────────────────────────
-- `attempts >= max_attempts and locked_at is null`. graphile increments
-- `attempts` when it LOCKS a job, so a job running its last attempt reads
-- `attempts = max_attempts` and has not failed yet. Every task counts: none is
-- designed to give up by throwing (a task that decides not to act returns
-- success), and an allowlist of ignorable tasks is where a real loss hides.
--
-- ── No time window ────────────────────────────────────────────────────────
-- It fires while ANY such job exists and clears only when each is resolved —
-- rescheduled after a fix (`graphile_worker.reschedule_jobs(ids, attempts =>
-- 0)`) or discarded (`graphile_worker.complete_jobs(ids)`). A 24 h window would
-- turn a lost response into silence after a day while the payload that could
-- recover it sits in the table.
--
-- ── The task name and a count, never a payload (DEC-014) ──────────────────
-- A task identifier is code, not org data. This function never reads
-- `payload`, `key` (a job key can embed a session or member id), `last_error`
-- (a thrown message can interpolate one) or `queue_name`. It reads the
-- identifier and counts. (`updated_at` is not read either: graphile 0.18 no
-- longer maintains it, so an «age since exhaustion» would be a wrong number.)
--
-- ── Why a separate function and not a ninth arm of `evaluate_alerts()` ────
-- Ruled at wave 11's sync 1: `evaluate_alerts()` pins «eight» in files that
-- exist on `main`, and its drill's `quiesce()` does not remove a dead job (its
-- `run_at` is in the future), so a ninth arm would move those assertions. The
-- row shape is the eight's, so the worker hands it to the same sink.
--
-- ── 03 §8.2 rows this file needs ──────────────────────────────────────────
--   | `RPC-evaluate_job_exhaustion.worker_only` | `service_role` only — an org
--     member, a moderator, an org admin, a platform admin and `anon` are all
--     refused on the grant. |
--   | `RPC-evaluate_job_exhaustion.fires` | One row, `job_exhausted`; fired
--     while any job has no attempts left and is not running; `detail` is
--     `exhausted_jobs`, `tasks` and `by_task` (identifier → count). |
--   | `RPC-evaluate_job_exhaustion.running_last_attempt` | A job locked on its
--     last attempt is not counted; a job with attempts left never is. |
--   | `RPC-evaluate_job_exhaustion.clears` | Rescheduling or completing every
--     dead job clears it; resolving one of two tasks leaves it firing. |
--   | `RPC-evaluate_job_exhaustion.no_payload` | Nothing from a job's payload,
--     key or last error appears anywhere in the row. |
--   | `RPC-evaluate_job_exhaustion.not_installed` | Without the
--     `graphile_worker` schema it reports `not_installed` rather than raising. |
--   | `RPC-platform_job_health.failed_agrees` | `failed` counts exactly the
--     jobs the alert counts — a job running its last attempt is not failed. |
--   | `RPC-platform_job_health.no_org_reader` | An org member, moderator and
--     admin are refused `not_platform_admin`, `anon` on the grant, and none of
--     them can select `graphile_worker._private_jobs`. |

create function public.evaluate_job_exhaustion()
returns table (alert text, fired boolean, detail jsonb)
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_by_task jsonb;
  v_jobs    bigint;
  v_tasks   bigint;
begin
  if to_regnamespace('graphile_worker') is null then
    return query select 'job_exhausted'::text, false, jsonb_build_object('status', 'not_installed');
    return;
  end if;

  execute $q$
    select coalesce(jsonb_object_agg(d.identifier, d.n), '{}'::jsonb),
           coalesce(sum(d.n), 0)::bigint,
           count(*)::bigint
      from (
        select t.identifier::text as identifier, count(*)::bigint as n
          from graphile_worker._private_jobs j
          join graphile_worker._private_tasks t on t.id = j.task_id
         where j.attempts >= j.max_attempts
           and j.locked_at is null
         group by t.identifier
      ) d
  $q$ into v_by_task, v_jobs, v_tasks;

  return query select 'job_exhausted'::text,
                      v_jobs > 0,
                      jsonb_build_object('exhausted_jobs', v_jobs, 'tasks', v_tasks, 'by_task', v_by_task);
end $fn$;
revoke execute on function public.evaluate_job_exhaustion() from public, anon, authenticated;
grant  execute on function public.evaluate_job_exhaustion() to service_role;

comment on function public.evaluate_job_exhaustion() is
  '11 §3.2 — job_exhausted: jobs with no attempts left, by task name and count; never a payload.';

-- `0076`'s function, one predicate added to `failed` so the screen's dead count
-- and the alert agree — 0076's own argument: an operator who sees a healthy
-- table and gets paged anyway stops trusting both. Same signature, same
-- columns: `main`'s app reads it unchanged.
create or replace function public.platform_job_health()
returns table (task_identifier text, pending bigint, failed bigint, oldest_pending_seconds numeric)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform public.assert_platform_admin();
  if to_regnamespace('graphile_worker') is null then
    return;                                        -- not installed: no rows, not an error
  end if;
  return query execute $q$
    select t.identifier::text,
           count(*) filter (where j.attempts < j.max_attempts and j.run_at <= now())::bigint,
           count(*) filter (where j.attempts >= j.max_attempts and j.locked_at is null)::bigint,
           coalesce(max(extract(epoch from (now() - j.run_at)))
                      filter (where j.attempts < j.max_attempts and j.run_at <= now()), 0)::numeric
      from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
     group by t.identifier
  $q$;
end $fn$;
