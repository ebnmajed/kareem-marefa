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

### Ownership map (wave 29 — M34, the profile picture and the moves — DEC-280) — ★ THE RECORD OF A FINISHED WAVE

> Wave 29 merged as PRs #104, #106 and #105 (`main` `d0597d03`, production `0223`, closed by `DEC-282`). Its map is kept as the record. **No wave is open**: the next lead writes a new map before spawning anyone.

**The owner's ask** (milestone **M34**): fifty library avatars every member holds from creation; the picture changed
from ملفي by upload (through a crop step), «من Google» or the library; and navigation that presses, jumps and sinks.
Specified by `DEC-280`, `docs/design/screens/{AVATARS,AVATARS-USER-STORIES,TRANSITIONS}.md` and the brief
(`docs/plan/notes/wave-29-lead.md`) — ★ **where they disagree, `DEC-280` wins**. ★★ **A profile photo is not
reportable** (§8): the one moderation is an admin's takedown. ★★ **No new primitive** — `ui/` stays **71**.
**Migrations `0221` (A) and `0222` (B), both the lead's.** ★★ **The console cuts and the leaderboards stay initials.**

★★ **Three PRs, each against `main` from its first push. Merge order A, B, C.** **A — `wave-29a/the-library`** (the
main checkout, the lead's). **B — `wave-29b/the-picture`** (`../kareem-marefa-wave29b`, cut from A's head once the
resolver lands; retargeted to `main` before A merges). **C — `wave-29c/the-moves`** (`../kareem-marefa-wave29c`, cut
from `main`, the lead's).

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | `DEC-280`, this map, the agent files, `01`/`02`/`03`/`14`/`15`/`16`, `STATUS` · ★★ **PR A whole** — `public/avatars/**`, `0221` (the enum, the key, the trigger, the backfill), the resolver, ★ `ui/avatar` (**lent from `content` for PR A**), every reader's select · `0222` and the job registrations in B · ★★ **PR C whole** — the tokens, the press, `ui/link`'s kinds, the poster pair, the story zoom, sheets and dialogs, the console opt-out, the `ui-lint` keyframes rule, `console-register`'s extension | the lead-only paths, `supabase/migrations/**` from `0221`, `public/**`, `src/app/globals.css`, the lead's `ui/` files, ★ `ui/{avatar,sheet,menu}.tsx` **for this wave**, `src/components/privacy/avatar-href.ts`, the `avatar_key` select in every DAL module, `src/components/{feed,browse,sessions,stories,shell}/**` **for the poster name, the press and the story zoom only**, `tests/unit/{console-register,avatar-library}*`, new `tests/e2e/wave29-lead-*.spec.ts` |
| `content` | opus | ★★ **PR B's screens** (`STORY-PRF-010`, `011`'s crop): the way in on `SCR-021` — the tappable hero, the camera badge in «عدّل ملفك» — the sheet `صورتك` in its three states, the crop step, the refusals, the desktop sheet | `src/app/[locale]/app/me/{page.tsx,actions.ts,state.ts}`, `src/components/me/**` except `tab-strip.tsx`, new `src/components/avatar-picker/**`, `src/messages/*/profile.json`, `tests/components/me/**`, new `tests/components/avatar-picker/**`, new `tests/e2e/wave29-content-*.spec.ts`, `docs/plan/notes/content.md`. **Nothing else** — `ui/avatar` is the lead's this wave; storage is `platform`'s |
| `platform` | opus | ★★ **PR B's storage** (`STORY-PRF-011`'s route and job, `012`, `013`): `POST /api/avatars/upload`, `JOB-process_avatar_upload`, `import_avatar` never overwriting an upload, the four definer functions, the takedown on `SCR-049`'s row, anonymisation, the export, the prefix assertion | `src/app/api/avatars/**`, `src/lib/dal/{avatars,privacy}.ts`, `packages/storage-paths/src/avatar.ts`, `worker/src/tasks/{import_avatar,anonymise_members,build_data_export,assert_storage_prefixes}.ts`, new `worker/src/tasks/process_avatar_upload.ts`, `worker/src/platform/**`, ★ `src/app/[locale]/app/admin/members/**` and `src/lib/dal/admin-members.ts` **for the one row action, add-only** (from `console`), `supabase/proposed/platform/**` (functions only), `tests/rls/{avatar,privacy}*.test.ts`, `tests/unit/{avatar,privacy}*`, new `tests/e2e/wave29-platform-*.spec.ts`, `docs/plan/notes/platform.md` |

**Wave-29 contracts.** (1) **The resolver** — `avatarHref({ id, avatarVersion, avatarKey }, size)`, photo → library →
null; no reader forks on the source. (2) **Tables are the lead's** — a plan names a column; nobody writes `create`,
`alter`, a policy or a grant, even in `proposed/`. (3) **`platform` → `content`** — the sheet's four writes, names and
types in `platform`'s note on day one; `content` never touches storage. (4) **Motion is the lead's** — no other file
adds a keyframe, a `view-transition-name` or a `data-nav` kind.

**Wave-29 rules.** ★★ `registrations` is never touched; the five public routes do not move. ★★ No hotlink
(`DEC-099`). ★ Arabic first; a word or a number, never a sentence; `<bdi>` on every number; Western numerals.
★ Every changed assertion is a ledger line in `STATUS.md`. Teammates spawn planning-only; nobody edits code before
«the plan is approved». `npm run qa`, `visual`, `build`, every `supabase` command, worktrees and pushes are the lead's.

### Ownership map (wave 28 — M30, the designer saves when it is told to — DEC-258) — ★ THE RECORD OF A FINISHED WAVE

> Wave 28 merged as PRs #84, #85 and #87 (`main` `df491755`, production `0211`, closed by `DEC-264`). Its map is kept as the record; wave 29's is directly above.

**The owner's ask** (milestone **M30**): ★★ **«instead of auto save i want the user to manually save and in case they
made edits that weren't saved then a popup shows up to either discard or save».** Specified by `DEC-258` and the brief
(`docs/plan/notes/wave-28-lead.md`) — ★ **where the two disagree, `DEC-258` wins**: the brief's «dirty tracking already
exists» is not so (`DEC-258` §1.2), autosave is a requirement the entry amends (§1.1), and publish is ruled in §2.4.
★★ **NO new primitive** — `ui/` stays **71 files**, `tests/unit/ui-playground.test.ts` untouched. ★★ **No migration is
expected** (the next is `0211`, the lead's). ★★ **No parity golden moves.**

★★ **THE GOAL, above the process:** an admin decides when their work becomes the document — **and never loses work
because they decided late.** A manual save that loses a closed laptop's edits is worse than the autosave it replaced,
so the local draft ships with it. ★ **A local draft is not autosave**: it never becomes the document, and nothing but
the editor that wrote it reads it. **«Good» is not «the gates are green».**

★★ **One PR, `wave-28/the-designer-saves-manually`, against `main` from its first push, built in the main checkout.**

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | `DEC-258`, this map, the agent files, `01`/`06`/`09`/`14`/`15`, `STATUS` · sync 1 · its own specs that edit and wait for «محفوظ» (ledger lines) · the gates, the PR · ★ as `notify`'s custodian, whatever sync 1 rules for `email/builder.tsx` (`DEC-258` §2.7) | the lead-only paths below, `docs/plan/**`, `tests/e2e/wave23-lead-*.spec.ts`, new `tests/e2e/wave28-{demo,lead}-*.spec.ts`. **Custodian** of every file of a track not spawned — all nine others |
| `designer` | opus | ★★ **`REQ-DSG-036`, whole** (`STORY-DSG-019`, `020`): the two timers and `AUTOSAVE_DELAY_MS` out; Save on the bar and ⌘S / Ctrl+S calling the unchanged `push()`; ★ **dirty DERIVED from the saved document, never a flag** (`DEC-258` §1.2); the bar's three states; the `ui/dialog` with **save · discard · cancel** on the back control and every in-app link; `beforeunload` armed only while dirty; publish saving first and the preview's `flush()` removed (§2.4 – §2.5); discard reloading from the server · ★★ **the local draft** under §2.3's four rules · ★ a `page.click()`-only spec for the three answers and one for close-reopen-restore | `src/components/designer/**` — ★ **`canvas.tsx`'s engine, `bindings-panel`, `checks-panel`, `export-panel`, `export-action-button`, `export-reason`, `upload-asset` and `add-image` keep their behaviour and their suites pass untouched** — `src/app/[locale]/app/admin/designer/**`, `src/app/api/designer/**` (fixes only), `src/lib/dal/designer.ts` (add-only), `src/messages/*/designer.json`, `tests/components/designer/**`, `tests/unit/designer*`, `tests/e2e/{designer,posters}*.spec.ts` and `tests/e2e/wave{8,10,13,23,24,27}-designer-*.spec.ts` (evidence — each changed assertion a ledger line), new `tests/e2e/wave28-designer-*.spec.ts`, `docs/plan/notes/designer.md`. **Nothing else** — `packages/designer-runtime/**`, `scripts/parity/**`, `ui/**`, `src/components/email/**`, the templates library, certificates and the export pipeline are frozen |

**Wave-28 contracts.**

1. **`push()` is the write, unchanged** — the Route Handler, `saveDesignDocument()`, `baseUpdatedAt` and the 409 are as
   they stand. The wave changes **who calls it**: the person, and publish.
2. **Dirty is one derivation, read everywhere** — the bar, the dialog's arming, `beforeunload` and the draft's writer
   all read the same value. `SaveState` reports the last save attempt and gains no kind for it.
3. **The draft's four rules** (`DEC-258` §2.3): never applied or dropped silently when stale; `conflict` keeps one
   meaning; deleted by a save and by a confirmed discard; storage failing never breaks editing.
4. **`designer` → lead — the ledger.** `docs/plan/notes/wave-28-ledger.md`, one line per changed assertion, in the same
   commit; and a written list of any lead-owned spec that must gain a Save press.

**Wave-28 rules.**

- ★★ **No server autosave under any name**, and no silent save on preview or export (`DEC-258` §2.5).
- ★★ **`beforeunload` shows the browser's words.** Nobody attempts a custom dialog there.
- ★★ **The studio is not the party** (`REQ-UIX-053`): the dialog does not animate; `console-register.test.ts` untouched.
- ★★ **`registrations` is never touched; the five public routes do not move.**
- ★ **Arabic first**; `<bdi>` on every interpolated value; Western numerals (`DEC-124`); logical properties — except
  `DEC-096`'s overlay. ★ **No explainer copy** (`DEC-NEXT-25`): the dialog is a title and three buttons.
- ★ **No new dependency.** The designer is desktop-only (`06` §2).
- **`designer` spawns planning-only**; nobody edits code before the lead posts «the plan is approved».
- **Captures land at `.qa-shots/rtl/wave28-designer-<state>-1280.png`** from a production build the row names by commit.
- **Not this wave:** collaborative editing, a version history, a server-side draft; ★ the last-org lockout
  (`DEC-253` §7.1), reversing `DEC-255` §1 or `DEC-254` §7 — **each awaits the owner and is not scope until ruled**.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`, `stop`,
  branch switches, worktrees, pushes and the PR.

### Ownership map (wave 27 — M29, the owner's list: companies by domain, templates an org owns, held certificates, a session renamed, a code that stays — DEC-254) — ★ THE RECORD OF A FINISHED WAVE

> Wave 27 merged as PRs #79 – #82 (`main` `46f6c1f5`, production `0210`, closed by `DEC-257`). Its map is kept as the record; **wave 28's map is directly above** (`DEC-258`).

**The first wave that is not drawn** (milestone **M29**). Every screen in `09` has a design and is built (`DEC-253`);
this wave is the owner's own list of five changes to how the product behaves, specified by `DEC-254` and the brief
(`docs/plan/notes/wave-27-lead.md`) — ★ **and where the two disagree, `DEC-254` wins**: the brief's «`DEC-178` stands»
is `DEC-250`, and its sixth item is closed. ★★ **NO new primitive** — `ui/` stays **71 files** and
`tests/unit/ui-playground.test.ts` is untouched. ★★ **No screen is rebuilt and one is deleted** (`SCR-083`); a field
added to a drawn screen follows that screen's existing rows and controls. **Migrations from `0200`, all the lead's**,
numbered when written, in merge order.

★★ **THE GOAL, above the process** (the owner's words): ★★ **a member's company comes from their email domain, not
from the member** — an admin adds a company with its domains and the platform works out who belongs to it, including
people already sitting with no company; ★★ **an organisation owns its templates** — every org gets its own editable set
from birth, and there is no read-only platform library to copy from; ★ certificates exist by default and are **held
for review**, not off; ★ an admin can fix a session's name; ★ the check-in code stops changing every ten minutes.
**«Good» is not «the gates are green».** ★ Adding an admin by email was asked for and **stays refused** (`DEC-254` §7,
`DEC-244` §11): add as a member, then promote. Nobody builds it.

★★ **Four PRs, each against `main` from its FIRST push. Merge order A, B, C, then D** (`DEC-255` §6: **D — `wave-27d/the-two-removals`**, the lead's, cut after B and C merge — the grant's revoke and the platform rows' removal, neither of which sits in a `migrations/` directory before then).
**A — `wave-27a/the-small-items`** (the main checkout): the map and the plan; the rename; the default; the rotation.
**B — `wave-27b/companies-by-domain`** (`../kareem-marefa-wave27b`): `company_domains`, `provision_member()`, the sweep,
`SCR-048`'s domains, the admin's placement, the picker off `SCR-021`.
**C — `wave-27c/an-org-owns-its-templates`** (`../kareem-marefa-wave27c`): the seed, `create_org()`, the backfill, one
library level, `SCR-083` deleted. ★ **B and C are cut from A's head after this map lands.** **A teammate edits a PR's
files only in that PR's tree**; the lead posts each path when it exists.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-254`, this map, the ten agent files, `01`/`09`/`14`/`15`, `STATUS`; `02` and `03` with each migration · ★★ **every migration**: the certificate default (`REQ-CRT-018`, `STORY-CRT-010`); the `session.renamed` audit trigger; `check_in_rotation_seconds` nullable and `save_org_settings()` accepting «off»; `company_domains` with its five parts and its fixture row, `members.company_assigned_by`, `provision_member()` (`STORY-PRF-006`); the revoke of `company_id` from the member's grant, **pushed after B merges**; the seed's promotion, `create_org()`, the backfill, and the removal migration that **raises first** (`DEC-254` §3.3) · ★ **as `console`'s custodian in PR A**: `SCR-063`'s «لا يتغيّر» option, on `checkin`'s written request · ★ **`SCR-083` deleted** with its route, `platform-templates.ts`, its nav entry and suites, and the table of where each behaviour went · the rehearsals' notes · the gates, three PRs, two worktrees | the lead-only paths below, `supabase/migrations/**` from `0200`, `docs/plan/**`, ★ `src/app/[locale]/app/platform/**`, `src/lib/dal/{platform,platform-templates}.ts`, `src/components/platform/**`, `src/messages/*/platform.json` and `platform`'s suites (**custodian — for the deletion**), ★ `src/app/[locale]/app/admin/settings/**`, `src/lib/dal/admin-settings.ts` and the settings keys of `admin.json` **in PR A's tree only** (custodian, the one option), `tests/rls/{fixture*,isolation.test,company-domains*,org-seed*,certificate-default*}.ts`, new `tests/e2e/wave27-{demo,lead}-*.spec.ts`. **Custodian** of every file of a track not spawned — `scoring`, `content`, `event`, `notify`, `platform`, `branding` |
| `sessions` | opus | ★ **the rename** (`REQ-SES-021`, `STORY-SES-014`, PR A): ★★ **until the session is published, and refused by the database after** (`DEC-255` §1 — the owner's rule): «عدّل الاسم» in the hub header's actions on `SCR-043`, opening a dialog; a DAL write through `0010`'s column grant; the field's validation; the log line on the schedule tab · ★ the event page's rules line printing no period when rotation is off (contract 2) | `src/app/[locale]/app/admin/sessions/[id]/{layout,page,loading,error}.tsx`, ★ `src/app/[locale]/app/admin/sessions/[id]/_hub/{hub-header.tsx,actions.ts}` and one new state file beside them, `src/components/sessions/**` **for the rename and the rules line only**, `SESSION_LOG_ACTIONS` and one key of `schedule.json` (add-only), `src/lib/dal/sessions.ts` (add-only, and the two rotation reads), `src/messages/*/sessions.json`, `supabase/proposed/sessions/**` (functions only), new `tests/components/sessions/rename*`, new `tests/rls/session-rename*.test.ts`, new `tests/e2e/wave27-sessions-*.spec.ts`, `docs/plan/notes/sessions.md`. **Nothing else** — the schedule tab, the event page's regions, browse, propose and stories are frozen |
| `checkin` | opus | ★ **the rotation may be off** (`REQ-CHK-019`, `STORY-CHK-009`, PR A): `ensure_check_in_code()` and `rotate_check_in_code()` issuing **one** code per day valid to `check_in_ceiling()` when the setting is null; `rotate_codes` unchanged in shape and correct for both; the host view, `SCR-014` and `SCR-044`'s code card with **no countdown and no period** · ★ **its plan says what happens to a code that was rotating when the setting changes, in both directions** · ★ `valid_until`, the ceiling and `check (valid_until > valid_from)` are **not touched** | `supabase/proposed/checkin/**` (functions only), `worker/src/tasks/rotate_codes.ts`, `src/lib/dal/{rsvp,checkin}.ts`, `src/components/checkin/**`, `src/app/[locale]/app/sessions/[id]/{check-in,host}/**`, `src/app/[locale]/app/admin/sessions/[id]/attendance/**`, `src/messages/*/{rsvp,checkin}.json`, `tests/unit/checkin-*` and `tests/rls/checkin*.test.ts` (evidence), new `tests/unit/checkin-rotation-off*`, new `tests/rls/checkin-rotation-off*.test.ts`, new `tests/e2e/wave27-checkin-*.spec.ts`, `docs/plan/notes/checkin.md`. **Nothing else** — what check-in decides, the switch, the manual mark and the awards are frozen |
| `console` | opus | ★★ **companies by domain, whole, PR B** (`REQ-PRF-012`, `REQ-PRF-013`, `REQ-ADM-024`; `STORY-ADM-012`, `013`, `STORY-PRF-007`): the domains field in `SCR-048`'s company form · ★★ **one definer function with a dry run and a confirmed save** — «N members move, M are left alone because an admin placed them» — and the retroactive sweep · ★ **the one function that writes a member's company after creation**, on `SCR-049`'s row menu, audited; `add_member()`'s company recorded as a placement by hand · ★ **the picker off `SCR-021`** and `updateMyProfile()` no longer sending the column — **the profile saves on both sides of the lead's revoke** | `src/app/[locale]/app/admin/{companies,members}/**`, `src/lib/dal/{admin-lists,admin-members}.ts`, `src/components/admin/**` except `delivery-reason.ts`, `src/messages/*/admin.json` (the companies and members keys), `supabase/proposed/console/**` (functions only — **never a table, a column, a policy or a grant**), ★ `src/app/[locale]/app/me/{page.tsx,actions.ts,state.ts}`, `src/components/me/**` except `tab-strip.tsx`, `updateMyProfile()` and `profileInput` in `src/lib/dal/members.ts`, and `src/messages/*/profile.json` (**from `content` and `scoring`/`sessions`, this wave — for the one field**), `tests/components/admin/compan*`, `tests/unit/admin-{lists,members}*`, `tests/components/me/**` and the wave-20 profile specs (evidence), new `tests/rls/{company-sweep,member-company}*.test.ts`, new `tests/e2e/wave27-console-*.spec.ts`, `docs/plan/notes/console.md`. **Nothing else** — `provision_member()` is the lead's; `scoring`'s boards and snapshots are not edited |
| `designer` | opus | ★★ **an org owns its templates, PR C** (`REQ-DSG-035`; `STORY-DSG-017`, `018`): the generator emitting **a seeding function** — the eleven documents as one org's own published rows, idempotent — under `supabase/proposed/designer/` for the lead to promote; the roster suite counting the set **per org** · ★★ **the delete-or-retire function for the platform rows**, reporting per row, as `0193`'s does · `templates.ts` and `certificates.ts` with no `platform` list and no fallback to read; `issue_certificate()`'s lookup narrowed **in the removal migration, not before** · ★ **`SCR-055` with one list** — the «قوالب المنصة» tab and «انسخ لتعدّل» gone, its kept-behaviour table in the note first · ★★ **no parity golden moves** | `packages/designer-runtime/scripts/seed-sql.mjs`, `packages/designer-runtime/src/**` except `brand.ts` (fixes only), `supabase/proposed/designer/**`, `src/lib/dal/{templates,certificates,designer,posters}.ts`, `src/app/[locale]/app/admin/templates/**`, `src/components/{templates,designer,certificates,posters}/**` **for the one-list change only** (`certificates/template-control.tsx` among them, `DEC-255` §5), `src/messages/*/{templates,certificates}.json`, `scripts/parity/**` **minus `goldens/`**, `tests/rls/{designer,templates,certificates}*.test.ts`, `tests/unit/{designer,certificates}*`, `tests/components/{templates,certificates}/**`, `tests/e2e/wave23-console-*.spec.ts` (evidence), new `tests/e2e/wave27-designer-*.spec.ts`, `docs/plan/notes/designer.md`. **Nothing else** — the studio, the canvas, the export pipeline, the mail designs and `/app/platform/**` (the lead's deletion) are frozen |

**Wave-27 contracts.**

1. **Lead → everyone — tables, columns, policies and grants are the lead's.** A plan names what it needs — `console`:
   `company_domains (org_id, company_id, domain)` unique on `(org_id, domain)`, and `members.company_assigned_by`
   (`'domain' | 'admin'`, null with a null company); `checkin`: `check_in_rotation_seconds` nullable. **Nobody writes
   `create table`, `alter table`, a policy or a grant, even in `proposed/`.**
2. **`checkin` → `sessions` and the lead — the rotation's type.** `rotationSeconds: number | null`, **null meaning
   off**, in every DTO that carries it; no reader substitutes 600 for null any more (`checkin.ts:136`, `:362` do
   today). `checkin`'s note carries the name on day one; `sessions` and the settings option follow it.
3. **Lead ↔ `console` — who places a member.** `provision_member()` (the lead's) places by domain at insert and at
   binding and writes `'domain'`; `console`'s two functions place by sweep (`'domain'`) and by hand (`'admin'`).
   **All three read one helper the lead lands** — the domain of an address, lowercase — so they cannot disagree.
   ★ `provision_member()` **never raises and never blocks sign-in** for a company lookup: a failure leaves the company
   null (the hook is a single point of failure for all sign-in).
4. ★★ **`designer` ↔ lead — the order** (`DEC-254` §3.3, as `DEC-255` §5 – §6 made it). The seed function, **an `after insert` trigger on `orgs`**, the backfill: one migration. Removal:
   a second, which **raises** if any org lacks a published certificate default, **pushed after C's code is on `main`**.
   `designer`'s plan names what `main`'s app and worker do between the two pushes; the expected answer is «every org
   has two sets visible — its own and the platform's — and issuance prefers its own, as `0127` already orders it».
5. **Everyone — every changed assertion is a ledger line**, in `docs/plan/notes/wave-27-ledger-{a,b,c}.md`, one file
   per PR, in the same commit as the change.

**Wave-27 rules.**

- ★★ **`registrations` is never touched; the five public routes do not move.** Nothing in this wave is public;
  `qa:contract` green at every commit, the behaviour fingerprint equal.
- ★★ **No golden moves, and no pinned mail file moves** (`DEC-176`). Both are the lead's.
- ★★ **`REQ-CRT-014` is the floor**: a version a certificate or a document references is retired, never deleted.
- ★★ **Additive, because `main` runs on it first** — and the two exceptions are named and ordered (`DEC-254` §8.4):
  the grant's revoke and the platform rows' removal follow their PR's merge.
- ★ **The console is not the party** (`REQ-UIX-053`); `console-register.test.ts` green **and untouched**.
- ★ **No explainer copy** (`DEC-NEXT-25`). ★ **Arabic first**; `<bdi>` on every domain, title, code and number —
  ★ **a domain is LTR text in an RTL line**; Western numerals (`DEC-124`); six ICU forms where «N members» appears;
  logical properties.
- ★ **No new dependency. No new primitive. No screen redesigned.**
- **Teammates spawn planning-only**; sync 1 approves four plans; **nobody edits code before the lead posts «the plans
  are approved».**
- **One writer per file, specs included. `ui-lint --strict` has no allowlist and never gains one.**
- **Captures land at `.qa-shots/rtl/wave27-<track>-<screen>-<state>-<1280|390>.png`** from a production build the row
  names by commit, honouring `E2E_SHOTS_DIR`; where the screen has an artboard the capture is read beside it.
- **Not this wave, and never-touch for every teammate:** adding an admin by email (`DEC-254` §7); the last-org lockout
  (`DEC-253` §7.1 — the owner's); a company logo or page; validating a company's domain against the org's list;
  unplacing members when a domain is removed; «reset to baseline» for templates; removing `valid_until` or the
  ceiling; re-opening `DEC-250`; replacing the renderer; `DEC-194`'s two gates; `DEC-186` §4; `DEC-204`; `DEC-215`'s
  four; the `railway.json` migration.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`, `stop`,
  branch switches, worktrees, pushes and the PRs.

### Ownership map (wave 26 — M28, THE LAST WAVE: the public site, the brand kit and privacy, the platform console, stories, the mark — DEC-245 · DEC-247 · DEC-248) — ★ THE RECORD OF A FINISHED WAVE

> Wave 26 merged as PRs #73 – #77 (`main` `29579256`, production `0199`, closed by `DEC-253`). Its map is kept as the record; **wave 27's map is directly above** (`DEC-254`).

**The programme's twelfth wave and its last designed work** (milestone **M28**). Seventeen artboards in
`docs/design/screens/m13/`, specified by `docs/design/screens/M13.md` and `STORIES-USER-STORIES.md` (STO-01 … 18), and
corrected by the brief (`docs/plan/notes/wave-26-lead.md`), `DEC-245`, `DEC-247` and `DEC-248`. ★★ **Two new primitives
— the floor moves 69 → 71** (`story-viewer`, `story-capture`, both in PR D). ★★ **One migration is planned, `0198`, the
lead's** — `story_frames` and `story_views` (and whatever sync 1 adds), rehearsed by the owner on a dump taken at `0197`.

★★ **THE GOAL, above the process** (the owner's words): **finish the product — everything the designer has drawn is built
when this merges, and nothing remains.** ★★ **The public site is a live contract and the one place a mistake cannot be
seen**: its appearance changes, and its **URLs, its registration behaviour byte for byte and its accessibility floor do
not** — `001` carries 20 real signups; a broken screen is noticed by looking, a broken registration form is not. ★ The
platform console gives a super admin what they need **without a data plane** — counts only, **no `is_super_admin()`
disjunct anywhere**, org rows read only inside an impersonation session (`DEC-014`, invariant 8, `REQ-ADM-002`). ★ A
member opens a live session and **sees what is happening in the room** — frames within a minute of each trigger, the ring
turning seen, everything gone at 24 h. ★ An attendee's photo or short video is **moderated like every other photo** —
metadata stripped by the worker, hidden on first report, removal cascading. ★ The mark draws itself in on sign-in and on
the landing, breathes while the app waits, settles when tapped — and is **static under `prefers-reduced-motion`, with no
sixth moment**. ★ The console and the studio stay the sober register (`REQ-UIX-053`). **«Good» is not «the gates are
green».**

★★ **Five PRs, each against `main` from its FIRST push. Merge order A, B, C, D, E.**
**A — `wave-26a/the-public-site`** (the lead, alone, the main checkout): the map and the plan documents; `<Logo>`; `000`,
`001`, `006`; `/og.png`; the rewritten `public-graph.test.ts`. **B — `wave-26b/branding-and-privacy`**
(`../kareem-marefa-wave26b`): `059` and `/app/me/privacy`. **C — `wave-26c/the-platform-console`**
(`../kareem-marefa-wave26c`): the platform frame, then `080` – `085`. **D — `wave-26d/stories`**
(`../kareem-marefa-wave26d`): `0198`, the generator, the viewer, the capture, the ring, `044`'s strip.
**E — `wave-26e/the-mark`** (`../kareem-marefa-wave26e`, **cut from A's head once A's one commit has landed**): the mark
everywhere inside the product, and both wordmark components deleted. ★ **B, C and D are cut from A's head after the map
and the requirements land** — none needs the public site. **A teammate edits a PR's files only in that PR's tree**; the
lead posts each path when it exists.

★ **Why it is divided this way** (`DEC-248` §3). **A is the lead's alone because it is the one PR where a mistake is
invisible**: every file it changes is already lead-only, and a guard is rewritten in it by the owner's explicit
permission — that is not delegated. ★ **Everything PUBLIC that the mark touches is in A, not E** — `<Logo>` itself, the
landing's reveal, the register page's mark and `/og.png` — so the public appearance moves **once**, in A's one commit with
its one re-baseline (`DEC-167`); **E is the mark inside the product** and moves nothing public. **B is one teammate
because it is two screens with one register** — `branding` owns the kit, and the privacy page transfers to it so
`platform` is free for six screens under `DEC-208`. **C is `platform`'s behind a frame the lead lands first**, because the
frame and the rail are the lead's files. **D is two teammates divided by half**: `sessions` owns the session's state, so
it takes the **generated** half — the generator, the read model, the ring's states; `content` owns photos, the upload
routes, the worker's media tasks and moderation, so it takes the **viewer, the capture and the attendee** half. Tables,
the image, the registry and every guard are the lead's.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-248`, this map, the ten agent files, `01`/`02`/`03`/`09`/`11`/`14`/`15`, `STATUS` · ★★ **PR A, whole**: `<Logo>` with the three moves from `prototypes/logo-motion.html` (`REQ-UIX-119`, `STORY-UIX-109`); `000` and `001` (`REQ-UIX-114`, `STORY-UIX-104`) and `/og.png`; `006` (`REQ-UIX-115`, `STORY-UIX-105`); ★★ **the one commit** — the `DEC`, the appearance, the re-baselined `visual`, the rewritten `qa:appearance` **and the rewritten `public-graph.test.ts`** (`DEC-247`), with **`qa:contract` and the register-form behaviour fingerprint unmoved** · ★★ **PR E, whole** (`REQ-UIX-120`, `STORY-UIX-110`) · ★ **contract 1, the platform frame, first in PR C** (`REQ-UIX-118`'s frame half): `platform/layout.tsx` on the console frame, `ui/admin-rail` given a second nav set, `components/platform/platform-nav.tsx` deleted and re-created as that set's table (`DEC-248` §4) · ★★ **`0198`** with its policies, grants, RLS cases and fixture rows; `worker/Dockerfile`'s **`ffmpeg`**; the job registrations · ★ **contract 2**: `ui/index.ts`'s two signatures, the registry, the floor 69 → 71 · as custodian: `044`'s one slot for the strip and `029`'s row to privacy · every capture beside its artboard · the gates, five PRs, four worktrees | the lead-only paths below, `supabase/migrations/**` from `0198`, ★ `src/app/[locale]/(marketing)/**`, `src/components/{header,footer,chapter,wordmark,intro-sting,network-bg,network-gl,ornaments,mobile-cta,language-toggle,registration-form,form-token}.tsx`, `src/messages/*/marketing.json`, `public/**`, `src/app/icon.svg`, ★ `src/app/[locale]/verify/**` and the verify keys of `certificates.json` (**from `designer`, this wave**), `src/components/brand/**`, `src/components/shell/**`, `src/app/[locale]/(auth)/**`, `src/app/[locale]/app/{layout,platform/layout}.tsx`, ★ `src/components/platform/platform-nav.tsx`, `src/components/ui/admin-rail.tsx`, `src/app/globals.css`, `ui/index.ts`, the gallery, `worker/Dockerfile`, `worker/src/index.ts`, `tests/unit/{public-graph,ui-playground,scope-root,console-register,design-files}*` (**`console-register` untouched**), `tests/rls/{fixture*,isolation.test,story*}.ts`, `tests/e2e/{a11y,frozen-routes,shell-*}*.spec.ts`, new `tests/e2e/wave26-{demo,lead}-*.spec.ts`. **Custodian** of every file of a track not spawned — `checkin`, `scoring`, `console`, `designer`, `event`, `notify` |
| `branding` | opus | ★★ **`059` هوية المؤسسة, rebuilt** (`REQ-UIX-116`, `STORY-UIX-106`) — read mode with one «عدّل»; the logo card with format · size · the A3 PPI result as a badge; the four fonts; the light and dark tokens as swatches **each with its value in words**; the seven team colours; ★ **the line that the kit feeds posters, certificates and email — not the app** (`DEC-201`) · ★★ **`/app/me/privacy`, rebuilt as a hub page behind `029`** (`REQ-UIX-117`, `STORY-UIX-107`) — the export's four states (requested · building · ready with its date and «نزّل» · expired), the photographs count and «أزلني», the two legal links, «إيقاف حسابي» in a confirm sheet; ★ **the avatar answer kept** — all PR B | `src/app/[locale]/app/admin/branding/**`, `src/app/api/admin/branding/**`, `src/lib/brand/**`, `src/components/branding/**`, `src/messages/*/branding.json`, ★ `src/app/[locale]/app/me/privacy/**`, `src/components/privacy/**`, `src/lib/dal/privacy.ts` (add-only) and `src/messages/*/privacy.json` (**from `platform`, this wave**), `supabase/proposed/branding/**` (functions only), `tests/rls/{brand-kits,privacy}*.test.ts` and `tests/unit/{brand,privacy}*` (evidence), `tests/components/{branding,privacy}/**`, `tests/e2e/{wave8-branding-*,wave11-branding-*,wave14-platform-*}.spec.ts` (evidence), new `tests/e2e/wave26-branding-*.spec.ts`, `docs/plan/notes/branding.md`. **Nothing else** — `save_brand_kit()`'s guard, `BRAND_COLOUR_TOKENS`, `brand.ts`, the avatar import job, `build_data_export` and `anonymise_members` are frozen |
| `platform` | opus | ★★ **`080` – `085`, deleted and rebuilt on the lead's frame** (`REQ-UIX-118`, `STORY-UIX-108`): orgs (the table of **counts**, suspend · reactivate · domains, delete with the slug typed back) · new org · domains (the removal line) · the platform library · metrics (six `stat`s and a per-org table of counts) · ★ impersonate — org, member (admins only), mandatory reason, 15 / 30 / 60, «مسجَّل ومرئي للمؤسسة», the log beside it · ★★ **the no-data-plane table in its plan**: every function of `src/lib/dal/platform*.ts`, what it returns, and the test that proves it returns counts — all PR C | `src/app/[locale]/app/platform/**` **except `layout.tsx`**, `src/app/api/platform/**`, `src/lib/dal/{platform,platform-templates}.ts` (add-only), `src/components/platform/**` **except `platform-nav.tsx`** (the lead's), `src/messages/*/platform.json`, `supabase/proposed/platform/**` (functions only), `tests/rls/{platform,impersonation,delete-org}*.test.ts` and `tests/unit/platform*` (evidence), `tests/components/platform/**`, `tests/e2e/{platform*,wave8-platform-*,wave11-platform-*}.spec.ts` (evidence), new `tests/e2e/wave26-platform-*.spec.ts`, `docs/plan/notes/platform.md`. **Nothing else** — `start_impersonation()`, `end_impersonation()`, `assert_platform_admin()`, `delete_org`, the six jobs and every policy are frozen; ★ `me/privacy/**` is `branding`'s this wave |
| `sessions` | opus | ★★ **the generated half** (`REQ-STO-001` … `004`, `006`, `008`, `018`; `STORY-STO-001`, `002`): **the generator** — one definer function and its hooks, **one frame per trigger, idempotent by key**, for the eight of STO-04; the clock-driven three through one minutely job · **the read model** — `src/lib/dal/stories.ts`: the ring row's sessions with their state and order, a session's frames with what each draws (the live count, the recap's three stats and first three photographs), **computed, never stored** · ★ the ring's four states on `010` **as data** (contract 4) · «شاهد القصة» on a live `012` · **cancelling ends the story** — all PR D | new `src/lib/dal/stories.ts`, new `worker/src/tasks/generate_story_frames.ts`, `supabase/proposed/sessions/**` (functions and triggers — **never a table**), `src/app/[locale]/app/sessions/[id]/page.tsx` and `src/components/sessions/**` **for the story entry only**, `src/lib/dal/sessions.ts` (add-only), ★ new `src/messages/*/stories.json` (**its one writer; `content` asks for keys in writing**), new `tests/rls/story-generator*.test.ts`, new `tests/unit/stories-*`, new `tests/e2e/wave26-sessions-*.spec.ts`, `docs/plan/notes/sessions.md`. **Nothing else** — the event page's regions, browse, propose, the hub and the schedule are frozen |
| `content` | opus | ★★ **the viewer, the capture and the attendee half** (`REQ-STO-005`, `007`, `009` … `017`; `STORY-STO-003` … `006`): ★ **`ui/story-viewer`** — segments, the header, the frame, four reactions, one action; **every gesture with a single-pointer alternative and a key** (contract 5) · ★ **`ui/story-capture`** — photo on tap, video on hold with the 0:15 cap, gallery, flip, one caption · the ring **wired** on `010` · `story_views` written · **the attendee photo through the album upload** (a photo frame **is** an album photo) · ★★ **the video path**: the upload route, **`transcode_story_video`** on the worker's `ffmpeg` — one MP4, ≤ 15 s enforced by `ffprobe`, **every container tag stripped**, a poster frame · «أزلني», report-hides-at-once, the photo queues taking a video · ★ **`044`'s «قصص الحضور» strip** as a component the lead slots in, removal cascading — all PR D | new `src/components/ui/{story-viewer,story-capture}.tsx` with their tests, `-scope` tests and demos, `src/components/ui/story-ring.tsx` (add-only), new `src/components/stories/**`, `src/components/feed/**` and `src/app/[locale]/app/{page,loading,error}.tsx` **for the ring row only**, new `src/lib/dal/story-frames.ts`, `src/lib/dal/{photos,reports,reactions}.ts` (add-only), new `src/app/api/stories/**`, `src/app/api/upload/**` (add-only), `src/lib/storage/**`, `packages/storage-paths/src/content.ts`, new `worker/src/tasks/transcode_story_video.ts`, `worker/src/content/**`, `worker/src/tasks/process_photo.ts` (the `story` derivative, add-only), ★ `src/app/[locale]/app/admin/moderation/**` and `src/lib/dal/admin-moderation.ts` (**from `console`, this wave — for a video in the queue only**), `src/components/{photos,viewer}/**` (fixes only), `src/messages/*/photos.json`, `supabase/proposed/content/**` (functions only), `tests/rls/{photos,moderation,story-frames}*.test.ts`, new `tests/components/stories/**`, new `tests/unit/story-*`, new `tests/e2e/wave26-content-*.spec.ts`, `docs/plan/notes/content.md`. **Nothing else** — the feed's items, materials, tasks, the lightbox and the album's own screens are frozen |

**Wave-26 contracts.**

1. **Lead → `platform` — the platform frame.** `platform/layout.tsx` renders the console frame — the 52 px bar with the
   «لا بيانات مؤسسات هنا» badge, `ui/admin-rail` with the platform nav set, the sheet under `lg` — and the
   `ImpersonationBanner` where `DEC-057` put it. **A page renders its `h1` row with its one primary action and its
   content, nothing of the frame.** ★ It lands before any platform screen is deleted; the lead posts «the frame is in at
   `<sha>`».
2. **Lead → `content` — the signatures and the gate.** `content` names both primitives' props in its plan; the lead lands
   them as types after sync 1 with the registry entries; **the floor moves 69 → 71** in the commit that adds the second.
3. ★★ **Lead → `sessions` and `content` — the storage contract** (`DEC-248` §5). **Tables are the lead's.**
   `story_frames`: `org_id`, the session, a `kind`, a **trigger key unique per session and kind** (that is the
   idempotency), `triggered_at`, and for an attendee's frame the author, the caption, the album photo or the video asset,
   and a state. **No client role inserts, updates or deletes a frame** — every write is a definer function; members
   `select` what is visible and inside 24 h, staff `select` everything. `story_views`: the member's own rows and nobody
   else's. **A plan names the columns it needs; nobody writes `create table`, a policy or a grant, even in `proposed/`.**
4. **`sessions` → `content` — the story feed.** One DAL function returns the ring row — each session's state (live ·
   unseen · seen), its order, its frames with what each draws. Names and types in `sessions'` note **on day one**;
   `content` renders them and never queries a session's tables itself. **Expiry, visibility and cancellation are RLS's
   and the DAL's, never the component's** — a component that filters is a component that leaks.
5. ★★ **`content` — `DEC-093`, the viewer.** Tap-to-advance, hold-to-pause and swipe-to-close **each** have a visible
   single-pointer control that is not a gesture — next and previous targets, a pause button, the close button — **and**
   a key (← → Home End Space Escape). The plan names all three pairs **before** the viewer is built, and **a Playwright
   case with `page.click()` alone** walks a story end to end. `story-capture`'s hold-for-video has a tap-to-start,
   tap-to-stop path under the same rule.
6. ★★ **`content` ↔ lead — the video.** The transcoder is **`ffmpeg` from Debian's package in `worker/Dockerfile`**
   (`DEC-181`; the lead's file; its measured cost is in `DEC-248` §6). The task refuses over 15 s or 60 MB **from
   `ffprobe`, not from the client's word**, writes **one** H.264/AAC MP4 with `-map_metadata -1` — a phone's video
   carries GPS in its container exactly as a photograph does in EXIF — and a poster frame. **No npm package touches
   media.** A failed transcode shows «تعذّر» to its poster and nothing to anyone else.
7. ★★ **`platform` — no data plane.** A platform DAL function returns **counts and the platform's own tables**; it never
   returns an org's row, a member's name or a session's title outside an impersonation session. **No policy gains a
   super-admin disjunct.** Impersonation is shown as `DEC-054` built it and **changed in nothing**.
8. **Everyone — the artboard is the specification, and `DEC-245` §5 with `DEC-248` §7 is the list of what it draws that
   is not built or is cited wrongly.** A new disagreement is written in your note with the artboard and the line; nobody
   picks a side. No class, id or markup pattern from a `.dc.html` in `src/`.

**Wave-26 rules.**

- ★★ **APPEARANCE AND THE IMPORT GRAPH MAY CHANGE; BEHAVIOUR MAY NOT** (`DEC-247`). **No teammate touches a file the
  public routes render**; if the `TaskCompleted` hook falls through to the full `qa`, you edited something that is not
  yours. `registrations` is never read, altered or dropped (invariant 2).
- ★★ **Rebuilt, never restyled; deleted first** (`DEC-199` §2, `DEC-208`) — `059`, privacy, `006` and `080` – `085`. Two
  commits per screen, the kept-behaviour table in the note **before** the create. ★ **Never push an unpaired delete.**
  ★ **`SCR-044` is extended, add-only, its wave-21 suites untouched.** ★ `000`/`001` change in **one** commit, because
  `DEC-167` outranks the two-commit form there, and **the registration form's behaviour-bearing lines are not rewritten
  at all** (`DEC-248` §3).
- ★★ **The console and the studio are not the party** (`REQ-UIX-053`): `console-register.test.ts` is green **and
  untouched** — the mark in a console bar is static, and the platform pages declare no animation.
- ★★ **No sixth moment.** The mark's three moves are the mark's; nothing else in the wave animates beyond the viewer's
  segment and its crossfade, both still under reduced motion.
- ★ **A story is the session's, never a person's; nothing generated is authored.** Reactions earn nothing; a video earns
  nothing and never enters the album.
- ★ **No explainer copy** (`DEC-NEXT-25`). ★ **Arabic first**; `<bdi>` on every code, slug, serial, domain and number;
  Western numerals (`DEC-124`); six ICU forms; logical properties.
- ★ **The existing suites are evidence**; each changed assertion is a ledger line in `STATUS.md`, in the same commit.
- ★ **No new dependency.** **No migration but the lead's**; a function a plan needs goes under `supabase/proposed/<you>/`.
- **Teammates spawn planning-only**; sync 1 approves four plans with their kept-behaviour tables and `content`'s
  `DEC-093` pairs; **nobody deletes a file before the lead posts «the plans are approved».**
- **One writer per file, specs and demos included. `ui-lint --strict` has no allowlist and never gains one.**
- **Captures land at `.qa-shots/rtl/wave26-<track>-<screen>-<state>-<width>.png`** at the artboard's board width, from a
  production build the row names by commit, honouring `E2E_SHOTS_DIR`; the lead opens every one beside the artboard, in
  bands, never downscaled.
- **Not this wave, and never-touch for every teammate:** new scope of any kind; authored text frames, stickers, drawing,
  music, member-owned stories, story notifications, points for reactions or video, cross-org or public stories
  (STO §F); `DEC-194`'s two gates; `DEC-186` §4; the hard-load fix (`DEC-204`); `DEC-215`'s four; the `railway.json`
  migration (the owner's, November); the org override's guard and `BRAND_COLOUR_TOKENS`; replacing the renderer.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`, `stop`,
  branch switches, worktrees, pushes and the PRs.

### Ownership map (wave 24 — M26, the artefacts: the baseline library and the mail designs, DEC-242) — ★ THE RECORD OF A FINISHED WAVE

> Wave 24 merged as PRs #62 – #70 (`main` `29aa7ddb`), and wave 25 (`DEC-243`, `DEC-244`, `DEC-246`; PR #68, `0197`) ran without a map of its own. Wave 24's map is kept as the record; **wave 26's map is directly above** (`DEC-245`, `DEC-247`, `DEC-248`).

**The programme's tenth wave** (milestone **M26**). ★★ **The owner asked for the templates to match the design and the
current ones deleted**, and answered all three questions the ask turned on (`DEC-242`): **both** the design templates and
the mail designs · a **hard delete** · the **platform default palette moves**. ★★ **This is the first wave that touches
what LEAVES the product.** Every screen has worn «ساحة اللعب» since wave 17; a poster an admin exports and a certificate
a member holds still wear M6's — Reem Kufi on navy — because «the playground stops at the certificate's edge»
(`DEC-183` §4) was a deferral. **This wave discharges it.** ★★ **NO new primitive** — `ui/` stays **69 files** and
`tests/unit/ui-playground.test.ts` is untouched. ★★ **Two migrations, both the lead's**: `0192` (the palette, PR A) and
`0193` (the baseline, PR B) — rehearsed on a dump taken at `0191`.

★★ **THE GOAL, above the process** (the owner's words): **the templates match the designed ones.** ★ An exported poster,
an issued certificate and a sent email **look like the product they came from** — an admin who exports a poster today
gets an artefact from a different product than the screen they exported it from, and that is the only defect this wave
exists to fix. ★ **A certificate somebody is already holding does not change** (`REQ-CRT-014`): it renders as the version
it was issued against, byte-reproducibly, which is exactly why the database refuses to delete that version and why the
wave does not force it. ★ **Every colour comes through a token** — `design_template_versions_guard` refuses a hex
literal, by design, and nobody argues with it. ★ **The sober register still holds** (`REQ-UIX-053`). **«Good» is not
«the gates are green»** — the acceptance is the owner's, on a **printed** poster and a **printed** certificate.

★★ **Three PRs, each against `main` from its FIRST push.** **A — `wave-24a/the-palette`** (the lead, alone, the main
checkout): `brand.ts`'s `LIGHT`/`DARK`, `0192`, the goldens re-baselined, the 120 pinned mail files re-pinned.
**B — `wave-24b/the-baseline`** (`../kareem-marefa-wave24b`, cut from A's head): the five poster families, the six
certificate rows, `0193`. **C — `wave-24c/the-mail-designs`** (`../kareem-marefa-wave24c`, cut from A's head): the eight
designed families. ★ **B and C are cut from A, not from each other** — both bind the tokens A moves and neither touches
the other's files. **Merge order A, B, C.** **A teammate edits a PR's files only in that PR's tree**; the lead posts each
path when it exists.

★ **Why it is divided this way** (`DEC-242` §5): **the palette is the foundation both artefacts sit on**, so it is the
lead's and it lands first — a template built against the old defaults would be measured against the wrong ground, and
the goldens and the pinned mail move once, in A, before either teammate touches a design. **The design documents are
`designer`'s** — it owns `packages/designer-runtime`, the parity harness and every template screen's DAL. **The mail
designs are `notify`'s**, as since wave 10, and they are **constants, not rows**, so C writes no SQL at all.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-242`, this map, the ten agent files, `01`/`09`/`14`/`15`, `STATUS` · ★★ **`REQ-DSG-032`, the palette, first** (`STORY-DSG-014`): `brand.ts`'s `LIGHT`/`DARK` and **`0192`** replacing `brand_kit()`'s ten fallbacks, **in one commit**, proven equal by `tests/rls/brand-kits.test.ts` · ★★ **the goldens re-baselined** — `designer` runs `--update`, **the lead opens every before-and-after and commits** `scripts/parity/goldens/**` · ★★ **the 120 pinned mail files reviewed — measured UNMOVED by the palette (contract 4), so the one reviewed diff falls in PR C** · ★ **`0193`** from `designer`'s proposed file (PR B), with its report per row and its RLS case · ★ the six status pairs re-measured on the new defaults · every capture beside the artboard's thumbnails · the gates, three PRs, two worktrees | the lead-only paths below, `supabase/migrations/**` from `0192`, ★ `packages/designer-runtime/src/brand.ts` (**`branding`'s normally — the lead's for this wave, `BRAND_COLOUR_TOKENS` unchanged**), `scripts/parity/goldens/**`, ★ `tests/unit/mail-pinned/**` (**the lead's alone this wave**), `tests/rls/{brand-kits,status-contrast}*.test.ts`, `src/lib/brand/contrast.ts`, `src/app/globals.css`, `tests/unit/{ui-playground,tokens-only,no-raw-palette,scope-root}*` (**untouched this wave**), new `tests/e2e/wave24-{demo,lead}-*.spec.ts`, `scripts/seed-demo.mjs`. **Custodian** of every file of a track not spawned — `sessions`, `checkin`, `scoring`, `content`, `event`, `console`, `platform`, `branding` |
| `designer` | opus | ★★ **the five baseline poster families, rebuilt** (`REQ-DSG-033`, `STORY-DSG-015`) — one structure, five colourways: the flat ground, the category pill at the block-start, the title large in the display face, presenter and date bottom-start, the QR bottom-end · ★★ **the three certificate families × both orientations** (`REQ-CRT-016`, `STORY-CRT-008`) — bone ground, the wordmark top-start, the member's name large, the serial bottom-start `<bdi>`, the QR bottom-end · ★★ **the superseded eleven leave the library** (`REQ-DSG-034`, `STORY-DSG-016`) — deleted where the database permits, **retired where `on delete restrict` refuses**, the migration reporting which per row · ★ **the roster still counts five poster families and three certificate families** (`REQ-DSG-026`) · ★ **the demonstrable: a poster and a certificate exported from the rebuilt baseline, and one issued BEFORE the wave still rendering as its own version** — all PR B | `packages/designer-runtime/src/**` **except** `brand.ts` (the lead's this wave), ★ `packages/designer-runtime/scripts/seed-sql.mjs` (**granted at sync 1** — it is the generator `designer-library.test.ts` deep-equals against `0193`, so the two cannot drift), `packages/storage-paths/src/designer.ts`, `src/components/{designer,posters}/**`, `src/components/certificates/**`, `src/app/[locale]/app/admin/{designer,templates}/**`, `src/app/[locale]/app/admin/sessions/[id]/certificates/**`, `src/app/api/{designer,fonts,certificates}/**`, `src/lib/dal/{designer,templates,posters,certificates,fonts}.ts`, `worker/src/render/**` except `brand.ts` and its four tasks, `scripts/parity/**` **minus `goldens/`**, `src/messages/*/{designer,templates,certificates}.json`, ★ `supabase/proposed/designer/**` (**the baseline documents and the delete-or-retire function — never a file under `supabase/migrations/`**), `tests/rls/{designer,templates,posters,certificates,fonts,exports}*.test.ts`, `tests/unit/{designer,render,posters,certificates,qr,fonts,serial}*`, `tests/components/{designer,posters,certificates}/**`, `tests/e2e/{designer,templates,certificates,posters}*.spec.ts` and `tests/e2e/wave{8,10,13,23}-*designer*.spec.ts` (evidence), new `tests/e2e/wave24-designer-*.spec.ts`, `docs/plan/notes/designer.md`. **Nothing else** — the studio's chrome, the state machine, `canvas.tsx`'s engine, `ui/`'s 69 files and the export pipeline are frozen |
| `notify` | opus | ★★ **the eight designed mail families, rebuilt** (`REQ-NTF-016`, `STORY-NTF-008`) — `designs.ts`'s eight layouts in the same language as the app and the templates: the ground, the display face on the heading, lime as the single accent, the row rhythm · ★ **all 25 keys still resolve to a family, each with its own copy**; every block keeps its `id`, its compiled HTML and **its generated text alternative**; **no SVG** (invariant 11) · ★ **a null `blocks` row is still the admin's own text**, framed and never replaced · ★★ **it never re-pins: `tests/unit/mail-pinned/**` is READ-ONLY to `notify`** — the lead opens the diff — all PR C | `packages/mail-runtime/src/**`, `worker/src/mail/**`, `worker/src/tasks/{send_notification,send_test_email}.ts`, `src/app/[locale]/app/admin/emails/**`, `src/components/{email,notifications,calendar}/**`, `src/app/api/admin/emails/**`, `src/lib/dal/{notifications,calendar}.ts` (add-only), `src/messages/*/{notifications,emails,calendar}.json`, `tests/unit/{mail,notify,admin-emails}*` **with `tests/unit/mail-pinned/**` READ-ONLY**, `tests/rls/{notify,notifications}*.test.ts`, `tests/components/{email,notifications,calendar}/**`, `tests/e2e/{wave8-console-emails,wave10-notify-*,wave23-notify-*}.spec.ts` (evidence), new `tests/e2e/wave24-notify-*.spec.ts`, `docs/plan/notes/notify.md`. **Nothing else** — `notify()`, the inbox, reminders, settings, the block builder's chrome and every other worker task are frozen |

**Wave-24 contracts.**

1. ★★ **Lead → both — the palette, first, and its names.** `0192` and `brand.ts` move the ten defaults in **one commit**;
   `tests/rls/brand-kits.test.ts` proves the two copies equal. **`BRAND_COLOUR_TOKENS` does not change** — no token is
   added, renamed or removed, so `DEC-127`'s add-only ordering still holds. ★ **It lands before either track writes a
   document**, and the lead posts «the palette is in at `<sha>`» with the ten values. **Nobody authors a template against
   the old defaults.**
2. ★★ **Lead → both — a colour arrives as a token or it is a defect.** `design_template_versions_guard` (`0055`) refuses a
   hex literal in a template document, and `0094`'s guard walks **every** colour. The ten `brand.*` bindings and the team
   colour are the whole vocabulary; **`node` is lime and `edgeStrong` is muted** (`DEC-242` §2), decided, not re-opened.
   A colour a plan cannot express in them is a question to the lead, **never a literal and never a new token**.
3. ★★ **`designer` → lead — what is deleted and what is retired.** `designer`'s plan names the eleven rows and, per row,
   what the delete would be refused by: `certificates.template_version_id` and `design_documents.template_version_id` are
   both `on delete restrict`, and `issue_certificates()` (`0065:138-146`) resolves **the platform row directly** when an
   org has no default of its own. The function goes under `supabase/proposed/designer/`; **the lead promotes it as
   `0193`** and it **reports which of the eleven went which way**. ★ **Nothing is forced** — no `cascade`, no detaching a
   certificate from its version.
4. ★★ **Lead → both — the goldens and the pinned mail move ONCE, and only the lead moves them.** A golden moves **only**
   because the palette moved or a baseline document was rebuilt, and the lead's commit says which. `designer` runs
   `--update` and hands the diff over; **it never commits `scripts/parity/goldens/**`.** `notify` **never runs a mail
   re-pin**; a changed pinned file is the lead's reviewed diff. ★★ **Measured in PR A: the palette does NOT move the 120** — `SAMPLE_BRAND` is the legacy three-key shape with no `light` object, so `brand_kit()`'s values never enter the pinned render, and the full unit suite is green across the palette commit. **They move once, in PR C.** `DEC-176`'s sentence still holds verbatim: **an org's own
   untouched document renders identically**, with the new values, because that is what moving a default means.
5. ★ **Everyone — the thumbnails are the specification, and `DEC-242` §1 is what they are NOT.** The seven cards on
   `AdminTemplates.dc.html` and `AdminTemplatesCerts.dc.html` are the design. ★★ **The names they print are FIXTURES, not
   a roster**: `0096`'s contract 3 stands — five poster families, three certificate families × two orientations, one
   default per `(purpose, family)`, the orientation read from `document->'master'`. **The eleven rows keep their families
   and their names; the document inside each is what changes.** A new disagreement is written in your note with the file
   and the line; nobody picks a side. No class, id or markup pattern from a `.dc.html` in `src/`.
6. ★ **Everyone — an org that overrode its kit sees nothing change.** Every figure, every colour and every font is read
   from `brand_kit()` and `resolveBrand()` as they stand. A template never hard-codes the platform's own values «because
   that is what the default is».

**Wave-24 rules.**

- ★★ **A golden moving is CORRECT in this wave and in no other** (`DEC-242` §4) — and only for the two named reasons,
  only in the lead's commit. **The rule that a teammate never refreshes a golden or a pinned mail file is unchanged.**
- ★★ **`REQ-CRT-014` is the floor.** A certificate issued before the wave renders as the version it was issued against,
  byte-reproducibly. **A version row that a certificate references is never deleted**, however much the instruction says
  «delete» — the database refuses it and the database is right.
- ★★ **`registrations` is never touched; the five public routes do not move.** They render no template and read no brand
  kit, so `qa:contract`, `qa:appearance`, `visual`'s public pairs and the register-form fingerprint are **unmoved, not
  re-baselined** — and the lead proves it.
- ★★ **No new primitive.** `ui/` stays 69 files; `ui-playground.test.ts` is untouched. No screen is rebuilt: `DEC-208`
  does not apply, because **no page file is deleted** — this wave changes documents and constants, not screens.
- ★ **The studio is not the party** (`REQ-UIX-053`): no motion, no object, no sticker; `console-register.test.ts` is not
  edited.
- ★ **Arabic first**; `<bdi>` on every serial, code, number and title; Western numerals (`DEC-124`); six ICU forms;
  logical properties — **except `DEC-096`'s overlay**, which nobody tidies.
- ★ **The existing suites are evidence**; each changed assertion is a ledger line in `STATUS.md`, in the same commit.
- ★ **No new dependency.** **No migration beyond the lead's two**; a function a plan needs goes under
  `supabase/proposed/<you>/`.
- **Teammates spawn planning-only**; sync 1 approves two plans with their colour tables and `designer`'s
  delete-or-retire table; **nobody writes a document before the lead posts «the palette is in».**
- **One writer per file, specs and demos included. `ui-lint --strict` has no allowlist and never gains one.**
- **Captures land at `.qa-shots/rtl/wave24-<track>-<artefact>-<state>-<1280|390>.png`** from a production build the row
  names by commit, honouring `E2E_SHOTS_DIR`; the lead opens every one beside the artboard's thumbnails, in bands, never
  downscaled. ★ **A render is also opened at its own size** — a poster and a certificate are printed artefacts.
- **Not this wave, and never-touch for every teammate:** `SCR-059` branding and the brand-kit **screen** (M13 — this wave
  moves the platform *default*, never the org override or its UI); stories, their viewer and `story_views` — the ring
  stays inert; `/app/platform/**`; the five public routes; the member app and the console's screens; the studio's chrome,
  the state machine and `canvas.tsx`'s engine; **replacing the renderer** (`DEC-017`, `DEC-048`); a template serving
  several kinds (`DEC-236` §1); **renaming a family or changing the roster's count**; **a new brand token**; coral as a
  brand token (`DEC-073`); a per-scheme logo; the Railway check (`DEC-241` §2 — November); `DEC-194`'s two gates;
  `DEC-215`'s four; `DEC-186` §4; `DEC-204`; the `railway.json`.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`, `stop`,
  branch switches, worktrees, pushes and the PRs.

### Ownership map (wave 23 — M12, the studio, DEC-235 · DEC-236 · DEC-237) — ★ THE RECORD OF A FINISHED WAVE

> Wave 23 merged as PRs #52 – #59 and was accepted by the owner on 2026-10-04 (`DEC-240`, `DEC-241`; `main` `0f27fe5d`, production `0191`). Its map is kept as the record; **wave 24's map is directly above** (`DEC-242`).

**The programme's ninth wave** (milestone **M25**). ★★ **The owner put the studio before stories** (`DEC-235` §1) — the
fifth deliberate re-ordering; wave 18's ring stays inert and nobody wires it. **Four screens from nine artboards** in
`docs/design/screens/m12/`, specified by `docs/design/screens/M12.md` and corrected by the brief
(`docs/plan/notes/wave-23-lead.md`), `DEC-235`, `DEC-236` and `DEC-237`: `055` القوالب with its الشهادات tab, `056`/`057`
المصمّم (the poster canvas and the certificate canvas), `058` البريد, `045` الشهادات. ★★ **Six new primitives — the floor
moves 63 → 69** (`editor-rail`, `floating-toolbar`, `canvas-stage`, `layer-list`, `block-canvas`, `block-library`).
★★ **No migration is expected** — four reasons, `DEC-235` §3, `DEC-236` §1, `DEC-237` §4; one written after all starts at
`0191`, rehearsed on a dump taken at `0190`.

★★ **THE GOAL, above the process** (the owner's words): **make the studio something an admin can design in without a
designer.** ★ A poster is designed **once** and is right in **every format** — one template, 16:9 · A4 · A3 · 9:16 on one
strip, layers mapping across with per-format overrides; an admin who rebuilds it four times means the strip failed. ★ The
checks say what is wrong **before** export, inline, naming the layer, and selecting a finding opens it — contrast, the
logo's PPI at A3, the longest title (or member name) fitted at the layer's max lines, the safe area — **a count on a rail
item, never a modal**. ★ An email is **assembled, previewed with a real session and tested to the admin's own address**
before a member sees it — ★ **and the 25 messages keep rendering byte-identically: `tests/unit/mail-pinned/`'s 120 files
pass UNTOUCHED.** ★ A certificate is **designed once and issued many times** — three defaults, one per kind (حضور · تقديم ·
إنجاز), and **a certificate issued against v3 still renders as v3 after v4** (`REQ-CRT-014`: reissue is
byte-reproducible). ★ Certificates are **issued and revoked from the session** — the serial `<bdi dir="ltr">`, revoke's
reason mandatory, every PDF through the one audited route. ★★ **EVERY DRAG HAS A PATH THAT NEEDS NO DRAGGING**
(`DEC-093`) — the floor of the whole wave, and the thing most likely to be missed. ★ **The sober register**
(`REQ-UIX-053`): no motion beyond drag feedback; `console-register.test.ts` green **and untouched**. ★ **An untouched
document exports identically**: a parity golden that moves is a bug, not a re-baseline. **«Good» is not «the gates are
green».**

★★ **Three PRs, each against `main` from its FIRST push.** **A — `wave-23a/templates-and-certificates`** (draft #52, the
main checkout): `055` with C1 – C2, `045` with C6 – C7. **B — `wave-23b/the-designer`**
(`../kareem-marefa-wave23b`, cut from A's head after the map): the editor frame and the two shared primitives **first, by
the lead**, then `056`/`057`, `canvas-stage`, `layer-list`, the certificate canvas with C3 – C5. **C —
`wave-23c/the-email-builder`** (`../kareem-marefa-wave23c`, **cut from B's head once `editor-rail` and
`floating-toolbar` land**): `058`, `block-canvas`, `block-library`, the six new block types. **Merge order A, B, C.**
**A teammate edits a PR's files only in that PR's tree**; the lead posts each path when it exists.

★ **Why it is divided this way** (`DEC-237` §1): **each screen goes to the track that owns what it writes.** PR A is
composition over functions that already exist — `templates.ts`'s library writes and `certificates.ts`'s
`setCertificateDesign`, `releaseCertificates`, `revokeCertificate`, and `sessions'` `set_session_certificate_mode()` — so `055` and `045` go to `console`, which has built
every console table with a bulk bar and a reason sheet; those two DAL modules transfer to it for the wave. **The editor's
engine and the chrome built on it are `designer`'s**, divided **by file class and commit** (`DEC-235` §2, `DEC-237`
§2 – §3); the chrome **both** editors share is the lead's; the library's chrome is `console`'s. The email builder is
`notify`'s, as since wave 10.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-237`, this map, the ten agent files, `01`/`09`/`14`/`15`, `STATUS` · ★★ **contract 1, the studio frame, first** (`REQ-UIX-107`, `STORY-UIX-097`): the two editors' routes get the whole viewport with their own bar · ★★ **`ui/editor-rail`** (the 68 px icon rail and the 300 px panel that swaps) and **`ui/floating-toolbar`**, in PR B before any editor screen · ★ **contract 2**: `ui/index.ts`'s six signatures, the registry, the floor 63 → 67 in B and 67 → 69 in C, each demo wired · ★★ **the certificate walkthrough spec**, captured at every step (`DEC-236` §5) · every capture beside its artboard · the gates, three PRs, two worktrees | the lead-only paths below, ★ new `src/components/ui/{editor-rail,floating-toolbar}.tsx` with their tests, `-scope` tests and demos, `src/app/[locale]/app/admin/layout.tsx`, `src/components/shell/**`, `tests/unit/console-register.test.ts` (**untouched this wave**), new `tests/e2e/wave23-{demo,lead}-*.spec.ts`. **Custodian** of every file of a track not spawned — `sessions`, `checkin`, `scoring`, `content`, `event`, `platform`, `branding` |
| `console` | opus | ★★ **`055` the library, both tabs** (`REQ-UIX-108`, `STORY-UIX-098`, C1 – C2) — قوالب مؤسستك and قوالب المنصة, «انسخ لتعدّل», ★ **three defaults named on the الشهادات tab, one per kind** · ★★ **`045` the session's certificates** (`REQ-UIX-109`, `STORY-UIX-099`, C6 shown, C7) — ★ **the mode and the template — `045` is their one writer** (`DEC-178`, `DEC-237` §4): a control before completion, the drawn sentences after; محجوزة with row checkboxes and «أصدر المحدّد» / «أصدر الكل», صادرة with the serial `<bdi dir="ltr">`, «PDF» through **the one audited route**, «ألغِ» with a **mandatory reason in a sheet** · ★ **one default per kind used when the session names none** (`REQ-CRT-015`, `STORY-CRT-007`) — all PR A | ★ `src/app/[locale]/app/admin/templates/**` and `src/app/[locale]/app/admin/sessions/[id]/certificates/**` (**from `designer`, this wave**), ★ `src/lib/dal/{templates,certificates}.ts` (**from `designer`, add-only**), ★ the library's chrome — `src/components/designer/{template-library,template-library-page,template-preview,template-actions}.tsx` — ★ and `045`'s — `src/components/certificates/{design-panel,eligible-list,issuance,mode-control}.tsx` (`DEC-238` §2) — **to delete**, and new `src/components/templates/**`, its six `ui/` files (composed; `data-table` add-only if at all), ★ `src/messages/*/{templates,certificates}.json` (**from `designer`**), `supabase/proposed/console/**` (functions only), ★ `tests/rls/{templates,certificates}*.test.ts`, `tests/unit/certificates*`, `tests/components/certificates/**`, `tests/e2e/{templates,certificates}*.spec.ts` (**from `designer`**, evidence), new `tests/components/templates/**`, new `tests/e2e/wave23-console-*.spec.ts`, `docs/plan/notes/console.md`. **Nothing else** — the rest of the console is frozen |
| `designer` | opus | ★★ **`056`/`057` the editor, rebuilt** (`REQ-UIX-110`, `STORY-UIX-100`) — the rail's seven items, the swapping panel, the floating toolbar, the variant strip on the bar, ★ **checks a rail item with a count** (`DEC-NEXT-34`), «معاينة بجلسة» · ★★ **the editor's state machine moved verbatim into a kept module BEFORE `editor.tsx` is deleted** (`DEC-237` §2) · ★★ **`canvas.tsx`'s engine kept and its outer frame moved to `ui/canvas-stage`** (`DEC-237` §3) · ★ **`ui/layer-list`**, and `src/components/designer/layer-list.tsx` **deleted** (`DEC-235` §5.1) · ★ **the certificate canvas** (`REQ-UIX-111`, `STORY-UIX-101`, C3 – C5): the landscape strip, the الحقول panel used / unused, {المستوى} for `achievement` only, {رمز التحقق QR} bound to the verify URL, the longest **member name** check, «معاينة بعضو» through the one renderer · ★★ **the demonstrable: all four formats exported from the sample template, no golden moved** · ★★ **a `page.click()`-only spec for every new drag** — all PR B | `packages/designer-runtime/src/**` **except** `brand.ts`, `packages/storage-paths/src/designer.ts`, `src/components/{designer,posters}/**` **except** the library's four files (`console`'s), `src/components/certificates/**` **except** `{design-panel,eligible-list,issuance,mode-control}.tsx` (`console`'s), `src/app/[locale]/app/admin/designer/**`, `src/app/api/{designer,fonts,certificates}/**`, `src/lib/dal/{designer,posters,fonts}.ts`, `worker/src/render/**` except `brand.ts` and its four tasks, `scripts/parity/**` minus `goldens/`, new `src/components/ui/{canvas-stage,layer-list}.tsx` with their tests, `-scope` tests and demos, `src/messages/*/designer.json`, `supabase/proposed/designer/**`, `tests/rls/{designer,posters,fonts,exports}*.test.ts`, `tests/unit/{designer,render,posters,qr,fonts,serial}*`, `tests/components/{designer,posters}/**`, `tests/e2e/{designer,posters}*.spec.ts` and `tests/e2e/wave{8,10,13}-designer-*.spec.ts` (evidence), new `tests/e2e/wave23-designer-*.spec.ts`, `docs/plan/notes/designer.md`. **Fixes only**, in PR A's tree if `045` needs one: `src/app/[locale]/verify/**` **except its layout**, `src/app/[locale]/app/me/certificates/**` |
| `notify` | opus | ★★ **`058` the gallery and the builder** (`REQ-UIX-112`, `STORY-UIX-102`) — a card per message (thumbnail, name, category, مفعّلة / متوقفة, send count), the editor on `editor-rail` (إضافة · الأنماط · التخطيطات · الكتلة), the email at 600 px on `canvas-stage`, rows with their handle bar, the device toggle, «معاينة واختبار» with a real session and a test send to the admin's own address, «احفظ وفعّل» · ★ **`ui/block-canvas`** and **`ui/block-library`** · ★★ **six new block types, layouts and global styles** (`REQ-NTF-015`, `STORY-NTF-007`) — الملصق · رمز QR · نقاطك · شهادة · الشعار · اجتماعي, each through the union, the compiler, **the generated text alternative** and the checks; `detail_list` stays · ★★ **`tests/unit/mail-pinned/`'s 120 files pass UNTOUCHED** · ★★ **a `page.click()`-only spec for every new drag** — all PR C | `packages/mail-runtime/src/**`, `worker/src/mail/**`, `worker/src/tasks/{send_notification,send_test_email}.ts`, `src/app/[locale]/app/admin/emails/**`, `src/components/{email,notifications,calendar}/**`, `src/components/admin/delivery-reason.ts`, `src/app/api/admin/emails/**`, ★ new `src/app/api/mail/qr/route.ts` (`DEC-238` §4), `src/lib/dal/{notifications,calendar}.ts` (add-only), new `src/components/ui/{block-canvas,block-library}.tsx` with their tests, `-scope` tests and demos, `src/messages/*/{notifications,emails,calendar}.json`, `supabase/proposed/notify/**` (functions only), `tests/unit/{mail,notify,admin-emails}*` **with `tests/unit/mail-pinned/**` READ-ONLY**, `tests/rls/{notify,notifications}*.test.ts`, `tests/components/{email,notifications,calendar}/**`, `tests/components/admin/emails-page.test.tsx`, `tests/e2e/{wave8-console-emails,wave10-notify-*}.spec.ts` (evidence), new `tests/e2e/wave23-notify-*.spec.ts`, `docs/plan/notes/notify.md`. **Nothing else** — `notify()`, the inbox, reminders, settings and every other worker task are frozen |

**Wave-23 contracts.**

1. **Lead → everyone — the studio frame and the shared chrome.** The two editors' routes render **without the console
   frame** — their own 52 px bar, `editor-rail` at the inline-start, the canvas — and every other studio screen (`055`,
   `045`, the email gallery) stays inside wave 21's frame. `editor-rail` takes the rail's items and the panel for the
   selected item; `floating-toolbar` takes a target's box and its controls. **Their props in the lead's note on day one**;
   they land in PR B before any editor screen, and **C is cut after them**.
2. **Lead → everyone — the signatures and the gate.** Each owner names its primitive's props in its plan; the lead lands
   the six as types after sync 1, with the registry entries; the floor moves **63 → 67** in B and **67 → 69** in C.
3. **`designer` ↔ `notify` — one stage.** `canvas-stage` is the ground, the fit and the zoom, the rulers and the toggles,
   with a slot; `DesignerCanvas` is the poster's child and `block-canvas` the email's. **Neither child re-implements the
   stage**, and the stage draws nothing of a document (`DEC-237` §3).
4. ★★ **Everyone — `DEC-093`, six new drags.** The elements panel → canvas, the layer reorder, the asset drag (`designer`);
   the block into a row slot, the row handle bar, the block library (`notify`). **Each has a single-pointer path that is
   not a drag** — a tap that places, ▲▼ that move — named in the plan **before** the drag is built, and **a Playwright
   case with `page.click()` alone performs it.** Wave 13's paths are reused; the inspector's numeric X/Y/W/H/rotation
   fields may be collapsed into an accordion, **never deleted**.
5. ★★ **`designer` — the engine is not touched for the chrome's convenience.** `canvas.tsx`, `bindings-panel.tsx`,
   `checks-panel.tsx`, `export-panel.tsx`, `export-action-button.tsx`, `export-reason.ts`, `upload-asset.ts` and
   `add-image.tsx` keep their behaviour; **each one's existing suite passes untouched** — that is the proof the seam is
   right. `DEC-096` stands: the overlay is physical `left`/`top` from document geometry; nobody tidies it.
6. ★★ **`console` — the certificate rules are requirements.** A held certificate is **invisible to its recipient and sends
   no mail** (`REQ-CRT-004`); release is audited, individually and in bulk; revoke takes a **mandatory reason**, is
   audited, and the verification page then says **«شهادة ملغاة» and never the reason**, with the PDF **not deleted**
   (`REQ-CRT-011`); every PDF through **the one audited route** (`DEC-177`) — never a bare `<a download>`. **The mode and
   the template are written only on `045`, and refused after completion** (`DEC-178`, `DEC-237` §4) — a control before,
   the drawn sentences after. ★ `DEC-236` C6's «الجدولة» is the owner's to confirm; until then `DEC-178` stands.
7. ★★ **`notify` — additive or it is wrong.** A new block type, a layout or a global style that moves one of the 120
   pinned files is not additive. **Pinned mail output is never refreshed by a teammate**; a changed file is a reviewed
   change the lead opens. An existing flat document reads as rows without a byte moving. **No SVG in mail** — the image
   block is PNG and JPEG only (invariant 11).
8. **Everyone — the artboard is the specification, and `DEC-235` §5, `DEC-236` and `DEC-237` §5 are the list of what it
   draws that is not built.** A new disagreement is written in your note with the artboard and the line; nobody picks a
   side. No class, id or markup pattern from a `.dc.html` in `src/`.

**Wave-23 rules.**

- ★★ **Rebuilt, never restyled; deleted first — and `DEC-208` reaches the chrome, not the engine** (`DEC-235` §2). Two
  commits per screen — a delete, then a create — with the kept-behaviour table in the note **before** the create. ★ **Logic
  that lives in a chrome file is MOVED, verbatim and in its own commit, before the delete** (`DEC-237` §2). ★ **Never push an
  unpaired delete.**
- ★★ **No golden moves** (`DEC-176`). `scripts/parity/goldens/**` is the lead's; an untouched document renders identically.
- ★★ **`mail-pinned`'s 120 files are untouched**, and nobody runs a refresh over them.
- ★★ **The studio is not the party** (`REQ-UIX-053`): no motion beyond drag feedback, no `transition`, no object, no sticker,
  no moment; `console-register.test.ts` **is not edited**.
- ★ **The designer is desktop-only** (`06` §2) — no phone designer is invented; `055`, `045` and the email gallery stack
  under `lg` like every console table.
- ★ **No explainer copy** (`DEC-NEXT-25`). ★ **Arabic first**; `<bdi>` on every serial, code, number and title; Western
  numerals; six ICU forms; logical properties — **except `DEC-096`'s overlay**.
- ★★ **`registrations` is never touched; the five public routes do not move.** `verify/[code]` is not one of the five.
- ★ **The existing suites are evidence**; each changed assertion is a ledger line in `STATUS.md`, in the same commit.
- ★ **No new dependency.** **No migration**; a function a plan needs goes under `supabase/proposed/<you>/`.
- **Teammates spawn planning-only**; sync 1 approves three plans with their kept-behaviour tables and their `DEC-093`
  paths; **nobody deletes a file before the lead posts «the plans are approved»**.
- **One writer per file, specs and demos included. `ui-lint --strict` has no allowlist and never gains one.**
- **Captures land at `.qa-shots/rtl/wave23-<track>-<screen>-<state>-<1280|390>.png`** from a production build the row
  names by commit, honouring `E2E_SHOTS_DIR`; the lead opens every one beside the artboard, in bands, never downscaled.
- **Not this wave, and never-touch for every teammate:** `SCR-059` branding and the brand kit; `/app/platform/**`; the five
  public routes; ★ stories, their viewer and `story_views` — the ring stays inert; the member app and the console's other
  screens; **replacing the renderer** (`DEC-017`, `DEC-048`); a template serving several kinds (`DEC-236` §1); a phone
  designer; `DEC-194`'s two gates; `DEC-186` §4; the hard-load fix (`DEC-204`); `DEC-215`'s four; the `railway.json`.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`, `stop`,
  branch switches, worktrees, pushes and the PRs.

### Ownership map (wave 22 — M11b, the rest of the console, DEC-230 · DEC-231) — ★ THE RECORD OF A FINISHED WAVE

> Wave 22 merged as PRs #47 – #50 and closed with #51 (`242657a5`; `0190` on production, `DEC-234`). Its map is kept as the record; **wave 23's map is directly above** (`DEC-235`, `DEC-236`, `DEC-237`).

**The programme's eighth wave, and its largest batch: fifteen screens** (milestone **M24**). ★★ **The owner put M11b
before stories** (`DEC-230` §1) — the fourth deliberate re-ordering; wave 18's ring stays inert and nobody wires it.
Fifteen screens from fourteen artboards in `docs/design/screens/m11b/` (`050/052` share one), specified by
`docs/design/screens/M11b.md` and corrected by the brief (`docs/plan/notes/wave-22-lead.md`), `DEC-230` and `DEC-231`.
★★ **NO new primitive** — the floor stays **63** and `tests/unit/ui-playground.test.ts` is untouched, the first wave
since 15. **Two migrations, both the lead's**: `0180` (`venues.company_id`) and the audit migration after it
(`DEC-231` §4).

★★ **THE GOAL, above the process** (`DEC-231` §0, the owner's words): **finish the console, so an admin can run the
whole organisation from it.** ★ An admin changes something and **KNOWS IT SAVED** — a setting that silently did or did
not write is the worst outcome on any page; ★ moderation is **ACTIONED, not listed** — content in context, reporter,
age, and a resolution that records the outcome **and** the actor; ★ the catalogue is editable **without breaking the
promise `SCR-022` makes** (`REQ-PTS-003`); ★ an export **opens in Excel in Arabic**, and every export is audited; ★ the
audit log answers **who, when and why** for everything these screens can do; ★ and it stays **the sober register**
(`REQ-UIX-053`), its test green **and untouched**. **«Good» is not «the gates are green».**

★★ **Three PRs, each against `main` from its FIRST push** (`DEC-230`): **A — `wave-22a/the-tables`** (draft #47):
`046`, `047`, `048`, `049`, `060`, `061`, `062`, the three `data-table` cells, `0180`, the audit migration, the hosting
rule. **B — `wave-22b/the-read-pages`**: `053`, `054`, `063`. **C — `wave-22c/moderation-and-the-survey`**: `050/052`,
`051`, `064`, `065`, the rail 20 → 19. ★ **A is built in the main checkout; B and C are cut from A's head once the cells
land, each in its own worktree** (`../kareem-marefa-wave22b`, `../kareem-marefa-wave22c`). **A teammate edits a PR's
files only in that PR's tree**; the lead posts each path when it exists.

★ **Why it is divided this way** (`DEC-231` §2): **each screen goes to the track that owns what it writes**, so every
contract is a read. The console's own DAL sits behind twelve of the fifteen, so the split follows the data
**underneath**: `scoring` owns the rules and the ledgers, so it takes `053`, `054` and the hosting rule; `060` and
`063` both write **one row, `org_settings`**, whose الربط card is calendar and mail, so `notify` takes them; `content`
owns `comments`, `reports` and `photos`, so it takes moderation; `event` owns the survey; `console` keeps the four
tables, exports, the audit log and its own `data-table`. The frame, the rail and the migrations are the lead's.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-231`, this map, the ten agent files, `01`/`05`/`09`/`14`/`15`, `STATUS` · ★★ **`0180`** (`STORY-ADM-010`) · ★★ **the audit migration** (`STORY-ADM-011`): a definer trigger per table, the action strings `DEC-231` §4 fixes · ★ **the rail 20 → 19** in PR C — `admin-nav.ts`'s `moderationComments` to `built: false`, its count test · the read-mode spec over all four pages · every capture beside its artboard · the gates, three PRs, two worktrees | the lead-only paths below, ★ `src/components/shell/admin-nav.ts` and `tests/unit/admin-nav.test.ts`, `src/app/[locale]/app/admin/layout.tsx`, `src/components/ui/admin-rail.tsx`, `tests/unit/console-register.test.ts` (**untouched this wave**), new `tests/e2e/wave22-{demo,lead}-*.spec.ts`, new `tests/rls/{venue-company,console-audit}*.test.ts`. **Custodian** of every file of a track not spawned — `sessions` (**except** the venue functions of `lib/dal/sessions.ts`, `console`'s this wave), `checkin`, `designer`, `platform`, `branding` |
| `console` | opus | ★ **the three `data-table` cells** (`REQ-UIX-092`, PR A, first — B and C are cut after them) · ★★ **`046` venues with the owning company** (`REQ-UIX-093`) · `047` (`094`) · `048` (`095`) · `049` (`096`) · `061` exports (`098`) · ★ **`062` the audit log, reading both stores** (`099`, `DEC-231` §4.3) — all PR A · in PR C, `admin-dashboard.ts`'s two moderation attention rows re-pointed on `content`'s written request | `src/app/[locale]/app/admin/{venues,categories,companies,members,exports,audit}/**`, `src/lib/dal/{admin-lists,admin-members,admin-exports,admin-audit,admin-dashboard,admin-sessions}.ts`, ★ **the venue functions of `src/lib/dal/sessions.ts`, add-only** (`listVenuesForAdmin`, `createVenue`, `setVenueActive` and their schemas), `src/app/api/admin/exports/**`, `src/components/admin/**` **except** `delivery-reason.ts`, its six `ui/` files (`data-table` **add-only**) with their tests, `-scope` tests and demos, `src/messages/*/admin.json`, `supabase/proposed/console/**` (functions only), `tests/components/admin/**` **except** `{emails-page,scoring-page,recognition-page,reminders-form,report-card,comment-report-card,takedown-card}.test.tsx`, `tests/unit/admin*` **except** `admin-{emails,nav,scoring-actions,recognition-actions,reminders-action}.test.ts`, `tests/rls/{admin-export-audit,team-colour-audit}.test.ts`, `tests/e2e/admin-{audit,exports,members,dashboard,sessions}.spec.ts` and `tests/e2e/wave{17,21}-console-*.spec.ts` (evidence), new `tests/e2e/wave22-console-*.spec.ts`, `docs/plan/notes/console.md`. **Nothing else** — the dashboard and the sessions table (wave 21) are frozen but for the two attention rows |
| `scoring` | opus | ★★ **the hosting rule onto the venue's owner, and the stopgap form and `setSessionHostCompany()` removed in the same PR** (`REQ-PTS-016`, `STORY-PTS-008`, PR A) · ★ **`053` the points catalogue** (`REQ-UIX-100`, PR B) — ★ a test that edits a rule and reads `SCR-022`'s explanation after · ★ **`054` badges and levels with the held certificates** (`REQ-UIX-101`, PR B) · the read-mode pattern on both (`REQ-UIX-091`) · `05` §6.3's last word on a multi-day session's venues (`DEC-231` §6.3) | ★ `src/app/[locale]/app/admin/{scoring,recognition}/**` and `src/lib/dal/scoring-admin.ts` (**from `console`, this wave**), presentation-only `src/components/certificates/held-achievements.tsx`, `src/components/scoring/**` except the three boards, `src/lib/dal/{points,leaderboards,recognition}.ts` (add-only), `src/messages/*/{scoring,recognition}.json`, `supabase/proposed/scoring/**` (functions only), `worker/src/tasks/{award_points,award_presenter_points,evaluate_no_shows,evaluate_streaks,evaluate_badges,evaluate_levels_perks,snapshot_leaderboards,audit_balances}.ts` (fixes only), ★ `tests/components/admin/{scoring-page,recognition-page}.test.tsx` and `tests/unit/admin-{scoring,recognition}-actions.test.ts` (**from `console`**, evidence), `tests/components/scoring/**`, `tests/unit/scoring*`, `tests/rls/{scoring,points,award,leaderboards,recognition,audit-balances,manual-adjustment,snapshot,all-time,company-min-active}*.test.ts` (evidence), `tests/e2e/{points,scoring-screens,scoring-company-points,wave8-console-scoring,wave8-console-recognition}.spec.ts` (evidence), new `tests/e2e/wave22-scoring-*.spec.ts`, `docs/plan/notes/scoring.md`. **Nothing else** — the member app's points and boards, the ledger's shape and what a balance, level or rank **is** are frozen |
| `notify` | opus | ★ **`060` reminders** (`REQ-UIX-097`, PR A) · ★ **`063` settings, four `kv-card`s** (`REQ-UIX-102`, PR B) — the read-mode pattern on both, ★ **the saved mark read from the `org_settings` history row the save wrote** | ★ `src/app/[locale]/app/admin/{reminders,settings}/**` and `src/lib/dal/admin-settings.ts` (**from `console`, this wave**), `src/lib/dal/{notifications,calendar}.ts` (add-only), `src/messages/*/{notifications,settings,calendar}.json` (★ the two pages' strings move here from `admin.settings.*`; `console` deletes the old keys on request), `supabase/proposed/notify/**` (functions only), ★ `tests/components/admin/reminders-form.test.tsx` and `tests/unit/admin-reminders-action.test.ts` (**from `console`**, evidence), `tests/components/{notifications,calendar,settings}/**`, `tests/unit/notify*`, `tests/rls/{notify,notifications}*.test.ts` (evidence), `tests/e2e/{wave8-console-reminders,admin-settings}.spec.ts` (evidence), new `tests/e2e/wave22-notify-*.spec.ts`, `docs/plan/notes/notify.md`. **Nothing else** — `notify()`, the mail, the email studio, the inbox, `/app/me/settings` and every worker task are frozen |
| `content` | opus | ★★ **`050/052` reports** (`REQ-UIX-103`, PR C) — comment reports, moved here from `/comments`, and `/comments` redirecting · ★★ **`051` photos on `split-view`** (`REQ-UIX-104`, PR C) — takedowns and photo reports, moved here from `/reports` · ★ **report resolution as one audited function** (`STORY-ADM-011`, `DEC-231` §4.2) · the two counts the rail's badges read, named in its note | ★ `src/app/[locale]/app/admin/moderation/**` and `src/lib/dal/admin-moderation.ts` (**from `console`, this wave**), `src/lib/dal/{comments,reports,photos}.ts` (add-only), `src/messages/*/{event,photos}.json` (★ moderation's strings move here from `admin.moderation.*`; `console` deletes the old keys on request), `supabase/proposed/content/**` (functions only), ★ `tests/components/admin/{report-card,comment-report-card,takedown-card}.test.tsx` (**from `console`**, evidence) and new `tests/components/moderation/**`, `tests/rls/{moderation,photos}*.test.ts` (evidence), `tests/e2e/admin-moderation.spec.ts` (evidence), new `tests/e2e/wave22-content-*.spec.ts`, `docs/plan/notes/content.md`. **Nothing else** — the member app, the feed, materials, the viewer and the upload routes are frozen |
| `event` | opus | ★ **`064` the survey tab** (`REQ-UIX-105`, PR C) — the withhold on every question type, screen and CSV · ★ **`065` survey templates** (`REQ-UIX-106`, PR C) — the two panes, reordered by buttons, every template mutation audited by the lead's trigger | `src/app/[locale]/app/admin/surveys/**`, `src/app/[locale]/app/admin/sessions/[id]/survey/**`, `src/components/survey/**`, `src/lib/dal/surveys.ts` (add-only), `src/messages/*/survey.json`, `supabase/proposed/event/**` (functions only), `tests/components/survey/**`, `tests/unit/survey*`, `tests/rls/survey*.test.ts` (evidence), `tests/e2e/wave10-event-*.spec.ts` (evidence; `wave10-demo-survey` is the lead's), new `tests/e2e/wave22-event-*.spec.ts`, `docs/plan/notes/event.md`. **Nothing else** — rate, the ratings, `star-input` and the hub's header are frozen |

**Wave-22 contracts.**

1. **Lead → everyone — the frame stands, and the rail drops one item.** Wave 21's frame is unchanged: a page renders its
   `h1` row with its one primary action and its content, nothing of the frame. ★ In PR C the lead flips
   `moderationComments` to `built: false` — **twenty items to nineteen** — in the same commit as `content`'s redirect.
2. **`console` → everyone — the three cells, first.** The switch cell, the two-button action cell and the swatch cell,
   **add-only on `data-table`, every existing suite untouched**. Their props in `console`'s note **on day one**; they
   land in PR A before any screen that uses them, and **B and C are cut after them**.
3. **Lead → everyone — the audit rows.** `DEC-231` §4's table is the list; a track's plan names every mutation its screens
   perform and the row each writes — **one line per mutation per screen**. A gap is a definer trigger the lead writes;
   **no track writes `audit_log` from the DAL**, and nothing is written twice.
4. **`scoring` ↔ `console` — the venue's company.** `0180` is the lead's; `046` writes it (`console`); the rule reads it
   (`scoring`). **No screen and no rule reads `sessions.host_company_id` after PR A.**
5. **`content` → `console` and the lead — the moderation counts.** `content` names the two counts its screens show; the
   two attention rows in `admin-dashboard.ts` re-point (`console`, on `content`'s written request) and the badges follow
   (the lead). A badge is never drawn at 0.
6. **`scoring` + `notify` — the read-mode pattern** (`DEC-231` §3). `profile-edit.tsx` is the reference, read and never
   imported; **the saved mark comes from the server's answer and the history row**, never from the client's clock;
   leaving with changes asks. The lead's `wave22-lead-read-mode` spec walks all four pages with the same steps.
7. **Everyone — the artboard is the specification, and `DEC-230` with `DEC-231` §5 – §6 is the list of what it draws
   that is not built.** A new disagreement is written in your note with the artboard and the line; nobody picks a side.
   No class, id or markup pattern from a `.dc.html` in `src/`.
8. **Everyone — every figure is read, and every action keeps its authority.** A count, an age, a value, a threshold —
   never a literal. An export goes through the audited path; a removal through the existing function.

**Wave-22 rules.**

- ★★ **Rebuilt, never restyled; deleted first** (`DEC-199` §2, `DEC-208`). Two commits per screen — a delete, then a
  create — and the kept-behaviour table in the note **before** the create commit, **with every audit row the screen
  writes**, read against the new file after it. ★ **Never push an unpaired delete** — check the head before every push.
- ★★ **The console is not the party** (`REQ-UIX-053`): no motion, no `transition`, no object, no sticker, no moment;
  `h1` in the display face the only display use. `console-register.test.ts` **is not edited this wave**.
- ★★ **No new primitive.** `ui/` stays 63 files; `ui-playground.test.ts` is untouched. A pattern three pages share is a
  contract, not a file in `ui/`.
- ★ **No explainer copy** (`DEC-NEXT-25`): a word or a number; state in the row; nothing shown when nothing needs doing.
- ★★ **`registrations` is never touched; the five public routes do not move.** None of the fifteen screens is public.
- ★ **The existing suites are evidence**; each changed assertion is a ledger line in `STATUS.md`, in the same commit.
- ★ **No new dependency.** **No migration beyond the lead's two**; a function a plan needs goes under
  `supabase/proposed/<you>/`, promoted by the lead.
- **Teammates spawn planning-only**; sync 1 approves five plans with their kept-behaviour tables and audit rows;
  **nobody deletes a file before the lead posts «the plans are approved».**
- **One writer per file, specs and demos included. `ui-lint --strict` has no allowlist and never gains one.**
- **Captures land at `.qa-shots/rtl/wave22-<track>-<screen>-<state>-<1280|390>.png`** from a production build the row
  names by commit, honouring `E2E_SHOTS_DIR`; the lead opens every one beside the artboard, in bands, never downscaled.
- **Not this wave, and never-touch for every teammate:** `SCR-045` and `055` – `059` with the studio, the email studio
  and the brand kit; `/app/platform/**`; the five public routes; ★ stories, their viewer and `story_views` — the ring
  stays inert; the member app's screens; the hard-load fix (`DEC-204`); `DEC-194`'s two gates; `DEC-186` §4;
  `DEC-215`'s carried four; a company logo or domain; a badge revoke; dropping `sessions.host_company_id`.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`, `stop`,
  branch switches, worktrees, pushes and the PRs.

### Ownership map (wave 21 — M11a, the console's first batch, DEC-225 · DEC-226 · DEC-227) — ★ THE RECORD OF A FINISHED WAVE

> Wave 21 merged as PRs #44 (`8ba2554b`) and #45 (`69438aa2`). Its map is kept as the record; **wave 22's map is directly above** (`DEC-230`, `DEC-231`).

**The programme's seventh wave, and the first that rebuilds the CONSOLE** (milestone **M23**). ★★ **The owner put the
console before stories** (`DEC-225` §1) — the third deliberate re-ordering; wave 18's ring stays inert and nobody wires
it. Five screens from six artboards in `docs/design/screens/m11a/`, specified by `docs/design/screens/M11a.md` and
corrected by the brief, `DEC-225` §4 and `DEC-227`: the dashboard (`040`), the proposal queue as a split view (`041`),
the sessions table with its bulk bar and phone stack (`042`), and the session hub's الجدولة and الحضور tabs (`043`,
`044`). ★ **No migration is expected**; one needed after all is named in a plan and written by the lead from `0179`.

★★ **THE GOAL, above the process** (`DEC-227` §0, the owner's words): **build the console an admin can run the org
from.** An admin opens `/app/admin` and **sees what needs their attention and reaches it in one move**; **decides a
proposal without leaving the list**, with the content-edit diff beside the abstract so nobody decides on stale text;
**finds, filters and acts on sessions in bulk** at 1280, and **uses the same rows as cards on a phone**; **runs
attendance live** — the code, its rotation, the switch, a manual check-in with its reason, a revoke that writes
`DEC-172`'s reversal. And it is **the sober register** (`REQ-UIX-053`): the same product as the member app, behaving
like a tool, not a game. **«Good» is not «the gates are green».** A plan that reads like five screens with green gates
has not absorbed this, and sync 1 sends it back.

★★ **Two PRs, both against `main` from their first push** (`DEC-225` §2): **A — `wave-21a/the-console-frame`**: the
frame, `ui/admin-rail` (the old file deleted), `split-view` and `kv-card`, `040`, `042`, the gate 60 → 63, the register
test's one amendment. **B — `wave-21b/the-queues`**: `041`, `043`, `044`. **Five demonstrables:** ★★ every screen at
**1280** — and `042` at 390 — **held beside its artboard and opened by the lead**; ★★ a kept-behaviour table per screen
(`DEC-208`); ★ the rail **counted** — twenty for an admin, `REQ-ADM-020`'s for a moderator, none for a member, no
unbuilt item; ★ `console-register` green, amended once and stricter; ★ `qa:contract` and the register-form fingerprint
unmoved. **The acceptance is the owner's, at 1280 on a real screen and at 390.**

★ **Why it is divided this way** (`DEC-227` §4): **each screen goes to the track that owns its data**, so every
contract is a read. `console` owns `admin-dashboard.ts` — whose four `attention` rows **are** the artboard's four tiles —
`data-table`, and the sessions list's own files, so it takes `040` and `042`. `sessions` owns `proposals.ts` (the
decision, and the diff the artboard draws) and the schedule, the hub's layout and its strip (`DEC-178`), so it takes
`041`, `043`, the hub's header, and the two primitives those screens are built on. `checkin` owns attendance, the code,
the switch, the manual mark and the removal that writes the reversal, so it takes `044`. The frame, the rail and the
gate are the lead's because they touch every screen. **Four plans — the lead's and three teammates' — are approved at
sync 1.**

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-227`, this map, the ten agent files, `01`/`04`/`09`/`14`/`15`, `STATUS` · ★★ **contract 1, the console frame, first** (`STORY-UIX-074`): the 52 px bar, the rail, the sheet, the page's padding · ★★ **`ui/admin-rail`**, and `src/components/admin/admin-rail.tsx` **deleted** with its kept-behaviour table (`DEC-213` §4) · ★ **`console-register.test.ts` amended once** (`DEC-227` §2) · ★ **as custodian, in PR B**: `[id]/{certificates,survey}/page.tsx` lose their own breadcrumb and title when the hub's header lands (contract 4), and nothing else in them moves · ★ **contract 2**: `ui/index.ts`'s three signatures, the registry, the floor 60 → 63, each demo wired · every capture opened beside its artboard · the a11y sweep · the gates, both PRs | the lead-only paths below, ★ `src/app/[locale]/app/admin/layout.tsx` (**from `console`, this wave**), ★ new `src/components/ui/admin-rail.tsx` with its test, `-scope` test and demo, ★ `tests/components/admin/admin-rail*.test.tsx` (evidence — deleted with the file, each a ledger line), ★ `tests/unit/console-register.test.ts` (**the one amendment**), `src/app/[locale]/app/layout.tsx`, `src/components/shell/**`, `src/app/globals.css`, the lead's `ui/` files, `ui/index.ts`, `src/app/[locale]/(dev)/ui/{page,playground,ground}.tsx`, `src/messages/*/{ui,app}.json`, `tests/unit/{ui-playground,scope-root,no-raw-palette,tokens-only,public-graph,design-files}*`, `tests/e2e/{a11y,shell-*,frozen-routes,console}*.spec.ts`, new `tests/e2e/wave21-{demo,lead}-*.spec.ts`, `docs/design/**`. **Custodian** of every file of a track not spawned — `content`, `designer`, `event`, `notify`, `platform`, `branding`, `scoring` — edited only for its own rows or on a teammate's written request; ★ a string the frame needs in `admin.json` is `console`'s edit, on the lead's written list |
| `console` | opus | ★★ **`SCR-040`, the dashboard** (`REQ-UIX-086`, `STORY-UIX-076`, PR A) — «يحتاج انتباهك» from the four `attention` rows, every figure a link · ★★ **`SCR-042`, the sessions table, its bulk bar and its phone stack** (`REQ-UIX-087`, `STORY-UIX-077`, PR A) — ★ **`data-table`'s stack and selection are composed, never rebuilt** · ★ **contract 3**: the attention counts, one read for the tiles and the rail's badges | `src/app/[locale]/app/admin/{page,loading,error}.tsx`, the **top level** of `src/app/[locale]/app/admin/sessions/` (never `[id]/**`), `src/lib/dal/admin*.ts`, ★ `src/app/api/admin/exports/[type]/route.ts` (add-only `ids`, `DEC-228` §3.10), `src/components/admin/**` **except** `admin-rail.tsx` (the lead deletes it) and `delivery-reason.ts`, its six `ui/` files (`data-table` **add-only**), `src/messages/*/admin.json`, `supabase/proposed/console/**`, `tests/components/admin/**` except `admin-rail*` and `emails-page.test.tsx`, `tests/unit/admin*` except `admin-emails.test.ts`, `tests/e2e/admin-{dashboard,sessions}.spec.ts` and `tests/e2e/wave17-console-screens.spec.ts` (evidence), new `tests/e2e/wave21-console-*.spec.ts`, `docs/plan/notes/console.md`. **Nothing else** — every other admin route is frozen; `admin.proposals.*` is deleted on `sessions'` request once its keys have moved |
| `sessions` | opus | ★ **`ui/split-view`** and **`ui/kv-card`**, new (`REQ-UIX-085`, `STORY-UIX-075`, PR A) · ★★ **`SCR-041`, the proposal queue as a split view** (`REQ-UIX-088`, `STORY-UIX-078`, PR B) — ★★ **the diff measured first** (`DEC-227` §5.1) · ★★ **`SCR-043`, the hub's header and الجدولة, read by default** (`REQ-UIX-089`, `STORY-UIX-079`, PR B) · ★ **contract 4**: the hub's header, and the mechanism that carries a tab's primary into it | ★ `src/app/[locale]/app/admin/proposals/**` (**from `console`, this wave** — with a new `[id]/`), `src/app/[locale]/app/admin/sessions/[id]/{layout,page,loading,error}.tsx` and `[id]/schedule/**`, `src/components/sessions/**`, `src/components/proposals/**`, new `src/components/hub/**` if it wants one for the header, `src/lib/dal/{sessions,proposals}.ts` (add-only), `src/messages/*/{proposals,schedule,sessions}.json`, `supabase/proposed/sessions/**` (functions only), new `src/components/ui/{split-view,kv-card}.tsx` with their tests, `-scope` tests and demos, `tests/components/sessions/**`, `tests/components/proposals/**`, ★ `tests/components/admin/proposals-review-card.test.tsx` (**from `console`**, evidence), `tests/unit/{sessions,schedule-rules,schedule-actions}*`, `tests/rls/{sessions,proposals,session-presenters}*.test.ts` (evidence), `tests/e2e/{admin-proposals,sessions-admin-proposals,wave8-lead-schedule,wave9-sessions-schedule-days,checkin-schedule-walk-ins}.spec.ts` (evidence), new `tests/e2e/wave21-sessions-*.spec.ts`, `docs/plan/notes/sessions.md`. **Nothing else** — the event page, browse, propose, my proposal and the public card are frozen |
| `checkin` | opus | ★★ **`SCR-044`, attendance, live** (`REQ-UIX-090`, `STORY-UIX-080`, PR B) — the code card, the switch, the manual check-in in a `sheet` with its reason, ★ **the revoke through the existing removal and `DEC-172`'s reversal, never a new mechanism**, faces allowed (`DEC-099`'s host placement) | `src/app/[locale]/app/admin/sessions/[id]/attendance/**`, `src/components/checkin/**`, `src/lib/dal/{rsvp,checkin}.ts` (add-only), `src/messages/*/{rsvp,checkin}.json`, `supabase/proposed/checkin/**` (functions only), `tests/components/checkin/**` except `schedule-form.test.tsx`, `tests/unit/{session-matrix,checkin-*}*`, `tests/rls/{rsvp,checkin,priority-rsvp}*.test.ts` (evidence), `tests/e2e/{admin-attendance,wave11-console-attendance}*.spec.ts` (evidence), new `tests/e2e/wave21-checkin-*.spec.ts`, `docs/plan/notes/checkin.md`. **Nothing else** — check-in, the host view and the rotation are frozen; what check-in decides does not change |

**Wave-21 contracts.**

1. **Lead → everyone — the console frame** (`REQ-UIX-084`, `STORY-UIX-074`). The admin layout draws the 52 px bar, the
   rail and, under `lg`, the sheet behind ≡; the page sits beside the rail at 24 px padding. **A page renders nothing
   of the frame**: its own `h1` row with its one primary action at the end, and its content. ★ **It lands before any
   track builds a screen**; the lead posts «the frame is in at `<sha>`».
2. **Lead → everyone — the signatures and the gate.** Each owner names its primitive's props in its plan; the lead
   lands the three as types after sync 1, with the registry entries; **the floor moves 60 → 63** in the commit that
   adds the third. **All three land in PR A**, ahead of the screens that use them. `console-register.test.ts`'s
   no-animation case gains all three in that commit (`DEC-227` §2).
3. **`console` → lead — the attention counts.** One DAL read in `admin-dashboard.ts` — the four `attention` rows, count
   and oldest age, filtered by role — feeds `040`'s tiles **and** the rail's badges. The layout calls it once; a badge
   is never drawn at 0. **Name and type in `console`'s note on day one.**
4. **`sessions` → `checkin` — the hub's header.** The hub layout draws the breadcrumb, the `h1`, the status badge, the
   tab's actions and the five tabs, in the artboard's order, above the tab's page; ★ **«المحتوى» opens the event page**
   and «صفحة الجلسة» moves into the header (`DEC-227` §5.3). `044`'s «شاشة التقديم» reaches the header through the
   mechanism `sessions` publishes in its note on day one; **`checkin`'s page renders nothing of the header.**
   `DEC-178`'s redirect is unchanged. ★ The survey and certificates tabs (`event`'s and `designer`'s, unspawned) drop their
   own header in the same PR — the lead's edit as their custodian.
5. **`sessions` → lead — the diff's data** (`DEC-227` §5.1). `sessions`' plan says what is recorded of a proposal's
   edits today and what the split view reads. **A table, a column or a trigger is the lead's, from `0179`**; nobody
   builds a member-readable history (`DEC-215`).
6. **Everyone — the artboard is the specification, and `DEC-225` §4 with `DEC-227` §5 is the list of what it draws
   that is not built.** A new disagreement is written in your note with the artboard and the line; nobody picks a side.
   No class, id or markup pattern from a `.dc.html` in `src/`.
7. **Everyone — every figure is read, and every action keeps its authority.** A count, an age, a rate, a capacity —
   never a literal. A bulk action does only what the single-row action does, through the same function; an export
   goes through the audited export path; a revoke writes the existing reversal.

**Wave-21 rules.**

- ★★ **Rebuilt, never restyled; deleted first** (`DEC-199` §2, `DEC-208`). Two commits per screen — a delete, then a
  create — and the kept-behaviour table in the note **before** the create commit, read against the new file after it.
  **The console holds the oldest surviving markup in the product** (wave 6, regrouped in wave 7): **expect the rule to
  find behaviours nobody remembers, and treat each as a defect of the rebuild.**
- ★★ **The console is not the party** (`REQ-UIX-053`): the palette, the radii and the type; `h1` in the display face
  the only display use; **no motion, no objects, no stickers, no moment, nothing scales on hover.** The register's test
  is amended once, by the lead, and only to read more.
- ★★ **`data-table`'s phone stack and selection exist** (`data-table.tsx:10-13`, `:70-83`). **A plan that proposes a
  phone stack has not read the file.** The bulk bar composes the selection; the primitive changes add-only, if at all.
- ★ **`details` is not a primitive** — the HTML `<details>` element. **Three new files, not four.**
- ★ **No explainer copy** (`DEC-NEXT-25`): a word or a number, never a sentence; state lives in the row; nothing is
  shown when nothing needs doing. Every new string in `messages/ar/` first.
- ★★ **`registrations` is never touched; the five public routes do not move.** None of the five screens is public.
- ★ **The existing suites are evidence**; each changed assertion is a ledger line in `STATUS.md`, in the same commit.
- ★ **No new dependency.** `package.json` is the lead's. **No migration beyond what contract 5 names**, from `0179`,
  rehearsed by the owner on a dump taken at `0178` before the push.
- **Teammates spawn planning-only**; sync 1 approves four plans with their kept-behaviour tables; **nobody deletes a
  file before the lead posts «the plans are approved» and «the frame is in».**
- **One writer per file, specs and demos included. `ui-lint --strict` has no allowlist and never gains one.**
- **Captures land at `.qa-shots/rtl/wave21-<track>-<screen>-<state>-<1280|390>.png`** from a production build the row
  names by commit, honouring `E2E_SHOTS_DIR`; the lead opens every one beside the artboard, in bands, never downscaled.
- **Not this wave, and never-touch for every teammate:** `SCR-045` (M12); `046` – `065` (M11b), with
  `company_min_active_members`' control (`DEC-220` §1.3); the studio and `/app/platform/**`; the five public routes;
  ★ stories, their viewer and `story_views` — the ring stays inert; the member app's screens; the hard-load fix
  (`DEC-204`); `DEC-194`'s two gates; `DEC-186` §4; `DEC-215`'s carried four; a company logo; tags (`DEC-076`).
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`, `stop`,
  branch switches, pushes and the PRs.

### Ownership map (wave 20 — M10c, the last batch of member screens, DEC-216 · DEC-217) — ★ THE RECORD OF A FINISHED WAVE

> Wave 20 merged as PRs #41 (`a3d2308b`), #42 (`04cb8023`) and #43 (`a405abff`). Its map is kept as the record; **wave 21's map is directly above** (`DEC-225`, `DEC-227`).

**The programme's sixth wave, and the third that rebuilds screens** (`DEC-216`, milestone **M22**). Nine screens from
eleven artboards in `docs/design/screens/m10c/`, specified by `docs/design/screens/M10c.md`: the `/app/me` hub and its
five pages (`021` – `025`), the inbox (`026`), the two boards (`027`, `028`) and ★ **`/app/me/settings` (`029`), a new
route**. ★★ **The last designed batch of the member app: when it merges the standing order («WE BUILD WHAT HAS A
DESIGN») has no screens left, so session stories land next unless the owner says otherwise** — and wave 18's ring stays
inert; nobody wires it. ★ **The owner ruled twice on 2026-10-02** (`DEC-216` §2): **`status-mark` stays withdrawn** —
three primitives, `podium`, `settings-group`, `ledger-row`, floor **57 → 60** — and **the weekly board computes live**,
its movement «منذ زيارتك الأخيرة» read against `member_seen_marks`. **One migration, `0169`** — `weekly_period` and
`weekly_rank`, nullable, the lead's, landed at Step 0.

★★ **Two PRs** (`DEC-216` §3): **A — `wave-20a/the-hub`**: the hub frame, `021` – `025`, the three primitives, `0169`,
the copy trim. **B — `wave-20b/the-boards`**: `026`, `029`, `027`, `028` — cut from A's head and ★★ **retargeted to
`main` BEFORE A merges with `--delete-branch`** (PR #36 died of exactly that). The checklist is `STATUS.md`'s wave-20
block. **Six demonstrables:** ★★ every screen at 390 — and the hub at 1280 — **held beside its artboard and opened by
the lead**; ★★ a kept-behaviour table per screen (`DEC-208`); ★ every preference `preference-matrix` wrote still
written, by a test; ★ this week summed live and its movement read against the member's last visit, by a test; ★ the
hard-load duplicate re-measured on `/app/me/points` and `/app/leaderboards` (`DEC-204`, recorded not fixed); ★
`qa:contract` and the register-form fingerprint unmoved. **The acceptance is the owner's, on a phone.**

★ **Why it is divided this way** (`DEC-217` §2): **each screen goes to the track that owns its data and its message
namespace**, so no screen needs another track's write and every contract below is a read. `scoring` owns the ledger,
the boards and the seen marks, so it takes `022`, `027`, `028`, the standing card every hub page draws, and the two
primitives that draw a ledger row and a podium. `notify` owns preferences, the inbox and calendar sync, so it takes
`025`, `026`, `029` and `settings-group`, which replaces its own `preference-matrix`. `content` built the profile form
and the hub's pages in wave 7 and owns `me/actions.ts`, so it takes `021`, `024` — and ★ `023` **by transfer**: its
substance, the audited download route and the certificate DAL, is `designer`'s and does not change; spawning `designer`
for one list would cost a teammate for a page. The frame, the gate, `0169` and the copy trim are the lead's because
each touches every track. **`sessions` is not spawned**: bookmarks read its DAL and import browse's row unchanged — a
change to either is a request, held by the lead as custodian.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-217`, this map, the ten agent files, `01`/`09`/`14`/`15`, `STATUS` · ★★ **`0169`** and its cases in `tests/rls/scoring-seen.test.ts` (Step 0) · ★★ **contract 1, the hub frame, first** (`STORY-UIX-059`): `me/layout.tsx` and `components/me/tab-strip.tsx` deleted and rebuilt — the phone's own top row on the hub, settings and the boards, the strip, the desktop standing band from `scoring`'s component, no game rail; `shell-routes.ts`'s entries · ★ **contract 2**: `ui/index.ts`'s three signatures, the registry, the floor 57 → 60, each demo wired · ★ **the copy trim** (`STORY-UIX-067`), the list confirmed by the owner first · every capture opened beside its artboard · the owed hard-load measure · the a11y sweep · the gates, both PRs | the lead-only paths below, ★ `src/app/[locale]/app/me/{layout,loading,error}.tsx` and `src/components/me/tab-strip.tsx` (**from `content`, this wave**), `src/app/[locale]/app/layout.tsx`, `src/components/shell/**`, `src/app/globals.css`, the lead's `ui/` files, `ui/index.ts`, `src/app/[locale]/(dev)/ui/{page,playground,ground}.tsx`, `src/messages/*/{ui,app}.json`, ★ `tests/rls/scoring-seen.test.ts` **for `0169`'s cases only**, `tests/unit/{ui-playground,scope-root,no-raw-palette,tokens-only,public-graph,design-files}*`, `tests/e2e/{a11y,shell-*,frozen-routes}*.spec.ts`, new `tests/e2e/wave20-{demo,lead}-*.spec.ts`, `docs/design/**`. **Custodian** of every file of a track not spawned — `sessions`, `checkin`, `console`, `designer`, `event`, `platform`, `branding` — edited only for its own rows or on a teammate's written request; ★ for the copy trim, a string in a spawned track's namespace is that track's edit, on the lead's written list |
| `content` | opus | ★ **`SCR-021`, my profile, read and edit, phone and desktop** (`REQ-UIX-071`, `STORY-UIX-062`) — ★ **the opt-out stays in edit mode until `029` lands it** (`DEC-217` §3.1) · ★ **`SCR-023`, my certificates** (`REQ-UIX-073`, `STORY-UIX-064`) · ★ **`SCR-024`, bookmarks** (`REQ-UIX-074`, `STORY-UIX-065`) | `src/app/[locale]/app/me/{page.tsx,actions.ts,state.ts}` (the profile's), `src/app/[locale]/app/me/bookmarks/**`, ★ `src/app/[locale]/app/me/certificates/**` (**from `designer`, this wave** — the download route and `lib/dal/certificates.ts` stay `designer`'s, read only), `src/components/me/**` **except** `tab-strip.tsx`, `src/messages/*/profile.json`, the list's keys in `src/messages/*/certificates.json` (★ from `designer`, this wave), `tests/components/me/**` (evidence), new `tests/e2e/wave20-content-*.spec.ts`, `docs/plan/notes/content.md`. **Nothing else** — materials, photos, tasks, the viewer, the feed, the discussion and the upload routes are frozen |
| `notify` | opus | ★ **`SCR-025`, the calendar** (`REQ-UIX-075`, `STORY-UIX-066`, PR A) · ★ **`ui/settings-group`**, new (PR A) · ★ **`SCR-026`, the inbox** (`REQ-UIX-076`, `STORY-UIX-068`, PR B) · ★★ **`SCR-029`, settings, a new route** (`REQ-UIX-077`, `STORY-UIX-069`, PR B) — **`preference-matrix.tsx` deleted, every preference it wrote still written**; the opt-out moved in from `021` in the same commit | `src/app/[locale]/app/me/{notifications,calendar}/**`, ★ new `src/app/[locale]/app/me/settings/**`, `src/components/{notifications,calendar}/**` (the bell's shell placement is the lead's), new `src/components/settings/**`, `src/lib/dal/{notifications,calendar}.ts` (add-only), `src/messages/*/{notifications,calendar}.json`, ★ new `src/messages/*/settings.json` if it wants one (its line in `src/messages/index.ts` is the lead's), new `src/components/ui/settings-group.tsx` with its test, `-scope` test and demo, `tests/components/{notifications,calendar}/**` (evidence), `tests/rls/{notify,notifications}*.test.ts` (evidence), new `tests/components/settings/**`, new `tests/e2e/wave20-notify-*.spec.ts`, `docs/plan/notes/notify.md`. **Nothing else** — `notify()`, the mail, the email studio, the worker tasks and the matrix's SQL are frozen; a preference is still written by the function that writes it today |
| `scoring` | opus | ★ **`SCR-022`, my points, phone and desktop** (`REQ-UIX-072`, `STORY-UIX-063`, PR A) — the cap an explanation, never a row; the reversal pair through an add-only `sourceId` · ★ **the standing card and band** (contract 3, PR A) · ★ **the week, live** — an add-only definer function and DAL read, in PR A because `021`'s standing card shows this week's rank · ★ **`ui/ledger-row`** and **`ui/podium`**, new (PR A) · ★ **`SCR-027`, the boards** (`REQ-UIX-078`, `STORY-UIX-070`, PR B) — the weekly seen pair through `mark_board_seen()`; ★ `leaderboards.ts:512`'s «week» stops reading the month · ★ **`SCR-028`, the company race** (`REQ-UIX-079`, `STORY-UIX-071`, PR B) | `src/app/[locale]/app/me/points/**`, ★ `src/app/[locale]/app/leaderboards/**`, `src/components/scoring/{member-board,company-board,company-points-breakdown}.tsx` and `src/messages/*/leaderboards.json` (**from `sessions`, this wave**), `src/components/scoring/**`, new `src/components/hub/**` (the standing card and band), `src/lib/dal/{points,leaderboards,recognition}.ts` (add-only), `src/messages/*/scoring.json`, `supabase/proposed/scoring/**` (functions only), new `src/components/ui/{ledger-row,podium}.tsx` with their tests, `-scope` tests and demos, `src/components/ui/{rank-row,race-bar,level-card,week-hud,badge-medallion}.tsx` (add-only), `tests/components/{scoring,leaderboards}/**`, `tests/unit/scoring*`, `tests/rls/{scoring,points,leaderboards}*.test.ts` (evidence; `scoring-seen` after the lead's Step-0 cases), `tests/e2e/{points,leaderboards,wave7-sessions-leaderboards,scoring-company-points}.spec.ts` and `tests/e2e/wave{9,12,16}-scoring-*.spec.ts` (evidence), new `tests/e2e/wave20-scoring-*.spec.ts`, `docs/plan/notes/scoring.md`. **Nothing else** — the ledger, the awards, the eight worker tasks, the snapshots and what a balance, level or rank **is** are frozen |

**Wave-20 contracts.**

1. **Lead → everyone — the hub frame** (`REQ-UIX-070`, `STORY-UIX-059`). A hub page draws its own phone top row and the
   phone strip through the lead's `HubTopRow` and `HubStrip` (`src/components/shell/`); from `lg` the layout renders
   the standing band and the strip above the page — the artboards put the strip under the title on a phone and above
   it on desktop, so one strip in the layout would read out of order (the lead's note, F1). **A page renders nothing of the shell and nothing of the frame.** `shell-routes.ts`
   gives `/app/me/**` and `/app/leaderboards/**` their own phone top row; no hub page passes a game rail.
   ★ **It lands before any track builds a screen**; the lead posts «the frame is in at `<sha>`».
2. **Lead → everyone — the signatures and the gate.** Each owner names its primitive's props in its plan; the lead
   lands the three as types after sync 1, with the registry entries; **the floor moves 57 → 60** in the commit that
   adds the third. **All three land in PR A**, `podium` and `settings-group` ahead of their screens.
3. **`scoring` → lead and `content` — the standing.** One component in `src/components/hub/` with two forms — the
   phone's card (on `021`, placed by `content`'s page) and the desktop band (placed by the lead's layout) — and the
   DAL read behind it: avatar, name, title, company, level, points, distance, this week's rank, the streak, the badge
   count. Moments 3 and 5 render on it through the existing keying. **Names and types in `scoring`'s note on day one.**
4. **`scoring` → `content` and the lead — this week.** One add-only function: the member's rank and points for the
   org's current week, summed live from `points_ledger`; opt-out honoured in the DAL; **a missing rank is an absence**.
   The week runs **Saturday to Friday in the org's time zone**, as the artboard's «حتى الجمعة» draws (`DEC-217` §3.4).
5. **`notify` ← `content` — the opt-out moves once.** `021`'s edit mode keeps the leaderboard opt-out until `029`
   exists; `notify`'s create commit for `029` adds the switch **and** asks `content` (through the lead) to remove the
   field in the same PR, so no deployment of `main` lacks a way to opt out (`REQ-LDR-008`, invariant 4). The write
   stays the function that writes it today.
6. **Everyone — the artboard is the specification, and `DEC-216` §5 with `DEC-217` §4 is the list of what it draws
   that is not built.** A new disagreement is written in your note with the artboard and the line; nobody picks a
   side. No class, id or markup pattern from a `.dc.html` in `src/`.
7. **Everyone — every figure is read.** A cap, an amount, a rank, a count, the minimum of active members — never a
   literal; a `+0` is never drawn; the cap row's `0` is the one zero the screen draws, and it is computed.

**Wave-20 rules.**

- ★★ **Rebuilt, never restyled; deleted first** (`DEC-199` §2, `DEC-208`). Two commits per screen — a delete, then a
  create — and the kept-behaviour table in the note **before** the create commit, read against the new file after it.
  The hub's pages are the oldest markup in the member app: **expect the rule to find dropped behaviours.**
- ★★ **`preference-matrix` dies with its behaviour accounted for** (`DEC-216` §5.16): every row of its kept-behaviour
  table names the `REQ-*` that keeps it; its test is evidence; a toggle that silently stops writing is the failure.
- ★★ **No ledger row for an explanation** (`DEC-216` §5.5, `points.ts:52`): the cap is computed for the screen, built
  like `MissedAttendance`. No view, no table, no migration.
- ★★ **No glyph vocabulary** (`DEC-216` §2.1): no `status-mark`; state lives in the row; nothing is shown when nothing
  needs doing. ✓✓ «محفوظ» is plain text with a glyph.
- ★ **The non-optional categories are one sentence, never rows** — `08` §1.7's seventeen and §2's «on (not
  switchable)» (`DEC-216` §5.15).
- ★ **No sixth moment**: the podium is static; moments 3 and 5 on the standing card, 5 on the rank card, through the
  existing keying. A failure never animates; nothing scales on hover.
- ★ **No explainer copy** (`REQ-UIX-080`): every new string is tested against «does it change what the person does
  next» before it is written, in `messages/ar/` first.
- ★★ **`registrations` is never touched; the five public routes do not move.** None of the nine is public.
- ★ **The existing suites are evidence**; each changed assertion is a ledger line in `STATUS.md`, in the same commit.
- ★ **No new dependency.** `package.json` is the lead's. **No migration beyond `0169`**; one needed after all is
  named in a plan and written by the lead from `0170`.
- **Teammates spawn planning-only**; sync 1 approves three plans with their kept-behaviour tables; **nobody deletes a
  file before the lead posts «the plans are approved» and «the frame is in».**
- **One writer per file, specs and demos included. `ui-lint --strict` has no allowlist and never gains one.**
- **Captures land at `.qa-shots/rtl/wave20-<track>-<screen>-<state>-<390|1280>.png`** from a production build the row
  names by commit, honouring `E2E_SHOTS_DIR`; the lead opens every one beside the artboard, in bands, never downscaled.
- **Not this wave, and never-touch for every teammate:** ★ stories, their viewer and `story_views` — the ring stays
  inert; `/app/me/privacy` (M13); every console, studio and platform route; the five public routes; leagues; photo
  tagging; ★ the hard-load defect's **fix** (`DEC-204` — measured, by the lead, not fixed); `DEC-194`'s two gates;
  `DEC-186` §4; `DEC-215`'s carried four; a company logo; folding `025` into `029` (the owner's, `DEC-216` §6.1).
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`, `stop`,
  branch switches, pushes and the PRs.

### Ownership map (wave 19 — M10b, the second batch of member screens, DEC-213) — ★ THE RECORD OF A FINISHED WAVE

> Wave 19 merged as PR #40 (`2333276b`). Its map is kept as the record; **wave 20's map is directly above** (`DEC-216`, `DEC-217`).

**The programme's fifth wave, and the second that rebuilds screens** (`DEC-213`, milestone **M21**). ★ **The owner
put M10b before stories** (`DEC-213` §1) — the second deliberate re-ordering after `DEC-205`'s. ★★ **The standing order,
in the owner's words: WE BUILD WHAT HAS A DESIGN.** As long as the designer session keeps producing screen batches,
screens go first; stories lands when the batches run out or when the owner says so. Stories was not demoted — it was
overtaken by work that became buildable; stories stay unbuilt
and **wave 18's ring still opens nothing — nobody wires it**. Six screens from eight artboards in
`docs/design/screens/m10b/`, specified by `docs/design/screens/M10b.md`, which extends `M10a.md` §0 and §10.
**One PR: `wave-19/m10b`**, against `main` from its first push (`DEC-213` §3). No migration is expected; one written
after all starts at **`0168`** with its `REQ-*` and its five parts. The checklist is `STATUS.md`'s wave-19 block.
**Five demonstrables:** ★★ every screen at 390 — and at 1280 for `013` and `020` — **held beside its artboard and opened
by the lead**; ★★ **a kept-behaviour table per screen** (`DEC-208`); ★ the viewer's direction **proved by a test**;
★ a denied member receives **no download URL**; ★ `qa:contract` and the register-form fingerprint unmoved. **The
acceptance is the owner's, on a phone.**

★★ **The two rules the wave is judged on, both earned in wave 18:** **(1) a screen is REBUILT to its design, never
restyled** (`DEC-199` §2). **(2) ★★ its page file is DELETED FIRST, then written from its artboard — two commits — and
the story lists what it kept and which requirement made it keep it** (`DEC-208`). Rule 2 found three silently dropped
behaviours in wave 18; **expect it to find things here, and treat each as a defect of the rebuild.**

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-213`, this map, the ten agent files, `01`/`09`/`14`/`15`, `STATUS` · ★★ **contract 1, the frame's four additions, first** (`STORY-UIX-051`): the viewer full-screen at every width; own top rows on the phone for rate, propose, the proposal, the directory and the profile; the rail's «الأعضاء» and the account menu's, «حسابي» no longer current on another's profile, the raised «اقترح» current in bone; `PageFrame`'s add-only owned width · ★ **contract 2**: `ui/index.ts`'s four signatures, the registry, the floor 53 → **57**, each demo wired · ★★ **every capture opened beside its artboard** · the a11y sweep · the gates, the PR | the lead-only paths below, `src/app/[locale]/app/layout.tsx`, `src/components/shell/**`, `src/app/globals.css`, the lead's `ui/` files, `ui/index.ts`, `src/app/[locale]/(dev)/ui/{page,playground,ground}.tsx`, `src/messages/*/{ui,app}.json`, `tests/unit/{ui-playground,scope-root,no-raw-palette,tokens-only,public-graph,design-files}*`, `tests/e2e/{a11y,shell-*,frozen-routes}*.spec.ts`, new `tests/e2e/wave19-{demo,lead}-*.spec.ts`, `docs/design/**`. **Custodian** of every file of a track not spawned — `checkin`, `console`, `designer`, `notify`, `platform`, `branding` — edited only for its own rows or on a teammate's written request |
| `content` | opus | ★ **`SCR-013`, the viewer, phone and desktop** (`REQ-UIX-065`, `STORY-UIX-053`) · ★ **`ui/page-viewer`**, new — **and `src/components/viewer/page-viewer.tsx` deleted** (`DEC-213` §4): one thing called page-viewer · ★ the direction test and the no-URL test · **contract 3**: photos by uploader | `src/app/[locale]/app/sessions/[id]/materials/[materialId]/**`, `src/components/viewer/**`, new `src/components/ui/page-viewer.tsx` with its test, `-scope` test and demo, `src/lib/dal/{materials,photos}.ts` (add-only), the viewer's keys in `src/messages/*/materials.json`, `tests/components/viewer/**`, `tests/e2e/materials.spec.ts` (evidence), new `tests/e2e/wave19-content-*.spec.ts`, `docs/plan/notes/content.md`. **Nothing else** — the materials list, photos, tasks, the event page's slots, the feed and the upload routes are frozen |
| `event` | opus | ★ **`SCR-015`, rate** (`REQ-UIX-066`, `STORY-UIX-054`) — ★★ **the survey kept** (`REQ-SUR-004`, `DEC-213` §5.90) · ★ **`ui/star-input`**, new, replacing `star-rating.tsx` on this screen (§5.124) | `src/app/[locale]/app/sessions/[id]/rate/**`, `src/components/event/{star-rating,ratings}.tsx`, `src/components/survey/question-field.tsx` (fixes only), `src/lib/dal/{ratings,surveys}.ts` (add-only), `src/messages/*/{ratings,survey}.json`, new `src/components/ui/star-input.tsx` with its test, `-scope` test and demo, `tests/components/event/{ratings,star-rating}*`, `tests/components/survey/rate-form*`, `tests/e2e/{event-rate,wave7-sessions-rate,wave10-event-rate-survey}.spec.ts` (evidence), new `tests/e2e/wave19-event-*.spec.ts`, `docs/plan/notes/event.md`. **Nothing else** — the survey's authoring and results, the event page and its slot's placement are frozen |
| `sessions` | opus | ★ **`SCR-017` propose and `SCR-018` my proposal** (`REQ-UIX-067`, `STORY-UIX-055`, `056`) — the list above the form, the derived «مُجدوَل», a co-presenter added after submission (§5.102), the earn panel read from the rules (§5.96) · ★ **`ui/stepper`**, new · **contract 4**: the presented count | `src/app/[locale]/app/propose/**`, `src/components/sessions/{proposal-rules.ts,proposal-status-badge.tsx,remove-presenter.tsx}`, new `src/components/proposals/**`, `src/lib/dal/{proposals,sessions}.ts` (add-only), `src/messages/*/proposals.json`, `supabase/proposed/sessions/**`, new `src/components/ui/stepper.tsx` with its test, `-scope` test and demo, `tests/components/sessions/proposal-*`, `tests/unit/sessions-proposal-rules*`, `tests/rls/proposals*.test.ts`, `tests/e2e/{wave7-sessions-propose,wave7-sessions-proposal,sessions-propose,forms-propose}.spec.ts` (evidence), new `tests/e2e/wave19-sessions-*.spec.ts`, `docs/plan/notes/sessions.md`. **Nothing else** — the event page, browse, the public card, the session hub; `materials/{proposal-list,upload-form}` are `content`'s and a change is a request |
| `scoring` | opus | ★ **`SCR-019`, the directory — new** (`REQ-UIX-068`, `STORY-UIX-057`) · ★ **`SCR-020`, the profile, phone and desktop** (`REQ-UIX-069`, `STORY-UIX-058`) — tiering in the DAL, the month's rank, no colleague's average (§5.115), no level-up moment (§5.117) · ★ **`ui/badge-medallion`**, new | ★ `src/app/[locale]/app/members/**`, `src/lib/dal/members.ts`, `src/messages/*/members.json` (**from `sessions`, this wave**), new `src/components/members/**`, `src/lib/dal/{points,leaderboards,recognition}.ts` (add-only), `supabase/proposed/scoring/**` (functions only), new `src/components/ui/badge-medallion.tsx` with its test, `-scope` test and demo, ★ `tests/unit/sessions-member-profile.test.ts` and `tests/e2e/wave7-sessions-profile.spec.ts` (evidence, **from `sessions`**), new `tests/components/members/**`, new `tests/unit/members-*`, new `tests/e2e/wave19-scoring-*.spec.ts`, `docs/plan/notes/scoring.md`. **Nothing else** — the ledger, the awards, `SCR-022`, the boards and the week are frozen |

**Wave-19 contracts.**

1. **Lead → everyone — the frame's four additions** (`DEC-213` §3, `STORY-UIX-051`). A page renders its content and
   nothing of the shell; the viewer is full-screen; the five others draw their own phone top row; a page with no game
   rail says it owns its width. ★ **They land before any track builds a screen**; the lead posts «the frame is in at
   `<sha>`».
2. **Lead → everyone — the signatures and the gate.** Each owner names its primitive's props in its plan; the lead
   lands the four as types after sync 1, with the registry entries; **the floor moves from 53 to 57** in the commit
   that adds the fourth file.
3. **`content` → `scoring` — photos by uploader.** One add-only function in `src/lib/dal/photos.ts`: a member's
   visible photographs, newest first, a count and a few thumbnails, through RLS. Never a tagged photo.
4. **`sessions` → `scoring` — the sessions presented.** One add-only function in `src/lib/dal/sessions.ts`: the count
   (never `presented.length` — it was capped at 12, §5.120) and the rows with the attendance count. ★ **No average in
   it**; the profile reads `getPresenterAggregate()` for the self and admin tiers only.
5. **Everyone — the artboard is the specification, and `DEC-213` §5 is the list of what it draws that is not built.**
   Forty-five lines, each saying which document wins. **A new disagreement is written in your note with the artboard and
   the line; nobody picks a side.** No class, id or markup pattern from a `.dc.html` in `src/`.
6. **Everyone — every figure is read.** The earn panel's amounts, the rating threshold, the window, the co-presenter
   limit, a rank, a count — never a literal.
7. **`scoring` — tiering is the DAL's** (A33, `03` §5.1b). The directory and the profile show tier-1 fields because the
   DAL returns only those; **a component that filters is a component that leaks.**

**Wave-19 rules.**

- ★★ **Rebuilt, never restyled; deleted first** (`DEC-199` §2, `DEC-208`). Two commits per screen — a delete, then a
  create — and the kept-behaviour table in the note **before** the create commit, read against the new file after it.
- ★★ **The viewer's direction is a model, not a mirrored icon**: «next» at the inline-end, advancing, its glyph
  pointing left; ← next on desktop. The tree had it backwards (`DEC-213` §4) — the test is the fix's proof.
- ★★ **Stars fill from the right**; each star a real radio in a radio group; ← increases.
- ★ **The anonymity notice tells the whole truth**, the admin exception included (D36, OQ-009).
- ★ **No gendered verb about a member** (`DEC-213` §5.109). Six ICU plural forms wherever a count appears.
- ★★ **`registrations` is never touched; the five public routes do not move.** None of the six is public; if a shared
  primitive changes, the lead proves the five did not.
- ★ **No sixth moment, and none moved**: no level-up on the profile (§5.117). A failure never animates; nothing scales
  on hover.
- ★ **The existing suites are evidence**; each changed assertion is a ledger line in `STATUS.md`, in the same commit.
- ★ **No new dependency.** `package.json` is the lead's.
- **Teammates spawn planning-only**; sync 1 approves four plans with their kept-behaviour tables; **nobody deletes a
  file before the lead posts «the plans are approved» and «the frame is in».**
- **One writer per file, specs and demos included. `ui-lint --strict` has no allowlist and never gains one.**
- **Captures land at `.qa-shots/rtl/wave19-<track>-<screen>-<state>-<390|1280>.png`** from a production build the row
  names by commit, honouring `E2E_SHOTS_DIR`; the lead opens every one beside the artboard, in bands, never downscaled.
- **Not this wave, and never-touch for every teammate:** ★ stories, their viewer and `story_views` — **the ring is not
  wired**; the hub, points and the boards (`021` – `028`, M10c); every console and studio route; the five public
  routes; photo tagging; autosave, a withdrawn state, a proposal history, the hosting gate's enforcement (`DEC-213`
  §6); a weekly board; ★ fixing or re-measuring the hard-load duplicate (`DEC-204`); the two carried gates (`DEC-194`);
  the overshoot ceiling (`DEC-186` §4); a company logo.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`, `stop`,
  branch switches, pushes and the PR.

### Ownership map (wave 18 — M10a, the first screens rebuilt to a design, DEC-205 · DEC-206) — ★ THE RECORD OF A FINISHED WAVE

> Wave 18 merged as PR #38 (`65d3dec7`) and PR #39 (`38181edd`). Its map is kept as the record; **wave 19's map is directly above** (`DEC-213`).

**The programme's fourth wave, and the first that rebuilds SCREENS** (`DEC-205`, `DEC-206`, milestone **M20**). Waves
15 – 17 built the visual language and proved it changed nothing. This wave builds nine screens from thirteen
artboards in `docs/design/screens/m10a/`, specified by `docs/design/screens/M10a.md`. The owner's gate is closed and
recorded in `DEC-205` §2: **wave 18 is M10a, not stories · five phone tabs and two desktop rails · home is the feed ·
the event hero is the whole poster at 4:5.** Nobody re-opens any of it. ★ **Two pull requests** (`DEC-206` §2):
**A — `wave-18a/the-frame`**: the shell, `SCR-002`/`003`/`004`, `SCR-007`, `SCR-010`, `SCR-011`, four new primitives
and `0164`. **B — `wave-18b/the-event`**: `SCR-012`, `SCR-014`, `SCR-016`, opened **against `main`** from its first
push. **This map is PR A's; B's tracks are named when B opens.** The checklist is `STATUS.md`'s wave-18 block.
**Four demonstrables:** ★★ every rebuilt screen at 390 px — and at 1280 where an artboard is drawn — **held beside
its artboard and opened by the lead**; ★ `qa:contract`, `visual`'s public pairs and the register-form fingerprint
unmoved; ★ `0164` with all five parts and the isolation sweep covering it; ★★ **the owner holding each screen beside
its artboard on a phone** — the acceptance is the owner's.

★★ **The rule the wave is judged on (`DEC-199` §2): a screen is REBUILT to its design, never restyled.** A screen is
built from its artboard — **its regions in the artboard's order**, its copy from `messages/ar/` first, its primitives
by the names in `M10a.md` §10. **Nothing in the current page file survives by default.** What survives: the data
layer, the server actions, the tests of behaviour, and every `REQ-*` the screen already satisfies. A plan or a story
that reads «restyle X to match» is written wrong.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-206`, this map, the ten agent files, `01`/`09`/`14`/`15`, `STATUS` · ★★ **contract 1, the frame, first**: the shell rebuilt — five tabs, the top bar, the navigation rail, the game rail's slot (`REQ-UIX-054`, `STORY-UIX-039`) · ★ **the door**: `SCR-002`, `003`, `004` (`REQ-UIX-058`, `STORY-UIX-042`) · ★★ **`0164` `feed_announcements`** with its five parts — `org_id`, RLS, the full policy set, a grant for every policy, its test and a fixture row for the sweep (`REQ-UIX-056`, `STORY-UIX-040`) — and `02`/`03` in the same commit · the attendance count's definer function, as `checkin`'s custodian (`DEC-206` §4.54) · the shell's attention counts, as `console`'s custodian (§4.32) · ★ **contract 2**: `ui/index.ts`'s signatures for the four primitives and the two additions, the registry, the gate's floor at 53, each demo wired · ★ the design gate (`REQ-UIX-063`) · ★★ **every capture opened beside its artboard** · the hard-load re-measure on `/app` (`STORY-UIX-047`) · the a11y sweep · the gates, the PR | the lead-only paths below, `supabase/migrations/**` from `0164`, `src/app/[locale]/app/layout.tsx`, `src/components/shell/**`, `src/app/[locale]/(auth)/**`, `src/lib/auth/**`, `src/app/globals.css`, the lead's `ui/` files, `ui/index.ts`, `src/app/[locale]/(dev)/ui/{page,playground,ground}.tsx`, `src/messages/*/{ui,app,auth}.json`, `tests/rls/{fixture*,feed-announcements*}.ts`, new `tests/unit/design-files.test.ts`, `tests/unit/{ui-playground,scope-root,no-raw-palette,tokens-only,public-graph}*`, `tests/e2e/{a11y,shell-*,auth*,frozen-routes}*.spec.ts`, new `tests/e2e/wave18-{demo,lead}-*.spec.ts`, `docs/design/**`. ★ **As custodian, add-only:** `src/lib/dal/admin-dashboard.ts` (the four counts alone), `src/components/notifications/bell.tsx`, `supabase/proposed/checkin/**`. **Custodian** of every file of a track not spawned — `checkin`, `console`, `designer`, `event`, `notify`, `platform`, `branding` — edited only for its own rows or on a teammate's written request |
| `sessions` | opus | ★ **`SCR-007`, the public card, rebuilt** (`REQ-UIX-059`, `STORY-UIX-043`) — `DEC-066`'s allowlist wins over the artboard · ★ **`SCR-011`, browse, rebuilt** (`REQ-UIX-060`, `STORY-UIX-045`) · ★ **`action-bar`**, new, and **`session-cta`'s phases as drawn**, add-only (`REQ-UIX-057`) · ★ **contract 3**: the session post's data and «التالية لك», published on day one | `src/app/[locale]/s/**` **except its layout**, `src/app/[locale]/app/sessions/{page,loading,error}.tsx`, `src/components/{browse,search}/**`, `src/lib/dal/{search,bookmarks}.ts`, `src/lib/dal/sessions.ts` (add-only), new `src/components/ui/action-bar.tsx`, `src/components/ui/session-cta.tsx`, their tests, `-scope` tests and demos under `(dev)/ui/demos/`, `src/messages/*/{browse,search}.json` and the public card's keys in `sessions.json`, `tests/components/{browse,search}/**`, `tests/unit/{timeline,search}*`, its existing e2e specs for browse and the public card (evidence), new `tests/e2e/wave18-sessions-*.spec.ts`, `docs/plan/notes/sessions.md`. **Nothing else in PR A** — the event page, its action card, `components/sessions/**`, the propose form and the hub are frozen until B |
| `content` | opus | ★★ **`SCR-010`, home as the feed, phone and desktop** (`REQ-UIX-055`, `STORY-UIX-044`) — a new page, a new read model, the feed's items in the artboard's order · ★ **`feed-item`** and **`attendee-stack`**, new, and **`card`'s `post` variant**, add-only (`REQ-UIX-057`) · the recap's photographs and materials line · the announcement item, read through RLS (contract 5) | ★ `src/app/[locale]/app/{page,loading,error}.tsx` (**from `sessions`, this wave**), new `src/components/feed/**`, new `src/lib/dal/feed.ts`, new `src/messages/*/feed.json` with its line in `src/messages/index.ts`, new `src/components/ui/{feed-item,attendee-stack}.tsx`, `src/components/ui/card.tsx`, their tests, `-scope` tests and demos, `src/lib/dal/photos.ts` (add-only), new `tests/components/feed/**`, new `tests/unit/feed*`, new `tests/e2e/wave18-content-*.spec.ts`, `docs/plan/notes/content.md`. **Nothing else in PR A** — materials, tasks, photos, the viewer, the discussion and the `/app/me` hub are frozen |
| `scoring` | opus | ★ **`week-hud`**, new (`REQ-UIX-057`) · ★ **the member's week** on the phone and **the game rail's cards** on desktop — the monthly rank with the neighbour above, the streak in months with the points, the company race (`DEC-206` §4.47 – §4.50) · ★ **the achievement items' source** — badges and streak awards, opt-out honoured (§4.52) · ★ **moments 3 and 5 on the week**, sharing their mark with `SCR-022` and the boards, with a test that opens both · **contract 4**, published on day one | new `src/components/ui/week-hud.tsx`, its test, `-scope` test and demo, `src/components/scoring/**` — new files for the week and the rail; **the points screen's and the boards' files are not touched** — `src/lib/dal/{points,leaderboards,recognition}.ts` (add-only), `src/messages/*/scoring.json`, `supabase/proposed/scoring/**` (functions only), new `tests/components/scoring/week*`, new `tests/unit/scoring-week*`, new `tests/rls/scoring-week*.test.ts`, new `tests/e2e/wave18-scoring-*.spec.ts`, `docs/plan/notes/scoring.md`. **Nothing else in PR A** — the ledger, the awards, the eight worker tasks, `SCR-022`, `SCR-027`/`028` and what a balance, level or rank **is** are frozen |

**Wave-18a contracts.**

1. **Lead → everyone — the frame** (`REQ-UIX-054`). The layout renders the top bar, the tab bar and the navigation
   rail. **A page renders its content and nothing of the shell**; a page that has a game rail passes it to the
   frame's one slot, and a page that owns its width says so. `PlayScope` stays the layout's and nothing under it is
   transformed, filtered or clipped (`scope-root`). ★ **It lands before any track builds a screen**; the lead posts
   «the frame is in at `<sha>`» with the slot's name and type.
2. **Lead → everyone — the signatures and the gate.** `ui/index.ts` is lead-only and append-only. Each owner names
   its primitive's props in its plan; the lead lands the four signatures, `card`'s `post` and `session-cta`'s
   addition as **types** after sync 1, with the registry entries. The gate's floor moves from 49 to **53** in the
   commit that adds the fourth file (`DEC-206` §1.3). The lead wires each demo into the gallery.
3. **`sessions` → `content` and the lead — the session post.** One add-only function in `src/lib/dal/search.ts`
   returns the feed's sessions with what a post draws — the presenter's company and team colour, the comment and
   like counts, the attendance amount from the scoring rule — and the member's own upcoming reservations for
   «التالية لك». The names and types go in `sessions'` note on day one. `content` never queries `sessions` itself.
4. **`scoring` → `content` and the lead — the week.** Three add-only DAL functions — the member's week, the company
   race, the achievement items — and one component for the game rail's slot. **Computed, never stored; a missing
   rank is an absence; opt-out is honoured in the DAL, not in the component.** The names and types go in `scoring`'s
   note on day one.
5. **Lead → `content` — the announcements.** The table, its policies and grants are the lead's (`0164`). `feed.ts`
   reads it through RLS with the caller's client and no `service_role`. **No teammate writes `create table`, a
   policy or a grant, even in `proposed/`.**
6. **Everyone — the artboard is the specification, and `DEC-206` §4 is the list of what it draws that is not built.**
   Fifty-two lines, each saying which document wins. **A new disagreement is written in your note with the artboard
   and the line; nobody picks a side.** Read the `.dc.html` for layout, sizes and copy — **no class, id or markup
   pattern from one appears in `src/`**, and no file under `docs/` is imported.
7. **Everyone — every figure is read.** The attendance amount is the scoring rule's and never a literal; the rotation
   is the org's; a rank is the monthly board's; a `+0` is never drawn (`DEC-206` §4.45 – §4.50).

**Wave-18 rules.**

- ★★ **Rebuilt, never restyled.** Start from the artboard and an empty file. Keep the DAL calls, the actions, the
  gating predicates and the accessible names the suites pin; keep no markup because it was there.
- ★★ **DELETE THE PAGE FILE FIRST, then write the screen from its artboard** (`DEC-208`, amending `DEC-199` §2) — two commits, a delete then a create — **and re-derive what must survive from the REQs and the DAL, not from memory**: the data calls, the auth boundary, `<bdi>` on every interpolated title and code, `?next=`, the phase gates. **The story lists what it kept and which requirement made it keep it.** From PR B on; PR A's owners write their tables retroactively.
- ★★ **`registrations` is never touched** (invariant 2). **The five frozen public routes do not move**:
  `qa:contract` green at every commit, `qa:appearance` and `visual`'s public pairs unchanged and not re-baselined,
  the fingerprint byte-identical, the public-graph test green. `/s/[id]` is **not** one of the five; `ui/button`,
  which it shares with them, is not edited.
- ★ **Arabic first.** A new string is written in `src/messages/ar/` and then in `en/`. `<bdi>` on every
  interpolated title, name and code. Western numerals only (`DEC-124`). Logical properties only.
- ★ **The status colours are `DEC-073`'s.** The artboards paint a waitlist badge cyan and a live one coral; a badge
  wears the primitive's tones (`DEC-206` §4.62). A status colour is never a company's.
- ★ **No sixth moment, and no change to the five.** Moments 3 and 5 gain a second surface on the home and share
  their mark with the first (`DEC-206` §5). A failure never animates; nothing scales on hover.
- ★ **A ring opens nothing** (`DEC-206` §1.5): no `onOpen`, not a button, `seen` never rendered — until wave 19.
- ★ **Nothing is reserved from the feed** (`DEC-206` §4.57): a post's control is a link.
- ★ **A member never sees who else attends** (A33 rule 3, `DEC-206` §4.56): a count, yes; faces, only for a viewer
  RLS already answers.
- ★ **No primitive loses a behaviour, a prop or an accessible name.** An addition is add-only and the existing
  suites prove it by passing untouched. `pg:` variants stay.
- ★ **Semantic names only** (`tokens-only`, `no-raw-palette`): no hex, no literal duration, no raw palette name.
- ★ **The existing suites are evidence.** A rebuilt screen changes locators; **each changed assertion is a ledger
  line in `STATUS.md`, in the same commit**, saying whether a selector moved or an expectation did. An expectation
  that changes is named in the plan first.
- ★ **Additive, because `main` runs on it first.** Migrations from `0164`. The owner rehearses on a production schema
  dump, pushes, merges, then reconnects Railway.
- ★ **No new dependency.** `package.json` is the lead's.
- **Teammates spawn planning-only**; sync 1 approves three plans against the seven contracts, and **no track builds
  a screen before the lead posts the frame's commit.**
- **Tables are the lead's; behaviour is the tracks'. A function has one writer. One writer per file, specs and
  demos included. `ui-lint --strict` has no allowlist and never gains one.**
- **Captures land at `.qa-shots/rtl/wave18-<track>-<screen>-<state>-<390|1280>.png`** in the main checkout, from a
  production build the row names by commit, honouring `E2E_SHOTS_DIR`. The lead opens every one **in bands, never
  downscaled, beside the artboard's own render**. ★ **They are evidence for the owner's review on a phone, not a
  substitute for it.**
- **Not this wave, and never-touch for every teammate:** the stories **viewer**, `story_views` and the `story`
  derivative (wave 19); `/app/members` (`SCR-019`), the viewer (`013`), rate (`015`), propose (`017`/`018`), the
  profile (`020`), the hub, points and the boards (`021` – `028`); ★ **every console and studio route**, an authoring
  screen for announcements among them (`DEC-206` §3); the five public routes and everything `public-graph`
  protects; the weekly leaderboard, the streak rule, proposal voting, leagues; learning objectives, a level history,
  attachments on a comment, a map embed; a sticker layer on the poster templates, the certificates' look, replacing
  the renderer; ★ **fixing the hard-load duplicate** (`DEC-204` — measured, not fixed); ★ **the two carried gates,
  together** (`DEC-194`); F2 and F3 (`DEC-198` §5); the overshoot ceiling (`DEC-186` §4); a company logo — refused
  (`DEC-195` §4); deleting a session with its awarded points; recurring series (`A14`).
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`, `stop`,
  branch switches, pushes and the PRs.

#### Wave 18, PR B — the event (`wave-18b/the-event`, opened against `main` from its first push)

**`SCR-012` in three phases and at desktop, `SCR-014`, `SCR-016`** (`REQ-UIX-061`, `REQ-UIX-062`; `STORY-UIX-048` …
`050`). The frame, the primitives and `0164`/`0165` are PR A's and stand. ★★ **`DEC-208` binds every screen here: the
page file and the screen's own markup files are DELETED in one commit, then the screen is written from its artboard in
the next, and the owner's note carries the kept-behaviour table — each behaviour, where it lives now, the `REQ-*`
that made it keep it — re-derived from the requirements and the DAL, never from memory.**

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | B's Step 0, this map, the PR against `main`, the gates, the captures beside the artboards, `STATUS` · custodian of every unspawned track's files | as PR A's map, and `ui/index.ts` for any addition a plan names |
| `sessions` | opus | ★ **`SCR-012`, rebuilt** — the top row, the poster whole at 4:5, the chips, the title, the presenter card, the action card with moment 1, the sub-nav of sections that exist, the sections in the artboards' order; the bottom `action-bar`; the desktop hero band and the full-width action row; the live and completed phases (the outcome card, moment 3 through `scoring`'s existing mechanism, never a copy) | `src/app/[locale]/app/sessions/[id]/{page,loading,error,not-found}.tsx`, `src/components/sessions/**`, ★ `src/components/checkin/{rsvp-panel.tsx,actions.ts}` (**from `checkin`, for PR B**, as in wave 16 — `session-matrix.ts` and `lib/dal/rsvp.ts` stay `checkin`'s), `src/lib/dal/sessions.ts` (add-only), its primitives, `src/messages/*/sessions.json`, its tests, new `tests/e2e/wave18-sessions-event-*.spec.ts`, its note |
| `checkin` | opus | ★ **`SCR-014` and `SCR-016`, rebuilt** — check-in with moment 2 and the 1.4 s return; the host view with the code in two groups, the rotation countdown, the count with walk-ins, the switch and its ceiling, revoke, marking by hand in a `sheet`, projection with wake-lock. ★ **A mistyped code shakes the boxes once — the owner ruled it input feedback** (`DEC-212`); under reduced motion the coral border and the message; every other refusal stays still | `src/app/[locale]/app/sessions/[id]/{check-in,host}/**`, `src/components/checkin/**` except `rsvp-panel.tsx` and `actions.ts`, `src/lib/dal/{rsvp,checkin}.ts` (add-only), `src/messages/*/{rsvp,checkin}.json`, its tests, new `tests/e2e/wave18-checkin-*.spec.ts`, its note. `code-input` is `sessions'` primitive — a change is a request |
| `content` | opus | ★ **the event page's slots, rebuilt with it** — materials (the phase gate; ★ the audio row with an in-page player, `REQ-MAT-007`), photos (the add tile for who may upload, the privacy line, «أزلني»), the discussion (the composer, replies one level deep, the like) — each slot renders no heading of its own | `src/components/{materials,photos,viewer,event}/**` for the slots, `src/lib/dal/{materials,photos,comments,reactions}.ts` (add-only), `src/messages/*/{materials,photos,event}.json`, its tests, new `tests/e2e/wave18-content-event-*.spec.ts`, its note |

**PR B's contracts.** (1) **The slot contract stands**: the page owns every `<section>` and `<h2>`; a slot renders none
and a section whose slot can render nothing is gated by the page. (2) **Delete first** (`DEC-208`). (3) **A member sees
how many attend, never who** — `session_attendance_count()`; identities only for a viewer RLS answers (A33 rule 3).
(4) **Every figure is read** — the amount, the rotation, the window. (5) **`DEC-206` §4.66 – §4.77** is the list of
what the artboards draw and are not built; a new disagreement is written, not picked. (6) **No sixth moment**: moment 1
on the action card, moment 2 on `SCR-014`, moment 3 on the outcome card, each once, each with its static state.
**Spawn planning-only; sync 1 approves three plans; nobody deletes a file before the lead posts «B's plans are
approved».**

### Ownership map (wave 17 — every primitive, and one visual language, DEC-199) — ★ THE RECORD OF A FINISHED WAVE

> Wave 17 merged as PR #35 (`bf434b01`), and 17b as PR #37 (`badab40e`). Its map is kept as the record; **wave 18's map is directly above** (`DEC-205`, `DEC-206`).

**The programme's third wave** (`DEC-199`, milestone **M19**). The owner opened the app on a phone after wave 16 and
called it a Frankenstein, and ruled on 2026-09-30: ★★ **«ساحة اللعب» is the product's only visual language —
everywhere.** The console is in, **at the token level**; the public site is in scope and **still moves last**. Two
causes were measured. **(1)** Eight primitives the design's own task list never named — `page-header`, `prose`,
`link`, `icon-button`, `section-header`, `submit-button`, `reorderable-list`, `icons` — had no playground treatment,
so every scoped screen drew its title, its text and its links in the old design. **(2)** The scope reached five
surfaces only. This wave removes both: a **gate that reads `src/components/ui/` itself** (`REQ-UIX-050`), the eight
(`REQ-UIX-051`, `052`), and **the token move** — the scope at the root of every layout but the public site's
(`REQ-UIX-049`), with the console in its sober register (`REQ-UIX-053`). The checklist is `STATUS.md`'s wave-17
block. **Four demonstrables:** ★★ the gate green over all 49 files, having landed red; ★★ `qa:contract`,
`qa:appearance`, `visual`'s public pairs and the register-form fingerprint **unmoved, not re-baselined**; ★ the
accessibility sweep at 0 findings over every route inside the scope; ★★ **the gallery opened by the owner on a
phone** — the wave's acceptance is the owner's, not the lead's.

★★ **The sentence every screens brief carries from here (`DEC-199` §2): a screen is REBUILT to its design, never
restyled.** Applying the scope to existing markup produces the right colours on the wrong structure. **The token move
is not any screen's redesign and no screen is «done» by it**: this wave nobody rearranges a screen. A change to a
screen's markup is one of three things — a raw palette class replaced by a semantic one, a `.theme-dark` removed, a
nested scope removed — and anything more is the screens waves'.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-199`, this map, the ten agent files, `01`/`14`/`15`, `docs/design/04` and `07` · ★★ **the gate, first, landed red** — `tests/unit/ui-playground.test.ts` and its registry (contract 2) · ★ **the token move** (contract 1): `PlayScope` at the root of the shell, `(auth)`, `legal`, `s`, `verify` and the gallery; the document's ground; the five moment surfaces' own scopes and every `.theme-dark` under a scoped layout removed; the org theme layer retired from the shell; the toast region inside · ★ **the status constants' on-dark forms inside the scope, once, in `globals.css`** (contract 4) · ★ **the eight primitives**, each with a `-scope` test and an RTL check; `icons` **last, alone**, under contract 5's four-part proof · the scope tests `DEC-199` §3 found missing on `dialog`, `skeleton`, `toast`, `route-progress`, `route-error` · the raw-palette gate and the shell's own raw classes · the gallery page and its baseline · the a11y sweep · the gates, `STATUS`, the PR | the lead-only paths below, `src/app/globals.css`, the lead's fifteen `ui/` files, `ui/scope.tsx`, `ui/scope-portal.tsx`, `ui/objects/**`, `ui/index.ts`, `src/app/[locale]/app/layout.tsx`, `src/app/[locale]/(auth)/**`, `src/components/shell/**`, `src/app/[locale]/(dev)/ui/{page,playground,ground}.tsx` and `(dev)/layout.tsx`, `messages/*/{ui,app,auth}.json`, ★ new `tests/unit/{ui-playground,no-raw-palette,scope-root}*` and the registry beside them, `tests/unit/{tokens-scope,tokens-only,public-graph}.test.ts`, the lead's own `tests/components/ui/*.test.tsx` and new `-scope` tests for its primitives, new `tests/e2e/wave17-{demo,lead}-*.spec.ts`, `tests/e2e/{a11y,frozen-routes}*.spec.ts`, `docs/design/**`. ★ **As custodian, for the token move only** — the layouts of `legal/**`, `s/**` and `verify/**`; the `<PlayScope>` wrappers on the five moment surfaces (`sessions'`, `checkin`'s and `scoring`'s files) and the tests that pin them. **Custodian** of every file of a track not spawned — `sessions`, `checkin`, `scoring`, `designer`, `event`, `notify`, `platform`, `branding` — edited only for its own rows or on a teammate's written request |
| `content` | opus | ★ **the gallery entries** for the eight and for `button` and `route-progress` — every state, in Arabic, from fixture data, against the props as they stand (contract 3) · its **fourteen primitives under the whole app's scope**: fixes where a real screen shows one wrong on the dark ground · ★ **the member side's raw palette** (contract 4): every raw palette class and every `.theme-dark` in a member-facing file, replaced by a semantic name — **and nothing else in that file** · the gallery captured at 390 px and at desktop width | `src/components/ui/{card,badge,tag-chip,avatar,progress,empty-state,stat,panel,file-drop,sticker,poster,reaction-bar,progress-bar,story-ring}.tsx` and their tests and `-scope` tests · ★ new `src/app/[locale]/(dev)/ui/demos/{button,link,prose,icon-button,section-header,submit-button,reorderable-list,icons,route-progress}.tsx`, and **from the lead, this wave** `demos/page-header.tsx` and `(dev)/ui/reorderable-demo.tsx`; its own wave-15 demos · ★ **for a raw palette class or a `.theme-dark` only**: `src/app/[locale]/app/{sessions,me,propose,members,leaderboards}/**`, `src/app/[locale]/{s,verify,legal}/**` **except their layouts**, `src/components/{sessions,browse,search,checkin,scoring,event,materials,photos,viewer,tasks,me,privacy,notifications,calendar,posters,certificates}/**` · new `tests/e2e/wave17-content-*.spec.ts` · `docs/plan/notes/content.md`. **Nothing else this wave** — its DAL modules, routes, worker tasks and message files are frozen, fixes included |
| `console` | sonnet | its **six data-dense primitives under the new values** — tokens only, no animation, no behaviour change · ★ **the staff side's raw palette** (contract 4): `/app/admin/**`, `/app/platform/**`, the studio's chrome, the survey's results — a raw class or a `.theme-dark` replaced, **and nothing else in that file** · ★ **the register's guard** (contract 6, `REQ-UIX-053`): a test that walks the console's import graph and finds no moment, confetti, object or sticker · the console's screens captured at 390 px | `src/components/ui/{data-table,combobox,menu,tabs,sheet,date-time}.tsx` and their tests and `-scope` tests, `src/components/admin/rtl-datetime-picker.tsx` · its wave-15 demos · ★ **for a raw palette class or a `.theme-dark` only**: `src/app/[locale]/app/{admin,platform}/**`, `src/components/{admin,platform,designer,branding,email,survey}/**` · ★ new `tests/unit/console-register.test.ts` · new `tests/e2e/wave17-console-*.spec.ts` · `docs/plan/notes/console.md`. **Nothing else this wave** — every admin route's behaviour, its DAL and its messages are frozen |

★ = transferred or changed for this wave by `DEC-199`.

**Wave-17 contracts.**

1. **Lead → everyone — the root scope** (`DEC-199` §1.3). `PlayScope` is rendered **by a layout and by nothing else**:
   the shell, `(auth)`, `legal`, `s`, `verify`, the gallery. Scopes do not nest, the root scope's element is never
   transformed, filtered or clipped (`DEC-188` §5), and **`.theme-dark` never appears under a scoped layout** — it
   cuts an old-look island into the page. `tests/unit/scope-root.test.ts` holds all three. ★ **It lands before any
   track edits code**; the lead posts «the scope is at the root at `<sha>`», and nobody renders a scope after it.
2. **Lead → everyone — the gate and its registry** (`DEC-199` §4, `REQ-UIX-050`). `tests/unit/ui-playground.test.ts`
   enumerates `src/components/ui/*.tsx`. Every file has one registry entry — `variant`, `tokens`, `composes` or
   `infrastructure` — checked against its source, plus a test inside the scope and a gallery demo. **The registry is
   the lead's; there is no «pending» kind.** A track that adds or renames a file, or changes how one is treated,
   writes the request.
3. **Lead → `content` — the eight's props are frozen.** The demos are written against `ui/index.ts`'s types as they
   stand today; the lead changes how the eight look, not what they take. The lead wires each demo into `page.tsx` and
   owns the baseline. **The gallery moves when a demo is wired**, and that commit's row names the primitive.
4. **Lead → both tracks — the raw palette and the status colours.** `tests/unit/no-raw-palette.test.ts` lists every
   raw palette class outside `ui/` and the public site's files, by side; **it ends at zero.** The mapping is
   published in `STATUS.md` on day one — what `bg-silver-100`, `text-white`, `bg-navy-950` and the rest become. ★ **No
   screen edits a status class**: `text-error`, `bg-success-bg` and the others take `DEC-073`'s on-dark forms inside
   the scope **once, in `globals.css`**, which is the lead's.
5. ★ **The five the public site renders** (`DEC-186` §1, unchanged) — `button`, `icons`, `field`, `input`,
   `textarea`. **Only `icons` is touched this wave, by the lead, last, in one commit**, under the four-part proof:
   `qa:contract`; `visual` at 0.000 %; the register form's computed-style fingerprint equal on `main`'s build and the
   branch's; the public-graph test. **No teammate touches a file the public routes import** — the thirteen marketing
   components, `wordmark.tsx` among them, keep their raw classes until the public site's wave.
6. **`console` → lead — the register** (`DEC-199` §1.1). The console takes the palette, the radii and the type. **No
   file it renders imports `src/lib/ui/**`, `ui/objects/**`, `ui/sticker` or a moment's component**, and its six
   primitives declare no animation. `console` writes the test; it is green the day it lands.

**Wave-17 rules.**

- ★★ **A screen is rebuilt to its design, never restyled — and this wave rebuilds none** (`DEC-199` §2). No markup is
  rearranged, no hierarchy changed, no affordance added. A track that finds a screen ugly on the new ground writes it
  in its note; it does not fix the screen.
- ★★ **`registrations` is never touched** (invariant 2): 20 real signups. The owner's «you can break the app» covers
  the app behind sign-in and nothing else. **The register form's action, field names, ids, validation and no-JS path
  are byte-identical.**
- ★★ **The five frozen public routes do not move**: `qa:contract` green at every commit, `qa:appearance` and
  `visual`'s public pairs **unchanged and not re-baselined**, the fingerprint byte-identical, the public-graph test
  green. If the `TaskCompleted` hook falls through to the full `qa` for a teammate, **it edited something that is not
  its own.**
- ★ **The app may look broken while this lands** — the owner's licence. No commit is spent keeping a screen
  presentable mid-move, and no compatibility path for the app's old look is written.
- ★ **The `pg:` variants stay** (`DEC-199` §1.3.2). They and `:root`'s old values are deleted by the public site's
  wave. Nobody «tidies» an old class out of a primitive this wave: the existing suites pin those strings.
- ★ **No primitive gains or loses a behaviour, a prop or an accessible name.** The eight change how they look.
- ★ **The console does not animate, and nothing scales on hover** (`DEC-183` §2). A failure never animates.
- ★ **Semantic names only** (`tests/unit/tokens-only.test.ts`): no hex, no literal duration, no raw palette name
  after `pg:`, `pg-dark:` or `pg-light:`; and after the sweep, no raw palette name outside `ui/` and the public
  site's files at all.
- ★ **The status colours are `DEC-073`'s** — colours, words and the live dot; inside the dark scope their on-dark
  forms.
- ★ **`docs/plan/` wins over `docs/design/`** — `DEC-183` §4, `DEC-195` §6 and `DEC-199` §5 list twenty-nine
  disagreements. A new one is written down with the file and the line; nobody picks a side.
- ★ **The existing suites are evidence.** Each changed assertion is a ledger line in `STATUS.md`, in the same commit
  as the change. New cases go in new files — `<primitive>-scope.test.tsx` beside the existing test.
- ★ **No migration is expected.** One is written only if a plan needs it, from `0164`, additive, rehearsed by the
  owner on a production schema dump.
- ★ **No new dependency** — no icon library, no motion library. `package.json` is the lead's.
- **Teammates spawn planning-only**; sync 1 approves two plans against the six contracts, and **no track edits code
  before the lead posts the root scope's commit.**
- **One writer per file, specs and demos included. `ui-lint --strict` has no allowlist and never gains one.**
- **Captures land at `.qa-shots/rtl/wave17-<track>-<surface>-<state>.png`** in the main checkout — the phone project
  at `390 × 844`, and the gallery at desktop width too — from a production build the row names by commit, honouring
  `E2E_SHOTS_DIR`. The lead opens every one **in bands, never downscaled**. ★ **They are evidence for the owner's
  review on a phone, not a substitute for it.**
- **Not this wave, and never-touch for every teammate:** ★ **any screen's rebuild** — layout, hierarchy, affordances;
  the public site's re-skin and every file it renders; session stories and their viewer; the timeline's recap,
  achievement and announcement items; proposal voting; the weekly leaderboard; the streak rule; the desktop shell
  (`DEC-NEXT-15`); leagues; the certificates' look — **the playground stops at the certificate's edge**, and the
  rendered poster and certificate are not restyled; the designer's document model and the export pipeline; a console
  layout pass (`DEC-199` §1.1); a brand-aware playground (`DEC-199` §1.3.7); self-hosting the display face
  (`DEC-199` §8 — the owner's); deleting the `pg:` variants; a company logo (`DEC-195` §4); ★ **the two carried gates,
  together** (`DEC-194`); F2 and F3 (`DEC-198` §5); deleting a session with its awarded points; a member uploading
  their own picture; recurring series (`A14`); replacing the renderer.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`,
  `stop`, branch switches, pushes and the PR.

### Ownership map (wave 16 — the five moments, on the real screens, DEC-195) — ★ THE RECORD OF A FINISHED WAVE

> Wave 16 merged as PR #34 (`65ca7a7a`). Its map is kept as the record; **wave 17's map is directly above** (`DEC-199`).

**The programme's second wave** (`DEC-195`, milestone **M18**). ★★ **The moments land on the real screens**, which
**amends `DEC-183` §4.2(f)**: the surfaces the five moments touch adopt the playground now, ahead of the screens
waves, and every other screen still waits. The owner said yes before the wave opened. **The reason: a moment cannot
be verified in a gallery** — it is defined by *when* it fires («once, when the action resolves, never on a
re-render»), and a canned replay proves only that it renders. **Five surfaces move, and on each only the named
part** (`DEC-195` §1.1): `SCR-012`'s **action card** (moment 1, الحجز) · `SCR-014` (moment 2, تسجيل الحضور, with
`code-input` adopted) · the **head of `SCR-022`** (moments 3 and 4 — the count-up, the flame, the level bar, the
level card's flip) · `SCR-027` and `SCR-028` (moment 5, the rank change). **What does not move** (§1.2): the five
public routes, the shell and the tab bar, the rest of `SCR-012`, ★ **the home screen `SCR-010`** (it carries no
balance), the history and catalogue on `SCR-022`, every other screen, the `(auth)` screens included, and every
award, balance, level and rank as computed. The checklist is `STATUS.md`'s wave-16 block. **Four demonstrables:**
★★ a throttled-CPU trace with no frame over 16 ms for moments 1 and 2; ★★ a re-render test per moment — mount, play,
unmount, mount again, silence; ★ every static state at 390 px in Arabic beside its animated counterpart, opened by
the lead; ★ `qa:contract`, `visual`'s public pairs and the register-form fingerprint unmoved.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-195`, this map, the ten agent files, `01`/`09`/`14`/`15`, `07-tasks.md` · ★ **contract 1, the mechanism, before any track uses it** — `src/lib/ui/confetti.ts`, `useCountUp`, the once-per-occurrence keying, the duration reader · ★ **contract 2** — every `@keyframes` a moment needs, in `globals.css`, from the plans · ★ **the team colour on the add-company form** (`DEC-195` §3, `REQ-UIX-043`) as `console`'s custodian, with its test and a 390 px capture · any table contract 5 needs, from `0162`, with its RLS case · the demonstrables · the gates, `STATUS`, the PR | the lead-only paths below, ★ new `src/lib/ui/**`, `supabase/migrations/**` from `0162`, `src/app/globals.css`, the lead's fifteen `ui/` files, `ui/scope.tsx`, `ui/scope-portal.tsx`, `ui/objects/**`, `src/components/brand/**`, `src/components/shell/**`, `messages/*/{ui,app}.json`, ★ as custodian: `src/app/[locale]/app/admin/companies/**`, the companies functions of `src/lib/dal/admin-lists.ts`, the `companies` keys of `messages/*/admin.json`, `tests/components/admin/compan*`, `tests/unit/admin-lists*`; new `tests/components/lib-ui/**` (jsdom — the mechanism needs a DOM), new `tests/rls/moment*.test.ts`, new `tests/e2e/wave16-{demo,lead}-*.spec.ts`, `docs/design/**`. **Custodian** of every file of a track not spawned — `content`, `console`, `designer`, `event`, `notify`, `platform`, `branding` — ★ including `content`'s `avatar`, `sticker`, `progress-bar` and `poster`, which the moments compose: a change is a written request |
| `sessions` | opus | ★ **moment 1, الحجز, on `SCR-012`'s action card** (`REQ-UIX-045`) — the reserve action returns what the moment is keyed on; the ticket rises, the stamp «محجوز» lands with no overshoot, the card thuds, the capacity chip updates in place, the action becomes `session-cta`'s booked state with «ألغِ حجزي», the calendar whisper · **the waitlisted variant** — the same ticket, «قائمة الانتظار · N», in the waitlist's status tone (`DEC-073`, `DEC-195` §6.21), never cyan · the static state · the re-render test · the throttled trace · ★ `code-input` fixes `checkin` asks for | ★ `src/components/checkin/{rsvp-panel.tsx,actions.ts}` (**from `checkin`, this wave** — its gates unchanged), `src/components/sessions/{action-card,action-bar,event-actions,calendar-menu}.*` and new `src/components/sessions/moment-*.tsx`, `src/app/[locale]/app/sessions/[id]/page.tsx` **for the action card only**, `src/components/ui/{session-cta,code-input}.tsx`, `src/lib/dal/sessions.ts` (add-only — ★ **and the fix of `:1098`'s two-day read**, `DEC-197` §3), `messages/*/sessions.json`, ★ `tests/components/checkin/rsvp-panel.test.tsx` (evidence, from `checkin`), `tests/components/sessions/**`, `tests/components/ui/{session-cta,code-input}*.test.tsx`, its existing e2e specs (evidence), new `tests/e2e/wave16-sessions-*.spec.ts`, `docs/plan/notes/sessions.md`. **Nothing else this wave** — the hero, the sub-nav, the sections and slots, the timeline, browse, the propose form, the hub, `lib/dal/rsvp.ts` and `session-matrix.ts` are frozen for it |
| `checkin` | opus | ★ **moment 2, تسجيل الحضور, on `SCR-014`** (`REQ-UIX-046`) — confetti in the team colour with lime and bone, the coin's drop and squash (★ landing at `1` until the owner rules on overshoot, `DEC-195` §6.20), the three lines: «أنت هنا!», **the computed amount and that it arrives when the session ends** (`REQ-CHK-018`, `REQ-PTS-015` — from `scoring`'s `getSessionAwardState()`, read and never changed; no number when the state is `none`), the time · ★ **`code-input` adopted** — boxes named, the refusal tied to the group, the posted field and the no-JS path byte-identical (`DEC-195` §2.4) · ★ **the matrix's «حضرت»**: a checked-in member is not offered the check-in link again (`DEC-195` §2.5), a ledger line · the static state · the re-render test · the throttled trace | `src/app/[locale]/app/sessions/[id]/check-in/**`, new `src/components/checkin/moment-*.tsx`, `src/components/checkin/{session-matrix.ts,award-state.tsx,attendance-outcome.tsx,code-input.tsx}`, `src/lib/dal/checkin.ts`, ★ `src/lib/dal/rsvp.ts` (**the fix of `:61`'s two-day read** and `RsvpOutcome`'s add-only fields, `DEC-197` §3, contract 4), `messages/*/checkin.json`, `tests/unit/{session-matrix,checkin-*}*`, `tests/components/checkin/**` **except** `rsvp-panel.test.tsx` and `schedule-form.test.tsx`, `tests/e2e/{checkin,checkin-gating}.spec.ts` and `tests/e2e/wave{7,9,12}-checkin-*.spec.ts` (evidence), new `tests/e2e/wave16-checkin-*.spec.ts`, `docs/plan/notes/checkin.md`. **Nothing else this wave** — the host view, the attendance screen, `lib/dal/rsvp.ts`, the code's rotation and every SQL function are frozen; a change to what check-in decides is not this wave's |
| `scoring` | opus | ★ **moments 3 and 4 on the head of `SCR-022`** (`REQ-UIX-047`) — the balance counting up from the old figure with the delta beside it, the streak flame growing and keeping its flicker, the level bar by `scaleX`, `level-card` turning over with one shine, its face naming what the level unlocks or saying it unlocks nothing · ★ **moment 5 on `SCR-027` and `SCR-028`** (`REQ-UIX-048`) — the rows on `rank-row` and `race-bar`, the swap by FLIP, the arrow shown and never pulsed (`DEC-197` §2), a bar by `scaleX`; the falling row with no colour, icon or motion of its own · ★ **the plan's first answer: what «first sight» and «since last view» read** (contract 5) · the static states · a re-render test per moment | `src/app/[locale]/app/me/points/**`, ★ `src/app/[locale]/app/leaderboards/**` and `src/components/scoring/{member-board,company-board}.tsx` (**from `sessions`, this wave**), `src/components/scoring/**` and new `src/components/scoring/moment-*.tsx`, ★ `tests/components/leaderboards/boards.test.tsx` (**from `sessions`, this wave**, `DEC-197` §9), `src/components/ui/{rank-row,race-bar,level-card}.tsx`, `src/lib/dal/{points,leaderboards,recognition}.ts` (add-only), `messages/*/{scoring,leaderboards}.json`, `supabase/proposed/scoring/**` (functions only — a table is the lead's), `tests/components/scoring/**`, `tests/components/ui/{rank-row,race-bar,level-card}*.test.tsx`, `tests/unit/scoring*`, `tests/rls/{scoring,points,leaderboards}*.test.ts` (evidence), `tests/e2e/{points,leaderboards,wave7-sessions-leaderboards,scoring-company-points}.spec.ts` and `tests/e2e/wave{9,12}-scoring-*.spec.ts` (evidence), new `tests/e2e/wave16-scoring-*.spec.ts`, `docs/plan/notes/scoring.md`. **Nothing else this wave** — the ledger, the awards, the eight worker tasks and what a balance, level or rank **is** are frozen |

★ = transferred or changed for this wave by `DEC-195`.

★ **Sync 1 is done (`DEC-197`).** Three plans approved. **Three independent readings found seven defects the lead's
did not** — the table in `DEC-197` is why teammates are spawned. Its rulings bind: ★ **the 1.4-second return on
`SCR-014` is KEPT, a recorded exception to SC 2.2.1 scoped to that one moment** (§1); **moment 5's arrow does not
pulse** (§2); **the two-day `.maybeSingle()` read is fixed in `sessions.ts:1098` and `rsvp.ts:61`** (§3); the three truth
defects are fixed (§4); `useMoment` never jumps back on a server-painted page (§5); `0162` is `member_seen_marks` (§6).

**Wave-16 contracts.**

1. **Lead → everyone — the mechanism** (`DEC-195` §2.3, `REQ-UIX-044`). `src/lib/ui/` is new and the lead's, and it
   lands **before any track's moment**: `confetti.ts` (`element.animate()`, an `aria-hidden` layer with no pointer
   events, each node removed on `finish`, an immediate return under reduced motion, colours from `--team` plus lime
   and bone — lime and bone alone when the company has none), `useCountUp(from, to, duration)` (text through the
   numeral formatter; the final value at once under reduced motion), the **once-per-occurrence keying**, and a reader
   that turns a `--duration-*` token into milliseconds for `element.animate()`. **No track writes its own.** The names
   go in `STATUS.md` the day they land.
2. **Lead → everyone — keyframes and tokens.** Every `@keyframes` lives in `globals.css`, which is the lead's; a loop
   (the flame's flicker, a live pulse) is a class switched off under reduced motion, never JS. A track names the
   keyframes it needs in its plan and the lead lands them. **Transform, opacity and filter only; a duration from the
   tokens; no `will-change` left on; no motion library.**
3. **Lead → every surface — the scope on a real screen** (`DEC-195` §1.3). The scope's element wraps **exactly** the
   surface `DEC-195` §1.1 names, as a direct child of the screen's content, **never itself transformed, filtered or
   clipped, nor inside an element that is** — a thud, a rise or a flip moves an element **inside** it (`DEC-188` §5).
   An org's brand kit does not reach inside; the team colour does, as `--team`.
4. **`sessions` ↔ `checkin` — the matrix decides, the moment plays.** `session-matrix.ts` and `lib/dal/rsvp.ts` stay
   `checkin`'s: which state a viewer gets is still the matrix's answer (`REQ-UIX-015`). `sessions` renders it. A new
   field `sessions` needs from `getRsvpPanelData()` — the reservation's id, for the key — is a written request to
   `checkin`, **add-only**. `checkin`'s «حضرت» fix is the one change to the matrix, with its ledger line.
5. **`scoring` → lead — what a member has seen** (`DEC-195` §2.6). Moments 3 to 5 play at first sight, and moment 5
   needs «since last view», which nothing stores. **`scoring`'s plan says what it reads**; browser storage is not the
   default, because it replays on every new phone. A table is the lead's, from `0162`, with its RLS case; `main`'s app
   and worker on that schema do nothing different.
6. **`scoring` → `checkin` — the amount.** The coin's figure is `getSessionAwardState()`'s pending amount, **read,
   never re-derived and never changed**; `checkin` never queries `points_ledger` itself.

**Wave-16 rules.**

- ★★ **Once per occurrence, never on a re-render.** This is a state problem, not an animation problem. Moments 1 and
  2 play from the action's own result in the client that performed it — a reload, a back navigation or another phone
  shows the static state. Moments 3 to 5 play at first sight. **Every moment has a test that mounts, plays, unmounts,
  mounts again and asserts silence.**
- ★★ **Every moment has a named static state that is a COMPLETE experience under reduced motion** (`REQ-UIX-014`).
  Collapsing a duration is not a reduced-motion design. It is built, captured at 390 px beside the animated one, and
  opened by the lead.
- ★ **Transform, opacity and filter only. 60 fps. No `will-change` left on. No motion library.** Confetti is
  `element.animate()`. Bars grow by `scaleX`, rows move by `translateY`, never `width` or `top`.
- ★ **A failure never animates** — a refused reservation, a wrong code, an error state. Nor do tables, lists, admin
  screens, the audit log or exports. **Nothing scales on hover.**
- ★ **No overshoot beyond a sticker's `1.08`, and none elsewhere, until the owner has seen one** (`DEC-186` §4,
  `DEC-195` §6.20). The coin lands at `1` with its squash; the owner is shown both at the 390 px review.
- ★ **Only the named surfaces move** (`DEC-195` §1.1 and §1.2). A change outside them is a defect, not a preview.
- ★ **The five frozen public routes do not move**: `qa:contract` green at every commit, `visual`'s public pairs
  unchanged and not re-baselined, the register-form fingerprint byte-identical, the public-graph test green.
- ★ **The amount is computed, never stored, and always says it arrives at completion** (`REQ-CHK-018`,
  `REQ-PTS-015`). A `+0` is never drawn.
- ★ **The status colours are `DEC-073`'s.** A waitlisted stamp wears the waitlist's tone; a status colour is never a
  company's.
- ★ **`docs/plan/` wins over `docs/design/`** — `DEC-183` §4 and `DEC-195` §6 list twenty-four disagreements. A new one
  is written down with the file and the line; nobody picks a side.
- ★ **The existing suites are evidence.** Each changed assertion is a ledger line in `STATUS.md`, in the same commit.
  New behaviour gets new files.
- ★ **Additive, because `main` runs on it first.** Migrations from `0162`, only if contract 5 needs one. The owner
  rehearses on a production schema dump, pushes, merges, then reconnects Railway. **`registrations` is never touched.**
- **Teammates spawn planning-only**; sync 1 approves three plans against the six contracts.
- **Tables are the lead's; behaviour is the tracks'. A function has one writer. One writer per file, specs included.**
- **`ui-lint --strict` has no allowlist and never gains one.**
- **Captures land at `.qa-shots/rtl/wave16-<track>-<moment>-<state>.png`** — `animated` at the moment's rest and
  `static` under reduced motion — in the main checkout, phone project, `390 × 844`, from a production build the row
  names by commit, honouring `E2E_SHOTS_DIR`. The lead opens every one **in bands, never downscaled**.
- **Not this wave, and never-touch for every teammate:** session stories and their viewer; the timeline's recap,
  achievement and announcement items; proposal voting; the weekly leaderboard; the streak rule (`DEC-NEXT-9`); **any
  screen redesign beyond the five surfaces**, the home screen, the shell and the tab bar included; everything under
  `(marketing)/**`; the desktop shell (`DEC-NEXT-15`); leagues; the certificates' look; the `(auth)` screens (the
  member-screens milestone's first three, `DEC-195` §5); **a company logo — refused, `DEC-195` §4**; the whispers
  beyond a moment's own surface; ★ **the two carried gates, together** (`DEC-194`) — the trigger-definer ACL sweep
  with its generated test and wave 14's Storage-predicate gate; deleting a session with its awarded points; a member
  uploading their own picture; recurring series (`A14`); replacing the renderer.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`,
  `stop`, branch switches, pushes and the PR.

### Ownership map (wave 15 — the visual direction's foundation: tokens, the display face, the primitives, team colours, DEC-183) — ★ THE RECORD OF A FINISHED WAVE

> Wave 15 merged as PR #33 (`b9f2ca0b`). Its map is kept as the record; **wave 16's map is directly above** (`DEC-195`).

**The first wave of a programme, not a one-off** (`DEC-183`, milestone **M17**). The owner accepted the visual
direction «ساحة اللعب» — [`docs/design/`](docs/design/) — on 2026-09-28 and, with it, **reversed `DEC-100`**: confetti
and a sticker's overshoot are in, five moments replace nine. This wave lays the foundation and **nothing visible
changes**: no screen adopts the playground, the shell does not, and the public site does not move. **(1)** The
tokens land as a **scope** that redefines no existing token (`REQ-UIX-028`). **(2)** Baloo Bhaijaan 2 enters through
the font door (`REQ-UIX-029`). **(3)** The 37 primitives move onto the scope's semantic tokens, each by its owner,
identical outside the scope (`REQ-UIX-030`). **(4)** Ten new primitives render every state from props
(`REQ-UIX-031` … `040`). **(5)** Nine glyphs, six objects and the wordmark (`REQ-UIX-041`, `042`). **(6)** A company's
team colour (`REQ-UIX-043`). The checklist is `STATUS.md`'s wave-15 block. **Four demonstrables:** ★★ the four public
routes at **0.000 %** against a capture of `main` and `/app` at 390 px the same picture before and after the token
commit — **unmoved, not re-baselined**; ★ the `(dev)` gallery re-baselined **on purpose**, the row naming the
primitives that moved it; ★ a lam-alef carrying tashkeel rendered in the display face **after** subsetting, in the
app's Chromium and the worker's; ★ every new primitive at 390 px in Arabic beside its counterpart in the prototypes,
opened by the lead.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-183`, this map, the ten agent files, `01`/`14`/`15`, `scripts/traceability.mjs` · ★ **contract 1, the scope** — the tokens and the semantic layer in `globals.css`, the names published in `STATUS.md` · ★ **the display face** — `src/lib/fonts.ts`, `fonts:extract` / `derive` / `check`, the shaping check on a real render · ★ **contract 2** — `ui/index.ts`'s ten new signatures and `AvatarProps.teamColor`, types only, from the plans · its own fifteen primitives migrated, `button` first · the nine glyphs · the six objects and the wordmark, as `08-assets.md`'s table says and `DEC-183` §4.8 – §4.10 rule · the gallery page and its baseline · `0160` (`companies.team_color`) and its RLS case · the demonstrables · the gates, `STATUS`, the PR | the lead-only paths below, `supabase/migrations/**` from `0160`, `src/app/globals.css`, ★ `src/lib/fonts.ts`, `packages/fonts/**`, `scripts/fonts/**`, the lead's fifteen `ui/` files and `ui/index.ts`, ★ new `src/components/ui/objects/**`, ★ new `src/components/brand/**`, new `public/objects/**`, `src/app/[locale]/(dev)/ui/{page,reorderable-demo}.tsx` and `(dev)/layout.tsx`, `src/components/shell/**`, `messages/*/{ui,app}.json`, `tests/components/ui/{page-header,route-error,route-progress,reorderable-list,toast-label,form-reset}.test.tsx` and new tests for its own primitives, ★ new `src/components/ui/scope.tsx`, new `tests/unit/{tokens,display-face,objects,public-graph}*`, new `tests/rls/team-colour*.test.ts` **except** `team-colour-audit*` (`console`'s), new `tests/e2e/wave15-{demo,lead}-*.spec.ts`, `docs/design/**`. **Custodian** of every file of a track not spawned — `checkin`, `designer`, `event`, `notify`, `platform`, `branding` — edited only for its own rows or on a teammate's written request |
| `content` | opus | its **nine** primitives onto the scope — `tag-chip` (the «chip»), `badge` (the «status badge», with `SessionStatusBadge`), `avatar` (★ gains the team ring, contract 3), `card`, then `progress`, `empty-state`, `stat`, `panel`, `file-drop` · ★ **five new**: `sticker` (`REQ-UIX-031`), `poster` (`032`), `reaction-bar` (`034`), `progress-bar` (`036`), `story-ring` (`040`) — ★ **measured first**: what `progress-bar` is beside `progress.tsx`, and `poster` beside `CardMedia` and `designer`'s `SessionPoster` · a demo per primitive (contract 4) | `src/components/ui/{card,badge,tag-chip,avatar,progress,empty-state,stat,panel,file-drop}.tsx`, new `src/components/ui/{sticker,poster,reaction-bar,progress-bar,story-ring}.tsx`, `tests/components/ui/{card,badge,tag-chip,avatar,progress,empty-state,stat,panel,file-drop}.test.tsx` (evidence), new `tests/components/ui/{sticker,poster,reaction-bar,progress-bar,story-ring}.test.tsx`, ★ new `tests/components/ui/{card,badge,tag-chip,avatar,progress,empty-state,stat,panel,file-drop}-scope.test.tsx`, new `tests/e2e/wave15-content-gallery.spec.ts`, new `src/app/[locale]/(dev)/ui/demos/{card,badge,tag-chip,avatar,progress,empty-state,stat,panel,file-drop,sticker,poster,reaction-bar,progress-bar,story-ring}.tsx`, `docs/plan/notes/content.md`. **Nothing else this wave** — its screens, DAL modules, routes, worker tasks and message files are frozen, fixes included |
| `sessions` | opus | its **eight** form primitives onto the scope — ★ **six of them are rendered by the public register form** (`field`, `input`, `textarea`, `checkbox`, `radio-group`, `form-summary`), so each is proven unmoved there (contract 5) · ★ **two new**: `session-cta` (`REQ-UIX-033`) — six states from props, the affordance matrix untouched — and `code-input` (`REQ-UIX-035`) · a demo per primitive | `src/components/ui/{field,input,textarea,select,checkbox,radio-group,switch,form-summary}.tsx`, new `src/components/ui/{session-cta,code-input}.tsx`, `tests/components/ui/{field,input,textarea,select,checkbox,radio-group,switch,form-summary}.test.tsx` (evidence), new `tests/components/ui/{session-cta,code-input}.test.tsx`, ★ new `tests/components/ui/{field,input,textarea,select,checkbox,radio-group,switch,form-summary}-scope.test.tsx`, ★ new `tests/e2e/wave15-sessions-{gallery,public-controls}.spec.ts` (the second is contract 5's fingerprint), new `src/app/[locale]/(dev)/ui/demos/{field,input,textarea,select,checkbox,radio-group,switch,form-summary,session-cta,code-input}.tsx`, `docs/plan/notes/sessions.md`. **Nothing else this wave** — `src/lib/form-state.ts`, the event page, the timeline, the hub, `checkin`'s `rsvp-panel` and the check-in screen are frozen |
| `scoring` | opus | ★ **three new**, the game layer's: `rank-row` (`REQ-UIX-037`) — a falling row carries no colour, no icon and no motion — `race-bar` (`038`) and `level-card` (`039`), two faces, both readable without the flip · the rank change and the flip are **states from props**; their orchestration is the next wave's · a demo per primitive | new `src/components/ui/{rank-row,race-bar,level-card}.tsx`, new `tests/components/ui/{rank-row,race-bar,level-card}.test.tsx`, new `tests/e2e/wave15-scoring-gallery.spec.ts`, new `src/app/[locale]/(dev)/ui/demos/{rank-row,race-bar,level-card}.tsx`, `docs/plan/notes/scoring.md`. **Nothing else this wave** — the ledger, the awards, the boards' screens and their DAL are frozen |
| `console` | sonnet | its **six** primitives onto the scope — `sheet`, `tabs` (the tab **strip**; the phone tab bar is the shell's), `combobox`, `date-time`, `menu`, `data-table` — **tokens only, no animation, no behaviour change** · ★ **the team colour on `SCR-048`** (`REQ-UIX-043`): the field, a swatch **and** the value in words, the DAL's two functions, audited · a demo per primitive | `src/components/ui/{data-table,combobox,menu,tabs,sheet,date-time}.tsx`, `tests/components/ui/{data-table,combobox,menu,tabs,sheet,date-time}.test.tsx` (evidence), ★ new `tests/components/ui/{data-table,combobox,menu,tabs,sheet,date-time}-scope.test.tsx`, new `tests/e2e/wave15-console-gallery.spec.ts`, new `src/app/[locale]/(dev)/ui/demos/{data-table,combobox,menu,tabs,sheet,date-time}.tsx`, ★ `src/components/admin/rtl-datetime-picker.tsx` (**tokens only** — it holds the classes `date-time.tsx` wraps, `DEC-186` §8), ★ `src/app/[locale]/app/admin/companies/**`, the companies functions of `src/lib/dal/admin-lists.ts`, the `companies` keys of `messages/*/admin.json`, `supabase/proposed/console/**`, `tests/components/admin/compan*`, `tests/unit/admin-lists*`, new `tests/rls/team-colour-audit*.test.ts`, new `tests/e2e/wave15-console-*.spec.ts`, `docs/plan/notes/console.md`. **Nothing else this wave** — every other admin route is frozen |

★ = transferred or changed for this wave by `DEC-183`.

**Wave-15 contracts.**

1. **Lead → everyone — the scope and its names** (`DEC-186` §2, which publishes them). The playground is **a scope
   class, never `:root`**: `.theme-play`, with `.theme-play-light` beside it for the light variant, applied only
   through `ui/scope.tsx`. ★ **It reassigns today's context variables, exactly as `.theme-dark` does** — so no
   existing class changes for a colour. ★ **A variant carries the rest**: `pg:`, `pg-dark:`, `pg-light:`, added
   after the existing classes and never replacing one. New names (`raised`, `accent`, `on-accent`, `signal`,
   `hover`, `scrim`, `team`, the four radii, `font-display`, `text-play-*`, `shadow-press`) fall back to today's
   context variable **at the element that uses them**. Nobody edits a primitive before the token commit.
2. **Lead → everyone — the signatures.** `ui/index.ts` is lead-only and append-only. Each owner names its new
   primitive's props in its plan; the lead lands all ten signatures and `AvatarProps.teamColor` as **types** after
   sync 1, and the files beside them start as stubs. Import by path, never from the barrel.
3. **Lead ↔ `console` ↔ `content` — the team colour.** The column is the lead's (`0160`): `companies.team_color`,
   nullable, `#rrggbb`. It travels as `teamColor: string | null` and reaches the DOM as **`--team` on the element**
   — the one place a value from data becomes a style. **Never a class per company, never a hex in a component.**
   `null` draws a neutral ring. `console` writes the field and the DAL; `content` draws the ring; **the avatar's
   fill stays the member's tint** (`REQ-PRF-009`).
4. **Every owner → lead — the gallery.** One demo per primitive at `(dev)/ui/demos/<primitive>.tsx`: every state,
   inside the scope, in Arabic, from fixture data, **no DAL and no session**. The lead imports it into `page.tsx`
   and owns the baseline. **The gallery moves when the lead wires a demo**, and that commit's row names the
   primitive.
5. ★ **The five the public site renders** (`DEC-186` §1 — five, not the eight Step 0 counted). `button` and
   `icons` (the lead's), `field`, `input` and `textarea` (`sessions'`) are imported by `(marketing)` and the
   register form. **One commit each, announced to the lead.** The proof is four parts: `qa:contract`; `visual` at
   0.000 %; ★ a **computed-style fingerprint** of the register form's controls in five states, equal on `main`'s
   build and the branch's (`sessions` writes it first, the lead runs it); and a unit test that the scope's class is
   nowhere in the public import graph. The register form's `name`, `id`, validation and no-JS path are the
   contract, byte for byte.
6. ★ **A portal lands inside the scope** (`DEC-188`, found after sync 1). `dialog`, `sheet` and `menu` render through
   a portal into `<body>`, which is outside the scope. The scope carries a landing element, and
   **`usePlayPortal()`** (`src/components/ui/scope-portal.tsx`, the lead's) returns it — or `undefined` outside a
   scope, which is Radix's default, so nothing moves there. **A primitive that portals passes it as `container`**:
   `dialog` is the lead's and done; `menu` and `sheet` are `console`'s. The toast region is the shell's and stays
   outside the scope until the shell enters it.

**Wave-15 rules.**

- ★★ **Nothing visible changes.** Not in the app, not on the public site. If a screen looks different after your
  commit, the primitive is reading the playground outside the scope, and that is a defect — not a preview.
- ★ **The frozen routes do not move**: `qa:contract` green at every commit, `qa:appearance` and `visual`
  **unchanged, not re-baselined**. ★ **This wave the `TaskCompleted` hook falls through to the full `qa` for the
  five primitives of contract 5, and that is expected** — it does not mean you edited something that is not yours.
  For any other file it still does.
- ★ **`docs/plan/` wins over `docs/design/`.** `DEC-183` §4 lists seventeen disagreements already. **A new one is
  the most useful thing a plan can contain**: write it down with the file and the line, and do not pick a side.
- ★ **Semantic names only, and now a gate holds it** (`DEC-186` §9, `tests/unit/tokens-only.test.ts`). A file
  created this wave holds **no hex, no literal duration, no raw palette name**; in every file, no class after
  `pg:`, `pg-dark:` or `pg-light:` does. No prototype class name, anywhere. A colour from data arrives as `--team`.
- ★ **The status colours are `DEC-073`'s** (`DEC-186` §3). `01-tokens.md`'s status table is not adopted; inside a
  dark scope a badge wears the on-dark constants it already has.
- ★ **New cases go in new files** — `<primitive>-scope.test.tsx` beside the existing test, which is not edited.
  Each track writes one `tests/e2e/wave15-<track>-gallery.spec.ts`; the lead runs it.
- ★ **No primitive gains or loses a behaviour.** A structural change — a full-height sheet, a 52 px action — is an
  **opt-in prop**, shown in the gallery and adopted by a later wave.
- ★ **States, not moments — and no new keyframe** (`DEC-186` §4). A new primitive renders each state from props, and
  nothing pops this wave: the owner's accepted text allows an overshoot of `1.08` on a sticker and no other, and
  `03-motion.md` asks for `1.22`. The question goes to the owner with the moments. **Confetti, the coin's drop, the
  count-up, the FLIP and the flip's orchestration are the next wave's** (`DEC-183` §2).
- ★ **No primitive is placed on a screen**, and none reads the DAL, a session or a message catalogue: strings arrive
  as props. The one screen that changes is `SCR-048`.
- ★ **No new dependency** — no icon library, no motion library, no `sharp` (`DEC-183` §4.12). `package.json` is the
  lead's.
- ★ **The existing suites are evidence.** Each changed assertion is a ledger line in `STATUS.md`, written in the
  same commit as the change. New behaviour gets new files.
- ★ **Additive, because `main` runs on it first.** Migrations from `0160`; one nullable column. The owner rehearses
  on a production schema dump, pushes, merges, then reconnects Railway. `main`'s app and worker on the new schema
  do nothing different. **No migration writes a colour onto a company** (`DEC-183` §4.11).
- ★ **`registrations` is never touched** (invariant 2).
- **Teammates spawn planning-only**; sync 1 approves four plans against the five contracts.
- **Tables are the lead's; behaviour is the tracks'. A function has one writer. One writer per file, specs and
  demos included.**
- **`ui-lint --strict` has no allowlist and never gains one.** A new primitive complies from birth.
- **Captures land at `.qa-shots/rtl/wave15-<track>-<primitive>-<state>.png`** in the main checkout — the phone
  project at `390 × 844` **and** one at desktop width — from a production build the row names by commit, honouring
  `E2E_SHOTS_DIR`. The lead opens every one **in bands, never downscaled**.
- **Not this wave, and never-touch for every teammate:** the five moments and everything that orchestrates; session
  stories and their viewer; the timeline's recap, achievement and announcement items; proposal voting; the weekly
  leaderboard; the streak rule; **any screen redesign, the shell and the phone tab bar included**; everything under
  `(marketing)/**` and the components it renders, beyond contract 5's proof; the desktop shell (`DEC-NEXT-15`,
  deferred); leagues (deferred); the certificate look — **the playground stops at the certificate's edge**; the
  designer's document model, its templates and the export pipeline; the favicon, the shell's wordmark and the first
  org's logo (`DEC-183` §4.8 – §4.10); the generated gate for Storage read predicates (carried from wave 14);
  deleting a session with its awarded points (carried); a member uploading their own picture; recurring series
  (`A14`); replacing the renderer.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`,
  `stop`, branch switches, pushes and the PR.

### Ownership map (wave 14 — photos, the lightbox, the wordmark, the avatar, DEC-180) — ★ THE RECORD OF A FINISHED WAVE

> Wave 14 merged as PR #31 (`d29b362`). Its map is kept as the record; **wave 15's map is directly above** (`DEC-183`).

**Half of this was specified long ago and never built** (`DEC-180`, milestone **M16**). **(1)** A session's photographs
open whole in a lightbox you move through by **tapping** (`REQ-EVT-016`, new) — ★ **`DEC-093`'s sixth place**: a swipe
is the enhancement, never the only path. **(2)** A photograph and a session's album are downloaded, **audited**; the
album by `JOB-zip_session_photos` (`REQ-ADM-021`, M11 — never run). **(3)** ★ **Google's photo is copied into our
storage, never hotlinked** — the owner kept `DEC-099` when asked (`REQ-PRF-008`'s import half, M10 — never run); the
brief's «one line» would have overruled it. **(4)** Inside `/app` the wordmark leads to `/app` (`REQ-UIX-027`, new).
The checklist is `STATUS.md`'s wave-14 block. **Four demonstrables:** the lightbox driven through every photograph with
`page.click()` alone, the displayed photograph changed each time; ★ **`qa:contract` and `visual` unmoved by the
wordmark — not re-baselined, unmoved**; a member who said yes sees their photo in the account menu and one who said no
sees initials, both at 390 px; staff press «تنزيل الكل», the response returns at once, and **the real worker's** zip
holds the EXIF-stripped files and no others.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-180`, this map, the ten agent files, `01`/`04`/`09`/`11`/`14`/`15` · ★ **the wordmark**: an additive `href` prop defaulting to `/`, the app shell passing `/app`, `qa:contract` + `visual` **unmoved** · ★ **the shell's avatar** through contract 4 and the **consent prompt's slot** · ★ **the live hotlink closed first** — the Google `img-src` entry, both comment carriers and `0155` (`92953c8`, before the feature) · every table, column and bucket, and ★ **the two photo audit definers** (contract 1) — from **`0155`** · the job registrations · `worker/Dockerfile`'s binaries (a zip binary; `cwebp` is there already) · the demonstrable specs · the gates, `STATUS`, the PR | the lead-only paths below, `supabase/migrations/**` from `0155`, `src/components/{wordmark,header,footer}.tsx`, `src/app/[locale]/app/layout.tsx`, `src/lib/dal/session.ts`, `src/components/shell/**`, `src/proxy.ts`, `packages/storage-paths/src/index.ts`, the lead's fifteen `ui/` files, `src/app/globals.css`, `worker/src/index.ts`, `messages/*/{ui,app,marketing}.json`, new `tests/rls/photo-downloads*.test.ts`, new `tests/e2e/wave14-{demo,lead}-*.spec.ts`. **Custodian** of every file of a track not spawned — `sessions`, `checkin`, `scoring`, `designer`, `console`, `event`, `notify`, `branding` — edited only for its own rows or on a teammate's written request; ★ this wave that includes `lib/dal/{members,ratings}.ts`'s avatar expression (contract 4) and `notify`'s one message key if the album's notification needs one |
| `content` | ★ **opus** | ★ **the gallery and the lightbox** (`REQ-EVT-016`): a tap opens the photograph whole, previous/next **always-visible tap targets**, Escape and the backdrop close, focus returns to the tile, «3 من 12», on the lead's `ui/dialog` · the grid's crop **deliberate and written down** (`REQ-UIX-026`) · ★ **`REQ-ADM-021`**: a per-photo download for any viewer who may see it, **«تنزيل الكل»** for staff in the photo group's header, `JOB-zip_session_photos` writing a zip of the visible, EXIF-stripped objects through the one path builder and notifying — **every download through an audited route** (contract 1) · the SC 2.5.7 tap-only spec and the album spec with the real worker · ★ the comment's avatar through contract 4's resolver once it lands (the hotlink itself is already closed, `92953c8`) | `src/components/{photos,viewer,materials,tasks}/**`, `src/lib/dal/{photos,materials,tasks}.ts`, `src/app/api/upload/**`, new `src/app/api/photos/**`, `src/lib/storage/**`, `packages/storage-paths/src/content.ts`, `worker/src/content/**`, `worker/src/tasks/{convert_document,render_pages,process_photo}.ts` and new `zip_session_photos.ts`, its nine `ui/` primitives, `messages/*/{photos,materials,tasks}.json`, `supabase/proposed/content/**`, `tests/rls/{materials,photos,tasks,storage-content}*.test.ts`, `tests/unit/{materials,photos,tasks,storage}*`, `tests/components/{materials,photos,tasks,viewer}/**`, `tests/components/ui/{card,badge,tag-chip,avatar,progress,empty-state,stat,panel,file-drop}.test.tsx`, `tests/e2e/{materials,photos,tasks,proposal-materials}.spec.ts` and `tests/e2e/wave{9,10,11}-content-*.spec.ts` (evidence), new `tests/e2e/wave14-content-*.spec.ts`, `docs/plan/notes/content.md`. **Fixes only**: `src/components/event/{comments,comment-composer,comment-item,comment-list}.tsx` and `actions.ts`, `src/lib/dal/{comments,reactions,reports}.ts`, `src/lib/realtime/**`, `src/app/[locale]/app/me/{page,layout,loading,error}.tsx`, `me/bookmarks/**`, `src/components/me/**`, `messages/*/{event,profile}.json` |
| `platform` | opus | ★ **the avatar, copied** (`REQ-PRF-008`'s import half, `REQ-PRF-009`, `REQ-PRF-011`): «نستخدم صورتك من Google؟» offered once — a component the lead slots into the shell — and changeable on `/app/me/privacy` · `JOB-import_avatar` (the thirty-sixth job): fetched from **Google's image host only**, byte-capped, sniffed, **EXIF-stripped**, stored under the org's prefix · ★ **one avatar route** and **one resolver** (contract 4) so no DTO ever carries a Google URL again · a changed Google source re-copies for a member who said yes · `anonymise_members` **deletes the objects**; `build_data_export` **includes the picture**; `assert_storage_prefixes` covers the new objects · ★ the path shape in a new `packages/storage-paths/src/avatar.ts` | new `src/app/api/avatars/**`, new `src/lib/dal/avatars.ts`, `src/lib/dal/privacy.ts`, ★ `src/app/[locale]/app/me/privacy/**` and `messages/*/privacy.json` (from `content`), `src/components/{privacy,platform}/**`, new `packages/storage-paths/src/avatar.ts`, `worker/src/platform/**`, new `worker/src/tasks/import_avatar.ts`, `worker/src/tasks/{anonymise_members,build_data_export,assert_storage_prefixes}.ts`, **fixes only** `worker/src/tasks/{enforce_retention,expire_impersonation,delete_org,evaluate_alerts}.ts` and `src/app/[locale]/app/platform/**`, `src/app/api/platform/**`, `src/lib/dal/{platform,platform-templates}.ts`, `messages/*/platform.json`, `supabase/proposed/platform/**`, `tests/rls/{platform,impersonation,retention,delete-org,alerts,avatar,privacy}*.test.ts`, `tests/unit/{platform,alerts,avatar,privacy}*`, `tests/components/{platform,privacy}/**`, `tests/e2e/{platform*,wave8-platform-*,wave11-platform-*}.spec.ts` (evidence), new `tests/e2e/wave14-platform-*.spec.ts`, `docs/plan/notes/platform.md` |

★ = transferred or changed for this wave by `DEC-180`.

**Wave-14 contracts.**

1. **`content` → everyone — one audited download route per photo subject.** A link to a route that writes the audit
   row and then `303`s to a short-lived signed URL. **Never a signed URL in page data, never a plain
   `<a download>`** (`DEC-177`). `record_export_download()` (`0152`) is for export artifacts; photos are a different
   bucket and policy, so **the lead lands their definers** — one for a photograph (who may see it may download it),
   one for the album (staff only, which audits and enqueues) — from the shapes `content`'s plan names. A refusal
   `303`s back with `?download=failed`. A preview is not a download (`DEC-178`); thumbnails stay signed URLs.
2. **Lead ↔ `content` — the album.** Any table for an album's state, its bucket and its policy are the lead's, from
   `content`'s plan. The zip's path goes through the one builder (`content`'s). The job's registration in
   `worker/src/index.ts` is the lead's. The zip holds **visible photographs only** — never a hidden or removed one.
   If «ready» needs a new `notify()` key, it is the lead's as `notify`'s custodian, on `content`'s written request.
3. **Lead → both — the audit action names**, fixed in `DEC-180`: `photo.downloaded`, `photo_album.requested`,
   `photo_album.downloaded`.
4. **`platform` → every avatar reader — one resolver.** `src/lib/dal/avatars.ts` turns a member into a same-origin
   `href` to `/api/avatars/<memberId>` (with a version for caching) or `null`. The DTO field keeps its name
   (`avatarUrl`) and its type. Readers swap one expression: `session.ts` (the lead), `comments.ts` and
   `comment-list.tsx` (`content` — never a URL back in the SQL payload), `ratings.ts` and `members.ts` (the lead, as custodian). **The published name and type go in
   `platform`'s note on day one.** ★ **The live hotlink is closed ahead of the feature** (`92953c8`, `DEC-181`):
   the Google `img-src` entry is gone, both comment carriers say `null`, `0155` nulls the realtime payload.
   `members.avatar_url` stays the source Google provisions (`0005:124`) and is never
   rendered.

**Wave-14 rules.**

- ★ **`DEC-093` is the specification for the lightbox.** Previous and next are tap targets, always visible. The
  swipe is layered on and optional. The gate is a Playwright case with `page.click()` alone; axe never catches this.
- ★ **`DEC-099` stands.** No `<img>` loads from a domain the platform does not control. A Google URL reaching a
  browser, in HTML, a DTO or a realtime payload, is a defect.
- ★ **The wordmark row is additive, and its acceptance is that nothing moves.** `qa:contract` and `visual` are
  **unmoved, not re-baselined**. No teammate touches `wordmark.tsx`, `header.tsx`, `footer.tsx` or `(marketing)/**`.
- ★ **An album download never runs inside a request** (`REQ-ADM-021`). The route enqueues and returns.
- ★ **No npm package for image or archive work** (`DEC-181`). The worker uses **system binaries from
  `worker/Dockerfile`** (the lead's) — `poppler-utils` and `cwebp` today (`worker/src/content/pdf.ts:16`: «None is an
  npm dependency»). The 96 px and 192 px avatar derivatives are `cwebp -resize`, which needs nothing new — «a size
  list, not a new job» (`DEC-099`). The album's zip follows the same pattern: a binary added to the Dockerfile, not
  `archiver` or `jszip`. A plan that proposes an npm package says why a binary will not do; `npm run lockfile` runs
  through Docker only.
- ★ **`qa:contract` green at every commit. `registrations` is never touched** (invariant 2).
- ★ **The existing suites are evidence.** Each changed assertion is a ledger line in `STATUS.md`, written in the
  same commit as the change. New behaviour gets new files.
- ★ **Additive, because `main` runs on it first.** Migrations from `0155`. The owner rehearses on a production
  schema dump, pushes, merges, then reconnects Railway. **`main`'s worker runs the new schema before the new code**,
  so a plan says what `main`'s worker does in the gap. The expected answer is «nothing moves».
- **Teammates spawn planning-only**; sync 1 approves two plans against the four contracts.
- **Tables are the lead's; behaviour is the tracks'. A function has one writer. One writer per file, JSON and specs
  included.**
- **`ui-lint --strict` has no allowlist and never gains one.** Every track that ships a screen runs
  `npm run ui-lint` before it commits.
- **Captures land at `.qa-shots/rtl/wave14-<track>-<surface>-<state>.png`** in the main checkout, phone project,
  `390 × 844`, from a production build the row names by commit, honouring `E2E_SHOTS_DIR`. The lead opens every
  one **in bands, never downscaled**.
- **Not this wave, and never-touch for every teammate:** a member uploading their own picture and `REQ-PRF-010`'s
  avatar moderation (`STORY-PRF-005`'s upload half); new avatar placements (presenter cards, the host view's list,
  the directory, browse cards); deleting a session with its awarded points (wave 15's whole subject); the
  gamification layer; the prose pass; `DEC-100`'s motion system; live poster thumbnails before export
  (`REQ-DSG-029`'s carry); the stale email-studio test; the «still generating» line's placement on phones;
  everything under `(marketing)/**` beyond the wordmark's additive prop; recurring series (`A14`); drag in
  `ui/reorderable-list`; replacing the renderer.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`,
  `stop`, branch switches, pushes and the PR.

### Ownership map (wave 13 — the studio, the session download, the settings hub, DEC-176) — ★ THE RECORD OF A FINISHED WAVE

> Wave 13 merged as PR #30 (`7a66690`). Its map is kept as the record; **wave 14's map is directly above** (`DEC-180`).

**Most of this scope was specified long ago and never built** (`DEC-176`, milestone **M15**). **(1)** The studio gets
direct manipulation (`REQ-DSG-028` … `030`, the rest of `031`, M12 — never run). **(2)** Staff and presenters download
a session's poster, and staff download its certificates, from the session (`REQ-DSG-027`, M11 — never run). This is
read with the owner's «simple» ruling: **one primary «تنزيل», the other formats behind a disclosure**. **(3)** A
session's settings are reached from one sub-nav (`REQ-SES-020`, new). The checklist is `STATUS.md`'s wave-13 block.
**Four demonstrables:** every studio operation done with `page.click()` alone, with the document changed each time;
an `ar` and an `en` console storing byte-identical documents for «align start»; **no parity golden moves**; and
★ **a staff member downloads a session's poster and its certificates from the session, at 390 px in Arabic,
without ever opening `/app/admin/designer`.**

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-176`, this map, the ten agent files, `01`/`04`/`09`/`14`/`15` · ★ **contract 3, the download audit**: one definer function on `0049`'s pattern, which re-derives «admin, moderator or an accepted presenter of this session» and writes `audit_log` · every table change · ★ **`04`'s route table reconciled** — `attendance`, `certificates` and the hub, in the hub's commit · promotion from **`0152`** · the demonstrable specs · the gates, `STATUS`, the PR | the lead-only paths below, `supabase/migrations/**` from `0152`, the lead's fifteen `ui/` files, `src/app/globals.css`, `src/components/shell/**`, `src/app/[locale]/(dev)/**`, `messages/*/{ui,app,auth}.json`, new `tests/e2e/wave13-{demo,lead}-*.spec.ts`, new `tests/rls/session-downloads*.test.ts`. **Custodian** of every file of a track not spawned — `checkin`, `scoring`, `content`, `event`, `notify`, `platform`, `branding` — edited only for its own rows or on a teammate's written request |
| `designer` | opus | ★ **`REQ-DSG-028` — direct manipulation in the overlay**: drag, eight-handle resize, rotate, snap with guides, arrow-key nudge, marquee, group align/distribute — **reusing the seven helpers already written**, with **`DEC-093`'s non-dragging path for every one** and **`DEC-096`'s axes** · ★ **the research first**, in the plan: the five open questions of `DEC-176` §1, and which overlay-only libraries were evaluated · **`REQ-DSG-029`** and **`REQ-DSG-031`**, whatever is not yet built · ★ **`REQ-DSG-030`**: the focal dot **and** the nine-point grid, centre by default, **no golden moves** · ★ **one signer**: `signExportUrl()`, `signCertificateUrl()` and `posters.ts:351` fold into one · ★ **contract 1, the download DTO, published on day one** · the certificates screen's per-certificate download · the SC 2.5.7 tap-only spec and the byte-identical «align start» unit | `packages/designer-runtime/src/**` **except** `brand.ts`, `packages/storage-paths/src/designer.ts`, `src/components/{designer,posters}/**`, `src/components/certificates/**` except `held-achievements.tsx`, `src/app/[locale]/app/admin/designer/**`, `src/app/[locale]/app/admin/templates/{posters,certificates}/**` and `templates/{actions,state}.ts`, `src/app/[locale]/app/admin/sessions/[id]/certificates/**`, **fixes only** `src/app/[locale]/app/me/certificates/**` (the signer's fold), `src/app/api/{designer,fonts,certificates}/**`, `src/lib/dal/{designer,templates,posters,certificates,fonts}.ts`, `worker/src/render/**` except `brand.ts` and its four tasks, `scripts/parity/**` minus `goldens/`, `messages/*/{designer,templates,certificates}.json`, `supabase/proposed/designer/**`, `tests/rls/{designer,templates,posters,certificates,fonts,exports}*.test.ts`, `tests/unit/{designer,render,posters,certificates,qr,fonts,serial}*`, `tests/components/{designer,certificates,posters}/**`, `tests/components/me/certificates-page.test.tsx`, `tests/e2e/{designer,templates,certificates,posters}*.spec.ts`, `tests/e2e/wave{7-content-certificates,8-designer-*,10-designer-*}.spec.ts` (evidence), new `tests/e2e/wave13-designer-*.spec.ts`, `docs/plan/notes/designer.md` |
| `sessions` | opus | ★ **the session settings hub** (`REQ-SES-020`): one sub-nav over the routes that exist — schedule, presenters, the poster, the certificate mode (★ **off the schedule screen, where its own screen says it lives wrongly**), certificates, attendance, the survey, and a way to materials, tasks and photos — **without a fifth orphan screen** · ★ **`REQ-DSG-027`'s «تنزيل»** on the event page and the hub, rendering contract 1's DTO: **one primary file, the rest behind a disclosure**, pending shown as pending, **never touching storage or the signer** · the audit call through contract 3 | `src/app/[locale]/app/admin/sessions/**` **except** `[id]/{certificates,attendance,survey}/**` — ★ the list's top level (from `console`), the schedule, and a new `[id]/{layout,page}.tsx` · `src/app/[locale]/app/sessions/[id]/**` except `{check-in,host,rate,materials}/**`, `src/components/{sessions,browse}/**`, `src/lib/dal/{sessions,proposals}.ts`, `messages/*/{sessions,proposals,schedule}.json`, `supabase/proposed/sessions/**`, `tests/rls/{sessions,proposals,session-presenters}*.test.ts`, `tests/unit/{sessions,schedule-rules,schedule-actions}*`, `tests/components/{sessions,browse}/**`, `tests/components/checkin/schedule-form.test.tsx`, its existing e2e specs (evidence), new `tests/e2e/wave13-sessions-*.spec.ts`, `docs/plan/notes/sessions.md`. **Fixes only**: its other files — the timeline, `propose/**`, `members/**`, `leaderboards/**`, `components/search/**`, `lib/dal/{search,bookmarks,members}.ts`, `lib/form-state.ts`, its eight `ui/` primitives, `worker/src/tasks/{start,complete}_session.ts` |
| `console` | sonnet | the admin rail's entry for the hub · ★ **`/app/admin/templates`' card grid** (`16` §10.3): «منشور»/«مسودة», duplicate, a usage count, the platform library as a separate section that is read-only until copied — **measured first**: no index page exists, and if the grid belongs on `designer`'s two pages, the row becomes a request to `designer` (contract 4) · the 390 px and accessibility review of the hub and the grid | `src/app/[locale]/app/admin/**` **except** `sessions/**`, `designer/**`, `templates/{posters,certificates}/**`, `templates/{actions,state}.ts`, `branding/**`, `emails/**`, `surveys/**` — **fixes only** on every existing route; new `templates/{page,loading,error}.tsx` · `src/app/api/admin/**` except `branding` and `emails` · `src/components/admin/**` except `delivery-reason.ts` · `src/lib/dal/admin*.ts`, `src/lib/dal/scoring-admin.ts` · its six `ui/` primitives · `messages/*/admin.json` · `supabase/proposed/console/**` · `tests/{unit,rls}/admin*`, `tests/components/admin/**` except `emails-page.test.tsx`, `tests/e2e/admin*.spec.ts` except `admin-attendance*`, `tests/e2e/wave{6,7,8,11}-console-*.spec.ts` (evidence) except `wave8-console-emails` and `wave11-console-attendance`, new `tests/e2e/wave13-console-*.spec.ts` · `docs/plan/notes/console.md` |

★ = transferred or changed for this wave by `DEC-176`.

**Wave-13 contracts.**

1. **`designer` → `sessions` — the download DTO.** One DAL function in `src/lib/dal/posters.ts`. Per session, it
   returns the ready artifacts with preset, format and `byte_size`, and the pending ones **as pending, never as a
   broken link**. It also names which artifact is the primary download. ★ **Each ready artifact carries an
   `href` to `designer`'s download route.** The route calls contract 3's audit, then redirects to a URL from
   **the one signer**. It is never a signed URL minted at render time, because a bare `<a download>` writes no
   audit row. The name and the type go in `designer`'s note on day one. `sessions` renders it and never calls
   storage or a signer.
2. **`sessions` ↔ `designer` — the certificate mode.** It is written on the schedule screen (`sessions`) and read
   on the certificates screen (`designer`). After this wave it has **one writer**, and the other screen only shows
   it. Ruled at sync 1 and written in `DECISIONS.md`.
3. **Lead — the download audit.** `REQ-DSG-027` and `REQ-ADM-021`: every download writes an audit row. `audit_log`
   is append-only with `service_role` revoked (invariant 9). The write goes through one definer function the
   lead lands, **created from nothing** — `DEC-076`'s «`0086`» was never written (`DEC-177`). It **re-derives who
   may download** (a poster: admin, moderator, an accepted presenter; a certificate: admin, moderator, its own
   member) **and refuses everyone else with `42501`**, which is where «refused by policy» lives: a poster's bytes
   have been readable by the org since `DEC-173`, by design. ★ `me/certificates`' unaudited `<a download>` moves
   onto the same route.
4. **`designer` → `console` — the templates grid** reads `designer`'s DAL. A new DAL function is a request to
   `designer`, never an edit.

**Wave-13 rules.**

- ★ **`DEC-093` is the specification, not advice.** The inspector's numeric X/Y/W/H/rotation fields are the
  `SC 2.5.7` conformance path. **They may be demoted into a collapsed accordion, never deleted.** Every dragged
  operation has a single-pointer path, and **a marquee is never the only way to select more than one layer.**
  The gate is a Playwright case using `page.click()` alone. axe never catches this.
- ★ **`DEC-096`: the overlay uses physical `left`/`top` computed from document geometry**, with the exemption
  written where the code is. Nobody tidies it to logical properties. Align, distribute and rulers follow the
  **document's** axis, and arrow keys the **visual** one.
- ★ **The engine is not replaceable** (`DEC-017`, `DEC-048`). Anything evaluated sits in the overlay; a library
  that wants to own rendering is disqualified on sight. A new dependency is a `package.json` change and
  therefore **the lead's**, on a written request.
- ★ **No parity golden moves.** The focal point defaults to the geometric centre, so an untouched document derives
  identically. **A golden that moves is a bug, not a re-baseline.** `scripts/parity/goldens/**` is the lead's.
- ★ **`qa:contract` green at every commit. `registrations` is never touched** (invariant 2).
- ★ **The existing suites are evidence.** Each changed assertion is a ledger line in `STATUS.md`, written in the
  same commit as the change. New behaviour gets new files.
- ★ **Additive, because `main` runs on it first.** Migrations from `0152`. The owner rehearses on a production
  schema dump, pushes, merges, then checks Railway. **`main`'s worker renders with `main`'s runtime** until the
  merge, so a change to what a render produces says in the plan what `main`'s worker does in the gap. The
  expected answer is «nothing moves».
- **Teammates spawn planning-only**; sync 1 approves three plans against the four contracts.
- ★ **Sync 1's rulings (`DEC-177`, `DEC-178`) are part of this map.** The mode is written only on SCR-045, through `sessions'` function and `designer`'s control. **Every download — the menus, SCR-045, the studio's panel and `me/certificates` — goes through `designer`'s one audited route.** D1b (adding and editing layers) and D2b (`schemaVersion: 2`) are in. `/app/admin/templates` is a redirect plus `designer`'s tab strip.
- **Tables are the lead's; behaviour is the tracks'. A function has one writer. One writer per file, JSON and
  specs included.**
- **`ui-lint --strict` has no allowlist and never gains one.** Every track that ships a screen runs
  `npm run ui-lint` before it commits.
- **Captures land at `.qa-shots/rtl/wave13-<track>-<surface>-<state>.png`** in the main checkout, phone project,
  `390 × 844`, from a production build the row names by commit, honouring `E2E_SHOTS_DIR`. The lead opens every
  one **in bands, never downscaled**.
- **Not this wave, and never-touch for every teammate:** deleting a session with its awarded points; the photo
  gallery and lightbox, `REQ-ADM-021`'s «تنزيل الكل» and `JOB-zip_session_photos`; the wordmark link
  (`app/layout.tsx` imports the marketing `Wordmark`); Google avatars (`avatarUrl={null}`); the gamification
  layer; the prose pass; `DEC-100`'s motion system; everything under `(marketing)/**`; recurring series (`A14`);
  **replacing the renderer**; drag in `ui/reorderable-list`.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`,
  `stop`, branch switches, pushes and the PR.

### Ownership map (wave 12 — presenters, awards at completion, the whole poster, DEC-172) — ★ THE RECORD OF A FINISHED WAVE

> Wave 12 merged as PR #29 (`750367f`). Its map is kept as the record; **wave 13's map is directly above** (`DEC-176`).

**New scope after the plan** (`DEC-171` closed it; `DEC-172` opens this, milestone **M14** so its stories trace).
Three items: **(1)** an admin changes a session's presenters after creation (`REQ-SES-019`); **(2)** every
session award pays at completion and check-in says what is pending (`REQ-PTS-015`, `REQ-CHK-018`) — the one-day
exception in `attendance_recorded()` ends and `proposal_accepted` moves from approval to completion (the owner's
answer); **(3)** a poster is never cropped (`REQ-UIX-026`). The checklist is `STATUS.md`'s wave-12 block. **The
measure adds three demonstrables:** a 390 px capture of the timeline card showing a whole poster beside the
owner's cropped one; a presenter added and removed **after** completion with the ledger proving both; a one-day
session where a member checks in, is told what is pending, has **no** ledger row until completion — and the same
member removed **before** completion leaves no row and no reversal.

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ `DEC-172`, this map, the ten agent files, `01`/`09`/`14`/`15` · ★ **the poster** (`REQ-UIX-026`): `CardMedia` never crops, each surface's aspect decided and written down, the public card's `visual` pair, `qa:appearance` if it moves, and the `(dev)` gallery re-baselined **in the same commit** · every table change · promotion from **`0145`** · the three demonstrable specs · the gates, `STATUS`, the PR | the lead-only paths below, `supabase/migrations/**` from `0145`, ★ `src/components/ui/card.tsx` (custodian of `content`'s primitive, for this row), ★ `src/components/browse/session-card.tsx` and `src/app/[locale]/s/[id]/page.tsx` (from `sessions`, for the wave), `tests/components/ui/card.test.tsx`, new `tests/e2e/wave12-{demo,lead}-*.spec.ts`, the lead's fifteen `ui/` files, `src/app/globals.css`, `src/components/shell/**`, `src/app/[locale]/(dev)/**`, `messages/*/{ui,app,auth}.json`. **Custodian** of every file of a track not spawned — `content`, `console`, `designer`, `event`, `notify`, `platform`, `branding` — edited only for its own rows or on a teammate's written request |
| `scoring` | opus | ★ **the timing** — `attendance_recorded()` evaluates only a completed session; `award_points()` loses the multi-day-only clause; `proposal_accepted` paid by the completion fan-out **under its existing key** · ★ **presenter awards follow the presenter** — triggers on `session_presenters`: paid on becoming an accepted presenter of a completed session, a compensating row per held presenter award on leaving (`0087`'s shape), an epoch so a re-added presenter can be paid again · ★ **the pending state, computed**: one function and one DTO (contract 1) · streaks and badges count completed sessions · every downstream reader measured — `me/points`, leaderboards, recognition, the balance audit | `supabase/proposed/scoring/**`, `src/lib/dal/{points,leaderboards,recognition}.ts`, `src/app/[locale]/app/me/points/**`, `src/components/scoring/{points-history-list,points-catalogue,points-strip}.tsx`, `worker/src/tasks/{award_points,award_presenter_points,evaluate_no_shows,evaluate_streaks,evaluate_badges,evaluate_levels_perks,snapshot_leaderboards,audit_balances}.ts`, `messages/*/scoring.json`, `tests/rls/{scoring,points,award,leaderboards,recognition,audit-balances,manual-adjustment,snapshot,all-time}*.test.ts`, ★ `tests/rls/checkin-{contract-5,late-job-hooks,manual-mark,removal}.test.ts` (from `checkin`, **evidence** — the timing expectations only, each under a ledger line), `tests/unit/scoring*`, `tests/components/scoring/**`, `tests/e2e/points.spec.ts`, `tests/e2e/wave9-scoring-*.spec.ts`, new `tests/e2e/wave12-scoring-*.spec.ts`, `docs/plan/notes/scoring.md` |
| `sessions` | opus | ★ `add_session_presenter()` / `remove_session_presenter()` — admin only, audited, an added presenter **assigned** (`accepted = true`), the last one never removable; they write the table and **never award or reverse** (contract 2) · the DAL functions · the presenters section on SCR-043 from `components/admin/member-picker` (imported, not edited) and `RemovePresenter` (generalised, the proposal's use unchanged) | `supabase/proposed/sessions/**`, `src/app/[locale]/app/admin/sessions/[id]/schedule/**`, `src/components/sessions/**`, `src/lib/dal/{sessions,proposals}.ts`, `messages/*/{sessions,proposals,schedule}.json`, `tests/rls/{sessions,proposals,session-presenters}*.test.ts`, `tests/unit/{sessions,schedule-rules,schedule-actions}*`, `tests/components/sessions/**`, `tests/components/checkin/schedule-form.test.tsx`, `tests/e2e/{wave8-lead-schedule,checkin-schedule-walk-ins,wave9-sessions-schedule-days}.spec.ts` (evidence), new `tests/e2e/wave12-sessions-*.spec.ts`, `docs/plan/notes/sessions.md`. **Fixes only**, on a written request: its other files — the timeline, browse, the event page, `propose/**`, `members/**`, `leaderboards/**` and `components/scoring/{member-board,company-board,company-points-breakdown}.tsx` (a leaderboard change `scoring` measures is a request to `sessions`) |
| `checkin` | opus | ★ **the acknowledgement** (`REQ-CHK-018`): SCR-014 after a verified check-in, and `attendance-outcome` on the event page, render contract 1's DTO — nothing earned, pending (the amount; days attended of days required), paid, incomplete — **a state read from the data, the same after a reload, never a toast** · the check-in path writes no ledger row and says so | `src/app/[locale]/app/sessions/[id]/{check-in,host}/**`, ★ `src/app/[locale]/app/admin/sessions/[id]/attendance/**` (back from `console`), `src/components/checkin/**`, `src/lib/dal/{rsvp,checkin}.ts`, `worker/src/tasks/{promote_waitlist,rotate_codes}.ts`, `messages/*/{rsvp,checkin}.json`, `supabase/proposed/checkin/**`, `tests/rls/{rsvp,checkin,priority-rsvp}*.test.ts` **except the four with `scoring`**, `tests/unit/session-matrix.test.ts`, `tests/unit/checkin-*`, `tests/components/checkin/**` except `schedule-form.test.tsx`, `tests/e2e/{checkin,checkin-gating}.spec.ts`, `tests/e2e/wave{7,9}-checkin-*.spec.ts`, `tests/e2e/admin-attendance*.spec.ts`, `tests/e2e/wave11-console-attendance.spec.ts` (evidence), new `tests/e2e/wave12-checkin-*.spec.ts`, `docs/plan/notes/checkin.md` |

★ = transferred or changed for this wave by `DEC-172`.

**Wave-12 contracts.**

1. **`scoring` → `checkin` — the pending state.** One SQL function for the caller and a session, and one DAL
   function in `src/lib/dal/points.ts` returning a DTO — `state` (`none` · `pending` · `paid` · `incomplete`),
   the points, the days attended and required. **Computed, never stored** (`REQ-PTS-001`, invariant 9). The
   names and the type are in `scoring`'s note on day one; `checkin` renders against the type and never queries
   `points_ledger` itself.
2. **`sessions` ↔ `scoring` — presenter rows and their awards.** `sessions`' RPCs insert and delete
   `session_presenters` rows and nothing else. `scoring`'s triggers on that table decide what is paid or
   reversed, so a direct admin write under `0010`'s policies is covered too. **A removal is a `delete`,
   never `declined_at`**, which would fire `session_presenter_declined()` and can unpublish a session.
3. **Lead — tables.** No new table is expected. A column any track needs is named in its plan and the lead
   lands it.

**Wave-12 rules.**

- ★ **`qa:contract` green at every commit.** Only the lead's poster commit may move `qa:appearance` or the
  `visual` baseline, and it re-baselines both in the same commit (`DEC-167`).
- ★ **`registrations` is never touched** (invariant 2).
- ★ **The existing suites are evidence.** Moving the award changes expectations on purpose, so **each
  changed assertion is a ledger line in `STATUS.md`**, written in the same commit as the SQL that moves it —
  never discovered at the gate. New behaviour gets new files.
- ★ **Additive, because `main` runs on it first.** Migrations from `0145`; the owner rehearses on a production
  schema dump, pushes, merges, then checks Railway. **`main`'s worker runs the new schema before it runs the
  new code**, so prefer SQL that enqueues an existing job under an existing key to a changed worker task — and
  where a task must change, the plan says what `main`'s worker does in the gap.
- **Teammates spawn planning-only**; sync 1 approves three plans against the three contracts.
- **Tables are the lead's; behaviour is the tracks'. A function has one writer. One writer per file, JSON and
  specs included.**
- **`ui-lint --strict` has no allowlist and never gains one.** Every track that ships a screen runs
  `npm run ui-lint` before it commits.
- **Captures land at `.qa-shots/rtl/wave12-<track>-<surface>-<state>.png`** in the main checkout, phone
  project, `390 × 844`, from a production build the row names by commit, honouring `E2E_SHOTS_DIR`. The lead
  opens every one **in bands, never downscaled**.
- **Not this wave, and never-touch for every teammate — the owner's remaining list:** per-session settings
  consolidated; deleting a session with its awarded points; the photo gallery with a lightbox; the wordmark
  navigating to marketing rather than `/app`; Google avatars discarded (`avatarUrl={null}`); the gamification
  layer (contract 1's DTO is its foundation — **build nothing of it**); the prose pass; `DEC-100`'s motion
  system. Also: a session-level invitation flow for presenters; recurring series (`A14`); drag in
  `ui/reorderable-list`; everything under `(marketing)/**`.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`, `start`,
  `stop`, branch switches, pushes and the PR.

### Ownership map (wave 11 — M13, the public site and the closing pass, DEC-166) — ★ THE RECORD OF A FINISHED WAVE

> Wave 11 merged as PR #28 (`b3f8d76`). Its map is kept as the record; **wave 12's map is directly above** (`DEC-172`).

**The last milestone of the plan.** The public site rebuilt on the M9 system with a door into the platform
(`REQ-UIX-025`) and Western numerals (`DEC-124`); `qa` split into a contract half that is blocking at every
commit and an appearance half rewritten with the design (`DEC-167`, the re-cut invariant 1); `ui-lint`
flipped to `--strict` with its allowlist **deleted** — 61 violations to 0, most of them not marketing at all;
the accessibility pass over every screen (`REQ-NFR-007`) and the performance pass against `13` §7
(`REQ-NFR-008`); the mail's string path retired (`DEC-081`). The checklist is `STATUS.md`'s wave-11 block.
**The measure adds three items to the usual**: `qa:contract` green at every commit; `ui-lint --strict` green
with no allowlist; and **a visitor who has never signed in finds «تسجيل الدخول» at 390 px in Arabic without
being told where it is.**

| Teammate | Model | Delivers | Edits only |
|---|---|---|---|
| **lead** | — | ★ **`qa.mjs` split first, alone, no assertion changed** · ★ **the public site** — `(marketing)/**` and the thirteen components it renders, the door, the numerals, the copy that says the platform exists, the register form re-presented with its behaviour byte-identical, the new `og.png`, the rewritten `qa:appearance` and the re-baselined visual **in one commit** · the custodian rows (5 `ui-lint` violations in `checkin`, `designer`, `scoring` files; `ui/radio-group`'s error prop; the studio's unnamed canvas) · the `org_settings` backfill and trigger · the accessibility sweep over every route and the budgets run · the `--strict` flip · promotion, gates, the PR, the closing `STATUS` | the lead-only paths below, `supabase/migrations/**` from `0143`, `src/app/[locale]/(marketing)/**`, ★ `src/components/{header,footer,chapter,wordmark,intro-sting,network-bg,network-gl,ornaments,mobile-cta,language-toggle,registration-form,form-token}.tsx`, `src/messages/*/marketing.json`, `public/**`, `tests/e2e/{a11y,budgets,frozen-routes}*.spec.ts`, new `tests/e2e/wave11-lead-*.spec.ts`, the lead's fifteen `ui/` files, `src/app/globals.css`, `src/components/shell/**`, `src/app/[locale]/(auth)/**`, `messages/*/{ui,app,auth}.json`. **Custodian** of every file of a track not spawned — `sessions`, `checkin`, `scoring`, `designer`, `event` — **including `sessions'` eight `ui/` primitives**, edited only for its own rows or on a teammate's written request |
| `content` | sonnet | **27 of the 61 `ui-lint` violations** — `tasks/create-form.tsx` (10), `tasks/task-item.tsx` (6), `viewer/page-viewer.tsx` (5), `event/comment-composer.tsx` (2), `me/privacy/{forms,page}.tsx` (2), `photos/gallery.tsx`, `materials/proposal-list.tsx` — onto the form primitives, **behaviour unchanged**; the accessibility findings the sweep routes to its screens; the viewer's «loads progressively» (`REQ-NFR-008`) | `src/components/{materials,photos,viewer,tasks}/**`, `src/app/[locale]/app/sessions/[id]/materials/**`, `src/lib/dal/{materials,photos,tasks}.ts`, `src/app/api/upload/**`, `src/lib/storage/**`, `worker/src/content/**` and its three tasks, its nine `ui/` primitives, `messages/*/{materials,photos,tasks}.json`, `supabase/proposed/content/**`, its tests, new `tests/e2e/wave11-content-*.spec.ts`, its note. **Fixes only**: `src/components/event/{comments,comment-composer,comment-item,comment-list}.tsx` and `actions.ts`, `src/lib/dal/{comments,reactions,reports}.ts`, `src/lib/realtime/**`, `src/app/[locale]/app/me/{page,layout,loading,error}.tsx`, `me/{bookmarks,privacy}/**`, `src/components/me/**`, `messages/*/{event,profile,privacy}.json` |
| `console` | opus | **21 violations** across ten admin files — `rtl-datetime-picker.tsx` (5) the hardest; ★ **the attendance screen** (transferred): its 2 violations, the table's sideways scroll at 390 px from two days up, the manual-mark form's «مطلوب» markers; the accessibility findings on `/app/admin/**`; the admin dashboard's budget | `src/app/[locale]/app/admin/**` **except** `designer`, `templates`, `branding`, `emails`, `surveys`, `sessions/[id]/{certificates,schedule,survey}`; ★ `src/app/[locale]/app/admin/sessions/[id]/attendance/**` (from `checkin`); `src/app/api/admin/**` except `branding` and `emails`; `src/lib/dal/admin*.ts`, `src/lib/dal/scoring-admin.ts`; `src/components/{admin,browse}/**` except `admin/delivery-reason.ts`; its six `ui/` primitives; `messages/*/admin.json`; `supabase/proposed/console/**`; its tests, ★ `tests/e2e/admin-attendance*.spec.ts` (evidence); new `tests/e2e/wave11-console-*.spec.ts`; its note |
| `notify` | opus | ★ **the string path retired** (`DEC-081`, `DEC-161` R3): an org that never touched its templates receives the **designed** mail for every one of the 25 keys; `REQ-NTF-014` true for every org; **the pinned files move as one reviewed diff** the lead opens, and `main`'s worker on the post-merge schema is answered in the plan | `packages/mail-runtime/src/**`, `worker/src/mail/**`, `worker/src/tasks/{send_notification,send_test_email}.ts`, `src/app/[locale]/app/admin/emails/**`, `src/components/{email,notifications,calendar}/**`, `src/components/admin/delivery-reason.ts`, `src/app/api/admin/emails/**`, `src/app/api/webhooks/**`, `src/lib/dal/{notifications,calendar}.ts`, `messages/*/{notifications,emails,calendar}.json`, `supabase/proposed/notify/**`, `tests/unit/{mail,notify,admin-emails}*` **including `tests/unit/mail-pinned/**` under the reviewed-diff rule**, `tests/rls/{notify,notifications}*.test.ts`, `tests/components/{email,admin/emails-page}*`, new `tests/e2e/wave11-notify-*.spec.ts`, its note |
| `platform` | opus | the carried **exhausted-job alert** — a job that has used its last attempt raises an alert the super admin sees (`0075`'s `queue_stalled` excludes them by design); the accessibility findings on `/app/platform/**` | `src/app/[locale]/app/platform/**`, `src/app/api/platform/**`, `src/lib/dal/platform*.ts`, `src/components/platform/**`, `worker/src/platform/**` and its six tasks, ★ `worker/src/tasks/evaluate_alerts.ts` for this row (`DEC-168`), `messages/*/platform.json`, `supabase/proposed/platform/**`, its tests, new `tests/e2e/wave11-platform-*.spec.ts`, its note |
| `branding` | sonnet | ★ **status-colour contrast enforced** (`DEC-073`'s M13 consequence): `checkContrast()` gains the `live` / `ended` pairs and **`save_brand_kit()` refuses** a palette on which a status badge fails AA, in the database; its **3** violations (`colour-field`, `contrast-badge`, `logo-uploader`); the carried **one logo for two schemes** — a per-scheme logo or an upload-time check, after the owner's production read | `src/app/[locale]/app/admin/branding/**`, `src/app/api/admin/branding/**`, `src/lib/brand/**`, `src/components/branding/**`, `packages/storage-paths/src/brand.ts`, add-only `resolveBrand()` in `packages/designer-runtime/src/brand.ts` — **never `BRAND_COLOUR_TOKENS`** — `messages/*/branding.json`, `supabase/proposed/branding/**`, its tests, new `tests/e2e/wave11-branding-*.spec.ts`, its note |

★ = transferred or changed for this wave by `DEC-166`.

**Wave-11 rules.**

- ★ **`qa:contract` is green at every commit of the wave**, and the lead proves it at each sync. The split is
  a move, not an edit: 44 checks before, 44 after, the same labels.
- ★ **The frozen HTML changes only in the same commit as its re-baselined capture** and its rewritten
  `qa:appearance` — never before, never after (`DEC-167`). No teammate touches a file the marketing routes
  render; the `TaskCompleted` hook falls through to the full `qa` when one does, **which means you edited
  something that is not yours.**
- ★ **`registrations` is never touched** — not dropped, altered or read (invariant 2). 20 real signups. The
  register form's action, field names, ids, validation and no-JS path are the contract, byte for byte.
- ★ **A `ui-lint` fix is a presentation change, never a behaviour change.** Moving a raw control onto
  `<Field>` keeps its `name`, `id`, `defaultValue`, `required`, `form`, its submit path and every e2e locator
  that reads it; a spec that breaks is a finding, not a test to repair (the ledger). **No
  `ui-lint-disable-next-line` without a reason the lead approves in writing** — the escape hatch is for a
  control the system genuinely cannot express (a hidden-by-design input inside `file-drop`), never for time.
- ★ **The allowlist only shrinks, and at the end it is deleted.** Run `node scripts/ui-lint.mjs --prune`
  after each fix so the recorded counts fall with the tree.
- **The accessibility sweep is the lead's harness; the fixes are the owners'.** A finding on your screen
  arrives as a written row naming the rule, the selector and the route — it is yours whether or not you
  built the screen.
- **Additive, because `main` runs on it first.** Migrations from `0143`; the owner runs the production
  reads, pushes, merges, then checks Railway by hand.
- **Tables are the lead's; behaviour is the tracks'.** **A function has one writer.** **One writer per file,
  JSON and specs included.**
- **Every track that ships a screen runs `npm run ui-lint` before it commits.**
- **Captures land at `.qa-shots/rtl/wave11-<track>-<surface>-<state>.png`** in the main checkout, phone
  project, `390 × 844`, from a production build the row names by commit, honouring `E2E_SHOTS_DIR` — and the
  lead opens every one **in bands, never downscaled**.
- **Not this wave, and never-touch for every teammate:** recurring series (`A14`); drag in
  `ui/reorderable-list`; objectives, tags, avatar storage, downloads (`DEC-076`); points for a survey; any new
  feature. **After M13 there is no further plan** — anything more is new scope the owner decides.
- **`npm run qa`, `npm run visual` and `npm run build` stay lead-only**; so do `supabase db reset`,
  `start`, `stop`, branch switches, pushes and the PR.

### Ownership map (wave 10 — the survey and the email studio, DEC-160) — ★ THE RECORD OF A FINISHED WAVE

> Wave 10 merged as PR #27 (`b75eb45`). Its map is kept as the record; **wave 11's map is directly above** (`DEC-166`).

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
