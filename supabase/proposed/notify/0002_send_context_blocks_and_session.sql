-- proposed by `notify` (wave 10, N2's wiring + D3's F3) — what one send needs
-- in order to render a DESIGN: the template's blocks, and the session's state.
--
-- Serves:  REQ-NTF-009 (a template is an ordered list of blocks) ·
--          REQ-NTF-014 (every design driven by the brand kit) ·
--          contract 8 (which image a mail may point at, DEC-161)
-- Cites:   0030 (the function), 0082 (its last definition), 0125 (`blocks`),
--          0126 (`org_public_logo`), 0080 (`export_is_public_card` — the
--          predicate this mirrors), DEC-161, `designer`'s D3 finding F3
--
-- ── 03 §8.2 rows this migration needs ───────────────────────────────────────
--   | `RPC-notification_send_context.blocks` | The `template` object carries `blocks` — null for a string
--     template, the stored document otherwise — so the worker renders a design without a second read. |
--   | `RPC-notification_send_context.session_state` | Given a session id, the context carries that
--     session's state, and **only for a session of the SAME org**; another org's id yields null rather
--     than a state. |
--   | `RPC-notification_send_context.definer_only` | Unchanged: `anon`, `authenticated` and an org admin
--     are all refused on the grant, because it returns another member's email address. |
--
-- ★ ADDITIVE, AND THE OLD SIGNATURE GOES IN THIS FILE (0085's lesson).
-- `main`'s worker calls `notification_send_context($1,$2,$3)` — three
-- arguments, positional. The new parameter is TRAILING and DEFAULTED, so that
-- call still resolves; and the four-argument version is dropped here rather
-- than left beside the five-argument one, or PostgREST would see two
-- overloads and refuse to choose.
--
-- ★ WHY THE SESSION'S STATE IS RETURNED HERE rather than read by the task.
-- `/api/s/{id}/og` — the ONE image URL a mail client can fetch with no session
-- (contract 8, `0080`) — **404s for a draft or a cancelled session**, by
-- `export_is_public_card()`'s own predicate. So a mail about a cancellation
-- must not carry the session card's image, and the sender has to know the
-- state to decide. The worker reads org data through SECURITY DEFINER
-- functions and never through its own table queries (CLAUDE.md, data-access
-- rule 6), and this is the function that already assembles everything one send
-- needs in one round trip. A second query from the task would be a second
-- place that decides what a mail may point at.

drop function public.notification_send_context(uuid, uuid, text, text);

create function public.notification_send_context(
  p_org      uuid,
  p_member   uuid,
  p_key      text,
  p_locale   text default 'ar',
  p_session  uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  m   record;
  o   record;
  mem public.members;
  tpl public.notification_templates;
  -- Two scalars and not a record, deliberately: a plpgsql RECORD that no
  -- SELECT ever assigned raises «record "ses" is not assigned yet» the moment
  -- a field of it is read, so the common call — no session id at all — would
  -- fail rather than return null. Scalars start NULL, which is the answer.
  v_session_id    uuid;
  v_session_state text;
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

  -- Scoped to the caller's org on purpose: a session id travels in a payload,
  -- and a payload is not a capability. Another org's id yields no row, so the
  -- mail carries no image rather than a fact about a session it cannot see.
  if p_session is not null then
    select s.id, s.state::text into v_session_id, v_session_state
      from public.sessions s
     where s.id = p_session and s.org_id = p_org;
  end if;

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
      'required_fields', to_jsonb(tpl.required_fields),
      -- ★ null is a STRING template — every row that existed before wave 10,
      -- and what an org that has not touched its templates still sends.
      'blocks',          tpl.blocks) end,
    'session', case when v_session_id is null then null else jsonb_build_object(
      'id',    v_session_id,
      'state', v_session_state) end,
    -- The 08 §1.7 set bypasses the check on both channels; everything else is
    -- read fresh. `_notify_wants` holds the "absence means on" rule (0026).
    'email_allowed',  m.email  and (not m.optional or public._notify_wants(p_member, m.category, 'email')),
    'in_app_allowed', m.in_app and (not m.optional or public._notify_wants(p_member, m.category, 'in_app'))
  );
end $$;

-- DROP FUNCTION cleared the grants; they are re-applied, and they are the same
-- two: this returns another member's email address, so no client role may call
-- it (0030's reasoning, unchanged).
revoke execute on function public.notification_send_context(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant  execute on function public.notification_send_context(uuid, uuid, text, text, uuid) to service_role;
