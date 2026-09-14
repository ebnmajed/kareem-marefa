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
| 1 | **`/`, `/ar`, `/en`, `/ar/register`, `/og.png` are a frozen public contract** | A live site serves real visitors. `scripts/qa.mjs` guards them in CI. |
| 2 | **`registrations` is never dropped, altered, or read by platform code** | Frozen legacy holding real pre-launch signups (DEC-002). |
| 3 | **Every migration is forward-only** and tested against production-shaped data first | There is one Supabase project today and it is production. |
| 4 | **`main` stays deployable** | Every milestone ships to the live domain. |
| 5 | **Every table has an `org_id`, RLS enabled, a full policy set, and a test** | `REQ-NFR-001`. Five documented exceptions only (`02` §7; the fifth, `fonts`, is DEC-049). |
| 6 | **Every policy has a matching `grant`** | A policy without one fails `42501`. Migration `0002` exists *solely* because `0001` forgot it. |
| 7 | **`service_role` is never on Vercel** | Anything needing it is a worker job. |
| 8 | **No super-admin disjunct in any RLS policy** | DEC-014. It would reduce D3 to "one claim is correct". |
| 9 | **`points_ledger` and `audit_log` are append-only**, `revoke` including `service_role` | Balances must be recomputable; the audit log must be evidence. |
| 10 | **Arabic is written in Arabic.** Never draft in English and translate | D5. Inverting this on day one is irreversible in practice. |
| 11 | **No SVG uploads, anywhere** | DEC-009. It would render inside a privileged headless Chromium. |
| 12 | **One font set** — editor, worker Chromium, worker LibreOffice, identical by SHA-256 | D66. Font drift breaks Arabic silently. |

---

## Stack

**Next.js 16.2.10** · React 19.2.4 · next-intl 4.13.2 · Tailwind 4 · TypeScript 5.9.3 ·
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
converter/                      # LibreOffice + poppler behind signed URLs, NO credentials (DEC-032)
worker/                         # graphile-worker + the LISTEN/NOTIFY boot probe (DEC-034)
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
peer `@swc/helpers >=0.5.17` while the root has `0.5.15` for Next. **npm 10 adds a nested
`next-intl/node_modules/@swc/helpers`; npm 11 does not.** A lock written by npm 11 is missing an
entry npm 10 insists on, so `npm ci` — strict, unlike `npm install` — fails in CI while everything
looks fine locally. It has broken CI twice.

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
- Numerals follow the **org setting**, consistently across UI, email, templates and exports.

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

### Ownership map (wave 1 — M2)

| Teammate | Model | Tracks | Edits only |
|---|---|---|---|
| `sessions` | opus | PRO, SES, the clock jobs; **owns the event page and its slot contracts** | `app/sessions/**` (minus `check-in`, `host`, `rate`), `app/propose/**`, **`app/admin/{proposals,sessions,venues}/**` and `messages/*/admin.json` for wave 1 (DEC-042)**, `lib/dal/{sessions,proposals}.ts`, `components/sessions/**`, `worker/src/tasks/{start,complete}_session.ts`, its tests, `supabase/proposed/sessions/**`, `messages/*/{sessions,proposals}.json` |
| `checkin` | sonnet | RSV, CHK, the host view | `app/sessions/[id]/{check-in,host}/**`, `lib/dal/{rsvp,checkin}.ts`, `components/checkin/**`, `worker/src/tasks/{promote_waitlist,rotate_codes}.ts`, its tests, `supabase/proposed/checkin/**`, `messages/*/{rsvp,checkin}.json` |
| `event` | sonnet | EVT, RAT, private Realtime | `app/sessions/[id]/rate/**`, `lib/dal/{comments,reactions,reports,ratings}.ts`, `lib/realtime/**`, `components/event/**`, its tests, `supabase/proposed/event/**`, `messages/*/{event,ratings}.json` |

### Ownership map (wave 2 — M3 · M4 · M5, DEC-046)

| Teammate | Model | Tracks | Edits only |
|---|---|---|---|
| `notify` | opus | NTF, CAL, the reminder and calendar jobs, the mail transport (sink in dev/CI, Resend at Launch); **owns `public.notify()`, the contract the other two call** | `app/me/{notifications,calendar}/**`, **`app/admin/{emails,reminders}/**` for wave 2**, `app/api/{sessions/[id]/ics,webhooks,calendar}/**`, `lib/dal/{notifications,calendar}.ts`, `components/{notifications,calendar}/**`, `worker/src/{mail,calendar}/**` + its eight tasks, `messages/*/{notifications,calendar}.json`, `supabase/proposed/notify/**`, its tests, `docs/plan/notes/notify.md` |
| `scoring` | sonnet | PTS, LDR, REC | `app/{leaderboards,me/points}/**`, **`app/admin/{scoring,recognition}/**` for wave 2**, `lib/dal/{points,leaderboards,recognition,scoring-admin}.ts`, `components/scoring/**`, its eight worker tasks, `messages/*/{scoring,leaderboards,recognition}.json`, `supabase/proposed/scoring/**`, its tests, its note |
| `content` | sonnet | MAT, TSK, photos (EVT-009…015), DSC, PRO-004 | `app/api/{upload,materials,photos}/**`, **`lib/storage/**` (the single path builder)**, `lib/dal/{materials,photos,tasks,search,bookmarks}.ts`, `app/sessions/[id]/materials/**`, `app/me/bookmarks/**`, `components/{materials,photos,viewer,tasks,search}/**`, its four worker tasks + `worker/src/content/**`, `converter/{fixtures,test}/**`, `messages/*/{materials,photos,tasks,search}.json`, `supabase/proposed/content/**`, its tests, its note |

**Wave-2 rules:** tracks never edit wave-1 app code — they hook into M2 from SQL only (a trigger,
or a `create or replace` of an M2 RPC at its `TODO(notify, M3)` / `TODO(scoring, M4)` call site)
and the lead promotes it. Jobs are enqueued only through `public.enqueue_job()` (`0025`). The lead
wires the slots on the event page, the home page, the shell, the propose and browse screens.

### Ownership map (wave 3 — M6 · M7-console, DEC-048)

| Teammate | Model | Tracks | Edits only |
|---|---|---|---|
| `designer` | opus | DSG, CRT, the four render/issue/font jobs; **owns the renderer every export shares and the three poster/certificate slots** | `packages/designer-runtime/**`, `packages/storage-paths/src/designer.ts`, `app/admin/{designer,templates}/**`, `app/admin/sessions/[id]/certificates/**`, `app/me/certificates/**`, `verify/**`, `app/api/{designer,fonts,certificates}/**`, `lib/dal/{designer,templates,posters,certificates,fonts}.ts`, `components/{designer,posters,certificates}/**`, `worker/src/render/**` + its four tasks, `scripts/parity/**` minus `goldens/`, `messages/*/{designer,templates,certificates}.json`, `supabase/proposed/designer/**`, its tests, its note |
| `console` | sonnet | ADM-003 … 008 minus templates and branding, SCR-044, **SCR-011 (browse, first story)**, the RTL date-time picker, the member picker, `08`'s fourth reminder message; **inherits the seven M2–M4 admin screens** | `app/admin/**` except `designer`, `templates`, `sessions/[id]/certificates`, `branding` (the new `admin/layout.tsx` is its), `app/sessions/page.tsx` only, `app/api/admin/**`, `lib/dal/admin*.ts`, `lib/dal/scoring-admin.ts`, add-only admin functions in the wave-1/2 DAL modules, `components/{admin,browse}/**`, `messages/*/{admin,browse}.json`, `supabase/proposed/console/**`, its tests, its note |

**Wave-3 rules:** the engine is settled — DOM/SVG editor, headless Chromium in the worker image,
Tier A on every render (D66, A28, DEC-048); goldens change only through a lead-reviewed diff.
`designer` publishes `SessionPoster`, `PosterPicker` and `CertificateModeBadge` as placeholders on
day one; `console` publishes the admin shell with every admin route. `worker/src/index.ts` and the
image stay the lead's. Branding, the brand-kit screen and the platform library are wave 4's.

### Ownership map (wave 4 — M8 · M7-branding, DEC-052)

| Teammate | Model | Tracks | Edits only |
|---|---|---|---|
| `platform` | opus | ADM-001 … 003, ADM-019, DSG-008 (the platform library), PRF-006/007, NFR-012 … 015, the six M8 jobs; **owns the super-admin console, break-glass and the `ImpersonationBanner` slot** | `app/platform/**`, `legal/**`, `app/me/privacy/**`, `app/api/{platform,me/export}/**`, `lib/dal/platform*.ts`, `lib/dal/privacy.ts`, `components/{platform,legal,privacy}/**`, `worker/src/platform/**` + `worker/src/tasks/{enforce_retention,anonymise_members,assert_storage_prefixes,expire_impersonation,build_data_export,delete_org}.ts`, add-only platform-library functions in `lib/dal/templates.ts`, `messages/*/{platform,legal,privacy}.json`, `supabase/proposed/platform/**`, its tests, its note |
| `branding` | sonnet | DSG-021, ADM-015, SCR-059; **owns the brand kit — the entity, `getBrandKit()`, `public.brand_kit()` — and the org override the four consumers read** | `app/admin/branding/**`, `app/api/admin/branding/**`, `lib/brand/**`, `components/branding/**`, `packages/storage-paths/src/brand.ts`, add-only `resolveBrand()` in `packages/designer-runtime/src/brand.ts`, `messages/*/branding.json`, `supabase/proposed/branding/**`, its tests, its note |

**Wave-4 rules:** the super admin has **no data plane** (DEC-014, invariant 8) — `platform`'s DAL
reads org tables only inside an impersonation session that carries an ordinary member's claims;
`branding` never carries a hex literal past `0055`'s guard — the platform default is the identity
override, so the parity goldens do not move. Hooks into earlier waves are SQL only. **The lead
wires** the banner and the platform nav link into the shell, the org `@theme` layer into the locale
layout, the `brand` field of the render context into the worker's renderer and mail, and the six
task registrations. NFR-004/005 (the accessibility and performance closing pass) run after both
tracks land and touch every folder, so they are the lead's.
The A27 baseline — eight families, light and dark — is seeded platform-owned and present for every
org from creation (`0061`, DEC-052); promotion adds, it never supplies the baseline.


### Lead-only paths

`supabase/migrations/**` · `docs/plan/**` (teammates get `docs/plan/notes/<name>.md`) · `CLAUDE.md` ·
`.claude/**` · `.github/**` · `package.json`, `package-lock.json` · `src/app/[locale]/layout.tsx` ·
`src/app/[locale]/(marketing)/**` · `public/**` · `src/proxy.ts` · `src/lib/supabase/**` ·
`src/lib/dal/session.ts` · `src/i18n/**` · `src/messages/*/marketing.json` · `scripts/**` ·
`vitest.config.ts` · `playwright.config.ts`.

### The migration rule

**Teammates never write into `supabase/migrations/`.** One local Supabase and `supabase db reset`
applying every file on disk means a half-written migration breaks everyone the moment it is saved,
and two teammates would race for a sequence number. Teammates write SQL under
`supabase/proposed/<name>/`, prove it with `applyProposed()` inside their RLS tests (transactional,
rolled back), and hand the lead the file plus the `03` §8.2 rows and test names. The lead numbers,
moves, resets, runs the suite, commits. **Only the lead runs `supabase db reset`, `start`, `stop`.**

### The gate lock

`npm run qa`, `npm run visual`, Playwright's web server, `npm run test:e2e:unconfigured` and the
`TaskCompleted` hook all take **`/tmp/task-gate.lock`** (`scripts/lib/gate-lock.mjs`): one server on
port 3000 and one `.next` at a time. Waiters queue for up to 20 minutes and say so. **Only the lead
runs `npm run build`**; teammates run `tsc`, lint, `npm test`, `npm run test:rls`, and their e2e
through the lock.

### Git in a shared tree

One integration branch per wave (`wave-1/m2`). Stage **only your own paths** — never `git add -A`.
Teammates never `stash`, `rebase`, `reset --hard`, `clean`, or switch branches: it is everyone's
tree. **Only the lead switches branches**, and only between waves. Small conventional commits,
`Refs:` in the trailer paragraph. The lead pushes and opens the wave's PR; **the owner merges**
(`gh pr merge` is denied to every session by the shared settings, on purpose).

**No session — lead or teammate — changes repository visibility, billing, organisation or GitHub
settings.** Not the repo's visibility, archive state, default branch, rulesets, secrets, variables,
deploy keys, workflows' enabled state, collaborators, or anything under the account or org
settings; not the remotes either. The deny list refuses `gh repo edit`, `gh api`, `gh secret`,
`gh variable`, `gh ruleset`, `gh org` and `git remote set-url` outright. When a task seems to need
one of these, the session **stops and asks the owner** — it never works around the denial. The
repository is public until Launch by the owner's decision (DEC-051); nothing here changes that.

### Definition of done (every story, every teammate)

- `npx tsc --noEmit` clean · `npm run lint` zero errors · `npm test` green · `npm run test:rls` green
  with the generated sweep · your e2e green under `npm run test:e2e:local`.
- **`npm run qa` 44/44** and **`npm run visual` 0.000%** for anything that touches
  `src/app/[locale]/(marketing)/**`, `public/**` or the locale layout — lead runs these at sync points.
- **Arabic/RTL verified:** strings authored in `messages/ar/` first; all six ICU plural forms where a
  count appears; `<bdi>` on every interpolated value; logical properties only, no `rtl:` paired with
  a physical utility; no `overflow: hidden` on a text line; numerals per the org setting; one
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
