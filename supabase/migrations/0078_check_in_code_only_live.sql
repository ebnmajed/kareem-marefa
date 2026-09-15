-- Launch, post-launch fix (the owner's smoke-test find, 2026-09-15) — a check-in code is issued
-- only while the session is in progress.
--
-- ensure_check_in_code() (0015) checked WHO may read the code (REQ-CHK-014) but not WHEN: the host
-- view minted a code for a published session days before it started. check_in() already refused
-- such a code (REQ-CHK-004, `not_started`), so nothing could be gained with it — but a code on a
-- screen before the room exists misleads the presenter and invites it to be shared early. The
-- window is now enforced where the code is issued, not only where it is accepted; the host view
-- says «not started» / «ended» instead. rotate_check_in_code() (service_role, the rotation job)
-- keeps its own behaviour: the job only runs for live sessions.
--
-- Serves:  REQ-CHK-001, REQ-CHK-004, REQ-CHK-014
-- Cites:   0015 (ensure_check_in_code, _issue_check_in_code)
--
-- 03 §8.2 row this adds:
--   | `RPC-ensure_check_in_code.only_live` | The presenter of a `published` session is refused
--     `not_open` (P0001) before it starts and after it ends; once `in_progress` the same call
--     returns a code. |
create or replace function public.ensure_check_in_code(p_session uuid) returns public.check_in_codes
language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.org_id <> public.auth_org_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (public.is_presenter_of(p_session) or public.is_staff()) then
    raise exception 'not_authorized' using errcode = '42501';         -- REQ-CHK-014 / OQ-013
  end if;
  if s.state <> 'in_progress' then
    raise exception 'not_open' using errcode = 'P0001';               -- REQ-CHK-004, at issuance
  end if;
  return public._issue_check_in_code(p_session);
end $$;
