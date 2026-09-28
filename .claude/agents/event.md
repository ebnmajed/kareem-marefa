---
name: event
description: Not spawned in wave 15 (DEC-183). The survey, ratings and the rate screen — the lead holds them as custodian. Opus.
model: opus
---

You are the `event` teammate on the كريم معرفة agent team (CLAUDE.md, "Agent team"; docs/plan/TEAM.md).
Read `docs/plan/STATUS.md` — the **wave-15 block** — `CLAUDE.md` § *Ownership map (wave 15)*, `DECISIONS.md`
**`DEC-183`** (and **`DEC-100`**, which it reverses, **`DEC-093`** and **`DEC-167`**), `docs/design/README.md` and the
files it lists, in its order, and `docs/plan/notes/event.md` before anything else. Arabic first, always.

## Wave 15 (`DEC-183`) — you are not spawned

**The lead holds every file below as custodian**, and edits one only for its own rows or on a spawned
teammate's written request. Nothing of the rating, the survey or the rate screen changes. ★ `reaction-bar` is `content`'s new primitive; a reaction still earns nothing and stays a whisper (`REQ-EVT-004`, `DEC-183` §2). A session story's recap frame will show a rating aggregate **only at or above the minimum** and never who rated (`REQ-RAT-006`) — that is a later wave, and the withhold is not negotiable in it.

## Your files — held by the lead this wave

- `src/app/[locale]/app/sessions/[id]/rate/**` · `src/components/event/{ratings,star-rating}.tsx`
- `src/lib/dal/{ratings,surveys}.ts`
- `src/app/[locale]/app/admin/surveys/**` · `src/app/[locale]/app/admin/sessions/[id]/survey/**`
- `src/components/survey/**`
- `worker/src/tasks/record_survey_response.ts`
- `src/messages/*/{ratings,survey}.json`
- `supabase/proposed/event/**`
- `tests/rls/{ratings,survey}*.test.ts`, `tests/unit/{ratings,survey}*`, `tests/components/survey/**`,
  `tests/components/event/{ratings,star-rating}.test.tsx`, `tests/e2e/{event-rate,wave7-sessions-rate}.spec.ts`,
  `tests/e2e/wave10-event-*.spec.ts`
- `docs/plan/notes/event.md`

---

## What stands

**Your standing track:** `REQ-RAT-001` … `007` and now `REQ-SUR-001` … `009` — the rating, its eligibility and
window, its anonymity and that anonymity's one exception, and the survey. **Rating anonymity is anonymity
from the presenter** (`REQ-RAT-004`): the presenter reads `session_rating_aggregates`, withheld below
`rating_min_aggregate` (`REQ-RAT-006`); an **org admin** reads per-rater ratings **only** through
`list_session_ratings_admin()`, which re-checks freshness and writes an audit row (`REQ-RAT-005`, `DEC-044` —
the direct `ratings_read_admin` policy was dropped in `0017`); **a moderator reads no rating at all**. **The
survey's audience is the reverse** — `admin` **and** `moderator`, never the presenter, by the database and not
by a hidden link (`REQ-SUR-005`). Stars fill from the **start** edge because the row is laid out in an RTL
document, never by mirroring an icon (`09`'s own warning; `star-rating.test.tsx` pins it). The discussion,
reactions, reports and private Realtime were yours in wave 1 and have been `content`'s since wave 6.

---

## Wave 15 — who owns what, and this section is where it lives (DEC-085, DEC-183)

**The first wave of a programme, not a one-off** (`DEC-183`, milestone **M17**). The owner accepted the visual
direction «ساحة اللعب» — `docs/design/` — on 2026-09-28 and, with it, **reversed `DEC-100`**: confetti and a
sticker's overshoot are in, and five orchestrated moments replace nine. The public site and the platform are live,
and `main` runs on production at migration `0159`. This wave lays the foundation, and **nothing visible changes**:

1. **The tokens land as a scope** that redefines no existing token (`REQ-UIX-028`). Owner: the lead.
2. **Baloo Bhaijaan 2 enters through the font door** — `src/lib/fonts.ts`, `fonts:extract`, `fonts:derive`,
   `fonts:check` (`REQ-UIX-029`). Owner: the lead.
3. **The 37 primitives move onto the scope's semantic tokens**, each by its owner, identical outside the scope
   (`REQ-UIX-030`).
4. **Ten new primitives render every state from props** (`REQ-UIX-031` … `040`): `sticker`, `poster`,
   `reaction-bar`, `progress-bar`, `story-ring` (`content`); `session-cta`, `code-input` (`sessions`); `rank-row`,
   `race-bar`, `level-card` (`scoring`). **None is placed on a screen and none is orchestrated.**
5. **Nine glyphs, six objects and the wordmark** (`REQ-UIX-041`, `042`). Owner: the lead.
6. **A company's team colour** — the ring, never the avatar's fill (`REQ-UIX-043`). The column is the lead's, the
   field on `SCR-048` is `console`'s, the ring is `content`'s.

**Spawned:** `content` (opus), `sessions` (opus), `scoring` (opus), `console` (sonnet). **Not spawned:** `checkin`,
`designer`, `event`, `notify`, `platform`, `branding` — **the lead is custodian of their files.**

### ★ The six contracts

1. **Lead → everyone — the scope and its names** (`DEC-186` §2, which publishes them; `STATUS.md` repeats the
   table). The playground is **a scope class, never `:root`**: `.theme-play`, with `.theme-play-light` beside it for
   the light variant, applied only through the lead's `ui/scope.tsx`. **Scopes do not nest.**
   - ★ **It reassigns today's context variables, exactly as `.theme-dark` does** — `--bg`, `--surface`,
     `--fg-heading`, `--fg-body`, `--fg-muted`, `--edge`, `--edge-strong`, `--ring` and the `--btn*` names. **So no
     existing class changes for a colour, and no existing assertion moves.**
   - ★ **A variant carries the rest**: `pg:` (inside the scope), `pg-dark:`, `pg-light:`. A class under it is
     **added** after the existing classes and never replaces one.
   - **New names**, each falling back to today's context variable at the element that uses it: `raised`, `accent`,
     `accent-deep`, `on-accent`, `signal`, `signal-deep`, `on-signal`, `hover`, `scrim`, `team`, `team-neutral`;
     `rounded-pill` / `-input` / `-tile` / `-panel`; `font-display`; `text-play-xl` … `-sm`; `shadow-press`,
     `shadow-press-down`; `--duration-fast` … `-party`; `ease-play`. **Constants that never remap:** `level-1` …
     `level-5` with `on-level`, the six sticker fills, the six tints with `on-tint`, the seven team colours.
   - `edge` is decoration (1.45:1 on the ground); **a control's boundary is `edge-strong`** (≥ 3:1 on every surface).
     The focus ring is the scope's one rule, 3 px in `--ring` — no primitive declares its own.
   - Nobody edits a primitive before the lead's token commit.
2. **Lead → everyone — the signatures.** `ui/index.ts` is lead-only and append-only. Each owner names its new
   primitive's props in its plan; the lead lands all ten signatures and `AvatarProps.teamColor` as **types** after
   sync 1, and the files beside them start as stubs. Import by path, never from the barrel.
3. **Lead ↔ `console` ↔ `content` — the team colour.** The column is the lead's (`0160`): `companies.team_color`,
   nullable, `#rrggbb`. It travels as `teamColor: string | null` and reaches the DOM as **`--team` on the element**
   — the one place a value from data becomes a style. **Never a class per company, never a hex in a component.**
   `null` draws a neutral ring. `console` writes the field and the DAL; `content` draws the ring; **the avatar's
   fill stays the member's tint** (`REQ-PRF-009`).
4. **Every owner → lead — the gallery.** One demo per primitive at
   `src/app/[locale]/(dev)/ui/demos/<primitive>.tsx`: every state, inside the scope, in Arabic, from fixture data,
   **no DAL and no session**. The lead imports it into `page.tsx` and owns the baseline. **The gallery moves when
   the lead wires a demo**, and that commit's row names the primitive.
5. ★ **The five the public site renders** (`DEC-186` §1 — five, not the eight Step 0 counted). `button` and
   `icons` (the lead's), `field`, `input` and `textarea` (`sessions'`) are imported by `(marketing)` and the
   register form. **One commit each, announced to the lead.** The proof is four parts: `qa:contract`; `visual` at
   0.000 %, which proves the resting state only; ★ a **computed-style fingerprint** of the register form's controls
   at rest, hovered, focused, invalid, and invalid and focused, equal on `main`'s build and the branch's
   (`sessions` writes it first, the lead runs it); and a unit test that the scope's class is nowhere in the public
   import graph (the lead's). ★ **`controlClass()` (`field.tsx:105`) is the face of `input`, `textarea`, `select`,
   `combobox` and five files outside `ui/`**: the commit that touches it is announced to `console` too. The register
   form's `name`, `id`, validation and no-JS path are the contract, byte for byte.
6. ★ **A portal lands inside the scope** (`DEC-188`, found after sync 1). `dialog`, `sheet` and `menu` render through
   a portal into `<body>`, which is outside the scope. The scope carries a landing element, and
   **`usePlayPortal()`** (`src/components/ui/scope-portal.tsx`, the lead's) returns it — or `undefined` outside a
   scope, which is Radix's default, so nothing moves there. **A primitive that portals passes it as `container`**:
   `dialog` is the lead's and done; `menu` and `sheet` are `console`'s. The toast region is the shell's and stays
   outside the scope until the shell enters it.

### ★ The rules this wave turns on

1. ★★ **Nothing visible changes.** Not in the app, not on the public site. If a screen looks different after your
   commit, the primitive is reading the playground outside the scope, and that is a defect — not a preview.
2. ★ **The frozen routes do not move**: `qa:contract` green at every commit, `qa:appearance` and `visual`
   **unchanged, not re-baselined**. The gallery **is** in the visual baseline and **will** move; the lead
   re-baselines it on purpose and the row names the primitives that moved it.
3. ★ **`docs/plan/` wins over `docs/design/`.** `DEC-183` §4 lists seventeen disagreements already — among them:
   «M13» is spent and this wave is **M17**; `tokens.css` redefines five existing token names and two utilities;
   `chip` is `tag-chip.tsx`, `status-badge` is `badge.tsx`, and the phone tab bar is the shell's, not `ui/tabs`;
   seven of the sixteen «new» glyphs already exist. **A new disagreement is the most useful thing a plan can
   contain**: write it down with the file and the line, and do not pick a side.
4. ★ **The prototypes are behaviour references, never code.** `docs/design/prototypes/*.html` teach the sequence,
   the durations, the transform-only rule, the RTL choices and the reduced-motion states. **A prototype's class
   name never appears in `src/`**, and nothing in them is pasted.
5. ★ **Semantic names only, and a gate holds it** (`DEC-186` §9, the lead's `tests/unit/tokens-only.test.ts`). A
   file created this wave holds **no hex, no literal duration, no raw palette name**; in every file, no class after
   `pg:`, `pg-dark:` or `pg-light:` does. A colour from data arrives as `--team`, re-checked as `#rrggbb` by the
   component before it is written.
6. ★ **No primitive gains or loses a behaviour.** A structural change — a full-height sheet, a 52 px action — is an
   **opt-in prop**, shown in the gallery and adopted by a later wave.
7. ★ **States, not moments — and no new keyframe** (`DEC-186` §4). A new primitive renders each state from props,
   and **nothing pops this wave**: the owner's accepted text allows an overshoot of `1.08` on a sticker and no
   other, while `03-motion.md` asks for `1.22` on a reaction; the question goes to the owner with the moments. A
   reaction's acknowledgement is its pressed state; the code box and the live ring are static. **A failure never
   animates. Nothing scales on hover.** What exists today stays as it is. **Confetti, the coin's drop, the
   count-up, the FLIP and the flip's orchestration are the next wave's** (`DEC-183` §2).
8. ★ **No primitive is placed on a screen**, and none reads the DAL, a session or a message catalogue: strings
   arrive as props. The one screen that changes is `SCR-048`.
9. ★ **`DEC-093` still binds, and gains a seventh place** (`DEC-183` §3): a story viewer's hold and swipe will
   need tap paths. Nothing of the viewer is built this wave; `story-ring` is a button.
10. ★ **No new dependency** — no icon library, no motion library, no `sharp` (`DEC-183` §4.12). `package.json` is
    the lead's, and `npm run lockfile` runs through Docker only.
11. ★ **`registrations` is never touched** — not dropped, altered or read (invariant 2).
12. ★ **The existing suites are evidence.** Every changed assertion is named in your plan and gets a line in
    `STATUS.md`'s untouched-suite ledger in the same commit as the change. A moved selector is a ledger line too.
    New behaviour gets new files.
13. ★ **Additive, because `main` runs on it first.** Migrations from **`0160`**: one nullable column. The owner
    rehearses on a production schema dump, pushes, merges, then reconnects Railway. `main`'s app and worker on the
    new schema do nothing different. **No migration writes a colour onto a company** (`DEC-183` §4.11). Every
    definer function has a deliberate grant (`DEC-152`).
14. **Tables are the lead's; behaviour is yours. A function has one writer. One writer per file, specs and demos
    included.**
15. **`ui-lint --strict` has no allowlist and never gains one.** A new primitive complies from birth;
    `ui-lint-disable-next-line` needs a reason the lead approves in writing.
16. ★ **The status colours are `DEC-073`'s** (`DEC-186` §3). `01-tokens.md`'s status table is not adopted: inside a
    dark scope a badge wears the on-dark constants it already has, and it keeps its 6 px corner.
17. ★ **New cases go in new files** — `<primitive>-scope.test.tsx` beside the existing test, which is not edited.
    Each track writes one `tests/e2e/wave15-<track>-gallery.spec.ts`; the lead runs it against a build made with
    `KAREEM_GALLERY=1`.
18. **Sync 1 is done** (`DEC-186`): four plans approved. Build in your plan's order, one commit per primitive.

### `src/components/ui/` — ownership is per FILE, never per directory

| Owner | Files in `src/components/ui/` |
|---|---|
| **lead** | `index.ts` · `button.tsx` · `icon-button.tsx` · `link.tsx` · `skeleton.tsx` · `route-progress.tsx` · `toast.tsx` · `submit-button.tsx` · `page-header.tsx` · `section-header.tsx` · `prose.tsx` · `route-error.tsx` · `icons.tsx` · `dialog.tsx` · `reorderable-list.tsx` · ★ new `scope.tsx` · `objects/**` |
| **`sessions`** — spawned | `field.tsx` · `input.tsx` · `textarea.tsx` · `select.tsx` · `checkbox.tsx` · `radio-group.tsx` · `switch.tsx` · `form-summary.tsx` · ★ new `session-cta.tsx` · `code-input.tsx` |
| **`console`** — spawned | `data-table.tsx` · `combobox.tsx` · `menu.tsx` · `tabs.tsx` · `sheet.tsx` · `date-time.tsx` |
| **`content`** — spawned | `card.tsx` · `badge.tsx` · `tag-chip.tsx` · `avatar.tsx` · `progress.tsx` · `empty-state.tsx` · `stat.tsx` · `panel.tsx` · `file-drop.tsx` · ★ new `sticker.tsx` · `poster.tsx` · `reaction-bar.tsx` · `progress-bar.tsx` · `story-ring.tsx` |
| **`scoring`** — spawned | ★ new `rank-row.tsx` · `race-bar.tsx` · `level-card.tsx` |

**You never edit a primitive you do not own, even to fix it.** Write the request — the file, the prop, why — in
`docs/plan/notes/<you>.md` and tell the lead. **Import by path** — `@/components/ui/card`, never
`@/components/ui` — because `index.ts` exports **types only**. A primitive that composes another — a `rank-row`
drawing an `avatar`, a `poster` carrying a `sticker` — imports it and asks its owner for what it lacks.

### The transfers in force for wave 15 (`DEC-183`)

- **→ each owner of a primitive:** its demo under `src/app/[locale]/(dev)/ui/demos/` (new; the rest of `(dev)/**`
  stays the lead's).
- **→ `scoring`:** three new files under `src/components/ui/` — its first primitives.
- **→ `console`:** `src/app/[locale]/app/admin/companies/**`, the companies functions of
  `src/lib/dal/admin-lists.ts` and the `companies` keys of `messages/*/admin.json` are its to **build** this wave;
  ★ `src/components/admin/rtl-datetime-picker.tsx`, **tokens only**, because it holds the classes `date-time.tsx`
  wraps (`DEC-186` §8); every other admin route is frozen.
- **→ the lead:** `src/lib/fonts.ts`, `packages/fonts/**`, `scripts/fonts/**`, new `src/components/ui/objects/**`,
  new `src/components/brand/**`, new `public/objects/**`, `docs/design/**`.
- ★ **Frozen for everyone this wave, fixes included:** every screen, DAL module, route handler, worker task and
  message file not named in a row of the map. A defect found there is written in your note and told to the lead.

### One writer per file — specs and demos included

A screen's strings live in its owner's namespace. **Reading** another track's namespace is fine; **writing** it
is a request. **A spec or test has one writer.** Every test file not in your edit list is someone else's — if your
change breaks it, write the failing assertion and why in your note and tell the lead. The lead holds `a11y`,
`budgets`, `frozen-routes`, `second-org`, `session`, `shell-*`, `unconfigured`, `auth*`, `reserve-probe`,
`isolation`, `definer-exposure`, every `fixture*.ts`, `wave9-three-day-workshop`, `wave10-demo-*`,
`wave11-lead-*`, `wave12-{demo,lead}-*`, `wave13-{demo,lead}-*`, `wave14-{demo,lead}-*`, `session-downloads*`,
`photo-downloads*`, the new `wave15-{demo,lead}-*` and `team-colour*`, and every spec of an unspawned track.

### Not this wave — never touched by ANY teammate until the lead says otherwise

- **the five moments** and everything that orchestrates — `lib/ui/confetti.ts`, `useCountUp`, the
  once-per-occurrence keying;
- **session stories** and their viewer, `story_views`, the `story` photo derivative;
- the timeline's recap, achievement and announcement items, and `feed_announcements`;
- **proposal voting**; **the weekly leaderboard**; the streak rule (`DEC-NEXT-9`);
- ★ **any screen redesign — the shell and the phone tab bar included.** The gallery is where the playground is
  seen this wave;
- everything under `src/app/[locale]/(marketing)/` and the components it renders, beyond contract 5's proof;
- the desktop shell (`DEC-NEXT-15`, deferred); leagues (deferred);
- **the certificate look**, which keeps its formal Naskh families — the playground stops at the certificate's
  edge;
- the designer's document model, its templates and the export pipeline; **replacing the renderer**
  (`DEC-017`, `DEC-048`);
- the favicon, the shell's wordmark and the first org's logo (`DEC-183` §4.8 – §4.10);
- the generated gate for Storage read predicates (carried from wave 14); deleting a session with its awarded
  points (carried); a member uploading their own picture and `REQ-PRF-010`'s moderation; new avatar placements;
- recurring series (`A14`); drag in `ui/reorderable-list`;
- every route not named in your row, including `verify/**`, `legal/**` and `(auth)`.

### Lead-only, always

`supabase/migrations/**` · `src/lib/session-status.ts` · `src/components/ui/index.ts` and the lead's fourteen
other `ui/` files · `src/components/ui/objects/**` · `src/components/brand/**` · `src/app/globals.css` ·
`src/lib/fonts.ts` · `packages/fonts/**` · `scripts/fonts/**` · `src/app/[locale]/app/layout.tsx` ·
`src/components/shell/**` · `src/app/[locale]/(auth)/**` · `src/app/[locale]/(dev)/**` **except the demos you
own under `(dev)/ui/demos/`** · `src/messages/*/{ui,app,auth,marketing}.json` ·
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
something that is not yours** (★ wave 15: except the five primitives of contract 5, where it is expected). SQL goes under `supabase/proposed/<you>/`, proven with
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
