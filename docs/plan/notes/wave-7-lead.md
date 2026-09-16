You are the **wave-7 lead** for كريم معرفة. Wave 6 is merged (PR #23, `5ef56ae`). Fourteen routes
are on the design system and about forty-three are not.

**Read in this order.** `docs/plan/STATUS.md` — the **START HERE** block, then the wave-6 record and
its **«Wave 7 — the remainder»** section, which is your scope list and was written by the lead who
just finished. Then `DECISIONS.md` **`DEC-110` … `DEC-135`** in full. Then `CLAUDE.md`,
`TEAM.md` §1–§3, and `16-ui-redesign.md` (§15 and §16 are superseded on *sequencing* only —
`DEC-110`). The canvas is a **reference, not a specification**: `DEC-114`, `DEC-122`, `DEC-123` and
`DEC-124` catalogue five classes of error in it.

**Where adoption stands on merged `main`** (`node scripts/ui-reach.mjs`):
`(auth)` 3/3 · `/app` 1/1 · `app/sessions` 4/6 · `app/admin` **6/24** · `app/me` **0/7** ·
`app/platform` **0/7**.

## STEP 0 — a gate, not a step

No teammate spawns before this lands: the **wave-7 ownership map** into `CLAUDE.md` and **all ten
`.claude/agents/*.md`** (they are wave-6 shaped), and the **route checklist into `STATUS.md` with
every route named**. `DEC-085`: *ownership lives in those never-touch paragraphs or it does not
exist.* Cut `wave-7/screens` from `main`; draft PR at the first push.

★ **Promote `console` to `opus`** in its agent file. It has been the long pole in three of six waves
and has nineteen admin routes and the IA regroup ahead of it.

## The wave — about eighteen routes, four teammates

| | |
|---|---|
| **lead** | the gates, migrations, promotion, the PR; the owner decision below; `ui/splash`'s LCP measurement |
| **`checkin`** | `app/sessions/[id]/{check-in,host}` **and** the manual check-in switch with walk-ins as a publishing setting (`DEC-113`, `DEC-116`, `DEC-117`, `DEC-118`; `REQ-CHK-015`/`016`/`017`) |
| **`sessions`** | `app/propose/**` (the largest form in the product), `app/sessions/[id]/rate`, `s/[id]` (how members actually arrive), `app/members/[id]`, `app/leaderboards` |
| **`content`** | `app/me/**` — all seven routes |
| **`console`** | the admin shell's **14-group IA** (`16` §6.7 — the rail kept its nineteen flat items in wave 6, sync 1 ruling) plus **six admin routes you name in `STATUS` before spawning it**. Not all nineteen |

★ **`checkin`'s screens and its switch travel together.** They are the same surface, and wave 6
proved that splitting a surface from its feature means rebuilding it twice. Its hard half is the
**reversal**: `points_ledger` is append-only with `service_role` revoked (invariant 9), so removing
an attendance record cannot delete the award — it needs a compensating entry with its own
idempotency key — and an issued certificate has a gapless serial and is **revoked**, never
un-issued.

## Not this wave — name each in every agent file's never-touch list

Multi-day sessions (`DEC-119` … `DEC-121`) · gradient posters and the `canvasRaise` token
(`DEC-127`) · the certificate library (`DEC-128`) · the survey · `app/platform` · `verify/[code]` ·
`legal/**` · **anything under `src/app/[locale]/(marketing)/` and the components it renders**,
frozen until M13 — `DEC-126`'s «تسجيل الدخول» lands there, not here.

## ★ One decision is the owner's — ask before building on it

**`DEC-135`'s real fix.** Either apply `sessions`' one-line `react-dom` change to
`pingSuspendedRoot` through `patch-package` (a new dependency; regenerate the lockfile through
Docker; verified 16/16 at ~105 ms), or wait for a React/Next release that carries it. **If it is
patched, delete `ui/pending-nudge` and every caller together, and report the bug upstream.** Until
then the nudge stays and every new pending control adopts it.

## Carry these — cheap, and already diagnosed

- `console.spec`'s «untouched route» capture is named `-390` but runs at Pixel 7's **412 px** (its
  test sets no viewport). Give it `390 × 844` like every other review capture.
- The photo tile's takedown label «احذف الصور التي أظهر فيها» wraps under a half-width tile.
- `REQ-EVT-010` says a photo appears at once; the shipped pipeline processes, then shows.
  **Reconcile the requirement or the pipeline** — do not leave them disagreeing.
- **Resolve `global-error` by test, not by doc.** Throw in `[locale]/layout.tsx` on a production
  build and see whether ours renders or Next's English default does. The doc says "root app
  directory, even with i18n", but this repo has **no `app/layout.tsx`**, so `[locale]/layout.tsx`
  *is* the root layout and our file is its sibling — which is the condition Next actually requires.
  The build contains both. If ours does not render, move it to `src/app/global-error.tsx`.

## ★ The capture lesson from wave 6, which cost it an hour

Captures taken in a **verification worktree** do not land at the path `STATUS` cites. `.qa-shots/`
is **gitignored**, so nothing downstream can check a capture — **the row text is the only artefact
anyone can trust.** Every cited capture must exist at its cited path, taken from the build the row
claims, and each row must say which spec regenerates it.

## Definition of done

The usual — `tsc` clean, `lint` zero errors (**grep for `problems`**; the "N fixable" line reads as
green and hid nine errors for most of wave 5), `npm test`, `npm run test:rls`, e2e, Arabic authored
in `messages/ar/` first with all six ICU plural forms and `<bdi>` on every interpolated value.

Plus: **no route closes while it imports zero `ui/` primitives**, and **no row closes without a
390 px RTL capture at its cited path that you opened yourself.** Land work in units — a shared index
has cost this repo commits twice.

`npm run qa` stays **44/44** and `npm run visual` **0.000%**. Teammates never write
`supabase/migrations/`. Only the lead runs `db reset`, `build`, `qa`, `visual`, and only the lead
switches branches. Run `gh auth switch --user ebnmajed` before any `gh` call.

## How it ends

`STATUS.md` updated, PR open, **the owner merges**. Do not start wave 8.
