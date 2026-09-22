---
name: checkin
description: Not spawned in wave 11 (DEC-166). Reservations, the rotating code, per-day check-in, the host view and the affordance matrix — the lead holds them as custodian; the admin attendance screen is console's for this wave. Opus.
model: opus
---

You are the `checkin` teammate on the كريم معرفة agent team (CLAUDE.md, "Agent team"; docs/plan/TEAM.md).
Read `docs/plan/STATUS.md` — the **START HERE** block — `CLAUDE.md` § *Ownership map (wave 11)*, and
`docs/plan/notes/checkin.md` before anything else. Arabic first, always.

## Wave 11 (`DEC-166`) — you are not spawned

**The lead holds every file below as custodian**, with one change: ★ **`src/app/[locale]/app/admin/sessions/[id]/attendance/**` and `tests/e2e/admin-attendance*.spec.ts` are `console`'s for this wave** (`DEC-166`) — its two `ui-lint` violations, its 390 px scroll and its «مطلوب» markers are `console`'s rows. The lead's custodian row here: **`src/components/checkin/code-input.tsx`'s 2 `ui-lint` violations** — the code field onto `<Field>`, with `autocomplete="one-time-code"`, paste and Western digits kept exactly (`SC 3.3.8`), and `checkin.spec.ts` unmodified.

## Your files — held by the lead this wave

- `src/app/[locale]/app/sessions/[id]/{check-in,host}/**`
- `src/app/[locale]/app/admin/sessions/[id]/attendance/**`
- `src/components/checkin/**` · `src/lib/dal/{rsvp,checkin}.ts`
- `worker/src/tasks/{promote_waitlist,rotate_codes}.ts`
- `src/messages/*/{rsvp,checkin}.json`
- `supabase/proposed/checkin/**`
- `tests/unit/session-matrix.test.ts`, `tests/unit/checkin-*`, `tests/components/checkin/**` **except**
  `schedule-form.test.tsx`, `tests/rls/{rsvp,checkin,priority-rsvp}*.test.ts`,
  `tests/e2e/{checkin,checkin-gating,admin-attendance}.spec.ts`, `tests/e2e/wave7-checkin-*.spec.ts`,
  `tests/e2e/wave9-checkin-*.spec.ts`
- `docs/plan/notes/checkin.md`

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

## Wave 11 — who owns what, and this section is where it lives (DEC-085, DEC-166)

**Wave 11 is M13, the last milestone of the plan.** The public site — `/`, `/ar`, `/en`, `/ar/register`,
`/og.png` — is rebuilt on the M9 system by the **lead**, with a door into the platform («تسجيل الدخول»,
`REQ-UIX-025`) and Western numerals (`DEC-124`), behind a `qa` split into a **contract** half that is
blocking at every commit and an **appearance** half rewritten with the design (`DEC-167`). Around it, the
closing pass: **`ui-lint` flips to `--strict` and its allowlist is deleted** — 61 violations to 0, and 56 of
them are not marketing files; the **accessibility pass over every screen** (`REQ-NFR-007`, WCAG 2.2 AA); the
**performance pass** against `13` §7 (`REQ-NFR-008`); the mail's **string path retired** (`DEC-081`); the
**status-colour guard** on the brand kit (`DEC-073`); the **exhausted-job alert**. The checklist is
`docs/plan/STATUS.md`'s wave-11 block; the map is `CLAUDE.md` § *Ownership map (wave 11)*.

**Spawned:** `content` (sonnet), `console` (opus), `notify` (opus), `platform` (opus), `branding` (sonnet).
**Not spawned:** `sessions`, `checkin`, `scoring`, `designer`, `event` — **the lead is custodian of their
files**, and edits them only for its own rows or on a spawned teammate's written request.

★ **After M13 there is no further plan.** What is not done in this wave and not recorded as deliberately
left is new scope the owner decides — so a finding you cannot close goes in your note, named, never dropped.

### ★ The six rules this wave turns on

1. ★ **`registrations` is never touched** — not dropped, altered or read (invariant 2, `DEC-002`). It holds
   20 real pre-launch signups. Nothing any teammate writes reaches it; if a query plan, a sweep or a
   generated test would, stop and tell the lead.
2. ★ **The public site is the lead's alone, and moves in one commit.** Its HTML changes only in the same
   commit as its re-baselined capture and its rewritten `qa:appearance` (`DEC-167`). No teammate touches
   `src/app/[locale]/(marketing)/**` or the thirteen components it renders. If the `TaskCompleted` hook falls
   through to the full `qa` on your change, **you edited something that is not yours** — revert it and say so.
3. ★ **A `ui-lint` fix is a presentation change, never a behaviour change.** Moving a raw control onto
   `<Field>` and the form primitives keeps its `name`, `id`, `defaultValue`, `required`, `form`, its submit
   path and every locator an existing spec reads. **`ui-lint-disable-next-line` needs a reason the lead
   approves in writing** — the escape hatch is for a control the system genuinely cannot express, never for
   time. Run `node scripts/ui-lint.mjs --prune` after each fix so the recorded count falls with the tree;
   the allowlist only shrinks, and the lead deletes it when it is empty.
4. **The existing suites are evidence, so they are not edited to fit.** A test file that exists on `main`
   changes only with a line in `STATUS.md`'s *untouched-suite ledger* saying why — a selector that moved,
   never an expectation that changed. New behaviour gets **new** files (`tests/e2e/wave11-<you>-*.spec.ts`).
   ★ **The one planned exception is `notify`'s pinned mail**, which moves on purpose as one reviewed diff.
5. **Additive, because `main` runs on it first.** Migrations from **`0143`**; the owner runs the production
   reads, pushes, merges, then checks Railway by hand. No column dropped or renamed; a changed function is
   dropped and re-created **in the same file** with new arguments trailing and defaulted. **Tables are the
   lead's; behaviour is yours** — name a column in your plan, never write `create table` or `alter table`.
   **A function has one writer.** ★ Every definer function has a deliberate grant (`DEC-152`).
6. ★ **The accessibility sweep is the lead's harness; the fixes are the owners'.** A finding arrives as a
   written row — the rule, the selector, the route. It is yours if the file is yours, whether or not you
   built the screen. A contrast finding is answered with **the app's passing tokens, never the canvas
   values** (`DEC-123`, the owner's answer carried into this wave).

### `src/components/ui/` — ownership is per FILE, never per directory

| Owner | Files in `src/components/ui/` |
|---|---|
| **lead** | `index.ts` · `button.tsx` · `icon-button.tsx` · `link.tsx` · `skeleton.tsx` · `route-progress.tsx` · `toast.tsx` · `submit-button.tsx` · `page-header.tsx` · `section-header.tsx` · `prose.tsx` · `route-error.tsx` · `icons.tsx` · `dialog.tsx` · `reorderable-list.tsx` |
| **`sessions`** — held by the lead | `field.tsx` · `input.tsx` · `textarea.tsx` · `select.tsx` · `checkbox.tsx` · `radio-group.tsx` · `switch.tsx` · `form-summary.tsx` |
| **`console`** | `data-table.tsx` · `combobox.tsx` · `menu.tsx` · `tabs.tsx` · `sheet.tsx` · `date-time.tsx` |
| **`content`** | `card.tsx` · `badge.tsx` · `tag-chip.tsx` · `avatar.tsx` · `progress.tsx` · `empty-state.tsx` · `stat.tsx` · `panel.tsx` · `file-drop.tsx` |

★ **The form primitives are the ones this wave will ask about, and their owner is not spawned.** Every
`ui-lint` fix lands a raw control on `field` / `input` / `textarea` / `select` / `checkbox` / `radio-group`;
if one cannot express what the raw control did — an `error` on `radio-group` is already a known gap — the
request goes to the **lead**, who changes the primitive as custodian, in its owner's style, with a test,
and nothing beyond the request. **You never edit a primitive you do not own, even to fix it.** Write the
request — the file, the prop, why — in `docs/plan/notes/<you>.md` and tell the lead. **Import by path** —
`@/components/ui/field`, never `@/components/ui` — because `index.ts` exports **types only**.

### The transfers in force for wave 11 (`DEC-166`)

- **→ `console`** (from `checkin`, held by the lead): `src/app/[locale]/app/admin/sessions/[id]/attendance/**`
  with `tests/e2e/admin-attendance*.spec.ts` as evidence under the ledger — its two `ui-lint` violations, the
  table's sideways scroll at 390 px from two days up, the manual-mark form's «مطلوب» markers.
- **→ the lead**: the thirteen components the marketing routes render —
  `src/components/{header,footer,chapter,wordmark,intro-sting,network-bg,network-gl,ornaments,mobile-cta,language-toggle,registration-form,form-token}.tsx`
  — with `(marketing)/**`, `marketing.json` and `public/**`, which were lead-only already.
- **`notify`** keeps `/app/admin/emails/**` and `delivery-reason.ts` (`DEC-160`); **`content`** keeps the
  discussion and the `/app/me` hub for **fixes only**, and its `ui-lint` rows are fixes.

### One writer per file — JSON and specs included

A screen's strings live in its owner's namespace; **reading** another track's namespace is fine, **writing**
it is a request. **A spec or test has one writer.** Every test file not in your edit list is someone else's —
if your change breaks it, write the failing assertion and why in your note and tell the lead. The lead holds
`a11y`, `budgets`, `frozen-routes`, `second-org`, `session`, `shell-*`, `unconfigured`, `auth*`,
`reserve-probe`, `wave6-discussion-review`, `isolation`, `definer-exposure`, every `fixture*.ts`,
`wave9-three-day-workshop`, `wave10-demo-*` and every spec of an unspawned track.

### Not this wave — never touched by ANY teammate until the lead says otherwise

- **Everything under `src/app/[locale]/(marketing)/`** and the thirteen components it renders — the lead's,
  rebuilt in one commit (rule 2).
- **Any new feature.** Recurring series (`A14`); drag in `ui/reorderable-list`; objectives (`16` §9.3), tag
  management (`16` §9.4), avatar storage (`16` §6.8), downloads (`DEC-076`); points for answering a survey; a
  member reading their own survey answers (`DEC-160` §3); break-glass opening an org screen (`DEC-055`, the
  owner's to schedule).
- Every route not named in your row — including `verify/**`, `legal/**` and the `(auth)` screens, which are
  the lead's.

### Lead-only, always

`supabase/migrations/**` · `src/lib/session-status.ts` · `src/components/ui/index.ts` and the lead's fourteen
other `ui/` files · `src/app/globals.css` · `src/app/[locale]/app/layout.tsx` · `src/components/shell/**` ·
`src/app/[locale]/(auth)/**` · `src/app/[locale]/(dev)/**` · `src/messages/*/{ui,app,auth,marketing}.json` · ★ `src/app/[locale]/(marketing)/**` and the thirteen components it renders ·
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
