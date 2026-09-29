-- 0162 · wave 16 (DEC-195 §2.6, DEC-197) — what a member has seen.
--
-- Moments 3 to 5 play the FIRST time a member sees an occurrence: the ledger
-- rows a completion pass wrote, a new level, a rank that differs from the one
-- they last saw (REQ-UIX-047, REQ-UIX-048). Nothing stored what a member had
-- seen, and the all-time board keeps no history (DEC-186 §7). Browser storage
-- replays on every new phone, so the record is here: `scoring`'s contract 5.
--
-- ★ A CURSOR, NOT A LOG. One row per member, overwritten. **No timestamp of any
-- kind** — a `seen_at` would be a record of when someone opened their points
-- page, a behavioural log nobody asked for. `survey_participations` (0124) is
-- the precedent. The values are copies of source data; the row is a bookmark.
--
-- Written only by the member it belongs to, through `scoring`'s two invoker
-- functions (proposed/scoring, promoted separately) or directly — RLS is the
-- boundary either way. The worker never reads or writes it: `service_role` gets
-- nothing. No delete: the member's deletion cascades, and a member has no reason
-- to erase their bookmark. No super-admin disjunct (invariant 8).
--
-- Additive for `main`: nothing on `main` names this table, so `main`'s app and
-- worker on this schema do nothing different.

create table public.member_seen_marks (
  member_id        uuid primary key references public.members(id) on delete cascade,
  org_id           uuid not null references public.orgs(id) on delete cascade,
  -- `points_balances`' last entry when last seen. No FK: an opaque marker, and
  -- ledger rows leave only with their org, which takes this row too.
  points_entry_id  uuid,
  points_total     int,
  level_id         uuid references public.levels(id) on delete set null,
  all_time_rank    int check (all_time_rank > 0),
  monthly_period   date,
  monthly_rank     int check (monthly_rank > 0),
  company_period   date,
  -- A move to another company is not a «rise»: the company is part of the mark.
  company_id       uuid references public.companies(id) on delete set null,
  company_rank     int check (company_rank > 0),
  company_fraction numeric check (company_fraction between 0 and 1)
);

create index member_seen_marks_org on public.member_seen_marks (org_id);

alter table public.member_seen_marks enable row level security;
revoke all on public.member_seen_marks from anon, authenticated, service_role;

-- A member's own row, in their own org. A level or a company named on the row
-- must be of that org too, so a bookmark cannot point across the tenant line.
create policy "member_seen_marks_read_own" on public.member_seen_marks for select to authenticated
  using (member_id = public.auth_member_id() and org_id = public.auth_org_id());

create policy "member_seen_marks_insert_own" on public.member_seen_marks for insert to authenticated
  with check (
    member_id = public.auth_member_id() and org_id = public.auth_org_id()
    and (level_id is null or exists (select 1 from public.levels l where l.id = level_id and l.org_id = public.auth_org_id()))
    and (company_id is null or exists (select 1 from public.companies c where c.id = company_id and c.org_id = public.auth_org_id()))
  );

create policy "member_seen_marks_update_own" on public.member_seen_marks for update to authenticated
  using (member_id = public.auth_member_id() and org_id = public.auth_org_id())
  with check (
    member_id = public.auth_member_id() and org_id = public.auth_org_id()
    and (level_id is null or exists (select 1 from public.levels l where l.id = level_id and l.org_id = public.auth_org_id()))
    and (company_id is null or exists (select 1 from public.companies c where c.id = company_id and c.org_id = public.auth_org_id()))
  );

grant select, insert, update on public.member_seen_marks to authenticated;

-- ─── anonymisation takes the mark with the person ───────────────────────────
-- `anonymise_members()` as 0158 left it — the same signature, the same grants
-- (`create or replace` keeps them), the same summary keys — with one line: the
-- anonymised member's mark is deleted. Every value in it is a copy of source
-- data, and the export leaves it out for the same reason. `main`'s worker calls
-- this function by the same name with the same arguments: nothing changes for it.
create or replace function public.anonymise_members() returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_days int;
  m      record;
  n      int := 0;
begin
  select days into v_days from public.retention_periods where data_class = 'deactivated_members';
  if v_days is null then
    raise exception 'retention_period_missing: deactivated_members' using errcode = '22023';
  end if;

  for m in
    select id, org_id, email, avatar_import, avatar_version from public.members
     where status = 'deactivated'
       and anonymised_at is null
       and deactivated_at < now() - make_interval(days => v_days)
  loop
    update public.members
       set display_name = null,
           -- The address must stay UNIQUE per org (0004's `unique (org_id, email)`)
           -- and must no longer be a person's. The member's own id is the one
           -- value guaranteed unique and already stored in the ledger.
           email          = ('anon+' || id::text || '@invalid.local')::extensions.citext,
           avatar_url     = null,
           avatar_import  = null,
           avatar_version = null,
           job_title      = null,
           bio            = null,
           company_id     = null,
           anonymised_at  = now()
     where id = m.id;

    -- Interests are a personal profile, not content anyone depends on.
    delete from public.member_interests where member_id = m.id;

    -- wave 16 (0162, DEC-197): what the member had seen is a copy of source data
    -- that no one else reads; it goes with the person.
    delete from public.member_seen_marks where member_id = m.id;

    -- REQ-PRF-011: «no storage object remains». Only a member who once said
    -- yes can have one; the job deletes everything under their prefix.
    if m.avatar_import = 'accepted' or m.avatar_version is not null then
      perform public.enqueue_job('import_avatar', jsonb_build_object('member_id', m.id),
                                 'avatar:' || m.id::text, null, 'convert', 3);
    end if;

    perform public.write_audit(m.org_id, 'member.anonymised', 'member', m.id,
                               jsonb_build_object('had_email', true),
                               jsonb_build_object('anonymised', true),
                               'retention', 'system', null);
    n := n + 1;
  end loop;
  return jsonb_build_object('anonymised', n, 'after_days', v_days);
end $fn$;
