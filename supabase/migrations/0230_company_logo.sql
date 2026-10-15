-- 0230 — a company's logo (DEC-298, reversing DEC-195 §4 by the owner's ruling of 2026-10-15).
--
-- Serves: REQ-ADM-008 (an admin manages companies), REQ-LDR-004 (the company board), REQ-UIX-079 (SCR-028),
--         REQ-NFR-001 · DEC-009 (raster only, sniffed on content) · invariant 7 (no service_role on Vercel).
--
-- WHAT. `companies.logo_asset_id` names a `design_assets` row — the same shape the brand kit's logo uses
-- (`brand_kits.logo_asset_id`, 0037): the upload route already sniffs the bytes and refuses anything that is not a
-- PNG, a JPEG or a WebP (DEC-009 — no SVG, anywhere). Nullable: a company with no logo draws its team colour and its
-- initial, exactly as before.
--
-- ★ THE RING STAYS THE RING. A member's avatar is still ringed by the company's colour and never shows the logo
-- (REQ-PRF-009). The logo is drawn where the COMPANY is the subject: SCR-028's podium and rows, and SCR-048.
--
-- WHO READS THE BYTES. `design-assets` is admin-only (`design_assets_storage_read`, 0037). A member must see the logo
-- on the board, so a second, additive policy admits a signed-in member of the SAME org to exactly the object one of
-- that org's companies names — `0126`'s shape for the mail logo, scoped to the org instead of opened to `anon`. The
-- handler (`/api/companies/{id}/logo`) reads the object as the viewer and proxies it; nothing is signed and no
-- `service_role` is near it.
--   · A replaced or cleared logo closes the old object at once: the predicate reads `companies` per request.
--   · Another org's member, and `anon`, are refused. Every other design asset stays admin-only.
--
-- ★ SAME ORG, BY THE DATABASE. A foreign key alone would let an admin name another org's asset id; the guard refuses
-- it (23514), and the read predicate joins on the org too, so such a row could never be served even if it existed.
--
-- AUDIT. `company.logo_changed`, beside `0161`'s `company.team_color_changed`; `0181`'s `company.changed` reads `name`
-- only, so nothing is written twice.
--
-- ADDITIVE: one nullable column, two triggers, two functions, one policy. `main`'s app names its columns
-- (`select id, name, deactivated_at, team_color`), and `main`'s worker never reads `companies`. In the gap, nothing moves.
--
-- 03 §8.2 rows:
--   | `POL-storage.design_assets.company_logo` | A signed-in member reads exactly the object a company of THEIR org names as its logo. Refused: any other design asset of the org; a logo since replaced or cleared; another org's member; `anon`. |
--   | `RPC-company_logo.same_org` | Returns the storage path and the sniffed type of a company's logo for a member of that company's org, or no row. Not executable by `anon`. |
--   | `TRG-companies.logo_same_org` | A company's logo must be its own org's design asset (23514 otherwise). |
--   | `TRG-companies.logo_audit` | Changing or clearing a logo writes `company.logo_changed`. |

alter table public.companies
  add column logo_asset_id uuid references public.design_assets (id) on delete set null;

comment on column public.companies.logo_asset_id is
  'The company''s logo: a design_assets row of the SAME org (raster only, DEC-009), or null. Drawn on SCR-028 and SCR-048 — never on a member''s avatar, which keeps the team-colour ring (DEC-298).';

-- The guard. Definer, because the check must see the asset whatever the writer may select.
create function public.companies_logo_same_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.logo_asset_id is not null and not exists (
    select 1 from public.design_assets a where a.id = new.logo_asset_id and a.org_id = new.org_id
  ) then
    raise exception 'a company''s logo must be an asset of its own org' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger companies_logo_same_org
  before insert or update of logo_asset_id on public.companies
  for each row execute function public.companies_logo_same_org();

create function public.companies_logo_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.write_audit(
    new.org_id, 'company.logo_changed', 'company', new.id,
    jsonb_build_object('logoAssetId', old.logo_asset_id),
    jsonb_build_object('logoAssetId', new.logo_asset_id)
  );
  return new;
end $$;

create trigger companies_logo_audit
  after update on public.companies
  for each row
  when (old.logo_asset_id is distinct from new.logo_asset_id)
  execute function public.companies_logo_audit();

-- The storage policy's predicate — a definer for `0126`'s reason: a policy expression runs as the caller, and a
-- member has no select on `design_assets`, so an inline subquery would see nothing.
create function public.company_logo_is_visible(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.companies c
      join public.design_assets a on a.id = c.logo_asset_id and a.org_id = c.org_id
     where a.storage_path = p_name
       and c.org_id = public.auth_org_id()
  )
$$;

revoke execute on function public.company_logo_is_visible(text) from public;
grant  execute on function public.company_logo_is_visible(text) to authenticated;

-- What the handler asks: «which object, and what is it?» — for a company of the caller's own org only.
create function public.company_logo(p_company uuid)
returns table (storage_path text, content_type text)
language sql stable security definer set search_path = '' as $$
  select a.storage_path, a.sniffed_mime
    from public.companies c
    join public.design_assets a on a.id = c.logo_asset_id and a.org_id = c.org_id
   where c.id = p_company
     and c.org_id = public.auth_org_id()
$$;

revoke execute on function public.company_logo(uuid) from public;
grant  execute on function public.company_logo(uuid) to authenticated;

create policy "design_assets_storage_read_company_logo" on storage.objects for select to authenticated
  using (bucket_id = 'design-assets' and public.company_logo_is_visible(name));
