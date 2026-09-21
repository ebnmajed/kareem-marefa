-- event (wave 10, E5) — `ratings` holds no instant finer than a day.
--
-- Serves:  REQ-SUR-009, REQ-SUR-004, REQ-RAT-004
-- Cites:   DEC-160 §3.4 (the ruling, and the backfill in the same file),
--          DEC-094 (the coarsening, decided and never built), 16 §9.2a,
--          0010 (`ratings`, `session_rating_aggregates`), 0029
--          (`ratings_award_points`, the only other trigger on the table)
-- Docs:    docs/plan/notes/event.md "Wave 10 plan" §10
--
-- 03 §8.2 rows this adds (tests/rls/ratings-day-precision.test.ts):
--   | `POL-ratings.day_precision.insert` | A rating written by a member is stored at midnight UTC — the instant it was written is not recoverable from the row. |
--   | `POL-ratings.day_precision.update` | An edit coarsens `edited_at` too: `main`'s app writes it from JavaScript at millisecond precision, and the trigger covers `update` for exactly that reason. |
--   | `POL-ratings.day_precision.backfill` | The rows that existed before this file are coarsened by it, and coarsening an already-coarsened row changes nothing. |
--   | `POL-ratings.day_precision.no_award` | The backfill enqueues no `award_points` job: `ratings_award_points` is `after insert`, and this is an `update`. |
--   | `POL-ratings.aggregate.comment_order` | The presenter's comment list is ordered by the rating's random id, never by submission: submission order is itself a disclosure to a presenter who watched people leave. |
--
-- ── Why the day, and why it is a trigger ────────────────────────────────────
-- A survey response that carries no member is only unlinkable while nothing
-- ELSE can be paired with it by time. `ratings` is the row that names the
-- member and, until this file, the minute. Nothing reads either instant at
-- finer than a day — `rate/page.tsx` shows no rating time, the admin's
-- attendance screen shows stars and the comment, the aggregates view shows
-- counts and averages — so the precision is cost without a reader.
--
-- A trigger rather than a default, because `submitted_at` arrives from a
-- plain RLS insert with no RPC to put the rule in, and `edited_at` arrives
-- from JavaScript (`lib/dal/ratings.ts`). Both are covered here, and both are
-- covered for `main`'s app in the window between the migration's push and
-- Vercel's redeploy (DEC-160 rule 4).
--
-- ★ PINNED TO UTC, NOT TO THE SESSION'S TIME ZONE. `date_trunc('day', ts)` on
-- a `timestamptz` truncates in the CONNECTION's `TimeZone` setting: PostgREST,
-- the worker and psql could each store a different instant for the same
-- rating. A guarantee that depends on a client setting is not one. The org's
-- own zone was the alternative and is rejected twice over: it would read
-- `org_settings` on every rating write, and an org that later changed its zone
-- would leave two generations of rows meaning different things.
--
-- The trigger is a PLAIN (invoker) function: it rewrites NEW and reads
-- nothing, so it needs no elevated right. `tests/rls/definer-exposure.test.ts`
-- skips trigger functions in any case — Postgres refuses to call one directly.

create function public.ratings_coarsen_instants() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.submitted_at := date_trunc('day', new.submitted_at at time zone 'UTC') at time zone 'UTC';
  if new.edited_at is not null then
    new.edited_at := date_trunc('day', new.edited_at at time zone 'UTC') at time zone 'UTC';
  end if;
  return new;
end $$;

create trigger ratings_coarsen_instants before insert or update on public.ratings
  for each row execute function public.ratings_coarsen_instants();

comment on column public.ratings.submitted_at is
  'DEC-160 §3.4: stored coarsened to the day (UTC) by ratings_coarsen_instants(). The minute a rating was written is deliberately not recoverable — it is what would pair a member with an anonymous survey response.';
comment on column public.ratings.edited_at is
  'DEC-160 §3.4: coarsened to the day (UTC) like submitted_at. Written from the app at millisecond precision, which is why the trigger covers UPDATE.';

-- ── The rows that are already here ──────────────────────────────────────────
-- DEC-160 §3.4 asks for the backfill in the same file, and this is the
-- completion of a schema change rather than DEC-023's «one-off data fix as a
-- migration»: without it the guarantee holds for tomorrow's raters and not for
-- the ones it was written for.
--
-- The `where` clause makes it idempotent and makes the production run's row
-- count meaningful — the owner counts first, then updates (the wave's order).
-- ★ No trigger fires on this UPDATE that would act on it: `ratings` carries
-- exactly one other trigger, `ratings_award_points` (0029), and it is
-- `after insert`. The backfill awards nothing and enqueues nothing.
update public.ratings
   set submitted_at = date_trunc('day', submitted_at at time zone 'UTC') at time zone 'UTC',
       edited_at    = case when edited_at is null then null
                           else date_trunc('day', edited_at at time zone 'UTC') at time zone 'UTC' end
 where submitted_at <> date_trunc('day', submitted_at at time zone 'UTC') at time zone 'UTC'
    or (edited_at is not null
        and edited_at <> date_trunc('day', edited_at at time zone 'UTC') at time zone 'UTC');

-- ── The presenter's comment list ────────────────────────────────────────────
-- Re-created verbatim from 0010 with ONE change: `order by r.submitted_at`
-- becomes `order by r.id`. Two reasons, and the first is the requirement:
-- submission order is itself a disclosure to a presenter who watched the room
-- empty, and `array_agg` in submission order hands it to them in a single
-- column. The second is that after the coarsening above the old ordering would
-- be arbitrary-within-a-day anyway, and «arbitrary» is not a guarantee —
-- `ratings.id` is a v4 uuid, random and uncorrelated with when the row was
-- written, so the order is stable across two reads and says nothing.
--
-- `create or replace` keeps the view's grants and its every column, name and
-- type; `security_invoker = false` is restated because the view reads the base
-- table as its owner and the presenter's scope is the predicate, not RLS.
-- No test asserts the old order (`ratings-count.test.ts:18`,
-- `m2-schema.test.ts:260,264` read `rating_count` and the column list).
create or replace view public.session_rating_aggregates
with (security_invoker = false) as
  select r.org_id,
         r.session_id,
         count(*)::int                         as rating_count,
         round(avg(r.session_stars), 2)        as session_avg,
         round(avg(r.presenter_stars), 2)      as presenter_avg,
         array_remove(array_agg(r.comment order by r.id), null) as comments
    from public.ratings r
    join public.org_settings os on os.org_id = r.org_id
   where r.org_id = public.auth_org_id()
     and (public.is_staff() or public.is_presenter_of(r.session_id))
   group by r.org_id, r.session_id, os.rating_min_aggregate
  having count(*) >= os.rating_min_aggregate;
