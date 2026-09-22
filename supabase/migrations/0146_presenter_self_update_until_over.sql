-- 0146 · a presenter's own acceptance stops moving once the session is over.
-- Lead, wave 12 (DEC-174, scoring's question 4). Serves: REQ-SES-019, REQ-PTS-015.
--
-- `session_presenters_update_self` (0010) let a presenter set their own
-- `accepted` / `declined_at` at any time. From wave 12 presenter awards follow
-- the presenter after completion (scoring's trigger pays on joining and writes a
-- compensating row on leaving), so a presenter toggling their own row on a
-- completed session would write an unbounded run of award/reversal pairs —
-- correct in sum, noise in the ledger. The app has no screen that sets it; the
-- policy is the only thing that could.
--
-- The policy is re-created with one clause more in both halves: the session is
-- not completed, archived or cancelled. Those three states are readable by
-- every member of the org under `sessions_read`, so the subquery's own RLS
-- cannot hide the state it tests. An admin's change goes through
-- `add_session_presenter()` / `remove_session_presenter()`, unaffected.
-- The column grant (0010: accepted, declined_at) is unchanged.
--
-- 03 §8.2 rows this adds:
--   | `POL-session_presenters.update_self.not_after_completion` | A presenter of a completed or cancelled session cannot change their own `accepted` / `declined_at` (the update matches no row); on a session still ahead they can, as before. |

drop policy "session_presenters_update_self" on public.session_presenters;
create policy "session_presenters_update_self" on public.session_presenters for update to authenticated
  using      (org_id = public.auth_org_id() and member_id = public.auth_member_id()
              and not exists (select 1 from public.sessions s
                               where s.id = session_presenters.session_id
                                 and s.state in ('completed', 'archived', 'cancelled')))
  with check (org_id = public.auth_org_id() and member_id = public.auth_member_id()
              and not exists (select 1 from public.sessions s
                               where s.id = session_presenters.session_id
                                 and s.state in ('completed', 'archived', 'cancelled')));
