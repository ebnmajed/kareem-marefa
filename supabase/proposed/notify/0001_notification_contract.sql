-- notify (wave 2, M3) — the notification contract: the six M3 tables, the
-- normative matrix as a function, and public.notify(), the one door every
-- track uses to send anything.
--
-- Serves:  REQ-NTF-001 (two channels, and only two) · REQ-NTF-002 (the matrix
--          is complete and enforced) · REQ-NTF-003 (per-category, per-channel
--          preferences; the non-optional set) · REQ-NTF-006 (the inbox) ·
--          REQ-NTF-007 (admin-editable templates, validated before save) ·
--          REQ-NTF-008 (delivery is logged) · REQ-CAL-003 (tokens are never
--          displayed to anyone) · REQ-CAL-004 (one calendar event per member
--          per session) · REQ-CAL-007 (disconnect deletes the tokens)
-- Cites:   02 §3, §4.14 (frozen) · 03 §5.9, §5.9c, §8.2 · 08 §1, §2, §7 ·
--          11 §2.6 · DEC-046 (the mail sink; enqueue only through 0025) ·
--          0025 (public.enqueue_job — job_key_mode => 'replace')
--
-- ── 03 §8.2 rows this migration needs ───────────────────────────────────────
--   | `POL-notifications.select.self` | A member cannot read another's notifications. |
--   | `POL-notifications.insert` | **No role** may insert: job-written through `notify()`. |
--   | `POL-notifications.update.read_at` | A member marks their own row read; `key`, `payload` and
--     `member_id` are outside the column grant. |
--   | `POL-notification_preferences.self` | A member reads and writes only their own preferences. |
--   | `POL-notification_preferences.not_switchable` | A row disabling `certificates`, `moderation`
--     or `account` is rejected by the constraint (`08` §2). |
--   | `POL-notification_templates.select.admin` | A plain member reads no template; the org admin does. |
--   | `POL-notification_templates.required_fields` | A template whose body omits a declared
--     `required_fields` entry is refused **before it is saved** (`REQ-NTF-007`). |
--   | `POL-notification_templates.matrix` | A template for a key or channel absent from `08` §1 is
--     refused (`REQ-NTF-002`). |
--   | `POL-email_deliveries.select.admin` | An org admin sees bounces with the reason; a member sees
--     nothing, not even their own. |
--   | `POL-calendar_connections.select` | **No role** can select a token column — member, admin,
--     moderator alike: `select *` as the owning member is `42501`. |
--   | `POL-calendar_connections.delete` | Disconnect deletes the row; the tokens are gone immediately. |
--   | `POL-calendar_events.select.self` | A member sees only their own sync rows; insert and update
--     have no policy and no grant. |
--   | `RPC-notify.matrix_closed` | A key absent from `08` §1 raises `22023` — nothing outside the
--     matrix can be sent (`REQ-NTF-002`). |
--   | `RPC-notify.preference` | A member who disabled a category gets no inbox row and no job; the
--     call is a no-op, not an error. |
--   | `RPC-notify.non_optional` | One of `08` §1.7's messages is written and enqueued even with both
--     channels disabled. |
--   | `RPC-notify.definer_only` | `anon`, `authenticated` and an org admin are all refused on the
--     grant; a definer RPC and `service_role` succeed. |
--   | `RPC-notify.enqueues_in_transaction` | The `notify:{message_id}` job and the `notifications`
--     row commit or roll back together (`02` §4.17). |
--
-- ── Two columns beyond 02 §4.14, both additive ──────────────────────────────
-- `email_deliveries.notification_id` correlates a send with the inbox row it
-- accompanies (null when the message is email-only because the member turned
-- the inbox off for that category). `notification_preferences.updated_at`
-- follows the repo-wide `set_updated_at()` convention. Neither changes a
-- frozen column's meaning.

-- ── Enums (02 §3) ───────────────────────────────────────────────────────────
create type public.notify_channel      as enum ('in_app', 'email');
create type public.delivery_status     as enum ('queued', 'sent', 'delivered', 'bounced', 'failed');
create type public.calendar_provider   as enum ('google');
create type public.calendar_sync_state as enum ('pending', 'synced', 'failed', 'removed');

-- `notify_channel` has exactly two values and gains no third: REQ-NTF-001 says
-- no code path, dependency or configuration field exists for SMS, WhatsApp or
-- push. An enum makes that a schema fact rather than a convention.

-- ═══════════════════════════════════════════════════════════════════════════
-- notification_matrix() — 08 §1, as data.
--
-- 08 is the normative matrix and REQ-NTF-002 says no notification is sent that
-- is not in it. A function rather than a table because the matrix is part of
-- the specification, not org data: it has no org_id, nobody edits it at
-- runtime, and a row appearing in it is a plan change that goes through a
-- migration. notify() reads it, and the template trigger reads it, so the
-- rule is enforced in one place instead of restated at every call site.
--
-- `optional = false` is 08 §1.7's set — the messages a member cannot switch
-- off, on BOTH channels. The test each one passes: a member who never saw it
-- would be materially worse off.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.notification_matrix()
  returns table (key text, category text, in_app boolean, email boolean, optional boolean)
  language sql immutable parallel safe set search_path = '' as $$
  values
    -- 08 §1.1 proposals
    ('MSG-proposal_submitted',    'admin_queue',  true,  true,  true ),
    ('MSG-copresenter_invited',   'proposals',    true,  true,  false),
    ('MSG-copresenter_declined',  'proposals',    true,  false, true ),
    ('MSG-proposal_changes',      'proposals',    true,  true,  false),
    ('MSG-proposal_approved',     'proposals',    true,  true,  false),
    ('MSG-proposal_rejected',     'proposals',    true,  true,  false),
    -- 08 §1.2 sessions
    ('MSG-session_published',     'new_sessions', true,  true,  true ),
    ('MSG-presenter_assigned',    'proposals',    true,  true,  false),
    ('MSG-session_changed',       'my_sessions',  true,  true,  false),
    ('MSG-session_cancelled',     'my_sessions',  true,  true,  false),
    ('MSG-reminder_7d',           'reminders',    true,  true,  true ),
    ('MSG-reminder_1d',           'reminders',    true,  true,  true ),
    ('MSG-reminder_2h',           'reminders',    true,  true,  true ),
    ('MSG-rsvp_nudge',            'new_sessions', true,  false, true ),
    -- 08 §1.3 RSVP
    ('MSG-rsvp_confirmed',        'my_sessions',  true,  false, true ),
    ('MSG-rsvp_waitlisted',       'my_sessions',  true,  false, true ),
    ('MSG-rsvp_promoted',         'my_sessions',  true,  true,  false),
    ('MSG-rsvp_deadline_soon',    'my_sessions',  true,  false, true ),
    ('MSG-priority_window',       'new_sessions', true,  false, true ),
    -- 08 §1.4 during and after
    ('MSG-check_in_confirmed',    'my_sessions',  true,  false, true ),
    ('MSG-rating_prompt',         'ratings',      true,  true,  true ),
    ('MSG-materials_added',       'my_sessions',  true,  true,  true ),
    ('MSG-comment_reply',         'social',       true,  true,  true ),
    ('MSG-mentioned',             'social',       true,  true,  true ),
    ('MSG-photo_hidden',          'moderation',   true,  false, false),
    ('MSG-content_removed',       'moderation',   true,  false, false),
    ('MSG-report_filed',          'admin_queue',  true,  false, true ),
    -- 08 §1.5 recognition and certificates
    ('MSG-badge_earned',          'recognition',  true,  true,  true ),
    ('MSG-level_reached',         'recognition',  true,  true,  true ),
    ('MSG-streak_completed',      'recognition',  true,  false, true ),
    ('MSG-points_adjusted',       'recognition',  true,  false, false),
    ('MSG-leaderboard_closed',    'recognition',  true,  false, true ),
    ('MSG-certificate_issued',    'certificates', true,  true,  false),
    ('MSG-certificate_revoked',   'certificates', true,  true,  false),
    -- 08 §1.6 account
    ('MSG-role_changed',          'account',      true,  true,  false),
    ('MSG-account_deactivated',   'account',      false, true,  false),
    ('MSG-calendar_disconnected', 'account',      true,  false, false),
    ('MSG-export_ready',          'account',      true,  true,  false)
$$;
grant execute on function public.notification_matrix() to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- notification_templates — 02 §4.14, 03 §5.9, REQ-NTF-007.
-- Org-editable within the brand kit; Arabic-first (locale defaults to 'ar').
-- ═══════════════════════════════════════════════════════════════════════════
create table public.notification_templates (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  key             text not null,
  channel         public.notify_channel not null,
  locale          text not null default 'ar' check (locale in ('ar', 'en')),
  subject         text check (subject is null or char_length(subject) <= 200),
  body            text not null check (char_length(body) between 1 and 20000),
  required_fields text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, key, channel, locale),
  -- An email without a subject is a blank line in every client's list view.
  check (channel <> 'email' or subject is not null)
);
create trigger notification_templates_updated_at before update on public.notification_templates
  for each row execute function public.set_updated_at();

-- REQ-NTF-007: "A template missing a required dynamic field fails validation
-- BEFORE it can be saved." A trigger, not application validation — an admin
-- editing through any path gets the same refusal, and a template that renders
-- «مرحبًا ,» because {{member.name}} was deleted never reaches the queue.
-- It also closes the matrix (REQ-NTF-002) in the other direction: a template
-- for a key or a channel 08 §1 does not list can never be reached by notify(),
-- so accepting it would be storing a promise the send path cannot keep.
create function public.notification_templates_validate() returns trigger
language plpgsql set search_path = '' as $$
declare f text;
begin
  if not exists (select 1 from public.notification_matrix() m where m.key = new.key) then
    raise exception 'unknown_message_key: %', new.key using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.notification_matrix() m
     where m.key = new.key
       and ((new.channel = 'in_app'::public.notify_channel and m.in_app)
         or (new.channel = 'email'::public.notify_channel and m.email))
  ) then
    raise exception 'channel_not_in_matrix: % on %', new.key, new.channel using errcode = '22023';
  end if;
  foreach f in array new.required_fields loop
    if position('{{' || f || '}}' in coalesce(new.subject, '') || coalesce(new.body, '')) = 0 then
      raise exception 'missing_required_field: %', f using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
create trigger notification_templates_validate
  before insert or update on public.notification_templates
  for each row execute function public.notification_templates_validate();

alter table public.notification_templates enable row level security;
revoke all on public.notification_templates from anon, authenticated, service_role;
-- 03 §5.9: select is P1 narrowed by is_org_admin() — a template is an admin
-- surface (SCR admin/emails), not member-visible content.
create policy "templates_read_admin" on public.notification_templates for select to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_insert" on public.notification_templates for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.notification_templates for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_delete" on public.notification_templates for delete to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin());
grant select, insert, delete on public.notification_templates to authenticated;
grant update (key, channel, locale, subject, body, required_fields) on public.notification_templates to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- notifications — 02 §4.14, REQ-NTF-006. The in-app inbox.
-- Job-written: there is no insert policy and no insert grant for any role.
-- Everything that lands here comes through public.notify().
-- ═══════════════════════════════════════════════════════════════════════════
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  key        text not null,
  payload    jsonb not null default '{}'::jsonb,
  session_id uuid references public.sessions(id) on delete cascade,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
-- 02 §4.14 names this index explicitly: it is the unread-count query, which
-- runs on every page load of the shell (REQ-NTF-006, "accurate across devices").
create index notifications_inbox_idx
  on public.notifications (org_id, member_id, read_at nulls first, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated, service_role;
create policy "p7_self_read" on public.notifications for select to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "notifications_update_read_self" on public.notifications for update to authenticated
  using       (org_id = public.auth_org_id() and member_id = public.auth_member_id())
  with check  (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "p3_self_delete" on public.notifications for delete to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());
grant select, delete on public.notifications to authenticated;
-- The column grant is the whole of "a member marks it read": without it a
-- member could rewrite `key` and `payload` of their own row under cover of the
-- update policy, and the inbox would stop being a record of what was sent.
grant update (read_at) on public.notifications to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- notification_preferences — 02 §4.14, 08 §2, REQ-NTF-003.
--
-- ABSENCE MEANS ON. Every category defaults on (08 §2), so a member who has
-- never opened the preferences screen has no rows here and receives
-- everything. A row exists only where a member has made a choice, which is
-- also why there is no seeding step and no backfill when a category is added.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.notification_preferences (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.orgs(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  category   text not null check (category in (
               'new_sessions', 'my_sessions', 'reminders', 'ratings', 'social',
               'recognition', 'certificates', 'moderation', 'proposals',
               'admin_queue', 'account')),
  channel    public.notify_channel not null,
  enabled    boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, category, channel),
  -- 08 §2 marks three categories "not switchable". Every message in them is in
  -- 08 §1.7's non-optional set, so notify() would ignore a disabling row
  -- anyway; refusing to STORE one means the preferences screen can render them
  -- as fixed and be telling the truth, rather than showing a toggle that
  -- silently does nothing.
  check (enabled or category not in ('certificates', 'moderation', 'account'))
);
create index notification_preferences_member_idx on public.notification_preferences (org_id, member_id);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated, service_role;
create policy "p7_self_read" on public.notification_preferences for select to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "p3_self_insert" on public.notification_preferences for insert to authenticated
  with check (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "p3_self_update" on public.notification_preferences for update to authenticated
  using       (org_id = public.auth_org_id() and member_id = public.auth_member_id())
  with check  (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "p3_self_delete" on public.notification_preferences for delete to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());
grant select, insert, delete on public.notification_preferences to authenticated;
grant update (enabled) on public.notification_preferences to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- email_deliveries — 02 §4.14, REQ-NTF-008. Every send records its outcome.
-- Written by the worker's mail transport (the Mailpit sink locally, the
-- in-memory transport in CI, Resend at Launch — DEC-046) and updated by the
-- provider webhook. The org admin reads it WITH THE REASON; nobody writes it
-- from a client.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.email_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  member_id           uuid not null references public.members(id) on delete cascade,
  notification_id     uuid references public.notifications(id) on delete set null,
  key                 text not null,
  provider_message_id text,
  status              public.delivery_status not null default 'queued',
  error               text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now()
);
create index email_deliveries_org_created_idx on public.email_deliveries (org_id, created_at desc);
create index email_deliveries_org_status_idx  on public.email_deliveries (org_id, status, created_at desc);
-- The webhook looks a delivery up by the provider's id and must not be able to
-- create a second row for one send: partial unique, because the id is null
-- between enqueueing and the provider's first response.
create unique index email_deliveries_provider_msg_idx
  on public.email_deliveries (provider_message_id) where provider_message_id is not null;

alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from anon, authenticated, service_role;
-- 03 §5.9: select is_org_admin(), and nothing else. Not even the recipient
-- reads their own delivery log — a bounce is operational data about the org's
-- mail, and REQ-NTF-008 puts it in front of the admin.
create policy "deliveries_read_admin" on public.email_deliveries for select to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());
grant select on public.email_deliveries to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- calendar_connections — 02 §4.14, 03 §5.9c, REQ-CAL-003, REQ-CAL-007, A33.
--
-- THE TABLE NOBODY MAY READ. The token columns appear in no grant to any
-- role: not the member's, not the org admin's, not a moderator's. `select *`
-- as the owning member is 42501; only the four status columns are granted.
-- This is the one place in the product where admin access is NARROWER than
-- member self-access, and it is deliberate — an OAuth token is a credential
-- for a personal Google account, not org data.
--
-- Disconnect DELETES the row (REQ-CAL-007), outside the retention schedule
-- entirely, which is why delete is the member's and update is nobody's.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.calendar_connections (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.orgs(id) on delete cascade,
  member_id              uuid not null unique references public.members(id) on delete cascade,
  provider               public.calendar_provider not null default 'google',
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at             timestamptz,
  scope                  text,
  connected_at           timestamptz not null default now(),
  disconnected_at        timestamptz
);

alter table public.calendar_connections enable row level security;
revoke all on public.calendar_connections from anon, authenticated, service_role;
create policy "calendar_read_status_self" on public.calendar_connections for select to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "calendar_delete_self" on public.calendar_connections for delete to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());
-- Four columns, and four only. Adding a fifth here is how REQ-CAL-003 breaks.
grant select (member_id, provider, connected_at, disconnected_at) on public.calendar_connections to authenticated;
grant delete on public.calendar_connections to authenticated;
-- Stated rather than implied: the connection is written by the OAuth callback
-- through a definer function, never by a client.
revoke insert, update on public.calendar_connections from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- calendar_events — 02 §4.14, REQ-CAL-004 … REQ-CAL-006.
-- Job-written. The unique constraint IS the idempotency of REQ-CAL-004: the
-- job cannot create a second event even if it runs twice.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.calendar_events (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  member_id         uuid not null references public.members(id) on delete cascade,
  session_id        uuid not null references public.sessions(id) on delete cascade,
  provider_event_id text,
  state             public.calendar_sync_state not null default 'pending',
  last_synced_at    timestamptz,
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (member_id, session_id)
);
create index calendar_events_org_state_idx on public.calendar_events (org_id, state, created_at);
create trigger calendar_events_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon, authenticated, service_role;
-- REQ-CAL-005: "a failed sync is surfaced to the member" — so the member reads
-- their own row, including `error`. Nobody writes from a client.
create policy "p7_self_read" on public.calendar_events for select to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());
grant select on public.calendar_events to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- public.notify() — THE CONTRACT.
--
--   public.notify(p_org uuid, p_member uuid, p_category text,
--                 p_payload jsonb, p_key text) returns uuid
--
-- `p_key` is the MSG-* key of 08 §1 and lands in notifications.key.
-- `p_category` is the PREFERENCE category of 08 §2; pass null to derive it
-- from the matrix, or pass it to have the call site's intent checked.
-- Returns the notifications row id, or null when the inbox was suppressed.
--
-- scoring, content and every M2 hook call THIS and nothing else. Not a direct
-- insert into notifications, not enqueue_job('send_notification'), and never
-- graphile_worker.add_job.
--
-- Four properties, in order of how badly each would hurt if it were missing:
--
--   1. THE MATRIX IS CLOSED. A key 08 §1 does not list raises 22023. That is
--      REQ-NTF-002 enforced rather than documented — the alternative is a
--      typo'd key silently creating a message category nobody can switch off
--      and no template exists for.
--   2. PREFERENCES ARE HONOURED PER CHANNEL, and the 08 §1.7 set bypasses
--      them on both. A member who disabled the inbox for `reminders` but kept
--      email gets the mail and no row; REQ-NTF-003 says a disabled category is
--      not delivered on that channel "including to the in-app inbox".
--   3. NOT SENDING IS NOT AN ERROR. A suppressed notification returns null. A
--      raise here would roll back the caller's award, promotion or moderation
--      action — the notification is the least important thing in that
--      transaction and must never be the thing that fails it.
--   4. THE JOB IS ENQUEUED IN THE CALLER'S TRANSACTION (02 §4.17, 11 §1.1).
--      There is no state in which the row is committed and the send is not.
--
-- The job re-checks preferences at SEND time (11 §2.6) because a member may
-- change them in between; this check is the inbox's authority, the job's is
-- email's.
-- ═══════════════════════════════════════════════════════════════════════════
-- The preference lookup, separated so the "absence means on" rule is stated
-- once. SECURITY DEFINER because notify()'s callers may be triggers running as
-- a member who has no select grant on another member's preferences.
create function public._notify_wants(p_member uuid, p_category text, p_channel public.notify_channel)
  returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.enabled from public.notification_preferences p
      where p.member_id = p_member and p.category = p_category and p.channel = p_channel),
    true);   -- 08 §2: every category defaults on; a row exists only where a member chose.
$$;
revoke execute on function public._notify_wants(uuid, text, public.notify_channel) from public, anon, authenticated;
grant  execute on function public._notify_wants(uuid, text, public.notify_channel) to service_role;

create function public.notify(
  p_org      uuid,
  p_member   uuid,
  p_category text,
  p_payload  jsonb,
  p_key      text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  m          record;
  v_member   public.members;
  v_msg_id   uuid := gen_random_uuid();
  v_session  uuid;
  v_in_app   boolean;
  v_email    boolean;
  v_written  uuid;
begin
  select * into m from public.notification_matrix() x where x.key = p_key;
  if not found then
    -- REQ-NTF-002. Naming the key matters: this fires in a caller's
    -- transaction and the caller needs to know which of its call sites is wrong.
    raise exception 'unknown_message_key: % (08 §1 is the matrix; nothing outside it is sent)', p_key
      using errcode = '22023';
  end if;

  -- A caller that states a category is checked against the matrix. Passing the
  -- wrong one would send under the wrong preference — the member switches off
  -- `social` and still gets it because the call site said `my_sessions`.
  if p_category is not null and p_category <> m.category then
    raise exception 'category_mismatch: % belongs to category % in 08 §1, not %', p_key, m.category, p_category
      using errcode = '22023';
  end if;

  -- Tenancy: the recipient must be in the org the caller named. Both are
  -- parameters, so a mismatch is a bug at the call site, not a member action —
  -- and it is exactly how a notification about org A's session would land in
  -- org B's inbox.
  select * into v_member from public.members where id = p_member and org_id = p_org;
  if not found then
    raise exception 'not_found: member % is not in org %', p_member, p_org using errcode = 'P0002';
  end if;
  -- Deactivated members are NOT filtered out: MSG-account_deactivated is
  -- addressed to exactly that member, and MSG-export_ready may follow a
  -- deletion request. The matrix decides who hears what; status does not.

  v_in_app := m.in_app and (not m.optional or public._notify_wants(p_member, m.category, 'in_app'));
  v_email  := m.email  and (not m.optional or public._notify_wants(p_member, m.category, 'email'));

  if not v_in_app and not v_email then
    return null;   -- property 3: a no-op, not an error.
  end if;

  if v_in_app then
    -- 02 §4.14 gives notifications a session_id; every screen that links from
    -- the inbox back to a session needs it indexed, not dug out of the payload.
    v_session := case
      when p_payload ->> 'session_id' ~ '^[0-9a-fA-F-]{36}$' then (p_payload ->> 'session_id')::uuid
      else null end;
    insert into public.notifications (id, org_id, member_id, key, payload, session_id)
    values (v_msg_id, p_org, p_member, p_key, coalesce(p_payload, '{}'::jsonb), v_session)
    returning id into v_written;
  end if;

  -- 08 §7: the key is notify:{message_id}. It is generated above whether or
  -- not the inbox row was written, so an email-only send still has a stable,
  -- unique key — a shared key under job_key_mode => 'replace' (0025) would
  -- collapse two members' messages into one job.
  perform public.enqueue_job(
    'send_notification',
    jsonb_build_object(
      'notification_id', v_written,
      'message_id',      v_msg_id,
      'org_id',          p_org,
      'member_id',       p_member,
      'key',             p_key,
      'category',        m.category,
      'optional',        m.optional,
      'in_app',          v_in_app,
      'email',           v_email,
      'payload',         coalesce(p_payload, '{}'::jsonb)),
    'notify:' || v_msg_id::text);

  return v_written;
end $$;

-- A member who could call notify() could write into another member's inbox and
-- send mail in the org's name. The callers are definer RPCs (which run as the
-- owner and so pass the grant regardless) and the worker.
revoke execute on function public.notify(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant  execute on function public.notify(uuid, uuid, text, jsonb, text) to service_role;
