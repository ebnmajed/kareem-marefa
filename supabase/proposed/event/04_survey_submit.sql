-- event (wave 10, E1 — the answer half) — the one function that accepts an
-- answer, and the one that stores it.
--
-- Serves:  REQ-SUR-003, REQ-SUR-004, REQ-SUR-009
-- Cites:   DEC-160 §3 (the storage contract — this file IS it), DEC-094 (the
--          jittered delay), DEC-043 (the envelope; nothing raises after a
--          write), 0025 (`enqueue_job` — `p_key`, `p_run_at`), 0087
--          (`has_checked_in` — an ACTIVE check-in on any day), event/02
--          (`rating_window_open` — the window, defined once), 0124 (the tables)
-- Docs:    docs/plan/notes/event.md "Wave 10 plan" §2, §4, §5, §12
--
-- 03 §8.2 rows this adds (tests/rls/survey-submit.test.ts, survey-structure.test.ts):
--   | `RPC-submit_survey_response.eligibility` | Exactly the members who may rate may answer: no check-in, a removed check-in, a session that has not completed and one past the window are each refused `not_eligible` with the reason. |
--   | `RPC-submit_survey_response.agrees_with_rating_policy` | Across those situations the answer is `not_eligible` exactly when a rating insert is refused — the survey never admits someone the rating turns away. |
--   | `RPC-submit_survey_response.second_submission` | A second submission is refused `already_answered`, read from the register by name, and enqueues nothing. |
--   | `RPC-submit_survey_response.validates_before_writing` | A missing required question, an option of another question, a scale out of range and an unknown question are each refused naming the question ids — and no participation and no job are left behind. |
--   | `RPC-submit_survey_response.enqueues_decorrelated` | One job, task `record_survey_response`, key NULL, `run_at` between 10 minutes and 4 hours ahead, payload `{response_id, survey_id, answers}` and nothing else. |
--   | `RPC-submit_survey_response.no_audit` | The submit writes no `audit_log` row. |
--   | `RPC-record_survey_response.service_role_only` | `anon`, a member, a moderator and an admin are all refused; the worker's role succeeds. |
--   | `RPC-record_survey_response.replay` | Running the same job twice writes one response — the id is in the payload and the insert is `on conflict do nothing`. |
--   | `RPC-survey_for_member.no_survey` | A session with no survey answers `null` — nothing about a survey reaches a member who has none (REQ-SUR-001). |
--   | `RPC-survey_for_member.audience` | It answers a member with an active check-in (or one who has already answered) and nobody else: a member who never attended cannot read a session's questions by its id. |
--
-- ── The contract this file exists to keep ───────────────────────────────────
-- ★ A stored response names no member. The member's action writes TWO things
-- and neither is the answer: the rating (its own plain insert, elsewhere) and
-- the REGISTER row that says «this member answered», which carries no answer
-- and no time. The answers themselves go onto the queue with a jittered
-- `run_at` and a payload that names no member, and a job — not a member —
-- writes them. `survey_responses` and `survey_answers` are unreachable from
-- every client role, so the only way out is `survey_results()` (file 05) under
-- the withhold.
--
-- ★ VALIDATE, THEN WRITE. Everything that can refuse is read-only and happens
-- before the register row, so a refusal leaves NOTHING behind and the member
-- can fix a missed required question and submit again (DEC-043: no raise after
-- a write — here, no write before the decision). The one write-then-decide
-- moment is the register itself, and it is an `insert … on conflict do nothing`
-- whose zero-row result IS `already_answered`.
--
-- ★ THE KEY IS NULL, deliberately. `enqueue_job()` always passes
-- `job_key_mode => 'replace'`, so a key is a COLLAPSE mechanism: two responses
-- sharing one would become one job and one answer would be lost. And a key
-- derived from the member — `survey:<survey>:<member>` — would be the leak in a
-- single string (DEC-160 §3.2). Idempotency comes from `response_id`, which is
-- generated HERE in SQL and is uncorrelated with anything.

-- ── What the member's screen reads ──────────────────────────────────────────
-- One call, so `survey_participations` needs no client grant and the six
-- authoring tables stay staff-only: the member never selects a survey table.
-- Returns `null` for a session with no survey — REQ-SUR-001's «shows nothing
-- about one, anywhere» starts here, in the database.
create function public.survey_for_member(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_member uuid := public.auth_member_id();
  sv       public.surveys;
  v_answered boolean;
begin
  select * into sv from public.surveys
   where session_id = p_session and org_id = public.auth_org_id();
  if not found then
    return null;
  end if;

  v_answered := exists (select 1 from public.survey_participations
                         where survey_id = sv.id and member_id = v_member);
  -- R2: the questions are for someone who may answer them. A member who never
  -- attended cannot read a session's questions by holding its id; one who has
  -- already answered still sees the survey, so the screen can say «أجبت».
  if not v_answered and not public.has_checked_in(p_session) then
    return null;
  end if;

  return jsonb_build_object(
    'survey_id', sv.id,
    'title', sv.title,
    'attached_at', sv.attached_at,
    'answered', v_answered,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id,
               'kind', q.kind,
               'prompt', q.prompt,
               'required', q.required,
               'options', coalesce((
                 select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.position)
                   from public.survey_question_options o where o.question_id = q.id
               ), '[]'::jsonb)
             ) order by q.position)
        from public.survey_questions q where q.survey_id = sv.id
    ), '[]'::jsonb)
  );
end $$;
revoke execute on function public.survey_for_member(uuid) from public, anon;
grant  execute on function public.survey_for_member(uuid) to authenticated;

-- ── The one function that accepts an answer ─────────────────────────────────
-- `p_answers`: [{ "question_id": uuid, "scale_value": 1..5 }
--              | { "question_id": uuid, "option_ids": [uuid, …] }
--              | { "question_id": uuid, "text_value": "…" }]
create function public.submit_survey_response(p_session uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m          public.members := public.assert_active_member();
  sv         public.surveys;
  a          jsonb;
  q          public.survey_questions;
  v_missing  uuid[] := '{}';
  v_invalid  uuid[] := '{}';
  v_seen     uuid[] := '{}';
  v_answers  jsonb  := '[]'::jsonb;
  v_opts     uuid[];
  v_text     text;
  v_scale    int;
  v_response uuid;
  v_run_at   timestamptz;
begin
  select * into sv from public.surveys where session_id = p_session and org_id = m.org_id;
  if not found then
    return jsonb_build_object('status', 'no_survey');
  end if;

  -- Eligibility is the RATING's, to the letter (REQ-SUR-003): an active
  -- check-in on any day, and the window that `rating_window_open()` defines
  -- once for the policy and for this call alike.
  if not public.has_checked_in(p_session) then
    return jsonb_build_object('status', 'not_eligible', 'reason', 'not_checked_in');
  end if;
  if not public.rating_window_open(p_session) then
    return jsonb_build_object('status', 'not_eligible', 'reason', 'window_closed');
  end if;

  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then
    return jsonb_build_object('status', 'invalid', 'missing', '[]'::jsonb);
  end if;

  -- ── Read-only from here to the register ──────────────────────────────────
  for a in select value from jsonb_array_elements(p_answers) loop
    select * into q from public.survey_questions
     where id = nullif(a ->> 'question_id', '')::uuid and survey_id = sv.id;
    if not found then
      -- A question of another survey, or none at all: the whole submission is
      -- refused rather than quietly dropped.
      v_invalid := v_invalid || coalesce(nullif(a ->> 'question_id', '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid);
      continue;
    end if;
    if q.id = any(v_seen) then
      v_invalid := v_invalid || q.id;                       -- the same question twice
      continue;
    end if;
    v_seen := v_seen || q.id;

    if q.kind = 'scale_1_5' then
      v_scale := nullif(a ->> 'scale_value', '')::int;
      if v_scale is null then
        if q.required then v_missing := v_missing || q.id; end if;
        continue;
      end if;
      if v_scale < 1 or v_scale > 5 then
        v_invalid := v_invalid || q.id;
        continue;
      end if;
      v_answers := v_answers || jsonb_build_array(jsonb_build_object('question_id', q.id, 'scale_value', v_scale));

    elsif q.kind in ('single_choice', 'multi_choice') then
      select coalesce(array_agg(value::uuid), '{}') into v_opts
        from jsonb_array_elements_text(case when jsonb_typeof(a -> 'option_ids') = 'array' then a -> 'option_ids' else '[]'::jsonb end);
      if array_length(v_opts, 1) is null then
        if q.required then v_missing := v_missing || q.id; end if;
        continue;
      end if;
      if q.kind = 'single_choice' and array_length(v_opts, 1) > 1 then
        v_invalid := v_invalid || q.id;
        continue;
      end if;
      -- Every option must belong to THIS question — the composite key would
      -- refuse it later anyway, and later is after the register is written.
      if exists (
        select 1 from unnest(v_opts) as o(id)
         where not exists (select 1 from public.survey_question_options so
                            where so.id = o.id and so.question_id = q.id)
      ) then
        v_invalid := v_invalid || q.id;
        continue;
      end if;
      v_answers := v_answers || jsonb_build_array(jsonb_build_object('question_id', q.id, 'option_ids', to_jsonb(v_opts)));

    else  -- free_text
      v_text := btrim(coalesce(a ->> 'text_value', ''));
      if v_text = '' then
        if q.required then v_missing := v_missing || q.id; end if;
        continue;
      end if;
      if char_length(v_text) > 2000 then
        v_invalid := v_invalid || q.id;
        continue;
      end if;
      v_answers := v_answers || jsonb_build_array(jsonb_build_object('question_id', q.id, 'text_value', v_text));
    end if;
  end loop;

  -- A required question the caller did not send at all.
  v_missing := v_missing || array(
    select q2.id from public.survey_questions q2
     where q2.survey_id = sv.id and q2.required and not (q2.id = any(v_seen))
  );

  if array_length(v_missing, 1) is not null or array_length(v_invalid, 1) is not null then
    return jsonb_build_object('status', 'invalid',
                              'missing', to_jsonb(coalesce(v_missing, '{}')),
                              'invalid', to_jsonb(coalesce(v_invalid, '{}')));
  end if;

  -- ── The register: who answered, with no answer and no time beside it ─────
  insert into public.survey_participations (org_id, survey_id, member_id)
  values (m.org_id, sv.id, m.id)
  on conflict (survey_id, member_id) do nothing;
  if not found then
    return jsonb_build_object('status', 'already_answered');   -- REQ-SUR-003, by name
  end if;

  -- ── The box: enqueued, never written here ───────────────────────────────
  v_response := gen_random_uuid();
  -- Uniform on [10 minutes, 4 hours]. Not to hide the rater — nothing stored
  -- names them — but to keep transaction ids, heap order and WAL position from
  -- pairing a response with the register row written beside the rating
  -- (DEC-160 §3.2).
  v_run_at := now() + make_interval(secs => 600 + floor(random() * 13800));
  perform public.enqueue_job(
    'record_survey_response',
    jsonb_build_object('response_id', v_response, 'survey_id', sv.id, 'answers', v_answers),
    null,            -- ★ no key: `job_key_mode => 'replace'` would collapse two responses into one
    v_run_at,
    null,
    5                -- a permanent failure should surface the same day, not after 25 attempts
  );

  -- ★ No write_audit() call, on purpose (DEC-160 §3.5): an audit row would
  -- carry the member and the moment, which is the pairing this file removes.
  return jsonb_build_object('status', 'ok');
end $$;
revoke execute on function public.submit_survey_response(uuid, jsonb) from public, anon;
grant  execute on function public.submit_survey_response(uuid, jsonb) to authenticated;

-- ── The function the worker calls ───────────────────────────────────────────
-- The ONLY writer of `survey_responses` and `survey_answers`. Its signature
-- names a response, a survey and the answers — there is no member to pass and
-- no parameter one could be smuggled in.
create function public.record_survey_response(p_response uuid, p_survey uuid, p_answers jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_org     uuid;
  a         jsonb;
  q         public.survey_questions;
  v_written int := 0;
  o         text;
begin
  select org_id into v_org from public.surveys where id = p_survey;
  if v_org is null then
    return 0;                      -- the survey was detached before the job ran: nothing to store, nothing to retry
  end if;

  insert into public.survey_responses (id, org_id, survey_id)
  values (p_response, v_org, p_survey)
  on conflict (id) do nothing;
  if not found then
    return 0;                      -- a replayed job: exactly once, from the id in the payload
  end if;

  for a in select value from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) loop
    select * into q from public.survey_questions
     where id = nullif(a ->> 'question_id', '')::uuid and survey_id = p_survey;
    if not found then
      continue;                    -- the question is gone: skip it rather than fail this job forever
    end if;

    if (a -> 'scale_value') is not null then
      insert into public.survey_answers (org_id, survey_id, response_id, question_id, scale_value)
      values (v_org, p_survey, p_response, q.id, (a ->> 'scale_value')::smallint);
      v_written := v_written + 1;
    elsif (a -> 'text_value') is not null then
      insert into public.survey_answers (org_id, survey_id, response_id, question_id, text_value)
      values (v_org, p_survey, p_response, q.id, a ->> 'text_value');
      v_written := v_written + 1;
    else
      for o in select value from jsonb_array_elements_text(coalesce(a -> 'option_ids', '[]'::jsonb)) loop
        if exists (select 1 from public.survey_question_options so where so.id = o::uuid and so.question_id = q.id) then
          insert into public.survey_answers (org_id, survey_id, response_id, question_id, option_id)
          values (v_org, p_survey, p_response, q.id, o::uuid);
          v_written := v_written + 1;
        end if;
      end loop;
    end if;
  end loop;

  return v_written;
end $$;
revoke execute on function public.record_survey_response(uuid, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.record_survey_response(uuid, uuid, jsonb) to service_role;
