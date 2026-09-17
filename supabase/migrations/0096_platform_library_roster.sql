-- supabase/migrations/0096_platform_library_roster.sql — promoted by the lead from
-- supabase/proposed/platform/0009_platform_library_roster.sql (wave 8, DEC-148).
--
-- platform (wave 8) — SCR-083 lists the baseline as contract 3 rules it. Follows
-- `0069` (`platform_template_library()`, `retire_platform_template()`).
--
-- Serves:  REQ-DSG-008 (the platform library, managed not authored),
--          REQ-DSG-026 (the baseline ships with the platform), REQ-ADM-001
-- Cites:   09 §6 (SCR-083), 06 §3.3, DEC-052, DEC-128, DEC-147, DEC-148
--
-- ── Contract 3, as ruled (DEC-148) ────────────────────────────────────────
-- A baseline row is a COMPOSITION: five poster families, and three certificate
-- families × landscape and portrait. The scheme is never a row — every template
-- renders light and dark, pinned at the call site. The orientation is NOT a
-- column: it is read from the template's latest version, `document->'master'`,
-- `width > height` meaning landscape — the same test `designer` applies. One
-- default per (purpose, family), the landscape row; the retire guard stays per
-- purpose.
--
-- ── What this changes ─────────────────────────────────────────────────────
-- `platform_template_library()` gains three columns, so it is dropped and
-- re-created (a return type cannot be replaced in place), with its grants:
--
--   · `orientation` — `landscape` | `portrait` for a certificate, null for a
--     poster (a poster's master is one fixed preset; orientation is not a row).
--   · `is_baseline` — true for a platform row with NO `template.promoted` row in
--     `platform_audit_log`. Not `duplicated_from is null`: that foreign key is
--     `on delete set null`, so a promoted template whose source org was later
--     deleted would read as baseline. The audit trail outlives the org by design
--     (DEC-054), so it is the durable record of where a row came from.
--   · `retirable` — whether `retire_platform_template()` would accept it, computed
--     HERE, beside the guard it mirrors, so the screen never carries a second copy
--     of the rule: a row that is not retired, and is either not a default or not
--     the last non-retired default of its purpose. SCR-083 does not offer what
--     the guard would refuse (`16` §3 principle 7); the guard stays the authority.
--
-- `retire_platform_template()` is unchanged: the ruling keeps its granularity.
-- Nothing here reads a document's content beyond two numbers of its master, and
-- the function still returns platform scope only.
--
-- ── 03 §8.2 rows this file needs ──────────────────────────────────────────
--   | `RPC-platform_template_library.roster` | A platform admin reads every
--     platform row with its orientation (certificates only), `is_baseline` (false
--     once promoted), and `retirable` — false exactly for the last non-retired
--     default of a purpose, true for it again once a second default exists. |

drop function public.platform_template_library();

create function public.platform_template_library()
returns table (
  id uuid, purpose public.template_purpose, family text, name text,
  is_default boolean, retired_at timestamptz, versions int, created_at timestamptz,
  orientation text, is_baseline boolean, retirable boolean
)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform public.assert_platform_admin();
  return query
    select t.id, t.purpose, t.family, t.name, t.is_default, t.retired_at,
           (select count(*)::int from public.design_template_versions v where v.template_id = t.id),
           t.created_at,
           case when t.purpose = 'certificate' then (
             select case
                      when (v.document->'master'->>'width')::numeric > (v.document->'master'->>'height')::numeric
                        then 'landscape' else 'portrait'
                    end
               from public.design_template_versions v
              where v.template_id = t.id and v.document->'master' ? 'width' and v.document->'master' ? 'height'
              order by v.version desc
              limit 1
           ) end,
           not exists (
             select 1 from public.platform_audit_log a
              where a.action = 'template.promoted' and a.subject_id = t.id
           ),
           -- `retire_platform_template()`'s refusal, negated: it refuses exactly a
           -- non-retired DEFAULT with no other non-retired default in its purpose.
           t.retired_at is null and (
             not t.is_default or exists (
               select 1 from public.design_templates x
                where x.scope = 'platform' and x.purpose = t.purpose
                  and x.is_default and x.retired_at is null and x.id <> t.id
             )
           )
      from public.design_templates t
     where t.scope = 'platform'
     order by t.purpose, t.family, t.created_at;
end $fn$;
revoke execute on function public.platform_template_library() from public, anon;
grant  execute on function public.platform_template_library() to authenticated;
