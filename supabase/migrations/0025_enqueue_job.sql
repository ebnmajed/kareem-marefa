-- lead (wave 2) — the one door from SQL to the queue
--
-- Serves:  REQ-NFR-001 · 02 §4.17 (jobs are enqueued inside the originating transaction)
--          11 §1.1 (job keys are the idempotency mechanism) · REQ-NTF-004 (reminders MOVE)
-- Cites:   DEC-046 (the `graphile_worker` schema is installed wherever the RLS suite runs)
--          0014 / 0015 (the `TODO(notify, M3)` and `TODO(scoring, M4)` call sites this serves)
--          11 §1.2 (the worker's connection trap — unrelated to enqueueing, which is plain SQL)
--
-- 03 §8.2 rows (added with this migration):
--   | `RPC-enqueue_job.definer_only` | No client role can call it — `anon`, `authenticated` and
--     a stale admin are refused on the grant; a `security definer` RPC and the worker's role can. |
--   | `RPC-enqueue_job.replace` | Enqueuing twice with one key leaves ONE pending job, moved to the
--     later `run_at` — a rescheduled reminder moves rather than duplicating (`REQ-NTF-004`). |
--   | `RPC-enqueue_job.loud` | Without the `graphile_worker` schema the call raises `3F000` naming
--     the fix; a job is never silently dropped. |
--
-- ── Why a wrapper ───────────────────────────────────────────────────────────
-- graphile-worker owns its schema (02 §4.17, A35): the library creates and
-- migrates `graphile_worker`, nothing under supabase/migrations/ models it,
-- and `supabase db reset` leaves the database without it until
-- `graphile-worker --schema-only` runs (scripts/rls.mjs locally, the `rls`
-- job in CI). Every RPC that enqueues therefore calls THIS function and never
-- `graphile_worker.add_job` directly: one place resolves the library's
-- signature (which has changed across its releases — the 0.18 one is nine
-- parameters), one place fixes `job_key_mode => 'replace'` so a re-enqueue
-- moves the job, and one place fails loudly if the schema is missing instead
-- of every RPC failing with an unqualified "schema does not exist".
--
-- SECURITY DEFINER because `graphile_worker` is not granted to any client
-- role and must not be: a member who could enqueue arbitrary tasks could
-- run `award_points` against themselves. The callers are definer RPCs, which
-- already re-read the member row (03 §1.3) before deciding to enqueue.
create function public.enqueue_job(
  p_task         text,
  p_payload      jsonb       default '{}'::jsonb,
  p_key          text        default null,
  p_run_at       timestamptz default null,
  p_queue        text        default null,
  p_max_attempts int         default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if to_regnamespace('graphile_worker') is null then
    raise exception 'graphile_worker schema is not installed — run `npx graphile-worker --schema-only -c <DATABASE_URL>` (DEC-046)'
      using errcode = '3F000';
  end if;
  -- 11 §2: job names are snake_case verbs. A typo here is a job graphile-worker
  -- permanently fails because no task has that name; refuse it at the door.
  if p_task is null or p_task !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception 'invalid_task_identifier: %', p_task using errcode = '22023';
  end if;

  select (graphile_worker.add_job(
            identifier   => p_task,
            payload      => p_payload::json,
            queue_name   => p_queue,
            run_at       => p_run_at,
            max_attempts => p_max_attempts,
            job_key      => p_key,
            job_key_mode => 'replace'
          )).id
    into v_id;
  return v_id;
end $$;

revoke execute on function public.enqueue_job(text, jsonb, text, timestamptz, text, int) from public, anon, authenticated;
grant  execute on function public.enqueue_job(text, jsonb, text, timestamptz, text, int) to service_role;
