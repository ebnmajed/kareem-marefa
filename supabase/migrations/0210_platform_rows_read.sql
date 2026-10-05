-- 0210 · wave 27, PR D (DEC-254 §3.4, DEC-255 §5, REQ-DSG-035, REQ-CRT-014) — the POLICY half of the removal: who may
-- still read a platform template once there is no platform library. Applied after 0209, in the same push.
--
-- Serves:  REQ-DSG-035 · REQ-CRT-014 (a certificate or a document issued against a former platform version still
--          renders as that version) · Cites: DEC-254 §3.4, DEC-255 §5 (D5), 0055:577-598, 0099:63
--
-- ★ WHAT NARROWS. `templates_read` (0055:577) let every org read every platform row, because orgs duplicated from
-- them (D67). Nothing duplicates from them now. A platform row is readable by an org ONLY when a row of that org
-- still names it: a certificate, a design document or a session's certificate design. 0010 has by then deleted every
-- platform row nothing names and retired the rest, so what remains readable is exactly what must keep rendering.
--
-- ★ WHY A DEFINER BOOLEAN. «Named by a row of mine» reads `design_template_versions`, whose own policy reads
-- `design_templates` — written inline that is `42P17`, infinite recursion. `template_referenced_by_my_org()` breaks
-- the cycle and returns nothing but a boolean about the caller's own org. It is granted to `authenticated` because a
-- policy's expression runs as the caller.
--
-- ★ THE CONSTRAINT (D5). After 0010's loop, every surviving platform row is retired. `design_templates_platform_retired`
-- keeps it so: no path — not the owner's hand either — can make a platform row live again. The enum's 'platform' value
-- and `design_templates_scope_org` (0055:92) stay, because retired rows may.
--
-- 03 §8.2 rows this adds:
--   | `POL-design_templates.read.platform_only_if_referenced` | An org reads a platform template only while one of its certificates, design documents or session certificate designs names it; another org's reference does not open it; an unreferenced one is invisible. |
--   | `POL-design_template_versions.read.follows_parent` | A version is readable exactly when its template is — the org's own, or a platform one the org references. |
--   | `CHK-design_templates.platform_retired` | A platform row with `retired_at` null is refused `23514`, on insert and on update. |
--   | `FN-template_referenced_by_my_org.own_org_only` | The function answers for the caller's org alone and returns false with no session. |

create function public.template_referenced_by_my_org(p_template uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.auth_org_id() is not null and (
    exists (select 1 from public.certificates c
              join public.design_template_versions v on v.id = c.template_version_id
             where v.template_id = p_template and c.org_id = public.auth_org_id())
    or exists (select 1 from public.design_documents d
                 join public.design_template_versions v on v.id = d.template_version_id
                where v.template_id = p_template and d.org_id = public.auth_org_id())
    or exists (select 1 from public.session_certificate_designs s
                where s.template_id = p_template and s.org_id = public.auth_org_id())
  )
$$;
revoke execute on function public.template_referenced_by_my_org(uuid) from public, anon;
grant  execute on function public.template_referenced_by_my_org(uuid) to authenticated;

drop policy "templates_read" on public.design_templates;
create policy "templates_read" on public.design_templates for select to authenticated
  using (org_id = public.auth_org_id()
         or (scope = 'platform' and public.template_referenced_by_my_org(id)));

drop policy "template_versions_read" on public.design_template_versions;
create policy "template_versions_read" on public.design_template_versions for select to authenticated
  using (exists (select 1 from public.design_templates t
                  where t.id = template_id
                    and (t.org_id = public.auth_org_id()
                         or (t.scope = 'platform' and public.template_referenced_by_my_org(t.id)))));

alter table public.design_templates
  add constraint design_templates_platform_retired check (scope = 'org' or retired_at is not null);
