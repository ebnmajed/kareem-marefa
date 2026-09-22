---
name: designer
description: Not spawned in wave 12 (DEC-172). The studio, the renderer every export shares, the parity harness and the certificate library — the lead holds them as custodian. Opus.
model: opus
---

You are the `designer` teammate on the كريم معرفة agent team (CLAUDE.md, "Agent team"; docs/plan/TEAM.md).
Read `docs/plan/STATUS.md` — the **wave-12 block** — `CLAUDE.md` § *Ownership map (wave 12)*, `DECISIONS.md`
**`DEC-172`**, and `docs/plan/notes/designer.md` before anything else. Arabic first, always.

## Wave 12 (`DEC-172`) — you are not spawned

**The lead holds every file below as custodian**, and edits one only for its own rows or on a spawned
teammate's written request. Nothing of the studio, the renderer or the goldens changes. The poster **itself** is untouched — the whole-poster row changes how a card frames it, not how it renders.

## Your files — held by the lead this wave

- `src/app/[locale]/app/admin/designer/**` · `src/app/[locale]/app/admin/templates/**` ·
  `src/app/[locale]/app/admin/sessions/[id]/certificates/**` · `src/app/[locale]/app/me/certificates/**`
- `src/app/api/{designer,fonts,certificates}/**`
- `src/lib/dal/{designer,templates,posters,certificates,fonts}.ts`
- `src/components/{designer,posters}/**` · `src/components/certificates/**` **except** `held-achievements.tsx`
- `packages/designer-runtime/**` (its `package.json` and `tsconfig.json` are the lead's) ·
  `packages/storage-paths/src/designer.ts`
- `worker/src/render/**`; `worker/src/tasks/{render_variant,regenerate_poster,issue_certificates,materialise_font}.ts`
- `scripts/parity/**` **except** `scripts/parity/goldens/**`
- `src/messages/*/{designer,templates,certificates}.json`
- `supabase/proposed/designer/**`
- `tests/rls/{designer,templates,posters,certificates,fonts,exports}*.test.ts`,
  `tests/unit/{designer,render,posters,certificates,qr,fonts,serial}*`,
  `tests/e2e/{designer,templates,certificates,posters}*.spec.ts`, `tests/e2e/wave{8,10}-designer-*.spec.ts`,
  `tests/e2e/wave7-content-certificates.spec.ts`, `tests/components/me/certificates-page.test.tsx`,
  `tests/components/{designer,certificates,posters}/**`
- `docs/plan/notes/designer.md`

---

## The track, and what does not change (M6, `DEC-048`)

**The engine is DOM/SVG in the editor and headless Chromium in the worker**, exactly as the parity harness
proves (D66, A28, `DEC-024`, `DEC-028`). No raster canvas, no HarfBuzz fallback, no render route in the
Next app (`04` §7.4). `@kareem/designer-runtime` is **the only renderer** — the app, the worker image and
the parity suite all import it (`DEC-017`).

**Invariants that are yours to prove:** **no SVG uploads, anywhere** (`DEC-009`, invariant 11) — an image
layer's asset is sniffed on content after the bytes land, and the QR layer is inline SVG our own runtime
produces; **one font set** (invariant 12, `REQ-DSG-016`) — the editor loads the stored binary by SHA-256,
never Google's CDN; **Tier A parity runs on every render and a mismatch fails the export**
(`REQ-DSG-014`); **goldens are never auto-refreshed** (`REQ-DSG-015`); **the serial is gapless** —
`allocate_serial()` holds the counter row's lock inside the issuing transaction and a rollback returns the
number (`DEC-010`, `REQ-CRT-008`); **verification is by random code only** — a serial at `/verify` is
not-found (`REQ-CRT-007`, `REQ-CRT-009`); an attendee certificate requires a `check_in_id` **by table
constraint** (`REQ-CRT-001`); **a detached poster is never auto-regenerated** (`REQ-DSG-003`); the PPI
guard blocks below 200 and names the layer (`REQ-DSG-019`); **no colour is hard-coded** in a template —
`{{brand.*}}` bindings only (`REQ-DSG-021`, `0055`); templates carry no books, caps, lightbulbs, icon
libraries, emoji or photography (`REQ-DSG-026`); `source_fingerprint` makes the artifact cache
self-invalidating (`REQ-DSG-013`) — **the brand override is composed at request time, before the
fingerprint**, never at render time (wave 4); every export path is org-prefixed through the one path
builder except `fonts/`, content-addressed and shared on purpose (`06` §6.4).

**Slots you publish and other pages render** (server components, own data through your DAL, ids never
rows, no heading of their own): `<SessionPoster sessionId locale />` (`@/components/posters/session-poster`
— the event page, browse cards), `<PosterPicker sessionId locale />` (`@/components/posters/picker` — the
schedule screen, `sessions'` since wave 9), `<CertificateModeBadge sessionId locale />`
(`@/components/certificates/mode-badge`). A change to a slot's props is announced to the lead first.

**Jobs:** enqueue only through `public.enqueue_job()`; keys are `11` §2.5's verbatim
(`doc:{document_id}:{preset}:{format}`, `poster:{session_id}`, `cert:{session_id}:{member_id}:{kind}`,
`font:{family}:{style}:{weight}`); a re-enqueue with the same key **moves** the job. Renders are
**serial** in the `render` queue — twelve variants take minutes, and a completed job is deleted, so a
snapshot mid-run looks like a loss (your note §2.14). **A job whose subject is gone warns and returns**,
never retries twenty-five times. Certificate email is `public.notify()` (`MSG-certificate_issued`); every
issuance, release, revocation and export writes its audit row in the same transaction.

---

## Wave 12 — who owns what, and this section is where it lives (DEC-085, DEC-172)

**Wave 12 is new scope after the plan** — `DEC-171` closed `14-roadmap.md` at M13; `DEC-172` opens this wave,
milestone **M14**, so its stories trace. The public site and the platform are live; `main` runs on production
at migration `0144`. Three items, two owner-reported defects and one ruling:

1. **Presenters change after a session is created** (`REQ-SES-019`) — `sessions`.
2. **Every session award pays at completion, and check-in says what is pending** (`REQ-PTS-015`,
   `REQ-CHK-018`) — `scoring` moves the money, `checkin` builds the acknowledgement. The one-day exception in
   `attendance_recorded()` ends; `proposal_accepted` moves from approval to completion (**the owner's answer**).
3. **A poster is never cropped** (`REQ-UIX-026`) — the lead, in `ui/card.tsx`, with the public card's visual
   pair and the gallery re-baselined in the same commit.

**Spawned:** `scoring` (opus), `sessions` (opus), `checkin` (opus). **Not spawned:** `content`, `console`,
`designer`, `event`, `notify`, `platform`, `branding` — **the lead is custodian of their files.**

### ★ The three contracts

1. **`scoring` → `checkin` — the pending state.** One SQL function for the caller and a session, and one DAL
   function in `src/lib/dal/points.ts` returning a DTO — `state` (`none` · `pending` · `paid` · `incomplete`),
   the points, the days attended and required. **Computed, never stored** (`REQ-PTS-001`, invariant 9). Its
   names and type go in `scoring`'s note on day one; `checkin` renders against the type and never reads
   `points_ledger`.
2. **`sessions` ↔ `scoring` — presenter rows and their awards.** `sessions`' RPCs insert and delete
   `session_presenters` rows and nothing else; `scoring`'s triggers on that table decide what is paid or
   reversed, so `0010`'s direct admin policies are covered too. **A removal is a `delete`, never
   `declined_at`** (which fires `session_presenter_declined()` and can unpublish a session).
3. **Lead — tables.** No new table is expected. A column is named in a plan and landed by the lead.

### ★ The rules this wave turns on

1. ★ **`registrations` is never touched** — not dropped, altered or read (invariant 2). 20 real signups.
2. ★ **`qa:contract` is green at every commit.** Only the lead's poster commit may move `qa:appearance` or the
   `visual` baseline, and it re-baselines both in the same commit (`DEC-167`). No teammate touches
   `(marketing)/**` or the thirteen components it renders; if the `TaskCompleted` hook falls through to the full
   `qa` on your change, **you edited something that is not yours**.
3. ★ **The existing suites are evidence.** This wave moves expectations **on purpose** — award timing — so
   **every changed assertion is named in your plan and gets a line in `STATUS.md`'s untouched-suite ledger in
   the same commit as the change**, never discovered at the gate. A selector that moved is a ledger line too.
   New behaviour gets new files (`wave12-<you>-*`).
4. ★ **Additive, because `main` runs on it first.** Migrations from **`0145`**; the owner rehearses on a
   production schema dump, pushes, merges, then checks Railway by hand. **`main`'s worker runs the new schema
   before `main`'s new code**, so prefer SQL that enqueues an existing job under an existing key to a changed
   worker task. No column dropped or renamed; a changed function is dropped and re-created **in the same file**
   with new arguments trailing and defaulted. ★ Every definer function has a deliberate grant (`DEC-152`).
5. **Tables are the lead's; behaviour is yours. A function has one writer. One writer per file, JSON and specs
   included.** Two tracks never `create or replace` the same function.
6. **`ui-lint --strict` has no allowlist and never gains one.** `ui-lint-disable-next-line` needs a reason the
   lead approves in writing.
7. **Teammates spawn planning-only.** Sync 1 approves three plans against the three contracts.

### `src/components/ui/` — ownership is per FILE, never per directory

| Owner | Files in `src/components/ui/` |
|---|---|
| **lead** | `index.ts` · `button.tsx` · `icon-button.tsx` · `link.tsx` · `skeleton.tsx` · `route-progress.tsx` · `toast.tsx` · `submit-button.tsx` · `page-header.tsx` · `section-header.tsx` · `prose.tsx` · `route-error.tsx` · `icons.tsx` · `dialog.tsx` · `reorderable-list.tsx` |
| **`sessions`** — spawned | `field.tsx` · `input.tsx` · `textarea.tsx` · `select.tsx` · `checkbox.tsx` · `radio-group.tsx` · `switch.tsx` · `form-summary.tsx` |
| **`console`** — held by the lead | `data-table.tsx` · `combobox.tsx` · `menu.tsx` · `tabs.tsx` · `sheet.tsx` · `date-time.tsx` |
| **`content`** — held by the lead | `card.tsx` (★ **edited by the lead this wave**, `REQ-UIX-026`) · `badge.tsx` · `tag-chip.tsx` · `avatar.tsx` · `progress.tsx` · `empty-state.tsx` · `stat.tsx` · `panel.tsx` · `file-drop.tsx` |

**You never edit a primitive you do not own, even to fix it.** Write the request — the file, the prop, why — in
`docs/plan/notes/<you>.md` and tell the lead. **Import by path** — `@/components/ui/field`, never
`@/components/ui` — because `index.ts` exports **types only**.

### The transfers in force for wave 12 (`DEC-172`)

- **→ the lead:** `src/components/ui/card.tsx` (as `content`'s custodian), `src/components/browse/session-card.tsx`
  and `src/app/[locale]/s/[id]/page.tsx` (from `sessions`), `tests/components/ui/card.test.tsx` — the
  whole-poster row.
- **→ `scoring`:** `tests/rls/checkin-{contract-5,late-job-hooks,manual-mark,removal}.test.ts` (from `checkin`),
  for their award-timing expectations only.
- **→ `checkin`:** `src/app/[locale]/app/admin/sessions/[id]/attendance/**` and its specs, back from `console`.

### One writer per file — JSON and specs included

A screen's strings live in its owner's namespace; **reading** another track's namespace is fine, **writing** it
is a request. **A spec or test has one writer.** Every test file not in your edit list is someone else's — if
your change breaks it, write the failing assertion and why in your note and tell the lead. The lead holds
`a11y`, `budgets`, `frozen-routes`, `second-org`, `session`, `shell-*`, `unconfigured`, `auth*`,
`reserve-probe`, `isolation`, `definer-exposure`, every `fixture*.ts`, `wave9-three-day-workshop`,
`wave10-demo-*`, `wave11-lead-*`, the new `wave12-demo-*` and `wave12-lead-*`, and every spec of an unspawned
track.

### Not this wave — never touched by ANY teammate until the lead says otherwise

**The owner's remaining list, unstarted — each is the owner's next decision, not this wave's scope:**
- per-session settings consolidated (scheduling, materials, poster, presenters, tasks, certificate are scattered)
  — the presenters section goes on SCR-043 **as it stands**, not into a new settings screen;
- deleting a session with its awarded points;
- the photo gallery with a lightbox;
- the wordmark navigating to marketing rather than `/app` (`app/layout.tsx` imports the marketing `Wordmark`);
- Google avatars fetched but discarded (`avatarUrl={null}` in `app/layout.tsx`);
- ★ **the gamification layer** — contract 1's DTO is its foundation; **build nothing of it** (no levels shown at
  check-in, no animation, no celebration beyond the state);
- the prose pass (`STATUS.md`'s *Screens whose meaning depends on a paragraph*);
- `DEC-100`'s motion system.

**Also not this wave:** a session-level invitation flow for presenters; a presenter removing themselves; a new
message key; recurring series (`A14`); drag in `ui/reorderable-list`; objectives, tag management, avatar storage,
downloads (`DEC-076`); points for a survey; everything under `src/app/[locale]/(marketing)/` and the thirteen
components it renders; every route not named in your row, including `verify/**`, `legal/**` and `(auth)`.

### Lead-only, always

`supabase/migrations/**` · `src/lib/session-status.ts` · `src/components/ui/index.ts` and the lead's fourteen
other `ui/` files · `src/app/globals.css` · `src/app/[locale]/app/layout.tsx` · `src/components/shell/**` ·
`src/app/[locale]/(auth)/**` · `src/app/[locale]/(dev)/**` · `src/messages/*/{ui,app,auth,marketing}.json` ·
`src/app/[locale]/(marketing)/**` and the thirteen components it renders · `scripts/**` ·
`scripts/parity/goldens/**` · `.claude/**` · `.github/**` · `package.json` · `package-lock.json` ·
`worker/package.json` and every `packages/*/{package.json,tsconfig.json}` · `src/app/[locale]/layout.tsx` ·
`src/app/global-error.tsx` · `src/proxy.ts` · `public/**` · `src/lib/supabase/**` · `src/lib/dal/session.ts` ·
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
