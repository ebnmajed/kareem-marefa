@AGENTS.md

# كريم معرفة — working conventions

This repository serves a **live pre-launch site** and is becoming the platform behind it. The full
plan is in [`docs/plan/`](docs/plan/).

---

## Read this first, every session

1. **[`docs/plan/STATUS.md`](docs/plan/STATUS.md)** — where the work is. Read first, write last.
2. **[`docs/plan/DECISIONS.md`](docs/plan/DECISIONS.md)** — decisions already taken. **Do not
   re-litigate these.**
3. The document you are about to change — check its status line.

★ **Visual direction lives in [`docs/design/`](docs/design/)** — «ساحة اللعب», accepted by `DEC-183`, and **the product's only visual language since `DEC-199`** — every surface but the five public routes is inside its scope (★ and from wave 26 the three rebuilt public pages are too — `DEC-247`), and ★★ **a screen is REBUILT to its design, never restyled** — ★★ **its page file is DELETED first, then written from its artboard, and the story lists what it kept and the requirement that made it keep it** (`DEC-208`).
Read [`docs/design/README.md`](docs/design/README.md) before any UI work. **`DECISIONS.md` and
`docs/plan/` win over it**: where the two disagree, the case is listed in `DEC-183` §4, `DEC-195` §6, `DEC-199` §5, `DEC-206` §4, `DEC-213` §5 and `DEC-216` §5
(one hundred and forty-eight so far, plus `DEC-225` §4 and `DEC-227` §5) or becomes a new entry — nobody picks a side silently. Its prototypes are behaviour references;
a prototype's class name never appears in `src/`.
★ **From wave 18 a screen has a drawing**: `docs/design/screens/<batch>.md` and its artboards under `docs/design/screens/<batch>/` — the HTML is the source of truth for layout, sizes and copy, and no `.dc.html` reaches the build (`REQ-UIX-063`).

**Before ending a session, update `STATUS.md`**, whether or not you finished what you set out to do.

### The four rules of the handoff protocol

1. **Read `STATUS.md` first.**
2. **Cite a `REQ-*` ID** for any change touching an entity, policy, screen, job or notification.
   Only [`01-prd.md`](docs/plan/01-prd.md) may *define* a requirement; everything else cites.
3. **Log any post-plan decision in `DECISIONS.md`** — append only, never edit or delete. A
   `settled` or `frozen` document may **only** change via a `DECISIONS.md` entry.
4. **Update `STATUS.md` before you finish.**

Document statuses: `draft` · `settled` · `frozen` · `withdrawn`. Story statuses: `todo` ·
`in-progress` · `done`.

---

## Hard invariants — never break these

| # | Invariant | Why |
|---|---|---|
| 1 | **`/`, `/ar`, `/en`, `/ar/register`, `/og.png` are a live public contract** — their URLs, registration behaviour and accessibility floor never regress; their appearance changes only through a `DECISIONS.md` entry and a re-baselined capture in the same commit (`DEC-167`) | A live site serves real visitors. `qa:contract` guards the behaviour in CI at every commit; `qa:appearance` and `npm run visual` move with the design. |
| 2 | **`registrations` is never dropped, altered, or read by platform code** | Frozen legacy holding real pre-launch signups (DEC-002). |
| 3 | **Every migration is forward-only** and tested against production-shaped data first | There is one Supabase project today and it is production. |
| 4 | **`main` stays deployable** | Every milestone ships to the live domain. |
| 5 | **Every table has an `org_id`, RLS enabled, a full policy set, and a test** | `REQ-NFR-001`. Seven documented exceptions only (`02` §7; the fifth, `fonts`, is DEC-049; the sixth and seventh, `retention_periods` and `platform_audit_log`, are DEC-054). ★ The survey's register and box (`survey_participations`, `survey_responses`, `survey_answers`) carry `org_id` and RLS and **deliberately no policy and no grant** — that *is* their policy set (`03` §5.6f, DEC-160 §3, DEC-161). **Never add `created_at` or a member to a response.** |
| 6 | **Every policy has a matching `grant`** | A policy without one fails `42501`. Migration `0002` exists *solely* because `0001` forgot it. |
| 7 | **`service_role` is never on Vercel** | Anything needing it is a worker job. |
| 8 | **No super-admin disjunct in any RLS policy** | DEC-014. It would reduce D3 to "one claim is correct". |
| 9 | **`points_ledger` and `audit_log` are append-only**, `revoke` including `service_role` | Balances must be recomputable; the audit log must be evidence. |
| 10 | **Arabic is written in Arabic.** Never draft in English and translate | D5. Inverting this on day one is irreversible in practice. |
| 11 | **No SVG uploads, anywhere; document uploads are PDF-only** | DEC-009, DEC-058. An SVG would render inside a privileged headless Chromium; a PowerPoint would need LibreOffice, which no longer exists here. |
| 12 | **One font set** — editor, worker Chromium, worker poppler, identical by SHA-256 | D66. Font drift breaks Arabic silently. |

---

## Stack

**Next.js 16.3.5** (vendors `react-dom` 19.3.0-canary — DEC-146) · React 19.2.4 · next-intl 4.13.2 · Tailwind 4 · TypeScript 5.9.3 ·
Zod 4.4.3 · supabase-js 2.110.2 · Vitest 4.1.10
**Infra:** Vercel · Supabase cloud · graphile-worker (host TBD by M3 — DEC-034, OQ-027) · Resend · Sentry
**CLI:** `supabase` 2.109.1, linked to project `qnwbgzsgkftqaixzuhdo`

### This is Next 16, not what you remember

`AGENTS.md` requires reading `node_modules/next/dist/docs/` before writing Next.js code. The
verified facts, so you do not re-derive them:

- **`cookies()`, `headers()`, `params`, `searchParams` are async-only.** Always `await`.
- **Middleware is `src/proxy.ts`.** Not `middleware.ts`.
- **`revalidateTag(tag, profile)` takes two arguments.** One argument is a TS error.
  **`updateTag(tag)`** is Server-Action-only (read-your-own-writes). **`refresh()`** refetches the
  RSC payload without invalidating.
- **Server Actions dispatch one at a time per client.** Never `Promise.all` over actions —
  they serialise. Parallel work goes inside one action.
- **Server Actions have a 1 MB body cap.** Uploads and designer autosave are **Route Handlers**.
- **Server Action IDs rotate on deploy.** Freeze deploys during scheduled sessions; keep
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` stable.
- **`next/image`: `priority` → `preload`.** `images.qualities` defaults to `[75]`.
- **Auth: DAL + React `cache()`, checks close to the data, never in layouts** (Partial Rendering
  means a layout does not re-render on navigation). `proxy.ts` does optimistic cookie checks only.
- **Cache Components is OFF** (DEC-013). `getTranslations()` cannot be called inside a `use cache`
  boundary. Routes go dynamic by touching `cookies()` in the DAL — **never** `export const dynamic`.

### Supabase specifics

- **`getClaims()` returns a three-way union.** `{data: null, error: null}` is a reachable
  no-session state, so **narrow on `data`, not on `error`**. Narrowing on `error` lets
  unauthenticated requests through while looking correct.
- Claims: `org_id` **immutable**; `org_role` / `status` re-read from the table on privileged writes
  against `claims_version`; `jwt_expiry` 900 s.

### Tailwind v4

- **No `tailwind.config.*`.** Tokens live in `src/app/globals.css` under `@theme`.
- **The `@theme inline` block is load-bearing.** A plain `@theme` resolves `var(--fg-heading)` at
  `:root` once, freezing light values and breaking `.theme-dark`.
- **`rtl:` / `ltr:` variants add zero specificity** (`:where()`). Never pair one with a physical
  utility for the same property — the physical one wins.

---

## Folder layout

```
src/
├── proxy.ts                    # locale routing + CSP nonce + optimistic auth
├── app/[locale]/               # the real root — next-intl. No src/app/layout.tsx.
│   ├── page.tsx · register/    # FROZEN marketing
│   ├── (auth)/ · legal/ · verify/[code]/
│   └── app/                    # session required
│       ├── sessions/ · propose/ · members/ · me/ · leaderboards/
│       ├── admin/              # org admin + moderator
│       └── platform/           # super admin
├── app/api/                    # Route Handlers: uploads, autosave, ICS, webhooks
├── components/ui/              # house primitives over Radix + the eight inline glyphs (icons.tsx)
├── lib/dal/                    # THE ONLY PLACE THAT TOUCHES SUPABASE
├── lib/supabase/               # server · browser · worker clients
├── i18n/ · messages/{ar,en}.json
packages/designer-runtime/      # THE renderer — shared by the app and the worker
packages/fonts/                 # THE font set — manifest + files by SHA-256 (DEC-031)
worker/                         # graphile-worker + the LISTEN/NOTIFY boot probe (DEC-034); poppler renders PDF pages here (DEC-058)
tests/                          # *.test.ts units · components/ (jsdom) · e2e/ (Playwright)
scripts/fonts/                  # extract · derive-ttf · check — the REQ-DSG-016 gate
```

**The Next app stays at the repository root.** npm workspaces (`packages/*`) do not require
`apps/web`, and Turbopack transpiles workspace packages automatically under the App Router — so
there is no `transpilePackages` entry and Vercel's root directory is untouched (DEC-029).

`@kareem/designer-runtime` is the **only** renderer. The app, the worker image and the parity
suite all import it, which is what keeps them from drifting (DEC-017). Root `npm run build` builds
it first, explicitly — Vercel restores a cache and reports "up to date", which would otherwise
leave `dist` stale.

---

## Naming

| Thing | Convention |
|---|---|
| Tables | plural `snake_case` |
| Columns | `snake_case`; FKs `<singular>_id`; timestamps `_at` |
| Booleans | read as assertions — `allow_download`, not `downloadable` |
| Enums | singular `snake_case`, **Postgres enum types**, never `text` + check |
| Files | `kebab-case.tsx` |
| Components | `PascalCase` |
| Message keys | `feature.screen.element`, **stable** — copy changes, keys do not |
| Job names | `snake_case` verbs — `render_variant`, `award_points` |

---

## The lock file — regenerate it with `npm run lockfile`, never plain `npm install`

```bash
npm run lockfile     # regenerates package-lock.json with CI's npm, in a container
```

The lock is **npm-version-sensitive**. `next-intl` bundles `@swc/core`, which declares an optional
peer `@swc/helpers >=0.5.17` while the root had `0.5.15` for Next 16.2. **npm 10 added a nested
`next-intl/node_modules/@swc/helpers`; npm 11 did not.** A lock written by npm 11 was missing an
entry npm 10 insisted on, so `npm ci` — strict, unlike `npm install` — failed in CI while everything
looked fine locally. It broke CI twice. Next 16.3.5 ships `@swc/helpers 0.5.23`, so that one nested
entry is gone from the lock (DEC-146) — **the rule is not**: the next optional peer will do the same.

So: if you add or change a dependency, run `npm run lockfile` before committing. CI is the backstop
if you forget.

## Local development

```bash
supabase start      # the whole stack in Docker: Postgres, Auth, Storage, Realtime, Studio
supabase db reset   # recreate and re-apply every migration — do this often
supabase stop       # free the ~4GB when you are done
```

API `localhost:54321` · Studio `localhost:54323` · Mail `localhost:54324` · DB `localhost:54322`.
**Dev is local and CI is a Postgres container** — there is no hosted dev or staging project
(DEC-025). Local needs no Supabase account.

### Running SQL against production

```bash
supabase db query --linked "select ..."    # via the Management API — NO db password needed
supabase db dump --linked --data-only ...  # read-only inspection
```

Three rules, learned the hard way (DEC-023, DEC-027):

1. **Read before you write.** `select` the rows first and look at them.
2. **Scope every write with an explicit predicate.** Never an unqualified `delete` or `update`.
3. **Never do a one-off data fix as a migration.** Migrations are schema, forward-only, and run in
   every environment forever. A data fix is none of those.

A `--data-only` dump of `public` contains **every real signup's personal data** — delete it as soon
as you are done with it.

## Data access

1. **Server-side Supabase client for all data.** The browser client is for auth UI and Realtime
   **only** (DEC-020 — and that reverses the README's old invariant; read the entry before
   "fixing" it).
2. **Every DAL module starts with `import 'server-only'`.**
3. **Every DAL function calls `requireSession()` first** — at the data, not in a layout.
4. **Every DAL function returns a DTO**, never a raw row. Profile tiering (A33) is a DAL
   guarantee, not a rendering one.
5. **RLS is always on.** Application filters are defence in depth, never the boundary.
6. **The worker uses `service_role` only through `SECURITY DEFINER` functions**, never raw table
   writes.

## Validation

- **Zod on every Server Action and Route Handler**, before anything else.
- **Validation checks shape, not authority.** Take a reference plus the change; re-derive ownership
  server-side from the session. A well-formed object can still name a row the caller does not own.
- **Uploads are sniffed on content, not extension**, after the bytes land.

## i18n and RTL

- **Every user-facing string is externalised.** `ar.json` is the source and is complete.
- **Logical properties only.** No `left`/`right`/`ml-4`/`text-left` in layout code.
- **Arabic plurals need all six ICU forms.**
- **Never letter-space Arabic.** Never `overflow: hidden` on a text line (it clips tashkeel).
  Never justify text.
- **Bidi-isolate every interpolated value** — `<bdi>` around titles, names, codes.
- Body line-height **1.7**, headings **1.4**, base **17 px** on mobile.
- **Numerals are Western — `0123456789` — everywhere, always** (`DEC-124`). Never `١٢٣`, in any
  string, on any surface, including Arabic copy. There is no org setting; it was dropped.

## Testing

- **Vitest** units (`npm test`, two projects: `unit` under Node, `components` under jsdom in an RTL
  document) · **Playwright** e2e (`npm run test:e2e`, against the stub) · **RLS suite is the
  highest-value tests in the product.**
- **`npm run visual capture <name>` / `compare <a> <b>`** — the before/after diff of the frozen
  routes. Anything touching the layout runs it against a baseline taken from `main`.
- **Nothing serves the app for tests except `scripts/lib/stubbed-server.mjs`.** It wires
  `next start` to the QA stub; a test can submit real forms and never reach production.
- **Every policy has a test case** (`REQ-NFR-001`). The isolation sweep is **generated** over the
  entity list, so a new table is covered the day it is created.
- **Shaping goldens are never auto-refreshed.** A changed golden is a reviewed change.
- Four blocking CI gates: `qa` (frozen routes) · `policy-diff` (migrations vs `03`) ·
  `parity` (Tier B) · `trace` (`node scripts/traceability.mjs`).

## Commits

```
<type>(<scope>): <subject in the imperative>

<body: why, not what>

Refs: REQ-CHK-006, DEC-015
Co-Authored-By: …
```

`Refs:` sits in the **final trailer paragraph** with any other trailers and no blank line between
them, so `git interpret-trailers` parses it (DEC-033).

Types: `feat` `fix` `docs` `refactor` `test` `chore` `perf` `security`.
Scopes: `auth` `sessions` `rsvp` `checkin` `materials` `scoring` `designer` `certs` `notify`
`calendar` `admin` `i18n` `infra` `plan`.

**Every commit touching an entity, policy, screen, job or notification cites a `REQ-*`.**
**Push as `ebnmajed` via the `github-second` SSH alias. Never reset `origin` to HTTPS.**

---

## Agent team

A lead session with three to five in-process teammates sharing **this one checkout, one branch, one
local Supabase**. The full model — waves, spawn prompt, contracts — is in
[`docs/plan/TEAM.md`](docs/plan/TEAM.md) (DEC-040). The rules below are the ones that bite.

### Ownership maps

★ **Every map from wave 1 to wave 29 is in [`docs/plan/notes/ownership-maps.md`](docs/plan/notes/ownership-maps.md)**,
unchanged and under the same headings — a citation of «`CLAUDE.md` § *Ownership map (wave N)*» resolves there.
The last wave, 29 (M34, `DEC-280`), merged as PRs #104, #106 and #105 and was closed by `DEC-282`.
**No wave is open**: the next lead writes a new map **here**, before spawning anyone, and moves it to that file
when the wave closes. The per-file `ui/` ownership below still governs `src/components/ui/`.

### Lead-only paths

`supabase/migrations/**` · `docs/plan/**` (teammates get `docs/plan/notes/<name>.md`) · `CLAUDE.md` ·
`.claude/**` · `.github/**` · `package.json`, `package-lock.json` · `src/app/[locale]/layout.tsx` ·
`src/app/[locale]/(marketing)/**` · `public/**` · `src/proxy.ts` · `src/lib/supabase/**` ·
`src/lib/dal/session.ts` · `src/i18n/**` · `src/messages/*/marketing.json` · `scripts/**` ·
`vitest.config.ts` · `playwright.config.ts` · `patches/**` (`DEC-136` — empty since `DEC-146` retired the one patch; a new one is the lead's) ·
★ from wave 10 (`DEC-160`): `worker/Dockerfile`, `worker/package.json` and every `packages/*/{package.json,tsconfig.json}` — a package's manifest is the lead's, its `src/` is its track's.
★ from wave 15 (`DEC-183`): `src/lib/fonts.ts`, `packages/fonts/**`, `scripts/fonts/**`, `src/components/ui/objects/**`, `src/components/brand/**` and `docs/design/**` — the font set, the objects and the wordmark have one writer.
★ from wave 16 (`DEC-195`): `src/lib/ui/**` — the moments' shared mechanism (confetti, the count-up, the once-per-occurrence keying) has one writer, so the vocabulary cannot drift track by track.
★ from wave 17 (`DEC-199`): `tests/unit/ui-playground.test.ts` and its registry, `tests/unit/{no-raw-palette,scope-root}.test.ts` — the gate that reads `src/components/ui/` has one writer, and **an exemption in it is a visible diff with a reason**. ★ `PlayScope` is rendered by a layout and by nothing else, and the layouts that render it are the lead's.
★ from wave 19 (`DEC-213`): `src/app/[locale]/app/members/**`, `src/lib/dal/members.ts` and `members.json` are `scoring`'s for the wave, back to `sessions` after it.
★ from wave 20 (`DEC-217`): `src/app/[locale]/app/me/{layout,loading,error}.tsx` and `src/components/me/tab-strip.tsx` are the lead's — the hub frame has one writer; `me/certificates/**` is `content`'s and `leaderboards/**` `scoring`'s for the wave, back to `designer` and `sessions` after it.
★ from wave 21 (`DEC-227`): `src/app/[locale]/app/admin/layout.tsx` is the lead's — the console frame has one writer; `admin/proposals/**` is `sessions'` for the wave, back to `console` after it. `tests/unit/console-register.test.ts` is the lead's, amended once (`DEC-227` §2).
★ from wave 22 (`DEC-231`): `admin/{scoring,recognition}/**` and `scoring-admin.ts` are `scoring`'s, `admin/{reminders,settings}/**` and `admin-settings.ts` `notify`'s, `admin/moderation/**` and `admin-moderation.ts` `content`'s — **for the wave**, back to `console` after it. `src/components/shell/admin-nav.ts` stays the lead's.
★ from wave 23 (`DEC-237`): `admin/templates/**`, `admin/sessions/[id]/certificates/**`, `lib/dal/{templates,certificates}.ts` and `messages/*/{templates,certificates}.json` are `console`'s **for the wave**, back to `designer` after it. `ui/{editor-rail,floating-toolbar}.tsx` are the lead's — the chrome both editors share has one writer.
★ from wave 24 (`DEC-242`): `packages/designer-runtime/src/brand.ts` is the lead's **for the wave** (`branding`'s otherwise, and `BRAND_COLOUR_TOKENS` is unchanged), and `tests/unit/mail-pinned/**` is the lead's **alone** — a pinned mail file and a parity golden have one writer, and in the one wave where both are allowed to move that matters more, not less. `admin/templates/**` and `lib/dal/{templates,certificates}.ts` return to `designer`.
★ from wave 26 (`DEC-248`): `src/components/brand/**` holds `<Logo>` and is the lead's, as it always was — **and both wordmark components are deleted by PR E, so there is one mark**; `src/app/[locale]/verify/**` is the lead's **for the wave** (`designer`'s otherwise); `src/app/[locale]/app/platform/layout.tsx` and `src/components/platform/platform-nav.tsx` are the lead's — the platform frame has one writer, as the console's has since wave 21; `me/privacy/**`, `components/privacy/**` and `lib/dal/privacy.ts` are `branding`'s **for the wave**, back to `platform` after it; `admin/moderation/**` is `content`'s **for the wave**, back to `console` after it. ★★ `tests/unit/public-graph.test.ts` is rewritten **once**, by the lead, in PR A's one commit (`DEC-247`) — the only guard this programme has rewritten rather than amended, and it says so in its header.
★ from wave 27 (`DEC-254`): `src/app/[locale]/app/me/{page.tsx,actions.ts,state.ts}`, `src/components/me/**` and `updateMyProfile()` are `console`'s **for the wave** (the one field), back to `content` and `sessions` after it; `/app/platform/templates/**` and `platform-templates.ts` are the lead's to delete. `provision_member()` has one writer, the lead.
★ from wave 18 (`DEC-206`): `tests/unit/design-files.test.ts` — the gate that keeps `docs/design/screens/` out of the build has one writer. `src/app/[locale]/app/page.tsx` is `content`'s for the wave: home is the feed, a page composed of three tracks' items on the lead's frame.

★ **Added by DEC-085, with the design milestone** — none of these was lead-only before, and
`src/components/ui/**` was in no teammate's edit list *and no teammate's never-touch list*:

`src/components/ui/index.ts` · `src/app/globals.css` · `src/app/[locale]/app/layout.tsx` ·
`src/app/[locale]/app/me/layout.tsx` · `src/lib/session-status.ts` · `src/app/[locale]/(dev)/**` ·
`src/messages/*/ui.json`.

★ **Corrected by DEC-130:** `src/app/[locale]/app/page.tsx` is `sessions'` from wave 6 — `/app` became
the sessions timeline (`DEC-112`), which is no longer a page composed of other tracks' rails — and
`src/lib/form-state.ts` is `sessions'`, which built it in M9 and which the wave-5 table already said.

**Inside `src/components/ui/` ownership is per FILE, not per directory** — a glob with four writers
is the exact failure `TEAM.md` exists to prevent. The four literal file lists — the lead's fifteen,
`sessions'` eight, `console'`s six, `content'`s nine — are in each `.claude/agents/*.md`, and they are
unchanged since wave 5 apart from naming `submit-button.tsx`, which is the lead's, and ★ **`reorderable-list.tsx`, which the lead adds in wave 10** (`DEC-160` §5 — the survey's questions and the email studio's blocks both reorder through it). ★ **Wave 15 adds ten files, each with one owner** (`DEC-183`): `sticker`, `poster`, `reaction-bar`, `progress-bar` and `story-ring` are `content`'s; `session-cta` and `code-input` are `sessions'`; `rank-row`, `race-bar` and `level-card` are `scoring`'s — its first primitives. ★ **Wave 16 adds none** (`DEC-195`): the moments compose the primitives that exist, and a moment's own component lives with its screen, not in `ui/`. ★ **Wave 18 adds four** (`DEC-206`): `week-hud` is `scoring`'s, `feed-item` and `attendee-stack` are `content`'s, `action-bar` is `sessions'` — 53 files. ★ **Wave 19 adds four** (`DEC-213`): `page-viewer` is `content`'s, `star-input` `event`'s — its first — `stepper` `sessions'`, `badge-medallion` `scoring`'s — 57 files. ★ **Wave 20 adds three** (`DEC-216` §2.1): `podium` and `ledger-row` are `scoring`'s, `settings-group` `notify`'s — its first — 60 files; `status-mark` is withdrawn. ★ **Wave 21 adds three** (`DEC-225` §2, `DEC-227` §2): `admin-rail` is the lead's — and `src/components/admin/admin-rail.tsx` is deleted, so there is one — `split-view` and `kv-card` `sessions'` — 63 files. ★ **Wave 22 adds none** (`DEC-230`): the three `data-table` cells are stories on `console`'s file — 63 files, the floor unmoved. ★ **Wave 23 adds six** (`DEC-235`, `DEC-237`): `editor-rail` and `floating-toolbar` are the lead's — both editors share them — `canvas-stage` and `layer-list` `designer`'s (and `src/components/designer/layer-list.tsx` is deleted, so there is one), `block-canvas` and `block-library` `notify`'s — 69 files. ★ **Wave 24 adds none** (`DEC-242`): the wave changes documents and constants, not screens — the floor stays **69**. ★ **Wave 26 adds two** (`DEC-245`, `DEC-248`): `story-viewer` and `story-capture` are `content`'s — 71 files, and `story-ring`, built inert in wave 15 and kept inert since wave 18, opens at last. ★ **Wave 27 adds none** (`DEC-254`) — 71 files, the floor unmoved. ★ **Wave 28 adds none** (`DEC-258`) — 71 files. ★ **Wave 17 adds none** (`DEC-199`) — and from it **the directory is the list**: `tests/unit/ui-playground.test.ts` fails on a file in `ui/` with no playground treatment, no test inside the scope or no gallery entry, so a primitive can no longer be absent from a plan unnoticed. **Ownership lives in those never-touch paragraphs or
it does not exist**, which is why all ten were regenerated in the same commit as this list.

`src/components/ui/index.ts` exports **types only**; implementations are imported **by path**. A
runtime barrel would drag `toast`, `combobox` and `route-progress` — all `"use client"` — into the
client graph of every server page that imports `Card`.

### The migration rule

**Teammates never write into `supabase/migrations/`.** One local Supabase and `supabase db reset`
applying every file on disk means a half-written migration breaks everyone the moment it is saved,
and two teammates would race for a sequence number. Teammates write SQL under
`supabase/proposed/<name>/`, prove it with `applyProposed()` inside their RLS tests (transactional,
rolled back), and hand the lead the file plus the `03` §8.2 rows and test names. The lead numbers,
moves, resets, runs the suite, commits. **Only the lead runs `supabase db reset`, `start`, `stop`.**

★ **A `DECISIONS.md` entry never cites an unallocated migration number** (`DEC-180`). Either the migration
exists on disk when the entry is written, and the entry names it, or the entry says «a migration in the wave that
builds this», and the wave's own entry names the number once it is written. It has happened twice, with the same
cause each time:
- **`DEC-076` → «`0086`».** The download audit rows were never written; `0086` became wave 7's manual-mark window
  (`DEC-141`). `DEC-177` found it.
- **`DEC-099` → «`0089`».** The Google CSP entry and the `^https://` check were never removed; `0089` became
  wave 7's early-completion check-in close. A later wave then drew the Google URL on every comment, so the
  decision to stop the hotlink predates the code that started it. `DEC-180` found it, and `0155` closed it.

A number cited ahead of time is taken by whatever wave gets there first, and the promised change vanishes without
an error: nothing fails when a migration that was only ever a sentence is not applied.

### The gate lock

`npm run qa`, `npm run visual`, Playwright's web server, `npm run test:e2e:unconfigured` and the
`TaskCompleted` hook all take **`/tmp/task-gate.lock`** (`scripts/lib/gate-lock.mjs`): one server on
port 3000 and one `.next` at a time. ★ **The hook is path-aware since DEC-088**: it runs
`tsc + lint + vitest` — no server, no lock — and takes the lock for a full `npm run qa` only when the
change can reach the frozen marketing routes, measured from the commit at which qa last passed
(`.git/kareem-qa-verified`). Before that it ran the full suite on every teammate's every task, about
twenty-four times a wave, which made "qa is lead-only" unenforceable. Waiters queue for up to 20 minutes and say so. **Only the lead
runs `npm run build`**; teammates run `tsc`, lint, `npm test`, `npm run test:rls`, and their e2e
through the lock.

### Git in a shared tree

One integration branch per wave (`wave-1/m2`). Stage **only your own paths** — never `git add -A`.
Sessions may switch branches, rebase, merge PRs (`gh pr merge`) and change repository settings
without asking the owner — the owner has made the workflow fully automated, and the shared settings
carry no deny list. ★ **Still check before acting**: merge only on a concluded-green CI run; push a
migration to production only after the whole RLS suite passes locally; never force-push `main`.
Small conventional commits, `Refs:` in the trailer paragraph. The repository is public until
Launch by the owner's decision (DEC-051).

### Definition of done (every story, every teammate)

- `npx tsc --noEmit` clean · `npm run lint` zero errors · `npm test` green · `npm run test:rls` green
  with the generated sweep · your e2e green under `npm run test:e2e:local`.
- **`npm run qa` 44/44** and **`npm run visual` 0.000%** for anything that touches
  `src/app/[locale]/(marketing)/**`, `public/**` or the locale layout — lead runs these at sync points.
- **Arabic/RTL verified:** strings authored in `messages/ar/` first; all six ICU plural forms where a
  count appears; `<bdi>` on every interpolated value; logical properties only, no `rtl:` paired with
  a physical utility; no `overflow: hidden` on a text line; **Western numerals only** (`DEC-124`); one
  390 px RTL screenshot per new screen, looked at.

## The plan

| | |
|---|---|
| [`STATUS.md`](docs/plan/STATUS.md) | **Read first, write last** |
| [`DECISIONS.md`](docs/plan/DECISIONS.md) | Append-only decision log |
| [`_source-brief.md`](docs/plan/_source-brief.md) | The brief verbatim — D1–D68, A1–A32. **Never edit.** |
| [`00-overview.md`](docs/plan/00-overview.md) | Personas, **AR/EN glossary**, ID scheme, owning-document table |
| [`01-prd.md`](docs/plan/01-prd.md) | **The only place a requirement is defined** — 251 of them |
| [`02-domain-model.md`](docs/plan/02-domain-model.md) | 64 entities, DDL, state machines. **Frozen.** |
| [`03-permissions-rls.md`](docs/plan/03-permissions-rls.md) | Policies, storage, ~80 test cases |
| [`04-architecture.md`](docs/plan/04-architecture.md) | **The canonical route table**, worker, deployment, secrets |
| [`05-scoring-engine.md`](docs/plan/05-scoring-engine.md) | Catalogue, ledger, leaderboards |
| [`06-visual-designer.md`](docs/plan/06-visual-designer.md) | Layer model, exports, **the parity suite** |
| [`07-content-pipeline.md`](docs/plan/07-content-pipeline.md) | Uploads, conversion, the viewer, photos |
| [`08-notifications-calendar.md`](docs/plan/08-notifications-calendar.md) | The matrix, templates, calendar sync |
| [`09-sitemap-screens.md`](docs/plan/09-sitemap-screens.md) | 53 screens, each with mobile/desktop/RTL notes |
| [`10-i18n-rtl.md`](docs/plan/10-i18n-rtl.md) | Typography tokens, bidi, numerals, adding English |
| [`11-background-jobs.md`](docs/plan/11-background-jobs.md) | 34 jobs, idempotency keys, alerts |
| [`12-security-privacy.md`](docs/plan/12-security-privacy.md) | Threat model, retention, PDPL |
| [`13-testing-quality.md`](docs/plan/13-testing-quality.md) | Test strategy, budgets, device matrix, CI |
| [`14-roadmap.md`](docs/plan/14-roadmap.md) | M0–M8, no phase-2 bucket |
| [`15-backlog.md`](docs/plan/15-backlog.md) | 112 stories, each citing `REQ-*` |
| [`16-ui-redesign.md`](docs/plan/16-ui-redesign.md) | **The UI/UX rebuild** — system, IA, loading, forms, the studio, the email studio. Its **visual** notes are superseded by `docs/design/` where the two disagree (`DEC-183`); its structure stands |
| [`docs/design/`](docs/design/) | ★ **The visual direction** — tokens, type, motion, components, stories, assets, two prototypes. Not part of the plan set: it cites ids and never defines them, and `DECISIONS.md` wins over it (`DEC-183`) |
| [`ASSUMPTIONS.md`](docs/plan/ASSUMPTIONS.md) | A1–A40 with status |
| [`OPEN-QUESTIONS.md`](docs/plan/OPEN-QUESTIONS.md) | 26 gaps, each with a default in force |
| [`TRACEABILITY.md`](docs/plan/TRACEABILITY.md) | **Generated.** `node scripts/traceability.mjs` |

## The five things most likely to go wrong

1. **M1 is the dangerous milestone** — retrofitting auth and RLS onto a live database whose only
   policy is `anon`-insert. Do not compress it.
2. **The Custom Access Token Hook is a single point of failure for all sign-in.** It must never
   raise, must return the event unchanged when no member row exists, and needs three separate
   grants for `supabase_auth_admin`. Failure looks like a generic auth outage.
3. **Font subsetting is the likeliest silent Arabic killer.** A subsetter dropping `rlig`/`mark`
   passes every Latin test and breaks lam-alef.
4. **Storage path prefixes are the only place isolation depends on application correctness.**
   One path builder, a restrictive prefix policy, a nightly assertion.
5. **graphile-worker needs a session-mode connection (port 5432, not 6543).** On the pooler it
   degrades silently to polling. The boot-time probe is mandatory.
