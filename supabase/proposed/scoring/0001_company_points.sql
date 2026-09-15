-- proposed by `scoring` (post-launch) · scoring/0001_company_points.sql —
-- company-level points, per the owner's decision of 2026-09-15 (STATUS.md
-- "Launch session"), verbatim in substance: "The company is awarded a
-- certain number of points based on the employees' participation.
-- Creditable rules: the company hosting; the percentage of attended
-- employees; the percentage of presenting employees."
--
-- Today a company's leaderboard score is derived ONLY — the sum of its
-- members' points, divided by the frozen active-member count at snapshot
-- time (05-scoring-engine.md §6.2, REQ-LDR-004, REQ-PRF-003). This
-- migration adds a second, independent source of company points on top of
-- that sum: a separate append-only ledger, evaluated once per completed
-- session, entering the same سباق الشركات snapshot.
--
-- Design decisions — docs/plan/notes/scoring.md "Company points rules
-- (post-launch)" has the full reasoning; summarised here for whoever reads
-- this file first:
--
-- (a) "The company hosting" needs a link that does not exist today
--     (`venues` has no `company_id`, and a venue is often reused by many
--     different hosting companies over time — see the note). This
--     migration adds a nullable `sessions.host_company_id`, set per
--     session rather than permanently on the venue, so a session at a
--     generic meeting room can still name its host, and a venue's
--     ownership never has to be guessed from its history.
-- (b) The two percentage rules are evaluated per COMPLETED session, for
--     EVERY company that had at least one active member attend (or
--     present) — not scoped to the session's host company alone. This is
--     an assumption, flagged in the note as an open question with this
--     migration's default: the owner's three bullets read as three
--     independent rules, matching the leaderboard's existing
--     company-agnostic shape, but "did the host company's own people show
--     up" is an equally plausible reading. Flip is a one-line WHERE clause
--     if the owner means the narrower thing.
-- (c) A SEPARATE append-only ledger (`company_points_ledger`), not rows in
--     `points_ledger` with a nullable `member_id`. `points_ledger.member_id`
--     is `not null` and every existing RLS policy, the rollup trigger and
--     the DAL assume it — widening it to admit company-only rows would
--     touch every one of those, for a shape (`num_nonnulls` union) that
--     `leaderboard_entries` already shows is not free. A dedicated table
--     mirroring `points_ledger`'s invariants exactly (CLAUDE.md invariant 9:
--     append-only, `revoke` including `service_role`) is the smaller,
--     more honest change.
--
-- A fourth open question, not in the owner's three bullets: a minimum
-- active-roster size (`company_scoring_rules.min_active_members`, seeded 3)
-- gates the two percentage rules — without it a one-person company hits
-- 100% attendance/presenting on every session it touches, the same
-- small-denominator gaming 05 §6.2 already names for the derived metric.
-- Recommended default: 3. Admin-editable like every other rule.
--
-- 03-permissions-rls.md §8.2 rows this migration adds or proves:
--   POL-company_scoring_rules.select                — any org member reads the catalogue.
--   POL-company_scoring_rules.update.admin           — a moderator changing a value is rejected.
--   POL-company_scoring_rules.catalogue              — inserting an action_key outside the three is rejected.
--   POL-company_scoring_rules.shape                  — a hosting row cannot carry a percent config and vice versa.
--   POL-company_scoring_rules.history                — an edit appends to scoring_config_history (scope='company_scoring').
--   POL-company_points_ledger.insert                 — direct insert rejected for authenticated AND service_role.
--   POL-company_points_ledger.update                 — update and delete raise for every client role including service_role.
--   POL-company_points_ledger.select                 — org-wide read (no "self" — a company has no session).
--   POL-company_points_ledger.idempotency             — evaluating the same session twice inserts no duplicate rows.
--   POL-company_points_balances.select               — org-wide read, no client writes.
--   RPC-evaluate_company_points.service_role_only    — no client role may call it.
--   RPC-evaluate_company_points.hosting               — a session with host_company_id set and the rule enabled
--     awards exactly one company_hosting row to that company.
--   RPC-evaluate_company_points.attendance_pct        — a company's share of its own active members who
--     checked in awards proportional points, capped, gated by min_active_members.
--   RPC-evaluate_company_points.presenting_pct        — same, over accepted session_presenters.
--   RPC-audit_company_balances.service_role_only / .no_self_heal — mirrors audit_balances() exactly.
--   RPC-rebuild_company_points_balances.reproduces    — truncate + resum always reproduces the same totals.
--   POL-sessions.host_company_same_org               — a session cannot be assigned a host company from another org.
--   RPC-snapshot_leaderboard.company_ledger_included  — the company board's total is the member-derived sum
--     PLUS the company ledger's sum in the same period; the denominator is unchanged (05 §6.2, DEC-016).
--
-- Nothing here touches wave-1/M2 app code. The one hook into a table this
-- track does not own is additive DDL on `sessions` (a nullable column plus
-- its own guard trigger) and a widened CHECK on `scoring_config_history`
-- (M1, 0004) — both flagged above for the lead's review at promotion, same
-- discipline 0027's header used for `orgs`.

-- ═══════════════════════════════════════════════════════════════════════════
-- sessions.host_company_id — (a) above. Nullable; null means "no company is
-- being credited for hosting this session". Set today only from
-- /app/admin/scoring's stopgap form (a session ID typed in, like the manual
-- adjustment form's member field) until console builds a proper picker on
-- the scheduling screen — flagged to the lead in the same way the manual
-- adjustment form's raw-UUID member field was flagged at wave 2.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.sessions add column host_company_id uuid references public.companies(id);

create function public.sessions_host_company_same_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.host_company_id is not null and not exists (
    select 1 from public.companies c where c.id = new.host_company_id and c.org_id = new.org_id
  ) then
    raise exception 'sessions.host_company_id must belong to the session''s own org' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger sessions_host_company_same_org before insert or update of host_company_id on public.sessions
  for each row execute function public.sessions_host_company_same_org();

-- Additive column grant only — `sessions_update_admin` (0010, sessions'
-- own RLS policy) is the row-level gate; this just admits the new column
-- to the set an admin's UPDATE may touch, the same technique 0010 already
-- uses for `title, abstract, level, language`.
grant update (host_company_id) on public.sessions to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- scoring_config_history's scope CHECK (0004, M1) widened to admit
-- 'company_scoring'. Found by name via pg_constraint rather than hard-
-- coding Postgres's auto-generated constraint name — and, more importantly,
-- widened by WRAPPING the constraint's own current definition rather than
-- retyping M1's original value list: another track (branding, 'branding')
-- has already widened this same CHECK once, live on this branch, so
-- hard-coding M1's original six values here would have silently DROPPED
-- that track's value instead of adding to it. `OR scope = 'company_scoring'`
-- is additive no matter how many other tracks have already touched this
-- constraint before or after this migration runs.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare v_name text; v_def text;
begin
  select conname, pg_get_constraintdef(oid) into v_name, v_def
    from pg_constraint
   where conrelid = 'public.scoring_config_history'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%scope%';
  if v_name is not null then
    -- v_def looks like "CHECK ((scope = ANY (ARRAY[...])))" — strip the
    -- leading "CHECK (" and the matching trailing ")" so the inner
    -- expression can be reused verbatim inside a wrapping OR.
    v_def := regexp_replace(v_def, '^CHECK \((.*)\)$', '\1');
    execute format('alter table public.scoring_config_history drop constraint %I', v_name);
    execute format(
      'alter table public.scoring_config_history add constraint scoring_config_history_scope_check check ((%s) or scope = ''company_scoring'')',
      v_def
    );
  else
    execute 'alter table public.scoring_config_history add constraint scoring_config_history_scope_check '
      || 'check (scope in (''scoring'', ''org_settings'', ''badges'', ''levels'', ''perks'', ''streaks'', ''company_scoring''))';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- company_scoring_rules — the configurable catalogue for the three company
-- rules. A separate table from scoring_rules (not a widened point_actor):
-- the percent rules need a genuinely different shape (points_per_percent,
-- cap_points, min_active_members) that scoring_rules has no columns for,
-- and reusing it would either add unused columns to every member-level row
-- or overload existing ones with a second meaning.
-- ═══════════════════════════════════════════════════════════════════════════
create type public.company_ledger_source as enum (
  'company_hosting', 'company_attendance_pct', 'company_presenting_pct'
);

create table public.company_scoring_rules (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  action_key          text not null check (action_key = any (array[
                         'company_hosting', 'company_attendance_pct', 'company_presenting_pct'
                       ])),
  enabled             boolean not null default true,
  points              int check (points is null or points >= 0),
  points_per_percent  numeric(6,2) check (points_per_percent is null or points_per_percent >= 0),
  cap_points          int check (cap_points is null or cap_points > 0),
  min_active_members  int check (min_active_members is null or min_active_members >= 1),
  reason_ar           text not null check (char_length(btrim(reason_ar)) between 1 and 200),
  version             int not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (org_id, action_key),
  -- A hosting row is flat-amount-shaped; a percent row is
  -- percent/cap/roster-shaped. Never both, never neither.
  check (
    (action_key = 'company_hosting'
       and points is not null and points_per_percent is null
       and cap_points is null and min_active_members is null)
    or
    (action_key in ('company_attendance_pct', 'company_presenting_pct')
       and points is null and points_per_percent is not null
       and cap_points is not null and min_active_members is not null)
  )
);
alter table public.company_scoring_rules enable row level security;
revoke all on public.company_scoring_rules from anon, authenticated, service_role;

create policy "p1_org_read" on public.company_scoring_rules for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_insert" on public.company_scoring_rules for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.company_scoring_rules for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
grant select on public.company_scoring_rules to authenticated;
grant insert (org_id, action_key, enabled, points, points_per_percent, cap_points, min_active_members, reason_ar)
  on public.company_scoring_rules to authenticated;
-- `action_key` absent from the update grant (identity, not tunable) —
-- same technique 0027 uses for scoring_rules' `action_key`/`actor`.
grant update (enabled, points, points_per_percent, cap_points, min_active_members, reason_ar)
  on public.company_scoring_rules to authenticated;
revoke delete on public.company_scoring_rules from anon, authenticated, service_role;

create function public.company_scoring_rules_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version    := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
create trigger company_scoring_rules_before_update before update on public.company_scoring_rules
  for each row execute function public.company_scoring_rules_before_update();

create function public.company_scoring_rules_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  col  text;
  oldj jsonb := to_jsonb(old);
  newj jsonb := to_jsonb(new);
begin
  for col in select key from jsonb_each(newj) loop
    if col in ('id', 'org_id', 'action_key', 'created_at', 'updated_at') then continue; end if;
    if oldj -> col is distinct from newj -> col then
      insert into public.scoring_config_history (org_id, scope, entity_id, field, old_value, new_value, actor_id)
      values (new.org_id, 'company_scoring', new.id, col, oldj -> col, newj -> col, public.auth_member_id());
    end if;
  end loop;
  return new;
end $$;
create trigger company_scoring_rules_history after update on public.company_scoring_rules
  for each row execute function public.company_scoring_rules_history();

-- ═══════════════════════════════════════════════════════════════════════════
-- company_points_ledger — append-only, mirroring points_ledger (0027)
-- column for column where the shape applies. `revoke` includes
-- `service_role` (CLAUDE.md invariant 9); the one door in is
-- evaluate_company_points(), a SECURITY DEFINER function owned by the
-- table owner, exactly the asymmetry points_ledger already relies on.
-- `meta` carries the raw counts behind a percent row (attended/active or
-- presenting/active and the computed percent) so the board's breakdown
-- can show "3 of 5 employees attended (60%)" rather than just the point
-- amount — REQ-PTS-003's "explainable without asking anyone" extended to
-- company scope.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.company_points_ledger (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  company_id       uuid not null references public.companies(id) on delete cascade,
  amount           int not null,
  source           public.company_ledger_source not null,
  source_id        uuid,
  session_id       uuid references public.sessions(id),
  reason           text not null check (char_length(btrim(reason)) between 1 and 300),
  rule_key         text,
  rule_version     int,
  actor_id         uuid references public.members(id),
  idempotency_key  text not null unique,
  occurred_at      timestamptz not null default clock_timestamp(),  -- DEC-046's own choice, matched here
  meta             jsonb not null default '{}'::jsonb
  -- deliberately no updated_at: a ledger row is never updated
);
alter table public.company_points_ledger enable row level security;
revoke all on public.company_points_ledger from anon, authenticated, service_role;
create index on public.company_points_ledger (org_id, company_id, occurred_at desc);
create index on public.company_points_ledger (org_id, session_id);

-- No "self" concept for a company row (a company is not the reader) — the
-- board that shows these totals is already org-wide (REQ-LDR-004), so
-- org-wide read is the honest boundary, same as points_balances.
create policy "p1_org_read" on public.company_points_ledger for select to authenticated
  using (org_id = public.auth_org_id());
grant select on public.company_points_ledger to authenticated;
revoke insert, update, delete on public.company_points_ledger from anon, authenticated, service_role;

create function public.company_points_ledger_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.orgs o where o.id = old.org_id) then
    return old;   -- org deletion cascade — see 0027's identical exception
  end if;
  raise exception 'company_points_ledger is append-only: % refused (a reversal is a compensating row)', tg_op
    using errcode = '23514';
end $$;
create trigger company_points_ledger_append_only before update or delete on public.company_points_ledger
  for each row execute function public.company_points_ledger_append_only();

-- ═══════════════════════════════════════════════════════════════════════════
-- company_points_balances — the rollup, mirroring points_balances (0027).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.company_points_balances (
  org_id         uuid not null references public.orgs(id) on delete cascade,
  company_id     uuid primary key references public.companies(id) on delete cascade,
  total_points   int not null default 0,
  last_entry_id  uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.company_points_balances enable row level security;
revoke all on public.company_points_balances from anon, authenticated, service_role;
create index on public.company_points_balances (org_id);

create policy "p1_org_read" on public.company_points_balances for select to authenticated
  using (org_id = public.auth_org_id());
grant select on public.company_points_balances to authenticated;
revoke insert, update, delete on public.company_points_balances from anon, authenticated, service_role;

create function public.company_points_rollup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.company_points_balances (org_id, company_id, total_points, last_entry_id)
  values (new.org_id, new.company_id, new.amount, new.id)
  on conflict (company_id) do update
    set total_points  = public.company_points_balances.total_points + excluded.total_points,
        last_entry_id = excluded.last_entry_id,
        updated_at    = now();
  return new;
end $$;
create trigger company_points_rollup after insert on public.company_points_ledger
  for each row execute function public.company_points_rollup();

-- ═══════════════════════════════════════════════════════════════════════════
-- evaluate_company_points(session) — the three rules, evaluated once, at
-- session completion. Called from worker/src/tasks/evaluate_no_shows.ts —
-- NOT a new job: `sessions_completion_fanout()` (0031, scoring's own
-- function) already enqueues one `evaluate_no_shows` job per completed
-- session unconditionally, "evaluated once, at completion" for both no-show
-- and company points alike, so this migration adds zero new job types and
-- needs no new worker/src/index.ts registration — the task file this
-- track already owns just does one more thing. Idempotent by construction
-- (on conflict do nothing on the ledger's unique idempotency_key), so a
-- retried job re-awards nothing.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.evaluate_company_points(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s       public.sessions;
  r_host  public.company_scoring_rules;
  r_att   public.company_scoring_rules;
  r_pres  public.company_scoring_rules;
  v_key   text;
  v_pts   int;
  rec     record;
begin
  select * into s from public.sessions where id = p_session;
  if not found then
    return;   -- the session row is gone; nothing to evaluate (DEC-059's terminal-row pattern)
  end if;

  select * into r_host from public.company_scoring_rules where org_id = s.org_id and action_key = 'company_hosting';
  select * into r_att  from public.company_scoring_rules where org_id = s.org_id and action_key = 'company_attendance_pct';
  select * into r_pres from public.company_scoring_rules where org_id = s.org_id and action_key = 'company_presenting_pct';

  -- Rule 1 — company_hosting: one flat award to the session's assigned
  -- host company, if one is assigned and the rule is enabled.
  -- `r_host.id is not null`, not `r_host is not null`: Postgres row-wise NULL
  -- semantics say a composite `IS NOT NULL` is true only when EVERY field is
  -- non-null, and a hosting rule's own shape (points_per_percent, cap_points,
  -- min_active_members all NULL by the CHECK above) makes that always false
  -- even when select-into found a real row. `.id` is never null once a row
  -- exists, so it is the reliable "was a row found" test — the same reason
  -- `select ... into s; if not found then return; end if;` above tests FOUND
  -- directly rather than `s is not null`.
  if r_host.id is not null and r_host.enabled and s.host_company_id is not null then
    v_key := format('company_hosting:session_delivered:%s:%s:v1', p_session, s.host_company_id);
    insert into public.company_points_ledger
      (org_id, company_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key)
    values (s.org_id, s.host_company_id, r_host.points, 'company_hosting', p_session, p_session,
            r_host.reason_ar, 'company_hosting', r_host.version, v_key)
    on conflict (idempotency_key) do nothing;
  end if;

  -- Rule 2 — company_attendance_pct: for every company with at least one
  -- checked-in member at THIS session, the share of that company's own
  -- active roster who attended (b, the open question in the header: scoped
  -- to any company, not just the session's host).
  if r_att.id is not null and r_att.enabled then
    for rec in
      select m.company_id,
             count(*) as attended,
             (select count(*) from public.members mm
               where mm.org_id = s.org_id and mm.status = 'active' and mm.company_id = m.company_id) as active
        from public.check_ins ci
        join public.members m on m.id = ci.member_id
       where ci.session_id = p_session and m.company_id is not null
       group by m.company_id
    loop
      if rec.active >= r_att.min_active_members then
        v_pts := least(r_att.cap_points, round((rec.attended::numeric / rec.active) * 100 * r_att.points_per_percent)::int);
        if v_pts > 0 then
          v_key := format('company_attendance_pct:session_completed:%s:%s:v1', p_session, rec.company_id);
          insert into public.company_points_ledger
            (org_id, company_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key, meta)
          values (s.org_id, rec.company_id, v_pts, 'company_attendance_pct', p_session, p_session,
                  r_att.reason_ar, 'company_attendance_pct', r_att.version, v_key,
                  jsonb_build_object('attended', rec.attended, 'active_members', rec.active,
                                      'percent', round((rec.attended::numeric / rec.active) * 100, 1)))
          on conflict (idempotency_key) do nothing;
        end if;
      end if;
    end loop;
  end if;

  -- Rule 3 — company_presenting_pct: same shape, over accepted
  -- session_presenters.
  if r_pres.id is not null and r_pres.enabled then
    for rec in
      select m.company_id,
             count(*) as presenting,
             (select count(*) from public.members mm
               where mm.org_id = s.org_id and mm.status = 'active' and mm.company_id = m.company_id) as active
        from public.session_presenters sp
        join public.members m on m.id = sp.member_id
       where sp.session_id = p_session and sp.accepted and m.company_id is not null
       group by m.company_id
    loop
      if rec.active >= r_pres.min_active_members then
        v_pts := least(r_pres.cap_points, round((rec.presenting::numeric / rec.active) * 100 * r_pres.points_per_percent)::int);
        if v_pts > 0 then
          v_key := format('company_presenting_pct:session_completed:%s:%s:v1', p_session, rec.company_id);
          insert into public.company_points_ledger
            (org_id, company_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key, meta)
          values (s.org_id, rec.company_id, v_pts, 'company_presenting_pct', p_session, p_session,
                  r_pres.reason_ar, 'company_presenting_pct', r_pres.version, v_key,
                  jsonb_build_object('presenting', rec.presenting, 'active_members', rec.active,
                                      'percent', round((rec.presenting::numeric / rec.active) * 100, 1)))
          on conflict (idempotency_key) do nothing;
        end if;
      end if;
    end loop;
  end if;
end $$;
revoke execute on function public.evaluate_company_points(uuid) from public, anon, authenticated;
grant  execute on function public.evaluate_company_points(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- audit_company_balances() / rebuild_company_points_balances() — mirror
-- audit_balances() / rebuild_points_balances() (0033) exactly. Never
-- self-heals; the rebuild is the separate, explicit, safe response,
-- correct because the ledger is insert-only.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.audit_company_balances()
returns table (org_id uuid, company_id uuid, expected_total int, actual_total int,
               expected_last_entry_id uuid, actual_last_entry_id uuid)
language sql security definer set search_path = '' as $$
  select b.org_id, b.company_id,
         coalesce(l.total, 0)  as expected_total,
         b.total_points        as actual_total,
         l.last_id             as expected_last_entry_id,
         b.last_entry_id       as actual_last_entry_id
    from public.company_points_balances b
    left join (
      select company_id, sum(amount) as total, (array_agg(id order by occurred_at desc))[1] as last_id
        from public.company_points_ledger
       group by company_id
    ) l on l.company_id = b.company_id
   where coalesce(l.total, 0) <> b.total_points
      or l.last_id is distinct from b.last_entry_id
$$;
revoke execute on function public.audit_company_balances() from public, anon, authenticated;
grant  execute on function public.audit_company_balances() to service_role;

create function public.rebuild_company_points_balances() returns void
language plpgsql security definer set search_path = '' as $$
begin
  truncate public.company_points_balances;
  insert into public.company_points_balances (org_id, company_id, total_points, last_entry_id)
  select org_id, company_id, sum(amount), (array_agg(id order by occurred_at desc))[1]
    from public.company_points_ledger
   group by org_id, company_id;
end $$;
revoke execute on function public.rebuild_company_points_balances() from public, anon, authenticated;
grant  execute on function public.rebuild_company_points_balances() to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- _seed_org_scoring() (0027, scoring's own function) — create or replace,
-- byte-identical except the new insert block at the end, so every org
-- (future via the existing orgs-insert trigger, and every org that already
-- exists — see the backfill below) gets the three company rules seeded.
-- Ships ENABLED (unlike priority_rsvp/can_host, which change RSVP
-- semantics): a scoring rule earning company points changes nothing about
-- what a member can do, so there is no equivalent to the wave-2 lesson
-- about a perk closing RSVP for a day.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public._seed_org_scoring(p_org uuid) returns void
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

  insert into public.perks (org_id, key, required_level_id, enabled) values
    (p_org, 'priority_rsvp', v_level3, false),
    (p_org, 'can_host',      v_level4, false)
  on conflict (org_id, key) do nothing;

  -- New — the three company rules (this migration). Defaults are seed
  -- values only, editable on /app/admin/scoring like every other rule:
  -- hosting 100 flat; attendance 1 point per 1% of the company's own
  -- active roster attended, capped at 100; presenting weighted higher
  -- (2 points per 1%, capped at 150) since presenting is the rarer act.
  -- min_active_members = 3 is this migration's recommended anti-gaming
  -- default (see the header) — a company with 1–2 active members earns
  -- nothing from the two percent rules until its roster grows.
  insert into public.company_scoring_rules
    (org_id, action_key, enabled, points, points_per_percent, cap_points, min_active_members, reason_ar) values
    (p_org, 'company_hosting',         true, 100,  null, null, null, 'استضافة جلسة'),
    (p_org, 'company_attendance_pct',  true, null, 1.00, 100,  3,    'نسبة حضور موظفي الشركة'),
    (p_org, 'company_presenting_pct',  true, null, 2.00, 150,  3,    'نسبة تقديم موظفي الشركة')
  on conflict (org_id, action_key) do nothing;
end $$;
revoke execute on function public._seed_org_scoring(uuid) from public, anon, authenticated;

-- Backfill every org that already exists (including the live "kareem" org
-- once this migration is promoted and pushed) — on conflict do nothing
-- everywhere above makes re-running this for an existing org a pure
-- addition, exactly like 0027's own backfill block.
do $$
declare r record;
begin
  for r in select id from public.orgs loop
    perform public._seed_org_scoring(r.id);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- snapshot_leaderboard() (0042, scoring's own function) — create or
-- replace, identical except the 'company' branch: the board's total is now
-- the member-derived sum PLUS the company ledger's sum in the same period.
-- The denominator (active_member_count, frozen into the snapshot) is
-- unchanged — 05 §6.2's reasoning applies exactly as before, regardless of
-- which of the two sources a point came from.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.snapshot_leaderboard(
  p_org          uuid,
  p_kind         public.leaderboard_kind,
  p_period_start date default null,
  p_period_end   date default null,
  p_category_id  uuid default null,
  p_is_final     boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_snapshot_id  uuid;
  v_active_count int;
  v_metric       public.company_metric;
begin
  select count(*) into v_active_count from public.members where org_id = p_org and status = 'active';
  select company_metric into v_metric from public.org_settings where org_id = p_org;

  delete from public.leaderboard_snapshots
   where org_id = p_org and kind = p_kind
     and period_start is not distinct from p_period_start
     and period_end   is not distinct from p_period_end
     and category_id  is not distinct from p_category_id
     and not is_final;

  insert into public.leaderboard_snapshots (org_id, kind, period_start, period_end, category_id, metric, active_member_count, is_final)
  values (p_org, p_kind, p_period_start, p_period_end, p_category_id,
          case when p_kind = 'company' then v_metric else null end,
          v_active_count, p_is_final)
  returning id into v_snapshot_id;

  if p_kind in ('monthly', 'seasonal') then
    insert into public.leaderboard_entries (org_id, snapshot_id, member_id, rank, points)
    select p_org, v_snapshot_id, totals.member_id, rank() over (order by totals.total desc), totals.total
      from (
        select member_id, sum(amount) as total
          from public.points_ledger
         where org_id = p_org
           and (p_period_start is null or occurred_at >= p_period_start::timestamptz)
           and (p_period_end   is null or occurred_at <  p_period_end::timestamptz)
         group by member_id
      ) totals
     where totals.total > 0;

  elsif p_kind = 'topic' then
    insert into public.leaderboard_entries (org_id, snapshot_id, member_id, rank, points)
    select p_org, v_snapshot_id, totals.member_id, rank() over (order by totals.total desc), totals.total
      from (
        select pl.member_id, sum(pl.amount) as total
          from public.points_ledger pl
          join public.sessions s on s.id = pl.session_id
         where pl.org_id = p_org and s.category_id = p_category_id
         group by pl.member_id
      ) totals
     where totals.total > 0;

  elsif p_kind = 'company' then
    insert into public.leaderboard_entries (org_id, snapshot_id, company_id, rank, points, points_per_active_member)
    select p_org, v_snapshot_id, agg.company_id,
           rank() over (order by (case when v_metric = 'points_per_active_member' then agg.ppam else agg.total end) desc nulls last),
           agg.total, agg.ppam
      from (
        select c.id as company_id,
               coalesce(m_totals.total, 0) + coalesce(c_totals.total, 0) as total,
               (coalesce(m_totals.total, 0) + coalesce(c_totals.total, 0))::numeric / nullif(
                 (select count(*) from public.members mm where mm.org_id = p_org and mm.status = 'active' and mm.company_id = c.id),
                 0
               ) as ppam
          from public.companies c
          left join (
            select m.company_id, sum(pl.amount) as total
              from public.points_ledger pl
              join public.members m on m.id = pl.member_id
             where pl.org_id = p_org and m.company_id is not null
               and (p_period_start is null or pl.occurred_at >= p_period_start::timestamptz)
               and (p_period_end   is null or pl.occurred_at <  p_period_end::timestamptz)
             group by m.company_id
          ) m_totals on m_totals.company_id = c.id
          left join (
            select cl.company_id, sum(cl.amount) as total
              from public.company_points_ledger cl
             where cl.org_id = p_org
               and (p_period_start is null or cl.occurred_at >= p_period_start::timestamptz)
               and (p_period_end   is null or cl.occurred_at <  p_period_end::timestamptz)
             group by cl.company_id
          ) c_totals on c_totals.company_id = c.id
         where c.org_id = p_org and coalesce(m_totals.total, 0) + coalesce(c_totals.total, 0) <> 0
      ) agg;
  end if;

  return v_snapshot_id;
end $$;
revoke execute on function public.snapshot_leaderboard(uuid, public.leaderboard_kind, date, date, uuid, boolean)
  from public, anon, authenticated;
grant  execute on function public.snapshot_leaderboard(uuid, public.leaderboard_kind, date, date, uuid, boolean)
  to service_role;
