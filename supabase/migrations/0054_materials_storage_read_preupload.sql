-- promoted by the lead at wave-2 sync 13 · content, follow-up — a real bug found by tests/e2e/proposal-materials.spec.ts
-- (and equally true for ordinary session uploads, never previously exercised
-- end to end through a browser): `completeMaterialUpload()` downloads the
-- object THROUGH THE UPLOADER'S OWN RLS-BOUND CLIENT before calling
-- `finalize_material_upload()` — but `materials_storage_read` (0037,
-- amended 0053) only ever grants read through a join to `material_versions`,
-- and that row does not exist until `finalize_material_upload()` creates it.
-- Every upload's own "complete" step was therefore downloading an object
-- its own uploader had no read policy for — `{"error":"upload_failed"}`,
-- confirmed against real local Supabase, not a mocked path.
--
-- The fix mirrors `materials_storage_write`'s own shape exactly: that
-- policy already grants write by checking segment [2]/[3]
-- (`sessions`/`{session_id}` or `proposals`/`{proposal_id}`) against
-- `is_presenter_of()`/`is_proposal_owner_of()`/`is_staff()`, with no join
-- to any row at all — because at upload time, no `material_versions` row
-- can exist yet either. Adding the identical check as a READ branch closes
-- exactly the same gap for exactly the same actors: whoever could just
-- write the object can read it back immediately afterward, for the brief
-- window before `finalize_material_upload()` creates the version row and
-- the ordinary phase/`allow_download`-gated branches take over. This
-- widens nothing for anyone else — an ordinary member was never granted
-- read via `material_versions` matching anyway, since matching requires a
-- version that (for everyone but the uploader/staff) is already phase- and
-- allow_download-gated once it exists.
--
-- Serves:  REQ-MAT-001, REQ-MAT-012, REQ-PRO-004 (the flow every upload
--          actually goes through, not previously proven end to end)
-- Cites:   0037/0053 (materials_storage_read, materials_storage_write)
--
-- 03 §8.2 row this adds:
--   | `POL-storage.materials.preupload_self_read` | Before a material's
--     `material_versions` row exists, only whoever `materials_storage_write`
--     would have let write to that exact prefix — the session's presenter,
--     the proposal's owner, or staff — can read the object back; nobody
--     else, and the ordinary phase/`allow_download` branches are
--     unaffected once the version row exists. |
drop policy "materials_storage_read" on storage.objects;
create policy "materials_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (
      exists (
        select 1 from public.material_versions mv
          join public.materials m on m.id = mv.material_id
          left join public.sessions s on s.id = m.session_id
         where mv.id = nullif((storage.foldername(name))[5], '')::uuid
           and m.removed_at is null
           and (
             (m.session_id is not null and (m.phase = 'before' or s.state in ('completed', 'archived') or public.is_presenter_of(m.session_id)))
             or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
             or public.is_staff()
           )
           and (
             m.allow_download
             or (m.session_id is not null and public.is_presenter_of(m.session_id))
             or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
             or public.is_staff()
           )
      )
      or (
        -- Pre-finalize window: the same authority materials_storage_write
        -- already granted this exact prefix, with no version row to join.
        (storage.foldername(name))[2] = 'sessions'
        and (public.is_presenter_of(nullif((storage.foldername(name))[3], '')::uuid) or public.is_staff())
      )
      or (
        (storage.foldername(name))[2] = 'proposals'
        and (public.is_proposal_owner_of(nullif((storage.foldername(name))[3], '')::uuid) or public.is_staff())
      )
    )
  );
