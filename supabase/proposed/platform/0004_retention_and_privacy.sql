-- platform (wave 4, M8) — retention, anonymisation and the member's own export.
-- Follows 0003.
--
-- Serves:  REQ-NFR-012 (every retained class has a period and a job),
--          REQ-PRF-006 / REQ-NFR-013 (a member exports their own data),
--          REQ-PRF-007 (members are anonymised, never deleted),
--          REQ-TEN-003 (the storage-prefix assertion's org list)
-- Cites:   11 §2.7, 12 §5.3, 12 §5.4, 03 §6, DEC-049
--
-- Every function here is `service_role` only and `security definer`: the
-- worker writes an org table through a definer function and never directly
-- (CLAUDE.md invariant 6 / § Data access 6). Each is idempotent, because
-- `11` §1.3 makes every job safe to replay.
--
-- ── 03 §8.2 rows this file needs ───────────────────────────────────────────
--   | `RPC-enforce_retention.periods` | The sweep reads `retention_periods` and
--     nothing else: a class marked `retain` deletes nothing, and the job is
--     worker-only — `authenticated` and a platform admin are both refused. |
--   | `RPC-enforce_retention.idempotent` | A second run in the same window
--     deletes nothing further, and never touches `points_ledger`. |
--   | `RPC-anonymise_members.total` | After anonymisation every org-level points
--     total is UNCHANGED and no ledger row is gone; the member's personal
--     columns are rewritten, `anonymised_at` is set, and the row keeps its id
--     as the pseudonymous key (`REQ-PRF-007`, `12` §5.4). |
--   | `RPC-anonymise_members.window` | A member deactivated yesterday is left
--     alone; only the period in `retention_periods` decides. |
--   | `RPC-build_data_export_payload.self_only` | The archive carries the
--     member's own rows and no other member's personal data — another member's
--     comment appears by display name alone, with no address and no id
--     (`REQ-PRF-006`). |
--   | `RPC-record_data_export.worker` | Only `service_role` may mark a request
--     ready or failed; the member can read their own row and write none of it. |
--   | `RPC-request_data_export.rate_limited` | A second request inside 24 hours
--     is refused `42501` while an already-queued one is returned unchanged
--     (`REQ-NFR-005`, `REQ-PRF-006`). |
--   | `RPC-my_data_export.self` | A member handed another member's request id
--     gets their OWN latest row, never the other's archive. |

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. The archive lives in the ROW, not in a bucket — and here is why.
--
-- `exports_storage_read` (0037) is `bucket_id = 'exports' and the first path
-- segment = auth_org_id()`. It has no member conjunct, because everything else
-- in that bucket is an org's own poster or certificate. Putting a member's
-- personal archive there would make it readable by EVERY member of the org,
-- and a storage policy is permissive: an extra policy can only widen, so the
-- subtree could not be narrowed without rewriting M5's.
--
-- The alternatives were a seventh bucket with a member-prefixed policy (03 §6
-- says six, and a bucket is a bigger thing to add than a column) or a Route
-- Handler streaming the bytes with `service_role` (invariant 7 — never on
-- Vercel). A `jsonb` column on the request row needs none of that: the
-- member's own `data_export_read_self` policy is already exactly the right
-- boundary, the Route Handler serves it with the member's own session, and
-- retention nulls the column after seven days.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.data_export_requests
  drop constraint data_export_ready_has_path,
  add  column payload jsonb;

-- `storage_path` is left in place, unused, and deliberately: the wave-4
-- isolation fixture (tests/rls/fixture-m7.ts) writes it, and dropping a column
-- out from under a file this track does not own would break a teammate's suite
-- to tidy a schema. It can go in a later migration, once that fixture writes
-- `payload` instead — flagged to the lead rather than done here.
--
-- There is no replacement CHECK either, for a reason worth stating: the table
-- has NO insert, update or delete grant for any role including `service_role`
-- (0069), so `record_data_export()` is the only thing that can ever set
-- `status = 'ready'`, and it sets the payload and the timestamp in the same
-- statement. A constraint here would guard a door with no handle.

-- REQ-NFR-005. The one-open-request index (0069) stops a flood of concurrent
-- requests; this stops a slow drip. Replaced rather than patched because the
-- rate limit belongs beside the insert it guards, not in a Route Handler that
-- a second caller could bypass.
create or replace function public.request_data_export() returns public.data_export_requests
language plpgsql security definer set search_path = '' as $req$
declare
  m    public.members := public.assert_active_member();
  req  public.data_export_requests;
  last timestamptz;
begin
  select * into req from public.data_export_requests
   where member_id = m.id and status in ('queued', 'building');
  if req.id is not null then
    return req;                                    -- already queued: idempotent, not an error
  end if;

  select max(requested_at) into last from public.data_export_requests where member_id = m.id;
  if last is not null and last > now() - interval '24 hours' then
    raise exception 'export_rate_limited' using errcode = '42501';
  end if;

  insert into public.data_export_requests (org_id, member_id)
  values (m.org_id, m.id)
  returning * into req;

  perform public.enqueue_job(
    'build_data_export',
    jsonb_build_object('request_id', req.id, 'member_id', m.id, 'org_id', m.org_id),
    'export:' || m.id::text || ':' || to_char(req.requested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSOF')
  );

  perform public.write_audit(m.org_id, 'privacy.export_requested', 'member', m.id, null,
                             jsonb_build_object('request_id', req.id), null, m.org_role::text, m.id);
  return req;
end $req$;
revoke execute on function public.request_data_export() from public, anon;
grant  execute on function public.request_data_export() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. enforce_retention — 12 §5.3, driven by the TABLE, never by a constant.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.enforce_retention() returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  r       public.retention_periods;
  n       bigint;
  summary jsonb := '{}'::jsonb;
begin
  for r in select * from public.retention_periods where action = 'delete' order by data_class loop
    -- The archive is a column, so its expiry is an UPDATE, not a delete: the
    -- request row stays as the record that a member asked, and only the
    -- personal payload goes (12 §5.3).
    if r.data_class = 'data_export_archives' then
      update public.data_export_requests
         set status = 'expired', payload = null, byte_size = null
       where status = 'ready' and completed_at < now() - make_interval(days => r.days);
      get diagnostics n = row_count;
      summary := summary || jsonb_build_object(r.data_class, n);
      continue;
    end if;
    execute format('delete from public.%I where %I < now() - make_interval(days => $1)', r.table_name, r.age_column)
      using r.days;
    get diagnostics n = row_count;
    summary := summary || jsonb_build_object(r.data_class, n);
  end loop;
  -- Stated rather than implied: the ledger is never trimmed (12 §5.3,
  -- REQ-PTS-011), and a reader of this summary should see that it was
  -- considered and skipped, not that it was forgotten.
  summary := summary || jsonb_build_object('points_ledger', 'retained');
  return summary;
end $fn$;
revoke execute on function public.enforce_retention() from public, anon, authenticated;
grant  execute on function public.enforce_retention() to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. anonymise_members — 12 §5.4, REQ-PRF-007.
--
-- ★ NO LEDGER ROW IS DELETED AND NO ORG TOTAL MOVES. `members.id` already IS
--   the pseudonymous key every ledger row carries, so balances reconcile by
--   construction rather than by a remapping step that could go wrong.
--   Authored content stays and is attributed «عضو سابق» at the DAL, from
--   `anonymised_at` — not by rewriting an author column, which would lose the
--   link the ledger depends on.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.anonymise_members() returns jsonb
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
    select id, org_id, email from public.members
     where status = 'deactivated'
       and anonymised_at is null
       and deactivated_at < now() - make_interval(days => v_days)
  loop
    update public.members
       set display_name = null,
           -- The address must stay UNIQUE per org (0004's `unique (org_id, email)`)
           -- and must no longer be a person's. The member's own id is the one
           -- value guaranteed unique and already stored in the ledger.
           email        = ('anon+' || id::text || '@invalid.local')::extensions.citext,
           avatar_url   = null,
           job_title    = null,
           bio          = null,
           company_id   = null,
           anonymised_at = now()
     where id = m.id;

    -- Interests are a personal profile, not content anyone depends on.
    delete from public.member_interests where member_id = m.id;

    perform public.write_audit(m.org_id, 'member.anonymised', 'member', m.id,
                               jsonb_build_object('had_email', true),
                               jsonb_build_object('anonymised', true),
                               'retention', 'system', null);
    n := n + 1;
  end loop;
  return jsonb_build_object('anonymised', n, 'after_days', v_days);
end $fn$;
revoke execute on function public.anonymise_members() from public, anon, authenticated;
grant  execute on function public.anonymise_members() to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The member's own export — REQ-PRF-006, REQ-NFR-013.
--
-- ★ THE MEMBER'S OWN ROWS ONLY. The one place another person appears is a
--   comment thread the member took part in, and there they appear by DISPLAY
--   NAME alone — no address, no id, no profile — which is exactly what
--   `REQ-PRF-006` allows and no more.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.build_data_export_payload(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare m public.members;
begin
  select * into m from public.members where id = p_member;
  if m.id is null then
    raise exception 'member_not_found' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'member', jsonb_build_object(
      'id', m.id, 'email', m.email, 'display_name', m.display_name,
      'job_title', m.job_title, 'bio', m.bio, 'org_role', m.org_role,
      'status', m.status, 'created_at', m.created_at
    ),
    'org', (select jsonb_build_object('name', o.name, 'slug', o.slug) from public.orgs o where o.id = m.org_id),
    'interests', (
      select coalesce(jsonb_agg(c.name order by c.name), '[]'::jsonb)
        from public.member_interests i join public.categories c on c.id = i.category_id
       where i.member_id = m.id
    ),
    'rsvps', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'starts_at', s.starts_at, 'status', r.status, 'reserved_at', r.reserved_at
             ) order by r.reserved_at), '[]'::jsonb)
        from public.rsvps r join public.sessions s on s.id = r.session_id
       where r.member_id = m.id
    ),
    'check_ins', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'arrived_at', ci.arrived_at, 'method', ci.method
             ) order by ci.arrived_at), '[]'::jsonb)
        from public.check_ins ci join public.sessions s on s.id = ci.session_id
       where ci.member_id = m.id
    ),
    'comments', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'body', c.body, 'created_at', c.created_at,
               -- The one appearance of another person, and by display name
               -- alone — never an address and never an id (REQ-PRF-006).
               'in_reply_to', (
                 select pm.display_name from public.comments pc
                   join public.members pm on pm.id = pc.author_id
                  where pc.id = c.parent_id
               )
             ) order by c.created_at), '[]'::jsonb)
        from public.comments c join public.sessions s on s.id = c.session_id
       where c.author_id = m.id and c.deleted_at is null
    ),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'storage_path', p.storage_path, 'created_at', p.created_at
             ) order by p.created_at), '[]'::jsonb)
        from public.photos p join public.sessions s on s.id = p.session_id
       where p.uploader_id = m.id
    ),
    -- Ratings the member SUBMITTED. D36's anonymity runs the other way — a
    -- presenter never learns who rated them — and is untouched by this.
    'ratings_given', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'session_stars', r.session_stars, 'presenter_stars', r.presenter_stars,
               'comment', r.comment, 'submitted_at', r.submitted_at
             ) order by r.submitted_at), '[]'::jsonb)
        from public.ratings r join public.sessions s on s.id = r.session_id
       where r.member_id = m.id
    ),
    'points_ledger', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'amount', l.amount, 'source', l.source, 'reason', l.reason, 'occurred_at', l.occurred_at
             ) order by l.occurred_at), '[]'::jsonb)
        from public.points_ledger l where l.member_id = m.id
    ),
    'certificates', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'serial', c.serial, 'kind', c.kind, 'state', c.state, 'issued_at', c.issued_at
             ) order by c.issued_at), '[]'::jsonb)
        from public.certificates c where c.member_id = m.id
    )
  );
end $fn$;
revoke execute on function public.build_data_export_payload(uuid) from public, anon, authenticated;
grant  execute on function public.build_data_export_payload(uuid) to service_role;

create function public.record_data_export(p_request uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $fn$
declare d public.data_export_requests;
begin
  update public.data_export_requests
     set status = 'ready', payload = p_payload, byte_size = octet_length(p_payload::text),
         completed_at = now(), error = null
   where id = p_request
   returning * into d;
  if d.id is null then
    raise exception 'request_not_found' using errcode = '42501';
  end if;
  perform public.write_audit(d.org_id, 'privacy.export_ready', 'member', d.member_id, null,
                             jsonb_build_object('request_id', d.id), null, 'system', null);
end $fn$;

create function public.fail_data_export(p_request uuid, p_error text) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  update public.data_export_requests
     set status = 'failed', error = left(coalesce(p_error, 'unknown'), 500), completed_at = now()
   where id = p_request;
end $fn$;
revoke execute on function public.record_data_export(uuid, jsonb), public.fail_data_export(uuid, text)
  from public, anon, authenticated;
grant  execute on function public.record_data_export(uuid, jsonb), public.fail_data_export(uuid, text)
  to service_role;

-- The member's own download. It re-derives the owner from the SESSION and uses
-- the request id only to pick among their own rows (CLAUDE.md § Validation:
-- take a reference plus the change, re-derive ownership) — a well-formed id
-- belonging to someone else selects nothing rather than someone else's archive.
create function public.my_data_export(p_request uuid default null) returns public.data_export_requests
language plpgsql stable security definer set search_path = '' as $fn$
declare m public.members := public.assert_active_member(); d public.data_export_requests;
begin
  select * into d from public.data_export_requests
   where member_id = m.id and (p_request is null or id = p_request)
   order by requested_at desc limit 1;
  return d;
end $fn$;
revoke execute on function public.my_data_export(uuid) from public, anon;
grant  execute on function public.my_data_export(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The storage-prefix assertion's org list — REQ-TEN-003, 03 §6, DEC-049.
--
-- Storage paths are the ONLY place isolation depends on application
-- correctness, so the nightly job walks every bucket and proves no object
-- sits outside its org's prefix. It needs the set of valid prefixes, and
-- that set is this function rather than a query the worker writes itself:
-- one definer door, and no direct table read from the worker.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.platform_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $fn$
  select id from public.orgs
$fn$;
revoke execute on function public.platform_org_ids() from public, anon, authenticated;
grant  execute on function public.platform_org_ids() to service_role;
