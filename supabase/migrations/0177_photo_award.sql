-- 0177 · wave 20, PR C (DEC-220 §2, DEC-222, REQ-UIX-083) — proposed by `scoring`, promoted by the lead. The award and its reversal; the trigger that calls them is 0178.
-- scoring · wave 20, PR C (DEC-220 §2, DEC-221, DEC-222, REQ-UIX-083, STORY-UIX-073, REQ-PTS-002, REQ-PTS-006,
-- REQ-PTS-012, REQ-PTS-013) — the photo award, with its reversal designed first.
--
-- The rule is the seed: `('photo', 'attendee', 3, true, 5, null, 'صورة من الجلسة')` (0027:530) — 3 points, cap 5 per
-- session, read at award time. Until now NOTHING paid it, and SCR-022's catalogue said it did. Since 0174 a `photos`
-- row is written only by `record_photo_upload()`, already stripped (REQ-EVT-011), so an insert IS a photo becoming
-- visible. ONE writer per function and per transition (DEC-220 §2.5): `content`'s trigger on `photos` decides WHEN
-- — after insert, on a hide, on a restore — and calls the two functions below, which decide WHAT is paid; a removal
-- stays `_reverse_photo_points()`'s (0059), replaced here.
--
--   1. ★ `reverse_photo_points(p_photo, p_reason)` — FIRST: under an advisory lock on the photo, one compensating row
--      per standing photo award (no `reversal` names it yet), in 0149's shape: `-amount`, `source = 'reversal'`,
--      `source_id` the award, the award's session, `rule_key = 'photo'` (so the reversal FREES its place under the
--      cap, `award_points()`'s sum), key `'reversal:' || l.id || ':v1'`, `on conflict do nothing`. A no-op when
--      nothing is standing. It fixes 0059's `limit 1`, which after a restore would compensate the FIRST award again
--      (a no-op by its key) and leave the second standing.
--   2. `award_photo_points(p_photo, p_restore)` — a VISIBLE photo enqueues the EXISTING `award_points` job with the
--      existing payload, keyed by the photo's epoch. ★ With `p_restore`, it pays only when an earlier award of the
--      photo was reversed (DEC-222): a photo uploaded before this migration, never paid, is not paid by a restore.
--   3. `award_points()` (0148) — ONE added branch: a photo is re-checked visible when the job runs, and its key carries
--      the epoch (`presenter_award_epoch()`, 0148:61, generic). Every other branch byte-for-byte 0148.
--   4. `_reverse_photo_points()` (0059) — calls (1) with «حُذف المحتوى» and keeps the `photo_removed` penalty.
--   5. `capped_award_explanations()` (0172) — learns photos: SCR-022's dashed row for the sixth photo on a session.
--
-- `main` in the gap: `content`'s trigger enqueues the existing job; `main`'s worker calls the same, new
-- `award_points()`. So photos pay in production from the day this is pushed; nothing on `main` draws a photo row
-- badly (scoring's PR C plan, §4b). No backfill: photos uploaded before this were never paid, and a restore of one pays
-- nothing (the owner, DEC-220 §2).
--
-- 03 §8.2 rows:
--   | `RPC-reverse_photo_points.compensating` | One `reversal` row per standing photo award, `-amount`, 0149's key and its own reason; none written twice. |
--   | `RPC-reverse_photo_points.frees_cap` | A reversed award frees its place: the next visible photo on that session is paid. |
--   | `RPC-award_photo_points.visible_only` | A hidden or removed photo enqueues nothing; a late job after a hide writes nothing. |
--   | `RPC-award_photo_points.epoch` | award → hide → restore → award nets ONE award; a second hide reverses the second. |
--   | `RPC-award_photo_points.restore_only_reversed` | A photo with no earlier award, hidden and restored, is paid nothing. |
--   | `RPC-award_photo_points.cap` | The sixth visible photo on one session writes nothing, and `capped_award_explanations()` names that session. |
--   | `RPC-award_photo_points.grants` | Neither function is callable by anon or authenticated. |
--   | `RPC-award_points.photo_epoch` | `award_points()`'s photo branch keys by epoch; every other source's key is unchanged. |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · ★ the reversal, first
-- ═══════════════════════════════════════════════════════════════════════════
create function public.reverse_photo_points(p_photo uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.points_ledger;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('photo-award:' || p_photo::text, 0));
  for l in
    select a.* from public.points_ledger a
     where a.source = 'photo' and a.source_id = p_photo
       and not exists (select 1 from public.points_ledger rv where rv.source = 'reversal' and rv.source_id = a.id)
     order by a.occurred_at, a.id
  loop
    insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                      reason, rule_key, idempotency_key)
    values (l.org_id, l.member_id, -l.amount, 'reversal', l.id, l.session_id,
            p_reason, 'photo', 'reversal:' || l.id || ':v1')
    on conflict (idempotency_key) do nothing;
  end loop;
end $$;
revoke execute on function public.reverse_photo_points(uuid, text) from public, anon, authenticated;
grant  execute on function public.reverse_photo_points(uuid, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · the award — enqueues the existing job, keyed by the photo's epoch
-- ═══════════════════════════════════════════════════════════════════════════
create function public.award_photo_points(p_photo uuid, p_restore boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ph      public.photos;
  v_epoch int;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('photo-award:' || p_photo::text, 0));
  select * into ph from public.photos where id = p_photo;
  if not found or ph.hidden_at is not null or ph.removed_at is not null then
    return;
  end if;
  if not exists (select 1 from public.members m where m.id = ph.uploader_id and m.org_id = ph.org_id) then
    return;
  end if;
  -- ★ A restore re-pays only what was reversed (DEC-222): a photo never paid stays unpaid.
  if p_restore and not exists (
       select 1 from public.points_ledger a
        where a.source = 'photo' and a.source_id = p_photo
          and exists (select 1 from public.points_ledger rv where rv.source = 'reversal' and rv.source_id = a.id)) then
    return;
  end if;
  v_epoch := public.presenter_award_epoch(ph.uploader_id, 'photo', 'photo', p_photo);
  perform public.enqueue_job(
    'award_points',
    jsonb_build_object('rule', 'photo', 'member_id', ph.uploader_id, 'source', 'photo',
                       'source_id', ph.id, 'session_id', ph.session_id),
    'pts:photo:' || ph.id || ':v' || v_epoch
  );
end $$;
revoke execute on function public.award_photo_points(uuid, boolean) from public, anon, authenticated;
grant  execute on function public.award_photo_points(uuid, boolean) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · award_points — 0148's, with ONE added branch for a photo
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.award_points(
  p_rule       text,
  p_member     uuid,
  p_source     public.ledger_source,
  p_source_id  uuid,
  p_session    uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r       public.scoring_rules;
  used    int;
  key     text;
  v_sess     uuid;
  v_epoch    int := 1;
  v_attendee uuid;
  v_proposal uuid;
begin
  select * into r from public.scoring_rules
   where org_id = (select org_id from public.members where id = p_member)
     and action_key = p_rule;
  if r is null or not r.enabled then
    return;                                            -- unknown/disabled rule: award nothing
  end if;

  if p_source = 'check_in' then
    -- DEC-141's late-job race (0088), unchanged.
    if exists (select 1 from public.check_ins where id = p_source_id and removed_at is not null) then
      return;
    end if;

    v_sess := coalesce(p_session, (select c.session_id from public.check_ins c where c.id = p_source_id));
    if v_sess is not null then
      -- ★ REQ-PTS-015: the moment, for EVERY session. 0121 held this for more
      -- than one day only; one day paid at check-in. A job enqueued early —
      -- by a hook, before this migration, or by `main`'s worker — returns here
      -- and the completion pass enqueues the same key again.
      if (select s.state from public.sessions s where s.id = v_sess) not in ('completed', 'archived') then
        return;
      end if;
      -- REQ-CHK-011: a presenter does not attend their own session. The ONE
      -- definition contract 1's session_award_state() also asks (0006), so the
      -- state a member reads and the award they get cannot disagree.
      if public.attendance_award_barred(v_sess, p_member) then
        return;
      end if;
      -- REQ-SES-017: attendance points require every day, by default.
      if not public.session_attendance_complete(v_sess, p_member) then
        return;
      end if;
      -- DEC-151: the standing award decides; the key is the second line.
      if exists (
        select 1 from public.points_ledger a
         where a.member_id = p_member and a.session_id = v_sess
           and a.source = 'check_in'
           and not exists (select 1 from public.points_ledger rv
                            where rv.source = 'reversal' and rv.source_id = a.id)
      ) then
        return;
      end if;
      v_epoch := public.attendance_award_epoch(v_sess, p_member);
    end if;
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- attendee_bonus_epoch_guard (0121), verbatim — the presenter's per-attendee
  -- bonus names the attendee's epoch check-in, and only a complete attendee's.
  -- ═══════════════════════════════════════════════════════════════════════
  if p_source = 'attendee_bonus' then
    select c.session_id, c.member_id into v_sess, v_attendee
      from public.check_ins c where c.id = p_source_id;
    if v_attendee is null then
      return;
    end if;
    if not public.session_attendance_complete(v_sess, v_attendee) then
      return;
    end if;
    if p_source_id is distinct from public.attendance_epoch_check_in(v_sess, v_attendee) then
      return;
    end if;
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ★ PRESENTER AWARDS FOLLOW THE PRESENTER (REQ-SES-019, DEC-174 ruling 1).
  -- Re-derived when the job runs, never trusted from the payload:
  --   * the session is completed or archived — REQ-PTS-015's moment;
  --   * the member is an accepted, not declined, presenter of it NOW.
  -- The second is load-bearing: the fan-out queues a `:rating_bonus` job for
  -- +48 h, and a presenter removed in between has had session_delivered
  -- reversed — without this, that job would compute the next epoch and pay
  -- them again. `proposal_accepted` also needs the member to have been on the
  -- proposal (the proposer, or an accepted co-presenter of it).
  -- ═══════════════════════════════════════════════════════════════════════
  if p_source in ('session_delivered', 'attendee_bonus', 'rating_bonus', 'proposal_accepted') then
    if p_source = 'proposal_accepted' then
      select s.id, s.proposal_id into v_sess, v_proposal from public.sessions s where s.proposal_id = p_source_id;
    elsif p_source <> 'attendee_bonus' then
      v_sess := coalesce(p_session, p_source_id);   -- session_delivered / rating_bonus name the session
    end if;
    if v_sess is null
       or (select s.state from public.sessions s where s.id = v_sess) not in ('completed', 'archived') then
      return;
    end if;
    -- «Is an accepted presenter» — the same definition that bars attendance.
    if not public.attendance_award_barred(v_sess, p_member) then
      return;
    end if;
    if p_source = 'proposal_accepted' and not public.proposal_presenter(v_proposal, p_member) then
      return;
    end if;
    -- `v1` until this family has been compensated; then `v2`, … — what lets a
    -- presenter removed and re-added after completion be paid again.
    v_epoch := public.presenter_award_epoch(p_member, p_rule, p_source, p_source_id);
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- ★ wave 20, PR C (DEC-220 §2, DEC-222, REQ-UIX-083) — a PHOTO, the one added branch. Re-derived when the job
  -- runs, never trusted from the payload: the photo is still visible (a late job after a hide or a removal pays
  -- nothing, as 0088's check-in race does), and the key carries the photo's epoch — 1 + the reversals of its earlier
  -- awards (`presenter_award_epoch()`, generic) — so award → hide → restore → award nets ONE.
  -- ═══════════════════════════════════════════════════════════════════════
  if p_source = 'photo' then
    if not exists (select 1 from public.photos ph
                    where ph.id = p_source_id and ph.uploader_id = p_member
                      and ph.hidden_at is null and ph.removed_at is null) then
      return;
    end if;
    v_epoch := public.presenter_award_epoch(p_member, p_rule, p_source, p_source_id);
  end if;

  -- Per-session cap (REQ-PTS-006), unchanged. A reversal carries the same
  -- rule_key and session_id, so a reversed award frees its place.
  if r.cap_per_session is not null and p_session is not null then
    select coalesce(sum(amount), 0) into used from public.points_ledger
     where member_id = p_member and session_id = p_session and rule_key = p_rule;
    if used >= r.cap_per_session * r.points then
      return;
    end if;
  end if;

  -- Cooldown (REQ-PTS-007), unchanged.
  if r.cooldown is not null and exists (
       select 1 from public.points_ledger
        where member_id = p_member and rule_key = p_rule
          and occurred_at > now() - r.cooldown) then
    return;
  end if;

  -- 05 §2.1's key: <rule_key>:<source>:<source_id>:<member_id>:v<epoch>.
  key := format('%s:%s:%s:%s:v%s', p_rule, p_source, p_source_id, p_member, v_epoch);

  insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                    reason, rule_key, rule_version, idempotency_key)
  values ((select org_id from public.members where id = p_member),
          p_member, r.points, p_source, p_source_id, p_session,
          r.reason_ar, p_rule, r.version, key)
  on conflict (idempotency_key) do nothing;            -- REQ-PTS-012: a replay writes zero rows
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · the removal path (0059), through the one reversal
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public._reverse_photo_points() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.removed_at is not null and old.removed_at is null then
    perform public.reverse_photo_points(new.id, 'حُذف المحتوى');
    perform public.award_points('photo_removed', new.uploader_id, 'content_removed', new.id, new.session_id);
  end if;
  return new;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 · the cap, explained — comments AND photos (0172, same signature)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.capped_award_explanations()
returns table (session_id uuid, rule_key text, cap_per_session int, first_unpaid_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with rule as (
    select r.action_key, r.points, r.cap_per_session
      from public.scoring_rules r
     where r.org_id = public.auth_org_id()
       and r.action_key in ('comment', 'photo')
       and r.enabled and r.points > 0 and r.cap_per_session is not null
  ), items as (
    select 'comment'::text as rule_key, c.id, c.session_id, c.created_at
      from public.comments c
     where c.author_id = public.auth_member_id() and c.deleted_at is null
    union all
    select 'photo', p.id, p.session_id, p.created_at
      from public.photos p
     where p.uploader_id = public.auth_member_id() and p.hidden_at is null and p.removed_at is null
  ), full_caps as (
    select l.session_id, l.rule_key
      from public.points_ledger l
      join rule r on r.action_key = l.rule_key
     where l.member_id = public.auth_member_id()
       and l.session_id is not null
     group by l.session_id, l.rule_key, r.points, r.cap_per_session
    having sum(l.amount) >= r.cap_per_session * r.points
  )
  select i.session_id, i.rule_key, r.cap_per_session, min(i.created_at)
    from items i
    join rule r on r.action_key = i.rule_key
    join full_caps f on f.session_id = i.session_id and f.rule_key = i.rule_key
   where not exists (
           select 1 from public.points_ledger l
            where l.member_id = public.auth_member_id()
              and l.source_id = i.id
              and l.rule_key = i.rule_key)
   group by i.session_id, i.rule_key, r.cap_per_session
$$;
