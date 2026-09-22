-- proposed by `sessions` (wave 12, M14) — an admin changes a session's presenters after it is created
--
-- Serves:  REQ-SES-019 (DEC-172, sync 1's rulings in DEC-174), REQ-PRO-007
-- Cites:   0010 (session_presenters, p2_admin_insert / p2_admin_delete, presenters_within_limit)
--          0012 (presenter_is_same_org) · 0020 (create_session, session_presenter_declined)
--          0039 (session_presenters_notify) · 0063 (the poster hook) · 0005 (assert_fresh_admin, write_audit)
-- Docs:    docs/plan/notes/sessions.md «Wave 12 plan», W12.3
--
-- ★ Contract 2 of the wave-12 map: these functions write `session_presenters`
-- rows and NOTHING ELSE that pays. What a presenter is paid, or loses, when
-- they join or leave a completed session is `scoring`'s triggers on this
-- table — so a direct write under 0010's admin policies is covered the same
-- way. Nothing here names the ledger, an award or a job.
--
-- 03 §8.2 rows this adds:
--   | `RPC-add_session_presenter.admin_only` | A member and a moderator are refused 42501; an admin of another org cannot reach the session (`session_not_found`, 42501); stale claims are refused. |
--   | `RPC-add_session_presenter.assigned` | The member becomes an ACCEPTED presenter, is told once by `MSG-presenter_assigned`, and one `session.presenter_added` audit row names them; a pending or declined row is promoted to accepted rather than refused. |
--   | `RPC-add_session_presenter.refusals` | A member outside the org, a deactivated member, an existing accepted presenter, a member with an active check-in on the session, a cancelled session, and one beyond the org's presenter limit are each refused, leaving no row, no notice and no audit. |
--   | `RPC-remove_session_presenter.delete_not_decline` | The row is DELETED — `declined_at` is never written, so a published session keeps its state and gains no transition row; one `session.presenter_removed` audit row. |
--   | `RPC-remove_session_presenter.last` | The session's only accepted presenter cannot be removed (23514); a pending or declined row always can. |
--   | `RPC-session_presenters.no_ledger` | Neither function names the ledger, an award or a job, and neither call writes a ledger row. |
--   | `RPC-create_session.assigned` | A presenter named when an admin creates a session directly is ACCEPTED — assigned, as `DEC-172` rules for an added one (replaces `0020`'s «not accepted on their behalf»). |

-- ── create_session(): a presenter the admin names is ASSIGNED ────────────────
-- Same signature as 0020, so `create or replace` keeps its grants and main's
-- `createSessionDirect()` sends exactly what it sends today. The one change is
-- the direct branch: 0020 inserted `accepted = false` so an assigned presenter
-- could decline — but no screen ever let them accept or decline a SESSION, and
-- every reader filters on `accepted`, so a directly created session had no
-- presenter on any surface (sessions.md W12.1(a), DEC-174 ruling Q1).
create or replace function public.create_session(
  p_title     text    default null,
  p_abstract  text    default null,
  p_category  uuid    default null,
  p_level     public.session_level default 'introductory',
  p_language  public.session_language default 'ar',
  p_presenters uuid[] default '{}',
  p_proposal  uuid    default null
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

  insert into public.sessions (org_id, proposal_id, title, abstract, category_id, level, language, state)
  values (actor.org_id, p_proposal, v_title, v_abstract, v_category, v_level, p_language, 'draft')
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
end $$;

-- ── The session, re-derived and locked ───────────────────────────────────────
-- Both RPCs begin here. The org comes from the SESSION and the actor, never
-- from an argument; another org's session is indistinguishable from a missing
-- one. `for update` serialises two admins acting on one session at once —
-- `presenters_within_limit()` counts without a lock, and «the last presenter»
-- is a count too. Not callable by anyone: a helper, not an API (DEC-152).
create function public._session_for_presenter_change(p_session uuid, p_org uuid) returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session and org_id = p_org for update;
  if s.id is null then
    raise exception 'session_not_found' using errcode = '42501';
  end if;
  -- Nothing on a cancelled session is shown or paid, so a change there is an
  -- act the audit log would record for nothing (DEC-174 ruling Q3).
  if s.state = 'cancelled' then
    raise exception 'session_cancelled' using errcode = '23514';
  end if;
  return s;
end $$;
revoke execute on function public._session_for_presenter_change(uuid, uuid) from public, anon, authenticated;

-- ── add_session_presenter() ─────────────────────────────────────────────────
-- SECURITY DEFINER because the audit row is `write_audit()`'s, which no client
-- role may execute (0005), and the session lock needs a write the admin's
-- column grant does not give. So the 03 §1.3 re-read is mandatory — hence
-- `assert_fresh_admin()` first. Every refusal comes BEFORE the first write
-- (DEC-043); the limit and same-org triggers refuse inside the insert, which
-- rolls back the insert and the notice it queued together.
create function public.add_session_presenter(p_session uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor    public.members := public.assert_fresh_admin();
  s        public.sessions := public._session_for_presenter_change(p_session, actor.org_id);
  v_member public.members;
  existing public.session_presenters;
begin
  select * into v_member from public.members where id = p_member and org_id = s.org_id;
  if v_member.id is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_member.status <> 'active' then
    raise exception 'member_not_active' using errcode = '23514';
  end if;

  select * into existing from public.session_presenters where session_id = s.id and member_id = p_member;
  if existing.member_id is not null and existing.accepted then
    raise exception 'already_presenter' using errcode = '23514';
  end if;

  -- REQ-CHK-011 says a presenter is not an attendee. Making an attendee a
  -- presenter would, after completion, pay them for both — so their
  -- attendance is removed first, by the admin, on the attendance screen
  -- (DEC-174 ruling Q4).
  if exists (select 1 from public.check_ins c
              where c.session_id = s.id and c.member_id = p_member and c.removed_at is null) then
    raise exception 'member_checked_in' using errcode = '23514';
  end if;

  if existing.member_id is not null then
    -- A pending row (0020's direct path before this file) or a declined one:
    -- PROMOTED, not refused — this is the admin's repair path (DEC-174 Q2).
    -- `declined_at` goes to null, never to a value, so
    -- `session_presenter_declined()` has nothing to do; `scoring`'s trigger
    -- covers `accepted` becoming true. No new notice: the insert told them.
    update public.session_presenters set accepted = true, declined_at = null
     where session_id = s.id and member_id = p_member;
  else
    insert into public.session_presenters (org_id, session_id, member_id, accepted)
    values (s.org_id, s.id, p_member, true);
  end if;

  perform public.write_audit(s.org_id, 'session.presenter_added', 'session', s.id,
                             case when existing.member_id is null then null
                                  else jsonb_build_object('member_id', p_member, 'accepted', existing.accepted,
                                                          'declined_at', existing.declined_at) end,
                             jsonb_build_object('member_id', p_member, 'accepted', true),
                             null, 'admin', actor.id);
end $$;
revoke execute on function public.add_session_presenter(uuid, uuid) from public, anon;
grant  execute on function public.add_session_presenter(uuid, uuid) to authenticated;

-- ── remove_session_presenter() ──────────────────────────────────────────────
-- ★ A DELETE, never `declined_at`: setting it fires
-- `session_presenter_declined()`, which sends an unpublished session back to
-- draft (0020). An admin taking someone off is not the presenter withdrawing.
create function public.remove_session_presenter(p_session uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor    public.members := public.assert_fresh_admin();
  s        public.sessions := public._session_for_presenter_change(p_session, actor.org_id);
  existing public.session_presenters;
begin
  select * into existing from public.session_presenters where session_id = s.id and member_id = p_member;
  if existing.member_id is null then
    raise exception 'presenter_not_found' using errcode = 'P0002';
  end if;

  -- «At least one presenter stays», counted over ACCEPTED rows — what every
  -- reader counts (DEC-174 ruling Q7). A pending or declined row is on no
  -- surface and pays nothing, so removing one is never refused; a session
  -- born with none stays legal.
  if existing.accepted and not exists (
    select 1 from public.session_presenters
     where session_id = s.id and member_id <> p_member and accepted
  ) then
    raise exception 'last_presenter' using errcode = '23514';
  end if;

  delete from public.session_presenters where session_id = s.id and member_id = p_member;

  perform public.write_audit(s.org_id, 'session.presenter_removed', 'session', s.id,
                             jsonb_build_object('member_id', p_member, 'accepted', existing.accepted,
                                                'declined_at', existing.declined_at),
                             null, null, 'admin', actor.id);
end $$;
revoke execute on function public.remove_session_presenter(uuid, uuid) from public, anon;
grant  execute on function public.remove_session_presenter(uuid, uuid) to authenticated;
