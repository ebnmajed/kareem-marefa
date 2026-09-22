-- 0153 · wave 13, row L3 (DEC-178) — a member stops reading another member's
-- certificate PDF through Storage.
--
-- ★ A live defect, found by `designer`'s probe at sync 1 and verified in a
-- rolled-back transaction: `exports_storage_read` (0037:674) is
-- `bucket_id = 'exports' and first segment = auth_org_id()` — no member
-- conjunct, because 0037 treated everything in the bucket as the org's own
-- posters. But certificates live there too (`{org}/exports/{document}/
-- cert_landscape.pdf`), and Storage's list runs as the caller, so any member
-- could list every certificate in the org and `createSignedUrl()` any of them.
-- The TABLES never leaked (`documents_read`, 0055:614, shows a certificate's
-- document to an admin or its own member); Storage did.
--
-- The fix is one RESTRICTIVE select policy, so it can only narrow: a render of
-- a certificate's document is readable by staff of that org, or by that
-- certificate's own member once it is released (`held` is invisible,
-- REQ-CRT-013; `revoked` stays readable to its member, REQ-CRT-011). It keys
-- on the path's document segment, not on `export_artifacts`, so an orphaned
-- object with no artifact row is covered too. Everything else in the bucket —
-- a session's poster (DEC-173), the public card's `og` (0080, `anon`'s door) —
-- passes through untouched. The worker writes as `service_role`, which
-- bypasses RLS.
--
-- The predicate is SECURITY DEFINER because it must read `certificates` and
-- `design_documents` rows the caller cannot see — the whole point is to refuse
-- a certificate the caller has no row for.
--
-- Serves:  REQ-NFR-001, REQ-CRT-013, REQ-ADM-021 (the download is its owner's)
-- Cites:   0037 (exports_storage_read), 0055, 0080, 0145 (DEC-173)
--
-- 03 §8.2 row this adds (tests/rls/session-downloads-storage.test.ts):
--   | `POL-storage.objects.exports_certificate_restricted` | Another member lists no certificate PDF; its member (released), admin and moderator do; its member while held does not; an orphaned object is covered by its path; a session poster stays readable by a member; another org reads neither. |

create function public.export_object_is_foreign_certificate(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.design_documents d
      join public.certificates c on c.id = d.bound_certificate_id
     where split_part(p_name, '/', 2) = 'exports'
       and d.id::text = split_part(p_name, '/', 3)
       and not (c.org_id = public.auth_org_id() and public.is_staff())
       and not (c.member_id = public.auth_member_id() and c.state <> 'held')
  )
$$;

revoke execute on function public.export_object_is_foreign_certificate(text) from public, anon;
grant  execute on function public.export_object_is_foreign_certificate(text) to authenticated;

create policy "exports_storage_certificate_restricted" on storage.objects
  as restrictive for select to authenticated
  using (bucket_id <> 'exports' or not public.export_object_is_foreign_certificate(name));
