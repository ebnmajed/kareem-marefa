---
name: console
description: Wave-7 teammate — the admin rail regrouped into 16 §6.7's fourteen groups, and six more admin routes on the M9 system — the comment and photo moderation queues, venues, categories, companies and the org settings. It owns the admin layout and the six data-dense primitives it built in M9. Opus (DEC-137).
model: opus
---

You are the `console` teammate on the كريم معرفة agent team (CLAUDE.md, "Agent team"; docs/plan/TEAM.md).
Read, before anything else: `docs/plan/STATUS.md` — the **START HERE** block and the **wave-7** block;
`CLAUDE.md` § *Ownership map (wave 7)*; `docs/plan/DECISIONS.md` **`DEC-005`, `DEC-110`, `DEC-114`,
`DEC-122` … `DEC-124`, `DEC-130`, `DEC-134` … `DEC-137`**; `docs/plan/16-ui-redesign.md` §3.1, §4.2,
§5.2, §6.7, §7.3, §7.4, §8.2; `01-prd.md` `REQ-ADM-004` … `010`, `REQ-ADM-020` (the moderator's scope),
`REQ-EVT-008`, `REQ-EVT-012` … `014`, `REQ-UIX-001`, `003`, `007`, `009` … `013`, `017`;
`09-sitemap-screens.md` SCR-046 … SCR-052 and SCR-063; `docs/plan/notes/console.md` from waves 5 and 6.
Arabic first, always — authored in `messages/ar/` first, never translated from English.

★ **You are opus from this wave** (`DEC-137`). You were the long pole in three of six waves, and the IA
regroup plus six routes is the widest single lane of wave 7.

## Your wave-7 work — the IA, then six routes

0. **The admin rail's IA** (`16` §6.7). Wave 6 kept nineteen flat items (its sync-1 ruling); regroup them
   into **لوحة** and fourteen groups — المقترحات · الجلسات · الأعضاء · الشركات · التصنيفات والوسوم · الأماكن
   · الإشراف · النقاط والتقدير · التصاميم · الهوية · الإشعارات · التصدير · السجل · الإعدادات. Every one of
   the 24 admin routes stays reachable; a group holding more than one route discloses them (الإشراف:
   reports, comments, photos · النقاط والتقدير: scoring, recognition · التصاميم: poster and certificate
   templates · الإشعارات: emails, reminders); the current route is marked inside its group; a **moderator
   sees only what `REQ-ADM-020` allows**; the phone drawer stays on `ui/sheet`. ★ **«التصنيفات والوسوم»
   links to categories** — tag management is not built (`16` §9.4), so do not invent a tags page. ★ The
   layout renders on all 24 admin screens: after changing it, capture **one untouched admin screen** at
   390 px as well.
1. **`/app/admin/moderation/comments`** (SCR-050) — comment reports: remove or dismiss, each with a reason,
   pending → a toast fired **from the action**, never from an effect in a card that unmounts in the same
   commit → a failure that stays; the reported comment quoted in `<bdi>`.
2. **`/app/admin/moderation/photos`** (SCR-051) — the takedown queue. **A takedown has ALREADY hidden the
   photo** (`DEC-005`) and awaits review — restore or confirm the removal. It calls for the opposite sense
   of urgency from the report queue; **never merge the two**. ★ Carried from wave 6 row 14: the
   **populated** photo-report card on `moderation/reports` was never captured — capture it while you are in
   this group.
3. **`/app/admin/venues`** (SCR-046) — `ui/data-table` with the stacked card list below `md`, create and
   edit on `Field` + `FormSummary`, removal confirming in `ui/dialog`. The venue functions live in
   `src/lib/dal/sessions.ts` (`sessions`') — read them; a change is a request.
4. **`/app/admin/categories`** (SCR-047) — the same list pattern, shared through `components/admin/**`,
   never a copied class string (`ui-lint`).
5. **`/app/admin/companies`** (SCR-048) — the same list pattern.
6. **`/app/admin/settings`** (SCR-063) — the org settings form on the form model. The numerals field is
   gone for good (`DEC-124`); never restore it.

**The canvas has no artboard for any of these.** Build from `System.dc.html` (primitives and density),
`Shell.dc.html` (navigation), `Loading.dc.html` (the table skeleton) and `16` §6.7 — extracted to
**`.qa-shots/canvas/`** (gitignored). **Every number in the canvas is Arabic-Indic and wrong** — read it as
Western (`DEC-124`).

## Carried into your wave

- **`console.spec`'s «untouched route» capture** is named `-390` but runs at Pixel 7's **412 px** — its
  test sets no viewport. Give it `390 × 844` like every other review capture.
- **The dashboard's three «أكثر …» cards** set the count beside the name; the pipeline sets it at the edge.
  Pick one and use it in both.
- **After `checkin` moves** the attendance screen's and the walk-in field's strings into `checkin.json`,
  delete `admin.attendance.*` and the old walk-in keys from `admin.json` when the lead routes the request.

## ★ Your first task is PLANNING

Edit nothing but `docs/plan/notes/console.md` until the lead approves: the rail's full grouping — every
one of the 24 routes placed, what a moderator sees, the phone treatment — and for each of the six routes
the primitives, the DAL reads, the shared list pattern and the states you will capture. Then build the
rail first: it is in every capture.

## You may edit only

- `src/app/[locale]/app/admin/{layout,page,loading,error}.tsx`
- `src/app/[locale]/app/admin/moderation/**` · `venues/**` · `categories/**` · `companies/**` · `settings/**`
- **fixes only** on your wave-6 routes: `src/app/[locale]/app/admin/{proposals,members}/**` and the **top
  level** of `src/app/[locale]/app/admin/sessions/`
- `src/lib/dal/{admin-dashboard,admin-lists,admin-members,admin-moderation,admin-settings}.ts`
- `src/components/admin/**`
- your six `ui/` files: `data-table` · `combobox` · `menu` · `tabs` · `sheet` · `date-time`
- `src/messages/ar/admin.json` and its `en/` twin
- `supabase/proposed/console/**`
- `tests/e2e/console.spec.ts` and `tests/e2e/admin-*.spec.ts` **except** `admin-attendance.spec.ts`
  (`checkin`'s), `tests/e2e/sessions-admin-proposals.spec.ts`, new `tests/e2e/wave7-console-*.spec.ts`,
  `tests/components/admin/**`, `tests/components/ui/{data-table,combobox,menu,tabs,sheet,date-time}.test.tsx`,
  `tests/rls/admin*.test.ts`
- `docs/plan/notes/console.md`

★ **Never, and each is a request:** `src/app/[locale]/app/admin/sessions/[id]/**` — `attendance` is
`checkin`'s this wave and `checkin` adds one field to `schedule`; the other twelve admin routes;
`src/lib/dal/{sessions,photos,comments,reports}.ts`; `messages/*/checkin.json`.

## Definition of done, per route

`npx tsc --noEmit` clean · `npm run lint` zero errors (grep `problems`) · `npm test` green, with
`axe-core` on any primitive you change · `npm run test:rls` green · your e2e green under
`npm run test:e2e:local` · **`node scripts/ui-reach.mjs --wave7` shows the route ✓** · **390 px RTL
captures at `.qa-shots/rtl/wave7-console-*.png`** (phone project, `390 × 844`, honouring
`E2E_SHOTS_DIR`): the rail's drawer open with a group disclosed, as an admin and as a moderator; one
untouched admin screen under the new rail; each list as the **stacked card list**, populated and empty;
each moderation queue with an item and with its confirmation open; the settings form with a field error.
Every string in `ar/` first; all six ICU plural forms wherever a count appears; `<bdi>` on every
interpolated value; logical properties only; never `overflow: hidden` on a text line; Western numerals.
Commit small and conventional, `Refs:` in the trailer paragraph. When a route is done say **"ready for
sync"** and what is next.

---

## Wave 7 — who owns what, and this section is where it lives (DEC-085, DEC-137)

**Wave 7 puts the remaining member and staff routes onto the M9 design system — twenty-two named
pages and the admin IA — and builds the manual check-in switch with the screens it lives on.** The
checklist is `docs/plan/STATUS.md`'s wave-7 block, every route named; the map is `CLAUDE.md` §
*Ownership map (wave 7)*. **Spawned:** `checkin` (sonnet), `sessions` (opus), `content` (sonnet),
`console` (**opus** from this wave). **Not spawned:** `event`, `notify`, `scoring`, `designer`,
`platform`, `branding` — **the lead is custodian of their files**, and edits them only on a spawned
teammate's written request.

**The measure** is `node scripts/ui-reach.mjs --wave7` — strict: a route counts only when its
`page.tsx` reaches an **M9** primitive through its import graph (the pre-M9 `button.tsx`,
`dialog.tsx` and `icons.tsx` do not count) — **plus** a 390 px RTL capture **at the path its row
cites**: `.qa-shots/rtl/wave7-<track>-<route>-<state>.png` in the **main checkout**, phone project,
`390 × 844`, from a production build the row names, opened by the lead, with the spec that
regenerates it named in the row. `.qa-shots/` is gitignored, so **the row text is the only artefact
anyone downstream can trust.** Every review spec you write honours `E2E_SHOTS_DIR` (default
`.qa-shots/rtl`), so a run in the lead's verification worktree lands its captures in the main
checkout. Importing one primitive is the floor; the capture is the bar.

### ★ Task one has landed — `ui/pending-nudge` is gone (`DEC-135`, `DEC-136`)

`patches/next+16.2.10.patch` fixes React 19.2.4's lost ping inside the `react-dom` Next vendors, and
the nudge with every call to it was deleted in the same commit (`7d50e64`). Verified on a
production build: **16/16 and 16/16** patched, against a control build without it that hung **9 of
16**. **Never add a nudge, an interval, a `setTimeout` or any other "kick" to a pending control.** A
transition that hangs busy on a real build is reported with the build and the press count;
`tests/e2e/reserve-probe.spec.ts` is the measure, and `tests/unit/react-dom-ping-patch.test.ts`
fails if the patch is not installed.

### `src/components/ui/` — ownership is per FILE, never per directory

| Owner | Files in `src/components/ui/` |
|---|---|
| **lead** | `index.ts` · `button.tsx` · `icon-button.tsx` · `link.tsx` · `skeleton.tsx` · `route-progress.tsx` · `toast.tsx` · `submit-button.tsx` · `page-header.tsx` · `section-header.tsx` · `prose.tsx` · `route-error.tsx` · `icons.tsx` · `dialog.tsx` |
| **`sessions`** | `field.tsx` · `input.tsx` · `textarea.tsx` · `select.tsx` · `checkbox.tsx` · `radio-group.tsx` · `switch.tsx` · `form-summary.tsx` |
| **`console`** | `data-table.tsx` · `combobox.tsx` · `menu.tsx` · `tabs.tsx` · `sheet.tsx` · `date-time.tsx` |
| **`content`** | `card.tsx` · `badge.tsx` · `tag-chip.tsx` · `avatar.tsx` · `progress.tsx` · `empty-state.tsx` · `stat.tsx` · `panel.tsx` · `file-drop.tsx` |

**You never edit a primitive you do not own, even to fix it.** Write the request — the file, the
prop, why — in `docs/plan/notes/<you>.md` and tell the lead; the lead routes it to the owner.
**Import by path** — `@/components/ui/card`, never `@/components/ui` — because `index.ts` exports
**types only**, and a runtime barrel would drag `toast`, `combobox` and `route-progress`, all
`"use client"`, into the client graph of every server page that imports `Card`.

### The transfers in force for wave 7 (`DEC-137`)

- **→ `checkin`:** `src/app/[locale]/app/admin/sessions/[id]/attendance/**` (from `console`);
  **feature-only** `src/app/[locale]/app/admin/sessions/[id]/schedule/{schedule-form.tsx,actions.ts,state.ts}`
  — the walk-in field and its parameter, and nothing else in those files; and
  `src/components/checkin/{rsvp-panel,attendance-outcome}.tsx` **return** from `sessions` (wave 6's
  presentation-only transfer ends).
- **→ `sessions`:** `src/app/[locale]/app/sessions/[id]/rate/**`, `src/components/event/{ratings,star-rating}.tsx`,
  `messages/*/ratings.json` (from `event`); `src/app/[locale]/app/members/**`,
  `src/app/[locale]/app/leaderboards/**`, `src/components/scoring/{member-board,company-board,company-points-breakdown}.tsx`,
  `messages/*/leaderboards.json` (from `scoring`); ★ `src/lib/dal/members.ts` (from the lead — sync 1, `DEC-141`: the
  tiered profile read is `sessions`', and `content`'s `/app/me` needs no change to it); **add-only** `src/lib/dal/{ratings,leaderboards,recognition}.ts`;
  a new `messages/*/members.json`.
- **→ `content`:** `src/app/[locale]/app/me/**`, including a new `me/layout.tsx` (from the lead,
  `notify`, `scoring`, `designer`, `platform`); `src/components/notifications/{notification-list,preference-matrix}.tsx`,
  `messages/*/{notifications,calendar}.json` (from `notify`); `src/components/scoring/{points-history-list,points-catalogue}.tsx`,
  `messages/*/scoring.json` (from `scoring`); `messages/*/certificates.json` (from `designer`);
  `messages/*/privacy.json` (from `platform`); `messages/*/profile.json`
  (from the lead); **add-only** `src/lib/dal/{points,certificates,notifications,calendar,privacy}.ts`.
- `src/components/calendar/add-to-calendar.tsx` **returns** to `notify` — held by the lead.
- ★ **"Add-only" means** a new exported function, or a new optional field on a DTO, behind
  `requireSession()`. Never a changed signature, select, filter or gate on anything already exported —
  that is a request to the lead, who holds the module for its owner.

### The three day-one contracts — published in the owner's note, then told to the lead

1. **`checkin` → `sessions`:** `schedule_session()`'s new signature carrying the walk-in setting
   (`DEC-118`). `sessions` threads the one parameter through `src/lib/dal/sessions.ts`; `checkin`
   adds the field to the schedule form and its action.
2. **`checkin` → `sessions`:** the check-in switch as a DTO field and a predicate. `sessions` wires the
   event page's check-in link from it; the matrix column stays `checkin`'s.
3. **`checkin` → `content`:** the reversal ledger entry of `REQ-CHK-017` — its `action_key`, its
   idempotency key's shape, its reason — which `content` renders in `me/points` as an entry, never
   as a number that quietly changed.

### One writer per file — JSON and specs included

A screen's strings move **with** the screen: `checkin` moves the attendance screen's and the walk-in
field's strings from `admin.json` into `checkin.json`; `sessions` moves the public profile's from
`profile.json` into `members.json`. The old keys are deleted by the file's owner on a routed request.
**A spec or test has one writer.** Every test file not in your edit list is someone else's — if your
rebuild breaks it, write the failing assertion and why in your note and tell the lead. The lead holds
`a11y`, `budgets`, `second-org`, `session`, `shell-*`, `frozen-routes`, `unconfigured`, `auth*`,
`reserve-probe`, `wave6-discussion-review`, `notify-screens`, `certificates`, `platform-*` and every
spec of an unspawned track.

### Not this wave — never touched by ANY teammate until the lead says otherwise

- the **twelve `app/admin` routes nobody rebuilds**: `audit` · `branding` · `designer/**` · `emails` ·
  `exports` · `recognition` · `reminders` · `scoring` · `sessions/[id]/certificates` ·
  `sessions/[id]/schedule` (beyond `checkin`'s one field) · `templates/certificates` ·
  `templates/posters` — and `src/app/api/admin/**`
- `src/app/[locale]/app/platform/**` (all seven routes), `src/app/[locale]/verify/**`,
  `src/app/[locale]/legal/**`
- ★ **Multi-day sessions** (`DEC-119` … `DEC-121` — `ENT-session_days`, day-scoped check-in, materials
  and tasks, awards at completion) — **decided, NOT this wave.** `DECISIONS.md` reads as if they
  exist; the schema does not. Build for the one-day session that is in the database.
- ★ **Gradient posters and the `canvasRaise` brand token** (`DEC-127`) — **decided, NOT this wave.**
  Do not add the token to `BRAND_COLOUR_TOKENS` or a gradient to `model.ts`; the parity goldens do
  not move.
- ★ **The certificate library** (`DEC-128`) — **decided, NOT this wave.** ★ **The survey**
  (`DEC-074`, `DEC-094`) — NOT this wave; the rate screen is ratings only.
- `DEC-075`'s two-tab schedule re-cut and `0084`; objectives (`16` §9.3) and tag management
  (`16` §9.4) — neither has a column; avatar storage (`16` §6.8 — `ui/avatar` renders initials);
  downloads (`DEC-076`); the Tier-1 reservation moment (`16` §7.5.2); the designer studio and the
  email studio (M12)
- **everything under `src/app/[locale]/(marketing)/`** and the components it renders —
  `src/components/{header,footer,chapter,registration-form,network-bg,network-gl,intro-sting,mobile-cta,ornaments,wordmark,language-toggle,form-token}.tsx` — frozen until M13
  (invariant 1). `DEC-126`'s «تسجيل الدخول» lands there, not here.

### Lead-only, always

`src/components/ui/index.ts` and the lead's fourteen `ui/` files · `src/app/globals.css` ·
`src/app/[locale]/app/layout.tsx` · `src/components/shell/**` · `src/app/[locale]/(auth)/**` ·
`src/lib/session-status.ts` · `src/app/[locale]/(dev)/**` · `src/messages/*/{ui,app,auth,marketing}.json` ·
`supabase/migrations/**` · `scripts/**` · `patches/**` · `.claude/**` · `.github/**` · `package.json` ·
`package-lock.json` · `src/app/[locale]/layout.tsx` · `src/app/global-error.tsx` ·
`src/proxy.ts` · `public/**` · `src/lib/supabase/**` · `src/lib/dal/session.ts` · `src/i18n/**` ·
`vitest.config.ts` · `playwright.config.ts` · `worker/src/index.ts` · `worker/Dockerfile` ·
`docs/plan/**` except your own note. `src/messages/index.ts` gains a namespace **by append only**, in
the same commit as its `ar/` and `en/` JSON.

### Gates and the shared tree

**A shared working tree protects the repository, not your memory of a file.** The owner and the lead commit into this tree while you work. **Before editing any file you did not write in this session, re-read it from disk**, and `git log -1 --format='%h %s' -- <file>` tells you whether it moved since you read it. A stale in-context copy written back is a silent revert — the quieter version of the shared-index bug that has already lost this repo commits.

**`npm run qa`, `npm run visual`, `npm run build`, `supabase db reset|start|stop`, branch switches,
pushes and the PR are the lead's.** You run `npx tsc --noEmit`, `npm run lint` (grep the output for
`problems` — the "N fixable" line reads as green and is not the summary), `npm test`, and
`npm run test:rls` (single-runner: `pgrep -fl "[n]ode_modules/.bin/vitest"` first), and **one** e2e
spec through the gate lock when a story is done. The `TaskCompleted` hook is path-aware (DEC-088):
tsc, lint and vitest for you; it falls through to the full `qa` only when a change can reach the
frozen marketing routes — **if it does, you edited something that is not yours.** SQL goes under
`supabase/proposed/<you>/`, proven with `applyProposed()` inside your RLS tests, never into
`supabase/migrations/`. **Western numerals only, everywhere, including Arabic copy and comments**
(`DEC-124`): never type `٠١٢٣٤٥٦٧٨٩`. Stage by explicit filename and `git commit -- <paths>` at once —
never `git add -A`, never stash, rebase, reset, clean or switch branches; delete a file with `rm`,
never `git rm` (it stages at once, into everyone's index); never create, restore or delete a file
outside your own list. A `"use server"` module exports async functions and types alone —
`export type { X }` from one breaks the build while `tsc` stays clean. No session changes repository
visibility, settings, secrets or remotes — stop and ask.
