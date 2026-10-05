-- designer (wave 27, M29) — every org is seeded when it is born, and can never retire its way out of a template
-- the code falls back on. The second part of M1; it follows 0007 (seed_org_templates) and precedes 0009 (the
-- backfill).
--
-- Serves:  REQ-DSG-035 (an organisation owns its templates from the day it is created — and «none was left without
--          a certificate default at any point of the change»), REQ-CRT-015 (one default per kind),
--          REQ-UIX-013 (a refused retire says why)
-- Cites:   DEC-254 §3.1, §3.3 · DEC-255 §5–§6 (the sync-1 rulings: D1 the trigger, D2 one predicate, D6 the guard,
--          D10 the order) · 0027:513-593 (orgs_seed_scoring — the precedent) · 0191 (the org-deletion escape)
--
-- 03 §8.2 ROWS THIS FILE NEEDS:
--   | `RPC-org_template_version` | The org's live template of a (purpose, family) with a published version — default first, then the highest version, then the id. Owner-only. |
--   | `RPC-org_missing_templates` | Every (purpose, family) of the FALLBACK SET — certificate attendance, presenter, achievement; poster talk — for which `org_template_version()` is null. Empty for every seeded org. Owner-only. |
--   | `TRG-orgs_seed_templates` | An org inserted by ANY path — `create_org()`, a fixture, the owner's hand — holds the baseline the moment the insert commits. |
--   | `TRG-design_templates_keep_one_live` | Retiring, deleting or re-familying an org's LAST live published template of a fallback family is refused with `last_live_template` (23514); every other retire is untouched; an org's deletion is not blocked. |
--
-- ★★ WHY A TRIGGER ON `orgs` AND NOT A LINE IN `create_org()` (D1). `create_org()` (0005:340) is not the only way an
-- org row is born: `tests/rls/fixture.ts` inserts orgs directly, so do 161 e2e specs, and the production org was
-- seeded by hand. After the platform library is removed, an org with no template fails EVERY session completion
-- (`issue_certificate()` raises 42704, DEC-254 §1.4). 0027 made the same choice for the scoring catalogue, for the
-- same reason, and its comment says so.
--
-- ★★ ONE PREDICATE, THREE CALLERS (D2). «Does this org resolve every default the code falls back on» is written ONCE,
-- in `org_missing_templates()`. The removal migration's raise calls it before touching a platform row; the guard below
-- calls it after every retire; the tests call it for every fixture org. The FALLBACK SET is the four lookups that lose
-- their platform branch in the removal: `issue_certificate()` (attendance and presenter, 0127:263-271),
-- `issue_achievement_certificate()` (achievement, 0066:84-92) and `poster_render_context()` (talk, 0128:85-95).
--
-- ★ THE GUARD SHIPS WITH THE SEED, NOT WITH THE REMOVAL (the sync-1 proposal). It holds from the first moment an org
-- owns templates. Before the removal the platform row would still catch an org that retired its last one, so the
-- guard is stricter than strictly needed for a few days — and it can refuse nothing an admin has done yet, because
-- until this migration no org owned a fallback template it could have relied on. `main`'s app, before PR C's code,
-- shows the refusal as its generic «not allowed» toast (`templates.ts:415-424` maps every error to `not_authorized`).
--
-- ★ AFTER, NOT BEFORE. The guard is an AFTER row trigger, so `org_missing_templates()` reads the state the change
-- would leave — the retired row already retired — and a raise rolls the statement back. A BEFORE trigger would have
-- to re-implement the lookup with «except this row», a second predicate that could drift from the first.
--
-- ★ `main`'S APP AND WORKER ON THIS SCHEMA (additive): the trigger on `orgs` fires on inserts `main` already makes and
-- adds rows `main` already reads (SCR-055 shows them under «قوالب مؤسستك»; issuance and posters prefer them, 0127:270,
-- 0066:91, 0128:93 — byte-identical documents). The guard refuses one write `main` can make, as above.

-- ═══ 1 · the org's template for a (purpose, family) — the lookup every fallback will use ═══
create or replace function public.org_template_version(
  p_org     uuid,
  p_purpose public.template_purpose,
  p_family  text
) returns uuid
language sql stable security definer set search_path = '' as $fn$
  select v.id
    from public.design_templates t
    join public.design_template_versions v on v.template_id = t.id
   where t.org_id = p_org and t.purpose = p_purpose and t.family = p_family
     and t.retired_at is null
     and v.published_at is not null
   -- D10: the default, then the highest published version, then the id — so two non-default templates at one
   -- version are no longer picked arbitrarily (certificates.ts:437-438 documents today's tie).
   order by t.is_default desc, v.version desc, t.id
   limit 1
$fn$;
revoke execute on function public.org_template_version(uuid, public.template_purpose, text) from public, anon, authenticated, service_role;

comment on function public.org_template_version(uuid, public.template_purpose, text) is
  'DEC-254 §3 — the org''s live published template version for a (purpose, family): default, then version, then id. Owner-only.';

-- ═══ 2 · the predicate — what an org is missing of the FALLBACK SET ═══
create or replace function public.org_missing_templates(p_org uuid)
returns table (purpose public.template_purpose, family text)
language sql stable security definer set search_path = '' as $fn$
  select f.purpose, f.family
    from (values
      ('certificate'::public.template_purpose, 'attendance'::text),
      ('certificate'::public.template_purpose, 'presenter'::text),
      ('certificate'::public.template_purpose, 'achievement'::text),
      ('poster'::public.template_purpose,      'talk'::text)
    ) as f(purpose, family)
   where public.org_template_version(p_org, f.purpose, f.family) is null
$fn$;
revoke execute on function public.org_missing_templates(uuid) from public, anon, authenticated, service_role;

comment on function public.org_missing_templates(uuid) is
  'DEC-254 §3.3 — the (purpose, family) pairs of the fallback set this org cannot resolve. Empty means every default the code falls back on resolves. Owner-only.';

-- ═══ 3 · every org is seeded when it is born ═══
create or replace function public.orgs_seed_templates() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.seed_org_templates(new.id);
  return null;
end $fn$;

drop trigger if exists orgs_seed_templates on public.orgs;
create trigger orgs_seed_templates after insert on public.orgs
  for each row execute function public.orgs_seed_templates();

-- ═══ 4 · an org never retires its way out of a fallback template (D6) ═══
create or replace function public.design_templates_keep_one_live() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  -- A platform row is not an org's fallback; and 0191's org-deletion escape — in the cascade from
  -- `perform_org_deletion()` the org is already gone, and its templates must be allowed to go with it.
  if old.org_id is null or not exists (select 1 from public.orgs o where o.id = old.org_id) then
    return null;
  end if;
  -- Only a change that can REDUCE what the org resolves: a live row retired, re-familied or deleted.
  if old.retired_at is not null then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and new.retired_at is null
     and new.purpose = old.purpose and new.family = old.family then
    return null;
  end if;

  if exists (
    select 1 from public.org_missing_templates(old.org_id) m
     where m.purpose = old.purpose and m.family = old.family
  ) then
    raise exception 'last_live_template'
      using errcode = '23514', detail = old.purpose::text || '/' || old.family;
  end if;
  return null;
end $fn$;

drop trigger if exists design_templates_keep_one_live on public.design_templates;
create trigger design_templates_keep_one_live
  after update of retired_at, purpose, family or delete on public.design_templates
  for each row execute function public.design_templates_keep_one_live();
