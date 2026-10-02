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

### Addendum — contract 1 as landed (`cfb3d9a5`)

The API is the one §7 planned against, unchanged: `useMoment(kind, id | null)` with `completion`, `level` and `rank`;
`useCountUp({from, to, duration, play, onDone})`; `readDuration()` and `readEasing("play")`. **Token choices, fixed:**
the count-up is **`party`** (900 ms, the nearest to the design's 700 that keeps the sequence unhurried). The FLIP, the
flame's growth, the shine and the arrow are `slow`, the delta's fade is `base`, and the bars and the flip are
`party`. The flicker loop still needs `--duration-loop` (request 3). The re-render tests import the lead's
`tests/components/lib-ui/motion-env.ts` (its `animate` recorder, whose animations finish when told), and never
copy it. Request 7 (a moment the server painted before hydration) is still open: `moment.ts` at `cfb3d9a5` decides
in `useLayoutEffect`, which runs after the server's HTML is on screen on a reload.

---

# Wave 16 — built (after sync 1, `DEC-197`)

| Row | Commit | What |
|---|---|---|
| Contract 5's writers | `e4e639f9` | `supabase/proposed/scoring/0001_seen_marks_functions.sql` — `mark_points_seen()`, `mark_board_seen()`, invoker, checked before the one write; `tests/rls/scoring-seen.test.ts`, 8 cases through `applyProposed()`. **For the lead to promote.** |
| Moments 3 – 5 | `48859649` | the head of `SCR-022` (`points-head.tsx` + `moment-points-head.tsx`), the boards on `rank-row` / `race-bar` inside the scope (`member-board.tsx`, `company-board.tsx` + `moment-rank.tsx`), `use-seen-moment.ts`, `race-fractions.ts`, the DAL (add-only: `getPointsHead`, `markPointsSeen`, `getBoardMoment`, `markBoardSeen`, optional new DTO fields), the two bound actions, `level-card`'s `flip` layout, `rank-row`'s `data-slot="rise"`, the messages in Arabic first, the ledger lines |
| E2E | `6dd82fed` | `tests/e2e/wave16-scoring-moments.spec.ts`, with the captures |

**How «seen» works, as built.** The server reads `member_seen_marks` and decides each occurrence (`decideCompletion`,
`decideLevelUp`, `decideBoardMoment`, pure, 19 unit cases). The client plays through `useMoment`, and
`useSeenMoment` brackets its claim to know one of three answers: **plays** (tell the server at `done()`), **seen**
(reduced motion, a remount, or nothing to play: tell it now), **hydrating** (a server paint: tell it nothing, so the
moment plays at the next in-app arrival, `DEC-197` §5). The acknowledgement is a Server Action **bound on the server**
with the locale and the mark the page rendered; the client sends nothing of its own. The head latches its occurrence,
its delta and its turned card for the visit.

**Tests:** `moment-points-head.test.tsx` 13, `moment-rank.test.tsx` 11, `level-card.test.tsx` +4, `scoring-seen.test.ts`
19, `boards.test.tsx` 8 (three cases moved, ledger lines in `STATUS.md`). Each moment has its ★★ mount → play →
unmount → mount → silence case, its complete reduced-motion static state, a case where nothing is an occurrence
(a decrease, a non-completion gain, a fall), a transform/opacity-and-tokens-only case, and no `will-change`. A
server-painted head is proven silent and unrecorded by hydrating real server HTML.

**Gates at `6dd82fed`:** tsc clean for my files (the tree's two tsc errors are `sessions'` in-progress
`moment-reserve.tsx` and a missing `tests/components/sessions/__dbg`) · eslint 0 on my files (the tree's 3 errors are
not in them) · `ui-lint` strict clean · `npm test` 3458 passed, 2 failed — `designer/inspector-align` and
`sessions/schedule-days`, both green when run alone (timing under a full run), neither mine · RLS: my file 8/8.

**Not done, and why:**
- **The e2e spec has not run.** It needs a production build (the lead's) and my two functions promoted (it writes
  through them). The captures come from that run: `.qa-shots/rtl/wave16-scoring-{completion,level,rank-members,rank-companies}-{animated,static}.png`.
- **Moment 4's `animated` capture** is the card at rest after the turn; the turn itself is proven by the jsdom case
  and the animation counter, not by a still.
- **D-29 stands:** a level changes only in the nightly run, so on the day a session pays the bar can reach its end
  with no new level; the card turns on the first visit after the night.

## The gate at `a9bd97df` and the lead's 390 px findings — fixed

| Finding | Cause | Fix |
|---|---|---|
| desktop: three animations on a hard load | `/app` streams behind `loading.tsx` (`DEC-145`); a boundary React re-renders afresh is a client mount the hydration guard cannot see, over a truth already painted | each surface writes `data-moment-keys`; a first render that finds a VISIBLE element with its key leaves the occurrence unseen and tells nothing (`use-seen-moment.ts`), two jsdom cases |
| phone: moment 5 did not play on the tab | the spec clicked before React owned the tab — a page load, correctly silent | `navigateInApp()` waits for React, proves the window survived; `settled()` before every silence assertion |
| the delta read «120+» | the figure was not isolated left to right | `<bdi dir="ltr">`; `points-head.test.tsx` asserts «+120» |
| ★★ the bar said 10 % beside «120 من 300» | the fill measured within the level's band, the line from zero | **the bar is now the balance out of the next threshold — the line's own numbers** (`levelProgress`); asserted in jsdom and in the spec (`scaleX(0.4)`). D-26 still holds: the truth, full only at the top or while a level is being reached |
| the level shots were the completion frame twice | the card sat inside the first viewport | the level shots are the turned card itself (`captureCard`), asserting the turn and no shine |
| cold phone, final gate at `751618c5`: the head replayed on a hard load, first run only | on a slow hydration React can discard the streamed boundary and render it afresh without a moment render ever seeing the server's DOM — no DOM probe is reliable | ★ **the server says it**: `isDocumentLoad()` (`components/scoring/document-load.ts`) reads Fetch Metadata's `Sec-Fetch-Dest` — `document` or absent is the document, the router's `fetch()` sends `empty`. (The first attempt, `1d0688e3`, read Next's `rsc` header, which Next strips before a page's `headers()`: nothing ever played — the lead's gate found it.) A moment rendered for the document never plays on that page load, stays unclaimed, and tells the server nothing; the DOM probe stays as a second line. jsdom: a client mount with `documentLoad` in an empty document stays static, unclaimed, untold; the next in-app mount plays |
| `src/components/ui/tabs.tsx`'s double mount (moment 5) | every panel rendered the same children, and Radix keeps the outgoing panel for a commit | the lead's `751618c5` |

---

# Wave 18 — plan (PR A, `wave-18a/the-frame`, planning only — nothing is built)

`REQ-UIX-055`, `REQ-UIX-057` · `STORY-UIX-041`, `STORY-UIX-044` · `DEC-205`, `DEC-206` §4.47 – §4.53 and §5 · contracts
1, 2, 4, 6, 7. Read for this plan: `Home.dc.html` and `HomeDesktop.dc.html` (source), `M10a.md` §0, §5, §10, the three DAL
modules, `points-head.tsx`, `moment-points-head.tsx`, `moment-rank.tsx`, `use-seen-moment.ts`, `document-load.ts`,
`src/lib/ui/**`, `0027`, `0042`, `0081`, `0162`, `0163`, `worker/src/tasks/snapshot_leaderboards.ts`.

**What a balance, a level, a rank or a streak IS does not change.** No worker task, no ledger code, no existing SQL
function, no existing screen file is touched. **No migration and no SQL is required** (one optional six-line function,
§4.3, only if the lead wants it). **No schema change**: `member_seen_marks` as `0162` left it suffices (§5).

## 0 · Six things the lead should read first

| # | Finding | Evidence | Where it is answered |
|---|---|---|---|
| F1 | ★★ **`DEC-206` §4.47 says «no rank for a member who opted out»; `REQ-LDR-008` says the opposite for the member's OWN view** — «An opted-out member still sees their own rank privately» | `01-prd.md:1417`; `boards_read` returns the caller's own row (`0027:487-493`); `member-board.tsx` shows it on `SCR-027` today | §6 W1 — **not picked**; the props carry either |
| F2 | ★★ **«#4 من 212» cannot be «the count of ranked members» from what a member reads.** RLS hides other members' opted-out rows, so the visible count can be **smaller than the rank** («#4 من 3»: ranks 1, 2 (hidden), 3, 4) | `0027:487-493`; the snapshot writes every member's row (`0042` header, `opt_out_at_write`) | §4.3 — three ways, one recommended |
| F3 | ★ **The monthly board holds only members with points THIS month** (`where totals.total > 0`). On the first days of every month most members have **no monthly rank at all** — the commonest absence, not an edge | `0081:614-625` | §3 state S6, and the HUD's unranked tile |
| F4 | ★ **«The monthly snapshot mid-month»: yes, but it is last night's** — the nightly job replaces the provisional one. Rank, total, neighbour and gap are up to 24 h old while the points tile is live. **A new org has none until its first night. And for one day after a month closes, the newest snapshot by `taken_at` is LAST month's FINAL** (the job writes this month's provisional first, then finalises the previous) — so the label and «ends in» come from the snapshot's own period, never from today's date | `snapshot_leaderboards.ts` (order of the two calls); `leaderboards.ts:53-60` (`order taken_at desc limit 1`) | §4.1 `period`, §3 S7 |
| F5 | ★★ **Sharing the points mark would silently eat moment 4.** `mark_points_seen(p_entry, p_total, p_level)` writes all three columns at once. If the HUD acknowledges moment 3 with the current level, `SCR-022`'s level card never turns. **The HUD passes the level LAST SEEN straight through**, so the level cursor moves only on `SCR-022` | `0163` (`set … level_id = excluded.level_id`); `points.ts:435,446` | §5.1 — no schema change, one add-only optional DTO field |
| F6 | ★ **The phone HUD and the desktop rail are both in the server's HTML** (the server does not know the viewport). Two mounts with one occurrence key: the first to mount claims it — possibly the one CSS hides, leaving the visible one static | `moment.ts` `claimMoment`; `use-seen-moment.ts` `visibleKeys()` tests `[hidden]` only, not `display: none` | §5.3 — a gate; and a question to the lead about the frame (Q1) |

## 1 · Sync-1 Q1 — the regions, in the artboard's order, and what each is built from

### 1.1 The phone HUD — `Home.dc.html:35-42` → `week-hud` (new primitive)

One card (panel radius, surface, hairline), 12 px from the screen's edges, **after the ring row and before the first
date heading**. Two rows:

| # | Region | Drawn | Built from | Arabic, after the monthly substitution |
|---|---|---|---|---|
| 1a | rank tile — **a link** to the monthly board (`/app/leaderboards?board=month`) | 11 px muted label; 28 px display figure in the accent | `week-hud`'s own tile through `ui/link`; the rise marker is `rank-row`'s arrow shape, shown and never moved | label «ترتيب <bdi>سبتمبر</bdi>» · figure «#4» in `<bdi dir="ltr">` · heard: «المرتبة 4 من 212 في سبتمبر» |
| 1b | streak tile | same, figure in the signal (coral) colour | `week-hud`'s tile | label «سلسلتك بالأشهر» · figure «×7» in `<bdi dir="ltr">` · heard: «سلسلة 7 أشهر متتالية» (the existing `points.head.streak` plural) |
| 1c | points tile | same, figure in the heading colour | `week-hud`'s tile; the figure is a node so moment 3 can count it | label «نقاطك» · «680» · heard: «رصيدك 680 نقطة» |
| 2 | the way to the next level | an 8 px bar, then one 12 px line | `progress-bar` (`fill="accent"`, `decorative` — the line says the value) | «بقي <b>20</b> لمستوى <bdi>كريم معرفة</bdi>» — six plural forms on the noun: «بقيت نقطة واحدة لمستوى …», «بقيت نقطتان …», «بقيت {value} نقاط …», «بقيت {value} نقطة …» |

**The bar's fraction is `levelProgress()` as it stands** (`points.ts:343`): balance ÷ the next threshold. The artboard's
97 % beside «بقي 20» is 680 ÷ 700 — the same rule `SCR-022` already draws. One fraction, two screens.

★ **Why the tiles are not `stat`** (`M10a.md:77` says «three `stat` tiles» — §6 W4): `stat.tsx` takes `value: string`,
draws a bordered panel at `text-h2`, and tones a value with the `DEC-073` status tones only. The HUD's tile is a
borderless raised tile at 28 px with an accent, a signal and a neutral figure, **and moment 3 needs the figure to be a
node**. `week-hud` draws its own tiles from semantic names and **composes `progress-bar` and `link`**.

### 1.2 The race on the phone — `Home.dc.html:67-72` → `CompanyRaceCard` (scoring's component, placed by `content` in the feed)

| # | Region | Built from | Arabic |
|---|---|---|---|
| 1 | head: the title, a link to the company board; a pill at the end | `ui/link`; `badge` (`neutral`, `sm`) | «سباق الشركات» · pill, provisional: «ينتهي بعد 26 يومًا» (six forms: «ينتهي اليوم» · «ينتهي غدًا» · «ينتهي بعد يومين» · «… {value} أيام» · «… {value} يومًا» · «… {value} يوم») · pill, final: «نهائي · <bdi>سبتمبر</bdi>» |
| 2 | rows: **top two and the member's own, always**; own row outlined | `race-bar` in a `<ul>` | own row's word: «فريقك» (`ownLabel`, as on `SCR-028`); the metric's name as `race-bar` already draws it |

«الجولة 3» is not built (§4.50): the pill says the month's end and nothing else.

### 1.3 The game rail — `HomeDesktop.dc.html:99-123` → `GameRail` (scoring's component, for the frame's slot)

Four cards, 12 px apart. **Three are scoring's; the fourth is a slot.**

| # | Card | Regions, in order | Built from | Arabic |
|---|---|---|---|---|
| 1 | **rank** | (a) a 12 px row: label at the start, a pill at the end · (b) the figure at 56 px display in the accent, then «من N» at 20 px muted · (c) a raised row: the neighbour's initials in the team ring, «فوقك: name», the gap at the end in the accent | `card`; `badge` for the pill; `avatar` (`teamColor`, initials, never a photo — `DEC-099`); `ui/link` on the name | (a) «ترتيبك في <bdi>سبتمبر</bdi>» · pill «ينتهي بعد N يومًا» (the six forms above) or «نهائي» · (b) «#4» · «من <bdi>212</bdi>» · (c) «فوقك: <b><bdi>سارة القحطاني</bdi></b>» · «<bdi dir="ltr">+30</bdi> تكفي» · heard: «تفصلك 30 نقطة عن المرتبة التي فوقك» (six forms) |
| 2 | **streak and points** | the flame object 40 × 50 · the streak title at 24 px display in the signal colour with one muted line under it · at the end the balance at 22 px display over «نقطة» | `card`; `FlameObject` (`ui/objects/flame`, the lead's, as `points-head.tsx` uses it); text | title: the existing plural «سلسلة 7 أشهر متتالية» · line: «<bdi>3</bdi> جلسات في الشهر تُبقيها» (six forms; the figure is `streak_rules.required_count`, read) · «680» · «نقطة» (six forms) |
| 3 | **the race** | as §1.2, with four bars and a last line linking to the board | `CompanyRaceCard` with `leaders={4}` | link: «اللوحة الكاملة» + the metric's name from `leaderboards.company.rankedMetricLabel.*` (read, not rewritten) |
| 4 | «التالية لك» | — | **`children`**: `sessions'` data (contract 3), rendered by `content`. scoring draws nothing of it | — |

★ **The rail draws no level line** — `HomeDesktop.dc.html` has none, while `M10a.md:93-95` says «the HUD moves into the
game rail» and `REQ-UIX-055` lists «the way to the next level» in the week. §6 W5, not picked. **Default: as drawn.**

«جلسة الليلة تجعلها ثماني، تخطٍّ واحد متاح» (`HomeDesktop.dc.html:107`) is §4.49's family: no skip exists, and «tonight
makes it eight» is not computable — a streak month is `required_count` check-ins, and re-deriving how many the member
has so far would be a second definition of a streak. **The line states the rule, read from `streak_rules`.**

## 2 · Sync-1 Q2 — `week-hud`'s props (contract 2, for `ui/index.ts`)

```ts
/** One figure of the week. `value` is a NODE so the screen can hand in a counting figure (moment 3); the primitive
 *  never formats a number. `valueLabel` is what a screen reader hears in place of the drawn figure. */
export interface WeekHudFigure {
  label: ReactNode;
  value: ReactNode;
  valueLabel: string;
  /** Makes the whole tile a link (`ui/link`). */
  href?: string;
}

/** `scoring` · `week-hud.tsx` — REQ-UIX-057. Three figures and the way to the next level, from props.
 *  ★ A MISSING RANK AND A DISABLED STREAK ARE ABSENCES, NEVER ZEROS — the type has no place to put a zero rank. */
export interface WeekHudProps extends Styleable {
  /** The group's accessible name — «حصيلتك هذا الشهر». */
  label: string;
  /** Ranked: the figure, and a rise shown beside it (never moved by the primitive).
   *  Unranked: the tile stays and says why in WORDS — `text` stands where the figure would. */
  rank:
    | (WeekHudFigure & { movement?: { riseLabel: string } | null })
    | { label: ReactNode; absent: string; href?: string };
  /** `null`: the org has no streak rule — the tile is NOT DRAWN and the row is two tiles.
   *  `absent`: streaks are on and the member has none running — words, never «×0». */
  streak: WeekHudFigure | { label: ReactNode; absent: string } | null;
  /** A balance of 0 is a true figure and is drawn. `delta` is the «+N» of moment 3's static state. */
  points: WeekHudFigure & { delta?: ReactNode | null; deltaLabel?: string | null };
  /** `null`: no level yet (before the first nightly evaluation) — no bar; `line` alone is drawn if given. */
  level: { value: number; max: number; line: ReactNode } | { line: ReactNode } | null;
}
```

Registry: kind **`composes`** (`progress-bar`, `link`). No `"use client"`, no data, no catalogue, no keyframe, nothing on
hover but `link`'s own. `data-slot`s for the moment to find: `rank`, `rise`, `points`, `delta`, `level-bar` (the
`progress-bar`'s own `fill` inside it). Demo `demos/week-hud.tsx`: ranked with a rise · unranked · streak absent ·
streak `null` (two tiles) · zero balance · top level (full bar, «بلغت أعلى مستوى») · no level · a long month name and a
four-digit rank at 390 px. `week-hud.test.tsx` + `week-hud-scope.test.tsx` (inside the scope, RTL, the absence cases
asserting **no «0», no «#0», no «×0» in the DOM**).

## 3 · Sync-1 Q3 — the states nobody drew

| # | State | What the DAL says | HUD (phone) | Rail (desktop) |
|---|---|---|---|---|
| S1 | **opted out of leaderboards** | `optedOut: true`; `rank` per F1's ruling | **pending F1.** If `REQ-LDR-008` stands: the rank as for anyone, with the word «مخفيّ عن غيرك» under it. If §4.47 stands: the unranked tile, «مخفيّ عن اللوحات». Either way: **nobody's neighbour** (RLS hides the row from everyone else — nothing to add), and no achievement item for others | the same, in the rank card; no neighbour row is removed — it is the viewer's neighbour, who is visible |
| S2 | **streaks disabled** (no enabled `streak_rules` row) | `streak: null` | the streak tile is not drawn; two tiles | card 2 shows the balance alone: no flame, no title, no rule line |
| S2b | streaks on, none running | `streak.months = 0` | the tile says «لم تبدأ بعد» — never «×0» | the title is «لا سلسلة جارية بعد» (existing `streakNone`), the rule line stays, **no flame** (as `SCR-022`) |
| S3 | **no company** | race `own: null`; the week is unaffected (a member's rank needs no company) | the HUD is whole. `app.home.companyMissing` above it is `content`'s / the page's (`M10a.md:98`) | the race shows the leaders only, no outlined row, and one line «اختر شركتك لتدخل السباق» linking to `/app/me` |
| S4 | **top level** | `next: null`, `progress: {1, 1}` | the bar full; «بلغت أعلى مستوى» (existing `level.top`) | — (no level line on the rail, W5) |
| S4b | no level yet | `level: null` | no bar; «يُحدَّد مستواك في التقييم الليلي القادم.» (existing `level.none`) | — |
| S5 | **rank 1** | `rank.above: null` | the figure «#1»; nothing else differs | the neighbour row is replaced by «أنت في الصدارة» — **no gap, no «+0»** |
| S6 | **brand-new member / no points this month** (F3) | `rank: null`, `rankAbsence: "no_points"`; `points: 0` | rank tile: «لا ترتيب بعد» (still a link to the board); points «0» (a true zero); streak per S2/S2b; level per S4b or «بقي 100 لمستوى مشارِك نشِط» | rank card: «لا ترتيب بعد هذا الشهر» and «أول نقطة في <bdi>سبتمبر</bdi> تُدخلك اللوحة»; no «من N», no neighbour |
| S7 | **no snapshot at all** (a new org before its first night) | `period: null`, `rankAbsence: "no_snapshot"`; race `null` | rank tile: «يُحسب الليلة» | rank card the same; **the race card is not rendered** |
| S8 | **provisional** (`is_final = false`) | `period.isFinal: false`, `daysLeft: n` | the label names the month; no pill on the phone (none is drawn) | pill «ينتهي بعد N يومًا»; on the last day «ينتهي اليوم» |
| S9 | **final** (the day after a month closes, F4) | `period.isFinal: true`, `daysLeft: null` | the label names **that** month («ترتيب <bdi>سبتمبر</bdi>») — true, because it is the snapshot's | pill «نهائي»; the race's pill «نهائي · <bdi>سبتمبر</bdi>» |
| S10 | the race has one or two companies, or the member's is among the leaders | `rows` has no duplicate | the rows there are; the own row outlined where it stands | the same |
| S11 | a company's value is negative or zero | `fraction: 0` | an empty track and the signed figure, as `race-bar` already does | the same |
| S12 | a tie above | `above` is the visible row with the greatest rank **below** the member's number, so `gap > 0` always | — | «+N تكفي» with N ≥ 1; never «+0» |

`daysLeft` is measured to the snapshot's `period_end` **as the job computed it** — `date_trunc('month', now())` in the
database's zone, UTC, compared as `::timestamptz` (`0081:617-618`). The month therefore closes at 03:00 Riyadh time on
the 1st. That is what a monthly board IS today and it does not change; the figure counts to the real boundary.

## 4 · Sync-1 Q4 — contract 4: what scoring publishes

All add-only. All read with the caller's client, under RLS as it stands. **None stores anything.**

### 4.1 The member's week — `src/lib/dal/points.ts`

```ts
export interface WeekPeriod {
  /** `YYYY-MM-DD`, the snapshot's own month — NOT today's. */
  start: string;
  end: string;
  isFinal: boolean;
  takenAt: string;
  /** Whole days until `end`; 0 on the last day; null when final. */
  daysLeft: number | null;
}

export interface WeekNeighbour {
  memberId: string;
  displayName: string;
  company: string | null;
  /** `companies.team_color`; reaches the DOM only as `--team`. */
  teamColor: string | null;
  rank: number;
  /** Their monthly points minus the viewer's, from the SAME snapshot. Always > 0. */
  gap: number;
}

export interface MemberWeek {
  /** null: the org has no monthly snapshot yet. */
  period: WeekPeriod | null;
  /** null is an ABSENCE — `rankAbsence` says which. Never 0. */
  rank: { rank: number; monthPoints: number; total: number; above: WeekNeighbour | null } | null;
  rankAbsence: "no_snapshot" | "no_points" | "opted_out" | null;
  optedOut: boolean;
  /** null: no enabled streak rule. `months` may be 0 (on, none running). */
  streak: { months: number; requiredPerMonth: number } | null;
  /** The live balance — `points_balances.total_points`. */
  points: number;
  level: { name: string; tier: number } | null;
  next: { name: string; threshold: number; remaining: number } | null;
  progress: { value: number; max: number } | null;
  /** Moment 3 — `decideCompletion()`'s answer, unchanged. */
  completion: PointsHead["completion"];
  /** What the week acknowledges: entry and total as shown, and the level LAST SEEN, passed through (F5). */
  pointsMark: PointsMark;
  pointsNeedsMark: boolean;
  /** Moment 5 — `decideBoardMoment("monthly", …)`'s answer, unchanged. */
  rankMoment: BoardMoment;
  timeZone: string;
}

/** Request-scoped `cache()`: the phone HUD and the rail ask once between them. */
export const getMemberWeek: (locale: string) => Promise<MemberWeek>;
```

It calls `getPointsHead()` (unchanged in behaviour) for the balance, the level, the streak and moment 3, and a narrow
monthly read for the rest. ★ **It does not call `getLeaderboards()`**: that reads the all-time RPC, every entry of two
snapshots and three member lists — eight round trips for a figure the home needs four rows for. The narrow read:
the newest monthly snapshot (`order taken_at desc limit 1`, **the same rule `SCR-027` uses, so the two can never name
different months**) · the caller's own entry · the one visible entry with the greatest `rank` below it
(`.lt("rank", mine).order("rank", desc).limit(1)`) · the total (§4.3) · that neighbour's `members` row and company.

**Two add-only edits to existing exports, both optional fields:** `PointsHead.seen?: { entryId, total, levelId } | null`
(what the mark held, so the week can pass the level through and compute its own `needsMark` — F5), and
`streak.requiredPerMonth?: number` on `PointsHead.streak`. Neither changes what `SCR-022` renders.

**RLS, read by read:** `leaderboard_snapshots` — `p1_org_read` (`0027:448`) ✓ · `leaderboard_entries` — `boards_read`
(`0027:487`): own row always, another's unless they opted out ✓, **which is exactly «an opted-out member is nobody's
neighbour» with no code** · `members (id, display_name, company_id, leaderboard_opt_out)` — `members_read_org` and the
column grant (`0004:297-307`) ✓ · `companies (name, team_color)` — read by `getLeaderboards()` today ✓ ·
`points_balances`, `levels`, `streak_rules`, `streak_awards`, `member_seen_marks` — as `getPointsHead()` reads them ✓.

### 4.2 The company race — `src/lib/dal/leaderboards.ts`

```ts
export interface CompanyRaceRow {
  companyId: string;
  companyName: string;
  teamColor: string | null;
  rank: number;
  totalPoints: number;
  pointsPerActiveMember: number | null;
  /** 0 – 1 against the leader over ALL companies — `companyFractions()`, the board's own function. */
  fraction: number;
  isOwn: boolean;
}

export interface CompanyRace {
  metric: "total_points" | "points_per_active_member";
  period: WeekPeriod;
  /** The leaders in rank order, then the viewer's own company if it is not among them. No duplicate. */
  rows: CompanyRaceRow[];
  /** null: the member has no company. */
  ownCompanyId: string | null;
  /** How many companies the snapshot ranks. */
  companies: number;
}

/** null: no company snapshot yet, or it ranks nobody. `leaders` defaults to 2. */
export function getCompanyRace(locale: string, opts?: { leaders?: number }): Promise<CompanyRace | null>;
```

Fractions are computed over every row **before** the slice, so a bar on the home is the length it is on `SCR-028`.
RLS: company rows have `member_id is null` and pass `boards_read` for every member of the org ✓; `org_settings`
(`company_metric`, `time_zone`) is read by `getLeaderboards()` today ✓. ★ **It neither reads nor writes the company
mark**: the race on the home has no moment (§5), so `SCR-028`'s bar still grows at first sight there.

### 4.3 «من N» — three ways, and what each costs (F2)

| | N is | SQL | Truth |
|---|---|---|---|
| A | the count of entries the caller can read | none | **wrong when a member above opted out** — can print «#4 من 3» |
| B | `leaderboard_snapshots.active_member_count`, frozen at the snapshot (`0042`) | none | always ≥ the rank, stable; but it is «من 212 عضوًا نشطًا», **not** «ranked members» — on the 3rd of a month it reads «#4 من 212» when nine people have points |
| C | the exact count of entries in the snapshot | **one function**, `supabase/proposed/scoring/0002_monthly_ranked_count.sql`: `monthly_ranked_count(p_snapshot uuid) returns int`, `stable`, `security definer`, `search_path = ''`, refuses a snapshot of another org, returns a number and nothing else; `revoke … from public, anon`, `grant execute to authenticated`; `03` §8.2 rows and `tests/rls/scoring-week-count.test.ts` through `applyProposed()` | exact. It reveals how many opted-out members have points — which the gaps in the ranks already reveal |

**Recommended: C**, because §4.48 asks for «the count of ranked members» and only C is that. **If the lead wants no SQL
in PR A: B**, with the copy saying what it is. A is not offered. `main` on a schema with C: nothing names it.

### 4.4 The achievement items — `src/lib/dal/recognition.ts`

```ts
export interface AchievementMember {
  memberId: string;
  displayName: string;
  company: string | null;
  teamColor: string | null;
  isSelf: boolean;
}

export type AchievementItem =
  | { kind: "badge"; id: string; awardedAt: string; member: AchievementMember; badge: { name: string; description: string | null } }
  | { kind: "streak"; id: string; awardedAt: string; member: AchievementMember; /** `YYYY-MM-DD`, the month completed. */ periodStart: string };

/** Newest first by `awardedAt`, then `id` — see the note on ties. `limit` defaults to 20 and is capped at 50. */
export function getAchievementItems(locale: string, opts?: { since?: string; until?: string; limit?: number }): Promise<AchievementItem[]>;
```

- **Sources:** `member_badges` and `streak_awards`, each by `awarded_at`, merged. **No level-up and no rank change**
  (§4.52): neither leaves a row. No reaction field (§4.53).
- ★ **Opt-out is enforced HERE**, in the query, not by the component: an inner embed on the member with
  `leaderboard_opt_out = false` and `status = 'active'` — so an opted-out colleague's row never leaves the DAL, and an
  anonymised member (whose `display_name` is null) never appears as a nameless item. `member_badges` has two foreign
  keys to `members` (`member_id`, `awarded_by`), so the embed names its constraint.
- **The viewer's own item** when the viewer has opted out: Q3 below. Default: included **for themselves only**,
  mirroring `boards_read`; `isSelf` lets the feed say «نلت» instead of a name.
- **RLS:** `member_badges`, `badges`, `streak_awards` are `p1_org_read` (`0027:165,193,273`) ✓; nothing is widened —
  `getMemberRecognition()` already shows the same rows on every profile.
- ★ **Ties:** `awarded_at` defaults to `now()`, the transaction's start, so every badge one `evaluate_badges` run
  writes carries the same instant. This is a feed's order, not «the last row», and `id` makes it stable. **A seeding
  run — `first_check_in` to forty members at once — arrives as forty items with one timestamp**: `content`'s feed
  decides how a burst is folded; the DAL caps it.
- `award_reason` (an admin's note on a manual badge) is **not** returned.

**The item's words are scoring's, in `scoring.json`, read by `content`'s `feed-item`:**
«<name></name> نال شارة <b><bdi>{badge}</bdi></b>» · «<name></name> أكمل سلسلة الحضور في <bdi>{month}</bdi>» · for oneself:
«نلت شارة <b><bdi>{badge}</bdi></b>» · «أكملت سلسلة الحضور في <bdi>{month}</bdi>». The line under it — the company and the
relative time («أيك، قبل ساعتين») — is `feed-item`'s.

### 4.5 The components — all server components in `src/components/scoring/`, new files

```tsx
/** The frame's game-rail slot (contract 1). `children` is «التالية لك», which is not scoring's. */
export async function GameRail(props: { locale: string; children?: ReactNode }): Promise<JSX.Element>;

/** The phone HUD: `getMemberWeek()` → `week-hud`, with moments 3 and 5. */
export async function MemberWeekHud(props: { locale: string }): Promise<JSX.Element>;

/** The race card — in the feed on the phone, inside `GameRail` on desktop. Renders nothing when there is no race. */
export async function CompanyRaceCard(props: { locale: string; leaders?: number }): Promise<JSX.Element | null>;
```

`content`'s page renders `<MemberWeekHud>` and `<CompanyRaceCard>` where the artboard puts them and passes
`<GameRail>` to the frame's slot. **Who hides which at which width is the frame's** (Q1). Each reads through the
`cache()`d DAL, so the two surfaces cost one read.

## 5 · Sync-1 Q5 — moments 3 and 5 on the week

**No new moment, no new keyframe, no change to `src/lib/ui/`, no schema change.** Both go through `useSeenMoment` as it
stands, with the SAME `kind` and the SAME id the first surface uses — that identity is the whole sharing mechanism.

### 5.1 Moment 3 — the count-up

| | |
|---|---|
| **Key** | `useSeenMoment("completion", completion.occurrenceId)` — `points_balances.last_entry_id`, from `decideCompletion()` through `getPointsHead()`. **Byte-identical to `SCR-022`'s**: one function decides for both |
| **Shared, in one tab** | `moment.ts`'s claim: whichever surface mounts first claims `completion:<entry>`; the other finds it claimed and is static |
| **Shared, across devices and visits** | `member_seen_marks.points_entry_id / points_total`: once either surface acknowledges, `decideCompletion()` returns null for both |
| **The writer** | `markPointsSeen()` → `mark_points_seen()` (`0163`), unchanged, called from a **new** bound action in `src/components/scoring/week-actions.ts` (the existing one lives under `app/me/points/`, which is frozen) |
| ★ **The level is passed through** (F5) | the week's mark is `{ entryId, total, levelId: <the level last SEEN> }` — `head.levelUp ? head.levelUp.held.id : head.mark.levelId`. The points cursor moves; the level cursor does not. **Moment 4 stays `SCR-022`'s**, and turns there even after the home played moment 3. With no mark at all, the baseline takes the current level, exactly as `SCR-022`'s first sight does («the first level is where they start») |
| **What moves** | the points figure counts from `from` to `to` (`useCountUp`, `party`) · «+N» fades in beside it (`base`) · the level bar's fill by `scaleX` from `fromProgress` (`party`) · on desktop the flame grows to rest (`slow`), its flicker the existing `.moment-flicker` class. `element.animate()`, `fill: "backwards"`, transform and opacity only, no `will-change` — `moment-points-head.tsx`'s sequence, on the HUD's slots |
| ★ **The bar when a level-up is unseen** | it does **not** move. On `SCR-022` the bar fills and the card turns; the HUD has no card, and the bar's true new value can be *shorter* than the old (280 of 300 → 310 of 700). A bar running backwards in a celebration is a lie about progress; the figure counts and the bar stands at the truth |
| ★ **The flame on the phone** | `M10a.md:99-101` says «the points count-up + flame plays on the HUD»; `Home.dc.html:38` draws **no flame** in the streak tile. §6 W6, not picked. Default: the flame grows where one is drawn — the rail |
| **Static state** | the new balance; «+N» beside it on the first sight and only then; the bar at the truth; the flame at rest. Complete under reduced motion, on a reload and on another phone. **A decrease, or a gain with no completion row, is not an occurrence** — nothing, and the mark moves on quietly |

### 5.2 Moment 5 — the rank change, on the rank tile

| | |
|---|---|
| **Key** | `useSeenMoment("rank", "monthly:<period>:<seenRank>-<rank>")` — `decideBoardMoment("monthly", …)`, the pure function `SCR-027`'s monthly tab already calls. One function, one id |
| ★ **The monthly mark suffices** | `monthly_period` + `monthly_rank` is exactly the week's question: «the rank I last saw, in this month». A new month, a fall, a tie, no mark — not an occurrence, as today. **No column is added.** |
| **Shared** | in a tab by the claim; across devices by `member_seen_marks.monthly_*` |
| **The writer** | `markBoardSeen()` → `mark_board_seen('monthly', period, rank, null, null)` (`0163`), unchanged — it touches the monthly columns only (`RPC-mark_board_seen.one_board`), so the all-time board and the company race keep their own first sights on `SCR-027` / `SCR-028` |
| **What moves** | the figure counts from the old rank to the new (`useCountUp`, `slow` — downward, «#7» to «#4») and the rise arrow fades in (`base`). **No FLIP**: there are no rows on a tile. **The arrow does not pulse** (`DEC-197` §2) |
| **Static state** | «#4» and the rise arrow with its words («تقدّمت 3 مراكز منذ زيارتك الأخيرة»), shown and still. **A fall shows the new rank and nothing else** — no colour, no icon, no motion |
| **Opted out** | per F1. If the rank is absent, there is no occurrence and **nothing is acknowledged** — the monthly mark is left for `SCR-027`, where the member still sees their own row |

### 5.3 The three rules both inherit, and one new one

1. **A hard load never plays** (`DEC-197` §5): `MemberWeekHud` and `GameRail` read `isDocumentLoad()` and pass it, as
   the two existing pages do. ★ **`/app` is where a member lands** — most first sights of the home are document loads,
   so the moment shows its static state there, tells the server nothing, and plays at the next in-app arrival on
   either surface. That is the rule as ruled; the lead should know it is the common path here (Q4).
2. **The server is told only by the client that showed it**, through a Server Action bound on the server with the mark
   the page rendered; never by a render.
3. **Latched for the visit**: the delta and the arrow a member was shown do not vanish when the acknowledgement lands.
4. ★ **New — one of two copies plays** (F6). A small client gate around the week's moment controller measures, in a
   layout effect before paint, whether its own element is displayed (`offsetParent !== null`). **Only the displayed
   copy mounts the controller**; the hidden one is the static state, claims nothing and acknowledges nothing. The
   controller renders no DOM of its own: it animates the slots of the server-drawn HUD and feeds the counting figure
   through context. Proven in jsdom (a hidden ancestor, a visible sibling: one plays, the hidden one is never claimed).

### 5.4 The test that opens both

- **jsdom — `tests/components/scoring/week-moments.test.tsx`** (new): (a) mount the week with a completion occurrence →
  plays, acknowledges with the level passed through; unmount; mount **`MomentPointsHead`** with the same occurrence →
  static, silent. (b) the reverse order. (c) and (d) the same pair for moment 5 against **`MomentRank`**. (e) each
  moment's mount → play → unmount → mount → silence. (f) reduced motion: the static state whole, acknowledged at once.
  (g) `documentLoad`: static, unclaimed, untold; the next in-app mount plays. (h) the hidden copy. (i) a level-up
  unseen: the figure counts, the bar's fill is not animated, and the acknowledged `levelId` is the OLD level.
  (j) transform and opacity only, tokens only, no `will-change`. It imports the lead's
  `tests/components/lib-ui/motion-env.ts` and copies nothing.
- **unit — `tests/unit/scoring-week.test.ts`** (new): the week's pure rules — the neighbour and the gap (a tie, rank 1,
  a hidden row above), `daysLeft` at the month's edges, the absences, the pass-through mark, `needsMark`.
- **RLS — `tests/rls/scoring-week.test.ts`** (new): as member A, acknowledge through the week's mark → `level_id`
  unchanged and the monthly columns alone moved; an opted-out member B is absent from A's neighbour read and from A's
  achievement read; B reads their own row; a member of another org reads nothing. With option C, the count's cases.
- **e2e — `tests/e2e/wave18-scoring-week.spec.ts`** (new, the lead runs it; phone and desktop): ★ **award → arrive at
  `/app` in-app → the HUD plays → go to `/app/me/points` in-app → silent, the balance and no delta animation; and a
  second member the other way round — `SCR-022` first, then the home, silent.** The same pair for the monthly rank
  against `/app/leaderboards?board=month`. A level-up: the home plays 3, then `SCR-022` turns the card. Captures:
  `wave18-scoring-home-{hud,rail}-{animated,static}-{390,1280}.png`, and the states of §3 that a fixture can reach.

## 6 · Sync-1 Q6 — files, assertions, disagreements

### 6.1 Files created — nothing is replaced or deleted

| File | What |
|---|---|
| `src/components/ui/week-hud.tsx` | the primitive (§2) |
| `src/app/[locale]/(dev)/ui/demos/week-hud.tsx` | its demo; the lead wires it |
| `tests/components/ui/week-hud.test.tsx`, `week-hud-scope.test.tsx` | |
| `src/components/scoring/member-week-hud.tsx` | the phone HUD |
| `src/components/scoring/game-rail.tsx` | the rail's three cards and the slot |
| `src/components/scoring/company-race-card.tsx` | the race |
| `src/components/scoring/moment-week.tsx` | the client controller and its gate (§5.3) |
| `src/components/scoring/week-actions.ts` | `"use server"`: two bound acknowledgements, async exports only |
| `tests/components/scoring/week-hud-section.test.tsx`, `week-rail.test.tsx`, `week-race.test.tsx`, `week-moments.test.tsx` | |
| `tests/unit/scoring-week.test.ts` · `tests/rls/scoring-week.test.ts` · `tests/e2e/wave18-scoring-week.spec.ts` | |
| `supabase/proposed/scoring/0002_monthly_ranked_count.sql` | **only under option C** |

**Edited, add-only:** `src/lib/dal/points.ts` (`getMemberWeek`, its types, two optional fields on `PointsHead`) ·
`src/lib/dal/leaderboards.ts` (`getCompanyRace`, its types) · `src/lib/dal/recognition.ts` (`getAchievementItems`, its
types) · `src/messages/{ar,en}/scoring.json` (a new `scoring.week` and `scoring.feed` group, Arabic first, **no digit
typed in a message** — `tests/unit/scoring-i18n.test.ts` holds that).

**Requests to the lead (contract 2):** `WeekHudProps` and `WeekHudFigure` in `ui/index.ts`; the registry entry
(`composes`); the demo wired. **One add-only request on my own primitive, pending W3:** `RaceBarProps.layout?: "stacked" | "inline"`.

### 6.2 Existing assertions that move — **none planned**

No existing screen, component or spec is edited. Two risks, named so they are not found at the gate:

- `tests/components/scoring/points-head.test.tsx` and `tests/unit/scoring-seen.test.ts` build `PointsHead` objects by
  hand; the two new fields are optional, so they compile and pass untouched. If one asserts `toEqual` on
  `getPointsHead()`'s whole result it would move — **I have found none**; it is checked before the first commit.
- ★ **Any e2e that reaches `/app/me/points` or a board by in-app navigation FROM `/app` will now find the moment
  already played.** `wave16-scoring-moments.spec.ts` starts from `/app/me` and from a board URL (lines 218 – 345), so
  it is unaffected. The lead's `wave16-{demo,lead}-*` specs are not mine to read for this; **the lead should check
  them.** If one moves, it is an expectation, not a selector.

### 6.3 Disagreements `DEC-206` §4 does not list — not picked

| # | The artboard / the design | The plan / the tree | Default I build on, until ruled |
|---|---|---|---|
| W1 | — (`DEC-206` §4.47: «No rank for a member who opted out») | `REQ-LDR-008`, `01-prd.md:1417`: «An opted-out member still sees their own rank privately»; `0027:487-493` returns it; `SCR-027` shows it | **none — F1 needs a ruling.** The DTO carries `optedOut` and the rank separately, so it is one line either way |
| W2 | `HomeDesktop.dc.html:102`: «من 212» | the exact count is not readable by a member (F2) | §4.3, option C recommended |
| W3 | `Home.dc.html:69-71`, `HomeDesktop.dc.html:112-115`: a race row is ONE line — ring, name, bar, figure — with the metric named once, in the card's last link | `race-bar.tsx:16-18, 42-46`: three lines, and **«the ranking metric is marked … on every bar» (`REQ-LDR-005`)**; `M10a.md` §10 lists `race-bar` as «used as-is» | `race-bar` as it is (three lines). The one-line row is an add-only `layout="inline"` that still says the metric to a screen reader on every row and shows it once in the card |
| W4 | `M10a.md:77`: «three `stat` tiles» | `stat.tsx`: `value: string`, a bordered panel, status tones only | `week-hud` draws its own tiles (§1.1). The other way is three add-only props on `content`'s `stat` |
| W5 | `HomeDesktop.dc.html:99-123`: the rail has **no level line** | `M10a.md:93-95` «the HUD moves into the game rail»; `REQ-UIX-055` lists «the way to the next level» in the week | as drawn: none on desktop |
| W6 | `Home.dc.html:38`: the streak tile draws no flame | `M10a.md:99-101`: «the points count-up + flame plays on the HUD» | the flame grows where it is drawn — the rail only |
| W7 | `HomeDesktop.dc.html:112-115`: **four** bars, the member's third among them; `M10a.md:95`: «the race widget (4 bars)» | `M10a.md:85` and the brief: «top 2 + your company always» | phone: two leaders and the own. Desktop: four leaders, and the own appended if it is not among them. `getCompanyRace({ leaders })` serves both |
| W8 | `HomeDesktop.dc.html:107`: «جلسة الليلة تجعلها ثماني» | §4.49 covers the skip and `SCR-014`'s line, not this one; not computable without a second definition of a streak | the rule, read: «N جلسات في الشهر تُبقيها» |
| W9 | `Home.dc.html:37`: the rank tile is a link («#board»); `HomeDesktop.dc.html:101-103`: the rank card is not, and its neighbour is not | — | phone: the tile links to the monthly board. Desktop: the figure links there and the neighbour's name to their profile (`SCR-020` exists; `/app/members` index does not, §4.31) |
| W10 | `Home.dc.html:97`: an achievement names the member's company and a relative time | — | the DTO carries `company`, `teamColor` and `awardedAt`; `feed-item` draws them |
| W11 | the artboards draw the rank and the «+30» as **live** | the snapshot is nightly (F4) | the figures are last night's; the rail's pill says when it ends, and **no copy says «now»** |

### 6.4 What I believe §4.47 – §4.53 and §5 measured wrongly — with evidence

1. **§4.47** — «no rank for a member who opted out» contradicts `REQ-LDR-008`'s acceptance (W1).
2. **§4.48** — «the total is the count of ranked members»: not readable (F2). And «derived from the monthly board's
   rows» is true **and nightly**, absent for a new org, and last month's on the 1st (F4) — so «labelled as the month,
   ending when the month ends» must read the snapshot, not the calendar.
3. **§4.48 / §4.47, unsaid** — the monthly board ranks only members with points this month (F3). «A missing rank» is
   most members in a month's first days, not a corner.
4. **§5's table** — «moments 3 and 5 share one mark»: for moment 3 the mark is one RPC over three columns, the level
   among them (F5). Shared as written, the home eats moment 4. Passed through, it does not — no schema change.
5. **§4.50** — «the month, and the days left in it»: the month is the database's UTC month (`0081:617`), which closes
   at 03:00 in Riyadh. Correct as built; the figure counts to that instant.
6. **§4.49, §4.51, §4.52, §4.53** — verified as written: `currentStreak()` counts months; `member_badges.awarded_at`
   and `streak_awards.awarded_at` exist; nothing records a level change or a rank change; `reactions` has no
   achievement target.

## 7 · Questions for the lead

- **Q1 (contract 1).** How does the frame hide the rail below `lg` and where does the phone HUD stand at `lg` and up —
  CSS on two copies that are both in the HTML? §5.3's gate assumes yes. If the frame can tell me its slot is not
  displayed, the gate reads that instead of `offsetParent`.
- **Q2 (F1).** An opted-out member's OWN rank on the week: `REQ-LDR-008` or §4.47?
- **Q3.** An opted-out member's own badge in their own feed: shown to themselves (my default, mirroring `boards_read`)
  or to nobody?
- **Q4.** `/app` is a landing page, so most first sights there are hard loads, which by `DEC-197` §5 show the static
  state and play on the next in-app arrival. Confirm that is wanted on the home as ruled — I change nothing of it.
- **Q5 (F2).** «من N»: option C (one proposed function, exact) or option B (no SQL, the org's active members)?
- **Q6 (W3, W5, W6, W7).** The four artboard-against-spec rows that change what is drawn.
- **Q7.** The rail's neighbour row links to a member's profile (`SCR-020`, batch M10b, not rebuilt). Link, or plain text
  until M10b?

**Nothing is built until «the frame is in at `<sha>`».**

## Wave 18 — contract 4 as landed (`782f80d1`, after `DEC-207`)

**The DAL** — add-only, read with the caller's client, nothing stored:

| Function | Module | Returns |
|---|---|---|
| `getMemberWeek(locale)` — `cache()`d | `src/lib/dal/points.ts` | `MemberWeek` |
| `getCompanyRace(locale, { leaders? = 2 })` | `src/lib/dal/leaderboards.ts` | `CompanyRace \| null` (null: no company snapshot, or it ranks nobody) |
| `getAchievementItems(locale, { since?, until?, limit? = 20, ≤ 50 })` | `src/lib/dal/recognition.ts` | `AchievementItem[]`, newest first by `awardedAt`, then `id` |

`MemberWeek` is §4.1's type **with one change from the plan**: `rankAbsence` is `"no_snapshot" | "no_points" | null` —
there is no `"opted_out"`, because `DEC-207` §1.1 ruled that an opted-out member sees their own rank; `optedOut: true`
says «مخفيّ عن غيرك». Added: `levelUpPending: boolean` (the week's bar stands still while `SCR-022`'s card has yet to
turn). `CompanyRace`, `CompanyRaceRow`, `WeekPeriod`, `WeekNeighbour`, `AchievementItem`, `AchievementMember` are as
§4.2 – §4.4 wrote them. Also exported, for `getMemberWeek()`'s use: `getMonthlyStanding()`, and the pure rules
`weekPeriod()`, `raceRows()`, `weekPointsMark()`, `newestFirst()`. `PointsHead` gained two optional fields,
`seen` and `streak.requiredPerMonth`; `SCR-022` renders nothing differently.

**The components** — server components in `src/components/scoring/`, each reads through the cached DAL:

```tsx
GameRail({ locale, children? })                 // game-rail.tsx — the frame's `rail`; children = «التالية لك» (NextForMe)
MemberWeekHud({ locale, className? })            // member-week-hud.tsx — the phone HUD; the page adds `lg:hidden`
CompanyRaceCard({ locale, leaders? = 2, className? })  // company-race-card.tsx — null when there is no race
```

The words of an achievement item are `scoring.feed.{badge,badgeSelf,streak,streakSelf}` (rich: `<name></name>`,
`<b>`, `<bdi>`), read by `content`'s `feed-item`; `scoring.week.*` and `scoring.race.*` are the week's.

**Proposed for the lead:** `supabase/proposed/scoring/0002_monthly_ranked_count.sql` with its `03` §8.2 rows in the
header; `tests/rls/scoring-week.test.ts` 9 ✓ through `applyProposed()`.

**Held for the lead's commit (contract 2):** `src/components/ui/week-hud.tsx`, `tests/components/ui/week-hud.test.tsx`,
`tests/components/ui/week-hud-scope.test.tsx`, `src/app/[locale]/(dev)/ui/demos/week-hud.tsx` — then I commit
`member-week-hud.tsx` and `tests/components/scoring/week-hud-section.test.tsx`, which import it.

**Tests at `782f80d1`:** `week-moments` 15 ✓ (both orders against `MomentPointsHead` and `MomentRank`, the hidden
copy, reduced motion, a server paint, the unseen level-up), `week-rail` 12 ✓, `week-hud-section` 12 ✓ (uncommitted),
`week-hud` + `-scope` 18 ✓ (held), `race-bar-inline` 6 ✓ with `race-bar` and `-scope` untouched, `scoring-week`
(unit) 16 ✓, `scoring-i18n` ✓, the RLS file 9 ✓. `tsc` clean for my files; eslint 0; `ui-lint` strict ✓.
`ui-playground` is red only on the four unregistered new files, `week-hud.tsx` among them — the lead's commit.
**No existing assertion moved.** The e2e spec `tests/e2e/wave18-scoring-week.spec.ts` needs `content`'s home in
place and a production build — the lead's to run.

---

## Wave 19 — plan

*`SCR-019` the directory (new), `SCR-020` the profile (phone and desktop), `ui/badge-medallion` — `REQ-UIX-068`,
`REQ-UIX-069`, `REQ-UIX-064`, `STORY-UIX-057`, `058`, `DEC-213`. Planning only: nothing is deleted before the lead
posts «the plans are approved» and «the frame is in». Read at `b0e18503`: `M10b.md` §5–§7, `Directory.dc.html`,
`Profile.dc.html`, `ProfileDesktop.dc.html` and their three PNGs, `DEC-213` §3–§7, `DEC-208`, `DEC-141`, `DEC-207`
§1.3, A33, `03` §5.1b, `09` `SCR-019`/`SCR-020`, and the tree: `members/[id]/page.tsx`, `members/loading.tsx`,
`members/error.tsx`, `lib/dal/members.ts`, `getMemberStanding()`, `getMemberRecognition()`, `listSessionsPresentedBy()`,
`getPresenterAggregate()`, `members.json`, `0004:294-323`, `0027:147-225`, `0027:469-491`, `0044`, `0157:55-70`.*

### W19.0 · Six things to read first

1. ★★ **The tree's own tests pin a rank the database never gives.** `sessions-member-profile.test.ts:113` asserts an
   admin sees an opted-out member's rank (`rank: 3`). The stub says so; **the database does not**:
   `all_time_leaderboard()` (`0044`) drops an opted-out member for everyone but themselves, admins included, and
   `boards_read` (`0027:487-491`) does the same for the monthly rows. So on a real page an admin sees the points and
   «—» for both ranks. Not a rebuild defect — a pinned expectation the product never met. N8 below; not picked.
2. ★ **Today an opted-out member's LEVEL is hidden from colleagues too** — `standing: null` takes `levelName` with
   it (`members.ts:197`). §5.116 rules level, badges and streak shown. The plan keeps `standing`'s rule exactly
   (points and rank withheld) and adds the level beside it, so **no existing assertion moves** (W19.6).
3. ★ **The badges table has no colour and no glyph** (`0027:147-159`): the artboards draw a colour and a glyph per
   badge. N1 — the one disagreement that blocks `badge-medallion`'s callers, not the primitive.
4. ★ **Three of the self tier's six hub links have no destination in the tree** (attended, ratings given, no-shows).
   N7.
5. ★ **No migration and no SQL.** The directory is assembled in the DAL from reads every member already has
   (W19.5); the RPC alternative is named for the lead, not proposed.
6. ★ **Requests to three primitive owners and the lead** (W19.8): `avatar` sizes, `tag-chip`'s dot, `badge`'s
   level ramp (`content`); `page-header`'s count and the medallion's drop tokens (lead); contract 4's batch count
   (`sessions`).

### W19.1 · Sync-1 Q1 — the regions, in each artboard's order, and the primitive each is built from

**`Directory.dc.html` (390 × 1380) — `SCR-019`, `/app/members`.** Desktop is not drawn: the same column in the frame's
content area, rows two-up from `lg` (`M10b.md` §5).

| # | Region (artboard line) | Built from |
|---|---|---|
| D1 | Title row: «الأعضاء» + the count «212» · the order «الأنشط أولًا ⌄» (`:18-21`) — the page's own phone top row, no wordmark (contract 1) | `ui/page-header` (`title`, `actions`) — ★ the count needs an add-only `count` (W19.8 R4); the order is `ui/menu` whose trigger is `ui/button` (quiet, pill) and whose two items are **links** (`href` `?order=active` / `?order=name`, `current`) |
| D2 | Search pill «بالاسم أو المسمّى الوظيفي», hidden label «ابحث في الأعضاء» (`:23-26`) | `browse/search-field.tsx`'s pattern, not its file: a GET `<form role="search">` to `/app/members`, `ui/input` `type="search"` `size="lg"` with `startIcon` `SearchIcon` (`ui/icons`), the label `sr-only`, the other filters as hidden fields |
| D3 | Company chips: «الكل» current, then each company with its team dot (`:28-34`) | `ui/tag-chip` with `href` and `selected` — ★ the dot needs `teamColor` add-only (W19.8 R2). A horizontal scroller with `overflow-x-auto` on the ROW, never on a text line |
| D3b | ★ Interests chips — not drawn; only when the org has any interest recorded (§5.107) | `ui/tag-chip`, the same row shape, `?interest=` |
| D4 | The rows (`:37-45`): avatar with the team ring · name (+ the staff role label) · «title · company · N جلسات مقدَّمة» · the level pill at the inline-end | `ui/card` `density="row"` with `href` → `/app/members/[id]` · `ui/avatar` (`teamColor`; ★ 44 px drawn — W19.8 R1) · the role label as text from `members.profile.role.*` · `ui/badge` for the level — ★ in its ramp colour (W19.8 R3) |
| D5 | «8 من 212 · تُحمَّل البقية عند التمرير» (`:46`) | text + a «more» `ui/link` carrying `?page=N+1` (§5.110); a client island `auto-more.tsx` follows it when it scrolls into view (`IntersectionObserver`, no timer) |
| — | The tab bar (`:49-55`) | the frame's — nothing of the shell in the page |

**`Profile.dc.html` (390) — `SCR-020`, member tier.**

| # | Region (artboard line) | Built from |
|---|---|---|
| P1 | Top row: back · «الأعضاء › مواهب» · share (`:18-23`) — the page's own phone top row (contract 1) | back: `ui/link` + `ChevronIcon direction="back"` (`ui/icons`), `aria-label` «رجوع إلى الأعضاء» → `/app/members`; breadcrumb: `<nav aria-label>` + `<ol>`, «الأعضاء» a `ui/link`, the company `<bdi>`; share: `ui/icon-button` (`share-profile.tsx`, client) |
| P2 | Header card: 84 px avatar with a 5 px ring · `h1` name · job title · company chip with dot + «عضو منذ …» · bio · interests (`:25-36`) | `ui/card` · `ui/avatar` (`teamColor`; ★ 84 px — R1) · `h1` in the display face, `<bdi>` · `ui/tag-chip` (company, dot — R2) · `members.profile.memberSince` · bio or `noBio` · `ui/tag-chip` per interest |
| P3 | Standing card: level medallion (star) · «المستوى» + the level name in its ramp colour · the points «1,240 نقطة» · the progress line «بقي 760 لـ «سفير المعرفة»» · three stats: **this month** · all time · streak (`:38-50`) | `ui/card` · `ui/badge-medallion` (`fill={{ level }}`, `glyph` `StarIcon filled`, `showName={false}`) · the name `text-level-N` · `ui/progress-bar` (`fill="accent"`, `decorative`; the line beside it is the text) · three `ui/stat`. ★ Not `ui/level-card` — N10. The heading «النقاط والمستوى» is `sr-only` on the phone (`id="standing"`, pinned) and drawn on desktop |
| P4 | «الشارات» + «5 من 14» · a row of 64 px medallions with names (`:52-61`) | `ui/section-header` (`count` is a number; «N من M» goes in `actions` as text) · `<ul>` of `ui/badge-medallion` `size="md"`, `overflow-x-auto` on the list |
| P5 | «الجلسات التي قدّمتها» + 6 · rows: poster thumb · title · «date · N حاضرًا · ★ 4.8» · «عرض الجلسات الأربع الأخرى» (`:63-68`) | `ui/section-header` (heading ★ a noun phrase — §5.109) · `ui/card` `row` + `CardMedia` `aspect="4/5"` (the poster, or its placeholder) · `ui/badge` `SessionStatusBadge` while not completed (N6) · the line from contract 4 · the «more» as `<details>` (N3) |
| P6 | «صور رفعتها» + 9 · a 3-up grid, the sixth tile «+4» (`:70-73`) | `ui/section-header` · a grid of `next/image` thumbnails from contract 3 · the «+N» tile as text (N2) |
| — | The tab bar (`:75-81`) | the frame's |

**`ProfileDesktop.dc.html` (1280 × 900).** The shell's bar and rail (`:13-35`, «الأعضاء» current) are the frame's. The
page owns 964 px (contract 1's `PageFrame` addition):

| # | Region (artboard line) | Built from |
|---|---|---|
| PD1 | Breadcrumb row «الأعضاء › مواهب» (`:37`) — no back, **no share** (N5) | the P1 breadcrumb, alone, from `lg` |
| PD2 | Header card: 104 px avatar · `h1` + job title on one baseline · company chip + «عضو منذ» + «· N جلسات مقدَّمة» · bio · interests · **at its end** the level medallion 52 px, the level name, «1,240 نقطة · #3 هذا الأسبوع · ×12» (`:38-49`) | P2's parts (★ 104 px — R1) + a `hidden lg:flex` summary block (`ui/badge-medallion` `size="sm"`). The phone's P3 top row is `lg:hidden`; each is `display:none` at the other width, so a screen reader meets one |
| PD3 | Body `grid-cols-[1fr_380px]`: the start column — «الجلسات …» two-up (`:52-60`), «صور رفعتها» six-up (`:62-65`) | P5, P6, the grids widened |
| PD4 | The end column (380): «الشارات» card, five 52 px discs, **no glyph** (`:67-76`); «النقاط والمستوى» card: the progress line and the three stats, **no level, no points** (`:77-85`) | P4 in a `ui/card` (`size="sm"`, glyph omitted at `lg`); P3 minus its top row |

★ **One DOM, the phone's order** — header, standing, badges, presented, photos, then the tier sections. Desktop places
them with `grid-template-areas` (badges above standing in the end column). The reading order on desktop is therefore
standing → badges → presented → photos, not the visual start-column-first; each is its own labelled `<section>`, so
nothing reads out of context. The alternative — desktop's order in the DOM, the phone re-ordered by CSS — puts the
phone, which is the acceptance, out of order instead.

**The tiers' additions** (not drawn): **self** — `members.profile.selfNote` + «عدّل ملفك» (`ui/button`'s `ButtonLink`, primary)
and «سجل نقاطي» (secondary) in a `ui/panel` under the header card; the six hub links (§5.122) as a `<ul>` of
`ui/link` rows in a `ui/card` after the photos, full width on desktop. **admin** — «للمشرفين» after every public
section, `border-t`, `ui/section-header` with `description={admin.note}`, a `<dl>` for the email, three `ui/stat`s and
the attended list (as today).

### W19.2 · Sync-1 Q2 — ★★ the kept-behaviour tables (`DEC-208`)

*Re-derived from `REQ-PRF-004`, `REQ-PRF-005`, `REQ-LDR-008`, `REQ-RAT-006`, A33, `03` §5.1b and the DAL as it stands —
then checked against what `sessions-member-profile.test.ts`, `wave7-sessions-profile.spec.ts`, `session.spec.ts:117`,
`wave14-platform-avatar.spec.ts:241` and `wave11-lead-a11y-sweep.spec.ts:214` pin. Read against the new files after
the create commit, row by row, and the result written here.*

**The profile — `SCR-020` (28 rows)**

| # | Behaviour | Where it lives after | Kept by |
|---|---|---|---|
| K1 | The route needs a session: every read goes through `sessionClient()` → `requireSession()`; a signed-out visitor is sent to sign-in with `?next=` by the proxy | `members.ts` (unchanged); `proxy.ts` (the lead's, untouched) | `REQ-AUT-005`, `REQ-NFR-004` |
| K2 | ★ **The tier is decided in the DAL, never in a component**: `getMemberProfileForViewer()` returns `self` / `member` / `admin`, and a field a tier may not see never leaves it | `members.ts` — kept, extended add-only (W19.5) | `REQ-PRF-004`, A33, `03` §5.1b, `REQ-UIX-069`, contract 7 |
| K3 | ★ **A moderator is the member tier**; `admin_member_profile()` is never called for one | `members.ts` (`tier` from `session.role === "admin"` only) | A33 («moderators see the member tier»), `REQ-PRF-004`; pinned `sessions-member-profile.test.ts:79-85`, `wave7…:180-188` |
| K4 | Someone else's row is read from `members_member_view` — the column set IS the member tier, `status = 'active'` | `getMemberProfile()` (unchanged) | `03` §5.1b, A33 |
| K5 | ★ `notFound()` for one answer to all: a malformed id, a missing one, another org's, a deactivated member's | `[id]/page.tsx` (`if (!view) notFound()`) ← `getMemberProfile()`'s `z.uuid()` and the view's predicate | `REQ-TEN-003`, `REQ-PRF-007`, `DEC-134` |
| K6 | ★ **Opted out: points and the all-time rank withheld from the member tier** (`standing: null`); the member and an admin get them | `members.ts` — the same predicate, unchanged | `DEC-141` r5, `REQ-LDR-008`; pinned `sessions-member-profile.test.ts:103-117` |
| K7 | ★ **Opted out: level, badges and streak still shown; the month's rank «—»; no progress line** — new, not kept: today the level goes with `standing` | `members.ts` — the new `level` field is filled for every tier; `progress` and `monthRank` are null whenever `standing` is | `DEC-213` §5.116, `REQ-UIX-069` |
| K8 | The all-time rank comes only from `all_time_leaderboard()` — the database decides who has one | `getMemberStanding()` (unchanged) | `REQ-LDR-008` (`0044`) |
| K9 | ★ The month's rank comes only from the latest monthly snapshot's row, through `boards_read` — an opted-out member's row is invisible to others | new `getMemberMonthRank()` in `leaderboards.ts` (add-only) | `REQ-LDR-008`, `DEC-213` §5.114 (`0027:487-491`) |
| K10 | ★ **The admin record comes from `admin_member_profile()`** — email, the attended count and list, no-shows, late cancellations — and only on the admin tier | `members.ts` (unchanged) → `components/members/admin-record.tsx` | A33 rules 2–3, `REQ-PRF-004`, `03` §5.1b; pinned `sessions-member-profile.test.ts:87-92`, `wave7…:174-177` |
| K11 | The admin section is headed «للمشرفين», says `admin.note`, and is absent for everyone else | `admin-record.tsx` | `REQ-PRF-004`; pinned `wave7…:150`, `:164`, `:174`, `:186` |
| K12 | ★ **No email on a member's or a self page** — the self tier links to `/app/me` for it | `[id]/page.tsx` renders none; the «البريد» hub link | A33; pinned `wave7…:151`, `:187`, `session.spec.ts:122` |
| K13 | ★ Attended sessions never on the member tier | only inside `admin-record.tsx` | A33 rule 3; pinned `wave7…:152` |
| K14 | The self tier says «هكذا يرى زملاؤك ملفك.» and offers «عدّل ملفك» → `/app/me` and «سجل نقاطي» → `/app/me/points` | `components/members/self-panel.tsx` | `REQ-PRF-004` (self-only fields live in `/app/me`); pinned `wave7…:153`, `:162-163` |
| K15 | The self tier's six sections are **links into the hub**, no new data on this page | `self-panel.tsx` — three of six have no destination today (N7) | `DEC-213` §5.122 |
| K16 | ★ **The avatar is our stored copy through `avatarHref()`**, never Google's URL; initials over the member-id tint otherwise | `getMemberProfile()` (unchanged), the new directory read, `ui/avatar` | `REQ-PRF-008`, `REQ-PRF-009`, `DEC-099`; pinned `wave14-platform-avatar.spec.ts:241-247` |
| K17 | ★ `<bdi>` on every interpolated name, title and code: the name, job title, company (chip and breadcrumb), bio, interests, badge names, level names, session titles, the attended titles, «عضو منذ»'s date; the email `<bdi dir="ltr">` | every component in `components/members/` | `REQ-INT-007` |
| K18 | Presented sessions: **accepted** presenter rows, only `published` / `in_progress` / `completed` / `archived`, newest first | contract 4 (`sessions.ts`) — the same predicate, **and a count that is a count** | A33 rule 3, `DEC-213` §5.120 |
| K19 | ★ A presented session's status is the one every surface shows, from its **days** (`sessionPhase(s, now)`, `PresentedSession.days`) — so between two days of a workshop it reads «التسجيل مفتوح» | `presented-sessions.tsx` — `SessionStatusBadge` while not completed (N6) | `REQ-UIX-003`, `DEC-151` r3 |
| K20 | Each presented row links to `/app/sessions/{id}`, its title the link's name | `presented-sessions.tsx` (`ui/card` `href`) | `REQ-PRF-004`; pinned `wave7…:148` |
| K21 | ★ **An average rating only on the self and admin tiers, from ≥ 3 ratings**; nothing for a colleague, a moderator included | `members.ts` calls `getPresenterAggregate()` only when `tier !== "member"`; `session_rating_aggregates` withholds below the org's minimum | A33 («aggregate ratings received»), `REQ-RAT-006`, `DEC-213` §5.115 — new behaviour |
| K22 | «عضو منذ» in the **org's** zone, not the server's | `members.ts` `timeZone` (unchanged) → `formatDate` | `REQ-INT-003` (`sessions.md` §36.1's finding) |
| K23 | Interests are the member's `member_interests` → `categories` | `members.ts` (unchanged) | `REQ-PRF-001` |
| K24 | A staff member carries a role label («مشرف المؤسسة», «مُنظِّم»); a member none | `profile-header.tsx`, `members.profile.role.*` | A33 tier 1 (`org_role` is in the view), `DEC-141` r4 |
| K25 | Empty states: `noBio`, `noBadges`, `noPresented` (and a new `noPhotos`) | each section | `REQ-UIX-005`'s sibling rule — never an empty box |
| K26 | A retired badge still held is still shown | `getMemberRecognition()` (unchanged); not counted in M (§5.121) | `REQ-REC-001`, `DEC-213` §5.121 |
| K27 | The streak is consecutive months ending this month or last (`currentStreak`) | `recognition.ts` (unchanged) | `REQ-REC-005`; pinned `sessions-member-profile.test.ts:119-129` |
| K28 | Western numerals everywhere (`formatNumber`, `formatDate`); the page never scrolls sideways at 390; one `h1`, exactly the name | every component; `[id]/page.tsx` | `REQ-INT-006`, `DEC-124`, `REQ-NFR-009`; pinned `wave7…:134`, `:144` |

Two kept from the tree's frame, not the page: the route's **error boundary** `members/error.tsx` is kept **untouched**
(it renders the shared `RouteBoundary`, `REQ-UIX-016`) and is not in the delete commit; the **skeleton rules** — no
text, no `getTranslations`, `aria-hidden` (`REQ-UIX-005`) — carry into both new `loading.tsx` files.

**The directory — `SCR-019` (9 rows; a new page, so these are what it inherits and what `REQ-PRF-005` asks)**

| # | Behaviour | Where | Kept by |
|---|---|---|---|
| KD1 | Session required; reads through `sessionClient()` | `listDirectory()` in `members.ts` | `REQ-NFR-004`, `REQ-AUT-005` |
| KD2 | ★ **Never a member of another org** — RLS (`members_read_org`) is the boundary; `.eq("org_id", session.orgId)` is defence in depth | `listDirectory()` | `REQ-PRF-005`, `REQ-TEN-003` |
| KD3 | ★ **Tier-1 fields only leave the DAL**: id, name, avatar href, job title, role, company (name, team colour), level (tier, name), the presented count — never email, points, a rank, the opt-out flag | `DirectoryMember` (W19.5); a unit test reads the JSON | `REQ-UIX-068`, A33, contract 7 |
| KD4 | ★ **Deactivated members excluded by default; an admin can show them, each marked** «معطَّل» (a `ui/badge`, neutral). A non-admin's `?inactive=1` is ignored by the DAL, which reads `members_member_view` for them. An anonymised member (no name) is left out even for an admin | `listDirectory()` | `REQ-PRF-005` |
| KD5 | Filter by company **and** by interest — the interests row only when the org has any interest recorded | `listDirectory()` returns `interests: []` → the row is not drawn | `REQ-PRF-005`, `DEC-213` §5.107 |
| KD6 | No rank and no points on a row, for anyone; the level badge shown, opted out or not | `DirectoryMember` carries neither | `REQ-UIX-068`, `DEC-213` §5.111 |
| KD7 | «الأنشط أولًا» = sessions presented, then the name; «الاسم» = the name (Arabic collation) | `listDirectory()` — ordering is the DAL's, the component draws | `DEC-213` §5.106 |
| KD8 | ★ Paging through the query string: `?page=N` renders the first N × 24 matches, so a cold URL and a no-JS reader see the same list | `listDirectory()` + `directory-query.ts` | `REQ-UIX-068`, `DEC-213` §5.110 |
| KD9 | The error boundary (kept, untouched) and a list skeleton of its own | `members/error.tsx`; new `members/loading.tsx` | `REQ-UIX-016`, `REQ-UIX-005`, `DEC-213` §5.113 |

### W19.3 · Sync-1 Q3 — `BadgeMedallionProps` (contract 2, for `ui/index.ts`)

```ts
/** The fills a badge medallion may take — the stickers' allowed set (`DEC-183` §2). Never a company's colour (that is
 *  `--team`), never a status's (`DEC-073`). */
export type MedallionFill = "accent" | "signal" | "cyan" | "gold" | "violet" | "bone";

/**
 * `scoring` · `badge-medallion.tsx` — REQ-UIX-064, DEC-213 §5.126. A disc with its 4 px drop and the name below it.
 * Reads no data and no catalogue; every string arrives as a prop. Static: no hover scale, no transition, no keyframe
 * of its own (`REQ-UIX-020`). Renders a `<span>`-rooted block, so the caller places it in an `<li>` or beside a name.
 */
export interface BadgeMedallionProps extends Styleable {
  /** The badge's name, drawn under the disc inside `<bdi>`; the block's accessible text. */
  name: string;
  /** A badge's own fill — or a level's ramp stop (`levels.sort_order`, clamped 1–5 exactly as `level-card`'s `rampStop`). */
  fill: MedallionFill | { level: number };
  /** Decorative and `aria-hidden`: an icon from `ui/icons`, chosen by the caller. Absent → a plain disc (the desktop shelf). */
  glyph?: ReactNode;
  /** `md` 64 px (the phone shelf), `sm` 52 px (the desktop shelf, the desktop header). Default `md`. */
  size?: "md" | "sm";
  /** `false` beside a level name already drawn: the name is not drawn and the whole block is `aria-hidden`. Default `true`. */
  showName?: boolean;
  /** Read after the name and never drawn (`sr-only`) — `badges.description`, which today's page shows and the artboard does not. */
  description?: string;
}
```

The 4 px drop is a deeper shade of the fill — W19.8 R5. Registry kind: `variant` (it composes nothing; tokens only).
Test: every fill, both sizes, `showName={false}` hides it from the accessibility tree, the glyph is `aria-hidden`,
`description` is `sr-only`, a `{ level: 9 }` clamps to stop 5, no `hover:scale`, no `animate-`, no `transition`; the
`-scope` test inside `PlayScope`; an RTL check (the name centred, no physical property). Demo: the eight seeded badges
at both sizes, the five level stops, a long name wrapping on two lines.

### W19.4 · Sync-1 Q4 — every state `M10b.md` names that is not drawn, and how it is built

**The directory**

| State | Built as |
|---|---|
| Empty search (§5) | `ui/empty-state` «لا أحد بهذا الاسم» ★ with `clearFilter` → the same URL without `q`; the filters stay (`REQ-UIX-022`) |
| A filter that matches nobody | `ui/empty-state` «لا أعضاء هنا بعد» ★ with «امسح عامل التصفية» |
| A member with no company | the company slot reads «بلا شركة» ★, muted; the ring is `teamColor={null}`'s neutral ring (§5.112) |
| Opted out | the level badge still shows; nothing on a row is a rank, for anyone (KD6) |
| An org with no interest recorded | the interests row is not rendered (§5.107) |
| An org with no company | the chip row is not rendered |
| Deactivated, for an admin (§5.108) | a chip «أظهر المعطَّلين» ★ (`?inactive=1`) on the admin's list only; each such row marked «معطَّل» ★ (`ui/badge`, neutral, with a word — not colour), and **not a link** (their profile is `notFound()` for everyone, K5) |
| A staff member | «مشرف المؤسسة» / «مُنظِّم» after the name (`members.profile.role.*`) |
| Zero sessions presented | the clause is omitted, not «0 جلسات» |
| Paged (§5.110) | `?page=N`, cumulative; «24 من 212» ★ + a «المزيد» ★ link to `?page=N+1` carrying every filter; `auto-more.tsx` follows it on scroll; absent when all are shown |
| Loading (§5.113) | `members/loading.tsx`: the title bar, the search pill, a chip row, eight row skeletons — no text, `aria-hidden` |
| Desktop | the same column; rows `lg:grid-cols-2` |

**The profile**

| State | Built as |
|---|---|
| ★ The member tier (drawn) | as W19.1 |
| ★ The self tier | + `self-panel.tsx`: the note, the two buttons; the six hub links (N7); the standing card shows the member's own figures, opted out or not (`REQ-LDR-008`) |
| ★ The admin tier | + `admin-record.tsx` after the public sections; points shown for an opted-out member; ranks «—» because the database withholds them (N8) |
| A moderator | the member tier exactly (K3) |
| ★ Opted out, seen by a colleague (§5.116) | points «—», the month's and the all-time rank «—» (`members.profile.none`), **no progress line**; the level, its medallion, the badges and the streak shown. The desktop header summary reads the same «—» |
| ★ The month's rank + the all-time rank (§5.114) | two `ui/stat`s: «هذا الشهر» ★ and «كل الأوقات» ★, each «#N» or «—» (no snapshot, no points this month, withheld). **No weekly figure anywhere** |
| The streak | `ui/stat` «السلسلة»: «×N» with an `sr-only` «N أشهر متتالية» (six forms); 0 → «—» |
| No level yet (before the first nightly evaluation) | no medallion, «لا مستوى بعد» ★, no progress line |
| The top level | the bar full, «أعلى مستوى» ★ in place of «بقي …» |
| ★ An average (§5.115) | on the self and admin tiers, on a completed row, «★ 4.8» when the aggregate exists (≥ the org's minimum, `REQ-RAT-006`); nothing below it; **never computed for a colleague** (K21) |
| A presented session not yet completed | `SessionStatusBadge` + its date, no attendance figure (N6) |
| A completed one | «date · N حاضرًا» — the count from `session_attendance_count()` via contract 4 (six forms: «حاضر واحد», «حاضران», «3 حاضرين», «11 حاضرًا», «100 حاضر») |
| More presented than shown | «عرض الجلسات الـN الأخرى» ★ — N3 |
| No sessions presented / no photos / no badges | `noPresented` / «لا صور بعد.» ★ / `noBadges`; «N من M» still shows M |
| ★ «N من M» badges (§5.121) | N = held badges not retired; M = the org's badges not retired; a held retired badge is drawn, not counted |
| ★ No level-up moment (§5.117) | the page imports nothing from `src/lib/ui/` and no `moment-*`; it never reads or writes `member_seen_marks`. A test walks the import graph (W19.6) |
| ★ Share (§5.118) | `share-profile.tsx`: `navigator.share({ url, title })` where it exists, else the clipboard and a toast «نُسخ رابط الملف» ★; the URL is the members-only page itself. Phone top row only (N5) |
| No company | breadcrumb «الأعضاء» alone; the chip «بلا شركة», muted, neutral ring |
| No bio / no interests | `noBio`, muted / the row absent |
| ★ Desktop at 964 px, 1fr / 380, no game rail | the frame's owned width (contract 1) + the page's grid (W19.1) |
| ★ No gendered verb (§5.109) | every string about another member is a noun phrase: «جلسات مقدَّمة» (the heading, on every tier), «6 جلسات مقدَّمة» (the row and the desktop summary — six forms), «جلسات الحضور» replacing `admin.attended`'s «الجلسات التي حضرها». A unit test fails on a list of third-person verb forms in `members.json` |
| Loading | `[id]/loading.tsx`: the header card, the standing card, a medallion row, three rows — no text, `aria-hidden` |
| Not found | `notFound()` (K5) |

### W19.5 · Sync-1 Q5 — what I build in the DAL, and what I need

**The directory — one add-only function in `members.ts`:**

```ts
export const DIRECTORY_PAGE_SIZE = 24;
export type DirectoryOrder = "active" | "name";

export interface DirectoryQuery {
  q?: string;            // name or job title; Arabic folded (hamzas, tā' marbūṭa, alif maqṣūra, tashkīl, tatwīl)
  companyId?: string;    // z.uuid()
  interestId?: string;   // z.uuid()
  order: DirectoryOrder; // default "active"
  page: number;          // ≥ 1, capped
  includeDeactivated?: boolean; // honoured for an admin only
}

/** A row — A33's tier 1 and nothing else. */
export interface DirectoryMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;                                   // avatarHref(), 96
  jobTitle: string | null;
  role: "admin" | "moderator" | "member";
  company: { id: string; name: string; teamColor: string | null } | null;
  level: { tier: number; name: string } | null;               // null until evaluated
  presentedCount: number;
  deactivated?: true;                                         // an admin's list only
}

export interface DirectoryPage {
  members: DirectoryMember[];      // the first page × size matches, in order
  matched: number;                 // «N من M»'s M
  total: number;                   // the title's count: every member this viewer may list
  companies: { id: string; name: string; teamColor: string | null }[]; // with ≥ 1 listed member
  interests: { id: string; name: string }[];                // [] → no row (§5.107)
  canShowDeactivated: boolean;
  page: number;
}

export async function listDirectory(locale: string, query: DirectoryQuery): Promise<DirectoryPage>;
```

**Assembled from reads every member already has, no SQL**: `members_member_view` (or, for an admin who asked,
`members` with `status`, inside the column grant), `companies` (`name, team_color`), `points_balances` →
`levels(sort_order, name)` (P1), `member_interests` → `categories` (P1), and **contract 4's org-wide count**. Filtered,
ordered and paged in the DAL — the component receives a page and decides nothing. ★ **The cost is one org's member
list per request** (the pilot has a few hundred); `REQ-NFR-008`'s budget is measured at sync 2. **The alternative,
named and not proposed:** a `security invoker` `directory_page(...)` function under `supabase/proposed/scoring/`,
which would make this a migration from `0168` with `REQ-UIX-068` — only if the lead prefers it or the budget fails.

**The profile — add-only fields on `MemberProfileView`** (the existing ones unchanged, so `sessions-member-profile`
keeps every assertion):

```ts
level: { tier: number; name: string } | null;                 // every tier, opted out or not (§5.116)
progress: { value: number; max: number; remaining: number; next: string | null } | null; // null when `standing` is
monthRank: number | null;                                     // null when `standing` is, or absent
company: { name: string; teamColor: string | null } | null;   // `companyName` stays
badgeCatalogue: number;                                       // M — badges not retired
presentedCount: number;                                       // contract 4's count
presentedRows: PresentedProfileRow[];                         // contract 4's rows, ≤ 4, + `average` on self/admin
photos: { count: number; items: UploadedPhoto[] };            // contract 3
```

With add-only helpers: `getMemberMonthRank(locale, memberId)` in `leaderboards.ts` (the latest monthly snapshot by
`taken_at`, as `getMonthlyStanding()` reads it — not `created_at`); `getMemberLevel(locale, memberId)` in `points.ts`
(the level, the next one, `levelProgress()` reused); `MemberBadge.retired` and `MemberBadge.metric` (from
`badges.rule->>'metric'`) and `countActiveBadges(locale)` in `recognition.ts`.

**From `content` — contract 3** (in `photos.ts`, add-only, the caller's client, RLS):

```ts
export interface UploadedPhoto { id: string; sessionId: string; thumbUrl: string; width: number | null; height: number | null }
export async function listPhotosUploadedBy(locale: string, memberId: string, opts?: { limit?: number }): Promise<{ count: number; photos: UploadedPhoto[] }>;
```
Visible photographs only (not hidden, not removed, not «أزلني»'d), newest first, **`count` a count and never
`photos.length`**, never a tagged photo. I ask for `limit` 5 (the sixth tile is «+N»). And one answer: **what a tile
opens** — N2.

**From `sessions` — contract 4** (in `sessions.ts`, add-only):

```ts
export interface PresentedRow extends PresentedSession { attendanceCount: number | null; posterUrl: string | null }
export async function getSessionsPresented(locale: string, memberId: string, opts?: { limit?: number }): Promise<{ count: number; rows: PresentedRow[] }>;
/** ★ For the directory: the same predicate, every member of the org at once. */
export async function countSessionsPresentedByMember(locale: string): Promise<Map<string, number>>;
```
`attendanceCount` from `session_attendance_count()` on completed rows, `null` otherwise. **No average in it** — I
call `getPresenterAggregate()` myself on the self and admin tiers only (§5.115). ★ The batch count is the one thing
beyond the brief's contract 4: without it the directory would count «presented» by a second predicate, and the row
and the profile could disagree. If `sessions` would rather not, I need the predicate exported (`PRESENTED_STATES`)
and a test that the two counts agree.

**From the lead — contract 1:** `PageFrame`'s owned width for the profile (964 px, no rail; the page draws its own
1fr / 380 inside); `ownsTopRow` for `/app/members` and `/app/members/[id]` below `lg`; «الأعضاء» current on both;
«حسابي» not current on another's profile. **Contract 2:** `BadgeMedallionProps` and `MedallionFill` in `ui/index.ts`,
the registry entry, the demo wired.

### W19.6 · Sync-1 Q6 — files, and every existing assertion that moves

**Commit 1 — the delete (`DEC-208`):** `src/app/[locale]/app/members/[id]/page.tsx`, `src/app/[locale]/app/members/loading.tsx`.
`members/error.tsx` is **kept** (K-note above).

**Commit 2 — the create:**
- `src/app/[locale]/app/members/{page,loading}.tsx` (new), `src/app/[locale]/app/members/[id]/{page,loading}.tsx`
- `src/components/members/` (new): `directory-query.ts` (parse/serialise, pure), `arabic-fold.ts` (pure),
  `directory-row.tsx`, `directory-filters.tsx`, `directory-sort.tsx` (client — the menu), `auto-more.tsx` (client),
  `profile-top-row.tsx`, `share-profile.tsx` (client), `profile-header.tsx`, `standing-card.tsx`, `badge-shelf.tsx`,
  `badge-look.ts` (N1's mapping, if ruled), `presented-sessions.tsx`, `uploaded-photos.tsx`, `self-panel.tsx`,
  `admin-record.tsx`
- `src/lib/dal/members.ts` (add-only), `leaderboards.ts`, `points.ts`, `recognition.ts` (add-only each)
- `src/messages/ar/members.json` then `en/members.json` — new keys; `presented` and `admin.attended` re-worded (§5.109)
- **Held for the lead's contract-2 commit:** `src/components/ui/badge-medallion.tsx`,
  `tests/components/ui/badge-medallion{,-scope}.test.tsx`, `src/app/[locale]/(dev)/ui/demos/badge-medallion.tsx`
- Tests (new): `tests/components/members/{directory,profile}-page.test.tsx`, `tests/unit/members-directory.test.ts`
  (tier-1 JSON, order, paging, fold, `?inactive=1` ignored for a non-admin, anonymised left out),
  `tests/unit/members-profile-standing.test.ts` (opt-out: level shown, points/ranks/progress null; the aggregate never
  read for `member`; count ≠ length), `tests/unit/members-no-moment.test.ts` (the import graph), `tests/unit/members-i18n.test.ts`
  (ar/en key parity, six forms, the gendered-verb list), `tests/e2e/wave19-scoring-directory.spec.ts` (+ a no-JS
  context: `?page=2` cold, the «more» href), `tests/e2e/wave19-scoring-profile.spec.ts` (three tiers, opted out, the
  average's absence for a colleague, 390 and 1280 captures `wave19-scoring-{directory,profile}-<state>-<390|1280>.png`)

**Assertions that move — named before the change:**

| File · line | Moves | Why |
|---|---|---|
| `tests/e2e/wave7-sessions-profile.spec.ts:145` `page.getByText("الشركة الأولى")` | ★ **selector** — scoped to the header card (`page.locator("#main [data-slot=profile-header]")`) | the company is now drawn twice (the breadcrumb and the chip): a page-wide `getByText` is a strict-mode violation. The expectation (visible) is unchanged |
| `wave7…:144` `toHaveText("ريم العتيبي")` | none expected | the `h1` holds only the name; the role label sits outside it |
| `wave7…:148` presented link | none | the row is one `ui/card` link named by its title |
| `wave7…:150-153`, `:162-164`, `:174-177`, `:186-187` | none | K11–K14 keep the headings, the hrefs and the absence of the email |
| `wave7…:147` `section:has(#standing)` contains «140» | none expected | the standing card's heading keeps `id="standing"`; at 1280 the points sit in the header summary and the card's `lg:hidden` top row still holds them in `textContent`. If the desktop project disagrees, it is a selector line here, not an expectation |
| `tests/unit/sessions-member-profile.test.ts` — every case | none expected | the design is add-only. ★ Risk: the stub answers `from()` with `[]` and `rpc()` with `null`; if contract 3 signs thumbnails through `supabase.storage`, the stub lacks it — that would be a **stub** line (the file changes, no assertion), written in the ledger in the same commit |
| `tests/e2e/session.spec.ts:117-123` (the lead's) | none | self tier, no email on the page (K12) |

### W19.7 · Sync-1 Q7 — disagreements `DEC-213` §5 does not list (not picked)

N1. **A badge's colour and glyph have no source.** `Profile.dc.html:55-59` and `ProfileDesktop.dc.html:71-75` give each
    badge its own fill (gold, coral, lime, cyan, violet) and, on the phone, a glyph; `badges` stores neither
    (`0027:147-159`), and an admin can create a badge (`REQ-REC-001`). §5.126 says «a badge's colour is the badge's»,
    which presumes one. Options: (a) derived on the screen from `rule->>'metric'` — a fixed vocabulary even for an
    admin's badge — with a fixed fallback; (b) two columns and an admin control — a migration and a console change.
    The primitive is the same either way; only `badge-look.ts` depends on the ruling.
N2. **«+4» photos and the photo tiles lead nowhere that exists.** `Profile.dc.html:72`, `ProfileDesktop.dc.html:64`.
    No route lists a member's photographs; the lightbox lives on the event page (`REQ-EVT-016`). Options: tiles link
    to their session's photos section; or nothing links and «+N» is a count. Contract 3's question.
N3. **«عرض الجلسات الأربع الأخرى» leads nowhere that exists.** `Profile.dc.html:67` (`href="#more"`); no route lists a
    member's presented sessions. Options: a `<details>` that reveals the rest in place (server-rendered, no JS, contract
    4 with no limit); or `/app/sessions?presenter=` if browse can filter by presenter (it cannot today). Desktop draws
    four and no «more» (`ProfileDesktop.dc.html:55-60`).
N4. ★ **The level ramp on the directory is not `01-tokens.md`'s.** `Directory.dc.html:39-40` paint «صاحب أثر» (level 3)
    `#9B7CFF` and `:41-43` «مشارِك نشِط» (level 2) `#D9DEE8`; the tokens are level 2 `#C8875A`, level 3 `#D9DEE8`
    (`01-tokens.md:71-72`, `globals.css:250-251`). Level 1 and 4 agree. `REQ-REC-003` keys the ramp on `sort_order`.
N5. **Share is drawn on the phone and not on desktop.** `Profile.dc.html:22` vs `ProfileDesktop.dc.html:37`. §5.118 says
    the artboard wins; the desktop artboard has no share. Default: phone top row only.
N6. **A live presented session is drawn as words, not the status badge.** `Profile.dc.html:65` «اليوم · جارية الآن» in
    the muted line; `REQ-UIX-003` asks a session's status to look the same on every surface, and the tree draws
    `SessionStatusBadge`. Default: the badge while not completed (K19), the artboard's line once completed.
N7. **Three of the self tier's six hub links have no destination.** §5.122 lists attended, the ledger, ratings given,
    no-shows, email, notification preferences. The tree has `/app/me/points` (the ledger), `/app/me` (the email),
    `/app/me/notifications` (preferences) — and **no page** for attended sessions, ratings given or no-shows. Options:
    the three that exist now and the rest with M10c; or a sentence where a link would be.
N8. ★ **An admin never sees an opted-out member's rank — the database refuses it**, while `DEC-141` r5 reads as if the
    admin does, and `sessions-member-profile.test.ts:113` pins `rank: 3` through a stub. `0044` and `boards_read`
    exempt only the member themself. Built as the database answers («—»); widening is a definer change, not this wave.
N9. **A gendered verb about a member already ships, in my own catalogue, outside this batch.** `scoring.json`
    `scoring.feed.badge` «نال» and `scoring.feed.streak` «أكمل» (wave 18's achievement items on `/app`). §5.109 is
    ruled for this batch; the feed is frozen. Written for the lead; not touched.
N10. **`M10b.md` §6 names `level-card` for the standing card; its face is not the drawn card.** `level-card`'s face is
    a centred caption, the level name and «يفتح لك»'s list of privileges (`level-card.tsx:83-112`); the drawn card is
    a medallion, the level name and the points in a row, a progress line and three stats (`Profile.dc.html:38-50`), and
    on a colleague's profile «يفتح لك» would address the wrong person. Options: compose the card (W19.1 P3, my
    default); or an add-only `layout` on `level-card` (mine to add, a type in `ui/index.ts`).

### W19.8 · Requests

| # | To | Request | Why |
|---|---|---|---|
| R1 | `content` (`avatar`) | add-only sizes **44, 84, 104** to `AvatarProps.size`, the ring 3 / 5 / 6 px | `Directory.dc.html:38`, `Profile.dc.html:27`, `ProfileDesktop.dc.html:40`; the set today is 24 … 160 without them. Fallback if refused: 40 / 96 / 96 |
| R2 | `content` (`tag-chip`) | add-only `teamColor?: TeamColor` — a 10 px dot from `--team`, before the label | the company chips (`Directory.dc.html:29-33`), the profile's company chip (`Profile.dc.html:31`) |
| R3 | `content` (`badge`) | add-only `level?: number` — the ramp's text colour on the raised fill, not a status tone | the row's level pill (`Directory.dc.html:38-45`); a level is not a status (`DEC-073`) |
| R4 | lead (`page-header`) | add-only `count?: string` — pre-formatted, drawn after the title, muted | «الأعضاء 212» (`Directory.dc.html:19`) |
| R5 | lead (`globals.css`) | a 4 px drop in a deeper shade for each medallion fill and each level stop — 11 tokens, or one rule | the drawn drops (`#B8901A`, `#C2472C`, `#78AD12`, `#1F8FB3`, `#6A4FC7`); only `--accent-deep` and `--signal-deep` exist |
| R6 | `sessions` | contract 4 as W19.5, with the org-wide batch count | the directory's order and its rows' «N جلسات مقدَّمة» |
| R7 | `content` | contract 3 as W19.5, and N2's answer | the photos section |
| R8 | lead | `/ar/app/members` added to the a11y sweep beside `/ar/app/members/${ids.admin}` (`wave11-lead-a11y-sweep.spec.ts:214`) | the new route |

**Order once approved and the frame is in:** the DAL (add-only, with its unit tests) → `badge-medallion` + its tests
and demo, held for the lead → the delete commit → the create commit → the e2e specs, run by the lead → the kept table
read against the new files and written here.

---

## Wave 19 — build (after `DEC-214`, the frame at `2ff7c946`)

### W19.B1 · `badge-medallion` — and the registry request (contract 2)

`src/components/ui/badge-medallion.tsx`, `tests/components/ui/badge-medallion{,-scope}.test.tsx`,
`src/app/[locale]/(dev)/ui/demos/badge-medallion.tsx` (`BadgeMedallionDemo`, `data-demo="badge-medallion"`). The
props are `ui/index.ts`'s as landed. The fill is set once as `--medallion` (a sticker constant by name, or
`--color-level-N` through `level-card`'s `rampStop`), and the drop is
`shadow-[0_4px_0_color-mix(in_oklab,var(--medallion)_62%,var(--bg))]` — `DEC-214` §4's rule, no token per fill.
Tests: 14 ✓ and 4 ✓.

**Registry request (the lead's file, `tests/unit/ui-playground.registry.ts`, under `scoring`'s):**

```ts
// wave 19 (DEC-213 §5.126, DEC-214 §4): born inside the scope — a disc on a sticker or level constant, its drop
// color-mix()ed with the ground; the name in the scope's heading colour.
"badge-medallion.tsx": tokens("badge-medallion", ["--color-sticker-", "--color-level-", "color-mix", "text-fg-heading", "rounded-pill"], "badge-medallion-scope.test.tsx"),
```

and `BadgeMedallionDemo` wired into the gallery. The floor moves to 57 with the fourth file, which is yours to count.

### W19.B2 · `level-card`'s `layout` — the type for `LevelCardProps` (N10, `DEC-214` §3)

```ts
/** wave 19 (DEC-214 §3, N10): the profile's standing card — a row of the level's medallion, the caption and the
 *  level's name, and a figure at the inline-end; the caller's content under it. Add-only. */
export interface LevelStanding {
  /** The figure at the inline-end — the balance, pre-formatted, or «—» when it is withheld. */
  figure: ReactNode;
  /** Under the figure — «نقطة» in its plural form. */
  unit: ReactNode;
  /** Decorative, in the level's medallion — the caller's glyph from `ui/icons`. */
  glyph?: ReactNode;
  /** Under the row — the progress line and the stats. */
  children?: ReactNode;
}

// on LevelCardProps:
  /** wave 19: `"faces"` (default) is every screen's card as it is; `"standing"` draws `level` only, as one row,
   *  with `standing`'s figure — no unlock list, no `reached`, no flip. */
  layout?: "faces" | "standing";
  /** With `layout="standing"`. */
  standing?: LevelStanding;
```

`unlocksLabel` and `noUnlocksLabel` stay required and are unread in `standing`, so no caller of `faces` changes.
Existing `level-card` tests are untouched; the new layout gets `tests/components/ui/level-card-standing.test.tsx`.

### W19.B3 · The commits

| sha | what |
|---|---|
| `720f04f7` | `ui/badge-medallion`, its two tests and its demo |
| `a57cf38b` | ★ `SCR-019`, the directory — a new page; `listDirectory()`; the segment's loading state is the list's and the profile's moves under `[id]/`; the profile's DAL fields, add-only |
| `d2d538e6` | ★ `SCR-020` deleted first (`DEC-208`) — `members/[id]/page.tsx` alone |
| `e96df6f4` | ★ `SCR-020` written from its two artboards; `level-card`'s standing layout; the two moved assertions |
| (this) | the two e2e specs and this note |

**The two assertions that moved — the ledger lines (the lead writes them in `STATUS.md`):**

| File · case | Moved | Why | Commit |
|---|---|---|---|
| `tests/unit/sessions-member-profile.test.ts` · «still shows them to the member themselves and to an admin» | ★ **expectation** (and the stub): the admin's `standing.rank` is `null`, not `3`; `all_time_leaderboard()`'s stub now omits an opted-out member for everyone but themselves | the stub handed the row to everyone and so pinned a rank `0044` never gives an admin — `DEC-214` §1, N8: the database wins | `e96df6f4` |
| `tests/e2e/wave7-sessions-profile.spec.ts` · «member tier: …» (`:145`) | **selector**: `getByText("الشركة الأولى")` → scoped to `#main [data-slot="profile-header"]` | the company is drawn twice now (the breadcrumb and the chip), a strict-mode violation page-wide; the expectation (visible) is unchanged | `e96df6f4` |

### W19.B4 · The kept table, read against the new files (`DEC-208` §2)

Every row of W19.2 read against `members/[id]/page.tsx` and `components/members/**` at `e96df6f4`:

- **K1 – K6, K8, K10, K16, K18, K23, K27** — in the DAL, unchanged or extended add-only; pinned by `sessions-member-profile`
  (all cases green, one expectation moved as N8 rules) and `members-profile-standing` (new, 9 ✓).
- **K5** — `notFound()` on a null view (`[id]/page.tsx`), case «a missing member is not-found».
- **K7, K9** — the level reaches every tier; `monthRank`, `progress` null when `standing` is; `members-profile-standing`.
- **K11 – K14** — `admin-record.tsx` («للمشرفين», `admin.note`, the email `dir="ltr"`); `self-panel.tsx` (the note,
  `/app/me`, `/app/me/points`); no email anywhere else; `profile-page` cases and the e2e specs.
- **K15** — three links, to pages that exist (N7); case «the self tier».
- **K17** — `<bdi>` on the name, title, company (chip and breadcrumb), bio, interests (`tag-chip`), badge and level
  names, session titles, attended titles, the date in «عضو منذ».
- **K19** — `SessionStatusBadge` with `sessionPhase(s, now)` from `days` on a row not yet held (N6).
- **K20** — each row a `ui/card` link to `/app/sessions/{id}`.
- **K21** — `getPresenterAggregate()` only when `tier !== "member"`; `members-profile-standing` proves the view is never
  queried for a colleague or a moderator.
- **K22** — «عضو منذ مارس 2026» in the org's zone (`profile-format.ts`), Western digits.
- **K24 – K26, K28** — the role beside the title; `noBio` / `noBadges` / `noPresented` / `noPhotos`; a held retired
  badge drawn and counted in neither N nor M; one `h1`, exactly the name; no sideways scroll (the e2e `capture`).
- The error boundary is untouched; both skeletons carry no text and no `getTranslations`.

**Nothing the table names was dropped.** Two changes the table records as new, not kept: the level shown to a
colleague for an opted-out member (§5.116), and the presented figure as the delivered count (§5.120, `DEC-214` §2).

**Tests at `e96df6f4`:** `members-directory` 17 ✓, `members-i18n` 11 ✓, `members-profile-standing` 9 ✓,
`members-no-moment` 3 ✓, `sessions-member-profile` 9 ✓, `directory-page` 12 ✓, `profile-page` 15 ✓,
`level-card-standing` 5 ✓, `badge-medallion` + `-scope` 18 ✓; `level-card`, `ui-playground`, `tokens-only`,
`no-raw-palette`, `scope-root`, `tests/components/scoring/**` green. `tsc` clean, eslint 0, `ui-lint` strict ✓.
★ **The full `npm test` could not be read on this machine**: four tracks running suites at once pushed unrelated
component cases past the 5 s timeout (`menu`, `stat`, `report-card`, …) — none touches a file of mine. The e2e specs
`wave19-scoring-{directory,profile}.spec.ts` are the lead's to run.

# Wave 20 — plan (M10c, `DEC-216`, `DEC-217`; planning only — nothing is built, nothing is deleted)

`SCR-022` my points, the hub's standing card and band, this week live, `ui/ledger-row` and `ui/podium` in **PR A**
(`wave-20a/the-hub`); `SCR-027` the boards and `SCR-028` the company race in **PR B** (`wave-20b/the-boards`).
Measured on `3156ad36`. Answers `STATUS.md`'s «Sync 1 — what the three plans must answer», items 1 – 7.

## 0 · ★ Published on day one — contracts 3 and 4, by name and type

Both live in my add-only DAL modules; nothing in them writes. **Computed, never stored; an absence is an absence,
never a zero; opt-out is the database's and the DAL's, never a component's** (contract 7, A33).

### Contract 4 — this week, live (`src/lib/dal/leaderboards.ts`, add-only; PR A)

```ts
/** The org's current week: Saturday to Friday in the org's own time zone (`DEC-217` §3.4), from `org_week()`. */
export interface WeekWindow {
  /** `YYYY-MM-DD` — the Saturday the week starts on. */
  start: string;
  /** `YYYY-MM-DD` — the Friday it ends on, inclusive («حتى الجمعة» is formatted from this, never typed). */
  end: string;
  /** Whole days left after today until `end`; 0 on the Friday itself. */
  daysLeft: number;
  /** `org_settings.time_zone` — what every date on these surfaces is formatted in. */
  timeZone: string;
}

/** The caller's standing this week — what `021`'s card, the desktop band and `027`'s rank card read. */
export interface WeekStanding {
  window: WeekWindow;
  /** null is an ABSENCE — `absence` says which. Never `{ rank: 0 }`. */
  rank: {
    rank: number;
    /** The caller's points this week — the live sum of their `points_ledger` rows in the window. */
    points: number;
    /** How many the week ranks for this viewer — «#4 من 38». */
    ranked: number;
    /** The visible member ranked directly above with STRICTLY more points (the gap is never 0); null at #1. */
    above: WeekNeighbour | null; // the existing type, unchanged: memberId, displayName, company, teamColor, rank, gap
  } | null;
  absence: "no_points" | null;
  /** `members.leaderboard_opt_out`: the rank is still theirs to see, and hidden from everyone else (REQ-LDR-008). */
  optedOut: boolean;
  /** Moment 5 on the week — `decideBoardMoment("weekly", …)`, keyed `rank:weekly:<start>:<seen>-<now>`.
   *  ★ PR A: always `{ occurrenceId: null, needsMark: false }` — `mark_board_seen()` learns the week in PR B
   *  (`DEC-217` §3.3), so until then nothing writes the weekly pair and nothing plays. */
  moment: BoardMoment;
}

/** Request-scoped: the card on `021`, the band and `027` ask once between them. */
export const getWeekStanding: (locale: string) => Promise<WeekStanding>;
```

`BoardKind` gains `"weekly"` and `BoardMark.period` carries the week's `start` — add-only to the union, used by PR B.

### Contract 3 — the standing (`src/components/hub/standing.tsx` + `getHubStanding()` in `src/lib/dal/points.ts`; PR A)

```ts
// src/lib/dal/points.ts (add-only)
export interface HubStanding {
  /** A33 tier 1, the caller's own row: never the email, never `members.avatar_url`. */
  member: {
    id: string;
    displayName: string;
    /** `avatarHref()`'s same-origin path or null — initials then (DEC-099, REQ-PRF-009). */
    avatarUrl: string | null;
    jobTitle: string | null;
    /** null: no company — the card says so in words, never an empty slot. */
    company: { name: string; teamColor: string | null } | null;
    /** `members.created_at`, ISO — «عضو منذ أغسطس 2026» on the band. */
    memberSince: string;
  };
  /** The live balance — `points_balances.total_points`. A 0 is a true figure and is drawn. */
  points: number;
  /** The level the nightly evaluation stored — null until it has run once. Never recomputed here. */
  level: { name: string; tier: number } | null;
  /** null at the top level, or with no level. `remaining` is `threshold − points`, floored at 0. */
  next: { name: string; threshold: number; remaining: number } | null;
  /** `levelProgress()`'s truth — the bar and its line state one fraction. */
  progress: { value: number; max: number } | null;
  /** Contract 4, whole. */
  week: WeekStanding;
  /** null: no enabled streak rule — the tile is not drawn. `months` may be 0 — on, none running: words. */
  streak: { months: number } | null;
  /** How many badges the caller holds — `member_badges`, retired badges included (REQ-REC-001). */
  badges: number;
  /** Moment 3 — `getPointsHead()`'s `completion`, the same occurrence `SCR-022` and the home decide. */
  completion: PointsHead["completion"];
  /** What the card acknowledges for moment 3 — `weekPointsMark()`: the level LAST SEEN passed through (`DEC-207` §1.3). */
  pointsMark: PointsMark;
  pointsNeedsMark: boolean;
}
export const getHubStanding: (locale: string) => Promise<HubStanding>; // request-scoped `cache()`

// src/components/hub/standing.tsx — one server component, two forms
export async function HubStanding(props: {
  locale: string;
  /** `card`: the phone's card on `021` (`Me.dc.html`), placed by `content`'s page.
   *  `band`: the desktop band (`HubDesktop.dc.html`), placed by the lead's `me/layout.tsx`. */
  form: "card" | "band";
  /** The placing owner's visibility class — `lg:hidden` for the card, `hidden lg:block` for the band. */
  className?: string;
}): Promise<JSX.Element>;
```

- **It reads its own data** (`getHubStanding()` → `sessionClient()` → `requireSession()`), so the layout passes
  nothing and checks nothing. It binds its own two Server Actions from `src/components/hub/actions.ts`
  (`acknowledgeHubPoints`, `acknowledgeHubWeek`, both `"use server"`, both bound on the server — `DEC-159`).
- **Moments 3 and 5 through the existing keying**: it wraps its figures in `MomentWeek` (`moment-week.tsx`,
  unchanged), whose displayed-copy gate already handles two copies in one document — on `/app/me` at `lg` the
  card is in the HTML and not displayed, the band is displayed, and only the displayed one claims.
- ★ **For the lead's layout**: a layout does not re-render on navigation, so the band's figures are those of the
  first hub page the member arrived on until they leave the hub. Moment 3 is decided once per arrival in the hub,
  not per tab. I think that is right (the strip is one place); it is written so it is not a surprise.
- ★ **The band draws the name as text, not as a heading.** `HubDesktop.dc.html` draws it as an `h1` and «نقاطي»
  as an `h2` — §7 below, line 34, not picked.

## 1 · Sync-1 Q1 — the regions, in each artboard's order, and the primitive each is built from

### `SCR-022` phone — `Points.dc.html` (390 × 1860)

| # | Region (artboard order) | Built from | Data |
|---|---|---|---|
| 1 | Top row: back to `/app/me`, `h1` «نقاطي» | the lead's frame (contract 1): the page renders the frame's top-row component, nothing of its own | — |
| 2 | The hub strip, «نقاطي» current | the lead's `HubStrip` (phone form), placed as the frame says | — |
| 3 | Head card: «رصيدك» + balance in display 56 accent · «مستواك» + level name + «"<next>" بعد N» · the bar | `card` · the balance a `<strong>` (pinned by `points.spec.ts:161`) · `progress-bar` `fill="accent" decorative` with the line beside it · `MomentPointsHead`'s moment 3 (and 4 — ★ D26) | `getPointsHead()`, unchanged |
| 4 | Filters: «كل الجلسات ▾» · «كل الشهور ▾» · «14 سطرًا» at the inline-end | a GET `<form>` with two `select`s (`sessions'`, held by the lead), auto-submitted on change by a small client island; the submit button inside `<noscript>` — the no-JS path stays | `getPointsLedger()` (new, §5.2) |
| 5 | The ledger, grouped by month: `section-header` per month (the org's month, in its time zone), then rows | `section-header` · **`ledger-row`** (new) in a `<ul>` inside `#history` | ditto |
| 5a | an award | `ledger-row` `kind="entry"` — `+50` accent, the rule's own reason, «session title · time»; the title is the link | ledger row |
| 5b | the cap row — dashed, `0`, «الحد: 3 تعليقات لكل جلسة · time» | `ledger-row` `kind="cap"` | ★ an explanation, §5.3 — never a ledger row |
| 5c | the manual adjustment — «تعديل يدوي من الإدارة», «"<reason>" — <admin>» | `ledger-row` `kind="entry"` with the manual title | ledger row + `actor_id`'s display name |
| 5d | the reversal pair — `−50` coral **with** its minus, «إلغاء نقاط سابقة», its fixed reason; beneath, the reversed row struck at 70 % | `ledger-row` `kind="reversal"` with `reversed` | the pair through `source_id` (`0149`) |
| 5e | (not drawn) the missed-day notice of `REQ-SES-017` | `ledger-row` `kind="notice"` — no figure | `missed_attendance_days()`, unchanged |
| 6 | «المزيد» | a plain link `?rows=<n+50>` keeping the filters | — |
| 7 | `h2` «ماذا يمنحك نقاطًا؟», one list card: name · cap wording · value; a disabled rule muted with «غير مُفعَّل حاليًا» and `0` | `section-header` (no description — the intro line goes, `REQ-UIX-080`) · one `card` holding a `<ul>`, `id="catalogue"` kept | `scoring_rules`, live |
| 8 | the tab bar | the shell's | — |

### `SCR-022` desktop — `HubDesktop.dc.html` (1280)

| # | Region | Built from |
|---|---|---|
| 1 | Shell bar, navigation rail, **no game rail** | the lead's |
| 2 | The standing band | **contract 3**, `HubStanding form="band"`, placed by the lead's layout |
| 3 | The strip under a rule, seven links | the lead's |
| 4 | `h2`-looking «نقاطي» (★ D34) · «الجلسة: الكل ▾» · «الشهر: الكل ▾» · «تنزيل CSV» (★ D27) | the same GET form as the phone's, laid out as a toolbar from `lg` |
| 5 | The table: التاريخ · النقاط · السبب · الجلسة | `data-table` (`console`'s, as built; no sort, no selection), `id="history-table"` — **outside `#history`**, so no phone locator ever meets two copies |
| 5a | a reversal: the reversing row, then the reversed row struck and muted — and, per M10c §2, «(يلغي سطر <date>)» (★ D35) | two table rows, adjacent |
| 5b | the cap row muted, `0` | one table row |
| 6 | «9 من 14 سطرًا» · «عرض الأقدم» | text + the same `?rows=` link |

The head card (row 3 of the phone) is `lg:hidden`: the band carries the balance from `lg`, as the board draws.

### The standing card — `Me.dc.html` lines 1 – 4 of the card (contract 3, `form="card"`)

| # | Region | Built from |
|---|---|---|
| 1 | 64 px avatar with the team ring · name · title · company in team colour · «هكذا يراك زملاؤك» → `/app/members/<self>` | `avatar` (★ size 64 is a request, §8) · text · `link` |
| 2 | Level medallion · «مستواك» · level name in its ramp colour · `730` «نقطة» at the inline-end | `level-card` `layout="standing"` (wave 19's) — ★ with an add-only `frame="none"` so it does not draw a second panel inside the card (§3.3) |
| 3 | The bar · «"<next>" بعد N» | `progress-bar` `decorative` + the line (one fraction, `levelProgress()`) |
| 4 | Three tiles: «هذا الأسبوع» `#4` → `/app/leaderboards` · «السلسلة» `×8` · «الشارات» `6` | `stat` × 3, the first with `href` |

The whole card is one `card`, `MomentWeek` around it (moments 3 and 5). **The band** (`HubDesktop.dc.html`): 84 px
avatar, name, «title · company · عضو منذ <month year>», the medallion row with «730 نقطة · "<next>" بعد N», the same
three tiles — the same component, `form="band"`.

### `SCR-027` — `Board.dc.html` (PR B)

| # | Region | Built from |
|---|---|---|
| 1 | `h1` «لوحات الصدارة» · «حتى الجمعة» (the window's end, this week only) · the category `menu` in the header (★ D30 — not drawn) | the page's own top row (contract 1) · text · `menu` (`console`'s, as built, items as links) |
| 2 | Window chips: هذا الأسبوع ★ · هذا الشهر · كل الأوقات · سباق الشركات | `tabs` in navigation mode (as today — M10c §9 lists it; the e2e suites pin `role="tab"`). If its look is not the chips', that is a request to the lead, not a new control |
| 3 | «ترتيبك» card, accent border, always visible: rank in display 44 · ▲N since your last visit · «فوقك: <name> · +N» · the window's points | `card` · `MomentWeek` for moment 5 (`completion: null`) — the `rank` and `rise` slots it already animates |
| 4 | Podium 2 · 1 · 3, cup over #1, ringed avatars, blocks with rank and points | **`podium`** (new) — the `cup` object from `ui/objects/` (imported, the lead's) |
| 5 | Rows 4 – 10: rank · ringed avatar · name · company · points · own row «أنت» + accent border in place | `rank-row`, as built |
| 6 | The own row pinned after the list when outside the range | `rank-row` under the existing «ترتيبك» heading's successor (`leaderboards.selfHeading`) |
| 7 | «عرض 11 إلى 50 · N عضوًا» | a link `?board=…&rows=50` |
| 8 | `monthly.provisional` / `final` as a chip on the month tab only | `badge` |

### `SCR-028` — `Companies.dc.html` (PR B)

| # | Region | Built from |
|---|---|---|
| 1 | Same header and chips, «سباق الشركات» current | as `027` |
| 2 | Cup card: cup object · «كأس الربع N» · «الجولة · days» · finality (★ D31) | `card` + `cup` |
| 3 | «الترتيب حسبه: …» chip with its check · «takenAt» | `tag-chip` (static) · text |
| 4 | Column headers: # · الشركة · «لكل عضو ✓» · المجموع | a visible header row (presentation; each row still says its metric to a screen reader) |
| 5 | A row per company: rank · team ring + name + «فريقك» + «N نشطًا» · the bar under the name from the inline-start · the ranking metric in display face · the other muted | `race-bar` — ★ with an add-only `layout="grid"` (§3.3) |
| 6 | The own company: accent border | `race-bar`'s `ownLabel` |
| 7 | «كيف حصلت شركتك على نقاطها» card: «رصيد <bdi>company</bdi> …: N نقطة» · one row per `source.*` with its `meta.*` line (★ D44) · «ماذا يمنح شركتك نقاطًا؟» | `card` · `ledger-row` `kind="entry"` (the same signed-amount form) · `link` to `#company-catalogue` |
| 8 | (below the fold) the company catalogue | `card` + `<ul>`, kept from today |

## 2 · Sync-1 Q2 — ★★ the kept-behaviour tables (`DEC-208`), re-derived from the `REQ-*` and the DAL

Read from `me/points/page.tsx`, `points-{head,history-list,catalogue}.tsx`, `lib/dal/points.ts`,
`leaderboards/page.tsx`, `{member,company}-board.tsx`, `company-points-breakdown.tsx`, `lib/dal/leaderboards.ts`,
`moment-{rank,points-head,week}.tsx`, `use-seen-moment.ts` and their suites. Each row is read back against the new
file after the create commit.

### 2.1 `SCR-022`

| # | Behaviour today | Where it lives after | Kept by |
|---|---|---|---|
| 1 | The data is read at the data: `sessionClient(locale)` → `requireSession()`; no layout check | `getPointsLedger()` and `getPointsHead()`, same entry | CLAUDE «Data access» 3 · `REQ-NFR-001` |
| 2 | Only the caller's rows: `.eq("member_id", session.memberId)` — necessary, because `POL-points_ledger.select` lets an **admin** read everyone's | kept in every new ledger query, and in `capped_award_explanations()` by `auth_member_id()` | `REQ-PTS-003` (A33: no one else's ledger) |
| 3 | Every row shows **its own reason** in `<bdi>`, never a label in its place | `ledger-row`'s `title`, the row's `reason` | `REQ-PTS-003`, `05` §8 |
| 4 | The signed amount in `<bdi dir="ltr">`, sign first, Western digits (`formatNumber`) | `ledger-row` draws it; the caller formats it with «+» / «−» | `09` SCR-022 · `DEC-124` · `REQ-NFR-007` |
| 5 | A reversal: «إلغاء نقاط سابقة» + its **fixed** reason «أُلغي تسجيل الحضور»; the admin's free text never shown | the reversal card's title and meta — ★ the artboard draws a free-text reason (D43); the test at `points.spec.ts:289` keeps it off | `REQ-CHK-017` · wave 7 contract 3 |
| 6 | A manual adjustment: «تعديل يدوي من الإدارة» + its reason | kept, and the **admin's name** added from `actor_id` (null name → no name, never «undefined») | `REQ-PTS-009` · `REQ-UIX-072` |
| 7 | A link from the row to `/app/sessions/<id>` | the session title IS the link (artboard); its accessible name becomes the title (§6, a moved selector) | `REQ-PTS-003` («a link to the session») |
| 8 | ★ The missed-day notice: interleaved at the session's completion, no amount, the days in the locale's conjunction, held to the same filters | `ledger-row` `kind="notice"`, the same DTO (`MissedAttendance`), the same filter rule | `REQ-SES-017` |
| 9 | The empty state names the next action (browse) — and a notice beats it | `empty-state` «لا نقاط بعد» + the catalogue below (M10c §2) | `REQ-UIX-012` |
| 10 | Filters by session and month are plain GET params — a shareable URL; the session options come from an **unfiltered** pass; «مسح التصفية» when filtered | kept; ★ the filtered-empty state added («لا سطور في هذه التصفية» + `filters.clear`) | `05` §8 · `REQ-UIX-012` |
| 11 | ★ **A defect found here**: «the org's own month» is computed in **UTC** (`points.ts:85-94`), and the 12 options are UTC dates labelled in the org's zone | the new read computes the month's bounds in `org_settings.time_zone`; `monthRange()` stays for nothing else to break | `REQ-LDR-002`'s rule for a period, applied to the member's own filter · D41 |
| 12 | The catalogue is read live from `scoring_rules`; zero-point rules hidden; the cap in its plural forms; a disabled rule marked; `id="catalogue"` | kept; a disabled rule drawn with `0` (D37) | `REQ-PTS-014` · `05` §8 |
| 13 | The balance from `points_balances`, the page's one `<strong>` | the head card's figure; the band's is **not** a `<strong>` | `REQ-PTS-003` · `points.spec.ts:161` |
| 14 | Moment 3: the balance counts from the last-seen figure, «+N» and its words, the bar fills; the mark bound on the server; a hard load is static | `MomentPointsHead`, unchanged, around the new head card | `REQ-UIX-047` · `DEC-195` · `DEC-197` §5 |
| 15 | ★★ **Moment 4: the level card turns** | **no surface in the artboard** — D26, the first ruling I need | `REQ-UIX-047` |
| 16 | The streak and its flame on the head | not on `022`'s head (the artboard dropped it); it lives on the standing card on `021` and the band, so the hub still shows it | `REQ-REC-005` |
| 17 | The bar and its line state one fraction | `levelProgress()`, unchanged | the lead's 390 px finding (wave 16) |
| 18 | `#history` scopes the phone list (two suites rely on it) | kept on the phone list; the desktop table is `#history-table` | evidence |
| 19 | No row draws a running total | kept | `points-history-list.test.tsx:135` |
| 20 | `presenterNet()` / `getPresenterAward()` — the event page's | untouched in the DAL (add-only module) | `REQ-PTS-015` |
| 21 | The page wraps nothing in a scope and renders nothing of the shell | kept — the frame is the lead's | `DEC-199` §1.3 · contract 1 |

### 2.2 The standing card and band (new — what they must carry)

| # | Behaviour | Kept by |
|---|---|---|
| 1 | The figures are the DAL's: the stored level, the live balance, `levelProgress()`, the streak in months (`currentStreak()`), the week from contract 4 | contract 7 · `DEC-197` §7 |
| 2 | A missing rank, a streak rule off, no level: words or absence, never 0 | `REQ-UIX-055`'s rule, `week-hud`'s precedent |
| 3 | An opted-out member sees their own rank, labelled as hidden from others | `REQ-LDR-008` |
| 4 | Avatar through `avatarHref()`, initials otherwise; no email, no `avatar_url` | `DEC-099` · A33 |
| 5 | Moments 3 and 5 through `MomentWeek`; the level passed through (`weekPointsMark()`) so the level cursor moves only where moment 4 plays | `DEC-207` §1.3 · `DEC-216` §5.10 |
| 6 | No level-up here (it is not a sixth surface for moment 4 unless D26 rules so) | `DEC-213` §5.117 |

### 2.3 `SCR-027` (PR B)

| # | Behaviour today | Where it lives after | Kept by |
|---|---|---|---|
| 1 | Each board a linked tab `?board=…`, server-rendered, shareable | four windows: default (no param) = **this week**; `?board=month`, `?board=all` (★ new — all-time was the default), `?board=companies` | `REQ-UIX-078` · `DEC-141` r6 |
| 2 | All-time live from `all_time_leaderboard()`; opt-out in the database | unchanged | `REQ-LDR-001`, `REQ-LDR-008` (`0044`) |
| 3 | Month and company from the newest snapshot by `taken_at`, provisional / final | unchanged; the chip on the month tab only | `REQ-LDR-006` |
| 4 | ★ The own rank always visible; the own row below the range under «ترتيبك» | the rank card (always) **and** the pinned own row | `REQ-LDR-001` |
| 5 | The own row says «أنت» and is outlined | `rank-row`'s `selfLabel`; on the podium, the place's `selfLabel` | `REQ-UIX-037` |
| 6 | A name links to `/app/members/<id>` | rows and podium places | `09` |
| 7 | Initials in the team ring, never a photograph | `rank-row` takes no `src`; `podium` takes none either | `DEC-099` · `DEC-183` §3 |
| 8 | An empty board names the next action | `empty-state` `leaderboards.empty` + `emptyAction` | `REQ-UIX-012` |
| 9 | Moment 5: only a rise plays; a fall is static; the arrow never pulses; bound acknowledgement; a hard load static | the rank card (`MomentWeek`), per window kind — ★ whether the list's FLIP also stays is D42 | `REQ-UIX-048` · `DEC-197` §2, §5 |
| 10 | 20 rows shown | 3 on the podium, 4 – 10 as rows, «عرض 11 إلى 50» | `Board.dc.html` |
| 11 | The section ids `#all-time`, `#monthly` | kept; `#weekly` added | evidence |
| 12 | `description` «… live» under the all-time title | ★ removed — explainer copy (`REQ-UIX-080`) | — |

### 2.4 `SCR-028` (PR B)

| # | Behaviour today | Where it lives after | Kept by |
|---|---|---|---|
| 1 | Both metrics on every row, the ranking one first and marked «الترتيب حسبه» | visible column headers + the chip; each row still says its metric (sr text) | `REQ-LDR-004`, `REQ-LDR-005` |
| 2 | Bars from the inline-start, `companyFractions()` over all companies; a negative draws an empty track | `race-bar`, unchanged maths | `09` · `0081` |
| 3 | The own company «فريقك» | `ownLabel` + the accent border | `REQ-UIX-038` |
| 4 | Signed totals and per-member figures in `<bdi dir="ltr">` | kept | `boards.test.tsx:113-127` |
| 5 | `takenAt` and provisional / final | kept, in the chip row and the cup card | `REQ-LDR-006` |
| 6 | Moment 5 on the company: the own bar grows by `scaleX` from where it was seen, after a swap if it rose | `MomentRank`, unchanged, around the list | `REQ-UIX-048` |
| 7 | The breakdown: own company only, `#company-breakdown`, the heading, the balance with the company in `<bdi>`, the enabled company rules, every row signed, the meta lines | kept — **its rows' form is D44** | `notes/scoring.md` «Company points rules» · `REQ-PTS-003` extended |
| 8 | No company → the breakdown absent | ★ now the «اختر شركتك» prompt → `/app/me` (M10c §8) | `REQ-UIX-079` |
| 9 | «company.asOf» line under the board | ★ removed — explainer copy | `REQ-UIX-080` |

## 3 · Sync-1 Q3 — the two new primitives' props (contract 2, for `ui/index.ts`)

### 3.1 `ledger-row`

```ts
/**
 * `scoring` · `ledger-row.tsx` — one line of a points history (REQ-UIX-081). Reads no data and formats no number.
 * The figure is the caller's string, drawn in `<bdi dir="ltr">` so the sign sits at the numeral's inline-start;
 * a loss is coral AND carries its minus — colour is never the only mark (REQ-NFR-007).
 */
export interface LedgerRowProps extends Styleable {
  /** `entry` (default) · `cap` — dashed, muted, the figure `0` · `reversal` — the loss, with `reversed` beneath it
   *  struck at 70 % inside the same row · `notice` — an explanation with NO figure (`REQ-SES-017`'s missed day). */
  kind?: "entry" | "cap" | "reversal" | "notice";
  /** Sign only, never drawn: picks the tone. Required unless `kind="notice"`. */
  value?: number;
  /** Drawn, formatted by the caller WITH its sign — «+50», «−50», «0». Required unless `kind="notice"`. */
  figure?: string;
  /** What a screen reader hears for the figure — «50 نقطة», «خُصمت 50 نقطة». */
  figureLabel?: string;
  /** The row's own reason; the caller isolates interpolations. */
  title: ReactNode;
  /** «session · time» — may hold a link. */
  meta?: ReactNode;
  /** `kind="reversal"`: the row it reverses. */
  reversed?: { figure: string; figureLabel: string; title: ReactNode; meta?: ReactNode } | null;
  /** `li` (default, inside the caller's `<ul>`) or `div`. */
  as?: "li" | "div";
}
```

### 3.2 `podium`

```ts
/** One place on the podium. */
export interface PodiumPlace {
  rank: number;
  /** «المركز 1». */
  rankLabel: string;
  /** The avatar's tint key — never the name. */
  memberId: string;
  displayName: string;
  company: string | null;
  teamColor: TeamColor;
  /** Formatted by the caller. */
  points: string;
  pointsLabel: string;
  href?: string;
  /** The viewer's own place — «أنت», in words, outlined. */
  selfLabel?: string | null;
}

/**
 * `scoring` · `podium.tsx` — the first three, drawn second · first · third from the inline-start, the cup over
 * first, blocks from the ramp's neutrals (level-3 silver, gold, level-2 bronze). STATIC: no keyframe, no transition,
 * no hover scale (`DEC-216` §5.10). DOM order is rank order; the visual order is CSS `order`. Initials only — no
 * `src`, like `rank-row`. Below its collapse width (★ D29), and under reduced motion as `REQ-UIX-081` says, it
 * renders the same places as `rank-row`s.
 */
export interface PodiumProps extends Styleable {
  /** The group's accessible name — «المراكز الأولى». */
  label: string;
  /** In rank order, one to three. A block's height follows its POSITION; the number on it is the rank, so a tie
   *  draws two «1»s on the first two blocks. */
  places: readonly PodiumPlace[];
}
```

### 3.3 Add-only props on my own primitives (types are the lead's file — a request each)

- `level-card`: `standing.frame?: "panel" | "none"` (default `panel`) — the hub card holds the level row inside its
  own card, and a second panel would be a card in a card.
- `race-bar`: `layout?: "stacked" | "inline" | "grid"` gains `grid` — rank · (ring, name, labels, the bar under the
  name) · the ranking value · the secondary value, the metric's words `sr-only` per row; `Companies.dc.html`'s row.

## 4 · Sync-1 Q4 — every state `M10c.md` names, drawn or not, and how it is built

| Screen | State | How |
|---|---|---|
| `022` | empty (drawn as words) | `empty-state` `points.empty` + browse, then the catalogue |
| `022` | filtered empty ★ | `empty-state` «لا سطور في هذه التصفية» (new, `scoring.points.filteredEmpty`) + `filters.clear` as `clearFilter` |
| `022` | only notices (missed day, cap) and no row | the list, not the empty state (kept, `points-history-days.test.tsx:95`) |
| `022` | a reversal whose reversed row is outside the page or the filter | the reversed row fetched by id and drawn inside the card — every ledger row is drawn exactly once (a unit test counts ids) |
| `022` | a reversal whose `source_id` names no row of the caller | drawn alone (no write path produces it today — `0032`, `0059`, `0087`, `0102`, `0105`, `0113`, `0148`, `0149` all point at a ledger row) |
| `022` | manual adjustment, admin anonymised / no name | the reason without a name |
| `022` | no level yet | `points.head.level.none`, no bar |
| `022` | top level | the bar full, `points.head.level.top` |
| `022` | the cap reached but nothing capped | nothing (no explanation without a capped item) |
| standing | no company · no streak rule · streak 0 · no week points · opted out · no level | in words in place; the tile not drawn for a streak rule off |
| `027` | empty window | `empty-state` |
| `027` | own rank inside 1 – 3 / 4 – 10 / outside | marked on the podium / in place / pinned below |
| `027` | not ranked this window | the rank card in words (`leaderboards.rankCard.absent`) — the card stays (always visible) |
| `027` | opted out | the board and the own row privately, «لا يراك الآخرون» on the card (★ D38) |
| `027` | first visit to a window | no movement (`REQ-UIX-078`) |
| `027` | fewer than three ranked | one or two blocks; zero → empty |
| `028` | no company | the prompt to choose one in place of the breakdown |
| `028` | below the minimum | ★ D32 |
| `028` | no company snapshot yet | `empty-state` |

## 5 · The SQL and the reads (sketches; `supabase/proposed/scoring/`, functions only)

### 5.1 The week (contract 4) — `w20_0001_week.sql`, PR A

```sql
-- org_week(): the org's week, Saturday to Friday, in its own time zone (DEC-217 §3.4). Invoker: it reads only
-- `org_settings` (org-readable) and computes. `p_at` exists for the boundary tests.
create function public.org_week(p_at timestamptz default now())
returns table (week_start date, week_end date, starts_at timestamptz, ends_at timestamptz, time_zone text)
language sql stable security invoker set search_path = '' as $$
  with tz as (
    select coalesce((select s.time_zone from public.org_settings s where s.org_id = public.auth_org_id()),
                    'Asia/Riyadh') as name
  ), w as (
    -- extract(dow): Sunday 0 … Saturday 6, so the days since the last Saturday are (dow + 1) % 7.
    select tz.name, d - ((extract(dow from d)::int + 1) % 7) as start_day
      from tz, lateral (select (p_at at time zone tz.name)::date as d) today
  )
  select w.start_day, w.start_day + 6,
         w.start_day::timestamp at time zone w.name,
         (w.start_day + 7)::timestamp at time zone w.name,
         w.name
    from w
$$;

-- weekly_leaderboard(): the week summed LIVE from points_ledger (DEC-216 §2.2) — no enum value, no snapshot, no job.
-- Definer because points_ledger's RLS is self-or-admin, exactly as all_time_leaderboard() (0044) is. It mirrors
-- 0044's rule: active members only, an opted-out member absent from everyone's call but their own, the rank
-- computed over what that caller may see (★ D40), and the snapshot's rule that a net of 0 or less is not ranked.
create function public.weekly_leaderboard()
returns table (member_id uuid, rank bigint, points int)
language sql stable security definer set search_path = '' as $$
  with w as (select starts_at, ends_at from public.org_week()),
  totals as (
    select pl.member_id, sum(pl.amount)::int as total
      from public.points_ledger pl, w
     where pl.org_id = public.auth_org_id()
       and pl.occurred_at >= w.starts_at and pl.occurred_at < w.ends_at
     group by pl.member_id
    having sum(pl.amount) > 0
  )
  select t.member_id, rank() over (order by t.total desc), t.total
    from totals t
    join public.members m on m.id = t.member_id
   where m.status = 'active'
     and (not m.leaderboard_opt_out or m.id = public.auth_member_id())
   order by 2, t.member_id
$$;
revoke execute on function public.org_week(timestamptz), public.weekly_leaderboard() from public, anon;
grant  execute on function public.org_week(timestamptz), public.weekly_leaderboard() to authenticated;
```

`getWeekStanding()` calls both, takes the caller's row, the row above with strictly more points, and the count;
`getWeeklyBoard()` (PR B) adds names and companies the way `getLeaderboards()` does. Tests in a new
`tests/rls/scoring-week-live.test.ts` (`scoring-week.test.ts` is wave 18's and stays): the Saturday boundary at
`23:59` / `00:00` org time across a UTC date line, a Friday row counted, a Saturday row the next week's; opt-out
absent for another member and present for self; a deactivated member absent; another org's ledger absent; a net
of 0 unranked; `anon` refused. ★ **For the lead:** `weekly_leaderboard()` is a new definer — if
`definer-exposure.test.ts` enumerates definers, it needs its row there, as `all_time_leaderboard()` has.

### 5.2 The ledger read — `getPointsLedger()` in `points.ts`, add-only, PR A

`getPointsHistory()` stays byte-identical (nothing else calls it after the rebuild; it is kept because the module
is add-only). The new read returns the page in one DTO:

```ts
export interface LedgerEntry extends PointsLedgerRow {
  /** wave 20, add-only: `points_ledger.source_id` — a reversal's link to the row it reverses (`0149`). */
  sourceId: string | null;
  /** The admin's display name on a manual adjustment, from `actor_id`; null otherwise or when it has none. */
  actorName: string | null;
}
export interface CapExplanation {
  sessionId: string; sessionTitle: string;
  ruleKey: "comment" | "photo"; reason: string; capPerSession: number;
  /** Where it sits: the first item the cap left unpaid. */
  at: string;
}
export type LedgerItem =
  | { kind: "entry"; at: string; entry: LedgerEntry }
  | { kind: "reversal"; at: string; entry: LedgerEntry; reversed: LedgerEntry | null }
  | { kind: "cap"; at: string; cap: CapExplanation }
  | { kind: "missed"; at: string; notice: MissedAttendance };
export interface PointsLedgerPage {
  /** Newest first, every ledger row exactly once (a reversed row inside its reversal's item). */
  items: LedgerItem[];
  /** Ledger rows matching the filters — «14 سطرًا». Explanations are not rows and are not counted. */
  rowCount: number;
  shown: number;
  sessionOptions: SessionOption[];
  /** The last 12 months in the ORG's zone, `YYYY-MM` + label-ready date. */
  monthOptions: string[];
  catalogue: CatalogueEntry[];
  timeZone: string;
}
export async function getPointsLedger(locale: string, opts: PointsHistoryFilters & { rows?: number }): Promise<PointsLedgerPage>;
```

The pairing is a pure exported function with its unit test (`pairReversals()`), and so is the grouping by the
org's month.

### 5.3 ★★ The cap row — an EXPLANATION, never a ledger row, view or table — `w20_0002_capped.sql`, PR A

`award_points()` (`0148:207-214`) refuses an award when the session's sum for the rule is already
`cap_per_session × points`, and writes **nothing** — so the cap leaves no trace in the ledger by design (`05` §8,
`points.ts:52-55`). The explanation is computed at read time from what the member did and what the ledger holds:

```sql
-- capped_award_explanations(): for the CALLER only, each (session, rule) where the cap is reached NOW and at
-- least one of their own items earned nothing. Invoker: the caller's own comments and photos and own ledger rows
-- are readable to them; a removed comment or photo is excluded (its award, if any, was reversed — it is not a
-- capped item). Comments and photos only — the caps `REQ-PTS-006` names for content.
create function public.capped_award_explanations()
returns table (session_id uuid, rule_key text, cap_per_session int, first_unpaid_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with items as (
    select 'comment'::text as rule_key, c.id, c.session_id, c.created_at
      from public.comments c where c.author_id = public.auth_member_id() and c.deleted_at is null
    union all
    select 'photo', p.id, p.session_id, p.created_at
      from public.photos p where p.uploader_id = public.auth_member_id()
       and p.removed_at is null and p.hidden_at is null
  ), rules as (
    select r.action_key, r.points, r.cap_per_session from public.scoring_rules r
     where r.org_id = public.auth_org_id() and r.enabled and r.points > 0 and r.cap_per_session is not null
       and r.action_key in ('comment', 'photo')
  ), full_caps as (
    select l.session_id, l.rule_key from public.points_ledger l join rules r on r.action_key = l.rule_key
     where l.member_id = public.auth_member_id() and l.session_id is not null
     group by l.session_id, l.rule_key, r.points, r.cap_per_session
    having sum(l.amount) >= r.cap_per_session * r.points
  )
  select i.session_id, i.rule_key, r.cap_per_session, min(i.created_at)
    from items i
    join rules r on r.action_key = i.rule_key
    join full_caps f on f.session_id = i.session_id and f.rule_key = i.rule_key
   where not exists (select 1 from public.points_ledger l
                      where l.member_id = public.auth_member_id() and l.source_id = i.id and l.rule_key = i.rule_key)
   group by i.session_id, i.rule_key, r.cap_per_session
$$;
```

- **It claims the cap only when the cap is full now.** An unpaid item while the cap is not full is a cooldown
  (`comment` has 60 s) or a job not yet run, and saying «الحد» there would be false — so nothing is shown.
- One explanation per (session, rule), not one per item: «الحد: 3 تعليقات لكل جلسة», no count — the artboard
  draws one row and a count would be a figure the ledger does not hold.
- It names no other member, writes nothing, and has no table behind it. Its RLS test: the caller's own only; a
  removed comment excluded; a cooldown-unpaid comment with the cap not full → no row.
- ★ If the RLS on `comments` or `photos` hides an author's own removed or hidden item from them already, the
  predicates above are a second line, not the first.

### 5.4 `mark_board_seen()` learns the week — `w20_0003_mark_board_seen_weekly.sql`, PR B

`create or replace` with the same signature: `p_board` accepts `weekly`; it writes `weekly_period` (the week's
Saturday) and `weekly_rank` exactly as the monthly pair. ★ The weekly period must be **the current week**:
`p_period` is checked against `org_week()`'s `week_start` and refused with `22023` otherwise, so a stale tab cannot
write last week's rank as this week's. `tests/rls/scoring-seen.test.ts`: «an unknown board is refused» stops
listing `weekly` — the ledger line `DEC-217` §4.3 expects — and new cases (weekly writes only its pair; a stale
period refused) go in a new `tests/rls/scoring-seen-weekly.test.ts`... ★ that name is outside my list
(`scoring-seen*` — the agent file names `tests/rls/scoring-seen*.test.ts` only for wave 16). **A request**: may I
create `tests/rls/scoring-seen-weekly.test.ts`, or should the cases go into `scoring-seen.test.ts` after the
lead's `0169` cases?

## 6 · Sync-1 Q6 — files created and deleted, and every existing assertion that moves

### PR A

**Commit 1 — delete** (`rm`, never `git rm`): `src/app/[locale]/app/me/points/page.tsx` ·
`src/components/scoring/{points-head,points-history-list,points-catalogue}.tsx` · their tests
`tests/components/scoring/{points-head,points-history-list,points-history-days,points-catalogue}.test.tsx` —
**each case re-homed in a new file, and each a ledger line** (the table goes with the commit). Kept, not deleted:
`me/points/actions.ts` (a Server Action — what survives), `moment-points-head.tsx` (the mechanism of 3 and 4 — but
see D26), `getPointsHistory()`.

**Commit 2 — create:** `me/points/page.tsx` · `src/components/scoring/{points-head-card,points-filters,points-ledger,points-table,points-catalogue-list}.tsx`
· `src/components/scoring/filter-submit.tsx` (the client island) · `src/components/hub/{standing.tsx,actions.ts}` ·
`src/components/ui/{ledger-row,podium}.tsx` with `tests/components/ui/{ledger-row,podium}{,-scope}.test.tsx` and
demos `(dev)/ui/demos/{ledger-row,podium}.tsx` · `supabase/proposed/scoring/w20_000{1,2}_*.sql` ·
`tests/rls/scoring-week-live.test.ts`, `tests/rls/scoring-capped.test.ts` · `tests/unit/scoring-ledger-pairs.test.ts`,
`tests/unit/scoring-week-window.test.ts` · `tests/components/scoring/points-*.test.tsx` (new names) ·
`tests/components/hub/standing.test.tsx` · `tests/e2e/wave20-scoring-{points,standing}.spec.ts` · keys in
`src/messages/{ar,en}/scoring.json` (ar first). `podium` lands in A (contract 2: all three primitives in A) and is
placed in B.

### PR B

**Delete:** `src/app/[locale]/app/leaderboards/{page,loading}.tsx` ·
`src/components/scoring/{member-board,company-board,company-points-breakdown}.tsx`. **Create** the same paths (so
the transfer back to `sessions` names the same files) and `src/components/scoring/{board-rank-card,cup-card}.tsx` ·
`supabase/proposed/scoring/w20_0003_*.sql` · `tests/e2e/wave20-scoring-boards.spec.ts` · keys in
`src/messages/{ar,en}/leaderboards.json`. `error.tsx` and `actions.ts` kept.

### Assertions that move — each a ledger line in the commit that moves it

| File:line | Assertion | Moves because | Kind |
|---|---|---|---|
| `tests/e2e/points.spec.ts:150`, `:299` | link «فتح الجلسة» | the session title is the link (artboard); its name is the title | selector |
| `tests/e2e/wave9-scoring-missed-day.spec.ts:241` | the notice's link «فتح الجلسة» | the same | selector |
| `tests/e2e/wave16-scoring-moments.spec.ts:174-176`, `:225`, `:267` | the level card on `SCR-022` turns, «مستوى جديد» | ★ D26 | expectation — **only if** D26 rules moment 4 off `022` |
| `tests/e2e/wave16-scoring-moments.spec.ts:268`, `:270` | the bar's line «صاحب أثر», «120 من 300» | the line is «"صاحب أثر" بعد 180» (artboard) | expectation (copy); `:271`'s `scaleX(0.4)` holds |
| `tests/e2e/wave16-scoring-moments.spec.ts:298`, `:328`, `:340` | tab «كل الأوقات» → URL `/leaderboards$` | all-time is `?board=all` | expectation |
| `tests/e2e/wave16-scoring-moments.spec.ts:301-304`, `:321`, `:329`, `:333`, `:341-342` | `#all-time ul li` nth(1) carries the rise | the podium takes 1 – 3; the rise is on the rank card (and the own row) — D42 | selector |
| `tests/e2e/wave7-sessions-leaderboards.spec.ts:114-118` | the default tab is «كل الأوقات» | ★ the default is «هذا الأسبوع» (`REQ-UIX-078`) | expectation |
| `tests/e2e/wave7-sessions-leaderboards.spec.ts:120-121` | `#all-time li a` in order | the first three are podium places | selector |
| `tests/e2e/leaderboards.spec.ts:110-116` | `#all-time` on the bare URL | `?board=all` | expectation |
| `tests/e2e/{leaderboards,wave7-sessions-leaderboards}.spec.ts` `:130-132`, `:139-141` | per row «مجموع النقاط», «نقاط لكل عضو نشط», «الترتيب حسبه» ×1 | held by the `sr-only` words in `grid`; if `toBeVisible` refuses `sr-only`, a selector line | selector, possibly |
| `tests/components/leaderboards/boards.test.tsx` (all) | `MemberBoard` / `CompanyBoard` props and the «ترتيبك» heading | the components are rewritten at the same paths | selector; the expectations (own row, no repeat, profile link, no `img`, both metrics, signed `ltr`) re-asserted |
| `tests/rls/scoring-seen.test.ts` «an unknown board is refused» | lists `weekly` | `DEC-217` §4.3 — PR B | expectation |
| `tests/components/scoring/{points-head,points-history-list,points-history-days,points-catalogue}.test.tsx` | every case | deleted with their components; each case re-homed (table in the delete commit) | file retired |

Untouched and expected green: `moment-rank.test.tsx` (the company board keeps `MomentRank`), `week-*.test.tsx`,
`moment-points-head.test.tsx` (unless D26), `scoring-company-points.spec.ts:157-160` (the breakdown still says
«استضافة جلسة» and «42» — D44 permitting), `scoring-screens.spec.ts` (an `h1` and no sideways scroll).

## 7 · Sync-1 Q7 — disagreements `DEC-216` §5 and `DEC-217` §4 do not list (numbered on from 25; none picked)

| # | Where | The disagreement | What each side would mean |
|---|---|---|---|
| 26 | `Points.dc.html` head card · `REQ-UIX-047` · M10c §1, §10 | ★★ **Moment 4 loses its surface.** The rebuilt head draws the level as text; no `level-card` with faces; M10c names 3 and 5 on the standing card, never 4. The rule is «none moved», and `DEC-207` §1.3 moves the level cursor only where 4 plays | (a) keep a `level-card` (faces, flip) on `022`'s head — off the artboard; (b) moment 4 on the standing card — a new surface; (c) the head's level name turns in place (`level-card` `standing` gains the flip) |
| 27 | `HubDesktop.dc.html` «تنزيل CSV» · M10c §2 · `REQ-UIX-072` | ★★ «the CSV the screen already exports» — **the screen exports none**; no member-side CSV exists in `src/` | (a) a new GET Route Handler under `me/points/csv/route.ts` (my folder), the formula-escaped writer of `admin-exports`; (b) not built, the link absent |
| 28 | `Board.dc.html` rows' ▲ / ▼ / — | Movement for **other** members cannot be computed (the seen marks are the viewer's own), and ▼ contradicts `REQ-UIX-037` («a falling row carries no colour, no icon, no motion») | the own row's rise only, as built |
| 29 | `REQ-UIX-081`, M10c §9 vs `Board.dc.html` | The podium collapses «at a narrow width / `sm`» — but the 390 artboard draws it; and collapsing a static element «under reduced motion» changes nothing a person perceives as motion | the collapse width = the container width the three blocks need (≈ 330 px), not `sm`; reduced motion as written or dropped |
| 30 | M10c §7 «category filter in a header `menu`» · `REQ-LDR-003` | Topic boards exist only **all-time** (`snapshot_leaderboards.ts:61`); the month has no category; the week could filter live by session category. `Board.dc.html` draws no menu | (a) the menu on «كل الأوقات» only; (b) all-time and the week (`weekly_leaderboard(p_category)`); (c) not on the board this wave |
| 31 | `Companies.dc.html` cup card · `REQ-UIX-079` | ★★ «كأس الربع الرابع», «الجولة 3 من 4 · 26 يومًا», «تُسلَّم في اللقاء السنوي» — **no quarter, round, cup or season exists**: the company snapshot is monthly, seasonal is unbuilt. Contract 7: every figure is read | (a) the card names the snapshot's month and its days left (`WeekPeriod`); (b) a quarter derived from the month — a figure no rule produces |
| 32 | M10c §8 «بلا ترتيب» · `REQ-UIX-079` | **No ranking minimum exists.** `min_active_members` (`0081`) gates the percentage rules, not the rank; the snapshot ranks every non-zero company, a `null` per-member figure last | (a) «بلا ترتيب» for a `null` per-member figure under that metric; (b) a new minimum — a change to what a rank IS, frozen |
| 33 | `Companies.dc.html` «18 نشطًا» | No per-company active count is frozen; the live count would contradict `05` §6.2 | derive `round(points ÷ per-member)` from the frozen pair (absent when either is null or 0) |
| 34 | `HubDesktop.dc.html` | The band's name is the `h1`, «نقاطي» an `h2`; every hub page draws its own `h1`, and three suites read `#main h1` = «نقاطي» | the frame's decision (the lead's) |
| 35 | M10c §2 vs `HubDesktop.dc.html` | «(يلغي سطر <date>)» on the desktop reversal — the artboard does not draw it | per M10c's text / per the board |
| 36 | M10c §1 «وصلت أمس» | No level history exists (out of scope); `Me.dc.html` does not draw it | not built |
| 37 | `Points.dc.html` «تفاعل (إعجاب) · غير مُفعَّل حاليًا · 0» | Reactions are **structurally** never points (`REQ-PTS-010`) and have no rule row; today a disabled rule shows its value and a badge | a disabled rule: «غير مُفعَّل حاليًا» and `0`; no reactions row, because no rule exists |
| 38 | M10c §7 «opted out (own row only)» | Ambiguous against `REQ-LDR-008` (the member still sees the board; only others stop seeing them) | the board, and the own row privately — today's behaviour |
| 39 | `DEC-216` §5.17 «this wave is where that stops» | The fix of `leaderboards.ts:512` has two readings | (a) the labels say «month»; the home's week stays on the monthly rank (`DEC-206` §4.47, wave 18's frozen surface); (b) the home's HUD and the game rail read contract 4 — add-only in `week-*` (the agent file allows it), and their «this month» copy moves |
| 40 | `weekly_leaderboard()` | Rank over what the caller may see (`0044`, no gaps) or over everyone (the snapshots, gaps) | `0044`'s, the live precedent |
| 41 | `points.ts:85-94` | The member's month filter is UTC (a defect); the monthly **snapshot** is UTC too (`0042`) while `REQ-LDR-002` says the org's zone | the filter fixed in the new read; the snapshot is frozen and not mine this wave — written for the owner |
| 42 | `DEC-217` rule 7 vs wave 16 | Moment 5 on the board: the rank card's count and arrow **instead of** the rows' FLIP, or **as well as** | card only / card + FLIP |
| 43 | `Points.dc.html` reversal meta «أُلغي حضورك: الرمز أُدخل من خارج القاعة» | The artboard draws the admin's free-text reason; wave 7's ruling keeps it on `check_ins.removal_reason` and `audit_log` only (`points.spec.ts:289`) | the fixed reason, as built |
| 44 | `Companies.dc.html` breakdown | One row **per source** with an aggregate («3 جلسات × 30», «17 من 24 · 71%»); the ledger is per session, and a percentage is per session | (a) per source: the sum, the count of sessions, and no percentage line for the two percentage rules; (b) per row, as today |

## 8 · Requests and questions for the lead

1. **Types for `ui/index.ts`**: `LedgerRowProps`, `PodiumPlace`, `PodiumProps` (§3); add-only `LevelStanding.frame`
   and `RaceBarProps.layout: "grid"` (§3.3); `BoardKind` is the DAL's.
2. **To `content`, through you**: `avatar` add-only `size: 64` (`Me.dc.html`'s card and the podium's places draw
   60 – 64; 56 is the nearest built).
3. **Colours**: the podium's gold block — `--color-level-*` has silver (3) and bronze (2) but no gold; the sticker's
   `gold` fill exists. I would use that semantic name; if it is not exposed as a utility, it is a `globals.css`
   request.
4. `definer-exposure` gains `weekly_leaderboard()` if it enumerates definers (§5.1).
5. The test file name for the weekly seen cases (§5.4).
6. ★ **The three rulings I most want at sync 1**: **D26** (where moment 4 plays), **D27** (the CSV: build it or
   not), **D31 with D32** (the company cup card's quarter, and what «بلا ترتيب» means). Close behind: D39 and D42.

## 9 · Amendments after the frame (`ebdde010`, doc `f79f5ee3`) and the lead's notes on contract 3

- **`SCR-022`'s top row and strip**: the page renders `HubTopRow({ title: «نقاطي», back: "/app/me" })` and
  `<HubStrip />` from `src/components/shell/` below `lg`; from `lg` the lead's `me/layout.tsx` draws the band, then the
  strip. §1's rows 1 – 2 read so.
- **The boards draw their own top row** (`ownsTopRow`, no hub strip, not `HubTopRow`): `h1` «لوحات الصدارة», «حتى
  الجمعة» on the week, then the window chips — a small server component of mine,
  `src/components/scoring/board-top-row.tsx`, used by `027` and `028` (PR B).
- **Ruled by the lead**: the band's figures are those of the hub page the member landed on until a hard load or
  `refresh()` — a known property, not a defect; the page's `HubTopRow` `h1` is the `h1` at every width, the band's
  name is text (D34 closed that way).
- ★ **The hidden copy never plays and never writes** (`content`'s requirement 1). On `/app/me` both forms are in the
  DOM at every width. `HubStanding` wraps its figures in `MomentWeek`, whose `useDisplayed` gate (`use-displayed.ts`)
  mounts the controller — the only code that claims an occurrence, animates or calls the two bound actions — **only
  in the copy that has a box**. The `display:none` copy renders the static state, claims nothing and writes nothing
  to `member_seen_marks`. A resize across `lg` mounts the other copy's controller, which finds the occurrence already
  claimed. `tests/components/hub/standing.test.tsx` proves it: both forms mounted, one with `display:none` → only
  the displayed one plays, exactly one acknowledgement per mark; then the re-render test (mount, play, unmount,
  mount again → silence) on each form, and the hidden form alone → no play, no call.
- ★ **A skeleton for the card form** (`content`'s requirement 2): `export function HubStandingSkeleton({ form }: {
  form: "card" | "band"; className?: string })` from `src/components/hub/standing.tsx` — `skeleton` primitives in the
  card's own geometry (the avatar row, the level row, the bar, three tiles), `aria-hidden`, no text, no data, no
  `getTranslations`, so `content` wraps `<HubStanding form="card">` in `<Suspense fallback={<HubStandingSkeleton
  form="card" />}>` and the lead may do the same for the band.

# Wave 20 — build (after `DEC-218`; the frame at `ebdde010`)

Landed so far: `ui/ledger-row` and `ui/podium` (`28d325e0`); the week's SQL, proposed (`b0320d91`); contracts 3 and 4
— `getWeekStanding()`, `getHubStanding()`, `<HubStanding>` and its skeleton, `level-card`'s `frame="none"`
(`82c945bd`).

## `SCR-022` — commit 1, the delete (`DEC-208`)

Deleted: `src/app/[locale]/app/me/points/page.tsx` · `src/components/scoring/{points-head,points-history-list,points-catalogue}.tsx`
· their four test files. Kept: `me/points/actions.ts` (the Server Action), `moment-points-head.tsx` (moments 3 and 4's
mechanism), `getPointsHistory()` (the DAL is add-only). The kept-behaviour table is §2.1 above, written before this
commit; it is read back against the new files after the create commit.

**Where each retired case goes** (each a ledger line in `STATUS.md`, sent to the lead):

| Retired case | Re-homed in |
|---|---|
| `points-history-list` · the empty state names its next action | `points-ledger.test.tsx` · empty |
| · a plain award has no reversal or manual tag | `points-ledger.test.tsx` · a plain award |
| · the reversal entry: a Western minus, `<bdi>` on both fields | `points-ledger.test.tsx` · the reversal pair, and `ledger-row.test.tsx` |
| · never the admin's free text on a reversal | `points-ledger.test.tsx` · the fixed reason only |
| · no running total per row | `points-ledger.test.tsx` · no total |
| · a manual adjustment's tag and its session link | `points-ledger.test.tsx` · manual, now with the admin's name |
| · axe-clean with a mixed history | `points-ledger.test.tsx` · axe |
| `points-history-days` · the notice names the day, states the rule, no amount | `points-ledger.test.tsx` · the missed-day notice |
| · several days in the locale's conjunction, Western numerals | `points-ledger.test.tsx` · the same |
| · a one-day history never renders a notice | `points-ledger.test.tsx` · one-day |
| · a notice beats the empty state | `points-ledger.test.tsx` · the same |
| · the notice interleaved by completion time | `points-ledger.test.tsx` · and the DAL's sort (`scoring-ledger-pairs.test.ts`) |
| · axe-clean with a notice | `points-ledger.test.tsx` · axe |
| `points-catalogue` · nothing when every rule is zero | `points-catalogue-list.test.tsx` · the same |
| · an enabled rule with its cap, a disabled one marked | `points-catalogue-list.test.tsx` · now a disabled rule draws `0` (`M10c` §2, D37) — ★ an expectation that moves |
| · axe | `points-catalogue-list.test.tsx` · axe |
| `points-head` · the bar's fill is the fraction its line states | `points-head-card.test.tsx` · the same |
| · the delta isolated left to right | `points-head-card.test.tsx` · the same |
| · the turned card names the new level and its perk | `points-head-card.test.tsx` · the level row turns in place, both faces named (DEC-218 §3.1) — ★ no perk list: the row draws none |
| · at the top the bar is full and says so | `points-head-card.test.tsx` · the same |
| · no streak in words / no streak rule draws nothing | ★ retired: the streak left `022`'s head with the artboard and lives on the standing card (`standing.test.tsx` covers both) |

## `SCR-022` — commit 2, the create (`bf268172`, `8815a4a7`), and §2.1 read back against the new files

| # | §2.1 behaviour | Read back in |
|---|---|---|
| 1 | Read at the data | `getPointsLedger()` / `getPointsHead()` → `sessionClient()` ✓ |
| 2 | The caller's rows only | `.eq("member_id", session.memberId)` on the page, and again on the reversed rows fetched by id ✓ |
| 3 | Each row its own reason in `<bdi>` | `points-ledger.tsx` `entryText()` ✓ |
| 4 | The signed figure in `<bdi dir="ltr">`, sign first, Western digits | `ledger-row` + `signedFigure()` (`−` U+2212) ✓ |
| 5 | A reversal: «إلغاء نقاط سابقة» + its fixed reason, never the admin's text | `rowFor()` reversal ✓ — `points-ledger.test.tsx` |
| 6 | A manual adjustment: the tag, its reason — and now the admin's name | `entryText()` + `actorName` ✓ |
| 7 | A link to the session | the title is the link ✓ (the accessible name moved — ledger lines below) |
| 8 | The missed-day notice | `ledger-row` `notice` ✓ |
| 9 | The empty state with its next action | `PointsLedger` ✓; notices beat it ✓ |
| 10 | GET filters, unfiltered options, «مسح التصفية» | `PointsFilters` ✓; ★ filtered empty built ✓ |
| 11 | ★ The org's month (the defect) | `orgMonthRange()` ✓ — `scoring-ledger-pairs.test.ts` |
| 12 | The catalogue live, `id="catalogue"`, zero rules hidden, a disabled rule marked | `PointsCatalogueList` ✓; a disabled rule draws `0` (D37) |
| 13 | The balance the page's one `<strong>` | `MomentPointsHead` `row` ✓; the band's figure is no `<strong>` ✓ |
| 14 | Moment 3, bound mark, a hard load static | `PointsHeadGate` → `MomentPointsHead`, unchanged mechanism ✓ |
| 15 | ★ Moment 4 | the level row turns in place (`points-level-turn.tsx`) ✓ — ★ and the head shows at every width (below) |
| 16 | The streak | on the standing card (`HubStanding`) ✓ |
| 17 | One fraction for bar and line | `levelProgress()`; the line is threshold − balance ✓ |
| 18 | `#history` | the phone list ✓; the table `#history-table` ✓ |
| 19 | No running total | ✓ |
| 20 | `presenterNet()` untouched | ✓ |
| 21 | Nothing of the shell | `HubTopRow` + `HubStrip` are the frame's ✓ |

★ **A deviation found while reading back** — written to the lead: `HubDesktop.dc.html` draws no head card from `lg`.
Hiding it there would leave moment 4 (`DEC-218` §3.1) with no desktop surface and the level cursor unmoved for a
desktop member, because the band acknowledges the level last seen. **The head shows at every width** (`8815a4a7`)
until the lead rules otherwise.

**Ledger lines** (sent to the lead for `STATUS.md`):

| File:line | Assertion | Kind |
|---|---|---|
| `tests/e2e/points.spec.ts` first test | `#main #history` → `#main #history-table` with `tr` on the desktop project | selector |
| `tests/e2e/points.spec.ts` first test | link «فتح الجلسة» → the session's title | selector |
| `tests/e2e/points.spec.ts` reversal test | link «فتح الجلسة» → «جلسة اختبار الإلغاء» | selector |
| `tests/e2e/wave9-scoring-missed-day.spec.ts:241` | the notice's link «فتح الجلسة» → the workshop's title | selector |
| `tests/e2e/wave16-scoring-moments.spec.ts:268-270` | the bar's slot holds «صاحب أثر» and «120 من 300» → `#points-head` holds «صاحب أثر» بعد 180 | expectation (copy); `scaleX(0.4)` holds |

## Closing PR A

- ★ **Disagreement recorded, ruled by the lead** (the closing entry carries it): `HubDesktop.dc.html` draws no head card
  on `SCR-022` from `lg`. **The head shows at every width** — `DEC-195` places moment 4 there and `DEC-218` §3.1 keeps
  it; hidden, a desktop member would never see a level-up and the level cursor would stay where it was.
- **The month filter's defect fixed where it was found** (`DEC-218`, the lead's exception to add-only for those lines):
  `getPointsHistory()` now bounds a month in the org's zone through `orgMonthRange()`; `monthRange()` is gone. Unit
  case: a row at 23:30 in Riyadh on 30 September stays in September.
- **The hidden standing copy renders no «+N» node** (`displayed-only.tsx`): the server renders none, and the copy on
  screen renders it after hydration. Covered by `standing.test.tsx` and `wave20-scoring-standing.spec.ts`.
- `avatar` size 64 (`040a89aa`, `content`'s) on the card and the podium.

# Wave 20, PR B — plan addendum: «كأس الربع» (`DEC-219` §2), before any code

Measured on the tree after `dcbf8776`. Answers the owner's one check and the lead's three questions. Nothing is built.

## A · The owner's check — can a quarter already awarded change? No, and it needs no SQL

`05-scoring-engine.md:383` is about a **live** denominator: «computed live, deactivating one member retroactively raises
that company's score for every past period». The snapshot exists to stop exactly that, and **a final one is already
immutable at the database, for every role including the owner**:

- `leaderboard_snapshot_guard()` (`0027:453-466`) raises `23514` on any `update` or `delete` of a row whose `is_final` is
  true — the replace-in-place re-run `snapshot_leaderboard()` does is a delete, so a final quarter cannot be re-taken.
- `leaderboard_entry_guard()` (`0027:497-510`) raises `23514` on any `update` or `delete` of an entry of a final snapshot.
- Both are triggers, not missing grants, because the writer is a definer owned by the table owner, whom `revoke` cannot
  stop (the header above `0027:432`). The only exception is an org's own deletion cascading through.
- `active_member_count` and each entry's `points` and `points_per_active_member` are written once, at snapshot time;
  nothing recomputes them.

So **a quarter's standings are frozen the moment the job marks it final**, and deactivating, adding or moving a member
afterwards changes nothing in it. «تُسلَّم في اللقاء السنوي» is safe on that. **What stays provisional** is the CURRENT
quarter: it is re-taken every night until the night after its last day, as the month is — which is what the card's
«مؤقت» says (§D).

★ **One carried caveat, not this wave's**: the job's periods are UTC calendar boundaries (`date_trunc` on `now()` in the
job's session, `0042`), not the org's zone, so a quarter's last three hours in Riyadh fall into the next quarter's UTC
bounds — the same defect the monthly board has carried since M4 (`REQ-LDR-002` says the org's zone). Written for the
owner; fixing it changes what a period IS and touches the frozen snapshot function.

## B · ★ A disagreement with `DEC-219` §2's measurement — the cup is a `company` snapshot, not a `seasonal` one

`DEC-219` §2 says «a quarter is a `seasonal` snapshot whose period is a quarter». **That ranks the wrong thing.**
`snapshot_leaderboard()`'s `seasonal` branch is the MEMBERS' branch — `if p_kind in ('monthly', 'seasonal')` inserts
`member_id` rows (`0042:62-73`, `0081:613-624`); company rows (`company_id`, `points_per_active_member`) are written by the
`p_kind = 'company'` branch alone (`0081:638-668`). `0066:24-28`'s precedent is about a MEMBER board («the top 3 of any
FINAL member-ranked snapshot»), so it carries over to members, not to companies.

What the cup needs, with no schema change: **a `company` snapshot whose period is a quarter** —
`snapshot_leaderboard(org, 'company', <quarter start>, <quarter end>, null, <final?>)`. The natural key
`(org_id, kind, period_start, period_end, category_id)` (`0027:443`) lets it sit beside the month's company snapshots.
No enum value, no new function.

★ **The consequence for the readers** — named so it is not discovered by the board: three reads take «the newest
`company` snapshot by `taken_at`» — `getLeaderboards()` (`leaderboards.ts:61-68`), `getCompanyRace()` (`:619-627`, the
home's race), and the boards' moment. A quarter snapshot written after the month's in the same nightly run would become
«the newest», and the monthly race and the home would show the quarter. **Each must select by period**: the month's
company snapshot is the one whose period is a calendar month; the quarter's, a calendar quarter. In `leaderboards.ts`
(mine, add-only — the two existing reads need the lead's exception, like `points.ts:85-94`'s) and in a new
`getCompanyCup()`. The ordering of the job's statements is not a safe substitute.

Not picked: the lead rules whether the quarter is `company`-with-a-quarter-period (my recommendation, no SQL) or whether
`seasonal` is taught company rows (a `create or replace` of the frozen snapshot function, from `0173`).

## C · How the quarter is scheduled — no new crontab line, no SQL schedule

The nightly `snapshot_leaderboards` task (`worker/src/tasks/snapshot_leaderboards.ts`, `0 2 * * *` in
`worker/src/index.ts:115`) already takes the current month provisional and finalises the previous month once. **The
quarter rides the same run, the same way**: the current quarter's company snapshot, provisional, every night; and the
previous quarter's, final, once — skipped when a final row already exists, exactly as the month's check does
(`:41-57`), because the guard would refuse the replace. So no crontab line and no `pg_cron`.

★ That task is one of my eight, **frozen for everyone this wave** — so this is a request for the lead's grant on that one
file, for those added statements only. `main`'s worker on the merged schema does nothing different: no schema change.

## D · What the cup card shows

Read by a new add-only `getCompanyCup(locale)` (the quarter's snapshot as §B selects it):

| Drawn | From | Mid-quarter (provisional) | After the quarter (final) |
|---|---|---|---|
| «كأس الربع الرابع» | the period's quarter (`period_start`'s month ÷ 3), an ordinal from the catalogue | the current quarter | the quarter just closed, until the next one has a snapshot |
| «الجولة 2 من 3 · 26 يومًا» | the month within the quarter, and the days left to `period_end` in the org's zone | shown | ★ the line becomes «نهائي» (`company.final`); no days |
| `company.provisional` / `company.final` | `is_final` | «مؤقت» | «نهائي» |
| «الترتيب حسبه: …» ✓ | `metric` (frozen on the snapshot, `0042:58`) | the snapshot's | the snapshot's |
| `company.takenAt` | `taken_at` | «الليلة 2:00 ص» | the finalising night's |
| «تُسلَّم في اللقاء السنوي» | the owner's ruling; a fact about the prize, not an explainer | shown | shown |

★ **A second disagreement**: `Companies.dc.html` draws «الجولة 3 من 4». A quarter has three months, so a round counted by
month is «من 3». «من 4» reads as the four quarters of a year (round 3 of 4 = Q3) — which would make the title and the
round say the same thing twice. Not picked; I propose «الجولة N من 3», the month within the quarter.

## E · «N نشطًا» — not `active_member_count`

`DEC-219` §2 maps «N نشطًا» to `active_member_count`. **That column is the ORG's count** —
`select count(*) from members where org_id = p_org and status = 'active'` (`0042:42`, `0081:597`), one number per
snapshot — not a company's. A company's frozen count is not stored; it is **implied by the frozen pair**:
`active(C) = points ÷ points_per_active_member`, exactly, since the snapshot computed the second from the first
(`0081:640-650`). The DAL derives it, rounded, and shows nothing when either is null or 0. No SQL. ★ A third
disagreement, recorded, not picked.

## F · «بلا ترتيب» and `min_active_members`

`company_scoring_rules.min_active_members` (seeded 3, `0081:169`, `:551`) gates the two percentage RULES — a company
below it earns no percentage points (`0081:389`, `:418`). Nothing ranks by it. Two ways to make it a ranking rule:

- **(a) Display only, no SQL.** The DAL derives each company's active count (§E) and shows «بلا ترتيب» when it is below
  the minimum; the others keep their frozen rank numbers, so a gap can show («1 · 3»). ★ **But the minimum is read
  LIVE**: an admin who edits it changes which companies of a FINAL quarter read «بلا ترتيب» — the cup's own board would
  move after the cup is handed over. That contradicts §A.
- **(b) Frozen at snapshot time, `0173`** (my recommendation, for the lead to write): additive —
  `leaderboard_snapshots.min_active_members int` (nullable; old rows null = no minimum), written by the `company`
  branch; and a `create or replace` of `snapshot_leaderboard()` whose `company` branch ranks the companies at or above
  the minimum first (1 … k, by the metric) and those below after them (k+1 … n), so the cup's #1 is always eligible and
  every rank stays `> 0` (`0027:475`). The DAL shows «بلا ترتيب» for a row whose derived count is below the snapshot's
  own frozen minimum. **`REQ-UIX-079`** («a company below the minimum of active members has no rank and says so»),
  `REQ-LDR-006`. Its five parts: the column and the function in one migration; RLS unchanged (the table's own
  `p1_org_read`); **no new grant** (`grant select on leaderboard_snapshots` is table-level, `0027:450`); the existing
  policies unchanged; the test in `tests/rls/snapshot-leaderboards.test.ts`'s pattern — below-minimum ranked after,
  the column frozen on a final row, an old row's null meaning no minimum. ★ It changes the MONTHLY race's ranking going
  forward too (provisional rows only; every final row is untouched) — the owner should know.
- **Which minimum**: the org has no ranking minimum of its own. (b) reads `company_attendance_pct`'s
  `min_active_members` **whether or not that rule is enabled** — the one setting an admin already uses to say «a company
  this small is not comparable». A separate `org_settings` column would be cleaner and needs a console field (frozen).
  Not picked.

## G · Files, when wave-20b is cut

`getCompanyCup()` and the period-selecting reads in `leaderboards.ts`; the cup card in `src/components/scoring/cup-card.tsx`;
keys in `leaderboards.json`; with the lead's grant, `snapshot_leaderboards.ts`'s added statements; with (b), the lead's
`0173` from my draft under `supabase/proposed/scoring/`; tests: a new `tests/rls/scoring-cup*.test.ts` (the quarter's
snapshot taken, finalised once, frozen), unit cases for the quarter arithmetic and the derived count, the cup card's
component test, and `wave20-scoring-boards.spec.ts`'s cup case.

## H · The lead's rulings on the addendum (after `09156f37`), and two answers

- **Accepted**: §A (no SQL; the UTC caveat carried), §B (a `company` snapshot with a quarter period; `getLeaderboards()`
  and `getCompanyRace()` select the month by its period length, add-only exception granted, a unit case each), §C
  (granted on `snapshot_leaderboards.ts` for the added statements only, with its test), §D («الجولة N من 3»).
- **«بلا ترتيب» is NOT built this wave** — option (b) also reorders the monthly race, beyond `DEC-219`; it goes to the
  owner. `DEC-218` §3.3 stands for that line. (b) stays drafted in §F, to land from `0173` if the owner says yes.
- **§E — is the division exact? Measured: the stored ratio is NOT rounded, so the derivation is safe.**
  `leaderboard_entries.points_per_active_member` is an unconstrained `numeric` (`format_type` = `numeric`), and the
  snapshot writes `sum(...)::numeric / count(...)` into it unrounded: Postgres keeps 16 fractional digits for such a
  quotient — `170/18` is stored `9.4444444444444444`. `round(points ÷ stored)` then recovers the count: measured
  `170 → 18`, `7/3 → 3`, `−25/7 → 7`, `99999/9973 → 9973`. The error of the round trip is far below 0.5 for any count
  an org can hold; read into a JavaScript double it is still exact to the integer. **So «N نشطًا» is drawn**, from
  `round(points / ppam)`, and nothing is drawn when either is null or `0`. A unit case pins the four measured pairs.
- **`main`'s worker in the gap** (it runs the old `snapshot_leaderboards.ts` until the merge): it takes no quarter
  snapshot, so the cup card reads none and shows its empty state; the month's snapshots are taken exactly as today and
  every reader selects them as today. Nothing breaks, and no row `main` writes is one the new code misreads.

# Wave 20, PR B — build

Landed before the delete: `mark_board_seen()` learns the week (`a17858b2`, proposed); the boards' reads — the week
live, the quarter's cup, the month chosen by its period, the `:512` relabel, the weekly mark written (`7ba2c84a`); the
nightly task takes the quarter (`8696536b`).

## `SCR-027` / `SCR-028` — commit 1, the delete (`DEC-208`)

Deleted: `src/app/[locale]/app/leaderboards/{page,loading}.tsx` · `src/components/scoring/{member-board,company-board,company-points-breakdown}.tsx`
· `tests/components/leaderboards/boards.test.tsx`. Kept: `leaderboards/{error,actions}.tsx|ts` (the boundary and the
Server Action), `moment-rank.tsx` (moment 5's FLIP — `DEC-218` §3.4 keeps it), the DAL. The components are re-written
at the SAME paths, so the transfer back to `sessions` names the same files; `boards.test.tsx` is re-written at its path
too, each retired case re-homed:

| Retired case | Re-homed |
|---|---|
| `MemberBoard` · the viewer's row under «ترتيبك» when below the rows shown | the pinned own row — same expectation |
| · not repeated when among the rows | same |
| · a name links to the profile, no avatar image (DEC-099) | same, the podium included |
| · an empty board names what to do next | same |
| `CompanyBoard` · both metrics on every row, the ranking one marked | ★ the metric is said per row to a screen reader and once, visibly, in the column header (`Companies.dc.html`) — selector |
| · follows the org's metric when it is total points | same |
| signed numbers · a negative company total and its per-member figure | same |
| · a negative row in the company's own ledger | same, in the breakdown's rows |

The kept-behaviour tables are §2.3 and §2.4 of the plan, read back after the create commit.

## `SCR-027` / `SCR-028` — commit 2, the create (`4d2bab69`), §2.3 and §2.4 read back

| # | Behaviour | Read back in |
|---|---|---|
| 027.1 | Linked tabs, server-rendered, shareable — now four, the week the default | `page.tsx` `boardFrom()`, `ui/tabs` navigation mode ✓ |
| 027.2 | All time live, opt-out in the database | `getLeaderboards()` → `all_time_leaderboard()` ✓ |
| 027.3 | Month from its snapshot, provisional / final | the month window's badge ✓ (the month's snapshot by `kind`; the company race's by PERIOD) |
| 027.4 | ★ The own rank always visible | `BoardRankCard` (always) + the pinned own row ✓ |
| 027.5 | «أنت», outlined | `rank-row` and the podium place ✓ |
| 027.6 | Names link to profiles | rows and podium ✓ |
| 027.7 | Initials, no photograph | `rank-row`, `podium` ✓ — a spec asserts `img` count 0 |
| 027.8 | An empty board names the next action | `MemberBoard` ✓, the card stays |
| 027.9 | Moment 5: a rise only, once, static on a hard load, the arrow never pulsing | `MomentRank` with `count` — the card's figure and the rows' FLIP in ONE claim (DEC-218 §3.4) ✓ |
| 027.10 | 3 on the podium, 4 – 10 as rows, «عرض 11 إلى 50» | ✓ |
| 027.11 | `#all-time`, `#monthly` | ✓; `#weekly` added |
| 027.12 | The all-time explainer line | removed (`REQ-UIX-080`) ✓ |
| 028.1 | Both metrics per row, the ranking one marked | `race-bar` `grid` (sr per row) + the visible header with ✓ |
| 028.2 | Bars from the inline-start, `companyFractions()` | ✓ unchanged |
| 028.3 | «فريقك» | ✓ |
| 028.4 | Signed figures left to right | ✓ |
| 028.5 | `takenAt`, provisional / final | the cup card ✓ |
| 028.6 | Moment 5 on the company: the bar grows | `MomentRank`, `listSelector` ✓ |
| 028.7 | The breakdown: own company only, `#company-breakdown`, the heading, the balance, the rules, signed rows, meta | ✓ in `ledger-row`s; one row per ledger row (D44 not ruled) |
| 028.8 | ★ No company → the prompt | ✓ |
| 028.9 | The «asOf» explainer | removed ✓ |

**Pending, built to a default and named to the lead**: D30 (the category menu on «كل الأوقات» only — option (a));
the 028 table is the cup's quarter, falling back to the month's race with a label (option (a)); «N نشطًا» waits for
`RaceBarProps.note` (requested), derived and tested already (`derivedActive()`).

**Ledger lines** (to the lead for `STATUS.md`):

| File | Assertion | Kind |
|---|---|---|
| `tests/rls/scoring-seen.test.ts` | «an unknown board» no longer lists `weekly` | expectation (`DEC-217` §4.3) |
| `tests/unit/scoring-week-window.test.ts` | `WEEKLY_MARK_WRITABLE` `false` → `true` | expectation (PR B) |
| `tests/components/leaderboards/boards.test.tsx` | re-written at its path; each case re-homed (table above) | file re-written |
| `tests/e2e/leaderboards.spec.ts` | all time at `?board=all`; «أنت» `.first()`; the company seed names its month | expectation ×2, selector ×1 |
| `tests/e2e/wave7-sessions-leaderboards.spec.ts` | the default tab is «هذا الأسبوع»; all time at `?board=all`; names from podium + rows; the seed names its month | expectation ×3, selector ×1 |
| `tests/e2e/wave16-scoring-moments.spec.ts` (moment 5) | URL `/board=all$/`; the viewer on the podium; the rise on the rank card; the reload at `?board=all` | selector ×4 |

## PR B — the lead's rulings on D30 and 028, applied (the commit after `9801e280`)

- **D30 → (a)**: the category menu on «كل الأوقات» only, reading the topic snapshots; absent on the week, the month
  and the race. ★ A chosen category's board says when its snapshot was taken («احتُسبت في …») — it is not live like
  the windows — and a category with no snapshot yet is the board's empty state. **(b) is carried, not built**: a live
  week per category would be a `weekly_leaderboard(p_category uuid default null)` replace, from a new migration.
- **028 → (a)**: the table is the cup's QUARTER race; the card and the table describe one race. The period is named in
  words — the card's «كأس الربع …» heads the table; the fallback's own heading is «سباق هذا الشهر», used only while no
  quarter snapshot exists. Both metrics, the ranking one marked, hold for the quarter (the quarter snapshot's own
  frozen metric, `REQ-LDR-005`).
- **«N نشطًا»** is drawn (`RaceBarProps.note`, the lead's `02d1c9af`), from `derivedActive()`.

**A kept-behaviour row, so the move is visible, not silent** (§2.4):

| # | Behaviour today | Where it lives after | Kept by |
|---|---|---|---|
| 028.10 | ★ **The MONTHLY company race was 028's table** | the home's race (`getCompanyRace()`, the rail and the HUD), and 028's labelled fallback while no quarter snapshot exists; 028's table is the cup's quarter | `REQ-LDR-002`, `REQ-LDR-004` — the month's standings are still published, both metrics shown, where a member meets them daily |

The lead shows the owner this as a disagreement with `M10c.md` §8's last line («هذا الشهر» on this tab is the monthly
race) at the phone check.

# Wave 20, PR C — plan (`wave-20c/the-award`, `DEC-220`) — planning only, no SQL written

★ **Numbers** (`DEC-221`): `0174` is PR B's — `content`'s fix of a live hole, by which a checked-in member could insert a
`photos` row directly, claiming `exif_stripped`. **PR C's migrations start at `0175`**: the two columns first (the
lead's), then `w20c_0001` (the award) and `w20c_0002` (the minimum) as promoted. ★ Since `0174` a `photos` row is written
ONLY by `record_photo_upload()`, already stripped — so «an insert is a photo becoming visible» holds, and paying on
insert is safe. **The award is not built until the owner has pushed `0174`.**

## 0 · ★ Published on day one, for `content` — the two functions its trigger on `photos` calls

```sql
-- Pays a VISIBLE photo, once per epoch. Enqueues the existing `award_points` job; writes nothing itself.
-- `p_restore` true: a photo made visible again — paid ONLY when an earlier award of it was reversed (the lead's ruling 3).
public.award_photo_points(p_photo uuid, p_restore boolean default false) returns void   -- security definer; revoked from public, anon, authenticated

-- Compensates every standing photo award of that photo — 0149's shape, one row per award, its own reason.
public.reverse_photo_points(p_photo uuid, p_reason text) returns void   -- security definer; same grants
```

`content`'s trigger function is `security definer` (it calls service-only functions) and decides only WHEN:

| Transition on `public.photos` | Call |
|---|---|
| `after insert` with `hidden_at` and `removed_at` both null — the row exists only after `process_photo`'s EXIF strip (`0115:234`) | `award_photo_points(new.id)` |
| `after update`: visible → `hidden_at` set (a takedown, `0037:329`) | `reverse_photo_points(new.id, 'أُخفيت الصورة')` |
| `after update`: hidden → visible again (`hidden_at` cleared, `photos.ts:275`) | `award_photo_points(new.id, true)` |
| `after update`: `removed_at` set | ★ **nothing from content** — the removal path is `_reverse_photo_points()` (`0059:122`), which I replace to call `reverse_photo_points(new.id, 'حُذف المحتوى')` and keep its `photo_removed` penalty. One writer per transition |

## 1 · The photo award (`REQ-UIX-083`, `REQ-PTS-002`, `REQ-PTS-006`, `REQ-PTS-012`, `REQ-PTS-013`)

**The rule is the seed**: `('photo', 'attendee', 3, true, 5, null, 'صورة من الجلسة')` (`0027:530`) — 3 points, cap 5
per session, read at award time from `scoring_rules`, never a literal. `ledger_source` has `'photo'`.

1. ★ **The reversal first.** `reverse_photo_points(p_photo, p_reason)`: under an advisory lock on the photo, for each
   `points_ledger` row with `source = 'photo' and source_id = p_photo` that no `reversal` row names, insert
   `(org, member, -amount, 'reversal', l.id, l.session_id, p_reason, 'photo', 'reversal:' || l.id || ':v1')` with
   `on conflict do nothing` — exactly `0149:179`'s shape. The `rule_key` is `'photo'`, so a reversed award FREES its
   place under the cap (`award_points()`'s sum, `0148:209-214`). It fixes the `limit 1` in today's
   `_reverse_photo_points()`, which with a second epoch would compensate the FIRST award again (a no-op by its key) and
   leave the second standing.
2. **The award.** `award_photo_points(p_photo, p_restore)`: reads the photo; returns unless it exists, `hidden_at` and
   `removed_at` are null, and its session is in the uploader's org; ★ with `p_restore`, returns unless a `reversal`
   row names an earlier `photo` award of this photo — **a restore re-awards only what was reversed** (the lead's ruling):
   a photo uploaded BEFORE the migration was never paid, so hiding and restoring it after pays nothing; computes the epoch as
   `presenter_award_epoch(uploader, 'photo', 'photo', p_photo)` (`0149`, «1 + the reversals of matching awards» — the
   name is the presenters' but the function is generic); and enqueues through `public.enqueue_job('award_points',
   {rule: 'photo', member_id, source: 'photo', source_id: photo, session_id}, 'pts:photo:' || photo || ':v' || epoch)`.
3. ★ **The epoch reaches the key.** `award_points()` (`0148:93`, mine) is `create or replace`d with ONE added branch:
   `if p_source = 'photo' then` — re-derive visibility (a late job after a hide pays nothing, as `0088`'s check-in race
   does) and `v_epoch := public.presenter_award_epoch(p_member, p_rule, p_source, p_source_id)`. Every other branch
   byte-for-byte. The ledger key is the existing shape `photo:photo:<photo>:<member>:v<epoch>`.
   **Award → takedown → restore → award nets ONE**: `+3` (v1), `−3` (reversal of v1), `+3` (v2, the epoch is 2 because
   v1 was reversed); a second hide reverses v2. A replayed job writes nothing (`REQ-PTS-012`).
4. **The cap** is `award_points()`'s, unchanged: the sixth visible photo on a session finds `sum ≥ 5 × 3` and writes
   nothing — and ★ `0172`'s `capped_award_explanations()` learns photos: today it explains comments only, because
   nothing paid a photo (§5.3 of the wave-20 plan). Its `items` CTE gains the uploader's visible photos (`photos.uploader_id`,
   `hidden_at` and `removed_at` null) for `rule_key = 'photo'` — a `create or replace`, same signature.
5. **`main`'s worker in the gap** (the migration lands before the merge): content's trigger enqueues the EXISTING
   `award_points` job with the existing payload; `main`'s `award_points` task calls the same `award_points()` SQL,
   which is the new one. So **photos start paying on `main` the day the migration is pushed** — the catalogue's line
   becomes true then, not at the merge. No `main` code is wrong in the gap. ★ No backfill: photos uploaded before
   are not paid (a data fix is never a migration); written for the owner.
6. **Grants**: both new functions `revoke execute … from public, anon, authenticated` and `grant … to service_role`
   (the trigger runs them as its owner); a `definer-exposure` row is the lead's if the gate lists them (anon cannot
   call either).

## 2 · «بلا ترتيب» (`REQ-UIX-082`, `REQ-UIX-079`, `REQ-LDR-005`, `REQ-LDR-006`)

The lead writes the two columns (`org_settings.company_min_active_members int not null default 3 check (between 1 and
50)`, `leaderboard_snapshots.min_active_members int` nullable). Mine:

1. **`snapshot_leaderboard()` — `create or replace`, the company branch only** (`0081:638-668`), same signature:
   - read `v_min := company_min_active_members` beside `v_metric` (`0081:598`);
   - write it on the snapshot row for `kind = 'company'` (null for every other kind);
   - compute each company's active count once (the denominator it already computes inline, `0081:643-647`), and rank
     `rank() over (order by (active >= v_min) desc, <metric> desc nulls last)` — **eligible companies first**, the
     ineligible after them, every rank still `> 0` (`0027:475`); `points_per_active_member` unchanged.
   - The monthly and topic branches byte-for-byte.
2. **The reads** (`leaderboards.ts`, add-only fields): the company snapshots' `min_active_members`; each row gains
   `unranked: boolean` = the snapshot has a minimum AND the derived active count (`derivedActive()`, exact — §H) is
   below it, or there is none. `CompanyBoardRow.unranked?` add-only; the cup reads it too.
3. **The drawing**: an ineligible row on 028 draws no rank — `race-bar` given no `rank` — and its `note` reads
   «بلا ترتيب · N نشطًا» (★ new `company.unranked` key, ar first). No type change needed. Old snapshots (null minimum)
   draw every rank, as today.
4. ★ **The home's race** (`getCompanyRace()`, wave 18's rail and HUD, frozen) shows the own company's STORED rank. With
   eligible-first ranking, the leaders it shows are eligible; an ineligible own company would show «#5» where 028 says
   «بلا ترتيب». **A question for the lead**: an add-only `unranked` there too (one field, and the HUD's line), or leave
   the home as it is this wave.
5. **The monthly reordering**: from the migration on, every new company snapshot — the month's and the quarter's —
   ranks eligible-first; provisional rows only; a final snapshot never moves (`0027:453`, `:497`).

## 3 · 03 §8.2 rows

| Row | Proof |
|---|---|
| `RPC-reverse_photo_points.compensating` | One `reversal` row per standing photo award, `-amount`, `0149`'s key and its own reason; none written twice |
| `RPC-reverse_photo_points.frees_cap` | A reversed award frees its place: the next visible photo on that session is paid |
| `RPC-award_photo_points.visible_only` | A hidden or removed photo enqueues nothing; a late job after a hide writes nothing |
| `RPC-award_photo_points.epoch` | award → hide → restore → award nets ONE award; a second hide reverses the second |
| `RPC-award_photo_points.restore_only_reversed` | ★ A photo with no earlier award (uploaded before the migration), hidden and restored, is paid nothing |
| `RPC-award_photo_points.cap` | The sixth visible photo on one session writes nothing, and `capped_award_explanations()` names that session |
| `RPC-award_photo_points.grants` | Neither function is callable by anon or authenticated |
| `RPC-award_points.photo_epoch` | `award_points()`'s photo branch keys by epoch; every other source's key is unchanged |
| `RPC-snapshot_leaderboard.min_frozen` | A company snapshot stores the org's minimum; changing the setting later changes no snapshot |
| `RPC-snapshot_leaderboard.eligible_first` | Below-minimum companies rank after every eligible one; every rank stays > 0 |
| `RPC-snapshot_leaderboard.final_untouched` | A final company snapshot taken before the change keeps its order and its null minimum |

## 4 · Files and every assertion that moves

**Files**: `supabase/proposed/scoring/w20c_0001_photo_award.sql` (the two functions, `award_points()`'s photo branch,
`_reverse_photo_points()` replaced, `capped_award_explanations()` taught photos); `w20c_0002_company_minimum.sql`
(`snapshot_leaderboard()` replaced) — both after the lead's columns; `tests/rls/scoring-photo-award.test.ts`,
`tests/rls/scoring-company-minimum.test.ts`; `leaderboards.ts` (add-only), `company-board.tsx`, `leaderboards.json`;
`tests/components/leaderboards/boards.test.tsx` (new cases); `tests/e2e/wave20-scoring-boards.spec.ts` and
`wave20-scoring-points.spec.ts` (new cases: the cup with «بلا ترتيب»; one photo past the cap → the dashed row).

**Assertions that move**:

| File | Assertion | Kind |
|---|---|---|
| `tests/rls/moderation.test.ts:101-104` (the lead's, as custodian) | the photo's reversal reason is «حُذف المحتوى» — ★ the takedown inserted at `:78` now HIDES the photo first, so the award is reversed at the hide with «أُخفيت الصورة»; the removal then finds nothing standing | expectation — unless the hide uses «حُذف المحتوى» too (§5) |
| `tests/rls/scoring-capped.test.ts` «comments only» | photos are explained too | addition, no change |
| `tests/rls/snapshot-leaderboards.test.ts` | the company snapshot's ranks with one company per fixture org are unchanged; a snapshot row now carries `min_active_members` | none expected — named to be checked |
| `tests/rls/scoring-company-points.test.ts:452` | a final company snapshot's ranks | none expected — the fixture's one company is rank 1 either way |

## 4b · The lead's rulings (provisional until `content`'s trigger plan; final at PR C's sync)

1. A hide's reversal reads **«أُخفيت الصورة»** — a member tells a hide from a deletion (`REQ-PTS-003`). Granted:
   `tests/rls/moderation.test.ts:101-104` only, an expectation move with its ledger line.
2. **`getCompanyRace()` gains `unranked`, add-only**, and the home's rail draws «بلا ترتيب» for an ineligible company —
   two surfaces never disagree about one company's rank.
3. **No backfill**, and a restore re-awards only what was reversed (§1.2).

**For the entry's draft — photos pay in PRODUCTION before PR C merges.** The owner pushes migrations before merging, so
from the day PR C's migrations (`0175`+) are pushed, `main`'s app enqueues photo awards through the new trigger and `main`'s worker pays them
through the new `award_points()`. Measured, `main`'s screens draw such a row correctly: the ledger read
(`getPointsLedger()`, PR A — and before it `PointsHistoryList`) treats every source alike, drawing the row's OWN reason
(«صورة من الجلسة») with its session's link; a photo reversal is `source = 'reversal'`, which both pair or tag
generically; `COMPLETION_SOURCES` excludes `photo`, so no moment plays for it; the cap explanation draws the session's
dashed row once `capped_award_explanations()` learns photos. Nothing on `main` names `photo` specially, so nothing draws
it badly.

**`content`'s ordering point, agreed** (its plan, uncommitted): `remove_photo()` sets `removed_at` AND `hidden_at` in one
update, so `content`'s hide and restore clauses both require `new.removed_at is null` — a removal is `_reverse_photo_points()`'s
alone and reads «حُذف المحتوى»; an unhide of a removed photo never calls the award. ★ `reverse_photo_points()` is a
NO-OP when nothing is standing (it selects only awards no reversal names, and inserts with `on conflict do nothing`), so
a takedown followed by a removal writes ONE reversal, the hide's. That is the expectation move at
`moderation.test.ts:101-104` the lead granted.

## 5 · New disagreements, not picked

1. **The hide's reason.** `REQ-PTS-013` says a removed photo's reversal reads «حُذف المحتوى». A HIDDEN photo (a takedown
   pending) is not removed; I propose «أُخفيت الصورة», which moves `moderation.test.ts`'s expectation. The alternative
   keeps «حُذف المحتوى» for both and moves nothing.
2. **No backfill** of photos uploaded before the migration — the owner's call.
3. **The home's race and «بلا ترتيب»** — §2.4.
