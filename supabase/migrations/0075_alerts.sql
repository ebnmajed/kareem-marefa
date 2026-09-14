-- platform (wave 4, M8) — `JOB-evaluate_alerts`: the eight thresholds of
-- `11` §3.2, evaluated from SQL. Follows `0005`.
--
-- Serves:  REQ-NFR-016 (the numbers and the firing rule; the transport is the
--          lead's), `14` M8's third demonstrable — "every `11` §3.2 alert
--          fires in a drill"
-- Cites:   11 §3.1, 11 §3.2, 11 §1.2, 12 §5.5, DEC-049
--
-- ── Why this is SQL and not Sentry ────────────────────────────────────────
-- Sentry is a transport, and **a transport cannot be drilled**. What can be
-- drilled is a pure evaluation of eight conditions against rows that already
-- exist, which is this function: seed a condition, call it, and exactly one
-- alert says `fired`. The worker hands every row to an `AlertSink`; the sink
-- is a console/in-memory one locally and in CI, and Sentry at Launch. No
-- network call lives anywhere near here.
--
-- ── It returns ALL EIGHT, every call ──────────────────────────────────────
-- Not only the firing ones. "Fires once and CLEARS when the condition clears"
-- is only expressible if the caller can see both edges, and a function that
-- returned the firing subset would make a cleared alert indistinguishable from
-- an alert nobody evaluated.
--
-- ── Two readings, stated rather than hidden ───────────────────────────────
-- 1. **Ledger divergence and parity failure are read from the records the jobs
--    that detect them already write** — `audit_log`'s `points.balance_divergence`
--    rows from `JOB-audit_balances` (11 §2.3), and `fonts.parity_status =
--    'failed'` from `record_font()` (0064). An alert job that re-ran a nightly
--    sweep every minute would become the outage it exists to report.
-- 2. **`11` §3.2's "> 3 consecutive" render failures is implemented as three
--    in a row.** Waiting for a fourth buys one more failed render and no new
--    information. Flagged to the lead: if `11` means strictly four, the
--    constant below is the one line to change.
--
-- ── 03 §8.2 rows this file needs ──────────────────────────────────────────
--   | `RPC-evaluate_alerts.worker` | `service_role` only — `authenticated`, a
--     platform admin and `anon` are all refused on the grant. |
--   | `RPC-evaluate_alerts.eight` | It returns exactly the eight alerts of
--     `11` §3.2, every call, whether or not any is firing. |
--   | `RPC-evaluate_alerts.isolation` | Seeding any ONE condition fires that
--     alert and leaves the other seven quiet; clearing it stops the alert. |
--   | `RPC-evaluate_alerts.no_queue` | Without the `graphile_worker` schema the
--     queue alert reports `not_installed` rather than raising — the drill runs
--     in an environment that may not have it. |

create function public.evaluate_alerts()
returns table (alert text, fired boolean, detail jsonb)
language plpgsql stable security definer set search_path = '' as $fn$
declare
  -- `11` §3.2's thresholds, named once and in one place so a reader can check
  -- them against the document without reading the queries.
  k_queue_stall_minutes   constant int := 5;
  k_calendar_backlog      constant int := 50;
  k_calendar_age_minutes  constant int := 15;
  k_bounce_rate           constant numeric := 0.05;
  -- A floor, because one bounce out of three is not a spike — it is a small
  -- denominator, and paging on it teaches people to ignore the page.
  k_bounce_min_sends      constant int := 20;
  k_consecutive_renders   constant int := 3;
  k_impersonation_hours   constant int := 2;

  v_has_queue boolean := to_regnamespace('graphile_worker') is not null;
  v_age       numeric;
  v_n         bigint;
  v_total     bigint;
  v_bad       bigint;
begin
  -- 1. Queue stalled — 11 §1.2's LISTEN/NOTIFY degradation looks exactly like
  --    this, and `oldest pending` is the only number that shows it: a degraded
  --    queue is busy and healthy on every other metric while nothing moves.
  if not v_has_queue then
    return query select 'queue_stalled'::text, false, jsonb_build_object('status', 'not_installed');
  else
    execute $q$
      select coalesce(max(extract(epoch from (now() - j.run_at))), 0)::numeric
        from graphile_worker._private_jobs j
       where j.job_queue_id is null          -- unnamed queue IS `default`
         and j.locked_at is null
         and j.run_at <= now()
         and j.attempts < j.max_attempts
    $q$ into v_age;
    return query select 'queue_stalled'::text,
                        v_age > k_queue_stall_minutes * 60,
                        jsonb_build_object('oldest_pending_seconds', round(v_age),
                                           'threshold_seconds', k_queue_stall_minutes * 60);
  end if;

  -- 2. Ledger divergence — the rollup disagrees with the ledger. Any is too many.
  select count(*) into v_n from public.audit_log
   where action = 'points.balance_divergence' and occurred_at > now() - interval '24 hours';
  return query select 'ledger_divergence'::text, v_n > 0, jsonb_build_object('divergences_24h', v_n);

  -- 3. Parity failure — an export differed from what was approved. The font
  --    manifest is where the gate records it (A39, 0064).
  select count(*) into v_n from public.fonts
   where parity_status = 'failed' and coalesce(requested_at, created_at) > now() - interval '24 hours';
  return query select 'parity_failure'::text, v_n > 0, jsonb_build_object('failed_fonts_24h', v_n);

  -- 4. Calendar backlog — Google API trouble, or expired tokens.
  select count(*), coalesce(max(extract(epoch from (now() - c.updated_at))), 0)::numeric
    into v_n, v_age
    from public.calendar_events c where c.state = 'pending';
  return query select 'calendar_backlog'::text,
                      v_n > k_calendar_backlog or v_age > k_calendar_age_minutes * 60,
                      jsonb_build_object('pending', v_n, 'oldest_seconds', round(v_age));

  -- 5. Email bounce spike — in an org where every address is corporate this is
  --    a mail-server change, not bad addresses (11 §3.2).
  select count(*), count(*) filter (where status in ('bounced', 'failed'))
    into v_total, v_bad
    from public.email_deliveries where created_at > now() - interval '1 hour';
  return query select 'email_bounce_spike'::text,
                      v_total >= k_bounce_min_sends and v_bad::numeric / greatest(v_total, 1) > k_bounce_rate,
                      jsonb_build_object('sent_1h', v_total, 'bounced_1h', v_bad,
                                         'rate', round(v_bad::numeric / greatest(v_total, 1), 4));

  -- 6. Render failures — usually a font or a memory ceiling.
  select count(*) into v_n
    from (
      select a.status from public.export_artifacts a
       where a.status in ('ready', 'failed')
       order by a.created_at desc
       limit k_consecutive_renders
    ) recent
   where recent.status = 'failed';
  return query select 'render_failures'::text,
                      v_n >= k_consecutive_renders,
                      jsonb_build_object('consecutive_failures', v_n, 'threshold', k_consecutive_renders);

  -- 7. Storage prefix violation — the path builder is wrong. Page immediately.
  --    The two jobs meet through the durable trail rather than through a
  --    variable: `assert_storage_prefixes` writes the row, this reads it.
  select count(*) into v_n from public.platform_audit_log
   where action = 'storage.prefix_violation' and occurred_at > now() - interval '24 hours';
  return query select 'storage_prefix_violation'::text, v_n > 0, jsonb_build_object('violations_24h', v_n);

  -- 8. Impersonation active — someone left a break-glass session open. The
  --    table caps it at four hours, so this is the warning before the cap.
  select count(*) into v_n from public.impersonation_sessions
   where ended_at is null and started_at < now() - make_interval(hours => k_impersonation_hours);
  return query select 'impersonation_active'::text, v_n > 0,
                      jsonb_build_object('open_over_hours', k_impersonation_hours, 'sessions', v_n);
end $fn$;
revoke execute on function public.evaluate_alerts() from public, anon, authenticated;
grant  execute on function public.evaluate_alerts() to service_role;

comment on function public.evaluate_alerts() is
  '11 §3.2 — the eight alerts, all evaluated on every call so a caller sees both edges.';
