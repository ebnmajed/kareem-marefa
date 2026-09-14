**Last updated:** 2026-09-14 · **Branch:** `wave-2/m3-m4-m5` (cut from `main` @ `e0b448d`; **draft PR #13**, CI green at sync 0) · **`main` @ `e0b448d`:** M1 live, M2 complete · **Phase:** **wave 2 in progress — the plan approved, migrations `0024`/`0025` and the worker image on the branch, `notify` (opus), `scoring`, `content` (sonnet) spawned (DEC-046)**

> This is the single entry point for every session. Read it before anything else; update it
> before you finish, whether or not you got through what you intended.

## Where we are

**The planning document set is complete.** All 19 documents specified by `_source-brief.md` §7 are
written, plus `STATUS.md`, `DECISIONS.md` and the root `CLAUDE.md`. `node scripts/traceability.mjs`
exits 0.

**M0 is on `main` (PR #2 merged as `9002dbf`) plus PR #3 (`m0/worker`).** `src/` gained its first platform code
— `components/ui/icons.tsx`, `components/ui/dialog.tsx`, and the Radix `Direction.Provider` in the
locale layout — with the frozen routes proven byte-identical by the visual diff. `supabase/` is
untouched and the live project was not connected to. See *M0 progress* and *This session*.

**`public/` is no longer untouched.** Commit `3d43108` added ten static constellation assets — four
PNGs, four `constellation-frame-*.svg`, `constellation.svg` and `constellation-static.svg` —
hand-authored art extracted from `src/components/network-bg.tsx`. They are **repo assets, not uploads**,
so invariant 11 / DEC-009 (no SVG uploads, anywhere) is not affected: nothing here passes through
the upload pipeline or renders inside the privileged headless Chromium. No route, component or
frozen contract (`REQ-NFR-019`) references them yet — they are committed art awaiting use.

**Next:** M0 — foundation and de-risking (`14-roadmap.md`). Nothing in M0 is user-visible, and the
existing QA must stay green throughout.

## Status vocabulary

- **Documents:** `draft` · `settled` · `frozen` · `withdrawn`
- **Stories:** `todo` · `in-progress` · `done`

A `settled` or `frozen` document may **only** be changed via a `DECISIONS.md` entry. That is the
rule that keeps a later session from casually rewriting a considered decision.

## Documents

| # | File | Status | Notes |
|---|---|---|---|
| — | `_source-brief.md` | `frozen` | The brief verbatim. **Never edit.** D1–D68, A1–A32. |
| — | `STATUS.md` | live | This file. |
| — | `DECISIONS.md` | append-only | DEC-001 … **DEC-045**. |
| 00 | `00-overview.md` | `settled` | Glossary, personas, ID scheme, owning-document table. |
| 01 | `01-prd.md` | `settled` | **251 requirements.** The only document that may define one. |
| 02 | `02-domain-model.md` | **`frozen`** | **64 entities.** Cited by nine documents. |
| 03 | `03-permissions-rls.md` | `settled` | 8 policy patterns, per-table map, **Realtime authorization (§7)**, ~86 test cases. |
| 04 | `04-architecture.md` | `settled` | **Owns the canonical route table.** |
| 05 | `05-scoring-engine.md` | `settled` | Catalogue, ledger, leaderboards, snapshots. |
| 06 | `06-visual-designer.md` | `settled` | Layer model, exports, the parity suite. |
| 07 | `07-content-pipeline.md` | `settled` | Uploads, conversion, viewer, photos. |
| 08 | `08-notifications-calendar.md` | `settled` | The matrix, 22 templates, calendar sync. |
| 09 | `09-sitemap-screens.md` | `settled` | **53 screens**, each with mobile/desktop/RTL notes. |
| 10 | `10-i18n-rtl.md` | `settled` | Typography tokens, bidi, numerals, adding English. |
| 11 | `11-background-jobs.md` | `settled` | **34 jobs** with keys, retries, alerts. |
| 12 | `12-security-privacy.md` | `settled` | Threat model, retention, PDPL. Raised OQ-026. |
| 13 | `13-testing-quality.md` | `settled` | RLS plan, parity suite, budgets, CI. §1 updated under DEC-033. |
| 14 | `14-roadmap.md` | `settled` | M0–M8 + **Launch** (DEC-039). No phase-2 bucket. |
| 15 | `15-backlog.md` | `settled` | **112 stories**, every one citing `REQ-*`. |
| — | `ASSUMPTIONS.md` | `settled` | **A1–A40**, each with a status. |
| — | `OPEN-QUESTIONS.md` | `settled` | **27**, each with a default in force. OQ-027 (worker hosting) is due at M3. |
| — | `TEAM.md` | `settled` | The agent team: waves, ownership, contracts, the lead's spawn prompt (DEC-040). |
| — | `TRACEABILITY.md` | generated | `node scripts/traceability.mjs`. Do not hand-edit. |
| — | `/CLAUDE.md` | `settled` | Repo root. Keeps `@AGENTS.md` as line 1. |

## Production order — complete

- ✅ **Wave 0** `STATUS` + `DECISIONS` → `00` → `ASSUMPTIONS` + `OPEN-QUESTIONS` → `01` → `02`
- ✅ **Wave 1** `03` → `04`
- ✅ **Wave 2** `05` · `06` · `07` · `08` · `10`
- ✅ **Wave 3** `09` · `11` · `12`
- ✅ **Wave 4** `13` → `14` → `15` → `TRACEABILITY` → `00` finalised → `CLAUDE.md`

## Verification run at the end of this session

| Check | Result |
|---|---|
| `node scripts/traceability.mjs` | ✅ 251 requirements · 64 entities · 112 stories · no gaps |
| Every A1–A32 in `ASSUMPTIONS.md` with a status | ✅ plus A33–A40 |
| Every table has an org key and a policy set | ✅ four documented exceptions (`02` §7) |
| Every policy has a test case | ✅ `03` §8 |
| Every screen has mobile, desktop and RTL notes | ✅ `09` |
| Every A12 poster variant derivable from the master | ✅ `06` §5 |
| Every A29 export format specified with its pipeline | ✅ `06` §6 |
| Nothing planned outside §4/§5; §4.22 only in out-of-scope | ✅ `01` §23 |
| `npm test` (Vitest, two projects) | ✅ **52/52** — 37 unit (incl. the probe over fake clients) + 15 component |
| `npm run test:e2e` (Playwright) | ✅ **10/10** — frozen routes, desktop + Pixel 7 profiles |
| `npm run parity` | ✅ 7 cases, Tiers A and B, 0.000% — manifest now read from `packages/fonts` |
| `npm run fonts:check` | ✅ 9 web faces, 6 TrueType, build matches |
| `npm run visual compare m0-before m0-step5` | ✅ **0.000%** on all six captures — the live site is unchanged |
| `npm run converter:test` | ✅ **17/17** — boot guard, both fixtures, substitution report, 1600 px WebP, sniffing |
| `npm run build` | ✅ builds clean, unchanged from session start |
| `supabase/` untouched | ✅ |
| `public/` | ⚠️ **ten static assets added** in `3d43108` — see above; invariant 11 unaffected |
| `npm run qa` | ✅ **44/44** on every commit of the branch |

## ✅ Resolved — the three stray test rows are gone

The QA suite was run against production rather than the stub (DEC-023) and wrote three test rows to
the live `registrations` table. **They have been deleted.** Verified: the table went from 22 rows to
**19**, with **zero** `@example.com` rows remaining — 19 is the real pre-launch signup count.

It could not recur: `scripts/qa.mjs` now refuses to start unless `SUPABASE_URL` is localhost, and
`npm run qa` wires the stub itself.

**How it was finally done, worth knowing:** `supabase db query --linked` executes SQL through the
**Management API** using the CLI access token — **no database password needed**. Earlier attempts
failed because the cached pooler URL carries no password and there is no `psql` on this machine.
This is the way to run one-off SQL against production.

## M0 progress

| Task | Status |
|---|---|
| `scripts/traceability.mjs` + gate | ✅ done — 251/64/112, no gaps |
| **Fix `scripts/qa.mjs`** | ✅ done (DEC-023) — **44/44, repeatable**, was crashing |
| `npm run qa` orchestrator | ✅ done — stub + server + suite, wired and torn down |
| ~~Three Supabase projects~~ → **local + CI** (DEC-025) | ✅ **local Supabase running** — 12 containers healthy, both migrations apply to a clean DB. $0 |
| Playwright, jsdom, `@testing-library` | ✅ done — `8587a28`. Vitest `unit` + `components` projects, Playwright `desktop` + `phone`, CI `e2e` job |
| GitHub Actions with the four blocking gates | ✅ done (DEC-028) — 7 jobs; `policy-diff` written and self-tested |
| Monorepo restructure | ✅ done (DEC-029) — the app stays at the root; nothing moves |
| **Font work** (`REQ-DSG-016`, `REQ-INT-009`) | ✅ done — Option A, **DEC-031**, `8b1b705`. `packages/fonts` is the manifest; `fonts:check` gates CI and both images |
| Visual diff of the frozen routes (`npm run visual`) | ✅ done — baseline captured at `.qa-shots/visual/m0-before`, deterministic at 0.000% |
| **Shaping-parity harness (Tiers A and B)** | ✅ done (DEC-024) — `npm run parity`, 7 cases, green, and proven able to fail |
| graphile-worker + LISTEN/NOTIFY probe | ✅ **built and proven locally, not hosted** — **DEC-034**, `d3de903`. Two-connection probe; refuses pgbouncer and Supavisor in transaction mode, passes session mode; CI `worker` job runs both outcomes. **Hosting is OQ-027, due at M3** |
| Credential-free converter app | ✅ built and tested, **not hosted** — **DEC-032**, `converter/`. `fly.toml` removed (DEC-034); host with the worker at M3 |
| Radix + the ~8 inline SVGs | ✅ done — `78ff5a6`. `radix-ui` 1.6.7, `Direction.Provider` in the layout, `icons.tsx`, `dialog.tsx`, jsdom tests |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | ✅ **set** — Production and Preview, as a sensitive variable, piped from a local file and never printed; production rebuilt with it (deployment `kareem-marefa-4x451q4oj`), frozen routes re-verified. Rotating it casually breaks in-flight action IDs (`04` §9.2) |

## The parity spike answered the biggest open question

`npm run parity` — 7 cases, Tiers A and B, green and repeatable. **Headless Chromium holds Arabic
parity**: 0.000% pixel drift between renders, lam-alef forming correctly, stacked tashkeel
positioned and unclipped. A substituted face is caught at 2–10% pixel difference and by advance
drift on every case, verified with `--break-font`.

**So D66 is achievable through this pipeline and M6 can be planned on it.** That was the riskiest
unknown in the product.

Two silent traps found on the way, both recorded in DEC-024 because they will recur in M6:
`font-display: block` hides glyphs while metrics still resolve (blank captures that measure fine),
and in an RTL document an overflowing absolutely-positioned element overflows **leftward**, shifting
the scroll origin so element screenshots capture the wrong region. Both produced blank goldens that
passed everything. The harness now refuses to write a golden below 0.1% inked pixels.

**Not yet covered:** the four export paths of `REQ-DSG-015` (poster PNG/PDF, certificate PDF, slide
page images). Those need the worker image and the designer — M6. The suite is built so each path
plugs into the same seven cases.

## Wave 2 (M3 · M4 · M5) — PREPARED on `wave-2/m3-m4-m5`, waiting for the owner's approval

**Done this session (the wave-2 lead, 2026-09-14), before anyone is spawned:**

- **`main` @ `e0b448d`** (PR #12 merged, CI green on the last three pushes to `main`); local Supabase
  healthy; `wave-2/m3-m4-m5` cut from it.
- **Migration `0024_session_transition_guard`** — the table-level guard on `sessions.state` DEC-045
  deferred, plus `occurred_at default clock_timestamp()` on `audit_log` and
  `session_state_transitions`. The guard exposed a real conflict: `0020`'s presenter-decline trigger
  returns a session to `draft`, an edge the frozen `02` §6.2 never drew but `REQ-PRO-007` defines;
  `02` is amended under **DEC-046** rather than the guard breaking the decline. Two fixtures that
  jumped states now walk legal edges; `tests/rls/sessions-guard.test.ts` adds six cases.
  **Gates:** `supabase db reset` ✅ `0001`–`0024` · `npm run test:rls` ✅ **212 passed / 4 todo, 20
  files** · `policy-diff` ✅ · traceability ✅ (matrix regenerated) · tsc ✅ · lint 0 errors.
  Commit `29ffbef`.
- **DEC-046** also records the owner's two standing decisions: **OQ-027 closes for wave 2 without
  a host** (the worker stays a host-agnostic Docker image, locally and in CI; the production host
  is chosen at Launch with PR C) and **email in development and CI goes to a sink, never a
  provider** (Mailpit on `:54324`/SMTP `:54325` locally, an in-memory transport in CI; Resend is
  wired at Launch).
- **`.claude/agents/{notify,scoring,content}.md`** written from the wave-1 template with the
  ownership globs below. Not committed until the owner approves the plan.

**The owner approved the plan as presented (2026-09-14; `content` stays on Sonnet) and set the
wave goal:** every wave-2 story done by its teammate, the definition of done proven on the branch,
the three demonstrables passing locally, decisions logged, the wave-3 handoff here, teammates shut
down, PR open with CI green; no merge, no hosted Supabase, no Vercel, no real mail provider.

**Pre-spawn tasks — all done (lead, 2026-09-14):**

| # | Task | Commit / proof |
|---|---|---|
| 1 | `0025_enqueue_job` — `public.enqueue_job()`, the one door to the queue; `scripts/rls.mjs` installs the `graphile_worker` schema before every RLS run, CI's `rls` job after the migrations | `74ba237` · `test:rls` **217 passed / 4 todo, 21 files** · policy-diff ✅ · traceability ✅ |
| 2 | `worker/Dockerfile` (host-agnostic, worker workspace only, runs as `node`) + CI builds it and runs the probe inside | `08863a7` · local build 394 MB, in-image probe against local Supabase **OK, 6 ms** |
| 3 | `[local_smtp] smtp_port = 54325` — Supabase stopped and started, port answers | `08863a7` |
| 4 | `TEAM.md` §1 (confirmed rows + the wave-2 contracts) and `CLAUDE.md` § Agent team | `52d9e49` |
| 5 | Pushed; **draft PR #13** open at the first push; `notify` (opus), `scoring`, `content` (sonnet) spawned with their first tasks (plan in `docs/plan/notes/<name>.md`, then the milestone schema as proposed SQL, then the first story) | — |

### Sync log

| Sync | Promoted | Gates |
|---|---|---|
| 0 (2026-09-14) | 0024, 0025 (lead, pre-spawn) | CI on the first push of PR #13 (`52d9e49`) **all jobs green** — the `rls` job with the schema install and the new in-image worker probe included; `.next` rebuilt fresh after spawn |
| 1 (2026-09-14) | `0026_notification_contract` (`notify`, unchanged; `aa98bec`) · `0027_m4_schema` (`scoring`, + the lead's `points_ledger_append_only` trigger and an org-cascade clause in all three guards; `53b5013`) · `03` §8.2 +36 rows · fixtures `fixture-m3.ts`, `fixture-m4.ts` (the sweep is non-vacuous) · the bell wired into the shell (`cc5c908`) | reset ✅ 0001–0027 · `test:rls` green on every committed file (the red files are untracked WIP — a wave rule now: never save a failing test under `tests/rls/`) · policy-diff ✅ · traceability ✅ · tsc ✅ · build ✅ 32 routes · CI green on `513a4bf` after a re-push (the first push carried a stale traceability matrix — regenerate and commit it in the same commit as any `03` change) |
| 2 (2026-09-14) | `0028_award_points` (award_points() + the check_in() replacement at 0015's TODO) · `0029_award_hooks_ratings_comments` (SQL-only hooks into `event`'s tables) · `0030_send_notification` (send context with the send-time re-check; delivery log append + provider-scoped update) — all unchanged · `03` §8.2 +10 rows · worker `taskList` gains `award_points`, `send_notification` · `npm run db:reset` reinstalls the queue schema · **fix(i18n)**: `NumeralSystem` spelled `arabic` while the enum says `arabic_indic` — Arabic-Indic orgs got Western digits everywhere; found by `notify`, fixed at the source in four wave-1 DAL DTOs | `db:reset` ✅ 0001–0030 · `test:rls` green on every committed file (6 red = `content`'s untracked WIP) · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors (13 warnings, pre-existing) · `worker:build` ✅ · CI on `e2119ed` **all jobs green** |
| 3 (2026-09-14) | `0031_award_presenter_points` · `0032_manual_adjustment_and_reversal` · `0033_audit_balances` · `0034_reminders` (+ `cancel_job()`, enqueue_job's twin; the RSVP notices as a trigger on `rsvps`) · `0035_reminder_sends` — all unchanged · `03` §8.2 +17 rows · worker `taskList` +7 (presenter points, no-shows, balance audit, reminder, nudge, rating prompt, reconciliation) · the runner check is now `pgrep -fl "node_modules/.bin/vitest"` (the old grep matched other agents' waiting shells) | `db:reset` ✅ 0001–0035 · `test:rls`: one `notify-contract` case red (queue rows the fixture's RSVP inserts now enqueue — handed back) + content's 6 untracked WIP · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · `worker:build` ✅ · push waits on the notify fix · `.next` rebuilt 08:47 on `dbeca9c` (bell + points strip wired; an orphaned `next start` from the previous session — ppid 1, no gate lock, 5 h old — was holding port 3000 and is gone; a waiter must use `pgrep -fl next-server`, since `pgrep -f "next start"` matches the waiter itself) |
| 5 (2026-09-14) | `0037_m5_schema` (`content`, unchanged — 11 tables, `reports.photo_id`, `ar_normalize()` + `sessions.search_vector` (an additive ALTER on a frozen table, for the DEC), the six buckets with nine `storage.objects` policies, `remove_material()` — a real finding: an UPDATE's result must satisfy the SELECT policy, so `removed_at` can only be set by a definer RPC) · `03` §8.2 +23 rows, §6.9 lists the nine bucket policies for the gate · `fixture-m5.ts` (the sweep is non-vacuous for all 11) · worker `taskList` +3 (`calendar_upsert`, `calendar_delete`, `refresh_calendar_tokens`) and crontab lines for the hourly token sweep and the nightly balance audit · one lint fix in `notify`'s SCR-025 (an `<a>` to a Route Handler is right; the page rule is silenced with the reason) · **the first attempt at this commit (`8cdd08e`) carried only the traceability matrix** — a failed edit in a `&&` chain skipped the path list; the real commit follows | `db:reset` ✅ 0001–0037 · `test:rls` green on every committed file · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · `worker:build` ✅ · CI: see below |
| 4 (2026-09-14) | `0036_session_notices` (`notify`, unchanged — the REQ-SES-009 change notices with both values, publish and cancel notices, all guarded on the state EDGE so publish_session()'s four-row walk announces once) · `03` §8.2 +5 rows · `AddToCalendar` wired into the event page's RSVP rail · the `notify-contract` queue count fixed by the lead (setup() clears the queue the fixture's RSVP notices fill) | `db:reset` ✅ 0001–0036 · `test:rls` green on every committed file (red = `content`'s 6 and `scoring`'s `recognition-evaluators` 2, both untracked WIP) · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · `worker:build` ✅ · CI on `5357dc0` (syncs 3 + 4) **all jobs green** |

## M2 — wave 1 — COMPLETE on `wave-1/m2` (merged as PR #12)

**The M2 demonstrable holds locally, end to end, through the real screens**, as one serial Playwright
test against real local Supabase (`tests/e2e/sessions-screens.spec.ts`, commits `a3f8497`, `38e72d8`): add a
venue → propose → approve → create the session → schedule → publish → reserve a seat → **the clock
starts it** (`clock_start_sessions()`, audit row with no actor) → staff read the rotating code →
check in with it → comment → **an admin completes it** (audit row naming the admin) → rate. Rows
asserted at every step: `rsvps.status`, `check_ins.method = 'code'`, the comment's author, the
rating's stars and non-null `check_in_id`, no live code after completion, the seven-step transition
chain, the seven `audit_log` actions in order.

### Shipped

Migrations **`0011`–`0023`** (13, `supabase/proposed/` empty) · screens SCR-011, 012,
014, 015, 016, 017, 018, 041, 042, 043, 046 · DAL modules `proposals`, `sessions`, `rsvp`,
`checkin`, `comments`, `reactions`, `reports`, `ratings` · the slot contract and all three slots ·
worker tasks `promote_waitlist`, `rotate_codes`, `start_session`, `complete_session` (clock on an
every-minute crontab) · message namespaces `proposals`, `sessions`, `admin`, `rsvp`, `checkin`,
`event`, `ratings` (Arabic first) · **DEC-042 … DEC-045**.

### Definition of done on `b430871`

**Gate run: (the lead's final gate run, all on local Supabase; app code last changed at `a3f8497`):**

| Check | Result |
|---|---|
| `supabase db reset` | ✅ `0001`–`0023` |
| `npm run test:rls` | ✅ **206 passed / 4 todo**, 19 files, sweep over 24 tables |
| `npm run policy-diff` | ✅ |
| `node scripts/traceability.mjs` | ✅ 251 / 64 / 112, no gaps, matrix current |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ 0 errors (8 warnings) |
| `npm test` (unit + components) | ✅ **117 passed** |
| `npm run worker:build` · `npm run fonts:check` | ✅ |
| `npm run build` | ✅ 25 routes |
| `npm run qa` | ✅ **44/44** |
| `npm run visual compare m0-final wave1-final` | ✅ **0.000%** on all six captures — the live site is unchanged |
| `npm run test:e2e:local` | ✅ **78 passed / 0 failed / 6 skipped by design** (two workers, both profiles; includes the end-to-end demonstrable) — final code `b430871` on the build of `a3f8497` (later commits are test/docs only) |
| `npm run test:e2e:unconfigured` | ✅ 16 passed, 68 skipped by design (both `NEXT_PUBLIC_` variables empty: every platform route 404, frozen routes untouched) |
| CI on PR #12 | ✅ **13/13** on `a3f8497` and on every push since sync 3; final run on `b430871` **13/13 green** (the STATUS commit after it is docs only) |
| 390 px RTL captures, looked at | ✅ SCR-012, 014, 015, 016, 017, 018, 041, 042, 043, 046 (`.qa-shots/rtl/`; the lead looked at SCR-012) |

### Observed once, recorded honestly

 the first full-suite gate run on this build failed the
demonstrable on both profiles, and the artefacts show `next start` stopped answering mid-run
(`net::ERR_CONNECTION_REFUSED` on a plain navigation on the phone project; Next's own "This page
couldn't load" on desktop) while two other agents were running suites on the same machine. The
rerun with the identical two-worker configuration passed 78/78, and the walk passes alone on both
profiles. Nothing in the product was wrong; `38e72d8` also fixed six test-side races and wrong
assertions found on the way. **For the wave-2 lead:** the demonstrable is the heaviest test in the
suite and runs twice concurrently against one `next start` and one Postgres; if this recurs, give
it `workers: 1` or a serial project dependency in `playwright.config.ts` (lead-only), and keep the
stub server's log — a crash names the route, a teardown race does not.

### Deferred, not faked (DEC-045)

 `REQ-PRO-004` (M5 materials) · the poster gate of `REQ-SES-001`
(M6) · `REQ-EVT-007` reply notifications (M3) · job enqueueing from the RSVP/check-in RPCs (worker
hosting, OQ-027 at M3; call sites marked) · the native date picker's locale on SCR-043 (M7-console).

### First migration of wave 2, before anyone is spawned

 a table-level guard on `sessions.state`
(and move the fixtures that set state directly onto the RPCs); decide `audit_log.occurred_at` →
`clock_timestamp()` at the same time.

### Security findings closed this wave

 (each a real hole in the plan or in `0010`): a named
presenter could be pulled across the tenancy boundary (`0012`); the `03` §7.2 host-topic sample
had no org check (`0016`); the admin's direct select on `ratings` was an unaudited read of per-rater
data (`0017`); `check_in()` as sketched rolled back its own attempt row (`0015`, DEC-043).

### Sync log


**Started 2026-09-14** after the owner approved the wave plan. Pre-flight on `main` @ `5378555`: CI
green on the last five pushes, five frozen routes answer, `/ar/app` 404 by design, local Supabase
healthy, `supabase db reset` applies `0001`–`0010`, `npm run test:rls` 95 passed / 4 todo.
`wave-1/m2` cut; `docs/plan/notes/` created for the teammates' plans.

**Spawned:** `sessions` (opus) → slot contract first, then STORY-PRO-001 onward · `checkin` (sonnet)
→ STORY-RSV-001 (`reserve_seat()` as proposed SQL) onward · `event` (sonnet) → STORY-EVT-002
(threaded comments + the private Realtime channel) onward, since EVT-001 is the page `sessions` owns.

**Promoted SQL, sync points and CI runs are logged below as they happen.**

| Sync | Promoted | Gates |
|---|---|---|
| 1 (2026-09-14) | `0011_proposal_transitions` (audit + guard triggers, `98db766`) · `0012_copresenters` (same-org guard on both presenter tables, `create_proposal()`, `aaa9f95`) — `03` §8.2 +5 rows | `supabase db reset` ✅ · `test:rls` **163 passed / 4 todo**, all 15 files incl. teammates' ✅ · `policy-diff` ✅ · tsc ✅ · lint ✅ · build ✅ after three `"use server"` constant exports were moved out (`3cded54`, `9b2a4a7`; the Next 16 rule tsc cannot see) · `npm run qa` **44/44** · `npm run visual compare m0-final wave1-s1` **0.000%** on 6 captures · `test:e2e:local` 42 passed / **4 failed** (all in `sessions`' two new specs, handed back) · pushed; **draft PR #12** open so CI runs per push |
| 2 (2026-09-14) | `0013_proposal_review` (`review_proposal()`) · `0014_rsvp_rpcs` · `0015_check_in_rpcs` (`2faff35`) — **DEC-043** (outcome envelope, not raise-after-write) · worker `taskList` gains `promote_waitlist`, `rotate_codes` | reset ✅ · `test:rls` 174/4 todo ✅ (two false failures traced to a **concurrent teammate run** — the suite is single-runner) · policy-diff ✅ · tsc/lint/unit 117 ✅ · build ✅ · qa **44/44** · visual **0.000%** · CI: 12 pass, **RLS ✗** — bare container has no `realtime` schema (fixed at sync 3) |
| 3 (2026-09-14) | `0016_realtime_authorization` (host topic org-scoped) · `0017_ratings_admin_audited` (**drops** `ratings_read_admin`) · `0018_comments_self_delete` · `0019_rating_count` — **DEC-044** · CI shim gains `realtime.messages` + `send()` · `03` §5.6/§7.2/§8.2 corrected | reset ✅ 0001–0019 · `test:rls` **188 passed / 4 todo**, 17 files ✅ · policy-diff ✅ · traceability ✅ · tsc ✅ · build ✅ · CI on `93f6734` **13/13 green** (Realtime shim proven) |
| 4 (2026-09-14) | `0020_session_creation` (`create_session()`, one session per proposal, decline returns to draft) `93f6734` | reset ✅ · RLS green for all promoted files · policy-diff ✅ · traceability ✅ |
| 5 (2026-09-14) | `0021_session_scheduling` (`schedule_session()`, `publish_session()` — the poster gate waits for M6) · `0022_session_clock` (`clock_start/complete_sessions()`, service_role only, forward-only; `11` §2.1's manual-skip is the state filter) `c6d07b1` · worker `taskList` gains `start_session`, `complete_session` on an inline every-minute crontab | reset ✅ 0001–0022 · `test:rls` 195/4 todo (one collision) ✅ alone · policy-diff ✅ · traceability ✅ · `worker:build` ✅ · build ✅ · **full `test:e2e:local` 66 passed / 6 failed** = one case per track on both profiles, handed back (`checkin.spec.ts:151`, `event-comments.spec.ts:123`, `sessions-propose.spec.ts:194`) |

**Lead decisions and findings during the wave (not re-litigations):**

- **DEC-042** — `sessions` owns `app/admin/{proposals,sessions,venues}/**` for wave 1; SCR numbers in
  the agent definitions corrected to `09`'s.
- **`scripts/policy-diff.mjs` keys relations by schema** (`1b7b220`): the first migration to policy
  `realtime.messages` (`03` §7.2) would have failed the gate with a misleading message, and a grant on
  it could not be parsed at all. A Supabase-owned relation's documented policies are flagged only once
  a migration policies it; that migration must state its grant.
- **`REQ-PRO-004` (draft materials on a proposal) is deferred to wave 2 / M5** — no `materials`
  table exists and the requirement inherits every `REQ-MAT-*` rule. `sessions` did not fake it
  (`docs/plan/notes/sessions.md` §2.1). STORY-PRO-002 is done except for that half.
- **Open for a lead decision, not blocking:** `audit_log.occurred_at` defaults to `now()`, the
  transaction timestamp, so several audit rows from one transaction share an instant and their order
  is undefined. `clock_timestamp()` would fix it; `02` is frozen so it needs a DEC.
- **`proposals` has no admin update policy in `0010`** (only the proposer's), so review actions are a
  definer RPC — `supabase/proposed/sessions/0003_proposal_review.sql`, in progress.
- **The RLS suite is single-runner.** Two processes running `npm run test:rls` against one local
  database collide on fixtures and fail unrelated files (seen twice at sync 2). Check
  `ps aux | grep 'vitest run --project rls'` before running it.
- **The shared git index races.** Three commits this wave carried another teammate's staged files
  (`d42bcf1`, `5c4f97f`, `6efd2c8`); content intact, attribution wrong. Stage by explicit path and
  commit immediately.
- **Wave-1 tests that touch the working tree:** the shared tree builds as it stands on disk; a
  mid-edit DAL or a `"use server"` constant breaks `npm run build` for everyone. tsc does not catch
  the latter.

## M2 — wave 0 (previous session, PR `m2/schema` — merged as #10)

**Done, awaiting merge:** migration `0010` — the whole M2 schema with RLS, grants, the guard
triggers, `is_presenter_of()` / `has_checked_in()` and the presenter-only aggregates view; no RPCs
(those are the teammates' first proposed files). `03` §8.2 gains rows for the six pattern tables.
The message catalogue is split per namespace (`src/messages/{ar,en}/<ns>.json`, merged by
`src/messages/index.ts`). The gate lock (`scripts/lib/gate-lock.mjs`) serializes `npm run qa`,
`npm run visual`, Playwright's server, the unconfigured build and the `TaskCompleted` hook on
`/tmp/task-gate.lock`. `applyProposed()` and `supabase/proposed/` carry the migration rule.
`.claude/agents/{sessions,checkin,event}.md`, the settings allow/deny lists, `CLAUDE.md` § Agent
team and `TEAM.md` (with the spawn prompt) are in place. **Nothing was spawned.**

**Proof on the branch:** `supabase db reset` applies `0001`–`0010` · `npm run test:rls` **95/95 +
4 todo** (the sweep now walks 24 tables) · `npm test` 69/69 · `npm run qa` 44/44 · `npm run
visual compare m0-final m2-schema` **0.000%** · `npm run test:e2e:local` 34/34 · policy-diff and
traceability green.

**Next session = the lead.** Start it with the prompt in `TEAM.md` §4, from a green `main` after
this PR merges. Wave 1 is `sessions` (opus), `checkin` (sonnet), `event` (sonnet).

## M1 — where it stands

**PR A (#4) and PR B (#6) are merged into `main` (`e253ea0`, `453e540`); CI on `main` and the Vercel production deploy succeeded; the five frozen routes answer.** GitHub closed the original PR B (#5) when its base branch was deleted, so it was re-opened unchanged as #6.

**PR A (#4, `m1/tenancy` → `main`) — merged.** Migrations `0003`–`0006`;
`tests/rls` with 61 tests on local Supabase and on the CI shim; `policy-diff` green; DEC-035.

**PR B (#6, `m1/app` → `main`) — merged.** Slice 1 (`6221c06`):
`@supabase/ssr` clients, the DAL with `requireSession()` narrowed on `data`, `proxy.ts` with
report-only CSP, DEC-036 and OQ-028, the README's `NEXT_PUBLIC_` invariant retired. Slice 2
(`b922197`): sign-in, callback, choose-org, no-access, sign-out, the app shell, home, profile,
another member's page, migration `0007` (Before User Created hook, `REQ-AUT-006`), the auth e2e
spec and the signed-in e2e spec. Slice 3 (`bf3e67f`): what the signed-in e2e found — `/api/*`
excluded from the proxy matcher (next-intl was rewriting the auth Route Handlers), the home page's
rich messages, and migration `0008` (the domain audit trigger broke org deletion on cascade).

**Proof on `bf3e67f`, all on real local Supabase:** `supabase db reset` applies `0001`–`0008`
cleanly · `npm run test:rls` **66/66** · `npm run test:e2e:local` **34/34** (unauthenticated,
CSP, Route Handlers, and the signed-in home/profile/member/sign-out flows) · `npm run qa`
**44/44** · `npm run visual compare m0-final m1-final` **0.000%** on six captures, frozen HTML
with no nonce attribute · unit + components 66/66 · `policy-diff`, traceability, tsc, lint clean.
Live hook probe through the local Auth API: a sign-up on an unlisted domain → **403
`domain_not_allowed`**, zero orphan rows; on a listed domain → token issued.

**Two things PR B learned that the plan did not know:**

- **A nonce in the CSP header makes Next render prerendered pages dynamically** and stamp every
  script tag. The frozen marketing routes therefore get a **nonce-less** report-only policy; the
  platform routes get the nonced one. The visual diff and the e2e spec pin it.
- **`supabase db reset` does not reload `config.toml` auth hooks** — a hook enabled there needs
  `supabase stop && supabase start`.
- **`supabase start` can hang silently on a macOS Keychain dialog.** Because the CLI is linked to
  the hosted project it reads its access token from the Keychain item "Supabase CLI" on every
  start; when macOS asks whether `security` may read it, the CLI waits forever with no output —
  it looks like a slow Docker pull. The tell is an orphaned
  `security find-generic-password -s "Supabase CLI"` process. Click **Always Allow** on the
  dialog (owner's screen), then start again. Cost one session an hour.

**Pre-cutover PR (`m1/pre-cutover`, both decisions approved by the owner on 2026-09-14):**

- **DEC-037** — migration `0009` revokes `anon`'s `TRUNCATE` on the frozen `registrations` table;
  the owner ran the same statement in the hosted SQL editor (2026-09-14, verified: anon keeps
  `insert` only, 19 rows intact).
- **DEC-038** — the frozen marketing files now live in `src/app/[locale]/(marketing)/` with their
  own layout (header, `main`, footer); the locale layout renders only the providers. URLs and HTML
  unchanged: `npm run visual` 0.000%, `npm run qa` 44/44. The `(auth)` and `app` layouts render
  their own `main` under the wordmark. **The unconfigured guard:** with the two `NEXT_PUBLIC_`
  variables unset — production until launch — the build succeeds, every platform route and auth
  screen is a 404 through the marketing catch-all, the auth Route Handlers answer 404, and the
  frozen routes are untouched. Proven by `npm run test:e2e:unconfigured` (builds with both empty:
  16 e2e pass, 24 skip by design; on that build `npm run qa` 44/44 and the visual diff 0.000%) and
  by the CI `unconfigured` job.
- Observed once, not reproduced: the `signing out` e2e failed in one full run (`toHaveURL`) and
  passed on the rerun and alone. If it recurs, suspect the two workers' timing on the stubbed
  server, not the app.

**Still deliberately out of M1:**

- Admin CRUD screens (domains, settings, companies, categories, venues, members): policies and
  RPCs exist and are tested at the database; UI is M2/M7 per `09`.
- Sign-in rate limiting (`12` §3: 10 per IP per 5 min) needs a shared store; Supabase Auth's own
  limits apply meanwhile. Noted for M2 with the first Route Handler that needs one.
- `worker/src/supabase.ts` (the `createWorkerClient()` of `04` §5.1): with M3's first job.

## PR C — production cutover checklist (deferred to **Launch** by DEC-039; NOT started; every step needs the owner's explicit go)

Run in this order, on `main`, **on launch day** (`14` Launch). Nothing here has been done, and nothing here is started before then. Migrations to rehearse: everything from `0003` onward.

1. **Rehearsal (no production change):** `supabase db dump --linked --schema-only` → apply to a
   fresh local database → apply `0003`–`0007` on top → `npm run test:rls` against it → delete the
   dump. Migrations are `0003`–`0008`. This is the "tested against production-shaped data" of invariant 3.
2. **Hosted project, JWT signing:** enable **asymmetric JWT signing keys** (Dashboard → Auth → JWT
   keys). Without them `getClaims()` falls back to a network call on every request (DEC-036).
3. **`supabase db push`** (owner's explicit go; the only step that changes the production schema).
   `registrations` is not referenced by any migration; verify with
   `supabase db query --linked "select count(*) from registrations"` before and after.
4. **Hosted Auth settings** (Dashboard → Auth): JWT expiry **900 s**; enable the **Custom Access
   Token hook** → `public.custom_access_token_hook`; enable the **Before User Created hook** →
   `public.before_user_created_hook`; Google provider **on** with the OAuth client below; add the
   callback URL `https://kareem.pp.sa/api/auth/callback` (and the Vercel preview pattern) to the
   redirect allow-list; Site URL `https://kareem.pp.sa`.
5. **Google OAuth client** (Google Cloud console, owner's account): authorised redirect URI
   `https://qnwbgzsgkftqaixzuhdo.supabase.co/auth/v1/callback`; paste client ID and secret into the
   Supabase provider settings — never into the repo or Vercel.
6. **Vercel:** add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for
   Production and Preview (the hosted project's URL and **publishable** key), then redeploy.
7. **First org, by one-off SQL** (`supabase db query --linked`, never a migration): insert the
   owner's auth user into `platform_admins` after their first sign-in attempt creates it — note
   the Before User Created hook refuses a domain on no list, so **create the org first with the
   owner's domain**, sign in, then insert the `platform_admins` row; or insert the org through
   `create_org()` as `postgres`. Values needed: name, slug, certificate prefix, allowed domain(s),
   first admin email. `create_org()` seeds settings and the four categories.
8. **Verify:** sign in with the first admin's Google account → lands on `/ar/app` as `admin`; a
   second account on the domain lands as `member`; an account on another domain is refused at
   Google's return with the closed-door message; `npm run qa` against production stays 44/44.
9. **Observe the CSP reports** from a preview deployment before any enforcement (OQ-028).

**CI on the final commits, read with `gh` after the owner re-authenticated `ebnmajed`:** PR #4
(`m1/tenancy` @ `91a3787`) and PR #5 (`m1/app` @ `a8da01d`) each pass all twelve checks — RLS
policies, build, converter image, end to end, frozen routes, plan gates, shaping parity, types
and lint, unit tests, worker probe, Vercel, Vercel preview comments. **`gh` gotcha for the next
session:** another Claude session on this machine re-authenticates `gh` as `devyaden`, which
invalidated the stored `ebnmajed` credential mid-session (401). `gh auth switch --user ebnmajed`
is not enough then; `gh auth login -h github.com -p https -w --skip-ssh-key` is (this gh has no
`-u` flag). Pushes use the SSH alias and are unaffected.

**Owner inputs PR C needs, by name:** `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`
(entered in the Supabase dashboard only) · the first org's **name**, **slug**, **certificate
prefix** (2–5 capitals), **allowed email domain(s)**, **first admin email** · approval to enable
asymmetric JWT keys · approval for `supabase db push` · approval for the two Vercel variables ·
approval to move the frozen files into a `(marketing)` route group (next app PR).

**Also for the owner (found in PR A, not acted on):** `anon` holds `TRUNCATE`, `REFERENCES` and
`TRIGGER` on the frozen `registrations` table from the project's old default privileges. Not
reachable through PostgREST; a `revoke` would touch the frozen table's privileges — your call.

## Waiting on the owner

**Nothing.** The owner ran DEC-037's `REVOKE` in the hosted SQL editor on 2026-09-14; verified read-only with `supabase db query --linked`: `anon` has no `truncate`, keeps `insert` only, and the 19 registrations are intact. M2 starts on local Supabase and CI.

**OQ-027 answered for wave 2 (DEC-046):** the worker and converter run as host-agnostic Docker
images locally and in CI; the production host is chosen at Launch with PR C. Nothing in wave 2
waits on it. **Owner input due at Launch, not now:** a Google OAuth client with calendar scopes
(the M3 sync runs against a stub in tests) and the Resend account.

**Open for the owner at the wave-2 plan:** approval of the ownership globs; whether `content`
runs on Opus rather than Sonnet (it holds the storage-prefix boundary, the one place isolation
depends on application correctness).

## Blockers

**None for the plan.** Every open question carries a default that is already in force, so no work
is blocked on an answer.

**One for the owner:** the three test rows above. Nothing is blocked on it, but the table is meant
to be pristine history.

**Resolved since the plan was written:**

- **DEC-021** — the owner confirmed the Realtime trade (**Option A**): browser Supabase client,
  `NEXT_PUBLIC_` variables, **RLS as the sole boundary**. Server polling is a *rejected*
  alternative, not a standing fallback. M0's spike is now implementation. The practical
  consequence for every later session: **the generated isolation sweep (`03` §8.1) is
  load-bearing** — never weaken it, never skip a table, never let it go red.
- **DEC-022** — the hardening DEC-021 exposed, and the plan had **missed**: Realtime does not
  inherit table RLS for broadcast and presence. Every channel is **private**, `realtime.messages`
  carries its own org-scoped policies, and changes broadcast **from database triggers** rather than
  via Postgres Changes. Written out as `03` §7, with six test cases in §8.2. **The isolation sweep
  does not cover this** — it walks tables, not channel topics, so Realtime needs its own tests.

**Still open, and deliberately parked by the owner:**

- **OQ-026** — hosting region and PDPL. The owner set this aside; the default (stay in
  `ap-southeast-1`) remains in force and nothing is blocked on it. Worth revisiting before real
  member data exists, since it is a configuration change now and a data migration later.

## This session — M0 steps 1, 2, 4 and 5 on `m0/foundation`

`main` was first confirmed deployable (CI green on every push through `335bde2`; the Vercel
Production deployment for it succeeded; all five frozen routes answer on the live domain). Then,
with the owner's approval of the step-1 plan ("Option A"), the branch landed in order:

| Commit | What | Proof |
|---|---|---|
| `0e969fa` | `npm run visual` — before/after diff of the frozen routes | two captures of one build: 0.000% |
| `8b1b705` | **Fonts, Option A — DEC-031.** `packages/fonts` is `ENT-fonts`; web faces are next/font's exact bytes; one merged TTF per weight for LibreOffice; `scripts/fonts/check.mjs` in CI and in the image builds | parity 0.000%; `fonts:check` OK; visual 0.000% |
| `8587a28` | **Playwright, jsdom, Testing Library.** Two Vitest projects; Playwright over `scripts/serve-stub.mjs`; the stub wiring shared in `scripts/lib/stubbed-server.mjs`; CI `e2e` job | 45 unit/component, 10 e2e |
| `78ff5a6` | **Radix + the eight glyphs.** `Direction.Provider` in the layout; `icons.tsx`; `dialog.tsx`; `ui.dialog.close` in both catalogues | QA 44/44; visual 0.000% |
| `db739a4` | **The credential-free converter — DEC-032.** `converter/`: zero-dependency Node over LibreOffice + poppler, boot guard against any credential, fonts from the manifest verified at image build; smoke test + CI `converter` job | smoke 17/17; QA 44/44 |

**Things the next session should know, none of which are in the plan:**

- **`content-visibility: auto` defeats full-page screenshots.** The first visual baseline had
  three solid-navy chapters and would have passed any diff. `visual-diff.mjs` forces the
  sections visible and refuses a capture with a skipped section or text at opacity 0.
- **IBM Plex Sans on Google Fonts is variable.** next/font emits one file for weights 400/500/600
  of the Latin face, which is why three manifest entries share a hash. Plex Sans Arabic is static:
  one file per weight, and four subsets each — the manifest keeps only Arabic and basic Latin
  (DEC-031 says why).
- **Vitest's `components` project must not carry `react-server`**, and next-intl must be inlined
  so `next/navigation` (extensionless, no `exports` map) resolves. Both are in `vitest.config.ts`
  with the reason.
- **Radix's `Direction.Provider` renders nothing**, which is why the layout could change with the
  visual diff at 0.000%. It also does not set `dir` on a dialog — only on primitives that position
  themselves — so a test asserting `dir` on the dialog is wrong, not the provider.
- **Lock file:** regenerated twice with `npm run lockfile` (CI's npm 10, in Docker). Do not
  `npm install` and commit the result.
- **`13` §1 still says Playwright/jsdom are "not installed".** Settled document; left for a DEC.

**Steps 3 and 6 were not done**, by the owner's instruction — see *Waiting on the owner*.

## Continuation — same day, owner present

1. **DEC-033** — `13` §1 says the test stack is installed; `Refs:` now sits in git's trailer
   paragraph (`1a75b0d`). CI on PR #2 stayed green.
2. **PR #2 merged** with a merge commit (`9002dbf`, owner's choice: keeps every cited SHA valid;
   main's first merge commit). Branch deleted. Vercel production deploy green; five frozen routes
   answer; CI on `main` green.
3. **Step 6 done** — see the table above. The Vercel project is now linked locally (`.vercel/`,
   gitignored; `vercel link` also appended `VERCEL_OIDC_TOKEN` to `.env.local`).
4. **Fly dropped** by the owner on cost — **DEC-034**, OQ-027, A34 superseded. Instead of
   deploying: `worker/` on `m0/worker` (**PR #3**), with the probe proven against Postgres,
   pgbouncer and Supavisor in both pooling modes, and a CI `worker` job. **The plan's probe was
   wrong** — one connection notifying itself passes through an idle transaction pooler; `04` §7.2
   and `11` §1.2 are corrected under DEC-034. The local pooler is now enabled in
   `supabase/config.toml` so the Supavisor case stays reproducible.

**GitHub account gotcha:** another Claude session on this machine switched `gh` to `devyaden`;
run `gh auth switch --user ebnmajed` before any `gh` call. Pushes use the SSH alias and are
unaffected.

## Next session should

1. You are on `wave-2/m3-m4-m5` (unpushed). **If the owner approved the wave-2 plan**, run the five
   pre-spawn tasks listed under *Wave 2 — PREPARED* above, commit the agent definitions, push,
   open the draft PR, spawn `notify`, `scoring`, `content` from `.claude/agents/`, and run
   `TEAM.md` §3 every few hours. **If not**, apply the owner's changes to the globs first.
2. Read `DECISIONS.md` DEC-046 and the three `docs/plan/notes/{sessions,checkin,event}.md` handoffs
   (the `TODO(notify, M3)` / `TODO(scoring, M4)` call sites in `0014`/`0015` are wave 2's hooks).
3. **PR C / Launch stays untouched** (DEC-039). Local Supabase and CI only. `RESEND_API_KEY` stays
   unset everywhere (DEC-046).
4. `.next` on disk is stale; run `npm run build` before `npm run qa` / `visual` / `test:e2e:local`.
5. Update this file before finishing.
