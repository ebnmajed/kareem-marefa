-- 0004 — tenancy and identity: the tables, their RLS, their grants.
-- 02-domain-model.md §4.1, §4.2, §4.16 · 03-permissions-rls.md §5.1, §5.10, §8 ·
-- REQ-TEN-001 … REQ-TEN-008 · REQ-AUT-002 · REQ-PRF-001 … REQ-PRF-004 ·
-- REQ-ADM-018 · REQ-NFR-001 · REQ-NFR-006
--
-- Every table here: org_id (except the documented exceptions in 02 §7), RLS
-- enabled, a full policy set, and a matching grant. The grants are written
-- explicitly in BOTH directions — revoke, then grant — because a hosted
-- Supabase project has default privileges that hand every new table to anon,
-- authenticated and service_role, while a bare Postgres (CI) has none. The
-- migration must mean the same thing in both.
--
-- No policy anywhere contains a super-admin disjunct (DEC-014).
--
-- service_role gets NO direct table privileges on any platform table. The
-- worker uses service_role only through SECURITY DEFINER functions
-- (CLAUDE.md invariant 6, 04 §5.1); a hosted project's default privileges
-- would hand it everything, so each table revokes it explicitly (DEC-035).

-- ═══════════════════════════════════════════════════════════════════════════
-- orgs — the tenant root. The only table that IS the org (02 §7).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.orgs (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(btrim(name)) between 2 and 120),
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status              public.org_status not null default 'active',
  certificate_prefix  text not null check (certificate_prefix ~ '^[A-Z]{2,5}$'),
  created_by          uuid not null,
  -- REQ-TEN-002: the super admin names the first org admin; provision_member()
  -- grants the role when that address signs in. Admin-only to read: it is
  -- outside the select grant below.
  first_admin_email   extensions.citext,
  suspended_at        timestamptz,
  suspended_reason    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check ((status = 'suspended') = (suspended_at is not null)),
  check (suspended_at is null or suspended_reason is not null)
);
comment on table public.orgs is 'The tenant. Created and suspended only by a platform admin RPC (REQ-TEN-002, REQ-TEN-006).';
create trigger orgs_updated_at before update on public.orgs
  for each row execute function public.set_updated_at();

alter table public.orgs enable row level security;
revoke all on public.orgs from anon, authenticated, service_role;
-- §5.1a
create policy "orgs_read_own" on public.orgs for select to authenticated
  using (id = public.auth_org_id());
create policy "orgs_update_own" on public.orgs for update to authenticated
  using       (id = public.auth_org_id() and public.is_org_admin())
  with check  (id = public.auth_org_id() and public.is_org_admin());
grant select (id, name, slug, status, certificate_prefix, created_at, updated_at) on public.orgs to authenticated;
-- The admin may change the name; never the slug, status, prefix or suspension.
grant update (name) on public.orgs to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- platform_admins — platform level, no org_id, NO POLICY. Read only by the
-- auth hook (0006) as supabase_auth_admin. REQ-ADM-002.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.platform_admins (
  auth_user_id  uuid primary key,
  created_at    timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- org_domains — the membership control. Admin-only, INCLUDING read.
-- REQ-TEN-007, REQ-AUT-003, REQ-AUT-004
-- ═══════════════════════════════════════════════════════════════════════════
create table public.org_domains (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  -- stored lowercase, no leading @ — normalised by trigger, checked here
  domain      extensions.citext not null check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  created_at  timestamptz not null default now(),
  -- Deliberately NOT globally unique (A2): one domain may sit on several
  -- orgs' lists, which is exactly what makes the REQ-AUT-004 picker exist.
  unique (org_id, domain)
);
create index org_domains_domain_idx on public.org_domains (domain);

create function public.org_domains_normalise() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.domain := lower(ltrim(btrim(new.domain::text), '@'));
  return new;
end $$;
create trigger org_domains_normalise before insert or update on public.org_domains
  for each row execute function public.org_domains_normalise();

alter table public.org_domains enable row level security;
revoke all on public.org_domains from anon, authenticated, service_role;
create policy "org_domains_read_admin" on public.org_domains for select to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_insert" on public.org_domains for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.org_domains for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_delete" on public.org_domains for delete to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin());
grant select, insert, update, delete on public.org_domains to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- org_settings — one typed row per org. REQ-TEN-008.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.org_settings (
  id                            uuid primary key default gen_random_uuid(),
  org_id                        uuid not null unique references public.orgs(id) on delete cascade,
  time_zone                     text not null default 'Asia/Riyadh',
  numerals                      public.numeral_system not null default 'western',
  check_in_rotation_seconds     int not null default 600 check (check_in_rotation_seconds between 60 and 3600),
  check_in_grace_seconds        int not null default 120 check (check_in_grace_seconds between 0 and 600),
  reminder_offsets_minutes      int[] not null default '{10080,1440,120}',
  rating_prompt_delay_minutes   int not null default 60 check (rating_prompt_delay_minutes >= 0),
  rating_window_days            int not null default 14 check (rating_window_days between 1 and 90),
  comment_edit_window_minutes   int not null default 15 check (comment_edit_window_minutes between 0 and 1440),
  max_co_presenters             int not null default 4 check (max_co_presenters between 0 and 10),
  company_metric                public.company_metric not null default 'points_per_active_member',
  priority_rsvp_hours           int not null default 24 check (priority_rsvp_hours between 0 and 168),
  limit_document_mb             int not null default 50  check (limit_document_mb between 1 and 500),
  limit_audio_mb                int not null default 200 check (limit_audio_mb between 1 and 2000),
  limit_image_mb                int not null default 20  check (limit_image_mb between 1 and 100),
  limit_poster_mb               int not null default 30  check (limit_poster_mb between 1 and 200),
  allow_jpeg_export             boolean not null default false,
  email_from_name               text,
  email_reply_to                text,
  rating_min_aggregate          int not null default 3 check (rating_min_aggregate between 1 and 20),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);
create trigger org_settings_updated_at before update on public.org_settings
  for each row execute function public.set_updated_at();

alter table public.org_settings enable row level security;
revoke all on public.org_settings from anon, authenticated, service_role;
create policy "p1_org_read" on public.org_settings for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_update" on public.org_settings for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
grant select on public.org_settings to authenticated;
-- Everything except identity and timestamps; no insert or delete path exists.
grant update (time_zone, numerals, check_in_rotation_seconds, check_in_grace_seconds,
              reminder_offsets_minutes, rating_prompt_delay_minutes, rating_window_days,
              comment_edit_window_minutes, max_co_presenters, company_metric,
              priority_rsvp_hours, limit_document_mb, limit_audio_mb, limit_image_mb,
              limit_poster_mb, allow_jpeg_export, email_from_name, email_reply_to,
              rating_min_aggregate)
  on public.org_settings to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- companies · categories · venues — admin-managed lists. Deactivate, never
-- delete (REQ-ADM-006): no delete policy, no delete grant.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.companies (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  deactivated_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index companies_org_name_active_key on public.companies (org_id, name)
  where deactivated_at is null;
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

create table public.categories (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  deactivated_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index categories_org_name_active_key on public.categories (org_id, name)
  where deactivated_at is null;
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

create table public.venues (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  address         text,
  map_url         text check (map_url is null or map_url ~ '^https://'),
  capacity        int check (capacity is null or capacity > 0),
  notes           text,
  time_zone       text,                      -- override, OQ-018
  deactivated_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger venues_updated_at before update on public.venues
  for each row execute function public.set_updated_at();

-- P1 read, P2 insert/update, no delete — identical on all three.
alter table public.companies enable row level security;
revoke all on public.companies from anon, authenticated, service_role;
create policy "p1_org_read" on public.companies for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_insert" on public.companies for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.companies for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
grant select, insert, update on public.companies to authenticated;

alter table public.categories enable row level security;
revoke all on public.categories from anon, authenticated, service_role;
create policy "p1_org_read" on public.categories for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_insert" on public.categories for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.categories for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
grant select, insert, update on public.categories to authenticated;

alter table public.venues enable row level security;
revoke all on public.venues from anon, authenticated, service_role;
create policy "p1_org_read" on public.venues for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_insert" on public.venues for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.venues for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
grant select, insert, update on public.venues to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- members — keyed to the auth user, never to an email or a provider (REQ-AUT-002).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.members (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs(id) on delete cascade,
  auth_user_id         uuid not null unique references auth.users(id) on delete cascade,
  email                extensions.citext not null,
  display_name         text check (display_name is null or char_length(btrim(display_name)) between 1 and 120),
  avatar_url           text check (avatar_url is null or avatar_url ~ '^https://'),
  company_id           uuid references public.companies(id),
  job_title            text check (job_title is null or char_length(job_title) <= 120),
  bio                  text check (bio is null or char_length(bio) <= 600),
  org_role             public.org_role not null default 'member',
  status               public.member_status not null default 'active',
  claims_version       int not null default 1,
  leaderboard_opt_out  boolean not null default false,
  deactivated_at       timestamptz,
  deactivated_reason   text,
  deactivated_by       uuid references public.members(id),
  anonymised_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (org_id, email),
  check ((status = 'deactivated') = (deactivated_at is not null)),
  check (deactivated_at is null or deactivated_reason is not null)
);
create index members_org_status_idx  on public.members (org_id, status);
create index members_org_company_idx on public.members (org_id, company_id);
create trigger members_updated_at before update on public.members
  for each row execute function public.set_updated_at();

-- org_id is immutable: D4 / REQ-TEN-004 as a trigger, not as etiquette. It
-- raises for every role, service_role included — bypassrls skips policies,
-- not triggers.
create function public.members_org_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'members.org_id is immutable (REQ-TEN-004)' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger members_org_immutable before update on public.members
  for each row execute function public.members_org_immutable();

-- A member's company must belong to the member's org.
create function public.members_company_same_org() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.company_id is not null and not exists (
    select 1 from public.companies c where c.id = new.company_id and c.org_id = new.org_id
  ) then
    raise exception 'company belongs to another org' using errcode = '23503';
  end if;
  return new;
end $$;
create trigger members_company_same_org before insert or update of company_id on public.members
  for each row execute function public.members_company_same_org();

alter table public.members enable row level security;
revoke all on public.members from anon, authenticated, service_role;
-- §5.1b — row access to the org; FIELD tiering is the column grant below (A33).
create policy "members_read_org" on public.members for select to authenticated
  using (org_id = public.auth_org_id());
-- §5.1c — self-service fields only
create policy "members_update_self" on public.members for update to authenticated
  using       (id = public.auth_member_id() and org_id = public.auth_org_id())
  with check  (id = public.auth_member_id() and org_id = public.auth_org_id());
-- The column grant IS the member tier. `email`, `deactivated_*`, `anonymised_at`,
-- `claims_version` are absent: selecting them errors (42501), never returns null.
grant select (id, org_id, display_name, avatar_url, company_id, job_title, bio,
              org_role, status, leaderboard_opt_out, created_at)
  on public.members to authenticated;
-- `org_role`, `status`, `org_id` are absent: nobody promotes themselves by
-- crafting an update. Role changes are an assert_fresh_admin() RPC (0005).
grant update (display_name, company_id, job_title, bio, leaderboard_opt_out)
  on public.members to authenticated;

-- The member tier as a view, for every read of someone else's profile.
-- security_invoker: the base table's RLS and column grant still apply.
-- (An anonymised member is also deactivated, so `status = 'active'` is the
-- whole predicate; `anonymised_at` stays outside the column grant.)
create view public.members_member_view
with (security_invoker = true) as
  select id, org_id, display_name, avatar_url, company_id, job_title, bio, org_role, created_at
    from public.members
   where status = 'active';
revoke all on public.members_member_view from anon, authenticated, service_role;
grant select on public.members_member_view to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- member_interests — REQ-PRF-001. P1 read, P3 self-write.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.member_interests (
  org_id       uuid not null references public.orgs(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  category_id  uuid not null references public.categories(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (member_id, category_id)
);
create index member_interests_org_category_idx on public.member_interests (org_id, category_id);

alter table public.member_interests enable row level security;
revoke all on public.member_interests from anon, authenticated, service_role;
create policy "p1_org_read" on public.member_interests for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p3_self_insert" on public.member_interests for insert to authenticated
  with check (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "p3_self_update" on public.member_interests for update to authenticated
  using       (org_id = public.auth_org_id() and member_id = public.auth_member_id())
  with check  (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "p3_self_delete" on public.member_interests for delete to authenticated
  using       (org_id = public.auth_org_id() and member_id = public.auth_member_id());
grant select, insert, update, delete on public.member_interests to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- scoring_config_history — every configuration change, one history.
-- REQ-TEN-008, REQ-PTS-005. Append-only: writes come from triggers and RPCs.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.scoring_config_history (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  scope       text not null check (scope in ('scoring', 'org_settings', 'badges', 'levels', 'perks', 'streaks')),
  entity_id   uuid,
  field       text not null,
  old_value   jsonb,
  new_value   jsonb,
  actor_id    uuid references public.members(id),
  changed_at  timestamptz not null default now()
);
create index scoring_config_history_org_changed_idx on public.scoring_config_history (org_id, changed_at desc);

alter table public.scoring_config_history enable row level security;
revoke all on public.scoring_config_history from anon, authenticated, service_role;
create policy "config_history_read_admin" on public.scoring_config_history for select to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());
grant select on public.scoring_config_history to authenticated;
revoke insert, update, delete on public.scoring_config_history from anon, authenticated;
revoke update, delete on public.scoring_config_history from service_role;

-- org_settings changes land in the history automatically, column by column,
-- so no code path can change a setting without a trace (REQ-TEN-008).
create function public.org_settings_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  col text;
  oldj jsonb := to_jsonb(old);
  newj jsonb := to_jsonb(new);
begin
  for col in select key from jsonb_each(newj) loop
    if col in ('id', 'org_id', 'created_at', 'updated_at') then continue; end if;
    if oldj -> col is distinct from newj -> col then
      insert into public.scoring_config_history (org_id, scope, entity_id, field, old_value, new_value, actor_id)
      values (new.org_id, 'org_settings', new.id, col, oldj -> col, newj -> col, public.auth_member_id());
    end if;
  end loop;
  return new;
end $$;
create trigger org_settings_history after update on public.org_settings
  for each row execute function public.org_settings_history();

-- ═══════════════════════════════════════════════════════════════════════════
-- audit_log — evidence. Append-only; revoke including service_role (P4).
-- REQ-ADM-018, REQ-NFR-006
-- ═══════════════════════════════════════════════════════════════════════════
create table public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  actor_id      uuid,                                  -- null when the system acted
  actor_role    text check (actor_role in ('admin', 'moderator', 'member', 'platform_admin', 'system')),
  action        text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  subject_type  text,
  subject_id    uuid,
  before        jsonb,
  after         jsonb,
  reason        text,
  ip            inet,
  user_agent    text,
  occurred_at   timestamptz not null default now()
);
create index audit_log_org_occurred_idx   on public.audit_log (org_id, occurred_at desc);
create index audit_log_org_actor_idx      on public.audit_log (org_id, actor_id, occurred_at desc);
create index audit_log_org_subject_idx    on public.audit_log (org_id, subject_type, subject_id);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated, service_role;
-- §5.10a
create policy "audit_read_admin" on public.audit_log for select to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());
create policy "audit_read_moderator_own" on public.audit_log for select to authenticated
  using (org_id = public.auth_org_id() and public.is_staff() and actor_id = public.auth_member_id());
grant select on public.audit_log to authenticated;
revoke insert, update, delete on public.audit_log from anon, authenticated, service_role;
