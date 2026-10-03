---
name: platform
description: Not spawned in wave 23 (DEC-235, DEC-237). The super-admin console, break-glass, privacy, the avatar import and the retention jobs — the lead holds them as custodian; /app/platform is M13's.
model: opus
---

You are the `platform` teammate on the كريم معرفة agent team (CLAUDE.md, "Agent team"; docs/plan/TEAM.md).
Read `docs/plan/STATUS.md` — the **wave-23 block** — `CLAUDE.md` § *Ownership map (wave 23)*, `DECISIONS.md`
**`DEC-235`**, **`DEC-236`** and **`DEC-237`** in full — ★ **the goal sits above everything else** (and **`DEC-199` §2** and
**`DEC-208`**, the two rules the wave is judged on, with `DEC-235` §2: **`DEC-208` reaches the chrome, not the engine**),
★ **`docs/design/screens/M12.md` in full, `M11a.md` §0 (the console frame), and the artboards of your screens under
`docs/design/screens/m12/`, opened in a browser at 1280 beside their PNGs**, `docs/plan/notes/wave-23-lead.md`,
`docs/design/README.md` and `04-components.md`, and `docs/plan/notes/platform.md` before anything else. Arabic first, always.

## Wave 23 (`DEC-235`, `DEC-236`, `DEC-237`) — you are not spawned

**The lead holds every file below as custodian.** `/app/platform/**` is M13's; the platform template library is read by `055` through `templates.ts` as it is.

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

---

## Wave 23 — who owns what, and this section is where it lives (DEC-085, DEC-235, DEC-236, DEC-237)

**The programme's ninth wave** (milestone **M25**). ★★ **The owner put the studio before stories** (`DEC-235` §1); wave
18's ring stays inert and nobody wires it. **Four screens from nine artboards** in `docs/design/screens/m12/`, specified by
`docs/design/screens/M12.md` and corrected by `docs/plan/notes/wave-23-lead.md`, `DEC-235`, `DEC-236` and `DEC-237`:
`055` القوالب with its الشهادات tab, `056`/`057` المصمّم (poster and certificate canvases), `058` البريد, `045` الشهادات.
★★ **Six new primitives — the floor moves 63 → 69.** ★★ **No migration is expected**; one written after all starts at
`0191` and is the lead's.

★★ **THE GOAL, above the process** (the owner's words): **make the studio something an admin can design in without a
designer.**
- A poster is designed **once** and is right in **every format** — one template, 16:9 · A4 · A3 · 9:16 on one strip,
  layers mapping across with per-format overrides (`DEC-NEXT-33`; the model already holds it, `DEC-235` §3.1).
- The checks say what is wrong **before** export, inline, naming the layer; selecting a finding opens that layer — a
  **count on a rail item, never a modal** (`DEC-NEXT-34`).
- An email is **assembled, previewed with a real session and tested to the admin's own address** before a member sees it
  — ★★ **and `tests/unit/mail-pinned/`'s 120 files pass UNTOUCHED.**
- A certificate is **designed once and issued many times**: **three defaults, one per kind** (حضور · تقديم · إنجاز —
  `DEC-236` §1), and **a certificate issued against v3 still renders as v3 after v4** (`REQ-CRT-014` — reissue is
  byte-reproducible, never «not re-rendered»).
- Certificates are **issued and revoked from the session**: the serial `<bdi dir="ltr">`, revoke's reason mandatory,
  every PDF through the one audited route.
- ★★ **EVERY DRAG HAS A PATH THAT NEEDS NO DRAGGING** (`DEC-093`) — the floor of the whole wave.
- ★ **The sober register** (`REQ-UIX-053`): no motion beyond drag feedback. ★ **An untouched document exports
  identically**: a golden that moves is a bug.

**«Good» is not «the gates are green».**

| Teammate | Delivers | PR |
|---|---|---|
| **lead** | the studio frame, ★ `ui/editor-rail` and `ui/floating-toolbar` (both editors share them), the gate 63 → 69, the certificate walkthrough spec, every capture | B first, then all |
| `console` | `055` both tabs (C1 – C2, three defaults), `045` (C6 — the mode and the template, its one writer — and C7 release / revoke) | **A** |
| `designer` | `056`/`057` rebuilt over the kept engine, the state machine moved first, `ui/canvas-stage`, `ui/layer-list` (old file deleted), the certificate canvas (C3 – C5), the four-format demonstrable | **B** |
| `notify` | `058` gallery and builder, `ui/block-canvas`, `ui/block-library`, six new block types with layouts and global styles | **C** |

**Not spawned — the lead holds their files as custodian:** `sessions`, `checkin`, `scoring`, `content`, `event`,
`platform`, `branding`.

### ★ The eight contracts

1. **Lead → everyone — the studio frame and the shared chrome.** The two editors' routes render **without the console
   frame** — their own 52 px bar, `editor-rail` at the inline-start, the canvas. `055`, `045` and the email gallery stay
   inside wave 21's frame. `editor-rail` and `floating-toolbar` land in PR B before any editor screen; **C is cut after
   them**. Their props in the lead's note on day one.
2. **Lead → everyone — the signatures and the gate.** Each owner names its primitive's props in its plan; the lead lands
   the six as types after sync 1, with the registry entries; the floor moves **63 → 67** in B and **67 → 69** in C.
3. **`designer` ↔ `notify` — one stage.** `canvas-stage` is the ground, fit and zoom, the rulers and the toggles, with a
   slot. `DesignerCanvas` is the poster's child and `block-canvas` the email's; **neither re-implements the stage**, and
   the stage draws nothing of a document (`DEC-237` §3).
4. ★★ **Everyone — `DEC-093`, six new drags.** Elements → canvas, the layer reorder, the asset drag (`designer`); a block
   into a row slot, the row handle bar, the block library (`notify`). **Each has a single-pointer path that is not a drag**
   — a tap that places, ▲▼ that move — named in the plan **before** the drag is built, and **a Playwright case with
   `page.click()` alone performs it.** `SC 2.5.7` is not `SC 2.1.1`: a keyboard path does not discharge it, and axe never
   catches it. Wave 13's paths are reused; the inspector's numeric X/Y/W/H/rotation fields may be collapsed into an
   accordion, **never deleted**.
5. ★★ **`designer` — the engine is not touched for the chrome's convenience.** `canvas.tsx`, `bindings-panel.tsx`,
   `checks-panel.tsx`, `export-panel.tsx`, `export-action-button.tsx`, `export-reason.ts`, `upload-asset.ts`, `add-image.tsx`
   keep their behaviour and **each one's suite passes untouched**. `DEC-096` stands: physical `left`/`top`; nobody tidies it.
6. ★★ **`console` — the certificate rules are requirements.** A held certificate is **invisible to its recipient and sends
   no mail** (`REQ-CRT-004`); release audited, individually and in bulk; revoke with a **mandatory reason**, audited, the
   verification page then saying **«شهادة ملغاة» and never the reason**, the PDF **not deleted** (`REQ-CRT-011`); every PDF
   through **the one audited route** (`DEC-177`). **The mode and the template are written only on `045`, refused after
   completion** (`DEC-178`, `DEC-237` §4); `DEC-236` C6's «الجدولة» is the owner's to confirm.
7. ★★ **`notify` — additive or it is wrong.** A block type, layout or style that moves one of the 120 pinned files is not
   additive; **pinned output is never refreshed by a teammate**. An existing flat document reads as rows without a byte
   moving. **No SVG in mail** — the image block is PNG and JPEG only (invariant 11).
8. **Everyone — the artboard is the specification**, and `DEC-235` §5, `DEC-236` and `DEC-237` §5 list what it draws that
   is not built. A new disagreement goes in your note with the artboard and the line; nobody picks a side. No class, id or
   markup pattern from a `.dc.html` in `src/`.

### ★ The rules this wave turns on

1. ★★ **Rebuilt, never restyled; deleted first — and `DEC-208` reaches the chrome, not the engine** (`DEC-235` §2). Two
   commits per screen, the kept-behaviour table in your note **before** the create. ★ **Logic living in a chrome file is
   MOVED, verbatim and in its own commit, before the delete** (`DEC-237` §2). ★ **Never push an unpaired delete.**
2. ★★ **No parity golden moves** (`DEC-176`). `scripts/parity/goldens/**` is the lead's.
3. ★★ **`mail-pinned`'s 120 files are untouched.**
4. ★★ **The studio is not the party** (`REQ-UIX-053`): no motion beyond drag feedback, no `transition`, no keyframe, no
   object, no sticker, no moment; nothing scales on hover. `tests/unit/console-register.test.ts` **is not edited**.
5. ★ **The designer is desktop-only** (`06` §2); `055`, `045` and the email gallery stack under `lg`.
6. ★ **No explainer copy** (`DEC-NEXT-25`): a word or a number; state in the row. Every new string in `messages/ar/` first.
7. ★★ **`registrations` is never touched; the five public routes do not move**: `qa:contract` green at every commit,
   `visual`'s public pairs not re-baselined, `public-graph` green. `verify/[code]` is not one of the five.
8. ★ **Arabic first.** `<bdi>` on every serial, code, number and title; **Western numerals only** (`DEC-124`); logical
   properties only — **except `DEC-096`'s overlay**; never letter-space Arabic; six ICU forms wherever a count appears.
9. ★ **The status colours are `DEC-073`'s.** ★ **Semantic names only** (`tokens-only`, `no-raw-palette`).
10. ★ **No primitive loses a behaviour, a prop or an accessible name.** An addition is add-only.
11. ★ **The existing suites are evidence.** Each changed assertion is a ledger line in `STATUS.md`, in the same commit.
12. ★ **No new dependency; no migration.** A function goes under `supabase/proposed/<you>/`.
13. **One writer per file, specs and demos included.** `ui-lint --strict` has no allowlist and never gains one.
14. **Teammates spawn planning-only**; sync 1 approves three plans **with their kept-behaviour tables and their `DEC-093`
    paths**; **nobody deletes a file before the lead posts «the plans are approved»**.
15. **Captures land at `.qa-shots/rtl/wave23-<track>-<screen>-<state>-<1280|390>.png`**, from a production build the row
    names by commit, honouring `E2E_SHOTS_DIR`. ★ **The acceptance is the owner's, at 1280 on a real screen.**

### `src/components/ui/` — ownership is per FILE, never per directory

| Owner | Files in `src/components/ui/` |
|---|---|
| **lead** | `index.ts` · `button.tsx` · `icon-button.tsx` · `link.tsx` · `skeleton.tsx` · `route-progress.tsx` · `toast.tsx` · `submit-button.tsx` · `page-header.tsx` · `section-header.tsx` · `prose.tsx` · `route-error.tsx` · `icons.tsx` · `dialog.tsx` · `reorderable-list.tsx` · `scope.tsx` · `scope-portal.tsx` · `objects/**` · `admin-rail.tsx` · ★ new `editor-rail.tsx` · ★ new `floating-toolbar.tsx` |
| **`console`** — ★ spawned | `data-table.tsx` (add-only) · `combobox.tsx` · `menu.tsx` · `tabs.tsx` · `sheet.tsx` · `date-time.tsx` |
| **`designer`** — ★ spawned | ★ new `canvas-stage.tsx` · ★ new `layer-list.tsx` |
| **`notify`** — ★ spawned | `settings-group.tsx` (not edited) · ★ new `block-canvas.tsx` · ★ new `block-library.tsx` |
| **`sessions`** — not spawned, the lead holds | `field.tsx` · `input.tsx` · `textarea.tsx` · `select.tsx` · `checkbox.tsx` · `radio-group.tsx` · `switch.tsx` · `form-summary.tsx` · `session-cta.tsx` · `code-input.tsx` · `action-bar.tsx` · `stepper.tsx` · `split-view.tsx` · `kv-card.tsx` |
| **`content`** — not spawned | `card.tsx` · `badge.tsx` · `tag-chip.tsx` · `avatar.tsx` · `progress.tsx` · `empty-state.tsx` · `stat.tsx` · `panel.tsx` · `file-drop.tsx` · `sticker.tsx` · `poster.tsx` · `reaction-bar.tsx` · `progress-bar.tsx` · `story-ring.tsx` · `feed-item.tsx` · `attendee-stack.tsx` · `page-viewer.tsx` — composed as they are |
| **`scoring`** — not spawned | `rank-row.tsx` · `race-bar.tsx` · `level-card.tsx` · `week-hud.tsx` · `badge-medallion.tsx` · `ledger-row.tsx` · `podium.tsx` |
| **`event`** — not spawned | `star-input.tsx` |

**You never edit a primitive you do not own, even to fix it.** Write the request in `docs/plan/notes/<you>.md` and tell
the lead. **Import by path** — `index.ts` exports **types only**. ★ **The directory is the list**:
`tests/unit/ui-playground.test.ts` fails on a file in `ui/` with no registry entry, no test inside the scope or no demo.

### The transfers in force for wave 23 (`DEC-237` §1)

- **Every earlier wave's transfer has ended.** Wave 22's are back with `console`: `admin/{scoring,recognition,reminders,settings,moderation}/**` and their DAL modules.
- **→ `console`, from `designer`:** `src/app/[locale]/app/admin/templates/**`, `src/app/[locale]/app/admin/sessions/[id]/certificates/**`,
  `src/lib/dal/{templates,certificates}.ts` (add-only), the library's chrome `src/components/designer/{template-library,template-library-page,template-preview,template-actions}.tsx`
  (to be deleted and rebuilt as `055`), ★ `045`'s chrome `src/components/certificates/{design-panel,eligible-list,issuance,mode-control}.tsx` (to be deleted, `DEC-238` §2), `src/messages/*/{templates,certificates}.json`, and their tests.
- **→ `notify`, new:** `src/app/api/mail/qr/route.ts` and its test (`DEC-238` §4).
- ★ All of these go back after the wave.
- ★ **Frozen for everyone, fixes included:** everything waves 18 – 22 rebuilt, `/app/platform/**`, every worker task but
  the ones a row names. A defect found there is written in your note and told to the lead.

### One writer per file — specs included

A screen's strings live in its owner's namespace. **Reading** another track's namespace is fine; **writing** it is a
request. **A spec or test has one writer.** Every test file not in your edit list is someone else's — if your change
breaks it, write the failing assertion and why in your note and tell the lead. The lead holds `a11y`, `budgets`,
`frozen-routes`, `second-org`, `session`, `shell-*`, `unconfigured`, `auth*`, `reserve-probe`, `isolation`,
`definer-exposure`, every `fixture*.ts`, every `wave<N>-{demo,lead}-*` spec, `console.spec.ts`, `admin-nav.test.ts`,
`tests/unit/{ui-playground,no-raw-palette,scope-root,tokens-scope,tokens-only,public-graph,design-files,console-register}*`
and the registry, ★ **`tests/unit/mail-pinned/**` (read-only for everyone)**, and every spec of an unspawned track.

### Not this wave — never touched by ANY teammate until the lead says otherwise

- ★★ **the five public routes** — `src/app/[locale]/(marketing)/`, the thirteen components it renders, the register form,
  `public/**`, and anything `tests/unit/public-graph.test.ts` protects;
- ★★ **session stories** — the viewer, `story_views`, the `story` photo derivative — **the ring opens nothing**;
- ★ **`SCR-059` branding and the brand kit**; every `/app/platform` route;
- ★ **everything waves 18 – 22 rebuilt**; the member app's screens;
- ★ **replacing the renderer** (`DEC-017`, `DEC-048`); **a template serving several kinds** (`DEC-236` §1); **a phone
  designer** (`06` §2);
- a company logo (`DEC-195` §4); `DEC-215`'s carried four; ★ fixing the hard-load duplicate (`DEC-204`);
- a new keyframe, any motion in the studio beyond drag feedback, any change to how the five moments are keyed;
- deleting the `pg:` variants or `:root`'s old values;
- ★ the two carried gates, together (`DEC-194`); F2 and F3 (`DEC-198` §5); the overshoot ceiling (`DEC-186` §4); the
  `railway.json` — the owner's;
- deleting a session with its awarded points; a member uploading their own picture; recurring series (`A14`).

### Lead-only, always

`supabase/migrations/**` · `src/lib/session-status.ts` · `src/lib/ui/**` · ★ `tests/unit/ui-playground.test.ts` and its registry, `tests/unit/{no-raw-palette,scope-root,design-files,console-register}.test.ts` · ★ **every layout that renders `<PlayScope>`** — the shell, `(auth)`, `legal`, `s`, `verify` · ★ `src/app/[locale]/app/admin/layout.tsx` (the console frame, `DEC-227`, and the studio frame, `DEC-237`) · ★ `src/components/shell/admin-nav.ts` (the rail's items, `DEC-230` §3) · `src/components/ui/index.ts` and the lead's other `ui/` files, `scope.tsx` and `scope-portal.tsx` · `src/components/ui/objects/**` · `src/components/brand/**` · `src/app/globals.css` ·
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

★ **Three trees this wave**: PR A in the main checkout, PR B in `../kareem-marefa-wave23b` and PR C in `../kareem-marefa-wave23c` (cut from B once the shared chrome lands) — **work on a PR's files in that PR's tree only**, and never run a gate in a tree that is not yours without asking. **A shared working tree protects the repository, not your memory of a file.** The owner and the lead commit into this tree while you work. **Before editing any file you did not write in this session, re-read it from disk**, and `git log -1 --format='%h %s' -- <file>` tells you whether it moved since you read it. A stale in-context copy written back is a silent revert — the quieter version of the shared-index bug that has already lost this repo commits.

**`npm run qa`, `npm run visual`, `npm run build`, `supabase db reset|start|stop`, branch switches,
pushes and the PR are the lead's.** You run `npx tsc --noEmit`, `npm run lint` (grep the output for
`problems` — the "N fixable" line reads as green and is not the summary), `npm test`, ★ **`npm run ui-lint`
before any commit that ships a screen** (it is not in your task hook; CI's design-system job is otherwise
where you learn), and `npm run test:rls` (single-runner: `pgrep -fl "[n]ode_modules/.bin/vitest"` first), and
**one** e2e spec through the gate lock when a story is done. A diagnosis that needs a production build is a
question to the lead — **never run anything in the lead's verification worktree without asking**. The
`TaskCompleted` hook is path-aware (DEC-088): tsc, lint and vitest for you; it falls through to the
full `qa` only when a change can reach the frozen marketing routes — **if it does, you edited
something that is not yours** (★ wave 23: none of the four screens is public, and `ui/button`, `field`, `input`, `textarea` and `icons` are imported by the five public routes — if the hook runs the full `qa` for you, stop and tell the lead). SQL goes under `supabase/proposed/<you>/`, proven with
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
