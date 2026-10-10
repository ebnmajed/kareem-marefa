-- 0221 · the lead's — wave 29, PR A (DEC-280 §1, §9; REQ-PRF-014, REQ-PRF-015). The avatar library.
--
-- Every member holds one of fifty library avatars, `<set>/<key>`, assigned at random across both sets when the row is
-- created and kept until the member picks another (PR B's sheet). A member with no photo is drawn as that avatar;
-- initials remain for an anonymised member, a CSV and a mail. ★ The owner at sync 1: «assign the random avatars to the
-- current users» — the backfill at the end does exactly that, and it runs once, on push.
--
-- ★ ONE RULE FOR EVERY WRITER. The key is assigned by a `before insert` trigger, so `provision_member()` (0005 …
--   0214), `add_member()` (0197, 0211) and anything written later are covered without touching any of them.
-- ★ THE LIST IS GENERATED. `src/lib/avatar-library.ts` is the one list; `tests/unit/avatar-library.test.ts` holds this
--   file's fifty, that file's fifty and `public/avatars/` equal. Adding an avatar is a migration and a DEC.
-- ★ `avatar_source` says which photo the one stored object is. Null exactly when `avatar_version` is null — a trigger
--   keeps the pair honest, so 0158's writers (which know nothing of it) stay correct: a copy they record is `google`.
--   PR B's upload sets `upload` itself.
-- ★ ADDITIVE: `main`'s app and worker on this schema do nothing different — they never select the two columns.
--
-- 03 §8.2 rows (tests/rls/avatar-library.test.ts):
--   | `COL-members.avatar_key.readable` | a member of the org reads it through the grant, the view and me() ✓ |
--   | `COL-members.avatar_key.no_update` | a member updating their own key directly ✗ (42501) |
--   | `CHK-members.avatar_key.library` | a key outside the library ✗ (23514) |
--   | `TRG-members_avatar.assigned_on_insert` | a new member holds a library key |
--   | `TRG-members_avatar.anonymised_clears` | anonymisation nulls the key and the source |
--   | `TRG-members_avatar.source_follows_version` | a recorded copy is `google`; a cleared copy has no source |
--   | `TRG-comments_broadcast.avatar_key` | the live payload carries the key, never a URL |

create type public.avatar_source as enum ('google', 'upload');

create function public.avatar_library() returns text[]
language sql immutable parallel safe set search_path = '' as $fn$
  select array[
    'characters/director',
    'characters/dop',
    'characters/sound',
    'characters/gaffer',
    'characters/makeup',
    'characters/wardrobe',
    'characters/editor',
    'characters/producer',
    'characters/script',
    'characters/actor',
    'characters/actress',
    'characters/runner',
    'characters/vfx',
    'characters/colorist',
    'characters/writer',
    'characters/scout',
    'characters/broadcast',
    'characters/casting',
    'characters/photographer',
    'characters/drone-pilot',
    'characters/animator',
    'characters/line-producer',
    'characters/host',
    'characters/critic',
    'characters/stylist',
    'objects/clapper',
    'objects/megaphone',
    'objects/film-camera',
    'objects/boom',
    'objects/light',
    'objects/scissors',
    'objects/hanger',
    'objects/dress-form',
    'objects/director-chair',
    'objects/reel',
    'objects/headphones',
    'objects/brush',
    'objects/storyboard',
    'objects/tape',
    'objects/audition',
    'objects/timecode',
    'objects/tripod',
    'objects/lav',
    'objects/gels',
    'objects/drone',
    'objects/monitor',
    'objects/spool',
    'objects/mirror',
    'objects/location',
    'objects/walkie'
  ]::text[]
$fn$;
comment on function public.avatar_library() is
  'DEC-280: the fifty library keys, <set>/<key>. Generated from src/lib/avatar-library.ts; never edited by hand.';

alter table public.members
  add column avatar_key    text check (avatar_key is null or avatar_key = any (public.avatar_library())),
  add column avatar_source public.avatar_source;

comment on column public.members.avatar_key is
  'DEC-280: the library avatar the member holds, <set>/<key>. Assigned at random on insert; null only once anonymised.';
comment on column public.members.avatar_source is
  'DEC-280: which photo the one stored object is (google | upload). Null exactly when avatar_version is null.';

create function public.random_avatar_key() returns text
language sql volatile parallel safe set search_path = '' as $fn$
  select (public.avatar_library())[1 + floor(random() * cardinality(public.avatar_library()))::int]
$fn$;
revoke execute on function public.random_avatar_key() from public, anon, authenticated;

-- Invoker, not definer: it only rewrites NEW.
create function public.members_avatar() returns trigger
language plpgsql set search_path = '' as $fn$
begin
  if new.anonymised_at is not null then
    -- A former member is initials over the tint (REQ-PRF-011, DEC-280 §1).
    new.avatar_key    := null;
    new.avatar_source := null;
    return new;
  end if;
  if new.avatar_key is null and (tg_op = 'INSERT' or old.anonymised_at is null) then
    new.avatar_key := public.random_avatar_key();
  end if;
  if new.avatar_version is null then
    new.avatar_source := null;
  elsif new.avatar_source is null then
    new.avatar_source := 'google';
  end if;
  return new;
end $fn$;
revoke execute on function public.members_avatar() from public, anon, authenticated, service_role;

create trigger members_avatar
  before insert or update of avatar_key, avatar_source, avatar_version, anonymised_at on public.members
  for each row execute function public.members_avatar();

-- The backfill — every current member who is not anonymised (DEC-280 §9). Each row draws its own key.
update public.members
   set avatar_key = public.random_avatar_key()
 where avatar_key is null
   and anonymised_at is null;
update public.members
   set avatar_source = 'google'
 where avatar_version is not null
   and avatar_source is null;

-- Readable as the version is (0157): the member tier, the view, me(). Never writable by a client — PR B's
-- definer functions are the one writer.
grant select (avatar_key) on public.members to authenticated;

create or replace view public.members_member_view
with (security_invoker = true) as
  select id, org_id, display_name, avatar_url, company_id, job_title, bio, org_role, created_at, avatar_version, avatar_key
    from public.members
   where status = 'active';

create or replace function public.me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'org_id', m.org_id, 'email', m.email, 'display_name', m.display_name,
    'avatar_url', m.avatar_url, 'company_id', m.company_id, 'job_title', m.job_title,
    'bio', m.bio, 'org_role', m.org_role, 'status', m.status,
    'leaderboard_opt_out', m.leaderboard_opt_out, 'created_at', m.created_at,
    'avatar_version', m.avatar_version,
    'avatar_key', m.avatar_key
  )
  from public.members m
  where m.auth_user_id = auth.uid()
$$;

-- The live comment carries the key beside the version, so a comment that arrives live draws the same avatar as the
-- first paint. ADD-ONLY: one key joins 0167's payload; nothing is removed, and still no URL (0155, DEC-099).
create or replace function public.comments_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row       record := coalesce(new, old);
  v_author    record;
  v_presents  boolean;
begin
  select m.display_name, m.avatar_version, m.avatar_key, c.name as company_name, c.team_color
    into v_author
    from public.members m
    left join public.companies c on c.id = m.company_id
   where m.id = v_row.author_id;
  select exists (
    select 1 from public.session_presenters sp
     where sp.session_id = v_row.session_id and sp.member_id = v_row.author_id and sp.accepted
  ) into v_presents;
  perform realtime.send(
    jsonb_build_object(
      'id', v_row.id,
      'sessionId', v_row.session_id,
      'parentId', v_row.parent_id,
      'authorId', v_row.author_id,
      'authorDisplayName', v_author.display_name,
      'authorAvatarUrl', null,
      'authorAvatarVersion', v_author.avatar_version,
      'authorAvatarKey', v_author.avatar_key,
      'authorCompanyName', v_author.company_name,
      'authorTeamColor', v_author.team_color,
      'authorIsPresenter', v_presents,
      'body', v_row.body,
      'mentions', to_jsonb(v_row.mentions),
      'createdAt', v_row.created_at,
      'editedAt', v_row.edited_at,
      'deletedAt', v_row.deleted_at
    ),
    tg_op,
    'session:' || v_row.session_id::text
  );
  return v_row;
end $$;
