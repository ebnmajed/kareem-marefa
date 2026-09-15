-- The public session card — the owner's decision of 2026-09-15.
--
-- Every session gets PUBLIC metadata so a shared link previews properly in WhatsApp, X and
-- LinkedIn, even though the app itself is members-only. `12` T3 treated a link-holding outsider
-- as someone to keep out; this is a deliberate, owner-decided opening for exactly six fields and
-- nothing more: the title, the start and end instants with the org's time zone and numerals, the
-- venue NAME (never its address or map link), the org's name, and the poster's `og` image.
--
-- ★ THIS IS THE ONLY PUBLIC READ OF `sessions` IN THE PRODUCT, and it is a function, not a
-- policy. `anon` has no policy on `public.sessions` and gains none here. Three properties an
-- `anon` policy would not buy, the same three that made `verify_certificate()` a function (0055):
--
--   1. The RETURN TYPE is the allowlist. A column added to `sessions` next year — a stream URL, a
--      private note, an attendee count — cannot leak through by being selected accidentally. The
--      abstract, the presenters, the capacity, the RSVP counts, the comments and the materials are
--      not in the type, so they are not reachable, whatever a caller writes.
--   2. It is reachable only by the session's own id. There is no list, no filter and no ordering,
--      so the catalogue cannot be walked by a stranger who holds one link.
--   3. A draft, a submitted, an approved, an archived and a CANCELLED session all return the empty
--      set — the same answer as a uuid that names nothing. The route renders notFound() for all of
--      them, so the card can never confirm that an unpublished session exists.
--
-- A suspended org's cards go dark with the org (`orgs.status`), which is what suspension means.
--
-- Serves:  REQ-SES-006, REQ-SES-008, REQ-SES-013, REQ-INT-003, REQ-INT-006, REQ-NFR-001
-- Cites:   0004 (orgs), 0010 (sessions, venues), 0037 (exports bucket), 0055 (export_artifacts),
--          0063 (the poster pipeline that renders the `og` preset)
--
-- ★ REQ-SES-008 holds here too: there is no stream URL and no remote-attendance field in the
-- return type, because there is none in the product.
--
-- 03 §8.2 rows this adds:
--   | `POL-sessions.public_card.anon` | `session_public_card()` as `anon` on a `published`,
--     `in_progress` or `completed` session returns exactly the six public fields; the abstract,
--     the presenters, the capacity and every other column are absent from the return type. |
--   | `POL-sessions.public_card.anon` | A `draft`, `approved`, `archived` or `cancelled` session,
--     a session of a suspended org, and an unknown uuid are the same empty answer. |
--   | `POL-sessions.public_card.anon` | `anon` still has no policy on `public.sessions`,
--     `public.venues`, `public.session_posters` or `public.export_artifacts`: a direct select
--     returns nothing. |
--   | `POL-storage.exports.public_card` | `anon` reads the `og.png` object of a card-eligible
--     session's poster, and nothing else in `exports` — not the same poster's `master`, `a4` or
--     `cert_*` objects, not the `og` of a draft or cancelled session, not another org's. |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The card
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.session_public_card(p_session uuid)
returns table (
  title       text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  time_zone   text,
  venue_name  text,
  org_name    text,
  numerals    public.numeral_system,
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
         coalesce(os.numerals, 'western'::public.numeral_system),
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The image
-- ═══════════════════════════════════════════════════════════════════════════

-- Why a SECURITY DEFINER predicate and not a subquery inside the policy: a
-- policy expression referencing another table is evaluated as the CALLER, and
-- `anon` has no policy on `export_artifacts`, `session_posters` or `sessions`.
-- An inline subquery would therefore see nothing and deny everything — the
-- policy would look right and never grant. The definer function is the only
-- shape that works, and keeping it narrow is what keeps it safe: it answers a
-- single boolean about one exact object path and reveals nothing a caller
-- could not learn by fetching that object.
create or replace function public.export_is_public_card(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_name like '%/exports/%/og.png'
     and exists (
    select 1
      from public.export_artifacts ea
      join public.session_posters sp on sp.document_id = ea.document_id
      join public.sessions s         on s.id = sp.session_id
      join public.orgs o             on o.id = s.org_id and o.status = 'active'
     where ea.storage_path = p_name
       and ea.preset = 'og'
       and ea.format = 'png'
       and ea.status = 'ready'
       and s.state in ('published', 'in_progress', 'completed')
  )
$$;

revoke execute on function public.export_is_public_card(text) from public;
grant  execute on function public.export_is_public_card(text) to anon, authenticated;

-- `exports_storage_read` (0037) is `to authenticated` and org-prefixed; it is
-- untouched. This is a second, additive policy for one role and one shape.
--
-- What it does NOT open: every other object in the bucket stays refused to
-- `anon` — the same poster's `master`, `square`, `story`, `landscape`, `a4`
-- and `a3` renders, every `cert_landscape` / `cert_portrait` certificate, and
-- every object of a draft, cancelled, archived or suspended-org session. The
-- `og` preset is 1200×630 and carries the title and the date, which the card
-- already shows; the `master` and the PDFs are print artefacts and the
-- certificates are somebody's name, so none of them is in this door.
--
-- Enumeration, stated rather than hidden: `anon` holding a select policy on
-- `storage.objects` can LIST the objects it matches. The paths are
-- `{org_id}/exports/{document_id}/og.png` — two opaque uuids, neither of them
-- a session id, so a listed path cannot be turned back into a card URL, and
-- the bytes it names are exactly the bytes any link-holder may already fetch.
drop policy if exists "exports_storage_read_public_card" on storage.objects;
create policy "exports_storage_read_public_card" on storage.objects for select to anon
  using (bucket_id = 'exports' and public.export_is_public_card(name));
