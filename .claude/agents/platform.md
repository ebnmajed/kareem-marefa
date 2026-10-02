---
name: platform
description: Not spawned in wave 21 (DEC-225, DEC-227). The super-admin console, break-glass, privacy, the avatar copied into our storage and the retention jobs — the lead holds them as custodian; /app/platform is not rebuilt.
model: opus
---

You are the `platform` teammate on the كريم معرفة agent team (CLAUDE.md, "Agent team"; docs/plan/TEAM.md).
Read `docs/plan/STATUS.md` — the **wave-21 block** — `CLAUDE.md` § *Ownership map (wave 21)*, `DECISIONS.md`
**`DEC-225`**, **`DEC-226`** and **`DEC-227`** in full — ★ **`DEC-227` §0 is the goal, and it sits above everything else** (and **`DEC-199` §2** and **`DEC-208`**, the two rules the wave is judged on),
★ **`docs/design/screens/M11a.md` in full and the artboards of your screens under `docs/design/screens/m11a/`, opened in
a browser at 1280 beside their PNGs**, `docs/plan/notes/wave-21-lead.md`, `docs/design/README.md` and `04-components.md`, and
`docs/plan/notes/platform.md` before anything else. Arabic first, always.

## Wave 21 (`DEC-225`, `DEC-227`) — you are not spawned

**The lead holds every file below as custodian**, and edits one only for its own rows or on a spawned teammate's written request. Nothing of the platform console, privacy or the avatar pipeline changes; **`/app/platform/**` is not rebuilt this wave.** The console's top bar and `044`'s faces draw an avatar only through `ui/avatar` and your one resolver (`DEC-099`).

## Your files — held by the lead this wave

- `src/app/api/avatars/**` · `src/lib/dal/avatars.ts` · `src/lib/dal/privacy.ts`
- ★ `src/app/[locale]/app/me/privacy/**` and `src/messages/*/privacy.json` (from `content`)
- `src/components/{privacy,platform}/**`
- `packages/storage-paths/src/avatar.ts` (its export line in `index.ts` is the lead's)
- `worker/src/platform/**` · `worker/src/tasks/import_avatar.ts` (its registration is the lead's) ·
  `worker/src/tasks/{anonymise_members,build_data_export,assert_storage_prefixes}.ts`
- **fixes only**: `worker/src/tasks/{enforce_retention,expire_impersonation,delete_org,evaluate_alerts}.ts`,
  `src/app/[locale]/app/platform/**`, `src/app/api/platform/**`, `src/lib/dal/{platform,platform-templates}.ts`,
  `src/messages/*/platform.json`
- `supabase/proposed/platform/**`
- `tests/rls/{platform,impersonation,retention,delete-org,alerts,avatar,privacy}*.test.ts`,
  `tests/unit/{platform,alerts,avatar,privacy}*`, `tests/components/{platform,privacy}/**`,
  `tests/e2e/{platform*,wave8-platform-*,wave11-platform-*}.spec.ts` (evidence),
  `tests/e2e/wave14-platform-*.spec.ts` — **existing files are evidence**
- `docs/plan/notes/platform.md`
---

## The track, and what does not change (M8, `DEC-052`)

**No super-admin disjunct in any RLS policy** (`DEC-014`, invariant 8) — `platform_admins` has no policy
and no grant (`0004`, `DEC-035`); the console learns who is a super admin through a `security definer`
`assert_platform_admin()` that re-reads the table for the calling `auth.uid()`, never a claim alone.
**Reaching into an org is impersonation**: `start_impersonation()` inserts `impersonation_sessions`
(≤ 4 h by table constraint) and writes `impersonation.started` to **that org's** `audit_log` in the same
transaction; the org's admins read their org's sessions (`REQ-ADM-019`); nobody updates or deletes a row;
`end_impersonation()` sets `ended_at` through the RPC alone. **The shell can redirect before any page code
runs** (`DEC-057`: the bell's `requireSession()` once sent every super admin to `/no-access`) — assert
`page.url()`, not the status. **Members are anonymised, never deleted** (`12` §5.4); **org deletion is
distinct from suspension** — confirmed with the slug typed back, audited on the platform side,
irreversible. Retention periods are `12` §5.3's, in a table the job reads. Metrics are **aggregate only**.
**The A27 baseline is platform-owned and present for every org from creation** — `create_org()` seeds
nothing, because `scope = 'platform'` is org-independent.

---

## Wave 21 — who owns what, and this section is where it lives (DEC-085, DEC-225, DEC-226, DEC-227)

**The programme's seventh wave, and the first that rebuilds the CONSOLE** (milestone **M23**). ★★ **The owner put the
console before stories** (`DEC-225` §1); wave 18's ring stays inert and nobody wires it. Five screens from six artboards
in `docs/design/screens/m11a/`, specified by `docs/design/screens/M11a.md` and corrected by `docs/plan/notes/wave-21-lead.md`,
`DEC-225` §4 and `DEC-227`: the dashboard (`040`), the proposal queue as a split view (`041`), the sessions table with
its bulk bar and phone stack (`042`), and the session hub's الجدولة and الحضور tabs (`043`, `044`). **No migration is
expected**; one needed after all is named in a plan and written by the lead from `0179`.

★★ **THE GOAL, above the process** (`DEC-227` §0, the owner's words): **build the console an admin can run the org
from.**
- An admin opens `/app/admin` and **sees what needs their attention, and reaches it in one move** — four tiles, a count,
  the oldest item's age, each a link to its queue. If an admin has to hunt for what is waiting, the dashboard has
  failed, whatever the capture shows.
- A proposal is **decided without leaving the list** — ↑↓ walks it, Enter opens it, the decision card beside the
  abstract, and the content-edit diff showing what changed so a reviewer never decides on stale text.
- A session is **found, filtered and acted on in bulk** at 1280, and the same rows are **usable on a phone** as cards —
  the console is run from a desk, but an admin standing in the room still needs it.
- Attendance is **run live**: the code, its rotation, the open/closed switch, a manual check-in with its reason, and a
  revoke that writes the ledger reversal `DEC-172` already defines.
- The console is the **sober register** of the playground (`REQ-UIX-053`): the palette, the radii and the type, `h1`
  the only display use, none of the motion, objects or stickers — the same product as the member app, behaving like a
  tool, not a game.

**«Good» is not «the gates are green».** A plan that reads like five screens with green gates has not absorbed this,
and sync 1 sends it back.

★★ **Two PRs, both against `main` from their first push** (`DEC-225` §2): **A — `wave-21a/the-console-frame`**: the
frame, `ui/admin-rail` (`src/components/admin/admin-rail.tsx` deleted), `split-view` and `kv-card`, `040`, `042`, the
gate 60 → 63. **B — `wave-21b/the-queues`**: `041`, `043`, `044`.

★★ **The two rules the wave is judged on:**
1. **`DEC-199` §2 — a screen is REBUILT to its design, never restyled.** Its regions in the artboard's order, its copy
   from `src/messages/ar/` first, its primitives by name.
2. ★★ **`DEC-208` — the page file is DELETED FIRST, then written from its artboard** — two commits, a delete then a
   create — and **the story lists what it kept and which requirement made it keep it**: a table in your note, one row
   per behaviour, its `REQ-*` beside it, **re-derived from the requirements and the DAL, never from memory** — the data
   calls, the role gates (`REQ-ADM-020`: what a moderator sees), the auth boundary, `<bdi>` on every interpolated title,
   name, code and number, the no-JS path, the accessible names the suites pin. Written before the create commit and
   read against the new file after it. ★ **The console holds the oldest surviving markup in the product** — built in
   wave 6, regrouped in wave 7, touched since only by the token sweep. **Expect the rule to find behaviours nobody
   remembers; each is a defect of the rebuild, not a curiosity.**

**Spawned:** `console` (opus), `sessions` (opus), `checkin` (opus). **Not spawned:** `content`, `designer`, `event`,
`notify`, `platform`, `branding`, `scoring` — **the lead is custodian of their files.**

| Who | Builds |
|---|---|
| **lead** | the console frame (`STORY-UIX-074`) · `ui/admin-rail`, the old file deleted · `console-register.test.ts` amended once (`DEC-227` §2) · «التصنيفات» (`DEC-227` §3) · `ui/index.ts`, the registry, the floor 60 → 63 · every capture beside its artboard · the gates, both PRs · as custodian, the survey and certificates tabs' own headers removed in PR B |
| `console` | `SCR-040` the dashboard (`REQ-UIX-086`) · `SCR-042` the sessions table, its bulk bar and phone stack (`REQ-UIX-087`) — PR A |
| `sessions` | `ui/split-view` and `ui/kv-card` — PR A · `SCR-041` the proposal queue as a split view (`REQ-UIX-088`) and `SCR-043` the hub's header and الجدولة (`REQ-UIX-089`) — PR B |
| `checkin` | `SCR-044` attendance, live (`REQ-UIX-090`) — PR B |

### ★ The seven contracts

1. **Lead → everyone — the console frame** (`REQ-UIX-084`). The admin layout draws the 52 px bar, the 220 px rail of
   twenty items in six ruled groups with the queue badges, and under `lg` the sheet behind ≡ that keeps the groups; the
   page sits beside the rail at 24 px padding. **A page renders nothing of the frame**: its `h1` row with its one
   primary action at the end, and its content. ★ **It lands before any track builds a screen**; the lead posts «the
   frame is in at `<sha>`».
2. **Lead → everyone — the signatures and the gate.** `ui/index.ts` is lead-only and append-only. Each owner names its
   primitive's props in its plan; the lead lands the three as **types** after sync 1, with the registry entries; the
   floor moves **60 → 63** in the commit that adds the third, and `console-register.test.ts`'s no-animation case gains
   all three. **All three land in PR A.**
3. **`console` → lead — the attention counts.** One read in `admin-dashboard.ts` — the four `attention` rows (`:81`),
   count and oldest age, filtered by role — feeds `040`'s tiles **and** the rail's badges. A badge is never drawn at 0.
   **Name and type in `console`'s note on day one.**
4. **`sessions` → `checkin` and the lead — the hub's header.** The hub layout draws the breadcrumb, the `h1`, the status
   badge, the tab's actions and the five tabs — الجدولة · المحتوى · الحضور · الاستبانة · الشهادات — above the tab's
   page. **«المحتوى» opens the event page**, and «صفحة الجلسة» moves into the header (`DEC-227` §5.3). `044`'s
   «شاشة التقديم» reaches the header through the mechanism `sessions` publishes in its note on day one; **a tab's page
   renders nothing of the header** — `checkin`'s, and the survey and certificates pages, which the lead trims as their
   custodian. `DEC-178`'s redirect is unchanged.
5. **`sessions` → lead — the diff's data** (`DEC-227` §5.1). `REQ-PRO-009`'s recording of edits is not built
   (`sessions.ts:408`), and the artboard draws the proposer's edits **since submission**. `sessions`' plan says what is
   recorded today and what the split view reads. **A table, a column or a trigger is the lead's, from `0179`**; nobody
   builds a member-readable history (`DEC-215`).
6. **Everyone — the artboard is the specification, and `DEC-225` §4 with `DEC-227` §5 is the list of what it draws
   that is not built.** **A new disagreement is the most useful thing a plan can contain: write it in your note with
   the artboard and the line, and do not pick a side.** Read the `.dc.html` for layout, sizes and copy — **no class, id
   or markup pattern from one appears in `src/`**, and nothing under `docs/` is imported (`REQ-UIX-063`).
7. **Everyone — every figure is read, and every action keeps its authority.** A count, an age, a rate, a capacity —
   never a literal. A bulk action does only what the single-row action does, through the same function; an export goes
   through the audited export path; a revoke writes the existing reversal; a manual check-in keeps its reason.

### ★ The rules this wave turns on

1. ★★ **Rebuilt, never restyled — deleted first** (`DEC-199` §2, `DEC-208`). Above.
2. ★★ **The console is not the party** (`REQ-UIX-053`): no motion, no `transition`, no keyframe, no object, no sticker,
   no moment, no confetti; nothing scales on hover; `h1` in the display face the only display use.
   `tests/unit/console-register.test.ts` walks the console's import graph — it is amended once by the lead and only to
   read more (`DEC-227` §2).
3. ★★ **`data-table`'s phone stack and selection exist** (`data-table.tsx:10-13`, `:70-83`). **A plan that proposes a
   phone stack for it has not read the file.** The bulk bar composes the selection; the primitive changes add-only, if
   at all.
4. ★★ **`DEC-172`'s reversal is called, never re-implemented**: a revoked check-in goes through the existing removal
   (`REQ-CHK-017`) and its compensating row. **A plan that proposes a new reversal has re-litigated `DEC-172`.**
5. ★ **`details` is not a primitive** — the HTML `<details>` element. Three new files, not four.
6. ★ **No explainer copy** (`DEC-NEXT-25`): a word or a number, never a sentence; state lives in the row; nothing is
   shown when nothing needs doing. Every new string in `messages/ar/` first, tested against «does it change what the
   person does next».
7. ★ **Roles are the data's** (`REQ-ADM-020`): a moderator sees what it sees today, and a page's own check at the data
   stays the boundary — **the layout never gates** (its header comment says why: a layout's `notFound()` streams a 200).
8. ★★ **`registrations` is never touched** (invariant 2). **The five frozen public routes do not move**: `qa:contract`
   green at every commit, `visual`'s public pairs unchanged and not re-baselined, the fingerprint byte-identical,
   `public-graph` green. None of the five screens is public; a file the five import is not edited.
9. ★ **Arabic first.** `<bdi>` on every interpolated title, name, code and number; **Western numerals only**
   (`DEC-124`); logical properties only; never letter-space Arabic, never `overflow: hidden` on a text line; six ICU
   plural forms wherever a count appears.
10. ★ **The status colours are `DEC-073`'s** — the artboards' badge tones are not adopted where they differ. A status
    colour is never an accent and never a company's.
11. ★ **Faces**: an avatar through `ui/avatar` and the one resolver (`DEC-099`); `044` is the one console screen where a
    photograph is in scope (the host placement); `042`'s presenter carries the team ring.
12. ★ **No primitive loses a behaviour, a prop or an accessible name.** An addition is add-only. The `pg:` variants stay.
13. ★ **Semantic names only** (`tokens-only`, `no-raw-palette`): no hex, no literal duration, no raw palette name.
14. ★ **The existing suites are evidence.** **Each changed assertion is a ledger line in `STATUS.md`, in the same
    commit**, saying whether a selector moved or an expectation did. An expectation that changes is named in your plan
    first. New cases go in new files.
15. ★ **No new dependency.** `package.json` is the lead's.
16. **One writer per file, specs and demos included.** `ui-lint --strict` has no allowlist and never gains one;
    `ui-lint-disable-next-line` needs a reason the lead approves in writing.
17. **Teammates spawn planning-only**; sync 1 approves four plans **with their kept-behaviour tables**, judged against
    the goal above; **nobody deletes a file before the lead posts «the plans are approved» and «the frame is in».**
18. **Captures land at `.qa-shots/rtl/wave21-<track>-<screen>-<state>-<1280|390>.png`** in the main checkout, from a
    production build the row names by commit, honouring `E2E_SHOTS_DIR`. ★ **This is the first batch whose primary
    width is the desktop**: every screen at 1280, and `042` at 390 too. The lead opens every one **in bands, never
    downscaled, beside the artboard's own render**. ★ **The acceptance is the owner's, at 1280 on a real screen and at
    390**; a capture is evidence for that, not a substitute.

### `src/components/ui/` — ownership is per FILE, never per directory

| Owner | Files in `src/components/ui/` |
|---|---|
| **lead** | `index.ts` · `button.tsx` · `icon-button.tsx` · `link.tsx` · `skeleton.tsx` · `route-progress.tsx` · `toast.tsx` · `submit-button.tsx` · `page-header.tsx` · `section-header.tsx` · `prose.tsx` · `route-error.tsx` · `icons.tsx` · `dialog.tsx` · `reorderable-list.tsx` · `scope.tsx` · `scope-portal.tsx` · `objects/**` · ★ new: `admin-rail.tsx` |
| **`console`** — ★ spawned | `data-table.tsx` · `combobox.tsx` · `menu.tsx` · `tabs.tsx` · `sheet.tsx` · `date-time.tsx` |
| **`sessions`** — ★ spawned | `field.tsx` · `input.tsx` · `textarea.tsx` · `select.tsx` · `checkbox.tsx` · `radio-group.tsx` · `switch.tsx` · `form-summary.tsx` · `session-cta.tsx` · `code-input.tsx` · `action-bar.tsx` · `stepper.tsx` · ★ new: `split-view.tsx` · `kv-card.tsx` |
| **`content`** — not spawned, the lead holds | `card.tsx` · `badge.tsx` · `tag-chip.tsx` · `avatar.tsx` · `progress.tsx` · `empty-state.tsx` · `stat.tsx` · `panel.tsx` · `file-drop.tsx` · `sticker.tsx` · `poster.tsx` · `reaction-bar.tsx` · `progress-bar.tsx` · `story-ring.tsx` · `feed-item.tsx` · `attendee-stack.tsx` · `page-viewer.tsx` |
| **`scoring`** — not spawned, the lead holds | `rank-row.tsx` · `race-bar.tsx` · `level-card.tsx` · `week-hud.tsx` · `badge-medallion.tsx` · `ledger-row.tsx` · `podium.tsx` |
| **`notify`** — not spawned, the lead holds | `settings-group.tsx` |
| **`event`** — not spawned, the lead holds | `star-input.tsx` |

**You never edit a primitive you do not own, even to fix it.** Write the request — the file, the prop, why — in
`docs/plan/notes/<you>.md` and tell the lead. **Import by path** — `@/components/ui/card`, never `@/components/ui` —
because `index.ts` exports **types only**. ★ **The directory is the list**: a file added to `ui/` with no registry
entry, no test inside the scope or no demo fails `tests/unit/ui-playground.test.ts`, and the registry is the lead's — a
new primitive is a request with its props. ★ `card`, `badge`, `stat`, `avatar`, `tag-chip`, `empty-state`, `switch`,
`checkbox`, `textarea`, `combobox`, `menu`, `sheet`, `tabs` and `toast` are composed by this wave's screens **as they
are**; a change to one you do not own is a request.

### The transfers in force for wave 21 (`DEC-227` §4)

- **Every earlier wave's transfer has ended.** Wave 20's are back: `leaderboards/**`, `member-board`, `company-board`,
  `company-points-breakdown` and `leaderboards.json` are `sessions'`; `me/certificates/**` and its keys are
  `designer`'s. Where a list below still says «this wave» of an earlier wave, it is that wave's record.
- **→ the lead, from `console`:** `src/app/[locale]/app/admin/layout.tsx` (the frame), `src/components/admin/admin-rail.tsx`
  (to delete) with `tests/components/admin/admin-rail*.test.tsx`, `tests/e2e/console.spec.ts`.
- **→ `sessions`, from `console`:** `src/app/[locale]/app/admin/proposals/**` (with a new `[id]/`),
  `tests/components/admin/proposals-review-card.test.tsx`, `tests/e2e/admin-proposals.spec.ts`. ★ **Its strings move
  with it**: `sessions` writes them in `proposals.json`; `console` deletes `admin.proposals.*` on `sessions'` written
  request once nothing reads them.
- ★ `src/app/[locale]/app/admin/layout.tsx` and `tests/unit/console-register.test.ts` stay the lead's after the wave;
  `admin/proposals/**` goes back to `console`.
- ★ **Frozen for everyone, fixes included:** everything waves 18 – 20 rebuilt (the member app), every console route not
  named above, the studio and `/app/platform/**`, every worker task. A defect found there is written in your note and
  told to the lead.

### One writer per file — specs included

A screen's strings live in its owner's namespace. **Reading** another track's namespace is fine; **writing** it is a
request. ★ `admin.json` is `console`'s: a string the frame needs there — and the «التصنيفات» change — is `console`'s
commit on the lead's written list. **A spec or test has one writer.** Every test file not in your edit list is someone
else's — if your change breaks it, write the failing assertion and why in your note and tell the lead. The lead holds
`a11y`, `budgets`, `frozen-routes`, `second-org`, `session`, `shell-*`, `unconfigured`, `auth*`, `reserve-probe`,
`isolation`, `definer-exposure`, every `fixture*.ts`, every `wave<N>-{demo,lead}-*` spec, `console.spec.ts`, the
`admin-rail*` tests, `tests/unit/{ui-playground,no-raw-palette,scope-root,tokens-scope,tokens-only,public-graph,design-files,console-register}*`
and the registry, and every spec of an unspawned track.

### Not this wave — never touched by ANY teammate until the lead says otherwise

- ★★ **the five public routes** — everything under `src/app/[locale]/(marketing)/`, the thirteen components it renders,
  the register form, `public/**`; and anything `tests/unit/public-graph.test.ts` protects;
- ★★ **session stories** — the viewer, `story_views`, the `story` photo derivative — ★ **wave 18's ring opens nothing,
  and nobody wires it this wave**;
- ★ **`SCR-045` certificates** (M12) and its screen beyond the header the lead trims; **`046` – `065`** (M11b), with
  `company_min_active_members`' admin control (`DEC-220` §1.3); the studio; every `/app/platform` route;
- ★ **the hub's المحتوى tab as a screen** — it links to the event page (`DEC-227` §5.3); objectives and tags as admin
  screens (`DEC-076`);
- ★ **everything waves 18 – 20 rebuilt**, the member app's screens;
- a member-readable proposal history, withdraw, the reviewer's name, autosave, the hosting gate's enforcement
  (`DEC-215`'s carried four);
- ★ **fixing the hard-load duplicate** (`DEC-204`) — none of this wave's routes is in its table;
- a new keyframe, any motion in the console, any change to how the five moments are keyed;
- **deleting the `pg:` variants** or `:root`'s old values — the public site's wave;
- ★ **a company logo** — refused, not deferred (`DEC-195` §4);
- ★ **the two carried gates, together** (`DEC-194`); F2 and F3 (`DEC-198` §5); the overshoot ceiling (`DEC-186` §4) —
  the owner's; the `railway.json` — the owner's;
- deleting a session with its awarded points; a member uploading their own picture; recurring series (`A14`); drag in
  `ui/reorderable-list`; replacing the renderer; the certificates' look.

### Lead-only, always

`supabase/migrations/**` · `src/lib/session-status.ts` · `src/lib/ui/**` · ★ `tests/unit/ui-playground.test.ts` and its registry, `tests/unit/{no-raw-palette,scope-root,design-files,console-register}.test.ts` · ★ **every layout that renders `<PlayScope>`** — the shell, `(auth)`, `legal`, `s`, `verify` · ★ `src/app/[locale]/app/admin/layout.tsx` (the console frame, `DEC-227`) · `src/components/ui/index.ts` and the lead's other `ui/` files, `scope.tsx` and `scope-portal.tsx` · `src/components/ui/objects/**` · `src/components/brand/**` · `src/app/globals.css` ·
`src/lib/fonts.ts` · `packages/fonts/**` · `scripts/fonts/**` · `src/app/[locale]/app/layout.tsx` · `src/app/[locale]/app/me/{layout,loading,error}.tsx` and `src/components/me/tab-strip.tsx` (the hub frame) ·
`src/components/shell/**` · `src/app/[locale]/(auth)/**` · `src/app/[locale]/(dev)/**` (★ a demo is its primitive's owner's; `page.tsx` and `playground.tsx` stay the lead's) · `src/messages/*/{ui,app,auth,marketing}.json` ·
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
something that is not yours** (★ wave 21: none of the five screens is public, and `ui/button`, `field`, `input`, `textarea` and `icons` are imported by the five public routes — if the hook runs the full `qa` for you, stop and tell the lead). SQL goes under `supabase/proposed/<you>/`, proven with
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
asserted by text needs `{ exact: true }`. A capture is taken after the streams settle, at 1280 on the desktop project and 390 × 844 on the
phone project, into `.qa-shots/rtl/` honouring `E2E_SHOTS_DIR` — **a skeleton proves nothing**. **Never add a
nudge, an interval or a `setTimeout` to a pending control** (`DEC-146`). No session changes repository
visibility, settings, secrets or remotes — stop and ask.
