-- designer (wave 10, row D2) — A MULTI-DAY POSTER'S DATE.
--
-- A three-day workshop's poster shows its first day: true, and incomplete
-- (wave 9's row L6, DEC-151's carry). The date is one binding,
-- `{{session.startsAt}}`, and this file gives the render path the day set it
-- needs to resolve that binding over.
--
-- ★ THE BINDING'S NAME DOES NOT CHANGE; ITS VALUE DOES, and the reason is this
-- migration's own window. `poster_render_context()` picks the automatic
-- template with `order by … version desc limit 1` — the LATEST version. The
-- owner pushes migrations BEFORE merging, so from the push until Railway
-- redeploys, `main`'s worker renders every newly published or edited session's
-- poster from whatever the newest template version is. Had a new binding been
-- introduced, that version's date layer would have named a binding `main`'s
-- `resolveSessionBindings()` has never heard of — ABSENT, so the poster would
-- have drawn the marked placeholder «التاريخ والوقت» where its date belongs,
-- and `/api/s/{id}/og` would have served that as the public share image. With
-- the name kept, the old runtime binds the session's own `starts_at` and
-- renders the first day exactly as it does today: late, never wrong. And the
-- range reaches every PINNED document and every ORG'S OWN COPY of a template
-- at its next regeneration, which no seed migration could ever have done
-- (REQ-DSG-008).
--
-- So: NO new binding, NO new template version, NO seed migration, and
-- `tests/unit/designer-library.test.ts` is not touched.
--
-- Serves:  REQ-DSG-002, REQ-SES-015, REQ-DSG-013
-- Cites:   0082 (poster_render_context — THE LIVE TEXT this file re-creates,
--          with one column added; it is dropped and re-created there for the
--          same reason, a return type cannot change under `create or replace`),
--          0063 (the original), 0100 (session_days), DEC-150
-- Docs:    DEC-160 §6, STATUS row D2
--
-- 03 §8.2 rows this adds:
--   | `RPC-poster_render_context.days` | The render context carries the session's days in `position` order — the database's derived rank, never a minimum or a maximum computed by a caller. At one day it is that one day, and every other column is `0082`'s, in `0082`'s order. Executable by `service_role` alone. |

-- ── poster_render_context — dropped and re-created ────────────────────────
-- ★ GRANTS RESTATED VERBATIM. A re-created function starts with PUBLIC
-- execute, which is the 0002 trap, and `tests/rls/definer-exposure.test.ts`
-- (DEC-152) fails on a definer function a client role can execute.
drop function public.poster_render_context(uuid);
create function public.poster_render_context(p_session uuid)
returns table (
  session_id uuid, org_id uuid, title text, abstract text, starts_at timestamptz,
  session_time_zone text, venue_name text, venue_address text, presenters text[],
  org_name text, org_time_zone text,
  poster_id uuid, document_id uuid, mode public.poster_mode, binding public.poster_binding,
  template_version_id uuid, template_document jsonb,
  -- ★ TRAILING, and every column above is 0082's in 0082's order: `main`'s
  -- `regenerate_poster.ts` runs `select *` into a typed row and reads NAMED
  -- fields, so an extra key arrives and is never read. Its bindings are
  -- today's, so its fingerprint is today's, and the artifact cache does not
  -- churn (REQ-DSG-013).
  days jsonb
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
         tv.id, tv.document,
         -- ★ BY `position` — the chronological rank the database derives and
         -- renumbers by trigger (DEC-150). Never ordered by `created_at`,
         -- which is the transaction's start and identical for rows written
         -- together, and never reduced to a min or a max here or in the
         -- caller. `[]` for a session whose days have not been written yet,
         -- which the runtime reads as «use the session's own instant».
         coalesce((select jsonb_agg(jsonb_build_object('startsAt', d.starts_at, 'endsAt', d.ends_at) order by d.position)
                     from public.session_days d where d.session_id = s.id), '[]'::jsonb)
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
comment on function public.poster_render_context(uuid) is
  'Everything JOB-regenerate_poster needs for one session, including its days in position order (DEC-160). service_role only.';
