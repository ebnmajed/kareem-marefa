-- proposed by `branding` (wave 11, M13, DEC-166 §2) — the status-colour
-- contrast guard `DEC-073` left dangling as a consequence to discharge here.
--
-- Serves:  16 §16.6 ("branding adds the status pairs to the contrast set
--          and makes save_brand_kit() REFUSE a palette on which a status
--          badge fails AA"), REQ-UIX-003, REQ-NFR-007
-- Cites:   DEC-073 (--color-live*/--color-ended* are platform constants,
--          never BRAND_COLOUR_TOKENS), 0068/0071/0093 (save_brand_kit()'s
--          three prior bodies — this is the fourth, additive per
--          `CLAUDE.md`'s migration rule: same signature, body only),
--          DEC-043 (a write-then-raise RPC rolls back its own write — the
--          guard runs before the INSERT, same shape as the existing
--          logo/font checks it sits beside)
--
-- 03 §8.2 ROWS THIS FILE NEEDS (handed to the lead with the file):
--   | `POL-save_brand_kit.status_contrast_refused` | A light palette whose `canvas` sits too close to `--color-live-bg`/`--color-ended-bg`'s ink threshold (i.e. `--color-live`/`--color-ended` would read below 4.5:1 against it) is refused `55000`, before any write. |
--   | `POL-save_brand_kit.status_contrast_accepted` | The platform default palette (`platformBrand()`'s own light/dark, transcribed) always saves — the guard's own regression test against DEC-052's identity override. |
--   | `POL-save_brand_kit.status_contrast_dark` | A dark palette whose `dark_canvas`/`dark_surface` sits too close to `--color-live-on-dark` is refused; a dark palette far from it saves. |
--   | `POL-status-contrast-formula-agreement` | `public.wcag_contrast_ratio()`'s SQL formula and `src/lib/brand/contrast.ts`'s TypeScript formula agree on every pair this guard checks — a second copy of WCAG's maths, proven not to drift (`tests/rls/status-contrast.test.ts`). |
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY SIX PAIRS, NOT TEN — AND WHY THE PLATFORM DEFAULT ITSELF RULES OUT A
-- WIDER GUARD. `Badge`'s filled tones (`src/components/ui/badge.tsx:33-36`)
-- put a near-white platform fill (`--color-live-bg #fbf5ea`, `--color-ended-
-- bg #f1f3f7`) behind status text in light context. The tempting first draft
-- of this guard checked that fill against the org's `light_canvas`/
-- `light_surface` at SC 1.4.11's 3:1 — and the PLATFORM DEFAULT ITSELF FAILS
-- IT: `light_canvas`/`light_surface` are both `#ffffff` in `platformBrand()`,
-- and `contrastRatio('#fbf5ea', '#ffffff') ≈ 1.09`, `contrastRatio('#f1f3f7',
-- '#ffffff') ≈ 1.11` — nowhere near 3:1. `DEC-052`/`DEC-073` require the
-- platform default to always be ACCEPTED, so a guard that refuses it is
-- wrong regardless of how defensible the abstract WCAG reading looks. This
-- was caught by measuring the platform default against the drafted guard
-- before writing it, exactly as the lead's sync-1 note asked, and is why the
-- pairs below are ONLY the ones `16` §16.6 actually names a numeric failure
-- for: status colour AS TEXT on an org background, never the filled badge's
-- own near-white chip as an object boundary (which the platform ships
-- exactly as borderline as an org's own unedited defaults, and is a design
-- fact wave 11 does not get to retroactively outlaw).
--
--  1. `--color-live`/`--color-ended` AS TEXT on `light_canvas`/`light_
--     surface` — SC 1.4.3, 4.5:1. This is the outline `Badge` variant
--     (`badge.tsx`'s `OUTLINE_TONE.live`/`.ended`), already live in the tree
--     with no fill under it at all (`src/app/[locale]/app/platform/
--     templates/library-table.tsx:143`, `.../impersonate/history-table.tsx:58`)
--     — exactly `16` §16.6's own numeric example ("`--color-ended #5b6780`
--     as text on an overridden surface can fall below 4.5:1").
--  2. `--color-live-on-dark` on `dark_canvas`/`dark_surface` — same
--     criterion, 4.5:1 (the stricter of the two SC 1.4.3/1.4.11 thresholds
--     a badge's dark leg could invoke, since it reads BOTH as this colour's
--     border AND its text once `.theme-dark` drops the fill: `badge.tsx:33`,
--     `.../:44`). `--color-ended` contributes NO dark pair: its dark leg
--     (`badge.tsx:35`) is `border-edge-strong text-fg-muted` — BOTH already
--     org tokens (`dark_edge_strong`, `dark_fg_muted`), not platform
--     constants, so it is an org-vs-org question this decision does not
--     reach, not an omission.
--
-- Platform default measured against all six (all comfortably clear):
--   live   vs light.canvas/surface (#ffffff)      5.89:1
--   ended  vs light.canvas/surface (#ffffff)      5.68:1
--   live-on-dark vs dark.canvas (#0b1220)          8.52:1
--   live-on-dark vs dark.surface (#111a2c)         7.91:1
--
-- WHY A NEW FILE ON TOP OF `0068`/`0071`/`0093`, NOT AN EDIT: all three are
-- already promoted (`CLAUDE.md` § The migration rule). `create or replace
-- function` is safe here — `save_brand_kit()`'s signature and return type
-- are unchanged, only its body gains one more `if ... then raise` block
-- before the `insert`, in the same place its existing logo/font checks
-- already sit (`0068:154-166`).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── `wcag_relative_luminance` / `wcag_contrast_ratio` — the same two-line
-- WCAG 2.x §1.4.3 formula `src/lib/brand/contrast.ts` and
-- `tests/unit/status-tokens.test.ts` each already carry in TypeScript. A
-- THIRD copy, in SQL, is unavoidable here because the enforcement point is
-- the database (16 §16.6: "that is REQ-NFR-007 at the one place it can
-- actually be enforced") — `tests/rls/status-contrast.test.ts` is the reader
-- that keeps this copy from silently drifting from the other two, the same
-- discipline `status-tokens.test.ts`'s own header already names for ITS
-- copy. `decode(..., 'hex')` + `get_byte()` reads the channel bytes exactly
-- as `contrast.ts`'s `parseInt(hex.slice(i, i + 2), 16)` does; the
-- immutable, pure functions take no lock and touch no table.
create function public.wcag_relative_luminance(p_hex text) returns numeric
language sql immutable set search_path = '' as $$
  select
    0.2126 * (case when r <= 0.03928 then r / 12.92 else ((r + 0.055) / 1.055) ^ 2.4 end) +
    0.7152 * (case when g <= 0.03928 then g / 12.92 else ((g + 0.055) / 1.055) ^ 2.4 end) +
    0.0722 * (case when b <= 0.03928 then b / 12.92 else ((b + 0.055) / 1.055) ^ 2.4 end)
  from (
    select
      get_byte(decode(substr(p_hex, 2, 2), 'hex'), 0) / 255.0 as r,
      get_byte(decode(substr(p_hex, 4, 2), 'hex'), 0) / 255.0 as g,
      get_byte(decode(substr(p_hex, 6, 2), 'hex'), 0) / 255.0 as b
  ) channels
$$;
revoke execute on function public.wcag_relative_luminance(text) from public, anon, authenticated;

create function public.wcag_contrast_ratio(p_a text, p_b text) returns numeric
language sql immutable set search_path = '' as $$
  select (greatest(la, lb) + 0.05) / (least(la, lb) + 0.05)
  from (
    select public.wcag_relative_luminance(p_a) as la, public.wcag_relative_luminance(p_b) as lb
  ) lum
$$;
revoke execute on function public.wcag_contrast_ratio(text, text) from public, anon, authenticated;

-- ── `status_contrast_failure` — the six pairs above, transcribed as literal
-- hex constants (never read from `globals.css` — SQL cannot read a file at
-- runtime; the line numbers below are the citation, same discipline `0093`'s
-- `canvasRaise` backfill already used for its own transcription). Returns
-- the failing pair's key, or null if all six clear 4.5:1. A malformed hex
-- (not yet caught by the table's own CHECK, which only runs at INSERT) is
-- SKIPPED here rather than raising a raw cast error — `save_brand_kit()`'s
-- insert still refuses it with the table's own clean 23514, unchanged.
create function public.status_contrast_failure(p_light jsonb, p_dark jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare
  -- src/app/globals.css:51-54 — --color-live, --color-live-on-dark,
  -- --color-ended. NEVER added to BRAND_COLOUR_TOKENS (DEC-073).
  c_live         constant text := '#8a5a1f';
  c_ended        constant text := '#5b6780';
  c_live_on_dark constant text := '#d2a86b';
  aa             constant numeric := 4.5;
  hex_re         constant text := '^#[0-9a-fA-F]{6}$';
  pairs          constant text[][] := array[
    array['live_vs_light_canvas',         c_live,          p_light ->> 'canvas'],
    array['live_vs_light_surface',        c_live,          p_light ->> 'surface'],
    array['ended_vs_light_canvas',        c_ended,         p_light ->> 'canvas'],
    array['ended_vs_light_surface',       c_ended,         p_light ->> 'surface'],
    array['live_on_dark_vs_dark_canvas',  c_live_on_dark,  p_dark  ->> 'canvas'],
    array['live_on_dark_vs_dark_surface', c_live_on_dark,  p_dark  ->> 'surface']
  ];
  pair           text[];
begin
  foreach pair slice 1 in array pairs loop
    if pair[2] is null or pair[3] is null then continue; end if;
    if pair[2] !~* hex_re or pair[3] !~* hex_re then continue; end if;
    if public.wcag_contrast_ratio(pair[2], pair[3]) < aa then
      return pair[1];
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public.status_contrast_failure(jsonb, jsonb) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- save_brand_kit() — `create or replace`, `0093`'s body verbatim plus one
-- more `if ... then raise` block, in the same place the logo/font checks
-- already sit, before the `insert` (DEC-043: a write-then-raise RPC rolls
-- back its own write, so the check belongs BEFORE the first write, not
-- after).
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

  -- ★ DEC-073's consequence, discharged here (16 §16.6). Before any write,
  -- never after — see the header note above on why not `22023`.
  v_fail := public.status_contrast_failure(p_light, p_dark);
  if v_fail is not null then
    raise exception 'status_contrast_failed' using errcode = '55000', detail = v_fail;
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
end $$;
revoke execute on function public.save_brand_kit(jsonb, jsonb, uuid, uuid, uuid) from public, anon;
grant  execute on function public.save_brand_kit(jsonb, jsonb, uuid, uuid, uuid) to authenticated;
