You are the **wave-11 lead** for كريم معرفة, and this is **M13 — the last milestone of the design
milestone**. Wave 10 is merged (PR #27, `b75eb45`); `0123`–`0142` are live on production, the worker
is current, and **every route in the app is on the M9 design system**.

★★ **This is the only wave that unfreezes the live public contract.** Since M0, `/`, `/ar`, `/en`,
`/ar/register` and `/og.png` have been guarded by `npm run qa` at **44/44** and `npm run visual` at
**0.000 %**, and every wave has treated them as untouchable. M13 re-cuts that contract deliberately.
**For the first time those two gates stop being a safety net and become something you re-baseline on
purpose** — which makes this the most delicate wave, not the easiest, despite being the last.

**Read in this order.** `docs/plan/STATUS.md`'s START HERE and the wave-10 record. Then
`16-ui-redesign.md` **§14 in full** — the marketing rebuild is specified there and nowhere else — and
§15's M13 table. Then `DECISIONS.md` `DEC-110` … `DEC-166`, `CLAUDE.md`, `TEAM.md` §1–§3.
`REQ-UIX-025`, `REQ-NFR-007`, `REQ-NFR-008`, `REQ-NFR-019`, and `STORY-UIX-015`.

## STEP 0 — a gate, not a step

The wave-11 ownership map into `CLAUDE.md` and **all ten `.claude/agents/*.md`**, and the checklist
into `STATUS.md`. `DEC-085`. Cut `wave-11/m13` from `main`; draft PR at the first push.

★ **Before anything else, capture the baseline.** `npm run visual capture pre-m13` from `main`,
**before** the branch has a single commit on it. Every later comparison is against that. Wave 6
learned you can take a `main`-accurate baseline without switching branches; here you have the
cleaner option, so use it.

## What is actually in front of you — measured, not estimated

| | |
|---|---|
| The frozen surface | **344 lines** across `(marketing)/`, rendering **13 components**: `chapter` · `header` · `footer` · `wordmark` · `intro-sting` · `network-bg` · `network-gl` · `ornaments` · `mobile-cta` · `language-toggle` · `registration-form` · `form-token` · `ui` |
| Arabic-Indic glyphs in it | **11** — three in `(marketing)/page.tsx:16`, **eight in `chapter.tsx:5`** (`["٠١","٠٢","٠٣","٠٤"]`). `DEC-124` has waited for this wave since 2026-09-16 |
| `qa` | **45 checks** — §15 asks for the split into contract and appearance |
| `visual` | **41 baseline pairs** |
| ★ `ui-lint` allowlist | **27 files, 65 violations** — and it must be **empty** when the gate flips to `--strict` |

★★ **That last row is the number nobody has counted.** `DEC-087` says the allowlist "may only shrink"
and is "empty by M13". Only **one** of those 27 files is in the frozen set
(`registration-form.tsx`, 5). The other 26 are admin, tasks, designer and viewer files — **so most
of this wave's `ui-lint` work is not marketing work at all.** The worst are
`tasks/create-form.tsx` (**14**), `tasks/task-item.tsx` (6), `viewer/page-viewer.tsx` (5),
`admin/rtl-datetime-picker.tsx` (5). Size that before you plan the wave, not after.

## The wave

| | |
|---|---|
| **lead** | `qa.mjs` split into **contract** and **appearance** — ★ **do this first**: the behavioural two-thirds must never stop being blocking, and the appearance third is rewritten in the same commit as the design it describes. Then the visual re-baseline, the new `og.png`, the gates, the PR |
| **the marketing rebuild** | `16` §14. The landing page on the M9 system, in Arabic, RTL, at 390 px. ★ **`REQ-UIX-025` — «تسجيل الدخول», persistent and visible on every page, phone and desktop**, distinct from «سجّل اهتمامك» and never replacing it |
| **the register form** | re-presented, **behaviour byte-identical**. `registrations` is never dropped, altered or read by platform code (invariant 2, `DEC-002`) — it holds real pre-launch signups, **20 of them now**, one arrived after Launch |
| **`REQ-NFR-007`** | the accessibility pass over **every** screen, WCAG 2.2 AA — and the two canvas contrast answers the owner settled: **the app's passing tokens, not the canvas values** (browse tag-chip counts, the 13 px caption) |
| **`REQ-NFR-008`** | the performance pass against `13` §7's per-screen budgets |
| **`ui-lint --strict`** | the 65 violations above, to zero |
| `templates.ts`'s string path | retired — wave 10 gave every message key a block template, so this can finally close |

## The invariants that do not move

1. **`registrations` is never touched.** Not dropped, not altered, not read. 20 real signups.
2. **`main` stays deployable.** Every milestone ships to the live domain.
3. **Arabic is written in Arabic**, not translated into it.
4. **Numerals are Western everywhere** (`DEC-124`) — including the eleven glyphs this wave finally
   reaches.
5. **The frozen HTML changes only in the same commit as its re-baselined capture**, never before it,
   never after.

## Carried

- **Railway's push trigger has never been armed** — it has needed a manual
  `railway service source connect` after **five** consecutive merges. ★ **Record it in `STATUS` as a
  standing owner step**, and say plainly that the durable fix is the dashboard setting, not the CLI.
- `REQ-EVT-010` says a photo appears at once; the pipeline processes, then shows. Carried four waves.
  **Reconcile the requirement or the pipeline.**
- One logo asset serving both schemes (wave 10, conceded); the studio's unnamed canvas;
  `radio-group`'s missing error.

## Definition of done

The usual — `tsc`, `lint` zero errors (**grep for `problems`**), `npm test`, `test:rls`, e2e,
`parity`, `policy-diff`, `trace`, Arabic authored in `messages/ar/` first, `<bdi>` on every
interpolated value, a 390 px RTL capture at its cited path **that you opened yourself**.

**And three this milestone adds:**

1. ★ **`npm run qa`'s contract half stays green throughout** — at every commit, not just at the end.
   The appearance half moves once, with the design.
2. ★ **`ui-lint --strict` passes with an empty allowlist.** Not shrunk. Empty.
3. ★ **A visitor who has never signed in can find the way in.** Open the live-shaped build at
   390 px in Arabic, as someone who has never seen this product, and find «تسجيل الدخول» without
   being told where it is. If you have to look twice, it is not done.

## How it ends

`STATUS.md` updated, PR open, **the owner merges** — and the owner re-baselines nothing by hand; the
new captures ship in the wave. If this wave carries migrations, the owner rehearses against a
production schema dump, pushes, then merges, in that order.

★ **This is the last milestone. Say so in `STATUS`** — what is built, what was deliberately left,
and what a session opening this repo next should read first. After M13 there is no further plan;
anything more is new scope the owner decides.
