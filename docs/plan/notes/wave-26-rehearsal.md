# Wave 26 — `0198` and `0199` rehearsed on the production schema (2026-10-05)

**Rehearsed by the lead, in the local Docker container, on the owner's dump `/tmp/prod-schema-0197.sql`** (taken
2026-10-05 01:34, schema only, 901 KB). Production was never touched. The migrations are those at `76ab823e` on
`wave-26d/stories` — `0199` as corrected in place at `3b4555fa` (the write policy's cast inside a `CASE`).

## How

A throwaway database `rehearse26`; the schemas `extensions` and `vault`; the local `auth` / `storage` / `realtime`
schemas' pre-data and constraints **before** the dump (public's foreign keys need `auth.users`' key), the dump, then
their policies again **after** it (they name `public` objects) — with this wave's two storage policies stripped from
that auxiliary copy, so they could only come from the migrations. Schema `public` given production's grants.

- **The dump loaded with ONE error — the platform's `supabase_realtime` publication, as every wave.**
- ★★ **CORRECTED the same day — `0194` is NOT on production, and this note first said it was.** The first version of
  this line claimed the dump «already carries `0194`», on the strength of another session's report and a search that
  only found the function's NAME — which has existed since `0154`. Read properly: the dump's
  `set_session_certificate_mode()` still raises `session_completed` for a completed session, which is exactly what
  `0194` removes. The owner's `supabase db push` then said the same thing in its own words: «Found local migration
  files to be inserted before the last migration on remote database … `0194_certificate_mode_after_completion.sql`».
  **So production is at `0197` WITHOUT `0194`, while `main`'s app (PR #69, merged) already offers the control that
  `0194` makes work.** It is pushed with `--include-all`.
- Before the migrations: no `story%` table, no `story%` policy, no bucket row.

**`0198` then `0199`, one transaction, `ON_ERROR_STOP`, as `postgres`: exit 0, no error, no warning.**

★ **Re-rehearsed in production's real order after the correction** — a fresh database, the same dump (one error, the
publication): **`0194` alone, one transaction as `postgres`: exit 0, no error.** Before it the function refuses a
completed session; after it, it does not, and `anon` still may not execute it while `authenticated` may. **Then `0198`
and `0199` on top: exit 0, no error** — twelve `story%` policies and the triggers in place, as in the first pass. The
three are independent, as `DEC-246` §4 said; the order changes nothing but is now proven rather than argued.

## The end state, checked

| # | Check | Result |
|---|---|---|
| 1 | The four tables carry `org_id not null` and RLS | `story_frames` · `story_views` · `story_reactions` · `story_frame_takedowns` — all four |
| 2 | Policies | 3 · 2 · 4 · 1 |
| 3 | ★ **A grant for every policy** (invariant 6) — each policy's command against `authenticated`'s privileges | **10 of 10**; `story_reactions`' update is by column (`kind`) |
| 4 | `anon` and `service_role` hold nothing on the four | no row for either in the table grants |
| 5 | The three columns | `photos.caption` (nullable), `photos.story_derivative_ready` (`not null default false`), `reports.story_frame_id` (nullable) |
| 6 | The bucket | `story-media`, private, 62,914,560 bytes, mp4 · quicktime · webm · webp |
| 7 | Storage policies | `story_media_read` (select), `story_media_write` (insert) — no update, no delete |
| 8 | Triggers attached | `sessions_story_frames`, `photos_story_frame`, `materials_story_frame`, `story_frames_audit`, `story_frames_purge`, `reports_story_frame_guard`, `story_reactions_updated_at` |
| 9 | Function ACLs | the generator executable by **nobody**; `clock_story_frames`, `record_story_video`, `fail_story_video`, `record_photo_upload` by `service_role` only; the member-facing ones by `authenticated` only; none by `anon` |
| 10 | `record_photo_upload` | **one** overload, twelve arguments (the last two defaulted) |
| 11 | `resolve_report()` | carries the guard; `report_target` is `comment, photo, story_frame` |

## ★ Proven as the roles themselves, not asserted

| As | Attempt | Answer |
|---|---|---|
| a member | insert a frame | `42501` permission denied |
| an org admin | update frames | `42501` permission denied |
| `service_role` | delete frames | `42501` permission denied |
| `anon` | read frames | `42501` permission denied |
| a member **not checked in** | upload `source.mp4` under their own org and a well-formed path | refused by the write policy |
| a member | upload under a session segment that is not a uuid | **refused, not a cast error** (the `CASE`) |
| an org admin | upload `video.mp4` (the rendition) directly | refused — a client may only ever write a source |

So the precise statement is: **no client role writes a frame, and the only thing a client may put in the bucket is a
source file, under its own org, for a session whose capture window is open for that member.** The rendition and the
poster are the worker's. (`tests/rls/story-frames-content.test.ts` holds the admitted case — a checked-in attendee —
on the fixture; this rehearsal database has no rows to check in.)

## The production-only difference

`rls_auto_enable` (production's event trigger, every wave since 15) is not in a schema-only dump and is not in this
rehearsal; all four tables enable RLS themselves in `0198`, so its presence changes nothing.

## For the push

★ **Two pushes, from two trees.** `0194` is on `main` and in every wave branch: `supabase db push --include-all` (from any of them) applies it, and it should go FIRST and now, because `main`'s deployed app already expects it. `0198` and `0199` exist only on `wave-26d/stories`: they are pushed **from `../kareem-marefa-wave26d`**, where `supabase db push` applies both, in order — a push from the main checkout does not see them. Nothing on `main` names any of it, so `main`'s app
and worker on the new schema do nothing different; the three generator hooks begin writing frame rows nobody reads
until PR D merges. CI on PR #76 at this head: RLS and unit green on a clean database; build, end-to-end and frozen
routes green on the re-run.
