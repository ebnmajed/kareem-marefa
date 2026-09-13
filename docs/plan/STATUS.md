# STATUS — read this first, write it last

**Last updated:** 2026-09-13 · **Branch:** `m1/tenancy` (PR A → `main`, open) · **Phase:** **M1 — PR A (database spine) done; PR B (app side) in progress on `m1/app`; PR C not started**

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
| — | `DECISIONS.md` | append-only | DEC-001 … **DEC-035**. |
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
| 14 | `14-roadmap.md` | `settled` | M0–M8. No phase-2 bucket. |
| 15 | `15-backlog.md` | `settled` | **112 stories**, every one citing `REQ-*`. |
| — | `ASSUMPTIONS.md` | `settled` | **A1–A40**, each with a status. |
| — | `OPEN-QUESTIONS.md` | `settled` | **27**, each with a default in force. OQ-027 (worker hosting) is due at M3. |
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

## M1 — where it stands

**The owner approved the plan as presented** (three PRs, all four listed choices). **PR A is
built and green:** migrations `0003`–`0006` (`b8c52d7`), the `tests/rls` suite with 61 tests
(`a41ac8d`) passing on local Supabase and on the CI shim, `policy-diff` green, DEC-035 recording
the deltas. Its shape, so the next session does not re-derive it: three PRs — **A** the database spine (migrations `0003`–`0006`: enums and helpers;
tenancy tables with RLS, grants and the column grant on `members`; the RPCs including
`provision_member()`, `assert_fresh_admin()`, `write_audit()`; the Custom Access Token Hook that
never raises, with its three `supabase_auth_admin` grants), the `tests/rls` Vitest project driven
through `pg` with `set local role` + `request.jwt.claims` and rolled back per test, the generated
isolation sweep, a minimal `auth` shim in `scripts/ci/roles.sql` so the bare CI container can run
it, and `policy-diff` green; **B** the app side (`@supabase/ssr` clients, the DAL with
`requireSession()` narrowed on `data`, `proxy.ts` with CSP in report-only first, sign-in /
choose-org / no-access, the app shell and the profile with company); **C** the production cutover,
gated on the owner's explicit go: schema-only dump rehearsal, `supabase db push`, Google provider
and hook enabled on the hosted project, `NEXT_PUBLIC_*` on Vercel, first-org seed by one-off SQL.
Deferred out of M1: admin CRUD screens (policies and RPCs exist, UI in M2/M7 per `09`), `tags`,
`impersonation_sessions`.

**Owner inputs M1 needs:** a Google OAuth client for the hosted project; the first org's name,
slug, certificate prefix, allowed email domain(s) and first admin email; approval for the two
`NEXT_PUBLIC_` variables on Vercel; approval for `supabase db push` and the dashboard steps.

## Waiting on the owner

**Approve, amend or reject the M1 plan** (above). PR #3 is merged; M0 is closed.

**Due at M3, not now:** OQ-027 — where the worker and converter run. Both are host-agnostic;
the choice must provide a session-mode Postgres connection and either private networking to the
converter or an endpoint token on it.

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

1. Read this file, then `/CLAUDE.md`, then `DECISIONS.md` — DEC-031 … DEC-034 are new.
2. Read *M1 — where it stands* and the owner's answer to the plan. Check out `m1/tenancy`.
3. Work M1 in the approved order — the dangerous milestone; do not compress it. Every migration
   lands with its RLS, grants and tests in the same commit; local Supabase and CI first,
   production last and only with the owner's explicit go.
4. At M3, answer OQ-027 before the first reminder job needs to run unattended.
5. **Do not re-litigate anything in `DECISIONS.md`.** A reversal is a new entry, not an edit.
6. Update this file before finishing.
