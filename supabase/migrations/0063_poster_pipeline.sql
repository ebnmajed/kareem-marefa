-- promoted by the lead at wave-3 sync 7 · designer (wave 3, M6) — the three poster paths, and the live/detached rule.
-- Follows 0061.
--
-- Serves:  02 §4.13 (session_posters), 03 §5.9
--          REQ-DSG-001 (every published session has a poster),
--          REQ-DSG-002 (three paths), REQ-DSG-003 (live stays live,
--          customised detaches), 11 §2.5 (JOB-regenerate_poster,
--          key `poster:{session_id}`)
-- Cites:   DEC-012 (the asymmetry IS the decision), DEC-045 (the poster gate
--          of REQ-SES-001 was deferred from M2 to here), DEC-048
--
-- 03 §8.2 ROWS THIS FILE NEEDS:
--   | `POL-session_posters.publish` | Publishing a session enqueues `regenerate_poster` once, with 11 §2.5's key. |
--   | `POL-session_posters.detach` | `detach_poster()` flips binding to `detached` and mode to `customised`, ONE WAY: a second call on a live poster detaches, and no call ever re-attaches. |
--   | `POL-session_posters.detach.admin` | A moderator's `detach_poster()` is refused. |
--   | `POL-session_posters.stale` | A data change on a DETACHED poster sets `stale_since` and enqueues no render. |
--   | `POL-session_posters.live` | A data change on a LIVE poster enqueues one render and leaves `stale_since` null. |
--   | `POL-request_render.system` | `system_request_render()` is service_role only; an admin calling it is refused. |
--
-- ★ THE ASYMMETRY IS THE DECISION (DEC-012, REQ-DSG-003).
--
-- An `auto` poster is a pure function of template plus session data, so a
-- change to the title, date, venue or presenters regenerates it and costs
-- nothing. A `customised` one carries somebody's judgement, and silently
-- overwriting that is the worse of the two failure modes — so a data change
-- sets `stale_since` and raises «تغيّرت تفاصيل الجلسة — راجع الملصق»
-- instead. `live → detached` happens on the first edit and is ONE WAY.
--
-- Nothing here renders. The trigger enqueues; the worker resolves the
-- bindings through @kareem/designer-runtime — the same function the editor
-- previews with, because a preview that is not the artifact is DEC-017
-- failing quietly — and calls system_request_render().

-- ── the worker's door to the render queue ──────────────────────────────────
-- request_render() checks `is_org_admin()`, which a job has no way to be.
-- A separate entry point rather than a role branch inside the admin one: a
-- function that sometimes skips its authorisation check is a function whose
-- next reader has to work out when.
create function public.system_request_render(
  p_document    uuid,
  p_fingerprint text,
  p_context     jsonb,
  p_targets     jsonb
) returns setof public.export_artifacts
language plpgsql security definer set search_path = '' as $$
declare
  v_org    uuid;
  v_target jsonb;
  v_preset text;
  v_format public.export_format;
  v_row    public.export_artifacts;
  v_id     uuid;
begin
  select d.org_id into v_org from public.design_documents d where d.id = p_document;
  if v_org is null then
    raise exception 'unknown_document' using errcode = '42704';
  end if;

  for v_target in select * from jsonb_array_elements(p_targets) loop
    v_preset := v_target->>'preset';
    v_format := (v_target->>'format')::public.export_format;

    select * into v_row from public.export_artifacts a
     where a.document_id = p_document and a.preset = v_preset
       and a.format = v_format and a.source_fingerprint = p_fingerprint;

    if v_row.id is null then
      insert into public.export_artifacts (org_id, document_id, preset, format, status, source_fingerprint, render_context)
      values (v_org, p_document, v_preset, v_format, 'queued', p_fingerprint, coalesce(p_context, '{}'::jsonb))
      returning id into v_id;
      perform public.enqueue_job('render_variant', jsonb_build_object('artifact_id', v_id),
        'doc:' || p_document::text || ':' || v_preset || ':' || v_format::text, null, 'render', 3);
    end if;
  end loop;

  return query select * from public.export_artifacts a
    where a.document_id = p_document and a.source_fingerprint = p_fingerprint order by a.preset, a.format;
end $$;
revoke execute on function public.system_request_render(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.system_request_render(uuid, text, jsonb, jsonb) to service_role;

-- ── everything JOB-regenerate_poster needs, in one round trip ─────────────
create function public.poster_render_context(p_session uuid)
returns table (
  session_id uuid, org_id uuid, title text, abstract text, starts_at timestamptz,
  session_time_zone text, venue_name text, venue_address text, presenters text[],
  org_name text, numerals public.numeral_system, org_time_zone text,
  poster_id uuid, document_id uuid, mode public.poster_mode, binding public.poster_binding,
  template_version_id uuid, template_document jsonb
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.org_id, s.title, s.abstract, s.starts_at,
         s.time_zone,
         coalesce(v.name, s.custom_venue_name),
         coalesce(v.address, s.custom_venue_address),
         -- A5: every ACCEPTED co-presenter, in the order they were named.
         coalesce((select array_agg(m.display_name order by sp.created_at)
                     from public.session_presenters sp
                     join public.members m on m.id = sp.member_id
                    where sp.session_id = s.id and sp.accepted), '{}'),
         o.name, coalesce(os.numerals, 'western'), coalesce(os.time_zone, 'Asia/Riyadh'),
         p.id, p.document_id, p.mode, p.binding,
         tv.id, tv.document
    from public.sessions s
    join public.orgs o on o.id = s.org_id
    left join public.org_settings os on os.org_id = s.org_id
    left join public.venues v on v.id = s.venue_id
    left join public.session_posters p on p.session_id = s.id
    -- The template the automatic path binds to: the org's default for the
    -- `talk` family, else the platform's. 02 has no session-TYPE column, so
    -- a per-family default cannot be chosen automatically; the admin picks
    -- one on SCR-043 and that choice is what `session_posters.document_id`
    -- then records (REQ-DSG-002's «تلقائي» is a default, not a ceiling).
    left join lateral (
      select v2.id, v2.document
        from public.design_templates t
        join public.design_template_versions v2 on v2.template_id = t.id
       where t.purpose = 'poster' and t.family = 'talk' and t.retired_at is null
         and (t.org_id = s.org_id or t.org_id is null)
       order by (t.org_id is not null) desc, t.is_default desc, v2.version desc
       limit 1
    ) tv on true
   where s.id = p_session
$$;
revoke execute on function public.poster_render_context(uuid) from public, anon, authenticated;
grant  execute on function public.poster_render_context(uuid) to service_role;

-- ── the worker records what it built ───────────────────────────────────────
create function public.record_session_poster(
  p_session  uuid,
  p_document uuid,
  p_stale    boolean default false
) returns public.session_posters
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_row public.session_posters;
begin
  select org_id into v_org from public.sessions where id = p_session;
  if v_org is null then
    raise exception 'unknown_session' using errcode = '42704';
  end if;

  insert into public.session_posters (org_id, session_id, document_id, mode, binding, stale_since)
  values (v_org, p_session, p_document, 'auto', 'live', null)
  on conflict (session_id) do update
     set document_id = case when public.session_posters.binding = 'live' then coalesce(excluded.document_id, public.session_posters.document_id)
                            else public.session_posters.document_id end,
         -- ★ A detached poster is NEVER regenerated (REQ-DSG-003). All a
         -- data change may do is mark it for review.
         stale_since = case when public.session_posters.binding = 'detached' and p_stale then now()
                            when public.session_posters.binding = 'live' then null
                            else public.session_posters.stale_since end
  returning * into v_row;
  return v_row;
end $$;
revoke execute on function public.record_session_poster(uuid, uuid, boolean) from public, anon, authenticated;
grant  execute on function public.record_session_poster(uuid, uuid, boolean) to service_role;

-- ── detaching, which is an admin's act and is one way ─────────────────────
create function public.detach_poster(p_session uuid) returns public.session_posters
language plpgsql security definer set search_path = '' as $$
declare v_row public.session_posters;
begin
  select * into v_row from public.session_posters where session_id = p_session;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() or not public.is_org_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  -- Already detached: nothing to do and nothing to undo. There is no
  -- re-attach, by decision — an automatic poster that silently replaced
  -- someone's edit is the failure DEC-012 exists to prevent, and a
  -- re-attach button is that failure with a confirmation dialog.
  if v_row.binding = 'detached' then
    return v_row;
  end if;

  update public.session_posters
     set binding = 'detached', mode = 'customised', detached_at = now(), stale_since = null
   where session_id = p_session
   returning * into v_row;

  perform public.write_audit(v_row.org_id, 'design.poster_detached', 'session', p_session);
  return v_row;
end $$;
revoke execute on function public.detach_poster(uuid) from public, anon;
grant  execute on function public.detach_poster(uuid) to authenticated;

-- ── the hook into M2: SQL only, as the wave contract requires ─────────────
-- SECURITY DEFINER (the lead, at promotion): the hook fires on ANY writer's
-- update of a session — a presenter's own title edit included — and calls
-- enqueue_job(), which no client role may execute (0025). As an invoker
-- function it turned every presenter edit into "permission denied for
-- function enqueue_job" (three wave-1 cases). The same reason 0034's
-- rsvps_notify() is a definer.
create function public.sessions_poster_hook() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- REQ-DSG-001: on the EDGE into published, every session gets a poster.
  -- On the edge, not on the state, so publish_session()'s walk through four
  -- states announces once (0036's own lesson).
  if tg_op = 'UPDATE' and new.state = 'published' and old.state is distinct from 'published' then
    perform public.enqueue_job('regenerate_poster', jsonb_build_object('session_id', new.id),
                               'poster:' || new.id::text, null, 'render', 3);
    return new;
  end if;

  -- REQ-DSG-003: a change to what a poster PRINTS. Not every column — a
  -- capacity change does not alter a poster, and re-rendering seven
  -- variants for one is waste the job key cannot absorb.
  if tg_op = 'UPDATE' and new.state in ('published', 'in_progress') and (
       new.title is distinct from old.title
       or new.starts_at is distinct from old.starts_at
       or new.venue_id is distinct from old.venue_id
       or new.custom_venue_name is distinct from old.custom_venue_name
       or new.custom_venue_address is distinct from old.custom_venue_address
     ) then
    -- The same key, so a burst of edits leaves ONE pending regeneration
    -- rather than one per keystroke (11 §1.1).
    perform public.enqueue_job('regenerate_poster', jsonb_build_object('session_id', new.id),
                               'poster:' || new.id::text, null, 'render', 3);
  end if;
  return new;
end $$;

create trigger sessions_poster_hook
  after update on public.sessions
  for each row execute function public.sessions_poster_hook();

-- A presenter joining or leaving changes the poster too (A5), and that is a
-- different table, so it is a different trigger naming the same job key.
-- SECURITY DEFINER for the same reason as sessions_poster_hook() above: a
-- presenter's own decline (0020) is a member's write, and the hook must
-- still reach enqueue_job().
create function public.session_presenters_poster_hook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_session uuid := coalesce(new.session_id, old.session_id);
begin
  if exists (select 1 from public.sessions s where s.id = v_session and s.state in ('published', 'in_progress')) then
    perform public.enqueue_job('regenerate_poster', jsonb_build_object('session_id', v_session),
                               'poster:' || v_session::text, null, 'render', 3);
  end if;
  return coalesce(new, old);
end $$;

create trigger session_presenters_poster_hook
  after insert or update or delete on public.session_presenters
  for each row execute function public.session_presenters_poster_hook();
