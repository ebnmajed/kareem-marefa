# STATUS — read this first, write it last

**Last updated:** 2026-09-13 · **Branch:** `main` · **Phase:** planning **complete** — implementation
has not started

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
| — | `DECISIONS.md` | append-only | DEC-001 … **DEC-022**. |
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

## Known issue found during verification — `scripts/qa.mjs` is stale

**`scripts/qa.mjs` does not currently pass on `main`, and has not since commit `e748642`.**

That commit — *"Replace WhatsApp invite link with native share sheet"* — removed the `wa.me` link
from `src/components/registration-form.tsx`, but the QA script still asserts on it:

```js
// scripts/qa.mjs:142 — asserts an element that no longer exists
page.$eval('[role="status"] a[href^="https://wa.me"]', …)
```

Everything up to that assertion passes; the script then throws and never reaches the checks after
it. There is also a hard-coded screenshot path pointing at an expired session's scratchpad
directory (`scripts/qa.mjs:7`), which throws earlier unless that directory happens to exist.

**This was not caused by this session** — `src/` and `supabase/` are untouched (`git diff` is
empty). It was found *because* the plan makes `scripts/qa.mjs` a **blocking CI gate** guarding the
frozen public contract (`REQ-NFR-019`, `13` §9.1), and a gate that fails on `main` cannot be turned
on until it is fixed.

**It was deliberately not fixed here.** This session produces documents; changing the QA script is
code, and it should be a deliberate change with its own commit. **It is the first task in M0**
(`14-roadmap.md`), where it blocks turning the `qa` gate on.

**The fix is small:** update the assertion to the native-share affordance the form actually renders,
and make the screenshot directory relative or configurable.

## Blockers

**None for the plan.** Every open question carries a default that is already in force, so no work
is blocked on an answer.

**One for M0:** the `qa` CI gate cannot be turned on until `scripts/qa.mjs` is fixed (above).

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
