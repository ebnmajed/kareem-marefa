-- platform (wave 4, M8) — what SCR-083 needs to promote from. Follows 0002.
--
-- Serves:  REQ-DSG-008 (two library levels, and the platform one is managed),
--          REQ-ADM-001, REQ-ADM-002 (and the line this file walks)
-- Cites:   03 §5.9a, 09 §6 (SCR-083), DEC-014, DEC-052
--
-- ── The honest note about this one function ───────────────────────────────
-- `promote_template_to_platform()` (0001) takes a version id. A super admin has
-- no data plane, so without this they would have no way to LEARN a version id
-- and promotion would only work by an org admin reading one out over a chat.
--
-- So this widens what a super admin can see, deliberately and by exactly one
-- thing: **the identity of an org's published template versions** — purpose,
-- family, the template's name, the version number and when it was published.
--
-- What it does NOT return, and must never be widened to return:
--   · the document JSON (that is the template's content, and the promote RPC
--     copies it server-side without ever handing it to the caller),
--   · the member who published it (`published_by` is not selected),
--   · anything about sessions, members, materials or certificates.
--
-- A template name is an org's own words, so this is not free. It is the
-- narrowest door that makes `REQ-DSG-008` true, and the alternative — a super
-- admin pasting a uuid someone dictated — is a worse product without being a
-- better boundary, because the promote RPC already reads the whole document.
--
-- ── 03 §8.2 rows this file needs ───────────────────────────────────────────
--   | `RPC-platform_promotable_versions.platform_only` | An org admin, a
--     moderator and a member are refused `42501`; a platform admin gets one row
--     per PUBLISHED org version with its purpose, family, name and version
--     number — and no document, no `published_by`, and nothing from a draft. |
--   | `RPC-platform_promotable_versions.scope` | Platform-scope versions never
--     appear: the library does not offer to promote itself (`REQ-DSG-008`). |

create function public.platform_promotable_versions(p_org uuid default null)
returns table (
  version_id  uuid,
  template_id uuid,
  org_id      uuid,
  org_name    text,
  purpose     public.template_purpose,
  family      text,
  name        text,
  version     int,
  published_at timestamptz,
  already_promoted boolean
)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform public.assert_platform_admin();
  return query
    select v.id, t.id, t.org_id, o.name, t.purpose, t.family, t.name, v.version, v.published_at,
           -- A family promoted once should not be offered again without the
           -- operator knowing: `duplicated_from` is the provenance 0055 keeps.
           exists (
             select 1 from public.design_templates p
              where p.scope = 'platform' and p.duplicated_from = t.id
           )
      from public.design_template_versions v
      join public.design_templates t on t.id = v.template_id
      join public.orgs o on o.id = t.org_id
     where t.scope = 'org'
       and v.published_at is not null
       and t.retired_at is null
       and (p_org is null or t.org_id = p_org)
     order by o.name, t.purpose, t.family, v.version desc;
end $fn$;
revoke execute on function public.platform_promotable_versions(uuid) from public, anon;
grant  execute on function public.platform_promotable_versions(uuid) to authenticated;
