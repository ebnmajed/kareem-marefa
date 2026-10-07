-- 0219 · DEC-278 — the owner's ruling: a member who RESERVED a session, its presenters and staff may add to its story,
-- as well as a member who checked in, from 24 hours BEFORE its start until 24 hours after its end.
--
-- Serves:  01 §25 REQ-STO-011 · DEC-278
-- Cites:   0199 (story_capture_open, story_media_write, initiate_story_photo, begin_story_video — every door reads this
--          one function, so widening it widens them together) · 0037 (photos_storage_write — the album's PUT) · 0087
--          (has_checked_in) · 0010 (is_presenter_of, rsvps) · 0212 (is_staff)
--
-- ★ ONE GATE, STILL. Nothing else changes shape: the story photo still rides the album's job and the video its own;
-- moderation, expiry and the report-hides-at-once rule are untouched.
-- ★ ONLY A STORY: a session's story begins at publication (REQ-STO-001), so a draft or a session in review is never
-- open, nor a cancelled one (REQ-STO-018).

create or replace function public.story_capture_open(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (public.has_checked_in(s.id)
            or public.is_presenter_of(s.id)
            or public.is_staff()
            or exists (select 1 from public.rsvps r
                        where r.session_id = s.id
                          and r.member_id = public.auth_member_id()
                          and r.status = 'confirmed'))
           and s.state in ('published', 'in_progress', 'completed', 'archived')
           and now() >= min(d.starts_at) - interval '24 hours'
           and now() <  max(d.ends_at)   + interval '24 hours'
      from public.sessions s
      join public.session_days d on d.session_id = s.id
     where s.id = p_session
       and s.org_id = public.auth_org_id()
     group by s.id, s.state
  ), false)
$$;
revoke all on function public.story_capture_open(uuid) from public, anon;
grant execute on function public.story_capture_open(uuid) to authenticated;

-- The album's PUT (`photos_storage_write`, 0037) admits a checked-in member, a presenter or staff. A member who only
-- reserved is now inside the story's gate, and a story photograph is PUT on the album's path — so a second, PERMISSIVE
-- insert policy admits the same path under the story's gate. It opens no album upload: `initiate_photo_processing()`
-- keeps its own gate, and an object with no row is read by nobody (0156).
drop policy if exists "photos_storage_write_story" on storage.objects;
create policy "photos_storage_write_story" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (storage.foldername(name))[2] = 'sessions'
    -- ★ A CASE, so the cast never runs on a segment that is not a uuid (0199's rule).
    and coalesce(public.story_capture_open(
          case when (storage.foldername(name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               then ((storage.foldername(name))[3])::uuid end), false)
  );
grant insert on storage.objects to authenticated;   -- stated, not assumed (invariant 6)

-- «أضف قصتك» on the home's ring row: the sessions whose story the caller may add to NOW — a session with no frame yet
-- has no ring, so the row asks this instead of the feed. Titles of sessions the caller already may see; nothing else.
create or replace function public.story_capture_sessions()
returns table (session_id uuid, title text, starts_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.title, min(d.starts_at)
    from public.sessions s
    join public.session_days d on d.session_id = s.id
   where s.org_id = public.auth_org_id()
     and s.state in ('published', 'in_progress', 'completed', 'archived')
   group by s.id, s.title
  having now() >= min(d.starts_at) - interval '24 hours'
     and now() <  max(d.ends_at)   + interval '24 hours'
     and public.story_capture_open(s.id)
   order by min(d.starts_at) desc
   limit 20
$$;
revoke all on function public.story_capture_sessions() from public, anon;
grant execute on function public.story_capture_sessions() to authenticated;

-- ═══ The story derivative, made for photographs that never had one (DEC-278) ════════════════════════════════════
-- `process_photo` writes a photograph's 1080 px WebP `story` derivative since wave 26 (REQ-STO-012). Every photograph
-- uploaded BEFORE it has none, so its story frame — and a recap's strip — loaded the stripped ORIGINAL: production's
-- were PNGs of up to 9 MB, three to a recap, and opening a story on a phone stalled on them («it lags a lot»).
-- `JOB-backfill_story_derivatives` (hourly) asks this function for the photographs still without one, makes each with
-- the same `renderStoryDerivative()`, and marks it. No data is fixed by this migration: the job does the work, and
-- keeps doing it for any photograph whose derivative failed.

create or replace function public.story_derivatives_wanted(p_limit int default 20)
returns table (photo_id uuid, org_id uuid, session_id uuid, storage_path text, width int, height int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.org_id, p.session_id, p.storage_path, p.width, p.height
    from public.photos p
   where not p.story_derivative_ready
     and p.removed_at is null
     and p.created_at > now() - interval '30 days'
   order by p.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;
revoke all on function public.story_derivatives_wanted(int) from public, anon, authenticated;
grant execute on function public.story_derivatives_wanted(int) to service_role;

create or replace function public.mark_story_derivative_ready(p_photo uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.photos set story_derivative_ready = true where id = p_photo and removed_at is null
$$;
revoke all on function public.mark_story_derivative_ready(uuid) from public, anon, authenticated;
grant execute on function public.mark_story_derivative_ready(uuid) to service_role;
