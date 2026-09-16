You are the **wave-8 lead** for كريم معرفة. Wave 7 is merged (PR #24, `4f19cd6`) and its migrations
are **live on production** — `supabase migration list --linked` reads `0091` on both sides.

**Read in this order.** `docs/plan/STATUS.md` — the **START HERE** block, then the wave-7 record.
Then `DECISIONS.md` **`DEC-110` … `DEC-146`** in full. Then `CLAUDE.md`, `TEAM.md` §1–§3, and
`16-ui-redesign.md` (§15 and §16 are superseded on *sequencing* only — `DEC-110`). The canvas is a
**reference, not a specification**: `DEC-114`, `DEC-122`, `DEC-123`, `DEC-124`.

**Where adoption stands** (`node scripts/ui-reach.mjs`): `(auth)` 3/3 · `/app` 1/1 ·
`app/sessions` 6/6 · `app/me` 7/7 · **`app/admin` 14/24** · **`app/platform` 0/7**.

★★ **Wave 8 finishes the redesign's route coverage.** Nineteen routes and the whole app is on the
M9 system. That is the wave's goal and it is worth saying out loud, because it is the last one that
can be measured this simply.

## STEP 0 — a gate, not a step

No teammate spawns before this lands: the **wave-8 ownership map** into `CLAUDE.md` and **all ten
`.claude/agents/*.md`** (they are wave-7 shaped), and the **route checklist into `STATUS.md` with
every route named**. `DEC-085`: *ownership lives in those never-touch paragraphs or it does not
exist.* Cut `wave-8/screens` from `main`; draft PR at the first push.

★ **The team shape changes this wave.** `designer`, `platform` and `branding` have not run since
wave 4 and own most of what is left. Their agent files are four waves stale — regenerate them with
the same care as the tracks you know.

## The wave — nineteen routes, and the two features that live in the same files

| | |
|---|---|
| **lead** | `app/admin/sessions/[id]/schedule` — ★ the owner asked for the scheduling form to be «more user friendly … intuitive to fill and quick»; the walk-in field landed in wave 7 but the form's *entry experience* did not. Plus gates, migrations, promotion, the PR, and the `org_domains` fix below |
| **`designer`** (opus) | `app/admin/designer/[documentId]` · `app/admin/templates/certificates` · `app/admin/templates/posters` · `app/admin/sessions/[id]/certificates` — **4 routes** — **and `DEC-128`**: the certificate baseline is a real library, three families in both orientations and both schemes, with `REQ-DSG-026`'s new acceptance criterion counting the seeded roster |
| **`console`** (opus) | `app/admin/{audit,exports,reminders,recognition,scoring,emails}` — **6 routes** |
| **`platform`** (opus) | **all 7 `app/platform` routes** — the super-admin console, which has never been touched by the redesign |
| **`branding`** (sonnet) | `app/admin/branding` — **and `DEC-127`**: the poster background becomes a gradient, `BRAND_COLOUR_TOKENS` gains **`canvasRaise`** (`#1d2a42` dark / `#f1f3f7` light), `model.ts` gains `{ type: 'gradient'; angle; stops[] }` |

★ **`DEC-127` and `DEC-128` are in this wave because they live in these files.** Deferring them
again would mean rebuilding the same screens twice — the lesson wave 6 paid for when it split
`checkin`'s screens from its switch.

**Two traps `DEC-127` names, both fail quietly:**
- `render.ts` and `bindings.ts` both read `background?.color`. On a gradient document that is
  `undefined`, so it renders silently on the `#ffffff` fallback and the stops are never collected
  as bindings.
- A gradient does not follow `dir`, so **the mirrored LTR variant must mirror the angle** —
  `360 − angle`, `140°` becomes `220°`.

★ **This moves the parity goldens**, which no wave since M6 has done. A golden changes only through
a lead-reviewed diff, never automatically.

## Not this wave — name each in every agent file's never-touch list

**Multi-day sessions** (`DEC-119` … `DEC-121`) — decided, unbuilt, and **wave 9's whole subject**;
it is a new entity touching four tracks and it deserves a clear field. **The survey** · **anything
under `src/app/[locale]/(marketing)/`** and the components it renders, frozen until M13 —
`DEC-126`'s «تسجيل الدخول» lands there, not here.

## Carried, and each already diagnosed

- ★ **`org_domains.domain` rejects uppercase on production and accepts it locally** — `text` vs
  `citext`. **A member whose email domain carries a capital letter cannot be provisioned on
  production but can locally**, so it is a real bug hiding behind an environment difference. It
  predates the redesign and needs its own migration **and its own rehearsal against a production
  schema dump**, the way `0082`–`0091` were.
- `REQ-EVT-010` says a photo appears at once; the shipped pipeline processes, then shows.
  **Reconcile the requirement or the pipeline.**
- The worker's startup line says «polling every 60 s»; it is 15 s (`DEC-057`).
- The populated photo-report queue has e2e coverage but no 390 px capture — take one when
  `moderation/{comments,photos}` are next touched.

## ⬜ `DEC-140` — the owner's call, and if it happens it happens FIRST

Next **16.3.5** vendors a React that carries the upstream fix (`facebook/react#36134`), so upgrading
retires `patches/next+16.2.10.patch` **and** `tests/unit/react-dom-ping-patch.test.ts` — delete them
together or the test fails on a patch that no longer applies. **Ask the owner before doing it**, and
if the answer is yes, do it as task one, alone, with `tests/e2e/reserve-probe.spec.ts` as the gate at
its own standard: **16/16 presses on a production build**, because the bug it guards is
probabilistic. A Next minor during a redesign is not a free change.

## ★ The two lessons wave 7 paid for

1. **Captures taken in a verification worktree do not land where `STATUS` cites them.** `.qa-shots/`
   is gitignored, so **the row text is the only artefact anyone downstream can check.** Every cited
   capture exists at its cited path, from the build the row names, and each row says which spec
   regenerates it.
2. **The push precedes the merge when migrations are additive.** Wave 7's `0083`–`0091` add what the
   app calls, so merging first would have deployed code onto a schema without it. Say in `STATUS`
   which order this wave needs, and why.

## Definition of done

The usual — `tsc` clean, `lint` zero errors (**grep for `problems`**), `npm test`,
`npm run test:rls`, e2e, Arabic authored in `messages/ar/` first with all six ICU plural forms and
`<bdi>` on every interpolated value. `npm run qa` **44/44**, `npm run visual` **0.000%**,
`npm run parity` green — **and the goldens reviewed by hand if `DEC-127` moved them.**

Plus: **no route closes while it imports zero `ui/` primitives**, and **no row closes without a
390 px RTL capture at its cited path that you opened yourself.**

Teammates never write `supabase/migrations/`. Only the lead runs `db reset`, `build`, `qa`,
`visual`, and only the lead switches branches. `gh auth switch --user ebnmajed` before any `gh` call.

## How it ends

`STATUS.md` updated, PR open, **the owner merges** — and if this wave carries migrations, the owner
rehearses them against a production schema dump and pushes **before** merging. Do not start wave 9.
