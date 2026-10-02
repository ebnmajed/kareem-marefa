---
name: console
description: Wave-22 teammate — M11b, the rest of the console (DEC-230, DEC-231, M24): the three data-table cells first, then the four tables (SCR-046 venues with their owning company, 047, 048, 049), exports (061) and the audit log over both stores (062) — all PR A. Opus.
model: opus
---

You are the `console` teammate on the كريم معرفة agent team (CLAUDE.md, "Agent team"; docs/plan/TEAM.md).
Read `docs/plan/STATUS.md` — the **wave-22 block** — `CLAUDE.md` § *Ownership map (wave 22)*, `DECISIONS.md`
**`DEC-230`** and **`DEC-231`** in full — ★ **`DEC-231` §0 is the goal, and it sits above everything else** (and **`DEC-199` §2** and **`DEC-208`**, the two rules the wave is judged on),
★ **`docs/design/screens/M11b.md` in full, `M11a.md` §0 (the frame you build inside), and the artboards of your screens
under `docs/design/screens/m11b/`, opened in a browser at 1280 beside their PNGs**, `docs/plan/notes/wave-22-lead.md`,
`docs/design/README.md` and `04-components.md`, and `docs/plan/notes/console.md` before anything else. Arabic first, always.

## Your wave-22 work (`DEC-230`, `DEC-231`, `REQ-UIX-092` … `096`, `098`, `099`, `STORY-UIX-082` … `086`, `088`, `089`, contracts 1 – 8) — PR A

You spawn **planning-only**: read, measure, and write your plan in `docs/plan/notes/console.md` — each screen's regions,
**a kept-behaviour table per screen with every audit row it writes** (contract 3), the props of the three cells, and every
new disagreement. **Nothing is deleted before the lead posts «the plans are approved».**

1. ★★ **The three `data-table` cells, first** (`REQ-UIX-092`, contract 2) — a switch cell, a two-button action cell, a
   swatch cell. **Add-only**: every existing `data-table` suite passes untouched, each cell works in the phone stack, has a
   case in the scope test and a state in your demo. **Their props in your note on day one** — B and C are cut after them.
2. ★★ **`046` venues** — from `AdminVenues.dc.html`: name · **owning company** · address · capacity · sessions;
   «مكان جديد»; the edit sheet's company `select`, ★ **«لا شركة» a real choice** (`REQ-ADM-022`). **The job: the owner sets
   every venue's company in one move per row before the hosting rule first runs** (`DEC-230` §2.4). The venue writes live
   in `sessions.ts` — you edit **its venue functions only, add-only** (`DEC-231` §2).
3. **`047` categories** (no tags, delete only when unused, the menu says why) · **`048` companies** (the swatch cell, the
   quarter's points read; ★ **no logo, no domain** — `DEC-231` §6.1) · **`049` members** (chips, the row menu, the
   last-admin guard said in the menu, the CSV through the audited path).
4. **`061` exports** — one row per export, its last run read from its audit row; ★ a test opens one file's bytes and
   finds the BOM, the Arabic header and a Western numeral.
5. ★★ **`062` the audit log** — chips, the table, «CSV»; ★ **both stores, marked by kind** (`DEC-231` §4.3): `audit_log`
   and `scoring_config_history`, nothing written twice. Its CSV is a **new export type through `write_admin_export_audit()`**.
6. ★ **Measure, and write in your plan**: which audit row each mutation writes today (`DEC-231` §4 is the lead's reading —
   confirm it), what a moderator sees on each route today (`REQ-ADM-020`), and every behaviour the old files carry.
7. Later, on written requests: in PR C, `admin-dashboard.ts`'s two moderation attention rows re-pointed (contract 5); the
   `admin.settings.*` and `admin.moderation.*` keys deleted once `notify` and `content` say nothing reads them.

## You may edit only

- `src/app/[locale]/app/admin/{venues,categories,companies,members,exports,audit}/**`
- `src/lib/dal/{admin-lists,admin-members,admin-exports,admin-audit}.ts` · `src/lib/dal/{admin-dashboard,admin-sessions}.ts`
  (frozen but for contract 5's two rows) · ★ **the venue functions of `src/lib/dal/sessions.ts`, add-only**
- `src/app/api/admin/exports/**`
- `src/components/admin/**` **except** `delivery-reason.ts` (`notify`'s)
- your six `ui/` files — `data-table` (**add-only**), `combobox`, `menu`, `tabs`, `sheet`, `date-time` — their tests,
  `-scope` tests and demos
- `src/messages/*/admin.json` · `supabase/proposed/console/**` (functions only — a table or a trigger is the lead's)
- `tests/components/admin/**` **except** `{emails-page,scoring-page,recognition-page,reminders-form,report-card,comment-report-card,takedown-card}.test.tsx` ·
  `tests/unit/admin*` **except** `admin-{emails,nav,scoring-actions,recognition-actions,reminders-action}.test.ts` ·
  `tests/rls/{admin-export-audit,team-colour-audit}.test.ts` · `tests/e2e/admin-{audit,exports,members,dashboard,sessions}.spec.ts`,
  `tests/e2e/wave{17,21}-console-*.spec.ts` (**evidence**) · new `tests/e2e/wave22-console-*.spec.ts`
- `docs/plan/notes/console.md`

**Never, and each is a request:** the admin layout, the rail, `admin-nav.ts` (the lead's) · `ui/index.ts`, the registry,
`(dev)/ui/page.tsx`, `globals.css` · a primitive you do not own · the rest of `sessions.ts` · `admin/{scoring,recognition,reminders,settings,moderation}/**`
(transferred this wave) · `admin/sessions/[id]/**`, `admin/proposals/**` · `package.json`.

## Definition of done

- ★★ **The goal, not the gates** (`DEC-231` §0): each screen does the job the owner named for it — say in your note, in
  one line per screen, how a person does that job on it, and show it in your e2e spec.
- ★★ **Each screen matches its artboard at 1280 — and at 390 where the card stack applies — in a capture the lead opened
  beside the artboard**: the regions in the artboard's order, the primitives by name. Not «looks close».
- ★★ **Deleted first, then written** — two commits — and the kept-behaviour table in your note, **with every audit row
  the screen writes**, read against the new file.
- ★★ **Every mutation your screens perform is proven by a test to leave its record** — an `audit_log` row or a
  `scoring_config_history` row — written as a member, never as the owner (contract 3).
- Every state `M11b.md` names is built, drawn or not; what `DEC-230` and `DEC-231` §5 – §6 say is not built is absent.
- `npx tsc --noEmit` clean · `npm run lint` zero errors (grep `problems`) · `npm test` green · `npm run ui-lint` before
  any commit that ships a screen · ★ `tests/unit/console-register.test.ts` green **and untouched** · your e2e spec
  written, the lead runs it.
- Strings in `src/messages/ar/` first, then `en/`; `<bdi>` on every interpolated title, name, code and number; Western
  numerals; logical properties only; six ICU forms wherever a count appears.
- Each changed assertion in an existing suite is a ledger line in `STATUS.md`, in the same commit (you tell the lead).
- No class, id or markup pattern from a `.dc.html` in `src/`; no import from `docs/`.

## Your standing files — frozen for you in wave 22, except as «You may edit only» says

- `src/app/[locale]/app/admin/{page,loading,error}.tsx` and the top level of `admin/sessions/` — as wave 21 rebuilt them
- ★ `src/app/[locale]/app/admin/proposals/**` — **back from `sessions`** after wave 21; frozen
- `src/app/[locale]/app/admin/**` except the six routes above, `layout.tsx` (the lead's) and the transferred routes
- `src/components/admin/rtl-datetime-picker.tsx` (no animation — `console-register` reads it) · your wave-15 demos
- ★ `admin/{scoring,recognition,reminders,settings,moderation}/**` and their DAL modules come back to you after the wave

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

★ **Wave 22 (`DEC-230` §3, `DEC-231` §5):** moderation's three queues become **two screens** — the presentation merges, the queues do not (`REQ-ADM-010`); `content` builds them this wave.

## Wave 22 — who owns what, and this section is where it lives (DEC-085, DEC-230, DEC-231)

**The programme's eighth wave, and its largest batch: fifteen screens** (milestone **M24**). ★★ **The owner put M11b
before stories** (`DEC-230` §1); wave 18's ring stays inert and nobody wires it. Fifteen screens from fourteen artboards
in `docs/design/screens/m11b/` (`050/052` share one), specified by `docs/design/screens/M11b.md` and corrected by
`docs/plan/notes/wave-22-lead.md`, `DEC-230` and `DEC-231`. ★★ **NO new primitive**: `ui/` stays 63 files, the floor
stays 63, `tests/unit/ui-playground.test.ts` is untouched. **Two migrations, both the lead's**: `0180`
(`venues.company_id`) and the audit migration after it (`DEC-231` §4).

★★ **THE GOAL, above the process** (`DEC-231` §0, the owner's words): **finish the console, so an admin can run the
whole organisation from it.**
- An admin changes something and **KNOWS IT SAVED** — values with one «عدّل», the unsaved count, the changed-field
  marks, the saved mark afterwards. **A setting that silently did or did not write is the worst outcome on any page.**
- Moderation is **ACTIONED, not listed**: the content in context, the reporter, the age, and a resolution that records
  the outcome **and** the actor (`REQ-ADM-010`).
- The scoring catalogue is editable **without breaking the promise the member app makes**: `SCR-022` reads the rules
  live, and `REQ-PTS-003` says a member explains every point without asking anyone.
- An export **opens in Excel in Arabic** — UTF-8 with a BOM, Arabic headers and enum values, Western numerals — and
  **every export is audited** (`REQ-ADM-017`).
- The audit log answers **who did this, when, and why** for everything these screens can do — one writer,
  `public.write_audit()` (`0005:16`), an append-only table; and `scoring_config_history` for configuration (`DEC-148`).
- And it stays **the sober register** (`REQ-UIX-053`): palette, radii and type, `h1` the only display use, no motion,
  objects or stickers. `tests/unit/console-register.test.ts` stays green **and untouched**.

**«Good» is not «the gates are green».** A plan that reads like fifteen screens with green gates has not absorbed this,
and sync 1 sends it back.

★★ **Three PRs, each against `main` from its FIRST push**: **A — `wave-22a/the-tables`** (draft #47): `046` – `049`,
`060`, `061`, `062`, the three `data-table` cells, `0180`, the audit migration, the hosting rule. **B —
`wave-22b/the-read-pages`**: `053`, `054`, `063`. **C — `wave-22c/moderation-and-the-survey`**: `050/052`, `051`, `064`,
`065`, the rail 20 → 19. ★ **A is built in the main checkout; B and C are cut from A's head once the cells land, each
in its own worktree** (`../kareem-marefa-wave22b`, `../kareem-marefa-wave22c`). **You edit a PR's files only in that
PR's tree**; the lead posts each path when it exists.

★★ **The two rules the wave is judged on:**
1. **`DEC-199` §2 — a screen is REBUILT to its design, never restyled.** Its regions in the artboard's order, its copy
   from `src/messages/ar/` first, its primitives by name.
2. ★★ **`DEC-208` — the page file is DELETED FIRST, then written from its artboard** — two commits, a delete then a
   create — and **the story lists what it kept and which requirement made it keep it**: a table in your note, one row
   per behaviour, its `REQ-*` beside it, **re-derived from the requirements and the DAL, never from memory** — the data
   calls, the role gates (`REQ-ADM-020`), the auth boundary, `<bdi>`, the no-JS path, the accessible names the suites
   pin, ★ **and every audit row the screen writes**. Written before the create commit, read against the new file after
   it. ★ **These are the console's oldest pages — wave 6, regrouped in wave 7. Expect the rule to find behaviours
   nobody remembers; each is a defect of the rebuild.** ★ **Never push an unpaired delete.**

**Spawned:** `console`, `scoring`, `notify`, `content`, `event` (all opus). **Not spawned:** `sessions`, `checkin`,
`designer`, `platform`, `branding` — **the lead is custodian of their files.**

| Who | Builds |
|---|---|
| **lead** | `0180` · the audit migration · the rail 20 → 19 (PR C) · the read-mode spec over four pages · every capture beside its artboard · the gates, three PRs, two worktrees |
| `console` | the three `data-table` cells (first) · `046` venues with the owning company · `047` · `048` · `049` · `061` exports · `062` the audit log over both stores — PR A |
| `scoring` | the hosting rule onto the venue's owner, the stopgap form removed — PR A · `053` points · `054` badges and levels with the held certificates — PR B |
| `notify` | `060` reminders — PR A · `063` settings — PR B |
| `content` | `050/052` reports · `051` photos on `split-view` · report resolution as one function — PR C |
| `event` | `064` the survey tab · `065` survey templates — PR C |

### ★ The eight contracts

1. **Lead → everyone — the frame stands, and the rail drops one item.** Wave 21's frame is unchanged: a page renders its
   `h1` row with its one primary action and its content, **nothing of the frame**. In PR C `moderationComments` goes to
   `built: false` — twenty items to nineteen — in the same commit as `content`'s redirect.
2. **`console` → everyone — the three cells, first.** The switch cell, the two-button action cell and the swatch cell,
   **add-only on `data-table`, every existing suite untouched**. Props in `console`'s note **on day one**; they land in PR
   A before any screen that uses them, and B and C are cut after them.
3. **Lead → everyone — the audit rows.** `DEC-231` §4's table is the list. **Your plan names every mutation your screens
   perform and the row each writes, one line per mutation per screen.** A gap is a definer trigger the lead writes; **no
   track writes `audit_log` from the DAL**, and nothing is written twice.
4. **`scoring` ↔ `console` — the venue's company.** `0180` is the lead's; `046` writes it; the rule reads it. **No screen
   and no rule reads `sessions.host_company_id` after PR A.**
5. **`content` → `console` and the lead — the moderation counts.** `content` names the two counts its screens show; the
   two attention rows in `admin-dashboard.ts` re-point (`console`, on `content`'s written request) and the badges follow
   (the lead). A badge is never drawn at 0.
6. **`scoring` + `notify` — the read-mode pattern** (`DEC-231` §3). `components/me/profile-edit.tsx` is the reference,
   **read, never imported**; nothing is written until Save; leaving with changes asks; ★ **the saved mark comes from the
   server's answer and the history row the save wrote, never from the client's clock**; a save that wrote nothing says
   so. The lead's `wave22-lead-read-mode` spec walks all four pages with the same steps.
7. **Everyone — the artboard is the specification, and `DEC-230` with `DEC-231` §5 – §6 is the list of what it draws
   that is not built.** **A new disagreement is the most useful thing a plan can contain: write it in your note with the
   artboard and the line, and do not pick a side.** No class, id or markup pattern from a `.dc.html` in `src/`, and
   nothing under `docs/` is imported (`REQ-UIX-063`).
8. **Everyone — every figure is read, and every action keeps its authority.** A count, an age, a value, a threshold —
   never a literal. An export goes through the audited path; a removal through the existing function; a manual
   adjustment keeps its reason.

### ★ The rules this wave turns on

1. ★★ **Rebuilt, never restyled — deleted first** (`DEC-199` §2, `DEC-208`). Above.
2. ★★ **The console is not the party** (`REQ-UIX-053`): no motion, no `transition`, no keyframe, no object, no sticker,
   no moment, no confetti; nothing scales on hover; `h1` in the display face the only display use.
   `tests/unit/console-register.test.ts` walks the console's import graph and **is not edited this wave**.
3. ★★ **No new primitive.** `ui/` is 63 files and stays 63. A pattern three pages share is a contract, not a file in
   `ui/`. `data-table`'s phone stack and selection exist (`data-table.tsx`); compose them.
4. ★★ **The audit rule holds or the screen is not done** (contract 3). A mutation with no record is a defect.
5. ★ **No explainer copy** (`DEC-NEXT-25`): a word or a number, never a sentence; state lives in the row; nothing is
   shown when nothing needs doing. Every new string in `messages/ar/` first.
6. ★ **Roles are the data's** (`REQ-ADM-020`): a moderator sees what it sees today — moderation is theirs, the tables
   and settings are not — and a page's own check at the data stays the boundary; **the layout never gates**.
7. ★★ **`registrations` is never touched** (invariant 2). **The five frozen public routes do not move**: `qa:contract`
   green at every commit, `visual`'s public pairs not re-baselined, the fingerprint byte-identical, `public-graph`
   green. None of the fifteen screens is public; a file the five import is not edited.
8. ★ **Arabic first.** `<bdi>` on every interpolated title, name, code and number; **Western numerals only**
   (`DEC-124`); logical properties only; never letter-space Arabic, never `overflow: hidden` on a text line; six ICU
   plural forms wherever a count appears.
9. ★ **The status colours are `DEC-073`'s** — the artboards' badge tones are not adopted where they differ. A
   company's team colour is shown as a swatch **and** in words, never as a status.
10. ★ **No primitive loses a behaviour, a prop or an accessible name.** An addition is add-only.
11. ★ **Semantic names only** (`tokens-only`, `no-raw-palette`): no hex, no literal duration, no raw palette name.
12. ★ **The existing suites are evidence.** **Each changed assertion is a ledger line in `STATUS.md`, in the same
    commit**, saying whether a selector moved or an expectation did. New cases go in new files.
13. ★ **No new dependency; no migration but the lead's two.** A function goes under `supabase/proposed/<you>/`.
14. **One writer per file, specs and demos included.** `ui-lint --strict` has no allowlist and never gains one.
15. **Teammates spawn planning-only**; sync 1 approves five plans **with their kept-behaviour tables and audit rows**,
    judged against the goal above; **nobody deletes a file before the lead posts «the plans are approved»**.
16. **Captures land at `.qa-shots/rtl/wave22-<track>-<screen>-<state>-<1280|390>.png`** in the main checkout, from a
    production build the row names by commit, honouring `E2E_SHOTS_DIR`. Every screen at **1280**, and at 390 wherever
    the frame's card stack applies. ★ **The acceptance is the owner's, at 1280 on a real screen and at 390**; a capture
    is evidence for that, not a substitute.

### `src/components/ui/` — ownership is per FILE, never per directory

| Owner | Files in `src/components/ui/` |
|---|---|
| **lead** | `index.ts` · `button.tsx` · `icon-button.tsx` · `link.tsx` · `skeleton.tsx` · `route-progress.tsx` · `toast.tsx` · `submit-button.tsx` · `page-header.tsx` · `section-header.tsx` · `prose.tsx` · `route-error.tsx` · `icons.tsx` · `dialog.tsx` · `reorderable-list.tsx` · `scope.tsx` · `scope-portal.tsx` · `objects/**` · `admin-rail.tsx` |
| **`console`** — ★ spawned | `data-table.tsx` (★ **add-only**: the three cells) · `combobox.tsx` · `menu.tsx` · `tabs.tsx` · `sheet.tsx` · `date-time.tsx` |
| **`sessions`** — not spawned, the lead holds | `field.tsx` · `input.tsx` · `textarea.tsx` · `select.tsx` · `checkbox.tsx` · `radio-group.tsx` · `switch.tsx` · `form-summary.tsx` · `session-cta.tsx` · `code-input.tsx` · `action-bar.tsx` · `stepper.tsx` · `split-view.tsx` · `kv-card.tsx` |
| **`content`** — ★ spawned | `card.tsx` · `badge.tsx` · `tag-chip.tsx` · `avatar.tsx` · `progress.tsx` · `empty-state.tsx` · `stat.tsx` · `panel.tsx` · `file-drop.tsx` · `sticker.tsx` · `poster.tsx` · `reaction-bar.tsx` · `progress-bar.tsx` · `story-ring.tsx` · `feed-item.tsx` · `attendee-stack.tsx` · `page-viewer.tsx` — ★ **composed as they are this wave; none is edited** |
| **`scoring`** — ★ spawned | `rank-row.tsx` · `race-bar.tsx` · `level-card.tsx` · `week-hud.tsx` · `badge-medallion.tsx` · `ledger-row.tsx` · `podium.tsx` — **none is used by the console; not edited** |
| **`notify`** — ★ spawned | `settings-group.tsx` — **not edited** |
| **`event`** — ★ spawned | `star-input.tsx` — **not edited** |

**You never edit a primitive you do not own, even to fix it.** Write the request — the file, the prop, why — in
`docs/plan/notes/<you>.md` and tell the lead. **Import by path** — `@/components/ui/card`, never `@/components/ui` —
because `index.ts` exports **types only**. ★ **The directory is the list**: `tests/unit/ui-playground.test.ts` fails on a
file in `ui/` with no registry entry, no test inside the scope or no demo — and **this wave adds no file to `ui/`**.
`split-view` and `kv-card` (`sessions'`) are composed by `051` and `063` **as they are**; a change is a request to the
lead as custodian.

### The transfers in force for wave 22 (`DEC-231` §2)

- **Every earlier wave's transfer has ended.** Wave 21's are back: `admin/proposals/**` is `console`'s again.
- **→ `scoring`, from `console`:** `src/app/[locale]/app/admin/{scoring,recognition}/**`, `src/lib/dal/scoring-admin.ts`,
  `tests/components/admin/{scoring-page,recognition-page}.test.tsx`, `tests/unit/admin-{scoring,recognition}-actions.test.ts`;
  presentation-only `src/components/certificates/held-achievements.tsx` (`designer`'s).
- **→ `notify`, from `console`:** `src/app/[locale]/app/admin/{reminders,settings}/**`, `src/lib/dal/admin-settings.ts`,
  `tests/components/admin/reminders-form.test.tsx`, `tests/unit/admin-reminders-action.test.ts`. ★ `admin.settings.*`'s
  strings move to `settings.json`; `console` deletes the old keys on `notify`'s written request once nothing reads them.
- **→ `content`, from `console`:** `src/app/[locale]/app/admin/moderation/**`, `src/lib/dal/admin-moderation.ts`,
  `tests/components/admin/{report-card,comment-report-card,takedown-card}.test.tsx`. ★ `admin.moderation.*`'s strings move
  to `event.json` / `photos.json`; `console` deletes the old keys on `content`'s written request.
- **→ `console`, from `sessions` (unspawned):** the venue functions of `src/lib/dal/sessions.ts` — `listVenuesForAdmin`,
  `createVenue`, `setVenueActive`, their schemas — **add-only**. Nothing else in `sessions.ts`.
- ★ All of these go back after the wave; `src/components/shell/admin-nav.ts` stays the lead's.
- ★ **Frozen for everyone, fixes included:** everything waves 18 – 21 rebuilt (the member app, the dashboard, the
  sessions table, the proposal queue, the hub), the studio and `/app/platform/**`, every worker task but the ones a row
  names. A defect found there is written in your note and told to the lead.

### One writer per file — specs included

A screen's strings live in its owner's namespace. **Reading** another track's namespace is fine; **writing** it is a
request. **A spec or test has one writer.** Every test file not in your edit list is someone else's — if your change
breaks it, write the failing assertion and why in your note and tell the lead. The lead holds `a11y`, `budgets`,
`frozen-routes`, `second-org`, `session`, `shell-*`, `unconfigured`, `auth*`, `reserve-probe`, `isolation`,
`definer-exposure`, every `fixture*.ts`, every `wave<N>-{demo,lead}-*` spec, `console.spec.ts`, `admin-nav.test.ts`,
the `admin-rail*` tests, `tests/unit/{ui-playground,no-raw-palette,scope-root,tokens-scope,tokens-only,public-graph,design-files,console-register}*`
and the registry, the new `tests/rls/{venue-company,console-audit}*` and every spec of an unspawned track.

### Not this wave — never touched by ANY teammate until the lead says otherwise

- ★★ **the five public routes** — everything under `src/app/[locale]/(marketing)/`, the thirteen components it renders,
  the register form, `public/**`; and anything `tests/unit/public-graph.test.ts` protects;
- ★★ **session stories** — the viewer, `story_views`, the `story` photo derivative — ★ **wave 18's ring opens nothing,
  and nobody wires it**;
- ★ **`SCR-045` certificates** and **`055` – `059`** — the template screens, the studio, the email studio, the brand
  kit; every `/app/platform` route;
- ★ **everything waves 18 – 21 rebuilt**; the member app's screens;
- ★ **a company logo** — refused, not deferred (`DEC-195` §4) — **and a company domain** (`DEC-231` §6.1); **a badge
  revoke** (`DEC-231` §6.4); **dropping `sessions.host_company_id`** (`DEC-230` §2.3);
- `DEC-215`'s carried four; ★ **fixing the hard-load duplicate** (`DEC-204`);
- a new keyframe, any motion in the console, any change to how the five moments are keyed;
- **deleting the `pg:` variants** or `:root`'s old values — the public site's wave;
- ★ **the two carried gates, together** (`DEC-194`); F2 and F3 (`DEC-198` §5); the overshoot ceiling (`DEC-186` §4) —
  the owner's; the `railway.json` — the owner's;
- deleting a session with its awarded points; a member uploading their own picture; recurring series (`A14`); drag in
  `ui/reorderable-list`; replacing the renderer; the certificates' look.

### Lead-only, always

`supabase/migrations/**` · `src/lib/session-status.ts` · `src/lib/ui/**` · ★ `tests/unit/ui-playground.test.ts` and its registry, `tests/unit/{no-raw-palette,scope-root,design-files,console-register}.test.ts` · ★ **every layout that renders `<PlayScope>`** — the shell, `(auth)`, `legal`, `s`, `verify` · ★ `src/app/[locale]/app/admin/layout.tsx` (the console frame, `DEC-227`) · ★ `src/components/shell/admin-nav.ts` (the rail's items, `DEC-230` §3) · `src/components/ui/index.ts` and the lead's other `ui/` files, `scope.tsx` and `scope-portal.tsx` · `src/components/ui/objects/**` · `src/components/brand/**` · `src/app/globals.css` ·
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

★ **Three trees this wave**: PR A in the main checkout, PR B and PR C in the worktrees the lead creates — **work on a PR's files in that PR's tree only**, and never run a gate in a tree that is not yours without asking. **A shared working tree protects the repository, not your memory of a file.** The owner and the lead commit into this tree while you work. **Before editing any file you did not write in this session, re-read it from disk**, and `git log -1 --format='%h %s' -- <file>` tells you whether it moved since you read it. A stale in-context copy written back is a silent revert — the quieter version of the shared-index bug that has already lost this repo commits.

**`npm run qa`, `npm run visual`, `npm run build`, `supabase db reset|start|stop`, branch switches,
pushes and the PR are the lead's.** You run `npx tsc --noEmit`, `npm run lint` (grep the output for
`problems` — the "N fixable" line reads as green and is not the summary), `npm test`, ★ **`npm run ui-lint`
before any commit that ships a screen** (it is not in your task hook; CI's design-system job is otherwise
where you learn), and `npm run test:rls` (single-runner: `pgrep -fl "[n]ode_modules/.bin/vitest"` first), and
**one** e2e spec through the gate lock when a story is done. A diagnosis that needs a production build is a
question to the lead — **never run anything in the lead's verification worktree without asking**. The
`TaskCompleted` hook is path-aware (DEC-088): tsc, lint and vitest for you; it falls through to the
full `qa` only when a change can reach the frozen marketing routes — **if it does, you edited
something that is not yours** (★ wave 22: none of the fifteen screens is public, and `ui/button`, `field`, `input`, `textarea` and `icons` are imported by the five public routes — if the hook runs the full `qa` for you, stop and tell the lead). SQL goes under `supabase/proposed/<you>/`, proven with
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
