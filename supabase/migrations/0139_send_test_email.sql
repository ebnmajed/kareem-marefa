-- 0139_send_test_email.sql — proposed by `notify`, read line by line and promoted by the lead (wave 10, N5) — «أرسل اختبارًا»: the rendered message to
-- the signed-in admin's OWN address, through the live transport, and to no
-- other.
--
-- Serves:  REQ-NTF-011 («the test goes to the admin's own address and to no
--          other; no arbitrary recipient is accepted»)
-- Cites:   0026 (notify(), the matrix), 0030 (record_email_delivery),
--          0025 (enqueue_job), 0005 (write_audit, assert_active_member),
--          0073 (request_data_export — the rate-limit shape), DEC-161
--
-- ── 03 §8.2 rows this migration needs ───────────────────────────────────────
--   | `RPC-send_test_email.own_address_only` | The function takes NO address. The recipient is
--     `assert_active_member()`'s own row, so «to the admin's own address and to no other» is a
--     property of the SIGNATURE rather than of a check a caller could omit. |
--   | `RPC-send_test_email.admin_only` | A moderator and a member are refused `42501`; the org's
--     admin succeeds; and a member whose ROW says `member` while their claim still says `admin` is
--     refused too — the role is read from the table, not from a token that lives 900 s. |
--   | `RPC-send_test_email.matrix_closed` | A key `08` §1 does not give an email channel is refused
--     `22023` — a test cannot be the way to send a message the product does not send. |
--   | `RPC-send_test_email.rate_limited` | The eleventh call within an hour returns
--     `{"status":"rate_limited"}` and writes NOTHING — no audit row, no job. |
--   | `RPC-send_test_email.audited` | A successful call writes one `notify.test_email_sent` row whose
--     `after` carries the key and the locale and **never an address**. |
--
-- ★ NO RECIPIENT PARAMETER, AND THAT IS THE WHOLE REQUIREMENT.
--
-- `REQ-NTF-011` says the test goes to the admin's own address and to no other.
-- Written as a check inside a function that TAKES an address, that is one
-- `if` away from a bug; written as a function with no such argument, there is
-- no call site that can name anyone else. The address is read from
-- `assert_active_member()`'s row and never travels in, which also means the
-- audit row has no address to record — the actor IS the recipient, and storing
-- it twice would put an email address in an append-only log for no gain.
--
-- ★ THE RATE LIMIT PRECEDES EVERY WRITE (`DEC-043`). `request_data_export()`
-- (`0073`) is the shape: check, then write. Nothing here writes before the
-- limit is decided, so the refusal needs no rollback and returns an envelope
-- rather than raising — the screen says «too many» calmly instead of showing a
-- failure.

create or replace function public.send_test_email(
  p_key    text,
  p_locale text default 'ar'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  -- ★ THE ROLE FROM THE TABLE, NOT THE CLAIM (0005).
  --
  -- `is_org_admin()` reads `auth_org_role()`, which is the JWT claim, and the
  -- claim lives for up to 900 s. A demoted admin would keep sending tests for
  -- a quarter of an hour on a token that is merely stale rather than forged.
  -- `assert_fresh_admin()` is `assert_active_member()` plus the role read from
  -- the member ROW, raising `not_an_admin` `42501` — the same shape every
  -- other privileged write in this chain uses.
  m      public.members := public.assert_fresh_admin();
  v_sent int;
  v_job  bigint;
begin

  -- A test cannot be the way to send a message the product does not send.
  if not exists (
    select 1 from public.notification_matrix() x where x.key = p_key and x.email
  ) then
    raise exception 'unknown_message_key: %', p_key using errcode = '22023';
  end if;

  if p_locale not in ('ar', 'en') then
    raise exception 'unknown_locale: %', p_locale using errcode = '22023';
  end if;

  -- Counted from the audit log, which is append-only: a limit that reads its
  -- own evidence cannot drift from what the evidence says happened. The
  -- column is `occurred_at` — `audit_log` has no `created_at`, and the first
  -- draft of this assumed the repo-wide name.
  select count(*) into v_sent
    from public.audit_log a
   where a.org_id = m.org_id
     and a.actor_id = m.id
     and a.action = 'notify.test_email_sent'
     and a.occurred_at > now() - interval '1 hour';

  if v_sent >= 10 then
    -- Nothing has been written, so there is nothing to roll back.
    return jsonb_build_object('status', 'rate_limited', 'retry_after_minutes', 60);
  end if;

  perform public.write_audit(
    m.org_id, 'notify.test_email_sent', 'notification_template', null, null,
    -- The key and the locale. NOT the address: the actor is the recipient.
    jsonb_build_object('key', p_key, 'locale', p_locale),
    null, m.org_role::text, m.id);

  -- `job_key_mode => 'replace'` (0025): a second press within the same second
  -- replaces the pending job rather than sending twice.
  v_job := public.enqueue_job(
    'send_test_email',
    jsonb_build_object('org_id', m.org_id, 'member_id', m.id, 'key', p_key, 'locale', p_locale),
    'testmail:' || m.id::text);

  return jsonb_build_object('status', 'queued', 'remaining', 10 - v_sent - 1);
end $$;

-- An admin calls this from the screen, so `authenticated` holds the grant and
-- the function decides the role itself — `assert_fresh_admin()` above, which
-- reads the member row rather than the token. `anon` never.
revoke execute on function public.send_test_email(text, text) from public, anon;
grant  execute on function public.send_test_email(text, text) to authenticated;

comment on function public.send_test_email(text, text) is
  'REQ-NTF-011: renders the org''s template for one message key and sends it to the CALLER''s own address through the live transport. Takes no recipient: the address is read from the member row, so no call site can name anyone else.';
