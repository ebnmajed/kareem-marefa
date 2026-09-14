-- proposed by `scoring` (wave 2, M4), promoted by the lead at sync 1 — the whole M4 schema: the action catalogue, the
-- append-only ledger and its rollup, badges, levels, streaks, perks, and the
-- leaderboard snapshots. 02-domain-model.md §4.9–4.11 · 03-permissions-rls.md
-- §5.7 · 05-scoring-engine.md whole · CLAUDE.md invariant 9 (points_ledger is
-- append-only, `revoke` including `service_role`) · REQ-PTS-001…014,
-- REQ-LDR-001…008, REQ-REC-001…009 · DEC-046 (occurred_at defaults to
-- clock_timestamp()).
--
-- Nothing here is an RPC. award_points(), the manual-adjustment RPC, the
-- admin config RPC and the recognition evaluators are later proposed files
-- (docs/plan/notes/scoring.md's story order) — this file gives every later
-- story the same shape to build on, same discipline as 0010.
--
-- ── scoring_config_history already exists (0004_tenancy.sql, M1) ───────────
-- It is NOT created here. `scope check (scope in ('scoring', 'org_settings',
-- 'badges', 'levels', 'perks', 'streaks'))` already covers every M4 scope;
-- `org_settings_history()` (0004) is this file's template for
-- `scoring_rules_history()` below — one row per changed column, written by a
-- SECURITY DEFINER trigger, so no code path can edit a rule without a trace
-- (REQ-PTS-005) and this migration never alters a table the lead owns.
--
-- ── Hooks into other tracks' tables (docs/plan/notes/scoring.md) ───────────
-- `_seed_org_scoring()` fires from a NEW trigger on `public.orgs` (an
-- existing M1 table, untouched otherwise) rather than editing `create_org()`
-- — additive DDL only. Award-time triggers on `ratings`/`comments`/`sessions`
-- are separate, later proposed files once STORY-PTS-002/003 are built; this
-- file is schema only.
--
-- 03 §8.2 rows this migration adds or proves:
--   POL-scoring_rules.select                — any org member reads the catalogue (REQ-PTS-003).
--   POL-scoring_rules.update.admin           — a moderator changing a point value is rejected.
--   POL-scoring_rules.catalogue              — inserting action_key = 'rsvp' is rejected (REQ-PTS-010).
--   POL-scoring_rules.immutable_key          — action_key and actor cannot be changed by update (column grant).
--   POL-scoring_rules.history                — a rule edit appends to scoring_config_history (scope='scoring').
--   POL-points_ledger.insert                 — direct insert rejected for authenticated AND service_role.
--   POL-points_ledger.update                 — update and delete raise for every client role including service_role.
--   POL-points_ledger.select                 — a member reads only their own rows; an admin reads the org's.
--   POL-points_ledger.idempotency            — awarding the same source event twice inserts one row (proven again once award_points() exists).
--   POL-points_balances.select               — org-wide read, no client writes.
--   POL-badges.select / .update.admin        — P1/P2, no delete (retiring ≠ deleting, REQ-REC-001).
--   POL-levels.select / .update.admin        — P1/P2, no delete.
--   POL-streak_rules.select / .update.admin  — P1/P2, no delete.
--   POL-perks.select / .update.admin         — P1/P2, no delete.
--   POL-member_badges.select                 — org-wide read, no client writes (job/admin RPC only).
--   POL-member_perks.select                  — same.
--   POL-streak_awards.select                 — same.
--   POL-leaderboard_snapshots.select         — org-wide read, no client writes.
--   POL-leaderboard_snapshots.immutable      — a final (is_final) snapshot refuses update and delete, for every role including the owner.
--   POL-leaderboard_entries.select.opt_out   — an opted-out member is absent from others' view, present in their own; company rows unaffected (REQ-LDR-008).
--   POL-leaderboard_entries.immutable        — entries of a final snapshot refuse update and delete.
--   POL-orgs.seed_scoring                    — inserting a row into orgs seeds all five M4 catalogues for it (proven on the fixture orgs, which insert into orgs directly).

-- ── Enums (02 §4.9, the M4 subset — company_metric already exists, 0003) ───
create type public.point_actor      as enum ('attendee', 'presenter', 'system', 'admin');
create type public.ledger_source    as enum ('check_in', 'rating', 'comment', 'photo', 'streak',
                                              'proposal_accepted', 'session_delivered',
                                              'attendee_bonus', 'rating_bonus', 'materials_uploaded',
                                              'no_show', 'late_cancellation', 'content_removed',
                                              'manual_adjustment', 'reversal');
create type public.leaderboard_kind as enum ('all_time', 'monthly', 'seasonal', 'topic', 'company');

-- ═══════════════════════════════════════════════════════════════════════════
-- scoring_rules — the configurable catalogue. Code fixes the SET of actions
-- (the check constraint); an org configures only their values (REQ-PTS-010).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.scoring_rules (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  action_key        text not null check (action_key = any (array[
                       'check_in', 'rating_submitted', 'comment', 'photo', 'streak_month',
                       'proposal_accepted', 'session_delivered', 'attendee_bonus', 'rating_bonus',
                       'materials_uploaded', 'no_show', 'late_cancellation',
                       'comment_removed', 'photo_removed'
                     ])),
  actor             public.point_actor not null,
  points            int not null,
  enabled           boolean not null default true,
  cap_per_session   int check (cap_per_session is null or cap_per_session > 0),
  cap_per_period    int check (cap_per_period is null or cap_per_period > 0),
  cap_period        interval,
  cooldown          interval,
  reason_ar         text not null check (char_length(btrim(reason_ar)) between 1 and 200),
  version           int not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (org_id, action_key)
);
alter table public.scoring_rules enable row level security;
revoke all on public.scoring_rules from anon, authenticated, service_role;

create policy "p1_org_read" on public.scoring_rules for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_insert" on public.scoring_rules for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.scoring_rules for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
grant select on public.scoring_rules to authenticated;
grant insert (org_id, action_key, actor, points, enabled, cap_per_session, cap_per_period,
              cap_period, cooldown, reason_ar) on public.scoring_rules to authenticated;
-- `action_key` and `actor` are absent from the update grant on purpose (05
-- §3.1 "not editable") — a column-level grant, not a trigger, so an admin
-- cannot rewrite a rule's identity under the guise of tuning its points
-- (same technique as P6's moderation columns, 03 §4).
grant update (points, enabled, cap_per_session, cap_per_period, cap_period, cooldown, reason_ar)
  on public.scoring_rules to authenticated;
revoke delete on public.scoring_rules from anon, authenticated, service_role;

-- Every edit bumps `version` (REQ-PTS-004: a ledger row always names the
-- configuration that produced it, unaffected by later edits).
create function public.scoring_rules_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version    := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
create trigger scoring_rules_before_update before update on public.scoring_rules
  for each row execute function public.scoring_rules_before_update();

-- One history row per changed column, into the M1 `scoring_config_history`
-- table — the exact shape `org_settings_history()` (0004) already
-- established for `scope = 'org_settings'`; this is `scope = 'scoring'`.
create function public.scoring_rules_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  col  text;
  oldj jsonb := to_jsonb(old);
  newj jsonb := to_jsonb(new);
begin
  for col in select key from jsonb_each(newj) loop
    if col in ('id', 'org_id', 'action_key', 'actor', 'created_at', 'updated_at') then continue; end if;
    if oldj -> col is distinct from newj -> col then
      insert into public.scoring_config_history (org_id, scope, entity_id, field, old_value, new_value, actor_id)
      values (new.org_id, 'scoring', new.id, col, oldj -> col, newj -> col, public.auth_member_id());
    end if;
  end loop;
  return new;
end $$;
create trigger scoring_rules_history after update on public.scoring_rules
  for each row execute function public.scoring_rules_history();

-- ═══════════════════════════════════════════════════════════════════════════
-- badges / member_badges — REQ-REC-001, REQ-REC-002. Retiring a badge does
-- not revoke it: no cascade from `retired_at`, and no delete policy at all.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.badges (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  key                 text not null check (char_length(btrim(key)) between 1 and 40),
  name                text not null check (char_length(btrim(name)) between 1 and 100),
  description         text,
  rule                jsonb not null default '{}'::jsonb,
  issues_certificate  boolean not null default false,
  retired_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (org_id, key)
);
alter table public.badges enable row level security;
revoke all on public.badges from anon, authenticated, service_role;
create trigger badges_updated_at before update on public.badges
  for each row execute function public.set_updated_at();

create policy "p1_org_read" on public.badges for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_insert" on public.badges for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.badges for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
grant select, insert, update on public.badges to authenticated;
revoke delete on public.badges from anon, authenticated, service_role;

create table public.member_badges (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  badge_id      uuid not null references public.badges(id) on delete cascade,
  awarded_at    timestamptz not null default now(),
  awarded_by    uuid references public.members(id),
  award_reason  text,
  unique (member_id, badge_id),
  check (awarded_by is null or (award_reason is not null and btrim(award_reason) <> ''))
);
alter table public.member_badges enable row level security;
revoke all on public.member_badges from anon, authenticated, service_role;
create index on public.member_badges (org_id, member_id);

-- Awarded by a job or admin RPC (later story) — no insert/update/delete
-- grant exists for any client role; the RPC's owner bypasses this by
-- ownership, same as every append-style table in this file.
create policy "p1_org_read" on public.member_badges for select to authenticated
  using (org_id = public.auth_org_id());
grant select on public.member_badges to authenticated;
revoke insert, update, delete on public.member_badges from anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- levels — REQ-REC-003, REQ-REC-004. Never lowered by an evaluation (that
-- rule lives in the evaluator RPC, not the schema — a level row itself has
-- no state to protect it from a plain admin threshold edit).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.levels (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs(id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 1 and 60),
  threshold_points  int not null check (threshold_points >= 0),
  sort_order        int not null check (sort_order > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (org_id, threshold_points),
  unique (org_id, sort_order)
);
alter table public.levels enable row level security;
revoke all on public.levels from anon, authenticated, service_role;
create trigger levels_updated_at before update on public.levels
  for each row execute function public.set_updated_at();

create policy "p1_org_read" on public.levels for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_insert" on public.levels for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.levels for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
grant select, insert, update on public.levels to authenticated;
revoke delete on public.levels from anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- streak_rules / streak_awards — REQ-REC-005, A10. Idempotency is the
-- (member_id, rule_id, period_start) unique constraint.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.streak_rules (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  key             text not null check (char_length(btrim(key)) between 1 and 40),
  "window"        interval not null,          -- `window` is a reserved word; quoted everywhere
  required_count  int not null check (required_count > 0),
  bonus_points    int not null check (bonus_points >= 0),
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, key)
);
alter table public.streak_rules enable row level security;
revoke all on public.streak_rules from anon, authenticated, service_role;
create trigger streak_rules_updated_at before update on public.streak_rules
  for each row execute function public.set_updated_at();

create policy "p1_org_read" on public.streak_rules for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_insert" on public.streak_rules for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.streak_rules for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
grant select, insert, update on public.streak_rules to authenticated;
revoke delete on public.streak_rules from anon, authenticated, service_role;

create table public.streak_awards (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  rule_id       uuid not null references public.streak_rules(id) on delete cascade,
  period_start  date not null,
  awarded_at    timestamptz not null default now(),
  unique (member_id, rule_id, period_start)
);
alter table public.streak_awards enable row level security;
revoke all on public.streak_awards from anon, authenticated, service_role;
create index on public.streak_awards (org_id, member_id);

create policy "p1_org_read" on public.streak_awards for select to authenticated
  using (org_id = public.auth_org_id());
grant select on public.streak_awards to authenticated;
revoke insert, update, delete on public.streak_awards from anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- perks / member_perks — REQ-REC-006…008, OQ-012. `can_host` ships disabled
-- (seeded below); a member's grants are materialised so the RSVP hot path
-- stays one indexed lookup.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.perks (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id) on delete cascade,
  key                text not null check (key in ('priority_rsvp', 'can_host')),
  required_level_id  uuid references public.levels(id),
  required_badge_id  uuid references public.badges(id),
  enabled            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, key),
  check (required_level_id is not null or required_badge_id is not null)
);
alter table public.perks enable row level security;
revoke all on public.perks from anon, authenticated, service_role;
create trigger perks_updated_at before update on public.perks
  for each row execute function public.set_updated_at();

create policy "p1_org_read" on public.perks for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_insert" on public.perks for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.perks for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
grant select, insert, update on public.perks to authenticated;
revoke delete on public.perks from anon, authenticated, service_role;

create table public.member_perks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  perk_id     uuid not null references public.perks(id) on delete cascade,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  unique (member_id, perk_id)
);
alter table public.member_perks enable row level security;
revoke all on public.member_perks from anon, authenticated, service_role;
create index on public.member_perks (org_id, member_id);

create policy "p1_org_read" on public.member_perks for select to authenticated
  using (org_id = public.auth_org_id());
grant select on public.member_perks to authenticated;
revoke insert, update, delete on public.member_perks from anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- points_ledger — append-only at the database (05 §2, CLAUDE.md invariant 9).
-- `revoke` includes `service_role`: the worker connects as `service_role`
-- and would otherwise bypass RLS entirely (03 §5.7a). Inserts happen only
-- through award_points() (STORY-PTS-001, a later proposed file), a
-- SECURITY DEFINER function owned by the table owner — ownership is never
-- subject to a `revoke`, which is exactly the asymmetry this design needs:
-- one audited doorway in, no doorway to rewrite.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.points_ledger (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  member_id        uuid not null references public.members(id) on delete cascade,
  amount           int not null,
  source           public.ledger_source not null,
  source_id        uuid,
  session_id       uuid references public.sessions(id),
  reason           text not null check (char_length(btrim(reason)) between 1 and 300),
  rule_key         text,
  rule_version     int,
  actor_id         uuid references public.members(id),
  idempotency_key  text not null unique,
  occurred_at      timestamptz not null default clock_timestamp()  -- DEC-046, not now()
  -- deliberately no updated_at: a ledger row is never updated
);
alter table public.points_ledger enable row level security;
revoke all on public.points_ledger from anon, authenticated, service_role;
create index on public.points_ledger (org_id, member_id, occurred_at desc);
create index on public.points_ledger (org_id, session_id);
create index on public.points_ledger (org_id, occurred_at);

create policy "ledger_read_self_or_admin" on public.points_ledger for select to authenticated
  using (org_id = public.auth_org_id()
         and (member_id = public.auth_member_id() or public.is_org_admin()));
grant select on public.points_ledger to authenticated;
revoke insert, update, delete on public.points_ledger from anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- points_balances — the rollup (05 §2.3). Safe because the ledger is
-- insert-only: a pure left fold, nothing to un-apply.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.points_balances (
  org_id            uuid not null references public.orgs(id) on delete cascade,
  member_id         uuid primary key references public.members(id) on delete cascade,
  total_points      int not null default 0,
  last_entry_id     uuid,
  current_level_id  uuid references public.levels(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.points_balances enable row level security;
revoke all on public.points_balances from anon, authenticated, service_role;
create index on public.points_balances (org_id);

create policy "p1_org_read" on public.points_balances for select to authenticated
  using (org_id = public.auth_org_id());
grant select on public.points_balances to authenticated;
revoke insert, update, delete on public.points_balances from anon, authenticated, service_role;

create function public.points_rollup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.points_balances (org_id, member_id, total_points, last_entry_id)
  values (new.org_id, new.member_id, new.amount, new.id)
  on conflict (member_id) do update
    set total_points  = public.points_balances.total_points + excluded.total_points,
        last_entry_id = excluded.last_entry_id,
        updated_at    = now();
  return new;
end $$;
create trigger points_rollup after insert on public.points_ledger
  for each row execute function public.points_rollup();

-- Added by the lead at promotion (CLAUDE.md invariant 9, the members_org_immutable
-- pattern of 0004): the revoke above stops every client role, but the table
-- owner and every SECURITY DEFINER function run as the owner, and ownership is
-- not subject to a revoke. A trigger raises for every writer — bypassrls skips
-- policies, not triggers — so "balances must be recomputable" is a property of
-- the table, not of the functions that happen to exist today. A reversal is a
-- compensating row (REQ-PTS-013), never an edit.
create function public.points_ledger_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- The one legitimate disappearance: the org itself is being deleted and the
  -- row goes with it by cascade (the parent row is already gone when the
  -- cascade reaches this table). Everything else is refused.
  if tg_op = 'DELETE' and not exists (select 1 from public.orgs o where o.id = old.org_id) then
    return old;
  end if;
  raise exception 'points_ledger is append-only: % refused (REQ-PTS-001; a reversal is a compensating row)', tg_op
    using errcode = '23514';
end $$;
create trigger points_ledger_append_only before update or delete on public.points_ledger
  for each row execute function public.points_ledger_append_only();

-- ═══════════════════════════════════════════════════════════════════════════
-- leaderboard_snapshots / leaderboard_entries — REQ-LDR-002, REQ-LDR-006,
-- A11, DEC-016. Job-written only; a `is_final` snapshot and its entries are
-- immutable by trigger, not merely by missing grants, because the writer
-- (a SECURITY DEFINER job function) is itself the table owner and ownership
-- is not subject to `revoke` — the trigger is the only thing that can still
-- say no to the owner.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.leaderboard_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs(id) on delete cascade,
  kind                  public.leaderboard_kind not null,
  period_start          date,
  period_end            date,
  category_id           uuid references public.categories(id),
  metric                public.company_metric,
  active_member_count   int,
  taken_at              timestamptz not null default now(),
  is_final              boolean not null default false,
  constraint leaderboard_snapshots_natural_key
    unique nulls not distinct (org_id, kind, period_start, period_end, category_id)
);
alter table public.leaderboard_snapshots enable row level security;
revoke all on public.leaderboard_snapshots from anon, authenticated, service_role;

create policy "p1_org_read" on public.leaderboard_snapshots for select to authenticated
  using (org_id = public.auth_org_id());
grant select on public.leaderboard_snapshots to authenticated;
revoke insert, update, delete on public.leaderboard_snapshots from anon, authenticated, service_role;

create function public.leaderboard_snapshot_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Lead, at promotion: an org deletion cascades through here; the parent row
  -- is already gone when the cascade reaches this table.
  if tg_op = 'DELETE' and not exists (select 1 from public.orgs o where o.id = old.org_id) then
    return old;
  end if;
  if old.is_final then
    raise exception 'leaderboard_snapshots: a final snapshot is immutable' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger leaderboard_snapshots_guard before update or delete on public.leaderboard_snapshots
  for each row execute function public.leaderboard_snapshot_guard();

create table public.leaderboard_entries (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs(id) on delete cascade,
  snapshot_id               uuid not null references public.leaderboard_snapshots(id) on delete cascade,
  member_id                 uuid references public.members(id),
  company_id                uuid references public.companies(id),
  rank                      int not null check (rank > 0),
  points                    int not null,
  points_per_active_member  numeric,
  check (num_nonnulls(member_id, company_id) = 1)
);
alter table public.leaderboard_entries enable row level security;
revoke all on public.leaderboard_entries from anon, authenticated, service_role;
create index on public.leaderboard_entries (org_id, snapshot_id, rank);

-- REQ-LDR-008: an opted-out member is filtered from OTHER members' view but
-- still sees their own row; company rows (member_id is null) are unaffected,
-- so opting out can never change a company's standing.
create policy "boards_read" on public.leaderboard_entries for select to authenticated
  using (org_id = public.auth_org_id()
         and (member_id is null
              or member_id = public.auth_member_id()
              or not exists (select 1 from public.members m
                              where m.id = public.leaderboard_entries.member_id
                                and m.leaderboard_opt_out)));
grant select on public.leaderboard_entries to authenticated;
revoke insert, update, delete on public.leaderboard_entries from anon, authenticated, service_role;

create function public.leaderboard_entry_guard() returns trigger
language plpgsql set search_path = '' as $$
declare v_final boolean;
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.orgs o where o.id = old.org_id) then
    return old;   -- org deletion cascade (see leaderboard_snapshot_guard)
  end if;
  select is_final into v_final from public.leaderboard_snapshots where id = old.snapshot_id;
  if v_final then
    raise exception 'leaderboard_entries: entries of a final snapshot are immutable' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger leaderboard_entries_guard before update or delete on public.leaderboard_entries
  for each row execute function public.leaderboard_entry_guard();

-- ═══════════════════════════════════════════════════════════════════════════
-- Org seeding — A10's default catalogue, seeded the moment an org exists.
-- A NEW trigger on the EXISTING `orgs` table (M1, untouched otherwise): the
-- alternative was a `create or replace function create_org()`, which is not
-- mine to rewrite and would have hidden this file's dependency on a
-- function whose source lives in a migration I never touch. This also
-- seeds `tests/rls/fixture.ts`'s two orgs for free, since it inserts into
-- `orgs` directly (docs/plan/notes/scoring.md).
-- ═══════════════════════════════════════════════════════════════════════════
create function public._seed_org_scoring(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_level3 uuid; v_level4 uuid;
begin
  insert into public.scoring_rules (org_id, action_key, actor, points, enabled, cap_per_session, cooldown, reason_ar) values
    (p_org, 'check_in',           'attendee',  20, true, null, null,                    'تسجيل حضور مؤكَّد'),
    (p_org, 'rating_submitted',   'attendee',  5,  true, 1,    null,                    'تقييم جلسة'),
    (p_org, 'comment',            'attendee',  2,  true, 5,    interval '60 seconds',   'تعليق'),
    (p_org, 'photo',              'attendee',  3,  true, 5,    null,                    'صورة من الجلسة'),
    (p_org, 'streak_month',       'attendee',  15, true, null, null,                    'سلسلة: ٣ حضور في الشهر'),
    (p_org, 'proposal_accepted',  'presenter', 10, true, null, null,                    'قبول مقترح'),
    (p_org, 'session_delivered',  'presenter', 50, true, null, null,                    'تقديم جلسة'),
    (p_org, 'attendee_bonus',     'presenter', 2,  true, 30,   null,                    'مكافأة لكل حاضر'),
    (p_org, 'rating_bonus',       'presenter', 20, true, 1,    null,                    'تقييم عالٍ للجلسة'),
    (p_org, 'materials_uploaded', 'presenter', 10, true, 1,    null,                    'رفع مواد الجلسة'),
    (p_org, 'no_show',            'attendee',  0,  true, null, null,                    'تغيّب بعد الحجز'),
    (p_org, 'late_cancellation',  'attendee',  0,  true, null, null,                    'إلغاء متأخر'),
    (p_org, 'comment_removed',    'attendee',  0,  true, null, null,                    'حُذف تعليق'),
    (p_org, 'photo_removed',      'attendee',  0,  true, null, null,                    'حُذفت صورة')
  on conflict (org_id, action_key) do nothing;

  insert into public.badges (org_id, key, name, description, rule, issues_certificate) values
    (p_org, 'first_check_in',  'أول حضور',            'أول تسجيل حضور موثّق',
       jsonb_build_object('metric', 'check_ins_count', 'gte', 1), false),
    (p_org, 'first_session',   'أول جلسة',             'أول جلسة تُقدَّم',
       jsonb_build_object('metric', 'sessions_delivered_count', 'gte', 1), false),
    (p_org, 'voice_heard',     'صوت مسموع',            'خمس جلسات تُقدَّم',
       jsonb_build_object('metric', 'sessions_delivered_count', 'gte', 5), true),
    (p_org, 'regular',         'حاضر دائم',            'عشرة تسجيلات حضور',
       jsonb_build_object('metric', 'check_ins_count', 'gte', 10), false),
    (p_org, 'monthly_streak',  'سلسلة الشهر',          'سلسلة شهرية كاملة',
       jsonb_build_object('metric', 'streak_awards_count', 'gte', 1), false),
    (p_org, 'trusted_opinion', 'رأي يُعتد به',          'عشرون تقييمًا',
       jsonb_build_object('metric', 'ratings_submitted_count', 'gte', 20), false),
    (p_org, 'rated_presenter', 'مُقدِّم مُقيَّم',        'متوسط تقييم ٤.٥ فأعلى على ثلاث جلسات على الأقل',
       jsonb_build_object('metric', 'presenter_rating_avg', 'gte', 4.5, 'min_sessions', 3), true),
    (p_org, 'annual',          'كريم المعرفة السنوي',  'تكريم سنوي',
       jsonb_build_object('metric', 'manual'), true)
  on conflict (org_id, key) do nothing;

  insert into public.levels (org_id, name, threshold_points, sort_order) values
    (p_org, 'مشارِك',       0,    1),
    (p_org, 'مشارِك نشِط',  100,  2),
    (p_org, 'صاحب أثر',     300,  3),
    (p_org, 'كريم معرفة',   700,  4),
    (p_org, 'سفير المعرفة', 1500, 5)
  on conflict (org_id, threshold_points) do nothing;

  select id into v_level3 from public.levels where org_id = p_org and sort_order = 3;
  select id into v_level4 from public.levels where org_id = p_org and sort_order = 4;

  insert into public.streak_rules (org_id, key, "window", required_count, bonus_points, enabled) values
    (p_org, 'monthly_3', interval '1 month', 3, 15, true)
  on conflict (org_id, key) do nothing;

  -- Both perks ship DISABLED (REQ-REC-008; lead at wave-2 sync 7): a priority
  -- window that nobody can use would only close general RSVP for a day, so an
  -- admin turns priority_rsvp on when the org wants it (OQ-012).
  insert into public.perks (org_id, key, required_level_id, enabled) values
    (p_org, 'priority_rsvp', v_level3, false),
    (p_org, 'can_host',      v_level4, false)
  on conflict (org_id, key) do nothing;
end $$;
revoke execute on function public._seed_org_scoring(uuid) from public, anon, authenticated;

create function public._orgs_seed_scoring_trigger() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform public._seed_org_scoring(new.id);
  return new;
end $$;
create trigger orgs_seed_scoring after insert on public.orgs
  for each row execute function public._orgs_seed_scoring_trigger();

-- Backfill any org that already existed before this migration (local dev,
-- CI's fixture-free runs). A no-op today on a fresh database.
do $$
declare r record;
begin
  for r in select id from public.orgs loop
    perform public._seed_org_scoring(r.id);
  end loop;
end $$;
