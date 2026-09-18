-- 0138_survey_results.sql — proposed by `event`, read line by line and promoted by the lead (wave 10, sync 3).
-- event (wave 10, E1 — the read half) — the one function that releases results.
--
-- Serves:  REQ-SUR-005, REQ-SUR-006, REQ-SUR-007, REQ-SUR-008
-- Cites:   DEC-160 §3.3 (results leave through ONE definer function, for the
--          screen and the CSV alike), sync 1 Q1 (`survey_min_responses`, its
--          own column, floor 3), Q2 (presenting wins over the role), R5
--          (`eligible_count = greatest(active, n)`), R6 (one expression for
--          the released set), 0124 (the tables and the column)
-- Docs:    docs/plan/notes/event.md "Wave 10 plan" §7
--
-- 03 §8.2 rows this adds (tests/rls/survey-results.test.ts):
--   | `RPC-survey_results.staff_only` | An admin and a moderator read; a member is refused `not_authorized`; a stale admin is refused `stale_claims`; another org's session is `not_found`. |
--   | `RPC-survey_results.presenter_refused` | ★ The session's presenter is refused — whatever their role. An admin who presented their own session is refused too (REQ-SUR-005 is about presenting, not about rank). |
--   | `RPC-survey_results.withheld_below_minimum` | Below `survey_min_responses` nothing leaves: no mean, no distribution, no free text — and no response count either, because in a survey one person answered the register says who. |
--   | `RPC-survey_results.withheld_per_question` | At or above the minimum, a question that FEWER than the minimum answered is withheld on its own while the rest are drawn — and its own answered count is withheld with it. |
--   | `RPC-survey_results.withheld_hides_n` | In the withheld branch the eligible count is the ACTIVE ATTENDEE count alone: `greatest(attendees, responses)` would publish `n` itself whenever a check-in was removed after its member answered. |
--   | `RPC-survey_results.drawn` | At the minimum: a scale question's count, mean and 1…5 distribution; a choice question's per-option counts in the authored order; free text as a list. |
--   | `RPC-survey_results.free_text_order` | Free text comes back ordered by the answer's random id — never by insertion, which would be the order people answered in. |
--   | `RPC-survey_results.response_rate` | The numerator is the stored responses and the denominator the session's active attendees; with no eligible attendee the count is zero and the caller says so rather than dividing. |
--   | `RPC-survey_results.rate_never_exceeds_one` | A member whose check-in is removed AFTER they answered cannot be taken out of the box, so the denominator is `greatest(attendees, responses)` and the rate is never above 100 %. |
--
-- ── Why one function ────────────────────────────────────────────────────────
-- `survey_responses` and `survey_answers` are readable by no client role at
-- all, so this is the only way results leave the database — and the screen and
-- the CSV both call it. That is what makes «the withhold applies to the export
-- exactly as it does to the screen» (REQ-SUR-007) true by construction instead
-- of by a second implementation someone has to keep in step.
--
-- ── The withhold ────────────────────────────────────────────────────────────
-- `n` = stored responses. Below `org_settings.survey_min_responses` NOTHING
-- leaves, `n` included: the register knows who answered, so publishing «1»
-- beside an attendance list the same staff member can read is the other half of
-- a name. At or above it, each QUESTION is released only if its own answered
-- count reaches the minimum too — an optional question can sit far below the
-- survey's own count.
--
-- There is deliberately NO cell-level suppression inside a released question: a
-- cell count says that somebody chose an option, never who, while a
-- distribution over two responses read against a twelve-person attendance list
-- narrows to two people. The unit of disclosure is the RESPONSE.
--
-- ★ R6 — the released set is ONE expression (`v_responses`), so the day the
-- owner asks for batch release it is one line and not an audit of this file.

create function public.survey_results(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m          public.members := public.assert_survey_staff();
  sv         public.surveys;
  v_min      int;
  v_n        int;
  -- ★ R6: the released set is ONE expression. The day the owner asks for batch
  -- release (`12` §9's differencing residue), this array's query is the single
  -- line that changes — not five copies of a subselect, four of which someone
  -- would find later.
  v_released uuid[];
  v_attend   int;
  v_eligible int;
  v_questions jsonb;
begin
  -- REQ-SUR-005, and it is the point of the whole ask: a presenter never reads
  -- their own session's survey. Checked BEFORE the survey is even looked up, so
  -- a presenter cannot tell an attached survey from an absent one.
  if public.is_presenter_of(p_session) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into sv from public.surveys where session_id = p_session and org_id = m.org_id;
  if not found then
    if not exists (select 1 from public.sessions s where s.id = p_session and s.org_id = m.org_id) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return jsonb_build_object('status', 'no_survey');
  end if;

  -- ★ FAIL CLOSED (found by `designer`'s adversarial read, fixed by the lead
  -- before this file reached any database but the local one). The COLUMN is
  -- `not null default 3`, but a missing `org_settings` ROW assigns nothing and
  -- leaves `v_min` NULL — and every guard below is a comparison with it. A NULL
  -- comparison is not false, it is NULL: `if v_n < v_min` is not taken, `case
  -- when a.answered < v_min` falls through, and ONE response's every free-text
  -- answer is released with `withheld` reading null rather than true. Nothing in
  -- the schema makes an org have a settings row — `create_org()` does it by
  -- convention, and a fixture, a seed or a restore need not — so the withhold
  -- must not depend on it. The floor of sync 1 (`0124`'s check) is the answer
  -- when there is no row; `greatest()` holds it even against a row that a
  -- future migration might let go lower.
  select os.survey_min_responses into v_min from public.org_settings os where os.org_id = m.org_id;
  v_min := greatest(coalesce(v_min, 3), 3);
  v_released := array(select r.id from public.survey_responses r where r.survey_id = sv.id);
  -- `cardinality` of `{}` is 0 and of NULL is NULL; `array(select …)` over no
  -- rows gives `{}`, so the coalesce is belt and braces.
  v_n := coalesce(cardinality(v_released), 0);

  -- REQ-SUR-008: eligible attendees — distinct members with an ACTIVE check-in
  -- on any day of the session (wave 9: one check-in per member per day).
  select count(distinct c.member_id)::int into v_attend
    from public.check_ins c where c.session_id = p_session and c.removed_at is null;
  -- ★ R5, and ONLY in the drawn branch: an admin may remove a check-in AFTER
  -- that member answered, and the response cannot be found to remove — by
  -- design. There the denominator is the larger of the two, so the rate is
  -- never above 100 % and never an error, and `n` is published anyway.
  v_eligible := greatest(v_attend, v_n);

  if v_n < v_min then
    -- Nothing at all: not a mean, not a distribution, not the count — and ★ NOT
    -- `greatest(v_attend, v_n)` either. Staff can count the active attendees
    -- themselves on the attendance screen, so whenever removals put `v_n` above
    -- `v_attend` that number IS `n` — the one number this branch exists to
    -- hide. The attendee count alone tells them nothing they did not have.
    return jsonb_build_object(
      'status', 'withheld',
      'survey_id', sv.id,
      'title', sv.title,
      'attached_at', sv.attached_at,
      'min', v_min,
      'eligible_count', v_attend
    );
  end if;

  select jsonb_agg(q.result order by q.position) into v_questions
    from (
      select sq.position,
             jsonb_build_object(
               'id', sq.id,
               'kind', sq.kind,
               'prompt', sq.prompt,
               'required', sq.required,
               -- ★ NULL while withheld, for the reason one level up: between a
               -- read at 3 responses and a read at 4, an optional question's
               -- count going 1 → 2 says the newest respondent answered it.
               -- «Withheld» already tells staff it is below the minimum.
               'answered_count', case when a.answered >= v_min then a.answered end,
               'withheld', a.answered < v_min,
               'mean', case when a.answered >= v_min and sq.kind = 'scale_1_5'
                            then round(a.mean, 2) end,
               'distribution', case
                 when a.answered < v_min then null
                 when sq.kind = 'scale_1_5' then coalesce((
                   select jsonb_agg(jsonb_build_object('value', v.value, 'count', coalesce(c.n, 0)) order by v.value)
                     from generate_series(1, 5) as v(value)
                     left join (
                       select sa.scale_value as value, count(*)::int as n
                         from public.survey_answers sa
                        where sa.question_id = sq.id and sa.response_id = any(v_released)
                        group by sa.scale_value
                     ) c on c.value = v.value
                 ), '[]'::jsonb)
                 when sq.kind in ('single_choice', 'multi_choice') then coalesce((
                   select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'count', coalesce(c.n, 0)) order by o.position)
                     from public.survey_question_options o
                     left join (
                       select sa.option_id, count(*)::int as n
                         from public.survey_answers sa
                        where sa.question_id = sq.id and sa.response_id = any(v_released)
                        group by sa.option_id
                     ) c on c.option_id = o.id
                    where o.question_id = sq.id
                 ), '[]'::jsonb)
                 else null end,
               -- ★ Ordered by the answer's own v4 uuid: random, stable between
               -- two reads, and uncorrelated with the order people answered in —
               -- which `ctid`, insertion order and any timestamp would carry.
               'texts', case
                 when a.answered < v_min or sq.kind <> 'free_text' then null
                 else coalesce((
                   select jsonb_agg(sa.text_value order by sa.id)
                     from public.survey_answers sa
                    where sa.question_id = sq.id and sa.response_id = any(v_released)
                 ), '[]'::jsonb)
               end
             ) as result
        from public.survey_questions sq
        cross join lateral (
          -- How many RESPONSES answered this question — not how many rows it
          -- has: a multi_choice answer is several rows from one response.
          select count(distinct sa.response_id)::int as answered,
                 avg(sa.scale_value)::numeric as mean
            from public.survey_answers sa
           where sa.question_id = sq.id
             and sa.response_id = any(v_released)
        ) a
       where sq.survey_id = sv.id
    ) q;

  return jsonb_build_object(
    'status', 'ok',
    'survey_id', sv.id,
    'title', sv.title,
    'attached_at', sv.attached_at,
    'min', v_min,
    'response_count', v_n,
    'eligible_count', v_eligible,
    'questions', coalesce(v_questions, '[]'::jsonb)
  );
end $$;
revoke execute on function public.survey_results(uuid) from public, anon;
grant  execute on function public.survey_results(uuid) to authenticated;

comment on function public.survey_results(uuid) is
  'REQ-SUR-005 … 008: the ONLY way survey results leave the database. Staff of the owning org, never the session''s presenter whatever their role. Below org_settings.survey_min_responses nothing is returned — the response count included — and above it each question is released only if its own answered count reaches the minimum. The screen and the CSV both call this, so the withhold is identical on both by construction.';
