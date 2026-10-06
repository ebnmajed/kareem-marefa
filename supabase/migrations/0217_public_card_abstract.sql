-- 0217 — A shared session link previews its poster, its title and its description. DEC-273, REQ-SES-024.
--
-- The owner's ruling (2026-10-06): «the metadata for the sharing link of the sessions … the image is the poster and
-- the text is the title and the description». The image already is the poster's `og` render (0080). The description
-- was the date · venue · org line, because DEC-066 kept the abstract inside the org; this widens that allowlist by two
-- fields — the abstract and the event type — and no more.
--
-- The return type changes, so the function is dropped and re-created (as 0082, 0118 and 0122 did) and its grants are
-- re-issued. The new columns trail, so main's app — which reads the row by name — is unaffected before it deploys.

drop function public.session_public_card(uuid);

CREATE FUNCTION public.session_public_card(p_session uuid)
 RETURNS TABLE(title text, starts_at timestamp with time zone, ends_at timestamp with time zone, time_zone text, venue_name text, org_name text, day_count integer, days jsonb, og_path text, og_width integer, og_height integer, abstract text, event_type text)
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
         og.height_px,
         -- ★ 0217 (DEC-273, the owner's ruling): the abstract and the event type are public to a link-holder,
         -- so a shared link previews «the title and the description». Still no presenter, capacity, seat,
         -- comment, material or attendee count (DEC-066's remainder stands).
         s.abstract,
         s.event_type::text
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

revoke execute on function public.session_public_card(uuid) from public;
grant  execute on function public.session_public_card(uuid) to anon, authenticated;
