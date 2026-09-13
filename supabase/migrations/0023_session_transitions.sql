-- proposed by `sessions` (wave 1, M2) — an admin starts, completes, cancels, archives, reopens
--
-- Serves:  REQ-SES-003, REQ-SES-005, REQ-SES-010, REQ-SES-012, REQ-CHK-004
-- Cites:   02-domain-model.md §6.2 (frozen) · 03-permissions-rls.md §1.3
--          0010 (the state column has no admin grant) · 0006 (the clock's twin)
--
-- 03 §8.2 rows (added at wave-1 sync point 6):
--   | `RPC-transition_session.admin_only` | A member, a moderator, a presenter and a stale admin
--     are all refused; an admin of another org cannot reach the session. |
--   | `RPC-transition_session.edges` | Only 02 §6.2's edges are accepted — starting a draft,
--     completing a published session, archiving anything but a completed one are all refused. |
--   | `RPC-transition_session.cancel` | Cancelling requires a reason, keeps the page and the row,
--     and is reachable from `completed` (a retroactively voided session). |
--   | `RPC-transition_session.closes_check_in` | Completing early closes the check-in window in the
--     same transaction (REQ-CHK-004). |
--
-- ── Why the edge set lives in this function and not in a trigger ────────────
-- For `proposals` I argued the opposite (0011): the audit and the guard had to
-- be triggers, because 03 §5.2b deliberately lets a member submit with a plain
-- PostgREST update, so anything in an RPC would have been optional.
--
-- `sessions.state` is different. It is in NO grant — `grant update (title,
-- abstract, level, language)` is the whole of an authenticated user's write —
-- so there is no PostgREST path to the column at all, and every writer is
-- already a definer function this track owns: create_session, publish_session,
-- the two clock functions and this one. A table-level guard would be the
-- stronger statement and I would still like one, but it would also start
-- refusing the direct `update … set state` that several fixtures and tests
-- across all three tracks use to arrange a scenario. That is a change to make
-- deliberately, at the start of a wave, not at its gate.
-- **Lead: `0008` is where I would put it. Not written, on purpose.**

create function public.transition_session(
  p_session uuid,
  p_action  text,   -- 'start' | 'complete' | 'cancel' | 'archive' | 'reopen'
  p_reason  text default null
) returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare
  actor    public.members := public.assert_fresh_admin();
  target   public.sessions;
  v_from   public.session_state;
  v_to     public.session_state;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into target from public.sessions where id = p_session and org_id = actor.org_id;
  if target.id is null then
    raise exception 'session_not_found' using errcode = '42501';
  end if;
  v_from := target.state;

  -- 02 §6.2's edges, and only those. `reopen` is `archived → completed`: the
  -- diagram gives `cancelled` no outgoing edge at all, so a cancelled session
  -- is not reopened, it is superseded by a new one.
  v_to := case p_action
            when 'start'    then case when v_from = 'published'   then 'in_progress' end
            when 'complete' then case when v_from = 'in_progress' then 'completed'   end
            when 'archive'  then case when v_from = 'completed'   then 'archived'    end
            when 'reopen'   then case when v_from = 'archived'    then 'completed'   end
            when 'cancel'   then case when v_from in ('approved', 'published', 'in_progress', 'completed', 'archived')
                                      then 'cancelled' end
          end::public.session_state;

  if p_action not in ('start', 'complete', 'cancel', 'archive', 'reopen') then
    raise exception 'unknown_session_action' using errcode = '22023';
  end if;
  if v_to is null then
    raise exception 'illegal_session_transition: % from %', p_action, v_from using errcode = '23514';
  end if;

  -- REQ-SES-010: "Cancelling requires a reason." The table's own check would
  -- catch a null and say nothing useful; it would not catch «   ».
  if v_to = 'cancelled' and v_reason is null then
    raise exception 'cancellation_reason_required' using errcode = '23514';
  end if;

  update public.sessions
     set state               = v_to,
         completed_at        = case when v_to = 'completed' and completed_at is null then now() else completed_at end,
         cancelled_at        = case when v_to = 'cancelled' then now() else cancelled_at end,
         cancellation_reason = case when v_to = 'cancelled' then v_reason else cancellation_reason end
   where id = target.id
   returning * into target;

  -- REQ-SES-005: "Completing early closes the check-in window immediately."
  -- Same transaction as the completion, for the same reason the clock does it
  -- there: any gap is a window in which the session is over and the code works.
  -- Cancelling closes it too — there is nothing left to attend.
  if v_to in ('completed', 'cancelled') then
    update public.check_in_codes
       set valid_until = least(valid_until, now())
     where session_id = target.id and valid_until > now() and revoked_at is null;
  end if;

  insert into public.session_state_transitions (org_id, session_id, from_state, to_state, actor_id, is_manual, reason)
  values (actor.org_id, target.id, v_from, v_to, actor.id, true, v_reason);

  perform public.write_audit(actor.org_id, 'session.' || p_action, 'session', target.id,
                             jsonb_build_object('state', v_from),
                             jsonb_build_object('state', v_to),
                             v_reason, 'admin', actor.id);
  return target;
end $$;

revoke execute on function public.transition_session(uuid, text, text) from public, anon;
grant  execute on function public.transition_session(uuid, text, text) to authenticated;
