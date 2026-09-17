-- wave 9 — the public card knows which DAY is running, so it stops saying
-- «جارية الآن» through the night between two days of a workshop.
--
-- ★ THE DEFECT THIS CLOSES, seen in a 390 px capture. Contract 9's
-- `sessionPhase()` reads the night between two days as `open` only when it is
-- GIVEN the days. `/s/[id]` called it with the session's stored window alone —
-- a start that has passed, an end that has not — so a three-day workshop was
-- «جارية الآن» to the public for two nights, while the event page and the
-- browse card, which pass days, said «التسجيل مفتوح» for the same session at
-- the same instant.
--
-- ★ WHAT IS DISCLOSED, AND WHAT IS NOT. Two instants per day, ordered. No id,
-- no `position`, no venue — nothing that identifies a day or can be joined to
-- anything. The overall span is already in this row, and these are the meeting
-- times of a session anyone with the link can see; `session_days` itself gains
-- no `anon` grant, exactly as `0118` decided for the count.
--
-- ★ WHY NOT A BOOLEAN. «Is a day running now» would be one column and no
-- disclosure at all — and it would put `betweenDays()` in SQL beside the
-- TypeScript one. Two implementations of one rule is precisely what produced
-- the defect above. The rule stays in `session-status.ts` and this feeds it.
--
-- ★ `RETURN TABLE` again: dropped and re-created, because a return type cannot
-- change under `create or replace` (`0082`, `0118`), and BOTH grants are
-- restated verbatim — a re-created function starts with PUBLIC execute, which
-- is `0002`'s trap on the one public read of `sessions` in the product.
-- Additive for `main`: the parameter list is unchanged and `publicCardRow()`
-- reads the row by key.
--
-- Serves:  REQ-SES-015, REQ-UIX-003, REQ-SES-006, REQ-DSC-004
-- Cites:   0080 (session_public_card), 0082 and 0118 (dropped, re-created,
--          grants restated — the pattern), 0100 (session_days)
-- Docs:    docs/plan/notes/sessions.md "Wave 9 plan" W9.3
--
-- ★ The lead makes the reviewed allowlist edit in
-- `tests/rls/sessions-public-card.test.ts` at promotion: the ONE key to add to
-- the sorted return-type list is `"days"`, between `"day_count"` and
-- `"ends_at"`.
--
-- 03 §8.2 rows this adds:
--   | `POL-sessions.public_card.day_windows` | The public card's row carries one `{ starts_at, ends_at }` per day, ordered, for `anon` and `authenticated` alike — enough for `sessionPhase()` and nothing more. No day id, no position, no venue; `session_days` gains no grant. |
--   | `POL-sessions.public_card.one_day_unchanged` | A one-day session returns a one-element array, which `betweenDays()` has no pair to walk — the card's phase is what it has always been. |

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
  days        jsonb,
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
$$;

revoke execute on function public.session_public_card(uuid) from public;
grant  execute on function public.session_public_card(uuid) to anon, authenticated;
