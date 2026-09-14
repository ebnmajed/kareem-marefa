-- designer (wave 3, M6) — a template's working draft, and one default per family.
-- Follows 0055; forward-only, so what 0055 could have carried is added here
-- rather than edited into it.
--
-- Serves:  02 §4.13, 03 §5.9/§5.9b (no policy change — the new column is read
--          and written under `documents_read` and P2 exactly as the bound
--          ones are)
--          REQ-DSG-001, REQ-DSG-002, REQ-DSG-007, REQ-ADM-013
-- Cites:   DEC-012 (the automatic poster path needs a default template),
--          DEC-048
--
-- TWO ADDITIONS, both from building SCR-055/056 against 0055.
--
--  1. `design_documents.draft_for_template_id` — HOW A TEMPLATE IS EDITED.
--     A published version is immutable (REQ-DSG-007: an artifact references a
--     VERSION, not a template, so a v4 must not reach a certificate issued
--     against v3), and `design_template_versions` has no update policy and no
--     update grant. So a template is edited by editing a working DOCUMENT and
--     publishing it as the next version. That document is the same shape, the
--     same editor and the same renderer as a poster — which is the cheapest
--     way to keep «one engine» true, and the only way that does not grow a
--     second editing path nobody exercises.
--
--     `unique`, so a template has exactly one draft and two admins opening
--     the library do not each create their own.
--
--  2. `design_templates_single_default` — the automatic poster path binds
--     session data to the org's default template for the session's family
--     (DEC-012, REQ-DSG-002). 0055's two partial unique indexes already allow
--     at most one; without this trigger, promoting a new default is a
--     clear-then-set that an application can half-perform, leaving a family
--     with NO default — and a publish that then has no template to bind.

-- ── 1. the template's working draft ────────────────────────────────────────
alter table public.design_documents
  add column draft_for_template_id uuid unique references public.design_templates(id) on delete cascade;

-- A document is a poster, a certificate, or a template's draft — never two.
alter table public.design_documents drop constraint design_documents_one_binding;
alter table public.design_documents add constraint design_documents_one_binding check (
  (case when bound_session_id      is null then 0 else 1 end) +
  (case when bound_certificate_id  is null then 0 else 1 end) +
  (case when draft_for_template_id is null then 0 else 1 end) <= 1
);

-- No new policy: `documents_read` (03 §5.9b) already restricts an unbound
-- document to an org admin, which is exactly who may edit a template
-- (REQ-DSG-008 — an org admin builds the org library), and P2 governs the
-- writes. The column is covered by the existing grants.

-- ── 2. exactly one default per (org, purpose, family) ──────────────────────
create function public.design_templates_single_default() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not new.is_default then
    return new;
  end if;
  update public.design_templates t
     set is_default = false
   where t.is_default
     and t.id <> new.id
     and t.purpose = new.purpose
     and t.family  = new.family
     -- `is not distinct from`, not `=`: a platform template's org_id is NULL
     -- (02 §7's third exception) and `null = null` is null, which would let
     -- two platform defaults stand for one family.
     and t.org_id is not distinct from new.org_id;
  return new;
end $$;

create trigger design_templates_single_default
  before insert or update of is_default on public.design_templates
  for each row execute function public.design_templates_single_default();
