-- proposed by `branding` (wave 4, M7-branding) — the org brand kit. Sync 1.
--
-- Serves:  02 §4.13 (ENT-brand_kits, amended under DEC-052 decision 4),
--          03 §5.9 (P1 read / P2 write pattern), 04 §1 (scoring_config_history
--          is deliberately general), 06 §8.3 (one source of truth, four
--          consumers), REQ-DSG-021, REQ-ADM-015
-- Cites:   DEC-003 (platform default theme), DEC-008 (centralised brand),
--          DEC-009 (no SVG, raster only), DEC-052 (the ownership and the
--          §4.13 amendment)
--
-- 03 §8.2 ROWS THIS FILE NEEDS (handed to the lead with the file):
--   | `POL-brand_kits.select.member` | Any member of the org reads the kit; a member of another org gets nothing. |
--   | `POL-brand_kits.write.rpc_only` | `brand_kits` has no insert/update/delete grant to `authenticated`: a direct write is refused on the grant, even by an admin. |
--   | `POL-save_brand_kit.admin_only` | A member and a moderator are refused `42501`; an admin's save succeeds. |
--   | `POL-save_brand_kit.history` | A save writes one `scoring_config_history` row per changed column (`scope = 'branding'`) and one `audit_log` row, in the same transaction. |
--   | `POL-save_brand_kit.logo_ownership` | A logo asset belonging to another org is refused. |
--   | `POL-save_brand_kit.font_gate` | A font at `parity_status <> 'passed'` is refused for either face (A39). |
--   | `POL-reset_brand_kit.admin_only` | A moderator's reset is refused; an admin's deletes the row and is audited. |
--   | `POL-brand_kit.identity_default` | `public.brand_kit(p_org)` for an org with no row returns the platform defaults, matching `packages/designer-runtime/src/brand.ts` byte-for-byte. |
--   | `POL-brand_kit.override` | With a row, `public.brand_kit(p_org)` returns the org's own colours, not the platform defaults. |
--   | `POL-export_render_context.brand_identity` | For an org with no `brand_kits` row, the new `brand` column is `{}` and every previously-existing column is unchanged (the identity override, DEC-052). |
--   | `POL-export_render_context.brand_override` | For an org with a row, the `brand` column carries exactly its light/dark overrides and `logoAssetId`. |
--
-- THREE THINGS WORTH KNOWING BEFORE READING.
--
--  1. THE PLATFORM DEFAULT IS THE IDENTITY OVERRIDE (DEC-052, 06 §8.3). No
--     `brand_kits` row is not an error state and not "unconfigured" — it is
--     the normal state for every org until an admin visits SCR-059, and
--     every consumer must render exactly what it renders today. That is why
--     `brand_kit()` always returns a full, valid kit (never null fields) and
--     why `export_render_context()`'s new `brand` column is an EMPTY jsonb
--     object rather than a null one when no row exists — `resolveBrand({})`
--     in the runtime is then a documented no-op, not a null check the
--     renderer has to add everywhere it did not have to before.
--
--  2. TWO DIFFERENT SHAPES, ON PURPOSE. `public.brand_kit(p_org)` returns
--     COLOURS ALREADY MERGED with the platform defaults, because its
--     consumer (the mail renderer, `worker/src/mail/**`) has no TypeScript
--     resolver to merge them itself — 06 §8.3's email-template leg reads one
--     finished shape. `export_render_context()`'s `brand` column is the RAW
--     override only (possibly `{}`), because its consumer (the render
--     worker) already owns `resolveBrand(overrides)` in
--     `@kareem/designer-runtime` and merging twice would just be a second
--     place the platform default could drift from `platformBrand()`. One
--     merge, in one of the two languages this system renders in — never
--     both for the same field.
--
--  3. `brand_kits` HAS NO WRITE GRANT TO `authenticated` AT ALL — same
--     pattern as `sessions` (0020) and `export_artifacts` (0060): the two
--     SECURITY DEFINER functions below are the only door, so a direct
--     `update public.brand_kits ...` is refused on the GRANT, before RLS is
--     even asked. `assert_fresh_admin()` (0005) re-reads role and
--     `claims_version` fresh rather than trusting the JWT for a privileged
--     write (DEC-014).

-- ═══════════════════════════════════════════════════════════════════════════
-- brand_kits — 02 §4.13 (amended under DEC-052 decision 4).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.brand_kits (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null unique references public.orgs(id) on delete cascade,

  logo_asset_id     uuid references public.design_assets(id) on delete set null,

  -- Nine light tokens, nine dark tokens — BRAND_COLOUR_TOKENS,
  -- packages/designer-runtime/src/brand.ts. A row is always saved whole
  -- (SCR-059 shows all nine at once for each scheme), so every column is
  -- `not null` once the row exists at all — there is no partial override.
  light_canvas       text not null check (light_canvas       ~* '^#[0-9a-f]{6}$'),
  light_surface      text not null check (light_surface      ~* '^#[0-9a-f]{6}$'),
  light_fg_heading   text not null check (light_fg_heading   ~* '^#[0-9a-f]{6}$'),
  light_fg_body      text not null check (light_fg_body      ~* '^#[0-9a-f]{6}$'),
  light_fg_muted     text not null check (light_fg_muted     ~* '^#[0-9a-f]{6}$'),
  light_edge         text not null check (light_edge         ~* '^#[0-9a-f]{6}$'),
  light_edge_strong  text not null check (light_edge_strong  ~* '^#[0-9a-f]{6}$'),
  light_spine        text not null check (light_spine        ~* '^#[0-9a-f]{6}$'),
  light_node         text not null check (light_node         ~* '^#[0-9a-f]{6}$'),

  dark_canvas        text not null check (dark_canvas        ~* '^#[0-9a-f]{6}$'),
  dark_surface       text not null check (dark_surface       ~* '^#[0-9a-f]{6}$'),
  dark_fg_heading    text not null check (dark_fg_heading    ~* '^#[0-9a-f]{6}$'),
  dark_fg_body       text not null check (dark_fg_body       ~* '^#[0-9a-f]{6}$'),
  dark_fg_muted      text not null check (dark_fg_muted      ~* '^#[0-9a-f]{6}$'),
  dark_edge          text not null check (dark_edge          ~* '^#[0-9a-f]{6}$'),
  dark_edge_strong   text not null check (dark_edge_strong   ~* '^#[0-9a-f]{6}$'),
  dark_spine         text not null check (dark_spine         ~* '^#[0-9a-f]{6}$'),
  dark_node          text not null check (dark_node          ~* '^#[0-9a-f]{6}$'),

  -- Selectable at parity_status = 'passed' only (A39) — checked in
  -- save_brand_kit() below, not a table constraint: a font's status is a
  -- property of the font row and can change after it is referenced here.
  heading_font_id   uuid references public.fonts(id) on delete set null,
  body_font_id      uuid references public.fonts(id) on delete set null,

  updated_by        uuid references public.members(id),
  updated_at        timestamptz not null default now()
);

create trigger brand_kits_updated_at before update on public.brand_kits
  for each row execute function public.set_updated_at();

-- ── RLS: P1 read, no direct write grant at all (header note 3) ────────────
alter table public.brand_kits enable row level security;
revoke all on public.brand_kits from anon, authenticated, service_role;

create policy "p1_org_read" on public.brand_kits for select to authenticated
  using (org_id = public.auth_org_id());
grant select on public.brand_kits to authenticated;

-- The mail renderer calls public.brand_kit() as service_role (worker jobs
-- never carry a member session, invariant 7); security invoker means the
-- grant below is load-bearing even though service_role also bypasses RLS —
-- bypassrls skips policies, never table grants (0067 set the same precedent
-- for `fonts`).
grant select on public.brand_kits to service_role;

-- ── scoring_config_history gains a scope (02 §4.1 made the table general on
-- purpose; the check constraint predates this track and needs widening) ───
alter table public.scoring_config_history drop constraint scoring_config_history_scope_check;
alter table public.scoring_config_history add constraint scoring_config_history_scope_check
  check (scope in ('scoring', 'org_settings', 'badges', 'levels', 'perks', 'streaks', 'branding'));

-- One row per changed column, same shape as org_settings_history() (0004).
-- Handles both the first save (an INSERT — OLD does not exist) and every
-- later save (an UPDATE) with one function, because a brand kit's row does
-- not exist until an admin visits SCR-059 for the first time — unlike
-- org_settings, which is seeded at org creation.
create function public.brand_kits_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  col  text;
  oldj jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  newj jsonb := to_jsonb(new);
begin
  for col in select key from jsonb_each(newj) loop
    -- updated_by is housekeeping (the same value as this row's own
    -- actor_id), not a configuration value someone would want a history
    -- entry to say "changed" — same exclusion spirit as org_settings_history().
    if col in ('id', 'org_id', 'updated_at', 'updated_by') then continue; end if;
    if oldj -> col is distinct from newj -> col then
      insert into public.scoring_config_history (org_id, scope, entity_id, field, old_value, new_value, actor_id)
      values (new.org_id, 'branding', new.id, col, oldj -> col, newj -> col, public.auth_member_id());
    end if;
  end loop;
  return new;
end $$;
create trigger brand_kits_history after insert or update on public.brand_kits
  for each row execute function public.brand_kits_history();

-- ═══════════════════════════════════════════════════════════════════════════
-- save_brand_kit() — the admin's one door in. REQ-DSG-021, REQ-ADM-015.
--
-- p_light / p_dark: jsonb objects carrying all nine BRAND_COLOUR_TOKENS keys
-- (camelCase, matching src/lib/brand/schema.ts's brandColourSet). A missing
-- key fails NOT NULL (23502); a malformed value fails the column CHECK
-- (23514) — the same two error codes every other write RPC in this schema
-- lets Postgres raise rather than re-validating shape twice.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.save_brand_kit(
  p_light            jsonb,
  p_dark             jsonb,
  p_logo_asset_id    uuid default null,
  p_heading_font_id  uuid default null,
  p_body_font_id     uuid default null
) returns public.brand_kits
language plpgsql security definer set search_path = '' as $$
declare
  actor  public.members := public.assert_fresh_admin();
  v_org  uuid := actor.org_id;
  v_row  public.brand_kits;
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

  return v_row;
end $$;
revoke execute on function public.save_brand_kit(jsonb, jsonb, uuid, uuid, uuid) from public, anon;
grant  execute on function public.save_brand_kit(jsonb, jsonb, uuid, uuid, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- reset_brand_kit() — deletes the row. The platform default is the identity
-- override, so "reset" is simply "no row" (06 §8.3), never a second copy of
-- the platform's own values written into the org's row.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.reset_brand_kit() returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_fresh_admin();
  v_row public.brand_kits;
begin
  delete from public.brand_kits where org_id = actor.org_id returning * into v_row;
  if v_row.id is not null then
    perform public.write_audit(actor.org_id, 'branding.kit_reset', 'brand_kit', v_row.id, to_jsonb(v_row), null);
  end if;
end $$;
revoke execute on function public.reset_brand_kit() from public, anon;
grant  execute on function public.reset_brand_kit() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- brand_kit(p_org) — the SQL consumers' one door. security INVOKER (header
-- note 2): colours are merged with the platform defaults here because the
-- mail renderer has no TypeScript resolver to do it. The literal fallbacks
-- below are packages/designer-runtime/src/brand.ts's LIGHT/DARK transcribed
-- — tests/rls/brand-kits.test.ts compares this function's no-row output
-- against platformBrand() so the two cannot drift silently.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.brand_kit(p_org uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'orgId', p_org,
    'isOverridden', (bk.org_id is not null),
    'light', jsonb_build_object(
      'canvas',      coalesce(bk.light_canvas,      '#ffffff'),
      'surface',     coalesce(bk.light_surface,     '#ffffff'),
      'fgHeading',   coalesce(bk.light_fg_heading,  '#0b1220'),
      'fgBody',      coalesce(bk.light_fg_body,     '#33415c'),
      'fgMuted',     coalesce(bk.light_fg_muted,    '#5b6780'),
      'edge',        coalesce(bk.light_edge,        '#e6eaf0'),
      'edgeStrong',  coalesce(bk.light_edge_strong, '#767f8c'),
      'spine',       coalesce(bk.light_spine,       '#d7dce3'),
      'node',        coalesce(bk.light_node,        '#0b1220')
    ),
    'dark', jsonb_build_object(
      'canvas',      coalesce(bk.dark_canvas,       '#0b1220'),
      'surface',     coalesce(bk.dark_surface,      '#111a2c'),
      'fgHeading',   coalesce(bk.dark_fg_heading,   '#ffffff'),
      'fgBody',      coalesce(bk.dark_fg_body,      '#c9ced6'),
      'fgMuted',     coalesce(bk.dark_fg_muted,     '#a8b3c4'),
      -- 06 §8.3 / packages/designer-runtime/src/brand.ts: globals.css writes
      -- these two as rgba() over the silver; an email has no page behind it
      -- to blend with, so the flattened value is used here, same as the
      -- runtime's own DARK constant.
      'edge',        coalesce(bk.dark_edge,         '#252e3d'),
      'edgeStrong',  coalesce(bk.dark_edge_strong,  '#4b5464'),
      'spine',       coalesce(bk.dark_spine,        '#252e3d'),
      'node',        coalesce(bk.dark_node,         '#ffffff')
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
-- export_render_context() (0060) — adds `brand`. Postgres refuses to widen
-- a RETURNS TABLE list with CREATE OR REPLACE, so this drops and recreates
-- the function; the body is otherwise byte-identical to 0060's, and the
-- grants are reapplied because DROP FUNCTION clears them.
-- ═══════════════════════════════════════════════════════════════════════════
drop function public.export_render_context(uuid);

create function public.export_render_context(p_artifact uuid)
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
         -- RAW overrides only (header note 2) — {} when no row exists, so
         -- resolveBrand({}) in the runtime is a documented no-op and the
         -- goldens do not move for an org that has never visited SCR-059.
         coalesce(
           (select jsonb_build_object(
              'light', jsonb_build_object(
                'canvas', bk.light_canvas, 'surface', bk.light_surface, 'fgHeading', bk.light_fg_heading,
                'fgBody', bk.light_fg_body, 'fgMuted', bk.light_fg_muted, 'edge', bk.light_edge,
                'edgeStrong', bk.light_edge_strong, 'spine', bk.light_spine, 'node', bk.light_node
              ),
              'dark', jsonb_build_object(
                'canvas', bk.dark_canvas, 'surface', bk.dark_surface, 'fgHeading', bk.dark_fg_heading,
                'fgBody', bk.dark_fg_body, 'fgMuted', bk.dark_fg_muted, 'edge', bk.dark_edge,
                'edgeStrong', bk.dark_edge_strong, 'spine', bk.dark_spine, 'node', bk.dark_node
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
