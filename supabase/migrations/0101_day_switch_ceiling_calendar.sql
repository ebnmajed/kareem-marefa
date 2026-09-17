-- wave 9, sync 1 (DEC-151) — the columns two tracks named in their plans, and
-- the one rule the sync ruled: A DAY'S CHECK-IN CEILING IS CAPPED BY THE NEXT
-- DAY'S START. Tables are the lead's (DEC-150 §4); this file is the second and
-- last half of the foundation. Like 0100 it is additive, and like 0100 IT MUST
-- LEAVE EVERY EXISTING SUITE GREEN ON ITS OWN.
--
-- 1 · `session_days.check_in_open` — `checkin`'s request. DEC-116's switch (open
--     by default, closed by hand) is the DAY'S (DEC-119). Backfilled from the
--     session IN THIS TRANSACTION, so a session whose door is closed today never
--     has a day born open. `sessions.check_in_open` STAYS and keeps its meaning
--     at one day (contract 2) — main reads it; how the pair is kept in step is
--     `checkin`'s behaviour, not this file's. Trigger A (0100) is re-created so
--     the day it CREATES for a legacy writer carries the session's switch: a
--     fixture that inserts a session closed must not get a day open — once
--     `checkin`'s shadow exists, that day would flip the session open.
--
-- 2 · `check_in_ceiling(p_day)` — the ruling. A 9–12 day and a 13–16 day on one
--     date: uncapped, day 1's window (to 14:00) and day 2's overlap at 13:30, so
--     the clock names day 2 while an explicit `p_day` still reaches day 1 — two
--     answers from one instant, depending on the door you came through; and a
--     day-1 check-in at 13:30 records a person at a meeting that ended ninety
--     minutes ago while another is running in the same room. Capped, the windows
--     of one session's days can never overlap, so «which day?» has one answer.
--     The cost is stated: a morning room still catching stragglers at 13:05
--     loses its grace — only because the next meeting has begun — and the
--     admin's manual mark, which has no ceiling (REQ-CHK-017), is the release
--     valve DEC-116 designed. ★ INERT AT ONE DAY BY ARITHMETIC: there is no next
--     day, and least(x, null) is x.
--     It is ONE function, the lead's, because `resolve_session_day()` (0100) must
--     use the same cap — re-created here to call it — and `checkin`'s gates call
--     it rather than copying it. The TypeScript twin is `checkInDay()` in
--     src/lib/session-status.ts.
--
-- 3 · `calendar_events.session_day_id` — `notify`'s request (DEC-119: one
--     calendar entry per day). Composite key, so a row names a day of its own
--     session; ON DELETE SET NULL (session_day_id), NEVER CASCADE — the row is
--     the only record of the provider event id in a member's calendar, so it
--     must outlive its day long enough for the delete job to run. Null therefore
--     means exactly one thing: «this event's day is gone — remove it».
--     ★ THE OLD `unique (member_id, session_id)` STAYS IN THIS FILE, ON PURPOSE.
--     main's `record_calendar_sync()` says `on conflict (member_id, session_id)`;
--     dropping the constraint in a different file from the one that re-creates
--     that function would fail every calendar sync with 42P10 in between. It is
--     dropped in the SAME file as `notify`'s new function body — one lead-authored
--     line carried in that file (DEC-151). Until then both hold, which at one day
--     per session they trivially do.
--
-- Serves:  REQ-CHK-015, REQ-CHK-016, REQ-SES-015, REQ-CAL-004, REQ-NFR-001
-- Cites:   0100 (session_days, sessions_sync_single_day and resolve_session_day —
--          both re-created), 0038 (calendar_events), 0084 (check_in_open on
--          sessions, the + 2 h ceiling)
-- Docs:    DEC-151; docs/plan/notes/{checkin,notify}.md «Wave 9 plan»
--
-- 03 §8.2 rows this adds:
--   | `POL-session_days.switch_born_with_session` | A day created for a legacy writer of the session's window carries the session's `check_in_open`; an existing day's switch is not touched by a later write to the session's window. |
--   | `RPC-check_in_ceiling.capped_by_next_day` | A day's check-in ceiling is `least(ends_at + 2 h, the next day's starts_at)`; with no next day it is `ends_at + 2 h`, exactly a one-day session's ceiling. Executable by no client role. |
--   | `RPC-resolve_session_day.windows_never_overlap` | With the cap, at most one day of a session holds any instant: at 13:30 between a 9–12 and a 13–16 day the answer is the afternoon, and at 12:30 the morning. |
--   | `POL-calendar_events.legacy_insert_gets_first_day` | A row inserted with no day — main's `record_calendar_sync()` — is given its session's first day, so a null day only ever means «the day was deleted» or «the session has none». |
--   | `POL-calendar_events.day_of_own_session` | A calendar row may name a day only of its own session (`23503`); deleting the day sets the column null and KEEPS the row, so the provider event can still be removed; one row per member per day. |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · the day's switch
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.session_days add column check_in_open boolean not null default true;
comment on column public.session_days.check_in_open is
  'DEC-116/DEC-119: the manual check-in switch, per DAY — open by default, closed by hand from the host view, never later than check_in_ceiling(). sessions.check_in_open stays for main and keeps its meaning at one day (contract 2).';

update public.session_days d
   set check_in_open = s.check_in_open
  from public.sessions s
 where s.id = d.session_id and d.check_in_open is distinct from s.check_in_open;

-- Trigger A (0100), re-created. The ONE change is `check_in_open` in the INSERT:
-- a day this shim CREATES is born with its session's switch. The UPDATE branch
-- is untouched and deliberately does not carry the switch — moving a session's
-- window is not a statement about its door.
create or replace function public.sessions_sync_single_day() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if current_setting('kareem.days_writer', true) is not distinct from 'on' then
    return null;
  end if;

  select count(*) into n from public.session_days where session_id = new.id;
  if n > 1 then
    return null;          -- not this shim's to decide; trigger C checks the pair at commit
  end if;

  if new.starts_at is null or new.ends_at is null then
    if n = 1 then
      delete from public.session_days where session_id = new.id;
    end if;
    return null;
  end if;

  if n = 0 then
    insert into public.session_days
      (org_id, session_id, position, starts_at, ends_at,
       venue_id, custom_venue_name, custom_venue_address, custom_venue_map_url, check_in_open)
    values (new.org_id, new.id, 1, new.starts_at, new.ends_at,
            new.venue_id, new.custom_venue_name, new.custom_venue_address, new.custom_venue_map_url,
            new.check_in_open);
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · the ceiling, capped by the next day — one function, and the resolver
--     re-created to use it
-- ═══════════════════════════════════════════════════════════════════════════
create function public.check_in_ceiling(p_day uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select least(
           d.ends_at + interval '2 hours',                       -- REQ-CHK-016
           (select min(n.starts_at) from public.session_days n   -- DEC-151: the next meeting has begun
             where n.session_id = d.session_id and n.starts_at > d.starts_at)
         )                                                       -- least() ignores a null: no next day, no cap
    from public.session_days d
   where d.id = p_day
$$;
-- Every caller is a definer function, which runs as the owner and needs no
-- grant — and it takes a bare day id, so a member could otherwise read the
-- schedule of another org's day. `service_role` holds it for the worker's
-- rotate_codes query, which runs SQL of its own.
revoke execute on function public.check_in_ceiling(uuid) from public, anon, authenticated;
grant  execute on function public.check_in_ceiling(uuid) to service_role;
comment on function public.check_in_ceiling(uuid) is
  'DEC-151: the instant a day stops taking attendance — least(ends_at + 2 h, the next day''s start). At one day: ends_at + 2 h. The ONE definition; check-in gates call it, never copy it.';

create or replace function public.resolve_session_day(p_session uuid, p_at timestamptz default now())
returns uuid
language sql stable security definer set search_path = '' as $$
  select d.id
    from public.session_days d
   where d.session_id = p_session
   order by
     -- 1 · the day taking attendance at the instant: its start to its CAPPED
     --     ceiling. With the cap no two days of a session can both hold it; the
     --     later-started tie-break below is kept as defence, never as a rule.
     (p_at >= d.starts_at and p_at < public.check_in_ceiling(d.id)) desc,
     -- 2 · else the latest day already begun
     (d.starts_at <= p_at) desc,
     case when d.starts_at <= p_at then d.starts_at end desc nulls last,
     -- 3 · else nothing has begun: the first day
     d.starts_at asc
   limit 1
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · one calendar entry per day
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.calendar_events add column session_day_id uuid;

alter table public.calendar_events
  add constraint calendar_events_session_day_fkey
  foreign key (session_id, session_day_id) references public.session_days (session_id, id)
  on delete set null (session_day_id);

-- Every session that has a calendar row has at most one per member today
-- (`unique (member_id, session_id)`) and, after 0100, exactly one day when it
-- has a window — so the row that exists today IS that day's row: same id, same
-- provider_event_id, same state. A row whose session has no day stays null,
-- which `notify`'s code reads as «remove it» — correct for a session with no
-- time. Nothing is inserted, nothing deleted, no member's calendar changes.
update public.calendar_events ce
   set session_day_id = d.id
  from public.session_days d
 where d.session_id = ce.session_id and ce.session_day_id is null;

-- ★ A legacy inserter gets its day, as on the check-in tables (0100). main's
-- `record_calendar_sync()` inserts with no day, and it keeps running between the
-- owner's push and the merge — and after it, until `notify`'s body replaces it.
-- Left null, such a row would be read as «the day is gone — remove the provider
-- event», and the new worker would delete an entry the member was just given.
-- So null on INSERT resolves to the session's first day; the ONLY way a row is
-- left with a null day is its day being deleted, or its session having none.
create function public.calendar_events_day_default() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.session_day_id is null then
    new.session_day_id := (select d.id from public.session_days d
                            where d.session_id = new.session_id
                            order by d.starts_at, d.id limit 1);
  end if;
  return new;
end $$;
create trigger calendar_events_day_default before insert on public.calendar_events
  for each row execute function public.calendar_events_day_default();

-- The NEW rule beside the old one (see the header: the old one leaves in the
-- same file as the function that names it). Nulls are distinct, so several
-- orphaned rows of one member never collide.
alter table public.calendar_events
  add constraint calendar_events_member_day_key unique (member_id, session_day_id);
create index calendar_events_member_session_idx on public.calendar_events (member_id, session_id);

comment on column public.calendar_events.session_day_id is
  'DEC-119: one calendar entry per day. NULL means exactly one thing — the day this event belonged to is gone, remove the provider event (DEC-151).';
