-- wave 9 (DEC-150 contract 2, DEC-151) — `sessions.check_in_open` becomes the
-- stored shadow of the day set, so `main` keeps reading a true value while the
-- switch itself lives on the day (`0101`).
--
-- THE RULE: `sessions.check_in_open = bool_or(d.check_in_open)` over the
-- session's days — «attendance is still being taken SOMEWHERE in this session».
-- `bool_or`, not `bool_and`: a presenter closing Wednesday's door at 21:00 has
-- not closed the workshop, and a session-level reader must not be told they
-- have. ★ At one day, `bool_or` of one value IS that value, so the shadow is
-- the switch with no special case — which is the whole of contract 2 for this
-- column.
--
-- ★★ THE DEFECT THIS FILE IS SHAPED AROUND (caught at sync 1, DEC-151, before
-- a line was written). Two triggers pointing at each other is the obvious
-- design and it is wrong in one specific way:
--
--   three days, all closed → shadow false. The presenter reopens day 2.
--   Days are now (F, T, F); bool_or flips the shadow false → true; a naive
--   «session changed → carry onto every day» then opens days 1 and 3.
--   REOPENING ONE DAY WOULD OPEN EVERY DAY.
--
-- The fix is that the downward direction must act only for a writer of the
-- SESSION's own column — never for the shadow's own recompute. Trigger 1 marks
-- its update with a transaction-local setting AND RESETS IT IMMEDIATELY AFTER,
-- so the mark covers exactly one statement; trigger 2 stands down while it is
-- on. `pg_trigger_depth()` was considered and rejected: it would also silence a
-- legitimate session-level write made from inside any other trigger, which is
-- precisely what `transition_session()`'s early-completion close is not allowed
-- to lose.
--
-- ★ `kareem.check_in_shadow` is a custom Postgres setting, so it must contain a
-- dot and cannot be spelt any other way. `tests/unit/admin-audit-labels.test.ts`
-- reads every `'word.word'` literal in `supabase/migrations/` as an audit
-- action; it needs this name in its `NOT_ACTIONS` set beside `kareem.days_writer`
-- when this file is promoted. That file is the lead's.
--
-- WHY NO COMMIT CHECK. `0100`'s trigger C exists because a drifted window is a
-- wrong FACT about a session — an index, a sort and a card all read it. A
-- drifted shadow is cosmetic and self-heals on the next day write. Said out
-- loud rather than left as an omission.
--
-- WHAT THIS BUYS, AND IT IS THE POINT: `transition_session()` (0089) and
-- `clock_complete_sessions()` (0022) are `sessions`' functions and are NOT
-- TOUCHED. The first already writes `sessions.check_in_open = false` on early
-- completion and on cancel; trigger 2 carries that onto every day, which is
-- exactly what completing or cancelling a workshop means. One writer per
-- function (DEC-150 §4), with no seam at all.
--
-- Serves:  REQ-CHK-015, REQ-SES-015, DEC-150 contract 2
-- Cites:   0084 (sessions.check_in_open), 0089 (transition_session — its
--          behaviour is preserved by trigger 2, not by editing it),
--          0100 (session_days, sessions_sync_single_day), 0101 (the day's column)
-- Docs:    docs/plan/notes/checkin.md «Wave 9 plan» §3, §4; DEC-151
--
-- 03 §8.2 rows this adds:
--   | `POL-check_in_open.shadow_is_bool_or` | `sessions.check_in_open` equals `bool_or` of its days: closing the only open day closes the session's shadow, reopening any day opens it. |
--   | `POL-check_in_open.reopening_one_day_opens_only_that_day` | ★ Three closed days; reopening day 2 leaves days 1 and 3 closed, and flips the session's shadow to open. The defect this file exists to prevent. |
--   | `POL-check_in_open.session_write_carries_to_every_day` | A writer of the session's own column — `transition_session()`'s early completion or cancellation, or a fixture's direct `update` — closes every day of the session. |
--   | `POL-check_in_open.one_day_is_identical` | At one day the pair moves together in both directions, and `set_check_in_open()` returns a session row carrying the day's value. |

-- ═══════════════════════════════════════════════════════════════════════════
-- trigger 1 · days → the session's shadow
-- ═══════════════════════════════════════════════════════════════════════════
create function public.session_days_check_in_open_shadow() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid := coalesce(new.session_id, old.session_id);
  v_open    boolean;
begin
  select bool_or(d.check_in_open) into v_open
    from public.session_days d where d.session_id = v_session;

  -- No days left (the last one was deleted, or the session is gone): there is
  -- nothing to derive from, so the session keeps the switch it has. `bool_or`
  -- over zero rows is null, which must never be written into a `not null`
  -- column.
  if v_open is null then
    return null;
  end if;

  -- ★ The mark, and its reset one statement later. `is_local => true` scopes it
  -- to this transaction; resetting it straight after scopes it to this UPDATE,
  -- so a session-level write made later in the same transaction — by
  -- `transition_session()`, say — is still seen as the writer it is.
  perform set_config('kareem.check_in_shadow', 'on', true);
  update public.sessions set check_in_open = v_open
   where id = v_session and check_in_open is distinct from v_open;
  perform set_config('kareem.check_in_shadow', '', true);

  return null;
end $$;

-- `update of check_in_open` and not a bare `update`: moving a day's window says
-- nothing about its door, and firing on it would recompute for nothing.
-- INSERT and DELETE do matter — a day born open belongs in `bool_or`, and
-- deleting the last closed day opens the shadow.
create trigger session_days_check_in_open_shadow
  after insert or update of check_in_open or delete on public.session_days
  for each row execute function public.session_days_check_in_open_shadow();

-- ═══════════════════════════════════════════════════════════════════════════
-- trigger 2 · a writer of the SESSION's column → every day
-- ═══════════════════════════════════════════════════════════════════════════
create function public.sessions_check_in_open_to_days() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- The shadow's own recompute is not a writer. Without this, reopening one
  -- day of three would open all three (see this file's header).
  if current_setting('kareem.check_in_shadow', true) is not distinct from 'on' then
    return null;
  end if;

  -- Every day, deliberately, at any n. The only real n > 1 writer of this
  -- column is `transition_session()`'s early-completion and cancellation
  -- branches, where «close every day» is the correct reading: the workshop is
  -- over. A session-level write IS a blunt instrument, and it should be.
  update public.session_days
     set check_in_open = new.check_in_open
   where session_id = new.id and check_in_open is distinct from new.check_in_open;

  return null;
end $$;

-- Sorts after `sessions_00_sync_single_day` (0100), which fires on the window
-- and venue columns only — the two are disjoint, and the order is stated so
-- neither moves by accident.
create trigger sessions_01_check_in_open_to_days
  after update of check_in_open on public.sessions
  for each row when (old.check_in_open is distinct from new.check_in_open)
  execute function public.sessions_check_in_open_to_days();

comment on function public.session_days_check_in_open_shadow() is
  'DEC-150 contract 2: sessions.check_in_open = bool_or(its days). Marks its own update with kareem.check_in_shadow so the downward trigger stands down for it.';
comment on function public.sessions_check_in_open_to_days() is
  'DEC-151: a writer of the SESSION''s own switch — transition_session(), a fixture — closes or opens every day. Never fires for the shadow''s recompute.';
