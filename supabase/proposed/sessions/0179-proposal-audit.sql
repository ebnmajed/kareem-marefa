-- proposed by `sessions` (wave 21, M23) — a proposal's content is captured at submission, so SCR-041 can draw
-- what changed since it was sent back (contract 5)
--
-- Serves:  REQ-UIX-088 («when a proposal's content changed after it was submitted, the reviewer sees what changed,
--          field by field»), REQ-PRO-006 (every transition audited — unchanged)
-- Cites:   0011_proposal_transitions.sql (the function this replaces, and its trigger, untouched) ·
--          0010 (`proposals_update_own_editable`, the update grant's seven content columns) · 0013 (`review_proposal`,
--          which writes `state` and `decision_reason` only) · 0004:422-425 (`audit_read_admin`) · DEC-215, DEC-228 §2
--
-- 03 §8.2 rows this adds:
--   | `POL-proposals.transition.content` | A transition INTO `submitted` records the seven content columns in the audit
--     row's `after`; `changes_requested -> submitted` also records them, as they were, in `before`. Every other
--     transition's row is unchanged. |
--   | `POL-proposals.edits.private` | Those rows are readable by an org admin only — never by the proposer, a
--     co-presenter or a moderator who did not act. |
--
-- ── Why one function and nothing else ───────────────────────────────────────
-- A proposer can change content after submitting in exactly one way, and it is a state transition:
-- `proposals_update_own_editable` admits an update only FROM `draft` or `changes_requested` and only TO `draft` or
-- `submitted`; 0011's guard refuses `changes_requested -> draft`; nobody else may write the content columns
-- (no admin update policy; `review_proposal()` writes state and reason). So the content at first submission and
-- the content at every resubmission are both visible to the trigger that already fires on `update of state` — and
-- `updateProposal()` always names `state`, so the trigger always fires. No table, column, policy or grant.
--
-- ── What `main` does on this ────────────────────────────────────────────────
-- Nothing different. No reader parses a proposal audit row's `before`/`after` keys; the audit screen renders them
-- generically. The trigger's name, timing and column list are unchanged; only the function body moves.
--
-- The seven are 0010's update grant minus `state`: title, abstract, category_id, level, target_audience,
-- expected_duration_minutes, admin_notes. `decision_reason` is the admin's, and stays in `reason` as before.

create or replace function public.proposals_audit_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_action text;
  v_before jsonb;
  v_after  jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'proposal.' || case when new.state = 'submitted' then 'submitted' else 'created' end;
    v_before := null;
  else
    if new.state is not distinct from old.state then
      return null;
    end if;
    v_action := 'proposal.' || new.state::text;
    v_before := jsonb_build_object('state', old.state);
  end if;

  v_after := jsonb_build_object('state', new.state, 'title', new.title);

  -- ★ Into `submitted`: what the reviewer is about to read, as it is now.
  if new.state = 'submitted' then
    v_after := v_after || jsonb_build_object(
      'abstract',                  new.abstract,
      'category_id',               new.category_id,
      'level',                     new.level,
      'target_audience',           new.target_audience,
      'expected_duration_minutes', new.expected_duration_minutes,
      'admin_notes',               new.admin_notes
    );
    -- ★ A resubmission: what the reviewer last read, as it was — the edit and the transition are one UPDATE.
    if tg_op = 'UPDATE' and old.state = 'changes_requested' then
      v_before := v_before || jsonb_build_object(
        'title',                     old.title,
        'abstract',                  old.abstract,
        'category_id',               old.category_id,
        'level',                     old.level,
        'target_audience',           old.target_audience,
        'expected_duration_minutes', old.expected_duration_minutes,
        'admin_notes',               old.admin_notes
      );
    end if;
  end if;

  perform public.write_audit(
    new.org_id,
    v_action,
    'proposal',
    new.id,
    v_before,
    v_after,
    new.decision_reason
  );

  return null;  -- AFTER trigger
end $$;

-- No grants: trigger-only, as in 0011. `write_audit` stays revoked from anon and authenticated.
