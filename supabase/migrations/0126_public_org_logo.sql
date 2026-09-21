-- 0126 — an active org's logo, readable with no session: for a mail client.
--
-- Serves: REQ-NTF-014 («changing the org logo restyles every message»),
--         REQ-DSG-021 (the brand kit drives every consumer), REQ-NFR-001 ·
--         DEC-052 (the brand kit's four consumers — mail is the third),
--         DEC-066 / `0080` (the shape this copies), DEC-161 (contract 9, ruled).
-- Author: the lead, as custodian of `branding` (row L10).
--
-- WHY. A mail client fetches an image with no session and no cookie, often
-- months after the mail was sent. `design-assets` is private and every URL the
-- app mints for it is a five-minute signature — a broken image by the time
-- anyone opens the mail, by design. The product has exactly one precedent for
-- bytes leaving a private bucket to a stranger, and it is the right one:
-- `/api/s/{id}/og` (`0080`) — a POLICY admitting `anon` to exactly one kind of
-- object, a handler that reads it as whoever asked, no signature and no
-- `service_role` on Vercel (invariant 7). This is that, for one more object.
--
-- ★ NOT a CID attachment (DEC-161): an attachment on every mail costs size and
-- deliverability and needs multipart/related in two transports.
--
-- WHAT IS OPENED. For an org whose `status = 'active'`: the ONE object its
-- `brand_kits.logo_asset_id` names, and only while it is a PNG or a JPEG.
--   · A WebP logo stays closed, on purpose: Outlook's Word engine draws no
--     WebP, so a mail would carry a broken image for exactly the client the
--     studio's «أرسل اختبارًا» exists to test. With no public logo a design
--     renders the org's NAME as a heading — every design is correct with no
--     image at all (`notify`'s rule, DEC-161).
--   · The moment an org changes or clears its logo, the OLD object is closed
--     again: the predicate reads the brand kit per request, exactly as the
--     public card's reads the session's state.
-- WHAT IS NOT. Every other design asset of every org — poster images,
-- certificate signatures and seals, uploaded photographs — stays refused to
-- `anon`. A suspended org's logo is refused. `design_assets_storage_read`
-- (`0055`, `to authenticated`, org-prefixed) is untouched; this is a second,
-- additive policy for one shape.
--
-- ENUMERATION, stated rather than hidden (as `0080` states it): `anon` holding
-- a select policy on `storage.objects` can LIST what it matches. The paths are
-- `{org_id}/design/assets/{asset_id}.{ext}` — two opaque uuids naming an org
-- that has a logo, and the bytes are a logo that org sends to every inbox.
--
-- A LOGO IS NOT A SECRET, AND THIS IS STILL NARROW. It is printed on posters,
-- sent in mail and shown to every member. What would be wrong is opening the
-- bucket, or any asset that is not the one the org itself chose to be its face.
--
-- ADDITIVE: two new functions and one new policy. Nothing `main` reads changes.
--
-- 03 §8.2 rows:
--   | `POL-storage.design_assets.public_logo` | `anon` reads exactly the object an ACTIVE org's `brand_kits.logo_asset_id` names, while it is PNG or JPEG. Refused: any other design asset of the same org; the same org's logo while it is WebP; a suspended org's logo; a logo the org has since replaced or cleared. A signed-in member of ANOTHER org sees what a stranger sees. |
--   | `RPC-org_public_logo.path_only` | Returns the storage path and content type of that one object, or no row — for `anon`, `authenticated` and the worker. It reveals nothing a caller could not learn by fetching the object. |
--   | `RPC-definer.anon_allowlist` | The `anon`-executable definer functions are exactly the documented eight (six + these two). |

-- The storage policy's predicate. A SECURITY DEFINER function and not an inline
-- subquery, for `0080`'s reason: a policy expression is evaluated as the
-- CALLER, and `anon` has no policy on `brand_kits`, `design_assets` or `orgs`,
-- so an inline subquery would see nothing and deny everything.
create function public.brand_logo_is_public(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.brand_kits bk
      join public.design_assets a on a.id = bk.logo_asset_id and a.org_id = bk.org_id
      join public.orgs o          on o.id = bk.org_id and o.status = 'active'
     where a.storage_path = p_name
       and a.sniffed_mime in ('image/png', 'image/jpeg')
  )
$$;

revoke execute on function public.brand_logo_is_public(text) from public;
grant  execute on function public.brand_logo_is_public(text) to anon, authenticated;

-- What the handler and the worker ask: «which object, and what is it?».
-- `service_role` too: the mail renderer decides between a logo band and the
-- org's name by whether this returns a row.
create function public.org_public_logo(p_org uuid)
returns table (storage_path text, content_type text)
language sql stable security definer set search_path = '' as $$
  select a.storage_path, a.sniffed_mime
    from public.brand_kits bk
    join public.design_assets a on a.id = bk.logo_asset_id and a.org_id = bk.org_id
    join public.orgs o          on o.id = bk.org_id and o.status = 'active'
   where bk.org_id = p_org
     and a.sniffed_mime in ('image/png', 'image/jpeg')
$$;

revoke execute on function public.org_public_logo(uuid) from public;
grant  execute on function public.org_public_logo(uuid) to anon, authenticated, service_role;

-- `anon, authenticated`, as `0080`: the handler reads the object as WHOEVER
-- asked, and signing in must never show a person less than signing out would.
create policy "design_assets_storage_read_public_logo" on storage.objects for select to anon, authenticated
  using (bucket_id = 'design-assets' and public.brand_logo_is_public(name));
