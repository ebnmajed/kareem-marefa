# Wave 29 · PR B — the ledger of changed assertions (`DEC-280`, `DEC-281`)

One line per changed assertion in an existing suite, written in the same commit as the change. New cases in new files
are not listed.

- `tests/rls/avatar-import.test.ts` · setup — `apply()` also applies `supabase/proposed/platform/0011_avatar_uploads.sql` (a no-op once promoted as `0223`), so the suite proves 0158's behaviour as `0223` leaves it. **No expectation moved by this line.** (platform)
- `tests/rls/avatar-import.test.ts` · «yes: … enqueues ONE import_avatar …» — **expectation changed**: the job's queue is `avatar:{member_id}`, not `convert` (`DEC-281` §1: one queue per member for both avatar jobs). The title follows. (platform)
- `tests/rls/avatar-import.test.ts` · «my_avatar() answers for the caller only …» — **expectation widened, additive**: the object gains `key` (any library key) and `source: "google"`; `answer`, `has_source`, `version` unchanged and still no URL. (platform)
- `tests/unit/avatar-import-job.test.ts` · harness — **setup, no expectation moved**: the fake storage answers by bucket (`avatars` holds the photos, `avatar-staging` the uploads), because the anonymised branch now also empties the staging prefix under the same three segments; before, one list served both buckets and counted each object twice. (platform)
