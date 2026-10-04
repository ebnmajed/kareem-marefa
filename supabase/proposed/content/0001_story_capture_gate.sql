-- content · wave 26, PR D — the capture gate (REQ-STO-011, DEC-248 §5, DEC-251 §5).
--
-- Serves:  01 §25 REQ-STO-011 · REQ-STO-012 · REQ-STO-016
-- Cites:   0087 (has_checked_in(), a removed check-in no longer counts) · 0100 (session_days) · notes/content.md W26 §4.1
--
-- ★ «أضف» exists only for a member checked in to the session, from its start until 24 hours after its end — and THE
-- SERVER REFUSES EVERYONE ELSE whatever the screen shows. This is that server: one predicate, called by
-- `initiate_story_photo()`, `begin_story_video()`, the `story-media` bucket's write policy (0198, the lead's) and the
-- DAL's `canAdd` hint. ★ It must exist BEFORE 0198's storage policy is created, which names it.
--
--   · checked in — `has_checked_in()`, so a removed check-in (0087) does not count, and a presenter or staff member who
--     did not check in is refused (REQ-STO-011 says «a member checked in», nothing wider);
--   · the session is not cancelled;
--   · now() is at or after the FIRST day's start and before the LAST day's end + 24 hours (a multi-day session's window
--     is the whole run, REQ-SES-015).
--
-- `security definer` because `session_days` and `sessions` are read whatever the caller's RLS shows; the answer is a
-- boolean about the caller alone (`has_checked_in()` reads `auth_member_id()`), so nothing leaks. `stable`: one
-- statement sees one clock.
--
-- 03 §8.2 rows this adds (tests/rls/story-frames-content.test.ts):
--   | `RPC-story_capture_open` | checked in, inside the window ✓ · not checked in ✗ · check-in removed ✗ · presenter not checked in ✗ · staff not checked in ✗ · before the start ✗ · at end + 24 h ✗ · cancelled ✗ · another org's session ✗ |
create function public.story_capture_open(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.has_checked_in(s.id)
           and s.state <> 'cancelled'
           and now() >= min(d.starts_at)
           and now() <  max(d.ends_at) + interval '24 hours'
      from public.sessions s
      join public.session_days d on d.session_id = s.id
     where s.id = p_session
       and s.org_id = public.auth_org_id()
     group by s.id, s.state
  ), false)
$$;
revoke all on function public.story_capture_open(uuid) from public, anon;
grant execute on function public.story_capture_open(uuid) to authenticated;
