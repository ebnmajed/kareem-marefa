-- supabase/migrations/0193_baseline_library_playground.sql — promoted by the lead (wave 24, M26, DEC-242)
-- from supabase/proposed/designer/0006_supersede_baseline.sql and 0005_playground_library.sql,
-- IN THAT ORDER: 0005 calls the function 0006 defines.
--
-- Serves:  REQ-DSG-033, REQ-CRT-016, REQ-DSG-034, REQ-DSG-026 as DEC-242 amends it
-- Cites:   DEC-242 §1 §2 §3 §4 · REQ-CRT-014 · REQ-DSG-008 · 0192 (the palette this binds to)
--
-- ★★ THE OWNER'S PRODUCTION READ, taken at sync 1 and the reason this file can be read with
-- confidence rather than hope: of the eleven platform rows, `certs = 0` on ALL ELEVEN and
-- `docs = 0` on all but `poster/talk`, which has 2. So production expects TEN DELETED and
-- `talk` RETIRED. ★ The function decides at runtime regardless — a certificate can be issued
-- between that read and this push, and local, CI and every future environment differ.
--
-- ★ IT REPORTS. Every row raises a notice naming the family, the outcome and, where the delete
-- was refused, the constraint that refused it. The lead pastes those notices into `STATUS.md`.

-- ═══ PART 1 of 2 — supersede_baseline_template() ═══

-- designer (wave 24, M26) — supersede one baseline template row: delete it where the database
-- permits, retire it where `on delete restrict` refuses, and SAY WHICH.
-- Promoted with 0005 as a single migration; this file comes FIRST in it, because 0005 calls it.
--
-- Serves:  REQ-DSG-034 (the superseded baseline leaves the library),
--          REQ-CRT-014 (a certificate issued against a version still renders as that version),
--          REQ-DSG-008 (the platform library an org duplicates from)
-- Cites:   DEC-242 §3 (the owner chose a hard delete; the schema refuses part of it, deliberately),
--          DEC-043 (no write-then-raise), 0055, 0057, 0063, 0065, 0066, 0096, 0099, 0127
--
-- 03 §8.2 ROWS THIS FILE NEEDS:
--   | `RPC-supersede_baseline_template.deleted` | A platform template nothing references is DELETED, its versions cascading with it, and the function returns `('deleted', null)`. |
--   | `RPC-supersede_baseline_template.retired_by_certificate` | A platform template one of whose versions a CERTIFICATE references is RETIRED, not deleted: the row survives with `retired_at` set and `is_default` cleared, the certificate's `template_version_id` is unchanged, and the function returns `('retired', <the FK's own message>)`. |
--   | `RPC-supersede_baseline_template.retired_by_document` | The same for a version a `design_documents` row references — the automatic poster path. |
--   | `RPC-supersede_baseline_template.retired_by_design` | The same for a template a `session_certificate_designs` row names directly. |
--   | `RPC-supersede_baseline_template.not_callable` | No role may execute it: `public`, `anon`, `authenticated` and `service_role` are all revoked, so it is owner-only and invisible to PostgREST (`definer-exposure`). |
--
-- ★★ WHY THIS CANNOT JUST BE A DELETE, which is the whole point of the file.
-- The owner asked for a hard delete. The schema grants part of it and refuses the rest, and the
-- refusal is correct:
--
--   · `design_template_versions.template_id` → ON DELETE CASCADE (0055:111) — deleting a template
--     takes its versions, which is what makes the two restricts below bite on the PARENT.
--   · `certificates.template_version_id`     → ON DELETE RESTRICT, NOT NULL (0055:288).
--   · `design_documents.template_version_id` → ON DELETE RESTRICT (0055:135).
--   · `session_certificate_designs.template_id` → ON DELETE RESTRICT (0099:63) — a fourth path, on
--     the TEMPLATE rather than a version: an admin who picked this template on SCR-045.
--
-- ★ And a certificate points at the PLATFORM row DIRECTLY. `issue_certificate()` (0127:263-271)
-- resolves «the org's default for this kind, ELSE the platform's» — `t.org_id is null` is in the
-- predicate — and `issue_achievement_certificate()` (0066:84) does the same for `family =
-- 'achievement'`. So wherever an org never authored its own certificate template, every certificate
-- it issued references a platform baseline version, and the delete IS REFUSED BY THE DATABASE.
-- That refusal is REQ-CRT-014 made structural. It is correct and nothing here works around it.
--
-- ★ The poster path is the same shape through a different table: `poster_render_context()`
-- (0063:113-121) resolves the `talk` family — and ONLY `talk` — and `regenerate_poster` then writes
-- a `design_documents` row carrying that version. The owner's production read at wave 24's sync 1
-- bears it out exactly: of the eleven platform rows, `certs = 0` on all eleven and `docs = 0` on
-- all but `poster/talk`, which has 2. So production expects TEN DELETED and `talk` RETIRED.
-- ★ The function is defensive anyway, because a certificate can be issued between that read and the
-- push, and local, CI and every future environment differ. It decides at runtime; it never assumes.
--
-- ★ WHAT IS NOT DONE, however the instruction reads (DEC-242 §3, the lead's brief §3): no `cascade`;
-- no detaching a certificate from its version; no nulling `template_version_id`; no touching
-- `recipient_name_snapshot` or a pinned `font_hashes`; and NO `design_document` is deleted to clear
-- the way. A platform row cannot have a draft document in any case — `createTemplateDraft()` refuses
-- a template whose scope is not `org` (`src/lib/dal/templates.ts`), and `draft_for_template_id` is
-- the only cascading child.
--
-- ★ `is_default` IS CLEARED WITH `retired_at`, matching what the console's own retire does
-- (`src/lib/dal/templates.ts`: `{ retired_at, is_default: false }`) and what 0057's trigger has
-- already done by the time this runs — 0005 inserts the new default first, and
-- `design_templates_single_default` clears the previous one in the same statement. Setting it here
-- too makes the function correct when called alone, which is how its test calls it.
--
-- ★ A SUBTRANSACTION, NOT A PRE-FLIGHT COUNT. `restrict` raises 23503 immediately, so the
-- `exception` block is the only way to learn the answer without racing a concurrent issuance
-- between the count and the delete. The rollback undoes the failed DELETE and nothing else, and
-- DEC-043 is not in play: this function catches, it never writes then raises.
--
-- ★ RETIRING WRITES NO AUDIT ROW, and that is 0191 working as designed: both
-- `design_template_audit()` and `design_template_version_audit()` return early when `org_id is
-- null`, because a platform template's changes are the platform's and not an org's log. Nor does
-- either trigger fire on DELETE.
--
-- Forward-only and idempotent: a row already retired is returned as `already_retired` without a
-- second write, so a re-run of the migration reports nothing new.

create or replace function public.supersede_baseline_template(p_template uuid)
returns table (outcome text, refused_by text)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_row public.design_templates;
begin
  select * into v_row from public.design_templates t where t.id = p_template;
  if v_row.id is null then
    return query select 'absent'::text, null::text;
    return;
  end if;
  -- Platform scope only. An org's own template is its own property (REQ-DSG-008) and is never
  -- superseded by a platform seed, however much its document resembles the baseline's.
  if v_row.scope <> 'platform' then
    raise exception 'not_a_platform_template' using errcode = '42501';
  end if;
  if v_row.retired_at is not null then
    return query select 'already_retired'::text, null::text;
    return;
  end if;

  begin
    delete from public.design_templates where id = p_template;
    return query select 'deleted'::text, null::text;
  exception when foreign_key_violation then
    -- REQ-CRT-014, structurally. Something a member is holding renders from a version of this
    -- template, so the row stays — invisible to the library, to SCR-045's picker and to issuance,
    -- every one of which filters `retired_at is null`.
    update public.design_templates
       set retired_at = now(), is_default = false
     where id = p_template;
    return query select 'retired'::text, sqlerrm;
  end;
end $fn$;

-- Owner-only. No role executes it: it is called by the migration that promotes it, as the owner,
-- and by its own test. A function with no grant is invisible through PostgREST
-- (`tests/rls/definer-exposure.test.ts`).
revoke execute on function public.supersede_baseline_template(uuid) from public, anon, authenticated, service_role;

comment on function public.supersede_baseline_template(uuid) is
  'DEC-242 §3 — supersede one PLATFORM design template: delete it where the database permits, retire it where on-delete-restrict refuses (REQ-CRT-014), and report which. Owner-only.';

-- ═══ PART 2 of 2 — the eleven rebuilt rows, and the eleven superseded ═══

-- designer (wave 24, M26) — the baseline library REBUILT to «ساحة اللعب», and the superseded eleven superseded.
-- Follows 0192 (the platform palette) and supersedes 0061 + 0098's rows.
--
-- Serves:  REQ-DSG-033 (the designed poster families), REQ-CRT-016 (the
--          designed certificate families), REQ-DSG-034 (the superseded
--          baseline leaves the library), REQ-DSG-026 as DEC-242 amends it,
--          REQ-DSG-021 (tokens only), REQ-DSG-024 (locked regions),
--          REQ-CRT-010, REQ-CRT-014 (a pinned version still renders)
-- Cites:   DEC-242 §1 (the thumbnails are the specification), §2 (the palette
--          and the token vocabulary), §3 (delete where permitted, retire where
--          refused), §4; DEC-125 (posters dark), DEC-128, DEC-148
--
-- 03 §8.2 ROWS: see `supersede_baseline_template()`'s own file. This file
-- creates no policy and no grant — it inserts rows into two tables 0055
-- already policied, as the owner during migration.
--
-- GENERATED by packages/designer-runtime/scripts/seed-sql.mjs from
-- packages/designer-runtime/src/library.ts. Do not edit by hand:
-- tests/unit/designer-library.test.ts parses every $json$…$json$ back out and
-- deep-equals it against the library.
--
-- ★★ ELEVEN NEW ROWS, NOT NEW VERSIONS OF THE OLD ONES (REQ-DSG-034). Every
-- document in the library changed, so each composition ships as a new platform
-- template at version 1 and the superseded row is deleted — or RETIRED, where
-- `on delete restrict` refuses, because a certificate issued against a 2026
-- version must render as that version for ever (REQ-CRT-014). The migration
-- reports which went which way, per row.
--
-- ★ THE NEW ROW IS INSERTED BEFORE THE OLD ONE IS SUPERSEDED, and the order is
-- load-bearing: `design_templates_single_default` (0057) clears the previous
-- default in the same statement, so by the time the supersede step runs the old
-- row is already non-default — which means issuance and poster_render_context()
-- prefer the new row even before `retired_at` is set, and there is never a
-- window with no non-retired default of a purpose.
--
-- ★ IDEMPOTENT ON THE LIVE ROW, which is 0061's pattern with one necessary
-- third condition: `retired_at is null`. Without it a re-run finds the RETIRED
-- old row and skips the insert — and the portrait lookup, which asks for «the
-- non-default platform row of this family», would match a retired landscape row.

do $$
declare
  v_template uuid;
  -- The eleven rows this file seeds. Everything else in platform scope is
  -- superseded at the end, which is how the step stays id-free.
  v_kept     uuid[] := '{}';
  v_doc      jsonb;
  v_fields   jsonb;
  v_old      record;
  v_outcome  text;
  v_refused  text;
begin

-- @family talk@v1
v_template := null;
v_doc    := $json${
  "schemaVersion": 1,
  "purpose": "poster",
  "master": {
    "width": 1080,
    "height": 1350,
    "unit": "px",
    "dpi": 72
  },
  "direction": "rtl",
  "background": {
    "type": "solid",
    "color": "{{brand.canvas}}"
  },
  "layers": [
    {
      "id": "l_logo",
      "kind": "image",
      "name": "شعار المؤسسة",
      "image": {
        "binding": "brand.logoAssetId",
        "fit": "contain"
      },
      "frame": {
        "x": 880,
        "y": 80,
        "w": 120,
        "h": 120
      },
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_start",
      "kind": "shape",
      "frame": {
        "x": 80,
        "y": 80,
        "w": 72,
        "h": 72
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      }
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_body",
      "kind": "shape",
      "frame": {
        "x": 116,
        "y": 80,
        "w": 228,
        "h": 72
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.node}}"
      }
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_end",
      "kind": "shape",
      "frame": {
        "x": 308,
        "y": 80,
        "w": 72,
        "h": 72
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      }
    },
    {
      "id": "l_category",
      "kind": "text",
      "name": "التصنيف",
      "frame": {
        "x": 80,
        "y": 80,
        "w": 300,
        "h": 72
      },
      "text": {
        "literal": "جلسة"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 40,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.canvas}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_title",
      "kind": "text",
      "name": "عنوان الجلسة",
      "frame": {
        "x": 80,
        "y": 300,
        "w": 920,
        "h": 430
      },
      "text": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 96,
        "minSize": 56,
        "lineHeight": 1.12,
        "letterSpacing": 0,
        "weight": 800
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 3
      },
      "z": 10
    },
    {
      "id": "l_presenters",
      "kind": "dynamic_field",
      "name": "المقدِّمون",
      "frame": {
        "x": 80,
        "y": 1010,
        "w": 640,
        "h": 130
      },
      "field": {
        "binding": "session.presenters",
        "fallback": "اسم المقدِّم"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 44,
        "minSize": 32,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_when",
      "kind": "dynamic_field",
      "name": "الموعد",
      "frame": {
        "x": 80,
        "y": 1150,
        "w": 640,
        "h": 62
      },
      "field": {
        "binding": "session.startsAt",
        "fallback": "التاريخ والوقت"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 40,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز الجلسة",
      "locked": true,
      "frame": {
        "x": 860,
        "y": 1130,
        "w": 140,
        "h": 140
      },
      "qr": {
        "binding": "session.eventUrl",
        "ecLevel": "M",
        "quietZoneModules": 4
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    }
  ]
}$json$::jsonb;
v_fields := $fields$["brand.logoAssetId","session.title","session.presenters","session.startsAt","session.eventUrl"]$fields$::jsonb;

-- The platform row that already carries this document, if this seed has run before.
select t.id into v_template
  from public.design_templates t
  join public.design_template_versions v on v.template_id = t.id
 where t.scope = 'platform' and t.purpose = 'poster' and t.family = 'talk'
   and t.retired_at is null and v.document = v_doc
 order by t.created_at
 limit 1;

if v_template is null then
  -- RETURNING, never a second lookup: a select by (family, name) would match the
  -- SUPERSEDED row, which still carries this family and this name until the
  -- supersede step runs — and would then insert version 1 on a row that already
  -- has one. That is the duplicate key the roster suite raised.
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'poster', 'talk', 'جلسة', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1, v_doc, v_fields,
    -- No font hash is pinned on a platform version: the platform set is
    -- installed by hash in every image (REQ-DSG-016), as 0061 recorded.
    '{}',
    now()
  );
end if;
v_kept := v_kept || v_template;

-- @family workshop@v1
v_template := null;
v_doc    := $json${
  "schemaVersion": 1,
  "purpose": "poster",
  "master": {
    "width": 1080,
    "height": 1350,
    "unit": "px",
    "dpi": 72
  },
  "direction": "rtl",
  "background": {
    "type": "solid",
    "color": "{{brand.fgHeading}}"
  },
  "layers": [
    {
      "id": "l_logo",
      "kind": "image",
      "name": "شعار المؤسسة",
      "image": {
        "binding": "brand.logoAssetId",
        "fit": "contain"
      },
      "frame": {
        "x": 880,
        "y": 80,
        "w": 120,
        "h": 120
      },
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_start",
      "kind": "shape",
      "frame": {
        "x": 80,
        "y": 80,
        "w": 72,
        "h": 72
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.canvas}}"
      }
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_body",
      "kind": "shape",
      "frame": {
        "x": 116,
        "y": 80,
        "w": 228,
        "h": 72
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.canvas}}"
      }
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_end",
      "kind": "shape",
      "frame": {
        "x": 308,
        "y": 80,
        "w": 72,
        "h": 72
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.canvas}}"
      }
    },
    {
      "id": "l_category",
      "kind": "text",
      "name": "التصنيف",
      "frame": {
        "x": 80,
        "y": 80,
        "w": 300,
        "h": 72
      },
      "text": {
        "literal": "ورشة"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 40,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgHeading}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_title",
      "kind": "text",
      "name": "عنوان الجلسة",
      "frame": {
        "x": 80,
        "y": 300,
        "w": 920,
        "h": 430
      },
      "text": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 96,
        "minSize": 56,
        "lineHeight": 1.12,
        "letterSpacing": 0,
        "weight": 800
      },
      "color": "{{brand.canvas}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 3
      },
      "z": 10
    },
    {
      "id": "l_presenters",
      "kind": "dynamic_field",
      "name": "المقدِّمون",
      "frame": {
        "x": 80,
        "y": 1010,
        "w": 640,
        "h": 130
      },
      "field": {
        "binding": "session.presenters",
        "fallback": "اسم المقدِّم"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 44,
        "minSize": 32,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.canvas}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_when",
      "kind": "dynamic_field",
      "name": "الموعد",
      "frame": {
        "x": 80,
        "y": 1150,
        "w": 640,
        "h": 62
      },
      "field": {
        "binding": "session.startsAt",
        "fallback": "التاريخ والوقت"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 40,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.canvas}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز الجلسة",
      "locked": true,
      "frame": {
        "x": 860,
        "y": 1130,
        "w": 140,
        "h": 140
      },
      "qr": {
        "binding": "session.eventUrl",
        "ecLevel": "M",
        "quietZoneModules": 4
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    }
  ]
}$json$::jsonb;
v_fields := $fields$["brand.logoAssetId","session.title","session.presenters","session.startsAt","session.eventUrl"]$fields$::jsonb;

-- The platform row that already carries this document, if this seed has run before.
select t.id into v_template
  from public.design_templates t
  join public.design_template_versions v on v.template_id = t.id
 where t.scope = 'platform' and t.purpose = 'poster' and t.family = 'workshop'
   and t.retired_at is null and v.document = v_doc
 order by t.created_at
 limit 1;

if v_template is null then
  -- RETURNING, never a second lookup: a select by (family, name) would match the
  -- SUPERSEDED row, which still carries this family and this name until the
  -- supersede step runs — and would then insert version 1 on a row that already
  -- has one. That is the duplicate key the roster suite raised.
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'poster', 'workshop', 'ورشة', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1, v_doc, v_fields,
    -- No font hash is pinned on a platform version: the platform set is
    -- installed by hash in every image (REQ-DSG-016), as 0061 recorded.
    '{}',
    now()
  );
end if;
v_kept := v_kept || v_template;

-- @family panel@v1
v_template := null;
v_doc    := $json${
  "schemaVersion": 1,
  "purpose": "poster",
  "master": {
    "width": 1080,
    "height": 1350,
    "unit": "px",
    "dpi": 72
  },
  "direction": "rtl",
  "background": {
    "type": "solid",
    "color": "{{brand.surface}}"
  },
  "layers": [
    {
      "id": "l_logo",
      "kind": "image",
      "name": "شعار المؤسسة",
      "image": {
        "binding": "brand.logoAssetId",
        "fit": "contain"
      },
      "frame": {
        "x": 880,
        "y": 80,
        "w": 120,
        "h": 120
      },
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_start",
      "kind": "shape",
      "frame": {
        "x": 80,
        "y": 80,
        "w": 72,
        "h": 72
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      }
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_body",
      "kind": "shape",
      "frame": {
        "x": 116,
        "y": 80,
        "w": 228,
        "h": 72
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.node}}"
      }
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_end",
      "kind": "shape",
      "frame": {
        "x": 308,
        "y": 80,
        "w": 72,
        "h": 72
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      }
    },
    {
      "id": "l_category",
      "kind": "text",
      "name": "التصنيف",
      "frame": {
        "x": 80,
        "y": 80,
        "w": 300,
        "h": 72
      },
      "text": {
        "literal": "حوار"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 40,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.canvas}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_title",
      "kind": "text",
      "name": "عنوان الجلسة",
      "frame": {
        "x": 80,
        "y": 300,
        "w": 920,
        "h": 430
      },
      "text": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 96,
        "minSize": 56,
        "lineHeight": 1.12,
        "letterSpacing": 0,
        "weight": 800
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 3
      },
      "z": 10
    },
    {
      "id": "l_presenters",
      "kind": "dynamic_field",
      "name": "المقدِّمون",
      "frame": {
        "x": 80,
        "y": 1010,
        "w": 640,
        "h": 130
      },
      "field": {
        "binding": "session.presenters",
        "fallback": "اسم المقدِّم"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 44,
        "minSize": 32,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_when",
      "kind": "dynamic_field",
      "name": "الموعد",
      "frame": {
        "x": 80,
        "y": 1150,
        "w": 640,
        "h": 62
      },
      "field": {
        "binding": "session.startsAt",
        "fallback": "التاريخ والوقت"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 40,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز الجلسة",
      "locked": true,
      "frame": {
        "x": 860,
        "y": 1130,
        "w": 140,
        "h": 140
      },
      "qr": {
        "binding": "session.eventUrl",
        "ecLevel": "M",
        "quietZoneModules": 4
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    }
  ]
}$json$::jsonb;
v_fields := $fields$["brand.logoAssetId","session.title","session.presenters","session.startsAt","session.eventUrl"]$fields$::jsonb;

-- The platform row that already carries this document, if this seed has run before.
select t.id into v_template
  from public.design_templates t
  join public.design_template_versions v on v.template_id = t.id
 where t.scope = 'platform' and t.purpose = 'poster' and t.family = 'panel'
   and t.retired_at is null and v.document = v_doc
 order by t.created_at
 limit 1;

if v_template is null then
  -- RETURNING, never a second lookup: a select by (family, name) would match the
  -- SUPERSEDED row, which still carries this family and this name until the
  -- supersede step runs — and would then insert version 1 on a row that already
  -- has one. That is the duplicate key the roster suite raised.
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'poster', 'panel', 'حوار', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1, v_doc, v_fields,
    -- No font hash is pinned on a platform version: the platform set is
    -- installed by hash in every image (REQ-DSG-016), as 0061 recorded.
    '{}',
    now()
  );
end if;
v_kept := v_kept || v_template;

-- @family meetup@v1
v_template := null;
v_doc    := $json${
  "schemaVersion": 1,
  "purpose": "poster",
  "master": {
    "width": 1080,
    "height": 1350,
    "unit": "px",
    "dpi": 72
  },
  "direction": "rtl",
  "background": {
    "type": "solid",
    "color": "{{brand.canvasRaise}}"
  },
  "layers": [
    {
      "id": "l_logo",
      "kind": "image",
      "name": "شعار المؤسسة",
      "image": {
        "binding": "brand.logoAssetId",
        "fit": "contain"
      },
      "frame": {
        "x": 880,
        "y": 80,
        "w": 120,
        "h": 120
      },
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_start",
      "kind": "shape",
      "frame": {
        "x": 80,
        "y": 80,
        "w": 72,
        "h": 72
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      }
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_body",
      "kind": "shape",
      "frame": {
        "x": 116,
        "y": 80,
        "w": 228,
        "h": 72
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.node}}"
      }
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_end",
      "kind": "shape",
      "frame": {
        "x": 308,
        "y": 80,
        "w": 72,
        "h": 72
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      }
    },
    {
      "id": "l_category",
      "kind": "text",
      "name": "التصنيف",
      "frame": {
        "x": 80,
        "y": 80,
        "w": 300,
        "h": 72
      },
      "text": {
        "literal": "لقاء"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 40,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.canvas}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_title",
      "kind": "text",
      "name": "عنوان الجلسة",
      "frame": {
        "x": 80,
        "y": 300,
        "w": 920,
        "h": 430
      },
      "text": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 96,
        "minSize": 56,
        "lineHeight": 1.12,
        "letterSpacing": 0,
        "weight": 800
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 3
      },
      "z": 10
    },
    {
      "id": "l_presenters",
      "kind": "dynamic_field",
      "name": "المقدِّمون",
      "frame": {
        "x": 80,
        "y": 1010,
        "w": 640,
        "h": 130
      },
      "field": {
        "binding": "session.presenters",
        "fallback": "اسم المقدِّم"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 44,
        "minSize": 32,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_when",
      "kind": "dynamic_field",
      "name": "الموعد",
      "frame": {
        "x": 80,
        "y": 1150,
        "w": 640,
        "h": 62
      },
      "field": {
        "binding": "session.startsAt",
        "fallback": "التاريخ والوقت"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 40,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز الجلسة",
      "locked": true,
      "frame": {
        "x": 860,
        "y": 1130,
        "w": 140,
        "h": 140
      },
      "qr": {
        "binding": "session.eventUrl",
        "ecLevel": "M",
        "quietZoneModules": 4
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    }
  ]
}$json$::jsonb;
v_fields := $fields$["brand.logoAssetId","session.title","session.presenters","session.startsAt","session.eventUrl"]$fields$::jsonb;

-- The platform row that already carries this document, if this seed has run before.
select t.id into v_template
  from public.design_templates t
  join public.design_template_versions v on v.template_id = t.id
 where t.scope = 'platform' and t.purpose = 'poster' and t.family = 'meetup'
   and t.retired_at is null and v.document = v_doc
 order by t.created_at
 limit 1;

if v_template is null then
  -- RETURNING, never a second lookup: a select by (family, name) would match the
  -- SUPERSEDED row, which still carries this family and this name until the
  -- supersede step runs — and would then insert version 1 on a row that already
  -- has one. That is the duplicate key the roster suite raised.
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'poster', 'meetup', 'لقاء', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1, v_doc, v_fields,
    -- No font hash is pinned on a platform version: the platform set is
    -- installed by hash in every image (REQ-DSG-016), as 0061 recorded.
    '{}',
    now()
  );
end if;
v_kept := v_kept || v_template;

-- @family announcement@v1
v_template := null;
v_doc    := $json${
  "schemaVersion": 1,
  "purpose": "poster",
  "master": {
    "width": 1080,
    "height": 1350,
    "unit": "px",
    "dpi": 72
  },
  "direction": "rtl",
  "background": {
    "type": "solid",
    "color": "{{brand.node}}"
  },
  "layers": [
    {
      "id": "l_logo",
      "kind": "image",
      "name": "شعار المؤسسة",
      "image": {
        "binding": "brand.logoAssetId",
        "fit": "contain"
      },
      "frame": {
        "x": 880,
        "y": 80,
        "w": 120,
        "h": 120
      },
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_start",
      "kind": "shape",
      "frame": {
        "x": 80,
        "y": 80,
        "w": 72,
        "h": 72
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.canvas}}"
      }
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_body",
      "kind": "shape",
      "frame": {
        "x": 116,
        "y": 80,
        "w": 228,
        "h": 72
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.canvas}}"
      }
    },
    {
      "name": "خلفية التصنيف",
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 2,
      "id": "l_pill_end",
      "kind": "shape",
      "frame": {
        "x": 308,
        "y": 80,
        "w": 72,
        "h": 72
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.canvas}}"
      }
    },
    {
      "id": "l_category",
      "kind": "text",
      "name": "التصنيف",
      "frame": {
        "x": 80,
        "y": 80,
        "w": 300,
        "h": 72
      },
      "text": {
        "literal": "إعلان"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 40,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.node}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_title",
      "kind": "text",
      "name": "عنوان الجلسة",
      "frame": {
        "x": 80,
        "y": 300,
        "w": 920,
        "h": 430
      },
      "text": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 96,
        "minSize": 56,
        "lineHeight": 1.12,
        "letterSpacing": 0,
        "weight": 800
      },
      "color": "{{brand.canvas}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 3
      },
      "z": 10
    },
    {
      "id": "l_presenters",
      "kind": "dynamic_field",
      "name": "المقدِّمون",
      "frame": {
        "x": 80,
        "y": 1010,
        "w": 640,
        "h": 130
      },
      "field": {
        "binding": "session.presenters",
        "fallback": "اسم المقدِّم"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 44,
        "minSize": 32,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.canvas}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_when",
      "kind": "dynamic_field",
      "name": "الموعد",
      "frame": {
        "x": 80,
        "y": 1150,
        "w": 640,
        "h": 62
      },
      "field": {
        "binding": "session.startsAt",
        "fallback": "التاريخ والوقت"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 40,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.canvas}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز الجلسة",
      "locked": true,
      "frame": {
        "x": 860,
        "y": 1130,
        "w": 140,
        "h": 140
      },
      "qr": {
        "binding": "session.eventUrl",
        "ecLevel": "M",
        "quietZoneModules": 4
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    }
  ]
}$json$::jsonb;
v_fields := $fields$["brand.logoAssetId","session.title","session.presenters","session.startsAt","session.eventUrl"]$fields$::jsonb;

-- The platform row that already carries this document, if this seed has run before.
select t.id into v_template
  from public.design_templates t
  join public.design_template_versions v on v.template_id = t.id
 where t.scope = 'platform' and t.purpose = 'poster' and t.family = 'announcement'
   and t.retired_at is null and v.document = v_doc
 order by t.created_at
 limit 1;

if v_template is null then
  -- RETURNING, never a second lookup: a select by (family, name) would match the
  -- SUPERSEDED row, which still carries this family and this name until the
  -- supersede step runs — and would then insert version 1 on a row that already
  -- has one. That is the duplicate key the roster suite raised.
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'poster', 'announcement', 'إعلان', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1, v_doc, v_fields,
    -- No font hash is pinned on a platform version: the platform set is
    -- installed by hash in every image (REQ-DSG-016), as 0061 recorded.
    '{}',
    now()
  );
end if;
v_kept := v_kept || v_template;

-- @family attendance@landscape@v1
v_template := null;
v_doc    := $json${
  "schemaVersion": 1,
  "purpose": "certificate",
  "master": {
    "width": 3508,
    "height": 2480,
    "unit": "px",
    "dpi": 300
  },
  "direction": "rtl",
  "background": {
    "type": "solid",
    "color": "{{brand.canvas}}"
  },
  "layers": [
    {
      "id": "l_logo",
      "kind": "image",
      "name": "شعار المؤسسة",
      "image": {
        "binding": "brand.logoAssetId",
        "fit": "contain"
      },
      "frame": {
        "x": 3048,
        "y": 240,
        "w": 220,
        "h": 220
      },
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_org",
      "kind": "dynamic_field",
      "name": "اسم المؤسسة",
      "frame": {
        "x": 240,
        "y": 240,
        "w": 2200,
        "h": 170
      },
      "field": {
        "binding": "org.name",
        "fallback": "اسم المؤسسة"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 120,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_kind",
      "kind": "text",
      "name": "نوع الشهادة",
      "frame": {
        "x": 240,
        "y": 430,
        "w": 2200,
        "h": 120
      },
      "text": {
        "literal": "شهادة حضور"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 84,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_recipient",
      "kind": "dynamic_field",
      "name": "اسم المستفيد",
      "frame": {
        "x": 240,
        "y": 640,
        "w": 3028,
        "h": 850
      },
      "field": {
        "binding": "recipient.name",
        "fallback": "اسم المستفيد"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 300,
        "minSize": 150,
        "lineHeight": 1.12,
        "letterSpacing": 0,
        "weight": 800
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "z": 10
    },
    {
      "id": "l_reason",
      "kind": "dynamic_field",
      "name": "عن الجلسة",
      "frame": {
        "x": 240,
        "y": 1540,
        "w": 3028,
        "h": 260
      },
      "field": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 72,
        "minSize": 48,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgBody}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "z": 10
    },
    {
      "id": "l_issued",
      "kind": "dynamic_field",
      "name": "تاريخ الإصدار",
      "frame": {
        "x": 240,
        "y": 1840,
        "w": 1400,
        "h": 100
      },
      "field": {
        "binding": "certificate.issuedAt",
        "fallback": "تاريخ الإصدار"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز التحقّق",
      "locked": true,
      "frame": {
        "x": 2948,
        "y": 1920,
        "w": 320,
        "h": 320
      },
      "qr": {
        "binding": "certificate.verifyUrl",
        "ecLevel": "Q",
        "quietZoneModules": 4
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_serial",
      "kind": "dynamic_field",
      "name": "الرقم التسلسلي",
      "locked": true,
      "frame": {
        "x": 240,
        "y": 2020,
        "w": 1400,
        "h": 100
      },
      "field": {
        "binding": "certificate.serial",
        "fallback": "الرقم التسلسلي"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_code",
      "kind": "dynamic_field",
      "name": "رمز التحقّق النصّي",
      "locked": true,
      "frame": {
        "x": 240,
        "y": 2130,
        "w": 1400,
        "h": 100
      },
      "field": {
        "binding": "certificate.verificationCode",
        "fallback": "رمز التحقّق"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_signature",
      "kind": "shape",
      "name": "موضع التوقيع",
      "locked": true,
      "frame": {
        "x": 1900,
        "y": 2120,
        "w": 800,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.edge}}"
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    }
  ]
}$json$::jsonb;
v_fields := $fields$["brand.logoAssetId","org.name","recipient.name","session.title","certificate.issuedAt","certificate.verifyUrl","certificate.serial","certificate.verificationCode"]$fields$::jsonb;

-- The platform row that already carries this document, if this seed has run before.
select t.id into v_template
  from public.design_templates t
  join public.design_template_versions v on v.template_id = t.id
 where t.scope = 'platform' and t.purpose = 'certificate' and t.family = 'attendance'
   and t.retired_at is null and v.document = v_doc
 order by t.created_at
 limit 1;

if v_template is null then
  -- RETURNING, never a second lookup: a select by (family, name) would match the
  -- SUPERSEDED row, which still carries this family and this name until the
  -- supersede step runs — and would then insert version 1 on a row that already
  -- has one. That is the duplicate key the roster suite raised.
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'certificate', 'attendance', 'شهادة حضور أفقية', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1, v_doc, v_fields,
    -- No font hash is pinned on a platform version: the platform set is
    -- installed by hash in every image (REQ-DSG-016), as 0061 recorded.
    '{}',
    now()
  );
end if;
v_kept := v_kept || v_template;

-- @family attendance@portrait@v1
v_template := null;
v_doc    := $json${
  "schemaVersion": 1,
  "purpose": "certificate",
  "master": {
    "width": 2480,
    "height": 3508,
    "unit": "px",
    "dpi": 300
  },
  "direction": "rtl",
  "background": {
    "type": "solid",
    "color": "{{brand.canvas}}"
  },
  "layers": [
    {
      "id": "l_logo",
      "kind": "image",
      "name": "شعار المؤسسة",
      "image": {
        "binding": "brand.logoAssetId",
        "fit": "contain"
      },
      "frame": {
        "x": 2020,
        "y": 240,
        "w": 220,
        "h": 220
      },
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_org",
      "kind": "dynamic_field",
      "name": "اسم المؤسسة",
      "frame": {
        "x": 240,
        "y": 240,
        "w": 1700,
        "h": 170
      },
      "field": {
        "binding": "org.name",
        "fallback": "اسم المؤسسة"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 120,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_kind",
      "kind": "text",
      "name": "نوع الشهادة",
      "frame": {
        "x": 240,
        "y": 430,
        "w": 1700,
        "h": 120
      },
      "text": {
        "literal": "شهادة حضور"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 84,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_recipient",
      "kind": "dynamic_field",
      "name": "اسم المستفيد",
      "frame": {
        "x": 240,
        "y": 700,
        "w": 2000,
        "h": 1000
      },
      "field": {
        "binding": "recipient.name",
        "fallback": "اسم المستفيد"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 300,
        "minSize": 150,
        "lineHeight": 1.12,
        "letterSpacing": 0,
        "weight": 800
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "z": 10
    },
    {
      "id": "l_reason",
      "kind": "dynamic_field",
      "name": "عن الجلسة",
      "frame": {
        "x": 240,
        "y": 1780,
        "w": 2000,
        "h": 260
      },
      "field": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 72,
        "minSize": 48,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgBody}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "z": 10
    },
    {
      "id": "l_issued",
      "kind": "dynamic_field",
      "name": "تاريخ الإصدار",
      "frame": {
        "x": 240,
        "y": 2100,
        "w": 1300,
        "h": 100
      },
      "field": {
        "binding": "certificate.issuedAt",
        "fallback": "تاريخ الإصدار"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز التحقّق",
      "locked": true,
      "frame": {
        "x": 1920,
        "y": 2948,
        "w": 320,
        "h": 320
      },
      "qr": {
        "binding": "certificate.verifyUrl",
        "ecLevel": "Q",
        "quietZoneModules": 4
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_serial",
      "kind": "dynamic_field",
      "name": "الرقم التسلسلي",
      "locked": true,
      "frame": {
        "x": 240,
        "y": 2980,
        "w": 1300,
        "h": 100
      },
      "field": {
        "binding": "certificate.serial",
        "fallback": "الرقم التسلسلي"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_code",
      "kind": "dynamic_field",
      "name": "رمز التحقّق النصّي",
      "locked": true,
      "frame": {
        "x": 240,
        "y": 3090,
        "w": 1300,
        "h": 100
      },
      "field": {
        "binding": "certificate.verificationCode",
        "fallback": "رمز التحقّق"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_signature",
      "kind": "shape",
      "name": "موضع التوقيع",
      "locked": true,
      "frame": {
        "x": 1440,
        "y": 2900,
        "w": 800,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.edge}}"
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    }
  ]
}$json$::jsonb;
v_fields := $fields$["brand.logoAssetId","org.name","recipient.name","session.title","certificate.issuedAt","certificate.verifyUrl","certificate.serial","certificate.verificationCode"]$fields$::jsonb;

-- The platform row that already carries this document, if this seed has run before.
select t.id into v_template
  from public.design_templates t
  join public.design_template_versions v on v.template_id = t.id
 where t.scope = 'platform' and t.purpose = 'certificate' and t.family = 'attendance'
   and t.retired_at is null and v.document = v_doc
 order by t.created_at
 limit 1;

if v_template is null then
  -- RETURNING, never a second lookup: a select by (family, name) would match the
  -- SUPERSEDED row, which still carries this family and this name until the
  -- supersede step runs — and would then insert version 1 on a row that already
  -- has one. That is the duplicate key the roster suite raised.
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'certificate', 'attendance', 'شهادة حضور عمودية', false)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1, v_doc, v_fields,
    -- No font hash is pinned on a platform version: the platform set is
    -- installed by hash in every image (REQ-DSG-016), as 0061 recorded.
    '{}',
    now()
  );
end if;
v_kept := v_kept || v_template;

-- @family presenter@landscape@v1
v_template := null;
v_doc    := $json${
  "schemaVersion": 1,
  "purpose": "certificate",
  "master": {
    "width": 3508,
    "height": 2480,
    "unit": "px",
    "dpi": 300
  },
  "direction": "rtl",
  "background": {
    "type": "solid",
    "color": "{{brand.canvas}}"
  },
  "layers": [
    {
      "id": "l_logo",
      "kind": "image",
      "name": "شعار المؤسسة",
      "image": {
        "binding": "brand.logoAssetId",
        "fit": "contain"
      },
      "frame": {
        "x": 3048,
        "y": 240,
        "w": 220,
        "h": 220
      },
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_org",
      "kind": "dynamic_field",
      "name": "اسم المؤسسة",
      "frame": {
        "x": 240,
        "y": 240,
        "w": 2200,
        "h": 170
      },
      "field": {
        "binding": "org.name",
        "fallback": "اسم المؤسسة"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 120,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_kind",
      "kind": "text",
      "name": "نوع الشهادة",
      "frame": {
        "x": 240,
        "y": 430,
        "w": 2200,
        "h": 120
      },
      "text": {
        "literal": "شهادة تقديم"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 84,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_recipient",
      "kind": "dynamic_field",
      "name": "اسم المستفيد",
      "frame": {
        "x": 240,
        "y": 640,
        "w": 3028,
        "h": 850
      },
      "field": {
        "binding": "recipient.name",
        "fallback": "اسم المستفيد"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 300,
        "minSize": 150,
        "lineHeight": 1.12,
        "letterSpacing": 0,
        "weight": 800
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "z": 10
    },
    {
      "id": "l_reason",
      "kind": "dynamic_field",
      "name": "عن الجلسة",
      "frame": {
        "x": 240,
        "y": 1540,
        "w": 3028,
        "h": 260
      },
      "field": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 72,
        "minSize": 48,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgBody}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "z": 10
    },
    {
      "id": "l_issued",
      "kind": "dynamic_field",
      "name": "تاريخ الإصدار",
      "frame": {
        "x": 240,
        "y": 1840,
        "w": 1400,
        "h": 100
      },
      "field": {
        "binding": "certificate.issuedAt",
        "fallback": "تاريخ الإصدار"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز التحقّق",
      "locked": true,
      "frame": {
        "x": 2948,
        "y": 1920,
        "w": 320,
        "h": 320
      },
      "qr": {
        "binding": "certificate.verifyUrl",
        "ecLevel": "Q",
        "quietZoneModules": 4
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_serial",
      "kind": "dynamic_field",
      "name": "الرقم التسلسلي",
      "locked": true,
      "frame": {
        "x": 240,
        "y": 2020,
        "w": 1400,
        "h": 100
      },
      "field": {
        "binding": "certificate.serial",
        "fallback": "الرقم التسلسلي"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_code",
      "kind": "dynamic_field",
      "name": "رمز التحقّق النصّي",
      "locked": true,
      "frame": {
        "x": 240,
        "y": 2130,
        "w": 1400,
        "h": 100
      },
      "field": {
        "binding": "certificate.verificationCode",
        "fallback": "رمز التحقّق"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_signature",
      "kind": "shape",
      "name": "موضع التوقيع",
      "locked": true,
      "frame": {
        "x": 1900,
        "y": 2120,
        "w": 800,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.edge}}"
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    }
  ]
}$json$::jsonb;
v_fields := $fields$["brand.logoAssetId","org.name","recipient.name","session.title","certificate.issuedAt","certificate.verifyUrl","certificate.serial","certificate.verificationCode"]$fields$::jsonb;

-- The platform row that already carries this document, if this seed has run before.
select t.id into v_template
  from public.design_templates t
  join public.design_template_versions v on v.template_id = t.id
 where t.scope = 'platform' and t.purpose = 'certificate' and t.family = 'presenter'
   and t.retired_at is null and v.document = v_doc
 order by t.created_at
 limit 1;

if v_template is null then
  -- RETURNING, never a second lookup: a select by (family, name) would match the
  -- SUPERSEDED row, which still carries this family and this name until the
  -- supersede step runs — and would then insert version 1 on a row that already
  -- has one. That is the duplicate key the roster suite raised.
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'certificate', 'presenter', 'شهادة تقديم أفقية', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1, v_doc, v_fields,
    -- No font hash is pinned on a platform version: the platform set is
    -- installed by hash in every image (REQ-DSG-016), as 0061 recorded.
    '{}',
    now()
  );
end if;
v_kept := v_kept || v_template;

-- @family presenter@portrait@v1
v_template := null;
v_doc    := $json${
  "schemaVersion": 1,
  "purpose": "certificate",
  "master": {
    "width": 2480,
    "height": 3508,
    "unit": "px",
    "dpi": 300
  },
  "direction": "rtl",
  "background": {
    "type": "solid",
    "color": "{{brand.canvas}}"
  },
  "layers": [
    {
      "id": "l_logo",
      "kind": "image",
      "name": "شعار المؤسسة",
      "image": {
        "binding": "brand.logoAssetId",
        "fit": "contain"
      },
      "frame": {
        "x": 2020,
        "y": 240,
        "w": 220,
        "h": 220
      },
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_org",
      "kind": "dynamic_field",
      "name": "اسم المؤسسة",
      "frame": {
        "x": 240,
        "y": 240,
        "w": 1700,
        "h": 170
      },
      "field": {
        "binding": "org.name",
        "fallback": "اسم المؤسسة"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 120,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_kind",
      "kind": "text",
      "name": "نوع الشهادة",
      "frame": {
        "x": 240,
        "y": 430,
        "w": 1700,
        "h": 120
      },
      "text": {
        "literal": "شهادة تقديم"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 84,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_recipient",
      "kind": "dynamic_field",
      "name": "اسم المستفيد",
      "frame": {
        "x": 240,
        "y": 700,
        "w": 2000,
        "h": 1000
      },
      "field": {
        "binding": "recipient.name",
        "fallback": "اسم المستفيد"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 300,
        "minSize": 150,
        "lineHeight": 1.12,
        "letterSpacing": 0,
        "weight": 800
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "z": 10
    },
    {
      "id": "l_reason",
      "kind": "dynamic_field",
      "name": "عن الجلسة",
      "frame": {
        "x": 240,
        "y": 1780,
        "w": 2000,
        "h": 260
      },
      "field": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 72,
        "minSize": 48,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgBody}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "z": 10
    },
    {
      "id": "l_issued",
      "kind": "dynamic_field",
      "name": "تاريخ الإصدار",
      "frame": {
        "x": 240,
        "y": 2100,
        "w": 1300,
        "h": 100
      },
      "field": {
        "binding": "certificate.issuedAt",
        "fallback": "تاريخ الإصدار"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز التحقّق",
      "locked": true,
      "frame": {
        "x": 1920,
        "y": 2948,
        "w": 320,
        "h": 320
      },
      "qr": {
        "binding": "certificate.verifyUrl",
        "ecLevel": "Q",
        "quietZoneModules": 4
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_serial",
      "kind": "dynamic_field",
      "name": "الرقم التسلسلي",
      "locked": true,
      "frame": {
        "x": 240,
        "y": 2980,
        "w": 1300,
        "h": 100
      },
      "field": {
        "binding": "certificate.serial",
        "fallback": "الرقم التسلسلي"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_code",
      "kind": "dynamic_field",
      "name": "رمز التحقّق النصّي",
      "locked": true,
      "frame": {
        "x": 240,
        "y": 3090,
        "w": 1300,
        "h": 100
      },
      "field": {
        "binding": "certificate.verificationCode",
        "fallback": "رمز التحقّق"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_signature",
      "kind": "shape",
      "name": "موضع التوقيع",
      "locked": true,
      "frame": {
        "x": 1440,
        "y": 2900,
        "w": 800,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.edge}}"
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    }
  ]
}$json$::jsonb;
v_fields := $fields$["brand.logoAssetId","org.name","recipient.name","session.title","certificate.issuedAt","certificate.verifyUrl","certificate.serial","certificate.verificationCode"]$fields$::jsonb;

-- The platform row that already carries this document, if this seed has run before.
select t.id into v_template
  from public.design_templates t
  join public.design_template_versions v on v.template_id = t.id
 where t.scope = 'platform' and t.purpose = 'certificate' and t.family = 'presenter'
   and t.retired_at is null and v.document = v_doc
 order by t.created_at
 limit 1;

if v_template is null then
  -- RETURNING, never a second lookup: a select by (family, name) would match the
  -- SUPERSEDED row, which still carries this family and this name until the
  -- supersede step runs — and would then insert version 1 on a row that already
  -- has one. That is the duplicate key the roster suite raised.
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'certificate', 'presenter', 'شهادة تقديم عمودية', false)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1, v_doc, v_fields,
    -- No font hash is pinned on a platform version: the platform set is
    -- installed by hash in every image (REQ-DSG-016), as 0061 recorded.
    '{}',
    now()
  );
end if;
v_kept := v_kept || v_template;

-- @family achievement@landscape@v1
v_template := null;
v_doc    := $json${
  "schemaVersion": 1,
  "purpose": "certificate",
  "master": {
    "width": 3508,
    "height": 2480,
    "unit": "px",
    "dpi": 300
  },
  "direction": "rtl",
  "background": {
    "type": "solid",
    "color": "{{brand.canvas}}"
  },
  "layers": [
    {
      "id": "l_logo",
      "kind": "image",
      "name": "شعار المؤسسة",
      "image": {
        "binding": "brand.logoAssetId",
        "fit": "contain"
      },
      "frame": {
        "x": 3048,
        "y": 240,
        "w": 220,
        "h": 220
      },
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_org",
      "kind": "dynamic_field",
      "name": "اسم المؤسسة",
      "frame": {
        "x": 240,
        "y": 240,
        "w": 2200,
        "h": 170
      },
      "field": {
        "binding": "org.name",
        "fallback": "اسم المؤسسة"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 120,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_kind",
      "kind": "text",
      "name": "نوع الشهادة",
      "frame": {
        "x": 240,
        "y": 430,
        "w": 2200,
        "h": 120
      },
      "text": {
        "literal": "شهادة إنجاز"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 84,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_recipient",
      "kind": "dynamic_field",
      "name": "اسم المستفيد",
      "frame": {
        "x": 240,
        "y": 640,
        "w": 3028,
        "h": 850
      },
      "field": {
        "binding": "recipient.name",
        "fallback": "اسم المستفيد"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 300,
        "minSize": 150,
        "lineHeight": 1.12,
        "letterSpacing": 0,
        "weight": 800
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "z": 10
    },
    {
      "id": "l_reason",
      "kind": "dynamic_field",
      "name": "عن الجلسة",
      "frame": {
        "x": 240,
        "y": 1540,
        "w": 3028,
        "h": 260
      },
      "field": {
        "binding": "certificate.achievementName",
        "fallback": "اسم الإنجاز"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 72,
        "minSize": 48,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgBody}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "z": 10
    },
    {
      "id": "l_issued",
      "kind": "dynamic_field",
      "name": "تاريخ الإصدار",
      "frame": {
        "x": 240,
        "y": 1840,
        "w": 1400,
        "h": 100
      },
      "field": {
        "binding": "certificate.issuedAt",
        "fallback": "تاريخ الإصدار"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز التحقّق",
      "locked": true,
      "frame": {
        "x": 2948,
        "y": 1920,
        "w": 320,
        "h": 320
      },
      "qr": {
        "binding": "certificate.verifyUrl",
        "ecLevel": "Q",
        "quietZoneModules": 4
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_serial",
      "kind": "dynamic_field",
      "name": "الرقم التسلسلي",
      "locked": true,
      "frame": {
        "x": 240,
        "y": 2020,
        "w": 1400,
        "h": 100
      },
      "field": {
        "binding": "certificate.serial",
        "fallback": "الرقم التسلسلي"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_code",
      "kind": "dynamic_field",
      "name": "رمز التحقّق النصّي",
      "locked": true,
      "frame": {
        "x": 240,
        "y": 2130,
        "w": 1400,
        "h": 100
      },
      "field": {
        "binding": "certificate.verificationCode",
        "fallback": "رمز التحقّق"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_signature",
      "kind": "shape",
      "name": "موضع التوقيع",
      "locked": true,
      "frame": {
        "x": 1900,
        "y": 2120,
        "w": 800,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.edge}}"
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    }
  ]
}$json$::jsonb;
v_fields := $fields$["brand.logoAssetId","org.name","recipient.name","certificate.achievementName","certificate.issuedAt","certificate.verifyUrl","certificate.serial","certificate.verificationCode"]$fields$::jsonb;

-- The platform row that already carries this document, if this seed has run before.
select t.id into v_template
  from public.design_templates t
  join public.design_template_versions v on v.template_id = t.id
 where t.scope = 'platform' and t.purpose = 'certificate' and t.family = 'achievement'
   and t.retired_at is null and v.document = v_doc
 order by t.created_at
 limit 1;

if v_template is null then
  -- RETURNING, never a second lookup: a select by (family, name) would match the
  -- SUPERSEDED row, which still carries this family and this name until the
  -- supersede step runs — and would then insert version 1 on a row that already
  -- has one. That is the duplicate key the roster suite raised.
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'certificate', 'achievement', 'شهادة إنجاز أفقية', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1, v_doc, v_fields,
    -- No font hash is pinned on a platform version: the platform set is
    -- installed by hash in every image (REQ-DSG-016), as 0061 recorded.
    '{}',
    now()
  );
end if;
v_kept := v_kept || v_template;

-- @family achievement@portrait@v1
v_template := null;
v_doc    := $json${
  "schemaVersion": 1,
  "purpose": "certificate",
  "master": {
    "width": 2480,
    "height": 3508,
    "unit": "px",
    "dpi": 300
  },
  "direction": "rtl",
  "background": {
    "type": "solid",
    "color": "{{brand.canvas}}"
  },
  "layers": [
    {
      "id": "l_logo",
      "kind": "image",
      "name": "شعار المؤسسة",
      "image": {
        "binding": "brand.logoAssetId",
        "fit": "contain"
      },
      "frame": {
        "x": 2020,
        "y": 240,
        "w": 220,
        "h": 220
      },
      "presets": {
        "default": {
          "anchor": "block-start",
          "scale": "proportional"
        }
      },
      "z": 10
    },
    {
      "id": "l_org",
      "kind": "dynamic_field",
      "name": "اسم المؤسسة",
      "frame": {
        "x": 240,
        "y": 240,
        "w": 1700,
        "h": 170
      },
      "field": {
        "binding": "org.name",
        "fallback": "اسم المؤسسة"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 120,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_kind",
      "kind": "text",
      "name": "نوع الشهادة",
      "frame": {
        "x": 240,
        "y": 430,
        "w": 1700,
        "h": 120
      },
      "text": {
        "literal": "شهادة إنجاز"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 84,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 700
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_recipient",
      "kind": "dynamic_field",
      "name": "اسم المستفيد",
      "frame": {
        "x": 240,
        "y": 700,
        "w": 2000,
        "h": 1000
      },
      "field": {
        "binding": "recipient.name",
        "fallback": "اسم المستفيد"
      },
      "font": {
        "family": "Baloo Bhaijaan 2",
        "size": 300,
        "minSize": 150,
        "lineHeight": 1.12,
        "letterSpacing": 0,
        "weight": 800
      },
      "color": "{{brand.fgHeading}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "z": 10
    },
    {
      "id": "l_reason",
      "kind": "dynamic_field",
      "name": "عن الجلسة",
      "frame": {
        "x": 240,
        "y": 1780,
        "w": 2000,
        "h": 260
      },
      "field": {
        "binding": "certificate.achievementName",
        "fallback": "اسم الإنجاز"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 72,
        "minSize": 48,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgBody}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 2
      },
      "z": 10
    },
    {
      "id": "l_issued",
      "kind": "dynamic_field",
      "name": "تاريخ الإصدار",
      "frame": {
        "x": 240,
        "y": 2100,
        "w": 1300,
        "h": 100
      },
      "field": {
        "binding": "certificate.issuedAt",
        "fallback": "تاريخ الإصدار"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز التحقّق",
      "locked": true,
      "frame": {
        "x": 1920,
        "y": 2948,
        "w": 320,
        "h": 320
      },
      "qr": {
        "binding": "certificate.verifyUrl",
        "ecLevel": "Q",
        "quietZoneModules": 4
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_serial",
      "kind": "dynamic_field",
      "name": "الرقم التسلسلي",
      "locked": true,
      "frame": {
        "x": 240,
        "y": 2980,
        "w": 1300,
        "h": 100
      },
      "field": {
        "binding": "certificate.serial",
        "fallback": "الرقم التسلسلي"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_code",
      "kind": "dynamic_field",
      "name": "رمز التحقّق النصّي",
      "locked": true,
      "frame": {
        "x": 240,
        "y": 3090,
        "w": 1300,
        "h": 100
      },
      "field": {
        "binding": "certificate.verificationCode",
        "fallback": "رمز التحقّق"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.7,
        "weight": 400
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    },
    {
      "id": "l_signature",
      "kind": "shape",
      "name": "موضع التوقيع",
      "locked": true,
      "frame": {
        "x": 1440,
        "y": 2900,
        "w": 800,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.edge}}"
      },
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "fixed"
        }
      },
      "z": 20
    }
  ]
}$json$::jsonb;
v_fields := $fields$["brand.logoAssetId","org.name","recipient.name","certificate.achievementName","certificate.issuedAt","certificate.verifyUrl","certificate.serial","certificate.verificationCode"]$fields$::jsonb;

-- The platform row that already carries this document, if this seed has run before.
select t.id into v_template
  from public.design_templates t
  join public.design_template_versions v on v.template_id = t.id
 where t.scope = 'platform' and t.purpose = 'certificate' and t.family = 'achievement'
   and t.retired_at is null and v.document = v_doc
 order by t.created_at
 limit 1;

if v_template is null then
  -- RETURNING, never a second lookup: a select by (family, name) would match the
  -- SUPERSEDED row, which still carries this family and this name until the
  -- supersede step runs — and would then insert version 1 on a row that already
  -- has one. That is the duplicate key the roster suite raised.
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'certificate', 'achievement', 'شهادة إنجاز عمودية', false)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1, v_doc, v_fields,
    -- No font hash is pinned on a platform version: the platform set is
    -- installed by hash in every image (REQ-DSG-016), as 0061 recorded.
    '{}',
    now()
  );
end if;
v_kept := v_kept || v_template;

-- ★ The eleven are seeded. Everything else in platform scope is superseded.

-- @supersede
for v_old in
  select t.id, t.purpose::text as purpose, t.family, t.name
    from public.design_templates t
   where t.scope = 'platform' and t.retired_at is null and t.id <> all(v_kept)
   order by t.purpose, t.family, t.created_at
loop
  select s.outcome, s.refused_by into v_outcome, v_refused
    from public.supersede_baseline_template(v_old.id) s;
  raise notice 'supersede % % % (%) -> % %',
    v_old.purpose, v_old.family, v_old.name, v_old.id, v_outcome, coalesce(v_refused, '');
end loop;

end $$;
