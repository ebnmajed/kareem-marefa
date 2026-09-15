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
| `attendee_bonus` | `attendee_bonus:session_delivered:<session.id>:<presenter_id>:v1` — **one row per session per presenter**, `amount = 2 × attendee_count` capped at 30 occurrences (60 pts); not one row per attendee, because the cap is per-session-per-presenter and a single row is simpler to reverse/audit than 30 rows racing a cap check. (`05` §3.2's cap is stated in *occurrences* of `attendee_bonus`; collapsing to one row changes the cap's unit from "30 awards of 2" to "1 award of up to 60", which is the same ceiling — recorded here because `05` warns getting the unit backwards is silent. Comment in the SQL cross-references this note.) |
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
