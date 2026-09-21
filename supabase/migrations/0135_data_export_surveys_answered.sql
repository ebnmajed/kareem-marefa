-- 0135_data_export_surveys_answered.sql — the PDPL self-export says which
-- surveys a member answered, and nothing about what they said
-- (REQ-PRF-006, REQ-SUR-009; DEC-160 §3, DEC-161 «event»). The lead's, as
-- `platform`'s custodian.
--
-- A stored survey response names no member — by design there is no query that
-- finds «this member's answers», for an admin, for the worker, or for the
-- member. What IS personal data about the member is that they took part:
-- `survey_participations (survey_id, member_id)`. The export lists it, by the
-- session's title, with NO instant (the register has none to give) and in an
-- order that is not the order of writing.
--
-- ADDITIVE. `create or replace` of `0088`'s function with one key appended;
-- every existing key and its value are unchanged, byte for byte (the body
-- below is `0088`'s text with one entry added — diffed, comments aside, before
-- this file was committed). `main`'s worker stores the payload opaquely
-- (`record_data_export($1, $2::jsonb)`), so a key it has never heard of is a
-- key it carries. Same signature, same grants — `create or replace` keeps them.
--
-- The privacy screen's sentence listing what the archive holds
-- (`privacy.*.exportIntro`) gains the surveys, by `content` on the lead's
-- request — it is that track's file this wave.

create or replace function public.build_data_export_payload(p_member uuid) returns jsonb
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
               'session', s.title, 'arrived_at', ci.arrived_at, 'method', ci.method,
               'removed_at', ci.removed_at, 'removal_reason', ci.removal_reason
             ) order by ci.arrived_at), '[]'::jsonb)
        from public.check_ins ci join public.sessions s on s.id = ci.session_id
       where ci.member_id = m.id
    ),
    'comments', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'body', c.body, 'created_at', c.created_at,
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
    ),
    -- ★ 0135. The member took part; WHAT they answered is not theirs to get
    -- back, because it is not anyone's to find (DEC-160 §3). No instant, and
    -- ordered by title — never by insertion, which would be one.
    'surveys_answered', (
      select coalesce(jsonb_agg(jsonb_build_object('session', s.title) order by s.title, s.id), '[]'::jsonb)
        from public.survey_participations sp
        join public.surveys sv on sv.id = sp.survey_id
        join public.sessions s on s.id = sv.session_id
       where sp.member_id = m.id
    )
  );
end $fn$;
