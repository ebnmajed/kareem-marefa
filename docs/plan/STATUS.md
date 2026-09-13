# STATUS — read this first, write it last

**Last updated:** 2026-09-13 · **Branch:** `m0/foundation` @ `0e969fa` (from `main` @ `335bde2`) · **Phase:** **M0 in progress — waiting on the owner's approval of the step-1 plan**

> This is the single entry point for every session. Read it before anything else; update it
> before you finish, whether or not you got through what you intended.

## Where we are

**The planning document set is complete.** All 19 documents specified by `_source-brief.md` §7 are
written, plus `STATUS.md`, `DECISIONS.md` and the root `CLAUDE.md`. `node scripts/traceability.mjs`
exits 0.

**No application code has been written. Nothing in `src/` or `supabase/` was touched, and the live
Supabase project was not connected to.** Outside `docs/plan/` the repo has gained only tooling and
static assets: `scripts/traceability.mjs` (the CI gate the plan specifies), the root `CLAUDE.md`,
the `.claude/` configuration (DEC-030), `.worktreeinclude`, and the `public/` art described below.

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
| — | `DECISIONS.md` | append-only | DEC-001 … **DEC-030**. |
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
| 13 | `13-testing-quality.md` | `settled` | RLS plan, parity suite, budgets, CI. |
| 14 | `14-roadmap.md` | `settled` | M0–M8. No phase-2 bucket. |
| 15 | `15-backlog.md` | `settled` | **112 stories**, every one citing `REQ-*`. |
| — | `ASSUMPTIONS.md` | `settled` | **A1–A40**, each with a status. |
| — | `OPEN-QUESTIONS.md` | `settled` | **26**, each with a default in force. |
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
| `npx vitest run` | ✅ **30/30 pass**, unchanged from session start |
| `npm run build` | ✅ builds clean, unchanged from session start |
| `src/`, `supabase/` untouched | ✅ `git status` and `git diff` both confirm |
| `public/` | ⚠️ **ten static assets added** in `3d43108` — see above; invariant 11 unaffected |
| `npm run qa` | ✅ **44/44 pass** — re-run 2026-09-13 on `main` |

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
| Playwright, jsdom, `@testing-library` | ⬜ |
| GitHub Actions with the four blocking gates | ✅ done (DEC-028) — 7 jobs; `policy-diff` written and self-tested |
| Monorepo restructure | ✅ done (DEC-029) — the app stays at the root; nothing moves |
| **Font work** (`REQ-DSG-016`, `REQ-INT-009`) | ⬜ **plan presented, awaiting owner approval** — see *This session* |
| Visual diff of the frozen routes (`npm run visual`) | ✅ done — baseline captured at `.qa-shots/visual/m0-before`, deterministic at 0.000% |
| **Shaping-parity harness (Tiers A and B)** | ✅ done (DEC-024) — `npm run parity`, 7 cases, green, and proven able to fail |
| graphile-worker on Fly + LISTEN/NOTIFY probe | ⬜ |
| Credential-free converter app | ⬜ |
| Radix + the ~8 inline SVGs | ⬜ |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | ⬜ |

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

## Waiting on the owner

**One thing: approval of the M0 step-1 plan** (restructure + font work), presented at the end of
the 2026-09-13 session and summarised under *This session* below. The owner asked that no file be
moved before approval. Steps 2–6 of M0 are sequenced after it and have not been started.

Both earlier items are done:

- ~~Install Docker~~ — it was already installed (DEC-026); an earlier check conflated "daemon not
  running" with "not installed".
- ~~`supabase login`~~ — done, as **Peninsula Pictures**. The CLI now sees `Kareem-marefa`, which is
  what allowed the row cleanup above.

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

## This session — `main` verified deployable; M0 opened on `m0/foundation`

**1. `main` is confirmed deployable.** The unverified item the previous session left behind is
closed. Checked with `gh` and the GitHub deployments API on 2026-09-13:

- CI: the four most recent pushes to `main` (`ef313e0` … `335bde2`) all `success`; on `335bde2`
  every one of the seven jobs passed, including `frozen routes (qa)` and `shaping parity`.
- Vercel: the Production deployment for `335bde2` reports `success`; the GitHub commit status
  from Vercel reads "Deployment has completed".
- The live domain answers: `/` → 307 to `/ar`; `/ar`, `/en`, `/ar/register` 200 `text/html`;
  `/og.png` 200 `image/png`.

**2. Branch `m0/foundation` opened** from `main` @ `335bde2`. M0 finishes on it and lands as a PR;
nothing is pushed to `main` directly.

**3. `npm run visual` — the visual diff the roadmap asks for** (`scripts/visual-diff.mjs`,
`REQ-NFR-019`). `capture <name>` snapshots `/ar`, `/en`, `/ar/register` at 390 and 1440 px against
the QA stub; `compare <a> <b>` diffs them with the parity harness's in-browser routine, threshold
0.1%. **Baseline captured at `.qa-shots/visual/m0-before`** (gitignored; two captures of the same
build differ by 0.000%, so recapturing from `main` reproduces it). One trap, fixed: a full-page
screenshot never un-skips `content-visibility: auto` sections, so the first capture had three
solid-navy chapters and would have passed any diff. The capture now forces them visible and
**refuses** a capture with a skipped section or text at opacity 0.

**4. Fact that settles the font plan:** the three Arabic `.woff2` files production serves today
hash-match the committed parity manifest (`scripts/parity/fonts/manifest.json`) exactly —
`4ed189e8…`, `0ccee444…`, `bf2b68e7…`. The manifest already *is* production's font set.

**5. The step-1 plan, as presented (awaiting approval):**

- **Restructure: nothing moves.** DEC-029 is done and not re-litigated. The rest of M0 is
  additive: `packages/fonts/` (the manifest), `worker/`, `converter/`, `tests/e2e/`,
  `tests/components/`. The only path that changes is `scripts/parity/fonts/` → `packages/fonts/`,
  with the harness and the CI `parity` job updated in the same commit. `src/`, `public/`,
  `supabase/`, `scripts/qa.mjs` and Vercel's root directory are untouched.
- **Font work, Option A (recommended):** the app keeps `next/font/google` as `10` §4.1 specifies.
  `packages/fonts/` becomes `ENT-fonts` in the repo: `manifest.json` plus `{sha256}.woff2`, the
  exact bytes `next/font` emits, so **the live site is byte-identical** and the visual diff is
  expected at 0.000%. LibreOffice cannot read woff2, so each `.ttf` is derived losslessly from
  its woff2 (fontTools) with both hashes recorded. A new `scripts/fonts-check.mjs` CI gate
  rebuilds, re-extracts and fails on any hash not in the manifest; each Docker image verifies the
  hashes it installs at build. This is the `REQ-DSG-016` gate without a live-site change.
- **Font work, Option B (not recommended for M0):** switch to `next/font/local` over a pinned
  upstream IBM Plex release with our own subsetting (keeping `rlig`/`mark`/`mkmk`). Removes Google
  from the build but changes every served font byte, needs a `DECISIONS.md` entry superseding
  `10` §4.1's "as shipping today", a non-zero visual diff to review, and an `/en` LCP measurement.

**Verification this session:** `npm run qa` 44/44 on the branch; `npm run build` clean;
`src/`, `public/`, `supabase/` untouched (`git diff main --stat` shows only `package.json` and
`scripts/visual-diff.mjs`).

**Not done, deliberately:** M0 steps 2–6 (Playwright/jsdom/testing-library; graphile-worker on Fly
with the probe; the converter; Radix + inline SVGs; `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`) — the
owner sequenced them after step 1's approval. `flyctl` is **not installed** on this machine, which
step 3 will need. `docs/implementation-plan` still exists locally and on `origin`; nothing depends
on it.

## Next session should

1. Read this file, then `/CLAUDE.md`, then `DECISIONS.md`.
2. Check out `m0/foundation`. **Read the owner's answer to the step-1 plan** above; if Option B
   was chosen, append the `DECISIONS.md` entry before touching `src/lib/fonts.ts`.
3. Do step 1, then `npm run visual capture m0-after` and `npm run visual compare m0-before
   m0-after` — recapture `m0-before` from `main` first if `.qa-shots/visual/` is gone.
4. Then steps 2–6 in the owner's order, small conventional commits, `npm run qa` green before
   each, `Refs:` trailers on every commit.
5. Open the PR to `main` when M0 is complete. Do not push to `main` directly.
6. **Do not re-litigate anything in `DECISIONS.md`.** A reversal is a new entry, not an edit.
7. Update this file before finishing.
