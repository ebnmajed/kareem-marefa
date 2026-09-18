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
| `content` | sonnet | MAT, TSK, photos (EVT-009…015), DSC, PRO-004 | `app/api/{upload,materials,photos}/**`, **`lib/storage/**` (the single path builder)**, `lib/dal/{materials,photos,tasks,search,bookmarks}.ts`, `app/sessions/[id]/materials/**`, `app/me/bookmarks/**`, `components/{materials,photos,viewer,tasks,search}/**`, its four worker tasks + `worker/src/content/**`, `messages/*/{materials,photos,tasks,search}.json`, `supabase/proposed/content/**`, its tests, its note |

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

### Ownership map (wave 10 — the survey and the email studio, DEC-160) — ★ THE MAP IN FORCE

**Two features that were deferred twice — the survey (`REQ-SUR-001` … `009`) and the email studio
(`REQ-NTF-009` … `014`, `16` §11) — and three fixes wave 9 sized.** The checklist is `STATUS.md`'s wave-10
block: the contracts between tracks, then the rows. **The measure is two demonstrables, each from EMPTY on a
production build with the real worker, at 390 px in Arabic** — a survey authored, attached, answered beside
the rating, refused to its presenter, withheld at two responses and drawn at three, exported; and a designed
template duplicated, reordered with taps, previewed by the production renderer, sent as a test and then
received as a real reminder — **and two things that must not change**, proven by the suites that exist today
passing with their assertions untouched (`STATUS.md`'s *untouched-suite ledger*): ★ **a session with no
survey shows nothing about one, anywhere**, and ★ **an org that has not touched its templates sends
byte-identical mail**.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ **`ui/reorderable-list`, on day one** — both features are specified against it and it does not exist (`DEC-160` §5) · ★ **the survey's storage contract** (`DEC-160` §3) and **every `create table` / `alter table` of the wave**, landed at sync 1 from the tracks' plans, with the `02`, `03`, `11` and `12` text `DEC-074` and `DEC-094` claimed and never wrote · ★ **`packages/mail-runtime`** scaffolded and `render.ts` + `templates.ts` moved into it **mechanically, after `notify`'s pinned output is committed and with it as the proof** · the custodian rows (the admin rail's entry and the audited export's registration for the survey; the two task registrations) · ★ **the owner's migration order DRAFTED AT SYNC 1**, the caller audit, the data-shaped rehearsal · both demonstrable specs · promotion, gates, the PR | the lead-only paths below, `supabase/migrations/**` from `0123`, ★ `src/components/ui/reorderable-list.tsx` (the lead's fifteenth `ui/` file) with its test and gallery entry, ★ `packages/mail-runtime/{package.json,tsconfig.json}`, `worker/src/index.ts`, `worker/Dockerfile`, `tests/rls/{fixture*,isolation.test,db,definer-exposure.test,session-days*.test}.ts`, `tests/e2e/wave10-demo-*.spec.ts`, the lead's fourteen other `ui/` files, `src/app/globals.css`, `src/lib/session-status.ts`, `src/app/[locale]/app/layout.tsx`, `src/components/shell/**`, `src/app/[locale]/(auth)/**`, `messages/*/{ui,app,auth}.json`. **Custodian** of every file of a track not spawned — `sessions`, `checkin`, `scoring`, `console`, `platform`, `branding` — **including `sessions'` eight and `console`'s six `ui/` primitives**, edited only for its own rows or on a teammate's written request |
| `event` | ★ **opus** | **the survey, end to end** (`REQ-SUR-001` … `009`): the behaviour on the lead's tables — templates copied into a session's survey, the one definer function that accepts an answer, the one that releases results under the withhold · the rate screen carrying the rating and the survey as **one screen and two decorrelated writes** · the jittered job that writes a response naming no member · SCR-065 (templates, reordered without dragging) · SCR-064 (attach, response rate, results or the withhold, the CSV's rows) · `ratings.submitted_at` / `edited_at` to the day and the presenter's comment order | ★ `src/app/[locale]/app/sessions/[id]/rate/**`, ★ `src/components/event/{ratings,star-rating}.tsx`, ★ `src/lib/dal/ratings.ts`, ★ `messages/*/ratings.json` (all four back from `sessions`), new `src/app/[locale]/app/admin/surveys/**` and `src/app/[locale]/app/admin/sessions/[id]/survey/**`, new `src/components/survey/**`, new `src/lib/dal/surveys.ts`, new `worker/src/tasks/record_survey_response.ts`, new `messages/*/survey.json`, `supabase/proposed/event/**`, `tests/rls/{ratings,survey}*.test.ts`, `tests/unit/{ratings,survey}*`, `tests/components/survey/**`, `tests/components/event/{ratings,star-rating}.test.tsx`, `tests/e2e/{event-rate,wave7-sessions-rate}.spec.ts` (evidence), new `tests/e2e/wave10-event-*.spec.ts`, its note |
| `notify` | opus | **the email studio** (`REQ-NTF-009` … `014`): ★ **first, today's output pinned** — subject, text and HTML for all 25 keys from the renderer as it stands on `main` · the nine-block compiler beside the string path, the text alternative generated from the blocks · bindings declared per key and refused by the database · the three-pane editor in `/app/admin/emails`' frame, previewing through the one renderer in phone, desktop, plain-text and forced-dark · «أرسل اختبارًا» to the admin's own address and no other · the eight designed platform templates, every one of the 25 keys resolving to a design · `08` §3.2 reconciled (23 listed, 25 real) · **last, `REQ-NTF-008`'s bounce webhook** | `worker/src/mail/**`, ★ `packages/mail-runtime/src/**` (after the lead's scaffold), ★ `src/app/[locale]/app/admin/emails/**` and `src/components/admin/delivery-reason.ts` (back from `console`, `DEC-085`), new `src/components/email/**`, new `src/app/api/admin/emails/**` and `src/app/api/webhooks/resend/**`, `src/lib/dal/notifications.ts`, `worker/src/tasks/send_notification.ts`, new `worker/src/tasks/send_test_email.ts`, `messages/*/notifications.json`, a new `messages/*/emails.json` if it wants one, `supabase/proposed/notify/**`, `tests/unit/{mail,notify,admin-emails}*`, `tests/rls/{notify,notifications}*.test.ts`, ★ `tests/components/admin/emails-page.test.tsx`, ★ `tests/e2e/wave8-console-emails.spec.ts` (evidence), new `tests/components/email/**` and `tests/e2e/wave10-notify-*.spec.ts`, its note. **Fixes only** on what it built in wave 9: `src/app/[locale]/app/me/{calendar,notifications}/**`, `src/components/{notifications,calendar}/**`, `src/lib/dal/calendar.ts`, `src/app/api/{sessions/[id]/ics,calendar}/**`, `worker/src/calendar/**`, its other seven tasks, `messages/*/calendar.json` |
| `designer` | opus | **certificates, re-issued** (`DEC-153`'s carry): a member removed and re-added gets a new certificate under the next serial, the revoked one still verifying as revoked; two rows per member read correctly on SCR-045 and `/app/me/certificates` · **a multi-day poster's date** (wave 9's row L6): a new binding, a **new** seed migration (`DEC-149` §3), a one-day poster rendering the characters it renders today · **the review of `notify`'s block-to-table compiler** (`16` §11.6), written in its note | `src/app/[locale]/app/admin/{designer,templates}/**`, `src/app/[locale]/app/admin/sessions/[id]/certificates/**`, ★ `src/app/[locale]/app/me/certificates/**` (back from `content`), `src/app/api/{designer,fonts,certificates}/**`, `src/lib/dal/{designer,templates,posters,certificates,fonts}.ts`, `src/components/{designer,posters}/**`, `src/components/certificates/**` except `held-achievements.tsx`, `packages/designer-runtime/**`, `packages/storage-paths/src/designer.ts`, `worker/src/render/**`, its four worker tasks, `scripts/parity/**` minus `goldens/`, `messages/*/{designer,templates,certificates}.json`, `supabase/proposed/designer/**` — ★ **with `0108`'s four functions, the lead's as custodian until now** — `tests/rls/{designer,templates,posters,certificates,fonts,exports}*.test.ts`, `tests/unit/{designer,render,posters,certificates,qr,fonts,serial}*`, `tests/e2e/{designer,templates,certificates,posters}*.spec.ts`, `tests/e2e/wave8-designer-*.spec.ts`, ★ `tests/e2e/wave7-content-certificates.spec.ts` and `tests/components/me/certificates-page.test.tsx` (evidence), `tests/components/{designer,certificates,posters}/**`, new `tests/e2e/wave10-designer-*.spec.ts`, its note |
| `content` | sonnet | **a proposal's own material** (`DEC-155`'s carry): the three policies that `inner join sessions` admit a proposal's material for its owner and for staff, and **an admin reviewing a proposal can open the file the proposer attached** (`REQ-PRO-004`) · two carried fixes — the photo tile's takedown label wrapping, a save pressed before hydration on `/app/me` · `03` §5.5a's corrected text, in its note for the lead | `src/components/{materials,photos,viewer,tasks}/**`, `src/app/[locale]/app/sessions/[id]/materials/**`, `src/lib/dal/{materials,photos,tasks}.ts`, `src/app/api/upload/**`, `src/lib/storage/**`, `worker/src/content/**` and `worker/src/tasks/{convert_document,render_pages,process_photo}.ts`, its nine `ui/` primitives, `messages/*/{materials,photos,tasks}.json`, `supabase/proposed/content/**`, its tests, new `tests/e2e/wave10-content-*.spec.ts`, its note. **Fixes only**: `src/components/event/{comments,comment-composer,comment-item,comment-list}.tsx` and `actions.ts`, `src/lib/dal/{comments,reactions,reports}.ts`, `src/lib/realtime/**`, `src/app/[locale]/app/me/{page,layout,loading,error}.tsx`, `me/{bookmarks,privacy}/**`, `src/components/me/**`, `messages/*/{event,profile,privacy}.json` |

★ = transferred or changed for this wave by `DEC-160`.

**Wave-10 rules.**

- ★ **The survey's storage contract is the lead's and comes before any table** (`DEC-160` §3): a stored
  response names **no member** and carries **no timestamp**; «one member, one response» lives in
  `survey_participations`; the response is written by a jittered job whose payload and key name no member;
  **no client role selects a response or an answer** — results leave through one definer function that applies
  the withhold to **every** question type, for the screen and the CSV alike; `ratings` holds no instant finer
  than a day. `event` plans against it; a plan that needs a member on a response is a question to the lead,
  never a column.
- ★ **`notify` pins before it changes.** There are no mail goldens today (`DEC-160` §4), so «byte-identical
  for an untouched org» is unproven until the 25 rendered messages are committed from `main`'s renderer. The
  package move and the block compiler both come after, and both are measured against those files. **Pinned
  mail output is never auto-refreshed** — a changed file is a reviewed change, as a shaping golden is.
- ★ **Two untouched rules, one ledger.** A pre-existing `tests/**` file changes only with a line in
  `STATUS.md`'s ledger saying why. The rate screen's specs pass unmodified on a session with no survey; the
  mail unit suites pass unmodified on an org with no block template. `wave8-console-emails.spec.ts` is the
  one spec the wave replaces content under — each changed case gets its own ledger line, and the delivery-log
  cases do not change at all.
- **Tables are the lead's; behaviour is the tracks'.** No teammate writes `create table` or `alter table`,
  even in `proposed/` — it names the columns in its plan and the lead lands them at sync 1. **A function has
  one writer.**
- **Additive, because `main` runs on it first.** The owner pushes, then merges; Vercel and the Railway worker
  deploy from `main`. No column dropped or renamed; a changed function is dropped and re-created **in the
  same file** with its new arguments trailing and defaulted. Three things `main`'s worker must survive, each
  answered in its owner's plan: a **block template's row** (its `subject` and `body` still render on the
  string path), a **coarsened rating**, and a **second certificate** for one member.
- **Teammates spawn planning-only**; sync 1 approves four plans against the contracts. The lead builds
  `ui/reorderable-list` while they plan.
- **New routes exist in `04` before they exist in `src/`** (`DEC-083`): `/app/admin/surveys` and
  `/app/admin/surveys/[templateId]` are in (`DEC-160`); anything the studio needs beyond `/app/admin/emails`
  is named in `notify`'s plan and lands with sync 1's entry.
- **Every track that ships a screen runs `npm run ui-lint` before it commits** — it is not in the task hook,
  and CI's design-system job is otherwise where a teammate learns.
- **One writer per file, JSON and specs included.** `ratings.json` is `event`'s again, `certificates.json`
  `designer`'s; the emails screen's strings stay in `notifications.json` unless `notify` moves them whole.
- **Captures land at `.qa-shots/rtl/wave10-<track>-<surface>-<state>.png`** in the main checkout, phone
  project, `390 × 844`, from a production build the row names by commit, honouring `E2E_SHOTS_DIR` — and the
  lead opens every one **in bands, never downscaled**.
- **Not this wave, and never-touch for every teammate:** everything under `(marketing)/**` with the
  components it renders (M13, with `DEC-126`'s «تسجيل الدخول» and `chapter.tsx`'s eleven glyphs); recurring
  series (`A14`); **drag** in `ui/reorderable-list` (buttons conform; drag is the enhancement); the studio's
  M12 mechanics beyond what the email studio needs; removing `render.ts`'s string path (M13, `DEC-081`);
  points for answering a survey (no requirement asks for it); a member reading or editing their own answers
  (`DEC-160` §3 makes it impossible on purpose); every `app/admin` route not named in a row above; all of
  `app/platform/**`; the brand kit; `verify/**`; `legal/**`; objectives, tags, avatar storage, downloads
  (`DEC-076`).
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`,
  `start`, `stop`, branch switches, pushes and the PR.

### Ownership map (wave 9 — multi-day sessions, DEC-150) — ★ THE RECORD OF A FINISHED WAVE

> Wave 9 merged as PR #26 (`f2ead54`). Its map is kept as the record; **wave 10's map is directly above** (`DEC-160`).

**One feature on a new entity — `ENT-session_days` (`DEC-119` … `DEC-121`) — and not a routes wave.** A
session has one or more days; each day carries its own check-in; materials, tasks and photos belong to the
session **or** to a day; points and the certificate need every day by default. **The checklist is
`STATUS.md`'s wave-9 block, and its unit is the CONTRACT, not the route** — eleven seams between tracks
(ten at Step 0; `DEC-151` added the eleventh at sync 1), each with an owner and a state. **The measure is two demonstrables**: a three-day workshop end to end at 390 px
in Arabic, and **a one-day session byte-identical in behaviour to `main`** — proven by the existing suites
passing with their assertions untouched, and tracked by `STATUS.md`'s *untouched-suite ledger*.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ **the foundation, before any teammate's SQL** — `0100`: `session_days`, the two-way sync that keeps `sessions.starts_at`/`ends_at`/venue **derived and stored**, the backfill of every session to one day, `session_day_id` on the six tables, `require_all_days` · **every `alter table` of the wave** · `src/lib/session-status.ts` on the day set (contract 9) · the `REQ-TSK-002` guard (contract 10) · the three custodian rows (certificate eligibility, the attendance CSV's day column, the poster's date assessed at sync 1) · the demonstrable spec · promotion, the rehearsal notes, gates, the PR | the lead-only paths below, `supabase/migrations/**` from `0100`, `src/lib/session-status.ts`, `tests/rls/{fixture*,isolation.test,db}.ts`, `tests/rls/session-days*.test.ts`, `tests/unit/{session-status,tasks-never-read-by-check-in}*.test.ts`, `tests/e2e/wave9-three-day-workshop.spec.ts`, the lead's fourteen `ui/` files, `src/app/globals.css`, `src/app/[locale]/app/layout.tsx`, `src/components/shell/**`, `src/app/[locale]/(auth)/**`, `messages/*/{ui,app,auth}.json`, `worker/src/index.ts`. **Custodian** of every file of a track not spawned — `event`, `designer`, `console`, `platform`, `branding` — **including `console`'s six `ui/` primitives (`date-time` among them) and `components/admin/{rtl-datetime-picker,duration-input,duration}`**, edited only for its own rows or on a teammate's written request |
| `sessions` | opus | **`REQ-SES-016` — the form**: multi-day behind «جلسة متعدّدة الأيام», the end following the duration until it is edited, each added day defaulting to the previous day's time and place, validation at the field on blur · `schedule_session()`'s day set and `listSessionDays()` (contract 3) · the event page, the cards and the public card showing days · the one day-label formatter (contract 7) | ★ `src/app/[locale]/app/admin/sessions/[id]/schedule/**` and `messages/*/schedule.json` (from the lead), `src/app/[locale]/app/{page.tsx,sessions/{page,loading,error}.tsx}`, `src/app/[locale]/app/sessions/[id]/{page,loading,error,not-found}.tsx`, `src/app/[locale]/s/**`, `src/components/{sessions,browse,search}/**`, `src/lib/dal/{sessions,proposals,search,bookmarks,members}.ts`, `src/lib/form-state.ts`, its eight `ui/` form primitives, `worker/src/tasks/{start,complete}_session.ts`, `messages/*/{sessions,proposals,browse,search,members}.json`, `supabase/proposed/sessions/**`, its tests, its note. **Fixes only** on `propose/**`, `sessions/[id]/rate/**`, `members/**`, `leaderboards/**` |
| `checkin` | ★ **opus** | **per-day check-in**: the code, the attendance list, the attempt stream, the switch (`DEC-116`) and the `ends_at + 2 h` ceiling, each **per day** (contract 4) · the host view and the attendance screen across days · `rotate_codes` by day · contract 5's call sites | `src/app/[locale]/app/sessions/[id]/{check-in,host}/**`, `src/app/[locale]/app/admin/sessions/[id]/attendance/**`, `src/components/checkin/**`, `src/lib/dal/{rsvp,checkin}.ts`, `worker/src/tasks/{promote_waitlist,rotate_codes}.ts`, `messages/*/{rsvp,checkin}.json`, `supabase/proposed/checkin/**`, its tests, its note |
| `content` | sonnet | **`DEC-121` — content scoping**: one grouped list per content type, session content first, **no groups and no headings at `n ≤ 1`**; the add control in each group's header; the re-scope chip; photos scoped by upload time and never asked; ★ **`materials.phase` relative to the scope** (`REQ-MAT-006`) · one photo driven end to end on the real worker (`DEC-139`'s last gap) | `src/components/{materials,photos,viewer,tasks}/**`, `src/app/[locale]/app/sessions/[id]/materials/**`, `src/lib/dal/{materials,photos,tasks}.ts`, `src/app/api/upload/**`, `src/lib/storage/**`, `worker/src/content/**` and `worker/src/tasks/{convert_document,render_pages,process_photo}.ts`, its nine `ui/` primitives, `messages/*/{materials,photos,tasks}.json`, `supabase/proposed/content/**`, its tests, its note. **Fixes only** on what it holds from waves 6–7 and does not build in this wave: `src/components/event/{comments,comment-composer,comment-item,comment-list}.tsx` and `actions.ts`, `src/lib/dal/{comments,reactions,reports}.ts`, `src/lib/realtime/**`, `src/app/[locale]/app/me/{page,layout,loading,error}.tsx`, `me/{bookmarks,certificates,privacy}/**`, `src/components/me/**`, `messages/*/{event,profile,certificates,privacy}.json` |
| `scoring` | ★ **opus** | **`REQ-SES-017`**: points and the certificate need **every day** unless the session relaxes it; the award **moves from the check-in to session completion** when the day set is not known until then, and is unchanged at one day; the idempotency key per member **per session**, surviving wave 7's remove → re-add; `attendance_recorded()` / `attendance_removed()` (contract 5) and `session_attendance_complete()` (contract 6); the points history saying **which day was missed** | ★ `src/app/[locale]/app/me/points/**` and `src/components/scoring/{points-history-list,points-catalogue,points-strip}.tsx` (back from `content`), `src/lib/dal/{points,leaderboards,recognition}.ts`, its eight worker tasks (`award_points`, `award_presenter_points`, `evaluate_no_shows`, `evaluate_streaks`, `evaluate_badges`, `evaluate_levels_perks`, `snapshot_leaderboards`, `audit_balances`), ★ `messages/*/scoring.json` (back from `console`), `supabase/proposed/scoring/**`, its tests, its note |
| `notify` | opus | **one calendar entry and one reminder stream per day** (contract 8) — `calendar_events` per day (its `alter table` through the lead), the ICS route's one `VEVENT` per day, `calendar_upsert`/`calendar_delete` per day, `schedule_session_reminders()` per day, a reschedule notice that names the day that moved — **with every identity a one-day session has today unchanged** | ★ `src/app/[locale]/app/me/{calendar,notifications}/**`, `src/components/{notifications,calendar}/**` and `src/lib/dal/{notifications,calendar}.ts` (back from `content` and `console`), `src/app/api/{sessions/[id]/ics,calendar}/**`, `worker/src/{mail,calendar}/**` and its eight tasks, ★ `messages/*/{notifications,calendar}.json`, `supabase/proposed/notify/**`, its tests, its note |

★ = transferred or changed for this wave by `DEC-150`.

**Wave-9 rules.**

- ★ **The foundation lands before any teammate's SQL is promoted**, and **`0100` alone must leave every
  existing suite green** — that is the first half of «byte-identical», proven before the feature exists.
  Teammates spawn **planning-only**; sync 1 approves five plans against the ten contracts.
- ★ **Additive, because `main` runs on it first.** The owner pushes migrations, then merges; Vercel and the
  Railway worker both deploy from `main`. No column dropped or renamed; no function `main` calls loses the
  name or the named arguments `main` sends; a new parameter is trailing and defaulted, and **the old
  signature is dropped in the same file** so PostgREST never sees two overloads (`0085`'s lesson).
- ★ **No `if (isMultiDay)` in a reader.** A reader handles `n` days and is correct at `n = 1` because 1 is a
  value of `n`. The three places the specification itself names a difference are **writers** — the award's
  timing (`REQ-SES-017`), a photo's automatic scope (`DEC-121`: null while the session has one day), and the
  form's affordance — and each says so in a comment citing the requirement.
- ★ **Tables are the lead's; behaviour is the tracks'.** A teammate never writes `alter table` or
  `create table`, even in `proposed/` — it names the column in its plan and the lead lands it. **A function
  has one writer**: two tracks never `create or replace` the same function; the function's owner calls a
  function the other track owns (contract 5 is the pattern).
- ★ **The existing suites are evidence, so they are not edited to fit.** A pre-existing `tests/**` file
  changes only with a line in `STATUS.md`'s ledger saying why — a selector that moved, never an expectation
  that changed for a one-day session. New behaviour gets **new** files (`*-days*.test.ts`,
  `wave9-<track>-*.spec.ts`).
- ★ **`REQ-TSK-002`: nothing on a check-in path reads a task** — not a function, not a DAL module, not a
  component. Days put tasks beside attendance in the schema for the first time; the lead's guard test fails
  the build if the two ever meet.
- ★ **This is not `A14`'s recurring series.** One session, N meetings, one registration, one certificate,
  one rating, one discussion, one poster. `rsvps` and `capacity` stay on the session (`DEC-120`); nothing
  this wave creates, copies or repeats a session.
- ★ **Sync 1's rulings (`DEC-151`) are part of this map**: a day's check-in ceiling is capped by the next
  day's start and is **one function of the lead's** (`check_in_ceiling()`, `0101`); contract 5 has **three**
  hooks — `scoring`'s two are points only, certificates go through the lead's
  `attendance_certificate_sync()`; **no trigger on `session_days` notifies** — `sessions'` day-aware
  `schedule_session()` calls `notify`'s `session_days_changed()` once (contract 11); an attendance award is
  guarded by a **standing-award check under a lock**, its key being the second line of defence; with at most
  one day the three content slots render **every** item flat. The two schedule-form tests follow the screen
  to `sessions`. **Four named differences at one day** are approved fixes, listed in `STATUS.md`.
- **One writer per file, JSON and specs included.** `schedule.json` is `sessions'` now; `scoring.json`,
  `notifications.json` and `calendar.json` return to their tracks, and the `/app/me` and `/app/admin`
  screens that read them keep every key they read.
- **Captures land at `.qa-shots/rtl/wave9-<track>-<surface>-<state>.png`** in the main checkout, phone
  project, `390 × 844`, from a production build the row names by commit, honouring `E2E_SHOTS_DIR` —
  **each surface twice: a three-day session, and the same surface on a one-day session beside its wave-7/8
  capture.**
- **Not this wave, and never-touch for every teammate:** **the survey** (`REQ-SUR-001` … `009`) and **the
  email studio** (`REQ-NTF-009` … `014`, `16` §11) — both wave 10; recurring series (`A14`); per-day
  capacity or per-day registration (`DEC-120`); a free-text note on a day (`DEC-120`); a scope picker
  (`DEC-121`); every `app/admin` route except `sessions/[id]/{schedule,attendance}`; all of
  `app/platform/**`, the studio, the brand kit, `verify/**`, `legal/**`; objectives, tags, avatar storage,
  downloads (`DEC-076`); and everything under `(marketing)/**` with the components it renders — frozen
  until M13, where `DEC-126`'s «تسجيل الدخول» and `chapter.tsx`'s eleven glyphs land.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`,
  `start`, `stop`, branch switches, pushes and the PR.

### Ownership map (wave 8 — the last nineteen routes, DEC-147) — ★ THE RECORD OF A FINISHED WAVE

> Wave 8 merged as PR #25 (`b7f2f3a`). Its map is kept as the record; **wave 9's map is directly above** (`DEC-150`).

**The last nineteen routes onto the M9 system — and the whole app is on it — plus the two features
that live in those files: gradient posters with `canvasRaise` (`DEC-127`) and the certificate library
(`DEC-128`).** The checklist is `STATUS.md`'s wave-8 block, every route named; the measure is
`node scripts/ui-reach.mjs --wave8` (strict) **plus** a 390 px RTL capture at
`.qa-shots/rtl/wave8-<track>-<route>-<state>.png` in the main checkout, from the build the row names,
opened by the lead. **Baseline at Step 0: 2 of 20 strict.**

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ **task one, done before Step 0** — Next 16.3.5, the patch, its guard, `patch-package` and `postinstall` out together (`DEC-146`, `e7d0657`, 16/16 twice against a 7/16 control) · `/app/admin/sessions/[id]/schedule` rebuilt «more user friendly … intuitive to fill and quick» ★ · the `org_domains` check converged across environments, with its rehearsal · the worker's polling log line · promotion, the parity goldens' review, gates, the PR | the lead-only paths below, `src/app/[locale]/app/admin/sessions/[id]/schedule/**` ★, a new `messages/*/schedule.json` ★, the lead's fourteen `ui/` files, `src/app/globals.css`, `src/lib/session-status.ts`, `src/app/[locale]/app/layout.tsx`, `src/components/shell/**`, `src/app/[locale]/(auth)/**`, `messages/*/{ui,app,auth}.json`. **Custodian** of every file of a track not spawned — `sessions`, `checkin`, `content`, `event`, `notify`, `scoring` — **including `sessions`' eight and `content`'s nine `ui/` primitives**, edited only for its own rows or on a teammate's written request |
| `designer` | opus | `/app/admin/designer/[documentId]` · `/app/admin/templates/posters` · `/app/admin/templates/certificates` · `/app/admin/sessions/[id]/certificates` — **and `DEC-128`**: three certificate families in both orientations and both schemes, chosen at issue time, the poster roster completed, `REQ-DSG-026`'s roster counted in CI; the scheme passed at every call site; gradient parity cases in both directions, goldens through the lead | `src/app/[locale]/app/admin/{designer,templates}/**`, `src/app/[locale]/app/admin/sessions/[id]/certificates/**`, `src/app/api/{designer,fonts,certificates}/**`, `src/lib/dal/{designer,templates,posters,certificates,fonts}.ts`, `src/components/{designer,posters}/**`, `src/components/certificates/**` except `held-achievements.tsx`, `packages/designer-runtime/**` **except** `src/{brand,model,render,bindings}.ts`, `packages/storage-paths/src/designer.ts`, `worker/src/render/**` except `brand.ts`, its four worker tasks, `scripts/parity/**` minus `goldens/`, `messages/*/{designer,templates,certificates}.json` ★, `supabase/proposed/designer/**`, its tests, its note |
| `console` | opus | `/app/admin/audit` · `/app/admin/exports` · `/app/admin/reminders` · `/app/admin/recognition` · `/app/admin/scoring` · `/app/admin/emails` (around what it does today — **not** the email studio) | `src/app/[locale]/app/admin/{layout,page,loading,error}.tsx`, `src/app/[locale]/app/admin/{audit,exports,reminders,recognition,scoring,emails}/**`, fixes only on its wave-6/7 admin routes, `src/app/api/admin/exports/**` ★, `src/lib/dal/{admin-audit,admin-dashboard,admin-exports,admin-lists,admin-members,admin-moderation,admin-settings,scoring-admin}.ts`, add-only `src/lib/dal/{notifications,recognition}.ts` ★, `src/components/admin/**`, presentation-only `src/components/certificates/held-achievements.tsx` ★, its six `ui/` primitives, `messages/*/{admin,recognition,scoring,notifications}.json` ★, `supabase/proposed/console/**`, its tests (with `scoring-screens`, `scoring-company-points`, `notify-screens` ★), its note |
| `platform` | opus | **all seven `/app/platform` routes** and the console's shell — `/app/platform` · `orgs` · `orgs/new` · `orgs/[id]/domains` · `templates` · `metrics` · `impersonate`, with the banner | `src/app/[locale]/app/platform/**`, `src/app/api/platform/**`, `src/lib/dal/{platform,platform-templates}.ts`, `src/components/platform/**`, `worker/src/platform/**` and five of its tasks (fixes only), `messages/*/platform.json`, `supabase/proposed/platform/**`, its tests, its note |
| `branding` | sonnet | `/app/admin/branding` — **and `DEC-127`**: `model.ts`'s gradient fill, the renderer and the binding collector walking it, the LTR mirror of the angle (`360 − angle`), `canvasRaise` in `BRAND_COLOUR_TOKENS` and in the brand kit's SQL | `src/app/[locale]/app/admin/branding/**`, `src/app/api/admin/branding/**`, `src/lib/brand/**`, `src/components/branding/**`, `packages/designer-runtime/src/{brand,model,render,bindings}.ts` ★, `worker/src/render/brand.ts` ★, `packages/storage-paths/src/brand.ts`, `messages/*/branding.json`, `supabase/proposed/branding/**`, its tests, its note |

★ = transferred for this wave by `DEC-147`.

**Wave-8 rules.**

- ★ **Task one landed before Step 0, and Step 0 before anyone spawns.** Next 16.3.5 retires the patch;
  the reserve probe is the measure of any hang, and nobody re-adds a nudge.
- ★ **Four day-one contracts, published in the owner's note:** (1) `branding` → `designer` — `DEC-127`'s
  `background` union and the `canvasRaise` token, **as types**, before any rendering; (2) `branding` →
  `designer` — `scheme` is passed explicitly at every call site (posters `'dark'`, certificates the chosen
  template's); (3) `designer` → `platform` — **what a baseline row is**, ruled by the lead at sync 1 before
  anyone seeds (`DEC-125` calls the scheme a mechanism, `DEC-128`'s table counts it as rows); (4) lead →
  `platform` — `org_domains` stores lowercase through its trigger, whatever the form sends.
- ★ **The runtime has two writers this wave, split by file**: `branding` holds `brand.ts`, `model.ts`,
  `render.ts`, `bindings.ts` and `worker/src/render/brand.ts`; `designer` holds everything else in the
  package and in `worker/src/render/`, the parity harness and the call sites. **The goldens move for the
  first time since M6**, and only through a lead-reviewed diff: `designer` runs `--update`, the lead looks
  at every before and after and commits `scripts/parity/goldens/**`.
- ★ **Two of three primitive owners are not spawned.** A request for one of `sessions`' eight or
  `content`'s nine `ui/` files goes to the lead, who changes it as custodian with a test.
- **One writer per file, JSON and specs included.** The schedule's strings move from `admin.json` and
  `checkin.json` into the lead's new `schedule.json`; `console` deletes `admin.schedule.*` on request.
  `console` writes `scoring.json` and `notifications.json` this wave; the `/app/me` screens that read them
  keep every key they read.
- **Captures land where the row says** — `.qa-shots/rtl/wave8-<track>-<route>-<state>.png` in the main
  checkout, phone project, `390 × 844`, from a production build the row names by commit; a run in a
  verification worktree sets `E2E_SHOTS_DIR` to the main checkout's `.qa-shots/rtl`.
- **Not this wave, and never-touch for every teammate:** **multi-day sessions** (`DEC-119` … `121` — wave
  9's whole subject), **the survey**, **the email studio** (`16` §11, M12), the studio's M12 mechanics
  unless approved at sync 1, status-colour contrast enforcement (M13), `app/me/**`, `verify/**`,
  `legal/**`, `s/[id]`, objectives, tags, avatar storage, downloads (`DEC-076`), and everything under
  `(marketing)/**` with the components it renders.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`,
  `start`, `stop`, branch switches, pushes and the PR.

### Ownership map (wave 7 — the remainder, DEC-137) — ★ THE RECORD OF A FINISHED WAVE

> Wave 7 merged as PR #24 (`4f19cd6`). Its map is kept as the record; **wave 8's map is directly above** (`DEC-147`).

**Twenty-two named pages and one admin IA onto the M9 system, plus the manual check-in switch.**
The checklist is `STATUS.md`'s wave-7 block, every route named; the measure is
`node scripts/ui-reach.mjs --wave7` (strict, as in wave 6) **plus** a 390 px RTL capture at the path
the row cites, from the build the row names, opened by the lead.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ **task one, alone, before anyone spawns** — `DEC-136`'s `react-dom` patch and `ui/pending-nudge` deleted in one change, verified 16/16 · `global-error` resolved by a test · `ui/splash`'s LCP measurement · `REQ-EVT-010` reconciled · promotion, gates, the PR | the lead-only paths below, `patches/**`, the lead's fourteen `ui/` files, `src/app/globals.css`, `src/lib/session-status.ts`, `src/app/[locale]/app/layout.tsx`, `src/components/shell/**`, `src/app/[locale]/(auth)/**`, `messages/*/{ui,app,auth}.json`. **Custodian** of every file of a track not spawned — `event`, `notify`, `scoring`, `designer`, `platform`, `branding` — edited only on a teammate's written request |
| `checkin` | sonnet | `/app/sessions/[id]/check-in` · `/app/sessions/[id]/host` · `/app/admin/sessions/[id]/attendance` ★ — **and** the manual check-in switch, its ceiling, the admin's removal with its reversal, walk-ins as a publishing setting (`DEC-113`, `DEC-116` … `DEC-118`, `REQ-CHK-010`, `015`, `016`, `017`) | `src/app/[locale]/app/sessions/[id]/{check-in,host}/**`, `src/app/[locale]/app/admin/sessions/[id]/attendance/**` ★, **feature-only** `src/app/[locale]/app/admin/sessions/[id]/schedule/{schedule-form.tsx,actions.ts,state.ts}` ★ (the walk-in field and its parameter — no redesign), `src/components/checkin/**` (all of it again — the wave-6 presentation transfer ends), `src/lib/dal/{rsvp,checkin}.ts`, `messages/*/{rsvp,checkin}.json`, `supabase/proposed/checkin/**`, its tests, its note |
| `sessions` | opus | `/app/propose` · `/app/propose/[id]` · `/app/sessions/[id]/rate` ★ · `/s/[id]` · `/app/members/[id]` ★ · `/app/leaderboards` ★ | `src/app/[locale]/app/propose/**`, `src/app/[locale]/app/sessions/[id]/rate/**` ★, `src/app/[locale]/s/**`, `src/app/[locale]/app/members/**` ★, `src/app/[locale]/app/leaderboards/**` ★, `src/components/event/{ratings,star-rating}.tsx` ★, `src/components/scoring/{member-board,company-board,company-points-breakdown}.tsx` ★, `src/components/{sessions,browse,search}/**`, `src/lib/dal/{sessions,proposals,search,bookmarks}.ts`, `src/lib/dal/members.ts` ★ (sync 1, `DEC-141`), **add-only** `src/lib/dal/{ratings,leaderboards,recognition}.ts` ★, `src/lib/form-state.ts`, its eight `ui/` form primitives, `messages/*/{sessions,proposals,browse,search,ratings,leaderboards}.json` (★ the last two), a **new** `messages/*/members.json` ★, `supabase/proposed/sessions/**`, its tests, its note |
| `content` | sonnet | **all seven `/app/me` routes** ★ — `/app/me` · `me/points` · `me/certificates` · `me/bookmarks` · `me/calendar` · `me/notifications` · `me/privacy` | `src/app/[locale]/app/me/**` ★ (including a new `me/layout.tsx`), `src/components/notifications/{notification-list,preference-matrix}.tsx` ★, `src/components/scoring/{points-history-list,points-catalogue}.tsx` ★, `src/components/me/**` (new), **add-only** `src/lib/dal/{points,certificates,notifications,calendar,privacy}.ts` ★, `messages/*/{profile,scoring,certificates,notifications,calendar,privacy}.json` ★, and everything it held in wave 6 — `src/components/event/{comments,comment-composer,comment-item,comment-list,actions}`, `src/lib/dal/{comments,reactions,reports,materials,photos,tasks}.ts`, `src/lib/realtime/**`, `src/components/{materials,photos,viewer,tasks}/**`, `src/app/[locale]/app/sessions/[id]/materials/**`, `src/app/api/upload/**`, `src/lib/storage/**`, its nine `ui/` primitives, `messages/*/{event,materials,photos,tasks}.json`, `supabase/proposed/content/**`, its tests, its note |
| `console` | ★ **opus** | **the admin rail's 14-group IA** (`16` §6.7) + **exactly six routes**: `/app/admin/moderation/comments` · `/app/admin/moderation/photos` · `/app/admin/venues` · `/app/admin/categories` · `/app/admin/companies` · `/app/admin/settings` | `src/app/[locale]/app/admin/{layout,page,loading,error}.tsx`, `src/app/[locale]/app/admin/{moderation,venues,categories,companies,settings}/**`, the five wave-6 routes for fixes only (`proposals/**`, the top level of `sessions/`, `members/**`), `src/lib/dal/{admin-dashboard,admin-lists,admin-members,admin-moderation,admin-settings}.ts`, `src/components/admin/**`, its six `ui/` primitives, `messages/*/admin.json`, `supabase/proposed/console/**`, its tests, its note |

★ = transferred for this wave by `DEC-137`.

**Wave-7 rules.**

- ★ **Task one lands before anyone spawns.** `ui/pending-nudge` had 21 referencing files across three
  tracks' ownership; the lead deletes it with the patch in one commit and verifies 16/16 on a
  production build, against a control build that hangs. Teammates never re-add a nudge, a timer or
  a "kick" to a pending control — a transition that hangs is reported with the build it hung on.
- **`checkin`'s screens and its switch travel together**, and the reversal is designed **before** any
  UI: `points_ledger` is append-only with `service_role` revoked (invariant 9), so removing an
  attendance record writes a **compensating entry** with its own idempotency key, and an issued
  certificate is **revoked** through `revoke_certificate()`, never un-issued. Its SQL hooks into
  `scoring` and `designer` are SQL only; the lead holds their files.
- **Three contracts, published in the owner's note on day one:** `checkin` publishes the new
  `schedule_session()` signature (`sessions` threads the parameter through `lib/dal/sessions.ts`), the
  switch's DTO field and predicate (`sessions` wires the event page's check-in link from it), and
  the reversal entry's `action_key` and reason shape (`content` renders it in `me/points`).
- **One writer per file, including JSON and specs.** A screen's strings move with the screen:
  `checkin` moves the attendance and walk-in strings from `admin.json` into `checkin.json`, and
  `sessions` moves the public profile's from `profile.json` into a new `members.json`; the old keys
  are deleted by the file's owner on request. A shared spec is its owner's; another track that breaks
  it writes the request.
- **Captures land where the row says.** `.qa-shots/rtl/wave7-<track>-<route>-<state>.png` in the
  **main checkout**, phone project, `390 × 844`, from a production build the row names by commit,
  and the row names the spec that regenerates it. A run in a verification worktree sets
  `E2E_SHOTS_DIR` to the main checkout's `.qa-shots/rtl`, and every new review spec honours it.
- **Not this wave, and never-touch for every teammate:** the other twelve `app/admin` routes
  (`audit` · `branding` · `designer/**` · `emails` · `exports` · `recognition` · `reminders` · `scoring`
  · `sessions/[id]/{certificates,schedule}` beyond `checkin`'s one field · `templates/**`), all of
  `app/platform/**`, `verify/**`, `legal/**`, the survey, **multi-day sessions** (`DEC-119` … `121`),
  **gradient posters and the `canvasRaise` token** (`DEC-127`), **the certificate library**
  (`DEC-128`), `DEC-075`'s two-tab schedule re-cut and `0084`, objectives, tags, avatar storage,
  downloads (`DEC-076`), and everything under `(marketing)/**` with the components it renders.
- **A teammate never edits a primitive it does not own**; all three primitive owners are spawned, so
  a request goes in the requester's note and the lead routes it.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`,
  `start`, `stop`, branch switches, pushes and the PR.

### Ownership map (wave 6 — the screens, DEC-130) — ★ THE RECORD OF A FINISHED WAVE

> Wave 6 merged as PR #23 (`5ef56ae`). Its map is kept as the record; **wave 7's map is directly above** (`DEC-137`).

**Fourteen named routes onto the M9 system, and nothing else.** The checklist is `STATUS.md`'s
wave-6 block; the measure is `node scripts/ui-reach.mjs --wave6` (strict: an M9 primitive, not the
pre-M9 `button`/`dialog`/`icons`) **plus** a 390 px RTL capture someone looked at.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | `(auth)/{sign-in,choose-org,no-access}`; **the shell disclosure sweep** (`DEC-111`, `REQ-UIX-023`); **the numerals sweep** (`DEC-124`, `DEC-132`) — pre-spawn-code, atomic, cross-tree, with `0082`; tokens, promotion, gates, the PR | `src/app/[locale]/(auth)/**`, `messages/*/auth.json`, `src/app/[locale]/app/layout.tsx`, `src/components/shell/**`, `messages/*/app.json`, the lead's fourteen `ui/` files, `messages/*/ui.json`, `src/app/globals.css`, `src/lib/session-status.ts`, the named `loading.tsx`/`error.tsx` boundaries it already owns, `src/app/[locale]/(dev)/**`, and the lead-only paths below. **Custodian** of every file of a track not spawned this wave — `checkin`, `event`'s ratings, `notify`, `scoring`, `designer`, `platform`, `branding`: no redesign, edited only by the numerals sweep or on a teammate's written request |
| `sessions` | opus | `/app` (the timeline, `DEC-112`) · `/app/sessions` (browse) · `/app/sessions/[id]` (the event page) | `src/app/[locale]/app/page.tsx` ★, `src/app/[locale]/app/sessions/{page,loading,error}.tsx` ★, `src/app/[locale]/app/sessions/[id]/{page,loading,error,not-found}.tsx` ★, `src/components/{sessions,browse,search}/**` ★, **presentation only** `src/components/checkin/{rsvp-panel,attendance-outcome}.tsx` ★ and `src/components/calendar/add-to-calendar.tsx` ★, `src/lib/dal/{sessions,proposals,search,bookmarks}.ts`, `src/lib/form-state.ts`, its eight `ui/` form primitives, `messages/*/{sessions,proposals,browse,search}.json`, `supabase/proposed/sessions/**`, its tests, its note |
| `content` | sonnet | the discussion on the event page (`REQ-UIX-024`) · materials · photos | `src/components/event/{comments,comment-composer,comment-item,comment-list}.tsx` ★ and `src/components/event/actions.ts` ★, `src/lib/dal/{comments,reactions,reports}.ts` ★, `src/lib/realtime/**` ★, `messages/*/event.json` ★, `src/components/{materials,photos,viewer,tasks}/**`, `src/app/[locale]/app/sessions/[id]/materials/**`, `src/lib/dal/{materials,photos,tasks}.ts`, `src/app/api/upload/**`, `src/lib/storage/**`, its nine `ui/` primitives, `messages/*/{materials,photos,tasks}.json`, `supabase/proposed/content/**`, its tests, its note |
| `console` | sonnet | the admin layout + **exactly five routes**: `/app/admin` · `/app/admin/proposals` · `/app/admin/sessions` · `/app/admin/members` · `/app/admin/moderation/reports` | `src/app/[locale]/app/admin/{layout,page,loading,error}.tsx`, `src/app/[locale]/app/admin/proposals/**`, the **top level only** of `src/app/[locale]/app/admin/sessions/` (never `[id]/**`), `src/app/[locale]/app/admin/members/**`, `src/app/[locale]/app/admin/moderation/reports/**`, `src/lib/dal/{admin-dashboard,admin-lists,admin-members,admin-moderation}.ts`, `src/components/admin/**`, its six `ui/` primitives, `messages/*/admin.json`, `supabase/proposed/console/**`, its tests, its note |

★ = transferred for this wave by `DEC-130`.

**Wave-6 rules.**

- ★ **The numerals sweep lands before any teammate edits code.** It removes a parameter from ~150
  files, including every file the three tracks are about to rebuild. Teammates spawn with a
  **planning-only** first task and start editing when the lead posts «numerals landed at `<sha>`».
- **`/app` and `/app/sessions` are one component on two routes**, not a redirect; `/app/sessions` is
  the canonical filterable URL; the phone tab bar keeps **one** «الجلسات» tab for both (`DEC-130`).
- **The event page is a shared surface run on wave 1's slot contract.** `sessions` owns the frame,
  the hero, the action card's layout, the sub-nav, and every `<section>` and `<h2>`; `content` owns
  the discussion, materials, photos and tasks slots, which render **no heading of their own**; a slot
  that can render nothing has its section gated **by the page** (`16` §5.4.1a(b)).
- **Presentation-only transfers stay presentation-only.** `sessions` restyles `rsvp-panel`,
  `attendance-outcome` and `add-to-calendar`; it never changes a gating predicate,
  `session-matrix.ts`, `lib/dal/{rsvp,checkin}.ts`, or a matrix assertion — and those stay green.
- **«Visible upload controls» are the photo and materials uploaders onto `ui/file-drop`.**
  `comments` has no attachment column; attachments on a comment are a schema decision for the owner.
- **Not this wave, and never-touch for every teammate:** the other 19 `app/admin` routes, all of
  `app/me/**`, all of `app/platform/**`, `app/sessions/[id]/{check-in,host,rate}/**`,
  `app/propose/**` (`sessions`' own, frozen this wave), `app/members/**`, `app/leaderboards/**`,
  `s/[id]`, `verify/**`, `legal/**`, the survey, and everything under `(marketing)/**` with the components
  it renders — and three things `DECISIONS.md` describes as if they existed: **multi-day sessions**
  (`DEC-119` … `121`), **the manual check-in switch and walk-ins as a publishing setting**
  (`DEC-113`/`116`/`117`/`118`), **gradient posters and the `canvasRaise` token** (`DEC-127`) — each
  **decided, NOT this wave** — plus the certificate library (`DEC-128`).
- **A teammate never edits a primitive it does not own.** All three primitive owners are in this
  wave, so a request goes in the requester's note and the lead routes it to the owning teammate.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`,
  `start`, `stop`, branch switches, pushes and the PR.

### Ownership map (wave 5 — M9 the system, DEC-101 · DEC-103) — ★ THE RECORD OF A FINISHED WAVE

> ★★ **M9 IS DONE AND THIS MAP IS NOT THE NEXT WAVE'S — wave 6's map is directly above (`DEC-130`).** The owner resequenced the milestone
> (`DEC-110`): **the screens come first** and the **admin console is in scope from the start**, so
> `console` belongs in the next wave rather than two later. Multi-day sessions (`DEC-119` … `DEC-121`)
> add an entity that touches four tracks at once. **The next lead writes a new ownership map before
> spawning anyone** — `DEC-085`'s rule is unchanged and is why this one exists: *ownership lives in
> the agent files or it does not exist.* Kept below because the per-file `ui/` split it established
> still governs `src/components/ui/`.

The design milestone (`docs/plan/16-ui-redesign.md`, `settled`) ran wave 5 as M9 —
**the system, and no screen was redesigned in it.** Four teammates, because the lead otherwise held
~40 files on the lane the ownership audit called the tightest in the milestone.

| Teammate | Model | Builds | Edits only |
|---|---|---|---|
| **lead** | — | tokens; `ui/index.ts` + the day-one stubs; the shell and both page shells; the three status functions; the loading model; the cross-cutting type and layout primitives; `RouteError` and `global-error.tsx`; `proxy.ts`; the gate scripts; the `(dev)` gallery | `src/app/globals.css`, `src/components/ui/{index,button,icon-button,link,skeleton,route-progress,splash,toast,page-header,section-header,prose,route-error,icons,dialog}.tsx`, `src/app/[locale]/app/{layout,page}.tsx`, `src/app/[locale]/app/me/layout.tsx`, `src/app/[locale]/global-error.tsx`, `src/lib/session-status.ts`, `src/proxy.ts`, the ~12 `loading.tsx` **named individually**, `src/app/[locale]/(dev)/**`, `src/messages/*/ui.json`, `scripts/**`, `.claude/hooks/task-gate.sh`, **and for M9 only** `src/app/[locale]/app/sessions/[id]/page.tsx`, `src/components/sessions/slots.ts` and `getSessionForEvent()` in `src/lib/dal/sessions.ts` (DEC-092, DEC-103) |
| `sessions` | opus | **the whole form model** — it owns the propose form, the largest in the product, and is the track that will live with every rough edge | `src/components/ui/{field,input,textarea,select,checkbox,radio-group,switch,form-summary}.tsx`, `src/lib/form-state.ts`, the `error.tsx`/`not-found.tsx` under `app/{sessions,propose}/**`, its tests, `messages/*/{sessions,proposals}.json` |
| `console` | sonnet | the two primitives where **no upstream library does the hard part**, plus the Radix shells | `src/components/ui/{data-table,combobox,menu,tabs,sheet,date-time}.tsx`, `src/app/[locale]/app/admin/{layout,error}.tsx`, `src/components/admin/member-picker.tsx` (to re-export `ui/combobox`), `messages/*/admin.json`, its tests |
| `content` | sonnet | the card-shaped and status primitives, and the upload control it owns every consumer of | `src/components/ui/{card,badge,tag-chip,avatar,progress,empty-state,stat,panel,file-drop}.tsx`, its `error.tsx`/`not-found.tsx`, `messages/*/browse.json`, its tests |
| `checkin` | sonnet | §5.3's **49-cell affordance matrix** and the **five live bugs** of §5.4.1 | `src/components/checkin/**` (incl. `attendance-outcome.tsx`), `src/app/[locale]/app/sessions/[id]/{check-in,host}/**`, `src/lib/dal/{rsvp,checkin}.ts`, `messages/*/{rsvp,checkin}.json`, its tests |

**Wave-5 rules.** `ui/index.ts` is the lead's **hour-one** commit and blocks everything; after it the
four tracks are independent. `checkin` additionally waits on `src/lib/session-status.ts`, the lead's
second commit, same day. **A teammate never edits a primitive it does not own** — it opens a request
in its note and the lead does it at the next sync. **`npm run qa`, `npm run visual` and
`npm run build` are lead-only for this milestone**; the `TaskCompleted` hook is path-aware since
DEC-088 and runs tsc + lint + vitest for a teammate, falling through to the full `qa` only when the
change can reach the frozen marketing routes. `ui-lint` and `loading-coverage` ship with a
**committed, shrinking** allowlist — 65 files carry the copied control-class string today — and flip
to hard-fail in M13.


### Lead-only paths

`supabase/migrations/**` · `docs/plan/**` (teammates get `docs/plan/notes/<name>.md`) · `CLAUDE.md` ·
`.claude/**` · `.github/**` · `package.json`, `package-lock.json` · `src/app/[locale]/layout.tsx` ·
`src/app/[locale]/(marketing)/**` · `public/**` · `src/proxy.ts` · `src/lib/supabase/**` ·
`src/lib/dal/session.ts` · `src/i18n/**` · `src/messages/*/marketing.json` · `scripts/**` ·
`vitest.config.ts` · `playwright.config.ts` · `patches/**` (`DEC-136` — empty since `DEC-146` retired the one patch; a new one is the lead's) ·
★ from wave 10 (`DEC-160`): `worker/Dockerfile`, `worker/package.json` and every `packages/*/{package.json,tsconfig.json}` — a package's manifest is the lead's, its `src/` is its track's.

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
unchanged since wave 5 apart from naming `submit-button.tsx`, which is the lead's, and ★ **`reorderable-list.tsx`, which the lead adds in wave 10** (`DEC-160` §5 — the survey's questions and the email studio's blocks both reorder through it). **Ownership lives in those never-touch paragraphs or
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
| [`16-ui-redesign.md`](docs/plan/16-ui-redesign.md) | **The UI/UX rebuild** — system, IA, loading, forms, the studio, the email studio. `draft` |
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
