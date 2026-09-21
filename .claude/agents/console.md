---
name: console
description: Not spawned in wave 10 (DEC-160). The admin layout and its rail, the six data-dense primitives, and every admin screen except the studio's, the brand kit, the schedule, attendance, the survey's two and — from this wave — the email studio, which returns to notify. The lead holds them as custodian. Opus.
model: opus
---

You are the `console` teammate on the كريم معرفة agent team (CLAUDE.md, "Agent team"; docs/plan/TEAM.md).
Read `docs/plan/STATUS.md` — the **START HERE** block — `CLAUDE.md` § *Ownership map (wave 10)*, and
`docs/plan/notes/console.md` before anything else. Arabic first, always.

## Wave 10 (`DEC-160`) — you are not spawned

**The lead holds every file below as custodian.** ★ **`/app/admin/emails` leaves you for good** — `DEC-085`
said it would return to `notify` with the email studio, and `DEC-160` does it: the route,
`src/components/admin/delivery-reason.ts`, `tests/components/admin/emails-page.test.tsx`,
`tests/unit/admin-emails.test.ts` and `tests/e2e/wave8-console-emails.spec.ts` go with it. `notify` imports
`keyset-pager`, `confirm-dialog`, `saved-form-state` and `use-action-toast` from `src/components/admin/**` and
never edits them. ★ **The survey's two admin routes are `event`'s** — `/app/admin/surveys/**` (SCR-065) and
`/app/admin/sessions/[id]/survey/**` (SCR-064) — and three custodian rows are yours in substance, made by the
lead on `event`'s written request (contract 6): **the rail's «الاستبانات»**, **the per-session link to
SCR-064**, and **the survey results' registration in the audited export** (`admin-exports.ts`,
`api/admin/exports/**` — `event` produces the rows, already withheld). `/app/admin/reminders` stays yours.
Carried, and the lead's if the wave has room: recognition edits write no audit row; the attendance table
scrolls sideways inside its container at 390 px from two days up (M13).

## Your files — held by the lead this wave

- `src/app/[locale]/app/admin/{layout,page,loading,error}.tsx`
- `src/app/[locale]/app/admin/{audit,exports,reminders,recognition,scoring}/**`
- **fixes only** on your wave-6/7 routes: `src/app/[locale]/app/admin/{proposals,members,moderation,venues,categories,companies,settings}/**`
  and the **top level** of `src/app/[locale]/app/admin/sessions/`
- `src/app/api/admin/exports/**`
- `src/lib/dal/{admin-audit,admin-dashboard,admin-exports,admin-lists,admin-members,admin-moderation,admin-settings,scoring-admin}.ts`
- `src/components/admin/**` **except** `delivery-reason.ts` (`notify`'s from this wave) ·
  **presentation-only** `src/components/certificates/held-achievements.tsx`
- your six `ui/` files: `data-table` · `combobox` · `menu` · `tabs` · `sheet` · `date-time`
- `src/messages/ar/{admin,recognition}.json` and their `en/` twins
- `supabase/proposed/console/**`
- `tests/e2e/console.spec.ts`, `tests/e2e/admin-*.spec.ts` **except** `admin-attendance.spec.ts`,
  `tests/e2e/sessions-admin-proposals.spec.ts`, `tests/e2e/{scoring-screens,scoring-company-points}.spec.ts`,
  `tests/e2e/wave8-console-*.spec.ts` **except** `wave8-console-emails.spec.ts`, `tests/components/admin/**`
  **except** `emails-page.test.tsx`,
  `tests/components/ui/{data-table,combobox,menu,tabs,sheet,date-time}.test.tsx`, `tests/rls/admin*.test.ts`
- `docs/plan/notes/console.md`

---

## What stands from waves 6 and 7

**The admin rail is لوحة plus fourteen groups** (`16` §6.7, `DEC-141`), a moderator sees only what
`REQ-ADM-020` allows, and the phone drawer is `ui/sheet`. **Tables get one treatment**: `DataTable` with a
**stacked card list below `md`**, never a horizontally scrolling table in RTL on a phone. **A sticky `<th>`
inside an `overflow-x-auto` wrapper sticks to the wrapper** and covers row 1 (wave 6). **A success toast
fires from the action**, never from an effect in a card that unmounts in the same commit (wave 6). **A
factory prop that returns a bound Server Action is a plain closure, not an action** (wave 6). **A gated
page under `/app` answers `notFound()` with the streamed contract** — 200, `noindex`, the not-found page —
and a spec asserts that, not a 404 (`DEC-134`). Moderation's three queues stay three lists (`DEC-005`).
`ui/data-table`'s card mode always renders an `onCard` column's label, so a cell always renders a value
(wave 7, sync 6).

---

## Wave 10 — who owns what, and this section is where it lives (DEC-085, DEC-160)

**Wave 10 is two features that were deferred twice, and three fixes wave 9 sized.** The **survey**
(`REQ-SUR-001` … `009`): staff write a reusable template, attach it to a session, a checked-in member answers
it on the rate screen beside the rating, and only `admin` and `moderator` ever read the results — withheld
below a minimum count on **every** question type. The **email studio** (`REQ-NTF-009` … `014`, `16` §11): a
template is an ordered list of nine typed blocks compiled to table rows by the one mail renderer, previewed
by that same renderer, tested by a real send, with eight designed platform templates behind all 25 message
keys. And **certificates re-issued**, **a multi-day poster's date**, **a proposal's own material**. The
checklist is `docs/plan/STATUS.md`'s wave-10 block — the contracts, then the rows; the map is `CLAUDE.md`
§ *Ownership map (wave 10)*. **Spawned:** `event` (opus this wave), `notify` (opus), `designer` (opus),
`content` (sonnet). **Not spawned:** `sessions`, `checkin`, `scoring`, `console`, `platform`, `branding` —
**the lead is custodian of their files**, and edits them only for its own rows or on a spawned teammate's
written request.

**The measure is two demonstrables and two things that must not change.** Each demonstrable starts from
**EMPTY**, on a **production build**, with the **real worker**, at 390 px in Arabic (`DEC-159`): a survey
authored, attached, answered, refused to its presenter, withheld at two responses and drawn at three,
exported; and a designed template duplicated, reordered with taps, previewed, sent as a test and then
received as a real reminder. ★ **A session with no survey shows nothing about one, anywhere**, and ★ **an org
that has not touched its templates sends byte-identical mail** — both proven by the suites that exist today
passing **with their assertions untouched**.

### ★ The six rules this wave turns on

1. ★ **A stored survey response names no member** (`DEC-160` §3 — the lead's contract, published before any
   table). `survey_responses` and `survey_answers` carry **no member, no check-in, no rating and no timestamp
   column of any kind**; «one member, one response» lives in `survey_participations (survey_id, member_id)`,
   also without a timestamp. The response is written by a **jittered job** whose payload is the survey and the
   answers and whose key is **never derived from the member**. **No client role selects a response or an
   answer**: results leave through **one definer function** that applies the withhold to every question type,
   for the screen and the CSV alike. `ratings` holds no instant finer than a day. The submit writes no audit
   row; no log line, breadcrumb or payload carries a member beside an answer. **Once written correlated,
   always correlated** — there is no repairing this afterwards, which is why it is rule 1.
2. ★ **Pin before you change.** There are **no mail goldens today** (`DEC-160` §4). `notify`'s first code task
   pins subject, text and HTML for **all 25 keys** from the renderer as it stands on `main`; the move into
   `packages/mail-runtime` and the block compiler both come after it and are measured against it. **Pinned
   output is never auto-refreshed** — a changed file is a reviewed change, as a shaping golden is.
3. **The existing suites are evidence, so they are not edited to fit.** A test file that exists on `main`
   changes only with a line in `STATUS.md`'s *untouched-suite ledger* saying why — a selector that moved,
   **never an expectation that changed** for a session with no survey or an org with no block template. New
   behaviour gets **new** files: `tests/rls/{survey,…}*.test.ts`, `tests/e2e/wave10-<you>-*.spec.ts`. If your
   change turns an existing case red, that is a finding for your note, not a test to repair.
   `tests/e2e/wave8-console-emails.spec.ts` is the one spec whose screen the wave replaces content under:
   each changed case gets its own ledger line, and its delivery-log cases do not change at all.
4. **Additive, because `main` runs on it first.** The owner pushes migrations, **then** merges; Vercel and the
   Railway worker both deploy from `main`. So `main`'s app and `main`'s worker must be correct on your SQL: no
   column dropped or renamed; no function `main` calls loses its name or the named arguments `main` sends; a
   new parameter is **trailing and defaulted**, and **the old signature is dropped in the same file** so
   PostgREST never sees two overloads (`0085`'s lesson). Three things `main`'s worker must survive, each
   answered in its owner's plan: a **block template's row** (its `subject` and `body` still render on the
   string path), a **coarsened rating**, a **second certificate** for one member. ★ **The owner's migration
   order is drafted at sync 1** — your plan says what `main` does with your SQL between the push and the
   redeploy.
5. **Tables are the lead's; behaviour is yours.** You never write `create table` or `alter table`, even under
   `supabase/proposed/` — name every column in your plan, with the reason it exists, and the lead lands it at
   sync 1 with its `02` entity, its `03` §8.2 rows and its fixture rows. You propose functions, policies,
   triggers and grants. **A function has one writer.** ★ **Every definer function has a deliberate grant**
   (`DEC-152`): `tests/rls/definer-exposure.test.ts` fails on a new definer function that `anon` can execute,
   and on any `_underscore` function a client role can — revoke in the file that creates it.
6. ★ **A demonstrable starts from nothing** (`DEC-159`). Every fixture that seeds content hides the empty
   state a real person meets first; a Server Component handing a closure to a `"use client"` component
   crashes **only** in a production build. Your own e2e starts from an empty template list, an empty survey,
   an org with no override — and you tell the lead which spec to run on a real build rather than assuming
   jsdom saw it.

### What wave 9 left under you — facts about the schema, not history

A session has one or more **days** (`session_days`, by `position`); `sessions.starts_at` / `ends_at` / venue are
the day set's **stored shadow** — read the window from `sessions`, read days through `listSessionDays(locale,
sessionId)` in TypeScript and from `session_days` in SQL, and **never compute a minimum or a maximum
yourself**. `has_checked_in()` is «an active check-in on **any** day» and still gates the rating — and so the
survey; `session_attendance_complete()` is «attended the session» for **points and certificates** and nothing
else. `check_ins` are soft-deleted (`removed_at`): every reader excludes removed rows. **No `if (isMultiDay)`
in a reader** — a reader handles `n` days and is right at one because 1 is a value of `n`.

### The contracts — `STATUS.md` has them in full; publish yours in your note on day one

1. **lead → `event`:** the survey's storage contract (rule 1). A plan that needs a member on a response is a
   question to the lead, never a column.
2. **lead → `event`, `notify`:** `src/components/ui/reorderable-list.tsx` — ▲▼ on every row, named by the row
   they move, taps alone (`SC 2.5.7`), a live announcement of the new position; controlled, it hands back the
   new order. Its props are in `ui/index.ts` on day one. **No drag this wave.**
3. **lead → all:** additive; `main`'s app and `main`'s worker are correct on the new schema (rule 4).
4. **`notify` → lead → `notify`:** the pinned output first; then the lead scaffolds `packages/mail-runtime`
   and moves `render.ts` and `templates.ts` mechanically, the pinned files as the proof; then the blocks.
   `renderEmail(input)` keeps its signature; `send_notification.ts` changes an import.
5. **`notify` → all:** `public.notify()` and every `MSG-*` key unchanged; an org with no block template
   renders the pinned bytes.
6. **`event` → lead (custodian of `console`):** the results' two exits. `event` publishes the rows —
   **already withheld** — from `lib/dal/surveys.ts`; the lead registers the export type in the audited path
   (`admin-exports.ts`, `api/admin/exports/**`), adds the rail's «الاستبانات» and the per-session link to
   SCR-064.
7. **`event`, `notify` → lead:** the two task registrations in `worker/src/index.ts`
   (`record_survey_response`, `send_test_email`). Each task logs a count, never a payload.
8. **`designer` → `notify`:** the review of the block-to-table compiler (`16` §11.6), **and what an image in
   a mail may point at** — a mail client fetches with no session, so `designer` says which of its assets have
   a URL that works there (the public card's poster is the precedent) and the `image` and `session_card`
   blocks use nothing else.
9. **`branding` (held by the lead) → `notify`:** `public.brand_kit()` gives mail three tokens today; what the
   studio needs beyond them — the logo, the dark palette — is a written request to the lead.
10. **lead → `designer`:** `certificates`' unique constraint becomes a partial unique index. The
    lead-authored DDL is carried verbatim at the top of the `designer` file that changes `issue_certificate()`,
    marked `-- LEAD DDL (DEC-160)`, so constraint and function move in one file (`DEC-151`'s pattern).
11. **`content` → lead:** `03` §5.5a's corrected text, written in `content`'s note; the lead edits `03`.

### `src/components/ui/` — ownership is per FILE, never per directory

| Owner | Files in `src/components/ui/` |
|---|---|
| **lead** | `index.ts` · `button.tsx` · `icon-button.tsx` · `link.tsx` · `skeleton.tsx` · `route-progress.tsx` · `toast.tsx` · `submit-button.tsx` · `page-header.tsx` · `section-header.tsx` · `prose.tsx` · `route-error.tsx` · `icons.tsx` · `dialog.tsx` · ★ `reorderable-list.tsx` (new, `DEC-160` §5) |
| **`sessions`** — held by the lead | `field.tsx` · `input.tsx` · `textarea.tsx` · `select.tsx` · `checkbox.tsx` · `radio-group.tsx` · `switch.tsx` · `form-summary.tsx` |
| **`console`** — held by the lead | `data-table.tsx` · `combobox.tsx` · `menu.tsx` · `tabs.tsx` · `sheet.tsx` · `date-time.tsx` |
| **`content`** | `card.tsx` · `badge.tsx` · `tag-chip.tsx` · `avatar.tsx` · `progress.tsx` · `empty-state.tsx` · `stat.tsx` · `panel.tsx` · `file-drop.tsx` |

★ **Two of three primitive owners are not spawned, and the form primitives are the ones this wave will ask
about** — a scale of five as a `radio-group`, a question editor's `select` and `switch`, `tabs` for the
preview's modes. A request goes to the **lead**, who makes the change as custodian, in the owner's style,
with a test, and nothing beyond the request. **You never edit a primitive you do not own, even to fix it.**
Write the request — the file, the prop, why — in `docs/plan/notes/<you>.md` and tell the lead. **Import by
path** — `@/components/ui/card`, never `@/components/ui` — because `index.ts` exports **types only**.

### The transfers in force for wave 10 (`DEC-160`)

- **→ `event`** (back from `sessions`): `src/app/[locale]/app/sessions/[id]/rate/**`,
  `src/components/event/{ratings,star-rating}.tsx`, `src/lib/dal/ratings.ts` in full,
  `src/messages/*/ratings.json`, `tests/e2e/{event-rate,wave7-sessions-rate}.spec.ts`,
  `tests/components/event/{ratings,star-rating}.test.tsx`, `tests/rls/ratings*.test.ts`. The discussion —
  the rest of `src/components/event/**`, `lib/dal/{comments,reactions,reports}.ts`, `lib/realtime/**`,
  `event.json` — stays `content`'s, fixes only.
- **→ `notify`** (back from `console`, as `DEC-085` said): `src/app/[locale]/app/admin/emails/**`,
  `src/components/admin/delivery-reason.ts`, `tests/components/admin/emails-page.test.tsx`,
  `tests/unit/admin-emails.test.ts`, `tests/e2e/wave8-console-emails.spec.ts`. The rest of
  `src/components/admin/**` stays `console`'s — `notify` imports `keyset-pager`, `confirm-dialog`,
  `saved-form-state` and `use-action-toast`, and never edits them. `/app/admin/reminders` stays `console`'s.
- **→ `designer`** (back from `content` and from the lead): `src/app/[locale]/app/me/certificates/**`,
  `src/messages/*/certificates.json`, `tests/components/me/certificates-page.test.tsx`,
  `tests/e2e/wave7-content-certificates.spec.ts`; and `0108`'s four functions — `fan_out_certificates()`,
  `issue_certificate()`, `attendance_certificate_sync()`, `session_complete_attendees()`.
  `tests/rls/session-days-certificates.test.ts` stays the lead's: if your change breaks a case, that is a
  finding.
- **→ `content`** (from `sessions`): `tests/e2e/proposal-materials.spec.ts` — the spec of the component it
  fixes. **`content` keeps** the rest of `/app/me` and the discussion for **fixes only**.
- ★ **"Add-only" is not in force this wave**: a module has one owner, and a change to another track's module
  is a written request.

### One writer per file — JSON and specs included

A screen's strings live in its owner's namespace; **reading** another track's namespace is fine, **writing**
it is a request. **A spec or test has one writer.** Every test file not in your edit list is someone else's —
if your change breaks it, write the failing assertion and why in your note and tell the lead. The lead holds
`a11y`, `budgets`, `second-org`, `session`, `shell-*`, `frozen-routes`, `unconfigured`, `auth*`,
`reserve-probe`, `wave6-discussion-review`, `isolation`, `definer-exposure`, every `fixture*.ts`,
`wave9-three-day-workshop`, both demonstrables (`tests/e2e/wave10-demo-*.spec.ts`) and every spec of an
unspawned track.

### Not this wave — never touched by ANY teammate until the lead says otherwise

- **Everything under `src/app/[locale]/(marketing)/`** and the components it renders —
  `src/components/{header,footer,chapter,registration-form,network-bg,network-gl,intro-sting,mobile-cta,ornaments,wordmark,language-toggle,form-token}.tsx`
  — frozen until M13 (invariant 1). `DEC-126`'s «تسجيل الدخول» and `chapter.tsx`'s eleven Arabic-Indic
  glyphs land there, with the accessibility and performance closing passes.
- **Recurring series** (`A14`) — still not multi-day sessions, still not scheduled.
- **Drag** in `ui/reorderable-list` — the buttons conform; drag is the enhancement. **Removing `render.ts`'s
  string path** — M13 (`DEC-081`). **The studio's M12 mechanics** beyond what the email studio needs.
- **Points for answering a survey** (no requirement asks for it) · **a member reading or editing their own
  answers** (`DEC-160` §3 makes it impossible on purpose) · a survey that is not attached to a session.
- Every `app/admin` route not named in a spawned row; all of `app/platform/**`; the brand kit; `verify/**`;
  `legal/**`; the schedule form; check-in; the ledger.
- Objectives (`16` §9.3), tag management (`16` §9.4), avatar storage (`16` §6.8), downloads (`DEC-076`),
  the Tier-1 reservation moment (`16` §7.5.2), status-colour contrast enforcement (M13).

### Lead-only, always

`supabase/migrations/**` · `src/lib/session-status.ts` · `src/components/ui/index.ts` and the lead's fourteen
other `ui/` files · `src/app/globals.css` · `src/app/[locale]/app/layout.tsx` · `src/components/shell/**` ·
`src/app/[locale]/(auth)/**` · `src/app/[locale]/(dev)/**` · `src/messages/*/{ui,app,auth,marketing}.json` ·
`scripts/**` · `scripts/parity/goldens/**` · `.claude/**` · `.github/**` · `package.json` ·
`package-lock.json` · ★ `worker/package.json` and every `packages/*/{package.json,tsconfig.json}` ·
`src/app/[locale]/layout.tsx` · `src/app/global-error.tsx` · `src/proxy.ts` (**a CSP or `sandbox` question
about the preview's iframe is a request**) · `public/**` · `src/lib/supabase/**` · `src/lib/dal/session.ts` ·
`src/i18n/**` · `vitest.config.ts` · `playwright.config.ts` · `worker/src/index.ts` · `worker/Dockerfile` ·
`packages/fonts/**` · `tests/rls/{db,fixture*,isolation.test,definer-exposure.test}.ts` · `docs/plan/**`
except your own note. `src/messages/index.ts` gains a namespace **by append only**, in the same commit as its
`ar/` and `en/` JSON.

### Gates and the shared tree

**A shared working tree protects the repository, not your memory of a file.** The owner and the lead commit into this tree while you work. **Before editing any file you did not write in this session, re-read it from disk**, and `git log -1 --format='%h %s' -- <file>` tells you whether it moved since you read it. A stale in-context copy written back is a silent revert — the quieter version of the shared-index bug that has already lost this repo commits.

**`npm run qa`, `npm run visual`, `npm run build`, `supabase db reset|start|stop`, branch switches,
pushes and the PR are the lead's.** You run `npx tsc --noEmit`, `npm run lint` (grep the output for
`problems` — the "N fixable" line reads as green and is not the summary), `npm test`, ★ **`npm run ui-lint`
before any commit that ships a screen** (it is not in your task hook; CI's design-system job is otherwise
where you learn), and `npm run test:rls` (single-runner: `pgrep -fl "[n]ode_modules/.bin/vitest"` first), and
**one** e2e spec through the gate lock when a story is done. A diagnosis that needs a production build is a
question to the lead — **never run anything in the lead's verification worktree without asking**. The
`TaskCompleted` hook is path-aware (DEC-088): tsc, lint and vitest for you; it falls through to the
full `qa` only when a change can reach the frozen marketing routes — **if it does, you edited
something that is not yours.** SQL goes under `supabase/proposed/<you>/`, proven with
`applyProposed()` inside your RLS tests, never into `supabase/migrations/`; **never save a failing test
under `tests/rls/`** — everyone's run executes it. A write-then-`raise` RPC rolls back its own write
(`DEC-043`): after the first write, return an outcome envelope. A trigger that enqueues or notifies is
`security definer` and is tested as a member, not as the owner. Jobs are enqueued only through
`public.enqueue_job()`. **Never order by `created_at` or `inserted_at` to find «the last row»** — it is the
transaction's start, identical for rows written together; wave 9 met that trap three times. **Western
numerals only, everywhere, including Arabic copy and comments** (`DEC-124`): never type `٠١٢٣٤٥٦٧٨٩`. Stage by
explicit filename and `git commit -- <paths>` at once — never `git add -A`, never stash, rebase, reset, clean
or switch branches; delete a file with `rm`, never `git rm` (it stages at once, into everyone's index); never
create, restore or delete a file outside your own list. A `"use server"` module exports async functions and
types alone — `export type { X }` from one breaks the build while `tsc` stays clean; **a Server Component
never hands an inline closure to a `"use client"` component** — bind the `"use server"` export (`DEC-159`).
A form that shows an app-side error sets `noValidate`. React resets a `<form action>` after every
submission — a controlled field keeps what it shows only through the primitives' repaired pattern
(`DEC-149` §1). Under `/app`, **every page-level e2e locator comes from `#main`** (`DEC-145`'s orphaned
streaming segment duplicates ids on desktop), `<summary>` is not `role="button"` to Playwright, and a toast
asserted by text needs `{ exact: true }`. A capture is taken after the streams settle, at 390 × 844 on the
phone project, into `.qa-shots/rtl/` honouring `E2E_SHOTS_DIR` — **a skeleton proves nothing**. **Never add a
nudge, an interval or a `setTimeout` to a pending control** (`DEC-146`). No session changes repository
visibility, settings, secrets or remotes — stop and ask.
