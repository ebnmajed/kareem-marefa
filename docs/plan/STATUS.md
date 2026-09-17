**Last updated:** 2026-09-17 · **Branch:** `wave-10/survey-email` (**draft PR at the first push**) · **`main`:** **LAUNCHED 2026-09-15; wave 9 merged 2026-09-17** (PR #26, `f2ead54`; `0100`–`0122` live on production; ★ **the Railway worker is RUNNING on the merge commit `f2ead54`**, read 2026-09-17; the `DEC-152` statement was run by the owner) · **Phase:** ★★ **WAVE 10 — the survey and the email studio, with three carried fixes (`DEC-160`) — ★ SYNC 2 DONE: `0127`–`0134` promoted (110 RLS files · 1,129 passed · 0 failed, run alone); the mail renderer moved into `@kareem/mail-runtime` with `notify`'s 116 pinned files as the proof; the RLS runner is now a lock. ★ SYNC 1 (`DEC-161`): four plans approved, FIVE defects caught on paper — one of them a public poster with no date in the push → redeploy window; the tables are landed (`0124`, `0125`); all four tracks are building. ★ FOUND: every mail since Launch has been missing its link — `{{url}}` is supplied by nothing (named difference 1; the fix needs `APP_URL` on Railway, an owner's step). Step 0: the map is in `CLAUDE.md` and all ten `.claude/agents/*.md`, the checklist is the wave-10 block below. `event` builds the survey end to end on opus; `notify` the email studio; `designer` the re-issued certificate and the multi-day poster's date; `content` a proposal's own material. ★ The survey's storage contract is the lead's and precedes any table: a stored response names no member (`DEC-160` §3). ★ There are no mail goldens today, so `notify` pins today's 25 messages before it changes a line (`DEC-160` §4).** Migrations start at **`0123`** and are additive; the owner pushes, then merges, **then checks Railway by hand**.

> This is the single entry point for every session. Read it before anything else; update it
> before you finish, whether or not you got through what you intended.

---

## ★★ START HERE — the next session's brief

**This file is long and mostly history.** It is append-only by habit, so everything below the next
two sections is the record of finished waves. To pick up the work, read exactly this:

| # | Read | Why |
|---|---|---|
| 1 | **[*What the next session does*](#-what-the-next-session-does--the-owners-four-directives-2026-09-15)**, further down this file | The scope, in the owner's words, with what is decided and what is open |
| 2 | `DECISIONS.md` **`DEC-110` … `DEC-160`** | The resequencing, check-in, walk-ins, multi-day sessions, every known canvas error, **Western numerals everywhere (`DEC-124`)**, gradient dark posters, the certificate library, the marketing door, and the untouched `(auth)` screens. **Do not re-litigate these.** |
| 3 | `CLAUDE.md` | Conventions and the hard invariants. **Its wave-10 map is the map in force** (`DEC-160`); waves 9, 8, 7, 6 and 5 are the record |
| 4 | `TEAM.md` §1–§3 | How a lead runs teammates in one checkout |
| 5 | `16-ui-redesign.md` | The design system and the screen specs. **§15 and §16 are superseded on sequencing** (`DEC-110`); everything else stands |
| 6 | The canvas | The visual reference. Read `DEC-114`, **`DEC-122` and `DEC-123`** first — its errors include one that looks like a deliberate full-bleed and one that looks like a deliberate «ended» treatment |

**The state of the tree.** M9's system work is **built, green and merged into `main`** — 34 `ui/`
primitives, the shell, the status vocabulary, the loading and failure models, the form model, and
the five live affordance fixes. `trace` is at **313 requirements · 73 entities · 147 stories · no
gaps**; `qa` 44/44; `visual` 0.000%. ★ **Since wave 8, every route in the brief's scope is on the M9 system** (`ui-reach --wave8` 20/20); `verify/[code]` and `legal/**` are the named exceptions. The plan set carries M9–M13 in full.

### ★ Seven owner directives from 2026-09-16, all recorded

1. **`DEC-124` — numerals are Western (`1 2 3`) everywhere, always.** No setting; `REQ-INT-006` is
   rewritten, `numeral_system` and `orgs.numerals` are dropped, `DEC-095`/`REQ-INT-010` subsumed.
   **The canvas contradicts this on all 18 artboards — 468 Arabic-Indic glyphs — and the rule wins.**
   Debt in the tree: **84 glyphs in `src/`, 27 in `messages/`**, plus `src/components/sessions/numerals.ts`,
   whose `NumeralSystem` parameter collapses to always-Western. ⚠ **Three of those glyphs are in
   `(marketing)/page.tsx:16`, inside the frozen contract — they can only change in M13.**
2. **`DEC-125` — a generated poster is dark by default.** `scheme` defaulted to `'light'` in all
   three signatures, so posters render white while every poster in the canvas is dark. ⚠ **This
   entry originally said «certificates stay light»; `DEC-128` SUPERSEDED that** — certificates are a
   library, both orientations and both schemes, chosen at issue time. **This moves the parity
   goldens** — a reviewed diff, the lead's.
3. **`DEC-126` — the marketing site has no door**, and it was never in the plan. `REQ-UIX-025` and
   `STORY-UIX-015` added, in **M13**, the only milestone allowed to touch the frozen routes.
4. **`DEC-127` — the poster background is a GRADIENT**, not a flat fill: `140deg`, `{{brand.surface}}`
   → a new `canvasRaise` token. `model.ts` gains `{type:'gradient'}`; ⚠ `render.ts` and `bindings.ts`
   read `background?.color` today, so a gradient document would render silently on the `#ffffff`
   fallback. The LTR mirror mirrors the angle (`360 − angle`).
5. **`DEC-128` — certificates are a library**, both orientations and both schemes, chosen at issue
   time — and the check found that **`0061` seeds half the promised roster** (8 × 1, where
   `REQ-DSG-026` promises 10 poster and 6 certificate templates). `REQ-DSG-026` now counts it in CI.
6. ⚠ **`DEC-129` — the three `(auth)` screens were M9 and shipped untouched.** `sign-in`,
   `choose-org`, `no-access` import **zero** `ui/` primitives. Carried into the next wave with
   `SC 3.3.8` on `sign-in`, and note that `DEC-126`'s new public «تسجيل الدخول» **leads to them**.
7. **Email: already covered, and no gap.** `REQ-NTF-009` … `REQ-NTF-014`, `16` §11's email studio,
   brand-driven via `REQ-DSG-021`; `STORY-NTF-005`/`006` schedule it at **M12**. Not built yet —
   no template rows are seeded and `worker/src/mail/render.ts` still renders plain paragraphs
   against three brand tokens with hard-coded fallbacks.

**The screens were waves 6, 7 and 8; wave 9 was multi-day sessions (`DEC-119` … `121`, `DEC-150`) — all merged. Wave 10 is the survey and the email studio (`DEC-160`) — in progress, directly below.** The owner reviewed M9 running and reordered the
milestone — the screens come first, the admin console is in scope from the start, `/app` becomes the
sessions timeline, and `16` §6.6's separate home page is withdrawn (`DEC-110` … `DEC-114`, `DEC-130`).

**Nothing is blocked on the owner.** The last open item — which errors are in the canvas — was
answered on 2026-09-16 and closed by two entries. **`DEC-122`**: the ended-session artboard's poster
overlaps the action card by 28 × 190 px because the mockup lacks a `box-sizing` reset — an artefact
of the mockup's rendering, **not a design to reproduce** (`Main.dc.html` has it once more; no third
instance in 18 artboards). **`DEC-123`**: a measured sweep of all 18 for contrast, touch targets and
the five Arabic rules. **Nothing found reaches the app.** Four more artefact classes not to
reproduce — chief among them **the "ended" wash swallowing the status badge** (1.75–1.87:1 in the
canvas; the app's own tokens are 5.11:1) — two real questions for design (browse tag counts at
1.96:1, a 13 px caption at 3.30:1), and **`DEC-114`'s classes 2 and 3 verified rather than assumed**:
no ratings on any browse card, no Arabic-Indic digits in any machine-readable string.

**The ownership map in force is wave 10's** (`CLAUDE.md`, all ten `.claude/agents/*.md`, `DEC-160`). A
wave-11 lead writes a new one before spawning anyone — `DEC-085`: *ownership lives in the agent files
or it does not exist.*

---

## ★★ WAVE 10 — IN PROGRESS on `wave-10/survey-email` — the survey and the email studio, with three carried fixes (`DEC-160`)

**The owner's goal, in substance** (`docs/plan/notes/wave-10-lead.md`): two features that were deferred twice.
**The survey** — staff write a reusable template, attach it to a session, a checked-in member answers it on the
rate screen beside the rating, and **only `admin` and `moderator` ever read the results**, withheld below a
minimum count on every question type. **The email studio** — a template is an ordered list of typed blocks
compiled by the one mail renderer, previewed by that same renderer, tested by a real send, with eight designed
platform templates behind all 25 message keys. And three things wave 9 sized and left: **a certificate
re-issued** after a removal and a re-add, **a multi-day poster's date**, **a proposal's own material**.

**The measure — two demonstrables, and two things that must not change.**

1. ★ **The survey, end to end, as one run from EMPTY** — production build, real worker (`E2E_WORKER=1`), 390 px,
   Arabic: a moderator writes a template and reorders its questions **with taps alone**; attaches it to a
   session on SCR-064; three members attend, and each rates and answers on **one screen**; the real worker
   stores each response after its delay; **the presenter is refused the results by the database**; the screen
   says «withheld» at two responses and draws at three; the CSV is audited, UTF-8 BOM, Western digits, and
   withholds what the screen withholds — and ★ **no table, payload or log line of that run can say which member
   gave which answer**. The spec is the lead's: `tests/e2e/wave10-demo-survey.spec.ts`.
2. ★ **The email studio, end to end, as one run from EMPTY** — an admin duplicates a designed platform template,
   reorders its blocks with taps, sees it in phone, desktop, plain-text and forced-dark **through the production
   renderer**, sends a test **to their own address** (Mailpit), and a real reminder then arrives **designed**;
   changing the org's logo restyles it; an unknown binding is refused by the **database**. The lead's:
   `tests/e2e/wave10-demo-email-studio.spec.ts`.
3. ★ **A session with no survey shows nothing about one, anywhere** (`REQ-SUR-001`) — the rate screen's existing
   specs pass **with their assertions untouched**.
4. ★ **An org that has not touched its templates sends byte-identical mail** (`REQ-NTF-009`) — proven against
   **`notify`'s pinned output, which does not exist yet and is its first task** (`DEC-160` §4): there are no
   mail goldens today, so until those 25 messages are committed from `main`'s renderer, «byte-identical» is a
   sentence and not a test.

### Confirmed before anything else — read, not asked (`DEC-160` §1)

| What the owner was asked to do after PR #26 | State | How it is known |
|---|---|---|
| The Railway worker on the merge commit | ✅ **RUNNING on `f2ead54`**, deployed 2026-09-17 10:47 UTC | `railway status --json` — a read; `meta.commitHash` equals `git log -1 main` |
| `DEC-152`'s security statement run | ✅ run and verified by the owner, `f / f / f` | wave 9's production reads, row c; `0103` carries it regardless |
| `main`'s CI | ✅ green on `f2ead54` | `gh run list --branch main` |

### The untouched-suite ledger

Every test file that existed on `main` at **`f2ead54`** and is modified on this branch is named here, with why.
**A changed expectation for a session with no survey, or for an org with no block template, is a defect, not a
ledger line.** Checked by the lead at every sync with `git diff --stat f2ead54 -- tests/ | grep -v wave10`.

| File | Commit | Why | Expectation changed? |
|---|---|---|---|
| `tests/rls/isolation.test.ts` | lead, `951962e` | the sweep's non-vacuity assertion skips tables a plain member may select but sees no row of; the survey's six staff-only authoring tables join `notification_templates` and `session_certificate_designs` in that list | no — the wall is asserted for all nine new tables; only the «sees its own org's rows» half is skipped for six, as it is for every admin-only table |
| `tests/rls/definer-exposure.test.ts` | lead, `0126` | the file pins the `anon`-executable definer functions **as an allowlist** — «exactly these» — so that a new one forces a conscious edit (`DEC-152`). `0126` adds two, each with its reason written beside it: the storage-policy predicate for an active org's logo, and the lookup of that one object's path | ★ **yes — on purpose, and the only one so far**: the list goes from six to eight. Both answer only about an object any stranger may already fetch; `brand-public-logo.test.ts` asserts what stays closed |
| `tests/unit/{mail-render,mail-day-words,mail-instants}.test.ts` | lead, `1a46fde` | one import specifier each: the module they test moved into `@kareem/mail-runtime` | no — no assertion touched |
| `tests/rls/fixture-m3.ts` | lead, `a85f6cd` | the fixture's `MSG-session_published` template interpolated `{{session.title}}`, a binding that key never carried and which has rendered **blank** since M3; `0133`'s rule refuses it, so the fixture says `{{title}}`. Measured by `notify` before it was requested | no — a fixture's text |
| `tests/rls/notify-contract.test.ts` | `notify`, `38ccd25` | two fixture texts for the same reason — `MSG-rsvp_promoted` never carried `{{name}}`, `MSG-session_changed` never carried `{{new.startsAt}}` | no — the `select.admin` case still asserts who may read; the `required_fields` case still asserts `23514`, a save when present, `23514` on an update that removes it |
| `tests/unit/admin-audit-labels.test.ts` | lead, `a85f6cd` | it reads every single-quoted dotted literal in a migration as an audit action; `member.name` and `member.email` in `0133` are binding names, added to its documented exemptions beside wave 9's three settings | no |
| `tests/e2e/console.spec.ts` | lead (custodian), `e97afdb` | the moderator's rail gains «الاستبانات» (`DEC-163`): the case's **title** counted «exactly three top-level entries» and would have been untrue; it says four, and one assertion is **added** for the new entry | no — every «absent for a moderator» line stands, none weakened |
| *(accepted at sync 1, not yet made)* | `notify`, N3 | `wave8-console-emails.spec.ts` (3 of 5 cases), `emails-page.test.tsx` (2 of 8), `admin-emails.test.ts` (2 of 3): «الحقول المطلوبة» becomes a checkbox list of the key's offered bindings (`REQ-NTF-012`); the refusals, the fields they land at, the kept values and **every delivery-log case** are unchanged | no |

★ `tests/e2e/wave8-console-emails.spec.ts` is the one spec whose screen this wave replaces content under: the
string-template editor's cases change **each with its own line here**; its moderator case, its failure banner
and its delivery-log cases do not change at all.

### Before anyone spawns

| | What | Commit | Evidence |
|---|---|---|---|
| ✅ | **The two post-merge confirmations** | — | the table above |
| ✅ | **Who builds the survey — decided before the map**: `event`, end to end, on opus (`DEC-160` §2) | Step 0 | the alternatives weighed against the code: a split puts a seam through `REQ-SUR-009`'s invariant |
| ✅ | **Step 0**: the wave-10 map in `CLAUDE.md`; all ten `.claude/agents/*.md` regenerated from one generator, the shared block identical in all ten (`event`'s was nine waves stale); `DEC-160`; this block; `01` corrected for `DEC-124` and for §3's storage contract; SCR-065 and its two routes in `04` and `09` | Step 0 | `trace` — `313 requirements · 73 entities · 147 stories · no gaps` |
| ✅ | **`ui/reorderable-list`** (row L1) — built while the four plan | `d260144` | 13 cases: taps alone; every ▲▼ named and **described by the row it moves**; the ends inert by `aria-disabled`, never `disabled`, so a row moved to the top by keyboard keeps its focus; one polite sentence naming the new position in Western digits, the name in `<bdi>`; axe-clean. tsc clean · lint 0 errors · `ui-lint` held · 321 `ui/` cases · 1,052 unit cases. ★ The gallery gained its one client island for it, so **the `/ar/ui` visual pair moves by exactly that section** — the three frozen pairs must still read 0.000 % |

★ **Found while reading for Step 0, each now someone's row:** `02`, `03` §8.2, `11` and `12` contain **no trace
of the survey** although `DEC-074` and `DEC-094` list them as changed (L2) · **there are no mail goldens**,
although `DEC-081` promises they will not move (N1) · `ui/reorderable-list`, which two requirements name, does
not exist (L1) · `08` §3.2 lists 23 templates against 25 in the matrix and in code (N7) · a rating's
`edited_at` is written from JavaScript at millisecond precision and the presenter's comment list is ordered by
`submitted_at` (E5) · a proposal's material is unreadable at the version **for staff too**, and the visible
defect is that an admin cannot open it (T1) · `/api/webhooks/resend` has never existed, and the function it
would call is `service_role`-only while `service_role` is never on Vercel (N8, ruled at sync 1).

### The contracts — the wave's checklist

**Published** when its owner has written the signature, the types and the untouched behaviour in its note;
**landed** when the code is promoted or committed; **held** when the consumer's own test exercises it. A row
closes at *held*.

| # | From → to | The seam | What must not change | State |
|---|---|---|---|---|
| 1 | lead → `event` | **The survey's storage contract (`DEC-160` §3).** `survey_responses` and `survey_answers` carry no member, check-in, rating or timestamp column and no foreign-key path to a member; «one member, one response» is `survey_participations (survey_id, member_id)`, no timestamp; the response is written by a jittered job whose payload is the survey and the answers and whose key is never derived from the member; no client role selects a response or an answer; one definer function releases results under the withhold, for the screen and the CSV; `ratings` holds no instant finer than a day | a session with no survey: the rate screen, the rating's insert, its points job and its audit — all as today | **landed** as tables — `0124`; `event`'s plan approved against it (`DEC-161`). Held when `survey-structure.test.ts` passes on the promoted functions |
| 2 | lead → `event`, `notify` | **`src/components/ui/reorderable-list.tsx`** — ▲▼ on every row, named by the row they move, taps alone, a live announcement; controlled (`onReorder(nextKeys, { key, from, to })`); `getName` is the row's accessible name and is never empty; `renderActions` for a row's own controls; `size="sm"` for a nested or dense list. Its props are functions, so it lives inside a client component (`DEC-159`). No drag | — | **landed** `d260144` — both consumers told; held when SCR-065's and the editor's own specs reorder with `click()` alone |
| 3 | lead → all | **Additive; `main`'s app and worker are correct on the new schema.** Three named hazards, each answered in its owner's plan: a block template's row on the old worker's string path; a coarsened rating under `main`'s app, which writes both instants; a second certificate for one member | every screen and job of `main` on the wave's migrations | **drafted** at sync 1 (row L7, below) — and the drafting found defect 1: `main`'s worker on `designer`'s planned seed |
| 4 | `notify` → lead → `notify` | **Pin, then move, then build.** The 25 rendered messages committed from `main`'s renderer; then the lead scaffolds `packages/mail-runtime` and moves `render.ts` + `templates.ts` mechanically; then the blocks. `renderEmail(input)` keeps its signature | the pinned files, byte for byte, on every later commit | ★ **held so far**: N1 pinned 29 cases over the 25 keys (`38a6f46`, 116 files, the writer unrunnable by any script); L3 moved `render.ts` + `templates.ts` with `git mv` and **zero changed lines** (`1a46fde`) — all 29 cases byte for byte, no pinned file moved. N2 builds in the package against the same files |
| 5 | `notify` → all | `public.notify()` and every `MSG-*` key unchanged; an org with no block template renders the pinned bytes | the ten existing notify and mail suites unmodified | ☐ |
| 6 | `event` → lead (custodian of `console`) | **The results' two exits.** `event` publishes the rows, **already withheld**, from `lib/dal/surveys.ts`; the lead registers the export type in the audited path, adds the rail's «الاستبانات» and the per-session link to SCR-064 | the audited export's existing types and the rail's existing groups | ☐ |
| 7 | `event`, `notify` → lead | The two task registrations in `worker/src/index.ts` — `record_survey_response`, `send_test_email`. Each logs a count, never a payload | the worker's existing task list | ☐ |
| 8 | `designer` → `notify` | The review of the block-to-table compiler (`16` §11.6), **and what an image in a mail may point at** — a mail client fetches with no session | — | **published** day one (`designer`'s note §D3b): exactly one asset works — `/api/s/{sessionId}/og` — and it 404s for a draft or cancelled session. The review's five checks are published too (§D3a), `<bdi>` not reaching Outlook among them |
| 9 | `branding` (held by the lead) → `notify` | `public.brand_kit()` gives mail three tokens today; the logo and the dark palette are a written request to the lead | the platform default stays the identity override; no parity golden moves | **ruled** (`DEC-161`): `brand_kit()` already returns both palettes and needs no SQL; ★ **the logo gets a proxied public URL** in `export_is_public_card()`'s shape — row L10, the lead's |
| 10 | lead → `designer` | `certificates`' unique constraint becomes a partial unique index — **and gains `revocation_cause`** (an enum: a removal's revocation is told from an admin's revocation for cause by a column, never by a phrase); the lead's DDL is carried at the top of the file that changes `issue_certificate()` (`DEC-151`'s pattern) | `designer-certificates`, `certificates-designs`, `session-days-certificates`, `checkin-removal`, `checkin-contract-5` unmodified | ☐ |
| 11 | `content` → lead | `03` §5.5a's corrected text, from `content`'s note | — | ☐ |

### The rows — per track, closed against a contract held and a capture opened

| # | Owner | Work | Serves | State |
|---|---|---|---|---|
| L1 | lead | `ui/reorderable-list`, its types in `ui/index.ts`, its test, its gallery entry | `REQ-DSG-028`, `REQ-SUR-002`, `REQ-NTF-009`, `SC 2.5.7` | **closed** `d260144` |
| L2 | lead | every `create table` / `alter table` of the wave, landed at sync 1 from the plans — the survey's tables, the template blocks, the certificates index — each with its `02` entity, `03` §8.2 rows, fixture rows and sweep coverage; **and the `02`, `03`, `11`, `12` text `DEC-074` / `DEC-094` never wrote** | `REQ-NFR-001`, invariants 3, 5, 6 | **landed** `951962e` — `0124` (nine survey tables, one enum, `survey_min_responses` with its floor) and `0125` (`blocks`, `source_family`); `02` §4.8a, `03` §5.6f and §8.2, `11`'s two jobs, `12` §5.2 item 5 and §9 item 8 written. ★ **The whole RLS suite on the chain through `0125`, run alone: 102 files · 1,066 passed · 0 failed**; `policy-diff` ✓ (the three no-policy tables read «by design»); `trace` 313 · **82 entities** · 147 · no gaps. The certificates DDL travels in `designer`'s file (contract 10) |
| L3 | lead | `packages/mail-runtime` scaffolded (manifest, build order, the worker image, the lock through `npm run lockfile`) and `render.ts` + `templates.ts` moved mechanically — **after N1, with N1 as the proof** | `REQ-NTF-010` | **closed** `1a46fde` — two files moved with zero changed lines; every importer changed one specifier; the transports, the MIME encoder and the one reader of `RESEND_API_KEY` stay in the worker, and the package's tsconfig has no DOM lib and no Node types so `process`, `Buffer` or `document` fail its build. 2,061 unit and component tests; the worker builds; the lock changed by **nine additive lines**; the worker image copies and builds it in all four places. `tests/unit/mail-runtime-dist.test.ts` fails when a source file is newer than its built twin — tests import the package by name, which is `dist`, and a stale `dist` would make the pin pass against yesterday's renderer |
| L4 | lead (custodian of `console`) | the rail's entry, the per-session link, the survey export's registration | `REQ-SUR-007`, `REQ-ADM-017`, `REQ-ADM-020` | **two of three** `e97afdb` (`DEC-163`) — «الاستبانات» in the rail for **both** staff roles, as SCR-065 and `assert_survey_staff()` already said; `REQ-ADM-020` amended to name the survey rather than be read around. The export is `GET /api/admin/exports/survey/[sessionId]`, beside attendance's: admin-only, audited with the session as subject, rows **already withheld** by `event`'s DAL. ★ **Not in `EXPORT_TYPES`** — that array is SCR-061's org-wide table and a per-session row there would link to nothing. ★ **Found by building it: `buildCsv()` did nothing about a cell a spreadsheet EXECUTES**, and the survey is the first export carrying a member's free text — a cell opening with `=` `+` `-` `@` is neutralised in the one builder, a signed number left alone (a named difference for the seven existing exports; the existing CSV test untouched and green). ☐ the per-session link, when SCR-064's route exists |
| L5 | lead | the two task registrations; the worker image if the package needs it | `11` | ☐ |
| L6 | lead | both demonstrable specs, from EMPTY, production build, real worker; every capture opened in bands | `REQ-SUR-*`, `REQ-NTF-009` … `014` | ☐ |
| L7 | lead | ★ **the owner's migration order, DRAFTED AT SYNC 1** and finished at the freeze: what each file adds, the two windows, what `main`'s worker does job by job, the reads to run first · the mechanical caller audit · the data-shaped rehearsal | invariant 3 | ☐ |
| L8 | lead | promotion of every proposed file, with `db:reset`, RLS, `policy-diff`, `03` §8.2 | invariants 3, 5, 6 | ☐ |
| L10 | lead (custodian of `branding`) | ★ **new at sync 1 (`DEC-161`): the org's logo, reachable by a mail client** — a storage policy admitting `anon` to exactly the object an active org's `brand_kits.logo_asset_id` names, and `GET /api/brand/[orgId]/logo` proxying it; 404 with no logo. Due before `notify`'s N6 | `REQ-NTF-014`, `REQ-DSG-021` | **closed** — `0126`, `src/lib/brand/public-logo.ts`, the route. `0080`'s shape for one more object: a policy, read as whoever asked, no signature, no `service_role`. **PNG or JPEG only** — a WebP logo stays closed because Outlook draws none, and the design falls back to the org's name. 7 cases, each asserting what stays **closed** as `anon`: any other asset of the org, a WebP logo, a replaced or cleared logo, a suspended org, writes and deletes. `org_public_logo()` answers the worker too, which is how the renderer chooses a logo band or a name. Held when `notify`'s N6 renders it |
| L11 | lead (custodian of `platform`) | ★ **new (`DEC-161`, promised to `event`): the PDPL self-export lists the surveys a member answered** — and nothing they said, because nothing can find it | `REQ-PRF-006`, `REQ-SUR-009` | **closed** `1157f6b` — `0135`, `0088`'s function with one key appended: the sessions by title, **no instant**, ordered by title and never by insertion. Additive — `main`'s worker stores the payload opaquely. 3 cases: only that member's; no answer text and no prompt anywhere in the archive; every key `0088` returned still returned. The privacy screen's sentence is `content`'s, requested |
| L9 | lead (custodian) | recognition edits are recorded — carried since wave 8 | `REQ-REC-001` … `005`, `REQ-PTS-005`, `REQ-ADM-018` | **closed** — `0123`, taken while the four planned. `scoring_config_history` has admitted the scopes `badges`, `levels`, `perks` and `streaks` since M1 and nothing ever wrote one; the four tables now carry the trigger every other configuration table has. **SQL only**: the admin screen writes all four straight through RLS, so a trigger sees every writer and no screen changes. An admin's edit is one row per changed column; a custom badge's creation is one `created` row; **the org's seed appends nothing** — a seed is not a change anybody made. 9 new cases; ★ **the whole RLS suite on the chain through `0123`: 100 files · 1,048 passed · 4 todo · 0 failed, no existing file modified**; `policy-diff` ✓ |
| E1–E5 | `event` | the behaviour on the lead's tables · SCR-015 as one screen and two writes · SCR-065 · SCR-064 and the CSV's rows · `ratings` to the day and the comment order | `REQ-SUR-001` … `009`, `REQ-RAT-004` | plan approved (`29041c8`, `f4e27b1`) — **building**, E5 first |
| N1–N8 | `notify` | today's output pinned · the block compiler and the generated text part · bindings per key in the database · the editor and its four preview modes · the live test · the eight designs behind 25 keys · `08` §3.2 · the bounce webhook, last | `REQ-NTF-007` … `014` | plan approved (`3b0674a`) — **building**, N1 (the pin) first |
| D1–D3 | `designer` | certificates re-issued · a multi-day poster's date · the compiler review | `REQ-CRT-003`, `REQ-CHK-017`, `REQ-DSG-002`, `REQ-SES-015` | ★ **closed** — D1 `0127`, D2 `0128` (no seed: the binding keeps its name, measured to fit), D3 written (`23cf353`) and answered on the block path (`DEC-162` §2, §3). **On a production build of `3cf1e6b` in the verification worktree, spec at `2ef91b3`, both projects, 12 of 12**; six captures `wave10-designer-{me-certificates-both,scr045-reissued-and-revoked-final,verify-issued,verify-revoked,poster-three-days,poster-one-day}.png`, **each opened by the lead in bands**: «شهادتان» with the live `RE-2026-000003` «صالحة» and the revoked `000001` «سبب الإلغاء: أُلغي تسجيل الحضور»; SCR-045 with one issued, two revoked, and the eligible list saying «مُلغاة نهائيًا — لن يصدر بديل.» directly under the for-cause member's name; `/verify` «شهادة صالحة» and «هذه الشهادة ملغاة.» with no reason shown to a stranger; the poster «17–19 نوفمبر 2026 · 6:00 م» (17 read first) and the one-day poster the characters `main` prints. **Found by the runs:** three places one element is in the DOM twice (`ui/data-table` ×2, the studio canvas) — `filter({ visible: true })` is the default (`DEC-162` §5); two captures byte-identical under two names — one file per screen **state**, not per test (`d3dda91`). Carried to M13 under its name: the phone review layout names its canvas in no heading |
| T1–T3 | `content` | a proposal's own material · two carried fixes · `03` §5.5a's text | `REQ-PRO-004`, `REQ-MAT-*` | ★ **closed** — `0129`; the link for the proposer and for staff (`c74d4de`); `03` §5.5a rewritten from its text. **On a production build of `fd90695`, both projects, 8 of 8**: the download through the real route and real Storage, as the proposer from an EMPTY proposal and as an admin on the review screen, one `material.downloaded` audit row. ★ **T2·2 closes on evidence**: a save pressed the instant the field is visible — no wait for streams or hydration — persists after a reload; the carried finding was written against a form that no longer exists. T2·1 closes on its capture — and opening it found what the green spec did not say: the label **wraps onto two lines**, which is the correct behaviour (never clipped, clears 36 px), under a test titled «sits on one line»; the title is corrected, the assertions stand. Captures opened in bands: `wave10-content-{proposal-material-proposer,proposal-material-admin,photos-takedown}-390-rtl` |

### Sync 1 — 2026-09-17 — four plans approved, five defects caught on paper (`DEC-161`)

All four plans were committed inside the time it took to build `ui/reorderable-list` and close L9, and each
was read **in full** — 553, 915, 629 and 282 lines. They are strong: `event` made the job key **null**
because `enqueue_job()` always replaces on a key (any key would collapse two members' responses, and one
derived from the member would be the leak in a string), pinned the coarsening trigger to UTC because
`date_trunc` on a `timestamptz` follows the connection's zone, and withheld the **count** with the answers;
`notify` designed a pin that no script, workflow or `package.json` entry can refresh, and checked rather
than assumed that the preview needs no `proxy.ts` change; `designer` refused to key behaviour on a phrase an
admin can type and proved a refusal takes no serial by asserting the counter row; `content` found that
`is_staff()` sits **inside** the joined branch. **Five defects were in the plans themselves** and are in
`DEC-161` in full:

| # | Whose | The defect, found on paper | Ruling |
|---|---|---|---|
| 1 | `designer` | ★ **a public poster with no date.** A new binding in a new seed (poster v3): `poster_render_context()` takes the **latest** version and migrations are pushed before the merge, so `main`'s worker would render every new poster from the v3 document with a runtime that cannot resolve it — «التاريخ والوقت» where the date should be, on the public share image | the binding's **name** does not change, its **value** does; no seed unless the measured frame demands one. Every org's own copy of a template is fixed too, which the plan would never have reached |
| 2 | `notify` | a design shared across keys — bindings that one trigger cannot police per key, a generated `body` that goes stale on every bound row, and copy that differs per key | blocks on the template's **own row** (`0125`); the platform library is constants; no eighth exception to invariant 5 |
| 3 | `notify` | the preview is a POST framed by a GET | a `<form method="post" target>` into the named sandboxed iframe; never `blob:` or `srcdoc`, which inherit the parent's CSP |
| 4 | `event` | moving `getRatingEligibility()` onto an RPC turns an **untouched** unit suite red — it runs that function against an in-memory client to pin the DAL's own `removed_at` filter | the function stays byte for byte; SQL gets its one definition (`rating_window_open()`) |
| 5 | `notify` | a mail signed twice by `main`'s worker in the window; and a webhook function granted to `anon` that trusts a caller it does not control | `body` is the blocks' text in **template form** without the composed signature; the webhook's signature is verified **in the database** |

★ **Found by `notify`, verified by the lead: every mail since Launch has been missing its link.** `{{url}}` is
the last line of 20 of the 25 default templates and nothing anywhere supplies it; the rating prompt has
carried no link to rate. **Named difference 1** — the pin records the broken bytes first, the fix is a
reviewed diff, and it needs `APP_URL` on Railway (the owner's step, in the order). Unset, the renderer
behaves exactly as today.

**Named and not closed — differencing** (`12` §9 item 8): results at three responses and at four differ by one
person's answers. Batch release closes it at the cost of a lag and of up to two responses per session never
shown; that is the owner's decision and is asked in the PR.

### Sync 2 — 2026-09-17 — `0127`–`0134` promoted, the renderer moved, and the runner became a lock

**Promoted** (`a85f6cd`), seven proposed files and one lead correction, each re-created object **diffed
against its live text first, comments aside** — the delta in every case was exactly what its plan said:

| Migrations | Track | What the diff showed, and the proof it was promoted on |
|---|---|---|
| `0127`, `0128` | `designer` | `issue_certificate()`: the live-row predicate, the for-cause guard, the handler — nothing else. `poster_render_context()`: `days`, trailing. `0127` first, because its `alter table` inside `applyProposed()` held `access exclusive` on `certificates` for each of ten cases and was deadlocking other tracks' runs |
| `0129` | `content` | all three policies: the `left join`, the `session_id is not null` wrapper, the proposal branch, `is_staff()` at the top level — identical in each |
| `0130`–`0132` | `event` | both rating policies: the inline window replaced by `rating_window_open(session_id)`, and nothing else. `event` **mutation-checked** its own cases — unpinning UTC, restoring `order by submitted_at`, removing the org clause each turn one red |
| `0133` | `notify` | `0026`'s three rules verbatim, plus one. `notify` measured **every existing template insert** against the rule before asking for anything: three refused — each a binding that never existed and has rendered blank since M3 — three pass |
| `0134` | lead | `0125`'s check let `{"schemaVersion":1}` through: a CHECK rejects only on FALSE and `jsonb_typeof(NULL)` is NULL. Found by `notify` writing the rows `0125` reserved |

★ **The whole RLS suite on the chain through `0134`, run alone: 110 files · 1,129 passed · 5 todo · 0 failed**
— so every pre-existing certificate, check-in, rating, materials and notify suite passes **under** the
changes, unmodified. `policy-diff` ✓ · `trace` 313 · 82 · 147 · no gaps.

**L3** closed (`1a46fde`) — the renderer in `@kareem/mail-runtime`, measured against N1's 116 files.

★ **The RLS runner is a lock, not a rule** (`8db4ff2`, `notify`'s proposal). «Run `pgrep` first» depended
on every agent reading the output before launching; **three of five did not in one afternoon, the lead
among them**, and `notify` measured what it costs — a 207-second run with 11 false failures against a
114-second clean one. It is vitest's `globalSetup` for the `rls` project, so it holds however the suite is
started, on its own directory so it never queues behind `qa`.

**Found since sync 1, each with an owner:**

| Found by | What | Owner | State |
|---|---|---|---|
| `notify`, pinning | **F6 — seven message keys have a template, an email channel, and no sender anywhere**: `materials_added`, `badge_earned`, `level_reached`, `certificate_revoked`, `role_changed`, `account_deactivated`, `export_ready`. The matrix test cannot see it — template and matrix agree | each key's track; wave 11 | carried, new |
| `notify`, pinning | **F7 — the sign-off may print the org's name twice** when the org is called «كريم معرفة» | owner's read, then `notify` (N6's footer) | a production read, above |
| `notify`, the DAL | `saveTemplate()` sends `org_id` in the **update** payload, and `0026`'s column grant excludes it — Postgres checks the privilege on the column, not the value — so **editing an existing email template may never have worked**; the wave-8 spec saves once and restores by delete | `notify` | fixed in its DAL (`3e83f59`); being proven against the database before it is called a defect |
| `designer` | a proposed file containing `alter table` deadlocks concurrent RLS runs through `applyProposed()` — new with contract 10 | lead | closed by promoting it first; the lock closes the class |
| `designer`, on itself | an **uncommitted** red file under `tests/rls/` is collected by everyone's suite the moment it is on disk | all | the rule restated: prove a new file alone, or land it `describe.skip`ped |
| `event`, on itself · `notify`, on itself · the lead | each launched a suite without reading `pgrep` first | — | the lock |

### The eight questions named at Step 0 — each answered at sync 1

| Question | Whose plan | Why it cannot wait for the build |
|---|---|---|
| Where the email platform library lives — rows or code. `notification_templates.org_id` is `not null`; an eighth exception to invariant 5 needs a reason constants in the package do not already give | `notify` | ✅ **constants** in `@kareem/mail-runtime`; no exception |
| What a block template's row gives `main`'s worker in the merge → Railway window (`body` is `not null`; the generated text alternative is the obvious value) | `notify` | ✅ the blocks' text in **template form**, without the composed signature (defect 5a) |
| How a verified Resend webhook reaches a `service_role`-only function when `service_role` is never on Vercel (invariant 7) | `notify` | ✅ an `anon`-executable wrapper that **verifies the signature itself**, the secret in the database (defect 5b); carried with this design if N8 does not fit |
| What an org's existing string override becomes in the editor | `notify` | ✅ it stays a string and renders byte-identically; «حوّله إلى تصميم» is one reversible action |
| The survey's minimum: `rating_min_aggregate`, or a setting of its own; and the withhold rule per question type, the rate's numerator included | `event` | ✅ its own, **with a floor of 3**; per question, every type, the count included |
| The jitter's bounds, and what the demonstrable does instead of waiting | `event` | ✅ uniform 10 min … 4 h, in SQL; a spec pulls `run_at` forward and the real worker runs |
| How a removal's revocation is told from an admin's revocation **for cause** — nothing may quietly replace the second | `designer` | ✅ a column, `revocation_cause`; never the phrase; the refusal precedes `allocate_serial()` |
| What happens to the poster of a session already published when the new seed lands | `designer` | ✅ moot — no new binding (defect 1); a poster takes the range at its next regeneration, a detached one never auto-regenerates |

### ★ The owner's order for `0123`+ — a DRAFT from day one, because writing it is an audit

Production is at **`0122`**. Known today, before any SQL exists: **(a)** the survey adds tables and touches one
live table's **data** — `ratings`' two instants coarsened by a backfill; the production read will count the
rows first · **(b)** the merge → Railway window matters for **mail**: `main`'s worker reads a template as
`{subject, body}` and must still send something correct for an org that saves a block template in that window
— or the order says nobody edits a template until the worker is on the merge commit, as wave 9 said of
multi-day sessions · **(c)** a second certificate row must not break `main`'s `issue_certificates` task or
SCR-045 · **(d)** the bounce webhook needs `RESEND_WEBHOOK_SECRET` on Vercel — an owner's step. The table of
files, the caller audit and the data-shaped rehearsal land here **before the PR is marked ready**.

**The files so far:**

| # | Author | What it adds | Data statement? | `main` on it |
|---|---|---|---|---|
| `0123` | lead | one trigger function and four `after insert or update` triggers — recognition edits write `scoring_config_history` | none | `main`'s admin screen writes the four tables exactly as today and gains a history row it never reads |
| `0124` | lead | nine survey tables, one enum, `org_settings.survey_min_responses` (default 3, floor 3) | none — a new column with a default | nothing of `main` reads any of it |
| `0125` | lead | `notification_templates.blocks`, `source_family`, one enum, a column grant | none | `main`'s app writes the six columns it always has; `main`'s worker reads `{subject, body}` |
| `0126` | lead | two definer functions and one `storage.objects` policy — an active org's PNG or JPEG logo, to `anon` | none | nothing of `main` calls either; ★ **new public surface** — the owner's rehearsal should read the policy's text |
| `0127` | `designer` + lead's DDL | `certificate_revocation_cause`, `certificates.revocation_cause`, the partial unique index `certificates_live_once` **created before** the table constraint is dropped; `revoke_certificate(…, p_cause default 'for_cause')` (old signature dropped in the file), `issue_certificate()`, `attendance_certificate_sync()` | none — the index builds over existing rows; ★ **read first: no two non-revoked certificates share (org, session, member, kind)** — true by the old constraint | `main`'s two-argument `revoke_certificate` call resolves and takes `for_cause`; `main`'s worker reads a `42501` as «no longer eligible» |
| `0128` | `designer` | `poster_render_context()` dropped and re-created, `days jsonb` trailing | none | `main`'s worker reads named fields and never sees the column |
| `0129` | `content` | three policies dropped and re-created, one of them on `storage.objects` | none | a session's material reads exactly as before; ★ **read first: the two `storage` policies exist** — a public-only dump does not carry them (wave 9's repair) |
| `0130` | `event` | the coarsening trigger on `ratings`; ★ **the backfill — `update ratings`** truncating both instants to the UTC day, idempotent `where`; the aggregate view re-created | ★ **yes — `ratings`**. Read the count first; no trigger fires on it (`ratings_award_points` is `after insert`) | `main`'s app writes both instants and the trigger truncates them; nothing of `main` renders either |
| `0131` | `event` | `rating_window_open()`; both rating policies dropped and re-created to call it | none | the same refusals as today — the existing rating suites, unmodified |
| `0132` | `event` | five definer functions — the survey's authoring half | none | nothing of `main` calls them |
| `0133` | `notify` | `notification_bindings()`, two scanners, `notification_templates_validate()` re-created with `0026`'s three rules verbatim and a fourth | none | ★ **read first: `notification_templates` rows and their text** — an existing row with an unknown binding is refused on its NEXT update, not at the push |
| `0134` | lead | `notification_templates_blocks_shape` dropped and re-added with `blocks ? 'blocks'` | none — validates over a column nothing has written yet | — |
| `0135` | lead | `build_data_export_payload()` re-created (`create or replace`, same signature, grants kept) with one key appended — `surveys_answered` | none | `main`'s `build_data_export` task stores the payload opaquely (`record_data_export($1, $2::jsonb)`), so it carries a key it has never heard of; every key it knew is unchanged |

#### What the lead has proved so far — run mid-wave on the chain through `0134`, re-run at the freeze

**1 · The caller audit, mechanical.** Every `.rpc()` in `main`'s `src/` at `f2ead54` — **80 functions** — parsed
with the argument names it sends and resolved against the catalogue at `0134` by PostgREST's own rule (the
names sent are a subset of the function's, and every name not sent has a default): **80 of 80 resolve.** All
**60** functions `main`'s worker names in SQL exist. (Wave 9's parser read two words of a comment inside
`schedule_session`'s argument object as keys; it strips comment lines now.)

**2 · ★ The data-shaped rehearsal.** A bare `postgres:17` with `scripts/ci/roles.sql`, `main`'s chain
`0001`–`0122` and graphile-worker's schema; then `main`'s own full RLS fixture **committed**, plus the shapes
this wave's data statements touch and the fixture lacks: a rating **edited** at millisecond precision and one
submitted a microsecond before a UTC midnight; an attendance certificate revoked **with the removal hook's
fixed phrase** and one revoked in an admin's own words; a **proposal's** material with a version; and — already
in `main`'s fixture — a template interpolating a binding its key never carried. 360 rows across 73 tables and
the job queue snapshotted; **`0123`–`0134` applied in order, each in one transaction, `ON_ERROR_STOP=1` — 12 of
12 clean.** Then, row by row:

| Check | Result |
|---|---|
| every pre-existing column of every pre-existing row, 73 tables and the queue | **identical**, except the one intended delta below |
| ★ the intended delta — `0130`'s backfill | both `ratings` rows: `submitted_at` truncated to its UTC day (`…21:59:59.999999` → `…00:00:00` of the **same** day); the edited row's `edited_at` likewise. Nothing else on either row |
| new columns on old rows | `certificates.revocation_cause` **null** on all four — so both revoked rows read as **final**, the removal-phrased one included, which is `DEC-161`'s conservative direction · `notification_templates.blocks` / `source_family` null — string templates, as before · `org_settings.survey_min_responses` = 3 |
| `0127`'s index over existing rows | built — two revoked rows and a live one for the same member do not collide |
| ★ a template with an unknown binding | **survives the push untouched**; its **next write is refused** `unknown_binding` — so the production read of `notification_templates` matters: an org with such a row could not save it again until the text is corrected |

The container holds fixtures only. `0135`+ — `event`'s submit and results, `notify`'s test send — join it at the freeze.

**Added at sync 2:** `select name from public.orgs` — `notify`'s F7: the string path's sign-off is «{org} · كريم معرفة · …», so an org literally named «كريم معرفة» signs twice; one read says whether that is live · a count of live certificates sharing (org, session, member, kind), which must be 0 for `0127`'s index to build.

**The production reads the order will carry, known at sync 1:** the `ratings` rows E5's backfill will coarsen
(count first) · `select count(*) from public.notification_templates`, and their text if not zero — the new
binding rule refuses an existing row with an unknown binding on its next update · `select count(*) from
public.certificates where state = 'revoked'` — historical revocations read as final, and what to do with
any is a scoped, owner-run statement, never a migration · the two `storage` policies `content`'s file
replaces, present. **The owner's steps, known at sync 1:** `APP_URL` on Railway (named difference 1) · the
webhook's signing secret **in the database**, one statement, and the endpoint in Resend (N8, if it ships).

**Read on day one, from `main`'s worker as it stands — so each plan is reviewed against a fact, not a hope:**

| `main`'s code | What the wave does under it | What happens |
|---|---|---|
| `send_notification.ts` reads `ctx.template` as `{subject, body}` and renders it on the string path | an org saves a **block** template before the worker redeploys | correct and undesigned — **provided the row's `body` is the generated text alternative in TEMPLATE form, its `{{bindings}}` intact**; a rendered text would send one member's name to everyone. `notify`'s plan must say which |
| `rate/actions.ts` writes `edited_at` from JavaScript; the insert takes `submitted_at default now()` | a `before insert or update` trigger coarsens both | the trigger wins for `main`'s app too; nothing in `main`'s `src/` renders either instant (`ratings.ts:39` only maps it) |
| `issue_certificates.ts` selects the one row `issue_certificate()` returns, then renders by id | a second certificate row for one member | unaffected — it never lists rows; a for-cause refusal is a `42501` it already reads as «no longer eligible» and does not retry. One cosmetic on `main`'s SCR-045 («صدرت بـ» naming the revoked row's design), self-correcting on deploy |
| ★ `regenerate_poster.ts` renders the document `poster_render_context()` hands it — the **latest** template version — with `main`'s runtime | `designer`'s plan seeded poster v3 binding a new name | **a public poster saying «التاريخ والوقت»** — defect 1 of sync 1. Closed on paper: no new binding, so any document version renders on `main`'s runtime |
| ★ graphile-worker `0.18` fetches `task_id = any(<the tasks this worker registers>)` (`dist/sql/getJobs.js:176`) | the new app enqueues `record_survey_response` and `send_test_email`, which `main`'s worker has never heard of | **the jobs wait, unfailed, for a worker that knows them.** A survey response is stored late — which is the point of it anyway; a test mail arrives when the worker redeploys. No job is lost and none is retried to death |

### ★ The standing post-merge step — Railway (the owner's, every merge, until the dashboard is fixed)

**Railway's push trigger has never been armed** — four merges in a row now (PRs #23 … #26) the worker moved
only when someone reconnected the source by hand. **After every merge to `main`, the owner checks the worker's
deployed commit in Railway and reconnects the source if it has not moved.** The fix is a dashboard setting
(Service → Settings → Source → the branch's deploy trigger); it is the owner's, and no session changes it.

### Carried — diagnosed, each with an owner

| Owner | Finding | From |
|---|---|---|
| owner | the two canvas contrast questions (`DEC-123`: browse tag counts at 1.96 : 1, a 13 px caption at 3.30 : 1) — asked in waves 8 and 9; **asked next in this wave's PR, not in a brief**. The app ships the passing tokens | wave 6 |
| owner | **`bookmarks:237` «never updates» on Next 16.3.5** — a timing race, not load; the trace is wave 8's | wave 8 |
| owner | break-glass opens no org screen (`DEC-055` C; option A is the owner's to schedule) | wave 8 |
| ~~lead (L9)~~ | ~~recognition edits write no audit or history row~~ — **closed** by `0123` | wave 8 |
| lead (M13) | the «مطلوب» marker on the manual-mark form's three controls; `DayWindow.id` / `position` could be optional | wave 9 |
| `console` (M13) | the attendance table scrolls sideways inside its container at 390 px from two days up | wave 9 |
| lead (custodian) | the filter sheet's native date mask | waves 6–7 |
| lead (custodian of `sessions`) | the proposal screen shows an **admin** the badge «مسودة عندك» on somebody else's draft — seen in `wave10-content-proposal-material-admin-390-rtl`; the wording is the proposer's | wave 10 |
| M13 | `controlClass`'s `w-full` beats a caller's `w-*`; `DEC-145`'s orphaned streaming segment; CSP report-only; status-colour contrast enforcement; `DEC-126`'s «تسجيل الدخول» and `chapter.tsx`'s eleven glyphs | waves 6–8 |
| ~~`designer`~~ · ~~`content`~~ · ~~`notify`~~ | ~~re-issuing a certificate after a revocation~~ · ~~a proposal's own material~~ · ~~`REQ-NTF-007`'s editable required fields and `REQ-NTF-008`'s bounce webhook~~ · ~~`ratings.edited_at` at millisecond precision~~ · ~~the photo tile's takedown label; a save pressed before hydration on `/app/me`~~ — **each is a row of this wave** (D1, T1, N3 and N8, E5, T2) | waves 6–9 |

### Order inside the wave

1. **Step 0** — done. Push; the draft PR opens at the first push.
2. **Spawn** `event`, `notify`, `designer`, `content`, each **planning-only**: a plan in
   `docs/plan/notes/<name>.md` against the contracts it owns and consumes, the columns it needs from the lead,
   its untouched proof, and nothing else edited until the lead approves.
3. **The lead builds `ui/reorderable-list` while they plan** (L1).
4. **Sync 1** — four plans read **in full** and answered; the eight questions above ruled; the tables landed
   (L2) with their `02` and `03` text; ★ **the owner's order drafted** (L7) — `main`'s worker read job by job
   against the planned schema **now**, not on the last afternoon.
5. **The order the seams force**: N1 (the pin) → L3 (the package) → N2; E1's functions on L2's tables before
   E2–E4; contract 10's DDL with D1's file; T1 alongside, touching nobody.
6. At each sync (`TEAM.md` §3) the lead promotes SQL with `supabase migration up --local` (never a reset
   mid-build), builds **committed HEAD** in the verification worktree, runs e2e there with `E2E_SHOTS_DIR` set
   to the main checkout's `.qa-shots/rtl`, **opens every capture in bands**, reads the ledger's `git diff`, and
   moves contract states here.
7. Freeze; both demonstrables on the real worker; the full gate set on the final commits — a full e2e run's
   failures re-run **alone** before they are read, a failure on **both** projects being real; the owner's
   order, the caller audit and the data-shaped rehearsal finished here **before the PR is marked ready**. The
   owner pushes, merges, **then checks Railway by hand**. **Do not start wave 11.**

---

## ★★ WAVE 9 — COMPLETE and MERGED (PR #26, `f2ead54`; `0100`–`0122` pushed; the worker on the merge commit) — multi-day sessions: a day entity under seven live tables (`DEC-119` … `121`, `DEC-150`)

**The owner's goal, in substance** (`docs/plan/notes/wave-9-lead.md`): a session can span several days, each
day with its own check-in and its own content, one registration and one certificate for the whole — and **a
one-day session, which is nearly every session, pays nothing for it**. It is the largest schema change since
M1, on a live database with real members.

**The measure — two demonstrables, not a route count.**

1. ★ **A three-day workshop, end to end, as one run**: scheduled with three days; each day's code checked
   into separately; a session-scoped material and a day-scoped one in the right groups; points and the
   certificate awarded **only after the third day**; the whole at 390 px in Arabic. The spec is the lead's —
   `tests/e2e/wave9-three-day-workshop.spec.ts`, real worker (`E2E_WORKER=1`) — and its captures land at
   `.qa-shots/rtl/wave9-demo-*.png`, opened by the lead.
2. ★ **A one-day session is byte-identical in behaviour to `main`.** The proof is the suites that exist
   today passing **with their assertions untouched** — at wave 8's final gates the RLS suite (833), vitest (1,707), the e2e suite
   (514), `qa` 44/44, `visual` 0.000 %, `parity`. It is proven **twice**: on `0100` alone, before any feature
   exists, and on the final commit.

### ✅ CLOSED 2026-09-17 — the security hole on production, and the one statement that closed it (`DEC-152`) — run and verified by the owner (`f / f / f`); `0103` carries it; kept as the record

**`public._issue_check_in_code(uuid)` has been executable by `anon` since M2.** It is `SECURITY DEFINER`,
checks no caller, and returns the **live check-in code** for any session id — and a session's id is in its
public share link `/s/<id>`. **Proven locally through the API with the publishable key alone**; its guarded
sibling refused the same call. It lets **a member read the code without being in the room and check in from
anywhere** (points and a certificate for a session they did not attend), and lets anyone write
`check_in_codes` rows into any org. It does **not** let anyone check in who is not an active member of that
org with a seat. `checkin` found it while re-creating the function; the lead verified it, and it is closed on
this branch by `0103`.

**You can close it on production today, without waiting for this wave** — the statement is idempotent, so
`0103` later changes nothing. It removes a privilege nobody granted on purpose; its three callers are
definer functions and keep working. No session runs it for you (`DEC-051`, and production writes are yours):

```sql
-- Read first: expect `t` for anon today.
select has_function_privilege('anon', 'public._issue_check_in_code(uuid)', 'execute');

-- The fix.
revoke execute on function public._issue_check_in_code(uuid) from public, anon, authenticated, service_role;

-- Read again: expect `f`. Then open a live session's host view and confirm the code still shows and rotates.
select has_function_privilege('anon', 'public._issue_check_in_code(uuid)', 'execute');
```

`supabase db query --linked "<statement>"` runs each (`CLAUDE.md` § *Running SQL against production*).

### The untouched-suite ledger

Every test file that existed on `main` at `e1d8596` and is modified on this branch is named here, with why.
**A changed expectation for a one-day session is a defect, not a ledger line.** Checked by the lead at every
sync with `git diff --stat e1d8596 -- tests/ | grep -v wave9 | grep -v days`.

| File | Commit | Why | Expectation for one day changed? |
|---|---|---|---|
| `tests/rls/realtime.test.ts` | `ad43ddb` | the case read «the last message» by `order by inserted_at`, which is the transaction's start and identical for every row a rolled-back test writes; `main`'s CI failed on it at PR #25's merge | no — same assertion, read by id |
| `tests/unit/admin-audit-labels.test.ts` | `7ed788f`, `eadc7e4`, `546b29f` | it reads every single-quoted dotted literal in a migration as an audit action, by design; `kareem.days_writer`, `kareem.check_in_shadow` and `kareem.days_notified` are custom Postgres settings, which must contain a dot. Added to the file's own documented exemption list, beside wave 8's `background.color` | no — no assertion touched |
| `tests/rls/db.ts` (harness) | `5da53a3` | `applyProposed()` is a no-op for a file the lead has promoted, so a teammate's test keeps passing the moment its SQL moves into `migrations/` — wave 2 lost a CI run to a missing `existsSync` guard (`DEC-047`) | no — not a test |
| `tests/components/me/calendar-page.test.tsx` | `notify`, `be12c0f` | `SyncedEventDTO` gained `id`, `dayPosition`, `dayCount`; three fixture literals name them for the one-day session they already described | no |
| `tests/components/browse/fixtures.tsx` | `sessions` | the shared card fixture gains `days: []` — the card reads `days` for its length alone | no — a fixture, no assertion |
| `tests/components/checkin/remove-check-in-form.test.tsx` | `checkin` | the form takes a day; the render call passes the one day every case in the file was already about (the day select does not render below two) | no |
| `tests/components/scoring/points-history-list.test.tsx` | `scoring`, `cd582b0` | a harness line (the component now reads `sessions.days` for the day label, and `missed` defaults to `[]`). The six new cases it briefly held were moved to a new file at `47ac71a` | no |
| `tests/rls/sessions-public-card.test.ts` | lead, `0118` and `0122` promotions | the file asserts the public card's return type **as an allowlist** — «these keys are ALL there is». `day_count` (`DEC-156`) and `days` (`DEC-157`: two instants per day, no id, position or venue — asserted key by key) were each admitted by a lead-reviewed edit at the promotion where the failure first appeared | ★ **yes — the wave's only two, both on purpose**: the row gained two keys; at one day `day_count` is 1, `days` has one element equal to the session's own window, and the rendered card is unchanged |
| — | `content` | ★ **none**: its five component tests (`materials/{list,proposal-list}`, `photos/gallery`, `tasks/{panel,task-item}`) are untouched against the wave's base, because it made the new DTO field optional rather than edit five fixtures | — |

### Before anyone spawns

| | What | Commit | Evidence |
|---|---|---|---|
| ✅ | **`main`'s red CI diagnosed and fixed** — the realtime payload-shape case, a wave-1 test defect | `ad43ddb` | five consecutive local runs green; the fixture's seeded «like» on the same topic explains the `{ like: 1 }` CI read |
| ✅ | **Step 0**: the wave-9 map in `CLAUDE.md`; all ten `.claude/agents/*.md` regenerated (`scoring` seven waves stale, `notify` six); `DEC-150`; this block | `2112198` | draft PR #26 |
| ✅ | **The foundation — `0100`** | `7ed788f` | ★ **on this file alone: the whole existing RLS suite, unmodified — 833 cases — plus the generated sweep's new `session_days` row, non-vacuous because the shim gave every fixture session its day.** 24 new cases, one per `03` §8.2 row. `fixture-m2` is the legacy writer the shim exists for: it inserts a session's window directly, checks a member in a day before the session begins, and hands `check_ins` a bogus `session_window` — all still work. Found on the way: `policy-diff` parses only a **quoted** policy name; `service_role` holds no table grant on `sessions` or `check_ins`, so it gets none here; `resolve_session_day()` is definer and takes a bare id, so it is executable by **no** client role |
| ✅ | **`0101`** — `session_days.check_in_open`, `check_in_ceiling()` with the resolver re-created to use it, `calendar_events.session_day_id` | sync 1 | the same proof again: **every pre-existing RLS file green, none modified**; 28 cases in `session-days.test.ts`. Found while writing its tests: `main`'s `record_calendar_sync()` inserts with no day, which `notify` reads as «the day is gone» — a `before insert` default gives a legacy row its first day |
| ✅ | **Contract 9** — `src/lib/session-status.ts` on the day set | `8850b03` + sync 1 | `session-status.test.ts` and `session-matrix.test.ts` **unmodified, 118 green**; a new case asserts a one-day session reads the same with its day passed as without, at every half hour in every state; between two days an `in_progress` workshop grants no host console (the direction rule holds across the gap) |
| ✅ | **Contract 10** — the `REQ-TSK-002` guard | `d213552` | both halves **seen to catch a planted violation** before being trusted: a function joining `task_completions` to `check_ins` inside a rolled-back transaction; the import regex against static, re-export, dynamic, side-effect and multi-line imports. Today nothing couples them: no SQL function names a task table at all |

### The contracts — the wave's checklist

A contract is **published** when its owner has written the signature, the types and the `n = 1` behaviour in
its note; **landed** when the code is promoted or committed; **held** when the consumer's own test exercises
it. A row closes at *held*.

| # | From → to | The seam | `n = 1` must | State |
|---|---|---|---|---|
| 1 | lead → all | **The day set is the truth; `sessions.starts_at` / `ends_at` / venue are its stored shadow.** `session_days` by `position`; nobody computes a min or a max in TypeScript. A writer of the session's own window is carried onto its one day while `n ≤ 1`; a day-aware writer sets the transaction-local `kareem.days_writer`, writes `sessions` **once** (so `sessions_notify` fires once) and its days; a deferred constraint trigger checks the pair at commit | every direct insert and update of `sessions` in a fixture, a spec or `main`'s `schedule_session()` leaves one day carrying the same window and venue | ★ **held** — `0100`; every existing RLS file is the consumer |
| 2 | lead → all | **Additive; `main` and `main`'s worker are correct on the new schema.** No column dropped or renamed. A new parameter is trailing and defaulted, and the old signature is dropped in the same file. `sessions.check_in_open` keeps its meaning. Reminder keys (`remind:{session}:{offset}:{member}`), the nudge key and the ICS `UID` (`session-{id}@kareem.pp.sa`) of a one-day session do not change | the wave's migrations pushed onto `main`'s build: every screen and every job as today | ★ **held** — every existing suite green on the final commit, plus the mechanical caller audit (75 of 75 RPCs, 55 of 55 worker functions) and the data-shaped rehearsal (row L9) |
| 3 | `sessions` → all | **`schedule_session(…, p_days jsonb default null, p_require_all_days boolean default null)`** — null is today's call. `p_days` is `[{ id?, starts_at, ends_at, venue_id?, custom_venue_name?, custom_venue_address?, custom_venue_map_url? }]`, matched by `id`; a day left out is deleted, refused `day_has_attendance` when it holds a check-in; its day-scoped content is promoted by the foreign key. **`SessionDay { id, position, startsAt, endsAt, venue }` and a `cache()`-wrapped `listSessionDays(sessionId)`** from `lib/dal/sessions.ts`, on day one — every track reads days through it | the form posts what it posts today and the RPC does what it does today, one audit row, one notice | ★ **held** — the readers (`3cdc690`) are read by `content`, `checkin`, `notify` and `scoring`; the RPC is `0106` (`eeaa3c4`), with `sessions-scheduling`, `checkin-walk-ins-publishing`, `notify-session-notices` and `notify-reminders` unmodified beside it — `listSessionDays(locale, sessionId)`; a null `p_days` on a session with several days is refused `days_required`; a list over many sessions may embed `session_days(…)` |
| 4 | `checkin` → `sessions`, `scoring`, `content` | **The day's check-in.** Each RPC keeps `p_session` and gains a trailing `p_day uuid default null`; null resolves the day as `0100`'s trigger does — the code's day; else the day whose window to `ends_at + 2 h` contains `now()`, the later-started of two; else the latest day begun. The switch and the ceiling are the day's. ★ **Ruled (`DEC-151`): the ceiling is capped by the next day's start — `check_in_ceiling()`, the lead's, `0101`; nothing having begun, the resolver returns the first day.** The attempt rate limit is per day (`REQ-SES-015`). The event page's link and `has_checked_in()` (any day) are unchanged in shape | every envelope status, error code and audit row of `check_in()`, `mark_checked_in_manually()`, `set_check_in_open()`, `ensure_check_in_code()`, `remove_check_in()` as today | ★ **held** — `0104`, `0105`; consumed by `sessions`' event page, `scoring`'s predicate and the demonstrable: three days, three codes, each check-in row on its own day, yesterday's code refused |
| 5 | `checkin` ⇄ `scoring` ⇄ lead | **Three hooks when attendance changes (`DEC-151`).** `check_in()`, `mark_checked_in_manually()` and `remove_check_in()` decide nothing about points or certificates: `scoring`'s `attendance_recorded(p_check_in)` / `attendance_removed(p_check_in)` are **points only**; the lead's `attendance_certificate_sync(p_session, p_member)` (row L4) revokes when contract 6 is false and enqueues the issue job when it is true, the session is completed and no live certificate exists. **Order: `scoring` publishes its two with `main`'s exact behaviour; the lead promotes; then `checkin` switches** | the same job, the same key (`pts:check_in:<id>`), the same ledger row, the same reversal and the same revocation as today | ★ **held** — `0102`, `0108`, `0113`, `0120`: the three check-in functions end in the hooks and name no points or certificate primitive; the demonstrable's ledger is the consumer |
| 6 | `scoring` → lead (custodian of `designer`), `content` | **`session_attendance_complete(p_session, p_member)`** — the only definition of «attended the session» for points and certificates: an active check-in on every day when `require_all_days`, on any day otherwise. `has_checked_in()` stays the definition for rating, photos and a session-scoped «بعد» material. The award's key is per member per session **and survives remove → re-add** (wave 7's reversal); the missed-day reason's shape is published for `me/points`. The lead points `fan_out_certificates()`, `issue_certificate()` and `listEligibleRecipients()` at it on `scoring`'s written request | the predicate equals `has_checked_in()`; awards land at check-in; the ledger of an existing member recomputes to the same balance | ★ **held** — `0107`, `0108`, `0113`, `0121`; the demonstrable: one award and one certificate for the member who came to all three days, none for two of three, ONE presenter bonus from five check-in rows |
| 7 | `content` → `sessions` | **The three slots group themselves.** `SlotProps` unchanged; a slot reads days through contract 3, renders **flat at `n ≤ 1`**, and renders group headings as `<h3>` (the page owns the `<h2>`). `sessions` publishes one day-label formatter («اليوم الأول · الأربعاء») and its strings; `content` reads them. `materials_read` and its storage twin release a day-scoped «بعد» material when **that day** ends | the DOM of the three sections as today: no group, no heading, no chip | ★ **held** — `0115`, `0116` and the three grouped slots; flat at one day (`materials`, `tasks`, `photos` component suites unmodified); each group's add form behind its header control, closed on load, from an EMPTY workshop too (`DEC-157`, `DEC-159`) |
| 8 | `notify` ← 1, 3 | **One calendar entry and one reminder stream per day.** `calendar_events` per `(member, day)` — its `alter table` through the lead after sync 1; one `VEVENT` per day; reminders per day, **with which offsets repeat per day decided in `notify`'s plan** (a 7-day reminder before each of three consecutive evenings is noise) | one entry, the same `UID`, the same three reminder jobs under the same keys | ★ **held** — `0109`, `0110`; `wave9-notify-days` on both projects, its mail case on the real worker through Mailpit |
| 9 | lead → all | **`src/lib/session-status.ts`.** `PhaseInput.days?: readonly DayWindow[]`; `live` = a day is running, `ended` = the last day has ended, between two days `open` — **no seventh phase**. `dayPhase(day, now)` and `checkInDay(days, now)` exported for the matrix and the slots | `tests/unit/session-status.test.ts` and `session-matrix.test.ts` unmodified and green | ★ **held** — `8850b03`; `checkInCeiling()` carries `0101`'s cap |
| 10 | lead | **`REQ-TSK-002` enforced.** A test fails if a check-in function's source or a module in the check-in import graph names `session_tasks`, `task_completions` or `task_form_responses` | — | ★ **held** — `d213552` |
| 11 | `sessions` → `notify` | ★ **New at sync 1 (`DEC-151`): `session_days_changed(p_session, p_before jsonb, p_after jsonb)`**, called once after a day-aware `schedule_session()`'s last day write. **No trigger on `session_days` notifies** — a row trigger fires mid-write and would announce the first row's partial truth. It says what `sessions_notify` cannot see (a day ≥ 2 moved, a day added or removed, the last end), reschedules reminders and enqueues the calendar jobs | the legacy path never calls it: one notice, byte-identical, by construction | ★ **held** — `0111` + `0112`, promoted together (`DEC-154`); the inbox notice and the mail name the day that moved |

### The foundation's application-level proof — 2026-09-17, build `b2cad76` in the verification worktree

`0100` + `0101` + contract 9, **no spec modified**:

| Gate | Result |
|---|---|
| CI on PR #26 | **13 of 13 green**, including the RLS job in a clean Postgres container and the chain applied from `0001` |
| `npm run build` · `npm run qa` | green · **44 passed, 0 failed** |
| e2e, full suite, **while five teammates were building on the same machine and database** (load average ≈ 13) | 485 passed, **10 failed**, 26 did not run, 77 skipped by project — none of the ten in scheduling, check-in or the session window |
| ★ the same ten, alone | **all green**: the nine spec files together — **105 passed, 0 failed** (`bookmarks:237` among them); `budgets` alone — passed, **JS 159 KB and TBT 8 ms unchanged from wave 8**, LCP readings the same as wave 8's |

Contention, not the foundation. **A clean full-suite run is a final-gate item, taken when the teammates are
idle** — a full run during a build day measures the machine.

### ★ Named differences at one day — each a fix, each approved in `DEC-151`, each with its own NEW test

«Byte-identical» means **no regression**, not the preservation of a defect. Nothing below is asserted by an
existing test, and nothing else may differ.

| # | Owner | What changes for a one-day session | Why it is a fix |
|---|---|---|---|
| 1 | `checkin` | `rotate_codes` stops minting codes for a session left `in_progress` past its check-in ceiling | the codes were unusable — `check_in()` already refuses past the ceiling (`REQ-CHK-016`) |
| 2 | `scoring` | `evaluate_company_points()` rule 2 excludes removed check-ins | the one reader wave 7's `0088` sweep missed (`DEC-141`) |
| 3 | lead (L4) | a member **marked present after the session completed** gets their certificate — ★ narrowed by `DEC-153`: **when none was ever issued**. After a **revocation** nothing is re-issued: `certificates` is unique per session, member and kind, and `issue_certificate()` returns the existing row even when it is revoked (wave 7's carry, cause now known) | the fan-out fires only on the edge into `completed` |
| 4 | `notify` | `{{startsAt}}` in mail is a formatted date, not a raw ISO instant | **unconditional** (`DEC-154`): the database's own string through `renderEmail()` read «الموعد: 2026-09-19T06:37:03.319767+00:00» |
| 5 | `notify` | a reminder mail **names its venue** | every reminder since M3 has read «المكان: » and nothing — `send_reminder_notification()` never put a `venue` in the payload (`DEC-154`) |

### Sync 1 — 2026-09-17 — five plans approved, four defects caught on paper (`DEC-151`)

All five plans were committed within the time it took to build `0100`, and each was read in full. They are
strong — `sessions` found that a day moved inside the session's window notifies nobody (now contract 11);
`checkin` found that `rotate_check_in_code()` is `language sql` and pins the drop order of its file;
`notify` found that dropping `calendar_events`' old unique constraint in a different file from the function
that names it would fail every calendar sync with `42P10`. **Four defects were in the plans themselves**,
and are in `DEC-151` in full: reopening one day would have opened every day (`checkin`'s shadow triggers);
a second attendance award while the first still stands (`scoring`'s key, under the relaxed rule or a late
manual mark); group headings on a **one-day** session for a presenter, and hidden content after a session
is cut back to one day (`content`'s grouping); a second overload of `record_photo_upload()` that would have
broken `main`'s worker.

**Ruled:** the ceiling is capped by the next day's start, as one function of the lead's; the rate limit is
per day; contract 5 has three hooks and contract 11 is new; reminders repeat by `notify`'s «after the
previous day ended» rule; identities suffix by position. **Row L6 — a multi-day poster's date — is not this
wave**: `0098` made the library a migration, so a new binding is a new seed (`DEC-149` §3), and a poster
that shows the first day's date is true, if incomplete. Carried to wave 10 with the reason.

### Sync 2 — 2026-09-17 — every track's SQL promoted, `0102`–`0116` (`DEC-152` … `DEC-155`)

Each promotion was run against **the existing suites unmodified** before it was committed, and applied with
`supabase migration up --local` — never a reset mid-build, which would cut a teammate's running suite.

| Migrations | Track | The one-day proof it was promoted on |
|---|---|---|
| `0102` | `scoring` | contract 5's two functions, `main`'s text verbatim — `award-points`, `checkin-removal`, `checkin-manual-mark` unmodified |
| `0103` | lead | ★ **the security revoke** (`DEC-152`) — the anonymous API call answered 42501 afterwards; `checkin`, `checkin-window` unmodified |
| `0104`, `0105` | `checkin` | a clean full RLS run: 971 passed, **every pre-existing file green** — the ten failures were four teammates' new files still being written |
| `0106` | `sessions` | `sessions-scheduling`, `checkin-walk-ins-publishing`, `notify-session-notices`, `notify-reminders` unmodified, 130 cases |
| `0107`, `0113`, `0114` | `scoring` | all thirteen existing scoring and check-in suites unmodified, 152 cases |
| `0108` | lead | `designer-certificates`, `certificates-designs`, `checkin-removal`, `checkin-late-job-hooks` unmodified |
| `0109`, `0110` | `notify` | the ten existing notify and calendar suites unmodified |
| `0111` + `0112` | `notify` + `sessions` | promoted together; the seam defect above found and fixed |
| `0115`, `0116` | `content` | the six existing content suites unmodified, 100 cases |

**What reading and promoting found, beyond the four defects of sync 1:**
the live security hole (`DEC-152`) · a leftover live code answering `session_ended` in the next day's room, a
disclosure `REQ-CHK-004` forbids (`checkin`) · the «بعد» rule in five policies, not two (`content`) · the
«announce once» mark consumed by an early return (`DEC-154`) · reminder mails that have never named their
venue, and an ISO instant printed raw (`notify`, named differences 5 and 4) · company points counting a
removed check-in (`scoring`, named difference 2) · `issue_certificate()` returning a **revoked** row, which is
why a re-added member gets no new certificate (`DEC-153`, carried with its cause) · **and three of the lead's
own**: a policy name `policy-diff` could not parse, a certificate ordered by `created_at` (the transaction's
start — the wave's third meeting with that trap), and a `REQ-TSK-002` guard that put «the day» on the
check-in path and failed on a task legitimately naming its day.

**Two habits that cost a run, told to all five:** a failing test saved under `tests/rls/` runs in everyone's
suite; and the RLS suite is single-runner with six of us — a collision fails unrelated files at the
one-second lock timeout and looks exactly like a regression.

### Sync 3 — 2026-09-17 — the last of the planned SQL, `0117`–`0120` (`DEC-156`)

`0117` (`notify`) and `0119` (lead) narrow two grants — `DEC-152`'s low finding on `session_venue_label()` is
**closed, not carried**: seven call sites, every one inside a definer function. `0118` (`sessions`) gives the
public card its `day_count`. `0120` (`checkin`) wires contract 5's call sites: `check_in()`,
`mark_checked_in_manually()` and `remove_check_in()` end in the hooks and name no points or certificate
primitive — **contract 5 is whole**. `checkInDay()` and `resolveDay()` became generic at `sessions`' request.

### Sync 4 — 2026-09-17 — every capture opened, the owner's order written, and what both found (`DEC-157`)

**Built and run:** the verification worktree at `fb2184c` — seven `wave9-*` specs on both projects, 36 passed,
4 failed, each failure routed with its evidence and fixed by its owner. **Every capture below was opened by the
lead at readable size** (a full-page file is cropped into bands first; a downscaled 9,000 px page reads as
nothing).

| Found by | What | Owner | State |
|---|---|---|---|
| the public card's capture | ★ «جارية الآن» to the public **between two days**, while the event page said «التسجيل مفتوح» — `sessionPhase()` given the stored window alone. Reading every call site found **four** day-less readers | `sessions` ×3, `checkin` ×1 | **fixed** `201d6aa`, `4e49fa9`; `0122` gives the card its day windows; the guard `session-phase-reads-days.test.ts` makes it impossible to repeat (`9fecda9`), its open list empty at `f1a8fe0` |
| writing row L9 | ★ `main`'s old worker would pay a presenter **three bonuses per attendee** on a three-day workshop, onto an append-only ledger | `scoring` | **closed in SQL** by `0121` (`6ad2fc8`) |
| the presenter's captures (23,780 px tall) | every group mounted an **open add form** — eight on a three-day workshop | `content` | being fixed: the form sits behind its header control, closed on load; one-day untouched |
| the member's materials capture | the phase chip read «بعد الجلسة» on day 1's slides with two days to run — ruling 4's wording half | `content` | being fixed: «قبل اليوم» / «بعد اليوم» for a material that names a day |
| `…-day-scoped-after-hidden.png` | the capture was of a **skeleton** — taken while the sections were still streaming, so it proved nothing | `content` | being re-captured after the streams settle |
| `checkin`'s ten captures | 1,082 px wide — a 412 px viewport, not the row's 390 × 844 | `checkin` | **fixed** `4e49fa9` |
| `wave9-checkin-days` on desktop | one sentence resolved twice — `DEC-145`'s orphaned streaming segment, carried to M13 | `checkin` | locator scoped to its region, `cd6ca62` |
| `wave9-content-days` tasks case | no tasks section for the member — the fixture's member had no seat, so `can.tasks` was false | `content` | **fixed** `e22af5b` |
| `wave9-sessions-schedule-days` on phone | the switch's 1 px input scrolled under the sticky bar | `sessions` | **fixed** `8902d4a` — taps the label where a thumb does, and **asserts the row is not covered** |
| reading `worker/src/index.ts` for L8 | ~~`rotate_codes` has no crontab entry and has never run~~ — ★ **the lead's misreading, corrected in `DEC-158`**: `start_session` enqueues it once per started session; later codes are minted on demand by the host view | lead | nothing to carry |

**Accepted captures so far** (390 × 844, phone project, RTL): `wave9-scoring-{one-day-unchanged,three-day-full,three-day-missed-day-two,three-day-missed-card}` — the one-day history beside its wave-7 twin is the same page; one +20 for three days; the missed-day card names the session · `wave9-notify-{calendar-one-day,calendar-three-days,notice-day-2,add-to-calendar}` — one card per day, the one-day card unlabelled, the notice names «اليوم الثاني», the menu offers each day · `wave9-sessions-{event-three-days,card-range,public-card-range}` — «3 أيام» in the hero, the three days in the action card, the range on both cards · `wave9-content-materials-{member-grouped,day-scoped-after-visible}`. **Still to open after the next build:** `checkin`'s ten at 390 px, `content`'s re-captures and its tasks and photos groups, `sessions`' schedule captures, and the demonstrable's.

### Sync 5 — 2026-09-17 — the freeze: the demonstrable on the real worker, and what only it could find (`DEC-159`)

**`tests/e2e/wave9-three-day-workshop.spec.ts`** — one serial run at 390 × 844 in Arabic, `E2E_WORKER=1`, the
worker started from the verification worktree against local Supabase only. In the brief's own order: an admin
schedules three days **through the form** and publishes · two members reserve **one seat each for the whole
workshop** · the presenter adds a material to the workshop and one to day 2 **through each group's closed
header control** · on each day the host view shows **a code of its own**, yesterday's is refused
(«الرمز غير صحيح»), and every check-in row names its day · and **only after the real worker completes the
session**: one `check_in` award and one certificate for the member who came to all three, the missed-day
notice and nothing else for the one who missed day 2, and **exactly one `attendee_bonus`** for the presenter
out of five active check-in rows. The worker's own log for that session reads «moved 1 session(s) to
in_progress», «completed 1 session(s)», «0 no-show event(s)», «1 qualifying attendee(s)», and two
`issue_certificates` lines.

| Found by running it | Owner | State |
|---|---|---|
| ★ **the event page crashed for a manager on any multi-day session holding content** — an inline closure passed from a Server Component to the shared `"use client"` re-scope chip; a production build only, invisible to jsdom | `content` | **fixed** `8b8e995` — the `"use server"` export, bound |
| ★ **a brand-new workshop could not take a day's material** — the flat empty state returned before the groups; every fixture had seeded content | `content` | **fixed** `a11d071` |
| an added day's start read «لم يُحدَّد بعد» above its own end time | `sessions` | **fixed** `4e0b075`, asserted |
| every toast announced «Notification …» in English to a screen reader, since M9 | lead | **fixed** `07e16a0` |
| ★ **two wave-7 public-card specs red on both projects** — the lead's own «nit» about a «·» had been applied to a clause wave 7 pinned on purpose | `sessions` | **restored byte for byte** `d72ed4a`; the nit is withdrawn |
| day 2's check-in refused as an overlap with the member's own day 1 | lead (the spec) | not a product defect: the spec's clock now ages what is recorded with its day |

**Captures opened by the lead at sync 5** (bands, never downscaled): `checkin`'s ten beside their one-day
twins — the host view gains exactly one line, the check-in screen names the day and refuses in the day's
words, the report gains «أكملوا كل الأيام» and its sentence, and the one-day screens carry none of it ·
`sessions`' schedule captures after the fix · the demonstrable's eight.

### The final gates — 2026-09-17 — product code at `8b8e995` (+ `d72ed4a`, `07e16a0`); specs and docs after it

Built in the verification worktree from **committed** HEAD; the real worker run from the same worktree against
local Supabase only. Every number below is from the final product code.

| Gate | Result |
|---|---|
| `npx tsc --noEmit` — app and worker | **0 errors** each |
| `npm run lint` | **0 errors** («25 problems (0 errors, 25 warnings)» — every warning an unused variable that predates the wave) |
| `npm test` | **209 files, 1908 tests, all passed** |
| ★ `npm run db:reset` from `0001` → **`0122`**, then `npm run test:rls` (single runner) | **99 files · 1039 passed · 4 todo · 0 failed** — the generated isolation sweep covers `session_days` |
| `policy-diff` · `trace` · `ui-lint` · `loading-coverage` · `error-coverage` | all ✓ — `313 requirements · 73 entities · 147 stories · no gaps`; the ui-lint allowlist **shrank by 11** (`15d8908`) |
| `npm run qa` | **44 passed, 0 failed** |
| `npm run visual` against a baseline captured from `main` (`b7f2f3a`) | **0.000 % on all eight pairs** |
| `npm run parity` | **holds** — 7 cases × 4 paths, the background block 3 of 3; the renderer and the goldens are untouched this wave |
| ★ **The demonstrable**, `E2E_WORKER=1`, real worker | **7 of 7** (1.9 min) — sync 5 above |
| `wave9-content-photo-worker` (T4) and `wave9-notify-days`' mail case, real worker | **passed on both projects** — exif stripped on the stored bytes, the gallery updates with no reload, the notice arrives in Mailpit naming the day |
| the seven `wave9-*` specs, both projects | **green** — `wave9-content-days` 16 of 16, twice |
| ★ **e2e, the whole suite, both projects, no existing spec modified** | **544 passed, 9 failed** in the full run (4.3 min). Read one by one: **1** was `content`'s own new photo case (a locator on a freshly signed URL — spec-only, fixed `19cb0b2`, then 16 of 16 twice); **6** were load-class on the phone project and **pass alone** (70 passed; «An invalid response was received from the upstream server», 5 s timeouts, one `DEC-145` duplicate); `budgets` **passes alone** (TBT under load measures the machine); and **`bookmarks:237`** is wave 8's carried timing race on Next 16.3.5 — its code is untouched on this branch (`git diff origin/main` is empty for it) and it fails alone here as it did there. An earlier full run on the previous build failed a **different** ten on the **desktop** project, all green alone — which is what load looks like. ★ **The two failures that were real and one-day — the public card's «· حتى» clause, red on BOTH projects — were the lead's own nit; restored, and green** |

### The rows — per track, closed against a contract held and a capture opened

| # | Owner | Work | Serves | State |
|---|---|---|---|---|
| L1 | lead | the foundation, `0100` and `0101` | `REQ-SES-015`, `REQ-NFR-001`, invariants 3, 5, 6 | **closed** `7ed788f`, sync 1 |
| L2 | lead | contract 9 | `REQ-UIX-003`, `REQ-SES-015` | **closed** `8850b03` |
| L3 | lead | contract 10 | `REQ-TSK-002` | **closed** `d213552` |
| L4 | lead (custodian) | certificate eligibility reads contract 6 — `fan_out_certificates()`, `issue_certificate()`, `listEligibleRecipients()` — **and `attendance_certificate_sync()`, contract 5's third hook** | `REQ-SES-017`, `REQ-CRT-001`, `REQ-CHK-017` | **closed** `0022828` (`0108`, `DEC-153`) — eligibility has one definition in all three places; removing **day 1** revokes a certificate that names **day 3**; a member marked present after completion gets the issue job. **Re-issue after a revocation stays carried**, its cause now known |
| L5 | lead (custodian) | the attendance CSV's day column, present only when a session has more than one day | `REQ-ADM-017` | **closed** `a3e9872` — one-day file byte-identical (pinned by a test); from two days one line per member per day, contract 7's label, «أكمل الحضور» last (`DEC-157`) |
| L6 | lead (custodian) | a multi-day poster's date | `REQ-DSG-002` | **not this wave** (sync 1) — a new binding is a new library seed (`DEC-149` §3); the first day's date is true, if incomplete. Wave 10 |
| L7 | lead | promotion of every proposed file, with `db:reset`, RLS, `policy-diff`, `03` §8.2 | invariants 3, 5, 6 | **closed** — `0100`–`0122`, every `supabase/proposed/` folder empty; a clean reset from `0001` and the full RLS suite green on the final chain |
| L8 | lead | the three-day demonstrable, real worker | `REQ-SES-015` … `018` | **closed** — `tests/e2e/wave9-three-day-workshop.spec.ts`, `E2E_WORKER=1`; captures `wave9-demo-{1…8}-*.png`, opened by the lead (sync 5) |
| L9 | lead | the owner's order for `0100`+: what each adds, the windows between push and merge, the reads to run first | invariant 3 | **closed** `6ad2fc8` — below, with the caller audit and the data-shaped rehearsal |
| S1–S4 | `sessions` | contract 3 · the form (`REQ-SES-016`) · the event page, cards and public card showing days · the day label (contract 7) | `REQ-SES-015`, `016` **closed** — `0106`, `0112`, `0118`, `0122`; the form, the event page, the cards and the public card; closing note `18fcc5c` |
| C1–C4 | `checkin` | contract 4's RPCs · the host view and check-in screen by day · the attendance screen across days · `rotate_codes` by day and contract 5's call sites | `REQ-CHK-002`, `009`, `013`, `015`, `016` **closed** — `0104`, `0105`, `0120`; the three screens by day, ten captures beside their one-day twins; closing note `867726d` |
| T1–T4 | `content` | scope on the three write paths and the re-scope chip · the grouped lists · `phase` relative to the scope · one photo end to end on the real worker | `REQ-SES-018`, `REQ-MAT-006`, `REQ-EVT-010` **closed** — `0115`, `0116`; the grouped slots, the scope-relative phase, T4 on the real worker; closing note `7cbc576` |
| P1–P4 | `scoring` | contract 5's two functions · contract 6's predicate and the key · the award at completion · the missed day in the points history | `REQ-SES-017`, `REQ-PTS-012` **closed** — `0102`, `0107`, `0113`, `0114`, `0121`; the missed-day notice; four captures |
| N1–N3 | `notify` | the calendar per day (SQL, worker, ICS) · reminders per day · the reschedule notice naming the day | `REQ-SES-015`, `REQ-CAL-*`, `REQ-NTF-*` **closed** — `0109`, `0110`, `0111`, `0117`; the calendar, reminders and the day-change notice; closing note `3587e36` |

### ★ `0100`–`0122` — what the owner does, in order, and why the push precedes the merge (row L9)

**Production is at `0099`.** This wave adds twenty-three migrations, **all additive**: no table, column, policy
name, job name or idempotency key that `main` reads is removed, and every function `main` calls keeps the
argument list `main` sends — a changed function is dropped and re-created **in the same file** with its new
arguments trailing and defaulted (`0085`'s lesson: two overloads are an ambiguous PostgREST call).

| # | Author | What it adds |
|---|---|---|
| `0100` | lead | `ENT-session_days`, its three triggers (the one-day shim, the derivation, the deferred check at commit), ★ **the backfill — every session with a window becomes exactly one day**; `session_day_id` on the three check-in tables (backfilled, then `not null` on two) and nullable on `materials`, `session_tasks`, `photos`; `sessions.require_all_days` (default true). **Stops with a named exception** if a check-in or a code exists on a session with no window |
| `0101` | lead | `session_days.check_in_open` (backfilled from the session); `check_in_ceiling()`; `calendar_events.session_day_id` (backfilled) beside the old unique key |
| `0102` | `scoring` | contract 5's two hooks, `main`'s text verbatim |
| `0103` | lead | ★ **the security revoke** (`DEC-152`) — the same statement as «FOR THE OWNER, NOW» above; a no-op if that was already run |
| `0104`, `0105` | `checkin` | the session's switch as the shadow of its days; the eight check-in RPCs with a trailing `p_day` |
| `0106` | `sessions` | `schedule_session(…, p_days, p_require_all_days)` and `publish_session()` — `main`'s fourteen arguments still schedule one day |
| `0107` | `scoring` | `session_attendance_complete()`, `session_attendance()` — executable by no client role |
| `0108` | lead | certificates follow the predicate: the fan-out, `issue_certificate()`, `attendance_certificate_sync()`, `session_complete_attendees()` |
| `0109`, `0110` | `notify` | one calendar row per day — the old unique key leaves **in the same file** as `record_calendar_sync()`'s new body; `resync_calendars()`; reminders per day with every one-day key unchanged |
| `0111` + `0112` | `notify` + `sessions` | the day-change notice and its one call site |
| `0113`, `0114` | `scoring` | the attendance award at completion for a session of more than one day; `missed_attendance_days()` |
| `0115`, `0116` | `content` | the three re-scope RPCs, the photo's day from its upload instant, `materials.phase` relative to the scope in five policies |
| `0117`, `0119` | `notify`, lead | two grants narrowed (`session_day_place`, `session_venue_label`) |
| `0118` | `sessions` | `session_public_card()` gains `day_count` |
| `0120` | `checkin` | contract 5's call sites: the three check-in functions call the hooks and decide nothing about points or certificates |
| `0121` | `scoring` | `award_points()` with one branch added: the presenter's attendee bonus is decided in SQL, whichever worker calls |
| `0122` | `sessions` | `session_public_card()` gains `days` — two instants per day, nothing that identifies one — so the card's phase is right between days; dropped and re-created with both grants restated, `main` reads the row by key |

#### What the lead proved, so the owner's rehearsal confirms rather than discovers

**1 · The caller audit, mechanical.** Every `.rpc()` in `main`'s `src/` at `b7f2f3a` — **75 functions** — was parsed
with the argument names it sends and resolved against the catalogue at `0120` by PostgREST's own rule (the names
sent are a subset of the function's, and every name not sent has a default): **75 of 75 resolve.** All **55**
functions `main`'s worker names in SQL exist, and the four it calls whose signatures grew
(`rotate_check_in_code`, `record_calendar_sync`, `send_reminder_notification`, `record_photo_upload`) take
`main`'s argument count through trailing defaults. No return shape `main` reads is parsed strictly — every
`.strict()` in `main` is on a form's input — so `session_public_card()`'s new `day_count` is an ignored key.

**2 · ★ The data-shaped rehearsal — what a schema-only dump cannot show** (invariant 3). A bare `postgres:17`
with `scripts/ci/roles.sql`, the chain `0001`–`0099` and graphile-worker's schema; then `main`'s own full RLS
fixture (`seed()`, unchanged since `main`) **committed**, plus the shapes it lacks: a draft with no window, an
approved session with a start and no end, a cancelled one with a window, a published one **with its door closed
by hand and a custom venue**, an in-progress one with a live code, a failed attempt, a code check-in and an
**admin-removed** check-in, an archived one, a synced calendar row, and reminder jobs queued by `main`'s own
`schedule_session_reminders()`. 107 rows across 17 tables and the 30-job queue were snapshotted; **`0100`–`0120`
applied in order, each in one transaction, `ON_ERROR_STOP=1` — all twenty-one clean.** Then, row by row:

| Check | Result |
|---|---|
| every pre-existing column of every pre-existing row | **identical** — `sessions.updated_at` included, so the derivation trigger wrote no session; the 30 queued jobs identical in key, `run_at`, payload and revision |
| ★ the one expected delta | `calendar_events.updated_at` moves to the push instant on every row — `0101`'s backfill fires the table's `updated_at` trigger. **Nothing reads that column** (no reader in `src/`, `worker/` or any migration); `last_synced_at`, which the sync does read, is untouched |
| sessions with a window | 10 of 10 have **exactly one day**, equal to the stored window, venue and switch, at position 1; the 2 without a full window have none |
| check-ins, codes, attempts | 6, 3, 3 — each names the day **of its own session**; each check-in's stored window is its day's |
| calendar rows · content rows | 3 of 3 on their session's one day · none names a day (null = the whole session) |
| the closed door | carried to its day (`false`) — a session closed today never gets a day born open |
| `anon` on `_issue_check_in_code` | refused |
| ★ `main`'s call shapes **over backfilled rows** | `rotate_check_in_code(session)` names the backfilled day · a legacy write of the session's own window moves its day and passes the commit check · `record_calendar_sync()` with six arguments updates the backfilled row in place and adds none |

The container held fixtures only and is removed. (`0121` and `0122` were promoted after this run; each is one function with no data statement, applied over the local database with its suites green.)

#### ✅ The rehearsal on the owner's dump — 2026-09-17, by the lead

**The dump** (16,139 lines) was checked before use: **schema only, zero `COPY`/`INSERT`**, exactly at **`0099`**
— `0099`'s objects present, none of `0100`+'s — and it **shows the owner's security statement already applied**
(`_issue_check_in_code` ACL `{postgres=X/postgres}`). **Deleted once the rehearsal had run**, with its
vault-stripped copy and both containers.

| Step | Result |
|---|---|
| `postgres:17` + `scripts/ci/roles.sql` + the `supabase_realtime` publication + the dump minus its `supabase_vault` and `pg_stat_statements` lines | **0 errors** — 72 tables, 225 functions, 161 policies |
| `main`'s own RLS fixture **committed onto production's schema**, plus the shapes it lacks (the same set as the chain rehearsal above) | 107 rows across 17 tables, a 30-job queue |
| ★ **`0100`–`0122`, each in one transaction, `ON_ERROR_STOP=1`** | **23 of 23 clean** — after one environmental repair: a `public`-only dump carries **no `storage` or `realtime` policies**, so `0116`'s `drop policy "materials_storage_read" on storage.objects` found nothing to drop and rolled back whole. The thirteen were restored from the chain at `0099` (wave 8's step) and `0116` applied. **On production those policies exist — read (d) below confirms it before the push** |
| every pre-existing column of every pre-existing row, before against after | **identical** — 107 rows, the 30 jobs in key, `run_at`, payload and revision — except `calendar_events.updated_at` on its 3 rows (`0101`'s backfill; nothing reads the column) |
| the backfill's invariants | 10 of 10 sessions with a window have exactly one day equal to the stored window, venue, switch and position 1 · the 2 without have none · 6 check-ins, 3 codes, 3 attempts each on the day of their own session, each check-in's stored window its day's · 3 of 3 calendar rows on their day · no content row names a day · the closed door carried · the re-created `_issue_check_in_code(uuid, uuid)` refused to `anon` **and** `authenticated` · `session_days` RLS on, one policy |
| ★ **production + `0100`–`0122` against the chain `0001`–`0122`**, catalogue by catalogue — columns, function bodies by hash with ACL and settings, policies by hash, RLS flags, triggers, constraints, indexes, table grants, views, enums | **1,402 lines against 1,401: identical except `rls_auto_enable()`**, production's own platform event-trigger function, known since wave 7 |
| `check_ins_member_id_session_window_excl`, dropped and re-created by `0100` | textually identical to production's current definition, so rows that satisfy it today satisfy it after; the new unique index is `(session_day_id, member_id)`, equivalent to today's `(session_id, member_id)` while every session has one day |

★ **Which migration carries the backfill, and what it touches.** **`0100`** — it **inserts one `session_days`
row per session that has both a start and an end** (read b1), then **updates every `check_in_codes`,
`check_ins` and `check_in_attempts` row** to name that day (r1–r3), and stops with a named exception if a
check-in or a code has no day to take (a1, a2). **`0101`** carries the second, smaller half: it **updates
every `calendar_events` row** to name its day (r4 — and moves their `updated_at`), and sets a day's switch
closed where its session's is closed today (r5). **No other file of the twenty-three contains a data
statement** — `0102`–`0122` are functions, policies and grants. **No `sessions` row is written**: the
derivation trigger finds stored = derived and updates nothing (proven above: `sessions.updated_at` unchanged).
`points_ledger`, `audit_log`, `certificates`, `rsvps`, `notifications` and the job queue are untouched.

★ **The production reads — run by the owner 2026-09-17, every required value as expected.** (The lead's
session was refused `supabase db query --linked` twice and did not work around it; the statement is in step 3
of the owner's order below.)

| Read | Must be | Production |
|---|---|---|
| a1 · check-ins on a session with no full window | 0 | **0** |
| a2 · codes on a session with no full window | 0 | **0** |
| c · `anon` / `authenticated` / `service_role` may run `_issue_check_in_code` | false / false / false | **f / f / f** |
| d · the two `storage` policies `0116` replaces | 2 | **2** |
| e · latest migration applied | `0099` | **`0099`** |

**What the backfill touches on production: 11 rows.** `0100` **inserts 3** `session_days` rows (b1 — the
three sessions that have a start and an end; b2 — two sessions have no full window yet and get no day) and
**updates 8**: 4 `check_in_codes`, 2 `check_ins`, 2 `check_in_attempts` (r1–r3). `0101` **updates none**:
there is no `calendar_events` row (r4 = 0) and no session whose door is closed by hand (r5 = 0). ★ **The push
is clear to run.**

#### The two windows

**Push → merge: `main`'s app and `main`'s worker on `0120`.** Nothing a member sees changes except the two
SQL-side named differences above (2 and 3). ★ **No multi-day session can exist in this window** — only this
branch's form makes one. Unlike wave 8 there is no action that fails between the push and the merge, so they
need not be back to back; there is no reason to separate them either.

**Merge → the worker's redeploy: the new app and `main`'s OLD worker.** ★ **This is the window that matters, and
Railway's trigger has never fired on its own.** At one day the old worker is correct job by job (contract 2;
`notify`'s table W6 and each track's note). At more than one day it is not:

| Old worker's job | What it does to a multi-day session | Recoverable? |
|---|---|---|
| `evaluate_no_shows` | never calls `evaluate_session_attendance()` — **no attendance points at completion** | yes — idempotent; the repair statement is below |
| `award_presenter_points` | loops over **check-in rows**, not qualifying attendees — it would have paid three bonuses per attendee for three days, partial attendees included, onto an append-only ledger | ★ **closed in SQL by `0121`** (`DEC-157`): `award_points()` writes an `attendee_bonus` only for the attendee's epoch check-in and only when that attendee completed the session, so the old loop's extra calls are no-ops — proven with cases written **as the old worker's loop**; inert at one day, `award-presenter-points` and `award-points` unmodified and green |
| `calendar_upsert`, `calendar_delete` | one event spanning the whole session, on day 1's row | yes — `resync_calendars(<session>)` after the redeploy |
| `send_reminder` | ignores the job's day and words every reminder as day 1's | transient — wording only |
| `rotate_codes` | mints codes overnight between days; none is usable (`check_in()` gates on the day's window) | harmless |
| `process_photo` | scopes the photo by the job's clock, not the upload's | harmless — minutes |

#### The owner's order

1. ~~**Run the security statement**~~ — ✅ **run and verified by the owner 2026-09-17**: `anon`, `authenticated` and `service_role` all false; the dump shows it.
2. ~~**Rehearse `0100`–`0122` against a production schema dump**~~ — ✅ **done 2026-09-17 by the lead on the
   owner's dump**, recorded above; the dump is deleted.
3. ~~**The production reads first**~~ — ✅ **run by the owner 2026-09-17, all as expected; 11 rows touched**
   (recorded above). The statement, kept for the record:
   ```sql
   select * from (
   select 1 as n, 'a1 check_ins on a session with no full window — MUST BE 0 (0100 stops otherwise)' as "check", count(*)::text as value from public.check_ins c join public.sessions s on s.id = c.session_id where s.starts_at is null or s.ends_at is null
   union all select 2, 'a2 check_in_codes on a session with no full window — MUST BE 0', count(*)::text from public.check_in_codes c join public.sessions s on s.id = c.session_id where s.starts_at is null or s.ends_at is null
   union all select 3, 'b1 sessions that become exactly one day = rows 0100 INSERTS into session_days', count(*)::text from public.sessions where starts_at is not null and ends_at is not null
   union all select 4, 'b2 sessions that get no day (no full window yet)', count(*)::text from public.sessions where starts_at is null or ends_at is null
   union all select 5, 'c  anon / authenticated / service_role may run _issue_check_in_code — MUST BE false/false/false', concat_ws(' / ', has_function_privilege('anon', to_regprocedure('public._issue_check_in_code(uuid)')::oid, 'execute'), has_function_privilege('authenticated', to_regprocedure('public._issue_check_in_code(uuid)')::oid, 'execute'), has_function_privilege('service_role', to_regprocedure('public._issue_check_in_code(uuid)')::oid, 'execute'))
   union all select 6, 'd  storage policies 0116 drops and re-creates, present — MUST BE 2', count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('materials_storage_read', 'material_pages_storage_read')
   union all select 7, 'e  latest migration applied — MUST BE 0099', max(version) from supabase_migrations.schema_migrations
   union all select 8, 'r1 check_in_codes rows 0100 UPDATES (gains its day)', count(*)::text from public.check_in_codes
   union all select 9, 'r2 check_ins rows 0100 UPDATES', count(*)::text from public.check_ins
   union all select 10, 'r3 check_in_attempts rows 0100 UPDATES', count(*)::text from public.check_in_attempts a join public.sessions s on s.id = a.session_id where s.starts_at is not null and s.ends_at is not null
   union all select 11, 'r4 calendar_events rows 0101 UPDATES (and moves updated_at on)', count(*)::text from public.calendar_events ce join public.sessions s on s.id = ce.session_id where s.starts_at is not null and s.ends_at is not null
   union all select 12, 'r5 session_days rows 0101 UPDATES (a door closed by hand today)', count(*)::text from public.sessions where starts_at is not null and ends_at is not null and check_in_open = false
   ) t order by n;
   ```
4. **Outside a scheduled session** (Server Action IDs rotate on deploy): `supabase db push` (`0100`–`0122`) →
   **merge PR #26** → ★ **check the worker's deployed commit in Railway and reconnect the source if it has not
   moved** (the standing step below). ★★ **Nobody schedules a session of more than one day until the worker is
   on the merge commit.**
5. **Only if step 4's rule was broken** — a multi-day session existed while the old worker ran — the repair,
   scoped to that session (`DEC-023`: read first, never a migration). Both statements are idempotent:
   ```sql
   select s.id, s.title, s.state from public.sessions s
    where (select count(*) from public.session_days d where d.session_id = s.id) > 1;
   -- its calendar entries become one per day (the keys are the jobs' own, so nothing is queued twice)
   select public.resync_calendars('<that session id>');
   -- and, if it had already COMPLETED on the old worker: awards what is missing, nothing twice
   select public.evaluate_session_attendance('<that session id>');
   ```
   If the rule held, neither is needed: at one day per session the old worker's rows are already right.

### ★ The standing post-merge step — Railway (the owner's, every merge, until the dashboard is fixed)

**Railway's push trigger has never been armed.** Three merges in a row (PRs #23, #24, #25) deployed the app
on Vercel and left the worker on the previous commit until someone ran `railway service source connect` by
hand. **After every merge to `main`, the owner checks the worker's deployed commit in Railway and reconnects
the source if it has not moved.** For this wave it matters more than usual: between the merge and the
worker's redeploy, the **old worker runs on the new schema** — contract 2 keeps that correct, and the
owner's order (row L9) says what the old worker does not yet do. The fix is a dashboard setting
(Service → Settings → Source → the branch's deploy trigger); it is the owner's, and no session changes it.

### Two questions for the owner, asked once (`DEC-123`)

Both are in the canvas, neither reaches the app, and **neither is reproduced meanwhile**: the browse
tag-chip **counts at 1.96 : 1**, and a **13 px caption at 3.30 : 1**. Does the design want them as drawn —
which fails `SC 1.4.3` — or at the app's tokens, which pass? The app ships the passing tokens until told
otherwise.

### Carried — diagnosed, each with an owner

| Owner | Finding | From |
|---|---|---|
| ~~lead~~ | ~~`REQ-EVT-010` says a photo appears at once; the pipeline processes, then shows~~ — **not carried: reconciled in wave 7** (`DEC-139` amended the requirement; `0091` delivers the no-reload clause). The one honest gap — never driven end to end — is `content`'s row T4 | wave 6 |
| `designer` (wave 10) | ★ **re-issuing a certificate after a revocation** — a member removed and re-added keeps a revoked certificate and gets no new one. Cause known (`DEC-153`): `certificates` is unique per session, member and kind, and `issue_certificate()` returns the existing row **even when revoked**. The fix is a partial unique index and a second serial — and two rows per member on SCR-045 and `/app/me/certificates` | wave 7, sized in wave 9 |
| `content` (wave 10) | a **proposal's own material shows its row and never its version or pages**: `material_versions_read`, `material_pages_read` and the page-image bucket's policy `inner join sessions`, which a proposal's material has none of. Predates `DEC-121`; found by `content` and deliberately not fixed | wave 9 |
| ~~`notify`~~ | ~~`session_venue_label(uuid, text)` executable by `authenticated` with no caller check~~ — **closed** by `0119` (`DEC-156`): every caller is a definer function | wave 9 |
| lead (M13) | the «مطلوب» marker on the manual-mark form's three controls — dropped when they moved onto `ui/field`, because the marker joins the accessible name and the form's labels are asserted verbatim (`checkin`'s closing note) | wave 9 |
| `console` (M13) | the attendance table scrolls sideways **inside its container** at 390 px from two days up, as the one-day table's last column already did; a stacked phone layout is the fix | wave 9 |
| lead | `DayWindow.id` / `position` could be optional — the public card's windows carry no identifier by design (`0122`) and `getPublicSessionCard()` assigns placeholder ids in one commented mapping | wave 9 |
| owner | **`bookmarks:237` «never updates» on Next 16.3.5** — a removed bookmark stays listed until a reload; a timing race, not load; the trace is wave 8's | wave 8 |
| owner | break-glass opens no org screen (`DEC-055` C; option A is the owner's to schedule) | wave 8 |
| owner · `notify`/wave 10 | `REQ-NTF-007`'s admin-editable required fields; `REQ-NTF-008`'s bounce webhook never written | wave 8 |
| `scoring` | recognition edits write no audit or history row — **this wave or not, stated in its plan** | wave 8 |
| `designer` (lead as custodian) | a member re-added after a removal gets no new attendance certificate (`fan_out_certificates()` fires only into `completed`) — **touches row L4; decided there** | wave 7 |
| lead (custodian) | the photo tile's takedown label wraps; a save pressed before hydration on `/app/me`; the filter sheet's native date mask; `ratings.edited_at` at millisecond precision | waves 6–7 |
| M13 | `controlClass`'s `w-full` beats a caller's `w-*`; `DEC-145`'s orphaned streaming segment; CSP report-only; status-colour contrast enforcement; `DEC-126`'s «تسجيل الدخول» and `chapter.tsx`'s eleven glyphs | waves 6–8 |

### Order inside the wave

1. **Step 0** — done. Push; the draft PR opens at the first push.
2. **Spawn** `sessions`, `checkin`, `content`, `scoring`, `notify`, each **planning-only**: a plan in
   `docs/plan/notes/<name>.md` against the contracts it owns and consumes, the `n = 1` proof it will give,
   the columns it needs from the lead, and nothing else edited until the lead approves.
3. **The lead builds the foundation while they plan** — `0100`, contracts 9 and 10 — and runs every existing
   suite on it alone.
4. **Sync 1** — five plans read in full and answered; the open points ruled (a day's ceiling against the next
   day's start; which reminder offsets repeat; the award key across remove → re-add; row L6); `0100`
   promoted; `calendar_events`' columns landed from `notify`'s plan.
5. **The order the seams force**: contract 3 (`sessions`) and contract 5's two functions (`scoring`) first;
   then contract 4 (`checkin`) and contract 6; then the screens; contract 7's slots and contract 8 alongside.
6. At each sync (`TEAM.md` §3) the lead promotes SQL, builds **committed HEAD** in the verification worktree,
   runs e2e there with `E2E_SHOTS_DIR` set to the main checkout's `.qa-shots/rtl`, opens every capture, reads
   the ledger's `git diff`, and moves contract states here.
7. Freeze; the demonstrable on the real worker; the full gate set on the final commits; ★ **the migration
   order for the owner written here before the PR is marked ready** (row L9) — rehearse against a production
   schema dump, push, merge, **then check Railway by hand**. The owner merges. **Do not start wave 10.**

---

## ★★ WAVE 8 — COMPLETE and MERGED (PR #25, `b7f2f3a`; `0092`–`0099` pushed) — the last nineteen routes onto the M9 system, gradient posters and the certificate library (`DEC-147`)

**The owner's goal, in substance** (`docs/plan/notes/wave-8-lead.md`): **finish the redesign's route coverage**
— nineteen routes, and the whole app is on the M9 system — and build `DEC-127` (the gradient poster background,
the `canvasRaise` token) and `DEC-128` (the certificate library) in the files they live in, so no screen is
rebuilt twice. **Multi-day sessions are wave 9's whole subject. Do not start wave 9.**

**The measure** (`DEC-147`, as `DEC-137`'s). A row closes only when **(1)** `node scripts/ui-reach.mjs --wave8`
shows the page reaching an **M9** primitive (strict), **and (2)** a 390 px RTL capture exists **at the path the
row cites** — `.qa-shots/rtl/wave8-<track>-<route>-<state>.png` in the **main checkout**, phone project,
`390 × 844` — from a production build the row names by commit, **opened by the lead**, with the spec that
regenerates it named in the row. `.qa-shots/` is gitignored: the row text is the only artefact anyone
downstream can trust.

**Baseline at Step 0 (`e7d0657`):** `--wave8` **2/20 strict** (8/20 loose) — the schedule reaches `ui/date-time`
and scoring reaches `ui/combobox` through the member picker; neither is on the system. By group: `(auth)` 3/3 ·
`/app` 1/1 · `app/sessions` 6/6 · `app/me` 7/7 · `app/admin` 14/24 · `app/platform` 0/7. ★ **Outside those
groups and outside the brief's nineteen**, `verify/[code]` and `legal/{privacy,terms}` do not reach the system
either; they are named here so «the whole app» is not over-claimed, and they are not this wave.

### Before anyone spawns — task one and Step 0

| | What | Commit | Evidence |
|---|---|---|---|
| ✅ | **Task one — `DEC-146`**: `next` 16.2.10 → 16.3.5; the patch, `react-dom-ping-patch.test.ts`, `patch-package` and `postinstall` out together; the lock through Docker | `e7d0657` | the probe below; the gates in `DEC-147` |
| ✅ | **Step 0**: the wave-8 map in `CLAUDE.md`; all ten `.claude/agents/*.md` regenerated (`designer`, `platform`, `branding` four waves stale); this checklist; `DEC-147`; `scripts/ui-reach.mjs --wave8` | `e3df1d3` | — |

**The reserve probe** (`tests/e2e/reserve-probe.spec.ts`, phone, 16 fresh sessions, production builds, back to back):

| Build | Result |
|---|---|
| 16.3.5 as shipped, run 1 | **16/16** — 105–211 ms (load average 32: the build had just finished) |
| 16.3.5 **with React's fix undone** in the vendored `react-dom` (the control, `$scratchpad/wt-verify`) | `104 STUCK 107 STUCK STUCK 105 105 STUCK 108 105 STUCK 106 106 109 STUCK STUCK` — **7 of 16 hung** |
| 16.3.5 as shipped, run 2 | **16/16** — 105–108 ms |

**Gates on task one's tree (`e7d0657`):** `tsc` clean (app, worker) · lint **0 errors** (`✖ 24 problems (0 errors,
24 warnings)`) · vitest **145 files, 1440/1440** · build green · `qa` **44 passed, 0 failed** · `visual`
`wave-6-final → wave-8-task-one` **0.000 % on all eight pairs** · `db:reset` clean + RLS **72 files, 791 passed, 4
todo** · `parity` **21 of 28 pass** (path 4 skips loudly without `cwebp`; CI runs 28 in the image) · e2e **426
passed, 7 failed, 11 did not run** — every failure green alone or explained in `DEC-147`, including an interleaved
`budgets` A/B against 16.2.10 that found **no LCP regression and 13 KB less JS** on 16.3.5.

### The checklist — every route named

| # | Owner | Route / work | Serves | (1) `--wave8` | (2) capture — path · spec · build | State |
|---|---|---|---|---|---|---|
| L1 | lead | **task one** — Next 16.3.5, the patch retired | `DEC-146` | — | the probe above | **closed** `e7d0657` |
| L2 | lead | ★ `/app/admin/sessions/[id]/schedule` — «more user friendly … intuitive to fill and quick» | SCR-043 · `REQ-SES-001`, `002`, `009`, `016`, `REQ-PRO-009`, `REQ-CHK-010`, `REQ-DSG-002`, `REQ-UIX-009`, `010` | ✓ (`ui/field`, `ui/date-time`, `ui/select`, `ui/switch`, `ui/radio-group`, `ui/page-header`, `ui/panel`) | `wave8-lead-schedule-from-proposal.png` · `-field-error.png` · `-ready.png` · `-published-edit.png` · `wave8-lead-schedule.spec.ts` · `d18cc9a`, regenerated at `bb3e290` after `dcd5f05` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead: the duration «45» from the proposal with «من المقترح: 45 دقيقة»; the content panel below the form with «من يُعدّ تقارير دورية»; «لا يمكن النشر بعد — ينقص: …» on one line and «انشر الجلسة» disabled; the end as «تنتهي الجلسة 7:00 م»; an explicit end at 17:00 refused at once with «نهاية الجلسة بعد بدايتها.»; «القاعة الكبرى · 40 مقعدًا» and the capacity following at 40; «قبل البدء بيوم» with «يُغلق الإلغاء الجمعة، 9 أكتوبر 2026 في 6:00 م»; after one press «التسجيل مفتوح» and «احفظ التعديلات» with the edited note; the stored row `published`, 60 minutes, capacity 40, walk-ins off. **Found by looking and fixed before closing:** two four-row radio lists made the phone form ~270 CSS px longer (`d18cc9a`). Full-page captures paint the sticky action bar, the header and the skip link mid-page — the known artefact. `sessions-screens` and `checkin-schedule-walk-ins` (custodian) green on the same build. ★ **Sync 2:** React resets a `<form action>` after every submission, and this form's six controlled selects, radios and switch fell back to their mount values on screen and in the next post — a second «احفظ التعديلات» would have undone the first; repaired in the primitives (`dcd5f05`), the spec now reads the venue and the cancel deadline after the publish, and `published-edit` was reopened at `bb3e290` |
| L3 | lead | ★ `org_domains`' check converged across environments — a migration, **rehearsed against a production schema dump** | invariant 3, `REQ-TEN-*`, `DEC-147` | — | — | **closed** — promoted `e5d5b56` as `0092`; ★ **rehearsed 2026-09-17** on the owner's production dump with `0093`–`0099`: clean, and the catalog comparison no longer shows wave 7's drift — production and the chain now hold one case-sensitive check |
| L4 | lead | the worker's startup line says «polling every 60 s»; it is 15 s (`DEC-057`) | `REQ-NFR-016` | — | — | **closed** `41f8807` — one constant feeds the setting and the line |
| L5 | lead | `REQ-EVT-010` reconciled with the pipeline | `DEC-139` | — | — | **closed** — already amended in wave 7 (`01-prd.md`, «Photos publish without moderation, the moment their metadata is stripped»); `0091` carries the no-reload clause |
| L6 | lead | ★ **the parity goldens move** — every before and after reviewed by eye, then committed | `REQ-DSG-015`, `DEC-127` | — | the harness's diff images | **closed** `c7fffb1` — the only golden that moved is a NEW one, `goldens/backgrounds/gradient-rtl.png`, reviewed by eye and by pixel by the lead (top-left #111a2c, bottom-right #1d2a42); every existing golden unchanged since `150a166`; `npm run parity` 21 of 28 locally (cwebp absent, as before) · background block 3 of 3 |
| L7 | lead | promotion — `designer`'s roster seed, `branding`'s brand-kit columns, anything proposed — with `db:reset`, RLS, `policy-diff`, the `03` §8.2 rows | invariants 3, 5, 6 | — | — | **closed** — `0093` `e5d5b56`; `0094`, `0095` `7daff7f`; `0096`, `0097` `58ce261`; `0098`, `0099` `fa93a98` — every promotion's live definitions diffed before and after; the sweep lists `session_certificate_designs` among the staff-read tables; final `db:reset` + RLS **79 files, 833 passed**; `policy-diff` agrees; trace no gaps; `supabase/proposed/` empty |
| D1 | `designer` | `/app/admin/designer/[documentId]` — mobile view and approve | SCR-057 · `REQ-DSG-005`, `010`, `022`, `DEC-093`, `DEC-096` | ✓ | `wave8-designer-editor-{review,readonly,rendering,failed,desktop}.png` · `wave8-designer-posters-{picker-live,detach-confirm,upload-rejected,picker-stale,studio-live-gate}.png` · `wave8-designer-{editor,posters}.spec.ts` · `fcc91cf` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead at `fcc91cf`: the phone review (fields in Arabic, «590 بكسل»), read-only, rendering, a failed export saying why in Arabic with the worker's text beneath, the 1440 editor; `08d94ad`. ★ Found on the way: **`detach_poster()` had no caller** — a live poster's edit was saved live and regenerated away; a save to a live poster is refused and the detach is a confirm naming the session (`134c563`, `REQ-DSG-003`). With the real worker (`E2E_WORKER=1`) green at `5bf0327` |
| D2 | `designer` | `/app/admin/templates/posters` | SCR-055 · `REQ-ADM-013`, `REQ-DSG-004`, `007`, `008`, `024`, `026` | ✓ | `wave8-designer-templates-{posters-populated,posters-duplicate-dialog,posters-empty-org,posters-moderator}.png` · `wave8-designer-templates.spec.ts` · `fcc91cf` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead at `fcc91cf`: the platform and org libraries as a card grid drawn by the renderer, the posters on the gradient, media contained on a phone and marked rendered before capture, «الافتراضي» in the card body; the copy dialog; the empty org; the moderator offered no write |
| D3 | `designer` | `/app/admin/templates/certificates` | SCR-056 · same | ✓ | `wave8-designer-templates-{certificates-populated,certificates-dark}.png` · `wave8-designer-templates.spec.ts` · `fcc91cf` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead at `fcc91cf`: six platform certificate rows in both orientations, the light/dark preview choice, every card rendered in the dark capture |
| D4 | `designer` | `/app/admin/sessions/[id]/certificates` — review, release, revoke, **and the template chosen at issue time** | SCR-045 · `REQ-CRT-004`, `011`, `DEC-128` | ✓ | `wave8-designer-certificates-{held,release-confirm,design-landscape,design-portrait,revoked,revoke-dialog,design-locked,mode-off,moderator}.png` · `wave8-designer-certificates.spec.ts`, `certificates.spec.ts` · `fcc91cf` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead at `fcc91cf`: «الإصدار» first once certificates exist, each kind's design folded to what it was issued with; release and revoke confirms name their object; the locked design; mode off; the moderator's lists without controls. Found by the spec: the eligible list was empty (an ambiguous `check_ins → members` embed swallowed by the DAL) |
| D5 | `designer` | ★ **`DEC-128`** — the certificate library and the completed poster roster, seeded by a new migration; **the roster counted in CI** | `REQ-DSG-026`, `DEC-125`, `DEC-128` | — | — | **closed** — library `7a84b94`/`195ec2f`, promoted as `0098` `fa93a98`; the roster counted in CI by `templates-roster.test.ts` (11 rows, 22 variants, idempotent) and the drift test (27 cases). ★ `0098` is a migration now: a later library change is a new seed, never a regenerate (`DEC-149` §3) |
| D6 | `designer` | the scheme passed at every call site; gradient parity cases **in both directions** | `REQ-DSG-014`, `015`, `DEC-125`, `DEC-127` | — | — | **closed** `a19bffd` — the parity background block, reported apart from the 28: **gradient-rtl** (the declared 140deg, the palette's colours, the first stop at its start corner, 0.000% vs the golden — blocking on darwin-arm64 only, `DEC-028`), **gradient-ltr** (220deg, and the LTR page is pixel-identical to the RTL page mirrored — blocking everywhere; unmirrored they differ 71.7%), **ink-on-dark** (a blank dark page 0.000% ink, one line 1.634%; the pre-wave-8 rule called the blank page 100% inked). The scheme is passed at every call site (posters `'dark'`, certificates the pinned one). ★ Headless Chrome paints a clip or element screenshot of a gradient page flat `rgb(18,18,18)`; a viewport capture is correct, and the worker already captures the viewport |
| K1 | `console` | `/app/admin/audit` | SCR-062 · `REQ-ADM-018` | ✓ | `wave8-console-audit-{filters-sheet,filtered-admin,filtered-moderator}.png` · `admin-audit.spec.ts` · `5a8f5bc` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead: filters sheet, filtered admin, filtered moderator (only the moderator's own actions); the raw action key dropped from every card (`9bc3673`); a date range is the org's own day (`266b0d1`) |
| K2 | `console` | `/app/admin/exports` | SCR-061 · `REQ-ADM-017`, `REQ-INT-006` | ✓ | `wave8-console-exports-audit-note.png` · `admin-exports.spec.ts` · `5a8f5bc` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead: the description in plain Arabic (`deafa87`), card labels on one line (`9bc3673`), who took each file last; CSV dates `YYYY-MM-DD HH:mm` with the zone in the header, enums in Arabic (REQ-ADM-017) |
| K3 | `console` | `/app/admin/reminders` | SCR-060 · `REQ-NTF-*` | ✓ | `wave8-console-reminders-{field-error,saved}.png` · `wave8-console-reminders.spec.ts` · `52005ba` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead: each refused offset said at its own row and in the summary, the units kept; the saved schedule with its toast (`49798f0`); a number beside its unit on one row (`2d9302d`, after `controlClass`'s `w-full` was found to beat any caller width — carried to M13, `DEC-149`) |
| K4 | `console` | `/app/admin/recognition` — with the held achievement certificates | SCR-054 · `REQ-REC-*`, `REQ-CRT-012` | ✓ | `wave8-console-recognition-{held,release-confirm,award-already-held}.png` · `wave8-console-recognition.spec.ts` · `5a8f5bc` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead: held achievements first, the release confirmed with a count and its result (R-D1, `246cfbf`); the refused award keeps «حاضر دائم» selected and names the badge at the field and in the summary. ★ The badge reset was React's form reset on every controlled select, switch, radio and checkbox — repaired in the four primitives by the lead (`dcd5f05`), which the schedule form needed too |
| K5 | `console` | `/app/admin/scoring` — the fixed catalogue and the company rules | SCR-053 · `REQ-PTS-004` … `010`, `REQ-ADM-011` | ✓ (incidental: `ui/combobox`) | `wave8-console-scoring-{catalogue,penalties,rule-dialog-error,member-picker-open}.png` · `wave8-console-scoring.spec.ts` · `79d22c0` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead: three fixed groups, deductions closed at 0 with the member-facing caption only where it differs (`344a921`, `2cc8471`), a rule refused inside its dialog, and the member picker's list clear of the tab bar (`79d22c0` — every `ui/combobox` scrolls its open list into view; `html`'s `scroll-padding-block-end` already clears the bar) |
| K6 | `console` | `/app/admin/emails` — around what it does today, **not** the email studio | SCR-058 · `REQ-ADM-014`, `REQ-NTF-007`, `008` | ✓ | `wave8-console-emails-{catalogue,refused-save,delivery-failure}.png` · `wave8-console-emails.spec.ts` · `52005ba` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead: the catalogue with its matrix and the failure banner, the refused save said at the body naming «title», the delivery log's reason in words with the provider's text beneath; the plan's `MSG-*` ids and the member-inbox reminder names gone from the admin screen (`8d3a5a0`, `2d9302d`). Carried: `REQ-NTF-007`'s required fields and `REQ-NTF-008`'s bounce webhook (`notify`/M12) |
| P0 | `platform` | the console's layout and navigation, with `ImpersonationBanner` | SCR-080 … 085 · `REQ-ADM-001`, `REQ-UIX-017` | ✓ | `wave8-platform-*.png` (13) · `platform-console.spec.ts` · `381a05f` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead; `platform-console.spec` 30/30 minus SCR-083's roster case (waits on the seed). Sync-2 findings fixed at `d82c7a1` and re-opened: the console stopped promising that break-glass opens an org (`DEC-055` C — home, SCR-085, the banner; the lead's `/no-access` body the same, `1f1ced9`), the banner's stop control under the text on a phone, a pending-deletion card says «لا إجراء — الحذف قيد التنفيذ.», the delete dialog's slug on its own line — the menu switcher open, the banner under the header on `/no-access` |
| P1 | `platform` | `/app/platform` | `REQ-ADM-001` | ✓ | `wave8-platform-*.png` (13) · `platform-console.spec.ts` · `381a05f` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead; `platform-console.spec` 30/30 minus SCR-083's roster case (waits on the seed). Sync-2 findings fixed at `d82c7a1` and re-opened: the console stopped promising that break-glass opens an org (`DEC-055` C — home, SCR-085, the banner; the lead's `/no-access` body the same, `1f1ced9`), the banner's stop control under the text on a phone, a pending-deletion card says «لا إجراء — الحذف قيد التنفيذ.», the delete dialog's slug on its own line — «لوحة المنصة», the attention card, the totals |
| P2 | `platform` | `/app/platform/orgs` — create, suspend, the first admin | SCR-080 · `REQ-ADM-001`, `REQ-TEN-*` | ✓ | `wave8-platform-*.png` (13) · `platform-console.spec.ts` · `381a05f` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead; `platform-console.spec` 30/30 minus SCR-083's roster case (waits on the seed). Sync-2 findings fixed at `d82c7a1` and re-opened: the console stopped promising that break-glass opens an org (`DEC-055` C — home, SCR-085, the banner; the lead's `/no-access` body the same, `1f1ced9`), the banner's stop control under the text on a phone, a pending-deletion card says «لا إجراء — الحذف قيد التنفيذ.», the delete dialog's slug on its own line — cards, suspend-confirm (the grip on the RTL side), delete-mismatch |
| P3 | `platform` | `/app/platform/orgs/new` | SCR-081 | ✓ | `wave8-platform-*.png` (13) · `platform-console.spec.ts` · `381a05f` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead; `platform-console.spec` 30/30 minus SCR-083's roster case (waits on the seed). Sync-2 findings fixed at `d82c7a1` and re-opened: the console stopped promising that break-glass opens an org (`DEC-055` C — home, SCR-085, the banner; the lead's `/no-access` body the same, `1f1ced9`), the banner's stop control under the text on a phone, a pending-deletion card says «لا إجراء — الحذف قيد التنفيذ.», the delete dialog's slug on its own line — the summary with four field errors, what was typed kept |
| P4 | `platform` | `/app/platform/orgs/[id]/domains` — contract 4 | SCR-082 · `REQ-TEN-*` | ✓ | `wave8-platform-*.png` (13) · `platform-console.spec.ts` · `381a05f` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead; `platform-console.spec` 30/30 minus SCR-083's roster case (waits on the seed). Sync-2 findings fixed at `d82c7a1` and re-opened: the console stopped promising that break-glass opens an org (`DEC-055` C — home, SCR-085, the banner; the lead's `/no-access` body the same, `1f1ced9`), the banner's stop control under the text on a phone, a pending-deletion card says «لا إجراء — الحذف قيد التنفيذ.», the delete dialog's slug on its own line — a mixed-case domain listed lowercased, the toast isolating it |
| P5 | `platform` | `/app/platform/templates` — the platform library, with `DEC-128`'s roster | SCR-083 · `REQ-DSG-008`, `026` | ✓ | `wave8-platform-templates-baseline.png` · `platform-console.spec.ts` · `fa93a98` (verification worktree) | **closed** — opened by the lead at `fa93a98` after `0098`: `platform-console.spec` in full, the roster case green on both projects; 5 posters, the certificates as «أفقية»/«عمودية» rows, one default per family |
| P6 | `platform` | `/app/platform/metrics` — aggregate only | SCR-084 · `REQ-ADM-003` | ✓ | `wave8-platform-*.png` (13) · `platform-console.spec.ts` · `381a05f` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead; `platform-console.spec` 30/30 minus SCR-083's roster case (waits on the seed). Sync-2 findings fixed at `d82c7a1` and re-opened: the console stopped promising that break-glass opens an org (`DEC-055` C — home, SCR-085, the banner; the lead's `/no-access` body the same, `1f1ced9`), the banner's stop control under the text on a phone, a pending-deletion card says «لا إجراء — الحذف قيد التنفيذ.», the delete dialog's slug on its own line — eight alerts and job health as cards |
| P7 | `platform` | `/app/platform/impersonate` — and the banner on an org screen | SCR-085 · `REQ-ADM-002`, `019`, `DEC-014` | ✓ | `wave8-platform-*.png` (13) · `platform-console.spec.ts` · `381a05f` (verification worktree, `E2E_SHOTS_DIR` → main checkout) | **closed** — opened by the lead; `platform-console.spec` 30/30 minus SCR-083's roster case (waits on the seed). Sync-2 findings fixed at `d82c7a1` and re-opened: the console stopped promising that break-glass opens an org (`DEC-055` C — home, SCR-085, the banner; the lead's `/no-access` body the same, `1f1ced9`), the banner's stop control under the text on a phone, a pending-deletion card says «لا إجراء — الحذف قيد التنفيذ.», the delete dialog's slug on its own line — empty, active (stacked on a phone), the banner on an org route, expired |
| B0 | `branding` | ★ **contract 1, as types** — the `background` union and `canvasRaise` | `DEC-127` | — | — | **closed** `391150e`, with `6b3ac7f` (`getBrandKit()` fills a missing token — without it every `/app` page would have failed once the runtime rebuilt, `DEC-148` finding 4) |
| B1 | `branding` | ★ the gradient rendered and collected — **both silent traps red first** — and the LTR mirror `360 − angle` in the renderer | `REQ-DSG-021`, `DEC-127` | — | — | **closed** `6879ab5`, `0d76a17`, `4b1e1e7` (`backgroundCss()` exported, `at` a fraction) — proven in pixels by `designer`'s D6 block: the LTR page identical to the RTL page mirrored, locally and in the Linux image |
| B2 | `branding` | `canvasRaise` in the brand kit — columns, `brand_kit()`, `save_brand_kit()`, `getBrandKit()`, the schema | `REQ-DSG-021`, `REQ-ADM-015` | — | — | **closed** `f30944e`, promoted as `0093` at `e5d5b56` |
| B3 | `branding` | `/app/admin/branding` — the preview carries a gradient surface | SCR-059 · `REQ-ADM-015`, `REQ-DSG-019`, `021` | ✓ | `wave8-branding-defaults.png` · `-override-saved.png` · `-field-error.png` · `-reset-confirm.png` · `wave8-branding-review.spec.ts` · `381a05f` (at `f00a253`) | **closed** — opened by the lead: the gradient swatch on the dark palette whatever tab is open (`4bbfffd`), the light `canvasRaise` hint honest, «#rrggbb» and the logo's format names isolated (`f00a253`, after the lead widened `FieldProps.error` and `FileDropProps.requirements` to nodes, `886260a`), the reset dialog naming «مؤسسة الهوية الثانية». `branding.spec` green on the same build |

★ Every capture path above is the **prefix** the row will cite in full; a row closes on the exact file names, the
spec and the build.

### Sync 1 — 2026-09-17 — four plans approved, contract 3 ruled (`DEC-148`)

All four planned before building: `branding` `574f556`, `designer` `85deba7`, `console` `61cecd4`, `platform`
`943f0d2`. Each was read in full and answered with rulings; the record is `DEC-148`. **What the plans found
that the brief did not know:**

- ★ **A dark poster voids the blank-capture guard** — every pixel of `#111a2c → #1d2a42` counts as ink, so a
  poster whose text never painted would ship (`designer`; ink now measured against the page's own background,
  before any `'dark'` call site).
- ★ **`getBrandKit()` would have taken down every `/app` page** the moment the runtime rebuilt with
  `canvasRaise` — the layout reads the kit for every member (`branding`'s contract 1 plus the lead; `6b3ac7f`).
- ★ **A break-glass stop from SCR-085's own page left org access on the token for up to 900 s**, and a start may
  never have refreshed it (`platform`'s F1/F2 — fixed in the submit path, proven on the decoded token).
- ★ **Four admin lists had no row actions on a phone** — `members`, `venues`, `categories`, `companies` — live in
  production since waves 6 and 7 (`console`'s F1, fixed `6df9dfb`).
- **The portrait certificate `derive()`d from the landscape master is not a composition** — a 157 mm empty
  band on every portrait certificate issued so far; contract 3 makes it a row.
- `validate.ts` refused a gradient; `0055`'s guard never walked gradient stops; `set_first_admin()` refused a
  mixed-case address; the «أكثر …» cards were never actually fixed in wave 7; `/app/platform` was a bare redirect
  no `ui-reach` could count; «من حضر وقيّم» in `Certificate.dc.html` would disclose who rated.

**Contract changes the lead made:** `CardMediaProps.aspect` gains `297/210`/`210/297` and `children`;
`DateTimeProps.label` (`df01876`). **The lead's requests landed by `console`:** the picker's `onValueChange`,
controlled value and `Field` wiring (`18672c8`), `admin.schedule` deleted (`1554d75`). **`platform`'s F6 in the
lead's file:** `/no-access` offers a platform admin «لوحة المنصة» (`b8d511d`).

**Carried for the owner, from sync 1:** ★ **a live `REQ-NTF-007` weakness** — an email template's required
fields are admin-editable, so a template can be saved without `{{title}}` (`console`; `notify`/M12's email
studio); **`REQ-NTF-008`'s bounce and delivery states are never written** — no webhook route exists (`notify`);
after deploy, **a scoped `regenerate_poster` enqueue for live posters of upcoming sessions** (a data fix,
`DEC-023`), which `designer` hands over with its seed.

**Carried for the owner, from sync 2:** ★ **break-glass opens nothing** — `DEC-055` option C is still what is built: an
impersonation session carries no member id, so every org route lands on `/no-access`. The session is created,
time-limited, recorded in the org's own audit log and expires — but it shows the operator none of the org. Sync 2
made every sentence in the console say so (`1f1ced9`, `d82c7a1`); **option A (a browsable, read-only
`impersonating` state in `session.ts`) is unscheduled and is the owner's to schedule** — it is not wave 8's.

### L2 — the lead's plan for SCR-043, written before any code

**What «more user friendly … intuitive to fill and quick» means here**, read against what exists:
`REQ-SES-016` already states it for the one-day session every org schedules today — *the end follows the
duration; validation at the field, on blur; filled without scrolling back to check* — and `REQ-PRO-009`
says the proposal's `expected_duration_minutes` pre-fills the duration. `Schedule.dc.html` draws the
screen as settings beside a read-only «المحتوى — كما كتبه المُقترِح» panel, with «انشر الجلسة» and
«احفظ فقط» together at the end.

**In:**
1. **One form, grouped** — متى · أين · الحضور · الشهادة واللغة — on `ui/field` and its family,
   `ui/radio-group` for the certificate mode and the room's language (three and two choices read faster
   than a closed select), `ui/switch` for walk-ins, `FormSummary`, `form-state.ts` so a failed round trip
   hands back what was typed.
2. **Defaults that remove typing:** the duration pre-fills from the proposal when the session has none,
   marked «من المقترح»; **the end is computed from start + duration and shown as a sentence**, and
   «عدّل وقت الانتهاء» reveals the picker — **an explicit end wins and stops following** (`OQ-001`); the
   capacity pre-fills from the chosen venue's capacity while the field is still empty; the two deadlines
   offer presets relative to the start (at the start · a day before · …) with «تاريخ آخر» for the picker.
3. **Validation at the field on blur**: an end before the start, a deadline after the start — the
   rules `REQ-SES-002` already enforces as constraints, said before the database says them.
4. **One press to publish**: «انشر الجلسة» saves and publishes in one action, disabled while anything
   `REQ-SES-001` requires is missing — **naming what is missing** — with «احفظ فقط» beside it and the
   note «النشر يُرسل إشعارًا لكل الأعضاء ويفتح الحجز.»; on a published session the primary is «احفظ
   التعديلات» with `REQ-SES-009`'s warning that attendees are told what changed.
5. **The proposal's content, read-only, beside the form** (desktop) and below it (phone): title,
   proposer, when it was accepted, level, language, target audience, expected duration — read from
   `proposals` through `sessions.ts` as custodian, **no migration**. The poster section keeps
   `designer`'s `PosterPicker` slot.
6. **Phone: one scroll, not a stepper.** `SCR-043`'s mobile note asks for «a stepper, one section per
   step»; four steps are four more presses on the form an admin fills most, against the owner's
   «quick». The groups carry headers, and the actions sit in a sticky bar in reach. **Recorded as a
   decision at sync 1**, because `09`'s note says otherwise.

**Not in, and why:** `DEC-075`'s audited **content edit** («تعديل المحتوى» — an audit row per field and a
notification to the proposer) and copying `target_audience`/`expected_duration_minutes` onto
`sessions` (`REQ-PRO-009`) — a migration, SQL and a notification each, and nothing in «quick to fill»
needs them; **the survey** row the artboard draws (not this wave); **multi-day** (`REQ-SES-015`, wave 9).

**Requests this makes:** `console` — `DateTimeProps` gains an accessible `label` (the lead adds the
field to `ui/index.ts`, `console` wires it in `date-time.tsx`), because four date fields named alike are
indistinguishable to a screen reader; until then the form keeps `RtlDateTimePicker` with its labels.
`console` — delete `admin.schedule.*` once `schedule.json` lands.

**Captures:** `wave8-lead-schedule-{from-proposal,end-edited,field-error,ready,published-edit}.png`, from
a new `tests/e2e/wave8-lead-schedule.spec.ts`; `checkin-schedule-walk-ins.spec.ts` and
`sessions-screens.spec.ts`'s schedule cases stay green (custodian).

### The final gates — 2026-09-17 — `5bf0327` (app), `04fa967` (spec)

Run on committed HEAD by the lead; builds, e2e, `qa` and `visual` in the verification worktree
(`$scratchpad/wt-verify`), captures into the main checkout.

| Gate | Result |
|---|---|
| `db:reset` + `test:rls` | clean · **79 files, 833 passed, 4 todo** |
| `policy-diff` · `trace` | agree · **313 requirements · 73 entities · 147 stories · no gaps** |
| `tsc` · `lint` · `npm test` | clean · **0 errors** (24 warnings, none new in kind) · **183 files, 1707 passed** |
| `ui-reach --wave8` · `ui-lint` · `fonts:check` | **20/20 strict** (from 2/20 at Step 0) · passes, 69 held (allowlist pruned 229 → 81 at `6de7eb2`) · OK, 21 faces |
| `npm run build` | green |
| `npm run qa` | **44 passed, 0 failed** |
| `npm run visual` `wave-8-task-one → wave-8-final` | **0.000% on all six frozen pairs**; the `(dev)` gallery pair grew 106 px on a phone (0.425% on desktop) — looked at: one new glyph, «مؤشرات» (`ff4341c`, 39 → 40), reflowing the icon grid |
| `npm run parity` | **21 of 28** (path 4 skips without `cwebp`, as every local run) · **background block 3 of 3** · the one new golden reviewed and committed by the lead (`c7fffb1`); no existing golden moved |
| e2e, full suite | at `5bf0327`: **514 passed, 2 failed, 2 did not run, 80 skipped by project** (3.4 min). The two: `admin-proposals:90` (phone) — `DEC-145`'s hidden `S:` segment doubling «مقترح واحد», spec-side, fixed by `console` at `04fa967` and green alone (6 passed); and `budgets` under suite contention (below). The earlier full run at `40fbbb4` failed 10, every one green alone except `bookmarks:237` (carried below) and the public card's «م» assertion, which assumed an afternoon run (fixed `e9f6b04`). **CI on PR #25 at `5bf0327`: all 13 checks green** |
| `budgets` alone | **noise, not a regression**: at `e9f6b04` it passed; at `5bf0327`, three solo runs each flagged one screen's LCP at ~3,670 ms — the session list and leaderboard once, the event page twice — while every other reading of the same screens sat at 3,000–3,160 ms. The step is Lantern's, it moves between screens, JS (159 KB) and TBT (7–13 ms) are unchanged, and the event page was not touched this wave. The frozen landing: TBT 231–239 ms vs a 243 ms baseline |
| ★ the real worker, `E2E_WORKER=1` | **green** at `5bf0327` — `wave8-designer-editor` with the host worker rendering for real: 7 passed, every variant rendered, no Tier A refusal. The first run at `40fbbb4` found Tier A's «face loaded» check refusing real renders — it compared an advance against the **platform's** fallback font and was wrong both ways (refused «جلسة» at 92.09 vs 92.59; passed a page with no faces). `designer` replaced it with `faceResolved()` (`5bf0327`): a loaded, non-errored face of the family, and an identical advance over two different generic fallbacks. `npm run parity` 21 of 28 + background 3 of 3 locally, `--break-font` still fails all 28, and **inside the Linux worker image in CI: 28 of 28 + background 3 of 3** |

#### ✅ The rehearsal — 2026-09-17, on the owner's dump

**The dump** (15,818 lines) was checked before use: **schema only, zero `COPY`/`INSERT`**, exactly at **`0091`** —
`0091`'s objects present (`photos_broadcast`, `check_in_open`, `admin_member_profile`), none of the objects `0092`–`0099`
introduce (`canvas_raise`, `platform_alerts`, `session_certificate_designs`, `brand_scheme`, `deletion_pending`,
`is_baseline`), and `org_domains_domain_check` in production's case-sensitive text form. **Deleted once the rehearsal had
run**, with its vault-stripped copy and both containers.

| Step | Result |
|---|---|
| A: `postgres:17` + `scripts/ci/roles.sql` + the `supabase_realtime` publication + the dump minus its `supabase_vault` line | **0 errors** |
| The eight baseline platform templates production holds (from `0061`), copied from a second container built with the chain `0001`–`0097` — a schema-only dump has no rows, and `0098` rewrites exactly these | 8 rows and 8 versions; column sets identical to production's |
| **`0092`–`0099` applied in order, each in one transaction, `ON_ERROR_STOP=1`** | **all eight clean** — the platform library at **11 rows** (5 posters at v2, 3 «أفقية» at v2, 3 «عمودية» at v1, one default per family); `org_domains_domain_check` `CHECK ((domain)::text ~ '…'::text)`; `brand_kits.{light,dark}_canvas_raise` and `certificates.scheme` `not null` (default `light`); RLS on `session_certificate_designs` |
| Grants and `SECURITY DEFINER` on the **eleven functions the eight re-create** | **identical before and after**; the only changes are the intended ones — `certificate_render_context()` and `platform_template_library()` return added columns, five new functions (`platform_alerts`, `certificate_template_latest_version`, `set_certificate_design`, `redesign_held_certificates`, the re-created `platform_template_library`) carry their files' grants, and `platform_org_metrics`' owner-only ACL is written out by `0097`'s `revoke` (the same privilege) |
| ★ **Production + `0092`–`0099` against the chain `0001`–`0099`** in the same bare-Postgres environment, catalog by catalog (columns, enums, function bodies by hash with grants and settings, policies, RLS flags, triggers, constraints, indexes, table and column grants, views) | **identical except three pre-existing, environmental classes, none from these migrations**: `rls_auto_enable()`, production's platform event trigger (known since wave 7); four owner-only tables and views whose default ACL a dump restore leaves implicit; and `registrations`' Supabase default privileges, which local Supabase carries identically. ★ **Wave 7's `org_domains` drift is gone — `0092` converged it** |
| RLS suite on the rehearsal database, as dumped | 28 failures in 8 files, the same environmental class as wave 7's: bucket rows (`objects_bucket_id_fkey`), retention periods, the `storage`/`realtime` policies a `public`-only dump leaves out |
| ★ **The same suite after restoring exactly those** — 6 buckets, 7 retention periods, 13 `storage`/`realtime` policies, from the local chain (platform configuration, no member data) | **79 files: 832 passed, 1 failed, 4 todo.** The one: `m2-schema` expects a duplicate check-in refused `23505` and got `23P01`. Both constraints refuse the row; Postgres checks them in creation order, and **the dump restore reversed it** — the exclusion constraint's OID precedes `check_ins_session_member_active_uq` on the rehearsal database, while `0087` creates the unique index first and then re-creates the exclusion constraint, which is production's order and the chain's. Not from these migrations (none touches `check_ins`); it did not appear in wave 7's rehearsal because that dump predated `0087` |

### ★ `0092`–`0099` — what the owner does, in order, and why the push precedes the merge

**Production is at `0091`** (wave 7's push). This wave adds eight migrations, **all additive**:

| # | What it adds | What the new app calls that only it creates |
|---|---|---|
| `0092` | `org_domains`' CHECK re-stated as `domain::text ~ '…'` — one case-sensitive meaning everywhere (the chain's citext form converges on production's) | nothing — safe in either order |
| `0093` | `brand_kits.{light,dark}_canvas_raise` (backfilled, then `not null`); `brand_kit()`, `save_brand_kit()`, `export_render_context()` re-created with the token | `canvasRaise` in the kit and the render context |
| `0094` | the template guard walks every colour, gradient stops included | nothing — but see the read below |
| `0095` | `platform_alerts()` | `/app/platform` and SCR-084 |
| `0096` | `platform_template_library()` dropped and re-created with `orientation`, `is_baseline`, `retirable` | SCR-083 |
| `0097` | `reinstate_org()` refuses a pending deletion; `platform_org_metrics.deletion_pending`; `platform_org()`'s `deletionPending` | SCR-080 |
| `0098` | **data**: the five posters' v2 (the gradient), the three landscape certificates' v2 and «أفقية» names, three portrait certificates — eleven platform rows | the certificate library's six rows |
| `0099` | `brand_scheme`, `certificates.scheme` (default `light`), `ENT-session_certificate_designs`, `set_certificate_design()`, `redesign_held_certificates()`, `issue_certificate()` from `0088`'s text, `certificate_render_context()` with `scheme` | SCR-045 end to end, and the worker's certificate render |

**Merging deploys the app on Vercel and the worker on Railway, both from `main`.** The deployed code calls
`platform_alerts()`, the new `platform_template_library()` columns, `set_certificate_design()` and
`certificates.scheme`, so merging first would put it on a schema without them. Pushed first, the old app keeps
working: none of the eight removes anything it reads, and `platform_template_library()`'s new signature only adds
columns. **Two windows to know.** ★ **Saving a brand kit fails between the push and the merge**: `0093`'s
`save_brand_kit()` requires `canvasRaise` in both schemes (`POL-save_brand_kit.canvas_raise_required`, `23502`), and
`main`'s form does not send it — so push and merge back to back. And between the push and the worker's redeploy, the old worker renders `0098`'s v2
posters with its pre-`DEC-127` renderer, which reads only `background.color` — they come out on the old white
background, as posters look today. Nothing breaks; the data fix below re-renders them.

**The owner's order:**
1. ~~**Rehearse `0092`–`0099` against a production schema dump**~~ — ✅ **done 2026-09-17 by the lead on the owner's dump**, recorded directly below; the dump is deleted.
2. **Two production reads first** (read only):
   `select count(*) from public.org_domains where domain <> lower(domain);` — expect 0 (`0092`'s check must
   validate); and a read that **no platform or org template version carries a non-token colour**
   (`0094`'s guard refuses one on its next update, not on existing rows — but an org would meet the refusal
   the first time it edits such a template).
3. **Outside a scheduled session** — ★ **Server Action IDs rotate when this wave deploys**; an open tab's next
   action fails until it reloads. `supabase db push` (`0092`–`0099`) → **merge PR #25** → confirm the Railway
   worker redeployed (its log line now reads «polling every 15 s», `41f8807`).
4. **The scoped data fix** (`DEC-023`, never a migration), after the worker is on the new code — the exact SQL below.

#### The owner's SQL — each statement tested against the local database on 2026-09-17

**Step 2, the template colours** (read-only; **good = 0 rows**). The same walk and the same allowlist as `0094`'s guard. Tested by planting `#1d2a42` in a gradient stop, `navy` on a layer and `rgb(1,2,3)` on a fill inside a rolled-back transaction: all three reported, `{{ brand.edge }}` accepted.

```sql
-- Read-only. Every colour a template version carries, judged by 0094's own rule.
-- Good: 0 rows.
with colour as (
  select v.id as version_id, v.template_id, v.version, v.published_at, c.path, c.value
    from public.design_template_versions v
    cross join lateral (
      select 'background.color' as path, v.document #>> '{background,color}' as value
      union all
      select 'background.stops[' || (s.ord - 1) || '].color', s.stop ->> 'color'
        from jsonb_array_elements(case when jsonb_typeof(v.document #> '{background,stops}') = 'array'
                                       then v.document #> '{background,stops}' else '[]'::jsonb end)
             with ordinality as s(stop, ord)
      union all
      select 'layer ' || (l.layer ->> 'id') || ' ' || f.field,
             case f.field when 'color' then l.layer ->> 'color'
                          when 'shape.fill' then l.layer #>> '{shape,fill}'
                          else l.layer #>> '{shape,stroke}' end
        from jsonb_array_elements(case when jsonb_typeof(v.document -> 'layers') = 'array'
                                       then v.document -> 'layers' else '[]'::jsonb end) as l(layer)
        cross join (values ('color'), ('shape.fill'), ('shape.stroke')) as f(field)
    ) as c
   where c.value is not null
)
select t.scope, t.org_id, o.name as org_name, t.purpose, t.name as template_name, colour.version,
       colour.published_at is not null as published, colour.path, colour.value
  from colour
  join public.design_templates t on t.id = colour.template_id
  left join public.orgs o on o.id = t.org_id
 where colour.value !~ '^\{\{\s*brand\.[A-Za-z]+\s*\}\}$'
 order by t.scope, o.name, t.name, colour.version, colour.path;
```

**Step 4, the re-render.** One `regenerate_poster` job per live poster; each requests **12** `render_variant` jobs (5 screen presets × PNG and WebP, plus A4 and A3 PDF) — at most, because a variant whose fingerprint is unchanged is a cache hit. The `render` queue runs **one job at a time**. ★ **About 3 minutes per poster, not per variant**: wave 3 measured all twelve to `ready` in about three minutes on the worker image (`designer.md` line 860's «three minutes each» is a misstatement); the lead's host worker took 0.2–1.1 s per variant. Plan for **up to 3 × posters minutes**.

Count first (read-only):

```sql
-- Read-only. What the re-render will touch — run this first and keep the numbers.
select count(*)                      as posters,
       count(*)                      as regenerate_poster_jobs,
       count(*) * 12                 as render_variant_jobs_at_most,
       count(distinct s.org_id)      as orgs,
       min(s.starts_at)              as first_session_starts,
       max(s.starts_at)              as last_session_starts,
       count(*) * 3                  as minutes_at_most
  from public.session_posters p
  join public.sessions s on s.id = p.session_id
 where p.binding = 'live'
   and s.state = 'published'
   and s.starts_at > now();
```

Look at the rows (read-only):

```sql
-- Read-only. The same predicate, one row per poster, to look at before writing.
select s.id as session_id, o.name as org_name, s.title, s.starts_at, p.mode, p.binding
  from public.session_posters p
  join public.sessions s on s.id = p.session_id
  join public.orgs o on o.id = s.org_id
 where p.binding = 'live'
   and s.state = 'published'
   and s.starts_at > now()
 order by s.starts_at;
```

Then the write — tested in a rolled-back transaction on 4 local posters: 4 jobs on queue `render`, 3 attempts; run twice it still left 4 (the key replaces):

```sql
-- The write (DEC-023): the same predicate as the read, nothing wider.
with enqueued as (
  select s.id as session_id,
         public.enqueue_job('regenerate_poster',
                            jsonb_build_object('session_id', s.id),
                            'poster:' || s.id::text,   -- 0063's key: re-running replaces, never duplicates
                            null, 'render', 3) as job_id
    from public.session_posters p
    join public.sessions s on s.id = p.session_id
   where p.binding = 'live'
     and s.state = 'published'
     and s.starts_at > now()
)
select count(*) as regenerate_poster_jobs_enqueued, now() as enqueued_at from enqueued;
```

Progress (read-only; paste the `enqueued_at` the write returned). **Done** when nothing is `queued` or `rendering`; **good** = every row `ready`; a `failed` row says why in `error` and retries from the studio's export list:

```sql
select a.status, count(*)
  from public.export_artifacts a
 where a.created_at >= '<enqueued_at>'
 group by a.status
 order by a.status;
```

### Carried — diagnosed, each with an owner

| Owner | Finding | From |
|---|---|---|
| ~~`console`~~ | ~~the populated photo-report card has no 390 px capture~~ **closed**: `wave7-console-moderation-reports-populated-390-rtl-phone.png` (`admin-moderation.spec:237`, taken 2026-09-16 23:47) opened by the lead at sync 1 — the card, the reason, «تجاهل البلاغ» and «أزل» (the tab bar over the action row is the full-page artefact). It showed a real defect, routed: the moderation tab strip clips «بلاغات الصور»'s count at 390 with no scroll cue | wave 6 row 14, wave 7 |
| `console` | `console.spec`'s untouched-route capture at Pixel 7's 412 px; the dashboard's «أكثر …» cards — **closed or not, stated in its plan** | wave 6 |
| `designer` | a member re-added after a removal gets no new attendance certificate (`fan_out_certificates()` fires only into `completed`) — **this wave or not, stated in its plan** | wave 7, sync 1 |
| `designer` · `console` · `platform` | `noValidate` on the eleven forms wave 7 found with a native `required` — every one is in this wave's routes except `me/privacy` (deliberate) | wave 7, sync 5 |
| lead (custodian) | `content`: the photo tile's takedown label wraps under a half-width tile; a save pressed before hydration on `/app/me`. `sessions`: the filter sheet's native date mask; `0085`'s `ratings.edited_at` at millisecond precision | wave 6, wave 7 |
| lead | CSP report-only; the one nonce-less inline script is the frozen marketing intro — M13 | wave 6 |
| lead | watch, not open: `bookmarks:237` and `notify-screens:108` under full-suite load (post-action refetch) — if either recurs as «never updates», read `DEC-135` first, then remember `DEC-146` retired its cause | wave 7 |
| ★ owner / wave 9 | **`bookmarks:237` recurs as «never updates» on Next 16.3.5**: the un-bookmark Server Action returns 200 with `x-action-revalidated: 1`, the button flips, and the card is still listed 10 s later. On the final build it failed in 2 of 3 runs of the spec alone (both projects in parallel) and in the full suite, and passed 4 of 4 with tracing on — a timing race, not load. `DEC-146`'s upgrade did **not** retire it. An A/B against `e7d0657` is not possible on a `0099` database (that build's `getBrandKit()` fails, `DEC-148` finding 4). User impact: a removed bookmark stays on `/app/me/bookmarks` until a reload; nothing is lost. The trace is kept at `$scratchpad/bm-fail-results` | wave 8, final gates |
| ★ owner | **break-glass opens no org screen** (`DEC-055` option C). The copy now says so; option A — a read-only browsable `impersonating` state in `session.ts` — is yours to schedule (`DEC-149` §2) | wave 8, sync 2 |
| ★ owner · `notify`/M12 | a live `REQ-NTF-007` weakness — an email template's required fields are admin-editable, so one can be saved without `{{title}}`; `REQ-NTF-008`'s bounce and delivery states are never written (no webhook route) | wave 8, sync 1 |
| M13 | `controlClass`'s `w-full` beats a caller's `w-*` (`.w-full` is emitted after the fixed widths), so every `<Input className="w-32">` is full width (`DEC-149` §4) | wave 8, sync 2 |
| M13 | `DEC-145`'s orphaned streaming segment — a hidden duplicate of a page's content under `div[hidden][id^="S:"]` on several `/app` routes; locators scope to `#main` | wave 7, again in wave 8 |
| `scoring` | recognition edits (badges, levels, perks, streaks) write no audit or history row | wave 8, sync 2 |
| `designer` | a member re-added after a removal gets no new attendance certificate — out this wave (`DEC-148`) | wave 7 |

### Order inside the wave

1. **Task one and Step 0** — done, before anyone spawns. Push; the draft PR is #25.
2. **Spawn** `designer`, `console`, `platform`, `branding` with a **planning-first** task: each writes its plan
   into `docs/plan/notes/<name>.md` and edits nothing else until the lead approves it. **`branding`'s contract 1
   (types only) may land before its plan is approved**, because it unblocks `designer`.
3. **Sync 1** — the four plans read in full and answered; **contract 3 ruled** (what a baseline row is) before
   anyone seeds; the studio's M12 mechanics in or out; the lead's own schedule plan written beside them.
4. The tracks build. At each sync (`TEAM.md` §3) the lead promotes SQL, builds **committed HEAD** in the
   verification worktree (`$scratchpad/wt-verify`, own `npm ci`, a two-line `.env.local`), runs e2e there with
   `E2E_SHOTS_DIR` set to the main checkout's `.qa-shots/rtl` and `STUBBED_SERVER_LOG`, opens every capture at
   full resolution where a glyph or sign order matters, and ticks rows here only against `ui-reach --wave8` and a
   capture actually opened.
5. The lead's own rows (L2–L4) between syncs; L3 when the owner's schema dump is in hand; L6 after `designer`'s
   `--update`.
6. Freeze, the final build and the full gate set on the final commits — `parity` included — this file, the PR
   ready; **the owner merges.** ★ **The migration order for this wave is written here before the PR is marked
   ready**, from what its migrations add or remove, as wave 7's was.


---

## ★★ WAVE 7 — COMPLETE and MERGED (PR #24, `4f19cd6`; `0082`–`0091` pushed) — the remaining routes onto the M9 system, and the check-in switch (`DEC-137`)

**The owner's goal, in substance:** put the remaining member and staff routes onto the M9 design system —
about eighteen routes in the brief, **twenty-two pages and the admin IA** once every route is named — with
four teammates, and build the manual check-in switch **with** the screens it lives on. **Do not start wave 8.**

**The measure** (`DEC-137`, `DEC-130`'s with the capture made checkable). A row closes only when **(1)**
`node scripts/ui-reach.mjs --wave7` shows the page reaching an **M9** primitive (strict), **and (2)** a 390 px
RTL capture exists **at the path the row cites** — `.qa-shots/rtl/wave7-<track>-<route>-<state>.png` in the
**main checkout**, phone project, `390 × 844` — from a production build the row names by commit, **opened by
the lead**, with the spec that regenerates it named in the row. `.qa-shots/` is gitignored: the row text is
the only artefact anyone downstream can trust.

**Baseline on `7d50e64`:** `--wave7` **4/23 strict** (13/23 loose). By group: `(auth)` 3/3 · `/app` 1/1 ·
`app/sessions` 4/6 · `app/admin` 6/24 · `app/me` **0/7** · `app/platform` 0/7 (not this wave).

### Before anyone spawned — task one and Step 0

| | What | Commit | Evidence |
|---|---|---|---|
| ✅ | **Task one — `DEC-136`**: `patch-package` (lockfile through Docker), `patches/next+16.2.10.patch` on the four client builds of Next's vendored `react-dom`, `ui/pending-nudge` and all 21 referencing files removed in the same commit | `7d50e64` | the probe on production builds, same machine, back to back — see below |
| ✅ | **Step 0**: the wave-7 map in `CLAUDE.md`; all ten `.claude/agents/*.md` regenerated (`console` → **opus**); this checklist; `DEC-137`; `scripts/ui-reach.mjs --wave7` | the Step 0 commit | — |

**The reserve probe** (`tests/e2e/reserve-probe.spec.ts`, phone, 16 fresh sessions, one press each, STUCK = no
«تم تأكيد حجزك» within 10 s):

| Build | Result |
|---|---|
| nudge deleted, `react-dom` **unpatched** (the control) | `105 STUCK STUCK STUCK 104 STUCK STUCK 107 STUCK 104 105 105 104 STUCK 105 STUCK` — **9 of 16 hung** |
| nudge deleted, **patched**, run 1 | **16/16** — 132, then 103–108 ms |
| nudge deleted, **patched**, run 2 | **16/16** — 103–107 ms |

At a one-in-three hang rate, 32 clean presses by chance is about 2 in a million; the control shows the
machine reproduces the bug today. `tests/unit/react-dom-ping-patch.test.ts` fails on the unpatched copy
(proven) and passes patched. ⚠ An orphaned `next-server` from wave 6's verification worktree (PID 98585,
`ppid 1`) spun at 100 % of one core throughout; the lead's kill was refused by the permission classifier, so
**the owner removes it** — the control reproduced under the same load, so the A/B stands.

**Gates on task one's tree (`7d50e64`):** `tsc` clean · `lint` **0 errors** (`✖ 20 problems (0 errors, 20
warnings)`, unchanged) · vitest **115 files, 1220 passed** · `qa` **44 passed, 0 failed** · `visual`
`wave-6-final → wave-7-task-one` **0.000 % on all eight pairs** · e2e over every spec touching a changed file
(20 specs, both projects): **105 passed**, 7 failed; re-run alone, three pass (the local gateway's «invalid
response from the upstream server» at sign-in, and a proposal save that failed in the same window) and four
fail deterministically — `proposal-materials:140` and `tasks:143` on both projects — **and fail identically on a
build of `main` (`f4bfb82`) in the verification worktree**, so they are carried below. `db:reset` + RLS ran
with the `global-error` move: **`db:reset` clean, RLS 63 files, 746 passed, 4 todo** — and `build`, `qa` 44/44 and `visual` 0.000 % on all eight pairs again on that tree.

### The checklist — every route named

| # | Owner | Route / work | Serves | (1) `--wave7` | (2) capture — path · spec · build | State |
|---|---|---|---|---|---|---|
| L1 | lead | **task one** — the patch, the nudge deleted | `DEC-135`, `DEC-136` | — | the probe above | **closed** `7d50e64` |
| L2 | lead | **`global-error` resolved by a test** — throw in `[locale]/layout.tsx` on a production build; if ours does not render, move it to `src/app/global-error.tsx` | `REQ-UIX-016`, `16` §7.4, `DEC-138` | — | ✅ worktree probe at `c9e67ee` (`$scratchpad/global-error-probe*/`, not a cited capture): **beside the locale layout Next rendered its English «This page couldn't load», no `lang`/`dir`; at `src/app/` ours renders on `/ar`, `/ar/sign-in`, `/en`** — opened by the lead | **closed** — moved to `src/app/global-error.tsx`; `route-coverage --kind=error` asserts the new path; `build`, `qa` 44/44, `visual` 0.000 % on the tree with the move |
| L3 | lead | **`ui/splash`** — built to `16` §7.2 and measured; kept only if `/app`'s LCP holds | `REQ-UIX-006`, `REQ-NFR-008`, `DEC-142` | — | Lighthouse A → B → A in the worktree (35 runs): `/app` LCP 2862/2936 without, **3010** with; event page 3009/3010 without, **3167** with, FCP +450 ms | **closed — dropped** (`DEC-142`); the stub and `SplashProps` deleted |
| L4 | lead | **`REQ-EVT-010` reconciled** with the shipped photo pipeline (processing, then visible) | `REQ-EVT-010`, `REQ-EVT-011`, `DEC-139` | — | — | **decided** (`DEC-139`): the requirement bends to the strip; the no-reload clause stays and is row T8 |
| L5 | lead | **`DEC-135` reported upstream** with the instrumented-`react-dom` reasoning | `DEC-136`, `DEC-140` | — | — | **closed, no report filed** (`DEC-140`): React already fixed it — facebook/react#36134, in `react-dom@19.3.0` and vendored by `next@16.3.5`. The patch stays this wave; **the owner schedules the upgrade that retires it** |
| L6 | lead | **`checkin`'s SQL promoted** — `db:reset`, RLS, `policy-diff`, the `03` §8.2 rows | `REQ-CHK-010`, `015`–`017`, `DEC-141` | — | — | **closed** `7b2ac81` — `0084`–`0089` (`checkin`) and `0090` (`sessions`' admin member profile); `db:reset` clean, `policy-diff` agrees, trace no gaps, RLS 790/791. The one red is `content`'s own `photos-broadcast` case from `7c6f9e5`, routed. Six older assertions of the replaced mechanisms were retired or re-aimed, each with a successor in `checkin`'s suites. Both worker readers skip removed check-ins. **Still open:** the app readers that ignore `removed_at`, routed to `checkin` (`checkin.ts`, `rsvp.ts`), `sessions` (`sessions.ts`, `search.ts`, `ratings.ts` by written grant) and `console` (`admin-dashboard.ts`, `admin-exports.ts` by written grant). ★ **Before merge, the owner rehearses `0083`–`0090` against a production schema dump, as with `0082`.** |
| L7 | lead | ★ **Arabic-Indic digits seeded into every org's points catalogue** — found in `wave7-content-points-*.png`; `0083` fixes the seed, `numerals-seeds.test.ts` red before and green after | `REQ-INT-006`, `DEC-124`, `DEC-143` | — | — | code **closed**; ★ **production rows need the owner's scoped data fix** (`DEC-143`) |
| L8 | lead | ★ **the primary button's glint visible at rest in RTL** — on every primary `ui/button` since M9, found in `wave7-sessions-public-card-*.png` | `REQ-UIX-001` | — | worktree sign-in capture at `07a2f3b` + the fix: a clean button; `visual` 0.000 % on all eight frozen pairs | **closed** `7da3a50` |
| C1 | `checkin` | `/app/sessions/[id]/check-in` | SCR-014 · `REQ-CHK-003`, `004`, `010`, `015`, `016` | ✓ | `wave7-checkin-check-in-ready.png` · `wave7-checkin-check-in-closed.png` · `checkin.spec.ts` · `70bfb21` (final gates) | **closed** — opened by the lead: the six-box form, and «أُغلق تسجيل الحضور لهذه الجلسة» |
| C2 | `checkin` | `/app/sessions/[id]/host` — the close/reopen switch; no walk-in section | SCR-016 · `REQ-CHK-001`, `007`, `014`, `015` | ✓ | `wave7-checkin-host-open.png` · `wave7-checkin-host-closed.png` · `checkin.spec.ts` · `1a95a59` (sync 6) | **closed** — opened by the lead: the switch closes and reopens, the live code stays visible, «تم إغلاق تسجيل الحضور» |
| C3 | `checkin` | ★ `/app/admin/sessions/[id]/attendance` — manual add, **the removal** | SCR-044 · `REQ-CHK-008`, `012`, `017` | ✓ | `wave7-checkin-attendance-remove-dialog.png` · `wave7-checkin-attendance-removed.png` · `admin-attendance.spec.ts` · `70bfb21` (final gates) | **closed** — ★ `admin-attendance:319` (REQ-CHK-017, the removal through the confirm dialog) green on both projects; opened by the lead: the dialog names member and session and states the reversal and revocation, the removed row keeps its reason; the table scrolls in its own keyboard region at 390 |
| C4 | `checkin` | the switch and its `ends_at + 2 h` ceiling — SQL, RLS, the matrix column | `REQ-CHK-015`, `016`, `DEC-113`, `DEC-116` | ✓ | — | **closed** — `0084`/`0089` promoted `7b2ac81`, RLS 791/791 at `e73b239`; the matrix reads `checkInIneligibleReason()` (`34d4c08`); the event page and timeline follow the switch (`a55cf37`, `b3e5837`); `checkin.spec:222` green at `bfe8e2a` |
| C5 | `checkin` | **the reversal** — a compensating `reversal` ledger entry with its own key; `revoke_certificate()`; the late-job race | `REQ-CHK-017`, `REQ-PTS-013`, `REQ-CRT-004` | ✓ | — | **closed** (SQL) — `0087`/`0088` promoted `7b2ac81` with the reversal, revocation, no-show symmetry and late-job rows green; every reader skips removed rows (`6178109`, `5248e6b`, `9fd0570`, workers in `7b2ac81`); the entry renders on `me/points` (`8ed4bf8`). The admin's removal UI is C3 |
| C6 | `checkin` | walk-ins as a publishing setting — `schedule_session()`'s parameter, the field on SCR-043, `set_session_walk_ins()` retired | `REQ-CHK-010`, `DEC-117`, `DEC-118` | ✓ | `wave7-checkin-schedule-walk-ins.png` · `checkin-schedule-walk-ins.spec.ts` · `1a95a59` (sync 6) | **closed** — opened by the lead: a stored-on value renders checked, the guard for `343991d` |
| S1 | `sessions` | `/app/propose` — the largest form in the product | SCR-017 · `REQ-PRO-001`…, `REQ-UIX-009`, `010` | ✓ | `wave7-sessions-propose-empty.png` · `wave7-sessions-propose-error.png` · `wave7-sessions-propose.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead; `sessions-propose:207` phone strict locator open (spec) |
| S2 | `sessions` | `/app/propose/[id]` — my proposal | SCR-018 · `REQ-PRO-005` | ✓ | `wave7-sessions-proposal-pending.png` · `wave7-sessions-proposal.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead |
| S3 | `sessions` | ★ `/app/sessions/[id]/rate` — ratings only, stars fill from the right | SCR-015 · `REQ-RAT-001`…`006` | ✓ | `wave7-sessions-rate-empty.png` · `wave7-sessions-rate.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead; stars fill from the right |
| S4 | `sessions` | `/s/[id]` — the public card, a real 404 | SCR-007 · `DEC-066`, `DEC-134` | ✓ | `wave7-sessions-public-card-open.png` · `wave7-sessions-public-card.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead; navy placeholder (`0d69474`), real 404 case green |
| S5 | `sessions` | ★ `/app/members/[id]` — the two-tier profile | SCR-020 · `REQ-PRF-*`, A33 | ✓ | `wave7-sessions-profile-member.png` · `wave7-sessions-profile.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead |
| S6 | `sessions` | ★ `/app/leaderboards` — members and سباق الشركات | SCR-027, SCR-028 · `REQ-LDR-*` | ✓ | `wave7-sessions-leaderboards-members.png` · `wave7-sessions-leaderboards-companies.png` · `wave7-sessions-leaderboards.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead |
| T1 | `content` | ★ `/app/me` — the profile and the hub, with `me/layout.tsx` | SCR-021 · `REQ-PRF-001`…, `16` §6.5 | ✓ | `wave7-content-me-populated-saved.png` · `wave7-content-me.spec.ts` · `1a95a59` (sync 6) | **closed** — opened by the lead; the company select keeps its saved value (`bd517f6`: a success did not bump `attempt`, and a mounted select never re-syncs `defaultValue`) |
| T2 | `content` | ★ `/app/me/points` — including `checkin`'s reversal entry | SCR-022 · `REQ-PTS-*`, `REQ-CHK-017` | ✓ | `wave7-content-points-reversal.png` · `points.spec.ts` · `1a95a59` (sync 6) | **closed** — opened by the lead at full resolution: the reversal reads «-20» |
| T3 | `content` | ★ `/app/me/certificates` — issued and revoked | SCR-023 · `REQ-CRT-*` | ✓ | `wave7-content-certificates-issued-and-revoked.png` · `wave7-content-certificates.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead; serial and code LTR |
| T4 | `content` | ★ `/app/me/bookmarks` | SCR-024 · `REQ-DSC-006` | ✓ | `wave7-content-bookmarks-populated.png` · `bookmarks.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead |
| T5 | `content` | ★ `/app/me/calendar` | SCR-025 · `REQ-CAL-*` | ✓ | `wave7-content-calendar-connected.png` · `wave7-content-calendar.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead; no token in sight |
| T6 | `content` | ★ `/app/me/notifications` — inbox and preferences | SCR-026 · `REQ-NTF-*` | ✓ | `wave7-content-notifications-preferences.png` · `wave7-content-notifications.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead; the 390 px «overflow» was the old helper counting tabs inside the strip's own scroller (`e3633bc`) |
| T7 | `content` | ★ `/app/me/privacy` — export and deactivation | `REQ-PRF-006`, `007` | ✓ | `wave7-content-privacy-deactivate-confirm.png` · `privacy.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead; confirm in `ui/dialog` |
| T8 | `content` | the uploader's processing photo takes its place in the gallery **without a reload** once processed | `REQ-EVT-010` (as amended by `DEC-139`) | ✓ | — | **closed at the component and RLS layers** — `0091` (`e73b239`) proven by `photos-broadcast.test.ts`, the widget by its component test; not driven end-to-end, because the worker's processing step is outside the e2e stub. Recorded as such, not claimed as an e2e |
| K0 | `console` | the admin layout — **the fourteen-group IA** | `16` §6.7 · `REQ-ADM-020`, `REQ-UIX-017` | ✓ | `wave7-console-rail-drawer-admin-disclosed.png` · `wave7-console-rail-drawer-moderator-disclosed.png` · `console.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead |
| K1 | `console` | `/app/admin/moderation/comments` | SCR-050 · `REQ-EVT-008`, `014` | ✓ | `wave7-console-moderation-comments-populated-390-rtl-phone.png` · `admin-moderation.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead |
| K2 | `console` | `/app/admin/moderation/photos` — the takedown queue | SCR-051 · `REQ-EVT-012`, `DEC-005` | ✓ | `wave7-console-moderation-photos-populated-390-rtl-phone.png` · `admin-moderation.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead |
| K3 | `console` | `/app/admin/venues` | SCR-046 · `REQ-ADM-*` | ✓ | `wave7-console-venues-populated-390-rtl-phone.png` · `admin-managed-lists.spec.ts` · `1a95a59` (sync 6) | **closed** — opened by the lead; the card's «الحالة» shows no value, routed to `console` |
| K4 | `console` | `/app/admin/categories` | SCR-047 · `REQ-ADM-*` | ✓ | `wave7-console-categories-populated-390-rtl-phone.png` · `admin-managed-lists.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead |
| K5 | `console` | `/app/admin/companies` | SCR-048 · `REQ-ADM-*` | ✓ | `wave7-console-companies-populated-390-rtl-phone.png` · `admin-managed-lists.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead |
| K6 | `console` | `/app/admin/settings` | SCR-063 · `REQ-ADM-*` | ✓ | `wave7-console-settings-populated-phone.png` · `admin-settings.spec.ts` · `bfe8e2a` (sync 5) | **closed** — opened by the lead |

★ = transferred for this wave (`DEC-137`). **Not this wave**, named in every agent file: the other twelve
admin routes, `app/platform/**`, `verify/**`, `legal/**`, the survey, multi-day sessions (`DEC-119` … `121`),
gradient posters and `canvasRaise` (`DEC-127`), the certificate library (`DEC-128`), `DEC-075`'s two-tab
schedule and `0084`, objectives, tags, avatar storage, downloads, and `(marketing)/**`.

### Sync 1 — 2026-09-16 — four plans approved, and what they found (`DEC-141`)

All four teammates planned before editing: `checkin` `17e5772`, `sessions` `f146ff6` (+ `ce227a4`), `content`
`ff3c6fc`, `console` `addf939` (+ `ee64527`, `893da43`). Each was read in full and answered with rulings; the
decisions are `DEC-141`. What the plans found that was not in the brief:

- ★ **`certificates.check_in_id` is `on delete restrict`** — a removal must soft-delete, and 12 migrations and
  11 TypeScript files read `check_ins`. `checkin` writes the reader inventory before any SQL.
- ★ **`schedule_session()`'s walk-in parameter at `default false` would have silently reset walk-ins** on every
  reschedule — both `checkin` and `sessions` raised it; it is `default null` = unchanged.
- **`mark_checked_in_manually()` never awarded points** (a live `REQ-CHK-008` gap) — fixed as it is re-created.
- **A re-added member's revoked certificate is not re-issued** — `fan_out_certificates()` fires only on the edge
  into `completed`; recorded for the certificate library (`DEC-128`), not built.
- **`/s/[id]`'s missing card probably renders Next's English not-found** — no `not-found.tsx` covers `[locale]/s`;
  `sessions` verifies and adds one without breaking the real 404.
- **Hard-coded `/ar/` redirects** in three `/app/me` action files (`content`); **`proposal-materials:140` fails three
  ways**, all spec-side (`sessions`); **`tasks.spec:143` is a wrong spec** (`content`).
- **The account menu** links «حجوزاتي» and the profile both to `/app/me` — the lead's, after `content`'s tab strip.
- `console`'s proposed `admin/designer` rail entry would have linked to a page that does not exist; withdrawn.
- **`members.ts` moves to `sessions`** (one writer). **R1 and R5 landed** (`f9fa70e`); R2 (`ui/combobox` on a
  member form) is `console`'s after the rail.

### Syncs 2 and 3 — 2026-09-16 — the first real builds of wave 7, and what they found

**How it was verified.** Every build is of **committed HEAD** in the verification worktree
(`$scratchpad/wt-verify`, own `npm ci`), every e2e run against that build with `E2E_SHOTS_DIR` set to the
main checkout's `.qa-shots/rtl`, and the lead opened each capture named below. Sync 2 at `782aa6d`;
sync 3 at `d8f0af9` (static gates: `tsc` clean · lint 0 errors · vitest 132 files, 1358/1359 — the one
failure fixed in `8a83df4` · `ui-lint` passes, 88 under the allowlist · `ui-reach --wave7` **21/23** · build
green · e2e 147 passed, 22 failed, 22 not run).

**Found by looking, and fixed — none of these was visible to a green spec:**
- ★ **A light band at rest on every primary `ui/button` in Arabic**, since M9 — `.btn-sheen`'s physical
  `translateX` parks the glint inside an RTL button (`7da3a50`, row L8).
- ★ **Arabic-Indic digits seeded into every org's points catalogue** — «سلسلة: ٣ حضور في الشهر» (`0083`,
  `DEC-143`, row L7; ★ production rows need the owner's scoped data fix).
- ★ **A time broke from its «م» on every surface** — «…في 7:18» / «م» — fixed once in the shared formatter
  with a no-break space (`07e4fc8`), then the public card's range (`58ab535`).
- **The propose form's summary counted two fields while three showed errors**, and its «اضغط على …» line
  was not plural-aware (`3386178`).
- **`/app/me`'s tab strip hid two of seven tabs with no cue** (`5abdbc6`); **dead-end empty states** on
  certificates, points and calendar (`c61ea3a`).
- **The public card showed Next's English 404** before `2dc71e9` — now Arabic, a real 404, no retry
  (`f9fa70e`'s optional retry).

**Open from sync 3, with their owners:** `console` — the "populated" moderation and categories captures
are **empty** and the photo-report tab never counts a seeded report (spec or product, to establish); its
capture helpers ignore `E2E_SHOTS_DIR`; the exports page's copy still says numerals follow an org setting
(`DEC-124`); the moderation tab strip wraps at 390. `content` — ★ **the privacy deactivation's «أُرسل طلبك»
never appears** (possibly real); two strict locators. `sessions` — the rate specs and three strict locators
(`a8e25d0`, pending the next build).

**`592c3d2` — a shared-index sweep, left in history by ruling.** `checkin`'s SQL commit ran without a
pathspec and carried `console`'s K6 (`admin/settings/**`, `admin-settings.spec.ts`) and `content`'s points
and bookmarks work (`me/points/page.tsx`, `points-catalogue.tsx`, `{bookmarks,points}.spec.ts`, the deletion
of `wave7-content-points.spec.ts`). Both owners verified their files at HEAD match what they built. **K6
landed in `592c3d2`.** HEAD type-checked; no history was rewritten.

**`checkin`'s SQL — reviewed, not yet promoted.** Six proposed files, 37 RLS cases. Every re-created
function was diffed against its latest migration; none is based on a stale body, and the behaviours
spot-checked hold. **Two fixes stand before promotion:** the predecessor comments dropped from 01, 04 and 05,
and `schedule_session()` still writing `session.walk_ins_changed`. The lead's half landed ahead of it:
`GRANTING_AFFORDANCES.live` without `checkIn`, and `parseInstant`/`scheduledEnd` exported (`d8f0af9`).
★ **Before merge**, the promoted migrations (they alter `check_ins`' constraints on a live table) are
rehearsed against the owner's production schema dump, as `0082` was (`DEC-132`). **Done — all ten, `0082`–`0091`;
see «`0082`–`0091` — the rehearsal against production's schema».**

**Contract changes the lead made:** `FormSummaryProps.description?`, `RouteErrorProps.retryLabel?`/`reset?`
(`f9fa70e`); `CardMediaProps.placeholderTone?: "dark"` (`6232a8a`); `ui.combobox` strings (`3c92185`);
`star-rating.test.tsx` → `sessions` (`25fc741`).

### Sync 4 — 2026-09-16 — two harness defects found and fixed, `0091` promoted, and the valid findings routed

**What made syncs 2–4 unreliable, both now fixed and measured:**

1. ★ **The verification worktree had no `.env.local`**, so its build inlined no `NEXT_PUBLIC_SUPABASE_*`. Every page
   with a browser Supabase client threw client-side into «تعذّر تحميل هذا القسم» (the event page's Realtime above
   all), with a clean server log. A Playwright trace's console showed it. The worktree now has a two-line
   `.env.local` (local URL, local publishable key), never a copy of the main one. **Event-page failures cited
   from earlier worktree syncs may be this artefact.**
2. ★ **`scripts/lib/stubbed-server.mjs` never read `next start`'s piped output.** Once a long run's `csp-report:` lines
   filled the pipe, the server stayed listening and answered nothing, and every later test timed out at 30–35 s.
   The phone half of both sync-4 runs collapsed this way, and `sample` on the hung process showed its main thread
   in a blocked write. **Fixed at `c179a0d`**, measured on the same build: 1500 csp-reports, then `GET /ar`, answers
   nothing before the fix and 200 after. `STUBBED_SERVER_LOG=<file>` now keeps the server's output.

**Landed since sync 3:** `7b2ac81` (`0084`–`0090`, L6) · `e73b239` **`0091`** (T8's photo broadcast; RLS 72 files, 791
passed) · every `check_ins` reader skips removed rows (`6178109` sessions, `5248e6b` checkin, `9fd0570` console,
worker in `7b2ac81`) · contracts 1–3 wired (`55d40e1`, `388b46e`, `a55cf37`, `b3e5837`, `8ed4bf8`) ·
`checkInAllowed()`/`canOfferCheckInLink()` retired (`34d4c08`) · the host-view switch (`b03f057`) · ★ **a
walk-in hazard closed before any build shipped it** (`343991d`, then `9acc4bf`: the schedule form would have
switched walk-ins off on any save) · the account menu (`b4539ab`) · DEC-144 · six custodian specs onto
DEC-134 and wave 7's forms (`dd03094`, `79d3932`).

**Sync 4b at `34d4c08`, the valid half** (static gates: `tsc` clean · lint 0 errors · vitest 138 files, 1407/1407 ·
`ui-reach --wave7` **22/23**, C3 outstanding · build green). Real findings, routed:

| Owner | Finding |
|---|---|
| `sessions` | ★ axe serious on the event page: `definition-list`/`dlitem` in the action card |
| `sessions` | `sessions-screens:183` asserts a code dies at `ends_at`; under `DEC-141` it lives to the ceiling |
| `sessions` | `wave7-sessions-proposal:186` — a hidden `S:` copy stays on the not-editable state |
| `content` | `points.spec:235` and `wave7-content-certificates:111` strict locators; `wave7-content-me:93` no form alert after a cleared name (spec or product, to be established); `tasks.spec:143` carried |
| `console` | three phone admin cases failed as the hang began — unconfirmed until the next full run |

No row closes on sync 4: its captures came from builds with one or both defects. **Sync 5** is a full run at HEAD
with both fixes and `STUBBED_SERVER_LOG`, then `reserve-probe` alone on a quiet machine.

### Sync 5 — 2026-09-16 — the first clean full run: 19 rows closed

**Build `bfe8e2a`** in the verification worktree, with both sync-4 fixes (`.env.local`, `c179a0d`) and
`STUBBED_SERVER_LOG`. Static gates: `tsc` clean · lint 0 errors · vitest **144 files, 1435/1435** · `ui-reach --wave7`
**23/23** · build green · ✗ `ui-lint` (10, all `checkin`'s two new forms, fixed `399c35f`). **e2e: 391 passed, 21
failed, 27 did not run, in 4.2 min, with no server hang.** ★ **`reserve-probe` alone: 16/16**, 110–244 ms, so the
`DEC-136` patch holds at HEAD.

**The 21, sorted.** Eight were the local gateway's «invalid response from the upstream server» and two were load
(the marketing TBT budget, one admin case). **Re-run alone, 16 of 18 passed**, including `budgets` (so the frozen
landing's performance is intact). The remaining two were custodian specs, fixed and verified against this build:
`second-org` (hidden `DataTable` copy, `58ae011`, 6/6) and the platform axe scan (streamed redirect, `2b95bc9`, 6/6 ×3).
Real findings, routed with the build: `checkin` (`admin-attendance:177`, fixed `4fd7b6e`; captures ignored
`E2E_SHOTS_DIR`, fixed `043c03f`) · `sessions` (`sessions-screens:183` check-in status; `sessions-propose:207` strict) ·
`content` (signed amounts «20-»; the company select after save; `tasks:153` strict). ~~Two 390 px overflows~~ were the
old `widerThanViewport` counting the hub's tabs inside their own scroller, fixed in the helper (`e3633bc`, 7/7). ~~The
no-JS save~~ cannot work under `/app`: `loading.tsx` streams the page into a hidden segment only React's inline script
reveals, and no requirement asks for no-JS under `/app` (the only no-JS contract is the frozen register form) · `console` (a dashboard `Stat` with a sentence in its value
slot on an empty org; no venues capture).

**Rows closed on captures the lead opened, all from `bfe8e2a`:** S1–S6, T3, T4, T5, T6, T7, K0, K1, K2, K4, K5, K6; and C4, C5 on their SQL, RLS and specs.
**Open:** C1, C2, C3, C6, T1, T2, T8, K3. Each is named in its row.

★ **The `noValidate` sweep.** `content` found a real bug (`7f4809f`): a `required` control with no `noValidate` lets
the browser block the submit, so the app's own error never renders. Every wave-7 form that shows an app-side error
now sets it (`7f4809f`, `1c9c911`, `1402e33`, `bfe8e2a`), with a test each. **Carried to M13:** eleven forms outside
this wave with a native `required` and no `noValidate`: `platform/orgs/{org-controls,new/org-form,[id]/domains/forms}`,
`platform/impersonate/impersonate-form`, `admin/{emails,scoring,recognition,reminders}/page`,
`admin/sessions/[id]/certificates/page`, `designer/template-library`, and `me/privacy/forms` (deliberate:
`reportValidity()` before the dialog). A plain grep for `required` over-reports, because `<Field required>` sets only
`aria-required`.

### Sync 6 — 2026-09-16 — 24 of 27 rows closed

**Build `1a95a59`.** Static gates all green: `tsc` · lint 0 errors · vitest **145 files, 1439/1439** · `ui-reach --wave7`
**23/23** · `ui-lint` passes · build. **e2e: 428 passed, 6 failed, 7 did not run, in 4.6 min.** The 6 were:
- two cases of the no-JS save, skipped since (`967d1a7`);
- `budgets` (phone) and `bookmarks:237` (phone), both passing when re-run alone (load: TBT 269 ms vs a 243 ms baseline);
- `checkin`'s two strict locators in `admin-attendance`.

**Closed on captures the lead opened:** T1, T2, K3, C2, C6. **Open:** C1 (no capture of the check-in page), C3 (the
removal case has never run on a build), T8 (no e2e drives the no-reload path).

★ **A correction, recorded so nobody trusts it later.** Sync 5's «signed amounts read "20-"» was **the lead's misreading
of a downscaled 5,358 px capture**. At full resolution the reversal reads «-20», and `sessions` measured the same in
Chromium: a bare `<bdi>` puts the sign first with or without the LRM. The `dir="ltr"` pins in `bd517f6` and `2c6f632` are
harmless and correct, but the cause in their comments did not happen. `sessions`' R8 (`StatProps.valueDir`) was
declined for the same reason. **Lesson:** a finding about glyph order is read from a full-resolution crop, never from the
thumbnail.

### The final gates — 2026-09-16 — `70bfb21`

Every gate ran on one SHA, with teammates holding every database, port-3000 and commit action for the run.

| Gate | Result |
|---|---|
| `db:reset` · `policy-diff` · `trace` | clean · migrations and `03` agree · **313 requirements · 72 entities · 147 stories · no gaps** |
| RLS (single runner) | **72 files, 791 passed**, 4 todo, 0 deadlocks |
| `tsc` app · worker | clean · clean |
| lint | **0 errors** (23 warnings) |
| vitest | **146 files, 1444/1444** |
| `ui-reach --wave7` | **23/23** |
| `ui-lint` | passes; the allowlist pruned to what is on disk (`e1f33e0`: 229 across 58 files) |
| build | green, with the local `NEXT_PUBLIC_*` inlined |
| ★ `qa` | **44 passed, 0 failed** |
| ★ `visual` `wave-6-final → wave-7-final` | **0.000 % on all eight pairs** |
| ★ `reserve-probe` alone (phone) | **16/16**, 103–130 ms, so `DEC-136`'s patch holds at the wave's HEAD |
| e2e (full, both projects) | **425 passed, 6 failed**: `budgets`, `forms-propose:124` and `notify-screens:108` pass alone (load); `tasks:176` (a hidden orphaned streaming copy of the form, `DEC-145`) fixed in `05f023b` |
| ★ e2e confirmation at `fb13d0a` (no product code changed since `70bfb21`; the same build) | **439 passed, 1 failed**: `budgets` (phone), which fails only under suite contention and passes alone twice (TBT 269 ms vs a 243 ms baseline). `tasks:176`, `bookmarks:237` and `notify-screens:108` green under full load |

**Rows:** 27 of 27 are closed on their measure (T8 at the component and RLS layers, recorded as such).

**Watch, not open:** `bookmarks:237` failed under full-suite load in three of five runs (the card still present 5 s
after un-bookmarking) and never alone. `notify-screens:108` (mark-as-read) failed the same way once. Both end in Next's
post-action refetch of the current route. The spec now waits on the action's POST and then bounds the card's removal
(`05f023b`), so if it recurs it separates «slow» from «never updates». **If it recurs as «never updates», treat it as
`DEC-135`'s class first.** The `budgets` spec is noisy under suite contention; its real reading is the alone run.

### `0082`–`0091` — the rehearsal against production's schema (invariant 3), and why the push precedes the merge

**Production is at `0081`; `0082` through `0091` are unpushed.** Wave 6 merged without pushing `0082`, so all ten
were rehearsed together, in order, against the owner's dump — not only wave 7's.

**The dump** (15,607 lines) was checked before use: **schema only, zero `COPY`/`INSERT`**, exactly at `0081` (`0081`'s
company-points objects present; `0082`'s `org_settings.numerals` and `numeral_system` still there; none of the objects
`0084`–`0091` introduce). **Deleted once the rehearsal had run**, along with the rehearsal container.

| Step | Result |
|---|---|
| A fresh `postgres:17` + `scripts/ci/roles.sql` + the `supabase_realtime` publication; the dump with its `supabase_vault` line stripped | **0 errors** |
| **`0082`–`0091` applied in order, each in one transaction, `ON_ERROR_STOP=1`** | **all ten clean** — `numerals`/`numeral_system` gone, `sessions.check_in_open` default `true` |
| Grants on the **17 functions the ten re-create** (`check_in`, `transition_session`, `_seed_org_scoring`, `award_points`, `issue_certificate`, `session_public_card`, …) | **every execute grant and `SECURITY DEFINER` flag identical before and after** |
| New and dropped | 5 new (`admin_member_profile`, `remove_check_in`, `set_check_in_open`, the 14-argument `schedule_session`, the `photos_broadcast` trigger), 2 dropped (the 13-argument `schedule_session`, `set_session_walk_ins`, as `DEC-118` intends). The new `schedule_session` carries the old one's grant; `photos_broadcast` has the same `PUBLIC`-on-a-trigger ACL as `0016`'s `comments_broadcast`/`reactions_broadcast` |
| ★ **Production + `0082`–`0091` against the local chain `0001`–`0091`**, catalog by catalog (columns, enums, function bodies and grants, policies, RLS flags, triggers, constraints, indexes, table and column grants, views) | **identical, except 9 lines, none from these migrations.** 3 are rendering (`extensions.citext` vs `citext`, `extensions.gin_trgm_ops`). 1 is a production-only platform event-trigger function (`rls_auto_enable`). One is **pre-existing production drift**, identical before and after the ten, recorded below |
| RLS suite on the rehearsal database, as dumped | 45 failures in 9 files, **every one** a missing seed or a missing non-`public` policy: bucket rows (`objects_bucket_id_fkey`), the A27 templates (`no_certificate_template`), retention periods, and the `storage`/`realtime` policies a `public`-only dump leaves out |
| ★ **The same suite after restoring exactly those** — 6 buckets, 7 retention periods, 8 platform templates and versions, 13 `storage`/`realtime` policies, copied from the local chain (platform seed, no member data) | **72 files, 791 passed, 4 todo, 0 deadlocks** |

(`graphile-worker --schema-only`, the RLS runner's first step, fails on a schema-only dump: production's
`graphile_worker` tables are there but its migration rows are not, so it re-creates `jobs`. The suite was run
directly; `graphile_worker.add_job` is present from the dump.)

★ **Pre-existing drift, not introduced by wave 7, for the owner.** Production's `org_domains_domain_check` is
`CHECK ((domain)::text ~ '…'::text)`, a **case-sensitive** match. The chain's is `CHECK (domain ~ '…'::citext)`,
where citext's `~` is **case-insensitive**. On production, a domain with an upper-case letter fails the check; on
the chain it passes. It dates from how `0004` landed on production, and none of `0082`–`0091` touch `org_domains`.
**Not changed here:** a fix is a migration of its own, with its own rehearsal.

#### ★ For wave 7, the push precedes the merge

**Order: `supabase db push` (`0082`–`0091`) → `DEC-143`'s data fix → merge PR #24.**

`0082` could merge first because it was **subtractive**. It dropped a column and an enum that wave 6's app code had
already stopped reading, so that code ran correctly on production's `0081` schema, and the drop could follow.
**`0083`–`0091` are the opposite: additive, and the app depends on them.** Merging deploys, and the deployed code
calls what only these migrations create:
- `schedule_session(…, p_allow_walk_ins)`, whose 14-argument signature `0085` creates while dropping the 13-argument one;
- `remove_check_in()`, `set_check_in_open()`, `admin_member_profile()`;
- `sessions.check_in_open`, which the event page, timeline, check-in and host screens select;
- `check_ins.removed_at`, which every attendance reader filters on.

Merging first would put that code on a schema without them. The event page's select would fail on a missing
column, scheduling would call a signature that does not exist, and staff would get errors on live sessions.
Pushed first, the old deployed app keeps working on the new schema, with one exception:
- `main`'s own calls were checked: its 13-argument `schedule_session` call resolves to the new function, because `p_allow_walk_ins` defaults to null, which means unchanged. Its check-in, code and transition calls keep their signatures.
- The one incompatibility is `set_session_walk_ins()` (`main`'s `lib/dal/checkin.ts:74`), which `0085` drops. Between the push and the merge, **toggling walk-ins from the host view errors**, and **an early completion closes check-in (`0089`) with no reopen control yet**. Everything else the old app does keeps working.
- So push and merge back to back, outside a scheduled session.
- `0082` is in the same push and is safe in either order.

### Carried — diagnosed, each with an owner

| Owner | Finding | From |
|---|---|---|
| `console` | `console.spec`'s «untouched route» capture runs at Pixel 7's 412 px — give it `390 × 844` | wave 6 row «admin layout» |
| `console` | the populated photo-report card on `moderation/reports` was never captured | wave 6 row 14 |
| `console` | the dashboard's «أكثر …» cards set the count beside the name, the pipeline at the edge — pick one | wave 6 row 10 |
| `content` | the photo tile's takedown label «احذف الصور التي أظهر فيها» wraps under a half-width tile | wave 6 row 9 |
| `content` | on `/app/me`, a save pressed before hydration lands without `?saved=1` | wave 6 sync 2 |
| `content` | ★ `tasks.spec.ts:143` — the event page's tasks section is absent for the member the spec seeds, on `main` too: the spec or the product? | task one's gates |
| `sessions` | ★ `proposal-materials.spec.ts:140` — `getByLabel("نوع المادة")` resolves to two elements, on `main` too | task one's gates |
| `sessions` | the filter sheet's native date inputs show the browser's English `dd/mm/yyyy` mask | wave 6 row 5 |
| lead | CSP report-only; the one nonce-less inline script is the frozen marketing intro — M13 | wave 6 |
| lead | ~~the account menu links «حجوزاتي» and the profile both to `/app/me`; `notifications` and `privacy` have no entry~~ **closed `b4539ab`** — the seven hub routes in the hub's order, asserted in `shell-disclosures` | sync 1 |
| `0085`'s author | `ratings.edited_at` is written at millisecond precision — coarsen it with `submitted_at` (`16` §9.2a) | sync 1 (`sessions`) |
| certificate library (`DEC-128`) | a member re-added after a removal does not get a new attendance certificate — the fan-out fires only on the edge into `completed` | sync 1 (`checkin`) |

### Order inside the wave

1. **Task one and Step 0** — done, before anyone spawned. Push; the draft PR at the first push.
2. **Spawn** `checkin`, `sessions`, `content`, `console` with a **planning-first** task: each writes its plan
   into `docs/plan/notes/<name>.md` and edits nothing else until the lead approves it. `checkin`'s window and
   reversal questions are decided by the lead and logged before its SQL is written.
3. **`checkin` publishes its three contracts** on day one; `sessions` threads contracts 1 and 2 as soon as
   they exist — they unblock two tracks.
4. The tracks build. At each sync (`TEAM.md` §3) the lead promotes SQL, builds **committed HEAD** in the
   verification worktree (`$scratchpad/wt-verify`, own `npm ci`), runs e2e there with `E2E_SHOTS_DIR` set to
   the main checkout's `.qa-shots/rtl`, opens every capture, and ticks rows here only against
   `ui-reach --wave7` and a capture actually opened.
5. The lead's own rows (L2–L5) between syncs.
6. Freeze, the final build and the full gate set on the final commits, this file, the PR ready; **the owner
   merges.**

---

## ★★ WAVE 6 — COMPLETE and MERGED (PR #23, `5ef56ae`) — fourteen routes onto the M9 system (`DEC-130`)

**The owner's goal, verbatim in substance:** put **14 named routes** onto the M9 design system in
one wave, without touching the frozen marketing contract. **Do not start wave 7.**

**The measure** (`DEC-130`). A route is done only when **(1)** its `page.tsx` reaches
`src/components/ui/` through its import graph — **strict reading: an M9 primitive, not merely the
pre-M9 `button.tsx`/`dialog.tsx`/`icons.tsx`** — computed by `node scripts/ui-reach.mjs`, **and
(2)** a 390 px RTL capture of it under `.qa-shots/rtl/` was **looked at**. Passing (1) is the floor;
the capture is the bar.

**Baseline on `main` `413245f`**, both readings (the owner's quoted baseline sits between them;
the strict one is the gate):

| | strict | loose | owner's quote |
|---|---|---|---|
| `(auth)` | 0/3 | 0/3 | 0/3 |
| `app/admin` | 1/24 | 14/24 | 2/24 |
| `app/sessions` | 2/6 | 3/6 | 2/6 |
| `app/me` | 0/7 | 1/7 | 0/7 |
| `app/platform` | 0/7 | 5/7 | 2/7 |
| `/app` | 0/1 | 0/1 | 0/1 |

### The 14-route checklist — final, at `cc36ea6`

**(1)** is `node scripts/ui-reach.mjs --wave6` at `c802820`: **16/16 strict** (the fourteen plus the
admin layout and the materials viewer page). **(2)** is a 390 px RTL capture from a production build,
**opened by the lead** — what it showed is written in the row. A row is **closed** only when both hold
and no defect found in a capture is still open.

★ **Where the captures are, and a correction.** Every capture cited below is in the **main checkout's
`.qa-shots/rtl/`**, re-taken on 2026-09-16 at 17:37–17:38 by running the whole wave-6 e2e set against the
production build of `86f210d` — the app code of `cc36ea6` (everything after it is tests, the allowlist
and this file). `.qa-shots/` is gitignored: to see a capture on another machine, run the spec named in
its row. **The first version of this record cited the same file names, but the captures the lead had
opened were in the verification worktree (`$scratchpad/wt-sync/.qa-shots/`), and the main checkout
still held older copies (`scr-040` from 09-15, `scr-041` and `scr-052` from 09-14) or none
(`wave6-console-layout-untouched-390.png`).** Every row below was re-opened on the re-take; where a
fix had landed after the lead's last look (rows 6, 7, 8, 10, 11, 13), the row says what the current
capture shows. Two areas a full-page capture paints the fixed tab bar over — the dashboard's first two
stats and the end of a proposal card — were opened again with the fixed bars hidden.

| # | Owner | Route / surface | (1) | (2) what the capture showed | State |
|---|---|---|---|---|---|
| 1 | lead | `(auth)/sign-in` | ✅ `f8a977c` | ✅ `wave6-auth-sign-in-390.png`, `-sign-in-error-390.png` — one named Google action and no field (`SC 3.3.8` by construction, `DEC-131`); the refused-domain error an alert on a readable panel, naming no org | **closed** — `auth-screens.spec` green |
| 2 | lead | `(auth)/choose-org` | ✅ `f8a977c` | ✅ `wave6-auth-choose-org-390.png` — a named radio group, each org name isolated, the choice stated as final | **closed** |
| 3 | lead | `(auth)/no-access` | ✅ `f8a977c` | ✅ `wave6-auth-no-access-390.png` — every reason offers a next action; «الدخول بحساب آخر» primary when no reason | **closed** |
| 4 | `sessions` | `/app` — the timeline (`DEC-112`, `REQ-UIX-021`/`022`) | ✅ `ac09c09` | ✅ `wave6-sessions-timeline-{items,empty,filtered-empty}.png` (`timeline.spec`, re-take) — h1 «الجلسات», the nudge «اختر شركتك قبل حجز مقعد أو اقتراح جلسة.» with «أكمل ملفك»; chips «القادمة» · «جارية الآن» (**whole** — the clip is fixed) · «انتهت» │ categories; «المزيد من عوامل التصفية» on its own line; «التالية لك» first («التسجيل مفتوح», «الجمعة، 25 سبتمبر · 4:31 م», venue, level, «مقعدك محجوز», bookmark); the poster placeholder **one** letter, white on navy (no «اا»); «هذا الأسبوع 1»; no dangling «·» | **closed** — `timeline.spec` green |
| 5 | `sessions` | `/app/sessions` — browse | ✅ `ac09c09` | ✅ `wave6-sessions-browse-{chips,sheet-open}.png` (`browse.spec`, re-take) — named chips «المكان: قاعة التصفّح ×» (**whole**) and «المستوى: تمهيدي ×», the count «2», «امسح الكل»; the sheet «عوامل التصفية» with dates, tag «تقارير (1)», venue, company, level radios, and «اعرض النتائج · امسح · ×» **sticky in reach** | **closed** — `browse.spec` green. Carried: the native date mask (wave 7) |
| 6 | `sessions` | `/app/sessions/[id]` — the event page | ✅ `ae7624e` | ✅ `wave6-sessions-event-{before,after,ended}.png` + `-viewport` (`event-page.spec`) — the dark band, «الجلسات › إداري», «التسجيل مفتوح», chips, «يقدّمها سعد الحربي»; before: «0 من 60 مقعدًا», the bar, «يتبقى 60 مقعدًا», the phone bar «احجز مقعدك» + save + share; after: «تم تأكيد حجزك», «إلغاء الحجز», «وصلتك رسالة التأكيد ومعها ملف التقويم.», the bar's primary «أضِف إلى تقويمك»; ended: the ribbon «انتهت هذه الجلسة يوم الاثنين، 14 سبتمبر — التسجيل مغلق.», «انتهت», «قدّمها», «حضرت», the rating window, «قيّم الجلسة» once; the sub-nav «نبذة · المُقدِّم · النقاش» over the heading «المُقدِّم» (the plural was fixed in `93e75d3`, seen on the re-take). ★ **The reserve itself hung one press in three — `DEC-135`** | **closed** — `event-page.spec` green, «after reserving» at a 10 s ceiling (`4036774`), the reserve probe 16/16 |
| 7 | `content` | the discussion — `components/event/comments.tsx` (`REQ-UIX-024`) | ✅ `40e23a6` | ✅ `wave6-discussion-{1-first-visit,2-thread,2b-mention,3-near-cap,4-pending,5-failed,6-frozen}` (+`-viewport`) (`wave6-discussion-review.spec`) — the thread and the indented reply; «3 تعليقات», «110 أحرف متبقية»; the mention list «سالم الحربي»; reacted «• 1» vs «○»; **4-pending:** the text stays, «نشر» greyed with a spinner; **5-failed (re-take):** the text kept, ONE inline panel «تعذّر الاتصال. تحقّق من الإنترنت وحاول مرة أخرى.» under the field — no toast over the thread — and «نشر» ready to retry; **6-frozen (re-take):** «تعليق واحد», the notice «التعليقات مغلقة — هذه الجلسة ملغاة», the comment readable, only the report control, no reaction toggle. **Found and fixed:** «نشر» stuck busy after a slow post (`DEC-135`); the success path wiped text typed meanwhile (`d5f8b10`); **a network-failed post replaced the whole event page with the route error, losing the text** (`6ea6e60`); the same error also as a toast over the thread and the missing «.» (`e0317d0`, `0ccd698`); the reaction toggle on a frozen thread (`e0317d0`) | **closed** — `wave6-discussion-review` and `event-comments.spec` green |
| 8 | `content` | materials — `components/materials/list.tsx` and `/app/sessions/[id]/materials/[materialId]` | ✅ `a0448bf` | ✅ `materials-{event-page,viewer}-390-rtl-phone.png` (`materials.spec`) — «المواد», «مادة واحدة», the card «الشريحة الافتتاحية» · PDF · «بعد الجلسة», the warning «الخط «Amiri» غير مضمَّن في ملف PDF…» (guillemets on the re-take), «فتح العارض»; the presenter's row (re-take): «التوقيت» on `ui/select` and «السماح بالتحميل» on `ui/checkbox`, a navy check; the uploader in order («اختر ملفات» then «أو اسحب…», «PDF فقط · حتى 50 ميغابايت», «رفع» disabled with no file); the viewer: «الرجوع إلى مواد الجلسة», «صفحة 2 من 3», zoom, previous · pages · next, thumbnails with the current outlined, «تحميل الملف الأصلي» + the audit note (blank page images are the spec's 1×1 seed). **Found and fixed:** a native select and a blue browser checkbox (`9a71f48`); ASCII quotes (`de8db45`) | **closed** — `materials.spec` green |
| 9 | `content` | photos — `components/photos/gallery.tsx` | ✅ `3d185d0` | ✅ `photos-event-page-390-rtl-phone.png` (`photos.spec`, re-take) — «الصور» with a seeded photo tile and its takedown «احذف الصور التي أظهر فيها», the privacy panel «ستظهر هذه الصور لجميع أعضاء المؤسسة…», FileDrop in order, «JPEG أو PNG أو WebP · حتى 20 ميغابايت», **one** «إضافة صورة», disabled with no file; and the **empty** gallery in `wave6-sessions-event-ended.png` (re-take) — the plain sentence «لا توجد صور لهذه الجلسة بعد.», the panel, the uploader, one disabled «إضافة صورة». **Found and fixed:** the empty state carried a second, enabled «إضافة صورة» (`9752358`); «أو اسحب…» before «اختر ملفات» and an enabled upload with no file (`09d02a4`, `358eac4`). Noted, not fixed: the takedown label wraps to two lines under a half-width tile | **closed** — `photos.spec` green |
| 10 | `console` | `/app/admin` — the dashboard, «يحتاج انتباهك» | ✅ `b8501d7` | ✅ `scr-040-admin-dashboard-390-rtl-phone.png` (`admin-dashboard.spec`, re-take) — «لوحة المؤسسة» and its promise that every figure links to its list; «يحتاج انتباهك»: «مقترحات بانتظار قرار · اليوم 2», «جلسات لم تُجدول بعد 0», «بلاغات على الصور 0», «بلاغات على التعليقات 0»; «نظرة عامة»: «حجوزات مؤكَّدة 2», «تسجيلات حضور 1» (these two under the painted tab bar in the stored capture; opened with the bars hidden), «معدّل الحضور 50٪», «الأعضاء النشطون 4», «النقاط الممنوحة 10»; «مسار المقترحات» with «عرض القائمة», six states each 1; «أكثر المُقدِّمين مشاركة», «أكثر التصنيفات جلسات», «أكثر الشركات مشاركة» | **closed** — `admin-dashboard.spec` green. Noted: the «أكثر …» cards set the count beside the name, the pipeline at the edge |
| 11 | `console` | `/app/admin/proposals` | ✅ `ad7f5cc` | ✅ `scr-041-review-390-rtl.png` (`sessions-admin-proposals.spec`, re-take) — «مراجعة المقترحات» with the written-reason rule, «مقترح واحد», the card «مقترح للقياس البصري» · «بانتظار المراجعة · وصل اليوم», proposer · category · level, the abstract, «الاعتماد لا ينشر الجلسة — الجدولة والنشر خطوة منفصلة.», «اعتمد المقترح» primary, «اطلب تعديلًا», «ارفض المقترح» (the last under the painted tab bar in the stored capture; opened with the bars hidden). **Found and fixed:** two reason fields with one label (`f44d339`); the reject success toast never fired (`c9e5ac7`) | **closed** — `admin-proposals` and `sessions-admin-proposals` green |
| 12 | `console` | `/app/admin/sessions` | ✅ `e0f0f2c` | ✅ `scr-042-sessions-390-rtl-phone.png` (`sessions-screens.spec`, re-take) — «جاهزة للجدولة 1» with «أنشئ الجلسة», the secondary «إنشاء جلسة بدون مقترح», the search «ابحث في جلسات المؤسسة», the empty list «لا جلسات بعد.» + «افتح المقترحات». **Found and fixed:** «no match» on an empty search and a sentence styled as a button (`a78eec2`); the search's name equal to the shell's; the row menu missing from the phone cards (`a2c09fe`); the cancel toast never fired (`c9e5ac7`); ★ the data table's sticky header covered row 1 on desktop — a sticky `<th>` inside `overflow-x-auto` sticks to the wrapper (`2f0bcf0`) | **closed** — `admin-sessions.spec` green |
| 13 | `console` | `/app/admin/members` | ✅ `ef0586a` | ✅ `scr-049-members-390-rtl-phone.png` (`admin-members.spec`, re-take) — «الأعضاء والأدوار», «ابحث في الأعضاء»; each card: avatar, name, **the email** in LTR under it (a long seeded address wraps at its hyphen), «عرض الملف الكامل», company, role, «نشط»; a member's card stacks the role select «عضو» over «غيّر الدور», full width; the viewer's own card reads «مشرف المؤسسة» as text with no control. **Found and fixed:** no email on any member (`REQ-ADM-009`, `f44d339`); «غيّر الدور» wrapping and clipped (`e1bdf52`); the spec now asserts the own-row withholding (`804ca74`) | **closed** — `admin-members.spec` green |
| 14 | `console` | `/app/admin/moderation/reports` — **photo** reports | ✅ `98a27fb` | ✅ `scr-052-moderation-reports-390-rtl-phone.png` (`admin-moderation.spec`, re-take) — «الصور المُبلَّغ عنها», «بلاغات مفتوحة على صور لم تُخفَ بعد. الصورة تبقى ظاهرة حتى تقرر.», the empty queue «لا بلاغات مفتوحة على صور.» + «العودة إلى اللوحة». ⚠ **Only the empty queue is captured**: an open report's card (remove, dismiss, the toast — fixed `63fef6d`) is covered by `admin-reports.spec` and **not visually reviewed** | **closed** on the measure — `admin-reports.spec` green; the populated card is spec-covered, not looked at |
| — | `console` | the admin layout — not counted, required | ✅ `8de9b47`, crash fixed `1f4fffe` | ✅ every admin capture above, and `wave6-console-layout-untouched-390.png` (`console.spec`, re-take: venues) — the bar «لوحة إدارة المؤسسة», its menu button, an untouched page rendering under it. ⚠ **That file is not at 390**: the test sets no viewport, so the phone project takes Pixel 7's **412 px**. The earlier «412 px wide at 390, a horizontal overflow» was a misreading of this and is **withdrawn** — measured at a true 390, venues' `scrollWidth` is 390. The skip link seen mid-page in an older capture is a full-page artefact (a `fixed` element translated above the viewport) | **closed** — `console.spec` green |
| — | lead | **the shell disclosure sweep** (`DEC-111`, `REQ-UIX-023`) | ✅ `9d921cd` (+ `f797775`, `9cdcc89`, `e73803e`) | ✅ `wave6-shell-header-{390,desktop}.png`, `-account-menu-*`, `-tabbar-390.png` | **closed** — `shell-disclosures`, `shell-tab-bar` green |
| — | lead | **`ui/link` + `ui/route-progress` out of stub** (`REQ-UIX-006`) — `ui/splash` is wave 7's | ✅ `1d73e89` — with `page-header`, `section-header`, `icon-button`, `prose` | ✅ in the gallery capture | **closed** |
| — | lead | **the date-time picker's unnamed month buttons** (WCAG 4.1.2) | ✅ `73b0f3e` | — | **closed** |
| — | lead | **the numerals sweep, code half** (`DEC-124`, `DEC-132`) | ✅ `c20b901` | ✅ the gallery's stats read «124», «18» | **closed** |
| — | lead | **`0082_western_numerals.sql`** — rehearsed against production's schema, then promoted | ✅ `66676b7` | — | **closed** — `db:reset` + RLS on the final commits |
| — | lead | **focus clears the sticky header and fixed bars on every route** (`SC 2.4.11`) | ✅ `6ccb0e4` | — | **closed** — the event page's tab sweep green |
| — | lead | **an Arabic not-found page for all of `/app`**, and the streamed-404 contract (`DEC-134`) | ✅ `c03391c` | — | **closed** — not-found allowlist 6 → 0 |
| — | lead | ★ **`DEC-135` — pending controls nudge React past a lost ping** | ✅ `5376c32`, adopted `6dedc29` `1fd7980` `4036774` | — | **closed** — see Sync 4 |

**Tally at `cc36ea6`:** (1) **16/16**. (2) **all 14 rows and the layout captured on the final build, at
the main checkout's `.qa-shots/rtl/`, and opened. Closed: 14 of 14** — with one limit stated in row 14:
the photo-report queue was reviewed empty; its populated card is spec-covered only.

**Console's five, and why** (`DEC-130`): the dashboard is where «يحتاج انتباهك» moved; proposals,
sessions and members are the three weekly lists that most need `DataTable`'s phone card stack; the
reports queue is where a flag from `content`'s rebuilt discussion lands. Not chosen: `schedule`
(its artboard is the two-tab re-cut — needs `0084` and `DEC-117`/`118`), `attendance` (adjacent to
`DEC-116`), `settings` (the lead edits it in the numerals sweep).

### What each track delivered (commits on `wave-6/screens`)

- **`sessions`** (opus) — `/app` and `/app/sessions` as **one timeline component on two routes**
  (`ac09c09`: date groups, the member's next committed session first, always-visible status and
  category chips, named applied filters each removing only itself, a filter sheet, empty and
  filtered-empty states; the old filter rail deleted) · **the event page** (`ae7624e`: dark hero, the
  two-state action card chosen from the existing affordance matrix over all 42 phase × relation cells,
  the phone action bar, the sub-nav, a page-shaped skeleton) · **the slot-summary contract** (`dd10fd7`)
  and its wiring to `content`'s four readers (`c4e7642`) · three form-primitive requests from the lead
  (`32c71bf`, `83f97b5`, `7593967`) · real-build fixes: one «قيّم الجلسة», the calendar on a live session
  (`448ff6d`); **a card's bookmark that navigated to the event page** (`05f739a`); «حتى» kept with its
  time (`28e1a2b`); the chip row, «·» at line ends, the venue, the sheet's sticky apply
  (`2653321`, `e461239`); `FocusClearance`, later moved into the shell · specs `f18d90e`, `af33da7`,
  `6e77830` · notes `65d7dce`, `0649b44`.
- **`console`** (sonnet) — the admin **rail** (`8de9b47`, collapsible, a `ui/sheet` drawer on the
  phone) · **dashboard** with «يحتاج انتباهك» (`b8501d7`) · **proposals** with a reject confirm
  (`ad7f5cc`) · **sessions** top level on `DataTable` with a multi-select presenter `Combobox`
  (`e0f0f2c`) · **members** on `DataTable` with a deactivate confirm (`ef0586a`) · **photo reports**
  (`98a27fb`) · `ui/menu` `href` items through `ui/link` (`e73803e`) · real-build fixes: **the rail
  crash** and the layout gate (`1f4fffe`), four confirm-dialog titles bidi-isolated, a spec seed, a
  copied class string replaced by `ui/panel` (`1ee207a`) · found and fixed a Flight trap in its own
  files: a factory prop returning a bound Server Action is a plain closure, not an action (`ef0586a`) ·
  notes `496c937` … `249c8fb`.
- **`content`** (sonnet) — **the discussion** (`40e23a6`: auto-growing composer, a six-form remaining
  count, icon actions, the optimistic reaction whisper, `commentsSummary`) · **materials** (`a0448bf`:
  `Card` rows, `Progress`, both uploaders on `ui/file-drop` stating the real limit first) · **photos**
  (`3d185d0`: takedown confirm moved from `window.confirm` to `ui/dialog`) · **tasks**, light touch
  (`05e511b`) · badge/tag-chip/avatar as rounded squares (`6182ed1`), `CardMedia.dimmed` and
  `TagChip.selected`/`removeHref` (`3151630`) · real-build fixes: two dialog confirms that did not
  submit (`e533ad8`, `358eac4`), a stale materials assertion (`133b26c`), FileDrop's copy order
  (`09d02a4`), the two discussion blockers and the reaction's legibility (`44485b8`, `da1b09c`), **two
  colour tokens that do not exist** in the card and avatar tints, now tested against `globals.css`
  (`23698df`), streamed-duplicate waits (`185fbb1`) · notes `2fec60c` … `f865c66`.
- **lead** — Step 0 (`9120237`, `57f1103`) · the numerals sweep and `0082` (`c20b901`, `66676b7`) · the
  picker (`73b0f3e`) · five lead primitives out of stub (`1d73e89`) · the `(auth)` screens (`f8a977c`) ·
  the shell sweep and its follow-ups (`9d921cd`, `607ecbe`, `f797775`, `9cdcc89`) · the verification
  worktree and every build and e2e run of this wave · `SectionHeader`'s accessible name (`e988ac6`) ·
  `FocusClearance` in the shell (`6ccb0e4`) · the poster read cached (`57ac20f`) · `app/not-found.tsx`
  and `DEC-134` (`c03391c`) · the discussion review spec (`68e645d`, `f7e59b3`) · specs following the
  timeline, the gated tasks section and hydration (`d092d81`, `abff454`, `fb50577`) · sync records
  (`5198bfe`, `20081fb`, this one).

- **After `e86f904` — the closing builds** (each finding is in its checklist row and in Sync 4):
  `sessions` — the nudge in the filter sheet, bookmark and not-found retry, and «after reserving» at a
  10 s ceiling (`4036774`); the sub-nav's presenter label (`93e75d3`); an independent Node + jsdom
  reproduction of `DEC-135` and the one-line `react-dom` fix. `console` — the report, proposal and
  session toasts fired from the action (`63fef6d`, `c9e5ac7`); the empty-state copy (`a78eec2`); the
  `DEC-134` specs and stream waits (`5a7ae10`, `e8c546f`); the nudge (`6dedc29`); the phone row menu and
  a distinct search name (`a2c09fe`); the email, the reason labels, the dialog close on result
  (`f44d339`); the role button (`e1bdf52`); the sticky header dropped (`2f0bcf0`); specs `f9b23dc`,
  `861f236`, `9b1e67c`, `6ccbe9d`, `804ca74`. `content` — the nudge across nine call sites (`1fd7980`);
  the photo empty state (`9752358`); a slow post wiping the next draft (`d5f8b10`); **network
  rejections caught everywhere** (`6ea6e60`); the settings row onto `ui/select` + `ui/checkbox`
  (`9a71f48`); Arabic quotes (`de8db45`); the failed/frozen findings (`e0317d0`, `0ccd698`); its first
  `4582b17` (afterPaint) retired by `DEC-135`; notes `dc2e424` … `04c5cf8`. **lead** — `DEC-135` and
  `ui/pending-nudge` (`5376c32`); the review settles between states (`296aec4`); the gallery's glyph
  names and count (`86f210d`); the ui-lint allowlist pruned 416 → 329 (`c802820`); this record.

### Gates — all run on the final commits

| Gate | Where | Result |
|---|---|---|
| `npm run build` | main checkout at `86f210d` (and the worktree at `04c5cf8`) | **green**, no warnings |
| `npm run qa` | the `86f210d` build | **44 passed, 0 failed**; `.git/kareem-qa-verified` → `c802820` (only tests and the allowlist since) |
| `npm run visual` | `capture wave-6-final` at `86f210d`, `compare wave-6-before` | **0.000%** on all six frozen pairs (`desktop_ar`, `desktop_ar_register`, `desktop_en`, `phone_ar`, `phone_ar_register`, `phone_en`). The `(dev)` gallery pair grew (1440×3358 → 3598, 390×4694 → 4914) and was **looked at**: real `page-header`/`section-header` headings, rounded-square badges and avatars, Western digits in the stats, a one-letter placeholder, four new glyphs — which carried Latin names and a stale «35» until `86f210d`. `wave-6-final` is wave 7's baseline |
| `npm run db:reset` + `npm run test:rls` | local stack, migrations through `0082` | reset clean; **63 files, 746 passed, 4 todo** |
| `policy-diff` · `trace` | `c802820` | migrations and `03` agree · **313 requirements · 72 entities · 147 stories · no gaps** |
| `ui-lint` | `c802820` | **pruned: 80 files · 329 violations** (`main`: 103 · 416) |
| `loading-coverage` · `error-coverage` · not-found | `c802820` | **0 · 0 · 0** allowlisted (`main`: 0 · 0 · **6**) |
| `tsc` · `lint` · vitest | `c802820` | clean · **0 errors** (20 warnings; `✖ 20 problems (0 errors, 20 warnings)`) · **115 files, 1218 passed** |
| **e2e — the whole wave-6 set** | the `04c5cf8` worktree build; then **the main checkout on the `86f210d` build** (the captures' run) | worktree: **136 passed, 1 failed, 11 skipped, 2 not run** — an unscoped `admin-members` locator, fixed in `6ccbe9d` + `804ca74` and green on re-run (6 passed, 4 skipped). Main checkout, all 21 specs: **136 passed, 1 failed, 12 skipped, 1 not run** — the failure `session.spec:119`, the local Supabase gateway answering «An invalid response was received from the upstream server» at sign-in after the `db:reset` (Kong), **8/8 on re-run**. Every skip is a project gate |
| `ui-reach --wave6` | `c802820` | **16/16 strict** |
| the reserve probe (`DEC-135`) | 16 presses per build | **16/16** with the nudge (`5376c32`); **16/16 at ~105 ms** with `sessions`' `react-dom` patch and the nudge disabled (not shipped) |

### Order inside the wave

1. **Step 0 — this commit.** The map in `CLAUDE.md`, all ten `.claude/agents/*.md` regenerated,
   this checklist, `DEC-130` … `DEC-132`, `scripts/ui-reach.mjs`. **No teammate before it lands.**
2. **Spawn** `sessions`, `console`, `content` with a **planning-only** first task: study the canvas
   (extracted to `.qa-shots/canvas/*.dc.html`, gitignored) and their screens, write the plan into
   `docs/plan/notes/<name>.md`. **No source edit until the lead posts «numerals landed at <sha>».**
3. **The numerals sweep's code half lands atomically** (`DEC-132` item 3): it touches every file all
   three teammates are about to rebuild — all five admin routes, the browse card, the event page and
   the comment DAL among them. **The migration waits for its rehearsal** against the owner's
   production schema dump; the code is correct on either side of it.
4. The three tracks build; the lead does the shell sweep and the `(auth)` screens, syncs, promotes,
   runs `build`/`qa`/`visual`, and ticks this table only against `scripts/ui-reach.mjs` output and
   a capture actually opened.

### `0082` — the rehearsal against production's schema (invariant 3, DEC-132)

**Two dumps, because the first run's script deleted the first dump on a setup error** — the
container lacked the `supabase_realtime` publication, and the exit trap removed the dump before the
error could be fixed. The script now pre-shims the platform roles and the publication, runs a tolerant
diagnostic apply first, and deletes the dump only once the rehearsal has actually run. The owner ran
the dump a second time. Both dumps were **schema only — zero `COPY`/`INSERT` statements**, checked
before use — and both are deleted.

| Step | Result |
|---|---|
| Production's schema (15,607 lines) into a fresh `postgres:17` + `scripts/ci/roles.sql` + the platform pre-shim | **0 errors** (the `supabase_vault` extension line stripped, as at Launch step 2) |
| Production before `0082` | `org_settings.numerals` present, `numeral_system` present — and exactly the four readers `DEC-132` names |
| **`0082` applied with `ON_ERROR_STOP=1`** | **clean.** Column 0, enum 0; the grants on all four re-created functions identical to production's (`session_public_card` → `anon`, `authenticated`; the other three → `service_role`); `session_public_card`'s row type without `numerals` |
| RLS suite against **production's schema + `0082`** | ★ **not a clean pass: 30 failures in 7 files**, and every one depends on what a schema-only `public` dump cannot contain — the seeded A27 templates (`0061`, all of `designer-certificates` and `platform-schema`'s library cases), the seeded retention periods (`retention`, `privacy`, `platform-schema`), the storage bucket rows (`materials-schema`), the policies in the `realtime` schema the dump excludes (`realtime`), and one exclusion-constraint case in `m2-schema`. **Every test that exercises what `0082` touches passed on it**: `sessions-public-card`, `notify-send`, `designer-posters`, `tenancy`, `notify-schedule-change` |
| **The full chain locally** — every migration with its seeds, `0082` on top, `npm run db:reset` | **`test:rls` 63 files, 746 passed, 4 todo**; `policy-diff` agrees. `designer-certificates`, which covers `certificate_render_context`, passes here |

★ **Stated plainly, because the owner's gate said "`npm run test:rls` green":** the suite was not green
against production's schema, for the environmental reason above, and it is green on the full chain.
A strictly green run on production's schema would need production's seed rows, and a data dump carries
every member's personal data — so it is not proposed. If the owner wants a control run instead — the
same dump **without** `0082`, to show the same 30 fail with no migration at all — it costs one more
dump.

### Sync 1 — 2026-09-16, `607ecbe` — the plans are approved and the tracks are coding

**Gates at `607ecbe`:** `build` green · `qa` **44/44** · `visual` **0.000%** on all six frozen captures
(the `(dev)` gallery grew, looked at: its headers are real components now) · vitest 99/1062 at
`9d921cd` · lint 0 errors · `ui-lint` pruned to 410 · `.git/kareem-qa-verified` advanced to `607ecbe`.

**The three plans** are in `docs/plan/notes/{sessions,console,content}.md`, each written before any
code. `sessions` §22 is **the event-page section contract** — DOM order, ids, headings, a
`SlotSummary` reader per `content` slot so the page gates a section before rendering it, and
`cache()`d DAL reads so the gate costs no second round trip. `content` builds against it.

**Rulings the lead took at sync 1** (the plans' questions, none needing the owner):

- The event page follows the canvas's sticky desktop action column; the phone hero is the dark band
  with badge and title, the poster under «نبذة»; shipped copy wins over canvas copy; no rating and no
  computed presenter history on a member surface; seats left shown on open cards.
- **Objectives are not this wave** — the column does not exist; the section and its sub-nav entry are
  absent, the id reserved.
- **Badge, tag-chip and avatar follow the canvas's 6 px rounded squares**, not pills (`DEC-110`) —
  `content`'s change, in its own commit, with a before/after capture.
- The admin rail keeps its **19 flat items**; `16` §6.7's 14-group IA is a **wave-7 question**. The
  dashboard's «يحتاج انتباهك» has four rows; **"job-queue depth" is dropped** — no org-scoped source
  exists, and `REQ-ADM-010`'s enumeration is covered without it.
- Reply stays a labelled button; reaction, report and delete are icon buttons.
- A materials or photos viewer with nothing to show and no right to add renders nothing — the page's
  summary gate removes the section.

**Found since Step 0, all recorded:** four lead primitives were still M9 stubs (`1d73e89`); **`DEC-133`** —
Tailwind 4 has no `inset-inline-*`, so the phone tab bar never spanned the screen, plus an invisible
empty toast viewport over its middle tabs; `REQ-EVT-010`'s "a photo appears at once" does not match the
shipped pipeline (processing, then visible) — a finding for a later wave, not built here.

### Sync 2 — 2026-09-16 — the first real builds, and what the captures showed

**How it was verified.** The shared tree is always mid-edit, so every build this sync is of **committed
HEAD** in a separate worktree (own `npm ci`), and every e2e run is against that build — a JSON reporter
per run, because serial specs stop at their first failure and a line reporter hides the tests that never
ran. The machine was loaded by three tracks' vitest runs; a failure is called real only when it repeats.
**The lead opened every capture listed below** (390 px, phone project) — what was seen is written here,
not that the file exists.

**Static gates at `028fa23`:** `tsc` clean · lint **0 errors** (19 warnings) · vitest **1176/1177** — the
one failure is `console`'s `admin.proposals.rejectConfirmTitle` interpolating a bare `{title}` ·
`policy-diff` agrees · `trace` no gaps · `loading-coverage`/`error-coverage` clean · `ui-lint` allowlist
416 → 410 (one new violation in `console`'s WIP, sent back).

**`sessions` — e2e at `e988ac6`: browse 10/10, checkin-gating 4/4, timeline 7/8, event-page partial.**
Seen in `wave6-sessions-{timeline-items,timeline-empty,browse-chips,browse-sheet-open,event-before,event-after,event-ended}`
(+ `-viewport`): one primary per state; after reserving, the «تم تأكيد حجزك» strip, «إلغاء الحجز» and the
calendar as the bar's primary; ended — ribbon, «انتهت», «قدّمها», «حضرت», the rating window, «قيّم الجلسة»
exactly once; applied-filter chips with ×, «امسح الكل», the filter count; the empty timeline inviting a
proposal; Western digits throughout. **Sent back:** the status chip «جارية الآن» is clipped to «جارية» by
the filter button at 390 px (a different word); poster-placeholder initials «اا» read as a pause glyph
and «جا» is dark-on-navy; a dangling «·» at line ends; a venue name split across lines; the filter
sheet's apply action is below its first screen; the filtered-empty sentence renders twice (phone).

**`content` — the discussion (`REQ-UIX-024`), photos, materials.** A lead spec drives the discussion into
the states a member meets (`tests/e2e/wave6-discussion-review.spec.ts`). Seen in
`wave6-discussion-{1-first-visit,2-thread,2b-mention,3-near-cap,4-pending}`: counts and plural forms are
right («تعليق واحد», «3 تعليقات», «110 أحرف متبقية»), names, dates and long text lay out correctly
RTL, the focus ring is plain, the composer keeps its text in flight. ★ **Two blockers:** after one post
«نشر» stays `disabled` + `aria-busy` indefinitely — a member cannot post twice without reloading; and
every post raises a full-width success toast, two of which stack over the thread and hide the comment
just posted. Also: no mention list appeared for «@سا»; the reaction at rest is a bare grey dot that does
not read as an action. Seen in `photos-event-page-390-rtl-phone`: the info panel and the file limits
read correctly; «أو اسحب…» stood before «اختر ملفات»; the upload primary looked enabled with no file;
the empty discussion offered its call to action twice. `content` fixed the last three, both dialog
confirms that did not submit, and a stale materials assertion (`e533ad8`, `133b26c`, `358eac4`,
`09d02a4`); the two blockers were fixed in `44485b8` (Sync 3).

**`console` — ★ the admin console does not render on a real build.** Served with server logging, every
`/app/admin/**` page shows only «تعذّر تحميل هذا القسم» to every staff member:
`admin/layout.tsx` passes `Icon` component functions inside the rail's items to the `"use client"`
`AdminRail`, which React cannot serialise (`8de9b47`). `console`'s own admin specs never reached it —
they are serial and stopped at their first failure. Also: `notFound()` moved into the layout, where it
streams a **200** to a plain member. ⚠ *Corrected in Sync 3: this sync read the moderator case as
passing; it never ran. Every gated page under `/app` streams 200 — the loading model, `DEC-134`.* All five
routes are committed; none is verified until the layout is fixed.

**Lead fixes this sync:** `SectionHeader`'s count read as one word with its title («هذا الأسبوع1») →
`e988ac6`; `FocusClearance` (built by `sessions`) moved into the shell for every route → `6ccb0e4`;
the poster read cached per request → `57ac20f`; `/app`'s skeleton and three stale specs → `d092d81`,
`abff454`, `fb50577`.

**Found, not this wave's to fix:** on `/app/me` a save clicked before hydration lands without the
`?saved=1` confirmation (the no-JS path) — `app/me` is wave 7. CSP is report-only; the one nonce-less
inline script on every page is the frozen marketing intro in the locale layout.

★ **Shared-index incident** (the third in this repo): `content`'s `358eac4` committed without a pathspec
and swept in `sessions`' staged deletion of `components/sessions/focus-clearance.tsx`, so HEAD did not
build until `06da10b`; `content` then restored the deliberately deleted file (`9a8340a`) and `sessions`
removed it again (`17404f9`). Restated to every track: `git commit -- <paths>` always; `git rm` stages at
once, so delete with `rm`; never create, restore or delete a file outside your own list.

### Sync 3 — 2026-09-16 — the admin console on a real build, the 404 contract, and a streaming artefact

- **The rail crash is fixed** (`1f4fffe`) and verified on a served build: admin pages render for staff,
  and an untouched route (`venues`) renders under the new rail.
- ★ **`DEC-134`.** Every "a member gets a real 404" assertion under `/app` failed with 200 — including
  `moderation/comments`, which nobody touched, and a missing event page. Traced: **M9's `app/loading.tsx`
  wraps all of `/app`, so the response is already streaming when a gate calls `notFound()`**; Next 16
  answers 200 with `noindex` and the not-found page, and renders no guarded data. Accepted, rather than
  a role gate in the proxy (`DEC-036`) or removing loading boundaries. The admin 404 was **Next's
  built-in English page** — `app/not-found.tsx` now answers in Arabic for all of `/app` (`c03391c`).
  `console` rewrites its status assertions.
- ★ **A streaming artefact, not a product duplicate.** At `af33da7` strict locators failed with "2
  elements" in every track. Reproduced under a CPU throttle, polling every 20 ms: for ~400–800 ms a second
  copy of a boundary's content sits in `body > div#S:n[hidden]` beside the copy in `<main>`; after load
  there is one. Every spec now waits for `div[hidden][id^="S:"]` to count 0 after each navigation
  (`f7e59b3`, `6e77830`, `185fbb1`; `console`'s pending).
- **The discussion, re-captured at `af33da7`:** no toast over the thread, «نشر» idle after a reply, a
  comment and a reaction, the mention list opens, reactions read. ★ **Still open:** measured on the
  served build, a plain post clears `aria-busy` within 500 ms; **a post whose response takes ~1.5 s
  keeps `aria-busy="true"` for all 6 s measured after the response, until the next keystroke.**
- **`console`, found in `scr-042`:** an empty search reported as "no match"; a sentence styled as a
  button. **`content`, found by `sessions`:** `bg-navy-600`/`bg-navy-200` do not exist, so two of six
  placeholder and avatar tints painted nothing (`23698df`).
- **An English error page under load.** Once, on the phone project, `/app/admin/venues` showed Next's
  «This page couldn’t load»; a rerun with server logging rendered it and logged no error. Transient under
  load, recorded here, **not** explained.
- **RLS at `f865c66`:** 63 files, 746 passed, 4 todo.

### Sync 4 — 2026-09-16 — the closing builds: a lost React ping, and what the captures still held

- ★★ **`DEC-135` — a transition that re-renders the event page could hang for good.** On a production
  build, on a quiet machine, **one «احجز مقعدك» in three never committed**. The seat was stored, the
  action's whole response had arrived and the main thread was idle, yet the page stayed as it was
  until any other update. The same bug caused `content`'s «stuck busy» post and a tombstone that
  never appeared.
  - **Bisect** (8, then 16 presses per build): `ae7624e` introduced it, when the event page became
    async server components (~95 lazy rows per payload). Six single-cause patches all still hung.
  - **Cause, read from an instrumented `react-dom`:** a Flight chunk became `resolved_model` while
    the render yielded. Attaching the ping listener then pinged **synchronously inside the render**.
    The root was already `RootSuspendedWithDelay`, so the ping was dropped.
  - **`sessions` reproduced the same in Node + jsdom** with Next's own `react-dom` and Flight client,
    and wrote the one-line fix.
  - **Shipped:** `ui/pending-nudge`, a 300 ms re-render while pending, in `SubmitButton`, `ui/link`'s
    pending reporter and every tracked transition in the three tracks. **16/16.**
  - **Not shipped:** the `react-dom` patch, also 16/16 at ~105 ms with the nudge off. That is the
    owner's toolchain call (wave 7 below).
- **What the full review found once it could reach its last states:** the composer wiped text typed
  during a slow post; **a network-failed post replaced the whole event page with the route error**;
  the same error showed twice; a frozen thread offered reactions. All fixed and re-captured (row 7).
- **What the admin captures and runs found:**
  - members had **no email**;
  - «غيّر الدور» clipped;
  - one card had two reason fields with one label;
  - three success toasts never fired, because each was an effect in a card that unmounts in the same
    commit;
  - the phone cards had no row menu;
  - the admin search had the shell's name;
  - ★ **the data table's sticky header permanently covered row 1 on desktop.** A sticky `<th>` inside
    an `overflow-x-auto` wrapper sticks to the wrapper, not the page, so `top: var(--header-h)` pushed
    it down over the first row; it was dropped.

  All fixed (rows 10–14).
- **The gallery** named four new glyphs in Latin and still said «35»; fixed (`86f210d`).
- **The freeze held:** the final build and gates ran with teammates frozen; the only two commits
  after it were one spec each, re-run on the final build.

### ★ Findings recorded before any code

- **`sign-in` has no input at all** — one Google OAuth button. `DEC-129`'s «paste into the code
  field, `autocomplete="one-time-code"`» has no field to bind; `SC 3.3.8` holds by construction and
  is tested as such; the clauses bind any future OTP or magic-link field in full (`DEC-131`).
- **The frozen contract holds 11 Arabic-Indic glyphs, not 3** — `components/chapter.tsx` carries 8
  and renders on the marketing page. All wait for M13 (`DEC-132`).
- **The column is `org_settings.numerals`**, not `orgs.numerals`; `0063` and `0065` return the enum
  in their result types, so they are dropped and re-created (`DEC-132`).
- **The canvas has no artboard for** the `(auth)` screens, the admin lists and dashboard, or the
  discussion composer. Those are built from `System.dc.html`, `Shell.dc.html` and `16`'s specs —
  and the capture is reviewed against the system, not against a picture that does not exist.
- **Comments carry no attachment column** (`0010:284-296`), so `REQ-UIX-024`'s «visible upload
  controls» are the photo and materials uploaders onto `ui/file-drop` — not attachments on a
  comment, which would be a schema decision for the owner (`DEC-130`).

### The three M9 stubs — `ui/link`, `ui/route-progress`, `ui/splash` — decided

`REQ-UIX-006` («no interaction leaves the interface apparently idle») is today satisfied by a **stub**:
`route-progress.tsx` returns `null` and `link.tsx` has no `useLinkStatus()` child. That is a requirement
met on paper only, and it is stated here rather than left to be found.

- **`ui/link` and `ui/route-progress` close IN THIS WAVE** — the lead's, after the shell sweep, to
  `16` §7.1.1's corrected design: a client child inside `ui/link` calls `useLinkStatus()`, renders the
  inline pending affordance and writes a ~20-line store; `<RouteProgress>` in the shell subscribes and
  shows the bar only past **150 ms**. **Why now:** the timeline and the event page are where
  navigation is felt, and `DEC-110` carries M9's remaining system work *with the screens that need it*.
- **`ui/splash` goes to WAVE 7.** `16` §7.2 makes it conditional on a measurement — it fades on the
  shell's first paint, and **if it costs LCP it is dropped, not the budget** — and that measurement
  belongs with the performance pass, not with fourteen routes. Until then it stays a stub that renders
  nothing, which is the safe failure.

### Wave 7 — the remainder: never-touch in every wave-6 agent file, and carried findings

- **The other 19 `app/admin` routes** → wave 7: `audit` · `branding` · `categories` · `companies` ·
  `designer/[documentId]` · `emails` · `exports` · `moderation/comments` · `moderation/photos` ·
  `recognition` · `reminders` · `scoring` · `sessions/[id]/attendance` · `sessions/[id]/certificates`
  · `sessions/[id]/schedule` · `settings` (except the numerals field the lead removes) ·
  `templates/certificates` · `templates/posters` · `venues`
- **`app/me` — all 7 routes**; **`app/platform` — all 7 routes**
- `app/sessions/[id]/{check-in,host,rate}`, `app/members/[id]`, `app/leaderboards`, `app/propose/**`,
  `s/[id]`, `verify/[code]`, `legal/**`
- **Multi-day sessions** (`DEC-119` … `DEC-121`) — **decided, NOT this wave**
- **The manual check-in switch and walk-ins as a publishing setting** (`DEC-113`, `DEC-116`, `DEC-117`,
  `DEC-118`) — **decided, NOT this wave**
- **Gradient posters and the `canvasRaise` brand token** (`DEC-127`) — **decided, NOT this wave**; the
  certificate library (`DEC-128`) likewise; the parity goldens do not move
- **The survey**
- **Anything under `src/app/[locale]/(marketing)/`** and `components/{chapter,header,footer,…}.tsx`
  it renders — frozen until M13. `DEC-126`'s «تسجيل الدخول» lands there, not here.
- **`ui/splash`** — conditional on an LCP measurement (see the M9 stubs above)
- **`16` §6.7's 14-group admin IA** — the rail kept its 19 flat items this wave (sync 1 ruling)

**Carried findings — decided or measured this wave, not fixed in it:**

- `REQ-EVT-010`'s «a photo appears at once» does not match the shipped pipeline (processing, then visible).
- On `/app/me`, a save clicked before hydration lands without the `?saved=1` confirmation (the no-JS
  path) — `app/me` is wave 7.
- ✅ **`DEC-135`'s real fix — DECIDED by the owner 2026-09-16, `DEC-136`: take the patch.** Wave 7
  opens with it: `patch-package` added (lockfile via Docker), the patch applied and
  `ui/pending-nudge` plus all **21** referencing files deleted in **one** change, verified at the
  bug's own standard (**16/16 presses on a production build**, because it is probabilistic), then the
  full gate set, then reported upstream. If it cannot be verified to that standard the nudge stays.
  The original framing follows.
- ~~`DEC-135`'s real fix is the owner's call.~~ Either apply `sessions`' one-line `react-dom` change
  (`pingSuspendedRoot`: `? 0 === (executionContext & 2) ? prepareFreshStack(root, 0) :
  (workInProgressRootPingedLanes |= pingedLanes)`, verified 16/16 at ~105 ms) through `patch-package`
  (a new dependency; the lockfile through Docker), or take a React/Next release that carries it. Then
  **delete `ui/pending-nudge` and every caller together**, and report the bug upstream.
- **The reserve's `redirect()` is not the hang** (`DEC-135` ruled it out). The earlier note to replace
  it is withdrawn.
- `console.spec`'s «untouched route» capture is named `-390` but taken at Pixel 7's 412 px (no viewport
  set); give it `390 × 844` like every other review capture. (The venues overflow once recorded here was
  a misreading of that file, and is withdrawn — venues is 390 wide at 390.)
- The populated photo-report queue has e2e coverage but no 390 capture; take one when
  `moderation/{comments,photos}` are rebuilt.
- The photo tile's takedown label «احذف الصور التي أظهر فيها» wraps to two lines under a half-width tile
  (row 9).
- The dashboard's three «أكثر …» cards set the count beside the name; the pipeline aligns it at the
  edge. Pick one.
- `ui/select` has no size variant, so `content`'s inline settings row uses `md` (noted in its note).
- `ui/button`'s `pendingLabel` puts the spinner's live label into the button's accessible name while
  pending. That is by design (a polite status), but specs need a regex in that window. Revisit with
  the loading model.
- **A long list's sticky header** needs its wrapper to be the vertical scroller (a max-height plus
  `top-0`); `DataTable` has none now (`2f0bcf0`).
- ⚠ **`supabase/config.toml` has an uncommitted change that is not a wave-6 change** (Google OAuth
  enabled via `env()`, `site_url` → `localhost`, wildcard redirect URLs), dated 2026-09-15. Every
  session left it unstaged. **The owner decides** whether it is committed.
- The filter sheet's native date inputs show the browser's English `dd/mm/yyyy` mask.
- The CSP is report-only; the one nonce-less inline script on every page is the frozen marketing intro
  in the locale layout — enforcement waits on M13.
- Next's English «This page couldn’t load» appeared once under load (Sync 3). Next's docs place
  `global-error` in the **root app directory, even with internationalization**; ours is
  `src/app/[locale]/global-error.tsx` — verify whether Next uses it before trusting that an error above
  the locale layout is caught in Arabic.

---

## Where we are (historical — written during M0; kept for the record)

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
| — | `DECISIONS.md` | append-only | DEC-001 … **DEC-047**. |
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
| 16 | `16-ui-redesign.md` | **`settled`** | **The UI/UX rebuild** — the design system, the IA, loading, forms, motion, the session-lifecycle vocabulary, avatars, the studio and the email studio. M9–M13. **Approved 2026-09-15; changes now need a `DECISIONS.md` entry.** |
| — | `ASSUMPTIONS.md` | `settled` | **A1–A40**, each with a status. |
| — | `OPEN-QUESTIONS.md` | `settled` | **27**, each with a default in force. OQ-027 (worker hosting) closes at Launch with PR C (DEC-046); OQ-012 implemented behind the perk (DEC-047). |
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

## Launch session — 2026-09-15 — one gated step at a time

**The owner's instructions, verbatim in substance** (they override the handoff below where they differ):
uploads are **PDF-only** from launch — remove the converter, PDF page rendering in the worker, record
the decision superseding D26 and DEC-032 (**DEC-058**); the worker host is **Railway** (existing Hobby
subscription), `worker/Dockerfile`, Singapore, auto-sleep off, `DATABASE_URL` on port 5432; repository
visibility stays as it is (the owner changes it after launch); the owner's hands-on checks (QRs at print
size, ICS in Outlook, the main flows on a real phone in Arabic) happen after step 6 on the live site.
**Every action that touches production waits for the owner's explicit «go».** STATUS is updated after
each step.

**Environment variables:** before step 3 a complete inventory goes in this file as a table — every
variable the app, the worker and CI need in production, grouped by where it lives (Vercel Production,
Vercel Preview, Railway worker, GitHub Actions secrets), with the exact name, the issuing service, the
page or command to obtain it, public/secret, and whether it already exists. **Never a secret value in a
tracked file**; `.env.example` gets every new name with a placeholder and a one-line comment. Before
step 6 each service's log is checked for what it actually read.

**The deny list and the owner's hands** (`.claude/settings.json`, DEC-051): this session cannot run
`vercel …`, `gh secret …`, `gh api …`, `supabase db push`, `supabase db dump --linked`,
`supabase db query --linked`, or `gh pr merge` — on purpose. Where a step needs one, the owner runs it
by typing `! <command>` in the prompt (the output lands in the conversation) or lifts the rule for one
step. Secret values are never printed; `vercel env ls` and `gh secret list` print names only.

### The order

| Step | What | State |
|---|---|---|
| 1 | Pre-launch fixes on `fix/launch-pdf-only` → PR → owner merges when green: PDF-only (DEC-058) · terminal handling for a deleted subject (DEC-059) · the other DEC-057 items recorded as post-launch | **done** — PR #16 merged by the owner, CI 12/12 |
| 2 | Rehearsal: schema-only dump of production → fresh local database → every migration on top → full suite green → show the result and **WAIT** | **done, green** (2026-09-15): the owner's `supabase db dump --linked` (385 lines: the two enums, `registrations`, its insert policy and grants, four extensions) into a `postgres:17` container with `scripts/ci/roles.sql`; `0003` … `0077` applied without an error; graphile schema; **RLS suite 61 files / 713 passed, 4 todo**; 155 policies over 68 tables; `registrations` byte-identical in shape. The dump was deleted. Two production facts recorded: an `rls_auto_enable` event trigger (RLS on every new `public` table — harmless, every migration enables it anyway) and **default privileges that grant no DML to `anon`/`authenticated`/`service_role`** (unlike local Supabase; the 0002 trap) — the rehearsal applied them first and every grant the migrations make held. `supabase_vault` was stripped from the rehearsal copy (a platform extension a plain container cannot install; production keeps it). |
| 3 | `supabase db push` after the go; then the hosted dashboard one step at a time — Google provider, the Custom Access Token hook, JWT expiry — asking for each input as it comes up, **WAITING before each** | **push DONE (2026-09-15)**: count before 19; dry run `0003`…`0077`; first push applied `0003`…`0015` and stopped at `0016` (DEC-061, fixed on PR #17); second push applied `0016`…`0077` (one predicted `01007` warning on 0016's grant — `authenticated` already held insert/select/update from Supabase's own migration). Verified on production: **77 recorded, last `0077`, 68 tables, 155 public policies, 12 storage+realtime policies, the six buckets, registrations 19**. **Dashboard DONE** (each gated, the owner clicking): asymmetric JWT keys were already current (ECC P-256, the HS256 secret «previously used» since two months — revoke after launch) · Google provider enabled, both redirect URIs on the client · Site URL `https://kareem.pp.sa`, two redirect entries with the `**` suffix (the callback carries `?next=`) · hooks `custom_access_token_hook` and `before_user_created_hook` enabled · JWT expiry 900. **Step 3 complete.** |
| 4 | Vercel: the inventory's variables, a production deploy, the frozen routes and the platform routes checked live; the first org by one-off SQL from the owner's details | **in progress** — the four variables set by the owner (the two Google names corrected to `GOOGLE_CALENDAR_*`); production redeployed without cache from `main` `105f58d`; **live probes (read-only, curl)**: `/` → 307 `/ar` · `/ar` `/en` `/ar/register` 200 (`lang="ar" dir="rtl"`, `og:image` absolute on the domain) · `/og.png` 200 image/png 39 KB · `/ar/app` and `/ar/app/platform` → 307 `/ar/sign-in?next=…` (**configured**: unconfigured would be 404, so the `NEXT_PUBLIC_*` pair was inlined) · `/ar/sign-in` 200 · `/ar/legal/privacy` 200 · `/ar/verify/<junk>` 200 with the not-found copy · `/api/auth/callback` without a code → 303 `sign-in?error=1`. **The first org** «كريم معرفة» (`kareem`, `KM`, domain `pp.sa`, first admin `y.reda@pp.sa`, western, Asia/Riyadh) by one-off SQL in the dashboard SQL editor — a `do` block mirroring `create_org()` minus its platform-admin assertion (none can exist before the first sign-in), proven locally in a rolled-back transaction first: active, 1 domain, 4 categories, 2 audit rows. **The owner's first Google sign-in landed on `/ar/app`** — the two hooks, the provider and the redirect list proven on production. Then `platform_admins` (1 row) and the placeholder `created_by` replaced by the owner's user id; `members`: admin, active. **Step 4 complete** pending the owner's `/ar/app/platform` check after a re-sign-in. |
| 5 | Worker on Railway: connect the repo, variables from the inventory, the LISTEN/NOTIFY probe in the deploy log, the alerts drill against production | **in progress** — done from the Railway CLI (the owner signed in): project `kareem-marefa` (id `e4ef4a11…`), service `worker` from `ebnmajed/kareem-marefa` on `main`, `RAILWAY_DOCKERFILE_PATH=worker/Dockerfile` (the manifest still says RAILPACK but the build log runs our Dockerfile's apt step), region Singapore only (the default `sfo` replica zeroed), sleeping off, restart on failure ×10, no domain; the four non-secret variables by CLI, the four secrets by the owner in the Raw Editor (`DATABASE_URL` session pooler 5432, `SUPABASE_SERVICE_ROLE_KEY`, the two `GOOGLE_OAUTH_*`). Build on Railway: **font set OK — 21 web faces, 12 TrueType files**. Deploy `2493db32`: **`LISTEN/NOTIFY probe OK — round trip 8 ms`**, 35 tasks registered. Post-launch: the startup line still says «polling every 60 s» (it is 15 s, DEC-057). **The drill on production:** `evaluate_alerts()` live — all eight clear, twelve cron entries registered, queue empty; then `tests/rls/platform-alerts.test.ts` over the session pooler from the owner's terminal — the first run collided with the real org's slug (12/12 `orgs_slug_key`, nothing written; fixed by DEC-062 on PR #18), the second hit vitest's 20 s per-test limit on the WAN seed, the third with `--testTimeout=300000` **passed 12/12** (≈90 s a case, 17.8 min total — the round trip to Singapore, not the platform). **Step 5 complete.** Post-launch: rotate the database password (it reached the transcript twice) and update Railway's `DATABASE_URL`. |
| 6 | Email provider wiring; the end-to-end smoke test on production with the owner's account (sign in, propose, schedule, RSVP, check in, comment, rate, certificate issued, QR verified, ICS downloaded); report what differs from local; then the owner's hands-on checks | **solo half DONE (2026-09-15)** — Resend on `peninsulapictures.dev`, sender `kareem-notifications@…` (DEC-063), `MAIL_TRANSPORT`/`RESEND_API_KEY`/`MAIL_FROM_ADDRESS` on Railway; **on production:** proposal submitted → approved (2 notifications, 3 mails through Resend) → session scheduled and published (**12 poster variants in ≈10 s** on Railway's Chromium; the reschedule to today regenerated 12 more and mailed once) → comment → ICS downloaded → **live at 09:45 UTC, completed at 09:50** on the minute cron → **`KM-2026-000001` (presenter) issued, three exports rendered, released on SCR-045, downloaded, its code verifies on `/ar/verify/…` and a wrong code is refused**. **Differences from local, all recorded on the post-launch list:** the mail's raw ISO date; no link to SCR-045; the certificate mail without the inline preview; the org name was stored back to front (the one-off SQL's Arabic pasted through a visual-order surface — restored by a scoped `reverse(name)` update guarded on the first code point; the posters already rendered carry the old string until their next regeneration). **Attendee half (RSVP, check-in, rating, attendance certificate): needs a second `pp.sa` account** — pending the owner's answer; otherwise it runs with the first real member and is recorded here. **The owner's hands-on checks are next:** the poster and certificate QRs scanned from paper at print size, the ICS in Outlook, the main flows on a real phone in Arabic. |
| 7 | Post-launch fixes as a branch → PR → owner merges; close STATUS with the launch record, the final variable inventory and the post-launch list | **PRs #19 and #20 merged; `0078`–`0081` pushed to production (2026-09-15)** — the dry run listed exactly the four; the push applied them (0080's `drop policy if exists` notice is its own no-op); verified on production: last version `0081`, the live org's **three company rules backfilled**, no session open to walk-ins yet, the card image policy present. **The live public card verified by curl**: `/ar/s/b95d547c…` 200 with the session's `og:title`, a description of date · venue · org, `og:url`, `og:image` → `/api/s/<id>/og` (200, image/png, the poster's own bytes), `noindex`, a `summary_large_image` twitter card; an unknown id 404s. **Railway did not auto-deploy on either merge** although CI on `main` was green — the CLI-created service had no push trigger armed; `railway service source connect --repo ebnmajed/kareem-marefa --branch main` re-armed it and a build of `591453d` ran and **deployed: `LISTEN/NOTIFY probe OK — 9 ms`** — the worker on production now carries the company rules in `evaluate_no_shows`/`audit_balances`. **Everything merged today is live on all three services** (Vercel, Supabase, Railway). Post-launch: confirm in Railway → service → Settings → Source that deploys on push to `main` stay on. **Closed by DEC-068:** the company-rule defaults stand as the owner's decision; the design milestone is deferred; the hands-on checks and the two secret rotations are the owner's, post-launch. **Step 7 complete** — this branch is the closing PR. |

### Step 1 — what changed (DEC-058, DEC-059)

- **PDF-only, end to end.** Upload form, `materialKindSchema`, the Route Handlers' declared kinds,
  `sniffedKindMatchesDeclared()` (PowerPoint/Keynote still recognised, matched to nothing), the list
  and viewer screens (no Keynote branches), `ar/` then `en/` copy (the substitution warning now speaks of
  a font **not embedded in the PDF**), migration **`0077_pdf_only`** (`materials_kind_pdf_only` CHECK;
  `finalize_material_upload()` and `carry_over_proposal_materials()` re-created for `pdf` alone).
- **The converter is gone**: `converter/`, its CI job, `npm run converter:test`, `CONVERTER_URL`, the
  signed-URL minting, `convertedPdfPath()`. **poppler + cwebp are in the worker image**
  (`worker/Dockerfile`); `worker/src/content/pdf.ts` wraps them; `convert_document` inspects
  (page count + `pdffonts`' non-embedded fonts against `fc-list`), `render_pages` renders and uploads
  with the worker's own key. Parity path 4 is `scripts/parity/poppler.mjs`; CI runs it inside the worker
  image with `PARITY_REQUIRE_POPPLER=1` so a missing tool fails rather than skips.
- **Terminal handling** (DEC-059): `build_data_export` re-reads its request row and returns on a gone
  row / a foreign member / `member_not_found` / `request_not_found` (recorded on the row, never
  rethrown); everything else still rethrows. `delete_org`, `expire_impersonation`,
  `anonymise_members` verified terminal by construction, unchanged. The content jobs return on a
  non-PDF object. `send_notification`'s `no context` throw is recorded as a post-launch item.
- **Post-launch list from the smoke test (2026-09-15, the owner's finds on production):** (1) **the mail templates print `{{startsAt}}` raw** (`2026-09-24T08:00:00+00:00` under «الموعد») — format in the worker's `mail/render.ts` in the org's time zone with the org's numerals, every template that carries a date (published, assigned, cancelled, waitlist, reminders); (2) ~~no screen links to SCR-045~~ — **done on PR #19** (DEC-064: every feature reachable); the member's `/me/certificates` still shows only issued ones by design; (3) ~~the org name displayed reversed~~ — restored on production by a scoped update (step 6); the two early posters carry the old string until regenerated; (4) the worker's startup line says «polling every 60 s» (it is 15 s); (5) rotate the database password and update Railway's `DATABASE_URL`; (5b) Railway's push-triggered deploys — confirm the trigger stays armed (it was not until the source was reconnected after PR #20); (6) rotate the Google client secret (it reached the transcript through editor selections); (7) `scripts/ci/roles.sql` as a non-superuser `postgres` (DEC-061); (8) `send_notification`'s missing-context branch returns (DEC-059); (9) **the certificate email carries the serial and a link only** — `REQ-CRT-006` wants the PNG preview inline and the PDF attached or linked per an org setting; the inline preview and an attach option are missing (`MSG-certificate_issued`, `worker/src/mail/`).
- **Post-launch list (from DEC-057, per the owner):** DEC-055 option A · the check-in budget ·
  `data_export_requests.storage_path` · the two unbound kit font ids (DEC-053) · STORY-NFR-005's load
  test · Sentry as the `AlertSink` transport · `send_notification` missing-context return ·
  photo WebP re-encoding (now a worker-side `cwebp`).

### Step 1 — gates on the branch

| Gate | Result |
|---|---|
| `npx tsc --noEmit` · `npm run lint` | clean · 0 errors (21 pre-existing warnings) |
| `npx vitest run` (unit + components) | 65 files / 588 passed (`worker-tasks` rewritten, `worker-pdf` + `platform-tasks` new, `storage-signing` retired) |
| `npm run db:reset` + `npm run test:rls` with `0077` | 61 files / 713 passed, 4 todo (`POL-materials.kind_pdf_only` new) |
| `npm run policy-diff` · `node scripts/traceability.mjs` | agree · 251 requirements, 68 entities, no gaps (matrix regenerated: +`POL-materials.kind_pdf_only`, the two content jobs on `REQ-DSG-016`) |
| the worker image (`worker/Dockerfile` with poppler) · probe · parity inside it | rebuilt on arm64 · `LISTEN/NOTIFY probe OK — 4 ms` · **28 of 28 with `PARITY_REQUIRE_POPPLER=1`, every face embedded, all seven slide-page crops 0.000% vs the goldens** |
| `npm run test:e2e:local tests/e2e/materials.spec.ts` | 6 passed (on the existing local build — the local runner does not rebuild; CI's `e2e` job rebuilt and passed on PR #16) |
| `npm run qa` / `npm run visual` | not needed — nothing under `(marketing)/**`, `public/**` or the locale layout changed |

### The final variable inventory (Launch day, 2026-09-15 — every row set; the «exists» column is the record)

**One Google OAuth client serves sign-in and the calendar** (the scope is asked at consent time): its ID and secret are
entered under three names — the Supabase provider, `GOOGLE_CALENDAR_*` on Vercel, `GOOGLE_OAUTH_*` on Railway — and
it carries both redirect URIs below.

Built from what the code **actually reads** (`grep process.env` over `src/`, `worker/src/`, `scripts/`, `ci.yml`),
not from the handoff's list. Two names the handoff carried are **read by nothing** and are recorded, not set.

**Vercel — project `kareem-marefa` (team `peninsula-pictures-projects`).** Set at Vercel → Project → Settings →
Environment Variables (or `vercel env add NAME production`, which the owner runs).

| Name | Env | Issued by · where | Public / secret | Read by | Exists? |
|---|---|---|---|---|---|
| `SUPABASE_URL` | Production, Preview | Supabase → Project Settings → Data API → *Project URL* (`https://qnwbgzsgkftqaixzuhdo.supabase.co`) | public | the frozen registration form, `src/lib/supabase.ts` | **exists** (Production, Preview) |
| `SUPABASE_PUBLISHABLE_KEY` | Production, Preview | Supabase → Project Settings → API Keys → *Publishable key* (`sb_publishable_…`) | public (publishable) | the frozen form | **exists** (Production, Preview) |
| `FORM_TOKEN_SECRET` | Production, Preview | generated: `openssl rand -hex 32` | **secret** | `src/lib/anti-spam.ts` | **exists** (Production, Preview) |
| `SITE_URL` | Production only | the domain: `https://kareem.pp.sa` (Preview falls back to Vercel's own URL) | public | the locale layout's `metadataBase` | **exists** (Production, Preview) |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | the same *Project URL* | public (inlined into the bundle) | `src/proxy.ts`, `src/lib/supabase/env.ts`, the browser client | **set** (step 4) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production, Preview | the same *Publishable key* | public (publishable, inlined) | same | **set** (step 4) |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Production, Preview | generated once, kept stable: `openssl rand -base64 32` (Next wants 32 bytes, base64) | **secret** | Next.js itself (`04` §9.2) | **exists** (Production and Preview, set 2 days before Launch) |
| `GOOGLE_CALENDAR_CLIENT_ID` | Production | Google Cloud → APIs & Services → Credentials → the OAuth 2.0 client (same client as the Supabase provider) → *Client ID* | public-ish (treat as config) | `src/app/api/calendar/oauth.ts` | **set** (step 4, after a misnaming was corrected) |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Production | the same client → *Client secret* | **secret** | same | **set** (step 4) |
| `VERCEL_PROJECT_PRODUCTION_URL` | system | Vercel sets it when *Automatically expose System Environment Variables* is on (Settings → Environment Variables) | public | the locale layout's fallback | check the toggle |
| `SENTRY_DSN` | — | **not used — the owner's decision (DEC-060): no Sentry, internal app** | — | nothing | never |
| `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | — | **never on Vercel** (invariant 7) | — | — | must be absent |

The calendar client's **authorised redirect URI** is `https://kareem.pp.sa/api/calendar/callback` (built from the request
URL in `api/calendar/connect/route.ts`); the Supabase provider's is `https://qnwbgzsgkftqaixzuhdo.supabase.co/auth/v1/callback`.
Both go on the same Google OAuth client.

**Railway — one service from `worker/Dockerfile`.** Set at Railway → the service → Variables (raw editor takes
`NAME=value` lines; the owner pastes, this session never sees a value).

| Name | Value / issued by · where | Public / secret | Read by | Exists? |
|---|---|---|---|---|
| `DATABASE_URL` | Supabase → *Connect* (top bar) → **Session pooler**, port **5432**: `postgresql://postgres.qnwbgzsgkftqaixzuhdo:<db-password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres` (Railway is IPv4; the direct connection is IPv6-only without the add-on; **never** the transaction pooler on 6543 — the boot probe refuses it) | **secret** | `worker/src/index.ts`, the probe | **set** (step 5) |
| `SUPABASE_URL` | the *Project URL* | public | `worker/src/content/storage.ts`, `platform/storage.ts` | **set** (step 5) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → *Secret keys* → create one (`sb_secret_…`); the legacy `service_role` JWT under *Legacy API keys* is the fallback if Storage answers 401 at step 5 | **secret** | the two storage helpers (Bearer + `apikey`) | **set** (step 5) |
| `PUBLIC_ORIGIN` | `https://kareem.pp.sa` | public | `issue_certificates`, `regenerate_poster` (the QR targets) | **set** (step 5) |
| `MAIL_TRANSPORT` | `resend` — the only value that reaches a provider (DEC-046) | public | `worker/src/mail/transport.ts` | **set** (step 6) |
| `RESEND_API_KEY` | Resend → API Keys → *Create API key* (sending access, restricted to `peninsulapictures.dev`) | **secret** | `worker/src/mail/resend.ts` | **set** (step 6) |
| `MAIL_FROM_ADDRESS` | **`kareem-notifications@peninsulapictures.dev`** (DEC-063 — the owner's verified Resend domain; the code's default `no-reply@kareem.pp.sa` is not verified) | public | `fromAddress()` | **set** (step 6) |
| `GOOGLE_OAUTH_CLIENT_ID` | the same Google client's *Client ID* (the worker refreshes calendar tokens with it) | config | `worker/src/calendar/index.ts` | **set** (step 5) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | the same client's *Client secret* | **secret** | same | **set** (step 5) |
| `CALENDAR_API` | **leave unset** (`stub` would silence the real API) | — | same | absent |
| `CHROME_NO_SANDBOX` | `1` — the container runs as `node` without user namespaces (CI sets the same) | public | `worker/src/render/chromium.ts` | **set** (step 5) |
| `CHROME_PATH`, `NODE_ENV` | baked into the image (`/usr/bin/chromium`, `production`) | — | — | in the image |
| `RESEND_WEBHOOK_SECRET` | **not read** — no `/api/webhooks/resend` route exists in the code (`08` §3.6 planned it); post-launch | — | nothing | do not set |
| `SENTRY_DSN` | **not used** (DEC-060) | — | nothing | never |
| Railway service settings | `RAILWAY_DOCKERFILE_PATH=worker/Dockerfile` (set by CLI), root directory `/`, region **Singapore** only, no public networking, restart on failure ×10, sleeping off; the GitHub source `ebnmajed/kareem-marefa` on `main` (re-armed after PR #20 — see the post-launch list) | — | — | **set** (step 5) |

**GitHub Actions secrets:** **none, confirmed** — `gh secret list` printed «no secrets found»; `ci.yml` references no `secrets.*` (DEC-025).

**Supabase dashboard inputs (not variables):** Auth → Providers → Google (client ID + secret, the same client);
Auth → URL Configuration → Site URL `https://kareem.pp.sa`, redirect allow-list `https://kareem.pp.sa/api/auth/callback`
and `https://*-peninsula-pictures-projects.vercel.app/api/auth/callback`; Auth → Hooks → *Customize Access Token*
→ `public.custom_access_token_hook`, *Before User Created* → `public.before_user_created_hook`; Auth → Settings →
JWT expiry **900**; Auth → JWT keys → asymmetric signing (DEC-036). Each is its own gated step in step 3.

**Two files changed on disk during the session that are not this branch's:** `.env.example`
(`SITE_URL="https://kareem.pp.sa"`) and `supabase/config.toml` (local `site_url`, a callback redirect,
`[auth.external.google]` reading `env(GOOGLE_OAUTH_CLIENT_ID/SECRET)`, `skip_nonce_check`). Neither
holds a secret value; both look like the owner's local preparation and are **left uncommitted** for the
owner to decide.

## Wave 4 (M8 · M7-branding) — COMPLETE on `wave-4/m8-branding` (PR #15, the owner merges)

**Both demonstrables hold locally, run against the real images, not reasoned about** (`scratchpad/wave4-demo.mjs`, gitignored; DEC-057 decision 3):

- **M8** — `create_org()` as a platform admin through PostgREST → the new org reads all eight A27 baseline templates → the platform admin selects from `orgs`, `members`, `sessions`, `points_ledger`, `materials`, `comments`, `audit_log`, `brand_kits` and gets **zero rows** → `start_impersonation()` writes `impersonation.started` into **that org's own** `audit_log` → `end_impersonation()` → `my_impersonation()` answers none. `tests/e2e/platform-console.spec.ts` (16/16) walks SCR-080 … 085 as a super admin across two seeded orgs on the real build with an axe scan on every console screen; the ★ RLS sweep proves every `org_id` table returns nothing or `42501` to a platform admin; **every one of `11` §3.2's eight alerts fires in the drill** (`tests/rls/platform-alerts.test.ts`, each condition alone, then cleared, then all eight).
- **M7-branding** — `publish_session()` → 12 of 12 variants ready with Tier A (one fingerprint) → `save_brand_kit()` → `brand_kit()` returns the override → **12 variants re-rendered under new fingerprints** by the worker image, the poster carrying the org's colours; the theme layer proven by `tests/e2e/branding.spec.ts` (the page's `<h1>` takes the saved colour after a reload), the mail by `send_notification`'s `brand_kit()` read; the parity goldens unchanged all wave (28 of 28 on all four paths, the converter image running).

### Shipped

Migrations `0067` (fonts read for `service_role`), `0068` (`brand_kits`), `0069` (the M8 schema), `0070` (platform console reads), `0071` (re-render on a brand save), `0072` (the platform library, managed), `0073` (retention, anonymisation, the member's export), `0074` (enum types), `0075` (the eight alerts), `0076` (job health counts due jobs only). Screens SCR-005, SCR-059, SCR-080 … 085, the member's privacy screen. Seven jobs. The four brand consumers wired at request time. The closing pass: axe on fourteen screens, Lighthouse on six, ICU's `#` banned from every plural, keyboard access on every table scroller, the shell bug that hid the console (DEC-057).

### Definition of done on the final commits

| Gate | Result |
|---|---|
| `npx tsc --noEmit` · `npm run lint` | clean · 0 errors (1 pre-existing warning) |
| `npm test` | 64 files / 581 passed |
| `npm run db:reset` + `npm run test:rls` | 61 files / 711 passed, 4 todo (the generated sweep over 68 entities, `retention_periods` and `platform_audit_log` by refusal) |
| `npm run policy-diff` · `node scripts/traceability.mjs` | agree · 251 requirements, 68 entities, no gaps |
| `npm run worker:build` · the worker image | clean · rebuilt, LISTEN/NOTIFY probe OK, seven tasks registered, ran the demonstrables |
| `npm run test:e2e:local` | `platform-console` 16 · `privacy` 10 · `legal` 12 · `branding` 7 (+1 skipped by design) · `a11y` 6 · `certificates` 8 · `second-org` 6, on both projects |
| `npm run qa` · `npm run visual compare m0-final wave-4-final` | 44/44 · 0.000% on all six pairs |
| `npm run parity` with `CONVERTER_URL` | **28 of 28**, 7 cases × 4 paths, goldens unchanged |
| `npm run test:e2e:unconfigured` · `tests/e2e/budgets.spec.ts` | 16 passed / 280 skipped / 0 failed · no regression against the quiet median-of-three baseline; the absolute misses are DEC-055's advisories |
| 390 px RTL captures | SCR-059 and the eight platform/legal/privacy screens under `.qa-shots/rtl/`, looked at by their owners; three real fixes came out of them (DEC-057) |



**Confirmed by the owner (DEC-052) and spawned.** The ownership is `TEAM.md` §1, `CLAUDE.md`
§ Agent team and `.claude/agents/{platform,branding}.md`. The owner's amendment: the A27 baseline
ships seeded as platform-owned templates for every org from creation (`0061` already does; `platform`
proves it); `JOB-delete_org` is in `11` §2.7; `ENT-brand_kits` is in `02` §4.13. DEC-051 holds the
pre-spawn work and the two standing decisions (serial renders until measured; the repository public
until Launch).

### Done before spawn (DEC-051)

1. **The proxy gates every public platform route.** `isPublicPlatformPath()` (`/verify/**`,
   `/legal/**`) and `isUnconfiguredGatedPath()` in `src/lib/auth/next-path.ts`; `proxy.ts` 404s
   all of it while unconfigured and gives the public routes the nonce, never the sign-in redirect.
   `tests/e2e/unconfigured.spec.ts` asserts `/ar/verify/…` and `/ar/legal/privacy`.
2. **`0067` grants `service_role` a read on `public.fonts`** — read only; `record_font()` stays the
   one write door. `POL-fonts.select.service_role` in `tests/rls/designer-fonts.test.ts`; `03` §5.9
   and §8.2 carry it; `npm run policy-diff` agrees.
3. **The two certificate captures were retaken** on a fresh build and looked at: the 24-character
   code wraps inside its card on SCR-023; SCR-045 is clean; nothing past 390 px on the phone project.
4. **The full history was scanned for secrets** (8 refs, 335 commits, every added line and path):
   nothing. The 45 pattern hits are local `postgres:postgres` URLs, CI container URLs and test
   placeholders; the only env-shaped file ever committed is `.env.example`. Detail in DEC-051.
5. **No session changes repository, billing, org or GitHub settings** — `CLAUDE.md` § Git in a
   shared tree, `.claude/settings.json` (19 new deny entries), TEAM.md §4 constraint 6, both agent
   definitions.

### Verification on the branch (pre-spawn)

- `npx tsc --noEmit` clean · `npm run lint` 0 errors (17 pre-existing warnings, none in the files
  touched) · `npm test` 58 files / 483 passed · `npm run policy-diff` agrees ·
  `npm run db:reset` + `npm run test:rls` 55 files / 627 passed with `0067` ·
  `tests/e2e/certificates.spec.ts` 8/8 on the fresh build.
- `npm run qa` 44/44 · `npm run visual compare m0-final wave-4-pre` 0.000% on all six pairs ·
  `npm run test:e2e:unconfigured` 16 passed (the two new public paths included) · `.next` rebuilt
  configured afterwards · `node scripts/traceability.mjs` no gaps.
- Commits: `c1834c6` (proxy), `6092a69` (`0067`), `62c0f66` (settings rule), then the plan documents.

### The wave-4 plan, in one paragraph (TEAM.md §1 has the contracts)

`platform` (opus) takes M8 minus the two cross-cutting closing stories: the super-admin console
with no data plane (`assert_platform_admin()` re-reads the row; no policy ever names
`platform_admins`), break-glass impersonation that lands in the org's own audit log, the managed
platform template library (SCR-083 — promote an org's published version; authoring stays in an
org's editor), retention / anonymisation / the nightly storage-prefix assertion / the member's
own export / org deletion (six jobs, the `delete_org` job new), the legal pages. It publishes
`<ImpersonationBanner />`. `branding` (sonnet) takes M7's deferred half: `brand_kits` (a new entity
— `02` is frozen, a DEC at sync 1), `getBrandKit()` and `public.brand_kit()` with the platform
default as the identity override so the goldens do not move, SCR-059 with the raster logo upload
and the contrast check, the `export_render_context()` seam. The lead wires the banner, the theme
layer, the render and mail seams, the six registrations; NFR-004/005 are the lead's closing pass
after both land. Open for the owner: the SCR-083 default (managed, not authored) and the `delete_org` job.

### Sync log

| Sync | What was promoted / wired | Gates |
|---|---|---|
| 0 (2026-09-14) | DEC-052 logged (`8a3cdc4`); `platform` and `branding` spawned — first task: the first proposed file and `docs/plan/notes/<name>.md` | the pre-spawn gates above |
| 1 (2026-09-14) | `0068_brand_kits` (branding, DEC-053) and `0069_m8_schema` (platform, DEC-054) promoted; `03` +25 rows (§8.2) +3 (§5); `fixture-m7.ts` (a kit and an export request per org); the four brand consumers wired — request-time `brandBindings()` in both worker composition paths and the designer preview, `brand_kit()` in the mail sender, the nonced `.brand-org` theme layer in the shell; `JOB-evaluate_alerts` and the three M8 entities into `11`/`02`; DEC-052's impersonation readers widened to staff per `03` | tsc clean · lint 0 errors · unit 502 · RLS 57 files / 674 passed · policy-diff agrees · traceability 68 entities no gaps · parity 21/28 local (converter path at wave end) · e2e shell smoke 19/19; auth + second-org + designer e2e on the new hook: see sync 2 |
| 2 (2026-09-14) | `0070_platform_console_reads` (platform) and `0071_regenerate_posters_on_save` (branding) promoted, `03` +4; DEC-055 — break-glass browses nothing this wave (option C, A next wave), the two closing-pass harnesses (`tests/e2e/a11y.spec.ts`, `tests/e2e/budgets.spec.ts` + baseline), the reset script probes Auth through Kong; axe and Lighthouse added (lock regenerated with CI's npm — 434 transitive versions moved within their ranges, CI green on it); the audit and attendance table scrollers gained keyboard access | auth + second-org + designer e2e on the `0069` hook 34/34 · RLS 58 files / 683 passed with `0071` · policy-diff agrees · traceability no gaps · CI green on sync 1 · a11y 6/6 (13 screens, one serious finding fixed) · budgets: every `/app` screen 164 KB gz JS, four absolute misses recorded in DEC-055, the gate is no-regression (median of three) · platform-console spec: 1 case red, its owner is on it · branding spec: pending its owner's fix (Kong 502 cost one run) |
| 3 (2026-09-14) | `0072_platform_library` and `0073_retention_and_privacy` (platform) promoted, `03` +10; the six M8 tasks and three crontab lines registered in `worker/src/index.ts`; DEC-056; the closing pass's numerals fix — five plurals in `checkin`/`rsvp`/`scoring` printed ICU's `#`, now `{value}` per the org setting with a catalogue-wide test; `branding` shut down, track complete (SCR-059 4/4, capture looked at, `0071` re-render on save) | RLS 60 files / 699 passed with `0073` · policy-diff agrees · tsc clean · worker builds · unit+components 566 · `legal` 12/12 · a11y 6/6 · `platform-console` :215 red and `privacy` 2 red (its owner, the route-announcer trap) · budgets and parity at the wave-end gate |
| 4 (2026-09-14) | `0074_enum_types` and `0075_alerts` (platform — the renames landed in its `b0bd0f8` by a missing pathspec, byte-identical, recorded not rewritten), `03` +4; `evaluate_alerts` registered every minute; the banner on `/no-access`; the shell bell for a member alone (DEC-057 decision 1); `pollInterval` 15 s after measuring the serial render queue (decision 2); the two demonstrables run on the real images; DEC-057; the Launch handoff written; then `platform`'s last two finds after the rebuild — `0076_job_health_due` (a negative queue age on SCR-084: pending means due) and the alert drill arranging its own queue — promoted; `platform` shut down | the full gate in the table above; `test:e2e:unconfigured` 16 passed / 280 skipped / 0 failed (the legal spec now waits for a configured build) · budgets on the quiet median-of-three baseline: 1 passed, no regression, five absolute misses recorded as advisories (DEC-055) |

### Next for the lead

1. Sync 1 early: promote both schemas as `0068`/`0069` so the sweep covers `impersonation_sessions`
   and `brand_kits` within hours; wire `<ImpersonationBanner />` and the `@theme` layer.
2. The render and mail seams once `branding` hands over `export_render_context()` and `brand_kit()`.
3. The six task registrations and crontab lines from `platform`.
4. NFR-004/005 after both tracks land; the wave PR is already open as draft #15.

## Wave 3 (M6 · M7-console) — COMPLETE on `wave-3/m6-m7` (PR #14, the owner merges)

**Both demonstrables hold locally, run against the real images, not reasoned about:**

- **M6** — `scratchpad/m6-demo.sh` (sync 12): `publish_session()` as an admin → **every A12 variant** (12 artifacts: master, square, story, landscape, og × png + webp, A4 and A3 PDF) ready with Tier A; `detach_poster()` → detached/customised and a later title change marks the poster **stale with nothing re-rendered**; a checked-in attendee and the completion edge → attendance and presenter certificates with **consecutive serials from the locked counter** (`MDM-2026-000001/2`, `next=3`), six certificate artifacts (landscape PNG, landscape and portrait PDF each) ready with Tier A; `verify_certificate(code)` as `anon` → the A13 fields, **`verify_certificate(serial)` → not found**. The parity suite: **28 of 28** with the converter, 21 loudly-skipped without. **Owner's manual check at Launch:** scan both QRs on paper at print size — nothing here has ever decoded one of its symbols (`notes/designer.md` §3), beside notify's open-the-ICS-in-Outlook.
- **M7** — `tests/e2e/second-org.spec.ts`: ★ a second org stands up with its own admins, members and sessions; each admin walks the dashboard, members, sessions, categories, the audit log, browse and pulls the members export and **sees nothing of the other**; a member of A opening B's session by id gets the not-found boundary; the RLS isolation sweep stays the per-table proof. The moderator scope is a policy (`REQ-ADM-020`): the moderator's `/admin/sessions` view carries no scheduling control because the function that lists them is never called on that path, and the RLS cases call the scheduling and scoring RPCs as a moderator and get `42501`.

### Shipped

Migrations **`0055`–`0066`** (12; `supabase/proposed/` empty) · SCR-011 (browse, never built in wave 1), the admin shell `admin/layout.tsx`, SCR-040, 042 (moderator view), 044 + CSV, 047, 048, 049, 050/051/052, 055, 056, 057, 061, 062, 063, 045, 006 (`/verify/[code]`), 023 (`/app/me/certificates`), the RTL date-time picker on SCR-043, the member picker on SCR-053, `08`'s fourth reminder message, the four designer slots wired by the lead · DAL modules `admin-dashboard`, `admin-lists`, `admin-members`, `admin-moderation`, `admin-exports`, `admin-audit`, `admin-settings`, `designer`, `templates`, `posters`, `certificates`, `fonts` · worker tasks `render_variant`, `regenerate_poster`, `materialise_font`, `issue_certificates` · `@kareem/storage-paths` · the font set at 21 faces / 12 TrueType (Reem Kufi, Amiri) · the worker image with Chromium, the runtime and the fonts by hash, the parity harness running inside it in CI with the converter beside it · message namespaces `browse`, `designer`, `templates`, `certificates` (Arabic first) · **DEC-048, DEC-049, DEC-050**.

### Definition of done on `8e2c4ad`

| Check | Result |
|---|---|
| `npm run db:reset` | ✅ `0001`–`0066` (with the queue schema reinstalled) |
| `npm run test:rls` | ✅ **626 passed / 4 todo, 55 files**, the sweep over every table incl. the twelve wave-3 ones |
| `npm run policy-diff` | ✅ |
| `node scripts/traceability.mjs` | ✅ 251 / 64 / 112, no gaps, matrix current |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ 0 errors (17 warnings, all pre-existing `eslint-disable` directives) |
| `npm test` (unit + components) | ✅ **481 passed, 58 files** |
| `npm run worker:build` · `fonts:check` · `converter:test` | ✅ · ✅ **21 faces / 12 TTF**, build matches · ✅ 16/16 on the rebuilt image |
| `npm run parity` with the converter | ✅ **28 of 28 assertions, 7 cases × 4 paths**; in the worker image without it: 21 of 28, skipped loudly |
| `npm run build` | ✅ |
| `npm run qa` | ✅ **44/44** |
| `npm run visual compare m0-final wave3-final` | ✅ **0.000%** on all six captures |
| `npm run test:e2e:local` | ✅ **218 passed / 23 skipped by design / 1 flaky** (two workers, both profiles; every wave-1, 2 and 3 spec, the three demonstrables and `second-org` included) — the one failure is `event-comments` "a reply-less comment vanishes", the refresh race `comment-list.tsx` documents; **6/6 alone**. The gate run before the last four fixes was 207 / 22 / 4 |
| `npm run test:e2e:unconfigured` | ✅ 16 passed, 226 skipped by design — **run last: it replaces `.next`; rebuild after** |
| CI on PR #14 | ✅ **all 11 jobs green on `8e2c4ad`** (run 34868589043, the gate commit; the worker job ran 28/28 with the converter beside the image); the STATUS commit after it is docs only |
| 390 px RTL captures, looked at | ✅ console 12 · designer 13 (`.qa-shots/rtl/`); two to retake (handoff item 9) |

### Handoff for the wave-4 lead (`platform` M8 · `branding` M7-branding, TEAM.md §1)

1. **Read** `DECISIONS.md` DEC-048 … DEC-050, `TEAM.md` §3 and §5 (grown this wave), and the two handoff sections: `docs/plan/notes/designer.md` §2–§3 and `console.md` "Bug-fix pass" onward.
2. **The brand kit is a token contract, not a screen.** `designer` resolves `{{brand.*}}` from the platform defaults (`packages/designer-runtime/src/brand.ts`); `branding` supplies the org override through `src/lib/brand/**` and SCR-059 — the four consumers of `06` §8.3 (`@theme`, the org kit, templates, email). The baseline library (`0061`) binds by token, never hex; a template version with a hex literal is refused by `0055`'s guard.
3. **Render concurrency is 1** (a named graphile-worker queue is serial; `worker/src/index.ts`'s comment). Two is two queue names chosen by hash in `request_render()`, a `11` §1.4 decision for the wave that measures a need.
4. **`public.fonts` is revoked from `service_role`**; the worker reads it as the owner. A job that runs as `service_role` would need the grant.
5. **Widen `proxy.ts`'s `isPlatformPath`** to public platform routes: `/verify/[code]` served a 500 on the unconfigured live site until `designer` made the page answer `notFound()` itself; the predicate is the honest fix and it is the lead's file.
6. **The M2 e2e drives a picker now** (`sessions-screens.spec.ts`), and the 390 px review is phone-only everywhere with the scroller-aware helper; copy that helper, never `scrollWidth - clientWidth`.
7. **Launch inputs** (unchanged from wave 2, plus): the Google OAuth client and its secret on Vercel; the Resend account; the worker host with a session-mode connection, `CHROME_PATH` is in the image, `CONVERTER_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; **`@kareem/fonts` is a root dependency** so Next's tracer ships the package; the QR scan and the ICS-in-Outlook checks are the owner's.
8. **The fixtures** `tests/rls/fixture-m6.ts` seed every M6 table on both orgs; `rpcs.test.ts`'s `no_match` scopes its audit count to the transaction — do the same for any global emptiness check.
9. **Two captures to retake** after the next build: `scr-023-certificates` and `scr-045-certificates` show the markup before `ca10bd8`'s break-all fix (the fix is in the tree and the build; the shots were taken before it).
10. `.next` on disk is the wave-final build; `npm run db:reset` (with the reset lock, teammates down) before any RLS run.

### The wave as it ran

## Wave 3 (M6 · M7-console) — the sync log on `wave-3/m6-m7`

**Owner's decisions (2026-09-14, DEC-048):** the designer engine stays DOM/SVG with headless-Chromium
exports as the parity harness proves (D66, A28); the console half that needs templates waits for
wave 4. **The lead's assignments:** SCR-011 (browse, never built in wave 1) is `console`'s first
story; `console` inherits the seven carved-out admin screens and three carried-over items; the M6
image work went first; the M5 pipeline ran once for real before M6 builds on it.

#### Wave 3 — PREPARED (kept as written at the start)

**Done by the lead before anyone was spawned:**

| # | Task | Commit / proof |
|---|---|---|
| 1 | **`@kareem/storage-paths`** — the wave-2 port (`worker/src/content/paths.ts`) and its parity test are gone; the app imports through `src/lib/storage/paths.ts` (keeps `server-only`), the worker directly; the M6 shapes in `src/designer.ts` are the one package file `designer` edits; workspace packages build from a root `prepare` (npm runs a linked workspace's `prepare` inside `npm ci --workspace` even under `--ignore-scripts`) | `7c5e280` · lock regenerated in Docker (**twice** — a local `npm install` after the first run rewrote it with npm 11 and dropped the nested `@swc/helpers`, the trap CLAUDE.md names) · tsc ✅ · unit **327 passed / 45 files** · lint 0 errors · `worker:build` ✅ |
| 2 | **Worker image with Chromium, the runtime and the font set** — Debian `chromium` at `CHROME_PATH`, `puppeteer-core`, `@kareem/designer-runtime`, `packages/fonts` installed through the converter's hash-verified step | `7c5e280` · 1.42 GB · probe OK in-image · `fc-list` shows IBM Plex Sans + Arabic (Debian's `chromium` also pulls in DejaVu — the renderer inlines faces by hash, so nothing falls through to it) |
| 3 | **The parity harness runs inside the image**, locally and in CI's `worker` job | `a58b6c5` · **7 cases, Tier A identical, Tier B 0.4–2.8% (advisory cross-platform, DEC-028)** — `CHROME_NO_SANDBOX` inside the container only |
| 4 | **The M5 pipeline for real** — `kareem-converter` + `kareem-worker` on the local Supabase network with `CONVERTER_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; `converter/fixtures/{plex-arabic,cairo-missing}.pptx` uploaded to `materials` and enqueued through `public.enqueue_job()` | both `render_status = ready`, one `material_pages` row each, `font_substitution_warning = 'Cairo'` on the second (`REQ-MAT-011`); nothing in M5 changed. The 143 orphan jobs a previous reset left in `graphile_worker._private_jobs` (notifications for members that no longer exist) were deleted locally — a reset does not clear the queue |
| 5 | **DEC-048**, `TEAM.md` §1 (wave-3 rows + contracts, wave-4 draft), `CLAUDE.md` § Agent team, `.claude/agents/{designer,console}.md` | `5cfef70` |
| 6 | Pre-spawn gate: `npm run db:reset` ✅ `0001`–`0054` · `npm run test:rls` — see below · `policy-diff` · traceability | `db:reset` ✅ · `test:rls` ✅ **495 passed / 4 todo, 45 files** · policy-diff ✅ · traceability ✅ (matrix regenerated) |
| 7 | Pushed; **draft PR #14** at the first push; `designer` (opus) and `console` (sonnet) spawned with their first tasks (plan in `docs/plan/notes/<name>.md`, then `designer`'s M6 schema as proposed SQL and `console`'s SCR-011) | — |

**Stale notes found while preparing (recorded in DEC-048):** `notes/scoring.md`'s "four evaluators are NOT scheduled" no longer holds — all four are registered in `worker/src/index.ts`; the three `TODO(notify, M3)` comments stay.

### Sync log

| Sync | Promoted | Gates |
|---|---|---|
| 1 (2026-09-14) | `0055_m6_schema` (`designer`, unchanged — nine tables of `02` §4.12–§4.13, RLS + grants, `allocate_serial()` on a locked counter row, `verify_certificate()` for `anon`, two structural triggers: no hex literal or unknown layer kind in a template version, no touching a locked region) · `tests/rls/fixture-m6.ts` · `fonts` as the fifth no-`org_id` table (**DEC-049**, `02` §7 amended, CLAUDE.md invariant 5 now says five) · `03` §8.2 +16 rows · `designer`'s `setup()` clears the nine M6 tables (14 of its cases counted rows or allocated serials against the fixture's world) · the shell links to `/app/sessions` · `console` bundles 1–2 in: SCR-011 browse, the admin shell `admin/layout.tsx` with the staff gate, SCR-040 dashboard, SCR-047/048 categories and companies | `db:reset` ✅ 0001–0055 · `test:rls` ✅ **522 passed / 4 todo, 46 files** (after the setup fix; the sweep covers the nine new tables) · policy-diff ✅ (`certificate_serial_counters`: RLS on, no policy, by design) · traceability ✅ · `npm run build` ✅ (once `designer`'s in-progress `bindings.ts` compiled — the root build compiles the runtime first, so a red working tree there blocks every sync build) · `console`'s three new specs against the fresh build: **16 passed / 6 failed** — two browse cases (chip locator by uuid, bookmark count) and the 390 px "never sideways" cases on the dashboard and lists, which measure `scrollWidth - clientWidth` the way TEAM.md §5 warns against; handed back to `console` with the log |
| 2 (2026-09-14) | `0056_admin_members` (`console`, unchanged — `admin_list_members()`, the admin's only door to a member's email; `03` §8.2 +3 rows) · `0057_template_drafts` (`designer`, unchanged — one working draft per template, one default per family; no new policy) · **the font set grows to 21 faces / 12 TTF**: Reem Kufi 400–700 and Amiri 400/700 (Arabic + Latin) declared in `src/lib/fonts.ts` with `preload: false` and applied to no route, extracted by hash, TTFs derived — Reem Kufi and IBM Plex Sans (Latin) are **variable** faces, so `fonts:derive` now instances a variable face at the manifest weight (`fontTools.varLib.instancer`) before merging subsets; fontTools' Merger has no rule for `VarStore` and LibreOffice uses only named instances. Consequence: the Plex TTF hashes changed (Plex Sans is now three static instances, not one variable file; Plex Arabic re-merged), the woff2 faces the editor and Chromium load did not · `@kareem/fonts` is a root dependency (Next's tracer cannot see `src/lib/dal/fonts.ts`'s dynamic read) · `scripts/lockfile.mjs` passes `--ignore-scripts` (the root `prepare` ran a teammate's mid-edit runtime inside the container) · `console` bundle 3 in: SCR-049 members and roles · `designer` bundle 1 in: DSG-003 (the runtime's validator, bindings, `{{brand.*}}`, SCR-057 with the autosave Route Handler), DSG-004 (SCR-055/056, the two libraries, locked regions) | `db:reset` ✅ 0001–0057 · `test:rls` ✅ **547 passed / 4 todo, 47 files** · policy-diff ✅ · traceability ✅ · `npm run build` ✅ · `fonts:check` ✅ 21 faces / 12 TTF, build matches · converter image rebuilt on the set, `converter:test` ✅ 16/16 (`fc-list` shows Plex, Reem Kufi, Amiri) · parity: **not run at this sync** — the runtime's working tree was mid-edit (`./autofit.js` not yet written), reruns at sync 3 · `console`'s and `designer`'s e2e for the new screens: handed to them against the fresh build, numbers due with their next reports |
| 3 (2026-09-14) | `0058_admin_export_audit` (`console`, unchanged — `write_admin_export_audit()` behind `assert_fresh_admin()`, generic over the export type; `03` §8.2 +3 rows) · `0059_moderation` (`console`, unchanged — `remove_photo()` hides, resolves the takedown and the report and reverses points in one transaction; a staff comment removal now writes its audit row; `comments.removal_reason` and `photos.removal_reason`, additive — **`02` amendment to record at wave end**; `03` §8.2 +5 rows) · the lead moved the 390 px check in `console`'s six specs to the layout-viewport measurement (TEAM.md §5) so a failure names the element · `console` bundles 4–5 in: SCR-044 attendance with its audited CSV, the moderator's `/admin/sessions` view (scheduling absent, not hidden), SCR-050/051/052 with the takedown queue distinct from the report queue | `db:reset` ✅ 0001–0059 · `test:rls` **564 passed / 1 failed / 4 todo, 50 files** — the one red case is `designer`'s uncommitted `designer-render.test.ts` (DSG-006 in progress; told to `describe.skip` until green), the sweep and every `console` case pass · policy-diff ✅ · traceability ✅ · `npm run build` ✅ · `console`'s six specs against the fresh build: **31 passed / 11 failed** — the admin sub-nav overflows 390 px (five links at x = −50 … −201, pushing the shell's sign-out to −12), a role change that never applies, the moderator's path to attendance, and two browse locators/counts; handed to `console` with the offender names |
| 4 (2026-09-14) | `0060_render_pipeline` (`designer`, unchanged — `request_render()` for admins, keyed `doc:{id}:{preset}:{format}` on queue `render`, re-requesting an unchanged fingerprint re-renders nothing; `export_render_context()` and `record_export_artifact()` for `service_role` only, and `service_role`'s direct select on `export_artifacts` is refused too; `retry_export_artifact()`; `03` §8.2 +4 rows) · `worker/src/index.ts` registers `render_variant` (no crontab line; enqueued, never scheduled) — **renders are serial today**: a graphile-worker named queue runs one job at a time, so `11` §1.4's concurrency of 2 needs two queue names chosen by hash in the SQL, not a second process; recorded for the closing decision · `designer` bundle 2 so far: DSG-005 (presets, safe areas, auto-fit), DSG-006 (`worker/src/render/{chromium,fonts,variant}.ts`, the task, Tier A on every render) · the wait-for-runners loop no longer matches its own shell (`pgrep -f "[n]ode_modules/.bin/vitest"`) — every earlier gate had waited the full timeout on itself | `db:reset` ✅ 0001–0060 · `test:rls` ✅ **565 passed / 4 todo, 50 files** · policy-diff ✅ · traceability ✅ · `worker:build` ✅ · **CI is down for the owner's account, not the code:** every job of run 34852248241 (push `a194e22`) failed at "Set up job" with *"The job was not started because recent account payments have failed or your spending limit needs to be increased"*. The last green run is `e182738` (11/11). Nothing on the branch can be proven by CI until GitHub billing is fixed on the owner's side; the local gates stand in until then and every push is re-run once it is |
| 5 (2026-09-14) | `0061_baseline_library` (`designer`, unchanged — eight platform templates seeded idempotently; no policy, no grant; `tests/unit/designer-library.test.ts` parses the JSON back out of the SQL and deep-equals it against the runtime library so the copy cannot drift) · the DSG-007 signature golden reviewed and committed (`eb4f0d0`: no Tier B image moved; the probe is the runtime's own `tierASignatureBatch`; the fingerprint hashes the whole manifest; poster-PDF and certificate-PDF paths added) · path 4 (the converter's page images) against the real converter: **not green yet** — three crops come back blank and the guard refuses to write goldens; handed back to `designer`; `scripts/parity/converter.mjs` gains `PARITY_CALLBACK_HOST` for a Docker converter on a Mac, CI wiring written and uncommitted until 28 of 28 hold locally · `designer` bundle 2 in: DSG-005, 006, 009, 007, 011 (the QR encoder found two bugs in itself by specification properties — a reversed generator polynomial and a cleared dark module — **★ owner check for the Launch list: scan both QRs with a real phone on paper at print size; nothing here has ever decoded one**) · `console` since sync 3: SCR-063 settings, the RTL date-time picker on SCR-043, the member picker on SCR-053 (reports pending) · **CI is back**: the owner made the repository public; run 34853701147 on `eb4f0d0` is **11/11 green** | `db:reset` ✅ 0001–0061 · `test:rls` 564 passed / 1 failed on the chain (`auth-hook` "fails open" — a collision with a teammate's concurrent runner; **10/10 alone**) · policy-diff ✅ · traceability ✅ · `npm run build` ✅ 17:22 · `worker:build` ✅ · the worker image rebuilt with `render_variant`, probe OK |
| 6 (2026-09-14) | `0062_reminder_generic_message` (`console`, unchanged — `reminder_message_key()` keeps a fixed message within ±20% of its offset and falls through to `MSG-reminder_generic`; the matrix gains the key; `03` §8.2 +3 rows) · the lead adds the two pieces outside `console`'s globs from its draft (the Arabic email template, the inbox phrase in both `notifications.json`), the `08` §1.2 and §3.2 rows (settled doc, recorded in the closing decision), moves the two notify cases that encoded "nearest, always" to the new rule, and makes `tests/unit/mail-render.test.ts` read the LAST `notification_matrix()` definition on disk (0026's had frozen the count at 38) · `tests/e2e/sessions-screens.spec.ts` drives `console`'s RTL date-time picker on SCR-043 · `tests/unit/designer-library.test.ts`'s `require()` replaced (CI's lint job had failed on it) · **`console` reports M7-console complete** (SCR-011, 040, 042 moderator view, 044 + CSV, 047/048, 049, 050/051/052, 061, 062, 063, the picker, the member picker, the fourth reminder message; ~40 commits); every proposed folder is empty | `db:reset` ✅ 0001–0062 · `test:rls` 567 passed / 2 failed on the chain — both the notify cases above, **50/50 after the update** · policy-diff ✅ · traceability ✅ · `npm run build` ✅ · **every wave-3 spec against the fresh build: 61 passed / 17 failed** — twelve are `console`'s (every admin page overflows 390 px by exactly 12 px through its sub-nav, which also fails `designer`'s SCR-055 capture and the M2 demonstrable's venues step; a role change that never applies; the moderator's path to attendance; two browse locators/counts) and one is `designer`'s (the locked-region notice on the phone project); both have their lists |
| 7 (2026-09-14) | `0063_poster_pipeline` (`designer`, **promoted with one change**: both trigger functions — `sessions_poster_hook()` and `session_presenters_poster_hook()` — are `security definer`, because they fire on any writer's update, a presenter's own title edit or decline included, and call `enqueue_job()`, which no client role may execute (0025); as invoker functions they turned three wave-1 cases into "permission denied for function enqueue_job" — the same reason 0034's `rsvps_notify()` is a definer; `03` §8.2 +6 rows) · **the lead wires the slots**: `SessionPoster` and `CertificateModeBadge` as item 1 of the event page, `PosterPicker` in its own «الملصق» section on SCR-043 (`admin.schedule.poster`) · `designer` since sync 5: DSG-001/002 (posters three ways, live/detached, both slots real), DSG-010 (brand tokens, undo/redo, logical snapping), DSG-008's runtime half, and **a shipped-then-caught Arabic font bug**: a `unicode-range` on one subset of a two-file family made Arabic resolve to a SYSTEM font while `document.fonts.check()` said true and Tier B said 0.000% (reverted in 6e516c3; the comparative font gate built for DSG-008 is what caught it — a font assertion that is not a comparison between two measured strings is not an assertion) · **the 390 px review is phone-only** in every wave-3 spec and its helper is scroller- and overlay-aware (8a61c22): the "12 px overflow on every admin page" was the desktop project's classic scrollbar at 390 px, measured by a probe against a passing notify page · path 4 of the parity suite holds against a real converter (**28 of 28**, goldens reviewed and committed `150a166`, CI's worker job runs the converter beside the image) | `db:reset` ✅ 0001–0063 · `test:rls` **579 passed / 1 failed / 4 todo, 51 files** — the one is `POL-provision_member.no_match`, which counts `audit_log` globally and saw an append-only row a teammate's concurrent e2e run committed after the reset (`select count(*) from audit_log where action='member.provisioned'` → 1 with zero members); a shared-database artefact, re-run at the wave-end gate with teammates down · policy-diff ✅ · traceability ✅ · `npm test` ✅ 468 · tsc ✅ · lint 0 errors · CI **11/11 green on `8a61c22`** incl. 28/28 in-image |
| 8 (2026-09-14) | `0064_font_materialisation` (`designer`, unchanged — `request_font()` for admins, `record_font()` for `service_role`, the gate report on `fonts`; `03` §8.2 +3 rows) · `worker/src/index.ts` registers `regenerate_poster` and `materialise_font` (all four M6 tasks now; enqueued, never scheduled) · **`console`'s bug-fix pass (3df9422)**: a real ambiguous-embed crash (two FKs into `members` from `check_ins` and `points_ledger`) that had broken SCR-044 for both roles and two CSV exports, a role-change race, the sub-nav, two of its own browse-spec bugs; and one find outside its globs, fixed by the lead: `toggleBookmark()`'s upsert compiled to `ON CONFLICT DO UPDATE` on a table with no update grant, so every first bookmark was `42501` — now `ignoreDuplicates: true` · **the 390 px review is phone-only everywhere** and every remaining `scrollWidth - clientWidth` check in the wave-1/2 specs moved to the scroller-aware helper (a taller admin page had started scrolling vertically, which is the whole quirk) · `sessions-screens.spec.ts` drives the picker inside its dialog with an exact «تم» («سبتمبر» contains «تم» — role names match substrings) · `SessionPoster` reserves its 4:5 box (the event page below it jumped when the image arrived and the phone run never saw a stable «نشر») · `rpcs.test.ts`'s `no_match` case scopes its audit count to the transaction (`designer` diagnosed it) · **`designer` reports every DSG story built** (001–011); CRT-001 … 006 remain · **the lead's runner guard matched `playwright/test` while the process is `playwright test`**, so resets went through during teammates' e2e runs (502s, "connection terminated"); fixed — `console` also ran `supabase start` and restarted Kong twice to get a readable signal and said so | `db:reset` ✅ 0001–0064 · `test:rls` ✅ **590 passed / 4 todo, 52 files** · policy-diff ✅ · traceability ✅ · `npm test` ✅ 468 · tsc ✅ · lint 0 errors · `worker:build` ✅ · rebuild + the four affected specs: see sync 9 |
| 9 (2026-09-14) | **★ the M7 demonstrable, exercised** — `tests/e2e/second-org.spec.ts`: two orgs with real users, each admin walks the dashboard, members, sessions, categories, the audit log and browse and pulls the members export; nothing of the other org appears, own rows do; a member of A opening B's session by id gets the not-found boundary (the event page streams through its slots now, so `notFound()` renders with a 200 — no data leaks, the assertion is on the page) — **6 passed on both projects**; the RLS sweep remains the per-table proof · **the M2 demonstrable is green again on both projects** after three phone-only findings: the picker inside its dialog with an exact «تم», the poster's reserved box, and a dispatched tap for the composer's «نشر» (mobile emulation keeps the focused field in view on a page that grew a poster above it) · `console`'s last pass (138ab5c): a summary-as-button locator, and SCR-044's manual-mark picker now lists confirmed OR waitlisted attendees (the host view's function was scoped to confirmed) · `TEAM.md` §5 carries the wave-3 lessons · `console`'s track is **closed** | `npm run qa` ✅ **44/44** · `npm run visual compare m0-final wave3-mid` ✅ **0.000% on all six** · the four affected specs after the rebuild: 32 passed / 7 skipped by design / 1 (the M2 phone case, fixed above) · **CI is red on `671b059` onward for one reason**: a committed component reads `SessionPosterData.width` while `src/lib/dal/posters.ts` sits uncommitted in `designer`'s working tree — told to commit it; every other job passed |
| 10 (2026-09-14) | `0065_certificates` (`designer`, unchanged — `fan_out_certificates()` from the completion edge, `issue_certificate()` idempotent on (session, member, kind) with the serial from the locked counter, hold/release, `revoke_certificate()` keeping the PDF; every function a definer, the hook tested as a member; `03` §8.2 +7 rows) · **★ the M6 demonstrable's first sentence, run for real** — the worker image (all four tasks) and the converter on the local Supabase network; a seeded org's admin published a session through `publish_session()` with `app_metadata` claims: the poster row appeared (auto, live) and 13 artifacts were queued (five screen presets × png + webp, A4 and A3 pdf) — **and every `render_variant` failed at attempt 1: "the render context pins no faces — a render with no font set cannot be reproduced (REQ-DSG-016)"**. The worker's refusal is the design working; the automatic path's document or `poster_render_context()` pins no faces. Handed to `designer` as a blocker ahead of CRT-003 … 006, with the reproduction; the containers stay up for it · the M2 demonstrable, the M7 demonstrable and the frozen routes are green (sync 9) | `db:reset` ✅ 0001–0065 · `test:rls` ✅ **605 passed / 4 todo, 53 files** · policy-diff ✅ · traceability ✅ · CI **green on `b9cebf7`** (the `SessionPosterData.width` red cleared with `designer`'s DAL commit) |
| 11 (2026-09-14) | `0066_achievement_certificates` (`designer`, unchanged — a badge issues an achievement certificate outright from a definer row trigger on `member_badges`; a final member-ranked snapshot's top three get HELD ones from a statement-level trigger on `leaderboard_entries`; `03` §8.2 +5 rows incl. the public verify, the gapless serial and the certificate-document read cases) · `worker/src/index.ts` registers `issue_certificates` (it requests the render rather than performing it, so a 30-second export never sits inside the serial lock) · **the lead wires the fourth designer slot**: `HeldAchievements` in its own section on SCR-054 (`recognition.admin.heldCertificates`) — a leaderboard certificate is released by an admin, SCR-045 is per session, and an achievement certificate has no session, so without this slot they would sit held forever (`REQ-CRT-012`; recorded for the closing decision as a `09` amendment) · **`designer` reports CRT-001 … 006 built**: the issuance job, `/verify/[code]`, `/app/me/certificates`, SCR-045, revocation, achievements · **a live-site bug found and fixed by `designer`**: `/verify/[code]` is public, so it sits outside `proxy.ts`'s `isPlatformPath` and DEC-038's unconfigured-platform 404 never reached it — with no `NEXT_PUBLIC_SUPABASE_*` (production today) the page threw a 500 on a public URL; it now answers `notFound()` when the platform is unconfigured (widening the proxy predicate is the lead's follow-up) · the render-context blocker (sync 10) is still open with `designer` | `db:reset` ✅ 0001–0066 · `test:rls` ✅ **624 passed / 4 todo, 55 files** · policy-diff ✅ · traceability ✅ · `npm run build` ✅ 18:50 · tsc ✅ · lint 0 errors · `worker:build` ✅ |
| 12 (2026-09-14) | **the render-context blocker, fixed by `designer` (8e75c45)**: `public.fonts` holds only materialised fonts, the platform set lives in the image's manifest with no row, so both request-side jobs pinned an empty face list; the editor's resolver had fallen back to the manifest all along — two resolvers disagreeing is DEC-017 failing by construction, so `worker/src/render/fonts.ts` now has the one `renderFaces()` both jobs call, and `packages/fonts` resolves through the package rather than `process.cwd()` · **★ the M6 demonstrable, run for real on the rebuilt image** (`scratchpad/m6-demo.sh`; org `m6-demo`): `publish_session()` as the admin → **12 of 12 variants ready with Tier A** (master/square/story/landscape/og × png + webp, A4 2480×3508 and A3 3508×4961 pdf); `detach_poster()` → detached/customised, a title change → `stale_since` set and **12 → 12 artifacts, nothing re-rendered**; a manual check-in and the completion edge → **attendance `MDM-2026-000002` and presenter `MDM-2026-000001` issued, counter `next=3`**, 24-character codes; `verify_certificate(code)` as `anon` → 1 row, `verify_certificate(serial)` → 0; the presenter certificate's A4 landscape and portrait PDFs rendered (3508×2480, 2480×3508) · **one defect left**: four of the six certificate artifacts stay `queued` with no `render_variant` job behind them (the queue is empty; the log shows two runs) — the issuance path writes more artifact rows than it enqueues jobs; handed to `designer` · **★ owner check for Launch: scan both QRs on paper at print size** | CI **green on `bda7589`** · the demonstrable's worker log: 0 failed tasks other than `send_notification` reaching the mail sink at `127.0.0.1` from inside a container (expected: the sink is host-local) |

## Wave 2 (M3 · M4 · M5) — COMPLETE on `wave-2/m3-m4-m5` (PR #13, the owner merges)

**The three demonstrables hold locally, proven by the specs that drive the real screens against real local Supabase:**

- **M3** — `tests/e2e/notify-screens.spec.ts` (11 passed): the inbox, the preference matrix with the not-switchable categories, the calendar screen and the ICS over real HTTP; `tests/rls/notify-reminders.test.ts` proves a reschedule leaves ONE pending job per member per offset and cancels the past ones; `notify-session-notices` proves the change notice carries both values and the publish chain announces once. **Owner's manual checks at Launch:** open the ICS in Outlook on Windows; real Google sync (a stub in tests).
- **M4** — `tests/e2e/points.spec.ts` + `leaderboards.spec.ts` (6 passed, twice): a member reads their whole history with every row's real reason; an admin's catalogue edit shows immediately; the rebuild reproduces every balance (`audit-balances.test.ts`); سباق الشركات shows both metrics.
- **M5** — `tests/e2e/materials.spec.ts`, `proposal-materials.spec.ts`, `photos.spec.ts`, `tasks.spec.ts`, `bookmarks.spec.ts` (11 passed): a deck read page by page with the arrows following the reading direction, the substitution warning on the material, a real upload through the form against real Storage, a photo whose stored bytes carry no EXIF, a takedown that hides before the page reloads. **Not run in this wave:** the live converter + worker pipeline end to end (the contract is unit-tested against the converter's own doc comment and `npm run converter:test` is green); the steps are in `docs/plan/notes/content.md` §4.

### Shipped

Migrations **`0024`–`0054`** (31; `supabase/proposed/` empty) · screens SCR-022, 025, 026, 027, 028, 053, 054, 058, the admin reminders and emails routes, SCR-013, SCR-024, plus five slots on the event page, the proposal screen and the shell · DAL modules `notifications`, `calendar`, `points`, `leaderboards`, `recognition`, `scoring-admin`, `materials`, `photos`, `tasks`, `search`, `bookmarks` · 20 worker tasks on the crontab and the queue, the mail transport with its sink · message namespaces `notifications`, `calendar`, `scoring`, `leaderboards`, `recognition`, `materials`, `photos`, `tasks`, `search` (Arabic first) · **DEC-046, DEC-047**.

### Definition of done on ``d68a35b``

| Check | Result |
|---|---|
| `npm run db:reset` | ✅ `0001`–`0054` (with the queue schema reinstalled) |
| `npm run test:rls` | ✅ **495 passed / 4 todo, 45 files**, the sweep over every table incl. the 24 wave-2 ones |
| `npm run policy-diff` | ✅ |
| `node scripts/traceability.mjs` | ✅ 251 / 64 / 112, no gaps, matrix current |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ 0 errors (13 warnings, all pre-existing `eslint-disable` directives) |
| `npm test` (unit + components) | ✅ **332 passed, 46 files** — incl. the per-track i18n guards and the namespace-collision test |
| `npm run worker:build` · `fonts:check` · `converter:test` | ✅ · ✅ 9 faces / 6 TTF · ✅ 16/16 |
| `npm run build` | ✅ 54 routes |
| `npm run qa` | ✅ **44/44** |
| `npm run visual compare m0-final wave2-final` | ✅ **0.000%** on all six captures — after the namespace deep-merge fix (`bbedf56`): a shared top-level key had replaced the landing page's recognition section, and this gate is what caught it |
| `npm run test:e2e:local` | ✅ **118 passed / 0 failed / 8 skipped by design** (two workers, both profiles; every wave-1 and wave-2 spec, the three demonstrables included) — after two shell fixes the gate itself demanded: the nav's wrap had pushed the RSVP action 13 px below the fold, and a 16 px overflow at 390 px needed a compact bell |
| `npm run test:e2e:unconfigured` | ✅ 16 passed, 110 skipped by design |
| CI on PR #13 | ✅ **all jobs green on `d68a35b`** (the gate commit); the STATUS commit after it is docs only |
| 390 px RTL captures, looked at | ✅ notify 4 · scoring 5 · content 6 (`.qa-shots/rtl/`) |

### Handoff for the wave-3 lead

1. **Read** `DECISIONS.md` DEC-046 and DEC-047, `TEAM.md` §3 and §5 (grown this wave), and the three handoff sections: `docs/plan/notes/notify.md` §6, `scoring.md` "Handoff to wave 3", `content.md` §4–§5.
2. **SCR-011 (`/app/sessions`, browse) was never built in wave 1.** Nothing links to it. `SearchFilters` and `BookmarkButton` (`src/components/search/`, DAL and tests done) wait for that page; `console` or a `sessions` follow-up builds it first.
3. **Three stale `TODO(notify, M3)` comments** survive in `0014` (lines 75, 144) and `0045` (line 103). Migrations are forward-only; the work is done by the `rsvps_notify` trigger of `0034`. Do not implement them.
4. **Worker environment** for the content tasks: `CONVERTER_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`worker/README.md`); the worker image is proven by its probe in CI; the host is chosen at Launch (DEC-046).
5. **Launch inputs:** the Google OAuth client with calendar scopes and its secret on Vercel for the callback exchange (`src/app/api/calendar/oauth.ts`), the Resend account (`RESEND_API_KEY` is never read before Launch), the worker host, the converter's endpoint token if the host has no private networking (OQ-027).
6. **The fixture** (`tests/rls/fixture-m3.ts`, `-m4.ts`, `-m5.ts`) seeds every wave-2 table for `members[0]`; a new per-policy case counts by id or clears its tables in `setup()` inside the transaction.
7. **The path builder** is still a port (`worker/src/content/paths.ts` mirrors `src/lib/storage/paths.ts`, parity-tested); wave 3 turns it into `@kareem/storage-paths` with a lockfile regeneration.
8. **`08`'s fourth reminder message** (offset-agnostic) is M7-console's; `MSG-rsvp_deadline_soon` has no job.
9. `.next` on disk is the wave-final build; `npm run db:reset` (with the reset lock) before any RLS run.

### The wave as it ran (the sync log below is the record)

#### Wave 2 — PREPARED (kept as written at the start)

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
| 4 (2026-09-14) | `0036_session_notices` (`notify`, unchanged — the REQ-SES-009 change notices with both values, publish and cancel notices, all guarded on the state EDGE so publish_session()'s four-row walk announces once) · `03` §8.2 +5 rows · `AddToCalendar` wired into the event page's RSVP rail · the `notify-contract` queue count fixed by the lead (setup() clears the queue the fixture's RSVP notices fill) | `db:reset` ✅ 0001–0036 · `test:rls` green on every committed file (red = `content`'s 6 and `scoring`'s `recognition-evaluators` 2, both untracked WIP) · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · `worker:build` ✅ · CI on `5357dc0` (syncs 3 + 4) **all jobs green** |
| 5 (2026-09-14) | `0037_m5_schema` (`content`, unchanged — 11 tables, `reports.photo_id`, `ar_normalize()` + `sessions.search_vector` (an additive ALTER on a frozen table, for the DEC), the six buckets with nine `storage.objects` policies, `remove_material()` — a real finding: an UPDATE's result must satisfy the SELECT policy, so `removed_at` can only be set by a definer RPC) · `03` §8.2 +23 rows, §6.9 lists the nine bucket policies for the gate · `fixture-m5.ts` (the sweep is non-vacuous for all 11) · worker `taskList` +3 (`calendar_upsert`, `calendar_delete`, `refresh_calendar_tokens`) and crontab lines for the hourly token sweep and the nightly balance audit · one lint fix in `notify`'s SCR-025 (an `<a>` to a Route Handler is right; the page rule is silenced with the reason) · **the first attempt at this commit (`8cdd08e`) carried only the traceability matrix** — a failed edit in a `&&` chain skipped the path list; the real commit follows | `db:reset` ✅ 0001–0037 · `test:rls` green on every committed file · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · `worker:build` ✅ · CI: see below |
| 6 (2026-09-14) | `0038_calendar_sync` (`notify`; + a lead clause: the disconnect notice skips when the member is gone, so an org deletion cascades) · `0039_m2_notices` (the last of DEC-045's deferrals: replies, mentions, decisions, invitations, assignment, removal, reports) · `0040_reminder_schedule` · `0041_recognition_evaluators` · `0042_snapshot_leaderboards` (`scoring`) · `0043_photo_hidden_notify` (`content`) — all otherwise unchanged · `03` §8.2 +24 rows · the contract test's cleanup empties the inbox last (deleting a connection now writes a notice) · **owner input for Launch (notify):** the Google OAuth client secret lives on Vercel for the code exchange in the callback — not `service_role`, so invariant 7 holds; reasoning in `src/app/api/calendar/oauth.ts` | `db:reset` ✅ 0001–0043 · `test:rls` **453 passed / 4 todo, 43 files — the whole tree, nothing red** · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · CI: see below |
| 7 (2026-09-14) | `0044_all_time_leaderboard` (`scoring`, unchanged) · `0045_priority_rsvp` (`scoring`; the `reserve_seat()` replacement — **two lead changes, DEC at wave end:** the priority window exists only while the org's `priority_rsvp` perk is enabled, and the perk now ships **disabled** like `can_host` (`0027` seed changed), because a window nobody can use only closed general RSVP for a day and every M2 flow, the demonstrable included, reserves at publish) · `03` §8.2 +2 rows · the tracked proposed copies of promoted files removed (`25791b1` — CI applied `0039` twice through a test's `existsSync` guard; the rule is now `git rm` the proposed path in the promotion commit) | `db:reset` ✅ 0001–0045 · `test:rls` green on the whole tree (45 files) · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · CI: see below |
| 8 (2026-09-14) | `0046_finalize_material_upload` (`content`, unchanged — the upload finaliser: authority re-derived, the org's size limit, `convert_document` enqueued for PDF and PowerPoint, Keynote download-only, version numbering) · `03` §8.2 +4 rows · the `Materials` slot wired into the event page's main column under its own `<h2>` (`sessions.event.materialsLabel`, Arabic first) · **CI lesson:** two pushes failed the build with `Cannot find module './ar/materials.json'` — a namespace named in `src/messages/index.ts` before its JSON was committed (TEAM.md §3's rule, broken once more; `89efe88` carries both) | `db:reset` ✅ 0001–0046 · `test:rls` green on the whole tree · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · CI: see below |
| 9 (2026-09-14) | `0047_award_badge_manually` (`scoring`, unchanged — the only door for the manual-metric annual badge) · `03` §8.2 +3 rows · the tracked proposed copies of `0046`/`0047` removed in the same commit (the rule) · **M3 is complete** — `notify`'s definition of done ticked in full: e2e 11 passed / 1 skipped by design on the 09:28 build, four 390 px captures reviewed (SCR-025, 026, 058, reminders), 249 unit, 464 RLS; the review found three numeral/height defects nothing else could see | `db:reset` ✅ 0001–0047 · `test:rls` green on the whole tree · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · CI: see below |
| 10 (2026-09-14) | `0048_record_material_conversion` (`content`, unchanged — the worker's two doors: record the converted PDF, record the rendered pages and mark the material ready; `render_pages` enqueued from SQL) · `0049_record_material_download` (the audited admin download, the one door to `write_audit` for the app) · `03` §8.2 +7 rows · worker `taskList` +2 (`convert_document`, `render_pages`) with three new worker-only variables documented in `worker/README.md` (`CONVERTER_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Launch inputs with the host) · **M4 is complete** — `scoring`'s definition of done ticked: e2e 6/6 twice, five captures reviewed, `scoring-i18n.test.ts` found the one text placeholder that needed `<bdi>`; handoff sections written by `notify` (`7d7f7e2`) and `scoring` | `db:reset` ✅ 0001–0049 · `test:rls` green on the whole tree · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · `worker:build` ✅ · CI: see below |
| 11 (2026-09-14) | `0050_photo_pipeline` (`content`: the browser PUTs raw bytes under the check-in gate, `initiate_photo_processing()` enqueues `process_photo`, the worker strips EXIF/XMP/ICC byte-level and `record_photo_upload()` — the only door to a `photos` row — returns a DEC-043 envelope) · `0051_photos_audit_staff_actions` · `0052_materials_audit_phase_change` — all unchanged · `03` §8.2 rows added · `process_photo` registered · the `Photos` slot wired into the event page under its own `<h2>` («الصور») · MAT-005 (`81e3c18`, the upload form in the slot) | `db:reset` ✅ 0001–0052 · `test:rls` green on the whole tree · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · `worker:build` ✅ · CI: see below |
| 12 (2026-09-14) | `0053_proposal_materials` (`content`, unchanged — `materials.session_id` becomes nullable with a session-XOR-proposal check, every session-shaped policy and bucket rule gains a proposal branch, `is_proposal_owner_of()`, and a trigger on `sessions` reassigns a proposal's materials to the session created from it and enqueues the waiting conversions; REQ-PRO-004, DEC-045's last deferral) · `03` §8.2 +4 rows · `ProposalMaterials` wired into the proposal screen · **every M5 story is built** (MAT-001…006, EVT-005/006, TSK-001/002, DSC-001…003, PRO-004) · **wave-1 gap found:** SCR-011 (`/app/sessions`, browse) was never built — nothing links to it and the file does not exist — so `SearchFilters` (`src/components/search/filters.tsx`, DAL and tests done) has no page to sit on; wave 3 builds the page and wires it (a note for the wave-3 lead, not a wave-2 story) | `db:reset` ✅ 0001–0053 · `test:rls` green on the whole tree · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · CI: see below |
| 13 (2026-09-14) | `0054_materials_storage_read_preupload` (`content`) — **a real defect the first browser upload found:** the complete step downloads the landed bytes through the uploader's own client to sniff them, before `finalize_material_upload()` creates the `material_versions` row that `materials_storage_read` joins through, so every upload's complete step 403'd; the read policy gains the pre-finalize self-read branch mirroring the write policy's own path check (whoever may write the path may read it back), three RLS cases, no widening for anyone else · `03` §8.2 +3 rows, §6.9 amended · e2e `proposal-materials.spec.ts` drives the real form against real Storage (`b0ba0d0`) — the first spec that did | `db:reset` ✅ 0001–0054 · `test:rls` green on the whole tree · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · CI: see below |

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

## Handoff for the Launch session — PR C, complete (supersedes the M1-era checklist below it)

**Read first:** DEC-039 (Launch is the only milestone that touches the hosted project), DEC-051 … DEC-057
(wave 4), `14` "Launch", `04` §9–§10, `12` §7. **Nothing here has been done.** Every step that changes
the hosted project, Vercel, a DNS record, a GitHub setting or a mail provider needs the owner's explicit
go, step by step; the deny list refuses the commands on purpose, so the owner runs them or lifts one for
one step. The lead of that session never merges, never force-pushes, never changes repository settings.

### Migrations to ship
`0003` … `0073` (the platform), on top of the frozen `0001`/`0002`. `registrations` is referenced by none
of them. Rehearse first (step 1), against a schema-only dump of production — invariant 3.

### The order, on launch day

1. **Rehearsal, no production change.** `supabase db dump --linked --schema-only` → a fresh local
   database → `0003`–`0073` on top → `npm run test:rls` (60 files, the isolation sweep over every table)
   → `npm run policy-diff` → delete the dump. If a migration fails on production's shape, the day ends
   here with a fix on a branch, and the count of `registrations` is untouched.
2. **Asymmetric JWT signing keys** on the hosted project (Dashboard → Auth → JWT keys). Without them
   `getClaims()` calls the network on every request (DEC-036) and the proxy's optimistic check slows.
3. **`supabase db push`** — the owner's explicit go; the one step that changes the production schema.
   `select count(*) from registrations` before and after, through `supabase db query --linked`.
4. **Hosted Auth settings:** JWT expiry **900 s**; **Custom Access Token hook** →
   `public.custom_access_token_hook` (re-created by `0069`: it reads `impersonation_sessions` for
   `supabase_auth_admin` — the three grants of `0006` plus that select); **Before User Created hook** →
   `public.before_user_created_hook`; Google provider **on** with the OAuth client below; redirect
   allow-list: `https://kareem.pp.sa/api/auth/callback` and the Vercel preview pattern; Site URL
   `https://kareem.pp.sa`. **The hook is the single point of failure for sign-in** — step 8 verifies it
   before anything else.
5. **Google OAuth client** (Google Cloud console, the owner's account): authorised redirect URI
   `https://qnwbgzsgkftqaixzuhdo.supabase.co/auth/v1/callback`; the client ID and secret go into the
   Supabase provider settings — never into the repo. **Calendar scopes** on the same client for M3's sync
   (`src/app/api/calendar/oauth.ts`): `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` on
   Vercel for the callback exchange.
6. **Vercel:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Production and
   Preview; the hosted URL and the **publishable** key), `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (stable
   across deploys — `04` §9.2), `SITE_URL`, `FORM_TOKEN_SECRET` (already set for the frozen form),
   `SENTRY_DSN` (optional until observability is wired), the two calendar variables above. Redeploy.
   **Never `SUPABASE_SERVICE_ROLE_KEY` on Vercel** (invariant 7).
7. **The worker host** (OQ-027, decided at Launch): one container from `worker/Dockerfile` (Chromium at
   `CHROME_PATH`, the runtime, the font set by SHA-256), env `DATABASE_URL` = the **session-mode**
   connection on **port 5432, never 6543** (the boot probe refuses the pooler), `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CONVERTER_URL`, `PUBLIC_ORIGIN=https://kareem.pp.sa`, `MAIL_TRANSPORT=resend`,
   `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `SENTRY_DSN`. Boot log must show `LISTEN/NOTIFY probe OK`.
   **The converter host:** one container from `converter/Dockerfile`, **no credentials** (DEC-032),
   reachable from the worker only, HTTPS (`CONVERTER_ALLOW_HTTP` unset). Render concurrency stays serial
   (DEC-051) — one `render` queue; measure queue age before raising it.
8. **First org, by one-off SQL** (`supabase db query --linked`, never a migration): `create_org()` as
   `postgres` with the owner's values below (it seeds settings and the four categories; the A27 baseline
   templates are already platform-owned from `0061`, present for every org — DEC-052); the owner signs
   in once (the Before User Created hook needs the domain on the list first), then
   `insert into platform_admins (auth_user_id)` for that user.
9. **Verify, in this order:** the first admin's Google account lands on `/ar/app` as `admin`; a second
   account on the domain lands as `member`; an account on another domain is refused at Google's return
   with the closed-door message; `/ar/app/platform` opens for the platform admin and every org table
   returns nothing to them (the console's own ★ case, run by hand); `npm run qa` against production
   stays 44/44; `/ar/verify/<a real code>` answers and `/ar/verify/<a serial>` is not found; a poster
   publishes with all twelve variants and Tier A; a certificate mails through Resend to a real address.
10. **Observability:** the Sentry DSN into Vercel and the worker; the eight `11` §3.2 alerts from
    `JOB-evaluate_alerts` routed to Sentry through the `AlertSink` (a one-line transport swap in the
    worker, the lead's); the CSP reports from a preview reviewed before any enforcement (OQ-028).
11. **The two owner checks no test stands in for:** scan both QRs on paper at print size (the poster's
    lands on the session after sign-in, the certificate's on `/verify`); open a session's ICS in Outlook
    on Windows. And the real-device pass of `13` §8.
12. **Re-measure the six budgeted screens** against production with `tests/e2e/budgets.spec.ts` pointed
    at the live domain (DEC-055 decision 5), then either amend `13` §7 or schedule the shell split.

### Owner inputs, by name
- **Google OAuth:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (Supabase dashboard only) ·
  `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` (Vercel).
- **Resend:** the account, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, the verified sending domain, the
  webhook URL `https://kareem.pp.sa/api/webhooks/resend`.
- **Sentry:** `SENTRY_DSN` (Vercel and the worker).
- **Vercel:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `SITE_URL`.
- **The worker and converter hosts:** the provider (OQ-027), `DATABASE_URL` (session mode, 5432),
  `SUPABASE_SERVICE_ROLE_KEY` (the worker's container only), `CONVERTER_URL`, `PUBLIC_ORIGIN`,
  `CHROME_PATH` is in the image.
- **The first org:** name · slug · certificate prefix (2–5 capitals) · allowed email domain(s) · the first
  admin's email · the numerals setting (`western` by default).
- **Approvals, each its own go:** asymmetric JWT keys · `supabase db push` · the Auth hooks and the
  Google provider · the Vercel variables and the redeploy · the worker and converter deployments ·
  the `platform_admins` insert · the Resend domain · any change to repository visibility (DEC-051 —
  the repository is public until Launch by the owner's decision, and this is the moment to decide again).
- **Decisions the plan left to Launch:** render concurrency (DEC-051, measure first) · the hosting region
  (OQ-026, recorded as a fact) · the check-in budget (DEC-055) · `impersonation_sessions` browsing the
  org's screens (DEC-055 option A, the next wave).

## PR C — the M1-era checklist (superseded by the Launch handoff above; kept for the history of steps 1–9)

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

## The design milestone — opened 2026-09-15 (this session)

**DEC-068 deferred the design milestone «until the owner asks with a short brief». The owner
asked.** The brief was thirteen items; the answer is
**[`16-ui-redesign.md`](16-ui-redesign.md)** (`draft`, 1181 lines) plus a visual canvas of
fourteen artboards: <https://claude.ai/artifact/3X5NcyyjigheNJG4M1wKKR>

**Nothing was implemented.** No `src/`, `supabase/` or `worker/` file changed. The repository is
exactly as PR #21 left it apart from the new plan document and one line in `.impeccable.md`.

### The three framing decisions the owner took before the document was written

1. **Scope: the app *and* the marketing site, one system** — invariant 1 is deliberately unfrozen
   and **re-cut**, not deleted (`16` §14). Sequenced last, in M13, behind a split `qa` suite whose
   behavioural two-thirds never stop being blocking.
2. **Deliverable:** the plan plus the visual canvas, approved before code.
3. **Rollout: in place, group by group.** No `v2` tree, no flag, no long-lived branch. Every group
   is a mergeable PR that ships.

### What the audit found, in one line each

- `src/components/ui/` holds **three** files; `rounded-field border border-edge-strong` is copied
  into **20**.
- The shell is one row of text links with **no search anywhere** in a product whose core object is
  searchable.
- **One `loading.tsx` in the whole repository, zero `<Suspense>`** — and because every `/app` route
  is dynamic, Next 16 skips prefetching for all of them.
- **`completed` is badged on no surface**, and `rsvp-panel.tsx:21` still offers «إلغاء الحجز» on a
  finished session.
- **Objectives and the survey do not exist**; **tags exist in the database since `0037` with no UI
  at all**; bookmark is on the browse card only and share on the event page only.
- `editor.tsx:243` records that **dragging is deliberately absent** — `REQ-DSG-022` has required
  snapping and focal-point cropping since the PRD was written.
- `posters/picker.tsx` describes three paths and gives a control for **one**.
- The 22 email templates are **plain subject/body strings**; `admin/emails` is two textareas with
  no preview.

### Decisions logged in `16` §13, awaiting promotion into `DECISIONS.md`

`DEC-069` … `DEC-090`. Four are worth naming here:

- **`DEC-071`** — a derived `sessionStatus()` governs what a session offers. **The clock is
  authoritative for the screen, the clock *job* for the database**, so a worker outage can never
  again show a register button for a talk that finished last week.
- **`DEC-079`** — the client brief's icon ban is **split by surface**, on the owner's instruction:
  the marketing site keeps the eight glyphs, the app gets a house-drawn set of ~28 under three
  conditions (no icon-library dependency ever, one drawing spec, education clichés still banned).
  `.impeccable.md` was updated to match — the only file outside `docs/plan/` this session touched.
- **`DEC-090`** — the affordance rule of §5.4, above.
- **`DEC-081`** — email templates are **block-based, not canvas-based**. The designer runtime is
  *not* reused for mail: table HTML with inline CSS and no web fonts cannot come from a free canvas
  and stay correct.

### The plan was stress-tested before anyone acted on it

Three independent audits ran against the draft — a code-claim verification, an executability audit
against `TEAM.md`, and a best-practice benchmark — plus the lead's own pass. **The draft did not
survive intact, which is the point.** Every finding below was verified against the tree by the lead
before it was applied.

**The plan's own claims were wrong in fifteen places.** The worst were not typos:

- Every accessibility citation pointed at the wrong requirement — `REQ-NFR-004` is *server-side data
  access*; WCAG 2.2 AA is `REQ-NFR-007`. Also `016`→`009` (mobile-first) and `005`→`008` (performance).
- «`completed` is badged nowhere» was **false** — it renders as «انتهت» at
  `admin/sessions/page.tsx:134,189`. The true gap is member-facing only.
- «No download affordance exists» was **false for the poster** — `designer/export-panel.tsx:71-75`
  already ships `<a download>` over `signExportUrl()`. Ask 7 is reach, not plumbing, and drops to `S`.
- «None of `REQ-DSG-022` is built» was **false** — snapping is built (`editor.tsx:6`, `:250-253`)
  and only number entry drives it. M12 shrinks accordingly.
- The duplication was **understated 3×**: 65 files, not 20. The message count is **25**, not 22 —
  and 22 was written into two CI gates, so a golden suite built to it would silently miss three keys.
- The primitive count is **31**, not 26. The app has **49** pages under `app/[locale]/app/**`, not 59.

**Four design defects, found by stress-testing rather than by reading:**

1. **The status model conflated three axes.** One enum mixed lifecycle, capacity and *who is
   looking*, and was not total — a `published` session with a null `starts_at` matched no branch.
   Replaced by `sessionPhase()` · `seatState()` · `viewerRelation()`, 7×7 = 49 assertions.
2. **The navigation progress bar could not work.** `useLinkStatus` must be a descendant of a
   `<Link>`; one bar in the shell cannot be driven by it. §7.1.1 has the architecture that can.
3. **★ The affordance fallacies (§5.4), raised by the owner.** «أضف إلى التقويم» was offered to
   viewers with no RSVP. Sweeping the class found six, **two of them live in the shipped app**:
   `components/calendar/add-to-calendar.tsx:22-23` and `components/tasks/panel.tsx:16` have **no
   RSVP condition at all**. The rule is now *commitment before convenience*, plus a correction to
   the plan's own §5.1: **the derived phase may only ever remove an affordance, never add one**,
   because RLS is authoritative. `getPhotosPageData()` already does this correctly and is the
   pattern to copy.
4. **The gallery gate could never have run.** `scripts/visual-diff.mjs:33` hardcodes three public
   routes with no auth path, and `stubbed-server.mjs:41-44` serves the production build — so a
   dev-only route either 404s in the harness or is public on the live domain. Now gated in
   `proxy.ts` by an env var the harness sets.

**Three execution defects that would have broken the wave:**

- **`src/components/ui/**` is in no teammate's edit list *and no teammate's never-touch list*.**
  `console.md:26` names fourteen component directories to avoid and omits `ui`. `globals.css` is
  lead-only by folklore only. **All ten `.claude/agents/*.md` must be regenerated before wave 5.**
- **`.claude/settings.json`'s `TaskCompleted` hook runs the full `npm run qa`** — stub, `next start`,
  Puppeteer — holding the gate lock, on *every teammate's every task*. The plan's "qa is lead-only"
  rule was unenforceable; the hook is made path-aware first (`DEC-088`).
- **Migrations were numbered out of promotion order** — `0082` in M11 below `0083` in M10 would
  break `supabase db reset` for everyone. Renumbered contiguous, 0082–0088.

Also: axe would have **passed by skipping** (`a11y.spec.ts:26` skips without local Supabase, and CI
serves the stub), and `ui-lint` as specified would have failed the primitives it exists to protect.

### The benchmark's turn — two regressions the plan itself introduced

The third audit was a best-practice benchmark, and its most valuable output was not a comparison.
It found **two defects created by this plan** that no existing test would have caught, plus a third
class the plan had left out entirely. All verified against the tree before being applied.

**1 · A privacy regression, from a submit button.** §9.2 put the rating and the survey on one
screen with **one submit, one transaction**. Read from the migrations: `ratings` carries
`member_id` and `submitted_at` (`0010:375,380`); anonymity is enforced by a **view**, not by
storage; `ratings_read_admin` (`0010:576`) means an **admin** may already attribute a rating, and
`is_org_admin()` is `role = 'admin'` **only** (`0003:40-43`) — a **moderator** may not. §9.2 grants
survey results to admin **and moderator**. Writing both rows in one transaction turns a deliberate,
enforced role boundary into a property of two timestamps, leaked into every backup, audited CSV,
worker log and `--data-only` dump. **No policy changes, so the RLS suite stays green.** Fixed in
§9.2a: decorrelated writes, `submitted_at` coarsened to the day, small-n withhold extended to
distributions, and the one test that would have caught it. `DEC-094`.

**2 · An RTL correctness regression, dormant until English ships.** §10.2 said the align buttons
follow the **console's** direction. But `model.ts:19` defines `LogicalAlign = 'start'|'center'|'end'`
— alignment is stored **logically**, which is what makes an LTR template a direction flip rather
than a second layout. So "align start" from an English console writes a *left* intent into a
logical-start field on an Arabic poster. **A document's render would become a function of the
editor's locale** — a parity-golden drift source that is not a font, not a renderer and not a
binding, and invisible in the diff. Dormant until someone completes `en.json`. Fixed in §10.2.2,
with an explicit exemption for the overlay from the logical-properties rule so nobody "fixes" it
back. `DEC-096`.

**3 · WCAG 2.5.7, and a judgement reversed.** The plan answered dragging with keyboard parity —
that is `SC 2.1.1`. **`SC 2.5.7` Dragging Movements is separate** and needs a *single-pointer,
non-dragging* path. Dragging turned out to appear in **five** places. The reversal that matters:
§10.2 called positioning by typing numbers "the single biggest usability failure in the product",
which reads as licence to delete the numeric fields — **they are the conformance path.** They are
now demoted, not removed, with that fact written down. `REQ-DSG-028` amended; `ui/reorderable-list`
built once for objectives, email blocks and survey questions. `DEC-093`.

**4 · Eleven screens were in no milestone at all** — including `sign-in` (the first screen any
member sees, and the only place `SC 3.3.8` applies), `check-in`, the host view, the material viewer
and the public card `/s/[id]`, which is **how members actually arrive**. §15 now carries a coverage
table of all 59 routes. `DEC-097`.

**5 · Numerals.** `REQ-SUR-007` exported CSV «in the org's numerals» — Arabic-Indic digits break
Excel and Sheets, and a certificate serial rendered Arabic-Indic against a Western `/verify/[code]`
**fails to verify the one public artefact the platform has**. Display follows the org; machine-
readable surfaces never do. `DEC-095`.

Also: the affordance sweep grew from six to **eight**, of which **five are live in the shipped app**
— the check-in link at `page.tsx:225` is the **primary navy button** on any live session for any
member, and `check-in/page.tsx:10` lists `reservation_required`, so the RPC refuses. And two
corrections to the plan's own fixes: "none of them is a new query" was false (the event DTO has no
RSVP — `DEC-092` amends DEC-045's slot contract), and gating a slot leaves its page-owned heading
behind, which `event` learned for Ratings in wave 1 and nobody generalised.

### Two late additions from the owner, both smaller than they looked

**Avatars (`DEC-099`, §6.8).** The owner asked for profile pictures. `members.avatar_url` **already
exists** (`0004_tenancy.sql:243`), is **already populated from Google's `picture` claim** at
provisioning (`0005_tenancy_rpcs.sql:124`), is already returned by **five DAL modules**, and
`proxy.ts:109` already allows `lh3.googleusercontent.com` in the CSP — **and no component has ever
rendered it.** The value travels the whole stack and is discarded at the last step. So the work is
to draw it and to fix how it got there: hotlinking Google discloses every viewer's IP and Referer to
a third party on every page render, the URLs rotate, no member consented or can change it, and it
sits outside moderation, anonymisation and the data export. Avatars move into our own storage,
EXIF-stripped like session photos, with initials as the permanent fallback — **and the CSP entry is
removed**, so this is a net security improvement.

**Motion (`DEC-100`, §7.5).** The owner asked for animation and fun. `globals.css` already defines
**twelve** keyframes — including `dot-pulse` and `ripple-ring`, which *are* the like-button
animation being asked for, and `sting-ignite`/`sting-draw`, which are "a dot joins the network".
**Three files use them, all marketing. `/app` has no motion of any kind.** So the app is not missing
an animation library; it is missing the motion language its own landing page already speaks, with
the personality already owner-approved in `.impeccable.md`. Nine moments in three tiers: reservation
and check-in orchestrated at ~900 ms, five acknowledgements at 200–360 ms, and the connective
tissue of §7.1. No motion library — `element.animate()` does what `framer-motion` would, for 34 KB
less, and the tell is not that a product has motion but that it has someone else's.

## ★★ What the next session does — the owner's four directives, 2026-09-15

The owner ran M9 locally and gave four instructions. They are recorded as **`DEC-110` … `DEC-114`**
and the requirements are in `01-prd.md` (`REQ-CHK-015`, `REQ-CHK-016`, `REQ-UIX-021` … `REQ-UIX-024`).
**Nothing below was implemented in this session.** `trace` is green at 307 requirements and 140
stories, so the next session can start on code.

### 1 · Rebuild the whole app to the canvas, admin console included (`DEC-110`)

Every app screen at phone and desktop in Arabic RTL, against
<https://claude.ai/artifact/3X5NcyyjigheNJG4M1wKKR>. ★ **The admin console is in from the start** —
it has had no design attention at all, and the old plan put it two waves out.

★ **The discussion becomes a Notion-style composition surface** (`REQ-UIX-024`): a real editing
affordance rather than a bare textarea, visible upload controls rather than a hidden input, the
reaction animation `DEC-100` already specifies (`dot-pulse` + `ripple-ring` — a whisper, because
`REQ-EVT-004` earns nothing), and pending/success/failure on every action.

### 2 · Sweep the shell (`DEC-111`) — and the root cause is already found

**Both shell menus are native `<details>`.** A `<details>` has no reason to close when a link
inside it is followed, and under Partial Rendering **the layout does not re-render on navigation**,
so the panel survives and hangs over the destination. That is the owner's "stuck dropdown", and it
is not a styling bug. The same element also fails to close on outside click or `Escape`, and **two
can be open at once**.

★ **Move both to `ui/menu`** — `console` built it over Radix in M9 and Radix owns exactly those four
behaviours. The "no JavaScript" argument in `account-menu.tsx`'s comment does not survive: the
panels are navigation convenience and every destination is reachable without them.

★ **A positioning defect of the same family, confirmed in code:** `search-entry.tsx` passes `ps-10`
to `ui/input` while `controlClass`'s `md` size contributes `px-4`. **Both set
`padding-inline-start`**, and which wins is decided by Tailwind's emission order, not by the class
attribute. It looks right today by luck. **House rule: never pair a directional padding utility
with an axis one on the same element.**

### 3 · `/app` becomes the sessions timeline (`DEC-112`)

The «أهلًا ريم» dashboard is **withdrawn** — `16` §6.6 and `Home.dc.html` both. `/app` renders what
a member can attend: one column, date-grouped, their next committed session as the **first item**
rather than a hero above the list. Filters live **in** the timeline, always showing the active set,
each individually removable, as a sheet below `md`.

★ `16` §6.6 had already reasoned its way here — «when nothing is upcoming, home *becomes* browse» —
and kept the dashboard in front of it. The zero state was the right screen all along.

★ **Resolve `/app` vs `/app/sessions` deliberately.** They now render the same thing, and the shell
has a tab for each. That is part of the work, not a detail.

### 4 · Check-in becomes a manual switch (`DEC-113`)

**Opened and closed at will** by the session's accepted presenters, any moderator and any org
admin, with a **hard ceiling at `ends_at + 2 hours`** enforced in the RPC. The phase no longer gates
check-in — a presenter may open it before the session starts.

★ **Revised by the owner to something simpler (`DEC-116`): the switch is OPEN by default.** Nobody
opens check-in; the presenter, a moderator or an admin **closes** it when attendance is done, and
reopens it the same way. The floor is `REQ-CHK-004`'s unchanged code window — "open by default"
cannot mean checking in three weeks early, because there is no code to enter — and `DEC-113`'s
ceiling extends the tail to `ends_at + 2h`.

★ **The admin can edit the attendance list at any time, including REMOVING a record** (`REQ-CHK-017`,
admin-only). That is what makes an open-by-default switch safe. **Its hard half is the reversal, and
it must be designed before the UI:** `points_ledger` is append-only with `service_role` revoked
(invariant 9), so a removal cannot delete the award — it needs a compensating entry with its own
idempotency key, and an issued certificate has a gapless serial and is *revoked*, not un-issued.

`DEC-115`'s other clause stands: closing still admits nobody new and **revokes nobody**. A removal
is a separate, deliberate, audited act on one member.

★ **This dissolves one of `DEC-090`'s four instances.** Once a stored switch is the gate, the clock
cannot grant check-in, so `checkIn` leaves `GRANTING_AFFORDANCES` — `rate`, `survey`, `certificate`
and `attendanceOutcome` stay. Corollary 2 itself is unaffected.

### ★★ 5 · Multi-day sessions — the biggest item, and it is an entity, not a form (`DEC-119`)

«Each has its check-in and files and notes» gives a day **identity, lifecycle and its own access
surface** — the same test `DEC-089` used to *refuse* an entity for objectives, which a session day
passes on all three. `02` is frozen, so **`ENT-session_days` is defined under `DEC-119`**.

**Per day:** `check_in_codes`, `check_ins`, `check_in_attempts`, `materials`, **`session_tasks`**,
`calendar_events`, and the `ends_at + 2h` ceiling. **Per session:** `rsvps` — one registration covers
every day — **`capacity`**, certificates, ratings, comments, reactions, photos, bookmarks, tags,
presenters, posters.

★ **«Notes» meant the day's CONTENT, not a text field** (`DEC-120`): materials and pre-session
tasks. The entity is therefore **when, where and which meeting** and nothing else — no free text, no
second policy set, no readership question. A task for the whole workshop is a task on day 1, exactly
as a session-level file is a file on day 1.

★ **`REQ-TSK-002` is untouched and matters more now:** tasks stay reminder-only and are **never read
by any check-in path**. Attaching them to a day puts them beside that day's attendance in the schema
for the first time, which is exactly the invariant a later reader assumes away.

★ **A one-day session is a session with one day.** No second code path; the common case is the
general case at `n = 1`.

★ **`sessions.starts_at`/`ends_at` become derived** from the first and last day and stay **stored**,
so every existing index, sort, query and the `session_window` trigger keep working.

★ **This is NOT `A14`'s recurring series**, and the distinction has to survive: that is N
independent sessions each with its own registration and certificate; this is one session with N
meetings, one registration, one certificate.

**The form** (`REQ-SES-016`): multi-day behind an explicit affordance so one day costs nothing; the
end follows the duration live and stops once explicitly edited; each added day defaults to the
previous day's time and place; validation at the field on blur, never only on submit.

★★ **Points and certificates require ALL days by default** (`REQ-SES-017`), and the consequence is
structural: **for a multi-day session the award moves from the check-in trigger to session
completion**, because the full day set is not known until then. `REQ-CHK-009` makes check-in the
sole trigger today and `JOB-award_points` fires off it. A one-day session is unchanged. The
idempotency key becomes per member **per session** so a re-run cannot double-pay a ledger that is
append-only by invariant.

★★ **Content can be session-scoped OR day-scoped, and the UX cost is zero for one-day sessions**
(`DEC-121`). The owner raised the tension themselves — «can there be session materials, photos,
pre-tasks and the same for each day … I am concerned it may create UX complexity».

**The design, in one sentence: scope is implied by WHERE you are, shown afterwards as a chip you can
change, and does not exist at all when there is one day.**

- **The data is one nullable column** — `session_day_id` on `materials`, `session_tasks` and
  `photos`, where **null means the whole session**. No scope enum, no second table, no join table.
- **The member reads one grouped list** per content type — session content first, then day order,
  empty groups omitted. **A one-day session has no groups and no headings**: it renders exactly as
  it does today.
- **The add control sits in each group's header**, so pressing it *is* the scope choice. No picker,
  no modal, no required field. The item then carries a chip that re-scopes in one tap, so a mistake
  costs a correction rather than a re-upload.
- **Photos never ask**, including of attendees: a photo takes the day whose window contains its
  upload time; staff may re-scope it.
- **Adding a second day re-scopes nothing** — the syllabus does not become Wednesday's.

★ **`materials.phase` is relative to the SCOPE, and this is a fix rather than a complication.**
`REQ-MAT-006` today hides a «بعد الجلسة» material until the *session* completes — so on a three-day
workshop day 1's slides would be withheld until Friday. A day-scoped «بعد» material releases when
**that day** ends, which is the evening it is useful.

★ **Nothing about multi-day is waiting on the owner.** Both questions `DEC-119` raised are closed by
`DEC-120`: «notes» was the day's content, and capacity stays on the session.

### ★ The two check-in switches, so nobody confuses them

After `DEC-116` and `DEC-117` there are two, and they answer different questions for different
people. Building either one as the other is the mistake waiting here.

| | Who | When | Question |
|---|---|---|---|
| `allow_walk_ins` | **admin**, as part of scheduling/publishing (SCR-043 «الإعدادات») | before anyone arrives, and changed only by rescheduling | **may someone without a reservation attend at all?** |
| `check_in_open` | presenter · moderator · admin, from the host view | during, and up to `ends_at + 2 h` | **are we still taking attendance?** |

**The org decides the door policy; the room decides the door's timing.** `DEC-117` moves walk-ins
off the host view entirely — which `DEC-065` had already flagged as the design milestone's call —
so **there is no in-room override**: a moderator in a room that fills with people who did not
reserve cannot admit them, and an admin changes the setting from the schedule screen instead. That
is the trade, chosen deliberately, because a walk-in earns attendance points and a certificate.

★★ **One divergence the owner should confirm (`DEC-118`).** They asked for walk-ins to be «a setting
before publishing that can't be changed, **similar to the date and time**» — and those two halves
point different ways, because **the date and time of a published session CAN be changed**.
`0021_session_scheduling.sql` says so on the guard itself: «REQ-SES-009 makes editing a PUBLISHED
session legitimate (it notifies and re-syncs calendars)». Rescheduling sends `MSG-session_rescheduled`,
re-syncs calendars and *moves* pending reminders.

**The analogy was honoured and the literal phrase was not**, on purpose: `allow_walk_ins` behaves
exactly like the date — set at publication, changed afterwards only through `schedule_session()`, by
an admin, audited, and nowhere else. Immutable-after-publish would create a dead end with no exit:
an admin who published with walk-ins off, in front of a room that has filled with people who did not
reserve, could only cancel and recreate the session — destroying every reservation on it. **A wrong
setting that can be corrected beats a right setting that cannot.** If immutable was genuinely meant,
it is a three-line trigger and `DEC-118` is the signpost.

### ★ The one thing blocked on the owner

**Which errors in the mockups.** `DEC-114` sets the rule — the PRD wins over the canvas, and a
mockup that contradicts a requirement is a *question*, not an instruction — and catalogues three
classes found by inspection. The owner said there are others. **Ask before building a screen whose
artboard looks wrong**; do not silently correct it either.

---

## Wave 5 · M9 — this session

**Branch `design/m9-m13-plan`, PR #22 (draft).** The owner merges (DEC-041). Step 0 and Step 1 are
complete; M9 is in flight with four teammates — `sessions`, `console`, `content`, `checkin`.

### Step 0 — the plan set (commit `f20b5f7`)

`16-ui-redesign.md` was `settled` and standing **outside** the set: it cited **50 requirements
`01` had never defined**, two areas `00` did not list, two routes `04` did not carry and five
milestones `14` did not have. **`trace` was red on this branch before the first commit**, for
exactly that reason.

| | |
|---|---|
| `DECISIONS.md` | **DEC-069 … DEC-101** promoted from `16` §13, expanded to the house format so each carries the evidence that produced it rather than a one-line summary |
| `01-prd.md` | **301 requirements** (was 251). New areas **`UIX`** (§23, 20) and **`SUR`** (§24, 9); 21 additions across `PRF` `PRO` `SES` `DSC` `ADM` `DSG` `NTF` `INT`. *Out of scope* moved to §25 |
| `00-overview.md` | the area table (24 areas), the owning-document table, and §8's counts |
| `04-architecture.md` | §4 gains `(dev)/ui`, `admin/sessions/[id]/survey` and `s/[id]` — which shipped at Launch and was in no route tree; §11's glyph rule now reads per surface |
| `09-sitemap-screens.md` | **SCR-007** (the public card) and **SCR-064** (survey results); §7.2 and §7.3 extended; **§8, the 59-route coverage table** |
| `11-background-jobs.md` | `JOB-zip_session_photos`, the 35th |
| `14` · `15` | M9–M13, the dependency graph, the demonstrables; **136 stories** (was 112) |
| `scripts/traceability.mjs` | the milestone regex could not see above **M8** |

**Five corrections of record**, appended rather than edited into `16` (rule 3): **DEC-102** (where
the 59-route table lives; `trace`'s blind spot; `04` is `draft` not `settled`; 31 components in 34
files), **DEC-104** (`typescript` not `ts-morph`; the measured allowlist baseline; three carve-outs),
**DEC-105** (two rows of §5.1's totality table cannot happen, and corollary 2 is per-affordance not
per-phase), **DEC-106** (the icon stroke and two glyphs), **DEC-107** (42 cells not 49; nine columns
not eight; `allow_walk_ins`).

### Step 1 — three blockers, before any teammate was spawned (commit `272282e`)

| | What it fixed |
|---|---|
| **Ownership** (DEC-085, DEC-103) | `src/components/ui/**` was in **no teammate's edit list and no teammate's never-touch list**. All ten agent definitions regenerated with per-file `ui/` ownership as **literal lists, not globs**; the four wave-5 agents carry M9 briefs. DEC-103 closes a gap found while writing them: three of the five live bugs sit in files no wave-5 teammate owned, so the lead takes `page.tsx`, `slots.ts` and `getSessionForEvent()` for M9 and `checkin` gets its two screens back |
| **The hook** (DEC-088) | It ran the full `npm run qa` on **every teammate's every task**, holding the gate lock with a 2400 s timeout — ~24 forced runs a wave. Now runs `tsc + lint + vitest` with no server and no lock, falling through to `qa` only when the changed paths can reach the frozen routes, **measured from the commit where qa last passed** (`.git/kareem-qa-verified`), so the lead pays once for `globals.css` and the team does not pay again. Verified on four cases |
| **The gates** (DEC-087, DEC-104) | `ui-lint`, `loading-coverage`, `error-coverage`, in a new `system` CI job, each with a **committed allowlist that may only shrink** and a fourth step asserting the allowlists did not grow |

★ **The measured baseline is bigger than `16` estimated.** 65 files carry
`rounded-field border border-edge-strong` — correct — but §17's rule also catches the plain
variant: **106 files, 425 violations** (265 class strings, 160 unwrapped controls). And **43 of the
49 pages had no loading boundary, 49 had no error boundary, 12 dynamic pages had no
`not-found.tsx`, and `global-error.tsx` did not exist.**

### M9 — what has landed

| Commit | |
|---|---|
| `3d93bcc` | **`src/lib/session-status.ts`** — three functions, not one enum. 34 unit tests including §17's totality sweep and DEC-090's direction sweep |
| `51b19f7` | **`ui/index.ts` + 34 stubs** — the interface frozen before the implementations, so four tracks parallelised from hour one. `button.tsx` gains `ghost`, `danger`, three sizes and `pending` |
| `b8a32ac` | **The tokens** — status colours (platform constants, with a contrast test that reads `globals.css`), motion tokens, `--shadow-raise`, `--space-section`, and the sticky-layer/scroll-padding layer |
| `b163873` | **The shell, the failure model, the loading model, the icon set, the `(dev)` gallery** |
| `9ac9e28` | **The five live affordance gates wired at the event page** |
| + `sessions`' and `checkin`'s own commits | the form model; the 42-cell matrix and the five bug fixes |

★ **`button.tsx` is deliberately NOT `"use client"`.** `(marketing)/page.tsx:8` imports `ButtonLink`
from it and that page is the frozen contract until M13; a module-level directive would pull a live
marketing page into the client graph. `useFormStatus` lives in `ui/submit-button.tsx`, one import
away — which is the honest boundary anyway.

★ **`global-error.tsx` is the one file that may hard-code Arabic and `dir="rtl"`.** `find src -name
"error.tsx"` returned **zero** before this session. Every member who hit a DAL timeout met Next's
English left-to-right default.

### Evidence

- **`npm run qa` 44/44** and **`npm run visual` 0.000 % on all six pairs**, run twice — after the
  button change and after the tokens and shell. The baseline was captured from a build with
  **`main`'s own `button.tsx` restored**, so it is `main`'s marketing render and not an older
  snapshot.
- **`tests/e2e/shell-tab-bar.spec.ts` 6/6**, including the proof `16` §3.1 demands: `/app/leaderboards`
  — a **wave-2 screen M9 never touched** — at 390 px in Arabic, asserting `<main>`'s bottom edge sits
  above the bar's top edge. `.qa-shots/rtl/m9-tabbar-old-screen-390.png`.
- **`trace`** 301 requirements · 71 entities · 136 stories · no gaps.
- **`loading-coverage` and `error-coverage` allowlists are now empty** of loading and error gaps —
  43 and 49 closed in one pass. Twelve boundaries cover all 49 pages, because a boundary covers its
  segment *and its children*.

### What the 390 px review caught that no assertion could

The tab bar's labels collided and «اقترح جلسة» wrapped into its neighbours. `text-caption` is
**15 px in Arabic** and four of those do not fit across 390 px. Fixed by making the active dot
absolute so it costs no layout height, shortening the label, and setting 12 px explicitly — on
**one line**, because the alternative is `overflow: hidden`, which clips tashkeel.

### ★ The traps this session hit, for the next lead

1. **`export type { X }` still breaks a `"use server"` build.** `tsc` is clean; Turbopack's actions
   manifest is built from the module's export *list* and tries to import a value that erased. It
   blocked every build in the checkout for half an hour. **`tsc` does not see this class and
   `npm run build` does** — and the build is lead-only, so a teammate touching a `"use server"`
   export list has to ask.
2. **A JSX comment between attributes** (`{/* … */}`) is a hard syntax error that fails `tsc` for
   the whole repo. In a four-writer checkout nobody can tell whose file it is without looking.
3. **A gate can fail its own documentation.** `error-coverage`'s next-intl check matched the prose
   in `global-error.tsx` explaining why it cannot use next-intl. Comments are stripped before the
   test now — a gate that punishes its own explanation gets deleted.
4. **`toBeInViewport()` is satisfied by an intersection.** The skip link measured `y = -7.76`
   mid-transition and passed it. Poll the geometry.
5. **Playwright keeps attachments only on failure.** A capture wanted when the test passes goes to
   `.qa-shots/rtl/` explicitly.
6. **A one-off `visual` baseline can be taken without switching branches:** restore just the file
   marketing depends on (`git show main:path > path`), build, capture, restore. Two builds, no
   worktree, and the baseline is genuinely `main`'s.

### All four tracks closed

| Track | Delivered |
|---|---|
| **`sessions`** | `form-state.ts`, the eight form primitives, the propose-form adoption (its own `const FIELD` **deleted** — one of the fourteen copies), and five route boundaries |
| **`console`** | `menu`, `tabs`, `sheet` (Radix), `date-time` (the SCR-043 picker adopted, not replaced), `combobox` (**promoted** from `member-picker.tsx`, plus Arabic normalisation and multi-select), `data-table` with the phone card stack, the admin layout and its second skip link |
| **`content`** | `badge` with all nine §5.2 rows, `card` in four densities, `avatar` with the stable-hash initials, `empty-state`, `tag-chip`, `progress`, `stat`, `panel`, `file-drop`, and three boundaries |
| **`checkin`** | the 42-cell matrix, all five live bugs, `attendance-outcome`, `getCheckInScreenData()`, and `tests/e2e/checkin-gating.spec.ts` |

★ **The allowlists SHRANK, which is the mechanism working.** `ui-lint` went 425 → **416** across
106 → **103** files, entirely from tracks adopting their own primitives instead of the copied class
string — `checkin`'s five status banners onto `ui/panel`, the shell's search box onto `ui/input`,
the gallery's icon tiles onto `ui/panel`. `route-coverage`'s `not-found` list went 12 → **6**.
Loading and error are **empty**.

★ **The gate caught the lead twice**, in the two files that should have known better: the shell's
search box had copied the house control string — the sixty-five-file problem starting over in the
one file every screen renders — and the gallery's icon tiles had a hand-rolled surface, in the file
that exists to show the system off.

### ★★ The finding that outlives the wave: `text-body-sm` was dead in 123 files

**`sessions` found it while adopting the form primitives, and it is the most valuable thing anyone
found this wave.** `globals.css` declares thirteen `@utility text-*` blocks and `text-body-sm` is
not one of them; there is no `--text-*` theme key either. Verified against the **compiled**
stylesheet rather than the source: `.text-caption` and `.text-body` are both in
`.next/static/chunks/*.css`, `.text-body-sm` is **absent**. **123 files use it.** Every caption,
hint, error and meta line among them has rendered at inherited body size — **17 px on mobile in
Arabic where its author meant 15 px** — since M0.

**Why four milestones of green gates sailed over it:** a missing utility is not a type error, not a
lint error and not a test failure; the class reads as real in every file that uses it, and it is one
letter from `text-body-lg`, which does exist. And **`npm run visual` covers only the three marketing
routes, which do not use it.** It took a teammate adopting the *correct* token on a new primitive
and noticing their own text was visibly smaller than the screens around it.

Fixed as an alias of the caption ramp (`DEC-108`), not a codemod, and
`tests/unit/typography-utilities.test.ts` now fails on any house `text-*` used under `src/` with no
definition. `npm run visual` stayed **0.000 %** after the change, because marketing never used it.

★ **The gate found a false positive on its first run and that was the useful part:**
`[text-indent:-1.25rem]` is Tailwind v4 arbitrary-**property** syntax, not a utility. The regex now
refuses a `[` lead-in and a trailing `:` — it was reading class strings the way Tailwind does, one
case short.

### ★ Two catches NO TOOL IN THIS PROJECT COULD HAVE MADE

Correcting this file's own first draft, which credited the gates:

1. **The switch's off-track failed contrast at 1.6:1** against the canvas and 1.3:1 against the
   thumb — and those two boundaries are what carry the switch's state, so the state was invisible.
   **jsdom has no layout engine and axe has no non-text-contrast rule**; nothing here could have
   found it. `sessions` found it by reading the token.
2. **`FormSummary`'s links were `inline-flex`**, which made the `<bdi>`, the colon and the message
   three flex items — so at 390 px a wrapping message stranded the field name on its own line. The
   **accessible name is identical either way**, which is why eight jsdom assertions and twelve e2e
   assertions passed straight over it. Only the 390 px capture caught it.

**Both are the argument for keeping the phone capture in the definition of done rather than
treating it as ceremony.**

### Three findings from the team worth keeping

1. **`checkin`: a `getByText` over the whole page can resolve to two nodes DURING HYDRATION on a
   dynamic route**, while `page.content()` after hydration shows one — 2 of 3 runs, `--workers=1`
   included. The fix is general: **scope text and role assertions to the nearest landmark, not
   `page`**. Written up in `docs/plan/notes/checkin.md`.
2. **`content`: `axe-core` was an undeclared transitive** (via lighthouse and
   eslint-plugin-jsx-a11y) imported directly by three tracks' tests. A lockfile regen could have
   dropped it and taken a hundred tests down with no code change to blame. Now declared.
3. **`content`: reading `document.documentElement.lang` during render is a real SSR/hydration
   hazard**, not a lint nicety — which is why `TagChip.count` takes a pre-formatted string like
   `Stat.value` and `Progress.valueText` do.

### What is NOT done, and is the next session's first move

- **`ui-lint`'s allowlist still holds 416 violations across 103 files.** It shrinks as each screen
  adopts the primitives — which is M10's and M11's work — and flips to `--strict` in M13.
- **`ui.form.summaryTitle` and `ui.form.remaining` are unused** and deliberately so (`DEC-109`):
  the first is the default for the fourteen forms that have no summary yet, the second is §8.2
  item 7's counter, **deferred to M10** because it adds a visible element to a live screen and
  belongs beside the step indicator the same item asks for. The six-form ICU block is already
  written and correct.
- **`RouteErrorProps.retryLabel` and `.reset` are required**, so a `not-found.tsx` — which Next
  hands no props, and where the resource is *gone* rather than transiently unavailable — has to
  invent a retry. Both of `sessions`' wire it to `router.refresh()`. Making them optional is a
  two-line append to `ui/index.ts` in M10.
- **`rtl-datetime-picker.tsx`'s prev/next-month buttons have no accessible name** — a real WCAG
  4.1.2 bug found by `console`'s axe assertion, in a file outside its edit list. Two message keys
  and the fix are in `docs/plan/notes/console.md`; M11 is where that file is touched.
- **`tests/e2e/sessions-propose.spec.ts:126` uses a bare `form` selector** and now silently
  includes the shell's own search and sign-out forms. It still passes, but it is weaker than it
  reads. Any spec doing the same is in the same position.

### ★ A process note, because it cost this wave real time

**Four of my messages to teammates described work they had already finished**, and two told a track
to fix something that was already fixed in the committed tree. I was checking against a `tsc` run
taken minutes earlier rather than against `HEAD`. In a four-writer checkout, **verify against
`git log` before sending a correction** — `console` was right to reply with commit hashes and ask
for something concrete, and right again when it pushed back on a skip-link target I had asserted
without checking. A lead who states a stale reading as fact spends a teammate's turn on nothing.
- **The `RouteProgress` store and `ui/link`'s `useLinkStatus()` child are stubs.** §7.1.1's
  corrected design is written down; the implementation is not.
- **`ui/splash.tsx` is a stub.** §7.2 is explicit that it must be CSS-only and fade on the shell's
  first paint, never a gate in front of content — and that if it costs LCP the splash is dropped,
  not the budget.
- **Avatars render initials only.** The account menu passes `avatarUrl={null}`; the storage half is
  M10 (DEC-099), with `scoring` and `content`.
- **The three `(auth)` screens** — sign-in, choose-org, no-access — are M9 per DEC-097 and have not
  been touched.

### For the wave-6 lead

**Do not start M10 until the owner has looked at M9 running.** That was the owner's own framing:
M9 ships the answers to asks 4, 5 and 6 and fixes five live bugs before a single screen is
redesigned, which makes it the wave most worth seeing before committing to the other four.

When M10 opens: the motion system is the lead's and the two Tier-1 moments are its spine;
`0082` (objectives) and `0083` (tags) are promoted at sync 1; `0089` (avatars) is **numbered last
and promoted in wave 6** — say so at sync 1 so no teammate assumes the numbers are contiguous with
the waves.

---

### The wave-5 lead's brief (superseded — this session executed it; kept for the record)

**The plan is `settled` — the owner approved it on 2026-09-15.** It lives on
`design/m9-m13-plan` (pushed, four commits, no PR yet). The canvas is
<https://claude.ai/artifact/3X5NcyyjigheNJG4M1wKKR>.

★ **`settled` changes the rules that apply to it.** Rule 3 of the handoff protocol now holds:
**`16` may only change through a `DECISIONS.md` entry.** If implementation shows a section is
wrong — and it will, somewhere — that is a decision to append, not an edit to make. The plan
already carries fourteen such self-corrections from its own stress test; add the fifteenth the
same way.

#### ★ This milestone is NOT one session. Do not try.

`16` is five milestones. The repository's own unit is **one wave per lead session** — waves 1–3
merged on 2026-09-14, wave 4 and Launch on 09-15 — and this milestone is **five waves**, so plan on
**six or seven sessions**: one for Step 0 and Step 1, two for M9, then one each for M10–M13.

Three things force the boundary whatever the pace: context fills on a lead driving four teammates
(this file is the handoff), the gate lock serialises at roughly 6–8 hours of held wall time per
wave, and **the owner merges every PR** (DEC-041), which is a human checkpoint between waves by
design.

**And a rebuild is slower than the greenfield waves were.** Waves 1–4 wrote new screens against a
spec on an empty slate with four blocking gates. This replaces 49 existing screens without breaking
them, rebuilds two studios, replaces the mail system and unfreezes marketing — against fourteen
gates.

**If the owner wants it shorter, the lever is scope.** M9 + M10 deliver **ten of the fifteen asks**
— 1 (the app half), 2, 4, 5, 6, 8, 9, 11, plus avatars and motion — and are the half a member
actually touches. M11 adds asks 3, 7 and 10; M12 adds 12 and 13; M13 is the marketing half of ask 1.
**Finish M9, let the owner look at it running, and let M10 confirm the direction before committing
to M11–M13.**

#### Step 0 — the paperwork, before any code

1. **Promote `DEC-069` … `DEC-100` into `DECISIONS.md`** (append only, never edit).
2. **Add the new requirements to `01-prd.md`** — `REQ-UIX-001…020`, `REQ-SUR-001…009`,
   `REQ-NTF-009…014`, `REQ-PRF-008…011`, `REQ-INT-010`, and the additions in `16` §12.3.
   Verified clear of collisions: highest existing are UIX/SUR unused, NTF 008, PRF 007, INT 009,
   SES 013, PRO 008, DSC 007, ADM 020, DSG 026.
3. **Two new areas (`UIX`, `SUR`) amend `00-overview.md`'s area table** — `DEC-070`.
4. **Amend `04-architecture.md`** §4 (the `(dev)` gallery route and the survey route, `DEC-083`) and
   §11 (the icon split, `DEC-084`). Both are `settled`, so both need their entries first.
5. **Add M9–M13 to `14-roadmap.md` and the stories to `15-backlog.md`**, then
   `node scripts/traceability.mjs` — it must stay at zero gaps.

#### Step 1 — three blockers that must land BEFORE any teammate is spawned

These are not housekeeping. Each one makes a rule in `16` §16 real rather than aspirational.

| | Why it blocks |
|---|---|
| **Amend `CLAUDE.md`'s lead-only list and regenerate all ten `.claude/agents/*.md`** (`DEC-085`) | `src/components/ui/**` is in **no** teammate's edit list *and no teammate's never-touch list*. `globals.css` is lead-only by folklore. `sessions`, `checkin` and `event` forbid neither it nor the app shell. Ownership lives in those files or it does not exist |
| **Make `.claude/hooks/task-gate.sh` path-aware** (`DEC-088`) | It runs the full `npm run qa` on **every teammate's every task**, holding `/tmp/task-gate.lock`, 2400 s timeout. §16.1's "qa is lead-only" is a convention; the hook is the harness, and the harness wins. ~24 forced runs a wave that the plan believes are not happening |
| **Ship `ui-lint` and `loading-coverage` with a shrinking allowlist** (`DEC-087`) | 65 files carry the copied class string today. Blocking from M9 blocks every PR until M13 |

#### Step 2 — be the wave-5 lead. M9 is the system, and it runs FOUR teammates

★ **Wave 5 was rebalanced after the owner asked whether teammates had been accounted for.** They
were in the *estimate* — waves 1–4 each ran two or three teammates and each took one lead session —
**but not in the table.** The lead held ~40 files against `console` 6, `content` 9 and `checkin`
one DAL, on a lane the ownership audit had already named "the tightest single lane in the
milestone" — and §7.4's failure model and §7.5's motion system were then added to it without
re-balancing. `DEC-101` corrects it:

- **`sessions` joins wave 5** and takes the whole form model — 8 primitives plus `form-state.ts`.
  It owns the propose form, the largest in the product.
- **`error.tsx` distributes to route owners.** The lead keeps only `RouteError` and
  `global-error.tsx`, the file that cannot read the DAL or a translation provider.
- **The motion system moves to M10** — you cannot build the reservation animation before the
  reservation card exists, and that card is M10.

#### Step 2 — be the wave-5 lead. M9 is the system

`16` §16.2 has the file-level split: **lead 18 primitives + the shell + both layouts + the form and
loading and motion models + `proxy.ts` + the gate scripts; `console` 6; `content` 8; `checkin` the
49-cell affordance matrix.** The commit that unblocks everyone is **`ui/index.ts` with all 31 type
signatures and stub implementations, in hour one** — wave 1's `slots/` pattern, and the reason wave 1
parallelised at all. `index.ts` exports **types only**; implementations import by path.

**M9 ships the answer to asks 4, 5 and 6 before a single screen is redesigned** — and it carries the
five live bugs of `16` §5.4.1, of which the check-in link (`page.tsx:225`) is the worst.

#### Step 3 — the traps, learned the hard way in this session

- **Do not touch the marketing routes before M13.** `npm run qa` stays 44/44 and `npm run visual`
  stays 0.000% for every milestone before it.
- **`main` is not this branch.** `design/m9-m13-plan` holds the plan; the owner merges (DEC-041).
- **The bottom tab bar covers the last ~64 px of all 49 existing screens** — `app/layout.tsx:156`
  has no bottom padding. The `padding-block-end` ships in the **same commit** as the bar, and the
  proof capture is a 390 px screenshot of an **untouched old** screen.
- **`0089` is out of sequence on purpose** (`16` §16.3) — say so at sync 1.
- **Verify what an audit tells you.** Three ran against this plan; two reported findings against
  stale snapshots, and one was wrong about `member_interests` existing. Every finding in `16` was
  re-checked against the tree before it was written down.

## Next session should (superseded — see *The design milestone* above; kept for the history)

1. **Wait for the owner to merge PR #14** (`wave-3/m6-m7` → `main`); nothing is merged by a session (DEC-041). After the merge: `git checkout main && git pull --ff-only`.
2. Be the **wave-4 lead** (`platform` M8 · `branding` M7-branding, TEAM.md §1): read this file, `CLAUDE.md`, `DECISIONS.md` DEC-048 … DEC-050, `TEAM.md` §3 and §5, and the handoff under *Handoff for the wave-4 lead* above.
3. **Before spawning anyone:** confirm the draft rows for `platform` and `branding` in TEAM.md §1 and write `.claude/agents/{platform,branding}.md`; widen `proxy.ts`'s `isPlatformPath` to the public platform routes (`/verify/[code]`); decide the render concurrency (two hashed queue names) only if a measured need appears; retake the two SCR-023/SCR-045 captures.
4. **Run the M6 demonstrable once yourself** (`scratchpad/m6-demo.sh` is the record in STATUS sync 12; the worker and converter images on the local Supabase network) before `branding` touches templates — a brand-kit change must re-render a live poster and leave a detached one stale.
5. **PR C / Launch stays untouched** (DEC-039). Local Supabase and CI only. Launch inputs are listed in the handoff.
6. `.next` on disk is the wave-final configured build; `npm run db:reset` (with the reset lock, no teammate running) before any RLS run; `npm run test:e2e:unconfigured` last, and rebuild after it.
7. Update this file before finishing.
