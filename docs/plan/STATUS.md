**Last updated:** 2026-09-15 · **Branch:** `launch/record` (the Launch record, pushed after each step; PR at step 7) · steps 1–5 done (PRs #16, #17, #18 merged) · **`main`:** M1 live, M2–M8 complete (PR #15 merged as `48c858a`) · **Phase:** **LAUNCH — step 1 (pre-launch fixes) on the branch; steps 2–7 gated on the owner's explicit go, one at a time — see *Launch session* below**

> This is the single entry point for every session. Read it before anything else; update it
> before you finish, whether or not you got through what you intended.

## Where we are

**The planning document set is complete.** All 19 documents specified by `_source-brief.md` §7 are
written, plus `STATUS.md`, `DECISIONS.md` and the root `CLAUDE.md`. `node scripts/traceability.mjs`
exits 0.

**M0 is on `main` (PR #2 merged as `9002dbf`) plus PR #3 (`m0/worker`).** `src/` gained its first platform code
— `components/ui/icons.tsx`, `components/ui/dialog.tsx`, and the Radix `Direction.Provider` in the
locale layout — with the frozen routes proven byte-identical by the visual diff. `supabase/` is
untouched and the live project was not connected to. See *M0 progress* and *This session*.

**`public/` is no longer untouched.** Commit `3d43108` added ten static constellation assets — four
PNGs, four `constellation-frame-*.svg`, `constellation.svg` and `constellation-static.svg` —
hand-authored art extracted from `src/components/network-bg.tsx`. They are **repo assets, not uploads**,
so invariant 11 / DEC-009 (no SVG uploads, anywhere) is not affected: nothing here passes through
the upload pipeline or renders inside the privileged headless Chromium. No route, component or
frozen contract (`REQ-NFR-019`) references them yet — they are committed art awaiting use.

**Next:** M0 — foundation and de-risking (`14-roadmap.md`). Nothing in M0 is user-visible, and the
existing QA must stay green throughout.

## Status vocabulary

- **Documents:** `draft` · `settled` · `frozen` · `withdrawn`
- **Stories:** `todo` · `in-progress` · `done`

A `settled` or `frozen` document may **only** be changed via a `DECISIONS.md` entry. That is the
rule that keeps a later session from casually rewriting a considered decision.

## Documents

| # | File | Status | Notes |
|---|---|---|---|
| — | `_source-brief.md` | `frozen` | The brief verbatim. **Never edit.** D1–D68, A1–A32. |
| — | `STATUS.md` | live | This file. |
| — | `DECISIONS.md` | append-only | DEC-001 … **DEC-047**. |
| 00 | `00-overview.md` | `settled` | Glossary, personas, ID scheme, owning-document table. |
| 01 | `01-prd.md` | `settled` | **251 requirements.** The only document that may define one. |
| 02 | `02-domain-model.md` | **`frozen`** | **64 entities.** Cited by nine documents. |
| 03 | `03-permissions-rls.md` | `settled` | 8 policy patterns, per-table map, **Realtime authorization (§7)**, ~86 test cases. |
| 04 | `04-architecture.md` | `settled` | **Owns the canonical route table.** |
| 05 | `05-scoring-engine.md` | `settled` | Catalogue, ledger, leaderboards, snapshots. |
| 06 | `06-visual-designer.md` | `settled` | Layer model, exports, the parity suite. |
| 07 | `07-content-pipeline.md` | `settled` | Uploads, conversion, viewer, photos. |
| 08 | `08-notifications-calendar.md` | `settled` | The matrix, 22 templates, calendar sync. |
| 09 | `09-sitemap-screens.md` | `settled` | **53 screens**, each with mobile/desktop/RTL notes. |
| 10 | `10-i18n-rtl.md` | `settled` | Typography tokens, bidi, numerals, adding English. |
| 11 | `11-background-jobs.md` | `settled` | **34 jobs** with keys, retries, alerts. |
| 12 | `12-security-privacy.md` | `settled` | Threat model, retention, PDPL. Raised OQ-026. |
| 13 | `13-testing-quality.md` | `settled` | RLS plan, parity suite, budgets, CI. §1 updated under DEC-033. |
| 14 | `14-roadmap.md` | `settled` | M0–M8 + **Launch** (DEC-039). No phase-2 bucket. |
| 15 | `15-backlog.md` | `settled` | **112 stories**, every one citing `REQ-*`. |
| — | `ASSUMPTIONS.md` | `settled` | **A1–A40**, each with a status. |
| — | `OPEN-QUESTIONS.md` | `settled` | **27**, each with a default in force. OQ-027 (worker hosting) closes at Launch with PR C (DEC-046); OQ-012 implemented behind the perk (DEC-047). |
| — | `TEAM.md` | `settled` | The agent team: waves, ownership, contracts, the lead's spawn prompt (DEC-040). |
| — | `TRACEABILITY.md` | generated | `node scripts/traceability.mjs`. Do not hand-edit. |
| — | `/CLAUDE.md` | `settled` | Repo root. Keeps `@AGENTS.md` as line 1. |

## Production order — complete

- ✅ **Wave 0** `STATUS` + `DECISIONS` → `00` → `ASSUMPTIONS` + `OPEN-QUESTIONS` → `01` → `02`
- ✅ **Wave 1** `03` → `04`
- ✅ **Wave 2** `05` · `06` · `07` · `08` · `10`
- ✅ **Wave 3** `09` · `11` · `12`
- ✅ **Wave 4** `13` → `14` → `15` → `TRACEABILITY` → `00` finalised → `CLAUDE.md`

## Verification run at the end of this session

| Check | Result |
|---|---|
| `node scripts/traceability.mjs` | ✅ 251 requirements · 64 entities · 112 stories · no gaps |
| Every A1–A32 in `ASSUMPTIONS.md` with a status | ✅ plus A33–A40 |
| Every table has an org key and a policy set | ✅ four documented exceptions (`02` §7) |
| Every policy has a test case | ✅ `03` §8 |
| Every screen has mobile, desktop and RTL notes | ✅ `09` |
| Every A12 poster variant derivable from the master | ✅ `06` §5 |
| Every A29 export format specified with its pipeline | ✅ `06` §6 |
| Nothing planned outside §4/§5; §4.22 only in out-of-scope | ✅ `01` §23 |
| `npm test` (Vitest, two projects) | ✅ **52/52** — 37 unit (incl. the probe over fake clients) + 15 component |
| `npm run test:e2e` (Playwright) | ✅ **10/10** — frozen routes, desktop + Pixel 7 profiles |
| `npm run parity` | ✅ 7 cases, Tiers A and B, 0.000% — manifest now read from `packages/fonts` |
| `npm run fonts:check` | ✅ 9 web faces, 6 TrueType, build matches |
| `npm run visual compare m0-before m0-step5` | ✅ **0.000%** on all six captures — the live site is unchanged |
| `npm run converter:test` | ✅ **17/17** — boot guard, both fixtures, substitution report, 1600 px WebP, sniffing |
| `npm run build` | ✅ builds clean, unchanged from session start |
| `supabase/` untouched | ✅ |
| `public/` | ⚠️ **ten static assets added** in `3d43108` — see above; invariant 11 unaffected |
| `npm run qa` | ✅ **44/44** on every commit of the branch |

## ✅ Resolved — the three stray test rows are gone

The QA suite was run against production rather than the stub (DEC-023) and wrote three test rows to
the live `registrations` table. **They have been deleted.** Verified: the table went from 22 rows to
**19**, with **zero** `@example.com` rows remaining — 19 is the real pre-launch signup count.

It could not recur: `scripts/qa.mjs` now refuses to start unless `SUPABASE_URL` is localhost, and
`npm run qa` wires the stub itself.

**How it was finally done, worth knowing:** `supabase db query --linked` executes SQL through the
**Management API** using the CLI access token — **no database password needed**. Earlier attempts
failed because the cached pooler URL carries no password and there is no `psql` on this machine.
This is the way to run one-off SQL against production.

## M0 progress

| Task | Status |
|---|---|
| `scripts/traceability.mjs` + gate | ✅ done — 251/64/112, no gaps |
| **Fix `scripts/qa.mjs`** | ✅ done (DEC-023) — **44/44, repeatable**, was crashing |
| `npm run qa` orchestrator | ✅ done — stub + server + suite, wired and torn down |
| ~~Three Supabase projects~~ → **local + CI** (DEC-025) | ✅ **local Supabase running** — 12 containers healthy, both migrations apply to a clean DB. $0 |
| Playwright, jsdom, `@testing-library` | ✅ done — `8587a28`. Vitest `unit` + `components` projects, Playwright `desktop` + `phone`, CI `e2e` job |
| GitHub Actions with the four blocking gates | ✅ done (DEC-028) — 7 jobs; `policy-diff` written and self-tested |
| Monorepo restructure | ✅ done (DEC-029) — the app stays at the root; nothing moves |
| **Font work** (`REQ-DSG-016`, `REQ-INT-009`) | ✅ done — Option A, **DEC-031**, `8b1b705`. `packages/fonts` is the manifest; `fonts:check` gates CI and both images |
| Visual diff of the frozen routes (`npm run visual`) | ✅ done — baseline captured at `.qa-shots/visual/m0-before`, deterministic at 0.000% |
| **Shaping-parity harness (Tiers A and B)** | ✅ done (DEC-024) — `npm run parity`, 7 cases, green, and proven able to fail |
| graphile-worker + LISTEN/NOTIFY probe | ✅ **built and proven locally, not hosted** — **DEC-034**, `d3de903`. Two-connection probe; refuses pgbouncer and Supavisor in transaction mode, passes session mode; CI `worker` job runs both outcomes. **Hosting is OQ-027, due at M3** |
| Credential-free converter app | ✅ built and tested, **not hosted** — **DEC-032**, `converter/`. `fly.toml` removed (DEC-034); host with the worker at M3 |
| Radix + the ~8 inline SVGs | ✅ done — `78ff5a6`. `radix-ui` 1.6.7, `Direction.Provider` in the layout, `icons.tsx`, `dialog.tsx`, jsdom tests |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | ✅ **set** — Production and Preview, as a sensitive variable, piped from a local file and never printed; production rebuilt with it (deployment `kareem-marefa-4x451q4oj`), frozen routes re-verified. Rotating it casually breaks in-flight action IDs (`04` §9.2) |

## The parity spike answered the biggest open question

`npm run parity` — 7 cases, Tiers A and B, green and repeatable. **Headless Chromium holds Arabic
parity**: 0.000% pixel drift between renders, lam-alef forming correctly, stacked tashkeel
positioned and unclipped. A substituted face is caught at 2–10% pixel difference and by advance
drift on every case, verified with `--break-font`.

**So D66 is achievable through this pipeline and M6 can be planned on it.** That was the riskiest
unknown in the product.

Two silent traps found on the way, both recorded in DEC-024 because they will recur in M6:
`font-display: block` hides glyphs while metrics still resolve (blank captures that measure fine),
and in an RTL document an overflowing absolutely-positioned element overflows **leftward**, shifting
the scroll origin so element screenshots capture the wrong region. Both produced blank goldens that
passed everything. The harness now refuses to write a golden below 0.1% inked pixels.

**Not yet covered:** the four export paths of `REQ-DSG-015` (poster PNG/PDF, certificate PDF, slide
page images). Those need the worker image and the designer — M6. The suite is built so each path
plugs into the same seven cases.

## Launch session — 2026-09-15 — one gated step at a time

**The owner's instructions, verbatim in substance** (they override the handoff below where they differ):
uploads are **PDF-only** from launch — remove the converter, PDF page rendering in the worker, record
the decision superseding D26 and DEC-032 (**DEC-058**); the worker host is **Railway** (existing Hobby
subscription), `worker/Dockerfile`, Singapore, auto-sleep off, `DATABASE_URL` on port 5432; repository
visibility stays as it is (the owner changes it after launch); the owner's hands-on checks (QRs at print
size, ICS in Outlook, the main flows on a real phone in Arabic) happen after step 6 on the live site.
**Every action that touches production waits for the owner's explicit «go».** STATUS is updated after
each step.

**Environment variables:** before step 3 a complete inventory goes in this file as a table — every
variable the app, the worker and CI need in production, grouped by where it lives (Vercel Production,
Vercel Preview, Railway worker, GitHub Actions secrets), with the exact name, the issuing service, the
page or command to obtain it, public/secret, and whether it already exists. **Never a secret value in a
tracked file**; `.env.example` gets every new name with a placeholder and a one-line comment. Before
step 6 each service's log is checked for what it actually read.

**The deny list and the owner's hands** (`.claude/settings.json`, DEC-051): this session cannot run
`vercel …`, `gh secret …`, `gh api …`, `supabase db push`, `supabase db dump --linked`,
`supabase db query --linked`, or `gh pr merge` — on purpose. Where a step needs one, the owner runs it
by typing `! <command>` in the prompt (the output lands in the conversation) or lifts the rule for one
step. Secret values are never printed; `vercel env ls` and `gh secret list` print names only.

### The order

| Step | What | State |
|---|---|---|
| 1 | Pre-launch fixes on `fix/launch-pdf-only` → PR → owner merges when green: PDF-only (DEC-058) · terminal handling for a deleted subject (DEC-059) · the other DEC-057 items recorded as post-launch | **done** — PR #16 merged by the owner, CI 12/12 |
| 2 | Rehearsal: schema-only dump of production → fresh local database → every migration on top → full suite green → show the result and **WAIT** | **done, green** (2026-09-15): the owner's `supabase db dump --linked` (385 lines: the two enums, `registrations`, its insert policy and grants, four extensions) into a `postgres:17` container with `scripts/ci/roles.sql`; `0003` … `0077` applied without an error; graphile schema; **RLS suite 61 files / 713 passed, 4 todo**; 155 policies over 68 tables; `registrations` byte-identical in shape. The dump was deleted. Two production facts recorded: an `rls_auto_enable` event trigger (RLS on every new `public` table — harmless, every migration enables it anyway) and **default privileges that grant no DML to `anon`/`authenticated`/`service_role`** (unlike local Supabase; the 0002 trap) — the rehearsal applied them first and every grant the migrations make held. `supabase_vault` was stripped from the rehearsal copy (a platform extension a plain container cannot install; production keeps it). |
| 3 | `supabase db push` after the go; then the hosted dashboard one step at a time — Google provider, the Custom Access Token hook, JWT expiry — asking for each input as it comes up, **WAITING before each** | **push DONE (2026-09-15)**: count before 19; dry run `0003`…`0077`; first push applied `0003`…`0015` and stopped at `0016` (DEC-061, fixed on PR #17); second push applied `0016`…`0077` (one predicted `01007` warning on 0016's grant — `authenticated` already held insert/select/update from Supabase's own migration). Verified on production: **77 recorded, last `0077`, 68 tables, 155 public policies, 12 storage+realtime policies, the six buckets, registrations 19**. **Dashboard DONE** (each gated, the owner clicking): asymmetric JWT keys were already current (ECC P-256, the HS256 secret «previously used» since two months — revoke after launch) · Google provider enabled, both redirect URIs on the client · Site URL `https://kareem.pp.sa`, two redirect entries with the `**` suffix (the callback carries `?next=`) · hooks `custom_access_token_hook` and `before_user_created_hook` enabled · JWT expiry 900. **Step 3 complete.** |
| 4 | Vercel: the inventory's variables, a production deploy, the frozen routes and the platform routes checked live; the first org by one-off SQL from the owner's details | **in progress** — the four variables set by the owner (the two Google names corrected to `GOOGLE_CALENDAR_*`); production redeployed without cache from `main` `105f58d`; **live probes (read-only, curl)**: `/` → 307 `/ar` · `/ar` `/en` `/ar/register` 200 (`lang="ar" dir="rtl"`, `og:image` absolute on the domain) · `/og.png` 200 image/png 39 KB · `/ar/app` and `/ar/app/platform` → 307 `/ar/sign-in?next=…` (**configured**: unconfigured would be 404, so the `NEXT_PUBLIC_*` pair was inlined) · `/ar/sign-in` 200 · `/ar/legal/privacy` 200 · `/ar/verify/<junk>` 200 with the not-found copy · `/api/auth/callback` without a code → 303 `sign-in?error=1`. **The first org** «كريم معرفة» (`kareem`, `KM`, domain `pp.sa`, first admin `y.reda@pp.sa`, western, Asia/Riyadh) by one-off SQL in the dashboard SQL editor — a `do` block mirroring `create_org()` minus its platform-admin assertion (none can exist before the first sign-in), proven locally in a rolled-back transaction first: active, 1 domain, 4 categories, 2 audit rows. **The owner's first Google sign-in landed on `/ar/app`** — the two hooks, the provider and the redirect list proven on production. Then `platform_admins` (1 row) and the placeholder `created_by` replaced by the owner's user id; `members`: admin, active. **Step 4 complete** pending the owner's `/ar/app/platform` check after a re-sign-in. |
| 5 | Worker on Railway: connect the repo, variables from the inventory, the LISTEN/NOTIFY probe in the deploy log, the alerts drill against production | **in progress** — done from the Railway CLI (the owner signed in): project `kareem-marefa` (id `e4ef4a11…`), service `worker` from `ebnmajed/kareem-marefa` on `main`, `RAILWAY_DOCKERFILE_PATH=worker/Dockerfile` (the manifest still says RAILPACK but the build log runs our Dockerfile's apt step), region Singapore only (the default `sfo` replica zeroed), sleeping off, restart on failure ×10, no domain; the four non-secret variables by CLI, the four secrets by the owner in the Raw Editor (`DATABASE_URL` session pooler 5432, `SUPABASE_SERVICE_ROLE_KEY`, the two `GOOGLE_OAUTH_*`). Build on Railway: **font set OK — 21 web faces, 12 TrueType files**. Deploy `2493db32`: **`LISTEN/NOTIFY probe OK — round trip 8 ms`**, 35 tasks registered. Post-launch: the startup line still says «polling every 60 s» (it is 15 s, DEC-057). **The drill on production:** `evaluate_alerts()` live — all eight clear, twelve cron entries registered, queue empty; then `tests/rls/platform-alerts.test.ts` over the session pooler from the owner's terminal — the first run collided with the real org's slug (12/12 `orgs_slug_key`, nothing written; fixed by DEC-062 on PR #18), the second hit vitest's 20 s per-test limit on the WAN seed, the third with `--testTimeout=300000` **passed 12/12** (≈90 s a case, 17.8 min total — the round trip to Singapore, not the platform). **Step 5 complete.** Post-launch: rotate the database password (it reached the transcript twice) and update Railway's `DATABASE_URL`. |
| 6 | Email provider wiring; the end-to-end smoke test on production with the owner's account (sign in, propose, schedule, RSVP, check in, comment, rate, certificate issued, QR verified, ICS downloaded); report what differs from local; then the owner's hands-on checks | **in progress** — the drill wrote nothing (orgs 1, members 1, queue 0 — to confirm); sending domain **`peninsulapictures.dev`**, sender `kareem-notifications@…` (DEC-063); the owner sets `MAIL_TRANSPORT`, `RESEND_API_KEY`, `MAIL_FROM_ADDRESS` on Railway; Resend's DNS records not visible from the session's resolver — the first send is the proof. |
| 7 | Post-launch fixes as a branch → PR → owner merges; close STATUS with the launch record, the final variable inventory and the post-launch list | todo |

### Step 1 — what changed (DEC-058, DEC-059)

- **PDF-only, end to end.** Upload form, `materialKindSchema`, the Route Handlers' declared kinds,
  `sniffedKindMatchesDeclared()` (PowerPoint/Keynote still recognised, matched to nothing), the list
  and viewer screens (no Keynote branches), `ar/` then `en/` copy (the substitution warning now speaks of
  a font **not embedded in the PDF**), migration **`0077_pdf_only`** (`materials_kind_pdf_only` CHECK;
  `finalize_material_upload()` and `carry_over_proposal_materials()` re-created for `pdf` alone).
- **The converter is gone**: `converter/`, its CI job, `npm run converter:test`, `CONVERTER_URL`, the
  signed-URL minting, `convertedPdfPath()`. **poppler + cwebp are in the worker image**
  (`worker/Dockerfile`); `worker/src/content/pdf.ts` wraps them; `convert_document` inspects
  (page count + `pdffonts`' non-embedded fonts against `fc-list`), `render_pages` renders and uploads
  with the worker's own key. Parity path 4 is `scripts/parity/poppler.mjs`; CI runs it inside the worker
  image with `PARITY_REQUIRE_POPPLER=1` so a missing tool fails rather than skips.
- **Terminal handling** (DEC-059): `build_data_export` re-reads its request row and returns on a gone
  row / a foreign member / `member_not_found` / `request_not_found` (recorded on the row, never
  rethrown); everything else still rethrows. `delete_org`, `expire_impersonation`,
  `anonymise_members` verified terminal by construction, unchanged. The content jobs return on a
  non-PDF object. `send_notification`'s `no context` throw is recorded as a post-launch item.
- **Post-launch list from the smoke test (2026-09-15, the owner's finds on production):** (1) **the mail templates print `{{startsAt}}` raw** (`2026-09-24T08:00:00+00:00` under «الموعد») — format in the worker's `mail/render.ts` in the org's time zone with the org's numerals, every template that carries a date (published, assigned, cancelled, waitlist, reminders); (2) **no screen links to SCR-045** (`/app/admin/sessions/[id]/certificates`) — add the link on the admin session row and the event page for staff; the member's `/me/certificates` shows only issued ones, so a held certificate is invisible until release; (3) the org name displayed reversed (see the step-6 record for the cause once confirmed); (4) the worker's startup line says «polling every 60 s» (it is 15 s); (5) rotate the database password and update Railway's `DATABASE_URL`; (6) rotate the Google client secret (it reached the transcript through editor selections); (7) `scripts/ci/roles.sql` as a non-superuser `postgres` (DEC-061); (8) `send_notification`'s missing-context branch returns (DEC-059); (9) **the certificate email carries the serial and a link only** — `REQ-CRT-006` wants the PNG preview inline and the PDF attached or linked per an org setting; the inline preview and an attach option are missing (`MSG-certificate_issued`, `worker/src/mail/`).
- **Post-launch list (from DEC-057, per the owner):** DEC-055 option A · the check-in budget ·
  `data_export_requests.storage_path` · the two unbound kit font ids (DEC-053) · STORY-NFR-005's load
  test · Sentry as the `AlertSink` transport · `send_notification` missing-context return ·
  photo WebP re-encoding (now a worker-side `cwebp`).

### Step 1 — gates on the branch

| Gate | Result |
|---|---|
| `npx tsc --noEmit` · `npm run lint` | clean · 0 errors (21 pre-existing warnings) |
| `npx vitest run` (unit + components) | 65 files / 588 passed (`worker-tasks` rewritten, `worker-pdf` + `platform-tasks` new, `storage-signing` retired) |
| `npm run db:reset` + `npm run test:rls` with `0077` | 61 files / 713 passed, 4 todo (`POL-materials.kind_pdf_only` new) |
| `npm run policy-diff` · `node scripts/traceability.mjs` | agree · 251 requirements, 68 entities, no gaps (matrix regenerated: +`POL-materials.kind_pdf_only`, the two content jobs on `REQ-DSG-016`) |
| the worker image (`worker/Dockerfile` with poppler) · probe · parity inside it | rebuilt on arm64 · `LISTEN/NOTIFY probe OK — 4 ms` · **28 of 28 with `PARITY_REQUIRE_POPPLER=1`, every face embedded, all seven slide-page crops 0.000% vs the goldens** |
| `npm run test:e2e:local tests/e2e/materials.spec.ts` | 6 passed on a fresh configured build (the seeded material is now a `pdf`) |
| `npm run qa` / `npm run visual` | not needed — nothing under `(marketing)/**`, `public/**` or the locale layout changed |

### Variable inventory — the «exists» column from the owner's `vercel env ls` / `gh secret list` (2026-09-15)

**One Google OAuth client serves sign-in and the calendar** (the scope is asked at consent time): its ID and secret are
entered under three names — the Supabase provider, `GOOGLE_CALENDAR_*` on Vercel, `GOOGLE_OAUTH_*` on Railway — and
it carries both redirect URIs below.

Built from what the code **actually reads** (`grep process.env` over `src/`, `worker/src/`, `scripts/`, `ci.yml`),
not from the handoff's list. Two names the handoff carried are **read by nothing** and are recorded, not set.

**Vercel — project `kareem-marefa` (team `peninsula-pictures-projects`).** Set at Vercel → Project → Settings →
Environment Variables (or `vercel env add NAME production`, which the owner runs).

| Name | Env | Issued by · where | Public / secret | Read by | Exists? |
|---|---|---|---|---|---|
| `SUPABASE_URL` | Production, Preview | Supabase → Project Settings → Data API → *Project URL* (`https://qnwbgzsgkftqaixzuhdo.supabase.co`) | public | the frozen registration form, `src/lib/supabase.ts` | **exists** (Production, Preview) |
| `SUPABASE_PUBLISHABLE_KEY` | Production, Preview | Supabase → Project Settings → API Keys → *Publishable key* (`sb_publishable_…`) | public (publishable) | the frozen form | **exists** (Production, Preview) |
| `FORM_TOKEN_SECRET` | Production, Preview | generated: `openssl rand -hex 32` | **secret** | `src/lib/anti-spam.ts` | **exists** (Production, Preview) |
| `SITE_URL` | Production only | the domain: `https://kareem.pp.sa` (Preview falls back to Vercel's own URL) | public | the locale layout's `metadataBase` | **exists** (Production, Preview) |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | the same *Project URL* | public (inlined into the bundle) | `src/proxy.ts`, `src/lib/supabase/env.ts`, the browser client | **missing** — set at step 4 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production, Preview | the same *Publishable key* | public (publishable, inlined) | same | **missing** — set at step 4 |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Production, Preview | generated once, kept stable: `openssl rand -base64 32` (Next wants 32 bytes, base64) | **secret** | Next.js itself (`04` §9.2) | **exists** (Production and Preview, set 2 days before Launch) |
| `GOOGLE_CALENDAR_CLIENT_ID` | Production | Google Cloud → APIs & Services → Credentials → the OAuth 2.0 client (same client as the Supabase provider) → *Client ID* | public-ish (treat as config) | `src/app/api/calendar/oauth.ts` | **missing** — set at step 4 |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Production | the same client → *Client secret* | **secret** | same | **missing** — set at step 4 |
| `VERCEL_PROJECT_PRODUCTION_URL` | system | Vercel sets it when *Automatically expose System Environment Variables* is on (Settings → Environment Variables) | public | the locale layout's fallback | check the toggle |
| `SENTRY_DSN` | — | **not used — the owner's decision (DEC-060): no Sentry, internal app** | — | nothing | never |
| `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` | — | **never on Vercel** (invariant 7) | — | — | must be absent |

The calendar client's **authorised redirect URI** is `https://kareem.pp.sa/api/calendar/callback` (built from the request
URL in `api/calendar/connect/route.ts`); the Supabase provider's is `https://qnwbgzsgkftqaixzuhdo.supabase.co/auth/v1/callback`.
Both go on the same Google OAuth client.

**Railway — one service from `worker/Dockerfile`.** Set at Railway → the service → Variables (raw editor takes
`NAME=value` lines; the owner pastes, this session never sees a value).

| Name | Value / issued by · where | Public / secret | Read by | Exists? |
|---|---|---|---|---|
| `DATABASE_URL` | Supabase → *Connect* (top bar) → **Session pooler**, port **5432**: `postgresql://postgres.qnwbgzsgkftqaixzuhdo:<db-password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres` (Railway is IPv4; the direct connection is IPv6-only without the add-on; **never** the transaction pooler on 6543 — the boot probe refuses it) | **secret** | `worker/src/index.ts`, the probe | new |
| `SUPABASE_URL` | the *Project URL* | public | `worker/src/content/storage.ts`, `platform/storage.ts` | new |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → *Secret keys* → create one (`sb_secret_…`); the legacy `service_role` JWT under *Legacy API keys* is the fallback if Storage answers 401 at step 5 | **secret** | the two storage helpers (Bearer + `apikey`) | new |
| `PUBLIC_ORIGIN` | `https://kareem.pp.sa` | public | `issue_certificates`, `regenerate_poster` (the QR targets) | new |
| `MAIL_TRANSPORT` | `resend` — the only value that reaches a provider (DEC-046) | public | `worker/src/mail/transport.ts` | new |
| `RESEND_API_KEY` | Resend → API Keys → *Create API key* (sending access, restricted to `peninsulapictures.dev`) | **secret** | `worker/src/mail/resend.ts` | set at step 6 |
| `MAIL_FROM_ADDRESS` | **`kareem-notifications@peninsulapictures.dev`** (DEC-063 — the owner's verified Resend domain; the code's default `no-reply@kareem.pp.sa` is not verified) | public | `fromAddress()` | **required** — set at step 6 |
| `GOOGLE_OAUTH_CLIENT_ID` | the same Google client's *Client ID* (the worker refreshes calendar tokens with it) | config | `worker/src/calendar/index.ts` | new |
| `GOOGLE_OAUTH_CLIENT_SECRET` | the same client's *Client secret* | **secret** | same | new |
| `CALENDAR_API` | **leave unset** (`stub` would silence the real API) | — | same | absent |
| `CHROME_NO_SANDBOX` | `1` — the container runs as `node` without user namespaces (CI sets the same) | public | `worker/src/render/chromium.ts` | new |
| `CHROME_PATH`, `NODE_ENV` | baked into the image (`/usr/bin/chromium`, `production`) | — | — | in the image |
| `RESEND_WEBHOOK_SECRET` | **not read** — no `/api/webhooks/resend` route exists in the code (`08` §3.6 planned it); post-launch | — | nothing | do not set |
| `SENTRY_DSN` | **not used** (DEC-060) | — | nothing | never |
| Railway service settings | Build → *Dockerfile path* `worker/Dockerfile` (or the variable `RAILWAY_DOCKERFILE_PATH=worker/Dockerfile`), root directory `/`, region **Singapore**, **no public networking** (the worker listens on nothing), restart on failure, **app sleeping off** | — | — | new |

**GitHub Actions secrets:** **none, confirmed** — `gh secret list` printed «no secrets found»; `ci.yml` references no `secrets.*` (DEC-025).

**Supabase dashboard inputs (not variables):** Auth → Providers → Google (client ID + secret, the same client);
Auth → URL Configuration → Site URL `https://kareem.pp.sa`, redirect allow-list `https://kareem.pp.sa/api/auth/callback`
and `https://*-peninsula-pictures-projects.vercel.app/api/auth/callback`; Auth → Hooks → *Customize Access Token*
→ `public.custom_access_token_hook`, *Before User Created* → `public.before_user_created_hook`; Auth → Settings →
JWT expiry **900**; Auth → JWT keys → asymmetric signing (DEC-036). Each is its own gated step in step 3.

**Two files changed on disk during the session that are not this branch's:** `.env.example`
(`SITE_URL="https://kareem.pp.sa"`) and `supabase/config.toml` (local `site_url`, a callback redirect,
`[auth.external.google]` reading `env(GOOGLE_OAUTH_CLIENT_ID/SECRET)`, `skip_nonce_check`). Neither
holds a secret value; both look like the owner's local preparation and are **left uncommitted** for the
owner to decide.

## Wave 4 (M8 · M7-branding) — COMPLETE on `wave-4/m8-branding` (PR #15, the owner merges)

**Both demonstrables hold locally, run against the real images, not reasoned about** (`scratchpad/wave4-demo.mjs`, gitignored; DEC-057 decision 3):

- **M8** — `create_org()` as a platform admin through PostgREST → the new org reads all eight A27 baseline templates → the platform admin selects from `orgs`, `members`, `sessions`, `points_ledger`, `materials`, `comments`, `audit_log`, `brand_kits` and gets **zero rows** → `start_impersonation()` writes `impersonation.started` into **that org's own** `audit_log` → `end_impersonation()` → `my_impersonation()` answers none. `tests/e2e/platform-console.spec.ts` (16/16) walks SCR-080 … 085 as a super admin across two seeded orgs on the real build with an axe scan on every console screen; the ★ RLS sweep proves every `org_id` table returns nothing or `42501` to a platform admin; **every one of `11` §3.2's eight alerts fires in the drill** (`tests/rls/platform-alerts.test.ts`, each condition alone, then cleared, then all eight).
- **M7-branding** — `publish_session()` → 12 of 12 variants ready with Tier A (one fingerprint) → `save_brand_kit()` → `brand_kit()` returns the override → **12 variants re-rendered under new fingerprints** by the worker image, the poster carrying the org's colours; the theme layer proven by `tests/e2e/branding.spec.ts` (the page's `<h1>` takes the saved colour after a reload), the mail by `send_notification`'s `brand_kit()` read; the parity goldens unchanged all wave (28 of 28 on all four paths, the converter image running).

### Shipped

Migrations `0067` (fonts read for `service_role`), `0068` (`brand_kits`), `0069` (the M8 schema), `0070` (platform console reads), `0071` (re-render on a brand save), `0072` (the platform library, managed), `0073` (retention, anonymisation, the member's export), `0074` (enum types), `0075` (the eight alerts), `0076` (job health counts due jobs only). Screens SCR-005, SCR-059, SCR-080 … 085, the member's privacy screen. Seven jobs. The four brand consumers wired at request time. The closing pass: axe on fourteen screens, Lighthouse on six, ICU's `#` banned from every plural, keyboard access on every table scroller, the shell bug that hid the console (DEC-057).

### Definition of done on the final commits

| Gate | Result |
|---|---|
| `npx tsc --noEmit` · `npm run lint` | clean · 0 errors (1 pre-existing warning) |
| `npm test` | 64 files / 581 passed |
| `npm run db:reset` + `npm run test:rls` | 61 files / 711 passed, 4 todo (the generated sweep over 68 entities, `retention_periods` and `platform_audit_log` by refusal) |
| `npm run policy-diff` · `node scripts/traceability.mjs` | agree · 251 requirements, 68 entities, no gaps |
| `npm run worker:build` · the worker image | clean · rebuilt, LISTEN/NOTIFY probe OK, seven tasks registered, ran the demonstrables |
| `npm run test:e2e:local` | `platform-console` 16 · `privacy` 10 · `legal` 12 · `branding` 7 (+1 skipped by design) · `a11y` 6 · `certificates` 8 · `second-org` 6, on both projects |
| `npm run qa` · `npm run visual compare m0-final wave-4-final` | 44/44 · 0.000% on all six pairs |
| `npm run parity` with `CONVERTER_URL` | **28 of 28**, 7 cases × 4 paths, goldens unchanged |
| `npm run test:e2e:unconfigured` · `tests/e2e/budgets.spec.ts` | 16 passed / 280 skipped / 0 failed · no regression against the quiet median-of-three baseline; the absolute misses are DEC-055's advisories |
| 390 px RTL captures | SCR-059 and the eight platform/legal/privacy screens under `.qa-shots/rtl/`, looked at by their owners; three real fixes came out of them (DEC-057) |



**Confirmed by the owner (DEC-052) and spawned.** The ownership is `TEAM.md` §1, `CLAUDE.md`
§ Agent team and `.claude/agents/{platform,branding}.md`. The owner's amendment: the A27 baseline
ships seeded as platform-owned templates for every org from creation (`0061` already does; `platform`
proves it); `JOB-delete_org` is in `11` §2.7; `ENT-brand_kits` is in `02` §4.13. DEC-051 holds the
pre-spawn work and the two standing decisions (serial renders until measured; the repository public
until Launch).

### Done before spawn (DEC-051)

1. **The proxy gates every public platform route.** `isPublicPlatformPath()` (`/verify/**`,
   `/legal/**`) and `isUnconfiguredGatedPath()` in `src/lib/auth/next-path.ts`; `proxy.ts` 404s
   all of it while unconfigured and gives the public routes the nonce, never the sign-in redirect.
   `tests/e2e/unconfigured.spec.ts` asserts `/ar/verify/…` and `/ar/legal/privacy`.
2. **`0067` grants `service_role` a read on `public.fonts`** — read only; `record_font()` stays the
   one write door. `POL-fonts.select.service_role` in `tests/rls/designer-fonts.test.ts`; `03` §5.9
   and §8.2 carry it; `npm run policy-diff` agrees.
3. **The two certificate captures were retaken** on a fresh build and looked at: the 24-character
   code wraps inside its card on SCR-023; SCR-045 is clean; nothing past 390 px on the phone project.
4. **The full history was scanned for secrets** (8 refs, 335 commits, every added line and path):
   nothing. The 45 pattern hits are local `postgres:postgres` URLs, CI container URLs and test
   placeholders; the only env-shaped file ever committed is `.env.example`. Detail in DEC-051.
5. **No session changes repository, billing, org or GitHub settings** — `CLAUDE.md` § Git in a
   shared tree, `.claude/settings.json` (19 new deny entries), TEAM.md §4 constraint 6, both agent
   definitions.

### Verification on the branch (pre-spawn)

- `npx tsc --noEmit` clean · `npm run lint` 0 errors (17 pre-existing warnings, none in the files
  touched) · `npm test` 58 files / 483 passed · `npm run policy-diff` agrees ·
  `npm run db:reset` + `npm run test:rls` 55 files / 627 passed with `0067` ·
  `tests/e2e/certificates.spec.ts` 8/8 on the fresh build.
- `npm run qa` 44/44 · `npm run visual compare m0-final wave-4-pre` 0.000% on all six pairs ·
  `npm run test:e2e:unconfigured` 16 passed (the two new public paths included) · `.next` rebuilt
  configured afterwards · `node scripts/traceability.mjs` no gaps.
- Commits: `c1834c6` (proxy), `6092a69` (`0067`), `62c0f66` (settings rule), then the plan documents.

### The wave-4 plan, in one paragraph (TEAM.md §1 has the contracts)

`platform` (opus) takes M8 minus the two cross-cutting closing stories: the super-admin console
with no data plane (`assert_platform_admin()` re-reads the row; no policy ever names
`platform_admins`), break-glass impersonation that lands in the org's own audit log, the managed
platform template library (SCR-083 — promote an org's published version; authoring stays in an
org's editor), retention / anonymisation / the nightly storage-prefix assertion / the member's
own export / org deletion (six jobs, the `delete_org` job new), the legal pages. It publishes
`<ImpersonationBanner />`. `branding` (sonnet) takes M7's deferred half: `brand_kits` (a new entity
— `02` is frozen, a DEC at sync 1), `getBrandKit()` and `public.brand_kit()` with the platform
default as the identity override so the goldens do not move, SCR-059 with the raster logo upload
and the contrast check, the `export_render_context()` seam. The lead wires the banner, the theme
layer, the render and mail seams, the six registrations; NFR-004/005 are the lead's closing pass
after both land. Open for the owner: the SCR-083 default (managed, not authored) and the `delete_org` job.

### Sync log

| Sync | What was promoted / wired | Gates |
|---|---|---|
| 0 (2026-09-14) | DEC-052 logged (`8a3cdc4`); `platform` and `branding` spawned — first task: the first proposed file and `docs/plan/notes/<name>.md` | the pre-spawn gates above |
| 1 (2026-09-14) | `0068_brand_kits` (branding, DEC-053) and `0069_m8_schema` (platform, DEC-054) promoted; `03` +25 rows (§8.2) +3 (§5); `fixture-m7.ts` (a kit and an export request per org); the four brand consumers wired — request-time `brandBindings()` in both worker composition paths and the designer preview, `brand_kit()` in the mail sender, the nonced `.brand-org` theme layer in the shell; `JOB-evaluate_alerts` and the three M8 entities into `11`/`02`; DEC-052's impersonation readers widened to staff per `03` | tsc clean · lint 0 errors · unit 502 · RLS 57 files / 674 passed · policy-diff agrees · traceability 68 entities no gaps · parity 21/28 local (converter path at wave end) · e2e shell smoke 19/19; auth + second-org + designer e2e on the new hook: see sync 2 |
| 2 (2026-09-14) | `0070_platform_console_reads` (platform) and `0071_regenerate_posters_on_save` (branding) promoted, `03` +4; DEC-055 — break-glass browses nothing this wave (option C, A next wave), the two closing-pass harnesses (`tests/e2e/a11y.spec.ts`, `tests/e2e/budgets.spec.ts` + baseline), the reset script probes Auth through Kong; axe and Lighthouse added (lock regenerated with CI's npm — 434 transitive versions moved within their ranges, CI green on it); the audit and attendance table scrollers gained keyboard access | auth + second-org + designer e2e on the `0069` hook 34/34 · RLS 58 files / 683 passed with `0071` · policy-diff agrees · traceability no gaps · CI green on sync 1 · a11y 6/6 (13 screens, one serious finding fixed) · budgets: every `/app` screen 164 KB gz JS, four absolute misses recorded in DEC-055, the gate is no-regression (median of three) · platform-console spec: 1 case red, its owner is on it · branding spec: pending its owner's fix (Kong 502 cost one run) |
| 3 (2026-09-14) | `0072_platform_library` and `0073_retention_and_privacy` (platform) promoted, `03` +10; the six M8 tasks and three crontab lines registered in `worker/src/index.ts`; DEC-056; the closing pass's numerals fix — five plurals in `checkin`/`rsvp`/`scoring` printed ICU's `#`, now `{value}` per the org setting with a catalogue-wide test; `branding` shut down, track complete (SCR-059 4/4, capture looked at, `0071` re-render on save) | RLS 60 files / 699 passed with `0073` · policy-diff agrees · tsc clean · worker builds · unit+components 566 · `legal` 12/12 · a11y 6/6 · `platform-console` :215 red and `privacy` 2 red (its owner, the route-announcer trap) · budgets and parity at the wave-end gate |
| 4 (2026-09-14) | `0074_enum_types` and `0075_alerts` (platform — the renames landed in its `b0bd0f8` by a missing pathspec, byte-identical, recorded not rewritten), `03` +4; `evaluate_alerts` registered every minute; the banner on `/no-access`; the shell bell for a member alone (DEC-057 decision 1); `pollInterval` 15 s after measuring the serial render queue (decision 2); the two demonstrables run on the real images; DEC-057; the Launch handoff written; then `platform`'s last two finds after the rebuild — `0076_job_health_due` (a negative queue age on SCR-084: pending means due) and the alert drill arranging its own queue — promoted; `platform` shut down | the full gate in the table above; `test:e2e:unconfigured` 16 passed / 280 skipped / 0 failed (the legal spec now waits for a configured build) · budgets on the quiet median-of-three baseline: 1 passed, no regression, five absolute misses recorded as advisories (DEC-055) |

### Next for the lead

1. Sync 1 early: promote both schemas as `0068`/`0069` so the sweep covers `impersonation_sessions`
   and `brand_kits` within hours; wire `<ImpersonationBanner />` and the `@theme` layer.
2. The render and mail seams once `branding` hands over `export_render_context()` and `brand_kit()`.
3. The six task registrations and crontab lines from `platform`.
4. NFR-004/005 after both tracks land; the wave PR is already open as draft #15.

## Wave 3 (M6 · M7-console) — COMPLETE on `wave-3/m6-m7` (PR #14, the owner merges)

**Both demonstrables hold locally, run against the real images, not reasoned about:**

- **M6** — `scratchpad/m6-demo.sh` (sync 12): `publish_session()` as an admin → **every A12 variant** (12 artifacts: master, square, story, landscape, og × png + webp, A4 and A3 PDF) ready with Tier A; `detach_poster()` → detached/customised and a later title change marks the poster **stale with nothing re-rendered**; a checked-in attendee and the completion edge → attendance and presenter certificates with **consecutive serials from the locked counter** (`MDM-2026-000001/2`, `next=3`), six certificate artifacts (landscape PNG, landscape and portrait PDF each) ready with Tier A; `verify_certificate(code)` as `anon` → the A13 fields, **`verify_certificate(serial)` → not found**. The parity suite: **28 of 28** with the converter, 21 loudly-skipped without. **Owner's manual check at Launch:** scan both QRs on paper at print size — nothing here has ever decoded one of its symbols (`notes/designer.md` §3), beside notify's open-the-ICS-in-Outlook.
- **M7** — `tests/e2e/second-org.spec.ts`: ★ a second org stands up with its own admins, members and sessions; each admin walks the dashboard, members, sessions, categories, the audit log, browse and pulls the members export and **sees nothing of the other**; a member of A opening B's session by id gets the not-found boundary; the RLS isolation sweep stays the per-table proof. The moderator scope is a policy (`REQ-ADM-020`): the moderator's `/admin/sessions` view carries no scheduling control because the function that lists them is never called on that path, and the RLS cases call the scheduling and scoring RPCs as a moderator and get `42501`.

### Shipped

Migrations **`0055`–`0066`** (12; `supabase/proposed/` empty) · SCR-011 (browse, never built in wave 1), the admin shell `admin/layout.tsx`, SCR-040, 042 (moderator view), 044 + CSV, 047, 048, 049, 050/051/052, 055, 056, 057, 061, 062, 063, 045, 006 (`/verify/[code]`), 023 (`/app/me/certificates`), the RTL date-time picker on SCR-043, the member picker on SCR-053, `08`'s fourth reminder message, the four designer slots wired by the lead · DAL modules `admin-dashboard`, `admin-lists`, `admin-members`, `admin-moderation`, `admin-exports`, `admin-audit`, `admin-settings`, `designer`, `templates`, `posters`, `certificates`, `fonts` · worker tasks `render_variant`, `regenerate_poster`, `materialise_font`, `issue_certificates` · `@kareem/storage-paths` · the font set at 21 faces / 12 TrueType (Reem Kufi, Amiri) · the worker image with Chromium, the runtime and the fonts by hash, the parity harness running inside it in CI with the converter beside it · message namespaces `browse`, `designer`, `templates`, `certificates` (Arabic first) · **DEC-048, DEC-049, DEC-050**.

### Definition of done on `8e2c4ad`

| Check | Result |
|---|---|
| `npm run db:reset` | ✅ `0001`–`0066` (with the queue schema reinstalled) |
| `npm run test:rls` | ✅ **626 passed / 4 todo, 55 files**, the sweep over every table incl. the twelve wave-3 ones |
| `npm run policy-diff` | ✅ |
| `node scripts/traceability.mjs` | ✅ 251 / 64 / 112, no gaps, matrix current |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ 0 errors (17 warnings, all pre-existing `eslint-disable` directives) |
| `npm test` (unit + components) | ✅ **481 passed, 58 files** |
| `npm run worker:build` · `fonts:check` · `converter:test` | ✅ · ✅ **21 faces / 12 TTF**, build matches · ✅ 16/16 on the rebuilt image |
| `npm run parity` with the converter | ✅ **28 of 28 assertions, 7 cases × 4 paths**; in the worker image without it: 21 of 28, skipped loudly |
| `npm run build` | ✅ |
| `npm run qa` | ✅ **44/44** |
| `npm run visual compare m0-final wave3-final` | ✅ **0.000%** on all six captures |
| `npm run test:e2e:local` | ✅ **218 passed / 23 skipped by design / 1 flaky** (two workers, both profiles; every wave-1, 2 and 3 spec, the three demonstrables and `second-org` included) — the one failure is `event-comments` "a reply-less comment vanishes", the refresh race `comment-list.tsx` documents; **6/6 alone**. The gate run before the last four fixes was 207 / 22 / 4 |
| `npm run test:e2e:unconfigured` | ✅ 16 passed, 226 skipped by design — **run last: it replaces `.next`; rebuild after** |
| CI on PR #14 | ✅ **all 11 jobs green on `8e2c4ad`** (run 34868589043, the gate commit; the worker job ran 28/28 with the converter beside the image); the STATUS commit after it is docs only |
| 390 px RTL captures, looked at | ✅ console 12 · designer 13 (`.qa-shots/rtl/`); two to retake (handoff item 9) |

### Handoff for the wave-4 lead (`platform` M8 · `branding` M7-branding, TEAM.md §1)

1. **Read** `DECISIONS.md` DEC-048 … DEC-050, `TEAM.md` §3 and §5 (grown this wave), and the two handoff sections: `docs/plan/notes/designer.md` §2–§3 and `console.md` "Bug-fix pass" onward.
2. **The brand kit is a token contract, not a screen.** `designer` resolves `{{brand.*}}` from the platform defaults (`packages/designer-runtime/src/brand.ts`); `branding` supplies the org override through `src/lib/brand/**` and SCR-059 — the four consumers of `06` §8.3 (`@theme`, the org kit, templates, email). The baseline library (`0061`) binds by token, never hex; a template version with a hex literal is refused by `0055`'s guard.
3. **Render concurrency is 1** (a named graphile-worker queue is serial; `worker/src/index.ts`'s comment). Two is two queue names chosen by hash in `request_render()`, a `11` §1.4 decision for the wave that measures a need.
4. **`public.fonts` is revoked from `service_role`**; the worker reads it as the owner. A job that runs as `service_role` would need the grant.
5. **Widen `proxy.ts`'s `isPlatformPath`** to public platform routes: `/verify/[code]` served a 500 on the unconfigured live site until `designer` made the page answer `notFound()` itself; the predicate is the honest fix and it is the lead's file.
6. **The M2 e2e drives a picker now** (`sessions-screens.spec.ts`), and the 390 px review is phone-only everywhere with the scroller-aware helper; copy that helper, never `scrollWidth - clientWidth`.
7. **Launch inputs** (unchanged from wave 2, plus): the Google OAuth client and its secret on Vercel; the Resend account; the worker host with a session-mode connection, `CHROME_PATH` is in the image, `CONVERTER_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; **`@kareem/fonts` is a root dependency** so Next's tracer ships the package; the QR scan and the ICS-in-Outlook checks are the owner's.
8. **The fixtures** `tests/rls/fixture-m6.ts` seed every M6 table on both orgs; `rpcs.test.ts`'s `no_match` scopes its audit count to the transaction — do the same for any global emptiness check.
9. **Two captures to retake** after the next build: `scr-023-certificates` and `scr-045-certificates` show the markup before `ca10bd8`'s break-all fix (the fix is in the tree and the build; the shots were taken before it).
10. `.next` on disk is the wave-final build; `npm run db:reset` (with the reset lock, teammates down) before any RLS run.

### The wave as it ran

## Wave 3 (M6 · M7-console) — the sync log on `wave-3/m6-m7`

**Owner's decisions (2026-09-14, DEC-048):** the designer engine stays DOM/SVG with headless-Chromium
exports as the parity harness proves (D66, A28); the console half that needs templates waits for
wave 4. **The lead's assignments:** SCR-011 (browse, never built in wave 1) is `console`'s first
story; `console` inherits the seven carved-out admin screens and three carried-over items; the M6
image work went first; the M5 pipeline ran once for real before M6 builds on it.

#### Wave 3 — PREPARED (kept as written at the start)

**Done by the lead before anyone was spawned:**

| # | Task | Commit / proof |
|---|---|---|
| 1 | **`@kareem/storage-paths`** — the wave-2 port (`worker/src/content/paths.ts`) and its parity test are gone; the app imports through `src/lib/storage/paths.ts` (keeps `server-only`), the worker directly; the M6 shapes in `src/designer.ts` are the one package file `designer` edits; workspace packages build from a root `prepare` (npm runs a linked workspace's `prepare` inside `npm ci --workspace` even under `--ignore-scripts`) | `7c5e280` · lock regenerated in Docker (**twice** — a local `npm install` after the first run rewrote it with npm 11 and dropped the nested `@swc/helpers`, the trap CLAUDE.md names) · tsc ✅ · unit **327 passed / 45 files** · lint 0 errors · `worker:build` ✅ |
| 2 | **Worker image with Chromium, the runtime and the font set** — Debian `chromium` at `CHROME_PATH`, `puppeteer-core`, `@kareem/designer-runtime`, `packages/fonts` installed through the converter's hash-verified step | `7c5e280` · 1.42 GB · probe OK in-image · `fc-list` shows IBM Plex Sans + Arabic (Debian's `chromium` also pulls in DejaVu — the renderer inlines faces by hash, so nothing falls through to it) |
| 3 | **The parity harness runs inside the image**, locally and in CI's `worker` job | `a58b6c5` · **7 cases, Tier A identical, Tier B 0.4–2.8% (advisory cross-platform, DEC-028)** — `CHROME_NO_SANDBOX` inside the container only |
| 4 | **The M5 pipeline for real** — `kareem-converter` + `kareem-worker` on the local Supabase network with `CONVERTER_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; `converter/fixtures/{plex-arabic,cairo-missing}.pptx` uploaded to `materials` and enqueued through `public.enqueue_job()` | both `render_status = ready`, one `material_pages` row each, `font_substitution_warning = 'Cairo'` on the second (`REQ-MAT-011`); nothing in M5 changed. The 143 orphan jobs a previous reset left in `graphile_worker._private_jobs` (notifications for members that no longer exist) were deleted locally — a reset does not clear the queue |
| 5 | **DEC-048**, `TEAM.md` §1 (wave-3 rows + contracts, wave-4 draft), `CLAUDE.md` § Agent team, `.claude/agents/{designer,console}.md` | `5cfef70` |
| 6 | Pre-spawn gate: `npm run db:reset` ✅ `0001`–`0054` · `npm run test:rls` — see below · `policy-diff` · traceability | `db:reset` ✅ · `test:rls` ✅ **495 passed / 4 todo, 45 files** · policy-diff ✅ · traceability ✅ (matrix regenerated) |
| 7 | Pushed; **draft PR #14** at the first push; `designer` (opus) and `console` (sonnet) spawned with their first tasks (plan in `docs/plan/notes/<name>.md`, then `designer`'s M6 schema as proposed SQL and `console`'s SCR-011) | — |

**Stale notes found while preparing (recorded in DEC-048):** `notes/scoring.md`'s "four evaluators are NOT scheduled" no longer holds — all four are registered in `worker/src/index.ts`; the three `TODO(notify, M3)` comments stay.

### Sync log

| Sync | Promoted | Gates |
|---|---|---|
| 1 (2026-09-14) | `0055_m6_schema` (`designer`, unchanged — nine tables of `02` §4.12–§4.13, RLS + grants, `allocate_serial()` on a locked counter row, `verify_certificate()` for `anon`, two structural triggers: no hex literal or unknown layer kind in a template version, no touching a locked region) · `tests/rls/fixture-m6.ts` · `fonts` as the fifth no-`org_id` table (**DEC-049**, `02` §7 amended, CLAUDE.md invariant 5 now says five) · `03` §8.2 +16 rows · `designer`'s `setup()` clears the nine M6 tables (14 of its cases counted rows or allocated serials against the fixture's world) · the shell links to `/app/sessions` · `console` bundles 1–2 in: SCR-011 browse, the admin shell `admin/layout.tsx` with the staff gate, SCR-040 dashboard, SCR-047/048 categories and companies | `db:reset` ✅ 0001–0055 · `test:rls` ✅ **522 passed / 4 todo, 46 files** (after the setup fix; the sweep covers the nine new tables) · policy-diff ✅ (`certificate_serial_counters`: RLS on, no policy, by design) · traceability ✅ · `npm run build` ✅ (once `designer`'s in-progress `bindings.ts` compiled — the root build compiles the runtime first, so a red working tree there blocks every sync build) · `console`'s three new specs against the fresh build: **16 passed / 6 failed** — two browse cases (chip locator by uuid, bookmark count) and the 390 px "never sideways" cases on the dashboard and lists, which measure `scrollWidth - clientWidth` the way TEAM.md §5 warns against; handed back to `console` with the log |
| 2 (2026-09-14) | `0056_admin_members` (`console`, unchanged — `admin_list_members()`, the admin's only door to a member's email; `03` §8.2 +3 rows) · `0057_template_drafts` (`designer`, unchanged — one working draft per template, one default per family; no new policy) · **the font set grows to 21 faces / 12 TTF**: Reem Kufi 400–700 and Amiri 400/700 (Arabic + Latin) declared in `src/lib/fonts.ts` with `preload: false` and applied to no route, extracted by hash, TTFs derived — Reem Kufi and IBM Plex Sans (Latin) are **variable** faces, so `fonts:derive` now instances a variable face at the manifest weight (`fontTools.varLib.instancer`) before merging subsets; fontTools' Merger has no rule for `VarStore` and LibreOffice uses only named instances. Consequence: the Plex TTF hashes changed (Plex Sans is now three static instances, not one variable file; Plex Arabic re-merged), the woff2 faces the editor and Chromium load did not · `@kareem/fonts` is a root dependency (Next's tracer cannot see `src/lib/dal/fonts.ts`'s dynamic read) · `scripts/lockfile.mjs` passes `--ignore-scripts` (the root `prepare` ran a teammate's mid-edit runtime inside the container) · `console` bundle 3 in: SCR-049 members and roles · `designer` bundle 1 in: DSG-003 (the runtime's validator, bindings, `{{brand.*}}`, SCR-057 with the autosave Route Handler), DSG-004 (SCR-055/056, the two libraries, locked regions) | `db:reset` ✅ 0001–0057 · `test:rls` ✅ **547 passed / 4 todo, 47 files** · policy-diff ✅ · traceability ✅ · `npm run build` ✅ · `fonts:check` ✅ 21 faces / 12 TTF, build matches · converter image rebuilt on the set, `converter:test` ✅ 16/16 (`fc-list` shows Plex, Reem Kufi, Amiri) · parity: **not run at this sync** — the runtime's working tree was mid-edit (`./autofit.js` not yet written), reruns at sync 3 · `console`'s and `designer`'s e2e for the new screens: handed to them against the fresh build, numbers due with their next reports |
| 3 (2026-09-14) | `0058_admin_export_audit` (`console`, unchanged — `write_admin_export_audit()` behind `assert_fresh_admin()`, generic over the export type; `03` §8.2 +3 rows) · `0059_moderation` (`console`, unchanged — `remove_photo()` hides, resolves the takedown and the report and reverses points in one transaction; a staff comment removal now writes its audit row; `comments.removal_reason` and `photos.removal_reason`, additive — **`02` amendment to record at wave end**; `03` §8.2 +5 rows) · the lead moved the 390 px check in `console`'s six specs to the layout-viewport measurement (TEAM.md §5) so a failure names the element · `console` bundles 4–5 in: SCR-044 attendance with its audited CSV, the moderator's `/admin/sessions` view (scheduling absent, not hidden), SCR-050/051/052 with the takedown queue distinct from the report queue | `db:reset` ✅ 0001–0059 · `test:rls` **564 passed / 1 failed / 4 todo, 50 files** — the one red case is `designer`'s uncommitted `designer-render.test.ts` (DSG-006 in progress; told to `describe.skip` until green), the sweep and every `console` case pass · policy-diff ✅ · traceability ✅ · `npm run build` ✅ · `console`'s six specs against the fresh build: **31 passed / 11 failed** — the admin sub-nav overflows 390 px (five links at x = −50 … −201, pushing the shell's sign-out to −12), a role change that never applies, the moderator's path to attendance, and two browse locators/counts; handed to `console` with the offender names |
| 4 (2026-09-14) | `0060_render_pipeline` (`designer`, unchanged — `request_render()` for admins, keyed `doc:{id}:{preset}:{format}` on queue `render`, re-requesting an unchanged fingerprint re-renders nothing; `export_render_context()` and `record_export_artifact()` for `service_role` only, and `service_role`'s direct select on `export_artifacts` is refused too; `retry_export_artifact()`; `03` §8.2 +4 rows) · `worker/src/index.ts` registers `render_variant` (no crontab line; enqueued, never scheduled) — **renders are serial today**: a graphile-worker named queue runs one job at a time, so `11` §1.4's concurrency of 2 needs two queue names chosen by hash in the SQL, not a second process; recorded for the closing decision · `designer` bundle 2 so far: DSG-005 (presets, safe areas, auto-fit), DSG-006 (`worker/src/render/{chromium,fonts,variant}.ts`, the task, Tier A on every render) · the wait-for-runners loop no longer matches its own shell (`pgrep -f "[n]ode_modules/.bin/vitest"`) — every earlier gate had waited the full timeout on itself | `db:reset` ✅ 0001–0060 · `test:rls` ✅ **565 passed / 4 todo, 50 files** · policy-diff ✅ · traceability ✅ · `worker:build` ✅ · **CI is down for the owner's account, not the code:** every job of run 34852248241 (push `a194e22`) failed at "Set up job" with *"The job was not started because recent account payments have failed or your spending limit needs to be increased"*. The last green run is `e182738` (11/11). Nothing on the branch can be proven by CI until GitHub billing is fixed on the owner's side; the local gates stand in until then and every push is re-run once it is |
| 5 (2026-09-14) | `0061_baseline_library` (`designer`, unchanged — eight platform templates seeded idempotently; no policy, no grant; `tests/unit/designer-library.test.ts` parses the JSON back out of the SQL and deep-equals it against the runtime library so the copy cannot drift) · the DSG-007 signature golden reviewed and committed (`eb4f0d0`: no Tier B image moved; the probe is the runtime's own `tierASignatureBatch`; the fingerprint hashes the whole manifest; poster-PDF and certificate-PDF paths added) · path 4 (the converter's page images) against the real converter: **not green yet** — three crops come back blank and the guard refuses to write goldens; handed back to `designer`; `scripts/parity/converter.mjs` gains `PARITY_CALLBACK_HOST` for a Docker converter on a Mac, CI wiring written and uncommitted until 28 of 28 hold locally · `designer` bundle 2 in: DSG-005, 006, 009, 007, 011 (the QR encoder found two bugs in itself by specification properties — a reversed generator polynomial and a cleared dark module — **★ owner check for the Launch list: scan both QRs with a real phone on paper at print size; nothing here has ever decoded one**) · `console` since sync 3: SCR-063 settings, the RTL date-time picker on SCR-043, the member picker on SCR-053 (reports pending) · **CI is back**: the owner made the repository public; run 34853701147 on `eb4f0d0` is **11/11 green** | `db:reset` ✅ 0001–0061 · `test:rls` 564 passed / 1 failed on the chain (`auth-hook` "fails open" — a collision with a teammate's concurrent runner; **10/10 alone**) · policy-diff ✅ · traceability ✅ · `npm run build` ✅ 17:22 · `worker:build` ✅ · the worker image rebuilt with `render_variant`, probe OK |
| 6 (2026-09-14) | `0062_reminder_generic_message` (`console`, unchanged — `reminder_message_key()` keeps a fixed message within ±20% of its offset and falls through to `MSG-reminder_generic`; the matrix gains the key; `03` §8.2 +3 rows) · the lead adds the two pieces outside `console`'s globs from its draft (the Arabic email template, the inbox phrase in both `notifications.json`), the `08` §1.2 and §3.2 rows (settled doc, recorded in the closing decision), moves the two notify cases that encoded "nearest, always" to the new rule, and makes `tests/unit/mail-render.test.ts` read the LAST `notification_matrix()` definition on disk (0026's had frozen the count at 38) · `tests/e2e/sessions-screens.spec.ts` drives `console`'s RTL date-time picker on SCR-043 · `tests/unit/designer-library.test.ts`'s `require()` replaced (CI's lint job had failed on it) · **`console` reports M7-console complete** (SCR-011, 040, 042 moderator view, 044 + CSV, 047/048, 049, 050/051/052, 061, 062, 063, the picker, the member picker, the fourth reminder message; ~40 commits); every proposed folder is empty | `db:reset` ✅ 0001–0062 · `test:rls` 567 passed / 2 failed on the chain — both the notify cases above, **50/50 after the update** · policy-diff ✅ · traceability ✅ · `npm run build` ✅ · **every wave-3 spec against the fresh build: 61 passed / 17 failed** — twelve are `console`'s (every admin page overflows 390 px by exactly 12 px through its sub-nav, which also fails `designer`'s SCR-055 capture and the M2 demonstrable's venues step; a role change that never applies; the moderator's path to attendance; two browse locators/counts) and one is `designer`'s (the locked-region notice on the phone project); both have their lists |
| 7 (2026-09-14) | `0063_poster_pipeline` (`designer`, **promoted with one change**: both trigger functions — `sessions_poster_hook()` and `session_presenters_poster_hook()` — are `security definer`, because they fire on any writer's update, a presenter's own title edit or decline included, and call `enqueue_job()`, which no client role may execute (0025); as invoker functions they turned three wave-1 cases into "permission denied for function enqueue_job" — the same reason 0034's `rsvps_notify()` is a definer; `03` §8.2 +6 rows) · **the lead wires the slots**: `SessionPoster` and `CertificateModeBadge` as item 1 of the event page, `PosterPicker` in its own «الملصق» section on SCR-043 (`admin.schedule.poster`) · `designer` since sync 5: DSG-001/002 (posters three ways, live/detached, both slots real), DSG-010 (brand tokens, undo/redo, logical snapping), DSG-008's runtime half, and **a shipped-then-caught Arabic font bug**: a `unicode-range` on one subset of a two-file family made Arabic resolve to a SYSTEM font while `document.fonts.check()` said true and Tier B said 0.000% (reverted in 6e516c3; the comparative font gate built for DSG-008 is what caught it — a font assertion that is not a comparison between two measured strings is not an assertion) · **the 390 px review is phone-only** in every wave-3 spec and its helper is scroller- and overlay-aware (8a61c22): the "12 px overflow on every admin page" was the desktop project's classic scrollbar at 390 px, measured by a probe against a passing notify page · path 4 of the parity suite holds against a real converter (**28 of 28**, goldens reviewed and committed `150a166`, CI's worker job runs the converter beside the image) | `db:reset` ✅ 0001–0063 · `test:rls` **579 passed / 1 failed / 4 todo, 51 files** — the one is `POL-provision_member.no_match`, which counts `audit_log` globally and saw an append-only row a teammate's concurrent e2e run committed after the reset (`select count(*) from audit_log where action='member.provisioned'` → 1 with zero members); a shared-database artefact, re-run at the wave-end gate with teammates down · policy-diff ✅ · traceability ✅ · `npm test` ✅ 468 · tsc ✅ · lint 0 errors · CI **11/11 green on `8a61c22`** incl. 28/28 in-image |
| 8 (2026-09-14) | `0064_font_materialisation` (`designer`, unchanged — `request_font()` for admins, `record_font()` for `service_role`, the gate report on `fonts`; `03` §8.2 +3 rows) · `worker/src/index.ts` registers `regenerate_poster` and `materialise_font` (all four M6 tasks now; enqueued, never scheduled) · **`console`'s bug-fix pass (3df9422)**: a real ambiguous-embed crash (two FKs into `members` from `check_ins` and `points_ledger`) that had broken SCR-044 for both roles and two CSV exports, a role-change race, the sub-nav, two of its own browse-spec bugs; and one find outside its globs, fixed by the lead: `toggleBookmark()`'s upsert compiled to `ON CONFLICT DO UPDATE` on a table with no update grant, so every first bookmark was `42501` — now `ignoreDuplicates: true` · **the 390 px review is phone-only everywhere** and every remaining `scrollWidth - clientWidth` check in the wave-1/2 specs moved to the scroller-aware helper (a taller admin page had started scrolling vertically, which is the whole quirk) · `sessions-screens.spec.ts` drives the picker inside its dialog with an exact «تم» («سبتمبر» contains «تم» — role names match substrings) · `SessionPoster` reserves its 4:5 box (the event page below it jumped when the image arrived and the phone run never saw a stable «نشر») · `rpcs.test.ts`'s `no_match` case scopes its audit count to the transaction (`designer` diagnosed it) · **`designer` reports every DSG story built** (001–011); CRT-001 … 006 remain · **the lead's runner guard matched `playwright/test` while the process is `playwright test`**, so resets went through during teammates' e2e runs (502s, "connection terminated"); fixed — `console` also ran `supabase start` and restarted Kong twice to get a readable signal and said so | `db:reset` ✅ 0001–0064 · `test:rls` ✅ **590 passed / 4 todo, 52 files** · policy-diff ✅ · traceability ✅ · `npm test` ✅ 468 · tsc ✅ · lint 0 errors · `worker:build` ✅ · rebuild + the four affected specs: see sync 9 |
| 9 (2026-09-14) | **★ the M7 demonstrable, exercised** — `tests/e2e/second-org.spec.ts`: two orgs with real users, each admin walks the dashboard, members, sessions, categories, the audit log and browse and pulls the members export; nothing of the other org appears, own rows do; a member of A opening B's session by id gets the not-found boundary (the event page streams through its slots now, so `notFound()` renders with a 200 — no data leaks, the assertion is on the page) — **6 passed on both projects**; the RLS sweep remains the per-table proof · **the M2 demonstrable is green again on both projects** after three phone-only findings: the picker inside its dialog with an exact «تم», the poster's reserved box, and a dispatched tap for the composer's «نشر» (mobile emulation keeps the focused field in view on a page that grew a poster above it) · `console`'s last pass (138ab5c): a summary-as-button locator, and SCR-044's manual-mark picker now lists confirmed OR waitlisted attendees (the host view's function was scoped to confirmed) · `TEAM.md` §5 carries the wave-3 lessons · `console`'s track is **closed** | `npm run qa` ✅ **44/44** · `npm run visual compare m0-final wave3-mid` ✅ **0.000% on all six** · the four affected specs after the rebuild: 32 passed / 7 skipped by design / 1 (the M2 phone case, fixed above) · **CI is red on `671b059` onward for one reason**: a committed component reads `SessionPosterData.width` while `src/lib/dal/posters.ts` sits uncommitted in `designer`'s working tree — told to commit it; every other job passed |
| 10 (2026-09-14) | `0065_certificates` (`designer`, unchanged — `fan_out_certificates()` from the completion edge, `issue_certificate()` idempotent on (session, member, kind) with the serial from the locked counter, hold/release, `revoke_certificate()` keeping the PDF; every function a definer, the hook tested as a member; `03` §8.2 +7 rows) · **★ the M6 demonstrable's first sentence, run for real** — the worker image (all four tasks) and the converter on the local Supabase network; a seeded org's admin published a session through `publish_session()` with `app_metadata` claims: the poster row appeared (auto, live) and 13 artifacts were queued (five screen presets × png + webp, A4 and A3 pdf) — **and every `render_variant` failed at attempt 1: "the render context pins no faces — a render with no font set cannot be reproduced (REQ-DSG-016)"**. The worker's refusal is the design working; the automatic path's document or `poster_render_context()` pins no faces. Handed to `designer` as a blocker ahead of CRT-003 … 006, with the reproduction; the containers stay up for it · the M2 demonstrable, the M7 demonstrable and the frozen routes are green (sync 9) | `db:reset` ✅ 0001–0065 · `test:rls` ✅ **605 passed / 4 todo, 53 files** · policy-diff ✅ · traceability ✅ · CI **green on `b9cebf7`** (the `SessionPosterData.width` red cleared with `designer`'s DAL commit) |
| 11 (2026-09-14) | `0066_achievement_certificates` (`designer`, unchanged — a badge issues an achievement certificate outright from a definer row trigger on `member_badges`; a final member-ranked snapshot's top three get HELD ones from a statement-level trigger on `leaderboard_entries`; `03` §8.2 +5 rows incl. the public verify, the gapless serial and the certificate-document read cases) · `worker/src/index.ts` registers `issue_certificates` (it requests the render rather than performing it, so a 30-second export never sits inside the serial lock) · **the lead wires the fourth designer slot**: `HeldAchievements` in its own section on SCR-054 (`recognition.admin.heldCertificates`) — a leaderboard certificate is released by an admin, SCR-045 is per session, and an achievement certificate has no session, so without this slot they would sit held forever (`REQ-CRT-012`; recorded for the closing decision as a `09` amendment) · **`designer` reports CRT-001 … 006 built**: the issuance job, `/verify/[code]`, `/app/me/certificates`, SCR-045, revocation, achievements · **a live-site bug found and fixed by `designer`**: `/verify/[code]` is public, so it sits outside `proxy.ts`'s `isPlatformPath` and DEC-038's unconfigured-platform 404 never reached it — with no `NEXT_PUBLIC_SUPABASE_*` (production today) the page threw a 500 on a public URL; it now answers `notFound()` when the platform is unconfigured (widening the proxy predicate is the lead's follow-up) · the render-context blocker (sync 10) is still open with `designer` | `db:reset` ✅ 0001–0066 · `test:rls` ✅ **624 passed / 4 todo, 55 files** · policy-diff ✅ · traceability ✅ · `npm run build` ✅ 18:50 · tsc ✅ · lint 0 errors · `worker:build` ✅ |
| 12 (2026-09-14) | **the render-context blocker, fixed by `designer` (8e75c45)**: `public.fonts` holds only materialised fonts, the platform set lives in the image's manifest with no row, so both request-side jobs pinned an empty face list; the editor's resolver had fallen back to the manifest all along — two resolvers disagreeing is DEC-017 failing by construction, so `worker/src/render/fonts.ts` now has the one `renderFaces()` both jobs call, and `packages/fonts` resolves through the package rather than `process.cwd()` · **★ the M6 demonstrable, run for real on the rebuilt image** (`scratchpad/m6-demo.sh`; org `m6-demo`): `publish_session()` as the admin → **12 of 12 variants ready with Tier A** (master/square/story/landscape/og × png + webp, A4 2480×3508 and A3 3508×4961 pdf); `detach_poster()` → detached/customised, a title change → `stale_since` set and **12 → 12 artifacts, nothing re-rendered**; a manual check-in and the completion edge → **attendance `MDM-2026-000002` and presenter `MDM-2026-000001` issued, counter `next=3`**, 24-character codes; `verify_certificate(code)` as `anon` → 1 row, `verify_certificate(serial)` → 0; the presenter certificate's A4 landscape and portrait PDFs rendered (3508×2480, 2480×3508) · **one defect left**: four of the six certificate artifacts stay `queued` with no `render_variant` job behind them (the queue is empty; the log shows two runs) — the issuance path writes more artifact rows than it enqueues jobs; handed to `designer` · **★ owner check for Launch: scan both QRs on paper at print size** | CI **green on `bda7589`** · the demonstrable's worker log: 0 failed tasks other than `send_notification` reaching the mail sink at `127.0.0.1` from inside a container (expected: the sink is host-local) |

## Wave 2 (M3 · M4 · M5) — COMPLETE on `wave-2/m3-m4-m5` (PR #13, the owner merges)

**The three demonstrables hold locally, proven by the specs that drive the real screens against real local Supabase:**

- **M3** — `tests/e2e/notify-screens.spec.ts` (11 passed): the inbox, the preference matrix with the not-switchable categories, the calendar screen and the ICS over real HTTP; `tests/rls/notify-reminders.test.ts` proves a reschedule leaves ONE pending job per member per offset and cancels the past ones; `notify-session-notices` proves the change notice carries both values and the publish chain announces once. **Owner's manual checks at Launch:** open the ICS in Outlook on Windows; real Google sync (a stub in tests).
- **M4** — `tests/e2e/points.spec.ts` + `leaderboards.spec.ts` (6 passed, twice): a member reads their whole history with every row's real reason; an admin's catalogue edit shows immediately; the rebuild reproduces every balance (`audit-balances.test.ts`); سباق الشركات shows both metrics.
- **M5** — `tests/e2e/materials.spec.ts`, `proposal-materials.spec.ts`, `photos.spec.ts`, `tasks.spec.ts`, `bookmarks.spec.ts` (11 passed): a deck read page by page with the arrows following the reading direction, the substitution warning on the material, a real upload through the form against real Storage, a photo whose stored bytes carry no EXIF, a takedown that hides before the page reloads. **Not run in this wave:** the live converter + worker pipeline end to end (the contract is unit-tested against the converter's own doc comment and `npm run converter:test` is green); the steps are in `docs/plan/notes/content.md` §4.

### Shipped

Migrations **`0024`–`0054`** (31; `supabase/proposed/` empty) · screens SCR-022, 025, 026, 027, 028, 053, 054, 058, the admin reminders and emails routes, SCR-013, SCR-024, plus five slots on the event page, the proposal screen and the shell · DAL modules `notifications`, `calendar`, `points`, `leaderboards`, `recognition`, `scoring-admin`, `materials`, `photos`, `tasks`, `search`, `bookmarks` · 20 worker tasks on the crontab and the queue, the mail transport with its sink · message namespaces `notifications`, `calendar`, `scoring`, `leaderboards`, `recognition`, `materials`, `photos`, `tasks`, `search` (Arabic first) · **DEC-046, DEC-047**.

### Definition of done on ``d68a35b``

| Check | Result |
|---|---|
| `npm run db:reset` | ✅ `0001`–`0054` (with the queue schema reinstalled) |
| `npm run test:rls` | ✅ **495 passed / 4 todo, 45 files**, the sweep over every table incl. the 24 wave-2 ones |
| `npm run policy-diff` | ✅ |
| `node scripts/traceability.mjs` | ✅ 251 / 64 / 112, no gaps, matrix current |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ 0 errors (13 warnings, all pre-existing `eslint-disable` directives) |
| `npm test` (unit + components) | ✅ **332 passed, 46 files** — incl. the per-track i18n guards and the namespace-collision test |
| `npm run worker:build` · `fonts:check` · `converter:test` | ✅ · ✅ 9 faces / 6 TTF · ✅ 16/16 |
| `npm run build` | ✅ 54 routes |
| `npm run qa` | ✅ **44/44** |
| `npm run visual compare m0-final wave2-final` | ✅ **0.000%** on all six captures — after the namespace deep-merge fix (`bbedf56`): a shared top-level key had replaced the landing page's recognition section, and this gate is what caught it |
| `npm run test:e2e:local` | ✅ **118 passed / 0 failed / 8 skipped by design** (two workers, both profiles; every wave-1 and wave-2 spec, the three demonstrables included) — after two shell fixes the gate itself demanded: the nav's wrap had pushed the RSVP action 13 px below the fold, and a 16 px overflow at 390 px needed a compact bell |
| `npm run test:e2e:unconfigured` | ✅ 16 passed, 110 skipped by design |
| CI on PR #13 | ✅ **all jobs green on `d68a35b`** (the gate commit); the STATUS commit after it is docs only |
| 390 px RTL captures, looked at | ✅ notify 4 · scoring 5 · content 6 (`.qa-shots/rtl/`) |

### Handoff for the wave-3 lead

1. **Read** `DECISIONS.md` DEC-046 and DEC-047, `TEAM.md` §3 and §5 (grown this wave), and the three handoff sections: `docs/plan/notes/notify.md` §6, `scoring.md` "Handoff to wave 3", `content.md` §4–§5.
2. **SCR-011 (`/app/sessions`, browse) was never built in wave 1.** Nothing links to it. `SearchFilters` and `BookmarkButton` (`src/components/search/`, DAL and tests done) wait for that page; `console` or a `sessions` follow-up builds it first.
3. **Three stale `TODO(notify, M3)` comments** survive in `0014` (lines 75, 144) and `0045` (line 103). Migrations are forward-only; the work is done by the `rsvps_notify` trigger of `0034`. Do not implement them.
4. **Worker environment** for the content tasks: `CONVERTER_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`worker/README.md`); the worker image is proven by its probe in CI; the host is chosen at Launch (DEC-046).
5. **Launch inputs:** the Google OAuth client with calendar scopes and its secret on Vercel for the callback exchange (`src/app/api/calendar/oauth.ts`), the Resend account (`RESEND_API_KEY` is never read before Launch), the worker host, the converter's endpoint token if the host has no private networking (OQ-027).
6. **The fixture** (`tests/rls/fixture-m3.ts`, `-m4.ts`, `-m5.ts`) seeds every wave-2 table for `members[0]`; a new per-policy case counts by id or clears its tables in `setup()` inside the transaction.
7. **The path builder** is still a port (`worker/src/content/paths.ts` mirrors `src/lib/storage/paths.ts`, parity-tested); wave 3 turns it into `@kareem/storage-paths` with a lockfile regeneration.
8. **`08`'s fourth reminder message** (offset-agnostic) is M7-console's; `MSG-rsvp_deadline_soon` has no job.
9. `.next` on disk is the wave-final build; `npm run db:reset` (with the reset lock) before any RLS run.

### The wave as it ran (the sync log below is the record)

#### Wave 2 — PREPARED (kept as written at the start)

**Done this session (the wave-2 lead, 2026-09-14), before anyone is spawned:**

- **`main` @ `e0b448d`** (PR #12 merged, CI green on the last three pushes to `main`); local Supabase
  healthy; `wave-2/m3-m4-m5` cut from it.
- **Migration `0024_session_transition_guard`** — the table-level guard on `sessions.state` DEC-045
  deferred, plus `occurred_at default clock_timestamp()` on `audit_log` and
  `session_state_transitions`. The guard exposed a real conflict: `0020`'s presenter-decline trigger
  returns a session to `draft`, an edge the frozen `02` §6.2 never drew but `REQ-PRO-007` defines;
  `02` is amended under **DEC-046** rather than the guard breaking the decline. Two fixtures that
  jumped states now walk legal edges; `tests/rls/sessions-guard.test.ts` adds six cases.
  **Gates:** `supabase db reset` ✅ `0001`–`0024` · `npm run test:rls` ✅ **212 passed / 4 todo, 20
  files** · `policy-diff` ✅ · traceability ✅ (matrix regenerated) · tsc ✅ · lint 0 errors.
  Commit `29ffbef`.
- **DEC-046** also records the owner's two standing decisions: **OQ-027 closes for wave 2 without
  a host** (the worker stays a host-agnostic Docker image, locally and in CI; the production host
  is chosen at Launch with PR C) and **email in development and CI goes to a sink, never a
  provider** (Mailpit on `:54324`/SMTP `:54325` locally, an in-memory transport in CI; Resend is
  wired at Launch).
- **`.claude/agents/{notify,scoring,content}.md`** written from the wave-1 template with the
  ownership globs below. Not committed until the owner approves the plan.

**The owner approved the plan as presented (2026-09-14; `content` stays on Sonnet) and set the
wave goal:** every wave-2 story done by its teammate, the definition of done proven on the branch,
the three demonstrables passing locally, decisions logged, the wave-3 handoff here, teammates shut
down, PR open with CI green; no merge, no hosted Supabase, no Vercel, no real mail provider.

**Pre-spawn tasks — all done (lead, 2026-09-14):**

| # | Task | Commit / proof |
|---|---|---|
| 1 | `0025_enqueue_job` — `public.enqueue_job()`, the one door to the queue; `scripts/rls.mjs` installs the `graphile_worker` schema before every RLS run, CI's `rls` job after the migrations | `74ba237` · `test:rls` **217 passed / 4 todo, 21 files** · policy-diff ✅ · traceability ✅ |
| 2 | `worker/Dockerfile` (host-agnostic, worker workspace only, runs as `node`) + CI builds it and runs the probe inside | `08863a7` · local build 394 MB, in-image probe against local Supabase **OK, 6 ms** |
| 3 | `[local_smtp] smtp_port = 54325` — Supabase stopped and started, port answers | `08863a7` |
| 4 | `TEAM.md` §1 (confirmed rows + the wave-2 contracts) and `CLAUDE.md` § Agent team | `52d9e49` |
| 5 | Pushed; **draft PR #13** open at the first push; `notify` (opus), `scoring`, `content` (sonnet) spawned with their first tasks (plan in `docs/plan/notes/<name>.md`, then the milestone schema as proposed SQL, then the first story) | — |

### Sync log

| Sync | Promoted | Gates |
|---|---|---|
| 0 (2026-09-14) | 0024, 0025 (lead, pre-spawn) | CI on the first push of PR #13 (`52d9e49`) **all jobs green** — the `rls` job with the schema install and the new in-image worker probe included; `.next` rebuilt fresh after spawn |
| 1 (2026-09-14) | `0026_notification_contract` (`notify`, unchanged; `aa98bec`) · `0027_m4_schema` (`scoring`, + the lead's `points_ledger_append_only` trigger and an org-cascade clause in all three guards; `53b5013`) · `03` §8.2 +36 rows · fixtures `fixture-m3.ts`, `fixture-m4.ts` (the sweep is non-vacuous) · the bell wired into the shell (`cc5c908`) | reset ✅ 0001–0027 · `test:rls` green on every committed file (the red files are untracked WIP — a wave rule now: never save a failing test under `tests/rls/`) · policy-diff ✅ · traceability ✅ · tsc ✅ · build ✅ 32 routes · CI green on `513a4bf` after a re-push (the first push carried a stale traceability matrix — regenerate and commit it in the same commit as any `03` change) |
| 2 (2026-09-14) | `0028_award_points` (award_points() + the check_in() replacement at 0015's TODO) · `0029_award_hooks_ratings_comments` (SQL-only hooks into `event`'s tables) · `0030_send_notification` (send context with the send-time re-check; delivery log append + provider-scoped update) — all unchanged · `03` §8.2 +10 rows · worker `taskList` gains `award_points`, `send_notification` · `npm run db:reset` reinstalls the queue schema · **fix(i18n)**: `NumeralSystem` spelled `arabic` while the enum says `arabic_indic` — Arabic-Indic orgs got Western digits everywhere; found by `notify`, fixed at the source in four wave-1 DAL DTOs | `db:reset` ✅ 0001–0030 · `test:rls` green on every committed file (6 red = `content`'s untracked WIP) · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors (13 warnings, pre-existing) · `worker:build` ✅ · CI on `e2119ed` **all jobs green** |
| 3 (2026-09-14) | `0031_award_presenter_points` · `0032_manual_adjustment_and_reversal` · `0033_audit_balances` · `0034_reminders` (+ `cancel_job()`, enqueue_job's twin; the RSVP notices as a trigger on `rsvps`) · `0035_reminder_sends` — all unchanged · `03` §8.2 +17 rows · worker `taskList` +7 (presenter points, no-shows, balance audit, reminder, nudge, rating prompt, reconciliation) · the runner check is now `pgrep -fl "node_modules/.bin/vitest"` (the old grep matched other agents' waiting shells) | `db:reset` ✅ 0001–0035 · `test:rls`: one `notify-contract` case red (queue rows the fixture's RSVP inserts now enqueue — handed back) + content's 6 untracked WIP · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · `worker:build` ✅ · push waits on the notify fix · `.next` rebuilt 08:47 on `dbeca9c` (bell + points strip wired; an orphaned `next start` from the previous session — ppid 1, no gate lock, 5 h old — was holding port 3000 and is gone; a waiter must use `pgrep -fl next-server`, since `pgrep -f "next start"` matches the waiter itself) |
| 4 (2026-09-14) | `0036_session_notices` (`notify`, unchanged — the REQ-SES-009 change notices with both values, publish and cancel notices, all guarded on the state EDGE so publish_session()'s four-row walk announces once) · `03` §8.2 +5 rows · `AddToCalendar` wired into the event page's RSVP rail · the `notify-contract` queue count fixed by the lead (setup() clears the queue the fixture's RSVP notices fill) | `db:reset` ✅ 0001–0036 · `test:rls` green on every committed file (red = `content`'s 6 and `scoring`'s `recognition-evaluators` 2, both untracked WIP) · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · `worker:build` ✅ · CI on `5357dc0` (syncs 3 + 4) **all jobs green** |
| 5 (2026-09-14) | `0037_m5_schema` (`content`, unchanged — 11 tables, `reports.photo_id`, `ar_normalize()` + `sessions.search_vector` (an additive ALTER on a frozen table, for the DEC), the six buckets with nine `storage.objects` policies, `remove_material()` — a real finding: an UPDATE's result must satisfy the SELECT policy, so `removed_at` can only be set by a definer RPC) · `03` §8.2 +23 rows, §6.9 lists the nine bucket policies for the gate · `fixture-m5.ts` (the sweep is non-vacuous for all 11) · worker `taskList` +3 (`calendar_upsert`, `calendar_delete`, `refresh_calendar_tokens`) and crontab lines for the hourly token sweep and the nightly balance audit · one lint fix in `notify`'s SCR-025 (an `<a>` to a Route Handler is right; the page rule is silenced with the reason) · **the first attempt at this commit (`8cdd08e`) carried only the traceability matrix** — a failed edit in a `&&` chain skipped the path list; the real commit follows | `db:reset` ✅ 0001–0037 · `test:rls` green on every committed file · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · `worker:build` ✅ · CI: see below |
| 6 (2026-09-14) | `0038_calendar_sync` (`notify`; + a lead clause: the disconnect notice skips when the member is gone, so an org deletion cascades) · `0039_m2_notices` (the last of DEC-045's deferrals: replies, mentions, decisions, invitations, assignment, removal, reports) · `0040_reminder_schedule` · `0041_recognition_evaluators` · `0042_snapshot_leaderboards` (`scoring`) · `0043_photo_hidden_notify` (`content`) — all otherwise unchanged · `03` §8.2 +24 rows · the contract test's cleanup empties the inbox last (deleting a connection now writes a notice) · **owner input for Launch (notify):** the Google OAuth client secret lives on Vercel for the code exchange in the callback — not `service_role`, so invariant 7 holds; reasoning in `src/app/api/calendar/oauth.ts` | `db:reset` ✅ 0001–0043 · `test:rls` **453 passed / 4 todo, 43 files — the whole tree, nothing red** · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · CI: see below |
| 7 (2026-09-14) | `0044_all_time_leaderboard` (`scoring`, unchanged) · `0045_priority_rsvp` (`scoring`; the `reserve_seat()` replacement — **two lead changes, DEC at wave end:** the priority window exists only while the org's `priority_rsvp` perk is enabled, and the perk now ships **disabled** like `can_host` (`0027` seed changed), because a window nobody can use only closed general RSVP for a day and every M2 flow, the demonstrable included, reserves at publish) · `03` §8.2 +2 rows · the tracked proposed copies of promoted files removed (`25791b1` — CI applied `0039` twice through a test's `existsSync` guard; the rule is now `git rm` the proposed path in the promotion commit) | `db:reset` ✅ 0001–0045 · `test:rls` green on the whole tree (45 files) · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · CI: see below |
| 8 (2026-09-14) | `0046_finalize_material_upload` (`content`, unchanged — the upload finaliser: authority re-derived, the org's size limit, `convert_document` enqueued for PDF and PowerPoint, Keynote download-only, version numbering) · `03` §8.2 +4 rows · the `Materials` slot wired into the event page's main column under its own `<h2>` (`sessions.event.materialsLabel`, Arabic first) · **CI lesson:** two pushes failed the build with `Cannot find module './ar/materials.json'` — a namespace named in `src/messages/index.ts` before its JSON was committed (TEAM.md §3's rule, broken once more; `89efe88` carries both) | `db:reset` ✅ 0001–0046 · `test:rls` green on the whole tree · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · CI: see below |
| 9 (2026-09-14) | `0047_award_badge_manually` (`scoring`, unchanged — the only door for the manual-metric annual badge) · `03` §8.2 +3 rows · the tracked proposed copies of `0046`/`0047` removed in the same commit (the rule) · **M3 is complete** — `notify`'s definition of done ticked in full: e2e 11 passed / 1 skipped by design on the 09:28 build, four 390 px captures reviewed (SCR-025, 026, 058, reminders), 249 unit, 464 RLS; the review found three numeral/height defects nothing else could see | `db:reset` ✅ 0001–0047 · `test:rls` green on the whole tree · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · CI: see below |
| 10 (2026-09-14) | `0048_record_material_conversion` (`content`, unchanged — the worker's two doors: record the converted PDF, record the rendered pages and mark the material ready; `render_pages` enqueued from SQL) · `0049_record_material_download` (the audited admin download, the one door to `write_audit` for the app) · `03` §8.2 +7 rows · worker `taskList` +2 (`convert_document`, `render_pages`) with three new worker-only variables documented in `worker/README.md` (`CONVERTER_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Launch inputs with the host) · **M4 is complete** — `scoring`'s definition of done ticked: e2e 6/6 twice, five captures reviewed, `scoring-i18n.test.ts` found the one text placeholder that needed `<bdi>`; handoff sections written by `notify` (`7d7f7e2`) and `scoring` | `db:reset` ✅ 0001–0049 · `test:rls` green on the whole tree · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · `worker:build` ✅ · CI: see below |
| 11 (2026-09-14) | `0050_photo_pipeline` (`content`: the browser PUTs raw bytes under the check-in gate, `initiate_photo_processing()` enqueues `process_photo`, the worker strips EXIF/XMP/ICC byte-level and `record_photo_upload()` — the only door to a `photos` row — returns a DEC-043 envelope) · `0051_photos_audit_staff_actions` · `0052_materials_audit_phase_change` — all unchanged · `03` §8.2 rows added · `process_photo` registered · the `Photos` slot wired into the event page under its own `<h2>` («الصور») · MAT-005 (`81e3c18`, the upload form in the slot) | `db:reset` ✅ 0001–0052 · `test:rls` green on the whole tree · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · `worker:build` ✅ · CI: see below |
| 12 (2026-09-14) | `0053_proposal_materials` (`content`, unchanged — `materials.session_id` becomes nullable with a session-XOR-proposal check, every session-shaped policy and bucket rule gains a proposal branch, `is_proposal_owner_of()`, and a trigger on `sessions` reassigns a proposal's materials to the session created from it and enqueues the waiting conversions; REQ-PRO-004, DEC-045's last deferral) · `03` §8.2 +4 rows · `ProposalMaterials` wired into the proposal screen · **every M5 story is built** (MAT-001…006, EVT-005/006, TSK-001/002, DSC-001…003, PRO-004) · **wave-1 gap found:** SCR-011 (`/app/sessions`, browse) was never built — nothing links to it and the file does not exist — so `SearchFilters` (`src/components/search/filters.tsx`, DAL and tests done) has no page to sit on; wave 3 builds the page and wires it (a note for the wave-3 lead, not a wave-2 story) | `db:reset` ✅ 0001–0053 · `test:rls` green on the whole tree · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · CI: see below |
| 13 (2026-09-14) | `0054_materials_storage_read_preupload` (`content`) — **a real defect the first browser upload found:** the complete step downloads the landed bytes through the uploader's own client to sniff them, before `finalize_material_upload()` creates the `material_versions` row that `materials_storage_read` joins through, so every upload's complete step 403'd; the read policy gains the pre-finalize self-read branch mirroring the write policy's own path check (whoever may write the path may read it back), three RLS cases, no widening for anyone else · `03` §8.2 +3 rows, §6.9 amended · e2e `proposal-materials.spec.ts` drives the real form against real Storage (`b0ba0d0`) — the first spec that did | `db:reset` ✅ 0001–0054 · `test:rls` green on the whole tree · policy-diff ✅ · traceability ✅ · tsc ✅ · lint 0 errors · CI: see below |

## M2 — wave 1 — COMPLETE on `wave-1/m2` (merged as PR #12)

**The M2 demonstrable holds locally, end to end, through the real screens**, as one serial Playwright
test against real local Supabase (`tests/e2e/sessions-screens.spec.ts`, commits `a3f8497`, `38e72d8`): add a
venue → propose → approve → create the session → schedule → publish → reserve a seat → **the clock
starts it** (`clock_start_sessions()`, audit row with no actor) → staff read the rotating code →
check in with it → comment → **an admin completes it** (audit row naming the admin) → rate. Rows
asserted at every step: `rsvps.status`, `check_ins.method = 'code'`, the comment's author, the
rating's stars and non-null `check_in_id`, no live code after completion, the seven-step transition
chain, the seven `audit_log` actions in order.

### Shipped

Migrations **`0011`–`0023`** (13, `supabase/proposed/` empty) · screens SCR-011, 012,
014, 015, 016, 017, 018, 041, 042, 043, 046 · DAL modules `proposals`, `sessions`, `rsvp`,
`checkin`, `comments`, `reactions`, `reports`, `ratings` · the slot contract and all three slots ·
worker tasks `promote_waitlist`, `rotate_codes`, `start_session`, `complete_session` (clock on an
every-minute crontab) · message namespaces `proposals`, `sessions`, `admin`, `rsvp`, `checkin`,
`event`, `ratings` (Arabic first) · **DEC-042 … DEC-045**.

### Definition of done on `b430871`

**Gate run: (the lead's final gate run, all on local Supabase; app code last changed at `a3f8497`):**

| Check | Result |
|---|---|
| `supabase db reset` | ✅ `0001`–`0023` |
| `npm run test:rls` | ✅ **206 passed / 4 todo**, 19 files, sweep over 24 tables |
| `npm run policy-diff` | ✅ |
| `node scripts/traceability.mjs` | ✅ 251 / 64 / 112, no gaps, matrix current |
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ 0 errors (8 warnings) |
| `npm test` (unit + components) | ✅ **117 passed** |
| `npm run worker:build` · `npm run fonts:check` | ✅ |
| `npm run build` | ✅ 25 routes |
| `npm run qa` | ✅ **44/44** |
| `npm run visual compare m0-final wave1-final` | ✅ **0.000%** on all six captures — the live site is unchanged |
| `npm run test:e2e:local` | ✅ **78 passed / 0 failed / 6 skipped by design** (two workers, both profiles; includes the end-to-end demonstrable) — final code `b430871` on the build of `a3f8497` (later commits are test/docs only) |
| `npm run test:e2e:unconfigured` | ✅ 16 passed, 68 skipped by design (both `NEXT_PUBLIC_` variables empty: every platform route 404, frozen routes untouched) |
| CI on PR #12 | ✅ **13/13** on `a3f8497` and on every push since sync 3; final run on `b430871` **13/13 green** (the STATUS commit after it is docs only) |
| 390 px RTL captures, looked at | ✅ SCR-012, 014, 015, 016, 017, 018, 041, 042, 043, 046 (`.qa-shots/rtl/`; the lead looked at SCR-012) |

### Observed once, recorded honestly

 the first full-suite gate run on this build failed the
demonstrable on both profiles, and the artefacts show `next start` stopped answering mid-run
(`net::ERR_CONNECTION_REFUSED` on a plain navigation on the phone project; Next's own "This page
couldn't load" on desktop) while two other agents were running suites on the same machine. The
rerun with the identical two-worker configuration passed 78/78, and the walk passes alone on both
profiles. Nothing in the product was wrong; `38e72d8` also fixed six test-side races and wrong
assertions found on the way. **For the wave-2 lead:** the demonstrable is the heaviest test in the
suite and runs twice concurrently against one `next start` and one Postgres; if this recurs, give
it `workers: 1` or a serial project dependency in `playwright.config.ts` (lead-only), and keep the
stub server's log — a crash names the route, a teardown race does not.

### Deferred, not faked (DEC-045)

 `REQ-PRO-004` (M5 materials) · the poster gate of `REQ-SES-001`
(M6) · `REQ-EVT-007` reply notifications (M3) · job enqueueing from the RSVP/check-in RPCs (worker
hosting, OQ-027 at M3; call sites marked) · the native date picker's locale on SCR-043 (M7-console).

### First migration of wave 2, before anyone is spawned

 a table-level guard on `sessions.state`
(and move the fixtures that set state directly onto the RPCs); decide `audit_log.occurred_at` →
`clock_timestamp()` at the same time.

### Security findings closed this wave

 (each a real hole in the plan or in `0010`): a named
presenter could be pulled across the tenancy boundary (`0012`); the `03` §7.2 host-topic sample
had no org check (`0016`); the admin's direct select on `ratings` was an unaudited read of per-rater
data (`0017`); `check_in()` as sketched rolled back its own attempt row (`0015`, DEC-043).

### Sync log


**Started 2026-09-14** after the owner approved the wave plan. Pre-flight on `main` @ `5378555`: CI
green on the last five pushes, five frozen routes answer, `/ar/app` 404 by design, local Supabase
healthy, `supabase db reset` applies `0001`–`0010`, `npm run test:rls` 95 passed / 4 todo.
`wave-1/m2` cut; `docs/plan/notes/` created for the teammates' plans.

**Spawned:** `sessions` (opus) → slot contract first, then STORY-PRO-001 onward · `checkin` (sonnet)
→ STORY-RSV-001 (`reserve_seat()` as proposed SQL) onward · `event` (sonnet) → STORY-EVT-002
(threaded comments + the private Realtime channel) onward, since EVT-001 is the page `sessions` owns.

**Promoted SQL, sync points and CI runs are logged below as they happen.**

| Sync | Promoted | Gates |
|---|---|---|
| 1 (2026-09-14) | `0011_proposal_transitions` (audit + guard triggers, `98db766`) · `0012_copresenters` (same-org guard on both presenter tables, `create_proposal()`, `aaa9f95`) — `03` §8.2 +5 rows | `supabase db reset` ✅ · `test:rls` **163 passed / 4 todo**, all 15 files incl. teammates' ✅ · `policy-diff` ✅ · tsc ✅ · lint ✅ · build ✅ after three `"use server"` constant exports were moved out (`3cded54`, `9b2a4a7`; the Next 16 rule tsc cannot see) · `npm run qa` **44/44** · `npm run visual compare m0-final wave1-s1` **0.000%** on 6 captures · `test:e2e:local` 42 passed / **4 failed** (all in `sessions`' two new specs, handed back) · pushed; **draft PR #12** open so CI runs per push |
| 2 (2026-09-14) | `0013_proposal_review` (`review_proposal()`) · `0014_rsvp_rpcs` · `0015_check_in_rpcs` (`2faff35`) — **DEC-043** (outcome envelope, not raise-after-write) · worker `taskList` gains `promote_waitlist`, `rotate_codes` | reset ✅ · `test:rls` 174/4 todo ✅ (two false failures traced to a **concurrent teammate run** — the suite is single-runner) · policy-diff ✅ · tsc/lint/unit 117 ✅ · build ✅ · qa **44/44** · visual **0.000%** · CI: 12 pass, **RLS ✗** — bare container has no `realtime` schema (fixed at sync 3) |
| 3 (2026-09-14) | `0016_realtime_authorization` (host topic org-scoped) · `0017_ratings_admin_audited` (**drops** `ratings_read_admin`) · `0018_comments_self_delete` · `0019_rating_count` — **DEC-044** · CI shim gains `realtime.messages` + `send()` · `03` §5.6/§7.2/§8.2 corrected | reset ✅ 0001–0019 · `test:rls` **188 passed / 4 todo**, 17 files ✅ · policy-diff ✅ · traceability ✅ · tsc ✅ · build ✅ · CI on `93f6734` **13/13 green** (Realtime shim proven) |
| 4 (2026-09-14) | `0020_session_creation` (`create_session()`, one session per proposal, decline returns to draft) `93f6734` | reset ✅ · RLS green for all promoted files · policy-diff ✅ · traceability ✅ |
| 5 (2026-09-14) | `0021_session_scheduling` (`schedule_session()`, `publish_session()` — the poster gate waits for M6) · `0022_session_clock` (`clock_start/complete_sessions()`, service_role only, forward-only; `11` §2.1's manual-skip is the state filter) `c6d07b1` · worker `taskList` gains `start_session`, `complete_session` on an inline every-minute crontab | reset ✅ 0001–0022 · `test:rls` 195/4 todo (one collision) ✅ alone · policy-diff ✅ · traceability ✅ · `worker:build` ✅ · build ✅ · **full `test:e2e:local` 66 passed / 6 failed** = one case per track on both profiles, handed back (`checkin.spec.ts:151`, `event-comments.spec.ts:123`, `sessions-propose.spec.ts:194`) |

**Lead decisions and findings during the wave (not re-litigations):**

- **DEC-042** — `sessions` owns `app/admin/{proposals,sessions,venues}/**` for wave 1; SCR numbers in
  the agent definitions corrected to `09`'s.
- **`scripts/policy-diff.mjs` keys relations by schema** (`1b7b220`): the first migration to policy
  `realtime.messages` (`03` §7.2) would have failed the gate with a misleading message, and a grant on
  it could not be parsed at all. A Supabase-owned relation's documented policies are flagged only once
  a migration policies it; that migration must state its grant.
- **`REQ-PRO-004` (draft materials on a proposal) is deferred to wave 2 / M5** — no `materials`
  table exists and the requirement inherits every `REQ-MAT-*` rule. `sessions` did not fake it
  (`docs/plan/notes/sessions.md` §2.1). STORY-PRO-002 is done except for that half.
- **Open for a lead decision, not blocking:** `audit_log.occurred_at` defaults to `now()`, the
  transaction timestamp, so several audit rows from one transaction share an instant and their order
  is undefined. `clock_timestamp()` would fix it; `02` is frozen so it needs a DEC.
- **`proposals` has no admin update policy in `0010`** (only the proposer's), so review actions are a
  definer RPC — `supabase/proposed/sessions/0003_proposal_review.sql`, in progress.
- **The RLS suite is single-runner.** Two processes running `npm run test:rls` against one local
  database collide on fixtures and fail unrelated files (seen twice at sync 2). Check
  `ps aux | grep 'vitest run --project rls'` before running it.
- **The shared git index races.** Three commits this wave carried another teammate's staged files
  (`d42bcf1`, `5c4f97f`, `6efd2c8`); content intact, attribution wrong. Stage by explicit path and
  commit immediately.
- **Wave-1 tests that touch the working tree:** the shared tree builds as it stands on disk; a
  mid-edit DAL or a `"use server"` constant breaks `npm run build` for everyone. tsc does not catch
  the latter.

## M2 — wave 0 (previous session, PR `m2/schema` — merged as #10)

**Done, awaiting merge:** migration `0010` — the whole M2 schema with RLS, grants, the guard
triggers, `is_presenter_of()` / `has_checked_in()` and the presenter-only aggregates view; no RPCs
(those are the teammates' first proposed files). `03` §8.2 gains rows for the six pattern tables.
The message catalogue is split per namespace (`src/messages/{ar,en}/<ns>.json`, merged by
`src/messages/index.ts`). The gate lock (`scripts/lib/gate-lock.mjs`) serializes `npm run qa`,
`npm run visual`, Playwright's server, the unconfigured build and the `TaskCompleted` hook on
`/tmp/task-gate.lock`. `applyProposed()` and `supabase/proposed/` carry the migration rule.
`.claude/agents/{sessions,checkin,event}.md`, the settings allow/deny lists, `CLAUDE.md` § Agent
team and `TEAM.md` (with the spawn prompt) are in place. **Nothing was spawned.**

**Proof on the branch:** `supabase db reset` applies `0001`–`0010` · `npm run test:rls` **95/95 +
4 todo** (the sweep now walks 24 tables) · `npm test` 69/69 · `npm run qa` 44/44 · `npm run
visual compare m0-final m2-schema` **0.000%** · `npm run test:e2e:local` 34/34 · policy-diff and
traceability green.

**Next session = the lead.** Start it with the prompt in `TEAM.md` §4, from a green `main` after
this PR merges. Wave 1 is `sessions` (opus), `checkin` (sonnet), `event` (sonnet).

## M1 — where it stands

**PR A (#4) and PR B (#6) are merged into `main` (`e253ea0`, `453e540`); CI on `main` and the Vercel production deploy succeeded; the five frozen routes answer.** GitHub closed the original PR B (#5) when its base branch was deleted, so it was re-opened unchanged as #6.

**PR A (#4, `m1/tenancy` → `main`) — merged.** Migrations `0003`–`0006`;
`tests/rls` with 61 tests on local Supabase and on the CI shim; `policy-diff` green; DEC-035.

**PR B (#6, `m1/app` → `main`) — merged.** Slice 1 (`6221c06`):
`@supabase/ssr` clients, the DAL with `requireSession()` narrowed on `data`, `proxy.ts` with
report-only CSP, DEC-036 and OQ-028, the README's `NEXT_PUBLIC_` invariant retired. Slice 2
(`b922197`): sign-in, callback, choose-org, no-access, sign-out, the app shell, home, profile,
another member's page, migration `0007` (Before User Created hook, `REQ-AUT-006`), the auth e2e
spec and the signed-in e2e spec. Slice 3 (`bf3e67f`): what the signed-in e2e found — `/api/*`
excluded from the proxy matcher (next-intl was rewriting the auth Route Handlers), the home page's
rich messages, and migration `0008` (the domain audit trigger broke org deletion on cascade).

**Proof on `bf3e67f`, all on real local Supabase:** `supabase db reset` applies `0001`–`0008`
cleanly · `npm run test:rls` **66/66** · `npm run test:e2e:local` **34/34** (unauthenticated,
CSP, Route Handlers, and the signed-in home/profile/member/sign-out flows) · `npm run qa`
**44/44** · `npm run visual compare m0-final m1-final` **0.000%** on six captures, frozen HTML
with no nonce attribute · unit + components 66/66 · `policy-diff`, traceability, tsc, lint clean.
Live hook probe through the local Auth API: a sign-up on an unlisted domain → **403
`domain_not_allowed`**, zero orphan rows; on a listed domain → token issued.

**Two things PR B learned that the plan did not know:**

- **A nonce in the CSP header makes Next render prerendered pages dynamically** and stamp every
  script tag. The frozen marketing routes therefore get a **nonce-less** report-only policy; the
  platform routes get the nonced one. The visual diff and the e2e spec pin it.
- **`supabase db reset` does not reload `config.toml` auth hooks** — a hook enabled there needs
  `supabase stop && supabase start`.
- **`supabase start` can hang silently on a macOS Keychain dialog.** Because the CLI is linked to
  the hosted project it reads its access token from the Keychain item "Supabase CLI" on every
  start; when macOS asks whether `security` may read it, the CLI waits forever with no output —
  it looks like a slow Docker pull. The tell is an orphaned
  `security find-generic-password -s "Supabase CLI"` process. Click **Always Allow** on the
  dialog (owner's screen), then start again. Cost one session an hour.

**Pre-cutover PR (`m1/pre-cutover`, both decisions approved by the owner on 2026-09-14):**

- **DEC-037** — migration `0009` revokes `anon`'s `TRUNCATE` on the frozen `registrations` table;
  the owner ran the same statement in the hosted SQL editor (2026-09-14, verified: anon keeps
  `insert` only, 19 rows intact).
- **DEC-038** — the frozen marketing files now live in `src/app/[locale]/(marketing)/` with their
  own layout (header, `main`, footer); the locale layout renders only the providers. URLs and HTML
  unchanged: `npm run visual` 0.000%, `npm run qa` 44/44. The `(auth)` and `app` layouts render
  their own `main` under the wordmark. **The unconfigured guard:** with the two `NEXT_PUBLIC_`
  variables unset — production until launch — the build succeeds, every platform route and auth
  screen is a 404 through the marketing catch-all, the auth Route Handlers answer 404, and the
  frozen routes are untouched. Proven by `npm run test:e2e:unconfigured` (builds with both empty:
  16 e2e pass, 24 skip by design; on that build `npm run qa` 44/44 and the visual diff 0.000%) and
  by the CI `unconfigured` job.
- Observed once, not reproduced: the `signing out` e2e failed in one full run (`toHaveURL`) and
  passed on the rerun and alone. If it recurs, suspect the two workers' timing on the stubbed
  server, not the app.

**Still deliberately out of M1:**

- Admin CRUD screens (domains, settings, companies, categories, venues, members): policies and
  RPCs exist and are tested at the database; UI is M2/M7 per `09`.
- Sign-in rate limiting (`12` §3: 10 per IP per 5 min) needs a shared store; Supabase Auth's own
  limits apply meanwhile. Noted for M2 with the first Route Handler that needs one.
- `worker/src/supabase.ts` (the `createWorkerClient()` of `04` §5.1): with M3's first job.

## Handoff for the Launch session — PR C, complete (supersedes the M1-era checklist below it)

**Read first:** DEC-039 (Launch is the only milestone that touches the hosted project), DEC-051 … DEC-057
(wave 4), `14` "Launch", `04` §9–§10, `12` §7. **Nothing here has been done.** Every step that changes
the hosted project, Vercel, a DNS record, a GitHub setting or a mail provider needs the owner's explicit
go, step by step; the deny list refuses the commands on purpose, so the owner runs them or lifts one for
one step. The lead of that session never merges, never force-pushes, never changes repository settings.

### Migrations to ship
`0003` … `0073` (the platform), on top of the frozen `0001`/`0002`. `registrations` is referenced by none
of them. Rehearse first (step 1), against a schema-only dump of production — invariant 3.

### The order, on launch day

1. **Rehearsal, no production change.** `supabase db dump --linked --schema-only` → a fresh local
   database → `0003`–`0073` on top → `npm run test:rls` (60 files, the isolation sweep over every table)
   → `npm run policy-diff` → delete the dump. If a migration fails on production's shape, the day ends
   here with a fix on a branch, and the count of `registrations` is untouched.
2. **Asymmetric JWT signing keys** on the hosted project (Dashboard → Auth → JWT keys). Without them
   `getClaims()` calls the network on every request (DEC-036) and the proxy's optimistic check slows.
3. **`supabase db push`** — the owner's explicit go; the one step that changes the production schema.
   `select count(*) from registrations` before and after, through `supabase db query --linked`.
4. **Hosted Auth settings:** JWT expiry **900 s**; **Custom Access Token hook** →
   `public.custom_access_token_hook` (re-created by `0069`: it reads `impersonation_sessions` for
   `supabase_auth_admin` — the three grants of `0006` plus that select); **Before User Created hook** →
   `public.before_user_created_hook`; Google provider **on** with the OAuth client below; redirect
   allow-list: `https://kareem.pp.sa/api/auth/callback` and the Vercel preview pattern; Site URL
   `https://kareem.pp.sa`. **The hook is the single point of failure for sign-in** — step 8 verifies it
   before anything else.
5. **Google OAuth client** (Google Cloud console, the owner's account): authorised redirect URI
   `https://qnwbgzsgkftqaixzuhdo.supabase.co/auth/v1/callback`; the client ID and secret go into the
   Supabase provider settings — never into the repo. **Calendar scopes** on the same client for M3's sync
   (`src/app/api/calendar/oauth.ts`): `GOOGLE_CALENDAR_CLIENT_ID` / `GOOGLE_CALENDAR_CLIENT_SECRET` on
   Vercel for the callback exchange.
6. **Vercel:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Production and
   Preview; the hosted URL and the **publishable** key), `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (stable
   across deploys — `04` §9.2), `SITE_URL`, `FORM_TOKEN_SECRET` (already set for the frozen form),
   `SENTRY_DSN` (optional until observability is wired), the two calendar variables above. Redeploy.
   **Never `SUPABASE_SERVICE_ROLE_KEY` on Vercel** (invariant 7).
7. **The worker host** (OQ-027, decided at Launch): one container from `worker/Dockerfile` (Chromium at
   `CHROME_PATH`, the runtime, the font set by SHA-256), env `DATABASE_URL` = the **session-mode**
   connection on **port 5432, never 6543** (the boot probe refuses the pooler), `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CONVERTER_URL`, `PUBLIC_ORIGIN=https://kareem.pp.sa`, `MAIL_TRANSPORT=resend`,
   `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `SENTRY_DSN`. Boot log must show `LISTEN/NOTIFY probe OK`.
   **The converter host:** one container from `converter/Dockerfile`, **no credentials** (DEC-032),
   reachable from the worker only, HTTPS (`CONVERTER_ALLOW_HTTP` unset). Render concurrency stays serial
   (DEC-051) — one `render` queue; measure queue age before raising it.
8. **First org, by one-off SQL** (`supabase db query --linked`, never a migration): `create_org()` as
   `postgres` with the owner's values below (it seeds settings and the four categories; the A27 baseline
   templates are already platform-owned from `0061`, present for every org — DEC-052); the owner signs
   in once (the Before User Created hook needs the domain on the list first), then
   `insert into platform_admins (auth_user_id)` for that user.
9. **Verify, in this order:** the first admin's Google account lands on `/ar/app` as `admin`; a second
   account on the domain lands as `member`; an account on another domain is refused at Google's return
   with the closed-door message; `/ar/app/platform` opens for the platform admin and every org table
   returns nothing to them (the console's own ★ case, run by hand); `npm run qa` against production
   stays 44/44; `/ar/verify/<a real code>` answers and `/ar/verify/<a serial>` is not found; a poster
   publishes with all twelve variants and Tier A; a certificate mails through Resend to a real address.
10. **Observability:** the Sentry DSN into Vercel and the worker; the eight `11` §3.2 alerts from
    `JOB-evaluate_alerts` routed to Sentry through the `AlertSink` (a one-line transport swap in the
    worker, the lead's); the CSP reports from a preview reviewed before any enforcement (OQ-028).
11. **The two owner checks no test stands in for:** scan both QRs on paper at print size (the poster's
    lands on the session after sign-in, the certificate's on `/verify`); open a session's ICS in Outlook
    on Windows. And the real-device pass of `13` §8.
12. **Re-measure the six budgeted screens** against production with `tests/e2e/budgets.spec.ts` pointed
    at the live domain (DEC-055 decision 5), then either amend `13` §7 or schedule the shell split.

### Owner inputs, by name
- **Google OAuth:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (Supabase dashboard only) ·
  `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` (Vercel).
- **Resend:** the account, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, the verified sending domain, the
  webhook URL `https://kareem.pp.sa/api/webhooks/resend`.
- **Sentry:** `SENTRY_DSN` (Vercel and the worker).
- **Vercel:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `SITE_URL`.
- **The worker and converter hosts:** the provider (OQ-027), `DATABASE_URL` (session mode, 5432),
  `SUPABASE_SERVICE_ROLE_KEY` (the worker's container only), `CONVERTER_URL`, `PUBLIC_ORIGIN`,
  `CHROME_PATH` is in the image.
- **The first org:** name · slug · certificate prefix (2–5 capitals) · allowed email domain(s) · the first
  admin's email · the numerals setting (`western` by default).
- **Approvals, each its own go:** asymmetric JWT keys · `supabase db push` · the Auth hooks and the
  Google provider · the Vercel variables and the redeploy · the worker and converter deployments ·
  the `platform_admins` insert · the Resend domain · any change to repository visibility (DEC-051 —
  the repository is public until Launch by the owner's decision, and this is the moment to decide again).
- **Decisions the plan left to Launch:** render concurrency (DEC-051, measure first) · the hosting region
  (OQ-026, recorded as a fact) · the check-in budget (DEC-055) · `impersonation_sessions` browsing the
  org's screens (DEC-055 option A, the next wave).

## PR C — the M1-era checklist (superseded by the Launch handoff above; kept for the history of steps 1–9)

Run in this order, on `main`, **on launch day** (`14` Launch). Nothing here has been done, and nothing here is started before then. Migrations to rehearse: everything from `0003` onward.

1. **Rehearsal (no production change):** `supabase db dump --linked --schema-only` → apply to a
   fresh local database → apply `0003`–`0007` on top → `npm run test:rls` against it → delete the
   dump. Migrations are `0003`–`0008`. This is the "tested against production-shaped data" of invariant 3.
2. **Hosted project, JWT signing:** enable **asymmetric JWT signing keys** (Dashboard → Auth → JWT
   keys). Without them `getClaims()` falls back to a network call on every request (DEC-036).
3. **`supabase db push`** (owner's explicit go; the only step that changes the production schema).
   `registrations` is not referenced by any migration; verify with
   `supabase db query --linked "select count(*) from registrations"` before and after.
4. **Hosted Auth settings** (Dashboard → Auth): JWT expiry **900 s**; enable the **Custom Access
   Token hook** → `public.custom_access_token_hook`; enable the **Before User Created hook** →
   `public.before_user_created_hook`; Google provider **on** with the OAuth client below; add the
   callback URL `https://kareem.pp.sa/api/auth/callback` (and the Vercel preview pattern) to the
   redirect allow-list; Site URL `https://kareem.pp.sa`.
5. **Google OAuth client** (Google Cloud console, owner's account): authorised redirect URI
   `https://qnwbgzsgkftqaixzuhdo.supabase.co/auth/v1/callback`; paste client ID and secret into the
   Supabase provider settings — never into the repo or Vercel.
6. **Vercel:** add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for
   Production and Preview (the hosted project's URL and **publishable** key), then redeploy.
7. **First org, by one-off SQL** (`supabase db query --linked`, never a migration): insert the
   owner's auth user into `platform_admins` after their first sign-in attempt creates it — note
   the Before User Created hook refuses a domain on no list, so **create the org first with the
   owner's domain**, sign in, then insert the `platform_admins` row; or insert the org through
   `create_org()` as `postgres`. Values needed: name, slug, certificate prefix, allowed domain(s),
   first admin email. `create_org()` seeds settings and the four categories.
8. **Verify:** sign in with the first admin's Google account → lands on `/ar/app` as `admin`; a
   second account on the domain lands as `member`; an account on another domain is refused at
   Google's return with the closed-door message; `npm run qa` against production stays 44/44.
9. **Observe the CSP reports** from a preview deployment before any enforcement (OQ-028).

**CI on the final commits, read with `gh` after the owner re-authenticated `ebnmajed`:** PR #4
(`m1/tenancy` @ `91a3787`) and PR #5 (`m1/app` @ `a8da01d`) each pass all twelve checks — RLS
policies, build, converter image, end to end, frozen routes, plan gates, shaping parity, types
and lint, unit tests, worker probe, Vercel, Vercel preview comments. **`gh` gotcha for the next
session:** another Claude session on this machine re-authenticates `gh` as `devyaden`, which
invalidated the stored `ebnmajed` credential mid-session (401). `gh auth switch --user ebnmajed`
is not enough then; `gh auth login -h github.com -p https -w --skip-ssh-key` is (this gh has no
`-u` flag). Pushes use the SSH alias and are unaffected.

**Owner inputs PR C needs, by name:** `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`
(entered in the Supabase dashboard only) · the first org's **name**, **slug**, **certificate
prefix** (2–5 capitals), **allowed email domain(s)**, **first admin email** · approval to enable
asymmetric JWT keys · approval for `supabase db push` · approval for the two Vercel variables ·
approval to move the frozen files into a `(marketing)` route group (next app PR).

**Also for the owner (found in PR A, not acted on):** `anon` holds `TRUNCATE`, `REFERENCES` and
`TRIGGER` on the frozen `registrations` table from the project's old default privileges. Not
reachable through PostgREST; a `revoke` would touch the frozen table's privileges — your call.

## Waiting on the owner

**Nothing.** The owner ran DEC-037's `REVOKE` in the hosted SQL editor on 2026-09-14; verified read-only with `supabase db query --linked`: `anon` has no `truncate`, keeps `insert` only, and the 19 registrations are intact. M2 starts on local Supabase and CI.

**OQ-027 answered for wave 2 (DEC-046):** the worker and converter run as host-agnostic Docker
images locally and in CI; the production host is chosen at Launch with PR C. Nothing in wave 2
waits on it. **Owner input due at Launch, not now:** a Google OAuth client with calendar scopes
(the M3 sync runs against a stub in tests) and the Resend account.

**Open for the owner at the wave-2 plan:** approval of the ownership globs; whether `content`
runs on Opus rather than Sonnet (it holds the storage-prefix boundary, the one place isolation
depends on application correctness).

## Blockers

**None for the plan.** Every open question carries a default that is already in force, so no work
is blocked on an answer.

**One for the owner:** the three test rows above. Nothing is blocked on it, but the table is meant
to be pristine history.

**Resolved since the plan was written:**

- **DEC-021** — the owner confirmed the Realtime trade (**Option A**): browser Supabase client,
  `NEXT_PUBLIC_` variables, **RLS as the sole boundary**. Server polling is a *rejected*
  alternative, not a standing fallback. M0's spike is now implementation. The practical
  consequence for every later session: **the generated isolation sweep (`03` §8.1) is
  load-bearing** — never weaken it, never skip a table, never let it go red.
- **DEC-022** — the hardening DEC-021 exposed, and the plan had **missed**: Realtime does not
  inherit table RLS for broadcast and presence. Every channel is **private**, `realtime.messages`
  carries its own org-scoped policies, and changes broadcast **from database triggers** rather than
  via Postgres Changes. Written out as `03` §7, with six test cases in §8.2. **The isolation sweep
  does not cover this** — it walks tables, not channel topics, so Realtime needs its own tests.

**Still open, and deliberately parked by the owner:**

- **OQ-026** — hosting region and PDPL. The owner set this aside; the default (stay in
  `ap-southeast-1`) remains in force and nothing is blocked on it. Worth revisiting before real
  member data exists, since it is a configuration change now and a data migration later.

## This session — M0 steps 1, 2, 4 and 5 on `m0/foundation`

`main` was first confirmed deployable (CI green on every push through `335bde2`; the Vercel
Production deployment for it succeeded; all five frozen routes answer on the live domain). Then,
with the owner's approval of the step-1 plan ("Option A"), the branch landed in order:

| Commit | What | Proof |
|---|---|---|
| `0e969fa` | `npm run visual` — before/after diff of the frozen routes | two captures of one build: 0.000% |
| `8b1b705` | **Fonts, Option A — DEC-031.** `packages/fonts` is `ENT-fonts`; web faces are next/font's exact bytes; one merged TTF per weight for LibreOffice; `scripts/fonts/check.mjs` in CI and in the image builds | parity 0.000%; `fonts:check` OK; visual 0.000% |
| `8587a28` | **Playwright, jsdom, Testing Library.** Two Vitest projects; Playwright over `scripts/serve-stub.mjs`; the stub wiring shared in `scripts/lib/stubbed-server.mjs`; CI `e2e` job | 45 unit/component, 10 e2e |
| `78ff5a6` | **Radix + the eight glyphs.** `Direction.Provider` in the layout; `icons.tsx`; `dialog.tsx`; `ui.dialog.close` in both catalogues | QA 44/44; visual 0.000% |
| `db739a4` | **The credential-free converter — DEC-032.** `converter/`: zero-dependency Node over LibreOffice + poppler, boot guard against any credential, fonts from the manifest verified at image build; smoke test + CI `converter` job | smoke 17/17; QA 44/44 |

**Things the next session should know, none of which are in the plan:**

- **`content-visibility: auto` defeats full-page screenshots.** The first visual baseline had
  three solid-navy chapters and would have passed any diff. `visual-diff.mjs` forces the
  sections visible and refuses a capture with a skipped section or text at opacity 0.
- **IBM Plex Sans on Google Fonts is variable.** next/font emits one file for weights 400/500/600
  of the Latin face, which is why three manifest entries share a hash. Plex Sans Arabic is static:
  one file per weight, and four subsets each — the manifest keeps only Arabic and basic Latin
  (DEC-031 says why).
- **Vitest's `components` project must not carry `react-server`**, and next-intl must be inlined
  so `next/navigation` (extensionless, no `exports` map) resolves. Both are in `vitest.config.ts`
  with the reason.
- **Radix's `Direction.Provider` renders nothing**, which is why the layout could change with the
  visual diff at 0.000%. It also does not set `dir` on a dialog — only on primitives that position
  themselves — so a test asserting `dir` on the dialog is wrong, not the provider.
- **Lock file:** regenerated twice with `npm run lockfile` (CI's npm 10, in Docker). Do not
  `npm install` and commit the result.
- **`13` §1 still says Playwright/jsdom are "not installed".** Settled document; left for a DEC.

**Steps 3 and 6 were not done**, by the owner's instruction — see *Waiting on the owner*.

## Continuation — same day, owner present

1. **DEC-033** — `13` §1 says the test stack is installed; `Refs:` now sits in git's trailer
   paragraph (`1a75b0d`). CI on PR #2 stayed green.
2. **PR #2 merged** with a merge commit (`9002dbf`, owner's choice: keeps every cited SHA valid;
   main's first merge commit). Branch deleted. Vercel production deploy green; five frozen routes
   answer; CI on `main` green.
3. **Step 6 done** — see the table above. The Vercel project is now linked locally (`.vercel/`,
   gitignored; `vercel link` also appended `VERCEL_OIDC_TOKEN` to `.env.local`).
4. **Fly dropped** by the owner on cost — **DEC-034**, OQ-027, A34 superseded. Instead of
   deploying: `worker/` on `m0/worker` (**PR #3**), with the probe proven against Postgres,
   pgbouncer and Supavisor in both pooling modes, and a CI `worker` job. **The plan's probe was
   wrong** — one connection notifying itself passes through an idle transaction pooler; `04` §7.2
   and `11` §1.2 are corrected under DEC-034. The local pooler is now enabled in
   `supabase/config.toml` so the Supavisor case stays reproducible.

**GitHub account gotcha:** another Claude session on this machine switched `gh` to `devyaden`;
run `gh auth switch --user ebnmajed` before any `gh` call. Pushes use the SSH alias and are
unaffected.

## Next session should

1. **Wait for the owner to merge PR #14** (`wave-3/m6-m7` → `main`); nothing is merged by a session (DEC-041). After the merge: `git checkout main && git pull --ff-only`.
2. Be the **wave-4 lead** (`platform` M8 · `branding` M7-branding, TEAM.md §1): read this file, `CLAUDE.md`, `DECISIONS.md` DEC-048 … DEC-050, `TEAM.md` §3 and §5, and the handoff under *Handoff for the wave-4 lead* above.
3. **Before spawning anyone:** confirm the draft rows for `platform` and `branding` in TEAM.md §1 and write `.claude/agents/{platform,branding}.md`; widen `proxy.ts`'s `isPlatformPath` to the public platform routes (`/verify/[code]`); decide the render concurrency (two hashed queue names) only if a measured need appears; retake the two SCR-023/SCR-045 captures.
4. **Run the M6 demonstrable once yourself** (`scratchpad/m6-demo.sh` is the record in STATUS sync 12; the worker and converter images on the local Supabase network) before `branding` touches templates — a brand-kit change must re-render a live poster and leave a detached one stale.
5. **PR C / Launch stays untouched** (DEC-039). Local Supabase and CI only. Launch inputs are listed in the handoff.
6. `.next` on disk is the wave-final configured build; `npm run db:reset` (with the reset lock, no teammate running) before any RLS run; `npm run test:e2e:unconfigured` last, and rebuild after it.
7. Update this file before finishing.
