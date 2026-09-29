# scoring — working notes

Owner: `scoring` teammate, wave 2 (M4). Tracks: `REQ-PTS-001`…`014`, `REQ-LDR-001`…`008`,
`REQ-REC-001`…`009`, `REQ-RSV-005` (the priority-RSVP perk M2 deferred), the
`TODO(scoring, M4)` call site in `check_in()` (migration `0015`), OQ-004 no-shows.

## Story order

1. **`supabase/proposed/scoring/0001_m4_schema.sql`** — every M4 table (`02` §4.9–4.11), RLS,
   grants, catalogue seeded to A10. First, because the isolation sweep should cover these tables
   from the earliest possible sync.
2. `STORY-PTS-001` — `award_points()` (`05` §2.2) + `JOB-award_points`, wired into `check_in()`
   at its marked call site via a `create or replace function public.check_in(...)` in
   `supabase/proposed/scoring/0002_award_points.sql`.
3. `STORY-PTS-002` — the same for `rating_submitted`, `comment`, `photo` (comment/photo hooks are
   `content`'s and `event`'s tables — see "Hooks into other tracks' tables" below; flagged, not
   built silently).
4. `STORY-PTS-003` — `award_presenter_points()` + `JOB-award_presenter_points`, fanned out from
   `complete_session()` (`sessions`' RPC) the same way.
5. `STORY-PTS-004` — manual adjustment RPC (`05` §7, `assert_fresh_admin()`-gated).
6. `STORY-PTS-005` — reversal-on-removal (comment/photo delete → compensating row). Same
   cross-track hook problem as #3.
7. `STORY-PTS-006` — `audit_balances` (nightly, alert-only) + the rebuild-rollup script.
8. `SCR-022` (`/app/me/points`) — the history screen; the demonstrable's own test (`REQ-PTS-003`).
9. `LDR-001`…`004` — the four boards, `snapshot_leaderboards`.
10. `REC-001`…`004` — badges, levels, streaks, perks, their evaluators.
11. `SCR-053`/`SCR-054` under `/app/admin/{scoring,recognition}` (DEC-046's wave-2 carve-out,
    console inherits at wave 3).

## Status: all of the above shipped

Every story in the list above is done, tested and committed on `wave-2/m3-m4-m5`:
`0001_m4_schema` → `0011_award_badge_manually` (proposed, promoted by the lead as real migrations
along the way), `tests/rls/{scoring-schema,award-points,award-hooks-ratings-comments,
award-presenter-points,manual-adjustment-reversal,audit-balances,recognition-evaluators,
snapshot-leaderboards,all-time-leaderboard,priority-rsvp,award-badge-manually}.test.ts`, and the
screens `SCR-022`, `SCR-027`/`SCR-028`, `SCR-053`, `SCR-054`. `STORY-RSV-005` (priority_rsvp) is
also done — see "Hooks into other tracks' tables" below for why it needed a `create or replace`
of `reserve_seat()` with no marker, the same reasoning as the completion fan-out.

Two things flagged rather than silently narrowed:

- **Seasonal leaderboards are not scheduled.** `worker/src/tasks/snapshot_leaderboards.ts`
  snapshots monthly, topic (all-time per category) and company only — nothing in `02`'s frozen
  domain model or `org_settings` defines what a season's boundaries are, so there is nothing to
  schedule yet. The `leaderboard_kind` enum already carries `'seasonal'` for whoever defines one.
- **e2e and RTL screenshots are written, not run.** `tests/e2e/{points,leaderboards}.spec.ts` exist
  and read correctly against the real schema, but running them and taking the 390 px captures both
  need a fresh `.next` build, which is the lead's to produce. Flagged to the lead directly rather
  than left implicit.

`<PointsStrip memberId locale />` (`src/components/scoring/points-strip.tsx`) is ready for the
lead to wire onto the app home.

## Hooks into other tracks' tables (flagging, not silently building)

`award_points()` is called from write paths I do not own:

- `check_in()` (0015, `checkin`'s) — **mine to hook**, explicitly named in `TEAM.md` and the
  `TODO(scoring, M4)` comment already in the migration.
- `ratings` insert (`event`'s `submit_rating()` or equivalent), `comments` insert, `photos`
  insert (`content`'s, M5 table — does not exist yet) — same pattern: a `create or replace` of
  the owning track's RPC at a `TODO(scoring, M4)` call site, or (where no such marker exists yet)
  a trigger on the table itself. A trigger is simpler and does not require replacing a function
  I don't own the source of, so **I am using `after insert` triggers on `ratings`, `comments` and
  (later) `photos`** rather than `create or replace` on RPCs that belong to `event`/`content` —
  this only reads the row that was just written and calls `award_points()`; it does not change
  any behaviour of the owning RPC. Flagging for the lead: this is a trigger on someone else's
  table, which `CLAUDE.md`'s hook list names as one of the sanctioned mechanisms ("a trigger on
  `check_ins`, `ratings`, `session_presenters` or `sessions`") — `ratings` is explicitly listed.
- `comment_removed` / `photo_removed` reversals: same, an `after update` trigger on `comments`
  (soft-delete via `removed_at`) — no `photos` table yet, so the photo half is a `TODO(content,
  M5)`-style marker left in the trigger body's comment until `content`'s table exists.
- `no_show`: a fan-out from session completion. `sessions`' `complete_session()` has no
  `TODO(scoring, M4)` marker (it predates M4 being scoped), so this is **an `after update of
  state` trigger on `sessions`** (`when new.state = 'completed'`) rather than editing that RPC —
  same non-invasive shape as the ratings/comments hooks. Evaluates `REQ-PTS-008`/OQ-004 once, at
  completion, per confirmed RSVP with no check-in — matching `JOB-evaluate_no_shows`'s contract
  even though it runs as an inline trigger rather than a queued job (the requirement is "evaluated
  once, at completion"; a trigger inside the same transaction as the state flip satisfies that with
  one less moving part than a queued fan-out, and avoids a second `TODO` in code I don't own).
- **Org seeding.** `scoring_rules`, `badges`, `levels`, `streak_rules`, `perks` need one seeded row
  set per org (A10, §5.1–5.4). `create_org()` (0005, tenancy) has no `TODO(scoring, M4)` marker
  either. Rather than replacing that RPC, `0001_m4_schema.sql` adds an `after insert` trigger on
  `public.orgs` that seeds all five M4 catalogues for the new row. This also seeds the RLS
  fixture's two orgs for free, since `tests/rls/fixture.ts` inserts into `orgs` directly — no
  fixture changes needed for scoring's tests to have data.
- **`reserve_seat()` (STORY-RSV-005, the priority_rsvp perk).** No marker either, and for a
  different reason than the others above: granting an early window changes the RPC's own
  accept/reject decision, which a trigger cannot express (a `before insert` trigger only fires
  once `reserve_seat()` has already decided to attempt the write). `0010_priority_rsvp.sql` is a
  `create or replace` of checkin's `reserve_seat()` (0014) — every line unchanged except one new
  gate ahead of the existing capacity/deadline checks, using `org_settings.priority_rsvp_hours`
  (already seeded 24 by M1) against the session's `published_at`.

## Idempotency keys (`11` §2.3, `05` §2.1, verbatim plus the ones `05`/`11` didn't spell out)

```
<rule_key>:<source>:<source_id>:<member_id>:v<epoch>
```

| Action | Key |
|---|---|
| `check_in` | `check_in:check_in:<check_in.id>:<member_id>:v1` |
| `rating_submitted` | `rating_submitted:rating:<rating.id>:<member_id>:v1` |
| `comment` | `comment:comment:<comment.id>:<member_id>:v1` |
| `photo` | `photo:photo:<photo.id>:<member_id>:v1` (M5, deferred until `photos` exists) |
| `streak_month` | `streak_month:streak:<period_start date>:<member_id>:v1` |
| `proposal_accepted` | `proposal_accepted:proposal_accepted:<proposal.id>:<member_id>:v1` |
| `session_delivered` | `session_delivered:session_delivered:<session.id>:<member_id>:v1` (per presenter) |
| `attendee_bonus` | `attendee_bonus:attendee_bonus:<check_in.id>:<presenter_id>:v1` — **one row per qualifying attendee**, keyed to that attendee's own check-in, which is what `0087`'s reversal loop depends on. ⚠ **This row said something else until wave 9** — «one row per session per presenter, `amount = 2 × attendee_count`» — which is not what shipped: `0031`'s header and `worker/src/tasks/award_presenter_points.ts` have always called `award_points()` once per check-in. The plan was written, the SQL was built differently, and the table was never corrected. From wave 9 the set is distinct MEMBERS satisfying `session_attendance_complete()`, each keyed to their epoch check-in; at one day that is the same set, the same ids and the same rows as before. |
| `rating_bonus` | `rating_bonus:session_delivered:<session.id>:<presenter_id>:v1`, awarded by the +48h delayed job |
| `materials_uploaded` | `materials_uploaded:material:<material.id>:<presenter_id>:v1` (M5, deferred) |
| `no_show` | `no_show:no_show:<rsvp.id>:<member_id>:v1` — recorded at 0 pts always (`enabled=true, points=0` default) |
| `late_cancellation` | `late_cancellation:late_cancellation:<rsvp.id>:<member_id>:v1` |
| `comment_removed` | `comment_removed:reversal:<original_ledger_row_id>:<member_id>:v1` — **the reversal itself** uses `reversal:<original_ledger_id>:v1` per `05` §2.4; `comment_removed` is the separate, off-by-default *penalty* row, keyed independently |
| `photo_removed` | same shape, M5 |
| `manual_adjustment` | `manual:<fresh uuid>:v1` — never deduplicated, per `05` §7 |

The epoch (`v1`) is bumped only by a `DECISIONS.md`-logged re-award (`05` §4.3); nothing in code
bumps it automatically.

## Correction found while building `0001_m4_schema.sql`

`scoring_config_history` **already exists** — `supabase/migrations/0004_tenancy.sql` (M1), with
`scope check (scope in ('scoring', 'org_settings', 'badges', 'levels', 'perks', 'streaks'))`
already covering every M4 scope, full RLS (`config_history_read_admin`, admin-only select), and
`insert/update/delete` revoked from every client role including `service_role`. `0001_m4_schema.sql`
does **not** recreate it — it reuses it directly, mirroring `org_settings_history()` (0004)'s exact
shape (one row per changed column, written by a `security definer` trigger) in
`scoring_rules_history()`. The "03 §8.2 rows this schema covers" list below therefore reads
`POL-scoring_config_history.select.admin` as **already proven** by M1's own tests
(`tests/rls/tenancy.test.ts`), not as a new row this migration adds.

## Rule-version column and forward-only changes

`scoring_rules.version` starts at `1`, bumped by the (not-yet-built) admin config RPC on every
edit, with a row appended to `scoring_config_history` in the same transaction (`REQ-PTS-005`).
`points_ledger.rule_version` is stamped from `scoring_rules.version` **at award time**, so a later
edit never changes what an old row says produced it (`REQ-PTS-004`).

## Recompute reproducing every balance exactly

- `points_balances` is a trigger-maintained left fold over `points_ledger` (`05` §2.3). The
  trigger fires `after insert` on `points_ledger` only — there is no update/delete path to hook
  (the table forbids both), so the trigger body is a single `insert … on conflict (member_id) do
  update set total_points = points_balances.total_points + excluded.total_points, last_entry_id =
  excluded.last_entry_id`.
- **Rebuild** (`05` §4.2): `truncate points_balances; insert into points_balances (member_id,
  org_id, total_points, last_entry_id) select member_id, org_id, sum(amount), max(id) … group by
  member_id, org_id` — safe because the ledger is insert-only, proven by an RLS test that awards
  points via three different rules, truncates the rollup, rebuilds it, and asserts the same
  `total_points`.
- `JOB-audit_balances` (nightly, `worker/src/tasks/audit_balances.ts`) re-derives with `sum()` and
  compares against `points_balances.total_points` **and** `last_entry_id`; a mismatch calls
  `TODO(notify)` (an alert channel, not yet promoted) and writes nothing back — never self-heals.

## `notify()` call sites (all `TODO(notify)` until `notify`'s `public.notify()` is promoted)

- Badge awarded (`REQ-REC-007`).
- Level up (`REQ-REC-007`).
- Perk granted (`REQ-REC-007`).
- Streak awarded (`REQ-REC-009`, if in the matrix — verify against `08` when `notify` lands).

## Leaderboards — snapshot mechanics

- All-time: live query over `points_balances`, no snapshot.
- Monthly/seasonal/topic/company: `leaderboard_snapshots` + `leaderboard_entries`, written by
  `JOB-snapshot_leaderboards`. `active_member_count` frozen at snapshot time for company boards
  (`05` §6.2, DEC-016). Provisional snapshots (`is_final = false`) are replaced in place
  (`delete … where snapshot_id = … ` then re-insert entries, or `on conflict` on the snapshot
  natural key) until the period closes; the final one is `is_final = true` and never touched
  again — enforced by a trigger refusing `update`/`delete` on a snapshot row once `is_final`.

## Screens

- `/app/me/points` (SCR-022) — the member's full history, explainable without asking anyone
  (`REQ-PTS-003`). Zero-point rows, reversals, manual adjustments, and "what earns what" read
  live from `scoring_rules`.
- `/app/leaderboards` (SCR-027) — the four boards.
- `/app/leaderboards` سباق الشركات view (SCR-028) — both metrics always shown (`REQ-LDR-004`).
- `/app/admin/scoring`, `/app/admin/recognition` (SCR-053/054) — DEC-046's wave-2 carve-out for
  `scoring`; `console` inherits at wave 3, matching DEC-042's pattern for `sessions`.
- `<PointsStrip memberId locale />` slot at `src/components/scoring/points-strip.tsx` — server
  component, own data via the DAL, no heading, wired onto the app home by the lead.

## `03` §8.2 rows this schema covers (see the migration header for the authoritative list)

`POL-scoring_rules.update.admin`, `POL-scoring_rules.catalogue`,
`POL-scoring_config_history.select.admin`, `POL-points_ledger.insert`,
`POL-points_ledger.update`, `POL-points_ledger.select`, `POL-points_ledger.idempotency`,
`POL-leaderboard_entries.select.opt_out`, plus new rows for badges/levels/perks/streaks
select-only policies (P1/P2 pattern, `03` §5.7).

## Handoff to wave 3

M4 is done: the ledger engine (`0027`–`0033`, `0041`–`0043`, `0047`), the four boards
(`0044`), the priority RSVP hook (`0045`), and five screens (`SCR-022`, `SCR-027`/`028`,
`SCR-053`/`054`). `console` inherits `app/admin/{scoring,recognition}/**` at wave 3, the
same DEC-042 pattern `sessions` handed `console` for the M2 admin screens. What follows is
what a wave-3 lead would otherwise have to rediscover.

### ⚠️ Four evaluator jobs are built, tested and NOT scheduled

`evaluate_streaks`, `evaluate_badges`, `evaluate_levels_perks` and `snapshot_leaderboards`
each have a working `security definer` SQL function (`0041`, `0042`), a thin worker task
(`worker/src/tasks/evaluate_{streaks,badges,levels_perks}.ts`,
`worker/src/tasks/snapshot_leaderboards.ts`), and RLS tests proving the SQL is correct — but
none of the four is in `worker/src/index.ts`'s `taskList` or `crontab`, unlike
`award_points`, `award_presenter_points`, `evaluate_no_shows` and `audit_balances`, which
are. **Until this is fixed, no badge, level, perk or leaderboard snapshot is ever produced
by a running worker** — only by a test calling the SQL function directly. This is not a
design gap, it is an unfinished sync: `worker/src/index.ts` is the lead's file, not mine,
and the four tasks landed at syncs 6–7 without a matching registration. Fix:

```ts
import { evaluate_streaks } from "./tasks/evaluate_streaks.js";
import { evaluate_badges } from "./tasks/evaluate_badges.js";
import { evaluate_levels_perks } from "./tasks/evaluate_levels_perks.js";
import { snapshot_leaderboards } from "./tasks/snapshot_leaderboards.js";
// add all four to taskList, and to crontab:
// "0 1 * * * evaluate_streaks", "0 1 * * * evaluate_badges",
// "0 1 * * * evaluate_levels_perks", "0 2 * * * snapshot_leaderboards"
```
Run the streaks/badges/levels evaluators before the snapshot (a level or badge earned
overnight should be reflected in that night's boards) — 1 AM and 2 AM Asia/Riyadh (22:00 and
23:00 UTC) is one reasonable split; `audit_balances` already runs at `0 0 * * *` (00:00 UTC =
03:00 Riyadh) for comparison. None of the three evaluators or the snapshot job need to run
more than nightly — `11` §2.3 says nightly for all four, and `evaluate_levels_perks`'s
"also on balance change" half (job-key-replace on every `award_points` call) was never built;
the nightly run is the only trigger that exists today, which is a legitimate reading of `11`
but worth knowing is the whole of it.

### What `console`'s screens actually do, so a review doesn't relitigate it

- **`/app/admin/scoring` (SCR-053), the catalogue editor**: a plain Supabase table `UPDATE`
  on `scoring_rules` (`points`, `enabled`, `cap_per_session`, `cooldown`) — no RPC. The
  version bump and the `scoring_config_history` row are **not** written by the DAL
  (`src/lib/dal/scoring-admin.ts`); they happen inside `0027`'s
  `scoring_rules_before_update`/`scoring_rules_history` triggers on the table itself, so
  they fire no matter what writes the row (this screen, a future API, a one-off fix). Don't
  add a second version-bump anywhere upstream of the table — the trigger already owns it.
- **The manual-adjustment form** on the same screen calls `adjust_points_manually(p_member,
  p_amount, p_reason)` (`0032`) directly via `supabase.rpc()` — `assert_fresh_admin()` inside
  the RPC is the real gate; the DAL's `assertAdmin()` (`session.role === "admin"`) is only
  there to 404 the screen early for a non-admin, exactly like `notify`'s reminders screen.
  The member is identified by raw UUID typed into a text field — there is no member picker
  or search here. That's a real gap for `console` to close with whatever member-search
  component `admin/members` ends up building; wiring one in is a UI change, not a new RPC.
- **The perk toggle** (`/app/admin/recognition`, SCR-054) is a plain `UPDATE` on `perks.enabled`
  — no RPC, no side effect beyond the column. It is the *only* switch for the priority-RSVP
  window's very existence (see the promotion decision below) — turning `priority_rsvp` on
  is a real behaviour change for every future publish, not a cosmetic toggle, and the screen
  doesn't say so as strongly as it probably should. Worth a copy pass at wave 3.
- **The manual badge-award form** calls `award_badge_manually(p_member, p_badge, p_reason)`
  (`0047`) the same way — idempotent on `(member, badge)`, so resubmitting is harmless.

### Two decisions the lead made at promotion that changed my files, and why they matter to whoever edits these tables next

1. **`points_ledger`, `leaderboard_snapshots` and `leaderboard_entries` each got a
   `before update or delete` trigger that raises for *every* writer, including the table
   owner** (`points_ledger_append_only`, `leaderboard_snapshot_guard`,
   `leaderboard_entry_guard`, all in `0027`). My original design only revoked the client
   roles' grants — correct for `authenticated`/`service_role`, but a `security definer`
   function (including every RPC in this file) runs as the table owner, and ownership isn't
   subject to `revoke`. The trigger is what actually makes invariant 9 true. **Each trigger
   has one exception**: `if tg_op = 'DELETE' and not exists (select 1 from orgs where id =
   old.org_id) then return old` — an org deletion cascades through, because by the time the
   cascade reaches these tables the parent `orgs` row is already gone. If you add a new
   append-only table under this pattern, copy the exception, not just the raise, or cascading
   deletes on that table will fail loudly instead of proceeding.
2. **`priority_rsvp` ships `enabled = false`, like `can_host`, and the whole priority-window
   block in `reserve_seat()` (`0045`) is wrapped in `exists (select 1 from perks where
   key = 'priority_rsvp' and enabled)`.** My first version shipped the perk enabled by
   default with a 24-hour window (OQ-012's literal default) — with nobody holding the perk
   yet, that closed general RSVP for a day after every publish, which broke the M2
   demonstrable and four wave-1 RSVP tests that reserve immediately at publish. An org turns
   the window on deliberately by enabling the perk on `/app/admin/recognition`; until then,
   `reserve_seat()` behaves exactly as it did before M4 existed.

### The M4 fixture baseline (`tests/rls/fixture-m4.ts`, wired into `seed()`, not mine to edit)

Per org, for **`members[0]` only** (never `members[1]`, `mod`, or `admin`): one
`points_ledger` row (`check_in`, 10 points, `occurred_at` 30 days back so it's outside any
cooldown, on the `m2.completed` session — `points_balances` for that member reads 10), one
`member_badges` row (the org's first badge by key), one `streak_awards` row for the current
month, one `member_perks` row (`priority_rsvp`, regardless of whether the perk is enabled —
the fixture arranges history directly, it doesn't call `reserve_seat()`), and one **final**
`all_time` `leaderboard_snapshots` row with a `members[0]` entry (rank 1, 10 points) and a
company entry (rank 1, 10 points, `points_per_active_member = 3.33`). Every scoring RLS test
in this repo that asserts an exact count, an exact balance, or "nothing happened yet" for
`members[0]` must account for this baseline or use a different member — I lost real time to
this twice before adopting `members[1]` as the default test subject; grep this file's own
tests for the pattern (`f.a.members[1]`) rather than rediscovering it.

### Everything else that's genuinely settled, not just untested

Seasonal leaderboards (`leaderboard_kind = 'seasonal'`) have no snapshot job wired to them —
nothing in `02`'s frozen domain model or `org_settings` defines a season's boundaries, so
there was nothing to schedule. `evaluate_levels_perks`'s never-demote rule and `can_host`'s
disabled-by-default are both enforced in the SQL function itself, not the screen — a
`console` UI bug on `/app/admin/recognition` cannot violate either invariant no matter what
it lets an admin click. The RLS suite's isolation sweep already covers every M4 table
automatically (it's generated over `pg_tables`); a new M4-adjacent table needs `org_id`, RLS,
and a policy, and the sweep finds it the same day.

## Company points rules (post-launch, 2026-09-15)

The owner's decision, verbatim in substance: "The company is awarded a certain number of
points based on the employees' participation. Creditable rules: the company hosting; the
percentage of attended employees; the percentage of presenting employees." Today's company
score (`05` §6.2, `REQ-LDR-004`, `REQ-PRF-003`) is derived only — the sum of a company's
members' points over the period, divided by the active-member count frozen at snapshot time.
This section adds three company-level rules on top of that sum, built and tested; three
design decisions follow, each with the alternative considered and why it lost, per the
lead's request.

### (a) "The company hosting" — the smallest honest link

There is no venue→company link in `02`'s frozen domain model, and I did not add one.
`venues` is an org-managed, reusable list (`ENT-venues`) — the same meeting room hosts
sessions for many different presenting companies over time, and a session can also use
`custom_venue_name` with no `venues` row at all. A permanent `venues.company_id` would
conflate "where" with "who is credited for hosting," and would silently misattribute every
session at a shared venue to whichever company the venue happened to be tagged for.

Instead: a **nullable `sessions.host_company_id uuid references companies(id)`**, set per
session. Null by default — hosting credit is opt-in per session, not inferred. A same-org
guard trigger (`sessions_host_company_same_org`) mirrors `members_company_same_org` (0027)
exactly. This is schema (SQL), proposed like every other M4 table; the lead logs the DEC at
promotion since `sessions` is not my table to alter as app code, only as a proposed column.

**Known gap, flagged rather than silently narrowed:** the real scheduling screen
(`app/admin/sessions/**`) is `console`'s, not mine to edit. Until `console` adds a field,
`/app/admin/scoring` carries a stopgap form — a session ID typed into a text field plus a
company `<select>` — the same pattern the manual point-adjustment form already uses for a
raw member ID (this file's wave-2 handoff section already flagged that one; this is the same
trade twice). `setSessionHostCompany()` in `lib/dal/scoring-admin.ts` is the write path; the
RLS boundary is `sessions`' own `sessions_update_admin` policy plus a new column grant
(`grant update (host_company_id) on sessions to authenticated`) — no new policy of mine.

### (b) The two percentage rules — scope and shape

Evaluated once, per **completed** session (mirroring `no_show`'s "evaluated once, at
completion" contract exactly), for **every company that had at least one active member
attend or present at that session** — not scoped to the session's host company alone. This
is an assumption, not a certainty: the owner's three bullets read as three independent
company-level signals to me, matching how the derived leaderboard total is already
company-agnostic (every company's members contribute regardless of who "hosted" what), so I
built the general reading. The narrower reading — "did the *host* company's own people show
up to the session it hosted" — is equally plausible and is a one-line `where` change in
`evaluate_company_points()` if the owner means that instead (filter the attendance/presenting
loops to `s.host_company_id` rather than iterating every company with a match). **Flagging
this as the open question I did not guess past**, with my default stated and reasoned above.

Each rule is **proportional**, not threshold pass/fail: `points = round(percent × 100 ×
points_per_percent)`, capped at `cap_points`, admin-editable per rule (`points_per_percent`,
`cap_points`) exactly like `scoring_rules`' existing knobs (`points`, `cap_per_session`) are
editable on the same screen. A proportional design was closer to "percentage... is
creditable" than a binary threshold, and is the more informative signal on the board
(`REQ-LDR-004`'s own reasoning — show the real number, don't collapse it to pass/fail).

**A fourth decision the owner did not ask for, stated as a recommendation, not a silent
default:** `min_active_members` (seeded 3) gates both percentage rules. Without it, a
one-person company hits 100% attendance and 100% presenting on every session it touches —
exactly the small-denominator gaming `05` §6.2 already names and contains for the derived
`points_per_active_member` metric (a required deactivation reason, both metrics always
shown). The percentage rules have the identical shape of exposure with no existing
containment, so I added the same kind of guard rather than leaving it open. Admin-editable,
so an org that judges 3 too strict (or too lax) changes it without a migration.

### (c) A separate append-only ledger, not a nullable `points_ledger.member_id`

`company_points_ledger` mirrors `points_ledger` (0027) column for column, its own
`company_points_balances` rollup, its own append-only trigger (with the identical org-deletion
cascade exception), revoked from every client role including `service_role`, one door in
(`evaluate_company_points()`, `SECURITY DEFINER`). I considered widening `points_ledger` to
carry `company_id` alongside a now-nullable `member_id` (the `leaderboard_entries` shape,
`num_nonnulls(member_id, company_id) = 1`) and rejected it: `points_ledger.member_id` is
`not null` today and every one of its policies, its rollup trigger, and `getPointsHistory()`
in the DAL assume a member is always present. Making that column nullable is not additive —
it is a change to an invariant three other pieces of code already depend on, for a shape
`leaderboard_entries` already proves is not free (it needed its own `check` constraint and a
`member_id is null` branch in its own RLS policy). A dedicated table is the smaller, more
honest change, and it is what the lead's own task message recommended by default.

`company_points_ledger.meta jsonb` carries the raw counts behind a percentage row (`attended`/
`presenting`, `active_members`, the computed `percent`) — REQ-PTS-003's "explainable without
asking anyone" extended to company scope. `/app/leaderboards`' new "your company's points"
section (`CompanyPointsBreakdownSection`) reads it directly, so a member can see "3 of 5
active employees attended (60%)," not just the point amount.

### How company points enter سباق الشركات (`REQ-LDR-004`)

`snapshot_leaderboard()` (0042, my own function — a `create or replace`, not a hook into
another track) now sums **member-derived points PLUS company-ledger points** in the period,
per company, before ranking. `active_member_count` — the frozen denominator `05` §6.2
requires — is unchanged: it was never derived from `points_ledger` in the first place, so
adding a second points source changes only the numerator. Both `total_points` and
`points_per_active_member` therefore already include the three new rules on every board that
shows them, with no separate "company rules total" column needed — REQ-LDR-004's "both
metrics always shown" continues to mean the same two numbers it always meant.

### Idempotency keys (extending this file's existing table, `05` §2.1)

| Action | Key |
|---|---|
| `company_hosting` | `company_hosting:session_delivered:<session.id>:<company.id>:v1` |
| `company_attendance_pct` | `company_attendance_pct:session_completed:<session.id>:<company.id>:v1` |
| `company_presenting_pct` | `company_presenting_pct:session_completed:<session.id>:<company.id>:v1` |

### The hook into `sessions` — SQL only, per DEC-046's discipline

`evaluate_company_points(session)` is called from **`worker/src/tasks/evaluate_no_shows.ts`**
(a file I already own), not from a new job. `sessions_completion_fanout()` (0031, also mine)
already enqueues exactly one `evaluate_no_shows` job per completed session, unconditionally —
"evaluated once, at completion," the identical contract the owner's rules need. Folding the
company evaluation into that existing job means this story needs **zero new job types and
zero `worker/src/index.ts` registration** — the one task file this track already owns just
does one more thing. `audit_balances.ts` (also already mine) got the same treatment: it now
checks `audit_company_balances()` alongside `audit_balances()`, same non-self-healing
contract, same separate `rebuild_company_points_balances()` response.

### A genuine Postgres trap hit while building this, recorded so nobody else loses the hour

`select * into r into a `%ROWTYPE` variable, then testing `r is not null` to mean "was a row
found," is WRONG when the row itself legitimately has some `null` fields — which every rule
row here does, by the shape `check` constraint itself (`company_hosting`'s `points_per_percent`
is always null; the percent rules' `points` is always null). SQL row-wise `IS [NOT] NULL`
requires **every** field to be null (or non-null) for the whole row to test true — a row with
a mix of null and non-null fields is neither `IS NULL` nor `IS NOT NULL`. `evaluate_company_points()`
tests `r_host.id is not null` (a column that is never null once a row exists), not `r_host is
not null`, for exactly this reason — the same idiom `select ... into s; if not found then
return; end if;` already uses one line above it, just spelled differently because that one
tests `FOUND` immediately rather than the row itself. Caught by three RLS tests silently
returning zero rows with no error before this was fixed.

### Files, `03` §8.2 rows, and tests

- **SQL:** `supabase/proposed/scoring/0001_company_points.sql` — `sessions.host_company_id`
  (+ guard trigger + column grant), `scoring_config_history`'s scope `CHECK` widened
  (wrapping the *current* definition, not retyping M1's original list — another track had
  already widened it once for `'branding'`; retyping would have silently dropped that value),
  `company_scoring_rules`, `company_points_ledger`, `company_points_balances`,
  `evaluate_company_points()`, `audit_company_balances()` /
  `rebuild_company_points_balances()`, `_seed_org_scoring()` extended (+ backfill for orgs
  that already exist — including the live "kareem" org, once this is promoted and pushed),
  `snapshot_leaderboard()` extended. The full `03` §8.2 list is in the migration's own header.
- **Tests:** `tests/rls/scoring-company-points.test.ts` — 18 cases, all passing:
  `POL-company_scoring_rules` (select, update.admin, catalogue, shape, history),
  `POL-sessions.host_company_same_org`, `POL-company_points_ledger` (insert, update/delete,
  select), `RPC-evaluate_company_points` (service_role_only, hosting incl. idempotent replay,
  no-host case, attendance_pct with meta, presenting_pct, the `min_active_members` gate),
  `ENT-company_points_balances rollup` (rebuild reproduces exactly, audit never self-heals),
  `RPC-snapshot_leaderboard.company_ledger_included`.
- **DAL:** `lib/dal/leaderboards.ts` (+`getCompanyPointsBreakdown()`), `lib/dal/scoring-admin.ts`
  (+company rule CRUD, +`setSessionHostCompany()`, +`listCompaniesForAdmin()`, extended
  `getScoringAdminData()`), add-only per the ownership rule.
- **UI:** `/app/admin/scoring` (SCR-053) gained a "company rules" section plus the host-company
  stopgap form; `/app/leaderboards` (SCR-028) gained a "your company's points" breakdown
  section (`components/scoring/company-points-breakdown.tsx`), Arabic-first, all six ICU
  plural forms where a count appears, `<bdi>` on every interpolated value, `formatNumber`
  throughout (never ICU's bare `#`).
- **Worker:** `worker/src/tasks/evaluate_no_shows.ts` and `worker/src/tasks/audit_balances.ts`
  extended in place — no new task files, no `worker/src/index.ts` change needed.

### Open questions for the lead / owner (not guessed past)

1. **(b) above, restated as a decision to confirm:** are the two percentage rules meant to
   apply to *any* company with attending/presenting members at a session (what I built), or
   only to the session's *host* company (measuring the host's own turnout)? My default is the
   former; the fix if wrong is a one-line `where s.host_company_id = rec.company_id` in
   `evaluate_company_points()`.
2. **`min_active_members = 3`** — my own anti-gaming addition, not something the owner asked
   for by name. Confirm the default, or the org edits it on `/app/admin/scoring` regardless.
3. **The host-company stopgap form** on `/app/admin/scoring` needs `console` (or the lead) to
   replace it with a real field on the scheduling screen — flagged, not silently left as the
   permanent UI.
4. **Seed defaults** (`company_hosting` 100 pts flat; attendance 1 pt/1%, capped 100;
   presenting 2 pts/1%, capped 150) are placeholders sized to be roughly comparable to the
   existing catalogue's scale (`session_delivered` is 50, `attendee_bonus` caps at 60) — every
   one is admin-editable from day one, so getting the exact numbers "right" was not the goal.

---

# Wave 9 plan — multi-day sessions (`REQ-SES-017`, `DEC-119`, `DEC-150`)

Written 2026-09-17, planning-only first task. Nothing below is built yet. The two contracts other
tracks wait on lead the section, because `checkin` cannot switch a call site until contract 5 is
promoted.

**The one sentence the whole plan turns on.** The award's idempotency key already carries the
member's check-in id, and at `n = 1` *the member's only active check-in is also the last one they
created*. So the epoch the key needs for `REQ-SES-017` is not a new concept — it is **the latest
active check-in of `(session, member)`**, which at `n = 1` is the same row `main` keys on today.
That single definition gives per-member-per-session idempotency, survives wave 7's remove → re-add,
and makes the one-day row byte-identical without a branch.

---

## CONTRACT 5 — `attendance_recorded` / `attendance_removed` (P1, first, `checkin` waits on it)

```sql
create function public.attendance_recorded(p_check_in uuid) returns void
  language plpgsql security definer set search_path = '';
create function public.attendance_removed(p_check_in uuid) returns void
  language plpgsql security definer set search_path = '';

revoke execute on function public.attendance_recorded(uuid) from public, anon, authenticated;
revoke execute on function public.attendance_removed(uuid)  from public, anon, authenticated;
grant  execute on function public.attendance_recorded(uuid) to service_role;
grant  execute on function public.attendance_removed(uuid)  to service_role;
```

Definer, owner-executable, so `check_in()`, `mark_checked_in_manually()` and `remove_check_in()`
(all definer, all owned by the same owner) can call them with no new grant to `authenticated`.
`service_role` so a worker task can call them directly.

★ **The first promoted version does exactly what `main` does today, and nothing else.** That is the
whole point of publishing them before `checkin` switches:

- `attendance_recorded(ci)` reads the check-in row, and **enqueues the same job `main` enqueues**:
  task `award_points`, job key `pts:check_in:<ci.id>`, payload
  `{ rule: 'check_in', member_id, source: 'check_in', source_id: <ci.id>, session_id }`. Nothing
  else. It does not award inline; `11` §2.3's rule that the member's action never waits is
  unchanged.
- `attendance_removed(ci)` does what `remove_check_in()`'s three inline blocks do today: the
  compensating `reversal` rows for the `check_in` and `attendee_bonus` awards keyed to that
  check-in, key `reversal:<ledger id>:v1`, reason «أُلغي تسجيل الحضور»; and the `no_show` award for
  a confirmed RSVP. **It does not revoke the certificate** — `revoke_certificate()` is `designer`'s
  and stays in `remove_check_in()` where it is, because contract 5 is about *points*.

So after promotion, `checkin` replaces three blocks with three calls and **every assertion in
`tests/rls/{checkin-removal,checkin-manual-mark,award-points}.test.ts` reads the same result**. The
behaviour change is P3's, landed in a second proposed file, in the body of these two functions —
never at the call site.

**The call sites, for `checkin`:**

| Function | Where | Replaces |
|---|---|---|
| `check_in()` | after the `check_ins` insert commits, before the return | the `enqueue_job('award_points', …, 'pts:check_in:' \|\| ci.id)` block |
| `mark_checked_in_manually()` | after `write_audit` | the same `enqueue_job` block |
| `remove_check_in()` | after the `update … set removed_at`, before `write_audit` | the `for ledger in … loop` (reversals) and the `no_show` block |

---

## CONTRACT 6 — the attendance predicate (P2)

```sql
create function public.session_attendance_complete(p_session uuid, p_member uuid)
  returns boolean
  language sql stable security definer set search_path = '';

create function public.session_attendance(p_session uuid, p_member uuid)
  returns table (session_day_id uuid, position int, starts_at timestamptz,
                 ends_at timestamptz, attended boolean, check_in_id uuid)
  language sql stable security invoker set search_path = '';
```

**`session_attendance_complete`** — an **active** (`removed_at is null`) check-in on **every** day
of the session when `sessions.require_all_days`, on **any** day otherwise. It is the only definition
of «attended the session» for points and certificates.

- `security definer`, `execute` revoked from `public, anon, authenticated`, granted to
  `service_role`. Its callers are jobs (`service_role`) and other definer functions
  (`fan_out_certificates()`, `issue_certificate()`, `listEligibleRecipients()`'s RPC), which run as
  the owner and so need no grant. A member never calls it, and a member-invoked copy would silently
  return `false` for anyone else's attendance — a wrong answer dressed as a policy decision.

**`session_attendance`** — one row per day, attended or not, ordered by `position`. This is the
*read*, so it is `security invoker` and `grant execute to authenticated`: `checkins_read`
(`0010:511`) already says «self, staff, or the session's presenter», which is exactly the audience.
No new policy, no new grant on a table.

★ **`n = 1`:** `session_attendance_complete(S, M)` is true exactly when `M` has an active check-in
on `S`'s single day — which is `has_checked_in()` for that member, and is what «attended» means on
`main`. `session_attendance(S, M)` returns one row. **`has_checked_in()` is not mine and does not
change**; it stays the definition for rating, photos and a session-scoped «بعد» material
(contract 6's own split).

---

## The award key — exact shape, and the epoch

**The shape is unchanged** (`05` §2.1): `<rule_key>:<source>:<source_id>:<member_id>:<epoch>`. For
attendance:

```
check_in:check_in:<EPOCH CHECK-IN id>:<member_id>:v1
```

★ **`EPOCH CHECK-IN` = the member's latest-created active check-in for that session** —
`order by created_at desc, id desc limit 1` over
`check_ins where session_id = S and member_id = M and removed_at is null`.

Why this and not `<session_id>`:

- **At `n = 1` it is literally today's key.** One day, one active check-in, so the latest active
  check-in is the only check-in — the row, the key, the job key and the payload are `main`'s.
- **It is per member per session in substance**, which is what `REQ-SES-017` asks for: three
  check-ins on a three-day workshop produce **one** award, and re-running the completion job
  produces zero rows.
- **It survives remove → re-add**, which a literal `<session_id>` key does not. Every re-add
  necessarily creates a new `check_ins` row whose `created_at` is later than every existing one, so
  the key advances **exactly when, and only when, attendance was retracted and re-established** —
  the one case where a second award is correct. A `<session_id>` key would collide on the re-add,
  award nothing, and leave the reversal standing: net zero for a member who attended every day.
- **It is deterministic from the data**, so two concurrent runs compute the same key and
  `on conflict do nothing` decides.

The presenter's `attendee_bonus` uses the **same epoch row** —
`attendee_bonus:attendee_bonus:<EPOCH CHECK-IN id>:<presenter_id>:v1` — so the attendee's award and
the presenter's bonus for that attendee are keyed to one row and reverse together, as they do today.

⚠ **`REQ-SES-017` says «the idempotency key is per member per session».** This key is per member per
session *per attendance epoch*. The requirement's own purpose clause — «so re-running the job cannot
double-pay» — is satisfied exactly; the literal shape is not, and the literal shape is the one
`DEC-150` contract 6 already calls «a naive per-session key [that] turns [remove → re-add] into a
net zero». **Question 1 below asks the lead to rule.**

### Trace (a) — remove → re-add on a three-day session

`S` has days `D1 D2 D3`; `require_all_days = true`; member `M`; `check_in` rule = 20 points, no cap,
no cooldown (`0083:25`).

| # | Event | Ledger written | Balance |
|---|---|---|---|
| 1 | `M` checks into `D1` → `CI1`. `attendance_recorded(CI1)`: `n = 3`, `S` not completed → nothing | — | 0 |
| 2 | `D2` → `CI2`, `D3` → `CI3`. Same | — | 0 |
| 3 | `S` → `completed`. `sessions_completion_fanout()` enqueues `evaluate_no_shows`, key `noshow:<S>` | — | 0 |
| 4 | The job calls `evaluate_session_attendance(S)`. `M` active on all three; predicate true; epoch = `CI3` → `award_points('check_in', M, 'check_in', CI3, S)` | **L1** `+20`, `source check_in`, `source_id CI3`, key `check_in:check_in:CI3:M:v1` | **+20** |
| 5 | Admin removes `CI1`. `attendance_removed(CI1)`: predicate now false, standing award `L1` not yet reversed | **L2** `-20`, `source reversal`, `source_id L1`, `rule_key check_in`, «أُلغي تسجيل الحضور», key `reversal:L1:v1` | **0** |
| 6 | Admin re-adds `M` on `D1` → `CI4`. `attendance_recorded(CI4)`: `S` is completed, predicate true again, epoch = `CI4` (latest created) | **L3** `+20`, key `check_in:check_in:CI4:M:v1` — **a new key, no conflict** | **+20** |
| 7 | `noshow:<S>` replayed | predicate true, epoch still `CI4`, same key as `L3` → `on conflict do nothing`, **zero rows** | **+20** |

Three rows, every movement explained to the member, net `+20`. **No `no_show` is recorded at step 5**
— `CI2` and `CI3` are still active, so `M` is not a no-show (see the five cases below).

### Trace (b) — the completion job run twice

Steps 3–4 above, then the job runs again: the same active set → the same epoch `CI3` → the same key
→ `on conflict do nothing`, **zero rows**. The reversal branch does not fire, because a standing
award exists *and* the predicate holds. `evaluate_company_points()` and the no-show loop are already
idempotent on their own keys. Two runs, one row.

### Trace (c) — a one-day session, before and after this change

| | `main` today | After |
|---|---|---|
| The call | `check_in()` runs `enqueue_job('award_points', {...}, 'pts:check_in:' \|\| CI1)` inline | `check_in()` calls `attendance_recorded(CI1)`, which runs **the same `enqueue_job`** |
| Job key | `pts:check_in:<CI1>` | `pts:check_in:<CI1>` |
| Payload | `{rule:'check_in', member_id:M, source:'check_in', source_id:CI1, session_id:S}` | identical |
| Ledger row | `+20`, `source check_in`, `source_id CI1`, `rule_key check_in`, `rule_version`, reason «تسجيل حضور مؤكَّد», key `check_in:check_in:CI1:M:v1` | **identical, the same row** |
| At completion | `evaluate_no_shows` runs the no-show loop and company points | plus `evaluate_session_attendance(S)`: epoch = `CI1`, the same key → **conflict → zero rows** |

**One extra proven no-op, and not one byte of difference in the row.** That is the `n = 1` proof for
P3, and `tests/rls/award-points.test.ts`'s job-key, payload and end-to-end cases assert it without
being edited.

### Where the guard lives

`award_points()` keeps `0088`'s late-job clause and gains **one more, for `source = 'check_in'`
only**:

```
if p_source = 'check_in' and (the named check-in is removed)                 then return; end if;  -- 0088, unchanged
if p_source = 'check_in' and not session_attendance_complete(p_session, p_member) then return; end if;  -- new
```

★ **The second clause provably never fires at `n = 1`**: with one day, a *named check-in that is not
removed* means an active check-in on the only day, which makes the predicate true. So the new clause
can only change an outcome when `n > 1`. It follows `0065`'s and `0088`'s stated principle — re-derive
from `check_ins` at run time rather than trusting the payload.

⚠ **No predicate guard is added for `source = 'attendee_bonus'.** `tests/rls/award-presenter-points.test.ts:188`
calls `award_points('attendee_bonus', …)` directly over hand-inserted `check_ins` rows; the filtering
for the presenter's bonus belongs in `worker/src/tasks/award_presenter_points.ts`, where wave 7
already put the `removed_at` filter, and that test stays untouched.

---

## The five cases of P3, each answered

**1. `award_presenter_points` pays `attendee_bonus` per active check-in.** At three days that is
three bonuses per attendee, and the rule's `cap_per_session = 30` occurrences (60 points) would be
exhausted by ten attendees instead of thirty. **Fix, in the task, not in `award_points()`:** loop
over **distinct members** with an active check-in on the session where
`session_attendance_complete(session, member)` is true, and award once per such member with
`source_id = <that member's epoch check-in>`. At `n = 1` that is exactly today's loop — one active
check-in per member, so the same set, the same `source_id`, the same key, the same rows, and
`award-presenter-points.test.ts:188` passes unedited.

**2. Who is a no-show at three days.** **No active check-in on *any* day.** A member who came on day
one and missed days two and three is a **partial attendee**, not a no-show. Reasons: `REQ-SES-017`
says partial attendance **earns nothing** and pointedly does not say it is penalised; `no_show` is
`enabled = true, points = 0` by default (D40), a *record* an admin reads before deciding to enable a
penalty, and recording a partial attendee as a no-show would make that record a lie; and the key
stays `no_show:no_show:<rsvp.id>:<member_id>:v1`, one row per RSVP, which contract 2 requires. The
existing query in `evaluate_no_shows.ts` — «a confirmed RSVP with no active check-in for this
session» — is **already correct at any `n`** and needs no change. **`attendance_removed()` does
change**: it records `no_show` only when **no active check-in remains on any day**, so removing one
day's check-in from a member who attended the other two records nothing. At `n = 1` removing the
only check-in leaves none, so the behaviour and the key are today's.

**3. Streaks, badges, company points and leaderboards must count three check-ins as one session.**

| Reader | Today | Change | `n = 1` |
|---|---|---|---|
| `evaluate_streaks()` (`0088`) | `count(*)` of active check-ins in the org-month | `count(distinct c.session_id)` | identical — one active check-in per session per member |
| `evaluate_badges()`, metric `check_ins_count` (`0088`) | `count(*)` of active check-ins | `count(distinct session_id)` | identical |
| `evaluate_company_points()` rule 2 (`0081:384`) | `count(*)` over `check_ins` of the session | `count(distinct ci.member_id)` **and** `removed_at is null` — see the finding below | `count(distinct member_id)` equals `count(*)`; the `removed_at` clause is a real one-day change, question 3 |
| leaderboards — `snapshot_leaderboard()` (`0042`), all-time, company | sum the ledger | **nothing** — no reader counts check-ins | identical |

A workshop that spans a month boundary counts once in each month for the streak, because the bucket
is `arrived_at`'s month and the two check-ins are distinct sessions only by `session_id`. That is the
existing per-attendance semantics and I am not changing it; noted so nobody reads it as an oversight.

**4. A day added after the award was paid.** A one-day session paid `+20` at check-in, then
rescheduled to two days, and the member misses the second. The ledger cannot be edited. **My
recommendation: the completion pass writes a compensating reversal**, reason
«لم يكتمل حضور جميع الأيام», key `reversal:<the original ledger id>:v1` — the same mechanism as
`attendance_removed()`, one code path, honest and visible, and `05` §2.4's established way of
correcting an award. It is **provably a no-op at `n = 1`** (a standing award at `n = 1` implies an
active check-in on the one day, so the predicate holds). The case it does not cover is a day added
to a session that is **already completed**, where no completion event fires again; my recommendation
there is that `schedule_session()` refuse it — `sessions`' function, so a written request, not my
change. The alternative the lead may prefer is to leave the award standing as earned under the rule
then in force and let only the certificate follow the predicate. **Question 2.**

**5. remove → re-add.** Answered in full by trace (a): the key carries an epoch, and the epoch is the
latest active check-in, so the re-add produces a new key and a fresh award. It needs no counter, no
`v2`, and no `DECISIONS.md`-logged re-award (`05` §4.3 stays for what it is for).

---

## The completion evaluation — which job, its key, what enqueues it

**No new job, no new task file, no `worker/src/index.ts` registration.**

- **What enqueues it:** `sessions_completion_fanout()` (`0031`, mine) — unchanged. It already
  enqueues exactly one `evaluate_no_shows` job per completed session.
- **The job:** `evaluate_no_shows`, **key `noshow:<session_id>`, unchanged** (contract 2: a one-day
  session's job keys do not change).
- **What runs inside, in order:** `evaluate_session_attendance(p_session)` first, then the existing
  no-show loop, then `evaluate_company_points(p_session)`.

This is `0081`'s exact precedent, recorded in this note's «Company points rules» section: the
owner's company rules are «evaluated once, at completion», which is this job's existing contract, so
they were folded in rather than given a second job type. Attendance at completion is the same
contract. The alternative — a new `award_attendance` job, key `pts:attendance:<session_id>` — needs
a new task file **and** a `worker/src/index.ts` registration, both outside my edit list, for no
behavioural difference. **Question 4** if the lead wants the separate job anyway.

`evaluate_session_attendance(p_session)` is a definer SQL function that loops members with at least
one active check-in on the session and calls a single per-member routine — the same routine
`attendance_recorded()` and `attendance_removed()` call, so there is one implementation of «decide
what this member's attendance is worth now», not three.

★ **A member marked present after completion still gets paid**, because `attendance_recorded()`
evaluates immediately when the session is already `completed` (`REQ-CHK-017` lets an admin mark at
any time after the scheduled start). Without that, trace (a) step 6 would pay nothing.

---

## How `audit_balances` still recomputes every balance exactly

Nothing about the audit changes, and that is the point.

- `points_balances` is a trigger-maintained left fold, `after insert` on `points_ledger` only
  (`0027:387`). There is no update or delete path to hook, because `points_ledger_append_only()`
  raises for **every** writer including the owner and `service_role` (invariant 9).
- This wave **adds rows and removes none**: one award per member per session instead of one per
  check-in, plus compensating reversals. Every movement is an insert. The fold is unchanged, so
  `rebuild_points_balances()` (`0033:44` — `truncate` then `sum(amount) group by`) reproduces every
  balance exactly, and `audit_balances()` compares `sum(amount)` and `last_entry_id` as it does now.
- **The DoD's recompute test**: a three-day workshop attended in full, one day removed, then
  re-added, gives `L1 +20`, `L2 -20`, `L3 +20`; `points_balances.total_points = 20` and
  `last_entry_id = L3`; `truncate` + rebuild reproduces both. New file,
  `tests/rls/scoring-days-recompute.test.ts` — the existing `tests/rls/audit-balances.test.ts` is
  not touched.
- **`occurred_at` stays `clock_timestamp()`** (`DEC-046`), so `L1`, `L2`, `L3` order correctly inside
  one transaction and `last_entry_id`'s `order by occurred_at desc` is deterministic.

---

## The missed-day line on `/app/me/points` (P4)

**No ledger row is written for an award that did not happen**, and none should be — the ledger
records points, not explanations. The screen already has the precedent: `05` §8's «zero-point rows»
says a capped sixth comment writes no row and **the cap is explained in place**.

- **The source** is contract 6's per-day reader. A new `src/lib/dal/points.ts` function
  (`getMissedAttendance(locale)`) does **one** query — never one per session — returning, for every
  **completed** session of the member with more than one day where they have at least one active
  check-in and `session_attendance_complete` is false: the session id and title, the session's
  completion time, and the **positions and dates of the missed days**.
- **The render** is an explanation row in `PointsHistoryList`, placed by the session's completion
  time among the ledger rows, visually distinct from an award (no amount, no sign): «لم تُحتسب نقاط
  الحضور — فاتك <bdi>اليوم الثاني</bdi>». It is skipped entirely when the session has one day, so a
  one-day history is unchanged and `tests/e2e/points.spec.ts` passes unedited.
- **Authorisation** is `session_attendance`'s `security invoker` plus `checkins_read` — the member
  reads their own days and nobody else's.
- All six ICU plural forms where a count appears (missed days are a count), `<bdi>` on the day label
  and the session title, Western numerals, logical properties. The day label itself comes from
  `sessions`' one formatter (contract 7), read out of the `sessions` namespace — reading another
  track's namespace is allowed, writing it is not.

---

## Rule 4 — the existing suites that cover the award path, and which I change

**I change none of these.** They are the `n = 1` evidence, and if one goes red that is a finding for
this note, not a test to repair.

| File | Owner | What it pins |
|---|---|---|
| `tests/rls/award-points.test.ts` | mine | the definer-only grant; silent skip on a disabled rule, an exhausted cap, a live cooldown; `on conflict do nothing`; the Arabic reason and `rule_version`; **`check_in()` enqueues exactly one job keyed `pts:check_in:<id>` with that exact payload**; the end-to-end award |
| `tests/rls/award-presenter-points.test.ts` | mine | the proposal hook; **the completion fan-out's exact job set and keys**; the no-show query; `session_delivered` + `attendee_bonus` per check-in + `rating_bonus`'s threshold |
| `tests/rls/manual-adjustment-reversal.test.ts` | mine | the admin RPC's gates and audit row; the comment reversal's shape |
| `tests/rls/audit-balances.test.ts` | mine | the nightly oracle and that it never self-heals |
| `tests/rls/scoring-schema.test.ts` | mine | the append-only trigger for every role; `rsvp` absent from the catalogue |
| `tests/rls/recognition-evaluators.test.ts` | mine | streaks, badges, levels, perks |
| `tests/rls/snapshot-leaderboards.test.ts`, `tests/rls/all-time-leaderboard.test.ts` | mine | the frozen `active_member_count`, the immutable final snapshot |
| `tests/rls/checkin-removal.test.ts` | **`checkin`'s** | the reversal's single compensating row and its reason; the late `award_points` skip; the re-add producing a brand new row; the no-show symmetry |
| `tests/rls/checkin-late-job-hooks.test.ts` | **`checkin`'s** | `award_points`, `issue_certificate`, `fan_out_certificates`, `send_rating_prompt`, `evaluate_streaks`, `evaluate_badges` all excluding a removed check-in |
| `tests/rls/checkin-manual-mark.test.ts` | **`checkin`'s** | the manual mark enqueues the same `pts:check_in:<id>` key |
| `tests/rls/scoring-company-points.test.ts` | **`console`'s** | the three company rules and their keys |
| `tests/e2e/points.spec.ts` | mine | the `Stat`, the filters, the history and the catalogue |

**New files only**, per rule 4: `tests/rls/scoring-days-award.test.ts` (contract 5, contract 6, the
key, traces a/b/c), `tests/rls/scoring-days-recompute.test.ts`, `tests/unit/scoring-days-*.test.ts`,
`tests/e2e/wave9-scoring-missed-day.spec.ts`.

---

## Two findings in live code, both mine, neither caused by this wave

1. ⚠ **`evaluate_company_points()` rule 2 does not exclude removed check-ins** (`0081:384`:
   `from public.check_ins ci … where ci.session_id = p_session`). `0088` corrected seven readers for
   `DEC-141` and missed this one — a check-in an admin removed still counts toward its company's
   attendance percentage. It is in a function I own. Fixing it is **a one-day behaviour change**
   against `main`, so it is question 3 rather than something I fold in quietly.
2. **This note's own key table is stale for `attendee_bonus`.** It says «one row per session per
   presenter, `amount = 2 × attendee_count`»; what shipped (`0031`'s header and
   `worker/src/tasks/award_presenter_points.ts`) is **one `award_points()` call per check-in**, key
   `attendee_bonus:attendee_bonus:<check_in.id>:<presenter_id>:v1`, which is what `0087`'s reversal
   loop depends on. I will correct the table in the same commit as the P3 work rather than leave two
   answers in one file.

---

## The carried item — recognition edits write no audit or history row

**Not this wave.** `scoring_config_history` already exists with `badges`, `levels`, `perks` and
`streaks` in its scope check (`0004`, recorded above in «Correction found while building
`0001_m4_schema.sql`»), so the missing piece is a history trigger per table plus the writes in
`src/lib/dal/scoring-admin.ts` — **`console`'s module, and `console` is not spawned**. Landing it
here would put a change with no multi-day coupling into two files I do not own, inside a wave whose
second demonstrable is «a one-day session is byte-identical». Recommend it travels with `console` in
wave 10, where the admin screens that write those rows are.

---

## Questions for the lead, numbered

1. **The key's epoch.** `REQ-SES-017` says «per member per session»; I propose per member per session
   **per attendance epoch**, the epoch being the latest active check-in, because a literal
   per-session key makes remove → re-add a net zero (which `DEC-150` contract 6 itself names). Confirm,
   or name the shape you want.
2. **A day added after a one-day award was paid.** Reverse at completion with reason
   «لم يكتمل حضور جميع الأيام» (my recommendation, one code path, provably a no-op at `n = 1`), or
   leave the award standing as earned under the rule then in force and let only the certificate
   follow the predicate? And: should `schedule_session()` refuse to add a day to an already
   `completed` session? That is `sessions`' function and would be a written request.
3. **`evaluate_company_points()` rule 2's missing `removed_at is null`** (finding 1). Fix it this
   wave — a one-day behaviour change against `main`, in a function I own, with no existing test
   asserting the buggy answer — or carry it as a separate finding for wave 10?
4. **The completion job.** Fold `evaluate_session_attendance()` into `evaluate_no_shows` (key
   `noshow:<session_id>`, unchanged, `0081`'s precedent, zero new registrations — my recommendation),
   or a separate `award_attendance` job, which needs a new task file and a `worker/src/index.ts`
   registration, both the lead's?
5. **`sessions.require_all_days` when it is `false`.** The predicate is «an active check-in on **any**
   day», so the award fires on the **first** day's check-in — for a multi-day session, should it still
   wait for completion (consistent with `REQ-SES-017`'s «evaluated at completion»), or pay at the
   first check-in (consistent with «attending any day is enough»)? I recommend **waiting for
   completion**, so the timing rule is «`n = 1` pays at check-in, `n > 1` pays at completion» with no
   second axis.
6. **`0100`'s exact column and its default.** I plan against `sessions.require_all_days boolean not
   null default true`. Confirm the name, and confirm that a session with **zero** days (a draft that
   has never been scheduled) cannot reach `completed`, so `session_attendance_complete` is never asked
   about an empty day set. If it can, «every day of an empty set» is vacuously true and would pay a
   member who never checked in — I will guard on `n >= 1` regardless, but I need to know whether the
   guard is defence in depth or load-bearing.
7. **Contract 6's consumers.** The lead points `fan_out_certificates()`, `issue_certificate()` and
   `listEligibleRecipients()` at `session_attendance_complete()` on my written request (row L4). Is
   that request due at sync 1, or after contract 6 is promoted and its own test is green? I would
   rather it be after, so the certificate path moves against a proven predicate.
8. **The `me/points` missed-day row and `sessions`' day-label formatter** (contract 7). I read
   `sessions`' namespace for «اليوم الثاني»; confirm that the formatter is exported for a non-slot
   caller, or I write the label from `session_attendance`'s `position` in my own namespace.


---

# Wave 9 — what landed, and the one thing the plan got wrong

## The record

| # | Unit | Files | State |
|---|---|---|---|
| P1 | **contract 5** — `attendance_recorded()`, `attendance_removed()`, with `main`'s exact behaviour | `supabase/proposed/scoring/0001_attendance_hooks.sql`, `tests/rls/scoring-days-award.test.ts` | ready for sync at `b0f1a49` |
| P2 | **contract 6** — `session_attendance_complete()`, `session_attendance()` | `.../0002_attendance_predicate.sql`, `tests/rls/scoring-days-predicate.test.ts` | `2134295` |
| P3 | the award at completion; the two-fact routine; the counting fixes | `.../0003_award_at_completion.sql`, `worker/src/tasks/{evaluate_no_shows,award_presenter_points}.ts`, `tests/rls/scoring-days-{award,counting,recompute}.test.ts` | `11b7735` |
| P5 | ★ **`0121`** — the presenter's bonus decided in SQL, so `main`'s OLD worker is safe in the deploy window (the lead's row L9) | `.../0005_attendee_bonus_guard.sql`, `tests/rls/scoring-days-presenter-bonus.test.ts` | promoted as `0121` (`6ad2fc8`) |
| P4 | the missed-day line | `.../0004_missed_attendance.sql`, `src/lib/dal/points.ts`, `src/components/scoring/points-history-list.tsx`, `src/messages/*/scoring.json`, `tests/rls/scoring-days-missed.test.ts`, `tests/components/scoring/points-history-list.test.tsx` | `7087550`, `cd582b0` |

## ★ The correction that matters: the epoch is not «the latest-created check-in»

The plan above says the award's key carries an epoch, and that the epoch is **the
member's latest-created active check-in**. **That is wrong, and the RLS suite proved it in
about ten minutes.**

`check_ins.created_at` and `check_ins.arrived_at` **both default to `now()`** (`0010`), which
in Postgres is the **transaction's** timestamp. Every row a single transaction writes carries
the same instant, so `order by created_at desc` degrades to `order by id desc` — a random
uuid. It is the same defect `DEC-046` fixed on `points_ledger` by choosing `clock_timestamp()`,
and the same one `ad43ddb` fixed in `tests/rls/realtime.test.ts` at the top of this wave.

★ **In production it would usually have worked** — three days are three transactions — which
is the worst property a rule about points can have: correct because the machine is slow, and
unprovable in the suite that is supposed to guard it.

**What replaced it, in two parts:**

1. **The award NAMES the check-in on the highest-position day the member attended** —
   «the check-in that completed the attendance». A function of the data, not of write order,
   and at `n = 1` it is the member's only check-in, so the row and the key are `main`'s.
2. **A second award after a reversal is made possible by the key's own epoch segment.** No
   choice of check-in can carry that alone: remove day one of three and re-add it and the
   highest-position day has not moved, while `max(id)`/`min(id)` fail the mirror case. So
   `award_points()` counts the compensating rows already written against this member's
   attendance at this session and awards under `v1`, `v2`, … With no reversal it is `v1`:
   `main`'s key, byte for byte.

### ★ The consequence for `05` §2.1, ruled at sync 2 and written down here

`05` §2.1 says the trailing epoch «is bumped only by a `DECISIONS.md`-logged re-award», and
`0028`'s comment says «nothing here ever writes anything but `v1`». **Neither is true for
attendance any more**, and the lead approved the key as built:

- The segment now also counts a **deliberate, audited re-establishment of attendance** — an admin
  retracted a check-in (`remove_check_in()`, audited) and the member checked in again. That is
  the kind of act `05` §2.1's own sentence is about; it is not a bulk recompute, which is `05`
  §4.3's separate procedure and still needs its `DECISIONS.md` entry.
- ⚠ **At ONE day this changes a string `main` writes.** A member re-added after a removal gets a
  ledger key of `…:v2` where `main` writes `…:v1`. It is an internal identifier: **no screen
  renders it, no existing test asserts it, and the ledger row's amount, reason, source, source_id
  and `rule_version` are all unchanged.** So it is **not a named difference** — but it is written
  here rather than left to be discovered, which is the whole point of the ledger.
- The alternative, if this is ever revisited, is a separate generation segment in the key. The
  same tests prove either.

## Two findings in live code, one fixed here

1. ✅ **`evaluate_company_points()` rule 2 counted `check_ins` rows and never excluded removed
   ones** (`0081:384`). `0088` corrected seven readers for `DEC-141` and missed this one. Both
   halves fixed in `0003` — `count(distinct ci.member_id)` and `removed_at is null` — with
   `tests/rls/scoring-days-counting.test.ts` covering each. The removal half is **named
   difference 2** (`DEC-151` answer 3): a one-day behaviour change against `main`, and a
   regression fix rather than a feature.
2. ✅ **This note's own key table was wrong about `attendee_bonus`** since wave 2. Corrected
   above.

## The untouched-suite ledger — one line

| File | Commit | Why | Expectation for one day changed? |
|---|---|---|---|
| `tests/components/scoring/points-history-list.test.tsx` | `cd582b0`, narrowed at the commit below | **harness only**: the component reads `sessions.days` unconditionally now, so the mock must resolve that namespace whether or not a notice renders. **Three lines and a comment; no `it` block touched.** | **no** |

★ **The six new cases were in that file until the lead asked for them out** (rule 4: new behaviour,
new file). They are now `tests/components/scoring/points-history-days.test.tsx`, including «a
one-day history is unchanged». The reason is worth keeping: the ledger check is
`git diff e1d8596 -- tests/`, and **an 82-line diff in a pre-existing file has to be read line by
line to know nothing moved**, while a 15-line harness diff reads at a glance. Correct in substance
was not the same as auditable.

Every other suite on the award path is untouched and green: `award-points`,
`award-presenter-points`, `audit-balances`, `manual-adjustment-reversal`, `scoring-schema`,
`recognition-evaluators`, `snapshot-leaderboards`, `all-time-leaderboard`,
`scoring-company-points`, and `checkin`'s own `checkin-removal`, `checkin-late-job-hooks` and
`checkin-manual-mark` — 135 cases over 16 files at `11b7735`.

## A harness detail worth stealing

**Every wave-9 RLS file of mine applies its proposed SQL only if it is not already there**, by
probing `to_regprocedure('public.<fn>(<args>)')`. A `create function` file applied twice fails,
so without this every one of these files would have to be edited the day the lead promotes it —
and an edited test file is exactly what the untouched-suite ledger exists to make visible.

## Two traps for whoever is next in these files

1. **`fixture-m2` gives `members[1]` check-ins on two other sessions**, both with `arrived_at`
   defaulting to `now()` and so both in the current month. A streak or badge case counting
   sessions starts two thirds of the way to a three-session threshold. Use `f.a.mod`.
2. **Since `0100`, a fixture check-in no longer carries `'empty'::tstzrange`.**
   `check_ins_window()` overwrites it with the day's real window, so the fixture's session
   24 hours out now participates in `REQ-CHK-013`'s overlap exclusion. A test that schedules a
   day «tomorrow» collides with it. Every day in these files is ten or more days out.

## Closed — the e2e and the captures

`0102`, `0107`, `0113` and `0114` are migrations; the `PGRST202` tolerance in
`src/lib/dal/points.ts` was deleted with the last of them. The lead ran
`wave9-scoring-missed-day.spec.ts` with the untouched `points.spec.ts` on a production build in the
verification worktree: **12 passed**, and all captures opened.

| Capture | What it shows | State |
|---|---|---|
| `wave9-scoring-one-day-unchanged.png` | «نقاطي 20», one row, no notice, no day label — the same frame, filter and row shape as `wave7-content-points-reversal.png` | **accepted as the one-day proof** |
| `wave9-scoring-three-day-full.png` | ONE `+20` row for a three-day workshop, not three | accepted |
| `wave9-scoring-three-day-missed-day-two.png` | «نقاطي 0», the card, «فاتك اليوم الثاني», the rule line, no amount, Western numerals | accepted |
| `wave9-scoring-three-day-missed-card.png` | the notice card alone | ★ added on the lead's request |

★ **Why the fourth exists, and it is a harness fact worth keeping.** A `fullPage` screenshot on the
phone project composites the **sticky tab bar** over whatever the page's last line happens to be, so
the notice card's own footer — the session title and «فتح الجلسة» — is underneath it in the file
although the component renders it and the spec asserts it. The page shot proves the card's PLACE in
the history; an element shot (`locator.screenshot()`) proves its CONTENT. **A full-page capture is
not evidence about the bottom of a page.**
- **Row L4's written request** — pointing `fan_out_certificates()`, `issue_certificate()` and
  `listEligibleRecipients()` at `session_attendance_complete()` — is due after contract 6 is
  promoted and green (`DEC-151` answer 7). Contract 6 is green; the request goes the moment it
  is promoted.
- **Recognition edits still write no audit or history row.** Wave 10, with `console`
  (`DEC-151` answer 9).


## Sync 2 — promoted, and what changed under my own tests

`0102` (contract 5), `0107` (contract 6), `0113` (the award at completion), `0114` (the
missed-day reader) are migrations. `0108` points the certificate path at
`session_attendance_complete()` at five sites and returns early unless the session is
`completed` or `archived` — so **the certificate and the points agree on timing**, which is what
`DEC-151` answer 2 required. Row L4 needed no request from me; it was done.

★ **Promoting `0113` turned two of my own contract-5 cases red, and the reason is worth keeping.**
`applyProposed()` is a no-op for a file that has been promoted, so every case runs against the
**latest** body — not the one it was written for. `0102`'s verbatim body reversed
unconditionally, so a case could call `attendance_removed()` on a check-in that was never
soft-deleted and still see a reversal. `0113`'s body asks the predicate, and a member whose
check-in is still active has not stopped attending, so the same call correctly writes nothing.
**The hook's precondition is `remove_check_in()`'s own order — soft-delete FIRST, then the
hook** — and it is now a named `softDelete()` helper in the test rather than four repetitions,
because leaving it out is exactly the mistake that was made. Fixed at `b23fab1`.

**A general lesson for anyone writing against a proposed file:** a case written against the
FIRST version of a seam is not automatically a case against its final body. When the behaviour
lands, re-read every case that calls it and ask what precondition the real body now requires.


---

# ★ `attendance_epoch_check_in()` — what it returns, and the one way to misread it

**Written for the next lead, not for this wave.** Wave 10's certificate re-issue needs this exact
fact, and it is the kind of thing that is obvious while you hold it and invisible a month later.

```sql
public.attendance_epoch_check_in(p_session uuid, p_member uuid) returns uuid
```

**It returns the member's highest-position ACTIVE check-in for that session — whether or not the
member attended every day.** It is `security definer`, `service_role` only, and it is defined in
`0113`.

| The member | What it returns |
|---|---|
| attended all three days of three | day three's check-in |
| attended days one and three of three | **day three's check-in** — not null |
| attended day one only | day one's check-in |
| never checked in, or every check-in retracted | **null** |

★ **The misreading to avoid: `epoch is null` means «did not attend at all», NOT «attended
partially».** A partial attendee has an epoch, because the function answers «which day did they last
attend?» and not «did they attend the session?». Anything that needs the second question asks
`session_attendance_complete(p_session, p_member)`, which is the only definition of «attended the
session» for points and certificates (contract 6). A detection read written against null would
silently skip exactly the partial attendees it was looking for.

**Why the two are separate on purpose.** The predicate decides *whether* something is owed; the
epoch decides *which row* names it. `0121`'s guard needs BOTH — a partial attendee keyed to their own
last day would otherwise still have paid the presenter — and that pairing is the shape any later
consumer will want too:

- **the attendee's own award** is keyed to the epoch, so `attendance_removed()` finds it;
- **the presenter's `attendee_bonus`** is keyed to the SAME row, so the two reverse together;
- **a certificate** names the session, never a day — which is why `0108` looks it up by session,
  member and kind rather than by `check_in_id`, and why removing day one can revoke a certificate
  issued off day three.

**And the trap underneath all of it**, because it has now been met four times in this wave (the
realtime case, the lead's `0108`, this function's first draft, and `award_presenter_points.ts`):
`check_ins.created_at` and `arrived_at` **both default to `now()`, the TRANSACTION's timestamp**, so
every row one transaction writes carries the same instant. «The latest check-in» is not a thing you
can order by; the epoch is defined by **day position** for that reason. **Never write a second
ordering when a function already owns the answer.**


---

# Wave 12 plan — every session award pays at completion (`REQ-PTS-015`, `DEC-172`)

Written 2026-09-22, planning-only first task. **Nothing below is built.** Contract 1 leads the
section because `checkin` renders against it.

## ★ CONTRACT 1 — the pending state (`REQ-CHK-018`, `REQ-PTS-015`), published

The names follow `checkin`'s plan (`docs/plan/notes/checkin.md` § 2), so neither side renames anything.

### The SQL function

```sql
create function public.session_award_state(p_session uuid)
returns table (
  state          text,   -- 'none' | 'pending' | 'paid' | 'incomplete'
  points         int,    -- pending: the live rule's points; paid: the standing award's amount; else 0
  days_attended  int,    -- days with an ACTIVE check-in by the caller
  days_required  int,    -- the day count when require_all_days, else 1
  day_count      int,    -- how many days the session has
  missed_days    jsonb   -- incomplete only: [{"position": 2, "starts_at": "…"}], day order; else '[]'
)
language plpgsql stable security definer set search_path = '';

revoke execute on function public.session_award_state(uuid) from public, anon;
grant  execute on function public.session_award_state(uuid) to authenticated;
```

- **The caller only.** It takes no member. It reads `auth_member_id()` and `auth_org_id()` alone, the same
  shape as `0114`'s `missed_attendance_days()`, so it cannot be pointed at anyone else. It is definer
  because it calls `session_attendance_complete()` and `check_in_ceiling()`, both `service_role`-only.
  The grant is deliberate (`DEC-152`): `authenticated` only, never `anon`, and it is not an underscore
  name. `definer-exposure`'s anon allowlist does not change.
- **Zero rows** when the session does not exist or is not in the caller's org. This is not an error, and it
  does not reveal whether the session exists. **Exactly one row** otherwise.
- **Computed, never stored.** It reads `scoring_rules`, `sessions`, `session_days`, `check_ins`,
  `session_attendance_complete()`, `check_in_ceiling()` and `points_ledger`, and writes nothing.

**The state, decided in this order:**

| # | Condition | `state` | `points` |
|---|---|---|---|
| 1 | An attendance award stands: a `points_ledger` row of the caller's with `source = 'check_in'` for this session that no `reversal` names | `paid` | the sum of the standing rows (one row in practice) |
| 2 | The session is `cancelled`; or the org's `check_in` rule is missing, disabled or worth ≤ 0; or ★ `attendance_award_barred(session, caller)` — the caller is an accepted presenter of the session (sync-1 ruling 3) | `none` | 0 |
| 3 | The caller has no active check-in on any day of the session. This covers a presenter or staff member who did not check in, and a check-in that was removed | `none` | 0 |
| 4 | The award can no longer be earned. **Either** the session is `completed`/`archived` and `session_attendance_complete()` is false, **or** `require_all_days` is on and some day has passed `check_in_ceiling()` with no active check-in by the caller | `incomplete` | 0 |
| 5 | Otherwise: checked in, and the completion pass has not paid yet. This includes a completed session whose job has not yet run | `pending` | the rule's current `points`, exactly what `award_points()` will write |

- **Row 1 comes first**, so a one-day award paid at check-in **before** this migration reads `paid`, which
  is true.
- **Row 4, before completion, is `checkin`'s semantic 4** (*«emit it as soon as a required day's ceiling
  has passed»*). It is computed from `check_in_ceiling()`, the lead's one definition, never copied. It can
  go back to `pending`: an admin may still mark the member present on that day (`REQ-CHK-017` has no
  ceiling for an admin). That is correct, because the state is read from the data every time.
- `missed_days` lists, for a completed session, every day without an active check-in. Before completion
  it lists only the days whose ceiling has passed. Days are ordered by `position`.
- `days_required` is `1` when `require_all_days` is off (`checkin`'s semantic 3).

### The DAL function and its type (`src/lib/dal/points.ts`)

```ts
/** A day, as contract 7's `dayName()` takes it — the same shape as `MissedAttendance.days`. */
export interface AwardDay {
  position: number;
  startsAt: string;
}

export type SessionAwardState =
  | { state: "none" }
  | { state: "pending"; points: number; daysAttended: number; daysRequired: number; dayCount: number }
  | { state: "paid"; points: number }
  | { state: "incomplete"; missedDays: AwardDay[]; daysAttended: number; daysRequired: number; dayCount: number };

/** REQ-CHK-018: the CALLER's attendance award for one session. React `cache()`d, `requireSession()`
 *  inside (through `sessionClient`), one RPC. Null when the session is not visible to the caller. A
 *  malformed id is refused by Zod before the RPC and also returns null, never a thrown 22P02. */
export const getSessionAwardState: (locale: string, sessionId: string) => Promise<SessionAwardState | null>;
```

- `points` is the caller's **own attendance award** only. It never includes company, streak, badge or
  presenter amounts (`checkin`'s semantic 2).
- A failed RPC **throws**, as every function in this module does. `checkin`'s plan catches it in its own
  component (its Q4). The DAL does not swallow errors.
- `dayCount` is on `pending` and `incomplete` beyond `checkin`'s draft. It is additive, and they may ignore
  it.

---

## The one sentence the plan turns on

**`award_points()` becomes the one place that knows when a session-tied award may be written.** It
re-derives the answer at run time from `sessions.state`, and for a presenter award also from
`session_presenters`. Every enqueuer (the hooks, the fan-out, the new presenter trigger, a job queued
before this migration, `main`'s worker) can be early or late, and the ledger is still right.
Everything else is enqueueing **existing jobs under existing keys**. So **no worker task changes
behaviour**, and `main`'s worker on this SQL behaves exactly like the new one.

## Code that contradicts the brief, or the brief left out

1. **`attendance_removed()` pays `no_show` at removal whatever the session's state**
   (`0113_award_at_completion.sql:320`). `REQ-PTS-015` says a removal before completion «leaves no
   ledger row». The brief names only the attendance award. Under this plan the no-show waits for
   completion too, where `evaluate_no_shows` already records it under the same key
   (`no_show:no_show:<rsvp>:<member>:v1`).
2. **`evaluate_session_attendance()` / `evaluate_member_attendance()` check no state**
   (`0113:225`, `0113:178`). Their only caller is the completion job, but either one called on a running
   session enqueues a payment. I gate the pay branch on `completed`/`archived`. The reversal branch stays
   unconditional. Before completion it finds nothing, except an award paid at check-in before this
   migration, and reversing that is correct.
3. **`proposal_accepted` rows carry `session_id = null`** (`0031:56`). A reversal for «a presenter award
   it holds **for that session**» cannot find them by `session_id`. It finds them by
   `source = 'proposal_accepted' and source_id = sessions.proposal_id`.
4. ★ **A directly created session's presenters are `accepted = false`, and nothing can make them `true`**
   (`0020_session_creation.sql:100–103`; `sessions`' plan § (a) measured the same thing). The fan-out
   pays `accepted` presenters only (`0031:81`), so **no presenter of an admin-created session has ever
   been paid `session_delivered`, `attendee_bonus` or `rating_bonus`.** It matters to me because of
   contract 2. If the owner's data fix (or `sessions`' Q1/Q2) turns those rows `true` **after** my
   trigger is live, every completed session among them pays its presenters retroactively: 50 points
   each, plus bonuses. Whether to pay them is the owner's call. The fix running **before** or **after**
   promotion decides it (question 3).
5. **A presenter can set their own `accepted`** (`0010:478–484`, the `session_presenters_update_self`
   policy and its column grant). On a completed session my trigger pays on `false → true` and reverses on
   `true → false`. A presenter toggling it would write an unbounded run of award/reversal pairs. The
   ledger stays correct (net zero per cycle) but grows without limit. Question 4.
6. **The attendance epoch does not carry over to presenter awards as-is.** `0113`'s
   `attendance_award_epoch()` counts reversals of any `check_in` row on the session. For presenter awards
   the family is `(rule_key, source, source_id, member)`. Section A3 defines it. With no reversal it is
   `v1`: today's key, byte for byte.
7. **`REQ-PTS-015` lists attendance, company, presenter and proposal awards only.** `rating_submitted`,
   `comment` and `photo` also name a session and still pay at the act (`0029`). A rating can only follow
   completion anyway. A comment or a photo during a live session still pays at once. I read that as
   deliberate, because the requirement lists its four, and I change none of them (question 8).
8. **Two catalogue rules have no writer at all:** `materials_uploaded` (10, presenter) and
   `late_cancellation`. Nothing in `supabase/migrations/` or `worker/` pays either. This is not this
   wave's; it is recorded so nobody looks for them in the completion pass.

---

## A1 · One-day attendance at completion — one rule, one moment

**File:** `supabase/proposed/scoring/0007_award_at_completion.sql` (after contract 1's `0001`). Four
functions re-created with `create or replace` and the same signatures. No new signature.

| Function | Change |
|---|---|
| `attendance_recorded(uuid)` | `if v_days <= 1 or s.state in ('completed','archived')` (`0113:266`) becomes `if s.state in ('completed','archived')`. **The day count is no longer read.** Still evaluated immediately after completion, which is what pays a member marked present afterwards (`REQ-CHK-017`) and a member re-added after a removal. |
| `evaluate_member_attendance(uuid, uuid, text)` | The **pay** branch returns unless the session is `completed`/`archived`, **before** it enqueues. The reversal branch is unchanged. |
| `award_points(...)` | The `check_in` timing clause loses `count(*) > 1` (`0121:78`). `state not in ('completed','archived') → return`, for every session. The remaining `check_in` clauses (removed check-in, predicate, standing award, epoch) are verbatim. The presenter clauses are in A3. |
| `attendance_removed(uuid)` | The `no_show` block (`0113:320`) runs only when the session is `completed`/`archived` (finding 1). The two reversal blocks are unchanged. |

**Every path that can enqueue or write a `check_in` award, measured, and none pays before completion:**

| Path | Latest body | How it reaches the ledger | Before completion, after this plan |
|---|---|---|---|
| `check_in()` (code) | `0120:205` → `attendance_recorded()` | enqueue `pts:check_in:<epoch>` | `attendance_recorded()` returns on state: **no job** |
| `mark_checked_in_manually()` | `0120:296` → `attendance_recorded()` | the same | the same: **no job** |
| `remove_check_in()` | `0120:335` → `attendance_removed()` | reversals; `no_show` | reversals find nothing (nothing paid); **no `no_show`** |
| `evaluate_session_attendance()` | `0113:225` → `evaluate_member_attendance()` | enqueue | pay branch gated: **no job** |
| a job already queued (before this migration, or by `main`'s worker) | `award_points()` | insert | the timing clause returns: **no row** |
| the completion job `evaluate_no_shows` | `sessions_completion_fanout()` → `evaluate_session_attendance()` | enqueue `pts:check_in:<epoch>` → `award_points` | **this is the one moment** |

**No branch on the number of days.** None of the four functions reads the day count for timing any more.
`session_attendance_complete()` still decides *whether* (`REQ-SES-017`), and at `n = 1` that is «has an
active check-in».

**Keys:** unchanged. A one-day award is `check_in:check_in:<the only check-in>:<member>:v1`, which is
`main`'s row, now written about an hour later. The job key `pts:check_in:<id>` and the payload are
unchanged.

**What was paid before the migration** (one-day sessions checked into and not yet completed at the push):
row 1 of the table above. At completion `evaluate_member_attendance()` finds the award standing and writes
nothing. A removal before completion reverses it. Nothing is paid twice, and nothing is left standing
wrongly.

## A2 · `proposal_accepted` at completion, under its existing key

**File:** `0008_presenter_awards.sql`.

- **`proposals_award_points()` and its trigger are dropped**, both in this file:
  `drop trigger proposals_award_points on public.proposals; drop function public.proposals_award_points();`.
  No code on `main` calls it; it is a trigger. `policy-diff` compares policies, and this is not one.
  ★ **An approval pays nothing from this migration on.**
- **`sessions_completion_fanout()`** (mine, `0031`) is re-created. The `evaluate_no_shows` job and the
  two `award_presenter_points` jobs per presenter are **verbatim**. One loop is added: for each accepted
  session presenter who **was on the proposal** (`new.proposal_id is not null`, and the member is
  `proposals.proposer_id` or an `accepted and declined_at is null` row of `proposal_presenters`), enqueue
  `award_points` with key **`pts:proposal_accepted:<proposal>:<member>`**. That is today's job key, and
  the payload is `{rule:'proposal_accepted', member_id, source:'proposal_accepted', source_id:<proposal>,
  session_id:?}`. The ledger key is today's: `proposal_accepted:proposal_accepted:<proposal>:<member>:v1`.
  - ★ **A proposal approved and paid before this migration is never paid twice**: the same ledger key,
    `on conflict do nothing`.
  - **A session an admin created directly** has `proposal_id is null` and pays none.
  - **A co-presenter who was on the proposal but is not a session presenter** (declined or removed) is
    not paid. One paid at approval before the migration keeps that row: no event touches it. Question 6.
  - `session_id`: **I recommend the session's id** (question 5). Today's rows carry `null`. With the
    session set, `/app/me/points` shows the title and filters by it, and the topic board (`0042:81`
    joins `sessions` on `session_id`) counts it under the session's category. The key does not include
    the session, so either choice keeps it byte-identical.
- **`award_points()` re-derives it** (A3's guard): `proposal_accepted` writes only when the session whose
  `proposal_id = p_source_id` is `completed`/`archived` and the member is an accepted presenter of it. So
  a `pts:proposal_accepted` job queued at an approval seconds before the push writes nothing when it
  runs. The completion fan-out enqueues the same key again and pays then.

## A3 · Presenter awards follow the presenter after completion

**Contract 2, from my side:** `sessions` inserts and deletes `session_presenters` rows and never names a
scoring function. **My trigger decides the money**, so `0010`'s direct admin policies are covered as well
as `sessions`' RPCs.

### The trigger (`0008_presenter_awards.sql`)

```sql
create function public.session_presenters_awards() returns trigger
  language plpgsql security definer set search_path = '';
create trigger session_presenters_awards
  after insert or delete or update of accepted, declined_at on public.session_presenters
  for each row execute function public.session_presenters_awards();
```

`was := old is an accepted presenter` (`old.accepted and old.declined_at is null`, on update and delete);
`is := new is one` (on insert and update).

- **`is and not was`, and the session is `completed`/`archived`:** enqueue the presenter's awards
  **exactly as the fan-out would have**, using existing jobs under existing keys:
  - `award_presenter_points` with key `pts:presenter:<S>:<M>` and payload `{session_id, member_id}`;
  - the `:rating_bonus` job at `completed_at + 48 h`, **only if that is still in the future**. The
    immediate job evaluates `rating_bonus` too, so a session completed more than 48 h ago needs one job;
  - `award_points` with key `pts:proposal_accepted:<proposal>:<M>`, if the member was on the proposal
    (A2's predicate).
- **`was and not is`**, whatever the state: for each **standing** presenter award the member holds on the
  session (`session_id = S and source in ('session_delivered','attendee_bonus','rating_bonus')`, or
  `source = 'proposal_accepted' and source_id = S.proposal_id`), write **one compensating row**. This is
  `0087`'s shape: `amount = -l.amount`, `source = 'reversal'`, `source_id = l.id`,
  `session_id = l.session_id`, `rule_key = l.rule_key`, key `reversal:<l.id>:v1`,
  `on conflict do nothing`. The reason is **«أُزيل من مقدّمي الجلسة»** (question 7). No update, no
  delete (invariant 9). Before completion this finds nothing, except a `proposal_accepted` paid at
  approval before this migration. **Reversing that is correct under the same rule**, and it is paid again
  at completion under A3's epoch if the member is back by then.
- **Guards:** the session row is gone (a cascade from a session delete) → return. The member row is gone
  → return.
- The trigger never raises. A failed award must not undo an admin's presenter change.

### The guard in `award_points()` (in `0002`, where the function is re-created once)

For `p_source in ('session_delivered','attendee_bonus','rating_bonus','proposal_accepted')` (the
**presenter** sources), with the session resolved from `p_session`, or through `sessions.proposal_id`
for `proposal_accepted`:

1. The session is `completed`/`archived`, or **return**. This is `REQ-PTS-015`'s moment for every
   presenter rule.
2. `p_member` is an **accepted, not declined** row of `session_presenters` for the session, or
   **return**. For `proposal_accepted` the member must also have been on the proposal.

★ **Why clause 2 is load-bearing, and not defence in depth.** The fan-out queues a `:rating_bonus` job for
**+48 h**. Remove a presenter at +1 h: the trigger reverses `session_delivered`. At +48 h the queued job
runs, and **with A3's epoch** `session_delivered` would compute `v2` and pay the removed presenter again.
Only a check at run time closes that. The same principle as `0088` and `0121`: re-derive from the table,
never trust the payload.

### The epoch for presenter awards

For the four presenter sources, `v_epoch := 1 + count(reversal rows whose source_id is a ledger row of
(p_member, p_rule, p_source, p_source_id))`.

- **No reversal → `v1`: today's key, byte for byte**, so every existing key and every
  `on conflict` replay is unchanged.
- **Removed and re-added after completion:** the first award's `v1` is reversed, so the re-add pays
  `v2`. Removed again, `v2` is reversed. Re-added, `v3`. There is never more than one standing row per
  family, by induction: a row is written only under `v(reversed + 1)`, which is the key of the one that
  would already stand.
- It is a separate function, `presenter_award_epoch()` (definer, `service_role`), beside `0113`'s
  `attendance_award_epoch()`. It is not a change to that function, whose family is per session for a
  different reason (`0113` § 1).
- **Caps still hold.** `attendee_bonus` (30) and `rating_bonus` (1) sum `amount` over member, session and
  rule, and a reversal row carries the same `rule_key` and `session_id`, so a reversed award frees its
  place.

### Trace — added after completion, removed, re-added

Session `S` completed; `P` added (`accepted`); one qualifying attendee `A` (epoch check-in `CI`).

| # | Event | Ledger | `P` net on `S` |
|---|---|---|---|
| 1 | insert `P` accepted → trigger enqueues `pts:presenter:S:P`; the job runs | `session_delivered …:S:P:v1` +50; `attendee_bonus …:CI:P:v1` +2 | 52 |
| 2 | delete `P` → trigger | two reversals, «أُزيل من مقدّمي الجلسة» | 0 |
| 3 | the `:rating_bonus` job queued at step 1 runs | guard clause 2: `P` is not a presenter → **nothing** | 0 |
| 4 | insert `P` again → the job runs | `…:v2` +50; `…:CI:P:v2` +2 | 52 |
| 5 | the job replays | `v2` conflicts → nothing | 52 |

### Found while measuring, and left alone unless ruled in

- **An attendee re-added after completion does not re-pay the presenter's `attendee_bonus`.**
  `attendance_removed()` reverses it; nothing re-runs `award_presenter_points`. This predates the wave.
  A3's epoch makes it one line: `evaluate_member_attendance()`'s after-completion pay branch also
  enqueues `pts:presenter:<S>:<P>` for each accepted presenter, an existing job under its existing key.
  Question 9.
- **`company_presenting_pct` / `company_attendance_pct` are evaluated once, at completion**, and a later
  presenter or attendance change does not re-evaluate them. They are keyed per company per session, and
  `company_points_ledger` is a separate ledger. Unchanged; noted.
- **A presenter added after completion gets no certificate**, and a removed one keeps theirs (`sessions`'
  plan (c).2). That is `designer`'s, held by the lead. Not mine.

## A4 · Streaks and badges count completed sessions; every downstream reader measured

**File:** `0009_counting_completed.sql`, which re-creates `evaluate_streaks()` and `evaluate_badges()`
from `0113`.

| Reader | Today | Change |
|---|---|---|
| `evaluate_streaks()` (`0113:473`) | `count(distinct session_id)` of active check-ins in the org-month of `arrived_at` | **plus** the session is `completed`/`archived`. The bucket stays `arrived_at`'s month, so a check-in in a month keeps counting toward that month |
| `evaluate_badges()`, `check_ins_count` (`0113:518`) | distinct sessions with an active check-in | **plus** the session is `completed`/`archived`. `first_check_in` now arrives the night after completion |
| `evaluate_badges()`, `sessions_delivered_count` / `presenter_rating_avg` | already `s.state = 'completed'` / all ratings | **unchanged**. I leave `archived` alone: it was never counted, and changing that is not this wave |
| `evaluate_levels_perks()` | reads `points_balances` | **unchanged**. It follows the ledger, so a level now arrives after completion |
| `evaluate_no_shows` (worker, SQL) | at completion | **unchanged** |
| `evaluate_company_points()` | at completion | **unchanged** |
| `snapshot_leaderboard()` / `all_time_leaderboard()` (`0042`, `0044`) | sum the ledger by `occurred_at` | **code unchanged**. Two effects to know about: an attendance award lands at completion rather than check-in (the same day for a one-day session), and ★ `proposal_accepted` moves from the approval's month to the completion's month, possibly weeks later, onto the monthly and seasonal boards. With question 5's `session_id` it also counts on the topic board |
| `audit_balances()` / `rebuild_points_balances()` | fold over the ledger | **unchanged**. Every movement is still an insert. The recompute test covers a presenter reversal and a re-pay under `v2` |
| `/app/me/points` (`getPointsHistory`, `points-history-list`) | ledger rows + `missed_attendance_days()` | **unchanged**, with no pending rows (question 10). The balance never looks wrong, because nothing was paid, and the pending amount is on the check-in screen and the event page (contract 1), the two places the member is when it matters. A presenter reversal renders as every reversal does: its reason and a negative amount. **No new message key** (`DEC-172`'s «not this wave») |
| `missed_attendance_days()` (`0114`) | completed multi-day sessions | **unchanged**. A one-day session still cannot appear: it has no «missed day» |
| recognition (`src/lib/dal/recognition.ts`) | reads `member_badges`, `streak_awards` | **unchanged**. The rows just arrive later |
| leaderboards screens (`sessions`') | — | **no request**: no screen changes |

★ **A finding, pre-existing: the last evening of a month never counts toward that month's streak.** The
cron is `0 1 * * *` UTC (`worker/src/index.ts:113`), which is 04:00 in Riyadh. `evaluate_streaks()`
evaluates **only** `now()`'s month, so a check-in after 04:00 on the last day is first seen when the
period is already the next month. Both periods are idempotent under `streak_awards`' unique key, so
evaluating the previous month too on the first days of a month closes it. Mine, small, not a timing
change. Question 11.

## Contract 1 — the build

**File:** `0006_session_award_state.sql`, then `src/lib/dal/points.ts` (additive: `AwardDay`,
`SessionAwardState`, `getSessionAwardState`). No screen of mine changes.

---

## What `main`'s worker does on this SQL before `main`'s code catches up

**Exactly what the new worker does**, because **no worker task changes behaviour**:

- `award_points.ts` passes the payload through; `award_points()` decides everything.
- `award_presenter_points.ts` calls `award_points()` three ways. The guard and the epoch are in SQL.
- `evaluate_no_shows.ts` calls `evaluate_session_attendance()`, which now pays one-day sessions for real
  rather than as a proven no-op. The same call, the same key.
- `evaluate_streaks.ts` / `evaluate_badges.ts` are one `select` each.
- The only TypeScript I touch in `worker/` is **a comment** in `evaluate_no_shows.ts`, where «for a
  ONE-DAY session it is a proven no-op» becomes false. It changes no behaviour and can ship any time.

**In flight at the push:** a `pts:check_in` job queued for a running one-day session, or a
`pts:proposal_accepted` job queued at an approval, runs and writes nothing (the timing guard). The
completion fan-out enqueues the same key again and pays then. **Vercel on `main`'s code** never calls
`session_award_state()`. The old check-in screen simply shows no row until completion.

**The owner's production reads before the push** (read-only; the result decides nothing automatically):

```sql
-- one-day sessions not yet completed whose members were already paid at check-in (they read «paid»)
select count(*) from public.points_ledger l join public.sessions s on s.id = l.session_id
 where l.source = 'check_in' and s.state not in ('completed','archived','cancelled');
-- proposal_accepted paid at approval for a session not yet completed (reversible under A3)
select count(*) from public.points_ledger l join public.sessions s on s.proposal_id = l.source_id
 where l.source = 'proposal_accepted' and s.state not in ('completed','archived');
-- sessions' finding (a): presenters that would be paid if flipped to accepted after this trigger
select count(*) from public.session_presenters sp join public.sessions s on s.id = sp.session_id
 where not sp.accepted and sp.declined_at is null and s.state in ('completed','archived');
```

---

## ★ The existing tests whose assertions this moves — for the untouched-suite ledger

Two kinds of move, named per case:
- **(a) the expectation inverts.** The case pinned the old moment, and its scenario now proves the new
  rule.
- **(b) harness only.** The case's subject is not the timing (a reversal's shape, a counting rule, a
  bonus's arithmetic), so its setup moves to a completed session or gains the presenter row, and **every
  expectation stays literally as it is.**

| # | File › case | Assertion | Move | Why |
|---|---|---|---|---|
| 1 | `award-points.test.ts` › `POL-check_in.award_points_hook` › «a successful check-in enqueues exactly one award_points job, keyed by the check-in id» | `jobs` `toHaveLength(1)` at check-in on an `in_progress` session | (a) → `0` | `REQ-PTS-015`: a check-in pays nothing before completion |
| 2 | the same › «end to end: running the enqueued job's SQL awards the check-in's points» | reads the job's payload, balance `20` | (b): complete the session, run `evaluate_session_attendance()` and the job it enqueues; `20` unchanged | the job now exists only after completion |
| 3 | `checkin-contract-5.test.ts` › «a code check-in enqueues exactly one award_points job under pts:check_in:<id>» | `toHaveLength(1)` | (a) → `0` | the same |
| 4 | the same › «a manual mark enqueues the same one job under the same key…» | `toHaveLength(1)` | (a) → `0` | the same |
| 5 | the same › «writes one compensating row per unreversed award, with the same key and reason, and awards the no-show» | the award exists; reversal shape; `no_show` count `"1"` | (b): the session is completed before the award is written | on a live session the award writes nothing and the removal records no `no_show` (finding 1) |
| 6 | `checkin-manual-mark.test.ts` › «enqueues exactly one award_points job, keyed pts:check_in:<id>…» | `toHaveLength(1)` | (a) → `0` | the same as 1 |
| 7 | `checkin-removal.test.ts` › «reverses the points award with ONE compensating entry…» | `award.amount > 0`, one reversal | (b): completed first | the award is not written on a live session |
| 8 | the same › `no_show_symmetry` › «removing a confirmed-RSVP member's check-in awards no_show…» | `noShow` `toHaveLength(1)` | (b): completed first | finding 1 |
| 9 | `scoring-days-award.test.ts` › `enqueues_award` › «enqueues exactly one award_points job under main's key, with main's exact payload» | one job, the payload | (b): session `completed` | the hook's key and payload are unchanged; only the moment moved |
| 10 | the same › «★ the seam is behaviour-neutral: called after check_in()'s own inline enqueue…» | `before` `toHaveLength(1)` | (a) → `0` before and after | there is no inline enqueue and no pre-completion job. Its premise (the wave-9 switch) is history |
| 11 | the same › «calling it twice touches the same key, never a second job» | `toHaveLength(1)` | (b): `completed` | the same as 9 |
| 12 | the same › `attendance_removed.reversal` › «writes ONE compensating row for the attendee's award AND one for the presenter's attendee_bonus…» | `originals` `toHaveLength(2)` | (b): `completed` **and** the presenter's accepted row | the timing guard and A3's guard |
| 13 | the same › `attendance_removed.no_show_symmetry` › «a confirmed RSVP earns the no_show rule…» | `toHaveLength(1)` | (b): `completed` | finding 1 |
| 14 | the same › `RPC-attendance_recorded.one_day_pays_at_check_in` | one job at check-in, then one row | (a): no job at check-in; `completed` → the pass enqueues **the same key and payload** → one row `check_in:check_in:<id>:<m>:v1` | ★ the case `DEC-172` names. The key assertion survives unchanged |
| 15 | the same › `reverses_added_day` › «a one-day award, then a second day added and missed…» | `[20, -20]` | (b): the one-day award is written **directly as the owner** (what a pre-migration payment left) instead of through a pre-completion job | that is the only way such an award can exist now, and the case stays the proof for those legacy rows |
| 16 | the same › `multi_day_waits_for_completion` › «★ a ONE-DAY session is untouched by that guard: it still pays while the session is running» | `toHaveLength(1)` | (a) → `[]` | `REQ-PTS-015`: one rule, no branch on days |
| 17 | the same › `reverses_presenter_bonus_by_member` | `bonus.amount > 0`, one reversal | (b): the presenter's accepted row | A3's guard |
| 18 | `scoring-days-presenter-bonus.test.ts` › `epoch_only`, `one_day_unchanged` (×2), `skips_silently`, «★ … 50 + 2 × 2 = 54» | one bonus / two bonuses / `[]` / one / `54` | (b): **one line in the file's `oldWorkerLoop` / setup** inserting the presenter's accepted row | A3's guard. ★ Without it `requires_complete` and «a removed check-in earns nothing» would pass **vacuously**, refused by the presenter guard before the clause they exist to prove |
| 19 | `scoring-days-counting.test.ts` › `JOB-award_presenter_points.one_bonus_per_qualifying_attendee` | `bonuses` `toHaveLength(1)` | (b): the presenter's row | A3's guard |
| 20 | `award-presenter-points.test.ts` › «approval enqueues one proposal_accepted job for the proposer and each accepted co-presenter, none for a declined one» | two jobs of `1`, one of `[]` | (a) → all three `[]` | A2: approval pays nothing. A new file pins the completion |
| 21 | the same › «end to end: the enqueued job awards proposal_accepted's 10 points» | balance `10` | (b): a session from the proposal, the proposer as its accepted presenter, completed; then the same direct call → `10` | A3's guard needs the completed session |
| 22 | the same › «award_presenter_points' logic: session_delivered + attendee_bonus per check-in…» | `54`, no `rating_bonus` | (b): `completed` + the presenter's row | the timing and presenter guards |
| 23 | `recognition-evaluators.test.ts` › `evaluate_streaks.idempotent` | one award, `15` | (b): `sessionAtOffset` inserts `completed` | A4 |
| 24 | the same › `evaluate_badges.idempotent` | `regular` ×1, `first_check_in` ×1 | (b): the same helper | A4 |

**Green and unedited, but they would turn vacuous.** I recommend a (b) line for each so they still
prove something:
- `checkin-late-job-hooks.test.ts` › `evaluate_streaks.excludes_removed / evaluate_badges.excludes_removed`
  runs on an `in_progress` session, which A4 excludes anyway, so `0` no longer shows that the *removal*
  excluded it. Move to `completed`.
- `scoring-days-award.test.ts` › «★ the seam is behaviour-neutral: called after remove_check_in()…»
  compares two empty lists on a live session. Move to `completed`.

**Unchanged and still meaningful** (read, not assumed): `award-points` (definer_only, silent_skip,
idempotent ×2 — `v_sess` is null so the timing clause is not reached), `checkin-late-job-hooks`
(`skips_removed_check_in` — the removed clause fires first), `checkin-removal` (the rest),
`checkin-days` (its reversal `every(...)`), the rest of `scoring-days-award` (all on `completed`
sessions), `scoring-days-counting` (streak/badge/company — already `completed`),
`scoring-days-recompute`, `scoring-days-predicate`, `scoring-days-missed`, `audit-balances`,
`scoring-schema`, `snapshot-leaderboards`, `all-time-leaderboard`, `manual-adjustment-reversal`,
`scoring-company-points`, `award-hooks-ratings-comments` (question 8), and the e2e files `points.spec.ts`,
`wave9-scoring-missed-day.spec.ts` (every session `completed`) and the lead's
`wave9-three-day-workshop.spec.ts`.

Most rows are the timing. Only `#17`, `#18` and `#19` hang on question 1 (the presenter-row half of
A3's guard): under the alternative guard they do not move. `#12`, `#21` and `#22` move in any case, because
of the completed-session half.

## New tests (new files only, rule 3) and their `03` §8.2 rows

| File | Rows |
|---|---|
| `tests/rls/scoring-award-state.test.ts` | `RPC-session_award_state.caller_only` (no member parameter; another org's session → zero rows; `anon` refused) · `.none` (no check-in / removed / rule disabled / cancelled) · `.pending_before_completion` (the rule's points; `days_attended` / `days_required` / `day_count`; `require_all_days = false` → `days_required = 1`) · `.pending_until_the_job_runs` · `.paid_when_standing` (incl. a pre-migration one-day award on a running session) · `.incomplete_after_completion` (`missed_days` in order) · `.incomplete_when_a_ceiling_passed` · `.back_to_pending_after_a_mark` · `.writes_nothing` |
| `tests/rls/scoring-completion-timing.test.ts` | `POL-check_in.no_award_before_completion` (code and manual, `n = 1` and `n = 3`, the same assertions — no branch) · `RPC-award_points.waits_for_completion_at_any_n` · `RPC-evaluate_member_attendance.pays_only_after_completion` · `RPC-attendance_removed.before_completion_writes_nothing` (**D3**: check in, remove, complete → no row, no reversal) · `RPC-attendance_removed.no_show_after_completion_only` · `JOB-evaluate_no_shows.pays_one_day_at_completion` (main's key and payload) · `RPC-award_points.legacy_award_standing` (pre-migration award → completion writes nothing) |
| `tests/rls/scoring-proposal-at-completion.test.ts` | `POL-proposals.no_award_at_approval` · `POL-sessions.completion_pays_proposal_presenters` (proposer and accepted co-presenter; not a presenter who was not on the proposal) · `.never_paid_twice` (paid at approval before → the same key, zero rows) · `.direct_session_pays_none` · `RPC-award_points.proposal_accepted_waits_for_completion` |
| `tests/rls/scoring-presenter-awards.test.ts` | `POL-session_presenters.pays_on_join_after_completion` (insert accepted; update false → true; as the **admin through the policy**, since the trigger is definer and tested as a member) · `.reverses_on_leave` (delete; accepted → false; the reason; `0087`'s key) · `.nothing_before_completion` · `.reverses_legacy_proposal_accepted` · `.epoch_repays_after_readd` (the trace above, `v1 → reversal → v2`) · `.key_unchanged_without_reversal` · `RPC-award_points.presenter_must_be_accepted` (step 3 of the trace) · `.caps_hold_across_epochs` · `.trigger_never_raises` |
| `tests/rls/scoring-counting-completed.test.ts` | `RPC-evaluate_streaks.counts_completed_sessions` · `RPC-evaluate_badges.counts_completed_sessions` |
| `tests/rls/scoring-presenter-recompute.test.ts` | `RPC-rebuild_points_balances.after_presenter_epochs` · `RPC-audit_balances.silent_after_presenter_epochs` |
| `tests/unit/scoring-award-state.test.ts` | the DAL's row → DTO mapping for all four states; zero rows → `null`; a malformed id → `null` without an RPC |

Every RLS file probes `to_regprocedure(...)` / `prosrc` before `applyProposed()`, as wave 9's do, so
**none needs editing on promotion**. There is no e2e of mine: no screen of mine changes. The lead's D2 and
D3 demonstrables exercise this end to end.

## Files

`supabase/proposed/scoring/{0006_session_award_state,0007_award_at_completion,0008_presenter_awards,0009_counting_completed}.sql`
· `src/lib/dal/points.ts` (additive) · `worker/src/tasks/evaluate_no_shows.ts` (a comment) · the seven
new test files · the ledger lines above, written by the lead in the same commit as each promoted file.
**No** `create table` / `alter table`, no `src/messages` change, no screen.

**Order.** Contract 1 (`0001` + DAL) first, because `checkin` waits on it. Then `0002` + `0003` + `0004`
together, because moves `#12`, `#17–#22` need both the guard and the trigger to read coherently. Each file
is proven with `applyProposed()` in its own tests before I hand it over.

## Questions for the lead, numbered

1. **The presenter guard in `award_points()`** — accepted presenter + completed, for the four presenter
   sources. I recommend it: it is what stops the +48 h job from re-paying a removed presenter (step 3 of
   the trace), and it moves `#17–#19` by one setup line each, on top of what the timing moves anyway. The alternative moves
   none of them: refuse only a member with **no accepted row who already holds a presenter-removal
   reversal** on the session. It leaves a race: a presenter removed between completion and the first job
   (seconds) is paid once with nothing to reverse, and gets the +48 h `rating_bonus` too. Rule A or the
   alternative.
2. **`no_show` at removal waits for completion** (finding 1). It moves `#5`, `#8`, `#13` in setup only.
   Confirm that `REQ-PTS-015`'s «leaves no ledger row» includes the 0-point `no_show` record.
3. ★ **Sessions' `accepted = false` rows on completed sessions** (finding 4). If they are flipped after
   my trigger is live, those presenters are paid retroactively; if before, they are not, and they never
   were. The owner decides whether to pay them, and the order of the data fix follows from that.
4. **A presenter toggling their own `accepted` on a completed session** (finding 5). Accept the churn
   (net zero, correct), or ask the lead to narrow `session_presenters_update_self` (a policy, so the
   lead's) so that `accepted` cannot move after completion?
5. **`proposal_accepted`'s `session_id` at completion** — the session's id (my recommendation: the
   history shows the title, and the topic board counts it) or `null` as today? The key is identical
   either way.
6. **A co-presenter paid at approval before the migration who is not a session presenter.** Leave the row
   standing (my recommendation: no event touches it, and reversing it would be a backfill) or reverse it?
   A reversal would be a one-off data fix, never a migration.
7. **The reversal's reason «أُزيل من مقدّمي الجلسة».** Ledger data, not a message key. Confirm the words.
8. **`comment`, `photo`, `rating_submitted`** still pay at the act. I read `REQ-PTS-015`'s list as
   deliberate. Confirm.
9. **An attendee re-added after completion re-paying the presenter's `attendee_bonus`** — one enqueue of an
   existing job under its existing key. Include it (small, mine, correct) or carry it?
10. **`/app/me/points` shows no pending entries.** It has no pending row and no new key; contract 1
    carries the state. Confirm, or name the wording and I will request a key.
11. **The month-end streak gap** — evaluate the previous month as well during the first days of a month.
    Include it, or carry it?
12. **A presenter badge after removal.** `sessions_delivered_count` badges are never revoked (the
    evaluator only inserts), so a presenter removed after completion keeps one that counted that
    session. Leave it (badges are not points, and `REQ-REC-*` has no revocation) — confirm.

---

## Sync-1 early rulings, folded in (the lead, 2026-09-22)

**1 · `add_session_presenter()` may UPDATE a pending or declined row to `accepted = true`.** This is
covered already. The trigger is `after insert or delete or update of accepted, declined_at`, and it
compares `was` with `is`, not the operation. So `false → true`, and «`declined_at` cleared with
`accepted` set», are both «becomes an accepted presenter». After completion that pays; before completion
it does nothing. `POL-session_presenters.pays_on_join_after_completion` has an update case beside the
insert case.

**2 · Rows stuck at `accepted = false`, flipped by the owner's scoped data fix.** ★ **Stated plainly: on
a COMPLETED or ARCHIVED session, flipping a row to `accepted = true` PAYS that presenter**, exactly as the
fan-out would have at completion:
- `session_delivered` (50);
- `attendee_bonus` (2 per qualifying attendee, up to 30);
- `rating_bonus` (20) if the session's ratings meet the threshold. It is evaluated at once when completion
  was more than 48 h ago, otherwise also at +48 h;
- `proposal_accepted` never, because a directly created session has no proposal.

The payment goes through the worker (existing jobs, existing keys), so it lands when Railway runs them,
not inside the data fix's transaction. On a session **not yet completed**, the flip pays nothing now and
the member is paid at completion like any presenter. The owner's order: whether to run the fix before or
after this trigger is promoted **is** the decision to pay or not. Before → nothing is paid for sessions
already completed. After → they are paid. The read that sizes it is the third query in «What `main`'s
worker does».

**3 · Attendance and presenter awards together — the paths measured.** `check_in()` refuses
`is_presenter_of()` (`0120`, `check_in` body) and `mark_checked_in_manually()` refuses an **accepted**
presenter with `presenter_cannot_check_in` (`0120`, its body, «REQ-CHK-011 applies to manual too»). Both
test `accepted` **only**. So a member can still hold both an attendance award and presenter awards by
three routes, each of which **checks in first and becomes accepted later**:

| Route | Guarded today? |
|---|---|
| `sessions`' `add_session_presenter()` (insert or update to accepted) | yes, by its Q4 refusal |
| a pending (`accepted = false`) co-presenter checks in, then **the owner's data fix** flips the row | no. The fix is plain SQL |
| the same member, then **self-update** `accepted = true` (`session_presenters_update_self`) | no |
| an admin **inserting directly** through `p2_admin_insert` (`0010:476`), not through the RPC | no |

**My proposal, in `award_points()` (`0002`), one clause:** a `check_in` attendance award writes nothing
when the member is an accepted presenter of the session **at run time**. ★ **One condition in one place**
(`checkin`'s correction, 2026-09-22): the clause is a function,
`public.attendance_award_barred(p_session uuid, p_member uuid) returns boolean` (definer, `stable`,
`service_role` only, not an underscore name), and **both** `award_points()` and contract 1's
`session_award_state()` (row 2) call it. So a member who checks in and is then added as a presenter reads
`none`, never «pending» for an award the completion pass will not write (`REQ-CHK-018`: «the amount shown
is the one the completion pass will write»). The contract-1 test file gains
`RPC-session_award_state.agrees_with_award_points`: for every state fixture, `pending` if and only if
running the completion pass writes the award. Since the award now runs at
completion, this closes every route above for a session whose presenter changed **before** completion,
which is where the data fix mostly lands. After completion there is a residual case: a member already paid
for attendance who becomes a presenter. I do **not** reverse the attendance award automatically. It was
honestly earned when written, and a second automatic reversal path is more surface than the case is worth.
**Recommendation for the owner's order: the data fix excludes rows whose member has an active check-in on
that session**, which the owner can read first:
`select count(*) from public.session_presenters sp join public.check_ins c on c.session_id = sp.session_id and c.member_id = sp.member_id and c.removed_at is null where not sp.accepted and sp.declined_at is null;`.
This adds to the move list: **none**. No existing case checks in an accepted presenter, because both RPCs
refuse it. The new row is `RPC-award_points.presenter_earns_no_attendance`, in
`scoring-completion-timing.test.ts`.

**`checkin`'s Q2** (incomplete before completion): accepted by the lead, as row 4 of contract 1 states.


---

# Wave 12 — built (after sync 1, `DEC-174`)

**Proposed files are numbered `0006`–`0009`, not `0001`–`0004`.** Wave 9's test files still name
`scoring/0001_attendance_hooks.sql` … `0005_attendee_bonus_guard.sql` behind their probes, so reusing a
number would be confusing to read. The lead renumbers them from `0146` at promotion anyway.

| File | What | Proven by (new files) | Green |
|---|---|---|---|
| `supabase/proposed/scoring/0006_session_award_state.sql` | contract 1: `session_award_state()`, `attendance_award_barred()` | `tests/rls/scoring-award-state.test.ts` (9) · `tests/unit/scoring-award-state.test.ts` (8) | yes |
| `…/0007_award_at_completion.sql` | `award_points()` (timing for every session, the presenter bar, the presenter guard and epoch), `presenter_award_epoch()`, `proposal_presenter()`, `evaluate_member_attendance()` (pay waits for completion; ruling 9's re-pay), `attendance_recorded()`, `attendance_removed()` (no-show waits) | `scoring-completion-timing.test.ts` (10) | yes |
| `…/0008_presenter_awards.sql` | the approval trigger dropped; `enqueue_presenter_awards()`; `sessions_completion_fanout()` re-created; the `session_presenters_awards` trigger | `scoring-presenter-awards.test.ts` (7) · `scoring-proposal-at-completion.test.ts` (5) · `scoring-presenter-recompute.test.ts` (1) | yes |
| `…/0009_counting_completed.sql` | `evaluate_streaks()`, `evaluate_badges()` count completed sessions | `scoring-counting-completed.test.ts` (2) | yes |
| `src/lib/dal/points.ts` | `AwardDay`, `SessionAwardState`, `getSessionAwardState()`, `toSessionAwardState()` | the unit file above | `1458c16` |
| `worker/src/tasks/evaluate_no_shows.ts` | **comment only**: the one-day «proven no-op» sentence is no longer true | — | — |

**Whole RLS suite with every edit below applied: 128 of 129 files green.** The one red file is
`survey-submit.test.ts` (6 cases), which is **not mine and was red before any of my files existed**: it
fails identically on a run that applies none of my SQL. It counts all `record_survey_response` jobs with a
null key, and the shared database holds 4 such **committed** jobs, left there by some earlier run. Also
not mine: `session-presenters-admin.test.ts` › «a member of another org» was red once, on `sessions`'
uncommitted work, and green on the next run.

**Every edited test file applies `0006`–`0009` in its `ready()` / `setup()` / `apply()`.** That is one
loop, a no-op once promoted (`applyProposed()` skips a missing file), and it is what lets each case be
proven green **before** promotion.

## ★ The untouched-suite ledger lines — file, case, (a) expectation inverts / (b) harness only, why

Every file below also gains the `applyProposed()` loop for `0006`–`0009` (harness). **Promote `0007`,
`0008` and `0009` with these lines in the same commit**; `0006` moves nothing.

| # | File › case | Move | Why | Needs |
|---|---|---|---|---|
| 1 | `award-points.test.ts` › `POL-check_in.award_points_hook` › «a successful check-in enqueues exactly one award_points job, keyed by the check-in id» | (a) `toHaveLength(1)` → `0`, twice; the task and payload lines go | `REQ-PTS-015`: nothing is enqueued before completion | `0007` |
| 2 | the same › «end to end: running the enqueued job's SQL awards the check-in's points» | (b) the session completes and `evaluate_session_attendance()` runs before the job is read; `20` unchanged | the job exists only after completion | `0007` |
| 3 | `checkin-contract-5.test.ts` › «a code check-in enqueues exactly one award_points job under pts:check_in:<id>» | (a) `1` → `0` | as 1 | `0007` |
| 4 | the same › «a manual mark enqueues the same one job under the same key…» | (a) `1` → `0` | as 1 | `0007` |
| 5 | the same › «writes one compensating row per unreversed award, with the same key and reason, and awards the no-show» | (b) the session completes before the award | no award on a live session, and no no-show at removal before completion (DEC-174 ruling 2) | `0007` |
| 6 | `checkin-manual-mark.test.ts` › «enqueues exactly one award_points job, keyed pts:check_in:<id>…» | (a) `1` → `0` | as 1 | `0007` |
| 7 | `checkin-removal.test.ts` › «reverses the points award with ONE compensating entry…» | (b) the session completes before the award | as 5 | `0007` |
| 8 | the same › «removing a confirmed-RSVP member's check-in awards no_show…» | (b) the session completes before the removal | ruling 2 | `0007` |
| 9 | `checkin-late-job-hooks.test.ts` › «a removed check-in does not count toward a NOT-YET-awarded streak period or badge threshold» | (b) the session completes before the evaluators run | it would otherwise pass vacuously: a running session no longer counts at all | `0009` |
| 10 | `scoring-days-award.test.ts` › «enqueues exactly one award_points job under main's key, with main's exact payload» | (b) the session is `completed` | the hook pays only after completion; key and payload unchanged | `0007` |
| 11 | the same › «★ the seam is behaviour-neutral: called after check_in()'s own inline enqueue…» | (a) `before` and `after` `1` → `0`; the equality lines go | no inline enqueue and no pre-completion job | `0007` |
| 12 | the same › «calling it twice touches the same key, never a second job» | (b) `completed` | as 10 | `0007` |
| 13 | the same › «writes ONE compensating row for the attendee's award AND one for the presenter's attendee_bonus…» | (b) completed, and the presenter's accepted row, before the awards | timing plus DEC-174 ruling 1 | `0007` |
| 14 | the same › `no_show_symmetry` › «a confirmed RSVP earns the no_show rule…» | (b) completed before the removal | ruling 2 | `0007` |
| 15 | the same › «★ the seam is behaviour-neutral: called after remove_check_in() has already run…» | (b) completed before the award | it would otherwise compare two empty lists | `0007` |
| 16 | the same › `one_day_pays_at_check_in` | (a) no job at check-in; completion → **main's key and payload**, one row `…:v1`, the pass again writes nothing | ★ the case DEC-172 names; its key assertions survive verbatim | `0007` |
| 17 | the same › `reverses_added_day` | (b) the one-day award is written directly as a pre-DEC-172 check-in left it; `[20, -20]` unchanged | no award can be paid before completion any more; the case stays the proof for legacy rows | `0007` |
| 18 | the same › «★ a ONE-DAY session is untouched by that guard: it still pays while the session is running» | (a) `toHaveLength(1)` + key → `[]` | one rule, no branch on days | `0007` |
| 19 | the same › `reverses_presenter_bonus_by_member` | (b) the presenter's accepted row | ruling 1 | `0007` |
| 20 | `scoring-days-presenter-bonus.test.ts` › every case paying or refusing a bonus (`epoch_only`, both `requires_complete`, both `one_day_unchanged`, `skips_silently`, «… 50 + 2 × 2 = 54») | (b) one helper, `present()`, inserts the presenter's accepted row; `oldWorkerLoop()` calls it; two direct calls call it | ruling 1. Without it the refusing cases would pass vacuously | `0007` |
| 21 | `scoring-days-counting.test.ts` › «★ the EXACT query worker/src/tasks/award_presenter_points.ts runs…» | (b) the presenter's accepted row | ruling 1 | `0007` |
| 22 | `award-presenter-points.test.ts` › «approval enqueues one proposal_accepted job for the proposer and each accepted co-presenter, none for a declined one» | (a) `toHaveLength(1)` ×2 → `[]` | DEC-172: approval pays nothing | `0008` |
| 23 | the same › «end to end: the enqueued job awards proposal_accepted's 10 points» | (b) a completed session from the proposal, the proposer its accepted presenter; `10` unchanged | the award re-derives the completed session and the presenter | `0007` |
| 24 | the same › «award_presenter_points' logic: session_delivered + attendee_bonus per check-in…» | (b) completed + the presenter's row; `54` unchanged | timing + ruling 1 | `0007` |
| 25 | `recognition-evaluators.test.ts` › `evaluate_streaks.idempotent` and `evaluate_badges.idempotent` | (b) `sessionAtOffset()` completes each session | streaks and badges count completed sessions | `0009` |
| 26 | `checkin-days.test.ts:505–509` (**`checkin`'s, not edited**) | none: it still passes, but vacuously (no reversal before completion) | its after-completion half is proven by the new case «after completion a removal reverses under reversal:<id>:v1…» in `scoring-completion-timing.test.ts`, as DEC-174 asks | — |

## What a reader should know that the SQL does not say out loud

- ★ **A `proposal_accepted` job queued at approval seconds before the push** and run after completion
  writes its row with `session_id = null`: the payload it carries is the old one. The completion fan-out
  replaces a still-queued job under the same key with the new payload, so this needs a job that is
  **both** queued before the push **and** still queued at completion. That is harmless, and recorded.
- **`attendance_award_barred()` is also «is an accepted presenter»**: `award_points()`'s presenter guard
  calls it with the opposite sense. One definition; the name reads from the attendance side because that
  is where contract 1 needs it.
- **The trigger never raises** and returns on a cascade (session or member row gone). A failed award
  cannot undo an admin's presenter change.

---

# Wave 15 plan: `rank-row`, `race-bar`, `level-card` (`DEC-183`, `DEC-184`, M17)

*Planning only. No code, no test, no demo and no SQL until sync 1 approves this. Measured on
`wave-15/tokens-and-primitives` at `9a81014`, 2026-09-28.*

The three files are my first `ui/` primitives. Each renders every state from props. None reads the DAL, a
session or a message catalogue, and none is placed on a screen. **Nothing moves this wave.** The FLIP, the
arrow's pulse, the bar's growth and the card's flip with its shine belong to the next wave. This wave, a rank
change and a level reached are props, and so the three primitives have **no transition, no animation and no
keyframe at all**. Under reduced motion they therefore render exactly as they do without it, which is the
static state the next wave's moments must end on.

## 0 · What I change, and in which order

**Existing primitives: none.** I own no existing `ui/` file. No class, colour or size of the 37 moves because
of me. **No existing test moves.** `tests/components/scoring/**` has no board test. `member-board.tsx` and
`company-board.tsx` are frozen and I only read them. Nothing goes into the untouched-suite ledger.

The order is `07-tasks.md`'s («`rank-row`, `race-bar`, `level-card`»), one commit per primitive. Each commit
holds its `.tsx`, its test and its demo:

| # | Commit | Files | Waits on |
|---|---|---|---|
| R1a | `feat(scoring): rank-row, every state from props` | `src/components/ui/rank-row.tsx`, `tests/components/ui/rank-row.test.tsx`, `src/app/[locale]/(dev)/ui/demos/rank-row.tsx` | C1 (names), C2 (`RankRowProps` and `AvatarProps.teamColor` in `index.ts`), D2 (`content`'s ring on `avatar`) |
| R1b | `feat(scoring): race-bar, every state from props` | `ui/race-bar.tsx`, its test, its demo | C1, C2, N3 (`content`'s `progress-bar`, with the three asks in §5) |
| R1c | `feat(scoring): level-card, both faces from props` | `ui/level-card.tsx`, its test, its demo | C1, C2, F1 (`--font-display`) |

If D2 or N3 is late, `level-card` goes first because it depends on no other track. The order is a
preference, not a dependency. `Refs:` on each: `REQ-UIX-037` / `038` / `039`, `DEC-183`.

**Tokens only**, in all three: no hex, no duration, no raw palette name, and no `left`/`right`/`ml-`/`pl-`/
`text-left`. Nothing mechanical checks this in a primitive: `ui-lint` excludes `src/components/ui/`
(`scripts/ui-lint.mjs:42`). So **each test file carries a source scan** of its own primitive. It reads the
`.tsx` as text and fails on `/#[0-9a-f]{3,8}\b/i`, `/\d+m?s\b/` in a class or style, the raw palette's names
(`navy-`, `silver-`, `lime`, `coral`, `ink`, `bone`, `team-`, `level-`, once C1 publishes the raw list),
`transition`, `animate-` and `@keyframes`. Physical-direction utilities fail the scan too.

## 1 · The three prop types (contract 2 — for the lead to land in `ui/index.ts`)

```ts
// ── Game (3) — `scoring`, wave 15 (DEC-183) ─────────────────────────────────

/**
 * `scoring` · `rank-row.tsx` — REQ-UIX-037. One member's row on SCR-027.
 *
 * ★ There is NO `src`: the row draws `avatar`'s initials in the team ring and never a photograph
 * (DEC-183 §3, DEC-099). The type makes a photograph impossible to pass.
 * ★ A leaderboard never shames: a row whose rank FELL renders byte-identically to a row with no
 * `movement` at all — no colour, no icon, no motion. Only a rise is drawn.
 */
export interface RankRowProps extends Styleable {
  rank: number;
  /** What a screen reader hears for the rank — «المركز 5». The caller's string. */
  rankLabel: string;
  /** The avatar's tint key (REQ-PRF-009) — never the name. */
  memberId: string;
  displayName: string;
  /** The member's شركة, or null when they have none (`members.company_id` is nullable). */
  company: string | null;
  /** `#rrggbb` or null (contract 3). Rings the avatar, never fills it; null draws the neutral ring. */
  teamColor: string | null;
  /** The digits shown, formatted by the caller in Western numerals («1,410»). */
  points: string;
  /** What a screen reader hears — «1,410 نقطة», all six ICU forms being the caller's. */
  pointsLabel: string;
  /** Set on the viewer's own row only: the row is outlined AND carries this word visibly — «أنت». */
  selfLabel?: string | null;
  /**
   * The rank held before. The primitive compares, so no caller can draw a fall by mistake:
   * previousRank > rank draws the rise marker and reads `riseLabel`; a fall, a tie or null draw nothing.
   */
  movement?: { previousRank: number; riseLabel: string } | null;
  /** The member's profile. The whole row becomes the target (≥ 44 px), not only the name. */
  href?: string;
}

/**
 * `scoring` · `race-bar.tsx` — REQ-UIX-038. One company on SCR-028 (and SCR-010's widget).
 * The colour is never the only channel: the name is always drawn, in text, beside the ring.
 */
export interface RaceBarProps extends Styleable {
  companyName: string;
  /** `#rrggbb` or null (contract 3) — the ring and the fill. Null draws the neutral ring and fill. */
  teamColor: string | null;
  /** The ranking metric's value, formatted and possibly signed by the caller («7.3», «‎-12»). */
  value: string;
  /** Names the metric the org ranks by (REQ-LDR-005) — «نقاط لكل عضو نشِط». Drawn visibly. */
  metricLabel: string;
  /**
   * The fill, from 0 to 1, relative to the leader. Clamped. A negative, NaN or missing value draws an
   * empty track: a company's total can be below zero (`company-board.tsx:56-58`), and the text says so.
   */
  fraction: number;
  rank?: number;
  /** «المركز 3» — required when `rank` is given. */
  rankLabel?: string;
  /** The other metric, quieter — REQ-LDR-004 keeps both visible on SCR-028. */
  secondary?: { label: string; value: string } | null;
  /** Set on the viewer's own company only: outlined AND named in words — «فريقك». */
  ownLabel?: string | null;
}

/** One face of the level card. */
export interface LevelFace {
  /**
   * `levels.sort_order`. It picks the ramp stop. The name never does, because an admin can rename a
   * level (REQ-REC-003, SCR-054). Values outside 1–5 clamp to the nearest stop.
   */
  tier: number;
  /** The org's name for the level — «صاحب أثر». */
  name: string;
  /** Heads the face — «مستواك الحالي», «مستوى جديد». */
  caption: string;
  /**
   * What the level turns on: each entry is an ENABLED `perks` row at this level, named. It may be
   * empty, and then the face says `noUnlocksLabel`. A privilege the org has not enabled is never listed
   * (REQ-REC-004, and §6.1 below).
   */
  unlocks: readonly string[];
}

/**
 * `scoring` · `level-card.tsx` — REQ-UIX-039. SCR-022's level, and the level just reached.
 * Both faces are in the document in every state, and neither is hidden from assistive technology.
 */
export interface LevelCardProps extends Styleable {
  /** The level the member held — the front face. */
  level: LevelFace;
  /** The level just reached — the back face. Absent when nothing was reached. */
  reached?: LevelFace | null;
  /** Which face shows. «reached» with no `reached` face shows `level`. Default «level». */
  shown?: "level" | "reached";
  /** Heads the unlock list — «يفتح لك». */
  unlocksLabel: string;
  /** Said on a face whose `unlocks` is empty — «لا امتياز مرتبط بهذا المستوى بعد». */
  noUnlocksLabel: string;
}
```

Each type is a plain object with string and number props and no function props. A Server Component can
therefore render all three, and none of the three needs `"use client"`, because nothing in them is
interactive beyond `rank-row`'s optional link. The house `ui/link` is the lead's file and I import it by path.

## 2 · `rank-row` (`REQ-UIX-037`)

**What it draws**, inline start to inline end: the rank in the display face, the avatar in its team ring
(`content`'s `avatar` at 32 px, `decorative`, with `teamColor` and **no `src`**), then the name over the
company, then the rise marker if the rank rose, then the points in the display face. The row is 56 px tall
and never less than 44. It is an `<li>`, and the board wraps rows in a `<ul>`, as `member-board.tsx:68` does
today. It is a `<ul>` and not an `<ol>`: ties share a rank, and an `<ol>` would announce a position that
contradicts the number.

**States:** neutral · self (outlined, and the word) · rose (the marker) · self and rose · fell (**identical
to neutral**) · tie or new entry (identical to neutral) · no company · null team colour (neutral ring) · with
`href` (the whole row is the link) · a long name, which wraps and is never clipped, with no `overflow:hidden`
on a text line.

**★ How a fall is guaranteed to carry no colour, no icon and no motion.** The row does not take a «fell»
state. It takes `movement.previousRank` and draws only when `previousRank > rank`. Any other value takes the
**same code path** as `movement: null`. A fall is not «drawn quietly». There is no branch for it at all.
**The test** (`tests/components/ui/rank-row.test.tsx`, «a row whose rank fell is the neutral row»):
- it renders `{rank: 5, movement: {previousRank: 3, riseLabel: "…"}}` and `{rank: 5}` into two containers
  and asserts `fell.innerHTML === neutral.innerHTML`. Byte identity covers colour, icon, motion and every
  attribute at once;
- it asserts the fallen row holds no `svg`, and that the `riseLabel` text is absent from it;
- it asserts no element in the row has a class matching
  `/accent|signal|error|live|success|danger|warn|animate|transition|motion-/`, and no inline `style` other
  than the avatar's `--team`;
- it runs the same two assertions for a tie (`previousRank === rank`) and for `previousRank: 0`;
- ★ **a guard against a vacuous pass:** the same file asserts that the RISEN row does differ from neutral
  and holds the marker. If a refactor dropped the marker entirely, the fell-row test alone would stay green.

**The rise marker:** `ArrowIcon direction="up"`. It already exists (`ui/icons.tsx:89-97`, and `up` does not
mirror, `:85`), so **no glyph request**. It is drawn in the accent, and `riseLabel` sits beside it in a
visually-hidden span, so colour is never the only channel: the glyph's shape and the words carry it.
`04-components.md` calls it a «delta arrow»; the number of places risen belongs in `riseLabel`, which the
caller writes with ICU plurals.

**The viewer's own row** is outlined with a 2 px accent border, **and** `selfLabel` («أنت») is rendered as
**visible** text next to the name. The name stays. The prototype replaces the name with «أنت»
(`motion-story.html:438`), which loses the member's own name. The tree keeps the name and adds a word
(`member-board.tsx:35-39`), and I follow the tree. The word is text, not an `aria-label`, so sighted
screen-reader users and sighted users get the same thing.

**What a screen reader hears**, in DOM order: «المركز 5 · ريم الشهري · بنينسولا ستوري · تقدّم مركزين · 680
نقطة · أنت». The visible rank digit is `aria-hidden`, and `rankLabel` is in an `sr-only` span, as
`member-board.tsx:27-30` does today. The avatar is `decorative`, so the name is not read twice. When the row
has `href`, the link's accessible name is the display name, and its `::after` covers the row.

**RTL:** logical properties only. The rank sits at the inline start. `<bdi>` wraps the name, the company,
the points and the visible rank. The digits are Western: the rank is `String(rank)`, which is ASCII in every
locale, and the points arrive already formatted by `formatNumber` (`src/components/sessions/numerals.ts`,
`ar-u-nu-latn`, which gives «1,410»; checked with node).

**Reduced motion:** nothing moves in any state, so there is nothing to collapse. The next wave's FLIP ends
on exactly this markup.

**Token roles:** surface (row), line (border), text, muted (the company and the neutral rank), accent (the
self outline, the rise marker), the display face (rank and points), `--team` (on the avatar, drawn by
`content`), and a row radius (see §7).

**What in the tree already does part of its job:** `member-board.tsx:24-44` (the `Row`). It supplies the
sr-only rank sentence (`:27-30`), the name in `<bdi>` linking to `/app/members/<id>` (`:32-34`), the self
word as a `Badge` (`:35-39`), and the points (`:41`). Its self row uses `bg-silver-100` + `border-edge-strong`
(`:26`), a colour change on the viewer's own row that the playground replaces with the accent outline plus
the word. Its comment «NO AVATARS (DEC-099)» (`:17-18`) is superseded for **initials** by `DEC-183` §3; the
adopting wave rewrites that comment. `member-board.tsx:53-76` also keeps the viewer's row «under ترتيبك»
when it falls outside the top N (`REQ-LDR-001`). That is the **board's** job, and `rank-row` stays one row.

## 3 · `race-bar` (`REQ-UIX-038`)

**What it draws:** optional rank, a small team ring (a 20 px circle with a 3 px `--team` border, as in the
prototype at `motion-story.html:140`), the company name **in text**, the bar (`content`'s `progress-bar`),
then the value in the display face with `metricLabel` beneath it. `secondary` goes under the name when given.

**The company is identified by its name as well as its colour.** The name is always rendered, in text, and
is never truncated to nothing. The ring and the fill repeat the colour and never replace the name. A test
renders two companies with the same `teamColor` and asserts both names are visible text. With a null colour,
the name is the only identifier, and that is enough.

**The ranking metric is marked (`REQ-LDR-005`).** `metricLabel` is **visible** on every bar, and a screen
reader hears it with the value: «صنف · 7.3 نقاط لكل عضو نشِط». `REQ-LDR-004` asks for both metrics at once on
SCR-028, and the prototype's widget shows only one (see §6.4), so `secondary` carries the other metric.
`company-board.tsx:24-28` already orders «ranked first, other quieter», and I keep that order.

**The viewer's own company** gets the accent outline **and** `ownLabel` («فريقك») in words, by the same rule
as `rank-row`'s self row.

**States:** neutral · own · with and without rank · with secondary · null colour · `fraction` 0, 1, over 1,
negative and NaN (clamped; the value text keeps its sign in `<bdi dir="ltr">`, as `company-board.tsx:59`
does today) · a long company name that wraps («بنينسولا ستوري»).

**What a screen reader hears:** «المركز 3 · صنف · 7.3 نقاط لكل عضو نشِط · إجمالي النقاط 1,204 · فريقك». The
**bar itself is decorative**, because its value is already in the text beside it. Exposing a second
`progressbar` would read the number twice. This is my first ask of `content` (§5).

**RTL:** the fill grows from the inline start: the right in Arabic, the left in English. That is
`progress-bar`'s `transform-origin` (`REQ-UIX-036`). Logical flex order puts the ring and the name at the
start and the value at the end. The `teamColor` value reaches the DOM only as `style={{"--team": teamColor}}`
on the ring and the bar's element. It never becomes a class and never becomes a hex in the file (contract 3).

**Reduced motion:** nothing moves. The fill is a static `scaleX`.

**Token roles:** surface, raised (the track), line, text, muted, accent (the own outline), `--team` (ring and
fill), the neutral ring and fill for null (see §7), pill radius, the display face.

**What in the tree already does part of its job:** `company-board.tsx:34-64`. It supplies the rank sentence
(`:36-39`), the name in `<bdi>` (`:40-42`), both metrics with the ranked one first and marked by a `Badge`
«الترتيب حسبه» (`:44-62`), signed values in `<bdi dir="ltr">` (`:56-59`), «—» for a null per-member value
(`:23`) and the «as of» line (`:67`). It has no bar, no ring and no colour.

## 4 · `level-card` (`REQ-UIX-039`)

**Two faces.** Front: `level`, the level held, its caption («مستواك الحالي»), its name in the display face
and its unlocks. Back: `reached`, the new level with the same parts. **Which face shows is `shown`**
(«level» | «reached»). There are three states: (a) `level` alone, where the card is one face; (b) `level` and
`reached` with `shown="level"`, which is the frame the next wave's flip starts from; (c) `level` and
`reached` with `shown="reached"`, which is the flip's end frame and **the reduced-motion state: the new face
simply shown**.

**Both faces are reachable by a screen reader in either state.** Both are always in the DOM, each is a
`role="group"` named by its caption, and in logical order: the level held, then the level reached. The face
that is not shown is **visually hidden (`sr-only`)**. It is not `hidden`, `display:none`, `aria-hidden` or
`inert`. The test asserts, for both values of `shown`, that `getAllByRole("group")` has length 2 and that
neither group carries `aria-hidden` or `hidden` or has an `aria-hidden` ancestor. The next wave's 3D flip
uses `backface-visibility: hidden`, which does not hide anything from assistive technology, so this
guarantee survives the moment. Nothing on the card is focusable, so a visually hidden face never takes
focus.

**Each face names a real privilege.** `unlocks` lists the **enabled** `perks` at that level, by name
(`perks.key` → «أولوية الحجز», «الحق في اقتراح جلسة», `recognition.json:176-177`). ★ **The tree cannot
satisfy «each face names a real privilege» in a default org, and the primitive will not pretend otherwise**
(§6.1). A face with empty `unlocks` says `noUnlocksLabel`. The primitive never invents a privilege, and its
demo never shows one that the org could not have enabled.

**The level ramp:** the face's stop is picked by `tier` (`levels.sort_order`) and never by the name,
because levels are org-editable. The front face is raised/line; the reached face takes the ramp stop as its
fill. The text on every stop is the dark ink: all five stops in `01-tokens.md` are light. That makes it a
**token request** (§7).

**RTL:** the caption, name and list flow start-aligned and centred as in the prototype. `<bdi>` wraps the
level name and every unlock, because an org's level name is data. The card's height is set by its content,
never a fixed 150 px with `overflow:hidden` as in the prototype (`motion-story.html:205, 208`), which would
clip tashkeel.

**Reduced motion:** nothing moves. Switching `shown` swaps which face is visually hidden.

**Token roles:** raised, line, text, muted, the level ramp, on-ramp text, card radius, the display face.

**What in the tree already does part of its job:** nothing on a member screen. The level appears as
`levelName` text on the profile (`leaderboards.ts:241-272`, `getMemberStanding`), and the perks appear only
on the admin's SCR-054 (`app/admin/recognition/perks-table.tsx:28-48`), whose strings are the privilege
names above.

## 5 · Measured: what the boards draw today, and what the DTOs carry, for the wave that ADOPTS them

**No board, no DAL and no message file changes this wave.** This is the adoption wave's shopping list.

| Prop | Today's DTO | Carries | Lacks |
|---|---|---|---|
| `rank-row` `rank`, `memberId`, `displayName`, `points`, self | `MemberBoardRow` (`leaderboards.ts:12-18`) | `rank`, `memberId`, `displayName`, `points`, `isSelf` | — |
| `rank-row` `company` | — | — | the member's company name: `getLeaderboards` selects only `id, display_name` (`:65`, `:88`) |
| `rank-row` `teamColor` | — | — | `companies.team_color` (`0160`, D1) joined through `members.company_id` |
| `rank-row` `movement` | — | — | **any previous rank**. All-time is a live RPC with no history (`:40`); the monthly board reads only the latest snapshot (`:42-49`). «Since last view» (`03-motion.md` moment 5) has no store (§6.3) |
| `rank-row` opted-out | database | `all_time_leaderboard()` already omits an opted-out member for others (`0044`) | — |
| `race-bar` `companyName`, `rank`, both metrics, which is ranked | `CompanyBoardRow` (`:20-26`) + `Leaderboards.companyMetric` (`:32`) | all of it | — |
| `race-bar` `fraction` | computable from the rows (value ÷ the leader's) | — | — |
| `race-bar` `teamColor` | — | — | `team_color`: `:113` selects `id, name` |
| `race-bar` `ownLabel` | `getCompanyPointsBreakdown` knows the viewer's company (`:173`) | — | a flag on the row; `getLeaderboards` does not read `members.company_id` |
| `level-card` `level.name` | `MemberStanding.levelName` (`:245`) | the name | `tier` (`levels.sort_order`) |
| `level-card` `unlocks` | — | — | the **enabled** `perks` at that level (`perks.required_level_id`, `enabled`, `0027:283-294`); `member_perks` is readable (`0027:323-325`) |
| `level-card` `reached` | — | — | a «just reached» signal. `points_balances.current_level_id` holds only the present (`0027:374`). `MSG-level_reached` exists as a notification key (`0026:115`, bindings `level`, `url` at `0133:104`), so a notification row is the nearest existing record |
| `recognition.ts` | `MemberRecognition` (badges, `streakMonths`) | nothing these three read | — |
| `points.ts` | `PointsStripData` (`totalPoints`) and `PointsHistory` | nothing these three read | — |

## 6 · New disagreements, beyond `DEC-183` §4's seventeen (I pick no side)

1. ★★ **`REQ-REC-004` against the tree, which the level card surfaces.** `REQ-REC-004` says «every level above
   the first grants something real». In the tree:
   - `perks.key` is checked to `('priority_rsvp', 'can_host')` (`0027_m4_schema.sql:286`), so **levels 2
     (مشارِك نشِط) and 5 (سفير المعرفة) cannot grant anything**;
   - both perks **ship disabled** (`0027:577-582`, re-seeded in `0083:75`, `REQ-REC-008`), so in a default
     org **no level grants anything**;
   - `can_host` is labelled «الحق في اقتراح جلسة» (`recognition.json:177`). It is a **gate**: enabling it
     stops members below the level from proposing (`:179`, `canHostWarning`), and while it is disabled
     everyone may already propose. The prototype's back face says «يمكنك الآن تقديم الجلسات»
     (`motion-story.html:421`). In a default org that sentence is false.

   `REQ-UIX-039`'s «each face names a real privilege» therefore cannot be met truthfully in a default org.
   The primitive says `noUnlocksLabel` rather than invent one. **Which of the two to change, the privileges
   or the requirement, is the owner's call.**
2. **The level ramp is keyed by level name** in `01-tokens.md` («level-4 = كريم معرفة, the brand accent, on
   purpose»), but level names and thresholds are org-editable (`REQ-REC-003`, `scoring-admin.ts:481, 610`).
   The card keys the ramp on `sort_order`. An org that renames level 4 keeps the lime. There are five stops,
   and nothing stops a sixth level from existing in principle. The primitive clamps.
3. **Moment 5's trigger has no data source.** «The member opens a board where their rank changed since
   last view» (`03-motion.md`, moment 5) needs a stored last-seen rank per member and board. None exists,
   and the all-time board has no history. That is the next wave's problem, and it is a schema question,
   which makes it the lead's.
4. **The race widget shows one metric; `REQ-LDR-004` requires both at once** on the company board.
   `motion-story.html:346-351, 440-445` show only the ranked value. `REQ-UIX-038` alone would permit that on
   SCR-010's widget, but SCR-028 must keep both. Hence `secondary`.
5. **A negative company value.** `company-board.tsx:56-58` says a company's total can go below zero.
   `03-motion.md` and the prototype assume a bar from 0 to the leader. `race-bar` clamps the fill at empty
   and keeps the signed text. Is that acceptable, or should a negative company be drawn differently?
6. **The avatar's shape and sizes.** The design draws a **circle** with a 3 px ring
   (`motion-story.html:223`, `04-components.md`: «sizes 32/38/40»). The tree's avatar is a 6 px
   rounded square (`avatar.tsx:65-70`, the lead's ruling, `DEC-110`), and has no 38 (`index.ts:599`). It is
   `content`'s to rule; `rank-row` draws whatever `avatar` draws.
7. **The self row.** The prototype replaces the viewer's name with «أنت» (`motion-story.html:438`). The tree
   keeps the name and adds the word (`member-board.tsx:35-39`). I follow the tree, and `REQ-UIX-037` («says
   it is theirs in words») is met either way.
8. **Naming hazard, for C1.** A marketing `@utility text-display` already exists (`globals.css:336-342`, the
   hero's size). `tokens.css` adds `--text-display-xl … -sm` and `--font-display`. They do not collide
   byte-for-byte, but `text-display` (the marketing hero) and `text-display-lg` (the playground) side by
   side will be confused. I need to know the class that means **the display face**.
9. **Not a disagreement, but not to be copied:** the prototype's level faces are a fixed 150 px with
   `overflow:hidden` (`motion-story.html:205, 208`), which clips tashkeel. `CLAUDE.md` forbids it.

## 7 · Requests

**To the lead: tokens (contract 1).** Beyond the ten semantic roles and the structural ones, I need:
- **the display face**, and its class name (§6.8);
- **text on accent**: `01-tokens.md` says «text on it is always ink», but the list has no `on-accent` role.
  The level card's reached face and any accent fill need it;
- **the level ramp as readable names**: five stops, which do not remap per theme (`01-tokens.md`), plus the
  text colour on them (ink for all five). Otherwise `level-card` reads raw palette names, which rule 5
  forbids;
- **the neutral team ring and fill for `teamColor: null`**, one name shared with `content`'s avatar so that
  a company without a colour looks the same on a row, a bar and an avatar;
- **a row radius**: the prototype's row is 16 px (`motion-story.html:221`). That is `--radius-poster`'s
  value in `01-tokens.md`, and «poster» is the wrong name for a row. Or I use the card radius, which the lead
  can rule;
- **what `accent` resolves to outside the scope.** Today has no accent. The primitives appear only inside
  the scope this wave, but a test renders them outside it. I suggest today's `--btn-bg`.

**To the lead: glyphs and objects.** **None.** The rise marker is `ArrowIcon direction="up"`
(`icons.tsx:89`), which exists. The cup (season end) and the rocket (level-up) belong to the next wave's
moments. No primitive of mine draws an object this wave.

**To `content` (through the lead), for `progress-bar` (N3):**
1. a **decorative** mode (`aria-hidden`, no role) for a bar whose value is already in text beside it, which
   is the race bar's case. Without it, a screen reader hears the value twice;
2. a **fill that reads `--team`**, with the neutral fallback, in one shared place;
3. `value` as a **fraction or value/max, clamped**, including negative and NaN → empty;
4. heights: 10 px for the race, and the level bar's 12 px is the next wave's.

**To `content`, for `avatar` (D2):** `teamColor` → the ring, the neutral ring for null, and `decorative`
kept. `rank-row` passes `size={32}`, `decorative`, `teamColor` and **never `src`**.

## 8 · Demos (contract 4): fixture literals only, Arabic, inside the scope

`src/app/[locale]/(dev)/ui/demos/{rank-row,race-bar,level-card}.tsx`, each exporting one Server Component
(`RankRowDemo`, `RaceBarDemo`, `LevelCardDemo`) for the lead to import into `page.tsx`. They read no DAL, no
session and no catalogue. ★ The team colours in the fixtures are **data**, as `DEC-183` §4.11 wants the
gallery to carry them. They are hex strings in the demo file, never in a primitive.

- **`rank-row`:** a `<ul>` of seven rows from `motion-story.html:434-438`'s board. The rows are سارة
  القحطاني · مواهب (1), محمد الدوسري · جذر (2), ريم الشهري · بنينسولا ستوري (3), فهد العنزي · أيك (4,
  **fell** from 3, beside a label saying so in the demo's own caption), the viewer · صنف (5, **self + rose**
  from 6), a member with **no company**, and one with a **null team colour**. A second list shows **one
  self row that fell**, which must look exactly like a neutral self row. The points are «1,410», «1,205»
  and so on.
- **`race-bar`:** five companies ranked by «نقاط لكل عضو نشِط» (9.4, 8.7, 7.3 own «فريقك», a null colour,
  a **negative** total «‎-12» with an empty track) under a demo heading. The same five are shown again with
  `secondary`, as SCR-028 will draw them.
- **`level-card`:** (a) مشارِك alone, no unlocks → `noUnlocksLabel`; (b) صاحب أثر → كريم معرفة,
  `shown="level"`; (c) the same pair, `shown="reached"`; (d) tier 3 with «أولوية الحجز» as its one unlock,
  labelled in the demo «when the org has enabled the perk».

Captures: `.qa-shots/rtl/wave15-scoring-<primitive>-<state>.png`, at 390 px and desktop width, once the lead
has wired the demos (question 6).

## 9 · Questions for the lead, numbered

1. ★ **`REQ-REC-004` / `REQ-UIX-039` against the perks** (§6.1): may a face say «no privilege yet»
   (`noUnlocksLabel`) when the org has none enabled? That is my plan. Or does the owner want privileges for
   levels 2 and 5 (a `perks.key` change, the lead's table), or the requirement amended?
2. **C1's names** for the six token requests in §7, especially **on-accent**, the **level ramp** and the
   **neutral team ring**. Is the neutral ring content's name or a published token?
3. **The row radius:** the card radius, or a new structural one (§7)?
4. **Metric marking on the race bar:** visible `metricLabel` on every bar (my plan), or once per group in
   the board's header, with the bar carrying it only for screen readers?
5. **A negative company value** (§6.5): an empty track with the signed number, as planned?
6. **Captures:** my demos show only once `page.tsx` imports them. Will you wire each on my commit so that I
   can take the captures through one e2e spec under the gate lock, or will you take them in V1?
7. **`rank-row`'s `href`:** keep it (the adopting board links to the profile today, `member-board.tsx:32`),
   or leave linking to the board?
8. **`index.ts`'s header comment** lists the owners (`index.ts:29-37`). It gains a `scoring` line
   (`rank-row · race-bar · level-card`) with C2. That is yours, and I mention it only so that it is not
   missed.

---

# Wave 15: built (after sync 1, `DEC-186`)

| Primitive | Commit | Test | Demo |
|---|---|---|---|
| `level-card` (`REQ-UIX-039`) | `0b07d73` | `tests/components/ui/level-card.test.tsx`: 13 cases | `demos/level-card.tsx` → `LevelCardDemo` |
| `rank-row` (`REQ-UIX-037`) | `cfe05730` | `tests/components/ui/rank-row.test.tsx`: 18 cases | `demos/rank-row.tsx` → `RankRowDemo` |
| `race-bar` (`REQ-UIX-038`) | `bf5e0859` | `tests/components/ui/race-bar.test.tsx`: 20 cases | `demos/race-bar.tsx` → `RaceBarDemo` |

`tests/e2e/wave15-scoring-gallery.spec.ts` captures all three on both grounds at 390 px and desktop width
(`.qa-shots/rtl/wave15-scoring-<primitive>-<dark|light>-<390|desktop>.png`). It skips a demo that is not wired
yet, and the lead runs it against a `KAREEM_GALLERY=1` build. Each demo's root is `data-demo="<primitive>"` and
carries **no scope of its own**; `playground.tsx` places it on each ground.

**Done, as planned:**
- ★ **A falling row is the neutral row, byte for byte.** Four cases cover a fall, a tie, `previousRank: 0` and
  NaN, and one more covers the viewer's own row falling. A guard case asserts that a risen row differs and carries
  the up arrow. The row takes no `src`, and a source scan asserts that `src` never appears in the file.
- **The level card:** both faces are `role="group"`, in the DOM in either state, and never `aria-hidden`,
  `hidden` or `inert`. The face not shown is `sr-only`. The ramp is keyed on `tier`, clamped to 1–5. An empty
  `unlocks` says `noUnlocksLabel`.
- **The race bar:** the name is always text, and two companies with the same colour are still told apart. A
  malformed colour takes the neutral ring and fill. `metricLabel` is visible. The bar is `decorative`, so a
  screen reader reads the value once. A negative value draws an empty track and keeps its sign.
- **Nothing moves:** each test scans its source for `transition`, `animate-`, `@keyframes` and `.animate(`, for
  physical-direction utilities, and for `overflow-hidden` / `truncate`.
- **The light ground:** the accent is 1.07:1 on paper (`DEC-186` §2), so the self or own outline and the rise
  arrow take `pg-light:` heading ink there. The word carries the meaning on both grounds.

**Gates at `bf5e0859`:** tsc clean · lint 0 errors · `ui-lint` strict clean · `tokens-only` and
`public-graph` green · `npm test` 3159 passed, **1 failed, not mine**: `tests/unit/typography-utilities.test.ts`
does not recognise the lead's `text-play-*` theme keys, and fails on `playground.tsx` too. Told to the lead.

**Not done, and why:** the captures need the lead's `KAREEM_GALLERY=1` build and the three demos wired into
`playground.tsx`. Adoption on a board is the screens wave's, with §5's DTO list.

## The lead's 390 px finding on `race-bar`: fixed in `7f03d4ed`

**What was wrong:** at 390 px the gallery gives a demo 326 px. `race-bar` put five things on one line, three of
them fixed-width (the rank, the ring, and the name at `w-24`), and the value column with `metricLabel` could
not shrink. The value and its metric therefore stood outside the row's frame toward the inline end, and on
the dark ground the page edge cut them («9.4» read «.4»). My gallery spec checked only the page for sideways
scroll, and in RTL an overflow toward the left does not always widen the page.

**The fix, with the props unchanged:** the row is now three lines. The first holds the rank, the ring, the
name (`min-w-0 flex-1`, so it wraps) and the number (`shrink-0`, display face, sign kept). The bar runs across
the whole row on the second. The third is `metricLabel` and `secondary`, and it is `flex-wrap`, never
truncated, with no `overflow-hidden` on it.

**The proof:** `race-bar.test.tsx` gains four structural cases: the bar has its own line, the name has no
fixed width, the metric line wraps and is never truncated, and the number stays whole. The gallery spec now
asserts, per row on both grounds and at both widths, that every descendant's box lies inside the row's frame.
It skips `sr-only`; the frames are the `<li>` of `rank-row` and `race-bar` and the visible face of
`level-card`. Only the lead's re-capture measures the widths.

## The lead's finding on `level-card`: repeated ids. Fixed in the commit below

**What the lead measured:** 29 repeated ids on `/ar/ui` at `a985050a`, all `_S_<n>_-caption` / `-unlocks`,
coming from `level-card`'s `useId()`-based `aria-labelledby`.

**What I found:** within one card the two faces do get different ids, because `Face` calls `useId()` once per
instance: `_S_5_` for one face and `_S_6_` for the other, which is what the lead's sample shows. Flight's
`useId` is a per-request counter (`react-server-dom-webpack-server…js:6206-6216`), so it never repeats within
one render. The repeats come from **one element rendered twice**. `playground.tsx` builds `DEMOS` once, as
elements (`node: <LevelCardDemo />`), and places the same element on both grounds. Flight writes that one
subtree in both places, with every id in it. **Any** primitive that writes an id would repeat in the same way;
that includes `useId` in `content`'s, `sessions'` or `console`'s primitives. This is a finding for the lead's
file: `{ Demo: LevelCardDemo }` rendered as `<d.Demo />` per ground would give each ground its own render.

**What the fix in my file does:** `level-card` writes **no id at all**. Each face is `role="group"` with
`aria-label={caption}`. The caption stays visible, readable text. The unlock list is `aria-label={unlocksLabel}`,
and its visible «يفتح لك» is `aria-hidden`, so the heading is not read twice. A primitive with no ids cannot
collide however it is placed, and no reference can resolve to another face's caption.

**The proof:** two new cases in `level-card.test.tsx`. The first renders one card element twice and checks
that no id repeats. On its own it would not have caught the old code, because a client render gives each
instance its own `useId`; the comment says so. The second checks that the card has no `aria-labelledby` or
`aria-describedby`, and that each face is named by its own caption with its own list inside it.

**`rank-row` and `race-bar`:** checked; neither writes an id or uses `useId`.

---

# Wave 16 — plan

*Planning only (`DEC-195`, `DEC-196`, M18). `REQ-UIX-044`, `REQ-UIX-047`, `REQ-UIX-048`; contracts 1 – 3, 5 and 6.
Nothing under `src/`, `tests/`, `supabase/` or `messages/` has been touched. The sync-1 questions are answered here, in
§5 – §9, in the order `STATUS.md` asks them; the lead copies what it wants into `STATUS.md`, which is not mine.*

## 1 · ★★ Contract 5 — what «first sight» and «since last view» read

### 1.1 · What exists today, measured

| Moment | Its occurrence | Where it lives today | What is missing |
|---|---|---|---|
| 3 · انتهت الجلسة | the ledger rows the completion pass wrote | `points_ledger` (self-readable, `0027:359`), `points_balances.last_entry_id` / `total_points` (`0027:369-376`) | **the balance and the last row the member last SAW** |
| 4 · ترقية المستوى | a new `current_level_id` | `points_balances.current_level_id` (`0027:374`), set only by the **nightly** `evaluate_levels_perks()` (`0041:136-176`, raise-only) | **the level the member last saw**. `MSG-level_reached` is declared (`0026:115`) and never sent, so no notification row records it either |
| 5 · تغيّر الترتيب | a rank that differs from the one last seen | all-time: `all_time_leaderboard()`, live, **no history** (`0044:17-27`) · monthly and company: the latest snapshot, **replaced in place every night** for the running month (`snapshot_leaderboards.ts`, `0042`, `0081`), so even the snapshot boards keep no «yesterday» | **the rank (and, for a company, the bar) the member last saw, per board and period** |

Nothing records what a member has seen. `DEC-186` §7 and `DEC-195` §2.6 confirmed; I re-measured and found nothing else
to lean on.

### 1.2 · What I rule out, and why

- **Browser storage as the record.** It replays on every new phone and after every cleared history, and
  `REQ-UIX-047` says outright: «the same rows seen again, **on the same device or another**, play nothing». It stays
  what the lead's `moment.ts` already makes it — **the second line** (the `sessionStorage` claim that stops a remount
  or a back navigation in one tab from replaying), never the record.
- **Marking «seen» while the page renders.** A GET that writes is a render with a side effect: a render that errors
  after the write loses the moment, two tabs race, and a Server Component is the wrong place for a mutation. (Link
  prefetch would not trigger it — both routes are dynamic and `me/` and `leaderboards/` carry a `loading.tsx`, so a
  prefetch stops at the boundary, `next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:83-86` — but
  that is luck, not design.)
- **Columns on `members` or `points_balances`.** `points_balances` is written only by the rollup trigger and the
  evaluators (`0027:385`); giving a member write access to it for a UI cursor would widen a table that must stay
  recomputable. `members` is not the place for a per-board cursor either.
- **`notifications` as the record.** Nothing sends `MSG-level_reached`, and a notification is a message, not a cursor.

### 1.3 · ★ What I need: one table, the lead's, from `0162`

One row per member — **a cursor, not a log**. Suggested name `member_seen_marks` (the lead names it):

| Column | Type | Note |
|---|---|---|
| `member_id` | `uuid` **PK**, `references members(id) on delete cascade` | one row per member |
| `org_id` | `uuid not null references orgs(id) on delete cascade` | invariant 5 |
| `points_entry_id` | `uuid` null | `points_balances.last_entry_id` when last seen. **No FK** — an opaque marker; ledger rows only disappear with their org, which takes this row too |
| `points_total` | `int` null | the balance last seen — the count-up's `from` |
| `level_id` | `uuid` null, `references levels(id) on delete set null` | the level last seen — the flip's front face |
| `all_time_rank` | `int` null, `check (all_time_rank > 0)` | |
| `monthly_period` | `date` null | the monthly snapshot's `period_start` the rank below belongs to |
| `monthly_rank` | `int` null, `check (> 0)` | |
| `company_period` | `date` null | the company snapshot's `period_start` |
| `company_id` | `uuid` null, `references companies(id) on delete set null` | the member's company when last seen — a move to another company is not a «rise» |
| `company_rank` | `int` null, `check (> 0)` | |
| `company_fraction` | `numeric` null, `check (company_fraction between 0 and 1)` | own company's bar (value ÷ leader) last seen — the `scaleX` `from` |

★ **Deliberately no `created_at`, no `updated_at`, no `seen_at`.** A timestamp would turn a cursor into a record of
when a member opened their points page — a behavioural log nobody asked for. The survey's rule (`DEC-160` §3) is the
precedent. The only times in the row are none.

**RLS and grants** (the lead's migration, its `03` §8.2 rows and its RLS case):
- `enable row level security`; `revoke all … from anon, authenticated, service_role`.
- `select`, `insert`, `update` to `authenticated`, each policy `member_id = public.auth_member_id() and org_id =
  public.auth_org_id()` (`using` and `with check`). **No `delete` policy or grant** — a member has no reason to erase
  their cursor, and the cascade covers the member's deletion. No super-admin disjunct (invariant 8).
- `service_role` gets nothing: the worker never reads or writes it.
- The generated isolation sweep covers it the day it lands (`org_id`, RLS, a full policy set).

### 1.4 · The functions over it — mine, in `supabase/proposed/scoring/`, **after sync 1**

Both `security invoker`, so RLS is the boundary and neither needs a definer:

- `public.mark_points_seen(p_entry uuid, p_total int, p_level uuid) returns void` — upserts the caller's row
  (`member_id = auth_member_id()`, `org_id = auth_org_id()`), refuses a `p_level` from another org (`22023`), before
  any write, so there is nothing to roll back (`DEC-043`).
- `public.mark_board_seen(p_board text, p_period date, p_rank int, p_company uuid, p_fraction numeric) returns void`
  — `p_board in ('all_time', 'monthly', 'company')`, touches only that board's columns.
- `revoke execute … from public, anon`; `grant execute … to authenticated`.
- **Last write wins.** Two tabs acknowledging out of order can at worst replay one moment once; I write that down
  rather than add a sequence column.
- Tests: `tests/rls/scoring-seen*.test.ts` — own row read/insert/update; another member's row invisible and
  unwritable; a row claiming another org refused; `anon` nothing; no delete; a foreign level refused; each board
  touches only its columns.

### 1.5 · When a mark is written: when the moment is DONE, from the client that showed it

1. The page reads the member's row with the data (DAL, own row under RLS) and computes, **on the server**, whether
   each moment has an occurrence (§1.6). It writes nothing.
2. The client plays the moment, keyed by the lead's `useMoment(kind, occurrenceId)`.
3. **On `done()`** — or at once when there is nothing to play, or under reduced motion — the client calls a bound
   `"use server"` action (`app/me/points/actions.ts`, `app/leaderboards/actions.ts`, Zod first) that calls the DAL,
   which calls the function above with **exactly the values that were shown** (so a row written between the render
   and the acknowledgement is still unseen next time).
4. The first visit after the table lands has **no row**, so **nothing plays**: it writes the baseline. No member is
   greeted by a replay of their whole history on merge day.
5. ★ A Server Action that refreshes the Supabase cookie re-renders the page (`07-mutating-data.md:510-512`), and the
   re-render would carry no occurrence. So each moment component **latches** the occurrence it claimed for the life
   of its mount; a later prop change does not un-draw the delta mid-visit. Acknowledging at `done()`, not at the
   start, means that re-render can only ever arrive after the moment.
6. A failed acknowledgement animates nothing and says nothing: the next visit on another device plays it again,
   and this tab's `sessionStorage` claim keeps this tab silent.

### 1.6 · What each moment reads — the occurrence, decided on the server

| Moment | Plays when | Occurrence id (`useMoment`) |
|---|---|---|
| 3 | a row exists **and** `points_entry_id ≠ last_entry_id` **and** `total_points > points_total` **and** at least one unseen row is a completion-pass row (§9 D-25 asks whether any net gain should play) | `completion:<last_entry_id>` |
| 4 | a row exists **and** `level_id` is set **and** `current_level_id ≠ level_id` **and** the new level's `sort_order` is higher | `level:<current_level_id>` |
| 5 · members | a row exists **and** the seen rank is for this board (and this `period_start`, monthly) **and** `rank < seen rank` | `rank:<board>:<period>:<seen>-<rank>` |
| 5 · companies | same period, same company, and the own company's `rank` rose **or** its fraction grew | `rank:company:<period>:<company>:<seen>-<rank>` |

«Unseen rows» are the member's ledger rows with `occurred_at` after the seen entry's (`occurred_at` is
`clock_timestamp()`, distinct inside a transaction, `DEC-046` — never `created_at`). **A net decrease, a fall, a tie,
a new period, a changed company: no occurrence, the static state, and the mark updated.** The history explains a
decrease; the head does not stage it.

### 1.7 · `main`, retention, anonymisation, the export

- **`main`'s app and worker on this schema do nothing different.** Nothing on `main` names the table or the two
  functions; no trigger fires on it; nothing enqueues. Additive, one new table.
- **Retention:** none of its own. It lives and dies with the member (cascade) and the org (cascade). No
  `retention_periods` row.
- **Anonymisation** (`platform`'s, held by the lead): `anonymise_members` should **delete** the row. It holds no
  personal data beyond the link, but a cursor for an anonymised member has no use.
- **Data export:** I recommend it is **left out**, and the lead rules. Every value in it (the balance, the level, the
  ranks) is a copy of data the export already carries from its source tables, and it holds no timestamp and no
  content. If the lead reads PDPL as «every row keyed to the member», it is one more small JSON object.

## 2 · Measured: what the head and the boards read, and what the DAL adds (add-only)

### 2.1 · `SCR-022`'s head

`getPointsHistory()` (`points.ts:94-209`) returns `totalPoints` from `points_balances` and the ledger rows, filtered;
`getPointsStripData()` (`:215-221`) returns `totalPoints` alone. **Neither reads the level, the streak, the next
threshold, the perks or the seen row.** Where the head's parts come from today:

- **Streak:** `streak_awards` (org-readable, `0027:273`) — **monthly** periods written by the nightly
  `evaluate_streaks()` (`0150`), counted by `currentStreak()` (`recognition.ts:25-34`, exported). The default org's
  rule is `monthly_3`, **enabled** (`0027:573-575`). An org with no enabled rule draws no streak at all.
- **Level:** `points_balances.current_level_id` → `levels(name, threshold_points, sort_order)`; the next level is the
  lowest threshold above the current one. `null` until the first nightly run → «no level yet» and the bar toward the
  lowest threshold.
- **Unlocks:** enabled `perks` with `required_level_id` = that level (`0027:283-307`, org-readable), named through
  `recognition.json`'s perk labels (read, not written). In a default org none are enabled → `noUnlocksLabel`
  (`DEC-186` §7, question 1 of wave 15 still stands).

**New, add-only in `points.ts`:** `getPointsHead(locale): Promise<PointsHead>` — balance and `last_entry_id`, the
current and next level (`tier`, name, threshold, unlocks), `streakMonths` and whether any streak rule is enabled, and
the three occurrences of §1.6 already decided (`completion: {from, to, delta} | null`, `level: {held: LevelFace,
reached: LevelFace} | null`) plus the values to acknowledge. And `markPointsSeen(locale, input)`. `getPointsHistory()`
and `getPointsStripData()` are untouched; the page calls both (one duplicate balance read, accepted).

### 2.2 · The boards

`member-board.tsx` draws a `<ul>` of its own `Row`: the rank (sr-only «المرتبة N»), the name as a profile link, a
`Badge` «أنت», the points; the viewer's row below the top 20 under «ترتيبك» (`REQ-LDR-001`); **no avatar**
(`:14-15`). `company-board.tsx` draws each company with a `<dl>` of both metrics, the ranked one first with a `Badge`
«الترتيب حسبه», signed values in `<bdi dir="ltr">`, and «as of» under the list; **no bar, no ring, no colour**.

What replaces what: each member row becomes `rank-row` (rank, initials in the team ring, name over company, the rise
arrow when `movement` says so, points, «أنت» in words, the profile `href` kept); each company row becomes `race-bar`
(`metricLabel` = «الترتيب حسبه: {metric}», `secondary` = the other metric, `fraction` = value ÷ the leader's,
`ownLabel` = «فريقك»). The «ترتيبك» section, the empty state and the «as of» line stay.

**New, add-only in `leaderboards.ts`:** `company` and `teamColor` on `MemberBoardRow` (through `members.company_id` →
`companies(name, team_color)`), `teamColor` and `isOwn` on `CompanyBoardRow` — new fields on the existing DTOs, no
field changed; `getBoardMoments(locale, board)` returning the occurrence and the values to acknowledge;
`markBoardSeen(locale, input)`. `REQ-LDR-008` stays the database's: the rows are what `all_time_leaderboard()` and
`boards_read` return.

## 3 · The surfaces and the scope (contract 3)

- **`SCR-022`:** `<PlayScope>` wraps **the head alone**, a sibling of `PageHeader` and of the filter form, as a direct
  child of the page's content (`me/layout.tsx:46`, `div.mt-6`, untransformed; `#main` is `mx-auto max-w-6xl px-4
  py-8`, untransformed). The flip's `perspective` and every moving element sit **inside** it. The history, the
  catalogue and the filters stay outside and do not move.
- **`SCR-027` / `SCR-028`:** `<PlayScope>` wraps **each board's list** inside its `<section>`, below its
  `SectionHeader`. It cannot be a direct child of the screen's content, because the boards live inside `ui/tabs`'
  panel (`tabs.tsx:156`, `mt-4`, untransformed, unclipped — the `overflow-x-auto` is on the tab *list*, `:130`).
  **Question 5.** The company breakdown (`sessions'`) stays outside.
- **Dark ground** on all three, as `DEC-195` §1.3(2) says; a dark head on the light points page goes to the owner at
  the 390 px review with its capture.

## 4 · The moments

All three are client components in new files — `src/components/scoring/moment-points-head.tsx` (moments 3 and 4) and
`moment-rank.tsx` (moment 5) — that take their strings and their occurrence as props, render the primitives, and move
the primitives' DOM **by `element.animate()`** through refs. **The primitives stay states from props**: their
source scans (`rank-row.test.tsx:213`, `race-bar.test.tsx:185`, `level-card.test.tsx:154`) are unchanged, because
the motion is not in them. The Server Components (`page.tsx`, `member-board.tsx`, `company-board.tsx`) hand each
moment a bound action, never a closure (`DEC-159`).

### Moment 3 — انتهت الجلسة (head of `SCR-022`)
1. `useCountUp({from: points_total, to: total, duration: …, play})` writes the balance into its `<strong>`; the delta
   «+N» fades in beside it (opacity + `translateY`, `base`).
2. Then the flame's **outer** wrapper grows from `scale(0.78)` to `1` (`slow`) — the rest size is the natural size,
   so the static state needs no scale class — and its **inner** wrapper carries the flicker loop class.
3. Then the level bar's fill (`ProgressBar`'s `[data-slot=fill]`) animates `scaleX(old) → scaleX(new)` (`party`);
   `cancel()` on finish leaves the inline `scaleX(new)` the server rendered.
4. If moment 4 has an occurrence, it follows; otherwise `done()` → acknowledge.

### Moment 4 — ترقية المستوى (same head, after 3)
`level-card` in its **flip** layout (a request, §10): both faces stacked in one grid cell, `preserve-3d`, both
`backface-visibility: hidden`, the reached face `rotateY(180deg)`; `shown="reached"` rotates the inner card 180° **as a
static class**. The moment animates the inner `rotateY(0) → rotateY(180deg)` (`party`) and cancels on finish; the shine
— a decorative layer on the reached face clipped by `clip-path: inset(0 round …)`, **never `overflow-hidden`**, which
the face's text must not sit in — sweeps once from the inline start, starting at 60 % of the flip. Keyed by
`levels.sort_order`, never a name. **Moment 4 also plays alone**, on the first visit after the nightly run, because
that is when `current_level_id` changes (§9 D-29).

### Moment 5 — تغيّر الترتيب (`SCR-027`, `SCR-028`)
The server renders **the new order** — the static state. With an occurrence, before first paint
(`useLayoutEffect`), the moment measures each row's height, and animates by FLIP **without reordering the DOM**, since
it is already final: the member's row from `translateY(+k·h)` to `0` and each of the `k` rows it passed from
`translateY(−h)` to `0` (`slow`); then the arrow (`rank-row`'s `[data-slot=rise]`, one attribute added to my own file)
pulses once. `k = seen − rank`, and the FLIP runs only when both the old and new positions are inside the rows drawn;
otherwise the arrow alone. The design's «DOM reorder with transitions off for one frame» is the prototype's way to the
same frames; with the DOM already final it has nothing to do. **A passed row moves only as the member's row displaces
it, and carries nothing of its own.** On the company board the own company's fill animates `scaleX(seen) →
scaleX(now)` from the inline start (`party`), after a FLIP if its rank rose. **WAAPI writes no `style` attribute**, so
`rank-row.test.tsx:118-128`'s «no inline style but `--team`» holds during and after.

## 5 · Sync-1 Q2 — the static states, in words

| Moment | Static state (reduced motion, reload, another phone after the mark) | Where |
|---|---|---|
| 3 | The new balance in the display face; **on first sight only**, the delta «+N» beside it with its words for a screen reader («N نقطة منذ زيارتك الأخيرة»); the flame at its full size, still (no flicker class under reduced motion), with «N أشهر متتالية»; the level bar at its value, labelled «التقدّم نحو {level}» and «{points} من {threshold}». With no streak rule enabled, no flame and no line. With no streak, no flame and «لا سلسلة جارية». | head of `SCR-022`, top |
| 4 | The level card's reached face, whole, no shine; the held face still in the document for a screen reader (`level-card`'s guarantee). The face names its unlocks or says `noUnlocksLabel`. | head, beneath the bar |
| 5 · members | The new order; the member's row with the rise arrow and its words («تقدّمت N مراكز»); the passed rows exactly as any row. | each board |
| 5 · companies | The new order; the own company's bar at its new length, «فريقك» in words. | company board |

On a **later** visit (the mark written) the head shows the same thing without the delta, and the boards without the
arrow — that is «since last view».

## 6 · Sync-1 Q3 — the keyframes and tokens I need (contract 2, the lead's to land)

**Keyframes in `globals.css`, three:**

| Name | Properties | Use | Reduced motion |
|---|---|---|---|
| `play-flicker` | `transform` only: `scale(1)` → `scale(1.04, .98) skewX(-2deg)` → `scale(.98, 1.04) skewX(2deg)` → `scale(1.03, .99) skewX(-1deg)` → `scale(1)`, `ease-in-out`, infinite | a class on the flame's **inner** wrapper; the outer holds the size, so one keyframe serves both sizes (the prototype needed two, `motion-story.html:199-200`) | `animation: none` |
| `play-shine` | `transform: translateX(…)` + `opacity` 0 → 1 → 0; the bar's `rotate(20deg)` in every frame | one sweep on the reached face; direction by a variable (`--play-dir: 1` / `-1` under `[dir=rtl]`) so it runs from the inline start | never applied |
| `play-rise-pulse` | `opacity` 0 → 1 and `transform: translateY(6px) scale(.8)` → `none` — **no overshoot** (§9 D-27) | the rise arrow, once | never applied |

**One-shots by `element.animate()`, with durations from `readDuration()`, no keyframe:** the count-up (rAF, the lead's),
the delta's fade (`base`), the flame's growth (`slow`), the bars' `scaleX` (`party`), the FLIP (`slow`), the flip's
`rotateY` (`party`). If the lead prefers every one-shot as a named keyframe, these become `play-grow`, `play-fill`,
`play-flip` and the FLIP stays WAAPI (its distance is measured).

**Tokens:** the design's 700 ms (count-up, shine), 600 ms (arrow) and 2 s (flicker loop) have **no token**
(`--duration-*` is 120 / 220 / 420 / 900, `globals.css:324-327`). I propose count-up `party`, shine `slow`, arrow
`slow`, and **a new `--duration-loop: 2s`** for the flicker, collapsed like the others under reduced motion. The
lead's call (question 3).

## 7 · The mechanism (contract 1) — what I use, and one thing I need

I plan against what is on disk (`src/lib/ui/`): `useMoment(kind, occurrenceId)` with kinds `completion`, `level`,
`rank`; `useCountUp({from, to, duration, play, onDone})`; `readDuration()`, `readEasing("play")`;
`useReducedMotion()`. Enough, with one exception:

★ **A hard load paints the static state before hydration.** `moment.ts:83-85` decides in `useLayoutEffect` «before
the first paint», which is true for a client navigation (the tab bar, a link) and **false for a reload or a typed
URL**: the server's HTML — the new balance, the new order, the reached face — is on screen before React hydrates, and
then the moment would jump back to the old frame and play forward. For moments 1 and 2 that cannot happen (a reload
has no action result); for 3 – 5 it is the normal case on a first visit from a notification link. **Request:** a
`useMoment` rule that a moment whose surface was **painted by the server** before hydration does not play (it is
claimed and acknowledged, statically). A module flag set by the first hydration's effect is enough. The lead's call;
the alternative is a visible jump.

## 8 · Sync-1 Q4 — every existing assertion that moves

**Expected to pass unchanged** (verified when built; any that fails gets its ledger line then):

- `tests/e2e/points.spec.ts:159` — `locator("strong", {hasText: "25"})`: the balance stays **the page's only
  `<strong>`** (the head renders it there; the delta, the bar's value and the card use no `<strong>`). The comment
  above it names the `Stat`, which goes; the assertion does not change. `:170`, `:247` («لا نقاط بعد» is the history's,
  and the head never says it), `:276-297` (scoped to `#history`).
- `tests/e2e/wave9-scoring-missed-day.spec.ts:216` — `strong` «20»: same rule. Its later visits may now play a
  count-up (a row exists after the first visit); Playwright's retrying assertion waits for the final figure.
- `tests/e2e/leaderboards.spec.ts:114-116` — the leader's name, «65», «أنت» (`rank-row`'s visible `selfLabel`, once).
- `tests/e2e/leaderboards.spec.ts:130-132` and `tests/e2e/wave7-sessions-leaderboards.spec.ts:138-141` — «مجموع
  النقاط», «نقاط لكل عضو نشط», and «الترتيب حسبه» once per row: `metricLabel` = «الترتيب حسبه: {metric}» and
  `secondary.label` carry all three, each once.
- `tests/e2e/wave7-sessions-leaderboards.spec.ts:120-123` — `li a` in rank order (the profile `href` is kept), «أنت»,
  and **no `img`**: the avatar draws initials in the ring, never an image.

**Will change — each a ledger line in the commit that moves it. ★ The file is not mine:**
`tests/components/leaderboards/boards.test.tsx` (last `2c6f6322`, `sessions'` since wave 7) is not in my edit list,
and the transfer named only the e2e specs. Request 6.

| Line | Assertion | Why it moves |
|---|---|---|
| `boards.test.tsx:62` | `querySelector("img, [data-slot=avatar]")` is `null` — «draws no avatar (DEC-099)» | `rank-row` draws the avatar's **initials in the team ring** by `DEC-183` §3 and `REQ-UIX-048` («initials in a team ring, never a photograph»). The `img` half stays true and stays asserted; the `[data-slot=avatar]` half is reversed by decision |
| `boards.test.tsx:78-86` | each company row's `term` / `definition` roles, ranked first and marked | `race-bar` has no `<dl>`. The same facts — the ranked metric first and marked «الترتيب حسبه», the other second and unmarked, the values «35» and «420» — are asserted on `metricLabel`, `secondary` and the value |
| `boards.test.tsx:89-93` | the same under `total_points` | same |
| `boards.test.tsx:100-107` | both signed values through `definition` → `bdi[dir=ltr]` | the two `bdi[dir=ltr]` exist in `race-bar` (value and secondary); only the path to them changes |

`boards.test.tsx:41-56, 61, 65-68` and the breakdown's `:111-125` should pass unchanged. `tests/components/scoring/**`
and `tests/components/ui/{rank-row,race-bar}.test.tsx` do not change; `level-card.test.tsx` gains cases for the flip
layout in the same file (new behaviour, new `describe`), its existing cases untouched.

**Lead-held specs that visit these routes** — `a11y.spec.ts:113`, `budgets.spec.ts:178` (the boards gain a small
client component), `wave9-three-day-workshop.spec.ts:501-517` (a `li`/`strong`-scoped read, unaffected) — may
capture a count-up mid-flight on a second visit; a capture wants `reducedMotion: "reduce"` or a settled head.

## 9 · Sync-1 Q5 — new disagreements (numbered after `DEC-195` §6's 24; I pick no side, I say what I plan)

- **D-25 · Moment 3's trigger.** `REQ-UIX-047` and `03-motion.md` §3 «Trigger»: «the ledger rows the completion pass
  wrote». A balance also rises for a comment, a photo, a rating, a streak or a manual adjustment, which are not
  completion rows. **Plan:** play only when an unseen row is a completion-pass row (the set of `ledger_source` values
  named in one place in `getPointsHead()`: `check_in`, `proposal_accepted`, `session_delivered`, `attendee_bonus`,
  `rating_bonus` — the lead confirms it), counting the whole balance from seen to now. The alternative is any net
  gain.
- **D-26 · «The bar full».** `REQ-UIX-047`'s acceptance and `03-motion.md` §3's static state say the level bar is
  **full**. Unless a threshold was crossed, full is false — a member at 25 of 100 is not at the next level. The
  prototype shows «730 من 700» (`motion-story.html:618`), which is a bar measuring the level being reached. **Plan:**
  the bar is always the truth — progress toward the next level; with a crossing it fills to the end, the card turns
  over, and the bar then shows the new level's progress, in place. **The REQ's line is `docs/plan/`'s, so it wins
  until amended** — this is a request to amend it, not a choice made.
- **D-27 · The arrow's pulse overshoots.** `motion-story.html:232`: `scale(.8) → scale(1.2) → none` and
  `translateY(6px) → -2px → 0`. `DEC-186` §4 / `DEC-195` §6.20 hold every pop beyond a sticker's `1.08`. **Plan:**
  `play-rise-pulse` rises to rest with no overshoot; the owner is shown both with the coin.
- **D-28 · Durations with no token** — 700 ms, 600 ms and 2 s (`03-motion.md` §3, §5; `motion-story.html:199, 215,
  231`). §6 proposes a mapping and one new token.
- **D-29 · Moment 4 does not follow moment 3.** `03-motion.md` §4: «same surface, after 3 when a threshold is
  crossed». `current_level_id` is written only by the **nightly** `evaluate_levels_perks()` (`0041:136`; the
  «on balance change» enqueue its task mentions, `evaluate_levels_perks.ts:4-6`, was never wired). So on the day a
  session pays, the bar can reach the end with no flip, and the flip plays **alone** on the first visit after the
  night. Wiring an evaluation on balance change is the award path, frozen this wave. Written down; not changed.
- **D-30 · The streak counts months, not sessions.** The prototype's flame reads «سلسلة ×7 — سبع جلسات متتالية»
  (`motion-story.html:615`); the tree's streak is a monthly award (`streak_rules.monthly_3`, `0027:573`), and the
  streak rule itself is `DEC-NEXT-9`, not this wave. The head says months.
- **D-31 · Moment 5's «or a live update lands».** `03-motion.md` §5 «Trigger». The boards have no Realtime; a live
  rank change is not built.
- **D-32 · «Swap two rows».** `REQ-UIX-048` and `03-motion.md` §5 (`translateY(∓64px)`): a rise can pass several
  rows, and rows are not 64 px. The FLIP moves the member's row by `k` measured rows and each passed row by one.
- **D-33 · `16` §6.8.3 «no avatars on a board»** (quoted at `member-board.tsx:14-15`) against `DEC-183` §3 and
  `REQ-UIX-048`'s «initials in a team ring». `DEC-183` is later and says initials; I follow it, and the comment goes
  with the old row. Listed because the old text is still in `16`.

## 10 · Tests, captures, files

**Re-render tests, one per moment** (★★ mount → play → unmount → mount with the same occurrence → silence: no
`animate()` call, no count, the static state):
- `tests/components/scoring/moment-points-head.test.tsx` — moment 3; and a **decrease** plays nothing and draws no
  delta; no occurrence plays nothing.
- `tests/components/scoring/moment-level.test.tsx` — moment 4, alone and after 3.
- `tests/components/scoring/moment-rank.test.tsx` — moment 5 on the member board and on the company board; ★★ **a
  fall plays nothing, and the fallen and passed rows carry no class, no icon and no `style` at any point** — asserted
  before, during (a pending fake animation) and after.
Each file also asserts: under reduced motion (`matchMedia` mocked) the static state is **complete** — every element
of §5's row present — and `animate()` is never called; after `finish`, **no element has `will-change`** and no
animation is left running; the acknowledgement action is called once, with the shown values, after `done()`. jsdom
has no `Element.prototype.animate`, so a fake with a controllable `finished` promise is installed per test (the
lead's `confetti` tests may already have one to reuse).

**Unit:** `tests/unit/scoring-seen.test.ts` — §1.6's occurrence rules as a pure function (every «no occurrence»
branch). **RLS:** `tests/rls/scoring-seen.test.ts` (§1.4), with `applyProposed()`, only once the table exists.

**E2E:** `tests/e2e/wave16-scoring-moments.spec.ts` — seeds a mark row, opens `/ar/app/me/points` and each board
through a **client navigation**, sees the moment, reloads (silence), goes back (silence), and ★ **opens the same page
in a second browser context — another phone — after the first acknowledged: silence**. That last case is the proof
that the record works. Captures: `.qa-shots/rtl/wave16-scoring-{completion,level,rank-members,rank-companies}-{animated,static}.png`,
390 × 844, `static` under `reducedMotion: "reduce"`, honouring `E2E_SHOTS_DIR`.

**Files I will write** (all in my list): `me/points/page.tsx`, new `me/points/actions.ts`; `leaderboards/page.tsx`,
new `leaderboards/actions.ts`; `components/scoring/{member-board,company-board}.tsx`, new
`components/scoring/{points-head,moment-points-head,moment-rank}.tsx`; `ui/level-card.tsx` (the flip layout),
`ui/rank-row.tsx` (`data-slot="rise"` only); `lib/dal/{points,leaderboards}.ts` (add-only);
`messages/{ar,en}/{scoring,leaderboards}.json` — Arabic first; the streak count, the delta and the rise in all six
plural forms; every value in `<bdi>`; Western digits; `supabase/proposed/scoring/<n>_seen_marks.sql` after sync 1.

## 11 · Requests and questions for the lead

1. ★★ **Contract 5 — the table** of §1.3, from `0162`, with its RLS case and `02`'s text. Name it; I write the two
   functions and their RLS tests against it after sync 1.
2. ★ **`ui/index.ts`:** `LevelCardProps.flip?: boolean` — «both faces stacked in 3D, `shown` picks the one facing
   the viewer, a decorative shine layer on the reached face». Types only; the default stays today's layout, so every
   existing `level-card` case holds. `RankRowProps` and `RaceBarProps` do not change.
3. **Tokens (D-28):** count-up `party`, shine `slow`, arrow `slow`, and a new `--duration-loop: 2s`?
4. **Keyframes (§6):** `play-flicker`, `play-shine`, `play-rise-pulse` — names, properties and reduced-motion rule as
   in the table; and whether the other one-shots may stay WAAPI.
5. **The scope on the boards (§3):** inside each `<section>`, around the list, below the `SectionHeader` — acceptable
   as «the surface», since the tabs panel is the screen's content here?
6. ★ **`tests/components/leaderboards/boards.test.tsx`** — transfer it to me for the wave (evidence, four ledger
   lines), or edit it yourself under those lines.
7. ★ **`useMoment` and the server's paint (§7)** — a moment painted by SSR before hydration does not play?
8. **D-25** (which rows trigger moment 3) and **D-26** (the bar «full» in `REQ-UIX-047`) — rulings, and the REQ's text
   amended if D-26 goes my way.
9. **Anonymisation and export (§1.7)** — `anonymise_members` deletes the row; the export leaves it out?
10. **Wave 15's question 1 stands** — a level that unlocks nothing says `noUnlocksLabel`, in a default org every level.
11. **Budgets:** `/app/leaderboards` and `/app/me/points` each gain one small client component; `budgets.spec.ts:178`
    is yours.

**For other tracks:** none. `checkin` keeps contract 6 as it is (`getSessionAwardState()` unchanged; moment 3 does not
touch it). `sessions'` `company-points-breakdown.tsx` is not touched. `content`'s `avatar` and `progress-bar` are used
as they are — the fill is moved by WAAPI on `[data-slot=fill]`, which writes nothing into the file or its inline
style.
