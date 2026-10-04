-- supabase/migrations/0192_platform_palette.sql — the lead (wave 24, M26, DEC-242).
--
-- Serves:  REQ-DSG-032 (the platform default brand palette is «ساحة اللعب»)
-- Cites:   DEC-242 §2 (the ten values, and why `node` is lime and `edgeStrong`
--          is muted), DEC-183 (the accepted visual direction), DEC-052 (the
--          platform default IS the identity override), DEC-127 (`canvasRaise`,
--          added last so no binding's position shifted), 0068/0093
--          (`brand_kit()`'s two prior bodies — this is the third, additive per
--          `CLAUDE.md`'s migration rule: same signature, body only),
--          0144 (`save_brand_kit()`'s status-contrast guard, measured below)
--
-- 03 §8.2 ROWS THIS FILE NEEDS (handed to the lead with the file):
--   | `POL-brand_kit.identity_default` | An org with no `brand_kits` row reads back exactly `platformBrand()` — unchanged in shape, new in value. The existing case loops `Object.keys(kit.light)` and needs no edit; it is the gate that proves this migration and `brand.ts` moved together. |
--   | `POL-save_brand_kit.status_contrast_accepted` | The new platform default palette still saves — all six of `0144`'s pairs clear 4.5:1 (the table below). |
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS MIGRATION EXISTS, AND WHY IT IS ONLY HALF THE CHANGE.
--
-- The platform default palette lives in TWO places on purpose: `packages/
-- designer-runtime/src/brand.ts`'s LIGHT/DARK constants (the poster renderer's
-- door, through `export_render_context()`) and this function's `coalesce`
-- literals (the MAIL renderer's door, which has no TypeScript resolver to read
-- the constants — `0068`'s own header says so). `tests/rls/brand-kits.test.ts`
-- compares the two, so they cannot drift silently. ★ THEREFORE THIS FILE IS
-- COMMITTED WITH `brand.ts`, IN ONE COMMIT. Half of it is a failing test.
--
-- ★ NOTHING IS WRITTEN TO ANY ORG. `brand_kits` is untouched: the values below
-- are fallbacks for an org that has NEVER saved a kit, which is what «the
-- platform default is the identity override» (DEC-052) means. An org that HAS
-- overridden its kit reads back its own colours and renders exactly as before
-- — DEC-183 §4.11's rule that no migration writes a colour onto an org stands.
--
-- ★ `BRAND_COLOUR_TOKENS` IS UNCHANGED — ten before, ten after. No token is
-- added, renamed or removed, so DEC-127's add-only ordering still holds and
-- every existing binding keeps its name. What changes is what the ten MEAN by
-- default.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE TWO VALUES THAT NEEDED A JUDGEMENT (DEC-242 §2), WRITTEN HERE SO NOBODY
-- PICKS A SIDE LATER.
--
--  · `node` BECOMES LIME. `node` is the accent of the network vocabulary and
--    lime is the accent of the playground. The design has exactly two accents
--    and the other, coral, is a STATUS colour (DEC-073) — which a brand token
--    must never be, or an org could rebrand «جارية الآن». On a light ground the
--    design's own value is lime-deep («lime on a light ground»). ★ This is the
--    ONE way the accent reaches a template document, because
--    `design_template_versions_guard` (0055) refuses a hex literal and 0094's
--    guard walks every colour — a literal would hand an org that rebrands
--    somebody else's colour, which is DEC-127's reasoning in its own words.
--
--  · `edgeStrong` BECOMES MUTED. `01-tokens.md` has no «strong line» token. A
--    divider at that strength reads as the secondary-text value on both
--    grounds, and both already pass contrast, so `edgeStrong` takes it rather
--    than a colour invented in a migration.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ★★ MEASURED AGAINST 0144'S GUARD BEFORE THIS FILE WAS WRITTEN, which is what
-- 0144's own header asks for («measuring the platform default against the
-- drafted guard before writing it»). `save_brand_kit()` refuses a palette on
-- which a status badge fails AA, and DEC-052/DEC-073 require the platform
-- default to ALWAYS be accepted — so a default that failed its own guard would
-- be the bug, not the guard. All six pairs clear SC 1.4.3's 4.5:1:
--
--   live   (#8a5a1f) on new light canvas  (#f6f3ec)   5.32:1   (was 5.89 on #ffffff)
--   ended  (#5b6780) on new light canvas  (#f6f3ec)   5.13:1   (was 5.68)
--   live   (#8a5a1f) on new light surface (#ffffff)   5.89:1   (unchanged — still white)
--   ended  (#5b6780) on new light surface (#ffffff)   5.68:1   (unchanged)
--   live-on-dark (#d2a86b) on new dark canvas  (#0b0c12)  8.88:1   (was 8.52)
--   live-on-dark (#d2a86b) on new dark surface (#151724)  8.10:1   (was 7.91)
--
-- The light leg gets slightly tighter and the dark leg slightly looser, and
-- every pair keeps better than half a point of margin. ★ The guard itself is
-- NOT relaxed, re-scoped or re-measured against a different threshold.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.brand_kit(p_org uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'orgId', p_org,
    'isOverridden', (bk.org_id is not null),
    -- The design's PAPER ground (01-tokens.md, "Light ground (supported, not
    -- default)"). `fgBody` equals `fgHeading`: the direction has one text
    -- colour per ground and a muted second, not three.
    'light', jsonb_build_object(
      'canvas',      coalesce(bk.light_canvas,       '#f6f3ec'), -- --color-paper
      'surface',     coalesce(bk.light_surface,      '#ffffff'), -- --color-paper-surface
      'fgHeading',   coalesce(bk.light_fg_heading,   '#12131a'), -- --color-paper-ink
      'fgBody',      coalesce(bk.light_fg_body,      '#12131a'), -- --color-paper-ink
      'fgMuted',     coalesce(bk.light_fg_muted,     '#5b5f73'), -- --color-paper-muted
      'edge',        coalesce(bk.light_edge,         '#e4dfd3'), -- --color-paper-line
      'edgeStrong',  coalesce(bk.light_edge_strong,  '#5b5f73'), -- DEC-242 §2
      'spine',       coalesce(bk.light_spine,        '#e4dfd3'), -- --color-paper-line
      'node',        coalesce(bk.light_node,         '#78ad12'), -- --color-lime-deep, DEC-242 §2
      'canvasRaise', coalesce(bk.light_canvas_raise, '#ffffff')  -- a card lifted off paper
    ),
    -- The design's own default ground.
    'dark', jsonb_build_object(
      'canvas',      coalesce(bk.dark_canvas,        '#0b0c12'), -- --color-ink
      'surface',     coalesce(bk.dark_surface,       '#151724'), -- --color-surface
      'fgHeading',   coalesce(bk.dark_fg_heading,    '#f4f1ea'), -- --color-bone
      'fgBody',      coalesce(bk.dark_fg_body,       '#f4f1ea'), -- --color-bone
      'fgMuted',     coalesce(bk.dark_fg_muted,      '#a7abbe'), -- --color-muted
      -- 06 §8.3 / brand.ts: globals.css writes these two as rgba() over the
      -- silver; an email has no page behind it to blend with, so the flattened
      -- value is used here, same as the runtime's own DARK constant.
      'edge',        coalesce(bk.dark_edge,          '#2a2e40'), -- --color-line
      'edgeStrong',  coalesce(bk.dark_edge_strong,   '#a7abbe'), -- DEC-242 §2
      'spine',       coalesce(bk.dark_spine,         '#2a2e40'), -- --color-line
      'node',        coalesce(bk.dark_node,          '#c6ff3d'), -- --color-lime, DEC-242 §2
      'canvasRaise', coalesce(bk.dark_canvas_raise,  '#1e2130')  -- --color-surface-2
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
