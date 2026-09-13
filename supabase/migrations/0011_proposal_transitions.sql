-- proposed by `sessions` (wave 1, M2) — the proposal state machine, made structural
--
-- Serves:  REQ-PRO-005, REQ-PRO-006
-- Cites:   02-domain-model.md §6.1 (the normative diagram) · 03-permissions-rls.md §5.2b
--          0004_tenancy.sql (audit_log, append-only) · 0005_tenancy_rpcs.sql (write_audit)
--
-- 03 §8.2 rows (added at wave-1 sync point 1):
--   | `POL-proposals.transition.audit` | Creating a proposal and submitting it each write an
--     `audit_log` row; a member cannot suppress either, and cannot write one directly. |
--   | `POL-proposals.transition.legal` | `changes_requested -> draft` and `submitted -> approved`
--     are refused with 23514; `draft -> submitted` and `in_review -> approved` succeed. |
--
-- ── Why triggers and not an RPC ─────────────────────────────────────────────
-- REQ-PRO-006: "No transition occurs without an audit row." The only way into
-- `audit_log` is `write_audit()`, which is revoked from `authenticated` and
-- granted to `service_role` alone — so the row can only be written from a
-- definer context. But 03 §5.2b deliberately lets a member submit with a plain
-- PostgREST `update`: the asymmetric using/with-check IS the submit transition.
-- An RPC would therefore be optional — a member could submit around it and
-- leave no evidence. A trigger makes the audit row a property of the table,
-- which is what "no transition occurs without" has to mean.
--
-- The same argument decides the guard. 03 §5.2b's policy permits
-- `changes_requested -> draft`, which §6.1 does not; only a table-level check
-- can close that, because the policy cannot see the old and new state at once
-- in a way that expresses an edge set.
-- ────────────────────────────────────────────────────────────────────────────

-- ── The legal edge set of 02 §6.1, and nothing else ─────────────────────────
create function public.proposals_guard_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- An edit that leaves the state alone is not a transition. `before update of
  -- state` fires whenever the column is named in the UPDATE, which a DAL that
  -- writes a whole row does on every save.
  if new.state is not distinct from old.state then
    return new;
  end if;

  if not (
       (old.state = 'draft'             and new.state = 'submitted')
    or (old.state = 'submitted'         and new.state = 'in_review')
    or (old.state = 'in_review'         and new.state in ('changes_requested', 'approved', 'rejected'))
    or (old.state = 'changes_requested' and new.state = 'submitted')
  ) then
    raise exception 'illegal_proposal_transition: % -> %', old.state, new.state
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger proposals_guard_transition
  before update of state on public.proposals
  for each row execute function public.proposals_guard_transition();

-- ── Every transition leaves evidence (REQ-PRO-006) ──────────────────────────
create function public.proposals_audit_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_action text;
  v_before jsonb;
begin
  if tg_op = 'INSERT' then
    -- A proposal may be born `submitted` (proposals_insert_own permits both),
    -- so the created row's own state names the action.
    v_action := 'proposal.' || case when new.state = 'submitted' then 'submitted' else 'created' end;
    v_before := null;
  else
    if new.state is not distinct from old.state then
      return null;
    end if;
    v_action := 'proposal.' || new.state::text;
    v_before := jsonb_build_object('state', old.state);
  end if;

  -- write_audit() fills the actor from the JWT claims, which a SECURITY
  -- DEFINER function still reads: the claims live in a GUC, not in the role.
  -- `decision_reason` carries the admin's written reason on a rejection or a
  -- change-request, which is the reason REQ-PRO-005 says the proposer receives.
  perform public.write_audit(
    new.org_id,
    v_action,
    'proposal',
    new.id,
    v_before,
    jsonb_build_object('state', new.state, 'title', new.title),
    new.decision_reason
  );

  return null;  -- AFTER trigger
end $$;

create trigger proposals_audit_transition
  after insert or update of state on public.proposals
  for each row execute function public.proposals_audit_transition();

-- No grants: both functions are trigger-only and are never called by name.
-- `write_audit` stays revoked from anon and authenticated — this file does not
-- widen it, which is the point.
