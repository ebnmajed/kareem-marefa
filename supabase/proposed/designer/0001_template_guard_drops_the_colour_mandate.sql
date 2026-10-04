-- designer (wave 24, the re-colour) — the template guard stops policing COLOUR
-- and keeps policing STRUCTURE.
--
-- Supersedes the colour half of TWO guards in one `create or replace`:
-- `0055`'s «a colour may not start with `#`» and `0094`'s «every colour must be
-- `{{brand.<token>}}`». What remains is the five structural checks, unchanged
-- and copied verbatim.
--
-- Serves:  REQ-DSG-033, REQ-DSG-005 (the structural checks)
-- Amends:  REQ-DSG-021 — colours are OFFERED as tokens, no longer REQUIRED to be
--          tokens. The owner's ruling, in their words: «remove the whole brand
--          thing and make it optional … let the user do whatever they need».
-- Cites:   DEC-242 as the re-colour amends it; DEC-127 (the mandate's original
--          justification, measured below); DEC-148
--
-- 03 §8.2 ROWS: two policy rows are RETIRED and one is kept.
--
--   | `POL-design_template_versions.guard_non_hex_literal` | ★ RETIRED. A colour that is not a `{{brand.*}}` binding is now ACCEPTED — a hex, `rgb(…)`, a named colour. |
--   | `POL-design_template_versions.guard_gradient_stop_hex` | ★ RETIRED. A gradient stop may carry a literal, on the same reasoning. |
--   | `POL-design_template_versions.guard_structure` | KEPT, unchanged: `schemaVersion` present, `layers` an array, every layer with a unique `id` and a `kind` in the enum. |
--
-- ★★ WHAT THE MANDATE BOUGHT, AND WHAT IT COST — measured, not argued.
--
-- `DEC-127` justified refusing a literal as stopping «an org that rebrands a
-- gradient whose far end is somebody else's colour». Measured against this
-- wave, it did not stop that. What it actually stopped was **the product's own
-- design reaching its own posters**: `01-tokens.md`'s palette has no brand token
-- for tangerine, cyan or violet, so the five baseline families were painted from
-- the ten tokens instead — and three of them (`canvas`, `surface`,
-- `canvasRaise`) resolve within 1.10:1, 1.22:1 and 1.11:1 of one another, which
-- is three identical posters. The architecture was bent around, and then the
-- design was bent to the architecture. That is the honest post-mortem.
--
-- The cost of dropping it, written here so nobody rediscovers it as a bug: a
-- template whose colours are LITERALS is not repainted when an org saves its
-- brand kit. `0071`'s fan-out still repaints every template that binds
-- `brand.*`, which is unchanged — so the behaviour an org gets is the one its
-- own template asked for. That is the admin's choice, and it is the point.
--
-- ★ THE STRUCTURAL CHECKS ARE NOT STYLISTIC and do not move. A document with no
-- `schemaVersion`, a `layers` that is not an array, a layer with no `id`, two
-- layers with one `id` or a `kind` the enum does not have is BROKEN — it fails
-- in the renderer, in the editor, or silently in `derive()`. None of them is a
-- choice an admin could want to make.
--
-- ★ THE COLOUR WALK IS REMOVED ENTIRELY, not relaxed to a wider pattern. A walk
-- that collects every colour and then accepts all of them is dead code that
-- reads like a gate, and the next person to open this file would have to work
-- out that it never refuses. `colourFieldsOf()` remains in the runtime as the
-- one list of where a colour lives — `brandViolations()` and the parity harness
-- both use it — and it is no longer mirrored in SQL, which
-- `tests/unit/designer-library.test.ts` now states rather than asserting a
-- mirror that does not exist.
--
-- ★ EXISTING ROWS ARE UNAFFECTED: `create or replace` does not revalidate stored
-- rows, and this guard accepts a strict superset of what the old one did, so
-- nothing that passed before could fail now.
--
-- ★ `main`'S WORKER IN THE PUSH-BEFORE-MERGE WINDOW: nothing. This widens what an
-- INSERT may carry and changes no row, no signature and no rendered byte.

create or replace function public.design_template_versions_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_layer jsonb;
  v_ids   text[] := '{}';
  v_kinds text[] := enum_range(null::public.layer_kind)::text[];
begin
  -- org_id mirrors the parent, always (0055 header note 3).
  select t.org_id into new.org_id from public.design_templates t where t.id = new.template_id;

  if new.document->>'schemaVersion' is null then
    raise exception 'document_schema_version_missing' using errcode = '22023';
  end if;
  if jsonb_typeof(new.document->'layers') <> 'array' then
    raise exception 'document_layers_missing' using errcode = '22023';
  end if;

  -- ── the layers: structure only. No colour is read, anywhere, on purpose. ──
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
  end loop;

  return new;
end $$;
