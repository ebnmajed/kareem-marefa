-- 0010 — the M2 schema: proposals, sessions, RSVP, check-in, the event page,
-- ratings. Tables, constraints, RLS, grants — no RPCs.
-- 02-domain-model.md §3, §4.3–4.5, §4.7, §4.8, §5, §6 · 03-permissions-rls.md
-- §2, §5.2–5.4, §5.6 · DEC-015 · DEC-040 (wave 0 of the agent team)
--
-- The RPCs that make these tables move — reserve_seat(), check_in(), the
-- proposal and session transitions, manual marking — are the wave-1
-- teammates' work, developed under supabase/proposed/ and promoted by the
-- lead. This migration gives every teammate the same shape to build on.
-- Same discipline as 0004: grants written in both directions, service_role
-- revoked everywhere, no super-admin disjunct anywhere.

create extension if not exists btree_gist with schema extensions;

-- ── Enums (02 §3, the M2 subset) ────────────────────────────────────────────
create type public.proposal_state    as enum ('draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'rejected');
create type public.session_state     as enum ('draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'published', 'in_progress', 'completed', 'archived', 'cancelled');
create type public.session_level     as enum ('introductory', 'intermediate', 'advanced');
create type public.session_language  as enum ('ar', 'en');
create type public.certificate_mode  as enum ('off', 'automatic', 'review');
create type public.rsvp_status       as enum ('confirmed', 'waitlisted', 'cancelled', 'late_cancelled');
create type public.check_in_method   as enum ('code', 'manual');
create type public.report_target     as enum ('comment', 'photo');
create type public.report_status     as enum ('open', 'resolved', 'dismissed');
create type public.moderation_action as enum ('removed', 'restored', 'dismissed');

-- ═══════════════════════════════════════════════════════════════════════════
-- proposals — no date, time or venue column: REQ-PRO-001 is a schema fact.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.proposals (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.orgs(id) on delete cascade,
  proposer_id                 uuid not null references public.members(id),
  title                       text not null check (char_length(btrim(title)) between 3 and 150),
  abstract                    text not null check (char_length(abstract) between 1 and 2000),
  category_id                 uuid not null references public.categories(id),
  level                       public.session_level not null,
  target_audience             text check (target_audience is null or char_length(target_audience) <= 300),
  expected_duration_minutes   int check (expected_duration_minutes is null or expected_duration_minutes between 15 and 480),
  admin_notes                 text check (admin_notes is null or char_length(admin_notes) <= 2000),
  state                       public.proposal_state not null default 'draft',
  decision_reason             text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  check (state not in ('rejected', 'changes_requested') or decision_reason is not null)   -- REQ-PRO-005
);
create index proposals_org_state_idx on public.proposals (org_id, state, created_at desc);
create index proposals_org_proposer_idx on public.proposals (org_id, proposer_id);
create trigger proposals_updated_at before update on public.proposals
  for each row execute function public.set_updated_at();

create table public.proposal_presenters (
  org_id       uuid not null references public.orgs(id) on delete cascade,
  proposal_id  uuid not null references public.proposals(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  accepted     boolean not null default false,
  declined_at  timestamptz,
  created_at   timestamptz not null default now(),
  primary key (proposal_id, member_id),
  check (not (accepted and declined_at is not null))
);
create index proposal_presenters_org_member_idx on public.proposal_presenters (org_id, member_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- sessions — the publish gate is a constraint, not a code path (REQ-SES-001).
-- `full` is not a column (REQ-SES-003).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.sessions (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.orgs(id) on delete cascade,
  proposal_id               uuid references public.proposals(id),          -- null when admin-created (REQ-PRO-007)
  title                     text not null check (char_length(btrim(title)) between 3 and 150),
  abstract                  text not null check (char_length(abstract) between 1 and 2000),
  category_id               uuid not null references public.categories(id),
  level                     public.session_level not null,
  language                  public.session_language not null default 'ar',
  starts_at                 timestamptz,
  duration_minutes          int check (duration_minutes is null or duration_minutes between 15 and 480),
  ends_at                   timestamptz,
  time_zone                 text not null default 'Asia/Riyadh',
  venue_id                  uuid references public.venues(id),
  custom_venue_name         text,
  custom_venue_address      text,
  custom_venue_map_url      text check (custom_venue_map_url is null or custom_venue_map_url ~ '^https://'),
  capacity                  int check (capacity is null or capacity between 1 and 10000),
  rsvp_deadline_at          timestamptz,
  cancellation_cutoff_at    timestamptz,
  certificate_mode          public.certificate_mode not null default 'off',
  state                     public.session_state not null default 'draft',
  published_at              timestamptz,
  completed_at              timestamptz,
  cancelled_at              timestamptz,
  cancellation_reason       text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (rsvp_deadline_at is null or starts_at is null or rsvp_deadline_at <= starts_at),
  check (cancellation_cutoff_at is null or starts_at is null or cancellation_cutoff_at <= starts_at),
  check (venue_id is not null or custom_venue_name is not null
         or state in ('draft', 'submitted', 'in_review', 'changes_requested', 'approved')),
  -- REQ-SES-001: nothing reaches `published` (or past it) without a time, a place and a capacity
  check (state not in ('published', 'in_progress', 'completed', 'archived')
         or (starts_at is not null and ends_at is not null and capacity is not null
             and (venue_id is not null or custom_venue_name is not null))),
  check (state <> 'cancelled' or cancellation_reason is not null)
);
create index sessions_org_state_starts_idx on public.sessions (org_id, state, starts_at);
create index sessions_org_category_idx     on public.sessions (org_id, category_id);
create index sessions_org_starts_idx       on public.sessions (org_id, starts_at);
create trigger sessions_updated_at before update on public.sessions
  for each row execute function public.set_updated_at();

create table public.session_presenters (
  org_id       uuid not null references public.orgs(id) on delete cascade,
  session_id   uuid not null references public.sessions(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  accepted     boolean not null default false,
  declined_at  timestamptz,
  created_at   timestamptz not null default now(),
  primary key (session_id, member_id),
  check (not (accepted and declined_at is not null))
);
create index session_presenters_org_member_idx on public.session_presenters (org_id, member_id);

-- A5 / OQ-021: presenters ≤ org_settings.max_co_presenters + 1, on both tables.
create function public.presenters_within_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_max int; v_count int; v_parent uuid;
begin
  select max_co_presenters + 1 into v_max from public.org_settings where org_id = new.org_id;
  if tg_table_name = 'proposal_presenters' then
    v_parent := new.proposal_id;
    select count(*) into v_count from public.proposal_presenters where proposal_id = v_parent;
  else
    v_parent := new.session_id;
    select count(*) into v_count from public.session_presenters where session_id = v_parent;
  end if;
  if v_count > coalesce(v_max, 5) then
    raise exception 'too_many_presenters' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger proposal_presenters_limit after insert on public.proposal_presenters
  for each row execute function public.presenters_within_limit();
create trigger session_presenters_limit after insert on public.session_presenters
  for each row execute function public.presenters_within_limit();

-- Every transition writes a row (02 §4.3). Append-only; written by the RPC
-- that performs the transition, never directly.
create table public.session_state_transitions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  session_id   uuid not null references public.sessions(id) on delete cascade,
  from_state   public.session_state,
  to_state     public.session_state not null,
  actor_id     uuid references public.members(id),                 -- null when the clock did it
  is_manual    boolean not null,
  reason       text,
  occurred_at  timestamptz not null default now()
);
create index session_state_transitions_session_idx on public.session_state_transitions (org_id, session_id, occurred_at desc);

-- ── The two helpers 03 §2 defines on these tables. SECURITY DEFINER so a
-- policy that depends on them does not have to satisfy their tables' own
-- policies first. (has_checked_in() follows check_ins below.)
create function public.is_presenter_of(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.session_presenters sp
     where sp.session_id = p_session
       and sp.member_id  = public.auth_member_id()
       and sp.accepted
  )
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- rsvps — capacity is enforced in the reserving transaction (RPC), never here.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.rsvps (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.orgs(id) on delete cascade,
  session_id             uuid not null references public.sessions(id) on delete cascade,
  member_id              uuid not null references public.members(id) on delete cascade,
  status                 public.rsvp_status not null,
  waitlist_position      int,
  reserved_at            timestamptz not null default now(),
  promoted_at            timestamptz,
  cancelled_at           timestamptz,
  was_late_cancellation  boolean not null default false,
  updated_at             timestamptz not null default now(),
  unique (session_id, member_id),
  check ((status = 'waitlisted') = (waitlist_position is not null)),
  check (status not in ('cancelled', 'late_cancelled') or cancelled_at is not null),
  check (was_late_cancellation = false or status = 'late_cancelled')
);
create unique index rsvps_waitlist_position_key on public.rsvps (session_id, waitlist_position) where status = 'waitlisted';
create index rsvps_org_session_status_idx on public.rsvps (org_id, session_id, status);
create index rsvps_org_member_idx on public.rsvps (org_id, member_id);
create trigger rsvps_updated_at before update on public.rsvps
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- check-in — the integrity keystone. Three tables; the constraints do the work.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.check_in_codes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  session_id   uuid not null references public.sessions(id) on delete cascade,
  -- 6 chars from an alphabet without 0/O, 1/I/L, 5/S, 2/Z, 8/B: read aloud, typed blind
  code         text not null check (code ~ '^[ACDEFGHJKMNPQRTUVWXY34679]{6}$'),
  valid_from   timestamptz not null,
  valid_until  timestamptz not null,
  revoked_at   timestamptz,
  revoked_by   uuid references public.members(id),
  created_at   timestamptz not null default now(),
  unique (session_id, code),
  check (valid_until > valid_from)
);
create index check_in_codes_session_valid_idx on public.check_in_codes (session_id, valid_until desc);

create table public.check_ins (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  session_id      uuid not null references public.sessions(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  method          public.check_in_method not null,
  code_id         uuid references public.check_in_codes(id),
  manual_reason   text,
  marked_by       uuid references public.members(id),
  arrived_at      timestamptz not null default now(),
  session_window  tstzrange not null,
  created_at      timestamptz not null default now(),
  unique (session_id, member_id),                                                  -- REQ-CHK-005
  check (method <> 'manual' or (manual_reason is not null and marked_by is not null)),
  check (method <> 'code'   or code_id is not null),
  -- REQ-CHK-013: a member cannot be in two rooms at once. Structural.
  exclude using gist (member_id with =, session_window with &&)
);
create index check_ins_org_session_idx on public.check_ins (org_id, session_id);
create index check_ins_org_member_idx  on public.check_ins (org_id, member_id, arrived_at desc);

-- session_window is derived from the session, always, so no RPC can get it wrong.
create function public.check_ins_window() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = new.session_id;
  if s.starts_at is null or s.ends_at is null then
    raise exception 'session_not_scheduled' using errcode = '23514';
  end if;
  new.session_window := tstzrange(s.starts_at, s.ends_at, '[)');
  new.org_id := s.org_id;
  return new;
end $$;
create trigger check_ins_window before insert on public.check_ins
  for each row execute function public.check_ins_window();

-- has_checked_in() — "the most important function in the permissions
-- document" (03 §2): four rights depend on the verified check-in event and
-- nothing else (D24). A SQL function is validated at creation, so it lives
-- here, after the table it reads.
create function public.has_checked_in(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.check_ins c
     where c.session_id = p_session and c.member_id = public.auth_member_id()
  )
$$;

create table public.check_in_attempts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  session_id      uuid not null references public.sessions(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  submitted_code  text not null,
  succeeded       boolean not null default false,
  attempted_at    timestamptz not null default now()
);
create index check_in_attempts_rate_idx on public.check_in_attempts (session_id, member_id, attempted_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- the event page — comments, reactions, reports (photos arrive with M5)
-- ═══════════════════════════════════════════════════════════════════════════
create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  author_id   uuid not null references public.members(id),
  parent_id   uuid references public.comments(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  edited_at   timestamptz,
  deleted_at  timestamptz,
  deleted_by  uuid references public.members(id),
  mentions    uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index comments_org_session_idx on public.comments (org_id, session_id, created_at);
create index comments_parent_idx on public.comments (parent_id);

-- One level of replies (REQ-EVT-002), and the write rules a column grant
-- cannot express: only the author changes the body; whoever soft-deletes is
-- recorded as deleted_by; a moderator can only remove or restore.
create function public.comments_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare parent_of_parent uuid;
begin
  if tg_op = 'INSERT' then
    if new.parent_id is not null then
      select parent_id into parent_of_parent from public.comments where id = new.parent_id;
      if parent_of_parent is not null then
        raise exception 'reply_depth' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;
  -- UPDATE
  if new.body is distinct from old.body then
    if old.author_id <> public.auth_member_id() then
      raise exception 'not_author' using errcode = '42501';
    end if;
    new.edited_at := now();
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    new.deleted_by := case when new.deleted_at is null then null else public.auth_member_id() end;
  end if;
  if new.parent_id is distinct from old.parent_id or new.session_id is distinct from old.session_id
     or new.author_id is distinct from old.author_id then
    raise exception 'immutable_columns' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger comments_guard before insert or update on public.comments
  for each row execute function public.comments_guard();

create table public.reactions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  comment_id  uuid references public.comments(id) on delete cascade,
  session_id  uuid references public.sessions(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  kind        text not null check (kind ~ '^[a-z_]{1,32}$'),
  created_at  timestamptz not null default now(),
  check ((comment_id is not null) <> (session_id is not null))
);
create unique index reactions_member_comment_kind_key on public.reactions (member_id, comment_id, kind) where comment_id is not null;
create unique index reactions_member_session_kind_key on public.reactions (member_id, session_id, kind) where session_id is not null;
create index reactions_org_comment_idx on public.reactions (org_id, comment_id);

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  target       public.report_target not null,
  comment_id   uuid references public.comments(id) on delete cascade,
  photo_id     uuid,                                            -- M5 adds the reference
  reporter_id  uuid not null references public.members(id),
  reason       text not null check (char_length(btrim(reason)) between 3 and 1000),
  status       public.report_status not null default 'open',
  resolved_by  uuid references public.members(id),
  resolution   public.moderation_action,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  check ((target = 'comment') = (comment_id is not null)),
  check ((target = 'photo') = (photo_id is not null)),
  check ((status = 'open') = (resolved_at is null))
);
create index reports_org_status_idx on public.reports (org_id, status, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- ratings — check_in_id NOT NULL is REQ-RAT-001 made structural.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.ratings (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.orgs(id) on delete cascade,
  session_id       uuid not null references public.sessions(id) on delete cascade,
  member_id        uuid not null references public.members(id) on delete cascade,
  check_in_id      uuid not null references public.check_ins(id),
  session_stars    int not null check (session_stars between 1 and 5),
  presenter_stars  int not null check (presenter_stars between 1 and 5),
  comment          text check (comment is null or char_length(comment) <= 2000),
  submitted_at     timestamptz not null default now(),
  edited_at        timestamptz,
  unique (session_id, member_id)                                                   -- A17
);
create index ratings_org_session_idx on public.ratings (org_id, session_id);

-- The presenter's window on ratings: aggregates only, unattributed free text,
-- nothing below org_settings.rating_min_aggregate (REQ-RAT-004, REQ-RAT-006).
-- security_invoker = off: the view reads the base table as its owner; the
-- caller's RLS never sees a row. Presenter scope is the predicate.
create view public.session_rating_aggregates
with (security_invoker = false) as
  select r.org_id,
         r.session_id,
         count(*)::int                         as rating_count,
         round(avg(r.session_stars), 2)        as session_avg,
         round(avg(r.presenter_stars), 2)      as presenter_avg,
         array_remove(array_agg(r.comment order by r.submitted_at), null) as comments
    from public.ratings r
    join public.org_settings os on os.org_id = r.org_id
   where r.org_id = public.auth_org_id()
     and (public.is_staff() or public.is_presenter_of(r.session_id))
   group by r.org_id, r.session_id, os.rating_min_aggregate
  having count(*) >= os.rating_min_aggregate;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS and grants — 03 §5.2–5.4, §5.6, names as the document writes them.
-- ═══════════════════════════════════════════════════════════════════════════
-- proposals
alter table public.proposals enable row level security;
revoke all on public.proposals from anon, authenticated, service_role;
create policy "proposals_read_own_or_staff" on public.proposals for select to authenticated
  using (org_id = public.auth_org_id()
         and (proposer_id = public.auth_member_id()
              or exists (select 1 from public.proposal_presenters pp
                          where pp.proposal_id = proposals.id and pp.member_id = public.auth_member_id())
              or public.is_staff()));
create policy "proposals_insert_own" on public.proposals for insert to authenticated
  with check (org_id = public.auth_org_id() and proposer_id = public.auth_member_id()
              and state in ('draft', 'submitted'));
create policy "proposals_update_own_editable" on public.proposals for update to authenticated
  using       (org_id = public.auth_org_id() and proposer_id = public.auth_member_id()
               and state in ('draft', 'changes_requested'))
  with check  (org_id = public.auth_org_id() and proposer_id = public.auth_member_id()
               and state in ('draft', 'submitted'));
create policy "proposals_delete_draft" on public.proposals for delete to authenticated
  using (org_id = public.auth_org_id() and proposer_id = public.auth_member_id() and state = 'draft');
grant select, insert, delete on public.proposals to authenticated;
-- decision_reason is NOT here: a proposer cannot write their own rejection reason.
grant update (title, abstract, category_id, level, target_audience, expected_duration_minutes, admin_notes, state)
  on public.proposals to authenticated;

-- proposal_presenters: P1 read; the proposer names co-presenters; each names self accepts/declines
alter table public.proposal_presenters enable row level security;
revoke all on public.proposal_presenters from anon, authenticated, service_role;
create policy "p1_org_read" on public.proposal_presenters for select to authenticated
  using (org_id = public.auth_org_id());
create policy "proposal_presenters_insert_by_proposer" on public.proposal_presenters for insert to authenticated
  with check (org_id = public.auth_org_id()
              and exists (select 1 from public.proposals p where p.id = proposal_id
                           and p.proposer_id = public.auth_member_id() and p.org_id = public.auth_org_id()));
create policy "proposal_presenters_update_self" on public.proposal_presenters for update to authenticated
  using       (org_id = public.auth_org_id() and member_id = public.auth_member_id())
  with check  (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "proposal_presenters_delete_by_proposer" on public.proposal_presenters for delete to authenticated
  using (org_id = public.auth_org_id()
         and exists (select 1 from public.proposals p where p.id = proposal_id
                      and p.proposer_id = public.auth_member_id()));
grant select, insert, delete on public.proposal_presenters to authenticated;
grant update (accepted, declined_at) on public.proposal_presenters to authenticated;

-- sessions
alter table public.sessions enable row level security;
revoke all on public.sessions from anon, authenticated, service_role;
create policy "sessions_read" on public.sessions for select to authenticated
  using (org_id = public.auth_org_id()
         and (state in ('published', 'in_progress', 'completed', 'archived', 'cancelled')
              or public.is_staff()
              or public.is_presenter_of(id)));
create policy "sessions_update_admin" on public.sessions for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
create policy "sessions_update_presenter" on public.sessions for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_presenter_of(id)
               and state in ('draft', 'changes_requested', 'approved', 'published'))
  with check  (org_id = public.auth_org_id() and public.is_presenter_of(id));
grant select on public.sessions to authenticated;
-- Scheduling columns are NOT in the grant (D13/D14): starts_at, venue, capacity,
-- deadlines, certificate_mode and state move only through RPCs.
grant update (title, abstract, level, language) on public.sessions to authenticated;

-- session_presenters: P1 / P2 / self update / P2 delete
alter table public.session_presenters enable row level security;
revoke all on public.session_presenters from anon, authenticated, service_role;
create policy "p1_org_read" on public.session_presenters for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_insert" on public.session_presenters for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "session_presenters_update_self" on public.session_presenters for update to authenticated
  using       (org_id = public.auth_org_id() and member_id = public.auth_member_id())
  with check  (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "p2_admin_delete" on public.session_presenters for delete to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());
grant select, insert, delete on public.session_presenters to authenticated;
grant update (accepted, declined_at) on public.session_presenters to authenticated;

-- session_state_transitions: read by staff or the session's presenter; written by RPC only
alter table public.session_state_transitions enable row level security;
revoke all on public.session_state_transitions from anon, authenticated, service_role;
create policy "transitions_read_staff_or_presenter" on public.session_state_transitions for select to authenticated
  using (org_id = public.auth_org_id() and (public.is_staff() or public.is_presenter_of(session_id)));
grant select on public.session_state_transitions to authenticated;

-- rsvps: §5.3 — reads scoped; every write is the RPC
alter table public.rsvps enable row level security;
revoke all on public.rsvps from anon, authenticated, service_role;
create policy "rsvps_read" on public.rsvps for select to authenticated
  using (org_id = public.auth_org_id()
         and (member_id = public.auth_member_id() or public.is_staff() or public.is_presenter_of(session_id)));
grant select on public.rsvps to authenticated;

-- check_in_codes: §5.4a — the host-view gate; a member never reads a code
alter table public.check_in_codes enable row level security;
revoke all on public.check_in_codes from anon, authenticated, service_role;
create policy "codes_read_host" on public.check_in_codes for select to authenticated
  using (org_id = public.auth_org_id() and (public.is_presenter_of(session_id) or public.is_staff()));
grant select on public.check_in_codes to authenticated;

-- check_ins: §5.4b — a member cannot see who else attended (A33 rule 3)
alter table public.check_ins enable row level security;
revoke all on public.check_ins from anon, authenticated, service_role;
create policy "checkins_read" on public.check_ins for select to authenticated
  using (org_id = public.auth_org_id()
         and (member_id = public.auth_member_id() or public.is_staff() or public.is_presenter_of(session_id)));
grant select on public.check_ins to authenticated;

-- check_in_attempts: staff only; written by the check-in RPC
alter table public.check_in_attempts enable row level security;
revoke all on public.check_in_attempts from anon, authenticated, service_role;
create policy "attempts_read_staff" on public.check_in_attempts for select to authenticated
  using (org_id = public.auth_org_id() and public.is_staff());
grant select on public.check_in_attempts to authenticated;

-- comments: §5.6a/b + P6
alter table public.comments enable row level security;
revoke all on public.comments from anon, authenticated, service_role;
create policy "p1_org_read" on public.comments for select to authenticated
  using (org_id = public.auth_org_id());
create policy "comments_insert" on public.comments for insert to authenticated
  with check (org_id = public.auth_org_id()
              and author_id = public.auth_member_id()
              and exists (select 1 from public.sessions s
                           where s.id = session_id
                             and s.state in ('published', 'in_progress', 'completed', 'archived')));
create policy "comments_update_own" on public.comments for update to authenticated
  using       (org_id = public.auth_org_id() and author_id = public.auth_member_id()
               and deleted_at is null
               and created_at > now() - (select make_interval(mins => os.comment_edit_window_minutes)
                                           from public.org_settings os where os.org_id = comments.org_id))
  with check  (org_id = public.auth_org_id() and author_id = public.auth_member_id());
create policy "p6_staff_update" on public.comments for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_staff())
  with check  (org_id = public.auth_org_id() and public.is_staff());
grant select, insert on public.comments to authenticated;
-- The column grant is shared by both update policies; comments_guard() keeps
-- body to the author and stamps deleted_by, so a moderator can remove or
-- restore and cannot rewrite.
grant update (body, edited_at, deleted_at, deleted_by) on public.comments to authenticated;

-- reactions: P1 read, P3 insert/delete (no update — a reaction is toggled)
alter table public.reactions enable row level security;
revoke all on public.reactions from anon, authenticated, service_role;
create policy "p1_org_read" on public.reactions for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p3_self_insert" on public.reactions for insert to authenticated
  with check (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "p3_self_delete" on public.reactions for delete to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());
grant select, insert, delete on public.reactions to authenticated;

-- reports: staff + reporter read; P3 insert; P6 resolve
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated, service_role;
create policy "reports_read_staff_or_reporter" on public.reports for select to authenticated
  using (org_id = public.auth_org_id() and (public.is_staff() or reporter_id = public.auth_member_id()));
create policy "reports_insert_self" on public.reports for insert to authenticated
  with check (org_id = public.auth_org_id() and reporter_id = public.auth_member_id() and status = 'open');
create policy "p6_staff_update" on public.reports for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_staff())
  with check  (org_id = public.auth_org_id() and public.is_staff());
grant select, insert on public.reports to authenticated;
grant update (status, resolved_by, resolution, resolved_at) on public.reports to authenticated;

-- ratings: §5.6d/e — the D36 boundary. No presenter policy; the view is theirs.
alter table public.ratings enable row level security;
revoke all on public.ratings from anon, authenticated, service_role;
create policy "ratings_read_admin" on public.ratings for select to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());
create policy "ratings_read_self" on public.ratings for select to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "ratings_write_self" on public.ratings for insert to authenticated
  with check (org_id = public.auth_org_id()
              and member_id = public.auth_member_id()
              and check_in_id in (select id from public.check_ins c
                                   where c.session_id = ratings.session_id and c.member_id = public.auth_member_id())
              and exists (select 1 from public.sessions s
                           where s.id = session_id and s.state = 'completed'
                             and now() <= s.completed_at + make_interval(days => (select os.rating_window_days
                                                                                   from public.org_settings os
                                                                                  where os.org_id = ratings.org_id))));
create policy "ratings_update_self" on public.ratings for update to authenticated
  using       (org_id = public.auth_org_id() and member_id = public.auth_member_id()
               and exists (select 1 from public.sessions s
                            where s.id = session_id and s.state = 'completed'
                              and now() <= s.completed_at + make_interval(days => (select os.rating_window_days
                                                                                    from public.org_settings os
                                                                                   where os.org_id = ratings.org_id))))
  with check  (org_id = public.auth_org_id() and member_id = public.auth_member_id());
grant select, insert on public.ratings to authenticated;
grant update (session_stars, presenter_stars, comment, edited_at) on public.ratings to authenticated;
revoke all on public.session_rating_aggregates from anon, authenticated, service_role;
grant select on public.session_rating_aggregates to authenticated;

grant execute on function public.is_presenter_of(uuid), public.has_checked_in(uuid) to authenticated, anon, service_role;
