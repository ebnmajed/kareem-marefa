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

## §32 — the closure crash, and two locator flakes it took to clear it (`8b8e995`, `aac7e89`, `19cb0b2`)

The freeze's one real product defect: any multi-day session with a material, task or photo sent a
manager straight to the route error boundary. `materials/list.tsx`, `tasks/task-item.tsx` and
`photos/gallery.tsx` are Server Components, and each built an inline arrow function —
`(dayId) => rescopeXAction(locale, sessionId, id, dayId)` — and passed it to the shared, `"use
client"` `RescopeChip` as a prop. React cannot serialise an ordinary closure across the
Server→Client boundary ("Event handlers cannot be passed to Client Component props"); jsdom renders
everything client-side, so no component test could ever meet it — only a real build crashes, and the
demonstrable met it the moment a manager added the workshop's first material. Fixed at all three call
sites: `rescopeXAction.bind(null, locale, sessionId, id)` in place of the closure — a `.bind()` of an
actual `"use server"` export crosses as a REFERENCE (Next's own documented "passing additional
arguments" pattern), never as a closure — and the prop renamed `onRescope` → `rescopeAction`: Next's
own TypeScript plugin only allows a function-typed Client Component prop across the boundary when it
is named `action` or ends in `Action`; confirmed against `node_modules/next/dist/docs` before writing
it, not from memory. Proven where it can only be proven: extended the materials scope-chip-open case
to press an option and assert the row moved groups (round-tripped, so the fixture is left as later
tests expect it), with the same proof added for one task and one photo — photos' own chip is
staff-only, so the fixture gained a moderator user, `photos.spec.ts`'s own established
provision-then-elevate pattern.

Went idle mid-fix waiting on a slow local `npm test` run (resource contention with the lead's own
concurrent build) instead of committing what was ready and reporting status — the lead's own message
caught it. Lesson recorded here plainly rather than only in the reply: report status instead of
silently waiting on a long-running check, even under time pressure, and especially when the whole
wave is blocked on one commit.

Two more rounds, both proof-side, no further product code touched:

- **Photos moved but the test claimed it hadn't.** `materials`'/`tasks`' own grouped `<h3>` sits two
  levels below its group `<div>` (a header-row wrapper holds the heading alongside the per-group add
  control's disclosure); photos has no add control at all ("never ask"), so its `<h3>` is a DIRECT
  child of the group — one level, not two. The two-hop locator, copied onto photos unchanged, silently
  resolved to the outer `<div>` wrapping every group, so `.locator("li").first()` picked the SESSION
  group's own (already-session-scoped) photo instead of day 1's — a real, harmless no-op, which is
  exactly why day 1's own heading never moved. Found by re-reading `gallery.tsx`'s JSX against the
  locator, not by running it (the freeze forbade that) — told the lead the reasoning in full rather
  than just the diff, since I could not verify it myself; the lead's rebuild confirmed it live.
- **A photo matched by exact `src` flaked on desktop only.** Every server render signs a fresh URL
  (the token carries `iat`), so the same photo's `src` differs across the render before and after
  `revalidatePath` — phone had only passed because both renders landed in the same second.
  `storage_path` always ends `/photos/<photoId>.jpg`, stable across any number of re-signs, so the
  fixture now captures the seeded id to `day1PhotoId` (the same way `day1Id`/`day2Id` already are) and
  the test matches on that substring instead of a captured-then-compared `src`.

`npx tsc --noEmit`/`npm run lint` clean at every step; no RLS or e2e run started at any point (freeze
in force throughout). The lead's own real-build runs are the only verification any of this got —
T4 passing on the real worker on both projects, and the demonstrable 7 of 7, are the actual proof.

## Wave 10 plan

Planning only, per the regenerated `.claude/agents/content.md`. Read (in order) `STATUS.md`'s START
HERE block and the wave-10 block, `CLAUDE.md` § *Ownership map (wave 10)*, `DEC-160` §6 and `DEC-155`
(where T1's defect was found and deliberately not fixed), `DEC-121`, `DEC-009`, `DEC-058`, `01-prd.md`
`REQ-PRO-004`/`REQ-MAT-001…009`, `0116_materials_phase_by_scope.sql` in full (the five policies' live
text, quoted below) with `0053_proposal_materials.sql`, `03-permissions-rls.md` §5.5a, and the current
`materials.ts`/`proposal-list.tsx`/`download-button.tsx`/`actions.ts` (both the viewer route's and
`components/materials/`'s). **No code, SQL, JSON or test written below is committed — this file only.**

### T1 — a proposal's own material

**Today's defect, precisely.** `materials_read` and `materials_storage_read` have carried a proposal
branch since `0053` and are correct today, unchanged by this wave. `material_versions_read`,
`material_pages_read` and `material_pages_storage_read` (all `0037`, touched only by `0116`'s day-scope
clause) `inner join sessions` — for a row whose `session_id is null` no branch is reached, `is_staff()`
included, because `is_staff()` sits *inside* the joined existence check in all three today. A proposal's
material therefore shows its **row** (title, kind, phase badge) but `getMaterialDownloadUrl()`
(`materials.ts:518`) reads `material_versions` under RLS and gets nothing back — `null` for owner and
staff alike.

**The three predicates, as I will write them — one shape, matching the already-correct
`materials_storage_read`.** Each: `join sessions` → `left join sessions` (so a null `session_id` doesn't
eliminate the row before the `where` is even evaluated), the existing session-shaped clause wrapped in
`m.session_id is not null and (...)`, a new `or (m.proposal_id is not null and
public.is_proposal_owner_of(m.proposal_id))`, and `is_staff()` pulled to the **top level** (it currently
sits inside the session branch in all three — that is the second half of the bug: even a `left join`
alone would not fix a staff reviewer, since `is_staff()` would still be gated behind `m.session_id is not
null`).

```sql
-- material_versions_read
drop policy "material_versions_read" on public.material_versions;
create policy "material_versions_read" on public.material_versions for select to authenticated
  using (org_id = public.auth_org_id() and exists (
    select 1 from public.materials m
      left join public.sessions s on s.id = m.session_id
      left join public.session_days d on d.id = m.session_day_id
     where m.id = material_versions.material_id
       and m.removed_at is null
       and (
         (m.session_id is not null and (
           m.phase = 'before' or s.state in ('completed', 'archived')
           or (m.session_day_id is not null and d.ends_at <= now())
           or public.is_presenter_of(m.session_id)
         ))
         or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
         or public.is_staff()
       )
  ));

-- material_pages_read — identical shape, one extra join hop (mv → m)
drop policy "material_pages_read" on public.material_pages;
create policy "material_pages_read" on public.material_pages for select to authenticated
  using (org_id = public.auth_org_id() and exists (
    select 1 from public.material_versions mv
      join public.materials m on m.id = mv.material_id
      left join public.sessions  s on s.id = m.session_id
      left join public.session_days d on d.id = m.session_day_id
     where mv.id = material_pages.material_version_id
       and m.removed_at is null
       and (
         (m.session_id is not null and (
           m.phase = 'before' or s.state in ('completed', 'archived')
           or (m.session_day_id is not null and d.ends_at <= now())
           or public.is_presenter_of(m.session_id)
         ))
         or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
         or public.is_staff()
       )
  ));

-- material_pages_storage_read — same shape again, storage.objects
drop policy "material_pages_storage_read" on storage.objects;
create policy "material_pages_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'material-pages'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and exists (
      select 1 from public.material_versions mv
        join public.materials m on m.id = mv.material_id
        left join public.sessions  s on s.id = m.session_id
        left join public.session_days d on d.id = m.session_day_id
       where mv.id = nullif((storage.foldername(name))[5], '')::uuid
         and m.removed_at is null
         and (
           (m.session_id is not null and (
             m.phase = 'before' or s.state in ('completed', 'archived')
             or (m.session_day_id is not null and d.ends_at <= now())
             or public.is_presenter_of(m.session_id)
           ))
           or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
           or public.is_staff()
         )
    )
  );
```

`materials_read`/`materials_storage_read`: **not touched** — already this shape since `0053`/`0116`.

**Proof a session's material is unchanged.** Every session-scoped row still has `session_id is not
null`, so its branch of each predicate is byte-for-byte what `0116` already evaluates — the `left join`
change only widens which rows survive the join, never which session-scoped rows satisfy the
`where`. Evidence, named, none of it edited: the five pre-`0116` suites (`materials-schema.test.ts` —
including its own `POL-materials.proposal.*`/`is_proposal_owner_of` describe blocks, `photos-
schema.test.ts`, `photos-broadcast.test.ts`, `tasks-schema.test.ts`, `storage-content.test.ts`) and the
four wave-9 `*-days.test.ts` files (`materials-days`, `photos-days`, `tasks-days`, `storage-content-
days`) — nine RLS files, all in my glob, all proven together at wave 9 sync and not reopened here — plus
`tests/e2e/materials.spec.ts`. ★ `STATUS.md:412` says "the six existing content suites" against `0115`/
`0116`; I count five pre-wave-9 files in my domain (the sixth may be counting `materials.spec.ts`, or a
file outside my glob) — flagged as an open question below rather than guessed.

**New cases** — `tests/rls/materials-proposal-versions.test.ts` (new file), against a draft proposal
material seeded the same way `materials-schema.test.ts:617`'s `seedProposalMaterial` already does, plus
a `material_versions` row and a `material-pages` bucket object with no `material_pages` row (proving the
page-policy branch is inert, not merely untested — see below):
1. the proposer reads `material_versions_read`'s row for their own proposal's material.
2. an **accepted** co-presenter reads it too (`is_proposal_owner_of`'s second clause).
3. staff — **both** `admin` and `moderator` (`is_staff()`'s full set) — read it, unrelated to the
   proposal.
4. an unrelated member (no relationship to the proposal at all) does not.
5. a co-presenter who has **not** accepted does not (`is_proposal_owner_of`'s `accepted` filter).
6. another org's admin does not (`org_id = auth_org_id()` on `material_versions_read` itself — this is
   the one clause that predates T1 and stays exactly as it reads).
7. one integration-shaped case per role (owner, staff): `materials_storage_read` (unchanged) **and**
   the fixed `material_versions_read` together let a real `createSignedUrl()` against the `materials`
   bucket succeed — the same two-step `getMaterialDownloadUrl()` itself performs — proving the fix closes
   the actual defect, not just the row-level symptom.
8. `material_pages_read`/`material_pages_storage_read` against the seeded material: **0 rows, no
   exception**, for the proposer, staff and the unrelated member alike — proving §4's claim (no page can
   exist while `proposal_id is not null`) rather than asserting it from the header comment alone.

**Do the two page policies need the branch at all?** No. A `material_pages`/`material-pages`-bucket row
is written only by the render job the `convert_document`/`render_pages` pipeline drives, and
`finalize_material_upload()` (`0053:225`) **defers that enqueue** while `session_id is null` — the
enqueue happens inside `carry_over_proposal_materials()` (`0053:132`), which is itself the trigger that
sets `session_id` and clears `proposal_id` in the same statement. So by construction, the moment any
`material_pages` row could exist, `proposal_id` is already null and `session_id` is already set — the
proposal branch on these two policies is **provably unreachable**, not merely untested-today. I add it
anyway, identically shaped to `material_versions_read`, for the same reason `0116`'s own header gives
for keeping the session-state clause unconditioned on scope: three policies that read as one gate is a
single invariant a reader can hold in their head; two that read as the gate and a third with a carved-out
exception is a standing trap for the next person who adds an inline-preview-before-carry-over feature and
copies "the" policy from the wrong one of the three. The cost is one dead `or` clause per file, proven
dead by case 8 above rather than asserted.

**The link.** `src/components/materials/proposal-list.tsx` (mine) renders it: a new
`ProposalDownloadButton` client component (new file, `src/components/materials/proposal-download-
button.tsx`, modelled on `app/sessions/[id]/materials/[materialId]/download-button.tsx:12` — same
`useTransition`/toast-on-failure shape) beside each `<li>` whenever `m.currentVersionId` is not null
(pdf/image/audio — never the two link kinds, which have no version). **For whom:** unconditional on
`canManage`/role — every material in `ProposalMaterials`' `materials` array already passed
`materials_read`'s proposal branch to arrive here at all (owner or staff only), and after T1's fix
`material_versions_read` + `materials_storage_read` admit exactly that same pair, so anyone who can see
the row can download it — mirroring the session-side viewer, where a presenter/admin's own downloads
bypass `allow_download` in `materials_storage_read`'s second predicate the same way. A new server action,
`requestProposalMaterialDownload` in `src/components/materials/actions.ts` (mine, already home to
`rescopeMaterialAction`), thinly wraps the existing `getMaterialDownloadUrl(locale, materialId)` — no DAL
change, the function is already generic over session/proposal. **Copy:** reuses `materials.list.download`
/ `downloadAudited` — both keys exist in `ar/en materials.json` today (lines 30–31) and are currently
**unused** by any component; I add the two missing siblings `downloading`/`downloadUnavailable`,
Arabic-first, copied verbatim from `materials.viewer`'s own (lines 84/86: «جارٍ التحضير…» / «التحميل غير
متاح لهذه المادة.») — same meaning, same screen family, no new sentence to draft. **Audit:**
`record_material_download()` (`0049`) needs no change — it re-derives `is_org_admin()` and looks up
`materials.org_id` alone, no `session_id` in its body, so it already works unmodified for a proposal
material; a moderator's download stays unaudited, exactly as a moderator's download of a *session*
material is unaudited today (`materials.ts:532`'s `role === "admin"` check) — an existing asymmetry,
untouched, not introduced by this fix. **The e2e**, through the real Route Handler and real Storage
(`0054`'s lesson): `tests/e2e/proposal-materials.spec.ts` (transferred to me) already uploads a real image
through the form in its first test and asserts admin visibility in its second (`:176`) — no spec today
clicks a download button at all (`materials.spec.ts:121`'s own comment: "not exercised by this spec").
I extend the second test (new assertions appended, none of its existing ones touched) to click
«تحميل» as the signed-in admin and, in a third new test, as the proposer — asserting a real signed URL
is returned (the button's own success path, `window.location.href` set to a `supabase.co`/local Storage
URL) rather than the failure toast.

**Does `allow_download` apply?** No — and I checked rather than assumed. `materials_storage_read`'s
download-permission predicate (the second `and (...)` block, `0116:114-119`, unchanged) is `m.
allow_download or (session-presenter) or (proposal-owner) or is_staff()` — proposal-owner and staff
already bypass the flag unconditionally, the same way a session's own presenter does. Since every viewer
of `ProposalMaterials` is by construction owner-or-staff (materials_read's proposal branch let them see
the row at all), `allow_download` can never be the reason a download is refused here — REQ-MAT-005's
control is a *member*-facing one, and a proposal has no member audience yet. `updateMaterialSettings`'s
UI (`SettingsForm`) is correspondingly absent from `proposal-list.tsx` today and stays absent — nothing
to build.

### T2 — two carried fixes

**1 · The photo tile's takedown label wraps.** ★ **Already fixed, on `main`.** `git log --
takedown-button.tsx` shows `7c6f9e5` (2026-09-16, part of PR #26/`f2ead54`) applied exactly the diagnosis
this note carried from wave 6: `size="sm"`'s fixed `h-9` beaten by a merely-added `min-h-9`
(emit-order, `DEC-111`/`133`'s class of bug) — fixed with `h-auto! min-h-9 py-2` on the `request`-mode
trigger button (`takedown-button.tsx:90`). Nothing left to change in the component. What remains is the
**capture** the definition of done already asks for — «the photo tile's takedown label on one line» —
which has apparently never actually been retaken against this fix (`STATUS.md` still lists the row open
at wave 10 as of this reading). I will take `.qa-shots/rtl/wave10-content-photos-takedown-390-rtl.png`
against a half-width tile with the real (long) Arabic label and close the row on that evidence rather
than re-touch code that is already correct.

**2 · A save pressed before hydration on `/app/me`.** The implementation this finding was written
against **no longer exists**. `actions.ts:14`'s own comment now reads "★ `useActionState`, not the old
redirect + `?saved=1`/`?error=1` query" — `profile-form.tsx` was rebuilt in wave 7 (`07a2f3b`) and
repaired again at wave 8 sync 5 (`bd517f6`, the company-select-after-save bug, a *different* defect from
this one: `state.attempt` not counting a success, and a `<select>`'s `defaultValue` not re-syncing —
both now fixed and both covered by `tests/components/me/profile-form.test.tsx` and `wave7-content-
me.spec.ts`'s own e2e assertion). There is no `redirect()` and no query param left in the form for a
pre-hydration POST to lose — the original bug, *as described*, cannot reproduce against this code,
because the mechanism it depended on is gone. Whether a **different** pre-hydration defect exists in the
current `useActionState`-based form — whether React/Next's own progressive-enhancement path for an
action-bound form (a plain HTML POST before hydration, which Next's server-action runtime is supposed to
resume into the same `useActionState` result on reload) actually restores `state.saved`/the echoed
values — I cannot determine from source; it depends on framework behaviour (`node_modules/next/dist/
docs/`) I have not been able to verify against a running instance. **What I need**: a production build
plus a submit driven before hydration completes or with JS disabled (`test:e2e:local`, matching how the
lead diagnosed `DEC-146`'s reserve probe) — a question to the lead per the gate rules, since diagnosing
this needs `npm run build`.

### T3 — `03-permissions-rls.md` §5.5a, corrected text (for the lead to land)

§5.5a today (`03:618-635`) is the **pre-`0053`, pre-`0116`** `materials_read` — no proposal branch, no
day-scope branch, and no mention of `material_versions_read`/`material_pages_read`/`material_pages_
storage_read` anywhere in the document. Replacement:

> #### §5.5a — `materials`, read — the phase gate, the day scope, and the proposal branch
>
> ```sql
> create policy "materials_read" on materials for select to authenticated
>   using (org_id = auth_org_id()
>          and removed_at is null
>          and (
>            (session_id is not null and (
>              phase = 'before'
>              or exists (select 1 from sessions s where s.id = materials.session_id
>                          and s.state in ('completed','archived'))
>              or (session_day_id is not null
>                  and exists (select 1 from session_days d where d.id = materials.session_day_id
>                              and d.ends_at <= now()))
>              or is_presenter_of(session_id)
>            ))
>            or (proposal_id is not null and is_proposal_owner_of(proposal_id))
>            or is_staff()
>          ));
> ```
> `REQ-MAT-006` in the database, as amended by `DEC-121`: a `بعد الجلسة` material releases when **its
> own scope** ends — the whole session's `completed`/`archived` state for a session-scoped material, or
> its own day's `ends_at` for a day-scoped one, whichever comes first (an early session completion never
> leaves a later day's material hidden forever). `REQ-PRO-004`: a proposal's own material (`session_id`
> null) is visible to its proposer, an accepted co-presenter, or staff, never to a plain member, until
> `sessions_carry_over_proposal_materials` (`0053`) reassigns it on publication.
>
> **The same gate, three more times.** `material_versions_read`, `material_pages_read` and the
> `material-pages` storage bucket's `material_pages_storage_read` each carry an **independent copy** of
> this predicate (`0037`, day-scope clause by `0116`, proposal branch by wave 10) — a viewer's read of
> `getViewerData()`/the download route reaches `materials` *and* one of these, so a row readable whose
> dependant is not is the defect this section exists to prevent (`0054`). The proposal branch on the two
> `material_pages*` policies is unreachable by construction (`carry_over_proposal_materials` clears
> `proposal_id` before any render job can write a page row) but is written anyway, for the same reason —
> see wave 10's `content` note §T1.
>
> **`allow_download` is not enforced here** — unchanged from today's text.

### Open questions — my recommendation first

1. **"The six existing content suites" (`STATUS.md:412`) vs. the five I can name pre-wave-9 in my
   domain** (`materials-schema`, `photos-schema`, `photos-broadcast`, `tasks-schema`, `storage-content`).
   **Recommendation:** treat it as six-including-`materials.spec.ts`, i.e. the DoD's own phrasing ("the
   six existing content RLS suites **and** `materials.spec.ts`") already separates the two — no action
   needed, just naming both explicitly in my proof rather than guessing a sixth RLS file into existence.
2. **T2·2's real mechanism.** **Recommendation:** grant a short production-build window
   (`npm run build` + `test:e2e:local` with JS disabled or a pre-hydration submit) once T1 is built and
   gated, rather than block T1 on it — T2·2 is independent of T1's SQL and can land in its own small
   commit (or close as "already fixed" like T2·1, if the repro shows nothing).
3. **`ProposalDownloadButton` as a near-duplicate of `download-button.tsx`.** Both wrap
   `getMaterialDownloadUrl` behind an identical `useTransition`/toast pattern; the only difference is the
   action they call (`requestMaterialDownload` takes no scope, `requestProposalMaterialDownload` would be
   the same body under a new name) and the `allowDownload` gate the session-side one keeps for a general
   member audience. **Recommendation:** keep them as two small files rather than one shared component
   with a boolean prop — the session-side one lives under a route directory for one `materialId` segment
   and reads `materials.viewer`; the proposal one lives in my shared `components/materials/` and reads
   `materials.list`; forcing one component to serve both namespaces is more indirection than the ~15 lines
   saved. Says so here in case the lead prefers a single shared component instead.

## Wave 11 plan

`DEC-166`, `DEC-167`, `CLAUDE.md` § *Ownership map (wave 11)*, `.claude/agents/content.md` (regenerated
`b8a51f6`) read. C1's target is the 27 `ui-lint` violations in my seven files; C2 is the accessibility
findings the lead's sweep routes to me (not yet run — I proceed on C1's own accessibility properties and
wait for the routed rows); C3 is the viewer against `13` §7. Planning only — nothing below is committed
except this file.

### Order

**create-form → task-item → proposal-list → gallery → the two privacy files → comment-composer.** The
first three are mine outright; the last three are "fixes only" files, done last and smallest, because a
`ui-lint` fix there is still a presentation change (rule 3 of `DEC-166`) but I hold those files for less
than my own four, so I want any request they raise in front of the lead before I touch them, not after.

### C1 — per file

#### 1. `src/components/tasks/create-form.tsx` — 10 violations, all mine, no request

Six raw controls, none behind `<Field>`, six copied `rounded-field border border-edge…` class strings
plus the `<form>` wrapper's own (`className="… rounded-field border border-edge p-4"` on the `<form>`
itself, line 84 — a `class-string` hit though the element is not a control; it becomes a plain Tailwind
class with no `rounded-field border border-edge` literal, or a `<Panel>` wrap, whichever reads better once
I have it open — decided in the edit, not here):

| Line | Control | Becomes |
|---|---|---|
| 87 | `<select>` kind | `<Field id="…" label={t("kindLabel")}><Select value={kind} onChange=…>…</Select></Field>` |
| 98 | `<input>` title, `required` | `<Field label={t("titleLabel")}><Input name="title" required maxLength={200} /></Field>` |
| 103 | `<textarea>` description | `<Field label={t("descriptionLabel")}><Textarea name="description" maxLength={2000} /></Field>` |
| 112 | `<select>` materialId, `required` | `<Field label={t("materialLabel")}><Select name="materialId" required>…</Select></Field>` |
| 126 | `<input>` externalUrl, `required`, `dir="ltr"` | `<Field label={t("externalUrlLabel")}><Input name="externalUrl" type="url" required dir="ltr" placeholder="https://" /></Field>` |
| 133 | `<textarea>` formQuestions | `<Field label={t("formQuestionsLabel")}><Textarea name="formQuestions" rows={4} /></Field>` |

★ **A named finding, not a request — I resolve it myself, but the lead should see the reasoning:**
`<Field required>` renders a visible «مطلوب» marker appended to the label text (`field.tsx:129`, `16`
§8.2 item 3's own convention), which today's markup never shows on any of `create-form.tsx`'s three
`required` fields. Passing `required` to `<Field>` would change what the screen displays — a real
appearance change, permitted under rule 3, but not one this ticket asks for and not one I want to ship as
a side effect of a class-string fix. **So `required` stays only on the control itself** (`<Input
required>` / `<Select required>`), which is inert today anyway (the `<form noValidate>` on line 84
already disables the browser's own validation UI for this form; `handleSubmit` does the real check), and
`<Field>` gets no `required` prop. This also protects `tests/components/tasks/create-form.test.tsx:49`'s
`screen.getByLabelText("عنوان المهمة")` — an exact match that a «مطلوب» suffix on the accessible name
would break.

The `<label>` wrapper class (`"flex flex-col gap-1 text-body-sm text-fg-body"`) disappears — `<Field>`
owns that layout — and each `{t("…Label")}` string moves from being the `<label>`'s text node to
`<Field label={…}>`'s prop; no key changes, no visible text changes (`Field`'s own `<label>` renders the
same string in the same place relative to the control). The kind `<select>`'s `value`/`onChange` pass
through unchanged — `ui/select.tsx`'s reset-survival logic is additive over a controlled select, not a
behaviour change for a form this small (there is no `<form action>` here, just `onSubmit`, so the
reset-on-refusal problem `select.tsx`'s comment describes does not even arise — `form.reset()` on line 71
is this component's own call, made once, on success, and `<Select>`'s layout effect will simply re-run
harmlessly).

#### 2. `src/components/tasks/task-item.tsx` — 6 violations, all mine, no request

Two raw controls (`TaskForm`'s per-question `<textarea>`/`<input>`, lines 150–153), four class-strings
(`<li>` line 47, the two form controls, the submit `<button>` line 158). The submit button and the two
`markDone`/`markUndone`/`edit` buttons (lines 92, 138) are `class-string` hits from `rounded-field border
border-edge…` but they are `<button>`, outside both `ui-lint` rules' `CONTROLS` set for the field rule —
only the class-string rule catches them, and the fix is `import { Button } from "@/components/ui/button"`
(lead's file, imported by path, never edited), `variant="secondary"` for the submit, `variant="ghost"`
for the two text-style toggles (`markDone`/`edit`/`markUndone` read today as underlined text, not a
bordered button — `ghost` is the closest existing variant with no border and no fill; confirmed against
`button.tsx`'s own comment). `disabled={pending}` and the `onClick` pass straight through — `Button`
forwards `ComponentProps<"button">` per `ButtonProps`. The `<li>`'s own `rounded-field border border-edge
p-4` (line 47) becomes `import { Card } from "@/components/ui/card"` at `density="row"`, or stays a plain
`<li className="p-4">` if `Card`'s built-in hover-raise/`<article>` semantics turn out to be wrong for a
list row that is not a link — decided against `06`/`16` §6.4's own scoping ("no media slot, no
hover-elevation" is `Panel`'s description, not `Card`'s) — **more likely `Panel`**, since this is exactly
"a static frame around content that just needs setting apart," `Panel`'s own header line. I will use
`Panel` unless the edit shows a reason not to.

The two `TaskForm` controls:

| Line | Control | Becomes |
|---|---|---|
| 151 | `<textarea name={field.id}>` | `<Field label={field.label}><Textarea name={field.id} defaultValue={…} /></Field>` |
| 153 | `<input name={field.id}>` | `<Field label={field.label}><Input name={field.id} defaultValue={…} /></Field>` |

`field.label` is already the visible text (line 149's `<bdi>{field.label}</bdi>` inside the current
`<label>`) — `<Field>` takes a plain `string`, so the `<bdi>` isolation on the label text is lost unless I
keep it around the string passed in (`label={<bdi>{field.label}</bdi>}`, which `tsc` will refuse —
`FieldProps.label` is typed `string`, not `ReactNode`). ★ **A named finding, not a request: I drop the
`<bdi>` around the label text.** A task's `field.label` is authored by the session's own presenter
(`REQ-TSK-001`), so it is member-generated text in a UI that otherwise bidi-isolates every interpolated
value (`10` §1) — losing the wrap is a real, if small, regression against that rule for exactly this one
string. The alternative — not moving this control onto `Field` — is not open (C1's whole point). I record
it here as the smallest departure from "unchanged," and it is presentation-only: `field.label` is a short
one-line prompt in practice (`REQ-TSK-001`'s own acceptance: "one label per line"), so a stray LTR run
inside it is unlikely to occur, unlike a name or a code. If the lead wants `FieldProps.label` widened to
`ReactNode` instead, that is the primitive-change request I'd rather make than carry the regression — I
am naming both options and defaulting to the smaller footprint (drop `<bdi>`) unless told otherwise, since
widening `label`'s type touches every one of `sessions'` eight files' 40+ call sites for one caller's
`<bdi>`.

Neither `Textarea` nor `Input` is a controlled component here (`defaultValue` only, no `value`/`onChange`
on these two) and there is no `<form action>` on this `<form onSubmit>` — the reset-survival machinery in
`ui/textarea.tsx`/`ui/input.tsx` is dormant either way, so nothing behavioural moves.

#### 3. `src/components/materials/proposal-list.tsx` — 1 violation, mine, no request

Line 51's `<li className="rounded-field border border-edge p-4">` → `<Panel>` (same reasoning as
task-item's `<li>` above — a static bordered frame, no link, no hover state). `Panel`'s own padding
(`p-4`) matches what is already there, so no `className` override is needed; `Panel`'s `tone="neutral"`
default matches the current plain `border-edge bg-surface` look exactly (`Panel`'s `TONE_CLASS.neutral`
is `"border-edge bg-surface"`, byte-identical to what the raw `<li>` implies via `globals.css`'s
`--color-surface` default — confirmed by reading `panel.tsx`). `tests/components/materials/proposal-list.
test.tsx` and `tests/e2e/proposal-materials.spec.ts` query by text/role, not by class, so this is a pure
swap.

#### 4. `src/components/photos/gallery.tsx` — 1 violation, mine, no request

Line 146's `<li className="flex min-w-0 flex-col gap-2 rounded-field border border-edge p-2">` → the same
`Panel` swap, `className="flex min-w-0 flex-col gap-2"` passed through since `Panel` takes a `className`
prop appended after its own base classes. `p-2` vs. `Panel`'s built-in `p-4`: **a real, if small,
appearance change** (more padding around each photo tile) unless I override with `className="… p-2"` —
Tailwind's later class in the string wins for `padding` since `Panel` only emits `p-4` once and mine would
come after in the concatenated string (`` `rounded-card border p-4 ${TONE_CLASS[tone]} ${className}` `` —
my `p-2` is last, so it wins). I keep `p-2` explicitly for this reason, named here so the diff's intent is
legible rather than looking like an accidental drop of `Panel`'s padding.

#### 5–6. `src/app/[locale]/app/me/privacy/{forms,page}.tsx` — 1 + 1 violations, fixes-only, no request

Both are class-strings on non-form elements, and both files already import `Panel` and use it elsewhere in
the same file — the fix in each case is reusing what is already imported, not adding a new one:

- `forms.tsx:61` — the post-submit `<p role="status" className="mt-4 rounded-field border
  border-edge-strong p-4 text-body text-fg-heading">{t("deactivateSent")}</p>` becomes `<Panel
  className="mt-4"><p role="status" className="text-body text-fg-heading">{t("deactivateSent")}</p>
  </Panel>` — `role="status"` moves to the inner `<p>` so the live-region semantics are unchanged (`Panel`
  itself carries no role); `Alert()` a few lines above in the same file is the exact precedent for
  wrapping a `role`-bearing message in `<Panel>`.
- `page.tsx:82` — the export-download `<a href="/api/me/export" className="inline-flex h-12 items-center
  rounded-field border border-edge-strong px-7 text-label text-fg-heading hover:bg-silver-100" download>`.
  This is a link styled as a secondary button, not a `<button>` — `ui/button.tsx`'s own `Button` renders a
  `<button>` (or `i18n/navigation`'s `Link` for in-app routes), neither of which is right for a same-origin
  download that must stay a plain `<a download>` for the no-JS path this screen's comment already calls
  out ("a plain link, not a fetch"). ★ **A named finding for the lead, not mine to resolve alone:** none
  of my nine primitives is a styled anchor, and `ui/button.tsx`'s `buttonClass()`/`buttonVariants` helpers
  are exported (`export function buttonClass(...)`) — so the smallest fix is `<a href=… download
  className={buttonClass("secondary", "lg")}>`, importing the *function*, not the component, from the
  lead's file. I don't own `button.tsx` and this is a read of its exported helper rather than an edit, so
  I believe this needs no primitive change and no request — flagging it only because it is the one place
  in my seven files where the fix reaches into a lead-owned file's exports rather than composing one of my
  own or `sessions'` eight. If the lead would rather this go through a real `<Link>`-shaped download
  affordance instead, that is the alternative to rule on at sync.

#### 7. `src/components/event/comment-composer.tsx` — 2 violations, fixes-only, ★ one request

- Line 220 (the `@mention` dropdown `<ul className="absolute z-10 mt-1 w-full max-w-xs rounded-field
  border border-edge-strong bg-[var(--color-canvas)] shadow-card">`) → `Panel` again, with the
  positioning classes (`absolute z-10 mt-1 w-full max-w-xs`) passed through `className` and `Panel`'s own
  padding overridden to `p-0` (the list's own `<li><button>` rows carry their own `px-4 py-2`, so an
  outer `p-4` would double the inset) — no request, same shape as the other five class-string swaps above.
- Line 207 (the composer `<textarea>`, labelled today only by `aria-label={label}` + a `placeholder`, no
  visible label at all) is the harder one. ★ **This is the request, named now rather than found mid-edit:**
  `<Field>`'s `label` is a required visible string (`field.tsx:110`'s `<label>` always renders it) — there
  is no way to give a control a screen-reader-only accessible name through `<Field>` the way `aria-label`
  does today, and the discussion composer's whole design is a placeholder-driven, unlabelled box (`16`'s
  discussion screen has no field label anywhere on this row — it is a chat-style composer, not a form).
  Wrapping it in `<Field label="…">` would put a visible label line above every comment box on every
  session's discussion, on a screen the plan never asked to change and that `event`'s wave-10 track and
  the lead's wave-6 review both signed off on as it stands. **Two ways to close it, in the order I'd
  choose them:**
  1. Keep the raw `<textarea aria-label={label}>` and add `// ui-lint-disable-next-line field —
     self-labelled via aria-label; <Field> has no visually-hidden-label mode and this screen's design has
     no visible label (16, discussion)` — the same shape `ui/checkbox.tsx` and `ui/radio-group.tsx` already
     use for their own self-labelling controls, just outside `ui/` this time. This needs the lead's written
     approval per `DEC-166` §2 ("`ui-lint-disable-next-line` needs a reason the lead approves in writing").
  2. Or: the lead adds a `labelHidden?: boolean` (or a `visuallyHiddenLabel`) prop to `Field` that renders
     the same `<label>` with an `sr-only` class instead of the visible one — a small, real primitive change
     that also closes any *other* self-labelled raw control this sweep or a later one turns up, at the cost
     of a change to a file I do not own.
  
  I recommend (1): it is the smaller change, it matches an existing pattern in the system, and it does not
  touch a lead-owned file for one call site. I am not choosing it myself because the escape hatch needs the
  lead's written approval regardless of which of the two I'd pick — this is the one line in my plan I am
  waiting on.

### The specs that prove C1 unchanged

- `tests/components/tasks/create-form.test.tsx`, `tests/components/tasks/task-item.test.tsx`,
  `tests/components/tasks/panel.test.tsx`, `tests/components/tasks/panel-grouping.test.tsx` —
  `getByLabelText`/`getByRole` calls named above; run after each of files 1–2.
- `tests/components/viewer/page-viewer.test.tsx` — no `<Field>` involved (C3's file has no raw
  input/select/textarea; its five hits are all `class-string` on `<button>`/`<div>`), but its
  `getByRole("button", { name: … })` assertions are the proof the `Button` swap (see C3 below) keeps
  every accessible name.
- `tests/components/materials/proposal-list.test.tsx`, `tests/e2e/proposal-materials.spec.ts`,
  `tests/e2e/wave10-content-proposal-material.spec.ts` — file 3.
- `tests/components/photos/*` (none exist by that exact name today per a repo search — `gallery.tsx` is
  exercised through `tests/e2e/photos.spec.ts` and `tests/e2e/wave10-content-photos-takedown.spec.ts`) —
  file 4; both e2e specs run once after the `Panel` swap.
- `tests/components/me/privacy*` if present, else `tests/e2e/wave10-content-me-early-save.spec.ts` and any
  `privacy` component test under the "fixes only" umbrella — files 5–6.
- `tests/components/event/comment-composer.test.tsx` (if it exists — checked at edit time),
  `tests/e2e/wave6-discussion-review.spec.ts` — file 7, and specifically a case that queries the composer
  by its accessible name (`aria-label`) to prove the escape-hatch route keeps it, if that is the route
  taken.

New: one `tests/e2e/wave11-content-ui-lint.spec.ts` is not needed — `ui-lint` itself is the proof for C1
(`node scripts/ui-lint.mjs --strict` naming none of these seven files is the acceptance criterion, not a
Playwright spec); I add no new e2e file for C1 alone. A new `wave11-content-*` capture is still owed per
the DoD (390 px RTL, beside each screen's most recent wave capture) for `tasks/create-form`,
`tasks/task-item` (the panel/create-form screen), the viewer, and the discussion composer.

### C3 — the viewer against `13` §7, measured as it stands today

`page-viewer.tsx` today: only the **current** page is ever mounted as an `<Image>` (line 138) — there is
no all-pages-at-once render — with `priority` on page 1 only (line 145) and a `±2`-page prefetch window
rendered as bare `<link rel="prefetch">` tags (lines 96–100, 112–114), not `<Image>` elements. Thumbnails
(lines 163–179) are a separate, always-mounted `<Image unoptimized>` per page, `priority` never set, so
they get the browser's native default `loading="lazy"`. **So "loads progressively" mostly already holds**:
one full page at a time, a real prefetch window, lazy thumbnails.

**What does not hold, found reading `render_pages.ts` beside this file:** the worker (`worker/src/tasks/
render_pages.ts:69`) already computes and stores each page's real `width`/`height` per page row, but
`ViewerPageDTO` (`page-viewer.tsx:8-12`) never carries them, and `<Image width={1600} height={900} …
className="h-auto w-full">` (line 141) hard-codes a 16:9 box for every page regardless of the source
document's actual aspect ratio. `h-auto w-full` means the *displayed* box is never actually 16:9 — CSS
overrides it once the real image loads — but `next/image` computes its `aspect-ratio` placeholder from the
`width`/`height` props before the image arrives, and a portrait-oriented material page (a poster, a tall
slide) reserves a wide box and then visibly jumps taller the moment the real image paints. That is a CLS
regression this budget's "page 1" moment would show on exactly the documents most likely to not be 16:9.
**Fix:** thread `width`/`height` through the DAL → `ViewerPageDTO` → the `<Image>` call (the DTO already
has the shape to add two numbers; the DAL's `getViewerData()` reads the same row `render_pages.ts` writes).
The `unoptimized` flag stays — signed Storage URLs, not a local/optimizable path, same reasoning the file's
own comment on the `<img>` in `gallery.tsx` gives — so this is a layout-stability fix, not a bytes-shipped
one; I did not find a second image (a smaller "page" variant vs. the full render) being generated for the
main view, only the thumbnail/page split already in the DTO, so there is no unshipped smaller asset to
reach for on the budget side.

**The `≤ 2.5 s to page 1` measurement itself is the lead's spec** (`STATUS.md` row L7 runs the budgets
spec centrally) — my part is confirming the component does not work against it, which the above shows it
mostly does not, plus fixing the one real defect found. I have not run a Lighthouse/perf trace myself (no
production build in hand during planning); C3's remaining item is running one once C1's viewer edit lands,
before claiming the row done.

### Requests to the lead — the complete list

1. **Comment-composer's unlabelled `<textarea>`** (file 7, above): approve a `ui-lint-disable-next-line
   field` with the stated reason, or add a visually-hidden-label mode to `Field`. My recommendation is the
   disable comment.

No other file in my seven needs a primitive change — every other raw control maps onto `Field` + `Input`/
`Select`/`Textarea` exactly as they exist today, and every other class-string maps onto `Panel` (four
sites) or the lead's exported `buttonClass()`/`Button` (two sites), reused by import, never edited.

### C2 — accessibility findings

Not yet routed to me (the lead's sweep, `STATUS.md` row L6, has not run against a branch build). I proceed
on C1 in the meantime; the one item I can already name without a routed row is the viewer's RTL
next/previous direction (`10` §2.4, named in my own agent brief) — confirmed correct as written:
`page-viewer.tsx:56-63` swaps `advance`/`retreat` on the physical arrow keys by `rtl`, matching SCR-013's
reading-direction model rather than a mirrored icon, and the on-screen `previous`/`next` buttons
(lines 151, 157) already swap their `onClick`/`disabled` the same way. Keyboard-operable: yes (native
`window.addEventListener("keydown")`, not scoped to a focused element, so it fires regardless of where
focus sits inside the viewer — worth flagging that this means the shortcuts work even when focus is
elsewhere on the page, which is arguably too broad, but that is existing behaviour, not something C1
touches). Announced: yes, via the `aria-live="polite"` region (line 110) updated on every `index` change
(lines 88-92). I record this as already-correct rather than a finding, since the brief asked me to confirm
it, not to change it absent a routed row saying otherwise.

### C1 — done, ready for sync (2026-09-22)

All 27 of content's `ui-lint` violations are at zero (`node scripts/ui-lint.mjs --strict` names none of
my seven files; the whole tree is down to 5, all `console`'s `rtl-datetime-picker.tsx`). Commits
`b48df60` (create-form), `8832c36` (task-item), `83cf1ef` (proposal-list), `7cfff3d` (gallery), `e2be3e3`
(the two privacy files), `0f1b428` (comment-composer, with the lead's approved escape), `6ea202e`
(page-viewer — the five buttons/frame, plus C3's width/height threading).

**Untouched-suite ledger line, for `STATUS.md` (the lead copies this in per sync-1's instruction):**

| File | Case | Why | Commit |
|---|---|---|---|
| `tests/components/tasks/create-form.test.tsx` | both `it()`s | `title` gained `<Field required>`'s «مطلوب» marker (REQ-UIX-011, DEC-166 sync 1 ruling 1) — the two `getByLabelText("عنوان المهمة")` calls move to `{ exact: false }` to match either way; the field, its label text and its behaviour are unchanged | `b48df60` |
| `tests/components/viewer/page-viewer.test.tsx` | fixture only | `ViewerPageDTO` gained required `width`/`height` (C3, `render_pages.ts`'s stored dimensions threaded through to fix a CLS regression) — the three fixture rows gain `width: 1600, height: 900`; no assertion changed | `6ea202e` |

**Verification run:** `npx tsc --noEmit` clean across the whole tree; `npm run lint` 0 errors, 28
warnings (pre-existing, none in my files); `npm test` 2270 passed/1 skipped (one pre-existing unhandled
timer error in `comment-item.test.tsx`, a file I did not touch, unrelated to this work); component suites
for tasks/materials/viewer/photos/privacy/comment-composer/comments — 16 files, 106 tests, all green.
`npm run test:rls` not re-run (no SQL touched this unit). `tests/e2e/tasks.spec.ts` passed 2/2 through
`npm run test:e2e:local` — ★ **against whatever `.next` was already on disk**, not a build I triggered
myself (only the lead runs `npm run build`), so this is a real signal the two specs still pass but is not
proof the *new* JSX is what a fresh build served. Flagging rather than claiming more than I can back.

**Not yet done:** the 390 px RTL captures (`wave11-content-*`) — these need a fresh production build,
which is the lead's; naming the four surfaces here so the lead can capture them at the next build:
`tasks/create-form` + `tasks/task-item` (the task panel), the viewer (`materials/[materialId]`), and the
discussion composer. C2 (accessibility findings) still waiting on the lead's routed rows.

### Prose-dependent screens — the owner's list (rule acknowledged, 2026-09-22)

Per the lead's relay of the owner's rule: a screen whose meaning depends on a paragraph is noted here,
not rewritten, this wave. C2's routed findings haven't arrived yet; one row I can already name from my
own C1 pass over `/app/me/privacy` (`src/app/[locale]/app/me/privacy/page.tsx`), read closely enough
while fixing its two `ui-lint` violations to recognise the shape:

| Route | The paragraph (key) | What depends on it | Affordance it could become | Found by |
|---|---|---|---|---|
| `/app/me/privacy` | `privacy.page.deactivateHonest` | The whole reason there is no self-service "delete my account" — a member reading only the button labels («تصدير», «إلغاء التفعيل») would not know deletion is deliberately unavailable, or why (anonymisation instead, to protect content other members depend on) | A short inline note beside the deactivation button, or a `Tooltip`/disclosure triggered from a "لماذا لا يمكنني حذف حسابي؟" link, carrying the same explanation without it having to be read start-to-front before the member understands what pressing the button will and will not do | `content`, wave 11 C1 |

More rows land here as C2's routed findings arrive.

---

## Wave 14 plan

`DEC-180`, `DEC-181`, `DEC-093`, `DEC-099`, `DEC-177`, `DEC-178`, `CLAUDE.md` § *Ownership map (wave 14)*,
`.claude/agents/content.md`, `STATUS.md`'s wave-14 block and `platform`'s draft W14.4 (contract 4) read. Measured on
`4ee7318`. **Planning only — no code, no test, no SQL until sync 1.** Rows: P1 (lightbox), P2 (the crop), P3 (one
photograph), P4 (the album), P5 (the comment's avatar).

### W14.0 Where the brief and the tree disagree — each checked against the file

1. ★ **`0155` is taken.** `STATUS.md`'s header and the agent file say «migrations from `0155`»; `0155` is
   `0155_comments_broadcast_no_hotlink.sql` (`92953c8`, L0). This wave's SQL starts at **`0156`**.
2. ★ **«Writes one zip» cannot hold under the Storage upload limit.** `supabase/config.toml:121` sets
   `file_size_limit = "50MiB"` locally, and 50 MB is also Supabase's default global limit. A phone photograph is
   2–6 MB, and the org limit is 20 MB by default (`photos.ts:142`). So an album of 20 photographs can already pass
   50 MB, and `11` §2.4's 300 is about 1 GB. The worker's `uploadObject()` (`worker/src/content/storage.ts:39`) is
   one `POST` of the whole body. **Proposal: the album is written in self-contained parts, each at most a cap**
   (45 MiB by default, env `PHOTO_ALBUM_PART_BYTES`). A session under the cap gets one zip, as the brief says. Each
   part is a complete zip that opens on a phone on its own. A split archive (`zip -s`) is rejected, because
   `.z01`/`.z02` need every piece to extract. → **Q1** (production's limit).
3. ★ **«It zips the EXIF-stripped objects, which are the only ones that exist» (`11` §2.4, and `REQ-ADM-021`'s
   second acceptance) is false for a window.** The browser's raw `PUT` lands at the same path **before**
   `process_photo` strips it, and there is no row yet (`0050`'s header, `photos.ts:18-29`). So the job **never lists
   the bucket**. It reads the visible set from `photos` rows (`check (exif_stripped)`, `0037:169`). It also checks
   each downloaded object's SHA-256 against the row's `sha256`, which `process_photo.ts:85` computed over the
   stripped bytes. A mismatch fails the job. Both texts also cite `REQ-EVT-012` for the strip; the strip is
   `REQ-EVT-011`.
4. **`11` §2.4 says `JOB-process_photo` «re-encodes WebP, variants». It does neither** (`process_photo.ts:83-84`
   writes back the same kind; `DEC-047` deferred re-encoding). **No thumbnail exists.** The grid draws full
   originals as 160 px tiles (`gallery.tsx:157`), and so will the lightbox. This is not this wave's job, and it is
   named for the lead → **Q10**.
5. ★ **`REQ-EVT-015` is not the photos' live path.** It covers comments, reactions and counts. A photo's liveness is
   `REQ-EVT-010`'s last acceptance: `0091_photos_broadcast.sql` broadcasts an `INSERT`, and **only the uploader's own
   widget** listens (`upload-widget.tsx:101`), then calls `router.refresh()`. A hide is broadcast to no one. So the
   lightbox's «live update» means **new server props after a `router.refresh()`**: your own upload landing, or a
   takedown or restore action revalidating. The lightbox reconciles those by photo id (P1 below).
6. ★ **Contract 1's refusal parameter collides with the poster's.** `?download=failed` is exactly what
   `sessions`' `DownloadFailedNotice` fires on (`components/sessions/download-failed-notice.tsx:11`), beside the
   poster control. A refused photo download would then be announced under the poster. **Proposal:**
   `?download=photo_failed` and `?download=album_failed`. The poster notice compares `=== "failed"` and stays
   silent, and my own notice sits beside the control that was pressed → **Q4**.
7. **Contract 1 names two audit definers, and contract 3 fixes three actions.** The album's download returns a path.
   The request returns a build. I name **three** functions below, one per action, with the same authority rule for
   the two album ones → **Q5**.
8. ★ **A removed photograph's object is still readable by staff.** `photos_storage_read` (`0037:646`) checks
   `hidden_at is null or is_staff()` and **no `removed_at`**. `remove_photo()` (`0059:62`) also sets `hidden_at`, so a
   member is refused, but staff can still sign a removed photo's object. My definers refuse `removed_at is not null`
   for everyone. **Recommended to the lead:** add `and p.removed_at is null` to the policy in `0156`. It is a
   one-conjunct tightening, and nothing in the product reads a removed photo.
9. **The staff grid shows hidden photos, and `REQ-EVT-016` says the lightbox never does.** So a hidden tile
   (`gallery.tsx:159`, the «مخفية» badge) **is not a lightbox trigger**. It stays exactly as it renders today →
   **Q2**.
10. ★ **`/app/me` still ships Google's URL to a browser** — already found by `platform` (their W14.0 §1), confirmed
    here: `me/page.tsx:44` hands `getMe()`'s whole `SelfProfile` (`members.ts:44`, `avatarUrl: m.avatar_url`) to the
    `"use client"` `ProfileForm`. The fix is the lead's line in `members.ts` (L2). If the lead would rather not wait
    for L2, my fixes-only file can narrow the prop in one line (`me={{ ...me, avatarUrl: null }}`). It is one or
    the other, not both.
11. **There is no zip writer in the image.** `docker run kareem-worker:latest` → `zip`, `bsdtar`, `python3` and `7z`
    are all absent. `node` is `v22.23.2`, and `zlib.crc32` exists.

### P1 — the lightbox (`REQ-EVT-016`, `DEC-093`'s sixth place)

**Structure.** `gallery.tsx` stays a Server Component. A new `src/components/photos/lightbox.tsx`
(`"use client"`) exports two pieces:
- `PhotoLightbox({ photos, labels, children })` — a context provider wrapping the slot's whole output, both the
  flat branch and the grouped one. `photos` is the **visible** sequence only (`hiddenAt === null`), in display
  order, across all day groups: one album with one «3 من 12», never numbering that restarts per group → **Q11**.
  Each entry is `{ id, url, width, height }`. Server children pass through as `children`, never a closure
  (`DEC-159`).
- `LightboxTile({ photoId, children })` — a `<button type="button" aria-haspopup="dialog" aria-label="افتح الصورة 3
  من 12">` around the existing `<img>`. The tile keeps its one `<li>`, its `<img src>` and its `alt=""` — the
  button carries the name. A hidden tile renders its `<img>` bare, as today.

**The dialog**, on the lead's `ui/dialog` (`Dialog` + `DialogContent`), **controlled** (`open`/`onOpenChange`), with
no `DialogTrigger`:
- Top bar: the title «صور الجلسة», the position «<bdi>3</bdi> من <bdi>12</bdi>» (`formatNumber`, Western numerals,
  `DEC-124`), **«تنزيل الصورة»** — a plain `<a href="/api/photos/{id}/download">`, never `<Link>` (nothing
  prefetches it) and never `download` — and the dialog's close button.
- The stage: `<img src alt="الصورة 3 من 12" width height class="max-h-full max-w-full object-contain">` — **never
  cropped**; the DTO's `width`/`height` reserve the box.
- Bottom bar: **«السابقة» and «التالية», always rendered and always visible**, `ui/icon-button` at `md` (44 px,
  `SC 2.5.8`), with `ChevronIcon direction` and logical order, so that in RTL «التالية» sits at the inline end.
  They sit **below** the photograph, never over it, so no part of the frame is covered.
- **Ends: no wrap.** At the first photo «السابقة» is `aria-disabled="true"` and a no-op, and the same holds for
  «التالية» at the last — **not `disabled`**. A `disabled` button drops focus to `<body>`, and Radix's `FocusScope`
  does not pull it back (`relatedTarget === null`). A keyboard user who presses «التالية» onto the last photo would
  otherwise lose their place.
- **An `aria-live="polite"` region** (`sr-only`) says «الصورة 3 من 12» on every move.
- Keys: `ArrowLeft`/`ArrowRight` follow the **visual** axis (`page-viewer.tsx:56-63`'s rule). Escape is Radix's.
- **The swipe, the enhancement only:** `pointerdown`/`pointerup` on the stage, a horizontal delta over 48 px that
  also beats the vertical one, `touch-action: pan-y`. In RTL a rightward swipe is «التالية». There is no animation
  (`DEC-100` is not this wave), and nothing depends on it — the gate never swipes.
- **«The backdrop closes it».** A full-viewport lightbox has no Radix «outside», so the **letterbox around the
  photograph** is the backdrop. A click whose target is the stage itself, not the image or a control, closes it.
- **Focus returns to the tile that opened it.** Radix's modal content calls `preventDefault()` and focuses
  `triggerRef` in `onCloseAutoFocus` (`@radix-ui/react-dialog` 1.1.23, `dist/index.mjs:154-157`). With no trigger,
  that ref is null and focus falls to `<body>`. So the lightbox passes its own `onCloseAutoFocus`, which calls
  `preventDefault()` and focuses the ref of the tile it opened from. `DialogContent` already spreads `...props`, so
  **this needs no change to `ui/dialog`.**
- **Live reconciliation, by id, never by index.** New `photos` props while the dialog is open: if the current id is
  still there, stay on it and recompute «n من m». If it is gone (hidden for this viewer after a takedown), move to
  the photo now at the same position, clamped, and announce it. If none are left, close and focus the slot's first
  focusable element. While the dialog is open, the `src` for an id already shown is **pinned** to the URL it first
  used, so a `router.refresh()` that re-signs every URL (`photos.ts:174`) does not blank the photograph on screen.
- No `setTimeout`, no interval, no nudge (`DEC-146`).

**What `ui/dialog` lacks — request R1 to the lead.** `DialogContent`'s class string is a centred card: `inset-x-4
top-1/2 -translate-y-1/2 max-w-lg p-6 overflow-y-auto rounded-field`, with the body in `mt-5`. Overriding it through
`className` means fighting Tailwind's emit order on seven properties (the `DEC-111` trap `gallery.tsx:147` already
had to `!` once). **Request:** `size?: "default" | "media"` on `DialogContent`. `media` means `fixed inset-0`, no
max width or height, no translate, no card padding and no `overflow-y-auto`, a dark surface token for the
photograph, and a `flex flex-col` body (`flex-1 min-h-0`). The title row stays: `Title` plus `Close` with its
`closeLabel`, with colours for the dark surface. ★ **The safe-area insets:** a new fixed full-screen element needs
`env(safe-area-inset-*)` padding under `viewport-fit=cover`, which is the mobile pass's standing rule. The default
size is untouched, so every existing dialog renders byte-identically.

### P2 — the grid's crop (`REQ-UIX-026`)

**Deliberate and written down, not focal-aware.** It stays `aspect-square object-cover`, with `object-center`
explicit. The comment goes where the class is (`gallery.tsx:157`):
- the grid is an index for finding a photograph, not a place to read one;
- uniform squares keep a two-column grid at 390 px scannable, where letterboxed mixed portrait and landscape tiles
  make it ragged;
- a photograph is not a designed artefact (`REQ-UIX-026`'s own carve-out);
- **no focal point exists** for a member's photograph. Nobody sets one, and detecting faces to pick one would be a
  new processing of personal data. So the centre is the honest default;
- the whole frame is one tap away, and **the lightbox never crops** (`object-contain`).

Focal-aware is rejected: it needs data that does not exist, for a crop the lightbox already undoes.

### P3 — one photograph (`REQ-ADM-021`, contract 1)

`src/app/api/photos/[photoId]/download/route.ts` — `GET`, `runtime = "nodejs"`, `designer`'s route
(`api/designer/downloads/[artifactId]/route.ts`) as the shape:
1. Zod: `photoId` is a uuid, or `303` back.
2. `recordPhotoDownload(locale, photoId)` (my DAL) → `rpc("record_photo_download")` **as the caller**.
3. It signs **as the caller** with `storage.from("photos").createSignedUrl(path, 60, { download: file_name })`. So
   `photos_storage_read` is a second, independent gate. The TTL is 60 s — «short-lived» — and the URL is minted in
   the request, never in page data.
4. `303` to it, `Cache-Control: no-store`. A refusal or a failure is a `303` to the same-origin Referer, with
   `?download=photo_failed` and `#photos` (W14.0 §6). An off-origin or missing Referer falls back to `/{locale}/app`,
   so this is not an open redirect.

The lightbox's link is the only place the route is offered. **A thumbnail is not a download** (`DEC-178`): the grid's
and the lightbox's `<img src>` stay the one-hour display URLs `getPhotosPageData` signs today.

### ★ The three audit definers the lead lands in `0156` (contracts 1 and 3)

All three follow `0152`'s shape: `language plpgsql security definer set search_path = ''`, `revoke all … from
public, anon`, `grant execute … to authenticated`. They are covered by `definer-exposure.test.ts` as generated.
**`42501 not_authorized` is the one answer for every refusal**, raised **before any write** (`DEC-043`), and it
carries the same text whether the id is unknown, in another org, or not allowed, so none is an existence oracle.
The route turns `42501` into `?download=…_failed`.

**1 · `public.record_photo_download(p_photo uuid) returns table (storage_path text, file_name text)`**
- *Admits:* a photo with `org_id = auth_org_id()`, `hidden_at is null` and `removed_at is null` — what
  `photos_read` shows a plain member. **Any role may call it; staff get no wider branch.** A hidden photo is one
  someone asked to be removed from (`REQ-EVT-012`), and taking a copy of it is exactly the harm the hide prevents
  → **Q3**.
- *Writes:* `write_audit(org, 'photo.downloaded', 'photo', p_photo, null, jsonb_build_object('session_id', …,
  'session_day_id', …), null, null, auth_member_id())` — the actor, the session and what was taken.
- *Returns:* the path and `file_name` = `photo-<YYYYMMDD>-<first 8 hex of the id>.<ext>`, where the date is the
  session's start in its own zone. The name is ASCII with Western digits (`DEC-095`, `0152`'s precedent), and «named
  for the session» → **Q6**.

**2 · `public.request_photo_album(p_session uuid) returns table (album_id uuid, build_id uuid)`**
- *Admits:* `is_staff()`, with the session in `auth_org_id()`. Everyone else — a presenter, a member, another org,
  an unknown session — gets `42501`. **Zero visible photographs:** `raise 'album_empty' using errcode = 'P0002'`,
  also before any write.
- *Writes, in order:* upserts `photo_albums` on `session_id` (`status = 'queued'`, a **new** `build_id =
  gen_random_uuid()`, `requested_by`, `requested_at = now()`, built fields and `error` cleared) ·
  `write_audit(org, 'photo_album.requested', 'photo_album', album_id, null, jsonb_build_object('session_id', …,
  'build_id', …, 'visible_count', …), null, null, auth_member_id())` ·
  `enqueue_job('zip_session_photos', jsonb_build_object('album_id', …, 'build_id', …, 'session_id', …, 'org_id',
  …), 'zipphotos:' || p_session, null, 'convert', 3)` — `11` §2.4's key, queue and three attempts.
- A repeat request replaces the queued job under the same key (`0025`, `job_key_mode => 'replace'`). A job already
  running on the old `build_id` finishes and is refused at its last step (below), so two builds never both land.
- *Returns* at once, before any byte is read.

**3 · `public.record_photo_album_download(p_session uuid, p_part int default 1) returns table (storage_path text,
file_name text)`**
- *Admits:* `is_staff()`, the session in `auth_org_id()`, the album `status = 'ready'`, `expires_at > now()`, and
  `1 ≤ p_part ≤ jsonb_array_length(parts)`. Everything else is `42501`, including stale, failed, building, expired
  and none.
- *Writes:* `write_audit(org, 'photo_album.downloaded', 'photo_album', album_id, null, jsonb_build_object(
  'session_id', …, 'build_id', …, 'part', p_part, 'parts', …, 'photo_count', …), null, null, auth_member_id())`.
- *Returns:* that part's path, and `photos-<YYYYMMDD>.zip`, or `photos-<YYYYMMDD>-part-<n>-of-<m>.zip`.

### P4 — the album (`REQ-ADM-021`, contract 2) — its state, **named, never written**

**A table, because «ready» must read the same after a reload** and a notification is not a state.
`public.photo_albums` — one row per session:

| Column | Type | Note |
|---|---|---|
| `id` | `uuid` pk `default gen_random_uuid()` | |
| `org_id` | `uuid not null` → `orgs` `on delete cascade` | invariant 5 |
| `session_id` | `uuid not null unique` → `sessions` `on delete cascade` | one album per session |
| `build_id` | `uuid not null` | replaced on every request; **segment 5 of the object path** |
| `status` | `public.photo_album_status not null default 'queued'` | a new enum: `queued` · `building` · `ready` · `failed` · `stale` |
| `requested_by` | `uuid not null` → `members` | the notification's recipient |
| `requested_at` | `timestamptz not null default now()` | |
| `built_at` · `expires_at` | `timestamptz` | `expires_at = built_at + 7 days` → **Q7** |
| `photo_count` | `int check (photo_count >= 0)` | |
| `byte_size` | `bigint check (byte_size > 0)` | the sum of the parts |
| `parts` | `jsonb not null default '[]'` `check (jsonb_typeof(parts) = 'array')` | `[{ "path", "byteSize", "photoCount" }]` |
| `error` | `text` | |
| check | `status <> 'ready' or (built_at is not null and expires_at is not null and jsonb_array_length(parts) > 0)` | `0069:259`'s pattern |

- **RLS:** enabled; `revoke all … from anon, authenticated, service_role` (the house pattern); **one** policy,
  `photo_albums_read_staff` `for select to authenticated using (org_id = auth_org_id() and is_staff())`, with
  `grant select … to authenticated`. There is no insert, update or delete for any client role: the definers are the
  only writers, which is `photos`' shape. The generated isolation sweep covers it the day it exists.
- **Bucket:** `photo-albums`, private, `allowed_mime_types = '{application/zip}'`.
- **Path, through the one builder** — `packages/storage-paths/src/content.ts`, which is mine:
  `photoAlbumPartPath(orgId, sessionId, buildId, part)` →
  `{org_id}/sessions/{session_id}/albums/{build_id}/part-{n}.zip`, and `photoAlbumPrefix(orgId, sessionId)` for the
  job's cleanup listing. Both are re-exported by `index.ts`'s existing `export * from "./content.js"`, so **no
  edit to `index.ts`** (the lead's this wave). No day ever appears in the path.
- **Read policy, `photo_albums_storage_read`** (`for select to authenticated`): `bucket_id = 'photo-albums' and
  (storage.foldername(name))[1] = auth_org_id()::text and is_staff() and exists (select 1 from photo_albums a where
  a.session_id = nullif((storage.foldername(name))[3], '')::uuid and a.org_id = auth_org_id() and a.build_id =
  nullif((storage.foldername(name))[5], '')::uuid and a.status = 'ready' and a.expires_at > now())`. **A stale,
  superseded or expired build is unreadable to every client role** even with its path in hand. There is no insert
  policy, because only the worker writes (`exports`' shape).
- ★ **The nightly prefix assertion** must learn the bucket. `BUCKETS` is `platform`'s
  (`worker/src/platform/storage.ts:92`) → request **R5**: `{ name: "photo-albums", orgPrefixed: true }`.

**Behaviour, mine, proposed under `supabase/proposed/content/`** once the lead's table exists. All three functions
are `service_role` only (`revoke … from public, anon, authenticated`), and the trigger is `security definer`:
- `begin_photo_album_build(p_build uuid) returns table (photo_id uuid, storage_path text, byte_size bigint, sha256
  text)` — **no rows** if `p_build` is no longer the row's `build_id`, and the job then returns quietly. Otherwise
  it sets `building` and returns **the visible set at build time**: `hidden_at is null and removed_at is null`,
  ordered `(created_at, id)`. It is an order for naming entries, never a «last row» read.
- `record_photo_album_built(p_build uuid, p_parts jsonb, p_photo_ids uuid[]) returns text` — `'ready'` ·
  `'superseded'` · `'stale'`. It locks the album row **first** (`for update`), then re-checks that every one of
  `p_photo_ids` is **still** visible. A hide that committed during the build makes it return `'stale'`, and the job
  throws so the retry rebuilds without that photograph. On `ready` it calls `notify(org, requested_by,
  'admin_queue', {session_id, photo_count, parts}, 'MSG-photo_album_ready')` and enqueues the expiry
  (`'zipphotos-expire:' || session`, `run_at = expires_at`).
- `fail_photo_album(p_build uuid, p_error text)` — called on the **last** attempt only
  (`helpers.job.attempts >= helpers.job.max_attempts`), `build_data_export.ts`'s shape.
- ★ **`photo_albums_stale()`**, `AFTER UPDATE OF hidden_at, removed_at` and `AFTER DELETE` on `photos`: when a
  photo leaves the visible set, its session's `ready` album becomes `stale`. **A «remove photos of me» must reach a
  zip that already holds the photo.** Its row lock and the one in `record_photo_album_built()` serialise, so every
  interleaving ends `stale`. It is `security definer` because a member's takedown reaches it through
  `photo_takedowns_hide()`, and it **never raises**: it sits on the takedown path, which is `REQ-EVT-012`'s
  «instant». It is tested **as a member** (the house rule for a trigger that writes). A new upload or a restore
  leaves a ready album ready; the page offers «جهّزه من جديد» when the counts differ.

**`worker/src/tasks/zip_session_photos.ts`** (new; its registration in `worker/src/index.ts` is the lead's):
1. Validate the payload, then `begin_photo_album_build(build_id)`. No rows → return (superseded).
2. Split the rows into parts by cumulative `byte_size` ≤ the cap. A single photo over the cap is a part of its own.
3. For each part, in `withTempDir()` (`pdf.ts:50`): `downloadObject("photos", path)` → **SHA-256 must equal the
   row's** → write `NNN-<8 hex>.<ext>` → `zip -q -X -0 -j part.zip <files…>` → `uploadObject("photo-albums",
   photoAlbumPartPath(…), bytes, "application/zip")`. Only one part is on disk at a time, so disk and memory are
   bounded at about twice the cap.
4. `record_photo_album_built(…)`: `'stale'` → throw (retry); `'superseded'` → return; `'ready'` → delete every
   object under `photoAlbumPrefix()` not in this build (`listObjects` + `deleteObject`, added to my
   `worker/src/content/storage.ts`).
5. The `{ mode: "expire" }` payload deletes that build's objects if it is still the current one, and marks nothing
   ready.

`queue: 'convert'` — **no job uses that queue today** (`convert_document` and `process_photo` enqueue with none,
`0046:99`, `0050:97`). A named queue runs one job at a time, so zips serialise **against each other only**, which
is what bounds disk. They never delay a photo's strip.

**The zip binary — request R4.** Debian bookworm's **`zip` 3.0-13+deb12u1**: Info-ZIP's licence (BSD-style),
**798 KB installed**, and it depends only on `libbz2-1.0` and `libc6`. Measured in `node:22-slim` with `apt-cache
show`. It is one word on `worker/Dockerfile`'s `apt-get install` line. It is called with `execFile`, never a shell,
on a 60 s-per-part timeout, and `ENOENT` says «worker/Dockerfile installs zip» (`pdf.ts:36`'s shape). The flags:
`-0` stores without compressing (JPEG, PNG and WebP are already compressed, and CPU is the scarce thing), `-X` drops
uid/gid and extended attributes, `-j` drops the temp directory, and `-q` keeps it quiet. **No npm package** (`DEC-181`
§4). *Recorded, not proposed:* Node 22.23 has `zlib.crc32`, so a stored zip could be written in about 80 lines with
no dependency at all. The owner ruled a binary, and a binary is less code of ours to be wrong.

**«Ready» on the page, the same after a reload** — `src/components/photos/album-control.tsx`, a Server Component in
the slot's **first row** (beside the count line in the flat branch; above the groups in the grouped one), **staff
only**. There is no `<h2>` of its own, because the section heading is the page's:

| State | What it says | Control |
|---|---|---|
| none / expired, visible > 0 | — | **«تنزيل الكل»** — `<form method="post" action="/api/photos/albums/{id}">` |
| `queued` · `building` | «نُجهّز ملف الصور. سيصلك إشعار حين يجهز، ويبقى رابطه هنا.» (`role="status"`) | none; no spinner, no timer |
| `ready` | «ملف الصور جاهز — <bdi>12</bdi> صورة · <bdi>48</bdi> م.ب · متاح حتى <bdi>3 أكتوبر</bdi>» | «تنزيل الملف», or «الجزء 1 من 3» … one `<a>` per part to `…/download?part=n` · «جهّزه من جديد» when the visible count ≠ `photo_count` |
| `stale` | «تغيّرت الصور بعد تجهيز الملف، فلم يعد متاحًا.» | «جهّزه من جديد» |
| `failed` | «تعذّر تجهيز الملف.» | «حاول مرة أخرى» |

The count uses all six forms: `{count, plural, zero {لا صور} one {صورة واحدة} two {صورتان} few {{value} صور} many
{{value} صورة} other {{value} صورة}}`. The state comes from `getPhotosPageData()` — the same `cache()`d read — as a
new **optional** `album` field that is `null` for non-staff. It is optional because `gallery.test.tsx:14` mocks the
module with `getPhotosPageData` alone, and a second DAL function would be `undefined` there.

**The two album routes:**
- `POST /api/photos/albums/[sessionId]` — Zod uuid · `Origin` must equal the host (a Route Handler has no Server
  Action origin check; the auth cookies' `SameSite=Lax` is the second line) · `request_photo_album` · `303` to the
  Referer `#photos`. It works with no JS; the page then reads `queued` from the data. `album_empty` and `42501` →
  `?download=album_failed`.
- `GET /api/photos/albums/[sessionId]/download?part=n` — `record_photo_album_download` · signs as the caller
  (`photo-albums`, 60 s, `download: file_name`) · `303`. A refusal → `?download=album_failed#photos`.

**The notification — request R3: a new key, `MSG-photo_album_ready`**, category `admin_queue`, **in-app only**
(`in_app true, email false`, optional `true`), payload `{ session_id, photo_count, parts }`. The inbox already links
any row carrying `session_id` to the session (`notification-list.tsx:149-150`), which is where the ready row is.
In-app only means no mail design, so `notify`'s 25 designed email keys are unmoved. The inbox strings are
«ملف صور الجلسة جاهز للتنزيل» and «Session photos are ready to download», in `notifications.json` (the lead's as
custodian). It moves `tests/rls/notify-contract.test.ts:96` (`toHaveLength(39)` → 40), which is a ledger line of the
lead's. **`MSG-export_ready` is not reused** — it is the member's own data export under `account`, and its copy says
so.

### P5 — the comment's avatar (contract 4)

The hotlink is closed (`92953c8`, `0155`). This row puts **our** copy back, on `platform`'s W14.4 as drafted:
- `comments.ts:~118,126` — embed `author:members(id, display_name, avatar_version)` and set `avatarUrl:
  avatarHref({ id, avatarVersion })`. The DTO's name and type are unchanged, so the four component tests' fixtures
  (`avatarUrl: null`) still type-check.
- **The realtime payload never carries a URL again, not even ours.** `authorAvatarUrl` stays `null` for `main`'s
  client. A new `authorAvatarVersion` (an integer or null) is appended. I propose `comments_broadcast()`'s
  re-creation under `supabase/proposed/content/`, dropped and re-created in one file, and the lead promotes it.
  `comment-list.tsx:43` calls `avatarHref({ id: payload.authorId, avatarVersion: payload.authorAvatarVersion })`.
  An absent key — `main`'s SQL during the gap — reads as `null`, which means initials. `comments-no-hotlink.test.ts`
  (the lead's) stays green unmodified, because its two assertions still hold.
- **What I need from `platform`:** `avatarHref` as a **pure** module, as their W14.4 already says, so the client
  list can import it, and the name and type committed in their note.

### Files, one by one

| File | Change | Row |
|---|---|---|
| `src/components/photos/gallery.tsx` | tiles → `LightboxTile`; `PhotoLightbox` around both branches; the crop comment; `AlbumControl` and the notice in the first row | P1 P2 P4 |
| `src/components/photos/lightbox.tsx` (new) | provider, tile, dialog, keys, swipe, live reconciliation | P1 |
| `src/components/photos/album-control.tsx` (new) | the five states | P4 |
| `src/components/photos/download-notice.tsx` (new, client) | `?download=photo_failed \| album_failed`, `role="alert"` beside the slot | P3 P4 |
| `src/lib/dal/photos.ts` | select `width, height`; optional `PhotoSummary.width/height`; optional `PhotosPageData.album`; `recordPhotoDownload`, `requestPhotoAlbum`, `recordPhotoAlbumDownload` | P1 P3 P4 |
| `src/app/api/photos/[photoId]/download/route.ts` (new) | `GET` | P3 |
| `src/app/api/photos/albums/[sessionId]/route.ts` (new) | `POST` | P4 |
| `src/app/api/photos/albums/[sessionId]/download/route.ts` (new) | `GET ?part=` | P4 |
| `packages/storage-paths/src/content.ts` | `photoAlbumPartPath`, `photoAlbumPrefix` | P4 |
| `worker/src/tasks/zip_session_photos.ts` (new) | the job | P4 |
| `worker/src/content/zip.ts` (new) · `worker/src/content/storage.ts` | the `zip` call · `listObjects` | P4 |
| `supabase/proposed/content/0156-album-build.sql` (lead renumbers) | three service definers and the trigger | P4 |
| `supabase/proposed/content/0157-comments-broadcast-avatar-version.sql` | `comments_broadcast()` + `authorAvatarVersion` | P5 |
| `src/lib/dal/comments.ts` · `src/components/event/comment-list.tsx` | `avatarHref` | P5 |
| `src/messages/{ar,en}/photos.json` | `photos.lightbox.*`, `photos.album.*`, `photos.download.*` — Arabic first | P1 P3 P4 |

**New tests** (existing files are evidence and are not edited): `tests/components/photos/lightbox.test.tsx` (the
opening tile, focus back to it after moves, the ends `aria-disabled`, keys by direction, «3 من 12» and the live
text, hidden photos absent, a prop update that removes the current photo, a swipe in RTL and LTR, axe) ·
`tests/components/photos/album-control.test.tsx` (each state; a member sees none) ·
`tests/unit/photos-download-routes.test.ts` (uuid, refusal → Referer `?download=photo_failed#photos`, off-origin
Referer, `Origin` on the `POST`) · `tests/unit/photos-album-parts.test.ts` (partitioning, names, `zip`'s argv,
`ENOENT`) · `tests/unit/storage-paths-album.test.ts` · `tests/rls/photos-album-build.test.ts` (`applyProposed`:
superseded, stale mid-build, the trigger **as a member** through a takedown, `service_role`-only grants) ·
`tests/e2e/wave14-content-lightbox.spec.ts` — ★ **the `SC 2.5.7` gate**: open the first photo, «التالية» through
every one and «السابقة» back, `page.click()` alone and no `mouse.down/move/up`, asserting the displayed `img`'s
`src` names a different photo id each time and the position text says so; Escape closes and focus is back on that
tile; a 390 px capture · `tests/e2e/wave14-content-photo-download.spec.ts` (the link is a route; `303` to a signed
URL with `content-disposition: attachment`; a hidden photo's route bounces back) ·
`tests/e2e/wave14-content-album.spec.ts` — ★ **M4 with the real worker**, which the lead runs: «تنزيل الكل» returns
in under 2 s with «نُجهّز» on the page; the worker builds; a reload shows «جاهز»; the bell has the row; the zip is
fetched through the route and **parsed in Node** (a stored zip is about 30 lines: EOCD, the central directory, local
headers — no `unzip` needed). Its entry count equals the visible photos, **each entry's SHA-256 equals its row's**,
the hidden photo is absent, and there is no EXIF marker in any entry. The rows that prove `record_*` refuses and
audits are the lead's `tests/rls/photo-downloads*.test.ts`.

**Captures:** `.qa-shots/rtl/wave14-content-{gallery-grid,lightbox-open,lightbox-last,album-building,album-ready}.png`.

### Existing tests whose expectations move — predicted: none

Each is named with the reason it holds. If any one moves, it becomes a ledger line in the same commit.
- `tests/components/photos/gallery.test.tsx:59` (`toBeEmptyDOMElement`) — the `null` return is unchanged.
  `:76`, `:88` and `:98-99` count buttons **by name** only; the new tile buttons are named «افتح الصورة …».
  `:109` (axe) — each new button has a name. `:14` mocks only `getPhotosPageData`, which is why `album` is an
  optional field of that one read.
- `tests/components/photos/gallery-grouping.test.tsx:63` (`getAllByRole("listitem")` ×2) — one `<li>` per tile,
  unchanged. `:76` (three `menuitem`s) — the rescope chip is untouched.
- `tests/e2e/photos.spec.ts:206`, `:269` and `wave9-content-photo-worker.spec.ts:161`, `:176` count **`page.locator
  ("img")`** across the whole page. They hold because Radix unmounts closed content, so a closed lightbox renders
  no `img`. ★ **Risk, named:** P5 draws an `<img>` for a comment author with an imported copy. No fixture member has
  one, and if one ever did, `:176`'s strict `toBeVisible()` would see two images.
- `wave9-content-days.spec.ts:328`, `:335` and `:337` filter `li` by `img[src*="/photos/<id>.jpg"]` — the tile's
  `src` is unchanged.
- `wave10-content-photos-takedown.spec.ts:140` — its name is `exact`, so it is untouched.
- `tests/components/event/{comment-list,comments,comment-item}.test.tsx` — fixtures carry `avatarUrl: null`, and the
  type is unchanged.
- **Not mine, and it moves:** `tests/rls/notify-contract.test.ts:96` (39 → 40) with R3 — the lead's line.

### What `main`'s worker does in the gap

- **The schema first (`0156`+) with `main`'s app and worker:** nothing in `main` enqueues `zip_session_photos` or
  calls the new definers. The only live change is the `photos` trigger. `main`'s hides, removals and deletes fire
  it, it updates zero rows (no album exists), and it never raises — the takedown path is untouched. The
  `comments_broadcast()` re-creation keeps `authorAvatarUrl: null`, so `main`'s `comment-list.tsx` (which ignores
  it) is unchanged. `process_photo` is not changed at all.
- **After the merge, before Railway is reconnected by hand** (eight merges running): Vercel serves «تنزيل الكل»
  and the job waits in `graphile_worker._private_jobs`, because 0.18's `getJobs` fetches only the tasks a worker
  registered (`task_id = any($2::int[])`, `dist/sql/getJobs.js:176`). The page honestly says «نُجهّز» until the
  new worker starts. If the new image lacked `zip`, three attempts fail on `ENOENT`, the row says `failed`, and staff
  see «حاول مرة أخرى». The lightbox and the per-photo route need no worker at all.

### Requests to the lead

- **R1** `ui/dialog.tsx`: `size="media"` (P1 above), including the safe-area insets.
- **R2** `0156`: `photo_album_status`, `photo_albums` with its policy and grant, the `photo-albums` bucket and its
  read policy, the three audit definers above, **and** (recommended) `and p.removed_at is null` in
  `photos_storage_read`.
- **R3** `MSG-photo_album_ready` (in-app, `admin_queue`, optional), its two inbox strings, and the `notify-contract`
  ledger line.
- **R4** `worker/Dockerfile`: `zip` on the `apt-get` line · register `zip_session_photos` in `worker/src/index.ts` ·
  optionally `PHOTO_ALBUM_PART_BYTES` on Railway (the default is 45 MiB).
- **R5** to `platform`: `photo-albums` in `BUCKETS`; `avatarHref` pure and committed.
- **R6** `04`'s route table: `?part=` on the album download, and the refusal values from W14.0 §6.
- **R7** `members.ts:44` (L2, or `avatarUrl: null` now) — W14.0 §10.

### Questions for sync 1

- **Q1** What is production's global Storage limit (dashboard → Storage → Settings)? It sets the part cap. «One zip»
  holds only if the owner raises it, and that is a plan setting.
- **Q2** Hidden tiles are not lightbox triggers, even for staff — confirmed?
- **Q3** The per-photo download refuses a hidden photo to staff too — confirmed? (`REQ-ADM-021`'s «any viewer who
  may see it» against `REQ-EVT-016`'s «never a hidden one».)
- **Q4** `?download=photo_failed` / `album_failed` rather than `failed`?
- **Q5** Three definers rather than two?
- **Q6** ASCII file names by the session's date, or the Arabic title through `filename*`?
- **Q7** Seven days to expiry, cleaned up by the job's own `expire` mode — or `enforce_retention` (`platform`)?
- **Q8** The notification is in-app only, under `admin_queue` — agreed?
- **Q9** «احذف الصور التي أظهر فيها» stays on the tile and is **not** repeated in the lightbox — agreed?
- **Q10** Tile thumbnails (`cwebp -resize`, a second object per photo) — carried to a later wave?
- **Q11** One sequence across day groups, rather than one per group — agreed?

**Order after approval:** P2 and the DTO → P1 (logic first; the frame once R1 lands) → P3 (after `0156`) → P4 (after
R2–R4) → P5 (after `platform`'s commit) → the three specs → captures.

### W14.1 Built after sync 1 (`DEC-182`) — what is done, what is not, and why

| Row | Commit | State |
|---|---|---|
| platform's R1 — `ui/avatar` initials under the image | `b45541b` | done; ★ **ledger line** below |
| P3 + P4 routes, DAL, `AlbumControl`, the notice, the strings | `02c6090` | done — 13 route units, 8 component cases |
| P1 lightbox + P2 crop, wired into the slot | `29eb962` | done — 11 component cases; the three existing photo suites pass **unmodified** |
| P4 `JOB-zip_session_photos`, `zip.ts`, `listObjects`, the album paths | `d94a882` | done — 20 units, the real `zip` on this machine, the parts opened and hashed |
| P4 SQL: `begin`/`record`/`fail_photo_album`, `photo_albums_stale` | `910388c` | proposed as `content/0158_photo_album_build.sql`; `photos-album-build.test.ts` 11/11 with `applyProposed`, the trigger **as a member** |
| P5 the comment's avatar through `avatarHref` | `9d2e8dc` | done; `0157` already appends `authorAvatarVersion`, so **no SQL of mine** |
| M1 `wave14-content-lightbox.spec.ts` (the `SC 2.5.7` gate + the per-photo route) | `29eb962` | **written, not run** — it needs a production build of this tree (the lead's) |
| M4 `wave14-content-album.spec.ts` (real worker, `E2E_WORKER=1`) | `50ad630` | **written, not run** — needs the job's registration in `worker/src/index.ts` and a worker on the new code |
| Captures `wave14-content-{lightbox-open,lightbox-last,album-building,album-ready}` | — | written by the two specs, so they land when those run |

**Ledger line (to `STATUS.md`, through the lead):**

| File | Assertion | Why |
|---|---|---|
| `tests/components/ui/avatar.test.tsx:31-35` | «renders a real image, not initials» — `bdi` **not** in the document → `bdi` present with the initial, and the `img` `absolute` over it | `DEC-182` (`platform`'s R1): the initials are always drawn underneath, so an image that fails falls back to them with no script |

**Deviations from the plan, each small:**
- The lightbox's `aria-label`, `alt` and live text carry `<bdi>` in the catalogue, as `content-i18n.test.ts` requires, and
  drop it with `t.markup(…, { bdi: plain })`, as `gallery.tsx`'s rescope label already does.
- An expired album is dropped in the DAL (`toAlbumState()`), not in the component: `react-hooks/purity` refuses `Date.now()` in render.
- The lightbox's frame is `size="media"` plus `className="theme-dark"`, so the secondary controls and the focus ring take the dark tokens.
- `AlbumControl` is synchronous and takes `t` from the slot, like `PhotoGrid`. An async child would not render inside `gallery.test.tsx`'s tree.
- File names are `0156`'s, and the lead wrote them: `photos-YYYYMMDD[-part-N-of-M].zip`. `DEC-182` Q6 says `album-YYYYMMDD-part-N.zip`, so the ruling and the landed SQL disagree. I changed nothing on my side, because no code of mine reads the name.

**Failures in `npm test` that are not mine** (seen at `29eb962`): `admin-audit-labels.test.ts`, where the three new audit actions
have no labels in `admin.json`; and `mail-render.test.ts`, where the matrix now has 40 rows against 39. Both come from `0156`'s
additions, and both are the lead's as custodian.

---

## Wave 15 plan

**Date:** 2026-09-28 · **Branch:** `wave-15/tokens-and-primitives` at `9a81014` · **State:** planning only — no code, no
test, no demo written. **Refs:** `DEC-183`, `DEC-184`, `REQ-UIX-030` … `032`, `034`, `036`, `040`, `043`, contracts C1 – C4.

Read, in order: `.claude/agents/content.md` (from disk), `STATUS.md`'s wave-15 block, `CLAUDE.md`'s wave-15 map, `DEC-183`
in full, `DEC-184`, `DEC-073`, `DEC-093`, `DEC-100`, `DEC-167`, `docs/design/README.md` → `00` … `08` + `tokens.css`, both
prototypes as behaviour, `01-prd.md` `REQ-UIX-026` … `043`, my nine primitives, their nine tests, `ui/index.ts`, `ui/icons.tsx`,
`globals.css`, `posters/session-poster.tsx`, `event/comment-item.tsx`.

**How measured.** Besides reading, I compiled `globals.css` with the repo's own Tailwind (`node_modules/tailwindcss`, the
`compile()` API, in my scratchpad) to see what each utility actually emits, and computed WCAG ratios for every pair named
below. Nothing in the tree was written.

The scope's class is not published yet (C1). Below it is **`<scope>`**, its light variant **`<scope-light>`**, and a class
keyed to it is written **`pg:`** (see §0).

### 0 · The one ruling that sizes this plan — how a primitive reads the scope (Q1)

**Measured** (compiled output):

| Utility | Emits | Consequence |
|---|---|---|
| `bg-surface`, `border-edge`, `text-fg-muted`, `ring-surface` | `var(--surface)`, `var(--edge)`, … (`@theme inline`) | a scope **could** re-point them, as `.theme-dark` does (`globals.css` `.theme-dark` block) |
| `rounded-card`, `rounded-field` | `var(--radius-card)`, `var(--radius-field)` | same |
| `bg-navy-900`, `bg-silver-100`, `text-white` | `var(--color-navy-900)` … | same, but that would re-point a **raw** name |
| `shadow-card`, `hover:shadow-raise` | the shadow **inlined** (`0 1px 2px var(--tw-shadow-color, rgba(…))…`) | **cannot** be changed by a token; a scope needs a class |
| `border-live/30`, `border-error-border/40` | `color-mix(… #8a5a1f 30% …)` — **hex inlined** | same |
| `duration-150` | `150ms` literal; Tailwind's default transition is also `150ms` | not a token (§2, Q7) |
| `animate-pulse` | `var(--animate-pulse)` = `pulse 2s …` | a Tailwind duration, not ours (Q7) |
| `[.<scope>_&]:x` and a `@custom-variant pg (&:where(.<scope>, .<scope> *))` | both emitted **after** the base utility; the first at 0,2,0, the second at 0,1,0 | either overrides the base inside the scope and nothing outside |

**Three ways to migrate, and what each moves:**

- **A — the scope re-points the existing semantic variables** (`--surface`, `--edge`, `--fg-*`, `--bg`, `--ring`,
  `--radius-card`) the way `.theme-dark` already does. Every primitive reading `bg-surface` changes inside the scope with no
  edit. **But** it is a redefinition inside a class, which `DEC-183` §4.2(a) may forbid, and it changes every non-primitive
  class inside the scope too (a screen's own `text-fg-muted`). Moves no test.
- **B — new semantic names, class by class** (`bg-surface` → `bg-<new-surface>`). Moves assertions (§9): `panel.test.tsx:16`
  at least, `card.test.tsx:69` if the hover class moves, and — if `MEDIA_TINTS` is renamed — `card.test.tsx:199`, `:200`,
  `:215` and `sessions`' `tests/e2e/wave7-sessions-public-card.spec.ts:107`.
- ★ **C — recommended: every class that exists today stays byte-identical, and the scope's look is ADDED by scope-keyed
  classes that read only the scope's semantic and structural tokens.** Outside the scope the class list resolves exactly as
  today, by construction, so no screen and no public route can move; **no existing assertion moves**. It is the repository's
  own precedent: `badge.tsx:32-47` (`[.theme-dark_&]:`) and `platform/impersonation-banner.tsx:69`, which works round
  `Panel`'s missing dark form at the call site. What I ask the lead for is **a published variant** (C1): `pg:` for «inside the
  scope», `pg-dark:` and `pg-light:` for its two grounds (`@custom-variant` in `globals.css`, `:where()` so it adds no
  specificity, or the `[.<scope>_&]` arbitrary form if the lead prefers no new variant). A raw palette name never appears
  after `pg:` — only the scope's names.

The rest of this plan is written for C. Under A, §2's «inside» column is what the scope's values produce with no edit, and my
commits shrink to the structural rows. Under B, §9 lists the ledger lines.

### 1 · Token requests — what contract 1's list does not carry (to the lead)

Contract 1 names: ground, surface, raised, text, muted, line, accent, accent-deep, signal, signal-deep; the control's radius,
face, press shadow, heights. **I also need:**

| # | Role (name is the lead's) | Outside the scope (today) | Inside, dark / light | Read by | Why |
|---|---|---|---|---|---|
| T1 | **text-strong** — a second text role | `--fg-heading` `#0b1220` | bone / paper-ink | card, stat, empty-state, tag-chip hover, file-drop | the tree has two text roles (`fg-heading`, `fg-body`); the scope has one `fg` |
| T2 | **line-strong** — a control boundary at ≥ 3:1 | `--edge-strong` `#767f8c` | ≥ 3:1 on ground **and** surface / same on paper | badge outline, file-drop's dashed zone, empty-state's underline | ★ the scope's `line` `#2A2E40` is **1.45:1 on ink** and paper-line `#E4DFD3` **1.20:1 on paper** — decoration only (SC 1.4.11) |
| T3 | **on-fill** — text on accent, signal, a team colour, a sticker | — | ink in both (`01`: «text on it is always ink») | tag-chip selected, reaction pressed, sticker, poster placeholder | ink on every fill ≥ 6.25:1 (lime 16.52, coral 7.06, violet 6.25, gold 13.52, bone 17.31, tangerine 9.22) |
| T4 | ★ **focus** — distinct from accent | `--ring` | lime (16.52:1 on ink) / **ink (16.71:1)** | card, reaction-bar, story-ring, file-drop, tag-chip | ★ `04`: «focus ring = 3px accent outline», and `01` keeps accent **lime in the light variant — 1.07:1 on paper**. Invisible. Plus a **focus-width** (`2px` today on `card.tsx:52`; `3px` in `04`) |
| T5 | **radius-pill** | `--radius-field` 6px | 999px | tag-chip, avatar, sticker, reaction pill, story-ring | `01`'s `--radius-pill`; the tree has only `field` 6 and `card` 14 |
| T6 | **radius-card** (scope value) | 14px | 22px | card, stat, panel, empty-state, file-drop | `01`: 22. Under C the class `rounded-card` stays and `pg:` adds the scope's card radius |
| T7 | **radius-poster** | — | 16px | poster | `01` |
| T8 | ★ **avatar tints ×6 + their text** | today's pairs: navy-950/900/800 + white, silver-200/300/400 + navy-950 (`avatar.tsx:29-36`) | `01`'s six (`#2C3D4A` … `#3C4A2E`) with bone; bone on each ≥ 9.4:1 | avatar | `REQ-PRF-009`: six tints keyed to the member id. Inside the scope three of today's six are **light silvers**, which on ink read as the only bright faces in a row. Six `bg` + one text is enough inside (all dark); outside nothing reads them |
| T9 | **team-neutral** — the ring for `teamColor: null` | — | muted `#A7ABBE` (8.56:1 on ink) / paper-muted | avatar, poster, story-ring, progress-bar | `line` would be 1.45:1 — a «no colour» ring that cannot be seen is not a neutral ring |
| T10 | **ring-team-width** | — | 3px | avatar, story-ring | `01`'s `--ring-team` |
| T11 | ★ **`--color-ended-on-dark`** — a platform constant | `#a8b3c4` (today's `.theme-dark` `--fg-muted`, which the badge borrows at `badge.tsx:35`) | the same constant | badge, stat, panel, progress | `ended` is the one status with no on-dark constant; it borrows `--fg-muted`, which the scope **would** remap to `#A7ABBE`. `DEC-073`: a status colour never remaps. Same value, new name, nothing moves |
| T12 | **sticker fills ×6 by name** | — | accent, signal, cyan, gold, violet, bone | sticker | `REQ-UIX-031`: «its fill comes from the allowed set by name». Three are team colours — a primitive may not read the raw palette, so they need semantic names |
| T13 | **sticker rim** — `--shadow-sticker` reading `--sticker-ground` | — | `0 0 0 3px var(--sticker-ground), 0 0 0 6px <outer>` | sticker; poster sets `--sticker-ground: var(--team)` | `01` says the outer rim is `--fg` (bone on dark); **both prototypes draw it ink** (§8 D8) — the lead picks |
| T14 | **elevation off inside** | `shadow-card`, `shadow-raise` | none (`01`: «no soft grey drop shadow anywhere») | card, stat | no token needed under C: `pg:shadow-none`. Listed so the ruling is explicit |
| T15 | **card padding** | `p-4` 16px | 12px phone / 16px desktop | card body | `04`; under C it is `pg:p-3 pg:sm:p-4` and needs no token |
| T16 | **face** on a label | today's family | Baloo Bhaijaan 2 | stat value, sticker, poster title, story-ring word, empty-state title (Q9) | contract 1 names it; I need to know whether `font-display` resolves to Baloo **outside** the scope too (F1), because a new primitive rendered outside the scope would then load the face |
| T17 | **keyframe `reaction-pop`** `scale 1 → 1.22 → 1` at `--duration-base` | — | — | reaction-bar | `globals.css` is the lead's. The existing `reaction-ignite` (`globals.css:531`) starts at `scale(0.6)` with opacity — an entrance, not a pop (and see D10) |
| T18 | **keyframe `story-pulse`** + a **loop duration** token, `animation: none` under reduced motion | — | — | story-ring | `03`: `scale .9 → 1.25`, opacity → 0, **1.6s loop** — no duration token is 1.6s (fast 120 · base 220 · slow 420 · party 900). Q8 |

### 2 · The nine existing primitives — what each declares today, and what carries it inside the scope

Every class in the «today» column **stays exactly as it is** (C). The «inside» column is added with `pg:` (or `pg-dark:` /
`pg-light:`) and reads only scope names. A status colour is never touched (`DEC-073`, §3).

**`tag-chip.tsx`** (103 lines; the documents' «chip»)

| Line | Today | Role inside the scope |
|---|---|---|
| 67 | `inline-flex w-fit items-center gap-1.5 rounded-field border px-3 py-1 text-caption` | radius-pill; `04`: «13px 700» → face size 13px, weight 700 (the one structural pair I name here; Q9) |
| 68 unselected | `border-edge bg-surface text-fg-body` | line · **raised** (`04`: «`--bg-raised`») · text |
| 68 selected | `border-navy-900 bg-navy-900 text-white` | accent fill · on-fill (T3). `aria-current` stays the non-colour channel |
| 37 | count `text-fg-muted` | muted |
| 49 | link `hover:text-fg-heading` | text-strong (T1) |
| 82, 96 | remove `-me-1 size-6 rounded-full text-fg-muted hover:bg-silver-100 hover:text-fg-heading` | muted · raised · text-strong. ★ **24 px target** (`DEC-123`'s exemption, `tag-chip.tsx:87-91`) against this wave's «every target at least 44 px»: inside the scope I extend the **hit area** to 44 px with a transparent pseudo-element, visual size unchanged (Q10) |

**`badge.tsx`** (145 lines; the documents' «status badge», holds `SessionStatusBadge`)

| Line | Today | Inside |
|---|---|---|
| 74 | `inline-flex w-fit items-center rounded-field font-medium` | **unchanged** — I recommend the badge keeps its 6 px corner inside the scope: the sober rectangle is the non-colour channel that separates a status (truth) from a sticker (joy, a pill). Q11 |
| 61-62 | `sm: min-h-6 gap-1 px-2 text-caption` · `md: min-h-7 gap-1.5 px-2.5 text-label` | unchanged |
| 29-38 filled, 42-49 outline | status constants + `[.theme-dark_&]:` on-dark forms | ★ **`pg-dark:` gets exactly the `[.theme-dark_&]:` forms** (on-dark constants), **`pg-light:` the light ones**. Measured: the light constants on the scope's surface `#151724` are **2.67 – 3.13:1** (success 2.83, live 3.02, ended 3.13, error 2.67) — they fail inside a dark scope, so this is required, not optional. The on-dark constants pass: live 8.10, success 8.61, error 7.05, ended (T11) 8.40 on surface; on ink 7.73 – 9.45. On paper the light constants pass: 5.13 – 6.01 |
| 110 | live dot `motion-safe:animate-pulse` (Tailwind's 2s) | Q7 |

**`avatar.tsx`** (116 lines)

| Line | Today | Inside |
|---|---|---|
| 70 | `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-field font-medium` + `relative` | radius-pill (the documents and both prototypes draw a circle; the tree's 6 px is the lead's `DEC-110` ruling — D2) |
| 29-36 | `TINTS` six navy/silver pairs, indexed by `tintIndex(memberId)` (`:43`) | T8's six, **same index** — the member keeps their tint's slot; only its value is the scope's |
| 51-59 | sizes 24/32/34/40/56/96/160 with arbitrary `text-[…rem]` | unchanged (`04` names 32/38/40; 38 does not exist — D3) |
| 86 | img `absolute inset-0 h-full w-full object-cover` | unchanged — a photograph may crop; a poster may not |
| 102-111 | `AvatarStack`: `[&>*:not(:first-child)]:-ms-2`, `rounded-field ring-2 ring-surface`, overflow `ms-1.5 text-caption text-fg-muted` | radius-pill · the ring in **surface** stays surface · muted. No team ring on the stack (its member type has no colour; Q12) |
| new | the team ring — §4 | |

**`card.tsx`** (214 lines — `Card`, `CardMedia`, `CardBody`, `CardActions`)

| Line | Today | Inside |
|---|---|---|
| 41 | `group relative overflow-hidden rounded-card border border-edge bg-surface shadow-card transition-shadow duration-150 hover:shadow-raise` | card radius 22 (T6) · line · surface · `pg:shadow-none pg:hover:shadow-none` (T14). ★ Hover inside the scope: nothing scales, nothing moves; I propose **line → line-strong on hover, no transition** (Q13) |
| 52 | link `focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]` | focus + focus-width (T4) |
| 68-79 | density widths `w-28 sm:w-36`, `w-20`, `w-2/5`, `self-start` | unchanged (layout, `REQ-UIX-026`) |
| 161 | media box `relative shrink-0 overflow-hidden bg-navy-900` | the letterbox ground → **raised** |
| 104-111 | `MEDIA_TINTS` (navy/silver + white) | **unchanged, and not re-coloured inside the scope** — pinned by `card.test.tsx:199`, `:200`, `:215` and `wave7-sessions-public-card.spec.ts:107`. Inside the scope a session's placeholder is `poster`'s job (§5.2), not `CardMedia`'s. Q14 |
| 183, 188 | `object-contain`; placeholder `text-h2 font-semibold` | unchanged |
| 200 | `CardBody` `flex min-w-0 flex-1 flex-col gap-1.5 p-4` | `pg:p-3 pg:sm:p-4` (T15) |

**`progress.tsx`** (40 lines)

| Line | Today | Inside |
|---|---|---|
| 32 | track `h-2 w-full overflow-hidden rounded-full bg-silver-200` | raised |
| 13-19 | fills `bg-navy-900` (neutral, info), `bg-success`, `bg-live`, `bg-ended`, `bg-error` | neutral/info → **accent**; the four status fills → their on-dark constants under `pg-dark:`. ★ Measured: `navy-900` on the scope's surface is **1.02:1** — invisible |
| 36 | fill `style={{ width: pct% }}` | **unchanged** (§6a) |
| 35 | indeterminate `w-full motion-safe:animate-pulse` | Q7 |

**`empty-state.tsx`** (58 lines)

| Line | Today | Inside |
|---|---|---|
| 27 | `flex flex-col items-center gap-3 rounded-card border border-edge px-6 text-center py-8/py-14` | card radius · line |
| 30 | icon `text-[1.75rem] text-fg-muted` | muted |
| 34 | title `font-medium text-fg-heading text-label/text-h3` | text-strong; the face (Q9) |
| 35 | `max-w-prose text-body-sm text-fg-muted` | muted |
| 38-45 | the lead's `Button` / `ButtonLink` `variant="primary"` | nothing here — `button` migrates itself (L1) |
| 49 | clear link `text-label text-fg-muted underline decoration-edge-strong underline-offset-4 hover:text-fg-heading` | muted · line-strong (T2) · text-strong |

**`stat.tsx`** (39 lines)

| Line | Today | Inside |
|---|---|---|
| 31 | `block rounded-card border border-edge bg-surface p-4` | card radius · line · surface |
| 33 | link `transition-shadow duration-150 hover:shadow-raise` | `pg:shadow-none`; hover as `card` (Q13) |
| 24, 28 | label, hint `text-caption text-fg-muted` | muted |
| 25 | value `text-h2` + `text-fg-heading` or a tone | text-strong in the face (`00`: «big numbers in the display face»); the tones → on-dark constants under `pg-dark:` (the light ones are 2.67 – 3.13:1 there) |

**`panel.tsx`** (18 lines)

| Line | Today | Inside |
|---|---|---|
| 17 | `rounded-card border p-4` | card radius |
| 8 neutral | `border-edge bg-surface` | line · surface |
| 9 info | `border-edge bg-silver-100` | line · raised |
| 10-13 status | `border-success/30 bg-success-bg` · `border-live/30 bg-live-bg` · `border-edge bg-ended-bg` · `border-error-border/40 bg-error-bg` | ★ under `pg-dark:` the **outline form** with the on-dark constants and a transparent fill — exactly what `impersonation-banner.tsx:69` adds by hand today. Finding F4 (§8) |

**`file-drop.tsx`** (175 lines) — tokens only, **no animation** (`REQ-UIX-030`)

| Line | Today | Inside |
|---|---|---|
| 94 | zone `rounded-card border-2 border-dashed px-6 py-8 transition-colors duration-150` | card radius · `pg:transition-none` (no animation, as the wave says) |
| 95 | drag-over `border-navy-700 bg-silver-100` · invalid `border-error-border` · rest `border-edge-strong` | drag-over → accent border + raised · invalid → the error on-dark constant · rest → line-strong (T2). ★ **`border-navy-700` emits nothing** — F1 (§8) |
| 96 | disabled `opacity-50` | unchanged |
| 98 | glyph `text-[1.5rem] text-fg-muted` | muted |
| 108 | chooser `inline-flex h-11 items-center rounded-field border border-edge-strong px-5 text-label text-fg-heading hover:bg-silver-100 disabled:…` | control radius · line-strong · text-strong · raised. 44 px already |
| 133, 147, 151 | `text-caption text-fg-muted` · `text-body-sm text-fg-heading` · `text-caption text-error` | muted · text-strong · error on-dark |
| 143 | row `rounded-field border border-edge p-2` | control radius · line |
| 165 | remove `h-7 w-7 rounded-full text-fg-muted hover:bg-silver-100 hover:text-fg-heading` | ★ **28 px** — hit area to 44 px inside the scope, as `tag-chip` (Q10) |
| 157 | `<Progress>` indeterminate | follows `progress` |

### 3 · ★ `01-tokens.md`'s status table against what `DEC-073` fixed — token by token (N2)

What the tree renders (`badge.tsx:118-145`, strings `messages/ar/browse.json` `status.*`, constants `globals.css:29-55`):
**nine rows** from `phase × seat × closingSoon`. What `01` specifies: **five tokens**.

| `01` token | `01` look | Tree today | Difference |
|---|---|---|---|
| `status-live` «جارية الآن» | coral fill `#FF6E4F`, ink text, leading dot | `live` tone: `#8a5a1f` on `#fbf5ea` (light) · `#d2a86b` outline on dark · a pulsing `DotIcon` (`badge.tsx:110`) | **colour** (coral = the scope's **signal** — the same colour as streak and check-in urgency; a status sharing a brand accent is no longer a constant) · the word matches · the dot matches |
| `status-done` «مكتملة» | surface-2 fill, bone text, line border, **check glyph** | `ended` «انتهت», `#5b6780` on `#f1f3f7`; no glyph | **word** («مكتملة» ≠ «انتهت») · colour · **a glyph the tree lacks**. ★ `01` builds it from `surface-2`, `bone` and `line` — **scope semantics that remap in the light variant**, contradicting `01`'s own «status tokens do not remap» |
| `status-cancelled` «أُلغيت» | transparent, muted text and border, **x glyph** | `error` tone, `#9e3b3f` on `#fbf1f1`; **no glyph** | colour (muted grey vs error red — a demotion of meaning) · a glyph. ★ **`REQ-UIX-003`'s acceptance already says «`cancelled` … carry chrome, colour and an icon — never bare text», and the tree's cancelled badge carries no icon** (`badge.tsx:110` gives an icon to `live` alone). The code contradicts its own requirement, today, outside this wave (F2) |
| `status-waitlist` «قائمة انتظار» | **team-cyan** fill, ink text, **clock glyph** | `open` + `seat="full"` → `live` tone «قائمة انتظار» (`badge.tsx:130`) | colour · a glyph (`ClockIcon` exists). ★ **A status in a team colour**: `01` proposes cyan for مواهب — that company's sessions would wear the waitlist's colour |
| `status-full` «ممتلئة» | surface-2 fill, bone text | **no such row** — a full session reads «قائمة انتظار» | a **new word and a new state**; the tree folds «full» into «waitlist» on purpose (`badge.tsx:125-130`, the test at `badge.test.tsx:72`) |
| — | — | `open` «التسجيل مفتوح» (success) · `closingSoon` «يُغلق التسجيل قريبًا» (live) · `registrationClosed` «أُغلق التسجيل» (ended) · `draft` «مسودة», `pending_schedule` «بانتظار الجدولة» (outline) | **five of the tree's nine rows are absent from `01`** |

**Recommendation (a decision, not a restyle):** this wave the badge keeps `DEC-073`'s colours, words and dot **on every
surface**, and inside the dark scope wears the **on-dark constants it already has** — measured above, they pass there. Two
things are the lead's to take to the owner: (1) whether `01`'s palette replaces `DEC-073`'s — that means a new entry, and the
brand kit's status guard (`0144_status_contrast_guard.sql`, which pins `#8a5a1f`, `#5b6780`, `#d2a86b`) moves with it; (2)
`REQ-UIX-003`'s missing glyph on `cancelled` (F2), which is already owed. My recommendation on (1): **no** for coral and cyan
(each collides with a meaning the scope gives that colour elsewhere); **yes** to `01`'s glyphs (check, x, clock), which add a
non-colour channel.

### 4 · The avatar's team ring (C3, `REQ-UIX-043`, D2)

- **Prop:** `teamColor?: string | null` on `AvatarProps` (the lead lands it). ★ **Three values, not two**: `undefined` → **no
  ring**, today's avatar (every existing caller passes nothing, so nothing moves) · `null` → the **neutral** ring
  (a company with no colour) · `"#rrggbb"` → the team ring.
- **Into the DOM:** `style={{ "--team": teamColor }}` on the avatar's own `<span>` — the one value from data that becomes a
  style. ★ **The component re-checks `^#[0-9a-fA-F]{6}$` and treats anything else as `null`.** The database refuses a bad
  value (`0160`'s check), but React serialises a server-rendered custom property as written, and a `;` in it would end the
  declaration and start another. Defence in depth, one regex.
- **The ring:** `border-[3px]` (T10) coloured `var(--team)`, or `var(--team-neutral)` (T9) for `null`. **A border, not a
  box-shadow:** the box keeps its size, so a row does not reflow; the image (`inset-0`, `avatar.tsx:86`) sits inside the
  padding box and leaves the ring visible; a box-shadow ring would draw past the box into a neighbour. Classes are added
  **only when `teamColor !== undefined`**.
- **The fill stays the member's tint:** `TINTS[tintIndex(memberId)]` (`:79`) is untouched; the ring never feeds the tint and
  the tint never reads the company. Tested: the same id with two different `teamColor`s keeps the same tint class.
- **The initials stay under the image exactly as wave 14 left them** (`:78-88`, `DEC-182`): the `<bdi>` first, the `<img>`
  absolute over it, no `onError`, still a Server Component. `avatar.test.tsx:31-40` passes untouched.
- **Contrast, measured:** every team colour on ink is ≥ 6.25:1 (violet lowest), silver 15.37. ★ **On the light variant's paper
  every one fails 3:1** — silver 1.15, gold 1.30, mint 1.42, cyan 1.63, tangerine 1.91, magenta 2.68. The name always travels
  with the ring, so no information is lost (SC 1.4.11 is about information), but a silver ring on paper is invisible (F6, Q15).

### 5 · The five new primitives

Every one renders every state from props, reads no DAL, no session and no message catalogue (strings arrive as props), holds
no hex, no duration and no raw palette name, and is placed on no screen. Types are proposals for the lead's `ui/index.ts` (C2).

#### 5.1 `sticker` (`REQ-UIX-031`)

```ts
/** `content` · `sticker.tsx` — die-cut decoration. Never a status (REQ-UIX-003). */
export type StickerFill = "accent" | "signal" | "cyan" | "gold" | "violet" | "bone";
export interface StickerProps extends Styleable {
  /** The word — «محجوز», «مستوى جديد». Numerals already Western. */
  children: ReactNode;
  fill?: StickerFill;              // default "accent"
  /** Degrees; clamped to [-6, 6] (`REQ-UIX-031`). Default -4. */
  rotate?: number;
  size?: "sm" | "md";              // 16 px / 20 px in the face
  /** true only when it says what no badge on the surface says; otherwise aria-hidden. */
  informative?: boolean;
}
```

- **States:** six fills × two sizes × rotation; `informative` on and off. The rim reads `--sticker-ground` (T13), so it is
  drawn from whatever it sits on: a poster sets it to `var(--team)`, a card leaves the scope's surface.
- **Name:** `aria-hidden` by default; `informative` renders plain text in the flow (no role).
- **Reduced motion:** nothing moves this wave — the overshoot is the moments' wave (`DEC-183` §2). Rotation is static.
- **RTL:** rotation is visual, not directional; the word is `<bdi>`-wrapped.
- **Already in the tree:** nothing. The nearest are `Badge` (`badge.tsx:70`), which it must never replace, and `CardMedia`'s
  `overlay` slot (`card.tsx:193`), where one would sit on media.

#### 5.2 `poster` (`REQ-UIX-032`) — ★ measure-first (b)

**What is already there:**
- `CardMedia` (`card.tsx:152-196`): a reserved aspect box, the image **whole** (`object-contain`, `:183`, `REQ-UIX-026`), a
  generated placeholder — **one letter** on a navy/silver tint hashed from the title (`:139-145`, `:104-129`) — an `overlay`
  slot, `dimmed`, and `data-slot="media"`, which `Card`'s row densities size (`:69-79`).
- `SessionPoster` (`posters/session-poster.tsx:22-73`, `designer`'s, held by the lead): an **async Server Component that reads
  the DAL** (`getSessionPoster`), renders **nothing** when there is no poster, a «rendering n of m» line while rendering, and
  the artifact whole at its own ratio (`:63-64`) with a stale caption.

**What `poster` is beside them:** the **pure presentation of a session's poster in the playground**. It reads nothing.
★ **It composes `CardMedia`** (imported by path): the image-whole path, the slot name and `overlay` are `CardMedia`'s, and
`poster` passes its designed placeholder as `CardMedia`'s `children` when there is no image — so the whole-poster rule has
one implementation, not two. `SessionPoster` stays the DAL slot on the event page; when a screens wave moves the event page
into the scope, `SessionPoster`'s ready path can render `<Poster src …>` — a request to `designer`'s custodian **then**, not
now. Nothing is duplicated except the placeholder, which is new.

```ts
/** `content` · `poster.tsx` — the rendered poster whole, or its team-coloured placeholder. */
export interface PosterProps extends Styleable {
  /** The rendered master (same-origin or signed). Absent → the placeholder. */
  src?: string | null;
  /** The artifact's own size, when known, so the box is reserved at its ratio. */
  width?: number;
  height?: number;
  /** The image's alternative text. Default "" — the host renders the title as text. */
  alt?: string;
  /** Placeholder: the title in the face, balanced, never clipped on a line. */
  title: string;
  /** Placeholder: the category — «جلسة إدارية». */
  category?: string;
  /** Placeholder: pre-formatted date, Western digits — «2 أكتوبر، 6:30 م». */
  date?: string;
  /** "#rrggbb" → `--team`; null → the neutral ground; same check as the avatar's. */
  teamColor: string | null;
  /** ★ The company's name, drawn on the placeholder: colour is never the only channel. */
  teamName: string;
  /** A `<Sticker>` in the top-end corner of the placeholder. */
  sticker?: ReactNode;
  priority?: boolean;
}
```

- **States:** image with known size (box at its ratio) · image with unknown size (4:5, contained) · placeholder in a team
  colour · placeholder with `teamColor: null` (raised ground, text colour) · with and without category, date, sticker · a
  long title (four lines, balanced).
- **Name:** the image's `alt`; the placeholder's text is real text (no heading — the host owns the landmark, as `SessionPoster`
  says at `:8-10`).
- **Title:** `text-wrap: balance`, the face at 30 px; a long title is clamped on its **container** with room under the last
  line for marks (`02`: «truncation uses a container with `line-clamp`, never a clipped line»).
- **Reduced motion / RTL:** static; category at the inline start, sticker at the inline end, logical properties only.
- **Contrast:** ink on every team colour ≥ 6.25:1.

#### 5.3 `reaction-bar` (`REQ-UIX-034`)

```ts
/** `content` · `reaction-bar.tsx` — a like and four house reactions. Worth nothing (REQ-EVT-004). */
export interface ReactionBarItem {
  kind: string;                   // "like" | the house kinds — matches `reactions.kind` (`0010:341`, text)
  /** The accessible name — «إعجاب». */
  label: string;
  count: number;                  // rendered in Western digits, in <bdi>
  pressed: boolean;
  /** The glyph, from `ui/icons` — the caller chooses (§7). */
  icon: ReactNode;
}
export interface ReactionBarProps extends Styleable {
  /** The group's name — «التفاعلات». */
  label: string;
  items: ReactionBarItem[];
  onToggle?: (kind: string) => void;
  /** A read-only bar — a frozen thread shows counts and offers nothing (comment-item.tsx:309-319). */
  readOnly?: boolean;
  pending?: boolean;
}
```

- **States:** none pressed · one pressed · several pressed · zero counts (count hidden, as `comment-item.tsx:328`) · large
  counts · read-only · pending (`aria-busy`, labels kept).
- **Name:** `role="group"` named by `label`; each item a `<button aria-pressed>` whose name is its label and count. ★ **Pressed
  is shown without colour**: the glyph fills (the tree's own answer, `comment-item.tsx:307-316`: a filled dot against an
  outline one) and the pill's border steps up.
- **The pop:** one `reaction-pop` (T17) on the **transition into pressed caused by this viewer's press** — set in the click
  handler, never from a prop change, so a realtime count from someone else never pops (`REQ-UIX-034`, `DEC-183` §2: once per
  occurrence). Cleared on `animationend`, **no timer** (`DEC-146`); under reduced motion the global block collapses the
  animation, so the event still fires. `motion-safe:`-gated as well. Nothing else moves; nothing reads as an achievement.
- **Optimism** is the caller's, as today (`comment-item.tsx:86-90`, `useOptimistic`) — the primitive decides nothing.
- **Targets:** each pill `min-h-11` (44 px).
- **RTL:** the row flows in reading order; no glyph mirrors.
- **Already in the tree:** `comment-item.tsx:75-94, 306-330` — the one live like toggle, `IconButton` over a filled/outline
  `DotIcon`, `.reaction-ignite` + `.reaction-ring` (`globals.css:531-560`). `reaction-bar` does not replace it this wave.

#### 5.4 `progress-bar` (`REQ-UIX-036`) — ★ measure-first (a)

**Answer: a new file, and `progress.tsx` keeps its mechanism.** `progress.tsx:36` sizes its fill by **`width`**, and
`progress.test.tsx:26` and `:32` assert `width: 25%` / `100%`. `REQ-UIX-036` says «`scaleX`, never `width`». Changing
`Progress`'s fill would move pixels outside the scope — a scaled fill's rounded cap goes elliptical, and its end is no
longer where `width` put it — and two assertions. **The finding, stated:** after this wave the tree has two determinate bars.
`Progress` keeps its indeterminate mode and its three determinate consumers (`sessions/action-card.tsx`,
`materials/list.tsx`, `survey/results.tsx`); when each moves into the scope in a screens wave it adopts `progress-bar`, and
`Progress`'s determinate mode retires then. Not a second implementation of the same thing for ever — a replacement with a
dated exit.

```ts
/** `content` · `progress-bar.tsx` — one track, one fill, grown by transform from the inline start. */
export interface ProgressBarProps extends Styleable {
  value: number;
  max?: number;                    // default 100
  /** The accessible name — «مستواك». */
  label: string;
  /** Pre-formatted, Western digits — «320 من 500». */
  valueText: string;
  fill?: "accent" | "signal" | "team" | "text";   // default "accent"
  /** With fill="team": "#rrggbb" or null (neutral), set as --team on the element. */
  teamColor?: string | null;
  size?: "sm" | "md";              // 3 px (a story segment) · 10 px (a level, a race)
}
```

- **States:** 0, partial, full, over `max` (clamped); each fill; `teamColor` null; both sizes.
- **Name:** `role="progressbar"`, `aria-label`, `aria-valuenow/min/max`, `aria-valuetext`.
- **Transform:** the fill is `w-full`, `transform: scaleX(ratio)` inline (a number, not a colour). ★ **`transform-origin` has
  no logical keyword**, so the inline start is `ltr:origin-left rtl:origin-right` — both variants, never a bare physical
  utility — with the exemption written in the file, as `DEC-096` does for the overlay. The repository's precedent is
  `.scroll-progress` (`globals.css:966-973`), which flips its origin under `[dir="rtl"]`.
- **The cap:** the track clips (`overflow-hidden`, pill radius) and the fill carries no radius, so the leading edge is square
  rather than a squashed ellipse (D14).
- **Reduced motion:** static this wave — no transition. The race bar's 900 ms move is the moments' wave.
- **Already in the tree:** `progress.tsx:21-40`; `.scroll-progress`.

#### 5.5 `story-ring` (`REQ-UIX-040`)

```ts
/** `content` · `story-ring.tsx` — opens a session's story. A button; nothing of the viewer. */
export type StoryRingState = "live" | "upcoming" | "recap" | "seen";
export interface StoryRingProps extends Styleable {
  state: StoryRingState;
  /** The accessible name, naming the session — «قصة جلسة: العرض في 5 شرائح، مباشر». */
  label: string;
  /** The state's word, visible — «مباشر», «ملخص», «قادمة», «شوهدت». */
  stateLabel: string;
  /** One letter for upcoming — the avatar's rule. */
  glyph: string;
  /** The line under the ring — «اليوم», «الخميس». */
  caption: string;
  /** upcoming's ring: "#rrggbb" or null (neutral). */
  teamColor?: string | null;
  onOpen?: () => void;
}
```

- **Four states told apart without colour** — each has its own visible label **and** its own shape:
  live → the word «مباشر» inside, a **double** ring (the outer one pulses) · recap → the word «ملخص» inside, a single ring ·
  upcoming → the letter, a 3 px ring in the team colour · seen → the letter with a `CheckIcon` mark and a **1 px** ring, text
  kept at ≥ 4.5:1 (no opacity on the letter).
- **Name:** `<button type="button" aria-label={label}>`; the visible words are `aria-hidden` inside it, so nothing is read
  twice. Target: 60 px ring in a ≥ 66 px column.
- **Reduced motion:** the pulse is off (`motion-safe:` and `animation: none`, T18); the live ring still reads live by its word
  and its double ring (`REQ-UIX-040`).
- **RTL:** centred column, nothing directional.
- **Already in the tree:** nothing is a story ring. `Avatar`'s initial rule (`avatar.tsx:61-63`) and the badge's live dot
  (`badge.tsx:110`) are the nearest. `DEC-093`'s seventh place is the **viewer's**; the ring is a plain button.

### 6 · The three measure-first answers, short

- **(a) `progress-bar`:** a **new file**; `progress.tsx` keeps `width` (pinned by `progress.test.tsx:26`, `:32`); the overlap
  is named and retires when the three consumers adopt the new bar in the screens waves (§5.4).
- **(b) `poster`:** a **new file that composes `CardMedia`** for the whole image and the slot, and adds the team-coloured
  placeholder `CardMedia` does not have. `SessionPoster` stays the DAL slot; it renders `Poster` in a later wave (§5.2).
- **(c) the status colours:** `01`'s table differs from `DEC-073` in **colour on all five rows, the word on two («مكتملة»,
  «ممتلئة»), a glyph on three, and it omits five of the tree's nine rows**; its «waitlist» uses a team colour and its «done»
  uses remappable semantics. This wave keeps `DEC-073`'s constants and uses their existing on-dark forms inside the dark scope.
  Two decisions for the owner via the lead (§3).

### 7 · Glyphs, objects and keyframes I need from the lead

- ★ **The like glyph** — `HeartIcon` (the prototypes' like is a heart, `stories.html` `I.heart`), house shape: `1em`, `label`
  prop, **never mirrors**, with a **`filled`** prop like `StarIcon` (`icons.tsx:326`) — the pressed state's non-colour channel.
  Or the lead rules that the house like stays the dot (`comment-item.tsx:322`), and I need only `DotIcon`'s outline form.
- **`filled` on `FlameIcon` and `BoltIcon`** when L2 draws them, for the same reason. `StarIcon` has it.
- **The fourth house reaction** (Q5): `04` names fire, star, bolt, **pin**; `stories.html` draws three (fire, star, bolt);
  the house `PinIcon` is «المكان — a venue» (`icons.tsx:294`).
- `CheckIcon` (exists) for the seen ring. No object is needed this wave.
- Keyframes T17 (`reaction-pop`) and T18 (`story-pulse`), in `globals.css`.

### 8 · Where `docs/design/` and the tree disagree — not in `DEC-183` §4

Findings the tree gives against itself are marked F; disagreements with the documents D.

- **F1** — ★ `file-drop.tsx:95`: **`border-navy-700` emits no CSS** (measured; only 1000/950/900/850/800 exist). On drag-over
  the dashed border falls back to Tailwind's preflight grey, **lighter** than the resting `border-edge-strong`. The same class
  of defect as the `navy-600` the lead found in `avatar.tsx:21-28`. Fixing it moves the drag-over state outside the scope —
  Q16.
- **F2** — ★ `REQ-UIX-003`: «`cancelled` … carry chrome, colour and an icon — never bare text». `SessionStatusBadge` gives a
  glyph to `live` only (`badge.tsx:110`); **cancelled is bare text today**.
- **F3** — `card.tsx:41` and `stat.tsx:33` transition **`box-shadow`**, which `REQ-UIX-020` («transform, opacity and filter
  only») does not allow; and `duration-150` there and at `file-drop.tsx:94` is not a duration token (Q7).
- **F4** — `panel.tsx:7-14`: the status tones' fills are light constants while the text inside is inherited; inside any dark
  context the text turns light on a near-white fill. `impersonation-banner.tsx:33-34, 69` documents it and patches it at the
  call site. Inside the dark scope it is fixed by `pg-dark:` (§2); outside, `.theme-dark` still needs it — reported, not
  touched.
- **F5** — ★ **`src/app/[locale]/app/layout.tsx:30`**: the brand layer emits `--canvas`, and **nothing reads `--canvas`**
  (`bg-canvas` is `var(--bg)`, `globals.css` `@theme inline`; `grep` finds no `var(--canvas)`). An org's canvas override has
  no effect, while `0144_status_contrast_guard.sql` refuses palettes by that canvas. The lead's file; relevant because the
  scope adds a third ground (Q17).
- **D1** — the status table (§3).
- **D2** — avatar shape: a 6 px square (`avatar.tsx:65-68`, the lead's `DEC-110` ruling) against a circle in `04` and both
  prototypes. Same for the chip (`tag-chip.tsx:60-65`) against `04`'s pill.
- **D3** — avatar sizes: `04` names 32/38/40; the type has 24/32/34/40/56/96/160 and no 38.
- **D4** — `01`'s «avatar tints» are six dark hexes; the tree's six are three navy and three light silver.
- **D5** — `01` has one line role at 1.45:1 on ink; a control boundary needs 3:1 (T2).
- **D6** — `04`'s focus ring is accent, and `01`'s light accent is lime: 1.07:1 on paper (T4).
- **D7** — `01`'s team colours «do not remap», but every one fails 3:1 on the light variant's paper (§4).
- **D8** — the sticker's outer rim: `01` `var(--fg)` (bone on dark); `motion-story.html:98` and `stories.html` `.sticker` draw it
  **ink**.
- **D9** — the reaction set: `04` «fire, star, bolt, pin»; `stories.html` draws like + three; the tree's like is a dot.
- **D10** — ★ `03`'s reaction pop is `scale 1 → 1.22 → 1` and the code box `1 → 1.14 → 1`; `DEC-183` §2 reverses the ban on an
  overshoot «up to `1.08` on a sticker **and nowhere else**». If a pop past 1 is an overshoot, 1.22 is five times over the limit
  on a non-sticker. Q6.
- **D11** — `03` gives the pop 260 ms; no token is 260 (base is 220). I use base.
- **D12** — ★ `stories.html`: the **seen** ring and the **upcoming** ring carry the same letter and the same day — only colour and
  opacity differ. `REQ-UIX-040` requires a different label. §5.5 adds the check mark and the 1 px ring.
- **D13** — `04`'s poster block has «a QR placeholder that becomes the real poster QR». A drawn QR that scans to nothing looks
  like a working code. Neither prototype draws one on a card. I leave it out.
- **D14** — the prototypes scale a **rounded** fill (`motion-story.html:143`, `:204`), whose cap squashes; I clip instead (§5.4).
- **D15** — `transform-origin: right` in both prototypes is physical; the tree allows logical only — an exemption, written in
  the file.
- **D16** — `REQ-UIX-032` requires the company's name on the placeholder; `stories.html`'s `.poster` carries category, title and
  date **but no company** — colour is the only channel there.
- **D17** — the live ring pulses on a 1.6 s loop; no token is 1.6 s (T18).
- **D18** — `04`'s stat and the prototypes' numbers are lime (`stories.html` `.stat .n`); a `Stat` with a `tone` is a status
  colour and must stay one. I keep text-strong for untoned values (Q9).

### 9 · Tests — what moves, and what is added

**Existing assertions this plan moves: none** (mechanism C). Every assertion below passes unmodified, and each commit runs the
whole `tests/components/ui/` directory before it lands:

- `avatar.test.tsx:18-60` (initials, `<bdi>`, `img` over initials with `absolute`, name, `aria-hidden`, tint by id),
  `:116-127` (every `TINTS` class resolves to a `--color-*` token) · `badge.test.tsx:38-40`, `:63-70`, `:72-80`, `:82-97`
  (`motion-safe:animate-pulse` on live's dot), `:99-111` (`border` on outline), the contrast tables `:124-159` ·
  `card.test.tsx:62-71` (`hover:shadow-raise`, no `scale`), `:72-86`, `:186-215` (`MEDIA_TINTS`), `:237-248`, `:263-293`
  (`aspect-*`, `grayscale`, `object-contain`, `self-start`) · `panel.test.tsx:16-31` · `progress.test.tsx:14-55` (`width`,
  `animate-pulse`, fills) · `stat.test.tsx:49-55` · `empty-state.test.tsx`, `file-drop.test.tsx`, `tag-chip.test.tsx`
  (behaviour only) · outside my nine, `sessions`' `tests/e2e/wave7-sessions-public-card.spec.ts:107` (`bg-navy-(950|900|800)`
  on `CardMedia`'s dark placeholder). No other test under `tests/` asserts a class my nine emit (searched for every class in
  §2).

**Under mechanism B** (the lead's choice, not mine) the ledger lines would be: `panel.test.tsx:16` (`border-edge`,
`bg-surface`) — and, if the lead also wants `MEDIA_TINTS` or the hover class renamed, `card.test.tsx:69`, `:199`, `:200`,
`:215` and `wave7-sessions-public-card.spec.ts:107`, which is `sessions'` spec and would be a request.

**Added:** new `describe` blocks **appended** to my nine existing files — «inside the scope» (the `pg:` classes present, the
outside class list byte-identical to a snapshot taken before the commit), and for the avatar the ring's three values, the
regex fallback and the tint unchanged by `teamColor`. **Five new files** for the new primitives: every state, the name,
`aria-hidden` / `aria-pressed` / progressbar attributes, the rotation clamp, the pop only on a press, the RTL origin, axe on
each state (colour-contrast off, as the tree does), and numeric contrast tables for the pairs in this plan. Q18 asks whether
appending to an existing file is acceptable or the lead wants separate new files.

### 10 · Order of commits, and the demos

Each commit is one primitive: its file, its tests, its demo `src/app/[locale]/(dev)/ui/demos/<primitive>.tsx` (Arabic,
fixture literals, no DAL, no session, every state; an exported `<Primitive>Demo` for the lead's `page.tsx`), `tsc`, lint
(grepped for `problems`), `npm test`, `ui-lint`. Message `feat(ui): …` / `Refs: REQ-UIX-030, DEC-183`.

1. `tag-chip` · 2. `badge` (+ `SessionStatusBadge`) · 3. `avatar` (with the ring — `REQ-UIX-043`) · 4. `card` ·
5. `progress` · 6. `empty-state` · 7. `stat` · 8. `panel` · 9. `file-drop` · 10. `sticker` · 11. `poster` (needs 4 and 10) ·
12. `reaction-bar` (needs the like glyph and T17) · 13. `progress-bar` · 14. `story-ring` (needs T18 or Q8's static ruling).

**Blocked by:** C1's token commit (T1 in `STATUS.md`) before commit 1; C2's signatures before 3's ring and 10 – 14; L2's glyphs
before 12; F1's face for the display-face rows (they degrade to today's face until it lands).

**Captures** (`.qa-shots/rtl/wave15-content-<primitive>-<state>.png`, 390 px and desktop) and the prototype side-by-side need
the gallery served with `KAREEM_GALLERY=1` and a spec to drive it. **Neither the spec path nor the server is in my edit
list** — Q19.

### 11 · Questions for the lead

1. **Q1** — the mechanism (§0): C (keep every class, add `pg:` / `pg-dark:` / `pg-light:`) — recommended — or A or B. And the
   variant's name and form.
2. **Q2** — T1 – T18: which land in the token commit, under which names.
3. **Q3** — what the scope's new semantic names resolve to **outside** it where there is no «today» (accent, signal, on-fill):
   a new primitive rendered outside the scope must still resolve to something.
4. **Q4** — the status colours (§3): take `01`'s table to the owner, or record that `DEC-073` stands and the badge wears its
   on-dark constants inside the scope (my recommendation). And F2's missing glyph on `cancelled`: whose, and when.
5. **Q5** — the like glyph (a heart with `filled`, or the dot) and the fourth house reaction.
6. **Q6** — is the reaction's `1.22` pop an «overshoot» under `DEC-183` §2's «up to 1.08 on a sticker and nowhere else»? If yes,
   the pop is capped at 1.08 or becomes an opacity acknowledgement.
7. **Q7** — `duration-150` (card, stat, file-drop) and Tailwind's `animate-pulse` 2 s (badge's live dot, progress's
   indeterminate): outside the scope they stay (moving them moves nothing visible at rest, but they are not tokens); inside
   the scope `pg:transition-none` for card/stat/file-drop, and the dot — keep Tailwind's pulse or a token keyframe?
8. **Q8** — the live ring's pulse this wave (T18, a loop token), or the live state static until the moments' wave (fully
   readable by its word and double ring).
9. **Q9** — the face inside the scope on existing primitives: stat's value, empty-state's title, chip's 13 px 700 — yes/no.
10. **Q10** — the 44 px target inside the scope for the chip's (24 px) and the file-drop's (28 px) remove controls by an
    invisible hit area — acceptable, or leave `DEC-123`'s exemption?
11. **Q11** — the badge keeps its 6 px corner inside the scope (the non-colour difference from a sticker)?
12. **Q12** — `AvatarStack` members carry no team colour this wave?
13. **Q13** — a card's hover inside the scope: no shadow; line → line-strong with no transition?
14. **Q14** — `CardMedia`'s generated placeholder stays navy/silver inside the scope (pinned by two suites), with `poster`
    as the scope's session placeholder?
15. **Q15** — team rings on the light variant (1.15 – 2.68:1 on paper): acceptable because the name travels with them, or a
    rim of the text colour inside the ring?
16. **Q16** — F1 (`border-navy-700`): fixed in `file-drop`'s commit (moves the drag-over state outside the scope) or carried?
17. **Q17** — F5 (`--canvas` read by nothing) and whether an org's brand kit reaches **inside** the scope at all.
18. **Q18** — new cases appended to my nine existing test files, or separate new files (not in my edit list today)?
19. **Q19** — captures and the prototype side-by-side: a `tests/e2e/wave15-content-gallery.spec.ts` of mine, run by the lead
    against a `KAREEM_GALLERY=1` build, or the lead captures from the gallery?

---

## Wave 15 — built after sync 1 (`DEC-186`)

**Date:** 2026-09-28. Built in the plan's order, with `avatar` and `progress-bar` pulled forward for `scoring`, one commit
per primitive. Mechanism C, as ruled: **every class that existed stays; the scope's look is added under `pg:` /
`pg-dark:`**. New cases are in new `*-scope.test.tsx` files; **no existing test file was touched and no existing assertion
moved**.

| Primitive | Commit | Demo export | What changes inside the scope |
|---|---|---|---|
| `tag-chip` | `2d2d45b` | `TagChipDemo` (client) | pill on `raised`, 13 px 700; selected `accent` / `on-accent`; remove: 44 px hit area by pseudo-element |
| `badge` | `9ef8bb6` | `BadgeDemo` | `pg-dark:` = today's on-dark forms; `ended` → `ended-on-dark`; filled `info` and the success/error outlines covered too; **6 px corner kept**; no colour added |
| `avatar` | `0b34e89` | `AvatarDemo` | circle; `tint-1..6` + `on-tint` at the same index; **team ring**: `undefined` none · `null` `border-team-neutral` (never reads `--team`) · colour `border-team` + `--team`, re-checked `^#[0-9a-fA-F]{6}$` by the exported `teamColorOrNull()` |
| `progress-bar` (new) | `231254a` | `ProgressBarDemo` | `scaleX` from the inline start (`ltr:origin-left rtl:origin-right`), static; team fill; `decorative`; unnamed and not decorative throws |
| `card` | `3df570e` | `CardDemo` | `rounded-panel`, no shadow, no transition, hover → `border-edge-strong`; body 12 / 16 px; media letterbox `raised`; `MEDIA_TINTS` untouched |
| `progress` | `e96f8b7` | `ProgressDemo` | track `raised`; neutral fill `accent`; status fills on-dark; `width` fill and pulse unchanged |
| `empty-state` | `dd7f651` | `EmptyStateDemo` (client) | `rounded-panel`; title `font-display` 700 |
| `stat` | `cd20ac5` | `StatDemo` | `rounded-panel`; value `font-display` 700; toned values on-dark; linked hover as `card` |
| `panel` | `343250f` | `PanelDemo` | `rounded-panel`; `info` → `raised`; toned → outline form (transparent, on-dark border) in a dark scope |
| `file-drop` | `babf8d9` | `FileDropDemo` | `rounded-panel`, `pg:transition-none`; drag-over `accent` + `raised`; invalid / refused on-dark; chooser pill; row `rounded-input`; remove 44 px hit area |
| ★ `file-drop` repair | `59e15ba` | — | **the one visible change outside the scope** (`DEC-186` §5): drag-over `border-navy-700` (emitted nothing) → `border-fg-heading`. Ledger line requested from the lead |
| `sticker` (new) | `7c2bba2` | `StickerDemo` | six fills by name, ±6° clamp, `shadow-sticker` from `--sticker-ground`, `aria-hidden` unless `informative`; static |
| `poster` (new) | `667fc250` | `PosterDemo` | composes `CardMedia`; artifact ratio when `CardMedia` has it, else whole in 4:5; team-coloured placeholder with the company's name; no QR |
| `reaction-bar` (new) | `cb7dce06` | `ReactionBarDemo` (client) | set from props; named «word count»; `aria-pressed` + filled glyph + stronger border; 44 px; nothing moves; read-only |
| `story-ring` (new) | `fa76d90f` | `StoryRingDemo` | four states, each its own word **and** shape (double ring · accent ring · team ring · 1 px + check); static |
| captures | `6b5caa3d` | — | `tests/e2e/wave15-content-gallery.spec.ts`; every demo root carries `data-demo` |

**Gates at `6b5caa3d`:** `tsc` — my files clean (three errors in `console`'s in-progress admin tests, `AdminCompany.teamColor`);
`eslint` clean on my files; `ui-lint --strict` clean; `tokens-only` green; `npm test` 3174 passed, **1 failed:
`typography-utilities`**, which does not know the `--text-play-*` theme keys (the lead's gate; `playground.tsx`,
`level-card.tsx` and my `poster.tsx` use `text-play-*`, which emits CSS — measured).

**Not done, and why:**
- **Captures** are not taken: the spec needs a `KAREEM_GALLERY=1` build, which is the lead's to run. Nothing is looked at yet.
- ★ **The card's focus ring** (reported to the lead): `card.tsx:52`'s `focus-visible:-outline-offset-2` is in `@layer
  utilities` and every global `:focus-visible` rule is unlayered, so the inset offset never applies and the ring is drawn
  outside a link its `overflow-hidden` article clips — today and in the scope. The fix needs a `--focus-offset` variable
  in `globals.css`; the card's half waits for it.
- **A token request:** the poster's placeholder uses `text-on-sticker` / `bg-on-sticker` for ink on a team colour —
  right value, wrong name. An `on-team` constant would say what it means.
- **Carried, as ruled:** the missing glyph on `cancelled`; `box-shadow` transitions outside the scope; the light variant's
  team ring.

**Design choices the lead did not rule on explicitly, open to reversal:** the display face on `stat`'s value and
`empty-state`'s title; the card's and stat's hover as a border step; `story-ring`'s state word under every ring (the
prototype puts «مباشر» inside the live ring; here the ring holds the letter and the word is always the line beneath).

### Wave 15 — two fixes from the lead's native-resolution review of the gallery

- **`2ae43a10` — a selected chip's count.** Inside the scope a selected chip is the accent, and its count kept the muted
  text: `#a7abbe` on `#c6ff3d`, **1.93:1**. It now adds `pg:text-on-accent pg:font-normal` — ink on the accent, 16.52:1 on
  both grounds, quieter than the label by weight only. The unselected count was checked and left: 7.00:1 dark, about
  5.3:1 light (4.74:1 at its darkest bound).
- **`91bd5c37` — the poster's title.** It was clamped to four 30 px lines at 1.15 with padding inside the clip; in the
  two-column grid at 390 px it was squeezed and cut mid-glyph, with a sliver of the next line under it. ★ **A clamp is
  not safe for Arabic, measured in Chromium with Baloo loaded:** a hidden line's stacked marks (shadda + vowel) leak into
  the last visible line even at 1.6, and `-webkit-line-clamp`'s ellipsis dropped letters from inside a word in RTL
  («يمتد على» → «يم على…»). So nothing is clamped: sizes step by container query (16 / 18 from 11rem / 22 from 14rem /
  30 from 18rem; captions 13 px under 8.5rem); the placeholder has its own 4:5 box that clips nothing, so it **grows**
  for a long title (an aspect-ratio box's content minimum applies only while its overflow is visible); line height
  1.4. 400 placeholders, 144 – 420 px, titles up to about 150 characters: every line whole; ordinary titles grow 5 – 11 px
  only beside a sticker at 150 – 164 px. The gallery spec measures it without `scrollHeight`, which counts Arabic ink
  overflow as scrollable even where nothing clips.
- **Reported, not mine:** `content-panel.tsx:33` (`sessions'`) clamps Arabic body text with `line-clamp-4` — the same
  ellipsis defect.

### Wave 15 — `on-team`, the lead's four rulings, and the card's focus ring

- **`1b59ca0c`** — the poster's ink on a team colour is `text-on-team` / `bg-on-team` (`35a94be0`), not `on-sticker`. Same
  value, its own name; nothing renders differently.
- **Rulings on the open choices (the lead):** `stat`'s value in the display face — stays; `empty-state`'s title in the
  display face — stays, **recorded as open** until the owner aligns it with `page-header` at the first screen; `card` and
  `stat` hover as a border step with no shadow and no transition — approved; `story-ring`'s word under every ring —
  approved.
- **`fbae7d64` — the card's focus ring, inside the scope.** Confirmed by the lead in a browser (`081ffe8c` makes the
  scope's rule read `--focus-offset`) and by me in Chromium: reached by Tab, the link computes `outline-offset: -3px`,
  `outline-width: 3px`, and the ring's outer edge is inside the article's padding box on all four sides, on both grounds.
  Before: `2px`, outside, clipped whole — no ring visible at all. The link also takes `pg:rounded-panel`, so the inset
  ring's corners follow the article's 22 px curve rather than being cut by it. The inert `focus-visible:-outline-offset-2`
  stays. **Outside the scope: not changed, and carried to the owner (SC 2.4.7).**
- **The other thirteen, checked for a focusable control filling a box that clips.** The only `overflow-hidden` boxes in
  my primitives are `card`'s article, `CardMedia`'s box, `avatar`, and the `progress` / `progress-bar` tracks:
  - `avatar`, `progress`, `progress-bar` — hold nothing focusable. The poster's placeholder box clips nothing
    (`91bd5c37`); its image box is `CardMedia`'s.
  - `CardMedia`'s overlay — inset 8 px (`inset-x-2 top-2`). A focusable in it rings 5 px out (3 + 2) inside the
    scope: inside the clip.
  - `CardActions` — in the body, with 12 px (phone) or 16 px of padding: a ring of 5 px stays inside the article.
  - `stat` with `href`, `story-ring`'s button, `reaction-bar`'s pills, `tag-chip`'s link and remove control,
    `file-drop`'s chooser and remove controls, `empty-state`'s action — none sits inside a box that clips; each draws
    the scope's ring 2 px outside itself, unclipped.
  - `badge`, `panel`, `sticker` — nothing focusable.
- ★ **`39a98087` supersedes `fbae7d64`'s mechanism.** The inset outline passed on geometry and was not seen: `CardMedia`
  is a positioned child and paints over its parent's outline, so the top and both sides of the media showed no ring
  (the lead's pixel samples; a stacking context on the link changes nothing — measured). The ring is now the link's
  `::after` while `:focus-visible`: absolute over the card, `z-10` above the media, `pointer-events: none`, the scope's
  ring width and colour, the 22 px corner. One ring: no `--focus-offset` (the link's own outline stays outside and
  clipped), the article draws none, and nothing is set that the card's nested controls inherit. **Lesson: a focus ring
  is proven by pixels, not by geometry** — the gallery spec samples six points inside the edges against the `--ring`
  the scope computes.

---

## Wave 17 — plan (`DEC-199`, M19) — planning only, no code edited

Measured on `wave-17/every-primitive` at `c073ce3b`. Everything below is read from source; nothing was built or
opened in a browser, so §4 is what the source says will happen, not what was seen.

### 1 · The ten demos (N1, contract 3)

**The shape a demo has today** (`(dev)/ui/playground.tsx`): a named export `<Name>Demo` from
`demos/<primitive>.tsx`; its root element carries `data-demo="<primitive>"`; it renders **no scope** (the lead's
`Ground` stands it on both grounds); literals only, Arabic, no DAL, no session, no message catalogue; a Server
Component unless it needs state; it takes `ground: DemoGround` only when it names an `id` or a radio group. The lead
adds `{ file, title, node: () => <XDemo /> }` to `DEMOS` — a function, never an element. Mine follow all of it.

| Demo file | Export | Client? | States shown — from `ui/index.ts` as it stands |
|---|---|---|---|
| `demos/button.tsx` | `ButtonDemo` | no | the six `ButtonVariant`s (`primary`, `secondary`, `ghost`, `danger`, `signal`, `quiet`) × the three `Size`s; `pending` with the label kept, once with `pendingLabel` and once without; `disabled`; `iconStart` and `iconEnd` (a directional chevron, so the mirror is seen); `trailing` (a capacity figure — the split layout inside the scope); a long two-line label at `lg` in a 326 px box (the `min-h-13` case); `className="w-full"`; `ButtonLink` in `primary` and `secondary`, one with `trailing` |
| `demos/icon-button.tsx` | `IconButtonDemo` | no | the six variants at `md`; the three sizes in `ghost`; `pending` (the spinner, name kept); `disabled`; `aria-disabled` (the form `reorderable-list` and the lightbox use) |
| `demos/submit-button.tsx` | `SubmitButtonDemo` | no (it renders a client component with serialisable props) | inside a `<form>` with no action: at rest; `pending` forced by the prop, with `pendingLabel`; `disabled`; a `secondary` one at `md`. `useFormStatus`'s own pending cannot be held still from props — the forced prop is the same render path (`pending ?? status.pending`) |
| `demos/link.tsx` | `LinkDemo` | no | a link in a sentence; `quiet`; a link with a Latin label in an Arabic run (`<bdi>`); a link carrying a caller's class (the breadcrumb's `hover:underline` form); an external one with `target="_blank"`. ★ **The pending dot is not reachable from props** — question Q2 |
| `demos/prose.tsx` | `ProseDemo` | no | `size="md"` and `size="sm"`, each with two paragraphs, an `h2`, an `h3`, a `ul`, an `ol`, a link, a Latin run and a figure inside the Arabic, and a paragraph with full tashkeel (line-height and nothing clipped) |
| `demos/section-header.tsx` | `SectionHeaderDemo` | no | `as="h2"` title only; with `count`; with `description`; with `actions` (a `quiet` button); all four together with a long title that wraps at 390 px; `as="h3"` alone and with `count` |
| `demos/page-header.tsx` (exists, mine this wave) | `PageHeaderDemo` | no | **split**: it keeps `PageHeader` only and gains states — title only; the full form it has now (breadcrumb, eyebrow, status, description, meta chips, actions); a long title beginning with a Latin word; breadcrumb of three with no eyebrow. `SectionHeader` and `Prose` move to their own files. Its stale header comment («the titles keep the face they have») is rewritten |
| `demos/reorderable-list.tsx` | `ReorderableListDemo` | **yes** — its props are functions (`DEC-159`) | the three questions as today (`controls="side"`, `md`); `size="sm"`; `renderActions` (a remove `IconButton`); `controls="inline"` with a card-shaped item placing `context.controls` in its header; `disabled`; a one-item list (both arrows inert). The move itself is pressed in the spec |
| `demos/icons.tsx` | `IconsDemo` | no | every exported glyph, by export name, at the body size (`text-body`) and the display size (`text-play-md`); the prop-driven forms beside the base: `direction` ×4 on the two directional glyphs, `filled` on the four that take it |
| `demos/route-progress.tsx` | `RouteProgressDemo` | yes | ★ **the visible bar is not reachable from props** (`delayMs` only) — question Q3 |

**`icons` enumerates the module, it keeps no list.** `import * as Icons from "@/components/ui/icons"` and
`Object.entries(Icons).filter(([name, v]) => name.endsWith("Icon") && typeof v === "function")`. It survives `tsc` and
the boundary: `(dev)/ui/page.tsx:2` does exactly this today in a Server Component (`icons.tsx` has no `"use client"`),
and `tests/components/ui/icons-playground.test.tsx:61` does the same. Two things enumeration cannot discover, both
additive — a missing entry loses a variant or a caption, never a glyph:
- the props a glyph takes (`direction`, `filled`; `SpinnerIcon`'s required `label`) — a small table keyed by export name;
- the Arabic caption `DEC-079` asks for. `ICON_NAMES` lives in `page.tsx` (the lead's). I would carry it in the demo
  as **captions**, with the export name always shown in a `<bdi dir="ltr">` and the Arabic word beside it when the
  table has one. **Request to the lead:** delete `page.tsx`'s own icons section and `ICON_NAMES` when wiring, so the
  glyphs stand in one place.

**`reorderable-demo.tsx`.** It is outside `demos/`, has no `data-demo` root, and `page.tsx:17` and `playground.tsx`
import it. I create `demos/reorderable-list.tsx` and leave `reorderable-demo.tsx` untouched until the lead has
rewired both imports; then I `rm` it. Nothing breaks in between.

**Titles for `DEMOS`** (the lead's to place): «الزرّ» · «زرّ الأيقونة» · «زرّ الإرسال» · «الرابط» · «النص الطويل» →
«النص المتصل» (since «النص الطويل» is `textarea`'s) · «عنوان القسم» · «عنوان الصفحة» · «الأيقونات» · «شريط التنقّل».

### 2 · The member side's raw palette (N2, contract 4) — every hit

The measurement: `(navy|silver|slate)-NNN`, `white`/`black` after a colour-utility prefix, and `--color-*` inside
brackets, over the twenty-four directories of my edit list. **No hex, no `rgb()`, no `slate-*`, no `*-white`,
no `*-black`.** One `black` is a CSS mask's alpha in `session-settings-strip.tsx:52`, not a colour, and stays.

**A · Raw palette names — 12 classes in 10 files**

| File:line | Class | Role there | Becomes |
|---|---|---|---|
| `app/sessions/[id]/loading.tsx:18` | `bg-navy-950` | the skeleton's copy of the hero's dark band | **fits none** — F1 |
| `app/sessions/[id]/loading.tsx:19` | `[&_.animate-pulse]:bg-navy-800` | recolours the skeleton bars for that band | **fits none** — F1 |
| `s/[id]/page.tsx:138` | `bg-silver-100` | the well behind the card image while it loads | `bg-raised` |
| `verify/[code]/page.tsx:104` | `bg-silver-100` | the revoked notice's fill, at rest | `bg-raised` |
| `components/sessions/event-hero.tsx:77` | `var(--color-navy-950)` and `var(--color-navy-800)` in one `bg-[linear-gradient(…)]` | the hero band's ground on a phone | **fits none** — F2 |
| `components/sessions/action-card.tsx:324` | `bg-silver-100` | a count chip inside a `secondary` button, at rest | `bg-raised` |
| `components/browse/filter-sheet.tsx:120` | `bg-silver-100` | the same chip, inside a `secondary` `sm` button | `bg-raised` |
| `components/event/star-rating.tsx:86` | `hover:bg-silver-100` | a star's hover ground | `hover:bg-hover` |
| `components/notifications/bell.tsx:28` | `hover:bg-silver-100` | the bell link's hover ground | `hover:bg-hover` |
| `components/notifications/preference-matrix.tsx:54` | `bg-silver-100` | the «on» cell — a pressed toggle, at rest | `bg-raised` — but see F5 |
| `components/posters/session-poster.tsx:60` | `bg-silver-100` | the well behind a poster image while it loads | `bg-raised` |

**B · `var(--color-canvas)` in brackets — 3 in 3 files. ★ These are white patches inside the scope, and a regex for
palette names does not find them.** `--color-canvas` is `var(--bg)` resolved at `:root`, so in brackets it stays
`#ffffff` inside the scope — the lead's own dialog finding of wave 15 (`wave15-sessions-gallery.spec.ts:127`).
**Request: `no-raw-palette.test.ts` matches `var(--color-` inside a class too**, or these pass the gate as light patches.

| File:line | Class | Role there | Becomes |
|---|---|---|---|
| `components/browse/filter-sheet.tsx:214` | `bg-[var(--color-canvas)]` | the sticky footer's ground, which must equal the sheet's own | **fits none cleanly** — F3 |
| `components/event/comment-composer.tsx:221` | `bg-[var(--color-canvas)]!` | the mention popup's ground, over `Panel`'s own | **fits none cleanly** — F4 |
| `components/me/tab-strip.tsx:94` | `var(--color-canvas)` as a gradient stop in an arbitrary `[background:…]` | the fade at the strip's end, into the page's ground | **fits none** — F6 |

**C · `.theme-dark` — 2 in 2 files:** `components/sessions/event-hero.tsx:77` and `components/photos/lightbox.tsx:157`.
**D · Nested `<PlayScope>` — 5 in 5 files** (the lead's, M1; listed so the count is on the page):
`app/sessions/[id]/page.tsx:180`, `app/sessions/[id]/check-in/page.tsx:81`, `components/scoring/points-head.tsx:95`,
`member-board.tsx:93`, `company-board.tsx:84`. See Q1 for who removes C.

**E · Context variables in brackets where a utility exists — 12 in 9 files.** Not raw palette: each reads a variable
the scope reassigns, so each renders the playground's value. C4's last row («never a `var()` in brackets for a colour
that has a utility») reads as covering them; **I would rename them only if the lead says they are in the gate.**

| File:line | Class | Would become |
|---|---|---|
| `app/me/calendar/page.tsx:95` | `bg-[var(--btn-bg)] text-[var(--btn-fg)] hover:bg-[var(--btn-bg-hover)]` | `bg-accent text-on-accent` + no hover name in the table — and see §4.6 |
| `components/event/ratings.tsx:79` | the same three | the same |
| `components/notifications/bell.tsx:41` | `bg-[var(--btn-bg)] text-[var(--btn-fg)]` (the unread count) | `bg-accent text-on-accent` |
| `components/me/tab-strip.tsx:71` | `border-[var(--btn-bg)]` (the current tab's underline) | `border-accent` |
| `components/event/comment-composer.tsx:228` | `hover:bg-[var(--btn2-bg-hover)]` | `hover:bg-hover` |
| `components/event/comment-list.tsx:178`, `:207` | `divide-[var(--edge)]`, `border-[var(--edge)]` | `divide-edge`, `border-edge` |
| `app/sessions/[id]/page.tsx:365`, `sessions/session-settings-strip.tsx:101`, `event/star-rating.tsx:91`, `photos/lightbox.tsx:237`, `me/tab-strip.tsx:70` | `outline-[var(--ring)]` | nothing in the table; inside the scope the ring is the scope's one rule (`DEC-186` §2), so these are inert or doubled — left |

**The «fits none» cases**

- **F1 — `loading.tsx:18-19`.** The skeleton mirrors a dark band the hero will no longer have once `.theme-dark`
  leaves. A rename has no right answer (`bg-accent` would paint a lime band); the honest change is **removing both
  classes**, so the skeleton stands on the page's ground with `skeleton`'s own `pg:` colour. That is a removal, not
  a replacement, and it must match whatever F2 becomes.
- **F2 — `event-hero.tsx:77`.** A decorative two-stop gradient; there is no semantic gradient. Options: (a) remove
  the gradient class with `.theme-dark`, the hero standing on the canvas; (b) `bg-surface`, so the band is still a
  band. (a) changes nothing else; (b) keeps a structure the page was built around (the action card's `-mt-4` overlap
  onto the band). **Not mine to pick** — and either way the band's reason is gone (§4.1).
- **F3 — `filter-sheet.tsx:214`.** The class it spells is `bg-canvas`, but `ui/sheet` is `pg:bg-surface` inside the
  scope, so `bg-canvas` draws a darker strip across the sheet's foot. The role is «the sheet's own ground» →
  `bg-surface`. It differs from the literal reading of C4's last row, so it is written here.
- **F4 — `comment-composer.tsx:221`.** `bg-canvas!` is the literal; on the dark ground a popup the colour of the
  page, with `shadow-card` that does not show on ink, has no edge but `Panel`'s hairline. `bg-raised!` is the role
  («floats above»). The lead's.
- **F5 — `preference-matrix.tsx:54`.** `bg-raised` is the table's answer and I would apply it. But the cell is a
  pressed toggle, and C4 also has «a filled, selected mark → `bg-accent text-on-accent`». It was deliberately
  neutral, so `bg-raised`; noted because the «on» and «off» cells then differ by a raised step and a border only.
- **F6 — `tab-strip.tsx:94`.** A gradient stop inside an arbitrary property. Minimal: `var(--color-canvas)` →
  `var(--bg)`, the context variable the scope reassigns — one token, but it is a `var()` in brackets. With
  utilities: `ltr:bg-linear-to-r rtl:bg-linear-to-l from-transparent to-canvas` replacing the arbitrary property and
  its two direction variables — named, and four classes changed instead of one. The lead's.

### 3 · Existing assertions I expect to move

**For N1 and N2 as planned: none.**
- No test pins a class string in any file of §2 (grep of `tests/` for `silver-`, `navy-`, `theme-dark`,
  `color-canvas`, `btn-bg` outside `tests/components/ui/` and the token gates).
- `tests/e2e/wave7-sessions-public-card.spec.ts:107` asserts `/\bbg-navy-(950|900|800)\b/` on the public card's
  placeholder. That class is `ui/card`'s own tint (paired with a `pg:` form, which stays — rule 5), not
  `s/[id]/page.tsx:138`. **It does not move**, and it is why I will not «tidy» `card.tsx`'s tints.
- `tests/e2e/wave15-lead-gallery.spec.ts:179` expects one `[data-demo="page-header"]` per ground and captures it. The
  split keeps the attribute and the count; the capture's content changes (the lead's spec, no assertion).
- The lead's, from M1, for the record: `tests/components/checkin/check-in-screen.test.tsx:143-144` and
  `tests/e2e/wave16-sessions-reserve.spec.ts:189` pin the nested scopes.
- **N3 is unknown until the root scope is in a build**: a primitive fix adds cases to its `-scope` test (new cases,
  the existing test untouched). If one needs an existing assertion changed I name it before the commit.

### 4 · What will look wrong on the dark ground for a reason that is not a class or a primitive — listed, not fixed

1. **`/app/sessions/[id]` — the hero band.** The page is built on a dark band against a light page: the action card
   overlaps it by `-mt-4` / `md:-mt-10`, the desktop poster sits in it. Without `.theme-dark` and the gradient, band
   and page are one ground and the overlap reads as a misplaced card. Its loading skeleton the same.
2. **Ended and cancelled sessions' images** — `grayscale opacity-45` (`s/[id]/page.tsx:138`), `[&_img]:opacity-50
   [&_img]:grayscale` (`event-hero.tsx:91`). Opacity over white washes an image out; over ink it darkens it. «Past»
   will read as «dimmed», a different signal.
3. **Shadows as the only edge.** `shadow-card` on the mention popup (`comment-composer.tsx:221`), and wherever a
   screen separates by shadow: invisible on ink.
4. **Rendered artifacts on the ground** — `/app/me/certificates`, the certificates screen's previews, the poster
   images, `/verify/[code]`: light certificates and posters of any colour sit edge to edge on ink with a hairline.
   Correct by rule 10 (the playground stops at their edge); it will look abrupt.
5. **`/legal/**`** — long prose, ink ground, the display face on headings once `prose` moves: a legal page in the
   game's voice. A design question for its own screen.
6. **Two hand-built buttons** — `app/me/calendar/page.tsx:95` and `components/event/ratings.tsx:79` are anchors with
   a hand-written class string (`h-12 rounded-field bg-[var(--btn-bg)] …`). Inside the scope they take the lime and
   keep the old shape: a rectangle, the body face, no press — beside real pills. The repair is `buttonClass()`, which
   is a class-only change but more than «a raw class replaced». **Asked, not done.**
7. **`/app/me` tab strip** — the current tab's underline becomes the accent (lime), 2 px; whether a tab's selection
   is the accent is `tabs`' design (`console`'s primitive), and this strip is hand-built beside it.
8. **The lightbox** — `DialogContent size="media"` is `bg-[var(--color-navy-950)]` in `ui/dialog` (the lead's);
   without `.theme-dark` its controls take the scope's tokens on a navy that is not the playground's ink.
9. **`preference-matrix`** — see F5: on/off by a raised step.

### 5 · New disagreements with `docs/design/`

1. **`04-components.md:41` — `icons` «shown whole in the gallery».** Two of the glyphs' forms are props, not exports
   (`direction`, `filled`), and «every export» does not show them. The demo shows both; the gate's sentence («every
   export of the file») is narrower than the design's «whole».
2. **`04-components.md:37` — `link`: «the pending dot is the accent».** `route-progress.tsx`'s dot is
   `bg-current opacity-60` today — the link's own colour (`DEC-079`). The lead's file; noted because the demo cannot
   show it either way (Q2).
3. **`04-components.md:36` — `prose`: «headings inside it follow `section-header`».** `prose.tsx:12` sets its `h2` at
   `text-h3` and its `h3` at `text-label`, one step below `section-header`'s `h2`/`h3`. If «follow» means the face
   and not the size, there is no disagreement; the line does not say.
4. **`04-components.md:21` — `toast`/whisper and `:18` «focus ring = 3px accent outline»** are already `DEC-199`
   §5.28; the five member files in §2·E that declare `outline-[var(--ring)]` at 2 px are where it would show.
5. **`00-direction.md:80`** («if a screen reads as a spreadsheet with a lime button on it, the direction has been
   lost») describes what §4 lists, by construction, for this wave. Not a disagreement with `DEC-199` §2 — recorded
   so nobody reads this wave's captures against that line.

### Questions for the lead

- **Q1 — who removes the two `.theme-dark`s on my side?** `DEC-199` §1.3.5 and row M1 say the token move does; my
  agent file says I do, «the same way». `event-hero.tsx:77` carries F2 on the same line. Default I will follow:
  **the lead's M1 removes both; I touch neither.**
- **Q2 — the link's pending dot.** `LinkPendingReporter` draws it only while a real navigation is pending. The demo
  cannot show it without copying its classes, which would drift. Either the lead exports the dot as a presentational
  piece, or it is shown by the spec alone (a navigation stalled with `page.route`). Default: the spec.
- **Q3 — `route-progress`.** The same, and more: the bar is `fixed` at the viewport's top, so it is outside any
  demo's box, and a demo on two grounds mounts two bars reading one store. Default: the demo mounts one real
  `<RouteProgress delayMs={0} />` beside a house `Link`, says what it is, and the spec stalls a navigation and
  captures the viewport's top edge. A presentational `bar` export would make it a demo in the ordinary sense.
- **Q4 — is §2·E in the gate?** If `no-raw-palette` counts context variables in brackets, I rename them as the
  table says; if not, I leave them.
- **Q5 — F1 to F6**, each a ruling.

### Wave 17 — sync 1's rulings, N1 and N4

- **Rulings (the lead, sync 1):** both `.theme-dark`s, F1 and F2 are the lead's in M1 — the hero band and its skeleton
  become `bg-surface`; I touch neither `event-hero.tsx` nor `loading.tsx`. F3 `bg-surface` · F4 `bg-raised!` · F5
  `bg-raised` · F6 `var(--color-canvas)` → `var(--bg)`. §2·E is **not** in the gate and stays, except the two hand-built
  buttons (`me/calendar/page.tsx:95`, `event/ratings.tsx:79`), whose class string becomes `buttonClass("primary", "lg")`
  — class only, part of N2. §2·B **is** in the gate. The pending dot and the route bar are the spec's. «Follow» in
  `04-components.md:36` means the face, not the size.
- **N1 — `eec8d654`.** The ten demos, as planned. `RouteProgressDemo` takes `ground` and mounts the one real bar on the
  dark ground only: both grounds read one store. `IconsDemo` reads `import * as Icons`, carries the Arabic captions and
  the prop forms as two additive tables, and marks itself `data-count` and each cell `data-glyph`. Wiring is the lead's;
  `reorderable-demo.tsx` stays until both imports are off it.
- **N4 — `tests/e2e/wave17-content-gallery.spec.ts`. ★ Written, never run** — it needs a build with `KAREEM_GALLERY=1`
  and the demos wired, both the lead's. What it does: each of the twenty-four demos on both grounds at 390 px and
  desktop; every glyph paints at two sizes and is named; a press alone moves a row (`DEC-093`); and a navigation
  stalled at the network draws the link's dot and the route bar. **The least certain case is the last**: it assumes
  `useLinkStatus` reports pending for a navigation to the same path with a different query, and that holding the
  prefetch holds the navigation. If it does not go pending, the link's target is what to change, not the assertion.
- **N2 — the member side's raw palette, a class at a time.** Twelve files, nothing but the class in each: six
  `bg-silver-100` at rest → `bg-raised`; two on hover → `hover:bg-hover`; the sheet's footer → `bg-surface` (F3); the
  mention popup → `bg-raised!` (F4); the tab strip's fade → `var(--bg)` (F6); the two hand-built buttons →
  `buttonClass()` with its import. ★ **`ratings.tsx`'s is `"md"`, not the ruled `"lg"`**: it was `h-11`, and `lg` would
  have grown it to 52 px inside the scope — a size change, which the ruling's own «class only» excludes. The calendar's
  was `h-12 px-7`, which is `lg` exactly. **One entry left on my side of the gate and it is not mine:**
  `lib/ui/confetti.ts: var(--color-play-lime) var(--color-play-bone)` — the lead's file, and the playground's own tokens.

### Wave 17 — N3: my fourteen on the real screens, on the dark ground

Read from the lead's sweep captures (`.qa-shots/rtl/wave11-sweep-*`, production build of `abb1b8d9`), cropped into
1082 × 1100 bands at native size, never downscaled: `/app`, `/app/sessions/[id]` (+ check-in, rate, materials viewer),
`/app/me` and its six tabs, `/app/leaderboards`, `/app/propose` and `[id]`, `/s/[id]`, `/verify/[code]`, `/legal/privacy`.

**Seen and right:** `badge` (open, draft, the material's phase), `tag-chip` (the hero's four, the card's one), `avatar`
(the shell's and the 96 px one on privacy), `progress` (the capacity track at 0), `empty-state` (bookmarks,
certificates, calendar, rate, leaderboards), `stat` (`/app/me`), `panel` (the profile prompt, the catalogue rows, the
check-in notice, the preferences), `file-drop` (the proposal's dashed zone), `card` (the timeline's, the public one).
**Not on any captured screen**, so not seen outside the gallery: `sticker`, `poster`, `reaction-bar`, `progress-bar`,
`story-ring` (no screen places them yet, or the fixture had no data for the five moment surfaces).

**One defect, fixed in the primitive:** `card`'s typographic placeholder. Three of `MEDIA_TINTS` are silver
(`bg-silver-200/300/400 text-navy-950`) and had no form inside the scope — a light block on the dark ground for half of
all titles; the three navy ones are about 1:1 against the scope's surface (visible in the capture as a box with no
edge). Inside the scope every placeholder is now `pg:bg-raised pg:text-fg-heading`; the tint is still chosen and still
in the class, so `card.test.tsx` and `wave7-sessions-public-card.spec.ts:107` hold. A case in `card-scope.test.tsx`.
The fixture's one session hashed to navy, so the silver patch itself was read from the source, not seen.

**Seen, not mine, not fixed** (added to §4's list):
10. `/app` — the timeline card's media column ends above the card's foot; the strip under it is the card's surface.
    Geometry, the same on any ground — the row density's layout, for the screen's rebuild.
11. `/app/sessions/[id]` — the action card is the page's ink on the `bg-surface` band, a dark card on a lighter band,
    the reverse of every other card on the app. And the material row's «فتح العارض» reads as plain text: no underline,
    no button.
12. `/app/me` — an unchecked `checkbox` is a flat grey square, the browser's dark-scheme default showing through
    (`sessions'` primitive, the lead's custody). The native `select` arrow likewise.
13. `/app/sessions/[id]/materials/[id]` — the viewer's page box shows the browser's broken-image glyph in its corner
    (the fixture has no rendered page); on ink it is the brightest thing on the screen. A missing page has no state.
14. Empty lists are drawn two ways on one hub: `empty-state` (an outline on the ground, display face) on bookmarks,
    certificates and calendar; a `panel` with muted body text on notifications.
15. Disabled primaries («نشر», «رفع») are the lime at 45 % — an olive pill that still reads as the brightest control.
16. `/verify/[code]` and `/legal/**` have no `page-header` look: the title is the body face, while every `/app` title
    is the display face.

### Wave 17 — the stalled-navigation case at desktop (for the lead; ★ the fix is NOT run)

- **What failed:** `expect(bar).toHaveCount(1)` at 1280 px — 0 elements for five seconds — after the dot had been seen.
  («Phone passes» is a skip: the spec runs both widths in the desktop project.) It passed at 390 px.
- **What I read, and did not see:** dot and bar hang on one `pending`. For the dot to be seen once and the bar never,
  pending rose and fell inside one poll: the navigation was answered without the held request. The spec held only
  URLs matching `from=route-progress`. The gallery is a static page, and other demos (`link`, `button`'s `ButtonLink`s,
  `page-header`'s breadcrumbs) link to `/ui`; at 1280 px several stand in the viewport beside the route-progress demo,
  so their prefetch of the same route passed the filter and the click was served from that cache. At 390 px none
  shares the viewport. **This is an inference from the code and from which width fails — no trace was opened.**
- **The fix (spec only):** every `fetch`/`xhr` is held from before the page opens until the captures are taken, so no
  prefetch of any URL can answer the click; the bar is asserted before the dot, so a failure names the right thing.
  `tsc` and eslint clean.
- **If it still fails at desktop, I need the trace**, and two facts from it: whether `[data-link-pending]` is in the
  DOM at the failure, and the URL the page is at. If the dot is present and the bar is not, the defect is in
  `ui/route-progress` (the lead's) and not in the spec: the store's count and the dot would then disagree.
- **The primitive, read again and found right:** the dot is drawn iff `pending && !quiet`; the count rises in the same
  commit's effect; `RouteProgress` re-renders through `useSyncExternalStore` and its 0 ms timer sets `elapsed`.

---

## Wave 18 — plan (`DEC-205`, `DEC-206`, M20, PR A) — planning only, no code edited

**Rows:** N1 (`SCR-010`, `REQ-UIX-055`, `STORY-UIX-044`) · N2 (`feed-item`, `attendee-stack`, `card`'s `post`,
`REQ-UIX-057`). **Read:** the agent file, `STATUS.md`'s wave-18 block, `DEC-205`, `DEC-206`, `M10a.md`,
`Home.dc.html`, `HomeDesktop.dc.html`, `EventLive.dc.html:44`, `EventDesktop.dc.html:99-102`, `app/page.tsx`,
`card` · `avatar` · `story-ring` · `reaction-bar` · `poster` with their types, `dal/photos.ts`, `dal/search.ts`,
`browse/timeline-session.ts`, `dal/points.ts`, `dal/leaderboards.ts`, `dal/admin-dashboard.ts`, `dal/reactions.ts`.
**Nothing is built before «the frame is in at `<sha>`».** Answers are numbered as sync 1's six questions.

### 1 · The regions, in the artboard's order, and the primitive each is built from

**Phone (`Home.dc.html`, 390).** The top row and the tab bar are the frame's (contract 1) and the page draws neither.

| # | Region (artboard line) | Built from | Who |
|---|---|---|---|
| 0 | page title — **not drawn** | an `sr-only` `<h1>` «الرئيسية» (the artboard has no heading; the a11y sweep needs one) | `content` |
| 1 | the ring row (`:27-33`) | `story-ring` ×N in a horizontally scrolling list, **no `onOpen`** | `content` |
| 2 | the no-company banner — not drawn | `panel` inside a `role="status"` wrapper, `app.home.companyMissing` + «أكمل ملفك» | `content` |
| 3 | the week card (`:35-42`) — rank · streak · points tiles, the level bar and «بقي N لمستوى …» | `week-hud` (three `stat` tiles + `progress-bar`) | `scoring`'s component, placed by `content` |
| 4 | «يحتاج انتباهك» — not drawn | `panel` with count links | `content`, from the lead's counts |
| 5 | date heading «اليوم» (`:44`) | `section-header` as an `<h2>` | `content` |
| 6 | session post, live (`:45-65`) | `card` `density="post"` › presenter row: `avatar` (`teamColor`) + name + company + venue · time + `SessionStatusBadge` › `poster` whole › `reaction-bar` (like) + comment-count link + share + bookmark › `session-cta` as a **link** | `content`, from `sessions'` DTO |
| 7 | «سباق الشركات» (`:67-72`) — once, after the first date group | `race-bar` ×3 (top 2 + own) in a `card` | `scoring`'s component, placed by `content` |
| 8 | date heading, then a session post, open (`:74-93`) | as 6; the seats line in place of share/bookmark as drawn | `content` |
| 9 | achievement (`:95-99`) | `feed-item` `variant="achievement"` — **no reaction** (§4.53) | `content`, from `scoring`'s DTO |
| 10 | announcement (`:101-104`) | `feed-item` `variant="announcement"` | `content`, from `0164` |
| 11 | date heading «أمس», the recap (`:106-118`) | `feed-item` `variant="recap"`: head, three photo tiles, `reaction-bar` (like), the materials **link** | `content` |
| 12 | the propose band (`:120-123`) | `panel` + `ButtonLink` to `/app/propose` | `content` |

**Desktop (`HomeDesktop.dc.html`, 1280).** The bar and the navigation rail are the frame's. The content column
(600 px) is regions 0 – 2, 5, 6, 8 – 12 in the same order. **Regions 3 and 7 leave the column** and become the game
rail's cards, with «التالية لك» (`:99-123`): rank · streak + points · the race (four bars) · «التالية لك».

- The post lays the poster beside the copy by a **container query on the card**, not a viewport breakpoint: the
  column is 600 px at `lg` and ~358 px on a phone, and `poster.tsx` already sizes by `@container`.
- ★ The artboard draws **two** desktop posts: the live one with a header row above and a 260 × 325 poster
  (`:51-79`), the open one with a 160 × 200 poster and the presenter row inside the copy (`:82-91`). `M10a.md` §5
  names only «260 px». **I build both as drawn**: live → 260 with the head above; every other phase → 160.
- The desktop live post adds the title as text, an abstract excerpt and the live attendance figure («23 من 40
  حاضرًا الآن», `:66`) — the COUNT of §4.54, never a stack. On the phone the title is on the poster only, so a post
  carries an `<h3>` that is `sr-only` below the container breakpoint and visible above it.
- The desktop artboard is clipped at 1040 px: **no achievement, recap or propose band is drawn at 1280.** I build
  them in the column as on the phone; there is no drawing to hold them beside (the same case as §4.36).

**The slot I need (contract 1).** A layout cannot take a prop from a page, so I need one of:

```ts
// (a) preferred — a frame component the PAGE renders; the layout keeps the bars and the navigation rail.
export function PageFrame(props: { rail?: React.ReactNode; children: React.ReactNode }): React.JSX.Element;
// (b) a parallel route: src/app/[locale]/app/@rail/{page,default,loading}.tsx — then those files are in my list.
```

What I pass is **a fragment of two parts**: `scoring`'s rail component (rank · streak + points · race) and my
`<UpNext>` card. What I need to know of the slot: (1) it is `display: none` below `lg`, not unmounted by JS; (2) it
is sticky and 340 px; (3) the content column's width is the frame's, so the page sets no `max-w-*`; (4) the rail
may suspend on its own (`<Suspense>` inside what I pass) without holding the feed; (5) `loading.tsx` renders the
same frame, so I can pass a rail skeleton.

★ **An open point for `scoring` and the lead, not mine to settle:** the week exists twice in the DOM — the phone's
`week-hud` in the column (hidden from `lg`) and the rail's cards (hidden below `lg`). Both mount. Moments 3 and 5
are keyed once per occurrence, so **the hidden twin must not play or write the mark**. I place the two components;
the proof is `scoring`'s.

### 2 · The new primitives' props, and `card`'s `post`

All three are `content`'s files; each renders every state from props, reads no data and no catalogue, declares no
keyframe, and carries `pg:` classes only over semantic names. A colour from data arrives as `--team`.

```ts
// ── feed-item.tsx — REQ-UIX-057. One <article>; three variants. Server Component (no state, no handler).
interface FeedItemBase extends Styleable {
  /** Pre-formatted by the caller, Western digits — «قبل ساعتين», «أمس». */
  time: string;
}

export interface FeedItemAchievementProps extends FeedItemBase {
  variant: "achievement";
  /** The glyph in the tile — a badge's star, the streak's flame. From `ui/icons`. */
  icon: ReactNode;
  /** The sentence, composed by the caller with `t.rich`: the member's name is a link inside <bdi>. */
  children: ReactNode;
  /** The member's company, drawn before the time — «أيك». Null draws the time alone. */
  context?: string | null;
  // ★ No reaction slot, by design (DEC-206 §4.53).
}

export interface FeedItemAnnouncementProps extends FeedItemBase {
  variant: "announcement";
  /** «إعلان من الإدارة» — the visible source line; the megaphone glyph is the primitive's. */
  sourceLabel: string;
  /** Plain text. Drawn in <bdi dir="auto">, whole, never clamped. */
  body: string;
  // ★ No author, no action, no reaction (REQ-UIX-056).
}

export interface FeedItemRecapProps extends FeedItemBase {
  variant: "recap";
  /** The session's title, the link's text. */
  title: string;
  href: string;
  /** «اكتملت» — a word, not a status badge. */
  doneLabel: string;
  /** Composed by the caller — «محمد الدوسري، جذر · 28 حاضرًا، 3 صور». Parts it cannot read are left out. */
  meta: ReactNode;
  /** At most three; more are ignored. Empty draws no strip. */
  photos: { src: string; alt: string; width?: number | null; height?: number | null }[];
  /** The row under the strip: the caller's <ReactionBar>. */
  reactions?: ReactNode;
  /** «حمّل المواد» — a LINK to the session's materials, never a download (§4.55). Absent → not drawn. */
  materials?: { href: string; label: string } | null;
}

export type FeedItemProps = FeedItemAchievementProps | FeedItemAnnouncementProps | FeedItemRecapProps;

// ── attendee-stack.tsx — REQ-UIX-057. It draws who it is GIVEN; it never decides who may be seen.
export interface AttendeeStackProps extends Styleable {
  /** Only the people a viewer RLS already answers for. May be empty: the count line stands alone. */
  people: { memberId: string; displayName: string | null; src?: string | null; teamColor?: string | null }[];
  /** How many faces at most. Default 4 (3 on the live card as drawn). */
  max?: number;
  /** The count IN WORDS, all six ICU forms built by the caller — «12 محجوزًا». Always drawn, always text. */
  countLabel: string;
  /** The group's accessible name — «من يحضر». */
  label: string;
  size?: 24 | 32;
}

// ── card.tsx — add-only.
export type CardDensity = "grid" | "row" | "compact" | "wide" | "post";
```

- **`card` `density="post"`**: a column with the scope's 12 px padding and a 10 px gap, the card a `@container`, no
  media-width rule, **and `href` ignored** — a post holds four links and two buttons, and one wrapping link would
  nest interactives. The four existing densities render byte-identically; `card.test.tsx` and `card-scope.test.tsx`
  pass untouched. New cases go in `card-post-scope.test.tsx`.
- **`attendee-stack` beside `AvatarStack` (§4.78).** They differ in three ways, so **both stand and the old one is
  not rewritten this wave**: (1) `AvatarStack` draws no team ring, by `DEC-186` §5, and `attendee-stack` rings each
  face with `teamColor` — `null` the neutral ring, never «no ring»; (2) `AvatarStack`'s overflow is «+N» beside the
  faces and optional, `attendee-stack`'s count is a required sentence; (3) `AvatarStack` is a bare `<span>`,
  `attendee-stack` is a named group. `attendee-stack` composes `Avatar` directly (`decorative`, the names are in the
  group's own list for a screen reader). **Could the old one be the new one's inside?** Not without changing what
  `AvatarStack`'s call sites render (the ring, the separator), which rule 10 forbids. The reverse is possible later:
  `AvatarStack` as `attendee-stack` with no rings and no label, in the wave that may move its call sites.
- ★ **`attendee-stack` has no consumer in PR A.** Neither home artboard draws a stack; the two that do are
  `EventLive.dc.html:44` and `EventDesktop.dc.html:101`, both PR B. It ships in A with its demo and scope test.
- **Demos:** `demos/feed-item.tsx` (three variants; a recap with 0, 1 and 3 photos, with and without materials; a
  long announcement), `demos/attendee-stack.tsx` (0 people with a count, 1, 4, more than `max`, a `null` team colour),
  and a `post` entry added to `demos/card.tsx`.

### 3 · The states `M10a.md` §5 names that are not drawn

| State | How it is built |
|---|---|
| **Empty feed** (new org; §4.60) | no dated item at all → the column is the org's sessions as a date-grouped list of `card` `density="row"` from the same DTO, then `empty-state` inviting a proposal when there are none either. The ring row is absent, not an empty strip. The propose band stays |
| **No company set** | region 2: `panel` in a `role="status"` wrapper (the accessible shape `session.spec.ts:94` reads today), above the week. A post's control is `session-cta` `{ kind: "none", reason }` with the reason in words — `sessions'` DTO says so, the feed does not decide |
| **Staff strip** | region 4, staff only: each non-zero count a link to its queue; all zero → not drawn. A member's page never calls the function |
| **Opted out of leaderboards** | the week's rank tile is an absence (`week-hud`, `scoring`); the rail's rank card is not drawn; the member is nobody's achievement — `scoring`'s DAL honours it, the feed adds no filter |
| **Streaks off** | the streak tile and the rail's streak half are absent (`scoring`); no streak achievement arrives |
| **No poster** | `poster` with no `src`: the team-coloured placeholder, title balanced, the computed amount as its `sticker` when the rule pays more than 0 (§4.46). A rendered poster gets no sticker |
| **Cancelled session** | the post stays in its day with the cancelled badge, `poster` dimmed, **no control and no reaction bar**; it draws no ring |
| **Waitlisted member** (`STORY-UIX-044`) | the control is `session-cta` `booked` with `hold: "waitlist"` as a link; the waitlist's status tone, never cyan (§4.62) |
| **Multi-day session** — named nowhere | the post's time line is `sessions'` day label (range + «3 أيام»); it stands in the day of its live or next day |
| **Ended, no recap material** | a recap with no photos draws no strip; with no material, no «حمّل المواد»; with neither it is the head and the like |
| **Loading** | `app/loading.tsx`: `skeleton`s in the feed's own shape — five ring discs, the week card's three tiles, two post blocks (head row, a 4:5 box, a pill row). No text, no `getTranslations` |
| **Error** | `app/error.tsx` stays `RouteBoundary` → `RouteError`. **Inside the page each source fails alone**: a failed recap photo read, achievements read or announcements read drops that source and the feed renders; only the session posts failing throws to the boundary |
| **A ring's reduced/assistive form** | every ring is its word and its shape (the primitive); see §6.3 for the button |

### 4 · The read model

**`src/lib/dal/feed.ts`** — `import "server-only"`, `requireSession()` first (through `sessionClient`), DTOs out.

```ts
import "server-only";

/** `seen` is never produced this wave (DEC-206 §1.5). */
export type FeedRingState = "live" | "upcoming" | "recap";

export interface FeedRing {
  sessionId: string;
  title: string;
  state: FeedRingState;
  /** The day the caption names — the live or next day's start, or the ended day's end. */
  at: string;
  timeZone: string;
  /** The presenter's company, for the glyph and an upcoming ring's colour. */
  companyName: string | null;
  teamColor: string | null;
}

export interface FeedRecap {
  session: FeedSessionPost;          // sessions' DTO (contract 3), phase "ended"
  attendedCount: number | null;      // the lead's definer (D2); null when it answers nothing
  photoCount: number;
  photos: RecapPhoto[];              // at most 3
  hasMaterials: boolean;
}

export interface FeedAnnouncement {
  id: string;
  body: string;
  publishedAt: string;
}

export type FeedItem =
  | { kind: "session"; key: string; at: string; post: FeedSessionPost }
  | { kind: "recap"; key: string; at: string; recap: FeedRecap }
  | { kind: "achievement"; key: string; at: string; achievement: FeedAchievement }   // scoring's DTO (contract 4)
  | { kind: "announcement"; key: string; at: string; announcement: FeedAnnouncement };

export interface FeedGroup {
  /** The org-zone calendar day, `YYYY-MM-DD`. */
  day: string;
  relative: "today" | "tomorrow" | "yesterday" | null;
  items: FeedItem[];
}

export interface Feed {
  viewer: { memberId: string; isStaff: boolean; hasCompany: boolean };
  rings: FeedRing[];
  groups: FeedGroup[];
  /** Only when `groups` is empty: the org's sessions for the inline list (§4.60). */
  fallback: FeedSessionPost[];
  /** «التالية لك» — sessions' DTO, passed through for the rail. */
  upNext: FeedUpNext[];
  /** Staff only; null for a member (the lead's function is not called). */
  attention: AttentionCount[] | null;
  timeZone: string;
}

export const getFeed: (locale: string) => Promise<Feed>;   // React `cache()`d
```

`src/lib/dal/photos.ts`, **add-only**:

```ts
export interface RecapPhoto { id: string; url: string; width: number | null; height: number | null }
/** Per session: the visible-photo count and its newest three, signed. `photos_read` is the whole rule. */
export async function getRecapPhotos(locale: string, sessionIds: string[]): Promise<Map<string, { count: number; photos: RecapPhoto[] }>>;
```

Three signs per recap, never one per photo of the album; ordered by `created_at desc, id desc` — a display order
with a tiebreak, not «the last row». `hasMaterials` is one `materials` count through RLS inside `feed.ts` (my
track's table; `materials.ts` is frozen and is not edited).

**The merge — pure, in `src/components/feed/feed-merge.ts`** (no `server-only`, so `tests/unit/feed-merge.test.ts`
drives it with a fixed `now`):

1. Each item gets its `at`: a session post → the start of its live day, else its next day, else `starts_at`; a
   recap → the end of its last day; an achievement → its award time; an announcement → `published_at`.
2. `day` is `at` on the **org's** clock. Groups order: **today · future days ascending · past days descending** —
   the artboard's اليوم › الخميس 2 أكتوبر › أمس.
3. Inside a day: **committed first** (a live post the member holds a seat on, then any confirmed seat, then a
   waitlist place), then session posts by start time, then recaps, then announcements, then achievements, each by
   `at`; the final tiebreak is `key`, so two rows written in one transaction never swap between renders.
4. A session is a post **or** a recap, never both: `phase === "ended"` → recap; `cancelled` stays a post.
5. Bounds, so the page is one screen's worth: achievements of the last 7 days, 10 at most; announcements published
   and unexpired, 5 at most; the session window is `sessions'` (below).

**Ring states (`src/components/feed/ring-state.ts`, pure; `DEC-206` §1.5).** From the post's `phase`, `state` and
`days` — the same `DayWindow[]` `session-status.ts` reads, per day for a multi-day session:

- `cancelled` → **no ring**. · `phase === "live"` → `live`.
- else a day with `start − 24 h ≤ now < start` → `upcoming`. · else a day with `end < now ≤ end + 24 h` → `recap`.
- else no ring. `seen` is never returned.

Order: live · upcoming by start ascending · recap by end descending. «Live» is `sessionPhase()`'s, clock included
(`REQ-UIX-003`), not the stored `in_progress` `05-stories.md:38` names. The ring gets `state`, `label` (the
session's name and its state in words), `stateLabel`, `glyph` (the first letter of the presenter's company, else
the title's by `card`'s placeholder rule), `caption` (الآن · the weekday · أمس), `teamColor` — **and no `onOpen`**.

**What I expect from `sessions` (contract 3) — their names win; this is the shape the post draws.**

```ts
export interface FeedSessionPost {
  id: string; title: string;
  /** One or two sentences for the desktop copy; null when the session has none. */
  excerpt: string | null;
  state: SessionState; phase: SessionPhase;
  startsAt: string | null; endsAt: string | null; days: readonly DayWindow[]; timeZone: string;
  venueName: string | null; categoryName: string | null;
  presenter: { memberId: string; displayName: string | null; avatarUrl: string | null; companyName: string | null; teamColor: string | null } | null;
  poster: { url: string; width: number; height: number } | null;
  capacity: number | null; confirmedCount: number; waitlistCount: number; seat: SeatState;
  /** Live or ended only — the lead's count function; null otherwise. */
  attendedCount: number | null;
  likeCount: number; likedByMe: boolean; commentCount: number; bookmarked: boolean;
  mine: "confirmed" | "waitlisted" | null; attended: boolean;
  /** The scoring rule's amount for attending. Null when the rule is off or pays 0 — a «+0» is never drawn. */
  attendancePoints: number | null;
  /** The matrix's answer, as a LINK target (§4.57). */
  cta:
    | { kind: "reserve" | "waitlist"; href: string }
    | { kind: "booked"; hold: "seat" | "waitlist"; href: string }
    | { kind: "checkIn"; href: string; reserved: boolean }
    | { kind: "rate"; href: string }
    | { kind: "none"; reason: string | null };   // cancelled → null: nothing drawn; otherwise the reason's message key
}
export interface FeedUpNext { id: string; title: string; startsAt: string; timeZone: string; status: "confirmed" | "waitlisted"; waitlistPosition: number | null; posterUrl: string | null; teamColor: string | null }
export async function getFeedSessions(locale: string): Promise<{ posts: FeedSessionPost[]; upNext: FeedUpNext[]; timeZone: string }>;
```

The window I ask for: live and open sessions starting within 14 days (10 at most), ended within 7 days (5 at
most), cancelled ones whose start is inside either. **Two requests:** `session-cta` needs a `rate` state with an
`href` act, and the «مقعدك محجوز» pill on `checkIn` (`chip`) — both are `sessions'` additions to their primitive.
The like is written by `toggleReaction(locale, { sessionId }, "like")`, which exists; the feed's action lives in
`src/components/feed/actions.ts` and binds it (`DEC-159`).

**What I expect from `scoring` (contract 4).**

```ts
export interface FeedAchievement {
  id: string; kind: "badge" | "streak"; at: string;
  member: { memberId: string; displayName: string; companyName: string | null };
  badgeName?: string; streakMonths?: number;
}
export async function getFeedAchievements(locale: string, since: string, limit: number): Promise<FeedAchievement[]>; // opt-out honoured inside
```

And **three components**, each reading its own DAL behind its own `<Suspense>`, so the feed never waits on the
week: the phone's week (`week-hud` with moments 3 and 5), the rail's cards (rank · streak + points · race), and the
race widget for the phone's column. The feed calls only the achievements function. If `scoring` would rather hand
DTOs for me to compose, I need the week and the race as types instead — either works; the moments decide it.

**What I need from the lead.**

- **`feed_announcements`**: `id, org_id, author_id, body, published_at, expires_at` is enough — the item draws the
  body and the time, never the author. Two questions, no new column: (1) **is `published_at` nullable, and does the
  member policy say `published_at <= now()`?** An admin reads every row, so `feed.ts` applies the same predicate
  itself — an admin's own home must not show a draft or an expired row; (2) **a length check on `body`** (I suggest
  1 – 500 characters): the item never clamps a text line, so the table is where a wall of text is refused.
  An index on `(org_id, published_at desc)`.
- **The staff strip**: `AttentionCount = { key: "proposals" | "sessions" | "commentReports" | "photoReports"; count:
  number; href: string }` and a function returning `AttentionCount[] | null` — ★ **`null` for a member, never
  `notFound()`**: `requireStaffSession()` 404s a member, and the home would 404 with it.
- **The attendance count** (D2) reaches me inside `sessions'` post; if it is mine to call, the function's name.

### 5 · Files, and every existing assertion that moves

**Replace** (nothing of today's survives): `src/app/[locale]/app/page.tsx` · `src/app/[locale]/app/loading.tsx`.
**Keep as is:** `src/app/[locale]/app/error.tsx` (it is already `RouteBoundary`; rebuilt means no change is owed).
**Delete:** nothing. `SessionsTimeline` and `TimelineSkeleton` stay `sessions'`; `/app` stops importing them.

**Create:**
- `src/lib/dal/feed.ts`
- `src/components/feed/`: `feed.tsx` · `ring-row.tsx` · `session-post.tsx` · `recap-post.tsx` · `achievement.tsx` ·
  `announcement.tsx` · `staff-strip.tsx` · `company-banner.tsx` · `propose-band.tsx` · `up-next.tsx` ·
  `empty-feed.tsx` · `feed-skeleton.tsx` · `like-button.tsx` (client) · `actions.ts` (`"use server"`, async
  functions only) · `feed-merge.ts` · `ring-state.ts` · `relative-day.ts`
- `src/messages/ar/feed.json`, then `src/messages/en/feed.json`, with the line in `src/messages/index.ts` by append,
  one commit. Top-level key `feed` (no namespace holds one today)
- `src/components/ui/feed-item.tsx` · `src/components/ui/attendee-stack.tsx`
- `src/app/[locale]/(dev)/ui/demos/{feed-item,attendee-stack}.tsx`
- `tests/components/ui/{feed-item,attendee-stack}.test.tsx` · `{feed-item,attendee-stack}-scope.test.tsx` ·
  `card-post-scope.test.tsx`
- `tests/unit/feed-merge.test.ts` · `tests/unit/feed-ring-state.test.ts` · `tests/components/feed/*.test.tsx`
- `tests/e2e/wave18-content-home.spec.ts` — every locator from `#main`; captures at
  `wave18-content-home-<state>-<390|1280>.png` honouring `E2E_SHOTS_DIR`

**Edit, add-only:** `src/components/ui/card.tsx` (`post`) · `src/lib/dal/photos.ts` (`getRecapPhotos`) ·
`src/app/[locale]/(dev)/ui/demos/card.tsx` (one entry).

**Existing assertions.** Found by `goto`/`toHaveURL` on `/app` exactly; a landing reached by a click or a sign-in
redirect was not enumerated. None of these files is mine — each is a line for its writer and for the ledger.

| Spec | What it asserts on `/app` | Moves? |
|---|---|---|
| `timeline.spec.ts:147` «/app IS the timeline…» | h1 «الجلسات», first `article` «التالية لك», region «هذا الأسبوع» | **expectation** — the test's premise is withdrawn by `REQ-UIX-055`; `sessions'` |
| `timeline.spec.ts:171` «a filter applied on /app…» | the filter navigation on `/app` | **expectation** — `/app` has no filter; `sessions'` |
| `timeline.spec.ts:183` «the empty case is the same screen» | h1 «الجلسات», «لا جلسات قادمة بعد», «اقترح موضوعًا», the filter nav | **expectation** — the empty home is §4.60's; `sessions'` |
| `session.spec.ts:88` | h1 `toHaveText("الجلسات")`; `role="status"` contains «اختر شركتك» | **expectation** for the h1 (→ «الرئيسية»); the status line **holds** as built. Lead's |
| `session.spec.ts:113` | `getByRole("status")` has count 0 once a company is set | **holds** — so the home draws no other `role="status"`, and I keep it that way |
| `session.spec.ts:127` | sign-out through the «حسابي» menu button | the shell's (§4.33), not the home's. Lead's |
| `wave14-platform-avatar.spec.ts:204, 272` | «نستخدم صورتك من Google؟» inside `#main` on `/app` | **depends on §6.1** — holds if the prompt stays on home; else a **selector** (the route). Lead's |
| `wave14-platform-avatar.spec.ts:218, 278, 306` | the account image and the «حسابي» button | the shell's. Lead's |
| `wave12-demo-poster.spec.ts:140` D1 | `#main article` with the title › `[data-slot="media"] img`, 4:5, contained | **may hold** (a post is an `article` and `poster` composes `CardMedia`) if the fixture session is in the feed's window; else a **selector** (the route → `/app/sessions`). Lead's |
| `wave9-sessions-day-views.spec.ts:186` | a link named by the title containing «3 أيام» | **selector** — on a post «3 أيام» is in the head row, outside the poster's link; the card it names is `/app/sessions`'. `sessions'` |
| `wave16-sessions-reserve.spec.ts:198` | goes to `/app` and back | holds |
| `a11y.spec.ts:113`, `wave11-lead-a11y-sweep.spec.ts:175` | axe on `/ar/app` | no assertion moves; findings on the new page are mine |
| `unconfigured.spec.ts:18`, `auth.spec.ts:43` | 404, and the sign-in redirect | hold |

`tests/components/browse/sessions-timeline.test.tsx` holds (the component is untouched). `scripts/ui-reach.mjs:168`
reads `app/page.tsx` and keeps matching. No assertion in a file I own moves; `card`, `story-ring`, `avatar`,
`reaction-bar` and `poster`'s suites pass untouched.

### 6 · Disagreements `DEC-206` §4 does not list — not picked

1. **The Google-photo prompt lives on home and the artboard has no place for it.** `sessions-timeline.tsx:57-59`
   renders `AvatarImportPrompt` (`REQ-PRF-008`, «offered once») on `/app` today, and
   `wave14-platform-avatar.spec.ts:207` finds it in `#main` there. `Home.dc.html` draws nothing between the ring row
   (`:27`) and the week (`:35`). When `/app` stops rendering the timeline the prompt leaves home unless the feed
   carries it. Default I would build unless told otherwise: imported as it is, beside the company banner.
2. **The phone's posters are drawn cropped.** `Home.dc.html:51` is 342 × 300 and `:81` is 342 × 220; `REQ-UIX-026`,
   `M10a.md:81` («`poster` whole») and ruling 4 say 4:5, which at that width is 342 × 427. The desktop boards draw
   true 4:5 (260 × 325, 160 × 200). `poster.tsx` reserves 4:5 and cannot draw the short box.
3. ★ **`story-ring` is a `<button>` in every state** (`story-ring.tsx:50-57`), and `DEC-206` §1.5 and `REQ-UIX-055`
   say «it is not a button». Omitting `onOpen` leaves a focusable button that does nothing. Meeting the requirement
   is a render change with no prop change — no `onOpen` → a non-interactive element named as an image — but
   **`story-ring.tsx` is not in my PR A edit list**, and `story-ring.test.tsx:44-46` asserts a button for every
   state with no `onOpen` passed (an **expectation** move in my own evidence file). I need the file and that one
   assertion released, or a ruling that the inert button stands until wave 19.
4. **The ring's inside.** `Home.dc.html:28, 30` write the state's word INSIDE the ring («مباشر», «ملخص») and the day
   under it; the primitive (`REQ-UIX-040`, `story-ring.tsx:59-72`) draws a glyph inside and the word and the day
   under. The primitive's props are frozen, so the home will show the primitive's form.
5. **The ring row draws more than the window allows.** `Home.dc.html:29` is a ring for a session the same board
   says is «بعد 3 أيام» (`:79`), and `:31-32` are two seen rings for last Tuesday and Sunday. `DEC-206` §1.5's window
   is 24 h either side, and `seen` is never rendered. With the window, that row is three rings, not five.
   `05-stories.md:38`'s own order («the rest of the week by start time») also reaches past its 24 h window (`:36`).
6. **«Grouped by date» against the board's own groups.** `Home.dc.html:95-99` (an achievement «قبل ساعتين») and
   `:101-104` (an announcement «أمس») both sit under the heading «الخميس 2 أكتوبر» (`:74`), a day three days ahead,
   and above «أمس» (`:106`). `REQ-UIX-055` says «a feed grouped by date» and `STORY-UIX-044` «merging four sources
   by date». The merge in my §4 groups each item under its own day, which moves those two items to «اليوم» and «أمس».
7. **Future days in a feed.** The board's groups run today › a future day › yesterday. `REQ-UIX-055` does not say
   in which direction a feed that holds both upcoming sessions and past recaps is read. My §4 merge, step 2, is the board's
   order; a strictly newest-first feed would put Thursday's session above today's live one.
8. **Touch targets.** The board's reaction pills are about 32 px tall and its share and bookmark 36 px
   (`Home.dc.html:57-62`); `reaction-bar` and `icon-button` hold 44 px (`REQ-NFR-007`, the primitives' suites).
9. **The open post's row.** `Home.dc.html:86-91` ends with «12 من 40 مقعدًا» and draws no share and no bookmark;
   `M10a.md:82` gives every session post «share, bookmark». I would draw the seats line **and** both controls.
10. **«حمّل المواد» carries a download glyph** (`Home.dc.html:116`) and is a link to a section (§4.55 rules the
    behaviour; the word and the glyph still say «download»). The words are mine to write; «المواد» with no arrow is
    what the behaviour is.

**§4.47 – §4.61, read against the tree — four notes, none a reversal.**

- **§4.56** says «the live card's stack» among the home lines. Neither home board draws a stack: the phone's live
  post has none, and the desktop's draws a count (`HomeDesktop.dc.html:66`). The stack is `EventLive.dc.html:44`
  and `EventDesktop.dc.html:101`. The ruling is unaffected; `attendee-stack` simply has no consumer in PR A.
- **§4.57** frames the feed's control as artboard against plan. The artboard already draws links —
  `Home.dc.html:64` (`href="CheckIn.dc.html"`) and `:92` (`href="Event.dc.html"`). The disagreement is with
  `M10a.md:83`'s prose alone.
- **§4.52** holds, with one fact beside it: `member_badges` and `streak_awards` are `p1_org_read`
  (`0027:193, 273`), so an opted-out member's rows ARE readable by any member. Opt-out is the DAL's filter and
  nothing else — contract 4 says so; a test should read as a member and find the opted-out member absent.
- **§4.51** holds: `reactions` is org-readable (`0010:552`) and `kind` is free text (`0010:341`), so the like
  count needs no new function. Nothing dedupes a session's like against a comment's; the unique index is per target.
- §4.47 – §4.50, §4.53 – §4.55, §4.58 – §4.61: measured as written. `process_photo.ts` makes no derivative and
  `session_seat_counts()` has no attended figure.

### Open questions for sync 1

1. The slot: (a) a frame component the page renders, or (b) a parallel route — and if (b), the `@rail` files.
2. §6.3 — may I edit `story-ring.tsx` and one assertion of its test, or does the inert button stand?
3. §6.1 — does the Google-photo prompt stay on home?
4. §6.6 / §6.7 — the grouping rule and the direction of the feed.
5. `published_at`'s nullability and the policy's predicate; a length check on `body`.
6. Who composes the week: `scoring`'s three components, or DTOs for me — and who proves the hidden twin is silent.
7. The window of sessions the feed holds (14 days ahead, 7 back) is a guess; `sessions` and the lead set it.

## Wave 18 — built (after sync 1, `DEC-207`)

**State at the time of writing:** everything below is on disk, lint-clean and green in its own suites; none of it is
committed. Contract 2 says a new `ui/` file lands with its registry entry, so the lead commits the primitives. The
home waits on three contracts: `NextForMe` (sessions), `session-cta`'s `rate` state and a `booked` with no `cancel`
(sessions), and `CardDensity | "post"` (lead, landing with `card.tsx`).

- **Primitives:** `ui/feed-item.tsx` (three variants; no reaction on an achievement; «المواد» a link),
  `ui/attendee-stack.tsx` (rings every face, count always in words, a named group; no consumer in PR A),
  `card` `density="post"` (a `@container` column; `href` ignored), `story-ring` inert with no `onOpen` (an image
  named by its label — DEC-207 §1.5). Suites: `feed-item{,-scope}`, `attendee-stack{,-scope}`, `card-post-scope`,
  `story-ring-inert`. Ledger: `story-ring.test.tsx`'s fixture passes `onOpen` (expectation);
  `wave15-content-gallery.spec.ts:289` `button[data-state]` → `[data-state]` (selector).
- **The home:** `app/{page,loading}.tsx`; `components/feed/**`; `lib/dal/feed.ts` (`getFeed`); `photos.ts`
  `getRecapPhotos` (add-only); `messages/*/feed.json`. The merge (`feed-merge.ts`) and the rings (`ring-state.ts`)
  are pure and unit-tested; a source other than the session posts that fails is dropped and logged, never fatal.
- **Glyphs requested of the lead:** a megaphone (announcement; `InfoIcon` meanwhile) and a speech bubble (the
  comment count; drawn inline in `feed/session-post.tsx` meanwhile).
- ★ **Two deviations from `Home.dc.html`, approved by the lead:** (1) the propose band's «مقترحك يُجدول في أسبوع»
  (`:121`) becomes «اقترح جلسة، وتراجعها الإدارة وتجدولها» — no rule promises a week; (2) the presenter's company
  (`:48`, `:78`) is body-coloured text with a team-coloured dot beside it, not text in the team colour (§4.61: a
  colour from data is never a text colour, whose contrast nobody measured).
- **Glyphs — done (`0b39e29e`):** the lead added `MegaphoneIcon` and `CommentIcon` to `ui/icons` last in the wave,
  under contract 5's proof; the announcement wears the megaphone, the comment count `CommentIcon`, the inline bubble
  is deleted, and the gallery names both («إعلان», «تعليقات»).
- **For `sessions`, answered (Q1):** `poster` is not meant at 76 px — the row keeps `CardMedia` with
  `posterAspect()`; `teamName` optional needs the lead to release `poster.tsx` and the type.
- ★ **The first 1280 capture's defect, and its cause:** both desktop posts drew the poster as a 40 px strip with
  the copy column empty. `feed/session-post.tsx` built its container-query classes from a constant
  (`` `${WIDE}:w-[260px]` ``), and Tailwind generates only class names it finds whole in the source — the one that
  existed (`@min-[34rem]:flex-row`) came from the card demo. Fixed by writing each class out;
  `tests/unit/feed-classes.test.ts` refuses the pattern in every file the home renders, and bites on the broken
  file; the home spec's 1280 case now measures each poster at its drawn width (260, 160), at 4:5, beside its
  heading.
- **No «سجّل حضورك» on the member's live post (the 390 capture)** is correct: that member holds no seat and the
  seeded session does not allow walk-ins, so the affordance matrix offers no check-in (`checkInOffer()`,
  REQ-CHK-010) and `sessions'` action is `none`. The artboard draws a member who reserved.
- ★ **The 1280 case's missing link (build of `1056ae28`): the MARKUP was wrong, not the spec.** `post.posterName`
  and `recap.photoAlt` carried `<bdi>` tags but are read with plain `t()` into an attribute; next-intl raises
  `FORMATTING_ERROR` and returns the key, so the poster link's accessible name was «feed.post.posterName» and every
  recap photograph's `alt` «feed.recap.photoAlt». An attribute cannot isolate a run anyway, so both strings are
  plain now. `session-post.test.tsx` and a new `recap-post.test.tsx` assert both names in words.

## Wave 18 — `SCR-010`'s kept-behaviour table, retroactively (`DEC-208` §4, `STATUS` K1)

`/app` was rewritten in one commit (`8c738af2`) from `Home.dc.html` and `HomeDesktop.dc.html` — a whole-file rewrite,
not `DEC-208`'s delete-then-create. What the old page did was read from `main`'s files at `42a14ba0` (`app/page.tsx`
→ `browse/sessions-timeline.tsx` → `browse/session-card.tsx`, `app/loading.tsx`, `app/error.tsx`); where it lives
now was checked against the files as they stand at this note's commit.

| Behaviour | Where it lives now | Kept because |
|---|---|---|
| The session is checked at the data, never in a layout | `lib/dal/feed.ts` `getFeed()` → `sessionClient()`; every read it composes (`getSessionPosts`, `getAchievementItems`, `getRecapPhotos`, `getShellData`, `getMe`) calls it too | `REQ-NFR-004`, CLAUDE.md «Data access» 3 |
| RLS is the boundary; only a visible, scheduled session appears, never a draft | `getSessionPosts()` (`TIMELINE_STATES`, the caller's client); `feed-merge.ts` drops a post with no day | `REQ-NFR-001` |
| «اختر شركتك قبل حجز مقعد…» with «أكمل ملفك» → `/app/me`, inside `role="status"` | `feed/feed.tsx`, above the week; plus a post's control says why it cannot reserve | `REQ-PRF-001`, `REQ-UIX-055` («the banner says so above the week») |
| «نستخدم صورتك من Google؟», offered once, in its own Suspense | `feed/feed.tsx`, beside the banner (`AvatarImportPrompt`, imported unchanged) | `REQ-PRF-008`, `DEC-207` §6.1 |
| The member's next committed session first, «التالية لك», not repeated below | **changed shape**: committed first WITHIN its day (`compareSessionPosts`, `feed-merge.ts`); on desktop «التالية لك» is the rail (`NextForMe`, `sessions'`) | `REQ-UIX-021` as amended by `REQ-UIX-055`, `DEC-206` §4.59 |
| The phase badge — live, closing soon, full, cancelled — from `session-status.ts`, never re-derived | `feed/session-post.tsx` (`SessionStatusBadge` with `phase`, `seat`, `closingSoon`) | `REQ-UIX-003` |
| A check-in link offered only when the matrix allows it | `session-post.tsx` → `sessions'` `action` (`checkIn`, from `checkInOffer()`); nothing drawn when `none` | `REQ-UIX-015`, `REQ-CHK-010` |
| The viewer's own seat or waitlist place said first | `session-post.tsx`, the `booked` action («مقعدك محجوز», «في قائمة الانتظار، ترتيبك N») | `REQ-UIX-015`, `REQ-RSV-*` |
| The bookmark toggle on each session | `session-post.tsx` (`BookmarkButton`, unchanged) | `REQ-DSC-006` |
| The poster whole, never cropped; the title placeholder when none | `session-post.tsx` → `ui/poster` (`object-contain`, 4:5 box) | `REQ-UIX-026`, `REQ-UIX-032` |
| A multi-day session says how many days | `session-post.tsx` (`dayCountLabel`) | `REQ-SES-015` |
| The time on the room's wall (the session's zone); the day on the org's calendar | `session-post.tsx` (`formatTime(…, post.timeZone)`); `feed-merge.ts` (`orgDay(…, orgTimeZone)`) | `REQ-INT-003` |
| `<bdi>` on every interpolated title, name, company and venue | `session-post.tsx`, `recap-post.tsx` (via `ui/feed-item`), `achievement.tsx`, `empty-feed.tsx`; an announcement in `<bdi dir="auto">` | `REQ-INT-007` |
| Western numerals, every count through `formatNumber`, never ICU's `#` | every `feed/*` caller; `messages-numerals.test.ts` holds `feed.json` | `REQ-INT-006`, `DEC-124` |
| `/app` ignores its query string; filters live at `/app/sessions` | `app/page.tsx` reads no `searchParams` | `REQ-UIX-022`, `DEC-130` |
| An empty case that names the next action — propose | `feed/empty-feed.tsx` (`empty-state` → `/app/propose`) and the propose band on every feed | `REQ-UIX-012`, `DEC-206` §4.60 |
| A loading state shaped like the content | `app/loading.tsx` → `FeedSkeleton` inside `PageFrame` with `RailSkeleton` | `REQ-UIX-005` |
| An error boundary | `app/error.tsx` → `RouteBoundary`, unchanged | `REQ-UIX-016` |
| One `<h1>` | `app/page.tsx`, «الرئيسية», visually hidden (the lead's ledger line moves `session.spec.ts:94`) | `REQ-NFR-007` |

**What the rebuild dropped — flagged, then ruled by the lead:** 1 and 2 RESTORED; 3 – 6 accepted as dropped.

1. **The date RANGE of a multi-day session.** The old card said «الأربعاء 1 – الجمعة 3 أكتوبر · 3 أيام»
   (`dayRange` + `dayCountLabel`); the post says the start's time and «3 أيام». The artboard draws one time.
   `REQ-SES-015` is met by the count; the range is one call away if the owner wants it.
   ★ **Ruled: RESTORED** — the post says «<venue> · <from> — <to> · 3 أيام» through `sessions'` `dayRange()` over
   the stored window (`REQ-SES-016`); a case in `session-post.test.tsx`.
2. **Every presenter but the lead.** The old card drew `AvatarStack` with «و N آخرين»; the post draws the first
   presenter only, as the artboard does. A co-presented session reads as one person's on the home.
   ★ **Ruled: RESTORED in words** — the lead's ring and name, then browse's «وآخر» / «وآخران» / «و3 آخرون»
   (`browse.card.others`); still one avatar. A case in `session-post.test.tsx`. ★ **And on the recap** (the lead's
   ruling): its meta line says «محمد الدوسري وآخر · جذر …» with the same string; a case in `recap-post.test.tsx`.
3. **Tags on the card** (three, as chips). Not drawn on a post; the artboard has none. Tags stay on browse and the
   event page (`REQ-DSC-002`). ★ **Ruled: accepted.**
4. **The waitlist's length on a full session** («N في قائمة الانتظار»). The post shows the full badge and the seats
   line; how long the queue is, is not said. ★ **Ruled: accepted** — the full badge says full.
5. **The next committed session as the phone's first item.** On the phone it is first only within its own day; a
   committed session on Thursday stands after today's items. `DEC-206` §4.59 accepts this; noted so the reviewer
   sees it is deliberate. ★ **Ruled: accepted** (§4.59).
6. **The page title's intro sentence** («تصفّح الجلسات القادمة…») — gone with the timeline's header; the home has no
   visible title, as drawn. ★ **Ruled: accepted** — the artboard draws no title.

---

## Wave 18, PR B — plan (`DEC-206`, `DEC-208`, `REQ-UIX-061`, `STORY-UIX-048`) — planning only, nothing edited

**Scope:** the event page's three slots — materials, photos, the discussion — rebuilt from `Event.dc.html` (open),
`EventLive.dc.html`, `EventDone.dc.html` and `EventDesktop.dc.html`, `M10a.md` §7. **Read:** the agent file's PR B
paragraph, `CLAUDE.md` § *Wave 18, PR B*, `DEC-206` §4.66 – §4.77, `DEC-208` in full, the four artboards' HTML, every
file under `components/{materials,photos,event,viewer}`, `lib/dal/{materials,photos,comments,reactions,reports}.ts`,
`sessions/slots.ts`, the event page's composition, `0116`'s storage policy, and the slots' specs. **Nothing is
deleted before the lead posts «B's plans are approved».**

### 1 · The regions, per phase, in the artboards' order

The page owns every `<section>`, its `<h2>` and whatever stands in the heading's row («3 تعليقات · رد واحد لكل
تعليق», «للحاضرين المسجَّلين · تُعرض لكل المؤسسة») — slot contract 1. A slot renders what is under the heading.

**Materials** (`Event.dc.html:93-97` open · `EventDone.dc.html:69-74` completed · `EventDesktop.dc.html:81-84`)

| # | Region | Primitive |
|---|---|---|
| 1 | one row per document: a type tile («PDF»), the title (`<bdi>`), a meta line — «قبل الجلسة · صفحتان · للقراءة والتحميل» — the whole row a link to the viewer (`SCR-013`) | a new `materials/material-row.tsx` on `card` `density="row"`'s surface tokens; `link` |
| 2 | ★ the audio row: a play button, «التسجيل الصوتي», «58:12 · للاستماع فقط», a scrub track | new `materials/audio-row.tsx` (§3); `icon-button`, `progress-bar` for the track's picture |
| 3 | a link row (Slides, a video link, any URL): the title, «يفتح خارج المنصة», `rel="noopener noreferrer"` | `material-row` in its link form |
| 4 | an image material: a tile that opens whole | `material-row` + the photos' lightbox |
| — | the dashed locked row (`Event.dc.html:96`) | **not built** (§4.68: RLS returns no row; no count exists) |

At `days.length > 1` the rows group under the day headings as today (`h3`, `DEC-121`) — not drawn, kept.

**Photos** (`EventLive.dc.html:60-68` live · `EventDone.dc.html:76-84` completed)

| # | Region | Primitive |
|---|---|---|
| 1 | live, for who may upload: the dashed «إضافة صورة» tile FIRST in a 3-column grid | the kept `upload-widget`, drawn as a tile |
| 2 | the grid: square tiles, cropped on purpose (written in the file, `REQ-UIX-026`), each a button that opens the lightbox; the uploader's team colour as a dot | new `photos/photo-grid.tsx`; `avatar`'s ring rules for the dot |
| 3 | live: the privacy line «كل صورة تُنشر بعد تجريدها… «أزلني» تخفيها فورًا» | text (`REQ-EVT-013` is the upload notice; this is its short form) |
| 4 | completed: «إضافة صورة من القاعة» as a pill UNDER the grid | the kept `upload-widget`, drawn as a pill |
| 5 | the lightbox: whole photograph, previous/next tap targets, «3 من 12», download, ★ **and now the takedown** («أزلني» → `REQ-EVT-012`) and, for staff, restore and re-scope — the tiles carry no button of their own | the kept `photos/lightbox.tsx`, `takedown-button.tsx` |
| 6 | staff: «تنزيل الكل» and the album's state | the kept `album-control.tsx`, as the slot's first row |

**The discussion** (`Event.dc.html:99-117` · `EventLive.dc.html:70-78` · `EventDone.dc.html:86-92` · `EventDesktop.dc.html:86-89`)

| # | Region | Primitive |
|---|---|---|
| 1 | the composer: the viewer's avatar in its team ring, a pill field «اكتب تعليقًا… @ لذكر عضو» with its visually-hidden label, and «نشر» | new `event/comment-composer.tsx`; `avatar`, `textarea` (one row, growing), `button` |
| 2 | a comment: avatar (32, team ring) · a bubble with «name · company · قبل ساعتين» and the body · under it the like and «رد» | new `event/comment-item.tsx`; `avatar`, `reaction-bar` (like) |
| 3 | a reply: indented, avatar 24 (the artboard's 28 is not an `avatar` size — the primitive wins), «· المُقدِّمة» when the author presents | the same item, `reply` form |
| — | a photo button in the composer (`Event.dc.html:105`) | **not built** (§4.70) |

**Desktop** (`EventDesktop.dc.html`): the same three slots in the body's start column (`1fr`); nothing of theirs moves
to the end column. No photos are drawn at desktop (the open phase has none).

### 2 · ★ The kept-behaviour table (`DEC-208` §2) — written before the delete

Re-derived from the requirements, the policies and the DAL, not from the old markup; «lives now» is the file that
will hold it after the create commit, and the lead checks each row against that file.

| Behaviour | Lives now | Kept because |
|---|---|---|
| **Materials** | | |
| The slot adds no phase filter: what `materials_read` returns is what is drawn; a day-scoped «بعد» is released when its own day ends | `materials/list.tsx` over `getMaterialsPageData()` (unchanged DAL) | `REQ-MAT-006`, `DEC-121`, `0116` |
| The phase chip says «قبل/بعد الجلسة» or «…اليوم» by the item's own scope, in words | `material-row.tsx` via the kept `phase-label.ts` | `REQ-MAT-006` (amended), `DEC-121` |
| A PDF opens in the viewer once rendered; pending shows progress, failed says so | `material-row.tsx` → `/app/sessions/{id}/materials/{mid}` | `REQ-MAT-003` |
| The font-substitution warning names the font, on the material | `material-row.tsx` (manager view) | `REQ-MAT-011` |
| With download off no file reaches a member: enforced by `materials_storage_read` (`0116`), not the row; the download itself stays in the viewer, admin downloads audited by `record_material_download()` | unchanged: `getMaterialDownloadUrl()`, the viewer's page | `REQ-MAT-005`, `0049` |
| External links leave with `rel="noopener noreferrer"` and say they leave | `material-row.tsx` | `REQ-MAT-007` |
| Who may add: presenters and admins; the upload is PDF-only for documents, sniffed on content after the bytes land, size-limited server-side; the limit said before a file is chosen | the kept `upload-form.tsx` → `/api/upload/material` (unchanged) | `REQ-MAT-002`, `REQ-MAT-008`, `REQ-MAT-009`, `REQ-MAT-012`, `DEC-058`, `REQ-UIX-024` |
| A manager sets the phase and «السماح بالتحميل» per item; a change is audited | the kept `settings-form.tsx` | `REQ-MAT-005`, `REQ-MAT-006` |
| At more than one day: groups by day, session content first; the add control in each group's header; the re-scope chip for managers | `list.tsx` + the kept `group-disclosure.tsx`, `rescope-chip.tsx` | `REQ-SES-018`, `DEC-121` |
| The slot returns `null` exactly when `materialsSummary()` says not visible | `list.tsx` | slot contract, `16` §5.4.1a(b) |
| **Photos** | | |
| Who may add: checked-in attendees, the session's presenters, admins — the policy decides, the control follows `canUpload` | `photos/gallery.tsx` → the kept `upload-widget.tsx` → `/api/upload/photo` | `REQ-EVT-009`, `REQ-CHK-009` |
| The uploader is told it is processing, never that it is posted; the photograph appears without a reload once stripped | the kept `upload-widget.tsx` | `REQ-EVT-010`, `DEC-139` |
| A photograph is never retrievable before its EXIF strip: rows exist only after `process_photo`; tiles are signed from rows | `getPhotosPageData()` (unchanged) | `REQ-EVT-011`, `DEC-182` |
| «Shared with everyone in the org» said at the point of upload | `gallery.tsx`, beside the add control | `REQ-EVT-013` |
| «أزلني» hides at once, pending review; staff restore | the kept `takedown-button.tsx`, moved into the lightbox | `REQ-EVT-012`, `REQ-EVT-014` |
| A hidden photograph: staff see it badged, nobody sees it in the lightbox | `photo-grid.tsx`; `lightboxSequence()` | `REQ-EVT-016`, `DEC-182` |
| The lightbox: whole, tap targets always visible, Escape and backdrop close, focus returns to the tile, «3 من 12» | the kept `lightbox.tsx` | `REQ-EVT-016`, `DEC-093`, SC 2.5.7 |
| The grid's crop is deliberate and said in the file | `photo-grid.tsx` | `REQ-UIX-026` |
| Every download through the audited route; staff «تنزيل الكل» enqueues, never builds in the request | the lightbox's link to `/api/photos/{id}/download`; the kept `album-control.tsx` | `REQ-ADM-021`, `DEC-177` |
| A refused download comes back as a notice | the kept `download-notice.tsx` | `REQ-ADM-021` |
| **The discussion** | | |
| Any member may comment, reserved or not, before, during and after | `event/comments.tsx` | `REQ-EVT-003` |
| One level of replies; a reply to a reply attaches to the thread | `comment-list.tsx`, `comment-item.tsx` | `REQ-EVT-002` |
| Edit own for the org's window, marked «معدّل»; delete own at any time, a tombstone when replies exist | `comment-item.tsx` over the unchanged actions | `REQ-EVT-005` |
| Mentions: org-only search, the mentioned ids posted with the body | `comment-composer.tsx` → `searchMentionsAction` (unchanged) | `REQ-EVT-006`, `REQ-TEN-003` |
| Report with a reason; «already reported»; the reporter never shown to the reported | `comment-item.tsx`'s report dialog | `REQ-EVT-008` |
| Moderators and admins remove and restore, audited | `comment-item.tsx` | `REQ-EVT-014` |
| Frozen on a cancelled session: read-only, no composer; nothing at all when frozen and empty | `comments.tsx`, `comment-list.tsx` | `REQ-EVT-003`, `REQ-SES-010` |
| The like earns nothing; the pressed state is the acknowledgement | `comment-item.tsx` → `reaction-bar` | `REQ-EVT-004`, `REQ-UIX-034` |
| Live: new comments and reaction totals arrive by the session topic's broadcasts; server values are correct without the socket | `comment-list.tsx` over `src/lib/realtime/**` (unchanged) | `REQ-EVT-015`, `DEC-020` |
| No Google URL reaches a browser: avatars through `avatarHref()`; the broadcast's `authorAvatarUrl` ignored | `comment-list.tsx` | `DEC-099`, `DEC-181` |
| A field that shows an app-side error sets `noValidate`; the typed text is not lost on a failed post | `comment-composer.tsx` | `DEC-149` §1 |
| **All three** | | |
| `<bdi>` on every title, name, company and file name | each new file | `REQ-INT-007` |
| Western numerals, counts through `formatNumber` | each new file | `REQ-INT-006`, `DEC-124` |
| The slot renders no `<section>` and no `<h2>`; its `…Summary()` reader shares its `cache()`d read | each slot file | slot contract (`sessions/slots.ts`) |
| The auth boundary is the DAL's `requireSession()`; the slots read ids, never rows | the unchanged DAL | `REQ-NFR-004` |

### 3 · ★ The audio row (`REQ-MAT-007`) — no new dependency

A client component over a native `<audio preload="metadata">` with no `controls`: a play/pause `icon-button`
(`aria-pressed`, its name «تشغيل التسجيل الصوتي» / «إيقاف مؤقت»); a native `<input type="range">` as the scrubber —
keyboard-operable for free (arrows, Home, End), `aria-valuetext` «12:03 من 58:12»; elapsed and total as text in
Western digits inside `<bdi dir="ltr">` — the requirement's «shows elapsed and total duration». The total comes from
`loadedmetadata`; until it does, «—:—». One player plays at a time on the page (a module-level «now playing»). No
autoplay, no motion, nothing kept after the page is left.

**Its source is a signed URL of the stored file**, from a new add-only `getMaterialPlaybackUrl(locale, id)` in
`materials.ts` (`materials_storage_read` decides, as for a download). ★ Three things I cannot settle alone:
- **`allow_download` off means no member can play it** — `0116` refuses the object to a member when download is
  off, and a stream IS the file. The artboard's «للاستماع فقط» assumes the opposite. §6.1.
- **The CSP**: `src/proxy.ts` has no `media-src`, so `default-src 'self'` would refuse a Supabase-hosted stream if the
  header covers `/app`. The lead's file; I need `media-src 'self' <supabase>` or the fact that it does not apply.
- **A play glyph**: `ui/icons` has `PauseIcon` and no play. A request, under contract 5's proof like the last two.

### 4 · The states not drawn, and how each is built

| Slot | State | Built |
|---|---|---|
| materials | none, for a member | `null`; the page drops the section |
| materials | none, for a manager | one quiet line and the upload control (never a second primary) |
| materials | a manager's view | the upload control, each row's settings, the re-scope chip at > 1 day |
| materials | rendering / failed / font warning | progress, a status badge, an info panel on the row |
| materials | several days | groups under `h3` day headings, session first |
| materials | audio that this viewer may not play | the row without the play button, saying why (§6.1's default) |
| photos | none, with the right to add | one quiet line and the add tile / pill |
| photos | processing after an upload | the widget's own «تتم معالجة الصورة الآن…» |
| photos | hidden (staff) | the tile badged «مخفية — بانتظار المراجعة»; restore in the lightbox |
| photos | album queued / building / ready / failed / stale | `album-control`'s states |
| photos | a refused download | the notice |
| discussion | empty, open | the composer alone |
| discussion | cancelled | read-only; `null` when also empty |
| discussion | edited · tombstone · reply form open · mention list · report dialog · already reported · removed (staff) | in the item and the composer |
| discussion | a post that failed | the error at the field, the text kept |
| all | the socket never connects | the server's values stand (`DEC-020`) |

### 5 · What the page (`sessions`) passes each slot

The props stay the contract's — ids and a derived enum, never rows — with **one addition**, the phase, because the
photos slot draws its add control differently live and after (`EventLive.dc.html:63` against
`EventDone.dc.html:83`):

```ts
// sessions/slots.ts (sessions' file) — add-only
export type PhaseSlotProps = SlotProps & { phase: SessionPhase };   // from `sessionPhase()`, never re-derived

<Materials {...slot} />                        // SlotProps
<Photos {...slot} phase={phase} />              // PhaseSlotProps
<Comments {...slot} />                         // SlotProps — `frozen` stays the DAL's
materialsSummary(slot) · photosSummary(slot) · commentsSummary(slot)   // SlotSummary, unchanged
```

The heading row's text is the page's: «N تعليقات» from `commentsSummary().count`, «الصور N» from `photosSummary()`.

### 6 · Files, moved assertions, disagreements

**DELETE (commit 1):** `components/materials/list.tsx` · `components/photos/gallery.tsx` · `components/event/{comments,
comment-list,comment-item,comment-composer}.tsx` — the files that draw the three slots' regions. ★ **Kept, and not
deleted** (behaviour components the slots compose, not the screen's markup — the lead rules if this line is wrong):
`materials/{upload-form,settings-form,rescope-chip,group-disclosure,phase-label,actions,proposal-*}`,
`photos/{lightbox,upload-widget,takedown-button,album-control,download-notice,actions}`, `event/actions.ts`,
`viewer/page-viewer.tsx` (`SCR-013` is M10b).

**CREATE (commit 2):** the six above, written from the artboards; new `materials/{material-row,audio-row}.tsx`,
`photos/photo-grid.tsx`; add-only `getMaterialPlaybackUrl()` (`materials.ts`), `PhotoSummary.uploaderTeamColor`
(`photos.ts`), `CommentAuthor.company` and `.isPresenter` (`comments.ts`); strings in
`messages/*/{materials,photos,event}.json`; new `tests/components/{materials,photos,event}/*-w18.test.tsx`; new
`tests/e2e/wave18-content-event-{materials,photos,discussion}.spec.ts`.

**Assertions that move** — each a ledger line in the create commit:
- `tests/components/materials/{list,list-grouping}.test.tsx`, `tests/components/photos/{gallery,gallery-grouping}.test.tsx`,
  `tests/components/event/{comments,comment-item,comment-list,comment-composer}.test.tsx` test deleted files: each
  case is **re-asserted in a new file against the new component**, and the old file removed — an expectation line
  per file saying which case went where.
- `materials.spec.ts`: «فتح العارض» link → the row is a link named by the material's title (**selector**).
- `photos.spec.ts`, `wave10-content-photos-takedown.spec.ts`: the takedown button leaves the tile for the lightbox
  (**selector**); its accessible name «احذف الصور التي أظهر فيها» is **kept** — the artboard's «أزلني» is the
  privacy line's word, not the button's (§6.4).
- `wave6-discussion-review.spec.ts`: the comment like becomes `reaction-bar`'s «إعجاب N» with `aria-pressed`, not
  «إلغاء الإعجاب» (**expectation**).
- Held unchanged, by keeping their names: `event-comments.spec` («نشر», «رد», «حذف», the dialogs), the lightbox spec
  («افتح الصورة 1 من 3», «الصورة التالية»), the album spec («تنزيل الكل»), `wave9-content-days` (the `h3` day groups).

**New disagreements** — not in `DEC-206` §4, not picked:
1. ★ **«للاستماع فقط»** (`EventDone.dc.html:72`) against `REQ-MAT-005` and `0116`: with download off the stored
   file is refused to a member, and a player streams the file. Listening without downloading needs a separate
   derivative or a widened policy — neither is this wave's. Default: the play button only for a viewer who may sign.
2. **A download glyph on every material row** (`Event.dc.html:95`, `EventDone.dc.html:71,73`) — the row links to the
   viewer, and the download lives there. A download from the row needs a route, and `REQ-MAT-005` audits admins
   only; `DEC-177`'s «every download through an audited route» was written for posters, certificates and photos.
3. **The composer has no send button** (`Event.dc.html:104-105`) — the pill field alone. «نشر» is kept: the field
   is multi-line (Enter is a new line), a phone's keyboard has no reliable «send», and three suites pin «نشر».
4. **«أضف صورة» and «أزلني»** are the artboard's words; the suites pin «إضافة صورة» and «احذف الصور التي أظهر
   فيها». Default: the pinned names stay on the controls, the artboard's words in the visible privacy line.
5. **«افتح الألبوم»** in the photos heading's row (`EventDone.dc.html:77`) — the heading row is the page's, the
   lightbox is the slot's state. And «album» is also staff's «تنزيل الكل». Default: no such link; a tile opens the
   lightbox.
6. **The uploader's team colour on a tile** (`EventLive.dc.html:64-65`) — new data on a photo, the uploader's
   company; readable (the row names the uploader already), but a colour from data on a photograph. Default: drawn
   as a ring dot, add-only field.
7. **«· المُقدِّمة» and the company on a comment** (`Event.dc.html:114`) — the DTO carries neither; add-only in
   `comments.ts`. ★ The realtime payload (`comments_broadcast()`, SQL, not mine) carries neither, so a comment that
   arrives live shows them only if its author is already known on the page. The payload is the lead's to widen.
8. **A video link's embedded player** (`REQ-MAT-007`) against the CSP's closed `frame-src` — the case §4.71 ruled for
   the map. Not drawn. Default: the link out.
9. **The section order** differs by phase in the artboards (live: الصور · النقاش · المواد) — the page's, noted for
   `sessions`.

**For the lead:** the delete boundary in §6; the CSP's `media-src`; a play glyph; whether admin playback is audited as
a download (`REQ-MAT-005` «that access is audited»); the realtime payload (7).

### PR B — the tasks slot, added by `DEC-209` (NB9) — its regions and kept-behaviour table, before the delete

**Region** (`Event.dc.html:87-91`, `EventDesktop.dc.html:76-79`): one row per task — a checkbox and the title (with
its hint in parentheses, «(المواد، صفحتان)») — under the page's heading row «المهام التحضيرية · 0 من 2، تذكير فقط»
(the heading and that count are the page's). Primitive: `ui/checkbox` (`sessions'`), whose label is the row.
**Delete:** `tasks/panel.tsx`, `tasks/task-item.tsx`. **Keep:** `tasks/{create-form,group-disclosure,actions}` and
their tests.

| Behaviour | Lives now | Kept because |
|---|---|---|
| Four kinds, each with its own affordance: a link to the material (read), a form, a checkbox (checklist), an external link with a checkbox | `tasks/task-row.tsx` | `REQ-TSK-001` |
| Completion is self-declared for checklist, external and read; a form is completed by submitting it, never by the checkbox | `task-row.tsx` over the unchanged actions | `REQ-TSK-004` |
| A form's answers go to presenters and admins only; the member sees their own prior answer and may edit it | `task-row.tsx`'s form | `REQ-TSK-003` |
| Nothing earns points and nothing gates check-in: the slot reads no check-in and writes nothing a check-in reads | the unchanged DAL and actions | `REQ-TSK-002` |
| Progress visible: this viewer's completed of total, and `tasksSummary().outstanding` for the action card | `tasks/panel.tsx`, `tasksSummary()` | `REQ-TSK-004` |
| A presenter or admin authors tasks; at more than one day per group, behind a closed disclosure; the re-scope chip | `panel.tsx` + the kept `create-form.tsx`, `group-disclosure.tsx` | `REQ-TSK-001`, `REQ-SES-018`, `DEC-121` |
| A failed toggle says so at the row; a dropped connection does not take the page to the error boundary | `task-row.tsx` | `REQ-UIX-016` |
| External links `rel="noopener noreferrer"`; `<bdi>` on titles and descriptions; Western numerals | `task-row.tsx` | `REQ-MAT-007`'s rule, `REQ-INT-007`, `REQ-INT-006` |
| `null` exactly when `tasksSummary()` is not visible; no `<section>`, no `<h2>` | `panel.tsx` | slot contract |

### PR B — built (the create commit), checked against the kept-behaviour tables

Every row of the two tables above was checked against the new files; «lives now» holds for each, with these
**deliberate differences**, each named so the reviewer reads them as chosen, not lost:

1. **The count lines left the slots** («3 مواد», «صورتان», «3 تعليقات», «أنجزت 1 منها»): the artboards put the count
   in the heading's row, which is the page's (slot contract 1); each `…Summary()` still returns it.
2. **The font-substitution warning shows to the presenter and staff only** (`REQ-MAT-011` warns «the presenter»;
   its sentence tells them to re-export). A member no longer sees it.
3. **The like on a comment is `reaction-bar`**: one name, «إعجاب» and the count, with `aria-pressed`; «إلغاء
   الإعجاب» is gone (a toggle keeps one name), and so is the old «whisper» motion (`REQ-UIX-034`: the pressed state is
   the acknowledgement; `DEC-183` withdrew `DEC-100`).
4. **A comment's time is relative** («قبل ساعتين»), from the server's render instant so both sides of hydration agree;
   the full date is its `title`.
5. **The photo tiles carry no takedown**; it is in the lightbox beside the download (`album.tsx` — a client wrapper, so
   `lightbox.tsx` imports no server action and its evidence suite loads unchanged).
6. **Choosing a photograph uploads it**: the tile and the pill are one labelled file control (`upload-widget`'s add-only
   `variant`); the form variant — drop zone and button — is unchanged for every other caller.
7. **A task is a checkbox** (`ui/checkbox`), a form task has none; «أنجزتها» / «التراجع عن الإنجاز» are gone as words.

**Two `ui-lint` escapes, for the lead's written approval:** the audio scrubber's native range input (no slider
primitive exists) and the add tile's visually-hidden file input inside its own label. Each carries its reason.

**The SQL for the lead:** `supabase/proposed/content/comments_broadcast_author_context.sql` — `comments_broadcast()`
gains `authorCompanyName`, `authorTeamColor`, `authorIsPresenter`, add-only; `tests/rls/comments-broadcast-author.test.ts`
(3 cases, as a member writing, through `applyProposed()`); `comments-no-hotlink` still green beside it.

**Found while diagnosing `wave9-content-photo-worker` on desktop (2026-10-01) — written, not fixed; `src/lib/realtime/**`
is not in PR B's list.** The first `phx_join` of a private topic (`src/lib/realtime/channel.ts:29`) is sent **without an
access token**; Realtime answers «Unauthorized: You do not have permissions to read from this Channel topic» about 5 s
later, and the client's rejoin, now carrying the token, succeeds at about 6.4 s after load. A broadcast in that window
is lost — for a photo, the gallery then arrives by the upload widget's 20 s fallback, which is what every real-worker
run measured (the photograph at complete + 20 s). The comments and the reaction totals share the same join. Not a
wave-18 change: the file is untouched since before it. A likely repair is `await supabase.realtime.setAuth()` before
`subscribe()`; the owner of the file decides.

---

## Wave 19 — plan (`DEC-213`, M21, `REQ-UIX-065`, `REQ-UIX-064`, `STORY-UIX-053`) — planning only, nothing edited

Read before writing: `STATUS.md`'s wave-19 block; `CLAUDE.md` § *Ownership map (wave 19)*; `DEC-213` in full, `DEC-199` §2,
`DEC-208`; `M10b.md` §1 and §7 (with `M10a.md` §0 and §10); `Viewer.dc.html` and `ViewerDesktop.dc.html` beside their two
PNGs; `07` §4.5 – §6 and §10; `09` `SCR-013`; `REQ-MAT-001` … `012`, `REQ-UIX-005`, `016`, `017`, `064`, `065`,
`REQ-NFR-007`, `008`. **The tree read, not remembered:** the route's four files
(`src/app/[locale]/app/sessions/[id]/materials/[materialId]/{page,download-button,not-found,actions}.tsx|ts`),
`src/components/viewer/page-viewer.tsx` (191 lines), `getViewerData()` and `getMaterialDownloadUrl()`
(`src/lib/dal/materials.ts:432-562`), `materials_storage_read` (`0116:105-125`), `tests/components/viewer/page-viewer.test.tsx`,
`tests/e2e/materials.spec.ts:236-258`, `materials.viewer.*` in `ar/materials.json`.

### 0 · Three facts the reading turned up before the plan

1. ★★ **The live defect is worse than mirrored labels.** `page-viewer.tsx:160` gives «الصفحة السابقة» `onClick={rtl ? advance : retreat}`
   and `disabled={rtl ? index === total - 1 : index === 0}`; `:166` gives «الصفحة التالية» `onClick={rtl ? retreat : advance}` and
   `disabled={rtl ? index === 0 : …}`. **So in Arabic, on page 1, the button named «الصفحة التالية» is DISABLED** — a member
   who reads by tapping cannot advance at all; only the button named «السابقة» moves forward. The keys (`:62-88`) are right.
2. **The audited line is untrue for most of the people who read it.** `download-button.tsx:40` shows «سيُسجَّل هذا التحميل في
   سجل التدقيق.» to everyone allowed to download; `getMaterialDownloadUrl()` audits **the admin only** (`materials.ts:543-546`,
   `07` §6). A member or a presenter is told a thing that does not happen.
3. **The URL's session is never checked.** `page.tsx:18` calls `getViewerData(locale, materialId)`; the `[id]` segment is not
   read. A material of session B opens under `/sessions/A/materials/<B's>` with A's way back. Not a leak (RLS decides the row),
   but a wrong page — §2 row 3 fixes it.

### 1 · The regions, in the artboards' order, and what each is built from

**Phone — `Viewer.dc.html` (390 × 844), on black.** The chrome overlays the black; the page is centred in the whole
viewport, so hiding the chrome does not reflow the page.

| # | Region (DOM order) | Built from |
|---|---|---|
| 1 | **Chrome bar, top** — close (inline-start) | `ui/link` wrapping `CloseIcon`, named «إغلاق العارض» ★ → `/app/sessions/[id]` |
| 1a | the title block — `h1` the material's title, then «صفحة N من M» (`data-testid="page-indicator"`, kept — §6) | text in the screen; numbers in `<bdi>` through `materials.viewer.pageOf` |
| 1b | zoom out · zoom in (not drawn — `DEC-213` §5.83 «in the chrome») | `PageViewerZoom` from `ui/page-viewer` → two `ui/icon-button` |
| 1c | download, **only when allowed** (§2 rows 25 – 31, §7 N2) | `ui/icon-button` + `DownloadIcon`, named «تحميل الملف الأصلي» (existing key) |
| 2 | **The page, whole and centred** | `ui/page-viewer`'s stage (`next/image`, the page's own width/height) |
| 3 | **Bottom chrome** — previous (inline-start) · scrubber with «1 … N من M … M» · **next (inline-end, accent)** | `ui/page-viewer`: `ui/icon-button` `secondary` + `ChevronIcon direction="back"` · a native range · `ui/icon-button` `primary` + `ChevronIcon direction="forward"` (mirrors in RTL, so it points left) |
| 4 | the hint line «اسحب للتنقّل · انقر لإخفاء الأدوات · قرّب بإصبعين» | **not decided** — §7 N7 |

**Desktop — `ViewerDesktop.dc.html` (1280 × 820), from `lg`.** No shell (the lead's frame, contract 1).

| # | Region | Built from |
|---|---|---|
| 1 | **Bar, 64 px** — close · `h1` title + the meta line «<presenters> · 24 صفحة · PDF» (§5.86) | `ui/link` + `CloseIcon`; the line: each presenter's name and company in `<bdi>`, `materials.viewer.pageCount` ★ (six forms), `materials.list.kind.pdf` |
| 1a | spacer · the keys legend — «← التالية · → السابقة · Home · End» | `<kbd>` in the screen; the glyphs chosen **from `dir`** (`en` reads «→ Next · ← Previous»), the words `materials.viewer.keys.*` ★ |
| 1b | zoom out · zoom in (not drawn; §5.83) | `PageViewerZoom` |
| 1c | download «تحميل» with the icon, only when allowed | `ui/button` `secondary` + `DownloadIcon` |
| 2 | **Thumbnail rail at the inline-start**, 168 px, scrolling vertically, current outlined in the accent, its number under each | `ui/page-viewer`'s rail: `<ul aria-label="الصفحات">` of buttons «الانتقال إلى الصفحة N» (kept names) |
| 3 | **The stage** — previous (inline-start, 48 px) · the page · **next (inline-end, accent, 48 px)** | `ui/page-viewer` — **the same two buttons as the phone's**, placed by its grid (one DOM node each; §3 note) |
| 4 | **Footer, 44 px** — «صفحة N من M» · «الملف الأصلي لا يُحمَّل في المتصفح؛ الصفحات مُصيَّرة مسبقًا» ★ | text in the screen |

**Who writes what** (`DEC-213` §4): `ui/page-viewer` = the stage, previous/next, the scrubber, the rail, zoom and the
keyboard model, from props only. `src/components/viewer/**` = the chrome around it — close, title, the presenter line,
the keys legend, download, the footer, and the tap-to-toggle of the chrome.

### 2 · ★★ The kept-behaviour table (`DEC-208`) — 44 rows, re-derived from the requirements and the DAL

*«Now» is today's file and line; «after» is where it lives once the create commit lands. Read against the new files after
it, row by row, before the lead's capture.*

| # | Behaviour | Now | After | Kept by |
|---|---|---|---|---|
| 1 | The one data call: `getViewerData(locale, materialId)` | `page.tsx:18` | `page.tsx` (new), in parallel with row 33's read | `REQ-MAT-003` |
| 2 | **Auth at the data**: `sessionClient()` → `requireSession()` inside the DAL; nothing in a layout | `materials.ts:473` | unchanged | `REQ-NFR-001`, `CLAUDE.md` data access 3 |
| 3 | A null DTO (bad uuid, absent, or phase-gated out — deliberately indistinguishable) → `notFound()` | `page.tsx:19`, `materials.ts:472,483` | `page.tsx`; ★ **and** `notFound()` when the material's `session_id` is not the URL's `[id]` (§0.3) — an add-only `sessionId` on `ViewerData` | `REQ-MAT-006`, `03` §5.5a |
| 4 | The phase gate is RLS's (`materials_read`), and page images are Storage's (`material_pages_storage_read`) — the page decides nothing | DAL + `0116` | unchanged | `REQ-MAT-006` |
| 5 | Members see the **current** version only (`current_version_id`) | `materials.ts:494-500` | unchanged | `REQ-MAT-010` |
| 6 | `pending` / `rendering` → a waiting state, no pages | `page.tsx:33-36` | the **rendering** state (§4) on black, with the chrome's close and title | `REQ-MAT-003`, `09` `SCR-013` |
| 7 | `failed` → the failure and the PDF guidance | `page.tsx:37-40` | the **failed** state (§4) — ★ the «retry» `M10b.md` names has nothing behind it (§7 N4) | `REQ-MAT-003`, `REQ-MAT-002` |
| 8 | `ready` with no page rows, or a non-paged kind (image, audio, link) reached by URL → «لا توجد صفحات لعرضها.» | `page.tsx:56-57`, `page-viewer.tsx:112-114` | the primitive's `labels.noPages` (pinned by the unit suite) and the screen's empty state | `REQ-MAT-007` (those kinds never open here), `REQ-UIX-012` |
| 9 | The font-substitution warning, the family in `<bdi>` | `page.tsx:43-50`, to **every** viewer | a panel under the bar; **who sees it is §7 N9** | `REQ-MAT-011` |
| 10 | Page images are signed for 60 min from `material-pages`; **the source is never fetched to render a page** | `materials.ts:507-513` | unchanged; the footer now says so | `REQ-MAT-003`, `07` §6 |
| 11 | The page's real `width`/`height` reserve its box (no jump at «page 1») | `page-viewer.tsx:150-151` | `ui/page-viewer`'s `<Image>` | `REQ-NFR-008` (wave 11 C3) |
| 12 | Page 1 loads eagerly | `page-viewer.tsx:154` (`priority`, renamed `preload` in Next 16) | `preload` on the first page shown | `REQ-NFR-008`, `07` §5 |
| 13 | ±2 pages prefetched with `<link rel="prefetch" as="image">` | `page-viewer.tsx:104-108,120-122` | the primitive, same window | `07` §5, `REQ-NFR-008` |
| 14 | `unoptimized` — a signed private URL never goes through the image optimiser | `page-viewer.tsx:153,183` | the primitive | `REQ-MAT-005`, `07` §6 |
| 15 | **← advances and → goes back in RTL; the reverse in LTR** | `page-viewer.tsx:64-71` | `pageViewerKey(key, dir)` in the primitive | `REQ-MAT-003`, `09` `SCR-013`, `REQ-UIX-065` |
| 16 | Page Down advances, Page Up goes back, in both directions | `:72-79` | the same function | `REQ-MAT-003` |
| 17 | Home → first, End → last | `:80-87` | the same function | `REQ-MAT-003` |
| 18 | Navigation clamps at both ends | `:51-56` | the primitive's `goTo` | `REQ-MAT-003` |
| 19 | The keys work without focusing anything (window listener) — `materials.spec.ts:246` presses after `networkidle` with no focus | `:61-92` | kept window-level; ★ **ignores a key with Alt, Ctrl or Meta** (today Alt+← — the browser's Back — is swallowed, `:62-88`); inside the scrubber the same model is applied by its own `onKeyDown` | `REQ-MAT-003`, `REQ-NFR-007` |
| 20 | Previous/next disabled at the ends | `:160,166` — **mirrored, the defect** | `ui/page-viewer`: next disabled on the last page, previous on the first, in both directions | `REQ-NFR-007`, `REQ-UIX-065` |
| 21 | ★ **The buttons' behaviour follows their names** | **broken** (`:160,166`) | «next» always advances and sits at the inline-end by **DOM order inside a `dir` container** — no `rtl ?` on a button anywhere | `REQ-UIX-065`, `DEC-213` §4 |
| 22 | A polite live region announces «صفحة N من M» on each change | `:94-100,118` | the primitive, `role="status"` | `REQ-NFR-007` |
| 23 | The visible indicator «صفحة N من M», `data-testid="page-indicator"` (pinned by `materials.spec.ts:241-255`) | `:126-128` | the phone bar's second line — **one element carries the testid** (a second would break Playwright's strict mode on the desktop project); the desktop footer repeats the words without it | `REQ-MAT-003` |
| 24 | The thumbnail list is labelled «الصفحات» | `:173` | the rail's `<ul>` | `07` §5, `REQ-NFR-007` |
| 25 | Each thumbnail is a button named «الانتقال إلى الصفحة N», `aria-current` on the current one, its image `alt=""` (pinned by the unit suite) | `:176-184` | the rail | `REQ-NFR-007` |
| 26 | A thumbnail jumps to its page | `:178` | the rail | `07` §5 |
| 27 | The page image's alt: «<title> — صفحة N من M» | `:149` | the primitive, from `title` and `labels.pageOfText` | `REQ-NFR-007` |
| 28 | Zoom: 1 · 1.5 · 2, out/in disabled at the bounds, «تكبير»/«تصغير», the origin at the inline-start top | `:29,110,130-146` | `PAGE_VIEWER_ZOOM_STEPS` + `PageViewerZoom`; the origin from `dir`; ★ the browser's pinch is never disabled (`touch-action: pan-x pan-y pinch-zoom` on the stage) | `DEC-213` §5.83, SC 2.5.1 |
| 29 | The zoomed page scrolls inside its frame | `:145` (`overflow-auto`) | the stage; ★ focusable (`tabIndex=0`, named) when zoom > 1 so a keyboard can pan it, and arrows pan rather than page while it has focus | `REQ-NFR-007` (SC 2.1.1) |
| 30 | **No download control when `allow_download` is false** | `download-button.tsx:17` | `src/components/viewer/download-control.tsx`; the predicate is §7 N2's | `REQ-MAT-005`, `07` §6, `DEC-213` §5.88 |
| 31 | The URL is minted **on click** by the server action, never in page data; `window.location.href = url` | `download-button.tsx:26-29`, `actions.ts` | the same; ★ `actions.ts` **is not deleted** — it is the behaviour, not the markup | `REQ-MAT-005` |
| 32 | **A denied member receives no URL** — Storage refuses (`0116:116-121`) and the DAL returns `null`; no client fallback | `materials.ts:531-562` | unchanged; ★ **proved by a test of the URL, not of the button** (§6, V1) | `REQ-MAT-005`, `07` §6 |
| 33 | **An admin's download is audited** through `record_material_download()` **before** signing, and an audit failure yields no URL | `materials.ts:543-546` | unchanged; an e2e case counts the audit row | `REQ-MAT-005`, `0049` |
| 34 | The download's pending state keeps its label («جارٍ التحضير…») | `download-button.tsx:24-25` | `IconButton`/`Button` `pending` | `REQ-UIX-007` |
| 35 | A refused or failed download → an error toast «التحميل غير متاح لهذه المادة.» | `:34` | the same | `REQ-MAT-005` |
| 36 | «سيُسجَّل هذا التحميل في سجل التدقيق.» | `:40`, to **every** downloader | ★ **the admin only** (§0.2); placement §7 N3 | `REQ-MAT-005` — truth |
| 37 | One `h1`: the material's title | `page.tsx:31` (`PageHeader`) | the chrome bar's `h1` | `REQ-NFR-007` |
| 38 | The kind as an eyebrow («PDF») | `page.tsx:31` | the desktop meta line's last part; absent on the phone (not drawn) | `09` `SCR-013` |
| 39 | A way back to the session | `page.tsx:31` (breadcrumb «الرجوع إلى مواد الجلسة») | the close control «إغلاق العارض» ★ → the event page; `back` and `breadcrumbLabel` leave `materials.json` in the create commit | `REQ-NFR-007`, `REQ-UIX-001` |
| 40 | `<bdi>` around every interpolated value — the page numbers (`pageOf`), the font family | `page-viewer.tsx:127`, `page.tsx:47` | the same, **plus** each presenter's name and company in the meta line; the title is the whole of its `h1` and needs none | `CLAUDE.md` i18n, `REQ-INT-001` |
| 41 | Western numerals | `formatNumber()` (`page-viewer.tsx:6`) | the screen passes formatted labels; the primitive draws bare page numbers with `String(n)` — `0123456789` | `REQ-INT-006`, `DEC-124` |
| 42 | The reading direction comes from the locale (`rtl = locale !== "en"`) | `page.tsx:51` | the same, as `dir` | `REQ-INT-001` |
| 43 | **not-found**: «not found», a retry that is `router.refresh()`, a way back to `/app/sessions` | `not-found.tsx` | rewritten, same behaviour, on black | `REQ-UIX-016`, `16` §7.4 |
| 44 | **error**: today inherited from `[id]/error.tsx` (back to `/app/sessions`) · **loading**: inherited from `[id]/loading.tsx`, the event page's shape | — | ★ **its own `error.tsx`** (back to the event page, `RouteBoundary`) **and its own `loading.tsx`** (§4) — a segment with a skeleton has a boundary | `REQ-UIX-005`, `REQ-UIX-016`, `DEC-213` §5.89 |

**Not kept, on purpose** (each is `DEC-213`'s): the phone's thumbnail toggle and rail (`page-viewer.tsx:163-165,172`, §5.84);
`PageHeader` and the in-flow layout (§5.82, the frame's full screen); the Keynote state (never built, §5.85).
**No-JS path:** today and after, the server renders page 1 whole with its title and the close link; navigation needs
JavaScript. Nothing in the plan or the artboards asks for a per-page URL, so none is added (the artboard's `#p7` anchors
are drawing, not specification).

### 3 · `ui/page-viewer` — the props (contract 2)

```ts
/** content · `page-viewer.tsx` — SCR-013's page, previous/next, scrubber, rail, zoom and keys (DEC-213 §4). */
export interface PageViewerPage {
  pageNumber: number;      // as stored (material_pages.page_number); shown under a thumbnail
  imageUrl: string;        // signed, 60 min — never the source file
  thumbnailUrl: string;
  width: number;           // the rendered page's real size: reserves its box
  height: number;
}

export interface PageViewerLabels {
  previous: string;                                   // «الصفحة السابقة»
  next: string;                                       // «الصفحة التالية»
  scrubber: string;                                   // «الانتقال إلى صفحة» ★
  rail: string;                                       // «الصفحات»
  thumbnail: (pageNumber: number) => string;          // «الانتقال إلى الصفحة 3»
  pageOf: (position: number, total: number) => ReactNode;   // «صفحة <bdi>7</bdi> من <bdi>24</bdi>» — the live region
  pageOfText: (position: number, total: number) => string;  // the same, plain — aria-valuetext and the image's alt
  position: (position: number, total: number) => ReactNode; // «<bdi>7</bdi> من <bdi>24</bdi>» under the scrubber ★
  zoomIn: string;                                     // «تكبير»
  zoomOut: string;                                    // «تصغير»
  stage: string;                                      // the zoomed stage's name, when it is focusable ★
  noPages: string;                                    // «لا توجد صفحات لعرضها.»
}

export interface PageViewerProps extends Styleable {
  pages: PageViewerPage[];
  /** The reading direction — the ONLY input to the keys, the swipe and the zoom origin. The buttons need none:
   *  «next» is next in every direction and sits at the inline-end by DOM order. */
  dir: "rtl" | "ltr";
  title: string;
  labels: PageViewerLabels;
  /** 1-based position in `pages` (not `pageNumber`). Controlled with `onPageChange`, or uncontrolled. */
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  /** An index into PAGE_VIEWER_ZOOM_STEPS. Controlled with `onZoomChange`, or uncontrolled. */
  zoom?: number;
  defaultZoom?: number;
  onZoomChange?: (zoom: number) => void;
  /** Draw the zoom controls inside the viewer (default) or leave them to the screen's chrome (PageViewerZoom). */
  showZoom?: boolean;
  /** The rail is drawn from `lg` only, at the inline-start (DEC-213 §5.84). Default true. */
  showRail?: boolean;
  /** A tap on the page that was not a swipe — the screen toggles its chrome (DEC-213 §5.87). */
  onStageTap?: () => void;
  /** Any key the viewer sees — the screen brings hidden chrome back (§5.87's floor). */
  onKeyActivity?: () => void;
}

export interface PageViewerZoomProps extends Styleable {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  labels: Pick<PageViewerLabels, "zoomIn" | "zoomOut">;
}
```

By path, not in `index.ts` (it exports types only): `PageViewer`, `PageViewerZoom`, `PAGE_VIEWER_ZOOM_STEPS = [1, 1.5, 2]`,
and `pageViewerKey(key, dir, modifiers): "next" | "previous" | "first" | "last" | null` — the keyboard model as one pure
function the tests read directly. **`"use client"`**; it composes `ui/icon-button` and `icons` (`ChevronIcon`), reads no
DAL, no session, no catalogue. The label functions are why its parent must be a client component — the screen's
`viewer-screen.tsx` builds them with `useTranslations`, so nothing crosses the server boundary as a closure (`DEC-159`).

**One set of buttons, placed by a grid.** Previous, the stage, the scrubber and next are single DOM nodes in that order:
below `lg` the grid is the stage over a row «previous · scrubber · next»; from `lg` it is «previous · stage · next» and the
scrubber is not drawn. Duplicated buttons hidden by a breakpoint would give jsdom two «الصفحة التالية» and Playwright two
strict matches.

**Swipe** (an enhancement, `DEC-093`): pointer events on the stage, only at zoom 1, |dx| ≥ 48 px and |dx| > |dy|. **The next
page comes from the left in Arabic, so a finger dragging the page rightward advances**; in LTR a leftward drag advances. A pointer that moved less than the threshold is a tap
(`onStageTap`). No `setTimeout`, no motion library.

### 4 · Every state `M10b.md` §1 names that is not drawn — and how it is built

| State | How |
|---|---|
| **loading** (§5.89) | ★ new `[materialId]/loading.tsx`: the black ground, a bone-coloured page at 4:3 centred, a bar strip top and bottom on the phone, the rail's six thumbnails from `lg`. `ui/skeleton`, `aria-hidden`, no text, no `getTranslations`. **Needs from the lead:** the black token (§8.1) and a bone tone for `ui/skeleton` (§8.2), or the raised fill if refused. Paired with a new `error.tsx` (row 44) |
| **rendering** (`pending` and `rendering`) | the chrome bar (close, title, no download, no page count), and centred on the black `materials.list.renderStatus.rendering` «جارٍ تجهيز الصفحات…» over an indeterminate `ui/progress`. No polling — the tree has none; a reload is the way, as today |
| **failed** | the chrome bar, then `materials.viewer.states.failed` («… تأكد أن الملف PDF سليم وارفعه من جديد.») centred in an `error` `panel`. **No retry button** until §7 N4 is ruled; nothing exists to call |
| **Keynote / download-only** | **not built** (`DEC-213` §5.85) |
| **audio** | never opens here (`REQ-MAT-007`, the row plays inline); a cold URL lands on row 8's empty state |
| **no pages** | row 8 |
| **chrome hidden** (phone) | a tap on the stage hides the two bars by `opacity` + `translateY` (`--duration-*` token); any key (`onKeyActivity`), any focus inside the chrome (`focusin`) or another tap brings them back. **Never `aria-hidden`, never `inert`**: a hidden bar stays in the tree and tabbing into it reveals it, so a focused control is never invisible. From `lg` the chrome is never hidden |
| **chrome hidden under reduced motion** (§5.87) | the same toggle with no slide and no fade-in time: `motion-reduce:` removes the transform and the transition, the bar is shown or not |
| **zoomed** | the stage scrolls, is focusable and named, swipe is off, arrows pan while it has focus (row 29) |
| **download pending / refused** | rows 34, 35 |

### 5 · Contract 3 — photos by uploader, add-only in `src/lib/dal/photos.ts` (for `scoring`)

```ts
export interface UploaderPhoto {
  id: string;
  sessionId: string;       // the profile links a tile to its session; no title is read here (content never queries sessions)
  url: string;             // signed, 60 min — the EXIF-stripped image (there is no thumbnail derivative yet, DEC-206 §4.55)
  width: number | null;
  height: number | null;
  createdAt: string;       // display order only, never «the last row»
}

export interface UploaderPhotos {
  /** Every photograph by this member the CALLER may see — the heading's «9». */
  count: number;
  /** The newest `limit`, signed. A failed signature leaves its photograph out; the count stays. */
  photos: UploaderPhoto[];
}

/** SCR-020's «صور رفعتها» (DEC-213 §5.119). Through RLS with the caller's client — `photos_read` is the visibility
 *  rule — plus `removed_at is null` and `hidden_at is null` for EVERY caller, staff included (a profile shows what a
 *  colleague sees). By `uploader_id`; nothing in the schema tags a member, so a tagged photograph cannot appear. */
export async function listPhotosByUploader(
  locale: string,
  memberId: string,
  opts?: { limit?: number },   // default 6 (`Profile.dc.html:72`: five tiles and «+4»), at most 48
): Promise<UploaderPhotos>;
```

One count query (`count: "exact", head: true`) and one row query ordered `created_at desc, id desc`, one
`createSignedUrls` batch. A malformed `memberId` returns `{ count: 0, photos: [] }`. Its test is a request (§8.4).

### 6 · Files, commits, and every existing assertion that moves

**Order** (`DEC-208`; nothing before «the plans are approved» **and** «the frame is in»):

- **C0 — the bug, on the record (green).** New `tests/components/viewer/page-viewer-direction.test.tsx`: the direction case
  below, run against **today's** `components/viewer/page-viewer.tsx` and declared `it.fails(...)`. It is green only while the
  defect exists — committed green, it documents the failure, and the run's output (expected «صفحة 2 من 3», received
  «صفحة 1 من 3» — the button is disabled on page 1) is quoted in this note. Deleted in C1 with the file it tests.
- **C1 — the delete.** `rm`: `src/app/[locale]/app/sessions/[id]/materials/[materialId]/{page.tsx,download-button.tsx,not-found.tsx}`,
  `src/components/viewer/page-viewer.tsx`, `tests/components/viewer/page-viewer.test.tsx`,
  `tests/components/viewer/page-viewer-direction.test.tsx`. **Kept:** `actions.ts` (row 31). The ledger lines for the eight
  cases that leave go in this commit (below).
- **C2 — the primitive** (with the lead's types and registry entry, contract 2 — the gate fails on a `ui/` file with none):
  new `src/components/ui/page-viewer.tsx`, `tests/components/ui/page-viewer.test.tsx`, `tests/components/ui/page-viewer-scope.test.tsx`,
  `src/app/[locale]/(dev)/ui/demos/page-viewer.tsx` (every state in Arabic from fixture pages: first, middle, last, one page,
  none, zoomed, `ltr`).
- **C3 — the create.** New: the route's `page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`;
  `src/components/viewer/{viewer-screen.tsx,download-control.tsx,viewer-states.tsx}`; `tests/components/viewer/viewer-screen.test.tsx`;
  `ar/materials.json` then `en/materials.json` (the ★ keys: `close`, `scrubberLabel`, `position`, `pageCount` with six forms,
  `keys.next`, `keys.previous`, `keysLabel`, `stageLabel`, `sourceNote`, `downloadShort`; `back` and `breadcrumbLabel` removed);
  `materials.ts` add-only: `ViewerData.sessionId`, `ViewerData.viewerIsAdmin`.
- **C4 — contract 3.** `photos.ts` add-only (§5) and its test.
- **C5 — the evidence.** New `tests/e2e/wave19-content-viewer.spec.ts`; the lead runs it.

**`tests/components/viewer/page-viewer.test.tsx` — all eight cases leave with the file and are re-asserted in
`tests/components/ui/page-viewer.test.tsx`. Each is a ledger line; every one is a SELECTOR move, none an expectation move:**

| Case | Moved | How |
|---|---|---|
| starts on page 1 of 3 | selector | `getByTestId("page-indicator")` → the scrubber, `getByRole("slider", { name: "الانتقال إلى صفحة" })`, its `aria-valuetext` «صفحة 1 من 3»; `NextIntlClientProvider` → `labels` built from `ar/materials.json` |
| ★ RTL: ← advances, → goes back | selector | as above; `rtl` → `dir="rtl"` |
| ★ LTR: → advances, ← goes back | selector | as above; `dir="ltr"` |
| Home and End | selector | as above |
| Page Down / Page Up | selector | as above |
| clamps at both ends | selector | as above |
| a thumbnail jumps to its page | selector (provider only) | the name «الانتقال إلى الصفحة 3» is unchanged |
| the no-pages state | selector (provider only) | «لا توجد صفحات لعرضها.» is unchanged, from `labels.noPages` |

**`tests/e2e/materials.spec.ts` — no assertion moves.** `page-indicator` stays on one element with the same words
(row 23); the keys stay window-level (row 19); the viewer is still reached by the row link (`:230-233`, the event page's,
untouched). `review()`'s sideways-scroll check skips fixed layers, which the bars are. If the lead's full-screen frame
changes `#main` or the stream-settling the spec waits on, that is a frame line, not this track's.

**The two tests the brief names:**

- ★★ **The direction test** — `tests/components/ui/page-viewer.test.tsx`, «★ ar: «الصفحة التالية» moves the page from N to
  N + 1 and sits at the inline-end; «الصفحة السابقة» moves it back»: `dir="rtl"`, page 1 of 3; click the button named
  «الصفحة التالية» → `aria-valuetext` «صفحة 2 من 3»; again → 3; «الصفحة السابقة» → 2; next is disabled on page 3 and
  previous on page 1; and next follows previous in document order inside the `dir="rtl"` row, i.e. it is at the
  inline-end. ★ **It fails against today's file** — C0 proves it: on page 1 in RTL, «الصفحة التالية» is disabled, so the
  click does nothing and the page stays at 1. The physical half the jsdom cannot see is in the e2e: in `ar` at 390 and at
  1280, next's bounding box is **left of** previous's, its chevron's `data-direction` is `forward` and its computed
  transform is the RTL mirror (it points left), and on desktop `←` advances and `→` goes back.
- ★★ **The no-URL test** — `tests/e2e/wave19-content-viewer.spec.ts`, «★ REQ-MAT-005: a member denied download receives no
  signed URL»: against real local Supabase and Storage, a PDF with `allow_download = false`, a checked-in member.
  (1) The viewer has no control named «تحميل…». (2) The document and its RSC payload contain no `/object/sign/materials/`.
  (3) **The URL itself:** a supabase-js client signed in as that member makes the exact call `getMaterialDownloadUrl()` makes —
  `storage.from("materials").createSignedUrl(<the version's storage_path>, 300)` — and receives an error and no URL; the same
  call as the session's presenter receives one (the control that keeps the test from being vacuous). Beside it, a unit case
  of `getMaterialDownloadUrl()` with `sessionClient` stubbed (the pattern of `tests/unit/sessions-two-day-check-in.test.ts`):
  a refused signature → `null`, no audit call for a member; for an admin the audit RPC runs **before** the signature, and an
  audit error → `null` (§8.4 — the path is a request).
- **The admin audit** — the same spec: an admin downloads, the navigation to `/object/sign/materials/` is observed, and
  `audit_log` gains one row for the material.

Captures (production build, `E2E_SHOTS_DIR` honoured): `.qa-shots/rtl/wave19-content-viewer-{ready,chrome-hidden,rendering,failed,denied}-390.png`
and `wave19-content-viewer-{ready,admin}-1280.png`, each after the streams settle.

### 7 · ★ Disagreements `DEC-213` §5 does not list — with the file and the line, not picked

- **N1 · The phone title is cut with an ellipsis.** `Viewer.dc.html:22` — `white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis` on the title. `10-i18n-rtl.md:187` and `01-prd.md:2324`: never `overflow: hidden` on a text line
  (it clips stacked tashkeel); `DEC-190` (`DECISIONS.md:4741`) found a clamp's ellipsis drops letters inside an RTL word and
  ended with no clamp at all. With zoom in the same bar (§5.83) the title has about 176 px at 390. Until ruled, the plan lets
  the title wrap and the bar grow.
- **N2 · An admin's download when `allow_download` is false.** `M10b.md` §1 and `DEC-213` §5.88: «absent when
  `allow_download` is false». `REQ-MAT-005`: «Admins can always download, and that access is audited»; `07` §6's table: admin
  download «always permitted» in both columns. The tree hides it from the admin too (`download-button.tsx:17`). And Storage
  signs for **any staff** (`0116:120`, `is_staff()`) while `record_material_download()` audits **the admin only**
  (`materials.ts:543`) — so showing the control to «staff» would give a moderator an unaudited download; to the presenter
  (also signed, `0116:118`), an unaudited one by design (`07` §6 audits the admin path only).
- **N3 · The audited line.** Neither artboard draws «سيُسجَّل هذا التحميل في سجل التدقيق.»; the tree shows it to every
  downloader (`download-button.tsx:40`) though only an admin's is audited (§0.2). That it goes to the admin only is a truth
  fix (row 36); **where** it sits — the desktop footer, a description on the phone's icon button — is not drawn.
- **N4 · «failed (with retry …)».** `M10b.md` §1 and `09` `SCR-013`'s states name a retry; nothing can be retried — no DAL
  function, RPC or proposed SQL re-enqueues `render_pages`, and a member can neither re-render nor re-upload. The tree shows
  the message alone (`page.tsx:37-40`). A re-upload (`REQ-MAT-010`'s new version) is the presenter's only recovery today.
- **N5 · «No motion. `prefers-reduced-motion` removes the page-slide.»** (`M10b.md` §1, its last line). The first sentence
  rules motion out; the second implies a page-slide exists. Neither artboard nor `DEC-213` §5.87 draws one. The plan builds
  none, pending a reading.
- **N6 · Double-tap to fit.** `07` §5's zoom row: «Pinch and buttons; double-tap to fit». Not drawn, not in `DEC-213`
  §5.83 — and it competes with tap-to-toggle (`DEC-213` §5.87): telling one tap from two needs a delay on every tap.
- **N7 · The hint line** «اسحب للتنقّل · انقر لإخفاء الأدوات · قرّب بإصبعين» (`Viewer.dc.html:44`, the copy beneath the
  bottom chrome). Copy or the drawing's annotation, as §5.91 ruled «تُملأ من اليمين»? If copy, it is three ★ strings.
- **N8 · The presenter line names one presenter and one company** (`ViewerDesktop.dc.html:15`, «محمد الدوسري، جذر»). A session
  has one or more accepted presenters (`REQ-SES-019`), possibly of different companies; wave 18 found screens that silently
  dropped co-presenters. The composition for two or more is not drawn.
- **N9 · Who sees the font-substitution warning in the viewer.** Not drawn. `REQ-MAT-011` warns «the presenter» and tells them
  to re-export; wave 18 PR B already shows it on the event page's slot to the presenter and staff only (this note, «built»,
  item 2); today's viewer shows it to every viewer (`page.tsx:43-50`).
- **N10 · Citations, not rulings.** `M10b.md` §1 cites `REQ-MAT-007` for «the source PDF is never fetched»; that is
  `REQ-MAT-003`'s acceptance («works without downloading the source file»). `REQ-MAT-003` cites `REQ-INT-004` for the reading
  direction; `REQ-INT-004` is «Logical properties only». `09` `SCR-013` says «the thumbnail rail runs right to left»; the
  drawn rail is vertical at the inline-start.

### 8 · What this track needs from the lead

1. **A token for the viewer's black ground** (`DEC-213` §5.82) — `bg-black` is refused by `no-raw-palette`
   (`tests/unit/no-raw-palette.test.ts:58`) and a hex by `tokens-only`. A semantic name in `globals.css` (yours), e.g.
   `--color-void`, and whether the bars' «ink at 92 %» is `bg-bg/92` or a name of its own.
2. **A bone tone on `ui/skeleton`** for the page skeleton («a bone-coloured page skeleton», `M10b.md` §1) — an add-only prop,
   or a ruling that the raised fill stands.
3. **Contract 2:** `PageViewerProps`, `PageViewerLabels`, `PageViewerPage`, `PageViewerZoomProps` (§3) in `ui/index.ts`, the
   registry entry (`composes`: `icon-button`, `icons`), the demo wired — in or before C2.
4. **Two test paths outside my list:** `tests/unit/materials-download-url.test.ts` (§6, the DAL's own half of the no-URL
   proof) and `tests/unit/photos-by-uploader.test.ts` (contract 3). If refused, both go under `tests/components/viewer/`.
5. **The presenter line's source** (§5.86): the plan reads `getSessionForEvent(locale, id)` — `sessions'` DAL, imported, never
   edited — for its accepted presenters with their companies; it also returns `null` for a session the viewer cannot see. It
   reads the viewer's seat, check-ins and tags as well, which this page does not need. The lighter alternative is an add-only
   function from `sessions` — your call; `content` does not query `sessions` itself.
6. **Rulings on §7 N1 – N9.** None blocks C0 – C2; N2, N3, N7 and N9 decide markup in C3.

---

## Wave 19 — built (after sync 1, `DEC-214`)

**Commits:** `7dee077c` contract 3 and the three primitive additions · `75a1ae26` the live defect on the record
(`it.fails`, run as a plain `it`: expected «صفحة 2 من 3», received «صفحة 1 من 3») · `14c6d049` the delete · the create
commit follows (its sha in the lead's message).

### The kept-behaviour table, read against the new files

Every row of «Wave 19 — plan» §2, re-read against `page.tsx`, `viewer-screen.tsx`, `download-control.tsx`,
`ui/page-viewer.tsx` and `materials.ts` after the create:

- **Kept as planned:** 1, 2, 4, 5, 6, 8, 10 – 18, 20 – 29, 31 – 35, 37 – 44.
- **3** — `notFound()` also when `data.sessionId !== id` (`page.tsx`); the e2e's last case drives it.
- **7** — failed: the plain sentence to a member, the re-upload guidance to a presenter or an admin, «أعد المحاولة»
  is `router.refresh()` (N4).
- **9** — the substitution notice to presenters and staff only (N9), under the bar.
- **19** — window-level keys; a key with Alt, Ctrl or Meta is never the viewer's (`pageViewerKey`); a text field owns
  its keys; the zoomed stage pans with its arrows.
- **30** — the control shows when `allow_download`, or the viewer presents the session, or is staff (N2).
- **36** — «سيُسجَّل هذا التحميل» is an admin's alone: beside «تحميل» from `lg`, the phone icon button's
  `aria-describedby` (N3).
- **12** — `preload` on page 1 (Next 16's name for `priority`).
- ★ The page is sized from the stage's container units and the page's own ratio, so it is whole and as large as the
  stage allows at any size (a 1600 px render and a test's 1 px image alike).

### The ledger lines (for `STATUS.md`, wave 19)

`tests/components/viewer/page-viewer.test.tsx` was deleted in `14c6d049`; its eight cases are re-asserted in
`tests/components/ui/page-viewer.test.tsx` (the create commit). **Selector moves only, no expectation moved:**

| File · case | Moved | Why |
|---|---|---|
| `viewer/page-viewer.test.tsx` · starts on page 1 of 3 | selector | `getByTestId("page-indicator")` → the scrubber's value and `aria-valuetext`, the live region's text; the provider → `labels` from `ar/materials.json` |
| · ★ RTL: ← advances, → goes back | selector | as above; `rtl` → `dir="rtl"` |
| · ★ LTR: → advances, ← goes back | selector | as above; `dir="ltr"` |
| · Home and End | selector | as above |
| · Page Down / Page Up | selector | as above |
| · clamps at both ends | selector | as above |
| · a thumbnail jumps to its page | selector (provider only) | «الانتقال إلى الصفحة 3» unchanged |
| · the no-pages state | selector (provider only) | «لا توجد صفحات لعرضها.» unchanged |
| `viewer/page-viewer-direction.test.tsx` (`75a1ae26`, deleted in `14c6d049`) | — | the `it.fails` record of the defect, removed with the file it proves wrong (DEC-214 §1) |

`tests/e2e/materials.spec.ts` — no assertion moves.

### Requests to the lead

1. **The registry entry:** `"page-viewer.tsx": tokens("page-viewer", ["bg-chrome", "outline-accent", "accent-accent"], "page-viewer-scope.test.tsx")`
   — it draws its own colours from semantic names only (no `pg:`), composing `ui/icon-button` and `ui/icons`. The demo
   is `src/app/[locale]/(dev)/ui/demos/page-viewer.tsx` (`PageViewerDemo`), to wire into the gallery.
2. **`ui/index.ts`:** widen `AvatarProps.size` (`44 | 84 | 104`), `TagChipProps.teamColor?: TeamColor`,
   `BadgeProps.level?: number` — the files export the widened types meanwhile.
3. **The e2e:** `tests/e2e/wave19-content-viewer.spec.ts`, eight cases, captures
   `wave19-content-viewer-{ready,chrome-hidden,denied,rendering,failed}-390.png` and `-{ready,admin}-1280.png`.

---

## Wave 20 plan (`DEC-216`, `DEC-217`, M22, PR A — `SCR-021`, `SCR-023`, `SCR-024`) — planning only, nothing edited

Read from disk at `aed4601e` + the lead's uncommitted frame (`me/layout.tsx`, `shell/hub-top-row.tsx`,
`shell/hub-strip.tsx`), beside `Me.dc.html`, `MeEdit.dc.html`, `HubDesktop.dc.html`, `Certificates.dc.html`,
`Bookmarks.dc.html` and their PNGs. Every row below was re-derived from `01-prd.md`, the DAL and the files about to be
deleted — `me/page.tsx`, `me/actions.ts`, `me/state.ts`, `components/me/profile-form.tsx`,
`me/certificates/page.tsx`, `me/bookmarks/page.tsx` — and their suites. Answers STATUS's «Sync 1», items 1 – 7.

### 1 · The regions, in each artboard's order, and what builds each

**`SCR-021` read (`Me.dc.html`), phone:**

| # | Region | Built from | Whose |
|---|---|---|---|
| 1 | Top row: `h1` «حسابي» · settings glyph link at the inline-end | `HubTopRow` (`back={false}`, `action=` an `icon-button`-shaped `Link`) | lead's component, my page passes title + action |
| 2 | Standing card (avatar + ring, name, title · company, «هكذا يراك زملاؤك», level medallion, points, `progress-bar` line, three stats) | contract 3's component, phone form, `lg:hidden` | `scoring` — I place it |
| 3 | Hub strip, «ملفي» current | `HubStrip` (phone, `lg:hidden`) | lead |
| 4 | `h2` «ملفي» | `section-header as="h2"` | mine |
| 5 | One list card of label/value rows: الاسم · الشركة (team dot) · المسمى الوظيفي · نبذة (or `members.profile.noBio`) · الاهتمامات (chips) · البريد (`<bdi>`) | `card` (`density="row"`, no `href`) holding a `<dl>`; chips are `tag-chip` | mine |
| 6 | One primary «عدّل ملفك» | `ButtonLink` (see §4 «edit mode is a URL») | mine |

**`SCR-021` edit (`MeEdit.dc.html`)** — regions 1 – 3 unchanged, then: `h2` «تعديل ملفي» with the unsaved count beside
it · `form-summary` / the whole-form alert · the fields — `field` + `input` (الاسم), `field` + `select` (الشركة),
`field` + `input` (المسمى), `field` + `textarea` with «N من 600» (نبذة), الاهتمامات (see D2), the leaderboard opt-out
`checkbox` (**PR A only**, contract 5), البريد as plain text «… · من Google» · bottom `action-bar`: primary «حفظ»
(`SubmitButton`, disabled until dirty — see D4), secondary «إلغاء».

**`SCR-021` desktop (`HubDesktop.dc.html`)** draws `022` as the content, never `021`. Built as: the layout's band and
strip, then `HubTopRow` (`h1` «حسابي», settings link) and regions 4 – 6. ★ The phone standing card is `lg:hidden` so the
band is drawn once (`REQ-UIX-070`). Not drawn — D9.

**`SCR-023` (`Certificates.dc.html`):** `HubTopRow` (back to `/app/me`, `h1` «شهاداتي») · `HubStrip` · one list `card` of
rows: title (`<bdi>`), «kind · date», at the end the download glyph, «قريبًا» or «ملغاة». Each row is a `card`
`density="row"` with `href` (the whole row one link, as `SessionRow`) and the download glyph in `CardActions` — never a
link inside a link. The `?download=failed` alert (`panel tone="error"`) above the list, as today. Empty: `empty-state`.

**`SCR-024` (`Bookmarks.dc.html`):** `HubTopRow` (back, `h1` «المحفوظات») · `HubStrip` · an `<ol>` of `SessionRow`
(browse's row, imported as it is) · empty: `empty-state` «لم تحفظ شيئًا بعد» + «تصفّح الجلسات». No section header, no
count line, no groups.

### 2 · ★★ The kept-behaviour tables (`DEC-208`) — written before any delete

#### `SCR-021` — deleting `me/page.tsx`, `components/me/profile-form.tsx`; rewriting `me/actions.ts`, `me/state.ts`

| # | Behaviour today | Where it lives after | Kept because |
|---|---|---|---|
| P1 | Data: `getMe()` (the `me()` RPC — the self tier), `listCompanies()` (active companies, by name) | the new page, the same two calls | `REQ-PRF-001`, `REQ-PRF-002`, `REQ-PRF-004` (self tier is the DAL's) |
| P2 | Auth boundary in the DAL (`sessionClient` → `requireSession`), none in the page or layout | unchanged | `CLAUDE.md` «Data access» §3 |
| P3 | Five self-service fields written — `displayName` (1 – 120, required), `companyId` (uuid or null), `jobTitle` (≤ 120), `bio` (≤ 600), `leaderboardOptOut` — through `profileInput` (Zod) then `updateMyProfile()`; the column grant (`0004`) refuses anything else | `saveProfile` kept, signature and Zod unchanged | `REQ-PRF-001`, `REQ-NFR-002`, `REQ-LDR-008` |
| P4 | The company is chosen from the org's list, never typed; «— اختر شركتك —» is the none option | `select` in edit mode, same options | `REQ-PRF-002` |
| P5 | ★ The leaderboard opt-out is written from `/app/me` | **edit mode, PR A only**; removed in PR B's commit that adds `029`'s switch (contract 5) | `REQ-LDR-008`, `REQ-UIX-071`, `DEC-217` §3.1 |
| P6 | Field errors: `form-summary` (titled `errors.summaryTitle`, linking each field) + the error at its `field`; edit mode stays | the same, inside edit mode | `REQ-UIX-071` «a failed save stays in edit mode», `16` §8.2 |
| P7 | A whole-form failure is its own `role="alert"`, focused, never a fake summary entry; the member's text stays | kept as `FormError` in the new edit component | `REQ-UIX-071`, `16` §8.2 item 6 |
| P8 | The member's text survives a failed round trip (`formStateFrom` / `was`) | kept — `ProfileState` unchanged but for D4 | `16` §8.2, `DEC-149` §1 |
| P9 | ★ After a successful save the company shows what was saved even before `me` refetches (the keyed-`select` fix, `wave7-content-me.spec.ts:145`) | after save the page is in read mode, so the **read row** shows the saved company — read from `revalidatePath`'s fresh `getMe()`; the select-echo fix survives inside edit mode for a failed save | `REQ-PRF-001`; the spec's expectation moves (§6) |
| P10 | «تم الحفظ» shown once after a save, structurally from `useActionState` — never `?saved=1` | a success `toast` once, then read mode | `REQ-UIX-071`, `M10c.md` §1; wave 7's reason for dropping the query param still binds |
| P11 | ★ A save pressed before hydration still persists (`wave10-content-me-early-save.spec.ts`) | **at risk** — D4 | the wave-10 finding (`docs/plan/notes/content.md` wave-10 plan T2·2) |
| P12 | `<bdi>` on the email | kept, read row and edit mode | `10` bidi rule |
| P13 | The email is shown and not editable | read row «البريد»; edit mode plain text «· من Google» | `REQ-UIX-071` acceptance 1 |
| P14 | The points balance as a `stat` linking to `/app/me/points` | **moves to contract 3's standing card** (the figure and the level); the link to points is the strip's «نقاطي» | `REQ-UIX-070` |
| P15 | The member's role («عضو» / «مُنظِّم» / «مشرف المؤسسة») beside the email in the header | ★ **dropped — no `REQ-*` keeps it and no artboard draws it.** Named so it is not «found» later; the lead rules | — (open, D10) |
| P16 | The hub's `<nav>` «صفحاتي», the privacy link last | the lead's `HubStrip` (phone: six; desktop: seven); on the phone privacy is reached by the settings glyph → `/app/me/privacy` in PR A | `REQ-UIX-070`, `DEC-217` §3.2, `REQ-PRF-006` |
| P17 | `h1` «ملفي» | ★ `h1` «حسابي» (the top row), `h2` «ملفي» | the artboard; the expectation moves (§6) |
| P18 | `revalidatePath('/{locale}/app/me')` after a save | kept | the read rows reread |
| P19 | The avatar import prompt («نستخدم صورتك من Google؟») | **not on `/app/me` today** — it is on the feed (`feed.tsx:59`) and `/app/me/privacy`; unchanged, not mine to move | `REQ-PRF-008`, `DEC-180` |
| P20 | The no-JS save (skipped spec, `wave7-content-me.spec.ts:155`) | unchanged — `/app` streams (`DEC-134`); still skipped, same reason | — |
| P21 | ★ **Interests (`REQ-PRF-001` «اهتماماتي», from the org's تصنيفات)** — **never built on `/app/me`**: no field, no writer anywhere in `src/` (`member_interests` is read by `members.ts:199`, `:382` only) | the artboard draws them in both modes — **a defect the rebuild surfaces, not a behaviour kept**; D2 | `REQ-PRF-001` |
| P22 | `noValidate` on the form (app-side errors) | kept | `CLAUDE.md` gates |

#### `SCR-023` — deleting `me/certificates/page.tsx`

| # | Behaviour today | Where it lives after | Kept because |
|---|---|---|---|
| C1 | Data: `listMyCertificates()` (own rows, `held` excluded, newest issue first) + `getOrgTimeZone()` | unchanged, read only (`designer`'s DAL) | `REQ-CRT-013`, `REQ-CRT-004` (held is invisible) |
| C2 | The download is a plain link to `/api/designer/downloads/<artifactId>` (audited), never a signed URL, never `download=` | the row's end glyph, the same `href` from `downloadHref`, accessible name «نزّل الشهادة» kept (`wave13-designer-certificates-download.spec.ts:165` pins it, exact) | `REQ-CRT-014`, `DEC-177`, `DEC-178` |
| C3 | `?download=failed` → a `role="alert"` «تعذّر تنزيل الملف…» | kept, above the list | `DEC-177` |
| C4 | No PDF yet → «الشهادة قيد التجهيز», no broken link | the «قريبًا» row (dimmed) — D6 | `REQ-CRT-013`; `certificates-page.test.tsx:69` |
| C5 | Revoked → «ملغاة» and **the reason** («سبب الإلغاء: …», `<bdi>`) — the **only** place a member reads it (`/verify` never shows it, A13) | ★ **D5 — the artboard moves the reason to «the certificate's own page», which does not exist for a member.** Not dropped silently | `REQ-CRT-013` acceptance; OQ-015 |
| C6 | A revoked certificate keeps its download | ★ the artboard draws «ملغاة» in the glyph's place — D7 | `REQ-CRT-011` (the page's comment) |
| C7 | Title falls back: session title → achievement's badge name → the kind | kept | achievement certificates have no session |
| C8 | Kind line («شهادة حضور» / «تقديم» / «إنجاز») | kept, «kind · date» | `REQ-CRT-013` |
| C9 | Issue date, in the org's time zone, `<bdi>` | kept as a date (no time) | `REQ-CRT-013` |
| C10 | Serial and verification code, each `<bdi dir="ltr">` | ★ **removed from the list** — `REQ-UIX-073` («no serial, code or QR in the list») | `REQ-UIX-073` supersedes `REQ-CRT-013`'s «with its serial»; D5 asks where they live |
| C11 | «صفحة التحقّق» link to `/verify/<code>` | D5 — kept only if the row opens `/verify` | `REQ-CRT-007` |
| C12 | `mine.intro`, `mine.count` | ★ dropped — `REQ-UIX-080` | `REQ-UIX-080` |
| C13 | Status badge «صالحة» on an issued certificate | ★ dropped — nothing is shown when nothing needs doing (`DEC-216` §2.1) | the expectation moves (§6) |
| C14 | Empty: `mine.empty` + «تصفّح الجلسات» | kept (`empty-state`) | `REQ-UIX-012` |
| C15 | `recipient_name_snapshot` is the printed name | unchanged (in the PDF, not the list) | `REQ-CRT-014` |

#### `SCR-024` — deleting `me/bookmarks/page.tsx` (keeping `error.tsx`, a boundary with no markup of its own)

| # | Behaviour today | Where it lives after | Kept because |
|---|---|---|---|
| B1 | Data: `getBookmarkedTimelineSessions()` — own bookmarks only (`p7_self_read`), most recently saved first, a session the member cannot see has no row | unchanged, read only (`sessions'` DAL) | `REQ-DSC-006` «private to the member» |
| B2 | Each row is browse's card, the whole row one link, `h3` title in `<bdi>` | ★ `SessionRow` (wave 18's browse row) replaces the old `SessionCard` — the artboard is `011`'s row | `REQ-UIX-074`; `bookmarks.spec.ts:151` pins the `h3` |
| B3 | The bookmark toggle «احفظ الجلسة», `aria-pressed="true"`, optimistic, a failure rolls back with an error toast | kept as `BookmarkButton` — D8 for the undo | `REQ-DSC-006`, `REQ-UIX-074`; `bookmarks.spec.ts:259-260` |
| B4 | Un-bookmarking drops the row (via the action's `revalidatePath`) | ★ dropped **at once** (optimistic) with an undo toast | `REQ-UIX-074` |
| B5 | Empty: «لم تحفظ أي جلسة بعد.» + «تصفّح الجلسات» | «لم تحفظ شيئًا بعد» + «تصفّح الجلسات» | `REQ-UIX-074`; the expectation moves (§6) |
| B6 | `h1` «المحفوظات»; an `h2` count over the list | `h1` kept (top row); the `h2` count dropped — `REQ-UIX-080`, and `SessionRow`'s `h3` now follows an `h1`… ★ a skipped level — D11 | `REQ-UIX-080` |
| B7 | `error.tsx` → `RouteError`, back to `/app` | kept, untouched | `REQ-UIX-016` |
| B8 | Bookmarking earns nothing | unchanged — `SessionRow` gets `points={null}`, so no «+N» (D12) | `REQ-DSC-006` |

### 3 · The new primitive's props

**None.** `content` writes no primitive this wave (`settings-group`, `ledger-row`, `podium` are `notify`'s and
`scoring`'s). Requests on primitives I do not own are §7.

### 4 · Every state `M10c.md` names, and how it is built

| Screen | State | Drawn? | Built as |
|---|---|---|---|
| 021 | read (default) | yes | server-rendered rows; no `<input>` in the DOM (a unit test asserts it — `REQ-UIX-071` acc. 1) |
| 021 | edit, N unsaved | yes (count not drawn — D3) | ★ **edit mode is a URL, `/app/me?edit`** — «عدّل ملفك» is a real link (works before hydration, survives a reload, the artboard's own `<a href>`); a client component holds the fields, compares each to `me` for the count and the accent border, disables Save when clean (D4) |
| 021 | cancel | — | «إلغاء» is a link to `/app/me`; when dirty it asks first (below) |
| 021 | leaving with changes | not drawn | `ui/dialog` («تجاهل التغييرات؟» · «تجاهل» · «تابع التعديل») on any in-app link press while dirty (a capture-phase listener), `beforeunload` for reload/close. ★ **Browser Back is not interceptable** in the App Router without a history hack — stated, not faked (D13) |
| 021 | no company | not drawn | `app.home.companyMissing` banner above the rows (read only — `app.json` is the lead's, read); the company row reads «اختر شركتك» as a link to `?edit` |
| 021 | errors | not drawn | P6/P7, edit mode stays |
| 021 | saved | not drawn | success `toast` `profile.saved` once, `router.replace('/app/me')` → read mode, focus to «عدّل ملفك» |
| 021 | no bio / no interests | yes (no bio) | `members.profile.noBio` (read); interests row absent when empty (nothing shown when nothing needs doing) — pending D2 |
| 021 | desktop | no | §1 |
| 023 | list | yes | §1 |
| 023 | revoked | yes | `line-through`, dimmed, «ملغاة» — D5, D7 |
| 023 | not yet issued «قريبًا» | yes | D6 |
| 023 | download failed | no | C3 |
| 023 | empty | no | `mine.empty` + browse |
| 024 | list | yes | `SessionRow` |
| 024 | removed, undo | no | the row leaves at once; toast «أزيلت من المحفوظات» · «تراجع» re-saves; a failed remove restores the row and says so (`REQ-UIX-074` acc. 1) |
| 024 | empty | no | `empty-state` |

★ Strings, `ar` first, each tested against «does it change what the person does next» (`REQ-UIX-080`) — new keys in
`profile.json`: `profile.hubTitle` «حسابي» · `profile.read.edit` «عدّل ملفك» · `profile.read.chooseCompany` «اختر شركتك» ·
`profile.read.settings` (the glyph's name — D1) · `profile.edit.title` «تعديل ملفي» · `profile.edit.unsaved` (six ICU
forms: «تغيير واحد غير محفوظ» / «تغييران غير محفوظين» / «{value} تغييرات غير محفوظة» / «{value} تغييرًا غير محفوظ» /
«{value} تغيير غير محفوظ»; zero renders nothing) · `profile.edit.cancel` «إلغاء» · `profile.edit.actions` (the
`action-bar`'s group name) · `profile.edit.bioCount` «{count} من {max}» · `profile.edit.emailSource` «من Google» (D3) ·
`profile.edit.leave.{title,confirm,stay}` · `profile.interests` «الاهتمامات» · `profile.bookmarks.{empty,removed,undo}`
(D14). Removed: `profile.bioHint` (the counter replaces it). `certificates.mine.{intro,count,serial,code,issuedAt,
notIssued}` and `mine.verify` (if D5 ends it) leave the list — `state.*` stays, the admin screen and `/verify` read it;
`mine.soon` «قريبًا» added.

### 5 · What I need from the other tracks (contracts 3, 4)

- **Contract 3 (`scoring`) — the standing card.** I need, by name: an **async Server Component** with a `form`
  prop (`"card"` on my page, `"band"` in the layout), reading its own data at `requireSession()` (I pass nothing but
  `locale`), rendering **no `h1`/`h2`**, carrying «هكذا يراك زملاؤك» → `/app/members/<self>` and the week's figure →
  `/app/leaderboards`, and either hiding itself below/above `lg` by form or documenting that I wrap it. I will wrap it
  in `<Suspense>` — **a skeleton export beside it** (`…Skeleton`) is what I ask for, so the page's rows do not wait on
  the standing. ★ **A question for `scoring` and the lead, not a choice of mine:** on `/app/me` both forms are in the
  DOM at every width (the card `lg:hidden` in the page, the band `hidden lg:block` in the layout). Moments 3 and 5 key
  «once per occurrence» — **two mounted instances must not both play or both write `member_seen_marks`**; the hidden
  one must be inert. The DAL read is shared by `cache()`.
- **Contract 4 (`scoring`) — this week.** Nothing directly: the week's rank is drawn **inside** contract 3's card. If
  the card takes the figure as a prop instead, I call the function — name it and I will.

### 6 · Files, and every existing assertion that moves

**Deleted (commit 1, one per screen or all three — the lead says):** `src/app/[locale]/app/me/page.tsx`,
`src/components/me/profile-form.tsx`, `src/app/[locale]/app/me/certificates/page.tsx`,
`src/app/[locale]/app/me/bookmarks/page.tsx`; `me/actions.ts` and `me/state.ts` **rewritten** in the create commit
(their exports are the contract the new form calls, so they are not deleted ahead of it).
**Created:** `me/page.tsx`, `components/me/profile-read.tsx` (server), `components/me/profile-edit.tsx` (client),
`components/me/leave-guard.tsx` (client), `me/certificates/page.tsx`, `components/me/certificate-row.tsx`,
`me/bookmarks/page.tsx`, `components/me/bookmark-list.tsx` (client — the optimistic list and the undo, D8), and
`me/{certificates,bookmarks}/loading.tsx` only if the lead's hub `loading.tsx` does not serve them.
**Tests:** `tests/components/me/profile-wave20.test.tsx`, `certificates-wave20.test.tsx`, `bookmarks-wave20.test.tsx`
(new); `tests/e2e/wave20-content-hub.spec.ts` (captures `wave20-content-{me-read,me-edit,me-errors,me-nocompany,
certificates,certificates-empty,bookmarks,bookmarks-undo,bookmarks-empty}-390.png` and `me-read-1280`).

| File:line | Assertion | Selector or expectation | Why |
|---|---|---|---|
| `tests/components/me/profile-form.test.tsx` (all six cases) | imports `ProfileForm` | **the file goes with the component**; each case re-asserted against `profile-edit` in `profile-wave20.test.tsx`, one ledger line each | `DEC-208` |
| `tests/components/me/certificates-page.test.tsx:56-60` | serial in `<bdi dir="ltr">`; «صالحة» | **expectation** — no serial, no «صالحة» | C10, C13 |
| `…:63-66` | the reason is shown | **expectation if D5 rules the reason off the list** | C5 |
| `…:69-72` | «الشهادة قيد التجهيز» | **expectation** → «قريبًا» | C4, D6 |
| `tests/e2e/wave7-content-me.spec.ts:106` | `h1` «ملفي» | **expectation** → `h1` «حسابي», `h2` «ملفي» | P17 |
| `…:108-109`, `:122-145` | fields filled on load; «حفظ» | **selector** — press «عدّل ملفك» first | read mode has no input |
| `…:144-145` | `getByLabel("الشركة")` has the saved value | **expectation** → the read row shows the company's name | P9 |
| `…:148` | strip link «الخصوصية والبيانات» on the phone | **selector** → the settings glyph | P16, `DEC-217` §3.2 |
| `tests/e2e/wave10-content-me-early-save.spec.ts:95-103` | fill and save before hydration | **expectation at risk** — D4 | P11 |
| `tests/e2e/wave7-content-certificates.spec.ts:158-164` | «صالحة»; the reason; serial `dir=ltr` | **expectation** (C10, C13; the reason by D5) | |
| `tests/e2e/certificates.spec.ts:313-314` (`designer`'s, the lead holds) | member sees `cert.serial`, «صالحة» | **expectation** → the title row | C10, C13 |
| `tests/e2e/bookmarks.spec.ts:166` | «لم تحفظ أي جلسة بعد.» | **expectation** → «لم تحفظ شيئًا بعد» | B5 |
| `tests/e2e/bookmarks.spec.ts:237-281` | `SessionCard`; the row leaves after the POST | **none expected** — `SessionRow` keeps `h3` and «احفظ الجلسة»; the row leaves sooner | B2 – B4 |
| `tests/e2e/wave19-scoring-profile.spec.ts:194` | `SCR-020`'s «عدّل ملفك» → `/ar/app/me` | **none** — or `/ar/app/me?edit` if the lead wants it to open edit mode (`scoring`'s file) | — |

Which of these files are mine: `tests/components/me/**` (evidence) is; the e2e specs above are not in my list — **the
lead edits each, or hands it to me for the commit**, with its ledger line.

### 7 · Disagreements `DEC-216` §5 and `DEC-217` §4 do not list — not picked

- **D1 — the settings glyph's name in PR A.** `Me.dc.html:25` names it «الإعدادات»; `DEC-217` §3.2 sends it to
  `/app/me/privacy` until PR B. A link named «الإعدادات» that lands on «الخصوصية والبيانات» misnames its target
  (SC 2.4.4). Either its name is the destination's in PR A and «الإعدادات» in PR B, or it keeps «الإعدادات» throughout.
- **D2 — interests.** `MeEdit.dc.html:62-67` draws free-text hashtags with «أضف وسمًا»; `REQ-PRF-001` says
  «اهتماماتي (topics of interest, **from the org's تصنيفات**)» and `member_interests.category_id` is a foreign key to
  `categories` (`0004:328`). And **no writer exists** (P21). Three ways: (a) build interests as a choice of categories
  — a chip toggle list — with an add-only `getMyInterests()` / `setMyInterests()` in `members.ts` (the lead's as
  `sessions'` custodian; `member_interests` already has the self-write policies and grants); (b) show them read-only,
  edit later; (c) leave them off the screen. A free-text tag is excluded by `REQ-PRF-001` and the schema either way.
- **D3 — the unsaved count is specified and not drawn.** `M10c.md` §1: «the count in the header is the only text about
  it» and «a Save that names the count»; `MeEdit.dc.html:44` draws «تعديل ملفي» alone and «حفظ» bare. And «· من Google»
  (`:69`) is a line `REQ-UIX-080` may cut. ★ **The changed field's accent border is colour alone** (SC 1.4.1) when the
  count is the only text — I propose a visually hidden «(معدّل)» in the changed field's label; that is a string the
  lead approves.
- **D4 — «Save enabled only when something changed» vs. a save before hydration.** `REQ-UIX-071` acc. 2 against
  `wave10-content-me-early-save.spec.ts` (the wave-10 T2·2 guarantee). A Save disabled in the server's HTML cannot be
  pressed before hydration; one enabled in the HTML is enabled while clean for that instant. Either the early-save
  guarantee is re-stated as «the instant Save is enabled» (the spec's expectation moves), or the server renders it
  enabled and the client disables it on hydration.
- **D5 — the revoked reason, the serial and the code have nowhere to go.** `Certificates.dc.html` and `M10c.md` §3:
  «the reason is on the certificate's own page», «serials, codes and QR live on the certificate». **No member-facing
  certificate page exists**: `/verify/<code>` is public and by A13 never shows the reason; the PDF has the serial but
  not the reason. `REQ-CRT-013`'s acceptance — «shown as revoked **in the member's own list, with its reason**» — is
  still in force, and `REQ-UIX-073` says the reason is on the certificate's page. Today the list is **the one place a
  member reads the reason** (`certificates/page.tsx:13`). Ways: (a) the row opens `/verify/<code>` and the reason
  stays as one line under the revoked row (artboard loses); (b) a new member route `/app/me/certificates/[id]`
  (route table, `04`, `09` — undrawn); (c) the row opens the PDF through the audited route (every «open» becomes an
  audited download). And **where a row «opens the certificate» to** is the same question.
- **D6 — «قريبًا» / «not yet issued».** `M10c.md` §3's «not yet issued» cannot be a `held` certificate — those are
  invisible to the member by `REQ-CRT-004` and the DAL. The only list state that fits is **issued, PDF not rendered**
  (today's «قيد التجهيز»), which has a date; the artboard draws «—». Built as that state with its date, unless ruled.
- **D7 — a revoked certificate's download.** The artboard draws «ملغاة» where the glyph is; today a revoked certificate
  keeps its PDF (`certificates/page.tsx:132-135`, `REQ-CRT-011`'s reading). Either both (the word and the glyph), or the
  download leaves the revoked row.
- **D8 — the undo needs a hook `BookmarkButton` does not have.** `BookmarkButton` (`search/bookmark-button.tsx`) keeps
  its state inside and exposes no callback; `SessionRow` renders it directly. **A request, add-only, to the lead as
  `sessions'` custodian**: either `SessionRow` gains `bookmarkSlot?: ReactNode` (my page passes its own remove control,
  which talks to the list through context), or `BookmarkButton` gains `onChange?(bookmarked: boolean)`. Without one,
  the row cannot leave optimistically and the undo cannot exist.
- **D9 — no desktop board for `021`.** `HubDesktop.dc.html` draws `022`. Built as §1 says; the action bar in edit mode
  is fixed on the phone and `position="static"` from `lg`, unless ruled.
- **D10 — the role line.** P15.
- **D11 — a skipped heading level on `024`.** Today's `h2` count kept `h1 → h2 → h3`; the artboard has none, so
  `SessionRow`'s `h3` follows the `h1`. Either a visually hidden `h2` (a string), or `SessionRow`'s level is a prop
  (a request), or the skip stands.
- **D12 — the row's «+N».** `SessionRow` draws the attendance amount on an open row; `Bookmarks.dc.html` draws none
  and `getBookmarkedTimelineSessions()` does not return the rule. «Imported as it is» would need the rule read
  (`search.ts:231`'s `attendancePoints`); I plan `points={null}` unless ruled.
- **D13 — Back while editing.** The artboard and `M10c.md` say leaving asks; the browser's Back cannot be asked about
  without a history entry pushed on edit — with `?edit` in the URL, Back returns to read mode and the changes are
  lost. Recorded as the limit.
- **D14 — the bookmarks page's strings.** Today they are `search.bookmarksPage.*` (`sessions'` file, the lead's). The
  page is mine, so its new strings go in `profile.json` (`profile.bookmarks.*`) and `search.bookmarksPage.{empty,count}`
  become unused — **a removal request** to the lead, or the lead rules the keys stay in `search.json` and edits them.
- **D15 — `SessionRow`'s badge is the phase, the artboard's is the reservation.** `Bookmarks.dc.html` draws «محجوز» and
  «قائمة انتظار» **as the badge**; on `011` the badge is the phase (`SessionStatusBadge`) and «محجوز» is the seat line
  (`session-row.tsx:53-54`). «Imported as it is» keeps `011`'s; the artboard loses unless ruled.

### The three things I most want ruled at sync 1

1. **D5** — where a member reads a revocation's reason, and what a certificate row opens.
2. **D2** — interests: categories with a writer (the lead's add-only DAL), read-only, or off.
3. **D4 with D8** — Save's disabled state against the pre-hydration save, and the hook the bookmark undo needs.

### Addendum — contract 1 as amended (`ebdde010`, `f79f5ee3`)

Re-read from disk. §1 already planned against it; made exact here. Below `lg` each of my three pages renders
`HubTopRow` then `<HubStrip />` (on `/app/me`: `HubTopRow back={false}`, then contract 3's card, then `<HubStrip />`);
from `lg` the layout's band and strip stand and my pages render neither strip. The settings action on `/app/me` is a
`Link` to `/app/me/privacy` (PR A, `DEC-217` §3.2) wearing the lead's `SettingsIcon` (`ui/icons.tsx:316`), its
accessible name per D1. `ownsTopRow()` covers all three of my routes, so none renders the shell's phone row. Nothing
else in the plan moves.

### Sync 1, provisional rulings (the lead, 2026-10-02) — and one consequence for D8

- **D5:** `docs/plan` wins (`REQ-CRT-013`). A revoked row keeps its **reason** as a quiet second line after «ملغاة»;
  every row keeps its **serial** as a quiet line in `<bdi dir="ltr">`. No certificate page this wave. **The row is one
  link to `designer`'s audited route** (the `downloadHref`) and the end glyph is decorative — no second link. So C2's
  accessible name changes: the row's link name is its text, and `wave13-designer-certificates-download.spec.ts:165`
  (`getByRole("link", { name: "نزّل الشهادة", exact: true })`) becomes a **selector** ledger line; the `href` assertion
  holds. A row with no `downloadHref` (D6, «قريبًا») is not a link. C10 and C11 now read: the serial kept; the code and
  the `/verify` link leave the list. `certificates-page.test.tsx:56-66` and `wave7-content-certificates.spec.ts:158-164`
  keep their serial and reason expectations; only «صالحة» moves.
- **D2:** (a), categories. Add-only `getMyInterests()` / `setMyInterests()` in `src/lib/dal/members.ts`, the lead's
  written grant for this wave; the setter takes category ids only and writes the session's own member, never one from
  the payload. The chip list offers the org's categories; no migration (`0004:339-348`).
- **D4:** Save is **enabled in the server HTML** and becomes «enabled only when changed» after hydration; the early-save
  spec is unchanged.
- **D8:** `onChange` on `BookmarkButton`, add-only, granted. ★ **Consequence:** `SessionRow` is a Server Component and
  renders `BookmarkButton` itself, so a page cannot hand it a function through `SessionRow` (`DEC-159`: no closure
  crosses the RSC boundary). The add-only addition that reaches it is a **context in `bookmark-button.tsx`** —
  `BookmarkChangeProvider` / `useContext` read inside `BookmarkButton`, a no-op when absent — which my client list
  provides around the rows. `SessionRow` is untouched. Asked of the lead in place of the prop.
- **`?edit`:** approved — Cancel a link to `/app/me`; «leaving asks» is the client enhancement on top.

### Correction to the addendum (the lead) — and D1 ruled

- **`HubTopRow` renders at every width** (it hides its own back control from `lg`; its `h1` is the page's heading at
  desktop too, under the layout's band and strip). **`<HubStrip />` is placed unconditionally** — it carries its own
  `lg:hidden`. My pages add no breakpoint class to either. On `/app/me` at desktop: band, strip (layout), then `h1`
  «حسابي», `h2` «ملفي», the rows; the phone standing card stays the only thing I hide from `lg`.
- **D1 ruled:** the settings link is named by where it goes — PR A `profile.nav.privacy` («الخصوصية والبيانات») to
  `/app/me/privacy`; PR B `app.shell.settings` («الإعدادات») to `/app/me/settings`. `profile.read.settings` is not added.
  `wave7-content-me.spec.ts:148` then keeps its expectation — a link named «الخصوصية والبيانات» to privacy — and its
  ledger line becomes «none» in PR A.

### D8 granted as a context, and the spec line (the lead)

- **D8:** `BookmarkChangeProvider`, add-only in `src/components/search/bookmark-button.tsx` — `BookmarkButton` reads it
  through `useContext` and calls it with `(sessionId, bookmarked)` after its optimistic flip; a no-op with no provider.
  `SessionRow` untouched. Replaces the `onChange` grant. **Its test:** a new
  `tests/components/me/bookmarks-wave20.test.tsx` case renders `BookmarkButton` with no provider and asserts the press,
  the `aria-pressed` flip, the action call and the failure rollback with its toast — exactly as before.
- **The spec:** in the `023` create commit, `wave13-designer-certificates-download.spec.ts:165`'s selector becomes the
  row link's name; the `href` assertion is unchanged. Its ledger line in `STATUS.md`'s wave-20 table, same commit:
  **selector**, `REQ-UIX-073` / D5. The «صالحة» moves (`certificates-page.test.tsx:60`,
  `wave7-content-certificates.spec.ts:159`, `certificates.spec.ts:314`) get their lines the same way, as **expectation**
  moves under `DEC-216` §2.1. `wave7-content-certificates.spec.ts` and `certificates.spec.ts` are the lead's to edit
  unless granted; I name the lines.

### `wave7-content-me.spec.ts:148` under strict mode — checked

The spec runs on both projects, but the test sets the viewport to 390 × 844 first (`:99`, `PHONE` at `:29`), so on the
desktop project too the layout's strip is `hidden lg:block` → `display: none`, outside the accessibility tree, and
`getByRole("link", { name: "الخصوصية والبيانات" })` matches the top row's link alone. **No change and no ledger line in
PR A.** Should the e2e run show a second match after all, it is scoped to `#main`'s top row and becomes a selector line.

### Grant — the two «صالحة» lines (the lead)

In the `023` create commit I edit only the «صالحة» assertions at `wave7-content-certificates.spec.ts:159` and
`certificates.spec.ts:314` — nothing else in either file — each with its ledger line (**expectation**, `DEC-216` §2.1 /
`REQ-UIX-073`) in the same commit, beside `certificates-page.test.tsx:60`'s and the `wave13…:165` selector line.

### `members.ts` at `27afbb3e`, and the PR-B row (the lead)

**Re-read from disk.** `ProfileInput.leaderboardOptOut` is now optional and `updateMyProfile()` writes the column only
when it is sent; `setLeaderboardOptOut()` is new (`notify`'s `029` calls it). **PR A:** `saveProfile` keeps sending
`leaderboardOptOut` from edit mode's checkbox, exactly as P3/P5 say. **`getMyInterests()` / `setMyInterests()` go
BELOW every existing export, add-only**, re-read again from disk and checked with `git log -1 -- src/lib/dal/members.ts`
before the edit.

**PR B — my row** (contract 5, in the commit that adds `029`'s switch): the checkbox leaves edit mode,
`PROFILE_FIELDS` loses `leaderboardOptOut`, `saveProfile` stops sending it (so `updateMyProfile` leaves the column
alone), and `profile.leaderboardOptOut` is removed if nothing else reads it. Assertions that move then, from
`notify.md` §W6 and my own:

| File:line | Moves | Writer |
|---|---|---|
| `tests/components/me/profile-wave20.test.tsx` — the opt-out case (PR A's) | **expectation** — no checkbox in edit mode; a save sends no opt-out | me |
| `tests/e2e/wave20-content-hub.spec.ts` — the opt-out step, if PR A's spec has one | **expectation**, the same | me |
| `tests/components/members/profile-page.test.tsx:190` — the self tier's links | **expectation** → `/app/me/settings` (§W6) | the lead (custodian) |
| `tests/e2e/wave7-content-notifications.spec.ts:99`, `:102`, `:108` – `:116` — the matrix | selector + expectation, moved to `029` (§W6) | `notify`'s screen — the lead names the writer |
| `tests/e2e/wave7-content-calendar.spec.ts:100`, `:117`, `:118` | selector + expectation, the synced list gone (§W6) | `notify`'s screen (that is PR A's `025`) — the lead names the writer |
| `tests/components/me/calendar-page.test.tsx` (5 cases) | as §W6 | `tests/components/me/**` is in my list as evidence, but the screen is `notify`'s — the lead names the writer |

Plus D1's PR-B half: the settings link's name becomes `app.shell.settings` and its `href` `/app/me/settings`;
`wave7-content-me.spec.ts:148` (a link «الخصوصية والبيانات» to privacy) then moves — **expectation**, PR B.
