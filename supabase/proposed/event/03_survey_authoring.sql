-- event (wave 10, E1 — the authoring half) — a template an org reuses, and the
-- copy that is attached to a session.
--
-- Serves:  REQ-SUR-001, REQ-SUR-002, REQ-ADM-018 (the two audited actions)
-- Cites:   DEC-160 §3 (the storage contract), sync 1 Q5 (attach and detach are
--          audited; a template edit is not), 0124 (the tables — the lead's),
--          0005 (`assert_active_member`, `write_audit`), 0087
--          (`mark_checked_in_manually` — the staff re-read this copies)
-- Docs:    docs/plan/notes/event.md "Wave 10 plan" §2, §8
--
-- 03 §8.2 rows this adds (tests/rls/survey-authoring.test.ts):
--   | `RPC-survey_template_save.staff_only` | A member is refused `not_authorized`; an admin and a moderator both succeed; a stale admin is refused `stale_claims`. |
--   | `RPC-survey_template_save.whole_set` | Saving replaces the whole question set in the array's order: positions are 1…n and are never read from the client. |
--   | `RPC-survey_template_save.shapes` | A choice question with fewer than two options, an empty prompt, an unknown kind and options on a non-choice question are each refused by name, with the question's index — and nothing is written. |
--   | `RPC-survey_template_save.title_taken` | Two templates of one org cannot share a title; the refusal is an envelope, not a constraint error. |
--   | `RPC-survey_template_save.other_org` | A template of another org is `not_found`, never edited. |
--   | `RPC-survey_attach.copies` | Attaching copies the template's questions and options into the session's own rows: editing the template afterwards changes nothing that was attached. |
--   | `RPC-survey_attach.one_per_session` | A second attach to the same session is refused by name; an empty template is refused before anything is written. |
--   | `RPC-survey_attach.audited` | Attach and detach each write one `audit_log` row naming the session and the survey. |
--   | `RPC-survey_detach.has_responses` | Once one member has answered, detaching is refused and the survey stands. |
--
-- ── Why a whole-set replace ─────────────────────────────────────────────────
-- `survey_template_save()` takes the title and the WHOLE question array and
-- rewrites the set. `ui/reorderable-list` is controlled — it hands the editor
-- the whole new order and the editor decides when to save — so the order in
-- the array IS the order, and `position` is assigned 1…n here and never read
-- from the client. Per-question RPCs would need a reorder call of their own and
-- would leave a half-saved template if one failed.
--
-- The cost, stated: a save re-creates the question rows, so a survey attached
-- from an earlier version keeps its own copies but loses `source_question_id`
-- (`on delete set null`). Nothing renders provenance — `surveys.source_template_id`
-- is what SCR-065 counts — and the copies are the point (REQ-SUR-001).
--
-- ── The freeze ──────────────────────────────────────────────────────────────
-- There is NO RPC here that edits an attached survey's questions. Once a survey
-- exists its question set is fixed, and once anyone has answered it cannot even
-- be detached: a deleted question would take its answers with it (`on delete
-- cascade`) and every released distribution would be lying about its own
-- denominator. The screen says so before a staff member tries.

-- ── Staff, re-read from the row, not from the claim (03 §1.3) ───────────────
-- `assert_fresh_admin()` exists; there is no staff twin, and this file does not
-- invent one — the two-line shape is `mark_checked_in_manually()`'s (0087).
create function public.assert_survey_staff() returns public.members
language plpgsql security definer set search_path = '' as $$
declare m public.members := public.assert_active_member();
begin
  if m.org_role not in ('admin', 'moderator') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return m;
end $$;
revoke execute on function public.assert_survey_staff() from public, anon;
grant  execute on function public.assert_survey_staff() to authenticated;

-- ── One template, saved whole ───────────────────────────────────────────────
create function public.survey_template_save(p_template uuid, p_title text, p_questions jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m        public.members := public.assert_survey_staff();
  v_id     uuid := p_template;
  v_title  text := btrim(coalesce(p_title, ''));
  q        jsonb;
  v_pos    int := 0;
  v_qid    uuid;
  o        jsonb;
  v_opos   int;
  v_kind   text;
  v_prompt text;
  v_opts   jsonb;
begin
  if v_title = '' or char_length(v_title) > 200 then
    return jsonb_build_object('status', 'invalid_title');
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    return jsonb_build_object('status', 'empty');
  end if;

  -- Every question is checked BEFORE anything is written, so a refusal leaves
  -- the template exactly as it was (DEC-043 — no raise after a write, and here
  -- no write before the decision).
  for q in select value from jsonb_array_elements(p_questions) loop
    v_pos    := v_pos + 1;
    v_kind   := q ->> 'kind';
    v_prompt := btrim(coalesce(q ->> 'prompt', ''));
    v_opts   := case when jsonb_typeof(q -> 'options') = 'array' then q -> 'options' else '[]'::jsonb end;

    if v_kind is null or v_kind not in ('scale_1_5', 'single_choice', 'multi_choice', 'free_text') then
      return jsonb_build_object('status', 'invalid', 'at', v_pos, 'field', 'kind');
    end if;
    if v_prompt = '' or char_length(v_prompt) > 300 then
      return jsonb_build_object('status', 'invalid', 'at', v_pos, 'field', 'prompt');
    end if;
    if v_kind in ('single_choice', 'multi_choice') then
      -- Fewer than two options is not a choice; an empty or over-long label is
      -- refused here rather than by a check constraint mid-write.
      if jsonb_array_length(v_opts) < 2 then
        return jsonb_build_object('status', 'invalid', 'at', v_pos, 'field', 'options');
      end if;
      for o in select value from jsonb_array_elements(v_opts) loop
        if jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '' or char_length(btrim(o #>> '{}')) > 120 then
          return jsonb_build_object('status', 'invalid', 'at', v_pos, 'field', 'options');
        end if;
      end loop;
    elsif jsonb_array_length(v_opts) > 0 then
      return jsonb_build_object('status', 'invalid', 'at', v_pos, 'field', 'options');
    end if;
  end loop;

  begin
    if v_id is null then
      insert into public.survey_templates (org_id, title) values (m.org_id, v_title) returning id into v_id;
    else
      update public.survey_templates set title = v_title where id = v_id and org_id = m.org_id returning id into v_id;
      if v_id is null then
        raise exception 'not_found' using errcode = 'P0002';   -- another org's, or gone: indistinguishable on purpose
      end if;
      delete from public.survey_template_questions where template_id = v_id;   -- options cascade
    end if;
  exception when unique_violation then
    -- (org_id, title). Checked by the constraint rather than by a look-up, so
    -- two staff members saving the same name at once get an envelope and not a
    -- 23505 the screen would have to decode.
    return jsonb_build_object('status', 'title_taken');
  end;

  v_pos := 0;
  for q in select value from jsonb_array_elements(p_questions) loop
    v_pos := v_pos + 1;
    insert into public.survey_template_questions (org_id, template_id, position, kind, prompt, required)
    values (m.org_id, v_id, v_pos, (q ->> 'kind')::public.survey_question_kind, btrim(q ->> 'prompt'),
            coalesce((q ->> 'required')::boolean, false))
    returning id into v_qid;

    if (q ->> 'kind') in ('single_choice', 'multi_choice') then
      v_opos := 0;
      for o in select value from jsonb_array_elements(q -> 'options') loop
        v_opos := v_opos + 1;
        insert into public.survey_template_options (org_id, question_id, position, label)
        values (m.org_id, v_qid, v_opos, btrim(o #>> '{}'));
      end loop;
    end if;
  end loop;

  return jsonb_build_object('status', 'ok', 'template_id', v_id, 'question_count', v_pos);
end $$;
revoke execute on function public.survey_template_save(uuid, text, jsonb) from public, anon;
grant  execute on function public.survey_template_save(uuid, text, jsonb) to authenticated;

create function public.survey_template_delete(p_template uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m     public.members := public.assert_survey_staff();
  v_id  uuid;
begin
  delete from public.survey_templates where id = p_template and org_id = m.org_id returning id into v_id;
  if v_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- A survey copied from it keeps every question: `surveys.source_template_id`
  -- is `on delete set null`, which is the whole reason the copy exists.
  return jsonb_build_object('status', 'ok');
end $$;
revoke execute on function public.survey_template_delete(uuid) from public, anon;
grant  execute on function public.survey_template_delete(uuid) to authenticated;

-- ── Attaching: the copy (REQ-SUR-001) ───────────────────────────────────────
create function public.survey_attach(p_session uuid, p_template uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m         public.members := public.assert_survey_staff();
  s         public.sessions;
  t         public.survey_templates;
  v_survey  uuid;
  v_count   int;
  tq        public.survey_template_questions;
  v_qid     uuid;
begin
  select * into s from public.sessions where id = p_session and org_id = m.org_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into t from public.survey_templates where id = p_template and org_id = m.org_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.surveys where session_id = p_session) then
    return jsonb_build_object('status', 'already_attached');       -- one survey per session (DEC-074)
  end if;
  select count(*) into v_count from public.survey_template_questions where template_id = t.id;
  if v_count = 0 then
    return jsonb_build_object('status', 'template_empty');         -- a survey with no question is not one
  end if;

  insert into public.surveys (org_id, session_id, source_template_id, title)
  values (m.org_id, p_session, t.id, t.title)
  returning id into v_survey;

  for tq in select * from public.survey_template_questions where template_id = t.id order by position loop
    insert into public.survey_questions (org_id, survey_id, position, kind, prompt, required, source_question_id)
    values (m.org_id, v_survey, tq.position, tq.kind, tq.prompt, tq.required, tq.id)
    returning id into v_qid;

    insert into public.survey_question_options (org_id, question_id, position, label)
    select m.org_id, v_qid, o.position, o.label
      from public.survey_template_options o
     where o.question_id = tq.id
     order by o.position;
  end loop;

  -- Q5: attach and detach change what members are asked, and by whom.
  perform public.write_audit(m.org_id, 'survey.attached', 'session', p_session, null,
                             jsonb_build_object('survey_id', v_survey, 'template_id', t.id, 'question_count', v_count),
                             null, m.org_role::text, m.id);
  return jsonb_build_object('status', 'ok', 'survey_id', v_survey, 'question_count', v_count);
end $$;
revoke execute on function public.survey_attach(uuid, uuid) from public, anon;
grant  execute on function public.survey_attach(uuid, uuid) to authenticated;

create function public.survey_detach(p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m         public.members := public.assert_survey_staff();
  v_survey  uuid;
begin
  select sv.id into v_survey from public.surveys sv
   where sv.session_id = p_session and sv.org_id = m.org_id;
  if v_survey is null then
    return jsonb_build_object('status', 'no_survey');
  end if;

  -- ★ The register decides, not the box: `survey_participations` is the only
  -- table that knows anyone answered, and it is read here and nowhere a client
  -- can reach. Refused BEFORE the delete, so nothing is written on the way out.
  if exists (select 1 from public.survey_participations where survey_id = v_survey) then
    return jsonb_build_object('status', 'has_responses');
  end if;

  delete from public.surveys where id = v_survey;                  -- questions and options cascade
  perform public.write_audit(m.org_id, 'survey.detached', 'session', p_session,
                             jsonb_build_object('survey_id', v_survey), null,
                             null, m.org_role::text, m.id);
  return jsonb_build_object('status', 'ok');
end $$;
revoke execute on function public.survey_detach(uuid) from public, anon;
grant  execute on function public.survey_detach(uuid) to authenticated;
