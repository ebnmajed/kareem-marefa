-- 0180 · wave 22 (DEC-230 §2, DEC-231, REQ-ADM-022, STORY-ADM-010) — a venue names the company that owns it.
--
-- ★ THIS ANSWERS 0081's OBJECTION, IT DOES NOT IGNORE IT. 0081's header (a) rejected `venues.company_id` by name:
-- «a venue is often reused by many different hosting companies over time», and so put the host on the session
-- (`sessions.host_company_id`). That read «hosting» as WHOSE SESSION THIS IS, which varies. The owner means WHOSE
-- BUILDING THIS IS, which does not: a presenter from company A in a meeting room owned by company B earns A the
-- presenting rule and B the hosting rule, and a venue owned by no company rewards no company (DEC-230 §2). Ownership
-- is a property of the place, so the column belongs on the place.
--
-- ★ NULLABLE, AND NULL IS FINAL, NOT MISSING. A venue owned by nobody — a hotel hall, a public library — names no
-- company, and the hosting rule awards nothing for it BY RULE (REQ-PTS-016). There is no backfill: the owner sets
-- each existing venue's company on SCR-046 before the rule's first evaluation after the merge (DEC-230 §2.4).
--
-- ★ `sessions.host_company_id` IS SUPERSEDED AND NOT DROPPED (DEC-230 §2.3). It stays on disk, live on production;
-- after wave 22 no rule and no screen reads it. Dropping it is a later wave's, when it can be done safely.
--
-- The same-org guard is 0081's `sessions_host_company_same_org()` in shape: a definer trigger that refuses a company
-- of another org with 23514, for every writer — the screen, a direct admin write under `p2_admin_update` (0004),
-- and the owner's own scoped statement.
--
-- Grants: none new. 0004 grants `select, insert, update` on `public.venues` to `authenticated` at table level, so the
-- new column is already in the set an admin's write may touch; `p2_admin_insert` / `p2_admin_update` stay the
-- row-level gate (invariant 6 holds: no new policy, so no new grant).
--
-- Additive for `main`, which runs this schema before it runs the code (push precedes merge): `main` never selects or
-- writes the column, and the trigger fires only when it is written. Nothing moves.
--
-- 03 §8.2 rows this migration adds:
--   POL-venues.company_id.admin      — an admin of the org sets and clears it; a member and a moderator cannot.
--   POL-venues.company_id.same_org   — a company of another org is refused with 23514, for the admin and the owner.
--   POL-venues.company_id.null       — every existing venue starts with none.

alter table public.venues add column company_id uuid references public.companies(id);

create index venues_company_id_idx on public.venues (company_id) where company_id is not null;

create function public.venues_company_same_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.company_id is not null and not exists (
    select 1 from public.companies c where c.id = new.company_id and c.org_id = new.org_id
  ) then
    raise exception 'venues.company_id must belong to the venue''s own org' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger venues_company_same_org before insert or update of company_id, org_id on public.venues
  for each row execute function public.venues_company_same_org();

comment on column public.venues.company_id is
  'The company that owns this place (REQ-ADM-022). Null: owned by no company, which hosts for nobody (REQ-PTS-016). Supersedes sessions.host_company_id (DEC-230 §2).';
