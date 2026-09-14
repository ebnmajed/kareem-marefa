-- promoted by the lead at wave-2 sync 3 · scoring/0004_award_presenter_points.sql — proposal_accepted, and the
-- session-completion fan-out for session_delivered, attendee_bonus,
-- rating_bonus and no_show. STORY-PTS-003, OQ-004.
-- Serves: REQ-PTS-001, REQ-PTS-008, A5, A10 · 05 §1.2, §1.3
--         · 11 §2.2 JOB-evaluate_no_shows, §2.3 JOB-award_presenter_points.
--
-- Hooks (docs/plan/notes/scoring.md): triggers on `proposals` and `sessions`
-- — both explicitly on CLAUDE.md's sanctioned-hook list — rather than
-- editing `sessions`' review/completion RPCs. Neither trigger awards
-- inline; both enqueue jobs, matching 11 §2.3 ("fan-out from completion").
--
-- Design decision worth stating (05 §3.2's cap footgun, generalised):
-- attendee_bonus is awarded ONE call to award_points() PER CHECK-IN, not
-- one call carrying `amount = 2 × count`. award_points()'s existing
-- cap_per_session logic (`used >= cap_per_session * points`) already
-- expresses "up to 30 attendees, 2 points each, 60-point ceiling" exactly
-- when called once per attendee — reusing it needs no special case, and
-- keeps every award individually reversible and individually idempotent.
--
-- rating_bonus is evaluated twice: once at the immediate fan-out (almost
-- certainly too early — ratings arrive after completion) and once more at
-- +48h (11 §2.3's delay). Both runs call the same idempotent
-- award_presenter_points task; the second run's session_delivered and
-- attendee_bonus calls are no-ops (already awarded), and rating_bonus is
-- only ever awarded once its cap_per_session = 1 is not yet used. Two
-- enqueues need two distinct job keys — the same key would just MOVE the
-- job's run_at (job_key_mode => 'replace'), not create a second run.
--
-- 03 §8.2 rows this adds:
--   POL-proposals.award_points_hook   — an approval enqueues one
--     proposal_accepted award_points job per accepted presenter (proposer
--     included), keyed pts:proposal_accepted:<proposal_id>:<member_id>.
--   POL-sessions.completion_fanout    — a session reaching `completed`
--     enqueues one evaluate_no_shows job (key noshow:<session_id>) and,
--     per accepted session presenter, two award_presenter_points jobs
--     (immediate and +48h), keyed pts:presenter:<session_id>:<member_id>
--     and the same with a :rating_bonus suffix.

-- ═══════════════════════════════════════════════════════════════════════════
-- proposals — proposal_accepted, once per accepted presenter (proposer +
-- co-presenters), the moment a proposal reaches `approved`.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.proposals_award_points() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  if new.state = 'approved' and old.state is distinct from 'approved' then
    for p in
      select proposer_id as member_id from public.proposals where id = new.id
      union
      select member_id from public.proposal_presenters where proposal_id = new.id and accepted
    loop
      perform public.enqueue_job(
        'award_points',
        jsonb_build_object('rule', 'proposal_accepted', 'member_id', p.member_id, 'source', 'proposal_accepted',
                            'source_id', new.id, 'session_id', null),
        'pts:proposal_accepted:' || new.id || ':' || p.member_id
      );
    end loop;
  end if;
  return new;
end $$;
create trigger proposals_award_points after update of state on public.proposals
  for each row execute function public.proposals_award_points();

-- ═══════════════════════════════════════════════════════════════════════════
-- sessions — the completion fan-out. One row per presenter, two jobs each;
-- one evaluate_no_shows job for the whole session.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.sessions_completion_fanout() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  if new.state = 'completed' and old.state is distinct from 'completed' then
    perform public.enqueue_job(
      'evaluate_no_shows',
      jsonb_build_object('session_id', new.id),
      'noshow:' || new.id
    );

    for p in select member_id from public.session_presenters where session_id = new.id and accepted
    loop
      perform public.enqueue_job(
        'award_presenter_points',
        jsonb_build_object('session_id', new.id, 'member_id', p.member_id),
        'pts:presenter:' || new.id || ':' || p.member_id
      );
      perform public.enqueue_job(
        'award_presenter_points',
        jsonb_build_object('session_id', new.id, 'member_id', p.member_id),
        'pts:presenter:' || new.id || ':' || p.member_id || ':rating_bonus',
        now() + interval '48 hours'
      );
    end loop;
  end if;
  return new;
end $$;
create trigger sessions_completion_fanout after update of state on public.sessions
  for each row execute function public.sessions_completion_fanout();
