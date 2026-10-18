-- 0231 · An admin logs an event that already happened (DEC-299, REQ-SES-025).
--
-- The owner, 2026-10-18: «if an event happened but wasn't logged before they would have a way to add it. It follows
-- the regular addition of a new event but if it is in an old date it doesn't trigger notifications and the admin can
-- add the attendees manually.» Asked, the owner chose: a separate «سجّل فعالية سابقة» entry (so nothing notifies
-- from the very first act, presenters included); attendance points that count on the EVENT's date, not today's; the
-- event visible to members as a completed session, with no feed post and no story.
--
-- What it is: a session born with `logged_retrospectively = true` (immutable). It is created and scheduled exactly as
-- any session (create_session → schedule_session), its days must all have ended, and `publish_past_session()` takes it
-- published → in_progress → completed in one transaction with `completed_at = ends_at` — no clock job, no code. From
-- then on it is an ordinary completed session: hand-marks (DEC-296), points (contract 5), certificates held for review.
--
-- What it does NOT do — every effect a past date would otherwise fire (the audit in DEC-299 §1), each switched off by
-- a WHEN on its trigger or a guard, never by editing the shared function:
--   MSG-presenter_assigned · MSG-session_published and every sessions_notify branch (reminders, the rating prompt,
--   change notices) · the three generated story frames and the clock's · MSG-check_in_confirmed · MSG-materials_added
--   · MSG-certificate_issued in `automatic` mode (an admin's release on SCR-045 still mails — that is deliberate).
-- Points and arrival are dated to the event: a check-in at its day's start, an award at the session's end — so the
-- current week's board, its digest and this month's streak do not move.
--
-- Forward-only and additive: one column with a default, triggers recreated under their own names (so their firing
-- order is unchanged), `create_session` dropped and re-created in this file with one trailing, defaulted parameter.
-- `main`'s app and worker on this schema do nothing different: every existing row reads false.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · the column, immutable
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.sessions add column logged_retrospectively boolean not null default false;
comment on column public.sessions.logged_retrospectively is
  'DEC-299: an event logged after it happened. Set at creation, never changed. Its days have all ended; it is published straight to completed and notifies nobody.';

create function public.sessions_retrospective_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'logged_retrospectively is immutable' using errcode = '23514';
end $$;
create trigger sessions_retrospective_immutable
  before update of logged_retrospectively on public.sessions
  for each row when (old.logged_retrospectively is distinct from new.logged_retrospectively)
  execute function public.sessions_retrospective_immutable();

-- Read by every WHEN below. Invoker: inside the definer functions that write these rows it reads as the owner; a
-- client that cannot see the session reads false, which is the ordinary behaviour.
create function public.session_logged_retrospectively(p_session uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select coalesce((select s.logged_retrospectively from public.sessions s where s.id = p_session), false);
$$;
revoke execute on function public.session_logged_retrospectively(uuid) from public, anon;
grant  execute on function public.session_logged_retrospectively(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · its days have ended — on every write, so a schedule edit cannot move one into the future
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
create function public.session_days_past_only() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.session_logged_retrospectively(new.session_id) and new.ends_at > now() then
    raise exception 'past_event_not_past' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.session_days_past_only() from public, anon, authenticated;
create trigger session_days_past_only before insert or update of starts_at, ends_at on public.session_days
  for each row execute function public.session_days_past_only();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · nothing notifies — each trigger recreated under its own name with a WHEN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
drop trigger session_presenters_notify on public.session_presenters;
create trigger session_presenters_notify after insert on public.session_presenters
  for each row when (not public.session_logged_retrospectively(new.session_id))
  execute function public.session_presenters_notify();

drop trigger sessions_notify on public.sessions;
create trigger sessions_notify after update on public.sessions
  for each row when (not new.logged_retrospectively)
  execute function public.sessions_notify();

drop trigger check_ins_notify on public.check_ins;
create trigger check_ins_notify after insert on public.check_ins
  for each row when (not public.session_logged_retrospectively(new.session_id))
  execute function public.check_ins_notify();

drop trigger materials_added_notify on public.materials;
create trigger materials_added_notify
  after insert or update of current_version_id, removed_at on public.materials
  for each row when (new.session_id is null or not public.session_logged_retrospectively(new.session_id))
  execute function public.materials_added_notify();

-- `automatic` mode announces each certificate as the worker issues it. For a past event, no: certificates still
-- issue, and an admin's release on SCR-045 still mails (release_certificates notifies itself, not through here).
create or replace function public.announce_certificate(p_certificate uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.certificates;
begin
  select * into v_row from public.certificates where id = p_certificate;
  if v_row.id is null or v_row.state <> 'issued' then
    return;
  end if;
  if v_row.session_id is not null and public.session_logged_retrospectively(v_row.session_id) then
    return;                                                                -- DEC-299
  end if;
  perform public.notify(v_row.org_id, v_row.member_id, null,
                        jsonb_build_object('certificate_id', v_row.id, 'serial', v_row.serial, 'kind', v_row.kind),
                        'MSG-certificate_issued');
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4 · no story — a generated frame (no author) for a past event is not written; the trigger and the clock both
--     reach the table through generate_story_frame(), which inserts and reads nothing back
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
create function public.story_frames_not_retrospective() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.author_id is null and public.session_logged_retrospectively(new.session_id) then
    return null;
  end if;
  return new;
end $$;
revoke all on function public.story_frames_not_retrospective() from public, anon, authenticated;
create trigger story_frames_not_retrospective before insert on public.story_frames
  for each row execute function public.story_frames_not_retrospective();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5 · dated to the event — arrival at the day's start, awards at the session's end
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- `zz` sorts after `check_ins_window`, which resolves the day this reads.
create function public.check_ins_past_arrival() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.session_logged_retrospectively(new.session_id) then
    new.arrived_at := (select d.starts_at from public.session_days d where d.id = new.session_day_id);
  end if;
  return new;
end $$;
revoke all on function public.check_ins_past_arrival() from public, anon, authenticated;
create trigger check_ins_zz_past_arrival before insert on public.check_ins
  for each row execute function public.check_ins_past_arrival();

-- The attendance and presenter awards a past event earns — and the reversal of one — carry the event's date. Every
-- other source (a comment, a photo, a rating written today) stays today's.
create function public.points_ledger_past_event_date() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_sess uuid := new.session_id;
  v_orig public.points_ledger;
begin
  if new.source = 'reversal' then
    select * into v_orig from public.points_ledger where id = new.source_id;
    if v_orig.id is not null
       and v_orig.source in ('check_in', 'attendee_bonus', 'session_delivered', 'rating_bonus', 'proposal_accepted')
       and public.session_logged_retrospectively(coalesce(v_orig.session_id, v_sess)) then
      new.occurred_at := v_orig.occurred_at;
    end if;
    return new;
  end if;

  if new.source not in ('check_in', 'attendee_bonus', 'session_delivered', 'rating_bonus', 'proposal_accepted') then
    return new;
  end if;
  if v_sess is null then
    v_sess := case
      when new.source in ('check_in', 'attendee_bonus') then (select c.session_id from public.check_ins c where c.id = new.source_id)
      when new.source = 'proposal_accepted' then (select s.id from public.sessions s where s.proposal_id = new.source_id)
      else new.source_id
    end;
  end if;
  if v_sess is not null and public.session_logged_retrospectively(v_sess) then
    new.occurred_at := (select s.ends_at from public.sessions s where s.id = v_sess);
  end if;
  return new;
end $$;
revoke all on function public.points_ledger_past_event_date() from public, anon, authenticated;
create trigger points_ledger_past_event_date before insert on public.points_ledger
  for each row execute function public.points_ledger_past_event_date();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 6 · create_session gains `p_retrospective` — trailing, defaulted; the old signature dropped in this file
--     (0213's body, verbatim, but for the flag on the insert and the one refusal)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
drop function public.create_session(text, text, uuid, public.session_level, public.session_language, uuid[], uuid);

create function public.create_session(
  p_title     text    default null,
  p_abstract  text    default null,
  p_category  uuid    default null,
  p_level     public.session_level default 'introductory',
  p_language  public.session_language default 'ar',
  p_presenters uuid[] default '{}',
  p_proposal  uuid    default null,
  p_retrospective boolean default false               -- ★ DEC-299
) returns uuid
language plpgsql security definer set search_path = '' as $$
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
  -- DEC-299: a past event is logged directly. A proposal is a promise about the future.
  if coalesce(p_retrospective, false) and p_proposal is not null then
    raise exception 'past_event_not_from_proposal' using errcode = '23514';
  end if;

  if p_proposal is not null then
    select * into v_proposal from public.proposals
     where id = p_proposal and org_id = actor.org_id;
    if v_proposal.id is null then
      raise exception 'proposal_not_found' using errcode = '42501';
    end if;
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

  if coalesce(p_retrospective, false) then
    v_action := 'session.logged_retrospectively';
  end if;

  -- 0213 (REQ-SES-022): a session made from a proposal is the proposal's event type; one made directly is a talk.
  insert into public.sessions (org_id, proposal_id, title, abstract, category_id, level, language, state, event_type,
                               logged_retrospectively)
  values (actor.org_id, p_proposal, v_title, v_abstract, v_category, v_level, p_language, 'draft',
          coalesce(v_proposal.event_type, 'talk'::public.event_type), coalesce(p_retrospective, false))
  returning id into v_id;

  insert into public.session_state_transitions (org_id, session_id, from_state, to_state, actor_id, is_manual)
  values (actor.org_id, v_id, null, 'draft', actor.id, true);

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
      insert into public.session_presenters (org_id, session_id, member_id, accepted)
      values (actor.org_id, v_id, v_member, true)
      on conflict (session_id, member_id) do nothing;
    end loop;
  end if;

  perform public.write_audit(actor.org_id, v_action, 'session', v_id, null,
                             jsonb_build_object('title', v_title, 'proposal_id', p_proposal),
                             null, 'admin', actor.id);
  return v_id;
end $$;
revoke execute on function public.create_session(text, text, uuid, public.session_level, public.session_language, uuid[], uuid, boolean) from public, anon;
grant  execute on function public.create_session(text, text, uuid, public.session_level, public.session_language, uuid[], uuid, boolean) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 7 · publish_past_session() — publish, then the two clock steps, in one transaction, at the event's own times
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
create function public.publish_past_session(p_session uuid) returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare
  actor  public.members := public.assert_fresh_admin();
  target public.sessions;
begin
  select * into target from public.sessions where id = p_session and org_id = actor.org_id for update;
  if target.id is null then
    raise exception 'session_not_found' using errcode = '42501';
  end if;
  if not target.logged_retrospectively then
    raise exception 'not_a_past_event' using errcode = '23514';
  end if;
  if target.state in ('completed', 'archived') then
    return target;                                                         -- idempotent
  end if;
  if target.ends_at is not null and target.ends_at > now() then
    raise exception 'past_event_not_past' using errcode = '23514';
  end if;

  -- Every completeness refusal is publish_session's own (publish_incomplete: …).
  target := public.publish_session(p_session);

  update public.sessions set state = 'in_progress' where id = target.id returning * into target;
  insert into public.session_state_transitions (org_id, session_id, from_state, to_state, actor_id, is_manual, reason)
  values (actor.org_id, target.id, 'published', 'in_progress', actor.id, true, 'logged_retrospectively');

  update public.sessions set state = 'completed', completed_at = target.ends_at, check_in_open = false
   where id = target.id returning * into target;
  insert into public.session_state_transitions (org_id, session_id, from_state, to_state, actor_id, is_manual, reason)
  values (actor.org_id, target.id, 'in_progress', 'completed', actor.id, true, 'logged_retrospectively');

  return target;
end $$;
revoke execute on function public.publish_past_session(uuid) from public, anon;
grant  execute on function public.publish_past_session(uuid) to authenticated;
