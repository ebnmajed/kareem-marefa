-- 0215 — An admin deletes an event: it leaves every screen, and what it awarded is taken back. REQ-SES-023, DEC-271.
--
-- The owner's rulings (2026-10-06): an admin may delete ANY event, one or many; a deleted event disappears for
-- everyone; its points are reversed and its certificates revoked; nothing is physically erased, so the ledgers and the
-- audit log keep their evidence (invariant 9). Announcements already delete outright (0164, REQ-ADM-025).
--
-- Why not DELETE: points_ledger and company_points_ledger reference sessions with NO ACTION and are append-only, so a
-- session that awarded anything cannot be deleted — and every other child cascades, which would silently erase
-- check-ins, ratings and issued certificates whose verify links members hold. So:
--   1. sessions gains deleted_at / deleted_by / deletion_reason, and sessions_read hides a deleted row from everyone.
--      Everything read THROUGH the session — the page, browse, the feed, search, stories, the console — goes with it.
--   2. The two surfaces that read a session's content WITHOUT the session — photos (a member's profile) and story frames
--      (story_frame_is_visible()) — also ask session_deleted(). Content is NOT flipped to «removed» row by row: that
--      fires a removal notice to every author and an audit row per item (comments_removal_notify, the *_audit
--      triggers), and the content was not at fault.
--   3. delete_session(): admin only (assert_fresh_admin), audited. An event that has not happened yet is CANCELLED
--      first, through transition_session(), so its RSVPs are told and its reminders and calendar entries go. Then
--      every points row it earned is reversed (reversal:<id>:v1 — the key every reversal uses, so nothing is reversed
--      twice), the company ledger likewise (a new `reversal` source), every certificate it issued is revoked through
--      revoke_certificate(), and every open report on its content is dismissed.
--   4. delete_sessions(): the same, for many, answering per event.
-- session_public_card() refuses a deleted event.

-- ── 1 ────────────────────────────────────────────────────────────────────────────────────────────────────────

alter type public.company_ledger_source add value if not exists 'reversal';

alter table public.sessions add column if not exists deleted_at timestamptz;
alter table public.sessions add column if not exists deleted_by uuid references public.members(id) on delete set null;
alter table public.sessions add column if not exists deletion_reason text;

drop policy if exists "sessions_read" on public.sessions;
create policy "sessions_read" on public.sessions for select to authenticated
  using (
    org_id = public.auth_org_id()
    and deleted_at is null
    and (state = any (array['published', 'in_progress', 'completed', 'archived', 'cancelled']::public.session_state[])
         or public.is_staff() or public.is_presenter_of(id))
  );

-- ── 2 ────────────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.session_deleted(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.deleted_at is not null from public.sessions s where s.id = p_session), false)
$$;
revoke execute on function public.session_deleted(uuid) from public, anon;
grant execute on function public.session_deleted(uuid) to authenticated, service_role;

drop policy if exists "photos_read" on public.photos;
create policy "photos_read" on public.photos for select to authenticated
  using (
    org_id = public.auth_org_id()
    and (hidden_at is null or public.is_staff())
    and not public.session_deleted(session_id)
  );

CREATE OR REPLACE FUNCTION public.story_frame_is_visible(f story_frames, p_now timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select f.state = 'visible'
     and f.hidden_at is null
     and f.removed_at is null
     and f.triggered_at <= p_now
     and f.triggered_at + interval '24 hours' > p_now                       -- REQ-STO-002
     and exists (select 1 from public.sessions s
                  where s.id = f.session_id and s.state <> 'cancelled'
                   and s.deleted_at is null)                                -- ★ 0215 (REQ-SES-023)    -- REQ-STO-018
     and (f.photo_id is null
          or exists (select 1 from public.photos p
                      where p.id = f.photo_id and p.hidden_at is null and p.removed_at is null))
$function$;

CREATE OR REPLACE FUNCTION public.session_public_card(p_session uuid)
 RETURNS TABLE(title text, starts_at timestamp with time zone, ends_at timestamp with time zone, time_zone text, venue_name text, org_name text, day_count integer, days jsonb, og_path text, og_width integer, og_height integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.title,
         s.starts_at,
         s.ends_at,
         coalesce(s.time_zone, os.time_zone, 'Asia/Riyadh'),
         -- The NAME alone. A one-off venue's name is as public as a listed
         -- one's; the address and the map link are not, in either case — a
         -- link-holding stranger is told which hall, never how to find the
         -- side door (12 T3, the part the owner's decision did not open).
         coalesce(v.name, s.custom_venue_name),
         o.name,
         -- ★ THE COUNT, AND NOTHING MORE (wave 9, F3). `/s/[id]` is read by
         -- `anon`, and `session_days` grants `select` to `authenticated`
         -- alone — so a public card cannot read days and does not need to:
         -- the SPAN is already `s.starts_at`–`s.ends_at`, which contract 1
         -- makes the first day's start and the last day's end. All that is
         -- missing is whether to say a range at all, and that is one integer.
         (select count(*) from public.session_days d where d.session_id = s.id)::int,
         -- ★ THE WINDOWS, AND NOTHING THAT IDENTIFIES A DAY. No id, no
         -- position, no venue: the card passes these straight to
         -- `sessionPhase({ …, days })`, which needs two instants per day and
         -- reads nothing else. So a link-holding stranger learns the meeting
         -- times of a session whose overall span this row already gives them,
         -- and learns no key they could join to anything.
         --
         -- ★ AND NO SQL DECIDES THE PHASE. The obvious smaller disclosure — a
         -- boolean «is a day running now» — would put `betweenDays()` in this
         -- function as well as in `session-status.ts`, and two implementations
         -- of one rule is how the public card came to say «جارية الآن» through
         -- the night between two days while every other surface said
         -- «التسجيل مفتوح». One implementation, fed.
         (select coalesce(jsonb_agg(jsonb_build_object('starts_at', d.starts_at, 'ends_at', d.ends_at) order by d.starts_at), '[]'::jsonb)
            from public.session_days d where d.session_id = s.id),
         og.storage_path,
         og.width_px,
         og.height_px
    from public.sessions s
    join public.orgs o          on o.id = s.org_id and o.status = 'active'
    left join public.org_settings os on os.org_id = s.org_id
    left join public.venues v   on v.id = s.venue_id
    -- The newest READY `og` render of the session's poster, if the poster has
    -- one at all. `png` and not `webp`: several preview crawlers still refuse
    -- WebP, and a card with no image beats a card with a broken one.
    left join lateral (
      select ea.storage_path, ea.width_px, ea.height_px
        from public.session_posters sp
        join public.export_artifacts ea on ea.document_id = sp.document_id
       where sp.session_id = s.id
         and ea.preset = 'og'
         and ea.format = 'png'
         and ea.status = 'ready'
         and ea.storage_path is not null
       order by ea.rendered_at desc nulls last
       limit 1
    ) og on true
   where s.id = p_session
     and s.state in ('published', 'in_progress', 'completed')
     and s.deleted_at is null   -- ★ 0215 (REQ-SES-023): a deleted event has no public card
$function$;

-- ── 3 ────────────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.delete_session(p_session uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor     public.members := public.assert_fresh_admin();
  s         public.sessions;
  v_reason  text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'حُذفت الفعالية');
  l         record;
  c         record;
  v_points  int := 0;
  v_company int := 0;
  v_certs   int := 0;
  v_cancelled boolean := false;
begin
  select * into s from public.sessions where id = p_session and org_id = actor.org_id for update;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if s.deleted_at is not null then
    return jsonb_build_object('status', 'already');
  end if;

  -- Not yet happened, or happening: cancel through the one transition, so RSVPs are told and reminders go.
  if s.state in ('approved', 'published', 'in_progress') then
    perform public.transition_session(p_session, 'cancel', v_reason);
    v_cancelled := true;
  end if;

  -- Every points row it earned, reversed once.
  for l in
    select a.* from public.points_ledger a
     where a.session_id = p_session and a.source <> 'reversal'
       and not exists (select 1 from public.points_ledger rv where rv.source = 'reversal' and rv.source_id = a.id)
     order by a.occurred_at, a.id
  loop
    insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id, reason, rule_key, idempotency_key)
    values (l.org_id, l.member_id, -l.amount, 'reversal', l.id, l.session_id, v_reason, l.rule_key, 'reversal:' || l.id || ':v1')
    on conflict (idempotency_key) do nothing;
    v_points := v_points + 1;
  end loop;

  for l in
    select a.* from public.company_points_ledger a
     where a.session_id = p_session and a.source <> 'reversal'
       and not exists (select 1 from public.company_points_ledger rv where rv.source = 'reversal' and rv.source_id = a.id)
     order by a.occurred_at, a.id
  loop
    insert into public.company_points_ledger (org_id, company_id, amount, source, source_id, session_id, reason, rule_key,
                                              rule_version, actor_id, idempotency_key)
    values (l.org_id, l.company_id, -l.amount, 'reversal', l.id, l.session_id, v_reason, l.rule_key,
            l.rule_version, actor.id, 'reversal:' || l.id || ':v1')
    on conflict (idempotency_key) do nothing;
    v_company := v_company + 1;
  end loop;

  -- Every certificate it issued or held, revoked through the one audited path; the verify page then says «ملغاة».
  for c in select id from public.certificates where session_id = p_session and state <> 'revoked' loop
    perform public.revoke_certificate(c.id, v_reason, 'for_cause');
    v_certs := v_certs + 1;
  end loop;

  -- Nothing about it is left in a moderator's queue.
  -- A closed report names when and who (reports_check2 ties resolved_at to the status). «dismissed»: the content was
  -- not judged — the event it belonged to was deleted, and the audit row says so.
  update public.reports r
     set status = 'dismissed', resolved_at = now(), resolved_by = actor.id, resolution = 'dismissed'
   where r.status = 'open' and r.org_id = actor.org_id
     and (r.comment_id in (select id from public.comments where session_id = p_session)
          or r.photo_id in (select id from public.photos where session_id = p_session)
          or r.story_frame_id in (select id from public.story_frames where session_id = p_session));

  update public.sessions
     set deleted_at = now(), deleted_by = actor.id, deletion_reason = v_reason
   where id = p_session;

  perform public.write_audit(actor.org_id, 'session.deleted', 'session', p_session,
    jsonb_build_object('title', s.title, 'state', s.state),
    jsonb_build_object('reason', v_reason, 'cancelled', v_cancelled, 'points_reversed', v_points,
                       'company_points_reversed', v_company, 'certificates_revoked', v_certs),
    v_reason, actor.org_role::text, actor.id);

  return jsonb_build_object('status', 'deleted', 'cancelled', v_cancelled, 'points_reversed', v_points,
                            'company_points_reversed', v_company, 'certificates_revoked', v_certs);
end $$;
revoke execute on function public.delete_session(uuid, text) from public, anon;
grant execute on function public.delete_session(uuid, text) to authenticated;

-- ── 4 ────────────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.delete_sessions(p_sessions uuid[], p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id  uuid;
  v_out jsonb := '[]'::jsonb;
begin
  perform public.assert_fresh_admin();
  if coalesce(array_length(p_sessions, 1), 0) > 200 then
    raise exception 'too_many' using errcode = '22023';
  end if;
  foreach v_id in array coalesce(p_sessions, '{}') loop
    begin
      -- The two objects merge into ONE element; `array || a || b` would append two.
      v_out := v_out || (jsonb_build_object('session_id', v_id) || public.delete_session(v_id, p_reason));
    exception when others then
      v_out := v_out || jsonb_build_object('session_id', v_id, 'status', 'failed', 'error', sqlerrm);
    end;
  end loop;
  return v_out;
end $$;
revoke execute on function public.delete_sessions(uuid[], text) from public, anon;
grant execute on function public.delete_sessions(uuid[], text) to authenticated;

-- ── 5 · what a delete would take back, said in the confirm before anything moves ────────────────────────────

create or replace function public.session_deletion_impact(p_sessions uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.members := public.assert_fresh_admin();
begin
  return jsonb_build_object(
    'sessions', (select count(*) from public.sessions s
                  where s.id = any(p_sessions) and s.org_id = actor.org_id and s.deleted_at is null),
    'to_cancel', (select count(*) from public.sessions s
                   where s.id = any(p_sessions) and s.org_id = actor.org_id and s.deleted_at is null
                     and s.state in ('approved', 'published', 'in_progress')),
    'members_with_points', (select count(distinct a.member_id) from public.points_ledger a
                             join public.sessions s on s.id = a.session_id
                            where a.session_id = any(p_sessions) and s.org_id = actor.org_id and a.source <> 'reversal'
                              and not exists (select 1 from public.points_ledger rv where rv.source = 'reversal' and rv.source_id = a.id)),
    'certificates', (select count(*) from public.certificates c
                      where c.session_id = any(p_sessions) and c.org_id = actor.org_id and c.state <> 'revoked')
  );
end $$;
revoke execute on function public.session_deletion_impact(uuid[]) from public, anon;
grant execute on function public.session_deletion_impact(uuid[]) to authenticated;
