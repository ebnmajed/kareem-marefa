-- wave 9 (`REQ-SES-015`, `REQ-DSC-*`) — the public card says whether a session
-- spans several days.
-- Promoted by the lead from supabase/proposed/sessions/0003_public_card_day_count.sql.
--
-- ★ WHY THIS IS A DROP AND A RE-CREATE. A `RETURN TABLE` cannot change under
-- `create or replace`, which `0082` recorded when it added and removed a column
-- from this very function. And a re-created function starts with PUBLIC
-- execute — `0002`'s trap — so the two grants are restated VERBATIM below.
-- `session_public_card()` is the one public read of `sessions` in the product;
-- it is the last function in the repository to leave ungranted by accident.
--
-- ★ ADDITIVE FOR `main` (wave-9 rule 2). The parameter list is unchanged, so
-- every caller resolves; the row gains a trailing column, and `main`'s
-- `publicCardRow()` reads the row BY KEY and ignores what it does not know.
--
-- ★ NO `anon` GRANT ON `session_days`, and none is wanted. `0100` grants that
-- table to `authenticated` and defers its policy to `sessions_read`; opening it
-- to `anon` to answer «how many days» would widen the one surface a
-- link-holding stranger can reach, for an integer this definer function can
-- return instead.
--
-- Serves:  REQ-SES-015, REQ-SES-006, REQ-DSC-004
-- Cites:   0080 (session_public_card), 0082 (dropped and re-created, grants
--          restated — the pattern this file follows), 0100 (session_days)
-- Docs:    docs/plan/notes/sessions.md "Wave 9 plan" W9.3, finding F3
--
-- 03 §8.2 rows this adds:
--   | `POL-sessions.public_card.day_count` | The public card's row carries the number of days of the session, for `anon` and `authenticated` alike. No policy changes and `session_days` gains no grant: the count comes from the definer function, never from the table. |

drop function public.session_public_card(uuid);
create function public.session_public_card(p_session uuid)
returns table (
  title       text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  time_zone   text,
  venue_name  text,
  org_name    text,
  day_count   int,
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
         -- ★ THE COUNT, AND NOTHING MORE (wave 9, F3). `/s/[id]` is read by
         -- `anon`, and `session_days` grants `select` to `authenticated`
         -- alone — so a public card cannot read days and does not need to:
         -- the SPAN is already `s.starts_at`–`s.ends_at`, which contract 1
         -- makes the first day's start and the last day's end. All that is
         -- missing is whether to say a range at all, and that is one integer.
         (select count(*) from public.session_days d where d.session_id = s.id)::int,
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
