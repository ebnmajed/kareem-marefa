-- 0082 · numerals are Western everywhere — the column and the enum go (DEC-124, DEC-132).
--
-- The owner's rule: «Never use the indian numerals anywhere». There is no setting, so
-- `org_settings.numerals` and `public.numeral_system` are dropped. The application stopped
-- reading the column in c20b901, which is correct on either side of this migration: nothing
-- rendered depends on it, and no row was ever `arabic_indic` (`not null default 'western'`).
--
-- ★ FORWARD-ONLY, AGAINST A LIVE DATABASE WITH REAL MEMBERS (invariant 3). Rehearsed before
-- promotion exactly as Launch step 2 was: the owner's `supabase db dump --linked` (schema only)
-- applied to a fresh Postgres, every migration 0003 … 0082 on top, `npm run test:rls` green,
-- the dump deleted. The rehearsal record is in STATUS.md.
--
-- Four SQL readers carried the column, and each is re-stated here WITHOUT it before the drop,
-- so the drop depends on nothing:
--   · notification_send_context (0030) returns jsonb → replaced in place; its `org` object
--     loses the `numerals` key, which the worker stopped reading in c20b901.
--   · poster_render_context (0063), certificate_render_context (0065) and
--     session_public_card (0080) RETURN TABLE with the enum in the row type. A return type cannot
--     change under `create or replace`, so each is dropped and re-created, and its grants are
--     restated verbatim — a re-created function starts with PUBLIC execute, which is exactly the
--     0002 trap, and `session_public_card` is the one public read of `sessions` in the product.
-- The column-level grant on `org_settings.numerals` (0004) goes with the column. The
-- `org_settings_history` trigger iterates `to_jsonb(new)`, so it needs no change.
--
-- Serves:  REQ-INT-006, REQ-SES-006, REQ-DSG-006, REQ-CRT-014, REQ-NTF-002
-- 03 §8.2: `POL-sessions.public_card.anon`'s field list loses «numerals»; no policy changes.

-- ── 1 · notification_send_context — replaced in place ─────────────────────
create or replace function public.notification_send_context(
  p_org      uuid,
  p_member   uuid,
  p_key      text,
  p_locale   text default 'ar'
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  m   record;
  o   record;
  mem public.members;
  tpl public.notification_templates;
begin
  select * into m from public.notification_matrix() x where x.key = p_key;
  if not found then
    raise exception 'unknown_message_key: %', p_key using errcode = '22023';
  end if;

  select * into mem from public.members where id = p_member and org_id = p_org;
  if not found then
    raise exception 'not_found: member % is not in org %', p_member, p_org using errcode = 'P0002';
  end if;

  select o2.name as org_name, s.email_from_name, s.email_reply_to, s.time_zone
    into o
    from public.orgs o2 left join public.org_settings s on s.org_id = o2.id
   where o2.id = p_org;

  -- 08 §3: the org's own template wins where it exists, at the requested
  -- locale and then at Arabic, which is never missing (invariant 10).
  select * into tpl from public.notification_templates t
   where t.org_id = p_org and t.key = p_key and t.channel = 'email'
     and t.locale in (p_locale, 'ar')
   order by (t.locale = p_locale) desc
   limit 1;

  return jsonb_build_object(
    'key',      p_key,
    'category', m.category,
    'optional', m.optional,
    'member', jsonb_build_object(
      'id',           mem.id,
      'email',        mem.email::text,
      'display_name', mem.display_name,
      'status',       mem.status::text),
    'org', jsonb_build_object(
      'name',      o.org_name,
      -- 08 §3.4 / OQ-016: one platform-verified sending domain, the org's name
      -- in the From display name, the org's admin contact as Reply-To.
      'from_name', coalesce(o.email_from_name, o.org_name),
      'reply_to',  o.email_reply_to,
      'time_zone', coalesce(o.time_zone, 'Asia/Riyadh')),
    'template', case when tpl.id is null then null else jsonb_build_object(
      'subject',         tpl.subject,
      'body',            tpl.body,
      'locale',          tpl.locale,
      'required_fields', to_jsonb(tpl.required_fields)) end,
    -- The 08 §1.7 set bypasses the check on both channels; everything else is
    -- read fresh. `_notify_wants` holds the "absence means on" rule (0026).
    'email_allowed',  m.email  and (not m.optional or public._notify_wants(p_member, m.category, 'email')),
    'in_app_allowed', m.in_app and (not m.optional or public._notify_wants(p_member, m.category, 'in_app'))
  );
end $$;
revoke execute on function public.notification_send_context(uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.notification_send_context(uuid, uuid, text, text) to service_role;

-- ── 2 · poster_render_context — dropped and re-created ────────────────────
drop function public.poster_render_context(uuid);
create function public.poster_render_context(p_session uuid)
returns table (
  session_id uuid, org_id uuid, title text, abstract text, starts_at timestamptz,
  session_time_zone text, venue_name text, venue_address text, presenters text[],
  org_name text, org_time_zone text,
  poster_id uuid, document_id uuid, mode public.poster_mode, binding public.poster_binding,
  template_version_id uuid, template_document jsonb
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.org_id, s.title, s.abstract, s.starts_at,
         s.time_zone,
         coalesce(v.name, s.custom_venue_name),
         coalesce(v.address, s.custom_venue_address),
         -- A5: every ACCEPTED co-presenter, in the order they were named.
         coalesce((select array_agg(m.display_name order by sp.created_at)
                     from public.session_presenters sp
                     join public.members m on m.id = sp.member_id
                    where sp.session_id = s.id and sp.accepted), '{}'),
         o.name, coalesce(os.time_zone, 'Asia/Riyadh'),
         p.id, p.document_id, p.mode, p.binding,
         tv.id, tv.document
    from public.sessions s
    join public.orgs o on o.id = s.org_id
    left join public.org_settings os on os.org_id = s.org_id
    left join public.venues v on v.id = s.venue_id
    left join public.session_posters p on p.session_id = s.id
    -- The template the automatic path binds to: the org's default for the
    -- `talk` family, else the platform's. 02 has no session-TYPE column, so
    -- a per-family default cannot be chosen automatically; the admin picks
    -- one on SCR-043 and that choice is what `session_posters.document_id`
    -- then records (REQ-DSG-002's «تلقائي» is a default, not a ceiling).
    left join lateral (
      select v2.id, v2.document
        from public.design_templates t
        join public.design_template_versions v2 on v2.template_id = t.id
       where t.purpose = 'poster' and t.family = 'talk' and t.retired_at is null
         and (t.org_id = s.org_id or t.org_id is null)
       order by (t.org_id is not null) desc, t.is_default desc, v2.version desc
       limit 1
    ) tv on true
   where s.id = p_session
$$;
revoke execute on function public.poster_render_context(uuid) from public, anon, authenticated;
grant  execute on function public.poster_render_context(uuid) to service_role;

-- ── 3 · certificate_render_context — dropped and re-created ───────────────
drop function public.certificate_render_context(uuid);
create function public.certificate_render_context(p_certificate uuid)
returns table (
  certificate_id uuid, org_id uuid, member_id uuid, state public.certificate_state,
  serial text, verification_code text, issued_at timestamptz, recipient_name text,
  kind public.certificate_kind, session_title text, achievement_name text,
  org_name text, org_time_zone text,
  template_version_id uuid, template_document jsonb, document_id uuid
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.org_id, c.member_id, c.state, c.serial, c.verification_code, c.issued_at,
         c.recipient_name_snapshot, c.kind, s.title, b.name, o.name,
         coalesce(os.time_zone, 'Asia/Riyadh'),
         c.template_version_id, v.document,
         (select d.id from public.design_documents d where d.bound_certificate_id = c.id limit 1)
    from public.certificates c
    join public.orgs o on o.id = c.org_id
    left join public.org_settings os on os.org_id = c.org_id
    left join public.sessions s on s.id = c.session_id
    left join public.badges b on b.id = c.badge_id
    join public.design_template_versions v on v.id = c.template_version_id
   where c.id = p_certificate
$$;
revoke execute on function public.certificate_render_context(uuid) from public, anon, authenticated;
grant  execute on function public.certificate_render_context(uuid) to service_role;

-- ── 4 · session_public_card — dropped and re-created ──────────────────────
drop function public.session_public_card(uuid);
create function public.session_public_card(p_session uuid)
returns table (
  title       text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  time_zone   text,
  venue_name  text,
  org_name    text,
  og_path     text,
  og_width    int,
  og_height   int
)
language sql stable security definer set search_path = '' as $$
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
$$;

revoke execute on function public.session_public_card(uuid) from public;
grant  execute on function public.session_public_card(uuid) to anon, authenticated;

-- ── 5 · the column and the enum ───────────────────────────────────────────
alter table public.org_settings drop column numerals;
drop type public.numeral_system;
