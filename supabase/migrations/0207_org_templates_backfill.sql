-- designer (wave 27, M29) — the backfill: every org that existed before 0008's trigger receives the baseline as its
-- own rows. The third and last part of M1; it follows 0007 (the seed) and 0008 (the trigger and the guard).
--
-- Serves:  REQ-DSG-035 — «every مؤسسة that existed before this requirement holds the same set»
-- Cites:   DEC-254 §3.3 (the backfill is in the FIRST migration, before any platform row is touched) · DEC-255
--
-- 03 §8.2 ROWS: none of its own — `RPC-seed_org_templates.*` (0007) and `TRG-orgs_seed_templates` (0008) cover it.
--
-- ★ A SEPARATE FILE, so a test can apply 0007 and 0008 inside a rolled-back transaction without seeding every org
-- a local database has accumulated. The lead promotes the three as one migration, in this order.
--
-- ★ IT REPORTS, one notice per org with what it inserted — eleven for an org that had nothing, zero for one already
-- seeded (the function is idempotent by composition, so a re-run reports zeros). Production, read 2026-10-05: two
-- orgs, no org-scoped template, so the expected notices are two lines of `11`. The lead pastes them into `STATUS.md`.
--
-- ★ AND IT PROVES ITSELF before it ends: if any org still cannot resolve a fallback default, the migration raises and
-- nothing of it is applied. The removal migration raises on the same predicate; this is the same check run first,
-- where a failure costs nothing.

do $$
declare
  v_org     record;
  v_n       integer;
  v_missing text;
begin
  for v_org in select o.id, o.slug from public.orgs o order by o.created_at, o.id loop
    v_n := public.seed_org_templates(v_org.id);
    raise notice 'seed_org_templates % (%) -> %', v_org.slug, v_org.id, v_n;
  end loop;

  select string_agg(o.slug || ':' || m.purpose::text || '/' || m.family, ', ' order by o.slug, m.purpose, m.family)
    into v_missing
    from public.orgs o
    cross join lateral public.org_missing_templates(o.id) m;
  if v_missing is not null then
    raise exception 'org_without_template after the backfill: %', v_missing using errcode = '23514';
  end if;
end $$;
