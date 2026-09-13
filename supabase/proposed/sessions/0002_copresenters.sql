-- proposed by `sessions` (wave 1, M2) — co-presenters: same org, one transaction, no late additions
--
-- Serves:  REQ-PRO-003 (A5, OQ-021), and REQ-PRO-002's "مقدّمون مشاركون"
-- Cites:   02-domain-model.md §4.3 (ENT-proposal_presenters) · 03-permissions-rls.md §5.2
--          0010_m2_schema.sql (presenters_within_limit, the insert policies)
--
-- 03 §8.2 rows this needs (for the lead to add):
--   | `POL-proposal_presenters.insert.same_org` | Naming a member of another org is refused with
--     23514, even though the row's own `org_id` is the caller's. |
--   | `POL-proposal_presenters.insert.state` | A co-presenter cannot be added to an `approved` or
--     `rejected` proposal. |
--   | `RPC-create_proposal` | Creates the proposal, the proposer's accepted presenter row and the
--     named co-presenters atomically; a bad co-presenter id rolls the proposal back with it;
--     `proposer_id` is the session's own member whatever the caller sends. |

-- ── 1. A presenter belongs to the proposal's org ────────────────────────────
-- REQ-PRO-003: "Only members of the same مؤسسة can be named." The insert
-- policy checks that the ROW's org_id is the caller's, which is not the same
-- claim: nothing there says the named MEMBER is in that org. A proposer who
-- learns a member id from another org could otherwise name them, and A5's
-- presenter points and REQ-CRT-001's presenter certificate would follow the
-- named row across the tenancy boundary.
create function public.presenter_is_same_org() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select m.org_id into v_org from public.members m where m.id = new.member_id;
  if v_org is null or v_org <> new.org_id then
    raise exception 'presenter_not_in_org' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger proposal_presenters_same_org
  before insert or update of member_id, org_id on public.proposal_presenters
  for each row execute function public.presenter_is_same_org();

create trigger session_presenters_same_org
  before insert or update of member_id, org_id on public.session_presenters
  for each row execute function public.presenter_is_same_org();

-- ── 2. Nobody joins a proposal after it has been decided ────────────────────
-- The insert policy checks who owns the proposal, not what state it is in, so
-- a proposer could name a co-presenter on an ALREADY APPROVED proposal — who
-- would then collect presenter points and a certificate for a session nobody
-- reviewed them onto. Naming stays open through review (a change-request
-- often IS "add someone who knows the operations side") and closes at the
-- decision.
create function public.proposal_presenters_addable() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_state public.proposal_state;
begin
  select p.state into v_state from public.proposals p where p.id = new.proposal_id;
  if v_state not in ('draft', 'submitted', 'in_review', 'changes_requested') then
    raise exception 'proposal_not_open_for_presenters' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger proposal_presenters_addable
  before insert on public.proposal_presenters
  for each row execute function public.proposal_presenters_addable();

-- ── 3. create_proposal() — the three inserts are one act ────────────────────
-- SECURITY INVOKER on purpose. This function exists for ATOMICITY, not for
-- authority: PostgREST wraps one request in one transaction, so three separate
-- calls are three transactions and a failed co-presenter would leave a
-- proposal with no presenter row behind it. Running as the caller keeps RLS
-- and the column grants as the boundary — proposals_insert_own still decides
-- whether this insert is allowed, and still refuses any `proposer_id` but the
-- session's own, which is why the caller is not asked for one.
--
-- The proposer gets their own `proposal_presenters` row, accepted: proposing
-- IS accepting. It also makes `presenters_within_limit`'s
-- `max_co_presenters + 1` mean what it says — the lead presenter plus four.
create function public.create_proposal(
  p_title                     text,
  p_abstract                  text,
  p_category                  uuid,
  p_level                     public.session_level,
  p_target_audience           text    default null,
  p_expected_duration_minutes int     default null,
  p_admin_notes               text    default null,
  p_co_presenters             uuid[]  default '{}',
  p_submit                    boolean default false
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id     uuid;
  v_me     uuid := public.auth_member_id();
  v_org    uuid := public.auth_org_id();
  v_member uuid;
begin
  insert into public.proposals (org_id, proposer_id, title, abstract, category_id, level,
                                target_audience, expected_duration_minutes, admin_notes, state)
  values (v_org, v_me, p_title, p_abstract, p_category, p_level,
          p_target_audience, p_expected_duration_minutes, p_admin_notes,
          (case when p_submit then 'submitted' else 'draft' end)::public.proposal_state)
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
end $$;

revoke execute on function public.create_proposal(text, text, uuid, public.session_level, text, int, text, uuid[], boolean) from public, anon;
grant  execute on function public.create_proposal(text, text, uuid, public.session_level, text, int, text, uuid[], boolean) to authenticated;
