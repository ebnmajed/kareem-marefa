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
