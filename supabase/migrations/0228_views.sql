-- 0228 — views: how many saw a story frame, a post, a recap and an announcement, and who (DEC-297; REQ-VEW-001 … 006,
-- REQ-STO-010 amended). The record is one row per member per subject; reach is the number of rows, impressions their
-- `times_seen`. ★ Every write and every read of another member's row is a definer function (the functions half below,
-- from supabase/proposed/content/, promoted in this same file); a member's client reads its own rows only.
--
-- Forward-only and additive for `main`, which runs on this schema before the code that follows: `story_views` keeps
-- its insert policy and grant, so `main`'s viewer still records «seen» (the three new columns default); the new code
-- writes through `record_views()` only. The insert path is removed in a later migration, after the merge.

-- ═══ 1 · the four subjects ════════════════════════════════════════════════════

create type public.view_subject as enum ('frame', 'post', 'recap', 'announcement');

-- ═══ 2 · story_views gains the impression and the video's end ══════════════════

alter table public.story_views
  add column last_seen_at timestamptz not null default now(),
  add column times_seen   integer     not null default 1 check (times_seen >= 1),
  add column completed_at timestamptz;

-- `viewed_at` stays the first time seen and never moves.
update public.story_views set last_seen_at = viewed_at where last_seen_at <> viewed_at;

-- ═══ 3 · content_views — a post, a recap, an announcement ══════════════════════

-- A post and a recap are both a session, counted apart: the feed shows a session as a post until it ends and as a
-- recap after. Real foreign keys, so a subject's deletion (a session's hard delete, 0215; an announcement's) takes
-- its views with it.
create table public.content_views (
  org_id          uuid not null references public.orgs(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  kind            public.view_subject not null,
  session_id      uuid references public.sessions(id) on delete cascade,
  announcement_id uuid references public.feed_announcements(id) on delete cascade,
  subject_id      uuid generated always as (coalesce(session_id, announcement_id)) stored,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  times_seen      integer     not null default 1 check (times_seen >= 1),
  primary key (member_id, kind, subject_id),
  check (kind <> 'frame'),
  check ((kind in ('post', 'recap')) = (session_id is not null)),
  check ((kind = 'announcement') = (announcement_id is not null))
);

create index content_views_subject_idx on public.content_views (org_id, kind, subject_id);

alter table public.content_views enable row level security;
revoke all on public.content_views from anon, authenticated, service_role;

-- A member's own rows; nobody else's, staff included — counts and lists leave only through the definer functions.
create policy "content_views_read_own" on public.content_views for select to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());

-- No insert, update or delete policy: written only by `record_views()`.
grant select on public.content_views to authenticated;

-- ═══ 4 · the functions — promoted from supabase/proposed/content/02_views.sql ═══════════════

-- content — views: the one write and the two reads (DEC-297; REQ-VEW-001 … 004, REQ-STO-010 as amended). For the lead
-- to promote into 0228 after its tables (the `view_subject` enum, `story_views`' three columns, `content_views`).
-- notes/views.md §2 – §5 is the plan this implements.
--
-- ★ No client role writes a view row or reads another member's: `record_views()` is the only door in, and
-- `view_counts()` / `view_list()` the only doors out. Each RE-DERIVES what the caller may see from the same predicates
-- the read policies use (`story_frame_is_visible()` 0198, `sessions_read` 0215, `feed_announcements_*` 0164) — a
-- definer function bypasses RLS, so it states the policy instead of inheriting it, and tests/rls/views.test.ts holds
-- the two equal.
--
-- «Owner» (notes/views.md §4, DEC-297 §4): an attendee frame's author; for a generated frame, a post or a recap, the
-- session's accepted presenters; an announcement's author. ★ «Your own subject is not counted» is decided at READ time:
-- an owner's own look IS recorded — the story ring's «seen» reads `story_views` (`story_feed()`, 0199), and an author
-- whose own frame were never recorded would see their ring unseen for ever — but no owner's row is ever in a count or a
-- list. One rule at the reads also covers a co-presenter added later and an author's row from 0198's old policy.
--
-- And, verbatim but for the views additions (marked «0228»): `anonymise_members()` (0223's text) deletes the member's
-- views; `build_data_export_payload()` (0135's text) carries the member's own views.

-- ═══ 1 · the two predicates — internal, executed only inside the three functions below ═══════════════════════════

-- May the CALLER see this subject now? `p_read` widens it to what staff read (every frame of the org, expired too, as
-- `story_frames_staff_read`; every announcement for an admin, as `feed_announcements_admin_read`) — for the counts
-- and the list. A look at an expired frame or a draft announcement is never RECORDED as a view (`p_read = false`).
create function public.view_can_see(p_kind public.view_subject, p_id uuid, p_read boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'frame' then exists (
      select 1 from public.story_frames f
       where f.id = p_id and f.org_id = public.auth_org_id()
         and (public.story_frame_is_visible(f) or (p_read and public.is_staff())))
    when 'post' then exists (
      select 1 from public.sessions s
       where s.id = p_id and s.org_id = public.auth_org_id() and s.deleted_at is null
         and (s.state = any (array['published', 'in_progress', 'completed', 'archived', 'cancelled']::public.session_state[])
              or public.is_staff() or public.is_presenter_of(s.id)))
    when 'recap' then exists (
      select 1 from public.sessions s
       where s.id = p_id and s.org_id = public.auth_org_id() and s.deleted_at is null
         and s.state = any (array['completed', 'archived']::public.session_state[]))
    when 'announcement' then exists (
      select 1 from public.feed_announcements a
       where a.id = p_id and a.org_id = public.auth_org_id()
         and ((a.published_at <= now() and (a.expires_at is null or a.expires_at > now()))
              or (p_read and public.is_org_admin())))
    else false
  end
$$;
revoke all on function public.view_can_see(public.view_subject, uuid, boolean) from public, anon, authenticated, service_role;

-- Is p_member an owner of this subject (DEC-297 §4)? Explicit member, so the reads can exclude owners' own rows.
create function public.view_member_owns(p_kind public.view_subject, p_id uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_member is not null and case p_kind
    when 'frame' then exists (
      select 1 from public.story_frames f
       where f.id = p_id
         and (f.author_id = p_member
              or (f.author_id is null and exists (
                    select 1 from public.session_presenters sp
                     where sp.session_id = f.session_id and sp.member_id = p_member and sp.accepted))))
    when 'post' then exists (
      select 1 from public.session_presenters sp where sp.session_id = p_id and sp.member_id = p_member and sp.accepted)
    when 'recap' then exists (
      select 1 from public.session_presenters sp where sp.session_id = p_id and sp.member_id = p_member and sp.accepted)
    when 'announcement' then exists (
      select 1 from public.feed_announcements a where a.id = p_id and a.author_id = p_member)
    else false
  end
$$;
revoke all on function public.view_member_owns(public.view_subject, uuid, uuid) from public, anon, authenticated, service_role;

-- ═══ 2 · record_views() — the one write (REQ-VEW-001, 002) ════════════════════════════════════════════════════════

-- `p_views`: `[{ "kind": "frame"|"post"|"recap"|"announcement", "id": uuid, "completed": bool? }]`, at most 50 read.
-- Skips, silently: impersonation (no `member_id`, or the `impersonation` claim), an inactive or anonymised member, a
-- subject the caller may not see. (The caller's own subject IS recorded — for «seen» — and never counted: §3, §4.) Upserts one row per member per subject: first seen kept;
-- `last_seen_at` and `times_seen` move only when the last impression is over 30 s old (a retried batch is nothing);
-- `completed_at` set once, on a video frame. Returns how many entries were recorded (bumped or not).
create function public.record_views(p_views jsonb) returns integer
language plpgsql security definer set search_path = '' as $fn$
declare
  v_member uuid := public.auth_member_id();
  v_org    uuid := public.auth_org_id();
  e        record;
  n        int := 0;
begin
  if v_member is null or v_org is null
     or coalesce((auth.jwt() -> 'app_metadata') ? 'impersonation', false)
     or jsonb_typeof(p_views) is distinct from 'array' then
    return 0;
  end if;
  if not exists (select 1 from public.members m
                  where m.id = v_member and m.org_id = v_org and m.status = 'active' and m.anonymised_at is null) then
    return 0;
  end if;

  for e in
    select x.kind, x.id, bool_or(x.completed) as completed
      from (
        select (el ->> 'kind')::public.view_subject as kind,
               (el ->> 'id')::uuid as id,
               coalesce((el ->> 'completed')::boolean, false) as completed
          from jsonb_array_elements(p_views) with ordinality as t(el, i)
         where i <= 50
      ) x
     group by x.kind, x.id
  loop
    continue when not public.view_can_see(e.kind, e.id, false);

    if e.kind = 'frame' then
      insert into public.story_views as v (org_id, member_id, frame_id, viewed_at, last_seen_at, times_seen, completed_at)
      values (v_org, v_member, e.id, now(), now(), 1,
              case when e.completed and exists (select 1 from public.story_frames f where f.id = e.id and f.kind = 'video')
                   then now() end)
      on conflict (member_id, frame_id) do update
         set times_seen   = v.times_seen + case when v.last_seen_at < now() - interval '30 seconds' then 1 else 0 end,
             last_seen_at = case when v.last_seen_at < now() - interval '30 seconds' then now() else v.last_seen_at end,
             completed_at = coalesce(v.completed_at, excluded.completed_at);
    else
      insert into public.content_views as v (org_id, member_id, kind, session_id, announcement_id, first_seen_at, last_seen_at, times_seen)
      values (v_org, v_member, e.kind,
              case when e.kind in ('post', 'recap') then e.id end,
              case when e.kind = 'announcement' then e.id end,
              now(), now(), 1)
      on conflict (member_id, kind, subject_id) do update
         set times_seen   = v.times_seen + case when v.last_seen_at < now() - interval '30 seconds' then 1 else 0 end,
             last_seen_at = case when v.last_seen_at < now() - interval '30 seconds' then now() else v.last_seen_at end;
    end if;
    n := n + 1;
  end loop;
  return n;
end $fn$;
revoke all on function public.record_views(jsonb) from public, anon, service_role;
grant execute on function public.record_views(jsonb) to authenticated;

-- ═══ 3 · view_counts() — reach for many subjects at once (REQ-VEW-003) ════════════════════════════════════════════

-- One row per subject the caller may see that at least one other member viewed (never a row at 0). Owners' own rows
-- and anonymised members are not counted. `can_list`: the caller is staff or an owner (REQ-VEW-004). At most 500 ids.
create function public.view_counts(p_kind public.view_subject, p_ids uuid[])
returns table (subject_id uuid, viewers integer, can_list boolean)
language sql stable security definer set search_path = '' as $$
  with ids as (
    select distinct u.id from unnest(coalesce(p_ids, '{}')) with ordinality as u(id, i) where u.i <= 500
  ),
  seen as (
    select ids.id from ids where public.view_can_see(p_kind, ids.id, true)
  ),
  rows as (
    select sv.frame_id as sid, sv.member_id from public.story_views sv
     where p_kind = 'frame' and sv.frame_id in (select id from seen)
    union all
    select cv.subject_id, cv.member_id from public.content_views cv
     where p_kind <> 'frame' and cv.kind = p_kind and cv.org_id = public.auth_org_id() and cv.subject_id in (select id from seen)
  )
  select r.sid, count(distinct r.member_id)::int,
         public.is_staff() or public.view_member_owns(p_kind, r.sid, public.auth_member_id())
    from rows r
    join public.members m on m.id = r.member_id and m.anonymised_at is null
   where not public.view_member_owns(p_kind, r.sid, r.member_id)
   group by r.sid
$$;
revoke all on function public.view_counts(public.view_subject, uuid[]) from public, anon, service_role;
grant execute on function public.view_counts(public.view_subject, uuid[]) to authenticated;

-- ═══ 4 · view_list() — who viewed, to the owners and staff (REQ-VEW-004) ══════════════════════════════════════════

-- Refused (42501) unless the caller may see the subject AND is staff or an owner. Name and avatar inputs only, and the
-- DAY of the last impression on the org's calendar — no time finer than the day leaves the database. Newest first;
-- `total` is the whole reach, before the limit (≤ 200).
create function public.view_list(p_kind public.view_subject, p_id uuid, p_limit integer default 200)
returns table (member_id uuid, display_name text, avatar_key text, avatar_version bigint, seen_on date, total integer)
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_tz text;
begin
  if not public.view_can_see(p_kind, p_id, true)
     or not (public.is_staff() or public.view_member_owns(p_kind, p_id, public.auth_member_id())) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select coalesce(max(os.time_zone), 'Asia/Riyadh') into v_tz from public.org_settings os where os.org_id = public.auth_org_id();

  return query
    select m.id, m.display_name, m.avatar_key, m.avatar_version,
           (r.last_seen_at at time zone v_tz)::date,
           (count(*) over ())::int
      from (
        select sv.member_id, sv.last_seen_at from public.story_views sv where p_kind = 'frame' and sv.frame_id = p_id
        union all
        select cv.member_id, cv.last_seen_at from public.content_views cv
         where p_kind <> 'frame' and cv.kind = p_kind and cv.subject_id = p_id and cv.org_id = public.auth_org_id()
      ) r
      join public.members m on m.id = r.member_id and m.anonymised_at is null
     where not public.view_member_owns(p_kind, p_id, r.member_id)
     order by r.last_seen_at desc, m.id
     limit least(greatest(coalesce(p_limit, 200), 1), 200);
end $fn$;
revoke all on function public.view_list(public.view_subject, uuid, integer) from public, anon, service_role;
grant execute on function public.view_list(public.view_subject, uuid, integer) to authenticated;

-- ═══ 5 · anonymise_members() — 0223's text; «0228» adds the two deletes ══════════════════════════════════════════

create or replace function public.anonymise_members() returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_days    int;
  m         record;
  n         int := 0;
  v_upload  boolean;
begin
  select days into v_days from public.retention_periods where data_class = 'deactivated_members';
  if v_days is null then
    raise exception 'retention_period_missing: deactivated_members' using errcode = '22023';
  end if;

  for m in
    select id, org_id, email, avatar_import, avatar_version from public.members
     where status = 'deactivated'
       and anonymised_at is null
       and deactivated_at < now() - make_interval(days => v_days)
  loop
    update public.members
       set display_name = null,
           -- The address must stay UNIQUE per org (0004's `unique (org_id, email)`)
           -- and must no longer be a person's. The member's own id is the one
           -- value guaranteed unique and already stored in the ledger.
           email          = ('anon+' || id::text || '@invalid.local')::extensions.citext,
           avatar_url     = null,
           avatar_import  = null,
           avatar_version = null,
           job_title      = null,
           bio            = null,
           company_id     = null,
           anonymised_at  = now()
     where id = m.id;

    -- Interests are a personal profile, not content anyone depends on.
    delete from public.member_interests where member_id = m.id;

    -- wave 16 (0162, DEC-197): what the member had seen is a copy of source data
    -- that no one else reads; it goes with the person.
    delete from public.member_seen_marks where member_id = m.id;

    -- 0228 (DEC-297, REQ-VEW-004): what the member viewed goes with the person — out of every list and every count.
    delete from public.story_views where member_id = m.id;
    delete from public.content_views where member_id = m.id;

    -- wave 29 (DEC-280): the upload bookkeeping goes with the person; the staged bytes with the job below.
    delete from public.avatar_uploads where member_id = m.id;
    v_upload := found;

    -- REQ-PRF-011: «no storage object remains». The job deletes everything under
    -- the member's `avatars` and `avatar-staging` prefixes.
    if m.avatar_import = 'accepted' or m.avatar_version is not null or v_upload then
      perform public.enqueue_avatar_reconcile(m.id);
    end if;

    perform public.write_audit(m.org_id, 'member.anonymised', 'member', m.id,
                               jsonb_build_object('had_email', true),
                               jsonb_build_object('anonymised', true),
                               'retention', 'system', null);
    n := n + 1;
  end loop;
  return jsonb_build_object('anonymised', n, 'after_days', v_days);
end $fn$;

-- ═══ 6 · build_data_export_payload() — 0135's text; «0228» adds `views` ══════════════════════════════════════════

create or replace function public.build_data_export_payload(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare m public.members;
begin
  select * into m from public.members where id = p_member;
  if m.id is null then
    raise exception 'member_not_found' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'member', jsonb_build_object(
      'id', m.id, 'email', m.email, 'display_name', m.display_name,
      'job_title', m.job_title, 'bio', m.bio, 'org_role', m.org_role,
      'status', m.status, 'created_at', m.created_at
    ),
    'org', (select jsonb_build_object('name', o.name, 'slug', o.slug) from public.orgs o where o.id = m.org_id),
    'interests', (
      select coalesce(jsonb_agg(c.name order by c.name), '[]'::jsonb)
        from public.member_interests i join public.categories c on c.id = i.category_id
       where i.member_id = m.id
    ),
    'rsvps', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'starts_at', s.starts_at, 'status', r.status, 'reserved_at', r.reserved_at
             ) order by r.reserved_at), '[]'::jsonb)
        from public.rsvps r join public.sessions s on s.id = r.session_id
       where r.member_id = m.id
    ),
    'check_ins', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'arrived_at', ci.arrived_at, 'method', ci.method,
               'removed_at', ci.removed_at, 'removal_reason', ci.removal_reason
             ) order by ci.arrived_at), '[]'::jsonb)
        from public.check_ins ci join public.sessions s on s.id = ci.session_id
       where ci.member_id = m.id
    ),
    'comments', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'body', c.body, 'created_at', c.created_at,
               'in_reply_to', (
                 select pm.display_name from public.comments pc
                   join public.members pm on pm.id = pc.author_id
                  where pc.id = c.parent_id
               )
             ) order by c.created_at), '[]'::jsonb)
        from public.comments c join public.sessions s on s.id = c.session_id
       where c.author_id = m.id and c.deleted_at is null
    ),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'storage_path', p.storage_path, 'created_at', p.created_at
             ) order by p.created_at), '[]'::jsonb)
        from public.photos p join public.sessions s on s.id = p.session_id
       where p.uploader_id = m.id
    ),
    'ratings_given', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'session_stars', r.session_stars, 'presenter_stars', r.presenter_stars,
               'comment', r.comment, 'submitted_at', r.submitted_at
             ) order by r.submitted_at), '[]'::jsonb)
        from public.ratings r join public.sessions s on s.id = r.session_id
       where r.member_id = m.id
    ),
    'points_ledger', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'amount', l.amount, 'source', l.source, 'reason', l.reason, 'occurred_at', l.occurred_at
             ) order by l.occurred_at), '[]'::jsonb)
        from public.points_ledger l where l.member_id = m.id
    ),
    'certificates', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'serial', c.serial, 'kind', c.kind, 'state', c.state, 'issued_at', c.issued_at
             ) order by c.issued_at), '[]'::jsonb)
        from public.certificates c where c.member_id = m.id
    ),
    -- ★ 0135. The member took part; WHAT they answered is not theirs to get
    -- back, because it is not anyone's to find (DEC-160 §3). No instant, and
    -- ordered by title — never by insertion, which would be one.
    'surveys_answered', (
      select coalesce(jsonb_agg(jsonb_build_object('session', s.title) order by s.title, s.id), '[]'::jsonb)
        from public.survey_participations sp
        join public.surveys sv on sv.id = sp.survey_id
        join public.sessions s on s.id = sv.session_id
       where sp.member_id = m.id
    ),
    -- ★ 0228 (DEC-297, REQ-VEW-002). What the member viewed — their OWN records, theirs in full. Never who viewed
    -- the member's own subjects: that is other members' data.
    'views', (
      select coalesce(jsonb_agg(v.row order by v.first_seen, v.kind, v.subject), '[]'::jsonb)
        from (
          select sv.viewed_at as first_seen, 'frame'::text as kind, sv.frame_id as subject,
                 jsonb_build_object('kind', 'frame', 'subject_id', sv.frame_id,
                                    'session', (select s.title from public.story_frames f join public.sessions s on s.id = f.session_id where f.id = sv.frame_id),
                                    'first_seen', sv.viewed_at, 'last_seen', sv.last_seen_at, 'times_seen', sv.times_seen,
                                    'completed', sv.completed_at is not null) as row
            from public.story_views sv where sv.member_id = m.id
          union all
          select cv.first_seen_at, cv.kind::text, cv.subject_id,
                 jsonb_build_object('kind', cv.kind, 'subject_id', cv.subject_id,
                                    'session', (select s.title from public.sessions s where s.id = cv.session_id),
                                    'announcement', (select left(a.body, 140) from public.feed_announcements a where a.id = cv.announcement_id),
                                    'first_seen', cv.first_seen_at, 'last_seen', cv.last_seen_at, 'times_seen', cv.times_seen)
            from public.content_views cv where cv.member_id = m.id
        ) v
    )
  );
end $fn$;
