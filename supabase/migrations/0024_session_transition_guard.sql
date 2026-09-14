-- lead (wave 2, first migration) — the session state machine, made structural;
-- evidence tables get a per-statement clock
--
-- Serves:  REQ-SES-003, REQ-SES-012, REQ-PRO-007 (the decline edge), REQ-NFR-001
-- Cites:   02-domain-model.md §6.2 (frozen; the decline edge is added under DEC-046)
--          0011 (the proposals guard — same shape, same argument) · 0020 (the decline trigger)
--          0021 (publish walks the chain) · 0022 (the clock) · 0023 (transition_session)
--          DEC-045 ("first migration of wave 2") · DEC-046
--
-- 03 §8.2 rows (added with this migration):
--   | `POL-sessions.transition.legal` | Every edge of 02 §6.2, and the presenter-decline return
--     to `draft` (REQ-PRO-007), is accepted; `draft → published`, `approved → in_progress`,
--     `completed → draft`, `published → draft` and anything out of `cancelled` are refused with
--     23514 — even by the migration owner, past every RPC. |
--   | `POL-sessions.transition.rpcs_pass` | `publish_session()`'s walk, both clock functions,
--     `transition_session()` and the decline trigger all still succeed through the guard. |
--   | `POL-evidence.occurred_at.ordered` | `audit_log` and `session_state_transitions` rows
--     written by one transaction carry strictly increasing `occurred_at`; the publish chain's
--     four rows order by time alone. |
--
-- ── Why now, and why a trigger ───────────────────────────────────────────────
-- 0023 argued the edge set could live in `transition_session()` because
-- `sessions.state` is in no grant: an authenticated user's whole write is
-- `grant update (title, abstract, level, language)`, so there is no PostgREST
-- path to the column and every writer is a definer function. That is true and
-- it is not enough. The definer functions are five today and will be more —
-- M3 reschedules, M6 attaches posters, M7's console edits — and each is a
-- place to get the edge set subtly wrong. A `before update of state` trigger
-- makes 02 §6.2 a property of the TABLE: an RPC that writes an edge the
-- diagram does not have fails its own test instead of leaving a transition row
-- the model says cannot exist. DEC-045 deferred this to the first migration of
-- wave 2 because the fixtures that arranged scenarios by writing `state`
-- directly had to move first; they now walk legal edges (tests/rls/sessions-*).
--
-- No `before insert` guard, on purpose. A row is born with a state and no
-- edge; `create_session()` is the only door for people (no insert grant, no
-- insert policy — `POL-sessions.insert.rpc`), and the fixtures across all
-- three wave-1 tracks and the e2e seeds insert published and completed rows
-- to arrange history. Refusing that would prove nothing about the product.
--
-- ── The decline edge (REQ-PRO-007) ───────────────────────────────────────────
-- 02 §6.2 draws no edge back to `draft`, but 01's REQ-PRO-007 says a presenter
-- "can decline, which returns the session to `draft`", and 0020's trigger does
-- exactly that from any unpublished state. Only 01 defines requirements; 02 is
-- amended under DEC-046 rather than the guard quietly breaking the decline.
-- Once published, a decline changes nothing (0020) — people hold seats.

create function public.sessions_guard_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- An edit that leaves the state alone is not a transition. `before update
  -- of state` fires whenever the column is NAMED in the update, which a DAL
  -- that writes a whole row does on every save.
  if new.state is not distinct from old.state then
    return new;
  end if;

  if not (
       (old.state = 'draft'             and new.state = 'submitted')
    or (old.state = 'submitted'         and new.state = 'in_review')
    or (old.state = 'in_review'         and new.state in ('changes_requested', 'approved'))
    or (old.state = 'changes_requested' and new.state = 'submitted')
    or (old.state = 'approved'          and new.state in ('published', 'cancelled'))
    or (old.state = 'published'         and new.state in ('in_progress', 'cancelled'))
    or (old.state = 'in_progress'       and new.state in ('completed', 'cancelled'))
    or (old.state = 'completed'         and new.state in ('archived', 'cancelled'))
    or (old.state = 'archived'          and new.state in ('completed', 'cancelled'))
    -- REQ-PRO-007 / DEC-046: a presenter's decline returns an unpublished session to draft.
    or (old.state in ('submitted', 'in_review', 'changes_requested', 'approved') and new.state = 'draft')
  ) then
    raise exception 'illegal_session_transition: % -> %', old.state, new.state
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger sessions_guard_transition
  before update of state on public.sessions
  for each row execute function public.sessions_guard_transition();

-- No grant: trigger-only, never called by name.

-- ── Evidence tables: one clock reading per statement, not per transaction ────
-- `now()` is the transaction's start time, so every row a transaction writes
-- shares one instant and their order is undefined: publish_session() writes
-- four transition rows and an audit row in one call, and the tests had to
-- order by `occurred_at, ctid` to read them back in sequence. `ctid` is not
-- evidence. `clock_timestamp()` is the wall clock at the moment of the
-- default's evaluation, which is per row, so rows written in sequence order by
-- time alone. The indexes on `(…, occurred_at desc)` are unchanged; only the
-- default moves. DEC-046 makes this the rule for every append-only evidence
-- table; `points_ledger` (M4) is created with it.
alter table public.audit_log                 alter column occurred_at set default clock_timestamp();
alter table public.session_state_transitions alter column occurred_at set default clock_timestamp();
