-- platform (wave 4, M8) — the platform schema: the one seam that can reach an org.
--
-- Serves:  REQ-ADM-001 (the super-admin console), REQ-ADM-002 (no data plane),
--          REQ-ADM-003 (aggregate metrics only), REQ-ADM-019 (break-glass is
--          visible to the org), REQ-TEN-002, REQ-TEN-006, REQ-TEN-007,
--          REQ-DSG-008 (the platform library), REQ-NFR-012 (retention),
--          REQ-NFR-014 (org deletion), REQ-PRF-006 (self export)
-- Cites:   02 §4.1 (ENT-impersonation_sessions, verbatim), 02 §7 (the no-org_id
--          exceptions), 03 §1.4 (no super-admin disjunct), 03 §1.5 (the grant
--          discipline), 03 §5.1, 03 §5.9a, 11 §2.7, 12 §5.3, 12 §5.4, 12 §5.5,
--          DEC-014, DEC-035, DEC-049, DEC-052
--
-- ── The invariant this file exists to keep ─────────────────────────────────
-- NO POLICY HERE CONTAINS A SUPER-ADMIN DISJUNCT (DEC-014, invariant 8), and
-- `platform_admins` keeps its no-policy-no-grant shape (0004, DEC-035). The
-- console learns who is a super admin through `assert_platform_admin()` (0005),
-- which re-reads the table for `auth.uid()` — never through a claim alone.
--
-- Reaching into an org is impersonation: a session row, capped at 4 hours by a
-- table constraint, that lands in THAT ORG'S OWN audit log in the same
-- transaction and mints an ordinary member's claims. It carries no `member_id`,
-- so every privileged RPC (03 §1.3 re-reads the member row) refuses it. A
-- break-glass session reads what a member reads and writes nothing privileged.
--
-- ── 03 §8.2 rows this file needs ───────────────────────────────────────────
--   | `POL-impersonation_sessions.select` | The org's own staff can see that a
--     super admin impersonated; another org's staff see nothing (`REQ-ADM-019`). |
--   | `POL-impersonation_sessions.expiry` | A session over 4 hours is rejected by
--     the table constraint; `start_impersonation()` clamps `p_minutes` to 240. |
--   | `POL-impersonation_sessions.append_only` | No role — `authenticated` or
--     `service_role` — may insert, update or delete a row; `end_impersonation()`
--     is the only writer of `ended_at`. |
--   | `RPC-start_impersonation.platform_only` | A member, an org admin and a
--     stale admin are all refused `42501`; only a row in `platform_admins` passes,
--     and the audit row lands in the target org's log with `platform_admin`. |
--   | `RPC-end_impersonation.actor` | The starting super admin and `service_role`
--     (the expiry job) may end a session; another super admin and the org's own
--     admin cannot. Ending twice is a no-op. |
--   | `POL-auth_hook.impersonation` | With an active session the hook mints
--     `org_id`, `org_role = 'member'`, `status`, `org_status` and the session id,
--     and NO `member_id`; after `ended_at` it mints none. It still never raises. |
--   | `RPC-set_first_admin.platform_only` | Only a platform admin may name an
--     org's first admin; an existing member with that address is promoted and
--     their `claims_version` bumps; the org's log records it. |
--   | `RPC-add_org_domain.platform_only` | A platform admin adds and removes a
--     domain on an org it is not a member of; the audit row is attributed
--     `platform_admin`, not `system` (`REQ-TEN-007`). |
--   | `POL-retention_periods.none` | RLS enabled, no policy, no grant — every
--     client role and `service_role` are refused on the grant; `12` §5.3's
--     periods are read through `retention_period()` alone. |
--   | `POL-platform_audit_log.none` | Same shape. The platform-side trail has no
--     foreign key to `orgs`, so an `org.deleted` row survives the org. |
--   | `POL-data_export_requests.select.self` | A member reads their own export
--     requests and nobody else's; no role may insert, update or delete directly
--     — `request_data_export()` is the only door (`REQ-PRF-006`). |
--   | `RPC-platform_metrics.aggregate_only` | Both metrics functions refuse a
--     non-platform-admin, and the two views expose counts alone — no member, no
--     session title, no content column (`REQ-ADM-003`). |
--   | `RPC-promote_template_to_platform` | A published org version becomes a
--     platform template by COPY; a later edit of the org template does not reach
--     it; an unpublished version and a platform version are both refused
--     (`REQ-DSG-008`). |
--   | `RPC-retire_platform_template.floor` | Retiring the last non-retired
--     default for a purpose is refused — the A27 baseline never falls below one
--     default per purpose (DEC-052). |
--   | `RPC-delete_org.slug` | Deletion needs the org's slug typed back; a wrong
--     slug changes nothing. The org is suspended in the same transaction, the
--     platform trail records it, and `orgdel:{org_id}` is enqueued once
--     (`REQ-NFR-014`, `12` §5.5). |
--   | `RPC-assert_org_deleted` | After `perform_org_deletion()` no table with an
--     `org_id` column holds a row for the id, walked dynamically so a table added
--     later is covered the day it is created. |
--
-- ── 03 per-table map rows this file needs (policy-diff parses these) ────────
--   | `retention_periods`   | — | — | — | — | **No policy at all.** Platform-level
--     configuration; read through `retention_period()` by the retention job. |
--   | `platform_audit_log`  | — | — | — | — | **No policy at all.** Platform-side
--     evidence; written by `security definer` functions only. |
--   | `data_export_requests`| P3 self | — | — | — | Insert through
--     `request_data_export()`; the archive path is never client-writable. |
--
-- ── 02 §7 ──────────────────────────────────────────────────────────────────
-- `retention_periods` and `platform_audit_log` carry NO `org_id`, taking the
-- documented exceptions from five to seven. Both follow `platform_admins`
-- exactly: RLS enabled, no policy, no grant to any client role.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. impersonation_sessions — 02 §4.1, verbatim. 03 §5.1 (P1 + is_staff()).
--    Append-only like audit_log: no insert, update or delete policy and no
--    such grant for ANY role, service_role included (invariant 9's shape).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.impersonation_sessions (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id) on delete cascade,
  -- The auth user, not a member: a super admin has no member row anywhere.
  platform_admin_id  uuid not null references public.platform_admins(auth_user_id),
  reason             text not null check (char_length(btrim(reason)) between 3 and 500),
  started_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  ended_at           timestamptz,
  -- 02 §4.1: four hours is a constraint, not a convention. A session cannot be
  -- silently extended because there is no update path at all (REQ-ADM-002).
  constraint impersonation_window check (
    expires_at > started_at and expires_at <= started_at + interval '4 hours'
  ),
  constraint impersonation_ended_after_start check (ended_at is null or ended_at >= started_at)
);
create index impersonation_sessions_org_started_idx
  on public.impersonation_sessions (org_id, started_at desc);
-- The hook's lookup, on every token issued for a platform admin.
create index impersonation_sessions_active_idx
  on public.impersonation_sessions (platform_admin_id, expires_at desc) where ended_at is null;
comment on table public.impersonation_sessions is
  'Break-glass. Append-only; readable by the target org''s own staff by design (REQ-ADM-019).';

alter table public.impersonation_sessions enable row level security;
revoke all on public.impersonation_sessions from anon, authenticated, service_role;
-- 03 §5.1: P1 + is_staff(). The point of the table is that the ORG sees it.
create policy "impersonation_read_staff" on public.impersonation_sessions for select to authenticated
  using (org_id = public.auth_org_id() and public.is_staff());
grant select on public.impersonation_sessions to authenticated;
-- Append-only, stated in both directions so the file means the same on a
-- hosted project (default privileges) and on a bare Postgres (none).
revoke insert, update, delete on public.impersonation_sessions from anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. retention_periods — 12 §5.3 as ROWS. The job reads this table; it never
--    carries a period as a constant, because a constant in a task is a policy
--    nobody can review. Platform-level: no org_id, no policy, no grant.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.retention_periods (
  data_class     text primary key check (data_class ~ '^[a-z_]+$'),
  -- The table the sweep touches, and the timestamp column it ages by. Null
  -- `days` means "life of the org" — kept as a ROW so the ledger's exemption is
  -- visible in the table rather than inferred from its absence (12 §5.3).
  table_name     text not null,
  age_column     text not null,
  days           int check (days is null or days > 0),
  -- 'delete' removes the row; 'anonymise' rewrites personal columns and keeps
  -- it (12 §5.4 — members are never deleted); 'retain' is enforced by doing
  -- nothing, and is here so the exemption is explicit.
  action         text not null check (action in ('delete', 'anonymise', 'retain')),
  note           text,
  updated_at     timestamptz not null default now(),
  constraint retention_days_required check ((action = 'retain') = (days is null))
);
comment on table public.retention_periods is
  '12 §5.3. Read by JOB-enforce_retention through retention_period(); never a constant in a task.';

alter table public.retention_periods enable row level security;
revoke all on public.retention_periods from anon, authenticated, service_role;
-- No policy and no grant, by design: this is platform configuration, and the
-- one reader is a security definer function.

insert into public.retention_periods (data_class, table_name, age_column, days, action, note) values
  ('audit_log',              'audit_log',             'occurred_at',    2557, 'delete',    'سبع سنوات — 12 §5.3, REQ-ADM-018'),
  ('check_in_attempts',      'check_in_attempts',     'attempted_at',     90, 'delete',    'تسعون يومًا، بما فيها المحاولات الفاشلة'),
  ('email_deliveries',       'email_deliveries',      'created_at',      180, 'delete',    'سجلات تسليم البريد — مئة وثمانون يومًا'),
  ('deactivated_members',    'members',               'deactivated_at',  365, 'anonymise', 'إخفاء الهوية بعد اثني عشر شهرًا — 12 §5.4، لا حذف أبدًا'),
  ('data_export_archives',   'data_export_requests',  'completed_at',      7, 'delete',    'أرشيف التصدير الذاتي — سبعة أيام ثم يُحذف الملف'),
  ('points_ledger',          'points_ledger',         'created_at',     null, 'retain',    'عمر المؤسسة — السجل هو مرجع كل رصيد (REQ-PTS-011)'),
  ('sessions_and_content',   'sessions',              'created_at',     null, 'retain',    'عمر المؤسسة — 12 §5.3');

create function public.retention_period(p_class text)
returns public.retention_periods
language sql stable security definer set search_path = '' as $fn$
  select * from public.retention_periods where data_class = p_class
$fn$;
revoke execute on function public.retention_period(text) from public, anon, authenticated;
grant  execute on function public.retention_period(text) to service_role;

create function public.retention_schedule() returns setof public.retention_periods
language sql stable security definer set search_path = '' as $fn$
  select * from public.retention_periods order by data_class
$fn$;
revoke execute on function public.retention_schedule() from public, anon, authenticated;
grant  execute on function public.retention_schedule() to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. platform_audit_log — the evidence that has to SURVIVE the org it is
--    about. `audit_log.org_id` cascades from `orgs` (0004), so an `org.deleted`
--    row written there dies with the thing it records. This table holds the id
--    as a plain uuid with NO foreign key, for that one reason.
--    No org_id in the tenancy sense: 02 §7 exception, `platform_admins` shape.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.platform_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid,                       -- the platform admin's auth user; null when the system acted
  action        text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  subject_org   uuid,                       -- deliberately NOT a foreign key
  subject_type  text,
  subject_id    uuid,
  before        jsonb,
  after         jsonb,
  reason        text,
  occurred_at   timestamptz not null default now()
);
create index platform_audit_log_occurred_idx on public.platform_audit_log (occurred_at desc);
create index platform_audit_log_org_idx      on public.platform_audit_log (subject_org, occurred_at desc);
comment on table public.platform_audit_log is
  'Platform-side evidence. No FK to orgs on purpose: an org.deleted row must outlive the org (REQ-NFR-014).';

alter table public.platform_audit_log enable row level security;
revoke all on public.platform_audit_log from anon, authenticated, service_role;
-- No policy and no grant. Written by definer functions, read through
-- platform_audit() below, which asserts the caller first.

create function public.write_platform_audit(
  p_action       text,
  p_subject_org  uuid    default null,
  p_subject_type text    default null,
  p_subject_id   uuid    default null,
  p_before       jsonb   default null,
  p_after        jsonb   default null,
  p_reason       text    default null
) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare v_id uuid;
begin
  insert into public.platform_audit_log (actor_user_id, action, subject_org, subject_type, subject_id, before, after, reason)
  values (auth.uid(), p_action, p_subject_org, p_subject_type, p_subject_id, p_before, p_after, p_reason)
  returning id into v_id;
  return v_id;
end $fn$;
revoke execute on function public.write_platform_audit(text, uuid, text, uuid, jsonb, jsonb, text)
  from public, anon, authenticated;
grant  execute on function public.write_platform_audit(text, uuid, text, uuid, jsonb, jsonb, text)
  to service_role;

create function public.platform_audit(p_limit int default 100, p_org uuid default null)
returns setof public.platform_audit_log
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform public.assert_platform_admin();
  return query
    select * from public.platform_audit_log
     where p_org is null or subject_org = p_org
     order by occurred_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500));
end $fn$;
revoke execute on function public.platform_audit(int, uuid) from public, anon;
grant  execute on function public.platform_audit(int, uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. data_export_requests — REQ-PRF-006. Org-scoped, P3 self-read, and the
--    only write path is request_data_export(). The archive itself lands in the
--    `exports` bucket under the org's prefix and is served by a signed URL.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.data_export_requests (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  status        text not null default 'queued' check (status in ('queued', 'building', 'ready', 'failed', 'expired')),
  requested_at  timestamptz not null default now(),
  completed_at  timestamptz,
  storage_path  text,
  byte_size     bigint check (byte_size is null or byte_size > 0),
  error         text,
  constraint data_export_ready_has_path check (status <> 'ready' or (storage_path is not null and completed_at is not null))
);
create index data_export_requests_member_idx on public.data_export_requests (member_id, requested_at desc);
create index data_export_requests_org_status_idx on public.data_export_requests (org_id, status);
-- REQ-NFR-005: one open request per member at a time is the rate limit the
-- table itself can hold; the Route Handler adds the per-window limit.
create unique index data_export_requests_one_open
  on public.data_export_requests (member_id) where status in ('queued', 'building');

alter table public.data_export_requests enable row level security;
revoke all on public.data_export_requests from anon, authenticated, service_role;
create policy "data_export_read_self" on public.data_export_requests for select to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());
grant select on public.data_export_requests to authenticated;
revoke insert, update, delete on public.data_export_requests from anon, authenticated, service_role;

create function public.request_data_export() returns public.data_export_requests
language plpgsql security definer set search_path = '' as $fn$
declare
  m   public.members := public.assert_active_member();
  req public.data_export_requests;
begin
  select * into req from public.data_export_requests
   where member_id = m.id and status in ('queued', 'building');
  if req.id is not null then
    return req;                                    -- already queued: idempotent, not an error
  end if;

  insert into public.data_export_requests (org_id, member_id)
  values (m.org_id, m.id)
  returning * into req;

  -- 11 §2.7 key, verbatim: export:{member_id}:{requested_at}
  perform public.enqueue_job(
    'build_data_export',
    jsonb_build_object('request_id', req.id, 'member_id', m.id, 'org_id', m.org_id),
    'export:' || m.id::text || ':' || to_char(req.requested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSOF')
  );

  perform public.write_audit(m.org_id, 'privacy.export_requested', 'member', m.id, null,
                             jsonb_build_object('request_id', req.id), null, m.org_role::text, m.id);
  return req;
end $fn$;
revoke execute on function public.request_data_export() from public, anon;
grant  execute on function public.request_data_export() to authenticated;

-- REQ-PRF-007: the member asks, an org admin performs it (0005's
-- deactivate_member). The request is an audit row plus a notification — no
-- fourth entity, and the admin sees it where every other act on the org is.
create function public.request_deactivation(p_reason text) returns void
language plpgsql security definer set search_path = '' as $fn$
declare m public.members := public.assert_active_member();
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  perform public.write_audit(m.org_id, 'member.deactivation_requested', 'member', m.id, null,
                             jsonb_build_object('requested_by', m.id), btrim(p_reason),
                             m.org_role::text, m.id);
end $fn$;
revoke execute on function public.request_deactivation(text) from public, anon;
grant  execute on function public.request_deactivation(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Impersonation — the only path from the platform into an org.
--    assert_platform_admin() is 0005's and is NOT redefined here.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.start_impersonation(p_org uuid, p_reason text, p_minutes int default 60)
returns public.impersonation_sessions
language plpgsql security definer set search_path = '' as $fn$
declare
  v_admin uuid := public.assert_platform_admin();
  v_org   public.orgs;
  v_mins  int;
  s       public.impersonation_sessions;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  -- Clamped, not merely constrained: a caller asking for a week gets four
  -- hours and an audit row, rather than a 23514 they might retry blindly.
  v_mins := least(greatest(coalesce(p_minutes, 60), 5), 240);

  select * into v_org from public.orgs where id = p_org;
  if v_org.id is null then
    raise exception 'org_not_found' using errcode = '42501';
  end if;

  -- One at a time. Two live sessions would make the hook's choice arbitrary,
  -- and "which org am I in" must never be arbitrary.
  if exists (
    select 1 from public.impersonation_sessions x
     where x.platform_admin_id = v_admin and x.ended_at is null and x.expires_at > now()
  ) then
    raise exception 'impersonation_already_active' using errcode = '42501';
  end if;

  insert into public.impersonation_sessions (org_id, platform_admin_id, reason, expires_at)
  values (p_org, v_admin, btrim(p_reason), now() + make_interval(mins => v_mins))
  returning * into s;

  -- THE ORG'S OWN LOG, in the same transaction as the session row. This is
  -- REQ-ADM-019: the org's admins see it because it is written where they read.
  perform public.write_audit(p_org, 'impersonation.started', 'impersonation_session', s.id, null,
                             jsonb_build_object('expires_at', s.expires_at, 'minutes', v_mins),
                             btrim(p_reason), 'platform_admin', null);
  perform public.write_platform_audit('impersonation.started', p_org, 'impersonation_session', s.id, null,
                                      jsonb_build_object('expires_at', s.expires_at), btrim(p_reason));

  -- 11 §2.7 key, verbatim. Scheduled AT expiry; the task expires every due
  -- session, so a missed run self-heals on the next one.
  perform public.enqueue_job(
    'expire_impersonation',
    jsonb_build_object('session_id', s.id),
    'impexp:' || s.id::text,
    s.expires_at
  );
  return s;
end $fn$;
revoke execute on function public.start_impersonation(uuid, text, int) from public, anon;
grant  execute on function public.start_impersonation(uuid, text, int) to authenticated;

create function public.end_impersonation(p_session uuid default null) returns public.impersonation_sessions
language plpgsql security definer set search_path = '' as $fn$
declare
  v_uid uuid := auth.uid();
  s     public.impersonation_sessions;
begin
  -- Two callers: the super admin who started it (the stop control on the
  -- banner) and the worker (JOB-expire_impersonation). Nobody else, and in
  -- particular not the org's own admin — they may SEE it, not end it.
  if v_uid is not null then
    perform public.assert_platform_admin();
    select * into s from public.impersonation_sessions
     where (p_session is null or id = p_session)
       and platform_admin_id = v_uid and ended_at is null
     order by started_at desc limit 1;
  else
    select * into s from public.impersonation_sessions where id = p_session and ended_at is null;
  end if;

  if s.id is null then
    return null;                                   -- already ended, or none: idempotent
  end if;

  update public.impersonation_sessions
     set ended_at = least(now(), s.expires_at)
   where id = s.id
   returning * into s;

  perform public.write_audit(s.org_id, 'impersonation.ended', 'impersonation_session', s.id,
                             jsonb_build_object('expires_at', s.expires_at),
                             jsonb_build_object('ended_at', s.ended_at), null, 'platform_admin', null);
  return s;
end $fn$;
revoke execute on function public.end_impersonation(uuid) from public, anon;
grant  execute on function public.end_impersonation(uuid) to authenticated, service_role;

-- The expiry sweep. Every DUE session, not only the one named, so a replay or a
-- missed schedule costs nothing (11 §1.3). Worker-only.
create function public.expire_impersonation_sessions() returns int
language plpgsql security definer set search_path = '' as $fn$
declare r record; n int := 0;
begin
  for r in select * from public.impersonation_sessions
            where ended_at is null and expires_at <= now()
  loop
    update public.impersonation_sessions set ended_at = expires_at where id = r.id;
    perform public.write_audit(r.org_id, 'impersonation.expired', 'impersonation_session', r.id,
                               jsonb_build_object('expires_at', r.expires_at),
                               jsonb_build_object('ended_at', r.expires_at), null, 'platform_admin', null);
    n := n + 1;
  end loop;
  return n;
end $fn$;
revoke execute on function public.expire_impersonation_sessions() from public, anon, authenticated;
grant  execute on function public.expire_impersonation_sessions() to service_role;

-- The banner's read (SCR-085). A platform admin sees their OWN active session
-- and nothing else; there is no policy on the table for them, by design.
create function public.my_impersonation() returns public.impersonation_sessions
language plpgsql stable security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid(); s public.impersonation_sessions;
begin
  if v_uid is null then return null; end if;
  select * into s from public.impersonation_sessions
   where platform_admin_id = v_uid and ended_at is null and expires_at > now()
   order by started_at desc limit 1;
  return s;
end $fn$;
revoke execute on function public.my_impersonation() from public, anon;
grant  execute on function public.my_impersonation() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. The auth hook, replaced — 0006's three rules kept, one lookup added.
--    A platform admin with an ACTIVE impersonation session is issued an
--    ordinary member's claims for the target org: org_id, org_role = 'member',
--    status, org_status — and NO member_id, so assert_active_member() (03 §1.3)
--    raises `not_a_member` on every privileged write. Break-glass reads.
--    Claims are minted at token issuance, so the console calls
--    supabase.auth.refreshSession() after start_impersonation().
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_uid    uuid;
  v_claims jsonb;
  v_app    jsonb;
  r        record;
  imp      record;
  v_pa     boolean := false;
  v_member boolean := false;
begin
  v_uid := (event ->> 'user_id')::uuid;
  if v_uid is null then
    return event;
  end if;

  select m.id, m.org_id, m.org_role, m.status, m.claims_version, o.status as org_status
    into r
    from public.members m
    join public.orgs o on o.id = m.org_id
   where m.auth_user_id = v_uid;
  v_member := found;

  select exists (select 1 from public.platform_admins p where p.auth_user_id = v_uid) into v_pa;

  if not v_member and not v_pa then
    return event;
  end if;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_app    := coalesce(v_claims -> 'app_metadata', '{}'::jsonb);

  if v_member then
    v_app := v_app || jsonb_build_object(
      'org_id',         r.org_id,
      'member_id',      r.id,
      'org_role',       r.org_role,
      'status',         r.status,
      'claims_version', r.claims_version,
      'org_status',     r.org_status
    );
  end if;
  if v_pa then
    v_app := v_app || jsonb_build_object('platform_admin', true);

    -- REQ-ADM-002 / REQ-ADM-019. A super admin has no member row, so this is
    -- the ONLY way org_id ever appears on their token, it lasts at most four
    -- hours by a table constraint, and the org already has the audit row.
    select s.id, s.org_id, s.expires_at, o.status as org_status
      into imp
      from public.impersonation_sessions s
      join public.orgs o on o.id = s.org_id
     where s.platform_admin_id = v_uid and s.ended_at is null and s.expires_at > now()
     order by s.started_at desc
     limit 1;
    if found then
      v_app := v_app || jsonb_build_object(
        'org_id',       imp.org_id,
        'org_role',     'member',
        'status',       'active',
        'org_status',   imp.org_status,
        'impersonation', imp.id,
        'impersonation_expires_at', imp.expires_at
      );
      -- member_id is deliberately absent: 03 §1.3 refuses every privileged
      -- write without one. Removed rather than trusted to be absent, in case a
      -- future member-and-platform-admin account ever exists.
      v_app := v_app - 'member_id' - 'claims_version';
    end if;
  end if;

  v_claims := jsonb_set(v_claims, '{app_metadata}', v_app, true);
  return jsonb_set(event, '{claims}', v_claims, true);
exception
  when others then
    -- 0006's rule 1, unchanged and now covering one more table: a hook that
    -- raises is an outage for every user.
    return event;
end $fn$;

-- 0006's rule 3, restated with the one table the hook now also reads.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant select on public.members, public.orgs, public.platform_admins, public.impersonation_sessions
  to supabase_auth_admin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. The org write paths a super admin cannot reach through a policy.
--    REQ-TEN-002, REQ-TEN-007. Each audits into the ORG'S OWN log.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.set_first_admin(p_org uuid, p_email text) returns void
language plpgsql security definer set search_path = '' as $fn$
declare
  v_admin uuid := public.assert_platform_admin();
  v_old   extensions.citext;
  v_email extensions.citext := lower(btrim(p_email))::extensions.citext;
  v_m     public.members;
begin
  if p_email is null or btrim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  select first_admin_email into v_old from public.orgs where id = p_org;
  if not found then
    raise exception 'org_not_found' using errcode = '42501';
  end if;

  update public.orgs set first_admin_email = v_email where id = p_org;

  -- If that address is already a member, promote it now rather than waiting
  -- for a sign-in that already happened (provision_member only reads
  -- first_admin_email on the FIRST sign-in). claims_version bumps, so the
  -- member's next privileged write re-reads the row (03 §1.3).
  select * into v_m from public.members where org_id = p_org and email = v_email;
  if v_m.id is not null and v_m.org_role <> 'admin' then
    update public.members
       set org_role = 'admin', claims_version = claims_version + 1
     where id = v_m.id;
    perform public.write_audit(p_org, 'member.role_changed', 'member', v_m.id,
                               jsonb_build_object('org_role', v_m.org_role),
                               jsonb_build_object('org_role', 'admin'),
                               'first_admin', 'platform_admin', null);
  end if;

  perform public.write_audit(p_org, 'org.first_admin_set', 'org', p_org,
                             jsonb_build_object('first_admin_email', v_old),
                             jsonb_build_object('first_admin_email', v_email),
                             null, 'platform_admin', null);
  perform public.write_platform_audit('org.first_admin_set', p_org, 'org', p_org,
                                      jsonb_build_object('first_admin_email', v_old),
                                      jsonb_build_object('first_admin_email', v_email));
end $fn$;
revoke execute on function public.set_first_admin(uuid, text) from public, anon;
grant  execute on function public.set_first_admin(uuid, text) to authenticated;

create function public.add_org_domain(p_org uuid, p_domain text) returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare
  v_admin uuid := public.assert_platform_admin();
  v_id    uuid;
begin
  if p_domain is null or btrim(p_domain) = '' then
    raise exception 'domain_required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.orgs where id = p_org) then
    raise exception 'org_not_found' using errcode = '42501';
  end if;
  insert into public.org_domains (org_id, domain)
  values (p_org, btrim(p_domain)::extensions.citext)
  on conflict (org_id, domain) do nothing
  returning id into v_id;
  -- The domain.added audit row is the org_domains_audit trigger's, replaced
  -- below so a platform admin is attributed as one.
  return v_id;
end $fn$;

create function public.remove_org_domain(p_org uuid, p_domain text) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare v_admin uuid := public.assert_platform_admin(); v_n int;
begin
  delete from public.org_domains
   where org_id = p_org and domain = lower(btrim(p_domain))::extensions.citext;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $fn$;
revoke execute on function public.add_org_domain(uuid, text), public.remove_org_domain(uuid, text)
  from public, anon;
grant  execute on function public.add_org_domain(uuid, text), public.remove_org_domain(uuid, text)
  to authenticated;

-- 0008's trigger, replaced: it attributed a platform admin's domain change to
-- `system`, because auth_org_role() is null for an account with no member row.
--
-- ★ 0008'S CASCADE GUARD IS KEPT, and it is the reason 0008 exists: deleting an
-- org cascades to its domains, and an AFTER DELETE audit row referencing an org
-- that is already gone is a foreign-key violation that makes org deletion
-- impossible. This file's own delete_org() would have been the second thing to
-- trip over it. Removing the guard while "just adding attribution" is exactly
-- the regression tests/rls/platform-schema.test.ts caught.
create or replace function public.org_domains_audit() returns trigger
language plpgsql security definer set search_path = '' as $fn$
declare
  v_role text := public.auth_org_role()::text;
begin
  if v_role is null and auth.uid() is not null
     and exists (select 1 from public.platform_admins p where p.auth_user_id = auth.uid()) then
    v_role := 'platform_admin';
  end if;
  if tg_op = 'INSERT' then
    perform public.write_audit(new.org_id, 'domain.added', 'org_domain', new.id, null,
                               jsonb_build_object('domain', new.domain), null, v_role);
    return new;
  elsif tg_op = 'DELETE' then
    -- 0008: the org itself is being deleted; nothing to attach the row to.
    if not exists (select 1 from public.orgs o where o.id = old.org_id) then
      return old;
    end if;
    perform public.write_audit(old.org_id, 'domain.removed', 'org_domain', old.id,
                               jsonb_build_object('domain', old.domain), null, null, v_role);
    return old;
  else
    perform public.write_audit(new.org_id, 'domain.changed', 'org_domain', new.id,
                               jsonb_build_object('domain', old.domain),
                               jsonb_build_object('domain', new.domain), null, v_role);
    return new;
  end if;
end $fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. The platform template library — REQ-DSG-008, SCR-083, DEC-052.
--    MANAGED, not authored: a super admin has no org and the editor is
--    org-scoped, so the only way in is a COPY of an org's PUBLISHED version.
--    The A27 baseline (0061) is seeded platform-owned and org-independent;
--    promotion adds to the library and never supplies the baseline.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.promote_template_to_platform(p_version uuid, p_name text default null)
returns uuid
language plpgsql security definer set search_path = '' as $fn$
declare
  v_admin uuid := public.assert_platform_admin();
  v       public.design_template_versions;
  t       public.design_templates;
  v_new   uuid;
begin
  select * into v from public.design_template_versions where id = p_version;
  if v.id is null then
    raise exception 'version_not_found' using errcode = '42501';
  end if;
  if v.published_at is null then
    raise exception 'version_not_published' using errcode = '42501';
  end if;
  select * into t from public.design_templates where id = v.template_id;
  if t.scope <> 'org' then
    raise exception 'already_platform' using errcode = '42501';
  end if;

  -- A COPY (REQ-DSG-008). `duplicated_from` is provenance and nothing else:
  -- a later edit of the org's template never reaches this row.
  insert into public.design_templates (org_id, scope, purpose, family, name, description,
                                       duplicated_from, is_default, created_by)
  values (null, 'platform', t.purpose, t.family,
          coalesce(nullif(btrim(p_name), ''), t.name), t.description, t.id, false, null)
  returning id into v_new;

  insert into public.design_template_versions (template_id, version, document, dynamic_fields,
                                               safe_areas, font_hashes, published_at)
  values (v_new, 1, v.document, v.dynamic_fields, v.safe_areas, v.font_hashes, now());

  perform public.write_platform_audit('template.promoted', t.org_id, 'design_template', v_new, null,
                                      jsonb_build_object('source_template', t.id, 'source_version', v.id,
                                                         'purpose', t.purpose, 'family', t.family));
  return v_new;
end $fn$;
revoke execute on function public.promote_template_to_platform(uuid, text) from public, anon;
grant  execute on function public.promote_template_to_platform(uuid, text) to authenticated;

create function public.retire_platform_template(p_template uuid, p_retired boolean default true)
returns public.design_templates
language plpgsql security definer set search_path = '' as $fn$
declare
  v_admin uuid := public.assert_platform_admin();
  t       public.design_templates;
begin
  select * into t from public.design_templates where id = p_template and scope = 'platform';
  if t.id is null then
    raise exception 'template_not_found' using errcode = '42501';
  end if;

  -- DEC-052: the baseline never falls below one default per purpose. A library
  -- that can be retired to empty is a library that breaks a new org's first day.
  if p_retired and t.retired_at is null and not exists (
    select 1 from public.design_templates x
     where x.scope = 'platform' and x.purpose = t.purpose
       and x.is_default and x.retired_at is null and x.id <> t.id
  ) then
    raise exception 'last_platform_default' using errcode = '42501';
  end if;

  update public.design_templates
     set retired_at = case when p_retired then coalesce(retired_at, now()) else null end
   where id = t.id
   returning * into t;

  perform public.write_platform_audit(
    case when p_retired then 'template.retired' else 'template.unretired' end,
    null, 'design_template', t.id, null,
    jsonb_build_object('purpose', t.purpose, 'family', t.family));
  return t;
end $fn$;
revoke execute on function public.retire_platform_template(uuid, boolean) from public, anon;
grant  execute on function public.retire_platform_template(uuid, boolean) to authenticated;

-- "Publish" on SCR-083 is making a promoted template the one a new org's
-- automatic path binds to. One default per (purpose, family): 0055's
-- `design_templates_single_default` trigger demotes the previous holder, so
-- this function sets the flag and lets the trigger do the rest.
create function public.set_platform_template_default(p_template uuid)
returns public.design_templates
language plpgsql security definer set search_path = '' as $fn$
declare
  v_admin uuid := public.assert_platform_admin();
  t       public.design_templates;
begin
  select * into t from public.design_templates where id = p_template and scope = 'platform';
  if t.id is null then
    raise exception 'template_not_found' using errcode = '42501';
  end if;
  if t.retired_at is not null then
    raise exception 'template_retired' using errcode = '42501';
  end if;
  update public.design_templates set is_default = true where id = t.id returning * into t;

  perform public.write_platform_audit('template.default_set', null, 'design_template', t.id, null,
                                      jsonb_build_object('purpose', t.purpose, 'family', t.family));
  return t;
end $fn$;
revoke execute on function public.set_platform_template_default(uuid) from public, anon;
grant  execute on function public.set_platform_template_default(uuid) to authenticated;

-- SCR-083's list. A platform admin has no org, so `templates_read` (which needs
-- auth_org_id() for the org branch) is not the reader here — this is, and it
-- returns platform scope ONLY, so the screen cannot accidentally show org work.
create function public.platform_template_library()
returns table (
  id uuid, purpose public.template_purpose, family text, name text,
  is_default boolean, retired_at timestamptz, versions int, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform public.assert_platform_admin();
  return query
    select t.id, t.purpose, t.family, t.name, t.is_default, t.retired_at,
           (select count(*)::int from public.design_template_versions v where v.template_id = t.id),
           t.created_at
      from public.design_templates t
     where t.scope = 'platform'
     order by t.purpose, t.family, t.created_at;
end $fn$;
revoke execute on function public.platform_template_library() from public, anon;
grant  execute on function public.platform_template_library() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Metrics — REQ-ADM-003, SCR-084. AGGREGATE ONLY.
--    The views carry counts and the platform's own metadata about an org. No
--    member, no session title, no piece of content appears in either select
--    list — which is checkable in ten seconds by reading them, and is checked
--    by tests/rls/platform-schema.test.ts against a frozen column allow-list.
--    Neither view is granted to any client role; the two functions below
--    assert_platform_admin() first and are the only way in.
-- ═══════════════════════════════════════════════════════════════════════════
create view public.platform_org_metrics as
  select o.id                                        as org_id,
         o.name,
         o.slug,
         o.status,
         o.created_at,
         (select count(*) from public.members m where m.org_id = o.id)                              as members,
         (select count(*) from public.members m where m.org_id = o.id and m.status = 'active')      as active_members,
         (select count(*) from public.sessions s where s.org_id = o.id)                             as sessions,
         (select count(*) from public.sessions s where s.org_id = o.id and s.state = 'published')   as published_sessions,
         (select count(*) from public.sessions s where s.org_id = o.id and s.state = 'completed')   as completed_sessions,
         (select count(*) from public.certificates c where c.org_id = o.id)                         as certificates,
         (select count(*) from public.design_templates t where t.org_id = o.id)                     as org_templates
    from public.orgs o;
revoke all on public.platform_org_metrics from anon, authenticated, service_role;

create view public.platform_totals as
  select (select count(*) from public.orgs)                                    as orgs,
         (select count(*) from public.orgs where status = 'active')            as active_orgs,
         (select count(*) from public.orgs where status = 'suspended')         as suspended_orgs,
         (select count(*) from public.members)                                 as members,
         (select count(*) from public.members where status = 'active')         as active_members,
         (select count(*) from public.sessions)                                as sessions,
         (select count(*) from public.certificates)                            as certificates,
         (select count(*) from public.impersonation_sessions
                            where ended_at is null and expires_at > now())      as active_impersonations;
revoke all on public.platform_totals from anon, authenticated, service_role;

-- Named apart from the views on purpose: a function and a relation may share a
-- name in Postgres, and a reader who has to know which one `platform_totals`
-- means in a given position is a reader who will eventually be wrong.
create function public.platform_metrics_by_org() returns setof public.platform_org_metrics
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform public.assert_platform_admin();
  return query select * from public.platform_org_metrics m order by m.created_at desc;
end $fn$;
revoke execute on function public.platform_metrics_by_org() from public, anon;
grant  execute on function public.platform_metrics_by_org() to authenticated;

create function public.platform_metrics_totals() returns public.platform_totals
language plpgsql stable security definer set search_path = '' as $fn$
declare t public.platform_totals;
begin
  perform public.assert_platform_admin();
  select * into t from public.platform_totals;
  return t;
end $fn$;
revoke execute on function public.platform_metrics_totals() from public, anon;
grant  execute on function public.platform_metrics_totals() to authenticated;

-- Job health (11 §3.1). A FUNCTION, not a view: graphile_worker owns its schema
-- and may be absent (0025 raises 3F000 for exactly this), and a view over a
-- missing schema cannot be created at all.
create function public.platform_job_health()
returns table (task_identifier text, pending bigint, failed bigint, oldest_pending_seconds numeric)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  perform public.assert_platform_admin();
  if to_regnamespace('graphile_worker') is null then
    return;                                        -- not installed: no rows, not an error
  end if;
  -- The identifier lives in _private_tasks; _private_jobs carries task_id.
  return query execute $q$
    select t.identifier::text,
           count(*) filter (where j.attempts < j.max_attempts)::bigint,
           count(*) filter (where j.attempts >= j.max_attempts)::bigint,
           coalesce(max(extract(epoch from (now() - j.run_at))), 0)::numeric
      from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
     group by t.identifier
  $q$;
end $fn$;
revoke execute on function public.platform_job_health() from public, anon;
grant  execute on function public.platform_job_health() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Org deletion — REQ-NFR-014, 12 §5.5. Distinct from suspension
--     (REQ-TEN-006): confirmed with the slug typed back, audited on the
--     platform side, irreversible.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.delete_org(p_org uuid, p_slug_typed text) returns void
language plpgsql security definer set search_path = '' as $fn$
declare
  v_admin uuid := public.assert_platform_admin();
  v_org   public.orgs;
begin
  select * into v_org from public.orgs where id = p_org;
  if v_org.id is null then
    raise exception 'org_not_found' using errcode = '42501';
  end if;
  -- The confirmation IS the safety. Typing a slug back is the one step that
  -- cannot be performed by a mis-click or a replayed request.
  if p_slug_typed is null or lower(btrim(p_slug_typed)) <> v_org.slug then
    raise exception 'slug_mismatch' using errcode = '22023';
  end if;

  -- Sign-in stops now, using the columns 0004 already has rather than a new
  -- state: nobody works inside an org while its rows are being removed.
  if v_org.status <> 'suspended' then
    update public.orgs
       set status = 'suspended', suspended_at = now(), suspended_reason = 'pending_deletion'
     where id = p_org;
  end if;

  -- The row that survives the org. audit_log cascades from orgs, so the org's
  -- own log cannot hold this.
  perform public.write_platform_audit('org.deletion_requested', p_org, 'org', p_org,
                                      jsonb_build_object('name', v_org.name, 'slug', v_org.slug,
                                                         'status', v_org.status),
                                      null, 'confirmed with slug');

  perform public.enqueue_job('delete_org', jsonb_build_object('org_id', p_org, 'slug', v_org.slug),
                             'orgdel:' || p_org::text);
end $fn$;
revoke execute on function public.delete_org(uuid, text) from public, anon;
grant  execute on function public.delete_org(uuid, text) to authenticated;

-- The post-deletion assertion (REQ-NFR-014). Walks every table with an `org_id`
-- column DYNAMICALLY, so a table added in a later wave is covered the day it is
-- created rather than the day someone remembers to add it here.
create function public.assert_org_deleted(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  r     record;
  n     bigint;
  out_j jsonb := '{}'::jsonb;
begin
  for r in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'org_id' and t.table_type = 'BASE TABLE'
     order by c.table_name
  loop
    execute format('select count(*) from public.%I where org_id = $1', r.table_name)
       into n using p_org;
    if n > 0 then
      out_j := out_j || jsonb_build_object(r.table_name, n);
    end if;
  end loop;
  if exists (select 1 from public.orgs where id = p_org) then
    out_j := out_j || jsonb_build_object('orgs', 1);
  end if;
  return out_j;                                    -- '{}' means clean
end $fn$;
revoke execute on function public.assert_org_deleted(uuid) from public, anon, authenticated;
grant  execute on function public.assert_org_deleted(uuid) to service_role;

-- The destructive half, worker-only. Every org-scoped table cascades from
-- `orgs` (0004 onward), so ONE delete does the work — and the assertion above
-- proves that rather than assuming it.
--
-- It works because every append-only guard on the way down already carries an
-- org-deletion escape: `points_ledger_append_only` (0027),
-- `leaderboard_snapshot_guard` / `leaderboard_entry_guard` (0027),
-- `calendar_disconnected` (0038) and `org_domains_audit` (0008) each return
-- early when the parent org is already gone. Nothing here disables a trigger,
-- which is what makes this safe to run while the platform is live.
create function public.perform_org_deletion(p_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v_org public.orgs; v_residue jsonb;
begin
  select * into v_org from public.orgs where id = p_org;
  if v_org.id is null then
    -- Already gone: idempotent, and still asserted.
    return jsonb_build_object('deleted', false, 'residue', public.assert_org_deleted(p_org));
  end if;

  delete from public.orgs where id = p_org;
  v_residue := public.assert_org_deleted(p_org);

  perform public.write_platform_audit('org.deleted', p_org, 'org', p_org,
                                      jsonb_build_object('name', v_org.name, 'slug', v_org.slug),
                                      v_residue);
  return jsonb_build_object('deleted', true, 'residue', v_residue);
end $fn$;
revoke execute on function public.perform_org_deletion(uuid) from public, anon, authenticated;
grant  execute on function public.perform_org_deletion(uuid) to service_role;
