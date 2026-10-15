-- 0228 — views: how many saw a story frame, a post, a recap and an announcement, and who (DEC-297; REQ-VEW-001 … 006,
-- REQ-STO-010 amended). The record is one row per member per subject; reach is the number of rows, impressions their
-- `times_seen`. ★ Every write and every read of another member's row is a definer function (the functions half below,
-- from supabase/proposed/content/, promoted in this same file); a member's client reads its own rows only.
--
-- Forward-only and additive for `main`, which runs on this schema before the code that follows: `story_views` keeps
-- its insert policy and grant, so `main`'s viewer still records «seen» (the three new columns default); the new code
-- writes through `record_views()` only. The insert path is removed in a later migration, after the merge.

-- ═══ 1 · the four subjects ════════════════════════════════════════════════════

create type public.view_subject as enum ('frame', 'post', 'recap', 'announcement');

-- ═══ 2 · story_views gains the impression and the video's end ══════════════════

alter table public.story_views
  add column last_seen_at timestamptz not null default now(),
  add column times_seen   integer     not null default 1 check (times_seen >= 1),
  add column completed_at timestamptz;

-- `viewed_at` stays the first time seen and never moves.
update public.story_views set last_seen_at = viewed_at where last_seen_at <> viewed_at;

-- ═══ 3 · content_views — a post, a recap, an announcement ══════════════════════

-- A post and a recap are both a session, counted apart: the feed shows a session as a post until it ends and as a
-- recap after. Real foreign keys, so a subject's deletion (a session's hard delete, 0215; an announcement's) takes
-- its views with it.
create table public.content_views (
  org_id          uuid not null references public.orgs(id) on delete cascade,
  member_id       uuid not null references public.members(id) on delete cascade,
  kind            public.view_subject not null,
  session_id      uuid references public.sessions(id) on delete cascade,
  announcement_id uuid references public.feed_announcements(id) on delete cascade,
  subject_id      uuid generated always as (coalesce(session_id, announcement_id)) stored,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  times_seen      integer     not null default 1 check (times_seen >= 1),
  primary key (member_id, kind, subject_id),
  check (kind <> 'frame'),
  check ((kind in ('post', 'recap')) = (session_id is not null)),
  check ((kind = 'announcement') = (announcement_id is not null))
);

create index content_views_subject_idx on public.content_views (org_id, kind, subject_id);

alter table public.content_views enable row level security;
revoke all on public.content_views from anon, authenticated, service_role;

-- A member's own rows; nobody else's, staff included — counts and lists leave only through the definer functions.
create policy "content_views_read_own" on public.content_views for select to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());

-- No insert, update or delete policy: written only by `record_views()`.
grant select on public.content_views to authenticated;
