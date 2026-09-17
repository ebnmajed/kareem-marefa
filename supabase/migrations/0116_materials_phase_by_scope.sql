-- content, wave 9 (DEC-119, DEC-120, DEC-121, DEC-150) — T3: `materials.phase` is relative to the
-- SCOPE. Today `materials_read` and its four dependants release a «بعد الجلسة» material when the
-- SESSION reaches `completed`/`archived` — on a three-day workshop, day 1's slides would stay
-- withheld until Friday. This adds ONE new release condition beside the existing one, in all FIVE
-- places it is duplicated; nothing already true is made false.
-- Promoted by the lead from supabase/proposed/content/0002_materials_phase_by_scope.sql.
--
-- ★ THE RULING (DEC-151, sync 1): a day-scoped «بعد» material releases when EITHER its OWN day has
-- ended OR the SESSION has completed/archived — not "OR" replaced by a scope-conditional branch.
-- Without the session half, a workshop completed early on day 2 (REQ-SES-005's early completion)
-- would keep day 3's «بعد» material hidden until a day that never happens ends. So the live
-- session-state clause is left EXACTLY as it reads today in every one of the five policies (it
-- already covers every row, scoped or not) and the new day-ended clause is added beside it, never
-- replacing it.
--
-- Session-scoped «بعد» needs no new clause anywhere: `sessions.ends_at` is now the LAST day's end
-- (0100, the lead's own trigger), so the existing clock job that flips a session to `completed`
-- already fires at the right moment for a multi-day session — this file changes nothing about that
-- path.
--
-- ★★ FOUND WHILE PROVING THIS FILE (not guessed, not assumed) — the phase gate is duplicated FIVE
-- TIMES, not two. `materials_read`'s own comment ("this component never adds its own phase
-- filter") only holds if every table a viewer's read actually touches enforces the SAME gate.
-- `getViewerData()` (materials.ts) reads `material_versions` for the current version and
-- `material_pages` for the rendered pages; the viewer's page IMAGES live in the `material-pages`
-- storage bucket. All three carry their OWN copy of the phase-gate condition, written once in 0037
-- and NEVER touched again (not even by 0053's proposal branch — confirmed by grep: `materials_read`
-- is the only policy name 0053 mentions). Proven the hard way: `materials_read` and the `materials`
-- storage twin alone made a day-scoped «بعد» material's ROW and SOURCE FILE visible once its day
-- ended, but `material_versions_read`'s own, unmodified INNER JOIN to `sessions` still applied the
-- OLD gate to the version row itself — so a query that reaches the version through
-- `material_versions` (which the viewer's `current_version_id` lookup and the page images both do)
-- found nothing, even though the material and its file were both already visible. A row readable
-- whose dependants are not is wave 2's 0054 bug again, three more times over. So this file amends
-- FIVE policies, all with the identical one-clause addition: `materials_read`, `materials_storage_
-- read` (both as planned), plus `material_versions_read`, `material_pages_read`,
-- `material_pages_storage_read` (found during this file's own RLS proof, `tests/rls/storage-
-- content-days.test.ts`, debugged with a temporary column dump before the fix — the query returned
-- rows once the version/page policies were fixed).
--
-- ★ A separate, PRE-EXISTING, DAY-UNRELATED gap found on the way and deliberately NOT fixed here:
-- `material_versions_read`/`material_pages_read`/`material_pages_storage_read` INNER JOIN `sessions`
-- unconditionally, so a proposal's own material (`session_id is null`) can never satisfy any of the
-- three — a proposal owner can see their draft material's ROW (`materials_read` has the proposal
-- branch, 0053) but not its version metadata or its rendered pages. This predates DEC-121 by two
-- migrations and is out of this wave's scope (multi-day, not proposals); flagged to the lead rather
-- than silently widened into. The day-scope clause added below does not touch this — the existing
-- `join public.sessions s` stays an INNER join in all three, exactly as it reads today.
--
-- `03-permissions-rls.md` §5.5a is stale even before this file (it was never updated for 0053's
-- proposal branch, nor do §5.5a/§6 mention `material_versions_read`/`material_pages_read`/
-- `material_pages_storage_read` at all); flagged to the lead as a promotion-time fix, not something
-- this file touches.
--
-- Serves:  REQ-MAT-006 (as amended by DEC-121), REQ-MAT-003 (the viewer this closes the gap for)
-- Cites:   0037 (all five policies' original text), 0053 (the `materials_read`/storage proposal
--          branch, live and UNTOUCHED by this file), 0054 (materials_storage_read's pre-upload
--          branch, live and UNTOUCHED), 0100 (session_days, materials.session_day_id)
--
-- 03 §8.2 rows this adds:
--   | `POL-materials.day_scoped_after_release` | A day-scoped «بعد» material is visible once ITS OWN DAY has ended, even if the session as a whole has not yet completed. |
--   | `POL-materials.day_scoped_after_release_on_early_completion` | A day-scoped «بعد» material is ALSO visible once the session reaches `completed`/`archived`, whether or not its own day has ended — an early completion never leaves it hidden forever. |
--   | `POL-storage.materials.day_scoped_after_release` | The storage twin releases the same object at the same two moments. |
--   | `POL-material_versions.day_scoped_after_release` | The version row a released day-scoped material's `current_version_id` points at is readable the same two moments — otherwise `getViewerData()` finds a material but no version. |
--   | `POL-material_pages.day_scoped_after_release` | A released day-scoped material's rendered page rows are readable the same two moments. |
--   | `POL-storage.material_pages.day_scoped_after_release` | The page-image objects in the `material-pages` bucket are readable the same two moments — otherwise the viewer shows a page count with no images. |

-- ── table policy — the one new OR-branch ────────────────────────────────────
drop policy "materials_read" on public.materials;
create policy "materials_read" on public.materials for select to authenticated       -- 03 §5.5a, amended (DEC-121)
  using (org_id = public.auth_org_id()
         and removed_at is null
         and (
           (session_id is not null and (
             phase = 'before'
             or exists (select 1 from public.sessions s
                         where s.id = materials.session_id
                           and s.state in ('completed', 'archived'))
             or (
               session_day_id is not null
               and exists (select 1 from public.session_days d
                           where d.id = materials.session_day_id and d.ends_at <= now())
             )
             or public.is_presenter_of(session_id)
           ))
           or (proposal_id is not null and public.is_proposal_owner_of(proposal_id))
           or public.is_staff()
         ));

-- ── storage twin — the same new branch, joined via session_day_id ──────────
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
          left join public.session_days d on d.id = m.session_day_id
         where mv.id = nullif((storage.foldername(name))[5], '')::uuid
           and m.removed_at is null
           and (
             (m.session_id is not null and (
               m.phase = 'before'
               or s.state in ('completed', 'archived')
               or (m.session_day_id is not null and d.ends_at <= now())
               or public.is_presenter_of(m.session_id)
             ))
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
      or ((storage.foldername(name))[2] = 'sessions' and (public.is_presenter_of(nullif((storage.foldername(name))[3], '')::uuid) or public.is_staff()))
      or ((storage.foldername(name))[2] = 'proposals' and (public.is_proposal_owner_of(nullif((storage.foldername(name))[3], '')::uuid) or public.is_staff()))
    )
  );

-- ── material_versions — the same one clause, INNER JOIN to sessions kept exactly as today
-- (the pre-existing proposal gap above is not touched) ──────────────────────
drop policy "material_versions_read" on public.material_versions;
create policy "material_versions_read" on public.material_versions for select to authenticated
  using (org_id = public.auth_org_id() and exists (
    select 1 from public.materials m
      join public.sessions s on s.id = m.session_id
      left join public.session_days d on d.id = m.session_day_id
     where m.id = material_versions.material_id
       and m.removed_at is null
       and (m.phase = 'before' or s.state in ('completed', 'archived')
            or (m.session_day_id is not null and d.ends_at <= now())
            or public.is_presenter_of(m.session_id) or public.is_staff())
  ));

-- ── material_pages — same clause ────────────────────────────────────────────
drop policy "material_pages_read" on public.material_pages;
create policy "material_pages_read" on public.material_pages for select to authenticated
  using (org_id = public.auth_org_id() and exists (
    select 1 from public.material_versions mv
      join public.materials m on m.id = mv.material_id
      join public.sessions  s on s.id = m.session_id
      left join public.session_days d on d.id = m.session_day_id
     where mv.id = material_pages.material_version_id
       and m.removed_at is null
       and (m.phase = 'before' or s.state in ('completed', 'archived')
            or (m.session_day_id is not null and d.ends_at <= now())
            or public.is_presenter_of(m.session_id) or public.is_staff())
  ));

-- ── material-pages storage bucket — same clause ─────────────────────────────
drop policy "material_pages_storage_read" on storage.objects;
create policy "material_pages_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'material-pages'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and exists (
      select 1 from public.material_versions mv
        join public.materials m on m.id = mv.material_id
        join public.sessions  s on s.id = m.session_id
        left join public.session_days d on d.id = m.session_day_id
       where mv.id = nullif((storage.foldername(name))[5], '')::uuid
         and m.removed_at is null
         and (m.phase = 'before' or s.state in ('completed', 'archived')
              or (m.session_day_id is not null and d.ends_at <= now())
              or public.is_presenter_of(m.session_id) or public.is_staff())
    )
  );
