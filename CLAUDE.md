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

★ **Visual direction lives in [`docs/design/`](docs/design/)** — «ساحة اللعب», accepted by `DEC-183`.
Read [`docs/design/README.md`](docs/design/README.md) before any UI work. **`DECISIONS.md` and
`docs/plan/` win over it**: where the two disagree, the case is listed in `DEC-183` §4 and `DEC-195` §6
(twenty-four so far) or becomes a new entry — nobody picks a side silently. Its prototypes are behaviour references;
a prototype's class name never appears in `src/`.

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

### Ownership map (wave 16 — the five moments, on the real screens, DEC-195) — ★ THE MAP IN FORCE

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
| `sessions` | opus | ★ **moment 1, الحجز, on `SCR-012`'s action card** (`REQ-UIX-045`) — the reserve action returns what the moment is keyed on; the ticket rises, the stamp «محجوز» lands with no overshoot, the card thuds, the capacity chip updates in place, the action becomes `session-cta`'s booked state with «ألغِ حجزي», the calendar whisper · **the waitlisted variant** — the same ticket, «قائمة الانتظار · N», in the waitlist's status tone (`DEC-073`, `DEC-195` §6.21), never cyan · the static state · the re-render test · the throttled trace · ★ `code-input` fixes `checkin` asks for | ★ `src/components/checkin/{rsvp-panel.tsx,actions.ts}` (**from `checkin`, this wave** — its gates unchanged), `src/components/sessions/{action-card,action-bar,event-actions,calendar-menu}.*` and new `src/components/sessions/moment-*.tsx`, `src/app/[locale]/app/sessions/[id]/page.tsx` **for the action card only**, `src/components/ui/{session-cta,code-input}.tsx`, `src/lib/dal/sessions.ts` (add-only), `messages/*/sessions.json`, ★ `tests/components/checkin/rsvp-panel.test.tsx` (evidence, from `checkin`), `tests/components/sessions/**`, `tests/components/ui/{session-cta,code-input}*.test.tsx`, its existing e2e specs (evidence), new `tests/e2e/wave16-sessions-*.spec.ts`, `docs/plan/notes/sessions.md`. **Nothing else this wave** — the hero, the sub-nav, the sections and slots, the timeline, browse, the propose form, the hub, `lib/dal/rsvp.ts` and `session-matrix.ts` are frozen for it |
| `checkin` | opus | ★ **moment 2, تسجيل الحضور, on `SCR-014`** (`REQ-UIX-046`) — confetti in the team colour with lime and bone, the coin's drop and squash (★ landing at `1` until the owner rules on overshoot, `DEC-195` §6.20), the three lines: «أنت هنا!», **the computed amount and that it arrives when the session ends** (`REQ-CHK-018`, `REQ-PTS-015` — from `scoring`'s `getSessionAwardState()`, read and never changed; no number when the state is `none`), the time · ★ **`code-input` adopted** — boxes named, the refusal tied to the group, the posted field and the no-JS path byte-identical (`DEC-195` §2.4) · ★ **the matrix's «حضرت»**: a checked-in member is not offered the check-in link again (`DEC-195` §2.5), a ledger line · the static state · the re-render test · the throttled trace | `src/app/[locale]/app/sessions/[id]/check-in/**`, new `src/components/checkin/moment-*.tsx`, `src/components/checkin/{session-matrix.ts,award-state.tsx,attendance-outcome.tsx,code-input.tsx}`, `src/lib/dal/checkin.ts`, `messages/*/checkin.json`, `tests/unit/{session-matrix,checkin-*}*`, `tests/components/checkin/**` **except** `rsvp-panel.test.tsx` and `schedule-form.test.tsx`, `tests/e2e/{checkin,checkin-gating}.spec.ts` and `tests/e2e/wave{7,9,12}-checkin-*.spec.ts` (evidence), new `tests/e2e/wave16-checkin-*.spec.ts`, `docs/plan/notes/checkin.md`. **Nothing else this wave** — the host view, the attendance screen, `lib/dal/rsvp.ts`, the code's rotation and every SQL function are frozen; a change to what check-in decides is not this wave's |
| `scoring` | opus | ★ **moments 3 and 4 on the head of `SCR-022`** (`REQ-UIX-047`) — the balance counting up from the old figure with the delta beside it, the streak flame growing and keeping its flicker, the level bar by `scaleX`, `level-card` turning over with one shine, its face naming what the level unlocks or saying it unlocks nothing · ★ **moment 5 on `SCR-027` and `SCR-028`** (`REQ-UIX-048`) — the rows on `rank-row` and `race-bar`, the swap by FLIP, the arrow's one pulse, a bar by `scaleX`; the falling row with no colour, icon or motion of its own · ★ **the plan's first answer: what «first sight» and «since last view» read** (contract 5) · the static states · a re-render test per moment | `src/app/[locale]/app/me/points/**`, ★ `src/app/[locale]/app/leaderboards/**` and `src/components/scoring/{member-board,company-board}.tsx` (**from `sessions`, this wave**), `src/components/scoring/**` and new `src/components/scoring/moment-*.tsx`, `src/components/ui/{rank-row,race-bar,level-card}.tsx`, `src/lib/dal/{points,leaderboards,recognition}.ts` (add-only), `messages/*/{scoring,leaderboards}.json`, `supabase/proposed/scoring/**` (functions only — a table is the lead's), `tests/components/scoring/**`, `tests/components/ui/{rank-row,race-bar,level-card}*.test.tsx`, `tests/unit/scoring*`, `tests/rls/{scoring,points,leaderboards}*.test.ts` (evidence), `tests/e2e/{points,leaderboards,wave7-sessions-leaderboards,scoring-company-points}.spec.ts` and `tests/e2e/wave{9,12}-scoring-*.spec.ts` (evidence), new `tests/e2e/wave16-scoring-*.spec.ts`, `docs/plan/notes/scoring.md`. **Nothing else this wave** — the ledger, the awards, the eight worker tasks and what a balance, level or rank **is** are frozen |

★ = transferred or changed for this wave by `DEC-195`.

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
unchanged since wave 5 apart from naming `submit-button.tsx`, which is the lead's, and ★ **`reorderable-list.tsx`, which the lead adds in wave 10** (`DEC-160` §5 — the survey's questions and the email studio's blocks both reorder through it). ★ **Wave 15 adds ten files, each with one owner** (`DEC-183`): `sticker`, `poster`, `reaction-bar`, `progress-bar` and `story-ring` are `content`'s; `session-cta` and `code-input` are `sessions'`; `rank-row`, `race-bar` and `level-card` are `scoring`'s — its first primitives. ★ **Wave 16 adds none** (`DEC-195`): the moments compose the primitives that exist, and a moment's own component lives with its screen, not in `ui/`. **Ownership lives in those never-touch paragraphs or
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
