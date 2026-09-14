-- promoted by the lead at wave-2 sync 2 · scoring/0003_award_hooks_ratings_comments.sql — rating_submitted and
-- comment points, hooked in as triggers rather than editing `event`'s RPCs
-- (docs/plan/notes/scoring.md's "Hooks into other tracks' tables": `ratings`
-- is explicitly named in CLAUDE.md's sanctioned-hook list; `comments` gets
-- the same non-invasive treatment for consistency, since it has no
-- TODO(scoring, M4) marker of its own to replace).
-- Serves: REQ-PTS-001, REQ-PTS-006, A10 · 11 §2.3 JOB-award_points
--         (`Trigger: check-in, rating, comment, photo`).
-- STORY-PTS-002.
--
-- Neither trigger writes to points_ledger itself — both enqueue an
-- `award_points` job through public.enqueue_job() (0025), same as
-- check_in()'s hook (0002_award_points.sql): the member's own action (rating
-- a session, posting a comment) must commit and return regardless of what
-- the scoring engine later decides.
--
-- 03 §8.2 rows this adds:
--   POL-ratings.award_points_hook  — a rating insert enqueues one
--     `award_points` job keyed `pts:rating:<rating.id>`.
--   POL-comments.award_points_hook — a comment insert (top-level or a reply)
--     enqueues one `award_points` job keyed `pts:comment:<comment.id>`.

create function public.ratings_award_points() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.enqueue_job(
    'award_points',
    jsonb_build_object('rule', 'rating_submitted', 'member_id', new.member_id, 'source', 'rating',
                        'source_id', new.id, 'session_id', new.session_id),
    'pts:rating:' || new.id
  );
  return new;
end $$;
create trigger ratings_award_points after insert on public.ratings
  for each row execute function public.ratings_award_points();

create function public.comments_award_points() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.enqueue_job(
    'award_points',
    jsonb_build_object('rule', 'comment', 'member_id', new.author_id, 'source', 'comment',
                        'source_id', new.id, 'session_id', new.session_id),
    'pts:comment:' || new.id
  );
  return new;
end $$;
create trigger comments_award_points after insert on public.comments
  for each row execute function public.comments_award_points();
