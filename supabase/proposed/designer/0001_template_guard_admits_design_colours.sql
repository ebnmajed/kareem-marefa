-- designer (wave 24, the re-colour) — the template guard admits the DESIGN's own
-- colour namespace, and refuses everything it refused before.
--
-- Replaces the body of `public.design_template_versions_guard()` as 0094 left
-- it. ONE line changes: the allowlist's regex gains an alternation.
--
-- Serves:  REQ-DSG-033 (the designed poster families), REQ-DSG-021 (no colour
--          hard-coded in a template — still true, and this is what keeps it
--          true for a colour that is not an org's)
-- Cites:   DEC-242 §2 as the re-colour amends it, DEC-127 (why a literal is
--          refused at all), DEC-148
--
-- 03 §8.2 ROWS: none new. The two policy rows 0094 added keep their names and
-- their meaning — `POL-design_template_versions.guard_non_hex_literal` and
-- `POL-design_template_versions.guard_gradient_stop_hex` — because what is
-- refused has not changed. The accepted set gains one namespace, which is a
-- row of its own:
--
--   | `POL-design_template_versions.guard_design_namespace` | A colour that is a well-formed `{{design.<name>}}` binding is accepted on the background, a gradient stop, a layer `color`, `shape.fill` and `shape.stroke` alike; `{{team.colour}}`, `{{designer.x}}`, `{{design.}}` and `{{design.a.b}}` are still refused (22023). |
--
-- ★★ WHY A SECOND NAMESPACE RATHER THAN BENDING THE DESIGN TO THE TEN TOKENS.
--
-- `brand.*` is an ORG'S colour: a brand kit overrides all ten and
-- `resolveBrand()` merges the override. That is right for «this org's canvas»
-- and wrong for «the tangerine colourway», which is a PLATFORM DESIGN IDENTITY
-- — the thing the library card «لقاء» *is*. An org must never be able to
-- rebrand it. It cannot be a literal either, for exactly the reason 0094 and
-- 0055 refuse one. So it gets its own namespace, defined once in
-- `packages/designer-runtime/src/design-colours.ts`, resolved by the runtime
-- from a constant rather than from any per-org render context — which makes an
-- override impossible by construction rather than merely unimplemented.
--
-- ★ The error this corrects is worth recording, because it was not «the design
-- was not read». DEC-242 §2 ruled the design's grounds out by citing
-- `01-tokens.md`'s team-colour table — a table that table itself labels
-- «proposal; the mapping to companies is the owner's to change» — and did it
-- for cyan and violet, which sit on the PLATFORM cards of
-- `AdminTemplates.dc.html`, where a team colour cannot be, because a platform
-- template is org-independent. The lesson is «check whether the thing you are
-- citing is settled», not «read the design».
--
-- ★★ THE GUARD DOES NOT WEAKEN, and the argument is exhaustive rather than a
-- list of samples. The new pattern is the old pattern with the literal `brand`
-- replaced by `(brand|design)`. For any string S: if S matched the old pattern
-- it still matches, through the `brand` branch; if S did NOT match the old
-- pattern, S can match the new one ONLY through the `design` branch, i.e. only
-- if S has the form `{{` `\s*` `design.` `[A-Za-z]+` `\s*` `}}`. So the set of
-- newly-accepted strings is exactly the well-formed `design` bindings and
-- nothing else. Every one of these is still refused, and
-- `tests/rls/templates-guard.test.ts` asserts them one by one:
--
--   #0B0C12 · #FF9A2E · rgb(255,154,46) · navy · transparent ·
--   var(--color-ink) · {{team.colour}} · {{design}} · {{design.}} ·
--   {{design.tan-gerine}} · {{design.tangerine2}} · {{design.a.b}} ·
--   {{designer.tangerine}} · `{{ design.cyan }} ` (trailing space) ·
--   {{brand.canvas}}{{design.ink}}
--
-- ★ MEMBERSHIP IS STILL NOT THE DATABASE'S JOB, and that is unchanged on
-- purpose (0094's own note, DEC-148's sync-1 ruling): the guard checks the
-- binding's SHAPE, and whether `design.unicorn` names a colour that exists
-- lives in `brandViolations()` beside the list, so there is one copy of it.
-- `{{design.unicorn}}` passes here and renders the caller's fallback, exactly
-- as `{{brand.canvsRaise}}` does today. Same seam, not a new hole.
--
-- ★ The colour FIELDS walked are 0094's, unchanged and copied verbatim — the
-- background's `color`, every gradient `stop.color`, and each layer's `color`,
-- `shape.fill` and `shape.stroke`. `tests/unit/designer-library.test.ts` holds
-- this file to `colourFieldsOf()`'s list, so a colour field added to the model
-- and to neither is a failing test rather than a template nobody can rebrand.
--
-- ★ EXISTING ROWS ARE NOT REVALIDATED, and need not be: `create or replace` of
-- a trigger function does not re-run it over stored rows, and every colour in
-- every row today is a `brand.*` binding, which the new pattern still accepts.
--
-- ★ `main`'S WORKER IN THE PUSH-BEFORE-MERGE WINDOW: nothing. This file only
-- widens what an INSERT may carry; it changes no row, no signature and no
-- rendered byte. A worker on the old code against the new guard behaves
-- identically, and the baseline seed that uses the new namespace is a separate
-- file that is promoted after it.

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
  --
  -- ★ TWO NAMESPACES, ONE SHAPE (wave 24): `brand.*` is the org's kit and
  -- `design.*` the platform's design constants. The alternation is why adding
  -- the third tier the artboard draws — `{{team.*}}` for «لون الفريق», which
  -- DEC-242 §2 deferred to its own wave — is one word here rather than a second
  -- hard-coded prefix.
  for v_i in 1 .. coalesce(array_length(v_colours, 1), 0) loop
    if v_colours[v_i][2] !~ '^\{\{\s*(brand|design)\.[A-Za-z]+\s*\}\}$' then
      raise exception 'hardcoded_colour_in_template: % uses %', v_colours[v_i][1], v_colours[v_i][2]
        using errcode = '22023';
    end if;
  end loop;

  return new;
end $$;
