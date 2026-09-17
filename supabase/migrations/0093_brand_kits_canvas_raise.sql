-- supabase/migrations/0093_brand_kits_canvas_raise.sql — promoted by the lead from
-- supabase/proposed/branding/0001_brand_kits_canvas_raise.sql (wave 8, sync 1, DEC-127, DEC-148).
--
-- proposed by `branding` (wave 8, DEC-127) — canvasRaise, the second stop of
-- the poster's gradient background, joins the nine light/dark token pairs
-- `0068_brand_kits.sql` already carries.
--
-- Serves:  06 §3.3/§8.3 (the poster gradient, one source of truth, four
--          consumers), REQ-DSG-021, REQ-DSG-026
-- Cites:   DEC-127 (the gradient fill, the canvasRaise token — #1d2a42 dark
--          / #f1f3f7 light), DEC-052 (the platform default is the identity
--          override), 0068 (brand_kits, brand_kit(), save_brand_kit(),
--          export_render_context()'s brand column), 0071 (save_brand_kit()/
--          reset_brand_kit() enqueue regenerate_poster on a live session)
--
-- 03 §8.2 ROWS THIS FILE NEEDS (handed to the lead with the file):
--   | `POL-brand_kit.canvas_raise_identity_default` | For an org with no row, or a row saved before this migration, `brand_kit()`'s `canvasRaise` matches `platformBrand()`'s — the per-token identity override. |
--   | `POL-brand_kit.canvas_raise_override` | With a row whose `canvasRaise` was explicitly saved, `brand_kit()` returns that value, not the platform default. |
--   | `POL-save_brand_kit.canvas_raise_required` | A save whose `p_light`/`p_dark` omits `canvasRaise` fails `23502`, same as any other missing token. |
--   | `POL-export_render_context.canvas_raise_override` | With a row, the `brand` column's `light`/`dark` objects carry the saved `canvasRaise`; with none, they omit the key entirely (raw override, `{}` semantics unchanged). |
--
-- WHY A NEW FILE ON TOP OF `0068`/`0071`, NOT AN EDIT TO EITHER: both are
-- already promoted migrations; a teammate never edits a promoted one
-- (`CLAUDE.md` § The migration rule). `create or replace function` is safe
-- for all three functions below — none of their SIGNATURES or RETURN TYPES
-- change, only a function body and (for `brand_kit()`/`export_render_
-- context()`) the shape of the jsonb VALUE each returns — so, unlike
-- `0068`'s own amendment of `export_render_context()` (which widened its
-- `returns table (...)` column list and needed a `drop` first), none of
-- these three need dropping. `reset_brand_kit()` is untouched: it deletes
-- the whole row and never names a column.
--
-- WHY THE COLUMNS ARE ADDED NULLABLE, BACKFILLED, THEN SET NOT NULL: an
-- org that saved a kit in an earlier wave already has a `brand_kits` row,
-- and `add column ... not null` with no default fails outright against a
-- populated table. The backfill writes exactly the platform value
-- (`brand.ts`'s `LIGHT.canvasRaise`/`DARK.canvasRaise`, transcribed) into
-- every existing row, which is the per-token identity override applied
-- once at migration time rather than left to `fillBrandDefaults()` (the
-- app-side fallback added ahead of this file, wave-8 sync) to keep
-- covering forever. No column-level DEFAULT is kept afterwards — matching
-- the other nine token columns, which carry none and rely on
-- `save_brand_kit()` always receiving a whole `BrandColourSet` (the Zod
-- schema already requires `canvasRaise` as of contract 1, so a save that
-- omits it fails `23502`, exactly like any other missing token).

alter table public.brand_kits
  add column light_canvas_raise text check (light_canvas_raise ~* '^#[0-9a-f]{6}$'),
  add column dark_canvas_raise  text check (dark_canvas_raise  ~* '^#[0-9a-f]{6}$');

update public.brand_kits
   set light_canvas_raise = '#f1f3f7',
       dark_canvas_raise  = '#1d2a42'
 where light_canvas_raise is null;

alter table public.brand_kits
  alter column light_canvas_raise set not null,
  alter column dark_canvas_raise  set not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- brand_kit(p_org) — `create or replace`, `0068`'s body plus canvasRaise.
-- security invoker, unchanged; the coalesce literals are `brand.ts`'s
-- LIGHT.canvasRaise / DARK.canvasRaise transcribed, same pairing
-- `tests/rls/brand-kits.test.ts`'s `POL-brand_kit.identity_default` case
-- already guards for the other nine (that case needs no edit — it loops
-- `Object.keys(kit.light)`, which now includes `canvasRaise` because this
-- function does).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.brand_kit(p_org uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'orgId', p_org,
    'isOverridden', (bk.org_id is not null),
    'light', jsonb_build_object(
      'canvas',      coalesce(bk.light_canvas,       '#ffffff'),
      'surface',     coalesce(bk.light_surface,      '#ffffff'),
      'fgHeading',   coalesce(bk.light_fg_heading,   '#0b1220'),
      'fgBody',      coalesce(bk.light_fg_body,      '#33415c'),
      'fgMuted',     coalesce(bk.light_fg_muted,     '#5b6780'),
      'edge',        coalesce(bk.light_edge,         '#e6eaf0'),
      'edgeStrong',  coalesce(bk.light_edge_strong,  '#767f8c'),
      'spine',       coalesce(bk.light_spine,        '#d7dce3'),
      'node',        coalesce(bk.light_node,         '#0b1220'),
      'canvasRaise', coalesce(bk.light_canvas_raise, '#f1f3f7')
    ),
    'dark', jsonb_build_object(
      'canvas',      coalesce(bk.dark_canvas,        '#0b1220'),
      'surface',     coalesce(bk.dark_surface,       '#111a2c'),
      'fgHeading',   coalesce(bk.dark_fg_heading,    '#ffffff'),
      'fgBody',      coalesce(bk.dark_fg_body,       '#c9ced6'),
      'fgMuted',     coalesce(bk.dark_fg_muted,      '#a8b3c4'),
      -- 06 §8.3 / packages/designer-runtime/src/brand.ts: globals.css writes
      -- these two as rgba() over the silver; an email has no page behind it
      -- to blend with, so the flattened value is used here, same as the
      -- runtime's own DARK constant.
      'edge',        coalesce(bk.dark_edge,          '#252e3d'),
      'edgeStrong',  coalesce(bk.dark_edge_strong,   '#4b5464'),
      'spine',       coalesce(bk.dark_spine,         '#252e3d'),
      'node',        coalesce(bk.dark_node,          '#ffffff'),
      -- DEC-127 — `--color-navy-800`, the second stop of the canvas's
      -- `linear-gradient(140deg, #111a2c, #1d2a42)`.
      'canvasRaise', coalesce(bk.dark_canvas_raise,  '#1d2a42')
    ),
    'logoAssetId',     bk.logo_asset_id,
    'headingFontId',   bk.heading_font_id,
    'bodyFontId',      bk.body_font_id,
    'updatedAt',       bk.updated_at
  )
  from (select p_org as org_id) o
  left join public.brand_kits bk on bk.org_id = o.org_id
$$;
revoke execute on function public.brand_kit(uuid) from public, anon;
grant  execute on function public.brand_kit(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- save_brand_kit() — `create or replace`, `0071`'s body (the poster-
-- regeneration enqueue) carried forward exactly, plus the two new columns
-- in the insert/update lists. p_light/p_dark already carry `canvasRaise`
-- from the client — `BrandColourSet` (src/lib/brand/schema.ts) requires it
-- as of contract 1, so no new function PARAMETER is needed; a save that
-- omits the key fails NOT NULL (23502), the same code every other missing
-- token already produces.
-- ═══════════════════════════════════════════════════════════════════════════
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

  -- ★ 06 §8.3's demonstrable, carried from `0071`: a live (auto) poster
  -- re-renders because the kit it binds through {{brand.*}} just changed —
  -- canvasRaise included, since a poster's gradient stop reads it too. A
  -- customised one is left exactly alone (DEC-012).
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

-- ═══════════════════════════════════════════════════════════════════════════
-- export_render_context() — `create or replace`; unlike `0068`'s own
-- amendment, no `drop` is needed this time: the `returns table (...)`
-- column list is unchanged (`brand jsonb` was already added in `0068`),
-- only the jsonb VALUE that column carries gains a key. Header note 2 of
-- `0068` stands: this is the RAW override only (no coalesce), `{}` when no
-- row exists — `resolveBrand()` in the runtime does the one merge.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.export_render_context(p_artifact uuid)
returns table (
  artifact_id uuid, org_id uuid, document_id uuid, preset text, format public.export_format,
  source_fingerprint text, render_context jsonb, document jsonb,
  template_version_id uuid, previous_signature jsonb, allow_jpeg boolean,
  brand jsonb
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.org_id, a.document_id, a.preset, a.format,
         a.source_fingerprint, a.render_context, d.document,
         d.template_version_id,
         (select p.tier_a_signature
            from public.export_artifacts p
           where p.document_id = a.document_id and p.preset = a.preset
             and p.format = a.format and p.source_fingerprint = a.source_fingerprint
             and p.status = 'ready' and p.tier_a_signature is not null
           order by p.rendered_at desc limit 1),
         coalesce(os.allow_jpeg_export, false),
         coalesce(
           (select jsonb_build_object(
              'light', jsonb_build_object(
                'canvas', bk.light_canvas, 'surface', bk.light_surface, 'fgHeading', bk.light_fg_heading,
                'fgBody', bk.light_fg_body, 'fgMuted', bk.light_fg_muted, 'edge', bk.light_edge,
                'edgeStrong', bk.light_edge_strong, 'spine', bk.light_spine, 'node', bk.light_node,
                'canvasRaise', bk.light_canvas_raise
              ),
              'dark', jsonb_build_object(
                'canvas', bk.dark_canvas, 'surface', bk.dark_surface, 'fgHeading', bk.dark_fg_heading,
                'fgBody', bk.dark_fg_body, 'fgMuted', bk.dark_fg_muted, 'edge', bk.dark_edge,
                'edgeStrong', bk.dark_edge_strong, 'spine', bk.dark_spine, 'node', bk.dark_node,
                'canvasRaise', bk.dark_canvas_raise
              ),
              'logoAssetId', bk.logo_asset_id
            )
            from public.brand_kits bk where bk.org_id = a.org_id),
           '{}'::jsonb
         )
    from public.export_artifacts a
    join public.design_documents d on d.id = a.document_id
    left join public.org_settings os on os.org_id = a.org_id
   where a.id = p_artifact
$$;
revoke execute on function public.export_render_context(uuid) from public, anon, authenticated;
grant  execute on function public.export_render_context(uuid) to service_role;
