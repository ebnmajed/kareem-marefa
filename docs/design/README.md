# docs/design — the visual direction for كريم معرفة

**Status:** `settled` — accepted by the owner on 2026-09-28 and recorded as **`DEC-183`** in
`docs/plan/DECISIONS.md`, with amendments. ★ **`DEC-183` §4 lists the places where this folder and the
repository disagree — seventeen at Step 0 — and in each of them `docs/plan/` wins.** Read it beside this
folder; the files below are kept as they were written.
**Serves:** `16-ui-redesign.md` (visual layer), `09-sitemap-screens.md` (every screen), `REQ-UIX-*`.
**Owns:** nothing in the id spaces. This folder cites `REQ-*`, `SCR-*`, `ENT-*` and proposes `DEC-*`;
it never defines them.

> This folder is the design brief a coding session reads **before** it touches `src/`. It is written to
> be read by Claude Code, so it names files, tokens, primitives and requirements rather than describing
> pictures. The mood board and the two prototypes on claude.ai are the human-facing versions of the
> same decisions; an agent cannot open those links, and does not need to.

## Reading order

| File | What it is | Read when |
|---|---|---|
| `00-direction.md` | The direction ("ساحة اللعب"), eight principles, the inherited non-negotiables, what changes and what does not | always, first |
| `01-tokens.md` + `tokens.css` | Colour, type, radius, motion tokens as a Tailwind v4 `@theme` block, plus the semantic layer and the light/dark mapping | before touching `globals.css` |
| `02-typography.md` | The display face, the scale, the Arabic rules, and how the font enters the manifest | before any text style |
| `03-motion.md` | The five orchestrated moments, timing tokens, reduced-motion static states, implementation patterns | before any animation |
| `04-components.md` | Deltas to the 37 house primitives and the new ones, each with its gallery, test and RTL requirements | before any component |
| `05-stories.md` | The session stories feature: frame types, triggers, sources, viewer behaviour, RLS, one schema addition | before the stories work |
| `06-decisions-proposed.md` | Draft DEC entries this direction requires. **Nothing in this folder overrides `DECISIONS.md` until these are accepted** | before planning |
| `07-tasks.md` | Implementation order in waves, definition of done, what must not move | when planning |
| `08-assets.md` + `assets/` | The wordmark, the app mark, the six objects, the display font files, the new glyphs, and the pipeline that regenerates them | before wave 1 |
| `prototypes/motion-story.html` | The eight-moment reference prototype (vanilla HTML/CSS/JS, RTL, reduced-motion aware) | as behaviour reference, never as code to paste |
| `prototypes/stories.html` | The stories viewer reference prototype | same |
| `HANDOFF-PROMPT.md` | The prompt to give the lead Claude Code session | when starting the session |

## How to install this folder

1. Copy `docs/design/` into the repo root (beside `docs/plan/`).
2. Add to `CLAUDE.md` (or the lead's system instructions), under the existing pointer to `docs/plan`:

   ```
   Visual direction lives in docs/design/. Read docs/design/README.md before any UI work.
   docs/design proposes DEC entries in 06-decisions-proposed.md; until they are in
   docs/plan/DECISIONS.md they are proposals, and DECISIONS.md wins.
   ```

3. Open the lead session with `HANDOFF-PROMPT.md`. It asks the lead to plan and to surface the DEC
   entries for your acceptance before writing code — keep that step; the agents obey `DECISIONS.md`,
   not this folder.

## How the prototypes are meant to be used

- They are **behaviour references**: read the CSS and JS to learn the sequence, the durations, the
  transform-only rule, the RTL choices (tap zones, progress fill origin, code boxes in `dir="ltr"`)
  and the reduced-motion fallbacks.
- They are **not** an implementation. The product is React 19 + Tailwind v4 + Radix + the house
  primitives; nothing in the prototypes is imported. A prototype class name never appears in `src/`.
- They are useful for **visual comparison**: `scripts/visual-diff.mjs` already drives Playwright.
  Screenshot a prototype at 390 px and the corresponding gallery entry at 390 px and look at them side
  by side. Pixel identity is not the bar; the same hierarchy, weight, spacing and motion is.

## For humans

The mood board (Design canvas) and the two prototypes are on claude.ai; export the canvas as PDF from
its Share › Export tab if you want a copy next to this folder (`docs/design/moodboard.pdf`). The
prototypes are already here as files.
