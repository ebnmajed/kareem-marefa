---
name: notify
description: Not spawned in wave 16 (DEC-195). The notify() contract, the mail transport, packages/mail-runtime and the email studio — the lead holds them as custodian. Opus.
model: opus
---

You are the `notify` teammate on the كريم معرفة agent team (CLAUDE.md, "Agent team"; docs/plan/TEAM.md).
Read `docs/plan/STATUS.md` — the **wave-16 block** — `CLAUDE.md` § *Ownership map (wave 16)*, `DECISIONS.md`
**`DEC-195`** (and **`DEC-183`**, which it amends, **`DEC-100`**, **`DEC-093`** and **`DEC-167`**), `docs/design/README.md` and
the files it lists, in its order, and `docs/plan/notes/notify.md` before anything else. Arabic first, always.

## Wave 16 (`DEC-195`) — you are not spawned

**The lead holds every file below as custodian**, and edits one only for its own rows or on a spawned teammate's written request. Nothing of `notify()`, the mail transport, `packages/mail-runtime` or the email studio changes. ★ The five moments land on real screens this wave (`DEC-195` §1.1). Moment 1's «أُضيفت إلى تقويمك» is a **toast in the shell's region**, not a notification and not mail: no `notify()` key is expected. If a plan needs one, it is the lead's, as your custodian, on the teammate's written request.

## Your files — held by the lead this wave

- `packages/mail-runtime/src/**` (its `package.json` and `tsconfig.json` are the lead's)
- `worker/src/mail/**` · `worker/src/tasks/{send_notification,send_test_email}.ts` and the calendar and reminder tasks
- `src/app/[locale]/app/admin/emails/**` · `src/components/admin/delivery-reason.ts` · `src/app/api/admin/emails/**`
  · `src/app/api/webhooks/**` · `src/app/api/{sessions/[id]/ics,calendar}/**`
- `src/app/[locale]/app/me/{notifications,calendar}/**`
- `src/components/{email,notifications,calendar}/**` · `src/lib/dal/{notifications,calendar}.ts`
- `src/messages/*/{notifications,emails,calendar}.json`
- `supabase/proposed/notify/**` — including `public.notify()` and `session_presenters_notify()`
- `tests/unit/{mail,notify,admin-emails}*` including `tests/unit/mail-pinned/**` (reviewed-diff rule),
  `tests/rls/{notify,notifications}*.test.ts`, `tests/components/{email,notifications,calendar}/**`,
  `tests/components/admin/emails-page.test.tsx`, `tests/e2e/{notify*,wave8-console-emails,wave10-notify-*,wave11-notify-*}.spec.ts`
- `docs/plan/notes/notify.md`

---

## What stands

**Your standing track:** M3 — `REQ-NTF-001` … `008`, `REQ-CAL-001` … `008`, `REQ-RAT-007`, and the
notification halves of M2 (`DEC-045`). **The contract you own:** `public.notify(p_org, p_member, p_category,
p_payload, p_key)` — definer, checks the member's preference against the matrix (`08` §1, the eleven
non-optional), writes the `notifications` row and enqueues `send_notification` in the same transaction;
every other track calls **only** this, and its signature never changes without the lead. **Mail never
reaches a provider in development or CI** — `worker/src/mail/transport.ts` is an interface with a sink
(Mailpit on `:54325`, in-memory in CI) and Resend; `RESEND_API_KEY` is never read outside production.
Rescheduling **moves** a reminder (`job_key_mode => 'replace'`); job keys are `08` §7's, verbatim. ICS folds
at 75 **octets**. Google Calendar sync runs against the stub in tests. **A job whose subject is gone warns
and returns** — it does not retry twenty-five times (wave 4). **`DEC-085`: `/app/admin/emails` returns to you
with the email studio — wave 10.**

---

## Wave 16 — who owns what, and this section is where it lives (DEC-085, DEC-195)

**The programme's second wave** (`DEC-195`, milestone **M18**). Wave 15 laid the foundation of «ساحة اللعب» —
`docs/design/` — and changed nothing visible. **This wave does, on purpose.** ★★ The owner ruled on 2026-09-29, before
the wave opened, that **the five moments land on the real screens**, which **amends `DEC-183` §4.2(f)**: the surfaces
the moments touch adopt the playground now, and every other screen still waits. ★ **The reason, which is the rule you
work under: a moment cannot be verified in a gallery.** It is defined by *when* it fires — once, when the action
resolves, never on a re-render — and only the real screen, with its action, its redirect, its back button and its
reload, can show that. Production is at `0161`; migrations start at `0162`, and only if contract 5 needs one.

**Five surfaces move, and on each only the named part** (`DEC-195` §1.1):

| Surface | What moves | Moment | Owner |
|---|---|---|---|
| `SCR-012`, the event page | **the action card only** — `session-cta`, the ticket and the stamp, the capacity chip, the booked state, the calendar whisper | 1 · الحجز | `sessions` |
| `SCR-014`, check-in | the screen's content — `code-input` adopted, confetti, the coin, the three lines | 2 · تسجيل الحضور | `checkin` |
| `SCR-022`, points | **its head** — the count-up, the flame, the level bar, `level-card` | 3 · انتهت الجلسة, 4 · ترقية المستوى | `scoring` |
| `SCR-027` / `SCR-028`, the boards | the rows on `rank-row` and `race-bar`, the FLIP, the arrow, `scaleX` | 5 · تغيّر الترتيب | `scoring` |

**What does not move** (§1.2): the five public routes; the shell, the tab bar and the toast region; everything on
`SCR-012` but the action card; ★ **the home screen `SCR-010`** (it carries no balance, so moment 3 plays on `SCR-022`
alone); the history and the catalogue on `SCR-022`; every other screen, the `(auth)` screens included; and every
award, balance, level and rank as computed — a moment **reads** what exists.

**Spawned:** `sessions` (opus), `checkin` (opus), `scoring` (opus). **Not spawned:** `content`, `console`, `designer`,
`event`, `notify`, `platform`, `branding` — **the lead is custodian of their files**, `content`'s `avatar`,
`sticker`, `progress-bar` and `poster` included: the moments compose them, and a change is a written request.

### ★ The six contracts

1. **Lead → everyone — the mechanism** (`DEC-195` §2.3, `REQ-UIX-044`). `src/lib/ui/` is new and the lead's, and it
   lands **before any track's moment**: `confetti.ts` (`element.animate()`, an `aria-hidden` layer with no pointer
   events, each node removed on `finish`, an immediate return under reduced motion, colours from `--team` with lime
   and bone — lime and bone alone when the company has none), `useCountUp(from, to, duration)`, the
   **once-per-occurrence keying**, and a reader that turns a `--duration-*` token into milliseconds. **No track writes
   its own.** The names go in `STATUS.md` the day they land.
2. **Lead → everyone — keyframes and tokens.** Every `@keyframes` lives in `globals.css`, which is the lead's. A loop —
   the flame's flicker — is a class switched off under reduced motion, never JS. Name the keyframes you need in your
   plan; the lead lands them. **Transform, opacity and filter only; a duration from the tokens; no `will-change` left
   on; no motion library.**
3. **Lead → every surface — the scope on a real screen** (`DEC-195` §1.3). The scope's element (`ui/scope.tsx`) wraps
   **exactly** the surface of the table above, as a direct child of the screen's content, and is **never itself
   transformed, filtered or clipped, nor inside an element that is** (`DEC-188` §5) — a thud, a rise or a flip moves
   an element **inside** it. A portal lands in the scope through `usePlayPortal()` (contract 6 of wave 15, unchanged).
   An org's brand kit does not reach inside; the team colour does, as `--team`.
4. **`sessions` ↔ `checkin` — the matrix decides, the moment plays.** `session-matrix.ts` and `lib/dal/rsvp.ts` stay
   `checkin`'s: which state a viewer gets is the matrix's answer (`REQ-UIX-015`). A field `sessions` needs from
   `getRsvpPanelData()` is a written request to `checkin`, **add-only**. `checkin`'s «حضرت» fix is the one change to
   the matrix, with its ledger line.
5. **`scoring` → lead — what a member has seen** (`DEC-195` §2.6). Moments 3 to 5 play at first sight, and moment 5
   needs «since last view», which nothing stores. `scoring`'s plan says what it reads; **browser storage is not the
   default**, because it replays on every new phone. A table is the lead's, from `0162`, with its RLS case.
6. **`scoring` → `checkin` — the amount.** The coin's figure is `getSessionAwardState()`'s pending amount — read,
   never re-derived, never changed. `checkin` never queries `points_ledger`.

### ★ The rules this wave turns on

1. ★★ **Once per occurrence, never on a re-render.** A state problem, not an animation problem. Moments 1 and 2 play
   from the **action's own result**, in the client that performed it: a reload, a back navigation or another phone
   shows the static state. Moments 3 to 5 play at **first sight** of an occurrence — the ledger row, the level, the
   rank. ★ **Every moment has a test that mounts, plays, unmounts, mounts again and asserts silence.**
2. ★★ **Every moment has a named static state that is a COMPLETE experience under reduced motion** (`REQ-UIX-014`).
   Collapsing a duration is not a reduced-motion design. `03-motion.md` names each; build it, capture it at 390 px
   beside the animated one.
3. ★ **Transform, opacity and filter only. 60 fps. No `will-change` left on. No motion library.** Confetti is
   `element.animate()`. Bars grow by `scaleX`, rows move by `translateY` — never `width`, never `top`. ★ Moments 1 and
   2 are traced on a throttled CPU and **no frame is over 16 ms**.
4. ★ **A failure never animates** — a refused reservation, a wrong code, any error state. Nor do tables, lists, admin
   screens, the audit log or exports. **Nothing scales on hover.**
5. ★ **No overshoot, except a sticker's `1.08`, until the owner has seen one** (`DEC-186` §4, `DEC-195` §6.20). The
   stamp lands with none; the coin lands at `1` and keeps its squash. The owner is shown both at the 390 px review.
6. ★ **Only the named surfaces move.** A change anywhere else is a defect, not a preview. The five frozen public
   routes do not move: `qa:contract` green at every commit, `visual`'s public pairs unchanged and not re-baselined,
   the register-form fingerprint byte-identical.
7. ★ **The amount is computed, never stored, and always says it arrives at completion** (`REQ-CHK-018`,
   `REQ-PTS-015`). A `+0` is never drawn.
8. ★ **The status colours are `DEC-073`'s** (`DEC-186` §3). The waitlisted stamp wears the waitlist's tone, never a
   team colour (`DEC-195` §6.21).
9. ★ **`docs/plan/` wins over `docs/design/`** — `DEC-183` §4 and `DEC-195` §6 list twenty-four disagreements. A new
   one is the most useful thing a plan can contain: write it down with the file and the line, and do not pick a side.
10. ★ **The prototypes are behaviour references, never code.** `prototypes/motion-story.html` plays all five moments;
    read its CSS and JS for the sequence and the durations. **A prototype's class name never appears in `src/`.**
11. ★ **Semantic names only** (`tests/unit/tokens-only.test.ts`): no hex, no literal duration, no raw palette name in
    a file created this wave, and none after `pg:`, `pg-dark:` or `pg-light:` anywhere.
12. ★ **`DEC-093` binds** — a moment is never the only way to do anything, and nothing in it is dragged.
13. ★ **`registrations` is never touched** (invariant 2). **A company has no logo** (`DEC-195` §4) — a proposal for
    one is refused by reference to that entry.
14. ★ **The existing suites are evidence.** Every changed assertion is named in your plan and gets a line in
    `STATUS.md`'s untouched-suite ledger in the same commit. New behaviour gets new files.
15. ★ **Additive, because `main` runs on it first.** The owner rehearses any migration on a production schema dump,
    pushes, merges, then reconnects Railway. `main`'s app and worker on the new schema do nothing different.
16. **Tables are the lead's; behaviour is yours. A function has one writer. One writer per file, specs included.**
17. **`ui-lint --strict` has no allowlist and never gains one**; `ui-lint-disable-next-line` needs a reason the lead
    approves in writing.
18. **Teammates spawn planning-only**; sync 1 approves three plans against the six contracts. Your plan names the
    occurrence each moment is keyed on, what the static state shows, the keyframes you need, every existing
    assertion you will change, and any disagreement with `docs/design/`.
19. **Captures land at `.qa-shots/rtl/wave16-<track>-<moment>-<state>.png`** — `animated` at the moment's rest and
    `static` under reduced motion — phone project, `390 × 844`, from a production build the row names by commit,
    honouring `E2E_SHOTS_DIR`. The lead opens every one **in bands, never downscaled**.

### `src/components/ui/` — ownership is per FILE, never per directory

| Owner | Files in `src/components/ui/` |
|---|---|
| **lead** | `index.ts` · `button.tsx` · `icon-button.tsx` · `link.tsx` · `skeleton.tsx` · `route-progress.tsx` · `toast.tsx` · `submit-button.tsx` · `page-header.tsx` · `section-header.tsx` · `prose.tsx` · `route-error.tsx` · `icons.tsx` · `dialog.tsx` · `reorderable-list.tsx` · `scope.tsx` · `scope-portal.tsx` · `objects/**` |
| **`sessions`** — ★ spawned | `field.tsx` · `input.tsx` · `textarea.tsx` · `select.tsx` · `checkbox.tsx` · `radio-group.tsx` · `switch.tsx` · `form-summary.tsx` · `session-cta.tsx` · `code-input.tsx` |
| **`console`** — not spawned, the lead holds | `data-table.tsx` · `combobox.tsx` · `menu.tsx` · `tabs.tsx` · `sheet.tsx` · `date-time.tsx` |
| **`content`** — not spawned, the lead holds | `card.tsx` · `badge.tsx` · `tag-chip.tsx` · `avatar.tsx` · `progress.tsx` · `empty-state.tsx` · `stat.tsx` · `panel.tsx` · `file-drop.tsx` · `sticker.tsx` · `poster.tsx` · `reaction-bar.tsx` · `progress-bar.tsx` · `story-ring.tsx` |
| **`scoring`** — ★ spawned | `rank-row.tsx` · `race-bar.tsx` · `level-card.tsx` |

**You never edit a primitive you do not own, even to fix it.** Write the request — the file, the prop, why — in
`docs/plan/notes/<you>.md` and tell the lead. **Import by path** — `@/components/ui/card`, never
`@/components/ui` — because `index.ts` exports **types only**. A primitive that composes another — a `rank-row`
drawing an `avatar`, a `poster` carrying a `sticker` — imports it and asks its owner for what it lacks.

### The transfers in force for wave 16 (`DEC-195`)

- **→ `sessions`:** `src/components/checkin/{rsvp-panel.tsx,actions.ts}` (from `checkin`) — the panel's gates,
  `getRsvpPanelData()` and `session-matrix.ts` stay `checkin`'s; `tests/components/checkin/rsvp-panel.test.tsx` with
  them (evidence).
- **→ `scoring`:** `src/app/[locale]/app/leaderboards/**` and `src/components/scoring/{member-board,company-board}.tsx`
  (from `sessions`), with `tests/e2e/{leaderboards,wave7-sessions-leaderboards}.spec.ts` (evidence) and
  `messages/*/leaderboards.json`.
- **→ the lead, as `console`'s custodian:** the add-company form's colour (`DEC-195` §3) —
  `src/app/[locale]/app/admin/companies/**`, the companies functions of `src/lib/dal/admin-lists.ts`, the `companies`
  keys of `messages/*/admin.json`.
- **→ the lead:** new `src/lib/ui/**`.
- ★ **Frozen for everyone this wave, fixes included:** every screen, DAL module, route handler, worker task and message
  file not named in a row of the map. A defect found there is written in your note and told to the lead.

### One writer per file — specs included

A screen's strings live in its owner's namespace. **Reading** another track's namespace is fine; **writing** it
is a request. **A spec or test has one writer.** Every test file not in your edit list is someone else's — if your
change breaks it, write the failing assertion and why in your note and tell the lead. The lead holds `a11y`,
`budgets`, `frozen-routes`, `second-org`, `session`, `shell-*`, `unconfigured`, `auth*`, `reserve-probe`,
`isolation`, `definer-exposure`, every `fixture*.ts`, `wave9-three-day-workshop`, `wave10-demo-*`,
`wave11-lead-*`, `wave12-{demo,lead}-*`, `wave13-{demo,lead}-*`, `wave14-{demo,lead}-*`, `session-downloads*`,
`photo-downloads*`, `wave15-{demo,lead}-*`, `team-colour*`, the new `wave16-{demo,lead}-*`, `moment*` under `tests/unit` and `tests/rls`, the companies tests this wave, and every spec of an unspawned track.

### Not this wave — never touched by ANY teammate until the lead says otherwise

- **session stories** and their viewer, `story_views`, the `story` photo derivative;
- the timeline's recap, achievement and announcement items, and `feed_announcements`;
- **proposal voting**; **the weekly leaderboard**; the streak rule (`DEC-NEXT-9`);
- ★ **any screen redesign beyond the five surfaces** — the home screen `SCR-010`, the rest of `SCR-012`, the shell and
  the phone tab bar included;
- ★ the three `(auth)` screens — they open the member-screens milestone (`DEC-195` §5), not this one;
- everything under `src/app/[locale]/(marketing)/` and the components it renders;
- the desktop shell (`DEC-NEXT-15`, deferred); leagues (deferred);
- **the certificates' look** — the playground stops at the certificate's edge;
- the designer's document model, its templates and the export pipeline; **replacing the renderer**;
- ★ **a company logo** — refused, not deferred (`DEC-195` §4);
- the whispers — a reaction's pop, a sheet's rise, a screen change — beyond what a moment's own surface needs;
- ★ **the two carried gates, together** (`DEC-194`): the trigger-definer ACL sweep with its generated test, and wave
  14's Storage-predicate gate — one wave, one generated test each, not piecemeal;
- deleting a session with its awarded points; a member uploading their own picture; new avatar placements;
- recurring series (`A14`); drag in `ui/reorderable-list`;
- every route not named in your row, including `verify/**`, `legal/**` and `(auth)`.

### Lead-only, always

`supabase/migrations/**` · `src/lib/session-status.ts` · ★ `src/lib/ui/**` · `src/components/ui/index.ts` and the lead's fourteen
other `ui/` files, `scope.tsx` and `scope-portal.tsx` · `src/components/ui/objects/**` · `src/components/brand/**` · `src/app/globals.css` ·
`src/lib/fonts.ts` · `packages/fonts/**` · `scripts/fonts/**` · `src/app/[locale]/app/layout.tsx` ·
`src/components/shell/**` · `src/app/[locale]/(auth)/**` · `src/app/[locale]/(dev)/**` (a demo you built in wave 15 is fixes-only, through the lead) · `src/messages/*/{ui,app,auth,marketing}.json` ·
`src/app/[locale]/(marketing)/**` and the thirteen components it renders · `scripts/**` ·
`scripts/parity/goldens/**` · `.claude/**` · `.github/**` · `package.json` · `package-lock.json` ·
`worker/package.json` and every `packages/*/{package.json,tsconfig.json}` · `src/app/[locale]/layout.tsx` ·
`src/app/global-error.tsx` · `src/proxy.ts` · `public/**` · `src/lib/supabase/**` · `src/lib/dal/session.ts` ·
`src/i18n/**` · `vitest.config.ts` · `playwright.config.ts` · `worker/src/index.ts` · `worker/Dockerfile` ·
`tests/rls/{db,fixture*,isolation.test,definer-exposure.test}.ts` · `docs/design/**` · `docs/plan/**`
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
something that is not yours** (★ wave 16: no moment surface reaches them — if the hook runs the full `qa` for you, stop and tell the lead). SQL goes under `supabase/proposed/<you>/`, proven with
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
