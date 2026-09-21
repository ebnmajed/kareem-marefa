-- proposed by `notify` (wave 10, N3) — bindings declared per message key, and
-- refused by the database for every writer.
--
-- Serves:  REQ-NTF-012 (each MSG-* key declares the bindings it offers; a
--          template referencing one the key does not offer is refused by the
--          DATABASE, not by the form) · REQ-NTF-007 (a template missing a
--          declared required field stays refused, as today) · REQ-NTF-009
-- Cites:   08 §1, §3.2 · 16 §11.3 · DEC-081 · DEC-160 §4 · DEC-161 (sync 1:
--          storage on the template's own row) · 0026 (the matrix, the table,
--          the validate trigger) · 0125 (blocks, source_family)
--
-- ── 03 §8.2 rows this migration needs ───────────────────────────────────────
--   | `RPC-notification_bindings.total` | Every message with an email channel offers at least the
--     three the renderer injects; no key offers a binding twice. |
--   | `RPC-notification_bindings.defaults_are_legal` | Every binding the built-in Arabic templates
--     interpolate is offered by the key that uses it — the platform's own text cannot be refused by
--     the rule the platform ships. |
--   | `POL-notification_templates.unknown_binding` | A template whose subject, body or blocks
--     reference a binding the key does not offer is refused `22023`, as the org admin — the writer
--     the screen uses — and as the owner. |
--   | `POL-notification_templates.blocks_bindings` | The scan reaches INSIDE `blocks`: a paragraph's
--     `{{…}}`, a button's `urlBinding` (a bare name, not a placeholder), a detail row's label and
--     value, an image's `alt`. |
--   | `POL-notification_templates.in_app_unchecked` | An `in_app` row is not subject to the binding
--     rule: nothing reads one (`notification_send_context` filters `channel = 'email'`), and its key
--     may have no email channel and so no declared bindings at all. |
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY A FUNCTION AND NOT A TABLE.
--
-- 0026 says it of the matrix and every word is true of this: "a function
-- rather than a table because the matrix is part of the SPECIFICATION, not org
-- data: it has no org_id, nobody edits it at runtime, and a row appearing in it
-- is a plan change that goes through a migration." The editor lists what a key
-- offers by calling this; the trigger refuses by calling this; one list, and
-- the screen and the database cannot disagree about it.
--
-- WHAT "OFFERED" MEANS: a binding this key's payload can carry, plus the three
-- the renderer injects for every message. It is deliberately NOT "what the
-- built-in template happens to type" — though the two are diffed by a test, so
-- the defaults stay legal.
--
-- ★ THREE BINDINGS ARE DECLARED THAT NO CALLER SENDS TODAY, each named here so
-- the list is not read as a description of the present:
--   · `url`, in the 21 keys whose built-in template ends with it. `'url'`
--     appears in NO migration and in no worker task: every mail sent since M3
--     ends where its link should be. Named difference 1 supplies it from
--     `RenderInput.appUrl`; the bytes before the fix are pinned
--     (tests/unit/mail-pinned/, 38a6f46).
--   · `tasks`, in the three reminders whose template interpolates it
--     (REQ-TSK-005; `MSG-reminder_2h` does not, and so is not offered it).
--   · `category` in MSG-proposal_submitted and `venue` in MSG-rsvp_promoted,
--     both typed by the built-in template and absent from the payload their
--     trigger builds.
-- Declaring them is what makes the platform's own templates legal under the
-- rule below; a binding removed from a template instead would move the pinned
-- bytes for an org that has touched nothing.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.notification_bindings()
  returns table (key text, binding text)
  language sql immutable parallel safe set search_path = '' as $$
  -- The three `render.ts` resolves for every message whatever the payload
  -- holds (`renderEmail()`: `member` and `org` are always resolvable, because
  -- every default template greets by name and «مرحبًا ،» is the failure that
  -- prevents).
  select m.key, u.binding
    from public.notification_matrix() m
    cross join (values ('member.name'), ('member.email'), ('org')) as u(binding)
   where m.email
  union all
  -- What each key's own payload carries. Read out of the promoted migrations,
  -- caller by caller, not out of the templates.
  select v.key, b.binding
    from (values
      -- 08 §1.1 proposals — 0039's proposals_notify()
      ('MSG-proposal_submitted',  array['proposal_id', 'title', 'proposer', 'category', 'url']),
      ('MSG-proposal_approved',   array['proposal_id', 'title', 'reason', 'url']),
      ('MSG-proposal_rejected',   array['proposal_id', 'title', 'reason', 'url']),
      ('MSG-proposal_changes',    array['proposal_id', 'title', 'reason', 'url']),
      ('MSG-copresenter_invited', array['proposal_id', 'title', 'inviter', 'url']),
      -- 08 §1.2 sessions — 0036, 0039, 0111
      ('MSG-session_published',   array['session_id', 'title', 'startsAt', 'venue', 'url']),
      ('MSG-presenter_assigned',  array['session_id', 'title', 'startsAt', 'venue', 'url']),
      -- `changes` is built by the renderer from the trigger's raw array
      -- (08 §3.3): the template sees one pre-built block, never a loop.
      ('MSG-session_changed',     array['session_id', 'title', 'startsAt', 'venue', 'changes', 'url']),
      ('MSG-session_cancelled',   array['session_id', 'title', 'startsAt', 'reason', 'url']),
      -- 08 §1.3 RSVP — 0034's rsvps_notify()
      ('MSG-rsvp_promoted',       array['session_id', 'rsvp_id', 'title', 'startsAt', 'venue', 'url']),
      -- 08 §1.2 reminders — 0110, per day (wave 9). `day` is the renderer's
      -- pre-built «اليوم الثاني من 3», empty at one day so the line disappears.
      ('MSG-reminder_7d',         array['session_id', 'title', 'startsAt', 'venue', 'offset_minutes', 'dayPosition', 'dayCount', 'day', 'tasks', 'url']),
      ('MSG-reminder_1d',         array['session_id', 'title', 'startsAt', 'venue', 'offset_minutes', 'dayPosition', 'dayCount', 'day', 'tasks', 'url']),
      ('MSG-reminder_2h',         array['session_id', 'title', 'startsAt', 'venue', 'offset_minutes', 'dayPosition', 'dayCount', 'day', 'url']),
      ('MSG-reminder_generic',    array['session_id', 'title', 'startsAt', 'venue', 'offset_minutes', 'dayPosition', 'dayCount', 'day', 'tasks', 'url']),
      -- 08 §1.4 during and after — 0035/0088, 0039
      ('MSG-rating_prompt',       array['session_id', 'title', 'url']),
      ('MSG-materials_added',     array['session_id', 'title', 'url']),
      ('MSG-comment_reply',       array['session_id', 'comment_id', 'title', 'author', 'url']),
      ('MSG-mentioned',           array['session_id', 'comment_id', 'title', 'name', 'url']),
      -- 08 §1.5 recognition and certificates — 0065
      ('MSG-badge_earned',        array['badge', 'url']),
      ('MSG-level_reached',       array['level', 'url']),
      ('MSG-certificate_issued',  array['certificate_id', 'serial', 'kind', 'title', 'url']),
      ('MSG-certificate_revoked', array['serial', 'reason']),
      -- 08 §1.6 account
      ('MSG-role_changed',        array['role']),
      ('MSG-account_deactivated', array['reason']),
      ('MSG-export_ready',        array['url'])
    ) as v(key, bindings)
    cross join lateral unnest(v.bindings) as b(binding)
$$;
grant execute on function public.notification_bindings() to authenticated, service_role;

comment on function public.notification_bindings() is
  'REQ-NTF-012: what each MSG-* key offers a template. 08 §1 is the matrix; this is its payload half. Read by the editor (to list) and by notification_templates_validate() (to refuse).';

-- ═══════════════════════════════════════════════════════════════════════════
-- The two scanners.
--
-- NOT security definer and NOT underscore-prefixed, on purpose: the validate
-- trigger runs as the INVOKER (0026 declares it `language plpgsql` with no
-- `security definer`), so an org admin saving a template executes these. A
-- `_name` here would be a private name that every client role must be granted,
-- which is the shape DEC-152's `definer-exposure` rule exists to forbid. They
-- are pure, immutable, and read only text the caller already holds.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.bindings_in_text(p_text text)
  returns setof text
  language sql immutable parallel safe set search_path = '' as $$
  -- `render.ts`'s own placeholder grammar, character for character:
  -- /\{\{\s*([\w.]+)\s*\}\}/g. A second spelling here would refuse what the
  -- renderer resolves, or pass what it leaves visible in a member's inbox.
  select m[1] from pg_catalog.regexp_matches(coalesce(p_text, ''), '\{\{\s*([\w.]+)\s*\}\}', 'g') as m
$$;
grant execute on function public.bindings_in_text(text) to authenticated, service_role;

create or replace function public.bindings_in_blocks(p_blocks jsonb)
  returns setof text
  language sql immutable parallel safe set search_path = '' as $$
  with b as (
    select e.value as block
      from pg_catalog.jsonb_array_elements(
             case when pg_catalog.jsonb_typeof(p_blocks -> 'blocks') = 'array'
                  then p_blocks -> 'blocks' else '[]'::jsonb end) as e(value)
  )
  -- Every text-bearing field of every block, scanned for placeholders:
  -- a heading's and a paragraph's `text`, a button's `label`, an image's
  -- `alt`, and each detail row's `label` and `value`.
  select t.binding
    from b
    cross join lateral (
      select coalesce(b.block ->> 'text', '') || ' ' ||
             coalesce(b.block ->> 'label', '') || ' ' ||
             coalesce(b.block ->> 'alt', '') || ' ' ||
             coalesce((select pg_catalog.string_agg(coalesce(i.value ->> 'label', '') || ' ' || coalesce(i.value ->> 'value', ''), ' ')
                         from pg_catalog.jsonb_array_elements(
                                case when pg_catalog.jsonb_typeof(b.block -> 'items') = 'array'
                                     then b.block -> 'items' else '[]'::jsonb end) as i(value)), '') as txt
    ) s
    cross join lateral public.bindings_in_text(s.txt) as t(binding)
  union all
  -- A button's URL is a binding NAME, not a placeholder — `{"type":"button",
  -- "urlBinding":"url"}` — so it is checked directly rather than by the regex.
  -- An empty one is a CHECKS-PANEL matter (16 §11.4), not a refusal: a draft
  -- with a button whose link is not chosen yet must still save.
  select b.block ->> 'urlBinding'
    from b
   where nullif(pg_catalog.btrim(coalesce(b.block ->> 'urlBinding', '')), '') is not null
$$;
grant execute on function public.bindings_in_blocks(jsonb) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- notification_templates_validate — 0026's three rules, VERBATIM, plus one.
--
-- One trigger, one writer (DEC-161). Rules 1 to 3 are 0026's body unchanged,
-- including the exception messages, because `saveTemplateChecked()` parses
-- `missing_required_field: <field>` to put the refusal at the field it names.
--
-- ★ RULE 4 IS EMAIL-ONLY, and that is not a softening. `notification_send_context`
-- selects `where t.channel = 'email'`, so an `in_app` row is stored and never
-- read by anything; and an in-app-only key (MSG-photo_hidden, MSG-rsvp_nudge)
-- has no row in notification_bindings() at all, so checking it would refuse
-- every in-app template ever written. The binding declaration is the email
-- studio's (REQ-NTF-012, 16 §11.3) and it governs what the email renderer
-- resolves.
--
-- `required_fields` is NOT scanned here. It does not need to be: rule 3 already
-- refuses a template whose subject and body omit a declared field, so a field
-- the key does not offer forces a `{{placeholder}}` into the text, which rule 4
-- then refuses. One check, reached two ways.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.notification_templates_validate() returns trigger
language plpgsql set search_path = '' as $$
declare
  f text;
  b text;
begin
  if not exists (select 1 from public.notification_matrix() m where m.key = new.key) then
    raise exception 'unknown_message_key: %', new.key using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.notification_matrix() m
     where m.key = new.key
       and ((new.channel = 'in_app'::public.notify_channel and m.in_app)
         or (new.channel = 'email'::public.notify_channel and m.email))
  ) then
    raise exception 'channel_not_in_matrix: % on %', new.key, new.channel using errcode = '22023';
  end if;
  foreach f in array new.required_fields loop
    if position('{{' || f || '}}' in coalesce(new.subject, '') || coalesce(new.body, '')) = 0 then
      raise exception 'missing_required_field: %', f using errcode = '23514';
    end if;
  end loop;

  -- REQ-NTF-012 — refused by the database, for every writer, not by the form.
  if new.channel = 'email'::public.notify_channel then
    for b in
      select distinct u.binding
        from (
          select t.binding from public.bindings_in_text(coalesce(new.subject, '') || ' ' || coalesce(new.body, '')) as t(binding)
          union all
          select t.binding from public.bindings_in_blocks(new.blocks) as t(binding)
        ) u(binding)
    loop
      if not exists (
        select 1 from public.notification_bindings() nb
         where nb.key = new.key and nb.binding = b
      ) then
        -- The name travels in the message, as rule 3's does, so the editor can
        -- put the refusal at the block or the field that carries it.
        raise exception 'unknown_binding: %', b using errcode = '22023';
      end if;
    end loop;
  end if;

  return new;
end $$;
