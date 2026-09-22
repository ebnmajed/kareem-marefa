-- wave 12 (REQ-SES-019, REQ-PTS-015, DEC-172, DEC-174) — presenter awards
-- follow the presenter, and proposal_accepted moves from approval to
-- completion under the key it has always had. Needs 0007.
--
-- Contract 2 (DEC-172): `sessions` inserts, updates and deletes
-- `session_presenters` rows and never names a scoring function. The trigger
-- below decides the money, so 0010's direct admin policies are covered as
-- well as sessions' RPCs and the owner's data fix.
--
-- ★ EXISTING JOBS UNDER EXISTING KEYS. Joining after completion enqueues
-- exactly what sessions_completion_fanout() would have enqueued at
-- completion: `award_presenter_points` under `pts:presenter:<S>:<M>` (and its
-- `:rating_bonus` twin while +48 h is still ahead), and `award_points` under
-- `pts:proposal_accepted:<proposal>:<M>`. `main`'s worker knows every one of
-- them; no task changes. award_points() (0007) re-derives the completed
-- session and the accepted presenter when each job runs.
--
-- ★ A DATA FIX IS AN UPDATE LIKE ANY OTHER (DEC-174 ruling 3). Flipping a row
-- to `accepted = true` on a completed or archived session PAYS that presenter,
-- through these jobs. Whether that is wanted for the directly created sessions
-- whose presenters were stuck at `false` is the owner's question; running the
-- fix before or after this file is the answer.
--
-- Serves:  REQ-SES-019, REQ-PTS-015, REQ-PTS-013, REQ-PTS-012, invariant 9
-- Cites:   0031 (sessions_completion_fanout — re-created; proposals_award_
--          points — dropped), 0087 (the reversal shape), 0007 (the guard and
--          the presenter epoch), 0020 (session_presenter_declined — untouched)
-- Docs:    docs/plan/notes/scoring.md "Wave 12 plan" A2, A3
--
-- 03 §8.2 rows this adds:
--   | `POL-proposals.no_award_at_approval` | An approval enqueues nothing: the trigger is gone. |
--   | `POL-sessions.completion_pays_proposal_presenters` | Completion enqueues `pts:proposal_accepted:<proposal>:<member>` for each accepted session presenter who was on the proposal, with the session's id; none for a direct session. |
--   | `POL-sessions.proposal_accepted_never_twice` | A proposal paid at approval before this migration is not paid again at completion: the same ledger key. |
--   | `POL-session_presenters.pays_on_join_after_completion` | Inserting an accepted row, or updating one to accepted, on a completed session enqueues the fan-out's jobs for that presenter; before completion, nothing. |
--   | `POL-session_presenters.reverses_on_leave` | Deleting an accepted row, or updating it away from accepted, writes one compensating row per standing presenter award, «أُزيل من مقدّمي الجلسة», `reversal:<id>:v1`. |
--   | `POL-session_presenters.reverses_legacy_proposal_accepted` | A `proposal_accepted` paid at approval is reversed when that presenter leaves, before completion too. |
--   | `POL-session_presenters.epoch_repays_after_readd` | Removed and re-added after completion: `v1`, its reversal, `v2`. |
--   | `POL-session_presenters.trigger_is_definer` | An admin's delete through `p2_admin_delete` writes the reversal, though the admin has no grant on the ledger. |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · proposal_accepted leaves the approval
-- ═══════════════════════════════════════════════════════════════════════════
drop trigger proposals_award_points on public.proposals;
drop function public.proposals_award_points();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · what the fan-out enqueues for ONE presenter — the completion loop and
-- the join trigger call it, so the two can never pay differently.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.enqueue_presenter_awards(p_session uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
begin
  select * into s from public.sessions where id = p_session;
  if not found then
    return;
  end if;

  perform public.enqueue_job(
    'award_presenter_points',
    jsonb_build_object('session_id', p_session, 'member_id', p_member),
    'pts:presenter:' || p_session || ':' || p_member
  );
  -- The +48 h recheck for ratings that arrive after completion. The immediate
  -- job evaluates rating_bonus too, so once +48 h has passed one job is enough.
  if coalesce(s.completed_at, now()) + interval '48 hours' > now() then
    perform public.enqueue_job(
      'award_presenter_points',
      jsonb_build_object('session_id', p_session, 'member_id', p_member),
      'pts:presenter:' || p_session || ':' || p_member || ':rating_bonus',
      coalesce(s.completed_at, now()) + interval '48 hours'
    );
  end if;

  -- DEC-172: proposal_accepted at completion, under the job key and the
  -- ledger key it had at approval — so one already paid is never paid twice.
  -- DEC-174 ruling 5: it now names the session.
  if public.proposal_presenter(s.proposal_id, p_member) then
    perform public.enqueue_job(
      'award_points',
      jsonb_build_object('rule', 'proposal_accepted', 'member_id', p_member, 'source', 'proposal_accepted',
                          'source_id', s.proposal_id, 'session_id', p_session),
      'pts:proposal_accepted:' || s.proposal_id || ':' || p_member
    );
  end if;
end $$;
revoke execute on function public.enqueue_presenter_awards(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.enqueue_presenter_awards(uuid, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · sessions_completion_fanout — re-created from 0031. The no-show job is
-- verbatim; each accepted presenter's jobs now come from section 2, which
-- adds proposal_accepted to what 0031 enqueued.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.sessions_completion_fanout() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  if new.state = 'completed' and old.state is distinct from 'completed' then
    perform public.enqueue_job(
      'evaluate_no_shows',
      jsonb_build_object('session_id', new.id),
      'noshow:' || new.id
    );

    for p in select member_id from public.session_presenters
              where session_id = new.id and accepted and declined_at is null
    loop
      perform public.enqueue_presenter_awards(new.id, p.member_id);
    end loop;
  end if;
  return new;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · the trigger — presenter awards follow the presenter
--
-- `was` / `is`, not the operation: an insert with `accepted`, an update from
-- pending or declined to accepted (sessions' add, DEC-174), and the owner's
-- data fix are all «becomes an accepted presenter»; a delete (sessions'
-- remove), `accepted` → false and `declined_at` set are all «stops being one».
-- It never raises: a failed award must never undo an admin's change.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.session_presenters_awards() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_was     boolean := false;
  v_is      boolean := false;
  v_session uuid;
  v_member  uuid;
  s         public.sessions;
  l         public.points_ledger;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_was := old.accepted and old.declined_at is null;
    v_session := old.session_id;
    v_member := old.member_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_is := new.accepted and new.declined_at is null;
    v_session := new.session_id;
    v_member := new.member_id;
  end if;
  if v_was = v_is then
    return null;
  end if;

  -- A cascade from a deleted session or member: nothing left to pay or to
  -- compensate against.
  select * into s from public.sessions where id = v_session;
  if not found or not exists (select 1 from public.members where id = v_member) then
    return null;
  end if;

  if v_is then
    -- Joining. Before completion nothing is owed yet — the completion fan-out
    -- will find this row. After it, the fan-out has already run.
    if s.state in ('completed', 'archived') then
      perform public.enqueue_presenter_awards(v_session, v_member);
    end if;
  else
    -- Leaving. One compensating row per standing presenter award for this
    -- session — 0087's shape, never an update or a delete (invariant 9).
    -- Before completion this finds nothing, except a proposal_accepted paid at
    -- approval before 0008 — which the second branch of the WHERE finds by the proposal,
    -- because such a row carries no session_id.
    for l in
      select a.* from public.points_ledger a
       where a.member_id = v_member
         and (   (a.session_id = v_session and a.source in ('session_delivered', 'attendee_bonus', 'rating_bonus', 'proposal_accepted'))
              or (s.proposal_id is not null and a.source = 'proposal_accepted' and a.source_id = s.proposal_id))
         and not exists (select 1 from public.points_ledger rv
                          where rv.source = 'reversal' and rv.source_id = a.id)
       order by a.occurred_at, a.id
    loop
      insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                        reason, rule_key, idempotency_key)
      values (l.org_id, l.member_id, -l.amount, 'reversal', l.id, l.session_id,
              'أُزيل من مقدّمي الجلسة', l.rule_key, 'reversal:' || l.id || ':v1')
      on conflict (idempotency_key) do nothing;
    end loop;
  end if;
  return null;
end $$;

create trigger session_presenters_awards
  after insert or delete or update of accepted, declined_at on public.session_presenters
  for each row execute function public.session_presenters_awards();
