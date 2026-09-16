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
