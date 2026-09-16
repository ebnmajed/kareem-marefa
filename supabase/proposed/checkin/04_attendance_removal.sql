-- wave 7 (DEC-141, REQ-CHK-017) — the reversal: soft-delete on check_ins,
-- partial unique + exclusion constraints, remove_check_in(), and every
-- direct SQL reader of "does this member have a check_ins row" corrected to
-- exclude a removed one, in the same file that makes the column exist.
--
-- Soft-delete, not hard-delete — forced by the schema, not a style choice:
-- certificates.check_in_id (0055) carries BOTH `on delete restrict` AND a
-- check constraint (`kind <> 'attendance' or check_in_id is not null`), so a
-- check_ins row a certificate references can never be deleted and can never
-- be repointed to null either. Reuses comments.deleted_at's exact existing
-- precedent (0032's _reverse_comment_points()) instead of inventing a new
-- shape.
--
-- The unique and exclusion constraints both become PARTIAL
-- (`where removed_at is null`) — this is what makes re-adding after a
-- removal need NO new RPC at all: check_in() and mark_checked_in_manually()
-- already INSERT, and once the old row's slot is freed by the partial
-- index, a fresh code entry or manual mark just works, with its own new id,
-- its own fresh points award, independent of the reversed original. It also
-- frees REQ-CHK-013's overlap exclusion once a check-in is retracted.
--
-- ★ Found while writing this file, not part of the ruling as stated: the
-- PRESENTER earns `attendee_bonus` per check-in (`worker/src/tasks/
-- award_presenter_points.ts`), keyed `source = 'attendee_bonus',
-- source_id = <check_in.id>` — the SAME `source_id` the attendee's own
-- `check_in` award uses. This is reversed too, by the same compensating
-- mechanism, on the reasoning that it is a deterministic per-check-in award
-- like the attendee's own — not an aggregate/threshold thing like a badge
-- or a streak (`DEC-141` ruling 4's "don't reverse" list). Flagged in
-- docs/plan/notes/checkin.md for the lead's eyes, not silently assumed.
--
-- Serves:  REQ-CHK-017, REQ-PTS-011, invariant 9, REQ-CRT-004, REQ-CRT-011
-- Cites:   0010 (check_ins, has_checked_in, the constraints — all amended
--          here), 0032 (_reverse_comment_points — the reversal pattern
--          mirrored), 0065 (revoke_certificate — reused, not duplicated),
--          checkin/01 (check_in — re-created a second time), checkin/03
--          (mark_checked_in_manually — re-created a second time)
-- Docs:    docs/plan/notes/checkin.md "Wave 7 plan" §1, "reader inventory"
--
-- 03 §8.2 rows this adds:
--   | `RPC-remove_check_in.admin_only` | A member, a presenter and a moderator are all refused `not_authorized`; only an admin succeeds. |
--   | `RPC-remove_check_in.reason_required` | An empty reason is refused before anything is written. |
--   | `RPC-remove_check_in.reversal` | Removing a check-in with a points award inserts ONE compensating `reversal` row per original award (attendee's own and the presenter's `attendee_bonus`), `-amount`, reason «أُلغي تسجيل الحضور»; a second removal attempt is refused, never a second reversal. |
--   | `RPC-remove_check_in.certificate_revoked` | Removing a check-in with an issued attendance certificate revokes it through the existing `revoke_certificate()` path — audited, PDF not deleted, the member never sees the admin's own words. |
--   | `RPC-remove_check_in.no_show_symmetry` | Removing a confirmed-RSVP member's check-in awards the `no_show` rule with the same key `evaluate_no_shows` would compute. |
--   | `RPC-remove_check_in.not_found` | Removing a member with no active check-in (never checked in, or already removed) is refused `P0002`. |
--   | `RPC-remove_check_in.readd` | After a removal, the same member can check in again (code or manual) with no special path — the partial index frees the slot. |
--   | `POL-check_ins.removed_excluded_from_overlap` | A removed check-in no longer blocks an overlapping session's check-in (REQ-CHK-013). |
--   | `POL-has_checked_in.excludes_removed` | `has_checked_in()` returns false once the check-in is removed — the photo-upload gate re-derives live. |
--   | `POL-ratings.write_self_excludes_removed` | A rating insert whose `check_in_id` points at a removed check-in is refused, same as no check-in at all. |

-- ═══════════════════════════════════════════════════════════════════════════
-- the soft-delete columns
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.check_ins
  add column removed_at      timestamptz,
  add column removed_by      uuid references public.members(id),
  add column removal_reason  text;
comment on column public.check_ins.removed_at is
  'REQ-CHK-017: an admin-only, audited removal. Soft — the row stays for certificates.check_in_id (on delete restrict) and for the audit trail. "Checked in" everywhere means this column is null.';

alter table public.check_ins drop constraint check_ins_session_id_member_id_key;
create unique index check_ins_session_member_active_uq on public.check_ins (session_id, member_id) where removed_at is null;

alter table public.check_ins drop constraint check_ins_member_id_session_window_excl;
alter table public.check_ins add constraint check_ins_member_id_session_window_excl
  exclude using gist (member_id with =, session_window with &&) where (removed_at is null);

-- ═══════════════════════════════════════════════════════════════════════════
-- has_checked_in() — re-created. REQ-CHK-009's four rights all key off
-- this; a removed check-in must stop granting the photo-upload right
-- (0037, 0050) the moment it's removed.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.has_checked_in(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.check_ins c
     where c.session_id = p_session and c.member_id = public.auth_member_id() and c.removed_at is null
  )
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ratings_write_self — re-created. Its OWN direct check_ins reference
-- (never routed through has_checked_in()) needs the same filter — found
-- while writing this file, corrected here rather than assumed covered by
-- the function above.
-- ═══════════════════════════════════════════════════════════════════════════
drop policy "ratings_write_self" on public.ratings;
create policy "ratings_write_self" on public.ratings for insert to authenticated
  with check (org_id = public.auth_org_id()
              and member_id = public.auth_member_id()
              and check_in_id in (select id from public.check_ins c
                                   where c.session_id = ratings.session_id and c.member_id = public.auth_member_id()
                                     and c.removed_at is null)
              and exists (select 1 from public.sessions s
                           where s.id = session_id and s.state = 'completed'
                             and now() <= s.completed_at + make_interval(days => (select os.rating_window_days
                                                                                   from public.org_settings os
                                                                                  where os.org_id = ratings.org_id))));

-- ═══════════════════════════════════════════════════════════════════════════
-- check_in() — re-created a second time (checkin/01 was the first, for the
-- window). The single-use lookup and the overlap lookup both need
-- `removed_at is null` — without it, re-checking in after a removal would
-- read the OLD removed row as "already checked in" and hand it back instead
-- of creating a fresh one, and the overlap lookup could name a session the
-- member is no longer actually recorded against.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.check_in(p_session uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m public.members := public.assert_active_member();
  s public.sessions;
  c public.check_in_codes;
  v_recent int;
  v_code text := upper(btrim(coalesce(p_code, '')));
  ci public.check_ins;
  existing public.check_ins;
  v_conflict uuid;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.org_id <> m.org_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if public.is_presenter_of(p_session) then
    return jsonb_build_object('status', 'presenter_cannot_check_in');
  end if;

  select * into existing from public.check_ins where session_id = p_session and member_id = m.id and removed_at is null;
  if found then
    return jsonb_build_object('status', 'already_checked_in', 'check_in', to_jsonb(existing));
  end if;

  select count(*) into v_recent from public.check_in_attempts
   where session_id = p_session and member_id = m.id
     and attempted_at > now() - interval '10 minutes';

  insert into public.check_in_attempts (org_id, session_id, member_id, submitted_code, succeeded)
  values (s.org_id, p_session, m.id, v_code, false);

  if v_recent >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  if s.state not in ('published', 'in_progress', 'completed') or s.starts_at is null or s.ends_at is null then
    return jsonb_build_object('status', 'not_started');
  elsif now() < s.starts_at then
    return jsonb_build_object('status', 'not_started');
  elsif now() >= s.ends_at + interval '2 hours' then
    return jsonb_build_object('status', 'session_ended');
  end if;

  if not s.check_in_open then
    return jsonb_build_object('status', 'check_in_closed');
  end if;

  if not s.allow_walk_ins and not exists (
    select 1 from public.rsvps r where r.session_id = p_session and r.member_id = m.id and r.status = 'confirmed'
  ) then
    return jsonb_build_object('status', 'reservation_required');
  end if;
  select * into c from public.check_in_codes
   where session_id = p_session and code = v_code
     and revoked_at is null and now() between valid_from and valid_until;
  if c is null then
    return jsonb_build_object('status', 'invalid_code');
  end if;

  begin
    insert into public.check_ins (org_id, session_id, member_id, method, code_id, session_window)
    values (s.org_id, p_session, m.id, 'code', c.id, tstzrange(s.starts_at, s.ends_at, '[)'))
    returning * into ci;
  exception when exclusion_violation then
    select session_id into v_conflict from public.check_ins
     where member_id = m.id and session_window && tstzrange(s.starts_at, s.ends_at, '[)') and removed_at is null
     limit 1;
    return jsonb_build_object('status', 'overlap', 'conflict_session_id', v_conflict);
  end;

  update public.check_in_attempts set succeeded = true
   where id = (
     select id from public.check_in_attempts
      where session_id = p_session and member_id = m.id
      order by attempted_at desc
      limit 1
   );

  perform public.enqueue_job(
    'award_points',
    jsonb_build_object('rule', 'check_in', 'member_id', m.id, 'source', 'check_in',
                        'source_id', ci.id, 'session_id', s.id),
    'pts:check_in:' || ci.id
  );
  return jsonb_build_object('status', 'ok', 'check_in', to_jsonb(ci));
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- mark_checked_in_manually() — re-created a second time (checkin/03 was
-- the first, for the per-role window). Same removed_at fix as check_in().
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.mark_checked_in_manually(p_session uuid, p_member uuid, p_reason text) returns public.check_ins
language plpgsql security definer set search_path = '' as $$
declare
  m public.members := public.assert_active_member();
  s public.sessions;
  ci public.check_ins;
  existing public.check_ins;
  v_conflict uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;
  if m.org_role not in ('admin', 'moderator') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into s from public.sessions where id = p_session for update;
  if not found or s.org_id <> m.org_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if m.org_role = 'admin' then
    if s.state = 'cancelled' or s.starts_at is null or now() < s.starts_at then
      raise exception 'not_open' using errcode = '23514';
    end if;
  else
    if s.state not in ('published', 'in_progress', 'completed')
       or s.starts_at is null or s.ends_at is null
       or now() < s.starts_at
       or now() >= s.ends_at + interval '2 hours' then
      raise exception 'not_open' using errcode = '23514';
    end if;
  end if;

  if not exists (select 1 from public.members where id = p_member and org_id = s.org_id) then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.session_presenters
     where session_id = p_session and member_id = p_member and accepted
  ) then
    raise exception 'presenter_cannot_check_in' using errcode = '23514';
  end if;

  select * into existing from public.check_ins where session_id = p_session and member_id = p_member and removed_at is null;
  if found then
    return existing;
  end if;

  begin
    insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
    values (s.org_id, p_session, p_member, 'manual', btrim(p_reason), m.id, tstzrange(s.starts_at, s.ends_at, '[)'))
    returning * into ci;
  exception when exclusion_violation then
    select session_id into v_conflict from public.check_ins
     where member_id = p_member and session_window && tstzrange(s.starts_at, s.ends_at, '[)') and removed_at is null
     limit 1;
    raise exception 'overlapping_session:%', v_conflict using errcode = '23P01';
  end;

  perform public.write_audit(s.org_id, 'check_in.manual', 'check_in', ci.id, null,
           jsonb_build_object('member_id', p_member, 'reason', p_reason), p_reason, null, m.id);

  perform public.enqueue_job(
    'award_points',
    jsonb_build_object('rule', 'check_in', 'member_id', p_member, 'source', 'check_in',
                        'source_id', ci.id, 'session_id', s.id),
    'pts:check_in:' || ci.id
  );

  return ci;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- remove_check_in — REQ-CHK-017. Admin-only (assert_fresh_admin(), the same
-- freshness re-check 0032's adjust_points_manually() uses for a
-- financially-consequential write), mandatory reason. Everything below is
-- inline and synchronous, in ONE transaction with the soft-delete itself —
-- matching adjust_points_manually()'s and _reverse_comment_points()'s own
-- precedent (direct ledger writes, not enqueue_job) rather than the
-- member-initiated async pattern (11 §2.3), which exists to keep a MEMBER's
-- own action from waiting on scoring — irrelevant for an admin's one-off
-- correction, where one all-or-nothing transaction is the stronger
-- guarantee.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.remove_check_in(p_session uuid, p_member uuid, p_reason text) returns public.check_ins
language plpgsql security definer set search_path = '' as $$
declare
  admin   public.members := public.assert_fresh_admin();
  before  public.check_ins;
  target  public.check_ins;
  ledger  public.points_ledger;
  cert    public.certificates;
  rsvp_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;

  select * into before from public.check_ins
   where session_id = p_session and member_id = p_member and org_id = admin.org_id and removed_at is null
   for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';    -- never checked in, or already removed
  end if;

  update public.check_ins
     set removed_at = now(), removed_by = admin.id, removal_reason = btrim(p_reason)
   where id = before.id
   returning * into target;

  -- Points reversal — the exact pattern 0032's _reverse_comment_points()
  -- uses. Both the attendee's own `check_in` award and the presenter's
  -- per-check-in `attendee_bonus` key their source_id to this row (see this
  -- file's header) — both are reversed, once each, never a second time.
  for ledger in
    select * from public.points_ledger l
     where l.source in ('check_in', 'attendee_bonus') and l.source_id = target.id
       and not exists (select 1 from public.points_ledger rv where rv.source = 'reversal' and rv.source_id = l.id)
  loop
    insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                      reason, rule_key, idempotency_key)
    values (ledger.org_id, ledger.member_id, -ledger.amount, 'reversal', ledger.id,
            ledger.session_id, 'أُلغي تسجيل الحضور', ledger.rule_key, 'reversal:' || ledger.id || ':v1')
    on conflict (idempotency_key) do nothing;
  end loop;

  -- Certificate revocation — the existing audited path, not duplicated.
  -- Only the FIXED phrase reaches revoke_certificate(): the admin's own
  -- free-text reason stays on check_ins.removal_reason and the audit log —
  -- "the admin's words about a colleague are not the member's to read."
  for cert in
    select * from public.certificates where check_in_id = target.id and state <> 'revoked'
  loop
    perform public.revoke_certificate(cert.id, 'أُلغي تسجيل الحضور');
  end loop;

  -- No-show symmetry — the exact key evaluate_no_shows.ts would compute
  -- (award_points('no_show', member, 'no_show', rsvp.id, session)), so a
  -- later replay of that job can never double-award.
  select id into rsvp_id from public.rsvps
   where session_id = p_session and member_id = p_member and status = 'confirmed';
  if rsvp_id is not null then
    perform public.award_points('no_show', p_member, 'no_show', rsvp_id, p_session);
  end if;

  perform public.write_audit(admin.org_id, 'check_in.removed', 'check_in', target.id,
                             to_jsonb(before), to_jsonb(target), btrim(p_reason), admin.org_role::text, admin.id);
  return target;
end $$;
revoke execute on function public.remove_check_in(uuid, uuid, text) from public, anon;
grant  execute on function public.remove_check_in(uuid, uuid, text) to authenticated;
