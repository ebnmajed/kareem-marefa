-- wave 7 (DEC-141) — REQ-SES-005's "completing early closes the check-in
-- window immediately" is re-implemented on the new switch, replacing the
-- old code-truncation mechanism 0023 used under the state-based model.
--
-- Cross-track hook, flagged for sign-off (docs/plan/notes/checkin.md §2):
-- `transition_session()` is `sessions`'-owned (0023).
--
-- ★ WHAT CHANGES, STATED PLAINLY. 0023's existing behaviour truncates the
-- CURRENT CODE's `valid_until` to `now()` on early completion or
-- cancellation — under the old state-based gate, that was sufficient,
-- because `check_in()`/`ensure_check_in_code()` both refused outright once
-- `state <> 'in_progress'` anyway. Under DEC-141's clock-only floor/ceiling,
-- neither RPC cares about `state` transitioning to `completed` early — the
-- window (`starts_at` … `ends_at + 2h`) is unaffected by it — so code
-- truncation alone would do NOTHING: the very next `ensure_check_in_code()`
-- call would simply mint a fresh, valid code and check-in would silently
-- resume, with no "closed" state visible anywhere and no reopen needed.
-- That is a regression from REQ-CHK-015's actual requirement (a DELIBERATE,
-- audited, reopenable act), so the truncation block is REMOVED and replaced
-- with the one mechanism that actually models "closed": `check_in_open :=
-- false`, on the SAME transaction, reversible afterwards by the room's
-- ordinary reopen action (REQ-CHK-015's "close and reopen it, at any
-- time"), up to the ceiling (`set_check_in_open()`, checkin/01).
--
-- On-time or late completion (the CLOCK's own `clock_complete_sessions()`,
-- 0022, untouched) needs no equivalent: the ceiling already closes the
-- window 2h after the SCHEDULED end regardless of the switch.
-- Cancellation forces the switch closed too, though ruling 1's state gate
-- (checkin/01) already refuses check-in on a cancelled session outright —
-- redundant, not load-bearing, kept for the audit trail's own honesty.
--
-- Serves:  REQ-SES-005, REQ-CHK-015 (supersedes the mechanism, not the requirement)
-- Cites:   0023 (transition_session, re-created)
-- Docs:    docs/plan/notes/checkin.md "Wave 7 plan" §2
--
-- 03 §8.2 rows this adds (supersedes `RPC-transition_session.closes_check_in`'s
-- OLD mechanism description, same requirement, new implementation):
--   | `RPC-transition_session.check_in_open_early` | Completing a session BEFORE its scheduled end sets `check_in_open = false` in the same transaction; completing on or after the scheduled end leaves it untouched (the ceiling already governs). |
--   | `RPC-transition_session.check_in_open_cancel` | Cancelling sets `check_in_open = false` too. |
--   | `RPC-transition_session.check_in_open_reopenable` | An early close from completion is an ordinary close — the room can reopen it through `set_check_in_open()`, same as any other, up to the ceiling. |

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
create or replace function public.transition_session(
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
         cancellation_reason = case when v_to = 'cancelled' then v_reason else cancellation_reason end,
         -- ★ DEC-141/REQ-CHK-015: replaces 0023's check_in_codes truncation
         -- (see this file's header for why that no longer does anything
         -- under the clock-only window). Early completion closes the
         -- switch; on-time/late completion leaves it (the ceiling already
         -- governs); cancellation closes it too, redundantly with ruling 1's
         -- state gate.
         check_in_open       = case
                                  when v_to = 'completed' and ends_at is not null and now() < ends_at then false
                                  when v_to = 'cancelled' then false
                                  else check_in_open
                                end
   where id = target.id
   returning * into target;

  insert into public.session_state_transitions (org_id, session_id, from_state, to_state, actor_id, is_manual, reason)
  values (actor.org_id, target.id, v_from, v_to, actor.id, true, v_reason);

  perform public.write_audit(actor.org_id, 'session.' || p_action, 'session', target.id,
                             jsonb_build_object('state', v_from),
                             jsonb_build_object('state', v_to),
                             v_reason, 'admin', actor.id);
  return target;
end $$;
