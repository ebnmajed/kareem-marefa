-- 0216 — The brand kit saves any colours: the status-badge contrast lock is removed. DEC-272.
--
-- The owner's rulings (2026-10-06): template colours are fully editable — the database already accepts any colour in
-- a template (0195), so that half is the editor's alone — and «remove the color visibility lock thingy in the brand
-- colors selector», asked and answered «remove it entirely»: no refusal and no note. save_brand_kit() refused a
-- palette on which a status badge (مباشر · انتهت · …) failed AA (`status_contrast_failed`, 55000, DEC-073's M13
-- consequence). It is re-created without that check; nothing else in it changes.

CREATE OR REPLACE FUNCTION public.save_brand_kit(p_light jsonb, p_dark jsonb, p_logo_asset_id uuid DEFAULT NULL::uuid, p_heading_font_id uuid DEFAULT NULL::uuid, p_body_font_id uuid DEFAULT NULL::uuid)
 RETURNS brand_kits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor      public.members := public.assert_fresh_admin();
  v_org      uuid := actor.org_id;
  v_row      public.brand_kits;
  v_session  uuid;
  v_fail     text;
begin
  if p_logo_asset_id is not null and not exists (
    select 1 from public.design_assets a where a.id = p_logo_asset_id and a.org_id = v_org
  ) then
    raise exception 'bad_logo_asset' using errcode = '22023';
  end if;

  if p_heading_font_id is not null and not exists (
    select 1 from public.fonts f where f.id = p_heading_font_id and f.parity_status = 'passed'
  ) then
    raise exception 'font_not_selectable' using errcode = '22023';
  end if;
  if p_body_font_id is not null and not exists (
    select 1 from public.fonts f where f.id = p_body_font_id and f.parity_status = 'passed'
  ) then
    raise exception 'font_not_selectable' using errcode = '22023';
  end if;

  -- ★ 0216 (DEC-272, the owner's ruling): no contrast lock — any palette saves. DEC-073's status-badge check,
  -- added here in 0143, is withdrawn; status_contrast_failure() stays as a measure, refusing nothing.

  insert into public.brand_kits (
    org_id, logo_asset_id,
    light_canvas, light_surface, light_fg_heading, light_fg_body, light_fg_muted,
    light_edge, light_edge_strong, light_spine, light_node, light_canvas_raise,
    dark_canvas, dark_surface, dark_fg_heading, dark_fg_body, dark_fg_muted,
    dark_edge, dark_edge_strong, dark_spine, dark_node, dark_canvas_raise,
    heading_font_id, body_font_id, updated_by
  ) values (
    v_org, p_logo_asset_id,
    p_light ->> 'canvas', p_light ->> 'surface', p_light ->> 'fgHeading', p_light ->> 'fgBody', p_light ->> 'fgMuted',
    p_light ->> 'edge', p_light ->> 'edgeStrong', p_light ->> 'spine', p_light ->> 'node', p_light ->> 'canvasRaise',
    p_dark ->> 'canvas', p_dark ->> 'surface', p_dark ->> 'fgHeading', p_dark ->> 'fgBody', p_dark ->> 'fgMuted',
    p_dark ->> 'edge', p_dark ->> 'edgeStrong', p_dark ->> 'spine', p_dark ->> 'node', p_dark ->> 'canvasRaise',
    p_heading_font_id, p_body_font_id, actor.id
  )
  on conflict (org_id) do update set
    logo_asset_id     = excluded.logo_asset_id,
    light_canvas      = excluded.light_canvas,
    light_surface     = excluded.light_surface,
    light_fg_heading  = excluded.light_fg_heading,
    light_fg_body     = excluded.light_fg_body,
    light_fg_muted    = excluded.light_fg_muted,
    light_edge        = excluded.light_edge,
    light_edge_strong = excluded.light_edge_strong,
    light_spine       = excluded.light_spine,
    light_node        = excluded.light_node,
    light_canvas_raise = excluded.light_canvas_raise,
    dark_canvas       = excluded.dark_canvas,
    dark_surface      = excluded.dark_surface,
    dark_fg_heading   = excluded.dark_fg_heading,
    dark_fg_body      = excluded.dark_fg_body,
    dark_fg_muted     = excluded.dark_fg_muted,
    dark_edge         = excluded.dark_edge,
    dark_edge_strong  = excluded.dark_edge_strong,
    dark_spine        = excluded.dark_spine,
    dark_node         = excluded.dark_node,
    dark_canvas_raise = excluded.dark_canvas_raise,
    heading_font_id   = excluded.heading_font_id,
    body_font_id      = excluded.body_font_id,
    updated_by        = excluded.updated_by
  returning * into v_row;

  perform public.write_audit(
    v_org, 'branding.kit_saved', 'brand_kit', v_row.id, null,
    jsonb_build_object('logo_asset_id', v_row.logo_asset_id, 'heading_font_id', v_row.heading_font_id, 'body_font_id', v_row.body_font_id)
  );

  -- 06 §8.3's demonstrable, carried from `0071`/`0093`: a live (auto) poster
  -- re-renders because the kit it binds through {{brand.*}} just changed. A
  -- customised one is left exactly alone (DEC-012).
  for v_session in
    select sp.session_id from public.session_posters sp
     where sp.org_id = v_org and sp.binding = 'live'
  loop
    perform public.enqueue_job('regenerate_poster', jsonb_build_object('session_id', v_session),
                               'poster:' || v_session::text, null, 'render', 3);
  end loop;

  return v_row;
end $function$;
