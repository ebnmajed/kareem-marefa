# Views — the record and every read (plan)

Status: **draft, planning only — no code until the lead posts «plan approved»** · owner: the server half (`story-server`)
· branch `feat/views` · Refs: REQ-VEW-001 … 006, REQ-STO-010 (amended), DEC-297, M36.

The capture of a view on the device (the ≥ 50 % × ≥ 1 s observer, the batching, the count and the list on screen) is
`story-client`'s; everything from the request onward is this half. Tables, policies and grants are the lead's (0228);
this plan names them.

## 1 · THE CONTRACT (story-client builds to this)

### 1.1 · Recording — `POST /api/views`

```http
POST /api/views
content-type: application/json
{ "views": [ { "kind": "frame" | "post" | "recap" | "announcement", "id": "<uuid>", "completed": true? } ] }
```

- **1 – 50 entries** per request; `completed` only means something for a video frame («watched to its end») and is
  ignored for any other kind. A duplicate `(kind, id)` in one batch counts once (a `completed: true` wins).
- **`204`, empty body, always** when the batch is well formed — even if every entry was skipped (not visible, the
  caller's own, impersonation). The client never learns why an entry was skipped: a 204 says nothing about other
  members' subjects.
- `400 { error: "invalid_input" }` — malformed or > 50; `401 { error: "unauthenticated" }` — no member session
  (never a redirect: it is a beacon); `500 { error: "views_failed" }` — retry once, then drop (REQ-VEW-006).
- Send with `fetch(…, { keepalive: true })` or `navigator.sendBeacon` with a `Blob` of type `application/json` on
  `pagehide` / `visibilitychange: hidden`; both arrive as the same POST. No `x-locale` needed.
- ★ **One entry = one impression.** Send a subject once per time it came on screen (the observer's edge), not on every
  tick. The server also ignores a repeat of the same subject by the same member within **30 s** (a retried batch, a
  scroll back and forth) — it bumps nothing.
- The viewer's existing `recordStoryViewsAction` (a Server Action, `src/components/stories/actions.ts`) is **retired**
  in favour of this route (REQ-VEW-006). The DAL's `recordStoryViews()` goes with it.

### 1.2 · The count — folded into the DTOs the screens already read (no extra request, no N+1)

```ts
/** REQ-VEW-003 — null when nobody (else) has viewed: a count is never drawn at 0. */
export interface ViewCount {
  /** Unique viewers (reach), anonymised members excluded. ≥ 1. */
  count: number;
  /** The caller may open the list (REQ-VEW-004): an owner of the subject, or an admin/moderator. */
  canList: boolean;
}
```

Where it appears (one batched read per screen, §3.1):

| Surface | DTO | Field |
|---|---|---|
| the home feed — a session's post | `Feed` (`src/lib/dal/feed.ts`) | `views.post: Record<sessionId, ViewCount>` |
| the home feed — a recap | `Feed` | `views.recap: Record<sessionId, ViewCount>` |
| the home feed — an announcement | `Feed` | `views.announcement: Record<announcementId, ViewCount>` |
| the story viewer — a frame | the frames `stories.ts` returns (`sessions'` module — see §7) | `views: ViewCount \| null` on every frame |

A missing key in a `Record` means «no count to draw». (The feed carries maps rather than a field on each item because
the items come from three other modules' DTOs; `feed.ts` is the one place that merges them.)

### 1.3 · The list — `GET /api/views/{kind}/{id}` (on tap, only when `canList`)

```ts
export interface ViewerList {
  /** Newest first by the last time seen. At most 200 rows; `total` is the full reach. */
  viewers: { memberId: string; name: string; avatarHref: string | null; day: string /* "YYYY-MM-DD", org calendar */ }[];
  total: number;
}
```

- `200 ViewerList` · `404 { error: "not_found" }` — anyone who may not list it (not an owner, not staff), a subject
  they cannot see, or one that does not exist: one answer for all three · `400 invalid_input` · `401`.
- `cache-control: no-store`. Name and avatar only, a day and nothing finer (REQ-VEW-004); `avatarHref` from the one
  resolver (`avatarHref()`, `src/components/privacy/avatar-href.ts`). Anonymised members are not in it.

## 2 · THE STORAGE (the lead's 0228 — named here)

### 2.1 · One enum for the four subjects

```sql
create type public.view_subject as enum ('frame', 'post', 'recap', 'announcement');
```

`post` and `recap` are both a session (its id), counted separately: the feed shows a session as a post until it ends
and as a recap after, and the two are different things a member saw.

### 2.2 · `story_views` (0198) gains three columns

| Column | Type | Meaning |
|---|---|---|
| `viewed_at` (exists) | `timestamptz not null default now()` | **first seen** — kept, never moved |
| `last_seen_at` | `timestamptz not null default now()` | the last impression |
| `times_seen` | `integer not null default 1 check (times_seen >= 1)` | impressions |
| `completed_at` | `timestamptz null` | a video frame watched to its end — the first time it was (null for a photo or a text frame) |

Backfill: `last_seen_at = viewed_at`, `times_seen = 1`. ★ **Its insert policy and its `insert` grant go** — every write
is the definer function now (DEC-297 §2); `story_views_read_own` stays (the ring's «seen», `stories.ts`). The PK
`(member_id, frame_id)` and `story_views_frame_id_idx` (0212) stay.

### 2.3 · `content_views` — the other three subjects, one table

| Column | Type | |
|---|---|---|
| `org_id` | `uuid not null references orgs on delete cascade` | invariant 5 |
| `member_id` | `uuid not null references members on delete cascade` | the viewer |
| `kind` | `public.view_subject not null` | `check (kind <> 'frame')` |
| `session_id` | `uuid null references sessions on delete cascade` | for `post` / `recap` |
| `announcement_id` | `uuid null references feed_announcements on delete cascade` | for `announcement` |
| `subject_id` | `uuid generated always as (coalesce(session_id, announcement_id)) stored` | the key |
| `first_seen_at` | `timestamptz not null default now()` | |
| `last_seen_at` | `timestamptz not null default now()` | |
| `times_seen` | `integer not null default 1 check (times_seen >= 1)` | |

- `check ((kind in ('post','recap')) = (session_id is not null))`, `check ((kind = 'announcement') = (announcement_id is not null))`.
- **PK `(member_id, kind, subject_id)`**; index `(org_id, kind, subject_id)` for the counts and the list.
- Real foreign keys rather than a bare polymorphic id, so a subject's deletion takes its views with it (the session's
  hard delete, `0215`; an announcement's delete).

### 2.4 · Policies and grants (invariant 5 and 6)

| Table | Policy | Grant |
|---|---|---|
| `content_views` | `content_views_read_own` — `select` where `org_id = auth_org_id() and member_id = auth_member_id()` | `select` to `authenticated` |
| `content_views` | **no** insert / update / delete policy — written only by `record_views()` | none; `revoke all … from anon, authenticated, service_role` |
| `story_views` | `story_views_read_own` (kept); `story_views_insert_own` **dropped** | `insert` **revoked**; `select` kept |

No member reads another member's row, staff included — the count and the list leave only through the two definer
functions in §3. Fixture rows for the isolation sweep: one `content_views` row per org per kind (`tests/rls/fixture.ts`,
the lead's).

## 3 · THE FUNCTIONS (mine, under `supabase/proposed/content/`, promoted by the lead)

### 3.1 · `record_views(p_views jsonb) returns integer` — the one write

`security definer`, `set search_path = ''`, `execute` to `authenticated` only. Returns how many entries it recorded (the
route ignores it; the tests read it).

1. **Refuse nothing, skip silently** — returns 0 and writes nothing when `auth_member_id()` is null (an impersonation
   session mints no `member_id`, `0069`/`0212`) **or** the claims carry `app_metadata.impersonation` (belt and braces),
   or the member is not active.
2. For each distinct `(kind, id)` (≤ 50, the function caps it too), **re-derive** that the caller may see it **now**,
   mirroring the read policies exactly:
   - `frame`: the row is in the caller's org and `story_frame_is_visible(f)` (0198 — visible, inside 24 h, session not
     cancelled, photograph visible). A staff member's look at an expired frame in the moderation strip is not a view.
   - `post`: `sessions` in the caller's org, `deleted_at is null`, state ∈ `published, in_progress, completed,
     archived, cancelled` (`sessions_read`, `0215`) — or the caller is staff or a presenter of it.
   - `recap`: as `post`, **and** state ∈ `completed, archived` (only an ended session has a recap).
   - `announcement`: `feed_announcements` in the caller's org, `published_at <= now()`, not expired
     (`feed_announcements_read_published`, `0164`). An admin's look at a draft in the console is not a view.
3. **Skip the caller's own subject** (§4): the frame's author; for a generated frame, a post or a recap, an accepted
   presenter of the session; the announcement's author.
4. **Upsert**: insert with `first_seen_at`/`viewed_at = last_seen_at = now()`, `times_seen = 1`; on conflict
   `last_seen_at = now(), times_seen = times_seen + 1` **only when the existing `last_seen_at < now() - 30 s`** (a
   retried batch is idempotent). `completed_at = coalesce(completed_at, now())` when `completed` and the frame is a
   video.

### 3.2 · `view_counts(p_kind view_subject, p_ids uuid[]) returns table (subject_id uuid, viewers integer, can_list boolean)`

`security definer`, `stable`. For each id the caller can **see** (the same predicate as §3.1 step 2, plus: staff see
every frame of the org, as `story_frames_staff_read`), the number of distinct viewers whose member row is not
anonymised (`members.anonymised_at is null`); a row is returned only when `viewers ≥ 1`. `can_list` is §4's rule. One
grouped query per call — the feed calls it three times (post, recap, announcement ids), the viewer once.

### 3.3 · `view_list(p_kind view_subject, p_id uuid, p_limit integer default 200) returns table (member_id uuid, display_name text, avatar_key text, avatar_version integer, seen_on date)`

`security definer`, `stable`. Raises `42501` unless the caller may see the subject (§3.1 step 2) **and** `can_list`
(§4). Rows: the viewers, anonymised excluded, newest first by `last_seen_at`, `seen_on` = the date of `last_seen_at`
in the org's time zone (`org_settings.time_zone`) — no time finer than the day leaves the database. The DAL turns
`(member_id, avatar_key, avatar_version)` into `avatarHref` through the resolver.

## 4 · «OWNER» — how it is derived, per kind (one rule, DEC-297 §4)

`can_list = is_staff() or is_owner(kind, id)`, where `is_staff()` is the existing admin-or-moderator helper and:

| Kind | Owner | From |
|---|---|---|
| `frame`, an attendee's (`author_id is not null`) | its author | `story_frames.author_id = auth_member_id()` |
| `frame`, a generated one (`author_id is null`) | the session's accepted presenters | `is_presenter_of(f.session_id)` (`0010`: `session_presenters.accepted`) |
| `post`, `recap` | the session's accepted presenters | `is_presenter_of(session_id)` |
| `announcement` | its author | `feed_announcements.author_id = auth_member_id()` |

The same function is step 3's «own subject» test, so a presenter's view of their own session is never counted and a
presenter always may list it. (A co-presenter added later sees views recorded before they were added — the list is
the subject's, not the presenter's.)

## 5 · PRIVACY PLUMBING

- **Anonymisation** (`anonymise_member()`, latest in `0223` — SQL, so the lead's 0228): add
  `delete from public.story_views where member_id = m.id; delete from public.content_views where member_id = m.id;`
  beside `member_seen_marks`' delete — the member leaves every list and every count (REQ-VEW-004). ★ Today
  `story_views` is **not** deleted there (only on a hard member delete) — 0228 closes that too. The read functions
  also exclude `anonymised_at is not null`, so a member is out of the counts from the moment the row is rewritten.
- **The export** (`build_data_export_payload()`, latest in `0135`): a `views` array of the member's **own** rows from
  both tables — `kind`, the subject's id and title/body excerpt where the member can still see it, `first_seen`,
  `last_seen`, `times_seen`, `completed` — their own data, so full timestamps. Never anyone else's view of their
  subjects (that is the list, and other members' data).
- **Retention**: a view lives as long as its subject and its member — cascades on the frame (with its session),
  the session (`0215`'s hard delete), the announcement, and the member's anonymisation or deletion. No separate period
  in `retention_periods`: `story_views` has none today, and a view is no older than the thing viewed. (If the owner
  wants one, `enforce_retention` gains a line — named, not proposed.)
- **The notice and the privacy page** (REQ-VEW-005) are copy — `story-client`'s or the privacy page's owner's; not
  this half.

## 6 · TESTS

**RLS** (`tests/rls/views.test.ts`, new, through `applyProposed()` against the lead's 0228 tables), as a member, never
as the owner:
- isolation: org B's member records nothing on org A's subjects, sees no count, gets `42501` from the list;
- a member cannot `select` another member's row in either table, nor `insert`/`update`/`delete` any row directly
  (`42501`), staff included;
- `record_views` on each kind: visible ✓; a draft session, an expired frame, a hidden frame, an unpublished or expired
  announcement, a deleted session ✗ (0 recorded);
- the own subject is not counted: an attendee frame by its author, a post/recap/generated frame by a presenter, an
  announcement by its author;
- impersonation is not counted: claims with `impersonation` and no `member_id` → 0, no row;
- the 30-second rule: two calls → `times_seen = 1`; with `last_seen_at` moved back 31 s → 2; first seen unmoved;
- `completed` sets `completed_at` once, on a video frame only;
- `view_counts`: the right reach, no row at 0, an anonymised viewer drops out, a subject the caller cannot see returns
  nothing, `can_list` true for the author / a presenter / admin / moderator and false for a member;
- `view_list`: the owner and staff get name/avatar/day newest first, a non-owner member `42501`, no column finer than a
  date, anonymised excluded;
- anonymisation deletes the member's rows in both tables; the export carries the member's own views and nobody
  else's.

**Unit** (`tests/unit/views-route.test.ts`): Zod refuses > 50, an unknown kind, a non-uuid; a duplicate is collapsed;
the route answers 204 whatever the function recorded, 401 without a session (no redirect), 500 → `views_failed`; the
list route's 404 for a refusal and `no-store`.

## 7 · WHAT I NEED FROM OTHERS

- **The lead**: 0228 as §2 (enum, three columns + backfill on `story_views`, `content_views`, policies, grants, the
  dropped insert policy/grant, fixture rows) and the two deletes in `anonymise_member()`, the export's `views` key.
- **`stories.ts`** (`sessions'` module): each frame gains `views: ViewCount | null` from one `view_counts('frame', ids)`
  call. I can write it if the lead grants me that one function's field for this feature, or `sessions` does; either
  way the type is §1.2's.
- **`story-client`**: the observer, the batch, the beacon, `POST /api/views`; drawing «N» from `ViewCount` (never at
  0) and the list sheet from `GET /api/views/{kind}/{id}` when `canList`; the switch off `recordStoryViewsAction`.

## 8 · THE DEVICE AND THE SCREENS — `story-client`'s plan (PLANNING ONLY until «plan approved»)

Refs: REQ-VEW-001 … 006, REQ-STO-010, DEC-297, DEC-093. Built to §1 (story-server's contract); where this section
names a shape, §1 wins. Subsections are numbered 8.x.

### 8.1 · The tracker — one module, one observer, no re-render

- **`src/components/views/tracker.ts`** (new, plain TS, no React): a module-level singleton created lazily on the
  first registration in the browser.
  - **One `IntersectionObserver`** for the page, `threshold: [0, 0.5]`. An element reaching **≥ 50 %** starts a
    1-second timer for its subject; dropping below 50 % (or leaving the page) cancels it. When the timer fires the
    subject is **seen**: queued once and never again in this page life (a `Set` of `kind:id`). ★ §1.1 allows one entry
    per time a subject comes on screen; the lead's brief says once per page life — **this plan takes the brief's**
    (fewer requests, and a feed scrolled back and forth is not two impressions). The server's 30-s guard is the
    backstop either way.
  - **The page must be visible**: a timer only runs while `document.visibilityState === "visible"`; hiding the tab
    cancels pending timers (a phone in a pocket views nothing).
  - **Batching**: queued entries `{ kind, id, completed? }` are flushed **every 4 s** if the queue is non-empty, at
    most 50 per request, through `fetch("/api/views", { method: "POST", keepalive: true, credentials: "same-origin" })`.
    On **`pagehide`** and on **`visibilitychange → hidden`** the queue is flushed at once with
    `navigator.sendBeacon("/api/views", new Blob([json], { type: "application/json" }))`, falling back to the keepalive
    fetch when `sendBeacon` is missing or returns false.
  - **One retry, then drop** (REQ-VEW-006): a failed fetch (network error or 5xx) is re-queued once with a `retried`
    mark; a second failure, or any 4xx, drops the batch silently. Nothing is ever shown to the member.
  - **API**: `observeSubject(el, subject) → unobserve()`, `markShown(subject)` (the story viewer: shown = seen, no
    geometry), `markCompleted(subject)` (a video reached its end), and `flushNow()` for tests. `subject` is
    `{ kind: "frame" | "post" | "recap" | "announcement"; id: string }` — §1.1's kinds.
  - **No React state anywhere**: nothing in the tracker sets state, so a view never re-renders the feed. **No Server
    Action** (REQ-VEW-006).
- **`src/components/views/view-subject.tsx`** (new, `"use client"`): `<ViewSubject kind id>{children}</ViewSubject>`
  renders one block `div` (`data-view-subject`) around a feed item, registers it in an effect, unregisters on unmount.
  The children stay Server Components (a ReactNode crosses the boundary; no closure does — DEC-159).

### 8.2 · Where it is wired

| Subject | Where | How |
|---|---|---|
| a session post | `src/components/feed/feed.tsx` | `<ViewSubject kind="post" id={post.id}>` around `<SessionPost>` |
| a recap | same | `<ViewSubject kind="recap" id={post.id}>` around `<RecapPost>` |
| an announcement | same | `<ViewSubject kind="announcement" id={announcement.id}>` around `<Announcement>` |
| a story frame | `src/components/stories/story-host.tsx` | `onFrameShown` → `markShown({ kind: "frame", id })` — **replacing `recordStoryViewsAction`** (a Server Action, which REQ-VEW-006 forbids; the views flush timer and queue in the host go with it). The ring's «seen» stays local state as today. |
| a video frame watched to its end | `src/components/stories/frames.tsx` | the frame's `<video onEnded>` → `markCompleted({ kind: "frame", id })` |

The wrapper is a plain block in the feed's flex column, so the column's gap and every item's layout are unchanged
(the `article` is still the item's root inside it); `tests/unit/feed-classes.test.ts` is untouched.

### 8.3 · The count, and who viewed

- **Glyph**: `docs/design/` has no view mark; `ui/icons`' existing **`EyeIcon`** is used (no new glyph, no emoji).
- **`src/components/views/view-count.tsx`** (new, `"use client"`): `<ViewCount kind id views labels />` with
  `views: ViewCount | undefined` (§1.2). The feed passes `feed.views.post[sessionId]`, `feed.views.recap[sessionId]`
  and `feed.views.announcement[id]` (a missing key draws nothing); the story host passes the frame's `views`.
  - **Nothing at all** when `views` is null/undefined or `count < 1` (REQ-VEW-003).
  - Otherwise the eye and the number — `<bdi>`, Western numerals through `formatNumber` — and an accessible name with
    **six ICU plural forms**: ar `{count, plural, zero {لم يشاهده أحد} one {شاهده عضو واحد} two {شاهده عضوان}
    few {شاهده {value} أعضاء} many {شاهده {value} عضوًا} other {شاهده {value} عضو}}` · en `{count, plural, one {Seen by
    one member} other {Seen by {value} members}}`.
  - **`canList: false`** → static text (`<span>`), not a control: everyone sees the count, nobody else is offered a list.
  - **`canList: true`** → a button (44 px target) that opens **`ui/sheet`** (bottom, `ui/sheet`'s own) titled
    «شاهدوه» (ar) / «Seen by» (en). The list is fetched when the sheet opens from §1's `GET /api/views/{kind}/{id}`:
    each row `Avatar` (the existing `ui/avatar`, `src` = §1.3's `avatarHref`, initials when null) + the name in `<bdi>`
    + the day
    («15 أكتوبر», `Intl` with `-u-nu-latn`, never a time — REQ-VEW-004), newest first as served; when `total` exceeds the rows shown, one closing line «و{n} غيرهم» (six ICU forms). Loading draws the
    sheet's rows as `ui/skeleton`; a failure says «تعذّر» in one word with nothing else. **No new primitive.**
- **Placement**:
  - **session post** (`session-post.tsx`): in the reactions row, after the like and comments, before share/bookmark;
  - **recap** (`recap-post.tsx`): beside the like in the `reactions` slot it already passes to `ui/feed-item`;
  - **announcement** (`announcement.tsx`): ★ `ui/feed-item`'s announcement variant has **no slot** — an add-only
    `footer?: ReactNode` on `FeedItemAnnouncementProps` (index.ts, the lead's) and its one line in `feed-item.tsx`
    (mine), drawn under the body;
  - **story frame** (`story-host.tsx` → `ui/story-viewer`): ★ an add-only per-frame
    `views?: ReactNode` on the frame type (index.ts, the lead's), drawn in the viewer's bottom row at the inline-start of
    the reactions, hidden with the rest of the chrome while held. While the list sheet is open the viewer's clock holds
    (the host passes `paused`, as the report sheet already does).

### 8.4 · The privacy line (REQ-VEW-005)

One caption line under the photographs row on `/app/me/privacy`, Arabic first, in `privacy.json` (`page.viewsNote`):

- ar: **«يرى صاحب القصة أو المنشور أو الإعلان والمشرفون أنك شاهدته.»**
- en: **"Whoever posted a story, a post or an announcement, and staff, can see that you viewed it."**

It is drawn with the page's existing caption style beside the export note, and nowhere else changes on the page.

### 8.5 · Files

- **New, mine**: `src/components/views/{tracker.ts,view-subject.tsx,view-count.tsx}`, `src/messages/{ar,en}/views.json`
  (new namespace — **the line in `src/messages/index.ts` is the lead's**, append-only),
  `tests/components/views/{tracker,view-count,view-subject}.test.tsx`, `tests/e2e/views-*.spec.ts`.
- **Edited, mine**: `src/components/feed/{feed,session-post,recap-post,announcement}.tsx`,
  `src/components/ui/feed-item.tsx` (the `footer` line), `src/components/ui/story-viewer.tsx` (the `views` slot),
  `src/components/stories/{story-host,frames}.tsx`, their tests/demos (`feed-item` and `story-viewer` demos show a
  count), `tests/components/feed/**`, `tests/components/ui/{feed-item,story-viewer}*`.
- **Granted for one line**: `src/app/[locale]/app/me/privacy/page.tsx` and `src/messages/{ar,en}/privacy.json`
  (`page.viewsNote`).
- **Requested of the lead**: `src/components/ui/index.ts` — `FeedItemAnnouncementProps.footer?: ReactNode` and the
  story frame's `views?: ReactNode`; `src/messages/index.ts` — the `views` namespace.
- **Not touched**: §1's route, functions, DAL and DTO additions (story-server's); `ui/sheet`, `ui/avatar`,
  `ui/skeleton` (composed as they are).

### 8.6 · Tests

- **Component** (`tests/components/views/`): the tracker with a mocked `IntersectionObserver` and fake timers — 49 %
  never counts, 50 % for 999 ms does not, 50 % for 1 s does, once per page life; a hidden page counts nothing;
  batching (several subjects → one POST, at most 50), the 4-s flush, `pagehide` → `sendBeacon`, keepalive fallback,
  one retry on 5xx then drop, no retry on 4xx; `markShown` and `markCompleted`. `ViewSubject` registers and
  unregisters. `ViewCount`: nothing at 0 or null, `<bdi>` + Western digits, the six ICU forms of the label, static
  when `canList` is false, a button that opens the sheet with the fetched list (avatar, name, day only) when true.
  The story host sends frames through the tracker and never calls `recordStoryViewsAction`.
- **E2E** (`tests/e2e/views-counts.spec.ts`, local Supabase): two members see a post, a recap, an announcement and a
  story frame; a third member sees «2» on each and no list; the presenter/author and an admin see the count and the
  list of the two (names, the day), newest first; the author's own view is not counted; nothing is drawn at 0.
