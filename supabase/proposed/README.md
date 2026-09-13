# supabase/proposed — SQL a teammate wants promoted (DEC-040)

Teammates never write into `supabase/migrations/`. One checkout, one local Supabase, and
`supabase db reset` applies every file on disk — a half-written migration breaks everyone the
moment it is saved, and two teammates would race for a sequence number.

Instead:

1. Write the SQL here, under your own folder: `supabase/proposed/<teammate>/<nn>_<name>.sql`.
   The CLI ignores this directory.
2. Prove it with the RLS suite. `applyProposed(tx, "<teammate>/<nn>_<name>.sql")` from
   `tests/rls/db.ts` runs the file inside the test's transaction, which is rolled back — the
   shared database is never changed.
3. When green, hand the lead: the file, the `03` §8.2 rows for every policy in it, the test
   names that cover them, and the `REQ-*` it serves. The lead numbers it, moves it into
   `supabase/migrations/`, runs `supabase db reset` and the full suite, and commits it.

Only the lead runs `supabase db reset`, `supabase start` and `supabase stop`.
