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

⚠ **`05` §2.1 says the epoch segment is bumped «only by a `DECISIONS.md`-logged re-award».**
This reads it as covering a deliberate, audited re-establishment of attendance — an admin
retracted a check-in and the member checked in again — rather than only a bulk recompute.
**Flagged for the lead rather than assumed**: if the ruling is that the segment must stay
reserved for `05` §4.3's procedure, the alternative is a separate generation segment in the
key, and the same test proves it.

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
| `tests/components/scoring/points-history-list.test.tsx` | `cd582b0` | the component now reads `sessions.days` for contract 7's one day-label formatter, so the test's `getTranslations` mock merges that namespace; six cases added for the notice | **no** — not one existing assertion touched, and a case asserts a one-day history renders no notice |

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

## Still open when this was written

- **The e2e and the 390 px RTL captures** wait on the lead promoting `0001`–`0004`: the screen
  reads `missed_attendance_days()`, which does not exist as a migration yet. `src/lib/dal/points.ts`
  tolerates PostgREST's `PGRST202` for exactly that window and **that branch is deleted at
  promotion**.
- **Row L4's written request** — pointing `fan_out_certificates()`, `issue_certificate()` and
  `listEligibleRecipients()` at `session_attendance_complete()` — is due after contract 6 is
  promoted and green (`DEC-151` answer 7). Contract 6 is green; the request goes the moment it
  is promoted.
- **Recognition edits still write no audit or history row.** Wave 10, with `console`
  (`DEC-151` answer 9).
