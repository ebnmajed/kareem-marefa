-- 0140_resend_webhook.sql — proposed by `notify`, read line by line and promoted by the lead (wave 10, N8) — REQ-NTF-008's last half: the provider
-- tells us a message bounced, and the org admin sees it with its reason.
--
-- Serves:  REQ-NTF-008 («a bounce or failure is visible to the org admin, with
--          the reason»), 08 §5.2 (`/api/webhooks/resend`)
-- Cites:   0026 (email_deliveries, delivery_status), 0030
--          (update_email_delivery_by_provider — the webhook's only door, and
--          it already exists), invariant 7, DEC-161
--
-- ── 03 §8.2 rows this migration needs ───────────────────────────────────────
--   | `RPC-resend_webhook.signature_required` | A body with no signature, a wrong signature, or a
--     signature over different bytes returns `{"status":"rejected"}` and moves no row. |
--   | `RPC-resend_webhook.replay_window` | A correctly-signed body whose timestamp is older than
--     five minutes is rejected — a captured webhook cannot be replayed tomorrow. |
--   | `RPC-resend_webhook.anon_granted` | `anon` holds the grant, because a provider webhook
--     carries no session; the function decides everything itself. |
--   | `RPC-resend_webhook.moves_only_existing` | It can move a row it names by
--     `provider_message_id` and can create none — the worst a forged, correctly-signed body
--     achieves is mislabelling a delivery that already exists. |
--   | `RPC-resend_webhook.unconfigured_is_quiet` | With no secret in the vault it returns
--     `{"status":"unconfigured"}` rather than raising, so a deployment that has not set one yet
--     answers 200 and the provider does not retry forever. |
--
-- ★ WHY THE SIGNATURE IS CHECKED IN THE DATABASE AND NOT IN THE ROUTE.
--
-- Invariant 7: `service_role` is never on Vercel. The door this webhook needs
-- —`update_email_delivery_by_provider()` (0030) — is granted to `service_role`
-- alone, so a route handler cannot call it, and giving Vercel the key to reach
-- it would put the platform's most powerful credential on the edge to update a
-- bounce flag.
--
-- So the route handler holds nothing. It forwards four strings — the three
-- Svix headers and the RAW body — to this function, which `anon` may call and
-- which verifies the signature itself against a secret that lives in the
-- vault. The secret never leaves the database, there is no new environment
-- variable to leak or rotate on two systems, and a route handler that is
-- compromised end to end still cannot do more than forward bytes that fail to
-- verify.
--
-- ★ THE RAW BODY IS THE SIGNED BODY. A signature is over bytes, so the handler
-- must pass `await request.text()` and never a re-serialised object: JSON
-- round-tripping reorders keys and rewrites whitespace, and every such body
-- would fail to verify for reasons no log would explain.

-- ═══════════════════════════════════════════════════════════════════════════
-- resend_webhook — 08 §5.2.
--
-- Svix's scheme, which is what Resend sends: the signed content is
-- `{id}.{timestamp}.{body}`, the secret is base64 after a `whsec_` prefix, and
-- the header is a space-separated list of `v1,<base64>` so a secret can be
-- rotated with both old and new accepted for a window.
-- ═══════════════════════════════════════════════════════════════════════════
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
  end::public.delivery_status;

  -- ★ TWO EVENTS ARE DELIBERATELY IGNORED, and neither is an oversight.
  --
  -- `email.delivery_delayed` is not an outcome: the message is still in
  -- flight, and writing `failed` for it would show an admin a failure that
  -- resolves itself an hour later.
  --
  -- `email.complained` IS an outcome, and `delivery_status` (0026) has no
  -- value for it. It is a REQUEST TO THE LEAD rather than a mapping, because
  -- every available value would lie: `bounced` says the address is bad, and an
  -- admin reading that may remove a working address; `failed` says the send
  -- did not arrive, when a complaint proves it did. A wrong label in an
  -- operational log is worse than a missing one.
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
  end if;

  -- 0030's function, unchanged: it moves a row it can NAME and creates none.
  v_moved := public.update_email_delivery_by_provider(v_msg, v_status, left(v_error, 1000));

  -- 200 either way. A provider retries a 404 forever, and a webhook for a
  -- message this deployment never sent — a shared Resend account, a restored
  -- database — is not an error here.
  return jsonb_build_object('status', case when v_moved then 'applied' else 'unknown_message' end, 'type', v_type);
end $$;

-- ★ `anon` HOLDS THE GRANT, and that is the design rather than a concession.
-- A provider webhook carries no session and never will. The function's
-- security is the signature it verifies against a secret `anon` cannot read —
-- `vault.decrypted_secrets` is reachable only inside this definer body — and
-- the narrowness of what a verified call can do: move one existing row.
revoke execute on function public.resend_webhook(text, text, text, text) from public;
grant  execute on function public.resend_webhook(text, text, text, text) to anon, authenticated;

comment on function public.resend_webhook(text, text, text, text) is
  'REQ-NTF-008: verifies a Svix signature against the vault''s `resend_webhook_secret` and moves one email_deliveries row by provider_message_id. Granted to anon because a provider webhook has no session; it can create nothing and reads no secret out.';
