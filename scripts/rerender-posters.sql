-- scripts/rerender-posters.sql — the one-off re-render after wave 24 (M26, DEC-242).
--
-- ★★ IT IS A ONE-OFF, NOT A MIGRATION, AND THAT IS DELIBERATE (`CLAUDE.md` rule 3, DEC-242 §3
-- ruling 3). A migration that enqueued a batch of Chromium renders would run in every environment
-- for ever and would put that load on the worker during a deploy, unannounced. The owner runs this
-- when they choose the load.
--
-- ★ WHY IT IS NEEDED. `0192` moved the platform palette and `0193` replaced the eleven baseline
-- documents, so every FUTURE render carries the new design. An artifact already exported keeps the
-- old one until its session changes: the brand is composed into the fingerprint before the render,
-- so nothing existing is invalidated — it is simply not re-rendered.
--
-- ★ WHAT IT DOES NOT TOUCH. Only `binding = 'live'` posters, which is the same predicate
-- `save_brand_kit()` and `reset_brand_kit()` already fan out over (`0071`). **A customised poster
-- is left exactly alone** (`DEC-012`, `REQ-DSG-003`) — an admin who adjusted their poster in the
-- designer does not get it silently replaced by a rebuilt template.
--
-- ★ It is idempotent in the way that matters: `enqueue_job`'s key is `poster:{session_id}`, so
-- running it twice does not queue a session twice.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — READ BEFORE YOU WRITE (`CLAUDE.md`, "Running SQL against production").
-- Run this alone first and look at the number. It is how many render jobs step 2 will queue.
-- ═══════════════════════════════════════════════════════════════════════════

select count(*) filter (where sp.binding = 'live')  as will_rerender,
       count(*) filter (where sp.binding <> 'live') as customised_left_alone
  from public.session_posters sp;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — ENQUEUE. Run only after step 1's number looks right.
--
-- ★ If this raises `42501`, the login role lacks EXECUTE on `enqueue_job()`, which is granted to
-- `service_role` alone (`0025:68-69`). That is a refusal to respect, not to work around: tell the
-- lead rather than granting anything or writing to `graphile_worker` by hand — jobs are enqueued
-- through `public.enqueue_job()` and through nothing else.
-- ═══════════════════════════════════════════════════════════════════════════

-- ★ Written as a plain SELECT rather than a `do $$ … $$` block ON PURPOSE: `$$` is expanded by zsh
-- and bash inside double quotes, so a DO block pasted into `supabase db query --linked "…"` does
-- not survive the shell. This form has no `$` in it at all.
--
-- It calls `enqueue_job()` once per live poster and returns one job id per row, so the row count
-- you get back IS the number of renders queued.

select public.enqueue_job(
         'regenerate_poster',
         jsonb_build_object('session_id', sp.session_id),
         'poster:' || sp.session_id::text,
         null,
         'render',
         3
       ) as job_id,
       sp.session_id
  from public.session_posters sp
 where sp.binding = 'live';
