-- sessions · wave 26, PR D (DEC-251 §4 – §5, contract 4) — what the story feed reads: the frames a member may see, the
-- recap's figures and a live day's count. Functions only; the tables, policies and grants are the lead's (0198).
--
-- Serves:  REQ-STO-002 (gone at its trigger + 24 h, for staff's ring row too) · REQ-STO-003 (the org and nobody else) ·
--          REQ-STO-004 (the live count; the recap's three stats, the rating only at or above the minimum, REQ-RAT-006) ·
--          REQ-STO-006 (seen = every visible frame viewed by me) · REQ-STO-018 (a cancelled session shows nothing)
-- Cites:   0198 (story_frames, story_views, story_frame_is_visible()) · 0010:390-403 (session_rating_aggregates is
--          staff-and-presenter only — so a member's recap needs a definer) · 0165:23 (session_attendance_count) ·
--          0087 (check_ins.removed_at) · 0004:130 (org_settings.rating_min_aggregate)

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · story_feed() — the member's view of the frames, for everyone who asks
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER: RLS is the boundary and stays it. On top of it, the member predicate — `story_frame_is_visible()`,
-- the very function the members' policy calls (DEC-251 §5) — so staff, whose policy admits every frame of their org
-- (REQ-STO-017's expired attendee frames), read the same ring row a member does. One definition, never two.
-- And the author's own processing or failed video, to its author alone (DEC-251 §4.6) — where «تعذّر» is said.
create function public.story_feed(p_now timestamptz default now())
returns table (
  frame_id       uuid,
  session_id     uuid,
  session_day_id uuid,
  kind           public.story_frame_kind,
  state          public.story_frame_state,
  triggered_at   timestamptz,
  photo_id       uuid,
  author_id      uuid,
  seen           boolean
)
language sql stable security invoker set search_path = '' as $$
  select f.id, f.session_id, f.session_day_id, f.kind, f.state, f.triggered_at, f.photo_id, f.author_id,
         exists (select 1 from public.story_views v where v.frame_id = f.id and v.member_id = public.auth_member_id())
    from public.story_frames f
   where f.org_id = public.auth_org_id()
     and (
          public.story_frame_is_visible(f, p_now)
       or (f.kind = 'video'
           and f.author_id = public.auth_member_id()
           and f.state in ('processing', 'failed')
           and f.removed_at is null
           and f.triggered_at > p_now - interval '24 hours'
           and exists (select 1 from public.sessions s where s.id = f.session_id and s.state <> 'cancelled'))
     );
$$;
revoke all on function public.story_feed(timestamptz) from public, anon;
grant execute on function public.story_feed(timestamptz) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · story_recap_figures() — attendance and the rating, never who
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- DEFINER because a member reads no rating row and `session_rating_aggregates` answers staff and presenters only. It
-- answers for a completed or archived session of the caller's org and for nothing else (no row — the same answer as
-- «no such session», so it cannot probe another tenant). The average is NULL below `rating_min_aggregate`; the count
-- and the minimum are returned so the frame can say «بعد N» (REQ-RAT-006).
create function public.story_recap_figures(p_session uuid)
returns table (attended int, rating_count int, rating_avg numeric, rating_min int)
language sql stable security definer set search_path = '' as $$
  select (select count(distinct c.member_id)::int
            from public.check_ins c
           where c.session_id = s.id and c.removed_at is null),
         r.n,
         case when r.n >= os.rating_min_aggregate then r.avg end,
         os.rating_min_aggregate
    from public.sessions s
    join public.org_settings os on os.org_id = s.org_id
    cross join lateral (
      select count(*)::int as n, round(avg(x.session_stars), 1) as avg
        from public.ratings x where x.session_id = s.id
    ) r
   where s.id = p_session
     and s.org_id = public.auth_org_id()
     and s.state in ('completed', 'archived');
$$;
revoke all on function public.story_recap_figures(uuid) from public, anon;
grant execute on function public.story_recap_figures(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · story_live_count() — «23 في القاعة»: a day's active check-ins, a number (A33 rule 3)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- DEFINER to count past `checkins_read` (a member reads their own row). At one day the day is the session, so it equals
-- session_attendance_count(). Null for another org's session or a day not of that session.
create function public.story_live_count(p_session uuid, p_day uuid)
returns int
language sql stable security definer set search_path = '' as $$
  select case
           when exists (select 1 from public.session_days d
                          join public.sessions s on s.id = d.session_id
                         where d.id = p_day and d.session_id = p_session
                           and s.org_id = public.auth_org_id() and s.state <> 'cancelled')
           then (select count(distinct c.member_id)::int
                   from public.check_ins c
                  where c.session_id = p_session and c.session_day_id = p_day and c.removed_at is null)
         end;
$$;
revoke all on function public.story_live_count(uuid, uuid) from public, anon;
grant execute on function public.story_live_count(uuid, uuid) to authenticated;
