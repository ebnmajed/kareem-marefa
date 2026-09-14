-- promoted by the lead at wave-3 sync 4 · designer (wave 3, M6) — the export pipeline's four doors.
-- Follows 0057.
--
-- Serves:  02 §4.13 (export_artifacts), 03 §5.9 (export_artifacts is
--          job-written: no client write policy, and none is added here)
--          REQ-DSG-011, REQ-DSG-012, REQ-DSG-013, REQ-DSG-014
--          11 §2.5 (JOB-render_variant: key `doc:{document_id}:{preset}:{format}`,
--          retry 3, queue `render`)
-- Cites:   DEC-017 (one renderer, in the worker image), DEC-043 (an outcome
--          envelope, never raise-after-write), DEC-048
--
-- 03 §8.2 ROWS THIS FILE NEEDS (handed to the lead with the file):
--   | `POL-export_artifacts.request.admin` | A moderator's `request_render()` is refused; an admin's queues one row per target and returns them. |
--   | `POL-export_artifacts.cache` | Re-requesting an unchanged document re-renders NOTHING — the `ready` rows come back as they are (REQ-DSG-013). |
--   | `POL-export_artifacts.record.worker` | `record_export_artifact()` is service_role only; an admin calling it is refused. |
--   | `POL-export_artifacts.retry.admin` | An admin retries a `failed` artifact and it returns to `queued`; a `ready` one is left alone. |
--
-- FOUR THINGS WORTH KNOWING BEFORE READING.
--
--  1. THE FINGERPRINT IS COMPUTED BY THE CALLER, NOT HERE. It is a hash of
--     the document JSON, the template version, the bound data and the font
--     hashes (REQ-DSG-013), and its canonicalisation lives in
--     @kareem/designer-runtime so the app that looks an artifact up and the
--     worker that writes it cannot disagree. A second canonicalisation in
--     plpgsql would be a second thing to keep in step, and the one that
--     drifted would silently re-render everything or — worse — serve a stale
--     artifact for a changed source.
--
--  2. `render_context` PINS WHAT WAS RENDERED. The resolved bindings and the
--     exact faces, by SHA-256, stored with the request. The worker does not
--     re-resolve them: re-resolution is a second implementation of 06 §2.3
--     that can disagree with the one the admin previewed, and for a
--     certificate it would break REQ-CRT-014 outright. The document itself
--     is NOT copied in — the worker reads it and re-derives the fingerprint,
--     so a document edited between request and render fails loudly instead of
--     rendering new content under an old key.
--
--  3. THE CACHE IS THE UNIQUE CONSTRAINT. `on conflict do nothing` over
--     `(document_id, preset, format, source_fingerprint)` means re-opening a
--     session renders nothing and a template bump invalidates exactly the
--     artifacts bound to it. Invalidation is impossible to forget because a
--     changed source produces a different KEY.
--
--  4. `enqueue_job` IS THE ONLY DOOR TO THE QUEUE (0025), and the key is
--     11 §2.5's verbatim, so re-saving twice leaves ONE pending render.

-- The exact bindings and faces a render must use. Not in 02 §4.13's sketch;
-- REQ-DSG-013's "bound data" and REQ-CRT-014's pinned font hashes both need
-- somewhere to live, and an artifact is where they belong.
alter table public.export_artifacts
  add column render_context jsonb not null default '{}'::jsonb;

comment on column public.export_artifacts.render_context is
  'The resolved bindings and the exact faces (by sha256) this artifact was requested with. The worker renders THESE, never a fresh resolution (REQ-DSG-013, REQ-CRT-014).';

-- ═══════════════════════════════════════════════════════════════════════════
-- request_render() — the admin's door. REQ-DSG-011, REQ-DSG-012, REQ-DSG-013.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.request_render(
  p_document    uuid,
  p_fingerprint text,
  p_context     jsonb,
  p_targets     jsonb   -- [{"preset":"a3","format":"pdf"}, …]
)
returns table (
  id uuid, preset text, format public.export_format,
  status public.export_status, storage_path text, error text, rendered_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_org      uuid;
  v_target   jsonb;
  v_preset   text;
  v_format   public.export_format;
  v_existing public.export_artifacts;
  v_new_id   uuid;
begin
  select d.org_id into v_org from public.design_documents d where d.id = p_document;
  if v_org is null then
    raise exception 'unknown_document' using errcode = '42501';
  end if;
  -- Design is an admin act (REQ-DSG-002), and an export is a design act.
  if v_org <> public.auth_org_id() or not public.is_org_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_fingerprint is null or char_length(p_fingerprint) < 16 then
    raise exception 'bad_fingerprint' using errcode = '22023';
  end if;

  for v_target in select * from jsonb_array_elements(p_targets) loop
    v_preset := v_target->>'preset';
    v_format := (v_target->>'format')::public.export_format;

    -- REQ-DSG-013: an artifact for this exact source already exists, so
    -- nothing is re-rendered and nothing is enqueued.
    select * into v_existing
      from public.export_artifacts a
     where a.document_id = p_document and a.preset = v_preset
       and a.format = v_format and a.source_fingerprint = p_fingerprint;

    if v_existing.id is null then
      insert into public.export_artifacts (org_id, document_id, preset, format, status, source_fingerprint, render_context)
      values (v_org, p_document, v_preset, v_format, 'queued', p_fingerprint, coalesce(p_context, '{}'::jsonb))
      returning export_artifacts.id into v_new_id;

      -- 11 §2.5's key, verbatim. A re-request with the same key MOVES the
      -- pending job rather than adding a second, so saving a poster twice
      -- leaves one render.
      perform public.enqueue_job(
        'render_variant',
        jsonb_build_object('artifact_id', v_new_id),
        'doc:' || p_document::text || ':' || v_preset || ':' || v_format::text,
        null,
        'render',   -- 11 §1.4: its own queue, so one 30-second A3 never starves a reminder
        3           -- 11 §1.3, heavy render
      );
    elsif v_existing.status = 'failed' then
      -- A previous attempt failed and the source has not changed: this is a
      -- retry by another name, and the admin asking again should get one.
      update public.export_artifacts a set status = 'queued', error = null
       where a.id = v_existing.id;
      perform public.enqueue_job(
        'render_variant',
        jsonb_build_object('artifact_id', v_existing.id),
        'doc:' || p_document::text || ':' || v_preset || ':' || v_format::text,
        null, 'render', 3
      );
    end if;
  end loop;

  perform public.write_audit(
    v_org, 'design.export_requested', 'design_document', p_document,
    null, jsonb_build_object('fingerprint', p_fingerprint, 'targets', p_targets)
  );

  return query
    select a.id, a.preset, a.format, a.status, a.storage_path, a.error, a.rendered_at
      from public.export_artifacts a
     where a.document_id = p_document and a.source_fingerprint = p_fingerprint
     order by a.preset, a.format;
end $$;

revoke execute on function public.request_render(uuid, text, jsonb, jsonb) from public, anon;
grant  execute on function public.request_render(uuid, text, jsonb, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- The worker's two doors. service_role only — `export_artifacts` grants it
-- nothing directly (03 §5.9: job-written), so these are the whole interface.
-- ═══════════════════════════════════════════════════════════════════════════

/** Everything one render needs, in one round trip. */
create function public.export_render_context(p_artifact uuid)
returns table (
  artifact_id uuid, org_id uuid, document_id uuid, preset text, format public.export_format,
  source_fingerprint text, render_context jsonb, document jsonb,
  template_version_id uuid, previous_signature jsonb, allow_jpeg boolean
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.org_id, a.document_id, a.preset, a.format,
         a.source_fingerprint, a.render_context, d.document,
         d.template_version_id,
         -- The signature the last SUCCESSFUL render of this same fingerprint
         -- produced. Same source must give the same geometry; a difference
         -- means something outside the fingerprint moved (06 §9.1).
         (select p.tier_a_signature
            from public.export_artifacts p
           where p.document_id = a.document_id and p.preset = a.preset
             and p.format = a.format and p.source_fingerprint = a.source_fingerprint
             and p.status = 'ready' and p.tier_a_signature is not null
           order by p.rendered_at desc limit 1),
         coalesce(os.allow_jpeg_export, false)
    from public.export_artifacts a
    join public.design_documents d on d.id = a.document_id
    left join public.org_settings os on os.org_id = a.org_id
   where a.id = p_artifact
$$;
revoke execute on function public.export_render_context(uuid) from public, anon, authenticated;
grant  execute on function public.export_render_context(uuid) to service_role;

/** The outcome. DEC-043: an envelope, never a raise after a write — a
 *  `raise` here would roll back the very row that records the failure. */
create function public.record_export_artifact(
  p_artifact     uuid,
  p_status       public.export_status,
  p_storage_path text default null,
  p_byte_size    bigint default null,
  p_width        int default null,
  p_height       int default null,
  p_signature    jsonb default null,
  p_error        text default null
) returns public.export_artifacts
language plpgsql security definer set search_path = '' as $$
declare v_row public.export_artifacts;
begin
  update public.export_artifacts a
     set status       = p_status,
         storage_path = coalesce(p_storage_path, a.storage_path),
         byte_size    = coalesce(p_byte_size, a.byte_size),
         width_px     = coalesce(p_width, a.width_px),
         height_px    = coalesce(p_height, a.height_px),
         tier_a_signature = coalesce(p_signature, a.tier_a_signature),
         -- Cleared on success: a stale error beside a ready artifact reads as
         -- a ready artifact nobody should trust.
         error        = case when p_status = 'ready' then null else p_error end,
         rendered_at  = case when p_status = 'ready' then now() else a.rendered_at end
   where a.id = p_artifact
   returning * into v_row;

  if v_row.id is null then
    raise exception 'unknown_artifact' using errcode = '42704';
  end if;
  return v_row;
end $$;
revoke execute on function public.record_export_artifact(uuid, public.export_status, text, bigint, int, int, jsonb, text) from public, anon, authenticated;
grant  execute on function public.record_export_artifact(uuid, public.export_status, text, bigint, int, int, jsonb, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- retry_export_artifact() — REQ-DSG-012, «a failed export states what failed
-- and offers a retry».
-- ═══════════════════════════════════════════════════════════════════════════
create function public.retry_export_artifact(p_artifact uuid) returns public.export_artifacts
language plpgsql security definer set search_path = '' as $$
declare v_row public.export_artifacts;
begin
  select * into v_row from public.export_artifacts a where a.id = p_artifact;
  if v_row.id is null or v_row.org_id <> public.auth_org_id() or not public.is_org_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  -- Only a failure is retried. Re-rendering a `ready` artifact would burn a
  -- render to produce the bytes that already exist (REQ-DSG-013).
  if v_row.status <> 'failed' then
    return v_row;
  end if;

  update public.export_artifacts a set status = 'queued', error = null where a.id = p_artifact returning * into v_row;

  perform public.enqueue_job(
    'render_variant',
    jsonb_build_object('artifact_id', p_artifact),
    'doc:' || v_row.document_id::text || ':' || v_row.preset || ':' || v_row.format::text,
    null, 'render', 3
  );
  perform public.write_audit(v_row.org_id, 'design.export_retried', 'export_artifact', p_artifact);
  return v_row;
end $$;
revoke execute on function public.retry_export_artifact(uuid) from public, anon;
grant  execute on function public.retry_export_artifact(uuid) to authenticated;
