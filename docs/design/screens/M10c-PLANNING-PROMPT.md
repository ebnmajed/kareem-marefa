You are the **wave-20 planner** for كريم معرفة. You implement nothing in this session. Your output is
the brief the implementing lead reads first — **`docs/plan/notes/wave-20-lead.md`** — plus the
`DECISIONS.md` entries it needs and the new head of `STATUS.md`. Update `STATUS.md` before you end,
finished or not.

**State of `main`:** `c5a4cf9a` — wave 18 merged (PRs #38, #39 · `DEC-205`…`DEC-212`), wave 19
merged (PR #40 · `DEC-213`…`DEC-215`). Production is at migration **`0168`**; the next migration is
**`0169`**; the next decision is **`DEC-216`**. `src/components/ui/` has **63** `.tsx` files and the
gate's floor is **57** (`tests/unit/ui-playground.test.ts:119`). Verify all five numbers against the
tree before writing them down.

**What this wave claims — M10c, the last batch of the member app, under `DEC-215` §1's standing
order («WE BUILD WHAT HAS A DESIGN»).** Twelve artboards (`021` has a read-mode and an edit-mode board; `029` is new) for `SCR-021 · 022 ·
023 · 024 · 025 · 026 · 027 · 028 · 029`, phone at 390 and desktop at 1280 for the hub. Spec:
**`docs/design/screens/M10c.md`**; artboards: `docs/design/screens/m10c/*.dc.html` (self-contained
HTML, ignore the `support.js` line) with PNGs in `docs/design/screens/m10c/png/`.

**Read in this order.** This brief · `M10c.md` in full · the ten artboards · `notes/wave-19-lead.md`
and `DEC-213` §4–§5, `DEC-215` (the batch just before this one, and the rule in force) ·
`DEC-199` §2 as amended by **`DEC-208`** · `DEC-195` (the five moments) · `DEC-204` + `STATUS.md` H1
(the owed measurement) · `05-scoring-engine.md`, `08-notifications-calendar.md` §1.7,
`09-sitemap-screens.md` SCR-021…028 · `docs/design/04-components.md`, `06-decisions-proposed.md` ·
`messages/ar/{profile,scoring,certificates,calendar,notifications,leaderboards}.json` ·
`CLAUDE.md`, `TEAM.md` §1–§3.

## The rule — `DEC-199` §2 as amended by `DEC-208`

**A screen is REBUILT to its design, never restyled — its page file is DELETED first, then written
from its artboard.** Two commits per screen; each story lists what it kept and which `REQ-*` made it
keep it. Wave 19 found more silently dropped behaviours this way; expect the hub's pages, which were
«re-skinned onto the system» in M10, to hide several.

## Owner rulings this batch carries — not to be re-derived

1. **The weekly board is the headline window, there are no leagues**, and the category filter is a
   header menu, not a tab (`M10c.md` §10, `DEC-NEXT-19`).
2. **The hub has no game rail on desktop** (`DEC-NEXT-20`).
3. **Moments 3 (points count-up + flame) and 5 (level-up) render on the hub's standing card**;
   `DEC-213` §5.117 keeps the level-up off the profile. **No sixth moment** — the podium is static.
4. **State lives in the row; nothing is shown when nothing needs doing** (`DEC-NEXT-22`): the
   calendar page is one connection row plus failures only; certificates and bookmarks are plain
   lists; no glyph vocabulary anywhere.
5. **No explainer copy** (`DEC-NEXT-25`, `M10c.md` §0b): a line exists only if it changes what
   the person does next. Every ★ string the brief proposes is tested against that sentence. The M10a/M10b
   boards were trimmed on the same day, so `M10c.md` §0b's list is a story in **this** wave
   (`STORY-UIX-copy-trim`, one PR with the hub frame), not a later one.
6. **Read by default, edit on intent** (`DEC-NEXT-23`): `021` renders values with one «عدّل ملفك»;
   edit mode is a state entered by that button, with the unsaved count, changed-field marks, Save
   and Cancel; the saved mark and time show in read mode. `M10c.md` §1 has the three rules — apply
   them to every settings-like screen this wave touches, and list the ones it does not.

Anywhere else the artboards and `docs/plan/` disagree, list it the way `DEC-206` §4 and `DEC-213` §5
do — one line per deviation, which document wins, why.

## What you must settle in the brief

- **One PR or two.** Count against `TEAM.md`'s sizes. If two: **the hub frame + `021` + `022` +
  `023` + `024` + `025`**, then **`026` + `029` + `027` + `028`**. Carry wave 17b's lesson: retarget B to
  `main` before A merges with `--delete-branch`.
- **The four new primitives** (`podium`, `settings-group`, `ledger-row`): a story each, a
  gallery section each, the floor moved **57 → 60** in the same commit.
- **The ledger's data** (`022`): the reversal pair and the cap row need the ledger to expose
  `reverses_row_id` and the cap reason — say whether the DAL already returns them (`DEC-172`,
  `REQ-PTS-015`) or whether a view is needed. **No new table without a `REQ-*`** in `01-prd.md` and a
  migration story at `0169`.
- **`029` الإعدادات is a new route** (`/app/me/settings`, `DEC-NEXT-24`): it needs its `REQ-*` in
  `01-prd.md`, a `shell-routes.ts` entry, the gear link from `/app/me` and the inbox, and the
  **optional** notification categories only — which ones come from `08` §1.7's list, not the
  artboard; the non-optional ones are one sentence. The opt-out moves out of `021`'s form.
- **The weekly window**: whether a weekly snapshot exists or the board computes live from the
  ledger (`05`); if live, say so in the rules line's copy.
- **The owed measurement** (`DEC-204`, `STATUS.md` H1): the hard-load duplicate **re-measured on
  `/app/me/points` and `/app/leaderboards`** after the rebuild, accessibility tree included,
  **recorded** against `DEC-204`'s table. Not fixed here; not allowed to vanish into a rewrite.
- **Stories per screen** with `REQ-*` ids, the artboard, the undrawn states from the spec, and the
  definition of done: matches the artboard at 390 and 1280 in a capture, `ui-lint --strict`, the
  scope tests, `qa:contract` untouched, `REQ-UIX-053`'s test untouched.
- **What is out:** `/app/me/privacy` (M13), every console and studio route, the five public routes,
  stories (which come next, when this batch merges, unless the owner says otherwise — write that
  sentence into `STATUS.md`'s head).

## What the brief must not do

Re-litigate a `DEC` (`DEC-124` numerals; `DEC-186` §4's `1.08`, still the owner's; `DEC-206` §4.56
«a member never sees who else attends» — the boards show ranked members by design, which is not
attendance; `DEC-099` on avatars). Touch the public routes. Write «restyle». Let a `.dc.html` class
into `src/`. Put a ★ string into `en/` first. Leave a `<bdi>` off a serial, a name or an amount.

## Deliverables

1. `docs/plan/notes/wave-20-lead.md` in the register of `wave-19-lead.md`.
2. The `DECISIONS.md` entries, appended from `DEC-216`: the three rulings, the deviation list.
3. `STATUS.md`'s head for wave 20, including the sentence about what comes after.
