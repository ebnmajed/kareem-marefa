-- content, wave 10 (DEC-155, DEC-160 §6) — T1: a proposal's own material. `materials_read` and its
-- storage twin `materials_storage_read` have carried a proposal branch since 0053 and are already
-- correct — not touched here. `material_versions_read`, `material_pages_read` and the page-image
-- bucket's `material_pages_storage_read` (all 0037, day-scope clause added by 0116) still `INNER
-- JOIN sessions` — so a material whose `session_id is null` (a draft attached to a proposal) never
-- satisfies any of the three, `is_staff()` included, because `is_staff()` sits INSIDE the joined
-- existence check in all three today, not at the top level the way `materials_read` already has it.
--
-- The visible defect (found at wave 9 sync 2, DEC-155, deliberately not fixed there — it predates
-- multi-day sessions by two migrations and is a proposals question, not a days one): the row and its
-- source file ARE readable to the proposal's owner and to staff (`materials_read`/`materials_storage_
-- read`'s proposal branch), but `getMaterialDownloadUrl()` (materials.ts) reads `material_versions`
-- under RLS first and gets nothing back — so an admin reviewing a proposal cannot open the file the
-- proposer attached, the exact case REQ-PRO-004 names ("visible to admins").
--
-- The fix is the same one-clause shape all three times, matching the ALREADY-correct `materials_
-- storage_read` (0053) rather than inventing a new shape: `join sessions` becomes `left join
-- sessions` (a null `session_id` must not eliminate the row before `where` runs), the existing
-- session-shaped clause is wrapped in `m.session_id is not null and (...)`, a new `or (m.proposal_id
-- is not null and is_proposal_owner_of(m.proposal_id))` is added, and `is_staff()` is pulled to the
-- top level. `materials_read`/`materials_storage_read` are untouched.
--
-- `material_pages_read`/`material_pages_storage_read`'s new branch is provably unreachable in
-- practice: `finalize_material_upload()` (0053) never enqueues page rendering while `session_id is
-- null`, and `carry_over_proposal_materials()` (0053) — the only place that ever sets `session_id` on
-- such a material — clears `proposal_id` in the SAME statement. So the moment any `material_pages`
-- row could exist, `proposal_id` is already null. Added anyway, in the same shape as `material_
-- versions_read`, for the reason 0116's own header gives for never conditioning the session-state
-- clause on scope: three policies that read as one gate is a single invariant; two that read as the
-- gate and a third with a silent carve-out is a standing trap for whoever next adds a feature that
-- needs a proposal's page before carry-over and copies "the" policy from the wrong one of the three.
-- `tests/rls/materials-proposal-versions.test.ts` proves the branch's SHAPE against a synthetic page
-- row (one no real upload path can ever produce), not merely that today's table happens to be empty.
--
-- Serves:  REQ-PRO-004 ("visible to admins"), REQ-MAT-006 (the viewer/download path this closes for
--          a proposal's own material)
-- Cites:   0037 (material_versions_read/material_pages_read/material_pages_storage_read, original
--          text), 0053 (is_proposal_owner_of, materials_read's and materials_storage_read's own
--          proposal branch — the shape this file copies), 0116 (the day-scope clause, left exactly
--          as it reads today)
--
-- 03 §8.2 rows this adds:
--   | `POL-material_versions.proposal` | The version row of a proposal's own material is readable by
--     its proposer, an accepted co-presenter, and staff — never a plain member — the same audience
--     `materials_read`'s proposal branch already admits at the row. |
--   | `POL-material_pages.proposal` | Same audience, for a proposal-owned material's page rows — in
--     practice always empty, since no page is ever rendered before carry-over. |
--   | `POL-storage.material_pages.proposal` | The page-image bucket's own copy of the same rule. |

-- ── material_versions — add the proposal branch, LEFT JOIN sessions, is_staff() at the top ────────
drop policy "material_versions_read" on public.material_versions;
create policy "material_versions_read" on public.material_versions for select to authenticated
  using (org_id = public.auth_org_id() and exists (
    select 1 from public.materials m
      left join public.sessions s on s.id = m.session_id
      left join public.session_days d on d.id = m.session_day_id
     where m.id = material_versions.material_id
       and m.removed_at is null
       and (
         (m.session_id is not null and (
           m.phase = 'before' or s.state in ('completed', 'archived')
           or (m.session_day_id is not null and d.ends_at <= now())
           or public.is_presenter_of(m.session_id)
         ))
         or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
         or public.is_staff()
       )
  ));

-- ── material_pages — identical shape, one extra join hop (mv → m) ──────────────────────────────────
drop policy "material_pages_read" on public.material_pages;
create policy "material_pages_read" on public.material_pages for select to authenticated
  using (org_id = public.auth_org_id() and exists (
    select 1 from public.material_versions mv
      join public.materials m on m.id = mv.material_id
      left join public.sessions  s on s.id = m.session_id
      left join public.session_days d on d.id = m.session_day_id
     where mv.id = material_pages.material_version_id
       and m.removed_at is null
       and (
         (m.session_id is not null and (
           m.phase = 'before' or s.state in ('completed', 'archived')
           or (m.session_day_id is not null and d.ends_at <= now())
           or public.is_presenter_of(m.session_id)
         ))
         or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
         or public.is_staff()
       )
  ));

-- ── material-pages storage bucket — same shape again ────────────────────────────────────────────────
drop policy "material_pages_storage_read" on storage.objects;
create policy "material_pages_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'material-pages'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and exists (
      select 1 from public.material_versions mv
        join public.materials m on m.id = mv.material_id
        left join public.sessions  s on s.id = m.session_id
        left join public.session_days d on d.id = m.session_day_id
       where mv.id = nullif((storage.foldername(name))[5], '')::uuid
         and m.removed_at is null
         and (
           (m.session_id is not null and (
             m.phase = 'before' or s.state in ('completed', 'archived')
             or (m.session_day_id is not null and d.ends_at <= now())
             or public.is_presenter_of(m.session_id)
           ))
           or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
           or public.is_staff()
         )
    )
  );
