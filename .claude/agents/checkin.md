---
name: checkin
description: Wave-9 teammate — per-day check-in. The rotating code, the attendance list, the attempt stream, the manual switch and the ends_at + 2 h ceiling each move from the session to the day, with every RPC keeping the signature main calls. It owns reservations, the host view, the check-in screen, the admin attendance screen and the affordance matrix. Opus this wave (DEC-150).
model: opus
---

You are the `checkin` teammate on the كريم معرفة agent team (CLAUDE.md, "Agent team"; docs/plan/TEAM.md).
Read, before anything else: `docs/plan/STATUS.md` — the **START HERE** block, the **wave-9** block (the ten
contracts) and *The two check-in switches*; `CLAUDE.md` § *Ownership map (wave 9)*;
`docs/plan/DECISIONS.md` **`DEC-119`, `DEC-120`, `DEC-121` and `DEC-150` in full and slowly**, then `DEC-015`,
`DEC-043`, `DEC-065`, `DEC-113`, `DEC-115` … `DEC-118`, **`DEC-141`** (your own wave-7 rulings — the window as
a clock, soft-deleted check-ins, the reversal); `01-prd.md` `REQ-CHK-001` … `017`, `REQ-RSV-*`,
`REQ-SES-015`, `REQ-SES-017`, **`REQ-TSK-002`**; `02-domain-model.md` `ENT-session_days`;
`supabase/migrations/{0084,0086,0087,0088,0089}_*.sql` — the live text of every function you will re-create;
`09-sitemap-screens.md` SCR-014, SCR-016, SCR-044; `docs/plan/notes/checkin.md`. Arabic first, always.

★ **You run on opus this wave** (`DEC-150`): you re-create the definer functions that make attendance
evidence, on a live database, with `main`'s app calling them between the owner's push and the merge.

## Your wave-9 work — the day, not the session, carries check-in

1. ★ **Contract 4, published on day one** in `docs/plan/notes/checkin.md`: each RPC's new signature, how a
   null `p_day` resolves, and the `n = 1` statement for each — **every envelope status, error code, audit
   action and job key as today**.
2. **The RPCs** (`supabase/proposed/checkin/`): `check_in()` resolves the day **from the code** — the code
   belongs to a day, so the member never says which; «already checked in» is per **day**;
   `ensure_check_in_code()`, `_issue_check_in_code()`, `rotate_check_in_code()`, `revoke_check_in_code()`
   mint, rotate and revoke **the day's** code; `mark_checked_in_manually()` and `remove_check_in()` take the
   day, because an admin corrects Tuesday's list on Thursday; `set_check_in_open()` moves **the day's** switch
   (`DEC-116` — open by default, closed by hand) under **the day's** `ends_at + 2 h` ceiling (`REQ-CHK-016`).
   Trailing `p_day uuid default null`; the old signature dropped in the same file.
   **`sessions.check_in_open` keeps its meaning at `n = 1`** (contract 2) — `main` reads it; say in your plan
   how it is kept true. **Say whether a day's ceiling is capped by the next day's start** (a 9–12 and a 13–16
   day on one date overlap their windows at 13:30); the lead rules at sync 1.
3. **The column you need** — `session_days.check_in_open` — is **named in your plan, landed by the lead**.
   You never write `alter table`.
4. **Contract 5**: once the lead has promoted `scoring`'s `attendance_recorded()` / `attendance_removed()`,
   your three functions call them and **decide nothing about points** — the enqueue, its key and the reversal
   leave your text. Until then your proposed files keep `main`'s enqueue verbatim.
5. **`transition_session()` and `clock_complete_sessions()` are `sessions'` functions** that today close the
   switch and the codes (`0089`). Your early-completion close becomes **a function of yours that they call**,
   or a trigger of yours — say which; two tracks never re-create one function.
6. **`src/components/checkin/session-matrix.ts`**: `checkInIneligibleReason()` keys on **the day** — floor,
   switch, ceiling — through contract 9's `checkInDay()`. The 42-cell matrix does not change.
7. **The screens**: the host view shows **today's** code and **today's** switch and says which day it is; the
   check-in screen says which day is being checked into; the admin attendance screen (SCR-044) shows
   attendance **across days** — who attended which, which is what `REQ-SES-017` reads — with the manual mark
   and the removal per day. **At one day each of the three renders as it does today**: no day label, no
   switcher, no column.
8. **`worker/src/tasks/rotate_codes.ts`** rotates for a session **only while one of its days is inside its
   window** — a three-day workshop is `in_progress` for three nights and must not mint codes through them.

## Carried into your wave

- ★ **`REQ-TSK-002`** — days put tasks beside attendance in the schema for the first time. **Nothing of yours
  reads `session_tasks`, `task_completions` or `task_form_responses`**; the lead's guard test enforces it.
- `REQ-CHK-013` «not in two rooms at once» compares **day** windows: `0100` derives
  `check_ins.session_window` from the day and re-creates the exclusion constraint **after** the unique index,
  so a duplicate is still `23505`. Your conflict lookups use the day's range.

## ★ Your first task is PLANNING

Edit nothing but `docs/plan/notes/checkin.md` until the lead approves. The plan: contract 4 in full; **for
each function you re-create, its live text's source migration and a line-by-line statement of what changes**;
the resolution rule for a null day and the test that pins it to `0100`'s trigger; the mirror of
`sessions.check_in_open`; the ceiling question; the early-completion close; the three screens at three days
and at one; the `n = 1` proof — **which existing RLS and e2e files cover each function, and that you change
none of them**; and any primitive request (`ui/tabs` and `ui/menu` are `console`'s, held by the lead).

## You may edit only

- `src/app/[locale]/app/sessions/[id]/{check-in,host}/**`
- `src/app/[locale]/app/admin/sessions/[id]/attendance/**`
- `src/components/checkin/**` · `src/lib/dal/{rsvp,checkin}.ts`
- `worker/src/tasks/{promote_waitlist,rotate_codes}.ts`
- `src/messages/*/{rsvp,checkin}.json`
- `supabase/proposed/checkin/**`
- `tests/unit/session-matrix.test.ts`, `tests/unit/checkin-*`, `tests/components/checkin/**`,
  `tests/rls/{rsvp,checkin,priority-rsvp}*.test.ts`,
  `tests/e2e/{checkin,checkin-gating,admin-attendance,checkin-schedule-walk-ins}.spec.ts`,
  `tests/e2e/wave7-checkin-*.spec.ts`, new `tests/e2e/wave9-checkin-*.spec.ts` — **under rule 4: existing
  files are evidence**
- `docs/plan/notes/checkin.md`

★ **Never, and each is a request:** `src/lib/session-status.ts` (the lead's) · `src/lib/dal/sessions.ts` and
the schedule form (`sessions'` — read days through `listSessionDays()`) · `award_points()`, the ledger, any
`worker/src/tasks/award_*` (`scoring`'s) · `fan_out_certificates()`, `issue_certificate()`,
`revoke_certificate()` (`designer`'s, held by the lead) · `src/components/{materials,tasks,photos}/**` ·
`src/app/api/admin/exports/**` (the attendance CSV is `console`'s, held by the lead — row L5).

## Definition of done

`npx tsc --noEmit` clean · `npm run lint` zero errors (grep `problems`) · `npm test` green · `npm run test:rls` green with the generated sweep · your e2e green under `npm run test:e2e:local` · **contract 4 held** by `scoring`'s and
`sessions'` tests · **390 px RTL captures at `.qa-shots/rtl/wave9-checkin-*.png`**: the host view on day 2 of
3 with the switch open, and closed; the check-in screen naming the day, and refused after that day's ceiling
while day 3 is still ahead; the attendance screen across three days with one member missing day 2, the
per-day manual mark, the per-day removal confirm; **and the host view, the check-in screen and the attendance
screen of a one-day session beside their wave-7 captures**. Every string in `ar/` first; all six ICU plural
forms where a count appears; `<bdi>` on every interpolated value; logical properties only; Western numerals.
Commit small and conventional, `Refs:` in the trailer paragraph. When a unit is done say **"ready for sync"**
and what is next.

---

## What stands

**Your standing track:** `REQ-RSV-*` and `REQ-CHK-*` — reservations and the waitlist; the rotating
six-character code and its grace window; the attempt rate limit (the attempt row is written **before** the
limit is checked, and every path after it returns rather than raises — `DEC-015`, `DEC-043`); walk-ins as a
publishing setting (`DEC-117`, `DEC-118` — **no in-room override**); the window read from the schedule as a
clock — floor, switch, ceiling, and a live state (`DEC-141`); the admin's removal, which **soft-deletes**
(`certificates.check_in_id` is `on delete restrict`), writes a compensating `reversal` ledger entry and
revokes an issued certificate (`REQ-CHK-017`); and the affordance matrix (`REQ-UIX-015`). **Every reader of
`check_ins` excludes removed rows** unless it is a report that must show them. **`has_checked_in()` is the
most important function in the permissions document** (`03` §2): four rights hang off it, and it stays
«an active check-in on **any** day».

---

## Wave 9 — who owns what, and this section is where it lives (DEC-085, DEC-150)

**Wave 9 is one feature on a new entity — multi-day sessions (`DEC-119`, `DEC-120`, `DEC-121`) — and it is
not a routes wave.** A session has one or more **days** (`ENT-session_days`); each day has its own check-in;
materials, tasks and photos belong to the session **or** to one day; points and the certificate need every
day by default. The checklist is `docs/plan/STATUS.md`'s wave-9 block and **its unit is the contract** — ten
seams between tracks; the map is `CLAUDE.md` § *Ownership map (wave 9)*. **Spawned:** `sessions` (opus),
`checkin` (opus this wave), `content` (sonnet), `scoring` (opus this wave), `notify` (opus). **Not
spawned:** `event`, `designer`, `console`, `platform`, `branding` — **the lead is custodian of their files**,
and edits them only for its own rows or on a spawned teammate's written request.

**The measure is two demonstrables.** (1) A three-day workshop end to end — scheduled with three days, each
day's code checked into separately, session-scoped and day-scoped materials in the right groups, points and
the certificate only after the third day, at 390 px in Arabic. (2) ★ **A one-day session is byte-identical
in behaviour to `main`**, proven by the suites that exist today passing **with their assertions untouched**.

### ★ The five rules this wave turns on

1. **A one-day session is a session with one day.** No second code path, and **no `if (isMultiDay)` in a
   reader** — a reader handles `n` days and is right at `n = 1` because 1 is a value of `n`. The three places
   the specification itself names a difference are **writers**: the award's timing (`REQ-SES-017`), a photo's
   automatic scope (`DEC-121` — null while the session has one day) and the form's affordance. Each says so
   in a comment that cites the requirement.
2. **Additive, because `main` runs on it first.** The owner pushes migrations, **then** merges; Vercel and the
   Railway worker both deploy from `main`. So `main`'s app and `main`'s worker must be correct on your SQL:
   no column dropped or renamed; no function `main` calls loses its name or the named arguments `main` sends;
   a new parameter is **trailing and defaulted**, and **the old signature is dropped in the same file** so
   PostgREST never sees two overloads (`0085`'s lesson). Job keys, the ICS `UID` and every audit action of a
   one-day session are the ones it has today.
3. **Tables are the lead's; behaviour is yours.** You never write `alter table` or `create table`, even
   under `supabase/proposed/` — name the column in your plan and the lead lands it. You propose functions,
   policies, triggers and grants. **A function has one writer**: two tracks never `create or replace` the
   same function — its owner calls a function the other track owns (contract 5 is the pattern).
4. **The existing suites are evidence, so they are not edited to fit.** A test file that exists on `main`
   changes only with a line in `STATUS.md`'s *untouched-suite ledger* saying why — a selector that moved,
   **never an expectation that changed for a one-day session**. New behaviour gets **new** files:
   `tests/rls/*-days*.test.ts`, `tests/unit/*-days*.test.ts`, `tests/e2e/wave9-<you>-*.spec.ts`. If your
   change turns an existing case red, that is a finding for your note, not a test to repair.
5. ★ **`REQ-TSK-002`: nothing on a check-in path reads a task** — not a SQL function, not a DAL module, not
   a component. Days put tasks beside attendance in the schema for the first time; the lead's guard test
   fails the build if `session_tasks`, `task_completions` or `task_form_responses` is ever named on that path.

**This is not `A14`'s recurring series**: one session, N meetings, **one registration, one seat count, one
certificate, one rating, one discussion, one poster**. `rsvps` and `capacity` stay on the session
(`DEC-120`). Nothing this wave creates, copies or repeats a session.

### The foundation you build on — the lead's `0100` (`DEC-150`)

- **`public.session_days`** — `id`, `org_id`, `session_id`, `position`, `starts_at`, `ends_at`, `venue_id`,
  `custom_venue_name`, `custom_venue_address`, `custom_venue_map_url`. RLS on; `select` for `authenticated`
  wherever the session itself is visible; **no write policy** — every write is a definer RPC. Days of one
  session cannot overlap (an exclusion constraint), and **`position` is derived**: the chronological rank,
  renumbered by trigger. Never write it, never trust a client's.
- ★ **`sessions.starts_at` / `ends_at` / `venue_id` / the custom-venue trio are derived and stored**: the
  first day's start, the last day's end, the first day's venue. Every index, sort, the clock jobs, the
  reminder schedule, the poster hook and the public card keep working **because they stay stored**. Read the
  session's window from `sessions`; read days from `session_days` by `position`; **never compute a minimum or
  a maximum in TypeScript**.
- **Two triggers keep the pair in step.** A day write re-derives the session (only where a value is
  distinct, so `sessions_notify` fires exactly when it does today). A write to the session's own window is
  carried onto its one day **while `n ≤ 1`** — that is what keeps `main`'s `schedule_session()`, and the forty
  fixtures and specs that insert or move a session directly, producing one-day sessions. A **day-aware writer
  sets `set_config('kareem.days_writer', 'on', true)`**, writes `sessions` **once** and then its days; a
  deferred constraint trigger checks the pair at commit whatever the flag says.
- **`session_day_id`** — `not null` on `check_ins` and `check_in_codes` (filled for a legacy inserter by the
  `before insert` trigger: the code's day; else the day whose window to `ends_at + 2 h` contains `now()`, the
  later-started of two; else the latest day begun), nullable on `check_in_attempts`; **nullable with no
  backfill** on `materials`, `session_tasks` and `photos`, where **null is the whole session**. Each is a
  composite foreign key `(session_id, session_day_id)`, so a row can only name a day of its own session; on
  the three content tables it is `on delete set null (session_day_id)` — **deleting a day promotes its
  content to the session**, which is `DEC-121`'s default. `check_ins.session_window` is **the day's** window,
  and one active check-in per member **per day** is the unique rule.
- **`sessions.require_all_days boolean not null default true`**, beside `certificate_mode` (`REQ-SES-017`).

### The ten contracts — `STATUS.md` has them in full; publish yours in your note on day one

1. **lead → all:** the day set is the truth; the session window is its stored shadow.
2. **lead → all:** additive; `main` and `main`'s worker are correct on the new schema.
3. **`sessions` → all:** `schedule_session(…, p_days jsonb default null, p_require_all_days boolean default
   null)` and `SessionDay` + a `cache()`-wrapped `listSessionDays(sessionId)` from `lib/dal/sessions.ts` —
   **every track reads days through it**, never its own query.
4. **`checkin` → `sessions`, `scoring`, `content`:** each check-in RPC keeps `p_session` and gains a trailing
   `p_day uuid default null`; the switch and the `ends_at + 2 h` ceiling are the day's.
5. **`checkin` ⇄ `scoring`:** `check_in()`, `mark_checked_in_manually()` and `remove_check_in()` call
   `scoring`'s `attendance_recorded(p_check_in)` / `attendance_removed(p_check_in)` and decide nothing about
   points. `scoring` publishes both with `main`'s behaviour first; then `checkin` switches.
6. **`scoring` → lead, `content`:** `session_attendance_complete(p_session, p_member)` is the only definition
   of «attended the session» for points and certificates; `has_checked_in()` (any day) stays the definition
   for rating, photos and a session-scoped «بعد» material.
7. **`content` → `sessions`:** the Materials, Tasks and Photos slots keep `SlotProps`, group themselves,
   render **flat at `n ≤ 1`**, and use `<h3>` for a group (the page owns the `<h2>`); `sessions` publishes the
   one day-label formatter.
8. **`notify` ← 1, 3:** one calendar entry and one reminder stream per day, with a one-day session's keys
   and `UID` unchanged.
9. **lead → all:** `src/lib/session-status.ts` — `PhaseInput.days`, `dayPhase()`, `checkInDay()`; between two
   days a session is `open`, never a seventh phase.
10. **lead:** `REQ-TSK-002` enforced by a test.

### `src/components/ui/` — ownership is per FILE, never per directory

| Owner | Files in `src/components/ui/` |
|---|---|
| **lead** | `index.ts` · `button.tsx` · `icon-button.tsx` · `link.tsx` · `skeleton.tsx` · `route-progress.tsx` · `toast.tsx` · `submit-button.tsx` · `page-header.tsx` · `section-header.tsx` · `prose.tsx` · `route-error.tsx` · `icons.tsx` · `dialog.tsx` |
| **`sessions`** | `field.tsx` · `input.tsx` · `textarea.tsx` · `select.tsx` · `checkbox.tsx` · `radio-group.tsx` · `switch.tsx` · `form-summary.tsx` |
| **`console`** — held by the lead | `data-table.tsx` · `combobox.tsx` · `menu.tsx` · `tabs.tsx` · `sheet.tsx` · `date-time.tsx` |
| **`content`** | `card.tsx` · `badge.tsx` · `tag-chip.tsx` · `avatar.tsx` · `progress.tsx` · `empty-state.tsx` · `stat.tsx` · `panel.tsx` · `file-drop.tsx` |

★ **`console` is not spawned, and its six are the ones this wave will ask about** — `date-time` for a row of
days, `tabs` and `menu` for a day switcher or a scope chip. A request for one goes to the **lead**, who makes
the change as custodian, in the owner's style, with a test, and nothing beyond the request. The same holds for
`src/components/admin/{rtl-datetime-picker,duration-input,duration}`. **You never edit a primitive you do not
own, even to fix it.** Write the request — the file, the prop, why — in `docs/plan/notes/<you>.md` and tell
the lead. **Import by path** — `@/components/ui/card`, never `@/components/ui` — because `index.ts` exports
**types only**.

### The transfers in force for wave 9 (`DEC-150`)

- **→ `sessions`** (from the lead): `src/app/[locale]/app/admin/sessions/[id]/schedule/**` whole, and
  `src/messages/*/schedule.json`, with `tests/e2e/wave8-lead-schedule.spec.ts`,
  `tests/unit/{schedule-rules,schedule-actions,sessions-schedule-walk-ins}.test.ts`.
- **→ `scoring`** (back from `content` and `console`): `src/app/[locale]/app/me/points/**`,
  `src/components/scoring/{points-history-list,points-catalogue,points-strip}.tsx`, `src/lib/dal/points.ts`
  in full, `src/messages/*/scoring.json`, `tests/e2e/points.spec.ts`. `src/components/scoring/{member-board,company-board,company-points-breakdown}.tsx`,
  `messages/*/leaderboards.json` and the leaderboards route stay `sessions'` (fixes only); `admin/scoring`,
  `admin/recognition`, `scoring-admin.ts` and `messages/*/recognition.json` stay `console`'s, held by the lead.
- **→ `notify`** (back from `content` and `console`): `src/app/[locale]/app/me/{calendar,notifications}/**`,
  `src/components/notifications/**`, `src/components/calendar/**`, `src/lib/dal/{notifications,calendar}.ts`
  in full, `src/messages/*/{notifications,calendar}.json`, `tests/e2e/{wave7-content-calendar,wave7-content-notifications,notify-screens}.spec.ts`.
  `admin/{emails,reminders}` stay `console`'s, held by the lead; **the email studio is wave 10**.
- **`content` keeps** the rest of `/app/me` and the discussion for **fixes only**; its wave-9 work is the
  three content types.
- ★ **"Add-only" is not in force this wave**: a module has one owner, and a change to another track's
  module is a written request.

### One writer per file — JSON and specs included

A screen's strings live in its owner's namespace; **reading** another track's namespace is fine
(`getTranslations("sessions")` for the day label in a `content` slot), **writing** it is a request. **A spec
or test has one writer.** Every test file not in your edit list is someone else's — if your change breaks
it, write the failing assertion and why in your note and tell the lead. The lead holds `a11y`, `budgets`,
`second-org`, `session`, `shell-*`, `frozen-routes`, `unconfigured`, `auth*`, `reserve-probe`,
`wave6-discussion-review`, `isolation`, every `fixture*.ts`, the demonstrable
(`tests/e2e/wave9-three-day-workshop.spec.ts`) and every spec of an unspawned track.

### Not this wave — never touched by ANY teammate until the lead says otherwise

- ★ **The survey** (`REQ-SUR-001` … `009`, `DEC-074`, `DEC-094`) and ★ **the email studio**
  (`REQ-NTF-009` … `014`, `16` §11) — both **wave 10**.
- **Recurring series** (`A14`) · **per-day capacity or per-day registration** (`DEC-120`) · **a free-text
  note on a day** (`DEC-120`) · **a scope picker, modal or required scope field** (`DEC-121`).
- Every `app/admin` route except `sessions/[id]/schedule` (`sessions'`) and `sessions/[id]/attendance`
  (`checkin`'s); all of `app/platform/**`; the studio (`admin/{designer,templates}`,
  `sessions/[id]/certificates`); the brand kit; `verify/**`; `legal/**`.
- Objectives (`16` §9.3), tag management (`16` §9.4), avatar storage (`16` §6.8), downloads (`DEC-076`),
  the Tier-1 reservation moment (`16` §7.5.2), status-colour contrast enforcement (M13).
- **Everything under `src/app/[locale]/(marketing)/`** and the components it renders —
  `src/components/{header,footer,chapter,registration-form,network-bg,network-gl,intro-sting,mobile-cta,ornaments,wordmark,language-toggle,form-token}.tsx`
  — frozen until M13 (invariant 1). `DEC-126`'s «تسجيل الدخول» and `chapter.tsx`'s eleven Arabic-Indic
  glyphs land there, with the accessibility and performance closing passes.

### Lead-only, always

`supabase/migrations/**` · `src/lib/session-status.ts` · `src/components/ui/index.ts` and the lead's fourteen
`ui/` files · `src/app/globals.css` · `src/app/[locale]/app/layout.tsx` · `src/components/shell/**` ·
`src/app/[locale]/(auth)/**` · `src/app/[locale]/(dev)/**` · `src/messages/*/{ui,app,auth,marketing}.json` ·
`scripts/**` · `scripts/parity/goldens/**` · `.claude/**` · `.github/**` · `package.json` ·
`package-lock.json` · `src/app/[locale]/layout.tsx` · `src/app/global-error.tsx` · `src/proxy.ts` ·
`public/**` · `src/lib/supabase/**` · `src/lib/dal/session.ts` · `src/i18n/**` · `vitest.config.ts` ·
`playwright.config.ts` · `worker/src/index.ts` · `worker/Dockerfile` · `packages/fonts/**` ·
`tests/rls/{db,fixture*,isolation.test}.ts` · `docs/plan/**` except your own note.
`src/messages/index.ts` gains a namespace **by append only**, in the same commit as its `ar/` and `en/` JSON.

### Gates and the shared tree

**A shared working tree protects the repository, not your memory of a file.** The owner and the lead commit into this tree while you work. **Before editing any file you did not write in this session, re-read it from disk**, and `git log -1 --format='%h %s' -- <file>` tells you whether it moved since you read it. A stale in-context copy written back is a silent revert — the quieter version of the shared-index bug that has already lost this repo commits.

**`npm run qa`, `npm run visual`, `npm run build`, `supabase db reset|start|stop`, branch switches,
pushes and the PR are the lead's.** You run `npx tsc --noEmit`, `npm run lint` (grep the output for
`problems` — the "N fixable" line reads as green and is not the summary), `npm test`, and
`npm run test:rls` (single-runner: `pgrep -fl "[n]ode_modules/.bin/vitest"` first), and **one** e2e
spec through the gate lock when a story is done. A diagnosis that needs a production build is a
question to the lead — **never run anything in the lead's verification worktree without asking**. The
`TaskCompleted` hook is path-aware (DEC-088): tsc, lint and vitest for you; it falls through to the
full `qa` only when a change can reach the frozen marketing routes — **if it does, you edited
something that is not yours.** SQL goes under `supabase/proposed/<you>/`, proven with
`applyProposed()` inside your RLS tests, never into `supabase/migrations/`; **never save a failing test
under `tests/rls/`** — everyone's run executes it. A write-then-`raise` RPC rolls back its own write
(`DEC-043`): after the first write, return an outcome envelope. A trigger that enqueues or notifies is
`security definer` and is tested as a member, not as the owner. Jobs are enqueued only through
`public.enqueue_job()`. **Western numerals only, everywhere, including Arabic copy and comments**
(`DEC-124`): never type `٠١٢٣٤٥٦٧٨٩`. Stage by explicit filename and `git commit -- <paths>` at once —
never `git add -A`, never stash, rebase, reset, clean or switch branches; delete a file with `rm`, never
`git rm` (it stages at once, into everyone's index); never create, restore or delete a file outside your
own list. A `"use server"` module exports async functions and types alone — `export type { X }` from one
breaks the build while `tsc` stays clean. A form that shows an app-side error sets `noValidate`. React
resets a `<form action>` after every submission — a controlled field keeps what it shows only through the
primitives' repaired pattern (`DEC-149` §1). **Never add a nudge, an interval or a `setTimeout` to a
pending control** (`DEC-146`). No session changes repository visibility, settings, secrets or remotes — stop
and ask.
