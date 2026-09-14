-- promoted by the lead at wave-3 sync 5 · designer (wave 3, M6) — the baseline template library, as PLATFORM templates.
-- Follows 0057/the render pipeline.
--
-- Serves:  02 §4.13 (design_templates, design_template_versions), 03 §5.9a
--          REQ-DSG-008 (a platform library every org duplicates from),
--          REQ-DSG-024 (locked regions), REQ-DSG-026 (the brand constraint),
--          REQ-CRT-010 (the certificate QR and both identifiers), A27
-- Cites:   DEC-003 (the brand), DEC-048
--
-- 03 §8.2 ROWS: none. This file creates no policy and no grant — it inserts
-- rows into two tables 0055 already policied, as the owner during migration.
--
-- GENERATED FROM `packages/designer-runtime/src/library.ts`, which is the
-- source. `tests/unit/designer-library.test.ts` parses the JSON back out of
-- this file and deep-equals it against the library, so the copy cannot
-- drift — a copy nobody compares is a copy that diverges.
--
-- These are PLATFORM templates: `scope = 'platform'`, `org_id` null, the
-- third and only meaningful null-org exception in 02 §7. Every org reads
-- them and no org may write one (03 §5.9a), which is what makes improving
-- them safe: an org that wants a change duplicates, and the duplicate is a
-- copy that no later platform edit reaches (REQ-DSG-008).
--
-- Idempotent on (scope, purpose, family) so a re-run adds nothing. A later
-- revision of a family ships as a NEW VERSION of its template rather than an
-- edit of version 1 — an artifact references a version, and a certificate
-- issued against v1 must render as v1 forever (REQ-DSG-007, REQ-CRT-014).

do $$
declare v_template uuid;
begin

-- @family talk
select id into v_template from public.design_templates
 where scope = 'platform' and purpose = 'poster' and family = 'talk';

if v_template is null then
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'poster', 'talk', 'جلسة', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1,
    $json${
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
        "x": 80,
        "y": 80,
        "w": 160,
        "h": 160
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
      "id": "l_kicker",
      "kind": "text",
      "name": "نوع الجلسة",
      "frame": {
        "x": 80,
        "y": 280,
        "w": 920,
        "h": 60
      },
      "text": {
        "literal": "جلسة"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.4,
        "weight": 500
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_title",
      "kind": "text",
      "name": "عنوان الجلسة",
      "frame": {
        "x": 80,
        "y": 360,
        "w": 920,
        "h": 330
      },
      "text": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "Reem Kufi",
        "size": 96,
        "minSize": 56,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 600
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
      "id": "l_rule",
      "kind": "shape",
      "frame": {
        "x": 80,
        "y": 720,
        "w": 920,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.spine}}"
      },
      "z": 2
    },
    {
      "id": "l_rule-node-1",
      "kind": "shape",
      "frame": {
        "x": 115,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-2",
      "kind": "shape",
      "frame": {
        "x": 535,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-3",
      "kind": "shape",
      "frame": {
        "x": 955,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_presenters",
      "kind": "dynamic_field",
      "name": "المقدِّمون",
      "frame": {
        "x": 80,
        "y": 770,
        "w": 920,
        "h": 80
      },
      "field": {
        "binding": "session.presenters",
        "fallback": "اسم المقدِّم"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 44,
        "minSize": 32,
        "lineHeight": 1.7,
        "weight": 500
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
      "id": "l_when",
      "kind": "dynamic_field",
      "name": "الموعد",
      "frame": {
        "x": 80,
        "y": 870,
        "w": 920,
        "h": 60
      },
      "field": {
        "binding": "session.startsAt",
        "fallback": "التاريخ والوقت"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgBody}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_where",
      "kind": "dynamic_field",
      "name": "المكان",
      "frame": {
        "x": 80,
        "y": 940,
        "w": 760,
        "h": 60
      },
      "field": {
        "binding": "session.venueName",
        "fallback": "المكان"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "hideAt": [
        "og"
      ],
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز الجلسة",
      "locked": true,
      "frame": {
        "x": 80,
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
          "scale": "fixed"
        }
      },
      "z": 10
    }
  ]
}$json$::jsonb,
    $fields$["brand.logoAssetId","session.title","session.presenters","session.startsAt","session.venueName","session.eventUrl"]$fields$::jsonb,
    -- Version 1 pins no font hash: the platform set is installed by hash in
    -- every image already (REQ-DSG-016), and pinning here would freeze these
    -- templates to today's subset of a face that CI re-extracts.
    '{}',
    now()
  );
end if;

-- @family workshop
select id into v_template from public.design_templates
 where scope = 'platform' and purpose = 'poster' and family = 'workshop';

if v_template is null then
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'poster', 'workshop', 'ورشة', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1,
    $json${
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
        "x": 80,
        "y": 80,
        "w": 160,
        "h": 160
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
      "id": "l_kicker",
      "kind": "text",
      "name": "نوع الجلسة",
      "frame": {
        "x": 80,
        "y": 280,
        "w": 920,
        "h": 60
      },
      "text": {
        "literal": "ورشة"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.4,
        "weight": 500
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_title",
      "kind": "text",
      "name": "عنوان الجلسة",
      "frame": {
        "x": 80,
        "y": 360,
        "w": 920,
        "h": 330
      },
      "text": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "Reem Kufi",
        "size": 96,
        "minSize": 56,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 600
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
      "id": "l_rule",
      "kind": "shape",
      "frame": {
        "x": 80,
        "y": 720,
        "w": 920,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.spine}}"
      },
      "z": 2
    },
    {
      "id": "l_rule-node-1",
      "kind": "shape",
      "frame": {
        "x": 115,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-2",
      "kind": "shape",
      "frame": {
        "x": 535,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-3",
      "kind": "shape",
      "frame": {
        "x": 955,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_presenters",
      "kind": "dynamic_field",
      "name": "المقدِّمون",
      "frame": {
        "x": 80,
        "y": 770,
        "w": 920,
        "h": 80
      },
      "field": {
        "binding": "session.presenters",
        "fallback": "اسم المقدِّم"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 44,
        "minSize": 32,
        "lineHeight": 1.7,
        "weight": 500
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
      "id": "l_when",
      "kind": "dynamic_field",
      "name": "الموعد",
      "frame": {
        "x": 80,
        "y": 870,
        "w": 920,
        "h": 60
      },
      "field": {
        "binding": "session.startsAt",
        "fallback": "التاريخ والوقت"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgBody}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_where",
      "kind": "dynamic_field",
      "name": "المكان",
      "frame": {
        "x": 80,
        "y": 940,
        "w": 760,
        "h": 60
      },
      "field": {
        "binding": "session.venueName",
        "fallback": "المكان"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "hideAt": [
        "og"
      ],
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز الجلسة",
      "locked": true,
      "frame": {
        "x": 80,
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
          "scale": "fixed"
        }
      },
      "z": 10
    },
    {
      "id": "l_tasks",
      "kind": "text",
      "name": "المهام التحضيرية",
      "frame": {
        "x": 260,
        "y": 1130,
        "w": 740,
        "h": 140
      },
      "text": {
        "literal": "لهذه الورشة مهام تحضيرية — راجعها قبل الحضور."
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 34,
        "minSize": 26,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "autoFit": {
        "mode": "shrink-then-wrap",
        "maxLines": 3
      },
      "hideAt": [
        "og",
        "square"
      ],
      "presets": {
        "default": {
          "anchor": "block-end",
          "scale": "proportional"
        }
      },
      "z": 10
    }
  ]
}$json$::jsonb,
    $fields$["brand.logoAssetId","session.title","session.presenters","session.startsAt","session.venueName","session.eventUrl"]$fields$::jsonb,
    -- Version 1 pins no font hash: the platform set is installed by hash in
    -- every image already (REQ-DSG-016), and pinning here would freeze these
    -- templates to today's subset of a face that CI re-extracts.
    '{}',
    now()
  );
end if;

-- @family panel
select id into v_template from public.design_templates
 where scope = 'platform' and purpose = 'poster' and family = 'panel';

if v_template is null then
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'poster', 'panel', 'حوار', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1,
    $json${
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
        "x": 80,
        "y": 80,
        "w": 160,
        "h": 160
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
      "id": "l_kicker",
      "kind": "text",
      "name": "نوع الجلسة",
      "frame": {
        "x": 80,
        "y": 280,
        "w": 920,
        "h": 60
      },
      "text": {
        "literal": "حوار"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.4,
        "weight": 500
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_title",
      "kind": "text",
      "name": "عنوان الجلسة",
      "frame": {
        "x": 80,
        "y": 360,
        "w": 920,
        "h": 330
      },
      "text": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "Reem Kufi",
        "size": 96,
        "minSize": 56,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 600
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
      "id": "l_rule",
      "kind": "shape",
      "frame": {
        "x": 80,
        "y": 720,
        "w": 920,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.spine}}"
      },
      "z": 2
    },
    {
      "id": "l_rule-node-1",
      "kind": "shape",
      "frame": {
        "x": 115,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-2",
      "kind": "shape",
      "frame": {
        "x": 535,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-3",
      "kind": "shape",
      "frame": {
        "x": 955,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_presenters",
      "kind": "dynamic_field",
      "name": "المقدِّمون",
      "frame": {
        "x": 80,
        "y": 770,
        "w": 920,
        "h": 160
      },
      "field": {
        "binding": "session.presenters",
        "fallback": "اسم المقدِّم"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 44,
        "minSize": 32,
        "lineHeight": 1.7,
        "weight": 500
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
      "id": "l_when",
      "kind": "dynamic_field",
      "name": "الموعد",
      "frame": {
        "x": 80,
        "y": 870,
        "w": 920,
        "h": 60
      },
      "field": {
        "binding": "session.startsAt",
        "fallback": "التاريخ والوقت"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgBody}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_where",
      "kind": "dynamic_field",
      "name": "المكان",
      "frame": {
        "x": 80,
        "y": 940,
        "w": 760,
        "h": 60
      },
      "field": {
        "binding": "session.venueName",
        "fallback": "المكان"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "hideAt": [
        "og"
      ],
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز الجلسة",
      "locked": true,
      "frame": {
        "x": 80,
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
          "scale": "fixed"
        }
      },
      "z": 10
    }
  ]
}$json$::jsonb,
    $fields$["brand.logoAssetId","session.title","session.presenters","session.startsAt","session.venueName","session.eventUrl"]$fields$::jsonb,
    -- Version 1 pins no font hash: the platform set is installed by hash in
    -- every image already (REQ-DSG-016), and pinning here would freeze these
    -- templates to today's subset of a face that CI re-extracts.
    '{}',
    now()
  );
end if;

-- @family meetup
select id into v_template from public.design_templates
 where scope = 'platform' and purpose = 'poster' and family = 'meetup';

if v_template is null then
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'poster', 'meetup', 'لقاء', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1,
    $json${
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
        "x": 80,
        "y": 80,
        "w": 160,
        "h": 160
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
      "id": "l_kicker",
      "kind": "text",
      "name": "نوع الجلسة",
      "frame": {
        "x": 80,
        "y": 280,
        "w": 920,
        "h": 60
      },
      "text": {
        "literal": "لقاء"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.4,
        "weight": 500
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_title",
      "kind": "text",
      "name": "عنوان الجلسة",
      "frame": {
        "x": 80,
        "y": 360,
        "w": 920,
        "h": 330
      },
      "text": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "Reem Kufi",
        "size": 96,
        "minSize": 56,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 600
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
      "id": "l_rule",
      "kind": "shape",
      "frame": {
        "x": 80,
        "y": 720,
        "w": 920,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.spine}}"
      },
      "z": 2
    },
    {
      "id": "l_rule-node-1",
      "kind": "shape",
      "frame": {
        "x": 115,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-2",
      "kind": "shape",
      "frame": {
        "x": 535,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-3",
      "kind": "shape",
      "frame": {
        "x": 955,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_presenters",
      "kind": "dynamic_field",
      "name": "المقدِّمون",
      "frame": {
        "x": 80,
        "y": 770,
        "w": 920,
        "h": 80
      },
      "field": {
        "binding": "session.presenters",
        "fallback": "اسم المقدِّم"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 44,
        "minSize": 32,
        "lineHeight": 1.7,
        "weight": 500
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
      "id": "l_when",
      "kind": "dynamic_field",
      "name": "الموعد",
      "frame": {
        "x": 80,
        "y": 870,
        "w": 920,
        "h": 60
      },
      "field": {
        "binding": "session.startsAt",
        "fallback": "التاريخ والوقت"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgBody}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_where",
      "kind": "dynamic_field",
      "name": "المكان",
      "frame": {
        "x": 80,
        "y": 940,
        "w": 760,
        "h": 60
      },
      "field": {
        "binding": "session.venueName",
        "fallback": "المكان"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "hideAt": [
        "og"
      ],
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز الجلسة",
      "locked": true,
      "frame": {
        "x": 80,
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
          "scale": "fixed"
        }
      },
      "z": 10
    }
  ]
}$json$::jsonb,
    $fields$["brand.logoAssetId","session.title","session.presenters","session.startsAt","session.venueName","session.eventUrl"]$fields$::jsonb,
    -- Version 1 pins no font hash: the platform set is installed by hash in
    -- every image already (REQ-DSG-016), and pinning here would freeze these
    -- templates to today's subset of a face that CI re-extracts.
    '{}',
    now()
  );
end if;

-- @family announcement
select id into v_template from public.design_templates
 where scope = 'platform' and purpose = 'poster' and family = 'announcement';

if v_template is null then
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'poster', 'announcement', 'إعلان', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1,
    $json${
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
        "x": 80,
        "y": 80,
        "w": 160,
        "h": 160
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
      "id": "l_kicker",
      "kind": "text",
      "name": "نوع الجلسة",
      "frame": {
        "x": 80,
        "y": 280,
        "w": 920,
        "h": 60
      },
      "text": {
        "literal": "إعلان"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.4,
        "weight": 500
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_title",
      "kind": "text",
      "name": "عنوان الجلسة",
      "frame": {
        "x": 80,
        "y": 360,
        "w": 920,
        "h": 330
      },
      "text": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "Reem Kufi",
        "size": 96,
        "minSize": 56,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 600
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
      "id": "l_rule",
      "kind": "shape",
      "frame": {
        "x": 80,
        "y": 720,
        "w": 920,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.spine}}"
      },
      "z": 2
    },
    {
      "id": "l_rule-node-1",
      "kind": "shape",
      "frame": {
        "x": 115,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-2",
      "kind": "shape",
      "frame": {
        "x": 535,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-3",
      "kind": "shape",
      "frame": {
        "x": 955,
        "y": 716,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_presenters",
      "kind": "dynamic_field",
      "name": "المقدِّمون",
      "frame": {
        "x": 80,
        "y": 770,
        "w": 920,
        "h": 80
      },
      "field": {
        "binding": "session.presenters",
        "fallback": "اسم المقدِّم"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 44,
        "minSize": 32,
        "lineHeight": 1.7,
        "weight": 500
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
      "id": "l_when",
      "kind": "dynamic_field",
      "name": "الموعد",
      "frame": {
        "x": 80,
        "y": 870,
        "w": 920,
        "h": 60
      },
      "field": {
        "binding": "session.startsAt",
        "fallback": "التاريخ والوقت"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgBody}}",
      "align": "start",
      "z": 10
    },
    {
      "id": "l_where",
      "kind": "dynamic_field",
      "name": "المكان",
      "frame": {
        "x": 80,
        "y": 940,
        "w": 760,
        "h": 60
      },
      "field": {
        "binding": "session.venueName",
        "fallback": "المكان"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 40,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgMuted}}",
      "align": "start",
      "hideAt": [
        "og"
      ],
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز الجلسة",
      "locked": true,
      "frame": {
        "x": 80,
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
          "scale": "fixed"
        }
      },
      "z": 10
    }
  ]
}$json$::jsonb,
    $fields$["brand.logoAssetId","session.title","session.presenters","session.startsAt","session.venueName","session.eventUrl"]$fields$::jsonb,
    -- Version 1 pins no font hash: the platform set is installed by hash in
    -- every image already (REQ-DSG-016), and pinning here would freeze these
    -- templates to today's subset of a face that CI re-extracts.
    '{}',
    now()
  );
end if;

-- @family attendance
select id into v_template from public.design_templates
 where scope = 'platform' and purpose = 'certificate' and family = 'attendance';

if v_template is null then
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'certificate', 'attendance', 'شهادة حضور', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1,
    $json${
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
        "x": 1644,
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
        "x": 300,
        "y": 500,
        "w": 2908,
        "h": 80
      },
      "field": {
        "binding": "org.name",
        "fallback": "اسم المؤسسة"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.4,
        "weight": 500
      },
      "color": "{{brand.fgMuted}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_kind",
      "kind": "text",
      "name": "نوع الشهادة",
      "frame": {
        "x": 300,
        "y": 620,
        "w": 2908,
        "h": 160
      },
      "text": {
        "literal": "شهادة حضور"
      },
      "font": {
        "family": "Amiri",
        "size": 128,
        "minSize": 88,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 600
      },
      "color": "{{brand.fgHeading}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_rule",
      "kind": "shape",
      "frame": {
        "x": 300,
        "y": 830,
        "w": 2908,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.spine}}"
      },
      "z": 2
    },
    {
      "id": "l_rule-node-1",
      "kind": "shape",
      "frame": {
        "x": 335,
        "y": 826,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-2",
      "kind": "shape",
      "frame": {
        "x": 1749,
        "y": 826,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-3",
      "kind": "shape",
      "frame": {
        "x": 3163,
        "y": 826,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_recipient",
      "kind": "dynamic_field",
      "name": "اسم المستفيد",
      "frame": {
        "x": 300,
        "y": 920,
        "w": 2908,
        "h": 200
      },
      "field": {
        "binding": "recipient.name",
        "fallback": "اسم المستفيد"
      },
      "font": {
        "family": "Amiri",
        "size": 150,
        "minSize": 90,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 600
      },
      "color": "{{brand.fgHeading}}",
      "align": "center",
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
        "x": 300,
        "y": 1180,
        "w": 2908,
        "h": 160
      },
      "field": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 64,
        "minSize": 44,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgBody}}",
      "align": "center",
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
        "x": 300,
        "y": 1380,
        "w": 2908,
        "h": 70
      },
      "field": {
        "binding": "certificate.issuedAt",
        "fallback": "تاريخ الإصدار"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 48,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgMuted}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز التحقّق",
      "locked": true,
      "frame": {
        "x": 300,
        "y": 1860,
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
        "x": 660,
        "y": 1880,
        "w": 900,
        "h": 70
      },
      "field": {
        "binding": "certificate.serial",
        "fallback": "الرقم التسلسلي"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 44,
        "lineHeight": 1.7
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
        "x": 660,
        "y": 1960,
        "w": 900,
        "h": 70
      },
      "field": {
        "binding": "certificate.verificationCode",
        "fallback": "رمز التحقّق"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 44,
        "lineHeight": 1.7
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
        "x": 2608,
        "y": 2000,
        "w": 600,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.edgeStrong}}"
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
}$json$::jsonb,
    $fields$["brand.logoAssetId","org.name","recipient.name","session.title","certificate.issuedAt","certificate.verifyUrl","certificate.serial","certificate.verificationCode"]$fields$::jsonb,
    -- Version 1 pins no font hash: the platform set is installed by hash in
    -- every image already (REQ-DSG-016), and pinning here would freeze these
    -- templates to today's subset of a face that CI re-extracts.
    '{}',
    now()
  );
end if;

-- @family presenter
select id into v_template from public.design_templates
 where scope = 'platform' and purpose = 'certificate' and family = 'presenter';

if v_template is null then
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'certificate', 'presenter', 'شهادة تقديم', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1,
    $json${
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
        "x": 1644,
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
        "x": 300,
        "y": 500,
        "w": 2908,
        "h": 80
      },
      "field": {
        "binding": "org.name",
        "fallback": "اسم المؤسسة"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.4,
        "weight": 500
      },
      "color": "{{brand.fgMuted}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_kind",
      "kind": "text",
      "name": "نوع الشهادة",
      "frame": {
        "x": 300,
        "y": 620,
        "w": 2908,
        "h": 160
      },
      "text": {
        "literal": "شهادة تقديم"
      },
      "font": {
        "family": "Amiri",
        "size": 128,
        "minSize": 88,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 600
      },
      "color": "{{brand.fgHeading}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_rule",
      "kind": "shape",
      "frame": {
        "x": 300,
        "y": 830,
        "w": 2908,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.spine}}"
      },
      "z": 2
    },
    {
      "id": "l_rule-node-1",
      "kind": "shape",
      "frame": {
        "x": 335,
        "y": 826,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-2",
      "kind": "shape",
      "frame": {
        "x": 1749,
        "y": 826,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-3",
      "kind": "shape",
      "frame": {
        "x": 3163,
        "y": 826,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_recipient",
      "kind": "dynamic_field",
      "name": "اسم المستفيد",
      "frame": {
        "x": 300,
        "y": 920,
        "w": 2908,
        "h": 200
      },
      "field": {
        "binding": "recipient.name",
        "fallback": "اسم المستفيد"
      },
      "font": {
        "family": "Amiri",
        "size": 150,
        "minSize": 90,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 600
      },
      "color": "{{brand.fgHeading}}",
      "align": "center",
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
        "x": 300,
        "y": 1180,
        "w": 2908,
        "h": 160
      },
      "field": {
        "binding": "session.title",
        "fallback": "عنوان الجلسة"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 64,
        "minSize": 44,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgBody}}",
      "align": "center",
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
        "x": 300,
        "y": 1380,
        "w": 2908,
        "h": 70
      },
      "field": {
        "binding": "certificate.issuedAt",
        "fallback": "تاريخ الإصدار"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 48,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgMuted}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز التحقّق",
      "locked": true,
      "frame": {
        "x": 300,
        "y": 1860,
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
        "x": 660,
        "y": 1880,
        "w": 900,
        "h": 70
      },
      "field": {
        "binding": "certificate.serial",
        "fallback": "الرقم التسلسلي"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 44,
        "lineHeight": 1.7
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
        "x": 660,
        "y": 1960,
        "w": 900,
        "h": 70
      },
      "field": {
        "binding": "certificate.verificationCode",
        "fallback": "رمز التحقّق"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 44,
        "lineHeight": 1.7
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
        "x": 2608,
        "y": 2000,
        "w": 600,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.edgeStrong}}"
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
}$json$::jsonb,
    $fields$["brand.logoAssetId","org.name","recipient.name","session.title","certificate.issuedAt","certificate.verifyUrl","certificate.serial","certificate.verificationCode"]$fields$::jsonb,
    -- Version 1 pins no font hash: the platform set is installed by hash in
    -- every image already (REQ-DSG-016), and pinning here would freeze these
    -- templates to today's subset of a face that CI re-extracts.
    '{}',
    now()
  );
end if;

-- @family achievement
select id into v_template from public.design_templates
 where scope = 'platform' and purpose = 'certificate' and family = 'achievement';

if v_template is null then
  insert into public.design_templates (org_id, scope, purpose, family, name, is_default)
  values (null, 'platform', 'certificate', 'achievement', 'شهادة إنجاز', true)
  returning id into v_template;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields, font_hashes, published_at)
  values (
    v_template, 1,
    $json${
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
        "x": 1644,
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
        "x": 300,
        "y": 500,
        "w": 2908,
        "h": 80
      },
      "field": {
        "binding": "org.name",
        "fallback": "اسم المؤسسة"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 56,
        "lineHeight": 1.4,
        "weight": 500
      },
      "color": "{{brand.fgMuted}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_kind",
      "kind": "text",
      "name": "نوع الشهادة",
      "frame": {
        "x": 300,
        "y": 620,
        "w": 2908,
        "h": 160
      },
      "text": {
        "literal": "شهادة إنجاز"
      },
      "font": {
        "family": "Amiri",
        "size": 128,
        "minSize": 88,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 600
      },
      "color": "{{brand.fgHeading}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_rule",
      "kind": "shape",
      "frame": {
        "x": 300,
        "y": 830,
        "w": 2908,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.spine}}"
      },
      "z": 2
    },
    {
      "id": "l_rule-node-1",
      "kind": "shape",
      "frame": {
        "x": 335,
        "y": 826,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-2",
      "kind": "shape",
      "frame": {
        "x": 1749,
        "y": 826,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_rule-node-3",
      "kind": "shape",
      "frame": {
        "x": 3163,
        "y": 826,
        "w": 10,
        "h": 10
      },
      "shape": {
        "type": "ellipse",
        "fill": "{{brand.node}}"
      },
      "z": 3
    },
    {
      "id": "l_recipient",
      "kind": "dynamic_field",
      "name": "اسم المستفيد",
      "frame": {
        "x": 300,
        "y": 920,
        "w": 2908,
        "h": 200
      },
      "field": {
        "binding": "recipient.name",
        "fallback": "اسم المستفيد"
      },
      "font": {
        "family": "Amiri",
        "size": 150,
        "minSize": 90,
        "lineHeight": 1.4,
        "letterSpacing": 0,
        "weight": 600
      },
      "color": "{{brand.fgHeading}}",
      "align": "center",
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
        "x": 300,
        "y": 1180,
        "w": 2908,
        "h": 160
      },
      "field": {
        "binding": "certificate.achievementName",
        "fallback": "اسم الإنجاز"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 64,
        "minSize": 44,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgBody}}",
      "align": "center",
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
        "x": 300,
        "y": 1380,
        "w": 2908,
        "h": 70
      },
      "field": {
        "binding": "certificate.issuedAt",
        "fallback": "تاريخ الإصدار"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 48,
        "lineHeight": 1.7
      },
      "color": "{{brand.fgMuted}}",
      "align": "center",
      "z": 10
    },
    {
      "id": "l_qr",
      "kind": "qr",
      "name": "رمز التحقّق",
      "locked": true,
      "frame": {
        "x": 300,
        "y": 1860,
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
        "x": 660,
        "y": 1880,
        "w": 900,
        "h": 70
      },
      "field": {
        "binding": "certificate.serial",
        "fallback": "الرقم التسلسلي"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 44,
        "lineHeight": 1.7
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
        "x": 660,
        "y": 1960,
        "w": 900,
        "h": 70
      },
      "field": {
        "binding": "certificate.verificationCode",
        "fallback": "رمز التحقّق"
      },
      "font": {
        "family": "IBM Plex Sans Arabic",
        "size": 44,
        "lineHeight": 1.7
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
        "x": 2608,
        "y": 2000,
        "w": 600,
        "h": 2
      },
      "shape": {
        "type": "rect",
        "fill": "{{brand.edgeStrong}}"
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
}$json$::jsonb,
    $fields$["brand.logoAssetId","org.name","recipient.name","certificate.achievementName","certificate.issuedAt","certificate.verifyUrl","certificate.serial","certificate.verificationCode"]$fields$::jsonb,
    -- Version 1 pins no font hash: the platform set is installed by hash in
    -- every image already (REQ-DSG-016), and pinning here would freeze these
    -- templates to today's subset of a face that CI re-extracts.
    '{}',
    now()
  );
end if;

end $$;
