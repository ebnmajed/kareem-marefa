-- 0142_delivery_complained.sql — a spam complaint is its own delivery status
-- (REQ-NTF-008; DEC-165, the owner's decision 2026-09-21). The lead's.
--
-- 0140 mapped Resend's four outcome events and IGNORED `email.complained`,
-- because `delivery_status` had no honest value for it: `bounced` says the
-- address is bad, `failed` says the mail never arrived, and a complaint proves
-- it did. The owner's ruling is the fourth value, not a reused one: a complaint
-- is the one signal that predicts deliverability damage, and an org admin needs
-- it to stop mailing that person before the whole domain suffers.
--
-- ── 03 §8.2 rows this migration needs ───────────────────────────────────────
--   | `RPC-resend_webhook.complained` | A verified `email.complained` body moves the row to
--     `complained` with the reason «complained», and returns `applied`. |
--   | `RPC-evaluate_alerts.complaint_counts` | The bounce-spike rule counts a complaint as damage
--     beside a bounce and a failure. |
--
-- ADDITIVE. `alter type … add value` is its own statement first (a new enum
-- value cannot be used in the transaction that adds it); `resend_webhook()` and
-- `evaluate_alerts()` are re-created with one arm and one word added and
-- nothing else changed — diffed against 0140's and 0075's text before this
-- file was committed. `main`'s worker never names the enum; its filters on
-- `bounced`/`failed` see one more value they do not select, which is the honest
-- window state: a complaint recorded, not yet shown, until the deploy.
--
-- ★ THE OWNER'S STEP, AFTER THE MERGE: tick `email.complained` in the Resend
-- endpoint's subscribed events. Subscribed before this exists, the events were
-- discarded (0140's `ignored`); the enum without the subscription never hears
-- one. The two move together, and this file is the enum's half.

alter type public.delivery_status add value if not exists 'complained';

create or replace function public.resend_webhook(
  p_id        text,
  p_timestamp text,
  p_signature text,
  p_body      text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_secret   text;
  v_expected text;
  v_at       timestamptz;
  v_event    jsonb;
  v_type     text;
  v_msg      text;
  v_status   public.delivery_status;
  v_error    text;
  v_moved    boolean;
  v_ok       boolean := false;
  v_part     text;
begin
  -- Nothing missing is an error worth raising: a provider retries a 5xx for
  -- days, and an endpoint that raises turns a malformed request into a storm.
  if p_id is null or p_timestamp is null or p_signature is null or p_body is null then
    return jsonb_build_object('status', 'rejected', 'reason', 'incomplete');
  end if;

  -- The vault, not an environment variable: one copy, encrypted at rest, and
  -- rotating it is one statement rather than a redeploy of two systems.
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'resend_webhook_secret'
   limit 1;

  if v_secret is null or btrim(v_secret) = '' then
    -- Not configured is not a failure. Answering 200 keeps the provider from
    -- retrying forever against a deployment that has not set a secret yet, and
    -- the handler logs the miss.
    return jsonb_build_object('status', 'unconfigured');
  end if;

  -- ── the replay window, BEFORE the hmac ────────────────────────────────────
  -- Five minutes. A signature is valid forever, so without a window a webhook
  -- captured once could be replayed at any point in the future and would still
  -- verify. Checked first because it is the cheap half.
  begin
    v_at := to_timestamp(p_timestamp::bigint);
  exception when others then
    return jsonb_build_object('status', 'rejected', 'reason', 'timestamp');
  end;
  if abs(extract(epoch from (now() - v_at))) > 300 then
    return jsonb_build_object('status', 'rejected', 'reason', 'stale');
  end if;

  -- `convert_to(..., 'utf8')` rather than the text overload: `hmac` is
  -- declared for (bytea, bytea, text) and (text, text, text), and the key is
  -- decoded base64, so the bytea pair is the only one that matches. It is also
  -- the correct one — a signature is over BYTES, and the text overload would
  -- put the server's encoding between us and the provider.
  v_expected := encode(
    extensions.hmac(
      convert_to(p_id || '.' || p_timestamp || '.' || p_body, 'utf8'),
      decode(regexp_replace(v_secret, '^whsec_', ''), 'base64'),
      'sha256'),
    'base64');

  -- ★ CONSTANT TIME, BY COMPARING DIGESTS. Postgres has no constant-time
  -- comparison, and `=` on text returns as soon as two bytes differ — which
  -- leaks, one byte at a time, how much of a guess was right. Comparing the
  -- SHA-256 of each side instead makes the position of the first difference
  -- unrelated to the input, so there is nothing to walk.
  foreach v_part in array string_to_array(p_signature, ' ') loop
    if split_part(v_part, ',', 1) = 'v1' then
      if extensions.digest(split_part(v_part, ',', 2), 'sha256')
         = extensions.digest(v_expected, 'sha256') then
        v_ok := true;
      end if;
    end if;
  end loop;

  if not v_ok then
    return jsonb_build_object('status', 'rejected', 'reason', 'signature');
  end if;

  -- ── verified; only now is the body read as anything but bytes ────────────
  begin
    v_event := p_body::jsonb;
  exception when others then
    return jsonb_build_object('status', 'rejected', 'reason', 'body');
  end;

  v_type := v_event ->> 'type';
  v_msg  := v_event #>> '{data,email_id}';

  v_status := case v_type
    when 'email.sent'      then 'sent'
    when 'email.delivered' then 'delivered'
    when 'email.bounced'   then 'bounced'
    -- Resend's own word for a hard failure after its retries.
    when 'email.failed'    then 'failed'
    -- ★ 0142 (DEC-165): a spam complaint. The mail ARRIVED and the person
    -- objected — the one signal that predicts deliverability damage.
    when 'email.complained' then 'complained'
  end::public.delivery_status;

  -- ★ ONE EVENT IS DELIBERATELY IGNORED. `email.delivery_delayed` is not an
  -- outcome: the message is still in flight, and writing `failed` for it would
  -- show an admin a failure that resolves itself an hour later. (0140 ignored
  -- `email.complained` too, because the enum had no honest value for it; 0142
  -- adds the value rather than reuse a wrong one — DEC-165.)
  if v_status is null then
    return jsonb_build_object('status', 'ignored', 'type', v_type);
  end if;

  if v_msg is null or btrim(v_msg) = '' then
    return jsonb_build_object('status', 'ignored', 'reason', 'no_message_id');
  end if;

  if v_status = 'bounced' then
    -- REQ-NTF-008: «with the reason». Resend puts it under `data.bounce`, and
    -- the admin's log renders whatever lands here.
    v_error := coalesce(v_event #>> '{data,bounce,message}', v_event #>> '{data,bounce,type}', 'bounced');
  elsif v_status = 'failed' then
    v_error := coalesce(v_event #>> '{data,failed,reason}', 'failed');
  elsif v_status = 'complained' then
    -- Resend carries no reason for a complaint; the word itself is the reason.
    v_error := 'complained';
  end if;

  -- 0030's function, unchanged: it moves a row it can NAME and creates none.
  v_moved := public.update_email_delivery_by_provider(v_msg, v_status, left(v_error, 1000));

  -- 200 either way. A provider retries a 404 forever, and a webhook for a
  -- message this deployment never sent — a shared Resend account, a restored
  -- database — is not an error here.
  return jsonb_build_object('status', case when v_moved then 'applied' else 'unknown_message' end, 'type', v_type);
end $$;

-- The grants are unchanged by `create or replace`; restated so a reader of this
-- file alone sees them.
revoke execute on function public.resend_webhook(text, text, text, text) from public;
grant  execute on function public.resend_webhook(text, text, text, text) to anon, authenticated;

create or replace function public.evaluate_alerts()
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
  -- 0142 (DEC-165): a complaint is deliverability damage too, so it counts.
  select count(*), count(*) filter (where status in ('bounced', 'failed', 'complained'))
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
