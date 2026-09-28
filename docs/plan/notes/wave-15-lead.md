You are the **wave-15 lead** for كريم معرفة, and this wave begins a **programme, not a one-off**: the
visual direction in `docs/design/` — «ساحة اللعب», the playground arena. Wave 14 is merged
(PR #31, `d29b362`), production is at `0159`, the worker is current, CI is restored and green, and
there are **no open PRs and no wave map in force**. Migrations start at **`0160`**; the next decision
is **`DEC-183`**; the next free ids are **`REQ-UIX-028`** and **`STORY-UIX-019`**.

**Read in this order.** `docs/design/README.md`, then `00-direction.md`, `01-tokens.md` with
`tokens.css`, `02-typography.md`, `03-motion.md`, `04-components.md`, `05-stories.md`,
`06-decisions-proposed.md`, `07-tasks.md`. Then open `docs/design/prototypes/motion-story.html` and
`stories.html` and read their CSS and JS as **behaviour references** — sequence, durations, the
transform-only rule, RTL tap zones, `dir="ltr"` code boxes, reduced-motion fallbacks. **They are never
code to paste; a prototype class name never appears in `src/`.** Then `docs/plan/STATUS.md`'s START
HERE and the wave-14 block, `DECISIONS.md` **`DEC-100`** in full and `DEC-176` … `DEC-182`,
`CLAUDE.md`, `TEAM.md` §1–§3.

---

## ★★ The decision gate is CLOSED. The owner answered on 2026-09-28. Do not re-open it.

`06-decisions-proposed.md` asks the owner to accept, amend or refuse fifteen entries and
`HANDOFF-PROMPT.md` makes that the first gate. **It has been run.** The rulings:

| | |
|---|---|
| **Everything is in scope** | stories, the timeline's recap/achievement/announcement items, the weekly leaderboard, proposal voting — **all four**, plus team colours as the base |
| ★★ **Motion: the playground wins** | `DEC-NEXT-1` accepted. **This REVERSES `DEC-100`**, which the same owner approved on 2026-09-15 |
| **Marketing** | `DEC-NEXT-5` **option A** — the public site is re-skinned to the playground **at M13**, not before |
| **Sequencing** | this programme **replaces** the pending member-path UI/UX wave; its prose test folds in as a gate (below) |

★ **Log all of it as `DEC-183` before anyone is spawned**, one entry that accepts the fifteen with the
owner's four rulings named, and one line per `DEC-NEXT-*` saying accepted, amended or deferred.
**Two entries are still [OWNER TO CHOOSE] and stay deferred:** `DEC-NEXT-15` (the desktop shell)
waits for the screen designs, and `DEC-NEXT-8`'s leagues stay deferred as `06` already says.

★★ **`DEC-100` is the one to read before you write `DEC-183`.** It is long, it was owner-approved,
and it says in its own words: *«cinema, not decoration … never UI-library defaults: no bounce, no
elastic, no hover scale-ups, **no confetti**»*, with one metaphor — knowledge as a dot of light that
joins a network — and nine moments in three tiers. The playground direction adds a confetti burst and
a sticker overshoot, and cuts nine moments to five. **The owner has knowingly reversed it.** Write
`DEC-183` so a reader in six months understands that this was a reversal and not an oversight, and
say what survives: `REQ-UIX-020` is unchanged (transform, opacity and filter only, 60 fps, no
`will-change` left on), failure never animates, hover scaling stays forbidden, and no motion library
is added. ★ **`DEC-100`'s motion system was never built**, so nothing is being thrown away — but
`globals.css`'s twelve existing keyframes are used by three marketing files, and those stay until M13.

**The handoff prompt says «you never edit `DECISIONS.md`; you propose, I write». That is not how this
repository works and it is superseded** — every wave lead since `DEC-040` has written entries, the log
is append-only, and corrections are new entries. Write `DEC-183` yourself.

## What is measured about `docs/design/` — it is unusually accurate, and that changes your risk

| Claim | Checked |
|---|---|
| «the 37 house primitives» | **exactly 37** `.tsx` files in `src/components/ui/` |
| `scripts/visual-diff.mjs` drives Playwright | **exists** |
| `REQ-INT-006` Western numerals, no setting | **live**, `01-prd.md:2320` |
| the gallery is behind `KAREEM_GALLERY=1` | **true**, `proxy.ts:52` 404s it otherwise |
| fonts enter by SHA-256 through `ENT-fonts` | **true** — `packages/fonts/` holds 33 manifest entries as content-addressed `.ttf`/`.woff2` |
| the subsetter must keep `rlig`, `mark`, `mkmk` | **correct, and it is the trap `CLAUDE.md` calls «the likeliest silent Arabic killer»** |

★ **Treat the folder as a specification, not as a proposal to re-derive.** Where it conflicts with
`docs/plan/`, `DECISIONS.md` still wins and you stop and ask — but it has already been checked against
the tree once, and re-measuring what is in that table is waste.

## ★ The one thing that can stall this wave, and it is not code

**The six toy-gloss objects — coin, cup, flame, ticket, star badge, rocket — do not exist as files.**
`docs/design/` ships fourteen files and no images. `DEC-NEXT-2` makes them an allowed poster layer and
`00-direction.md` makes them a pillar of the visual language, but nothing has rendered them.
**Raise this with the owner in your first message**, before you plan the sticker or poster rows:
who produces them, at what sizes, and in what format. ★ **Invariant 11 forbids SVG anywhere**, so they
are raster — PNG or WebP through the `design-assets` path — and they must survive a dark and a light
ground. Until they exist, `sticker` and the poster layer are specified and unbuildable; everything
else in this wave is not blocked.

## STEP 0 — a gate, not a step

`DEC-183`, the **wave-15 ownership map** into `CLAUDE.md` and **all ten `.claude/agents/*.md`**, the
new `REQ-UIX-028`+ and `STORY-UIX-019`+ rows in `01-prd.md` and `15-backlog.md` for every new
primitive and the new features, and the checklist into `STATUS.md`. `DEC-085`: *ownership lives in
those never-touch paragraphs or it does not exist.* ★ **Also add the pointer `README.md` asks for**
to `CLAUDE.md`: visual direction lives in `docs/design/`, read it before any UI work, and
`DECISIONS.md` wins over it. Cut `wave-15/tokens-and-primitives` from `main`; draft PR at the first
push.

## This wave — the foundation only, and nothing visible changes

`07-tasks.md`'s wave 1, plus team colours because every primitive depends on them.

1. **Merge `tokens.css` into `globals.css`** after the existing `@theme` block, with the semantic
   layer on the existing theme switch. ★ **`@theme inline` stays load-bearing** — a plain `@theme`
   resolves `var(--fg-heading)` at `:root` once and freezes light values, breaking `.theme-dark`.
   **Nothing here removes an existing token**; migration is per primitive.
2. **Materialise Baloo Bhaijaan 2** by `02-typography.md`'s five steps: the Google Fonts path into our
   storage, the SHA-256 into `ENT-fonts`, the shaping-parity goldens, a subsetter that keeps `rlig`,
   `mark` and `mkmk`, `@font-face` with `font-display: swap` and a `size-adjust` metric-matched
   fallback against IBM Plex Sans Arabic, then `--font-display`. **No production font loads from a
   CDN.** ★ Invariant 12 — one font set, identical by SHA-256 across editor, worker Chromium and
   worker poppler — and the CI check that fails a font present in one place and absent in another.
3. **Migrate the primitives in `07`'s order**, one commit each with a 390 px gallery screenshot and a
   desktop one: `button` → `chip` → `status-badge` → `avatar` → `card` → the form set → `sheet` →
   `tabs` → `toast` → `skeleton` → the console primitives (tokens only).
4. **Ten new primitives**: `sticker`, `poster`, `session-cta`, `reaction-bar`, `code-input`,
   `progress-bar`, `rank-row`, `race-bar`, `level-card`, `story-ring`. Each with a jsdom test, an RTL
   check and a gallery entry (`REQ-UIX-001`).
5. **New glyphs by hand in `icons.tsx`** — `04-components.md` lists them. **No icon library, ever.**
6. **Team colours** (`DEC-NEXT-4`): `companies.team_color` as an additive nullable column in `0160`,
   seeded with `01-tokens.md`'s mapping, editable on `SCR-048`. It renders as a CSS variable on the
   element. ★ **The company is the ring, never the avatar fill** (`REQ-PRF-009`); avatar tints stay
   keyed to the member id, which wave 14 just relied on.

## ★★ Three gates that decide whether this wave is correct

1. ★ **The frozen public routes do not move.** `qa:contract` green at every commit, `qa:appearance`
   and `npm run visual` **unchanged — not re-baselined**. Marketing is re-skinned at **M13**
   (`DEC-NEXT-5` A), not now. A token merge that moves the landing page is not additive and you have
   broken something. This is the criterion wave 14's wordmark row passed on and it works.
2. ★★ **The `(dev)` gallery IS in the visual baseline, and ten new primitives WILL move it.**
   Wave 14 recorded `ar_ui` growing 6 px from one badge fix and deliberately did not re-baseline.
   **This wave must re-baseline it, on purpose, in the same commit as the primitives that moved it**,
   and say so in the row. Do not discover this at the gate.
3. **`ui-lint --strict` has no allowlist and never gains one** — 291 files today. A new primitive
   complies from birth.

## The programme after this wave, so you know where you sit

| | |
|---|---|
| **this wave** | tokens, the display face, the 37 primitives migrated, 10 new ones, team colours |
| next | the five orchestrated moments — `lib/ui/confetti.ts`, `useCountUp`, once-per-occurrence keying, static states reviewed at 390 px beside the animated ones |
| then | **stories** — `story_views`, the `story` derivative, `dal/stories.ts` with its RLS cases, the ring row, the viewer |
| then | the timeline's recap/achievement/announcement items (`feed_announcements`), proposal voting, the weekly leaderboard |
| then | **the screens**, per `SCR-*`, M10 member first — and `07` §Wave 4 **waits for per-screen designs** the owner delivers as `docs/design/screens/<SCR-id>.md` |
| M13 | the public site re-skinned (`DEC-NEXT-5` A) |

★ **The member-path prose test folds into the screens waves, not into this one.** The owner's
standing measure: **can a member complete reserve → check in → rate → certificate with every
explanatory paragraph deleted from the screen?** `STATUS.md`'s *Screens whose meaning depends on a
paragraph* has 42 rows — **39 of them staff screens, and none on the member path** — so the member
path has no inventory and the test is how it gets one. Record that the redesign supersedes the
separate prose wave.

## Not this wave — name each in every agent file's never-touch list

The five moments · stories · feed items · proposal voting · the weekly leaderboard · any screen
redesign · **anything under `(marketing)/**`** (M13) · the desktop shell (`DEC-NEXT-15`, deferred) ·
leagues (deferred) · the certificate look, which keeps its formal Naskh families — **the playground
stops at the certificate's edge** · the designer's document model and export pipeline · the
storage-predicate gate carried from wave 14 (three hits, no test — it stays carried).

## Definition of done

The usual — `tsc`, `lint` zero errors (**grep for `problems`**), `npm test`, `test:rls`, e2e,
`qa:contract` **and** `qa:appearance`, `visual`, `parity`, `policy-diff`, `trace`,
**`ui-lint --strict` with no allowlist**. Arabic authored in `messages/ar/` first, `<bdi>` on every
interpolated value, Western numerals only, logical properties only.

**And four this wave adds:**

1. ★★ **Nothing visible changes.** The token merge and the font land with the app looking as it does
   today, because migration is per primitive. Prove it: the frozen routes at **0.000%** and a 390 px
   capture of `/app` before and after the token commit, opened by you.
2. ★ **The gallery re-baselined deliberately**, in the same commit as the primitives that moved it,
   with the row saying which ones did.
3. ★ **The display face renders Arabic correctly after subsetting** — lam-alef and tashkeel on a real
   render, not a Latin smoke test. `rlig`/`mark`/`mkmk` dropped by a subsetter passes every Latin
   test and breaks Arabic silently; `CLAUDE.md` names this as one of the five things most likely to go
   wrong.
4. ★ **Every new primitive at 390 px in Arabic beside its prototype counterpart**, opened by you.
   Pixel identity is not the bar; the same hierarchy, weight, spacing and motion is.

## How it ends

`STATUS.md` updated, PR open, **the owner merges** — and because this wave carries a migration, the
owner rehearses `0160` against a production schema dump, **pushes, then merges**, then reconnects
Railway. ★ Railway's push trigger has needed a manual `railway service source connect` after **nine**
consecutive merges; the durable fix is the dashboard's Settings → Source. ★ And watch the trap wave 14
found: Railway reports `● Online · Building` and `● Online · Deploying` before plain `● Online`, so
the first word says «online» while the old image still serves.
