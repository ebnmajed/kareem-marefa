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
| **Marketing** | `DEC-NEXT-5` **option A** — the public site is re-skinned to the playground, **last**, after the app screens |
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

## ★★ The assets EXIST. `docs/design/assets/` — 102 files, and it changes this wave's shape

The owner commissioned the asset set on 2026-09-28 and it is installed. **An earlier version of this
brief told you to derive four of the six objects from a recipe. That instruction is withdrawn — do not
derive anything.** `08-assets.md` is the new document and its destination table is the instruction.

| Shipped | |
|---|---|
| **The six objects** | SVG masters at a `160 × 160` viewBox with **outlined labels**, plus PNG **and** WebP at **160 / 320 / 640 / 2048** — 1×, 2×, 4× and the poster size |
| **The display face** | Baloo Bhaijaan 2, Arabic and Latin, 700 + 800 + variable, as `.woff2`, with `fonts.css` and **`LICENSE-OFL.txt`** |
| **Brand** | the Arabic wordmark as **outlines** in three tones (ink, lime, bone), SVG + PNG + WebP at 1200 and 3000; the app mark; icons at 32/180/192/512 |
| **Glyphs** | **fifteen** new house glyphs already written as React components, `assets/icons/icons-additions.tsx` |
| **The pipeline** | `assets/scripts/generate-masters.py` and `render-assets.mjs`, so a change to a master is one command from every derived file |

★ **Follow `08-assets.md`'s destination table literally.** It is correct about this repository's own
rules and it has been checked: inline SVG belongs in `src/` (where `icons.tsx` already lives), the
**designer takes raster only** (`DEC-009`, invariant 11), the **3000 px wordmark** clears the A3 PPI
guard (`REQ-DSG-019`), and the objects' 2048 px rasters — **never the SVG** — are the optional poster
layer.

**What I verified for you, so you do not spend the wave on it:**

1. ★★ **The font keeps its Arabic shaping.** `fontTools` on
   `baloo-bhaijaan-2-arabic-800-normal.woff2` reads **`GSUB: ccmp fina init locl medi rlig`** and
   **`GPOS: kern mark mkmk`**. `rlig`, `mark` and `mkmk` are all present, so lam-alef and tashkeel
   survive. That is the trap `CLAUDE.md` calls «the likeliest silent Arabic killer» and this file
   clears it. ★ **Re-run that check after any step that re-subsets or instances the face** — the TTFs
   the worker and the parity goldens need are produced from the variable `.woff2`, and that
   conversion is where the features would be lost, not here.
2. **The six objects are visually consistent** — one specular highlight upper-left, a darker edge
   beneath for depth, a separate soft shadow. I opened `assets/objects/contact-sheet.png`. The masters
   carry `<g id="shadow">` apart from `<g id="object">` so the shadow drops on a coloured poster
   ground, exactly as `08` says.
3. **The coin master is the prototype's coin, promoted** — the same gradients (`#EDFFA3` → `#C6FF3D`
   → `#78AD12`, edge `#9CCF29` → `#4F7A0C`), the same geometry and the same `-12°` rotation, with the
   label converted from text to a path.

**Two things `08-assets.md` does not tell you:**

1. ★ **`sharp` is installed but is NOT a direct dependency.** `08` says it is «already a Next.js
   dependency»; it is in `node_modules` transitively and appears nowhere in `package.json`.
   `render-assets.mjs` therefore works on this machine today and could stop working after any
   dependency change, silently. **Either add `sharp` explicitly — and then `npm run lockfile` through
   Docker, never a plain `npm install` — or treat regeneration as a local-only tool and never put it
   in CI.** Say which you chose.
2. ★★ **The «+50» on the coin is still a requirement conflict, and it is now cheap to fix.**
   `REQ-CHK-018`, built in wave 12, computes what a member has earned **per session**, and it is not
   always 50. A baked «+50» states a number the product knows to be wrong on the one screen whose
   purpose is telling the member the truth. The label is a separate `<path>` inside `<g id="object">`,
   so **a label-free coin is one edit to the master and one run of `render-assets.mjs`** — not a
   redesign. **Recommendation: ship the coin without the numeral and let the component draw the amount
   over it** from the type scale, keeping one asset and an honest number. Settle it at sync 1, write
   it down, and keep the «+50» master for the points empty state where the number is decorative.
   ★ The ticket's «محجوز» is a fixed word and is correctly baked.

## ★ A correction to this brief, and to `docs/design/`

★★ **«M13» is already spent.** `docs/design/` says the marketing re-skin happens «at M13» and an
earlier version of this brief repeated it. **M13 closed in wave 11** — `14-roadmap.md` reads M13
(wave 11), **M14** (wave 12), **M15** (wave 13), **M16** (wave 14), so **this wave opens M17** and
the marketing re-skin gets its own number later still. The design folder was written against the
roadmap as `16-ui-redesign.md` §15 originally sequenced it and did not notice wave 11 had closed it.
**The principle survives and only the label is wrong:** the public site moves **last**, after the app
screens, and `REQ-NFR-019`'s contract holds until it does.

★ **Where `docs/design/` and `docs/plan/` disagree, `docs/plan/` wins and you say so in `DEC-183`.**
This is the first such case; the second is `tokens.css`'s colliding token names. Expect more, list
each one, and do not silently pick a side.

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
   and `npm run visual` **unchanged — not re-baselined**. Marketing is re-skinned in this
   programme's **last** wave (`DEC-NEXT-5` A), not now. A token merge that moves the landing page is not additive and you have
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
| last | the public site re-skinned (`DEC-NEXT-5` A) — ★ **its own milestone, NOT M13** |

★ **The member-path prose test folds into the screens waves, not into this one.** The owner's
standing measure: **can a member complete reserve → check in → rate → certificate with every
explanatory paragraph deleted from the screen?** `STATUS.md`'s *Screens whose meaning depends on a
paragraph* has 42 rows — **39 of them staff screens, and none on the member path** — so the member
path has no inventory and the test is how it gets one. Record that the redesign supersedes the
separate prose wave.

## Not this wave — name each in every agent file's never-touch list

The five moments · stories · feed items · proposal voting · the weekly leaderboard · any screen
redesign · **anything under `(marketing)/**`** (the last wave of this programme) · the desktop shell (`DEC-NEXT-15`, deferred) ·
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
