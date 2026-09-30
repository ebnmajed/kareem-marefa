-- 0164 · wave 18 (DEC-205, DEC-206 §3, REQ-UIX-056) — an org's announcements.
--
-- Home is the feed (REQ-UIX-055), and one of its items is a short text an org
-- admin publishes to the whole org. Everything else the feed shows is derived
-- from rows that already exist; this is the wave's one table.
--
-- An announcement is NOT a member's post, a poll, a comment thread or a thing
-- that can be reacted to, and it notifies nobody: no trigger here enqueues or
-- calls notify().
--
-- ★ The five parts, named one by one — 0002 exists solely because 0001 forgot
-- the fourth (invariants 5 and 6):
--   1. org_id, not null, referencing orgs;
--   2. RLS enabled;
--   3. the full policy set — two selects, an insert, an update, a delete;
--   4. a grant for every policy, in this file;
--   5. its test, tests/rls/feed-announcements.test.ts, and a fixture row in
--      tests/rls/fixture.ts so the generated isolation sweep is not vacuous.
--
-- Expiry is a PREDICATE, not a deletion: an expired row leaves a member's feed
-- because the read policy stops answering, and no job is needed.
--
-- No super-admin disjunct (invariant 8). `service_role` holds nothing: the
-- worker never reads or writes an announcement.
--
-- Additive for `main`: nothing on `main` names this table, so `main`'s app and
-- worker on this schema do nothing different.

create table public.feed_announcements (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  -- The admin who published it. Members leave only with their org, which takes
  -- this row too; an anonymised author keeps the row and loses their name.
  author_id    uuid not null references public.members(id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 1 and 500),
  published_at timestamptz not null default now(),
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint feed_announcements_expires_after_published
    check (expires_at is null or expires_at > published_at)
);

create index feed_announcements_org_published
  on public.feed_announcements (org_id, published_at desc);

create trigger feed_announcements_updated_at before update on public.feed_announcements
  for each row execute function public.set_updated_at();

alter table public.feed_announcements enable row level security;
revoke all on public.feed_announcements from anon, authenticated, service_role;

-- A member of the org reads what is published and not yet expired.
create policy "feed_announcements_read_published" on public.feed_announcements for select to authenticated
  using (
    org_id = public.auth_org_id()
    and published_at <= now()
    and (expires_at is null or expires_at > now())
  );

-- An admin of the org reads every row of it — scheduled and expired included.
create policy "feed_announcements_admin_read" on public.feed_announcements for select to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());

-- Only an admin writes, in their own org, and the author recorded is the caller.
create policy "feed_announcements_admin_insert" on public.feed_announcements for insert to authenticated
  with check (
    org_id = public.auth_org_id()
    and public.is_org_admin()
    and author_id = public.auth_member_id()
  );

create policy "feed_announcements_admin_update" on public.feed_announcements for update to authenticated
  using      (org_id = public.auth_org_id() and public.is_org_admin())
  with check (org_id = public.auth_org_id() and public.is_org_admin());

create policy "feed_announcements_admin_delete" on public.feed_announcements for delete to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());

-- ★ A grant for every policy. The update grant is by COLUMN: an admin edits the
-- text and the window, and can never move a row to another org or re-attribute
-- it — `org_id` and `author_id` are not updatable by anyone.
grant select, insert, delete on public.feed_announcements to authenticated;
grant update (body, published_at, expires_at) on public.feed_announcements to authenticated;
