-- supabase/migrations/0094_template_guard_walks_every_colour.sql — promoted by the lead from
-- supabase/proposed/designer/0001_template_guard_walks_every_colour.sql (wave 8, DEC-127, DEC-148).
--
-- designer (wave 8) — the template guard walks EVERY colour, gradient stops included.
-- Follows 0055 (design_template_versions_guard) and precedes the wave-8 seed.
--
-- Serves:  REQ-DSG-021 (no brand colour hard-coded in a template),
--          REQ-DSG-005 (the structural checks, unchanged), REQ-DSG-026
-- Cites:   DEC-127 (the gradient background), DEC-147 (contract 1),
--          DEC-148 (sync 1 — this file first, token membership stays in TS)
--
-- 03 §8.2 ROWS THIS FILE NEEDS:
--   | `POL-design_template_versions.guard_gradient_stop_hex` | A template version whose gradient background carries a hex literal in ANY stop is refused (22023); the same gradient on `{{brand.*}}` tokens is accepted. |
--   | `POL-design_template_versions.guard_non_hex_literal` | A colour that is not a `{{brand.<token>}}` binding — `rgb(…)`, `navy` — is refused on the background, a stop, a layer `color`, `shape.fill` and `shape.stroke` alike (22023). |
--   | `POL-design_template_versions.guard_structure_kept` | The 0055 checks still hold: a missing schemaVersion, a non-array `layers`, a missing or duplicated layer id and an unknown layer kind are refused (22023). |
--
-- ★ WHAT 0055 MISSED, AND WHY IT MATTERED THE DAY DEC-127 LANDED. The guard
-- read `document #>> '{background,color}'` — which is NULL for a gradient,
-- because a gradient has no `color`, only `stops` — and then `color`,
-- `shape.fill` and `shape.stroke` on each layer. So
-- `{"type":"gradient","stops":[{"color":"#1d2a42"}, …]}` passed, and so did
-- `rgb(29,42,66)` and `navy` on every field, because it only refused a value
-- starting with `#`. An org that rebrands would then get a gradient whose far
-- end is somebody else's navy — exactly the drift REQ-DSG-021 exists to stop,
-- and invisible until someone changes a colour.
--
-- ★ AN ALLOWLIST OF THE BINDING SHAPE, NOT A DENYLIST OF ONE NOTATION. A
-- present colour must be `{{brand.<identifier>}}`. Whether the identifier is a
-- token that EXISTS is checked in TypeScript, beside `BRAND_COLOUR_TOKENS`
-- (`brandViolations()` in `@kareem/designer-runtime`), so the token list has one
-- copy; `tests/unit/designer-library.test.ts` holds the fields walked here to
-- `colourFieldsOf()`, the runtime's list of every colour-bearing field.
--
-- Forward-only and data-safe: the trigger fires on INSERT and UPDATE of a
-- version, so no existing row is re-judged. Every version in the tree
-- descends from 0061's tokens and the editor has no free colour control.

create or replace function public.design_template_versions_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_layer   jsonb;
  v_stop    jsonb;
  v_ids     text[] := '{}';
  v_kinds   text[] := enum_range(null::public.layer_kind)::text[];
  -- (path, value) of every colour the document carries.
  v_colours text[][] := '{}';
  v_i       int;
  v_n       int := 0;
begin
  -- org_id mirrors the parent, always (0055 header note 3).
  select t.org_id into new.org_id from public.design_templates t where t.id = new.template_id;

  if new.document->>'schemaVersion' is null then
    raise exception 'document_schema_version_missing' using errcode = '22023';
  end if;
  if jsonb_typeof(new.document->'layers') <> 'array' then
    raise exception 'document_layers_missing' using errcode = '22023';
  end if;

  -- ── the background: a solid colour, or every stop of a gradient ──────────
  if new.document->'background'->>'color' is not null then
    v_colours := v_colours || array[['background.color', new.document->'background'->>'color']];
  end if;
  if jsonb_typeof(new.document->'background'->'stops') = 'array' then
    for v_stop in select e.value from jsonb_array_elements(new.document->'background'->'stops') as e(value) loop
      if v_stop->>'color' is not null then
        v_colours := v_colours || array[['background.stops[' || v_n || '].color', v_stop->>'color']];
      end if;
      v_n := v_n + 1;
    end loop;
  end if;

  -- ── the layers: structure first, then their colours ─────────────────────
  for v_layer in select e.value from jsonb_array_elements(new.document->'layers') as e(value) loop
    if v_layer->>'id' is null then
      raise exception 'layer_id_missing' using errcode = '22023';
    end if;
    if v_layer->>'id' = any(v_ids) then
      raise exception 'layer_id_duplicated: %', v_layer->>'id' using errcode = '22023';
    end if;
    v_ids := v_ids || (v_layer->>'id');

    if v_layer->>'kind' is null or not (v_layer->>'kind' = any(v_kinds)) then
      raise exception 'layer_kind_invalid: %', coalesce(v_layer->>'kind', 'null') using errcode = '22023';
    end if;

    if v_layer->>'color' is not null then
      v_colours := v_colours || array[['layer ' || (v_layer->>'id') || ' color', v_layer->>'color']];
    end if;
    if v_layer#>>'{shape,fill}' is not null then
      v_colours := v_colours || array[['layer ' || (v_layer->>'id') || ' shape.fill', v_layer#>>'{shape,fill}']];
    end if;
    if v_layer#>>'{shape,stroke}' is not null then
      v_colours := v_colours || array[['layer ' || (v_layer->>'id') || ' shape.stroke', v_layer#>>'{shape,stroke}']];
    end if;
  end loop;

  -- REQ-DSG-021. A literal here — `#0B1220`, `rgb(11,18,32)`, `navy` — is what
  -- makes DEC-008's "one edit in one place" aspirational instead of true, and
  -- it is invisible until an org changes its brand and one template does not
  -- follow. The message keeps 0055's prefix, so a caller matching it still does.
  for v_i in 1 .. coalesce(array_length(v_colours, 1), 0) loop
    if v_colours[v_i][2] !~ '^\{\{\s*brand\.[A-Za-z]+\s*\}\}$' then
      raise exception 'hardcoded_colour_in_template: % uses %', v_colours[v_i][1], v_colours[v_i][2]
        using errcode = '22023';
    end if;
  end loop;

  return new;
end $$;
