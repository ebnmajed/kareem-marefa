-- proposed by `sessions` (wave 1, M2) — admin review: approve, reject, request changes
--
-- Serves:  REQ-PRO-005, REQ-PRO-006
-- Cites:   02-domain-model.md §6.1 · 03-permissions-rls.md §1.3 (staleness), §5.2b
--          0005_tenancy_rpcs.sql (assert_fresh_admin) · 0011 (the guard and audit triggers)
--
-- 03 §8.2 rows (added at wave-1 sync point 2):
--   | `RPC-review_proposal.admin_only` | A member and a moderator are both refused 42501; only an
--     org admin may review, and never a proposal in another org. |
--   | `RPC-review_proposal.reason` | `reject` and `request_changes` without a reason are refused;
--     the reason reaches the proposer on the row and the audit row. |
--   | `RPC-review_proposal.path` | Deciding on a `submitted` proposal walks it through
--     `in_review`, so 02 §6.1 is followed and both transitions are audited. |
--
-- ── Why this is an RPC, unlike create_proposal ──────────────────────────────
-- `proposals` has NO admin update policy — 0010 gives the table exactly four
-- policies and all of them are the proposer's. That is deliberate (03 §5.2b:
-- "Approval, rejection and change-requests are admin RPCs"), so an admin
-- literally cannot write this table through PostgREST and the only way in is
-- SECURITY DEFINER. Which in turn is why the 03 §1.3 staleness re-read is
-- mandatory here: a definer function bypasses RLS, so the caller's claim to be
-- an admin has to be re-derived from the members table, not believed.

create function public.review_proposal(
  p_proposal uuid,
  p_action   text,     -- 'open' | 'approve' | 'reject' | 'request_changes'
  p_reason   text default null
) returns public.proposals
language plpgsql security definer set search_path = '' as $$
declare
  actor    public.members := public.assert_fresh_admin();
  target   public.proposals;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_action not in ('open', 'approve', 'reject', 'request_changes') then
    raise exception 'unknown_review_action' using errcode = '22023';
  end if;

  -- Definer bypasses RLS, so the org scope is written out rather than assumed.
  select * into target from public.proposals
   where id = p_proposal and org_id = actor.org_id;
  if target.id is null then
    raise exception 'proposal_not_found' using errcode = '42501';
  end if;

  -- REQ-PRO-005: rejection and a change-request both require a written reason
  -- the proposer receives. The table's own check would catch a null, but not
  -- «   », and would say nothing useful about which field was missing.
  if p_action in ('reject', 'request_changes') and v_reason is null then
    raise exception 'reason_required' using errcode = '23514';
  end if;

  if p_action = 'open' then
    if target.state <> 'submitted' then
      raise exception 'proposal_not_submitted' using errcode = '23514';
    end if;
    update public.proposals set state = 'in_review' where id = target.id returning * into target;
    return target;
  end if;

  -- A decision on a still-`submitted` proposal walks it through `in_review`
  -- rather than jumping: 02 §6.1 has no edge from `submitted` to a decision,
  -- 0011's guard enforces that, and walking it leaves both audit rows. The
  -- admin experiences one click; the record shows what actually happened.
  if target.state = 'submitted' then
    update public.proposals set state = 'in_review' where id = target.id returning * into target;
  end if;
  if target.state <> 'in_review' then
    raise exception 'proposal_not_in_review' using errcode = '23514';
  end if;

  -- The reason and the state move together, so the audit trigger — which
  -- reads `new.decision_reason` — records the decision with its reason.
  -- Approval clears a previous change-request's reason: it belongs to that
  -- earlier decision, it is preserved in the audit log, and left on the row it
  -- would sit under «مقبول» on SCR-018 as though the admin had reservations.
  update public.proposals
     set state = (case p_action when 'approve' then 'approved'
                                when 'reject'  then 'rejected'
                                else 'changes_requested' end)::public.proposal_state,
         decision_reason = case when p_action = 'approve' then null else v_reason end
   where id = target.id
   returning * into target;

  return target;
end $$;

revoke execute on function public.review_proposal(uuid, text, text) from public, anon;
grant  execute on function public.review_proposal(uuid, text, text) to authenticated;
