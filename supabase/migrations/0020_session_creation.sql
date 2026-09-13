-- proposed by `sessions` (wave 1, M2) — creating a session, from a proposal or from nothing
--
-- Serves:  REQ-PRO-007, REQ-PRO-008, REQ-SES-003 (the transition row)
-- Cites:   02-domain-model.md §4.3, §6.2, and the `proposals ||--o| sessions` cardinality of §2
--          03-permissions-rls.md §1.3, §5.2c/d · 0005 (assert_fresh_admin) · 0010 (the tables)
--
-- 03 §8.2 rows (added at wave-1 sync point 4):
--   | `POL-sessions.insert.rpc` | `sessions` has no insert policy and no insert grant: a direct
--     insert by an admin is refused, and `create_session()` is the only way in. |
--   | `RPC-create_session.admin_only` | A member and a moderator are refused 42501; an admin of
--     another org cannot reach the proposal or create into that org. |
--   | `RPC-create_session.one_per_proposal` | An approved proposal becomes at most one session;
--     a second attempt is refused, and only an `approved` proposal can be turned into one. |
--   | `POL-session_presenters.decline` | A presenter declining an unpublished session returns it
--     to `draft` and writes the transition row; a published session is left alone. |

-- ── A proposal becomes at most one session (02 §2: `||--o|`) ────────────────
create unique index sessions_proposal_key on public.sessions (proposal_id) where proposal_id is not null;

-- ── create_session() ────────────────────────────────────────────────────────
-- SECURITY DEFINER because `sessions` has NO insert policy and NO insert grant
-- (0010 grants `select` and a four-column `update`, nothing more). That is
-- deliberate — 03 §5.2c/d says creation and publication are admin RPCs — so
-- definer is the only door, and the 03 §1.3 re-read is therefore mandatory:
-- a function that bypasses RLS must not believe the claims it was handed.
--
-- One function for both paths. REQ-PRO-007 requires a directly created session
-- to be "indistinguishable from a proposed one downstream, except in the audit
-- log", so the row is identical either way and only the audit action differs.
-- Scheduling is NOT here: no date, no venue, no capacity. Those are
-- REQ-SES-001 and a separate act, which is the whole point of D13/D14.
create function public.create_session(
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
      -- Not accepted: REQ-PRO-007 gives an assigned presenter the right to
      -- decline, which they cannot have if the admin accepted for them.
      insert into public.session_presenters (org_id, session_id, member_id)
      values (actor.org_id, v_id, v_member)
      on conflict (session_id, member_id) do nothing;
    end loop;
  end if;

  perform public.write_audit(actor.org_id, v_action, 'session', v_id, null,
                             jsonb_build_object('title', v_title, 'proposal_id', p_proposal),
                             null, 'admin', actor.id);
  return v_id;
end $$;

revoke execute on function public.create_session(text, text, uuid, public.session_level, public.session_language, uuid[], uuid) from public, anon;
grant  execute on function public.create_session(text, text, uuid, public.session_level, public.session_language, uuid[], uuid) to authenticated;

-- ── A declining presenter sends the session back to draft (REQ-PRO-007) ─────
-- The presenter can set their own `declined_at` — `session_presenters_update_
-- self` allows it and the column grant covers it — but they have no grant on
-- `sessions.state`, so the consequence has to be a trigger. Definer for the
-- same reason: the row it must write belongs to a table the declining member
-- cannot touch.
--
-- Only before publication. Once a session is published people have reserved
-- seats against it, and silently un-publishing it under them would be worse
-- than leaving an admin to deal with a presenter who has withdrawn
-- (REQ-SES-009 is the path for that).
create function public.session_presenter_declined() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_state public.session_state;
begin
  if new.declined_at is null or old.declined_at is not null then
    return new;
  end if;
  select s.state into v_state from public.sessions s where s.id = new.session_id;
  if v_state in ('draft', 'submitted', 'in_review', 'changes_requested', 'approved') then
    if v_state <> 'draft' then
      update public.sessions set state = 'draft' where id = new.session_id;
      insert into public.session_state_transitions (org_id, session_id, from_state, to_state, actor_id, is_manual, reason)
      values (new.org_id, new.session_id, v_state, 'draft', new.member_id, true, 'presenter_declined');
    end if;
  end if;
  return new;
end $$;

create trigger session_presenter_declined
  after update of declined_at on public.session_presenters
  for each row execute function public.session_presenter_declined();
