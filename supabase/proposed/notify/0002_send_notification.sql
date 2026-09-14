-- notify (wave 2, M3) — what JOB-send_notification reads and writes.
--
-- Serves:  REQ-NTF-002 (send-time preference re-check) · REQ-NTF-003 ·
--          REQ-NTF-007 (the org's template, or the worker's Arabic default) ·
--          REQ-NTF-008 (every send records its outcome, with the reason)
-- Cites:   02 §4.14 · 03 §5.9 · 08 §3, §3.4, §5.2 · 11 §2.6 ·
--          DEC-046 (the sink writes these rows exactly as Resend does) ·
--          0026 (the contract: notify(), the matrix, the six tables)
--
-- ── 03 §8.2 rows (added with this migration) ────────────────────────────────
--   | `RPC-notification_send_context.definer_only` | `anon`, `authenticated` and an org admin are
--     refused on the grant: it returns another member's email address. |
--   | `RPC-notification_send_context.recheck` | It reports the preference as it stands NOW, not as
--     it stood when the job was enqueued (`11` §2.6). |
--   | `RPC-record_email_delivery.append` | The worker records a send it has not made yet as
--     `queued`, then moves it to `sent`, `delivered`, `bounced` or `failed` — no send is unlogged. |
--   | `RPC-update_email_delivery_by_provider.scoped` | The provider webhook can only move a row it
--     can name by `provider_message_id`, and cannot invent one. |
--
-- ── Why the worker reads through a function at all ──────────────────────────
-- CLAUDE.md: "The worker uses service_role only through SECURITY DEFINER
-- functions, never raw table writes." A job that selected `members.email`
-- directly would be a second place that decides who may see an address, and
-- the first place (03 §5.9, the column grants on `members`) would stop being
-- the answer. One function, one shape, one grant.

-- ═══════════════════════════════════════════════════════════════════════════
-- notification_send_context — everything one send needs, in one round trip.
--
-- The preference is re-read HERE rather than trusted from the job payload,
-- because 11 §2.6 is explicit: preferences are checked at SEND time, not at
-- enqueue time. A member who muted `reminders` after the -7d job was queued
-- must not receive it, and the enqueued payload cannot know that.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.notification_send_context(
  p_org      uuid,
  p_member   uuid,
  p_key      text,
  p_locale   text default 'ar'
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  m   record;
  o   record;
  mem public.members;
  tpl public.notification_templates;
begin
  select * into m from public.notification_matrix() x where x.key = p_key;
  if not found then
    raise exception 'unknown_message_key: %', p_key using errcode = '22023';
  end if;

  select * into mem from public.members where id = p_member and org_id = p_org;
  if not found then
    raise exception 'not_found: member % is not in org %', p_member, p_org using errcode = 'P0002';
  end if;

  select o2.name as org_name, s.email_from_name, s.email_reply_to, s.numerals::text as numerals, s.time_zone
    into o
    from public.orgs o2 left join public.org_settings s on s.org_id = o2.id
   where o2.id = p_org;

  -- 08 §3: the org's own template wins where it exists, at the requested
  -- locale and then at Arabic, which is never missing (invariant 10).
  select * into tpl from public.notification_templates t
   where t.org_id = p_org and t.key = p_key and t.channel = 'email'
     and t.locale in (p_locale, 'ar')
   order by (t.locale = p_locale) desc
   limit 1;

  return jsonb_build_object(
    'key',      p_key,
    'category', m.category,
    'optional', m.optional,
    'member', jsonb_build_object(
      'id',           mem.id,
      'email',        mem.email::text,
      'display_name', mem.display_name,
      'status',       mem.status::text),
    'org', jsonb_build_object(
      'name',      o.org_name,
      -- 08 §3.4 / OQ-016: one platform-verified sending domain, the org's name
      -- in the From display name, the org's admin contact as Reply-To.
      'from_name', coalesce(o.email_from_name, o.org_name),
      'reply_to',  o.email_reply_to,
      'numerals',  coalesce(o.numerals, 'western'),
      'time_zone', coalesce(o.time_zone, 'Asia/Riyadh')),
    'template', case when tpl.id is null then null else jsonb_build_object(
      'subject',         tpl.subject,
      'body',            tpl.body,
      'locale',          tpl.locale,
      'required_fields', to_jsonb(tpl.required_fields)) end,
    -- The 08 §1.7 set bypasses the check on both channels; everything else is
    -- read fresh. `_notify_wants` holds the "absence means on" rule (0026).
    'email_allowed',  m.email  and (not m.optional or public._notify_wants(p_member, m.category, 'email')),
    'in_app_allowed', m.in_app and (not m.optional or public._notify_wants(p_member, m.category, 'in_app'))
  );
end $$;
revoke execute on function public.notification_send_context(uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.notification_send_context(uuid, uuid, text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- record_email_delivery — REQ-NTF-008, "every send records its outcome".
--
-- Written BEFORE the send, as `queued`, and moved afterwards. A row that stays
-- `queued` is a worker that died mid-send, which is exactly the thing an
-- org admin needs to be able to see; a row written only on success would make
-- that state invisible.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.record_email_delivery(
  p_org          uuid,
  p_member       uuid,
  p_key          text,
  p_notification uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.email_deliveries (org_id, member_id, notification_id, key, status)
  values (p_org, p_member, p_notification, p_key, 'queued')
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.record_email_delivery(uuid, uuid, text, uuid) from public, anon, authenticated;
grant  execute on function public.record_email_delivery(uuid, uuid, text, uuid) to service_role;

create function public.update_email_delivery(
  p_id                  uuid,
  p_status              public.delivery_status,
  p_provider_message_id text default null,
  p_error               text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.email_deliveries
     set status              = p_status,
         provider_message_id = coalesce(p_provider_message_id, provider_message_id),
         error               = p_error,
         -- Timestamps are set once and never moved: a retry that finally
         -- succeeds must not rewrite when the first attempt left.
         sent_at             = case when p_status in ('sent', 'delivered') then coalesce(sent_at, now()) else sent_at end,
         delivered_at        = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end
   where id = p_id;
end $$;
revoke execute on function public.update_email_delivery(uuid, public.delivery_status, text, text) from public, anon, authenticated;
grant  execute on function public.update_email_delivery(uuid, public.delivery_status, text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- update_email_delivery_by_provider — the provider webhook's only door
-- (08 §5.2, /api/webhooks/resend).
--
-- It can MOVE a row it names by the provider's own message id and can create
-- nothing: a webhook is an unauthenticated HTTP endpoint whose body an
-- attacker controls, so the worst a forged one achieves is mislabelling a
-- delivery that already exists. Returns whether a row moved, so the handler
-- answers 200 either way (a provider retries a 404 forever) while logging the
-- miss.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.update_email_delivery_by_provider(
  p_provider_message_id text,
  p_status              public.delivery_status,
  p_error               text default null
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_rows int;
begin
  if p_provider_message_id is null or btrim(p_provider_message_id) = '' then
    return false;
  end if;
  update public.email_deliveries
     set status       = p_status,
         error        = coalesce(p_error, error),
         sent_at      = case when p_status in ('sent', 'delivered') then coalesce(sent_at, now()) else sent_at end,
         delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end
   where provider_message_id = p_provider_message_id;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end $$;
revoke execute on function public.update_email_delivery_by_provider(text, public.delivery_status, text) from public, anon, authenticated;
grant  execute on function public.update_email_delivery_by_provider(text, public.delivery_status, text) to service_role;
