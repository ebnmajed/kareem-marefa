-- platform (wave 4, M8) — `platform_job_health()` counts DUE jobs, not
-- scheduled ones. A `create or replace` of `0069`'s function.
--
-- Serves:  REQ-ADM-003 (SCR-084), REQ-NFR-016, 11 §3.1
-- Cites:   11 §1.2 (the LISTEN/NOTIFY degradation the oldest-pending number
--          exists to catch), 11 §2.7 (`expire_impersonation` is scheduled at
--          the session's `expires_at`, which is up to four hours ahead)
--
-- ── The bug, and how it showed ────────────────────────────────────────────
-- `0069`'s version measured `now() - run_at` over every unfinished job,
-- including jobs deliberately scheduled in the FUTURE. `expire_impersonation`
-- is enqueued with `run_at = expires_at`, so a healthy platform with one live
-- break-glass session displayed **«أقدم منتظرة: -1,679»** on SCR-084.
--
-- It was the 390 px capture that showed it, not a test: every RLS case asserted
-- the function answers and is worker-gated, and none asserted the sign of a
-- number. A negative age in an operations table is worse than a wrong one —
-- it is the number an operator stops reading.
--
-- ── The semantics, stated ─────────────────────────────────────────────────
-- **Pending means DUE**: `run_at <= now()`, not locked, attempts left. A job
-- scheduled for tomorrow is not a backlog and must not look like one. Both the
-- count and the age now agree on that definition, so a row reading `4 pending,
-- 0 oldest` is impossible rather than merely confusing.
--
-- `failed` keeps its meaning: attempts exhausted, whenever it was due.
--
-- `evaluate_alerts()` (0075) already filtered `run_at <= now()` for
-- `queue_stalled`; this brings the SCREEN into line with the ALERT, which is
-- the more important of the two agreements — an operator who sees a healthy
-- table and gets paged anyway stops trusting both.
--
-- ── 03 §8.2 rows this file needs ──────────────────────────────────────────
--   | `RPC-platform_job_health.due` | A job scheduled in the future counts as
--     neither pending nor old; a job overdue by an hour counts as both, and the
--     age is never negative. |

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
           count(*) filter (where j.attempts >= j.max_attempts)::bigint,
           coalesce(max(extract(epoch from (now() - j.run_at)))
                      filter (where j.attempts < j.max_attempts and j.run_at <= now()), 0)::numeric
      from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
     group by t.identifier
  $q$;
end $fn$;
