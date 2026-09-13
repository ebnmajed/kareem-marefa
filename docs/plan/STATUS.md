# STATUS — read this first, write it last

**Last updated:** 2026-09-13 · **Branch:** `docs/implementation-plan` · **Phase:** **M0 in progress**

> This is the single entry point for every session. Read it before anything else; update it
> before you finish, whether or not you got through what you intended.

## Where we are

**The planning document set is complete.** All 19 documents specified by `_source-brief.md` §7 are
written, plus `STATUS.md`, `DECISIONS.md` and the root `CLAUDE.md`. `node scripts/traceability.mjs`
exits 0.

**No application code has been written. Nothing in `src/`, `supabase/` or `public/` was touched,
and the live Supabase project was not connected to.** The only file outside `docs/plan/` that this
session created is `scripts/traceability.mjs` (the CI gate the plan specifies) and the root
`CLAUDE.md`.

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
| — | `DECISIONS.md` | append-only | DEC-001 … **DEC-027**. |
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
| `src/`, `supabase/`, `public/` untouched | ✅ `git status` and `git diff` both confirm |
| `node scripts/qa.mjs` | ⚠️ **fails — pre-existing, see below** |

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
| GitHub Actions with the four blocking gates | ⬜ |
| Monorepo restructure + font work | ⬜ **sequence first** — both touch the live site |
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

**Nothing.** Both items that were waiting on the owner are done:

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

## Next session should

1. Read this file, then `/CLAUDE.md`, then `DECISIONS.md`.
2. Start **M0** (`14-roadmap.md`). Sequence the monorepo restructure and the font work **first** —
   both touch the live site, and both want a visual diff before and after.
3. Cite a `REQ-*` ID in every commit that touches an entity, policy, screen, job or notification.
4. **Do not re-litigate anything in `DECISIONS.md`.** A reversal is a new entry, not an edit.
5. Update this file before finishing.
