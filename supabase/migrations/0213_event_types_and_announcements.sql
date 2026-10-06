-- 0213 — A session has an event type, and its automatic poster is that type's. REQ-SES-022, DEC-267.
--
-- The baseline library has had four poster families that name a kind of event since 0061 — talk, workshop, panel,
-- meetup — and nothing could make a session one of them: 02 had no such column, and poster_render_context() resolved
-- `talk` alone (its own comment said «the admin picks one on SCR-043»; no screen ever offered it). The owner named it
-- «event type», in the code and on every screen. ★ «إعلان» is offered beside the four on the admin's «create», and is
-- NOT a session: it is an org-wide announcement (feed_announcements, 0164), scheduled, shown in the feed and sent to
-- every member as a notification when it goes live (the owner's rulings, DEC-267). Section 6 below.
--
-- 1. The enum and the column. Every existing session is a talk — the default — so every poster already rendered is
--    drawn from the template it was drawn from: nothing re-renders on this migration.
-- 2. set_event_type(): an admin's, through assert_fresh_admin(), audited with the old and the new type. Not a column
--    grant: the presenter's update policy would reach it.
-- 3. poster_render_context() picks the org's template of the session's type, falling back to its talk.
-- 4. sessions_poster_hook() regenerates a LIVE poster when the type changes; regenerate_poster leaves a detached one
--    alone, as it does for every other change.
--
-- Additive: main's app never names the column, and a session it creates is a talk.

-- ── 1 ────────────────────────────────────────────────────────────────────────────────────────────────────────

do $$
begin
  create type public.event_type as enum ('talk', 'workshop', 'panel', 'meetup');
exception when duplicate_object then null;
end $$;

alter table public.sessions add column if not exists event_type public.event_type not null default 'talk';

-- A proposal carries the type its proposer picked, and the session made from it starts as that type. The proposer
-- writes it as they write the title: insert at creation, update while the proposal is editable
-- (proposals_update_own_editable).
alter table public.proposals add column if not exists event_type public.event_type not null default 'talk';
grant insert (event_type), update (event_type) on public.proposals to authenticated;

-- ── 2 ────────────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.set_event_type(p_session uuid, p_type public.event_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor  public.members := public.assert_fresh_admin();
  v_old  public.event_type;
begin
  if p_type is null then
    raise exception 'event_type_required' using errcode = '22023';
  end if;
  select s.event_type into v_old from public.sessions s where s.id = p_session and s.org_id = actor.org_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if v_old = p_type then
    return;
  end if;
  update public.sessions set event_type = p_type where id = p_session;
  perform public.write_audit(
    actor.org_id, 'session.event_type_changed', 'session', p_session,
    jsonb_build_object('event_type', v_old), jsonb_build_object('event_type', p_type),
    null, actor.org_role::text, actor.id
  );
end $$;
revoke execute on function public.set_event_type(uuid, public.event_type) from public, anon;
grant execute on function public.set_event_type(uuid, public.event_type) to authenticated;

-- ── 3 ────────────────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.poster_render_context(p_session uuid)
 RETURNS TABLE(session_id uuid, org_id uuid, title text, abstract text, starts_at timestamp with time zone, session_time_zone text, venue_name text, venue_address text, presenters text[], org_name text, org_time_zone text, poster_id uuid, document_id uuid, mode poster_mode, binding poster_binding, template_version_id uuid, template_document jsonb, days jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.id, s.org_id, s.title, s.abstract, s.starts_at,
         s.time_zone,
         coalesce(v.name, s.custom_venue_name),
         coalesce(v.address, s.custom_venue_address),
         -- A5: every ACCEPTED co-presenter, in the order they were named.
         coalesce((select array_agg(m.display_name order by sp.created_at)
                     from public.session_presenters sp
                     join public.members m on m.id = sp.member_id
                    where sp.session_id = s.id and sp.accepted), '{}'),
         o.name, coalesce(os.time_zone, 'Asia/Riyadh'),
         p.id, p.document_id, p.mode, p.binding,
         tv.id, tv.document,
         -- ★ BY `position` — the chronological rank the database derives and
         -- renumbers by trigger (DEC-150). Never ordered by `created_at`,
         -- which is the transaction's start and identical for rows written
         -- together, and never reduced to a min or a max here or in the
         -- caller. `[]` for a session whose days have not been written yet,
         -- which the runtime reads as «use the session's own instant».
         coalesce((select jsonb_agg(jsonb_build_object('startsAt', d.starts_at, 'endsAt', d.ends_at) order by d.position)
                     from public.session_days d where d.session_id = s.id), '[]'::jsonb)
    from public.sessions s
    join public.orgs o on o.id = s.org_id
    left join public.org_settings os on os.org_id = s.org_id
    left join public.venues v on v.id = s.venue_id
    left join public.session_posters p on p.session_id = s.id
    -- The template the automatic path binds to: the org's default for the
    -- `talk` family, else the platform's. 02 has no session-TYPE column, so
    -- a per-family default cannot be chosen automatically; the admin picks
    -- one on SCR-043 and that choice is what `session_posters.document_id`
    -- then records (REQ-DSG-002's «تلقائي» is a default, not a ceiling).
    -- ★ wave 27 (DEC-254 §3, DEC-255 D10): the org's own `talk`, through the one lookup — no platform fallback,
    -- and a published version only, as every other lookup already asked.
    left join lateral (
      select v2.id, v2.document
        from public.design_template_versions v2
       -- ★ 0213 (REQ-SES-022, DEC-267): the session's event type picks the family; an org with no published template of
       -- that type falls back to its talk.
       where v2.id = coalesce(public.org_template_version(s.org_id, 'poster', s.event_type::text),
                             public.org_template_version(s.org_id, 'poster', 'talk'))
    ) tv on true
   where s.id = p_session
$function$;

-- ── 4 ────────────────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sessions_poster_hook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- REQ-DSG-001: on the EDGE into published, every session gets a poster.
  -- On the edge, not on the state, so publish_session()'s walk through four
  -- states announces once (0036's own lesson).
  if tg_op = 'UPDATE' and new.state = 'published' and old.state is distinct from 'published' then
    perform public.enqueue_job('regenerate_poster', jsonb_build_object('session_id', new.id),
                               'poster:' || new.id::text, null, 'render', 3);
    return new;
  end if;

  -- REQ-DSG-003: a change to what a poster PRINTS. Not every column — a
  -- capacity change does not alter a poster, and re-rendering seven
  -- variants for one is waste the job key cannot absorb.
  if tg_op = 'UPDATE' and new.state in ('published', 'in_progress') and (
       new.title is distinct from old.title
       or new.starts_at is distinct from old.starts_at
       or new.venue_id is distinct from old.venue_id
       or new.custom_venue_name is distinct from old.custom_venue_name
       or new.custom_venue_address is distinct from old.custom_venue_address
       -- ★ 0213 (REQ-SES-022): the event type picks the template a live poster is drawn from.
       or new.event_type is distinct from old.event_type
     ) then
    -- The same key, so a burst of edits leaves ONE pending regeneration
    -- rather than one per keystroke (11 §1.1).
    perform public.enqueue_job('regenerate_poster', jsonb_build_object('session_id', new.id),
                               'poster:' || new.id::text, null, 'render', 3);
  end if;
  return new;
end $function$;

-- ── 5 · the proposal's type, and the session made from it ───────────────────────────────────────────────────

drop function if exists public.create_proposal(text, text, uuid, public.session_level, text, integer, text, uuid[], boolean);
CREATE OR REPLACE FUNCTION public.create_proposal(p_title text, p_abstract text, p_category uuid, p_level session_level, p_target_audience text DEFAULT NULL::text, p_expected_duration_minutes integer DEFAULT NULL::integer, p_admin_notes text DEFAULT NULL::text, p_co_presenters uuid[] DEFAULT '{}'::uuid[], p_submit boolean DEFAULT false, p_event_type public.event_type DEFAULT 'talk'::public.event_type)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id     uuid;
  v_me     uuid := public.auth_member_id();
  v_org    uuid := public.auth_org_id();
  v_member uuid;
begin
  insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level,
                                target_audience, expected_duration_minutes, admin_notes, state, event_type)
  values (v_org, v_me, p_title, p_abstract, p_category, p_level,
          p_target_audience, p_expected_duration_minutes, p_admin_notes,
          (case when p_submit then 'submitted' else 'draft' end)::public.proposal_state,
          coalesce(p_event_type, 'talk'::public.event_type))
  returning id into v_id;

  insert into public.proposal_presenters (org_id, proposal_id, member_id, accepted)
  values (v_org, v_id, v_me, true);

  foreach v_member in array coalesce(p_co_presenters, '{}'::uuid[])
  loop
    -- Naming yourself as your own co-presenter is a slip, not an error.
    if v_member is distinct from v_me then
      insert into public.proposal_presenters (org_id, proposal_id, member_id)
      values (v_org, v_id, v_member)
      on conflict (proposal_id, member_id) do nothing;
    end if;
  end loop;

  return v_id;
end $function$;
revoke execute on function public.create_proposal(text, text, uuid, public.session_level, text, integer, text, uuid[], boolean, public.event_type) from public, anon;
grant execute on function public.create_proposal(text, text, uuid, public.session_level, text, integer, text, uuid[], boolean, public.event_type) to authenticated;

CREATE OR REPLACE FUNCTION public.create_session(p_title text DEFAULT NULL::text, p_abstract text DEFAULT NULL::text, p_category uuid DEFAULT NULL::uuid, p_level session_level DEFAULT 'introductory'::session_level, p_language session_language DEFAULT 'ar'::session_language, p_presenters uuid[] DEFAULT '{}'::uuid[], p_proposal uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor      public.members := public.assert_fresh_admin();
  v_proposal public.proposals;
  v_id       uuid;
  v_member   uuid;
  v_title    text := p_title;
  v_abstract text := p_abstract;
  v_category uuid := p_category;
  v_level    public.session_level := p_level;
  v_action   text := 'session.created_direct';
begin
  if p_proposal is not null then
    select * into v_proposal from public.proposals
     where id = p_proposal and org_id = actor.org_id;
    if v_proposal.id is null then
      raise exception 'proposal_not_found' using errcode = '42501';
    end if;
    -- REQ-PRO-005: approving is what makes a proposal schedulable. Anything
    -- earlier would let an admin route around their own review.
    if v_proposal.state <> 'approved' then
      raise exception 'proposal_not_approved' using errcode = '23514';
    end if;
    v_title    := v_proposal.title;
    v_abstract := v_proposal.abstract;
    v_category := v_proposal.category_id;
    v_level    := v_proposal.level;
    v_action   := 'session.created_from_proposal';
  end if;

  if v_title is null or v_abstract is null or v_category is null then
    raise exception 'session_needs_title_abstract_category' using errcode = '23514';
  end if;

  -- ★ 0213 (REQ-SES-022): a session made from a proposal is the proposal's event type; one made directly is a talk
  -- until the admin sets it (set_event_type()).
  insert into public.sessions (org_id, proposal_id, title, abstract, category_id, level, language, state, event_type)
  values (actor.org_id, p_proposal, v_title, v_abstract, v_category, v_level, p_language, 'draft',
          coalesce(v_proposal.event_type, 'talk'::public.event_type))
  returning id into v_id;

  -- REQ-SES-003: every transition writes a row, and being born is one.
  insert into public.session_state_transitions (org_id, session_id, from_state, to_state, actor_id, is_manual)
  values (actor.org_id, v_id, null, 'draft', actor.id, true);

  -- From a proposal, the presenters are whoever accepted it; created directly,
  -- they are whoever the admin assigned. Either way `presenter_is_same_org()`
  -- and `presenters_within_limit` still hold — this function does not widen
  -- them, it just cannot be reached without being an admin.
  if p_proposal is not null then
    for v_member in
      select pp.member_id from public.proposal_presenters pp
       where pp.proposal_id = p_proposal and pp.accepted and pp.declined_at is null
    loop
      insert into public.session_presenters (org_id, session_id, member_id, accepted)
      values (actor.org_id, v_id, v_member, true);
    end loop;
  else
    foreach v_member in array coalesce(p_presenters, '{}'::uuid[])
    loop
      -- ★ ASSIGNED, not invited (REQ-SES-019, DEC-172): there is no
      -- session-level accept, so a row born pending could never become a
      -- presenter. A presenter who wants off asks the admin.
      insert into public.session_presenters (org_id, session_id, member_id, accepted)
      values (actor.org_id, v_id, v_member, true)
      on conflict (session_id, member_id) do nothing;
    end loop;
  end if;

  perform public.write_audit(actor.org_id, v_action, 'session', v_id, null,
                             jsonb_build_object('title', v_title, 'proposal_id', p_proposal),
                             null, 'admin', actor.id);
  return v_id;
end $function$;

-- ── 6 · an org announcement, scheduled, announced once when it goes live (REQ-ADM-025) ──────────────────────

-- When it was sent to members — written by publish_announcement() alone, so a later edit never re-sends it.
alter table public.feed_announcements add column if not exists announced_at timestamptz;
-- 0164 granted insert, select and delete and wrote an update policy with no grant behind it (invariant 6); the
-- announcements screen edits the text and the two times.
grant update (body, published_at, expires_at) on public.feed_announcements to authenticated;

-- The member's preference category for it.
alter table public.notification_preferences drop constraint if exists notification_preferences_category_check;
alter table public.notification_preferences add constraint notification_preferences_category_check check (category in (
  'new_sessions', 'my_sessions', 'reminders', 'ratings', 'social', 'recognition', 'certificates', 'moderation',
  'proposals', 'admin_queue', 'account', 'announcements'));

CREATE OR REPLACE FUNCTION public.notification_matrix()
 RETURNS TABLE(key text, category text, in_app boolean, email boolean, optional boolean)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
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
    ('MSG-reminder_generic',      'reminders',    true,  true,  true ),  -- new: console, DEC-047
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
    ('MSG-export_ready',          'account',      true,  true,  false),
    -- 08 §1.6a photos (0156, DEC-182): in-app only, so no mail design moves
    ('MSG-photo_album_ready',     'admin_queue',  true,  false, true ),
    -- ★ 0213 (REQ-ADM-025, DEC-267): an org announcement going live — to every active member, in-app and by mail,
    -- in its own category so a member can switch either off.
    ('MSG-announcement_published', 'announcements', true, true,  true )
$function$;

CREATE OR REPLACE FUNCTION public.notification_bindings()
 RETURNS TABLE(key text, binding text)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  -- The three `render.ts` resolves for every message whatever the payload
  -- holds (`renderEmail()`: `member` and `org` are always resolvable, because
  -- every default template greets by name and «مرحبًا ،» is the failure that
  -- prevents).
  select m.key, u.binding
    from public.notification_matrix() m
    cross join (values ('member.name'), ('member.email'), ('org')) as u(binding)
   where m.email
  union all
  -- What each key's own payload carries. Read out of the promoted migrations,
  -- caller by caller, not out of the templates.
  select v.key, b.binding
    from (values
      -- 08 §1.1 proposals — 0039's proposals_notify()
      ('MSG-proposal_submitted',  array['proposal_id', 'title', 'proposer', 'category', 'url']),
      ('MSG-proposal_approved',   array['proposal_id', 'title', 'reason', 'url']),
      ('MSG-proposal_rejected',   array['proposal_id', 'title', 'reason', 'url']),
      ('MSG-proposal_changes',    array['proposal_id', 'title', 'reason', 'url']),
      ('MSG-copresenter_invited', array['proposal_id', 'title', 'inviter', 'url']),
      -- 08 §1.2 sessions — 0036, 0039, 0111
      ('MSG-session_published',   array['session_id', 'title', 'startsAt', 'venue', 'url']),
      ('MSG-announcement_published', array['announcement_id', 'body', 'url']),
      ('MSG-presenter_assigned',  array['session_id', 'title', 'startsAt', 'venue', 'url']),
      -- `changes` is built by the renderer from the trigger's raw array
      -- (08 §3.3): the template sees one pre-built block, never a loop.
      ('MSG-session_changed',     array['session_id', 'title', 'startsAt', 'venue', 'changes', 'url']),
      ('MSG-session_cancelled',   array['session_id', 'title', 'startsAt', 'reason', 'url']),
      -- 08 §1.3 RSVP — 0034's rsvps_notify()
      ('MSG-rsvp_promoted',       array['session_id', 'rsvp_id', 'title', 'startsAt', 'venue', 'url']),
      -- 08 §1.2 reminders — 0110, per day (wave 9). `day` is the renderer's
      -- pre-built «اليوم الثاني من 3», empty at one day so the line disappears.
      ('MSG-reminder_7d',         array['session_id', 'title', 'startsAt', 'venue', 'offset_minutes', 'dayPosition', 'dayCount', 'day', 'tasks', 'url']),
      ('MSG-reminder_1d',         array['session_id', 'title', 'startsAt', 'venue', 'offset_minutes', 'dayPosition', 'dayCount', 'day', 'tasks', 'url']),
      ('MSG-reminder_2h',         array['session_id', 'title', 'startsAt', 'venue', 'offset_minutes', 'dayPosition', 'dayCount', 'day', 'url']),
      ('MSG-reminder_generic',    array['session_id', 'title', 'startsAt', 'venue', 'offset_minutes', 'dayPosition', 'dayCount', 'day', 'tasks', 'url']),
      -- 08 §1.4 during and after — 0035/0088, 0039
      ('MSG-rating_prompt',       array['session_id', 'title', 'url']),
      ('MSG-materials_added',     array['session_id', 'title', 'url']),
      ('MSG-comment_reply',       array['session_id', 'comment_id', 'title', 'author', 'url']),
      ('MSG-mentioned',           array['session_id', 'comment_id', 'title', 'name', 'url']),
      -- 08 §1.5 recognition and certificates — 0065
      ('MSG-badge_earned',        array['badge', 'url']),
      ('MSG-level_reached',       array['level', 'url']),
      ('MSG-certificate_issued',  array['certificate_id', 'serial', 'kind', 'title', 'url']),
      ('MSG-certificate_revoked', array['serial', 'reason']),
      -- 08 §1.6 account
      ('MSG-role_changed',        array['role']),
      ('MSG-account_deactivated', array['reason']),
      ('MSG-export_ready',        array['url'])
    ) as v(key, bindings)
    cross join lateral unnest(v.bindings) as b(binding)
$function$;

-- Called by the worker's publish_announcement job, as service_role. Idempotent: it sends only once, only while the
-- announcement is live, and a job that runs early (the time was moved later) does nothing — the trigger below has
-- already queued one for the new time.
create or replace function public.publish_announcement(p_announcement uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.feed_announcements;
  r record;
  v_sent int := 0;
begin
  select * into a from public.feed_announcements where id = p_announcement for update;
  if not found then return 'gone'; end if;
  if a.announced_at is not null then return 'already'; end if;
  if a.published_at > now() then return 'early'; end if;
  if a.expires_at is not null and a.expires_at <= now() then return 'expired'; end if;
  for r in select m.id from public.members m where m.org_id = a.org_id and m.status = 'active' loop
    perform public.notify(a.org_id, r.id, 'announcements',
                          jsonb_build_object('announcement_id', a.id, 'body', a.body),
                          'MSG-announcement_published');
    v_sent := v_sent + 1;
  end loop;
  update public.feed_announcements set announced_at = now() where id = a.id;
  return 'sent:' || v_sent;
end $$;
revoke execute on function public.publish_announcement(uuid) from public, anon, authenticated;
grant execute on function public.publish_announcement(uuid) to service_role;

-- An announcement written or rescheduled before it was sent queues its job for its time — one job per announcement,
-- the key replacing an earlier one.
create or replace function public.feed_announcements_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.announced_at is null
     and (tg_op = 'INSERT' or new.published_at is distinct from old.published_at) then
    perform public.enqueue_job('publish_announcement', jsonb_build_object('announcement_id', new.id),
                               'announce:' || new.id::text,
                               case when new.published_at > now() then new.published_at end,
                               null, 5);
  end if;
  return new;
end $$;
revoke execute on function public.feed_announcements_schedule() from public, anon, authenticated;

drop trigger if exists feed_announcements_schedule on public.feed_announcements;
create trigger feed_announcements_schedule
  after insert or update of published_at on public.feed_announcements
  for each row execute function public.feed_announcements_schedule();

-- ── 7 · every announcement write is answerable (REQ-ADM-023) ─────────────────────────────────────────────────

-- 0181's pattern: a definer trigger calling write_audit(), so the screen never writes audit_log. `announced_at` is the
-- system's, so its write is not an admin's change and is not logged.
create or replace function public.feed_announcements_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fields text[] := array['body', 'published_at', 'expires_at'];
  v_old jsonb; v_new jsonb;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    perform public.write_audit(new.org_id, 'announcement.created', 'announcement', new.id, null,
      (select jsonb_object_agg(k, v_new -> k) from unnest(v_fields) k));
    return new;
  end if;
  if tg_op = 'DELETE' then
    -- The org itself is being deleted: nothing to attach the row to (0008's escape, as 0181 does).
    if not exists (select 1 from public.orgs o where o.id = old.org_id) then
      return old;
    end if;
    v_old := to_jsonb(old);
    perform public.write_audit(old.org_id, 'announcement.deleted', 'announcement', old.id,
      (select jsonb_object_agg(k, v_old -> k) from unnest(v_fields) k), null);
    return old;
  end if;
  v_old := to_jsonb(old); v_new := to_jsonb(new);
  if exists (select 1 from unnest(v_fields) k where v_old -> k is distinct from v_new -> k) then
    perform public.write_audit(new.org_id, 'announcement.changed', 'announcement', new.id,
      (select jsonb_object_agg(k, v_old -> k) from unnest(v_fields) k where v_old -> k is distinct from v_new -> k),
      (select jsonb_object_agg(k, v_new -> k) from unnest(v_fields) k where v_old -> k is distinct from v_new -> k));
  end if;
  return new;
end $$;
revoke execute on function public.feed_announcements_audit() from public, anon, authenticated;

drop trigger if exists feed_announcements_audit on public.feed_announcements;
create trigger feed_announcements_audit
  after insert or update or delete on public.feed_announcements
  for each row execute function public.feed_announcements_audit();
