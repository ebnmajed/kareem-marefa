# notes — `content` teammate (wave 2, M5)

Working notes for the MAT / TSK / photos (EVT-009…015) / DSC track. Not a plan document —
`01-prd.md` defines, `07-content-pipeline.md` describes the pipeline, `02`/`03` are frozen for the
schema and the policy shape; this file only records how I am building it. Append as I go.

---

## 0. Reading order and what I found before writing anything

Read, in order: `STATUS.md` (wave 2 section), `CLAUDE.md` § Agent team + the invariants table,
`DECISIONS.md` DEC-005, 006, 009, 031, 032, 040…046, `TEAM.md` §1–3, §5, `07-content-pipeline.md`
whole, `03-permissions-rls.md` §2 (helpers), §5.5, §5.6c/d, §6, §8.2, `02-domain-model.md` §3, §4.2,
§4.6, §4.7, §4.15, §7, `11-background-jobs.md` §2.4, `01-prd.md` MAT/TSK/EVT-009…015/DSC/PRO-004,
`15-backlog.md` STORY-MAT-*/TSK-*/DSC-*/EVT-005-006, `notes/sessions.md` §2.1, `notes/event.md`.

**Two things worth flagging up front, before the schema:**

**0.1 — `tags`, `session_tags` and `bookmarks` do not exist anywhere yet.** `02` §4.2 lists
`ENT-tags`/`ENT-session_tags` under "Taxonomy and venues" next to `categories`/`venues`, which
*sounds* like wave-0 (M1 tenancy) territory, but neither migration `0004` (tenancy) nor `0010` (M2
schema) created them — only `categories` and `venues` did. They serve `REQ-DSC-002`/`REQ-DSC-006`,
which are mine. So they are part of my first proposed file, not a gap in someone else's.

**0.2 — Three forward references `0010` already left for me, on purpose:**
- `reports.photo_id uuid` — bare, no FK, comment `-- M5 adds the reference`. I add the constraint.
- `has_checked_in()`, `is_presenter_of()` — already defined and already granted
  (`grant execute on function public.is_presenter_of(uuid), public.has_checked_in(uuid) to
  authenticated, anon, service_role`), so photo and material-version writes use them as-is.
- `public.enqueue_job()` (`0025`) — the only door to the queue; my jobs enqueue through it, and
  until then a `TODO(content)`-style call site is fine (there is no `notify()` dependency in my
  jobs the way `scoring`/`notify` have — no notification is required by any `REQ-MAT-*`/`REQ-TSK-*`
  acceptance in this first schema pass; `REQ-TSK-005` reminders are `notify`'s job body, not mine).

**0.3 — `sessions.search_vector` is an `alter table` on a table I do not own the app code for.**
Same pattern as `reports.photo_id`: additive schema DDL, not app code, permitted under DEC-046's
"hooks into M2 are SQL only." `REQ-DSC-003`/`004` cannot exist without it. Flagged here for the
lead the way `sessions`/`event` flagged their own cross-cutting SQL.

---

## 1. First proposed file — `supabase/proposed/content/0001_m5_schema.sql`

**Serves:** `02` §4.6 (materials, tasks), §4.7 (photos — `photos`, `photo_takedowns`, the
`reports.photo_id` FK), §4.2 + §4.15 (tags, session_tags, bookmarks, search) · `03` §5.5, §5.6c,
§6 · `REQ-MAT-001`…`012`, `REQ-TSK-001`…`005`, `REQ-EVT-009`…`014` (schema half), `REQ-DSC-001`…
`007`.

### 1.1 Tables, in the order they appear in the file

`materials` → `material_versions` → `material_pages` (circular FK on
`materials.current_version_id` resolved with an `alter table … add constraint` once
`material_versions` exists, same trick `0010` used for `reports.photo_id`) → `session_tasks` →
`task_completions` → `task_form_responses` → `photos` → `photo_takedowns` → the `reports.photo_id`
FK → `tags` → `session_tags` → `bookmarks` → `ar_normalize()` + `sessions.search_vector` +
its two indexes.

Every table carries `org_id not null` per `02` §7 — there is no fifth exception here.

### 1.2 Policies copied verbatim from `03`, not reinvented

Three policies already have literal SQL written in `03` (a `settled` document) even though no
migration implements them yet — I copied them rather than re-deriving the logic:

- `materials_read` — §5.5a, the phase gate.
- `responses_read` — §5.5b, presenter/admin/self on `task_form_responses`.
- `photos_insert_checked_in` — §5.6c, the check-in gate + `exif_stripped` conjunct.

### 1.3 Policies I designed from the P1–P8 patterns (`03` §4) plus the per-table summary rows
(`03` §5.5, §5.6), because `03` gives the shape ("P8 + P2", "P7 + presenter") but not the SQL

| Table | select | insert | update | delete |
|---|---|---|---|---|
| `materials` | §5.5a (copied) | P8 | `materials_update_presenter` + `materials_update_admin` (see §1.4) | P2 (hard delete, admin only — soft-remove is the update path) |
| `material_versions` | "follows parent" — joins to `materials`/`sessions` and repeats §5.5a's exact predicate | P8 (via a join: `is_presenter_of` on the parent material's `session_id`) | — | — |
| `material_pages` | "follows parent" — same join, **no `allow_download` conjunct** (07 §6: page images are identical either way) | — (worker only, via a future `SECURITY DEFINER` RPC, never a raw grant — CLAUDE.md data-access rule 6) | — | — |
| `session_tasks` | P1 | P8 | P8 (adapted: both `using` and `with check`) | P8 |
| `task_completions` | `member_id = self` **or** presenter-of-the-task's-session (no staff — `03` §5.5 names only "P7 + presenter", and I did not add what is not written) | P3 | P3 | P3 |
| `task_form_responses` | §5.5b (copied) | P3 | P3 | — |
| `photos` | P1 restricted to `hidden_at is null`, **plus `is_staff()`** (a moderator resolving a takedown has to be able to see the hidden row — otherwise `photo_takedowns` "staff read" is pointless) | §5.6c (copied) | P6 (`hidden_at`, `hidden_reason`, `removed_at`, `removed_by`) | — |
| `photo_takedowns` | staff or `requester_id = self`, **plus a `with check` sub-select proving the photo is the caller's own org** (same defensive shape as `ratings_write_self`'s `check_in_id` sub-select) | P3 | P6 (`resolved_at`, `resolution`, `resolved_by`) | — |
| `tags` | P1 | P2 | P2 | P2 (see §1.6 for why I extended this past categories/venues) |
| `session_tags` | P1 | presenter-of-session or admin | — | presenter-of-session or admin |
| `bookmarks` | P7 | P3 | — | P3 |

### 1.4 Two triggers, same reason `comments_guard` exists: a `using`/`with check` clause cannot
express a rule that depends on the *old* row, another table, or "who is allowed to touch this
column right now"

**`materials_guard()`** (`before update`, `security definer`): `session_id`, `kind`, `added_by` are
immutable; setting `removed_at` is refused with `23514` if the session is `completed`/`archived`
**unless** the caller is an org admin (`REQ-MAT-008`: "Presenters can remove their own before the
session completes. Admins can remove any material" — an admin's remove is not time-boxed);
`removed_by` is stamped from `auth_member_id()`, never trusted from the client.

**`photo_takedowns_hide()`** (`after insert`, `security definer`): sets `photos.hidden_at`/
`hidden_reason` the instant a takedown row lands — `REQ-EVT-012`'s "before any human sees the
request", structurally, the same way `photo_takedowns` insert hides "by trigger" is written in `07`
§9.3 and `02` §4.7. It runs as the trigger's owner, so it does not need — and does not get — a
column grant letting the requester write `photos.hidden_at` themselves.

**`photo_takedowns_guard()`** (`before update`, `security definer`): stamps `resolved_by`; when
`resolution = 'restored'`, clears `hidden_at`/`hidden_reason` on the photo. **`resolution =
'removed'`/`'dismissed'` do nothing at the schema level yet** — `07` §9.3 only specifies the
restore path ("a moderator can restore it if the request was mistaken"); the removal audit row and
`05` §2.4's compensating ledger entry are `REQ-EVT-014`'s and belong to `STORY-EVT-006`'s RPC, not
this schema pass. Flagged here the way `event`'s notes flag its own deferred half.

### 1.5 The one real design call worth a second opinion: materials storage reads join back to
Postgres, not just an org prefix

`03` §6's own sample policy for the `materials` bucket only checks the org prefix. But `materials`
and `material-pages` are the two buckets where **phase gating and `allow_download`** matter
(`07` §6, §8), and if a Route Handler ever mints a signed URL using the caller's own JWT rather
than `service_role` (which it must — `service_role` is never on Vercel, invariant 7), then
`storage.objects` RLS is the actual boundary at the moment the URL is created, not a UI nicety.
So `materials_storage_read`/`material_pages_storage_read` join `storage.objects` to
`material_versions → materials → sessions` and repeat §5.5a's exact visibility predicate (plus
`allow_download` for the `materials` bucket only, never for `material-pages`). This is *more*
defensive than the literal `03` §6 sample, not a deviation from it — `03`'s honest-weakness section
already says the org-prefix check is a floor, not a ceiling. **This might deserve a `DECISIONS.md`
entry or a `03` §6 correction the way `event` found one for the Realtime host topic** — the lead's
call, flagged here per the note-taking convention.

**What this schema pass does *not* prove:** "no signed URL is ever minted" when `allow_download`
is off is fundamentally a Route Handler behavior (it never calls the signing API), not something
RLS can assert — RLS can only prove that *if* something asked, it would be refused. The Route
Handler test for STORY-MAT-004 is where the literal invariant gets its real proof; this migration
gives it a second, independent floor.

### 1.6 One judgment call on `tags`, past what `03`'s matrix says

`03` §3's role matrix groups `tags` with `companies`/`categories`/`venues` (read: everyone, write:
admin), and `03` §8.2 gives `companies`/`categories`/`venues` update but explicitly **no delete**
(`REQ-ADM-006`, "no role can delete one"). I gave `tags` a delete policy that the other three don't
get. Reason: `companies`/`categories`/`venues` are referenced by leaderboards and sessions in ways
that make a delete corrupt history; a free-form tag with no downstream leaderboard is exactly the
kind of thing an admin needs to merge/delete typos out of (`REQ-DSC-002`'s "near-duplicates
merge"). **Flagging this rather than asserting it quietly** — if the lead disagrees, dropping the
delete policy is a one-line diff and the test for it comes out with it.

### 1.7 CI's shim — exactly what I need `scripts/ci/roles.sql` to gain (lead-only file)

CI's bare Postgres container has no `storage` schema at all (confirmed: no `create schema storage`
anywhere in `supabase/migrations/`, and `03` §6's own policies have never been promoted before —
this is the **first** migration to touch `storage.objects`). Introspected the real shape from local
Supabase (`127.0.0.1:54322`) rather than guessing, the same way the `realtime` shim was built
(DEC-044's pattern):

```sql
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id                 text primary key,
  name               text not null unique,
  owner              uuid,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

create function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts,1) - 1];
end $$;

create function storage.filename(name text) returns text
language plpgsql as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts,1)];
end $$;

grant select, insert, update, delete on storage.buckets, storage.objects
  to anon, authenticated, service_role, postgres;
```
(Table shapes and function bodies are copied verbatim from local Supabase's real ones — I did not
invent the split logic.) My migration's own `insert into storage.buckets (...)` and `create policy
… on storage.objects` statements need nothing more than this to apply cleanly.

### 1.8 `03` §8.2 rows this file adds

| Policy | Test |
|---|---|
| `POL-materials.select.phase` | An `after` material is invisible to a member until the session is `completed`; visible to the presenter throughout. |
| `POL-materials.insert.presenter` | A member who is not a presenter cannot add a material. |
| `POL-materials.update.window` | A presenter removes their own material before completion; the same presenter is refused after completion; an admin removes it anyway. |
| `POL-materials.hard_delete.admin_only` | A member and a presenter are refused a hard `delete`; an admin succeeds. |
| `POL-material_versions.select.phase` | Follows the parent material's phase gate exactly. |
| `POL-material_pages.select` | No rows exist for a Keynote material (DEC-006); follows the parent's phase gate with no `allow_download` conjunct. |
| `POL-session_tasks.write.presenter` | A member who is not a presenter cannot insert, update or delete a session task; the presenter and an admin can. |
| `POL-task_form_responses.select` | A moderator reading form responses gets nothing (`REQ-ADM-020`). |
| `POL-photos.insert.checked_in` | A member with a confirmed RSVP and no check-in is rejected; the same member, after checking in, succeeds. |
| `POL-photos.insert.exif` | Inserting with `exif_stripped = false` is rejected by the table constraint. |
| `POL-photo_takedowns.insert` | Inserting hides the photo in the same transaction, before any other read. |
| `POL-photo_takedowns.restore` | A moderator resolving with `restored` unhides the photo; `resolved_by` is stamped, never trusted from the client. |
| `POL-photos.select.hidden` | A hidden photo is invisible to a member, visible to staff. |
| `POL-tags.insert.admin` · `POL-tags.delete.admin` | A member's insert is rejected; an admin's succeeds; a moderator cannot delete a tag, an admin can. |
| `POL-session_tags.write.presenter` | A non-presenter member cannot tag a session they do not present; the presenter and an admin can. |
| `POL-bookmarks.self` | A member reads and writes only their own bookmarks; another member's bookmark is invisible. |
| `POL-search.ar_normalize` | «معرفات» and «مُعرِّفات» normalise to the same string; «إدارة» and «ادارة» too. |
| `POL-storage.materials.prefix` | An authenticated write to another org's prefix is rejected. |
| `POL-storage.materials.download` | With `allow_download = false`, the joined `materials` bucket read policy denies a member (but not the presenter or staff). |
| `POL-storage.material_pages.phase` | An `after` page image is denied to a member before completion, regardless of `allow_download`. |
| `POL-storage.photos.hidden` | A hidden photo's object is denied to a member, permitted to staff. |
| `POL-storage.exports.write` | An authenticated client cannot write to `exports`; only `service_role` can (bypassrls, not a policy). |
| `POL-storage.fonts.read` | Any authenticated member reads the `fonts` bucket with no org prefix required. |

### 1.9 Test file

`tests/rls/content-schema.test.ts`, `applyProposed(tx, "content/0001_m5_schema.sql")` inside each
test's rolled-back transaction, same shape as `realtime.test.ts`. Uses `seed(tx)` — `f.m2.a.published`
(presenter = `members[0]`, attendee `members[1]` confirmed + checked in), `f.m2.a.completed`
(`members[1]` checked in, already rated) — so no new fixture file was needed for this pass.

---

## 2. What is next, in the order `15-backlog.md` lists it

`src/lib/storage/` (the one path builder, unit-tested — no route or job builds a path any other
way, per the lint-rule intent in `03` §6) → **STORY-MAT-001** (`api/upload/material`, sniffed on
content, SVG-as-`.png` rejected, size limits named) → **MAT-002** (`convert_document`,
`render_pages`, the record-conversion-result `SECURITY DEFINER` RPC `material_pages`/
`render_status`/`font_substitution_warning` need, SCR-013 the viewer with RTL arrow keys) →
**MAT-003** (Keynote messaging) → **MAT-004** (download control route, phase gating already proven
above) → **MAT-005** → **MAT-006** → **EVT-005/006** (photo upload route, EXIF strip before the row
exists, the takedown UI, realtime for the gallery) → **TSK-001/002** → **DSC-001/002/003** →
`REQ-PRO-004` (draft materials on a proposal — small once `materials` exists: attach on SCR-017,
admin-only until publication).

## 3. Status at handoff

Schema promoted as `supabase/migrations/0037_m5_schema.sql`; the takedown's uploader notice
(`REQ-EVT-012`, `MSG-photo_hidden`) followed as `0043_photo_hidden_notify.sql`. `docs/plan/notes/
content.md` §1.4/§1.4a cover two real Postgres gotchas found and fixed along the way — worth
reading before touching `remove_material()` or any future composite-returning RPC:

- **materials_read's unconditional `removed_at is null`** makes a plain client `UPDATE` setting
  `removed_at` structurally impossible (Postgres requires the post-UPDATE row to also satisfy the
  table's SELECT policy) — `remove_material()` exists because of this, not for authority.
- **`(func()).*` can evaluate a composite-returning function twice.** For a side-effecting function
  this is silent data corruption dressed up as a spurious `not_found`. Every call site here uses
  `select r.* from func() r` instead — carry this to any future RPC returning a table's row type.

`src/lib/storage/paths.ts` (the single path builder, `03` §6) is written and unit-tested
(`tests/unit/storage-paths.test.ts`, 15 cases, `vi.mock("server-only", ...)` the way `tests/unit/
dal-session.test.ts` does — the `unit` project's `react-server` condition does not reliably resolve
`server-only`'s own conditional export in this Vitest version, so mocking is the house pattern, not
the config).

**Open question for the lead, not yet resolved:** `render_pages` (the worker) needs to mint the same
`material-pages/...` shapes itself — it is not just replaying a path read back from a row, it builds
one per rendered page. The worker is a separate TypeScript project (`worker/tsconfig.json`, its own
`rootDir`) with no import path back into `src/`, unlike `packages/designer-runtime`, which both the
app and the worker image import as a real shared package. Two ways to keep "one path builder" true
in fact and not just in the app half: (a) a new `packages/storage-paths` workspace member — needs a
`package.json` edit, which is the lead's; or (b) a small, comment-linked port of just the two shapes
the worker needs into `worker/src/content/paths.ts`, covered by its own test, with `src/lib/storage/
paths.ts` staying canonical and the port's header pointing back at it. Leaning toward (b) unless the
lead would rather add the workspace package — flagging rather than deciding alone since it touches
`package.json`.

Next: `api/upload/material` (STORY-MAT-001) — Zod first, sniffed on content after the bytes land,
an SVG named `.png` rejected, the signed-upload flow from `07` §1.

---

## 4. Status at handoff — every story on the lead's list, in order

All of MAT-001…006, EVT-005/006, TSK-001/002, DSC-001/002/003, `REQ-PRO-004` are built, committed,
and green (`npx tsc --noEmit`, `npm run lint`, `npm test`, full `npm run test:rls`). Commits, in
order: `89efe88` (path builder + MAT-001) → `aa5d9c3` (MAT-002: conversion/render/viewer) →
`155b87b` (MAT-004: phase/download + its audit row) → `81e3c18` (MAT-005: the upload form) →
`3eb3e36` (EVT-005/006: the photo pipeline) → `bafcbb4` (TSK-001/002) → `e09b1dc`
(DSC-001/002/003) → `27ce5ae` (`REQ-PRO-004`). MAT-003/006 were satisfied by MAT-001/002's own
work and never got a separate commit.

**§0.1's open question resolved itself**: the worker port (`worker/src/content/paths.ts`) is the
shape actually used — no `packages/storage-paths` workspace member was ever needed, since nothing
past `render_pages`/`process_photo` grew complex enough to make the duplication costly. Still
flagged, still true, just never revisited.

### 4.1 EVT-005/006 — why the photo strip runs in the worker, not the Route Handler

This is the one place this track's usual shape (Route Handler downloads → sniffs → finalizes, like
`completeMaterialUpload`) does not work. `photos_storage_read` (`03` §6) denies everyone — including
the uploader — until a matching `photos` row exists, and that row cannot exist unstripped
(`check (exif_stripped)`, 0037; proven by `tests/rls/storage-content.test.ts`'s own "no RETURNING
here" case). So the app's RLS-bound client can never read the raw bytes back to strip them; only
`service_role` can, and invariant 7 keeps that off Vercel. Byte-level EXIF/XMP/ICC stripping
(`src/lib/storage/exif.ts`, ported to `worker/src/content/exif.ts`, parity-tested in
`tests/unit/storage-exif.test.ts`) runs in `process_photo` instead — no image library, no pixel
decode, just JPEG marker / PNG chunk / WebP RIFF-chunk removal. `record_photo_upload()` is the only
door that can ever create a `photos` row (service_role-only), and returns DEC-043's envelope shape
(`{status, photo?}` / `{status:'file_too_large', limit_mb}`) since the strip and re-upload already
happened by the time a size decision is made — raising would not undo either.

`photoPath()` (`src/lib/storage/paths.ts`) now takes the sniffed kind's own extension instead of
forcing `.webp` unconditionally — `07` §3's literal table predates DEC-047's amendment, which
defers re-encoding to WebP as a size optimisation, not a correctness requirement. Extension
defaults to `webp` so nothing else needed to change.

### 4.2 DSC-001/002/003 — no `JOB-rebuild_search`, on purpose

`11-background-jobs.md`'s sketch has `JOB-rebuild_search` fire "on category/company rename," which
only makes sense if a session's searchable text caches a category/company NAME somewhere.
`sessions.search_vector` (0037) does not — it is `generated always … stored` over `title`/`abstract`
only. `src/lib/dal/search.ts` matches tags/presenter/company/material-title by querying those
tables LIVE, through the caller's own RLS-bound client (so `materials_read`'s phase gate, REQ-MAT-006,
is what decides which material titles are even visible to match against — REQ-DSC-007's "metadata
only" and REQ-MAT-006 fall out of the same choice, never reimplemented). A rename is reflected on
the very next search; there is nothing to go stale, so no job was built. `arNormalize()` is a JS
port of `public.ar_normalize()`, proven byte-for-byte against it in `tests/unit/search-normalize.test.ts`.

### 4.3 `REQ-PRO-004` — the riskiest single change this track made

Modified three already-tested `materials` table policies, two `materials` bucket storage policies,
and the `materials_guard` trigger, all in `supabase/proposed/content/0009_proposal_materials.sql`,
to add a `proposal_id` branch alongside every `session_id` one. Every session-shaped branch is
copied verbatim, never re-derived — `is_presenter_of(null)` already returns false rather than
raising (it is not `strict`), so nothing needed defensive rewriting, only the proposal branch and a
top-level `is_staff()` shortcut (pulled out of what was an inline OR, logically unchanged) are new.
Both the new cases AND the full existing suite were re-run after this change
(`tests/rls/materials-schema.test.ts`, 38 cases; full `npm run test:rls`, 492 cases, 45 files) —
worth doing again for any future change that rewrites an already-shipped policy rather than only
adding a new one.

The carry-over (proposal → session) is a trigger on `public.sessions`, not a change to whichever
RPC the `sessions` track's own publish flow calls — same "additive DDL on a table this track does
not own the app code for" pattern 0037 used for `sessions.search_vector`. It fires on any session
insert naming a `proposal_id`, so nothing in `sessions`' own RPCs needs to know this exists.

### 4.4 §4.3's own aftershock — a real upload had never been driven through a browser

Writing `tests/e2e/proposal-materials.spec.ts` — the first spec anywhere in this track to drive
the actual upload form against real local Supabase instead of seeding `materials`/`material_
versions` directly through SQL — found that no material's own upload could ever complete, for any
kind, session or proposal. `completeMaterialUpload()` downloads the just-landed object through the
uploader's own RLS-bound client before `finalize_material_upload()` creates the `material_
versions` row `materials_storage_read` joins through to decide who may read; no uploader could
ever pass that join, so the download always failed. `supabase/proposed/content/0010_materials_
storage_read_preupload.sql` (promoted `0054`) closes it: a read branch mirroring `materials_
storage_write`'s own shape (checking the path's own `sessions`/`{id}` or `proposals`/`{id}`
segments against the same authority the write already trusted, no join at all) for exactly the
pre-finalize window. `tests/e2e/materials.spec.ts` got the same real-upload case added afterward,
for the ordinary session path. The lesson, worth repeating for whoever reads this later: **a mocked
Storage client, or seeding rows directly, cannot catch a policy gap in the sequence between two
real HTTP calls** — only a spec that drives the actual browser flow against the actual database
found this, and it had been silently broken since STORY-MAT-001.

### 4.5 Everything closed out

Every e2e spec this track owns is green against real local Supabase, rebuilt and reset past every
fix above: `tests/e2e/{materials,photos,tasks,proposal-materials,bookmarks}.spec.ts`, 11 cases, run
serially (`--workers=1`) since a couple depend on timing that heavier parallel load on the shared
local Postgres made measurably slower without ever being wrong (`tests/e2e/photos.spec.ts`'s own
takedown case polls the database for `hidden_at` rather than a component's own transient
confirmation text — `revalidatePath` can legitimately race that text away for a viewer who is not
staff, since the photo they just hid also drops out of their own list in the same commit). 390 px
RTL captures for every new screen are under `.qa-shots/rtl/`, looked at: `materials-event-page`,
`materials-viewer`, `photos-event-page`, `tasks-event-page`, `proposal-materials`,
`bookmarks-page`. Two more real bugs the captures/specs found on the way, both fixed: a `self-start`
button with no border/padding inside a `flex-col` can collapse to an unclickable width in
Chromium (`w-fit` fixes it, applied everywhere the pattern appears in this track's components —
`f3d8d73`), and the viewer's own font-substitution message was missed when `cc7ee3e` moved every
other caller of that string to `t.rich()` for its `<bdi>` wrapper (`3af402a`). `npm run
converter:test` is green (16/16).

## 5. Handoff to wave 3

Every story on the lead's list — MAT-001…006, EVT-005/006, TSK-001/002, DSC-001/002/003, `REQ-PRO-004`
— is built, tested at every level (`tsc`, lint, unit/component, RLS, e2e against real local
Supabase), and captured at 390 px RTL. Nothing from this track is left mid-story.

**What a wave-3 owner of this surface should know:**

- **DSC-003/005's live filtering, and a real "bookmark from the list" flow, are not e2e-tested
  through any actual page** — `<SearchFilters locale />` and `<BookmarkButton>` are components for
  another track's page to embed (SCR-011, the browse page, is `sessions`'), and neither is wired
  anywhere as of this handoff. `src/lib/dal/search.ts`'s own contract (the URL param names
  `q`/`category`/`venue`/`company`/`level`/`language`/`presenter`/`from`/`to`) is what a browse
  page needs to read and call `searchSessions()` with. Component-level coverage exists
  (`tests/components/search/filters-form.test.tsx`); a real page rendering it does not yet.
- **No `JOB-rebuild_search` exists, on purpose** — §4.2 above explains why; nothing here caches a
  category/company name, so nothing needs rebuilding on a rename.
- **The `worker/src/content/{paths,exif}.ts` ports are still ports**, not a shared package — §0.1/
  §4's own note. `tests/unit/storage-paths-parity.test.ts` and the parity block in
  `tests/unit/storage-exif.test.ts` are what keep the two copies checked-identical; extend both
  files if either canonical copy (`src/lib/storage/paths.ts`, `src/lib/storage/exif.ts`) grows a
  new shared shape.
- **Re-encoding photos to WebP through the converter was deferred (DEC-047)** and never revisited
  — a real size optimisation, not a correctness gap; the stored bytes keep whatever format was
  sniffed (jpeg/png/webp) with a matching extension.
- **Materials/photos "obey every materials rule" for a proposal's own draft** is a property of the
  shared upload/sniff/limit pipeline (`REQ-PRO-004` reuses `initiateMaterialUpload`/
  `completeMaterialUpload` wholesale), not of `ProposalMaterials`' own — deliberately minimal —
  UI, which has no viewer link and no phase/`allow_download` toggle since a draft is never rendered.
- **The one lesson worth carrying to any future upload-shaped feature**: prove the real sequence —
  initiate, PUT, complete — against real local Supabase before calling it done. §4.4 is what
  happens when that step is skipped for three stories in a row.

---

## 6. Wave 5 (M9) — the nine display primitives

Read before writing: `STATUS.md`'s wave-5 section, `CLAUDE.md`'s wave-5 ownership map, `.claude/
agents/content.md` (rewritten for this wave), DEC-009/069/073/085/087/099/101/104/105, `16` §4.1,
§4.2, §5, §6.4, §6.8, §7.4, §16.2, and `src/lib/session-status.ts` in full. Nothing here redesigns a
screen — MAT/TSK/photos/DSC/PRO-004 above are M5, shipped and unchanged; this section is the new
`ui/` primitives only.

### 6.0 What I found already true, before writing anything

- **The status tokens are already landed.** `globals.css` carries `--color-live`,
  `--color-live-bg`, `--color-live-on-dark`, `--color-ended`, `--color-ended-bg`,
  `--shadow-raise`, `--space-section` and the four motion tokens, each tagged `M9 (DEC-073)` —
  ahead of `.claude/agents/content.md`'s note that they were not landed yet. No request needed;
  used as Tailwind utilities directly (`bg-live-bg`, `text-live`, `shadow-raise`, …).
- **`browse` is already a registered namespace** (`src/messages/index.ts`, both `ar/browse.json`
  and `en/browse.json` exist, written by the pre-M9 `console`-owned SCR-011 work). It already holds
  a `browse.card.*` subtree. I add sibling keys under `browse` for the new primitives rather than
  touching what is there; `browse.card.*` stays exactly as SCR-011 left it since that screen is not
  mine until M10.
- **`axe-core` is not a direct dependency**, but it is a real transitive one — `4.12.1` at
  `node_modules/axe-core`, required by `eslint-plugin-jsx-a11y` and `lighthouse`, both existing
  devDependencies. `package.json` is lead-only and a fresh direct dependency means
  `npm run lockfile` in Docker, which I cannot run. I import `axe-core` directly
  (`import axe from "axe-core"`) in the nine primitive tests; it resolves today and will keep
  resolving as long as either of those two packages stays a devDependency, which is a safe bet. A
  one-line ask for the lead: promote it to an explicit `devDependency` at the next `npm run
  lockfile` run, so it stops being a phantom resolution. Not blocking.
- **`color-contrast` is disabled in the jsdom axe runs.** jsdom does not compute rendered styles
  from an external stylesheet, so axe's `color-contrast` rule is unreliable there (a known
  jsdom/axe limitation) — I disable that one rule and instead assert real contrast numerically with
  `contrastRatio`/`checkContrast` from `@/lib/brand/contrast.ts` (imported, not edited — it is
  `branding`'s file) against the actual hex values, for the badge's nine phase×seat rows in both
  themes as asked, and for the six avatar tint pairs.
- **`card.tsx`'s "nested button" is deliberate, three times over** (`16` §6.4, `.claude/agents/
  content.md`, the lead's task message) and I am implementing it literally: the whole card is one
  `<Link>`, `CardActions` wraps its children in a `stopPropagation` boundary so any caller-supplied
  interactive (the bookmark button, not mine to build) never double-fires the card's own
  navigation. This is real DOM nesting of an interactive inside an interactive, which axe-core's
  `nested-interactive` rule (best-practice, enabled by default) flags. I disable that one rule in
  `card.test.tsx` with a comment citing the same three sources, and add a functional test in its
  place: Tab reaches the nested button independently, Enter/Space activates its own handler, and a
  click on it does not navigate — which is the actual concern the rule is a proxy for, proven
  directly rather than by the proxy. `card.tsx`, `tag-chip.tsx`, `empty-state.tsx` and
  `file-drop.tsx` all need `"use client"` for their own interactive handlers (`onRemove`,
  `action.onClick`, drag/drop, the propagation stop) — `badge.tsx`, `avatar.tsx`, `progress.tsx`,
  `stat.tsx`, `panel.tsx` stay server-safe, consistent with `ui/index.ts`'s own list of which
  primitives must be client.
- **`SessionStatusBadge` uses `useTranslations` (the client-safe, universal hook), not
  `getTranslations`.** `session-status.ts`'s own comment says it is "rendered inside client
  components (the action card's two states)", and `useTranslations` already works from a
  non-`"use client"` module in this codebase (`footer.tsx`, `(marketing)/not-found.tsx`) because
  `NextIntlClientProvider` wraps the whole tree at the root layout — so `badge.tsx` stays
  server-safe while still working when a client ancestor renders it.
- **`TagChipProps.count` is a raw `number`**, unlike `Stat.value`/`Progress.valueText` which are
  pre-formatted strings "by the caller, in the org's numerals" by design. The frozen type gives
  `TagChip` no numerals/locale input. My first draft read `document.documentElement.lang` to format
  it — wrong: that is `undefined` during SSR and set on the client, so the server-rendered digits
  and the hydrated ones would differ, a real hydration mismatch, not a cosmetic gap. Fixed to a
  plain `String(count)`, identical on both passes, wrapped in `<bdi>` — correct and safe, but it
  cannot honour an org's Arabic-Indic-vs-Western numeral setting the way `Stat`/`Progress` do.
  Flagging it here rather than silently living with it: if a future wave wires a real tag facet
  count, the fix is either a pre-formatted-string variant of the prop or a call-site that folds the
  count into `label` — a decision for whoever owns that screen, not one I can make by editing
  `index.ts`.
- **`Avatar`'s tint hash is on the member id**, not the name, per `16` §6.8 and DEC-099, and is a
  small local `djb2`-style string hash mod 6 — six navy/silver pairs verified ≥4.5:1 in the test,
  not just picked by eye. `CardMedia`'s generated placeholder hashes the *title* instead (there is
  no id in `CardMediaProps`), which is a different, narrower rule than avatar's and is documented
  as such in the component so nobody generalises it back onto avatars later.
- **`file-drop.tsx` in M9 is the control only**, as briefed: drag-and-drop plus a real keyboard-
  reachable `<button>` triggering a hidden `<input type="file">` (drag alone is never sufficient),
  client-side type/size pre-checks shown per file as an advisory (never authoritative — the server
  sniffs on content after the bytes land, invariant 11/DEC-009), rendered with my own `Progress`
  primitive as an indeterminate "queued" state per pending file. There is no live upload-progress
  wiring in M9 (`FileDropProps` has no progress channel back in) — that is M10's job when a real
  Route Handler is threaded through.

### 6.1 Build order

1. `badge.tsx` — the nine-row table, the dark-band handling, the reduced-motion pulse, the
   contrast test.
2. `empty-state.tsx`.
3. `card.tsx` — four densities, the placeholder, the nested-button boundary.
4. `avatar.tsx` + `AvatarStack`.
5. `tag-chip.tsx`, `progress.tsx`, `stat.tsx`, `panel.tsx`.
6. `file-drop.tsx`.
7. The three error/not-found boundaries under `bookmarks` and `materials`.
8. Messages (`browse.json`, both locales), tests, 390 px RTL captures, `tsc`/lint/`test`/`test:rls`.

Will say "ready for sync" after each unit lands, per DEC-047/DEC-101's note that a Sonnet track
should not idle at a checkpoint.

### 6.2 Status at this sync — all nine primitives, and the three route boundaries

All nine files built to the frozen `ui/index.ts` contract, each with its own jsdom test carrying an
`axe-core` assertion (`color-contrast` disabled the same way `sessions`' `Field` tests already do
it — jsdom has no layout engine), plus the three route boundaries. Commits, one per unit:
`badge` (+ its `browse.json` messages), `empty-state`, `card`, `avatar`, the four smaller primitives
(`tag-chip`/`progress`/`stat`/`panel`) together, `file-drop`, and the three
`error.tsx`/`not-found.tsx` boundaries.

**Gates run:** `npx tsc --noEmit` clean · `npm run lint` zero errors on every file this track
touched (two real findings fixed along the way — `file-drop.tsx` was mutating a ref's `.current`
during render, which the newer `react-hooks/refs` rule now forbids outright; replaced with `onFiles`
directly in the effect's own dependency array) · `npx vitest run` on the nine new test files: 104/104
passed · `npm run ui-lint`: zero violations in anything this track touched (`ui/` is excluded from
the gate anyway, per DEC-104) · `npm run error-coverage`: green, six fewer missing boundaries than
the allowlist permits. **`npm test` on the whole tree** shows 30 failures, all of them in `field.test.tsx`,
`input.test.tsx`, `date-time.test.tsx` and `proposal-copy.test.tsx` — `sessions`'/`console`'s own
concurrent WIP (one is a literal `ReferenceError` mid-edit), nothing under this track's ownership.

**Three real findings from writing the tests, worth recording:**

1. **`userEvent.upload` (and every real browser) filters by the input's own `accept` attribute**
   before `onChange` ever fires — so the "unsupported type" test cannot be written by uploading a
   mismatched file through the picker at all; it has to go through drag-and-drop, which has no such
   filtering anywhere. That is also, genuinely, the path the client-side check is *for*: the OS
   dialog already does the filtering the picker path needs.
2. **A `className="hidden"` alone does not hide anything inside a jsdom test** — there is no compiled
   stylesheet loaded, so `display:none` never applies, and `file-drop.tsx`'s own hidden `<input>` was
   a genuine axe finding (an unlabelled, "visible" file input) until it also carried the native
   `hidden` attribute, which every browser's UA stylesheet honours with no CSS required, and which
   does not stop a hidden input's `.click()` from opening the OS dialog either.
3. **Testing Library's `getByText` matches an element's own direct text-node children, not
   `textContent`** — so `getByText("مسودة")` on a `<span class="…"><bdi>مسودة</bdi></span>` returns
   the `<bdi>`, never the outer styled `<span>`. Any assertion checking a *class* on a component whose
   visible text sits inside its own `<bdi>` (which is every one of these nine, per invariant 10) needs
   `container.firstElementChild` or an equivalent, not `getByText(...).toHaveClass(...)`.

**Open, not blocked but not mine to finish:**

- **The 390 px RTL screenshot per primitive** (Definition of Done) needs the `(dev)` gallery
  (`src/app/[locale]/(dev)/**`, lead-only) to actually mount these nine components, and
  `npm run visual capture` (lead-only this milestone) to take the shot. Neither exists yet for this
  track's primitives. Flagging rather than working around either restriction.
- **`axe-core` stays a transitive, undeclared dependency** (§6.0) — a one-line ask for the lead to
  promote it to a real `devDependency` at the next `npm run lockfile` run, now that `sessions`' tests
  independently landed on the exact same import as the answer, which is a second, better reason to
  make it official.
- **`TagChip.count`'s numerals limitation** (§6.0, §6.1) is unresolved by design — the frozen type has
  no numerals input, and the fix is a decision for whoever wires a real facet count in M10, not an
  `index.ts` edit from this track.

Ready for sync. Next, absent other direction: help drive `npm run qa`/`visual`/the gallery wiring once
the lead is ready for it, or start on M10's `browse.json`-owned screens once M9 closes — both are the
lead's call, not mine to start early.

---

# Wave 6 — the discussion, materials, photos (REQ-UIX-024, DEC-130)

**PLANNING ONLY.** No source file touched writing this. Read (this session): `STATUS.md`'s START
HERE + WAVE 6 blocks, `CLAUDE.md`'s wave-6 ownership map, `.claude/agents/content.md` (regenerated,
authoritative over the spawn prompt), `DECISIONS.md` `DEC-100`, `DEC-110`, `DEC-112`, `DEC-114`,
`DEC-124`, `DEC-130`, `DEC-132`, `16-ui-redesign.md` §5.4.1a(b), §6.3, §6.4, §6.8.3, §7.1, §7.3,
§7.5, `01-prd.md` `REQ-UIX-007/010/012/013/018/020/024`, `REQ-EVT-001…015`, `REQ-MAT-001…012`, the
nine `ui/` primitives as shipped (all built and green from M9 — `card`, `badge`, `tag-chip`,
`avatar`, `progress`, `empty-state`, `stat`, `panel`, `file-drop`), the current
`components/event/{comments,comment-composer,comment-item,comment-list,actions}.tsx`,
`components/{materials,photos,viewer,tasks}/**`, `lib/dal/{comments,reactions,reports,materials,
photos,tasks}.ts`, `lib/realtime/channel.ts`, and `components/sessions/slots.ts`. `docs/plan/
notes/sessions.md` has **no wave-6 section yet** — noted in §3 below, not blocking this plan.

## 0. What changes and what doesn't, in one paragraph

Wave 6 is "put these three surfaces on the M9 system," not "redesign the data model." Every DAL
function, RPC, RLS policy and Realtime trigger from waves 1/5 (M5) stays as-is. What changes is
presentation: raw `<textarea>`/`<input type=file>`/hand-rolled `<span>` badges become the nine
`ui/` primitives; every write action gets a real pending/success/failure story instead of an inline
`<p>` that may be off-screen; the reaction gets the Tier-2 whisper (`DEC-100`, pulled into this wave
by `DEC-110`'s "the comments surface becomes a Notion-style comment experience"); uploads move onto
`ui/file-drop`, stating type and size **before** a file is picked, which is new DAL surface (the
byte limits exist today only as a post-hoc 413 message, §2.3 below).

## 1. The discussion (`REQ-UIX-024`, `REQ-EVT-001…015`)

### 1.1 The composer — a real editing affordance, not a bare textarea

`comment-composer.tsx` keeps its shape (one component for a top-level post and a reply, mentions
via `@`-search, the same `postCommentAction`/`searchMentionsAction`) and gains:

- **Auto-grow.** The `<textarea>` starts at its current row count and grows with content up to a
  cap (~10 rows), via `field-sizing: content` where supported with a `useLayoutEffect` height
  measurement as the fallback — no new dependency. It renders through **`ui/textarea`** (`sessions`'
  file, consumed not edited) for the border/focus/invalid styling every other text control in the
  product now shares, wrapped in a container this component owns for the grow behaviour `ui/textarea`
  itself does not provide.
- **A remaining-length counter with all six ICU forms**, replacing the silent `maxLength={4000}`
  that gives no feedback until the 4001st character is simply refused. `event.comments.remaining`
  keys `{zero,one,two,few,many,other}`, shown once the member is within ~200 characters of the cap
  (quiet otherwise — a counter visible from character zero is noise, `16` §3's own "not everything
  needs to shout" applies to microcopy as much as colour).
- **The failed-post text is already kept** — `postCommentAction`'s error path never clears `body`
  (`comment-composer.tsx:78-81`, today). I keep that and make the failure visible: the inline error
  paragraph (`REQ-UIX-010` — adjacent, coloured, icon-marked) moves into a small `Panel tone="error"`
  with `AlertCircleIcon` under the textarea, **and** the same failure raises `useToast().show({tone:
  "error", ...})` so a reply composer scrolled out of view still tells its author it failed. The
  toast stays until dismissed (lead's `ui/toast`, `role="alert"`, no auto-dismiss on error — already
  built that way); the inline panel satisfies "adjacent" for the member still looking at the field.
- **Submit and reply buttons become `ui/button` with `pending`/`pendingLabel`** (`Button`'s own
  override prop for a non-`<form>` pending source — these are `useTransition` calls, not native form
  submissions, so `useFormStatus` never fires and the explicit prop is the documented escape hatch,
  `ui/index.ts:342-344`). Label stays, spinner appears beside it, `aria-busy` — `REQ-UIX-007` met by
  construction rather than by a manually-set `disabled` with no visual state, which is all today's
  code does.
- **Success**: the composer clears and a brief success toast confirms the post — mostly redundant
  with "your comment now appears in the thread," but real for a reply, where the new item can land
  below the fold of what the member is looking at. `router.refresh()` for the actor's own copy stays
  exactly as documented in `actions.ts`'s header (the realtime-race fix from wave 1) — nothing about
  this wave touches that mechanism.
- **Mentions stay a plain `<ul>` dropdown** — not a `ui/combobox` (that is `console`'s file and this
  is a free-text `@`-search inside a textarea, not a form field with a bound value; forcing it into
  `combobox`'s contract would be the wrong tool). Each candidate row gets `Avatar` at 24 px (§1.4)
  so a member picks a mention by face, not name alone — a real, cheap win now that avatars exist as
  a primitive, even though the upload/import half of `16` §6.8 is `scoring`'s in M10.

### 1.2 Every action's pending/success/failure, action by action

| Action | Pending | Success | Failure |
|---|---|---|---|
| Post / reply | `ui/button pending` | clears composer, toast (brief) | inline `Panel` + toast (persists) |
| Edit save | `ui/button pending` | closes edit mode, comment updates in place | inline `Panel` under the edit field + toast |
| Delete (own) | spinner replaces the trigger's icon while `useTransition` is pending | comment becomes the tombstone / thread updates immediately | toast (persists) — the comment is still there, so no inline slot survives a failed delete to show text next to |
| Moderator remove/restore | same as delete | toast (brief) naming the action taken | toast (persists) |
| Report | `ui/button pending` inside the dialog | dialog closes, `t("report.already")` replaces the action, toast (brief, "تم إرسال بلاغك") | inline `Panel` inside the still-open dialog + toast |
| Reaction toggle | **optimistic, no pending UI** (§1.3) | the whisper motion IS the success feedback | optimistic state reverts, toast (persists, quiet copy — "تعذّر تسجيل إعجابك") |

Delete and moderator actions get a toast rather than an inline slot because both can relocate or
remove the very row the inline error would have sat next to — a `<p>` next to a comment that is
about to vanish (moderator "remove") is a message nobody reads. This is the one place the model
departs from "adjacent, `REQ-UIX-010`" on purpose, and it is what `REQ-UIX-010`'s own text allows:
that requirement governs **field** errors: a delete/moderate control is an action, not a field.

### 1.3 The reaction — the whisper (`DEC-100`, `REQ-EVT-004`, `REQ-UIX-018`)

Redesigning `toggleLike()`/its button in `comment-item.tsx`:

- **The glyph is `DotIcon`** (`ui/icons.tsx`, lead's, consumable), not a heart — `DEC-100`/§7.5.1's
  "no heart, no burst, no particles" plus "one metaphor everywhere: knowledge starts as a dot of
  light" point at the same glyph the constellation itself uses, not an invented one. Unreacted: an
  outline dot at the caption size. Reacted: filled.
- **Optimistic, per `16` §7.1 layer 4** — reactions are explicitly named alongside bookmarks as the
  one place optimism is correct ("never for RSVP"). `useOptimistic` (React 19, already in the stack)
  flips the glyph and the count the instant the button is pressed; `toggleReactionAction` runs behind
  it; on failure the optimistic value is discarded (React reverts it automatically) and a quiet
  persistent toast explains it did not stick — the realtime broadcast and `router.refresh()` already
  in `actions.ts`/`comment-item.tsx` are what reconciles the optimistic guess with the server's real
  totals either way, exactly as they do today for the non-optimistic path.
- **The motion**: on the transition from "not reacted" to "reacted" only (never on unreact, never on
  a re-render that merely receives a new prop) — the dot ignites (`dot-pulse`) and one ring expands
  from it (`ripple-ring`), both **already-written keyframes** (`globals.css:499-521`), 200–260 ms,
  one iteration, transform/opacity only. **I cannot add the one-shot utility classes this needs** —
  the two existing consumers of these keyframes are both tuned for continuous ambient motion
  (`.network-svg .pulse-dot`: 6 s infinite; `.ripple-ring`: 8 s infinite) — so this is request §4.1 to
  the lead.
- **Static under reduced motion**: the glyph simply becomes filled, no animation — already correct
  by the global `prefers-reduced-motion` block's universal `animation-duration: 0.01ms !important`
  (`globals.css:1005-1010`), which overrides any duration regardless of where it is declared. The
  ring additionally needs `display: none` under reduced motion the way `.ripple-ring` already gets
  it (`:1012-1014`) — folded into request §4.1 so the new class(es) inherit the same treatment rather
  than needing a second rule.
- **Count formatting**: after the numerals sweep lands, `formatNumber` takes no numerals argument —
  this file's `formatNumber(likeCount, numerals)` call becomes `formatNumber(likeCount)`, a mechanical
  change already covered by the sweep landing before I edit anything (per the spawn instruction).

### 1.4 Avatars, `<bdi>`, and what else moves onto the nine primitives

- **`Avatar` at 32 px** next to every comment's author name (`16` §6.8.3's own row for "Comments and
  ratings," already fetched by `comments.ts`, drawn nowhere today) — `memberId`/`displayName`/`src`
  exactly as `CommentAuthor` already carries them (`comments.ts:17-21`), no DAL change needed here.
  Mention candidates get `Avatar` at 24 px (§1.1).
- **The empty thread** (`t("empty")`, today a bare `<p>`) becomes `EmptyState`: title "لا توجد
  تعليقات بعد", action = focus the composer (an `onClick` that calls a ref'd `.focus()`, not a link —
  there is nowhere else to go, the composer is right above it). `REQ-UIX-012` is explicit that the
  action is required; "start the conversation" is a real next step here, not a filler action.
- **The cancelled-session frozen notice** (`t("frozenOnCancelled")`, today a bare `<p>`) becomes a
  `Panel tone="neutral"` — a static aside, exactly panel.tsx's own stated purpose ("a warning aside").
- **The deleted tombstone** stays a plain `<p className="italic">` — `Panel`/`Badge` would overstate
  a single muted sentence that exists specifically to be quiet.
- **`Badge`** for "تم التعديل" (today plain text appended to the timestamp) — `tone="neutral"
  outline size="sm"`, so an edited comment is scannable in a long thread without reading every
  timestamp. Not used for the report state (`t("report.already")`) — that is a sentence about what
  the viewer did, not a status label on the comment itself, and forcing it into `Badge` would read as
  the comment being flagged, which is exactly the information `REQ-EVT-008` keeps from a non-staff
  viewer.
- **No `Card`.** A comment is not a navigable object with a media box; wrapping each one in `Card`
  would add hover-raise and link semantics that mean nothing here. `EmptyState`/`Panel`/`Badge`/
  `Avatar` already put the discussion route on the system (`scripts/ui-reach.mjs`, strict reading) —
  `Card` earns its place on materials/photos below, not here.

## 2. Materials (`components/materials/list.tsx`, `/app/sessions/[id]/materials/[materialId]`)

### 2.1 The list — rows, the phase badge, a download with a pending state

- **`materials/list.tsx`** renders each material as a **`Card density="row"`** (`16` §6.4's own
  second density, "lists" — a materials list is exactly that list), body-only (no `CardMedia` — a
  material has no poster-shaped image; an icon by kind, `ImageIcon`/`DownloadIcon`/`LinkIcon` from
  the house set, sits in the row instead). Each row: title (`<bdi>`), kind label, and the **قبل/بعد
  phase badge** — `Badge tone="info" outline` for `before`, `Badge tone="neutral" outline` for
  `after` — replacing today's plain `{t(kind)} · {t(phase)}` text line, which is invisible at a
  glance in a list of eight rows.
- **`renderStatus`** — `pending`/`rendering` today reads as a static sentence; it becomes
  `Progress` in indeterminate mode (`value` omitted — exactly `progress.tsx`'s documented mode for
  "queued work with no known extent") next to the row, and `failed` becomes `Badge tone="error"`. A
  `ready` PDF's row keeps its `"open the viewer"` link — that link is the row's own primary action,
  so it stays a plain `Link`, not a nested button inside `Card`'s own link (materials rows use
  `Card` **without** an `href` — the row is a static container, not itself the link, so `CardActions`'
  stopped-propagation nesting rule from `card.tsx`'s own header does not apply here the way it will
  for the session card in M10).
- **The count line** (`t("count", {...})`) stays — a bare sentence above the list is right; wrapping
  a count in `Stat` would overstate one number sitting above eight rows it is not summarising a
  dashboard for.
- **Empty state**: `EmptyState` — title "لا توجد مواد بعد", action = scroll to / open the upload form
  for a presenter/admin (`canManage`), or, for a member with no upload right, no action is possible
  — and `EmptyState.action` is **required by the type**. Resolved: for a non-manager the empty state
  is simply not rendered at all (today's code already gates `UploadForm` on `canManage`; the same
  gate decides whether the *empty state itself* renders, and a non-manager instead sees nothing where
  the list would be, matching the session-card pattern of "a section that renders nothing" rather
  than forcing a fake action into a primitive that refuses to allow one). ★ Flagged as request §4.3
  in case the lead reads `REQ-UIX-012` as requiring a visible line either way.

### 2.2 The viewer route (`materials/[materialId]/page.tsx`)

- The pending/failed/no-pages states (`t("states.pending")` etc., today three plain `<p>`s) become
  `Panel` (neutral for pending — matches Photos' processing notice below — `error` tone for failed).
- **`DownloadButton`** becomes `ui/button pending pendingLabel`, replacing the manual
  `disabled={pending}` with no visual pending state; on `unavailable` (no signed URL — REQ-MAT-005's
  audited-download path returning nothing) the message becomes a persistent toast rather than the
  inline `<p>` it is today, since a download failure has nowhere obvious "adjacent" to sit once the
  member has already clicked away toward their downloads folder.
- **The font-substitution warning** (`REQ-MAT-011`) becomes `Panel tone="info"` with `InfoIcon` — it
  is advisory, not an error, and today's plain paragraph does not distinguish it from a real failure.
- **`PageViewer` itself is out of scope this wave** — its RTL next/previous keyboard model
  (`page-viewer.tsx`) is already correct and already tested (`tests/components/viewer/
  page-viewer.test.tsx`); the wave-6 measure is the route reaching an M9 primitive, which the page
  shell above already does. I will touch `PageViewer` only to thread the numerals-sweep's parameter
  removal through `formatNumber`/`t.rich("pageOf", …)` — mechanical, not a redesign.

### 2.3 The uploader — `ui/file-drop`, stating type and size before a file is chosen

This is the one place materials needs new DAL surface, not just new markup:

- **`getMaterialsPageData`/`getProposalMaterialsPageData`** gain a **new** `org_settings` select for
  `limit_document_mb, limit_audio_mb, limit_image_mb` — ★ re-checked against disk after the numerals
  sweep (`c20b901`): both functions read no `org_settings` at all today, since the sweep deleted the
  `numerals`-only select they used to carry and neither had anything else to read there. So this is
  a genuinely new query, not an extension of an existing one — my first draft undersold it as the
  latter. Returned in the page DTO, `UploadForm` receives the three limits as props and picks the
  right one for the selected `kind`, computing `maxBytes = limitMb * 1024 * 1024` and a
  `requirements` line — «PDF فقط، حتى 50 ميغابايت» / equivalent for image/audio, Western numerals
  throughout (DEC-124; my own first draft of this line used «٥٠» and is corrected here) — **before**
  any file is chosen, which is what `REQ-UIX-024`'s acceptance actually asks for and what today's
  code cannot do (the limit is only ever learned from a 413 response, after the fact).
- **`accept`** varies with the selected `kind` radio/select — `["application/pdf", ".pdf"]` for
  `pdf`, `["image/png","image/jpeg","image/webp"]` for `image`, the four audio MIME types for
  `audio`. This is client-side, advisory — `FileDrop`'s own header is explicit that it is "the
  control, not the enforcement," and `sniffedKindMatchesDeclared()` server-side (`0077`, DEC-058)
  is unchanged and still the real gate. **No SVG anywhere** — `accept` never includes `image/svg+xml`
  and never will (invariant 11, DEC-009).
- **Per-file progress and per-file error** — `FileDrop`'s own `Picked[]` state already renders a
  `Progress` per selected file and an `error` per file (`file-drop.tsx`'s header: "each pending file
  shows `Progress` in its indeterminate mode"); `UploadForm`'s own `handleSubmit` stays the two-step
  signed-PUT-then-complete flow, now driving `FileDrop`'s `onFiles` instead of a bare `<input>`.
- **The link-kind fields** (`video_link`/`external_link` — a URL, not a file) stay `ui/input`
  (`sessions`' file) exactly as today; `FileDrop` only replaces the branch where `isFileKind` is true.

## 3. Photos (`components/photos/gallery.tsx`)

- **The grid stays a plain `<ul>` grid** (`Card` does not fit — a photo tile opens nothing, it is
  itself the content, and `Card`'s "whole thing is one link" contract has no destination to give it).
  What changes: the **hidden badge** (`t("hiddenBadge")`, a bare `<span>`) becomes `Badge tone="error"
  outline size="sm"`; the **empty gallery** becomes `EmptyState` (title "لا توجد صور بعد", action =
  open the uploader for `canUpload`, and — same resolution as §2.1 — no empty state at all for a
  viewer who cannot upload, since there is truly no next action to offer them and the type forbids
  a fake one); the **upload notice** (`REQ-EVT-013` — "shared with everyone in the org," today a bare
  `<p>`) becomes `Panel tone="info"` with `InfoIcon`, sitting directly above `UploadWidget` so it is
  read at the point of upload, not buried.
- **`UploadWidget` moves onto `ui/file-drop`** the same way materials does: `accept=["image/jpeg",
  "image/png","image/webp"]`, `maxBytes` from `getPhotosPageData`'s new `limit_image_mb` select
  (mirrors §2.3 — one new column on an existing query, not a new table read), `requirements` stating
  the size before pick. `sniffKindFromFile` stays as today's client-side declared-kind guess; the
  server sniff (`process_photo`, the worker) is unaffected.
- **Takedown/restore**: `TakedownButton` becomes `ui/button pending pendingLabel`; the confirmation
  moves from `window.confirm` (today, `takedown-button.tsx:25` — a native browser dialog, unstyled,
  unlocalized-feeling even though its string comes from `t()`, and invisible to any test that does
  not stub `window.confirm`) into **`ui/dialog`** exactly as the discussion's own `DeleteConfirm`
  pattern already does (`comment-item.tsx:183-208`) — `REQ-UIX-013`'s "every destructive action
  confirms in a dialog naming the object" is a requirement, not a preference, and a photo takedown is
  exactly the destructive action it describes. Restore (staff-only, reversible, not destructive) keeps
  no confirmation, matching today.
- **A real gap this surfaces, not fixed this wave, flagged as a finding**: `REQ-EVT-010` ("an
  uploaded photo appears at once… without a refresh") does not match what `upload-widget.tsx`
  actually does today — `complete` only confirms the request was accepted (202), the photo appears
  once the worker's `process_photo` job finishes (EXIF strip, WebP derivative), and the widget's own
  comment says so plainly. The `notice`/`processing` text is honest about this gap, and I am keeping
  it exactly as-is (a `Panel tone="info"` version of the same sentence) rather than quietly
  implementing something REQ-EVT-010 promises and M5 did not build — realtime-pushing the finished
  photo into the gallery would need a new broadcast on `photos`' own table, which is schema/pipeline
  work outside "put the screen on the system." Raised as a question, §4.4.

## 4. Requests and questions

### 4.1 Request to the lead — two one-shot motion utilities in `globals.css`

For §1.3's reaction whisper, reusing the existing keyframes but not their existing (continuous,
long-duration) class applications:

```css
.reaction-dot {
  animation: dot-pulse 220ms var(--ease-out, ease-out) 1 both;
}
.reaction-ring {
  animation: ripple-ring 260ms var(--ease-out, ease-out) 1 both;
}
@media (prefers-reduced-motion: reduce) {
  .reaction-ring { display: none; }
}
```
(names negotiable — I will consume whatever the lead lands on). The universal reduced-motion rule
already zeroes both durations; the `display: none` line only needs adding for the ring, matching
`.ripple-ring`'s own treatment two lines above it (`globals.css:1012-1014`), so the dot and ring
never show even a one-frame flash.

### 4.2 Request to `sessions` — confirm `ui/textarea` fits the composer's auto-grow wrapper

`ui/textarea` (`TextareaProps = ComponentProps<"textarea"> & { invalid?: boolean }`, per
`ui/index.ts:195`) is a thin styled wrapper with no grow/measure behaviour of its own, which I read
as intentional — the grow behaviour is mine to build around it, not something to ask `textarea.tsx`
to grow itself into. Flagging only so `sessions` can correct me if `field-sizing`/measurement was
meant to live in `textarea.tsx` itself for every consumer, not just mine.

### 4.3 Question for the lead — an ungated empty state with no action

§2.1/§3: for a materials/photos viewer with no upload right, I am rendering **nothing** where the
list/gallery would otherwise be empty, rather than an `EmptyState` with a fabricated action, because
`EmptyState.action` is required and there is genuinely no next step to offer that viewer. Is "render
nothing" the right read of `REQ-UIX-012`, or should a manager-only empty state exist and a
non-manager instead get a quieter, action-less sentence outside `EmptyState` entirely (closer to
`Materials`'s pre-wave-6 `t("empty")` paragraph, just for the no-action case only)? Either is a small
change; I want the rule fixed once rather than guessed per-surface.

### 4.4 Finding, not a request — `REQ-EVT-010`'s "without a refresh" does not match the shipped pipeline

§3's last bullet: today's photo upload is honestly "processing, revisit to see it," not "appears at
once." Not fixing it this wave (it is pipeline/Realtime work, not a system-primitive swap); recording
it here so it is not mistaken for something wave 6 silently addressed.

### 4.5 Canvas check (`DEC-114`)

Materials/Photos/Comments have no dedicated canvas artboard (`STATUS.md`'s own finding, restated in
`.claude/agents/content.md`) — built from `System.dc.html`, `Main.dc.html`'s materials/discussion
sections, and the PRD, not transcribed from a picture that does not exist. Nothing in `Main`/
`EventPhone`/`EventEnded` contradicts a requirement as far as I can tell once its numerals are read
as Western (`DEC-124`) and its `box-sizing` overlap is read as the mockup artefact it is (`DEC-122`)
— no new canvas question beyond those two, already recorded.

## 5. Slot props I need from `sessions`

`docs/plan/notes/sessions.md` has no wave-6 section as of this writing, so this is what I am building
against and will reconcile once it lands:

- **`Comments`, `Materials`, `Photos` keep `SlotProps` exactly as `components/sessions/slots.ts`
  already defines it today** (`sessionId`, `memberId`, `locale` — all three already used; `Materials`/
  `Photos` currently only destructure `sessionId`/`locale`, `Comments` uses all three). No widening
  needed for anything in §1–§3 above — `viewerRelation` (the `RelationSlotProps` extension, `slots.ts:
  51`) is not something any of my three slots need to know for themselves, consistent with `16`
  §5.4.1a(b)/`DEC-103`'s rule that **the page**, not the slot, gates a section that can render
  nothing (comments/materials/photos already render "no heading of their own," per each file's own
  header comment, and that stays true).
- **`SLOT_NAMES`** (`slots.ts:55`) lists `RsvpPanel`, `AttendanceOutcome`, `Comments`, `Ratings` only
  — `Materials`/`Photos`/`Tasks` are not in it. Since `slots.ts` is `sessions`' file this wave, I am
  not adding to it myself; noting that the constant is stale against what the page actually renders
  (it has rendered Materials/Photos/Tasks since wave 2) so `sessions` can decide whether it is worth
  fixing or is simply unused for anything but documentation.
- **What I will check once `sessions.md`'s wave-6 section exists**: the exact `<section
  aria-labelledby>`/`id` the page wraps each slot in (for the sub-nav scroll-spy, `16` §6.3), and
  whether the page still calls `Materials`/`Photos`/`Comments` with a bare `{sessionId, locale}` or
  starts passing `memberId` to all three for consistency. Neither changes anything in this plan; both
  are drop-in either way.

## 6. Test/capture plan

`tests/components/event/{comments,comment-item}.test.tsx` extend for: the auto-grow composer, the
counter's six ICU forms at the boundary, the optimistic reaction (flips instantly, reverts on a
mocked failure), `axe-core` over a thread with a reply, an edit in progress, and a reported comment.
`tests/components/materials/{list,upload-form}.test.tsx` and `tests/components/photos/{gallery,
upload-widget}.test.tsx` extend for the `FileDrop` wiring (accept/maxBytes asserted **before** a file
is picked, per-file error) and `axe-core`. New: a reduced-motion assertion on the reaction (asserts
the end state, nothing mid-transition, matching `16` §7.5.5's gate) once request §4.1 lands.
`.qa-shots/rtl/wave6-content-*.png`: discussion empty / thread+reply / mid-composition / failed-post;
materials list / viewer; gallery + uploader — the eight states the definition of done lists, each
looked at at 390 px RTL before I call the surface done.

## 7. ★ Re-checked against disk after «numerals landed at `57f1103`»

Per the lead's rule ("re-read from disk before editing anything you did not write this session") —
checked every file this plan cites against `git log -1 -- <file>` and the sweep (`c20b901`) plus its
follow-up (`73b0f3e`) and the ownership-map update (`57f1103`). **The plan above stands unchanged**;
two things worth recording rather than silently folding in:

- **§2.3's DAL change is bigger than I first described.** I wrote it as "gain three columns on the
  existing `org_settings` select." On disk, `getMaterialsPageData`/`getProposalMaterialsPageData`
  read **no** `org_settings` at all now — the sweep deleted the numerals-only select they used to
  carry and neither function had another reason to query it. Same for `getPhotosPageData`: it had no
  size-limit read before the sweep either (the org's `limit_image_mb` check lives only inside
  `record_photo_upload`'s `SECURITY DEFINER` body, `0050_photo_pipeline.sql:88`, never surfaced to a
  DTO). So this is a **new** query in both places, not an extension — corrected in §2.3 itself, not
  just here.
- **My own draft had violated `DEC-124` once.** The example upload-notice string in §2.3 used
  Arabic-Indic «٥٠» for "50 MB." Fixed to Western «50» in place — worth naming because it is exactly
  the failure mode `tests/unit/messages-numerals.test.ts` exists to catch in `src/messages/**`, and a
  planning note is not exempt from the house rule any more than a comment is (`DEC-132`: "a comment
  is where the next author copies from" — the same is true of a plan).
- **Confirmed no other structural surprise**: `formatNumber`/`formatDateTime`/`formatTime` are
  single-argument now exactly as §1.3 anticipated; no DTO in `comments.ts`/`materials.ts`/
  `photos.ts`/`tasks.ts` carries `numerals` any more; `comment-item.tsx`'s reaction code
  (`likeCount`/`iReacted`, `comment-item.tsx:50-51`) is untouched by the sweep beyond its
  `formatNumber` call site, so §1.3's plan against it is still accurate line-for-line.
- **The three "decided, NOT this wave" items the lead named** (multi-day sessions `DEC-119…121`, the
  manual check-in switch + walk-ins `DEC-113/116/117/118`, gradient posters + `canvasRaise` `DEC-127`)
  touch none of §1–§3: no day-scoped material/task/photo, no check-in-switch affordance and no poster
  background appears anywhere in this plan already.
- **`ui/tag-chip`'s count** (DEC-123's «أتمتة 5» finding — the canvas's own chip renders its count at
  1.96:1, "worth a design answer," not yet a verdict) — checked `tag-chip.tsx` on disk: the count
  already renders with `className="text-fg-muted"` (`tag-chip.tsx`, unchanged by the sweep), the same
  token DEC-123 measured at 5.68:1 elsewhere in the app (the placeholder case). So the shipped
  component is not reproducing the canvas's low-contrast count today, as far as I can tell without
  running the actual contrast scorer — I am not touching `tag-chip.tsx` this wave (none of my three
  surfaces render `TagChip`), and I'm recording this as "verified, not regressed" rather than closing
  it outright, since I have not run the headless measurement DEC-123 itself used.

---

Ready for sync. This plan is complete for all three surfaces and re-verified against the swept tree;
nothing here is blocked on the owner. Two small requests are still open (§4.1 to the lead, §4.2 to
`sessions`, both non-blocking) and one genuine question for the lead (§4.3). Holding for the lead's
explicit go before the first source edit, per this reply's own "wait for my reply before starting
code."

## 8. Five more lead primitives went live (`1d73e89`) — folded in

Read the real implementations, not the stubs: `ui/link.tsx`, `ui/icon-button.tsx`, `ui/prose.tsx`,
`ui/page-header.tsx`, `ui/section-header.tsx`. All consumed by path, none edited.

- **`ui/link`** replaces the raw `next/link`/`Link` uses in my three surfaces where the destination
  is internal: `materials/list.tsx`'s "افتح العارض" (open-viewer) link, and the viewer page's
  "back to the session" link. **Not `quiet`** on either — both are inline text links, not a
  card-whole-surface link, so the pending dot is real, useful feedback (`ui/link.tsx`'s own
  distinction). External material links (`m.externalUrl`, a Google Slides/video URL) stay a bare
  `<a target="_blank" rel="noopener noreferrer">` — they leave the app, `ui/link`'s locale-prefixing
  has nothing to do there, and `REQ-MAT-007`'s "explicit indication of leaving the platform" wants an
  icon/notice `ui/link` does not carry, not its pending dot.
- **`ui/icon-button`** replaces the discussion's text-only action row for the four affordances the
  lead named — reaction, reply, report, delete — each becoming a 44 px square control with a
  mandatory `label` (so the accessible name survives losing its visible text). Icon mapping against
  the house set (`icons.tsx`, 34 exports, none added): reaction → `DotIcon` (already planned, §1.3 —
  doubles as both the glyph and the `IconButton`'s child); delete → `TrashIcon` (unambiguous); report
  → `AlertTriangleIcon` (the set's existing "flag a problem" glyph, same one `Panel`'s error framing
  reads from). **Reply has no obvious icon in the 34-export set** — flagged as request §4.6 below
  rather than guessed. **Edit and moderator remove/restore stay `ui/button`, not `IconButton`**: edit
  toggles a whole editing UI (not a single unambiguous glyph-shaped action) and moderation is a
  staff-only, infrequent action where a visible Arabic label reads as more deliberate than an icon a
  moderator has to hover to confirm — the lead named four controls, not six, and I'm reading that as
  a decision already made rather than an omission to extend on my own.
- **`ui/prose`** wraps the comment body (`comment-item.tsx`'s `<p className="mt-1 whitespace-pre-wrap
  …">{comment.body}</p>`) at `size="sm"` — the body text is plain (newlines only, no markup), so
  `Prose`'s `[&_p+p]`/`[&_h2]` rules do nothing extra, but its base rhythm (line-height 1.7, the
  `text-body-sm` ramp, no justification) is exactly right for a paragraph of member-authored Arabic
  and replaces a hand-rolled class string with the house one. **No material gets `Prose`** —
  `MaterialSummary`/`ViewerData` carry no description field today (title, kind, phase, render status,
  the substitution warning, the external URL — checked both DTOs on disk, §2 above), so there is no
  long-form text on a material to wrap; the substitution warning stays `Panel tone="info"` (§2.2),
  which is the right primitive for a short advisory line, not a paragraph.
- **`ui/page-header`** replaces the viewer route's hand-built `← back` link + `<h1>` (§2.2). Shape:
  `title={data.title}`, `breadcrumb={[{ href: `/app/sessions/${id}`, label: t("back") }]}` — reusing
  today's existing "back to session" copy key as the crumb label rather than fetching the session's
  real title for a one-level breadcrumb (`ViewerData` carries no session title today and I am not
  adding a join for a single generic crumb; `PageHeader`'s own worked examples — `Browse`, `Schedule`
  — show real category names because those breadcrumbs are two or three levels deep, which this one
  is not). `eyebrow` = the material's kind label (`t("materials.list.kind.pdf")` etc.), `meta` and
  `actions` left empty this wave — nothing in `ViewerData` yet justifies a meta chip row, and adding
  one is a scope decision, not a wiring one.
- **`ui/section-header`** — confirmed, no use in any of my three slots: the lead's own note ("your
  slots render none") matches what §1/§2/§3 above already say — the event page owns every `<section>`
  and `<h2>`, my three slots render content only. Recorded so this reply shows the note was read, not
  assumed unnecessary.

### 4.6 Request to the lead — no reply-shaped icon in `icons.tsx`

For `IconButton`'s reply control (above): the 34-export set has nothing that reads as "reply" at a
glance — `ArrowIcon` (`direction="back"`/`"forward"`, RTL-aware) is the closest shape, but an arrow
also means "next"/"previous" elsewhere in this exact codebase (`PageViewer`'s own next/previous
controls, §2.2) and reusing it for reply risks the same glyph meaning two different things on the
same page. Options as I see them: (a) `ArrowIcon` anyway, accepting the reuse since context
disambiguates; (b) a new icon (`icons.tsx` is lead-only, so this is a request either way); (c) reply
stays `ui/button` with its Arabic label, matching my read of edit/moderate above rather than forcing
a fourth control into `IconButton`. I have a mild preference for (c) — it is the smallest change and
"reply" benefits from a visible word more than "delete"/"report" do — but the lead named reply
explicitly, so raising it rather than quietly picking (c) myself.

---

## 9. Built and committed — all three surfaces, wave 6's floor and bar both attempted

The lead's go landed (§7, `57f1103`), then the five real primitives (§8, `1d73e89`), then rulings on
every open item: §4.3 → render nothing for a non-manager with nothing to show; §4.6 → option (c),
reply stays `ui/button`; §4.4 → recorded, not fixed; §4.2 → `sessions` fixed `min-h-32` (`7593967`).
One more ruling, not in my plan: badge/tag-chip/avatar move from pills to the canvas's 6 px rounded
squares (`rounded-field`) — done first, its own commit, §9.1 below.

### 9.1 `6182ed1` — badge/tag-chip/avatar: rounded squares, not pills

`rounded-full` → `rounded-field` on `Badge`, `TagChip`'s outer chip (the remove control's own small
circular hit area is unnamed and stays round), `Avatar`/`AvatarStack`'s ring. tsc clean, lint clean,
all 51 existing tests unchanged (none asserted the pill shape).

### 9.2 `3151630` — `CardMedia.dimmed` and `TagChip.selected`/`removeHref`, for `sessions`

The lead landed the *types* for `sessions`' requests at `607ecbe`; this is the *implementation*, since
`content` owns `card.tsx`/`tag-chip.tsx`. `dimmed`: grayscale + reduced opacity on the image/
placeholder only, never `overlay` (DEC-123 item 1 — the canvas's own defect was nesting the status
badge INSIDE the dimmed element). `selected`: `aria-current="true"` on the link (never
`aria-pressed` — a link is not a toggle button) plus a filled navy/white pair, so "applied" is never
colour-alone. `removeHref`: removal as a link, works before hydration. The remove control's hit area
grew `size-4` → `size-6` (24px), clearing WCAG 2.5.8 (DEC-123's touch-target sweep). Both files' own
internal `Link` moved onto `ui/link` with `quiet` (R-C4) — a card-whole-surface link and a dense
inline chip row are exactly `ui/link`'s own documented case for suppressing the pending dot.

### 9.3 The three surfaces, in build order

**`40e23a6` — the discussion.** Auto-grow (a real `scrollHeight` measurement, not `field-sizing`
alone — needed a DOM ref `ui/textarea`'s plain-function-component shape does not forward, so the
composer's own field is a raw `<textarea>` reusing `controlClass()` directly, not `<Textarea>`); the
remaining-length counter, all six Arabic ICU forms, silent until 200 characters from the cap; the
failed-post text was already kept (unchanged), now visible via an adjacent `Panel` AND a persistent
toast. Reaction/report/delete → `IconButton` (`DotIcon`/`AlertTriangleIcon`/`TrashIcon`); reply/edit/
moderate stay `ui/button`. The reaction is optimistic (`useOptimistic`, reverts on failure, no visible
pending state — the whisper motion IS the feedback) and fires `.reaction-ignite`/`.reaction-ring`
only on the false→true transition, cleared by a fixed 400 ms timer rather than `onAnimationEnd` (the
ring is `display:none` under reduced motion and animation events on a never-painted element are not
something to depend on). `commentsSummary()` new; `Comments()` returns `null` exactly when frozen
and empty (REQ-EVT-003: a member may still post otherwise).

**`a0448bf` — materials.** List rows on `Card density="row"`, `Badge` for قبل/بعد, `Progress` for a
pending render, `Panel` for the substitution warning. The viewer route gets `ui/page-header` (a
one-crumb breadcrumb reusing the existing "back" copy — `ViewerData` has no session title to join
for a single crumb). Both uploaders (materials and proposal-materials) move onto `ui/file-drop`,
stating the org's real per-kind limit before a file is chosen — a **new** `org_settings` query in
`getMaterialsPageData`/`getProposalMaterialsPageData` (neither read it at all after the sweep, not
even for numerals, contrary to my own first draft's guess in §7). Two real bugs found building this,
both fixed, neither hypothetical: an inline `onFiles` closure recreated every render put
`ui/file-drop`'s own effect into an infinite loop (`useCallback` breaks it — cost a genuine hung test
run before I traced it); `ui/link`'s automatic locale prefix would have doubled the old manual
`/${locale}` prefix carried over from the `next/link` import it replaced.

**`3d185d0` — photos.** The grid stays plain — `Card` has no `href` to hang its "whole thing is one
link" contract off a photo tile that opens nothing. Hidden badge → `Badge`; the upload notice → `Panel`
with `InfoIcon`. `TakedownButton`'s request-hide moves from `window.confirm` to `ui/dialog`
(REQ-UIX-013); restore stays a plain click, staff-only and reversible by construction. `imageLimitMb`
is new on `getPhotosPageData` for the same before-a-file-is-chosen reason as materials.

**`05e511b` — tasks, light touch.** `tasksSummary()` (the fourth reader the contract requires) and an
`EmptyState` in place of a bare paragraph — nothing else; `TaskItem`/`CreateTaskForm` untouched.

### 9.4 Verified, and how

`npx tsc --noEmit` clean across every file this track owns (the only remaining errors are `sessions`'/
`console`'s own in-flight files — `app/sessions/page.tsx`, `lib/dal/search.ts`, `browse/session-card.tsx`,
`admin/sessions/**` — never touched here). `npm run lint`: 0 errors (20 pre-existing warnings, the
launch-era baseline, unchanged). `npm test` on every touched directory: 88/88 in
`tests/components/{event,materials,photos,tasks}/` plus `tests/unit/content-i18n.test.ts`; the full
`npm test` run: 1160/1161, the one failure (`admin.proposals.rejectConfirmTitle`) is `sessions`'/
`console`'s own key, untouched by anything here. `npm run test:rls` on
`{materials,photos,event-comments,realtime}-schema.test.ts`: 70/70 on a clean re-run (a combined run
hit two 20 s timeouts on unrelated tests — `event-comments`' edit-window case and `realtime`'s
cross-org case, neither touching anything this wave changed — that cleared on an isolated re-run,
consistent with local DB contention from an earlier stuck process, not a regression). `axe-core`
added to `comment-item`, `comment-composer`, `comment-list`, `materials/list`, `photos/gallery`.

**A real bug found and fixed mid-build, worth recording on its own:** my own first draft of the
`requirementAudio`/`requirementPdf`/etc. messages tripped `tests/unit/content-i18n.test.ts` twice —
once for a literal Western digit outside ICU syntax ("MP3", "M4A" both contain one baked into the
format name itself, not a counted quantity) and once for an un-isolated `{limitMb}` interpolation
(the established `{count, value}` convention I'd followed elsewhere is plural-exempt; a bare
non-plural `{limitMb}` needs `<bdi>{limitMb}</bdi>` in the message itself, matching the pre-existing
`sizeLimitExceeded` key I should have matched from the start). Fixed: `requirementAudio` reworded to
name WAV/OGG and "similar formats" rather than spell out MP3/M4A; all four `requirement*` keys wrap
`{limitMb}` in `<bdi>`; the component call sites use `t.markup(...)` (a plain string, matching
`FileDrop.requirements: string[]`) rather than plain `t(...)`.

### 9.5 Not done — genuinely blocked, not skipped

**No real `npm run test:e2e:local` run, and no `.qa-shots/rtl/wave6-content-*.png` captures.** Both
need a server started from a FRESH `.next` build reflecting today's work — `scripts/e2e-local.mjs`
refuses to run without one ("Run `npm run build` first"), and the `.next` on disk right now
(12:28–12:29) predates essentially all of the component code in §9.3. `npm run build` is lead-only
this milestone. The e2e specs themselves ARE updated for the new markup and pass `tsc`/lint
(`event-comments.spec.ts`'s delete locator now walks two levels, not one — the body moved one level
deeper into `ui/prose`'s own wrapping div; `materials.spec.ts`'s upload now targets
`#materials-upload-form input[type="file"]`, since `ui/file-drop`'s hidden input carries no
accessible label the old `getByLabel("الملف")` depended on; `photos.spec.ts`'s takedown test opens
the dialog and confirms inside it, scoped with `getByRole("dialog")`, instead of accepting a native
`window.confirm` that no longer appears) — they are ready to run the moment a fresh build exists.
**Asking the lead**: either build and hand the gate lock back for me to drive these three specs
through it, or fold them into the wave's own `qa`/`e2e` pass at sync — whichever fits the wave's
rhythm better.

Ready for sync. All four commits above are on `wave-6/screens`. Nothing is blocked on the owner;
one thing (§9.5) is blocked on the lead's next build.

---

## 10. The lead's real-build findings, fixed — `e533ad8` … `9a8340a`

Two runs against a real build (`448ff6d`, `68e645d`) found five things, three real failures and two
390 px findings on the owner-named discussion surface. All fixed:

1. **`materials.spec.ts:198` (both projects)** — a latent, pre-wave-6 bug, not a regression: the
   substitution-warning wording changed from «استُبدل الخط» to «غير مضمَّن» when DEC-058 reworded it
   for PDF-only uploads (`2f336a2`); the e2e assertion was never updated and had been silently unable
   to pass since. Fixed to the current wording (`133b26c`).
2. **`photos.spec.ts:199` (desktop, 30 s timeout)** and **3. `event-comments.spec.ts:123` (phone)** —
   the SAME root cause: `DeleteConfirm`/`TakedownButton`'s confirm button was `DialogClose asChild`
   wrapping an `onClick` that starts a transition (`ReportDialog`'s `type="submit"` had the analogous
   shape). Composing Radix's own close-on-click with a caller's handler via `asChild` is documented
   Radix usage, but it is not a pattern worth continuing to lean on for a handler that also has to run
   reliably — both dialogs are now controlled (`open`/`onOpenChange`), with a plain button that closes
   and fires the action as two ordered statements I own end to end (`e533ad8`, `358eac4`).
4. **★ FileDrop's copy order** — «أو اسحب…» sat above «اختر ملفات», so "or" preceded the choice.
   Swapped: the button (the one affordance with no drag equivalent) first, the drag hint after
   (`09d02a4`).
5. **★ The discussion's doubled empty-state CTA** — the owner's own named surface. An `EmptyState`
   card offering "write the first comment" sat directly under the already-visible composer — the one
   action doubled, and the one that looked primary was not the composer. Reverted to a quiet sentence,
   no button; the composer is unconditionally the next action whenever that branch is reachable at all
   (`e533ad8`).

**Also fixed along the way, not one of the five but the same class of finding** — both uploaders'
submit buttons were enabled with nothing ready to submit (no file for photos; no title/file for
materials), reading as dead primaries. Both now disabled until ready (`133b26c`, `358eac4`).

### ★★ A git mistake, caught and fixed the same turn

`358eac4` accidentally deleted `src/components/sessions/focus-clearance.tsx` — `sessions`' own file,
nothing I intended to touch. Root cause: `git add <my files> && git commit -m "..."` without a
trailing `-- <paths>` commits the WHOLE index, not just what was just staged — a deletion `sessions`
had already staged in this shared index (presumably mid-way through their own next commit) rode
along with mine. Restored byte-for-byte in `9a8340a`, verified against `sessions`' own last commit of
it (`05f739a`) — exact match. No build ran against the broken state. Told `sessions` directly. Every
commit from here is `git commit -m "..." -- <explicit paths>`, which is what a shared index actually
requires and what I should have been doing from my very first commit this wave.

**★ Correction, same day:** the deletion was INTENTIONAL — the lead had moved `FocusClearance` into
the shell and asked `sessions` to remove the event page's own copy; `sessions` had staged exactly
that removal when my commit swept it in. My restore (`9a8340a`) brought back an orphan nothing
imports, and `sessions` deleted it again at `17404f9`. The lead's rule going forward, stated plainly
and correctly: **never restore, create or delete a file outside my ownership, even to undo my own
mistake — tell the lead or the owner instead, since only that file's owner knows whether the state I
see is intended.** Owning the mistake was right; acting on it unilaterally was not. Not touching that
file again.

---

## 11. The discussion review — two blockers, one real debugging story — `44485b8`

The lead's own capture pass of the owner-named discussion surface (five captures, 390 px phone,
`68e645d` build) found two blockers and three judgement items. Full detail is in the commit; the part
worth keeping here is how blocker 1 was actually found, because the first two hypotheses were wrong
in instructive ways.

**★★ BLOCKER 1 — the composer stayed `aria-busy` indefinitely after one post**, through typing new
text and past 3890 characters, 80+ seconds observed live. My first hypothesis: `router.refresh()`,
called as the last statement inside the SAME `startTransition` a component's own `pending` is read
from, races with sibling components' own `router.refresh()` calls (a reply post, a reaction) and
Next's router dedupes the underlying request in a way that starves an earlier caller's own "done"
signal. I moved `router.refresh()` into `setTimeout(…, 0)` for all five actions across both files —
genuinely outside the tracked transition — and wrote a test to prove it.

**The test lied, in an instructive way.** `expect(button).toBeEnabled()` immediately after a
successful clear FAILED — not because `pending` was stuck, but because the button is CORRECTLY
disabled at that instant: an empty composer has nothing to submit (`body.trim().length === 0`,
`Button`'s own `disabled || pending`), and that's a completely different reason than the bug. This is
exactly the shape of assertion every earlier test here (including mine) would have written — check
that something the action did (a toast, a cleared field) happened — and it is presumably WHY nothing
caught this sooner: the button's `disabled` and the button's `pending` were never independently
verified.

**Bisecting properly**: removing `router.refresh()` ENTIRELY from the transition (not moving it,
deleting the call outright) made NO DIFFERENCE to the false-positive test above — proving the
`setTimeout` fix does not address whatever THAT specific jsdom symptom was, because that symptom
was never `pending` in the first place. The test that actually exercises the real complaint — type
fresh text AFTER a successful post, then check `aria-busy` directly rather than the button's overall
enabled state — passes cleanly, with or without the `setTimeout` change, in jsdom's mocked
environment.

**Recorded honestly, not smoothed over**: I cannot confirm from here that `setTimeout` is what fixes
the live-build failure specifically — jsdom cannot model Next's real router/RSC internals closely
enough to know for certain, and the mocked `router.refresh()` in every test here resolves trivially
either way. What I can say: the change removes a coupling I could identify and articulate, is
unconditionally safe (a macrotask genuinely runs outside any transition), and matches the lead's own
hypothesis. Whether it is the WHOLE fix is the next build's question, not something claimed here.

**BLOCKER 2** (success toasts covering the thread) and the **reaction affordance redesign** (a literal
filled vs. outline circle, not a colour/opacity shift on the same glyph) are more straightforward —
see the commit for both. One e2e locator bug fixed alongside (`event-comments.spec.ts:103`, the same
outer/inner `<li>` nesting trap the delete locator already had to account for).

Ready for sync.

## §12 — the re-drive: which commit, the cross-component test, the token bug

**Which commit fixed the two blockers**: 44485b8, not e533ad8. e533ad8 landed one dialog-timeout fix
and one empty-state fix only — the `setTimeout(…, 0)` decoupling of every `router.refresh()` (both
blockers' actual fix) is 44485b8, which came after. The lead's captures and re-drive message predate
both e533ad8 and 44485b8, so this note exists to say plainly: the fix the re-drive re-asked for was
already in the branch by the time the message arrived, at 44485b8, three commits before the re-drive.

**The specific test the lead asked for** — "post, then react, then the composer's button is idle" —
is now `comment-list.test.tsx`'s new describe block (da1b09c). It is the cross-component shape blocker
1 actually was: `CommentComposer` and `CommentItem` are siblings under `CommentList`, each with its
own `useTransition`, and the live failure was one sibling's `router.refresh()` leaving another
sibling's transition unsignalled. Same honesty caveat as §11's blocker-1 test: jsdom's
`useRouter().refresh` is a no-op stub that cannot fold two calls together the way the real router did
live, so this proves the composer's `pending` never depends on a sibling's action at all — necessary,
not sufficient. The real mechanism is only provable against a real build.

**The navy-token bug (23698df)**: real, exactly as reported. `MEDIA_TINTS` (card.tsx) and `TINTS`
(avatar.tsx) both referenced `bg-navy-600`/`bg-navy-200` — `globals.css` only ever defined
navy-1000/950/900/850/800 and silver-100…400. Worse: `avatar.test.tsx`'s own `TINT_PAIRS` had
independently fabricated hex values for the same two fake tokens and never caught the drift, because
it was a hand-copied duplicate rather than a read of the real file. Fixed by swapping the two entries
for `navy-900`/`silver-200` (both real, keeping the dark/light balance) in both arrays, and — more
durably — exporting both arrays for the first time and adding a test in each file that reads
`globals.css` directly and asserts every class against the real `--color-*` set, so a typo like this
one fails a test instead of rendering invisibly. `placeholderGlyph` (card.tsx) also went from two
letters (reading as a pause glyph, «اا», on any title starting with «ا» twice) to one, skipping a
leading «ال» — `card.test.tsx` covers the skip and the "«ال» alone" edge case.

**Housekeeping**: the three `.bak`/`.bak2`/`.bak3` files the lead flagged were already gone — `find`
across the tree found none, tracked or untracked. Nothing to `rm`; noting it here rather than staying
silent about a request I did nothing for.

Ready for sync.

## §13 — the second blocker: aria-busy stuck after a slow post

The lead's diag (aria-busy polled every 500ms against a served build, POST held ~1.5s then
released): stuck `aria-busy="true"` and a disabled button for several seconds after the response
arrived, clearing only when the member typed. Suspected mechanism, per the lead: `setTimeout(fn, 0)`
(44485b8's own fix) is a macrotask, but a macrotask can still run before the browser paints the
current frame, so `router.refresh()` — its own update, a real RSC refetch — could start before this
transition's `pending=false` had actually been painted.

**Fix (4582b17)**: replaced `setTimeout(fn, 0)` with `afterPaint(fn)` — two nested
`requestAnimationFrame` calls, the standard "wait for the browser to have painted" idiom — across
all five call sites sharing the pattern: `comment-composer.tsx`'s `submit()`, and
`comment-item.tsx`'s `saveEdit`/`deleteMine`/`moderate`/`toggleLike`. Confirmed empirically that
`vi.advanceTimersByTimeAsync` flushes queued `requestAnimationFrame` callbacks too, so the fix stays
testable under fake timers.

**On the jsdom test, honestly**: before writing the real test, I spent real effort trying to actually
REPRODUCE the stuck state in jsdom, on the code as it stood before this fix — fake timers advancing
1500ms, real wall-clock timers with no fake anything, an `act()`-wrapped settle, and a mock
`router.refresh()` that itself calls React's `startTransition` around its own slow (2s) update, to
simulate what Next's real router does internally. Every single configuration resolved `aria-busy`
cleanly and promptly, even on the PRE-fix code. The mocked `postCommentAction` is a `vi.fn()`;
whatever the real bug's mechanism is, it almost certainly lives inside Next's actual Server-Action-
dispatch client runtime (`callServer` and friends), which never executes at all under a mock — so no
jsdom test built on this mock can discriminate the bug from the fix. I wrote the test the lead asked
for anyway (`comment-composer.test.tsx`, in 4582b17) as the regression guard it's meant to be — it
documents the intent and would catch a component-level regression — but said plainly in its own
comment that it passes on both sides of the fix and isn't proof the live symptom is gone.

Ready for sync.

## §14 — DEC-135: adopting usePendingNudge

Root cause landed by the lead (`DEC-135`, `docs/plan/DECISIONS.md`, `5376c32`): the stuck «نشر» was
never a timing race in my own code. React 19.2.4 can lose the ping that would resume a transition
once a Flight chunk resolves synchronously mid-render, and nothing is then scheduled to retry —
measured at one press in three on a real build. My two earlier attempts (`setTimeout(…, 0)` at
44485b8, `afterPaint` via double `requestAnimationFrame` at 4582b17) each only moved the odds, since
both treated a symptom (the refresh racing this transition's own completion) of a cause that was
never about timing at all.

**Applied (1fd7980)**: deleted `afterPaint` from both event files, put `router.refresh()` back as the
last statement inside its original `startTransition` (pre-44485b8 shape), and called
`usePendingNudge(pending)` once per component in `comment-composer.tsx`/`comment-item.tsx`. Rewrote
both files' module comments to cite DEC-135, not "overlapping refreshes" or "a macrotask before
paint" — those explanations are retired now, not just superseded.

**Untracked refreshes found and fixed**: `materials/upload-form.tsx` and `photos/upload-widget.tsx`
both called `router.refresh()` from a manually-managed `busy` boolean, entirely outside any
transition — meaning DEC-135's race applied to them too and nothing was even ATTEMPTING to track it.
Converted both to `useTransition`, feeding `pending` to both the button's busy state and
`usePendingNudge`.

**Audited each candidate against the lead's own stated rule** ("a Server Action which revalidates or
refreshes") rather than adding the hook mechanically everywhere named:
- `tasks/task-item.tsx` (`TaskItem` and `TaskForm`) and `photos/takedown-button.tsx` — all four
  actions they await (`toggleTaskCompletionAction`, `submitTaskFormResponseAction`,
  `requestPhotoTakedownAction`, `restorePhotoAction`) call `revalidatePath` server-side. Added.
- `materials/settings-form.tsx` — checked `saveMaterialSettings`/`updateMaterialSettings`: neither
  calls `revalidatePath`/`revalidateTag`, and the component never calls `router.refresh()` either
  (both fields are purely local optimistic state). Added `usePendingNudge` anyway, since the lead
  named this exact file — it's a no-op today, kept as a defensive guard against a future change to
  this action reopening the race silently. Flagged the discrepancy to the lead rather than silently
  complying or silently skipping.
- `materials/[materialId]/download-button.tsx` — NOT touched. `requestMaterialDownload` only reads a
  signed URL, no revalidation, and the button navigates via `window.location.href` (a hard browser
  navigation, not a Next transition) — nothing here can hit DEC-135's race at all.

tsc clean, lint 0 errors, 89/89 component tests green (event, materials, photos, tasks).

Ready for sync.

## §15 — the photos empty state's duplicate button

Found from a 390 px capture at 5376c32: the empty gallery's `EmptyState` carried its own enabled
«إضافة صورة» action, wired to the SAME `upload.action` label the uploader's own submit button already
uses right below it — duplicate accessible name, one of the two disabled.

Checked the lead's second bullet (keep the button only where the uploader is NOT rendered) against
the actual code: `if (photos.length === 0 && !canUpload) return null;` already returns null upstream
whenever the uploader would be absent, so every path that reaches the empty-state branch has
`canUpload === true` — the uploader is NEVER absent there. That hypothetical case is structurally
unreachable in this component, so there was nothing to preserve; text-only unconditionally.

Fixed (9752358): `EmptyState` replaced with a plain quiet sentence, same shape as the discussion's own
empty state. Test now asserts exactly one "إضافة صورة" button remains, guarding the regression
directly rather than just checking presence.

Ready for sync.

## §16 — a slow post wiping the next comment being typed

Found by the lead's discussion review on a real build (DEC-135 verified separately, sha 1fd7980
confirmed: a held post's lost ping committed at the nudge's first tick). Separate, real defect: a
member typing the next comment into the SAME field while an earlier, slow post is still pending had
it silently wiped when that earlier post succeeded — `submit()`'s success path cleared `body`
unconditionally, and only the BUTTON is disabled while pending, not the textarea itself.

**Fixed (d5f8b10)**: a `bodyRef` mirrors `body` via an effect, always current; the success path now
clears the field/mentions/candidates only when `bodyRef.current === trimmed` — nothing changed since
THIS post was submitted. `trimmed` itself (the closure's own captured value) can't be compared against
directly, since a closure comparing a frozen value against itself is always true — the check needs the
field's true, live value. `onPosted?.()` and `router.refresh()` stay unconditional, per the lead's
explicit "keep the rest of the success path as is."

Added the exact test requested: type, submit, change the text while the mocked action is still
pending, resolve it, assert the new text survives. Unlike the DEC-135/blocker-1 tests, this one is
pure synchronous state-comparison logic with no React-scheduling ambiguity — no jsdom-limitation
caveat needed here; it directly proves the fix.

Ready for sync.

## §17 — catching network-level rejections across every transition

The lead's real-build finding: a request failing at the NETWORK level (offline, a dropped
connection) makes the Server Action call itself REJECT, not return an `{error}` value. Uncaught
inside `startTransition`, that's a render error — React replaces the WHOLE event page with the
route's error boundary, losing whatever the member typed. Fixed with try/catch at every transition
call site across my four surfaces (event, materials, photos, tasks) — 9 call sites in 7 files.

**toggleLike's rollback, reasoned rather than assumed**: the lead asked for an explicit rollback of
the optimistic reaction on a throw. Read `useOptimistic`'s own reducer first: `count: likeCount +
(nextReacted ? 1 : -1)` always computes off the REAL base total (`likeCount`, a prop), never off the
CURRENT optimistic value — so a second `setOptimisticReaction` dispatch trying to "undo" the first
has no value that reconstructs the exact original pair; it would either repeat the flip or land one
off. No redispatch added. Catching the throw lets the transition settle NORMALLY instead of crashing,
and `useOptimistic` discards the optimistic override once it does — the identical mechanism the
existing `result.error` branch already relied on (confirmed by its own comment, unchanged). Added a
test proving this holds for a THROW, not just a returned error, since the mechanism is the same one
but exercised via a different exit.

**settings-form.tsx is the one real exception**: no `useOptimistic` there, so nothing reverts
automatically — added an explicit `previous` capture and revert, plus wired in `useToast` (this
component had neither error handling nor a toast import before this).

**Broadened beyond comments**: the lead's list named uploaders/tasks/takedown explicitly ("wherever
an awaited Server Action sits in a transition without a catch") — I read this as covering the
uploaders' `fetch()` calls too, since an uncaught fetch rejection is the identical crash shape even
though it's a Route Handler, not a Server Action. Wrapped both upload forms' entire request chain.

**New message keys, ar first**: `event.comments.errors.network`, `tasks.list.toggleFailed`,
`materials.list.settingsFailed` (reused `materials.list`'s existing `uploadFailed`/photos.gallery's
`requestHideFailed`/`restoreFailed`/tasks.form's `submitFailed` where the existing wording already
fit, rather than adding redundant keys).

**Test-file discovery**: `ui/button`'s pending label gets concatenated into the accessible name
(`SpinnerIcon`'s own `aria-label`) while `pending=true` — a fast lookup by exact button name during
that window can miss it; and `comment-item.tsx`'s save button's real label is "حفظ التعديل", not
"حفظ" — caught both while writing the new tests, not guessed.

tsc clean, lint 0 errors, 93/93 component tests (event/materials/photos/tasks), 698/698 unit tests.

Ready for sync.

## §18 — the materials capture: system controls, Arabic quoting

Two items from the materials capture at 296aec4 (row 8).

**settings-form.tsx onto ui/select/ui/checkbox (9a71f48)**: swapped the raw native `<select>`/
checkbox for `sessions`' `ui/select`/`ui/checkbox` — import only, no edits to those files. `ui/select`
has no size prop at all (always renders "md", a pre-existing limit I already knew about from the
earlier `<Select size="sm">` type-error fix); used it as-is rather than asking for a variant I don't
actually need yet — the row isn't dense enough to obviously require one. Noting here per the lead's
"say so in your note" in case the real-build capture at the next density shows otherwise. Added the
FIRST dedicated test file this component has ever had (six tests: renders, both optimistic updates,
both network-failure reverts, axe) — the network-failure try/catch from the previous fix had zero
test coverage until now.

**Arabic guillemets, not ASCII quotes (de8db45)**: `substitutionWarning.body`'s ar string quoted the
font name with `\"..\"` — switched to `«..»`, matching house convention (`10` §3). `en` keeps plain
`"quotes"`, its own convention, untouched — checked before assuming otherwise. Two component tests
(`list.test.tsx`, `proposal-list.test.tsx`) had the old ASCII-quoted sentence hardcoded for an exact
`textContent` match; updated both.

Ready for sync.

## §19 — 5-failed and 6-frozen: three items from the discussion review

**1. Double error feedback, composer only.** Dropped the toast from `comment-composer.tsx`'s
network-catch path — the inline Panel is the right feedback per REQ-UIX-010, and the toast repeating
the identical sentence covered the thread at 390 px. Deliberately did NOT touch `comment-item.tsx`'s
`saveEdit`/`submitReport` network catches, even though they have the exact same "inline Panel +
identical toast" shape — the lead's ask named the composer specifically ("For the composer..."), and
the general principle they stated afterward ("Keep toasts only where there's no inline spot") could
be read as extending further, but I chose not to guess. Flagged this explicitly in my report rather
than silently narrowing OR widening the fix.

**2. Missing period.** `errors.network`'s ar string was the one sentence in `event.json` missing its
final «.». Fixed. Checked my other two new network-adjacent keys (`materials.list.settingsFailed`,
`tasks.list.toggleFailed`) for the same gap on both ar/en — both already correctly punctuated when I
wrote them, nothing else needed fixing.

**3. Reactions on a frozen thread.** `comment-item.tsx` takes a new `frozen?: boolean` prop; when
true, the `IconButton` reaction toggle is withdrawn entirely (no interactive control offering an
action RLS would refuse anyway) and only a read-only count shows, and only when non-zero. Threaded
from `comment-list.tsx` to BOTH the top-level and reply `<CommentItem>` instances (the reply list was
easy to miss — same prop needed at both call sites). Report is untouched, per the ask — moderation
still needs to work on a frozen thread.

tsc clean, lint 0 errors, 52/52 event component tests (3 new frozen-state tests), 698/698 unit tests.

Ready for sync.

## §20 — the same toast drop, extended to saveEdit/submitReport

The lead confirmed: apply the same rule I flagged as a discovered-but-not-yet-widened parallel in
§19 — `saveEdit` and `submitReport` both carry the identical "inline Panel + toast repeating the
same sentence" shape as the composer's own fix. Dropped the toast from both functions' catch AND
`result.error` branches. `deleteMine`/`moderate`/`toggleLike` are unchanged — no inline spot, matching
the lead's own examples. `submitReport`'s SUCCESS toast stays: the dialog has already closed by then
(no inline Panel for a success state to duplicate).

Tightened the existing saveEdit network test from "at least one match" to exactly one, and added the
equivalent test for submitReport's network catch (previously untested).

53/53 event component tests, tsc clean, lint 0 errors.

Ready for sync.

## Wave 7 plan

Planning only, per the spawn brief. Read `STATUS.md`'s START HERE block and wave-7 block, `CLAUDE.md`'s
wave-7 ownership map, `DEC-110` … `DEC-139` (the last two, `DEC-138`/`DEC-139`, landed on disk after
spawn — `global-error.tsx`'s path and `REQ-EVT-010`'s pipeline amendment), `16` §6.5/§6.8.3/§7,
`01-prd.md` `REQ-PRF-*`, `REQ-PTS-*`, `REQ-CRT-*`, `REQ-NTF-*`, `REQ-CAL-*`, `REQ-CHK-017`,
`REQ-DSC-006`, `09-sitemap-screens.md`'s sitemap tree and route table (SCR-021 … 026 have no dedicated
write-ups beyond the tree — SCR-021's row literally says «my profile», nothing more), and the current
code of all seven `/app/me` routes, their components and every DAL module they read. Also re-read the
regenerated `.claude/agents/content.md` on disk (not the wave-6 copy in this session's spawn context) —
it changes the test-file edit list (`tasks.spec.ts` is now mine) and adds carried item **T8**
(`DEC-139`).

### 1 — The hub's IA: seven routes, six canvas tabs, and why they do not simply align

`16` §6.5 names six tabs — **القادمة · الحاضرة · المقترحات · المحفوظات · الشهادات · النقاط** — and
the tree (`09` §1) has seven routes under `/me`: profile (SCR-021, `/app/me` itself), points (022),
certificates (023), bookmarks (024), calendar (025), notifications (026), privacy (`REQ-PRF-006/007`,
no SCR number, M13 in the route table but pulled into wave 7 by `DEC-137`'s T7). Three of the seven —
calendar, notifications, privacy — are not in §6.5's six-tab list at all, and three of §6.5's six —
**القادمة** (upcoming), **الحاضرة** (past/attended), **المقترحات** (proposals) — name content this
track has neither the route nor the DAL access to build this wave:

- **القادمة/الحاضرة** read as a merged "my sessions" view — upcoming commitments and past attendance
  outcomes. That data lives in `rsvp.ts`/`checkin.ts` (`checkin`'s, not in my edit list, not even
  add-only) and `sessions.ts` (`sessions`', explicitly in my **never** list). `/app/sessions` already
  is exactly this for the general case (`DEC-112`'s timeline, `sessions`' wave-6 build, date-grouped,
  the member's own next commitment first) — building a second, narrower "my sessions" view under `/me`
  would duplicate it with data I cannot read.
- **المقترحات** is `/app/propose` and `/app/propose/[id]`, literally itemized to `sessions` in the
  wave-7 checklist (S1/S2), not to me, and reads `proposals.ts` (also in my never list).

So building literal **القادمة/الحاضرة/المقترحات** tabs this wave would mean either reading another
track's DAL (against the "add-only, never a changed signature/select" rule and against the never-touch
list naming those exact files) or faking the content. Neither is right. Reading `DEC-114`'s own rule —
*"a mockup that contradicts a requirement is a question, not an instruction… raise it; do not implement
it and do not silently correct it either"* — I am treating this the same way: **raised as question 2
below, not silently built and not silently dropped.**

**Proposed resolution**, pending the lead's ruling: `me/layout.tsx` renders a persistent tab strip on
`ui/tabs` (console's, import-only — `Tabs` already supports `item.href` for a real navigation link per
tab, exactly this shape: *"the admin sub-nav and any URL-addressable tab strip use this"*) with **seven
items matching the seven real routes**, `value` derived from the active path segment in a small client
wrapper (`ui/tabs`' own documented pattern: *"`value` stays the caller's source of truth, typically
derived from the current route"*). This is exactly the *"chips → tabs, not unreachable → reachable"*
migration `16` §6.5 itself describes: `me/page.tsx:29-37` already renders a six-item chip nav today
(notifications, calendar, certificates, points, bookmarks, privacy) — the seventh, the profile edit
form, is `/app/me`'s own content, not a chip pointing at itself. I am proposing the tab strip simply
promotes that existing six-chip nav plus a first "profile" tab, using labels that borrow §6.5's spirit
where they map cleanly (**النقاط**↔points, **الشهادات**↔certificates, **المحفوظات**↔bookmarks) and the
sitemap tree's own Arabic for the rest (الملف الشخصي, التقويم, الإشعارات, الخصوصية).

**What `/app/me` itself renders**: the profile edit form, unchanged in substance (`REQ-PRF-001`), on
`sessions`' `Field`/`Input`/`Select`/`Textarea`/`Checkbox`/`FormSummary` in place of the current raw
inputs. **Proposed addition** (question 3): one `Stat` (mine, `ui/stat.tsx`, already built —
`label`/`value`/`hint`/`href`) showing the points balance via `getPointsStripData()` (already exists,
`points.ts`, already used by the home page's own strip), linking to `/app/me/points` — the one piece of
"renders content, not links" §6.5 asks for that content's own data actually reaches this wave. Not
upcoming sessions, not proposals — just the one number I can honestly show. If the lead would rather
keep `/app/me` exactly the form (smaller diff, no new visual element to review), I drop it.

**No auth or data gate in `me/layout.tsx`**, confirmed against the DAL convention (`requireSession()`
close to the data, never in a layout, `CLAUDE.md`'s Data access §3) — the layout only renders the tab
chrome and `{children}`; every page underneath still calls its own DAL functions, which still gate.

### 2 — The seven routes

**T1 · `/app/me` (SCR-021).** Components: the profile form rebuilt on `Field`/`Input`/`Select`/
`Textarea`/`Checkbox`/`FormSummary` (sessions'), `Panel` (mine, saved/error banners, replacing the raw
`role="status"`/`role="alert"` paragraphs), optional `Stat` (§1). DAL: `getMe`, `listCompanies`,
`updateMyProfile`, `profileInput` — all in `members.ts`, already correct, no new exports needed.
**Bug found while reading, fixed in the same commit:** `me/actions.ts`'s `saveProfile` hard-codes
`redirect("/ar/app/me?error=1")` / `?saved=1` regardless of the real locale — breaks the redirect target
for an `/en` member. `privacy/actions.ts` (already correct, `${locale}`) is the pattern to match.
States: empty-ish (a member with no company set — `REQ-PRF-001`'s acceptance criterion, the field
required before reserving/proposing), populated, field error, after a save.

**T2 · `/app/me/points` (SCR-022 ★).** Components: `PointsHistoryList`/`PointsCatalogue` (mine) restyled
onto `Card`/`Panel` rows with `Badge` for the reversal/manual-adjustment tags (currently plain text);
the session/month filters move onto `ui/select` (sessions', matching the materials settings-row fix
from wave 6, `9a71f48`). DAL: `getPointsHistory`, `getPointsStripData` — `points.ts`, add-only, and I
expect **zero new exports** (§3). States: empty, populated, filtered, a reversal entry, a capped-action
explanation row (`SCR-022`'s own note — «بلغت الحد الأقصى للتعليقات في هذه الجلسة»).

**T3 · `/app/me/certificates` (SCR-023).** Components: the existing list restyled onto `Card` +
`Badge` (issued/revoked state), keeping the `dir="ltr"` `<bdi>` + `break-all` technique on the serial
and verification code exactly as built (this is a real fix from a real 390 px review, not decoration —
do not regress it) and the revoked-reason `Panel`. DAL: `listMyCertificates`, `signCertificateUrl`,
`getOrgTimeZone` — `certificates.ts`, add-only, no new exports needed (read-only page, one signed-URL
download link, no member-initiated write). States: empty, issued only, issued + revoked (with reason),
a certificate still `preparing` (no `pdfPath` yet).

**T4 · `/app/me/bookmarks` (SCR-024).** Components: replace the inline `<li>` list with `sessions`' own
`SessionCard` (`components/browse/session-card.tsx` — density, the poster, the status badge, the
bookmark toggle already built, exactly what a Coursera-style "saved sessions" list should look like) in
a plain grid, `EmptyState` (mine) for zero bookmarks. DAL: **needs a new function from `sessions`** —
see request 1 below; `bookmarks.ts` is fully `sessions`' (not even add-only for me) and `getBookmarksPageData`
returns a thin DTO (`id`/`title`/`abstract`/`startsAt`/`state`/`bookmarkedAt`), not the `TimelineSession`
shape `SessionCard` needs. States: empty, populated (mixed phases — open/ended).

**T5 · `/app/me/calendar` (SCR-025).** Components: connect/disconnect restyled onto `Card`/`Panel`,
`Badge` for connection status, synced events on `Card`. DAL: `getCalendarConnection`, `listSyncedEvents`,
`disconnectCalendar` — `calendar.ts`, add-only, no new exports needed; already true by construction that
no token is ever selectable (`calendar_connections`' granted columns exclude it — confirmed by reading
the DAL, not assumed). **Bug found, fixed in the same commit:** `calendar/actions.ts`'s `disconnect`
also hard-codes `/ar/...`. States: not connected, connected with synced events, a failed sync (the
`synced.failedHint` row), just-connected/just-disconnected banners.

**T6 · `/app/me/notifications` (SCR-026).** Components: `NotificationList`/`PreferenceMatrix` (mine)
restyled onto `Card`/`Panel` rows with `Badge` for unread; the in-page `#inbox`/`#preferences` anchor
nav stays (works with no JS, already accessible — `aria-current` on a link, not `aria-pressed` on a
button) rather than moving to `ui/tabs`, since Radix's tab state and a hash-anchor two-section page are
different mechanisms and the anchor version already satisfies the same need. DAL: `getPreferenceMatrix`,
`listNotifications`, `markRead`, `markAllRead`, `setPreference` — `notifications.ts`, add-only, no new
exports needed. **Bug found, fixed in the same commit:** `notifications/actions.ts` hard-codes `/ar/...`
in three places. States: inbox empty, inbox populated (read + unread), unread-only filter, preferences
with a fixed (non-switchable) category and its reason, preferences saved/error.

**T7 · `/app/me/privacy` (`REQ-PRF-006`/`007`).** Components: restyle onto `Panel` (status boxes),
`Field`/`Textarea` (sessions', replacing the raw `<textarea>`), and — the one real gap against the
agent brief's "the destructive act confirmed in `ui/dialog`" — wrap the deactivation submit in a
controlled `Dialog`/`DialogTrigger`/`DialogContent` (lead's, import-only), following
`takedown-button.tsx`'s own established shape exactly (a plain `onClick` inside the confirm button that
closes the dialog then starts the transition — never `DialogClose asChild` wrapping the action, which
the lead's own real-build e2e run already found broken for this exact pattern). Today's form submits
straight through with no confirm step at all. DAL: `getMyExportRequest`, `requestMyExport`,
`requestDeactivation`, `deactivationReason` — `privacy.ts`, add-only, no new exports needed;
`getOrgPrefs` stays imported read-only from `proposals.ts` (a read of another track's file is fine,
only editing it is not). States: no export yet, export queued/building/ready/failed/expired, rate-limited
(cannot request again), the deactivation dialog open, deactivation sent.

### 3 — `me/points` and `checkin`'s reversal entry (REQ-CHK-017, contract 3)

Read `points_ledger`'s own migration before assuming anything: `0027_m4_schema.sql:55-59` declares
`ledger_source` as a Postgres enum whose literal values already include **`'reversal'`**, alongside
`'content_removed'` and the rest — used today for `REQ-PTS-013`'s comment/photo-removal reversals.
`getPointsHistory()` (`points.ts:121`) already computes `isReversal: r.source === "reversal"`
**generically off that column**, not specific to content removal, and `PointsHistoryList`
(`points-history-list.tsx:35`) already renders a `row.reversal` tag beside the `reason` text whenever
`isReversal` is true. `reason` itself is free text (`points_ledger.reason`, 1–300 chars) written by
whatever RPC inserts the row.

**Reading:** if `checkin`'s `REQ-CHK-017` reversal RPC inserts into `points_ledger` with
`source = 'reversal'` — the existing enum literal, since I have no migration access to widen
`ledger_source` and neither should this feature need one — **`me/points` needs zero DAL changes** and
already renders the row correctly today, structurally. I cannot alter a Postgres enum from
`supabase/proposed/content/**` even if I wanted to, so this reading is also the only one I *could* build
against without a schema change that is not mine to make.

**Until contract 3 is published**, the fixture: a new `tests/components/scoring/points-history-list.test.tsx`
(none exists today) with a `PointsLedgerRow` shaped `{ isReversal: true, isManualAdjustment: false,
reason: "<placeholder Arabic sentence>", amount: <negative>, sessionId, sessionTitle }`, asserting the
reversal tag renders beside the reason and the signed amount reads correctly (SCR-022: the sign at the
numeral's inline-start, colour **and** the minus sign, never colour alone — `REQ-NFR-007`). Once
contract 3 lands I swap the placeholder `reason` for `checkin`'s real sentence and add a second,
real-DB-seeded case in `tests/e2e/wave7-content-points.spec.ts` (a directly-inserted `points_ledger` row
with `source = 'reversal'` in local Supabase) so the 390 px capture is honest rather than mocked.

### 4 — Carried items

**1 · The photo tile's takedown label wraps** (`components/photos/gallery.tsx`/`takedown-button.tsx`,
wave 6 row 9). Diagnosed: the `<li>` already has `min-w-0` so the grid track can shrink to two columns
at 390 px, but `TakedownButton`'s "request" branch passes a **fixed** `h-9` — the same class of bug
`preference-matrix.tsx` already names and fixed with `min-h-11` instead of `h-11` (*"a fixed height
would clip it"*). Fix: `h-9` → `min-h-9` with `py-2` on that button's className, letting the two-line
Arabic label wrap without clipping instead of overflowing a fixed box. No copy change needed — the
label is honest, just long.

**2 · `?saved=1` missing on a pre-hydration save** (wave 6 sync 2, `/app/me`). A plain
`<form action={saveProfile}>` posting to a Server Action should progressively enhance — the `redirect()`
inside it should survive a full browser POST with no client JS at all, which is the entire point of a
Server Action form. I cannot fully diagnose this from source alone; it needs reproducing on a real build
with JS disabled (or `test:e2e:local` before hydration completes) during the build phase. Hypothesis to
test first: whether anything upstream of `saveProfile` — the shell, `RouteProgress`'s pending store, or
a client wrapper `/app/me/page.tsx` does not have — intercepts the navigation client-side before the
server's redirect response is honoured. Will report the actual mechanism once reproduced rather than
guess further here.

**3 · `tasks.spec.ts:143`** — mine to decide (STATUS's carried table) and, per the regenerated agent
file, mine to fix (`tests/e2e/tasks.spec.ts` is now in my edit list; it was not in the wave-6 copy this
session's spawn context carried). Read `session-matrix.ts` (`checkin`'s `AFFORDANCE_MATRIX`): `tasks`
defaults `false` and is `true` only for the `confirmed`/`waitlisted`/`presenter`/`staff` relations, with
an explicit comment at the `open` phase's `none`/`declined` rows — *"★★ calendar/tasks withheld — no
seat yet (DEC-090's asks 1–3)"*. The spec's `tasks.spec.ts:beforeAll` provisions `memberEmail` as a
plain member and **never gives it an RSVP row, a presenter row, or staff status** before
`tasks.spec.ts:143` asserts the «مهام ما قبل الجلسة» heading is visible after signing in as that
member and navigating straight to the event page. **Ruling: the spec is wrong, not the product** —
`DEC-090`'s no-seat-no-tasks rule is a deliberate, commented, cross-referenced design decision (the
same comment cites the exact DEC), not an oversight the test caught. Fix: seed a confirmed `rsvps` row
for `memberEmail` in `beforeAll` before that assertion (matching whatever pattern `materials.spec.ts`/
`photos.spec.ts` already use to give their own member fixtures a stake in the session — checking those
at build time), or switch the assertion to `presenterEmail` if the smaller diff reads better; deciding
which at build time and stating it in the commit message.

**4 · T8 — `REQ-EVT-010` per `DEC-139`: a processing photo takes its place without a reload.** Mechanism:
extend the existing private Realtime topic (`lib/realtime/channel.ts:46`, `subscribeToSessionTopic`,
already broadcasting comment INSERT/UPDATE and reaction totals on `session:${sessionId}`) with a new
broadcast event — e.g. `"photo_visible"` — fired by a new trigger in `supabase/proposed/content/**` on
the photo row's transition to visible (the same moment `photos_read`'s `hidden_at is null` clause starts
returning it, after `JOB-process_photo` strips and inserts it). `UploadWidget` subscribes for the
duration of its own pending/processing state only — not an always-on listener — and calls
`router.refresh()` once on that event; a bounded fallback (a single re-check after a fixed delay, not a
recurring nudge — `DEC-136`'s carve-out is explicit that *"a data poll for server state"* is not the
forbidden kick) covers the case where the subscription's mount races the worker's own broadcast. Exact
trigger SQL and event name finalized at build time, proven in `tests/rls/photos.test.ts` and a new
`tests/e2e/wave7-content-photos.spec.ts` assertion.

### 5 — Requests

**To `sessions`:**
1. A new, add-only export in `bookmarks.ts` — e.g. `getBookmarkedTimelineSessions(locale): Promise<TimelineSession[]>`
   — returning the member's own bookmarked sessions in the same shape `SessionCard` already reads,
   `bookmarked: true` on every row by construction, ordered most-recently-bookmarked-first. `bookmarks.ts`
   is fully yours (not even add-only for me per my never-touch list), so this is a request, not something
   I can write myself even as an addition.
2. Confirmation that `SessionCard` has no hidden dependency on timeline-only context (filter state,
   date grouping, `searchParams`) that would misrender on a plain bookmarks list — I will verify by
   reading the component fully at build time, but flagging now in case there is a known gap.

**To `checkin`:**
1. Confirm the `REQ-CHK-017` reversal row's `source` is the existing `ledger_source` enum literal
   `'reversal'`, not a new one — I cannot widen that enum from `supabase/proposed/content/**`.
2. The exact Arabic `reason` sentence(s) for the reversal, so it reads naturally beside the existing
   `row.reversal` tag rather than repeating it.
3. Confirmation that the reversal row's `session_id` is populated, so `me/points`'s existing "open the
   session" link works on it identically to any other row (I read `REQ-CHK-017`'s acceptance criteria
   as implying yes — a removal is scoped to one session's check-in — but want it confirmed, not assumed).

**To the lead:**
1. **Question — the IA reconciliation (§1).** Is the seven-tab resolution (matching the seven real
   routes, profile first) the right reading, or is there a different intent behind §6.5's six
   canvas tabs that I'm missing? I am not building **القادمة/الحاضرة/المقترحات** as literal tabs this
   wave under my current route/DAL access, per `DEC-114`'s rule — raising rather than silently
   deciding either way.
2. **Question — the profile hub's optional points `Stat`** (§1, §2 T1). Add it, or keep `/app/me`
   exactly the form plus the new tab strip? My default absent a ruling is to add it (no new DAL access
   needed, and it is the one piece of "renders content, not links" my own data reaches); happy to drop
   it for the smaller diff.
3. `src/components/shell/account-menu.tsx:54-59` is yours, not mine, and I found a live inconsistency
   reading it for §1: `labels.rsvps` and `labels.profile` both link to `/app/me` (a dead duplicate),
   and `notifications`/`privacy` have no entry at all despite being real, built routes. Once the hub's
   own tab strip makes every `/me` route reachable from `/app/me` itself, the menu may not need six
   separate `/me/*` entries at all — my suggestion is to collapse it to one «حسابي» link to `/app/me`,
   but it's your file and your call.
4. Confirming `tests/e2e/tasks.spec.ts` is in my edit list on the regenerated agent file (it is, and
   differs from the wave-6 copy this session's spawn context carried) — flagging only so we agree
   before I commit a fix to it, since STATUS's carried-findings table phrased my job as "decide",
   which I'm reading as "and fix," given the file is mine.

Ready for sync — will start on `me/layout.tsx` and `/app/me` (T1) once the lead approves this plan, per
the spawn brief's order ("build the layout and the hub first — every other route renders inside it").

## §1 — all seven routes built (T1 … T7)

Plan approved with rulings (seven tabs, the points `Stat`, `tests/e2e/tasks.spec.ts` mine to decide
**and** fix). Built in order: T1 (`7a8c888`, `07a2f3b`) — `me/layout.tsx` + `components/me/tab-strip.tsx`
(content's own, not `ui/tabs`: its `RadixTabs.List` hard-codes `flex-wrap` with no scroll variant,
and seven items need to scroll in one row at 390 px, not wrap to three lines — a request for console,
not filed as a blocking one since the interim works); `/app/me`'s form on `useActionState` +
`lib/form-state`, replacing the old `?saved=1`/`?error=1` redirect (structurally removes the
pre-hydration race rather than patching it — nothing left in a URL to lose). T2 points (`15787f0`,
fixed in `592c3d2` — see below). T3 certificates (`2424cc1`). T5 calendar (`782aa6d`) — also fixed
`calendar/actions.ts`'s hard-coded `/ar/...` redirects. T6 notifications (`f6ac12f`) — same
locale-redirect bug, three call sites; found nested async Server Components (`NotificationList`,
`PreferenceMatrix`) can't be rendered as JSX children in a plain RTL test (react-dom's client renderer
can't resolve a Promise returned by an async component invoked outside an actual RSC pipeline) — split
into two component test files awaiting each directly, page-level integration proven in the e2e spec
instead. T7 privacy (`3e0221e`) — deactivation now confirms in `ui/dialog` (REQ-UIX-013), with
`reportValidity()` gating the dialog open against the required reason field, and the dialog's confirm
button submitting the original form via `form="deactivate-form"` since Radix portals `DialogContent`
outside the form's own subtree. T4 bookmarks (`8d56b21`, after `sessions`' `getBookmarkedTimelineSessions()`
landed and `search.bookmarksPage.browseAction` arrived) — renders `SessionCard` directly, per their
five points (h2 before the cards' own h3, li/ol, pinned off, no second empty state).

★ **A real mistake, caught before it shipped wrong and fixed in the same pass**: rebuilding
`points-catalogue.tsx` onto `SectionHeader` dropped the section's own `id="catalogue"` (moved to the
heading instead), and rebuilding `/app/me/points` swapped the "رصيدك N نقطة" sentence for a `Stat`
tile — both broke real, pre-existing assertions in `tests/e2e/points.spec.ts` I hadn't read before
rewriting the components it drives. Restored both (the id back on the section, the sentence back in
place of the `Stat`) — caught by actually reading `points.spec.ts`/`bookmarks.spec.ts` before treating
T2/T4 as done, not by the gates, which never run against real Supabase for me locally. Also found:
`bookmarks.spec.ts`'s existing `getByRole("link", { name: "…title…" })` broke the same way, since
`SessionCard`/`Card` makes the whole card one link — its accessible name is the card's full text, not
the title alone. Fixed both files; my own new e2e coverage moved from two duplicate `wave7-content-*`
files into these two pre-existing ones as their own `describe` blocks, and the same for
`wave7-content-privacy.spec.ts` → a new block in the pre-existing `privacy.spec.ts` (whose own
REQ-PRF-007 test also needed the two-click confirm-dialog fix). **Lesson for the rest of the wave**:
check `tests/e2e/` for an existing spec named after the route BEFORE writing a new `wave7-content-*`
one — three of five so far already existed.

★ **A shared-index incident, the fourth in this repo**: my first attempt to commit the points/bookmarks
fix used `git commit -m … -- <five paths>`, one of which was a deleted file's path
(`wave7-content-points.spec.ts`) that git's pathspec matching refused for a path no longer on disk —
the whole commit failed (exit 1) and left five files staged. `checkin` then ran a plain
`git commit -m …` with no path restriction while those were still staged, and their commit `592c3d2`
swept them in alongside their own SQL work. Nothing was lost — `git show --stat 592c3d2` confirms all
five diffs landed exactly as intended — but the attribution is wrong and I did not fix it: amending or
rebasing a commit another session may already be building on is a worse move than a misattributed
diff. Restated to myself for the rest of the wave: stage deletions with a plain `rm` + `git add`, never
name an already-deleted path in a `commit -- <paths>` list, and commit each staged batch immediately
rather than leaving anything staged across a tool round.

All seven `/app/me` routes now show ✓ on `node scripts/ui-reach.mjs --wave7`. `tsc` clean, lint 0
errors, `npm test` green (1359/1365 — the 6 failures are `sessions`' own concurrent WIP on
`star-rating.test.tsx` and `leaderboards.json`, confirmed not mine by `git status` at the time).
e2e specs written for all seven routes (five new files, two pre-existing ones extended) but not yet
run against a real build — `npm run build` is lead-only and the checkout's `.next` predates these
changes; ready whenever the lead next builds.

Ready for sync.

## §2 — sync-2 fixes, T8, and the takedown wrap (5abdbc6 … 63cfdc1)

Six commits: `5abdbc6` (tab-strip scroll cue, the no-JS save test, profile.json cleanup), `c61ea3a`
(every empty state names its next action — REQ-UIX-012 — and the points `Stat` stays per the lead's
ruling, reversing what I shipped a sync earlier), `7c6f9e5` (T8, the takedown wrap fix), `63cfdc1`
(a real bug in my own RLS test, caught by actually running it).

**The `?saved=1` fix reconsidered isn't a reconsideration of the diagnosis, only of the standard it's
held to.** The lead's point stood: I'd reasoned my way to "nothing left to race" without checking
what a real no-JS POST actually renders. Added the case (`javaScriptEnabled: false`, a real
submission, checking both the confirmation and the persisted value) — written, not yet run against a
build, same as everything else waiting on one.

**Caught my own Tailwind 4 mistake before it shipped**: `inset-inline-end-0` on the tab strip's fade
— exactly DEC-133's dead utility, compiles to nothing. `logical-utilities.test.ts` failed on the
first `npm test` after writing it; fixed to `end-0` in the same pass. Worth naming because it's the
precise failure mode the invariant describes — no type error, no lint error, looked correct.

**Reversed my own points fix from the previous sync**: I'd read the lead's sync-2 finding as "restore
the sentence" and it meant "fix the test to match the Stat." Both readings are defensible from the
message alone; asked nothing, guessed, guessed wrong, caught it on the NEXT sync message rather than
before shipping. Redone correctly this time — `Stat` stays, `points.spec.ts` reads its `<strong>`.

**T8** (photos realtime, DEC-139): traced `photos`' own `check (exif_stripped)` constraint — a row
is only ever inserted already stripped, so there's no "now visible" transition to track, the INSERT
*is* the moment. One new trigger (`supabase/proposed/content/01_photos_broadcast.sql`) reusing the
exact `session:{id}` topic and RLS `comments_broadcast()` already established — no new topic, no new
policy. `UploadWidget` subscribes only between its own 202 and the broadcast for that photo's id, with
a 20 s fallback. Proven against real local Supabase (`npm run test:rls`) — found and fixed my own test
bug in the process: the "doesn't leak to another org's topic" case assumed that topic was silent, and
it isn't — org B's own fixture already broadcasts its own comments there.

**The takedown wrap**, traced properly rather than guessed at: `Button size="sm"` sets a fixed
`height` internally; adding `min-h-9` beside it via a caller's `className` does nothing, since
`min-height` never overrides an explicit `height`. `h-auto!` (Tailwind 4's important syntax) is what
actually wins.

Everything: `tsc` clean, lint 0 errors, `npm test` 1366/1366, the RLS trigger proven live, not just
in a rolled-back-transaction reading. Nothing left on my wave-7 checklist.

Ready for sync.

## §3 — sync-3: three real findings, one build I still can't reproduce, R7 (`2f71a56`)

Several messages arrived describing §1/§2's fixes as still open — checked against the actual git
history rather than assumed either way: `d8f0af9` (what the lead's sync-2 review built) sits BEFORE
`5abdbc6`/`c61ea3a`, and the photos-broadcast RLS failure was reported "at `7c6f9e5`" — my own very
next commit, `63cfdc1`, already fixed it. Re-verified every sync-2 item against disk directly (not
memory) before replying: all present, `npm test` 1392/1392, the RLS trigger green on the current
promoted migrations (`npm run test:rls`, not just a transaction reading).

Three real sync-3 findings, not stale ones:

1. **`privacy.spec.ts:194` — the deactivation confirmation.** The dialog's confirm button submitted
   via `type="submit" form="deactivate-form"`, a native HTML attribute lookup across Radix's own
   portal boundary. Every line of reasoning said this should work, and my own jsdom test of the same
   shape passed — which is exactly the trap: a mechanism that "should" work in theory is not the same
   claim as "does," in a real build, and jsdom cannot reproduce every Flight/transition timing issue
   (`DEC-135`'s own lesson). Switched to `formRef.current?.requestSubmit()`, called directly from code
   that already holds the form — no cross-portal attribute lookup at all. **I could not reproduce this
   myself** (`npm run build` is lead-only); this is the most defensible fix available without one, and
   I said so plainly rather than claiming it's proven.
2. **`bookmarks.spec.ts:147`** and **`wave7-content-notifications.spec.ts:109`** — both the same
   underlying shape as bugs I'd already found and fixed elsewhere in this file: an unscoped
   `getByText` matching more than one element (the card's own link AND its `<h3>` title; three fixed
   categories instead of the one my own component test seeded). Scoped both.

**R7** (`sessions`' request): `CardMedia` gains `placeholderTone="dark"`, narrowing the tint pick to
`MEDIA_TINTS`' three navy entries while keeping the same hash. Tested both directions — dark never
yields silver across ten titles, and the full pool stays reachable without the prop.

Also confirmed for the record: `search.bookmarksPage.browseAction` (`2a05ea9`) is `sessions`' own
commit, not mine — they said so directly after our requests crossed. Noted, not investigated further:
`console`'s `d12499d` gave `ui/tabs` a scroll variant, which is what `MeTabStrip`'s own header said
to watch for ("swap back if that lands") — lower priority than the fixes above, worth a look once
nothing else is open.

`tsc` clean, lint 0 errors, `npm test` 1392/1392.

Ready for sync.

## §4 — contract 3 confirmed by the landed migration, a strict test, the real seed (`8ed4bf8`)

`0087_attendance_removal.sql` is live: `remove_check_in()` writes `source = 'reversal'`,
`amount = -original`, the fixed reason «أُلغي تسجيل الحضور» — exactly what `getPointsHistory()` and
`PointsHistoryList` already rendered generically off `source`. Two asks, both done:

1. **A test that fails if the sign or the `<bdi>` is lost**, not a loose regex — checks the actual DOM
   node is a `<bdi>` element and its exact text content, stripped of bidi CONTROL characters only (not
   digits), equals `-5`. Also added: the admin's own removal reason never reaches this screen (the
   lead's ruling — it lives on `check_ins.removal_reason`/`audit_log` only, matching the certificate
   path's own withholding), and this component renders no competing total of its own.
2. **The e2e reversal capture now seeds through the real RPCs**, not hand-inserted ledger rows: a real
   `check_ins` row, `award_points('check_in', …)`, then `remove_check_in()` as an admin. Wrote a
   throwaway verification script first (never committed) against real local Supabase to prove the flow
   before writing assertions against it — caught my own mistake doing that: the real award's reason is
   «تسجيل حضور مؤكَّد», not the «تسجيل حضور» I'd have guessed, matching what the file's own pre-existing
   first test already knew. `wave7-content-points-reversal.png`, as asked.

`supabase/proposed/content/01_photos_broadcast.sql` untouched, waiting for "promoted at `<sha>`".

`tsc` clean, lint 0 errors, `npm test` 1401/1401.

Ready for sync.

## §5 — sync-4b: two more locators, the `#main` diagnosis, `tasks.spec.ts` finally applied (`6e3a780`)

Two more strict-mode violations of the same shape as before (an unscoped `getByText` matching a
second real element — the catalogue's own repeat of a reasonAr; a session title containing a badge's
exact text as a substring). Scoped both.

**The `wave7-content-me.spec.ts:93` diagnosis, done before touching anything, per the ask**: read
`profile-form.tsx` directly — `FormSummary` DOES render inside `<form>`, no portal, nothing between
them. The actual cause: `page.locator("form")` on any `/app` page matches THREE forms, not one — the
shell renders its own (`search-entry.tsx`, `account-menu.tsx`'s sign-out) on every route, including
`/app/me`. Not a rendering bug. `shell-frame.tsx`'s own `<main id="main">` wraps the routed page's
content only, so `page.locator("#main")` is the fix.

**`tasks.spec.ts:143`, finally applied rather than left as a standing ruling**: I diagnosed this back
in the wave-7 plan (§4 item 3) — `checkin`'s `AFFORDANCE_MATRIX` withholds `tasks` for a viewer with
no stake in the session, and the fixture never gave `memberEmail` a reservation — but never actually
committed the fix until now. Seeded a confirmed RSVP in `beforeAll`, the same shape `fixture-m2.ts`
already uses for every org's own member role.

`tsc` clean, lint 0 errors, `npm test` 1409/1409. `supabase/proposed/content/01_photos_broadcast.sql`
is gone from the tree — the lead's promotion to `0091_photos_broadcast.sql` is already in the shared
checkout as I write this.

Ready for sync.

## §6 — post-promotion cleanup of `photos-broadcast.test.ts` (`d43e078`)

Per the lead's "promoted at `e73b239` (0091)" message: dropped the now-dead `existsSync`/
`applyProposed`/`PROPOSED`-array guard entirely (`setup()` is gone too — both tests now call
`seed(tx)` directly), and rewrote the header comment to cite `supabase/migrations/0091_photos_broadcast.sql`
instead of the proposed path, dropping the "nothing here touches the shared local database" framing
that was specifically about the applyProposed mechanism, not about `withTx`'s rollback (which still
holds and is still noted). Checked `tests/rls/realtime.test.ts` first to confirm this is the real,
already-established convention for a promoted-migration test — its code already calls `seed(tx)`
directly with no guard, even though its own header comment is stale and never got updated to match;
I did not copy that staleness into mine.

Verified: `pgrep` showed no other vitest runner, `npx vitest run --project rls
tests/rls/photos-broadcast.test.ts` → 2/2 passed against the promoted migration, `tsc` clean, lint
clean, full `npm test` → 139 files / 1409 tests passed. Staged and committed only this one file
(`git status --short` before commit showed five other unstaged files under `checkin`'s/`sessions'`
own paths — left untouched).

**On the "carry on with the four sync-4b findings" line in that same message**: those four were
already fixed and reported in `6e3a780`/§5 above, sent before the promotion message — this reply and
the promotion message almost certainly crossed. Flagging it here rather than silently assuming;
nothing further to do on them unless the lead saw something after `6e3a780` that still needs work.

Ready for sync.

## §7 — #3 was a real bug, not a strict-mode locator (`7f4809f`)

The lead pushed back on my `#main`-only diagnosis of `wave7-content-me.spec.ts:118` — right to: an
unscoped `form.getByRole("alert")` chain searches inside every matched form, so a multi-match would
fail as a strict-mode violation, not "not found," and scoping alone can't explain the symptom. Read
`profile-form.tsx` for candidate (a) first, per the ask.

Confirmed: the `<form>` at line 76 had no `noValidate`, and `displayName`'s `<Input>` carries
`required`. Every other server-action form in the product (`propose`, venue, settings,
direct-session, category, company, `rate`) sets `noValidate` so the browser's own constraint
validation never fires and the app's Zod-driven `FormSummary` takes over — `profile-form.tsx` was the
one form missing it. The spec empties `displayName` and submits (line 118); without `noValidate` the
browser blocks the request before `formAction` ever runs, `useActionState`'s state never updates, and
no `role="alert"` renders anywhere — a real product bug, exactly as the lead read it, not a spec or
scoping issue. Added `noValidate` to match the other seven forms.

`tsc` clean, lint clean, `profile-form.test.tsx` 5/5. This needs a fresh production build to verify
through the real e2e spec (browser-native constraint validation isn't exercised under jsdom, and
`npm run build` is the lead's) — leaving that to sync 5's full run at HEAD, as the lead already
planned.

Ready for sync.

## §8 — the noValidate rule applied to the other three grep hits (`1c9c911`)

The lead's rule, applied to the three files their grep found beyond `profile-form.tsx`:

**`app/me/privacy/forms.tsx`'s `DeactivationForm`** — read closely, this one's already correct and
not touched. Its `reason` textarea's `required` is checked by an explicit `formRef.current
?.reportValidity()` call inside `openConfirm()`, BEFORE the confirm dialog ever opens (the file's
own comment explains why: surfacing the native message once the dialog is already open would be too
late). The confirm/submit buttons are `type="button"`, never inside a native submit path, so there is
no browser-blocks-the-handler failure mode here to begin with, and `state.error` (the `Alert` this
form does render) is reserved for POST-submission server failures, never for the required-field
case. Native-only, no app-side error for that field, by design — the lead's second bucket, recorded
for M13, not fixed. (This also settles the "may be what privacy.spec's «أُرسل طلبك» failures were
about" question from an earlier message: it isn't — that bug was the cross-portal `requestSubmit()`
timing issue already fixed and documented in this same file.)

**`components/event/comment-item.tsx`'s report dialog** — real hit. `reason` is `required
minLength={3}` with no `noValidate`; `submitReport` ALSO had `if (reason.length < 3) return;`, a
second silent guard that (being unreachable in practice, since native validation already blocked
anything native validation would have blocked) meant a too-short reason produced no feedback at all,
twice over, by two different mechanisms. Added `noValidate`, removed the redundant guard — a
too-short/empty reason now reaches `reportCommentAction`, whose existing Zod `min(3)` rejects it, and
`errors.invalid_comment` shows in the same `Panel` a network or server failure already uses. No new
message key needed.

**`components/tasks/create-form.tsx`** — real hit. `title` is `required` with no client-side check of
its own (unlike `materialId`/`formQuestions`, which already have one, now finally reachable too);
native validation blocked `handleSubmit` itself from ever running. Added `noValidate`; an empty title
now round-trips through the existing Zod `min(1)` + the form's own generic `createFailed` fallback,
same shape as `profile-form.tsx`'s fix.

New tests: `comment-item.test.tsx` (empty reason reaches the action, shows `errors.invalid_comment`,
not silence) and a new `tests/components/tasks/create-form.test.tsx` (empty title reaches the action
and shows `createFailed`; a successful submit clears the form). `tsc` clean, lint clean. Full
`npm test`: 1417/1418 — the one failure is in `tests/components/admin/proposals-review-card.test.tsx`,
which `git status` shows as `console`'s own uncommitted in-progress file; not mine, not touched by
this change.

Ready for sync.

## §9 — sync 5 (build `bfe8e2a`): three more fixes (`bd517f6`)

**`tests/e2e/tasks.spec.ts`** — `getByText("أحضر جهازك المحمول")` now resolves to 2 elements once the
RSVP (§5 above) makes the Tasks section visible for the first time — this ambiguity was never
exercised before. Confirmed only one `session_tasks` row exists and `TaskItem` renders its title
once, so the second match is elsewhere on the page, not a genuine duplicate task. Scoped both the
text check and the "أنجزتها" click to `page.locator("#tasks")` (the slot's own section id, `sessions.md`
§22.2) — same idiom as the earlier `#main`/`#history`/`#catalogue` fixes.

**`points-history-list.tsx`'s signed amount read backwards** ("20-" instead of "-20" in a real
capture): `formatNumber` (sessions' `numerals.ts`) drops ICU's LRM, so a bare `<bdi>` around a signed
number resolves RTL and the sign lands after the digits — invisible to jsdom's textContent, since
bidi reordering is purely visual. Added `dir="ltr"` to that one `<bdi>` (kept the isolate, pinned its
direction). Strengthened both the plain-award and reversal tests in
`points-history-list.test.tsx` to assert the attribute, and added the same assertion to
`points.spec.ts`'s real-browser reversal capture. Checked every other `formatNumber` call in my own
files (`points-catalogue.tsx`, notifications, materials, photos, tasks, the viewer) — none render an
explicit sign; `points-catalogue.tsx` filters to `entry.points > 0` structurally, so no other fix was
needed there. `company-board.tsx`/`company-points-breakdown.tsx`/`member-board.tsx` have the same
`formatNumber`/`bdi` shape but are `sessions'` files (DEC-141) — flagged to the lead, not touched.

**A real read-back bug in `profile-form.tsx`**: after a successful save the company select showed the
placeholder even though the company DID persist (the DB write path, grant, and org-check trigger all
read correctly on inspection). Root cause, confirmed by writing a failing jsdom test first: (1)
`saveProfile`'s success path never bumps `state.attempt` — `form-state.ts`'s `formStateFrom` only
counts failures, which is correct for `hasAttempted`'s real job (gating inline validation) — so
`hasAttempted(state)` alone read `false` right after a save and `value()` fell back to `me` instead of
echoing `state.values`, contradicting the file's own comment ("a returned round trip — success or
failure — echoes exactly what the member submitted"); (2) even with that fixed, React never re-syncs
an already-mounted field's `defaultValue`/`defaultChecked` on a later render — `<select>` included —
which is why this was invisible for `Input`/`Textarea`: the member's own live-typed text already
matched what echoed back, by coincidence, not by construction. Fixed both: `attempted` now also
considers `state.saved`, and every `defaultValue`/`defaultChecked` field is `key`ed on the value it
should display, forcing a fresh mount exactly when that value changes (same idiom `FormSummary`
already used with `key={state.attempt}`). New component test deliberately mocks a success response
where `me` has NOT caught up (still null) to prove the echo, not a lucky fresh prop; new e2e
assertion checks the company value after save.

`tsc` clean, lint clean, full `npm test` 145 files / 1439 passed.

**Still open from sync 5**, no code change yet: the two 390 px horizontal-overflow findings
(notifications, points) — read through every candidate component in my scope and found nothing
obviously fixed-width, so asked the lead for the actual offending-element array from their run rather
than guess across four files; and the no-JS save timeout, where I built a concrete but unconfirmed
hypothesis (`/app/me/loading.tsx`'s Suspense-streaming fallback may need client JS to reveal the real
content on a hard navigation — a wave-5 loading-model property, not specific to this page or the
`useActionState` rewrite) and asked for the trace rather than guess at a fix for something this
cross-cutting.

Ready for sync.

## §10 — both closed (`967d1a7`)

**1 and 2 were never my bug.** The lead's own read of the offending-element array confirmed it: every
entry was `MeTabStrip`'s own tabs, scrolled out of view inside its own `overflow-x-auto` — by design,
the same edge-fade scroll strip approved back at sync 1. `notify-screens.spec.ts`/`scoring-screens.spec.ts`'s
own `widerThanViewport` (both unspawned tracks', not mine to touch) flagged anything outside the
viewport even inside a legitimate scroller; the lead fixed the helper (custodian) to check the
document's own `scrollWidth` and skip scroller content. Nothing changed in my code.

**3 was confirmed, and certain, not timing-dependent**: `/app`'s `loading.tsx` makes the response
stream — the skeleton flushes, the real page arrives in a `<div hidden>` React's own inline `$RC`
script reveals, and with JS off that script never runs. A property of M9's loading model
(DEC-087/DEC-134) for every `/app` route, not of this form; the only no-JS contract in the whole plan
is the frozen register form (`16` §8.2, `qa:contract`). Skipped the whole `describe` with
`test.describe.skip` and the reasoning attached in a comment, rather than deleting it — per the lead's
ruling, this is a known, documented, permanent skip, not a bug to chase.

`tsc` clean, lint clean, full `npm test` 145/145 files, 1439/1439 tests.

All four sync-5 findings and both sync-5-message-2 findings are now closed. Holding e2e/RLS for
sync 6, per the lead.

Ready for sync.

## §11 — correction: the «20-» finding was a misread, not a real reorder (`69c5853`)

Sync 6 (build `1a95a59`): T1 and T2 close — the company select keeps its saved value at full
resolution, and «-20» reads correctly. The lead's own correction: the original "20-" observation was
a misread of a downscaled 5,358 px capture, and `sessions'` own measurement confirms a bare `<bdi>` in
Chromium already puts the sign before the digits, with or without an LRM — `formatNumber` never
dropped one. `bd517f6`'s comments (in `points-history-list.tsx`, its test, and `points.spec.ts`)
asserted that cause as fact; reworded all three to say the direction is pinned deliberately, not that
a reorder was ever observed, so the false cause doesn't outlive the finding that produced it.
`dir="ltr"` itself stays — harmless, and correct on its own terms regardless of the mistaken diagnosis
that first prompted it.

`tsc` clean, lint clean, `points-history-list.test.tsx` 7/7 (comment-only change, no behavioural
difference expected or found).

Ready for sync.

## §12 — the final gates' two remaining items (`05f023b`)

**`tasks.spec.ts:176`, desktop-only, `getByLabel('نوع المهمة')` → 2 elements.** Traced it properly
before guessing: a one-off `page.evaluate` debug dump of every `<select>`'s full ancestor chain (run
once against the real desktop project, discarded once I had the answer) showed the real, live
create-task form under `main#main`, and a SECOND, identical copy — same `id="tasks"`,
`id="tasks-create-form"`, same field labels — directly under `body > div#S:e`, outside `#main`
entirely. This is the SAME `$S:`/`$RC` React streaming-SSR mechanism the no-JS finding already
traced: an orphaned, `hidden` template segment the reveal script leaves behind instead of removing,
on this route at desktop width. Materials' own upload form shows the identical duplicate on the same
page — not something in my component, a page-wide artefact. `getByRole` calls are naturally immune
(hidden content is excluded from the accessibility tree); `getByText`/`getByLabel` are not. Scoped
every locator in both this test AND `:153` (the earlier `#tasks`-only scoping had the same exposure,
just never exercised on desktop before) to `#main`, which never contains the orphaned copy. Verified
4/4 passing on both projects, single run — `--repeat-each` would give false failures here too, same
shape as `:153`'s own already-documented reason (each repeat re-inserts the same bookmark rows this
describe's own fixture seeds, which is a distinct spec, but the same class of trap).

**`bookmarks.spec.ts:237`, intermittent under load.** Implemented exactly what was asked:
`page.waitForResponse` on the Server Action's own POST, then a separate, bounded wait for the card to
disappear — so a slow response and a response that returns but never updates the list read as two
different failures. Could not establish WHICH locally: my own `.next` build is stale, predating three
of `sessions`' commits from today that moved this page onto `SessionCard` (`e461239`, `ac09c09`,
`c20b901`) — the "populated" check fails before the un-bookmark step is ever reached, against a build
still serving the OLD plain-list markup (`BookmarkedSession.abstract` as a paragraph, no `<h3>`).
`npm run build` is the lead's; reported this rather than guessing at a fix against a build that
doesn't match HEAD.

`tsc` clean, lint clean on both files.

Ready for sync.

## Wave 9 plan

Planning only, per the spawn brief. Read (in order) the regenerated `.claude/agents/content.md` on
disk, `STATUS.md`'s START HERE block and wave-9 block (the ten contracts, the untouched-suite ledger,
the order inside the wave), `CLAUDE.md` § *Ownership map (wave 9)*, `DEC-121` slowly (my
specification), `DEC-119`, `DEC-120`, `DEC-150` in full, `01-prd.md` `REQ-SES-018`, `REQ-MAT-001`,
`REQ-MAT-006`, `REQ-TSK-001…005`, `REQ-EVT-009…011`, `02-domain-model.md` `ENT-session_days`, the six
live migrations (`0037`, `0046`, `0050`, `0052`, `0053`, `0054`), `03-permissions-rls.md` §5.5a/§5.5b/
§5.6c, and the current code of `materials.ts`/`tasks.ts`/`photos.ts` (DAL), `list.tsx`/`panel.tsx`/
`gallery.tsx` (slots), `process_photo.ts` (worker). **No code, SQL, JSON or test written below — every
`create function`/`create policy` block is what I will propose once the foundation (`0100`) lands, not
something committed now.**

The foundation is not on disk yet (the lead is building it as I write this). Everything below is
designed against `DEC-150`'s description of `0100`: nullable `session_day_id` on `materials`,
`session_tasks`, `photos`, no backfill, composite FK `(session_id, session_day_id)` referencing
`session_days(session_id, id)`, `on delete set null`. Where that description leaves a gap, I say so as
a numbered question rather than guessing a column name into existence.

### 1 — Materials: the write path, the re-scope path, who may use it

**Today's write path** (`materials.ts:90`, `initiateMaterialUpload`) is a **plain client insert**
against `materials` — there is no RPC gate on creation, `p8_presenter_write` (0037) is the entire
authority. That makes T1 additive in the cheapest possible way: `initiateMaterialUploadInput` gains
`sessionDayId: z.uuid().optional()`, and the insert gains `session_day_id: input.sessionDayId ?? null`.
No RLS change — `p8_presenter_write`'s `with check` doesn't mention `session_id` shape beyond
`is_presenter_of`/`is_org_admin`, and the composite FK is what refuses a day that isn't this session's
own (`23503`, surfaced as `mapMaterialsInsertError`'s fallback branch, unchanged). **Who may send it:**
whoever `p8_presenter_write` already lets insert — a presenter of the session, or an org admin. The
value itself comes from **which group's «أضف» the member pressed** (§4 below), never a field.

**Re-scope — a new RPC, not a wider grant.** I looked hard at just adding `session_day_id` to
`materials`' existing `grant update (title, phase, allow_download)` and letting
`materials_update_presenter`/`materials_update_admin` cover it for free — it would work structurally
(the column's own `with check` re-evaluates `is_presenter_of(session_id)`, which doesn't change when
only `session_day_id` moves, so none of `remove_material`'s "can't see the row after the write" problem
applies here). **I'm not proposing that**, because "staff" (`is_staff()` — admin **or** moderator) is
who DEC-121 names for materials/tasks re-scoping, and `materials_update_admin` is `is_org_admin()`
only — a moderator cannot touch a material's phase or title today, and widening that policy to
`is_staff()` to get re-scope for free would silently give moderators write on `title`/`phase`/
`allow_download` too, which nothing asked for. A dedicated RPC keeps the two grants of authority
separate:

```sql
-- REQ-SES-018/DEC-121: moving a material between the session and one of its own days.
-- SECURITY DEFINER because the authority is "presenter of session OR staff", not the
-- narrower "presenter OR admin" materials_update_* already enforces for title/phase/
-- allow_download — widening those policies would give moderators write on columns
-- nobody asked to widen. The composite FK on session_day_id is what refuses a day
-- that doesn't belong to this material's own session (23503).
create function public.rescope_material(p_material_id uuid, p_day_id uuid) returns public.materials
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid;
  v_session_id uuid;
  v_row public.materials;
begin
  select m.org_id, m.session_id into v_org_id, v_session_id
    from public.materials m where m.id = p_material_id and m.removed_at is null;
  if v_org_id is null or v_org_id is distinct from public.auth_org_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_session_id is null then
    raise exception 'not_found' using errcode = 'P0002';   -- a proposal's own material has no days at all
  end if;
  if not (public.is_staff() or public.is_presenter_of(v_session_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.materials set session_day_id = p_day_id, updated_at = now()
   where id = p_material_id
  returning * into v_row;

  return v_row;
end $$;
revoke all on function public.rescope_material(uuid, uuid) from public, anon;
grant execute on function public.rescope_material(uuid, uuid) to authenticated;
```

`p_day_id => null` re-scopes to the session — the same door handles both directions of the chip, and
"اليوم الثاني ▾ → للورشة كاملة" is just `rescope_material(id, null)`. `materials_guard` (0037) isn't
touched: it only blocks `session_id`/`kind`/`added_by` from changing, so it already lets this update
through untouched. **Who may use it:** staff or the session's own presenter — matches DEC-121's «staff
and the presenter for materials and tasks» exactly.

### 2 — Tasks: the write path, the re-scope path, who may use it

Same shape, one table over. `tasks.ts:129`'s `createTask` is a **plain client insert** against
`session_tasks`, `p8_presenter_write` (0037) the entire authority. `createTaskInput` gains
`sessionDayId: z.uuid().optional()`; the insert gains `session_day_id: parsed.sessionDayId ?? null`.
No RLS change, same FK-does-the-validation reasoning as materials.

Re-scope is `rescope_task(p_task_id uuid, p_day_id uuid)`, identical shape to `rescope_material` but
against `session_tasks`, with authority `is_staff() or is_presenter_of(v_session_id)` — the same as
`session_tasks_update_presenter`'s own `is_presenter_of(session_id) or is_org_admin()`, widened to
`is_staff()` for the same reason as materials (a moderator can re-scope without gaining write on
`title`/`form_schema`/etc., which `session_tasks_update_presenter` doesn't grant them today either).
**Who may use it:** staff or the session's own presenter.

### 3 — Photos: the write path is a WRITER's rule, not a form field, and the "nearest day" question

**Photos never ask, so there is no client-facing scope input to add anywhere** — `photos.ts`'s
`initiatePhotoUpload`/`completePhotoUpload` and their Zod schemas are untouched. The entire T1 for
photos is inside `record_photo_upload()` (`0050`), which is the **only** door that ever creates a
`photos` row (0037's `check (exif_stripped)` says so structurally; the function comment says so in
prose) — exactly the WRITER rule 5's guard test and DEC-121's own text ask for.

**The upload-time problem.** `record_photo_upload()` runs in the **worker**, after the download, the
sniff and the byte-level strip — real latency between "the member pressed upload" and this function's
own `now()`. Using this function's own clock as "the upload time" would occasionally place a photo
taken at 5:58 p.m. on day 1 (ends 6:00 p.m.) into day 2 if the strip happens to finish after 6:00.
`initiate_photo_processing()` (also `0050`) runs **synchronously, authenticated, the instant the
browser's own direct PUT succeeds** (its own header comment says so) — that moment, not the worker's,
is what DEC-121 means by "upload time." So the timestamp is captured at `initiate_photo_processing()`
and threaded through the job payload to `record_photo_upload()`:

```sql
-- initiate_photo_processing() — one new key in the existing jsonb_build_object call, nothing else changes:
perform public.enqueue_job(
  'process_photo',
  jsonb_build_object(
    'photo_id', p_photo_id, 'org_id', v_org_id, 'session_id', p_session_id,
    'uploader_id', v_member, 'storage_path', p_storage_path, 'declared_kind', p_declared_kind,
    'uploaded_at', now()   -- NEW: DEC-121's "upload time" is when the PUT completed, not when the worker gets to it
  ),
  'photo:' || p_photo_id::text
);
```

```ts
// worker/src/tasks/process_photo.ts — Payload gains `uploaded_at: string`, isPayload() gains the check,
// and the record_photo_upload() call gains one trailing argument (below).
```

```sql
-- record_photo_upload() — a trailing, defaulted 10th parameter. Additive (contract 2): the CURRENTLY
-- deployed worker calls this with 9 positional arguments and keeps working, defaulting to now() —
-- indistinguishable from today's behaviour until the wave-9 worker build ships the 10th argument.
create or replace function public.record_photo_upload(
  p_photo_id     uuid,
  p_org_id       uuid,
  p_session_id   uuid,
  p_uploader_id  uuid,
  p_storage_path text,
  p_byte_size    bigint,
  p_sha256       text,
  p_width        int default null,
  p_height       int default null,
  p_uploaded_at  timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limit_mb  int;
  v_row       public.photos;
  v_day_count int;
  v_day_id    uuid;
begin
  select limit_image_mb into v_limit_mb from public.org_settings where org_id = p_org_id;
  if v_limit_mb is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_byte_size > v_limit_mb::bigint * 1024 * 1024 then
    return jsonb_build_object('status', 'file_too_large', 'limit_mb', v_limit_mb);
  end if;

  select count(*) into v_day_count from public.session_days where session_id = p_session_id;

  -- DEC-121: "a one-day session's content is session-scoped (null), not day-1-scoped" — adding a
  -- second day later must re-scope nothing, which only holds if this stays null while n <= 1.
  if v_day_count > 1 then
    select d.id into v_day_id
      from public.session_days d
     where d.session_id = p_session_id
       and d.starts_at <= p_uploaded_at and p_uploaded_at < d.ends_at
     order by d.position
     limit 1;

    if v_day_id is null then
      -- Outside every day's own window (before day 1 opens, in the gap between two days — they
      -- cannot overlap but they can leave a gap — or after the last day closes). DEC-121 says
      -- "falling back to the nearest day" without defining "nearest" — see question 1 below; this
      -- is my proposal: the day whose window's CLOSER edge is closest in time to the upload.
      select d.id into v_day_id
        from public.session_days d
       where d.session_id = p_session_id
       order by least(abs(extract(epoch from d.starts_at - p_uploaded_at)),
                       abs(extract(epoch from d.ends_at   - p_uploaded_at)))
       limit 1;
    end if;
  end if;

  insert into public.photos
    (id, org_id, session_id, session_day_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped)
  values
    (p_photo_id, p_org_id, p_session_id, v_day_id, p_uploader_id, p_storage_path, p_width, p_height, p_byte_size, p_sha256, true)
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.photos where id = p_photo_id;
  end if;

  return jsonb_build_object('status', 'ok', 'photo', to_jsonb(v_row));
end $$;
```

The `n > 1` test is the `if v_day_count > 1` line, and its comment cites `DEC-121` by name, as asked.

**Re-scope** is `rescope_photo(p_photo_id uuid, p_day_id uuid)`, same shape again, authority
`is_staff()` alone (no presenter branch — DEC-121 says "staff can re-scope it," photos have no
presenter-write concept at all today, `photos_insert_checked_in` never mentions `is_presenter_of` as
an owner, only as one of three ways to be allowed to upload).

### 4 — The grouped list: markup, and the byte-identical proof at one day

**The shared shape**, one algorithm for all three slots, driven by `days` (from `listSessionDays()`,
contract 3), not by a `session.isMultiDay` flag anywhere:

```ts
type Group<T> = { dayId: string | null; label: string; items: T[] };

function group<T extends { sessionDayId: string | null }>(
  items: T[],
  days: SessionDay[],
  sessionLabel: string,
  dayLabel: (d: SessionDay) => string,
  canManage: boolean,
): Group<T>[] {
  const buckets: Group<T>[] = [
    { dayId: null, label: sessionLabel, items: items.filter((i) => i.sessionDayId === null) },
    ...days.map((d) => ({ dayId: d.id, label: dayLabel(d), items: items.filter((i) => i.sessionDayId === d.id) })),
  ];
  // REQ-SES-018: "a group with nothing in it is not rendered" — for a plain member. A manager
  // (presenter/admin) sees every bucket regardless, because each needs its own header to add
  // under (DEC-121: "the place you pressed is the answer" only works if the place exists).
  return buckets.filter((b) => b.items.length > 0 || canManage);
}
```

**Why this is right at `days.length <= 1` without a branch on it:** when there is one day, `days` is
`[]` or a single-element array whose one day never appears in `session_day_id` (T1's writers leave it
`null` at `n <= 1` — the photo writer explicitly, materials/tasks because the UI never offers a second
group to press). So `group()` always produces exactly one non-empty bucket — the session bucket — at
one day. **The heading/wrapper is omitted only when there is exactly one bucket to show**, which is a
property of the DATA (`days.length <= 1` ⟹ at most one bucket survives the filter), not a branch on
`isMultiDay` written into the component:

```tsx
const groups = group(materials, days, t("scope.session"), (d) => dayLabel(d), canManage);
if (groups.length <= 1) {
  const items = groups[0]?.items ?? [];
  // ↓ EXACTLY today's markup, unchanged — this is the byte-identical proof.
  return (
    <div>
      <p className="text-body-sm text-fg-muted">{t("count", { count: items.length, value: formatNumber(items.length) })}</p>
      <ul className="mt-4 flex flex-col gap-3">{items.map((m) => <li key={m.id}>{/* same <Card> as today */}</li>)}</ul>
      {uploader}
    </div>
  );
}
return (
  <div>
    {groups.map((g) => (
      <div key={g.dayId ?? "session"} className="mt-6 first:mt-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-body font-medium text-fg-heading">{g.label}</h3>
          {canManage ? <Link href={`#materials-upload-form-${g.dayId ?? "session"}`} className="text-body-sm text-fg-body">{t("addAction")}</Link> : null}
        </div>
        {g.items.length === 0 ? (
          <p className="mt-2 text-body-sm text-fg-muted">{t("emptyGroup")}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">{g.items.map((m) => <li key={m.id}>{/* same <Card> */}</li>)}</ul>
        )}
        {canManage ? <div id={`materials-upload-form-${g.dayId ?? "session"}`} className="mt-3 scroll-mt-4"><UploadForm sessionId={sessionId} dayId={g.dayId} .../></div> : null}
      </div>
    ))}
  </div>
);
```

Photos differ in one respect only: **no per-group upload control** (photos never ask) — the single
`UploadWidget` stays exactly where it is today, unscoped, below every group. Grouping there is
display-only.

**The byte-identical proof, named:** `tests/components/materials/list.test.tsx`,
`tests/components/tasks/panel.test.tsx`, `tests/components/photos/gallery.test.tsx`,
`tests/e2e/materials.spec.ts`, `tests/e2e/tasks.spec.ts`, `tests/e2e/photos.spec.ts`,
`tests/e2e/proposal-materials.spec.ts` — every one of these seeds a one-day session (there is no
other kind on `main` today) and asserts against the exact markup above; if `days.length <= 1` ever
takes the grouped branch by mistake, one of these seven goes red with **zero code changed to it**,
which is the ledger's own bar for a real defect. I am not touching any of the seven.

### 5 — T3: `materials.phase` relative to scope — the policy texts, live beside proposed

**Table policy — live (`0053`, the current `materials_read`, which already carries the proposal
branch from wave 2):**

```sql
create policy "materials_read" on public.materials for select to authenticated
  using (org_id = public.auth_org_id()
         and removed_at is null
         and (
           (session_id is not null and (
             phase = 'before'
             or exists (select 1 from public.sessions s
                         where s.id = materials.session_id
                           and s.state in ('completed', 'archived'))
             or public.is_presenter_of(session_id)
           ))
           or (proposal_id is not null and public.is_proposal_owner_of(proposal_id))
           or public.is_staff()
         ));
```

**Proposed — only the session-scoped «بعد» branch splits in two; the proposal branch, the presenter
branch and the staff branch are untouched:**

```sql
drop policy "materials_read" on public.materials;
create policy "materials_read" on public.materials for select to authenticated
  using (org_id = public.auth_org_id()
         and removed_at is null
         and (
           (session_id is not null and (
             phase = 'before'
             or (
               session_day_id is null
               and exists (select 1 from public.sessions s
                           where s.id = materials.session_id
                             and s.state in ('completed', 'archived'))
             )
             or (
               session_day_id is not null
               and exists (select 1 from public.session_days d
                           where d.id = materials.session_day_id and d.ends_at <= now())
             )
             or public.is_presenter_of(session_id)
           ))
           or (proposal_id is not null and public.is_proposal_owner_of(proposal_id))
           or public.is_staff()
         ));
```

Session-scoped «بعد» keeps reading `sessions.state` exactly as today — `sessions.ends_at` is now the
**last** day's end (`DEC-150`, the lead's own trigger), so the existing clock job that flips a session
to `completed` already fires at the right moment for a multi-day session with no change on my side.
Day-scoped «بعد» never touches `sessions.state` at all — it reads the one day's own `ends_at`, which is
what lets day 1's slides release Wednesday evening rather than Friday.

**Storage twin — live (`0054`, the current `materials_storage_read`, pre-upload branch included):**

```sql
create policy "materials_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (
      exists (
        select 1 from public.material_versions mv
          join public.materials m on m.id = mv.material_id
          left join public.sessions s on s.id = m.session_id
         where mv.id = nullif((storage.foldername(name))[5], '')::uuid
           and m.removed_at is null
           and (
             (m.session_id is not null and (m.phase = 'before' or s.state in ('completed', 'archived') or public.is_presenter_of(m.session_id)))
             or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
             or public.is_staff()
           )
           and (m.allow_download or (m.session_id is not null and public.is_presenter_of(m.session_id))
                or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id)) or public.is_staff())
      )
      or ((storage.foldername(name))[2] = 'sessions' and (public.is_presenter_of(nullif((storage.foldername(name))[3], '')::uuid) or public.is_staff()))
      or ((storage.foldername(name))[2] = 'proposals' and (public.is_proposal_owner_of(nullif((storage.foldername(name))[3], '')::uuid) or public.is_staff()))
    )
  );
```

**Proposed — the same split, inside the same `exists`, joining `session_days` on `m.session_day_id`:**

```sql
drop policy "materials_storage_read" on storage.objects;
create policy "materials_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (
      exists (
        select 1 from public.material_versions mv
          join public.materials m on m.id = mv.material_id
          left join public.sessions s on s.id = m.session_id
          left join public.session_days d on d.id = m.session_day_id
         where mv.id = nullif((storage.foldername(name))[5], '')::uuid
           and m.removed_at is null
           and (
             (m.session_id is not null and (
               m.phase = 'before'
               or (m.session_day_id is null and s.state in ('completed', 'archived'))
               or (m.session_day_id is not null and d.ends_at <= now())
               or public.is_presenter_of(m.session_id)
             ))
             or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
             or public.is_staff()
           )
           and (m.allow_download or (m.session_id is not null and public.is_presenter_of(m.session_id))
                or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id)) or public.is_staff())
      )
      or ((storage.foldername(name))[2] = 'sessions' and (public.is_presenter_of(nullif((storage.foldername(name))[3], '')::uuid) or public.is_staff()))
      or ((storage.foldername(name))[2] = 'proposals' and (public.is_proposal_owner_of(nullif((storage.foldername(name))[3], '')::uuid) or public.is_staff()))
    )
  );
```

Rule 4's own words — "a row readable whose object is not is wave 2's `0054` bug again" — is exactly why
this moves in the same commit as the table policy, never after it.

**`03-permissions-rls.md` §5.5a is now stale** (it still shows the pre-`0053` text, single-session
branch, no day clause) and is lead-only — I'm not editing it, but the lead's promotion step should
update §5.5a/§5.6c to the text above so the document matches what actually runs, the same debt DEC-121
already left against `01-prd.md`/`02-domain-model.md` (both of which it did update) but not `03`.

### 6 — Contract 7: how the slots get days

Each slot's DAL function (`getMaterialsPageData`, `getTasksPageData`, `getPhotosPageData`) calls
`listSessionDays(sessionId)` from `lib/dal/sessions.ts` inside its existing `Promise.all`, exactly the
way it already reads `session_presenters`/`org_settings` — reading another track's DAL module is the
named mechanism of contract 3, not a request. Each `*Summary` DTO (`MaterialSummary`, `TaskSummary`,
`PhotoSummary`) gains `sessionDayId: string | null`, selected alongside every other column already
selected.

**What I need from `sessions`, and by when:**
- `SessionDay { id, position, startsAt, endsAt, venue }` and `listSessionDays(sessionId)`,
  `cache()`-wrapped, before I can write a single line of T2 — this is the order the wave already
  forces (contract 3 first, per `STATUS.md`'s "order inside the wave").
- The day-label formatter («اليوم الأول · الأربعاء» — ordinal + weekday). I need it callable from an
  `async` server component (`Materials`/`Tasks`/`Photos` already are) with a `SessionDay` and the
  active locale in, a string out — signature is `sessions`' choice, I'll adapt to whatever it publishes,
  but I need it **before** T2 too, for the same reason.

### 7 — T4: the real-worker photo run — what it needs from the lead

`tests/e2e/wave9-content-photo-worker.spec.ts` (new, mine), gated `process.env.E2E_WORKER === "1"`,
same shape as `wave8-designer-editor.spec.ts`'s own `WORKER` gate. It needs: a running worker process
against the same local Supabase the e2e run targets, built from a tree that includes my
`process_photo.ts`/`initiate_photo_processing()`/`record_photo_upload()` changes — which only exists
once my SQL is promoted, so this runs **after** promotion, in whichever verification window the lead
already uses for a real-worker pass (wave 8's `E2E_WORKER=1` run was the lead's own). I will not start
a worker process or touch the verification worktree myself — I write the spec, and ask.

### 8 — The re-scope chip: a native control, not `ui/menu`

**A native control does the job — no request to the lead.** `<details>`/`<summary>` is a real
disclosure widget (keyboard-operable, no JS required, screen-reader exposed as expanded/collapsed)
and the options underneath are a plain `<form>` with one `<button formAction={rescopeAction} value={dayId}>`
per day plus one for «للورشة كاملة», not a `<select>` (a boundary-crossing scope change reads better as
named destinations than as a dropdown you have to open twice). No client component, no `ui/menu`:

```tsx
<details className="relative inline-block">
  <summary className="cursor-pointer text-body-sm text-fg-body">{currentLabel} ▾</summary>
  <form action={rescopeMaterialAction} className="absolute z-10 mt-1 flex flex-col gap-1 rounded-field border border-edge bg-canvas p-2 shadow-md">
    <input type="hidden" name="materialId" value={m.id} />
    <button type="submit" name="dayId" value="">{t("scope.session")}</button>
    {days.map((d) => <button key={d.id} type="submit" name="dayId" value={d.id}>{dayLabel(d)}</button>)}
  </form>
</details>
```

Rendered only for staff (and, for materials/tasks, the presenter) — a plain member never sees it, since
they cannot call the RPC anyway and a control that always 403s is worse than no control.

### 9 — REQ-TSK-002, confirmed against the actual import graph

Grepped `src/components/checkin/**` and `src/lib/dal/{rsvp,checkin}.ts` for `session_tasks`,
`task_completions`, `task_form_responses`, `tasks.ts`, `TaskItem`, `CreateTaskForm` — zero hits in
either direction. `0037`'s own header comment ("nothing under checkin/ or scoring/ references
session_tasks anywhere") still holds on disk today. Nothing I am proposing this wave changes that:
`rescope_task` reads `session_tasks`/`sessions` only, never a check-in table, and no check-in RPC of
`checkin`'s reads `session_tasks`. This confirmation is mine to repeat at every sync, not a one-time
check — the lead's guard test (contract 10, row L3) is the enforcement; this is my own evidence for it
starting from a clean state.

### 10 — Owed to `sessions`: a day's content count, for the deletion confirm

`sessions` needs "how much content does this day hold" for its delete-day confirm dialog (agent brief:
"a DAL count, asked of you by sessions"). Once T1 lands I will publish, from whichever of my three
modules makes sense (probably a small new function in `materials.ts` since it's the one `sessions`
already reads for the proposal-materials page), something shaped like:

```ts
export async function countDayContent(dayId: string): Promise<{ materials: number; tasks: number; photos: number }>
```

a plain `count(*) where session_day_id = $1` on each of the three tables, org-scoped through
`sessionClient`. Not built yet — noted here so `sessions` knows it is coming and roughly what it looks
like, and I will confirm the exact signature once `sessions`' delete-day confirm tells me what shape it
actually wants (a total, or the three numbers separately, as sketched above).

### 11 — States to capture at 390 px (`.qa-shots/rtl/wave9-content-*.png`)

Matches the agent file's Definition of Done exactly, listed here so the sync checklist and the
captures stay in the same order: materials as a member on a three-day workshop (session group + two
day groups); materials as the presenter (same, with «أضف» in each header, including an empty day
group's header); the scope chip open (`<details>` expanded) on a materials item; a day-scoped «بعد»
material on day 2 of 3 — hidden before that day's `ends_at`, visible after; the tasks section grouped;
the gallery grouped; and, beside their wave-6/7 originals for comparison, the three sections of a
one-day session — no group, no heading, no chip.

### 12 — Carried finding: the photo tile's takedown label wrap

Still open. Not touched this wave unless it falls out of the gallery's grouping change for free (the
`<li>` markup inside each group is unchanged from today's, so it won't) — I'm in the file anyway for
T2, but fixing an unrelated wrap bug in the same commit as the grouping change would make the
byte-identical diff (§4) harder to read, not easier. Deferred, stated so it isn't silently dropped.

### 13 — Numbered questions for the lead

1. **"Falling back to the nearest day" — is my metric (§3: nearest by absolute distance to whichever
   edge, start or end, is closer) the intended one?** The alternative reading is "the day that started
   most recently before the upload" (ignoring `ends_at` entirely, i.e. always attributing a gap-time
   photo to the day before it, never the day after) — simpler, but wrong for a photo taken during a
   long overnight gap that is genuinely closer to the *next* day's start than the previous day's end. I
   have a preference (mine) but this is squarely the kind of definition `DEC-121` left for the writer to
   set, and I'd rather it be a ruling than my own unchecked guess baked into a service-role function
   nobody re-reviews per call.
2. **`03-permissions-rls.md` §5.5a is stale even before this wave** (never updated for `0053`'s proposal
   branch) and will be more stale after T3. It's lead-only; I'm flagging it rather than silently leaving
   the document wrong, not asking for anything from me.
3. **Should re-scoping be audited?** `REQ-MAT-008` audits removal; phase/`allow_download` edits are not
   audited today. I've matched the lower bar (no audit) in §1/§2's RPCs for consistency with the
   *other* material/task edit paths, but re-scoping is closer in kind to a removal (it changes where
   content is found) than to a phase toggle. Happy to add `write_audit()` calls to all three RPCs if the
   lead wants the higher bar instead — one line each, not a redesign.
4. **The day-label formatter's exact signature is `sessions`' choice (§6)** — not asking the lead to
   rule on it, just flagging that T2 cannot start until it exists, so it's worth being early in
   `sessions`' own plan if it isn't already.
5. **`countDayContent()`'s shape (§10)** — a total, or the three counts separately? I'll build whichever
   `sessions`' confirm dialog actually needs once asked; not blocking, just naming it now so it isn't a
   surprise mid-wave.

Ready for sync.

## §21 — T1 and T3 built and green (`3830191`)

Applied the two sync-1 defect fixes from the regenerated agent file before writing anything: T2's
grouping will key the flat/grouped choice on `days.length`, never on how many buckets happen to be
non-empty (that was my own draft's bug, caught before code — noted here so the reasoning survives
into T2); `record_photo_upload()` is `drop function` then `create function`, never `create or
replace`, because a different argument list makes a second overload instead of replacing the first.

**T1** — `supabase/proposed/content/0001_day_scope_writes.sql`: `rescope_material`/`rescope_task`/
`rescope_photo`, each a door rather than a wider grant (staff is broader than the existing
admin-only/presenter-only update policies already grant on other columns, and widening those would
leak write on `title`/`form_schema`/etc. too); a named `day_not_of_session` refusal ahead of the
composite FK's bare `23503`; a material's rescope audited (`material.rescoped`). Photos: the upload
moment is captured in `initiate_photo_processing()` — not `record_photo_upload()`'s own, later
clock, which runs after the worker's download/sniff/strip and could cross a day boundary the real
upload didn't — threaded through the job payload as `uploaded_at`, optional on the worker's `Payload`
type so an already-enqueued job from the OLD `initiate_photo_processing()` (additive: pushed before
this migration lands) is never rejected as malformed, just falls back to this task's own clock,
exactly the SQL function's own default. `resolve_photo_day()`: one `order by` does both the
"in-window" and "nearest edge" steps at once — a day whose window contains the moment sorts first
(only one can, days never overlap); failing that, `least(|start diff|, |end diff|)` per day picks
the nearest. `MaterialSummary`/`TaskSummary`/`PhotoSummary` gained `sessionDayId` — mechanical fixture
updates to five EXISTING component test files (`list`, `proposal-list`, `gallery`, `panel`,
`task-item`) followed, each adding `sessionDayId: null` to a fixture literal with **no assertion
touched** — flagging these for the ledger, since rule 4 asks every edit to an existing test file to
be logged even when nothing it asserts changes.

**T3** — `supabase/proposed/content/0002_materials_phase_by_scope.sql`, and the reason it is five
policies, not two. Built `materials_read` and its storage twin exactly as planned, wrote
`tests/rls/storage-content-days.test.ts` against them, and the FIRST assertion after a day ended
still failed — `0` rows, no exception. Dumped the exists() body as both owner and member before
guessing: `materials_read` let the member see the material's ROW; `material_versions_read` (0037)
did not let them see its VERSION, because it carries its own, completely separate copy of the old
phase check — `join sessions s … and (m.phase = 'before' or s.state in (...) or is_presenter_of(...)
or is_staff())` — never touched since 0037, not even by 0053's proposal branch. Grepping confirmed
`material_pages_read` and `material_pages_storage_read` (the `material-pages` bucket, the actual
page-image bytes the viewer displays) duplicate the identical text a second and third time. Fixed
all three the same way `materials_read`/its twin were fixed — one added OR-branch, the session-state
clause left untouched, `d.ends_at <= now()` joined in via `left join session_days d on d.id =
m.session_day_id`. **A day-scoped «بعد» releases on EITHER its own day ending OR the session
completing/archiving early** (DEC-151's ruling) — the session-state clause was never conditioned on
scope, so this needed no new branch beyond the day-ended one; a session-scoped material needed no
change at all, since `sessions.ends_at` is already the last day's end (0100).

★ **A separate, pre-existing, day-unrelated bug found on the way, deliberately NOT fixed**: those
same three policies `INNER JOIN sessions` unconditionally, so a proposal's own material
(`session_id is null`) can never satisfy any of them — a proposal owner can see their draft
material's row (`materials_read` has had the proposal branch since 0053) but never its version or
its rendered pages. Predates `DEC-121` by two migrations, is about proposals not days, and widening
into it uninvited felt like exactly the kind of quiet scope creep `CLAUDE.md` asks against. Left
the `join` exactly as it reads today in all three; said so in the file's own header comment; saying
it again here for the lead.

Also stale, flagged not touched (lead-only, `docs/plan/**`): `03-permissions-rls.md` §5.5a was never
updated for 0053's proposal branch and doesn't mention `material_versions_read`/`material_pages_read`/
`material_pages_storage_read` at all — worth fixing at promotion, alongside this wave's own change.

**Proven together**: `tests/rls/{materials,tasks,photos}-schema.test.ts`, `photos-broadcast.test.ts`,
`storage-content.test.ts` and `proposal-materials.test.ts` (the untouched evidence) plus the four new
`*-days.test.ts` files — 9 files, 94 tests, green in one run. `npx tsc --noEmit` and `npm run lint`
clean on my files (two unrelated red spots seen mid-run — `tests/components/me/calendar-page.test.tsx`
against `notify`'s in-flight `calendar.ts`, and `src/lib/dal/checkin.ts` against `checkin`'s own
WIP — neither mine, neither touched). `npm test` 196/196 files, 1827/1827 tests.

★ **A concurrency finding worth naming**: an early full `npm run test:rls` run showed ~20 failures
across files I have never touched (`isolation.test.ts`, `designer-schema.test.ts`,
`award-presenter-points.test.ts`, `scoring-schema.test.ts`, `notify-reminders.test.ts`,
`scoring-days-award.test.ts`) that vanished on a second run once `pgrep` showed no other vitest
process — almost certainly another teammate's concurrent `npm run test:rls` (or the schema settling
mid-run), not a real defect; I did not chase it, and it is not evidence against any of those tracks'
own work. Isolated my four new files (plus the untouched evidence suite) and confirmed green with
nothing else running before trusting the result.

T2 is next, waiting on `sessions'` `listSessionDays()`/`SessionDay` and the day-label formatter (§6).

Ready for sync.

## §22 — two fixes from the lead's review (`0d1ecc2`)

`sessionDayId` on `MaterialSummary`/`TaskSummary`/`PhotoSummary` is now **optional**
(`sessionDayId?: string | null`), not required — absent and `null` both mean the whole session, and
the five existing component test files (`materials/{list,proposal-list}`, `photos/gallery`,
`tasks/{panel,task-item}`) are back to their exact pre-wave-9 content (`git checkout 3830191~1 --
<paths>`, confirmed empty against `HEAD` and against each file's own prior commit). "New behaviour
gets new test files" now holds with nothing to explain in the ledger.

Also fixed: two `session_days_no_overlap` collisions the lead's promotion run caught that my own
run had not (the fixture states involved happened to differ by a few minutes of wall-clock
placement — `now()`-relative arithmetic is fragile that way). Rebuilt every day in all four
`*-days.test.ts` files on `tests/rls/session-days.test.ts`'s own `addDay(fromH, toH)` — wide,
separated integer hour offsets, the same convention the foundation's own suite uses. Re-verified:
`materials/tasks/photos-schema`, `photos-broadcast`, `storage-content`, `proposal-materials`,
`session-days` (the foundation's own) plus the four `*-days` files — 10 files, 122 tests, green
together, `pgrep` clear before and during. `npx tsc --noEmit`/`npm run lint` clean on my files
(unrelated red elsewhere from `checkin`/`sessions` WIP, not touched). `npm test` 196/196, 1833/1833.

Starting T2 now — contract 3's readers landed (`3cdc690`): `listSessionDays(locale, sessionId)` and
`SessionDay` from `lib/dal/sessions.ts`; `dayLabel`/`dayShortLabel`/`dayOrdinal`/`dayRange`/
`dayCountLabel` from `components/sessions/day-label.ts`.

Ready for sync.

## §23 — T2 built and green (`a2b40ec`)

All three slots (`materials/list.tsx`, `tasks/panel.tsx`, `photos/gallery.tsx`) now read
`listSessionDays()` and group. The `days.length <= 1` branch calls the exact same card/grid
render function the grouped branch calls, with no scope passed — the flat branch is not a second
implementation, it is the shared one called with a `null`. That is what let
`materials/tasks/photos-schema` and `list/panel/gallery.test.tsx` stay unmodified: confirmed by an
empty `git diff` against each and a green run of all three together with the new grouping tests.

**Two real defects the new tests caught, not guessed at:**
1. **`content-i18n.test.ts`** (mine, the numeral/bidi gate) failed on my first draft of five new
   message keys — a bare `{scope}`/`{label}` placeholder with no `<bdi>`. Fixed in the JSON source
   (`<bdi>{scope}</bdi>`) and read at the call site with `t.markup(key, {..., bdi: (c) => c})` —
   the plain-text form `aria-label` needs, matching `viewer/page-viewer.tsx`'s own established
   pattern for the identical reason.
2. **`panel.tsx` was passing `scope` to every `TaskItem` unconditionally**, not gated on
   `canManage` — unlike `materials`/`photos`, where the gate lives INSIDE the shared card/grid
   component (`MaterialCard`'s own `canManage` prop, `PhotoGrid`'s own `isStaff` prop) so it could
   not be forgotten at the call site. `panel-grouping.test.tsx`'s "a plain member sees no chip"
   case failed against the real bug, not a broken test — a plain member would have seen an
   interactive-looking control the server always refuses (`rescope_task`'s own authority check),
   confusing rather than dangerous, but wrong. Fixed by gating the prop at the call site instead;
   noted here because the asymmetry (two slots gate inside the shared component, one gated at the
   call site until this fix) is exactly the kind of drift a later reader would not expect.

**Design decisions made while building, not pre-planned in §1-§20:**
- The re-scope chip's menu never needs a separate "current scope, unchanged" no-op guard — picking
  the option already shown as current just re-sends the same day/null, and `rescope_*`'s own
  early-return (`p_day_id is not distinct from v_old_day` for materials; a plain update for
  tasks/photos, idempotent either way) makes that a no-op audit-free write, not a bug to prevent
  client-side.
- A per-item scope LABEL is shown only via the interactive chip (staff/presenter), never as inert
  text for a plain member — the group heading already says it, and repeating it under every card
  read as clutter once built and looked at.
- `getSessionHeading()` (`sessions.ts`, unmodified, already published) is what each of the three
  DAL functions calls for `timeZone` — one more small read alongside the existing
  `session_presenters`/`org_settings` `Promise.all`, not a new duplicated org-settings-fallback
  helper written three times.

**New component tests** (`list-grouping`, `panel-grouping`, `gallery-grouping`) prove: session
content first then days in order, each its own `<h3>`; an empty group omitted for a plain member,
kept for a manager with «أضف» in every header including the empty one; no chip for a plain member,
a chip listing every day (+ the session) for whoever may use it; axe-clean.

`npx tsc --noEmit` and `npm run lint` clean on my files. `npm test` 201/201 files, 1851/1851 tests
(up from 196/1833 — other teammates' concurrent commits, unrelated).

**Not yet done, and why:** the 390 px RTL captures (need a production build, the lead's) and T4's
real-worker photo spec (needs T1's SQL promoted first — `resolve_photo_day()`/`record_photo_upload()`
don't exist in `supabase/migrations/` yet). Both are next once told the SQL landed and a build is
available; the re-scope RLS assertions (`rescope_material` etc. actually moving a row visible
end-to-end through the promoted policies, not just the mocked component tests here) are the same
dependency.

Ready for sync.

## §24 — T4's spec, and T2's own captures (`9c01579`, `82e5f8f`)

Two new real-Supabase Playwright specs, neither run by me — both need `npm run test:e2e:local`,
which needs a production build, lead-only.

**`tests/e2e/wave9-content-photo-worker.spec.ts`** — T4. Gated `E2E_WORKER=1`
(`wave8-designer-editor.spec.ts`'s own convention); skips itself otherwise, since there is nothing
to prove about the real worker without one running. Drives a real upload through `UploadWidget`
with a hand-built JPEG carrying a real APP1/EXIF marker (the same construction
`storage-exif.test.ts`'s own `jpegFixture()` uses, ported to a real file Playwright can `setInput
Files` with), then asserts — with **no `page.reload()` anywhere in the test** — that the gallery's
image appears on its own (REQ-EVT-010's own no-reload clause, reconciled in wave 7 but never
actually driven through a real worker until this), `exif_stripped = true`, `session_day_id` resolves
to `null` at one day, and the re-uploaded object itself carries no `0xFFE1` marker — read back from
Storage, not trusted from the flag alone. One day, deliberately: T4 proves the pipeline runs for
real, not the day-resolution logic (`photos-days.test.ts` already covers in-window/nearest-edge/
n<=1 exhaustively against `applyProposed()`).

**`tests/e2e/wave9-content-days.spec.ts`** — T2's own captures, a real three-day session seeded
directly (the same `addDay()` shape `session-days.test.ts` uses). Six states:

- `wave9-content-materials-member-grouped.png` — a plain member: session group + two day groups
  with content, day 3 (empty) omitted
- `wave9-content-materials-presenter-grouped.png` — the presenter: every group including the
  empty third day, each with its own «أضف مادة»
- `wave9-content-materials-scope-chip-open.png` — the chip open, listing the session and all
  three days
- `wave9-content-materials-day-scoped-after-hidden.png` / `…-visible.png` — day 2's «بعد»
  material, before and after its own day's `ends_at` (moved mid-test)
- `wave9-content-tasks-grouped.png`
- `wave9-content-photos-grouped.png` — no per-group add control (photos never ask)

The one-day comparison baseline is NOT re-captured: `materials/tasks/photos-event-page-390-rtl-
phone.png` already exist from wave 6/7's own specs, proven byte-identical this wave by the
untouched schema/component suites.

★ **A real bug found writing this spec, before it ever ran**: materials, tasks and photos all
group on the same session, so an unscoped `page.getByRole("heading", { name: "للورشة كاملة" })`
resolves to three elements (one per slot) and Playwright's strict mode would refuse every locator
in the file. Scoped every query to its own slot's `#materials`/`#tasks`/`#photos` — verified against
`gated-section.tsx` itself (`<section id={id}>`, the page's own landmark), not assumed. Also caught
before running: an `UPDATE` that only moved `ends_at` into the past while leaving `starts_at` at
its original future value would have violated `check (ends_at > starts_at)` outright; and the day
2 «بعد» material would have been invisible during the earlier "member-grouped" capture (test order
within one `serial` file matters — its own group would have been empty and the heading omitted) had
I not given day 2 a second, always-visible «قبل» item first.

`npx tsc --noEmit`/`npm run lint` clean on both new files. Ran everything else I could without a
build: `npm test` green on my own scope (13 files, 69 tests) with the two new specs' logic checked
by hand rather than executed — I did not attempt `test:e2e:local` myself (needs `npm run build`,
lead-only) and did not touch the lead's verification worktree.

Ready for sync — spec names above; capture names are the `.png` filenames listed.

## §25 — `wave9-content-days.spec.ts` fixed: the fixture, not a defect (`e22af5b`)

The lead's real-build run found the tasks capture failing — no tasks section at all, not a
locator problem — and gave three named possibilities from the `error-context.md` evidence, asking
which. It was (a): my fixture never gave the plain member an RSVP. `session-matrix.ts`'s
`AFFORDANCE_MATRIX` (§5.3 row 1, `DEC-090` — pre-existing, has nothing to do with days) withholds
`tasks` from an UNregistered viewer at the session's own `open` phase, which is exactly the phase
my session is in at test time (`in_progress`, between day 1 having ended and day 2 not yet begun —
`betweenDays()` correctly says so). `confirmed`'s cell has `tasks: true`; `none`'s does not.
Materials and photos never hit this because neither `materials_read` nor `photos_read` reads RSVP
status at all — only tasks' own affordance gate does, which is why only that one capture failed
and the other four (materials ×4, photos ×1) were already green on the real build. Added one
`rsvps` row for the member (`confirmed`); `session-matrix.ts` untouched, as asked.

Ready for sync — the lead re-runs.

## §26 — the lead's capture review: one real product bug, one test-timing bug (`dd1edb8`, `5c2be34`)

**Real bug, ruling 4** — `phaseLabelKey()` (new, `src/components/materials/phase-label.ts`): a
day-scoped material's badge still said «بعد الجلسة» while the workshop had days left to run —
`0116` enforces day-scoped release, but nothing had ever made the WORDING scope-relative. Applied
everywhere a material's phase is shown or chosen — the badge (`list.tsx`), the settings form's
select for an existing material (`settings-form.tsx`, which didn't know its own item's scope at
all until now), and the upload form's select when the add control sits in a day's header
(`upload-form.tsx`, already had `sessionDayId` from T1). A standalone module, not exported from
`list.tsx` — that file already imports both forms, so the reverse import would be circular. Driven
from `sessionDayId` alone, never `days.length`, so a one-day session structurally cannot reach the
new strings. Two new messages (`phase.beforeDay`/`afterDay`), Arabic first; one component test per
branch in `list-grouping.test.tsx`; `list.test.tsx` untouched.

**Test bug, not product** — `wave9-content-materials-day-scoped-after-hidden.png` was two Suspense
skeletons, not content: the test's only assertion before that screenshot was `toHaveCount(0)` on
the day-2 material's own text, which is exactly as true before the section has rendered anything
as it is once the item is correctly withheld — a vacuous pass. `waitForStreamsToSettle()` doesn't
cover this; it clears a different artefact (a hidden duplicate React's reveal script leaves
behind), not "has this slot's data arrived". Added two positive waits before each screenshot in
that test — the «المواد» h2, and the always-visible whole-workshop material (seeded «قبل»
specifically so it never depends on day 2's own state). Checked every other `toHaveCount(0)` in the
file as asked: the other two are each already preceded by three `toBeVisible()` checks that prove
the section rendered, so nothing else needed the fix.

`npx tsc --noEmit`/`npm run lint` clean, `npm test` 208/208 files 1887/1887 tests (the earlier
`notify` flake from §24/§25 is gone — not mine, not touched).

Ready for sync — the lead re-runs.

## §27 — a group's own form closed by default (`850f8ac`)

The lead's real-build run found `presenter-grouped` (and `scope-chip-open`) at 9,059 CSS px: every
group in the grouped materials/tasks view mounted its own `UploadForm`/`CreateTaskForm` OPEN, so a
three-day workshop carried four forms on screen at once (session + 3 days) — a ten-day workshop
(allowed) would be worse — while the header's «أضف مادة»/«إضافة» was only an anchor to a form
already rendered below it, making the header control redundant.

`GroupDisclosure` (new, one twin per directory per the standing per-directory-component
convention — `materials/group-disclosure.tsx`, `tasks/group-disclosure.tsx`): a native
`<details>`/`<summary>`, no new client state machine, works before hydration. The group's heading
row keeps its `<h3>`; the header's add control becomes the `<summary>`, closed by default, and its
own form sits inside as the disclosure's revealed content. Opening one group never closes another —
each is an independent `<details>`. A `toggle` listener (real browsers fire this per spec; jsdom
toggles `.open` on click but does not reliably dispatch the event itself, a documented test-env gap
only, not a component bug) moves focus into the revealed form's first field, so the control stays
usable from the keyboard and for a screen reader. The flat branch (`days.length <= 1`) never imports
`GroupDisclosure` at all, so it is untouched byte for byte — `list.test.tsx`/`panel.test.tsx` stay
green, unmodified.

One real ambiguity surfaced while testing, not before: `CreateTaskForm`'s own submit button and its
group's `GroupDisclosure` trigger both read `tasks.create.submit` ("إضافة") — the lead's own wording
for the header control ("«إضافة»/«أضف مادة» in the header") keeps that as the intended visible
label, so once a group is open a sighted user does see the word twice (header control, then the
form's own submit button below it) — the same ambiguity the *pre-existing* empty-state action button
already carried (it reused the identical string). Left the visible wording alone rather than
second-guessing a label the lead specified; `summaryAriaLabel` already carries a distinct string
(«إضافة مهمة — {scope}») for assistive tech, which is the channel that actually disambiguates.
Materials has no such collision — the upload form's own submit button reads «رفع», distinct from the
group trigger's «أضف مادة» — so only the tasks test needed a query fix: `getAllByText("إضافة")`
alone matches both the 3 triggers and (once open) up to 3 forms' own submit buttons, since jsdom
doesn't hide a closed `<details>`'s children the way a browser does; scoped to `<summary>` elements,
which is exactly the header controls the suite is about, not a change to what the component renders.

Three new tests per directory (materials', tasks'): none open on load; the header control opens
exactly its own group's form and no other; opening moves focus to the form's first field. `axe`
still clean on the materials suite's existing accessibility test with the closed disclosure present.

`npx tsc --noEmit`/`npm run lint` clean, `npm test` 208/208 files 1902/1902 tests, `npm run test:rls`
99/99 files 1039/1039 tests (single-runner checked first, none active).

Ready for sync — the lead re-captures `presenter-grouped` and `scope-chip-open`, which should now
drop to a few thousand px.

## §28 — the rescope chip onto `ui/menu`, one shared component (`4532f5c`)

CI's design-system gate flagged what sync 1's design note called out as an acceptable shortcut at
the time: `materials/photos/tasks`' three `rescope-chip.tsx` files each hand-rolled the identical
`rounded-field border border-edge bg-canvas p-1 shadow-md` floating panel — `ui-lint`'s own class-
string rule (`REQ-UIX-001`/`DEC-087`), and new files cannot join the allowlist. The lead's message
named both fixes at once — build the control from the system, and three chips being the same
control is a hint there should be one file, not three — so both landed together.

`materials/rescope-chip.tsx` is now the one implementation; `tasks/rescope-chip.tsx` and
`photos/rescope-chip.tsx` are deleted (`rm`, not `git rm`), and `task-item.tsx`/`gallery.tsx` import
the materials file directly — a cross-directory import inside this track's own three directories,
not a boundary crossing. `onRescope: (dayId) => Promise<{error}>` is the one thing each caller binds
differently (`rescopeMaterialAction`/`rescopeTaskAction`/`rescopePhotoAction`, already the same
`(locale, sessionId, itemId, sessionDayId)` shape); everything else — trigger, option list, the
pending/error toast — is the one file now.

The panel moved from a hand-rolled `<details>`/`<div>` to `ui/menu` (`console`'s, held by the lead
as custodian this wave) — Radix owns focus trapping, typeahead and closing, and its floating panel
is the system's own class string, not a second copy of the one that started this. A native `<select>`
(`ui/select`, `sessions'`) was the other option the lead named; a menu fits what this control already
was — a trigger opening a list of choices, never a form field with a value — and keeps the exact
same interaction (open, pick one, it moves) rather than trading it for a full-width field. One trade-
off, not hidden: `MenuItem.label` is a plain `string` (console's own type), so a day's label can no
longer be wrapped in its own `<bdi>` the way the old per-option `<button>` was — day labels are
always algorithmically generated Arabic strings (`dayShortLabel()`/`sessionScopeLabel`), never
free-form/foreign text, so there is no real direction conflict for the isolate to guard against here;
the trigger, which this file still renders directly, keeps its own `<bdi>{currentLabel}</bdi>`.
Not worth a request against `console`'s type for a label that can never actually need it.

Three component tests (one per directory) moved from `<details>`/`<summary>` queries to the
role-based ones `ui/menu.test.tsx` already established — a real `<button>` trigger via
`.closest("button")`, `userEvent.click`, `screen.getAllByRole("menuitem")` — same assertion (three
options offered), different query shape for the same control. `list.test.tsx`/`panel.test.tsx`/
`gallery.test.tsx` (the flat-branch byte-identical proofs) stayed untouched.

`npm run ui-lint`: 0 violations (65 pre-existing held elsewhere in the tree, unrelated to this
track; 16 fewer than the allowlist permits after the two files' deletion — `--prune` is the lead's,
left alone). `npx tsc --noEmit`/`npm run lint` clean, `npm test` 208/208 files 1902/1902 tests,
`npm run test:rls` 99/99 files 1039/1039 tests (single-runner checked first, none active).

Ready for sync — told the lead ui-lint is green; the same rebuild that re-captures §27's two shots
covers this.

## §29 — a brand-new workshop can take a day's material or task (`a11d071`)

The lead's three-day demonstrable ran the way a person actually does — starting from an empty
session — and found a real defect neither of my grouping suites met, because both always seeded
content: `materials/list.tsx` and `tasks/panel.tsx` checked `items.length === 0` and returned the
flat empty state BEFORE the `days.length` branch that would have shown the grouped layout ever ran.
On a three-day workshop with nothing added yet — every workshop, on the day it is scheduled — the
presenter got the flat state: one sentence, one anchor, one form with no scope, and no group header
anywhere to press. Ruling 3's "pressing the control in the group's header is the choice" does not
exist as an affordance until something has already landed the other way — a chicken-and-egg the
demonstrable was the first thing to actually walk into.

Fix is entirely in what no longer returns early: the empty check in both files gained `&&
days.length <= 1`, matching the flat/grouped split every other branch already makes. A manager with
nothing yet at `days.length > 1` now falls through to the grouped branch unchanged — its own group
filter (`g.items.length > 0 || canManage`) already kept every group, empty or not, for a manager, so
the grouped branch needed exactly one addition: the same empty sentence the flat state uses, shown
once above the (closed, empty) group headers. Not `ui/empty-state` — its `action` is required by the
type on purpose (REQ-UIX-012: no "empty, full stop" rendering path), and there is no longer one
action to name, only each group's own. A plain member with nothing yet is unaffected either way —
the `!canManage` guard above both branches still returns `null` first.

Two Playwright locators the demonstrable's own screenshots also caught, both in
`wave9-content-days.spec.ts`: a `<summary>` does not resolve to `getByRole("button", ...)` — it is
announced to assistive tech as a disclosure/"button, collapsed" natively, which is right and stays —
located by `aria-label` instead (`summary[aria-label^='أضف مادة']`). The scope-chip-open test needed
a real rewrite, not a selector tweak: `RescopeChip` moved off `<details>` entirely in §28 (`ui/menu`,
committed separately, same day) — the old `page.locator("#materials details").filter({ hasText:
"اليوم الأول" })` matched the chip's own `<summary>{currentLabel} ▾</summary>` text, which no longer
exists; the trigger is now a real `<button>` found on its own distinct `aria-label`
("تغيير نطاق المادة: اليوم الأول"), and the open menu is asserted unscoped from `#materials` because
`ui/menu`'s content portals to the end of `<body>`.

Four new component tests (two per directory — empty + `days.length > 1` + manager shows every
group's closed control and no open form; the same for a plain member shows nothing, matching the
`!canManage` guard). Both files' own two-day fixture gives three groups (session + day 1 + day 2)
rather than a third day added only for these tests — the property under test (every group renders,
all closed) does not depend on the count; told the lead this substitutes for their literal "three
days → four disclosures" so it is not a silent deviation. `list.test.tsx`/`panel.test.tsx` (the
flat-branch byte-identical proofs) untouched.

`npx tsc --noEmit`/`npm run lint`/`npm run ui-lint` clean, `npm test` 208/208 files 1906/1906 tests
(+4 from the new tests), `npm run test:rls` 99/99 files 1039/1039 tests (single-runner checked first,
none active).

Ready for sync — the lead rebuilds and runs the demonstrable end to end.

## §30 — freeze: what is done, what is carried, capture paths (`15d8908`)

The lead's freeze message confirmed `15d8908` carries all three of this session's fixes — the
chip on `ui/menu` as one shared component (ui-lint green, allowlist pruned, 11 lines gone), the
group disclosure closed by default, and the empty-grouped-state fix — and is the build the
demonstrable now runs against. No RLS or e2e run started or in flight at the freeze; none needed
starting after it either. This section is the wrap-up the freeze asked for.

**Done, this wave (`DEC-121`, contract 7):**
- T1 — day-scoped write paths: `sessionDayId` threaded through create/update on all three kinds,
  `rescope_material()`/`rescope_task()`/`rescope_photo()` RPCs, `resolve_photo_day()` (photos never
  ask — nearest-window auto-scope at upload time).
- T3 — phase-by-scope release: `materials_read` and, once found, its four less-obvious twins
  (`materials_storage_read`, `material_versions_read`, `material_pages_read`,
  `material_pages_storage_read`) all gated the same way — a day-scoped «بعد» releases on its own day
  ending OR the session completing/archiving early.
- T2 — the grouped views: one list per content type, session content first then each day in order,
  no groups/headings at `n ≤ 1`, the re-scope chip, `materials.phase` read relative to scope
  (`phaseLabelKey()`), each group's own add control behind a closed-by-default disclosure
  (`GroupDisclosure`), and — the freeze-adjacent fix — a brand-new workshop with nothing yet still
  renders the grouped layout for a manager rather than falling back to a scope-less flat form.
- T4 — one photo driven end to end on the real worker (`DEC-139`'s last gap), proven by
  `wave9-content-photo-worker.spec.ts`.
- The rescope chip is one shared component (`materials/rescope-chip.tsx`) on `ui/menu`, not three
  hand-rolled floating panels — `ui-lint`'s own finding, fixed the same day.
- Every DTO addition (`sessionDayId`, `days`, `timeZone`) landed optional, so all five pre-existing
  component test files this track does not own the assertions of
  (`list.test.tsx`/`panel.test.tsx`/`gallery.test.tsx`/`task-item.test.tsx`/`proposal-list.test.tsx`)
  needed only mechanical fixture additions, logged in the ledger, no assertion touched.

**Carried — not this wave, named for wave 10:** the pre-existing, day-unrelated bug in
`material_versions_read`/`material_pages_read`/`material_pages_storage_read` — all three
unconditionally `INNER JOIN sessions`, so a proposal's own draft material (`session_id is null`) can
never show its version or its rendered pages to its own owner, only its row. Predates `DEC-121` by
two migrations (`0037`), is about proposals not days, found while building T3 and deliberately left
alone rather than widened into uninvited — said so in the SQL file's own header comment and in §21
at the time, said again here per the freeze's instruction. `03-permissions-rls.md` §5.5a is also
stale against it (never updated for `0053`'s own proposal branch) — worth fixing at promotion
alongside whatever wave 10 does with the policy itself.

**Capture paths** — all in `E2E_SHOTS_DIR` (default `.qa-shots/rtl`), phone project, 390×844:

| File | Spec |
|---|---|
| `wave9-content-materials-member-grouped.png` | `wave9-content-days.spec.ts` |
| `wave9-content-materials-presenter-grouped.png` | `wave9-content-days.spec.ts` |
| `wave9-content-materials-scope-chip-open.png` | `wave9-content-days.spec.ts` |
| `wave9-content-materials-day-scoped-after-hidden.png` | `wave9-content-days.spec.ts` |
| `wave9-content-materials-day-scoped-after-visible.png` | `wave9-content-days.spec.ts` |
| `wave9-content-tasks-grouped.png` | `wave9-content-days.spec.ts` |
| `wave9-content-photos-grouped.png` | `wave9-content-days.spec.ts` |
| `wave9-content-photo-worker-visible.png` | `wave9-content-photo-worker.spec.ts` |

Nothing further to send until the lead's next word — standing by through the freeze.

## §31 — T4 on the real worker: the toast locator, not the pipeline (`0df944a`)

The lead ran T4 on the real worker (build `15d8908`, `E2E_WORKER=1`); it failed on both projects at
a strict-mode violation, not the pipeline. `getByText("تتم معالجة الصورة الآن…")` (no `exact`)
resolved to two elements: the toast's own visible `<div>`, and Radix's live region
(`<span role="status">`), which echoes every toast's text prefixed with the shell's own
announcement word — a bug in the lead's own primitive (every toast product-wide has been announced
in English, «Notification», since M9; fixed at `07e16a0`, «إشعار» from the next build on — so the
live region keeps matching a substring query either way). Fixed with `{ exact: true }` at the one
line, which excludes the prefixed live-region span and matches only the toast itself. Checked both
wave-9 content specs for any other toast-by-text assertion under the same risk — none: the other
`getByText` calls in `wave9-content-days.spec.ts` assert material TITLES scoped inside `#materials`,
not a toast, and have no live-region duplicate to collide with.

No RLS/e2e run started for this (freeze in force) — `tsc`/`lint` only, both clean. Ready for the
lead's next real-worker run.
