-- 0224 · wave 30 — the approved email design (DEC-289; REQ-NTF-018, REQ-NTF-019, REQ-EVT-017, REQ-LDR-009).
--
-- Additive, because `main` runs on it first: no column dropped or renamed, every changed function keeps its name and
-- its arguments. `main`'s worker on this schema: it renders the new keys with its OLD package — which has no design
-- for them and dead-letters one job each, logged, nothing else moves — until Railway redeploys from `main`.
--
--   1. The matrix: `MSG-rsvp_confirmed` and `MSG-check_in_confirmed` gain email; two new keys,
--      `MSG-session_comment` (social) and `MSG-leaderboard_weekly` (recognition), both optional, in-app and email.
--   2. The bindings each designed message may name — so an admin who duplicates a design can save it.
--   3. `comments_notify()`: every comment on a session tells its accepted presenters (not its author, not anyone
--      already told by the reply or the mention). REQ-EVT-017.
--   4. `check_ins_notify()`: a member's FIRST active check-in on a session sends `MSG-check_in_confirmed`.
--   5. `org_week()`: Sunday to Saturday in the org's zone (amends DEC-217 §3.4). The digest goes out at Sunday 08:00.
--   6. `leaderboard_weekly_digests` + `send_weekly_leaderboard_digests()`: the week's close, once per org per week.
--   7. `email_facts()`: what a designed mail draws, read by the worker.
--   8. The unsubscribe: a per-org secret no client role can read, a token the worker asks for, and one function an
--      anonymous request may call with a token — the HMAC is checked in the database (REQ-NTF-019).
--   9. The poster's 16:9 render reaches a mail client: `export_is_public_card()` admits the `landscape` PNG of a
--      card-eligible session beside `og`, and `session_wide_poster_path()` names it.
--
-- 03 §8.2 rows this proves (tests/rls/email-redesign.test.ts):
--   RPC-org_week.sunday                      — the week starts Sunday 00:00 in the org's zone, ends before the next
--   TRG-comments_notify.presenters           — a comment tells each accepted presenter but its author, once
--   TRG-check_ins_notify.first               — the first check-in sends MSG-check_in_confirmed; a second day does not
--   RPC-send_weekly_leaderboard_digests.once — a second run in the same week sends nothing
--   TBL-leaderboard_weekly_digests.rls       — staff of the org read it; members and another org do not; nobody writes
--   TBL-email_unsubscribe_secrets.closed     — no client role selects, inserts, updates or deletes
--   RPC-apply_email_unsubscribe.token        — a valid token switches the category's email off; a forged one does not
--   RPC-email_facts.service_only             — anon and authenticated cannot execute it
--   POL-storage.exports.public_card.landscape — anon reads a published session's landscape PNG, never a draft's

-- ── 1 · the matrix ────────────────────────────────────────────────────────────────────────────────────────────────

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
    ('MSG-reminder_generic',      'reminders',    true,  true,  true ),
    ('MSG-rsvp_nudge',            'new_sessions', true,  false, true ),
    -- 08 §1.3 RSVP — ★ 0224 (DEC-289): a reservation is mailed, as the design's ticket
    ('MSG-rsvp_confirmed',        'my_sessions',  true,  true,  true ),
    ('MSG-rsvp_waitlisted',       'my_sessions',  true,  false, true ),
    ('MSG-rsvp_promoted',         'my_sessions',  true,  true,  false),
    ('MSG-rsvp_deadline_soon',    'my_sessions',  true,  false, true ),
    ('MSG-priority_window',       'new_sessions', true,  false, true ),
    -- 08 §1.4 during and after — ★ 0224 (DEC-289 §3): check-in confirmed is mailed, with no points figure
    ('MSG-check_in_confirmed',    'my_sessions',  true,  true,  true ),
    ('MSG-rating_prompt',         'ratings',      true,  true,  true ),
    ('MSG-materials_added',       'my_sessions',  true,  true,  true ),
    ('MSG-comment_reply',         'social',       true,  true,  true ),
    ('MSG-mentioned',             'social',       true,  true,  true ),
    -- ★ 0224 (REQ-EVT-017): every comment on a session a member presents
    ('MSG-session_comment',       'social',       true,  true,  true ),
    ('MSG-photo_hidden',          'moderation',   true,  false, false),
    ('MSG-content_removed',       'moderation',   true,  false, false),
    ('MSG-report_filed',          'admin_queue',  true,  false, true ),
    -- 08 §1.5 recognition and certificates
    ('MSG-badge_earned',          'recognition',  true,  true,  true ),
    ('MSG-level_reached',         'recognition',  true,  true,  true ),
    ('MSG-streak_completed',      'recognition',  true,  false, true ),
    ('MSG-points_adjusted',       'recognition',  true,  false, false),
    ('MSG-leaderboard_closed',    'recognition',  true,  false, true ),
    -- ★ 0224 (REQ-LDR-009): the week's close, Sunday 08:00 in the org's zone
    ('MSG-leaderboard_weekly',    'recognition',  true,  true,  true ),
    ('MSG-certificate_issued',    'certificates', true,  true,  false),
    ('MSG-certificate_revoked',   'certificates', true,  true,  false),
    -- 08 §1.6 account
    ('MSG-role_changed',          'account',      true,  true,  false),
    ('MSG-account_deactivated',   'account',      false, true,  false),
    ('MSG-calendar_disconnected', 'account',      true,  false, false),
    ('MSG-export_ready',          'account',      true,  true,  false),
    -- 08 §1.6a photos (0156, DEC-182)
    ('MSG-photo_album_ready',     'admin_queue',  true,  false, true ),
    -- 0213 (REQ-ADM-025, DEC-267)
    ('MSG-announcement_published', 'announcements', true, true,  true )
$function$;

-- ── 2 · the bindings ──────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notification_bindings()
 RETURNS TABLE(key text, binding text)
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  -- The three `render.ts` resolves for every message whatever the payload holds.
  select m.key, u.binding
    from public.notification_matrix() m
    cross join (values ('member.name'), ('member.email'), ('org')) as u(binding)
   where m.email
  union all
  -- ★ 0224 (DEC-289): what the worker adds to every designed message — the host company in the header — and the
  -- links `designLinks()` builds from the session id.
  select m.key, u.binding
    from public.notification_matrix() m
    cross join (values ('company')) as u(binding)
   where m.email
  union all
  select v.key, b.binding
    from (values
      -- 08 §1.1 proposals — 0039's proposals_notify()
      ('MSG-proposal_submitted',  array['proposal_id', 'title', 'proposer', 'category', 'url']),
      ('MSG-proposal_approved',   array['proposal_id', 'title', 'reason', 'url']),
      ('MSG-proposal_rejected',   array['proposal_id', 'title', 'reason', 'url']),
      ('MSG-proposal_changes',    array['proposal_id', 'title', 'reason', 'url']),
      ('MSG-copresenter_invited', array['proposal_id', 'title', 'inviter', 'url']),
      -- 08 §1.2 sessions — and ★ 0224: the new-session design's facts
      ('MSG-session_published',   array['session_id', 'title', 'startsAt', 'venue', 'url',
                                        'type', 'date_day', 'date_month', 'weekday', 'time', 'presenter',
                                        'presenter_initials', 'seats_left', 'seats_taken_pct', 'poster_url']),
      ('MSG-announcement_published', array['announcement_id', 'body', 'url']),
      ('MSG-presenter_assigned',  array['session_id', 'title', 'startsAt', 'venue', 'url']),
      ('MSG-session_changed',     array['session_id', 'title', 'startsAt', 'venue', 'changes', 'url']),
      ('MSG-session_cancelled',   array['session_id', 'title', 'startsAt', 'reason', 'url']),
      -- 08 §1.3 RSVP — 0034's rsvps_notify(); ★ 0224: the ticket's facts
      ('MSG-rsvp_promoted',       array['session_id', 'rsvp_id', 'title', 'startsAt', 'venue', 'url']),
      ('MSG-rsvp_confirmed',      array['session_id', 'rsvp_id', 'title', 'startsAt', 'venue', 'url',
                                        'date_day', 'date_month', 'weekday', 'time', 'first_name', 'full_name',
                                        'ticket_ref', 'points_on_attend', 'going_count', 'calendar_url', 'cancel_url']),
      -- 08 §1.2 reminders — 0110; ★ 0224: the reminder design's facts
      ('MSG-reminder_7d',         array['session_id', 'title', 'startsAt', 'venue', 'offset_minutes', 'dayPosition', 'dayCount', 'day', 'tasks', 'url',
                                        'date_day', 'date_month', 'weekday', 'time', 'presenter', 'ticket_ref', 'directions_url', 'cancel_url']),
      ('MSG-reminder_1d',         array['session_id', 'title', 'startsAt', 'venue', 'offset_minutes', 'dayPosition', 'dayCount', 'day', 'tasks', 'url',
                                        'date_day', 'date_month', 'weekday', 'time', 'presenter', 'ticket_ref', 'directions_url', 'cancel_url']),
      ('MSG-reminder_2h',         array['session_id', 'title', 'startsAt', 'venue', 'offset_minutes', 'dayPosition', 'dayCount', 'day', 'url',
                                        'date_day', 'date_month', 'weekday', 'time', 'presenter', 'ticket_ref', 'directions_url', 'cancel_url']),
      ('MSG-reminder_generic',    array['session_id', 'title', 'startsAt', 'venue', 'offset_minutes', 'dayPosition', 'dayCount', 'day', 'tasks', 'url',
                                        'date_day', 'date_month', 'weekday', 'time', 'presenter', 'ticket_ref', 'directions_url', 'cancel_url']),
      -- 08 §1.4 during and after — ★ 0224: check-in, and the activity design's facts
      ('MSG-check_in_confirmed',  array['session_id', 'title', 'url', 'rate_url', 'full_name', 'first_name',
                                        'serial', 'kind', 'certificate_url']),
      ('MSG-rating_prompt',       array['session_id', 'title', 'url']),
      ('MSG-materials_added',     array['session_id', 'title', 'url']),
      ('MSG-comment_reply',       array['session_id', 'comment_id', 'title', 'author', 'url',
                                        'actor', 'ago', 'comment', 'comment_short', 'likes', 'comments']),
      ('MSG-session_comment',     array['session_id', 'comment_id', 'title', 'url',
                                        'actor', 'ago', 'comment', 'comment_short', 'likes', 'comments']),
      ('MSG-mentioned',           array['session_id', 'comment_id', 'title', 'name', 'url']),
      -- 08 §1.5 recognition and certificates — ★ 0224: the week's close
      ('MSG-badge_earned',        array['badge', 'url']),
      ('MSG-level_reached',       array['level', 'url']),
      ('MSG-leaderboard_weekly',  array['week_label', 'rank', 'rank_change', 'points', 'attended', 'presented',
                                        'interactions', 'url']),
      ('MSG-certificate_issued',  array['certificate_id', 'serial', 'kind', 'title', 'url']),
      ('MSG-certificate_revoked', array['serial', 'reason']),
      -- 08 §1.6 account
      ('MSG-role_changed',        array['role']),
      ('MSG-account_deactivated', array['reason']),
      ('MSG-export_ready',        array['url'])
    ) as v(key, bindings)
    cross join lateral unnest(v.bindings) as b(binding)
$function$;

-- ── 3 · a comment tells the session's presenters (REQ-EVT-017) ────────────────────────────────────────────────────

create or replace function public.comments_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s        public.sessions;
  parent   public.comments;
  author   public.members;
  target   uuid;
  notified uuid[] := array[]::uuid[];
begin
  select * into s from public.sessions where id = new.session_id;
  select * into author from public.members where id = new.author_id;

  if new.parent_id is not null then
    select * into parent from public.comments where id = new.parent_id;
    if found and parent.author_id <> new.author_id then
      perform public.notify(
        new.org_id, parent.author_id, 'social',
        jsonb_build_object(
          'session_id', new.session_id,
          'title',      s.title,
          'comment_id', new.id,
          'author',     coalesce(author.display_name, '')),
        'MSG-comment_reply');
      notified := notified || parent.author_id;
    end if;
  end if;

  foreach target in array coalesce(new.mentions, array[]::uuid[]) loop
    if target = new.author_id or target = any(notified) then
      continue;
    end if;
    if not exists (select 1 from public.members m where m.id = target and m.org_id = new.org_id) then
      continue;
    end if;
    perform public.notify(
      new.org_id, target, 'social',
      jsonb_build_object(
        'session_id', new.session_id,
        'title',      s.title,
        'comment_id', new.id,
        'name',       coalesce(author.display_name, '')),
      'MSG-mentioned');
    notified := notified || target;
  end loop;

  -- ★ 0224 (REQ-EVT-017, DEC-289): every comment on a session tells its ACCEPTED presenters — but never the author,
  -- and never someone the reply or the mention above already told about this very comment (one comment, one
  -- message). A presenter whose own comment was replied to gets the reply, as before.
  for target in
    select sp.member_id
      from public.session_presenters sp
     where sp.session_id = new.session_id
       and sp.accepted
       and sp.member_id <> new.author_id
  loop
    if target = any(notified) then
      continue;
    end if;
    perform public.notify(
      new.org_id, target, 'social',
      jsonb_build_object(
        'session_id', new.session_id,
        'title',      s.title,
        'comment_id', new.id),
      'MSG-session_comment');
    notified := notified || target;
  end loop;

  return new;
end $$;

-- ── 4 · check-in confirmed, once per member per session ───────────────────────────────────────────────────────────

-- ★ The member's FIRST check-in on a session — a second day of a workshop is not news, and a check-in an admin
-- removed and the member re-did is not either: `exists` looks at any earlier row, removed or not. Points are NOT named
-- (DEC-289 §3): they arrive at completion (REQ-PTS-015).
create function public.check_ins_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_title text;
begin
  if new.removed_at is not null then
    return null;
  end if;
  if exists (
    select 1 from public.check_ins c
     where c.session_id = new.session_id and c.member_id = new.member_id and c.id <> new.id
  ) then
    return null;
  end if;
  select s.title into v_title from public.sessions s where s.id = new.session_id;
  perform public.notify(
    new.org_id, new.member_id, 'my_sessions',
    jsonb_build_object('session_id', new.session_id, 'title', v_title, 'check_in_id', new.id),
    'MSG-check_in_confirmed');
  return null;
end $$;
revoke execute on function public.check_ins_notify() from public, anon, authenticated;

create trigger check_ins_notify
  after insert on public.check_ins
  for each row execute function public.check_ins_notify();

-- ── 5 · the week: Sunday to Saturday (amends DEC-217 §3.4) ────────────────────────────────────────────────────────

create or replace function public.org_week(p_at timestamptz default now())
returns table (week_start date, week_end date, starts_at timestamptz, ends_at timestamptz, time_zone text)
language sql stable security invoker set search_path = '' as $$
  with tz as (
    select coalesce(
             (select s.time_zone from public.org_settings s where s.org_id = public.auth_org_id()),
             'Asia/Riyadh'
           ) as name
  ), w as (
    -- extract(dow): Sunday 0 … Saturday 6, so the days since the last Sunday are dow.
    select tz.name, d.today - extract(dow from d.today)::int as start_day
      from tz, lateral (select (p_at at time zone tz.name)::date as today) d
  )
  select w.start_day,
         w.start_day + 6,
         w.start_day::timestamp at time zone w.name,
         (w.start_day + 7)::timestamp at time zone w.name,
         w.name
    from w
$$;

-- ── 6 · the week's close (REQ-LDR-009) ────────────────────────────────────────────────────────────────────────────

create table public.leaderboard_weekly_digests (
  org_id      uuid not null references public.orgs(id) on delete cascade,
  week_start  date not null,
  sent_at     timestamptz not null default now(),
  recipients  int not null default 0 check (recipients >= 0),
  primary key (org_id, week_start)
);

alter table public.leaderboard_weekly_digests enable row level security;
revoke all on public.leaderboard_weekly_digests from anon, authenticated, service_role;
create policy "leaderboard_weekly_digests_read_staff" on public.leaderboard_weekly_digests for select to authenticated
  using (org_id = public.auth_org_id() and public.is_staff());
grant select on public.leaderboard_weekly_digests to authenticated;
comment on table public.leaderboard_weekly_digests is
  'REQ-LDR-009 (DEC-289): one row per org per closed week — the guard that sends the weekly mail once. Written only by send_weekly_leaderboard_digests().';

-- One window's standings for one org: active members who earned net points and did not opt out (REQ-LDR-008).
create function public.weekly_standings(p_org uuid, p_from timestamptz, p_to timestamptz)
returns table (member_id uuid, rank bigint, points int)
language sql stable security definer set search_path = '' as $$
  with totals as (
    select pl.member_id, sum(pl.amount)::int as total
      from public.points_ledger pl
     where pl.org_id = p_org and pl.occurred_at >= p_from and pl.occurred_at < p_to
     group by pl.member_id
    having sum(pl.amount) > 0
  )
  select t.member_id, rank() over (order by t.total desc), t.total
    from totals t
    join public.members m on m.id = t.member_id
   where m.status = 'active' and not m.leaderboard_opt_out
$$;
revoke execute on function public.weekly_standings(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.weekly_standings(uuid, timestamptz, timestamptz) to service_role;

-- ★ Run hourly by the worker. For each active org, once the org's clock has passed Sunday 08:00, the week that ended
-- before it (Sunday 00:00 → Sunday 00:00) is closed ONCE: the guard row is inserted first, so a second run, a
-- retry or two workers at once send nothing more. A worker down on Sunday catches up later in the week.
create function public.send_weekly_leaderboard_digests() returns int
language plpgsql security definer set search_path = '' as $$
declare
  o        record;
  r        record;
  v_local  timestamp;
  v_sunday date;
  v_from   timestamptz;
  v_to     timestamptz;
  v_prev   timestamptz;
  v_top    jsonb;
  v_n      int;
  v_total  int := 0;
begin
  for o in
    select og.id, coalesce(os.time_zone, 'Asia/Riyadh') as tz
      from public.orgs og left join public.org_settings os on os.org_id = og.id
     where og.status = 'active'
  loop
    v_local  := now() at time zone o.tz;
    v_sunday := v_local::date - extract(dow from v_local)::int;
    if v_local < v_sunday + time '08:00' then
      continue;
    end if;
    insert into public.leaderboard_weekly_digests (org_id, week_start) values (o.id, v_sunday - 7)
      on conflict do nothing;
    if not found then
      continue;
    end if;
    v_from := (v_sunday - 7)::timestamp at time zone o.tz;
    v_to   := v_sunday::timestamp at time zone o.tz;
    v_prev := (v_sunday - 14)::timestamp at time zone o.tz;

    select coalesce(jsonb_agg(jsonb_build_object('rank', x.rank, 'name', x.display_name, 'team', x.team_color, 'points', x.points)
                              order by x.rank, x.display_name), '[]'::jsonb)
      into v_top
      from (
        select st.rank, st.points, m.display_name, c.team_color
          from public.weekly_standings(o.id, v_from, v_to) st
          join public.members m on m.id = st.member_id
          left join public.companies c on c.id = m.company_id
         order by st.rank, m.display_name
         limit 3
      ) x;

    v_n := 0;
    for r in
      with cur as (select * from public.weekly_standings(o.id, v_from, v_to)),
           prev as (select * from public.weekly_standings(o.id, v_prev, v_from))
      select cur.member_id, cur.rank, cur.points, prev.rank as prev_rank, m.display_name, c.team_color
        from cur
        join public.members m on m.id = cur.member_id
        left join prev on prev.member_id = cur.member_id
        left join public.companies c on c.id = m.company_id
    loop
      perform public.notify(
        o.id, r.member_id, 'recognition',
        jsonb_build_object(
          'week_start',   v_sunday - 7,
          'week_end',     v_sunday - 1,
          'rank',         r.rank,
          'rank_delta',   case when r.prev_rank is null then null else r.prev_rank - r.rank end,
          'points',       r.points,
          'attended',     (select count(*) from public.check_ins ci
                            where ci.org_id = o.id and ci.member_id = r.member_id and ci.removed_at is null
                              and ci.arrived_at >= v_from and ci.arrived_at < v_to),
          'presented',    (select count(*) from public.session_presenters sp join public.sessions s on s.id = sp.session_id
                            where sp.org_id = o.id and sp.member_id = r.member_id and sp.accepted
                              and s.state = 'completed' and s.ends_at >= v_from and s.ends_at < v_to),
          'interactions', (select count(*) from public.comments cm
                            where cm.org_id = o.id and cm.author_id = r.member_id and cm.deleted_at is null
                              and cm.created_at >= v_from and cm.created_at < v_to)
                        + (select count(*) from public.reactions re
                            where re.org_id = o.id and re.member_id = r.member_id
                              and re.created_at >= v_from and re.created_at < v_to),
          'top',          v_top,
          'me',           jsonb_build_object('rank', r.rank, 'name', r.display_name, 'team', r.team_color, 'points', r.points)),
        'MSG-leaderboard_weekly');
      v_n := v_n + 1;
    end loop;

    update public.leaderboard_weekly_digests set recipients = v_n where org_id = o.id and week_start = v_sunday - 7;
    v_total := v_total + v_n;
  end loop;
  return v_total;
end $$;
revoke execute on function public.send_weekly_leaderboard_digests() from public, anon, authenticated;
grant  execute on function public.send_weekly_leaderboard_digests() to service_role;

-- ── 7 · what a designed mail draws ────────────────────────────────────────────────────────────────────────────────

-- ★ The RAW facts; `formatFacts()` (`@kareem/mail-runtime`) makes them words in the org's zone. Every fact is read
-- here, never a literal: the seats from the confirmed reservations, the amount from the org's `check_in` rule, the
-- host company from the venue (0180). A missing fact is absent, and the design then draws one row fewer.
create function public.email_facts(p_org uuid, p_member uuid, p_key text, p_payload jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  out       jsonb := '{}'::jsonb;
  v_session uuid;
  v_comment uuid;
  s         public.sessions;
  c         public.comments;
  m         public.members;
begin
  select * into m from public.members where id = p_member and org_id = p_org;
  if found then
    out := out || jsonb_build_object('member_name', m.display_name);
  end if;

  if p_payload ->> 'session_id' ~ '^[0-9a-fA-F-]{36}$' then
    v_session := (p_payload ->> 'session_id')::uuid;
    select * into s from public.sessions where id = v_session and org_id = p_org;
    if found then
      out := out || jsonb_build_object(
        'starts_at',  s.starts_at,
        'event_type', s.event_type::text,
        'time_zone',  coalesce(s.time_zone, (select os.time_zone from public.org_settings os where os.org_id = p_org)),
        'capacity',   s.capacity,
        'going_count', (select count(*) from public.rsvps r where r.session_id = s.id and r.status = 'confirmed'),
        'presenter',  (select pm.display_name from public.session_presenters sp join public.members pm on pm.id = sp.member_id
                        where sp.session_id = s.id and sp.accepted order by sp.created_at limit 1),
        'points_on_attend', (select sr.points from public.scoring_rules sr
                              where sr.org_id = p_org and sr.action_key = 'check_in' and sr.actor = 'attendee' and sr.enabled
                              limit 1),
        'poster_wide', public.session_wide_poster_path(s.id) is not null,
        'likes',      (select count(*) from public.reactions re where re.session_id = s.id),
        'comments',   (select count(*) from public.comments cm where cm.session_id = s.id and cm.deleted_at is null));
      out := out || coalesce((
        select jsonb_build_object('venue', v.name, 'directions_url', v.map_url, 'company', co.name)
          from public.venues v left join public.companies co on co.id = v.company_id
         where v.id = s.venue_id), jsonb_build_object('venue', s.custom_venue_name));
      if p_key = 'MSG-check_in_confirmed' then
        out := out || coalesce((
          select jsonb_build_object('serial', ce.serial, 'verification_code', ce.verification_code, 'kind', ce.kind::text)
            from public.certificates ce
           where ce.member_id = p_member and ce.session_id = s.id and ce.state = 'issued'
           order by ce.issued_at desc nulls last limit 1), '{}'::jsonb);
      end if;
    end if;
  end if;

  if p_payload ->> 'comment_id' ~ '^[0-9a-fA-F-]{36}$' then
    v_comment := (p_payload ->> 'comment_id')::uuid;
    select * into c from public.comments where id = v_comment and org_id = p_org and deleted_at is null;
    if found then
      out := out || jsonb_build_object(
        'actor',      (select am.display_name from public.members am where am.id = c.author_id),
        'comment',    c.body,
        'comment_at', c.created_at);
    end if;
  end if;

  return out;
end $$;

-- The admin preview's door to the same facts (`compileEmailPreview()`, «معاينة بجلسة»): staff of the session's org
-- only, for one session, as the caller. The worker's function stays service-only.
create function public.email_preview_facts(p_session uuid, p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() or not exists (select 1 from public.sessions s where s.id = p_session and s.org_id = public.auth_org_id()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.email_facts(public.auth_org_id(), public.auth_member_id(), p_key, jsonb_build_object('session_id', p_session));
end $$;
revoke execute on function public.email_preview_facts(uuid, text) from public, anon;
grant  execute on function public.email_preview_facts(uuid, text) to authenticated;

-- ── 9 (before 7 is executed) · the poster's 16:9 render ──────────────────────────────────────────────────────────

-- The newest READY `landscape` PNG of a card-eligible session's poster — the same eligibility as the public card.
create function public.session_wide_poster_path(p_session uuid) returns text
language sql stable security definer set search_path = '' as $$
  select ea.storage_path
    from public.sessions s
    join public.orgs o on o.id = s.org_id and o.status = 'active'
    join public.session_posters sp on sp.session_id = s.id
    join public.export_artifacts ea on ea.document_id = sp.document_id
   where s.id = p_session
     and s.state in ('published', 'in_progress', 'completed')
     and ea.preset = 'landscape'
     and ea.format = 'png'
     and ea.status = 'ready'
     and ea.storage_path is not null
   order by ea.rendered_at desc nulls last
   limit 1
$$;
revoke execute on function public.session_wide_poster_path(uuid) from public;
grant  execute on function public.session_wide_poster_path(uuid) to anon, authenticated, service_role;

revoke execute on function public.email_facts(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.email_facts(uuid, uuid, text, jsonb) to service_role;

-- ★ The `landscape` render carries what the `og` card carries — the title and the date — at 16:9. A mail client
-- fetches with no session, so it is opened to `anon` exactly as `og` was (0080), for exactly the same sessions.
create or replace function public.export_is_public_card(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.export_artifacts ea
      join public.session_posters sp on sp.document_id = ea.document_id
      join public.sessions s         on s.id = sp.session_id
      join public.orgs o             on o.id = s.org_id and o.status = 'active'
     where ea.storage_path = p_name
       and ea.preset in ('og', 'landscape')
       and ea.format = 'png'
       and ea.status = 'ready'
       and s.state in ('published', 'in_progress', 'completed')
  )
$$;

-- ── 8 · the unsubscribe (REQ-NTF-019) ─────────────────────────────────────────────────────────────────────────────

-- ★ One secret per org, and NO policy and NO grant: that is its policy set (03 §5.6f's pattern). Only the two
-- definers below read it, so the token is checked where the secret lives and no key ever reaches Vercel.
create table public.email_unsubscribe_secrets (
  org_id     uuid primary key references public.orgs(id) on delete cascade,
  secret     bytea not null,
  created_at timestamptz not null default now()
);
alter table public.email_unsubscribe_secrets enable row level security;
revoke all on public.email_unsubscribe_secrets from anon, authenticated, service_role;
comment on table public.email_unsubscribe_secrets is
  'REQ-NTF-019 (DEC-289): the key the one-click unsubscribe token is signed with. No policy and no grant, deliberately — read only by email_unsubscribe_token() and apply_email_unsubscribe().';

create function public._email_unsubscribe_secret(p_org uuid) returns bytea
language plpgsql volatile security definer set search_path = '' as $$
declare v bytea;
begin
  select e.secret into v from public.email_unsubscribe_secrets e where e.org_id = p_org;
  if v is null then
    insert into public.email_unsubscribe_secrets (org_id, secret)
    values (p_org, extensions.digest(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'sha256'))
    on conflict (org_id) do nothing;
    select e.secret into v from public.email_unsubscribe_secrets e where e.org_id = p_org;
  end if;
  return v;
end $$;
revoke execute on function public._email_unsubscribe_secret(uuid) from public, anon, authenticated, service_role;

-- `<member uuid>.<category>.<hex hmac>` — names who and what, and proves the platform wrote it. It does not expire:
-- a message read a month later must still be able to stop the next one (RFC 8058).
create function public.email_unsubscribe_token(p_org uuid, p_member uuid, p_category text) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.members m where m.id = p_member and m.org_id = p_org) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return p_member::text || '.' || p_category || '.' ||
         encode(extensions.hmac(convert_to(p_member::text || ':' || p_category, 'utf8'), public._email_unsubscribe_secret(p_org), 'sha256'), 'hex');
end $$;
revoke execute on function public.email_unsubscribe_token(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.email_unsubscribe_token(uuid, uuid, text) to service_role;

-- ★ The one function an anonymous request may call. It trusts nothing but the token: the member is read from it,
-- their org from the member, and the HMAC is recomputed with that org's secret. A category with no optional message
-- is refused, so a token can never switch off what 08 §1.7 says always arrives. Idempotent: applying it twice leaves
-- one row, off. Returns the category, or raises `invalid_token` for anything else — the same answer for a forged
-- token, a removed member and a malformed one.
create function public.apply_email_unsubscribe(p_token text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_parts    text[];
  v_member   public.members;
  v_category text;
  v_expected text;
begin
  v_parts := string_to_array(coalesce(p_token, ''), '.');
  if coalesce(array_length(v_parts, 1), 0) <> 3 or v_parts[1] !~ '^[0-9a-fA-F-]{36}$' or v_parts[3] !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  v_category := v_parts[2];
  select * into v_member from public.members where id = v_parts[1]::uuid;
  if not found then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  v_expected := encode(extensions.hmac(convert_to(v_member.id::text || ':' || v_category, 'utf8'),
                                       public._email_unsubscribe_secret(v_member.org_id), 'sha256'), 'hex');
  if extensions.digest(v_expected, 'sha256') <> extensions.digest(v_parts[3], 'sha256') then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  if not exists (select 1 from public.notification_matrix() x where x.category = v_category and x.optional and x.email) then
    raise exception 'invalid_token' using errcode = '22023';
  end if;

  insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
  values (v_member.org_id, v_member.id, v_category, 'email', false)
  on conflict (member_id, category, channel) do update set enabled = false, updated_at = now();
  return v_category;
end $$;
revoke execute on function public.apply_email_unsubscribe(text) from public;
grant  execute on function public.apply_email_unsubscribe(text) to anon, authenticated;
