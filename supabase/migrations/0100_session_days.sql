-- wave 9 (DEC-119, DEC-120, DEC-121, DEC-150) — the foundation: a session has
-- one or more DAYS, and a day is an entity. This file is the lead's, and it
-- lands before any teammate's SQL: tables are the lead's, behaviour is the
-- tracks' (DEC-150 §4).
--
-- ★ THE ONE RULE EVERY CHOICE BELOW SERVES: main's app and main's worker must
-- be correct on this schema, because the owner pushes migrations BEFORE
-- merging and both deploy from main. So this file is ADDITIVE — no column is
-- dropped or renamed, no function is re-signed — and THIS FILE ALONE MUST
-- LEAVE EVERY EXISTING SUITE GREEN. That is the first half of «a one-day
-- session is byte-identical in behaviour», proven before the feature exists.
--
-- ★ WHY `sessions.starts_at` / `ends_at` STAY STORED. Every index
-- (`sessions_org_state_starts_idx`, `sessions_org_starts_idx`), every sort,
-- the clock jobs (0022), the reminder schedule (0034), the poster hook (0063),
-- the public card (0080) and three CHECK constraints read them. They become
-- DERIVED — the first day's start, the last day's end — and stay stored, so
-- none of those readers changes. The venue columns are derived the same way
-- (the FIRST day's): DEC-119 names only the window, but the venue columns
-- cannot be dropped (additive) and 0010's publish check reads them, so they
-- need exactly one meaning, and «where it begins» is the one a card can show.
--
-- ★ THREE TRIGGERS, AND WHY THERE ARE THREE.
--   B  session_days → sessions, any n. After a day write: renumber `position`
--      (derived — days of one session cannot overlap, so chronological order
--      is total), then update the session ONLY WHERE A VALUE IS DISTINCT, so
--      `sessions_notify`, the poster hook and the reminder schedule fire
--      exactly when they fire today and never because of a no-op.
--   A  sessions → session_days, n ≤ 1 ONLY. A writer that still writes the
--      session's own window — main's `schedule_session()`, and more than forty
--      fixtures and specs that insert or move a session directly — has its one
--      day created, moved or removed with it. This is what makes «a one-day
--      session is a session with one day» true of rows nobody migrated by
--      hand. It is a shim for WRITERS; no reader branches on it. A day-aware
--      writer sets the transaction-local `kareem.days_writer` to 'on' and A
--      stands down for that transaction.
--   C  a DEFERRED constraint trigger on both tables. At commit: a session
--      with days stores exactly its derived window and venue, and a session at
--      `published` or beyond has at least one day. C never stands down — the
--      flag silences A, not the truth.
--
-- ★ THE BACKFILL IS TRIGGER A'S OWN RULE APPLIED TO EVERY ROW: a session with
-- both ends gets one day carrying its window and venue; a session with
-- neither gets none. Stored = derived by construction, so B updates no
-- session row and NOTHING IS NOTIFIED, re-rendered or rescheduled by this
-- migration. A legacy row with one end and not the other (no writer produces
-- one; the CHECK forbids it from `published` onward) gets no day and is left
-- exactly as it is.
--
-- Serves:  REQ-SES-015, REQ-SES-017 (the column), REQ-SES-018 (the columns),
--          REQ-CHK-002, REQ-CHK-005, REQ-CHK-013, REQ-NFR-001 (invariant 5),
--          invariants 3 and 6
-- Cites:   0010 (sessions, check_in_codes, check_ins, check_in_attempts,
--          check_ins_window — re-created), 0037 (materials, session_tasks,
--          photos), 0087 (the partial unique index and the ORDER in which it
--          and the exclusion constraint are created — kept)
-- Docs:    DEC-150 §The foundation; 02 ENT-session_days
--
-- 03 §8.2 rows this adds:
--   | `POL-session_days.read_follows_session` | A member reads a day exactly when they can read its session: a published session's days are visible to the org, a draft's only to staff and its presenters; another org's never. |
--   | `POL-session_days.no_direct_write` | `authenticated` holds no insert, update or delete on `session_days`; every write is a definer RPC, as for every scheduling column since 0010. |
--   | `POL-session_days.single_day_follows_session` | A write to a session's own window or venue creates, moves or removes its one day while it has at most one; with `kareem.days_writer` on, it does not. |
--   | `POL-session_days.session_follows_days` | A day write re-derives the session's window (first start, last end), its venue (the first day's) and every day's `position` (chronological rank); an equal value writes nothing. |
--   | `POL-session_days.consistent_at_commit` | At commit a session with days stores its derived window and venue, and a session at `published` or beyond has a day; refused `23514` otherwise, whatever `kareem.days_writer` says. |
--   | `POL-session_days.no_overlap` | Two days of one session cannot overlap (`23P01`); a day ends after it starts. |
--   | `POL-check_ins.day_derived` | `check_ins.session_day_id` and `session_window` are derived on insert — the code's day, else `resolve_session_day()` — and the window is THE DAY'S. No day: `session_not_scheduled`, `23514`, as before. |
--   | `POL-check_ins.one_active_per_day` | One active check-in per member per DAY (`23505`); a second day of the same session is a second row. The overlap exclusion (`23P01`) still compares windows, now day windows (REQ-CHK-013). |
--   | `POL-content.day_of_own_session` | `materials`, `session_tasks` and `photos` may name a day only of their own session (`23503`); deleting the day sets the column null — the content is promoted to the session, never deleted (DEC-121). |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · the entity
-- ═══════════════════════════════════════════════════════════════════════════
create table public.session_days (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs(id) on delete cascade,
  session_id            uuid not null references public.sessions(id) on delete cascade,
  -- DERIVED: the chronological rank, 1…n, renumbered by session_days_derive().
  -- Never written by a caller; a BEFORE INSERT default keeps it not-null until
  -- the AFTER trigger has ranked the row.
  position              int  not null check (position >= 1),
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  venue_id              uuid references public.venues(id),
  custom_venue_name     text,
  custom_venue_address  text,
  custom_venue_map_url  text check (custom_venue_map_url is null or custom_venue_map_url ~ '^https://'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (ends_at > starts_at),
  -- the target of every composite foreign key below: a row that names a day
  -- names a day OF ITS OWN SESSION, by construction.
  constraint session_days_session_id_id_key unique (session_id, id),
  -- Deferrable so one UPDATE may renumber a whole session (uniqueness is then
  -- checked at the end of the statement, not row by row); initially immediate
  -- so nothing else gets a looser rule than it asked for.
  constraint session_days_session_position_key unique (session_id, position) deferrable initially immediate,
  -- No two days of one session overlap. Deferrable for the same reason a
  -- day-aware writer may need it: moving two days in one transaction passes
  -- through states that overlap. Initially immediate; such a writer says
  -- `set constraints … deferred` and then `… immediate` before it returns, so
  -- the refusal is still raised INSIDE the function, where it can be named.
  constraint session_days_no_overlap
    exclude using gist (session_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
    deferrable initially immediate
);
create index session_days_org_session_idx on public.session_days (org_id, session_id, position);
create index session_days_session_starts_idx on public.session_days (session_id, starts_at);
create trigger session_days_updated_at before update on public.session_days
  for each row execute function public.set_updated_at();

comment on table public.session_days is
  'DEC-119/DEC-120: when, where and which meeting — and nothing else. A one-day session is a session with one day. Written only by definer RPCs.';
comment on column public.session_days.position is
  'DERIVED AND STORED (DEC-150): the chronological rank within the session, renumbered by session_days_derive(). Never trust a client''s.';

alter table public.session_days enable row level security;

-- A day is visible exactly when its session is. The subquery runs as the
-- caller, so `sessions_read` (0010) decides — published-and-beyond to the org,
-- anything earlier to staff and the session's presenters — and this policy can
-- never drift from it.
create policy "session_days_read" on public.session_days for select to authenticated
  using (org_id = public.auth_org_id()
         and exists (select 1 from public.sessions s where s.id = session_days.session_id));

-- Invariant 6: every policy has its grant. No write policy and no write grant:
-- an admin holds no write on any scheduling column either (0010, 0021).
-- `service_role` gets nothing, as on `sessions` and `check_ins`: the worker
-- reaches a table only through a definer function (invariant 7).
revoke all on public.session_days from anon, authenticated, service_role;
grant select on public.session_days to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · position's not-null default
-- ═══════════════════════════════════════════════════════════════════════════
create function public.session_days_position_default() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A placeholder past the end; the AFTER trigger ranks it. Volatile, so a
  -- multi-row insert for one session sees the rows before it in the statement.
  new.position := coalesce((select max(d.position) from public.session_days d
                             where d.session_id = new.session_id), 0) + 1;
  if new.org_id is null then
    new.org_id := (select s.org_id from public.sessions s where s.id = new.session_id);
  end if;
  return new;
end $$;
create trigger session_days_position_default before insert on public.session_days
  for each row execute function public.session_days_position_default();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · trigger B — the days derive the session
-- ═══════════════════════════════════════════════════════════════════════════
create function public.session_days_derive() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid := coalesce(new.session_id, old.session_id);
  v_first   public.session_days;
  v_last    timestamptz;
begin
  -- The renumbering below re-enters this trigger once per moved row; a row
  -- whose only change is its rank has nothing left to derive.
  if tg_op = 'UPDATE'
     and new.starts_at = old.starts_at and new.ends_at = old.ends_at
     and new.venue_id is not distinct from old.venue_id
     and new.custom_venue_name is not distinct from old.custom_venue_name
     and new.custom_venue_address is not distinct from old.custom_venue_address
     and new.custom_venue_map_url is not distinct from old.custom_venue_map_url then
    return null;
  end if;

  update public.session_days d
     set position = r.rn
    from (select id, row_number() over (order by starts_at, id) as rn
            from public.session_days where session_id = v_session) r
   where d.id = r.id and d.position is distinct from r.rn;

  select * into v_first from public.session_days
   where session_id = v_session order by starts_at, id limit 1;
  select max(ends_at) into v_last from public.session_days where session_id = v_session;

  if v_first.id is null then
    -- The last day is gone: the session is unscheduled. From `published`
    -- onward 0010's CHECK refuses this update, which is the right refusal —
    -- a published session always has a day. The venue is left as it was.
    update public.sessions
       set starts_at = null, ends_at = null
     where id = v_session and (starts_at is not null or ends_at is not null);
  else
    -- ★ ONLY WHERE DISTINCT. An equal value must write nothing, or every
    -- AFTER UPDATE trigger on sessions — the reschedule notice, the poster
    -- re-render — would fire on a no-op.
    update public.sessions
       set starts_at            = v_first.starts_at,
           ends_at              = v_last,
           venue_id             = v_first.venue_id,
           custom_venue_name    = v_first.custom_venue_name,
           custom_venue_address = v_first.custom_venue_address,
           custom_venue_map_url = v_first.custom_venue_map_url
     where id = v_session
       and (starts_at, ends_at, venue_id, custom_venue_name, custom_venue_address, custom_venue_map_url)
           is distinct from
           (v_first.starts_at, v_last, v_first.venue_id, v_first.custom_venue_name,
            v_first.custom_venue_address, v_first.custom_venue_map_url);
  end if;
  return null;
end $$;
create trigger session_days_derive after insert or update or delete on public.session_days
  for each row execute function public.session_days_derive();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · the backfill — every existing session with a window becomes one day
-- ═══════════════════════════════════════════════════════════════════════════
-- Stored = derived by construction, so trigger B (already live) updates no
-- session and nothing downstream fires. Trigger A does not exist yet.
insert into public.session_days
  (org_id, session_id, position, starts_at, ends_at,
   venue_id, custom_venue_name, custom_venue_address, custom_venue_map_url)
select s.org_id, s.id, 1, s.starts_at, s.ends_at,
       s.venue_id, s.custom_venue_name, s.custom_venue_address, s.custom_venue_map_url
  from public.sessions s
 where s.starts_at is not null and s.ends_at is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 · trigger A — a writer of the session's own window carries its one day
-- ═══════════════════════════════════════════════════════════════════════════
create function public.sessions_sync_single_day() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  -- A day-aware writer (DEC-150, contract 1) writes `sessions` once and then
  -- its days; it says so, and this shim stands down. Trigger C does not.
  if current_setting('kareem.days_writer', true) is not distinct from 'on' then
    return null;
  end if;

  select count(*) into n from public.session_days where session_id = new.id;
  if n > 1 then
    return null;          -- not this shim's to decide; trigger C checks the pair at commit
  end if;

  if new.starts_at is null or new.ends_at is null then
    if n = 1 then
      -- The window was cleared: the session is unscheduled, so its day goes.
      -- A day that holds attendance cannot go (check_ins is `restrict`), and
      -- that refusal is correct.
      delete from public.session_days where session_id = new.id;
    end if;
    return null;
  end if;

  if n = 0 then
    insert into public.session_days
      (org_id, session_id, position, starts_at, ends_at,
       venue_id, custom_venue_name, custom_venue_address, custom_venue_map_url)
    values (new.org_id, new.id, 1, new.starts_at, new.ends_at,
            new.venue_id, new.custom_venue_name, new.custom_venue_address, new.custom_venue_map_url);
  else
    update public.session_days
       set starts_at            = new.starts_at,
           ends_at              = new.ends_at,
           venue_id             = new.venue_id,
           custom_venue_name    = new.custom_venue_name,
           custom_venue_address = new.custom_venue_address,
           custom_venue_map_url = new.custom_venue_map_url
     where session_id = new.id
       and (starts_at, ends_at, venue_id, custom_venue_name, custom_venue_address, custom_venue_map_url)
           is distinct from
           (new.starts_at, new.ends_at, new.venue_id, new.custom_venue_name,
            new.custom_venue_address, new.custom_venue_map_url);
  end if;
  return null;
end $$;

-- ★ THE NAME IS LOAD-BEARING. AFTER triggers on one event fire in name order,
-- and `sessions_notify` (0036) reschedules reminders inline. Once reminders
-- are per day (contract 8) that function reads `session_days`, so the day
-- must already carry the new window when it runs: `sessions_00_…` sorts before
-- every `sessions_<letter>…` trigger on this table.
create trigger sessions_00_sync_single_day
  after insert or update of starts_at, ends_at, venue_id,
                            custom_venue_name, custom_venue_address, custom_venue_map_url
  on public.sessions
  for each row execute function public.sessions_sync_single_day();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6 · trigger C — the pair is checked at commit, whatever the flag says
-- ═══════════════════════════════════════════════════════════════════════════
create function public.assert_session_days_consistent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid;
  s         public.sessions;
  v_first   public.session_days;
  v_last    timestamptz;
begin
  if tg_table_name = 'sessions' then
    v_session := new.id;
  else
    v_session := coalesce(new.session_id, old.session_id);
  end if;

  select * into s from public.sessions where id = v_session;
  if s.id is null then
    return null;                                   -- deleted with its days; nothing to hold
  end if;

  select * into v_first from public.session_days
   where session_id = v_session order by starts_at, id limit 1;

  if v_first.id is null then
    if s.state in ('published', 'in_progress', 'completed', 'archived') then
      raise exception 'session_without_days: %', v_session using errcode = '23514';
    end if;
    return null;
  end if;

  select max(ends_at) into v_last from public.session_days where session_id = v_session;
  if (s.starts_at, s.ends_at, s.venue_id, s.custom_venue_name, s.custom_venue_address, s.custom_venue_map_url)
     is distinct from
     (v_first.starts_at, v_last, v_first.venue_id, v_first.custom_venue_name,
      v_first.custom_venue_address, v_first.custom_venue_map_url) then
    raise exception 'session_window_not_derived: %', v_session using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger session_days_consistent
  after insert or update or delete on public.session_days
  deferrable initially deferred
  for each row execute function public.assert_session_days_consistent();

create constraint trigger sessions_days_consistent
  after insert or update of state, starts_at, ends_at, venue_id,
                            custom_venue_name, custom_venue_address, custom_venue_map_url
  on public.sessions
  deferrable initially deferred
  for each row execute function public.assert_session_days_consistent();

-- ═══════════════════════════════════════════════════════════════════════════
-- 7 · which day? — the one rule every legacy inserter and every null `p_day`
--     resolves through (contract 4)
-- ═══════════════════════════════════════════════════════════════════════════
create function public.resolve_session_day(p_session uuid, p_at timestamptz default now())
returns uuid
language sql stable security definer set search_path = '' as $$
  select d.id
    from public.session_days d
   where d.session_id = p_session
   order by
     -- 1 · the day whose check-in window — its start to its end + 2 h
     --     (REQ-CHK-016) — contains the instant; the later-started of two
     (p_at >= d.starts_at and p_at < d.ends_at + interval '2 hours') desc,
     -- 2 · else the latest day already begun
     (d.starts_at <= p_at) desc,
     case when d.starts_at <= p_at then d.starts_at end desc nulls last,
     -- 3 · else nothing has begun: the first day
     d.starts_at asc
   limit 1
$$;
-- Callable by NO client role. It is definer and takes a bare session id, so a
-- member could otherwise resolve a day of another org's session; every caller
-- is a definer function or trigger, which runs as the owner and needs no grant.
revoke execute on function public.resolve_session_day(uuid, timestamptz) from public, anon, authenticated, service_role;
comment on function public.resolve_session_day(uuid, timestamptz) is
  'DEC-150, contract 4: the day an instant belongs to. At one day it is that day, always. Null when the session has no day.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8 · check-in moves to the day (DEC-119) — always per day, no session-level
--     alternative. `session_id` STAYS on all three: has_checked_in(), every
--     policy and every reader of main keeps working (additive).
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.check_in_codes    add column session_day_id uuid;
alter table public.check_ins         add column session_day_id uuid;
alter table public.check_in_attempts add column session_day_id uuid;

-- Every existing session has exactly one day, so the join is 1:1.
update public.check_in_codes c set session_day_id = d.id
  from public.session_days d where d.session_id = c.session_id;
update public.check_ins c set session_day_id = d.id
  from public.session_days d where d.session_id = c.session_id;
update public.check_in_attempts a set session_day_id = d.id
  from public.session_days d where d.session_id = a.session_id;

-- A code or a check-in on a session with no window cannot exist: issuance and
-- check_ins_window() both refuse one. Asserted here rather than assumed, so a
-- production row that contradicts it stops the migration instead of being
-- silently orphaned by the `not null` below.
do $$
begin
  if exists (select 1 from public.check_ins where session_day_id is null) then
    raise exception '0100: a check_ins row has no day — its session has no window';
  end if;
  if exists (select 1 from public.check_in_codes where session_day_id is null) then
    raise exception '0100: a check_in_codes row has no day — its session has no window';
  end if;
end $$;

alter table public.check_in_codes alter column session_day_id set not null;
alter table public.check_ins      alter column session_day_id set not null;

-- Composite: a row names a day OF ITS OWN SESSION. `check_ins` is `no action`
-- — attendance is evidence, and a day that holds it cannot be deleted; the
-- codes go with their day; an attempt outlives it with the column cleared.
alter table public.check_in_codes
  add constraint check_in_codes_session_day_fkey
  foreign key (session_id, session_day_id) references public.session_days (session_id, id) on delete cascade;
alter table public.check_ins
  add constraint check_ins_session_day_fkey
  foreign key (session_id, session_day_id) references public.session_days (session_id, id);
alter table public.check_in_attempts
  add constraint check_in_attempts_session_day_fkey
  foreign key (session_id, session_day_id) references public.session_days (session_id, id)
  on delete set null (session_day_id);

create index check_in_codes_day_valid_idx on public.check_in_codes (session_day_id, valid_until desc);
create index check_ins_org_day_idx        on public.check_ins (org_id, session_day_id);
create index check_in_attempts_day_rate_idx on public.check_in_attempts (session_day_id, member_id, attempted_at desc);

-- REQ-CHK-005 becomes one active check-in per member PER DAY. ★ The ORDER is
-- 0087's and is kept on purpose: the unique index FIRST, the exclusion
-- constraint re-created AFTER it. Postgres checks them in creation order, and
-- a duplicate must still be refused `23505`, not `23P01` — wave 8's rehearsal
-- met exactly that inversion on a restored dump.
drop index public.check_ins_session_member_active_uq;
create unique index check_ins_day_member_active_uq
  on public.check_ins (session_day_id, member_id) where removed_at is null;
alter table public.check_ins drop constraint check_ins_member_id_session_window_excl;
alter table public.check_ins add constraint check_ins_member_id_session_window_excl
  exclude using gist (member_id with =, session_window with &&) where (removed_at is null);

-- check_ins_window() — re-created (0010). `session_window` is THE DAY'S window,
-- derived here, always, so no RPC can get it wrong; and the day itself is
-- derived for every inserter that does not name one — which today is all of
-- them. Same refusal, same code, when there is no day to belong to.
create or replace function public.check_ins_window() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s     public.sessions;
  d     public.session_days;
  v_day uuid := new.session_day_id;
begin
  select * into s from public.sessions where id = new.session_id;
  if v_day is null and new.code_id is not null then
    -- The code belongs to a day, so the member never says which.
    select c.session_day_id into v_day from public.check_in_codes c
     where c.id = new.code_id and c.session_id = new.session_id;
  end if;
  if v_day is null then
    v_day := public.resolve_session_day(new.session_id, coalesce(new.arrived_at, now()));
  end if;
  select * into d from public.session_days where id = v_day and session_id = new.session_id;
  if d.id is null then
    raise exception 'session_not_scheduled' using errcode = '23514';
  end if;
  new.session_day_id := d.id;
  new.session_window := tstzrange(d.starts_at, d.ends_at, '[)');
  new.org_id := s.org_id;
  return new;
end $$;

-- The same derivation for the two tables that had no trigger. A code without a
-- day is refused by `not null`; an attempt may have none (it is recorded
-- before anything about the session is checked — DEC-015).
create function public.check_in_day_default() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.session_day_id is null then
    new.session_day_id := public.resolve_session_day(new.session_id, now());
  end if;
  return new;
end $$;
create trigger check_in_codes_day_default before insert on public.check_in_codes
  for each row execute function public.check_in_day_default();
create trigger check_in_attempts_day_default before insert on public.check_in_attempts
  for each row execute function public.check_in_day_default();

-- ═══════════════════════════════════════════════════════════════════════════
-- 9 · content belongs to the session OR to a day (DEC-121) — one nullable
--     column on three tables; NULL IS THE WHOLE SESSION. No backfill: a
--     one-day session's content is session-scoped, which is what makes
--     «adding a second day re-scopes nothing» true.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.materials     add column session_day_id uuid;
alter table public.session_tasks add column session_day_id uuid;
alter table public.photos        add column session_day_id uuid;

-- MATCH SIMPLE: with `session_day_id` null the key is not checked at all, so a
-- proposal's material (no session) and every session-scoped row pass untouched.
-- ON DELETE SET NULL (session_day_id) — only that column — IS DEC-121's
-- «deleting a day that has content … defaults to promoting that content to the
-- session»: nothing is deleted as a side effect of a scheduling change.
alter table public.materials
  add constraint materials_session_day_fkey
  foreign key (session_id, session_day_id) references public.session_days (session_id, id)
  on delete set null (session_day_id),
  add constraint materials_day_needs_session check (session_day_id is null or session_id is not null);
alter table public.session_tasks
  add constraint session_tasks_session_day_fkey
  foreign key (session_id, session_day_id) references public.session_days (session_id, id)
  on delete set null (session_day_id);
alter table public.photos
  add constraint photos_session_day_fkey
  foreign key (session_id, session_day_id) references public.session_days (session_id, id)
  on delete set null (session_day_id);

create index materials_day_idx     on public.materials (session_day_id)     where session_day_id is not null;
create index session_tasks_day_idx on public.session_tasks (session_day_id) where session_day_id is not null;
create index photos_day_idx        on public.photos (session_day_id)        where session_day_id is not null;

comment on column public.materials.session_day_id is
  'DEC-121: null = the whole session. `phase` is relative to this scope (REQ-MAT-006 as amended).';
comment on column public.session_tasks.session_day_id is
  'DEC-121: null = the whole session. ★ REQ-TSK-002: tasks are reminder-only and NEVER read by any check-in path — sharing a day with attendance changes nothing about that.';
comment on column public.photos.session_day_id is
  'DEC-121: null = the whole session. Never asked of the uploader: the day whose window contains the upload time, and null while the session has one day.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 10 · points and the certificate need every day, by default (REQ-SES-017)
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.sessions add column require_all_days boolean not null default true;
comment on column public.sessions.require_all_days is
  'REQ-SES-017: attendance points and the certificate require an active check-in on EVERY day. A per-session setting an admin may relax, beside certificate_mode. Means nothing at one day.';
