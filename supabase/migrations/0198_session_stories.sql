-- 0198 · wave 26 (DEC-245, DEC-248 §5, DEC-251 §4 – §5; REQ-STO-001 … 018) — session stories: the tables.
--
-- A session has one story: frames generated from what the session does, and
-- frames its checked-in attendees add. This file is the STORAGE and nothing
-- else — every function that writes a frame is a track's (`sessions'` generator,
-- `content`'s capture, transcode and moderation), promoted in the migration
-- after this one. Tables are the lead's; behaviour is the tracks'.
--
-- ★ FRAMES ARE ROWS, not the projection docs/design/05-stories.md describes
-- (DEC-248 §5): a frame expires 24 hours after ITS TRIGGER (REQ-STO-002), a
-- trigger must write exactly once (REQ-STO-004), and staff keep an attendee's
-- frame after it has expired for members (REQ-STO-017). Each needs a stored
-- instant and a stored identity. A frame stores NO FIGURE — the live count, the
-- recap's stats and a photograph's caption are read when the frame is read.
--
-- ★ The five parts, per table, named one by one — 0002 exists solely because
-- 0001 forgot the fourth (invariants 5 and 6):
--   1. org_id, not null, referencing orgs;
--   2. RLS enabled;
--   3. the policy set — and where a table has NO insert, update or delete
--      policy, that absence IS its policy set: the only writers are definer
--      functions, as on the survey's register (03 §5.6f);
--   4. a grant for every policy, in this file;
--   5. its cases in tests/rls/story-tables.test.ts, and a fixture row in
--      tests/rls/fixture.ts so the generated isolation sweep is not vacuous.
--
--   | `POL-story_frames.read_visible` | a member reads a frame that is visible, inside 24 h, of a session not cancelled, its photograph visible · at 24 h ✗ · hidden ✗ · removed ✗ · cancelled ✗ · another org ✗ · anon ✗ |
--   | `POL-story_frames.read_own` | the author reads their own processing or failed video · another member ✗ |
--   | `POL-story_frames.staff_read` | admin ✓ · moderator ✓ every frame of the org, expired and hidden too · another org's admin ✗ |
--   | `POL-story_frames.no_client_write` | insert, update, delete: member ✗ · admin ✗ · service_role ✗ (42501) |
--   | `POL-story_frames.one_per_trigger` | a second row with the same (session, kind, trigger key) is refused (23505) |
--   | `POL-story_views.own` | a member writes and reads their own view of a frame they may read · of a frame they may not ✗ · another member's views: member ✗ · admin ✗ |
--   | `POL-story_reactions.own` | one per member per frame; read by the org for a readable frame; written, changed and removed by its owner alone · no ledger row |
--   | `POL-story_frame_takedowns.read` | the requester ✓ · staff ✓ · another member ✗ · no client write |
--   | `POL-reports.story_frame` | a report names a frame exactly when its target says so (23514 otherwise) |
--   | `POL-story_media_read` | a visible frame's video and poster: a member who may read the frame ✓ · the source ✗ always · expired ✗ · another org ✗ |
--
-- No super-admin disjunct anywhere (invariant 8). `service_role` holds nothing
-- on any of the four tables: the worker reaches them through definer functions
-- (data-access rule 6).
--
-- ★ Additive for `main` (it runs on this schema first): nothing on `main` names
-- these tables, the two new `photos` columns are nullable or defaulted, the new
-- `reports` column is nullable, and a new enum value changes no existing row.
-- `main`'s app and worker on this schema do nothing different. Indifferent to
-- 0194 (DEC-248 §2): no object here is touched by it.

-- ═══ 1 · the types ═══════════════════════════════════════════════════════════

-- The eight of REQ-STO-004 — three of them named for what they announce — and
-- the attendee's video. An attendee's photograph is a `photo` frame like every
-- other album photograph (DEC-251 §4.1).
create type public.story_frame_kind as enum (
  'published', 'registration_opened', 'registration_closed', 'starts_soon',
  'live', 'photo', 'recap', 'materials', 'video'
);

-- Only a video is ever anything but visible: it is transcoded first, and may fail.
create type public.story_frame_state as enum ('processing', 'visible', 'failed');

-- The four of REQ-STO-005, as the boards draw them.
create type public.story_reaction_kind as enum ('heart', 'fire', 'clap', 'idea');

-- A report may name a frame. ★ A value added here cannot be USED as a literal
-- before this transaction commits (55P04), so nothing below compares against it
-- except through `::text`.
alter type public.report_target add value if not exists 'story_frame';

-- ═══ 2 · story_frames ═════════════════════════════════════════════════════════

create table public.story_frames (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  -- A story is the session's, never a person's (REQ-STO-001). The frames go with it.
  session_id      uuid not null references public.sessions(id) on delete cascade,
  -- The day a per-day frame belongs to (`starts_soon`, `live`). Cleared, not
  -- cascaded, if the day is removed: the frame's instant still stands.
  session_day_id  uuid,
  kind            public.story_frame_kind not null,
  -- ★ The idempotency (REQ-STO-004): a constant, an instant, a day's id or a
  -- photograph's id — whatever makes the trigger THIS trigger. A trigger that
  -- fires twice, a retried job or two racing writers leave one row.
  trigger_key     text not null check (char_length(trigger_key) between 1 and 120),
  -- When the trigger happened; the 24 hours run from here (REQ-STO-002).
  triggered_at    timestamptz not null,
  -- When the row was written — «within a minute» is measured against it. Never orders anything.
  written_at      timestamptz not null default clock_timestamp(),

  -- ── an attendee's frame ──
  author_id       uuid references public.members(id),
  -- A VIDEO's caption. A photograph's caption is `photos.caption`, read through
  -- `photo_id` — a photo frame copies nothing from its photograph.
  caption         text check (caption is null or char_length(btrim(caption)) between 1 and 100),
  -- The album photograph a `photo` frame shows. The frame goes with it.
  photo_id        uuid references public.photos(id) on delete cascade,
  -- A video's objects in `story-media`. The source is deleted once the rendition exists.
  source_path     text,
  video_path      text,
  poster_path     text,
  duration_ms     int    check (duration_ms is null or duration_ms between 1 and 15100),
  width           int    check (width is null or width between 1 and 4096),
  height          int    check (height is null or height between 1 and 4096),
  byte_size       bigint check (byte_size is null or byte_size between 1 and 62914560),
  sha256          text   check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  state           public.story_frame_state not null default 'visible',
  failure_reason  text check (failure_reason is null or failure_reason in ('too_long', 'too_large', 'unsupported', 'failed')),

  -- ── moderation, as a photograph's ──
  hidden_at       timestamptz,
  hidden_reason   text,
  removed_at      timestamptz,
  removed_by      uuid references public.members(id),
  removal_reason  text,
  created_at      timestamptz not null default now(),

  constraint story_frames_one_per_trigger unique (session_id, kind, trigger_key),
  constraint story_frames_day_of_own_session
    foreign key (session_id, session_day_id) references public.session_days (session_id, id) on delete set null (session_day_id),
  constraint story_frames_photo_names_a_photograph check ((kind = 'photo') = (photo_id is not null)),
  constraint story_frames_video_has_an_author      check (kind <> 'video' or author_id is not null),
  constraint story_frames_only_a_video_waits       check (state = 'visible' or kind = 'video'),
  constraint story_frames_visible_video_is_whole
    check (kind <> 'video' or state <> 'visible' or (video_path is not null and poster_path is not null and duration_ms is not null)),
  constraint story_frames_failure_has_a_reason     check ((state = 'failed') = (failure_reason is not null)),
  constraint story_frames_hidden_has_a_reason      check ((hidden_at is null) = (hidden_reason is null)),
  constraint story_frames_removal_is_whole         check ((removed_at is null) = (removed_by is null))
);

-- The feed's 24-hour scan, a session's story, and the photograph's join.
create index story_frames_org_triggered on public.story_frames (org_id, triggered_at desc);
create index story_frames_session_triggered on public.story_frames (session_id, triggered_at);
create index story_frames_photo on public.story_frames (photo_id) where photo_id is not null;

-- ★ THE MEMBER PREDICATE, ONCE (DEC-251 §5). The read policy below calls it, and
-- so does `sessions'` feed — because staff may read every frame, a staff
-- member's own ring row would otherwise show expired and cancelled ones. One
-- definition, so the policy and the feed cannot drift.
--
-- SECURITY INVOKER on purpose: the session and the photograph are read through
-- the CALLER's own policies, so a frame is visible only when the caller could
-- read its session and its photograph anyway. It adds no authority; it only
-- takes some away.
create function public.story_frame_is_visible(f public.story_frames, p_now timestamptz default now())
returns boolean
language sql stable security invoker set search_path = '' as $$
  select f.state = 'visible'
     and f.hidden_at is null
     and f.removed_at is null
     and f.triggered_at <= p_now
     and f.triggered_at + interval '24 hours' > p_now                       -- REQ-STO-002
     and exists (select 1 from public.sessions s
                  where s.id = f.session_id and s.state <> 'cancelled')    -- REQ-STO-018
     and (f.photo_id is null
          or exists (select 1 from public.photos p
                      where p.id = f.photo_id and p.hidden_at is null and p.removed_at is null))
$$;
revoke all on function public.story_frame_is_visible(public.story_frames, timestamptz) from public, anon;
grant execute on function public.story_frame_is_visible(public.story_frames, timestamptz) to authenticated;

alter table public.story_frames enable row level security;
revoke all on public.story_frames from anon, authenticated, service_role;

-- A member of the org reads what is visible now (REQ-STO-002, 003, 018).
create policy "story_frames_read_visible" on public.story_frames for select to authenticated
  using (org_id = public.auth_org_id() and public.story_frame_is_visible(story_frames));

-- The author alone reads their own video while it is processing, or after it
-- failed — that is where «تعذّر» is said (REQ-STO-016). Never a removed one.
create policy "story_frames_read_own" on public.story_frames for select to authenticated
  using (org_id = public.auth_org_id()
         and author_id = public.auth_member_id()
         and state <> 'visible'
         and removed_at is null);

-- Staff read every frame of their org — expired, hidden and removed too
-- (REQ-STO-017, the moderation queue).
create policy "story_frames_staff_read" on public.story_frames for select to authenticated
  using (org_id = public.auth_org_id() and public.is_staff());

-- ★ NO insert, update or delete policy, and no such grant: every write is a
-- definer function. That absence is this table's write policy.
grant select on public.story_frames to authenticated;

-- ═══ 3 · story_views ══════════════════════════════════════════════════════════

-- What a member has viewed is theirs alone (REQ-STO-010): no staff policy.
create table public.story_views (
  org_id     uuid not null references public.orgs(id) on delete cascade,
  member_id  uuid not null references public.members(id) on delete cascade,
  frame_id   uuid not null references public.story_frames(id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (member_id, frame_id)
);

alter table public.story_views enable row level security;
revoke all on public.story_views from anon, authenticated, service_role;

create policy "story_views_read_own" on public.story_views for select to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());

-- The `exists` runs under the caller's own policies on `story_frames`, so a
-- member can mark seen only a frame they may read now.
create policy "story_views_insert_own" on public.story_views for insert to authenticated
  with check (org_id = public.auth_org_id()
              and member_id = public.auth_member_id()
              and exists (select 1 from public.story_frames f where f.id = story_views.frame_id and f.org_id = public.auth_org_id()));

-- No update, no delete: a view is recorded once and goes with its frame or its member.
grant select, insert on public.story_views to authenticated;

-- ═══ 4 · story_reactions ══════════════════════════════════════════════════════

-- One per member per frame, replaced on change (REQ-STO-005). It earns nothing:
-- no trigger here writes a ledger row, and no scoring rule names a reaction
-- (REQ-EVT-004, REQ-PTS-010).
create table public.story_reactions (
  org_id      uuid not null references public.orgs(id) on delete cascade,
  frame_id    uuid not null references public.story_frames(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  kind        public.story_reaction_kind not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (frame_id, member_id)
);

create trigger story_reactions_updated_at before update on public.story_reactions
  for each row execute function public.set_updated_at();

alter table public.story_reactions enable row level security;
revoke all on public.story_reactions from anon, authenticated, service_role;

-- The counts of a frame the caller may read.
create policy "story_reactions_read" on public.story_reactions for select to authenticated
  using (org_id = public.auth_org_id()
         and exists (select 1 from public.story_frames f where f.id = story_reactions.frame_id and f.org_id = public.auth_org_id()));

create policy "story_reactions_insert_own" on public.story_reactions for insert to authenticated
  with check (org_id = public.auth_org_id()
              and member_id = public.auth_member_id()
              and exists (select 1 from public.story_frames f where f.id = story_reactions.frame_id and f.org_id = public.auth_org_id()));

create policy "story_reactions_update_own" on public.story_reactions for update to authenticated
  using      (org_id = public.auth_org_id() and member_id = public.auth_member_id())
  with check (org_id = public.auth_org_id() and member_id = public.auth_member_id()
              and exists (select 1 from public.story_frames f where f.id = story_reactions.frame_id and f.org_id = public.auth_org_id()));

create policy "story_reactions_delete_own" on public.story_reactions for delete to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());

-- ★ A grant for every policy. The update is by COLUMN: a member changes which
-- of the four it is, and can never move a reaction to another frame or member.
grant select, insert, delete on public.story_reactions to authenticated;
grant update (kind) on public.story_reactions to authenticated;

-- ═══ 5 · story_frame_takedowns ════════════════════════════════════════════════

-- «أزلني» on a video frame (REQ-STO-014) — `photo_takedowns`' shape. A photo
-- frame's «أزلني» is its photograph's own takedown and never comes here.
create table public.story_frame_takedowns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  frame_id      uuid not null references public.story_frames(id) on delete cascade,
  requester_id  uuid not null references public.members(id),
  requested_at  timestamptz not null default now(),
  resolved_at   timestamptz,
  resolution    public.moderation_action,
  resolved_by   uuid references public.members(id),
  check ((resolved_at is null) = (resolution is null))
);
create index story_frame_takedowns_org_frame on public.story_frame_takedowns (org_id, frame_id);

alter table public.story_frame_takedowns enable row level security;
revoke all on public.story_frame_takedowns from anon, authenticated, service_role;

create policy "story_frame_takedowns_read" on public.story_frame_takedowns for select to authenticated
  using (org_id = public.auth_org_id() and (public.is_staff() or requester_id = public.auth_member_id()));

-- ★ NO client write. Unlike `photo_takedowns`, a request and a decision are
-- each one definer function (`content`'s), because the request must hide the
-- frame in the same call and the frame takes no client update at all.
grant select on public.story_frame_takedowns to authenticated;

-- ═══ 6 · the three columns ════════════════════════════════════════════════════

-- A photograph's caption, written by the worker when it records the
-- photograph (`record_photo_upload()`'s trailing argument — `content`'s). The
-- album does not draw it today; the story does.
alter table public.photos
  add column caption text check (caption is null or char_length(btrim(caption)) between 1 and 100);

-- Whether the 1080 px `story` derivative exists; until it does a frame falls
-- back to the photograph itself.
alter table public.photos
  add column story_derivative_ready boolean not null default false;

-- A report that names a frame (REQ-STO-015).
alter table public.reports
  add column story_frame_id uuid references public.story_frames(id) on delete cascade;
alter table public.reports
  add constraint reports_story_frame_named_by_target
    check ((target::text = 'story_frame') = (story_frame_id is not null));
create index reports_org_story_frame on public.reports (org_id, story_frame_id) where story_frame_id is not null;

-- ═══ 7 · the bucket, and who may read it ══════════════════════════════════════

-- Private. 60 MB is enforced HERE, by Storage on the upload itself — the bytes
-- never pass through the app (REQ-STO-016). Objects live at
--   {org}/sessions/{session}/frames/{frame}/{source.ext | video.mp4 | poster.webp}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('story-media', 'story-media', false, 62914560,
        array['video/mp4', 'video/quicktime', 'video/webm', 'image/webp']);

-- The rendition and its poster — NEVER the source, which no client role reads.
-- The frame is looked up under the caller's own policies, so expiry, hiding,
-- cancellation and removal close the bytes exactly when they close the row;
-- staff, who read every frame, can play one in the moderation queue. The path
-- is compared as text: a cast would raise on a name that is not a uuid.
create policy "story_media_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'story-media'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (storage.foldername(name))[2] = 'sessions'
    and (storage.foldername(name))[4] = 'frames'
    and storage.filename(name) in ('video.mp4', 'poster.webp')
    and exists (
      select 1 from public.story_frames f
       where f.org_id = public.auth_org_id()
         and f.id::text = (storage.foldername(name))[5]
         and f.session_id::text = (storage.foldername(name))[3]
         and f.state = 'visible'
    )
  );
-- The grant this policy relies on is Supabase's own on storage.objects; stated
-- so invariant 6 is checked here and not assumed.
grant select on storage.objects to authenticated;

-- ★ The WRITE policy is not here: it calls `content`'s capture gate
-- (`story_capture_open()`), which is promoted with the tracks' functions in
-- the next migration. Until then nothing can be uploaded — the safe side.
