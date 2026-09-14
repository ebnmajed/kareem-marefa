-- promoted by the lead at wave-2 sync 10 · content, follow-up — the two doors JOB-convert_document and
-- JOB-render_pages write through. 11 §2.4, 07 §4.
--
-- Both are SECURITY DEFINER, service_role-only EXECUTE — the worker holds
-- `service_role` nowhere near the converter (DEC-032), but its own SQL
-- calls do use it, the same shape as public.award_points() (worker/src/
-- tasks/award_points.ts's own comment: "SECURITY DEFINER, service_role-only
-- EXECUTE grant"). Neither is reachable by `authenticated` or `anon` at all.
--
-- record_material_conversion() is also the ONLY place that enqueues
-- render_pages — through public.enqueue_job() (0025), never
-- `graphile_worker.add_job` and never `helpers.addJob()` from the worker's
-- own TypeScript (DEC-046's one door; worker/src/tasks/schedule_reminders.ts
-- already established this shape for job-to-job chaining, calling a SQL
-- function rather than chaining from TypeScript).
--
-- Both scope their UPDATE to `current_version_id = p_version_id` — a job
-- that finishes after a NEWER version has already superseded this one
-- writes nothing to `materials` (its own version row still gets its
-- pages/warning recorded, since that data belongs to the version, not the
-- material, but it can never win back `current_version_id`).
--
-- Serves:  REQ-MAT-003, REQ-MAT-011, 11 §2.4 (JOB-convert_document,
--          JOB-render_pages)
-- Cites:   0025 (public.enqueue_job) · 0037 (materials, material_versions,
--          material_pages) · DEC-006 (Keynote never reaches either of these)
--
-- 03 §8.2 rows this adds:
--   | `RPC-record_material_conversion.service_role_only` | `authenticated`
--     and `anon` are both refused on the grant; `service_role` succeeds. |
--   | `RPC-record_material_conversion.enqueues` | A successful call with a
--     page count enqueues `render_pages` keyed `pages:{version_id}`; a
--     failed call (or one with no page count) enqueues nothing. |
--   | `RPC-record_material_conversion.superseded` | A call naming a version
--     that is no longer `current_version_id` changes nothing on
--     `materials`, but still enqueues (the version's own row is still
--     worth rendering, if it somehow gets there — in practice the job that
--     would do that was itself for the version that superseded it). |
--   | `RPC-record_material_pages.service_role_only` | Same as above. |
--   | `RPC-record_material_pages.upsert` | A second call for the same
--     version and page number replaces that page's paths rather than
--     duplicating the row (`unique (material_version_id, page_number)`,
--     0037). |
--   | `RPC-record_material_pages.ready` | A successful call moves
--     `render_status` to `ready`. |
create function public.record_material_conversion(
  p_version_id         uuid,
  p_font_substitutions  text[] default '{}',
  p_page_count          int default null,
  p_failed              boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_material_id uuid;
begin
  select material_id into v_material_id from public.material_versions where id = p_version_id;
  if v_material_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update public.materials
     set render_status = case when p_failed then 'failed'::public.render_status else 'rendering'::public.render_status end,
         font_substitution_warning = case when coalesce(array_length(p_font_substitutions, 1), 0) > 0
           then array_to_string(p_font_substitutions, '، ') else null end,
         updated_at = now()
   where id = v_material_id and current_version_id = p_version_id;

  if not p_failed and p_page_count is not null then
    perform public.enqueue_job(
      'render_pages',
      jsonb_build_object('version_id', p_version_id, 'material_id', v_material_id, 'page_count', p_page_count),
      'pages:' || p_version_id::text
    );
  end if;
end $$;
revoke all on function public.record_material_conversion(uuid, text[], int, boolean) from public, anon, authenticated;
grant execute on function public.record_material_conversion(uuid, text[], int, boolean) to service_role;

create function public.record_material_pages(p_version_id uuid, p_pages jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_material_id uuid;
  v_org_id      uuid;
  p             jsonb;
begin
  select mv.material_id, mv.org_id into v_material_id, v_org_id
    from public.material_versions mv where mv.id = p_version_id;
  if v_material_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  for p in select * from jsonb_array_elements(p_pages) loop
    insert into public.material_pages (org_id, material_version_id, page_number, image_path, thumbnail_path, width, height)
    values (
      v_org_id, p_version_id, (p ->> 'page_number')::int, p ->> 'image_path', p ->> 'thumbnail_path',
      nullif(p ->> 'width', '')::int, nullif(p ->> 'height', '')::int
    )
    on conflict (material_version_id, page_number) do update
      set image_path = excluded.image_path, thumbnail_path = excluded.thumbnail_path,
          width = excluded.width, height = excluded.height;
  end loop;

  update public.materials set render_status = 'ready', updated_at = now()
   where id = v_material_id and current_version_id = p_version_id;
end $$;
revoke all on function public.record_material_pages(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_material_pages(uuid, jsonb) to service_role;
