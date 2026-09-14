-- proposed by `branding` (wave 4, M7-branding) — save/reset regenerate the
-- org's live posters. On top of `0068`.
--
-- Serves:  06 §8.3 ("one edit, four consumers" — the wave's demonstrable is
--          an org admin changing one colour and SEEING a poster re-render),
--          02 §4.13 (session_posters' live/detached rule, DEC-012),
--          REQ-DSG-021
-- Cites:   0063 (JOB-regenerate_poster, key `poster:{session_id}`,
--          DEC-012's asymmetry), 0060 ("the worker renders the PINNED
--          bindings, never a fresh resolution" — REQ-DSG-013, REQ-CRT-014),
--          DEC-053 decision 2 (the override is resolved at REQUEST time,
--          which is exactly what enqueueing here re-triggers)
--
-- 03 §8.2 ROWS THIS FILE NEEDS:
--   | `POL-save_brand_kit.regenerates_live_posters` | Saving a kit enqueues `regenerate_poster` once per org session with a LIVE poster, with `11` §2.5's key; a `detached` (customised) poster is left alone. |
--   | `POL-reset_brand_kit.regenerates_live_posters` | Resetting a kit does the same; resetting an org with no kit enqueues nothing. |
--
-- WHY THIS IS A NEW FILE ON TOP OF `0068`, NOT AN EDIT TO IT (the lead's
-- instruction, TEAM.md §4's migration rule generally): `0068` is already a
-- migration; a teammate never edits a promoted one. `create or replace
-- function` is safe here — neither function's signature or return type
-- changes, only the body, so no grant is lost the way `export_render_
-- context()`'s column-adding replace in `0068` itself needed a DROP first.
--
-- WHY A LIVE POSTER SPECIFICALLY, AND WHY ENQUEUEING RATHER THAN RENDERING:
-- `regenerate_poster` (0063) re-resolves `{{brand.*}}` at REQUEST time
-- through `worker/src/render/brand.ts`'s `brandBindings()`, before a new
-- fingerprint is taken — DEC-053 decision 2's whole point is that the
-- worker renders exactly the bindings it was handed and never re-resolves
-- them, so a colour change has to reach a document as a NEW request, not a
-- new render of an old one. A `customised` poster carries an admin's own
-- judgement (DEC-012) and is deliberately NOT touched — the same asymmetry
-- `0063`'s session hooks already respect, applied to a second trigger for
-- the same table. `enqueue_job`'s key collapses a burst (11 §1.1): saving a
-- kit twice in a row, or a save that touches ten live posters, still leaves
-- at most one pending render per session.
--
-- ON EVERY SUCCESSFUL SAVE, UNCONDITIONALLY — not only when a colour
-- literal changed. A logo replacement or a font change can change a poster
-- too, and "which columns matter to a poster" is a second copy of the
-- renderer's own binding logic that WILL drift from it. `save_brand_kit()`
-- already fires only when the admin has actually changed and submitted
-- something (SCR-059 has no empty-submit path), so there is no burst-of-
-- nothing case to guard against the way `0063`'s `is distinct from` guards
-- do for a session's many unrelated columns.
--
-- RESET IS INCLUDED TOO, though the request that asked for this named only
-- "save": a reset is symmetrically a brand change — colours revert from
-- the org's override to the platform default — and a live poster rendered
-- under the override would otherwise stay stale until something else
-- touched the session. Flagged to the lead in the sync message rather than
-- assumed silently.

create or replace function public.save_brand_kit(
  p_light            jsonb,
  p_dark             jsonb,
  p_logo_asset_id    uuid default null,
  p_heading_font_id  uuid default null,
  p_body_font_id     uuid default null
) returns public.brand_kits
language plpgsql security definer set search_path = '' as $$
declare
  actor      public.members := public.assert_fresh_admin();
  v_org      uuid := actor.org_id;
  v_row      public.brand_kits;
  v_session  uuid;
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

  insert into public.brand_kits (
    org_id, logo_asset_id,
    light_canvas, light_surface, light_fg_heading, light_fg_body, light_fg_muted,
    light_edge, light_edge_strong, light_spine, light_node,
    dark_canvas, dark_surface, dark_fg_heading, dark_fg_body, dark_fg_muted,
    dark_edge, dark_edge_strong, dark_spine, dark_node,
    heading_font_id, body_font_id, updated_by
  ) values (
    v_org, p_logo_asset_id,
    p_light ->> 'canvas', p_light ->> 'surface', p_light ->> 'fgHeading', p_light ->> 'fgBody', p_light ->> 'fgMuted',
    p_light ->> 'edge', p_light ->> 'edgeStrong', p_light ->> 'spine', p_light ->> 'node',
    p_dark ->> 'canvas', p_dark ->> 'surface', p_dark ->> 'fgHeading', p_dark ->> 'fgBody', p_dark ->> 'fgMuted',
    p_dark ->> 'edge', p_dark ->> 'edgeStrong', p_dark ->> 'spine', p_dark ->> 'node',
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
    dark_canvas       = excluded.dark_canvas,
    dark_surface      = excluded.dark_surface,
    dark_fg_heading   = excluded.dark_fg_heading,
    dark_fg_body      = excluded.dark_fg_body,
    dark_fg_muted     = excluded.dark_fg_muted,
    dark_edge         = excluded.dark_edge,
    dark_edge_strong  = excluded.dark_edge_strong,
    dark_spine        = excluded.dark_spine,
    dark_node         = excluded.dark_node,
    heading_font_id   = excluded.heading_font_id,
    body_font_id      = excluded.body_font_id,
    updated_by        = excluded.updated_by
  returning * into v_row;

  perform public.write_audit(
    v_org, 'branding.kit_saved', 'brand_kit', v_row.id, null,
    jsonb_build_object('logo_asset_id', v_row.logo_asset_id, 'heading_font_id', v_row.heading_font_id, 'body_font_id', v_row.body_font_id)
  );

  -- ★ 06 §8.3's demonstrable: a live (auto) poster re-renders because the
  -- kit it binds through {{brand.*}} just changed. A customised one is left
  -- exactly alone (DEC-012).
  for v_session in
    select sp.session_id from public.session_posters sp
     where sp.org_id = v_org and sp.binding = 'live'
  loop
    perform public.enqueue_job('regenerate_poster', jsonb_build_object('session_id', v_session),
                               'poster:' || v_session::text, null, 'render', 3);
  end loop;

  return v_row;
end $$;
revoke execute on function public.save_brand_kit(jsonb, jsonb, uuid, uuid, uuid) from public, anon;
grant  execute on function public.save_brand_kit(jsonb, jsonb, uuid, uuid, uuid) to authenticated;

create or replace function public.reset_brand_kit() returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor      public.members := public.assert_fresh_admin();
  v_row      public.brand_kits;
  v_session  uuid;
begin
  delete from public.brand_kits where org_id = actor.org_id returning * into v_row;
  if v_row.id is not null then
    perform public.write_audit(actor.org_id, 'branding.kit_reset', 'brand_kit', v_row.id, to_jsonb(v_row), null);

    for v_session in
      select sp.session_id from public.session_posters sp
       where sp.org_id = actor.org_id and sp.binding = 'live'
    loop
      perform public.enqueue_job('regenerate_poster', jsonb_build_object('session_id', v_session),
                                 'poster:' || v_session::text, null, 'render', 3);
    end loop;
  end if;
end $$;
revoke execute on function public.reset_brand_kit() from public, anon;
grant  execute on function public.reset_brand_kit() to authenticated;
